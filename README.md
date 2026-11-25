# Autonomous Vehicle Path Planning & Vision Lab Studio

A production-grade Autonomous Vehicle (AV) simulation, behavioral planning, and real-time vision perception studio. Features a **Hybrid Perception Pipeline** (Curved Spline & Geometric OpenCV Lane Detection + YOLOv8 Deep Learning Obstacle Detection), a **Finite State Machine (FSM) Behavioral Planner**, **Kinematic Trajectory Generation (Bezier, Spline, RRT\*)**, an automated **Backtesting & Scenario Replay Engine**, and hardware acceleration support (NVIDIA CUDA, Apple MPS, CPU).

---

## Key Capabilities

### 1. Hybrid Perception Architecture
- **2D Simulation Mode:** High-fidelity closed-loop perception simulating camera, radar, and LiDAR sensor noise, road curvature, and moving/static obstacles.
- **Vision Lab (Real Road Images & Dashcam Videos):**
  - **Dual Lane Architecture:** Toggle between `Curved Spline & Polynomial Mode` (for winding roads and progressive curvature) and `Precision Geometric Mode` (for straight highways and urban corridors).
  - **Color & Gradient Fusion:** Multi-space HLS lightness gating + LAB yellow channel isolation combined with Sobel-X directional gradient filtering.
  - **Anti-Triangle Safe Area Guard:** Perspective-bounded corridor reconstruction preserving physical road dimensions without corridor collapse.
  - **ADAS Telemetry Dashboard:** Real-time computation of Radius of Curvature ($R$ in meters), Lateral Vehicle Offset ($m$), Lane Departure Warning (LDW status: `CENTERED`, `DRIFT`, `DEPARTURE`), Physical Lane Width ($m$), and Left/Right lock confidence meters.
  - **CV Feature Map Inspection:** Live binary mask viewer for debugging intermediate edge segmentation and color contrast channels.
  - **YOLOv8 Real-Time Obstacle Detection:** Detects cars, trucks, buses, pedestrians, cyclists, and traffic elements with metric distance estimation.

### 2. Behavioral Decision Making & Planning
- **Tactical Behavioral FSM:** Finite State Machine managing 5 discrete states:
  - `LANE_KEEP`: Active lane centering and speed-matched cruising.
  - `LANE_CHANGE_LEFT` & `LANE_CHANGE_RIGHT`: Multi-lane overtake maneuvers with full blind-spot and forward headway verification.
  - `OBSTACLE_AVOID`: Dynamic lateral nudge around stationary roadblocks while maintaining corridor safety margins.
  - `EMERGENCY_BRAKE`: High-deceleration emergency stops for sudden pedestrian crossers or oncoming obstacles.
- **Stanley + Pure Pursuit Controller:** Lookahead steering pursuit combined with Stanley cross-track error correction for exact lane centering ($0.0\text{ m}$ steady-state error).

### 3. Automated Backtesting & Safety Profiling
- **Pre-loaded Scenarios:**
  1. *Highway Cruise & Overtake* (multi-lane, high-speed, overtaking slower lead vehicles and returning safely back in line).
  2. *Urban Intersection & Parked Obstacles* (oncoming vehicle collision avoidance and cyclist awareness).
  3. *Edge Case: Sudden Pedestrian Crossing* (evasive braking for lateral encroaching obstacles).
  4. *Edge Case: Sharp Curve with Missing Lane Markings* (road curvature tracking and guardrail safety).
  5. *Edge Case: Low-Visibility / High Sensor Noise* (weather and sensor degradation testing).
- **Automated Pass/Fail Thresholds:**
  - Collision Rate: $0\%$
  - Average Planning Latency: $< 100\text{ ms}$
  - Path Deviation: $< 0.5\text{ m}$
  - Overall Safety Score ($0 - 100$)
- **Local Persistence:** All runs saved to SQLite database with CSV and JSON export support.

### 4. Hardware Acceleration
- Automatically detects and utilizes **NVIDIA CUDA** GPUs (e.g., RTX 3050 Laptop GPU), Apple Silicon **MPS**, or vectorized **CPU (AVX/SSE)** fallback.
- Dynamic hardware selector in the web interface for runtime switching without server restart.

### 5. Manual Data Ingestion (`add_data/`)
- Drop custom scenario JSON files into `add_data/scenarios/`.
- Drop custom road images (`.jpg`, `.png`) or dashcam videos (`.mp4`) into `add_data/media/`.
- Click **"Refresh Data"** in the UI to reload newly added assets immediately via the `/api/rescan-data` endpoint.

---

## Directory Structure

```
├── add_data/
│   ├── media/             # Custom road images and dashcam videos
│   ├── scenarios/         # Custom scenario JSON files
│   └── README.txt         # Ingestion guide
├── backend/
│   ├── api/               # FastAPI REST & streaming endpoints
│   ├── engine/            # 20 Hz ScenarioSimulator physics & Stanley controller
│   ├── models/            # Pre-trained weights (YOLOv8n)
│   ├── perception/        # OpenCV Lane Detector, YOLOv8, Synthetic Perception
│   ├── planner/           # Behavioral FSM & Kinematic Trajectory Generators
│   ├── scenarios/         # Pre-loaded benchmark scenario JSON suites
│   ├── database.py        # SQLite persistence layer
│   ├── hardware.py        # CUDA / MPS / CPU detection and switching
│   └── requirements.txt   # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/    # SimulationCanvas, VisionLab, TelemetryCards, Header
│   │   ├── App.jsx        # Main application layout & tabs
│   │   └── index.css      # Tailwind styling
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Getting Started

### Prerequisites
- **Python:** 3.10+ (PyTorch 2.2+ recommended)
- **Node.js:** 18+ (npm or yarn)
- **Git**

### Installation

1. **Clone the repository:**
   ```bash
   git clone <YOUR_GITHUB_REPO_URL>
   cd <REPO_NAME>
   ```

2. **Set up the Python backend:**
   ```bash
   cd backend
   python -m venv venv
   
   # On Windows:
   venv\Scripts\activate
   # On Linux / macOS:
   source venv/bin/activate

   pip install -r requirements.txt
   ```

3. **Set up the Frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run build
   ```

### Running the Application

1. **Start the backend server:**
   ```bash
   # From project root:
   backend\venv\Scripts\python.exe -m uvicorn api.main:app --app-dir backend --host 127.0.0.1 --port 8000
   ```

2. **Open the Web Studio:**
   Navigate your web browser to:
   ```
   http://127.0.0.1:8000/
   ```

---

## Scenario JSON Schema

To author custom driving scenarios, drop a `.json` file into `add_data/scenarios/` matching this format:

```json
{
  "id": "custom_urban_01",
  "name": "Custom Urban Scenario",
  "category": "urban",
  "road": {
    "lanes": 2,
    "lane_width_m": 3.5,
    "length_m": 220,
    "curvature": 0.0,
    "lane_visibility": 0.95
  },
  "ego_start": {
    "x": 0.0,
    "y": 1.75,
    "speed_mps": 12.0,
    "max_speed_mps": 16.0
  },
  "obstacles": [
    {
      "id": "lead_car",
      "type": "vehicle",
      "x": 60.0,
      "y": 1.75,
      "vx": 8.0,
      "vy": 0.0,
      "width": 2.0,
      "length": 4.5
    }
  ]
}
```

---

## License
MIT License. Built for autonomous systems research, computer vision benchmarking, and trajectory planning education.
