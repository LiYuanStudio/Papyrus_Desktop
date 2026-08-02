import { calculateNextRun } from '../../src/core/automation-schedule.js';

describe('automation schedule calculation', () => {
  it('calculates the next hourly slot', () => {
    const after = new Date(2026, 7, 3, 10, 16, 30).getTime() / 1000;
    const next = calculateNextRun({ kind: 'hourly', intervalHours: 2, minute: 30 }, after);
    expect(new Date(next * 1000)).toEqual(new Date(2026, 7, 3, 10, 30, 0));
  });

  it('moves daily schedules to tomorrow after the configured time', () => {
    const after = new Date(2026, 7, 3, 10, 0, 0).getTime() / 1000;
    const next = calculateNextRun({ kind: 'daily', hour: 9, minute: 15 }, after);
    expect(new Date(next * 1000)).toEqual(new Date(2026, 7, 4, 9, 15, 0));
  });

  it('selects the next configured weekday', () => {
    const after = new Date(2026, 7, 3, 10, 0, 0).getTime() / 1000; // Monday
    const next = calculateNextRun({ kind: 'weekly', daysOfWeek: [3, 5], hour: 8, minute: 0 }, after);
    expect(new Date(next * 1000)).toEqual(new Date(2026, 7, 5, 8, 0, 0));
  });
});
