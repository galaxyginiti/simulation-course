// Лабораторная работа №3: Клеточные автоматы — Лесные пожары
// Реализация двумерного клеточного автомата для моделирования
// возникновения и распространения лесных пожаров.
//
// Правила клеточного автомата:
// Базовые:
//   1. Горящее дерево (Fire) → Зола (Ash): дерево выгорает за один шаг
//   2. Живое дерево (Tree) → Огонь (Fire): если среди 8 соседей есть горящее
//   3. Зола (Ash) → Пустая земля (Empty)
//   4. Пустая земля (Empty) → Дерево (Tree) с вероятностью f
//
// Дополнительные (не менее трёх):
//   5. Молния: дерево загорается случайно с вероятностью p (без горящих соседей)
//   6. Влажность: снижает вероятность распространения огня
//   7. Ветер: увеличивает вероятность распространения огня по направлению ветра
//   8. Возраст деревьев: старые деревья воспламеняются легче
//   9. Водоёмы: клетки с водой не горят и блокируют огонь

package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"sync"
)

// Состояния клеток клеточного автомата
const (
	CellEmpty = 0 // Пустая земля
	CellTree  = 1 // Живое дерево
	CellFire  = 2 // Горящее дерево
	CellAsh   = 3 // Зола (выгоревшая клетка)
	CellWater = 4 // Водоём (естественный барьер — не горит)
)

// Константы направлений ветра
const (
	WindNorth     = 0 // Север
	WindNorthEast = 1 // Северо-восток
	WindEast      = 2 // Восток
	WindSouthEast = 3 // Юго-восток
	WindSouth     = 4 // Юг
	WindSouthWest = 5 // Юго-запад
	WindWest      = 6 // Запад
	WindNorthWest = 7 // Северо-запад
	WindNone      = 8 // Безветрие
)

// windVectors — единичные векторы направлений ветра (dx, dy).
// Индекс соответствует константам Wind*.
// Ось Y направлена вниз (по строкам матрицы).
var windVectors = [][2]int{
	{0, -1},  // 0: Север
	{1, -1},  // 1: Северо-восток
	{1, 0},   // 2: Восток
	{1, 1},   // 3: Юго-восток
	{0, 1},   // 4: Юг
	{-1, 1},  // 5: Юго-запад
	{-1, 0},  // 6: Запад
	{-1, -1}, // 7: Северо-запад
}

// SimParams — параметры симуляции, передаваемые с фронтенда
type SimParams struct {
	Width        int     `json:"width"`        // Ширина сетки (кол-во клеток)
	Height       int     `json:"height"`       // Высота сетки (кол-во клеток)
	TreeDensity  float64 `json:"treeDensity"`  // Начальная плотность леса [0..1]
	FireProb     float64 `json:"fireProb"`     // Вероятность молнии p [0..1]
	GrowthProb   float64 `json:"growthProb"`   // Вероятность роста нового дерева f [0..1]
	Humidity     float64 `json:"humidity"`     // Влажность [0..1]: снижает вероятность возгорания
	WindDir      int     `json:"windDir"`      // Направление ветра (0–7; 8 = нет ветра)
	WindStrength float64 `json:"windStrength"` // Сила ветра [0..1]
	WaterDensity float64 `json:"waterDensity"` // Плотность водоёмов [0..1]
}

// SimStats — статистика текущего состояния симуляции
type SimStats struct {
	Step         int `json:"step"`         // Номер текущего шага
	TreeCount    int `json:"treeCount"`    // Количество живых деревьев
	BurningCount int `json:"burningCount"` // Количество горящих клеток
	AshCount     int `json:"ashCount"`     // Количество клеток с золой
	EmptyCount   int `json:"emptyCount"`   // Количество пустых клеток
	WaterCount   int `json:"waterCount"`   // Количество водоёмов
}

// SimState — полное состояние симуляции, возвращаемое фронтенду
type SimState struct {
	Grid   [][]int  `json:"grid"`   // Двумерная сетка состояний [height][width]
	Age    [][]int  `json:"age"`    // Возраст деревьев в шагах [height][width]
	Stats  SimStats `json:"stats"`  // Статистика
	Params SimParams `json:"params"` // Активные параметры
}

// StepRequest — запрос на выполнение нескольких шагов
type StepRequest struct {
	Steps int `json:"steps"` // Количество шагов (1–100)
}

// Глобальное состояние симуляции (единственный экземпляр в памяти)
var (
	simMu     sync.Mutex // Мьютекс для потокобезопасного доступа
	simGrid   [][]int    // Сетка состояний клеток
	simAge    [][]int    // Возраст деревьев (в шагах); 0 для не-деревьев
	simStep   int        // Счётчик шагов
	simParams SimParams  // Текущие параметры
)

// initSimulation — инициализирует сетку с заданными параметрами.
// Водоёмы расставляются первыми, затем деревья, остальное — пустая земля.
func initSimulation(p SimParams) {
	simParams = p
	simStep = 0

	h, w := p.Height, p.Width

	// Выделяем двумерные срезы
	simGrid = make([][]int, h)
	simAge = make([][]int, h)

	for y := 0; y < h; y++ {
		simGrid[y] = make([]int, w)
		simAge[y] = make([]int, w)
		for x := 0; x < w; x++ {
			r := rand.Float64()
			switch {
			case r < p.WaterDensity:
				// Водоём — естественный барьер
				simGrid[y][x] = CellWater
			case r < p.WaterDensity+p.TreeDensity:
				// Живое дерево со случайным начальным возрастом (0–60 шагов)
				simGrid[y][x] = CellTree
				simAge[y][x] = rand.Intn(60)
			default:
				// Пустая земля
				simGrid[y][x] = CellEmpty
			}
		}
	}
}

// windMultiplier — вычисляет множитель вероятности распространения огня
// с учётом ветра. (dx, dy) — вектор от горящей клетки к поджигаемой.
//
// Дополнительное правило №7: ветер увеличивает распространение огня
// в направлении своего вектора и уменьшает против.
func windMultiplier(dx, dy int, p SimParams) float64 {
	if p.WindDir == WindNone || p.WindStrength == 0 {
		return 1.0 // Ветра нет — множитель нейтральный
	}

	wv := windVectors[p.WindDir]

	// Скалярное произведение вектора распространения и вектора ветра
	dot := dx*wv[0] + dy*wv[1]

	// Нормируем в диапазон [-1..1].
	// Максимум dot для целочисленных векторов длиной ≤ sqrt(2) примерно равен 2.
	norm := float64(dot) / 2.0

	// Множитель: от (1 - windStrength*0.9) до (1 + windStrength)
	mult := 1.0 + norm*p.WindStrength
	if mult < 0.05 {
		mult = 0.05 // Минимальный остаточный шанс
	}
	return mult
}

// ageMultiplier — возвращает множитель горючести по возрасту дерева.
//
// Дополнительное правило №8: старые деревья (сухое дерево) горят легче.
func ageMultiplier(age int) float64 {
	switch {
	case age > 80:
		return 1.6 // Очень старое дерево — высокая горючесть
	case age > 50:
		return 1.3 // Зрелое дерево
	default:
		return 1.0 // Молодое дерево — стандартная горючесть
	}
}

// stepSimulation — выполняет один шаг клеточного автомата.
// Использует соседство Мура (8 соседей).
func stepSimulation() {
	h := simParams.Height
	w := simParams.Width
	p := simParams

	// Новая сетка: копируем текущее состояние и применяем правила
	newGrid := make([][]int, h)
	newAge := make([][]int, h)
	for y := 0; y < h; y++ {
		newGrid[y] = make([]int, w)
		newAge[y] = make([]int, w)
		copy(newGrid[y], simGrid[y])
		copy(newAge[y], simAge[y])
	}

	// Смещения для 8 соседей (соседство Мура)
	neighbors := [][2]int{
		{-1, -1}, {0, -1}, {1, -1},
		{-1, 0}, {1, 0},
		{-1, 1}, {0, 1}, {1, 1},
	}

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			cell := simGrid[y][x]

			switch cell {

			case CellFire:
				// Базовое правило 1: горящее дерево выгорает → зола
				newGrid[y][x] = CellAsh
				newAge[y][x] = 0

			case CellTree:
				caught := false

				// Базовое правило 2: проверяем, не поджигает ли горящий сосед
				for _, nb := range neighbors {
					nx, ny := x+nb[0], y+nb[1]
					if nx < 0 || nx >= w || ny < 0 || ny >= h {
						continue // Выход за границы сетки
					}
					if simGrid[ny][nx] != CellFire {
						continue // Сосед не горит
					}

					// Базовая вероятность возгорания
					baseProb := 1.0

					// Дополнительное правило 6: влажность снижает вероятность
					baseProb *= (1.0 - p.Humidity)

					// Дополнительное правило 7: ветер усиливает/ослабляет огонь
					baseProb *= windMultiplier(x-nx, y-ny, p)

					// Дополнительное правило 8: возраст целевого дерева
					baseProb *= ageMultiplier(simAge[y][x])

					// Ограничиваем вероятность диапазоном [0..1]
					if baseProb > 1.0 {
						baseProb = 1.0
					}
					if baseProb < 0 {
						baseProb = 0
					}

					if rand.Float64() < baseProb {
						caught = true
						break // Достаточно одного горящего соседа
					}
				}

				if caught {
					// Дерево загорелось от соседа
					newGrid[y][x] = CellFire
					newAge[y][x] = 0
				} else if rand.Float64() < p.FireProb {
					// Дополнительное правило 5: молния — случайное возгорание
					newGrid[y][x] = CellFire
					newAge[y][x] = 0
				} else {
					// Дерево продолжает расти: увеличиваем возраст
					newAge[y][x] = simAge[y][x] + 1
				}

			case CellAsh:
				// Базовое правило 3: зола → пустая земля
				newGrid[y][x] = CellEmpty
				newAge[y][x] = 0

			case CellEmpty:
				// Базовое правило 4: пустая земля → дерево с вероятностью f
				if rand.Float64() < p.GrowthProb {
					newGrid[y][x] = CellTree
					newAge[y][x] = 0
				}

			case CellWater:
				// Дополнительное правило 9: водоём неизменен — не горит, не растёт
				// Состояние водоёма не меняется никогда
				newGrid[y][x] = CellWater
			}
		}
	}

	// Обновляем глобальное состояние
	simGrid = newGrid
	simAge = newAge
	simStep++
}

// collectStats — собирает статистику по текущей сетке
func collectStats() SimStats {
	stats := SimStats{Step: simStep}
	for y := range simGrid {
		for _, cell := range simGrid[y] {
			switch cell {
			case CellTree:
				stats.TreeCount++
			case CellFire:
				stats.BurningCount++
			case CellAsh:
				stats.AshCount++
			case CellEmpty:
				stats.EmptyCount++
			case CellWater:
				stats.WaterCount++
			}
		}
	}
	return stats
}

// currentState — возвращает полное состояние для сериализации
func currentState() SimState {
	return SimState{
		Grid:   simGrid,
		Age:    simAge,
		Stats:  collectStats(),
		Params: simParams,
	}
}

// cors — добавляет CORS-заголовки и обрабатывает preflight-запросы
func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

// writeJSON — сериализует v в JSON и записывает в ответ
func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("Ошибка сериализации JSON: %v", err)
	}
}

// handleInit — POST /api/init
// Инициализирует новую симуляцию с переданными параметрами.
func handleInit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}

	var p SimParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Ошибка разбора параметров: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Санитизация размеров сетки
	if p.Width <= 0 {
		p.Width = 80
	}
	if p.Height <= 0 {
		p.Height = 60
	}
	if p.Width > 200 {
		p.Width = 200
	}
	if p.Height > 150 {
		p.Height = 150
	}

	simMu.Lock()
	defer simMu.Unlock()

	initSimulation(p)
	writeJSON(w, currentState())
}

// handleStep — POST /api/step
// Выполняет N шагов симуляции и возвращает новое состояние.
func handleStep(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}

	var req StepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Steps <= 0 {
		req.Steps = 1 // По умолчанию — один шаг
	}
	if req.Steps > 100 {
		req.Steps = 100 // Ограничение для предотвращения зависания
	}

	simMu.Lock()
	defer simMu.Unlock()

	for i := 0; i < req.Steps; i++ {
		stepSimulation()
	}
	writeJSON(w, currentState())
}

// handleState — GET /api/state
// Возвращает текущее состояние без изменений.
func handleState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	simMu.Lock()
	defer simMu.Unlock()
	writeJSON(w, currentState())
}

// handleParams — POST /api/params
// Обновляет «живые» параметры (ветер, влажность, вероятности) без сброса сетки.
func handleParams(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}

	var p SimParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "Ошибка разбора параметров: "+err.Error(), http.StatusBadRequest)
		return
	}

	simMu.Lock()
	defer simMu.Unlock()

	// Обновляем только «динамические» параметры, не затрагивая размер сетки
	simParams.FireProb = p.FireProb
	simParams.GrowthProb = p.GrowthProb
	simParams.Humidity = p.Humidity
	simParams.WindDir = p.WindDir
	simParams.WindStrength = p.WindStrength

	writeJSON(w, currentState())
}

func main() {
	// Инициализация с параметрами по умолчанию
	initSimulation(SimParams{
		Width:        80,
		Height:       60,
		TreeDensity:  0.70,  // 70% площади покрыто лесом
		FireProb:     0.0001, // Очень редкие молнии
		GrowthProb:   0.005,  // Медленный рост леса
		Humidity:     0.30,   // Умеренная влажность
		WindDir:      WindEast,
		WindStrength: 0.50,
		WaterDensity: 0.05, // 5% площади — водоёмы
	})

	// Регистрация обработчиков маршрутов API
	http.HandleFunc("/api/init", cors(handleInit))
	http.HandleFunc("/api/step", cors(handleStep))
	http.HandleFunc("/api/state", cors(handleState))
	http.HandleFunc("/api/params", cors(handleParams))

	log.Println("Сервер запущен: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
