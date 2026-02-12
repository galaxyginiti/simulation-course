package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"

	"github.com/gorilla/websocket"
)

// SimulationParams contains parameters for heat conduction simulation
type SimulationParams struct {
	Length        float64 `json:"length"`        // Length of plate (m)
	TimeStep      float64 `json:"timeStep"`      // Time step (s)
	SpaceStep     float64 `json:"spaceStep"`     // Space step (m)
	TotalTime     float64 `json:"totalTime"`     // Total simulation time (s)
	InitialTemp   float64 `json:"initialTemp"`   // Initial temperature (°C)
	LeftBoundary  float64 `json:"leftBoundary"`  // Left boundary temperature (°C)
	RightBoundary float64 `json:"rightBoundary"` // Right boundary temperature (°C)
	Alpha         float64 `json:"alpha"`         // Thermal diffusivity (m²/s)
}

// SimulationResult contains the results of simulation
type SimulationResult struct {
	Temperatures []float64 `json:"temperatures"`
	Time         float64   `json:"time"`
	CenterTemp   float64   `json:"centerTemp"`
	Stable       bool      `json:"stable"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Default material: Aluminum
// Thermal diffusivity α = k/(ρ*c) where:
// k - thermal conductivity (W/(m·K))
// ρ - density (kg/m³)
// c - specific heat capacity (J/(kg·K))
// For aluminum: k=237, ρ=2700, c=900
// α ≈ 9.7e-5 m²/s

func simulateHeatConduction(params SimulationParams) ([]SimulationResult, error) {
	// Calculate grid size
	n := int(math.Ceil(params.Length/params.SpaceStep)) + 1
	
	// Check stability condition (Courant condition)
	r := params.Alpha * params.TimeStep / (params.SpaceStep * params.SpaceStep)
	if r > 0.5 {
		return nil, fmt.Errorf("unstable parameters: r = %f > 0.5", r)
	}

	// Initialize temperature array
	T := make([]float64, n)
	Tnew := make([]float64, n)
	
	// Set initial conditions
	for i := range T {
		T[i] = params.InitialTemp
	}
	
	// Boundary conditions
	T[0] = params.LeftBoundary
	T[n-1] = params.RightBoundary

	results := []SimulationResult{}
	currentTime := 0.0
	steps := int(params.TotalTime / params.TimeStep)
	
	// Store initial state
	centerIdx := n / 2
	results = append(results, SimulationResult{
		Temperatures: append([]float64{}, T...),
		Time:         currentTime,
		CenterTemp:   T[centerIdx],
		Stable:       r <= 0.5,
	})

	// Time stepping
	for step := 0; step < steps; step++ {
		// Apply finite difference scheme
		for i := 1; i < n-1; i++ {
			Tnew[i] = T[i] + r*(T[i+1]-2*T[i]+T[i-1])
		}
		
		// Boundary conditions
		Tnew[0] = params.LeftBoundary
		Tnew[n-1] = params.RightBoundary
		
		// Copy new to old
		copy(T, Tnew)
		currentTime += params.TimeStep

		// Store result every few steps
		if step%10 == 0 || step == steps-1 {
			results = append(results, SimulationResult{
				Temperatures: append([]float64{}, T...),
				Time:         currentTime,
				CenterTemp:   T[centerIdx],
				Stable:       r <= 0.5,
			})
		}
	}

	return results, nil
}

func handleSimulation(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()

	for {
		var params SimulationParams
		err := conn.ReadJSON(&params)
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		// Validate and set defaults
		if params.Alpha == 0 {
			params.Alpha = 9.7e-5 // Aluminum
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

		// Send results back
		for _, result := range results {
			if err := conn.WriteJSON(result); err != nil {
				log.Println("Write error:", err)
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

func main() {
	http.HandleFunc("/ws", handleSimulation)
	http.HandleFunc("/health", handleHealth)

	fmt.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
