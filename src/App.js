import React, { useState, useEffect, useCallback, useRef } from "react";
import puzzleImg from "./ritualpuzzle.jpg";
import "./App.css";
import RitualLogo from "./RitualLogo.js";

const GRID_SIZE = 4;
const EMPTY_TILE = GRID_SIZE * GRID_SIZE - 1;
const IMG_URL = puzzleImg;
const MAX_TIME = 300; // 5 minutes

function App() {
  const [username, setUsername] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [tiles, setTiles] = useState([]);
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const timerIntervalRef = useRef(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [leaderboardType, setLeaderboardType] = useState("weekly");
  const [tournamentMode, setTournamentMode] = useState(false); // automatically set based on tournament status
  const [tournamentStatus, setTournamentStatus] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminAuth, setAdminAuth] = useState(null);
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [logoLongPressTimer, setLogoLongPressTimer] = useState(null);
  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);
  const [toasts, setToasts] = useState([]);

  // Use refs to track current values to avoid dependency issues
  const leaderboardTypeRef = useRef(leaderboardType);
  const tournamentStatusRef = useRef(tournamentStatus);
  const statusFetchInFlightRef = useRef(false);
  const lastStatusFetchAtRef = useRef(0);
  const countdownRef = useRef(countdown);
  
  leaderboardTypeRef.current = leaderboardType;
  tournamentStatusRef.current = tournamentStatus;
  countdownRef.current = countdown;
  
  // fetch leaderboard - stable function
  const fetchLeaderboard = useCallback(async () => {
    const currentType = leaderboardTypeRef.current;
    try {
      let url = "/api/leaderboard";
      
      if (currentType === "weekly") {
        url += "?type=weekly";
      } else if (currentType === "tournament") {
        const ts = tournamentStatusRef.current;
        const tid = ts && ts.id ? `&tournamentId=${ts.id}` : "";
        // During an active round, show the per-round leaderboard; otherwise show combined
        if (ts && ts.status === 'active') {
          const round = ts.currentRound || 1;
          url = `/api/tournament?round=${round}&mode=single${tid}`;
        } else {
          url = `/api/tournament?round=1&mode=combined${tid}`;
        }
      } else if (currentType === "final") {
        url = `/api/tournament-final`;
      }
      
      const res = await fetch(url);
      if (!res.ok) {
        console.error("Leaderboard API error:", res.status, res.statusText);
        return; // Don't update state on error
      }
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      // Keep existing leaderboard on error to prevent UI flashing
    }
  }, []); // No dependencies - truly stable

// fetch tournament status - stable function
const fetchTournamentStatus = useCallback(async () => {
  const now = Date.now();
  // Throttle and de-dupe: max 1 request / 10s
  if (statusFetchInFlightRef.current) return;
  if (now - lastStatusFetchAtRef.current < 10000) return;
  statusFetchInFlightRef.current = true;
  try {
    const res = await fetch("/api/tournament-status");
    if (!res.ok) {
      console.error("Tournament status API error:", res.status, res.statusText);
      return;
    }
    const data = await res.json();
    setTournamentStatus(data);
  } catch (err) {
    console.error("Failed to fetch tournament status:", err);
    setTournamentStatus(null);
  } finally {
    lastStatusFetchAtRef.current = Date.now();
    statusFetchInFlightRef.current = false;
  }
}, []);

  // Initial fetch on mount; status only after interaction (game or admin panel)
  useEffect(() => {
    fetchLeaderboard();
    if (gameStarted || showAdminPanel) {
      fetchTournamentStatus();
    }
  }, [fetchLeaderboard, fetchTournamentStatus, gameStarted, showAdminPanel, leaderboardType]);
  
  // Smart tournament checking - ultra-minimal polling (only after interaction)
  useEffect(() => {
    let statusInterval;
    
    // Only start polling for active tournaments and breaks
    if ((gameStarted || showAdminPanel) && tournamentStatus && ['active', 'break'].includes(tournamentStatus.status)) {
      statusInterval = setInterval(() => {
        fetchTournamentStatus();
      }, 300000); // Every 5 minutes during active/break
    }
    
    return () => {
      if (statusInterval) clearInterval(statusInterval);
    };
  }, [tournamentStatus, fetchTournamentStatus, gameStarted, showAdminPanel]);
  
  // Separate effect for countdown polling - only during final 60s (after interaction)
  useEffect(() => {
    let countdownPolling;
    
    // Only poll during the final 60 seconds of countdown
    if ((gameStarted || showAdminPanel) && tournamentStatus?.status === 'countdown' && countdown > 0) {
      if (countdown <= 60) {
        const pollInterval = 10000; // Every 10 seconds in final minute
        countdownPolling = setInterval(() => {
          fetchTournamentStatus();
        }, pollInterval);
      }
    }
    
    return () => {
      if (countdownPolling) clearInterval(countdownPolling);
    };
  }, [tournamentStatus?.status, countdown, fetchTournamentStatus, gameStarted, showAdminPanel]);
  
  // Fetch leaderboard when type changes
  useEffect(() => {
    fetchLeaderboard();
  }, [leaderboardType, fetchLeaderboard]);
  
  // Reset pagination when leaderboard type changes
  useEffect(() => {
    setCurrentPage(1);
  }, [leaderboardType]);
  
  // Tournament countdown effect - compute locally, low frequency
  useEffect(() => {
    // Only compute after interaction and only during countdown
    if (!(gameStarted || showAdminPanel)) { setCountdown(null); return; }
    if (tournamentStatus?.status !== 'countdown') { setCountdown(null); return; }

    const compute = () => {
      const now = new Date();
      const startTime = tournamentStatus.startTime || tournamentStatus.scheduled_start;
      if (!startTime) { setCountdown(null); return; }
      const timeLeft = new Date(startTime) - now;
      if (timeLeft > 0) {
        setCountdown(Math.ceil(timeLeft / 1000));
      } else {
        setCountdown(null);
        fetchTournamentStatus();
      }
    };

    compute();
    // Light cadence: every 15s; final minute handled by separate effect
    const id = setInterval(compute, 15000);
    return () => clearInterval(id);
  }, [tournamentStatus?.status, tournamentStatus?.startTime, tournamentStatus?.scheduled_start, gameStarted, showAdminPanel, fetchTournamentStatus]);
  
  // Auto-switch modes based on tournament status (only when admin panel is not open)
  useEffect(() => {
    if (!tournamentStatus || showAdminPanel) return;
    
    switch (tournamentStatus.status) {
      case 'countdown':
        // During any countdown, keep weekly leaderboard to avoid empty tournament table
        setTournamentMode(false);
        setLeaderboardType('weekly');
        break;
        
      case 'active':
        // Switch to tournament mode and leaderboard
        setTournamentMode(true);
        setCurrentRound(tournamentStatus.currentRound || 1);
        setLeaderboardType('tournament');
        break;
        
      case 'break':
        // During breaks, show tournament progress
        setTournamentMode(true);
        setCurrentRound(tournamentStatus.currentRound || 1);
        setLeaderboardType('tournament');
        break;
        
      case 'completed':
        // After tournament, show this week's results
        setTournamentMode(false);
        setLeaderboardType('weekly');
        break;
        
      default:
        // Default to all-time leaderboard
        setTournamentMode(false);
        setLeaderboardType('all');
        break;
    }
  }, [tournamentStatus, showAdminPanel, leaderboardType]);

  useEffect(() => {
    if (gameStarted && !gameOver) {
      const id = setInterval(() => setTimer((t) => t + 1), 1000);
      timerIntervalRef.current = id;
      return () => {
        clearInterval(id);
        timerIntervalRef.current = null;
      };
    } else {
      // Clear any existing interval when game stops
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  }, [gameStarted, gameOver]);

// submit score
const submitScore = useCallback(
    async (timeout = false) => {
      try {
        const ts = tournamentStatusRef.current;
        let tournamentId = null;
        let roundId = null;
        
        // Only include tournament data if we're in an active tournament
        if (tournamentMode && ts && ts.id && ts.status === 'active') {
          tournamentId = ts.id;
          // roundId can be resolved from backend if needed; using null for now
        }
        
        await fetch("/api/submit-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            username, 
            moves, 
            time: timer, 
            timeout,
            round: tournamentMode ? currentRound : 1,
            tournamentId: tournamentId,
            roundId: roundId
          }),
        });
        
        // Refresh leaderboard after a short delay
        setTimeout(() => {
          fetchLeaderboard();
        }, 1000);
      } catch (err) {
        console.error("Failed to submit score:", err);
      }
    },
    [username, moves, timer, tournamentMode, currentRound, fetchLeaderboard]
  );

  // auto game over if time > MAX_TIME
  useEffect(() => {
    if (gameStarted && timer >= MAX_TIME && !gameOver) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setGameOver(true);
      submitScore(true); // mark timeout
    }
  }, [timer, gameStarted, gameOver, submitScore]);



// format countdown time
const formatCountdown = (seconds) => {
  if (!seconds) return null;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

// admin login with environment validation
const handleAdminLogin = async () => {
  if (!username || !adminKey) {
    showToast("Please enter both username and admin key", 'warning');
    return false;
  }
  
  try {
    const res = await fetch("/api/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "login", 
        username: username.trim(), 
        adminKey: adminKey.trim() 
      }),
    });
    
    const data = await res.json();
    if (data.isAdmin) {
      setAdminAuth({ user: { username }, adminKey: adminKey.trim() });
      setShowAdminPanel(true);
      setShowAdminKey(false);
      setAdminKey("");
      showToast("Admin login successful", 'success');
      return true;
    } else {
      showToast("Invalid admin credentials", 'error');
      return false;
    }
  } catch (err) {
    console.error("Admin login failed:", err);
    showToast("Login failed", 'error');
    return false;
  }
};

// Logo long press handler
const handleLogoMouseDown = () => {
  const timer = setTimeout(() => {
    // If admin is already authenticated, open panel directly
    if (adminAuth) {
      setShowAdminPanel(true);
    } else {
      setShowAdminKey(true);
    }
  }, 3000); // 3 second long press
  setLogoLongPressTimer(timer);
};

const handleLogoMouseUp = () => {
  if (logoLongPressTimer) {
    clearTimeout(logoLongPressTimer);
    setLogoLongPressTimer(null);
  }
};

// Keyboard shortcut handler (Ctrl+Shift+A)
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault();
      // If admin is already authenticated, open panel directly
      if (adminAuth) {
        setShowAdminPanel(true);
      } else {
        setShowAdminKey(true);
      }
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [adminAuth]);

  const startGame = () => {
    const initialTiles = Array.from(
      { length: GRID_SIZE * GRID_SIZE },
      (_, i) => i
    );
    setTiles(shuffle(initialTiles));
    setMoves(0);
    setTimer(0);
    setGameOver(false);
    setGameStarted(true);
  };

  const resetGame = () => {
    startGame();
  };

  const shuffle = (array) => {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const tryMove = (i) => {
    if (gameOver) return;

    const emptyIndex = tiles.indexOf(EMPTY_TILE);
    const validMoves = getValidMoves(emptyIndex);
    if (validMoves.includes(i)) {
      const newTiles = [...tiles];
      [newTiles[i], newTiles[emptyIndex]] = [
        newTiles[emptyIndex],
        newTiles[i],
      ];
      setTiles(newTiles);
      const newMoves = moves + 1;
      setMoves(newMoves);

      // Check achievements after each move
      checkAchievements(newMoves, timer);

      if (isSolved(newTiles)) {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setGameOver(true);
        submitScore();
      }
    }
  };

  const getValidMoves = (emptyIndex) => {
    const row = Math.floor(emptyIndex / GRID_SIZE);
    const col = emptyIndex % GRID_SIZE;
    const moves = [];

    if (row > 0) moves.push(emptyIndex - GRID_SIZE);
    if (row < GRID_SIZE - 1) moves.push(emptyIndex + GRID_SIZE);
    if (col > 0) moves.push(emptyIndex - 1);
    if (col < GRID_SIZE - 1) moves.push(emptyIndex + 1);

    return moves;
  };

  const isSolved = (tiles) => {
    return tiles.every((tile, index) => tile === index);
  };

  // Build a compact pagination list like: 1 2 3 … N or 1 … P-1 P P+1 … N
  const getPageList = (totalPages, page) => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    if (page <= 3) {
      pages.push(1, 2, 3, '…', totalPages);
      return pages;
    }
    if (page >= totalPages - 2) {
      pages.push(1, '…', totalPages - 2, totalPages - 1, totalPages);
      return pages;
    }
    pages.push(1, '…', page - 1, page, page + 1, '…', totalPages);
    return pages;
  };

  // Toast helpers
  const showToast = useCallback((message, type = 'info', durationMs = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  // Calculate puzzle completion progress
  const getProgress = () => {
    if (tiles.length === 0) return 0;
    const solvedTiles = tiles.filter((tile, index) => tile === index).length;
    return (solvedTiles / (GRID_SIZE * GRID_SIZE)) * 100;
  };

  // Check and award achievements
  const checkAchievements = (currentMoves, currentTime) => {
    const newAchievements = [];
    
    // Speed achievements
    if (currentTime <= 30 && !achievements.includes('speed_demon')) {
      newAchievements.push('speed_demon');
    }
    if (currentTime <= 60 && !achievements.includes('fast_solver')) {
      newAchievements.push('fast_solver');
    }
    
    // Move efficiency achievements
    if (currentMoves <= 50 && !achievements.includes('efficient_mover')) {
      newAchievements.push('efficient_mover');
    }
    if (currentMoves <= 25 && !achievements.includes('minimal_moves')) {
      newAchievements.push('minimal_moves');
    }
    
    // First puzzle achievement
    if (currentMoves === 1 && !achievements.includes('first_move')) {
      newAchievements.push('first_move');
    }
    
    if (newAchievements.length > 0) {
      setAchievements(prev => [...prev, ...newAchievements]);
      // Show achievement notification
      newAchievements.forEach(achievement => {
        showAchievementNotification(achievement);
      });
    }
  };

  // Show achievement notification
  const showAchievementNotification = (achievement) => {
    const achievementNames = {
      'speed_demon': '🚀 Speed Demon!',
      'fast_solver': '⚡ Fast Solver!',
      'efficient_mover': '🎯 Efficient Mover!',
      'minimal_moves': '👑 Minimal Moves!',
      'first_move': '🎉 First Move!'
    };
    
    // Create temporary notification
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.textContent = `🏆 ${achievementNames[achievement]}`;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  };

  if (!gameStarted) {
    return (
      <div className="start-screen">
        <header className="site-header">
          <div 
            className="logo admin-trigger"
            onMouseDown={handleLogoMouseDown}
            onMouseUp={handleLogoMouseUp}
            onTouchStart={handleLogoMouseDown}
            onTouchEnd={handleLogoMouseUp}
            title="Long press for 3 seconds or Ctrl+Shift+A for admin access"
          >
            <RitualLogo size={40} />
          </div>
          <h1 className="title">Ritual Puzzle</h1>
          
          {/* Admin Settings Button: hidden on landing; shown only in-game */}
          {false && adminAuth && (
            <button 
              className="admin-settings-btn"
              onClick={() => setShowAdminPanel(true)}
              title="Open Admin Panel"
            >
              ⚙️
            </button>
          )}
        </header>
        <div className="start-content">
          <h2>Welcome to Ritual Puzzle!</h2>
          <p>Test your skills with this challenging sliding picture puzzle.</p>
        <input
          type="text"
            placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
            className="username-input"
          />
          
          {showAdminKey && (
            <div className="admin-key-section">
              <input
                type="password"
                placeholder="Admin key"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="admin-key-input"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
              />
              <div className="admin-actions">
                <button onClick={handleAdminLogin} className="admin-login-btn">
                  Admin Login
                </button>
                <button 
                  onClick={() => { setShowAdminKey(false); setAdminKey(""); }} 
                  className="cancel-admin-btn"
                >
                  Cancel
                </button>
              </div>
              <small style={{ color: '#999', display: 'block', marginTop: '10px', textAlign: 'center' }}>
                💡 Once logged in, use the same triggers to reopen the panel
              </small>
            </div>
          )}
          
          <button onClick={startGame} className="start-btn" disabled={!username}>
          Start Game
        </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
      <header className="site-header">
        <div 
          className="logo admin-trigger"
          onMouseDown={handleLogoMouseDown}
          onMouseUp={handleLogoMouseUp}
          onTouchStart={handleLogoMouseDown}
          onTouchEnd={handleLogoMouseUp}
          title="Long press for 3 seconds or Ctrl+Shift+A for admin access"
        >
          <RitualLogo size={40} />
        </div>
        <h1 className="title">Ritual Puzzle</h1>
        
        {/* Admin Settings Button - only visible when admin is logged in */}
        {adminAuth && (
          <button 
            className="admin-settings-btn"
            onClick={() => setShowAdminPanel(true)}
            title="Open Admin Panel"
          >
            ⚙️
          </button>
        )}
      </header>

      {/* Tournament Status & Countdown */}
      {tournamentStatus && (
        <div className={`tournament-banner ${tournamentStatus.status}`}>
          {tournamentStatus.status === 'scheduled' && countdown && (
            <div className="tournament-info">
              <h3>🏆 Next Tournament</h3>
              <p>Countdown begins in: <strong>{formatCountdown(countdown)}</strong></p>
              <small>Wednesday 2:00 PM UTC</small>
            </div>
          )}
          {tournamentStatus.status === 'countdown' && countdown && (
            <div className="tournament-info countdown-active">
              <h3>🚀 Tournament Starting Soon!</h3>
              <p>Starts in: <strong>{formatCountdown(countdown)}</strong></p>
              <small>Get ready for 5 rounds!</small>
            </div>
          )}
          {tournamentStatus.status === 'active' && (
            <div className="tournament-info active">
              <h3>🔥 Tournament LIVE!</h3>
              <p>Round {tournamentStatus.currentRound || 1} of {tournamentStatus.totalRounds || 5}</p>
              <small>Complete all rounds to qualify!</small>
            </div>
          )}
          {tournamentStatus.status === 'break' && (
            <div className="tournament-info break">
              <h3>☕ Tournament Break</h3>
              {tournamentStatus.breakTimeRemaining ? (
                <p>Next round starts in: <strong>{formatCountdown(tournamentStatus.breakTimeRemaining)}</strong></p>
              ) : (
                <p>Next round starts soon...</p>
              )}
              <small>Round {(tournamentStatus.currentRound || 1) + 1} of {tournamentStatus.totalRounds || 5}</small>
            </div>
          )}
        </div>
      )}

      <div className="game">
        <div className="puzzle-area">
                    <div className="status-bar">
            <span className="player">👤 {username}</span>
            <span className="moves">🧩 {moves} moves</span>
            <span className="time">⏱ {timer}s</span>
          </div>
          
          {/* Progress Bar */}
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${getProgress()}%` }}
              ></div>
            </div>
            <span className="progress-text">{Math.round(getProgress())}% Complete</span>
          </div>
          
          {/* Move Limit Warning */}
          {moves >= 90 && (
            <div className="move-warning">
              ⚠️ {120 - moves} moves remaining!
            </div>
          )}

          <div
            className="puzzle"
            style={{
              gridTemplate: `repeat(${GRID_SIZE}, 1fr) / repeat(${GRID_SIZE}, 1fr)`,
            }}
          >
            {tiles.map((tile, i) => (
              <div
                key={i}
                className="tile"
                style={{
                  backgroundImage:
                    tile !== EMPTY_TILE ? `url(${IMG_URL})` : "none",
                  backgroundPosition:
                    tile !== EMPTY_TILE
                      ? `-${(tile % GRID_SIZE) * 100}px -${
                          Math.floor(tile / GRID_SIZE) * 100
                        }px`
                      : "none",
                }}
                onClick={() => tryMove(i)}
              ></div>
            ))}
          </div>
          
          <button onClick={resetGame} className="reset-btn">
            Reset
          </button>
        </div>

        <aside className="leaderboard">
  <div className="leaderboard-header">
    <h2>
      {leaderboardType === 'tournament' ? '🏆 Tournament Leaderboard' : 
       leaderboardType === 'weekly' ? '📅 This Week' : 
       leaderboardType === 'final' ? '🏅 Final Tournament Results' : 
       '🏅 All Time Leaderboard'}
    </h2>
    {tournamentMode && (
      <div className="round-indicator">
        Round {currentRound}/5
      </div>
    )}
  </div>
  <table>
    <thead>
      <tr>
        {leaderboardType === 'final' ? (
          <>
            <th>Rank</th>
            <th>Player</th>
            <th>Rounds Won</th>
            <th>Won Rounds</th>
            <th>Completed</th>
          </>
        ) : (
          <>
            <th>Rank</th>
            <th>Player</th>
            <th>Moves</th>
            <th>Time (s)</th>
          </>
        )}
      </tr>
    </thead>
    <tbody>
      {(() => {
        const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
        const pageItems = leaderboard.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
        return pageItems.map((entry, i) => {
          const rank = pageStartIndex + i + 1;
          let className = "";
          if (rank === 1) className = "gold";
          else if (rank === 2) className = "silver";
          else if (rank === 3) className = "bronze";
          return (
            <tr key={rank} className={className}>
              <td>{rank}</td>
              <td>{entry.username}</td>
              {leaderboardType === 'final' ? (
                <>
                  <td>{entry.rounds_won} 🏆</td>
                  <td>
                    {entry.won_rounds && entry.won_rounds.length > 0 ? 
                      entry.won_rounds.map(round => `R${round}`).join(', ') : 
                      '-'
                    }
                  </td>
                  <td>{entry.rounds_completed}/5</td>
                </>
              ) : (
                <>
                  <td>{leaderboardType === "tournament" ? entry.total_moves || entry.moves : entry.moves}</td>
                  <td>{leaderboardType === "tournament" ? entry.total_time || entry.time : entry.time}</td>
                </>
              )}
            </tr>
          );
        });
      })()}
    </tbody>
  </table>
  <div className="pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
    {(() => {
      const totalPages = Math.max(1, Math.ceil(leaderboard.length / PAGE_SIZE));
      const items = getPageList(totalPages, currentPage);
      return items.map((item, idx) => {
        if (item === '…') {
          return <span key={`e-${idx}`} style={{ padding: '4px 8px', color: '#aaa' }}>…</span>;
        }
        const n = item;
        const isActive = n === currentPage;
        return (
          <button
            key={`p-${n}`}
            onClick={() => setCurrentPage(n)}
            disabled={isActive}
            className={`page-btn ${isActive ? 'active' : ''}`}
            style={{
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid #444',
              background: isActive ? '#555' : '#222',
              color: '#fff',
              cursor: isActive ? 'default' : 'pointer'
            }}
          >
            {n}
          </button>
        );
      });
    })()}
  </div>
</aside>

      </div>
      
      {/* Admin Panel */}
      {showAdminPanel && (
        <div className="admin-panel">
          <div className="admin-content">
            <div className="admin-header">
              <h2>🔐 Admin Panel</h2>
              <button onClick={() => setShowAdminPanel(false)}>✕</button>
            </div>
            
            <AdminDashboard 
              adminAuth={adminAuth}
              tournamentStatus={tournamentStatus}
              onRefresh={fetchTournamentStatus}
              leaderboardType={leaderboardType}
              setLeaderboardType={setLeaderboardType}
              tournamentMode={tournamentMode}
              setTournamentMode={setTournamentMode}
              currentRound={currentRound}
              setCurrentRound={setCurrentRound}
              showToast={showToast}
            />
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <p>&copy; 2025 Ritual Puzzle. Made with ❤️ for the Ritual Community.</p>
          <div className="footer-links">
            <span>Version 1.0</span>
            <span>•</span>
            <span>Best Time: {leaderboard.length > 0 ? leaderboard[0].time : '--'}s</span>
          </div>
        </div>
      </footer>
    </div>
  );
}



// Admin Dashboard Component
function AdminDashboard({ 
  adminAuth, 
  tournamentStatus, 
  onRefresh, 
  leaderboardType, 
  setLeaderboardType,
  tournamentMode,
  setTournamentMode,
  currentRound,
  setCurrentRound,
  showToast
}) {
  const [loading, setLoading] = useState(false);
  
  const apiCall = async (endpoint, data = {}) => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminAuth.adminKey}`
        },
        body: JSON.stringify(data)
      });
      
      const result = await res.json();
      if (result.success) {
        showToast("Operation successful!", 'success');
        onRefresh();
      } else {
        showToast(result.error || "Operation failed", 'error');
      }
    } catch (err) {
      showToast("Operation failed: " + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="admin-dashboard">
      <div className="admin-info">
        <p>Logged in as: <strong>{adminAuth.user.username}</strong></p>
        <small>Tournament Status: <span className={`status ${tournamentStatus?.status}`}>
          {tournamentStatus?.status || 'Unknown'}
        </span></small>
      </div>
      
      <div className="admin-controls">
        <div className="control-group">
          <h3>Tournament Control</h3>
          <button 
            onClick={() => apiCall("/api/admin-dashboard", { 
              action: "start_tournament",
              mode: 'manual',
              total_rounds: 5,
              adminUsername: adminAuth?.user?.username || 'ritual-admin'
            })}
            disabled={loading || ['active', 'prep', 'break'].includes(tournamentStatus?.status)}
          >
            🚀 Start Tournament Now
          </button>
          <button 
            onClick={() => apiCall("/api/admin-dashboard", { action: "stop_tournament" })}
            disabled={loading || !['active', 'countdown'].includes(tournamentStatus?.status)}
          >
            🛑 Stop Tournament
          </button>
          <button 
            onClick={() => apiCall("/api/admin-dashboard", { action: "next_round" })}
            disabled={loading || tournamentStatus?.status !== 'active'}
          >
            ➡️ Next Round
          </button>
          <button 
            onClick={() => apiCall("/api/admin-dashboard", { action: "complete_tournament" })}
            disabled={loading || tournamentStatus?.status !== 'active'}
          >
            🏁 Complete Tournament
          </button>
        </div>
        
        <div className="control-group">
          <h3>Manual Overrides</h3>
          <div className="manual-controls">
            <label>Leaderboard Type:</label>
            <select 
              value={leaderboardType} 
              onChange={(e) => setLeaderboardType(e.target.value)}
              className="admin-select"
            >
              <option value="all">All Time</option>
              <option value="weekly">This Week</option>
              <option value="tournament">Tournament</option>
              <option value="final">Final Results</option>
            </select>
            
            <label>Tournament Mode:</label>
            <button 
              onClick={() => setTournamentMode(!tournamentMode)}
              className={`admin-toggle ${tournamentMode ? 'active' : ''}`}
            >
              {tournamentMode ? `Round ${currentRound}/5` : 'Enable Tournament Mode'}
            </button>
            
            {tournamentMode && (
              <div className="round-controls">
                <label>Current Round:</label>
                <div className="round-buttons">
                  {[1, 2, 3, 4, 5].map(round => (
                    <button
                      key={round}
                      onClick={() => setCurrentRound(round)}
                      className={`round-btn ${currentRound === round ? 'active' : ''}`}
                    >
                      {round}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="control-group">
          <h3>Maintenance</h3>
          <button 
            onClick={() => {
              if (window.confirm("Delete leaderboard data older than 90 days?")) {
                apiCall("/api/admin-dashboard", { action: "cleanup_old_data", daysOld: 90 });
              }
            }}
            disabled={loading}
          >
            🧹 Cleanup Old Data
          </button>
          <button onClick={onRefresh} disabled={loading}>
            🔄 Refresh Status
          </button>
        </div>
      </div>
      
      {tournamentStatus && (
        <div className="tournament-details">
          <h3>Tournament Details</h3>
          <p><strong>Status:</strong> {tournamentStatus.status}</p>
          <p><strong>Current Round:</strong> {tournamentStatus.currentRound || 0} / {tournamentStatus.totalRounds || 5}</p>
          {tournamentStatus.startTime && (
            <p><strong>Start Time:</strong> {new Date(tournamentStatus.startTime).toLocaleString()}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
