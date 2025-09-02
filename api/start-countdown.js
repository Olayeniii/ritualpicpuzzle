import { scheduleTournament, getNextTournamentTime } from "./tournament-scheduler.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      // Get next Wednesday tournament time
      const nextWednesday = getNextTournamentTime();
      
      // Schedule tournament for next Wednesday 3pm UTC+1
      const tournament = await scheduleTournament(nextWednesday, null);
      
      // Set status to countdown (30 minutes before start)
      await import("./tournament-scheduler.js").then(module => 
        module.updateTournamentStatus(tournament.id, 'countdown')
      );
      
      res.status(200).json({
        success: true,
        message: "Countdown started for Wednesday tournament!",
        tournament: {
          id: tournament.id,
          status: 'countdown',
          scheduledStart: nextWednesday,
          message: "🚀 Tournament countdown has begun! 16-hour countdown to Wednesday 3:00 PM Africa/Lagos time!"
        }
      });
      
    } catch (err) {
      console.error("Error starting countdown:", err);
      res.status(500).json({ error: "Failed to start countdown: " + err.message });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
