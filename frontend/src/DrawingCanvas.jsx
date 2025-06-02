// src/components/DrawingCanvas.js
import React, { useRef, useEffect } from "react";

const DrawingCanvas = React.forwardRef(({ width = 500, height = 500, disabled = false }, ref) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    // Apply a style to indicate if disabled
    canvas.style.border = "1px solid #000";
    canvas.style.cursor = disabled ? "not-allowed" : "crosshair";
    canvas.style.backgroundColor = disabled ? "#f0f0f0" : "#fff";


    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctxRef.current = ctx;
  }, [width, height, disabled]); // Re-run if disabled changes to update style

  const getEventCoordinates = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return {
        offsetX: e.touches[0].clientX - rect.left,
        offsetY: e.touches[0].clientY - rect.top,
      };
    }
    return { offsetX: e.nativeEvent.offsetX, offsetY: e.nativeEvent.offsetY };
  };


  const startDrawing = (e) => {
    if (disabled) return;
    drawing.current = true;
    const { offsetX, offsetY } = getEventCoordinates(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(offsetX, offsetY);
  };

  const draw = (e) => {
    if (disabled || !drawing.current) return;
    const { offsetX, offsetY } = getEventCoordinates(e);
    ctxRef.current.lineTo(offsetX, offsetY);
    ctxRef.current.stroke();
  };

  const endDrawing = () => {
    if (disabled) return;
    drawing.current = false;
  };

  React.useImperativeHandle(ref, () => ({
    clearCanvas: () => {
      if (disabled) return; // Don't allow clear if disabled (though button might be hidden)
      const canvas = canvasRef.current;
      ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
    },
    getImageData: () => {
      return canvasRef.current.toDataURL("image/png");
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDrawing}
      onMouseMove={draw}
      onMouseUp={endDrawing}
      onMouseLeave={endDrawing} // End drawing if mouse leaves canvas
      onTouchStart={(e) => { e.preventDefault(); startDrawing(e);}}
      onTouchMove={(e) => { e.preventDefault(); draw(e);}}
      onTouchEnd={(e) => { e.preventDefault(); endDrawing(e);}}
      style={{ touchAction: 'none' }} // Important for touch interaction on canvas
    />
  );
});

export default DrawingCanvas;