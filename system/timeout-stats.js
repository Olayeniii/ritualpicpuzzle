import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { type = "weekly" } = req.query;
    
    try {
      let timeCondition = "";
      if (type === "weekly") {
        timeCondition = `AND created_at >= date_trunc('week', now())
                        AND created_at < date_trunc('week', now()) + interval '7 days'`;
      }
      
      // Get timeout statistics
      const timeoutStats = await pool.query(`
        SELECT 
          username,
          COUNT(*) as total_attempts,
          COUNT(CASE WHEN timeout = false THEN 1 END) as completed_games,
          COUNT(CASE WHEN timeout = true THEN 1 END) as timeout_games,
          MIN(CASE WHEN timeout = false THEN moves END) as best_moves,
          MIN(CASE WHEN timeout = false THEN time END) as best_time,
          ROUND(
            (COUNT(CASE WHEN timeout = false THEN 1 END)::FLOAT / COUNT(*)::FLOAT) * 100, 
            1
          ) as completion_rate
        FROM leaderboard
        WHERE true ${timeCondition}
        GROUP BY username
        HAVING COUNT(*) >= 3
        ORDER BY completion_rate DESC, best_moves ASC
        LIMIT 20
      `);
      
      // Get recent timeout entries for transparency
      const recentTimeouts = await pool.query(`
        SELECT username, moves, time, created_at, round
        FROM leaderboard
        WHERE timeout = true ${timeCondition}
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      res.status(200).json({
        stats: timeoutStats.rows,
        recentTimeouts: recentTimeouts.rows
      });
      
    } catch (err) {
      console.error("Error fetching timeout stats:", err);
      res.status(500).json({ error: "Failed to fetch timeout statistics" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}


