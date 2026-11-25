import React from 'react';
import { ShieldAlert, ShieldCheck, Activity, Gauge, Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export default function TelemetryCards({ summary, currentFrame }) {
  if (!summary) return null;

  const isPass = summary.status === 'PASS';
  const checks = summary.criteria_checks || {};

  return (
    <div className="space-y-4">
      {/* Top Balanced Safety Score Card */}
      <div className={`p-4 rounded-xl border transition-all ${
        isPass
          ? 'bg-gradient-to-r from-emerald-950/40 via-gray-900 to-gray-900 border-emerald-500/40'
          : 'bg-gradient-to-r from-red-950/40 via-gray-900 to-gray-900 border-red-500/40'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl border ${
              isPass
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-red-500/20 border-red-500/40 text-red-400'
            }`}>
              {isPass ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase tracking-wider text-gray-400 font-mono">
                  Autonomous Safety Verdict
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider font-mono ${
                  isPass
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-sm shadow-red-500/30'
                }`}>
                  {summary.status}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mt-0.5 flex items-baseline gap-2">
                Safety Score: <span className={isPass ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>{summary.safety_score} / 100</span>
              </h3>
            </div>
          </div>

          {/* Automated Safety Threshold Checklist */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Zero Collision */}
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono ${
              checks.zero_collisions?.pass
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}>
              {checks.zero_collisions?.pass ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
              <span>0 Collisions ({summary.collision_count})</span>
            </div>

            {/* Latency < 100ms */}
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono ${
              checks.latency_sub_100ms?.pass
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}>
              {checks.latency_sub_100ms?.pass ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
              <span>Latency &lt; 100ms ({summary.avg_latency_ms}ms)</span>
            </div>

            {/* Deviation < 0.5m */}
            <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono ${
              checks.deviation_sub_half_meter?.pass
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}>
              {checks.deviation_sub_half_meter?.pass ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
              <span>Deviation &lt; 0.5m ({summary.avg_deviation_m}m)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Key Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Collisions */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs uppercase font-mono tracking-wider">Collisions</span>
            <AlertTriangle className={`w-4 h-4 ${summary.collision_count === 0 ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div className="mt-2">
            <div className={`text-2xl font-bold font-mono ${summary.collision_count === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {summary.collision_count}
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">
              Rate: {summary.collision_rate_percent}%
            </div>
          </div>
        </div>

        {/* Card 2: Planning Latency */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs uppercase font-mono tracking-wider">Avg Latency</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-blue-400">
              {summary.avg_latency_ms} <span className="text-sm font-normal text-gray-400">ms</span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">
              Max: {summary.max_latency_ms} ms
            </div>
          </div>
        </div>

        {/* Card 3: Path Deviation */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs uppercase font-mono tracking-wider">Avg Deviation</span>
            <Gauge className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-cyan-400">
              {summary.avg_deviation_m} <span className="text-sm font-normal text-gray-400">m</span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">
              Max: {summary.max_deviation_m} m
            </div>
          </div>
        </div>

        {/* Card 4: Dynamics & Jerk */}
        <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs uppercase font-mono tracking-wider">Max Jerk</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-purple-400">
              {summary.max_jerk_mps3} <span className="text-sm font-normal text-gray-400">m/s³</span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono mt-0.5">
              Sim Time: {summary.simulated_time_sec}s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
