'use client';

import {
  Activity,
  AudioLines,
  CircleGauge,
  Ear,
  Mic,
  Music2,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  Volume2,
  Waves,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  estimatePitch,
  findTriggeredStart,
  gainFromLoudness,
  noteFromFrequency,
  resolveAudiblePitch,
  rmsToDb,
} from '@/app/sound-physics';

type Metrics = {
  db: number;
  pitch: number;
  note: string;
  centroid: number;
  clarity: number;
};

type InputMode = 'microphone' | 'generator';
type ActiveSource = InputMode | null;
type RecordingSlot = 'A' | 'B';
type TeachingWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type SoundObservationSnapshot = {
  source: 'microphone' | 'generator';
  capturedAt: number;
  pitchHz: number | null;
  dbfs: number | null;
  clarity: number;
  centroidHz: number;
  timeWindowMs: number;
  verticalGain: number;
  generator?: {
    frequencyHz: number;
    loudness: number;
    waveform: 'sine' | 'triangle' | 'square' | 'sawtooth';
  };
  clipSlot?: 'A' | 'B';
};

export type SoundLabProps = {
  onCaptureObservation?: (snapshot: SoundObservationSnapshot) => void;
  captureEnabled?: boolean;
  captureDescription?: string;
  captureButtonLabel?: string;
};

type RecordedClip = {
  id: string;
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  source: InputMode;
  sourceLabel: string;
  capturedAt: string;
  capturedAtMs: number;
  metrics: Metrics;
  generator?: SoundObservationSnapshot['generator'];
};

type RecordingMeta = {
  slot: RecordingSlot;
  sampleRate: number;
  source: InputMode;
  sourceLabel: string;
  fallbackPitch: number;
  fallbackCentroid: number;
  generator?: SoundObservationSnapshot['generator'];
};

const EMPTY_METRICS: Metrics = {
  db: -60,
  pitch: 0,
  note: '—',
  centroid: 0,
  clarity: 0,
};

const RECORDING_SECONDS = 3;
const TIMEBASE_OPTIONS = [20, 40, 80, 160] as const;

const WAVEFORM_LABELS: Record<TeachingWaveform, string> = {
  sine: '正弦波',
  triangle: '三角波',
  square: '方波',
  sawtooth: '锯齿波',
};

function sliderValue(value: number | readonly number[], fallback: number) {
  return typeof value === 'number' ? value : value[0] ?? fallback;
}

function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function drawScopeGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
) {
  context.fillStyle = '#071813';
  context.fillRect(0, 0, width, height);

  context.lineWidth = dpr;
  context.strokeStyle = 'rgba(130, 179, 159, 0.12)';
  for (let column = 0; column <= 50; column += 1) {
    const x = (column / 50) * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let row = 0; row <= 40; row += 1) {
    const y = (row / 40) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(132, 214, 180, 0.27)';
  for (let column = 0; column <= 10; column += 1) {
    const x = (column / 10) * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let row = 0; row <= 8; row += 1) {
    const y = (row / 8) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(174, 238, 211, 0.54)';
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();
}

function drawOscilloscope(
  canvas: HTMLCanvasElement,
  data: Float32Array | null,
  sampleRate: number,
  timeWindowMs: number,
  verticalGain: number,
  autoTrigger: boolean,
  anchorRatio = 1,
  color = '#78eebe',
) {
  const { width, height, dpr } = fitCanvas(canvas);
  const context = canvas.getContext('2d');
  if (!context) return;
  drawScopeGrid(context, width, height, dpr);
  if (!data || data.length < 2 || !sampleRate) return;

  const visibleSamples = Math.min(
    data.length,
    Math.max(2, Math.round((sampleRate * timeWindowMs) / 1000)),
  );
  const start = findTriggeredStart(data, visibleSamples, autoTrigger, anchorRatio);

  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  context.strokeStyle = color;
  context.shadowColor = `${color}66`;
  context.shadowBlur = 7 * dpr;
  context.lineWidth = 1.55 * dpr;
  context.lineJoin = 'round';
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const ratio = x / Math.max(1, width - 1);
    const sampleIndex = Math.min(
      data.length - 1,
      start + Math.round(ratio * (visibleSamples - 1)),
    );
    const y = height / 2 - data[sampleIndex] * verticalGain * height * 0.43;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();
}

function drawSpectrum(canvas: HTMLCanvasElement, frequencyData: Uint8Array | null) {
  const { width, height, dpr } = fitCanvas(canvas);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#071813';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(130, 179, 159, 0.13)';
  context.lineWidth = dpr;
  for (let column = 0; column <= 10; column += 1) {
    const x = (column / 10) * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  if (!frequencyData) return;
  const bars = Math.min(96, Math.max(24, Math.floor(width / (8 * dpr))));
  const usableBins = Math.min(frequencyData.length, 7000);
  const gap = 1.5 * dpr;
  const barWidth = Math.max(dpr, width / bars - gap);
  for (let bar = 0; bar < bars; bar += 1) {
    const start = Math.floor((bar / bars) ** 2.15 * usableBins);
    const end = Math.max(start + 1, Math.floor(((bar + 1) / bars) ** 2.15 * usableBins));
    let peak = 0;
    for (let bin = start; bin < end; bin += 1) peak = Math.max(peak, frequencyData[bin]);
    const barHeight = (peak / 255) * height * 0.92;
    context.fillStyle = bar < bars * 0.45 ? '#78eebe' : bar < bars * 0.72 ? '#62bcd0' : '#e6ad6f';
    context.globalAlpha = 0.35 + (peak / 255) * 0.65;
    context.fillRect(bar * (barWidth + gap), height - barHeight, barWidth, Math.max(dpr, barHeight));
  }
  context.globalAlpha = 1;
}

function calculateCentroid(frequencyData: Uint8Array, sampleRate: number, fftSize: number) {
  const binHz = sampleRate / fftSize;
  let weighted = 0;
  let total = 0;
  for (let index = 1; index < frequencyData.length; index += 1) {
    weighted += index * binHz * frequencyData[index];
    total += frequencyData[index];
  }
  return total > 0 ? weighted / total : 0;
}

function analyseClip(
  samples: Float32Array,
  sampleRate: number,
  fallbackPitch: number,
  fallbackCentroid: number,
): Metrics {
  const pitchResult = estimatePitch(samples, sampleRate);
  const db = rmsToDb(samples);
  const pitch = resolveAudiblePitch(pitchResult.frequency, fallbackPitch, db);
  return {
    db,
    pitch,
    note: noteFromFrequency(pitch),
    centroid: fallbackCentroid,
    clarity: pitch ? (pitchResult.frequency ? pitchResult.clarity : 1) : 0,
  };
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  description: string;
}) {
  return (
    <article className="ss-metric">
      <span className="ss-metric-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value} <small>{unit}</small></strong>
        <p>{description}</p>
      </div>
    </article>
  );
}

function ScopeLabels({ timeWindowMs, gain }: { timeWindowMs: number; gain: number }) {
  return (
    <div className="ss-scope-labels" aria-hidden="true">
      <span>CH1 · {gain.toFixed(2)}×</span>
      <span>AUTO · ↑ 0</span>
      <span>{(timeWindowMs / 10).toFixed(1)} ms/格</span>
    </div>
  );
}

function ClipScope({
  slot,
  clip,
  canvasRef,
  timeWindowMs,
  verticalGain,
  onClear,
  onCapture,
  captureEnabled,
}: {
  slot: RecordingSlot;
  clip: RecordedClip | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  timeWindowMs: number;
  verticalGain: number;
  onClear: () => void;
  onCapture?: () => void;
  captureEnabled: boolean;
}) {
  return (
    <article className="ss-clip-card">
      <div className="ss-clip-head">
        <div>
          <span className={`ss-slot ss-slot-${slot.toLowerCase()}`}>片段 {slot}</span>
          <strong>{clip ? clip.sourceLabel : '等待录制'}</strong>
        </div>
        {clip && (
          <button type="button" className="ss-icon-button" onClick={onClear} aria-label={`清除片段${slot}`}>
            <Trash2 />
          </button>
        )}
      </div>
      <div className="ss-clip-canvas">
        <canvas ref={canvasRef} aria-label={`录制片段${slot}的示波器波形`} />
        <ScopeLabels timeWindowMs={timeWindowMs} gain={verticalGain} />
        {!clip && <div className="ss-canvas-message">录制后将在同一标尺下显示</div>}
      </div>
      <div className="ss-clip-meta">
        <span><b>{clip ? clip.metrics.db.toFixed(1) : '—'}</b> dBFS</span>
        <span><b>{clip && clip.metrics.pitch ? clip.metrics.pitch.toFixed(0) : '—'}</b> Hz</span>
        <span><b>{clip ? clip.duration.toFixed(1) : '—'}</b> s</span>
        <small>{clip ? clip.capturedAt : '仅保存在本页内存'}</small>
      </div>
      {clip && onCapture && (
        <Button type="button" variant="outline" size="sm" disabled={!captureEnabled} onClick={onCapture}>
          <Activity />将片段 {slot} 摘要用于探究
        </Button>
      )}
    </article>
  );
}

export function SoundLab({
  onCaptureObservation,
  captureEnabled = true,
  captureDescription = '仅将测量读数与示波器标尺写入探究证据，不包含波形采样或原始音频。',
  captureButtonLabel = '将当前读数用于探究',
}: SoundLabProps = {}) {
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const spectrumRef = useRef<HTMLCanvasElement>(null);
  const clipARef = useRef<HTMLCanvasElement>(null);
  const clipBRef = useRef<HTMLCanvasElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const microphoneNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const toneGainRef = useRef<GainNode | null>(null);
  const activeSourceRef = useRef<ActiveSource>(null);
  const animationRef = useRef<number | null>(null);
  const lastMetricUpdateRef = useRef(0);
  const metricsRef = useRef<Metrics>(EMPTY_METRICS);
  const frequencyRef = useRef(440);
  const loudnessRef = useRef(35);
  const waveformTypeRef = useRef<TeachingWaveform>('sine');

  const recordingChunksRef = useRef<Float32Array[]>([]);
  const recordingSampleCountRef = useRef(0);
  const recordingMetaRef = useRef<RecordingMeta | null>(null);
  const recordingLastSampleAtRef = useRef(0);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingProgressTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const mountedRef = useRef(true);
  const startGenerationRef = useRef(0);
  const startingSourceRef = useRef<InputMode | null>(null);

  const [inputMode, setInputMode] = useState<InputMode>('microphone');
  const [activeSource, setActiveSource] = useState<ActiveSource>(null);
  const [startingSource, setStartingSource] = useState<InputMode | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [frequency, setFrequency] = useState(440);
  const [loudness, setLoudness] = useState(35);
  const [waveformType, setWaveformType] = useState<TeachingWaveform>('sine');
  const [verticalGain, setVerticalGain] = useState(2.5);
  const [timeWindowMs, setTimeWindowMs] = useState<number>(40);
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [recordingSlot, setRecordingSlot] = useState<RecordingSlot | null>(null);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [clipA, setClipA] = useState<RecordedClip | null>(null);
  const [clipB, setClipB] = useState<RecordedClip | null>(null);
  const [reviewPosition, setReviewPosition] = useState(50);
  const [error, setError] = useState('');

  useEffect(() => {
    frequencyRef.current = frequency;
    if (oscillatorRef.current && audioContextRef.current) {
      oscillatorRef.current.frequency.setTargetAtTime(frequency, audioContextRef.current.currentTime, 0.012);
    }
  }, [frequency]);

  useEffect(() => {
    waveformTypeRef.current = waveformType;
    if (oscillatorRef.current) oscillatorRef.current.type = waveformType;
  }, [waveformType]);

  useEffect(() => {
    loudnessRef.current = loudness;
    const context = audioContextRef.current;
    const gainNode = toneGainRef.current;
    if (context && gainNode) {
      const safeAmplitude = gainFromLoudness(loudness);
      gainNode.gain.setTargetAtTime(safeAmplitude, context.currentTime, 0.018);
    }
  }, [loudness]);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  const createAnalyser = useCallback((context: AudioContext) => {
    const analyser = context.createAnalyser();
    analyser.fftSize = 32768;
    analyser.smoothingTimeConstant = 0.55;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -10;
    return analyser;
  }, []);

  const invalidatePendingStart = useCallback(() => {
    startGenerationRef.current += 1;
    startingSourceRef.current = null;
    if (mountedRef.current) setStartingSource(null);
  }, []);

  const beginStart = useCallback((source: InputMode) => {
    if (startingSourceRef.current !== null) return null;
    const generation = startGenerationRef.current + 1;
    startGenerationRef.current = generation;
    startingSourceRef.current = source;
    if (mountedRef.current) setStartingSource(source);
    return generation;
  }, []);

  const isCurrentStart = useCallback((generation: number, source: InputMode) => (
    mountedRef.current
    && startGenerationRef.current === generation
    && startingSourceRef.current === source
  ), []);

  const finishStart = useCallback((generation: number, source: InputMode) => {
    if (startGenerationRef.current !== generation || startingSourceRef.current !== source) return;
    startingSourceRef.current = null;
    if (mountedRef.current) setStartingSource(null);
  }, []);

  const closeCommittedAudioGraph = useCallback(() => {
    const analyser = analyserRef.current;
    const context = audioContextRef.current;
    analyserRef.current = null;
    audioContextRef.current = null;
    try {
      analyser?.disconnect();
    } catch {
      // The analyser may already be detached while switching inputs.
    }
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  const finishRecording = useCallback((keepClip = true) => {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recordingProgressTimerRef.current !== null) {
      window.clearInterval(recordingProgressTimerRef.current);
      recordingProgressTimerRef.current = null;
    }

    const meta = recordingMetaRef.current;
    const sampleCount = recordingSampleCountRef.current;
    if (keepClip && meta && sampleCount > meta.sampleRate * 0.2) {
      const samples = new Float32Array(sampleCount);
      let offset = 0;
      for (const chunk of recordingChunksRef.current) {
        const remaining = sampleCount - offset;
        if (remaining <= 0) break;
        const section = chunk.subarray(0, remaining);
        samples.set(section, offset);
        offset += section.length;
      }
      const pitchMetrics = analyseClip(samples, meta.sampleRate, meta.fallbackPitch, meta.fallbackCentroid);
      const capturedAtMs = Date.now();
      const clip: RecordedClip = {
        id: `${meta.slot}-${capturedAtMs}`,
        samples,
        sampleRate: meta.sampleRate,
        duration: samples.length / meta.sampleRate,
        source: meta.source,
        sourceLabel: meta.sourceLabel,
        capturedAt: new Date(capturedAtMs).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        capturedAtMs,
        metrics: pitchMetrics,
        generator: meta.generator,
      };
      if (meta.slot === 'A') setClipA(clip);
      else setClipB(clip);
    }

    recordingChunksRef.current = [];
    recordingSampleCountRef.current = 0;
    recordingMetaRef.current = null;
    recordingLastSampleAtRef.current = 0;
    setRecordingSlot(null);
    setRecordingProgress(0);
  }, []);

  const stopMicrophone = useCallback(() => {
    invalidatePendingStart();
    if (activeSourceRef.current === 'microphone') finishRecording(true);
    try {
      microphoneNodeRef.current?.disconnect();
    } catch {
      // The node can already be detached after a device change.
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneNodeRef.current = null;
    mediaStreamRef.current = null;
    if (activeSourceRef.current === 'microphone') {
      closeCommittedAudioGraph();
      activeSourceRef.current = null;
      if (mountedRef.current) {
        setActiveSource(null);
        setIsPaused(false);
      }
    }
  }, [closeCommittedAudioGraph, finishRecording, invalidatePendingStart]);

  const stopGenerator = useCallback(() => {
    invalidatePendingStart();
    if (activeSourceRef.current === 'generator') finishRecording(true);
    try {
      oscillatorRef.current?.stop();
      oscillatorRef.current?.disconnect();
      toneGainRef.current?.disconnect();
    } catch {
      // Oscillator.stop() throws when it has already stopped.
    }
    oscillatorRef.current = null;
    toneGainRef.current = null;
    if (activeSourceRef.current === 'generator') {
      closeCommittedAudioGraph();
      activeSourceRef.current = null;
      if (mountedRef.current) {
        setActiveSource(null);
        setIsPaused(false);
      }
    }
  }, [closeCommittedAudioGraph, finishRecording, invalidatePendingStart]);

  const chooseInputMode = useCallback((nextMode: InputMode) => {
    if (recordingMetaRef.current) return;
    invalidatePendingStart();
    if (mountedRef.current) setError('');
    if (nextMode === inputMode) return;
    if (activeSourceRef.current === 'microphone') stopMicrophone();
    if (activeSourceRef.current === 'generator') stopGenerator();
    setInputMode(nextMode);
    setMetrics(EMPTY_METRICS);
  }, [inputMode, invalidatePendingStart, stopGenerator, stopMicrophone]);

  const startMicrophone = async () => {
    if (startingSourceRef.current !== null || activeSourceRef.current === 'microphone') return;
    if (activeSourceRef.current === 'generator') stopGenerator();
    const generation = beginStart('microphone');
    if (generation === null) return;
    if (mountedRef.current) setError('');

    let localStream: MediaStream | null = null;
    let localContext: AudioContext | null = null;
    let localAnalyser: AnalyserNode | null = null;
    let localSource: MediaStreamAudioSourceNode | null = null;
    const cleanupLocalResources = () => {
      try {
        localSource?.disconnect();
        localAnalyser?.disconnect();
      } catch {
        // A partially-created graph may already be disconnected.
      }
      localStream?.getTracks().forEach((track) => track.stop());
      if (localContext && localContext.state !== 'closed') void localContext.close().catch(() => undefined);
      localSource = null;
      localAnalyser = null;
      localStream = null;
      localContext = null;
    };

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      });
      if (!isCurrentStart(generation, 'microphone')) {
        cleanupLocalResources();
        return;
      }

      localContext = new AudioContext({ latencyHint: 'interactive' });
      if (localContext.state === 'suspended') await localContext.resume();
      if (!isCurrentStart(generation, 'microphone')) {
        cleanupLocalResources();
        return;
      }

      localAnalyser = createAnalyser(localContext);
      localSource = localContext.createMediaStreamSource(localStream);
      localSource.connect(localAnalyser);
      if (!isCurrentStart(generation, 'microphone')) {
        cleanupLocalResources();
        return;
      }

      audioContextRef.current = localContext;
      analyserRef.current = localAnalyser;
      mediaStreamRef.current = localStream;
      microphoneNodeRef.current = localSource;
      localContext = null;
      localAnalyser = null;
      localStream = null;
      localSource = null;
      activeSourceRef.current = 'microphone';
      if (mountedRef.current) {
        setInputMode('microphone');
        setActiveSource('microphone');
        setIsPaused(false);
      }
    } catch (reason) {
      cleanupLocalResources();
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError';
      if (isCurrentStart(generation, 'microphone') && mountedRef.current) {
        setError(denied ? '麦克风权限未开启。请在浏览器地址栏允许访问后重试。' : '暂时无法读取麦克风，请检查设备连接后重试。');
      }
    } finally {
      finishStart(generation, 'microphone');
    }
  };

  const startGenerator = async () => {
    if (startingSourceRef.current !== null || activeSourceRef.current === 'generator') return;
    if (activeSourceRef.current === 'microphone') stopMicrophone();
    const generation = beginStart('generator');
    if (generation === null) return;
    if (mountedRef.current) setError('');

    let localContext: AudioContext | null = null;
    let localAnalyser: AnalyserNode | null = null;
    let localOscillator: OscillatorNode | null = null;
    let localGain: GainNode | null = null;
    const cleanupLocalResources = () => {
      try {
        localOscillator?.stop();
      } catch {
        // The oscillator may not have started yet.
      }
      try {
        localOscillator?.disconnect();
        localGain?.disconnect();
        localAnalyser?.disconnect();
      } catch {
        // A partially-created graph may already be disconnected.
      }
      if (localContext && localContext.state !== 'closed') void localContext.close().catch(() => undefined);
      localOscillator = null;
      localGain = null;
      localAnalyser = null;
      localContext = null;
    };

    try {
      localContext = new AudioContext({ latencyHint: 'interactive' });
      if (localContext.state === 'suspended') await localContext.resume();
      if (!isCurrentStart(generation, 'generator')) {
        cleanupLocalResources();
        return;
      }

      localAnalyser = createAnalyser(localContext);
      localOscillator = localContext.createOscillator();
      localGain = localContext.createGain();
      localOscillator.type = waveformTypeRef.current;
      localOscillator.frequency.value = frequencyRef.current;
      localGain.gain.value = gainFromLoudness(loudness);
      localOscillator.connect(localGain);
      localGain.connect(localAnalyser);
      localGain.connect(localContext.destination);
      localOscillator.start();
      if (!isCurrentStart(generation, 'generator')) {
        cleanupLocalResources();
        return;
      }

      audioContextRef.current = localContext;
      analyserRef.current = localAnalyser;
      oscillatorRef.current = localOscillator;
      toneGainRef.current = localGain;
      localContext = null;
      localAnalyser = null;
      localOscillator = null;
      localGain = null;
      activeSourceRef.current = 'generator';
      if (mountedRef.current) {
        setInputMode('generator');
        setActiveSource('generator');
        setIsPaused(false);
      }
    } catch {
      cleanupLocalResources();
      if (isCurrentStart(generation, 'generator') && mountedRef.current) {
        setError('浏览器暂时无法启动声音发生器，请刷新页面后重试。');
      }
    } finally {
      finishStart(generation, 'generator');
    }
  };

  const startRecording = useCallback((slot: RecordingSlot) => {
    const context = audioContextRef.current;
    const analyser = analyserRef.current;
    if (!context || !analyser || !activeSourceRef.current) {
      setError('请先启动麦克风采集或声音发生器，再录制片段。');
      return;
    }
    setError('');
    finishRecording(false);

    const source = activeSourceRef.current;
    const sourceLabel = source === 'microphone'
      ? '麦克风实测'
      : `${frequencyRef.current} Hz · ${WAVEFORM_LABELS[waveformTypeRef.current]}`;
    recordingMetaRef.current = {
      slot,
      sampleRate: context.sampleRate,
      source,
      sourceLabel,
      fallbackPitch: source === 'generator' ? frequencyRef.current : 0,
      fallbackCentroid: metricsRef.current.centroid,
      generator: source === 'generator'
        ? {
            frequencyHz: frequencyRef.current,
            loudness: loudnessRef.current,
            waveform: waveformTypeRef.current,
          }
        : undefined,
    };
    recordingChunksRef.current = [];
    recordingSampleCountRef.current = 0;
    recordingStartedAtRef.current = performance.now();
    recordingLastSampleAtRef.current = recordingStartedAtRef.current;
    setRecordingSlot(slot);
    setRecordingProgress(0);
    recordingProgressTimerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - recordingStartedAtRef.current;
      setRecordingProgress(Math.min(100, (elapsed / (RECORDING_SECONDS * 1000)) * 100));
    }, 50);
    recordingTimeoutRef.current = window.setTimeout(() => finishRecording(true), RECORDING_SECONDS * 1000 + 80);
  }, [finishRecording]);

  const drawIdle = useCallback(() => {
    if (waveformRef.current) {
      drawOscilloscope(waveformRef.current, null, 48000, timeWindowMs, verticalGain, autoTrigger);
    }
    if (spectrumRef.current) drawSpectrum(spectrumRef.current, null);
  }, [autoTrigger, timeWindowMs, verticalGain]);

  const drawLive = useCallback(() => {
    const analyser = analyserRef.current;
    const waveformCanvas = waveformRef.current;
    const spectrumCanvas = spectrumRef.current;
    if (!analyser || !waveformCanvas || !spectrumCanvas || !activeSourceRef.current) return;

    const timeData = new Float32Array(analyser.fftSize);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getFloatTimeDomainData(timeData);
    analyser.getByteFrequencyData(frequencyData);
    const now = performance.now();
    const recordingMeta = recordingMetaRef.current;
    if (recordingMeta) {
      const maximumSamples = Math.round(recordingMeta.sampleRate * RECORDING_SECONDS);
      const remaining = maximumSamples - recordingSampleCountRef.current;
      const elapsedMs = Math.max(1, now - recordingLastSampleAtRef.current);
      const requestedSamples = Math.max(1, Math.round(recordingMeta.sampleRate * elapsedMs / 1000));
      const sampleCount = Math.min(remaining, requestedSamples, timeData.length);
      if (sampleCount > 0) {
        const chunk = timeData.slice(timeData.length - sampleCount);
        recordingChunksRef.current.push(chunk);
        recordingSampleCountRef.current += chunk.length;
        recordingLastSampleAtRef.current = now;
      }
    }
    if (isPaused) return;

    drawOscilloscope(waveformCanvas, timeData, analyser.context.sampleRate, timeWindowMs, verticalGain, autoTrigger, 1);
    drawSpectrum(spectrumCanvas, frequencyData);

    if (now - lastMetricUpdateRef.current > 220) {
      lastMetricUpdateRef.current = now;
      const db = rmsToDb(timeData);
      const pitchResult = db <= -55
        ? { frequency: 0, clarity: 0 }
        : activeSourceRef.current === 'generator'
          ? { frequency: frequencyRef.current, clarity: 1 }
          : estimatePitch(timeData, analyser.context.sampleRate);
      const nextMetrics: Metrics = {
        db,
        pitch: pitchResult.frequency,
        note: noteFromFrequency(pitchResult.frequency),
        centroid: calculateCentroid(frequencyData, analyser.context.sampleRate, analyser.fftSize),
        clarity: pitchResult.clarity,
      };
      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
    }
  }, [autoTrigger, isPaused, timeWindowMs, verticalGain]);

  useEffect(() => {
    if (!activeSource) {
      drawIdle();
      return undefined;
    }
    const animate = () => {
      drawLive();
      animationRef.current = window.requestAnimationFrame(animate);
    };
    animationRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [activeSource, drawIdle, drawLive]);

  const drawRecordedClips = useCallback(() => {
    if (clipARef.current) {
      drawOscilloscope(clipARef.current, clipA?.samples ?? null, clipA?.sampleRate ?? 48000, timeWindowMs, verticalGain, autoTrigger, reviewPosition / 100, '#78eebe');
    }
    if (clipBRef.current) {
      drawOscilloscope(clipBRef.current, clipB?.samples ?? null, clipB?.sampleRate ?? 48000, timeWindowMs, verticalGain, autoTrigger, reviewPosition / 100, '#f0b56f');
    }
  }, [autoTrigger, clipA, clipB, reviewPosition, timeWindowMs, verticalGain]);

  useEffect(() => {
    drawRecordedClips();
    const handleResize = () => {
      if (!activeSourceRef.current) drawIdle();
      drawRecordedClips();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawIdle, drawRecordedClips]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      startGenerationRef.current += 1;
      startingSourceRef.current = null;
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      if (recordingProgressTimerRef.current !== null) window.clearInterval(recordingProgressTimerRef.current);
      try {
        microphoneNodeRef.current?.disconnect();
        oscillatorRef.current?.stop();
        oscillatorRef.current?.disconnect();
        toneGainRef.current?.disconnect();
      } catch {
        // Ignore teardown races while the page is closing.
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, []);

  const captureLiveObservation = useCallback(() => {
    const source = activeSourceRef.current;
    if (!source || isPaused || !captureEnabled || !onCaptureObservation) return;

    const currentMetrics = metricsRef.current;
    const generatorIsSilent = source === 'generator' && loudnessRef.current === 0;
    const measuredPitch = source === 'generator'
      ? generatorIsSilent ? null : frequencyRef.current
      : Number.isFinite(currentMetrics.pitch) && currentMetrics.pitch > 0
        ? currentMetrics.pitch
        : null;

    onCaptureObservation({
      source,
      capturedAt: Date.now(),
      pitchHz: measuredPitch,
      dbfs: Number.isFinite(currentMetrics.db) ? currentMetrics.db : null,
      clarity: measuredPitch === null
        ? 0
        : source === 'generator'
          ? 1
          : Math.min(1, Math.max(0, currentMetrics.clarity)),
      centroidHz: Number.isFinite(currentMetrics.centroid)
        ? Math.max(0, currentMetrics.centroid)
        : 0,
      timeWindowMs,
      verticalGain,
      generator: source === 'generator'
        ? {
            frequencyHz: frequencyRef.current,
            loudness: loudnessRef.current,
            waveform: waveformTypeRef.current,
          }
        : undefined,
    });
  }, [captureEnabled, isPaused, onCaptureObservation, timeWindowMs, verticalGain]);

  const captureClipObservation = useCallback((clip: RecordedClip, slot: RecordingSlot) => {
    if (!captureEnabled || !onCaptureObservation) return;

    const generatorIsSilent = clip.source === 'generator' && clip.generator?.loudness === 0;
    const measuredPitch = generatorIsSilent
      ? null
      : Number.isFinite(clip.metrics.pitch) && clip.metrics.pitch > 0
        ? clip.metrics.pitch
        : null;

    onCaptureObservation({
      source: clip.source,
      capturedAt: clip.capturedAtMs,
      pitchHz: measuredPitch,
      dbfs: Number.isFinite(clip.metrics.db) ? clip.metrics.db : null,
      clarity: measuredPitch === null
        ? 0
        : Math.min(1, Math.max(0, clip.metrics.clarity)),
      centroidHz: Number.isFinite(clip.metrics.centroid)
        ? Math.max(0, clip.metrics.centroid)
        : 0,
      timeWindowMs,
      verticalGain,
      generator: clip.generator,
      clipSlot: slot,
    });
  }, [captureEnabled, onCaptureObservation, timeWindowMs, verticalGain]);

  const isActive = activeSource !== null;
  const recordingControlsLocked = recordingSlot !== null;
  const frozenViewLocked = isActive && isPaused;
  const updateGeneratorFrequency = (next: number) => {
    if (recordingMetaRef.current || !Number.isFinite(next)) return;
    setFrequency(Math.min(2000, Math.max(50, Math.round(next))));
  };
  const updateGeneratorLoudness = (next: number) => {
    if (recordingMetaRef.current || !Number.isFinite(next)) return;
    setLoudness(Math.min(100, Math.max(0, Math.round(next))));
  };
  const updateGeneratorWaveform = (next: TeachingWaveform) => {
    if (recordingMetaRef.current) return;
    setWaveformType(next);
  };
  const loudnessLabel = metrics.db > -12 ? '较响' : metrics.db > -28 ? '适中' : metrics.db > -48 ? '轻柔' : '安静';
  const timbreLabel = metrics.centroid > 3000 ? '明亮' : metrics.centroid > 1400 ? '均衡' : metrics.centroid > 0 ? '柔和' : '待测';
  const activeLabel = startingSource === 'microphone'
    ? '正在请求麦克风权限'
    : startingSource === 'generator'
      ? '正在启动声音发生器'
      : activeSource === 'microphone'
        ? '麦克风采集中'
        : activeSource === 'generator'
          ? '信号正在播放'
          : '示波器待机';

  return (
    <main className="sound-scope" id="sound-scope-main">
      <header className="ss-intro">
        <div>
          <p className="ss-kicker">ACOUSTICS · DIGITAL OSCILLOSCOPE</p>
          <h1>声音示波实验台</h1>
          <p>采集真实声音，或精确控制频率、数字响度与音色；用稳定触发的同一标尺观察和比较。</p>
        </div>
        <div className="ss-privacy">
          <ShieldCheck />
          <span><strong>仅本机即时处理</strong>不上传、不持久保存原始音频</span>
        </div>
      </header>

      <section className="ss-source-bar" aria-label="信号源选择">
        <div className="ss-source-tabs">
          <button type="button" className={inputMode === 'microphone' ? 'is-active' : ''} disabled={recordingControlsLocked} onClick={() => chooseInputMode('microphone')} aria-pressed={inputMode === 'microphone'}>
            <Mic />麦克风采集
          </button>
          <button type="button" className={inputMode === 'generator' ? 'is-active' : ''} disabled={recordingControlsLocked} onClick={() => chooseInputMode('generator')} aria-pressed={inputMode === 'generator'}>
            <AudioLines />声音发生器
          </button>
        </div>
        <div className={`ss-live-state ${isActive ? 'is-live' : ''}`}>
          <i /><span>{isPaused && isActive ? '画面已冻结（声音继续）' : activeLabel}</span>
        </div>
      </section>

      {error && <div className="ss-error" role="alert">{error}</div>}

      <section className="ss-workbench">
        <article className="ss-panel ss-main-scope">
          <div className="ss-panel-head">
            <div>
              <span><Waves />实时通道 CH1</span>
              <h2>{inputMode === 'microphone' ? '麦克风时域波形' : '数字信号时域波形'}</h2>
            </div>
            <div className="ss-trigger-state">
              <button type="button" className={autoTrigger ? 'is-on' : ''} aria-pressed={autoTrigger} onClick={() => setAutoTrigger((current) => !current)}>
                <Activity />自动触发 {autoTrigger ? '开' : '关'}
              </button>
              {isActive && (
                <Button variant="outline" size="sm" onClick={() => setIsPaused((current) => !current)}>
                  {isPaused ? <Play /> : <Pause />}{isPaused ? '继续画面' : '冻结画面'}
                </Button>
              )}
              {isActive && onCaptureObservation && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!captureEnabled || frozenViewLocked}
                  onClick={captureLiveObservation}
                  title={frozenViewLocked ? '请先继续实时画面，再加入探究证据。' : captureDescription}
                >
                  <Activity />{captureButtonLabel}
                </Button>
              )}
            </div>
          </div>

          <div className="ss-live-canvas">
            <canvas ref={waveformRef} aria-label="实时声音示波器波形" />
            <ScopeLabels timeWindowMs={timeWindowMs} gain={verticalGain} />
            {!isActive && (
              <div className="ss-canvas-message">
                {inputMode === 'microphone' ? <Mic /> : <Play />}
                {inputMode === 'microphone' ? '启动采集后对着麦克风发声' : '点击播放，在相同示波器中观察合成波'}
              </div>
            )}
            {isPaused && isActive && <div className="ss-hold-badge">HOLD · 画面冻结</div>}
          </div>

          <div className="ss-scope-controls">
            <label className="ss-select-control">
              <span>时基（全屏）</span>
              <select disabled={frozenViewLocked} value={timeWindowMs} onChange={(event) => setTimeWindowMs(Number(event.target.value))}>
                {TIMEBASE_OPTIONS.map((option) => <option key={option} value={option}>{option} ms · {(option / 10).toFixed(1)} ms/格</option>)}
              </select>
            </label>
            <label className="ss-slider-control">
              <span>纵向增益 <output>{verticalGain.toFixed(2)}×</output></span>
              <Slider disabled={frozenViewLocked} min={0.5} max={5} step={0.25} value={[verticalGain]} onValueChange={(value) => setVerticalGain(sliderValue(value, verticalGain))} aria-label="示波器纵向增益" />
            </label>
          </div>
          {onCaptureObservation && <p className="ss-control-copy">{captureDescription}</p>}
        </article>

        <aside className="ss-panel ss-control-panel">
          {inputMode === 'microphone' ? (
            <>
              <div className="ss-control-title"><span><Mic /></span><div><small>REAL INPUT</small><h2>真实声音采集</h2></div></div>
              <p className="ss-control-copy">关闭浏览器降噪、回声消除和自动增益，尽量保留麦克风原始波形特征。</p>
              {!isActive ? (
                <Button className="ss-primary-button" size="lg" disabled={startingSource !== null} onClick={() => void startMicrophone()}>
                  {startingSource === 'microphone' ? <Activity /> : <Mic />}
                  {startingSource === 'microphone' ? '正在请求麦克风…' : '允许并开始采集'}
                </Button>
              ) : (
                <Button variant="destructive" size="lg" onClick={stopMicrophone}><Square />停止麦克风</Button>
              )}
              <div className="ss-teaching-tip"><CircleGauge /><span><strong>自动触发正在寻找上升过零点</strong>持续元音、口哨或音叉的波形会比说话更稳定。</span></div>
            </>
          ) : (
            <>
              <div className="ss-control-title"><span><AudioLines /></span><div><small>SIGNAL GENERATOR</small><h2>数字声音发生器</h2></div></div>

              <label className="ss-generator-control">
                <span>频率 <output>{frequency} Hz · {noteFromFrequency(frequency)}</output></span>
                <div className="ss-range-with-number">
                  <Slider disabled={recordingControlsLocked} min={50} max={2000} step={1} value={[frequency]} onValueChange={(value) => updateGeneratorFrequency(sliderValue(value, frequency))} aria-label="声音频率" />
                  <input type="number" min={50} max={2000} disabled={recordingControlsLocked} value={frequency} onChange={(event) => updateGeneratorFrequency(Number(event.target.value))} aria-label="声音频率数值" />
                </div>
                <small>50 Hz 低沉　　　　　　　　　2000 Hz 尖细</small>
              </label>

              <label className="ss-generator-control">
                <span>数字响度 <output>{loudness} / 100</output></span>
                <div className="ss-range-with-number">
                  <Slider disabled={recordingControlsLocked} min={0} max={100} step={1} value={[loudness]} onValueChange={(value) => updateGeneratorLoudness(sliderValue(value, loudness))} aria-label="数字响度" />
                  <input type="number" min={0} max={100} disabled={recordingControlsLocked} value={loudness} onChange={(event) => updateGeneratorLoudness(Number(event.target.value))} aria-label="数字响度数值" />
                </div>
                <small>建议先保持在 40 以下，逐步调节</small>
              </label>

              <fieldset className="ss-waveform-picker" disabled={recordingControlsLocked}>
                <legend>音色（波形）</legend>
                <div>
                  {(Object.keys(WAVEFORM_LABELS) as TeachingWaveform[]).map((type) => (
                    <button type="button" key={type} disabled={recordingControlsLocked} className={waveformType === type ? 'is-active' : ''} onClick={() => updateGeneratorWaveform(type)} aria-pressed={waveformType === type}>
                      <span className={`ss-wave-icon ss-wave-${type}`} />{WAVEFORM_LABELS[type]}
                    </button>
                  ))}
                </div>
              </fieldset>

              {activeSource !== 'generator' ? (
                <Button className="ss-primary-button" size="lg" disabled={startingSource !== null} onClick={() => void startGenerator()}>
                  {startingSource === 'generator' ? <Activity /> : <Play />}
                  {startingSource === 'generator' ? '正在启动声音…' : '播放并观察波形'}
                </Button>
              ) : (
                <Button variant="destructive" size="lg" onClick={stopGenerator}><Square />停止播放</Button>
              )}
            </>
          )}

          <div className="ss-recorder">
            <div className="ss-recorder-head"><div><Timer /><span><strong>A/B 波形录制</strong><small>每段约 {RECORDING_SECONDS} 秒</small></span></div><span>内存暂存</span></div>
            <div className="ss-record-buttons">
              {(['A', 'B'] as RecordingSlot[]).map((slot) => (
                <button type="button" key={slot} className={`ss-record-${slot.toLowerCase()} ${recordingSlot === slot ? 'is-recording' : ''}`} disabled={!isActive || recordingSlot !== null} onClick={() => startRecording(slot)}>
                  <i />{recordingSlot === slot ? `录制 ${slot}… ${Math.round(recordingProgress)}%` : `${(slot === 'A' ? clipA : clipB) ? '重录' : '录制'}片段 ${slot}`}
                </button>
              ))}
            </div>
            {recordingSlot && (
              <>
                <output><strong>录制中参数已锁定</strong>；如需结束当前片段，停止按钮仍可使用。</output>
                <progress
                  className="sr-only"
                  aria-label={`片段${recordingSlot}录制进度`}
                  max={100}
                  value={Math.round(recordingProgress)}
                >
                  {Math.round(recordingProgress)}%
                </progress>
                <div className="ss-record-progress" aria-hidden="true">
                  <i style={{ width: `${recordingProgress}%` }} />
                </div>
              </>
            )}
            <p>只截取波形样本用于本页比较；不会生成文件、写入数据库或发送到网络。</p>
          </div>
        </aside>
      </section>

      <section className="ss-metrics" aria-label="当前声音测量值">
        <MetricCard icon={<Volume2 />} label={activeSource === 'generator' ? '数字响度' : '相对响度'} value={activeSource === 'generator' ? `${loudness}` : isActive ? metrics.db.toFixed(1) : '—'} unit={activeSource === 'generator' ? '/ 100' : 'dBFS'} description={activeSource === 'generator' ? '控制振幅；数值越大，波幅越大' : isActive ? loudnessLabel : '反映振幅大小'} />
        <MetricCard icon={<Music2 />} label="音调 / 基频" value={isActive && metrics.pitch ? metrics.pitch.toFixed(0) : '—'} unit="Hz" description={isActive && metrics.pitch ? `${metrics.note} · ${activeSource === 'generator' ? '设定值' : `清晰度 ${Math.round(metrics.clarity * 100)}%`}` : '频率越高，波形越密'} />
        <MetricCard icon={<Ear />} label="音色" value={activeSource === 'generator' ? WAVEFORM_LABELS[waveformType] : timbreLabel} unit="" description={activeSource === 'generator' ? '波形改变会带来不同泛音结构' : '由频谱重心辅助判断'} />
      </section>

      <article className="ss-panel ss-spectrum-panel">
        <div className="ss-panel-head"><div><span><AudioLines />频域 FFT</span><h2>实时音色频谱</h2></div><p>柱形表示各频段能量；非正弦波会出现更多倍频成分。</p></div>
        <div className="ss-spectrum-canvas"><canvas ref={spectrumRef} aria-label="实时声音频谱" /><div><span>0 Hz</span><span>500 Hz</span><span>2 kHz</span><span>5 kHz</span><span>10 kHz+</span></div></div>
      </article>

      <section className="ss-compare" aria-labelledby="ss-compare-title">
        <div className="ss-compare-head">
          <div><p className="ss-kicker">BEFORE / AFTER · SAME SCALE</p><h2 id="ss-compare-title">前后两段波形对比</h2><p>A、B 使用与实时通道相同的自动触发、时基和纵向增益，可直接比较振幅、疏密与轮廓。</p></div>
          {(clipA || clipB) && <button type="button" className="ss-clear-all" onClick={() => { setClipA(null); setClipB(null); }}><Trash2 />清空两段</button>}
        </div>

        <div className="ss-review-position">
          <span>共同观察位置 <output>{((reviewPosition / 100) * RECORDING_SECONDS).toFixed(1)} s</output></span>
          <Slider min={0} max={100} step={1} value={[reviewPosition]} onValueChange={(value) => setReviewPosition(sliderValue(value, reviewPosition))} aria-label="A/B片段共同观察位置" />
          <small>移动后，两段会同时在附近寻找上升过零点并锁定</small>
        </div>

        <div className="ss-clip-grid">
          <ClipScope
            slot="A"
            clip={clipA}
            canvasRef={clipARef}
            timeWindowMs={timeWindowMs}
            verticalGain={verticalGain}
            onClear={() => setClipA(null)}
            onCapture={clipA ? () => captureClipObservation(clipA, 'A') : undefined}
            captureEnabled={captureEnabled}
          />
          <ClipScope
            slot="B"
            clip={clipB}
            canvasRef={clipBRef}
            timeWindowMs={timeWindowMs}
            verticalGain={verticalGain}
            onClear={() => setClipB(null)}
            onCapture={clipB ? () => captureClipObservation(clipB, 'B') : undefined}
            captureEnabled={captureEnabled}
          />
        </div>
      </section>

      <div className="ss-footer">
        <span><ShieldCheck />原始音频和波形样本均不离开此浏览器页面；刷新或关闭页面后自动清除。</span>
        <span><Volume2 />数字响度不是声压级；使用扬声器或耳机时都请从低响度开始。</span>
      </div>
    </main>
  );
}
