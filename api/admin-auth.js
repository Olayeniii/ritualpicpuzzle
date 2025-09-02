import { Pool } from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Generate a secure random session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Hash password
async function hashPassword(password) {
  return await bcrypt.hash(password, 12);
}

// Verify password
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { action, username, adminKey } = req.body;
    
    try {
      if (action === "login") {
        // Check against environment variables 
        const envUsername = process.env.ADMIN_USERNAME || 'ritual-admin';
        const envKey = process.env.ADMIN_KEY || 'change-this-key-in-production';
        
        if (username === envUsername && adminKey === envKey) {
          // Valid admin credentials
          res.status(200).json({
            isAdmin: true,
            user: { username: envUsername }
          });
        } else {
          // Invalid credentials - don't reveal which part was wrong
          res.status(401).json({ 
            isAdmin: false,
            error: "Invalid credentials" 
          });
        }
        
      } else if (action === "logout") {
        const { sessionToken } = req.body;
        
        if (sessionToken) {
          await pool.query(
            "DELETE FROM admin_sessions WHERE session_token = $1",
            [sessionToken]
          );
        }
        
        res.status(200).json({ success: true });
        
      } else if (action === "verify") {
        const { sessionToken } = req.body;
        
        if (!sessionToken) {
          return res.status(401).json({ error: "No session token provided" });
        }
        
        const sessionResult = await pool.query(
          `SELECT s.*, u.username 
           FROM admin_sessions s 
           JOIN admin_users u ON s.admin_id = u.id 
           WHERE s.session_token = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
          [sessionToken]
        );
        
        if (sessionResult.rows.length === 0) {
          return res.status(401).json({ error: "Invalid or expired session" });
        }
        
        const session = sessionResult.rows[0];
        res.status(200).json({
          success: true,
          user: { id: session.admin_id, username: session.username }
        });
        
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
      
    } catch (err) {
      console.error("Admin auth error:", err);
      res.status(500).json({ error: "Authentication failed" });
    }
    
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// Utility function to verify admin session (for other APIs)
export async function verifyAdminSession(sessionToken) {
  if (!sessionToken) {
    return null;
  }
  
  try {
    const result = await pool.query(
      `SELECT s.*, u.username 
       FROM admin_sessions s 
       JOIN admin_users u ON s.admin_id = u.id 
       WHERE s.session_token = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
      [sessionToken]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error("Session verification error:", error);
    return null;
  }
}

// Utility function to create default admin user (run once)
export async function createDefaultAdmin(username = "admin", password = "admin123") {
  try {
    const hashedPassword = await hashPassword(password);
    
    await pool.query(
      "INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING",
      [username, hashedPassword]
    );
    
    console.log(`Default admin user '${username}' created/verified`);
  } catch (error) {
    console.error("Error creating default admin:", error);
  }
}
