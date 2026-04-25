// Лабораторная работа №5: Моделирование случайных событий
//
// Два приложения-датчика случайных событий:
//
//  1. «Да или Нет» — бинарное событие с вероятностью p.
//     Метод: генерируем α ~ U[0, 1) и сравниваем с порогом p:
//       α < p  → событие наступило («ДА»)
//       α ≥ p  → событие не наступило («НЕТ»)
//
//  2. «Шар предсказаний» — дискретное событие с N равновероятными исходами.
//     Метод: у каждого ответа своя кумулятивная вероятность CDF.
//     Выбираем ответ i, если CDF[i-1] ≤ α < CDF[i].
//
// Ключевое: α — вещественное число (float64) из [0, 1), НЕ процент.
// Пример: α = 0.7314…  Если p=0.7, то α ≥ p → «НЕТ».
//
// API:
//   GET /api/events?p=0.7&n=500  → EventsResponse
//   GET /api/eightball            → EightBallResponse

package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"strconv"
)

// ─── Константы ───────────────────────────────────────────────────────────────

const (
	MaxLastAlpha = 30     // Сколько последних α-значений передавать на фронтенд
	MaxN         = 100000 // Максимальный размер выборки
)

// ─── Шар предсказаний: список ответов ────────────────────────────────────────

type Answer struct {
	Text     string  `json:"text"`
	Category string  `json:"category"` // positive / neutral / negative
	P        float64 `json:"p"`        // вероятность этого ответа
}

var answers = []Answer{
	{Text: "Да, определённо",        Category: "positive", P: 0.10},
	{Text: "Без сомнения",           Category: "positive", P: 0.10},
	{Text: "Скорее всего да",        Category: "positive", P: 0.10},
	{Text: "Знаки говорят «да»",    Category: "positive", P: 0.10},
	{Text: "Подождите и узнаете",    Category: "neutral",  P: 0.10},
	{Text: "Трудно сказать",         Category: "neutral",  P: 0.10},
	{Text: "Спросите снова позже",   Category: "neutral",  P: 0.10},
	{Text: "Не рассчитывай на это",  Category: "negative", P: 0.10},
	{Text: "Весьма сомнительно",     Category: "negative", P: 0.10},
	{Text: "Мой ответ — нет",        Category: "negative", P: 0.10},
}

// ─── Структуры ответов ───────────────────────────────────────────────────────

type AlphaResult struct {
	Alpha float64 `json:"alpha"` // α ∈ [0, 1) — вещественное число
	IsYes bool    `json:"isYes"`
}

type EventsResponse struct {
	P         float64       `json:"p"`
	N         int           `json:"n"`
	YesCount  int           `json:"yesCount"`
	NoCount   int           `json:"noCount"`
	EmpP      float64       `json:"empP"`       // эмпирическая вероятность «ДА»
	LastAlpha []AlphaResult `json:"lastAlpha"`  // последние MaxLastAlpha значений α + результат
}

type EightBallResponse struct {
	Alpha   float64  `json:"alpha"`   // α ∈ [0, 1) — «точка» на числовой прямой
	Index   int      `json:"index"`   // индекс выбранного ответа
	Answer  Answer   `json:"answer"`  // выбранный ответ
	Answers []Answer `json:"answers"` // все варианты (для отображения CDF)
}

// ─── Обработчики ─────────────────────────────────────────────────────────────

func handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	p := 0.5
	n := 100

	if ps := r.URL.Query().Get("p"); ps != "" {
		if pv, err := strconv.ParseFloat(ps, 64); err == nil && pv >= 0 && pv <= 1 {
			p = pv
		}
	}
	if ns := r.URL.Query().Get("n"); ns != "" {
		if nv, err := strconv.Atoi(ns); err == nil && nv > 0 && nv <= MaxN {
			n = nv
		}
	}

	// Используем случайное зерно, чтобы каждый запрос давал новые числа.
	rng := rand.New(rand.NewSource(rand.Int63()))

	yesCount := 0
	lastN := min(MaxLastAlpha, n)
	lastAlpha := make([]AlphaResult, lastN)

	for i := 0; i < n; i++ {
		// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
		// α — вещественное число (float64) из [0, 1), НЕ процент.
		// Пример: α = 0.7314… При p=0.7: 0.7314 ≥ 0.7 → «НЕТ».
		alpha := rng.Float64()
		isYes := alpha < p
		if isYes {
			yesCount++
		}
		if i >= n-lastN {
			lastAlpha[i-(n-lastN)] = AlphaResult{Alpha: alpha, IsYes: isYes}
		}
	}

	json.NewEncoder(w).Encode(EventsResponse{
		P:         p,
		N:         n,
		YesCount:  yesCount,
		NoCount:   n - yesCount,
		EmpP:      float64(yesCount) / float64(n),
		LastAlpha: lastAlpha,
	})
}

func handleEightBall(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Content-Type", "application/json")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	rng := rand.New(rand.NewSource(rand.Int63()))

	// ✦ ТОЧКА ПСЕВДОСЛУЧАЙНОСТИ ✦
	// α — вещественное число (float64) из [0, 1), НЕ процент.
	// Делим числовую прямую [0, 1) на N равных отрезков (по p=0.1 каждый).
	// Ответ i выбирается, если α попадает в i-й отрезок.
	alpha := rng.Float64()

	// Инверсный метод по CDF: ищем первый ответ, где кумулятивная сумма > α
	cumulative := 0.0
	idx := len(answers) - 1
	for i, a := range answers {
		cumulative += a.P
		if alpha < cumulative {
			idx = i
			break
		}
	}

	json.NewEncoder(w).Encode(EightBallResponse{
		Alpha:   alpha,
		Index:   idx,
		Answer:  answers[idx],
		Answers: answers,
	})
}

// ─── Точка входа ─────────────────────────────────────────────────────────────

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/events", handleEvents)
	mux.HandleFunc("/api/eightball", handleEightBall)

	addr := ":8085"
	log.Printf("Лаб. №5 — сервер запущен на http://localhost%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Ошибка: %v", err)
	}
}
