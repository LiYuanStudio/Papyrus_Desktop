import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  Button,
  Typography,
  Tag,
  Spin,
  Message,
} from '@arco-design/web-react';
import {
  IconArrowLeft,
  IconInfoCircle,
  IconGithub,
  IconHeart,
  IconCheckCircle,
  IconExclamationCircle,
} from '@arco-design/web-react/icon';
import { api } from '../../api';
import type { VersionInfo } from '../../api';
import { formatDateBySetting } from '../../utils/dateFormat.js';
import './AboutView.css';

const { Title, Text, Paragraph } = Typography;

interface AboutViewProps {
  onBack: () => void;
}

declare const __APP_VERSION__: string;
declare global {
  interface Window {
    appVersion?: string;
  }
}

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : (window.appVersion || 'unknown');

const AboutView = ({ onBack }: AboutViewProps) => {
  const { t } = useTranslation();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<'idle' | 'update' | 'latest' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchCurrentVersion();
  }, []);

  const fetchCurrentVersion = async () => {
    try {
      const data = await api.getVersion();
      setVersionInfo({
        current_version: APP_VERSION,
        latest_version: APP_VERSION,
        has_update: false,
        release_url: data.repository,
        download_url: '',
        release_notes: null,
        published_at: null,
      });
    } catch (error) {
      console.error(t('aboutView.fetchVersionFailed'), error);
    }
  };

  const handleCheckUpdate = async () => {
    setIsChecking(true);
    setCheckResult('idle');
    setErrorMessage('');

    try {
      const result = await api.checkUpdate();

      if (result.success && result.data) {
        // 当前版本必须来自安装包自身，而不是可能残留在固定端口上的旧后端进程。
        // 原因：升级后若旧后端尚未退出，其 /version 会让新 UI 回退显示旧版本号。
        // 未直接信任 result.data.current_version：该字段描述响应后端，不一定描述当前 Electron App。
        setVersionInfo({ ...result.data, current_version: APP_VERSION });
        if (result.data.has_update) {
          setCheckResult('update');
          Message.info(t('aboutView.updateAvailable', { version: result.data.latest_version }));
        } else {
          setCheckResult('latest');
          Message.success(t('aboutView.latestVersion'));
        }
      } else {
        setCheckResult('error');
        const errMsg = result.message || t('aboutView.updateCheckFailed');
        setErrorMessage(errMsg);
        Message.error(errMsg);
      }
    } catch (error) {
      setCheckResult('error');
      const msg = error instanceof Error ? error.message : t('aboutView.updateCheckFailed');
      setErrorMessage(msg);
      Message.error(msg);
    } finally {
      setIsChecking(false);
    }
  };

  const ALLOWED_EXTERNAL_DOMAINS = ['github.com', 'githubusercontent.com'];

  const isAllowedExternalUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ALLOWED_EXTERNAL_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain));
    } catch {
      return false;
    }
  };

  const handleDownload = () => {
    const url = versionInfo?.download_url || versionInfo?.release_url;
    if (url && isAllowedExternalUrl(url)) {
      window.open(url, '_blank');
    } else if (url) {
      Message.warning(t('aboutView.downloadBlocked'));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return formatDateBySetting(dateStr);
  };

  const truncateReleaseNotes = (notes: string | null) => {
    if (!notes) return '';
    if (notes.length <= 200) return notes;
    return notes.substring(0, 200) + '...';
  };

  return (
    <div className="settings-detail about-view">
      <div className="settings-detail-header-row">
        <Button
          type="text"
          icon={<IconArrowLeft />}
          onClick={onBack}
          className="settings-back-btn"
        >
          {t('aboutView.back')}
        </Button>
      </div>
      <Title heading={2} className="settings-detail-title">{t('aboutView.title')}</Title>

      <div className="settings-section about-hero">
        <img
          src="./icon.png"
          alt="Papyrus Desktop"
          className="about-logo"
        />
        <Title heading={3} className="about-app-name">{t('aboutView.appName')}</Title>
        <Text type="secondary" className="about-version">
          {t('aboutView.version', { version: versionInfo?.current_version || APP_VERSION })}
        </Text>
        <Paragraph type="secondary" className="about-description">
          {t('aboutView.description')}
        </Paragraph>

        <div className="about-actions">
          {checkResult === 'update' ? (
            <Button
              type="primary"
              shape="round"
              status="success"
              icon={<IconExclamationCircle />}
              onClick={handleDownload}
            >
              {t('aboutView.downloadUpdate')}
            </Button>
          ) : (
            <Button
              type="primary"
              shape="round"
              onClick={handleCheckUpdate}
              disabled={isChecking}
              icon={isChecking ? <Spin size={14} /> : <IconCheckCircle />}
            >
              {isChecking ? t('aboutView.checking') : t('aboutView.checkUpdate')}
            </Button>
          )}
          <Button
            shape="round"
            onClick={() => {
              if (isAllowedExternalUrl('https://github.com/PapyrusOR/Papyrus_Desktop')) {
                window.open('https://github.com/PapyrusOR/Papyrus_Desktop', '_blank');
              }
            }}
          >
            <IconGithub className="about-github-icon" />
            {t('aboutView.github')}
          </Button>
        </div>

        {checkResult === 'latest' && (
          <div className="about-status-badge success">
            <IconCheckCircle className="about-status-icon success" />
            <Text className="about-status-text success">
              {t('aboutView.latestVersion')}
            </Text>
          </div>
        )}

        {checkResult === 'error' && (
          <div className="about-status-badge error">
            <IconExclamationCircle className="about-status-icon error" />
            <Text className="about-status-text error">
              {errorMessage || t('aboutView.updateCheckFailed')}
            </Text>
          </div>
        )}
      </div>

      {checkResult === 'update' && versionInfo?.has_update && (
        <div
          className="settings-section about-update-card"
        >
          <Title heading={4} className="settings-section-title about-update-title">
            <IconInfoCircle className="about-update-title-icon" />
            {t('aboutView.newVersionTitle')}
          </Title>
          <div className="about-update-version-row">
            <Text bold className="about-update-version">{versionInfo.latest_version}</Text>
            {versionInfo.published_at && (
              <Text type="secondary" className="about-update-date">
                {t('aboutView.publishedAt', { date: formatDate(versionInfo.published_at) })}
              </Text>
            )}
          </div>
          {versionInfo.release_notes && (
            <div className="about-release-notes">
              <Paragraph className="about-release-notes-text">
                {truncateReleaseNotes(versionInfo.release_notes)}
              </Paragraph>
            </div>
          )}
          <Button type="primary" onClick={handleDownload}>
            {t('aboutView.goToDownload')}
          </Button>
        </div>
      )}

      <div className="settings-section">
        <Title heading={4} className="settings-section-title">{t('aboutView.acknowledgements')}</Title>
        <Paragraph type="secondary" className="about-paragraph">
          {t('aboutView.acknowledgementsDesc')}
        </Paragraph>
        <div className="about-tech-tags">
          {['React', 'Arco Design', 'Electron', 'Node.js'].map(tech => (
            <Tag key={tech} color="arcoblue">{tech}</Tag>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <Title heading={4} className="settings-section-title">{t('aboutView.license')}</Title>
        <Paragraph type="secondary" className="about-paragraph">
          {t('aboutView.licenseDesc')}
        </Paragraph>
      </div>

      <div className="settings-tip about-tip">
        <IconHeart className="about-tip-icon" />
        <Text type="secondary" className="about-tip-text">
          {t('aboutView.starTip')}
        </Text>
      </div>
    </div>
  );
};

export default AboutView;
