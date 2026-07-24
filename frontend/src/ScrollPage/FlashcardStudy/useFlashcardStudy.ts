import { useState, useEffect, useCallback, useRef } from 'react';
import { Message } from '@arco-design/web-react';
import { api, type Card, type NextDueRes } from '../../api';
import i18n from '../../i18n';
import {
  type StudyState,
  type StudyStats,
  type LastResult,
  type RatingGrade,
} from './constants';

interface UseFlashcardStudyProps {
  filterTag?: string;
  targetCardId?: string;
}

interface UseFlashcardStudyReturn {
  studyState: StudyState;
  currentCard: Card | null;
  dueCount: number;
  totalCount: number;
  stats: StudyStats;
  lastResult: LastResult | null;
  loadRealCard: () => Promise<void>;
  submitRating: (grade: RatingGrade) => Promise<void>;
  undoRating: () => Promise<void>;
  revealAnswer: () => void;
  resetStudy: () => void;
}

export function useFlashcardStudy({
  filterTag,
  targetCardId,
}: UseFlashcardStudyProps): UseFlashcardStudyReturn {
  const [studyState, setStudyState] = useState<StudyState>('loading');
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<StudyStats>({ studied: 0, mastered: 0, forgotten: 0 });
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const loadedRef = useRef(false);
  const lastTargetCardIdRef = useRef<string | undefined>(undefined);

  const loadRealCard = useCallback(async () => {
    try {
      const res: NextDueRes = await api.nextDue(filterTag);
      setDueCount(res.due_count);
      setTotalCount(res.total_count);

      if (targetCardId) {
        const cardsRes = await api.listCards();
        const targetCard = cardsRes.cards.find(card => card.id === targetCardId);
        if (targetCard && (targetCard.next_review || 0) <= Date.now() / 1000) {
          setCurrentCard(targetCard);
          setStudyState('question');
          return;
        }
        if (targetCard) {
          Message.info(i18n.t('flashcardStudy.notDue'));
        }
      }

      if (res.card) {
        setCurrentCard(res.card);
        setStudyState('question');
      } else {
        setCurrentCard(null);
        setStudyState('empty');
      }
    } catch (err) {
      console.error('加载卡片失败:', err);
      const msg = err instanceof Error ? err.message : i18n.t('flashcardStudy.loadCardsFailed');
      Message.error(msg);
      setStudyState('empty');
    }
  }, [filterTag, targetCardId]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    lastTargetCardIdRef.current = targetCardId;

    setStudyState('loading');
    void loadRealCard();
  }, [loadRealCard, targetCardId]);

  useEffect(() => {
    if (!targetCardId || lastTargetCardIdRef.current === targetCardId) {
      return;
    }
    lastTargetCardIdRef.current = targetCardId;
    setLastResult(null);
    setStudyState('loading');
    void loadRealCard();
  }, [loadRealCard, targetCardId]);

  useEffect(() => {
    if (studyState === 'empty' || studyState === 'loading') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stats.studied > 0) {
        e.preventDefault();
        e.returnValue = i18n.t('flashcardStudy.confirmLeave');
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stats.studied, studyState]);

  const revealAnswer = useCallback(() => {
    if (studyState === 'question') {
      setStudyState('answer');
    }
  }, [studyState]);

  const submitRating = useCallback(async (grade: RatingGrade) => {
    if (!currentCard || studyState !== 'answer') return;

    setStudyState('submitting');

    const ratedCard = currentCard;

    try {
      const res = await api.rateCard(currentCard.id, grade, filterTag);

      setStats((prev) => ({
        studied: prev.studied + 1,
        mastered: grade === 3 ? prev.mastered + 1 : prev.mastered,
        forgotten: grade === 1 ? prev.forgotten + 1 : prev.forgotten,
      }));

      setLastResult({ grade, card: ratedCard, reviewId: res.review_id });

      if (res.next) {
        setDueCount(res.next.due_count);
        setTotalCount(res.next.total_count);

        if (res.next.card) {
          setCurrentCard(res.next.card);
          setStudyState('question');
        } else {
          setCurrentCard(null);
          setStudyState('empty');
        }
      } else {
        await loadRealCard();
      }
    } catch (err) {
      console.error('评分失败:', err);
      const msg = err instanceof Error ? err.message : i18n.t('flashcardStudy.rateFailed');
      Message.error(msg);
      setStudyState('answer');
    }
  }, [currentCard, studyState, loadRealCard, filterTag]);

  // 通过 reviewId 请求服务端回滚评分，成功后再恢复卡片和本地统计。
  // 原因：先改 React 状态会让界面声称已撤销，但数据库仍保留评分结果。
  // 未乐观更新：撤销可能因重复请求或后续评分冲突失败，等待响应可避免二次损坏。
  const undoRating = useCallback(async () => {
    if (!lastResult) return;

    setStudyState('submitting');
    try {
      const result = await api.undoCardRating(lastResult.card.id, lastResult.reviewId, filterTag);
      setCurrentCard(result.card);
      setDueCount(result.due_count);
      setTotalCount(result.total_count);
      setStudyState('answer');
      setStats((prev) => ({
        studied: Math.max(0, prev.studied - 1),
        mastered: lastResult.grade === 3 ? Math.max(0, prev.mastered - 1) : prev.mastered,
        forgotten: lastResult.grade === 1 ? Math.max(0, prev.forgotten - 1) : prev.forgotten,
      }));
      setLastResult(null);
    } catch (err) {
      console.error('撤销评分失败:', err);
      const msg = err instanceof Error ? err.message : i18n.t('flashcardStudy.rateFailed');
      Message.error(msg);
      setStudyState('question');
    }
  }, [filterTag, lastResult]);

  useEffect(() => {
    if (studyState === 'empty' && stats.studied > 0) {
      window.dispatchEvent(new CustomEvent('papyrus_study_completed'));
    }
  }, [studyState, stats.studied]);

  const resetStudy = useCallback(() => {
    setStats({ studied: 0, mastered: 0, forgotten: 0 });
    setLastResult(null);
    setStudyState('loading');
    void loadRealCard();
  }, [loadRealCard]);

  return {
    studyState,
    currentCard,
    dueCount,
    totalCount,
    stats,
    lastResult,
    loadRealCard,
    submitRating,
    undoRating,
    revealAnswer,
    resetStudy,
  };
}
