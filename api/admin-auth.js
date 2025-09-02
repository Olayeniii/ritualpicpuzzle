// Simple environment-based admin authentication
// No database or complex crypto needed for this secure approach

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

// Simple admin verification for environment-based auth
export async function verifyAdminSession(adminKey) {
  const envKey = process.env.ADMIN_KEY || 'change-this-key-in-production';
  return adminKey === envKey;
}
