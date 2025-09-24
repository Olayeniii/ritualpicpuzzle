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
      // Determine tournament context if not provided by client
      let tId = tournamentId;
      let rId = roundId;
      let roundNum = round;

      if (!tId) {
        // Check if a tournament is active
        const tRes = await pool.query(
          `SELECT id, current_round FROM tournaments WHERE status = 'active' ORDER BY created_at DESC LIMIT 1`
        );
        if (tRes.rows.length > 0) {
          tId = tRes.rows[0].id;
          roundNum = tRes.rows[0].current_round || round;
          // Find the active/defined round id
          const rRes = await pool.query(
            `SELECT id FROM rounds WHERE tournament_id = $1 AND round_number = $2 LIMIT 1`,
            [tId, roundNum]
          );
          if (rRes.rows.length > 0) {
            rId = rRes.rows[0].id;
          }
        }
      }

      // Insert with appropriate tournament linkage or as normal game
      if (tId) {
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, round, tournament_id, round_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [username, moves, time, timeout, roundNum, tId, rId]
        );
      } else {
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, round, created_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [username, moves, time, timeout, roundNum]
        );
      }
      res.status(200).json({ message: "Score submitted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to submit score" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

