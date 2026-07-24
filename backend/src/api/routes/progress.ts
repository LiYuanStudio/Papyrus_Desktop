import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/database.js';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function progressRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/streak', async (request, reply) => {
    try {
      const db = getDb();
      const today = getToday();

      const stmt = db.prepare('SELECT * FROM daily_progress ORDER BY date DESC');
      const rows = stmt.all() as Array<{ date: string; cards_reviewed: number }>;

      const todayRow = rows.find(r => r.date === today);
      const todayCompleted = (todayRow?.cards_reviewed ?? 0) > 0;
      const todayCards = todayRow?.cards_reviewed ?? 0;

      let currentStreak = 0;
      const checkDate = new Date();
      while (true) {
        const dateStr = checkDate.toISOString().slice(0, 10);
        const row = rows.find(r => r.date === dateStr);
        if ((row?.cards_reviewed ?? 0) > 0) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }

      let longestStreak = 0;
      let tempStreak = 0;
      let previousReviewedDate: string | null = null;
      const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      for (const row of sortedRows) {
        if (row.cards_reviewed <= 0) continue;

        // 仅当两条有复习记录的日期在 UTC 日历上相邻时延续 streak。
        // 原因：daily_progress 通常不会为空白日期建行，只按已有行累加会跨过缺失日期。
        // 未依赖本地时区 setDate：ISO 日期按 UTC 毫秒比较可避免夏令时导致的 23/25 小时日期。
        const currentTime = Date.parse(`${row.date}T00:00:00Z`);
        const previousTime = previousReviewedDate === null
          ? Number.NaN
          : Date.parse(`${previousReviewedDate}T00:00:00Z`);
        tempStreak = Number.isFinite(previousTime) && currentTime - previousTime === 86_400_000
          ? tempStreak + 1
          : 1;
        longestStreak = Math.max(longestStreak, tempStreak);
        previousReviewedDate = row.date;
      }

      const dailyTarget = 20;
      const progressPercent = Math.min(100, Math.round((todayCards / dailyTarget) * 100));

      reply.send({
        success: true,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        total_days: rows.length,
        today_completed: todayCompleted,
        today_cards: todayCards,
        daily_target: dailyTarget,
        progress_percent: progressPercent,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.get('/history', async (request, reply) => {
    try {
      const { days = '30' } = request.query as { days?: string };
      const parsedDays = parseInt(days, 10);
      const numDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 30;
      const db = getDb();
      const stmt = db.prepare('SELECT * FROM daily_progress ORDER BY date DESC LIMIT ?');
      const rows = stmt.all(numDays) as Array<{
        date: string;
        cards_created: number;
        cards_reviewed: number;
        notes_created: number;
        study_minutes: number;
      }>;

      reply.send({
        success: true,
        history: rows.map(r => ({
          date: r.date,
          cards_created: r.cards_created,
          cards_reviewed: r.cards_reviewed,
          notes_created: r.notes_created,
          study_minutes: r.study_minutes,
        })),
        days: numDays,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.get('/heatmap', async (request, reply) => {
    try {
      const { days = '365' } = request.query as { days?: string };
      const parsedDays = parseInt(days, 10);
      const numDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 365;
      const db = getDb();
      const stmt = db.prepare('SELECT * FROM daily_progress ORDER BY date DESC LIMIT ?');
      const rows = stmt.all(numDays) as Array<{ date: string; cards_reviewed: number }>;

      const data = rows.map(r => {
        const count = r.cards_reviewed;
        let level = 0;
        if (count > 0) level = 1;
        if (count >= 5) level = 2;
        if (count >= 15) level = 3;
        return { date: r.date, count, level };
      });

      const totalCards = rows.reduce((sum, r) => sum + r.cards_reviewed, 0);

      reply.send({
        success: true,
        data,
        total_days: numDays,
        total_cards: totalCards,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });
}
