import { Pool } from "pg";

// SSL configuration for Supabase/RDS - handles self-signed certificates
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase/RDS self-signed certs
  },
});

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { tournament_id } = req.query;
      let result;
      if (tournament_id) {
        result = await pool.query(
          `SELECT id, tournament_id, round_number, status, started_at, ended_at, created_at, updated_at
           FROM rounds WHERE tournament_id = $1 ORDER BY round_number ASC`,
          [tournament_id]
        );
      } else {
        result = await pool.query(
          `SELECT id, tournament_id, round_number, status, started_at, ended_at, created_at, updated_at
           FROM rounds ORDER BY created_at DESC LIMIT 100`
        );
      }
      return res.status(200).json(result.rows);
    }

    if (req.method === "POST") {
      const { tournament_id, round_number, action } = req.body;
      if (!tournament_id || !round_number || !action) {
        return res.status(400).json({ error: "tournament_id, round_number and action are required" });
      }
      if (action === 'activate') {
        await pool.query(
          `UPDATE rounds SET status='active', started_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
           WHERE tournament_id=$1 AND round_number=$2`,
          [tournament_id, round_number]
        );
        await pool.query(
          `UPDATE tournaments SET status='active', current_round=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [tournament_id, round_number]
        );
      } else if (action === 'complete') {
        await pool.query(
          `UPDATE rounds SET status='completed', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
           WHERE tournament_id=$1 AND round_number=$2`,
          [tournament_id, round_number]
        );
      } else {
        return res.status(400).json({ error: "Unsupported action" });
      }
      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err) {
    console.error("/api/rounds error:", err);
    return res.status(500).json({ error: "Rounds operation failed" });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
    responseLimit: "4mb",
  },
};


