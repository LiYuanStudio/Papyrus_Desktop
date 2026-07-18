import { Typography } from '@arco-design/web-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Card } from '../api';
import { useCommonCardStyle, CommonCard, CardGroup, PRIMARY_COLOR } from '../components';

interface ReviewItem {
  id: string;
  collectionTitle: string;
  scrollCount: number;
  estimatedMinutes: number;
}

const ReviewCard = ({ item, onClick }: { item: ReviewItem; onClick?: () => void }) => {
  const { t } = useTranslation();
  const { hovered, setHovered, cardStyle, width, height } = useCommonCardStyle({
    borderWidth: 2,
  });

  const title = item.id === 'new' ? t('startPage.newCards') : t('startPage.reviewCards');

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      width={width}
      height={height}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${title} - ${t('startPage.dueCount', { count: item.scrollCount })} - ${t('startPage.minutes', { count: item.estimatedMinutes })}`}
      style={{
        flex: '0 0 auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          background: PRIMARY_COLOR,
          color: '#fff',
          borderRadius: '999px',
          padding: '2px 10px',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          lineHeight: '20px',
        }}>
          {t('startPage.dueCount', { count: item.scrollCount })}
        </div>
        <Typography.Text bold style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.3 }}>
          {title}
        </Typography.Text>
      </div>

      <Typography.Text type='secondary' style={{ fontSize: 'var(--font-size-sm)' }}>
        {t('startPage.minutes', { count: item.estimatedMinutes })}
      </Typography.Text>
    </CommonCard>
  );
};

interface ReviewQueueProps {
  height: number;
  onStartStudy?: (type: 'new' | 'review') => void;
}

// 计算待复习队列
function calculateReviewQueue(cards: Card[]): ReviewItem[] {
  const now = Date.now() / 1000;
  const dueCards = cards.filter(c => (c.next_review || 0) <= now);

  if (dueCards.length === 0) {
    return [];
  }

  // 按间隔时间分组
  const newCards = dueCards.filter(c => (c.interval || 0) === 0);
  const reviewCards = dueCards.filter(c => (c.interval || 0) > 0);

  const queue: ReviewItem[] = [];

  if (newCards.length > 0) {
    queue.push({
      id: 'new',
      collectionTitle: '', // translated in render
      scrollCount: newCards.length,
      estimatedMinutes: Math.ceil(newCards.length * 0.5),
    });
  }

  if (reviewCards.length > 0) {
    queue.push({
      id: 'review',
      collectionTitle: '', // translated in render
      scrollCount: reviewCards.length,
      estimatedMinutes: Math.ceil(reviewCards.length * 0.3),
    });
  }

  return queue;
}

const ReviewQueue = ({ height, onStartStudy }: ReviewQueueProps) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        setLoading(true);
        const response = await api.listCards();
        if (response.success) {
          const queue = calculateReviewQueue(response.cards);
          setItems(queue);
        }
      } catch (err) {
        console.error(t('startPage.fetchDueCardsFailed'), err);
      } finally {
        setLoading(false);
      }
    };

    fetchCards();

    const handleCardsChanged = () => {
      fetchCards();
    };
    window.addEventListener('papyrus_cards_changed', handleCardsChanged);
    return () => window.removeEventListener('papyrus_cards_changed', handleCardsChanged);
  }, []);

  return (
    <CardGroup
      height={height}
      loading={loading}
      emptyText={t('startPage.noDueCards')}
    >
      {items.map(r => (
        <ReviewCard
          key={r.id}
          item={r}
          onClick={() => onStartStudy?.(r.id as 'new' | 'review')}
        />
      ))}
    </CardGroup>
  );
};

export default ReviewQueue;
