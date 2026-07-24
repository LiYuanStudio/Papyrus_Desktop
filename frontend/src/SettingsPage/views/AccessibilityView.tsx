import { useTranslation } from 'react-i18next';
import {
  Switch,
  Button,
  Typography,
} from '@arco-design/web-react';
import {
  IconBulb,
  IconEye,
  IconMoon,
  IconSun,
} from '@arco-design/web-react/icon';
import IconAccessibility from '../../icons/IconAccessibility';
import { useAccessibility } from '../../contexts/AccessibilityContext';
import { SettingItem, SettingsViewLayout, type NavItem } from '../components';

const { Text, Paragraph } = Typography;

interface AccessibilityViewProps {
  onBack: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'aa-section', label: 'accessibilityView.aaLevel', icon: IconEye },
  { key: 'aaa-section', label: 'accessibilityView.aaaLevel', icon: IconSun },
  { key: 'motion-section', label: 'accessibilityView.motion', icon: IconMoon },
  { key: 'font-section', label: 'accessibilityView.fontSizeLink', icon: IconAccessibility },
];

const AccessibilityView = ({ onBack }: AccessibilityViewProps) => {
  const { t } = useTranslation();
  const { settings, updateSetting, resetSettings } = useAccessibility();

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'aa-section':
        return (
          <>
            <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
              {t('accessibilityView.aaLevelDesc')}
            </Paragraph>
            <SettingItem
              title={t('accessibilityView.focusIndicator')}
              desc={t('accessibilityView.focusIndicatorDesc')}
              badge="AA"
              tooltip={t('accessibilityView.focusIndicatorTip')}
            >
              <Switch
                checked={settings.focusIndicator}
                onChange={(v) => updateSetting('focusIndicator', v)}
              />
            </SettingItem>

            <SettingItem
              title={t('accessibilityView.screenReader')}
              desc={t('accessibilityView.screenReaderDesc')}
              badge="AA"
              tooltip={t('accessibilityView.screenReaderTip')}
            >
              <Switch
                checked={settings.screenReaderOptimized}
                onChange={(v) => updateSetting('screenReaderOptimized', v)}
              />
            </SettingItem>

            <SettingItem
              title={t('accessibilityView.largeCursor')}
              desc={t('accessibilityView.largeCursorDesc')}
              badge="AA"
              tooltip={t('accessibilityView.largeCursorTip')}
              divider={false}
            >
              <Switch
                checked={settings.largeCursor}
                onChange={(v) => updateSetting('largeCursor', v)}
              />
            </SettingItem>
          </>
        );

      case 'aaa-section':
        return (
          <>
            <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
              {t('accessibilityView.aaaLevelDesc')}
            </Paragraph>
            <SettingItem
              title={t('accessibilityView.highContrast')}
              desc={t('accessibilityView.highContrastDesc')}
              badge="AAA"
              tooltip={t('accessibilityView.highContrastTip')}
            >
              <Switch
                checked={settings.highContrast}
                onChange={(v) => updateSetting('highContrast', v)}
              />
            </SettingItem>

            <SettingItem
              title={t('accessibilityView.readingEnhancement')}
              desc={t('accessibilityView.readingEnhancementDesc')}
              badge="AAA"
              tooltip={t('accessibilityView.readingEnhancementTip')}
            >
              <Switch
                checked={settings.readingEnhancement}
                onChange={(v) => updateSetting('readingEnhancement', v)}
              />
            </SettingItem>

            <SettingItem
              title={t('accessibilityView.sectionNav')}
              desc={t('accessibilityView.sectionNavDesc')}
              badge="AAA"
              tooltip={t('accessibilityView.sectionNavTip')}
              divider={false}
            >
              <Switch
                checked={settings.sectionNavigation}
                onChange={(v) => updateSetting('sectionNavigation', v)}
              />
            </SettingItem>
          </>
        );

      case 'motion-section':
        return (
          <>
            <SettingItem
              title={t('accessibilityView.noAnimation')}
              desc={t('accessibilityView.noAnimationDesc')}
              badge="AAA"
              tooltip={t('accessibilityView.noAnimationTip')}
              divider={false}
            >
              <Switch
                checked={settings.noAnimation}
                onChange={(v) => updateSetting('noAnimation', v)}
              />
            </SettingItem>

            <div className="settings-tip" style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: 16,
              background: 'var(--color-primary-light)',
              borderRadius: 'var(--radius-md)',
            }}>
              <IconBulb style={{ color: 'var(--color-primary)', fontSize: 20, marginTop: 2 }} />
              <div>
                <Text style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, display: 'block' }}>
                  {t('accessibilityView.systemPrefers')}
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {t('accessibilityView.systemPrefersDesc')}
                </Text>
              </div>
            </div>
          </>
        );

      case 'font-section':
        return (
          <div className="settings-tip" style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: 16,
            background: 'var(--color-fill-2)',
            borderRadius: 'var(--radius-md)',
          }}>
            <IconAccessibility style={{ color: 'var(--color-text-3)', fontSize: 20, marginTop: 2 }} />
            <div>
              <Text style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, display: 'block' }}>
                {t('accessibilityView.fontSizeLink')}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t('accessibilityView.fontSizeLinkDesc')}
              </Text>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <SettingsViewLayout
        title={t('accessibilityView.title')}
        description={t('accessibilityView.titleDesc')}
        icon={IconAccessibility}
        iconColor="rgb(var(--gold-6))"
        navItems={NAV_ITEMS.map(item => ({ ...item, label: t(item.label) }))}
        sections={[
          { id: 'aa-section', title: t('accessibilityView.aaLevel'), icon: IconEye },
          { id: 'aaa-section', title: t('accessibilityView.aaaLevel'), icon: IconSun },
          { id: 'motion-section', title: t('accessibilityView.motion'), icon: IconMoon },
          { id: 'font-section', title: t('accessibilityView.fontSizeLink'), icon: IconAccessibility },
        ]}
        onBack={onBack}
        sidebarWidth={220}
      >
        {renderSection}
      </SettingsViewLayout>

      <div style={{
        display: 'flex',
        gap: 12,
        padding: '20px 48px',
        borderTop: '1px solid var(--color-border-2)',
        position: 'absolute',
        bottom: 0,
        left: 220,
        right: 0,
        background: 'var(--color-bg-1)',
      }}>
        <Button
          type="secondary"
          onClick={resetSettings}
          style={{ borderRadius: 16 }}
        >
          {t('accessibilityView.restoreDefaults')}
        </Button>
      </div>
    </>
  );
};

export default AccessibilityView;
