import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';

describe('Cards', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-cards-test-${Date.now()}`);

  let createCard: typeof import('../../src/core/cards.js').createCard;
  let updateCard: typeof import('../../src/core/cards.js').updateCard;
  let deleteCard: typeof import('../../src/core/cards.js').deleteCard;
  let getAllCards: typeof import('../../src/core/cards.js').getAllCards;
  let getNextDueCard: typeof import('../../src/core/cards.js').getNextDueCard;
  let rateCard: typeof import('../../src/core/cards.js').rateCard;
  let importCardsFromTxt: typeof import('../../src/core/cards.js').importCardsFromTxt;
  let getCardStats: typeof import('../../src/core/cards.js').getCardStats;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;

    const cards = await import('../../src/core/cards.js');
    createCard = cards.createCard;
    updateCard = cards.updateCard;
    deleteCard = cards.deleteCard;
    getAllCards = cards.getAllCards;
    getNextDueCard = cards.getNextDueCard;
    rateCard = cards.rateCard;
    importCardsFromTxt = cards.importCardsFromTxt;
    getCardStats = cards.getCardStats;
  });

  afterAll(async () => {
    const { closeDb } = await import('../../src/db/database.js');
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    getAllCards().forEach((c) => deleteCard(c.id));
  });

  describe('createCard', () => {
    it('should create a card with default values', () => {
      const card = createCard('Q1', 'A1');

      expect(card.q).toBe('Q1');
      expect(card.a).toBe('A1');
      expect(card.interval).toBe(0);
      expect(card.ef).toBe(2.5);
      expect(card.repetitions).toBe(0);
      expect(typeof card.id).toBe('string');
      expect(card.id).toHaveLength(32);
    });

    it('should create a card with tags', () => {
      const card = createCard('Q', 'A', ['tag1', 'tag2']);
      expect(card.tags).toEqual(['tag1', 'tag2']);
    });

    it('should log when logger is provided', () => {
      const logger = { info: jest.fn(), error: jest.fn(), logEvent: jest.fn() };
      // @ts-expect-error - mock logger for test coverage
      createCard('Q', 'A', [], logger);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('updateCard', () => {
    it('should update card fields', async () => {
      const card = createCard('Old Q', 'Old A');
      const updated = await updateCard(card.id, { q: 'New Q', a: 'New A', tags: ['updated'] });

      if (updated === null) throw new Error('expected updated card');
      expect(updated.q).toBe('New Q');
      expect(updated.a).toBe('New A');
      expect(updated.tags).toEqual(['updated']);
    });

    it('should return null for non-existent card', async () => {
      const result = await updateCard('non-existent', { q: 'New' });
      expect(result).toBeNull();
    });

    it('should handle partial updates', async () => {
      const card = createCard('Q', 'A', ['tag']);
      const updated = await updateCard(card.id, { q: 'New Q' });
      if (updated === null) throw new Error('expected updated card');

      expect(updated.q).toBe('New Q');
      expect(updated.a).toBe('A');
      expect(updated.tags).toEqual(['tag']);
    });
  });

  describe('deleteCard', () => {
    it('should delete an existing card', () => {
      const card = createCard('Q', 'A');
      expect(deleteCard(card.id)).toBe(true);
      expect(getAllCards().find((c) => c.id === card.id)).toBeUndefined();
    });

    it('should return false for non-existent card', () => {
      expect(deleteCard('non-existent')).toBe(false);
    });
  });

  describe('getNextDueCard', () => {
    it('should return null when no cards are due', () => {
      expect(getNextDueCard()).toBeNull();
    });

    it('should return a due card', () => {
      createCard('Q', 'A');
      const due = getNextDueCard();
      if (due === null) throw new Error('expected due card');
      expect(due.q).toBe('Q');
    });

    it('should not return future cards', async () => {
      const card = createCard('Q', 'A');
      await rateCard(card.id, 3);

      const due = getNextDueCard();
      expect(due).toBeNull();
    });
  });

  describe('rateCard', () => {
    it('should update card with grade 3 (good)', async () => {
      const card = createCard('Q', 'A');
      const result = await rateCard(card.id, 3);

      if (result === null) throw new Error('expected rating result');
      expect(result.intervalDays).toBe(1.0);
      expect(result.card.repetitions).toBe(1);
    });

    it('should reset card with grade 1 (again)', async () => {
      const card = createCard('Q', 'A');
      await rateCard(card.id, 3);
      const result = await rateCard(card.id, 1);

      if (result === null) throw new Error('expected rating result');
      expect(result.intervalDays).toBe(1.0);
      expect(result.card.repetitions).toBe(0);
    });

    it('should return null for non-existent card', async () => {
      const result = await rateCard('non-existent', 3);
      expect(result).toBeNull();
    });

    it('should increase interval on successive good reviews', async () => {
      const card = createCard('Q', 'A');
      const r1 = await rateCard(card.id, 3);
      const r2 = await rateCard(card.id, 3);
      if (r1 === null || r2 === null) throw new Error('expected rating results');

      expect(r2.intervalDays).toBeGreaterThan(r1.intervalDays);
    });

    it('should log when logger is provided', async () => {
      const card = createCard('Q', 'A');
      const logger = { info: jest.fn(), error: jest.fn(), logEvent: jest.fn() };
      // @ts-expect-error - mock logger for test coverage
      await rateCard(card.id, 3, logger);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('importCardsFromTxt', () => {
    it('should import cards from tab-separated text', () => {
      const content = 'Q1\tA1\ttag1,tag2\nQ2\tA2';
      const cards = importCardsFromTxt(content);

      expect(cards.length).toBe(2);
      if (cards[0] === undefined || cards[1] === undefined) throw new Error('expected cards');
      expect(cards[0].q).toBe('Q1');
      expect(cards[0].a).toBe('A1');
      expect(cards[0].tags).toEqual(['tag1', 'tag2']);
      expect(cards[1].q).toBe('Q2');
      expect(cards[1].a).toBe('A2');
    });

    it('should import cards from ===-separated text', () => {
      const content = 'Q1 === A1\nQ2 === A2 === tag1,tag2';
      const cards = importCardsFromTxt(content);

      expect(cards.length).toBe(2);
      if (cards[0] === undefined || cards[1] === undefined) throw new Error('expected cards');
      expect(cards[0].q).toBe('Q1');
      expect(cards[0].a).toBe('A1');
      expect(cards[0].tags).toEqual([]);
      expect(cards[1].q).toBe('Q2');
      expect(cards[1].a).toBe('A2');
      expect(cards[1].tags).toEqual(['tag1', 'tag2']);
    });

    it('should skip lines without recognized separator', () => {
      const content = 'Q1\tA1\nno-separator-line\nQ2 === A2';
      const cards = importCardsFromTxt(content);
      expect(cards.length).toBe(2);
    });

    it('should skip cards with empty question or answer', () => {
      const content = '  === A1\nQ2 ===  \nQ3 === A3';
      const cards = importCardsFromTxt(content);
      expect(cards.length).toBe(1);
      if (cards[0] === undefined) throw new Error('expected card');
      expect(cards[0].q).toBe('Q3');
      expect(cards[0].a).toBe('A3');
    });

    it('should return empty array for empty content', () => {
      expect(importCardsFromTxt('')).toEqual([]);
      expect(importCardsFromTxt('   \n   ')).toEqual([]);
    });

    it('should log when logger is provided', () => {
      const logger = { info: jest.fn(), error: jest.fn(), logEvent: jest.fn() };
      // @ts-expect-error - mock logger for test coverage
      importCardsFromTxt('Q\tA', logger);
      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('getCardStats', () => {
    it('should return total count', () => {
      const stats = getCardStats();
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.due).toBe('number');
    });

    it('should reflect created cards', () => {
      createCard('Q', 'A');
      const stats = getCardStats();
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  describe('createCard edge cases', () => {
    it('should create card with empty q or a (document actual behavior)', () => {
      const card = createCard('', 'A');
      expect(card.q).toBe('');
      expect(card.a).toBe('A');
    });
  });

  describe('rateCard edge cases', () => {
    it('should return null for non-existent cardId', async () => {
      const result = await rateCard('nonexistent123', 3);
      expect(result).toBeNull();
    });
  });

  describe('importCardsFromTxt edge cases', () => {
    it('should handle mixed delimiters', () => {
      const content = 'Q1 === A1\nQ2\tA2';
      const cards = importCardsFromTxt(content);
      expect(cards.length).toBe(2);
    });

    it('should skip lines without delimiters', () => {
      const content = 'no delimiter here\nQ === A';
      const cards = importCardsFromTxt(content);
      expect(cards.length).toBe(1);
      expect(cards[0]!.q).toBe('Q');
    });

    it('should handle extra whitespace around parts', () => {
      const content = '  Q  ===  A  ';
      const cards = importCardsFromTxt(content);
      expect(cards.length).toBe(1);
      expect(cards[0]!.q).toBe('Q');
      expect(cards[0]!.a).toBe('A');
    });
  });
});
