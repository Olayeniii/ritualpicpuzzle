import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Tournament configuration
const TOURNAMENT_CONFIG = {
  defaultDay: 3, // Wednesday (0 = Sunday, 1 = Monday, etc.)
  defaultHour: 14, // 2 PM UTC (direct UTC time)
  defaultMinute: 0,
  timezone: "UTC",
  countdownStartDay: 2, // Tuesday
  countdownStartHour: 13, // 1 PM UTC (1 hour before tournament)
  countdownStartMinute: 0,
  breakMinutes: 5,
  totalRounds: 5,
};

/**
 * Get the next scheduled Wednesday tournament at 2 PM UTC
 */
export function getNextTournamentTime(customSchedule = null) {
  const config = customSchedule || TOURNAMENT_CONFIG;
  const now = new Date();

  // Direct UTC time (no conversion needed)
  const targetHourUTC = config.defaultHour;

  const nextTournament = new Date(now);
  nextTournament.setUTCHours(targetHourUTC, config.defaultMinute, 0, 0);

  // Case 1: Today is Wednesday and before 2 PM UTC
  if (now.getDay() === config.defaultDay && now < nextTournament) {
    return nextTournament;
  }

  // Case 2: Otherwise, find the next Wednesday
  const daysUntilWednesday = (config.defaultDay - now.getDay() + 7) % 7 || 7;
  nextTournament.setDate(now.getDate() + daysUntilWednesday);

  return nextTournament;
}

/**
 * Get the countdown start time (Tuesday 1 PM UTC)
 */
export function getCountdownStartTime(customSchedule = null) {
  const config = customSchedule || TOURNAMENT_CONFIG;
  const nextTournament = getNextTournamentTime(config);

  // Countdown starts the day before, at 1 PM UTC
  const countdownStart = new Date(nextTournament);
  countdownStart.setDate(nextTournament.getDate() - 1);
  countdownStart.setUTCHours(
    config.countdownStartHour,
    config.countdownStartMinute,
    0,
    0
  );

  return countdownStart;
}

/**
 * Get tournament status and timing information
 */
export async function getTournamentStatus() {
  try {
    // Check for active/scheduled tournaments in database
    const result = await pool.query(`
      SELECT * FROM tournament_schedule 
      WHERE status IN ('scheduled', 'countdown', 'active', 'break') 
      ORDER BY scheduled_start DESC 
      LIMIT 1
    `);

    const now = new Date();

    if (result.rows.length > 0) {
      const tournament = result.rows[0];
      let startTime = new Date(tournament.scheduled_start);
      let countdownStart;

      if (tournament.mode === 'manual') {
        // Manual: countdown began at creation, startTime already set to now + 5m
        countdownStart = new Date(tournament.created_at);
        startTime = new Date(tournament.scheduled_start);
      } else {
        // Auto: 25h before weekly start
        countdownStart = new Date(startTime.getTime() - 25 * 60 * 60 * 1000);
      }

      // Calculate break time remaining if in break status
      let breakTimeRemaining = 0;
      if (tournament.status === 'break') {
        const breakStartTime = new Date(tournament.updated_at);
        const breakDurationMs = TOURNAMENT_CONFIG.breakMinutes * 60 * 1000;
        breakTimeRemaining = Math.max(0, breakDurationMs - (now.getTime() - breakStartTime.getTime()));
      }

      return {
        ...tournament,
        startTime,
        countdownStart,
        timeUntilCountdown: Math.max(
          0,
          countdownStart.getTime() - now.getTime()
        ),
        timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
        currentRound: tournament.current_round || 0,
        totalRounds: TOURNAMENT_CONFIG.totalRounds,
        breakTimeRemaining: Math.floor(breakTimeRemaining / 1000), // in seconds
      };
    }

    // No active tournament, calculate next scheduled one
    const nextTime = getNextTournamentTime();
    const countdownStart = getCountdownStartTime();

    let status = "scheduled";
    if (now >= countdownStart && now < nextTime) {
      status = "countdown";

      // Auto-create tournament entry in database if we're in countdown
      try {
        const tournament = await scheduleTournament(nextTime, null);
        await updateTournamentStatus(tournament.id, "countdown");
      } catch (error) {
        console.log("Tournament may already exist in database");
      }
    }

    return {
      status,
      scheduled_start: nextTime,
      startTime: nextTime,
      countdownStart,
      timeUntilCountdown: Math.max(
        0,
        countdownStart.getTime() - now.getTime()
      ),
      timeUntilStart: Math.max(0, nextTime.getTime() - now.getTime()),
      currentRound: 0,
      totalRounds: TOURNAMENT_CONFIG.totalRounds,
    };
  } catch (error) {
    console.error("Error getting tournament status:", error);
    // Return a fallback status instead of throwing
    return {
      status: "scheduled",
      scheduled_start: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      countdownStart: new Date(Date.now() + 23 * 60 * 60 * 1000), // 23 hours from now
      timeUntilCountdown: 23 * 60 * 60 * 1000,
      timeUntilStart: 24 * 60 * 60 * 1000,
      currentRound: 0,
      totalRounds: TOURNAMENT_CONFIG.totalRounds,
    };
  }
}

/**
 * Create a new tournament schedule
 */
export async function scheduleTournament(startTime = null, adminId = null, mode = 'auto', consumeScheduled = false) {
  try {
    const now = new Date();
    let scheduledStart = startTime ? new Date(startTime) : null;
    let status = 'scheduled';

    if (mode === 'manual') {
      // Manual: default to now + 5 minutes and start in countdown
      if (!scheduledStart) scheduledStart = new Date(now.getTime() + 5 * 60 * 1000);
      status = 'countdown';
    } else {
      // Auto: default to next weekly scheduled start
      if (!scheduledStart) scheduledStart = getNextTournamentTime();
      status = 'scheduled';
    }

    // If consuming the scheduled slot, align to the next scheduled start
    if (consumeScheduled && mode === 'manual') {
      scheduledStart = getNextTournamentTime();
      status = 'countdown';
    }

    const result = await pool.query(
      `
      INSERT INTO tournament_schedule 
      (scheduled_start, status, total_rounds, created_by, created_at, mode)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
      RETURNING *
    `,
      [scheduledStart, status, TOURNAMENT_CONFIG.totalRounds, adminId, mode]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error scheduling tournament:", error);
    throw error;
  }
}

/**
 * Update tournament status
 */
export async function updateTournamentStatus(
  tournamentId,
  status,
  currentRound = null
) {
  try {
    const updateData = [status, tournamentId];
    let query =
      "UPDATE tournament_schedule SET status = $1, updated_at = CURRENT_TIMESTAMP";

    if (currentRound !== null) {
      query += ", current_round = $3";
      updateData.push(currentRound);
    }

    // Add round_start_time when starting a new round
    if (status === "active" && currentRound !== null) {
      query += ", round_start_time = CURRENT_TIMESTAMP";
    }

    query += " WHERE id = $2 RETURNING *";

    const result = await pool.query(query, updateData);
    return result.rows[0];
  } catch (error) {
    console.error("Error updating tournament status:", error);
    throw error;
  }
}

/**
 * Check if current round should advance to break period
 * A round should advance after it's been active for a reasonable time to allow gameplay
 */
export async function checkRoundProgression(tournamentId, currentRound) {
  try {
    // Get tournament info to check round start time
    const result = await pool.query(
      "SELECT round_start_time, updated_at FROM tournament_schedule WHERE id = $1",
      [tournamentId]
    );

    if (result.rows.length === 0) {
      return { shouldAdvance: false };
    }

    const tournament = result.rows[0];
    const now = new Date();
    const roundStartTime = new Date(tournament.round_start_time || tournament.updated_at);
    
    // Allow 6 minutes for each round (5 minutes gameplay + 1 minute buffer)
    const roundDurationMs = 6 * 60 * 1000;
    const timeSinceRoundStart = now.getTime() - roundStartTime.getTime();

    return {
      shouldAdvance: timeSinceRoundStart >= roundDurationMs,
      timeSinceStart: timeSinceRoundStart,
      timeRemaining: Math.max(0, roundDurationMs - timeSinceRoundStart)
    };
  } catch (error) {
    console.error("Error checking round progression:", error);
    return { shouldAdvance: false };
  }
}

/**
 * Check if break period should advance to next round
 */
export async function checkBreakProgression(tournamentId, currentRound) {
  try {
    // Get tournament info to check when break started
    const result = await pool.query(
      "SELECT updated_at FROM tournament_schedule WHERE id = $1",
      [tournamentId]
    );

    if (result.rows.length === 0) {
      return { shouldAdvance: false };
    }

    const tournament = result.rows[0];
    const now = new Date();
    const breakStartTime = new Date(tournament.updated_at);
    
    // Break duration in milliseconds
    const breakDurationMs = TOURNAMENT_CONFIG.breakMinutes * 60 * 1000;
    const timeSinceBreakStart = now.getTime() - breakStartTime.getTime();

    return {
      shouldAdvance: timeSinceBreakStart >= breakDurationMs,
      timeSinceStart: timeSinceBreakStart,
      timeRemaining: Math.max(0, breakDurationMs - timeSinceBreakStart)
    };
  } catch (error) {
    console.error("Error checking break progression:", error);
    return { shouldAdvance: false };
  }
}

/**
 * Check and update tournament status based on current time
 */
export async function checkTournamentProgress() {
  try {
    const status = await getTournamentStatus();
    const now = new Date();

    if (!status || status.status === "completed") {
      return status;
    }

    // Auto-start countdown if it's time
    if (status.status === "scheduled" && now >= status.countdownStart && status.id) {
      await updateTournamentStatus(status.id, "countdown");
      status.status = "countdown";
    }

    // Auto-start tournament if countdown is over
    if (status.status === "countdown" && now >= status.startTime && status.id) {
      await updateTournamentStatus(status.id, "active", 1);
      status.status = "active";
      status.currentRound = 1;
    }

    // Handle automatic round progression during active tournament
    if (status.status === "active" && status.id) {
      const roundProgress = await checkRoundProgression(status.id, status.currentRound);
      if (roundProgress.shouldAdvance) {
        if (status.currentRound < TOURNAMENT_CONFIG.totalRounds) {
          // Move to break status
          await updateTournamentStatus(status.id, "break", status.currentRound);
          status.status = "break";
        } else {
          // Tournament completed
          await updateTournamentStatus(status.id, "completed");
          status.status = "completed";
        }
      }
    }

    // Handle break period and auto-advance to next round
    if (status.status === "break" && status.id) {
      const breakProgress = await checkBreakProgression(status.id, status.currentRound);
      if (breakProgress.shouldAdvance) {
        const nextRound = status.currentRound + 1;
        if (nextRound <= TOURNAMENT_CONFIG.totalRounds) {
          await updateTournamentStatus(status.id, "active", nextRound);
          status.status = "active";
          status.currentRound = nextRound;
        } else {
          await updateTournamentStatus(status.id, "completed");
          status.status = "completed";
        }
      }
    }

    return status;
  } catch (error) {
    console.error("Error checking tournament progress:", error);
    // Return fallback status instead of throwing
    return {
      status: "scheduled",
      scheduled_start: new Date(Date.now() + 24 * 60 * 60 * 1000),
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      countdownStart: new Date(Date.now() + 23 * 60 * 60 * 1000),
      timeUntilCountdown: 23 * 60 * 60 * 1000,
      timeUntilStart: 24 * 60 * 60 * 1000,
      currentRound: 0,
      totalRounds: TOURNAMENT_CONFIG.totalRounds,
    };
  }
}

export default {
  getTournamentStatus,
  scheduleTournament,
  updateTournamentStatus,
  checkTournamentProgress,
  checkRoundProgression,
  checkBreakProgression,
  getNextTournamentTime,
  TOURNAMENT_CONFIG,
};