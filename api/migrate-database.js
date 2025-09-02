import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrateDatabase() {
  try {
    console.log("Starting database migration...");
    
    // Add created_at column if it doesn't exist
    await pool.query(`
      ALTER TABLE leaderboard 
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);
    
    // Add round column if it doesn't exist
    await pool.query(`
      ALTER TABLE leaderboard 
      ADD COLUMN IF NOT EXISTS round INTEGER DEFAULT 1;
    `);
    
    // Add timeout column if it doesn't exist
    await pool.query(`
      ALTER TABLE leaderboard 
      ADD COLUMN IF NOT EXISTS timeout BOOLEAN DEFAULT FALSE;
    `);
    
    // Update existing records to have created_at if they don't have it
    await pool.query(`
      UPDATE leaderboard 
      SET created_at = CURRENT_TIMESTAMP 
      WHERE created_at IS NULL;
    `);
    
    // Create index for better performance on weekly queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_created_at 
      ON leaderboard(created_at);
    `);
    
    // Create index for tournament queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_leaderboard_round_timeout 
      ON leaderboard(round, timeout);
    `);
    
    // Create tournament_schedule table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tournament_schedule (
        id SERIAL PRIMARY KEY,
        scheduled_start TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'scheduled',
        current_round INTEGER DEFAULT 0,
        total_rounds INTEGER DEFAULT 5,
        created_by INTEGER NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create admin_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL
      );
    `);
    
    // Create admin_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES admin_users(id),
        session_token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add indexes for new tables
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tournament_schedule_status 
      ON tournament_schedule(status, scheduled_start);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_token 
      ON admin_sessions(session_token, expires_at);
    `);
    
    console.log("Database migration completed successfully!");
    
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default migrateDatabase;
