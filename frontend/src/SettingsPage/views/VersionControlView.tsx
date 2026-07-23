import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Empty,
  Form,
  Input,
  Message,
  Modal,
  Select,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from '@arco-design/web-react';
import {
  IconBranch,
  IconDelete,
  IconEdit,
  IconHistory,
  IconPlus,
  IconRefresh,
} from '@arco-design/web-react/icon';
import {
  api,
  type KnowledgeBranch,
  type KnowledgeVersion,
  type KnowledgeVersionStateRes,
} from '../../api';
import { KnowledgeVersionItem } from '../components/KnowledgeVersionItem';
import { SettingsViewLayout, type NavItem } from '../components';
import './VersionControlView.css';

const { Text, Paragraph } = Typography;
const Option = Select.Option;

const NAV_ITEMS: NavItem[] = [
  { key: 'history-section', label: 'versionControl.history', icon: IconHistory },
  { key: 'branches-section', label: 'versionControl.branches', icon: IconBranch },
];

type EditorMode =
  | { kind: 'create-version' }
  | { kind: 'create-branch'; version: KnowledgeVersion }
  | { kind: 'rename-version'; version: KnowledgeVersion }
  | { kind: 'rename-branch'; branch: KnowledgeBranch };

interface VersionControlViewProps {
  onBack: () => void;
}

// 通知应用内依赖知识库的页面数据已整体变化，输入为空，无返回值。
// 原因：恢复与分支切换同时影响笔记、卡片、文件和统计，必须广播统一事件并兼容现有监听器。
// 未强制刷新整个窗口：保持设置页上下文，同时其他页面在挂载或收到事件时自行拉取。
function dispatchKnowledgeChanged(): void {
  window.dispatchEvent(new CustomEvent('papyrus_knowledge_changed'));
  window.dispatchEvent(new CustomEvent('papyrus_cards_changed'));
  window.dispatchEvent(new CustomEvent('papyrus_notes_changed'));
  window.dispatchEvent(new CustomEvent('papyrus_recent_files_changed'));
}

// 管理设置页中的知识库分支与版本，输入返回设置回调，输出完整版本控制视图。
// 原因：页面统一持有服务端状态和操作锁，避免列表项、分支区与弹窗产生相互矛盾的乐观状态。
// 未引入新的请求状态库：项目当前没有 React Query/SWR，单页本地状态足以保持依赖规模稳定。
export default function VersionControlView({ onBack }: VersionControlViewProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<KnowledgeVersionStateRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');

  // 从后端重新读取分支与当前历史，输入可选静默标记，输出请求 Promise。
  // 原因：所有写操作以服务端结果为权威，刷新可统一处理自动安全快照带来的额外版本。
  // 未合并局部乐观更新：切换/恢复会同时改变多个对象，局部合并容易遗漏分支头。
  const loadState = async (showLoading: boolean = false): Promise<void> => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const result = await api.getKnowledgeVersionState();
      setState(result);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('versionControl.loadFailed'));
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  // 初次挂载时读取状态，并在卸载后忽略迟到响应。
  // 原因：设置页动画可能在请求期间卸载视图，避免对已卸载组件更新。
  // 未使用 AbortController：现有 api.request 不接受 signal，布尔标记足以抑制 UI 更新。
  useEffect(() => {
    let active = true;
    api.getKnowledgeVersionState()
      .then((result) => {
        if (active) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          Message.error(error instanceof Error ? error.message : t('versionControl.loadFailed'));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  // 打开统一编辑弹窗并预填对应对象，输入编辑模式，无返回值。
  // 原因：创建与重命名共享同一套名称校验和焦点路径，减少重复 Modal 状态。
  // 未复用浏览器 prompt：Arco Modal 能保持主题、键盘导航和加载反馈。
  const openEditor = (mode: EditorMode): void => {
    setEditor(mode);
    if (mode.kind === 'rename-version') {
      setEditorName(mode.version.name);
      setEditorDescription(mode.version.description);
    } else if (mode.kind === 'rename-branch') {
      setEditorName(mode.branch.name);
      setEditorDescription('');
    } else {
      setEditorName('');
      setEditorDescription('');
    }
  };

  // 关闭编辑弹窗并清空草稿，输入为空，无返回值。
  // 原因：下次打开不能泄漏上一个版本或分支的名称。
  // 未在操作开始时关闭：失败时保留输入，便于用户修正后重试。
  const closeEditor = (): void => {
    setEditor(null);
    setEditorName('');
    setEditorDescription('');
  };

  // 提交当前编辑模式，输入为空，输出异步完成信号。
  // 原因：单入口确保创建、旁开与重命名共享防重复提交和错误反馈。
  // 未吞掉后端校验信息：request 会提取服务端错误文本直接展示。
  const submitEditor = async (): Promise<void> => {
    if (!editor || operating) {
      return;
    }
    const name = editorName.trim();
    if (!name) {
      Message.warning(t('versionControl.nameRequired'));
      return;
    }
    setOperating(true);
    try {
      if (editor.kind === 'create-version') {
        await api.createKnowledgeVersion({
          name,
          description: editorDescription.trim() || undefined,
        });
        Message.success(t('versionControl.createVersionSuccess'));
        await loadState();
      } else if (editor.kind === 'create-branch') {
        const result = await api.createKnowledgeBranch(editor.version.id, name);
        setState(result);
        dispatchKnowledgeChanged();
        Message.success(t('versionControl.createBranchSuccess', { name }));
      } else if (editor.kind === 'rename-version') {
        await api.renameKnowledgeVersion(editor.version.id, {
          name,
          description: editorDescription.trim() || undefined,
        });
        Message.success(t('versionControl.renameSuccess'));
        await loadState();
      } else {
        await api.renameKnowledgeBranch(editor.branch.id, name);
        Message.success(t('versionControl.renameSuccess'));
        await loadState();
      }
      closeEditor();
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('versionControl.operationFailed'));
    } finally {
      setOperating(false);
    }
  };

  // 切换当前分支，输入目标分支 ID，输出异步完成信号。
  // 原因：后端会先创建安全快照并返回完整新状态，页面只需替换权威响应。
  // 未在前端预切换 Select：恢复失败时仍显示真实活动分支。
  const handleSwitchBranch = async (branchId: string): Promise<void> => {
    if (!state || branchId === state.activeBranch.id || operating) {
      return;
    }
    setOperating(true);
    try {
      const result = await api.switchKnowledgeBranch(branchId);
      setState(result);
      dispatchKnowledgeChanged();
      Message.success(t('versionControl.switchSuccess', { name: result.activeBranch.name }));
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('versionControl.operationFailed'));
    } finally {
      setOperating(false);
    }
  };

  // 二次确认后恢复指定版本，输入版本对象，无返回值。
  // 原因：恢复会替换当前知识库，必须明确提示自动安全快照和影响范围。
  // 未直接绑定菜单点击执行：危险操作需要不可误触的确认步骤。
  const confirmRestore = (version: KnowledgeVersion): void => {
    Modal.confirm({
      title: t('versionControl.restoreConfirmTitle'),
      content: t('versionControl.restoreConfirmContent', { name: version.name }),
      okText: t('versionControl.restore'),
      onOk: async () => {
        if (operating) {
          return;
        }
        setOperating(true);
        try {
          const result = await api.restoreKnowledgeVersion(version.id);
          setState(result);
          dispatchKnowledgeChanged();
          Message.success(t('versionControl.restoreSuccess'));
        } catch (error) {
          Message.error(error instanceof Error ? error.message : t('versionControl.operationFailed'));
          throw error;
        } finally {
          setOperating(false);
        }
      },
    });
  };

  // 二次确认后删除非头版本，输入版本对象，无返回值。
  // 原因：版本删除会回收独有快照，使用确认弹窗保护不可撤销操作。
  // 未允许删除当前头：前后端同时禁用，避免仅靠界面保护。
  const confirmDeleteVersion = (version: KnowledgeVersion): void => {
    Modal.confirm({
      title: t('versionControl.deleteVersionConfirmTitle'),
      content: t('versionControl.deleteVersionConfirmContent', { name: version.name }),
      okButtonProps: { status: 'danger' },
      okText: t('versionControl.delete'),
      onOk: async () => {
        setOperating(true);
        try {
          await api.deleteKnowledgeVersion(version.id);
          await loadState();
          Message.success(t('versionControl.deleteSuccess'));
        } catch (error) {
          Message.error(error instanceof Error ? error.message : t('versionControl.operationFailed'));
          throw error;
        } finally {
          setOperating(false);
        }
      },
    });
  };

  // 二次确认后删除非活动分支，输入分支对象，无返回值。
  // 原因：删除会连同该分支独有历史一起回收，确认文本必须点名分支。
  // 未提供级联复选框：行为已由产品决策固定，减少含糊选择。
  const confirmDeleteBranch = (branch: KnowledgeBranch): void => {
    Modal.confirm({
      title: t('versionControl.deleteBranchConfirmTitle'),
      content: t('versionControl.deleteBranchConfirmContent', { name: branch.name }),
      okButtonProps: { status: 'danger' },
      okText: t('versionControl.delete'),
      onOk: async () => {
        setOperating(true);
        try {
          await api.deleteKnowledgeBranch(branch.id);
          await loadState();
          Message.success(t('versionControl.deleteSuccess'));
        } catch (error) {
          Message.error(error instanceof Error ? error.message : t('versionControl.operationFailed'));
          throw error;
        } finally {
          setOperating(false);
        }
      },
    });
  };

  // 渲染历史或分支管理区块，输入区块 ID，输出对应 React 内容。
  // 原因：SettingsViewLayout 按既有滚动导航协议请求区块内容。
  // 未拆分额外页面组件：两块共享同一服务端状态与操作锁，保持就近状态更清晰。
  const renderSection = (sectionId: string): React.ReactNode => {
    if (loading) {
      return (
        <div className="knowledge-version-loading" role="status" aria-live="polite">
          <Spin size={32} />
        </div>
      );
    }
    if (!state) {
      return (
        <div className="knowledge-version-empty">
          <div>
            <Empty description={t('versionControl.loadFailed')} />
            <Button icon={<IconRefresh />} onClick={() => void loadState(true)}>
              {t('versionControl.retry')}
            </Button>
          </div>
        </div>
      );
    }

    if (sectionId === 'history-section') {
      return (
        <>
          <div className="knowledge-version-toolbar">
            <Select
              className="knowledge-version-branch-picker"
              value={state.activeBranch.id}
              disabled={operating}
              onChange={(branchId) => void handleSwitchBranch(branchId)}
              aria-label={t('versionControl.currentBranch')}
            >
              {state.branches.map((branch) => (
                <Option key={branch.id} value={branch.id}>
                  <IconBranch aria-hidden="true" />
                  <span style={{ marginLeft: 8 }}>{branch.name}</span>
                </Option>
              ))}
            </Select>
            <div className="knowledge-version-toolbar-actions">
              <Button
                icon={<IconRefresh />}
                disabled={operating}
                onClick={() => void loadState()}
                aria-label={t('versionControl.refresh')}
              >
                {t('versionControl.refresh')}
              </Button>
              <Button
                type="primary"
                icon={<IconPlus />}
                loading={operating}
                onClick={() => openEditor({ kind: 'create-version' })}
              >
                {t('versionControl.createVersion')}
              </Button>
            </div>
          </div>

          {state.versions.length === 0 ? (
            <div className="knowledge-version-empty">
              <div>
                <Empty description={t('versionControl.emptyHistory')} />
                <Button
                  type="primary"
                  icon={<IconPlus />}
                  onClick={() => openEditor({ kind: 'create-version' })}
                >
                  {t('versionControl.createFirstVersion')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="knowledge-version-list" aria-live="polite">
              {state.versions.map((version) => (
                <KnowledgeVersionItem
                  key={version.id}
                  version={version}
                  disabled={operating}
                  onCreateBranch={(selected) => openEditor({
                    kind: 'create-branch',
                    version: selected,
                  })}
                  onRestore={confirmRestore}
                  onRename={(selected) => openEditor({
                    kind: 'rename-version',
                    version: selected,
                  })}
                  onDelete={confirmDeleteVersion}
                />
              ))}
            </div>
          )}
        </>
      );
    }

    if (sectionId === 'branches-section') {
      return (
        <div className="knowledge-branch-list">
          {state.branches.map((branch) => {
            const deleteDisabled = branch.isProtected || branch.isActive || operating;
            return (
              <div className="knowledge-branch-row" key={branch.id}>
                <div className="knowledge-branch-name">
                  <IconBranch aria-hidden="true" />
                  <Text bold>{branch.name}</Text>
                  {branch.isActive && (
                    <Tag size="small" color="green">{t('versionControl.activeBranch')}</Tag>
                  )}
                  {branch.isProtected && (
                    <Tag size="small">{t('versionControl.protectedBranch')}</Tag>
                  )}
                </div>
                <div
                  className="knowledge-branch-actions"
                  role="group"
                  aria-label={t('versionControl.branchActionsNamed', { name: branch.name })}
                >
                  <Tooltip content={branch.isProtected
                    ? t('versionControl.mainProtectedHint')
                    : t('versionControl.renameBranch')}
                  >
                    <Button
                      type="text"
                      icon={<IconEdit />}
                      disabled={branch.isProtected || operating}
                      aria-label={t('versionControl.renameBranchNamed', { name: branch.name })}
                      onClick={() => openEditor({ kind: 'rename-branch', branch })}
                    />
                  </Tooltip>
                  <Tooltip content={branch.isProtected
                    ? t('versionControl.mainProtectedHint')
                    : branch.isActive
                      ? t('versionControl.activeBranchDeleteHint')
                      : t('versionControl.deleteBranch')}
                  >
                    <Button
                      type="text"
                      status="danger"
                      icon={<IconDelete />}
                      disabled={deleteDisabled}
                      aria-label={t('versionControl.deleteBranchNamed', { name: branch.name })}
                      onClick={() => confirmDeleteBranch(branch)}
                    />
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const editorTitle = editor?.kind === 'create-version'
    ? t('versionControl.createVersion')
    : editor?.kind === 'create-branch'
      ? t('versionControl.createBranch')
      : editor?.kind === 'rename-version'
        ? t('versionControl.renameVersion')
        : t('versionControl.renameBranch');
  const showDescription = editor?.kind === 'create-version' || editor?.kind === 'rename-version';

  return (
    <>
      <SettingsViewLayout
        title={t('versionControl.title')}
        description={t('versionControl.titleDesc')}
        icon={IconBranch}
        iconColor="rgb(var(--purple-6))"
        navItems={NAV_ITEMS.map((item) => ({ ...item, label: t(item.label) }))}
        sections={[
          { id: 'history-section', title: t('versionControl.history'), icon: IconHistory },
          { id: 'branches-section', title: t('versionControl.branches'), icon: IconBranch },
        ]}
        onBack={onBack}
      >
        {renderSection}
      </SettingsViewLayout>

      <Modal
        title={editorTitle}
        visible={editor !== null}
        onOk={() => void submitEditor()}
        onCancel={closeEditor}
        confirmLoading={operating}
        okText={t('versionControl.confirm')}
        cancelText={t('versionControl.cancel')}
        autoFocus={false}
        focusLock
      >
        <Form layout="vertical">
          <Form.Item label={editor?.kind === 'create-branch' || editor?.kind === 'rename-branch'
            ? t('versionControl.branchName')
            : t('versionControl.versionName')}
          >
            <Input
              value={editorName}
              onChange={setEditorName}
              maxLength={80}
              showWordLimit
              autoFocus
              disabled={operating}
              onPressEnter={() => void submitEditor()}
            />
          </Form.Item>
          {showDescription && (
            <Form.Item label={t('versionControl.descriptionOptional')}>
              <Input.TextArea
                value={editorDescription}
                onChange={setEditorDescription}
                maxLength={500}
                showWordLimit
                autoSize={{ minRows: 3, maxRows: 6 }}
                disabled={operating}
              />
            </Form.Item>
          )}
          {editor?.kind === 'create-branch' && (
            <Paragraph type="secondary">
              {t('versionControl.branchFromHint', { name: editor.version.name })}
            </Paragraph>
          )}
        </Form>
      </Modal>
    </>
  );
}
