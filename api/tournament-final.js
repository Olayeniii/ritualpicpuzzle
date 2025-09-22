import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      // Get final tournament leaderboard showing round winners and total performance
      const result = await pool.query(`
        WITH round_winners AS (
          -- Get the best score (lowest moves, then lowest time) for each round
          SELECT 
            round,
            username,
            moves,
            time,
            created_at,
            ROW_NUMBER() OVER (PARTITION BY round ORDER BY moves ASC, time ASC) as rank
          FROM leaderboard
          WHERE (timeout = false OR timeout IS NULL)
          AND time < 300
          AND round IN (1, 2, 3, 4, 5)
          AND created_at >= date_trunc('week', now())
          AND created_at < date_trunc('week', now()) + interval '7 days'
        ),
        first_place_winners AS (
          -- Only keep first place winners for each round
          SELECT * FROM round_winners WHERE rank = 1
        ),
        user_round_wins AS (
          -- Count how many rounds each user won
          SELECT 
            username,
            COUNT(*) as rounds_won,
            ARRAY_AGG(round ORDER BY round) as won_rounds,
            AVG(moves) as avg_moves,
            AVG(time) as avg_time
          FROM first_place_winners
          GROUP BY username
        ),
        user_total_performance AS (
          -- Get overall tournament performance for all qualifying users
          SELECT 
            username,
            COUNT(CASE WHEN (timeout = false OR timeout IS NULL) AND time < 300 THEN 1 END) as rounds_completed,
            SUM(CASE WHEN (timeout = false OR timeout IS NULL) AND time < 300 THEN moves ELSE 0 END) as total_moves,
            SUM(CASE WHEN (timeout = false OR timeout IS NULL) AND time < 300 THEN time ELSE 0 END) as total_time,
            MIN(CASE WHEN (timeout = false OR timeout IS NULL) AND time < 300 THEN moves END) as best_moves,
            MIN(CASE WHEN (timeout = false OR timeout IS NULL) AND time < 300 THEN time END) as best_time
          FROM leaderboard
          WHERE round IN (1, 2, 3, 4, 5)
          AND created_at >= date_trunc('week', now())
          AND created_at < date_trunc('week', now()) + interval '7 days'
          GROUP BY username
        )
        SELECT 
          p.username,
          COALESCE(w.rounds_won, 0) as rounds_won,
          COALESCE(w.won_rounds, ARRAY[]::integer[]) as won_rounds,
          p.rounds_completed,
          p.total_moves,
          p.total_time,
          p.best_moves,
          p.best_time,
          ROUND(COALESCE(w.avg_moves, 0), 1) as avg_winning_moves,
          ROUND(COALESCE(w.avg_time, 0), 1) as avg_winning_time
        FROM user_total_performance p
        LEFT JOIN user_round_wins w ON p.username = w.username
        WHERE p.rounds_completed >= 3  -- Only show users who completed at least 3 rounds
        ORDER BY 
          w.rounds_won DESC NULLS LAST,  -- Most rounds won first
          p.rounds_completed DESC,        -- Most rounds completed
          p.total_moves ASC,             -- Fewest total moves
          p.total_time ASC               -- Fastest total time
        LIMIT 20
      `);

      res.status(200).json(result.rows);
    } catch (err) {
      console.error("Error fetching final tournament leaderboard:", err);
      res.status(500).json({ error: "Failed to fetch final tournament leaderboard" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
