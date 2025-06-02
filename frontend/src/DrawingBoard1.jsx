
import React, { useRef, useState } from "react";
import CanvasDraw from "react-canvas-draw";

function DrawingBoard() {
  const canvasRef = useRef(null);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushRadius, setBrushRadius] = useState(4);

  const handleClear = () => {
    canvasRef.current.clear();
  };

  const handleUndo = () => {
    canvasRef.current.undo();
  };

  const handleSave = () => {
    const dataUrl = canvasRef.current.getDataURL();
    console.log("Image Data URL:", dataUrl);
    // Send dataUrl to backend or save it
  };

  return (
    <div>
      <h2>Drawing Competition Canvas</h2>
      <CanvasDraw
        ref={canvasRef}
        brushColor={brushColor}
        brushRadius={brushRadius}
        lazyRadius={1}
        canvasWidth={500}
        canvasHeight={500}
      />

      <div style={{ marginTop: 10 }}>
        <label>
          Brush Color:{" "}
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
          />
        </label>

        <label style={{ marginLeft: 20 }}>
          Brush Size:{" "}
          <input
            type="range"
            min="1"
            max="20"
            value={brushRadius}
            onChange={(e) => setBrushRadius(parseInt(e.target.value))}
          />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <button onClick={handleUndo}>Undo</button>
        <button onClick={handleClear} style={{ marginLeft: 10 }}>
          Clear
        </button>
        <button onClick={handleSave} style={{ marginLeft: 10 }}>
          Save Image
        </button>
      </div>
    </div>
  );
}

export default DrawingBoard;
