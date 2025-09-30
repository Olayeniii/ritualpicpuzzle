import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const { round, mode = "single", tournamentId } = req.query;

  if (!tournamentId) {
    return res.status(400).json({ error: "tournamentId required" });
  }

  try {
    let result;

    if (mode === "combined") {
      // Combined leaderboard for tournament
      result = await pool.query(
        `SELECT 
          username,
          SUM(moves) AS total_moves,
          SUM(time) AS total_time,
          COUNT(*) AS rounds_completed
         FROM leaderboard
         WHERE tournament_id = $1::int
           AND (timeout = false OR timeout IS NULL)
           AND time < 300
         GROUP BY username
         ORDER BY rounds_completed DESC, total_moves ASC, total_time ASC`,
        [tournamentId]
      );
    } else {
      // Single round for tournament: use round_id to derive round_number
      const roundNum = round || 1;
      result = await pool.query(
        `SELECT l.username, l.moves, l.time, l.created_at
         FROM leaderboard l
         LEFT JOIN rounds r ON r.id = l.round_id
         WHERE l.tournament_id = $1::int
           AND r.round_number = $2::int
           AND (l.timeout = false OR l.timeout IS NULL)
           AND l.time < 300
         ORDER BY l.moves ASC, l.time ASC`,
        [tournamentId, roundNum]
      );
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching tournament leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch tournament leaderboard: " + (err.message || 'unknown error') });
  }
}
