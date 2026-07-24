export interface CardState {
  ef?: number;
  repetitions?: number;
  interval?: number;
  next_review?: number;
}

export function applySm2(card: CardState, grade: number, now?: number): { intervalDays: number; ef: number } {
  const currentTimestamp = now ?? Date.now() / 1000;

  const efRaw = card.ef;
  let ef = typeof efRaw === 'number' && !Number.isNaN(efRaw) ? efRaw : 2.5;

  const repRaw = card.repetitions;
  let repetitions = typeof repRaw === 'number' && !Number.isNaN(repRaw) ? Math.max(0, Math.floor(repRaw)) : 0;

  const qualityMap: Record<number, number> = { 1: 1, 2: 3, 3: 5 };
  let quality = qualityMap[grade] ?? 3;
  if (grade < 1) quality = 1;
  if (grade > 3) quality = 3;

  let intervalDays: number;

  if (quality >= 3) {
    if (repetitions === 0) {
      intervalDays = 1.0;
    } else if (repetitions === 1) {
      intervalDays = 6.0;
    } else {
      const intervalRaw = card.interval;
      // 将缺失、非数值或非正间隔恢复为一天基量，避免旧数据的 interval=0 让卡片永久立即到期。
      // 原因：第三次及后续复习依赖上次间隔递推，零值会在每次计算中继续保持为零。
      // 未使用简单空值合并：nullish coalescing 不会覆盖 0、负数和 NaN 这些损坏数据。
      const intervalVal = typeof intervalRaw === 'number' && Number.isFinite(intervalRaw) && intervalRaw > 0
        ? intervalRaw
        : 86400.0;
      intervalDays = (intervalVal / 86400.0) * ef;
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    intervalDays = 1.0;
  }

  ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  ef = Math.max(1.3, ef);

  const intervalSeconds = intervalDays * 86400.0;
  card.next_review = currentTimestamp + intervalSeconds;
  card.interval = intervalSeconds;
  card.ef = Math.round(ef * 100) / 100;
  card.repetitions = repetitions;

  return { intervalDays, ef };
}
