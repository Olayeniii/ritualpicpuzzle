# Ritual Puzzle - Advanced Tournament System

## Major Features Added - Version 2.0

### 🎯 Timed-out Users Excluded
- Users who timeout (exceed 5 minutes) are no longer shown in leaderboards
- All timeout submissions are still saved in the database for record keeping

### 📅 Weekly Leaderboard Resets
- New weekly leaderboard that shows only scores from the current week
- Historical data is preserved - you can still view all-time leaderboard
- Week resets every Monday at midnight UTC

### 🏆 Weekly Tournament System (5 Rounds)
- **Automatic Scheduling**: Tournaments start every Wednesday at 3:00 PM UTC+1 (Africa/Lagos timezone)
- **30-Minute Countdown**: Visual countdown before tournament begins
- **5 Tournament Rounds**: Complete tournament system with 5 rounds
- **15-Minute Breaks**: Built-in breaks between rounds
- **Auto Mode Switch**: UI automatically switches to tournament mode during events
- **Combined Scoring**: Total moves and time across all 5 rounds to qualify
- **Real-time Updates**: Tournament status updates every 30 seconds

### 🎮 Fully Automated UI & Tournament Display
- **Tournament Banner**: Real-time tournament status with countdown timers
- **Automatic Mode Switching**: UI automatically switches between modes based on tournament status:
  - **Default**: All-time leaderboard
  - **Countdown Phase**: Weekly leaderboard to build excitement
  - **Tournament Active**: Tournament leaderboard with live round progress
  - **Tournament Breaks**: Tournament results remain visible
  - **Post-Tournament**: Weekly results showing fresh achievements
- **Visual Status Indicators**: Different animations for scheduled/countdown/active/break states
- **Smart Round Progress**: Live round indicator (Round X/5) appears only during tournaments
- **No Manual Controls**: Fully automated experience - no user intervention needed

### 🔐 Secure Hidden Admin System
- **Environment-Based Security**: Admin credentials stored in environment variables only
- **Hidden Access Triggers**: 
  - Long press logo for 3 seconds (mobile/desktop)
  - Keyboard shortcut: Ctrl+Shift+A
- **No Visible Admin UI**: Regular users never see admin controls
- **Backend Validation**: All admin checks happen server-side with environment secrets
- **Tournament Management**:
  - Start tournaments manually
  - Stop active tournaments
  - Advance to next round
  - Complete tournaments early
- **Manual Overrides** (Admin Only):
  - Force leaderboard type (All Time/Weekly/Tournament)
  - Enable/disable tournament mode manually
  - Set specific tournament rounds (1-5)
  - Override automatic mode switching
- **System Maintenance**:
  - Clean up old leaderboard data
  - Refresh tournament status
  - Monitor system statistics
- **Real-time Dashboard**: Live tournament status and player statistics

## Database Schema Updates

### New Tables Added:
- **`tournament_schedule`**: Manages tournament timing and status
  - `id`, `scheduled_start`, `status`, `current_round`, `total_rounds`
  - `created_by`, `created_at`, `updated_at`

### Enhanced `leaderboard` table:
- `created_at` (TIMESTAMP): When the score was submitted
- `round` (INTEGER): Which round/lap (1-5 for tournament, 1 for regular)
- `timeout` (BOOLEAN): Whether the user timed out

### Indexes Added:
- `idx_leaderboard_created_at`: For efficient weekly queries
- `idx_leaderboard_round_timeout`: For efficient tournament queries
- `idx_tournament_schedule_status`: For tournament status queries


## API Endpoints

### Core APIs (Enhanced)
- **`/api/leaderboard`**: Get leaderboard data with timeout filtering
- **`/api/tournament`**: Tournament leaderboards (now supports 5 rounds)
- **`/api/submit-score`**: Submit scores with timeout and round tracking

### New Tournament APIs
- **`/api/tournament-status`**: Real-time tournament status and countdown
- **`/api/tournament-scheduler`**: Tournament scheduling system
- **`/api/timeout-stats`**: Timeout statistics and transparency data

### Admin APIs (New)
- **`/api/admin-auth`**: Admin authentication (login/logout/verify)
- **`/api/admin-dashboard`**: Tournament management and system control

### API Parameters
- **`/api/tournament`**: Now supports `round` (1-5) and `mode` (single/combined)
- **`/api/submit-score`**: Enhanced with `timeout`, `round` parameters
- **`/api/leaderboard`**: Enhanced with `type` (all/weekly) parameter

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables Required
```
DATABASE_URL=your_postgresql_connection_string
ADMIN_USERNAME=ritual-admin
ADMIN_KEY=your-strong-secret-key-here
```

### 3. Run Database Migration & Setup
```bash
node setup-database.js
```

### 4. Start the Application
```bash
npm start
```

### 5. Admin Access (Important!)
- **Hidden Triggers**: Long press logo (3 sec) OR Ctrl+Shift+A
- **Credentials**: Your environment ADMIN_USERNAME and ADMIN_KEY
- **Security**: No visible admin UI for regular users
- **IMPORTANT**: Use strong, unique values for ADMIN_KEY!

## How to Use New Features

### Weekly Tournaments (Automatic)
1. **Every Wednesday 3:00 PM UTC+1** (Africa/Lagos): Tournament automatically scheduled
2. **30 minutes before**: Countdown banner appears
3. **Tournament starts**: UI automatically switches to tournament mode
4. **5 rounds**: Complete all rounds with 15-minute breaks between
5. **Qualification**: Must complete all 5 rounds without timeouts
6. **Leaderboard**: Select "Tournament" to view combined scores

### Hidden Admin Access (Secure)
1. **Trigger admin mode**:
   - Long press the logo for 3 seconds, OR
   - Press Ctrl+Shift+A on keyboard
2. **Enter credentials**:
   - Username: Your ADMIN_USERNAME environment variable
   - Admin Key: Your ADMIN_KEY environment variable
3. **Tournament Management**:
   - Start tournaments immediately
   - Stop active tournaments
   - Advance rounds manually
   - Complete tournaments early
4. **Manual Overrides**:
   - Force specific leaderboard types
   - Enable tournament mode outside schedule
   - Set custom round numbers
   - Override automatic behaviors for testing

### Automated Leaderboard Experience
- **Smart Switching**: Leaderboard automatically changes based on context:
  - **Normal Times**: All-time best scores
  - **Tournament Countdown**: This week's scores (builds excitement)
  - **During Tournament**: Live tournament rankings
  - **Post-Tournament**: Weekly achievements spotlight
- **Zero User Input**: No buttons or dropdowns - fully automated
- **Contextual Headers**: Dynamic titles show current leaderboard type
- **Live Updates**: Real-time data refreshing every 30 seconds

### Intelligent Automation Features
- Tournament status updates every 30 seconds
- Automatic mode switching during all tournament phases
- Live countdown timers with smart display logic
- Visual status indicators with phase-specific animations
- Contextual UI elements appear/disappear as needed

## Technical Notes

### Tournament System
- **Scheduling**: Uses Africa/Lagos timezone (UTC+1) for Wednesday 3 PM start
- **Status Management**: Real-time status tracking with database persistence
- **Round Management**: Supports 5-round tournaments with break intervals
- **Scoring**: Requires completion of all 5 rounds without timeouts to qualify

### Security
- **Admin Authentication**: Secure password hashing with bcryptjs
- **Session Management**: 24-hour session tokens with automatic expiry
- **Access Control**: Protected admin endpoints with bearer token auth

### Performance
- **Database Indexes**: Optimized for tournament and weekly queries
- **Real-time Updates**: Efficient 30-second polling for status updates
- **Timeout Handling**: Preserved timeout data for transparency and analytics

### Data Integrity
- **Historical Preservation**: All data preserved during migrations
- **Safe Migrations**: Idempotent database migrations
- **Backward Compatibility**: Enhanced existing APIs without breaking changes

### Monitoring & Analytics
- **Timeout Statistics**: Completion rate tracking and transparency
- **Tournament Analytics**: Round-by-round performance data
- **Admin Dashboard**: Real-time system monitoring and control
