import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { type = "all", tournamentId = null, roundId = null, mode = null } = req.query; // adds tournament filters
    
    try {
      let query;
      let params = [];
      
      // Tournament-scoped leaderboard
      if (tournamentId) {
        if (mode === 'single' && roundId) {
          query = `
            SELECT l.username, l.moves, l.time, l.created_at
            FROM leaderboard l
            WHERE l.tournament_id = $1 AND l.round_id = $2
              AND (l.timeout = false OR l.timeout IS NULL)
              AND l.time < 300
            ORDER BY l.moves ASC, l.time ASC
            LIMIT 10`;
          params = [tournamentId, roundId];
        } else {
          query = `
            SELECT l.username,
                   SUM(l.moves) AS total_moves,
                   SUM(l.time) AS total_time,
                   COUNT(CASE WHEN (l.timeout = false OR l.timeout IS NULL) AND l.time < 300 THEN 1 END) AS rounds_completed,
                   ARRAY_AGG(l.round ORDER BY l.round) AS completed_rounds,
                   COUNT(CASE WHEN l.timeout = true OR l.time >= 300 THEN 1 END) AS timeout_rounds
            FROM leaderboard l
            WHERE l.tournament_id = $1
              AND (l.timeout = false OR l.timeout IS NULL)
              AND l.time < 300
            GROUP BY l.username
            ORDER BY rounds_completed DESC, total_moves ASC, total_time ASC`;
          params = [tournamentId];
        }
      } else if (type === "today") {
        query = `
          SELECT username, moves, time, created_at
          FROM leaderboard l1
          WHERE (timeout = false OR timeout IS NULL)
          AND time < 300
          AND created_at >= date_trunc('day', now())
          AND created_at < date_trunc('day', now()) + interval '1 day'
          AND moves = (
            SELECT MIN(moves) 
            FROM leaderboard l2 
            WHERE l2.username = l1.username 
            AND (l2.timeout = false OR l2.timeout IS NULL)
            AND l2.time < 300
            AND l2.created_at >= date_trunc('day', now())
            AND l2.created_at < date_trunc('day', now()) + interval '1 day'
          )
          AND created_at = (
            SELECT MAX(created_at)
            FROM leaderboard l3
            WHERE l3.username = l1.username 
            AND l3.moves = l1.moves
            AND (l3.timeout = false OR l3.timeout IS NULL)
            AND l3.time < 300
            AND l3.created_at >= date_trunc('day', now())
            AND l3.created_at < date_trunc('day', now()) + interval '1 day'
          )
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
