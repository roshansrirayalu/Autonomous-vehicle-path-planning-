import React, { useState } from 'react';
import { History, Download, Trash2, GitCompare, CheckCircle2, XCircle, ArrowRight, RefreshCw } from 'lucide-react';

export default function HistoryComparison({
  runs,
  onRefreshRuns,
  onDeleteRun
}) {
  const [selectedRunIds, setSelectedRunIds] = useState([]);

  const toggleSelectRun = (id) => {
    if (selectedRunIds.includes(id)) {
      setSelectedRunIds(selectedRunIds.filter((item) => item !== id));
    } else {
      if (selectedRunIds.length >= 2) {
        // Keep last selected and replace with new
        setSelectedRunIds([selectedRunIds[1], id]);
      } else {
        setSelectedRunIds([...selectedRunIds, id]);
      }
    }
  };

  const runA = runs.find((r) => r.id === selectedRunIds[0]);
  const runB = runs.find((r) => r.id === selectedRunIds[1]);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-blue-400" />
            Backtest Run History & Comparison
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Persistent SQLite database recording simulation metrics, safety KPIs, and collision audits.
          </p>
        </div>

        {/* Export & Refresh Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onRefreshRuns}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <a
            href="/api/runs/export/csv"
            download="backtest_runs.csv"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </a>

          <a
            href="/api/runs/export/json"
            download="backtest_runs.json"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export JSON</span>
          </a>
        </div>
      </div>

      {/* Side-by-Side Comparison Card if 2 runs are selected */}
      {runA && runB && (
        <div className="bg-gradient-to-r from-gray-900 via-blue-950/20 to-gray-900 border border-blue-500/40 rounded-xl p-4 space-y-3 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <GitCompare className="w-4 h-4 text-blue-400" />
              <span>Side-by-Side Run Comparison</span>
            </h3>
            <button
              onClick={() => setSelectedRunIds([])}
              className="text-xs text-gray-400 hover:text-white"
            >
              Clear Comparison
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Run A */}
            <div className="bg-gray-950/80 border border-gray-800 rounded-lg p-3 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                <span className="font-bold text-blue-400">Run A: {runA.scenario_name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  runA.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {runA.status}
                </span>
              </div>
              <div className="flex justify-between"><span>Algorithm:</span><span className="text-gray-200">{runA.algorithm}</span></div>
              <div className="flex justify-between"><span>Safety Score:</span><span className="text-emerald-400 font-bold">{runA.safety_score} / 100</span></div>
              <div className="flex justify-between"><span>Collisions:</span><span className={runA.collision_count === 0 ? 'text-emerald-400' : 'text-red-400'}>{runA.collision_count}</span></div>
              <div className="flex justify-between"><span>Avg Latency:</span><span className="text-blue-400">{runA.avg_latency_ms} ms</span></div>
              <div className="flex justify-between"><span>Avg Deviation:</span><span className="text-cyan-400">{runA.avg_deviation_m} m</span></div>
              <div className="flex justify-between"><span>Max Jerk:</span><span className="text-purple-400">{runA.max_jerk} m/s³</span></div>
            </div>

            {/* Run B */}
            <div className="bg-gray-950/80 border border-gray-800 rounded-lg p-3 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                <span className="font-bold text-cyan-400">Run B: {runB.scenario_name}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  runB.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {runB.status}
                </span>
              </div>
              <div className="flex justify-between"><span>Algorithm:</span><span className="text-gray-200">{runB.algorithm}</span></div>
              <div className="flex justify-between"><span>Safety Score:</span><span className="text-emerald-400 font-bold">{runB.safety_score} / 100</span></div>
              <div className="flex justify-between"><span>Collisions:</span><span className={runB.collision_count === 0 ? 'text-emerald-400' : 'text-red-400'}>{runB.collision_count}</span></div>
              <div className="flex justify-between"><span>Avg Latency:</span><span className="text-blue-400">{runB.avg_latency_ms} ms</span></div>
              <div className="flex justify-between"><span>Avg Deviation:</span><span className="text-cyan-400">{runB.avg_deviation_m} m</span></div>
              <div className="flex justify-between"><span>Max Jerk:</span><span className="text-purple-400">{runB.max_jerk} m/s³</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Runs Table */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-3 border-b border-gray-800 flex justify-between items-center text-xs text-gray-400 font-mono">
          <span>Select any 2 runs to compare side-by-side</span>
          <span>{runs.length} Runs Recorded</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-gray-950/70 border-b border-gray-800 text-gray-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 w-10 text-center">Compare</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Scenario</th>
                <th className="py-3 px-4">Planner</th>
                <th className="py-3 px-4 text-center">Verdict</th>
                <th className="py-3 px-4 text-right">Score</th>
                <th className="py-3 px-4 text-right">Collisions</th>
                <th className="py-3 px-4 text-right">Latency</th>
                <th className="py-3 px-4 text-right">Deviation</th>
                <th className="py-3 px-4 text-center w-12">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-300">
              {runs.length > 0 ? (
                runs.map((r) => {
                  const isChecked = selectedRunIds.includes(r.id);
                  const isPass = r.status === 'PASS';
                  const dateStr = new Date(r.timestamp).toLocaleTimeString();

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-gray-800/40 transition-colors ${
                        isChecked ? 'bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRun(r.id)}
                          className="rounded border-gray-700 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">{dateStr}</td>
                      <td className="py-3 px-4 font-semibold text-white">{r.scenario_name}</td>
                      <td className="py-3 px-4 text-gray-300 capitalize">{r.algorithm}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isPass
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-white">{r.safety_score}</td>
                      <td className={`py-3 px-4 text-right ${r.collision_count === 0 ? 'text-emerald-400' : 'text-red-400 font-bold'}`}>
                        {r.collision_count}
                      </td>
                      <td className="py-3 px-4 text-right text-blue-400">{r.avg_latency_ms} ms</td>
                      <td className="py-3 px-4 text-right text-cyan-400">{r.avg_deviation_m} m</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onDeleteRun(r.id)}
                          title="Delete run record"
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-gray-500">
                    No backtest runs found. Execute a scenario simulation to record your first run!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
