import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Mutex } from 'async-mutex';
import { z } from 'zod';
import {
  activateKnowledgeBranchRow,
  createKnowledgeDbSnapshot,
  deleteKnowledgeBranchRow,
  deleteKnowledgeVersionRow,
  getKnowledgeBranchRow,
  getKnowledgeBranchRowByName,
  getKnowledgeDataStats,
  getKnowledgeVersionRow,
  insertKnowledgeBranchRow,
  insertKnowledgeVersionRow,
  listAllKnowledgeVersionRows,
  listKnowledgeBranchRows,
  listKnowledgeVersionRows,
  loadAllFiles,
  renameKnowledgeBranchRow,
  renameKnowledgeVersionRow,
  restoreKnowledgeDbSnapshot,
  runInTransaction,
  setKnowledgeBranchHeadRow,
  type KnowledgeBranchRow,
  type KnowledgeDataStats,
  type KnowledgeVersionRow,
} from '../db/database.js';
import { paths, protectPrivateFile } from '../utils/paths.js';
import { assertPathInsideDirectory } from '../utils/security.js';

const MAIN_BRANCH_ID = 'main';
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const SNAPSHOT_SCHEMA_VERSION = 1;
const operationMutex = new Mutex();

const knowledgeStatsSchema = z.object({
  cards: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  relations: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  progressDays: z.number().int().nonnegative(),
});

const snapshotManifestSchema = z.object({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  versionId: z.string().uuid(),
  createdAt: z.number().nonnegative(),
  database: z.object({
    relativePath: z.literal('knowledge.db'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
  }),
  files: z.array(z.object({
    recordId: z.string().min(1),
    relativePath: z.string().min(1),
    blobHash: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
  })),
  stats: knowledgeStatsSchema,
});

type SnapshotManifest = z.infer<typeof snapshotManifestSchema>;

export interface KnowledgeVersionStats extends KnowledgeDataStats {
  sizeBytes: number;
}

export interface KnowledgeBranch {
  id: string;
  name: string;
  headVersionId: string | null;
  isActive: boolean;
  isProtected: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeVersion {
  id: string;
  branchId: string;
  name: string;
  description: string;
  kind: 'manual' | 'safety';
  isHead: boolean;
  stats: KnowledgeVersionStats;
  createdAt: number;
}

export interface CreateKnowledgeVersionInput {
  name: string;
  description?: string;
}

export interface RenameKnowledgeVersionInput {
  name: string;
  description?: string;
}

export interface KnowledgeVersionState {
  branches: KnowledgeBranch[];
  activeBranch: KnowledgeBranch;
  versions: KnowledgeVersion[];
}

// 为版本控制 API 表达可预期业务错误，输入状态码、错误码与消息，无额外行为。
// 原因：路由需要稳定区分 404、409 和 422，不能依赖字符串匹配普通 Error。
// 未为每种错误创建子类：单一错误结构足以覆盖本地版本控制的有限失败类型。
export class KnowledgeVersionError extends Error {
  readonly statusCode: 404 | 409 | 422;
  readonly code: string;

  constructor(statusCode: 404 | 409 | 422, code: string, message: string) {
    super(message);
    this.name = 'KnowledgeVersionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// 校验并规范用户名称，输入未知字符串，输出去除首尾空格后的名称。
// 原因：分支和版本共享 1–80 字符规则，集中处理可保持 API 行为一致。
// 未把名称用于文件路径：所有存储目录都只使用服务生成的 UUID。
function normalizeName(name: string, label: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > MAX_NAME_LENGTH) {
    throw new KnowledgeVersionError(
      422,
      'INVALID_NAME',
      `${label} must contain between 1 and ${MAX_NAME_LENGTH} characters`,
    );
  }
  return normalized;
}

// 校验并规范版本描述，输入可选字符串，输出稳定字符串。
// 原因：数据库使用非空列，API 允许省略描述。
// 未静默截断：截断会让用户误以为完整说明已保存。
function normalizeDescription(description?: string): string {
  const normalized = description?.trim() ?? '';
  if (normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new KnowledgeVersionError(
      422,
      'INVALID_DESCRIPTION',
      `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }
  return normalized;
}

// 计算文件 SHA-256，输入绝对文件路径，输出小写十六进制摘要。
// 原因：摘要同时用于快照完整性校验和文件 blob 去重。
// 未使用文件名或修改时间：它们不能证明内容相同，也不能发现静默损坏。
function hashFile(filePath: string): string {
  const hash = createHash('sha256');
  const content = fs.readFileSync(filePath);
  hash.update(content);
  return hash.digest('hex');
}

// 把任意版本存储子路径限制在版本根目录内，输入候选路径，输出已验证绝对路径。
// 原因：manifest_path 来自持久化元数据，恢复和删除前仍需抵御路径篡改。
// 未仅检查字符串前缀：相邻目录名和 Windows 大小写规则会让前缀判断失效。
function assertVersionStorePath(candidatePath: string): string {
  return assertPathInsideDirectory(candidatePath, paths.versionStoreDir, '版本存储路径越界');
}

// 返回快照与 blob 目录，输入可选创建开关，输出经过边界验证的路径。
// 原因：所有调用方必须共享同一目录布局，垃圾回收才能正确扫描。
// 未暴露用户可配置路径：固定在私有数据目录可避免跨盘原子交换和权限问题。
function getStorePaths(create: boolean = true): {
  snapshotsDir: string;
  blobsDir: string;
  stagingDir: string;
} {
  const snapshotsDir = assertVersionStorePath(path.join(paths.versionStoreDir, 'snapshots'));
  const blobsDir = assertVersionStorePath(path.join(paths.versionStoreDir, 'blobs'));
  const stagingDir = assertVersionStorePath(path.join(paths.versionStoreDir, 'staging'));
  if (create) {
    fs.mkdirSync(snapshotsDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(blobsDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  }
  return { snapshotsDir, blobsDir, stagingDir };
}

// 将数据库行转换为公开分支类型，输入持久化行，输出 camelCase API 对象。
// 原因：数据库命名与前端契约分离，后续迁移不会泄漏 SQLite 细节。
// 未直接返回行对象：数字布尔值和 snake_case 会增加前端分支判断。
function toBranch(row: KnowledgeBranchRow): KnowledgeBranch {
  return {
    id: row.id,
    name: row.name,
    headVersionId: row.head_version_id,
    isActive: row.is_active === 1,
    isProtected: row.id === MAIN_BRANCH_ID,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 安全解析版本统计，输入数据库 JSON，输出经过 Zod 验证的计数。
// 原因：历史数据库可能被手工修改，API 不应把不可信 JSON 直接传给前端。
// 未以空值掩盖损坏：损坏元数据会阻止危险操作并明确报告 422。
function parseStats(statsJson: string): KnowledgeDataStats {
  try {
    const parsed: unknown = JSON.parse(statsJson);
    return knowledgeStatsSchema.parse(parsed);
  } catch {
    throw new KnowledgeVersionError(422, 'CORRUPTED_VERSION', 'Version statistics are corrupted');
  }
}

// 将数据库版本行转换为公开类型，输入版本与分支头 ID，输出 API 对象。
// 原因：列表需要标记不可删除的当前头版本并附带逻辑占用空间。
// 未从 manifest 重算统计：列表热路径只读取已验证的轻量元数据。
function toVersion(row: KnowledgeVersionRow, headVersionId: string | null): KnowledgeVersion {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    isHead: row.id === headVersionId,
    stats: {
      ...parseStats(row.stats_json),
      sizeBytes: row.size_bytes,
    },
    createdAt: row.created_at,
  };
}

// 读取并校验 manifest，输入版本行，输出结构化快照描述。
// 原因：恢复、克隆和垃圾回收都必须先证明路径与 JSON 结构可信。
// 未信任数据库中的 manifest_path：数据库文件可能被外部工具修改。
function readManifest(row: KnowledgeVersionRow): SnapshotManifest {
  const manifestPath = assertVersionStorePath(path.resolve(row.manifest_path));
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifest = snapshotManifestSchema.parse(raw);
    if (manifest.versionId !== row.id) {
      throw new Error('Version ID mismatch');
    }
    return manifest;
  } catch (error) {
    throw new KnowledgeVersionError(
      422,
      'CORRUPTED_VERSION',
      `Version manifest is unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// 校验快照数据库与所有 blob 摘要，输入版本行和 manifest，无返回值。
// 原因：只有完整通过校验的快照才可覆盖当前知识库。
// 未仅检查文件存在：存在但损坏的内容同样会造成不可逆的错误恢复。
function verifySnapshot(row: KnowledgeVersionRow, manifest: SnapshotManifest): void {
  const manifestPath = assertVersionStorePath(path.resolve(row.manifest_path));
  const snapshotDir = assertVersionStorePath(path.dirname(manifestPath));
  const databasePath = assertVersionStorePath(path.join(snapshotDir, manifest.database.relativePath));
  if (!fs.existsSync(databasePath) || hashFile(databasePath) !== manifest.database.sha256) {
    throw new KnowledgeVersionError(422, 'CORRUPTED_VERSION', 'Version database digest mismatch');
  }

  const { blobsDir } = getStorePaths();
  for (const file of manifest.files) {
    const blobPath = assertVersionStorePath(path.join(blobsDir, file.blobHash));
    if (!fs.existsSync(blobPath) || hashFile(blobPath) !== file.blobHash) {
      throw new KnowledgeVersionError(
        422,
        'CORRUPTED_VERSION',
        `Version file blob is missing or corrupted: ${file.relativePath}`,
      );
    }
  }
}

// 创建不可变快照文件，输入版本 ID，输出 manifest 路径、统计和逻辑大小。
// 原因：SQLite 一致快照与内容寻址文件共同覆盖完整知识库，同时避免重复存储相同附件。
// 未把整个 dataDir 打包：那会泄漏明确排除的 API Key、聊天和界面配置。
function createSnapshotArtifacts(versionId: string): {
  manifestPath: string;
  stats: KnowledgeDataStats;
  sizeBytes: number;
} {
  const { snapshotsDir, blobsDir } = getStorePaths();
  const snapshotDir = assertVersionStorePath(path.join(snapshotsDir, versionId));
  if (fs.existsSync(snapshotDir)) {
    throw new Error(`Snapshot directory already exists: ${versionId}`);
  }
  fs.mkdirSync(snapshotDir, { recursive: false, mode: 0o700 });

  try {
    const databasePath = assertVersionStorePath(path.join(snapshotDir, 'knowledge.db'));
    createKnowledgeDbSnapshot(databasePath);
    const databaseSize = fs.statSync(databasePath).size;
    const files = loadAllFiles();
    const manifestFiles: SnapshotManifest['files'] = [];
    let logicalFileSize = 0;

    for (const file of files) {
      if (file.is_folder === 1 || file.file_storage_path === null) {
        continue;
      }
      const sourcePath = assertPathInsideDirectory(
        file.file_storage_path,
        paths.vaultDir,
        '文件库记录指向了数据目录之外',
      );
      if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new KnowledgeVersionError(
          422,
          'MISSING_LIBRARY_FILE',
          `File library content is missing: ${file.name}`,
        );
      }
      const blobHash = hashFile(sourcePath);
      const blobPath = assertVersionStorePath(path.join(blobsDir, blobHash));
      if (!fs.existsSync(blobPath)) {
        fs.copyFileSync(sourcePath, blobPath, fs.constants.COPYFILE_EXCL);
        protectPrivateFile(blobPath);
      }
      const sizeBytes = fs.statSync(sourcePath).size;
      logicalFileSize += sizeBytes;
      manifestFiles.push({
        recordId: file.id,
        relativePath: path.basename(sourcePath),
        blobHash,
        sizeBytes,
      });
    }

    const stats = knowledgeStatsSchema.parse(getKnowledgeDataStats());
    const manifest: SnapshotManifest = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      versionId,
      createdAt: Date.now() / 1000,
      database: {
        relativePath: 'knowledge.db',
        sha256: hashFile(databasePath),
        sizeBytes: databaseSize,
      },
      files: manifestFiles,
      stats,
    };
    const manifestPath = assertVersionStorePath(path.join(snapshotDir, 'manifest.json'));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
    protectPrivateFile(manifestPath);
    return {
      manifestPath,
      stats,
      sizeBytes: databaseSize + logicalFileSize,
    };
  } catch (error) {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    throw error;
  }
}

// 克隆版本快照元数据，输入源版本和新版本 ID，输出新快照信息。
// 原因：新分支必须拥有可独立删除的 manifest/数据库，但可共享内容寻址 blob。
// 未直接复用源 manifest 路径：删除源分支时会让新分支指向不存在的目录。
function cloneSnapshotArtifacts(
  source: KnowledgeVersionRow,
  newVersionId: string,
): { manifestPath: string; stats: KnowledgeDataStats; sizeBytes: number } {
  const sourceManifest = readManifest(source);
  verifySnapshot(source, sourceManifest);
  const { snapshotsDir } = getStorePaths();
  const sourceManifestPath = assertVersionStorePath(path.resolve(source.manifest_path));
  const sourceDatabasePath = assertVersionStorePath(path.join(path.dirname(sourceManifestPath), 'knowledge.db'));
  const targetDir = assertVersionStorePath(path.join(snapshotsDir, newVersionId));
  fs.mkdirSync(targetDir, { recursive: false, mode: 0o700 });
  try {
    const targetDatabasePath = assertVersionStorePath(path.join(targetDir, 'knowledge.db'));
    fs.copyFileSync(sourceDatabasePath, targetDatabasePath, fs.constants.COPYFILE_EXCL);
    protectPrivateFile(targetDatabasePath);
    const manifest: SnapshotManifest = {
      ...sourceManifest,
      versionId: newVersionId,
      createdAt: Date.now() / 1000,
    };
    const manifestPath = assertVersionStorePath(path.join(targetDir, 'manifest.json'));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
    protectPrivateFile(manifestPath);
    return {
      manifestPath,
      stats: manifest.stats,
      sizeBytes: source.size_bytes,
    };
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}

// 创建版本记录并推进分支头，输入分支、名称、描述和类型，输出公开版本。
// 原因：快照落盘后在单个 SQLite 事务内发布元数据，避免半成品出现在历史列表。
// 未先写数据库占位行：文件创建失败时无需修复可见历史。
function createVersionInternal(
  branch: KnowledgeBranchRow,
  name: string,
  description: string,
  kind: 'manual' | 'safety',
): KnowledgeVersion {
  const versionId = randomUUID();
  const artifacts = createSnapshotArtifacts(versionId);
  const createdAt = Date.now() / 1000;
  const row: KnowledgeVersionRow = {
    id: versionId,
    branch_id: branch.id,
    name,
    description,
    kind,
    manifest_path: artifacts.manifestPath,
    stats_json: JSON.stringify(artifacts.stats),
    size_bytes: artifacts.sizeBytes,
    created_at: createdAt,
  };

  try {
    runInTransaction(() => {
      insertKnowledgeVersionRow(row);
      setKnowledgeBranchHeadRow(branch.id, versionId, createdAt);
    });
  } catch (error) {
    fs.rmSync(path.dirname(artifacts.manifestPath), { recursive: true, force: true });
    throw error;
  }
  return toVersion(row, versionId);
}

// 为高风险操作创建带时间的安全版本，输入当前分支，输出安全版本。
// 原因：切换或恢复失败后用户仍有明确可见的回退点。
// 未尝试检测“脏状态”：当前数据层没有全局变更序号，强制快照更可靠。
function createSafetyVersionInternal(branch: KnowledgeBranchRow): KnowledgeVersion {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return createVersionInternal(branch, `Safety snapshot ${timestamp}`, '', 'safety');
}

// 把版本文件恢复到当前知识库，输入版本行，无返回值。
// 原因：先完整校验并在 staging 准备文件，再交换 vault 和事务恢复数据库，可把失败窗口压到最小。
// 未直接清空 vault 后逐文件复制：中途失败会留下数据库和文件库不一致。
function restoreVersionArtifacts(row: KnowledgeVersionRow): void {
  const manifest = readManifest(row);
  verifySnapshot(row, manifest);
  const { blobsDir, stagingDir } = getStorePaths();
  const operationId = randomUUID();
  const stagedVault = assertVersionStorePath(path.join(stagingDir, `vault-${operationId}`));
  fs.mkdirSync(stagedVault, { recursive: false, mode: 0o700 });

  try {
    for (const file of manifest.files) {
      const blobPath = assertVersionStorePath(path.join(blobsDir, file.blobHash));
      const targetPath = assertPathInsideDirectory(
        path.join(stagedVault, path.basename(file.relativePath)),
        stagedVault,
        '快照文件路径越界',
      );
      fs.copyFileSync(blobPath, targetPath, fs.constants.COPYFILE_EXCL);
      protectPrivateFile(targetPath);
    }

    const currentVault = paths.vaultDir;
    const backupVault = assertVersionStorePath(path.join(stagingDir, `previous-vault-${operationId}`));
    let previousVaultMoved = false;
    if (fs.existsSync(currentVault)) {
      fs.renameSync(currentVault, backupVault);
      previousVaultMoved = true;
    }

    let restoreCompleted = false;
    try {
      fs.renameSync(stagedVault, currentVault);
      const manifestPath = assertVersionStorePath(path.resolve(row.manifest_path));
      const databasePath = assertVersionStorePath(path.join(path.dirname(manifestPath), 'knowledge.db'));
      restoreKnowledgeDbSnapshot(databasePath, currentVault);
      restoreCompleted = true;
    } catch (error) {
      if (fs.existsSync(currentVault)) {
        fs.rmSync(currentVault, { recursive: true, force: true });
      }
      if (previousVaultMoved && fs.existsSync(backupVault)) {
        fs.renameSync(backupVault, currentVault);
      }
      throw error;
    }
    if (restoreCompleted && previousVaultMoved) {
      try {
        fs.rmSync(backupVault, { recursive: true, force: true });
      } catch {
        // 恢复已提交后，旧 vault 清理失败只会遗留可回收副本，不能反向破坏已一致的新数据库和文件库。
        // 未在此回滚：数据库事务已经成功，回滚文件会制造比临时目录残留更严重的跨资源不一致。
      }
    }
  } finally {
    if (fs.existsSync(stagedVault)) {
      fs.rmSync(stagedVault, { recursive: true, force: true });
    }
  }
}

// 删除已无引用的 blob，输入为空，无返回值。
// 原因：版本或分支删除后回收空间，同时扫描全部 manifest 保护跨分支共享内容。
// 未在 manifest 损坏时猜测引用：任一读取失败都会中止 GC，以数据安全优先。
function garbageCollectBlobs(): void {
  const rows = listAllKnowledgeVersionRows();
  const referenced = new Set<string>();
  try {
    for (const row of rows) {
      const manifest = readManifest(row);
      for (const file of manifest.files) {
        referenced.add(file.blobHash);
      }
    }
  } catch {
    return;
  }

  const { blobsDir } = getStorePaths(false);
  if (!fs.existsSync(blobsDir)) {
    return;
  }
  for (const entry of fs.readdirSync(blobsDir, { withFileTypes: true })) {
    if (entry.isFile() && /^[a-f0-9]{64}$/.test(entry.name) && !referenced.has(entry.name)) {
      fs.rmSync(assertVersionStorePath(path.join(blobsDir, entry.name)), { force: true });
    }
  }
}

// 读取设置页需要的完整状态，输入为空，输出分支、当前分支和当前历史。
// 原因：单响应避免分支与版本在两个请求间发生不一致。
// 未缓存服务状态：SQLite 是权威来源，桌面数据量下读取成本可忽略。
export async function getKnowledgeVersionState(): Promise<KnowledgeVersionState> {
  return operationMutex.runExclusive(() => {
    const branchRows = listKnowledgeBranchRows();
    const activeRow = branchRows.find((branch) => branch.is_active === 1) ?? branchRows[0];
    if (!activeRow) {
      throw new Error('Default knowledge branch is missing');
    }
    return {
      branches: branchRows.map(toBranch),
      activeBranch: toBranch(activeRow),
      versions: listKnowledgeVersionRows(activeRow.id).map((row) =>
        toVersion(row, activeRow.head_version_id)
      ),
    };
  });
}

// 创建手动版本，输入名称和描述，输出新版本。
// 原因：所有公开写操作串行化，防止并发快照交叉修改分支头。
// 未接受 branchId：手动版本只能归属当前活动分支，减少误写。
export async function createKnowledgeVersion(
  input: CreateKnowledgeVersionInput,
): Promise<KnowledgeVersion> {
  return operationMutex.runExclusive(() => {
    const active = listKnowledgeBranchRows().find((branch) => branch.is_active === 1);
    if (!active) {
      throw new Error('Active knowledge branch is missing');
    }
    return createVersionInternal(
      active,
      normalizeName(input.name, 'Version name'),
      normalizeDescription(input.description),
      'manual',
    );
  });
}

// 更新版本显示名称与描述，输入版本 ID 和新值，输出更新后的版本。
// 原因：快照内容保持不可变，只允许轻量元数据编辑。
// 未限制安全版本重命名：用户可能需要为自动保护点补充可读说明。
export async function renameKnowledgeVersion(
  versionId: string,
  input: RenameKnowledgeVersionInput,
): Promise<KnowledgeVersion> {
  return operationMutex.runExclusive(() => {
    const row = getKnowledgeVersionRow(versionId);
    if (!row) {
      throw new KnowledgeVersionError(404, 'VERSION_NOT_FOUND', 'Version not found');
    }
    const name = normalizeName(input.name, 'Version name');
    const description = normalizeDescription(input.description);
    renameKnowledgeVersionRow(versionId, name, description);
    const branch = getKnowledgeBranchRow(row.branch_id);
    if (!branch) {
      throw new KnowledgeVersionError(422, 'CORRUPTED_VERSION', 'Version branch is missing');
    }
    return toVersion({ ...row, name, description }, branch.head_version_id);
  });
}

// 删除非头版本，输入版本 ID，无返回值。
// 原因：分支头是切换与恢复的工作基线，删除会让分支失去可用状态。
// 未允许强制删除：用户可先恢复其他版本，让目标不再成为头。
export async function deleteKnowledgeVersion(versionId: string): Promise<void> {
  await operationMutex.runExclusive(() => {
    const row = getKnowledgeVersionRow(versionId);
    if (!row) {
      throw new KnowledgeVersionError(404, 'VERSION_NOT_FOUND', 'Version not found');
    }
    const branch = getKnowledgeBranchRow(row.branch_id);
    if (!branch) {
      throw new KnowledgeVersionError(422, 'CORRUPTED_VERSION', 'Version branch is missing');
    }
    if (branch.head_version_id === row.id) {
      throw new KnowledgeVersionError(409, 'HEAD_VERSION_PROTECTED', 'Current branch version cannot be deleted');
    }
    deleteKnowledgeVersionRow(versionId);
    const snapshotDir = assertVersionStorePath(path.dirname(path.resolve(row.manifest_path)));
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    garbageCollectBlobs();
  });
}

// 从当前分支旧版本恢复知识库，输入版本 ID，输出刷新后的状态。
// 原因：恢复前创建安全快照，再以目标版本作为分支头，保留可逆路径。
// 未允许跨分支直接恢复：跨分支历史应通过旁开分支与切换表达，避免归属混乱。
export async function restoreKnowledgeVersion(versionId: string): Promise<KnowledgeVersionState> {
  return operationMutex.runExclusive(() => {
    const row = getKnowledgeVersionRow(versionId);
    if (!row) {
      throw new KnowledgeVersionError(404, 'VERSION_NOT_FOUND', 'Version not found');
    }
    const active = listKnowledgeBranchRows().find((branch) => branch.is_active === 1);
    if (!active) {
      throw new Error('Active knowledge branch is missing');
    }
    if (row.branch_id !== active.id) {
      throw new KnowledgeVersionError(
        409,
        'CROSS_BRANCH_RESTORE',
        'Create or switch to a branch before restoring a version from another branch',
      );
    }
    const manifest = readManifest(row);
    verifySnapshot(row, manifest);
    createSafetyVersionInternal(active);
    restoreVersionArtifacts(row);
    setKnowledgeBranchHeadRow(active.id, row.id, Date.now() / 1000);
    const refreshed = getKnowledgeBranchRow(active.id);
    if (!refreshed) {
      throw new Error('Active knowledge branch disappeared after restore');
    }
    return {
      branches: listKnowledgeBranchRows().map(toBranch),
      activeBranch: toBranch(refreshed),
      versions: listKnowledgeVersionRows(refreshed.id).map((version) =>
        toVersion(version, refreshed.head_version_id)
      ),
    };
  });
}

// 从版本旁开新分支并立即切换，输入源版本与分支名，输出新状态。
// 原因：新分支复制独立快照元数据并共享 blob，删除任一分支不会破坏另一分支。
// 未让新分支直接引用源 manifest：源分支删除会留下悬空路径。
export async function createKnowledgeBranchFromVersion(
  versionId: string,
  requestedName: string,
): Promise<KnowledgeVersionState> {
  return operationMutex.runExclusive(() => {
    const source = getKnowledgeVersionRow(versionId);
    if (!source) {
      throw new KnowledgeVersionError(404, 'VERSION_NOT_FOUND', 'Version not found');
    }
    const name = normalizeName(requestedName, 'Branch name');
    if (getKnowledgeBranchRowByName(name)) {
      throw new KnowledgeVersionError(409, 'BRANCH_NAME_CONFLICT', 'Branch name already exists');
    }
    const active = listKnowledgeBranchRows().find((branch) => branch.is_active === 1);
    if (!active) {
      throw new Error('Active knowledge branch is missing');
    }
    readManifest(source);
    createSafetyVersionInternal(active);

    const branchId = randomUUID();
    const baseVersionId = randomUUID();
    const artifacts = cloneSnapshotArtifacts(source, baseVersionId);
    const createdAt = Date.now() / 1000;
    const branchRow: KnowledgeBranchRow = {
      id: branchId,
      name,
      head_version_id: baseVersionId,
      is_active: 0,
      created_at: createdAt,
      updated_at: createdAt,
    };
    const baseVersionRow: KnowledgeVersionRow = {
      id: baseVersionId,
      branch_id: branchId,
      name: source.name,
      description: source.description,
      kind: source.kind,
      manifest_path: artifacts.manifestPath,
      stats_json: JSON.stringify(artifacts.stats),
      size_bytes: artifacts.sizeBytes,
      created_at: createdAt,
    };

    try {
      runInTransaction(() => {
        insertKnowledgeBranchRow(branchRow);
        insertKnowledgeVersionRow(baseVersionRow);
      });
      restoreVersionArtifacts(baseVersionRow);
      activateKnowledgeBranchRow(branchId, Date.now() / 1000);
    } catch (error) {
      const persistedBranch = getKnowledgeBranchRow(branchId);
      if (persistedBranch) {
        deleteKnowledgeBranchRow(branchId);
      }
      fs.rmSync(path.dirname(artifacts.manifestPath), { recursive: true, force: true });
      throw error;
    }
    const activeBranch = getKnowledgeBranchRow(branchId);
    if (!activeBranch) {
      throw new Error('Created branch is missing');
    }
    return {
      branches: listKnowledgeBranchRows().map(toBranch),
      activeBranch: toBranch(activeBranch),
      versions: listKnowledgeVersionRows(branchId).map((version) =>
        toVersion(version, activeBranch.head_version_id)
      ),
    };
  });
}

// 切换到已有分支，输入目标分支 ID，输出新状态。
// 原因：当前工作状态先安全快照，目标头快照恢复成功后才更新活动标记。
// 未在目标无版本时切换：空分支没有可恢复的知识库基线。
export async function switchKnowledgeBranch(branchId: string): Promise<KnowledgeVersionState> {
  return operationMutex.runExclusive(() => {
    const target = getKnowledgeBranchRow(branchId);
    if (!target) {
      throw new KnowledgeVersionError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
    }
    if (target.is_active === 1) {
      const versions = listKnowledgeVersionRows(target.id).map((version) =>
        toVersion(version, target.head_version_id)
      );
      return {
        branches: listKnowledgeBranchRows().map(toBranch),
        activeBranch: toBranch(target),
        versions,
      };
    }
    if (!target.head_version_id) {
      throw new KnowledgeVersionError(409, 'EMPTY_BRANCH', 'Target branch has no version to restore');
    }
    const targetVersion = getKnowledgeVersionRow(target.head_version_id);
    if (!targetVersion) {
      throw new KnowledgeVersionError(422, 'CORRUPTED_BRANCH', 'Target branch head is missing');
    }
    const active = listKnowledgeBranchRows().find((branch) => branch.is_active === 1);
    if (!active) {
      throw new Error('Active knowledge branch is missing');
    }
    const manifest = readManifest(targetVersion);
    verifySnapshot(targetVersion, manifest);
    createSafetyVersionInternal(active);
    restoreVersionArtifacts(targetVersion);
    activateKnowledgeBranchRow(target.id, Date.now() / 1000);
    const refreshed = getKnowledgeBranchRow(target.id);
    if (!refreshed) {
      throw new Error('Target branch disappeared after switch');
    }
    return {
      branches: listKnowledgeBranchRows().map(toBranch),
      activeBranch: toBranch(refreshed),
      versions: listKnowledgeVersionRows(refreshed.id).map((version) =>
        toVersion(version, refreshed.head_version_id)
      ),
    };
  });
}

// 重命名非 main 分支，输入分支 ID 与名称，输出更新分支。
// 原因：main 作为永久默认恢复锚点保持稳定，其余分支可自由整理。
// 未允许只改变大小写绕过冲突：名称比较使用 SQLite NOCASE。
export async function renameKnowledgeBranch(
  branchId: string,
  requestedName: string,
): Promise<KnowledgeBranch> {
  return operationMutex.runExclusive(() => {
    const branch = getKnowledgeBranchRow(branchId);
    if (!branch) {
      throw new KnowledgeVersionError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
    }
    if (branch.id === MAIN_BRANCH_ID) {
      throw new KnowledgeVersionError(409, 'PROTECTED_BRANCH', 'The main branch cannot be renamed');
    }
    const name = normalizeName(requestedName, 'Branch name');
    const conflict = getKnowledgeBranchRowByName(name);
    if (conflict && conflict.id !== branch.id) {
      throw new KnowledgeVersionError(409, 'BRANCH_NAME_CONFLICT', 'Branch name already exists');
    }
    const updatedAt = Date.now() / 1000;
    renameKnowledgeBranchRow(branch.id, name, updatedAt);
    return toBranch({ ...branch, name, updated_at: updatedAt });
  });
}

// 删除非活动、非 main 分支及其独有版本，输入分支 ID，无返回值。
// 原因：每个分支拥有独立 snapshot 目录，删除后再全局扫描 blob 可安全保留共享内容。
// 未允许删除当前分支：必须先切换，确保正在使用的数据始终有分支归属。
export async function deleteKnowledgeBranch(branchId: string): Promise<void> {
  await operationMutex.runExclusive(() => {
    const branch = getKnowledgeBranchRow(branchId);
    if (!branch) {
      throw new KnowledgeVersionError(404, 'BRANCH_NOT_FOUND', 'Branch not found');
    }
    if (branch.id === MAIN_BRANCH_ID) {
      throw new KnowledgeVersionError(409, 'PROTECTED_BRANCH', 'The main branch cannot be deleted');
    }
    if (branch.is_active === 1) {
      throw new KnowledgeVersionError(409, 'ACTIVE_BRANCH', 'The active branch cannot be deleted');
    }
    const versions = listKnowledgeVersionRows(branch.id);
    deleteKnowledgeBranchRow(branch.id);
    for (const version of versions) {
      const snapshotDir = assertVersionStorePath(path.dirname(path.resolve(version.manifest_path)));
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
    garbageCollectBlobs();
  });
}
