import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { type = "all" } = req.query; // "all", "weekly"
    
    try {
      let query;
      let params = [];
      
      if (type === "weekly") {
        query = `
          SELECT username, moves, time, created_at
          FROM leaderboard
          WHERE timeout = false
          AND created_at >= date_trunc('week', now())
          AND created_at < date_trunc('week', now()) + interval '7 days'
          ORDER BY moves ASC, time ASC
          LIMIT 10
        `;
      } else {
        query = `
          SELECT username, moves, time, created_at
          FROM leaderboard
          WHERE timeout = false
          ORDER BY moves ASC, time ASC
          LIMIT 10
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
