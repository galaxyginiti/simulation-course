// Лабораторная работа №6: Имитационное моделирование дискретных случайных величин
//
// Часть 1 — Дискретная СВ, заданная рядом распределения {xi, pi}
//   Метод обратной функции (инверсный метод):
//     1. Генерируем α ~ U[0, 1) — базовый датчик.
//
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
//     α — вещественное число (float64) из [0, 1), НЕ процент.
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
// Часть 2 — Нормальная СВ X ~ N(0, 1) методом Бокса — Мюллера:
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
//     α1, α2 ~ U[0, 1) — два независимых числа, каждое НЕ процент.
//     Z1 = √(-2 ln α1) · cos(2π α2)  → Z1 ~ N(0, 1)
//     Z2 = √(-2 ln α1) · sin(2π α2)  → Z2 ~ N(0, 1)
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
}

// ─── Алгоритмы ────────────────────────────────────────────────────────────────

// sampleDiscrete реализует инверсный метод для дискретной СВ.
func sampleDiscrete(rng *rand.Rand) float64 {
	// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
	// α — вещественное число (float64) из [0, 1), НЕ процент.
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
	// Смещённая дисперсия (для наглядности при малых N)
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

// normalPDF — плотность стандартного нормального N(0,1).
func normalPDF(x float64) float64 {
	return math.Exp(-0.5*x*x) / math.Sqrt(2*math.Pi)
}

func computeNormal(n int) NormalResult {
	rng := rand.New(rand.NewSource(42))
	values := make([]float64, n)

	for i := 0; i < n; i += 2 {
		// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
		// α1, α2 — два вещественных числа (float64) из [0, 1), НЕ проценты.
		// Метод Бокса–Мюллера: из двух равномерных чисел получаем два нормальных.
		alpha1 := rng.Float64()
		if alpha1 == 0 {
			alpha1 = 1e-300 // защита от log(0)
		}
		alpha2 := rng.Float64()
		mag := math.Sqrt(-2 * math.Log(alpha1))
		z1 := mag * math.Cos(2*math.Pi*alpha2)
		z2 := mag * math.Sin(2*math.Pi*alpha2)
		values[i] = z1
		if i+1 < n {
			values[i+1] = z2
		}
	}

	sum, sumSq := 0.0, 0.0
	for _, v := range values {
		sum += v
		sumSq += v * v
	}
	empMean := sum / float64(n)
	empStd := math.Sqrt(sumSq/float64(n) - empMean*empMean)

	// Гистограмма от -4 до +4, шаг 0.5 (16 бинов)
	const binMin, binMax, binStep = -4.0, 4.0, 0.5
	nBins := int((binMax - binMin) / binStep)
	bins := make([]NormalBin, nBins)
	for i := range bins {
		from := binMin + float64(i)*binStep
		to := from + binStep
		mid := (from + to) / 2
		bins[i] = NormalBin{From: from, To: to, Mid: mid, Dens: normalPDF(mid)}
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

	return NormalResult{N: n, EmpMean: empMean, EmpStdDev: empStd, Histogram: bins}
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
		normResults[i] = computeNormal(n)
	}

	json.NewEncoder(w).Encode(SimResponse{
		Distribution:    dist,
		TheoMean:        theoMean,
		TheoVar:         theoVar,
		DiscreteResults: discResults,
		NormalResults:   normResults,
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
