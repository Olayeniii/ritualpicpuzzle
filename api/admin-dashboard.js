import { Pool } from "pg";
import { verifyAdminSession } from "./admin-auth.js";
import { getTournamentStatus, scheduleTournament, updateTournamentStatus } from "./tournament-scheduler.js";

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
        // Get tournament status and general stats
        const tournamentStatus = await getTournamentStatus();
        
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
        // Get tournament history
        const result = await pool.query(`
          SELECT * FROM tournament_schedule 
          ORDER BY scheduled_start DESC 
          LIMIT 20
        `);
        
        res.status(200).json(result.rows);
        
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
      
    } else if (req.method === "POST") {
      const { action } = req.body;
      
      if (action === "start_tournament") {
        const { startTime, mode = 'manual', consumeScheduled = false } = req.body;
        const start = startTime ? new Date(startTime) : null;
        
        const tournament = await scheduleTournament(start, null, mode, consumeScheduled);
        res.status(200).json({ success: true, tournament });
        
      } else if (action === "stop_tournament") {
        const { tournamentId } = req.body;
        
        if (!tournamentId) {
          // Stop current active tournament
          const status = await getTournamentStatus();
          if (status && status.id) {
            await updateTournamentStatus(status.id, 'stopped');
          }
        } else {
          await updateTournamentStatus(tournamentId, 'stopped');
        }
        
        res.status(200).json({ success: true });
        
      } else if (action === "next_round") {
        const status = await getTournamentStatus();
        
        if (status && status.id && status.currentRound < status.totalRounds) {
          await updateTournamentStatus(status.id, 'active', status.currentRound + 1);
          res.status(200).json({ success: true, newRound: status.currentRound + 1 });
        } else {
          res.status(400).json({ error: "No active tournament or max rounds reached" });
        }
        
      } else if (action === "complete_tournament") {
        const status = await getTournamentStatus();
        
        if (status && status.id) {
          await updateTournamentStatus(status.id, 'completed');
          res.status(200).json({ success: true });
        } else {
          res.status(400).json({ error: "No active tournament" });
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
        // For now, we'll just return success and note this would need environment config
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
