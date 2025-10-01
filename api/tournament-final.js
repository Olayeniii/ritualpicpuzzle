import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      let { tournamentId } = req.query;
      // Fallback: if no tournamentId, pick the most relevant one automatically
      if (!tournamentId) {
        const c1 = await pool.query(`SELECT id FROM tournaments WHERE status='completed' ORDER BY end_time DESC NULLS LAST, updated_at DESC LIMIT 1`);
        if (c1.rows.length > 0) {
          tournamentId = c1.rows[0].id;
        } else {
          const c2 = await pool.query(`SELECT id FROM tournaments WHERE status IN ('active','break') ORDER BY updated_at DESC LIMIT 1`);
          if (c2.rows.length > 0) {
            tournamentId = c2.rows[0].id;
          } else {
            const c3 = await pool.query(`SELECT id FROM tournaments ORDER BY created_at DESC LIMIT 1`);
            if (c3.rows.length > 0) tournamentId = c3.rows[0].id;
          }
        }
        if (!tournamentId) {
          return res.status(404).json({ error: 'No tournaments found' });
        }
      }
      // Get final tournament leaderboard showing round winners and total performance
      const result = await pool.query(`
        WITH round_winners AS (
          -- Best score (lowest moves, then time) per round_number resolved via round_id
          SELECT 
            r.round_number AS round,
            l.username,
            l.moves,
            l.time,
            l.created_at,
            ROW_NUMBER() OVER (PARTITION BY r.round_number ORDER BY l.moves ASC, l.time ASC) as rank
          FROM leaderboard l
          LEFT JOIN rounds r ON r.id = l.round_id
          WHERE l.tournament_id = $1::int
          AND (l.timeout = false OR l.timeout IS NULL)
          AND l.time < 300
          AND r.round_number IN (1,2,3,4,5)
        ),
        first_place_winners AS (
          SELECT * FROM round_winners WHERE rank = 1
        ),
        user_round_wins AS (
          -- Count how many rounds each user won
          SELECT 
            username,
            COUNT(*) as rounds_won,
            ARRAY_AGG(round ORDER BY round) as won_rounds,
            AVG(moves) as avg_moves,
            AVG(time) as avg_time
          FROM first_place_winners
          GROUP BY username
        ),
        user_total_performance AS (
          -- Overall performance across rounds 1..5
          SELECT 
            l.username,
            COUNT(CASE WHEN (l.timeout = false OR l.timeout IS NULL) AND l.time < 300 THEN 1 END) as rounds_completed,
            SUM(CASE WHEN (l.timeout = false OR l.timeout IS NULL) AND l.time < 300 THEN l.moves ELSE 0 END) as total_moves,
            SUM(CASE WHEN (l.timeout = false OR l.timeout IS NULL) AND l.time < 300 THEN l.time ELSE 0 END) as total_time,
            MIN(CASE WHEN (l.timeout = false OR l.timeout IS NULL) AND l.time < 300 THEN l.moves END) as best_moves,
            MIN(CASE WHEN (l.timeout = false OR l.timeout IS NULL) AND l.time < 300 THEN l.time END) as best_time
          FROM leaderboard l
          LEFT JOIN rounds r ON r.id = l.round_id
          WHERE l.tournament_id = $1::int
          AND r.round_number IN (1,2,3,4,5)
          GROUP BY l.username
        )
        SELECT 
          p.username,
          COALESCE(w.rounds_won, 0) as rounds_won,
          COALESCE(w.won_rounds, ARRAY[]::integer[]) as won_rounds,
          p.rounds_completed,
          p.total_moves,
          p.total_time,
          p.best_moves,
          p.best_time,
          ROUND(COALESCE(w.avg_moves, 0), 1) as avg_winning_moves,
          ROUND(COALESCE(w.avg_time, 0), 1) as avg_winning_time
        FROM user_total_performance p
        LEFT JOIN user_round_wins w ON p.username = w.username
        WHERE p.rounds_completed >= 3
        ORDER BY 
          w.rounds_won DESC NULLS LAST,
          p.rounds_completed DESC,
          p.total_moves ASC,
          p.total_time ASC
        LIMIT 20
      `, [tournamentId]);

      res.status(200).json(result.rows);
    } catch (err) {
      console.error("Error fetching final tournament leaderboard:", err);
      res.status(500).json({ error: "Failed to fetch final tournament leaderboard" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
