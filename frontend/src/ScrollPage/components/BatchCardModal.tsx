import { Typography, Modal, Button, Empty, Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { BatchCardModalProps } from '../types';
import { PRIMARY_COLOR } from '../constants';

const BatchCardModal = ({
  visible,
  cards,
  selectedIds,
  onVisibleChange,
  onSelectedIdsChange,
  onRefresh,
}: BatchCardModalProps) => {
  const { t } = useTranslation();

  const handleToggleCard = (cardId: string) => {
    onSelectedIdsChange(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    Modal.confirm({
      title: t('scrollPage.batchDeleteCards'),
      content: t('scrollPage.confirmBatchDelete', { count: selectedIds.size }),
      onOk: async () => {
        try {
          const res = await api.batchDeleteCards([...selectedIds]);
          Message.success(t('scrollPage.batchDeleteSuccess', { count: res.deleted }));
          onVisibleChange(false);
          onSelectedIdsChange(new Set());
          onRefresh();
        } catch {
          Message.error(t('scrollPage.batchDeleteFailed'));
        }
      },
    });
  };

  return (
    <Modal
      title={t('scrollPage.manageCardsTitle', { count: cards.length })}
      visible={visible}
      onCancel={() => onVisibleChange(false)}
      footer={[
        <Button key="close" onClick={() => onVisibleChange(false)}>
          {t('scrollPage.close')}
        </Button>,
        <Button
          key="delete"
          type="primary"
          status="danger"
          disabled={selectedIds.size === 0}
          onClick={handleBatchDelete}
        >
          {t('scrollPage.deleteSelected', { count: selectedIds.size })}
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
        {cards.length > 0 ? cards.map(card => (
          <div
            key={card.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: selectedIds.has(card.id) ? `${PRIMARY_COLOR}10` : 'var(--color-fill-2)',
              borderRadius: 8,
              cursor: 'pointer',
              border: selectedIds.has(card.id) ? `1px solid ${PRIMARY_COLOR}` : '1px solid transparent',
            }}
            onClick={() => handleToggleCard(card.id)}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(card.id)}
              onChange={() => {}}
              style={{ cursor: 'pointer', accentColor: PRIMARY_COLOR }}
              aria-label={t('scrollPage.selectThisCard')}
            />
            <Typography.Text style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.q.slice(0, 60) || t('startPage.untitled')}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {card.tags?.join(', ') || t('startPage.uncategorized')}
            </Typography.Text>
          </div>
        )) : (
          <Empty description={t('startPage.noCards')} />
        )}
      </div>
    </Modal>
  );
};

export default BatchCardModal;