import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimatePitch,
  findTriggeredStart,
  gainFromLoudness,
  noteFromFrequency,
  resolveAudiblePitch,
  rmsToDb,
} from '../app/sound-physics.ts';

function sineWave(frequency, amplitude = 0.5, sampleRate = 48_000, length = 4096) {
  return Float32Array.from(
    { length },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
}

test('音高识别可区分教学常用的 220、440、880 Hz', () => {
  for (const expected of [220, 440, 880]) {
    const result = estimatePitch(sineWave(expected), 48_000);
    assert.ok(Math.abs(result.frequency - expected) < expected * 0.02);
    assert.ok(result.clarity > 0.9);
  }
});

test('振幅翻倍时响度指标增加约 6.02 dB', () => {
  const quiet = rmsToDb(sineWave(440, 0.1));
  const loud = rmsToDb(sineWave(440, 0.2));
  assert.ok(Math.abs(loud - quiet - 6.0206) < 0.02);
});

test('频率可映射到规范音名', () => {
  assert.equal(noteFromFrequency(440), 'A4');
  assert.equal(noteFromFrequency(261.63), 'C4');
  assert.equal(noteFromFrequency(0), '—');
});

test('数字响度 0 是静音，且输出增益被限制在安全范围', () => {
  assert.equal(gainFromLoudness(0), 0);
  assert.equal(gainFromLoudness(-20), 0);
  assert.equal(gainFromLoudness(100), 0.22);
  assert.equal(gainFromLoudness(150), 0.22);
  assert.equal(resolveAudiblePitch(0, 440, -60), 0);
  assert.equal(resolveAudiblePitch(440, 440, -55), 0);
  assert.equal(resolveAudiblePitch(0, 440, -30), 440);
});

test('自动触发将波形窗口稳定到上升过零点附近', () => {
  const samples = sineWave(200, 0.8, 4_000, 2_000);
  const start = findTriggeredStart(samples, 400, true, 0.5);
  assert.ok(samples[start] >= 0);
  assert.ok(samples[Math.max(0, start - 1)] <= samples[start]);
});
