// Главный компонент приложения «Лесные Пожары»
// Управляет состоянием симуляции и компоновкой интерфейса
import { useState, useEffect, useRef, useCallback } from 'react'
import ForestCanvas from './ForestCanvas.jsx'
import './App.css'

// Список направлений ветра для выпадающего списка
const WIND_DIRS = [
  { value: 0, label: '↑ Север' },
  { value: 1, label: '↗ Северо-восток' },
  { value: 2, label: '→ Восток' },
  { value: 3, label: '↘ Юго-восток' },
  { value: 4, label: '↓ Юг' },
  { value: 5, label: '↙ Юго-запад' },
  { value: 6, label: '← Запад' },
  { value: 7, label: '↖ Северо-запад' },
  { value: 8, label: '— Безветрие' },
]

// Параметры симуляции по умолчанию
const DEFAULT_PARAMS = {
  width: 80,
  height: 60,
  treeDensity: 0.70,
  fireProb: 0.0001,
  growthProb: 0.005,
  humidity: 0.30,
  windDir: 2,
  windStrength: 0.50,
  waterDensity: 0.05,
}

function App() {
  // Параметры симуляции (управляются панелью слева)
  const [params, setParams] = useState(DEFAULT_PARAMS)

  // Текущее состояние симуляции (приходит с Go-бэкенда)
  const [simState, setSimState] = useState(null)

  // Флаги UI
  const [isRunning, setIsRunning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Скорость воспроизведения (шагов в секунду)
  const [speed, setSpeed] = useState(5)

  // Рефы для управления анимационным циклом без перезапуска эффектов
  const isRunningRef = useRef(false)
  const isFetchingRef = useRef(false)
  const animFrameRef = useRef(null)
  const lastTickRef = useRef(0)

  // ──────────────────────────────────────────────────────────────────
  // Сетевые запросы к Go API
  // ──────────────────────────────────────────────────────────────────

  // Инициализирует новую симуляцию с заданными параметрами
  const initSimulation = useCallback(async (p = params) => {
    setIsLoading(true)
    setError(null)
    setIsRunning(false)
    isRunningRef.current = false
    try {
      const res = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSimState(await res.json())
    } catch {
      setError('Не удалось подключиться к серверу. Убедитесь, что Go-сервер запущен (порт 8080).')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Выполняет один шаг симуляции и обновляет состояние
  const doStep = useCallback(async () => {
    if (isFetchingRef.current) return // Предотвращаем перекрывающиеся запросы
    isFetchingRef.current = true
    try {
      const res = await fetch('/api/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps: 1 }),
      })
      if (!res.ok) return
      setSimState(await res.json())
    } catch {
      // Молча игнорируем сетевые ошибки во время анимации
    } finally {
      isFetchingRef.current = false
    }
  }, [])

  // Обновляет «живые» параметры (ветер, влажность, вероятности) без сброса сетки
  const sendParams = useCallback(async (p) => {
    try {
      await fetch('/api/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      })
    } catch {
      // Тихий сбой — параметры применятся при следующем запросе
    }
  }, [])

  // ──────────────────────────────────────────────────────────────────
  // Анимационный цикл на requestAnimationFrame
  // ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    isRunningRef.current = isRunning

    if (!isRunning) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }
      return
    }

    const loop = (timestamp) => {
      if (!isRunningRef.current) return

      const interval = 1000 / speed
      if (timestamp - lastTickRef.current >= interval) {
        lastTickRef.current = timestamp
        doStep()
      }
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isRunning, speed, doStep])

  // Первичная инициализация при монтировании компонента
  useEffect(() => {
    initSimulation(DEFAULT_PARAMS)
  }, [initSimulation])

  // ──────────────────────────────────────────────────────────────────
  // Обработчики UI
  // ──────────────────────────────────────────────────────────────────

  // Обновляет параметр по ключу; «живые» параметры сразу отправляются на сервер
  const handleParam = (key, raw) => {
    const value = key === 'windDir' ? parseInt(raw, 10) : parseFloat(raw)
    const next = { ...params, [key]: value }
    setParams(next)

    // Эти параметры применяются без сброса симуляции
    const liveKeys = ['fireProb', 'growthProb', 'humidity', 'windDir', 'windStrength']
    if (liveKeys.includes(key)) sendParams(next)
  }

  const handleReset = () => {
    initSimulation(params)
  }

  const handleToggle = () => setIsRunning((v) => !v)

  const handleManualStep = () => {
    if (!isRunning) doStep()
  }

  const stats = simState?.stats

  // ──────────────────────────────────────────────────────────────────
  // Рендер
  // ──────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Шапка ── */}
      <header className="app-header">
        <h1>🌲 Лесные Пожары</h1>
        <p>Моделирование возникновения и распространения пожаров — двумерный клеточный автомат</p>
      </header>

      <div className="app-body">
        {/* ── Боковая панель управления ── */}
        <aside className="sidebar">

          {/* Управление воспроизведением */}
          <section className="panel">
            <h2 className="panel-title">Управление</h2>
            <div className="btn-row">
              <button
                className={`btn ${isRunning ? 'btn-stop' : 'btn-start'}`}
                onClick={handleToggle}
                disabled={!simState || isLoading}
              >
                {isRunning ? '⏸ Пауза' : '▶ Старт'}
              </button>
              <button
                className="btn btn-step"
                onClick={handleManualStep}
                disabled={isRunning || !simState || isLoading}
              >
                ⏭ Шаг
              </button>
              <button
                className="btn btn-reset"
                onClick={handleReset}
                disabled={isLoading}
              >
                🔄 Сброс
              </button>
            </div>

            {/* Скорость анимации */}
            <label className="param-label">Скорость: {speed} шаг/сек</label>
            <input
              type="range" min="1" max="30" step="1"
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
            />
          </section>

          {/* Параметры леса */}
          <section className="panel">
            <h2 className="panel-title">Лес</h2>

            <Slider
              label={`Плотность деревьев: ${pct(params.treeDensity)}`}
              min={0} max={1} step={0.05}
              value={params.treeDensity}
              onChange={(v) => handleParam('treeDensity', v)}
              note="Требует сброса"
            />
            <Slider
              label={`Водоёмы: ${pct(params.waterDensity)}`}
              min={0} max={0.30} step={0.01}
              value={params.waterDensity}
              onChange={(v) => handleParam('waterDensity', v)}
              note="Требует сброса"
            />
            <Slider
              label={`Рост деревьев (f): ${params.growthProb.toFixed(4)}`}
              min={0} max={0.05} step={0.001}
              value={params.growthProb}
              onChange={(v) => handleParam('growthProb', v)}
            />
          </section>

          {/* Параметры пожара */}
          <section className="panel">
            <h2 className="panel-title">Пожар</h2>

            <Slider
              label={`Молния (p): ${params.fireProb.toFixed(4)}`}
              min={0} max={0.01} step={0.0001}
              value={params.fireProb}
              onChange={(v) => handleParam('fireProb', v)}
            />
            <Slider
              label={`Влажность: ${pct(params.humidity)}`}
              min={0} max={1} step={0.05}
              value={params.humidity}
              onChange={(v) => handleParam('humidity', v)}
            />
          </section>

          {/* Ветер */}
          <section className="panel">
            <h2 className="panel-title">Ветер</h2>

            <label className="param-label">Направление</label>
            <select
              className="select"
              value={params.windDir}
              onChange={(e) => handleParam('windDir', e.target.value)}
            >
              {WIND_DIRS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>

            <Slider
              label={`Сила ветра: ${pct(params.windStrength)}`}
              min={0} max={1} step={0.05}
              value={params.windStrength}
              onChange={(v) => handleParam('windStrength', v)}
            />
          </section>

          {/* Размер сетки */}
          <section className="panel">
            <h2 className="panel-title">Размер сетки</h2>
            <div className="grid-size-row">
              <div className="grid-size-field">
                <label className="param-label">Ширина</label>
                <input
                  type="number" min="20" max="200"
                  value={params.width}
                  onChange={(e) => setParams((p) => ({ ...p, width: parseInt(e.target.value, 10) || 80 }))}
                />
              </div>
              <div className="grid-size-field">
                <label className="param-label">Высота</label>
                <input
                  type="number" min="20" max="150"
                  value={params.height}
                  onChange={(e) => setParams((p) => ({ ...p, height: parseInt(e.target.value, 10) || 60 }))}
                />
              </div>
            </div>
            <button className="btn btn-step" style={{ width: '100%', marginTop: 6 }} onClick={handleReset} disabled={isLoading}>
              Применить
            </button>
          </section>

          {/* Легенда */}
          <section className="panel">
            <h2 className="panel-title">Легенда</h2>
            <div className="legend">
              <LegendItem color="#3a9d3a" label="Молодое дерево (≤40 шагов)" />
              <LegendItem color="#1a6b1a" label="Зрелое дерево (40–80)" />
              <LegendItem color="#8b6914" label="Старое дерево (>80, горит легче)" />
              <LegendItem color="#ff4500" label="Горящее дерево" />
              <LegendItem color="#ffd700" label="Сердцевина огня" />
              <LegendItem color="#4a4a4a" label="Зола" />
              <LegendItem color="#1e90ff" label="Водоём (барьер)" />
              <LegendItem color="#c8a96e" label="Пустая земля" />
            </div>
          </section>
        </aside>

        {/* ── Основная область ── */}
        <main className="main-content">
          {/* Ошибка подключения */}
          {error && <div className="error-bar">⚠ {error}</div>}

          {/* Статистика */}
          {stats && (
            <div className="stats-bar">
              <StatItem icon="🌲" label="Деревья" value={stats.treeCount} />
              <StatItem icon="🔥" label="Горит" value={stats.burningCount} color="#ff6b35" />
              <StatItem icon="🌊" label="Вода" value={stats.waterCount} color="#5ab3ff" />
              <StatItem icon="⬛" label="Зола" value={stats.ashCount} color="#888" />
              <StatItem icon="⬜" label="Земля" value={stats.emptyCount} color="#c8a96e" />
              <div className="stat-divider" />
              <StatItem icon="⏱" label="Шаг" value={stats.step} />
            </div>
          )}

          {/* Canvas с лесом */}
          <div className="canvas-wrap">
            {isLoading && (
              <div className="canvas-overlay">
                <div className="spinner" />
                <span>Инициализация симуляции…</span>
              </div>
            )}
            {simState && (
              <ForestCanvas
                grid={simState.grid}
                age={simState.age}
                cols={simState.params.width}
                rows={simState.params.height}
              />
            )}
          </div>

          {/* Описание правил */}
          <div className="rules-section">
            <h3 className="rules-title">Правила клеточного автомата</h3>
            <div className="rules-grid">
              <div className="rule-card">
                <h4>Базовые правила</h4>
                <ul>
                  <li>Горящее дерево → <em>Зола</em> (сгорает за 1 шаг)</li>
                  <li>Дерево рядом с огнём → <em>Горит</em> (с заданной вероятностью)</li>
                  <li>Зола → <em>Пустая земля</em></li>
                  <li>Пустая земля → <em>Дерево</em> с вероятностью <strong>f</strong></li>
                </ul>
              </div>
              <div className="rule-card">
                <h4>Дополнительные правила</h4>
                <ul>
                  <li><strong>Молния:</strong> дерево возгорается само (вероятность <strong>p</strong>)</li>
                  <li><strong>Влажность:</strong> снижает вероятность распространения огня</li>
                  <li><strong>Ветер:</strong> усиливает огонь по направлению, ослабляет против</li>
                  <li><strong>Возраст:</strong> старые деревья воспламеняются легче (+30–60%)</li>
                  <li><strong>Водоёмы:</strong> не горят, создают естественные преграды</li>
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Вспомогательные компоненты ────────────────────────────────────

/** Ползунок с подписью */
function Slider({ label, min, max, step, value, onChange, note }) {
  return (
    <div className="slider-group">
      <label className="param-label">{label}</label>
      {note && <span className="param-note">{note}</span>}
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Элемент легенды */
function LegendItem({ color, label }) {
  return (
    <div className="legend-item">
      <span className="legend-dot" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

/** Элемент статистики */
function StatItem({ icon, label, value, color }) {
  return (
    <div className="stat-item">
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}:</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {value.toLocaleString('ru')}
      </span>
    </div>
  )
}

/** Форматировать долю как процент */
function pct(v) {
  return `${Math.round(v * 100)}%`
}

export default App
