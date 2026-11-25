import sys
import os
sys.path.append(os.path.dirname(__file__))

from api.main import scan_scenarios_and_media
from engine.simulator import ScenarioSimulator

scenarios, _ = scan_scenarios_and_media()
sim = ScenarioSimulator()

print(f"{'SCENARIO ID':<30} {'STATUS':<6} {'SCORE':<6} {'COLLISIONS':<11} {'LATENCY':<10} {'DEVIATION':<10}")
print("-" * 75)

for sc in scenarios:
    for algo in ["bezier", "spline", "rrt_star"]:
        res = sim.run_simulation(sc, {"algorithm": algo, "safety_buffer_m": 7.0})
        s = res["summary"]
        print(f"{sc['id'][:25] + ' (' + algo + ')':<30} {s['status']:<6} {s['safety_score']:<6} {s['collision_count']:<11} {s['avg_latency_ms']:<10} {s['avg_deviation_m']:<10}")
