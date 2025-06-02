import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Stage, Layer, Line, Image as KonvaImage, Rect } from "react-konva";

// Utility to convert hex color to rgba array
function hexToRgba(hex) {
  let c = hex.substring(1);
  if (c.length === 3) {
    c = c
      .split("")
      .map((x) => x + x)
      .join("");
  }
  const bigint = parseInt(c, 16);
  return [
    (bigint >> 16) & 255,
    (bigint >> 8) & 255,
    bigint & 255,
    255, // Opaque alpha
  ];
}

// Get pixel color at (x,y) in ImageData
function getPixelColor(imgData, x, y) {
  const { width, data } = imgData;
  const i = (Math.floor(y) * width + Math.floor(x)) * 4;
  if (i < 0 || i + 3 >= data.length) {
    return [0,0,0,0];
  }
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

// Compare two rgba colors (arrays)
function colorsMatch(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// Flood fill algorithm
function floodFill(imgData, startX, startY, targetColor, fillColor) {
  const { width, height, data } = imgData;
  const startXInt = Math.floor(startX);
  const startYInt = Math.floor(startY);

  if (colorsMatch(targetColor, fillColor)) return;

  const initialPixelColor = getPixelColor(imgData, startXInt, startYInt);
  if (!colorsMatch(initialPixelColor, targetColor)) return;

  const stack = [[startXInt, startYInt]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
    const i = (cy * width + cx) * 4;
    const currentColor = [ data[i], data[i + 1], data[i + 2], data[i + 3] ];
    if (colorsMatch(currentColor, targetColor)) {
      data[i] = fillColor[0];
      data[i + 1] = fillColor[1];
      data[i + 2] = fillColor[2];
      data[i + 3] = fillColor[3];
      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }
  }
}

const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 500;
const CANVAS_BACKGROUND_COLOR = "#FFFFFF";

const DrawingBoard = forwardRef((props, ref) => {
  const [lines, setLines] = useState([]);
  const [tool, setTool] = useState("brush");
  const [color, setColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(8);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [konvaBgImage, setKonvaBgImage] = useState(null);

  const stageRef = useRef(null);
  const isDrawing = useRef(false);

  // History states
  const [history, setHistory] = useState([{ lines: [], backgroundImage: null }]);
  const [historyStep, setHistoryStep] = useState(0);

  // Function to add a new state to history
  const addHistoryEntry = (currentLines, currentBgImage) => {
    // Deep copy lines to ensure immutability in history
    const newLinesCopy = currentLines.map(line => ({
      ...line,
      points: [...(line.points || [])], // Ensure points array exists and is copied
    }));

    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push({ lines: newLinesCopy, backgroundImage: currentBgImage });
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  useImperativeHandle(ref, () => ({
    clearCanvas() {
      const newLines = [];
      const newBgImage = null;
      setLines(newLines);
      setBackgroundImage(newBgImage);
      addHistoryEntry(newLines, newBgImage);
    },
    getImageData() {
      if (!stageRef.current) return null;
      const stage = stageRef.current.getStage();
      return stage.toDataURL({ 
        mimeType: "image/png", 
        quality: 1, 
        pixelRatio: 1 
      });
    },
  }));

  const handleMouseDown = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    if (tool === "brush" || tool === "eraser") {
      isDrawing.current = true;
      setLines((prevLines) => [
        ...prevLines,
        {
          points: [pos.x, pos.y],
          color: tool === "eraser" ? CANVAS_BACKGROUND_COLOR : color,
          strokeWidth,
          globalCompositeOperation:
            tool === "eraser" ? "destination-out" : "source-over",
        },
      ]);
    } else if (tool === "fill") {
      handleFill(pos); // Fill action is immediate and updates history
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current || (tool !== "brush" && tool !== "eraser")) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    setLines((prevLines) => {
      if (prevLines.length === 0) return prevLines;
      const lastLine = { ...prevLines[prevLines.length - 1] };
      lastLine.points = (lastLine.points || []).concat([point.x, point.y]);
      return [...prevLines.slice(0, -1), lastLine];
    });
  };

  const handleMouseUp = () => {
    if (isDrawing.current && (tool === "brush" || tool === "eraser")) {
      isDrawing.current = false;
      // `lines` state is now up-to-date after mouse move.
      // `backgroundImage` is the current one.
      addHistoryEntry(lines, backgroundImage);
    }
  };

  const handleFill = (pointerPosition) => {
    if (!stageRef.current) return;
    const stage = stageRef.current.getStage();
    const canvas = stage.toCanvas({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        pixelRatio: 1
    });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const x = Math.floor(pointerPosition.x);
    const y = Math.floor(pointerPosition.y);
    const targetColor = getPixelColor(imgData, x, y);
    const fillColorRgba = hexToRgba(color);

    if (colorsMatch(targetColor, fillColorRgba)) return;
    // Prevent filling transparent with transparent if no actual color change
    if (targetColor[3] === 0 && fillColorRgba[3] === 0 && color !== CANVAS_BACKGROUND_COLOR) { 
        // If trying to fill transparent with transparent, but selected color is not explicitly the background,
        // then effectively fill with selected color on transparent area which becomes opaque.
        // This condition might need refinement based on desired fill behavior on transparent areas.
        // For now, let's assume floodFill handles replacing targetColor (which could be transparent).
    }


    floodFill(imgData, x, y, targetColor, fillColorRgba);
    ctx.putImageData(imgData, 0, 0);
    const dataURL = canvas.toDataURL();
    
    const newLines = []; // Lines are baked into the background after fill
    setLines(newLines);
    setBackgroundImage(dataURL); // This triggers konvaBgImage update via useEffect
    addHistoryEntry(newLines, dataURL);
  };

  // Load state from history when undo/redo happens
  const loadStateFromHistory = (step) => {
    const stateToLoad = history[step];
    if (stateToLoad) {
      setLines(stateToLoad.lines);
      setBackgroundImage(stateToLoad.backgroundImage); // Triggers useEffect for konvaBgImage & redraw
    }
  };

  const handleUndo = () => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      loadStateFromHistory(newStep);
    }
  };

  const handleRedo = () => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      loadStateFromHistory(newStep);
    }
  };

  useEffect(() => {
    let didUnmount = false;
    if (backgroundImage) {
      const img = new window.Image();
      img.src = backgroundImage;
      img.onload = () => {
        if (!didUnmount) {
            setKonvaBgImage(img);
            if (stageRef.current) {
                stageRef.current.getStage().batchDraw();
            }
        }
      };
      img.onerror = () => {
        if (!didUnmount) {
            console.error("Error loading background image for Konva.");
            setKonvaBgImage(null);
            if (stageRef.current) {
                stageRef.current.getStage().batchDraw();
            }
        }
      }
    } else {
      setKonvaBgImage(null); // Clear the image
      if (stageRef.current) { // Ensure stage redraws to show cleared background
          stageRef.current.getStage().batchDraw();
      }
    }
    return () => { didUnmount = true; };
  }, [backgroundImage]);

  const colors = [
    "#000000", "#7F7F7F", "#880015", "#ED1C24", "#FF7F27",
    "#FFF200", "#22B14C", "#00A2E8", "#3F48CC", "#A349A4",
    "#FFFFFF", "#C3C3C3", "#B97A57", "#FFAEC9", "#FFC90E",
    "#EFE4B0", "#B5E61D", "#99D9EA", "#7092BE", "#C8BFE7",
  ];

  const toolButtonStyles = (buttonToolOrAction, disabled = false) => {
    const isActiveTool = tool === buttonToolOrAction && !["undo", "redo"].includes(buttonToolOrAction);
    return {
      fontWeight: isActiveTool ? "bold" : "normal",
      padding: "8px 12px",
      marginRight: "8px",
      border: isActiveTool ? "2px solid #0078D7" : "1px solid #ccc",
      borderRadius: "4px",
      cursor: disabled ? "not-allowed" : "pointer",
      backgroundColor: isActiveTool ? "#e0eaf0" : (disabled ? "#f0f0f0" : "white"),
      color: disabled ? "#aaa" : "black",
      transition: "background-color 0.2s, border-color 0.2s",
    };
  };

  const colorBoxStyles = (c) => ({
    backgroundColor: c,
    width: 24,
    height: 24,
    border: c === color ? "3px solid #0078D7" : "1px solid #ADADAD",
    borderRadius: "3px",
    cursor: "pointer",
    boxSizing: "border-box",
    outline: c === color ? "1px solid white" : "none",
    outlineOffset: "-4px",
    boxShadow: c === color ? "0 0 5px rgba(0,120,215,0.5)" : "none",
  });

  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        width: '100%',
        maxWidth: 520,
        margin: 'auto',
        overflowX: 'auto',
      }}
      className="flex flex-col items-center w-full"
    >
      <div style={{ display: "flex", alignItems: "center", marginBottom: 15, flexWrap: "wrap", gap: '5px' }}>
        <button onClick={handleUndo} style={toolButtonStyles("undo", historyStep === 0)} disabled={historyStep === 0}>
           <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14L4 9l5-5" />
            <path d="M20 20c0-5.523-4.477-10-10-10H4" />
          </svg>

        </button>
        <button onClick={handleRedo} style={toolButtonStyles("redo", historyStep === history.length - 1)} disabled={historyStep === history.length - 1}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 14l5-5-5-5" />
            <path d="M4 20c0-5.523 4.477-10 10-10h6" />
          </svg>
        </button>
        <button onClick={() => setTool("brush")} style={toolButtonStyles("brush")}>
          Brush
        </button>
        <button onClick={() => setTool("fill")} style={toolButtonStyles("fill")}>
          Fill
        </button>
        <button onClick={() => setTool("eraser")} style={toolButtonStyles("eraser")}>
          Eraser
        </button>
      </div>

      <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center' }}>
        <label htmlFor="strokeWidth" style={{ marginRight: 10, fontSize: '14px' }}>
          Size:
        </label>
        <input
          id="strokeWidth"
          type="range"
          min="1"
          max="50"
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
          disabled={tool === "fill"}
          style={{ verticalAlign: "middle", flexGrow: 1, maxWidth: '150px' }}
        />
        <span style={{ marginLeft: 10, fontSize: '14px', minWidth: '30px', textAlign: 'right' }}>{strokeWidth}px</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          maxWidth: 270, 
          gap: 6,
          marginBottom: 15,
          padding: 8,
          border: "1px solid #ddd",
          borderRadius: "4px",
          backgroundColor: '#f9f9f9'
        }}
        className="w-full"
      >
        {colors.map((c) => (
          <div
            key={c}
            role="button"
            tabIndex={0}
            aria-label={`Select color ${c}`}
            onClick={() => setColor(c)}
            onKeyPress={(e) => (e.key === "Enter" || e.key === " ") && setColor(c)}
            style={colorBoxStyles(c)}
            title={c}
          />
        ))}
      </div>
      <div className="w-full overflow-x-auto flex justify-center">
        <Stage
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          style={{
            border: "1px solid #A0A0A0",
            marginTop: 10,
            touchAction: "none",
            cursor: tool === "fill" ? "crosshair" : (tool === "brush" || tool === "eraser" ? "crosshair" : "default"),
            maxWidth: "100%",
            height: "auto",
          }}
          ref={stageRef}
        >
          <Layer>
            <Rect
              x={0}
              y={0}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              fill={CANVAS_BACKGROUND_COLOR}
              listening={false}
            />
            {konvaBgImage && (
              <KonvaImage
                image={konvaBgImage}
                x={0}
                y={0}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                listening={false}
              />
            )}
            {lines.map((line, i) => (
              <Line
                key={`line-${i}-${line.points?.join(',')}-${line.color}-${line.strokeWidth}`}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={line.globalCompositeOperation}
                listening={tool !== 'fill'}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
});

DrawingBoard.displayName = 'DrawingBoard'; // Good practice for forwardRef components

export default DrawingBoard;