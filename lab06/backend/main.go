// Лабораторная работа №6: Имитационное моделирование дискретных случайных величин
//
// Часть 1 — Дискретная СВ, заданная рядом распределения {xi, pi}
//   Метод обратной функции (инверсный метод):
//     1. Генерируем α ~ U[0, 1) — базовый датчик.
//
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
//     α — вещественное число (float64) из [0, 1).
//     2. Строим CDF: F(xk) = p1 + p2 + … + pk.
//     3. X = xk, если F(xk-1) ≤ α < F(xk).
//
//   Вычисляем:
//     - эмпирические вероятности P̂(X=xi) = ni / N
//     - выборочные среднее x̄ и дисперсию s²
//     - статистику χ² = Σ (Oi - Ei)² / Ei, где Ei = N·pi
//     - критерий χ² при df = k-1 и α=0.05
//   при N = 10, 100, 1000, 10000.
//
// Часть 2 — Нормальная СВ X ~ N(μ, σ²) методом Бокса — Мюллера:
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
//     α1, α2 ~ U[0, 1) — два независимых числа.
//     Z1 = √(-2 ln α1) · cos(2π α2)  → Z1 ~ N(0, 1)
//     Z2 = √(-2 ln α1) · sin(2π α2)  → Z2 ~ N(0, 1)
//     X  = μ + σ·Z                    → X  ~ N(μ, σ²)  ← пользователь задаёт μ и σ²
//
// API:
//   GET /api/simulate → полный ответ: дискретная + нормальная СВ

package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"strconv"
)

// ─── Распределение задания ────────────────────────────────────────────────────
// X ∈ {1, 2, 3, 4, 5}  с вероятностями {0.1, 0.2, 0.4, 0.2, 0.1}
// E[X]  = 3.0
// E[X²] = 10.2  → D[X] = 10.2 − 9.0 = 1.2
// σ[X]  = √1.2 ≈ 1.095

var (
	distValues = []float64{1, 2, 3, 4, 5}
	distProbs  = []float64{0.1, 0.2, 0.4, 0.2, 0.1}
)

const (
	theoMean = 3.0
	theoVar  = 1.2

	// Критические значения χ² для уровня значимости α=0.05, df = 1..10
	// Источник: таблица χ²-распределения
)

var chi2Crit005 = []float64{
	0,     // df=0 (не используется)
	3.841, // df=1
	5.991, // df=2
	7.815, // df=3
	9.488, // df=4
	11.070, 12.592, 14.067, 15.507, 16.919, 18.307,
}

// ─── Структуры ────────────────────────────────────────────────────────────────

type DistItem struct {
	X float64 `json:"x"`
	P float64 `json:"p"`
}

type DiscreteResult struct {
	N        int       `json:"n"`
	Observed []float64 `json:"observed"` // наблюдаемые частоты  Oi
	Expected []float64 `json:"expected"` // ожидаемые частоты    Ei = N·pi
	EmpProbs []float64 `json:"empProbs"` // Oi/N
	EmpMean  float64   `json:"empMean"`
	EmpVar   float64   `json:"empVar"`
	Chi2     float64   `json:"chi2"`
	Chi2Crit float64   `json:"chi2Crit"`
	Chi2Df   int       `json:"chi2Df"`
	Chi2Pass bool      `json:"chi2Pass"` // true если χ² < χ²_крит (H0 не отвергается)
}

type NormalBin struct {
	From float64 `json:"from"` // левая граница интервала
	To   float64 `json:"to"`   // правая граница
	Freq float64 `json:"freq"` // относительная частота / ширина (≈ плотность по данным)
	Dens float64 `json:"dens"` // теоретическая плотность N(0,1) в середине интервала
	Mid  float64 `json:"mid"`  // середина интервала (для оси X)
}

type NormalResult struct {
	N         int         `json:"n"`
	// ─── Часть 2: параметры N(μ, σ²), задаваемые пользователем ───
	TheoMean  float64     `json:"theoMean"`  // μ — заданное матожидание
	TheoVar   float64     `json:"theoVar"`   // σ² — заданная дисперсия
	// ─────────────────────────────────────────────────────────────
	EmpMean   float64     `json:"empMean"`
	EmpStdDev float64     `json:"empStdDev"`
	Histogram []NormalBin `json:"histogram"`
}

type SimResponse struct {
	Distribution    []DistItem       `json:"distribution"`
	TheoMean        float64          `json:"theoMean"`
	TheoVar         float64          `json:"theoVar"`
	DiscreteResults []DiscreteResult `json:"discreteResults"`
	NormalResults   []NormalResult   `json:"normalResults"`
	// ─── Часть 2: параметры N(μ, σ²), переданные пользователем ───
	NormalMean      float64          `json:"normalMean"`  // μ
	NormalVar       float64          `json:"normalVar"`   // σ²
	// ──────────────────────────────────────────────────────────────
}

// ─── Алгоритмы ────────────────────────────────────────────────────────────────

// sampleDiscrete реализует инверсный метод для дискретной СВ.
func sampleDiscrete(rng *rand.Rand) float64 {
	// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
	// α — вещественное число (float64) из [0, 1).
	// Пример: α = 0.351…
	// CDF: F(1)=0.1, F(2)=0.3, F(3)=0.7, F(4)=0.9, F(5)=1.0
	// 0.3 ≤ 0.351 < 0.7  →  X = 3
	alpha := rng.Float64()
	cumulative := 0.0
	for i, p := range distProbs {
		cumulative += p
		if alpha < cumulative {
			return distValues[i]
		}
	}
	return distValues[len(distValues)-1]
}

func computeDiscrete(n int) DiscreteResult {
	rng := rand.New(rand.NewSource(42)) // фиксированное зерно для воспроизводимости
	k := len(distValues)
	counts := make([]int, k)
	sum, sumSq := 0.0, 0.0

	for i := 0; i < n; i++ {
		x := sampleDiscrete(rng)
		for j, v := range distValues {
			if x == v {
				counts[j]++
				break
			}
		}
		sum += x
		sumSq += x * x
	}

	fn := float64(n)
	empMean := sum / fn
	empVar := sumSq/fn - empMean*empMean

	observed := make([]float64, k)
	expected := make([]float64, k)
	empProbs := make([]float64, k)
	chi2 := 0.0
	for i := range distValues {
		observed[i] = float64(counts[i])
		expected[i] = fn * distProbs[i]
		empProbs[i] = observed[i] / fn
		if expected[i] > 0 {
			d := observed[i] - expected[i]
			chi2 += d * d / expected[i]
		}
	}

	df := k - 1
	crit := 0.0
	if df < len(chi2Crit005) {
		crit = chi2Crit005[df]
	}

	return DiscreteResult{
		N: n, Observed: observed, Expected: expected, EmpProbs: empProbs,
		EmpMean: empMean, EmpVar: empVar,
		Chi2: chi2, Chi2Crit: crit, Chi2Df: df, Chi2Pass: chi2 < crit,
	}
}

// normalPDF — плотность нормального N(μ, σ²) в точке x.
// ─── Часть 2: плотность вычисляется с учётом задаваемых μ и σ² ───
func normalPDF(x, mu, sigma float64) float64 {
	z := (x - mu) / sigma
	return math.Exp(-0.5*z*z) / (sigma * math.Sqrt(2*math.Pi))
}

// ─── Часть 2: mu — матожидание, variance — дисперсия, задаются пользователем ───
func computeNormal(n int, mu, variance float64) NormalResult {
	rng := rand.New(rand.NewSource(42))
	values := make([]float64, n)

	for i := 0; i < n; i += 2 {
		// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
		// α1, α2 — два вещественных числа (float64) из [0, 1).
		// Метод Бокса–Мюллера: из двух равномерных чисел получаем два нормальных.
		alpha1 := rng.Float64()
		if alpha1 == 0 {
			alpha1 = 1e-300
		}
		alpha2 := rng.Float64()
		mag := math.Sqrt(-2 * math.Log(alpha1))
		z1 := mag * math.Cos(2*math.Pi*alpha2)
		z2 := mag * math.Sin(2*math.Pi*alpha2)
		// ─── Часть 2: преобразование Z ~ N(0,1) → X ~ N(μ, σ²): X = μ + σ·Z ───
		sigma := math.Sqrt(variance)
		values[i] = mu + sigma*z1
		if i+1 < n {
			values[i+1] = mu + sigma*z2
		}
	}

	sum, sumSq := 0.0, 0.0
	for _, v := range values {
		sum += v
		sumSq += v * v
	}
	empMean := sum / float64(n)
	empStd := math.Sqrt(sumSq/float64(n) - empMean*empMean)

	// ─── Часть 2: гистограмма строится вокруг μ ± 4σ ───
	sigma := math.Sqrt(variance)
	binMin := mu - 4*sigma
	binMax := mu + 4*sigma
	binStep := (binMax - binMin) / 16.0
	nBins := 16
	bins := make([]NormalBin, nBins)
	for i := range bins {
		from := binMin + float64(i)*binStep
		to := from + binStep
		mid := (from + to) / 2
		// ─── Часть 2: плотность вычисляется для N(μ, σ²) ───
		bins[i] = NormalBin{From: from, To: to, Mid: mid, Dens: normalPDF(mid, mu, sigma)}
	}
	for _, v := range values {
		if v < binMin || v >= binMax {
			continue
		}
		idx := int((v - binMin) / binStep)
		if idx >= 0 && idx < nBins {
			bins[idx].Freq++
		}
	}
	for i := range bins {
		bins[i].Freq = bins[i].Freq / float64(n) / binStep // нормировка → плотность
	}

	return NormalResult{N: n, TheoMean: mu, TheoVar: variance, EmpMean: empMean, EmpStdDev: empStd, Histogram: bins}
}

// ─── HTTP-обработчик ─────────────────────────────────────────────────────────

func handleSimulate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// ─── Часть 2: читаем μ и σ² из query-параметров (?mean=0&variance=1) ───
	// По умолчанию: μ=0, σ²=1 (стандартное нормальное распределение)
	normalMean := 0.0
	normalVar := 1.0
	if v := r.URL.Query().Get("mean"); v != "" {
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			normalMean = parsed
		}
	}
	if v := r.URL.Query().Get("variance"); v != "" {
		if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed > 0 {
			normalVar = parsed
		}
	}
	// ──────────────────────────────────────────────────────────────────────────

	dist := make([]DistItem, len(distValues))
	for i := range distValues {
		dist[i] = DistItem{X: distValues[i], P: distProbs[i]}
	}

	discSizes := []int{10, 100, 1000, 10000}
	discResults := make([]DiscreteResult, len(discSizes))
	for i, n := range discSizes {
		discResults[i] = computeDiscrete(n)
	}

	normSizes := []int{100, 1000, 10000}
	normResults := make([]NormalResult, len(normSizes))
	for i, n := range normSizes {
		// ─── Часть 2: передаём μ и σ² в генератор ───
		normResults[i] = computeNormal(n, normalMean, normalVar)
	}

	json.NewEncoder(w).Encode(SimResponse{
		Distribution:    dist,
		TheoMean:        theoMean,
		TheoVar:         theoVar,
		DiscreteResults: discResults,
		NormalResults:   normResults,
		NormalMean:      normalMean,
		NormalVar:       normalVar,
	})
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/simulate", handleSimulate)

	addr := ":8086"
	log.Printf("Лаб. №6 — сервер запущен на http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка: %v", err)
	}
}
