export type PitchEstimate = {
  frequency: number;
  clarity: number;
};

export function gainFromLoudness(loudness: number) {
  const normalized = Math.min(100, Math.max(0, Number.isFinite(loudness) ? loudness : 0));
  return (normalized / 100) * 0.22;
}

export function resolveAudiblePitch(
  detectedFrequency: number,
  fallbackFrequency: number,
  db: number,
  silenceThreshold = -55,
) {
  if (!Number.isFinite(db) || db <= silenceThreshold) return 0;
  if (Number.isFinite(detectedFrequency) && detectedFrequency > 0) return detectedFrequency;
  return Number.isFinite(fallbackFrequency) && fallbackFrequency > 0 ? fallbackFrequency : 0;
}

export function noteFromFrequency(frequency: number) {
  if (!Number.isFinite(frequency) || frequency <= 0) return '—';
  const notes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const octave = Math.floor(midi / 12) - 1;
  return `${notes[((midi % 12) + 12) % 12]}${octave}`;
}

export function rmsToDb(buffer: Float32Array) {
  let squareSum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    squareSum += buffer[index] * buffer[index];
  }
  const rms = Math.sqrt(squareSum / Math.max(1, buffer.length));
  return rms > 0 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
}

export function estimatePitch(buffer: Float32Array, sampleRate: number): PitchEstimate {
  const windowLength = Math.min(4096, buffer.length);
  if (windowLength < 4 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { frequency: 0, clarity: 0 };
  }

  const offset = Math.max(0, buffer.length - windowLength);
  let mean = 0;
  let squareSum = 0;

  for (let index = 0; index < windowLength; index += 1) {
    mean += buffer[offset + index];
  }
  mean /= windowLength;

  for (let index = 0; index < windowLength; index += 1) {
    const sample = buffer[offset + index] - mean;
    squareSum += sample * sample;
  }
  const rms = Math.sqrt(squareSum / windowLength);
  if (rms < 0.006) return { frequency: 0, clarity: 0 };

  const minLag = Math.max(2, Math.floor(sampleRate / 2000));
  const maxLag = Math.min(Math.floor(sampleRate / 50), windowLength - 2);
  let bestLag = -1;
  let bestCorrelation = 0;
  const correlations = new Float64Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let normA = 0;
    let normB = 0;
    const limit = windowLength - lag;
    for (let index = 0; index < limit; index += 1) {
      const first = buffer[offset + index] - mean;
      const second = buffer[offset + index + lag] - mean;
      correlation += first * second;
      normA += first * first;
      normB += second * second;
    }
    correlation /= Math.sqrt(normA * normB) || 1;
    correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < 0.5) {
    return { frequency: 0, clarity: bestCorrelation };
  }

  // A global maximum often lands on an integer multiple of the true period.
  // The earliest strong local peak identifies the fundamental instead of a
  // convincing-looking subharmonic (for example, 880 Hz being read as 80 Hz).
  const strongPeak = Math.max(0.72, bestCorrelation * 0.9);
  let fundamentalLag = bestLag;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const previous = lag === minLag ? -1 : correlations[lag - 1];
    const next = lag === maxLag ? -1 : correlations[lag + 1];
    if (correlations[lag] >= strongPeak && correlations[lag] >= previous && correlations[lag] > next) {
      fundamentalLag = lag;
      break;
    }
  }

  const left = correlations[Math.max(minLag, fundamentalLag - 1)];
  const center = correlations[fundamentalLag];
  const right = correlations[Math.min(maxLag, fundamentalLag + 1)];
  const denominator = left - 2 * center + right;
  const correction = Math.abs(denominator) > 1e-9 ? 0.5 * (left - right) / denominator : 0;
  const refinedLag = fundamentalLag + Math.max(-0.5, Math.min(0.5, correction));

  return { frequency: sampleRate / refinedLag, clarity: center };
}

export function findTriggeredStart(
  data: Float32Array,
  visibleSamples: number,
  autoTrigger: boolean,
  anchorRatio: number,
) {
  const maxStart = Math.max(0, data.length - visibleSamples - 1);
  const desiredStart = Math.round(maxStart * Math.min(1, Math.max(0, anchorRatio)));
  if (!autoTrigger || maxStart === 0) return desiredStart;

  const searchRadius = Math.max(visibleSamples, 256);
  const searchStart = Math.max(1, desiredStart - searchRadius);
  const searchEnd = Math.min(maxStart, desiredStart + searchRadius);
  let mean = 0;
  let peak = 0;
  const analysisEnd = Math.min(data.length, searchEnd + visibleSamples);
  for (let index = searchStart; index < analysisEnd; index += 1) {
    mean += data[index];
    peak = Math.max(peak, Math.abs(data[index]));
  }
  mean /= Math.max(1, analysisEnd - searchStart);

  const hysteresis = Math.max(0.0008, peak * 0.035);
  let armed = false;
  let bestStart = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = searchStart; index <= searchEnd; index += 1) {
    if (data[index] <= mean - hysteresis) armed = true;
    if (armed && data[index] >= mean + hysteresis) {
      const distance = Math.abs(index - desiredStart);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStart = index;
      }
      armed = false;
    }
  }

  return bestStart >= 0 ? Math.min(bestStart, maxStart) : desiredStart;
}
