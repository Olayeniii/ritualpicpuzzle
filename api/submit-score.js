import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { username, moves, time, timeout = false } = req.body;

    if (!username || moves == null || time == null) {
      return res.status(400).json({ error: "Invalid score submission" });
    }

    try {
      await pool.query(
        "INSERT INTO leaderboard (username, moves, time, timeout, tournament_id, round_id, created_at) VALUES ($1, $2, $3, $4, NULL, NULL, CURRENT_TIMESTAMP)",
        [username, moves, time, timeout]
      );
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

