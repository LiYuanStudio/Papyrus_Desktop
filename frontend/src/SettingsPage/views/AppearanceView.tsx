import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Input,
  Switch,
  Button,
  Slider,
  Form,
  Modal,
  Radio,
  Typography,
} from '@arco-design/web-react';
import {
  IconFileImage,
  IconPalette,
  IconPlus,
} from '@arco-design/web-react/icon';
import { SettingItem, SettingsViewLayout } from '../components';
import { useSettingsView } from '../../hooks/useSettingsView';
import { api, type UiFontSize } from '../../api';
import {
  useSceneryManager,
  usePageScenery,
  useStartPageScenery,
  type PageType,
} from '../../hooks/useScenery';
import {
  applyFontSizeToDom,
  dispatchFontSizeChanged,
  isUiFontSize,
  mirrorFontSizeToLocalStorage,
  readStoredFontSize,
} from '../../utils/uiSettings';

const FormItem = Form.Item;
const { Title, Text, Paragraph } = Typography;
const RadioGroup = Radio.Group;

interface AppearanceViewProps {
  onBack: () => void;
}

const FONT_SIZE_OPTIONS = (t: (key: string) => string) => [
  { label: t('appearanceView.fontSizeSmall'), value: 'small' },
  { label: t('appearanceView.fontSizeMedium'), value: 'medium' },
  { label: t('appearanceView.fontSizeLarge'), value: 'large' },
];

const NAV_ITEMS = [
  { key: 'theme-section', label: 'appearanceView.theme', icon: IconPalette },
  { key: 'scenery-section', label: 'appearanceView.scenery', icon: IconFileImage },
];

const SECTIONS = [
  { id: 'theme-section', title: 'appearanceView.themeSection' },
  { id: 'scenery-section', title: 'appearanceView.scenerySection', icon: IconFileImage },
];

const AppearanceView = ({ onBack }: AppearanceViewProps) => {
  const { t } = useTranslation();
  const { navItems, sections } = useSettingsView({ navItems: NAV_ITEMS, sections: SECTIONS });
  const [fontSize, setFontSize] = useState<UiFontSize>(() => readStoredFontSize());

  useEffect(() => {
    api.getUiSettings()
      .then(data => {
        if (data.success) {
          setFontSize(data.settings.fontSize);
          mirrorFontSizeToLocalStorage(data.settings.fontSize);
          applyFontSizeToDom(data.settings.fontSize);
        }
      })
      .catch(err => {
        console.error('Failed to load UI settings:', err);
      });
  }, []);

  const handleFontSizeChange = (value: unknown) => {
    const nextFontSize = isUiFontSize(value) ? value : 'medium';
    setFontSize(nextFontSize);
    mirrorFontSizeToLocalStorage(nextFontSize);
    applyFontSizeToDom(nextFontSize);
    dispatchFontSizeChanged(nextFontSize);
    api.saveUiSettings({ fontSize: nextFontSize }).catch(err => {
      console.error('Failed to save UI settings:', err);
    });
  };

  const { allSceneries, addCustomScenery } = useSceneryManager();
  const startPageScenery = useStartPageScenery();
  const notesScenery = usePageScenery('notes');
  const scrollScenery = usePageScenery('scroll');
  const filesScenery = usePageScenery('files');
  const extensionsScenery = usePageScenery('extensions');
  const chartsScenery = usePageScenery('charts');

  const [addSceneryModalVisible, setAddSceneryModalVisible] = useState(false);
  const [sceneryForm] = Form.useForm();
  const [, setActiveSceneryPage] = useState<PageType>('scroll');

  const handleAddCustomScenery = () => {
    sceneryForm.validate().then((values: { name: string; imageUrl: string; poem?: string; source?: string }) => {
      addCustomScenery(values.name, values.imageUrl, values.poem, values.source);
      setAddSceneryModalVisible(false);
      sceneryForm.resetFields();
    });
  };

  const handleOpenAddScenery = (pageKey: PageType) => {
    setActiveSceneryPage(pageKey);
    setAddSceneryModalVisible(true);
  };

  const renderThemeSection = () => (
    <>
      <SettingItem title={t('appearanceView.fontSize')} desc={t('appearanceView.fontSizeDesc')}>
        <RadioGroup
          type="button"
          value={fontSize}
          onChange={handleFontSizeChange}
          options={FONT_SIZE_OPTIONS(t)}
        />
      </SettingItem>

      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        background: 'var(--color-fill-2)',
        borderRadius: 'var(--radius-md)',
        marginTop: 8,
      }}>
        <IconPalette style={{ color: 'var(--color-text-3)', fontSize: 20, marginTop: 2 }} />
        <div>
          <Text style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 4, display: 'block' }}>
            {t('appearanceView.themeSwitch')}
          </Text>
          <Paragraph type="secondary" style={{ fontSize: 'var(--font-size-sm)', margin: 0 }}>
            {t('appearanceView.themeSwitchDesc')}
          </Paragraph>
        </div>
      </div>
    </>
  );

  const renderScenerySection = () => (
    <>
      <SettingItem title={t('appearanceView.sceneryStartPage')} desc={t('appearanceView.sceneryStartPageDesc')}>
        <Switch
          size="small"
          checked={startPageScenery.config.enabled}
          onChange={(checked) => startPageScenery.updateConfig({ enabled: checked })}
        />
      </SettingItem>

      {startPageScenery.config.enabled && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 'var(--font-size-sm)' }}>{t('appearanceView.scenerySelectImage')}</Text>
            <Button
              type="primary"
              size="mini"
              icon={<IconPlus />}
              onClick={() => handleOpenAddScenery('scroll')}
              style={{ borderRadius: '999px' }}
            >
              {t('appearanceView.sceneryAddImage')}
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allSceneries.map((item) => (
              <div
                key={item.id}
                onClick={() => startPageScenery.updateConfig({ image: item.image, name: item.name, poem: item.poem, source: item.source })}
                style={{
                  width: 80,
                  height: 45,
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: startPageScenery.config.image === item.image ? '2px solid var(--color-primary)' : '2px solid transparent',
                  position: 'relative',
                  background: 'var(--color-fill-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                role="button"
                tabIndex={0}
                aria-label={`${t('appearanceView.scenerySelectImage')} ${item.name}`}
                onKeyDown={(e) => e.key === 'Enter' && startPageScenery.updateConfig({ image: item.image, name: item.name, poem: item.poem, source: item.source })}
              >
                <img
                  src={item.image}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                {startPageScenery.config.image === item.image && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 'var(--font-size-sm)', minWidth: 60 }}>{t('appearanceView.sceneryOpacity')}</Text>
            <Slider
              min={25}
              max={75}
              step={5}
              value={Math.round((startPageScenery.config.opacity ?? 0.35) * 100)}
              onChange={(val) => startPageScenery.updateConfig({ opacity: (val as number) / 100 })}
              style={{ flex: 1, maxWidth: 150 }}
            />
            <Text style={{ fontSize: 'var(--font-size-sm)', minWidth: 40 }}>
              {Math.round((startPageScenery.config.opacity ?? 0.35) * 100)}%
            </Text>
          </div>

          <div style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 'var(--font-size-sm)', marginBottom: 8, display: 'block' }}>{t('appearanceView.sceneryPoem')}</Text>
            <Input.TextArea
              placeholder={t('appearanceView.sceneryPoemPlaceholder')}
              value={startPageScenery.config.poem || ''}
              onChange={(val) => startPageScenery.updateConfig({ poem: val })}
              autoSize={{ minRows: 2, maxRows: 4 }}
              style={{ fontSize: 'var(--font-size-sm)' }}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 'var(--font-size-sm)', marginBottom: 8, display: 'block' }}>{t('appearanceView.scenerySource')}</Text>
            <Input
              placeholder={t('appearanceView.scenerySourcePlaceholder')}
              value={startPageScenery.config.source || ''}
              onChange={(val) => startPageScenery.updateConfig({ source: val })}
              style={{ fontSize: 'var(--font-size-sm)' }}
            />
          </div>
        </div>
      )}

      <SettingItem title={t('appearanceView.sceneryNotesPage')} desc={t('appearanceView.sceneryNotesPageDesc')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            size="small"
            checked={notesScenery.config.enabled}
            onChange={(checked) => notesScenery.updateConfig({ enabled: checked })}
          />
          {notesScenery.config.enabled && (
            <Button
              type="primary"
              size="mini"
              icon={<IconPlus />}
              onClick={() => handleOpenAddScenery('notes')}
              style={{ borderRadius: '999px' }}
            >
              {t('appearanceView.configure')}
            </Button>
          )}
        </div>
      </SettingItem>

      <SettingItem title={t('appearanceView.sceneryScrollPage')} desc={t('appearanceView.sceneryScrollPageDesc')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            size="small"
            checked={scrollScenery.config.enabled}
            onChange={(checked) => scrollScenery.updateConfig({ enabled: checked })}
          />
          {scrollScenery.config.enabled && (
            <Button
              type="primary"
              size="mini"
              icon={<IconPlus />}
              onClick={() => handleOpenAddScenery('scroll')}
              style={{ borderRadius: '999px' }}
            >
              {t('appearanceView.configure')}
            </Button>
          )}
        </div>
      </SettingItem>

      <SettingItem title={t('appearanceView.sceneryFilesPage')} desc={t('appearanceView.sceneryFilesPageDesc')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            size="small"
            checked={filesScenery.config.enabled}
            onChange={(checked) => filesScenery.updateConfig({ enabled: checked })}
          />
          {filesScenery.config.enabled && (
            <Button
              type="primary"
              size="mini"
              icon={<IconPlus />}
              onClick={() => handleOpenAddScenery('files')}
              style={{ borderRadius: '999px' }}
            >
              {t('appearanceView.configure')}
            </Button>
          )}
        </div>
      </SettingItem>

      <SettingItem title={t('appearanceView.sceneryExtensionsPage')} desc={t('appearanceView.sceneryExtensionsPageDesc')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            size="small"
            checked={extensionsScenery.config.enabled}
            onChange={(checked) => extensionsScenery.updateConfig({ enabled: checked })}
          />
          {extensionsScenery.config.enabled && (
            <Button
              type="primary"
              size="mini"
              icon={<IconPlus />}
              onClick={() => handleOpenAddScenery('extensions')}
              style={{ borderRadius: '999px' }}
            >
              {t('appearanceView.configure')}
            </Button>
          )}
        </div>
      </SettingItem>

      <SettingItem title={t('appearanceView.sceneryChartsPage')} desc={t('appearanceView.sceneryChartsPageDesc')} divider={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Switch
            size="small"
            checked={chartsScenery.config.enabled}
            onChange={(checked) => chartsScenery.updateConfig({ enabled: checked })}
          />
          {chartsScenery.config.enabled && (
            <Button
              type="primary"
              size="mini"
              icon={<IconPlus />}
              onClick={() => handleOpenAddScenery('charts')}
              style={{ borderRadius: '999px' }}
            >
              {t('appearanceView.configure')}
            </Button>
          )}
        </div>
      </SettingItem>
    </>
  );

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'theme-section':
        return renderThemeSection();
      case 'scenery-section':
        return renderScenerySection();
      default:
        return null;
    }
  };

  return (
    <>
      <SettingsViewLayout
        title={t('settings.appearance')}
        description={t('appearanceView.titleDesc')}
        icon={IconPalette}
        iconColor="var(--color-primary)"
        navItems={navItems}
        sections={sections}
        onBack={onBack}
      >
        {renderSection}
      </SettingsViewLayout>

      <Modal
        title={t('appearanceView.addCustomScenery')}
        visible={addSceneryModalVisible}
        onOk={handleAddCustomScenery}
        onCancel={() => { setAddSceneryModalVisible(false); sceneryForm.resetFields(); }}
        autoFocus={false}
        focusLock
      >
        <Form form={sceneryForm} layout="vertical">
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('appearanceView.customSceneryName')}</Title>}
            field="name"
            rules={[{ required: true, message: t('appearanceView.customSceneryNamePlaceholder') }]}
          >
            <Input placeholder={t('appearanceView.customSceneryNamePlaceholder')} />
          </FormItem>
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('appearanceView.customSceneryUrl')}</Title>}
            field="imageUrl"
            rules={[{ required: true, message: t('appearanceView.customSceneryUrlPlaceholder') }]}
          >
            <Input placeholder={t('appearanceView.customSceneryUrlPlaceholder')} />
          </FormItem>
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('appearanceView.customSceneryPoem')}</Title>}
            field="poem"
          >
            <Input.TextArea placeholder={t('appearanceView.sceneryPoemPlaceholder')} autoSize={{ minRows: 2, maxRows: 4 }} />
          </FormItem>
          <FormItem
            label={<Title heading={6} style={{ margin: 0 }}>{t('appearanceView.customScenerySource')}</Title>}
            field="source"
          >
            <Input placeholder={t('appearanceView.scenerySourcePlaceholder')} />
          </FormItem>
          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            {t('appearanceView.customSceneryTip')}
          </Paragraph>
        </Form>
      </Modal>
    </>
  );
};

export default AppearanceView;
