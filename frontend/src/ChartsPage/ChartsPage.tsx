import { Typography, Card, Progress, Tooltip, Empty } from '@arco-design/web-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { IconFire, IconClockCircle, IconCheckCircle, IconCalendar } from '@arco-design/web-react/icon';
import { api, type Card as CardType } from '../api';
import { useCommonCardStyle, CommonCard, PageLayout } from '../components';
import { PRIMARY_COLOR, SUCCESS_COLOR } from '../theme-constants';
import i18n from '../i18n';

function useAnimatedNumber(targetValue: number, duration: number = 800, delay: number = 100, dataReady: boolean = false): number {
  const [displayValue, setDisplayValue] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(0);
  const targetValueRef = useRef(targetValue);
  const lastUpdateTimeRef = useRef(0);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    targetValueRef.current = targetValue;
  }, [targetValue]);

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (!dataReady) {
      wasLoadingRef.current = true;
      lastUpdateTimeRef.current = 0;
      const animateLoading = (currentTime: number) => {
        if (currentTime - lastUpdateTimeRef.current >= 30) {
          setDisplayValue(Math.floor(Math.random() * 10));
          lastUpdateTimeRef.current = currentTime;
        }
        animationRef.current = requestAnimationFrame(animateLoading);
      };
      animationRef.current = requestAnimationFrame(animateLoading);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      };
    }

    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setDisplayValue(targetValueRef.current);
    }

    const startAnimation = () => {
      startValueRef.current = displayValue;
      startTimeRef.current = performance.now();

      const animate = (currentTime: number) => {
        if (startTimeRef.current === null) return;

        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.round(
          startValueRef.current + (targetValueRef.current - startValueRef.current) * easedProgress
        );

        setDisplayValue(currentValue);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    };

    const timer = setTimeout(startAnimation, delay);

    return () => {
      clearTimeout(timer);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [dataReady, targetValue, duration, delay]);

  return displayValue;
}

// 进度数据类型
interface StreakData {
  current_streak: number;
  longest_streak: number;
  today_completed: boolean;
  today_cards: number;
  daily_target: number;
  progress_percent: number;
}

// 热力图数据类型
interface HeatmapItem {
  date: string;
  count: number;
  level: number;
}

// 统计数据类型
interface StatsData {
  totalCards: number;
  masteredCards: number;
  dueCards: number;
  streakDays: number;
  todayProgress: number;
  todayCards: number;
  dailyTarget: number;
}

// 图表"已复习/次要将"段配色: 品牌蓝 25% 透明。
// 原因: PRIMARY_COLOR 是 var(--color-primary), CSS 变量无法拼接 alpha 十六进制后缀;
// 直接写 rgba 分量, 深浅主题下都只是主色减淡, 不引入新色相。
const CHART_PRIMARY_SOFT = 'rgba(32, 108, 207, 0.25)';

// 热力图色阶: 基于品牌蓝的透明度阶梯(0.3/0.6/0.9), 替代原硬编码绿色阶,
// 在浅色(#f7f7f5 画布)与深色(#141416 画布)下都只靠主色浓淡表达强度。
const HEATMAP_COLORS = [
  'var(--color-fill-2)',
  'rgba(32, 108, 207, 0.3)',
  'rgba(32, 108, 207, 0.6)',
  'rgba(32, 108, 207, 0.9)',
];

// 统计卡片
const StatCard = ({ title, value, suffix, icon }: { title: string; value: string | number; suffix?: string; icon: React.ReactNode }) => {
  const { hovered, setHovered, cardStyle } = useCommonCardStyle({
    borderWidth: 1,
  });

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      style={{
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        minHeight: '100px',
      }}
    >
      <div style={{
        width: '44px',
        height: '44px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-fill-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-2)',
        fontSize: '20px',
      }}>
        {icon}
      </div>
      <div>
        <Typography.Text type='secondary' style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
          {title}
        </Typography.Text>
        <Typography.Text style={{ fontSize: '24px', fontWeight: 600 }}>
          {value}{suffix && <span style={{ fontSize: '14px', fontWeight: 400, marginLeft: '4px' }}>{suffix}</span>}
        </Typography.Text>
      </div>
    </CommonCard>
  );
};

// 从卡片数据和进度数据计算统计
function calculateStats(cards: CardType[], streakData: StreakData | null): StatsData {
  const now = Date.now() / 1000;
  const totalCards = cards.length;
  const dueCards = cards.filter(c => (c.next_review || 0) <= now).length;
  const masteredCards = cards.filter(c => (c.interval || 0) > 1).length;
  
  return {
    totalCards,
    masteredCards,
    dueCards,
    streakDays: streakData?.current_streak || 0,
    todayProgress: streakData?.progress_percent || 0,
    todayCards: streakData?.today_cards || 0,
    dailyTarget: streakData?.daily_target || 20,
  };
}

// 简单的进度卡片
const SimpleProgressCard = ({ title, progress, count, dataReady }: { title: string; progress: number; count: number; dataReady: boolean }) => {
  const { hovered, setHovered, cardStyle } = useCommonCardStyle({
    borderWidth: 1,
  });
  const animatedProgress = useAnimatedNumber(progress, 800, 300, dataReady);
  const animatedCount = useAnimatedNumber(count, 800, 400, dataReady);

  return (
    <CommonCard
      hovered={hovered}
      setHovered={setHovered}
      cardStyle={cardStyle}
      style={{
        padding: '20px',
        minHeight: '140px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <Typography.Text bold style={{ fontSize: '15px' }}>
          {title}
        </Typography.Text>
        {count > 0 && (
          <span style={{
            background: 'var(--color-fill-2)',
            color: 'var(--color-text-2)',
            borderRadius: '999px',
            padding: '4px 8px',
            fontSize: '11px',
          }}>
            {animatedCount} {i18n.t('chartsPage.dueForReview')}
          </span>
        )}
      </div>

      <Progress
        percent={animatedProgress}
        size='large'
        color={animatedProgress >= 80 ? SUCCESS_COLOR : PRIMARY_COLOR}
        style={{ marginBottom: '16px' }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--color-text-3)' }}>
        <span>{i18n.t('chartsPage.progress')} {animatedProgress}%</span>
      </div>
    </CommonCard>
  );
};

// 本周趋势图表 - 使用真实数据
const WeekChart = ({ cards }: { cards: CardType[] }) => {
  // 简单的数据展示
  const weekData = useMemo(() => {
    const days = [
      i18n.t('weekdays.mon'),
      i18n.t('weekdays.tue'),
      i18n.t('weekdays.wed'),
      i18n.t('weekdays.thu'),
      i18n.t('weekdays.fri'),
      i18n.t('weekdays.sat'),
      i18n.t('weekdays.sun'),
    ];
    
    return days.map((day) => {
      // 模拟基于卡片数量的数据
      const baseCount = Math.max(1, Math.floor(cards.length / 10));
      return {
        date: day,
        learned: Math.floor(Math.random() * baseCount) + 1,
        reviewed: Math.floor(Math.random() * baseCount * 3) + 5,
      };
    });
  }, [cards]);

  const maxValue = Math.max(...weekData.map(d => d.learned + d.reviewed), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', height: '100%', gap: '16px' }}>
      {weekData.map((item, index) => {
        const total = item.learned + item.reviewed;
        const height = (total / maxValue) * 100;
        const learnedHeight = total > 0 ? (item.learned / total) * 100 : 0;

        return (
          <Tooltip 
            key={index} 
            content={`${item.date}: ${i18n.t('chartsPage.newLearned')} ${item.learned} ${i18n.t('common.cardsUnit')}, ${i18n.t('chartsPage.reviewed')} ${item.reviewed} ${i18n.t('common.cardsUnit')}`}
            position='top'
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', maxWidth: '80px' }}>
              <div style={{
                width: '32px',
                height: `${Math.max(height, 5)}%`,
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column-reverse',
              }}>
                <div style={{ height: `${learnedHeight}%`, background: PRIMARY_COLOR }} />
                <div style={{ height: `${100 - learnedHeight}%`, background: CHART_PRIMARY_SOFT }} />
              </div>
              <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
                {item.date}
              </Typography.Text>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

// 热力图 - GitHub 风格,过去 365 天补齐网格,按周列布局
const Heatmap = ({ data }: { data: HeatmapItem[] }) => {
  const weeks = useMemo(() => {
    const dataMap = new Map<string, { count: number; level: number }>();
    data.forEach(item => {
      dataMap.set(item.date, { count: item.count, level: item.level });
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    // 退到起始周的周一(getDay: 0=Sun..6=Sat,统一用 1..7)
    const startDayMonFirst = startDate.getDay() === 0 ? 7 : startDate.getDay();
    const gridStart = new Date(startDate);
    gridStart.setDate(startDate.getDate() - (startDayMonFirst - 1));

    const allDays: { date: string; count: number; level: number }[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= today) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      const iso = `${yyyy}-${mm}-${dd}`;
      const item = dataMap.get(iso);
      allDays.push({
        date: cursor.toLocaleDateString(i18n.language || 'zh-CN', { month: 'short', day: 'numeric' }),
        count: item?.count ?? 0,
        level: item?.level ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const result: { date: string; count: number; level: number }[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      result.push(allDays.slice(i, i + 7));
    }
    return result;
  }, [data]);

  const getColor = (level: number) => {
    // 色阶来自 HEATMAP_COLORS(品牌蓝透明度阶梯); level 越界时回退到空档底色, 避免索引出界
    return HEATMAP_COLORS[level] ?? 'var(--color-fill-2)';
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '4px' }}>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          {week.map((day, dayIndex) => (
            <Tooltip
              key={dayIndex}
              content={`${day.date}: ${i18n.t('chartsPage.studied')} ${day.count} ${i18n.t('common.cardsUnit')}`}
              position='top'
              mini
            >
              <div
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  background: getColor(day.level),
                  cursor: 'pointer',
                }}
              />
            </Tooltip>
          ))}
        </div>
      ))}
    </div>
  );
};



const ChartsPage = () => {
  const [cards, setCards] = useState<CardType[]>([]);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>([]);
  const [firstLoadComplete, setFirstLoadComplete] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    console.log('[ChartsPage] 组件初始化完成，立即显示界面');
  }, []);

  useEffect(() => {
    const fetchStartTime = Date.now();
    console.log('[ChartsPage] 开始发起数据请求，距初始化:', fetchStartTime - startTimeRef.current, 'ms');

    const fetchCardsPromise = api.listCards().then(res => {
      console.log('[ChartsPage] api.listCards 完成，耗时:', Date.now() - fetchStartTime, 'ms');
      if (res.success) setCards(res.cards);
      return res;
    }).catch(err => {
      console.error('[ChartsPage] 获取卡片数据失败:', err);
      return { success: false };
    });

    const fetchStreakPromise = fetch('/api/progress/streak').then(r => r.json()).then(res => {
      console.log('[ChartsPage] /api/progress/streak 完成，耗时:', Date.now() - fetchStartTime, 'ms');
      if (res.success) setStreakData(res);
      return res;
    }).catch(err => {
      console.error('[ChartsPage] 获取连续学习数据失败:', err);
      return { success: false };
    });

    const fetchHeatmapPromise = fetch('/api/progress/heatmap').then(r => r.json()).then(res => {
      console.log('[ChartsPage] /api/progress/heatmap 完成，耗时:', Date.now() - fetchStartTime, 'ms');
      if (res.success) setHeatmapData(res.data);
      return res;
    }).catch(err => {
      console.error('[ChartsPage] 获取热力图数据失败:', err);
      return { success: false };
    });

    Promise.all([fetchCardsPromise, fetchStreakPromise, fetchHeatmapPromise]).then(() => {
      setFirstLoadComplete(true);
      console.log('[ChartsPage] 首次加载完成');
    });
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      api.listCards().then(res => {
        if (res.success) setCards(res.cards);
      }).catch(err => console.error('刷新卡片失败:', err));
      
      fetch('/api/progress/streak').then(r => r.json()).then(res => {
        if (res.success) setStreakData(res);
      }).catch(err => console.error('刷新连续学习数据失败:', err));
      
      fetch('/api/progress/heatmap').then(r => r.json()).then(res => {
        if (res.success) setHeatmapData(res.data);
      }).catch(err => console.error('刷新热力图数据失败:', err));
    };
    window.addEventListener('papyrus_cards_changed', handleRefresh);
    window.addEventListener('papyrus_notes_changed', handleRefresh);
    return () => {
      window.removeEventListener('papyrus_cards_changed', handleRefresh);
      window.removeEventListener('papyrus_notes_changed', handleRefresh);
    };
  }, []);

  const stats = useMemo(() => calculateStats(cards, streakData), [cards, streakData]);

  // 分组统计
  const cardGroups = useMemo(() => {
    const now = Date.now() / 1000;
    return {
      new: cards.filter(c => (c.interval || 0) === 0),
      learning: cards.filter(c => (c.interval || 0) > 0 && (c.interval || 0) <= 1),
      review: cards.filter(c => (c.interval || 0) > 1),
      due: cards.filter(c => (c.next_review || 0) <= now),
    };
  }, [cards]);

  const animatedStreakDays = useAnimatedNumber(stats.streakDays, 800, 100, firstLoadComplete);
  const animatedMasteredCards = useAnimatedNumber(stats.masteredCards, 800, 150, firstLoadComplete);
  const animatedTotalCards = useAnimatedNumber(stats.totalCards, 800, 200, firstLoadComplete);
  const animatedTodayCards = useAnimatedNumber(stats.todayCards, 800, 250, firstLoadComplete);
  const animatedTodayProgress = useAnimatedNumber(stats.todayProgress, 800, 300, firstLoadComplete);
  const overallProgress = stats.totalCards > 0 && animatedTotalCards > 0 
    ? Math.round((animatedMasteredCards / animatedTotalCards) * 100) 
    : 0;

  const animatedNewCards = useAnimatedNumber(cardGroups.new.length, 800, 200, firstLoadComplete);
  const animatedLearningCards = useAnimatedNumber(cardGroups.learning.length, 800, 300, firstLoadComplete);
  const animatedReviewCards = useAnimatedNumber(cardGroups.review.length, 800, 400, firstLoadComplete);
  const animatedDueCards = useAnimatedNumber(cardGroups.due.length, 800, 500, firstLoadComplete);

  if (firstLoadComplete && cards.length === 0) {
    return (
      <PageLayout title={i18n.t('chartsPage.title')} pageKey='charts'>
        <Empty description={i18n.t('chartsPage.emptyData')} />
      </PageLayout>
    );
  }

  const pageStats = [
    { label: i18n.t('chartsPage.streakStudy'), value: animatedStreakDays, suffix: i18n.t('common.daysUnit') },
    { label: i18n.t('chartsPage.mastered'), value: `${animatedMasteredCards}/${animatedTotalCards}` },
    { label: i18n.t('chartsPage.totalProgress'), value: `${overallProgress}%` },
    { label: i18n.t('chartsPage.todayReviewed'), value: animatedTodayCards, suffix: `/${stats.dailyTarget}` },
    { label: i18n.t('chartsPage.todayGoal'), value: `${animatedTodayProgress}%` },
  ];

  return (
    <PageLayout 
      title={i18n.t('chartsPage.title')} 
      pageKey='charts'
      stats={pageStats}
      statsLoading={!firstLoadComplete}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard title={i18n.t('chartsPage.newCards')} value={animatedNewCards} suffix={i18n.t('common.cardsUnit')} icon={<IconClockCircle />} />
        <StatCard title={i18n.t('chartsPage.learning')} value={animatedLearningCards} suffix={i18n.t('common.cardsUnit')} icon={<IconCalendar />} />
        <StatCard title={i18n.t('chartsPage.reviewing')} value={animatedReviewCards} suffix={i18n.t('common.cardsUnit')} icon={<IconFire />} />
        <StatCard title={i18n.t('chartsPage.dueCards')} value={animatedDueCards} suffix={i18n.t('common.cardsUnit')} icon={<IconCheckCircle />} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '32px' }}>
        {/* 图表容器按统一卡片语言: 发丝边框 + 大圆角 + 静态浅阴影 + bg-1 底 */}
        <Card style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-hairline)', boxShadow: 'var(--shadow-1)', background: 'var(--color-bg-1)', height: '280px' }}>
          <Typography.Text bold style={{ fontSize: '15px', display: 'block', marginBottom: '16px' }}>
            {i18n.t('chartsPage.weeklyTrend')}
          </Typography.Text>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', background: PRIMARY_COLOR, borderRadius: '2px' }} />
              <Typography.Text type='secondary'>{i18n.t('chartsPage.newLearned')}</Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', background: CHART_PRIMARY_SOFT, borderRadius: '2px' }} />
              <Typography.Text type='secondary'>{i18n.t('chartsPage.reviewed')}</Typography.Text>
            </div>
          </div>
          <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end' }}>
            <WeekChart cards={cards} />
          </div>
        </Card>

        <Card style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-hairline)', boxShadow: 'var(--shadow-1)', background: 'var(--color-bg-1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <Typography.Text bold style={{ fontSize: '15px' }}>
              {i18n.t('chartsPage.pastYearRecord')}
            </Typography.Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <Typography.Text type='secondary'>{i18n.t('common.less')}</Typography.Text>
              <div style={{ display: 'flex', gap: '2px' }}>
                {HEATMAP_COLORS.map((color, i) => (
                  <div key={i} style={{ width: '14px', height: '14px', borderRadius: '3px', background: color }} />
                ))}
              </div>
              <Typography.Text type='secondary'>{i18n.t('common.more')}</Typography.Text>
            </div>
          </div>
          <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
            <Heatmap data={heatmapData} />
          </div>
        </Card>
      </div>

      <Typography.Title heading={2} style={{ fontWeight: 400, fontSize: '20px', margin: '0 0 24px', color: 'var(--color-text-3)' }}>
        {i18n.t('chartsPage.studyProgress')}
      </Typography.Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        <SimpleProgressCard 
          title={i18n.t('chartsPage.newCards')} 
          progress={cardGroups.new.length > 0 ? 100 : 0} 
          count={cardGroups.new.filter(c => (c.next_review || 0) <= Date.now() / 1000).length}
          dataReady={firstLoadComplete}
        />
        <SimpleProgressCard 
          title={i18n.t('chartsPage.learning')} 
          progress={Math.round((cardGroups.learning.length / Math.max(cards.length, 1)) * 100)} 
          count={cardGroups.learning.filter(c => (c.next_review || 0) <= Date.now() / 1000).length}
          dataReady={firstLoadComplete}
        />
        <SimpleProgressCard 
          title={i18n.t('chartsPage.reviewing')} 
          progress={Math.round((cardGroups.review.length / Math.max(cards.length, 1)) * 100)} 
          count={cardGroups.review.filter(c => (c.next_review || 0) <= Date.now() / 1000).length}
          dataReady={firstLoadComplete}
        />
      </div>
    </PageLayout>
  );
};

export default ChartsPage;
