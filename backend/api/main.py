import os
import glob
import json
import base64
import cv2
import numpy as np
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

# (Existing imports and setup)
from pydantic import BaseModel

import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from hardware import get_hardware_info, set_hardware_device
from database import init_db, save_run, list_runs, get_run, delete_run
from engine.simulator import ScenarioSimulator
from perception.cv_lanes import OpenCVLaneDetector
from perception.yolo_detector import YOLODetector

app = FastAPI(
    title="Autonomous Vehicle Path Planning & Perception API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root directory paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # /backend
ROOT_DIR = os.path.dirname(BASE_DIR)                                  # project root
SCENARIOS_DIR = os.path.join(BASE_DIR, "scenarios")
ADD_DATA_DIR = os.path.join(ROOT_DIR, "add_data")
ADD_DATA_SCENARIOS = os.path.join(ADD_DATA_DIR, "scenarios")
ADD_DATA_MEDIA = os.path.join(ADD_DATA_DIR, "media")

# Initialize database
init_db()

# Lazy-loaded detectors
lane_detector = None
yolo_detector = None

def get_detectors():
    global lane_detector, yolo_detector
    if lane_detector is None:
        lane_detector = OpenCVLaneDetector()
    if yolo_detector is None:
        hw = get_hardware_info()
        yolo_detector = YOLODetector(device=hw["device"])
    return lane_detector, yolo_detector

# Data Scanner Helper
def scan_scenarios_and_media():
    os.makedirs(SCENARIOS_DIR, exist_ok=True)
    os.makedirs(ADD_DATA_SCENARIOS, exist_ok=True)
    os.makedirs(ADD_DATA_MEDIA, exist_ok=True)

    scenarios = []

    # 1. Built-in scenarios from /backend/scenarios/
    for filepath in glob.glob(os.path.join(SCENARIOS_DIR, "*.json")):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["is_custom"] = False
                data["source"] = "built_in"
                data["filepath"] = filepath
                scenarios.append(data)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")

    # 2. Custom scenarios from /add_data/scenarios/
    for filepath in glob.glob(os.path.join(ADD_DATA_SCENARIOS, "*.json")):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                data["is_custom"] = True
                data["source"] = "add_data"
                data["filepath"] = filepath
                # Avoid duplicate IDs
                if not any(s["id"] == data["id"] for s in scenarios):
                    scenarios.append(data)
        except Exception as e:
            print(f"Error loading custom scenario {filepath}: {e}")

    # 3. Media files from /add_data/media/
    valid_exts = (".jpg", ".jpeg", ".png", ".mp4")
    media_files = []
    for f in os.listdir(ADD_DATA_MEDIA):
        if f.lower().endswith(valid_exts):
            full_path = os.path.join(ADD_DATA_MEDIA, f)
            size_kb = round(os.path.getsize(full_path) / 1024, 1)
            media_files.append({
                "filename": f,
                "type": "video" if f.lower().endswith(".mp4") else "image",
                "size_kb": size_kb,
                "path": full_path
            })

    return scenarios, media_files

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Autonomous Vehicle Planning API"}

@app.get("/api/hardware")
def get_hardware():
    return get_hardware_info()

class HardwareSelectRequest(BaseModel):
    device: str

@app.post("/api/hardware/select")
def select_hardware(req: HardwareSelectRequest):
    global yolo_detector
    result = set_hardware_device(req.device)
    if yolo_detector is not None:
        yolo_detector.set_device(result["device"])
    return result

@app.get("/api/scenarios")
def get_scenarios():
    scenarios, _ = scan_scenarios_and_media()
    return {"scenarios": scenarios, "count": len(scenarios)}

@app.get("/api/scenarios/{scenario_id}")
def get_scenario(scenario_id: str):
    scenarios, _ = scan_scenarios_and_media()
    for s in scenarios:
        if s["id"] == scenario_id:
            return s
    raise HTTPException(status_code=404, detail="Scenario not found")

@app.post("/api/rescan-data")
def rescan_data():
    scenarios, media_files = scan_scenarios_and_media()
    custom_scenarios = [s for s in scenarios if s.get("is_custom")]
    return {
        "message": "Data directory rescanned successfully",
        "custom_scenarios": custom_scenarios,
        "media_files": media_files,
        "total_scenarios": len(scenarios),
        "total_media": len(media_files)
    }

@app.get("/api/vision/media-files")
def get_media_files():
    _, media_files = scan_scenarios_and_media()
    return {"media_files": media_files}

class SimulationRequest(BaseModel):
    scenario_id: str
    max_speed_mps: Optional[float] = None
    safety_buffer_m: Optional[float] = 7.0
    sensor_noise: Optional[float] = 0.0
    algorithm: Optional[str] = "bezier" # "bezier", "spline", "rrt_star"

@app.post("/api/simulate")
def run_simulation_endpoint(req: SimulationRequest):
    scenarios, _ = scan_scenarios_and_media()
    target_scenario = None
    for s in scenarios:
        if s["id"] == req.scenario_id:
            target_scenario = s
            break

    if not target_scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found")

    params = {
        "max_speed_mps": req.max_speed_mps or target_scenario["ego_start"].get("max_speed_mps", 20.0),
        "safety_buffer_m": req.safety_buffer_m or 7.0,
        "sensor_noise": req.sensor_noise or 0.0,
        "algorithm": req.algorithm or "bezier"
    }

    simulator = ScenarioSimulator()
    result = simulator.run_simulation(target_scenario, params)

    # Persist in SQLite
    run_record = {
        "scenario_id": target_scenario["id"],
        "scenario_name": target_scenario["name"],
        "algorithm": params["algorithm"],
        "status": result["summary"]["status"],
        "safety_score": result["summary"]["safety_score"],
        "collision_count": result["summary"]["collision_count"],
        "avg_latency_ms": result["summary"]["avg_latency_ms"],
        "max_deviation_m": result["summary"]["max_deviation_m"],
        "avg_deviation_m": result["summary"]["avg_deviation_m"],
        "max_jerk": result["summary"]["max_jerk_mps3"],
        "duration_sec": result["summary"]["simulated_time_sec"],
        "parameters": params,
        "telemetry_summary": result["summary"]
    }
    run_id = save_run(run_record)
    result["summary"]["run_id"] = run_id

    return result

@app.post("/api/vision/infer")
async def vision_infer(
    file: Optional[UploadFile] = File(None),
    filename: Optional[str] = Form(None),
    conf_threshold: float = Form(0.25),
    corridor_width: float = Form(1.0),
    horizon_cutoff: float = Form(0.55),
    detection_mode: str = Form("curved"),
    sensitivity: float = Form(1.0),
    generate_debug_mask: bool = Form(True)
):
    lane_det, yolo_det = get_detectors()
    img_bgr = None

    # Option 1: File uploaded from UI
    if file:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    # Option 2: Pre-existing file from add_data/media/
    elif filename:
        media_path = os.path.join(ADD_DATA_MEDIA, filename)
        if not os.path.exists(media_path):
            raise HTTPException(status_code=404, detail=f"Media file '{filename}' not found in add_data/media/")
        img_bgr = cv2.imread(media_path)

    if img_bgr is None:
        raise HTTPException(status_code=400, detail="Could not load or decode image")

    # Step 1: YOLOv8 Object Detection on pristine image
    _, detected_objects, yolo_telemetry = yolo_det.detect(img_bgr, conf_threshold=conf_threshold)

    # Step 2: Advanced Safe Area & Lane Detection with obstacle awareness & curvature
    lane_annotated, lane_telemetry = lane_det.detect(
        img_bgr,
        corridor_width_mult=corridor_width,
        horizon_pct=horizon_cutoff,
        obstacles=detected_objects,
        detection_mode=detection_mode,
        sensitivity=sensitivity,
        generate_debug_mask=generate_debug_mask
    )

    # Step 3: Draw YOLO bounding boxes on top of safe area overlay
    full_annotated = lane_annotated
    for obj in detected_objects:
        x1, y1, x2, y2 = obj["bbox"]
        color = yolo_det.CLASS_COLORS.get(obj["class"], (0, 255, 0))
        cv2.rectangle(full_annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{obj['class']} {obj['confidence']:.2f} | {obj['estimated_distance_m']}m"
        cv2.putText(full_annotated, label, (x1, max(20, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

    # Step 4: Base64 Encode Annotated Result
    _, buffer = cv2.imencode(".jpg", full_annotated, [cv2.IMWRITE_JPEG_QUALITY, 88])
    base64_image = base64.b64encode(buffer).decode("utf-8")

    total_latency_ms = round(lane_telemetry["latency_ms"] + yolo_telemetry["latency_ms"], 2)

    return {
        "annotated_image": f"data:image/jpeg;base64,{base64_image}",
        "detected_objects": detected_objects,
        "lane_telemetry": lane_telemetry,
        "yolo_telemetry": yolo_telemetry,
        "total_latency_ms": total_latency_ms,
        "image_dimensions": {"width": img_bgr.shape[1], "height": img_bgr.shape[0]}
    }

def generate_video_stream(
    video_path: str,
    conf_threshold: float = 0.25,
    corridor_width: float = 1.0,
    horizon_cutoff: float = 0.55,
    detection_mode: str = "curved",
    sensitivity: float = 1.0
):
    """
    Decodes video frames, runs real-time lane detection + YOLOv8 inference,
    and yields a continuous multipart MJPEG stream.
    """
    cap = cv2.VideoCapture(video_path)
    lane_det, yolo_det = get_detectors()
    frame_idx = 0
    cached_boxes = []

    while True:
        ret, frame = cap.read()
        if not ret:
            # Auto-loop video stream
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            if not ret:
                break

        frame_idx += 1
        # Object detection runs periodically for high real-time throughput
        if frame_idx % 2 == 0 or len(cached_boxes) == 0:
            _, cached_boxes, yolo_tel = yolo_det.detect(frame, conf_threshold=conf_threshold)

        # Advanced safe area & lane detection with obstacle awareness & user calibration
        lane_annotated, lane_tel = lane_det.detect(
            frame,
            corridor_width_mult=corridor_width,
            horizon_pct=horizon_cutoff,
            obstacles=cached_boxes,
            detection_mode=detection_mode,
            sensitivity=sensitivity,
            generate_debug_mask=False
        )

        full_annotated = lane_annotated
        for obj in cached_boxes:
            x1, y1, x2, y2 = obj["bbox"]
            color = yolo_det.CLASS_COLORS.get(obj["class"], (0, 255, 255))
            cv2.rectangle(full_annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{obj['class']} {obj['confidence']:.2f} | {obj['estimated_distance_m']}m"
            cv2.putText(full_annotated, label, (x1, max(20, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        # Encode frame as JPEG
        _, jpeg = cv2.imencode(".jpg", full_annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n")

    cap.release()

@app.get("/api/vision/video-stream")
def video_stream_endpoint(
    filename: str = "sample_dashcam.mp4",
    conf_threshold: float = 0.25,
    corridor_width: float = 1.0,
    horizon_cutoff: float = 0.55,
    detection_mode: str = "curved",
    sensitivity: float = 1.0
):
    media_path = os.path.join(ADD_DATA_MEDIA, filename)
    if not os.path.exists(media_path):
        raise HTTPException(status_code=404, detail=f"Video file '{filename}' not found in add_data/media/")
    return StreamingResponse(
        generate_video_stream(media_path, conf_threshold, corridor_width, horizon_cutoff, detection_mode, sensitivity),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.post("/api/vision/upload-media")
async def upload_media_endpoint(file: UploadFile = File(...)):
    """
    Uploads a video (.mp4) or image file directly into add_data/media/
    so it becomes instantly available for live streaming or vision inference.
    """
    valid_exts = (".mp4", ".jpg", ".jpeg", ".png", ".avi", ".mov")
    if not any(file.filename.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .mp4, .jpg, or .png")

    filename = os.path.basename(file.filename)
    dest_path = os.path.join(ADD_DATA_MEDIA, filename)

    contents = await file.read()
    with open(dest_path, "wb") as f:
        f.write(contents)

    size_kb = round(len(contents) / 1024, 1)
    file_type = "video" if filename.lower().endswith((".mp4", ".avi", ".mov")) else "image"

    return {
        "message": f"Successfully uploaded {filename} to add_data/media/",
        "filename": filename,
        "type": file_type,
        "size_kb": size_kb
    }

class FrameInferRequest(BaseModel):
    image_base64: str
    conf_threshold: Optional[float] = 0.25
    corridor_width: Optional[float] = 1.0
    horizon_cutoff: Optional[float] = 0.55

@app.post("/api/vision/infer-frame")
def infer_frame_endpoint(req: FrameInferRequest):
    """
    Accepts raw frame from live webcam or video player, executes hybrid perception,
    and returns annotated image + telemetry in real-time.
    """
    lane_det, yolo_det = get_detectors()
    try:
        # Strip data URL header if present
        data = req.image_base64
        if "," in data:
            data = data.split(",")[1]
        img_bytes = base64.b64decode(data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise HTTPException(status_code=400, detail="Cannot decode image frame")

        corridor_w = req.corridor_width if req.corridor_width is not None else 1.0
        horizon_c = req.horizon_cutoff if req.horizon_cutoff is not None else 0.55

        _, detected_objects, yolo_tel = yolo_det.detect(img_bgr, conf_threshold=req.conf_threshold)
        lane_annotated, lane_tel = lane_det.detect(
            img_bgr,
            corridor_width_mult=corridor_w,
            horizon_pct=horizon_c,
            obstacles=detected_objects
        )

        full_annotated = lane_annotated
        for obj in detected_objects:
            x1, y1, x2, y2 = obj["bbox"]
            color = yolo_det.CLASS_COLORS.get(obj["class"], (0, 255, 0))
            cv2.rectangle(full_annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{obj['class']} {obj['confidence']:.2f} | {obj['estimated_distance_m']}m"
            cv2.putText(full_annotated, label, (x1, max(20, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

        _, buffer = cv2.imencode(".jpg", full_annotated, [cv2.IMWRITE_JPEG_QUALITY, 78])
        out_base64 = base64.b64encode(buffer).decode("utf-8")
        total_latency = round(lane_tel["latency_ms"] + yolo_tel["latency_ms"], 2)

        return {
            "annotated_image": f"data:image/jpeg;base64,{out_base64}",
            "detected_objects": detected_objects,
            "lane_telemetry": lane_tel,
            "yolo_telemetry": yolo_tel,
            "total_latency_ms": total_latency
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Frame inference error: {str(e)}")

@app.get("/api/runs")
def get_runs():
    runs = list_runs()
    return {"runs": runs, "count": len(runs)}

@app.get("/api/runs/{run_id}")
def get_single_run(run_id: str):
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

@app.delete("/api/runs/{run_id}")
def remove_run(run_id: str):
    deleted = delete_run(run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"message": "Run deleted successfully", "id": run_id}

@app.get("/api/runs/export/csv")
def export_runs_csv():
    runs = list_runs(limit=500)
    import io
    import csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Run ID", "Timestamp", "Scenario ID", "Scenario Name", "Algorithm",
        "Status", "Safety Score", "Collisions", "Avg Latency (ms)",
        "Max Deviation (m)", "Avg Deviation (m)", "Max Jerk (m/s^3)", "Simulated Time (s)"
    ])
    for r in runs:
        writer.writerow([
            r["id"], r["timestamp"], r["scenario_id"], r["scenario_name"], r["algorithm"],
            r["status"], r["safety_score"], r["collision_count"], r["avg_latency_ms"],
            r["max_deviation_m"], r["avg_deviation_m"], r["max_jerk"], r["duration_sec"]
        ])
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=backtest_runs.csv"})

@app.get("/api/runs/export/json")
def export_runs_json():
    runs = list_runs(limit=500)
    return JSONResponse(content={"runs": runs})

@app.post("/api/scenarios/upload")
async def upload_scenario(file: UploadFile = File(...)):
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only JSON scenario files are supported")
    try:
        content = await file.read()
        scenario_data = json.loads(content)
        # Validate schema minimally
        if "id" not in scenario_data or "road" not in scenario_data or "ego_start" not in scenario_data:
            raise HTTPException(status_code=400, detail="Invalid scenario schema. Must contain 'id', 'road', and 'ego_start'")
        save_path = os.path.join(ADD_DATA_SCENARIOS, os.path.basename(file.filename))
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(scenario_data, f, indent=2)
        return {"message": "Scenario uploaded successfully to add_data/scenarios", "scenario": scenario_data}
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Malformed JSON file")

# Mount frontend/dist if available
from fastapi.staticfiles import StaticFiles
FRONTEND_DIST = os.path.join(ROOT_DIR, "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            with open(index_file, "r", encoding="utf-8") as f:
                return Response(content=f.read(), media_type="text/html")
        return {"message": "Frontend build not found"}
