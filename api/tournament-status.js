import { checkTournamentProgress } from "./tournament-scheduler.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const status = await checkTournamentProgress();
      res.status(200).json(status);
    } catch (err) {
      console.error("Error fetching tournament status:", err);
      res.status(500).json({ error: "Failed to fetch tournament status" });
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
