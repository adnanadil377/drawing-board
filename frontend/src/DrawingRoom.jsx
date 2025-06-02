import React, { useRef } from 'react';
import DrawingBoard from './DrawingBoard';

const DrawingRoom = () => {
  const drawingRef = useRef();

  const handleClear = () => {
    if (drawingRef.current) {
      drawingRef.current.clearCanvas();
    }
  };

  const handleSave = () => {
    if (drawingRef.current) {
      const imgData = drawingRef.current.getImageData();
      if (imgData) {
        const link = document.createElement('a');
        link.download = 'drawing.png';
        link.href = imgData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFD700] p-2 sm:p-8">
      <div className="bg-white border-4 border-black rounded-3xl shadow-2xl p-4 sm:p-6 w-full max-w-2xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#E30613] text-center mb-4 sm:mb-6">🎨 LEGO Drawing Board 🎨</h2>
        <div className="w-full overflow-x-auto">
          <DrawingBoard ref={drawingRef} />
        </div>
        <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
          <button
            onClick={handleClear}
            className="py-2 px-4 sm:py-2.5 sm:px-6 bg-[#0B61A4] text-white rounded-xl font-bold hover:bg-[#084A83] transition w-full sm:w-auto"
          >
            Clear Canvas
          </button>
          <button
            onClick={handleSave}
            className="py-2 px-4 sm:py-2.5 sm:px-6 bg-[#00852B] text-white rounded-xl font-bold hover:bg-[#006B23] transition w-full sm:w-auto"
          >
            Save Image
          </button>
        </div>
      </div>
      <footer className="mt-4 text-xs sm:text-sm text-black">
        Made with 🧱 LEGO Love
      </footer>
    </div>
  );
};

export default DrawingRoom;