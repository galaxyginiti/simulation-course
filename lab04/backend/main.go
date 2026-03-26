// Лабораторная работа №4: Базовый датчик случайных чисел
//
// Реализует два датчика:
//   1. Мультипликативный конгруэнтный генератор (МКГ)
//      Формула: x*_i = (β · x*_{i-1}) mod M
//               α_i  = x*_i / M  ∈ [0, 1)
//      β = 2^32 + 3 = 4 294 967 299
//      M = 2^63     = 9 223 372 036 854 775 808
//      x₀ = β       (зерно)
//
//   2. Метод середины квадрата (фон Неймана)
//      Берём n-значное число, возводим в квадрат, извлекаем средние n цифр.
//      α = средние_цифры / 10^n
//
// Сравниваем их со встроенным генератором Go и теоретическими значениями
// для равномерного распределения U[0, 1]:
//   Среднее   E[α] = 0.5
//   Дисперсия D[α] = 1/12 ≈ 0.08333…
//   СКО       σ    = 1/√12 ≈ 0.28868…


package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
)

// ─── Константы ───────────────────────────────────────────────────────────────

const (
	SampleSize = 100_000 // Размер выборки (N)
	NumBins    = 30      // Число столбцов гистограммы

	// Параметры МКГ (из презентации)
	MCGBeta uint64 = 4294967299          // β = 2^32 + 3 — множитель
	MCGM    uint64 = 9223372036854775808 // M = 2^63     — модуль
	MCGSeed uint64 = 4294967299          // x₀ = β       — зерно (начальное значение)

	// Параметры метода середины квадрата
	MSDigits = 8        // Количество цифр
	MSSeed   = 67539821 // Начальное значение (8 цифр, нечётное, без нулей по краям)

	// Отображение первых значений
	FirstN = 20 // Количество первых значений для передачи на фронтенд

	// Параметры метода середины квадрата + последовательность Вейля (MSWS, Stafford 2017)
	// Улучшение фон-Неймановского метода: счётчик Вейля предотвращает вырождение в ноль.
	MSWSeed uint64 = 4294967299         // x₀ — начальное состояние
	MSWSS   uint64 = 0xb5ad4eceda1ce2a9 // s  — нечётный шаг Вейля (из оригинальной статьи)
)

// ─── МКГ — Мультипликативный конгруэнтный генератор ─────────────────────────
// Формула: x*_i = (β · x*_{i-1}) mod M,  α_i = x*_i / M
type MCG struct {
	state uint64 // Текущее x* (целое состояние)
}

// NewMCG создаёт МКГ с заданным зерном x₀.
func NewMCG(seed uint64) *MCG {
	return &MCG{state: seed}
}

// Next возвращает следующее α_i ∈ [0, 1).
// Шаг 1: x*_i = (β · x*_{i-1}) mod M   (целочисленная рекуррента)
// Шаг 2: α_i  = x*_i / M                (нормировка в [0, 1))
//
// Поскольку M = 2^63, операция mod M эквивалентна обнулению старшего бита,
// что выполняется побитовым AND с маской (M - 1).
func (g *MCG) Next() float64 {
	g.state = (MCGBeta * g.state) % MCGM

	// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
	// α_i = x*_i / M — вещественное число (float64) ∈ [0, 1), НЕ процент.
	// Пример: x* = 4 619 502 … → α = 0.500614…
	// Делим целое состояние x* (uint64) на модуль M = 2⁶³ → получаем вещественное α.
	return float64(g.state) / float64(MCGM)
}

// ─── Метод середины квадрата (фон Неймана) ──────────────────────────────────

// MiddleSquare — датчик случайных чисел методом середины квадрата.
// Алгоритм:
//  1. Берём текущее n-значное число x
//  2. Вычисляем x² (до 2n цифр)
//  3. Извлекаем средние n цифр — это новое x
//  4. α = x / 10^n
type MiddleSquare struct {
	state uint64 // Текущее n-значное число
	mod   uint64 // 10^n — для нормировки и взятия средних цифр
	shift uint64 // 10^(n/2) — для отбрасывания правых цифр
}

// NewMiddleSquare создаёт генератор середины квадрата с n цифрами.
func NewMiddleSquare(seed uint64, digits int) *MiddleSquare {
	mod := uint64(1)
	for i := 0; i < digits; i++ {
		mod *= 10
	}
	shift := uint64(1)
	for i := 0; i < digits/2; i++ {
		shift *= 10
	}
	return &MiddleSquare{state: seed, mod: mod, shift: shift}
}

// Next возвращает следующее α ∈ [0, 1).
// Пример для 4 цифр: x = 1234 → x² = 01522756 → средние = 5227 → α = 0.5227
func (g *MiddleSquare) Next() float64 {
	squared := g.state * g.state           // x²
	g.state = (squared / g.shift) % g.mod // извлекаем средние n цифр

	// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
	// α = x / 10ⁿ — вещественное число (float64) ∈ [0, 1), НЕ процент.
	// Пример: x = 62 742 071, n = 8 → α = 0.62742071…
	// Если x → 0, то α → 0 навсегда (вырождение генератора).
	return float64(g.state) / float64(g.mod)
}

// ─── Метод середины квадрата + последовательность Вейля (MSWS) ──────────────
// Улучшение фон-Неймановского алгоритма (John Stafford, 2017).
// Счётчик Вейля w монотонно растёт с каждым шагом (w += s, s — нечётное),
// благодаря чему x не может обратиться в ноль и «застрять».
//
// Алгоритм (один шаг):
//   x = x·x           (возводим в квадрат — «середина квадрата»)
//   w = w + s         (s — нечётная константа; w растёт строго монотонно)
//   x = x + w         (смещение: x никогда не «схлопнется» в ноль)
//   x = rotate32(x)   (меняем местами старшие и младшие 32 бита)
//   α = uint32(x) / 2³² (берём 32 бита и нормируем в [0, 1))
type MiddleSquareWeyl struct {
	x uint64 // текущее состояние
	w uint64 // счётчик Вейля (монотонно растёт)
	s uint64 // шаг Вейля: нечётная константа из работы Stafford 2017
}

func NewMiddleSquareWeyl(seed uint64) *MiddleSquareWeyl {
	return &MiddleSquareWeyl{x: seed, w: 0, s: MSWSS}
}

func (g *MiddleSquareWeyl) Next() float64 {
	g.x *= g.x                       // x = x²  (середина квадрата)
	g.w += g.s                       // w = w + s (счётчик Вейля)
	g.x += g.w                       // x = x + w (предотвращает вырождение)
	g.x = (g.x >> 32) | (g.x << 32) // rotate32: swap high/low 32 bits

	// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
	// α = uint32(x) / 2³² — вещественное число (float64) ∈ [0, 1), НЕ процент.
	// Берём нижние 32 бита x и нормируем делением на 2³² = 4 294 967 296.
	// В отличие от классического метода, α здесь никогда не вырождается в ноль.
	return float64(uint32(g.x)) / float64(1<<32)
}

// ─── Структуры ответа API ───────────────────────────────────────────────────

// HistogramBin — один столбец гистограммы.
type HistogramBin struct {
	Min   float64 `json:"min"`   // Левая граница интервала
	Max   float64 `json:"max"`   // Правая граница интервала
	Count int     `json:"count"` // Абсолютная частота
	Freq  float64 `json:"freq"`  // Относительная частота (≈ вероятность)
}

// GeneratorStats — выборочные характеристики одного генератора.
type GeneratorStats struct {
	Mean             float64        `json:"mean"`             // Выборочное среднее
	Variance         float64        `json:"variance"`         // Выборочная дисперсия (несмещённая)
	StdDev           float64        `json:"stdDev"`           // Выборочное СКО
	Histogram        []HistogramBin `json:"histogram"`        // Гистограмма (NumBins столбцов)
	FirstValues      []float64      `json:"firstValues"`      // Первые FirstN значений
	DegeneratedAt    int            `json:"degeneratedAt"`    // Индекс вырождения (-1 = не вырожден)
	TransitionSample []float64      `json:"transitionSample"` // Значения вокруг точки вырождения
}

// TheoreticalStats — точные теоретические значения для U[0, 1].
type TheoreticalStats struct {
	Mean     float64 `json:"mean"`     // E[α] = 0.5
	Variance float64 `json:"variance"` // D[α] = 1/12
	StdDev   float64 `json:"stdDev"`   // σ    = 1/√12
}

// Response — полный ответ эндпоинта /api/generate.
type Response struct {
	SampleSize          int              `json:"sampleSize"`
	MCG                 GeneratorStats   `json:"mcg"`               // МКГ
	MiddleSquare        GeneratorStats   `json:"middleSquare"`       // Середина квадрата (классика, может вырождаться)
	MiddleSquareWeyl    GeneratorStats   `json:"middleSquareWeyl"`   // Середина квадрата + последовательность Вейля
	Builtin             GeneratorStats   `json:"builtin"`            // Встроенный Go
	Theoretical         TheoreticalStats `json:"theoretical"`
	MCGParams struct {
		Beta uint64 `json:"beta"` // β — множитель
		M    uint64 `json:"m"`    // M — модуль
		Seed uint64 `json:"seed"` // x₀ — зерно
	} `json:"mcgParams"`
	MSParams struct {
		Seed   uint64 `json:"seed"`   // Начальное значение
		Digits int    `json:"digits"` // Количество цифр
	} `json:"msParams"`
	MSWParams struct {
		Seed uint64 `json:"seed"` // x₀ — начальное состояние
		S    uint64 `json:"s"`    // s  — нечётный шаг Вейля
	} `json:"mswParams"`
}

// ─── Вычисление статистик ───────────────────────────────────────────────────

// computeStats вычисляет выборочное среднее, несмещённую дисперсию, СКО
// и строит гистограмму из NumBins равных столбцов на [0, 1).
func computeStats(values []float64) GeneratorStats {
	n := float64(len(values))

	// Выборочное среднее: x̄ = (1/N) · Σ α_i
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	mean := sum / n

	// Несмещённая выборочная дисперсия: s² = (1/(N-1)) · Σ (α_i − x̄)²
	sumSq := 0.0
	for _, v := range values {
		d := v - mean
		sumSq += d * d
	}
	variance := sumSq / (n - 1)
	stdDev := math.Sqrt(variance)

	// Гистограмма с равными интервалами на [0, 1)
	bins := make([]HistogramBin, NumBins)
	for i := range bins {
		bins[i].Min = float64(i) / float64(NumBins)
		bins[i].Max = float64(i+1) / float64(NumBins)
	}
	for _, v := range values {
		idx := int(v * float64(NumBins))
		if idx >= NumBins {
			idx = NumBins - 1
		}
		bins[idx].Count++
	}
	for i := range bins {
		bins[i].Freq = float64(bins[i].Count) / n
	}

	return GeneratorStats{
		Mean:      mean,
		Variance:  variance,
		StdDev:    stdDev,
		Histogram: bins,
	}
}

// ─── HTTP-обработчики ───────────────────────────────────────────────────────

// findDegenerationIndex возвращает первый индекс, где значение < 0.001,
// или -1, если вырождения не обнаружено.
func findDegenerationIndex(values []float64) int {
	for i, v := range values {
		if v < 0.001 {
			return i
		}
	}
	return -1
}

func handleGenerate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// ── Генерация выборки МКГ ────────────────────────────────────────────────
	mcgGen := NewMCG(MCGSeed)
	mcgValues := make([]float64, SampleSize)
	for i := range mcgValues {
		mcgValues[i] = mcgGen.Next()
	}

	// ── Генерация выборки методом середины квадрата ──────────────────────────
	msGen := NewMiddleSquare(MSSeed, MSDigits)
	msValues := make([]float64, SampleSize)
	for i := range msValues {
		msValues[i] = msGen.Next()
	}

	// ── Генерация выборки встроенного генератора Go ──────────────────────────
	rng := rand.New(rand.NewSource(42))
	builtinValues := make([]float64, SampleSize)
	for i := range builtinValues {
		builtinValues[i] = rng.Float64()
	}

	// ── Теоретические значения для U[0, 1] ──────────────────────────────────
	theoretical := TheoreticalStats{
		Mean:     0.5,
		Variance: 1.0 / 12.0,
		StdDev:   math.Sqrt(1.0 / 12.0),
	}

	mcgStats := computeStats(mcgValues)
	mcgStats.FirstValues = mcgValues[:min(FirstN, len(mcgValues))]
	mcgStats.DegeneratedAt = -1

	msStats := computeStats(msValues)
	msStats.FirstValues = msValues[:min(FirstN, len(msValues))]
	msStats.DegeneratedAt = findDegenerationIndex(msValues)
	if msStats.DegeneratedAt >= 0 {
		// Возвращаем до 9 значений перед вырождением + само вырожденное (10 итого)
		start := max(0, msStats.DegeneratedAt-9)
		end := min(msStats.DegeneratedAt+1, len(msValues))
		msStats.TransitionSample = msValues[start:end]
	}

	builtinStats := computeStats(builtinValues)
	builtinStats.FirstValues = builtinValues[:min(FirstN, len(builtinValues))]
	builtinStats.DegeneratedAt = -1

	// ── Генерация выборки методом середины квадрата + Вейль (MSWS) ───────────
	mswGen := NewMiddleSquareWeyl(MSWSeed)
	mswValues := make([]float64, SampleSize)
	for i := range mswValues {
		mswValues[i] = mswGen.Next()
	}
	mswStats := computeStats(mswValues)
	mswStats.FirstValues = mswValues[:min(FirstN, len(mswValues))]
	mswStats.DegeneratedAt = findDegenerationIndex(mswValues)

	resp := Response{
		SampleSize:       SampleSize,
		MCG:              mcgStats,
		MiddleSquare:     msStats,
		MiddleSquareWeyl: mswStats,
		Builtin:          builtinStats,
		Theoretical:      theoretical,
	}
	resp.MCGParams.Beta = MCGBeta
	resp.MCGParams.M = MCGM
	resp.MCGParams.Seed = MCGSeed
	resp.MSParams.Seed = MSSeed
	resp.MSParams.Digits = MSDigits
	resp.MSWParams.Seed = MSWSeed
	resp.MSWParams.S = MSWSS

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("Ошибка кодирования JSON: %v", err)
	}
}

// ─── Точка входа ────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/generate", handleGenerate)

	addr := ":8080"
	log.Printf("Сервер запущен на http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}
