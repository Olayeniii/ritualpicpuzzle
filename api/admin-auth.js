// Simple environment-based admin authentication with JWT tokens
// No database or complex crypto needed for this secure approach
import { authLimiter } from "./middleware/rate-limit.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRY = "1h";

export default async function handler(req, res) {
  if (req.method === "POST") {
    // Apply rate limiting
    await new Promise((resolve, reject) => {
      authLimiter(req, res, (result) => {
        if (result instanceof Error) reject(result);
        else resolve(result);
      });
    });

    const { action, username, adminKey } = req.body;
    
    try {
      if (action === "login") {
        // Check against environment variables 
        const envUsername = process.env.ADMIN_USERNAME || 'ritual-admin';
        const envKey = process.env.ADMIN_KEY || 'change-this-key-in-production';
        
        if (username === envUsername && adminKey === envKey) {
          // Valid admin credentials - generate JWT token
          const token = jwt.sign(
            { username: envUsername, role: "admin" },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
          );
          
          res.status(200).json({
            isAdmin: true,
            user: { username: envUsername },
            token,
            expiresIn: 3600 // 1 hour in seconds
          });
        } else {
          // Invalid credentials - don't reveal which part was wrong
          // Add delay to prevent timing attacks
          await new Promise((resolve) => setTimeout(resolve, 1000));
          res.status(401).json({ 
            isAdmin: false,
            error: "Invalid credentials" 
          });
        }
        
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

// JWT token verification
export async function verifyAdminToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.role === "admin";
  } catch (err) {
    return false;
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
    responseLimit: "4mb",
  },
};
