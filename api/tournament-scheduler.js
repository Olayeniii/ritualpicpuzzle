import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Tournament configuration
const TOURNAMENT_CONFIG = {
  defaultDay: 3, // Wednesday (0 = Sunday, 1 = Monday, etc.)
  defaultHour: 15, // 3 PM
  defaultMinute: 0,
  timezone: 'Africa/Lagos', // UTC+1
  countdownStartDay: 2, // Tuesday
  countdownStartHour: 23, // 11 PM Africa/Lagos time
  countdownStartMinute: 0,
  breakMinutes: 15,
  totalRounds: 5
};

/**
 * Get the countdown start time (Tuesday 11pm Africa/Lagos = 10pm UTC)
 */
export function getCountdownStartTime(customSchedule = null) {
  const config = customSchedule || TOURNAMENT_CONFIG;
  const now = new Date();
  
  const countdownStart = new Date();
  const daysUntilTuesday = (config.countdownStartDay - now.getDay() + 7) % 7;
  
  // If today is Tuesday and we haven't reached countdown start time yet
  if (daysUntilTuesday === 0 && now.getHours() < (config.countdownStartHour - 1)) {
    // Countdown starts today
    countdownStart.setDate(now.getDate());
  } else {
    // Countdown starts next Tuesday
    countdownStart.setDate(now.getDate() + (daysUntilTuesday || 7));
  }
  
  countdownStart.setHours(config.countdownStartHour - 1); // Convert UTC+1 to UTC (10 PM UTC = 11 PM Lagos)
  countdownStart.setMinutes(config.countdownStartMinute);
  countdownStart.setSeconds(0);
  countdownStart.setMilliseconds(0);
  
  return countdownStart;
}

/**
 * Get the next scheduled tournament time
 */
export function getNextTournamentTime(customSchedule = null) {
  const config = customSchedule || TOURNAMENT_CONFIG;
  const now = new Date();
  
  // Calculate next Wednesday at 3 PM UTC+1 (2 PM UTC)
  const nextTournament = new Date();
  const daysUntilWednesday = (config.defaultDay - now.getDay() + 7) % 7;
  
  // If today is Wednesday and we haven't reached tournament time yet
  if (daysUntilWednesday === 0 && now.getHours() < (config.defaultHour - 1)) {
    // Tournament is today
    nextTournament.setDate(now.getDate());
  } else {
    // Tournament is on next Wednesday
    nextTournament.setDate(now.getDate() + (daysUntilWednesday || 7));
  }
  
  nextTournament.setHours(config.defaultHour - 1); // Convert UTC+1 to UTC (2 PM UTC = 3 PM UTC+1)
  nextTournament.setMinutes(config.defaultMinute);
  nextTournament.setSeconds(0);
  nextTournament.setMilliseconds(0);
  
  return nextTournament;
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
      const startTime = new Date(tournament.scheduled_start);
      const countdownStart = new Date(startTime.getTime() - (TOURNAMENT_CONFIG.countdownMinutes * 60 * 1000));
      
      return {
        ...tournament,
        startTime,
        countdownStart,
        timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
        timeUntilStart: Math.max(0, startTime.getTime() - now.getTime()),
        currentRound: tournament.current_round || 0,
        totalRounds: TOURNAMENT_CONFIG.totalRounds
      };
    }
    
    // No active tournament, calculate next scheduled one
    const nextTime = getNextTournamentTime();
    const countdownStart = getCountdownStartTime();
    
    // Check if we should be in countdown mode now (Tuesday 11pm Lagos time)
    let status = 'scheduled';
    if (now >= countdownStart && now < nextTime) {
      status = 'countdown';
      
      // Auto-create tournament entry in database if we're in countdown
      try {
        const tournament = await scheduleTournament(nextTime, null);
        await updateTournamentStatus(tournament.id, 'countdown');
      } catch (error) {
        console.log('Tournament may already exist in database');
      }
    }
    
    return {
      status: status,
      scheduled_start: nextTime,
      startTime: nextTime,
      countdownStart: countdownStart,
      timeUntilCountdown: Math.max(0, countdownStart.getTime() - now.getTime()),
      timeUntilStart: Math.max(0, nextTime.getTime() - now.getTime()),
      currentRound: 0,
      totalRounds: TOURNAMENT_CONFIG.totalRounds
    };
    
  } catch (error) {
    console.error('Error getting tournament status:', error);
    throw error;
  }
}

/**
 * Create a new tournament schedule
 */
export async function scheduleTournament(startTime, adminId = null) {
  try {
    const result = await pool.query(`
      INSERT INTO tournament_schedule 
      (scheduled_start, status, total_rounds, created_by, created_at)
      VALUES ($1, 'scheduled', $2, $3, CURRENT_TIMESTAMP)
      RETURNING *
    `, [startTime, TOURNAMENT_CONFIG.totalRounds, adminId]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Error scheduling tournament:', error);
    throw error;
  }
}

/**
 * Update tournament status
 */
export async function updateTournamentStatus(tournamentId, status, currentRound = null) {
  try {
    const updateData = [status, tournamentId];
    let query = 'UPDATE tournament_schedule SET status = $1, updated_at = CURRENT_TIMESTAMP';
    
    if (currentRound !== null) {
      query += ', current_round = $3';
      updateData.push(currentRound);
    }
    
    query += ' WHERE id = $2 RETURNING *';
    
    const result = await pool.query(query, updateData);
    return result.rows[0];
  } catch (error) {
    console.error('Error updating tournament status:', error);
    throw error;
  }
}

/**
 * Check and update tournament status based on current time
 */
export async function checkTournamentProgress() {
  try {
    const status = await getTournamentStatus();
    const now = new Date();
    
    if (!status || status.status === 'completed') {
      return status;
    }
    
    // Auto-start countdown if it's time
    if (status.status === 'scheduled' && now >= status.countdownStart) {
      await updateTournamentStatus(status.id, 'countdown');
      status.status = 'countdown';
    }
    
    // Auto-start tournament if countdown is over
    if (status.status === 'countdown' && now >= status.startTime) {
      await updateTournamentStatus(status.id, 'active', 1);
      status.status = 'active';
      status.currentRound = 1;
    }
    
    return status;
  } catch (error) {
    console.error('Error checking tournament progress:', error);
    throw error;
  }
}

export default {
  getTournamentStatus,
  scheduleTournament,
  updateTournamentStatus,
  checkTournamentProgress,
  getNextTournamentTime,
  TOURNAMENT_CONFIG
};
