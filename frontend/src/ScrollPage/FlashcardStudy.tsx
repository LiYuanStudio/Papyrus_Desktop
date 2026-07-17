import { useEffect, useRef } from 'react';
import { Typography, Spin } from '@arco-design/web-react';
import { useFlashcardStudy } from './FlashcardStudy/useFlashcardStudy';
import { FlashCard } from './FlashcardStudy/FlashCard';
import { RatingButtons, RevealHint } from './FlashcardStudy/RatingButtons';
import { StudyToolbar } from './FlashcardStudy/StudyToolbar';
import { ResultToast } from './FlashcardStudy/ResultToast';
import { EmptyOrComplete } from './FlashcardStudy/EmptyOrComplete';
import { KeyboardShortcuts } from './FlashcardStudy/KeyboardShortcuts';

interface FlashcardStudyProps {
  onExit: () => void;
  filterTag?: string;
  targetCardId?: string;
}

export default function FlashcardStudy({ onExit, filterTag, targetCardId }: FlashcardStudyProps) {
  const {
    studyState,
    currentCard,
    dueCount,
    totalCount,
    stats,
    lastResult,
    submitRating,
    undoRating,
    revealAnswer,
    resetStudy,
  } = useFlashcardStudy({ filterTag, targetCardId });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
        case 'Enter':
          e.preventDefault();
          revealAnswer();
          break;
        case 'Digit1':
        case 'Numpad1':
          e.preventDefault();
          submitRating(1);
          break;
        case 'Digit2':
        case 'Numpad2':
          e.preventDefault();
          submitRating(2);
          break;
        case 'Digit3':
        case 'Numpad3':
          e.preventDefault();
          submitRating(3);
          break;
        case 'KeyU':
          e.preventDefault();
          if (lastResult && studyState === 'question') {
            undoRating();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [revealAnswer, submitRating, onExit, lastResult, studyState, undoRating]);

  if (studyState === 'loading') {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
        }}
      >
        <Spin size={40} />
        <Typography.Text type="secondary">加载中...</Typography.Text>
      </div>
    );
  }

  if (studyState === 'empty') {
    return (
      <EmptyOrComplete
        stats={stats}
        onReset={resetStudy}
        onExit={onExit}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 48px',
        gap: '24px',
      }}
    >
      <StudyToolbar
        onExit={onExit}
        totalCount={totalCount}
        dueCount={dueCount}
        stats={stats}
        studied={stats.studied}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
        }}
      >
        {lastResult && studyState === 'question' && (
          <ResultToast grade={lastResult.grade} onUndo={undoRating} canUndo={true} />
        )}

        <FlashCard card={currentCard} studyState={studyState} onReveal={revealAnswer} />

        {studyState === 'answer' ? (
          <RatingButtons onRate={submitRating} />
        ) : (
          <RevealHint />
        )}
      </div>

      <KeyboardShortcuts lastResult={lastResult} />

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
