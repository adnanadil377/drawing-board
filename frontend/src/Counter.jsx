import React, { useState, useRef } from "react";

function Counter() {
  const [count, setCount] = useState(0);       // triggers re-render on update
  const countRef = useRef(0);                   // does NOT trigger re-render

  const incrementState = () => {
    setCount(count + 1);
  };

  const incrementRef = () => {
    countRef.current += 1;
    console.log("countRef:", countRef.current);
  };

  console.log("Component rendered");

  return (
    <div>
      <h2>useState count: {count}</h2>
      <button onClick={incrementState}>Increment useState count</button>

      <h2>useRef count (check console): {countRef.current}</h2>
      <button onClick={incrementRef}>Increment useRef count</button>
    </div>
  );
}

export default Counter;
