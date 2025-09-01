import React, { useState, useEffect, useCallback } from "react";
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
  const [intervalId, setIntervalId] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [achievements, setAchievements] = useState([]);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  useEffect(() => {
    if (gameStarted && !gameOver) {
      const id = setInterval(() => setTimer((t) => t + 1), 1000);
      setIntervalId(id);
      return () => clearInterval(id);
    }
  }, [gameStarted, gameOver]);

  // submit score
const submitScore = useCallback(
    async (timeout = false) => {
      try {
        await fetch("/api/submit-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, moves, time: timer, timeout }),
        });
        fetchLeaderboard();
      } catch (err) {
        console.error("Failed to submit score:", err);
      }
    },
    [username, moves, timer]
  );

  // auto game over if time > MAX_TIME
  useEffect(() => {
    if (gameStarted && timer >= MAX_TIME && !gameOver) {
      clearInterval(intervalId);
      setGameOver(true);
      submitScore(true); // mark timeout
    }
  }, [timer, gameStarted, gameOver, intervalId, submitScore]);

  // fetch leaderboard
const fetchLeaderboard = async () => {
  try {
    const res = await fetch("/api/leaderboard");
    const data = await res.json();
    setLeaderboard(data);
  } catch (err) {
    console.error("Failed to fetch leaderboard:", err);
  }
};

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
        clearInterval(intervalId);
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
          <div className="logo">
            <RitualLogo size={40} />
          </div>
          <h1 className="title">Ritual Puzzle</h1>
        </header>
        <input
          type="text"
          placeholder="Enter Discord username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={startGame} disabled={!username}>
          Start Game
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="site-header">
        <div className="logo">
          <RitualLogo size={40} />
        </div>
        <h1 className="title">Ritual Puzzle</h1>
      </header>

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
  <h2>Leaderboard</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Player</th>
        <th>Moves</th>
        <th>Time (s)</th>
      </tr>
    </thead>
    <tbody>
      {leaderboard.map((entry, i) => {
        let className = "";
        if (i === 0) className = "gold";
        else if (i === 1) className = "silver";
        else if (i === 2) className = "bronze";

        return (
          <tr key={i} className={className}>
            <td>{i + 1}</td>
            <td>{entry.username}</td>
            <td>{entry.moves}</td>
            <td>{entry.time}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
</aside>

      </div>
      
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

export default App;
