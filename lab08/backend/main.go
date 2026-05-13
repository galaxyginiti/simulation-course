// Лабораторная работа №8: Пуассоновский поток — события на сервере
//
// Пуассоновский поток с интенсивностью λ:
//   Интервалы между заявками: τ_k ~ Exp(λ)
//   Число заявок за время T:  N(T) ~ Poisson(λT)
//
// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
//   U ~ U(0,1) → τ = −ln(U) / λ  (инверсный метод для Exp(λ))
//
// Теоретические характеристики:
//   E[N(T)] = λT
//   Var[N(T)] = λT
//   P(N=k) = (λT)^k · e^(−λT) / k!
//
// Критерий χ²:
//   H₀: N(T) ~ Poisson(λT)
//   χ² = Σ (O_k − E_k)² / E_k,  ν = #{бинов} − 1

package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"strconv"
)

const defaultLambda = 5.0
const defaultT = 10.0
const defaultN = 1000

// ─── Структуры данных ─────────────────────────────────────────────────────────

type HistBin struct {
	K        int     `json:"k"`
	Count    int     `json:"count"`
	EmpFreq  float64 `json:"empFreq"`  // эмпирическая вероятность
	TheoProb float64 `json:"theoProb"` // теоретическая P(N=k)
	TheoFreq float64 `json:"theoFreq"` // ожидаемая частота = theoProb * N
}

type SimResponse struct {
	// Одна реализация (для визуализации)
	Arrivals []float64 `json:"arrivals"` // моменты поступления заявок в [0,T]

	// N реализаций: первые 200 — для графика рассеяния
	CountsSample []int `json:"countsSample"`

	// Гистограмма числа заявок
	Histogram []HistBin `json:"histogram"`

	// Статистики
	EmpMean      float64 `json:"empMean"`
	EmpVariance  float64 `json:"empVariance"`
	TheoMean     float64 `json:"theoMean"`     // = λT
	TheoVariance float64 `json:"theoVariance"` // = λT

	Lambda       float64 `json:"lambda"`
	T            float64 `json:"t"`
	Realizations int     `json:"realizations"`

	// χ²-критерий
	Chi2     float64 `json:"chi2"`
	Chi2Crit float64 `json:"chi2Crit"`
	Chi2Pass bool    `json:"chi2Pass"`
	Chi2DF   int     `json:"chi2DF"`
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

// poissonProb вычисляет P(X=k) для Poisson(mu).
func poissonProb(k int, mu float64) float64 {
	if mu <= 0 {
		if k == 0 {
			return 1.0
		}
		return 0.0
	}
	// Логарифмическое вычисление для устойчивости
	logP := float64(k)*math.Log(mu) - mu - logFact(k)
	return math.Exp(logP)
}

func logFact(n int) float64 {
	res := 0.0
	for i := 2; i <= n; i++ {
		res += math.Log(float64(i))
	}
	return res
}

// chi2Critical возвращает табличное значение χ²_{α=0.05} для заданного df.
func chi2Critical(df int) float64 {
	table := []float64{
		3.841, 5.991, 7.815, 9.488, 11.070,
		12.592, 14.067, 15.507, 16.919, 18.307,
		19.675, 21.026, 22.362, 23.685, 24.996,
		26.296, 27.587, 28.869, 30.144, 31.410,
	}
	if df >= 1 && df <= len(table) {
		return table[df-1]
	}
	// Приближение Фишера для большого df
	return float64(df) * math.Pow(1.0+1.645*math.Sqrt(2.0/float64(df))/3.0, 3)
}

// ─── Генерация пуассоновского потока ─────────────────────────────────────────

// generateArrivals генерирует моменты поступления заявок в [0, T].
func generateArrivals(rng *rand.Rand, lambda, T float64) []float64 {
	var arrivals []float64
	t := 0.0
	for {
		// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
		// U ~ U(0,1), τ = −ln(U)/λ ~ Exp(λ)
		u := rng.Float64()
		if u == 0 {
			u = 1e-300
		}
		t += -math.Log(u) / lambda
		if t > T {
			break
		}
		arrivals = append(arrivals, t)
	}
	return arrivals
}

// ─── Симуляция ────────────────────────────────────────────────────────────────

func simulate(rng *rand.Rand, lambda, T float64, realizations int) SimResponse {
	mu := lambda * T // параметр Пуассона

	// Одна реализация — для временно́й шкалы
	arrivals := generateArrivals(rng, lambda, T)

	// N реализаций
	counts := make([]int, realizations)
	for i := 0; i < realizations; i++ {
		counts[i] = len(generateArrivals(rng, lambda, T))
	}

	// Вычисляем эмпирические среднее и дисперсию
	sum := 0.0
	for _, c := range counts {
		sum += float64(c)
	}
	empMean := sum / float64(realizations)

	sumSq := 0.0
	for _, c := range counts {
		d := float64(c) - empMean
		sumSq += d * d
	}
	empVar := sumSq / float64(realizations)

	// Строим гистограмму
	maxK := 0
	for _, c := range counts {
		if c > maxK {
			maxK = c
		}
	}
	freq := make([]int, maxK+1)
	for _, c := range counts {
		freq[c]++
	}

	histogram := make([]HistBin, maxK+1)
	for k := 0; k <= maxK; k++ {
		histogram[k] = HistBin{
			K:        k,
			Count:    freq[k],
			EmpFreq:  float64(freq[k]) / float64(realizations),
			TheoProb: poissonProb(k, mu),
			TheoFreq: poissonProb(k, mu) * float64(realizations),
		}
	}

	// χ²-критерий: объединяем бины с E_k < 5
	type bin struct{ obs, exp float64 }
	var merged []bin
	curObs, curExp := 0.0, 0.0
	for k := 0; k <= maxK; k++ {
		curObs += float64(freq[k])
		curExp += poissonProb(k, mu) * float64(realizations)
		if curExp >= 5.0 {
			merged = append(merged, bin{curObs, curExp})
			curObs, curExp = 0, 0
		}
	}
	if curObs > 0 || curExp > 0 {
		if len(merged) > 0 {
			merged[len(merged)-1].obs += curObs
			merged[len(merged)-1].exp += curExp
		} else {
			merged = append(merged, bin{curObs, curExp})
		}
	}
	chi2 := 0.0
	for _, b := range merged {
		if b.exp > 0 {
			d := b.obs - b.exp
			chi2 += d * d / b.exp
		}
	}
	df := len(merged) - 1 // λ задан заранее, поэтому вычитаем только 1
	if df < 1 {
		df = 1
	}
	chi2Crit := chi2Critical(df)

	// Срезаем для отображения
	sampleSize := 200
	if len(counts) < sampleSize {
		sampleSize = len(counts)
	}

	return SimResponse{
		Arrivals:     arrivals,
		CountsSample: counts[:sampleSize],
		Histogram:    histogram,
		EmpMean:      empMean,
		EmpVariance:  empVar,
		TheoMean:     mu,
		TheoVariance: mu,
		Lambda:       lambda,
		T:            T,
		Realizations: realizations,
		Chi2:         chi2,
		Chi2Crit:     chi2Crit,
		Chi2Pass:     chi2 < chi2Crit,
		Chi2DF:       df,
	}
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

	q := r.URL.Query()

	lambda := defaultLambda
	if v := q.Get("lambda"); v != "" {
		if p, err := strconv.ParseFloat(v, 64); err == nil && p > 0 && p <= 1000 {
			lambda = p
		}
	}
	T := defaultT
	if v := q.Get("t"); v != "" {
		if p, err := strconv.ParseFloat(v, 64); err == nil && p > 0 && p <= 10000 {
			T = p
		}
	}
	realizations := defaultN
	if v := q.Get("n"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 && p <= 100000 {
			realizations = p
		}
	}

	rng := rand.New(rand.NewSource(42))
	result := simulate(rng, lambda, T, realizations)

	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("encode error: %v", err)
	}
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/simulate", handleSimulate)

	addr := ":8088"
	log.Printf("Лаб. №8 — Пуассоновский поток, сервер: http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка: %v", err)
	}
}
