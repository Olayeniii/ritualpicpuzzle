import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await pool.query(
        `SELECT id, mode, total_rounds, created_by, created_at, updated_at, status, current_round
         FROM tournaments
         ORDER BY created_at DESC
         LIMIT 50`
      );
      return res.status(200).json(result.rows);
    }

    if (req.method === "POST") {
      const { mode = 'manual', total_rounds = 5, created_by = null } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tRes = await client.query(
          `INSERT INTO tournaments (mode, total_rounds, created_by, status, current_round, created_at, updated_at)
           VALUES ($1, $2, $3, 'prep', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING *`,
          [mode, total_rounds, created_by]
        );
        const t = tRes.rows[0];
        const inserts = [];
        for (let r = 1; r <= total_rounds; r += 1) {
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
        return res.status(201).json(t);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error("Create tournament error:", e);
        return res.status(500).json({ error: "Failed to create tournament" });
      } finally {
        client.release();
      }
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("/api/tournaments error:", err);
    return res.status(500).json({ error: "Tournaments operation failed" });
  }
}


