import { useState, useEffect, useRef } from 'react';
import './App.css';
import TemperatureHeatmap from './TemperatureHeatmap';

function App() {
  const [params, setParams] = useState({
    length: 1.0,
    timeStep: 0.01,
    spaceStep: 0.01,
    totalTime: 2.0,
    initialTemp: 20.0,
    leftBoundary: 100.0,
    rightBoundary: 0.0,
    alpha: 9.7e-5 // Aluminum
  });

  const [results, setResults] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  const materialInfo = {
    name: 'Алюминий',
    thermalConductivity: '237 Вт/(м·К)',
    density: '2700 кг/м³',
    specificHeat: '900 Дж/(кг·К)',
    diffusivity: '9.7×10⁻⁵ м²/с'
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:8080/ws');
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        wsRef.current = ws;
        resolve(ws);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Ошибка подключения к серверу. Убедитесь, что сервер запущен.');
        reject(error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;
      };
    });
  };

  const runSimulation = async () => {
    setError(null);
    setResults([]);
    setCurrentResult(null);
    setIsRunning(true);

    try {
      let ws = wsRef.current;
      
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        ws = await connectWebSocket();
      }

      const resultsArray = [];

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
          setError(data.error);
          setIsRunning(false);
          return;
        }

        resultsArray.push(data);
        setCurrentResult(data);
        setResults([...resultsArray]);
      };

      // Send simulation parameters
      ws.send(JSON.stringify(params));

      // Wait a bit for all results
      setTimeout(() => {
        setIsRunning(false);
      }, 1000);

    } catch (err) {
      setError('Не удалось запустить симуляцию: ' + err.message);
      setIsRunning(false);
    }
  };

  const handleParamChange = (key, value) => {
    setParams(prev => ({
      ...prev,
      [key]: parseFloat(value)
    }));
  };

  const resetParams = () => {
    setParams({
      length: 1.0,
      timeStep: 0.01,
      spaceStep: 0.01,
      totalTime: 2.0,
      initialTemp: 20.0,
      leftBoundary: 100.0,
      rightBoundary: 0.0,
      alpha: 9.7e-5
    });
    setResults([]);
    setCurrentResult(null);
    setError(null);
  };

  const getMinMaxTemp = () => {
    if (!currentResult) return { min: 0, max: 100 };
    const temps = currentResult.temperatures;
    return {
      min: Math.min(...temps),
      max: Math.max(...temps)
    };
  };

  const { min: minTemp, max: maxTemp } = getMinMaxTemp();

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>🔥 Моделирование Теплопроводности</h1>
        <p>Метод конечных разностей для уравнения теплопроводности</p>
      </div>

      <div className="material-info">
        <h3>📊 Материал: {materialInfo.name}</h3>
        <div className="material-properties">
          <div className="property">
            <div className="property-label">Теплопроводность</div>
            <div className="property-value">{materialInfo.thermalConductivity}</div>
          </div>
          <div className="property">
            <div className="property-label">Плотность</div>
            <div className="property-value">{materialInfo.density}</div>
          </div>
          <div className="property">
            <div className="property-label">Удельная теплоёмкость</div>
            <div className="property-value">{materialInfo.specificHeat}</div>
          </div>
          <div className="property">
            <div className="property-label">Температуропроводность</div>
            <div className="property-value">{materialInfo.diffusivity}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="controls-section">
        <h3>⚙️ Параметры симуляции</h3>
        <div className="controls-grid">
          <div className="control-group">
            <label>Длина пластины (м)</label>
            <input
              type="number"
              step="0.1"
              value={params.length}
              onChange={(e) => handleParamChange('length', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>Шаг по времени (с)</label>
            <input
              type="number"
              step="0.001"
              value={params.timeStep}
              onChange={(e) => handleParamChange('timeStep', e.target.value)}
            />
            <small>Рекомендуется: 0.001 - 0.1</small>
          </div>

          <div className="control-group">
            <label>Шаг по пространству (м)</label>
            <input
              type="number"
              step="0.001"
              value={params.spaceStep}
              onChange={(e) => handleParamChange('spaceStep', e.target.value)}
            />
            <small>Рекомендуется: 0.001 - 0.1</small>
          </div>

          <div className="control-group">
            <label>Время моделирования (с)</label>
            <input
              type="number"
              step="0.1"
              value={params.totalTime}
              onChange={(e) => handleParamChange('totalTime', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>Начальная температура (°C)</label>
            <input
              type="number"
              step="1"
              value={params.initialTemp}
              onChange={(e) => handleParamChange('initialTemp', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>Температура левой границы (°C)</label>
            <input
              type="number"
              step="1"
              value={params.leftBoundary}
              onChange={(e) => handleParamChange('leftBoundary', e.target.value)}
            />
          </div>

          <div className="control-group">
            <label>Температура правой границы (°C)</label>
            <input
              type="number"
              step="1"
              value={params.rightBoundary}
              onChange={(e) => handleParamChange('rightBoundary', e.target.value)}
            />
          </div>
        </div>

        <div className="button-group">
          <button 
            className="btn btn-primary" 
            onClick={runSimulation}
            disabled={isRunning}
          >
            {isRunning ? '⏳ Выполняется...' : '▶️ Запустить симуляцию'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={resetParams}
            disabled={isRunning}
          >
            🔄 Сбросить параметры
          </button>
        </div>
      </div>

      {currentResult && (
        <div className="visualization-section">
          <div className="visualization-header">
            <h3>🌡️ Распределение температуры</h3>
            <div className="time-display">
              ⏱️ Время: {currentResult.time.toFixed(3)} с
            </div>
          </div>

          <TemperatureHeatmap
            temperatures={currentResult.temperatures}
            minTemp={minTemp}
            maxTemp={maxTemp}
            width={800}
            height={100}
          />

          <div className="temperature-scale">
            <span className="scale-label">Холодно</span>
            <div className="scale-gradient"></div>
            <span className="scale-label">Горячо</span>
          </div>

          <div className="scale-markers">
            <span>{minTemp.toFixed(1)}°C</span>
            <span>{((minTemp + maxTemp) / 2).toFixed(1)}°C</span>
            <span>{maxTemp.toFixed(1)}°C</span>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="results-section">
          <h3>📈 Результаты симуляции</h3>
          <div className="result-card">
            <div className="result-row">
              <span className="result-label">Финальное время:</span>
              <span className="result-value">{results[results.length - 1].time.toFixed(3)} с</span>
            </div>
            <div className="result-row">
              <span className="result-label">Температура в центре:</span>
              <span className="result-value">{results[results.length - 1].centerTemp.toFixed(2)} °C</span>
            </div>
            <div className="result-row">
              <span className="result-label">Количество точек:</span>
              <span className="result-value">{currentResult.temperatures.length}</span>
            </div>
            <div className="result-row">
              <span className="result-label">Стабильность:</span>
              <span className={`status-badge ${results[results.length - 1].stable ? 'status-stable' : 'status-unstable'}`}>
                {results[results.length - 1].stable ? '✓ Стабильно' : '✗ Нестабильно'}
              </span>
            </div>
            <div className="result-row">
              <span className="result-label">Критерий Куранта (r):</span>
              <span className="result-value">
                {(params.alpha * params.timeStep / (params.spaceStep * params.spaceStep)).toFixed(4)}
              </span>
            </div>
          </div>

          <div className="table-container">
            <h4 style={{ marginBottom: '15px' }}>📊 Таблица результатов (каждые 10 шагов)</h4>
            <table className="results-table">
              <thead>
                <tr>
                  <th>Шаг</th>
                  <th>Время (с)</th>
                  <th>T центра (°C)</th>
                  <th>T мин (°C)</th>
                  <th>T макс (°C)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr key={idx}>
                    <td>{idx}</td>
                    <td>{result.time.toFixed(3)}</td>
                    <td>{result.centerTemp.toFixed(2)}</td>
                    <td>{Math.min(...result.temperatures).toFixed(2)}</td>
                    <td>{Math.max(...result.temperatures).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isRunning && (
        <div className="loading-spinner">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}

export default App;
