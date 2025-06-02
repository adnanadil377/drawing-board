// frontend/src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import DrawingControls from './DrawingControls';
import GameEndScreen from './GameEndScreen';

const API_URL = 'https://boxapop492.pythonanywhere.com';
const POLLING_INTERVAL = 2500;

function App() {
  const [playerName, setPlayerName] = useState(localStorage.getItem('playerName') || '');
  const [customRoomNameForCreate, setCustomRoomNameForCreate] = useState('');
  const [roomCodeToJoin, setRoomCodeToJoin] = useState('');

  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(localStorage.getItem('currentPlayerId') || null);

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false); // General loading
  const [actionLoading, setActionLoading] = useState(false); // For specific button actions

  const pollingIntervalRef = useRef(null);
  const drawingControlsRef = useRef(null); // Ref for DrawingControls to trigger submit

  // Save player name and ID to local storage (same as before)
  useEffect(() => { playerName ? localStorage.setItem('playerName', playerName) : localStorage.removeItem('playerName'); }, [playerName]);
  useEffect(() => { currentPlayerId ? localStorage.setItem('currentPlayerId', currentPlayerId) : localStorage.removeItem('currentPlayerId'); }, [currentPlayerId]);
  useEffect(() => { currentRoom?.code ? localStorage.setItem('lastRoomCode', currentRoom.code) : localStorage.removeItem('lastRoomCode');}, [currentRoom]);


  const handleApiError = (err, defaultMessage) => {
    const message = err.response?.data?.detail || defaultMessage || "An unknown error occurred.";
    setError(message);
    console.error("API Error:", err.response || err);
    // setLoading(false); // Handled by actionLoading or specific cases
  };

  const fetchRoomDetails = useCallback(async (code, isSilent = false) => {
    if (!code) return;
    if (!isSilent) setLoading(true); // Show general loading only if not silent poll
    try {
      const response = await axios.get(`${API_URL}/rooms/${code.toUpperCase()}`);
      setCurrentRoom(response.data);
      if (!isSilent) setError(null);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(`Room ${code.toUpperCase()} no longer exists.`);
        setCurrentRoom(null); setCurrentPlayerId(null);
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      } else if (!isSilent) {
        console.error("Poll/Fetch error:", err);
        setError("Failed to update room details.");
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentRoom?.code) {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      // Initial fetch immediately if joining/creating, then poll
      if (currentRoom.game_phase !== 'lobby' || !pollingIntervalRef.current) { // Avoid redundant fetch if just polled
          fetchRoomDetails(currentRoom.code, true); // Silent fetch first
      }
      pollingIntervalRef.current = setInterval(() => fetchRoomDetails(currentRoom.code, true), POLLING_INTERVAL);
      return () => clearInterval(pollingIntervalRef.current);
    } else {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    }
  }, [currentRoom?.code, fetchRoomDetails]); // Depend on currentRoom.code to restart poll if room changes

  // Auto-submit drawing when timer in DrawingControls reaches 0
  // This needs DrawingControls to expose a way to tell App.js its timer is up, or App.js to calculate it.
  // For now, we'll rely on the user submitting or the host potentially ending round (not implemented fully)
  // A better approach: DrawingControls calls a prop function `onTimerEnd`
  const handleDrawingTimeUp = useCallback(async () => {
    if (currentRoom?.game_phase === 'drawing' && currentPlayerId === currentRoom.current_drawer_id) {
      console.log("Time is up! Auto-submitting drawing...");
      if (drawingControlsRef.current && drawingControlsRef.current.getDrawingData) {
        const imageData = drawingControlsRef.current.getDrawingData(); // Assume this method exists
        if (imageData) {
          await handleSubmitDrawing(imageData);
        } else {
          // Submit empty if no drawing data (or handle error)
          await handleSubmitDrawing(""); // Or some placeholder for "no drawing"
        }
      }
    }
  }, [currentRoom, currentPlayerId]); // Dependencies will be added for handleSubmitDrawing


  // API Call Functions (Create, Join, Leave - mostly same, ensure actionLoading is used)
  const handleCreateRoom = async (event) => {
    event.preventDefault();
    if (!playerName.trim()) { setError("Your name cannot be empty."); return; }
    setActionLoading(true); setError(null);
    try {
      const response = await axios.post(`${API_URL}/rooms/create`, {
        host_name: playerName, name: customRoomNameForCreate.trim() || `Room by ${playerName}`,
      });
      setCurrentRoom(response.data);
      const hostPlayer = response.data.players.find(p => p.name === playerName);
      if (hostPlayer) setCurrentPlayerId(hostPlayer.id);
      setCustomRoomNameForCreate('');
    } catch (err) { handleApiError(err, 'Failed to create room.'); }
    finally { setActionLoading(false); }
  };

  const handleJoinRoom = async (event) => {
    event.preventDefault();
    // ... (validation)
    if (!playerName.trim()) { setError("Your name cannot be empty."); return; }
    if (!roomCodeToJoin.trim()) { setError("Room code cannot be empty."); return; }
    setActionLoading(true); setError(null);
    try {
      const response = await axios.post(`${API_URL}/rooms/${roomCodeToJoin.toUpperCase()}/join`, { player_name: playerName });
      setCurrentRoom(response.data);
      const self = response.data.players.find(p => p.name === playerName && !currentRoom?.players.some(op => op.id === p.id && op !== p));
      if (self) {
          setCurrentPlayerId(self.id);
      } else {
          const newPlayer = response.data.players[response.data.players.length - 1];
          if (newPlayer && newPlayer.name === playerName) setCurrentPlayerId(newPlayer.id);
      }
      setRoomCodeToJoin('');
    } catch (err) { handleApiError(err, 'Failed to join room.'); }
    finally { setActionLoading(false); }
  };

  const handleLeaveRoom = async () => {
    if (!currentRoom || !currentPlayerId) return;
    setActionLoading(true); setError(null);
    try {
      await axios.post(`${API_URL}/rooms/${currentRoom.code}/leave`, { player_id: currentPlayerId });
      setCurrentRoom(null); setCurrentPlayerId(null);
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    } catch (err) {
        if (err.response?.data?.detail?.includes("Room closed")) {
            setCurrentRoom(null); setCurrentPlayerId(null); setError(err.response.data.detail);
        } else {
            handleApiError(err, 'Failed to leave room.');
        }
    } finally { setActionLoading(false); }
  };


  // --- New Game Flow API Calls ---
  const handleStartGame = async () => {
    if (!currentRoom || currentPlayerId !== currentRoom.host_id) return;
    setActionLoading(true); setError(null);
    try {
      const response = await axios.post(`${API_URL}/rooms/${currentRoom.code}/start-game`, { player_id: currentPlayerId });
      setCurrentRoom(response.data);
    } catch (err) { handleApiError(err, 'Failed to start game.'); }
    finally { setActionLoading(false); }
  };

  const handleSubmitDrawing = useCallback(async (imageDataB64) => {
    if (!currentRoom || currentRoom.game_phase !== 'drawing') {
        return;
    }
    setActionLoading(true); setError(null);
    try {
      const response = await axios.post(`${API_URL}/rooms/${currentRoom.code}/submit-drawing`, {
        player_id: currentPlayerId,
        image_b64: imageDataB64,
      });
      setCurrentRoom(response.data);
    } catch (err) {
      handleApiError(err, 'Failed to submit drawing.');
    } finally {
      setActionLoading(false);
    }
  }, [currentRoom, currentPlayerId]);

  // Auto-submit drawing when timer in DrawingControls reaches 0
  useEffect(() => {
    let timerId;
    if (currentRoom?.game_phase === 'drawing' &&
        currentRoom.round_start_time) {

      const startTime = new Date(currentRoom.round_start_time).getTime();
      const duration = currentRoom.round_duration_seconds * 1000;
      const endTime = startTime + duration;

      const checkTime = () => {
        if (Date.now() >= endTime) {
          // Only auto-submit if not already submitted
          if (
            !currentRoom.submitted_drawings.find(
              d => d.drawer_id === currentPlayerId
            )
          ) {
            if (drawingControlsRef.current && drawingControlsRef.current.getDrawingData) {
              const imageData = drawingControlsRef.current.getDrawingData();
              handleSubmitDrawing(imageData || "");
            }
          }
        } else {
          timerId = setTimeout(checkTime, Math.max(250, endTime - Date.now()));
        }
      };
      timerId = setTimeout(checkTime, Math.max(250, endTime - Date.now()));
    }
    return () => clearTimeout(timerId);
  }, [currentRoom?.game_phase, currentRoom?.round_start_time, currentRoom?.round_duration_seconds, currentPlayerId, handleSubmitDrawing, currentRoom?.submitted_drawings]);

  const handlePlayAgain = async () => {
    if (!currentRoom || currentPlayerId !== currentRoom.host_id || currentRoom.game_phase !== 'game_over') return;
    setActionLoading(true); setError(null);
    try {
      const response = await axios.post(`${API_URL}/rooms/${currentRoom.code}/play-again`, { player_id: currentPlayerId });
      setCurrentRoom(response.data);
    } catch (err) { handleApiError(err, 'Failed to start new game.'); }
    finally { setActionLoading(false); }
  };

  // Attempt to rejoin room on page load (same as before)
  useEffect(() => {
    const storedRoomCode = localStorage.getItem('lastRoomCode');
    const storedPlayerId = localStorage.getItem('currentPlayerId');
    const storedPlayerName = localStorage.getItem('playerName'); // Ensure this is also used

    if (storedRoomCode && storedPlayerId && storedPlayerName && !currentRoom) {
        setLoading(true); // General loading for rejoining
        axios.get(`${API_URL}/rooms/${storedRoomCode.toUpperCase()}`)
            .then(response => {
                const roomData = response.data;
                if (roomData.players.some(p => p.id === storedPlayerId)) {
                    setCurrentRoom(roomData);
                    setPlayerName(storedPlayerName); // Restore player name
                    // currentPlayerId is already set from localStorage by its own useEffect
                } else { // Player was in this room, but not anymore
                    setCurrentRoom(null); setCurrentPlayerId(null);
                    localStorage.removeItem('lastRoomCode'); localStorage.removeItem('currentPlayerId');
                }
            })
            .catch(() => {
                setCurrentRoom(null); setCurrentPlayerId(null);
                localStorage.removeItem('lastRoomCode'); localStorage.removeItem('currentPlayerId');
            })
            .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount


  // --- Render Logic ---
  if (loading && !currentRoom && !localStorage.getItem('lastRoomCode')) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-blue-200 via-blue-100 to-cyan-100 animate-fade-in">
        <div className="p-6 sm:p-10 rounded-3xl shadow-2xl bg-white/60 backdrop-blur-xl border-4 border-blue-300 flex flex-col items-center glass-card w-full max-w-lg">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-600 mb-4 drop-shadow-lg animate-bounce font-cursive tracking-wider flex items-center gap-3">
            <span className="crown-emoji">🎨</span> Drawing Game <span className="crown-emoji">🎨</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-700 animate-pulse">Loading Game...</p>
        </div>
      </div>
    );
  }

  // Game View
  if (currentRoom) {
    const isHost = currentPlayerId === currentRoom.host_id;
    const canStartGame = isHost && currentRoom.game_phase === 'lobby' && currentRoom.players.length >= 2;

    // Show End Screen
    if (currentRoom.game_phase === 'game_over') {
      return (
        <GameEndScreen
          room={currentRoom}
          isHost={isHost}
          onPlayAgain={handlePlayAgain}
          onLeaveRoom={handleLeaveRoom}
          loading={actionLoading}
        />
      );
    }

    // Active Game or Lobby
    // <div className="font-sans max-w-4xl mx-auto p-4 md:p-6">
    return (
<div className="min-h-screen bg-[#FFD700] flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 font-sans">
  <div className="w-full max-w-2xl bg-white border-4 border-black rounded-3xl shadow-2xl p-2 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
    {/* Header */}
    <header className="bg-[#FFF176] text-black p-2 sm:p-4 rounded-xl shadow-lg border-4 border-black text-center w-full max-w-md mx-auto">
      <h1 className="text-xl sm:text-2xl font-extrabold text-red-600 flex justify-center items-center gap-2">
        🎨 {currentRoom.name}
      </h1>
      <div className="mt-2 space-y-1 text-xs sm:text-sm text-black">
        <p>
          Room Code: <span className="bg-black text-yellow-300 px-2 py-1 rounded font-mono">{currentRoom.code}</span>
        </p>
        <p>
          Phase: <span className="font-semibold capitalize">{currentRoom.game_phase.replace('_', ' ')}</span>
        </p>
      </div>
    </header>
    {/* Error Message */}
    {error && (
      <div className="bg-white border-4 border-red-500 text-red-700 rounded-xl px-2 py-2 sm:px-4 sm:py-3 font-bold text-center w-full max-w-md mx-auto text-xs sm:text-base">
        {error}
      </div>
    )}
    {/* Lobby UI */}
    {currentRoom.game_phase === 'lobby' && (
      <div className="bg-[#00852B] text-white border-4 border-black rounded-2xl p-4 sm:p-6 shadow-md text-center w-full max-w-md mx-auto space-y-2 sm:space-y-4">
        <h3 className="text-lg sm:text-xl font-bold">⏳ Waiting in Lobby...</h3>
        {isHost ? (
          <>
            <p className="text-base sm:text-lg">
              {currentRoom.players.length < 2
                ? 'Need at least 2 players to start.'
                : 'Ready to start?'}
            </p>
            <button
              onClick={handleStartGame}
              disabled={actionLoading || !canStartGame}
              className="w-full py-2 sm:py-3 bg-yellow-400 text-black rounded-xl font-extrabold text-base sm:text-lg hover:bg-yellow-300 disabled:bg-gray-400 transition"
            >
              {actionLoading ? 'Starting...' : 'Start Game'}
            </button>
          </>
        ) : (
          <p className="text-base sm:text-lg">Waiting for the host to start the game.</p>
        )}
      </div>
    )}
    {/* Drawing UI */}
    {currentRoom.game_phase === 'drawing' && (
      <DrawingControls
        ref={drawingControlsRef}
        currentRoom={currentRoom}
        currentPlayerId={currentPlayerId}
        onSubmitDrawing={handleSubmitDrawing}
      />
    )}
    {/* Player List */}
    <section className="p-2 sm:p-6 border-4 border-black rounded-2xl bg-[#0B61A4] text-white w-full max-w-md mx-auto shadow-md">
      <h2 className="text-lg sm:text-xl font-extrabold mb-2 sm:mb-4">🧱 Players ({currentRoom.players.length}/{currentRoom.max_players})</h2>
      <ul className="space-y-2 sm:space-y-3">
        {currentRoom.players.map((player) => {
          const isCurrent = player.id === currentPlayerId;
          const isSubmitted = currentRoom.submitted_drawings.find((d) => d.drawer_id === player.id);
          return (
            <li
              key={player.id}
              className={`p-2 sm:p-3 rounded-xl flex flex-wrap justify-between items-center border-2 border-black ${
                isCurrent ? 'bg-yellow-300 font-bold text-black' : 'bg-white text-black'
              }`}
            >
              <span className="flex flex-wrap items-center gap-2">
                {player.name}
                {player.id === currentRoom.host_id && (
                  <span className="text-xs px-2 py-1 bg-yellow-400 text-red-600 rounded-full">👑 Host</span>
                )}
                {isCurrent && (
                  <span className="text-xs px-2 py-1 bg-white text-blue-800 rounded-full border border-blue-800">🎮 You</span>
                )}
              </span>
              {currentRoom.game_phase === 'drawing' && isSubmitted && (
                <span className="text-xs px-2 py-1 bg-yellow-400 text-green-800 rounded-full">✅ Submitted</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
    {/* Leave Room Button */}
    <div className="w-full max-w-md mx-auto">
      <button
        onClick={handleLeaveRoom}
        disabled={actionLoading}
        className="w-full py-2 sm:py-3 bg-[#E30613] text-white rounded-xl font-extrabold text-base sm:text-lg hover:bg-[#B0040F] disabled:bg-gray-400 transition"
      >
        {actionLoading ? 'Leaving...' : 'Leave Room'}
      </button>
    </div>
    {/* Footer */}
    <p className="text-xs text-center text-black font-semibold">
      Made with 🧱 LEGO Love
    </p>
  </div>
</div>
    );
  }

  // Lobby View (Create/Join) - beautiful UI
  return (
    <div className="min-h-screen bg-[#FFD700] flex flex-col items-center justify-center p-2 sm:p-6">
      <div className="w-full max-w-2xl bg-[#FFFFFF] border-4 border-black rounded-3xl shadow-2xl p-4 sm:p-8">
        <h1 className="text-2xl sm:text-4xl font-bold text-[#E30613] text-center mb-4 sm:mb-6">🎨 LEGO Drawing Game 🎨</h1>
        {error && <div className="bg-[#E30613] text-white rounded-xl py-2 px-4 mb-4">{error}</div>}
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Enter Your Name"
          className="w-full rounded-lg p-3 sm:p-4 text-base sm:text-lg border-2 border-black mb-3 sm:mb-4 bg-[#F2CD37] text-black"
        />
        <button
          onClick={handleCreateRoom}
          disabled={actionLoading}
          className="w-full bg-[#0B61A4] text-white rounded-lg p-3 sm:p-4 text-base sm:text-lg font-semibold mb-3 sm:mb-4 hover:bg-[#084A83] transition"
        >
          {actionLoading ? "Creating..." : "Create Room"}
        </button>
        <div className="text-center text-base sm:text-xl font-bold my-3 sm:my-4">OR</div>
        <input
          type="text"
          value={roomCodeToJoin}
          onChange={(e) => setRoomCodeToJoin(e.target.value.toUpperCase())}
          placeholder="Enter Room Code"
          maxLength={6}
          className="w-full rounded-lg p-3 sm:p-4 text-base sm:text-lg border-2 border-black mb-3 sm:mb-4 bg-[#00852B] text-white uppercase"
        />
        <button
          onClick={handleJoinRoom}
          disabled={actionLoading}
          className="w-full bg-[#E30613] text-white rounded-lg p-3 sm:p-4 text-base sm:text-lg font-semibold hover:bg-[#B0040F] transition"
        >
          {actionLoading ? "Joining..." : "Join Room"}
        </button>
        {/* LEGO-themed footer */}
        <footer className="mt-4 sm:mt-6 text-center text-[#666666] text-xs sm:text-sm">
          Made with 🧱 LEGO Love
        </footer>
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@700&display=swap');
        body, input, button {
          font-family: 'Fredoka', sans-serif;
        }
        input::placeholder {
          color: #333;
          opacity: 0.8;
        }
        .shadow-2xl {
          box-shadow: 8px 8px 0 black;
        }
      `}</style>
    </div>
  );
}

export default App;