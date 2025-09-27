import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { username, moves, time, timeout = false, round = 1, tournamentId = null, roundId = null } = req.body;

    if (!username || moves == null || time == null) {
      return res.status(400).json({ error: "Invalid score submission" });
    }

    try {
      if (tournamentId) {
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, round, tournament_id, round_id, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [username, moves, time, timeout, round, tournamentId, roundId]
        );
      } else {
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, round, created_at) 
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [username, moves, time, timeout, round]
        );
      }
      res.status(200).json({ message: "Score submitted" });
    } catch (err) {
      console.error("Score submission error:", err);
      res.status(500).json({ error: "Failed to submit score" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

