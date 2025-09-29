import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { username, moves, time, timeout = false, round = 1, tournamentId = null } = req.body;

    if (!username || moves == null || time == null) {
      return res.status(400).json({ error: "Invalid score submission" });
    }

    try {
      if (tournamentId) {
        // Verify tournament exists and is active
        const tCheck = await pool.query(
          "SELECT id, status, current_round FROM tournaments WHERE id = $1",
          [tournamentId]
        );
        if (tCheck.rows.length === 0) {
          console.error("Invalid tournament_id:", tournamentId);
          return res.status(400).json({ error: "Invalid tournament ID" });
        }
        const t = tCheck.rows[0];
        if (t.status !== 'active') {
          return res.status(400).json({ error: "Tournament is not active" });
        }
        const currentRound = t.current_round || 1;

        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, round, tournament_id, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          [username, moves, time, timeout, currentRound, tournamentId]
        );
      } else {
        // Regular game (non-tournament)
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, round, created_at) 
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [username, moves, time, timeout, round]
        );
      }
      console.log(`Score submitted: ${username}, moves: ${moves}, time: ${time}, tournament: ${tournamentId}`);
      res.status(200).json({ message: "Score submitted successfully" });
    } catch (err) {
      console.error("Score submission error:", err);
      res.status(500).json({ error: "Failed to submit score: " + err.message });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

