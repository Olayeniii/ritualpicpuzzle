import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    // Allow Vercel Cron header OR Bearer secret
    const cronSecret = req.headers.authorization?.replace('Bearer ', '');
    const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['x-vercel-cron'] === 'true';
    if (!isVercelCron && cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Daily tasks aligned with vercel.json (runs once per day at 00:00 UTC)
      const today = new Date();
      const day = today.getUTCDay(); // 0 = Sunday
      if (day === 0) {
        await runWeeklyReset();
      }
      await refreshLeaderboard();

      const adminUsername = 'system-cron';
      const totalRounds = 5;
      
      // Find scheduled tournaments that need to be created (25 hours before start)
      const dueRes = await pool.query(
        `SELECT s.id, s.scheduled_start
         FROM tournament_schedule s
         LEFT JOIN tournaments t ON t.schedule_id = s.id
         WHERE t.id IS NULL 
         AND s.scheduled_start <= NOW() + INTERVAL '25 hours'
         AND s.scheduled_start >= NOW() - INTERVAL '1 hour'
         ORDER BY s.scheduled_start ASC
         LIMIT 10`
      );

      const created = [];
      for (const row of dueRes.rows) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tRes = await client.query(
            `INSERT INTO tournaments (schedule_id, mode, total_rounds, status, current_round, created_by, created_at, updated_at)
             VALUES ($1, 'auto', $2, 'prep', 0, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING *`,
            [row.id, totalRounds, adminUsername]
          );
          const t = tRes.rows[0];
          
          // Create rounds for this tournament
          const inserts = [];
          for (let r = 1; r <= totalRounds; r += 1) {
            inserts.push(
              client.query(
                `INSERT INTO rounds (tournament_id, round_number, status, created_at, updated_at)
                 VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [t.id, r]
              )
            );
          }
          await Promise.all(inserts);
          await client.query('COMMIT');
          created.push({ id: t.id, schedule_id: row.id, scheduled_start: row.scheduled_start });
          console.log(`Cron: Created tournament ${t.id} for ${row.scheduled_start}`);
        } catch (e) {
          await client.query('ROLLBACK');
          console.error('Cron scheduler create error:', e);
        } finally {
          client.release();
        }
      }
      
      return res.status(200).json({ 
        success: true, 
        created: created.length, 
        tournaments: created,
        day
      });
    } catch (err) {
      console.error("Cron scheduler error:", err);
      res.status(500).json({ error: "Cron scheduler failed" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// Example daily helpers (stubs you can expand with real logic)
async function runWeeklyReset() {
  try {
    console.log("Weekly game reset triggered");
    // e.g., archive or summarize weekly stats, rotate weekly leaderboards, etc.
  } catch (e) {
    console.error("runWeeklyReset error:", e);
  }
}

async function refreshLeaderboard() {
  try {
    console.log("Daily leaderboard refresh triggered");
    // e.g., recompute cached aggregates, clean temp data, etc.
  } catch (e) {
    console.error("refreshLeaderboard error:", e);
  }
}


