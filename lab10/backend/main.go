// Лабораторная работа №10: Система массового обслуживания M/M/c с усложнениями
//
// Параметры:
//   λ  — интенсивность входного потока
//   μ  — интенсивность обслуживания (каждый прибор)
//   c  — число приборов (каналов)
//   K  — ёмкость системы (0 = ∞; если K > 0 и заявок K — отказ)
//   α  — интенсивность нетерпения (0 = терпеливые; заявки ждут ~ Exp(α))
//
// Два усложнения (ООП):
//   1. Ограничение ёмкости K — вероятность отказа P_rej
//   2. Нетерпение заявок (abandonment) — вероятность покинуть очередь P_abd
//
// Алгоритм event-driven (min-heap):
//   Событие Arrival:   если N < K (или K=0) → в систему; иначе отказ
//   Событие Departure: освободить прибор; взять следующего из очереди
//   Событие Abandon:   заявка уходит из очереди без обслуживания
//
// Теория M/M/c (без ограничений):
//   a = λ/μ  — предложенная нагрузка (erlangs)
//   ρ = a/c  — загрузка на прибор
//   Формула Эрланга-B: B(c,a) — вероятность потери для M/M/c/c (Erlang loss)
//   Формула Эрланга-C: C(c,a) — вероятность ожидания для M/M/c (Erlang delay)
//   Lq = C(c,a) · ρ / (1−ρ),  Wq = Lq/λ,  W = Wq + 1/μ,  L = λ·W

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
	defLambda = 4.0
	defMu     = 2.0
	defC      = 3
	defK      = 15 // 0 = unlimited
	defAlpha  = 0.5
	defT      = 1000.0
)

// ─── Очередь событий ──────────────────────────────────────────────────────────

type EvType int

const (
	EvArrive  EvType = 0
	EvDepart  EvType = 1
	EvAbandon EvType = 2
)

type Ev struct {
	Time int64  // scaled to avoid float comparisons
	TimeF float64
	Type  EvType
	CID   int // Customer ID; -1 = cancelled
}

type EvHeap []*Ev

func (h EvHeap) Len() int            { return len(h) }
func (h EvHeap) Less(i, j int) bool  { return h[i].TimeF < h[j].TimeF }
func (h EvHeap) Swap(i, j int)       { h[i], h[j] = h[j], h[i] }
func (h *EvHeap) Push(x interface{}) { *h = append(*h, x.(*Ev)) }
func (h *EvHeap) Pop() interface{} {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[:n-1]
	return x
}

// ─── Структуры данных ─────────────────────────────────────────────────────────

type QPoint struct {
	Time   float64 `json:"time"`
	QLen   int     `json:"qLen"`
	NInSys int     `json:"nInSys"`
	Busy   int     `json:"busy"`
}

type WBin struct {
	Lo    float64 `json:"lo"`
	Hi    float64 `json:"hi"`
	Count int     `json:"count"`
	Freq  float64 `json:"freq"`
}

type SimResponse struct {
	QueueOverTime []QPoint `json:"queueOverTime"`
	WaitHistogram []WBin   `json:"waitHistogram"`

	Lambda    float64 `json:"lambda"`
	Mu        float64 `json:"mu"`
	C         int     `json:"c"`
	K         int     `json:"k"`
	Alpha     float64 `json:"alpha"`
	TotalTime float64 `json:"totalTime"`
	Rho       float64 `json:"rho"` // ρ = λ/(c·μ)
	A         float64 `json:"a"`   // a = λ/μ (erlangs)

	TotalArrived   int `json:"totalArrived"`
	TotalServed    int `json:"totalServed"`
	TotalRejected  int `json:"totalRejected"`
	TotalAbandoned int `json:"totalAbandoned"`

	// Эмпирика
	EmpRejectionProb  float64 `json:"empRejectionProb"`
	EmpAbandonProb    float64 `json:"empAbandonProb"`
	EmpL              float64 `json:"empL"`
	EmpLq             float64 `json:"empLq"`
	EmpW              float64 `json:"empW"`
	EmpWq             float64 `json:"empWq"`
	EmpUtilization    float64 `json:"empUtilization"` // доля занятости 1 прибора

	// Теория M/M/c (без K, без нетерпения)
	TheoErlangB float64 `json:"theoErlangB"` // Erlang-B loss
	TheoErlangC float64 `json:"theoErlangC"` // Erlang-C delay
	TheoLq      float64 `json:"theoLq"`
	TheoWq      float64 `json:"theoWq"`
	TheoW       float64 `json:"theoW"`
	TheoL       float64 `json:"theoL"`
	Stable      bool    `json:"stable"` // ρ < 1
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

func expRand(rng *rand.Rand, rate float64) float64 {
	u := rng.Float64()
	if u == 0 {
		u = 1e-300
	}
	return -math.Log(u) / rate
}

func logFact(n int) float64 {
	r := 0.0
	for i := 2; i <= n; i++ {
		r += math.Log(float64(i))
	}
	return r
}

// erlangB вычисляет вероятность потери Эрланга-B рекуррентным методом.
// B(c, a): вероятность отказа в системе M/M/c/c, a = λ/μ.
func erlangB(c int, a float64) float64 {
	if a <= 0 {
		return 0
	}
	b := 1.0
	for i := 1; i <= c; i++ {
		b = a * b / (float64(i) + a*b)
	}
	return b
}

// erlangC вычисляет вероятность ожидания Эрланга-C.
// C(c, a): вероятность, что прибывшая заявка попадёт в очередь, a = λ/μ, ρ = a/c < 1.
func erlangC(c int, lambda, mu float64) float64 {
	a := lambda / mu
	rho := a / float64(c)
	if rho >= 1.0 {
		return 1.0
	}
	// Числитель: (a^c / c!) / (1 − ρ)
	logNum := float64(c)*math.Log(a) - logFact(c) - math.Log(1-rho)
	num := math.Exp(logNum)
	// Знаменатель: Σ_{k=0}^{c-1} a^k/k! + num
	sum := 0.0
	for k := 0; k < c; k++ {
		logTerm := float64(k)*math.Log(a) - logFact(k)
		sum += math.Exp(logTerm)
	}
	return num / (sum + num)
}

func buildWaitHist(values []float64, bins int) []WBin {
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
	hist := make([]WBin, bins)
	for i := 0; i < bins; i++ {
		hist[i] = WBin{
			Lo:    minV + float64(i)*width,
			Hi:    minV + float64(i+1)*width,
			Count: counts[i],
			Freq:  float64(counts[i]) / float64(len(values)),
		}
	}
	return hist
}

// ─── Симуляция M/M/c/K с нетерпением ─────────────────────────────────────────

func simulate(rng *rand.Rand, lambda, mu float64, c, K int, alpha, totalTime float64) SimResponse {
	rho := lambda / (float64(c) * mu)
	a := lambda / mu

	eh := &EvHeap{}
	heap.Init(eh)

	// Первое поступление
	heap.Push(eh, &Ev{TimeF: expRand(rng, lambda), Type: EvArrive, CID: 1})

	nextCID := 2
	busyServers := 0
	var queue []int // CID в очереди

	arrTime := map[int]float64{}    // момент поступления
	svcStart := map[int]float64{}   // момент начала обслуживания
	inSvc := map[int]bool{}         // CID → обслуживается
	abandEvt := map[int]*Ev{}       // CID → событие нетерпения

	var queuePoints []QPoint
	var waitTimes []float64

	var areaInSys, areaInQueue, areaServerBusy float64
	prevTime := 0.0
	nInSys := 0
	totalArrived, totalServed, totalRejected, totalAbandoned := 0, 0, 0, 0

	sampleEvery := totalTime / 2000.0
	if sampleEvery < 0.01 {
		sampleEvery = 0.01
	}
	lastSample := 0.0

	for eh.Len() > 0 {
		evt := heap.Pop(eh).(*Ev)
		t := evt.TimeF
		if t > totalTime {
			break
		}

		// Накопление площадей
		dt := t - prevTime
		areaInSys += float64(nInSys) * dt
		qLen := nInSys - busyServers
		if qLen < 0 {
			qLen = 0
		}
		areaInQueue += float64(qLen) * dt
		areaServerBusy += float64(busyServers) * dt
		prevTime = t

		if t >= lastSample {
			queuePoints = append(queuePoints, QPoint{
				Time:   t,
				QLen:   qLen,
				NInSys: nInSys,
				Busy:   busyServers,
			})
			lastSample = t + sampleEvery
		}

		switch evt.Type {
		case EvArrive:
			if evt.CID < 0 {
				break // cancelled
			}
			totalArrived++

			// Проверяем ёмкость
			if K > 0 && nInSys >= K {
				totalRejected++
			} else {
				nInSys++
				arrTime[evt.CID] = t

				if busyServers < c {
					// Немедленное обслуживание
					busyServers++
					inSvc[evt.CID] = true
					svcStart[evt.CID] = t
					svc := expRand(rng, mu)
					heap.Push(eh, &Ev{TimeF: t + svc, Type: EvDepart, CID: evt.CID})
				} else {
					// Встаём в очередь
					queue = append(queue, evt.CID)
					// Планируем нетерпение
					if alpha > 0 {
						at := t + expRand(rng, alpha)
						ae := &Ev{TimeF: at, Type: EvAbandon, CID: evt.CID}
						heap.Push(eh, ae)
						abandEvt[evt.CID] = ae
					}
				}
			}

			// Следующее поступление
			heap.Push(eh, &Ev{TimeF: t + expRand(rng, lambda), Type: EvArrive, CID: nextCID})
			nextCID++

		case EvDepart:
			if !inSvc[evt.CID] {
				break
			}
			delete(inSvc, evt.CID)
			busyServers--
			nInSys--
			totalServed++

			at := arrTime[evt.CID]
			ss := svcStart[evt.CID]
			waitTimes = append(waitTimes, ss-at)
			delete(arrTime, evt.CID)
			delete(svcStart, evt.CID)

			// Берём следующего из очереди
			for len(queue) > 0 {
				nid := queue[0]
				queue = queue[1:]
				// Отменяем событие нетерпения
				if ae, ok := abandEvt[nid]; ok {
					ae.CID = -1
					delete(abandEvt, nid)
				}
				if _, ok := arrTime[nid]; ok {
					// Ещё в системе → начинаем обслуживание
					busyServers++
					inSvc[nid] = true
					svcStart[nid] = t
					svc := expRand(rng, mu)
					heap.Push(eh, &Ev{TimeF: t + svc, Type: EvDepart, CID: nid})
					break
				}
				// Уже ушёл (abandon) → берём следующего
			}

		case EvAbandon:
			if evt.CID < 0 {
				break // отменено
			}
			if inSvc[evt.CID] {
				break // уже обслуживается
			}
			if _, ok := arrTime[evt.CID]; !ok {
				break // уже ушёл
			}
			// Удаляем из очереди
			for i, id := range queue {
				if id == evt.CID {
					queue = append(queue[:i], queue[i+1:]...)
					break
				}
			}
			delete(abandEvt, evt.CID)
			delete(arrTime, evt.CID)
			nInSys--
			totalAbandoned++
		}
	}

	// Финальная интеграция
	dt := totalTime - prevTime
	areaInSys += float64(nInSys) * dt
	qLen := nInSys - busyServers
	if qLen < 0 {
		qLen = 0
	}
	areaInQueue += float64(qLen) * dt
	areaServerBusy += float64(busyServers) * dt

	empL := areaInSys / totalTime
	empLq := areaInQueue / totalTime
	empUtil := areaServerBusy / (totalTime * float64(c))

	var sumWait float64
	for _, w := range waitTimes {
		sumWait += w
	}
	empWq, empW := 0.0, 0.0
	if len(waitTimes) > 0 {
		empWq = sumWait / float64(len(waitTimes))
		empW = empWq + 1.0/mu
	}

	empRejProb, empAbanProb := 0.0, 0.0
	if totalArrived > 0 {
		empRejProb = float64(totalRejected) / float64(totalArrived)
		empAbanProb = float64(totalAbandoned) / float64(totalArrived)
	}

	// Теория M/M/c
	eb := erlangB(c, a)
	ec := erlangC(c, lambda, mu)
	stable := rho < 1.0
	theoLq, theoWq, theoW, theoL := 0.0, 0.0, 0.0, 0.0
	if stable {
		theoLq = ec * rho / (1 - rho)
		theoWq = theoLq / lambda
		theoW = theoWq + 1.0/mu
		theoL = lambda * theoW
	}

	// Прореживаем
	displayQueue := queuePoints
	if len(displayQueue) > 1000 {
		step := len(displayQueue) / 1000
		sampled := make([]QPoint, 0, 1000)
		for i := 0; i < len(displayQueue); i += step {
			sampled = append(sampled, displayQueue[i])
		}
		displayQueue = sampled
	}

	return SimResponse{
		QueueOverTime:    displayQueue,
		WaitHistogram:    buildWaitHist(waitTimes, 25),
		Lambda:           lambda,
		Mu:               mu,
		C:                c,
		K:                K,
		Alpha:            alpha,
		TotalTime:        totalTime,
		Rho:              rho,
		A:                a,
		TotalArrived:     totalArrived,
		TotalServed:      totalServed,
		TotalRejected:    totalRejected,
		TotalAbandoned:   totalAbandoned,
		EmpRejectionProb: empRejProb,
		EmpAbandonProb:   empAbanProb,
		EmpL:             empL,
		EmpLq:            empLq,
		EmpW:             empW,
		EmpWq:            empWq,
		EmpUtilization:   empUtil,
		TheoErlangB:      eb,
		TheoErlangC:      ec,
		TheoLq:           theoLq,
		TheoWq:           theoWq,
		TheoW:            theoW,
		TheoL:            theoL,
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
			if p, err := strconv.ParseFloat(v, 64); err == nil && p >= 0 {
				return p
			}
		}
		return def
	}
	parseI := func(key string, def int) int {
		if v := q.Get(key); v != "" {
			if p, err := strconv.Atoi(v); err == nil && p >= 0 {
				return p
			}
		}
		return def
	}

	lambda := parseF("lambda", defLambda)
	mu := parseF("mu", defMu)
	if lambda <= 0 {
		lambda = defLambda
	}
	if mu <= 0 {
		mu = defMu
	}
	c := parseI("c", defC)
	if c < 1 {
		c = 1
	}
	if c > 50 {
		c = 50
	}
	K := parseI("k", defK)
	if K > 0 && K < c {
		K = c
	}
	alpha := parseF("alpha", defAlpha)
	T := parseF("t", defT)
	if T <= 0 || T > 10000000 {
		T = defT
	}

	rng := rand.New(rand.NewSource(42))
	result := simulate(rng, lambda, mu, c, K, alpha, T)

	if err := json.NewEncoder(w).Encode(result); err != nil {
		log.Printf("encode error: %v", err)
	}
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/simulate", handleSimulate)

	addr := ":8090"
	log.Printf("Лаб. №10 — M/M/c с усложнениями, сервер: http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка: %v", err)
	}
}
