import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      // Clear existing schedules
      await pool.query("DELETE FROM tournament_schedule");
      
      // Create schedule for next 4 Wednesdays at 2 PM UTC (3 PM UTC+1)
      const schedules = [];
      const now = new Date();
      
      for (let i = 0; i < 4; i++) {
        // Find next Wednesday
        const nextWednesday = new Date(now);
        const daysUntilWednesday = (3 - now.getDay() + 7) % 7 || 7;
        nextWednesday.setDate(now.getDate() + daysUntilWednesday + (i * 7));
        
        // Set time to 2 PM UTC (3 PM UTC+1)
        nextWednesday.setUTCHours(14, 0, 0, 0);
        
        const result = await pool.query(
          `INSERT INTO tournament_schedule (scheduled_start, created_at, updated_at)
           VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING *`,
          [nextWednesday]
        );
        
        schedules.push(result.rows[0]);
      }
      
      res.status(200).json({ 
        success: true, 
        message: `Created ${schedules.length} weekly schedules`,
        schedules 
      });
    } catch (err) {
      console.error("Setup schedule error:", err);
      res.status(500).json({ error: "Failed to setup schedule" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}


