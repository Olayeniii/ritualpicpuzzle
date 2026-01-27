// Consolidated game endpoints: /api/game?action=submit|leaderboard|tournament
import { Pool } from "pg";

// SSL configuration for AWS Lambda + RDS/Supabase
// Always use SSL with rejectUnauthorized: false for self-signed certs
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for AWS RDS self-signed certs
  },
  // Lambda-optimized connection pool
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export default async function handler(req, res) {
  // CORS is handled by vercel.json, but handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check query string first, then fall back to body
  const action = req.query.action || req.body?.action;

  try {
    // Submit score
    if (action === "submit" && req.method === "POST") {
      const { username, moves, time, timeout = false, round = 1, tournamentId = null, roundId = null } = req.body;

      if (!username || moves == null || time == null) {
        return res.status(400).json({ error: "Invalid score submission" });
      }

      const parsedMoves = parseInt(moves, 10);
      const parsedTime = parseInt(time, 10);
      const movesToStore = Number.isNaN(parsedMoves) ? 0 : parsedMoves;
      const timeToStore = Number.isNaN(parsedTime) ? 0 : parsedTime;

      let tournamentIdToStore = tournamentId === null || tournamentId === undefined ? null : parseInt(tournamentId, 10);
      if (Number.isNaN(tournamentIdToStore)) tournamentIdToStore = null;
      let roundIdToStore = roundId === null || roundId === undefined ? null : parseInt(roundId, 10);
      if (Number.isNaN(roundIdToStore)) roundIdToStore = null;

      if (tournamentIdToStore) {
        try {
          const tCheck = await pool.query(
            "SELECT id, current_round FROM tournaments WHERE id = $1",
            [tournamentIdToStore]
          );

          if (tCheck.rows.length > 0) {
            const currentRound = tCheck.rows[0].current_round || 1;
            if (!roundIdToStore) {
              const rCheck = await pool.query(
                "SELECT id FROM rounds WHERE tournament_id = $1 AND round_number = $2",
                [tournamentIdToStore, currentRound]
              );
              if (rCheck.rows.length > 0) {
                roundIdToStore = rCheck.rows[0].id;
              }
            }

            await pool.query(
              `INSERT INTO leaderboard (username, moves, time, timeout, tournament_id, round_id, created_at) 
               VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
              [username, movesToStore, timeToStore, timeout, tournamentIdToStore, roundIdToStore]
            );
          } else {
            await pool.query(
              `INSERT INTO leaderboard (username, moves, time, timeout, created_at) 
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
              [username, movesToStore, timeToStore, timeout]
            );
          }
        } catch (e) {
          await pool.query(
            `INSERT INTO leaderboard (username, moves, time, timeout, created_at) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [username, movesToStore, timeToStore, timeout]
          );
        }
      } else {
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, created_at) 
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [username, movesToStore, timeToStore, timeout]
        );
      }

      return res.status(200).json({ message: "Score submitted successfully" });
    }

    // Get leaderboard
    if (action === "leaderboard" && req.method === "GET") {
      const { type = "all" } = req.query;
      
      let query;
      if (type === "weekly") {
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
      
      const result = await pool.query(query);
      return res.status(200).json(result.rows);
    }

    // Get tournament leaderboard
    if (action === "tournament" && req.method === "GET") {
      const { round, mode = "single", tournamentId } = req.query;

      if (!tournamentId) {
        return res.status(400).json({ error: "tournamentId required" });
      }

      let result;
      if (mode === "combined") {
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

      return res.status(200).json(result.rows);
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (err) {
    console.error("Game API error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({
      error: "Operation failed",
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}

