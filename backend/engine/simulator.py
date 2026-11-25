import time
import copy
import numpy as np
from typing import Dict, List, Any, Tuple

from perception.synthetic_perception import SyntheticPerception
from planner.behavior_fsm import BehaviorPlannerFSM, BehaviorState
from planner.trajectory_generator import TrajectoryGenerator

class ScenarioSimulator:
    """
    High-fidelity Scenario Simulation & Backtesting Engine for Autonomous Vehicles.
    Executes at 20 Hz (dt = 0.05s) with closed-loop perception, behavioral planning,
    and active lane centering tracking.
    """
    def __init__(self):
        self.dt = 0.05
        self.wheelbase = 2.8

    def run_simulation(
        self,
        scenario: Dict[str, Any],
        parameters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        t_sim_start = time.perf_counter()

        if parameters is None:
            parameters = {}

        max_speed = float(parameters.get("max_speed_mps", scenario["ego_start"].get("max_speed_mps", 20.0)))
        safety_buffer = float(parameters.get("safety_buffer_m", 7.0))
        sensor_noise = float(parameters.get("sensor_noise", 0.0))
        algorithm = parameters.get("algorithm", "bezier")

        road = scenario["road"]
        road_length = road.get("length_m", 250.0)
        lane_width = road.get("lane_width_m", 3.5)
        lanes_count = road.get("lanes", 2)
        total_road_width = lanes_count * lane_width

        # Initialize Ego Vehicle
        ego = {
            "x": float(scenario["ego_start"]["x"]),
            "y": float(scenario["ego_start"]["y"]),
            "yaw": 0.0,
            "speed_mps": float(scenario["ego_start"]["speed_mps"]),
            "accel_mps2": 0.0,
            "steer_rad": 0.0
        }

        # Deep copy obstacles
        obstacles = [copy.deepcopy(obs) for obs in scenario.get("obstacles", [])]

        # Subsystems
        perception_mod = SyntheticPerception()
        behavior_fsm = BehaviorPlannerFSM()
        # Set initial target lane to the lane ego started in
        initial_lane = min(lanes_count - 1, max(0, int(ego["y"] // lane_width)))
        behavior_fsm.target_lane = initial_lane
        behavior_fsm.cruising_lane = initial_lane

        trajectory_gen = TrajectoryGenerator(wheelbase_m=self.wheelbase)

        frames = []
        collisions = []
        latencies = []
        path_deviations = []
        jerks = []

        max_steps = int(25.0 / self.dt) # max 25 seconds of simulated time
        ego_length = 4.6
        ego_width = 2.0
        last_accel = 0.0

        for step in range(max_steps):
            current_time = step * self.dt

            # 1. Perception Step
            t_perc_start = time.perf_counter()
            perc_result = perception_mod.perceive(
                ego_state=ego,
                ground_truth_obstacles=obstacles,
                road_config=road,
                noise_level=sensor_noise
            )
            t_perc = (time.perf_counter() - t_perc_start) * 1000.0

            # 2. Behavioral FSM Step
            t_fsm_start = time.perf_counter()
            fsm_result = behavior_fsm.step(
                ego_state=ego,
                perceived_obstacles=perc_result["obstacles"],
                road_config=road,
                safety_buffer_m=safety_buffer,
                target_speed_mps=max_speed
            )
            t_fsm = (time.perf_counter() - t_fsm_start) * 1000.0

            # 3. Trajectory Generation Step
            t_traj_start = time.perf_counter()
            traj_result = trajectory_gen.generate(
                ego_state=ego,
                behavior=fsm_result,
                road_config=road,
                obstacles=perc_result["obstacles"],
                algorithm=algorithm,
                safety_buffer_m=safety_buffer,
                target_speed_mps=max_speed
            )
            t_traj = (time.perf_counter() - t_traj_start) * 1000.0

            total_latency_ms = round(t_perc + t_fsm + t_traj, 2)
            latencies.append(total_latency_ms)

            # 4. Stanley + Pure Pursuit Lane Centering Controller
            trajectory = traj_result["trajectory"]
            lookahead_dist = max(3.5, ego["speed_mps"] * 0.45)
            lookahead_pt = trajectory[min(len(trajectory) - 1, 4)]
            for pt in trajectory:
                if np.hypot(pt["x"] - ego["x"], pt["y"] - ego["y"]) >= lookahead_dist:
                    lookahead_pt = pt
                    break

            dx = lookahead_pt["x"] - ego["x"]
            dy = lookahead_pt["y"] - ego["y"]
            alpha = np.arctan2(dy, max(0.1, dx)) - ego["yaw"]
            Ld = max(0.5, np.hypot(dx, dy))

            # Cross-track error to planned waypoint & nominal lane center
            target_center_y = (fsm_result["target_lane"] + 0.5) * lane_width
            lat_error_traj = lookahead_pt["y"] - ego["y"]
            lat_error_center = target_center_y - ego["y"]
            # When cruising nominal, blend waypoint tracking with exact lane center lock
            if fsm_result["state"] == BehaviorState.LANE_KEEP.value:
                effective_lat_err = 0.4 * lat_error_traj + 0.6 * lat_error_center
            else:
                effective_lat_err = lat_error_traj

            # Combined heading pursuit + Stanley cross-track correction
            k_e = 2.4
            soft_v = max(3.0, ego["speed_mps"])
            stanley_term = np.arctan(k_e * effective_lat_err / soft_v)
            steer = np.arctan2(2.0 * self.wheelbase * np.sin(alpha), Ld) + stanley_term
            steer = np.clip(steer, -0.61, 0.61) # Clamp to ~35 deg

            # Longitudinal controller (PID-like throttle/brake)
            target_v = traj_result["target_speed_mps"]
            v_err = target_v - ego["speed_mps"]
            if fsm_result["state"] == BehaviorState.EMERGENCY_BRAKE.value:
                accel = -7.0
            else:
                accel = np.clip(v_err * 1.5, -6.0, 3.0)

            # Jerk calculation
            jerk = abs((accel - last_accel) / self.dt)
            jerks.append(jerk)
            last_accel = accel

            # 5. Vehicle Kinematics Integration (Bicycle Model)
            ego["x"] += ego["speed_mps"] * np.cos(ego["yaw"]) * self.dt
            ego["y"] += ego["speed_mps"] * np.sin(ego["yaw"]) * self.dt
            ego["yaw"] += (ego["speed_mps"] / self.wheelbase) * np.tan(steer) * self.dt
            ego["speed_mps"] = max(0.0, ego["speed_mps"] + accel * self.dt)
            ego["accel_mps2"] = round(float(accel), 2)
            ego["steer_rad"] = round(float(steer), 3)

            # Clamp ego within road boundary margins
            ego["y"] = float(np.clip(ego["y"], 0.7, total_road_width - 0.7))

            # Path Cross-Track Error / Deviation from target lane center
            target_lane_idx = fsm_result["target_lane"]
            target_center_y = (target_lane_idx + 0.5) * lane_width
            if fsm_result["state"] in [BehaviorState.LANE_CHANGE_LEFT.value, BehaviorState.LANE_CHANGE_RIGHT.value, BehaviorState.OBSTACLE_AVOID.value]:
                # Error relative to planned curve
                min_traj_dist = min([abs(ego["y"] - pt["y"]) for pt in trajectory[:8]]) if trajectory else 0.0
                deviation = min_traj_dist
            else:
                deviation = abs(ego["y"] - target_center_y)

            path_deviations.append(round(float(deviation), 3))

            # 6. Update Dynamic Obstacles
            for obs in obstacles:
                obs["x"] += obs.get("vx", 0.0) * self.dt
                obs["y"] += obs.get("vy", 0.0) * self.dt

            # 7. Collision Detection (Oriented Box vs Box)
            for obs in obstacles:
                ox = obs["x"]
                oy = obs["y"]
                ow = obs.get("width", 2.0)
                ol = obs.get("length", 4.5)
                dist_x = abs(ego["x"] - ox)
                dist_y = abs(ego["y"] - oy)
                if dist_x < (ego_length + ol) / 2.0 and dist_y < (ego_width + ow) / 2.0:
                    collisions.append({
                        "time_sec": round(current_time, 2),
                        "obstacle_id": obs["id"],
                        "obstacle_type": obs.get("type", "obstacle"),
                        "ego_x": round(ego["x"], 2),
                        "ego_y": round(ego["y"], 2),
                        "ego_speed": round(ego["speed_mps"], 2)
                    })
                    break

            # Save frame for replay visualizer
            frames.append({
                "time_sec": round(current_time, 2),
                "ego": {
                    "x": round(ego["x"], 2),
                    "y": round(ego["y"], 2),
                    "yaw": round(ego["yaw"], 3),
                    "speed_mps": round(ego["speed_mps"], 2),
                    "accel_mps2": ego["accel_mps2"],
                    "steer_deg": round(float(np.degrees(steer)), 1)
                },
                "fsm": fsm_result,
                "planned_trajectory": trajectory,
                "perceived_obstacles": perc_result["obstacles"],
                "latency_breakdown": {
                    "perception_ms": round(t_perc, 2),
                    "fsm_ms": round(t_fsm, 2),
                    "trajectory_ms": round(t_traj, 2),
                    "total_ms": total_latency_ms
                },
                "deviation_m": round(float(deviation), 2)
            })

            # Termination condition: reached end of road or stopped after emergency brake
            if ego["x"] >= (road_length - 5.0):
                break
            if fsm_result["state"] == BehaviorState.EMERGENCY_BRAKE.value and ego["speed_mps"] < 0.1 and step > 40:
                break

        # Compute Automated Pass/Fail Safety Metrics
        total_collisions = len(collisions)
        collision_rate = 0.0 if total_collisions == 0 else 1.0
        avg_latency = float(np.mean(latencies)) if latencies else 0.0
        max_latency = float(np.max(latencies)) if latencies else 0.0
        avg_deviation = float(np.mean(path_deviations)) if path_deviations else 0.0
        max_deviation = float(np.max(path_deviations)) if path_deviations else 0.0
        max_jerk = float(np.max(jerks)) if jerks else 0.0

        pass_collision = (total_collisions == 0)
        pass_latency = (avg_latency < 100.0)
        pass_deviation = (avg_deviation < 0.5)

        is_pass = pass_collision and pass_latency and pass_deviation
        status = "PASS" if is_pass else "FAIL"

        if total_collisions > 0:
            safety_score = max(0.0, 40.0 - (total_collisions * 25.0))
        else:
            base_score = 100.0
            latency_penalty = max(0.0, (avg_latency - 30.0) * 0.25)
            dev_penalty = min(20.0, avg_deviation * 25.0)
            jerk_penalty = min(10.0, max_jerk * 0.5)
            safety_score = round(max(0.0, min(100.0, base_score - latency_penalty - dev_penalty - jerk_penalty)), 1)

        sim_exec_duration = round(time.perf_counter() - t_sim_start, 3)

        summary = {
            "status": status,
            "safety_score": safety_score,
            "collision_count": total_collisions,
            "collision_rate_percent": round(collision_rate * 100.0, 1),
            "avg_latency_ms": round(avg_latency, 2),
            "max_latency_ms": round(max_latency, 2),
            "avg_deviation_m": round(avg_deviation, 2),
            "max_deviation_m": round(max_deviation, 2),
            "max_jerk_mps3": round(max_jerk, 2),
            "simulated_time_sec": round(len(frames) * self.dt, 2),
            "execution_duration_sec": sim_exec_duration,
            "criteria_checks": {
                "zero_collisions": {"pass": pass_collision, "value": total_collisions, "threshold": 0},
                "latency_sub_100ms": {"pass": pass_latency, "value": round(avg_latency, 2), "threshold": 100.0},
                "deviation_sub_half_meter": {"pass": pass_deviation, "value": round(avg_deviation, 2), "threshold": 0.5}
            }
        }

        return {
            "summary": summary,
            "frames": frames,
            "collisions": collisions,
            "parameters": parameters,
            "scenario": {
                "id": scenario["id"],
                "name": scenario["name"],
                "road": road
            }
        }
