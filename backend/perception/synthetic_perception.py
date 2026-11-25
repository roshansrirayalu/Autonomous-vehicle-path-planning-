import numpy as np
from typing import Dict, List, Any

class SyntheticPerception:
    """
    Simulates autonomous vehicle perception suite (Camera + Radar/LiDAR fusion)
    in a 2D environment with configurable sensor noise and detection horizons.
    """
    def __init__(self, perception_range_m: float = 85.0, fov_deg: float = 120.0):
        self.perception_range_m = perception_range_m
        self.fov_deg = fov_deg

    def perceive(
        self,
        ego_state: Dict[str, Any],
        ground_truth_obstacles: List[Dict[str, Any]],
        road_config: Dict[str, Any],
        noise_level: float = 0.0
    ) -> Dict[str, Any]:
        """
        Extracts lane boundaries and detects obstacles with sensor noise.
        """
        ego_x = ego_state["x"]
        ego_y = ego_state["y"]
        ego_yaw = ego_state.get("yaw", 0.0)

        # 1. Lane Boundary Extraction
        lanes_count = road_config.get("lanes", 2)
        lane_width = road_config.get("lane_width_m", 3.5)
        curvature = road_config.get("curvature", 0.0)
        lane_visibility = road_config.get("lane_visibility", 1.0)

        # Perceived lane center lines & boundaries
        # For curved road: y(x) = y_0 + curvature * (x - ego_x)^2 / 2
        perceived_lanes = []
        for lane_idx in range(lanes_count):
            base_y = (lane_idx + 0.5) * lane_width
            # Generate sample points ahead of ego
            sample_xs = np.linspace(max(0, ego_x - 10), ego_x + self.perception_range_m, 25)
            # Add sensor noise and curve
            lane_pts = []
            for sx in sample_xs:
                dx = sx - ego_x
                curved_y = base_y + 0.5 * curvature * (sx ** 2)
                # Sensor noise adds lateral jitter
                noisy_y = curved_y + np.random.normal(0, noise_level * 0.15) if noise_level > 0 else curved_y
                lane_pts.append({"x": round(float(sx), 2), "y": round(float(noisy_y), 2)})

            perceived_lanes.append({
                "lane_index": lane_idx,
                "center_y": base_y,
                "points": lane_pts,
                "visibility": lane_visibility,
                "is_faded": lane_visibility < 0.6
            })

        # 2. Obstacle Detection within Sensor Horizon
        detected_obstacles = []
        for obs in ground_truth_obstacles:
            ox = obs["x"]
            oy = obs["y"]
            dx = ox - ego_x
            dy = oy - ego_y
            distance = np.hypot(dx, dy)

            # Check if within sensor range
            if distance <= self.perception_range_m:
                # Add sensor noise to measurement
                pos_noise = np.random.normal(0, noise_level * 0.25, 2) if noise_level > 0 else (0.0, 0.0)
                noisy_x = ox + pos_noise[0]
                noisy_y = oy + pos_noise[1]
                noisy_dist = np.hypot(noisy_x - ego_x, noisy_y - ego_y)

                # Velocity vectors
                vx = obs.get("vx", 0.0)
                vy = obs.get("vy", 0.0)
                vel_noise = np.random.normal(0, noise_level * 0.1, 2) if noise_level > 0 else (0.0, 0.0)
                perceived_vx = vx + vel_noise[0]
                perceived_vy = vy + vel_noise[1]

                # Relative speed and Time-To-Collision (TTC)
                rel_vx = ego_state["speed_mps"] - perceived_vx
                ttc = (dx / rel_vx) if rel_vx > 0.1 and dx > 0 else 999.0

                detected_obstacles.append({
                    "id": obs["id"],
                    "type": obs.get("type", "vehicle"),
                    "x": round(float(noisy_x), 2),
                    "y": round(float(noisy_y), 2),
                    "vx": round(float(perceived_vx), 2),
                    "vy": round(float(perceived_vy), 2),
                    "width": obs.get("width", 2.0),
                    "length": obs.get("length", 4.5),
                    "distance_m": round(float(noisy_dist), 2),
                    "ttc_sec": round(float(min(999.0, max(0.0, ttc))), 2),
                    "bounding_box": {
                        "x_min": round(noisy_x - obs.get("length", 4.5) / 2.0, 2),
                        "x_max": round(noisy_x + obs.get("length", 4.5) / 2.0, 2),
                        "y_min": round(noisy_y - obs.get("width", 2.0) / 2.0, 2),
                        "y_max": round(noisy_y + obs.get("width", 2.0) / 2.0, 2)
                    }
                })

        # Sort detected obstacles by distance
        detected_obstacles.sort(key=lambda item: item["distance_m"])

        return {
            "lanes": perceived_lanes,
            "obstacles": detected_obstacles,
            "sensor_noise_applied": noise_level,
            "visibility_level": lane_visibility
        }
