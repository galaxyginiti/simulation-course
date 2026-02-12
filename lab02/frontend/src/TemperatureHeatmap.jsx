import React, { useRef, useEffect } from 'react';

const TemperatureHeatmap = ({ temperatures, minTemp, maxTemp, width = 800, height = 100 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!temperatures || temperatures.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const cellWidth = width / temperatures.length;

    // Draw temperature map
    temperatures.forEach((temp, i) => {
      const normalized = (temp - minTemp) / (maxTemp - minTemp);
      const color = getTemperatureColor(normalized);
      
      ctx.fillStyle = color;
      ctx.fillRect(i * cellWidth, 0, cellWidth, height);
    });

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    
    const gridLines = Math.min(temperatures.length, 20);
    const gridStep = Math.floor(temperatures.length / gridLines);
    
    for (let i = 0; i < temperatures.length; i += gridStep) {
      const x = i * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

  }, [temperatures, minTemp, maxTemp, width, height]);

  const getTemperatureColor = (normalized) => {
    // Clamp value between 0 and 1
    normalized = Math.max(0, Math.min(1, normalized));

    // Color gradient from blue (cold) to red (hot)
    let r, g, b;

    if (normalized < 0.25) {
      // Blue to Cyan
      const t = normalized / 0.25;
      r = 0;
      g = Math.floor(128 * t);
      b = 255;
    } else if (normalized < 0.5) {
      // Cyan to Green
      const t = (normalized - 0.25) / 0.25;
      r = 0;
      g = 128 + Math.floor(127 * t);
      b = Math.floor(255 * (1 - t));
    } else if (normalized < 0.75) {
      // Green to Yellow
      const t = (normalized - 0.5) / 0.25;
      r = Math.floor(255 * t);
      g = 255;
      b = 0;
    } else {
      // Yellow to Red
      const t = (normalized - 0.75) / 0.25;
      r = 255;
      g = Math.floor(255 * (1 - t));
      b = 0;
    }

    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="heatmap-container">
      <canvas 
        ref={canvasRef} 
        className="heatmap-canvas"
        style={{ width: '100%', maxWidth: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
};

export default TemperatureHeatmap;
