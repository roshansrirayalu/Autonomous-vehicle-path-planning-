import heapq
import numpy as np
from typing import List, Dict, Any, Tuple

class GlobalRouter:
    """
    Macro-level Route Planner using A* Graph Search over discretized lane waypoints.
    """
    def __init__(self, waypoint_step_m: float = 10.0):
        self.step_m = waypoint_step_m

    def plan(
        self,
        start_x: float,
        start_y: float,
        goal_x: float,
        road_config: Dict[str, Any],
        blocked_regions: List[Dict[str, float]] = None
    ) -> List[Tuple[float, float, int]]:
        """
        Plans a sequence of (x, y, lane_index) waypoints from start to goal.
        """
        if blocked_regions is None:
            blocked_regions = []

        lanes_count = road_config.get("lanes", 2)
        lane_width = road_config.get("lane_width_m", 3.5)
        curvature = road_config.get("curvature", 0.0)

        # Discretize graph nodes: (longitudinal_idx, lane_idx)
        start_lane = min(lanes_count - 1, max(0, int(start_y // lane_width)))
        start_node = (0, start_lane)

        max_steps = int(np.ceil((goal_x - start_x) / self.step_m))
        target_step = max_steps

        # Priority queue for A*: (f_cost, g_cost, node, path)
        open_set = []
        heapq.heappush(open_set, (0.0, 0.0, start_node, [start_node]))
        visited = set()

        def is_blocked(x: float, y: float) -> bool:
            for b in blocked_regions:
                if b["x_min"] - 5.0 <= x <= b["x_max"] + 5.0 and b["y_min"] - 0.5 <= y <= b["y_max"] + 0.5:
                    return True
            return False

        def heuristic(step: int, lane: int) -> float:
            remaining_dist = (target_step - step) * self.step_m
            # slight preference for center/right cruising lanes
            lane_pref_penalty = abs(lane - (lanes_count // 2)) * 0.5
            return remaining_dist + lane_pref_penalty

        best_path = None

        while open_set:
            f, g, current, path = heapq.heappop(open_set)
            step_idx, lane_idx = current

            if current in visited:
                continue
            visited.add(current)

            if step_idx >= target_step:
                best_path = path
                break

            # Neighbors: same lane, change left (lane + 1), change right (lane - 1)
            next_step = step_idx + 1
            x_pos = start_x + next_step * self.step_m

            for next_lane in [lane_idx, lane_idx + 1, lane_idx - 1]:
                if 0 <= next_lane < lanes_count:
                    y_base = (next_lane + 0.5) * lane_width
                    curved_y = y_base + 0.5 * curvature * (x_pos ** 2)

                    # Obstacle check
                    if is_blocked(x_pos, curved_y):
                        continue

                    # Transition cost
                    lane_change_penalty = 8.0 if next_lane != lane_idx else 0.0
                    edge_cost = self.step_m + lane_change_penalty
                    new_g = g + edge_cost
                    new_f = new_g + heuristic(next_step, next_lane)
                    neighbor = (next_step, next_lane)

                    if neighbor not in visited:
                        heapq.heappush(open_set, (new_f, new_g, neighbor, path + [neighbor]))

        # Format output waypoints
        waypoints = []
        if best_path:
            for step_idx, lane_idx in best_path:
                x = start_x + step_idx * self.step_m
                y_base = (lane_idx + 0.5) * lane_width
                y = y_base + 0.5 * curvature * (x ** 2)
                waypoints.append((round(float(x), 2), round(float(y), 2), lane_idx))
        else:
            # Fallback path staying in starting lane
            for s in range(target_step + 1):
                x = start_x + s * self.step_m
                y_base = (start_lane + 0.5) * lane_width
                y = y_base + 0.5 * curvature * (x ** 2)
                waypoints.append((round(float(x), 2), round(float(y), 2), start_lane))

        return waypoints
