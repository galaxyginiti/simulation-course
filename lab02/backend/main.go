package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"

	"github.com/gorilla/websocket"
)

// SimulationParams — параметры моделирования теплопроводности стержня/пластины
type SimulationParams struct {
	Length        float64 `json:"length"`        // Длина пластины (м)
	TimeStep      float64 `json:"timeStep"`      // Шаг по времени Δt (с)
	SpaceStep     float64 `json:"spaceStep"`     // Шаг по пространству Δx (м)
	TotalTime     float64 `json:"totalTime"`     // Полное время моделирования (с)
	InitialTemp   float64 `json:"initialTemp"`   // Начальная температура T₀ (°C)
	LeftBoundary  float64 `json:"leftBoundary"`  // Температура левой границы (°C)
	RightBoundary float64 `json:"rightBoundary"` // Температура правой границы (°C)
	Alpha         float64 `json:"alpha"`         // Коэффициент температуропроводности α (м²/с)
}

// SimulationResult — результаты одного шага по времени
type SimulationResult struct {
	Temperatures []float64 `json:"temperatures"` // Распределение температуры по узлам сетки
	Time         float64   `json:"time"`         // Текущее модельное время (с)
	CenterTemp   float64   `json:"centerTemp"`   // Температура в центре пластины (°C)
	Stable       bool      `json:"stable"`       // Признак устойчивости схемы
	R            float64   `json:"r"`            // Параметр Куранта r = α·Δt/Δx²
	FourierNum   float64   `json:"fourierNum"`   // Число Фурье Fo = α·t/L² (безразмерное время)
	LeftFlux     float64   `json:"leftFlux"`     // Тепловой поток на левой границе (°C/м), нормированный на α
	RightFlux    float64   `json:"rightFlux"`    // Тепловой поток на правой границе (°C/м), нормированный на α
}

var upgrader = websocket.Upgrader{
	// Разрешаем подключения с любого источника (для разработки)
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Материал по умолчанию: алюминий.
// Коэффициент температуропроводности: α = k / (ρ · c)
//   k   — коэффициент теплопроводности (Вт/(м·К)),   k  = 237
//   ρ   — плотность (кг/м³),                          ρ  = 2700
//   c   — удельная теплоёмкость (Дж/(кг·К)),          c  = 900
//   α   ≈ 9.7×10⁻⁵ м²/с

// simulateHeatConduction решает уравнение теплопроводности ∂T/∂t = α·∂²T/∂x²
// явной конечно-разностной схемой (схема Эйлера вперёд):
//
//   T_i^(n+1) = T_i^n + r·(T_{i+1}^n - 2·T_i^n + T_{i-1}^n)
//
// где r = α·Δt/Δx² — параметр Куранта.
// Схема устойчива при r ≤ 0.5 (условие Куранта–Фридрихса–Леви).
func simulateHeatConduction(params SimulationParams) ([]SimulationResult, error) {
	// Число узлов пространственной сетки
	n := int(math.Ceil(params.Length/params.SpaceStep)) + 1

	// Параметр Куранта: определяет устойчивость явной схемы
	// При r > 0.5 численное решение расходится (нарастают осцилляции)
	r := params.Alpha * params.TimeStep / (params.SpaceStep * params.SpaceStep)
	if r > 0.5 {
		return nil, fmt.Errorf("нестабильные параметры: r = %.4f > 0.5 (нарушено условие Куранта)", r)
	}

	// Массивы температур на текущем и следующем шаге
	T := make([]float64, n)
	Tnew := make([]float64, n)

	// Начальные условия: однородное поле T(x, 0) = T₀
	for i := range T {
		T[i] = params.InitialTemp
	}

	// Граничные условия Дирихле (температура зафиксирована на торцах)
	T[0] = params.LeftBoundary
	T[n-1] = params.RightBoundary

	results := []SimulationResult{}
	currentTime := 0.0
	steps := int(params.TotalTime / params.TimeStep)

	// Индекс центрального узла
	centerIdx := n / 2

	// Вспомогательная функция расчёта производных характеристик
	makeResult := func(temps []float64, t float64) SimulationResult {
		// Число Фурье Fo = α·t/L² — безразмерное время диффузии тепла
		fo := 0.0
		if params.Length > 0 {
			fo = params.Alpha * t / (params.Length * params.Length)
		}
		// Градиент температуры у левой и правой границ (конечная разность первого порядка)
		leftFlux := (temps[1] - temps[0]) / params.SpaceStep
		rightFlux := (temps[n-1] - temps[n-2]) / params.SpaceStep
		return SimulationResult{
			Temperatures: append([]float64{}, temps...),
			Time:         t,
			CenterTemp:   temps[centerIdx],
			Stable:       r <= 0.5,
			R:            r,
			FourierNum:   fo,
			LeftFlux:     leftFlux,
			RightFlux:    rightFlux,
		}
	}

	// Сохраняем начальное состояние (t = 0)
	results = append(results, makeResult(T, currentTime))

	// Итерация по времени
	for step := 0; step < steps; step++ {
		// Явная разностная схема для внутренних узлов
		for i := 1; i < n-1; i++ {
			Tnew[i] = T[i] + r*(T[i+1]-2*T[i]+T[i-1])
		}

		// Поддерживаем граничные условия Дирихле
		Tnew[0] = params.LeftBoundary
		Tnew[n-1] = params.RightBoundary

		// Переходим к следующему шагу
		copy(T, Tnew)
		currentTime += params.TimeStep

		// Сохраняем каждый 10-й шаг и последний шаг
		if step%10 == 0 || step == steps-1 {
			results = append(results, makeResult(T, currentTime))
		}
	}

	return results, nil
}

func handleSimulation(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Ошибка обновления соединения до WebSocket:", err)
		return
	}
	defer conn.Close()

	for {
		var params SimulationParams
		err := conn.ReadJSON(&params)
		if err != nil {
			log.Println("Ошибка чтения параметров:", err)
			break
		}

		// Подстановка значений по умолчанию, если клиент не передал параметр
		if params.Alpha == 0 {
			params.Alpha = 9.7e-5 // Алюминий
		}
		if params.Length == 0 {
			params.Length = 1.0
		}
		if params.InitialTemp == 0 {
			params.InitialTemp = 20.0
		}

		results, err := simulateHeatConduction(params)
		if err != nil {
			conn.WriteJSON(map[string]interface{}{
				"error": err.Error(),
			})
			continue
		}

		// Отправляем результаты клиенту пошагово
		for _, result := range results {
			if err := conn.WriteJSON(result); err != nil {
				log.Println("Ошибка отправки результата:", err)
				return
			}
		}
	}
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// PhysicsInfo описывает физическую модель, реализованную в симуляции
type PhysicsInfo struct {
	Equation        string `json:"equation"`        // Уравнение в дифференциальной форме
	Scheme          string `json:"scheme"`          // Численная схема
	StabilityRule   string `json:"stabilityRule"`   // Условие устойчивости
	FourierExpl     string `json:"fourierExpl"`     // Пояснение числа Фурье
	AlphaExpl       string `json:"alphaExpl"`       // Пояснение коэффициента α
	BoundaryExpl    string `json:"boundaryExpl"`    // Пояснение граничных условий
	MaterialAluminum struct {
		K     float64 `json:"k"`     // Теплопроводность, Вт/(м·К)
		Rho   float64 `json:"rho"`   // Плотность, кг/м³
		C     float64 `json:"c"`     // Удельная теплоёмкость, Дж/(кг·К)
		Alpha float64 `json:"alpha"` // Коэффициент температуропроводности, м²/с
	} `json:"materialAluminum"`
}

func handlePhysics(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	info := PhysicsInfo{
		Equation:      "∂T/∂t = α · ∂²T/∂x²",
		Scheme:        "T_i^(n+1) = T_i^n + r·(T_{i+1}^n − 2·T_i^n + T_{i-1}^n)",
		StabilityRule: "r = α·Δt/Δx² ≤ 0.5",
		FourierExpl:   "Fo = α·t/L² — безразмерное время; при Fo ~ 0.1 тепло достигает центра",
		AlphaExpl:     "α = k/(ρ·c) — определяет скорость выравнивания температуры",
		BoundaryExpl:  "Дирихле: температура на торцах фиксирована на всё время счёта",
	}
	info.MaterialAluminum.K = 237
	info.MaterialAluminum.Rho = 2700
	info.MaterialAluminum.C = 900
	info.MaterialAluminum.Alpha = 9.7e-5
	json.NewEncoder(w).Encode(info)
}

func main() {
	http.HandleFunc("/ws", handleSimulation)
	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/physics", handlePhysics)

	fmt.Println("Сервер запускается на порту :8080")
	fmt.Println("WebSocket: ws://localhost:8080/ws")
	fmt.Println("Физика:    http://localhost:8080/physics")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
