import React, { useState, useRef, useEffect } from 'react';
import { Eye, Upload, Image as ImageIcon, Video, Camera, Play, Pause, Clock, CheckCircle2, AlertCircle, Sparkles, Filter, Activity, Sliders, ShieldCheck } from 'lucide-react';

export default function VisionLab({ mediaFiles, onRefreshData }) {
  // Vision Modes: 'image', 'video_stream', 'webcam'
  const [visionMode, setVisionMode] = useState('image');
  
  // Image Mode State
  const [selectedMedia, setSelectedMedia] = useState(mediaFiles.find(m => m.type === 'image')?.filename || '');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [confThreshold, setConfThreshold] = useState(0.25);
  const [corridorWidth, setCorridorWidth] = useState(1.0);
  const [horizonCutoff, setHorizonCutoff] = useState(0.55);
  const [detectionMode, setDetectionMode] = useState('curved'); // 'curved' or 'geometric'
  const [sensitivity, setSensitivity] = useState(1.0);
  const [showDebugMask, setShowDebugMask] = useState(false);
  const [isInferring, setIsInferring] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Live Video Stream State
  const videoFiles = mediaFiles.filter(m => m.type === 'video' || m.filename.endsWith('.mp4'));
  const [selectedVideo, setSelectedVideo] = useState(videoFiles[0]?.filename || 'sample_dashcam.mp4');
  const [isVideoStreaming, setIsVideoStreaming] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());
  const videoFileInputRef = useRef(null);

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVideo(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/vision/upload-media', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const data = await res.json();
      if (onRefreshData) await onRefreshData();
      setSelectedVideo(data.filename);
      setIsVideoStreaming(true);
    } catch (err) {
      console.error('Video upload error:', err);
      setError(err.message || 'Failed to upload video');
    } finally {
      setIsUploadingVideo(false);
      e.target.value = '';
    }
  };

  // Live Webcam State
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [webcamFps, setWebcamFps] = useState(0);
  const [webcamLatency, setWebcamLatency] = useState(0);
  const [webcamAnnotatedUrl, setWebcamAnnotatedUrl] = useState(null);
  const [webcamObjects, setWebcamObjects] = useState([]);
  const videoElementRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const webcamCanvasRef = useRef(null);
  const isProcessingFrameRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());

  // Set default video if available
  useEffect(() => {
    if (videoFiles.length > 0 && !selectedVideo) {
      setSelectedVideo(videoFiles[0].filename);
    }
  }, [mediaFiles]);

  // Clean up webcam on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // --- Image Mode Handlers ---
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setSelectedMedia('');
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setError(null);
    }
  };

  const handleSelectMedia = (filename) => {
    setSelectedMedia(filename);
    setUploadedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  const handleRunInference = async (overrideCorridor, overrideHorizon, overrideMode, overrideSens) => {
    setIsInferring(true);
    setError(null);

    // If called directly from an onClick event, parameters might be synthetic event objects
    const validCorridor = typeof overrideCorridor === 'number' ? overrideCorridor : corridorWidth;
    const validHorizon = typeof overrideHorizon === 'number' ? overrideHorizon : horizonCutoff;
    const validMode = typeof overrideMode === 'string' ? overrideMode : detectionMode;
    const validSens = typeof overrideSens === 'number' ? overrideSens : sensitivity;

    const formData = new FormData();
    formData.append('conf_threshold', Number(confThreshold) || 0.25);
    formData.append('corridor_width', Number(validCorridor) || 1.0);
    formData.append('horizon_cutoff', Number(validHorizon) || 0.55);
    formData.append('detection_mode', validMode || 'curved');
    formData.append('sensitivity', Number(validSens) || 1.0);
    formData.append('generate_debug_mask', 'true');

    if (uploadedFile) {
      formData.append('file', uploadedFile);
    } else if (selectedMedia) {
      formData.append('filename', selectedMedia);
    } else {
      setError('Please select or upload a media file first.');
      setIsInferring(false);
      return;
    }

    try {
      const res = await fetch('/api/vision/infer', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        const msg = typeof errData.detail === 'string'
          ? errData.detail
          : Array.isArray(errData.detail)
            ? errData.detail.map(d => d.msg || JSON.stringify(d)).join(', ')
            : 'Inference failed';
        throw new Error(msg);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Vision inference error:', err);
      setError(err.message || 'Failed to execute vision perception pipeline');
    } finally {
      setIsInferring(false);
    }
  };

  // --- Live Webcam Handlers ---
  const startWebcam = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' }
      });
      webcamStreamRef.current = stream;
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = stream;
        videoElementRef.current.play();
      }
      setIsWebcamActive(true);
      requestAnimationFrame(processWebcamFrame);
    } catch (err) {
      console.error('Webcam error:', err);
      setError('Camera access denied or device has no camera. You can use the Live Video Stream tab instead!');
    }
  };

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(track => track.stop());
      webcamStreamRef.current = null;
    }
    setIsWebcamActive(false);
    setWebcamAnnotatedUrl(null);
    isProcessingFrameRef.current = false;
  };

  const processWebcamFrame = async () => {
    if (!webcamStreamRef.current || !videoElementRef.current) return;

    const video = videoElementRef.current;
    if (video.readyState >= 2 && !isProcessingFrameRef.current) {
      isProcessingFrameRef.current = true;
      const canvas = webcamCanvasRef.current || document.createElement('canvas');
      webcamCanvasRef.current = canvas;
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64Data = canvas.toDataURL('image/jpeg', 0.65);

      try {
        const t0 = performance.now();
        const res = await fetch('/api/vision/infer-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: base64Data,
            conf_threshold: confThreshold,
            corridor_width: corridorWidth,
            horizon_cutoff: horizonCutoff
          })
        });

        if (res.ok) {
          const data = await res.json();
          setWebcamAnnotatedUrl(data.annotated_image);
          setWebcamObjects(data.detected_objects || []);
          const t1 = performance.now();
          setWebcamLatency(Math.round(t1 - t0));

          // Calculate FPS
          frameCountRef.current += 1;
          const now = Date.now();
          if (now - lastFpsUpdateRef.current >= 1000) {
            setWebcamFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFpsUpdateRef.current = now;
          }
        }
      } catch (e) {
        console.error('Frame inference error:', e);
      } finally {
        isProcessingFrameRef.current = false;
      }
    }

    if (webcamStreamRef.current) {
      setTimeout(processWebcamFrame, 60); // ~15 FPS throttle
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-400" />
            Hybrid Vision & Perception Lab
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Real-time lane detection (OpenCV Canny & Hough ROI) + deep obstacle detection (Ultralytics YOLOv8)
          </p>
        </div>

        {/* Vision Mode Toggle Pills */}
        <div className="flex items-center space-x-1.5 bg-gray-950 p-1 rounded-lg border border-gray-800">
          <button
            onClick={() => {
              stopWebcam();
              setIsVideoStreaming(false);
              setVisionMode('image');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              visionMode === 'image'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photo Mode</span>
          </button>

          <button
            onClick={() => {
              stopWebcam();
              setVisionMode('video_stream');
              setIsVideoStreaming(true);
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              visionMode === 'video_stream'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-cyan-400" />
            <span>Live Video Stream</span>
          </button>

          <button
            onClick={() => {
              setIsVideoStreaming(false);
              setVisionMode('webcam');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              visionMode === 'webcam'
                ? 'bg-blue-600 text-white font-bold shadow'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>Live Camera Feed</span>
          </button>
        </div>
      </div>

      {/* Main Vision Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Visual Canvas Area */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative w-full aspect-video bg-gray-950 rounded-xl border border-gray-800 overflow-hidden flex items-center justify-center shadow-2xl">
            {/* 1. PHOTO MODE */}
            {visionMode === 'image' && (
              <>
                {showDebugMask && result?.lane_telemetry?.debug_mask_b64 ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    <img
                      src={result.lane_telemetry.debug_mask_b64}
                      alt="Computer Vision Lane Feature Mask"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute bottom-3 left-3 bg-gray-950/90 border border-purple-500/40 text-purple-300 px-2.5 py-1 rounded text-[11px] font-mono">
                      🔬 CV Feature Segmentation Mask (Color Contrast + Directional Gradients)
                    </div>
                  </div>
                ) : result?.annotated_image ? (
                  <img
                    src={result.annotated_image}
                    alt="Perception Annotated Result"
                    className="w-full h-full object-contain"
                  />
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded media preview"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-8 text-gray-500 space-y-2">
                    <ImageIcon className="w-12 h-12 mx-auto text-gray-600" />
                    <p className="text-sm">Select a road image from add_data/media/ or upload your own to begin</p>
                    <p className="text-xs text-gray-600">Supports .jpg, .png dashcam frames</p>
                  </div>
                )}

                {result && (
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2 pointer-events-none">
                    <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-mono text-emerald-400 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{result.lane_telemetry?.detection_mode === 'curved' ? 'Curved Spline Locked' : 'Geometric Lane Locked'}</span>
                    </div>
                    <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-mono text-blue-400 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Total: {result.total_latency_ms} ms</span>
                    </div>
                  </div>
                )}

                {result?.lane_telemetry?.debug_mask_b64 && (
                  <div className="absolute top-3 right-3 flex items-center space-x-2">
                    <button
                      onClick={() => setShowDebugMask(!showDebugMask)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 border transition-all cursor-pointer shadow-lg backdrop-blur-md ${
                        showDebugMask
                          ? 'bg-purple-600 text-white border-purple-400 shadow-purple-600/30 font-bold'
                          : 'bg-gray-900/90 text-purple-300 border-purple-500/40 hover:bg-gray-800'
                      }`}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      <span>{showDebugMask ? 'Show Driving View' : 'Show CV Feature Map'}</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* 2. LIVE VIDEO STREAM MODE (MJPEG continuous stream) */}
            {visionMode === 'video_stream' && (
              <>
                {isVideoStreaming ? (
                  <img
                    src={`/api/vision/video-stream?filename=${encodeURIComponent(selectedVideo)}&conf_threshold=${confThreshold}&corridor_width=${corridorWidth}&horizon_cutoff=${horizonCutoff}&detection_mode=${detectionMode}&sensitivity=${sensitivity}&t=${streamKey}`}
                    alt="Live Dashcam Stream"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-8 text-gray-500 space-y-2">
                    <Video className="w-12 h-12 mx-auto text-gray-600" />
                    <p className="text-sm">Live dashcam video stream paused.</p>
                    <button
                      onClick={() => setIsVideoStreaming(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Resume Live Stream
                    </button>
                  </div>
                )}

                {isVideoStreaming && (
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2 pointer-events-none">
                    <div className="bg-red-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-red-500/40 text-xs font-mono text-red-400 flex items-center space-x-1.5 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                      <span>LIVE VIDEO INFERENCE</span>
                    </div>
                    <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-mono text-emerald-400 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Continuous Lane & YOLO Overlay</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 3. LIVE WEBCAM MODE */}
            {visionMode === 'webcam' && (
              <>
                <video ref={videoElementRef} playsInline muted className="hidden" />
                {webcamAnnotatedUrl ? (
                  <img
                    src={webcamAnnotatedUrl}
                    alt="Live Webcam Perception"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-8 text-gray-500 space-y-3">
                    <Camera className="w-12 h-12 mx-auto text-gray-600" />
                    <p className="text-sm">Connect your device camera for real-time live road / object detection</p>
                    <button
                      onClick={startWebcam}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                    >
                      Start Camera Stream
                    </button>
                  </div>
                )}

                {isWebcamActive && (
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2 pointer-events-none">
                    <div className="bg-emerald-500/20 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center space-x-1.5 animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>CAMERA ACTIVE</span>
                    </div>
                    <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-mono text-cyan-400 flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      <span>{webcamFps} FPS</span>
                    </div>
                    <div className="bg-gray-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-mono text-blue-400 flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{webcamLatency} ms</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action Row & Controls */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            {/* Mode-specific actions */}
            {visionMode === 'image' && (
              <>
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-mono text-gray-400">Media source:</span>
                  <select
                    value={selectedMedia}
                    onChange={(e) => handleSelectMedia(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                  >
                    <option value="">-- Choose from add_data/media/ --</option>
                    {mediaFiles.map((m) => (
                      <option key={m.filename} value={m.filename}>
                        {m.filename} ({m.size_kb} KB)
                      </option>
                    ))}
                  </select>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".jpg,.jpeg,.png,.mp4"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium border border-gray-700 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-gray-400">Conf:</span>
                    <input
                      type="range"
                      min={0.1}
                      max={0.9}
                      step={0.05}
                      value={confThreshold}
                      onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                      className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <span className="text-xs font-mono font-bold text-blue-400">{confThreshold.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={() => handleRunInference()}
                    disabled={isInferring || (!selectedMedia && !uploadedFile)}
                    className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isInferring ? 'animate-spin' : ''}`} />
                    <span>{isInferring ? 'Analyzing...' : 'Run Vision Inference'}</span>
                  </button>
                </div>
              </>
            )}

            {visionMode === 'video_stream' && (
              <>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-mono text-gray-400">Video clip:</span>
                  <select
                    value={selectedVideo}
                    onChange={(e) => {
                      setSelectedVideo(e.target.value);
                      setIsVideoStreaming(true);
                    }}
                    className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 font-mono cursor-pointer"
                  >
                    {videoFiles.map((v) => (
                      <option key={v.filename} value={v.filename}>
                        {v.filename} ({v.size_kb} KB)
                      </option>
                    ))}
                  </select>

                  {/* Upload Custom Video Button */}
                  <input
                    type="file"
                    ref={videoFileInputRef}
                    onChange={handleVideoUpload}
                    accept=".mp4,.avi,.mov"
                    className="hidden"
                  />
                  <button
                    onClick={() => videoFileInputRef.current?.click()}
                    disabled={isUploadingVideo}
                    title="Upload an .mp4 dashcam video to add_data/media/"
                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingVideo ? 'Uploading...' : 'Upload Video (.mp4)'}</span>
                  </button>

                  <button
                    onClick={() => setIsVideoStreaming(!isVideoStreaming)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isVideoStreaming
                        ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {isVideoStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isVideoStreaming ? 'Pause Stream' : 'Resume Stream'}</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-gray-400">YOLO Conf:</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={confThreshold}
                    onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                    className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-xs font-mono font-bold text-blue-400">{confThreshold.toFixed(2)}</span>
                </div>
              </>
            )}

            {visionMode === 'webcam' && (
              <>
                <div className="flex items-center space-x-3">
                  {isWebcamActive ? (
                    <button
                      onClick={stopWebcam}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-red-600/30 transition-all cursor-pointer"
                    >
                      Stop Camera
                    </button>
                  ) : (
                    <button
                      onClick={startWebcam}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
                    >
                      Start Camera
                    </button>
                  )}
                  <span className="text-xs text-gray-400 font-mono">
                    {isWebcamActive ? 'Streaming live frames to hybrid perception pipeline' : 'Camera currently disconnected'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-gray-400">YOLO Conf:</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={confThreshold}
                    onChange={(e) => setConfThreshold(parseFloat(e.target.value))}
                    className="w-24 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-xs font-mono font-bold text-blue-400">{confThreshold.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right Col: Performance Breakdown & Detected Objects Table */}
        <div className="space-y-4">
          {/* Safe Driving Area & Lane Perception Calibration Card */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center space-x-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Lane Perception & Calibration</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono">
                Enhanced v2.5
              </span>
            </div>

            {/* Lane Algorithm Selector Mode */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-mono text-gray-400">Detection Architecture:</span>
              <div className="grid grid-cols-2 gap-2 bg-gray-950 p-1 rounded-lg border border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setDetectionMode('curved');
                    setStreamKey(Date.now());
                    if (visionMode === 'image') handleRunInference(corridorWidth, horizonCutoff, 'curved', sensitivity);
                  }}
                  className={`py-1.5 px-2 rounded text-[11px] font-mono font-medium transition-all cursor-pointer ${
                    detectionMode === 'curved'
                      ? 'bg-blue-600 text-white font-bold shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  ⚡ Curved Spline
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetectionMode('geometric');
                    setStreamKey(Date.now());
                    if (visionMode === 'image') handleRunInference(corridorWidth, horizonCutoff, 'geometric', sensitivity);
                  }}
                  className={`py-1.5 px-2 rounded text-[11px] font-mono font-medium transition-all cursor-pointer ${
                    detectionMode === 'geometric'
                      ? 'bg-blue-600 text-white font-bold shadow'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  📐 Geometric Track
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-1 text-xs font-mono">
              {/* Road Surface & Lighting Sensitivity */}
              <div>
                <div className="flex justify-between items-center text-gray-400 mb-1">
                  <span>Surface Sensitivity:</span>
                  <span className="text-amber-400 font-bold">{sensitivity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.70}
                  max={1.30}
                  step={0.05}
                  value={sensitivity}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSensitivity(val);
                    setStreamKey(Date.now());
                    if (visionMode === 'image') {
                      handleRunInference(corridorWidth, horizonCutoff, detectionMode, val);
                    }
                  }}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                  <span>Dusk / Shadow</span>
                  <span>Standard</span>
                  <span>Direct Sunlight</span>
                </div>
              </div>

              {/* Corridor Width Slider */}
              <div>
                <div className="flex justify-between items-center text-gray-400 mb-1">
                  <span>Corridor Width:</span>
                  <span className="text-emerald-400 font-bold">{corridorWidth.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.5}
                  step={0.05}
                  value={corridorWidth}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setCorridorWidth(val);
                    setStreamKey(Date.now());
                    if (visionMode === 'image') {
                      handleRunInference(val, horizonCutoff, detectionMode, sensitivity);
                    }
                  }}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                  <span>Tight (0.7x)</span>
                  <span>Standard (1.0x)</span>
                  <span>Wide (1.5x)</span>
                </div>
              </div>

              {/* Horizon Lookahead Slider */}
              <div>
                <div className="flex justify-between items-center text-gray-400 mb-1">
                  <span>Horizon Lookahead:</span>
                  <span className="text-cyan-400 font-bold">{Math.round(horizonCutoff * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.45}
                  max={0.70}
                  step={0.02}
                  value={horizonCutoff}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setHorizonCutoff(val);
                    setStreamKey(Date.now());
                    if (visionMode === 'image') {
                      handleRunInference(corridorWidth, val, detectionMode, sensitivity);
                    }
                  }}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
                  <span>Far (45%)</span>
                  <span>Default (55%)</span>
                  <span>Near (70%)</span>
                </div>
              </div>

              {/* Presets */}
              <div className="pt-2 border-t border-gray-800 flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setCorridorWidth(1.0);
                    setHorizonCutoff(0.55);
                    setDetectionMode('curved');
                    setSensitivity(1.0);
                    setStreamKey(Date.now());
                    if (visionMode === 'image') handleRunInference(1.0, 0.55, 'curved', 1.0);
                  }}
                  className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] cursor-pointer"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCorridorWidth(1.20);
                    setHorizonCutoff(0.50);
                    setDetectionMode('curved');
                    setSensitivity(1.05);
                    setStreamKey(Date.now());
                    if (visionMode === 'image') handleRunInference(1.20, 0.50, 'curved', 1.05);
                  }}
                  className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] cursor-pointer"
                >
                  Highway Curve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCorridorWidth(0.85);
                    setHorizonCutoff(0.60);
                    setDetectionMode('geometric');
                    setSensitivity(1.10);
                    setStreamKey(Date.now());
                    if (visionMode === 'image') handleRunInference(0.85, 0.60, 'geometric', 1.10);
                  }}
                  className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] cursor-pointer"
                >
                  Narrow Urban
                </button>
              </div>

              {/* Advanced ADAS Telemetry Dashboard Card */}
              {result?.lane_telemetry && (
                <div className="bg-gray-950 p-3 rounded-lg border border-gray-800 text-[11px] space-y-2 text-gray-400">
                  <div className="flex items-center justify-between pb-1.5 border-b border-gray-800">
                    <span className="font-semibold text-gray-300">Lane Departure Warning:</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      result.lane_telemetry.ldw_status?.includes('CENTERED')
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : result.lane_telemetry.ldw_status?.includes('DRIFT')
                        ? 'bg-amber-950 text-amber-400 border border-amber-800'
                        : 'bg-red-950 text-red-400 border border-red-800'
                    }`}>
                      {result.lane_telemetry.ldw_status || 'CENTERED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-gray-500">Lateral Offset:</span>
                      <div className="text-sm font-bold font-mono text-cyan-400">
                        {result.lane_telemetry.lateral_offset_m >= 0 ? `+${result.lane_telemetry.lateral_offset_m}` : result.lane_telemetry.lateral_offset_m} m
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Heading Angle:</span>
                      <div className="text-sm font-bold font-mono text-blue-400">
                        {result.lane_telemetry.heading_angle_deg >= 0 ? `+${result.lane_telemetry.heading_angle_deg}` : result.lane_telemetry.heading_angle_deg}°
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-500">Road Curvature:</span>
                    <span className="text-purple-300 font-semibold font-mono">{result.lane_telemetry.curvature_label || 'Straight Road'}</span>
                  </div>

                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-gray-500">Physical Lane Width:</span>
                    <span className="text-emerald-400 font-bold font-mono">{result.lane_telemetry.lane_width_m || 3.7} m ({result.lane_telemetry.corridor_bottom_width_px} px)</span>
                  </div>

                  {/* Confidence meters */}
                  <div className="pt-1.5 border-t border-gray-800 space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span>Left Boundary Lock:</span>
                      <span className="text-gray-300 font-bold font-mono">{Math.round((result.lane_telemetry.left_confidence || 0.85) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((result.lane_telemetry.left_confidence || 0.85) * 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] pt-1">
                      <span>Right Boundary Lock:</span>
                      <span className="text-gray-300 font-bold font-mono">{Math.round((result.lane_telemetry.right_confidence || 0.85) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((result.lane_telemetry.right_confidence || 0.85) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Latency Breakdown Card */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-gray-400 flex items-center space-x-2">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Pipeline Latency Breakdown</span>
            </h3>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-400">OpenCV Lane Pipeline:</span>
                <span className="text-emerald-400 font-bold">
                  {visionMode === 'image' && result ? `${result.lane_telemetry.latency_ms} ms` : (visionMode === 'webcam' && isWebcamActive ? '~15 ms' : '--')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-400">YOLOv8 Detection:</span>
                <span className="text-blue-400 font-bold">
                  {visionMode === 'image' && result ? `${result.yolo_telemetry.latency_ms} ms` : (visionMode === 'webcam' && isWebcamActive ? `${webcamLatency} ms` : '--')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-800">
                <span className="text-gray-400">Total Pipeline Latency:</span>
                <span className="text-cyan-400 font-bold">
                  {visionMode === 'image' && result ? `${result.total_latency_ms} ms` : (visionMode === 'webcam' && isWebcamActive ? `${webcamLatency} ms` : (visionMode === 'video_stream' ? 'Live ~25 FPS' : '--'))}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-gray-400">Mode:</span>
                <span className="text-amber-400 font-bold uppercase">
                  {visionMode.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Detected Objects Table */}
          <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider text-gray-400 flex items-center space-x-2">
                <Filter className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  Detected Actors ({visionMode === 'webcam' ? webcamObjects.length : (result?.detected_objects?.length || 0)})
                </span>
              </h3>
            </div>

            <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="pb-2">Class</th>
                    <th className="pb-2">Conf</th>
                    <th className="pb-2">Est. Dist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 text-gray-300">
                  {visionMode === 'webcam' && webcamObjects.length > 0 ? (
                    webcamObjects.map((obj, i) => (
                      <tr key={i} className="hover:bg-gray-800/40">
                        <td className="py-2 capitalize font-semibold text-white">{obj.class}</td>
                        <td className="py-2 text-blue-400">{(obj.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2 text-cyan-400">{obj.estimated_distance_m} m</td>
                      </tr>
                    ))
                  ) : visionMode === 'image' && result?.detected_objects?.length ? (
                    result.detected_objects.map((obj, i) => (
                      <tr key={i} className="hover:bg-gray-800/40">
                        <td className="py-2 capitalize font-semibold text-white">{obj.class}</td>
                        <td className="py-2 text-blue-400">{(obj.confidence * 100).toFixed(1)}%</td>
                        <td className="py-2 text-cyan-400">{obj.estimated_distance_m} m</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-500">
                        {visionMode === 'video_stream' ? 'Overlaid live on stream above' : (isWebcamActive ? 'Scanning camera...' : 'Awaiting stream start')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
