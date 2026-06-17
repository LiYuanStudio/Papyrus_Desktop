import { Button, Message } from '@arco-design/web-react';
import { IconPlus, IconEye, IconEdit } from '@arco-design/web-react/icon';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import FlashcardStudy from './FlashcardStudy';

import { api, type Card as CardType } from '../api';
import { usePageScenery } from '../hooks/useScenery';
import { PageLayout } from '../components';
import {
  CollectionCard,
  ScrollCard,
  AddCard,
  ShelfTitle,
  CreateCollectionModal,
  ManageCollectionModal,
  BatchCardModal,
  CreateCardModal,
} from './components';
import { generateCollections, generateScrolls } from './utils';
import { PRIMARY_COLOR } from './constants';
import type { ScrollPageProps } from './types';

const ScrollPage = ({ initialTag, initialCardId, onInitialTagUsed, onInitialCardIdUsed }: ScrollPageProps) => {
  const { t } = useTranslation();
  const [isStudying, setIsStudying] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CardType[]>([]);
  const [filterTag, setFilterTag] = useState<string | undefined>(undefined);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [manageCollectionId, setManageCollectionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchCardModalVisible, setBatchCardModalVisible] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [createCardModalVisible, setCreateCardModalVisible] = useState(false);
  const [newCardQuestion, setNewCardQuestion] = useState('');
  const [newCardAnswer, setNewCardAnswer] = useState('');
  const [newCardTags, setNewCardTags] = useState('');
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);
  const [targetCardId, setTargetCardId] = useState<string | undefined>(undefined);

  usePageScenery('scroll');

  const overallProgress = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

  const refreshCards = () => {
    api.listCards()
      .then(res => {
        if (res.success) {
          setCards(res.cards);
          const mastered = res.cards.filter(c => (c.interval || 0) > 1).length;
          setMasteredCount(mastered);
        }
      })
      .catch(console.error);
  };

  const refreshStats = async () => {
    try {
      const nextDueRes = await api.nextDue();
      if (nextDueRes.success) {
        setDueCount(nextDueRes.due_count);
        setTotalCount(nextDueRes.total_count);
      }
    } catch (err) {
      console.error('获取统计失败:', err);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [nextDueRes, cardsRes] = await Promise.all([
          api.nextDue(),
          api.listCards(),
        ]);

        if (nextDueRes.success) {
          setDueCount(nextDueRes.due_count);
          setTotalCount(nextDueRes.total_count);
        }

        if (cardsRes.success) {
          setCards(cardsRes.cards);
          const mastered = cardsRes.cards.filter(c => (c.interval || 0) > 1).length;
          setMasteredCount(mastered);
        }
      } catch (err) {
        console.error('获取统计失败:', err);
        Message.error(t('scrollPage.fetchStatsFailed'));
      } finally {
        setLoading(false);
      }
    };

    if (!isStudying) {
      fetchStats();
    }
  }, [isStudying, t]);

  useEffect(() => {
    const handleCardsChanged = () => {
      if (!isStudying) {
        refreshCards();
      }
    };
    window.addEventListener('papyrus_cards_changed', handleCardsChanged);
    return () => window.removeEventListener('papyrus_cards_changed', handleCardsChanged);
  }, [isStudying]);

  useEffect(() => {
    const handleGlobalNewCard = () => {
      setCreateCardModalVisible(true);
    };
    const handleStartStudy = (e: Event) => {
      const customEvent = e as CustomEvent<{ tag?: string }>;
      const tag = customEvent.detail?.tag;
      setFilterTag(tag);
      setIsDemo(false);
      setIsStudying(true);
    };
    window.addEventListener('papyrus_new_card', handleGlobalNewCard);
    window.addEventListener('papyrus_start_study', handleStartStudy);
    return () => {
      window.removeEventListener('papyrus_new_card', handleGlobalNewCard);
      window.removeEventListener('papyrus_start_study', handleStartStudy);
    };
  }, []);

  const startStudy = (tag?: string) => {
    setIsExiting(false);
    setTargetCardId(undefined);
    setFilterTag(tag);
    setIsDemo(false);
    setIsStudying(true);
  };

  const handleExitStudy = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsStudying(false);
      setIsExiting(false);
      setTargetCardId(undefined);
    }, 300);
  };

  useEffect(() => {
    if (initialTag && !isStudying) {
      startStudy(initialTag);
      onInitialTagUsed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTag]);

  useEffect(() => {
    if (initialCardId) {
      setIsExiting(false);
      setTargetCardId(initialCardId);
      setFilterTag(undefined);
      setIsDemo(false);
      setIsStudying(true);
      onInitialCardIdUsed?.();
    }
  }, [initialCardId, onInitialCardIdUsed]);

  const startDemo = () => {
    setIsDemo(true);
    setIsStudying(true);
  };

  const shelfContainerStyle = {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: '16px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    paddingBottom: '8px',
  };

  const collections = generateCollections(cards);
  const scrolls = generateScrolls(cards);

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    setIsSubmitting(true);
    try {
      let successCount = 0;
      for (const cardId of selectedCardIds) {
        const card = cards.find(c => c.id === cardId);
        if (card) {
          const newTags = [...(card.tags || []), name];
          const res = await api.updateCard(cardId, { tags: newTags });
          if (res.success) successCount++;
        }
      }
      Message.success(t('scrollPage.collectionCreated', { count: successCount }));
      setCreateModalVisible(false);
      setNewCollectionName('');
      setSelectedCardIds([]);
      refreshCards();
      window.dispatchEvent(new CustomEvent('papyrus_cards_changed'));
    } catch (err) {
      Message.error(t('scrollPage.createCollectionFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCard = async () => {
    const q = newCardQuestion.trim();
    const a = newCardAnswer.trim();
    if (!q) {
      Message.error(t('scrollPage.pleaseEnterQuestion'));
      return;
    }
    if (!a) {
      Message.error(t('scrollPage.pleaseEnterAnswer'));
      return;
    }
    setIsSubmittingCard(true);
    try {
      const tags = newCardTags.split(',').map(tag => tag.trim()).filter(Boolean);
      const res = await api.createCard(q, a, tags.length > 0 ? tags : undefined);
      if (res.success) {
        Message.success(t('scrollPage.cardCreated'));
        setCreateCardModalVisible(false);
        setNewCardQuestion('');
        setNewCardAnswer('');
        setNewCardTags('');
        refreshCards();
        refreshStats();
        window.dispatchEvent(new CustomEvent('papyrus_cards_changed'));
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('scrollPage.createCardFailed'));
    } finally {
      setIsSubmittingCard(false);
    }
  };

  if (isStudying) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: isExiting
          ? 'flashcardStudyExit 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          : 'flashcardStudyEnter 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      }}>
        <FlashcardStudy onExit={handleExitStudy} demo={isDemo} filterTag={filterTag} targetCardId={targetCardId} />
        <style>{`
          @keyframes flashcardStudyEnter {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes flashcardStudyExit {
            from {
              opacity: 1;
              transform: translateY(0);
            }
            to {
              opacity: 0;
              transform: translateY(20px);
            }
          }
        `}</style>
      </div>
    );
  }

  const actions = (
    <>
      <Button
        shape='round'
        size='large'
        icon={<IconPlus />}
        onClick={() => setCreateCardModalVisible(true)}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
        }}
      >
        {t('scrollPage.addScroll')}
      </Button>
      <Button
        shape='round'
        size='large'
        icon={<IconEdit />}
        onClick={() => {
          setBatchSelectedIds(new Set());
          setBatchCardModalVisible(true);
        }}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
        }}
      >
        {t('scrollPage.manageCards')}
      </Button>
      <Button
        shape='round'
        size='large'
        icon={<IconEye />}
        onClick={startDemo}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
        }}
      >
        {t('scrollPage.previewStudy')}
      </Button>
      <Button
        shape='round'
        type='primary'
        size='large'
        icon={<IconPlus />}
        onClick={() => startStudy()}
        disabled={dueCount === 0}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
          backgroundColor: dueCount > 0 ? PRIMARY_COLOR : 'var(--color-text-3)',
        }}
      >
        {dueCount > 0 ? t('scrollPage.startReview', { count: dueCount }) : t('scrollPage.noDueCards')}
      </Button>
    </>
  );

  return (
    <PageLayout
      title={t('scrollPage.title')}
      actions={actions}
      pageKey='scroll'
      stats={[
        { label: t('scrollPage.dueForReview'), value: dueCount },
        { label: t('scrollPage.mastered'), value: `${totalCount && overallProgress ? Math.round(totalCount * overallProgress / 100) : 0}/${totalCount ?? 0}` },
        { label: t('scrollPage.totalProgress'), value: `${overallProgress ?? 0}%` },
      ]}
      statsLoading={loading}
    >
      <section style={{ marginBottom: '40px' }}>
        <ShelfTitle>{t('scrollPage.collections')}</ShelfTitle>
        <div style={shelfContainerStyle}>
          {collections.map(c => (
            <CollectionCard
              key={c.id}
              collection={c}
              onClick={() => startStudy(c.id)}
              onManage={(e) => {
                e.stopPropagation();
                setManageCollectionId(c.id);
                setManageModalVisible(true);
              }}
            />
          ))}
          <div onClick={() => setCreateModalVisible(true)}>
            <AddCard label={t('scrollPage.newCollection')} />
          </div>
        </div>
      </section>

      <section>
        <ShelfTitle>{t('scrollPage.recentlyUsed')}</ShelfTitle>
        <div style={shelfContainerStyle}>
          {scrolls.map(s => (
            <ScrollCard
              key={s.id}
              scroll={s}
              onStudy={s.dueCount > 0 ? startStudy : undefined}
            />
          ))}
          <div onClick={() => setCreateCardModalVisible(true)}>
            <AddCard label={t('scrollPage.newScroll')} />
          </div>
        </div>
      </section>

      <CreateCollectionModal
        visible={createModalVisible}
        cards={cards}
        selectedCardIds={selectedCardIds}
        newCollectionName={newCollectionName}
        isSubmitting={isSubmitting}
        onVisibleChange={setCreateModalVisible}
        onCardIdsChange={setSelectedCardIds}
        onNameChange={setNewCollectionName}
        onSubmit={handleCreateCollection}
      />

      <ManageCollectionModal
        visible={manageModalVisible}
        cards={cards}
        collectionId={manageCollectionId}
        onVisibleChange={setManageModalVisible}
        onCollectionIdChange={setManageCollectionId}
        onRefresh={refreshCards}
      />

      <BatchCardModal
        visible={batchCardModalVisible}
        cards={cards}
        selectedIds={batchSelectedIds}
        onVisibleChange={setBatchCardModalVisible}
        onSelectedIdsChange={setBatchSelectedIds}
        onRefresh={refreshCards}
      />

      <CreateCardModal
        visible={createCardModalVisible}
        question={newCardQuestion}
        answer={newCardAnswer}
        tags={newCardTags}
        isSubmitting={isSubmittingCard}
        onVisibleChange={setCreateCardModalVisible}
        onQuestionChange={setNewCardQuestion}
        onAnswerChange={setNewCardAnswer}
        onTagsChange={setNewCardTags}
        onSubmit={handleCreateCard}
      />
    </PageLayout>
  );
};

export default ScrollPage;
