export const BACKEND_URL = 'http://127.0.0.1:8000';
export const BASE = window.location.protocol === 'file:'
  ? `${BACKEND_URL}/api`
  : '/api';

export function getFileUrl(fileId: string, action: 'preview' | 'download'): string {
  const base = `${BASE}/files/${fileId}/${action}`;
  if (cachedToken) {
    return `${base}?access_token=${encodeURIComponent(cachedToken)}`;
  }
  return base;
}

export function getThumbnailUrl(fileId: string): string {
  const base = `${BASE}/files/${fileId}/thumbnail`;
  if (cachedToken) {
    return `${base}?access_token=${encodeURIComponent(cachedToken)}`;
  }
  return base;
}

export let cachedToken: string | null | undefined;

export function clearAuthTokenCache(): void {
  cachedToken = undefined;
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken;
  }
  try {
    const api = (window as unknown as { electronAPI?: { getAuthToken?: () => Promise<string | null> } }).electronAPI;
    if (api?.getAuthToken) {
      const token = await api.getAuthToken();
      if (token) {
        cachedToken = token;
        return token;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

type ApiErrorBody = {
  detail?: string;
  error?: string;
  errorId?: string;
};

// 判断未知值是否是可读取属性的普通对象，输入为任意 JSON 解析结果，输出为类型收窄后的记录对象。
// 原因：API 错误体来自运行时响应，必须先用类型守卫收窄，才能在 strict TypeScript 下安全读取字段。
// 未使用类型断言直接读取：直接断言会绕过运行时校验，遇到 HTML、数组或 null 时仍可能隐藏真实错误。
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 从未知 JSON 错误体中提取前端需要展示的字符串字段，输入为解析结果，输出为稳定的错误对象。
// 原因：后端错误响应只需要 detail/error/errorId 三个字段，集中收窄能保持请求主流程简洁。
// 未使用 Zod：这里是极小的响应错误体读取，手写守卫足够且避免为热路径增加额外依赖和 schema 噪音。
function normalizeErrorBody(body: unknown): ApiErrorBody {
  if (!isRecord(body)) {
    return {};
  }

  return {
    detail: typeof body.detail === 'string' ? body.detail : undefined,
    error: typeof body.error === 'string' ? body.error : undefined,
    errorId: typeof body.errorId === 'string' ? body.errorId : undefined,
  };
}

// 安全解析 API JSON 响应，输入为 fetch Response，输出为调用方声明的响应类型。
// 原因：开发代理异常时可能返回前端 HTML，先检查文本和 Content-Type 可避免控制台出现 JSON SyntaxError 刷屏。
// 未使用 response.json()：它会在非 JSON 响应上直接抛底层解析错误，无法给用户明确的后端/代理异常提示。
async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmedText = text.trimStart();
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  const looksLikeJson = trimmedText.startsWith('{') || trimmedText.startsWith('[');

  if (trimmedText.length === 0) {
    // 这里需要把空响应映射到泛型返回值；调用方的具体接口类型只能在 API 边界外由后端契约保证。
    return {} as T;
  }

  if (!contentType.includes('json') && !looksLikeJson) {
    throw new Error('服务器返回了非 JSON 响应，请确认后端服务/代理是否正常');
  }

  try {
    // JSON.parse 的标准库返回 any；先接入 unknown，再在 API 泛型边界转换为调用方声明的响应类型。
    const parsed: unknown = JSON.parse(text);
    return parsed as T;
  } catch {
    throw new Error('服务器返回了无法解析的 JSON 响应，请稍后重试');
  }
}

// 基于已收窄的错误体生成展示文本，输入为错误体和 HTTP fallback，输出为最终错误消息。
// 原因：401 重试前后都需要同一套错误拼接规则，集中处理可保持原行为并减少重复。
// 未内联到 request：内联会重复 detail/error/errorId 处理，后续修改错误格式时更容易遗漏分支。
function buildErrorMessage(body: unknown, fallback: string): string {
  const normalizedBody = normalizeErrorBody(body);
  const baseMessage = normalizedBody.detail ?? normalizedBody.error ?? fallback;
  return normalizedBody.errorId ? `${baseMessage} [errorId: ${normalizedBody.errorId}]` : baseMessage;
}

// 尝试解析错误响应体，输入为 fetch Response，输出为 JSON 错误体或解析失败信息。
// 原因：非 2xx 响应也可能是开发服务器返回的 HTML，保留解析失败消息比只显示状态码更有排查价值。
// 未让调用方直接 catch：集中处理可保持 401 重试前后的错误信息策略一致。
async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    return await parseJsonResponse<unknown>(res);
  } catch (error) {
    return { error: error instanceof Error ? error.message : res.statusText };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const electronAPI = (window as unknown as {
      electronAPI?: {
        apiFetch?: (payload: {
          path: string;
          method?: string;
          body?: unknown;
          headers?: Record<string, string>;
        }) => Promise<{ ok: boolean; status: number; statusText: string; body: string }>;
        getAuthToken?: () => Promise<string | null>;
      };
    }).electronAPI;

    if (electronAPI?.apiFetch) {
      const hasBody = init?.body !== undefined;
      let parsedBody: unknown;
      if (hasBody && typeof init.body === 'string') {
        parsedBody = JSON.parse(init.body);
      }
      const proxied = await electronAPI.apiFetch({
        path,
        method: init?.method ?? 'GET',
        body: parsedBody,
        headers: (init?.headers as Record<string, string> | undefined) ?? {},
      });
      if (!proxied.ok) {
        let body: unknown;
        try {
          body = JSON.parse(proxied.body);
        } catch {
          body = { error: proxied.body || proxied.statusText };
        }
        throw new Error(buildErrorMessage(body, proxied.statusText));
      }
      if (!proxied.body.trim()) {
        return {} as T;
      }
      return JSON.parse(proxied.body) as T;
    }

    const token = await getAuthToken();
    const hasBody = init?.body !== undefined;
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'X-Papyrus-Token': token } : {}),
        ...(init?.headers as Record<string, string> || {}),
      },
    });
    if (!res.ok) {
      const body = await parseErrorBody(res);
      const message = buildErrorMessage(body, res.statusText);
      if (res.status === 401 && !cachedToken) {
        console.warn('[API] Received 401, retrying token fetch...');
        cachedToken = undefined;
        const retryToken = await getAuthToken();
        if (retryToken) {
          const retryHasBody = init?.body !== undefined;
          const retryRes = await fetch(`${BASE}${path}`, {
            ...init,
            headers: {
              ...(retryHasBody ? { 'Content-Type': 'application/json' } : {}),
              'X-Papyrus-Token': retryToken,
              ...(init?.headers as Record<string, string> || {}),
            },
          });
          if (retryRes.ok) {
            return parseJsonResponse<T>(retryRes);
          }
          const retryBody = await parseErrorBody(retryRes);
          const retryMsg = buildErrorMessage(retryBody, retryRes.statusText);
          console.error(`[API] Retry also failed with ${retryRes.status}: ${retryMsg}`);
          throw new Error(retryMsg);
        }
        console.error('[API] Token retry failed: no token available');
      }
      throw new Error(message);
    }
    return parseJsonResponse<T>(res);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to fetch')) {
      throw new Error('无法连接到服务器，请检查网络或后端是否已启动');
    }
    throw err;
  }
}

// ========== Card Types ==========
export type Card = {
  id: string;
  q: string;
  a: string;
  next_review: number;
  interval: number;
  tags?: string[];
};

export type ListCardsRes = { success: boolean; cards: Card[]; count: number };
export type NextDueRes = { success: boolean; card: Card | null; due_count: number; total_count: number };
// 描述评分响应及其可撤销操作 ID，供学习 Hook 原子地衔接下一张卡片。
// 原因：服务端 review_id 是恢复持久化 SM-2 状态的唯一可信凭据。
// 未把旧卡片快照放入响应类型：撤销状态由后端数据库保存，避免客户端篡改。
export type RateRes = {
  success: boolean;
  card: Card;
  interval_days: number;
  ef: number;
  review_id: string;
  next: NextDueRes;
};
// 描述撤销成功后的恢复卡片和集合内统计，供界面同步回到答案状态。
// 原因：撤销会让到期数变化，不能继续使用评分后的本地计数。
// 未复用 RateRes：撤销不产生新评分间隔或新的 review_id，独立类型更准确。
export type UndoRateRes = {
  success: boolean;
  card: Card;
  due_count: number;
  total_count: number;
};
export type UpdateCardRes = { success: boolean; card: Card };
export type StreakRes = {
  success: boolean;
  current_streak: number;
  longest_streak: number;
  total_days: number;
  today_completed: boolean;
  today_cards: number;
  daily_target: number;
  progress_percent: number;
};

// ========== Note Types ==========
export type Note = {
  id: string;
  title: string;
  folder: string;
  content: string;
  preview: string;
  tags: string[];
  created_at: number;
  updated_at: number;
  word_count: number;
};

export type ListNotesRes = { success: boolean; notes: Note[]; count: number };
export type CreateNoteRes = { success: boolean; note: Note };
export type UpdateNoteRes = { success: boolean; note: Note };
export type DeleteNoteRes = { success: boolean };
export type ImportObsidianRes = {
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
};

// ========== Search Types ==========
export type SearchResult = {
  id: string;
  type: 'note' | 'card' | 'file';
  title: string;
  preview: string;
  folder: string;
  tags: string[];
  matched_field: string;
  updated_at: number;
  parent_id?: string | null;
  is_folder?: boolean;
  file_type?: string;
  mime_type?: string;
};

export type SearchRes = {
  success: boolean;
  query: string;
  results: SearchResult[];
  total: number;
  notes_count: number;
  cards_count: number;
  files_count?: number;
};

// ========== AI Config Types ==========
export type ProviderConfig = {
  api_key?: string;
  base_url?: string;
  models: string[];
};

export type ParametersConfig = {
  temperature: number;
  top_p: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
};

export type FeaturesConfig = {
  auto_hint: boolean;
  auto_explain: boolean;
  context_length: number;
  agent_enabled: boolean;
  cache_enabled: boolean;
};

export type AIConfig = {
  current_provider: string;
  current_model: string;
  /** 标题生成专用供应商 type；空则与 title_model 一起回退聊天默认 */
  title_provider?: string;
  /** 标题生成专用模型 API ID；空则与 title_provider 一起回退聊天默认 */
  title_model?: string;
  /** 翻译专用供应商 type；空则回退 current_provider */
  translation_provider?: string;
  /** 翻译专用模型 API ID；空则回退 current_model */
  translation_model?: string;
  providers: Record<string, ProviderConfig>;
  parameters: ParametersConfig;
  features: FeaturesConfig;
};

export type AIConfigRes = {
  success: boolean;
  config: AIConfig;
};

// ========== Completion Types ==========
export type CompletionConfig = {
  enabled: boolean;
  require_confirm: boolean;
  trigger_delay: number;
  max_tokens: number;
};

// ========== Logs Config Types ==========
export type LogsConfig = {
  log_dir: string;
  log_level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  log_rotation: boolean;
  max_log_files: number;
};

// ========== UI Settings Types ==========
export type ChatPanelSide = 'left' | 'right';
export type UiLanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';
export type UiFontSize = 'small' | 'medium' | 'large';
export type UiDateFormat = 'yyyy-MM-dd' | 'yyyy/MM/dd' | 'dd/MM/yyyy' | 'MM/dd/yyyy';

export type SidebarSettings = {
  chatPanelSide: ChatPanelSide;
};

export type UiSettings = SidebarSettings & {
  language: UiLanguage;
  fontSize: UiFontSize;
  dateFormat: UiDateFormat;
};

// ========== Automation Types ==========
export type AutomationSchedule =
  | { kind: 'hourly'; intervalHours: number; minute: number }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; daysOfWeek: number[]; hour: number; minute: number };

export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'missed';
export type AutomationRunTrigger = 'manual' | 'scheduled' | 'missed';

export interface AutomationToolCall {
  name: string;
  params: Record<string, unknown>;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
  timezone: string;
  enabled: boolean;
  allowedTools: string[];
  providerOverride: string | null;
  modelOverride: string | null;
  reasoningOverride: boolean | null;
  nextRunAt: number | null;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  trigger: AutomationRunTrigger;
  status: AutomationRunStatus;
  scheduledFor: number | null;
  output: string;
  reasoning: string;
  toolCalls: AutomationToolCall[];
  error: string | null;
  model: string;
  provider: string;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
}

export interface AutomationInput {
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
  enabled: boolean;
  allowedTools: string[];
  providerOverride: string | null;
  modelOverride: string | null;
  reasoningOverride: boolean | null;
}

export interface ToolCatalogItem {
  name: string;
  category: string;
  side_effect: 'read' | 'write';
  description: string;
}

// ========== Update Types ==========
export type VersionInfo = {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_url: string;
  download_url: string;
  release_notes: string | null;
  published_at: string | null;
};

export type UpdateCheckRes = {
  success: boolean;
  data: VersionInfo | null;
  message: string;
};

export type VersionRes = {
  version: string;
  repository: string;
};

// ========== Knowledge Version Control Types ==========
export type KnowledgeVersionStats = {
  cards: number;
  notes: number;
  relations: number;
  files: number;
  progressDays: number;
  sizeBytes: number;
};

export type KnowledgeBranch = {
  id: string;
  name: string;
  headVersionId: string | null;
  isActive: boolean;
  isProtected: boolean;
  createdAt: number;
  updatedAt: number;
};

export type KnowledgeVersion = {
  id: string;
  branchId: string;
  name: string;
  description: string;
  kind: 'manual' | 'safety';
  isHead: boolean;
  stats: KnowledgeVersionStats;
  createdAt: number;
};

export type KnowledgeVersionStateRes = {
  success: boolean;
  branches: KnowledgeBranch[];
  activeBranch: KnowledgeBranch;
  versions: KnowledgeVersion[];
};

// ========== File Types ==========
export type FileItemData = {
  id: string;
  name: string;
  type: string;
  size: number;
  mime_type: string;
  parent_id: string | null;
  file_storage_path: string | null;
  is_folder: boolean | number;
  itemCount?: number;
  created_at: number;
  updated_at: number;
};

export type ListFilesRes = { success: boolean; files: FileItemData[]; count: number };

// ========== CLI Manager Types ==========
export type CliStatusRes = {
  success: boolean;
  installed: boolean;
  version: string | null;
  path: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  packageName: string;
};

export type CliInstallRes = {
  success: boolean;
  version: string;
  path: string;
  packageName: string;
};

export type CliRunRes = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

// ========== Extension Types ==========
export type ExtensionItem = {
  id: string;
  name: string;
  description: string;
  version: string;
  type: string;
  author: string;
  rating: number;
  downloads: number;
  isEnabled: boolean;
  isBuiltin?: boolean;
  updateAvailable?: boolean;
  latestVersion?: string;
  tags: string[];
  config: Record<string, unknown>;
};

// ========== Chat Session Types ==========
export type ChatBlockType = 'text' | 'reasoning' | 'tool_call' | 'tool_result';

export type ChatBlock = {
  type: ChatBlockType;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  toolStatus?: 'pending' | 'approved' | 'rejected' | 'executing' | 'success' | 'failed';
  toolParams?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
};

export type ChatAttachment = {
  id: string;
  name: string;
  stored_name: string;
  path: string;
  type: 'image' | 'document';
  mime_type: string;
  size: number;
  created_at: number;
};

export type ChatTokenUsage = {
  prompt?: number;
  completion?: number;
  total?: number;
};

export type ChatSession = {
  id: string;
  title: string;
  model: string;
  provider: string;
  isActive: boolean;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  blocks: ChatBlock[];
  attachments: ChatAttachment[];
  model: string;
  provider: string;
  tokenUsage: ChatTokenUsage;
  parentMessageId: string | null;
  createdAt: number;
};

export type ListChatSessionsRes = {
  success: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
};

export type CreateChatSessionRes = {
  success: boolean;
  session: ChatSession;
  activeSessionId: string;
};

export type SwitchChatSessionRes = {
  success: boolean;
  activeSessionId: string;
};

export type RenameChatSessionRes = {
  success: boolean;
  session: ChatSession;
};

export type GenerateChatSessionTitleRes = {
  success: boolean;
  session: ChatSession;
  error?: string;
};

export type DeleteChatSessionRes = {
  success: boolean;
  activeSessionId: string | null;
};

export type ClearAllChatSessionsRes = {
  success: boolean;
  deletedCount: number;
  activeSessionId: string | null;
};

export type GetChatMessagesRes = {
  success: boolean;
  session: ChatSession;
  messages: ChatMessage[];
};

export type DeleteChatMessageRes = {
  success: boolean;
  error?: string;
};

export type UpdateChatMessageRes = {
  success: boolean;
  error?: string;
};

// ========== Provider Types ==========
export type ProviderItem = {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  isDefault: boolean;
  apiKeys: { id: string; name: string; key: string; hasKey?: boolean }[];
  models: { id: string; name: string; modelId: string; port: string; capabilities: string[]; apiKeyId?: string; enabled: boolean }[];
};

export type ListProvidersRes = { success: boolean; providers: ProviderItem[] };
export type CreateProviderRes = { success: boolean; provider: ProviderItem; message: string; error?: string };
export type UpdateProviderRes = { success: boolean; message: string; error?: string };
export type AddModelRes = { success: boolean; modelId: string; message: string; error?: string };

// ========== Card API ==========
export const api = {
  health: () => request<{ status: string }>('/health'),
  
  // Cards
  listCards: () => request<ListCardsRes>('/cards'),
  createCard: (q: string, a: string, tags?: string[]) => request<{ success: boolean; card: Card }>('/cards', { 
    method: 'POST', 
    body: JSON.stringify({ q, a, tags }) 
  }),
  deleteCard: (id: string) => request<{ success: boolean }>(`/cards/${id}`, { method: 'DELETE' }),
  batchDeleteCards: (ids: string[]) => request<{ success: boolean; deleted: number }>('/cards/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  }),
  updateCard: (id: string, data: { q?: string; a?: string; tags?: string[] }) =>
    request<UpdateCardRes>(`/cards/${id}`, { 
      method: 'PATCH', 
      body: JSON.stringify(data) 
    }),
  nextDue: (tag?: string) => request<NextDueRes>(tag ? `/review/next?tag=${encodeURIComponent(tag)}` : '/review/next'),
  rateCard: (id: string, grade: 1 | 2 | 3, tag?: string) => request<RateRes>(tag ? `/review/${id}/rate?tag=${encodeURIComponent(tag)}` : `/review/${id}/rate`, {
    method: 'POST',
    body: JSON.stringify({ grade })
  }),
  // 撤销服务端评分，输入卡片 ID、评分操作 ID 和可选集合标签，输出恢复后的卡片与统计。
  // 原因：集合标签必须随撤销请求传递，确保回滚后的工具栏计数仍局限于当前集合。
  // 未直接 PATCH 卡片：专用端点会原子恢复 SM-2 状态并扣回每日复习计数。
  undoCardRating: (id: string, reviewId: string, tag?: string) =>
    request<UndoRateRes>(tag ? `/review/${id}/undo?tag=${encodeURIComponent(tag)}` : `/review/${id}/undo`, {
      method: 'POST',
      body: JSON.stringify({ review_id: reviewId }),
    }),
  streak: () => request<StreakRes>('/progress/streak'),
  importTxt: (content: string) => request<{ success: boolean; count: number }>('/cards/import/txt', {
    method: 'POST',
    body: JSON.stringify({ content })
  }),

  // Notes
  listNotes: () => request<ListNotesRes>('/notes'),
  createNote: (title: string, folder: string, content: string, tags?: string[]) => 
    request<CreateNoteRes>('/notes', { 
      method: 'POST', 
      body: JSON.stringify({ title, folder, content, tags: tags || [] }) 
    }),
  getNote: (id: string) => request<CreateNoteRes>(`/notes/${id}`),
  updateNote: (id: string, data: { title?: string; folder?: string; content?: string; tags?: string[] }) => 
    request<UpdateNoteRes>(`/notes/${id}`, { 
      method: 'PATCH', 
      body: JSON.stringify(data) 
    }),
  deleteNote: (id: string) => request<DeleteNoteRes>(`/notes/${id}`, { method: 'DELETE' }),
  batchDeleteNotes: (ids: string[]) => request<{ success: boolean; deleted: number }>('/notes/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  }),

  // Obsidian Import
  importObsidian: (vaultPath: string, excludeFolders?: string[]) => 
    request<ImportObsidianRes>('/notes/import/obsidian', { 
      method: 'POST', 
      body: JSON.stringify({ vault_path: vaultPath, exclude_folders: excludeFolders || ['.obsidian', '.git'] }) 
    }),

  // Search
  search: (query: string) => 
    request<SearchRes>(`/search?query=${encodeURIComponent(query)}`),

  // AI Config
  getAIConfig: () =>
    request<AIConfigRes>('/config/ai'),
  saveAIConfig: (config: Partial<AIConfig>) =>
    request<{ success: boolean }>('/config/ai', {
      method: 'POST',
      body: JSON.stringify(config)
    }),
  testAIConnection: () => 
    request<{ success: boolean; message: string }>('/config/ai/test', { method: 'POST' }),

  // Data Management
  createBackup: () => 
    request<{ success: boolean; path: string }>('/backup', { method: 'POST' }),
  exportData: () => 
    request<{ cards: any[]; notes: any[]; config: any }>('/export'),
  importData: (data: any) => 
    request<{ success: boolean; imported: number }>('/import', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
  resetData: () => 
    request<{ success: boolean }>('/data/reset', { method: 'POST' }),

  // Knowledge Version Control
  getKnowledgeVersionState: () =>
    request<KnowledgeVersionStateRes>('/knowledge-versions'),
  createKnowledgeVersion: (data: { name: string; description?: string }) =>
    request<{ success: boolean; version: KnowledgeVersion }>('/knowledge-versions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  renameKnowledgeVersion: (
    versionId: string,
    data: { name: string; description?: string },
  ) =>
    request<{ success: boolean; version: KnowledgeVersion }>(
      `/knowledge-versions/${encodeURIComponent(versionId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    ),
  deleteKnowledgeVersion: (versionId: string) =>
    request<{ success: boolean }>(
      `/knowledge-versions/${encodeURIComponent(versionId)}`,
      { method: 'DELETE' },
    ),
  restoreKnowledgeVersion: (versionId: string) =>
    request<KnowledgeVersionStateRes>(
      `/knowledge-versions/${encodeURIComponent(versionId)}/restore`,
      { method: 'POST' },
    ),
  createKnowledgeBranch: (versionId: string, name: string) =>
    request<KnowledgeVersionStateRes>(
      `/knowledge-versions/${encodeURIComponent(versionId)}/branch`,
      {
        method: 'POST',
        body: JSON.stringify({ name }),
      },
    ),
  getKnowledgeBranches: () =>
    request<{
      success: boolean;
      branches: KnowledgeBranch[];
      activeBranch: KnowledgeBranch;
    }>('/knowledge-branches'),
  createKnowledgeBranchFromCurrent: (name: string) =>
    request<KnowledgeVersionStateRes>('/knowledge-branches', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  renameKnowledgeBranch: (branchId: string, name: string) =>
    request<{ success: boolean; branch: KnowledgeBranch }>(
      `/knowledge-branches/${encodeURIComponent(branchId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      },
    ),
  deleteKnowledgeBranch: (branchId: string) =>
    request<{ success: boolean }>(
      `/knowledge-branches/${encodeURIComponent(branchId)}`,
      { method: 'DELETE' },
    ),
  switchKnowledgeBranch: (branchId: string) =>
    request<KnowledgeVersionStateRes>(
      `/knowledge-branches/${encodeURIComponent(branchId)}/switch`,
      { method: 'POST' },
    ),

  // Completion
  getCompletionConfig: () =>
    request<{ success: boolean; config: CompletionConfig }>('/completion/config'),
  saveCompletionConfig: (config: CompletionConfig) =>
    request<{ success: boolean }>('/completion/config', {
      method: 'POST',
      body: JSON.stringify(config)
    }),

  // Logs Config
  getLogsConfig: () =>
    request<{ success: boolean; config: LogsConfig }>('/config/logs'),
  saveLogsConfig: (config: LogsConfig) =>
    request<{ success: boolean }>('/config/logs', {
      method: 'POST',
      body: JSON.stringify(config)
    }),
  openLogsDir: () =>
    request<{ success: boolean; path: string }>('/config/logs/open-dir', { method: 'POST' }),

  // UI Settings
  getUiSettings: () =>
    request<{ success: boolean; settings: UiSettings }>('/ui-settings'),
  saveUiSettings: (settings: Partial<UiSettings>) =>
    request<{ success: boolean; settings: UiSettings }>('/ui-settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  getSidebarSettings: () =>
    request<{ success: boolean; settings: SidebarSettings }>('/ui-settings/sidebar'),
  saveSidebarSettings: (settings: SidebarSettings) =>
    request<{ success: boolean; settings: SidebarSettings }>('/ui-settings/sidebar', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),

  // Automations
  listAutomations: () =>
    request<{ success: boolean; automations: Automation[] }>('/automations'),
  getAutomation: (id: string) =>
    request<{ success: boolean; automation: Automation }>(`/automations/${id}`),
  createAutomation: (input: AutomationInput) =>
    request<{ success: boolean; automation: Automation }>('/automations', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateAutomation: (id: string, input: Partial<AutomationInput>) =>
    request<{ success: boolean; automation: Automation }>(`/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteAutomation: (id: string) =>
    request<{ success: boolean }>(`/automations/${id}`, { method: 'DELETE' }),
  runAutomation: (id: string) =>
    request<{ success: boolean; run: AutomationRun }>(`/automations/${id}/run`, { method: 'POST' }),
  listAutomationRuns: (id: string, limit = 100) =>
    request<{ success: boolean; runs: AutomationRun[] }>(`/automations/${id}/runs?limit=${limit}`),
  listRecentAutomationRuns: (limit = 100) =>
    request<{ success: boolean; runs: AutomationRun[] }>(`/automations/runs/recent?limit=${limit}`),
  getAutomationRun: (runId: string) =>
    request<{ success: boolean; run: AutomationRun }>(`/automations/runs/${runId}`),
  getToolCatalog: () =>
    request<{ success: boolean; tools: ToolCatalogItem[] }>('/tools/catalog'),

  // Files
  listFiles: () => request<ListFilesRes>('/files'),
  createFolder: (name: string, parentId?: string) =>
    request<{ success: boolean; file: FileItemData }>('/files/folder', {
      method: 'POST',
      body: JSON.stringify({ name, parentId }),
    }),
  uploadFiles: (files: Array<{ name: string; content: string; mimeType?: string }>, parentId?: string) =>
    request<{ success: boolean; files: FileItemData[]; count: number }>('/files/upload', {
      method: 'POST',
      body: JSON.stringify({ files, parentId }),
    }),
  deleteFile: (id: string) =>
    request<{ success: boolean; deleted: number }>(`/files/${id}`, { method: 'DELETE' }),

  // Chat Sessions
  listChatSessions: () =>
    request<ListChatSessionsRes>('/sessions'),
  createChatSession: (title?: string) =>
    request<CreateChatSessionRes>('/sessions', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    }),
  switchChatSession: (id: string) =>
    request<SwitchChatSessionRes>(`/sessions/${id}/switch`, { method: 'POST' }),
  renameChatSession: (id: string, title: string) =>
    request<RenameChatSessionRes>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title })
    }),
  generateChatSessionTitle: (id: string) =>
    request<GenerateChatSessionTitleRes>(`/sessions/${id}/generate-title`, {
      method: 'POST',
    }),
  deleteChatSession: (id: string) =>
    request<DeleteChatSessionRes>(`/sessions/${id}`, { method: 'DELETE' }),
  clearAllChatSessions: () =>
    request<ClearAllChatSessionsRes>('/sessions', { method: 'DELETE' }),
  getChatMessages: (sessionId: string) =>
    request<GetChatMessagesRes>(`/sessions/${sessionId}/messages`),
  deleteChatMessage: (messageId: string) =>
    request<DeleteChatMessageRes>(`/messages/${messageId}`, { method: 'DELETE' }),
  updateChatMessage: (messageId: string, content: string) =>
    request<UpdateChatMessageRes>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  // Providers
  listProviders: () => request<ListProvidersRes>('/providers'),
  createProvider: (data: ProviderItem) =>
    request<CreateProviderRes>('/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProvider: (id: string, data: Partial<ProviderItem>) =>
    request<UpdateProviderRes>(`/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProvider: (id: string) =>
    request<{ success: boolean; message: string; error?: string }>(`/providers/${id}`, { method: 'DELETE' }),
  setDefaultProvider: (id: string) =>
    request<{ success: boolean; message: string; error?: string }>(`/providers/${id}/default`, { method: 'POST' }),
  updateProviderEnabled: (id: string, enabled: boolean) =>
    request<{ success: boolean; message: string; error?: string }>(`/providers/${id}/enabled`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  addModel: (
    providerId: string,
    data: {
      id: string;
      name: string;
      modelId: string;
      port?: string;
      capabilities?: string[];
      apiKeyId?: string;
      enabled?: boolean;
    }
  ) =>
    request<AddModelRes>(`/providers/${providerId}/models`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateModel: (
    providerId: string,
    modelId: string,
    data: Partial<ProviderItem['models'][0]>
  ) =>
    request<{ success: boolean; message: string; error?: string }>(`/providers/${providerId}/models/${modelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteModel: (providerId: string, modelId: string) =>
    request<{ success: boolean; message: string; error?: string }>(`/providers/${providerId}/models/${modelId}`, {
      method: 'DELETE',
    }),

  // Tools
  getToolsCatalog: () =>
    request<{ success: boolean; tools: Array<{ name: string; category: string; side_effect: 'read' | 'write'; description: string }> }>('/tools/catalog'),
  getToolsConfig: () =>
    request<{ success: boolean; config: { mode: string; auto_execute_tools: string[] } }>('/tools/config'),
  saveToolsConfig: (data: { mode: string; auto_execute_tools: string[] }) =>
    request<{ success: boolean }>('/tools/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getExtensionsList: () =>
    request<{ success: boolean; extensions: ExtensionItem[]; count: number; stats?: { total: number; enabled: number; builtin: number } }>('/extensions'),
  installExtension: (data: { id: string; name: string; description?: string; version?: string; author?: string; rating?: number; downloads?: number; tags?: string[] }) =>
    request<{ success: boolean; extension: unknown; message: string }>('/extensions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  uninstallExtension: (id: string) =>
    request<{ success: boolean; message: string; error?: string }>(`/extensions/${id}`, { method: 'DELETE' }),
  setExtensionEnabled: (id: string, enabled: boolean) =>
    request<{ success: boolean; message: string; error?: string }>(`/extensions/${id}/enabled`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  checkExtensionUpdates: () =>
    request<{ success: boolean; hasUpdates: boolean; updateCount: number; updates: Array<{ id: string; hasUpdate: boolean; currentVersion: string; latestVersion: string }>; extensions: unknown[] }>('/extensions/check-updates', { method: 'POST' }),
  installLocalExtension: (filename: string, content: string) =>
    request<{ success: boolean; extension: ExtensionItem; message: string }>('/extensions/install-local', {
      method: 'POST',
      body: JSON.stringify({ filename, content }),
    }),
  updateExtensionConfig: (id: string, config: Record<string, unknown>) =>
    request<{ success: boolean; message: string }>(`/extensions/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  // Update
  getVersion: () => request<VersionRes>('/update/version'),
  checkUpdate: () => request<UpdateCheckRes>('/update/check'),

  // CLI Manager
  cliStatus: () => request<CliStatusRes>('/cli/status'),
  cliInstall: () => request<CliInstallRes>('/cli/install', { method: 'POST' }),
  cliUpdate: () => request<CliInstallRes>('/cli/update', { method: 'POST' }),
  cliRun: (args: string[]) => request<CliRunRes>('/cli/run', {
    method: 'POST',
    body: JSON.stringify({ args }),
  })
};
