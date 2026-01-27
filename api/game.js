// Consolidated game endpoints: /api/game?action=start|submit|leaderboard|tournament
import { Pool } from "pg";
import crypto from "crypto";

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

// Puzzle configuration
const GRID_ROWS = 3;
const GRID_COLS = 4;
const EMPTY_TILE = GRID_ROWS * GRID_COLS - 1;
const SESSION_EXPIRY_MINUTES = 10;
const MAX_GAME_TIME = 300; // 5 minutes

// Fisher-Yates shuffle with seed for reproducibility
function seededShuffle(array, seed) {
  const arr = [...array];
  let random = seed;

  // Simple seeded random number generator
  const seededRandom = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280;
  };

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

// Validate that a puzzle state is solved
function isSolved(tiles) {
  return tiles.every((tile, index) => tile === index);
}

// Get client IP address
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
}

export default async function handler(req, res) {
  // CORS is handled by vercel.json, but handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check query string first, then fall back to body
  const action = req.query.action || req.body?.action;

  try {
    // Start game session (anti-cheat)
    if (action === "start" && req.method === "POST") {
      const { username, tournamentId = null, roundId = null } = req.body;

      if (!username || username.trim().length === 0) {
        return res.status(400).json({ error: "Username required" });
      }

      const clientIP = getClientIP(req);
      const userAgent = req.headers['user-agent'] || 'unknown';

      // Rate limiting: Check sessions from this IP in the last hour
      const rateLimitCheck = await pool.query(
        `SELECT COUNT(*) as count FROM game_sessions
         WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
        [clientIP]
      );

      if (parseInt(rateLimitCheck.rows[0].count) >= 50) {
        return res.status(429).json({ error: "Too many game sessions. Please try again later." });
      }

      // Generate session
      const sessionId = crypto.randomBytes(32).toString('hex');
      const puzzleSeed = Math.floor(Math.random() * 1000000);
      const initialTiles = Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => i);
      const shuffledTiles = seededShuffle(initialTiles, puzzleSeed);

      const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000);

      await pool.query(
        `INSERT INTO game_sessions
         (session_id, puzzle_seed, initial_state, started_at, expires_at, ip_address, user_agent, username, tournament_id, round_id)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9)`,
        [sessionId, puzzleSeed, JSON.stringify(shuffledTiles), expiresAt, clientIP, userAgent, username.trim(), tournamentId, roundId]
      );

      return res.status(200).json({
        sessionId,
        puzzleSeed,
        initialState: shuffledTiles,
        serverStartTime: Date.now(),
        expiresAt: expiresAt.toISOString()
      });
    }

    // Submit score (with anti-cheat validation)
    if (action === "submit" && req.method === "POST") {
      const { sessionId, username, moves, time, timeout = false, finalState, tournamentId = null, roundId = null } = req.body;

      // Basic validation
      if (!username || moves == null || time == null) {
        return res.status(400).json({ error: "Invalid score submission" });
      }

      // Rate limiting: Check recent submissions from this username
      const submissionRateCheck = await pool.query(
        `SELECT COUNT(*) as count FROM leaderboard
         WHERE username = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
        [username.trim()]
      );

      if (parseInt(submissionRateCheck.rows[0].count) >= 5) {
        return res.status(429).json({ error: "Too many submissions. Please wait before submitting again." });
      }

      // Anti-cheat: Validate session if provided
      if (sessionId) {
        const clientIP = getClientIP(req);

        // Fetch session
        const sessionResult = await pool.query(
          `SELECT * FROM game_sessions WHERE session_id = $1`,
          [sessionId]
        );

        if (sessionResult.rows.length === 0) {
          return res.status(403).json({ error: "Invalid session" });
        }

        const session = sessionResult.rows[0];

        // Validate session
        if (session.used) {
          return res.status(403).json({ error: "Session already used" });
        }

        if (new Date(session.expires_at) < new Date()) {
          return res.status(403).json({ error: "Session expired" });
        }

        if (session.username !== username.trim()) {
          return res.status(403).json({ error: "Username mismatch" });
        }

        // Validate time (server-side check)
        const sessionStartTime = new Date(session.started_at).getTime();
        const currentTime = Date.now();
        const maxAllowedTime = (currentTime - sessionStartTime) / 1000 + 5; // 5 second tolerance

        if (time > maxAllowedTime) {
          return res.status(403).json({
            error: "Invalid time: submitted time exceeds server-measured elapsed time",
            details: { submitted: time, maxAllowed: Math.floor(maxAllowedTime) }
          });
        }

        if (time > MAX_GAME_TIME) {
          return res.status(403).json({ error: "Time exceeds maximum allowed" });
        }

        // Validate solution if finalState provided
        if (finalState && !isSolved(finalState)) {
          return res.status(403).json({ error: "Invalid solution: puzzle not solved" });
        }

        // Mark session as used
        await pool.query(
          `UPDATE game_sessions
           SET used = true, submitted_at = NOW(), final_state = $1, moves_count = $2, time_seconds = $3
           WHERE session_id = $4`,
          [JSON.stringify(finalState), moves, time, sessionId]
        );
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

