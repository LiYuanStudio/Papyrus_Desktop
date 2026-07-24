import { Typography, Button, Message } from '@arco-design/web-react';
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import RecentScrolls from './RecentScrolls';
import RecentNotes from './RecentNotes';
import ReviewQueue from './ReviewQueue';
import { getSolarTerm, fetchSolarTerm } from './solarTerms';
import { type SceneryContent, fetchSceneryContent } from './sceneryContent';
import { api } from '../api';
import { formatDateBySetting } from '../utils/dateFormat.js';
import './StartPage.css';


type StartPageStats = {
  cardsDue: number;
  totalCards: number;
  streakDays: number;
  todayProgress: number;
};

type StartPageData = {
  greeting: string;
  dateLabel: string;
  solarTerm: string | null;
  scenery: SceneryContent | null;
  stats: StartPageStats;
  loading: boolean;
};

type StartPageProps = {
  onDoneChange?: (done: boolean) => void;
  onNavigate?: (page: string, noteId?: string) => void;
  onStartStudy?: (tag?: string) => void;
  onNewCard?: () => void;
};

type PendingCardProps = {
  stats: StartPageStats;
  greeting: string;
  dateLabel: string;
  solarTerm: string | null;
  loading: boolean;
  onStartStudy?: () => void;
  onNewCard?: () => void;
  scenery: SceneryContent | null;
};

function getGreeting(hour: number, t: (key: string) => string): string {
  if (hour < 6) return t('startPage.lateNight');
  if (hour < 12) return t('startPage.goodMorning');
  if (hour < 18) return t('startPage.goodAfternoon');
  return t('startPage.goodEvening');
}

function formatDateLabel(date: Date): string {
  return formatDateBySetting(date);
}

function useStartPageData(t: (key: string) => string): StartPageData & { refresh: () => void } {
  const [today] = useState(() => new Date());
  const [solarTerm, setSolarTerm] = useState<string | null>(() => getSolarTerm(today));
  const [scenery, setScenery] = useState<SceneryContent | null>(null);
  const [stats, setStats] = useState<StartPageStats>({
    cardsDue: 0,
    totalCards: 0,
    streakDays: 0,
    todayProgress: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [remoteSolarTerm, nextDueRes, streakRes] = await Promise.all([
        fetchSolarTerm(today),
        api.nextDue(),
        api.streak(),
      ]);

      if (remoteSolarTerm) {
        setSolarTerm(remoteSolarTerm);
      }

      const dueCount = nextDueRes.success ? (nextDueRes.due_count ?? 0) : 0;
      const totalCount = nextDueRes.success ? (nextDueRes.total_count ?? 0) : 0;
      const streakDays = streakRes.success ? (streakRes.current_streak ?? 0) : 0;
      const todayProgress = streakRes.success ? (streakRes.progress_percent ?? 0) : 0;
      setStats({ cardsDue: dueCount, totalCards: totalCount, streakDays, todayProgress });

      if (dueCount === 0) {
        setScenery(await fetchSceneryContent());
      } else {
        setScenery(null);
      }
    } catch (err) {
      setScenery(null);
      const msg = err instanceof Error ? err.message : '获取数据失败';
      Message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return useMemo(() => ({
    greeting: getGreeting(today.getHours(), t),
    dateLabel: formatDateLabel(today),
    solarTerm,
    scenery,
    stats,
    loading,
    refresh,
  }), [today, solarTerm, scenery, stats, loading, refresh, t]);
}

const ShelfSection = ({ label, children }: { label: string; children: ReactNode }) => (
  <section className="start-shelf-section">
    <Typography.Title heading={3} className="start-shelf-section-title">
      {label}
    </Typography.Title>
    {children}
  </section>
);

const StartCTAButton = ({ 
  label, 
  onClick, 
  highlighted: externalHighlighted,
  onHoverChange 
}: { 
  label: string; 
  onClick?: () => void;
  highlighted?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [rippleKey, setRippleKey] = useState(0);
  
  const highlighted = externalHighlighted ?? (hovered || pressed);

  const handleMouseEnter = () => {
    setHovered(true);
    setRippleKey((value) => value + 1);
    onHoverChange?.(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    setPressed(false);
    onHoverChange?.(false);
  };

  return (
    <Button
      shape='round'
      size='large'
      type={highlighted ? 'primary' : 'secondary'}
      className="start-cta-button"
      data-highlighted={highlighted ? 'true' : 'false'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onClick={onClick}
    >
      {hovered ? (
        <span key={rippleKey} className="start-btn-ripple" />
      ) : null}
      <span className="start-cta-button-label">{label}</span>
    </Button>
  );
};

type StartCardProps = {
  scenery: SceneryContent | null;
  headline: string;
  subline?: string;
  greeting?: string;
  buttonLabel: string;
  onButtonClick?: () => void;
}

const StartCard = ({ scenery, headline, subline, greeting, buttonLabel, onButtonClick }: StartCardProps) => {
  const [hovered, setHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [scenery?.image]);

  const showScenery = scenery !== null && !!scenery.image && !imageError;
  const image = scenery?.image;
  const poem = scenery?.poem ?? '且将新火试新茶，诗酒趁年华。';
  const source = scenery?.source ?? '[宋] 苏轼《望江南·超然台作》';

  return (
    <div
      className={`start-card-frame ${showScenery ? 'start-card-frame--scenery' : 'start-card-frame--pending'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-hovered={hovered ? 'true' : 'false'}
    >
      {!showScenery && <LatticeBackground />}

      {showScenery && (
        <img
          src={image}
          alt={`窗景图片：${poem} —— ${source}`}
          className="start-scenery-image"
          data-hovered={hovered ? 'true' : 'false'}
          onError={() => setImageError(true)}
        />
      )}

      <div className="start-card-top">
        <Typography.Paragraph
          type='secondary'
          spacing='close'
          className="start-card-headline"
        >
          {headline}
        </Typography.Paragraph>
        {subline && (
          <Typography.Text className="scenery-sub-text start-card-subline">
            {subline}
          </Typography.Text>
        )}
      </div>

      <div className="start-card-bottom">
        {greeting && (
          <Typography.Text className="scenery-sub-text start-card-greeting">
            {greeting}
          </Typography.Text>
        )}
        <div />

       <StartCTAButton
         label={buttonLabel}
         onClick={onButtonClick}
       />
      </div>

      {showScenery && (
        <div className="start-poem-container" data-hovered={hovered ? 'true' : 'false'}>
          <div className="start-poem-inner">
            <div className="start-poem-text">
              {poem}
            </div>
            {source && (
              <div className="start-poem-source">
                {'——'}{source}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ShelfSections = ({ onStudyTag, onNavigate }: { onStudyTag?: (tag: string) => void; onNavigate?: (page: string, noteId?: string) => void }) => {
  const { t } = useTranslation();
  const cardHeight = 140;

  return (
    <>
      <ShelfSection label={t('startPage.review')}>
        <ReviewQueue height={cardHeight} onStartStudy={() => {
        }} />
      </ShelfSection>
      <ShelfSection label={t('startPage.recentScrolls')}>
        <RecentScrolls height={cardHeight} onStudyTag={onStudyTag} />
      </ShelfSection>
      <ShelfSection label={t('startPage.recentNotes')}>
        <RecentNotes height={cardHeight} onNavigate={(noteId) => {
          onNavigate?.('notes', noteId);
        }} />
      </ShelfSection>
    </>
  );
};

const LatticeBackground = () => {
  const patternId = useId();

  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='100%'
      height='100%'
      className="start-lattice-svg"
      aria-hidden='true'
    >
      <defs>
        <pattern id={patternId} x='0' y='0' width='48' height='48' patternUnits='userSpaceOnUse'>
          <line x1='0' y1='0' x2='64' y2='0' stroke='var(--color-text-3)' strokeWidth='0.5' strokeOpacity='0.25' />
          <line x1='0' y1='32' x2='64' y2='32' stroke='var(--color-text-3)' strokeWidth='0.5' strokeOpacity='0.25' />
          <line x1='0' y1='64' x2='64' y2='64' stroke='var(--color-text-3)' strokeWidth='0.5' strokeOpacity='0.25' />
          <line x1='0' y1='0' x2='0' y2='64' stroke='var(--color-text-3)' strokeWidth='0.5' strokeOpacity='0.25' />
          <line x1='32' y1='0' x2='32' y2='64' stroke='var(--color-text-3)' strokeWidth='0.5' strokeOpacity='0.25' />
          <line x1='64' y1='0' x2='64' y2='64' stroke='var(--color-text-3)' strokeWidth='0.5' strokeOpacity='0.25' />
        </pattern>
      </defs>
      <rect width='100%' height='100%' fill={`url(#${patternId})`} />
    </svg>
  );
};

const PendingCard = ({ stats, greeting, dateLabel, solarTerm, loading, onStartStudy, scenery }: PendingCardProps) => {
  const { t } = useTranslation();

  return (
    <StartCard
      scenery={scenery}
      headline={loading ? t('startPage.fetchCardsFailed') : t('startPage.cardsDue', { count: stats.cardsDue })}
      subline={loading ? undefined : t('startPage.streakProgress', { streakDays: stats.streakDays, todayProgress: stats.todayProgress })}
      greeting={`${greeting} | ${dateLabel}${solarTerm ? ` | ${solarTerm}` : ''}`}
      buttonLabel={t('startPage.start')}
      onButtonClick={onStartStudy}
    />
  );
};

const DoneCard = ({ scenery, onNewCard }: { scenery: SceneryContent | null; onNewCard?: () => void }) => {
  const { t } = useTranslation();

  return (
    <StartCard
      scenery={scenery}
      headline={t('startPage.congratulations')}
      subline={t('startPage.keepGoing')}
      buttonLabel={t('titleBar.newCard')}
      onButtonClick={onNewCard}
    />
  );
};

const StartPage = ({ onDoneChange, onNavigate, onStartStudy, onNewCard }: StartPageProps) => {
  const { t } = useTranslation();
  const data = useStartPageData(t);
  const done = !data.loading && data.stats.cardsDue === 0;

  useEffect(() => {
    onDoneChange?.(done);
  }, [done, onDoneChange]);

  // 监听学习完成事件，刷新数据
  useEffect(() => {
    const handleStudyCompleted = () => {
      data.refresh();
    };
    window.addEventListener('papyrus_study_completed', handleStudyCompleted);
    return () => window.removeEventListener('papyrus_study_completed', handleStudyCompleted);
  }, [data.refresh]);

  return (
    <div id="start-page-scroll" className="start-page-root">
      {done && (
        <div
          className="tw-absolute tw-inset-x-0 tw-top-0 tw-h-[160px] tw-pointer-events-none tw-z-0 start-done-glow"
          aria-hidden="true"
        />
      )}
      <div className="start-hero">
        <Typography.Title heading={1} style={{ fontWeight: 600, lineHeight: 1, margin: 0, fontSize: 'var(--font-size-display-xl)' }}>
          {t('startPage.title')}
        </Typography.Title>

        {done ? (
          <DoneCard scenery={data.scenery} onNewCard={onNewCard} />
        ) : (
          <PendingCard
            stats={data.stats}
            greeting={data.greeting}
            dateLabel={data.dateLabel}
            solarTerm={data.solarTerm}
            loading={data.loading}
            scenery={null}
            onStartStudy={() => onStartStudy?.()}
          />
        )}
      </div>

      <div className="start-shelves">
        <Typography.Title heading={2} className="start-shelves-title">
          {t('startPage.bookshelf')}
        </Typography.Title>

        <ShelfSections
          onNavigate={onNavigate}
          onStudyTag={(tag) => onStartStudy?.(tag)}
        />

        <div className="start-bottom-spacer" />
      </div>
    </div>
  );
};

export default StartPage;
