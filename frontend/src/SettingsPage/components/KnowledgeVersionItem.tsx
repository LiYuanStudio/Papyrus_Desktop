import {
  Button,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import {
  IconBranch,
  IconDelete,
  IconEdit,
  IconHistory,
  IconRefresh,
} from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import type { KnowledgeVersion } from '../../api';

const { Text, Paragraph } = Typography;

interface KnowledgeVersionItemProps {
  version: KnowledgeVersion;
  disabled: boolean;
  onCreateBranch: (version: KnowledgeVersion) => void;
  onRestore: (version: KnowledgeVersion) => void;
  onRename: (version: KnowledgeVersion) => void;
  onDelete: (version: KnowledgeVersion) => void;
}

// 将字节数格式化为紧凑可读文本，输入非负字节数，输出本地化单位字符串。
// 原因：版本卡片空间信息需要在较窄设置面板中快速比较。
// 未使用浏览器文件大小 API：标准平台没有统一格式化该单位的接口。
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KB';
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

// 展示单个知识库版本及其管理菜单，输入版本数据和意图回调，输出语义化历史条目。
// 原因：列表项拥有独立视觉与可访问性职责，从页面状态逻辑中拆出便于复核和结构测试。
// 未在条目内请求 API：页面需要统一锁定操作、更新分支状态和显示反馈。
export function KnowledgeVersionItem({
  version,
  disabled,
  onCreateBranch,
  onRestore,
  onRename,
  onDelete,
}: KnowledgeVersionItemProps) {
  const { t, i18n } = useTranslation();
  const formattedDate = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(version.createdAt * 1000));
  const createdIso = new Date(version.createdAt * 1000).toISOString();
  const deleteDisabled = disabled || version.isHead;

  return (
    <article
      className={`knowledge-version-item${version.isHead ? ' knowledge-version-item-head' : ''}`}
      aria-label={t('versionControl.versionAriaLabel', { name: version.name })}
    >
      <div className="knowledge-version-timeline" aria-hidden="true">
        <span className="knowledge-version-dot" />
        <span className="knowledge-version-line" />
      </div>
      <div className="knowledge-version-body">
        <div className="knowledge-version-header">
          <div className="knowledge-version-identity">
            <span className="knowledge-version-icon" aria-hidden="true">
              <IconHistory />
            </span>
            <div className="knowledge-version-title-block">
              <div className="knowledge-version-heading">
                <Text bold className="knowledge-version-name">{version.name}</Text>
                <Tag
                  size="small"
                  color={version.kind === 'safety' ? 'orange' : 'arcoblue'}
                >
                  {version.kind === 'safety'
                    ? t('versionControl.safetyVersion')
                    : t('versionControl.manualVersion')}
                </Tag>
                {version.isHead && (
                  <Tag size="small" color="green">{t('versionControl.currentVersion')}</Tag>
                )}
              </div>
              <div className="knowledge-version-meta">
                <time dateTime={createdIso}>{formattedDate}</time>
                <span className="knowledge-version-meta-dot" aria-hidden="true" />
                <code className="knowledge-version-id">{version.id.slice(0, 8)}</code>
              </div>
            </div>
          </div>
          <div
            className="knowledge-version-actions"
            role="group"
            aria-label={t('versionControl.versionActionsFor', { name: version.name })}
          >
            <Tooltip content={t('versionControl.createBranchFrom')}>
              <Button
                type="text"
                icon={<IconBranch />}
                disabled={disabled}
                aria-label={t('versionControl.createBranchFrom')}
                onClick={() => onCreateBranch(version)}
              />
            </Tooltip>
            <Tooltip content={version.isHead
              ? t('versionControl.currentVersionRestoreHint')
              : t('versionControl.restore')}
            >
              <Button
                type="text"
                icon={<IconRefresh />}
                disabled={disabled || version.isHead}
                aria-label={t('versionControl.restore')}
                onClick={() => onRestore(version)}
              />
            </Tooltip>
            <Tooltip content={t('versionControl.rename')}>
              <Button
                type="text"
                icon={<IconEdit />}
                disabled={disabled}
                aria-label={t('versionControl.rename')}
                onClick={() => onRename(version)}
              />
            </Tooltip>
            <Tooltip content={version.isHead
              ? t('versionControl.currentVersionDeleteHint')
              : t('versionControl.delete')}
            >
              <Button
                type="text"
                status="danger"
                icon={<IconDelete />}
                disabled={deleteDisabled}
                aria-label={t('versionControl.delete')}
                onClick={() => onDelete(version)}
              />
            </Tooltip>
          </div>
        </div>

        {version.description && (
          <Paragraph className="knowledge-version-description">
            {version.description}
          </Paragraph>
        )}

        <div className="knowledge-version-footer">
          <Text type="secondary">
            {t('versionControl.contentSummary', {
              notes: version.stats.notes,
              cards: version.stats.cards,
              files: version.stats.files,
            })}
          </Text>
          <Text type="secondary" className="knowledge-version-size">
            {formatBytes(version.stats.sizeBytes)}
          </Text>
        </div>
      </div>
    </article>
  );
}
