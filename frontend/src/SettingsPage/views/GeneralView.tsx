import {
  Select,
  Switch,
  Button,
  Input,
  InputNumber,
  Message,
} from '@arco-design/web-react';
import {
  IconSettings,
  IconClockCircle,
  IconNotification,
  IconFile,
} from '@arco-design/web-react/icon';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingItem, SettingsViewLayout } from '../components';
import { useSettingsView } from '../../hooks/useSettingsView';
import { api } from '../../api';
import { getDateFormat, setDateFormat, type DateFormat } from '../../utils/dateFormat.js';
import { isUiLanguage, mirrorLanguageToLocalStorage, dispatchLanguageChanged, applyUiSettings } from '../../utils/uiSettings.js';

const { Option } = Select;

interface GeneralViewProps {
  onBack: () => void;
}

interface LogsConfig {
  log_dir: string;
  log_level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  log_rotation: boolean;
  max_log_files: number;
}

const NAV_ITEMS = [
  { key: 'startup-section', label: 'generalView.startup', icon: IconClockCircle },
  { key: 'language-section', label: 'generalView.language', icon: IconNotification },
  { key: 'logs-section', label: 'generalView.logs', icon: IconFile },
];

const SECTIONS = [
  { id: 'startup-section', title: 'generalView.startup' },
  { id: 'language-section', title: 'generalView.language' },
  { id: 'logs-section', title: 'generalView.logs', icon: IconFile },
];

const GeneralView = ({ onBack }: GeneralViewProps) => {
  const { t, i18n } = useTranslation();
  const { navItems, sections } = useSettingsView({ navItems: NAV_ITEMS, sections: SECTIONS });
  const [autoStart, setAutoStart] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(() => {
    const saved = localStorage.getItem('papyrus_minimize_to_tray');
    return saved !== null ? saved === 'true' : false;
  });
  const [reviewReminder, setReviewReminder] = useState(true);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('papyrus_language') ?? 'zh-CN';
  });
  const [dateFormat, setDateFormatState] = useState<DateFormat>(() => getDateFormat());

  const [logsConfig, setLogsConfig] = useState<LogsConfig>({
    log_dir: '',
    log_level: 'INFO',
    log_rotation: true,
    max_log_files: 7,
  });
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    api.getLogsConfig()
      .then(data => {
        if (data.success && data.config) {
          setLogsConfig(prev => ({ ...prev, ...data.config }));
        }
      })
      .catch(err => {
        console.error('Failed to load logs config:', err);
      });
  }, []);

  useEffect(() => {
    api.getUiSettings()
      .then(data => {
        if (data.success) {
          setLanguage(data.settings.language);
          setDateFormat(data.settings.dateFormat);
          applyUiSettings(data.settings);
        }
      })
      .catch(err => {
        console.error('Failed to load UI settings:', err);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem('papyrus_minimize_to_tray', String(minimizeToTray));
  }, [minimizeToTray]);

  const handleLanguageChange = (value: unknown) => {
    const nextLanguage = isUiLanguage(value) ? value : 'zh-CN';
    setLanguage(nextLanguage);
    mirrorLanguageToLocalStorage(nextLanguage);
    void i18n.changeLanguage(nextLanguage);
    dispatchLanguageChanged(nextLanguage);
    api.saveUiSettings({ language: nextLanguage }).catch(err => {
      Message.error(err instanceof Error ? err.message : t('generalView.saveFailed'));
    });
  };

  const saveLogsConfig = async (updates: Partial<LogsConfig>) => {
    const newConfig = { ...logsConfig, ...updates };
    setLogsConfig(newConfig);

    try {
      const data = await api.saveLogsConfig(newConfig);
      if (data.success) {
        Message.success(t('generalView.settingsSaved'));
      } else {
        Message.error(t('generalView.saveFailed'));
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('generalView.saveFailed'));
    }
  };

  const openLogsDir = async () => {
    try {
      setLogsLoading(true);
      const data = await api.openLogsDir();
      if (data.success && data.path) {
        await window.electronAPI?.openFolder?.(data.path);
      } else {
        Message.error(t('generalView.saveFailed'));
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('generalView.saveFailed'));
    } finally {
      setLogsLoading(false);
    }
  };

  const selectLogsDir = async () => {
    try {
      if (window.electronAPI?.selectFolder) {
        const result = await window.electronAPI.selectFolder(logsConfig.log_dir);
        if (!result.canceled && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0];
          await saveLogsConfig({ log_dir: selectedPath });
        }
      } else {
        const newPath = prompt(t('generalView.logDir') + ':', logsConfig.log_dir);
        if (newPath !== null) {
          await saveLogsConfig({ log_dir: newPath });
        }
      }
    } catch (err) {
      Message.error(t('generalView.saveFailed'));
    }
  };

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'startup-section':
        return (
          <>
            <SettingItem title={t('generalView.autoStart')} desc={t('generalView.autoStartDesc')}>
              <Switch checked={autoStart} onChange={setAutoStart} />
            </SettingItem>

            <SettingItem title={t('generalView.minimizeToTray')} desc={t('generalView.minimizeToTrayDesc')}>
              <Switch checked={minimizeToTray} onChange={setMinimizeToTray} />
            </SettingItem>

            <SettingItem title={t('generalView.reviewReminder')} desc={t('generalView.reviewReminderDesc')} divider={false}>
              <Switch checked={reviewReminder} onChange={setReviewReminder} />
            </SettingItem>
          </>
        );

      case 'language-section':
        return (
          <>
            <SettingItem title={t('generalView.languageLabel')} desc={t('generalView.languageDesc')}>
              <Select value={language} onChange={handleLanguageChange} style={{ width: 160 }}>
                <Option value="zh-CN">简体中文</Option>
                <Option value="zh-TW">繁體中文</Option>
                <Option value="en-US">English</Option>
                <Option value="ja-JP">日本語</Option>
              </Select>
            </SettingItem>

            <SettingItem title={t('generalView.dateFormat')} desc={t('generalView.dateFormatDesc')} divider={false}>
              <Select
                value={dateFormat}
                onChange={(value: DateFormat) => {
                  setDateFormatState(value);
                  setDateFormat(value);
                }}
                style={{ width: 160 }}
              >
                <Option value="yyyy-MM-dd">2024-06-15</Option>
                <Option value="yyyy/MM/dd">2024/06/15</Option>
                <Option value="dd/MM/yyyy">15/06/2024</Option>
                <Option value="MM/dd/yyyy">06/15/2024</Option>
              </Select>
            </SettingItem>
          </>
        );

      case 'logs-section':
        return (
          <>
            <SettingItem title={t('generalView.logDir')} desc={t('generalView.logDirDesc')}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  value={logsConfig.log_dir}
                  readOnly
                  placeholder={t('generalView.logDir')}
                  style={{ width: 280 }}
                />
                <Button
                  type="secondary"
                  size="small"
                  onClick={selectLogsDir}
                >
                  {t('generalView.selectFolder')}
                </Button>
                <Button
                  type="secondary"
                  size="small"
                  onClick={openLogsDir}
                  loading={logsLoading}
                >
                  {t('generalView.open')}
                </Button>
              </div>
            </SettingItem>

            <SettingItem title={t('generalView.logLevel')} desc={t('generalView.logLevelDesc')}>
              <Select
                value={logsConfig.log_level}
                onChange={(value) => saveLogsConfig({ log_level: value })}
                style={{ width: 160 }}
              >
                <Option value="DEBUG">DEBUG</Option>
                <Option value="INFO">INFO</Option>
                <Option value="WARNING">WARNING</Option>
                <Option value="ERROR">ERROR</Option>
              </Select>
            </SettingItem>

            <SettingItem title={t('generalView.logRotation')} desc={t('generalView.logRotationDesc')}>
              <Switch
                checked={logsConfig.log_rotation}
                onChange={(checked) => saveLogsConfig({ log_rotation: checked })}
              />
            </SettingItem>

            <SettingItem title={t('generalView.maxLogFiles')} desc={t('generalView.maxLogFilesDesc')} divider={false}>
              <InputNumber
                min={0}
                max={365}
                value={logsConfig.max_log_files}
                onChange={(value) => saveLogsConfig({ max_log_files: value as number })}
                style={{ width: 120 }}
              />
            </SettingItem>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <SettingsViewLayout
      title={t('settings.general')}
      icon={IconSettings}
      iconColor="var(--color-success)"
      navItems={navItems}
      sections={sections}
      onBack={onBack}
    >
      {renderSection}
    </SettingsViewLayout>
  );
};

export default GeneralView;
