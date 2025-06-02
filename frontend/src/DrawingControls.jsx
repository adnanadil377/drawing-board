// src/components/DrawingControls.js
import React, { useState, useEffect, useRef } from 'react';
import DrawingBoard from './DrawingBoard';

const DrawingControls = ({ currentRoom, currentPlayerId, onSubmitDrawing }) => {
  const drawingRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(currentRoom.round_duration_seconds);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const timerIntervalRef = useRef(null);

  // Timer Logic
  useEffect(() => {
    if (currentRoom.game_phase === 'drawing' && currentRoom.round_start_time) {
      const startTime = new Date(currentRoom.round_start_time).getTime();
      const duration = currentRoom.round_duration_seconds * 1000;

      const updateTimer = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const remaining = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        setTimeLeft(remaining);

        if (remaining === 0) {
          clearInterval(timerIntervalRef.current);
        }
      };

      clearInterval(timerIntervalRef.current);
      updateTimer();
      timerIntervalRef.current = setInterval(updateTimer, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
      setTimeLeft(currentRoom.round_duration_seconds);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [currentRoom.game_phase, currentRoom.round_start_time, currentRoom.round_duration_seconds]);

  useEffect(() => {
    setHasSubmitted(
      !!currentRoom.submitted_drawings.find(d => d.drawer_id === currentPlayerId)
    );
  }, [currentRoom, currentPlayerId]);

  const handleSubmitDrawing = () => {
    if (drawingRef.current && !hasSubmitted) {
      const imgData = drawingRef.current.getImageData();
      if (imgData) {
        onSubmitDrawing(imgData);
      }
    }
  };

  if (currentRoom.game_phase !== 'drawing') {
    return null;
  }

  return (
    <div className="my-4 sm:my-6 p-2 sm:p-6 border-4 border-black rounded-2xl bg-[#E30613] shadow-lg text-white w-full max-w-xl mx-auto">
      <div className="text-center mb-2 sm:mb-4">
        <p className="text-base sm:text-xl font-bold">Topic: <span className="text-lg sm:text-3xl">{currentRoom.current_topic}</span></p>
        <p className="text-2xl sm:text-4xl font-mono font-bold mt-1 sm:mt-2">⏰ {timeLeft}s</p>
        <p className="text-xs sm:text-sm mt-2">Everyone is drawing!</p>
      </div>
      <div className="flex flex-col items-center w-full">
        <div className="w-full overflow-x-auto">
          <DrawingBoard ref={drawingRef} />
        </div>
        <button
          onClick={handleSubmitDrawing}
          className="mt-4 sm:mt-6 py-2 sm:py-3 px-6 sm:px-8 bg-[#FFD700] text-black rounded-xl font-bold text-base sm:text-xl hover:bg-[#F2CD37] transition disabled:bg-gray-400 w-full max-w-xs"
          disabled={hasSubmitted}
        >
          {hasSubmitted ? "Submitted!" : "Submit Drawing"}
        </button>
      </div>
      {hasSubmitted && (
        <div className="text-center mt-3 sm:mt-4 p-2 sm:p-3 bg-white text-black rounded-xl border-2 border-black text-xs sm:text-base">
          You've submitted your drawing. Waiting for others...
        </div>
      )}
    </div>
  );
};

export default DrawingControls;
