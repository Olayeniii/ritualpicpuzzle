// Consolidated admin endpoints: /api/admin?action=login|dashboard|etc
import { Pool } from "pg";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: true }
    : false,
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '1h';

// Verify JWT token
async function verifyAdminToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.role === 'admin' ? decoded : null;
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS is handled by vercel.json, but handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.method === 'GET' ? req.query : (req.body || {});

  try {
    // PUBLIC: Login (no auth required)
    if (action === "login" && req.method === "POST") {
      const { username, password } = req.body;
      
      const envUsername = process.env.ADMIN_USERNAME;
      const envPasswordHash = process.env.ADMIN_PASSWORD_HASH;
      
      if (!envUsername || !envPasswordHash) {
        return res.status(500).json({ error: "Server configuration error" });
      }
      
      const usernameMatch = username === envUsername;
      const passwordMatch = await bcrypt.compare(password, envPasswordHash);
      
      if (usernameMatch && passwordMatch) {
        const token = jwt.sign(
          { username, role: 'admin' },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRY }
        );
        
        return res.status(200).json({
          isAdmin: true,
          token,
          expiresIn: 3600
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    // PROTECTED: All other actions require authentication
    const token = req.headers.authorization?.replace('Bearer ', '');
    const admin = await verifyAdminToken(token);
    
    if (!admin) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const adminUsername = admin.username;

    // Dashboard stats
    if (action === "dashboard" && req.method === "GET") {
      const tRes = await pool.query(
        `SELECT * FROM tournaments 
         WHERE status IN ('active','break','prep') 
         ORDER BY created_at DESC LIMIT 1`
      );
      const tournamentStatus = tRes.rows[0] || null;
      
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total_players,
          COUNT(CASE WHEN timeout = false THEN 1 END) as completed_games,
          COUNT(CASE WHEN timeout = true THEN 1 END) as timeout_games,
          COUNT(CASE WHEN created_at >= date_trunc('week', now()) THEN 1 END) as weekly_games
        FROM leaderboard
      `);
      
      const topPlayersResult = await pool.query(`
        SELECT username, COUNT(*) as games_played, MIN(moves) as best_moves
        FROM leaderboard 
        WHERE timeout = false
        GROUP BY username 
        ORDER BY games_played DESC, best_moves ASC 
        LIMIT 10
      `);
      
      return res.status(200).json({
        tournament: tournamentStatus,
        stats: statsResult.rows[0],
        topPlayers: topPlayersResult.rows
      });
    }

    // Get tournaments
    if (action === "tournaments" && req.method === "GET") {
      const result = await pool.query(`
        SELECT t.*, ts.scheduled_start 
        FROM tournaments t
        LEFT JOIN tournament_schedule ts ON ts.id = t.schedule_id
        ORDER BY t.created_at DESC 
        LIMIT 50
      `);
      return res.status(200).json(result.rows);
    }

    // Start tournament
    if (action === "start_tournament" && req.method === "POST") {
      const { tournamentId, mode, total_rounds } = req.body;

      if (tournamentId) {
        await pool.query(
          `UPDATE tournaments SET status='active', current_round=1, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [tournamentId]
        );
        await pool.query(
          `UPDATE rounds SET status='active', started_at=CURRENT_TIMESTAMP WHERE tournament_id=$1 AND round_number=1`,
          [tournamentId]
        );
      }
      return res.status(200).json({ success: true });
    }

    // Activate tournament
    if (action === "activate_tournament" && req.method === "POST") {
      await pool.query(
        `UPDATE tournaments SET status='prep', updated_at=CURRENT_TIMESTAMP WHERE status='idle'`
      );
      return res.status(200).json({ success: true });
    }

    // Stop tournament
    if (action === "stop_tournament" && req.method === "POST") {
      await pool.query(
        `UPDATE tournaments SET status='stopped', updated_at=CURRENT_TIMESTAMP WHERE status IN ('active','countdown')`
      );
      return res.status(200).json({ success: true });
    }

    // Next round
    if (action === "next_round" && req.method === "POST") {
      const tRes = await pool.query(
        `SELECT id, current_round, total_rounds FROM tournaments WHERE status='active' LIMIT 1`
      );
      if (tRes.rows.length > 0) {
        const t = tRes.rows[0];
        const nextRound = (t.current_round || 1) + 1;

        await pool.query(
          `UPDATE tournaments SET current_round=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [nextRound, t.id]
        );
        await pool.query(
          `UPDATE rounds SET status='active', started_at=CURRENT_TIMESTAMP WHERE tournament_id=$1 AND round_number=$2`,
          [t.id, nextRound]
        );
      }
      return res.status(200).json({ success: true });
    }

    // Complete tournament
    if (action === "complete_tournament" && req.method === "POST") {
      await pool.query(
        `UPDATE tournaments SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE status='active'`
      );
      return res.status(200).json({ success: true });
    }

    // Cleanup old data
    if (action === "cleanup_old_data" && req.method === "POST") {
      const { daysOld = 90 } = req.body;
      await pool.query(
        `DELETE FROM leaderboard WHERE created_at < NOW() - INTERVAL '${parseInt(daysOld)} days'`
      );
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (err) {
    console.error("Admin API error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({
      error: "Operation failed",
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}

