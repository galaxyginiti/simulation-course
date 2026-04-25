// Лабораторная работа №7: Марковская модель погоды
//
// Непрерывная цепь Маркова (CTMC) с 3 состояниями:
//   1 — ясно, 2 — облачно, 3 — пасмурно
//
// Матрица интенсивностей (генератор) Q:
//   Q[i][j] = λ_ij (i≠j) — интенсивность перехода из состояния i в состояние j
//   Q[i][i] = −Σ_{j≠i} λ_ij — суммарная интенсивность исходов из i
//
// Алгоритм Гиллеспи (прямой алгоритм симуляции CTMC):
//   Находясь в состоянии i:
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ 1 ✦
//     U₁ ~ U(0,1), время пребывания T = −ln(U₁) / |Q[i][i]| ~ Exp(|Q[i][i]|)
//
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ 2 ✦
//     U₂ ~ U(0,1), следующее состояние j выбирается инверсным методом:
//     P(перейти в j) = λ_ij / |Q[i][i]|
//
// Стационарное распределение π:
//   π·Q = 0,  Σπ_i = 1
//   Решается методом Гаусса с частичным выбором главного элемента.
//
// Статистический критерий:
//   χ² = Σ (t_i − T·π_i)² / (T·π_i), df = 2, α = 0.05
//   t_i — время в состоянии i, T — общее время моделирования
//
// API:
//   GET /api/simulate?l12=0.5&l13=0.2&l21=0.4&l23=0.3&l31=0.1&l32=0.5&days=60

package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"strconv"
)

// ─── Параметры по умолчанию ────────────────────────────────────────────────────

// Индексы: 0=ясно, 1=облачно, 2=пасмурно
var defaultRates = [3][3]float64{
	{0, 0.5, 0.2}, // из «ясно»:     λ12=0.5, λ13=0.2
	{0.4, 0, 0.3}, // из «облачно»:  λ21=0.4, λ23=0.3
	{0.1, 0.5, 0}, // из «пасмурно»: λ31=0.1, λ32=0.5
}

const defaultDays = 60.0

// ─── Структуры данных ─────────────────────────────────────────────────────────

// Transition — один интервал пребывания в состоянии (до следующего перехода).
type Transition struct {
	State     int     `json:"state"`     // 1, 2 или 3
	EnterTime float64 `json:"enterTime"` // время входа в состояние (дни)
	ExitTime  float64 `json:"exitTime"`  // время выхода из состояния (дни)
	Duration  float64 `json:"duration"`  // длительность пребывания (дни)
}

// SimResponse — полный ответ API.
type SimResponse struct {
	Transitions   []Transition  `json:"transitions"`
	TotalTime     float64       `json:"totalTime"`
	EmpPi         [3]float64    `json:"empPi"`         // эмпирическое стационарное (по времени)
	TheoPi        [3]float64    `json:"theoPi"`        // теоретическое стационарное
	TimeInState   [3]float64    `json:"timeInState"`   // суммарное время в каждом состоянии
	VisitsToState [3]int        `json:"visitsToState"` // число визитов в каждое состояние
	AvgDuration   [3]float64    `json:"avgDuration"`   // средняя длительность пребывания
	TheoAvgDur    [3]float64    `json:"theoAvgDur"`    // теоретическая средняя длительность 1/|Q[i][i]|
	Generator     [3][3]float64 `json:"generator"`     // матрица-генератор Q
	Rates         [3][3]float64 `json:"rates"`         // интенсивности λ_ij
	Chi2          float64       `json:"chi2"`
	Chi2Crit      float64       `json:"chi2Crit"` // df=2, α=0.05 → 5.991
	Chi2Pass      bool          `json:"chi2Pass"`
}

// ─── Вычисление стационарного распределения ───────────────────────────────────

// stationaryDist решает систему π·Q = 0, Σπ_i = 1 методом Гаусса.
// Первые два уравнения берутся из π·Q = 0 (столбцы 0 и 1), третье — нормировка.
func stationaryDist(q [3][3]float64) [3]float64 {
	// a — расширенная матрица [A|b] размером 3×4
	// Уравнение j: Σ_i π_i·Q[i][j] = 0 → j-й столбец Q задаёт коэффициенты
	var a [3][4]float64
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			a[i][j] = q[j][i] // транспонирование: строка i = столбец i матрицы Q
		}
		a[i][3] = 0
	}
	// Заменяем третье уравнение нормировкой: π0 + π1 + π2 = 1
	a[2][0], a[2][1], a[2][2], a[2][3] = 1, 1, 1, 1

	// Прямой ход Гаусса с частичным выбором главного элемента
	for col := 0; col < 3; col++ {
		maxRow := col
		for row := col + 1; row < 3; row++ {
			if math.Abs(a[row][col]) > math.Abs(a[maxRow][col]) {
				maxRow = row
			}
		}
		a[col], a[maxRow] = a[maxRow], a[col]
		if math.Abs(a[col][col]) < 1e-14 {
			continue
		}
		for row := col + 1; row < 3; row++ {
			f := a[row][col] / a[col][col]
			for j := col; j <= 3; j++ {
				a[row][j] -= f * a[col][j]
			}
		}
	}

	// Обратный ход
	var pi [3]float64
	for i := 2; i >= 0; i-- {
		pi[i] = a[i][3]
		for j := i + 1; j < 3; j++ {
			pi[i] -= a[i][j] * pi[j]
		}
		if math.Abs(a[i][i]) > 1e-14 {
			pi[i] /= a[i][i]
		}
	}
	return pi
}

// ─── Симуляция CTMC алгоритмом Гиллеспи ──────────────────────────────────────

func simulate(rng *rand.Rand, rates [3][3]float64, totalDays float64) SimResponse {
	// Строим матрицу-генератор Q
	var q [3][3]float64
	for i := 0; i < 3; i++ {
		var sum float64
		for j := 0; j < 3; j++ {
			if i != j {
				q[i][j] = rates[i][j]
				sum += rates[i][j]
			}
		}
		q[i][i] = -sum
	}

	// Теоретические средние длительности пребывания: 1/|Q[i][i]|
	var theoAvgDur [3]float64
	for i := 0; i < 3; i++ {
		if math.Abs(q[i][i]) > 1e-14 {
			theoAvgDur[i] = 1.0 / math.Abs(q[i][i])
		}
	}

	// Симуляция
	state := 0 // начинаем с состояния «ясно» (индекс 0)
	currentTime := 0.0
	var transitions []Transition
	var timeInState [3]float64
	var visitsToState [3]int

	for currentTime < totalDays {
		lambda := -q[state][state] // суммарная интенсивность исходов
		if lambda < 1e-14 {
			break
		}

		// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ 1 ✦
		// U₁ ~ U(0,1) → время пребывания T = −ln(U₁) / λ ~ Exp(λ)
		u1 := rng.Float64()
		if u1 == 0 {
			u1 = 1e-300
		}
		sojourn := -math.Log(u1) / lambda
		exitTime := currentTime + sojourn
		if exitTime > totalDays {
			exitTime = totalDays
		}

		dur := exitTime - currentTime
		transitions = append(transitions, Transition{
			State:     state + 1, // 1-based
			EnterTime: currentTime,
			ExitTime:  exitTime,
			Duration:  dur,
		})
		timeInState[state] += dur
		visitsToState[state]++

		if exitTime >= totalDays {
			break
		}

		// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ 2 ✦
		// U₂ ~ U(0,1) → следующее состояние инверсным методом
		// P(переход в j) = λ_ij / λ
		u2 := rng.Float64()
		cumulative := 0.0
		nextState := -1
		for j := 0; j < 3; j++ {
			if j == state {
				continue
			}
			cumulative += rates[state][j] / lambda
			if u2 < cumulative {
				nextState = j
				break
			}
		}
		if nextState < 0 {
			// Защита от ошибок округления: берём последний ненулевой
			for j := 2; j >= 0; j-- {
				if j != state && rates[state][j] > 0 {
					nextState = j
					break
				}
			}
		}
		if nextState < 0 {
			break
		}

		state = nextState
		currentTime = exitTime
	}

	// Эмпирическое стационарное распределение (по времени)
	var empPi [3]float64
	for i := 0; i < 3; i++ {
		empPi[i] = timeInState[i] / totalDays
	}

	// Теоретическое стационарное распределение
	theoPi := stationaryDist(q)

	// Средняя длительность пребывания по данным
	var avgDur [3]float64
	for i := 0; i < 3; i++ {
		if visitsToState[i] > 0 {
			avgDur[i] = timeInState[i] / float64(visitsToState[i])
		}
	}

	// Критерий χ²: сравниваем фактическое время в состоянии с ожидаемым
	// O_i = timeInState[i], E_i = theoPi[i] * totalDays, df = 2, α = 0.05
	chi2 := 0.0
	for i := 0; i < 3; i++ {
		expected := theoPi[i] * totalDays
		if expected > 1e-10 {
			d := timeInState[i] - expected
			chi2 += d * d / expected
		}
	}
	const chi2Crit = 5.991 // df=2, α=0.05

	return SimResponse{
		Transitions:   transitions,
		TotalTime:     totalDays,
		EmpPi:         empPi,
		TheoPi:        theoPi,
		TimeInState:   timeInState,
		VisitsToState: visitsToState,
		AvgDuration:   avgDur,
		TheoAvgDur:    theoAvgDur,
		Generator:     q,
		Rates:         rates,
		Chi2:          chi2,
		Chi2Crit:      chi2Crit,
		Chi2Pass:      chi2 < chi2Crit,
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
	parseRate := func(key string, def float64) float64 {
		if v := q.Get(key); v != "" {
			if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed >= 0 {
				return parsed
			}
		}
		return def
	}

	rates := [3][3]float64{
		{0, parseRate("l12", defaultRates[0][1]), parseRate("l13", defaultRates[0][2])},
		{parseRate("l21", defaultRates[1][0]), 0, parseRate("l23", defaultRates[1][2])},
		{parseRate("l31", defaultRates[2][0]), parseRate("l32", defaultRates[2][1]), 0},
	}

	days := defaultDays
	if v := q.Get("days"); v != "" {
		if parsed, err := strconv.ParseFloat(v, 64); err == nil && parsed > 0 && parsed <= 3650 {
			days = parsed
		}
	}

	rng := rand.New(rand.NewSource(42))
	result := simulate(rng, rates, days)

	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("encode error: %v", err)
	}
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/simulate", handleSimulate)

	addr := ":8087"
	log.Printf("Лаб. №7 — Марковская модель погоды, сервер: http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка: %v", err)
	}
}
