import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const result = await pool.query(
        `SELECT id, schedule_start FROM tournament_schedule ORDER BY schedule_start ASC LIMIT 100`
      );
      return res.status(200).json(result.rows);
    }

    if (req.method === "POST") {
      const { schedule_start } = req.body;
      if (!schedule_start) {
        return res.status(400).json({ error: "schedule_start is required" });
      }
      const start = new Date(schedule_start);
      const result = await pool.query(
        `INSERT INTO tournament_schedule (schedule_start, created_at, updated_at)
         VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
        [start]
      );
      return res.status(201).json(result.rows[0]);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("/api/schedule error:", err);
    return res.status(500).json({ error: "Schedule operation failed" });
  }
}


