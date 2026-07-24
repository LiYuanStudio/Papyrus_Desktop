import { Typography, Message } from '@arco-design/web-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Card } from '../api';
import { useCommonCardStyle, CommonCard, CardGroup } from '../components';
import { addRecentItem } from '../utils/recentFiles';

interface Collection {
  id: string;
  title: string;
  scrollCount: number;
  dueCount: number;
  lastUsed: string;
  color: string;
}

const CollectionCard = ({ collection, onClick, t }: { collection: Collection; onClick?: () => void; t: (key: string, options?: Record<string, unknown>) => string }) => {
  const { hovered, setHovered, cardStyle, width, height } = useCommonCardStyle({
    borderWidth: 2,
  });

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
      aria-label={`${collection.title} - ${collection.dueCount > 0 ? t('startPage.dueCount', { count: collection.dueCount }) : t('startPage.completed')}`}
      style={{
        flex: '0 0 auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
      }}
    >
      {/* 顶部：标题 + 待复习徽标 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {collection.dueCount > 0 && (
          <div style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            background: collection.color,
            color: '#fff',
            borderRadius: '999px',
            padding: '2px 10px',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            lineHeight: '20px',
          }}>
            {t('startPage.dueCount', { count: collection.dueCount })}
          </div>
        )}
        {collection.dueCount === 0 && (
          <div style={{
            display: 'inline-flex',
            alignSelf: 'flex-start',
            background: 'var(--color-fill-2)',
            color: 'var(--color-text-3)',
            borderRadius: '999px',
            padding: '2px 10px',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            lineHeight: '20px',
          }}>
            {t('startPage.completed')}
          </div>
        )}
        <Typography.Text bold style={{ fontSize: 'var(--font-size-lg)', lineHeight: 1.3 }}>
          {collection.title}
        </Typography.Text>
      </div>

      {/* 底部：卡片数 + 最近使用 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Typography.Text type='secondary' style={{ fontSize: 'var(--font-size-sm)' }}>
          {t('startPage.cardCount', { count: collection.scrollCount })}
        </Typography.Text>
        <Typography.Text type='secondary' style={{ fontSize: 'var(--font-size-sm)' }}>
          {t('startPage.lastUsed')}
        </Typography.Text>
      </div>
    </CommonCard>
  );
};

interface RecentScrollsProps {
  /** 与上方窗景卡片保持一致的高度 */
  height: number;
  onStudyTag?: (tag: string) => void;
}

const PRESET_COLORS = [
  '#206CCF', '#3B82F6', '#0EA5E9', '#06B6D4', '#10B981',
  '#84CC16', '#EAB308', '#F59E0B', '#F97316', '#EF4444',
  '#EC4899', '#D946EF', '#8B5CF6', '#6366F1', '#64748B',
];
const MAX_VISIBLE_TAG_COLLECTIONS = 12;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// 辅助函数：从卡片 tags 生成分组
function categorizeCards(cards: Card[]): Collection[] {
  const tagMap = new Map<string, Card[]>();
  for (const card of cards) {
    const tags = card.tags && card.tags.length > 0 ? card.tags : ['未分类'];
    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, []);
      }
      tagMap.get(tag)!.push(card);
    }
  }

  const nowSec = Date.now() / 1000;
  const collections: Collection[] = [];
  for (const [tag, tagCards] of tagMap.entries()) {
    const dueCount = tagCards.filter(c => (c.next_review ?? Infinity) <= nowSec).length;
    collections.push({
      id: tag,
      title: tag,
      scrollCount: tagCards.length,
      dueCount,
      lastUsed: '最近使用',
      color: PRESET_COLORS[hashString(tag) % PRESET_COLORS.length],
    });
  }

  return collections
    .sort((a, b) => b.scrollCount - a.scrollCount)
    .slice(0, MAX_VISIBLE_TAG_COLLECTIONS);
}

const RecentScrolls = ({ height, onStudyTag }: RecentScrollsProps) => {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        setLoading(true);
        const response = await api.listCards();
        if (response.success) {
          const cats = categorizeCards(response.cards);
          setCollections(cats);
        } else {
          Message.error(t('startPage.fetchCardsFailed'));
        }
      } catch (err) {
        console.error(t('startPage.fetchCardsFailed'), err);
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
      emptyText={t('startPage.noCards')}
    >
      {collections.map(c => (
        <CollectionCard key={c.id} collection={c} onClick={() => {
          addRecentItem({ id: c.id, type: 'card', title: c.title });
          onStudyTag?.(c.id);
        }} t={t} />
      ))}
    </CardGroup>
  );
};

export default RecentScrolls;
