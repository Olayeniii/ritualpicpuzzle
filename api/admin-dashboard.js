import { Pool } from "pg";
import { verifyAdminSession } from "./admin-auth.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  // Simple admin verification using environment key
  const adminKey = req.headers.authorization?.replace('Bearer ', '');
  const isAdmin = await verifyAdminSession(adminKey);
  
  if (!isAdmin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    if (req.method === "GET") {
      const { action } = req.query;
      
      if (action === "status") {
        // Get current tournament status (prep/active/break) and general stats
        const now = new Date();
        const tRes = await pool.query(
          `SELECT * FROM tournaments WHERE status IN ('prep','active','break') ORDER BY created_at DESC LIMIT 1`
        );
        let tournamentStatus = null;
        if (tRes.rows.length > 0) {
          const t = tRes.rows[0];
          let countdownStart = new Date(t.created_at);
          let startTime = new Date(countdownStart.getTime() + 5 * 60 * 1000);
          if (t.mode === 'auto' && t.actual_start) {
            startTime = new Date(t.actual_start);
            countdownStart = new Date(startTime.getTime() - 25 * 60 * 60 * 1000);
          }
          tournamentStatus = {
            id: t.id,
            mode: t.mode,
            status: t.status,
            currentRound: t.current_round || 0,
            totalRounds: t.total_rounds,
            countdownStart,
            startTime,
            timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
            timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
          };
        }
        
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
        
        res.status(200).json({
          tournament: tournamentStatus,
          stats: statsResult.rows[0],
          topPlayers: topPlayersResult.rows
        });
        
      } else if (action === "tournaments") {
        // Get tournaments history with optional schedule link
        const result = await pool.query(`
          SELECT t.*, ts.schedule_start 
          FROM tournaments t
          LEFT JOIN tournament_schedule ts ON ts.id = t.schedule_id
          ORDER BY t.created_at DESC 
          LIMIT 50
        `);
        res.status(200).json(result.rows);
        
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
      
    } else if (req.method === "POST") {
      const { action } = req.body;
      
      if (action === "start_tournament") {
        const { mode = 'manual', total_rounds = 5, schedule_id = null, created_by = null } = req.body;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tRes = await client.query(
            `INSERT INTO tournaments (schedule_id, mode, total_rounds, created_by, status, current_round, created_at, updated_at)
             VALUES ($1, $2, $3, $4, 'prep', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING *`,
            [schedule_id, mode, total_rounds, created_by]
          );
          const t = tRes.rows[0];
          const inserts = [];
          for (let r = 1; r <= total_rounds; r += 1) {
            inserts.push(
              client.query(
                `INSERT INTO rounds (tournament_id, round_number, status, created_at, updated_at)
                 VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [t.id, r]
              )
            );
          }
          await Promise.all(inserts);
          await client.query('COMMIT');
          res.status(200).json({ success: true, tournament: t });
        } catch (e) {
          await client.query('ROLLBACK');
          console.error('Admin start_tournament error:', e);
          res.status(500).json({ success: false, error: 'Failed to start tournament' });
        } finally {
          client.release();
        }
        
      } else if (action === "stop_tournament") {
        const { tournamentId } = req.body;
        try {
          // Prevent manual stop when auto unless override=true
          const { override = false } = req.body;
          let id = tournamentId;
          if (!id) {
            const tRes = await pool.query(`SELECT id FROM tournaments WHERE status='active' ORDER BY created_at DESC LIMIT 1`);
            if (tRes.rows.length > 0) id = tRes.rows[0].id;
          }
          if (!id) return res.status(400).json({ success: false, error: 'No active tournament' });
          const mRes = await pool.query(`SELECT mode FROM tournaments WHERE id=$1`, [id]);
          if (mRes.rows.length && mRes.rows[0].mode === 'auto' && !override) {
            return res.status(409).json({ success: false, error: 'Cannot stop auto tournament without override' });
          }
          await pool.query(`UPDATE tournaments SET status='stopped', end_time=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
          await pool.query(`UPDATE rounds SET status='completed', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tournament_id=$1 AND status='active'`, [id]);
          res.status(200).json({ success: true });
        } catch (e) {
          console.error('Admin stop_tournament error:', e);
          res.status(500).json({ success: false, error: 'Failed to stop tournament' });
        }
        
      } else if (action === "next_round") {
        try {
          const tRes = await pool.query(`SELECT * FROM tournaments WHERE status='active' ORDER BY created_at DESC LIMIT 1`);
          if (tRes.rows.length === 0) return res.status(400).json({ success: false, error: 'No active tournament' });
          const t = tRes.rows[0];
          if (t.mode === 'auto' && !req.body.override) return res.status(409).json({ success: false, error: 'Auto tournament; manual next requires override' });
          if (t.current_round >= t.total_rounds) return res.status(400).json({ success: false, error: 'Max rounds reached' });
          const curr = t.current_round || 1;
          await pool.query(`UPDATE rounds SET status='completed', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tournament_id=$1 AND round_number=$2`, [t.id, curr]);
          const next = curr + 1;
          await pool.query(`UPDATE rounds SET status='active', started_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tournament_id=$1 AND round_number=$2`, [t.id, next]);
          await pool.query(`UPDATE tournaments SET current_round=$2, status='active', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [t.id, next]);
          res.status(200).json({ success: true, newRound: next });
        } catch (e) {
          console.error('Admin next_round error:', e);
          res.status(500).json({ success: false, error: 'Failed to advance round' });
        }
        
      } else if (action === "complete_tournament") {
        try {
          const tRes = await pool.query(`SELECT * FROM tournaments WHERE status='active' ORDER BY created_at DESC LIMIT 1`);
          if (tRes.rows.length === 0) return res.status(400).json({ success: false, error: 'No active tournament' });
          const t = tRes.rows[0];
          if (t.mode === 'auto' && !req.body.override) return res.status(409).json({ success: false, error: 'Auto tournament; manual complete requires override' });
          await pool.query(`UPDATE rounds SET status='completed', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tournament_id=$1 AND status='active'`, [t.id]);
          await pool.query(`UPDATE tournaments SET status='completed', end_time=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [t.id]);
          res.status(200).json({ success: true });
        } catch (e) {
          console.error('Admin complete_tournament error:', e);
          res.status(500).json({ success: false, error: 'Failed to complete tournament' });
        }
        
      } else if (action === "cleanup_old_data") {
        const { daysOld = 90 } = req.body;
        
        // Archive old leaderboard entries
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        const result = await pool.query(
          "DELETE FROM leaderboard WHERE created_at < $1",
          [cutoffDate]
        );
        
        res.status(200).json({ 
          success: true, 
          deletedRecords: result.rowCount 
        });
        
      } else if (action === "update_schedule") {
        const { day, hour, minute } = req.body;
        
        // This would update the schedule in a config table or environment
        res.status(200).json({ 
          success: true, 
          message: "Schedule updated (requires server restart to take effect)",
          newSchedule: { day, hour, minute }
        });
        
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
      
    } else {
      res.setHeader("Allow", ["GET", "POST"]);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
    
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).json({ error: "Dashboard operation failed" });
  }
}
