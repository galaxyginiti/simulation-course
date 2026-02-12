import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const TIME_STEPS = [1, 0.1, 0.01, 0.001, 0.0001];
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

function App() {
  const [simulations, setSimulations] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [params, setParams] = useState({
    v0: 50,
    angle: 45,
    h0: 0
  });
  const canvasRefs = useRef([]);
  const animationRef = useRef(null);

  useEffect(() => {
    drawAllCanvases();
  }, [simulations, animationProgress]);

  const drawCanvas = (canvasIndex, sim, color) => {
    const canvas = canvasRefs.current[canvasIndex];
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Очистка канваса
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    if (!sim || !sim.trajectory) return;

    // Находим максимальные значения для масштабирования
    let maxX = 0;
    let maxY = 0;
    sim.trajectory.forEach(point => {
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    });

    const padding = 50;
    const scaleX = (width - 2 * padding) / maxX;
    const scaleY = (height - 2 * padding) / maxY;

    // Рисуем оси
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();

    // Подписи осей
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.fillText('Дальность, м', width / 2 - 40, height - 10);
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Высота, м', 0, 0);
    ctx.restore();

    // Рисуем траекторию
    const pointsToDraw = Math.floor(sim.trajectory.length * animationProgress);
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < pointsToDraw; i++) {
      const point = sim.trajectory[i];
      const x = padding + point.x * scaleX;
      const y = height - padding - point.y * scaleY;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Рисуем текущую точку
    if (pointsToDraw > 0) {
      const lastPoint = sim.trajectory[pointsToDraw - 1];
      const x = padding + lastPoint.x * scaleX;
      const y = height - padding - lastPoint.y * scaleY;
      
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Легенда
    ctx.fillStyle = color;
    ctx.fillRect(20, 30, 20, 10);
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.fillText(`dt = ${sim.dt} с`, 45, 40);
    
    // Информация о результатах
    ctx.font = '11px Arial';
    ctx.fillText(`Дальность: ${sim.range.toFixed(2)} м`, 20, 60);
    ctx.fillText(`Макс. высота: ${sim.maxHeight.toFixed(2)} м`, 20, 75);
    ctx.fillText(`Время полёта: ${sim.timeOfFlight.toFixed(2)} с`, 20, 90);
    ctx.fillText(`Шагов: ${sim.simulationSteps}`, 20, 105);
  };

  const drawAllCanvases = () => {
    simulations.forEach((sim, index) => {
      drawCanvas(index, sim, COLORS[index]);
    });
  };

  const runSimulations = async () => {
    setIsRunning(true);
    setSimulations([]);
    setAnimationProgress(0);

    const results = [];
    
    for (const dt of TIME_STEPS) {
      try {
        const response = await fetch('http://localhost:8080/api/simulate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            v0: parseFloat(params.v0),
            angle: parseFloat(params.angle),
            h0: parseFloat(params.h0),
            dt: dt
          })
        });

        if (response.ok) {
          const data = await response.json();
          results.push({ ...data, dt });
        }
      } catch (error) {
        console.error(`Ошибка при dt=${dt}:`, error);
      }
    }

    setSimulations(results);
    
    // Анимация
    let progress = 0;
    const animate = () => {
      progress += 0.01;
      if (progress >= 1) {
        progress = 1;
        setIsRunning(false);
      }
      setAnimationProgress(progress);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    animate();
  };

  const handleInputChange = (e) => {
    setParams({
      ...params,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="app">
      <h1>Моделирование полёта тела в атмосфере</h1>
      
      <div className="container">
        <div className="control-panel">
          <h2>Параметры моделирования</h2>
          
          <div className="input-group">
            <label>Начальная скорость (м/с):</label>
            <input
              type="number"
              name="v0"
              value={params.v0}
              onChange={handleInputChange}
              disabled={isRunning}
            />
          </div>

          <div className="input-group">
            <label>Угол запуска (градусы):</label>
            <input
              type="number"
              name="angle"
              value={params.angle}
              onChange={handleInputChange}
              disabled={isRunning}
              min="0"
              max="90"
            />
          </div>

          <div className="input-group">
            <label>Начальная высота (м):</label>
            <input
              type="number"
              name="h0"
              value={params.h0}
              onChange={handleInputChange}
              disabled={isRunning}
            />
          </div>

          <button 
            className="start-button"
            onClick={runSimulations}
            disabled={isRunning}
          >
            {isRunning ? 'Моделирование...' : 'Запустить моделирование'}
          </button>

          <div className="info-box">
            <p><strong>Параметры:</strong></p>
            <p>• V₀ = {params.v0} м/с</p>
            <p>• Угол = {params.angle}°</p>
            <p>• H₀ = {params.h0} м</p>
            <p>• Масса = 1.0 кг</p>
            <p>• S = 0.01 м²</p>
            <p>• Cd = 0.47</p>
          </div>

          <div className="info-box" style={{ marginTop: '15px', background: 'rgba(255, 107, 107, 0.2)', borderColor: '#FF6B6B' }}>
            <p><strong>Шаги моделирования:</strong></p>
            {TIME_STEPS.map((dt, idx) => (
              <p key={idx}>• dt = {dt} с</p>
            ))}
          </div>
        </div>

        <div className="graphics-section">
          {simulations.length === 0 ? (
            <div className="placeholder">
              <div className="placeholder-icon">📊</div>
              <h3>Нажмите "Запустить моделирование"</h3>
              <p>Здесь появятся графики траекторий для каждого шага моделирования</p>
              <div className="placeholder-steps">
                {TIME_STEPS.map((dt, idx) => (
                  <div key={idx} className="placeholder-step" style={{ borderColor: COLORS[idx] }}>
                    <span style={{ color: COLORS[idx] }}>dt = {dt} с</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="canvases-grid">
              {simulations.map((sim, index) => (
                <div key={index} className="canvas-item">
                  <canvas
                    ref={(el) => (canvasRefs.current[index] = el)}
                    width={400}
                    height={300}
                    style={{ border: `2px solid ${COLORS[index]}` }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {simulations.length > 0 && (
        <div className="results-table">
          <h2>Результаты моделирования</h2>
          <table>
            <thead>
              <tr>
                <th>Шаг моделирования, с</th>
                <th>Дальность полёта, м</th>
                <th>Максимальная высота, м</th>
                <th>Скорость в конечной точке, м/с</th>
                <th>Время полёта, с</th>
                <th>Количество шагов</th>
              </tr>
            </thead>
            <tbody>
              {simulations.map((sim, index) => (
                <tr key={index} style={{ color: COLORS[index] }}>
                  <td>{sim.dt}</td>
                  <td>{sim.range.toFixed(2)}</td>
                  <td>{sim.maxHeight.toFixed(2)}</td>
                  <td>{sim.finalVelocity.toFixed(2)}</td>
                  <td>{sim.timeOfFlight.toFixed(2)}</td>
                  <td>{sim.simulationSteps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
