import { Pool } from "pg";
import { createAuditLogTable } from "../api/middleware/audit-log.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

async function runMigration() {
  try {
    console.log("Creating audit_log table...");
    await pool.query(createAuditLogTable);
    console.log("✓ Audit log table created successfully");
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

runMigration();
