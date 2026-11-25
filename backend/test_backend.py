import sys
import os
sys.path.append(os.path.dirname(__file__))

from api.main import scan_scenarios_and_media, get_detectors
from engine.simulator import ScenarioSimulator
import database
import cv2

def run_tests():
    print("Testing backend modules...")
    scenarios, media = scan_scenarios_and_media()
    print(f"Discovered {len(scenarios)} scenarios, {len(media)} media files:")
    for s in scenarios:
        badge = "[Custom]" if s.get("is_custom") else "[Built-In]"
        print(f"  * {badge} {s['id']}: {s['name']}")

    print("\nRunning simulation test on Highway Cruise scenario...")
    sim = ScenarioSimulator()
    highway_scenario = next(s for s in scenarios if s["id"] == "highway_cruise_overtake")
    res = sim.run_simulation(highway_scenario, {"algorithm": "bezier", "safety_buffer_m": 7.0})
    print("Highway Simulation result status:", res["summary"]["status"])
    print("Highway Safety score:", res["summary"]["safety_score"])
    print("Highway Criteria checks:", res["summary"]["criteria_checks"])
    print("Total frames generated:", len(res["frames"]))

    print("\nTesting Vision Pipeline on sample image...")
    lane_det, yolo_det = get_detectors()
    test_img_path = media[0]["path"]
    img = cv2.imread(test_img_path)
    lane_annotated, lane_tel = lane_det.detect(img)
    final_annotated, objs, yolo_tel = yolo_det.detect(lane_annotated)
    total_ms = lane_tel["latency_ms"] + yolo_tel["latency_ms"]
    print(f"Vision executed on {os.path.basename(test_img_path)}:")
    print(f"  * Detected objects: {len(objs)}")
    print(f"  * Lane latency: {lane_tel['latency_ms']} ms, YOLO latency: {yolo_tel['latency_ms']} ms")
    print(f"  * Total latency: {total_ms:.1f} ms")

    print("\nTesting database persistence...")
    run_id = database.save_run({
        "scenario_id": scenarios[0]["id"],
        "scenario_name": scenarios[0]["name"],
        "algorithm": "bezier",
        "status": res["summary"]["status"],
        "safety_score": res["summary"]["safety_score"],
        "collision_count": res["summary"]["collision_count"],
        "avg_latency_ms": res["summary"]["avg_latency_ms"],
        "max_deviation_m": res["summary"]["max_deviation_m"],
        "avg_deviation_m": res["summary"]["avg_deviation_m"],
        "max_jerk": res["summary"]["max_jerk_mps3"],
        "duration_sec": res["summary"]["simulated_time_sec"],
        "parameters": {"algorithm": "bezier"},
        "telemetry_summary": res["summary"]
    })
    runs = database.list_runs()
    print(f"Successfully saved run {run_id}. Total runs in DB: {len(runs)}")
    print("ALL BACKEND MODULES OPERATIONAL!")

if __name__ == "__main__":
    run_tests()
