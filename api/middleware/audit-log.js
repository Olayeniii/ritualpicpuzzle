import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

export async function logAdminAction(username, action, details, ipAddress) {
  try {
    await pool.query(
      `INSERT INTO audit_log (username, action, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [username, action, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// Create audit_log table migration
export const createAuditLogTable = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_log(username);
  CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
`;
