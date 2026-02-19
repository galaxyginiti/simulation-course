import { useState, useEffect, useRef } from 'react';
import './App.css';
import TemperatureHeatmap from './TemperatureHeatmap';
import TemperatureChart from './TemperatureChart';

// Форматирует число в научную нотацию для очень малых/больших значений
function fmtSci(v, digits = 4) {
  if (v === 0) return '0';
  if (Math.abs(v) < 0.001 || Math.abs(v) >= 1e6) {
    return v.toExponential(digits);
  }
  return v.toFixed(digits);
}

function App() {
  const [params, setParams] = useState({
    length: 1.0,
    timeStep: 0.1,
    spaceStep: 0.05,
    totalTime: 10.0,
    initialTemp: 20.0,
    leftBoundary: 100.0,
    rightBoundary: 0.0,
    alpha: 9.7e-5,
  });

  // начение alpha как строка — чтобы поле ввода не «схлопывало» экспоненциальный формат
  const [alphaStr, setAlphaStr] = useState('9.7e-5');

  const [results, setResults] = useState([]);
  const [currentResult, setCurrentResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError]   = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showPhysics, setShowPhysics] = useState(true);
  const wsRef = useRef(null);

  const materialInfo = {
    name: 'люминий',
    k:    '237 т/(м·)',
    rho:  '2 700 кг/м³',
    c:    '900 ж/(кг·)',
    alpha: '9.7×10⁻⁵ м²/с',
  };

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  // араметр уранта для текущих настроек (вычисляется в реальном времени)
  const rCourant = params.alpha * params.timeStep / (params.spaceStep * params.spaceStep);

  const connectWebSocket = () =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:8080/ws');
      ws.onopen  = () => { setIsConnected(true); wsRef.current = ws; resolve(ws); };
      ws.onerror = (e) => { setError('шибка подключения к серверу. бедитесь, что backend запущен.'); reject(e); };
      ws.onclose = () => { setIsConnected(false); wsRef.current = null; };
    });

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

      const buf = [];
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) { setError(data.error); setIsRunning(false); return; }
        buf.push(data);
        setCurrentResult(data);
        setResults([...buf]);
      };

      ws.send(JSON.stringify(params));
      setTimeout(() => setIsRunning(false), 1500);
    } catch (err) {
      setError('е удалось запустить симуляцию: ' + err.message);
      setIsRunning(false);
    }
  };

  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  const handleAlphaChange = (raw) => {
    setAlphaStr(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) {
      setParams(prev => ({ ...prev, alpha: parsed }));
    }
  };

  const resetParams = () => {
    const def = {
      length: 1.0, timeStep: 0.1, spaceStep: 0.05,
      totalTime: 10.0, initialTemp: 20.0,
      leftBoundary: 100.0, rightBoundary: 0.0, alpha: 9.7e-5,
    };
    setParams(def);
    setAlphaStr('9.7e-5');
    setResults([]);
    setCurrentResult(null);
    setError(null);
  };

  const lastResult  = results[results.length - 1];
  const firstResult = results[0];

  const getMinMaxTemp = () => {
    if (!currentResult) return { min: 0, max: 100 };
    const t = currentResult.temperatures;
    return { min: Math.min(...t), max: Math.max(...t) };
  };
  const { min: minTemp, max: maxTemp } = getMinMaxTemp();

  // ыводы по лабораторной работе
  const conclusions = lastResult ? (() => {
    const fo        = lastResult.fourierNum ?? 0;
    const rVal      = lastResult.r ?? rCourant;
    const dTcenter  = lastResult.centerTemp - (firstResult?.centerTemp ?? params.initialTemp);
    const k = 237; // т/(м·) для алюминия
    const qLeft  = -k * (lastResult.leftFlux  ?? 0);
    const qRight = -k * (lastResult.rightFlux ?? 0);
    return { fo, rVal, dTcenter, qLeft, qRight };
  })() : null;

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>🔥 оделирование теплопроводности</h1>
        <p>етод конечных разностей — явная схема для уравнения параболического типа</p>
      </div>

      {/* ─── лок физики ─── */}
      <div className="physics-block">
        <button className="physics-toggle" onClick={() => setShowPhysics(v => !v)}>
          📚 изическая модель {showPhysics ? '▲' : '▼'}
        </button>

        {showPhysics && (
          <div className="physics-body">
            <div className="physics-columns">
              <div className="physics-col">
                <h4>равнение теплопроводности</h4>
                <div className="formula">∂T/∂t = α · ∂²T/∂x²</div>
                <p>
                  писывает распространение тепла вдоль одномерной пластины.
                  равая часть — дивергенция теплового потока.
                  <em> T(x,t)</em> — поле температур, зависящее от координаты и времени.
                </p>

                <h4>оэффициент температуропроводности</h4>
                <div className="formula">α = k / (ρ · c)</div>
                <p>
                  <strong>k</strong> — теплопроводность (т/(м·));<br/>
                  <strong>ρ</strong> — плотность (кг/м³);<br/>
                  <strong>c</strong> — удельная теплоёмкость (ж/(кг·)).<br/>
                  ем больше α, тем быстрее выравнивается температурное поле.
                </p>
              </div>

              <div className="physics-col">
                <h4>исленная схема (явная )</h4>
                <div className="formula small">
                  Tᵢⁿ⁺¹ = Tᵢⁿ + r·(Tᵢ₊₁ⁿ − 2·Tᵢⁿ + Tᵢ₋₁ⁿ)
                </div>
                <p>
                  аждый узел <em>i</em> на шаге <em>n+1</em> пересчитывается по трём соседям с шага <em>n</em>.
                  раничные условия ирихле: температура на торцах зафиксирована.
                </p>

                <h4>словие устойчивости ()</h4>
                <div className="formula">r = α·Δt / Δx² ≤ 0.5</div>
                <p>
                  ри нарушении — ошибки накапливаются, решение «взрывается».
                  <em> r</em> — критерий уранта–ридрихса–еви.
                </p>

                <h4>исло урье</h4>
                <div className="formula">Fo = α·t / L²</div>
                <p>
                  езразмерное время диффузии тепла. ри Fo ≈ 0.1 тепловой фронт
                  достигает центра; при Fo ≫ 1 — профиль T(x) близок к установившемуся (линейному).
                </p>
              </div>
            </div>

            {/* инамическое уравнение с текущими числами */}
            <div className="formula-live">
              <strong>ормула с текущими числами:</strong>&emsp;
              Tᵢⁿ⁺¹ = Tᵢⁿ + <span className={rCourant > 0.5 ? 'r-bad' : 'r-ok'}>
                {fmtSci(rCourant, 6)}
              </span> · (Tᵢ₊₁ⁿ − 2Tᵢⁿ + Tᵢ₋₁ⁿ)
              &emsp;где r = {fmtSci(params.alpha, 3)} × {fmtSci(params.timeStep, 5)} / {fmtSci(params.spaceStep**2, 8)} ={' '}
              <span className={rCourant > 0.5 ? 'r-bad' : 'r-ok'}>
                {fmtSci(rCourant, 6)}
              </span>
              {rCourant > 0.5
                ? ' ⚠️ СТЬ — уменьшите Δt или увеличьте Δx'
                : ' ✓ устойчиво'}
            </div>
          </div>
        )}
      </div>

      {/* ─── атериал ─── */}
      <div className="material-info">
        <h3>📊 атериал: {materialInfo.name}</h3>
        <div className="material-properties">
          <div className="property">
            <div className="property-label">k — теплопроводность</div>
            <div className="property-value">{materialInfo.k}</div>
          </div>
          <div className="property">
            <div className="property-label">ρ — плотность</div>
            <div className="property-value">{materialInfo.rho}</div>
          </div>
          <div className="property">
            <div className="property-label">c — теплоёмкость</div>
            <div className="property-value">{materialInfo.c}</div>
          </div>
          <div className="property">
            <div className="property-label">α — температуропроводность</div>
            <div className="property-value">{materialInfo.alpha}</div>
          </div>
        </div>
      </div>

      {error && <div className="error-message">❌ {error}</div>}

      {/* ─── араметры ─── */}
      <div className="controls-section">
        <h3>⚙️ араметры симуляции</h3>
        <div className="controls-grid">
          <div className="control-group">
            <label>лина пластины L (м)</label>
            <input type="number" step="0.1" value={params.length}
              onChange={(e) => handleParamChange('length', e.target.value)} />
          </div>
          <div className="control-group">
            <label>Шаг по пространству Δx (м)</label>
            <input type="number" step="0.005" value={params.spaceStep}
              onChange={(e) => handleParamChange('spaceStep', e.target.value)} />
            <small>злов сетки: {Math.ceil(params.length / params.spaceStep) + 1}</small>
          </div>
          <div className="control-group">
            <label>Шаг по времени Δt (с)</label>
            <input type="number" step="0.01" value={params.timeStep}
              onChange={(e) => handleParamChange('timeStep', e.target.value)} />
            <small className={rCourant > 0.5 ? 'hint-bad' : 'hint-ok'}>
              r = {fmtSci(rCourant, 6)} {rCourant > 0.5 ? '⚠️ > 0.5 нестабильно' : '≤ 0.5 ✓'}
            </small>
          </div>
          <div className="control-group">
            <label>олное время T (с)</label>
            <input type="number" step="1" value={params.totalTime}
              onChange={(e) => handleParamChange('totalTime', e.target.value)} />
            <small>Шагов по времени: {Math.floor(params.totalTime / params.timeStep)}</small>
          </div>
          <div className="control-group">
            <label>ачальная температура T₀ (°C)</label>
            <input type="number" step="1" value={params.initialTemp}
              onChange={(e) => handleParamChange('initialTemp', e.target.value)} />
          </div>
          <div className="control-group">
            <label>евая граница T_L (°C)</label>
            <input type="number" step="1" value={params.leftBoundary}
              onChange={(e) => handleParamChange('leftBoundary', e.target.value)} />
          </div>
          <div className="control-group">
            <label>равая граница T_R (°C)</label>
            <input type="number" step="1" value={params.rightBoundary}
              onChange={(e) => handleParamChange('rightBoundary', e.target.value)} />
          </div>
          <div className="control-group">
            <label>α — температуропроводность (м²/с)</label>
            <input type="text" value={alphaStr}
              onChange={(e) => handleAlphaChange(e.target.value)} />
            <small>люминий: 9.7e-5 · Сталь: 1.2e-5 · едь: 1.17e-4</small>
          </div>
        </div>

        <div className="button-group">
          <button className="btn btn-primary" onClick={runSimulation}
            disabled={isRunning || rCourant > 0.5}>
            {isRunning ? '⏳ ыполняется...' : '▶️ апустить симуляцию'}
          </button>
          <button className="btn btn-secondary" onClick={resetParams} disabled={isRunning}>
            🔄 Сброс
          </button>
        </div>
      </div>

      {/* ─── изуализация ─── */}
      {currentResult && (
        <div className="visualization-section">
          <div className="visualization-header">
            <h3>🌡️ аспределение температуры</h3>
            <div className="time-display">
              ⏱️ t = {currentResult.time.toFixed(4)} с
              &nbsp;|&nbsp; Fo = {fmtSci(currentResult.fourierNum ?? 0, 4)}
            </div>
          </div>

          <TemperatureChart
            temperatures={currentResult.temperatures}
            length={params.length}
            time={currentResult.time}
            leftBoundary={params.leftBoundary}
            rightBoundary={params.rightBoundary}
          />

          <div style={{ marginTop: '12px' }}>
            <TemperatureHeatmap
              temperatures={currentResult.temperatures}
              minTemp={minTemp}
              maxTemp={maxTemp}
              width={800}
              height={60}
            />
          </div>

          <div className="temperature-scale">
            <span className="scale-label">Холодно</span>
            <div className="scale-gradient"></div>
            <span className="scale-label">орячо</span>
          </div>
          <div className="scale-markers">
            <span>{minTemp.toFixed(6)} °C</span>
            <span>{((minTemp + maxTemp) / 2).toFixed(6)} °C</span>
            <span>{maxTemp.toFixed(6)} °C</span>
          </div>
        </div>
      )}

      {/* ─── езультаты и выводы ─── */}
      {results.length > 0 && (
        <div className="results-section">
          <h3>📈 езультаты симуляции</h3>

          <div className="result-card">
            <div className="result-row">
              <span className="result-label">исленная схема</span>
              <span className="result-value mono">Явная конечно-разностная (Forward Euler)</span>
            </div>
            <div className="result-row">
              <span className="result-label">исло уранта r</span>
              <span className={`result-value mono ${rCourant > 0.5 ? 'text-bad' : 'text-ok'}`}>
                {fmtSci(rCourant, 8)} {rCourant > 0.5 ? '⚠️ нестабильно' : '✓ устойчиво'}
              </span>
            </div>
            <div className="result-row">
              <span className="result-label">инальное время</span>
              <span className="result-value mono">{lastResult?.time.toFixed(6)} с</span>
            </div>
            <div className="result-row">
              <span className="result-label">T в центре: нач. → кон.</span>
              <span className="result-value mono">
                {firstResult?.centerTemp.toFixed(8)} °C → {lastResult?.centerTemp.toFixed(8)} °C
                &emsp;(Δ = {((lastResult?.centerTemp ?? 0) - (firstResult?.centerTemp ?? 0)).toFixed(8)} °C)
              </span>
            </div>
            <div className="result-row">
              <span className="result-label">исло урье Fo = α·t/L²</span>
              <span className="result-value mono">{fmtSci(lastResult?.fourierNum ?? 0, 8)}</span>
            </div>
            <div className="result-row">
              <span className="result-label">злов пространственной сетки</span>
              <span className="result-value mono">{currentResult?.temperatures.length}</span>
            </div>
            <div className="result-row">
              <span className="result-label">стойчивость схемы</span>
              <span className={`status-badge ${lastResult?.stable ? 'status-stable' : 'status-unstable'}`}>
                {lastResult?.stable ? '✓ Стабильно' : '✗ естабильно'}
              </span>
            </div>
          </div>

          {/* ─── ыводы по лабораторной ─── */}
          {conclusions && (
            <div className="conclusions-block">
              <h4>📋 ыводы по лабораторной работе</h4>
              <div className="conclusions-grid">
                <div className="conclusion-item">
                  <div className="concl-label">то моделировалось</div>
                  <div className="concl-value">
                    естационарная теплопроводность одномерной пластины из алюминия (α = {fmtSci(params.alpha, 3)} м²/с).
                    евый торец: <strong>{params.leftBoundary} °C</strong>, правый: <strong>{params.rightBoundary} °C</strong>,
                    начальная: <strong>{params.initialTemp} °C</strong>.
                  </div>
                </div>
                <div className="conclusion-item">
                  <div className="concl-label">стойчивость: r = {fmtSci(conclusions.rVal, 6)}</div>
                  <div className="concl-value">
                    {conclusions.rVal <= 0.5
                      ? 'словие  выполнено (r ≤ 0.5). исленная схема сходится — ошибки не накапливаются.'
                      : '⚠️ словие  нарушено! Схема расходится, результаты недостоверны.'}
                  </div>
                </div>
                <div className="conclusion-item">
                  <div className="concl-label">исло урье Fo = {fmtSci(conclusions.fo, 6)}</div>
                  <div className="concl-value">
                    {conclusions.fo < 0.05
                      ? 'Fo < 0.05: тепловой фронт не достиг центра. Температура в центре почти не изменилась.'
                      : conclusions.fo < 0.3
                      ? 'Fo ~ 0.05–0.3: тепло начало проникать к центру, идёт переходный процесс.'
                      : conclusions.fo < 1
                      ? 'Fo ~ 0.3–1: переходный процесс развит, профиль активно меняется по всей длине.'
                      : 'Fo > 1: поле близко к квазиустановившемуся. T(x) стремится к линейному распределению.'}
                  </div>
                </div>
                <div className="conclusion-item">
                  <div className="concl-label">зменение T в центре</div>
                  <div className="concl-value">
                    а {params.totalTime} с температура в центре изменилась на{' '}
                    <strong>{fmtSci(Math.abs(conclusions.dTcenter), 6)} °C</strong>
                    {' '}({conclusions.dTcenter > 0 ? 'нагрев' : 'охлаждение'}).
                    {Math.abs(conclusions.dTcenter) < 1e-6
                      ? ' рактически равно нулю — время моделирования слишком мало относительно масштаба диффузии.'
                      : ''}
                  </div>
                </div>
                <div className="conclusion-item">
                  <div className="concl-label">Тепловой поток q_L на левой границе</div>
                  <div className="concl-value">
                    q_L = −k · ∂T/∂x|ₓ₌₀ ≈ <strong>{fmtSci(conclusions.qLeft, 4)} т/м²</strong>
                    &emsp;({conclusions.qLeft > 0 ? 'тепло втекает в пластину слева' : 'тепло вытекает с левого торца'})
                  </div>
                </div>
                <div className="conclusion-item">
                  <div className="concl-label">Тепловой поток q_R на правой границе</div>
                  <div className="concl-value">
                    q_R = −k · ∂T/∂x|ₓ₌L ≈ <strong>{fmtSci(conclusions.qRight, 4)} т/м²</strong>
                    &emsp;({conclusions.qRight < 0 ? 'тепло вытекает с правого торца' : 'тепло втекает справа'})
                  </div>
                </div>
                <div className="conclusion-item">
                  <div className="concl-label">становившийся режим</div>
                  <div className="concl-value">
                    {conclusions.fo > 1
                      ? 'ри Fo > 1 профиль T(x) приближается к линейному — тепловые потоки на обоих торцах постоянны и одинаковы. то стационарное решение уравнения ∂²T/∂x² = 0.'
                      : `ля стационара нужно Fo ≫ 1. Сейчас Fo = ${fmtSci(conclusions.fo, 4)} — увеличьте время моделирования до T ≳ ${(params.length**2 / params.alpha * 2).toFixed(1)} с.`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── Таблица шагов ─── */}
          <div className="table-container">
            <h4 style={{ marginBottom: '12px' }}>📊 Таблица шагов (каждые 10 итераций)</h4>
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>t (с)</th>
                  <th>Fo (α·t/L²)</th>
                  <th>T центра (°C)</th>
                  <th>T мин (°C)</th>
                  <th>T макс (°C)</th>
                  <th>q_L (т/м²)</th>
                  <th>q_R (т/м²)</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res, idx) => {
                  const tMin = Math.min(...res.temperatures);
                  const tMax = Math.max(...res.temperatures);
                  const k = 237;
                  return (
                    <tr key={idx}>
                      <td>{idx}</td>
                      <td>{res.time.toFixed(4)}</td>
                      <td>{fmtSci(res.fourierNum ?? 0, 4)}</td>
                      <td>{res.centerTemp.toFixed(8)}</td>
                      <td>{tMin.toFixed(8)}</td>
                      <td>{tMax.toFixed(8)}</td>
                      <td>{fmtSci(-k * (res.leftFlux ?? 0), 4)}</td>
                      <td>{fmtSci(-k * (res.rightFlux ?? 0), 4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isRunning && (
        <div className="loading-spinner">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
}

export default App;
