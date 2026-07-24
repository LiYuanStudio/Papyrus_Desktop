import { Typography, Modal, Input, Select, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { CreateCollectionModalProps } from '../types';

const CreateCollectionModal = ({
  visible,
  cards,
  selectedCardIds,
  newCollectionName,
  isSubmitting,
  onVisibleChange,
  onCardIdsChange,
  onNameChange,
  onSubmit,
}: CreateCollectionModalProps) => {
  const { t } = useTranslation();

  const handleSubmit = async () => {
    const name = newCollectionName.trim();
    if (!name) {
      Message.error(t('scrollPage.pleaseEnterCollectionName'));
      return;
    }
    if (selectedCardIds.length === 0) {
      Message.error(t('scrollPage.pleaseSelectAtLeastOneCard'));
      return;
    }
    onSubmit();
  };

  const handleCancel = () => {
    onVisibleChange(false);
    onNameChange('');
    onCardIdsChange([]);
  };

  return (
    <Modal
      title={t('scrollPage.createCollection')}
      visible={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={isSubmitting}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Typography.Text style={{ display: 'block', marginBottom: 8 }}>{t('scrollPage.collectionName')}</Typography.Text>
          <Input
            value={newCollectionName}
            onChange={onNameChange}
            placeholder={t('scrollPage.collectionPlaceholder')}
            maxLength={20}
          />
        </div>
        <div>
          <Typography.Text style={{ display: 'block', marginBottom: 8 }}>{t('scrollPage.selectCards')}</Typography.Text>
          <Select
            mode="multiple"
            value={selectedCardIds}
            onChange={onCardIdsChange}
            placeholder={t('scrollPage.selectCardsPlaceholder')}
            style={{ width: '100%' }}
            options={cards.map(c => ({ label: c.q.slice(0, 40) || t('startPage.untitled'), value: c.id }))}
          />
        </div>
      </div>
    </Modal>
  );
};

export default CreateCollectionModal;
