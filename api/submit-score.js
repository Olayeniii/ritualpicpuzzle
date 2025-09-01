import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { username, moves, time } = req.body;

    if (!username || moves == null || time == null) {
      return res.status(400).json({ error: "Invalid score submission" });
    }

    try {
      await pool.query(
        "INSERT INTO leaderboard (username, moves, time) VALUES ($1, $2, $3)",
        [username, moves, time]
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

