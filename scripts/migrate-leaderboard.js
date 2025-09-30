import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  console.log("\n🔧 Running leaderboard table migration...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Add columns if they do not exist
    await client.query(
      `ALTER TABLE leaderboard
       ADD COLUMN IF NOT EXISTS round INTEGER,
       ADD COLUMN IF NOT EXISTS tournament_id INTEGER,
       ADD COLUMN IF NOT EXISTS round_id INTEGER`
    );

    // Add FKs best-effort (wrapped individually)
    try {
      await client.query(
        `ALTER TABLE leaderboard
         ADD CONSTRAINT IF NOT EXISTS fk_leaderboard_tournament
         FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL`
      );
    } catch (e) {
      console.warn("⚠️ Skipped FK tournaments(id):", e.message);
    }

    try {
      await client.query(
        `ALTER TABLE leaderboard
         ADD CONSTRAINT IF NOT EXISTS fk_leaderboard_round
         FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE SET NULL`
      );
    } catch (e) {
      console.warn("⚠️ Skipped FK rounds(id):", e.message);
    }

    // Helpful indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at ON leaderboard(created_at)`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_leaderboard_tournament_round ON leaderboard(tournament_id, round)`
    );

    await client.query("COMMIT");
    console.log("✅ Leaderboard migration completed.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();


