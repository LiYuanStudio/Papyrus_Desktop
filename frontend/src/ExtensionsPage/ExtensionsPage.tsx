import { Typography, Button, Tabs, Tag, Switch, Card, Empty, Spin, Message, Upload, Drawer, Form, Input } from '@arco-design/web-react';
import { useState, useEffect, useCallback } from 'react';
import { IconArrowLeft, IconSettings, IconDelete, IconCheckCircleFill, IconDownload, IconStarFill, IconRefresh, IconUpload } from '@arco-design/web-react/icon';
import { useCommonCardStyle, CommonCard, PageLayout } from '../components';
import { PRIMARY_COLOR, SUCCESS_COLOR } from '../theme-constants';
import { api } from '../api';
import i18n from '../i18n';
import './ExtensionsPage.css';

interface Extension {
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
}

interface ExtensionStats {
  total: number;
  enabled: number;
  builtin: number;
}

/**
 * 描述扩展管理嵌入设置页时可用的返回动作。
 * 原因：扩展管理不再是顶级页面，需要明确路径返回设置分类首页。
 * 未依赖浏览器历史：应用使用内部页面状态而非 URL 路由，浏览器后退无法可靠恢复分类层级。
 */
interface ExtensionsPageProps {
  onBack?: () => void;
}

const ExtensionCard = ({ ext, onToggle, onUninstall, onSettings }: { ext: Extension; onToggle?: (enabled: boolean) => void; onUninstall?: () => void; onSettings?: () => void }) => {
  const { hovered, setHovered, cardStyle } = useCommonCardStyle({
    borderWidth: 1,
  });

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          background: ext.isEnabled ? PRIMARY_COLOR : 'var(--color-fill-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ext.isEnabled ? '#fff' : 'var(--color-text-2)',
          fontSize: '20px',
          fontWeight: 600,
        }}>
          {ext.name.charAt(0)}
        </div>
        <Switch size='small' checked={ext.isEnabled} onChange={onToggle} disabled={ext.isBuiltin} />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Typography.Text bold style={{ fontSize: '15px' }}>{ext.name}</Typography.Text>
          {ext.isBuiltin && <Tag size='small' color='arcoblue' style={{ fontSize: '10px' }}>内置</Tag>}
          {ext.isEnabled && <IconCheckCircleFill style={{ fontSize: '14px', color: SUCCESS_COLOR }} />}
          {ext.updateAvailable && <Tag size='small' color='green' style={{ fontSize: '10px' }}>更新</Tag>}
        </div>
        <Typography.Text type='secondary' style={{ fontSize: '13px', lineHeight: 1.5 }}>
          {ext.description}
        </Typography.Text>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {ext.tags.map(tag => <Tag key={tag} size='small' style={{ fontSize: '11px' }}>{tag}</Tag>)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px', fontSize: '12px', color: 'var(--color-text-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IconStarFill style={{ fontSize: '12px', color: '#FF7D00' }} />
            {ext.rating}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IconDownload style={{ fontSize: '12px' }} />
            {ext.downloads > 1000 ? `${(ext.downloads / 1000).toFixed(1)}k` : ext.downloads}
          </span>
        </div>
        <span>v{ext.version}</span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <Button type='secondary' size='small' icon={<IconSettings />} style={{ flex: 1 }} onClick={onSettings}>设置</Button>
        {!ext.isBuiltin && <Button type='secondary' size='small' status='danger' icon={<IconDelete />} onClick={onUninstall} />}
      </div>
    </CommonCard>
  );
};

const SettingItem = ({ title, description, defaultChecked }: { title: string; description: string; defaultChecked?: boolean }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid var(--color-border-2)' }}>
    <div>
      <Typography.Text bold style={{ display: 'block', marginBottom: '8px' }}>{title}</Typography.Text>
      <Typography.Text type='secondary' style={{ fontSize: '13px' }}>{description}</Typography.Text>
    </div>
    <Switch defaultChecked={defaultChecked} />
  </div>
);

type TabPhase = 'idle' | 'exit' | 'enter';

const ExtensionsPage = ({ onBack }: ExtensionsPageProps) => {
  const [activeTab, setActiveTab] = useState('installed');
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [, setStats] = useState<ExtensionStats>({ total: 0, enabled: 0, builtin: 0 });
  const [tabPhase, setTabPhase] = useState<TabPhase>('idle');
  const [exitDirection, setExitDirection] = useState<'left' | 'right'>('left');
  const [loading, setLoading] = useState(true);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);
  const [configText, setConfigText] = useState('{}');

  const loadExtensions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.getExtensionsList();
      if (response.success) {
        setExtensions(response.extensions as Extension[]);
        const extResponse = response as { success: boolean; extensions: Extension[]; count: number; stats?: ExtensionStats };
        if (extResponse.stats) {
          setStats(extResponse.stats);
        } else {
          const total = extResponse.extensions.length;
          const enabled = extResponse.extensions.filter((e: Extension) => e.isEnabled).length;
          const builtin = extResponse.extensions.filter((e: Extension) => e.isBuiltin).length;
          setStats({ total, enabled, builtin });
        }
      }
    } catch (error) {
      Message.error(i18n.t('extensions.loadFailed'));
      console.error('Failed to load extensions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'installed') {
      loadExtensions();
    }
  }, [activeTab, loadExtensions]);

  const handleTabChange = (newTab: string) => {
    if (tabPhase !== 'idle') return;

    const tabsOrder = ['installed', 'market', 'settings'];
    const currentIndex = tabsOrder.indexOf(activeTab);
    const newIndex = tabsOrder.indexOf(newTab);

    const direction: 'left' | 'right' = newIndex > currentIndex ? 'left' : 'right';
    setExitDirection(direction);
    setTabPhase('exit');

    setTimeout(() => {
      setActiveTab(newTab);
      setTabPhase('enter');
    }, 200);

    setTimeout(() => {
      setTabPhase('idle');
    }, 400);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/extensions/${id}/enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      if (data.success) {
        setExtensions(prev => prev.map(ext =>
          ext.id === id ? { ...ext, isEnabled: enabled } : ext
        ));
        setStats(prev => ({
          ...prev,
          enabled: prev.enabled + (enabled ? 1 : -1),
        }));
        Message.success(data.message);
      } else {
        Message.error(data.error || i18n.t('extensions.operationFailed'));
      }
    } catch (error) {
      Message.error(i18n.t('extensions.operationFailed'));
      console.error('Failed to toggle extension:', error);
    }
  };

  const handleUninstall = async (id: string) => {
    const ext = extensions.find(e => e.id === id);
    if (!ext) return;

    try {
      const response = await fetch(`/api/extensions/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setExtensions(prev => prev.filter(e => e.id !== id));
        setStats(prev => ({
          ...prev,
          total: prev.total - 1,
          enabled: prev.enabled - (ext.isEnabled ? 1 : 0),
        }));
        Message.success(i18n.t('extensions.uninstallSuccess'));
      } else {
        Message.error(data.error || i18n.t('extensions.uninstallFailed'));
      }
    } catch (error) {
      Message.error(i18n.t('extensions.uninstallFailed'));
      console.error('Failed to uninstall extension:', error);
    }
  };

  const handleSettings = (ext: Extension) => {
    setSelectedExtension(ext);
    setConfigText(JSON.stringify(ext.config ?? {}, null, 2));
    setConfigVisible(true);
  };

  const handleSaveConfig = async () => {
    if (!selectedExtension) return;
    try {
      const parsedConfig = JSON.parse(configText) as Record<string, unknown>;
      const response = await api.updateExtensionConfig(selectedExtension.id, parsedConfig);
      if (response.success) {
        Message.success(i18n.t('extensions.configSaved'));
        setExtensions(prev => prev.map(ext =>
          ext.id === selectedExtension.id ? { ...ext, config: parsedConfig } : ext
        ));
        setConfigVisible(false);
      }
    } catch (error) {
      Message.error(i18n.t('extensions.invalidJson'));
      console.error('Failed to save extension config:', error);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.split(',')[1] ?? '' : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleLocalInstall = async (file: File) => {
    try {
      setInstalling(true);
      console.log('[extensions] local install selected:', file.name);
      const content = await fileToBase64(file);
      const response = await api.installLocalExtension(file.name, content);
      if (response.success) {
        Message.success(response.message);
        await loadExtensions();
        setActiveTab('installed');
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : i18n.t('extensions.localInstallFailed'));
      console.error('Failed to install local extension:', error);
    } finally {
      setInstalling(false);
    }
    return false;
  };

  const handleCheckUpdates = async () => {
    try {
      setCheckingUpdates(true);
      const response = await fetch('/api/extensions/check-updates', {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        if (data.updateCount > 0) {
          Message.success(i18n.t('extensions.updatesFound', { count: data.updateCount }));
        } else {
          Message.info(i18n.t('extensions.allUpToDate'));
        }
        loadExtensions();
      }
    } catch (error) {
      Message.error(i18n.t('extensions.checkUpdateFailed'));
      console.error('Failed to check updates:', error);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const enabledCount = extensions.filter(e => e.isEnabled).length;
  const updateCount = extensions.filter(e => e.updateAvailable).length;

  const getAnimationClass = () => {
    if (tabPhase === 'exit') {
      return exitDirection === 'left' ? 'extensions-tab-exit-left' : 'extensions-tab-exit-right';
    }
    if (tabPhase === 'enter') {
      return exitDirection === 'left' ? 'extensions-tab-enter-left' : 'extensions-tab-enter-right';
    }
    return '';
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', paddingTop: '80px' }}>
          <Spin size={32} />
        </div>
      );
    }

    return (
      <div className={`extensions-tab-content ${getAnimationClass()}`}>
        {activeTab === 'installed' && (
          <Upload
            drag
            accept=".zip,application/zip"
            showUploadList={false}
            beforeUpload={(file) => handleLocalInstall(file)}
            style={{ marginBottom: '16px' }}
          >
            <div style={{ padding: '18px 0' }}>
              <IconUpload style={{ fontSize: 24, color: PRIMARY_COLOR }} />
              <Typography.Text style={{ display: 'block', marginTop: 8 }}>
                拖拽 zip 到这里，或点击选择本地扩展包
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                manifest 最小字段：id、name、version、type
              </Typography.Text>
            </div>
          </Upload>
        )}
        {activeTab === 'installed' && (
          extensions.length === 0 ? (
            <Empty description="暂无已安装扩展" style={{ marginTop: '48px' }} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {extensions.map(ext => (
                <ExtensionCard
                  key={ext.id}
                  ext={ext}
                  onToggle={(enabled) => handleToggle(ext.id, enabled)}
                  onUninstall={() => handleUninstall(ext.id)}
                  onSettings={() => handleSettings(ext)}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'market' && (
          <Empty description="扩展商店即将上线" style={{ marginTop: '48px' }} />
        )}

        {activeTab === 'settings' && (
          <Card style={{ borderRadius: '16px', border: '1px solid var(--color-text-3)' }}>
            <Typography.Title heading={3} style={{ margin: '0 0 24px', fontWeight: 500, fontSize: '18px' }}>扩展设置</Typography.Title>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <SettingItem title='自动更新' description='自动检查并安装扩展更新' defaultChecked />
              <SettingItem title='开发者模式' description='允许安装未在商店上架的扩展' />
            </div>
          </Card>
        )}
      </div>
    );
  };

  const pageStats = [
    { label: '已安装', value: extensions.length },
    { label: '已启用', value: enabledCount },
  ];

  const extraStatsContent = (
    <div style={{ display: 'flex', gap: 8 }}>
      <Upload
        accept=".zip,application/zip"
        showUploadList={false}
        beforeUpload={(file) => handleLocalInstall(file)}
      >
        <Button shape='round' icon={<IconUpload />} loading={installing}>
          本地安装
        </Button>
      </Upload>
      <Button
        shape='round'
        type='primary'
        icon={<IconRefresh />}
        loading={checkingUpdates}
        onClick={handleCheckUpdates}
        style={{
          backgroundColor: PRIMARY_COLOR,
          borderRadius: '20px',
        }}
      >
        {updateCount > 0 ? `检查更新 (${updateCount})` : '检查更新'}
      </Button>
    </div>
  );

  return (
    <PageLayout
      title='扩展管理'
      pageKey='extensions'
      stats={pageStats}
      extraStatsContent={extraStatsContent}
      actions={onBack ? (
        <Button type="text" icon={<IconArrowLeft />} onClick={onBack}>
          返回设置
        </Button>
      ) : undefined}
    >
      <Tabs
        activeTab={activeTab}
        onChange={handleTabChange}
        type='text'
        style={{ marginBottom: '24px' }}
      >
        <Tabs.TabPane key='installed' title={<>已安装 <Tag size='small' style={{ marginLeft: '8px' }}>{extensions.length}</Tag></>} />
        <Tabs.TabPane key='market' title={<>扩展商店 <Tag size='small' style={{ marginLeft: '8px' }}>0</Tag></>} />
        <Tabs.TabPane key='settings' title='设置' />
      </Tabs>

      <div className="extensions-tab-container">
        {renderContent()}
      </div>
      <Drawer
        title={selectedExtension ? `${selectedExtension.name} 配置` : '扩展配置'}
        visible={configVisible}
        width={520}
        onCancel={() => setConfigVisible(false)}
        footer={(
          <div style={{ textAlign: 'right' }}>
            <Button style={{ marginRight: 8 }} onClick={() => setConfigVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveConfig}>保存</Button>
          </div>
        )}
      >
        <Form layout="vertical">
          <Form.Item label="JSON 配置">
            <Input.TextArea
              value={configText}
              onChange={setConfigText}
              autoSize={{ minRows: 12, maxRows: 20 }}
              placeholder='{"enabled": true}'
            />
          </Form.Item>
        </Form>
      </Drawer>
    </PageLayout>
  );
};

export default ExtensionsPage;
