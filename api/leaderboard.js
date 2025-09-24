import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { type = "all" } = req.query; // "all", "weekly", "latest"
    
    try {
      let query;
      let params = [];
      
      if (type === "latest") {
        // Today-only, per-user best: lowest moves, then lowest time, then latest entry
        // Exclude timeouts and zero/invalid times
        query = `
          SELECT username, moves, time, created_at
          FROM (
            SELECT DISTINCT ON (username)
              username, moves, time, created_at
            FROM leaderboard
            WHERE (timeout = false OR timeout IS NULL)
              AND time > 0 AND time < 300
              AND created_at >= date_trunc('day', now())
              AND created_at < date_trunc('day', now()) + interval '1 day'
            ORDER BY username, moves ASC, time ASC, created_at DESC
          ) AS best_today
          ORDER BY moves ASC, time ASC
        `;
      } else if (type === "weekly") {
        query = `
          SELECT username, moves, time, created_at
          FROM leaderboard l1
          WHERE (timeout = false OR timeout IS NULL)
          AND time < 300
          AND created_at >= date_trunc('week', now())
          AND created_at < date_trunc('week', now()) + interval '7 days'
          AND moves = (
            SELECT MIN(moves) 
            FROM leaderboard l2 
            WHERE l2.username = l1.username 
            AND (l2.timeout = false OR l2.timeout IS NULL)
            AND l2.time < 300
            AND l2.created_at >= date_trunc('week', now())
            AND l2.created_at < date_trunc('week', now()) + interval '7 days'
          )
          AND created_at = (
            SELECT MAX(created_at)
            FROM leaderboard l3
            WHERE l3.username = l1.username 
            AND l3.moves = l1.moves
            AND (l3.timeout = false OR l3.timeout IS NULL)
            AND l3.time < 300
            AND l3.created_at >= date_trunc('week', now())
            AND l3.created_at < date_trunc('week', now()) + interval '7 days'
          )
          ORDER BY moves ASC, time ASC
        `;
      } else {
        query = `
          SELECT username, moves, time, created_at
          FROM leaderboard l1
          WHERE (timeout = false OR timeout IS NULL)
          AND time < 300
          AND moves = (
            SELECT MIN(moves) 
            FROM leaderboard l2 
            WHERE l2.username = l1.username 
            AND (l2.timeout = false OR l2.timeout IS NULL)
            AND l2.time < 300
          )
          AND created_at = (
            SELECT MAX(created_at)
            FROM leaderboard l3
            WHERE l3.username = l1.username 
            AND l3.moves = l1.moves
            AND (l3.timeout = false OR l3.timeout IS NULL)
            AND l3.time < 300
          )
          ORDER BY moves ASC, time ASC
        `;
      }
      
      const result = await pool.query(query, params);
      res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
