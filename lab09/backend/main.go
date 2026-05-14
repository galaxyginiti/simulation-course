// Лабораторная работа №9: Система массового обслуживания M/M/1/1
//
// Параметры:
//   λ — интенсивность входного потока (заявки/ед. вр.)
//   μ — интенсивность обслуживания (заявки/ед. вр.)
//   ρ = λ/μ — предложенная нагрузка
//
// Алгоритм event-driven симуляции:
//   Два типа событий: Arrival (поступление) и Departure (окончание обслуживания)
//   Очередь событий — min-heap по времени.
//
//   При Arrival (время t):
//     ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ 1 ✦
//     U₁ ~ U(0,1) → следующее поступление: t + (−ln U₁)/λ
//     Если сервер свободен → начало обслуживания:
//       ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ 2 ✦
//       U₂ ~ U(0,1) → время обслуживания s = (−ln U₂)/μ ~ Exp(μ)
//     Иначе → ОТКАЗ (ёмкость системы = 1, очереди нет).
//
//   При Departure:
//     Освобождение сервера.
//
// Теоретические формулы M/M/1/1 (формула Эрланга-B при c=1):
//   P₀  = 1 / (1 + ρ)       — вероятность простоя
//   P₁  = ρ / (1 + ρ)       — вероятность занятости (= вероятность отказа)
//   L   = P₁ = ρ/(1+ρ)      — среднее число заявок в системе
//   W   = 1/μ               — среднее время обслуживания
//   λ_ef = λ · P₀            — эффективная интенсивность

package main

import (
	"container/heap"
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"strconv"
)

const (
	defaultLambda = 3.0
	defaultMu     = 5.0
	defaultT      = 500.0
)

// ─── Очередь событий (min-heap по времени) ────────────────────────────────────

type EventType int

const (
	Arrival   EventType = 0
	Departure EventType = 1
)

type Event struct {
	Time       float64
	Type       EventType
	CustomerID int
}

type EventHeap []*Event

func (h EventHeap) Len() int            { return len(h) }
func (h EventHeap) Less(i, j int) bool  { return h[i].Time < h[j].Time }
func (h EventHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *EventHeap) Push(x interface{}) { *h = append(*h, x.(*Event)) }
func (h *EventHeap) Pop() interface{} {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}

// ─── Структуры данных ─────────────────────────────────────────────────────────

// type QueuePoint struct {
// 	Time   float64 `json:"time"`
// 	QLen   int     `json:"qLen"`   // в очереди (без обслуживаемого)
// 	NInSys int     `json:"nInSys"` // всего в системе
// }

type ProbPoint struct {
	N    int     `json:"n"`
	Emp  float64 `json:"emp"`
	Theo float64 `json:"theo"`
}

type WaitBin struct {
	Lo    float64 `json:"lo"`
	Hi    float64 `json:"hi"`
	Count int     `json:"count"`
	Freq  float64 `json:"freq"`
}

type SimResponse struct {
	// Распределение вероятностей P(N=k)
	ProbDist []ProbPoint `json:"probDist"`

	// Параметры
	Lambda    float64 `json:"lambda"`
	Mu        float64 `json:"mu"`
	Rho       float64 `json:"rho"` // ρ = λ/μ
	TotalTime float64 `json:"totalTime"`

	// Счётчики
	TotalArrived  int `json:"totalArrived"`
	TotalServed   int `json:"totalServed"`
	TotalRejected int `json:"totalRejected"`

	// Эмпирические характеристики
	EmpL           float64 `json:"empL"`           // среднее в системе
	EmpW           float64 `json:"empW"`           // среднее время обслуживания
	EmpUtilization float64 `json:"empUtilization"` // загрузка сервера = P₁
	EmpLossProb    float64 `json:"empLossProb"`    // вероятность отказа

	// Теоретические характеристики M/M/1/1
	TheoP0       float64 `json:"theoP0"`
	TheoP1       float64 `json:"theoP1"`
	TheoL        float64 `json:"theoL"`
	TheoW        float64 `json:"theoW"`
	TheoLambdaEf float64 `json:"theoLambdaEf"` // эффективная интенсивность
}

// ─── Экспоненциальная случайная величина ─────────────────────────────────────

func expRand(rng *rand.Rand, rate float64) float64 {
	u := rng.Float64()
	if u == 0 {
		u = 1e-300
	}
	return -math.Log(u) / rate
}

// ─── Построение гистограммы ───────────────────────────────────────────────────

func buildHistogram(values []float64, bins int) []WaitBin {
	if len(values) == 0 {
		return nil
	}
	minV, maxV := math.MaxFloat64, -math.MaxFloat64
	for _, v := range values {
		if v < minV {
			minV = v
		}
		if v > maxV {
			maxV = v
		}
	}
	if maxV <= minV {
		maxV = minV + 1
	}
	width := (maxV - minV) / float64(bins)
	counts := make([]int, bins)
	for _, v := range values {
		idx := int((v - minV) / width)
		if idx >= bins {
			idx = bins - 1
		}
		counts[idx]++
	}
	hist := make([]WaitBin, bins)
	for i := 0; i < bins; i++ {
		hist[i] = WaitBin{
			Lo:    minV + float64(i)*width,
			Hi:    minV + float64(i+1)*width,
			Count: counts[i],
			Freq:  float64(counts[i]) / float64(len(values)),
		}
	}
	return hist
}

// ─── Симуляция M/M/1/1 ───────────────────────────────────────────────────────

func simulate(rng *rand.Rand, lambda, mu, totalTime float64) SimResponse {
	rho := lambda / mu

	eh := &EventHeap{}
	heap.Init(eh)

	// Первое поступление
	heap.Push(eh, &Event{
		Time:       expRand(rng, lambda),
		Type:       Arrival,
		CustomerID: 1,
	})

	customerID := 1
	serverFree := true

	stateTime := map[int]float64{}

	var areaInSys, areaServerBusy float64
	prevTime := 0.0
	nInSys := 0
	totalArrived, totalServed, totalRejected := 0, 0, 0

	var sumSvcTime float64

	for eh.Len() > 0 {
		evt := heap.Pop(eh).(*Event)
		t := evt.Time
		if t > totalTime {
			break
		}

		// Накапливаем площади
		dt := t - prevTime
		areaInSys += float64(nInSys) * dt
		stateTime[nInSys] += dt
		if !serverFree {
			areaServerBusy += dt
		}
		prevTime = t

		switch evt.Type {
		case Arrival:
			totalArrived++

			if serverFree {
				// Принимаем заявку
				nInSys = 1
				serverFree = false
				svcTime := expRand(rng, mu)
				sumSvcTime += svcTime
				heap.Push(eh, &Event{
					Time:       t + svcTime,
					Type:       Departure,
					CustomerID: evt.CustomerID,
				})
			} else {
				// Отказ — прибор занят, очереди нет
				totalRejected++
			}

			// Следующее поступление
			customerID++
			heap.Push(eh, &Event{
				Time:       t + expRand(rng, lambda),
				Type:       Arrival,
				CustomerID: customerID,
			})

		case Departure:
			nInSys = 0
			serverFree = true
			totalServed++
		}
	}

	// Финальная интеграция
	dt := totalTime - prevTime
	areaInSys += float64(nInSys) * dt
	stateTime[nInSys] += dt
	if !serverFree {
		areaServerBusy += dt
	}

	empL := areaInSys / totalTime
	empUtil := areaServerBusy / totalTime

	empW := 0.0
	if totalServed > 0 {
		empW = sumSvcTime / float64(totalServed)
	}

	empLossProb := 0.0
	if totalArrived > 0 {
		empLossProb = float64(totalRejected) / float64(totalArrived)
	}

	// Теория M/M/1/1
	theoP0 := 1.0 / (1.0 + rho)
	theoP1 := rho / (1.0 + rho)
	theoL := theoP1
	theoW := 1.0 / mu
	theoLambdaEf := lambda * theoP0

	// Распределение вероятностей P(N=k): только k=0 и k=1
	probDist := []ProbPoint{
		{N: 0, Emp: stateTime[0] / totalTime, Theo: theoP0},
		{N: 1, Emp: stateTime[1] / totalTime, Theo: theoP1},
	}

	return SimResponse{
		ProbDist:     probDist,
		Lambda:       lambda,
		Mu:           mu,
		Rho:          rho,
		TotalTime:    totalTime,
		TotalArrived: totalArrived,
		TotalServed:  totalServed,
		TotalRejected: totalRejected,
		EmpL:          empL,
		EmpW:          empW,
		EmpUtilization: empUtil,
		EmpLossProb:   empLossProb,
		TheoP0:        theoP0,
		TheoP1:        theoP1,
		TheoL:         theoL,
		TheoW:         theoW,
		TheoLambdaEf:  theoLambdaEf,
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
	parseF := func(key string, def float64) float64 {
		if v := q.Get(key); v != "" {
			if p, err := strconv.ParseFloat(v, 64); err == nil && p > 0 {
				return p
			}
		}
		return def
	}

	lambda := parseF("lambda", defaultLambda)
	mu := parseF("mu", defaultMu)
	T := parseF("t", defaultT)
	if T > 1000000 {
		T = 1000000
	}

	rng := rand.New(rand.NewSource(42))
	result := simulate(rng, lambda, mu, T)

	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("encode error: %v", err)
	}
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/simulate", handleSimulate)

	addr := ":8089"
	log.Printf("Лаб. №9 — M/M/1, сервер: http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка: %v", err)
	}
}
