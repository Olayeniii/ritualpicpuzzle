import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const now = new Date();

      // Prefer live tournament instance
      const tRes = await pool.query(
        `SELECT * FROM tournaments WHERE status IN ('prep','active','break') ORDER BY created_at DESC LIMIT 1`
      );

      if (tRes.rows.length > 0) {
        const t = tRes.rows[0];
        let countdownStart = new Date(t.created_at);
        let startTime = new Date(countdownStart.getTime() + 5 * 60 * 1000);
        if (t.mode === 'auto' && t.schedule_id) {
          // For auto tournaments, derive from tournament_schedule.scheduled_start
          const sRes2 = await pool.query(`SELECT scheduled_start FROM tournament_schedule WHERE id = $1 LIMIT 1`, [t.schedule_id]);
          if (sRes2.rows.length > 0) {
            startTime = new Date(sRes2.rows[0].scheduled_start);
            countdownStart = new Date(startTime.getTime() - 25 * 60 * 60 * 1000);
          }
        }

        // If prep and 5m elapsed, flip to active/current_round=1 and mark round 1 active
        if (t.status === 'prep' && now >= startTime) {
          await pool.query(`UPDATE tournaments SET status='active', current_round=1, actual_start=COALESCE(actual_start, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [t.id]);
          await pool.query(`UPDATE rounds SET status='active', started_at=COALESCE(started_at, CURRENT_TIMESTAMP) WHERE tournament_id=$1 AND round_number=1`, [t.id]);
          t.status = 'active';
          t.current_round = 1;
          // Notification hook (SSE/Webhook) can be added here if needed
        }

        // Determine current round id
        let roundId = null;
        if (t.current_round && t.current_round > 0) {
          const rRes = await pool.query(`SELECT id FROM rounds WHERE tournament_id=$1 AND round_number=$2 LIMIT 1`, [t.id, t.current_round]);
          if (rRes.rows.length > 0) roundId = rRes.rows[0].id;
        }

        return res.status(200).json({
          id: t.id,
          mode: t.mode,
          status: t.status,
          currentRound: t.current_round || 0,
          totalRounds: t.total_rounds,
          countdownStart,
          startTime,
          timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
          timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
          roundId,
        });
      }

      // No live tournament: expose next scheduled countdown from tournament_schedule
      const sRes = await pool.query(`SELECT scheduled_start FROM tournament_schedule WHERE scheduled_start >= NOW() ORDER BY scheduled_start ASC LIMIT 1`);
      if (sRes.rows.length > 0) {
        const startTime = new Date(sRes.rows[0].scheduled_start);
        const countdownStart = new Date(startTime.getTime() - 25 * 60 * 60 * 1000);
        return res.status(200).json({
          status: now >= countdownStart && now < startTime ? 'countdown' : 'scheduled',
          countdownStart,
          startTime,
          timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
          timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
          currentRound: 0,
          totalRounds: 5,
        });
      }

      // Nothing scheduled
      return res.status(200).json({ status: 'idle', currentRound: 0, totalRounds: 5 });
    } catch (err) {
      console.error("Error fetching tournament status:", err);
      res.status(500).json({ error: "Failed to fetch tournament status" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
