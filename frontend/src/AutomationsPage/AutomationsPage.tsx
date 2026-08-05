import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Select,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
} from '@arco-design/web-react';
import {
  IconCalendarClock,
  IconDelete,
  IconEdit,
  IconPlayArrow,
  IconPlus,
  IconRefresh,
} from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type {
  Automation,
  AutomationInput,
  AutomationRun,
  AutomationRunStatus,
  AutomationSchedule,
  ToolCatalogItem,
} from '../api';
import { PageLayout, ReasoningChain, ToolCallCard } from '../components';
import { MarkdownView } from '../components/MarkdownView';
import { useModelSelector } from '../hooks/useModelSelector';
import './AutomationsPage.css';

const INHERIT_MODEL = '__inherit__';

interface EditorState {
  name: string;
  prompt: string;
  enabled: boolean;
  schedule: AutomationSchedule;
  allowedTools: string[];
  providerOverride: string | null;
  modelOverride: string | null;
  reasoningMode: 'inherit' | 'on' | 'off';
}

/**
 * 创建自动化编辑器默认值。
 * 原因：函数返回新对象可避免多次打开抽屉时共享可变数组。
 * 未将默认计划放入模块常量：daysOfWeek 和 allowedTools 需要独立实例。
 */
function createDefaultEditor(readToolNames: string[]): EditorState {
  const now = new Date();
  return {
    name: '',
    prompt: '',
    enabled: true,
    schedule: { kind: 'daily', hour: now.getHours(), minute: 0 },
    allowedTools: [...readToolNames],
    providerOverride: null,
    modelOverride: null,
    reasoningMode: 'inherit',
  };
}

/**
 * 将公开自动化配置映射到受控表单状态。
 * 原因：三态推理设置需要与 API 的 nullable boolean 分开表达。
 * 未直接修改 Automation：编辑取消时必须保留服务器快照。
 */
function editorFromAutomation(automation: Automation): EditorState {
  return {
    name: automation.name,
    prompt: automation.prompt,
    enabled: automation.enabled,
    schedule: automation.schedule,
    allowedTools: [...automation.allowedTools],
    providerOverride: automation.providerOverride,
    modelOverride: automation.modelOverride,
    reasoningMode: automation.reasoningOverride === null
      ? 'inherit'
      : automation.reasoningOverride ? 'on' : 'off',
  };
}

/**
 * 根据运行状态返回语义颜色。
 * 原因：Tag 同时包含文字和颜色，满足非颜色单一表达要求。
 * 未写硬编码色值：Arco 语义色可自动适配主题。
 */
function runStatusColor(status: AutomationRunStatus): 'blue' | 'green' | 'red' | 'orange' | 'gray' {
  if (status === 'running') return 'blue';
  if (status === 'succeeded') return 'green';
  if (status === 'failed') return 'red';
  if (status === 'missed') return 'orange';
  return 'gray';
}

const AutomationsPage = () => {
  const { t, i18n } = useTranslation();
  const { models, loading: modelsLoading } = useModelSelector();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [tools, setTools] = useState<ToolCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('automations');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null);
  const [editor, setEditor] = useState<EditorState>(() => createDefaultEditor([]));

  const readTools = useMemo(() => tools.filter((tool) => tool.side_effect === 'read'), [tools]);
  const writeTools = useMemo(() => tools.filter((tool) => tool.side_effect === 'write'), [tools]);
  const readToolNames = useMemo(() => readTools.map((tool) => tool.name), [readTools]);

  // 先选择 Provider，再只展示其模型，并用稳定模型主键作为 Select 值。
  // 原因：分离选择可避免不同 Provider 的同名模型串用，也规避嵌套 OptGroup 在 React 19 下的 portal 重挂载。
  // 未把 providerType 与 modelId 拼成字符串：模型记录 ID 已稳定唯一，避免额外转义协议。
  const providerOptions = useMemo(
    () => [...new Map(models.map((model) => [model.providerType, model.providerName])).entries()],
    [models],
  );
  const providerModels = useMemo(
    () => models.filter((model) => model.providerType === editor.providerOverride),
    [editor.providerOverride, models],
  );
  const selectedOverrideModelId = useMemo(
    () => models.find((model) => (
      model.providerType === editor.providerOverride
      && model.modelId === editor.modelOverride
    ))?.id ?? INHERIT_MODEL,
    [editor.modelOverride, editor.providerOverride, models],
  );
  const hasWritePermission = useMemo(
    () => writeTools.some((tool) => editor.allowedTools.includes(tool.name)),
    [editor.allowedTools, writeTools],
  );

  /**
   * 刷新自动化、运行记录和首次所需工具目录。
   * 原因：单次并发请求减少页面进入后的布局跳动。
   * 未让轮询反复加载工具目录：目录随应用版本变化而非运行状态变化。
   */
  const loadData = useCallback(async (showError: boolean, includeTools = false) => {
    try {
      const requests = [api.listAutomations(), api.listRecentAutomationRuns(100)] as const;
      const [automationResponse, runResponse] = await Promise.all(requests);
      if (automationResponse.success) setAutomations(automationResponse.automations);
      if (runResponse.success) setRuns(runResponse.runs);
      if (includeTools) {
        const toolResponse = await api.getToolCatalog();
        if (toolResponse.success) setTools(toolResponse.tools);
      }
    } catch (error) {
      if (showError) Message.error(error instanceof Error ? error.message : t('automations.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData(true, true);
    const interval = window.setInterval(() => void loadData(false), 3000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  const formatTimestamp = (timestamp: number | null): string => {
    if (timestamp === null) return t('automations.notAvailable');
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp * 1000));
  };

  const describeSchedule = (schedule: AutomationSchedule): string => {
    const pad = (value: number) => String(value).padStart(2, '0');
    if (schedule.kind === 'hourly') {
      return t('automations.scheduleHourly', { interval: schedule.intervalHours, minute: pad(schedule.minute) });
    }
    if (schedule.kind === 'daily') {
      return t('automations.scheduleDaily', { time: `${pad(schedule.hour)}:${pad(schedule.minute)}` });
    }
    const dayLabels = schedule.daysOfWeek.map((day) => t(`automations.weekdays.${day}`)).join(t('automations.daySeparator'));
    return t('automations.scheduleWeekly', {
      days: dayLabels,
      time: `${pad(schedule.hour)}:${pad(schedule.minute)}`,
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setEditor(createDefaultEditor(readToolNames));
    setEditorVisible(true);
  };

  /**
   * 显式处理主操作按钮的 Enter 与 Space 激活。
   * 原因：部分 Electron/辅助输入注入只派发键盘事件，不会补发原生 button click。
   * 未替换原生 Button：继续保留浏览器语义、焦点顺序和鼠标/触控行为。
   */
  const openCreateFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCreate();
  };

  const openEdit = (automation: Automation) => {
    setEditingId(automation.id);
    setEditor(editorFromAutomation(automation));
    setEditorVisible(true);
  };

  const toggleTool = (toolName: string, checked: boolean) => {
    setEditor((current) => ({
      ...current,
      allowedTools: checked
        ? [...new Set([...current.allowedTools, toolName])]
        : current.allowedTools.filter((name) => name !== toolName),
    }));
  };

  const saveAutomation = async () => {
    if (!editor.name.trim() || !editor.prompt.trim()) {
      Message.error(t('automations.requiredFields'));
      return;
    }
    if (editor.schedule.kind === 'weekly' && editor.schedule.daysOfWeek.length === 0) {
      Message.error(t('automations.weekdayRequired'));
      return;
    }
    const input: AutomationInput = {
      name: editor.name.trim(),
      prompt: editor.prompt.trim(),
      enabled: editor.enabled,
      schedule: editor.schedule,
      allowedTools: editor.allowedTools,
      providerOverride: editor.providerOverride,
      modelOverride: editor.modelOverride,
      reasoningOverride: editor.reasoningMode === 'inherit' ? null : editor.reasoningMode === 'on',
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.updateAutomation(editingId, input);
        Message.success(t('automations.updated'));
      } else {
        await api.createAutomation(input);
        Message.success(t('automations.created'));
      }
      setEditorVisible(false);
      await loadData(false);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('automations.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAutomation = async (automation: Automation, enabled: boolean) => {
    try {
      await api.updateAutomation(automation.id, { enabled });
      setAutomations((current) => current.map((item) => (
        item.id === automation.id ? { ...item, enabled } : item
      )));
      await loadData(false);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('automations.updateFailed'));
    }
  };

  const runAutomation = async (automation: Automation) => {
    setRunningIds((current) => new Set(current).add(automation.id));
    try {
      await api.runAutomation(automation.id);
      Message.success(t('automations.runQueued'));
      setActiveTab('runs');
      await loadData(false);
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('automations.runFailed'));
    } finally {
      setRunningIds((current) => {
        const next = new Set(current);
        next.delete(automation.id);
        return next;
      });
    }
  };

  const confirmDelete = (automation: Automation) => {
    Modal.confirm({
      title: t('automations.deleteTitle'),
      content: t('automations.deleteConfirm', { name: automation.name }),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        await api.deleteAutomation(automation.id);
        Message.success(t('automations.deleted'));
        await loadData(false);
      },
    });
  };

  const updateScheduleKind = (kind: AutomationSchedule['kind']) => {
    setEditor((current) => ({
      ...current,
      schedule: kind === 'hourly'
        ? { kind: 'hourly', intervalHours: 1, minute: 0 }
        : kind === 'daily'
          ? { kind: 'daily', hour: 9, minute: 0 }
          : { kind: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 },
    }));
  };

  const activeCount = automations.filter((automation) => automation.enabled).length;
  const failedCount = runs.filter((run) => run.status === 'failed').length;

  const renderAutomationCards = () => {
    if (automations.length === 0) {
      return <Empty description={t('automations.empty')} className="automations-empty" />;
    }
    return (
      <div className="automations-grid">
        {automations.map((automation) => (
          <Card key={automation.id} className="automation-card" bordered>
            <div className="automation-card-header">
              <div className="automation-card-title-wrap">
                <span className="automation-card-icon" aria-hidden="true"><IconCalendarClock /></span>
                <div>
                  <Typography.Title heading={3} className="automation-card-title">{automation.name}</Typography.Title>
                  <Typography.Text type="secondary">{describeSchedule(automation.schedule)}</Typography.Text>
                </div>
              </div>
              <Switch
                checked={automation.enabled}
                onChange={(checked) => void toggleAutomation(automation, checked)}
                aria-label={t('automations.toggleLabel', { name: automation.name })}
              />
            </div>
            <Typography.Paragraph className="automation-card-prompt" ellipsis={{ rows: 3, expandable: true }}>
              {automation.prompt}
            </Typography.Paragraph>
            <div className="automation-meta-grid">
              <div><span>{t('automations.nextRun')}</span><strong>{formatTimestamp(automation.nextRunAt)}</strong></div>
              <div><span>{t('automations.lastRun')}</span><strong>{formatTimestamp(automation.lastRunAt)}</strong></div>
              <div>
                <span>{t('automations.model')}</span>
                <strong>
                  {automation.providerOverride && automation.modelOverride
                    ? automation.providerOverride + ' / ' + automation.modelOverride
                    : t('automations.inheritGlobal')}
                </strong>
              </div>
              <div><span>{t('automations.permissions')}</span><strong>{t('automations.toolCount', { count: automation.allowedTools.length })}</strong></div>
            </div>
            <div className="automation-card-actions">
              <Button
                type="primary"
                icon={<IconPlayArrow />}
                loading={runningIds.has(automation.id)}
                onClick={() => void runAutomation(automation)}
              >
                {t('automations.runNow')}
              </Button>
              <Button icon={<IconEdit />} onClick={() => openEdit(automation)}>{t('common.edit')}</Button>
              <Button
                status="danger"
                type="text"
                icon={<IconDelete />}
                aria-label={t('automations.deleteLabel', { name: automation.name })}
                onClick={() => confirmDelete(automation)}
              />
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderRuns = () => {
    if (runs.length === 0) {
      return <Empty description={t('automations.noRuns')} className="automations-empty" />;
    }
    return (
      <div className="automation-run-list">
        {runs.map((run) => {
          const automation = automations.find((item) => item.id === run.automationId);
          return (
            <button key={run.id} type="button" className="automation-run-row" onClick={() => setSelectedRun(run)}>
              <span className="automation-run-main">
                <strong>{automation?.name ?? t('automations.deletedAutomation')}</strong>
                <span>{formatTimestamp(run.createdAt)} · {t(`automations.triggers.${run.trigger}`)}</span>
              </span>
              <span className="automation-run-summary">
                <span>{run.model || t('automations.inheritGlobal')}</span>
                <Tag color={runStatusColor(run.status)}>{t(`automations.statuses.${run.status}`)}</Tag>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const editorFooter = (
    <div className="automation-drawer-footer">
      <Button onClick={() => setEditorVisible(false)}>{t('common.cancel')}</Button>
      <Button type="primary" loading={saving} onClick={() => void saveAutomation()}>{t('common.save')}</Button>
    </div>
  );

  return (
    <PageLayout
      title={t('automations.title')}
      stats={[
        { label: t('automations.total'), value: automations.length },
        { label: t('automations.active'), value: activeCount },
        { label: t('automations.failedRuns'), value: failedCount },
      ]}
      statsLoading={loading}
      actions={(
        <>
          <Button icon={<IconRefresh />} onClick={() => void loadData(true)}>{t('automations.refresh')}</Button>
          <Button
            type="primary"
            icon={<IconPlus />}
            aria-keyshortcuts="Enter Space"
            onClick={openCreate}
            onKeyDown={openCreateFromKeyboard}
          >
            {t('automations.newAutomation')}
          </Button>
        </>
      )}
    >
      <div className="automations-page-shell">
        <Tabs activeTab={activeTab} onChange={setActiveTab} type="text">
          <Tabs.TabPane key="automations" title={t('automations.automationTab')} />
          <Tabs.TabPane key="runs" title={t('automations.runsTab')} />
        </Tabs>
        {loading ? <div className="automations-loading"><Spin size={32} /></div> : (
          activeTab === 'automations' ? renderAutomationCards() : renderRuns()
        )}
      </div>

      <Drawer
        title={editingId ? t('automations.editAutomation') : t('automations.newAutomation')}
        visible={editorVisible}
        width={600}
        onCancel={() => setEditorVisible(false)}
        footer={editorFooter}
        unmountOnExit
      >
        <Form layout="vertical" className="automation-editor-form">
          <Form.Item label={t('automations.name')} required>
            <Input value={editor.name} maxLength={100} showWordLimit onChange={(name) => setEditor((current) => ({ ...current, name }))} />
          </Form.Item>
          <Form.Item label={t('automations.instructions')} required extra={t('automations.instructionsHelp')}>
            <Input.TextArea
              value={editor.prompt}
              onChange={(prompt) => setEditor((current) => ({ ...current, prompt }))}
              autoSize={{ minRows: 5, maxRows: 12 }}
              maxLength={20_000}
              showWordLimit
            />
          </Form.Item>
          <div className="automation-inline-setting">
            <div><strong>{t('automations.enabled')}</strong><span>{t('automations.enabledHelp')}</span></div>
            <Switch checked={editor.enabled} onChange={(enabled) => setEditor((current) => ({ ...current, enabled }))} />
          </div>

          <Typography.Title heading={4}>{t('automations.scheduleSection')}</Typography.Title>
          <Form.Item label={t('automations.frequency')}>
            <Select value={editor.schedule.kind} onChange={updateScheduleKind}>
              <Select.Option value="hourly">{t('automations.hourly')}</Select.Option>
              <Select.Option value="daily">{t('automations.daily')}</Select.Option>
              <Select.Option value="weekly">{t('automations.weekly')}</Select.Option>
            </Select>
          </Form.Item>
          {editor.schedule.kind === 'hourly' && (
            <div className="automation-schedule-row">
              <Form.Item label={t('automations.intervalHours')}>
                <InputNumber min={1} max={24} value={editor.schedule.intervalHours} onChange={(intervalHours) => setEditor((current) => ({
                  ...current,
                  schedule: { kind: 'hourly', intervalHours, minute: current.schedule.kind === 'hourly' ? current.schedule.minute : 0 },
                }))} />
              </Form.Item>
              <Form.Item label={t('automations.minute')}>
                <InputNumber min={0} max={59} value={editor.schedule.minute} onChange={(minute) => setEditor((current) => ({
                  ...current,
                  schedule: { kind: 'hourly', intervalHours: current.schedule.kind === 'hourly' ? current.schedule.intervalHours : 1, minute },
                }))} />
              </Form.Item>
            </div>
          )}
          {(editor.schedule.kind === 'daily' || editor.schedule.kind === 'weekly') && (
            <div className="automation-schedule-row">
              <Form.Item label={t('automations.hour')}>
                <InputNumber min={0} max={23} value={editor.schedule.hour} onChange={(hour) => setEditor((current) => ({
                  ...current,
                  schedule: current.schedule.kind === 'weekly'
                    ? { ...current.schedule, hour }
                    : { kind: 'daily', hour, minute: current.schedule.kind === 'daily' ? current.schedule.minute : 0 },
                }))} />
              </Form.Item>
              <Form.Item label={t('automations.minute')}>
                <InputNumber min={0} max={59} value={editor.schedule.minute} onChange={(minute) => setEditor((current) => ({
                  ...current,
                  schedule: current.schedule.kind === 'weekly'
                    ? { ...current.schedule, minute }
                    : { kind: 'daily', hour: current.schedule.kind === 'daily' ? current.schedule.hour : 9, minute },
                }))} />
              </Form.Item>
            </div>
          )}
          {editor.schedule.kind === 'weekly' && (
            <Form.Item label={t('automations.weekdaysLabel')} required>
              <Checkbox.Group
                value={editor.schedule.daysOfWeek}
                onChange={(days) => setEditor((current) => ({
                  ...current,
                  schedule: current.schedule.kind === 'weekly'
                    ? { ...current.schedule, daysOfWeek: days.filter((day): day is number => typeof day === 'number') }
                    : current.schedule,
                }))}
                options={[0, 1, 2, 3, 4, 5, 6].map((day) => ({ label: t(`automations.weekdays.${day}`), value: day }))}
              />
            </Form.Item>
          )}
          <Alert type="info" content={t('automations.localTimezoneHelp', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })} />

          <Typography.Title heading={4}>{t('automations.modelSection')}</Typography.Title>
          <Form.Item label={t('automations.provider')}>
            <Select
              loading={modelsLoading}
              value={editor.providerOverride ?? INHERIT_MODEL}
              onChange={(providerOverride) => setEditor((current) => ({
                ...current,
                providerOverride: providerOverride === INHERIT_MODEL ? null : providerOverride,
                modelOverride: null,
              }))}
            >
              <Select.Option value={INHERIT_MODEL}>{t('automations.inheritGlobal')}</Select.Option>
              {providerOptions.map(([providerType, providerName]) => (
                <Select.Option key={providerType} value={providerType}>{providerName}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label={t('automations.model')} extra={t('automations.modelHelp')}>
            <Select
              disabled={editor.providerOverride === null}
              loading={modelsLoading}
              value={selectedOverrideModelId === INHERIT_MODEL ? undefined : selectedOverrideModelId}
              onChange={(value) => {
                const selected = providerModels.find((model) => model.id === value);
                setEditor((current) => ({
                  ...current,
                  modelOverride: selected?.modelId ?? null,
                }));
              }}
            >
              {providerModels.map((model) => (
                <Select.Option key={model.id} value={model.id}>{model.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label={t('automations.reasoning')}>
            <Select value={editor.reasoningMode} onChange={(reasoningMode) => setEditor((current) => ({ ...current, reasoningMode }))}>
              <Select.Option value="inherit">{t('automations.inheritGlobal')}</Select.Option>
              <Select.Option value="on">{t('automations.reasoningOn')}</Select.Option>
              <Select.Option value="off">{t('automations.reasoningOff')}</Select.Option>
            </Select>
          </Form.Item>

          <Typography.Title heading={4}>{t('automations.permissionsSection')}</Typography.Title>
          <Typography.Paragraph type="secondary">{t('automations.permissionsHelp')}</Typography.Paragraph>
          <div className="automation-tool-groups">
            <div>
              <strong>{t('automations.readTools')}</strong>
              {readTools.map((tool) => (
                <Checkbox key={tool.name} checked={editor.allowedTools.includes(tool.name)} onChange={(checked) => toggleTool(tool.name, checked)}>
                  <span className="automation-tool-label"><span>{tool.name}</span><small>{tool.description}</small></span>
                </Checkbox>
              ))}
            </div>
            <div>
              <strong>{t('automations.writeTools')}</strong>
              {writeTools.map((tool) => (
                <Checkbox key={tool.name} checked={editor.allowedTools.includes(tool.name)} onChange={(checked) => toggleTool(tool.name, checked)}>
                  <span className="automation-tool-label"><span>{tool.name}</span><small>{tool.description}</small></span>
                </Checkbox>
              ))}
            </div>
          </div>
          {hasWritePermission && <Alert type="warning" content={t('automations.writeWarning')} />}
        </Form>
      </Drawer>

      <Drawer
        title={t('automations.runDetails')}
        visible={selectedRun !== null}
        width={640}
        onCancel={() => setSelectedRun(null)}
        footer={null}
      >
        {selectedRun && (
          <div className="automation-run-details">
            <Descriptions
              column={1}
              data={[
                { label: t('automations.status'), value: <Tag color={runStatusColor(selectedRun.status)}>{t(`automations.statuses.${selectedRun.status}`)}</Tag> },
                { label: t('automations.trigger'), value: t(`automations.triggers.${selectedRun.trigger}`) },
                { label: t('automations.startedAt'), value: formatTimestamp(selectedRun.startedAt) },
                { label: t('automations.finishedAt'), value: formatTimestamp(selectedRun.finishedAt) },
                { label: t('automations.model'), value: selectedRun.model || t('automations.inheritGlobal') },
                { label: t('automations.provider'), value: selectedRun.provider || t('automations.notAvailable') },
              ]}
            />
            {selectedRun.error && <Alert type="error" content={selectedRun.error} />}
            {selectedRun.output && (
              <section><Typography.Title heading={4}>{t('automations.output')}</Typography.Title><MarkdownView source={selectedRun.output} /></section>
            )}
            {selectedRun.reasoning && <ReasoningChain content={selectedRun.reasoning} />}
            {selectedRun.toolCalls.length > 0 && (
              <section>
                <Typography.Title heading={4}>{t('automations.toolCalls')}</Typography.Title>
                {selectedRun.toolCalls.map((call, index) => (
                  <ToolCallCard
                    key={`${call.name}-${index}`}
                    toolName={call.name}
                    status={call.success ? 'success' : 'failed'}
                    params={call.params}
                    result={call.result}
                    error={call.error}
                  />
                ))}
              </section>
            )}
          </div>
        )}
      </Drawer>
    </PageLayout>
  );
};

export default AutomationsPage;
