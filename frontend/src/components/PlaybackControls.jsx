import React from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, FastForward } from 'lucide-react';

export default function PlaybackControls({
  isPlaying,
  onTogglePlay,
  currentFrameIdx,
  totalFrames,
  onSeek,
  onStepForward,
  onStepBackward,
  onReset,
  playbackSpeed,
  onChangeSpeed,
  currentTimeSec,
  totalTimeSec
}) {
  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
      {/* Primary transport buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onReset}
          title="Reset to start"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onStepBackward}
          disabled={currentFrameIdx <= 0}
          title="Step 1 frame backward"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <button
          onClick={onStepForward}
          disabled={currentFrameIdx >= totalFrames - 1}
          title="Step 1 frame forward"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Scrubber slider */}
      <div className="flex-1 flex items-center space-x-3 min-w-[200px]">
        <span className="text-xs font-mono text-gray-400 min-w-[42px] text-right">
          {currentTimeSec.toFixed(2)}s
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrameIdx}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span className="text-xs font-mono text-gray-500 min-w-[42px]">
          {totalTimeSec.toFixed(2)}s
        </span>
      </div>

      {/* Speed multiplier & frame counter */}
      <div className="flex items-center space-x-3">
        {/* Speed Selector */}
        <div className="flex items-center bg-gray-800/80 rounded-lg p-0.5 border border-gray-700 text-xs font-mono">
          {[0.5, 1.0, 2.0, 5.0].map((spd) => (
            <button
              key={spd}
              onClick={() => onChangeSpeed(spd)}
              className={`px-2 py-1 rounded transition-colors ${
                playbackSpeed === spd
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Frame index */}
        <div className="text-[11px] font-mono text-gray-400 bg-gray-800/50 px-2.5 py-1 rounded border border-gray-700/50">
          Frame {currentFrameIdx + 1} / {totalFrames}
        </div>
      </div>
    </div>
  );
}
