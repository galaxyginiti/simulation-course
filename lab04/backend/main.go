// Лабораторная работа №4: Базовый датчик случайных чисел
//
// Реализует линейный конгруэнтный генератор (ЛКГ) и сравнивает его
// статистические характеристики (среднее, дисперсию, СКО) с встроенным
// генератором языка Go и теоретическими значениями для U[0,1].
//
// Метод: Линейный конгруэнтный метод (Park-Miller minimal standard)
//   Формула: X_{n+1} = (a · X_n) mod m
//   a = 16807  (= 7^5, множитель Парка-Миллера)
//   m = 2147483647  (= 2^31 − 1, простое число Мерсенна)
//
// Теоретические значения для равномерного распределения U[0, 1]:
//   Среднее   μ  = 0.5
//   Дисперсия σ² = 1/12 ≈ 0.08333…
//   СКО       σ  = 1/√12 ≈ 0.28868…

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
	SampleSize = 100_000 // Размер выборки
	NumBins    = 30      // Число столбцов гистограммы

	// Параметры ЛКГ (Park-Miller)
	LCGMultiplier = 16807      // Множитель a = 7^5
	LCGModulus    = 2147483647 // Модуль   m = 2^31 − 1
	LCGSeed       = 42         // Начальное зерно
)

// ─── ЛКГ — структура и методы ────────────────────────────────────────────────

// LCG — линейный конгруэнтный генератор псевдослучайных чисел.
// Использует мультипликативный вариант (c = 0) — генератор Парка-Миллера.
type LCG struct {
	state int64 // Текущее состояние генератора
}

// NewLCG создаёт ЛКГ с заданным начальным зерном seed ∈ [1, m-1].
func NewLCG(seed int64) *LCG {
	return &LCG{state: seed}
}

// Next возвращает следующее псевдослучайное число из интервала [0, 1).
// Вычисляет X_{n+1} = (a · X_n) mod m, затем нормирует на [0, 1).
func (g *LCG) Next() float64 {
	g.state = (LCGMultiplier * g.state) % LCGModulus
	return float64(g.state) / float64(LCGModulus)
}

// ─── Структуры ответа API ────────────────────────────────────────────────────

// HistogramBin — один столбец гистограммы.
type HistogramBin struct {
	Min   float64 `json:"min"`   // Левая граница интервала
	Max   float64 `json:"max"`   // Правая граница интервала
	Count int     `json:"count"` // Абсолютная частота
	Freq  float64 `json:"freq"`  // Относительная частота
}

// GeneratorStats — выборочные характеристики одного генератора.
type GeneratorStats struct {
	Mean      float64        `json:"mean"`      // Выборочное среднее
	Variance  float64        `json:"variance"`  // Выборочная дисперсия (несмещённая)
	StdDev    float64        `json:"stdDev"`    // Выборочное СКО
	Histogram []HistogramBin `json:"histogram"` // Гистограмма (NumBins столбцов)
}

// TheoreticalStats — точные теоретические значения для U[0, 1].
type TheoreticalStats struct {
	Mean     float64 `json:"mean"`     // 0.5
	Variance float64 `json:"variance"` // 1/12
	StdDev   float64 `json:"stdDev"`   // 1/√12
}

// Response — полный ответ эндпоинта /api/generate.
type Response struct {
	SampleSize  int              `json:"sampleSize"`
	LCG         GeneratorStats   `json:"lcg"`
	Builtin     GeneratorStats   `json:"builtin"`
	Theoretical TheoreticalStats `json:"theoretical"`
	LCGParams   struct {
		A    int64 `json:"a"`    // Множитель
		M    int64 `json:"m"`    // Модуль
		Seed int64 `json:"seed"` // Зерно
	} `json:"lcgParams"`
}

// ─── Вычисление статистик ────────────────────────────────────────────────────

// computeStats вычисляет выборочное среднее, несмещённую дисперсию, СКО
// и строит гистограмму из NumBins равных столбцов на [0, 1).
func computeStats(values []float64) GeneratorStats {
	n := float64(len(values))

	// Вычисляем выборочное среднее: m = (1/n) Σ x_i
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	mean := sum / n

	// Вычисляем несмещённую выборочную дисперсию: s² = (1/(n-1)) Σ (x_i − m)²
	sumSq := 0.0
	for _, v := range values {
		d := v - mean
		sumSq += d * d
	}
	variance := sumSq / (n - 1)
	stdDev := math.Sqrt(variance)

	// Строим гистограмму с равными интервалами на [0, 1)
	bins := make([]HistogramBin, NumBins)
	for i := range bins {
		bins[i].Min = float64(i) / float64(NumBins)
		bins[i].Max = float64(i+1) / float64(NumBins)
	}
	for _, v := range values {
		idx := int(v * float64(NumBins))
		if idx >= NumBins { // защита от v = 1.0 (хотя Next() возвращает [0,1))
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

// ─── HTTP-обработчики ────────────────────────────────────────────────────────

// handleGenerate генерирует выборку обоими генераторами и возвращает статистику.
func handleGenerate(w http.ResponseWriter, r *http.Request) {
	// CORS: позволяем запросы из любого источника (только для разработки)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// ── Генерация выборки ЛКГ ────────────────────────────────────────────────
	lcgGen := NewLCG(LCGSeed)
	lcgValues := make([]float64, SampleSize)
	for i := range lcgValues {
		lcgValues[i] = lcgGen.Next()
	}

	// ── Генерация выборки встроенного генератора Go ───────────────────────────
	// rand.NewSource + rand.New даёт детерминированный, но качественный ГПСЧ
	rng := rand.New(rand.NewSource(LCGSeed))
	builtinValues := make([]float64, SampleSize)
	for i := range builtinValues {
		builtinValues[i] = rng.Float64()
	}

	// ── Теоретические значения для U[0, 1] ───────────────────────────────────
	theoretical := TheoreticalStats{
		Mean:     0.5,
		Variance: 1.0 / 12.0,
		StdDev:   math.Sqrt(1.0 / 12.0),
	}

	resp := Response{
		SampleSize:  SampleSize,
		LCG:         computeStats(lcgValues),
		Builtin:     computeStats(builtinValues),
		Theoretical: theoretical,
	}
	resp.LCGParams.A = LCGMultiplier
	resp.LCGParams.M = LCGModulus
	resp.LCGParams.Seed = LCGSeed

	if err := json.NewEncoder(w).Encode(resp); err != nil {
		log.Printf("Ошибка кодирования JSON: %v", err)
	}
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/generate", handleGenerate)

	addr := ":8080"
	log.Printf("Сервер запущен на http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка запуска сервера: %v", err)
	}
}
