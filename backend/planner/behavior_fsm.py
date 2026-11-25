from enum import Enum
from typing import Dict, List, Any, Optional

class BehaviorState(str, Enum):
    LANE_KEEP = "LANE_KEEP"
    LANE_CHANGE_LEFT = "LANE_CHANGE_LEFT"
    LANE_CHANGE_RIGHT = "LANE_CHANGE_RIGHT"
    OBSTACLE_AVOID = "OBSTACLE_AVOID"
    EMERGENCY_BRAKE = "EMERGENCY_BRAKE"

class BehaviorPlannerFSM:
    """
    Finite State Machine (FSM) for high-level tactical behavior planning
    with active lane centering and obstacle clearance recovery.
    """
    def __init__(self):
        self.state = BehaviorState.LANE_KEEP
        self.target_lane = 0
        self.cruising_lane = 0
        self.state_reason = "Cruising nominally in lane center"
        self.ticks_in_state = 0
        self.active_avoid_obstacle_id = None
        self.avoid_direction = 1.0 # +1 for nudge left, -1 for nudge right

    def step(
        self,
        ego_state: Dict[str, Any],
        perceived_obstacles: List[Dict[str, Any]],
        road_config: Dict[str, Any],
        safety_buffer_m: float = 8.0,
        target_speed_mps: float = 15.0
    ) -> Dict[str, Any]:
        self.ticks_in_state += 1
        ego_x = ego_state["x"]
        ego_y = ego_state["y"]
        ego_v = ego_state["speed_mps"]

        lanes_count = road_config.get("lanes", 2)
        lane_width = road_config.get("lane_width_m", 3.5)
        current_lane = min(lanes_count - 1, max(0, int(ego_y // lane_width)))

        # Find critical obstacles in ego lane and adjacent lanes
        lead_obs = None
        min_lead_dist = 999.0
        lateral_crosser = None

        left_lane_clear = (current_lane + 1 < lanes_count)
        right_lane_clear = (current_lane - 1 >= 0)

        total_road_width = lanes_count * lane_width
        for obs in perceived_obstacles:
            ox = obs["x"]
            oy = obs["y"]
            vx = obs.get("vx", 0.0)
            vy = obs.get("vy", 0.0)
            # Ignore obstacles completely off-road
            if oy < -0.1 or oy > (total_road_width + 0.1):
                obs_lane = -999
            else:
                obs_lane = min(lanes_count - 1, max(0, int(oy // lane_width)))
            dx = ox - ego_x

            # Check for sudden lateral crossers (e.g. pedestrian moving towards ego path)
            if 0 < dx < (safety_buffer_m + 22.0) and abs(vy) > 0.3:
                # If moving toward ego lane
                projected_y = oy + vy * 1.5
                if abs(projected_y - ego_y) < (lane_width * 0.75):
                    lateral_crosser = obs

            # Check lead obstacle in current lane
            if obs_lane == current_lane and dx > -1.0:
                if dx < min_lead_dist:
                    min_lead_dist = dx
                    lead_obs = obs

            # Check adjacency clearance
            if obs_lane == current_lane + 1:
                if vx < -0.5:
                    closing_speed = ego_v + abs(vx)
                    if 0 < dx < (closing_speed * 7.5) or abs(dx) < 25.0:
                        left_lane_clear = False
                elif abs(dx) < (safety_buffer_m + 18.0):
                    left_lane_clear = False
            elif obs_lane == current_lane - 1:
                if vx < -0.5:
                    closing_speed = ego_v + abs(vx)
                    if 0 < dx < (closing_speed * 7.5) or abs(dx) < 25.0:
                        right_lane_clear = False
                elif abs(dx) < (safety_buffer_m + 18.0):
                    right_lane_clear = False

        # State Transition Logic
        new_state = self.state
        reason = self.state_reason
        target_lane = self.target_lane

        # Critical Check 1: Sudden Lateral Obstacle / Pedestrian
        if lateral_crosser is not None and lateral_crosser["distance_m"] < (safety_buffer_m + 16.0):
            new_state = BehaviorState.EMERGENCY_BRAKE
            reason = f"Emergency braking: Sudden {lateral_crosser.get('type', 'obstacle')} encroaching at {lateral_crosser['distance_m']:.1f}m"

        # Critical Check 1.5: Oncoming Vehicle Head-On in Current Lane
        elif lead_obs is not None and lead_obs.get("vx", 0.0) < -0.5:
            obs_vx = lead_obs.get("vx", 0.0)
            closing_speed = ego_v + abs(obs_vx)
            time_to_impact = min_lead_dist / max(0.5, closing_speed)
            if right_lane_clear and (current_lane - 1 >= 0):
                new_state = BehaviorState.LANE_CHANGE_RIGHT
                target_lane = current_lane - 1
                reason = f"Evasive maneuver: moving right to avoid oncoming {lead_obs['id']}"
            elif left_lane_clear and (current_lane + 1 < lanes_count):
                new_state = BehaviorState.LANE_CHANGE_LEFT
                target_lane = current_lane + 1
                reason = f"Evasive maneuver: moving left to avoid oncoming {lead_obs['id']}"
            else:
                new_state = BehaviorState.EMERGENCY_BRAKE
                reason = f"Emergency braking: oncoming vehicle {lead_obs['id']} head-on at {min_lead_dist:.1f}m"

        # Critical Check 2: Imminent forward collision
        elif lead_obs is not None and min_lead_dist < max(4.5, safety_buffer_m * 0.65) and ego_v > 2.0:
            new_state = BehaviorState.EMERGENCY_BRAKE
            reason = f"Imminent collision risk with {lead_obs['id']} at {min_lead_dist:.1f}m"

        # Check 3: Slow lead vehicle or stationary obstacle ahead
        elif lead_obs is not None and min_lead_dist < max(safety_buffer_m + 25.0, ego_v * 2.6):
            rel_speed = ego_v - lead_obs.get("vx", 0.0)
            if rel_speed > 1.0 or min_lead_dist < (safety_buffer_m + 18.0):
                # Try lane change left first
                if left_lane_clear and (current_lane + 1 < lanes_count):
                    new_state = BehaviorState.LANE_CHANGE_LEFT
                    target_lane = current_lane + 1
                    reason = f"Overtaking {lead_obs['id']} via left lane change"
                # Else try lane change right
                elif right_lane_clear and (current_lane - 1 >= 0):
                    new_state = BehaviorState.LANE_CHANGE_RIGHT
                    target_lane = current_lane - 1
                    reason = f"Overtaking {lead_obs['id']} via right lane change"
                # If stationary and in a 1-lane road or adjacent lanes blocked: nudge / avoid
                elif lead_obs.get("vx", 0.0) == 0.0 and min_lead_dist < (safety_buffer_m + 15.0):
                    new_state = BehaviorState.OBSTACLE_AVOID
                    target_lane = current_lane
                    self.active_avoid_obstacle_id = lead_obs["id"]
                    # Nudge away from obstacle center
                    obs_y = lead_obs["y"]
                    lane_center = (current_lane + 0.5) * lane_width
                    self.avoid_direction = 1.0 if obs_y <= lane_center else -1.0
                    reason = f"Nudging to avoid stationary {lead_obs['id']}"
                else:
                    new_state = BehaviorState.LANE_KEEP
                    target_lane = current_lane
                    reason = f"Following lead vehicle {lead_obs['id']} at safe distance"
            else:
                new_state = BehaviorState.LANE_KEEP
                target_lane = current_lane
                reason = "Following lead vehicle with matched speed"

        # Check 4: Recovery & Lane Centering
        else:
            # If in OBSTACLE_AVOID: check if the obstacle is cleared
            if self.state == BehaviorState.OBSTACLE_AVOID:
                # Find the obstacle we were avoiding
                obs_still_ahead = False
                for obs in perceived_obstacles:
                    if obs["id"] == self.active_avoid_obstacle_id and (obs["x"] - ego_x) > -2.0:
                        obs_still_ahead = True
                        break
                if not obs_still_ahead or lead_obs is None:
                    new_state = BehaviorState.LANE_KEEP
                    target_lane = current_lane
                    self.active_avoid_obstacle_id = None
                    reason = "Obstacle cleared; returning to lane center"

            # If in LANE_CHANGE: check if we reached the target lane center
            elif self.state in [BehaviorState.LANE_CHANGE_LEFT, BehaviorState.LANE_CHANGE_RIGHT]:
                target_center_y = (self.target_lane + 0.5) * lane_width
                dist_to_target = abs(ego_y - target_center_y)
                if dist_to_target < 0.25 and self.ticks_in_state > 12:
                    new_state = BehaviorState.LANE_KEEP
                    target_lane = self.target_lane
                    reason = f"Lane change completed; maintaining Lane {self.target_lane}"

            elif self.state == BehaviorState.EMERGENCY_BRAKE:
                if (lateral_crosser is None) and (lead_obs is None or min_lead_dist > safety_buffer_m + 15.0):
                    new_state = BehaviorState.LANE_KEEP
                    target_lane = current_lane
                    reason = "Hazard cleared; centering in lane and resuming cruise"

            else:
                new_state = BehaviorState.LANE_KEEP
                target_lane = self.target_lane if self.target_lane < lanes_count else current_lane
                reason = "Cruising nominally in lane center"

                # Check 4b: Return to original cruising lane ("back in line") after overtake
                if current_lane != self.cruising_lane and self.ticks_in_state > 15:
                    desired_dir = -1 if current_lane > self.cruising_lane else 1
                    target_return_lane = current_lane + desired_dir
                    
                    # Verify target return lane is physically clear of any obstacles
                    lane_safe_to_return = True
                    for obs in perceived_obstacles:
                        oy = obs["y"]
                        if oy < -0.1 or oy > (total_road_width + 0.1):
                            continue
                        obs_lane = min(lanes_count - 1, max(0, int(oy // lane_width)))
                        if obs_lane == target_return_lane:
                            dx = obs["x"] - ego_x
                            # Obstacle must not be in blind spot or within forward safety headway
                            # Vehicle must have passed obstacle (dx <= -12m) OR obstacle is far ahead (dx >= 55m)
                            if -14.0 < dx < max(50.0, ego_v * 2.2):
                                lane_safe_to_return = False
                                break

                    # Also verify adjacent lane clearance flags
                    if desired_dir == -1 and not right_lane_clear:
                        lane_safe_to_return = False
                    elif desired_dir == 1 and not left_lane_clear:
                        lane_safe_to_return = False

                    if lane_safe_to_return:
                        if desired_dir == -1:
                            new_state = BehaviorState.LANE_CHANGE_RIGHT
                            target_lane = target_return_lane
                            reason = f"Overtake complete: returning back in line (Lane {target_return_lane})"
                        else:
                            new_state = BehaviorState.LANE_CHANGE_LEFT
                            target_lane = target_return_lane
                            reason = f"Overtake complete: returning back in line (Lane {target_return_lane})"

        if new_state != self.state:
            self.state = new_state
            self.ticks_in_state = 0

        self.state_reason = reason
        self.target_lane = target_lane

        return {
            "state": self.state.value,
            "target_lane": self.target_lane,
            "reason": self.state_reason,
            "lead_obstacle_id": lead_obs["id"] if lead_obs else None,
            "lead_distance_m": round(min_lead_dist, 2) if lead_obs else None,
            "left_lane_clear": left_lane_clear,
            "right_lane_clear": right_lane_clear,
            "avoid_direction": self.avoid_direction
        }
