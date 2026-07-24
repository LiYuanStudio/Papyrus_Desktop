import { applySm2, type CardState } from '../../src/core/sm2.js';

describe('SM-2 Algorithm', () => {
  it('should reset card on grade 1 (forget)', () => {
    const card: CardState = { ef: 2.5, repetitions: 5, interval: 86400 };
    const result = applySm2(card, 1, 1000);

    expect(result.intervalDays).toBe(1.0);
    expect(card.repetitions).toBe(0);
    expect(card.ef).toBeLessThan(2.5);
  });

  it('should set 1 day interval on first successful review (grade 3)', () => {
    const card: CardState = { ef: 2.5, repetitions: 0 };
    const result = applySm2(card, 3, 1000);

    expect(result.intervalDays).toBe(1.0);
    expect(card.repetitions).toBe(1);
    expect(card.ef).toBeGreaterThanOrEqual(1.3);
  });

  it('should treat grade 2 (vague) as pass, not reset', () => {
    const card: CardState = { ef: 2.5, repetitions: 5, interval: 86400 };
    const result = applySm2(card, 2, 1000);

    expect(card.repetitions).toBe(6);
    expect(result.intervalDays).toBeGreaterThan(1);
    expect(card.ef).toBeGreaterThanOrEqual(1.3);
  });

  it('should set 6 day interval on second successful review (grade 3)', () => {
    const card: CardState = { ef: 2.5, repetitions: 1 };
    const result = applySm2(card, 3, 1000);

    expect(result.intervalDays).toBe(6.0);
    expect(card.repetitions).toBe(2);
  });

  it('should increase interval on third successful review (grade 3)', () => {
    const card: CardState = { ef: 2.5, repetitions: 2, interval: 6 * 86400 };
    const result = applySm2(card, 3, 1000);

    expect(result.intervalDays).toBeGreaterThan(6);
    expect(card.repetitions).toBe(3);
  });

  it('should not let ef drop below 1.3', () => {
    const card: CardState = { ef: 1.3, repetitions: 2, interval: 86400 };
    applySm2(card, 1, 1000);

    expect(card.ef).toBe(1.3);
  });

  it('should update next_review timestamp', () => {
    const now = 1000000;
    const card: CardState = {};
    applySm2(card, 3, now);

    expect(card.next_review).toBeGreaterThan(now);
  });
});

describe('SM-2 Algorithm Edge Cases', () => {
  it('should treat invalid grade (>3) as default quality 3', () => {
    const card: CardState = { ef: 2.5, repetitions: 0 };
    applySm2(card, 4, 1000);
    expect(card.repetitions).toBe(1);
  });

  it('should handle grade 0 (not in qualityMap)', () => {
    const card: CardState = { ef: 2.5, repetitions: 2, interval: 6 * 86400 };
    applySm2(card, 0, 1000);
    expect(card.repetitions).toBe(0);
  });

  it('should handle completely empty card state', () => {
    const card: CardState = {};
    const result = applySm2(card, 3, 1000);
    expect(result.ef).toBe(2.6);
    expect(card.interval).toBe(86400);
    expect(card.repetitions).toBe(1);
  });

  it('should clamp negative repetitions to 0 then increment', () => {
    const card: CardState = { ef: 2.5, repetitions: -5 };
    applySm2(card, 3, 1000);
    expect(card.repetitions).toBe(1);
  });

  it('should handle NaN ef by falling back to 2.5', () => {
    const card: CardState = { ef: NaN, repetitions: 0 };
    const result = applySm2(card, 3, 1000);
    expect(result.ef).toBeGreaterThanOrEqual(1.3);
    expect(card.repetitions).toBe(1);
  });

  it('should recover a legacy zero interval before recursive scheduling', () => {
    const card: CardState = { ef: 2.5, repetitions: 2, interval: 0 };
    const result = applySm2(card, 3, 1000);

    expect(result.intervalDays).toBe(2.5);
    expect(card.interval).toBe(2.5 * 86400);
    expect(card.next_review).toBe(1000 + 2.5 * 86400);
  });

  it('should use Date.now when now is not provided', () => {
    const card: CardState = {};
    applySm2(card, 3);
    expect(card.next_review).toBeGreaterThan(0);
  });
});

describe('SM-2 Continuous Use Cases', () => {
  it('ef never drops below 1.3 after repeated grade 1 failures', () => {
    const card: CardState = { ef: 2.5, repetitions: 5, interval: 86400 };
    for (let i = 0; i < 10; i++) {
      applySm2(card, 1, 1000 + i * 86400);
      expect(card.ef).toBeGreaterThanOrEqual(1.3);
      expect(card.repetitions).toBe(0);
    }
  });

  it('interval monotonically increases with consecutive grade 3', () => {
    const card: CardState = { ef: 2.5, repetitions: 0 };
    let prevInterval = 0;
    for (let i = 0; i < 5; i++) {
      const result = applySm2(card, 3, 1000 + i * prevInterval * 1000);
      if (i > 1) {
        expect(result.intervalDays).toBeGreaterThan(prevInterval);
      }
      prevInterval = result.intervalDays;
    }
  });
});
