// frontend/src/components/GameEndScreen.js
import React, { useEffect } from 'react';

// Confetti effect (simple SVG overlay) - Kept as is
const Confetti = () => {
  const legoColors = [
    '#E30613', // Lego Red
    '#0B61A4', // Lego Blue
    '#00852B', // Lego Green
    '#F2CD37', // Lego Yellow (using the brighter variant from App.jsx inputs)
    '#FF8C00', // Bright Orange
    '#4CAF50', // Another Green
    '#5DADE2', // Lighter Blue
    '#FF69B4', // Hot Pink (for extra festivity)
    '#FFFFFF', // White (will show against non-white parts of background)
  ];
  const numConfetti = 120; // Increased number of confetti particles
  const viewBoxWidth = 200;
  const viewBoxHeight = 200; // Using a viewBox for consistent coordinate system

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      style={{ opacity: 0.9 }} // Overall opacity for the confetti layer
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="xMidYMid meet" // Ensures viewBox fits and maintains aspect ratio
    >
      {[...Array(numConfetti)].map((_, i) => {
        const initialX = Math.random() * viewBoxWidth;
        // Start above the viewBox, ensuring they fall into view, with varied starting heights
        const startY = -(Math.random() * viewBoxHeight * 0.3) - (viewBoxHeight * 0.05) ; // Start from -5 to -65 if viewBoxHeight is 200

        // End below the viewBox, with varied end points
        const endYTarget = viewBoxHeight + (viewBoxHeight * 0.05) + (Math.random() * viewBoxHeight * 0.1);

        const rectWidth = 1.5 + Math.random() * 2; // Smaller, more numerous rects
        const rectHeight = 3 + Math.random() * 2.5;

        // Durations for animations
        const fallDuration = 3.5 + Math.random() * 3; // Time to fall through the viewBox
        const rotationDuration = 1.5 + Math.random() * 2.5; // Time for a full rotation
        const driftCycleDuration = 2.5 + Math.random() * 2; // Time for a full left-right sway cycle

        const driftAmount = 4 + Math.random() * 8; // Max horizontal sway in viewBox units

        // Stagger all animations for each particle by a random delay
        const delay = Math.random() * 4.5; // Delay up to 4.5 seconds

        // Random initial rotation and direction for more variety
        const initialRotationAngle = Math.floor(Math.random() * 360);
        const rotationDirection = Math.random() < 0.5 ? 1 : -1; // 1 for clockwise, -1 for counter-clockwise

        return (
          // Group for positioning (initialX, startY) and for falling/drifting animations
          <g key={i} transform={`translate(${initialX}, ${startY})`}>
            {/* Falling Animation (Moves the group vertically) */}
            <animateTransform
              attributeName="transform"
              type="translate"
              values={`0,0; 0,${endYTarget - startY}`} // Relative Y movement from its initial transform
              dur={`${fallDuration}s`}
              begin={`${delay}s`}
              repeatCount="indefinite"
              additive="sum" // Crucial: Adds to the initial 'translate' and other additive transforms
            />

            {/* Drifting Animation (Moves the group horizontally in a sway) */}
            <animateTransform
              attributeName="transform"
              type="translate"
              // Sinusoidal-like sway: current -> right_peak -> current -> left_peak -> current
              values={`0,0; ${driftAmount},0; 0,0; ${-driftAmount},0; 0,0`}
              keyTimes="0; 0.25; 0.5; 0.75; 1" // Timing for each point in the sway path
              dur={`${driftCycleDuration}s`}
              begin={`${delay + Math.random() * 0.3}s`} // Start slightly offset for variety
              repeatCount="indefinite"
              additive="sum" // Adds to other transforms on the group
            />

            {/* The actual visible rectangle, centered at (0,0) within this group for easy rotation */}
            <rect
              x={-rectWidth / 2}
              y={-rectHeight / 2}
              width={rectWidth}
              height={rectHeight}
              fill={legoColors[Math.floor(Math.random() * legoColors.length)]}
              opacity={0.75 + Math.random() * 0.25} // Individual confetti opacity
            >
              {/* Rotation Animation */}
              <animateTransform
                attributeName="transform"
                type="rotate"
                // Rotates around its own center (0,0 in its local coordinate system)
                values={`${initialRotationAngle} 0 0; ${initialRotationAngle + rotationDirection * 359} 0 0`}
                dur={`${rotationDuration}s`}
                begin={`${delay + Math.random() * 0.2}s`} // Stagger rotation start slightly
                repeatCount="indefinite"
                // This transform is local to the rect, not additive to the group's transforms
              />
            </rect>
          </g>
        );
      })}
    </svg>
  );
};

const GameEndScreen = ({ room, isHost, onPlayAgain, onLeaveRoom, loading }) => {
  // Handles cases where room data isn't loaded yet or game isn't over
  if (!room || room.game_phase !== 'game_over') {
    return (
      <div className="min-h-screen bg-[#FFD700] flex flex-col items-center justify-center p-2 sm:p-6 animate-fade-in">
        <Confetti />
        <div className="w-full max-w-md bg-[#FFFFFF] border-4 border-black rounded-3xl shadow-2xl-lego p-4 sm:p-6 md:p-10 text-center">
          <h2 className="text-3xl font-bold text-[#E30613] mb-4 font-fredoka">Loading Results...</h2>
          <p className="text-lg text-gray-700 animate-pulse font-fredoka">Please wait while we fetch the game outcome.</p>
        </div>
      </div>
    );
  }

  const judgment = room.judgment_result || {};
  const winnerId = judgment.winner_id; // Will be undefined if judgment is not yet populated

  useEffect(() => {
    if (judgment.summary && judgment.winner_name && window.speechSynthesis) {
      const verdictText = `The judge's verdict: ${judgment.summary}. The winner is ${judgment.winner_name}. Congratulations!`;
      const utter = new window.SpeechSynthesisUtterance(verdictText);
      utter.rate = 1;
      utter.pitch = 1;
      utter.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    }
  }, [judgment.summary, judgment.winner_name]);

  const handleShare = () => {
    if (judgment.summary && judgment.winner_name) {
      const text = `Game Over! Judge's verdict: ${judgment.summary}\nWinner: ${judgment.winner_name}`;
      navigator.clipboard.writeText(text);
      alert('Result copied to clipboard!');
    } else {
      alert('Results are not yet available to share.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FFD700] flex flex-col items-center justify-center p-2 sm:p-6 font-fredoka animate-fade-in">
      <Confetti />
      <div className="relative w-full max-w-3xl bg-[#FFFFFF] border-4 border-black rounded-3xl shadow-2xl-lego p-4 sm:p-6 md:p-10 flex flex-col items-center z-20">
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-[#E30613] mb-4 sm:mb-6 drop-shadow-sm animate-bounce font-pacifico flex items-center gap-3">
          <span className="crown-emoji-lego">👑</span> Game Over! <span className="crown-emoji-lego">👑</span>
        </h1>

        {/* Judge's Verdict Section */}
        <div className="mb-4 sm:mb-6 md:mb-8 text-center w-full">
          <p className="text-base sm:text-xl md:text-2xl font-semibold text-black mb-1 sm:mb-2">Judge's Verdict:</p>
          <div className="text-sm sm:text-lg md:text-xl italic text-black bg-[#F2CD37] border-2 border-black rounded-xl px-2 sm:px-4 py-2 sm:py-3 shadow-inner min-h-[3em] flex items-center justify-center">
            {judgment.summary ? (
              <span>{judgment.summary}</span>
            ) : (
              <span className="animate-pulse">Judge is thinking... <span role="img" aria-label="thinking face" className="inline-block ml-1">🤔</span></span>
            )}
          </div>
        </div>

        {/* Winner Section - Only shown if winner_name is available */}
        {judgment.winner_name && (
          <div className="flex flex-col items-center mb-4 sm:mb-6 md:mb-10">
            <span className="text-base sm:text-lg text-black flex items-center gap-2">🏆 Winner 🏆</span>
            <span className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#00852B] mt-1 sm:mt-2 font-pacifico flex items-center gap-2">
              <span className="crown-emoji-lego text-[#00852B]">👑</span> {judgment.winner_name} <span className="crown-emoji-lego text-[#00852B]">👑</span>
            </span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 md:gap-6 mt-2 sm:mt-4 w-full sm:w-auto">
          {isHost && (
            <button
              onClick={onPlayAgain}
              className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[#00852B] text-white rounded-lg font-semibold text-base sm:text-lg hover:bg-[#006F24] transition-colors duration-150 disabled:bg-gray-400"
              disabled={loading}
            >
              {loading ? 'Starting...' : 'Play Again'}
            </button>
          )}
          <button
            onClick={onLeaveRoom}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[#E30613] text-white rounded-lg font-semibold text-base sm:text-lg hover:bg-[#B0040F] transition-colors duration-150 disabled:bg-gray-400"
            disabled={loading}
          >
            Leave Room
          </button>
          <button
            onClick={handleShare}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[#0B61A4] text-white rounded-lg font-semibold text-base sm:text-lg hover:bg-[#084A83] transition-colors duration-150 disabled:bg-gray-400 disabled:opacity-70"
            disabled={!judgment.summary || !judgment.winner_name || loading}
          >
            Share Result
          </button>
        </div>

        {room.submitted_drawings && room.submitted_drawings.length > 0 && (
          <div className="mt-6 sm:mt-8 md:mt-12 w-full">
            <h3 className="text-lg sm:text-2xl font-bold text-center text-black mb-2 sm:mb-4">Final Drawings:</h3>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-4 md:gap-6">
              {room.submitted_drawings.map((drawing) => (
                <div
                  key={drawing.drawer_id}
                  className={`flex flex-col items-center bg-[#F2CD37] rounded-xl shadow-md p-2 sm:p-3 border-2
                    ${drawing.drawer_id === winnerId ? 'border-4 border-[#00852B] ring-2 ring-[#00852B]' : 'border-black'}
                    transition-all duration-300 w-full max-w-[140px] sm:max-w-[200px] md:max-w-[240px] relative`}
                >
                  {drawing.drawer_id === winnerId && judgment.winner_name && ( // Also check if winner is known
                    <div className="absolute -top-3 sm:-top-4 -right-2 sm:-right-3 text-2xl sm:text-3xl crown-emoji-lego text-[#00852B] animate-bounce">👑</div>
                  )}
                  <img
                    src={drawing.image_b64}
                    alt={`Drawing by ${drawing.drawer_name}`}
                    className="rounded-lg border-2 border-gray-300 shadow-sm mb-1 sm:mb-2 w-full h-28 sm:h-40 md:h-48 object-contain bg-white"
                  />
                  <div className="text-center">
                    <span className={`font-bold text-xs sm:text-md ${drawing.drawer_id === winnerId && judgment.winner_name ? 'text-[#00852B]' : 'text-black'}`}>
                      {drawing.drawer_name}
                    </span>
                    <div className="text-[10px] sm:text-xs text-gray-700 mt-1 italic">Topic: {drawing.topic}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Pacifico&display=swap');
        body { font-family: 'Fredoka', sans-serif; }
        .font-fredoka { font-family: 'Fredoka', sans-serif; }
        .font-pacifico { font-family: 'Pacifico', cursive; }
        .shadow-2xl-lego { box-shadow: 8px 8px 0 black; }
        .animate-fade-in { animation: fadeIn 0.8s ease-out; }
        .animate-bounce { animation: bounce 1.2s infinite alternate; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px);} to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0% { transform: translateY(0);} 100% { transform: translateY(-8px);} }
        .crown-emoji-lego {
          font-size: 1.1em;
          filter: drop-shadow(2px 2px 0px #F2CD37);
        }
        .crown-emoji-lego.text-\\[\\#00852B\\] {
           filter: drop-shadow(2px 2px 0px #FFD700);
        }
        button { font-family: 'Fredoka', sans-serif; }
      `}</style>
    </div>
  );
};

export default GameEndScreen;