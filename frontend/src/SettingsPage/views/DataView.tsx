import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Typography,
  Message,
  Spin,
  Modal,
  Input,
  Popconfirm,
} from '@arco-design/web-react';
import {
  IconSafe,
  IconStorage,
} from '@arco-design/web-react/icon';
import { api } from '../../api';
import { SettingItem, SettingsViewLayout, type NavItem } from '../components';

const { Text, Paragraph } = Typography;

interface DataViewProps {
  onBack: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'backup-section', label: 'dataView.backup', icon: IconSafe },
  { key: 'storage-section', label: 'dataView.storage', icon: IconStorage },
];

const DataView = ({ onBack }: DataViewProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [vaultPath, setVaultPath] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const result = await api.createBackup();
      if (result.success) {
        Message.success(t('dataView.backupSuccess', { path: result.path }));
      } else {
        Message.error(t('dataView.backupFailed'));
      }
    } catch (err) {
      Message.error(t('dataView.backupFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const result = await api.exportData();
      const dataStr = JSON.stringify(result, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `papyrus_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Message.success(t('dataView.exportSuccess'));
    } catch (err) {
      Message.error(t('dataView.exportFailed', { error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(false);
    }
  };

  const handleImportObsidian = async () => {
    if (!vaultPath.trim()) {
      Message.error(t('dataView.vaultPathRequired'));
      return;
    }
    setLoading(true);
    try {
      const result = await api.importObsidian(vaultPath.trim());
      Message.success(t('dataView.importSuccess', { imported: result.imported, skipped: result.skipped }));
      setImportModalVisible(false);
      setVaultPath('');
    } catch (err) {
      Message.error(t('dataView.importFailed', { error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    try {
      const data = await api.resetData();
      if (data.success) {
        Message.success(t('dataView.resetSuccess'));
        window.dispatchEvent(new CustomEvent('papyrus_cards_changed'));
        window.dispatchEvent(new CustomEvent('papyrus_notes_changed'));
        window.dispatchEvent(new CustomEvent('papyrus_user_profile_changed'));
      } else {
        Message.error(t('dataView.resetFailed', { error: '' }));
      }
    } catch (err) {
      Message.error(t('dataView.resetFailed', { error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      setResetLoading(false);
    }
  };

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'backup-section':
        return (
          <>
            <SettingItem title={t('dataView.createBackup')} desc={t('dataView.createBackupDesc')}>
              <Button
                type="primary"
                shape="round"
                onClick={handleBackup}
                disabled={loading}
              >
                {loading ? <Spin size={14} /> : t('dataView.backupNow')}
              </Button>
            </SettingItem>

            <SettingItem title={t('dataView.exportData')} desc={t('dataView.exportDataDesc')}>
              <Button
                shape="round"
                onClick={handleExport}
                disabled={loading}
              >
                {loading ? <Spin size={14} /> : t('dataView.exportNow')}
              </Button>
            </SettingItem>

            <SettingItem title={t('dataView.importObsidian')} desc={t('dataView.importObsidianDesc')}>
              <Button
                shape="round"
                onClick={() => setImportModalVisible(true)}
                disabled={loading}
              >
                {t('dataView.import')}
              </Button>
            </SettingItem>

            <SettingItem title={t('dataView.resetAll')} desc={t('dataView.resetAllDesc')} divider={false}>
              <Popconfirm
                title={t('dataView.confirmReset')}
                content={t('dataView.confirmResetMessage')}
                onOk={handleReset}
              >
                <Button status="danger" shape="round" loading={resetLoading}>
                  {t('dataView.reset')}
                </Button>
              </Popconfirm>
            </SettingItem>

            <div className="settings-tip">
              <IconSafe style={{ color: 'var(--color-success)' }} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t('dataView.backupTip')}
              </Text>
            </div>
          </>
        );

      case 'storage-section':
        return (
          <>
            <SettingItem title={t('dataView.localStorage')} desc={t('dataView.localStorageDesc')}>
              <Button shape="round" onClick={() => window.electronAPI?.openDataFolder?.()}>
                {t('dataView.viewLocation')}
              </Button>
            </SettingItem>

            <SettingItem title={t('dataView.cloudSync')} desc={t('dataView.cloudSyncDesc')} divider={false}>
              <Button shape="round" disabled>
                {t('dataView.comingSoon')}
              </Button>
            </SettingItem>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <SettingsViewLayout
        title={t('dataView.title')}
        description={t('dataView.titleDesc')}
        icon={IconSafe}
        iconColor="rgb(var(--cyan-6))"
        navItems={NAV_ITEMS.map(item => ({ ...item, label: t(item.label) }))}
        sections={[
          { id: 'backup-section', title: t('dataView.backup'), icon: IconSafe },
          { id: 'storage-section', title: t('dataView.storage'), icon: IconStorage },
        ]}
        onBack={onBack}
      >
        {renderSection}
      </SettingsViewLayout>

      <Modal
        title={t('dataView.importTitle')}
        visible={importModalVisible}
        onOk={handleImportObsidian}
        onCancel={() => {
          setImportModalVisible(false);
          setVaultPath('');
        }}
        okText={t('dataView.import')}
        cancelText={t('shortcutsView.cancel')}
        confirmLoading={loading}
      >
        <div style={{ marginTop: 16 }}>
          <Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {t('dataView.importDesc')}
          </Paragraph>
          <Input
            value={vaultPath}
            onChange={setVaultPath}
            placeholder={t('dataView.importPlaceholder')}
            disabled={loading}
          />
        </div>
      </Modal>
    </>
  );
};

export default DataView;
