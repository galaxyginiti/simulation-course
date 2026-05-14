// Лабораторная работа №9: Система массового обслуживания M/M/1
//
// Параметры:
//   λ — интенсивность входного потока (заявки/ед. вр.)
//   μ — интенсивность обслуживания (заявки/ед. вр.)
//   ρ = λ/μ — коэффициент загрузки (ρ < 1 необходимо для устойчивости)
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
//     Иначе → заявка встаёт в очередь FCFS.
//
//   При Departure:
//     Освобождение сервера; если очередь непуста → обслуживаем следующую.
//
// Теоретические формулы M/M/1 (ρ < 1):
//   P₀  = 1 − ρ             — вероятность простоя
//   L   = ρ / (1 − ρ)       — среднее число заявок в системе
//   Lq  = ρ² / (1 − ρ)      — среднее число заявок в очереди
//   W   = 1 / (μ − λ)       — среднее время пребывания в системе
//   Wq  = ρ / (μ − λ)       — среднее время ожидания в очереди

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
	// // Динамика очереди (для графика)
	// QueueOverTime []QueuePoint `json:"queueOverTime"`

	// Распределение вероятностей P(N=k)
	ProbDist []ProbPoint `json:"probDist"`

	// Гистограммы
	// WaitHistogram    []WaitBin `json:"waitHistogram"`
	// SojournHistogram []WaitBin `json:"sojournHistogram"`

	// Параметры
	Lambda    float64 `json:"lambda"`
	Mu        float64 `json:"mu"`
	Rho       float64 `json:"rho"`
	TotalTime float64 `json:"totalTime"`

	// Счётчики
	TotalCustomers int `json:"totalCustomers"`

	// Эмпирические характеристики
	EmpL           float64 `json:"empL"`           // среднее в системе
	EmpLq          float64 `json:"empLq"`          // среднее в очереди
	EmpW           float64 `json:"empW"`           // среднее время в системе
	EmpWq          float64 `json:"empWq"`          // среднее время ожидания
	EmpUtilization float64 `json:"empUtilization"` // загрузка сервера

	// Теоретические характеристики M/M/1
	TheoP0 float64 `json:"theoP0"`
	TheoL  float64 `json:"theoL"`
	TheoLq float64 `json:"theoLq"`
	TheoW  float64 `json:"theoW"`
	TheoWq float64 `json:"theoWq"`
	Stable bool    `json:"stable"` // ρ < 1?
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

// ─── Симуляция M/M/1 ──────────────────────────────────────────────────────────

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
	var queue []int // CustomerID в очереди

	arrivalTime := map[int]float64{}
	serviceStart := map[int]float64{}

	// var queuePoints []QueuePoint
	var waitTimes []float64
	var sojournTimes []float64
	stateTime := map[int]float64{}

	// Интегрирование для L, Lq, загрузки
	var areaInSys, areaInQueue, areaServerBusy float64
	prevTime := 0.0
	nInSys := 0

	// sampleEvery := totalTime / 2000.0
	// if sampleEvery < 0.01 {
	// 	sampleEvery = 0.01
	// }
	// lastSample := 0.0

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
		qLenNow := nInSys - 1
		if serverFree {
			qLenNow = nInSys
		}
		if qLenNow < 0 {
			qLenNow = 0
		}
		areaInQueue += float64(qLenNow) * dt
		if !serverFree {
			areaServerBusy += dt
		}
		prevTime = t

		// // Сохраняем точку для графика
		// if t >= lastSample {
		// 	queuePoints = append(queuePoints, QueuePoint{
		// 		Time:   t,
		// 		QLen:   qLenNow,
		// 		NInSys: nInSys,
		// 	})
		// 	lastSample = t + sampleEvery
		// }

		switch evt.Type {
		case Arrival:
			nInSys++
			arrivalTime[evt.CustomerID] = t

			if serverFree {
				serverFree = false
				serviceStart[evt.CustomerID] = t
				svcTime := expRand(rng, mu)
				heap.Push(eh, &Event{
					Time:       t + svcTime,
					Type:       Departure,
					CustomerID: evt.CustomerID,
				})
			} else {
				queue = append(queue, evt.CustomerID)
			}

			// Следующее поступление
			customerID++
			heap.Push(eh, &Event{
				Time:       t + expRand(rng, lambda),
				Type:       Arrival,
				CustomerID: customerID,
			})

		case Departure:
			nInSys--
			arrT := arrivalTime[evt.CustomerID]
			svcStart := serviceStart[evt.CustomerID]
			waitT := svcStart - arrT
			sojournT := t - arrT
			waitTimes = append(waitTimes, waitT)
			sojournTimes = append(sojournTimes, sojournT)
			delete(arrivalTime, evt.CustomerID)
			delete(serviceStart, evt.CustomerID)

			if len(queue) > 0 {
				nextID := queue[0]
				queue = queue[1:]
				serviceStart[nextID] = t
				heap.Push(eh, &Event{
					Time:       t + expRand(rng, mu),
					Type:       Departure,
					CustomerID: nextID,
				})
			} else {
				serverFree = true
			}
		}
	}

	// Финальная интеграция
	dt := totalTime - prevTime
	areaInSys += float64(nInSys) * dt
	stateTime[nInSys] += dt
	qLenFinal := nInSys - 1
	if serverFree {
		qLenFinal = nInSys
	}
	if qLenFinal < 0 {
		qLenFinal = 0
	}
	areaInQueue += float64(qLenFinal) * dt
	if !serverFree {
		areaServerBusy += dt
	}

	empL := areaInSys / totalTime
	empLq := areaInQueue / totalTime
	empUtil := areaServerBusy / totalTime

	n := float64(len(waitTimes))
	empWq, empW := 0.0, 0.0
	if n > 0 {
		sumWq, sumW := 0.0, 0.0
		for i, w := range waitTimes {
			sumWq += w
			sumW += sojournTimes[i]
		}
		empWq = sumWq / n
		empW = sumW / n
	}

	// Теория M/M/1
	theoP0, theoL, theoLq, theoW, theoWq := 0.0, 0.0, 0.0, 0.0, 0.0
	stable := rho < 1.0
	if stable {
		theoP0 = 1 - rho
		theoL = rho / (1 - rho)
		theoLq = rho * rho / (1 - rho)
		theoW = 1.0 / (mu - lambda)
		theoWq = rho / (mu - lambda)
	}

	// // Прореживаем очередь для отображения
	// displayQueue := queuePoints
	// if len(displayQueue) > 1000 {
	// 	step := len(displayQueue) / 1000
	// 	sampled := make([]QueuePoint, 0, 1000)
	// 	for i := 0; i < len(displayQueue); i += step {
	// 		sampled = append(sampled, displayQueue[i])
	// 	}
	// 	displayQueue = sampled
	// }

	// Распределение вероятностей P(N=k)
	maxN := 0
	for n := range stateTime {
		if n > maxN {
			maxN = n
		}
	}
	if maxN > 30 {
		maxN = 30
	}
	probDist := make([]ProbPoint, maxN+1)
	for i := 0; i <= maxN; i++ {
		emp := stateTime[i] / totalTime
		theo := 0.0
		if stable {
			theo = (1 - rho) * math.Pow(rho, float64(i))
		}
		probDist[i] = ProbPoint{N: i, Emp: emp, Theo: theo}
	}

	return SimResponse{
		// QueueOverTime: displayQueue,
		ProbDist:  probDist,
		// WaitHistogram:    buildHistogram(waitTimes, 25),
		// SojournHistogram: buildHistogram(sojournTimes, 25),
		Lambda:           lambda,
		Mu:               mu,
		Rho:              rho,
		TotalTime:        totalTime,
		TotalCustomers:   len(waitTimes),
		EmpL:             empL,
		EmpLq:            empLq,
		EmpW:             empW,
		EmpWq:            empWq,
		EmpUtilization:   empUtil,
		TheoP0:           theoP0,
		TheoL:            theoL,
		TheoLq:           theoLq,
		TheoW:            theoW,
		TheoWq:           theoWq,
		Stable:           stable,
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
