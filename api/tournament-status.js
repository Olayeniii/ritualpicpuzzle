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
      // Prefer auto tournaments when both exist; otherwise, pick latest active/break, or auto prep
      let tRes = await pool.query(
        `SELECT * FROM tournaments 
         WHERE (mode='auto' AND status IN ('active','break','prep'))
         ORDER BY created_at DESC LIMIT 1`
      );
      if (tRes.rows.length === 0) {
        tRes = await pool.query(
          `SELECT * FROM tournaments 
           WHERE status IN ('active','break') OR (status='prep' AND mode='auto')
           ORDER BY created_at DESC LIMIT 1`
        );
      }

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
        if (t.mode === 'auto' && t.status === 'prep' && now >= startTime) {
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

        // Display mapping for auto tournaments in prep window
        let displayStatus = t.status;
        if (t.mode === 'auto' && t.status === 'prep' && countdownStart && startTime) {
          if (now < startTime) {
            displayStatus = (now >= countdownStart) ? 'countdown' : 'scheduled';
          }
        }

        // Auto round progression for auto tournaments: 5 min round + 1 min break
        let breakTimeRemaining = null;
        if (t.mode === 'auto' && (t.status === 'active' || t.status === 'break')) {
          const rRes = await pool.query(
            `SELECT id, status, started_at FROM rounds WHERE tournament_id=$1 AND round_number=$2 LIMIT 1`,
            [t.id, t.current_round || 1]
          );
          if (rRes.rows.length > 0) {
            const round = rRes.rows[0];
            // Ensure started_at exists when active
            if (t.status === 'active' && !round.started_at) {
              await pool.query(
                `UPDATE rounds SET started_at=COALESCE(started_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
                [round.id]
              );
            }
            const startedAtRes = await pool.query(`SELECT started_at FROM rounds WHERE id=$1`, [round.id]);
            const startedAt = startedAtRes.rows[0]?.started_at ? new Date(startedAtRes.rows[0].started_at) : null;
            if (startedAt) {
              const elapsedMs = now.getTime() - startedAt.getTime();
              const roundMs = 5 * 60 * 1000; // 5 minutes
              const breakMs = 1 * 60 * 1000; // 1 minute
              if (elapsedMs >= roundMs && elapsedMs < roundMs + breakMs) {
                // In break window
                if (t.status !== 'break') {
                  await pool.query(`UPDATE tournaments SET status='break', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [t.id]);
                  t.status = 'break';
                  displayStatus = 'break';
                }
                breakTimeRemaining = Math.max(0, Math.ceil((roundMs + breakMs - elapsedMs) / 1000));
              } else if (elapsedMs >= roundMs + breakMs) {
                // Advance to next round or complete
                await pool.query(
                  `UPDATE rounds SET status='completed', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP 
                   WHERE tournament_id=$1 AND round_number=$2`,
                  [t.id, t.current_round || 1]
                );
                if ((t.current_round || 1) < (t.total_rounds || 5)) {
                  const next = (t.current_round || 1) + 1;
                  await pool.query(
                    `UPDATE rounds SET status='active', started_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP 
                     WHERE tournament_id=$1 AND round_number=$2`,
                    [t.id, next]
                  );
                  await pool.query(
                    `UPDATE tournaments SET current_round=$2, status='active', updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
                    [t.id, next]
                  );
                  t.status = 'active';
                  t.current_round = next;
                  displayStatus = 'active';
                } else {
                  await pool.query(
                    `UPDATE tournaments SET status='completed', end_time=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
                    [t.id]
                  );
                  t.status = 'completed';
                  displayStatus = 'completed';
                }
              } else {
                // Still in active window
                if (t.status !== 'active') {
                  await pool.query(`UPDATE tournaments SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [t.id]);
                  t.status = 'active';
                }
                displayStatus = 'active';
              }
            }
          }
        }

        const currentRoundOut = (t.status === 'active' || t.status === 'break')
          ? (t.current_round || 1)
          : (t.current_round || 0);

        return res.status(200).json({
          id: t.id,
          mode: t.mode,
          status: displayStatus,
          currentRound: currentRoundOut,
          totalRounds: t.total_rounds || 5,
          countdownStart: countdownStart.toISOString(),
          startTime: startTime.toISOString(),
          timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
          timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
          breakTimeRemaining,
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
