import { Typography, Modal, Button, Empty, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { ManageCollectionModalProps } from '../types';

const ManageCollectionModal = ({
  visible,
  cards,
  collectionId,
  onVisibleChange,
  onCollectionIdChange,
  onRefresh,
}: ManageCollectionModalProps) => {
  const { t } = useTranslation();

  const handleRemoveCard = async (cardId: string) => {
    try {
      const newTags = (cards.find(c => c.id === cardId)?.tags || []).filter(tag => tag !== collectionId);
      await api.updateCard(cardId, { tags: newTags });
      Message.success(t('scrollPage.removedFromCollection'));
      onRefresh();
    } catch {
      Message.error(t('scrollPage.removeFailed'));
    }
  };

  const handleDeleteCollection = () => {
    if (!collectionId) return;
    Modal.confirm({
      title: t('scrollPage.deleteCollection'),
      content: t('scrollPage.confirmDeleteCollectionMessage', { name: collectionId }),
      onOk: async () => {
        try {
          const targetCards = cards.filter(c => (c.tags || []).includes(collectionId));
          for (const card of targetCards) {
            const newTags = (card.tags || []).filter(tag => tag !== collectionId);
            await api.updateCard(card.id, { tags: newTags });
          }
          Message.success(t('scrollPage.collectionDeleted'));
          onVisibleChange(false);
          onCollectionIdChange(null);
          onRefresh();
        } catch {
          Message.error(t('scrollPage.deleteCollectionFailed'));
        }
      }
    });
  };

  const filteredCards = cards.filter(c => collectionId && (c.tags || []).includes(collectionId));

  return (
    <Modal
      title={t('scrollPage.manageCollection', { name: collectionId || '' })}
      visible={visible && !!collectionId}
      onCancel={() => {
        onVisibleChange(false);
        onCollectionIdChange(null);
      }}
      footer={[
        <Button key="close" onClick={() => { onVisibleChange(false); onCollectionIdChange(null); }}>
          {t('scrollPage.close')}
        </Button>,
        <Button
          key="delete"
          type="primary"
          status="danger"
          onClick={handleDeleteCollection}
        >
          {t('scrollPage.deleteCollection')}
        </Button>
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
        {filteredCards.length > 0 ? filteredCards.map(card => (
          <div
            key={card.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'var(--color-fill-2)',
              borderRadius: 8,
            }}
          >
            <Typography.Text style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.q.slice(0, 60) || t('startPage.untitled')}
            </Typography.Text>
            <Button
              type="text"
              size="small"
              onClick={() => handleRemoveCard(card.id)}
            >
              {t('scrollPage.remove')}
            </Button>
          </div>
        )) : (
          <Empty description={t('scrollPage.noCardsInCollection')} />
        )}
      </div>
    </Modal>
  );
};

export default ManageCollectionModal;