package main

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
)

const (
	g     = 9.81  // ускорение свободного падения, м/с²
	rho   = 1.225 // плотность воздуха, кг/м³
	Cd    = 0.47  // коэффициент аэродинамического сопротивления (сфера)
	mass  = 1.0   // масса тела, кг
	area  = 0.01  // площадь поперечного сечения, м²
)

type Point struct {
	X float64 `json:"x"` // дальность, м
	Y float64 `json:"y"` // высота, м
	V float64 `json:"v"` // скорость, м/с
	T float64 `json:"t"` // время, с
}

type SimulationRequest struct {
	V0    float64 `json:"v0"`    // начальная скорость, м/с
	Angle float64 `json:"angle"` // угол к горизонту, градусы
	H0    float64 `json:"h0"`    // начальная высота, м
	Dt    float64 `json:"dt"`    // шаг моделирования, с
}

type SimulationResponse struct {
	Trajectory      []Point `json:"trajectory"`
	Range           float64 `json:"range"`           // дальность полёта, м
	MaxHeight       float64 `json:"maxHeight"`       // максимальная высота, м
	FinalVelocity   float64 `json:"finalVelocity"`   // скорость в конечной точке, м/с
	TimeOfFlight    float64 `json:"timeOfFlight"`    // время полёта, с
	SimulationSteps int     `json:"simulationSteps"` // количество шагов
}

func simulate(req SimulationRequest) SimulationResponse {
	// Начальные условия
	angleRad := req.Angle * math.Pi / 180
	vx := req.V0 * math.Cos(angleRad)
	vy := req.V0 * math.Sin(angleRad)
	x := 0.0
	y := req.H0
	t := 0.0

	trajectory := []Point{}
	maxHeight := y
	steps := 0

	// Моделирование полёта
	for y >= 0 {
		// Сохраняем текущую точку
		v := math.Sqrt(vx*vx + vy*vy)
		trajectory = append(trajectory, Point{X: x, Y: y, V: v, T: t})

		if y > maxHeight {
			maxHeight = y
		}

		// Расчёт силы сопротивления воздуха
		dragForce := 0.5 * rho * Cd * area * v * v

		// Ускорения с учётом силы сопротивления
		ax := -(dragForce / mass) * (vx / v)
		ay := -g - (dragForce / mass) * (vy / v)

		// Обработка случая нулевой скорости
		if v == 0 {
			ax = 0
			ay = -g
		}

		// Обновление скоростей и координат методом Эйлера
		vx += ax * req.Dt
		vy += ay * req.Dt
		x += vx * req.Dt
		y += vy * req.Dt
		t += req.Dt

		steps++

		// Защита от бесконечного цикла
		if steps > 1000000 {
			break
		}
	}

	// Финальная точка (на земле)
	finalV := math.Sqrt(vx*vx + vy*vy)

	return SimulationResponse{
		Trajectory:      trajectory,
		Range:           x,
		MaxHeight:       maxHeight,
		FinalVelocity:   finalV,
		TimeOfFlight:    t,
		SimulationSteps: steps,
	}
}

func simulateHandler(w http.ResponseWriter, r *http.Request) {
	// Установка CORS заголовков
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SimulationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Валидация входных данных
	if req.V0 <= 0 || req.Angle < 0 || req.Angle > 90 || req.Dt <= 0 {
		http.Error(w, "Invalid parameters", http.StatusBadRequest)
		return
	}

	result := simulate(req)
	json.NewEncoder(w).Encode(result)
}

func main() {
	http.HandleFunc("/api/simulate", simulateHandler)

	log.Println("Server started on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
