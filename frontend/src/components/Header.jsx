import React from 'react';
import { Cpu, RefreshCw, Layers, Eye, History, ShieldCheck, Car } from 'lucide-react';

export default function Header({
  activeTab,
  setActiveTab,
  hardwareInfo,
  onSelectHardware,
  onRefreshData,
  isRefreshing
}) {
  return (
    <header className="border-b border-gray-800 bg-[#0f172a]/90 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-400">
          <Car className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
            Autonomous Vehicle Path Planning
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/50 font-mono">
              STUDIO v2.0
            </span>
          </h1>
          <p className="text-xs text-gray-400">
            Hybrid Perception • Decision FSM • Kinematic Trajectory • Backtesting Engine
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-1 bg-gray-900/80 p-1 rounded-lg border border-gray-800">
        <button
          onClick={() => setActiveTab('simulation')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'simulation'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Simulation & Replay</span>
        </button>

        <button
          onClick={() => setActiveTab('vision')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'vision'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Vision Lab</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === 'history'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Backtest History</span>
        </button>
      </div>

      {/* Hardware Status & Refresh Data */}
      <div className="flex items-center space-x-3">
        {/* Interactive Hardware Selector */}
        <div className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-xs">
          <Cpu className={`w-3.5 h-3.5 ${hardwareInfo?.device === 'cuda' || hardwareInfo?.device === 'mps' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-gray-500 font-mono">
                Hardware Engine
              </span>
              {hardwareInfo?.cuda_available && (
                <span className="text-[9px] px-1 py-0.2 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded font-semibold">
                  RTX 3050 GPU
                </span>
              )}
            </div>
            <select
              value={hardwareInfo?.selected_device || 'auto'}
              onChange={(e) => onSelectHardware && onSelectHardware(e.target.value)}
              className="bg-transparent text-gray-200 text-xs font-semibold focus:outline-none cursor-pointer pr-1"
              title={`Active: ${hardwareInfo?.acceleration || 'Detecting...'}`}
            >
              <option value="auto" className="bg-gray-900 text-gray-200">
                ⚡ Auto-Detect ({hardwareInfo?.device === 'cuda' ? 'NVIDIA CUDA' : hardwareInfo?.device?.toUpperCase() || 'BEST'})
              </option>
              <option value="cpu" className="bg-gray-900 text-gray-200">
                🖥️ CPU (AVX/SSE Vectorized)
              </option>
              <option
                value="cuda"
                disabled={!hardwareInfo?.cuda_available}
                className="bg-gray-900 text-emerald-400 font-semibold"
              >
                🚀 NVIDIA CUDA ({hardwareInfo?.device_name || 'RTX 3050 Laptop GPU'})
              </option>
              <option
                value="mps"
                disabled={!hardwareInfo?.mps_available}
                className="bg-gray-900 text-gray-200"
              >
                🍏 Apple MPS {hardwareInfo?.mps_available ? '(Metal)' : '(Unavailable)'}
              </option>
            </select>
          </div>
        </div>

        {/* Refresh add_data button */}
        <button
          onClick={onRefreshData}
          disabled={isRefreshing}
          title="Rescan add_data/scenarios/ and add_data/media/ directories"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium border border-gray-700 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : 'text-gray-400'}`} />
          <span>Refresh add_data</span>
        </button>
      </div>
    </header>
  );
}
