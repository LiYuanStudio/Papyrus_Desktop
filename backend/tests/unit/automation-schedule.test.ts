import { calculateNextRun } from '../../src/core/automation-schedule.js';

describe('automation schedule calculation', () => {
  it('uses the current hourly slot when its configured minute is still ahead', () => {
    const after = new Date(2026, 7, 3, 10, 16, 30).getTime() / 1000;
    const next = calculateNextRun({ kind: 'hourly', intervalHours: 2, minute: 30 }, after);

    expect(new Date(next * 1000)).toEqual(new Date(2026, 7, 3, 10, 30, 0));
  });

  it('advances by the configured interval after or exactly on the hourly slot', () => {
    const afterSlot = new Date(2026, 7, 3, 10, 31, 0).getTime() / 1000;
    const exactlyOnSlot = new Date(2026, 7, 3, 10, 30, 0).getTime() / 1000;

    expect(new Date(calculateNextRun(
      { kind: 'hourly', intervalHours: 2, minute: 30 },
      afterSlot,
    ) * 1000)).toEqual(new Date(2026, 7, 3, 12, 30, 0));
    expect(new Date(calculateNextRun(
      { kind: 'hourly', intervalHours: 2, minute: 30 },
      exactlyOnSlot,
    ) * 1000)).toEqual(new Date(2026, 7, 3, 12, 30, 0));
  });

  it('carries hourly intervals across midnight', () => {
    const after = new Date(2026, 7, 3, 23, 31, 0).getTime() / 1000;
    const next = calculateNextRun({ kind: 'hourly', intervalHours: 2, minute: 30 }, after);

    expect(new Date(next * 1000)).toEqual(new Date(2026, 7, 4, 1, 30, 0));
  });

  it('keeps a daily slot today when it is ahead and moves exact or past slots to tomorrow', () => {
    const before = new Date(2026, 7, 3, 8, 0, 0).getTime() / 1000;
    const exact = new Date(2026, 7, 3, 9, 15, 0).getTime() / 1000;
    const schedule = { kind: 'daily' as const, hour: 9, minute: 15 };

    expect(new Date(calculateNextRun(schedule, before) * 1000))
      .toEqual(new Date(2026, 7, 3, 9, 15, 0));
    expect(new Date(calculateNextRun(schedule, exact) * 1000))
      .toEqual(new Date(2026, 7, 4, 9, 15, 0));
  });

  it('selects the nearest configured weekday including today before its time', () => {
    const mondayBefore = new Date(2026, 7, 3, 7, 0, 0).getTime() / 1000;
    const mondayAfter = new Date(2026, 7, 3, 10, 0, 0).getTime() / 1000;
    const schedule = { kind: 'weekly' as const, daysOfWeek: [1, 3, 5], hour: 8, minute: 0 };

    expect(new Date(calculateNextRun(schedule, mondayBefore) * 1000))
      .toEqual(new Date(2026, 7, 3, 8, 0, 0));
    expect(new Date(calculateNextRun(schedule, mondayAfter) * 1000))
      .toEqual(new Date(2026, 7, 5, 8, 0, 0));
  });

  it('wraps weekly schedules into the following week', () => {
    const mondayAfter = new Date(2026, 7, 3, 10, 0, 0).getTime() / 1000;
    const next = calculateNextRun(
      { kind: 'weekly', daysOfWeek: [1], hour: 8, minute: 0 },
      mondayAfter,
    );

    expect(new Date(next * 1000)).toEqual(new Date(2026, 7, 10, 8, 0, 0));
  });

  it('returns a finite seven-day fallback for corrupted weekly data', () => {
    const after = new Date(2026, 7, 3, 10, 0, 0).getTime() / 1000;

    expect(calculateNextRun(
      { kind: 'weekly', daysOfWeek: [], hour: 8, minute: 0 },
      after,
    )).toBe(after + 7 * 24 * 60 * 60);
  });
});