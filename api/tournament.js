import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const { round, mode = "single" } = req.query; // mode can be "single" or "combined"

  if (!round) {
    return res.status(400).json({ error: "Round number required" });
  }

  try {
    let result;
    
    if (mode === "combined") {
      // For tournament mode: combine scores from all rounds, show all participants
      result = await pool.query(
        `SELECT 
          username,
          SUM(moves) as total_moves,
          SUM(time) as total_time,
          COUNT(CASE WHEN timeout = false THEN 1 END) as rounds_completed,
          ARRAY_AGG(round ORDER BY round) as completed_rounds,
          COUNT(CASE WHEN timeout = true THEN 1 END) as timeout_rounds
         FROM leaderboard
         WHERE round IN (1, 2, 3, 4, 5)
         AND created_at >= date_trunc('week', now())
         AND created_at < date_trunc('week', now()) + interval '7 days'
         AND timeout = false
         GROUP BY username
         ORDER BY rounds_completed DESC, total_moves ASC, total_time ASC`
      );
    } else {
      // Single round leaderboard
      result = await pool.query(
        `SELECT username, moves, time, created_at
         FROM leaderboard
         WHERE timeout = false
         AND round = $1
         AND created_at >= date_trunc('week', now())
         AND created_at < date_trunc('week', now()) + interval '7 days'
         ORDER BY moves ASC, time ASC
         LIMIT 10`,
        [round]
      );
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching tournament leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch tournament leaderboard" });
  }
}
