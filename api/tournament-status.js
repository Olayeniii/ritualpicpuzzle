import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const now = new Date();

      // Check for active tournaments first
      const tRes = await pool.query(
        `SELECT * FROM tournaments 
         WHERE (status IN ('active','break'))
            OR (status='prep' AND mode='auto')
         ORDER BY created_at DESC LIMIT 1`
      );

      if (tRes.rows.length > 0) {
        const t = tRes.rows[0];
        let countdownStart = new Date(t.created_at);
        let startTime = new Date(countdownStart.getTime() + 5 * 60 * 1000); // Default: 5 min after creation
        
        // For auto tournaments, get schedule time
        if (t.mode === 'auto' && t.schedule_id) {
          const sRes = await pool.query(
            `SELECT scheduled_start FROM tournament_schedule WHERE id = $1 LIMIT 1`, 
            [t.schedule_id]
          );
          if (sRes.rows.length > 0) {
            startTime = new Date(sRes.rows[0].scheduled_start);
            countdownStart = new Date(startTime.getTime() - 25 * 60 * 60 * 1000); // 25 hours before
          }
        }

        // Auto-advance ONLY for auto mode; manual must be started by admin
        if (t.mode !== 'manual' && t.status === 'prep' && now >= startTime) {
          await pool.query(
            `UPDATE tournaments SET status='active', current_round=1, 
             actual_start=COALESCE(actual_start, CURRENT_TIMESTAMP), 
             updated_at=CURRENT_TIMESTAMP WHERE id=$1`, 
            [t.id]
          );
          await pool.query(
            `UPDATE rounds SET status='active', started_at=CURRENT_TIMESTAMP 
             WHERE tournament_id=$1 AND round_number=1`, 
            [t.id]
          );
          // Update the local object to reflect changes
          t.status = 'active';
          t.current_round = 1;
        }

        return res.status(200).json({
          id: t.id,
          mode: t.mode,
          status: t.status,
          currentRound: t.current_round || 1,
          totalRounds: t.total_rounds || 5,
          countdownStart: countdownStart.toISOString(),
          startTime: startTime.toISOString(),
          timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
          timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
        });
      }

      // No active tournament: check for upcoming scheduled tournaments
      const sRes = await pool.query(
        `SELECT ts.* FROM tournament_schedule ts 
         LEFT JOIN tournaments t ON t.schedule_id = ts.id 
         WHERE (t.id IS NULL OR t.status IN ('completed', 'stopped')) 
         AND ts.scheduled_start >= NOW() 
         ORDER BY ts.scheduled_start ASC LIMIT 1`
      );

      if (sRes.rows.length > 0) {
        const schedule = sRes.rows[0];
        const startTime = new Date(schedule.scheduled_start);
        const countdownStart = new Date(startTime.getTime() - 25 * 60 * 60 * 1000);
        
        const status = now >= countdownStart && now < startTime ? 'countdown' : 'scheduled';
        
        return res.status(200).json({
          status,
          countdownStart: countdownStart.toISOString(),
          startTime: startTime.toISOString(),
          timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
          timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
          currentRound: 0,
          totalRounds: 5,
        });
      }

      // Nothing scheduled
      return res.status(200).json({ 
        status: 'idle', 
        currentRound: 0, 
        totalRounds: 5 
      });
    } catch (err) {
      console.error("Error fetching tournament status:", err);
      res.status(500).json({ error: "Failed to fetch tournament status" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
