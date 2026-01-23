import { Pool } from "pg";
import { scoreLimiter } from "./middleware/rate-limit.js";
import { validateScoreSubmission, handleValidationErrors } from "./middleware/validators.js";
import { logAdminAction } from "./middleware/audit-log.js";
import { safeLog } from "./middleware/log-sanitizer.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { username, moves, time, timeout = false, round = 1, tournamentId = null, roundId = null } = req.body;

    if (!username || moves == null || time == null) {
      return res.status(400).json({ error: "Invalid score submission" });
    }

    try {
      // Parse numeric inputs but do not block or coerce; store as provided
      const parsedMoves = parseInt(moves, 10);
      const parsedTime = parseInt(time, 10);
      const movesToStore = Number.isNaN(parsedMoves) ? 0 : parsedMoves;
      const timeToStore = Number.isNaN(parsedTime) ? 0 : parsedTime;

      // Parse IDs as nullable integers
      let tournamentIdToStore = tournamentId === null || tournamentId === undefined ? null : parseInt(tournamentId, 10);
      if (Number.isNaN(tournamentIdToStore)) tournamentIdToStore = null;
      let roundIdToStore = roundId === null || roundId === undefined ? null : parseInt(roundId, 10);
      if (Number.isNaN(roundIdToStore)) roundIdToStore = null;
      if (tournamentIdToStore) {
        // Best-effort association: if tournament exists, record its id and resolve rounds.id
        try {
          const tCheck = await pool.query(
            "SELECT id, current_round FROM tournaments WHERE id = $1",
            [tournamentIdToStore]
          );
          if (tCheck.rows.length > 0) {
            const t = tCheck.rows[0];
            const currentRound = t.current_round || round || 1;
            // Try to resolve the rounds.id for this tournament and round number
            if (!roundIdToStore) {
              try {
                const rRes = await pool.query(
                  "SELECT id FROM rounds WHERE tournament_id = $1 AND round_number = $2 LIMIT 1",
                  [tournamentIdToStore, currentRound]
                );
                if (rRes.rows.length > 0) {
                  roundIdToStore = rRes.rows[0].id;
                  // If the round is still pending, auto-activate it and the tournament
                  try {
                    const rs = await pool.query(
                      "SELECT status FROM rounds WHERE id = $1",
                      [roundIdToStore]
                    );
                    const roundStatus = rs.rows?.[0]?.status;
                    if (roundStatus && roundStatus !== 'active') {
                      await pool.query(
                        `UPDATE rounds SET status='active', started_at=COALESCE(started_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
                        [roundIdToStore]
                      );
                      await pool.query(
                        `UPDATE tournaments SET status='active', current_round=$2, actual_start=COALESCE(actual_start, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
                        [tournamentIdToStore, currentRound]
                      );
                    }
                  } catch (_) { /* ignore */ }
                }
              } catch (_) { /* ignore */ }
            }

            await pool.query(
              `INSERT INTO leaderboard (username, moves, time, timeout, tournament_id, round_id, created_at) 
               VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
              [username, movesToStore, timeToStore, timeout, tournamentIdToStore, roundIdToStore]
            );
          } else {
            // Tournament id not found; fall back to regular game insert
            await pool.query(
              `INSERT INTO leaderboard (username, moves, time, timeout, created_at) 
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
              [username, movesToStore, timeToStore, timeout]
            );
          }
        } catch (e) {
          // On any lookup error, do not block; save as regular game
          await pool.query(
            `INSERT INTO leaderboard (username, moves, time, timeout, created_at) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [username, movesToStore, timeToStore, timeout]
          );
        }
      } else {
        // Regular game (non-tournament)
        await pool.query(
          `INSERT INTO leaderboard (username, moves, time, timeout, created_at) 
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
          [username, movesToStore, timeToStore, timeout]
        );
      }
      console.log(`Score submitted: ${username}, moves: ${movesToStore}, time: ${timeToStore}, tournament: ${tournamentId}`);
      safeLog("Score submitted:", { username, moves: movesToStore, time: timeToStore, tournament: tournamentId });
      res.status(200).json({ message: "Score submitted successfully" });
    } catch (err) {
      console.error("Score submission error:", err);
      res.status(500).json({ error: "Failed to submit score: " + (err.message || 'unknown error') });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
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

