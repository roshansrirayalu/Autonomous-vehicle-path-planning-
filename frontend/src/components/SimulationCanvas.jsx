import React, { useRef, useEffect } from 'react';

export default function SimulationCanvas({
  frame,
  scenario,
  isSimulating
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    if (!scenario || !frame) {
      // Empty placeholder
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Select a scenario and click "Run Simulation" to visualize trajectory', width / 2, height / 2);
      return;
    }

    const road = scenario.road;
    const lanes = road.lanes || 2;
    const laneWidthM = road.lane_width_m || 3.5;
    const curvature = road.curvature || 0.0;
    const totalRoadWidthM = lanes * laneWidthM;

    const ego = frame.ego;
    const trajectory = frame.planned_trajectory || [];
    const obstacles = frame.perceived_obstacles || [];

    // Coordinate conversion: Camera tracking ego vehicle
    // World coordinates: x is along road (0 -> 300m), y is lateral (0 -> lanes * lane_width_m)
    // Canvas: Horizontal view where road flows left to right
    const pixelsPerMeter = Math.min(width / 70.0, height / (totalRoadWidthM + 12.0));
    
    // Center camera on ego vehicle with lookahead, tracking road centerline curvature
    const cameraX = ego.x - 18.0; // keep ego slightly left of center
    const roadCurveAtEgo = 0.5 * curvature * (ego.x * ego.x);
    const cameraY = (totalRoadWidthM / 2.0) + roadCurveAtEgo;

    const worldToCanvas = (wx, wy) => {
      // Road curve offset: y_curved = wy + 0.5 * curvature * wx^2
      const curvedY = wy + 0.5 * curvature * (wx * wx);
      const cx = (wx - cameraX) * pixelsPerMeter;
      const cy = height / 2.0 + (curvedY - cameraY) * pixelsPerMeter;
      return { x: cx, y: cy };
    };

    // 1. Draw Road Surface and Grass Margins
    const viewStartX = Math.max(0, cameraX - 10);
    const viewEndX = cameraX + (width / pixelsPerMeter) + 20;
    const sampleStep = 4.0;

    // Grass / Ground
    ctx.fillStyle = '#06130e';
    ctx.fillRect(0, 0, width, height);

    // Draw asphalt road polygon
    ctx.beginPath();
    // Top curb
    for (let x = viewStartX; x <= viewEndX; x += sampleStep) {
      const p = worldToCanvas(x, totalRoadWidthM + 0.4);
      if (x === viewStartX) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    // Bottom curb (backwards)
    for (let x = viewEndX; x >= viewStartX; x -= sampleStep) {
      const p = worldToCanvas(x, -0.4);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // 2. Draw Lane Boundaries
    // Outer solid curb lines
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#e2e8f0'; // solid white curb
    // Bottom curb
    ctx.beginPath();
    for (let x = viewStartX; x <= viewEndX; x += sampleStep) {
      const p = worldToCanvas(x, 0.0);
      if (x === viewStartX) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Top curb
    ctx.beginPath();
    for (let x = viewStartX; x <= viewEndX; x += sampleStep) {
      const p = worldToCanvas(x, totalRoadWidthM);
      if (x === viewStartX) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Inner dashed lane dividers
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#facc15'; // yellow dividers
    ctx.setLineDash([14, 12]);
    for (let l = 1; l < lanes; l++) {
      const laneY = l * laneWidthM;
      ctx.beginPath();
      for (let x = viewStartX; x <= viewEndX; x += sampleStep) {
        const p = worldToCanvas(x, laneY);
        if (x === viewStartX) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); // reset dash

    // 3. Draw Planned Trajectory Polyline
    if (trajectory.length > 1) {
      ctx.save();
      // Glowing trajectory line
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      trajectory.forEach((pt, idx) => {
        const cp = worldToCanvas(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      });
      ctx.stroke();

      // Draw trajectory knot points
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#38bdf8';
      trajectory.forEach((pt, idx) => {
        if (idx % 2 === 0) {
          const cp = worldToCanvas(pt.x, pt.y);
          ctx.beginPath();
          ctx.arc(cp.x, cp.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // 4. Draw Obstacles
    obstacles.forEach((obs) => {
      const cp = worldToCanvas(obs.x, obs.y);
      const owPx = (obs.length || 4.5) * pixelsPerMeter;
      const ohPx = (obs.width || 2.0) * pixelsPerMeter;

      ctx.save();
      ctx.translate(cp.x, cp.y);

      // Obstacle type styling
      if (obs.type === 'pedestrian') {
        // Pedestrian (circle with alert halo)
        ctx.fillStyle = '#f97316'; // orange
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(5, ohPx / 2.0), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fed7aa';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (obs.type === 'roadblock') {
        // Roadblock / Cones (striped box)
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-owPx / 2.0, -ohPx / 2.0, owPx, ohPx);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(-owPx / 2.0, -ohPx / 2.0, owPx, ohPx);
      } else {
        // Vehicle or Truck
        ctx.fillStyle = obs.type === 'truck' ? '#854d0e' : '#dc2626'; // Red vehicle / amber truck
        ctx.fillRect(-owPx / 2.0, -ohPx / 2.0, owPx, ohPx);
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-owPx / 2.0, -ohPx / 2.0, owPx, ohPx);

        // Windshield
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(owPx * 0.1, -ohPx * 0.35, owPx * 0.2, ohPx * 0.7);
      }

      // Draw Velocity Vector Arrow
      if (Math.abs(obs.vx || 0) > 0.1 || Math.abs(obs.vy || 0) > 0.1) {
        const vxPx = (obs.vx || 0) * pixelsPerMeter * 0.4;
        const vyPx = (obs.vy || 0) * pixelsPerMeter * 0.4;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(vxPx, vyPx);
        ctx.stroke();

        // Arrow head
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(vxPx, vyPx, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Label with distance & ID
      ctx.fillStyle = '#f8fafc';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${obs.type} [${obs.distance_m}m]`, cp.x, cp.y - (ohPx / 2.0) - 6);
    });

    // 5. Draw Ego Vehicle
    const egoCp = worldToCanvas(ego.x, ego.y);
    const egoLenPx = 4.6 * pixelsPerMeter;
    const egoWidPx = 2.0 * pixelsPerMeter;

    ctx.save();
    ctx.translate(egoCp.x, egoCp.y);
    const roadAngleAtEgo = Math.atan(curvature * ego.x);
    ctx.rotate((ego.yaw || 0) + roadAngleAtEgo);

    // Front sensor detection cone / headlights
    const grad = ctx.createRadialGradient(egoLenPx / 2.0, 0, 5, egoLenPx / 2.0 + 80, 0, 90);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(egoLenPx / 2.0, 0);
    ctx.arc(egoLenPx / 2.0, 0, 100, -0.35, 0.35);
    ctx.closePath();
    ctx.fill();

    // Safety buffer halo
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(-egoLenPx * 0.7, -egoWidPx * 0.9, egoLenPx * 1.4, egoWidPx * 1.8);
    ctx.setLineDash([]);

    // Ego Car Body (Electric Blue)
    ctx.fillStyle = '#2563eb';
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(-egoLenPx / 2.0, -egoWidPx / 2.0, egoLenPx, egoWidPx, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Roof & Windshields
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(-egoLenPx * 0.2, -egoWidPx * 0.35, egoLenPx * 0.5, egoWidPx * 0.7);
    ctx.fillStyle = '#93c5fd'; // front windshield
    ctx.fillRect(egoLenPx * 0.15, -egoWidPx * 0.3, egoLenPx * 0.12, egoWidPx * 0.6);

    // Headlights
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(egoLenPx / 2.0 - 2, -egoWidPx / 2.0 + 2, 3, 4);
    ctx.fillRect(egoLenPx / 2.0 - 2, egoWidPx / 2.0 - 6, 3, 4);

    // Taillights
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-egoLenPx / 2.0 - 1, -egoWidPx / 2.0 + 2, 2, 4);
    ctx.fillRect(-egoLenPx / 2.0 - 1, egoWidPx / 2.0 - 6, 2, 4);

    ctx.restore();

  }, [frame, scenario]);

  return (
    <div className="relative w-full h-[360px] lg:h-[420px] bg-[#090d16] rounded-xl overflow-hidden border border-gray-800 shadow-2xl">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
      />

      {/* Real-time Cockpit HUD Overlays */}
      {frame && (
        <div className="absolute top-3 left-3 flex flex-wrap gap-2 pointer-events-none">
          {/* FSM State Badge */}
          <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 shadow-lg flex items-center space-x-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">FSM State</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              frame.fsm.state === 'EMERGENCY_BRAKE'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                : frame.fsm.state === 'OBSTACLE_AVOID'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : frame.fsm.state.startsWith('LANE_CHANGE')
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
            }`}>
              {frame.fsm.state}
            </span>
          </div>

          {/* Speedometer */}
          <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 shadow-lg flex items-baseline space-x-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Speed</span>
            <span className="text-sm font-bold text-cyan-400 font-mono">
              {frame.ego.speed_mps}
            </span>
            <span className="text-[10px] text-gray-400 font-mono">m/s</span>
            <span className="text-[10px] text-gray-500 font-mono">
              ({Math.round(frame.ego.speed_mps * 3.6)} km/h)
            </span>
          </div>

          {/* Steering Angle */}
          <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 shadow-lg flex items-baseline space-x-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Steer</span>
            <span className="text-sm font-bold text-gray-200 font-mono">
              {frame.ego.steer_deg > 0 ? `+${frame.ego.steer_deg}°` : `${frame.ego.steer_deg}°`}
            </span>
          </div>

          {/* Path Deviation */}
          <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 shadow-lg flex items-baseline space-x-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Deviation</span>
            <span className={`text-sm font-bold font-mono ${frame.deviation_m > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>
              {frame.deviation_m}m
            </span>
          </div>

          {/* Total Latency */}
          <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 shadow-lg flex items-baseline space-x-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Latency</span>
            <span className="text-sm font-bold text-blue-400 font-mono">
              {frame.latency_breakdown?.total_ms}ms
            </span>
          </div>
        </div>
      )}

      {/* State reason banner at bottom */}
      {frame?.fsm?.reason && (
        <div className="absolute bottom-3 left-3 right-3 bg-gray-900/80 backdrop-blur-md px-4 py-2 rounded-lg border border-gray-800 text-xs text-gray-300 font-mono flex items-center justify-between">
          <span className="truncate">
            <strong className="text-gray-400">Tactical Intent:</strong> {frame.fsm.reason}
          </span>
          <span className="text-gray-500 shrink-0 ml-4">
            Sim Time: {frame.time_sec}s
          </span>
        </div>
      )}
    </div>
  );
}
