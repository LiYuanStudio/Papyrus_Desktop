import type { AutomationSchedule } from './automation-types.js';

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * 计算给定计划在当前系统本地时区中的下一次执行时间。
 * 原因：系统 Date 原生处理本地夏令时，且首版不允许选择其他时区。
 * 未引入 Cron 或日期库：结构化三类计划只需有限的日历运算。
 */
export function calculateNextRun(schedule: AutomationSchedule, afterTimestamp: number): number {
  const after = new Date(afterTimestamp * 1000);
  const candidate = new Date(after);
  candidate.setSeconds(0, 0);

  if (schedule.kind === 'hourly') {
    candidate.setMinutes(schedule.minute, 0, 0);
    const currentHour = candidate.getHours();
    const alignedHour = Math.ceil(currentHour / schedule.intervalHours) * schedule.intervalHours;
    candidate.setHours(alignedHour, schedule.minute, 0, 0);
    if (candidate.getTime() <= after.getTime()) {
      candidate.setHours(candidate.getHours() + schedule.intervalHours, schedule.minute, 0, 0);
    }
    return candidate.getTime() / 1000;
  }

  candidate.setHours(schedule.hour, schedule.minute, 0, 0);
  if (schedule.kind === 'daily') {
    if (candidate.getTime() <= after.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate.getTime() / 1000;
  }

  const selectedDays = new Set(schedule.daysOfWeek);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const weeklyCandidate = new Date(candidate);
    weeklyCandidate.setDate(candidate.getDate() + dayOffset);
    if (
      selectedDays.has(weeklyCandidate.getDay())
      && weeklyCandidate.getTime() > after.getTime()
    ) {
      return weeklyCandidate.getTime() / 1000;
    }
  }

  // 校验层保证至少选择一天；此回退只防止损坏的历史数据让调度循环失效。
  // 原因：返回有限未来时间比抛错阻断所有任务更可恢复。
  // 未返回当前时间：立即重复触发会形成忙循环。
  return afterTimestamp + SECONDS_PER_DAY * 7;
}

