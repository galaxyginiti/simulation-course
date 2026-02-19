import React from 'react';

/**
 * TemperatureChart — SVG-график распределения температуры T(x) вдоль пластины.
 * Показывает мгновенный профиль на момент времени t.
 */
const TemperatureChart = ({ temperatures, length = 1, time = 0, leftBoundary, rightBoundary }) => {
  if (!temperatures || temperatures.length === 0) return null;

  const W = 760;
  const H = 230;
  const pad = { top: 20, right: 25, bottom: 50, left: 60 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const n = temperatures.length;
  const minT = Math.min(...temperatures);
  const maxT = Math.max(...temperatures);
  const rangeT = maxT - minT || 1;

  const scaleX = (i) => pad.left + (i / (n - 1)) * chartW;
  const scaleY = (t) => pad.top + (1 - (t - minT) / rangeT) * chartH;

  // SVG path для профиля температуры
  const pathPoints = temperatures
    .map((t, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(2)},${scaleY(t).toFixed(2)}`)
    .join(' ');

  // Заливка под кривой (градиент тепла)
  const areaPath =
    pathPoints +
    ` L${scaleX(n - 1).toFixed(2)},${(pad.top + chartH).toFixed(2)}` +
    ` L${scaleX(0).toFixed(2)},${(pad.top + chartH).toFixed(2)} Z`;

  // Засечки по оси Y
  const yTicks = 5;
  const yTickStep = rangeT / (yTicks - 1);

  // Засечки по оси X (в метрах)
  const xTicks = 6;

  return (
    <div className="chart-wrapper">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block' }}
        aria-label="График температурного профиля"
      >
        <defs>
          <linearGradient id="heatGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(231,76,60,0.35)" />
            <stop offset="100%" stopColor="rgba(231,76,60,0)" />
          </linearGradient>
        </defs>

        {/* Горизонтальная сетка */}
        {Array.from({ length: yTicks }, (_, k) => {
          const val = minT + yTickStep * k;
          const y = scaleY(val);
          return (
            <line
              key={k}
              x1={pad.left}
              y1={y}
              x2={pad.left + chartW}
              y2={y}
              stroke="#e8e8e8"
              strokeWidth="1"
              strokeDasharray="4,3"
            />
          );
        })}

        {/* Заливка под кривой */}
        <path d={areaPath} fill="url(#heatGrad)" />

        {/* Профиль температуры */}
        <path d={pathPoints} fill="none" stroke="#e74c3c" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Оси */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="#aaa" strokeWidth="1.5" />
        <line x1={pad.left} y1={pad.top + chartH} x2={pad.left + chartW} y2={pad.top + chartH} stroke="#aaa" strokeWidth="1.5" />

        {/* Подписи оси Y */}
        {Array.from({ length: yTicks }, (_, k) => {
          const val = minT + yTickStep * k;
          const y = scaleY(val);
          return (
            <g key={k}>
              <line x1={pad.left - 5} y1={y} x2={pad.left} y2={y} stroke="#aaa" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#555">
                {val.toFixed(2)}°
              </text>
            </g>
          );
        })}

        {/* Подписи оси X */}
        {Array.from({ length: xTicks }, (_, k) => {
          const xVal = (length * k) / (xTicks - 1);
          const x = pad.left + (k / (xTicks - 1)) * chartW;
          return (
            <g key={k}>
              <line x1={x} y1={pad.top + chartH} x2={x} y2={pad.top + chartH + 5} stroke="#aaa" strokeWidth="1" />
              <text x={x} y={pad.top + chartH + 18} textAnchor="middle" fontSize="11" fill="#555">
                {xVal.toFixed(3)}
              </text>
            </g>
          );
        })}

        {/* Названия осей */}
        <text
          x={pad.left + chartW / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize="12"
          fill="#444"
        >
          Координата x (м)
        </text>
        <text
          transform={`rotate(-90,14,${pad.top + chartH / 2})`}
          x={14}
          y={pad.top + chartH / 2 + 4}
          textAnchor="middle"
          fontSize="12"
          fill="#444"
        >
          T (°C)
        </text>

        {/* Метка времени */}
        <text
          x={pad.left + chartW}
          y={pad.top - 5}
          textAnchor="end"
          fontSize="11"
          fill="#667eea"
          fontWeight="600"
        >
          t = {time.toFixed(4)} с
        </text>

        {/* Точки на границах */}
        <circle cx={scaleX(0)} cy={scaleY(temperatures[0])} r="4" fill="#e74c3c" />
        <circle cx={scaleX(n - 1)} cy={scaleY(temperatures[n - 1])} r="4" fill="#3498db" />
      </svg>
    </div>
  );
};

export default TemperatureChart;
