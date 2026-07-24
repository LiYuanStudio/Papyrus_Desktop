import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Switch,
  Alert,
  Button,
  Typography,
  Tag,
  Divider,
  Space,
  Tooltip,
  Message,
} from '@arco-design/web-react';
import {
  IconTool,
  IconCode,
} from '@arco-design/web-react/icon';
import { SettingItem, SettingsViewLayout, type NavItem } from '../components';
import { api, type CliStatusRes } from '../../api';

const { Text } = Typography;

const NAV_ITEMS: NavItem[] = [
  { key: 'tools-section', label: 'toolView.toolManagement', icon: IconTool },
  { key: 'cli-section', label: 'toolView.cliManagement', icon: IconCode },
];

interface ToolViewProps {
  onBack: () => void;
}

const DEFAULT_AUTO_TOOLS = [
  'search_cards', 'get_card_stats', 'search_notes', 'get_note',
  'list_relations', 'read_file', 'list_files', 'read_data_stats',
  'list_extensions', 'get_settings',
];

const ToolView = ({ onBack }: ToolViewProps) => {
  const { t } = useTranslation();

  const [toolsMode, setToolsMode] = useState<string>('manual');
  const [autoExecuteTools, setAutoExecuteTools] = useState<string[]>([]);
  const [, setToolsConfigLoading] = useState(false);
  const [toolsConfigSaving, setToolsConfigSaving] = useState(false);
  const [toolCatalog, setToolCatalog] = useState<Array<{ name: string; category: string; side_effect: string; description: string }>>([]);
  const [cliStatus, setCliStatus] = useState<CliStatusRes | null>(null);
  const [cliLoading, setCliLoading] = useState(false);
  const [cliInstalling, setCliInstalling] = useState(false);

  useEffect(() => {
    loadToolsConfig();
    loadToolCatalog();
    loadCliStatus();
  }, []);

  // 读取工具审批配置。
  // 原因：设置页需要展示当前手动/自动模式与只读白名单。
  // 未合并到目录请求：配置和工具目录属于不同后端接口，分开可避免互相阻塞。
  const loadToolsConfig = () => {
    setToolsConfigLoading(true);
    api.getToolsConfig()
      .then(data => {
        if (data.success && data.config) {
          setToolsMode(data.config.mode);
          setAutoExecuteTools(data.config.auto_execute_tools);
        }
      })
      .catch(console.error)
      .finally(() => setToolsConfigLoading(false));
  };

  // 读取 AI 工具目录。
  // 原因：白名单 UI 必须以真实后端目录为准，避免显示不可用工具。
  // 未写死工具列表：后端后续新增工具时前端可自动呈现。
  const loadToolCatalog = () => {
    api.getToolsCatalog()
      .then(data => {
        if (data.success && data.tools) {
          setToolCatalog(data.tools);
        }
      })
      .catch(console.error);
  };

  // 读取 CLI Manager 状态。
  // 原因：用户需要看到 CLI 是否安装、版本与实际路径。
  // 未直接检查本地文件：浏览器侧无权限，应通过 Desktop API 统一查询。
  const loadCliStatus = () => {
    setCliLoading(true);
    api.cliStatus()
      .then(data => setCliStatus(data))
      .catch(() => Message.error(t('toolView.cliStatusFailed')))
      .finally(() => setCliLoading(false));
  };

  // 触发 Desktop 后端安装或重装 CLI。
  // 原因：CLI 获取流程涉及 npm 下载和 manifest 写入，必须由 CLI Manager 管理。
  // 未让用户手动安装全局 npm 包：设计草案要求 Desktop 按需自动获取 CLI。
  const installCli = () => {
    setCliInstalling(true);
    api.cliInstall()
      .then(data => {
        if (data.success) {
          Message.success(t('toolView.cliInstallSuccess'));
          loadCliStatus();
        } else {
          Message.error(t('toolView.cliInstallFailed'));
        }
      })
      .catch(() => Message.error(t('toolView.cliInstallFailed')))
      .finally(() => setCliInstalling(false));
  };

  // 保存工具审批配置。
  // 原因：Agent 写操作仍需经过既有审批机制，用户应能调整只读工具自动执行范围。
  // 未绕过 ToolManager：后端 ToolManager 是审批状态的单一来源。
  const saveToolsConfig = () => {
    setToolsConfigSaving(true);
    api.saveToolsConfig({
      mode: toolsMode,
      auto_execute_tools: autoExecuteTools,
    })
      .then(data => {
        if (data.success) {
          Message.success(t('toolView.configSaved'));
        } else {
          Message.error(t('toolView.saveFailed'));
        }
      })
      .catch(() => Message.error(t('toolView.saveFailed')))
      .finally(() => setToolsConfigSaving(false));
  };

  // 恢复默认只读工具白名单。
  // 原因：用户可能误关必要只读工具，需要一键回到安全默认值。
  // 未默认加入写工具：写操作必须继续走人工审批，避免 AI 静默修改数据。
  const resetToolsConfig = () => {
    setToolsMode('manual');
    setAutoExecuteTools(DEFAULT_AUTO_TOOLS);
  };

  // 切换单个只读工具的自动执行状态。
  // 原因：白名单仅应影响安全读操作；写操作在 UI 层禁用切换。
  // 未允许写工具切换：防止用户无意中放开高风险操作。
  const toggleAutoTool = (toolName: string, sideEffect: string) => {
    if (sideEffect === 'write') return;
    setAutoExecuteTools(prev =>
      prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]
    );
  };

  // 渲染 CLI Manager 管理区。
  // 原因：草案要求设置页显示 CLI 状态、版本、路径和安装入口。
  // 未拆新页面：CLI 属于工具调用基础设施，放在工具设置中更聚合。
  const renderCliSection = () => (
    <>
      <Alert
        type="info"
        content={t('toolView.cliInfo')}
        style={{ marginBottom: 16 }}
      />
      <SettingItem title={t('toolView.cliStatus')} desc={t('toolView.cliStatusDesc')}>
        <Tag color={cliStatus?.installed ? 'green' : 'orangered'}>
          {cliStatus?.installed ? t('toolView.cliInstalled') : t('toolView.cliNotInstalled')}
        </Tag>
      </SettingItem>
      <SettingItem title={t('toolView.cliVersion')} desc={t('toolView.cliVersionDesc')}>
        <Text>{cliStatus?.version ?? '-'}</Text>
        {cliStatus?.updateAvailable && <Tag color="gold" style={{ marginLeft: 8 }}>{t('toolView.cliUpdateAvailable')}</Tag>}
      </SettingItem>
      <SettingItem title={t('toolView.cliPath')} desc={t('toolView.cliPathDesc')}>
        <Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>{cliStatus?.path ?? '-'}</Text>
      </SettingItem>
      <Space>
        <Button size="small" onClick={loadCliStatus} loading={cliLoading}>
          {t('toolView.refreshCli')}
        </Button>
        <Button type="primary" size="small" onClick={installCli} loading={cliInstalling}>
          {cliStatus?.installed ? t('toolView.reinstallCli') : t('toolView.installCli')}
        </Button>
      </Space>
    </>
  );

  // 渲染工具白名单管理区。
  // 原因：保留现有 AI 工具审批设置，同时与 CLI Manager 放在同一设置视图。
  // 未改变原交互模型：最小化改动，避免影响用户已有审批习惯。
  const renderToolsSection = () => (
    <>
      <SettingItem title={t('toolView.approvalMode')} desc={t('toolView.approvalModeDesc')}>
        <Tag color={toolsMode === 'auto' ? 'green' : 'orangered'}>
          {toolsMode === 'auto' ? t('toolView.auto') : t('toolView.manual')}
        </Tag>
        <Button
          size="mini"
          type="text"
          style={{ marginLeft: 8 }}
          onClick={() => setToolsMode(toolsMode === 'auto' ? 'manual' : 'auto')}
        >
          {toolsMode === 'auto' ? t('toolView.switchToManual') : t('toolView.switchToAuto')}
        </Button>
      </SettingItem>

      <Divider style={{ margin: '8px 0' }} />
      <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
        {t('toolView.whitelist')}
      </Text>

      {Object.entries(
        toolCatalog.reduce<Record<string, typeof toolCatalog>>((acc, t_item) => {
          if (!acc[t_item.category]) acc[t_item.category] = [];
          acc[t_item.category].push(t_item);
          return acc;
        }, {})
      ).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 12 }}>
          <Text bold style={{ fontSize: 12, color: 'var(--color-text-2)', display: 'block', marginBottom: 4 }}>
            {(() => {
              const labels: Record<string, string> = { cards: t('toolView.cards'), notes: t('toolView.notes'), relations: t('toolView.relations'), files: t('toolView.files'), data: t('toolView.data'), extensions: t('toolView.extensions'), settings: t('toolView.settings') };
              return labels[category] || category;
            })()}
          </Text>
          {items.map(tool => (
            <div key={tool.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag size="small" color={tool.side_effect === 'write' ? 'orangered' : 'green'}>
                  {tool.side_effect === 'write' ? t('chatView.write') : t('chatView.read')}
                </Tag>
                <Text style={{ fontSize: 13 }}>{tool.name}</Text>
                <Text type="secondary" style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tool.description}
                </Text>
              </div>
              <Tooltip content={tool.side_effect === 'write' ? t('chatView.writeNotAllowed') : undefined}>
                <Switch
                  size="small"
                  checked={autoExecuteTools.includes(tool.name)}
                  disabled={tool.side_effect === 'write'}
                  onChange={() => toggleAutoTool(tool.name, tool.side_effect)}
                />
              </Tooltip>
            </div>
          ))}
        </div>
      ))}

      <Divider style={{ margin: '12px 0' }} />
      <Space>
        <Button
          type="primary"
          size="small"
          onClick={saveToolsConfig}
          loading={toolsConfigSaving}
        >
          {t('toolView.saveConfig')}
        </Button>
        <Button
          type="secondary"
          size="small"
          onClick={resetToolsConfig}
        >
          {t('toolView.resetToDefault')}
        </Button>
      </Space>
    </>
  );

  const renderSection = (sectionId: string) => {
    if (sectionId === 'cli-section') return renderCliSection();
    if (sectionId === 'tools-section') return renderToolsSection();
    return null;
  };

  return (
    <SettingsViewLayout
      title={t('toolView.title')}
      description={t('toolView.titleDesc')}
      icon={IconTool}
      iconColor="var(--color-danger)"
      navItems={NAV_ITEMS.map(item => ({ ...item, label: t(item.label) }))}
      sections={[
        { id: 'tools-section', title: t('toolView.toolManagement'), icon: IconTool },
        { id: 'cli-section', title: t('toolView.cliManagement'), icon: IconCode },
      ]}
      onBack={onBack}
    >
      {renderSection}
    </SettingsViewLayout>
  );
};

export default ToolView;
