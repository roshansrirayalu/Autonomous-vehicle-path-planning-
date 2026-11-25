import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import SimulationCanvas from './components/SimulationCanvas';
import PlaybackControls from './components/PlaybackControls';
import TelemetryCards from './components/TelemetryCards';
import ParameterTuning from './components/ParameterTuning';
import VisionLab from './components/VisionLab';
import HistoryComparison from './components/HistoryComparison';

export default function App() {
  const [activeTab, setActiveTab] = useState('simulation');
  const [hardwareInfo, setHardwareInfo] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [runs, setRuns] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Simulation Parameters
  const [parameters, setParameters] = useState({
    max_speed_mps: 20.0,
    safety_buffer_m: 7.0,
    sensor_noise: 0.0,
    algorithm: 'bezier'
  });

  // Simulation Run Data & Playback State
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const playTimerRef = useRef(null);

  // Toast Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Initial Load: Hardware, Scenarios, Media, Runs
  useEffect(() => {
    fetchHardware();
    fetchScenarios();
    fetchMediaFiles();
    fetchRuns();
  }, []);

  const fetchHardware = async () => {
    try {
      const res = await fetch('/api/hardware');
      if (res.ok) setHardwareInfo(await res.json());
    } catch (e) {
      console.error('Error fetching hardware info:', e);
    }
  };

  const handleSelectHardware = async (device) => {
    try {
      const res = await fetch('/api/hardware/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device })
      });
      const data = await res.json();
      if (data.message) {
        showToast(data.message);
      }
      await fetchHardware();
    } catch (e) {
      console.error('Error switching hardware device:', e);
      showToast('Failed to switch hardware device.');
    }
  };

  const fetchScenarios = async () => {
    try {
      const res = await fetch('/api/scenarios');
      if (res.ok) {
        const data = await res.json();
        setScenarios(data.scenarios);
        if (data.scenarios.length > 0 && !selectedScenarioId) {
          setSelectedScenarioId(data.scenarios[0].id);
          setParameters((prev) => ({
            ...prev,
            max_speed_mps: data.scenarios[0].ego_start.speed_mps || 20.0
          }));
        }
      }
    } catch (e) {
      console.error('Error fetching scenarios:', e);
    }
  };

  const fetchMediaFiles = async () => {
    try {
      const res = await fetch('/api/vision/media-files');
      if (res.ok) {
        const data = await res.json();
        setMediaFiles(data.media_files);
      }
    } catch (e) {
      console.error('Error fetching media files:', e);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/runs');
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs);
      }
    } catch (e) {
      console.error('Error fetching runs:', e);
    }
  };

  // 2. Refresh add_data button action
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/rescan-data', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        showToast(`Rescanned add_data: ${data.custom_scenarios.length} custom scenarios, ${data.media_files.length} media files.`);
        fetchScenarios();
        fetchMediaFiles();
      }
    } catch (e) {
      console.error('Error rescanning add_data:', e);
      showToast('Error rescanning add_data folder.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 3. Scenario Selection & Upload
  const handleSelectScenario = (id) => {
    setSelectedScenarioId(id);
    const target = scenarios.find((s) => s.id === id);
    if (target) {
      setParameters((prev) => ({
        ...prev,
        max_speed_mps: target.ego_start?.max_speed_mps || target.ego_start?.speed_mps || 20.0
      }));
    }
  };

  const handleUploadScenario = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/scenarios/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      showToast(`Uploaded custom scenario '${data.scenario.name}'!`);
      await fetchScenarios();
      setSelectedScenarioId(data.scenario.id);
    } catch (e) {
      console.error('Error uploading scenario:', e);
      showToast('Failed to upload scenario JSON.');
    }
  };

  // 4. Run Simulation
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    setIsPlaying(false);
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: selectedScenarioId,
          ...parameters
        })
      });

      if (!res.ok) throw new Error('Simulation execution failed');
      const data = await res.json();
      setSimResult(data);
      setCurrentFrameIdx(0);
      setIsPlaying(true);
      fetchRuns(); // refresh history
      showToast(`Simulation complete: ${data.summary.status} (Score: ${data.summary.safety_score})`);
    } catch (e) {
      console.error('Simulation error:', e);
      showToast('Simulation execution failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  // Auto-run first simulation on initial load if ready
  useEffect(() => {
    if (scenarios.length > 0 && selectedScenarioId && !simResult && !isSimulating) {
      handleRunSimulation();
    }
  }, [scenarios, selectedScenarioId]);

  // 5. Simulation Playback Loop
  useEffect(() => {
    if (!isPlaying || !simResult || simResult.frames.length === 0) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.max(10, 50 / playbackSpeed); // nominal 20Hz (50ms)
    playTimerRef.current = setInterval(() => {
      setCurrentFrameIdx((prev) => {
        if (prev >= simResult.frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, simResult, playbackSpeed]);

  const currentFrame = simResult?.frames[currentFrameIdx] || null;
  const totalFrames = simResult?.frames?.length || 0;
  const currentScenario = scenarios.find((s) => s.id === selectedScenarioId) || null;
  const totalTimeSec = simResult?.summary?.simulated_time_sec || 0.0;
  const currentTimeSec = currentFrame?.time_sec || 0.0;

  const handleDeleteRun = async (id) => {
    try {
      const res = await fetch(`/api/runs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRuns();
        showToast('Run record removed.');
      }
    } catch (e) {
      console.error('Error deleting run:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col font-sans">
      {/* Global Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hardwareInfo={hardwareInfo}
        onSelectHardware={handleSelectHardware}
        onRefreshData={handleRefreshData}
        isRefreshing={isRefreshing}
      />

      {/* Main App Body */}
      <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-blue-600 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-mono border border-blue-400 animate-bounce">
            {toastMessage}
          </div>
        )}

        {/* TAB 1: Simulation & Scenario Replay */}
        {activeTab === 'simulation' && (
          <div className="space-y-6">
            {/* Top Grid: Canvas + Parameter Tuning Drawer */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Simulation Canvas & Playback Controls */}
              <div className="lg:col-span-2 space-y-4">
                <SimulationCanvas
                  frame={currentFrame}
                  scenario={simResult?.scenario || currentScenario}
                  isSimulating={isSimulating}
                />

                <PlaybackControls
                  isPlaying={isPlaying}
                  onTogglePlay={() => setIsPlaying(!isPlaying)}
                  currentFrameIdx={currentFrameIdx}
                  totalFrames={totalFrames}
                  onSeek={(idx) => setCurrentFrameIdx(idx)}
                  onStepForward={() => setCurrentFrameIdx((prev) => Math.min(totalFrames - 1, prev + 1))}
                  onStepBackward={() => setCurrentFrameIdx((prev) => Math.max(0, prev - 1))}
                  onReset={() => {
                    setCurrentFrameIdx(0);
                    setIsPlaying(false);
                  }}
                  playbackSpeed={playbackSpeed}
                  onChangeSpeed={(s) => setPlaybackSpeed(s)}
                  currentTimeSec={currentTimeSec}
                  totalTimeSec={totalTimeSec}
                />
              </div>

              {/* Right Col: Scenario Selector & Parameter Tuning */}
              <div className="lg:col-span-1">
                <ParameterTuning
                  scenarios={scenarios}
                  selectedScenarioId={selectedScenarioId}
                  onSelectScenario={handleSelectScenario}
                  onUploadScenario={handleUploadScenario}
                  parameters={parameters}
                  onChangeParameter={(k, v) => setParameters((prev) => ({ ...prev, [k]: v }))}
                  onRunSimulation={handleRunSimulation}
                  isLoading={isSimulating}
                />
              </div>
            </div>

            {/* Bottom Row: Automated Safety Pass/Fail Score & Telemetry Cards */}
            <TelemetryCards
              summary={simResult?.summary}
              currentFrame={currentFrame}
            />
          </div>
        )}

        {/* TAB 2: Vision Lab (Real Media Perception) */}
        {activeTab === 'vision' && (
          <VisionLab
            mediaFiles={mediaFiles}
            onRefreshData={handleRefreshData}
          />
        )}

        {/* TAB 3: Backtest History & Comparison */}
        {activeTab === 'history' && (
          <HistoryComparison
            runs={runs}
            onRefreshRuns={fetchRuns}
            onDeleteRun={handleDeleteRun}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-3 px-6 text-center text-xs text-gray-500 font-mono">
        Autonomous Vehicle Path Planning & Hybrid Perception System • Ready for Real-Time Highway & Urban Driving Scenarios
      </footer>
    </div>
  );
}
