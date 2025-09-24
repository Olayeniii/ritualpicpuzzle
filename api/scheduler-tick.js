import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Scheduler tick endpoint
// Call this periodically (e.g., every minute) to launch tournaments whose
// schedule_start is due. It creates a tournaments row (mode='auto') and
// pre-creates rounds (pending) if none linked yet for that schedule entry.

export default async function handler(req, res) {
  const totalRounds = 5; // can be made configurable later

  try {
    if (req.method === "GET") {
      const now = new Date();
      const due = await pool.query(
        `SELECT s.id, s.schedule_start
         FROM tournament_schedule s
         LEFT JOIN tournaments t ON t.schedule_id = s.id
         WHERE t.id IS NULL AND s.schedule_start <= NOW()
         ORDER BY s.schedule_start ASC
         LIMIT 10`
      );
      const upcoming = await pool.query(
        `SELECT s.id, s.schedule_start
         FROM tournament_schedule s
         LEFT JOIN tournaments t ON t.schedule_id = s.id
         WHERE t.id IS NULL AND s.schedule_start > NOW()
         ORDER BY s.schedule_start ASC
         LIMIT 10`
      );
      return res.status(200).json({ now, due: due.rows, upcoming: upcoming.rows });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    // Find due schedules that are not yet consumed by a tournaments row
    const dueRes = await pool.query(
      `SELECT s.id, s.schedule_start
       FROM tournament_schedule s
       LEFT JOIN tournaments t ON t.schedule_id = s.id
       WHERE t.id IS NULL AND s.schedule_start <= NOW()
       ORDER BY s.schedule_start ASC
       LIMIT 10`
    );

    if (dueRes.rows.length === 0) {
      return res.status(200).json({ created: 0, tournaments: [] });
    }

    const created = [];
    for (const row of dueRes.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tRes = await client.query(
          `INSERT INTO tournaments (schedule_id, mode, total_rounds, status, current_round, created_at, updated_at)
           VALUES ($1, 'auto', $2, 'prep', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING *`,
          [row.id, totalRounds]
        );
        const t = tRes.rows[0];
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
        created.push({ id: t.id, schedule_id: row.id, schedule_start: row.schedule_start });
      } catch (e) {
        await client.query('ROLLBACK');
        // Log and continue to next schedule row
        console.error('scheduler-tick create error:', e);
      } finally {
        client.release();
      }
    }

    return res.status(200).json({ created: created.length, tournaments: created });
  } catch (err) {
    console.error('/api/scheduler-tick error:', err);
    return res.status(500).json({ error: 'Scheduler tick failed' });
  }
}


