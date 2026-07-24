import { type Card as CardType } from '../api';
import type { Collection, Scroll } from './types';

const MAX_VISIBLE_TAG_COLLECTIONS = 12;

export function generateCollections(cards: CardType[]): Collection[] {
  const tagMap = new Map<string, number>();
  cards.forEach(card => {
    const tags = card.tags && card.tags.length > 0 ? card.tags : ['未分类'];
    tags.forEach(tag => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    });
  });
  const collections: Collection[] = Array.from(tagMap.entries()).map(([tag, count]) => ({
    id: tag,
    title: tag,
    scrollCount: 1,
    totalCards: count,
  }));
  collections.sort((a, b) => b.totalCards - a.totalCards);
  return collections.slice(0, MAX_VISIBLE_TAG_COLLECTIONS);
}

export function generateScrolls(cards: CardType[]): Scroll[] {
  const now = Date.now() / 1000;
  const newCards = cards.filter(c => (c.interval || 0) === 0);
  const reviewCards = cards.filter(c => (c.interval || 0) > 0);

  const scrolls: Scroll[] = [];

  if (newCards.length > 0) {
    scrolls.push({
      id: 'new',
      title: '新卡片',
      collection: '学习',
      cardCount: newCards.length,
      dueCount: newCards.length,
      masteredCount: 0,
      lastStudied: '今天',
    });
  }

  if (reviewCards.length > 0) {
    scrolls.push({
      id: 'review',
      title: '复习卡片',
      collection: '复习',
      cardCount: reviewCards.length,
      dueCount: reviewCards.filter(c => (c.next_review || 0) <= now).length,
      masteredCount: reviewCards.filter(c => (c.interval || 0) > 1).length,
      lastStudied: '最近',
    });
  }

  return scrolls;
}
