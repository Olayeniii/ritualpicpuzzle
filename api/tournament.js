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

  if (!round && mode !== "combined") {
    return res.status(400).json({ error: "Round number required" });
  }

  try {
    let result;

    if (mode === "combined") {
      // Combine by tournament id across all rounds
      result = await pool.query(
        `SELECT 
          l.username,
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
         ORDER BY rounds_completed DESC, total_moves ASC, total_time ASC`,
        [tournamentId]
      );
    } else {
      // Single round by tournament id; join rounds to expose metadata if needed later
      result = await pool.query(
        `SELECT l.username, l.moves, l.time, l.created_at, r.round_number
         FROM leaderboard l
         LEFT JOIN rounds r ON r.id = l.round_id
         WHERE l.tournament_id = $1
           AND l.round = $2
           AND (l.timeout = false OR l.timeout IS NULL)
           AND l.time < 300
         ORDER BY l.moves ASC, l.time ASC
         LIMIT 10`,
        [tournamentId, round]
      );
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching tournament leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch tournament leaderboard" });
  }
}
