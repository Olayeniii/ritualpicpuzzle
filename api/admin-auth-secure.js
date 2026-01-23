import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET; // Add to environment variables
const JWT_EXPIRY = "1h"; // 1 hour expiration

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { action, username, password } = req.body;

    try {
      if (action === "login") {
        const envUsername = process.env.ADMIN_USERNAME;
        const envPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!envUsername || !envPasswordHash) {
          return res.status(500).json({ error: "Server configuration error" });
        }

        // Verify username and password
        const usernameMatch = username === envUsername;
        const passwordMatch = await bcrypt.compare(password, envPasswordHash);

        if (usernameMatch && passwordMatch) {
          // Generate JWT token
          const token = jwt.sign({ username, role: "admin" }, JWT_SECRET, {
            expiresIn: JWT_EXPIRY,
          });

          res.status(200).json({
            isAdmin: true,
            token,
            expiresIn: 3600, // seconds
          });
        } else {
          // Add delay to prevent timing attacks
          await new Promise((resolve) => setTimeout(resolve, 1000));
          res.status(401).json({ error: "Invalid credentials" });
        }
      }
    } catch (err) {
      console.error("Admin auth error");
      res.status(500).json({ error: "Authentication failed" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// Verify JWT token
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
