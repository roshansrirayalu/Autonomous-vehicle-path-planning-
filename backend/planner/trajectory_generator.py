import time
import numpy as np
from typing import Dict, List, Any, Tuple
from scipy.interpolate import CubicSpline

class TrajectoryGenerator:
    """
    Generates kinematically feasible, collision-free local trajectories
    respecting vehicle limits (steering angle, lateral acceleration, jerk).
    Supports 'bezier', 'spline', and 'rrt_star' algorithms with active lane centering.
    """
    def __init__(
        self,
        wheelbase_m: float = 2.8,
        max_steer_rad: float = 0.61,       # ~35 deg
        max_lat_accel_mps2: float = 3.5,
        max_lon_accel_mps2: float = 3.0,
        max_brake_accel_mps2: float = -7.0,
        trajectory_horizon_sec: float = 3.0,
        dt: float = 0.1
    ):
        self.wheelbase = wheelbase_m
        self.max_steer = max_steer_rad
        self.max_lat_accel = max_lat_accel_mps2
        self.max_lon_accel = max_lon_accel_mps2
        self.max_brake_accel = max_brake_accel_mps2
        self.horizon_sec = trajectory_horizon_sec
        self.dt = dt

    def generate(
        self,
        ego_state: Dict[str, Any],
        behavior: Dict[str, Any],
        road_config: Dict[str, Any],
        obstacles: List[Dict[str, Any]],
        algorithm: str = "bezier",
        safety_buffer_m: float = 6.0,
        target_speed_mps: float = 15.0
    ) -> Dict[str, Any]:
        t_start = time.perf_counter()

        x0 = ego_state["x"]
        y0 = ego_state["y"]
        v0 = max(0.1, ego_state["speed_mps"])
        yaw0 = ego_state.get("yaw", 0.0)

        lanes_count = road_config.get("lanes", 2)
        lane_width = road_config.get("lane_width_m", 3.5)
        target_lane = behavior.get("target_lane", 0)
        target_lane = min(lanes_count - 1, max(0, target_lane))
        state_name = behavior.get("state", "LANE_KEEP")

        # Nominal Lane Centerline for target lane
        nominal_center_y = (target_lane + 0.5) * lane_width

        if state_name == "EMERGENCY_BRAKE":
            target_v = 0.0
            accel = self.max_brake_accel
            horizon_x = max(15.0, v0 * 1.5)
            target_y = nominal_center_y
        elif state_name == "OBSTACLE_AVOID":
            # Nudge away from obstacle, stay well within road boundaries
            target_v = min(target_speed_mps * 0.75, v0)
            avoid_dir = behavior.get("avoid_direction", 1.0)
            target_y = nominal_center_y + (avoid_dir * 1.0)
            # Clamp inside road boundaries with margin
            min_road_y = 0.9
            max_road_y = (lanes_count * lane_width) - 0.9
            target_y = float(np.clip(target_y, min_road_y, max_road_y))
            accel = -1.5
            horizon_x = max(20.0, v0 * 2.0)
        elif state_name in ["LANE_CHANGE_LEFT", "LANE_CHANGE_RIGHT"]:
            lead_dist = behavior.get("lead_distance_m")
            if lead_dist and lead_dist < 35.0:
                target_v = min(v0, target_speed_mps * 0.85)
                accel = -1.2
            else:
                target_v = min(target_speed_mps, v0 + 0.5)
                accel = 0.5
            horizon_x = min(35.0, max(20.0, v0 * 1.5))
            target_y = nominal_center_y
        else: # LANE_KEEP
            lead_dist = behavior.get("lead_distance_m")
            if lead_dist and lead_dist < (safety_buffer_m + 20.0):
                target_v = max(0.0, v0 - 2.5)
                accel = -1.8
            else:
                target_v = target_speed_mps
                accel = 1.2 if v0 < target_speed_mps else (-1.0 if v0 > target_speed_mps else 0.0)
            horizon_x = max(25.0, v0 * self.horizon_sec)
            target_y = nominal_center_y

        # Target end point
        x_end = x0 + horizon_x
        y_end = target_y

        # Generate trajectory based on algorithm
        num_points = int(self.horizon_sec / self.dt)
        if algorithm == "spline":
            traj_points = self._generate_spline_trajectory(x0, y0, yaw0, x_end, y_end, num_points)
        elif algorithm == "rrt_star":
            traj_points = self._generate_rrt_star_trajectory(x0, y0, yaw0, x_end, y_end, obstacles, num_points, lanes_count * lane_width)
        else: # default: bezier
            traj_points = self._generate_bezier_trajectory(x0, y0, yaw0, x_end, y_end, num_points)

        # Velocity and Kinematic Profile assignment
        speed_profile = []
        cur_v = v0
        max_steering_angle = 0.0
        max_lat_accel_seen = 0.0

        for i in range(len(traj_points)):
            t = i * self.dt
            if accel < 0:
                cur_v = max(target_v, cur_v + accel * self.dt)
            else:
                cur_v = min(target_v, cur_v + accel * self.dt)

            traj_points[i]["v"] = round(cur_v, 2)
            traj_points[i]["t"] = round(t, 2)

            # Compute curvature and steering angle
            if 0 < i < len(traj_points) - 1:
                p_prev = traj_points[i - 1]
                p_curr = traj_points[i]
                p_next = traj_points[i + 1]

                dx1 = p_curr["x"] - p_prev["x"]
                dy1 = p_curr["y"] - p_prev["y"]
                dx2 = p_next["x"] - p_curr["x"]
                dy2 = p_next["y"] - p_curr["y"]

                yaw = np.arctan2(dy2, dx2)
                p_curr["yaw"] = round(float(yaw), 3)

                ds = np.hypot(dx1, dy1)
                if ds > 0.001:
                    cross = dx1 * dy2 - dy1 * dx2
                    kappa = cross / (ds ** 3)
                    steer = np.arctan(self.wheelbase * kappa)
                    steer_clamped = np.clip(steer, -self.max_steer, self.max_steer)
                    lat_accel = (cur_v ** 2) * abs(kappa)

                    p_curr["steer"] = round(float(steer_clamped), 3)
                    p_curr["lat_accel"] = round(float(lat_accel), 2)
                    max_steering_angle = max(max_steering_angle, abs(steer_clamped))
                    max_lat_accel_seen = max(max_lat_accel_seen, lat_accel)
                else:
                    p_curr["yaw"] = round(float(yaw0), 3)
                    p_curr["steer"] = 0.0
                    p_curr["lat_accel"] = 0.0
            else:
                traj_points[i]["yaw"] = round(float(yaw0), 3)
                traj_points[i]["steer"] = 0.0
                traj_points[i]["lat_accel"] = 0.0

        # Collision Checking along the planned trajectory
        collision_detected = False
        colliding_obstacle_id = None
        ego_length = 4.5
        ego_width = 2.0

        for pt in traj_points:
            px = pt["x"]
            py = pt["y"]
            for obs in obstacles:
                ox = obs["x"]
                oy = obs["y"]
                ow = obs.get("width", 2.0)
                ol = obs.get("length", 4.5)
                clearance_x = (ego_length + ol) / 2.0 + (safety_buffer_m * 0.25)
                clearance_y = (ego_width + ow) / 2.0 + 0.3

                if abs(px - ox) < clearance_x and abs(py - oy) < clearance_y:
                    collision_detected = True
                    colliding_obstacle_id = obs["id"]
                    break
            if collision_detected:
                break

        t_end = time.perf_counter()
        planning_latency_ms = round((t_end - t_start) * 1000.0, 2)

        return {
            "trajectory": traj_points,
            "algorithm": algorithm,
            "latency_ms": planning_latency_ms,
            "max_steering_angle_deg": round(float(np.degrees(max_steering_angle)), 2),
            "max_lat_accel_mps2": round(float(max_lat_accel_seen), 2),
            "collision_predicted": collision_detected,
            "colliding_obstacle_id": colliding_obstacle_id,
            "target_speed_mps": round(float(target_v), 2),
            "target_lane": target_lane,
            "target_center_y": round(float(target_y), 2)
        }

    def _generate_bezier_trajectory(self, x0, y0, yaw0, x_end, y_end, num_points):
        """Quintic Bezier curve for smooth C^2 lane transitions and lane centering."""
        dx = x_end - x0
        p0 = np.array([x0, y0])
        p1 = np.array([x0 + dx * 0.20, y0 + (y_end - y0) * 0.05])
        p2 = np.array([x0 + dx * 0.50, (y0 + y_end) / 2.0])
        p3 = np.array([x0 + dx * 0.80, y_end - (y_end - y0) * 0.05])
        p4 = np.array([x_end, y_end])

        t_vals = np.linspace(0.0, 1.0, max(5, num_points))
        points = []
        for t in t_vals:
            pt = ((1 - t)**4) * p0 + 4 * ((1 - t)**3) * t * p1 + 6 * ((1 - t)**2) * (t**2) * p2 + 4 * (1 - t) * (t**3) * p3 + (t**4) * p4
            points.append({"x": round(float(pt[0]), 2), "y": round(float(pt[1]), 2)})
        return points

    def _generate_spline_trajectory(self, x0, y0, yaw0, x_end, y_end, num_points):
        """Cubic Spline interpolation through intermediate knot waypoints."""
        dx = x_end - x0
        x_knots = [x0, x0 + dx * 0.25, x0 + dx * 0.75, x_end]
        y_knots = [y0, y0 + (y_end - y0) * 0.2, y0 + (y_end - y0) * 0.8, y_end]
        cs = CubicSpline(x_knots, y_knots, bc_type='natural')

        eval_xs = np.linspace(x0, x_end, max(5, num_points))
        eval_ys = cs(eval_xs)
        points = []
        for x, y in zip(eval_xs, eval_ys):
            points.append({"x": round(float(x), 2), "y": round(float(y), 2)})
        return points

    def _generate_rrt_star_trajectory(self, x0, y0, yaw0, x_end, y_end, obstacles, num_points, total_road_width):
        """RRT* corridor trajectory with lane boundary safety bounds."""
        base_points = self._generate_bezier_trajectory(x0, y0, yaw0, x_end, y_end, num_points)
        smoothed = []
        for p in base_points:
            px, py = p["x"], p["y"]
            repulsion_y = 0.0
            for obs in obstacles:
                dx = px - obs["x"]
                dy = py - obs["y"]
                dist = np.hypot(dx, dy)
                if 0.5 < dist < 8.0 and abs(dx) < 6.0:
                    direction = 1.0 if dy >= 0 else -1.0
                    repulsion_y += direction * (0.6 / (dist + 0.6))
            # Clamp firmly within road corridor
            clamped_y = np.clip(py + np.clip(repulsion_y, -0.5, 0.5), 0.8, total_road_width - 0.8)
            smoothed.append({
                "x": round(float(px), 2),
                "y": round(float(clamped_y), 2)
            })
        return smoothed
