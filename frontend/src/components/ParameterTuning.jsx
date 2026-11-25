import React, { useRef } from 'react';
import { Sliders, Upload, Play, Check, AlertCircle, Info, Sparkles } from 'lucide-react';

export default function ParameterTuning({
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  onUploadScenario,
  parameters,
  onChangeParameter,
  onRunSimulation,
  isLoading
}) {
  const fileInputRef = useRef(null);
  const currentScenario = scenarios.find((s) => s.id === selectedScenarioId) || scenarios[0];

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadScenario(file);
      e.target.value = '';
    }
  };

  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-4">
      {/* Top Header & Scenario Selection */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-white font-semibold text-sm">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>Scenario & Autonomous Tuning</span>
        </div>

        {/* Upload Custom Scenario Button */}
        <div className="flex items-center space-x-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Scenario JSON</span>
          </button>
        </div>
      </div>

      {/* Scenario Dropdown */}
      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">
          Select Driving Scenario:
        </label>
        <select
          value={selectedScenarioId}
          onChange={(e) => onSelectScenario(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
        >
          {scenarios.map((sc) => (
            <option key={sc.id} value={sc.id}>
              {sc.is_custom ? `[Custom] ` : `[${sc.category?.toUpperCase() || 'SUITE'}] `}
              {sc.name}
            </option>
          ))}
        </select>
      </div>

      {/* Scenario Metadata Overview */}
      {currentScenario && (
        <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-3 text-xs text-gray-300 space-y-1.5 font-mono">
          <div className="flex items-center justify-between text-gray-400">
            <span>Scenario ID:</span>
            <span className="text-gray-200">{currentScenario.id}</span>
          </div>
          <div className="flex items-center justify-between text-gray-400">
            <span>Road Specs:</span>
            <span className="text-gray-200">
              {currentScenario.road.lanes} Lanes • {currentScenario.road.lane_width_m}m Width • {currentScenario.road.length_m}m Length
            </span>
          </div>
          <div className="flex items-center justify-between text-gray-400">
            <span>Obstacles:</span>
            <span className="text-amber-400 font-semibold">
              {currentScenario.obstacles?.length || 0} Actors ({currentScenario.obstacles?.map((o) => o.type).join(', ') || 'None'})
            </span>
          </div>
          <div className="flex items-center justify-between text-gray-400">
            <span>Initial Ego Speed:</span>
            <span className="text-cyan-400">{currentScenario.ego_start.speed_mps} m/s</span>
          </div>
        </div>
      )}

      {/* Parameter Sliders */}
      <div className="space-y-3 pt-1">
        {/* Max Speed */}
        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-gray-400">Max Vehicle Speed</span>
            <span className="text-blue-400 font-bold">{parameters.max_speed_mps} m/s ({Math.round(parameters.max_speed_mps * 3.6)} km/h)</span>
          </div>
          <input
            type="range"
            min={5}
            max={35}
            step={1}
            value={parameters.max_speed_mps}
            onChange={(e) => onChangeParameter('max_speed_mps', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Safety Buffer Distance */}
        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-gray-400">Safety Buffer Distance</span>
            <span className="text-cyan-400 font-bold">{parameters.safety_buffer_m} m</span>
          </div>
          <input
            type="range"
            min={3}
            max={15}
            step={0.5}
            value={parameters.safety_buffer_m}
            onChange={(e) => onChangeParameter('safety_buffer_m', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Sensor Noise Level */}
        <div>
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-gray-400">Sensor Noise Level (σ)</span>
            <span className="text-amber-400 font-bold">{parameters.sensor_noise}</span>
          </div>
          <input
            type="range"
            min={0.0}
            max={1.0}
            step={0.05}
            value={parameters.sensor_noise}
            onChange={(e) => onChangeParameter('sensor_noise', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* Planning Algorithm */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-gray-400 mb-1.5">
            Local Planning Algorithm:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'bezier', name: 'Quintic Bezier' },
              { id: 'spline', name: 'Cubic Spline' },
              { id: 'rrt_star', name: 'RRT* Smoothed' },
            ].map((algo) => (
              <button
                key={algo.id}
                onClick={() => onChangeParameter('algorithm', algo.id)}
                className={`py-2 px-1 text-center text-[11px] font-mono rounded-lg border transition-all cursor-pointer ${
                  parameters.algorithm === algo.id
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold shadow-sm shadow-blue-500/20'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                }`}
              >
                {algo.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Run Backtest Simulation Action Button */}
      <button
        onClick={onRunSimulation}
        disabled={isLoading}
        className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
      >
        <Play className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        <span>{isLoading ? 'Simulating & Evaluating...' : 'Run Backtest Simulation'}</span>
      </button>
    </div>
  );
}
