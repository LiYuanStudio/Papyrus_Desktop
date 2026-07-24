import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Input,
  Message,
} from '@arco-design/web-react';
import {
  IconEdit,
  IconBulb,
  IconCommand,
} from '@arco-design/web-react/icon';
import { useShortcuts, type ShortcutConfig } from '../../hooks/useShortcuts';
import { SettingItem, SettingsViewLayout, type NavItem } from '../components';

interface ShortcutsViewProps {
  onBack: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'general-section', label: 'shortcutsView.general', icon: IconEdit },
  { key: 'editor-section', label: 'shortcutsView.editor', icon: IconCommand },
  { key: 'study-section', label: 'shortcutsView.study', icon: IconCommand },
];

const ShortcutsView = ({ onBack }: ShortcutsViewProps) => {
  const { t } = useTranslation();
  const { shortcuts, setShortcut, resetToDefault } = useShortcuts();
  const [editingKey, setEditingKey] = useState<keyof ShortcutConfig | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [resetModalVisible, setResetModalVisible] = useState(false);

  const generalShortcutKeys = [
    { key: 'newNote', label: t('shortcutsView.newNote') },
    { key: 'newCard', label: t('shortcutsView.newCard') },
    { key: 'newWindow', label: t('shortcutsView.newWindow') },
    { key: 'openNotes', label: t('shortcutsView.openNotes') },
    { key: 'openFiles', label: t('shortcutsView.openFiles') },
    { key: 'openReview', label: t('shortcutsView.openReview') },
    { key: 'search', label: t('shortcutsView.search') },
    { key: 'save', label: t('shortcutsView.save') },
    { key: 'saveAll', label: t('shortcutsView.saveAll') },
    { key: 'preferences', label: t('shortcutsView.preferences') },
    { key: 'closeEditor', label: t('shortcutsView.closeEditor') },
    { key: 'exit', label: t('shortcutsView.exit') },
    { key: 'importTxt', label: t('shortcutsView.importTxt') },
  ] as const;

  const editorShortcutKeys = [
    { key: 'undo', label: t('shortcutsView.undo') },
    { key: 'redo', label: t('shortcutsView.redo') },
    { key: 'cut', label: t('shortcutsView.cut') },
    { key: 'copy', label: t('shortcutsView.copy') },
    { key: 'paste', label: t('shortcutsView.paste') },
    { key: 'selectAll', label: t('shortcutsView.selectAll') },
    { key: 'find', label: t('shortcutsView.find') },
  ] as const;

  const [studyShortcuts] = useState({
    revealAnswer: 'Space / Enter',
    rateForgot: '1',
    rateHard: '2',
    rateGood: '3',
    undoRate: 'U',
    exitStudy: 'Esc',
  });

  const studyShortcutKeys = [
    { key: 'revealAnswer', label: t('shortcutsView.revealAnswer'), desc: t('shortcutsView.revealAnswerDesc') },
    { key: 'rateForgot', label: t('shortcutsView.rateForgot'), desc: t('shortcutsView.rateForgotDesc') },
    { key: 'rateHard', label: t('shortcutsView.rateHard'), desc: t('shortcutsView.rateHardDesc') },
    { key: 'rateGood', label: t('shortcutsView.rateGood'), desc: t('shortcutsView.rateGoodDesc') },
    { key: 'undoRate', label: t('shortcutsView.undoRate'), desc: '' },
    { key: 'exitStudy', label: t('shortcutsView.exitStudy'), desc: '' },
  ] as const;

  const startEditing = (key: keyof ShortcutConfig) => {
    setEditingKey(key);
    setEditingValue(shortcuts[key] || '');
  };

  const saveEditing = () => {
    if (editingKey) {
      const trimmed = editingValue.trim();
      if (trimmed) {
        setShortcut(editingKey, trimmed);
        Message.success(t('shortcutsView.shortcutSet', { shortcut: trimmed }));
      }
      setEditingKey(null);
      setEditingValue('');
    }
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const keys: string[] = [];

    if (e.ctrlKey || e.metaKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');

    const key = e.key;
    if (key && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      const formattedKey = key.length === 1 ? key.toUpperCase() : key;
      keys.push(formattedKey);
    }

    setEditingValue(keys.join('+'));
  };

  const handleReset = () => {
    resetToDefault();
    setResetModalVisible(false);
    Message.success(t('shortcutsView.shortcutsReset'));
  };

  const ShortcutInput = ({ value, onEdit }: { value: string; onEdit: () => void }) => (
    <div className="settings-shortcut-input">
      <span className="settings-shortcut-value">{value}</span>
      <Button
        type="text"
        size="mini"
        icon={<IconEdit />}
        onClick={onEdit}
      />
    </div>
  );

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'general-section':
        return generalShortcutKeys.map(({ key, label }, index) => (
          <SettingItem
            key={key}
            title={label}
            divider={index !== generalShortcutKeys.length - 1}
          >
            <ShortcutInput
              value={shortcuts[key as keyof ShortcutConfig]}
              onEdit={() => startEditing(key as keyof ShortcutConfig)}
            />
          </SettingItem>
        ));

      case 'editor-section':
        return (
          <>
            {editorShortcutKeys.map(({ key, label }, index) => (
              <SettingItem
                key={key}
                title={label}
                divider={index !== editorShortcutKeys.length - 1}
              >
                <ShortcutInput
                  value={shortcuts[key as keyof ShortcutConfig]}
                  onEdit={() => startEditing(key as keyof ShortcutConfig)}
                />
              </SettingItem>
            ))}
            <div className="settings-tip">
              <IconBulb style={{ color: 'var(--color-primary)' }} />
              {t('shortcutsView.editorTip')}
            </div>
          </>
        );

      case 'study-section':
        return (
          <>
            {studyShortcutKeys.map(({ key, label, desc }, index) => (
              <SettingItem
                key={key}
                title={label}
                desc={desc || undefined}
                divider={index !== studyShortcutKeys.length - 1}
              >
                <ShortcutInput
                  value={studyShortcuts[key as keyof typeof studyShortcuts]}
                  onEdit={() => Message.info(t('shortcutsView.studyModeEditing'))}
                />
              </SettingItem>
            ))}
            <div className="settings-tip">
              <IconBulb style={{ color: 'var(--color-primary)' }} />
              {t('shortcutsView.studyTip')}
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <SettingsViewLayout
        title={t('shortcutsView.title')}
        description={t('shortcutsView.titleDesc')}
        icon={IconCommand}
        iconColor="var(--color-warning)"
        navItems={NAV_ITEMS.map(item => ({ ...item, label: t(item.label) }))}
        sections={[
          { id: 'general-section', title: t('shortcutsView.general') },
          { id: 'editor-section', title: t('shortcutsView.editor') },
          { id: 'study-section', title: t('shortcutsView.study') },
        ]}
        onBack={onBack}
      >
        {renderSection}
      </SettingsViewLayout>

      <Modal
        title={t('shortcutsView.editShortcut')}
        visible={editingKey !== null}
        onOk={saveEditing}
        onCancel={cancelEditing}
        okText={t('shortcutsView.save')}
        cancelText={t('shortcutsView.cancel')}
      >
        <div style={{ padding: '16px 0' }}>
          {t('shortcutsView.pressShortcut')}
          <Input
            value={editingValue}
            onChange={setEditingValue}
            onKeyDown={handleKeyDown}
            placeholder={t('shortcutsView.pressPlaceholder')}
            style={{ fontFamily: 'monospace', fontSize: 16, marginTop: 16 }}
          />
          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--color-text-3)' }}>
            {t('shortcutsView.shortcutHint')}
          </div>
        </div>
      </Modal>

      <Modal
        title={t('shortcutsView.confirmReset')}
        visible={resetModalVisible}
        onOk={handleReset}
        onCancel={() => setResetModalVisible(false)}
        okText={t('shortcutsView.reset')}
        cancelText={t('shortcutsView.cancel')}
      >
        {t('shortcutsView.confirmResetMessage')}
      </Modal>
    </>
  );
};

export default ShortcutsView;
