// Компонент рендеринга леса на элементе <canvas>.
// Каждая клетка раскрашивается в зависимости от состояния и возраста дерева.
import { useRef, useEffect } from 'react'

// Состояния клеток (должны совпадать с константами в Go-бэкенде)
const EMPTY = 0  // Пустая земля
const TREE  = 1  // Живое дерево
const FIRE  = 2  // Горящее дерево
const ASH   = 3  // Зола
const WATER = 4  // Водоём

/**
 * getCellColor — определяет цвет заливки клетки по её состоянию и возрасту.
 * @param {number} state - состояние клетки (0–4)
 * @param {number} age   - возраст дерева в шагах
 * @returns {string} CSS-цвет
 */
function getCellColor(state, age) {
  switch (state) {
    case EMPTY:
      return '#c8a96e' // Бежевая земля
    case TREE:
      if (age > 80) return '#8b6914' // Старое сухое дерево — коричневый
      if (age > 40) return '#1a6b1a' // Зрелое дерево — тёмно-зелёный
      return '#3a9d3a'               // Молодое дерево — ярко-зелёный
    case FIRE:
      return '#ff4500' // Огонь — оранжево-красный
    case ASH:
      return '#4a4a4a' // Зола — тёмно-серый
    case WATER:
      return '#1e90ff' // Водоём — синий
    default:
      return '#000'
  }
}

/**
 * ForestCanvas — отрисовывает двумерную сетку клеточного автомата.
 * @param {number[][]} grid - массив состояний [rows][cols]
 * @param {number[][]} age  - массив возрастов деревьев [rows][cols]
 * @param {number} cols     - количество столбцов
 * @param {number} rows     - количество строк
 */
function ForestCanvas({ grid, age, cols, rows }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grid || !age) return

    const ctx = canvas.getContext('2d')

    // Вычисляем размер одной клетки так, чтобы холст вписывался в 800×600
    const cellW = canvas.width  / cols
    const cellH = canvas.height / rows

    // Очищаем холст перед перерисовкой
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Рисуем каждую клетку
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const state   = grid[y]?.[x] ?? EMPTY
        const cellAge = age[y]?.[x]  ?? 0

        // Координаты и размеры клетки (пиксели)
        const px = Math.floor(x * cellW)
        const py = Math.floor(y * cellH)
        const pw = Math.ceil(cellW)
        const ph = Math.ceil(cellH)

        // Основной цвет клетки
        ctx.fillStyle = getCellColor(state, cellAge)
        ctx.fillRect(px, py, pw, ph)

        // Дополнительный яркий центр для горящих клеток — имитация пламени
        if (state === FIRE && pw > 3 && ph > 3) {
          ctx.fillStyle = 'rgba(255, 215, 0, 0.65)' // Золотой центр
          ctx.fillRect(
            px + Math.ceil(pw * 0.25),
            py + Math.ceil(ph * 0.25),
            Math.floor(pw * 0.5),
            Math.floor(ph * 0.5),
          )
        }

        // Лёгкий голубоватый блик для водоёмов
        if (state === WATER && pw > 4 && ph > 4) {
          ctx.fillStyle = 'rgba(180, 230, 255, 0.30)'
          ctx.fillRect(px + 1, py + 1, pw - 2, Math.ceil(ph * 0.4))
        }
      }
    }
  }, [grid, age, cols, rows])

  // Выбираем разрешение холста: стремимся к 800×600 при пропорциональном масштабе
  const cellSize = Math.max(1, Math.min(
    Math.floor(800 / cols),
    Math.floor(600 / rows),
    14,
  ))
  const canvasW = cellSize * cols
  const canvasH = cellSize * rows

  return (
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      className="forest-canvas"
      title={`Сетка ${cols}×${rows}, клетка ${cellSize}px`}
    />
  )
}

export default ForestCanvas
