export type ExperimentId = 'ohm' | 'lens' | 'sound';
export type AutomationMode = 'observe' | 'low' | 'guide';
export type InquiryPhase =
  | 'prediction'
  | 'plan'
  | 'experiment'
  | 'conclusion'
  | 'diagnosis'
  | 'verification'
  | 'complete';

export type EventType =
  | 'session_started'
  | 'prediction_submitted'
  | 'plan_submitted'
  | 'parameter_changed'
  | 'evidence_recorded'
  | 'evidence_removed'
  | 'collection_completed'
  | 'claim_submitted'
  | 'diagnosis_emitted'
  | 'intervention_delivered'
  | 'intervention_accepted'
  | 'verification_started'
  | 'verification_completed'
  | 'verification_retry_started'
  | 'teacher_overridden';

export type EventValue = string | number | boolean | null | string[] | number[];

export type InquiryEvent = {
  id: string;
  sessionId: string;
  experimentId: ExperimentId;
  taskVersion: string;
  phase: InquiryPhase;
  type: EventType;
  timestamp: number;
  payload: Record<string, EventValue>;
};

export type Measurement = {
  id: string;
  timestamp: number;
  values: Record<string, string | number | null>;
};

export type SoundObservationInput = {
  source: 'microphone' | 'generator';
  capturedAt: number;
  pitchHz: number | null;
  dbfs: number | null;
  clarity: number;
  centroidHz: number;
  timeWindowMs: number;
  verticalGain: number;
  clipSlot: 'A' | 'B' | null;
  generator: {
    frequencyHz: number;
    loudness: number;
    waveformCode: number;
  } | null;
};

export type EvidenceDirection = 'support' | 'counter' | 'context';

export type Evidence = {
  id: string;
  constructCode: string;
  label: string;
  detail: string;
  direction: EvidenceDirection;
  reliability: 'high' | 'medium' | 'low';
  eventRefs: string[];
};

export type DiagnosisStatus = 'supported' | 'possible' | 'insufficient' | 'resolved';

export type Diagnosis = {
  id: string;
  code: string;
  kind: 'misconception' | 'inquiry';
  label: string;
  status: DiagnosisStatus;
  confidence: number;
  summary: string;
  evidenceRefs: string[];
  counterEvidenceRefs: string[];
};

export type Intervention = {
  id: string;
  diagnosisCode: string;
  level: 1 | 2;
  prompt: string;
  createdAt: number;
  acceptedAt: number | null;
  closedAt: number | null;
};

export type VerificationResult = {
  completedAt: number;
  passed: boolean;
  answerChoice: string;
  numericAnswer: number | null;
  explanation: string;
  expected: string;
  feedback: string;
};

export type TeacherOverride = {
  diagnosisId?: string;
  diagnosisCode: string;
  verdict: 'confirm' | 'reject' | 'insufficient';
  note: string;
  timestamp: number;
};

export type InquiryPlan = {
  independent: string;
  dependent: string;
  control: string;
};

export type InquirySession = {
  id: string;
  studentAlias: string;
  experimentId: ExperimentId;
  taskVersion: string;
  automationMode: AutomationMode;
  phase: InquiryPhase;
  startedAt: number;
  updatedAt: number;
  predictionChoice: string;
  predictionReason: string;
  plan: InquiryPlan;
  parameters: Record<string, number>;
  measurements: Measurement[];
  conclusionChoice: string;
  conclusionText: string;
  conclusionConfidence: number;
  conclusionEvidenceIds: string[];
  events: InquiryEvent[];
  evidence: Evidence[];
  diagnoses: Diagnosis[];
  interventions: Intervention[];
  verification: VerificationResult | null;
  teacherOverrides: TeacherOverride[];
  dataOrigin: 'local' | 'demo';
};

export type ClassPolicy = {
  automationMode: AutomationMode;
  maxHintsPerSession: 1 | 2;
};

export type TransitionResult = {
  ok: boolean;
  session: InquirySession;
  message: string;
};

export type ClassSummary = {
  total: number;
  active: number;
  needsAttention: number;
  verified: number;
  verificationRate: number;
  interventions: number;
  diagnosisCounts: Array<{ code: string; label: string; count: number }>;
};

export const EXPERIMENTS = {
  ohm: {
    id: 'ohm' as const,
    shortLabel: '电学',
    title: '欧姆定律探究',
    question: '电阻一定时，通过导体的电流与两端电压有什么关系？',
    taskVersion: 'ohm-v1.0',
    variables: [
      { value: 'voltage', label: '电压 U' },
      { value: 'current', label: '电流 I' },
      { value: 'resistance', label: '电阻 R' },
    ],
    predictionOptions: [
      { value: 'direct', label: '电压增大，电流按相同比例增大' },
      { value: 'same', label: '电压改变，电流保持不变' },
      { value: 'inverse', label: '电压增大，电流反而减小' },
      { value: 'uncertain', label: '暂时不能确定' },
    ],
    conclusionOptions: [
      { value: 'direct', label: '电阻一定时，电流与电压成正比' },
      { value: 'same', label: '电流与电压没有关系' },
      { value: 'inverse', label: '电流与电压成反比' },
      { value: 'insufficient', label: '现有数据还不足以形成结论' },
    ],
  },
  lens: {
    id: 'lens' as const,
    shortLabel: '光学',
    title: '凸透镜成像探究',
    question: '焦距一定时，物体远离凸透镜，像的位置和大小怎样变化？',
    taskVersion: 'lens-v1.0',
    variables: [
      { value: 'objectDistance', label: '物距 u' },
      { value: 'imageDistance', label: '像距 v' },
      { value: 'magnification', label: '放大率 |m|（像的大小）' },
      { value: 'imageNature', label: '像的性质' },
      { value: 'focalLength', label: '焦距 f' },
      { value: 'screenPosition', label: '光屏位置' },
    ],
    predictionOptions: [
      { value: 'farther_smaller', label: '物体远离时，像靠近透镜并变小' },
      { value: 'farther_bigger', label: '物体远离时，像远离透镜并变大' },
      { value: 'screen_controls', label: '像的位置主要由光屏位置决定' },
      { value: 'uncertain', label: '暂时不能确定' },
    ],
    conclusionOptions: [
      { value: 'farther_smaller', label: '物体远离时，实像靠近透镜并变小' },
      { value: 'farther_bigger', label: '物体远离时，像远离透镜并变大' },
      { value: 'screen_controls', label: '移动光屏会改变像本身的位置' },
      { value: 'insufficient', label: '现有数据还不足以形成结论' },
    ],
  },
  sound: {
    id: 'sound' as const,
    shortLabel: '声学',
    title: '频率与音调探究',
    question: '保持波形和数字响度不变时，频率升高，音调怎样变化？',
    taskVersion: 'sound-v1.0',
    variables: [
      { value: 'frequencyHz', label: '频率 f' },
      { value: 'pitchHz', label: '音调（基频）' },
      { value: 'loudness', label: '数字响度' },
      { value: 'waveformCode', label: '波形（音色）' },
      { value: 'loudnessAndWaveform', label: '数字响度与波形（共同控制）' },
    ],
    predictionOptions: [
      { value: 'higher_pitch', label: '频率升高，音调升高' },
      { value: 'same_pitch', label: '频率变化，音调保持不变' },
      { value: 'lower_pitch', label: '频率升高，音调降低' },
      { value: 'loudness_controls_pitch', label: '响度相同，音调就相同' },
      { value: 'uncertain', label: '暂时不能确定' },
    ],
    conclusionOptions: [
      { value: 'higher_pitch', label: '波形和响度不变时，频率越高，音调越高' },
      { value: 'same_pitch', label: '频率变化不会改变音调' },
      { value: 'lower_pitch', label: '频率越高，音调越低' },
      { value: 'loudness_controls_pitch', label: '响度不变，所以音调不变' },
      { value: 'insufficient', label: '现有数据还不足以形成结论' },
    ],
  },
} as const;

let sequence = 0;

function uid(prefix: string, now = Date.now()) {
  sequence += 1;
  return `${prefix}_${now.toString(36)}_${sequence.toString(36)}`;
}

function appendEvent(
  session: InquirySession,
  type: EventType,
  payload: Record<string, EventValue>,
  phase = session.phase,
  now = Date.now(),
) {
  const event: InquiryEvent = {
    id: uid('evt', now),
    sessionId: session.id,
    experimentId: session.experimentId,
    taskVersion: session.taskVersion,
    phase,
    type,
    timestamp: now,
    payload,
  };
  return { ...session, events: [...session.events, event], updatedAt: now };
}

function success(session: InquirySession, message: string): TransitionResult {
  return { ok: true, session, message };
}

function failure(session: InquirySession, message: string): TransitionResult {
  return { ok: false, session, message };
}

export function createSession(
  studentAlias: string,
  experimentId: ExperimentId,
  policy: ClassPolicy,
  now = Date.now(),
): InquirySession {
  const taskVersion = EXPERIMENTS[experimentId].taskVersion;
  const parameters: Record<string, number> = experimentId === 'ohm'
    ? { voltage: 3, resistance: 20 }
    : experimentId === 'lens'
      ? { objectDistance: 30, focalLength: 10, screenPosition: 20 }
      : { frequencyHz: 440, loudness: 50, waveformCode: 0 };
  const base: InquirySession = {
    id: uid('ses', now),
    studentAlias: studentAlias.trim() || '匿名学生',
    experimentId,
    taskVersion,
    automationMode: policy.automationMode,
    phase: 'prediction',
    startedAt: now,
    updatedAt: now,
    predictionChoice: '',
    predictionReason: '',
    plan: { independent: '', dependent: '', control: '' },
    parameters,
    measurements: [],
    conclusionChoice: '',
    conclusionText: '',
    conclusionConfidence: 50,
    conclusionEvidenceIds: [],
    events: [],
    evidence: [],
    diagnoses: [],
    interventions: [],
    verification: null,
    teacherOverrides: [],
    dataOrigin: 'local',
  };
  return appendEvent(base, 'session_started', {
    studentAlias: base.studentAlias,
    automationMode: base.automationMode,
    ...parameters,
  }, 'prediction', now);
}

export function submitPrediction(
  session: InquirySession,
  choice: string,
  reason: string,
  now = Date.now(),
): TransitionResult {
  if (session.phase !== 'prediction') return failure(session, '当前阶段不能重新提交预测。');
  if (!EXPERIMENTS[session.experimentId].predictionOptions.some((option) => option.value === choice)) {
    return failure(session, '请选择当前实验提供的有效预测。');
  }
  if (reason.trim().length < 4) return failure(session, '请用一句话写出预测理由。');
  let next: InquirySession = {
    ...session,
    predictionChoice: choice,
    predictionReason: reason.trim(),
    phase: 'plan' as const,
  };
  next = appendEvent(next, 'prediction_submitted', { choice, reason: reason.trim() }, 'prediction', now);
  return success(next, '预测已作为学习证据记录。');
}

export function submitPlan(
  session: InquirySession,
  plan: InquiryPlan,
  now = Date.now(),
): TransitionResult {
  if (session.phase !== 'plan' && session.phase !== 'experiment') return failure(session, '请先完成预测，或在实验阶段修订计划。');
  if (!plan.independent || !plan.dependent || !plan.control) {
    return failure(session, '请完整选择自变量、因变量和控制变量。');
  }
  const allowedVariables = new Set<string>(EXPERIMENTS[session.experimentId].variables.map((variable) => variable.value));
  if (![plan.independent, plan.dependent, plan.control].every((value) => allowedVariables.has(value))) {
    return failure(session, '实验计划包含当前实验不支持的变量。');
  }
  if (new Set([plan.independent, plan.dependent, plan.control]).size < 3) {
    return failure(session, '三个变量角色不能重复，请重新设计。');
  }
  let next: InquirySession = { ...session, plan: { ...plan }, phase: 'experiment' };
  next = appendEvent(next, 'plan_submitted', {
    independent: plan.independent,
    dependent: plan.dependent,
    control: plan.control,
    revised: session.phase === 'experiment',
  }, 'plan', now);
  return success(next, session.phase === 'experiment' ? '已修订方案并保留原计划；请检查哪些旧记录仍适用于新方案。' : '实验方案已记录，可以开始操作。');
}

export function changeParameter(
  session: InquirySession,
  key: string,
  value: number,
  now = Date.now(),
): InquirySession {
  if (session.phase !== 'experiment') return session;
  const allowedKeys: Record<ExperimentId, ReadonlySet<string>> = {
    ohm: new Set(['voltage', 'resistance']),
    lens: new Set(['objectDistance', 'focalLength', 'screenPosition']),
    sound: new Set(['frequencyHz', 'loudness', 'waveformCode']),
  };
  if (!allowedKeys[session.experimentId].has(key) || !Number.isFinite(value)) return session;
  const before = session.parameters[key] ?? null;
  if (before === value) return session;
  let next = { ...session, parameters: { ...session.parameters, [key]: value } };
  next = appendEvent(next, 'parameter_changed', { key, before, after: value }, session.phase, now);
  return next;
}

export function calculateOhm(parameters: Record<string, number>) {
  const voltage = parameters.voltage ?? 0;
  const resistance = Math.max(0.1, parameters.resistance ?? 20);
  return { voltage, resistance, current: voltage / resistance, power: voltage * voltage / resistance };
}

export function calculateLens(parameters: Record<string, number>) {
  const focalLength = Math.max(1, parameters.focalLength ?? 10);
  const objectDistance = Math.max(1, parameters.objectDistance ?? 30);
  const denominator = objectDistance - focalLength;
  const imageDistance = Math.abs(denominator) < 0.001
    ? null
    : focalLength * objectDistance / denominator;
  const magnification = imageDistance === null ? null : -imageDistance / objectDistance;
  const nature = objectDistance > focalLength
    ? '实像·倒立'
    : objectDistance < focalLength
      ? '虚像·正立'
      : '折射光平行';
  return { focalLength, objectDistance, imageDistance, magnification, nature };
}

export const SOUND_WAVEFORMS = [
  { code: 0, label: '正弦波', nature: '柔和·纯音' },
  { code: 1, label: '三角波', nature: '柔和·含奇次谐波' },
  { code: 2, label: '方波', nature: '明亮·含丰富奇次谐波' },
  { code: 3, label: '锯齿波', nature: '明亮·含丰富谐波' },
] as const;

/**
 * 将声学装置的三个可控参数换算成可记录的物理量。
 * waveformCode 让全局数值参数模型保持向后兼容，waveformLabel/nature 用于教学表征。
 */
export function calculateSound(parameters: Record<string, number>) {
  const requestedFrequency = Number.isFinite(parameters.frequencyHz) ? parameters.frequencyHz : 440;
  const requestedLoudness = Number.isFinite(parameters.loudness) ? parameters.loudness : 50;
  const requestedWaveform = Number.isFinite(parameters.waveformCode) ? parameters.waveformCode : 0;
  const frequencyHz = Math.min(2_000, Math.max(50, requestedFrequency));
  const loudness = Math.min(100, Math.max(0, requestedLoudness));
  const waveformCode = Math.min(SOUND_WAVEFORMS.length - 1, Math.max(0, Math.round(requestedWaveform)));
  const waveform = SOUND_WAVEFORMS[waveformCode];
  return {
    frequencyHz,
    loudness,
    waveformCode,
    pitchHz: loudness > 0 ? frequencyHz : null,
    periodMs: 1000 / frequencyHz,
    amplitude: loudness / 100,
    waveformLabel: waveform.label,
    nature: waveform.nature,
  };
}

export function captureMeasurement(session: InquirySession, now = Date.now()): TransitionResult {
  if (session.phase !== 'experiment') return failure(session, '请先进入实验操作阶段。');
  if (session.experimentId === 'sound' && calculateSound(session.parameters).loudness === 0) {
    return failure(session, '当前为静音，无法观察音调；请把数字响度调到 0 以上再记录。');
  }
  const values: Record<string, string | number | null> = session.experimentId === 'ohm'
    ? calculateOhm(session.parameters)
    : session.experimentId === 'lens'
      ? { ...calculateLens(session.parameters), screenPosition: session.parameters.screenPosition ?? 20 }
      : calculateSound(session.parameters);
  const measurement: Measurement = { id: uid('mea', now), timestamp: now, values };
  let next = { ...session, measurements: [...session.measurements, measurement] };
  next = appendEvent(next, 'evidence_recorded', {
    ...values,
    measurementId: measurement.id,
    measurementIndex: next.measurements.length,
  }, 'experiment', now);
  return success(next, `已记录第 ${next.measurements.length} 组证据。`);
}

/**
 * 将独立声音示波器的实时/录制摘要加入声学探究。这里只保存派生指标，
 * 不接收也不持久化 PCM、MediaStream 或其他可还原原始音频的数据。
 */
export function captureSoundObservation(
  session: InquirySession,
  observation: SoundObservationInput,
  now = Date.now(),
): TransitionResult {
  if (session.experimentId !== 'sound') return failure(session, '示波器快照只能加入声学探究。');
  if (session.phase !== 'experiment') return failure(session, '请先进入声学实验操作阶段。');
  if (!Number.isFinite(observation.capturedAt)
    || !Number.isFinite(observation.clarity)
    || !Number.isFinite(observation.centroidHz)
    || !Number.isFinite(observation.timeWindowMs)
    || !Number.isFinite(observation.verticalGain)
    || (observation.pitchHz !== null && !Number.isFinite(observation.pitchHz))
    || (observation.dbfs !== null && !Number.isFinite(observation.dbfs))) {
    return failure(session, '示波器快照包含无效读数，未加入证据本。');
  }

  let values: Measurement['values'];
  if (observation.source === 'generator') {
    if (!observation.generator) return failure(session, '声音发生器快照缺少控制参数。');
    const calculated = calculateSound(observation.generator);
    if (calculated.loudness === 0) return failure(session, '当前为静音，无法观察音调；请提高数字响度后再记录。');
    values = {
      ...calculated,
      source: 'generator',
      sensorDbfs: observation.dbfs,
      clarity: Math.min(1, Math.max(0, observation.clarity)),
      centroidHz: Math.max(0, observation.centroidHz),
      timeWindowMs: Math.max(1, observation.timeWindowMs),
      verticalGain: Math.max(0.1, observation.verticalGain),
      clipSlot: observation.clipSlot,
      capturedAt: observation.capturedAt,
    };
  } else {
    const pitchHz = observation.pitchHz;
    if (pitchHz === null || pitchHz <= 0) {
      return failure(session, '当前麦克风快照没有识别出稳定音调，请持续发声后再记录。');
    }
    values = {
      source: 'microphone',
      frequencyHz: pitchHz,
      pitchHz,
      periodMs: 1000 / pitchHz,
      loudness: null,
      amplitude: observation.dbfs === null ? null : 10 ** (observation.dbfs / 20),
      waveformCode: null,
      waveformLabel: '麦克风实测',
      nature: '真实声音·控制量未标定',
      sensorDbfs: observation.dbfs,
      clarity: Math.min(1, Math.max(0, observation.clarity)),
      centroidHz: Math.max(0, observation.centroidHz),
      timeWindowMs: Math.max(1, observation.timeWindowMs),
      verticalGain: Math.max(0.1, observation.verticalGain),
      clipSlot: observation.clipSlot,
      capturedAt: observation.capturedAt,
    };
  }

  const measurement: Measurement = { id: uid('mea_sensor', now), timestamp: now, values };
  let next: InquirySession = { ...session, measurements: [...session.measurements, measurement] };
  next = appendEvent(next, 'evidence_recorded', {
    ...values,
    measurementId: measurement.id,
    measurementIndex: next.measurements.length,
    source: observation.source,
    clipSlot: observation.clipSlot,
    capturedAt: observation.capturedAt,
    structuredOnly: true,
  }, 'experiment', now);
  return success(next, observation.source === 'generator'
    ? '已将声音发生器的结构化示波快照加入证据本。'
    : '已将麦克风派生读数加入观察证据；未保存原始音频。');
}

export function removeMeasurement(
  session: InquirySession,
  measurementId: string,
  now = Date.now(),
): InquirySession {
  if (session.phase !== 'experiment') return session;
  const measurements = session.measurements.filter((measurement) => measurement.id !== measurementId);
  if (measurements.length === session.measurements.length) return session;
  return appendEvent(
    { ...session, measurements },
    'evidence_removed',
    { measurementId },
    session.phase,
    now,
  );
}

export function finishCollection(session: InquirySession, now = Date.now()): TransitionResult {
  if (session.phase !== 'experiment') return failure(session, '当前不在实验采集阶段。');
  if (session.measurements.length < 3) {
    return failure(session, '至少记录 3 组数据，才能判断证据是否充分。');
  }
  if (distinct(session.measurements.map((row) => plannedIndependentValue(session, row))) < 3) {
    return failure(session, '请至少记录 3 个不同的自变量取值，重复记录不能替代对照证据。');
  }
  const latestAccepted = [...session.interventions].reverse().find((item) => (
    item.acceptedAt !== null && item.closedAt === null
  ));
  if (latestAccepted && !hasCompletedInterventionProbe(session, latestAccepted)) {
    return failure(session, '请按提示形成可区分的对照，并至少新记录 1 组证据；已删除或无对照的记录不计。');
  }
  let next: InquirySession = { ...session, phase: 'conclusion' };
  next = appendEvent(next, 'collection_completed', {
    measurementCount: session.measurements.length,
  }, 'experiment', now);
  return success(next, '数据采集完成，请根据证据形成结论。');
}

function refsFor(session: InquirySession, types: EventType[]) {
  return session.events.filter((event) => types.includes(event.type)).map((event) => event.id);
}

function distinct(values: Array<string | number | null>) {
  return new Set(values.map((value) => typeof value === 'number' ? value.toFixed(4) : value)).size;
}

function numericValue(measurement: Measurement, key: string) {
  const value = measurement.values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nearlyEqual(left: number, right: number, tolerance = 0.001) {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function independentKeyFor(experimentId: ExperimentId) {
  if (experimentId === 'ohm') return 'voltage';
  if (experimentId === 'lens') return 'objectDistance';
  return 'frequencyHz';
}

function plannedIndependentValue(session: InquirySession, measurement: Measurement) {
  const key = session.plan.independent;
  if (key === 'imageNature') return measurement.values.nature ?? null;
  if (key === 'imageSize') return measurement.values.magnification ?? null;
  if (key === 'loudnessAndWaveform') {
    const loudness = measurement.values.loudness;
    const waveformCode = measurement.values.waveformCode;
    if (typeof loudness !== 'number' || !Number.isFinite(loudness)
      || typeof waveformCode !== 'number' || !Number.isFinite(waveformCode)) {
      return null;
    }
    return `${loudness.toFixed(4)}|${waveformCode.toFixed(4)}`;
  }
  return measurement.values[key] ?? null;
}

function controlKeysFor(experimentId: ExperimentId) {
  if (experimentId === 'ohm') return ['resistance'];
  if (experimentId === 'lens') return ['focalLength'];
  return ['loudness', 'waveformCode'];
}

function controlLabelFor(experimentId: ExperimentId) {
  if (experimentId === 'ohm') return '电阻';
  if (experimentId === 'lens') return '焦距';
  return '数字响度和波形';
}

function hasOhmRelationship(first: Measurement, second: Measurement) {
  const firstVoltage = numericValue(first, 'voltage');
  const secondVoltage = numericValue(second, 'voltage');
  const firstResistance = numericValue(first, 'resistance');
  const secondResistance = numericValue(second, 'resistance');
  const firstCurrent = numericValue(first, 'current');
  const secondCurrent = numericValue(second, 'current');
  if (firstVoltage === null
    || secondVoltage === null
    || firstResistance === null
    || secondResistance === null
    || firstCurrent === null
    || secondCurrent === null
    || !nearlyEqual(firstResistance, secondResistance)
    || nearlyEqual(firstVoltage, secondVoltage)) {
    return false;
  }
  return (secondVoltage - firstVoltage) * (secondCurrent - firstCurrent) > 0
    && nearlyEqual(firstCurrent * firstResistance, firstVoltage)
    && nearlyEqual(secondCurrent * secondResistance, secondVoltage);
}

function hasLensRelationship(first: Measurement, second: Measurement) {
  const firstObjectDistance = numericValue(first, 'objectDistance');
  const secondObjectDistance = numericValue(second, 'objectDistance');
  const firstFocalLength = numericValue(first, 'focalLength');
  const secondFocalLength = numericValue(second, 'focalLength');
  const firstImageDistance = numericValue(first, 'imageDistance');
  const secondImageDistance = numericValue(second, 'imageDistance');
  const firstMagnification = numericValue(first, 'magnification');
  const secondMagnification = numericValue(second, 'magnification');
  if (firstObjectDistance === null
    || secondObjectDistance === null
    || firstFocalLength === null
    || secondFocalLength === null
    || firstImageDistance === null
    || secondImageDistance === null
    || firstMagnification === null
    || secondMagnification === null
    || firstImageDistance <= 0
    || secondImageDistance <= 0
    || !nearlyEqual(firstFocalLength, secondFocalLength)
    || nearlyEqual(firstObjectDistance, secondObjectDistance)) {
    return false;
  }
  const objectDelta = secondObjectDistance - firstObjectDistance;
  return objectDelta * (secondImageDistance - firstImageDistance) < 0
    && objectDelta * (Math.abs(secondMagnification) - Math.abs(firstMagnification)) < 0;
}

function hasSoundRelationship(first: Measurement, second: Measurement) {
  const firstFrequency = numericValue(first, 'frequencyHz');
  const secondFrequency = numericValue(second, 'frequencyHz');
  const firstPitch = numericValue(first, 'pitchHz');
  const secondPitch = numericValue(second, 'pitchHz');
  const firstLoudness = numericValue(first, 'loudness');
  const secondLoudness = numericValue(second, 'loudness');
  const firstWaveform = numericValue(first, 'waveformCode');
  const secondWaveform = numericValue(second, 'waveformCode');
  if (firstFrequency === null
    || secondFrequency === null
    || firstPitch === null
    || secondPitch === null
    || firstLoudness === null
    || secondLoudness === null
    || firstWaveform === null
    || secondWaveform === null
    || !nearlyEqual(firstLoudness, secondLoudness)
    || !nearlyEqual(firstWaveform, secondWaveform)
    || nearlyEqual(firstFrequency, secondFrequency)) {
    return false;
  }
  return (secondFrequency - firstFrequency) * (secondPitch - firstPitch) > 0
    && nearlyEqual(firstPitch, firstFrequency, 0.01)
    && nearlyEqual(secondPitch, secondFrequency, 0.01);
}

function hasSoundLoudnessProbe(first: Measurement, second: Measurement) {
  const firstFrequency = numericValue(first, 'frequencyHz');
  const secondFrequency = numericValue(second, 'frequencyHz');
  const firstPitch = numericValue(first, 'pitchHz');
  const secondPitch = numericValue(second, 'pitchHz');
  const firstLoudness = numericValue(first, 'loudness');
  const secondLoudness = numericValue(second, 'loudness');
  const firstAmplitude = numericValue(first, 'amplitude');
  const secondAmplitude = numericValue(second, 'amplitude');
  const firstWaveform = numericValue(first, 'waveformCode');
  const secondWaveform = numericValue(second, 'waveformCode');
  if (firstFrequency === null
    || secondFrequency === null
    || firstPitch === null
    || secondPitch === null
    || firstLoudness === null
    || secondLoudness === null
    || firstAmplitude === null
    || secondAmplitude === null
    || firstWaveform === null
    || secondWaveform === null
    || !nearlyEqual(firstFrequency, secondFrequency)
    || !nearlyEqual(firstWaveform, secondWaveform)
    || nearlyEqual(firstLoudness, secondLoudness)) {
    return false;
  }
  return nearlyEqual(firstPitch, secondPitch, 0.01)
    && (secondLoudness - firstLoudness) * (secondAmplitude - firstAmplitude) > 0;
}

function discriminatingComparisonForProbe(
  session: InquirySession,
  diagnosisCode: string,
  probe: Measurement,
) {
  return session.measurements.find((comparison) => {
    if (comparison.id === probe.id) return false;
    if (diagnosisCode === 'M01_OHM_CURRENT_CONSTANT') {
      return session.experimentId === 'ohm' && hasOhmRelationship(comparison, probe);
    }
    if (diagnosisCode === 'M02_LENS_SCREEN_POSITION') {
      if (session.experimentId !== 'lens') return false;
      const firstObjectDistance = numericValue(comparison, 'objectDistance');
      const secondObjectDistance = numericValue(probe, 'objectDistance');
      const firstFocalLength = numericValue(comparison, 'focalLength');
      const secondFocalLength = numericValue(probe, 'focalLength');
      const firstImageDistance = numericValue(comparison, 'imageDistance');
      const secondImageDistance = numericValue(probe, 'imageDistance');
      const firstScreenPosition = numericValue(comparison, 'screenPosition');
      const secondScreenPosition = numericValue(probe, 'screenPosition');
      return firstObjectDistance !== null
        && secondObjectDistance !== null
        && firstFocalLength !== null
        && secondFocalLength !== null
        && firstImageDistance !== null
        && secondImageDistance !== null
        && firstScreenPosition !== null
        && secondScreenPosition !== null
        && nearlyEqual(firstObjectDistance, secondObjectDistance)
        && nearlyEqual(firstFocalLength, secondFocalLength)
        && nearlyEqual(firstImageDistance, secondImageDistance)
        && !nearlyEqual(firstScreenPosition, secondScreenPosition);
    }
    if (diagnosisCode === 'M03_LENS_DISTANCE_RELATION') {
      return session.experimentId === 'lens' && hasLensRelationship(comparison, probe);
    }
    if (diagnosisCode === 'M04_SOUND_LOUDNESS_PITCH') {
      return session.experimentId === 'sound' && hasSoundLoudnessProbe(comparison, probe);
    }
    if (diagnosisCode === 'M05_SOUND_FREQUENCY_PITCH_RELATION') {
      return session.experimentId === 'sound' && hasSoundRelationship(comparison, probe);
    }
    if (diagnosisCode === 'P01_CONTROL_VARIABLE') {
      const independentKey = independentKeyFor(session.experimentId);
      const controlKeys = controlKeysFor(session.experimentId);
      const firstIndependent = numericValue(comparison, independentKey);
      const secondIndependent = numericValue(probe, independentKey);
      const controlsStable = controlKeys.every((controlKey) => {
        const firstControl = numericValue(comparison, controlKey);
        const secondControl = numericValue(probe, controlKey);
        return firstControl !== null
          && secondControl !== null
          && nearlyEqual(firstControl, secondControl);
      });
      return firstIndependent !== null
        && secondIndependent !== null
        && controlsStable
        && !nearlyEqual(firstIndependent, secondIndependent);
    }
    if (diagnosisCode === 'P02_EVIDENCE_ALIGNMENT') {
      if (session.experimentId === 'ohm') return hasOhmRelationship(comparison, probe);
      if (session.experimentId === 'lens') return hasLensRelationship(comparison, probe);
      return hasSoundRelationship(comparison, probe);
    }
    return false;
  });
}

function isDiscriminatingProbe(
  session: InquirySession,
  diagnosisCode: string,
  probe: Measurement,
) {
  return Boolean(discriminatingComparisonForProbe(session, diagnosisCode, probe));
}

function probeMeasurementsAfterIntervention(
  session: InquirySession,
  intervention: Intervention,
) {
  const currentMeasurements = new Map(session.measurements.map((item) => [item.id, item]));
  const acceptanceIndex = session.events.findLastIndex((event) => (
    (event.type === 'intervention_accepted'
      || event.type === 'teacher_overridden'
      || event.type === 'verification_retry_started')
    && event.payload.interventionId === intervention.id
  ));
  if (acceptanceIndex >= 0) {
    return session.events
      .slice(acceptanceIndex + 1)
      .filter((event) => event.type === 'evidence_recorded')
      .flatMap((event) => {
        const measurementId = event.payload.measurementId;
        const measurement = typeof measurementId === 'string'
          ? currentMeasurements.get(measurementId)
          : undefined;
        return measurement ? [measurement] : [];
      });
  }
  return session.measurements.filter((item) => (
    intervention.acceptedAt !== null && item.timestamp > intervention.acceptedAt
  ));
}

function completedProbeMeasurementIds(
  session: InquirySession,
  intervention: Intervention,
) {
  for (const probe of probeMeasurementsAfterIntervention(session, intervention)) {
    const comparison = discriminatingComparisonForProbe(
      session,
      intervention.diagnosisCode,
      probe,
    );
    if (comparison) return [comparison.id, probe.id];
  }
  return [];
}

export function hasCompletedInterventionProbe(
  session: InquirySession,
  intervention: Intervention,
) {
  return completedProbeMeasurementIds(session, intervention).length > 0;
}

function observedConclusion(session: InquirySession, controlStable: boolean, independentVaried: boolean) {
  if (session.measurements.length < 3 || !controlStable || !independentVaried) return 'insufficient';
  if (session.experimentId === 'ohm') {
    const points = session.measurements.map((measurement) => ({
      voltage: numericValue(measurement, 'voltage'),
      current: numericValue(measurement, 'current'),
    }));
    if (points.some((point) => point.voltage === null || point.current === null)) return 'insufficient';
    const ordered = points
      .map((point) => ({ voltage: point.voltage as number, current: point.current as number }))
      .sort((left, right) => left.voltage - right.voltage);
    const slopes: number[] = [];
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (nearlyEqual(current.voltage, previous.voltage)) {
        if (!nearlyEqual(current.current, previous.current)) return 'insufficient';
        continue;
      }
      slopes.push((current.current - previous.current) / (current.voltage - previous.voltage));
    }
    const ratios = ordered
      .filter((point) => !nearlyEqual(point.voltage, 0))
      .map((point) => point.current / point.voltage);
    const passesOrigin = ordered
      .filter((point) => nearlyEqual(point.voltage, 0))
      .every((point) => nearlyEqual(point.current, 0));
    if (slopes.every((slope) => nearlyEqual(slope, 0))) return 'same';
    if (slopes.every((slope) => slope > 0)
      && slopes.every((slope) => nearlyEqual(slope, slopes[0], 0.02))
      && ratios.length >= 2
      && ratios.every((ratio) => nearlyEqual(ratio, ratios[0], 0.02))
      && passesOrigin) {
      return 'direct';
    }
    if (slopes.every((slope) => slope < 0)) return 'inverse';
    return 'insufficient';
  }

  if (session.experimentId === 'sound') {
    const points = session.measurements.map((measurement) => ({
      frequencyHz: numericValue(measurement, 'frequencyHz'),
      pitchHz: numericValue(measurement, 'pitchHz'),
    }));
    if (points.some((point) => point.frequencyHz === null || point.pitchHz === null)) {
      return 'insufficient';
    }
    const ordered = points
      .map((point) => ({ frequencyHz: point.frequencyHz as number, pitchHz: point.pitchHz as number }))
      .sort((left, right) => left.frequencyHz - right.frequencyHz);
    const pitchChanges: number[] = [];
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (nearlyEqual(current.frequencyHz, previous.frequencyHz)) {
        if (!nearlyEqual(current.pitchHz, previous.pitchHz, 0.01)) return 'insufficient';
        continue;
      }
      pitchChanges.push(current.pitchHz - previous.pitchHz);
    }
    const pitchMatchesFrequency = ordered.every((point) => (
      nearlyEqual(point.pitchHz, point.frequencyHz, 0.01)
    ));
    if (pitchChanges.length > 0
      && pitchChanges.every((change) => change > 0)
      && pitchMatchesFrequency) {
      return 'higher_pitch';
    }
    if (pitchChanges.length > 0 && pitchChanges.every((change) => nearlyEqual(change, 0))) {
      return 'same_pitch';
    }
    if (pitchChanges.length > 0 && pitchChanges.every((change) => change < 0)) {
      return 'lower_pitch';
    }
    return 'insufficient';
  }

  const points = session.measurements.map((measurement) => ({
    objectDistance: numericValue(measurement, 'objectDistance'),
    imageDistance: numericValue(measurement, 'imageDistance'),
    magnification: numericValue(measurement, 'magnification'),
  }));
  if (points.some((point) => point.objectDistance === null
    || point.imageDistance === null
    || point.magnification === null
    || (point.imageDistance ?? 0) <= 0)) {
    return 'insufficient';
  }
  const ordered = points
    .map((point) => ({
      objectDistance: point.objectDistance as number,
      imageDistance: point.imageDistance as number,
      magnification: Math.abs(point.magnification as number),
    }))
    .sort((left, right) => left.objectDistance - right.objectDistance);
  const changes: Array<{ imageDistance: number; magnification: number }> = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (nearlyEqual(current.objectDistance, previous.objectDistance)) {
      if (!nearlyEqual(current.imageDistance, previous.imageDistance)
        || !nearlyEqual(current.magnification, previous.magnification)) {
        return 'insufficient';
      }
      continue;
    }
    changes.push({
      imageDistance: current.imageDistance - previous.imageDistance,
      magnification: current.magnification - previous.magnification,
    });
  }
  if (changes.every((change) => change.imageDistance < 0 && change.magnification < 0)) {
    return 'farther_smaller';
  }
  if (changes.every((change) => change.imageDistance > 0 && change.magnification > 0)) {
    return 'farther_bigger';
  }
  return 'insufficient';
}

function evidence(
  constructCode: string,
  label: string,
  detail: string,
  direction: EvidenceDirection,
  reliability: Evidence['reliability'],
  eventRefs: string[],
  now = Date.now(),
): Evidence {
  return { id: uid('evd', now), constructCode, label, detail, direction, reliability, eventRefs };
}

function diagnosis(
  code: string,
  kind: Diagnosis['kind'],
  label: string,
  status: DiagnosisStatus,
  confidence: number,
  summary: string,
  relatedEvidence: Evidence[],
  now = Date.now(),
): Diagnosis {
  return {
    id: uid('dia', now),
    code,
    kind,
    label,
    status,
    confidence,
    summary,
    evidenceRefs: relatedEvidence.filter((item) => item.direction === 'support').map((item) => item.id),
    counterEvidenceRefs: relatedEvidence.filter((item) => item.direction === 'counter').map((item) => item.id),
  };
}

export function evaluateSession(session: InquirySession, now = Date.now()) {
  const items: Evidence[] = [];
  const diagnoses: Diagnosis[] = [];
  const planRefs = refsFor(session, ['plan_submitted']);
  const claimRefs = refsFor(session, ['prediction_submitted', 'claim_submitted']);
  const rows = session.measurements;
  const currentMeasurementIds = new Set(rows.map((measurement) => measurement.id));
  const recordRefs = session.events
    .filter((event) => event.type === 'evidence_recorded'
      && typeof event.payload.measurementId === 'string'
      && currentMeasurementIds.has(event.payload.measurementId))
    .map((event) => event.id);
  const completedProbeFor = (diagnosisCode: string) => {
    const intervention = [...session.interventions].reverse().find((item) => (
      item.acceptedAt !== null && item.diagnosisCode === diagnosisCode
    ));
    if (!intervention) return [];
    const measurementIds = new Set(completedProbeMeasurementIds(session, intervention));
    return session.events
      .filter((event) => event.type === 'evidence_recorded'
        && typeof event.payload.measurementId === 'string'
        && measurementIds.has(event.payload.measurementId))
      .map((event) => event.id);
  };
  const expectedPlan = session.experimentId === 'ohm'
    ? { independent: 'voltage', dependent: 'current', control: 'resistance' }
    : session.experimentId === 'lens'
      ? {
          independent: 'objectDistance',
          dependent: ['imageDistance', 'magnification', 'imageSize', 'imageNature'],
          control: 'focalLength',
        }
      : {
          independent: 'frequencyHz',
          dependent: 'pitchHz',
          control: 'loudnessAndWaveform',
        };
  const planCorrect = session.plan.independent === expectedPlan.independent
    && (Array.isArray(expectedPlan.dependent)
      ? expectedPlan.dependent.includes(session.plan.dependent)
      : session.plan.dependent === expectedPlan.dependent)
    && session.plan.control === expectedPlan.control;
  const controlKeys = controlKeysFor(session.experimentId);
  const independentKey = independentKeyFor(session.experimentId);
  const controlsAreMeasurable = session.experimentId !== 'sound'
    || rows.every((row) => controlKeys.every((controlKey) => numericValue(row, controlKey) !== null));
  const controlStable = rows.length > 0
    && controlsAreMeasurable
    && controlKeys.every((controlKey) => distinct(rows.map((row) => row.values[controlKey])) === 1);
  const independentVaried = distinct(rows.map((row) => row.values[independentKey])) >= 3;

  const planEvidence = evidence(
    'P01_CONTROL_VARIABLE',
    '变量方案',
    planCorrect ? '变量角色选择符合当前探究目标。' : '变量角色选择与当前探究目标不一致。',
    planCorrect ? 'counter' : 'support',
    'medium',
    planRefs,
    now,
  );
  const behaviorEvidence = evidence(
    'P01_CONTROL_VARIABLE',
    '实际操作',
    rows.length < 3
      ? '记录数量不足，暂时不能判断控制变量行为。'
      : !controlsAreMeasurable
        ? '麦克风观察中的响度或波形未标定，无法据此判断是否保持控制条件。'
      : controlStable && independentVaried
        ? `已固定${controlLabelFor(session.experimentId)}并取得 3 个以上不同自变量值。`
        : `记录中${controlLabelFor(session.experimentId)}没有保持一致，或自变量取值不足。`,
    rows.length < 3 || !controlsAreMeasurable ? 'context' : controlStable && independentVaried ? 'counter' : 'support',
    rows.length < 3 || !controlsAreMeasurable ? 'low' : 'high',
    recordRefs,
    now + 1,
  );
  items.push(planEvidence, behaviorEvidence);
  if (rows.length < 3 || !controlsAreMeasurable) {
    diagnoses.push(diagnosis('P01_CONTROL_VARIABLE', 'inquiry', '控制变量策略', 'insufficient', 0.25,
      !controlsAreMeasurable ? '控制条件未标定，系统不能把测量限制判断为学生的控制变量困难。' : '证据不足，系统暂不判断。',
      [planEvidence, behaviorEvidence], now));
  } else if (controlStable && independentVaried && planCorrect) {
    diagnoses.push(diagnosis('P01_CONTROL_VARIABLE', 'inquiry', '控制变量策略', 'resolved', 0.9, '本次计划与实际操作均体现了控制变量。', [planEvidence, behaviorEvidence], now));
  } else if (!controlStable || !independentVaried) {
    diagnoses.push(diagnosis('P01_CONTROL_VARIABLE', 'inquiry', '控制变量策略', 'supported', 0.9, '当前证据支持“控制变量执行存在困难”，需要补充一次更严格的实验。', [planEvidence, behaviorEvidence], now));
  } else {
    diagnoses.push(diagnosis('P01_CONTROL_VARIABLE', 'inquiry', '控制变量策略', 'possible', 0.55, '计划表述与实际操作不一致，需用追问确认。', [planEvidence, behaviorEvidence], now));
  }

  const citedMeasurementIds = new Set(session.conclusionEvidenceIds);
  const citedRows = rows.filter((measurement) => citedMeasurementIds.has(measurement.id));
  const citedIndependentVaried = distinct(citedRows.map((row) => plannedIndependentValue(session, row))) >= 2;
  const hasValidCitations = citedMeasurementIds.size >= 2
    && [...citedMeasurementIds].every((measurementId) => currentMeasurementIds.has(measurementId))
    && citedIndependentVaried;
  const citedRecordRefs = session.events
    .filter((event) => event.type === 'evidence_recorded'
      && typeof event.payload.measurementId === 'string'
      && citedMeasurementIds.has(event.payload.measurementId))
    .map((event) => event.id);
  const enoughExplanation = session.conclusionText.trim().length >= 8 && hasValidCitations;
  const observed = observedConclusion(session, controlStable, independentVaried);
  const correctlyAbstained = observed === 'insufficient'
    && session.conclusionChoice === 'insufficient'
    && enoughExplanation;
  const evidenceCanDecide = observed !== 'insufficient';
  const conclusionAligned = evidenceCanDecide
    && session.conclusionChoice === observed
    && enoughExplanation;
  const alignmentStatus: DiagnosisStatus = correctlyAbstained || conclusionAligned
    ? 'resolved'
    : evidenceCanDecide
      ? 'supported'
      : 'insufficient';
  const alignmentEvidence = evidence(
    'P02_EVIDENCE_ALIGNMENT',
    '证据与结论',
    correctlyAbstained
      ? `引用的 ${citedMeasurementIds.size} 组记录显示控制条件或变化趋势不足，当前结论正确选择暂缓判断。`
      : !evidenceCanDecide
        ? hasValidCitations
          ? `引用的 ${citedMeasurementIds.size} 组记录有效，但全部记录的控制条件或变化趋势不足，系统不据此评价结论对错。`
          : '结论没有关联至少两组仍然存在的实验记录，系统不据此评价结论对错。'
        : conclusionAligned
          ? `结论选择与所引用的 ${citedMeasurementIds.size} 组记录及完整数据趋势一致。`
          : hasValidCitations
            ? `结论虽引用了 ${citedMeasurementIds.size} 组记录，但选择与完整数据中可辨认的变化趋势不一致。`
            : '结论没有关联至少两组仍然存在的实验记录。',
    alignmentStatus === 'resolved' ? 'counter' : alignmentStatus === 'supported' ? 'support' : 'context',
    evidenceCanDecide || correctlyAbstained ? 'high' : 'low',
    [...citedRecordRefs, ...claimRefs],
    now + 2,
  );
  items.push(alignmentEvidence);
  diagnoses.push(diagnosis(
    'P02_EVIDENCE_ALIGNMENT',
    'inquiry',
    '证据—结论一致性',
    alignmentStatus,
    alignmentStatus === 'insufficient' ? 0.25 : alignmentStatus === 'resolved' ? 0.86 : 0.82,
    correctlyAbstained
      ? '本次能识别证据局限并拒绝过早下结论。'
      : alignmentStatus === 'insufficient'
        ? '记录不足，系统暂不评价结论。'
        : conclusionAligned
          ? '本次结论与记录方向一致。'
          : '当前结论与记录数据的变化趋势不一致。',
    [alignmentEvidence],
    now,
  ));

  if (session.experimentId === 'ohm') {
    const completedProbeRefs = completedProbeFor('M01_OHM_CURRENT_CONSTANT');
    const completedProbe = completedProbeRefs.length > 0;
    const wrongPrediction = ['same', 'inverse'].includes(session.predictionChoice);
    const wrongConclusion = ['same', 'inverse'].includes(session.conclusionChoice);
    const correctConclusion = session.conclusionChoice === 'direct';
    const correctionUnconfirmed = wrongPrediction && !wrongConclusion && !correctConclusion;
    const conceptEvidence = evidence(
      'M01_OHM_CURRENT_CONSTANT',
      '电流—电压关系观点',
      wrongConclusion
        ? '当前结论认为电压变化时电流不按同方向、同比例变化。'
        : wrongPrediction && correctConclusion
          ? '初始预测中出现过相反观点，但结论已自行修正。'
          : correctionUnconfirmed
            ? '初始预测出现过相反观点，但结论仅选择暂缓判断，尚不能确认已修正。'
          : '预测与结论未表现出“电流不随电压变化”的观点。',
      wrongConclusion ? 'support' : correctConclusion ? 'counter' : 'context',
      wrongPrediction && wrongConclusion ? 'high' : 'medium',
      [...claimRefs, ...completedProbeRefs],
      now + 3,
    );
    items.push(conceptEvidence);
    diagnoses.push(diagnosis(
      'M01_OHM_CURRENT_CONSTANT',
      'misconception',
      '电流不随电压变化',
      wrongConclusion && completedProbe ? 'supported' : wrongConclusion || correctionUnconfirmed ? 'possible' : 'resolved',
      wrongConclusion && completedProbe ? 0.88 : wrongConclusion ? 0.58 : correctionUnconfirmed ? 0.46 : 0.82,
      wrongConclusion && completedProbe
        ? '初始观点在最小探针和新记录之后仍然出现，当前证据支持该候选。'
        : wrongConclusion
          ? '当前只有回答证据，需用新情境或最小探针验证，系统暂不定性。'
          : wrongPrediction && correctConclusion
            ? '初始观点已在本次探究中自行修正。'
            : correctionUnconfirmed
              ? '学生暂缓作出关系结论，尚不能把它视为对初始观点的修正。'
            : '本次未观察到该候选观点的支持证据。',
      [conceptEvidence],
      now,
    ));
  } else if (session.experimentId === 'lens') {
    const completedScreenProbeRefs = completedProbeFor('M02_LENS_SCREEN_POSITION');
    const completedRelationProbeRefs = completedProbeFor('M03_LENS_DISTANCE_RELATION');
    const completedScreenProbe = completedScreenProbeRefs.length > 0;
    const completedRelationProbe = completedRelationProbeRefs.length > 0;
    const screenPrediction = session.predictionChoice === 'screen_controls';
    const screenConclusion = session.conclusionChoice === 'screen_controls';
    const correctConclusion = session.conclusionChoice === 'farther_smaller';
    const screenCorrectionUnconfirmed = screenPrediction && !screenConclusion && !correctConclusion;
    const screenEvidence = evidence(
      'M02_LENS_SCREEN_POSITION',
      '像与光屏关系观点',
      screenConclusion
        ? '当前结论把光屏位置当作决定像位置的原因。'
        : screenPrediction && correctConclusion
          ? '初始预测中出现过“光屏决定像位置”，但结论已自行修正。'
          : screenCorrectionUnconfirmed
            ? '初始预测把光屏当作决定因素，但结论仅选择暂缓判断，尚不能确认已修正。'
          : '本次回答没有把光屏当作像位置的决定因素。',
      screenConclusion ? 'support' : correctConclusion ? 'counter' : 'context',
      screenPrediction && screenConclusion ? 'high' : 'medium',
      [...claimRefs, ...completedScreenProbeRefs],
      now + 3,
    );
    const relationPredictionWrong = session.predictionChoice === 'farther_bigger';
    const relationConclusionWrong = session.conclusionChoice === 'farther_bigger';
    const relationCorrectionUnconfirmed = relationPredictionWrong && !relationConclusionWrong && !correctConclusion;
    const relationEvidence = evidence(
      'M03_LENS_DISTANCE_RELATION',
      '物距—像距—像大小关系',
      relationConclusionWrong
        ? '当前结论认为物体远离时，像也远离并变大。'
        : relationPredictionWrong && correctConclusion
          ? '初始预测出现过相反关系，但结论已自行修正。'
          : relationCorrectionUnconfirmed
            ? '初始预测出现过相反关系，但结论仅选择暂缓判断，尚不能确认已修正。'
        : '本次回答未表现出相反的物距—像距关系。',
      relationConclusionWrong ? 'support' : correctConclusion ? 'counter' : 'context',
      session.predictionChoice === 'farther_bigger' && session.conclusionChoice === 'farther_bigger' ? 'high' : 'medium',
      [...claimRefs, ...completedRelationProbeRefs],
      now + 4,
    );
    items.push(screenEvidence, relationEvidence);
    diagnoses.push(
      diagnosis(
        'M02_LENS_SCREEN_POSITION',
        'misconception',
        '光屏决定像的位置',
        screenConclusion && completedScreenProbe ? 'supported' : screenConclusion || screenCorrectionUnconfirmed ? 'possible' : 'resolved',
        screenConclusion && completedScreenProbe ? 0.88 : screenConclusion ? 0.58 : screenCorrectionUnconfirmed ? 0.46 : 0.82,
        screenConclusion && completedScreenProbe
          ? '该观点在最小探针和新记录之后仍然出现，当前证据支持该候选。'
          : screenConclusion
            ? '当前为未经独立探针确认的候选观点，系统暂不定性。'
            : screenPrediction && correctConclusion
              ? '初始观点已在本次探究中自行修正。'
              : screenCorrectionUnconfirmed
                ? '学生暂缓作出关系结论，尚不能把它视为对初始观点的修正。'
              : '本次未观察到该候选观点。',
        [screenEvidence],
        now,
      ),
      diagnosis(
        'M03_LENS_DISTANCE_RELATION',
        'misconception',
        '物距与像的变化方向混淆',
        relationConclusionWrong && completedRelationProbe ? 'supported' : relationConclusionWrong || relationCorrectionUnconfirmed ? 'possible' : 'resolved',
        relationConclusionWrong && completedRelationProbe ? 0.86 : relationConclusionWrong ? 0.62 : relationCorrectionUnconfirmed ? 0.46 : 0.82,
        relationConclusionWrong && completedRelationProbe
          ? '该观点在补充实验后仍然出现，当前证据支持该候选。'
          : relationConclusionWrong
            ? '当前有一类回答证据，需要用新情境确认。'
            : relationPredictionWrong && correctConclusion
              ? '初始观点已在结论中自行修正。'
              : relationCorrectionUnconfirmed
                ? '学生暂缓作出关系结论，尚不能把它视为对初始观点的修正。'
              : '本次未观察到该候选观点。',
        [relationEvidence],
        now,
      ),
    );
  } else {
    const completedLoudnessProbeRefs = completedProbeFor('M04_SOUND_LOUDNESS_PITCH');
    const completedRelationProbeRefs = completedProbeFor('M05_SOUND_FREQUENCY_PITCH_RELATION');
    const completedLoudnessProbe = completedLoudnessProbeRefs.length > 0;
    const completedRelationProbe = completedRelationProbeRefs.length > 0;
    const loudnessPrediction = session.predictionChoice === 'loudness_controls_pitch';
    const loudnessConclusion = session.conclusionChoice === 'loudness_controls_pitch';
    const relationPrediction = ['same_pitch', 'lower_pitch'].includes(session.predictionChoice);
    const relationConclusion = ['same_pitch', 'lower_pitch'].includes(session.conclusionChoice);
    const correctConclusion = session.conclusionChoice === 'higher_pitch';
    const loudnessCorrectionUnconfirmed = loudnessPrediction && !loudnessConclusion && !correctConclusion;
    const relationCorrectionUnconfirmed = relationPrediction && !relationConclusion && !correctConclusion;
    const loudnessEvidence = evidence(
      'M04_SOUND_LOUDNESS_PITCH',
      '响度—音调观点',
      loudnessConclusion
        ? '当前结论把响度相同当作音调相同的决定条件。'
        : loudnessPrediction && correctConclusion
          ? '初始预测曾把响度与音调混同，但结论已自行修正。'
          : loudnessCorrectionUnconfirmed
            ? '初始预测曾把响度与音调混同，但结论仅选择暂缓判断，尚不能确认已修正。'
          : '本次回答能区分数字响度与音调。',
      loudnessConclusion ? 'support' : correctConclusion ? 'counter' : 'context',
      loudnessPrediction && loudnessConclusion ? 'high' : 'medium',
      [...claimRefs, ...completedLoudnessProbeRefs],
      now + 3,
    );
    const relationEvidence = evidence(
      'M05_SOUND_FREQUENCY_PITCH_RELATION',
      '频率—音调关系观点',
      relationConclusion
        ? '当前结论认为频率升高时音调不变或降低。'
        : relationPrediction && correctConclusion
          ? '初始预测出现过相反关系，但结论已依据证据自行修正。'
          : relationCorrectionUnconfirmed
            ? '初始预测出现过相反关系，但结论仅选择暂缓判断，尚不能确认已修正。'
          : '本次回答未表现出频率与音调关系倒置。',
      relationConclusion ? 'support' : correctConclusion ? 'counter' : 'context',
      relationPrediction && relationConclusion ? 'high' : 'medium',
      [...claimRefs, ...completedRelationProbeRefs],
      now + 4,
    );
    items.push(loudnessEvidence, relationEvidence);
    diagnoses.push(
      diagnosis(
        'M04_SOUND_LOUDNESS_PITCH',
        'misconception',
        '把响度当成音调的决定因素',
        loudnessConclusion && completedLoudnessProbe ? 'supported' : loudnessConclusion || loudnessCorrectionUnconfirmed ? 'possible' : 'resolved',
        loudnessConclusion && completedLoudnessProbe ? 0.88 : loudnessConclusion ? 0.58 : loudnessCorrectionUnconfirmed ? 0.46 : 0.82,
        loudnessConclusion && completedLoudnessProbe
          ? '改变响度且保持频率不变后，该观点仍然出现，当前证据支持该候选。'
          : loudnessConclusion
            ? '当前只有回答证据，需要用同频不同响度的最小探针验证。'
            : loudnessPrediction && correctConclusion
              ? '初始观点已在本次探究中自行修正。'
              : loudnessCorrectionUnconfirmed
                ? '学生暂缓作出关系结论，尚不能把它视为对初始观点的修正。'
              : '本次未观察到混淆响度与音调的观点。',
        [loudnessEvidence],
        now,
      ),
      diagnosis(
        'M05_SOUND_FREQUENCY_PITCH_RELATION',
        'misconception',
        '频率与音调变化方向混淆',
        relationConclusion && completedRelationProbe ? 'supported' : relationConclusion || relationCorrectionUnconfirmed ? 'possible' : 'resolved',
        relationConclusion && completedRelationProbe ? 0.88 : relationConclusion ? 0.6 : relationCorrectionUnconfirmed ? 0.46 : 0.82,
        relationConclusion && completedRelationProbe
          ? '在同响度、同波形的补充对照后仍坚持相反关系，当前证据支持该候选。'
          : relationConclusion
            ? '当前为未经独立探针确认的候选观点，系统暂不定性。'
            : relationPrediction && correctConclusion
              ? '初始观点已在结论中自行修正。'
              : relationCorrectionUnconfirmed
                ? '学生暂缓作出关系结论，尚不能把它视为对初始观点的修正。'
              : '本次未观察到频率与音调关系倒置。',
        [relationEvidence],
        now,
      ),
    );
  }

  return { evidence: items, diagnoses };
}

const INTERVENTION_TEXT: Record<string, { low: string; guide: string }> = {
  P01_CONTROL_VARIABLE: {
    low: '比较你记录的每一行：除了准备研究的量，还有哪个条件也发生了变化？',
    guide: '请固定控制变量，只改变一个自变量，并重新记录至少 3 组数据。',
  },
  P02_EVIDENCE_ALIGNMENT: {
    low: '你能指出哪三组数据共同支持这条结论吗？它们的变化方向一致吗？',
    guide: '先比较记录中的自变量与因变量，再把结论改写成“当……不变时，……随……怎样变化”。',
  },
  M01_OHM_CURRENT_CONSTANT: {
    low: '找两组电阻相同但电压不同的数据，电流真的保持不变吗？',
    guide: '保持电阻不变，把电压加倍，再比较电流是否也接近加倍。',
  },
  M02_LENS_SCREEN_POSITION: {
    low: '保持物体和透镜不动，只移动光屏：清晰位置变了吗，还是只有清晰程度变了？',
    guide: '先固定物体和透镜，移动光屏寻找唯一清晰位置；再思考是谁决定了这个位置。',
  },
  M03_LENS_DISTANCE_RELATION: {
    low: '在焦距不变时，比较物距最大和最小的两组，像距和放大率分别怎样变化？',
    guide: '固定焦距，依次增大物距，记录像距和放大率，再按变化方向重写结论。',
  },
  M04_SOUND_LOUDNESS_PITCH: {
    low: '保持频率和波形不变，只改变数字响度：音调读数变了吗？振幅又怎样变化？',
    guide: '请选择同一个频率和波形，分别用两个响度记录数据，比较 pitchHz 与 amplitude。',
  },
  M05_SOUND_FREQUENCY_PITCH_RELATION: {
    low: '找两组响度、波形相同但频率不同的数据，频率与音调读数的变化方向一致吗？',
    guide: '保持数字响度和波形不变，将频率明显升高，再记录一组并比较音调。',
  },
};

function chooseIntervention(
  session: InquirySession,
  diagnoses: Diagnosis[],
  policy: ClassPolicy,
  now = Date.now(),
) {
  if (policy.automationMode === 'observe' || session.interventions.length >= policy.maxHintsPerSession) return null;
  const candidate = diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE' && item.status === 'supported')
    ?? diagnoses.find((item) => item.status === 'supported' && item.kind === 'misconception')
    ?? diagnoses.find((item) => item.status === 'possible' && item.kind === 'misconception')
    ?? diagnoses.find((item) => item.status === 'supported');
  if (!candidate) return null;
  const text = INTERVENTION_TEXT[candidate.code];
  if (!text) return null;
  const level: 1 | 2 = policy.automationMode === 'guide' ? 2 : 1;
  return {
    id: uid('int', now),
    diagnosisCode: candidate.code,
    level,
    prompt: level === 1 ? text.low : text.guide,
    createdAt: now,
    acceptedAt: null,
    closedAt: null,
  } satisfies Intervention;
}

export function submitConclusion(
  session: InquirySession,
  choice: string,
  text: string,
  confidence: number,
  policy: ClassPolicy,
  evidenceIds: string[],
  now = Date.now(),
): TransitionResult {
  if (!Array.isArray(evidenceIds)) return failure(session, '请明确选择支撑结论的实验记录。');
  const uniqueEvidenceIds = [...new Set(evidenceIds)];
  const currentMeasurementIds = new Set(session.measurements.map((measurement) => measurement.id));
  if (session.phase !== 'conclusion') return failure(session, '请先完成实验记录，再提交结论。');
  if (!EXPERIMENTS[session.experimentId].conclusionOptions.some((option) => option.value === choice)) {
    return failure(session, '请选择当前实验提供的有效结论。');
  }
  if (text.trim().length < 8) return failure(session, '请结合记录写出至少一句证据说明。');
  if (uniqueEvidenceIds.length < 2) return failure(session, '请勾选至少两组实验记录作为结论证据。');
  if (uniqueEvidenceIds.some((measurementId) => !currentMeasurementIds.has(measurementId))) {
    return failure(session, '引用的实验记录已不存在，请重新选择证据。');
  }
  const citedRows = session.measurements.filter((measurement) => uniqueEvidenceIds.includes(measurement.id));
  if (distinct(citedRows.map((row) => plannedIndependentValue(session, row))) < 2) {
    return failure(session, '请引用至少两个不同自变量取值的记录，形成可比较的证据。');
  }
  const latestAcceptedIntervention = [...session.interventions].reverse().find((item) => (
    item.acceptedAt !== null && item.closedAt === null
  ));
  if (latestAcceptedIntervention) {
    const validProbeIds = new Set(
      probeMeasurementsAfterIntervention(session, latestAcceptedIntervention)
        .filter((measurement) => isDiscriminatingProbe(
          session,
          latestAcceptedIntervention.diagnosisCode,
          measurement,
        ))
        .map((measurement) => measurement.id),
    );
    if (![...validProbeIds].some((measurementId) => uniqueEvidenceIds.includes(measurementId))) {
      return failure(session, '请在结论证据中勾选至少一组本轮补做的有效对照记录。');
    }
  }
  let next: InquirySession = {
    ...session,
    conclusionChoice: choice,
    conclusionText: text.trim(),
    conclusionConfidence: Math.max(0, Math.min(100, confidence)),
    conclusionEvidenceIds: uniqueEvidenceIds,
    interventions: session.interventions.map((item) => (
      item.acceptedAt === null && item.closedAt === null ? { ...item, closedAt: now } : item
    )),
    phase: 'diagnosis',
  };
  next = appendEvent(next, 'claim_submitted', {
    choice,
    text: text.trim(),
    confidence: next.conclusionConfidence,
    evidenceIds: uniqueEvidenceIds,
  }, 'conclusion', now);
  const bundle = evaluateSession(next, now + 1);
  const regeneratedCodes = new Set(bundle.diagnoses.map((item) => item.code));
  next = {
    ...next,
    evidence: bundle.evidence,
    diagnoses: bundle.diagnoses,
    teacherOverrides: next.teacherOverrides.filter((item) => !regeneratedCodes.has(item.diagnosisCode)),
  };
  next = appendEvent(next, 'diagnosis_emitted', {
    codes: bundle.diagnoses.map((item) => item.code),
    supported: bundle.diagnoses.filter((item) => item.status === 'supported').map((item) => item.code),
    abstained: bundle.diagnoses.filter((item) => item.status === 'insufficient').map((item) => item.code),
    summaries: bundle.diagnoses.map((item) => `${item.label}：${item.summary}`),
  }, 'diagnosis', now + 2);
  const intervention = chooseIntervention(next, bundle.diagnoses, policy, now + 3);
  if (intervention) {
    next = { ...next, interventions: [...next.interventions, intervention] };
    next = appendEvent(next, 'intervention_delivered', {
      interventionId: intervention.id,
      diagnosisCode: intervention.diagnosisCode,
      level: intervention.level,
    }, 'diagnosis', now + 3);
  }
  return success(next, intervention ? '已形成诊断，并给出一条最小干预。' : '已形成诊断；当前不需要自动干预。');
}

export function acceptLatestIntervention(session: InquirySession, now = Date.now()): TransitionResult {
  if (session.phase !== 'diagnosis') return failure(session, '只能在证据反馈阶段接受补充任务。');
  const latest = [...session.interventions].reverse().find((item) => (
    item.acceptedAt === null && item.closedAt === null
  ));
  if (!latest) return failure(session, '当前没有等待执行的探究提示。');
  const interventions = session.interventions.map((item) => item.id === latest.id ? { ...item, acceptedAt: now } : item);
  let next: InquirySession = { ...session, interventions, phase: 'experiment' };
  next = appendEvent(next, 'intervention_accepted', {
    interventionId: latest.id,
    diagnosisCode: latest.diagnosisCode,
  }, 'diagnosis', now);
  return success(next, '已返回实验，可补充或重新记录证据。');
}

function misconceptionCodeForVerificationChoice(
  experimentId: ExperimentId,
  answerChoice: string,
) {
  if (experimentId === 'ohm') {
    return ['same', 'inverse'].includes(answerChoice) ? 'M01_OHM_CURRENT_CONSTANT' : null;
  }
  if (experimentId === 'lens') {
    if (answerChoice === 'screen_controls') return 'M02_LENS_SCREEN_POSITION';
    if (answerChoice === 'real_inverted_larger') return 'M03_LENS_DISTANCE_RELATION';
    return null;
  }
  if (answerChoice === 'loudness_controls_pitch') return 'M04_SOUND_LOUDNESS_PITCH';
  return ['same_pitch', 'lower_pitch'].includes(answerChoice)
    ? 'M05_SOUND_FREQUENCY_PITCH_RELATION'
    : null;
}

function retryProbePrompt(experimentId: ExperimentId, diagnosisCode: string) {
  if (diagnosisCode === 'P02_EVIDENCE_ALIGNMENT') {
    if (experimentId === 'ohm') {
      return '迁移验证未通过。保持电阻不变，改变电压并补记一组可与原记录比较的数据。';
    }
    if (experimentId === 'lens') {
      return '迁移验证未通过。保持焦距不变，改变物距并补记一组像距与放大率数据。';
    }
    return '迁移验证未通过。保持数字响度和波形不变，改变频率并补记一组音调数据。';
  }
  const diagnosisPrompt = INTERVENTION_TEXT[diagnosisCode]?.guide;
  return diagnosisPrompt
    ? `迁移验证未通过。${diagnosisPrompt}`
    : '迁移验证未通过。请补记一组能够区分当前解释的新证据。';
}

export function beginVerification(session: InquirySession, now = Date.now()): TransitionResult {
  if (session.phase !== 'diagnosis') return failure(session, '请先提交结论并查看证据反馈。');
  let next: InquirySession = { ...session, phase: 'verification' };
  next = appendEvent(next, 'verification_started', {
    target: session.experimentId === 'ohm'
      ? 'new_resistance_transfer'
      : session.experimentId === 'lens'
        ? 'new_lens_case_transfer'
        : 'new_frequency_transfer',
  }, 'verification', now);
  return success(next, '已进入无提示的新情境验证。');
}

export function submitVerification(
  session: InquirySession,
  answerChoice: string,
  numericAnswer: number | null,
  explanation: string,
  now = Date.now(),
): TransitionResult {
  if (session.phase !== 'verification') return failure(session, '当前尚未进入新情境验证。');
  const validAnswerChoices: string[] = session.experimentId === 'ohm'
    ? ['direct', 'same', 'inverse']
    : session.experimentId === 'lens'
      ? ['real_inverted_smaller', 'real_inverted_larger', 'virtual_upright_larger', 'screen_controls']
      : ['higher_pitch', 'same_pitch', 'lower_pitch', 'loudness_controls_pitch'];
  if (!validAnswerChoices.includes(answerChoice)) return failure(session, '请选择一个有效的关系或像的性质。');
  if (numericAnswer === null || !Number.isFinite(numericAnswer)) return failure(session, '请填写一个有效的数值答案。');
  if (explanation.trim().length < 4) return failure(session, '请简要写出判断依据。');
  let passed = false;
  let expected = '';
  let feedback = '';
  if (session.experimentId === 'ohm') {
    expected = '0.40 A（允许 ±0.03 A）';
    passed = answerChoice === 'direct'
      && Math.abs(numericAnswer - 0.4) <= 0.03;
    feedback = passed ? '新电阻情境下仍能独立应用 I=U/R。' : '新情境尚未通过；这不会抹去前面的探究证据。';
  } else if (session.experimentId === 'lens') {
    expected = '实像、倒立、缩小，像距约 15 cm';
    passed = answerChoice === 'real_inverted_smaller'
      && Math.abs(numericAnswer - 15) <= 1;
    feedback = passed ? '在未见过的参数中仍能判断像的性质与位置。' : '新情境尚未通过，建议教师结合证据回放进一步追问。';
  } else {
    expected = '音调升高，新音调约 880 Hz（允许 ±5 Hz）';
    passed = answerChoice === 'higher_pitch'
      && Math.abs(numericAnswer - 880) <= 5;
    feedback = passed ? '在新的波形与响度情境中仍能独立判断频率与音调关系。' : '新情境尚未通过，建议回放波形与频率读数进一步比较。';
  }
  const verification: VerificationResult = {
    completedAt: now,
    passed,
    answerChoice,
    numericAnswer,
    explanation: explanation.trim(),
    expected,
    feedback,
  };
  let next: InquirySession = { ...session, verification, phase: 'complete' };
  next = appendEvent(next, 'verification_completed', {
    passed,
    answerChoice,
    numericAnswer,
    explanation: verification.explanation,
    expected,
    feedback,
  }, 'verification', now);
  if (!passed) {
    const matchingCode = misconceptionCodeForVerificationChoice(session.experimentId, answerChoice);
    if (matchingCode) {
      const verificationEvent = next.events.at(-1);
      const verificationEvidence = evidence(
        matchingCode,
        '新情境独立验证',
        '在参数和表征均已更换的无提示任务中，同一候选观点再次出现。',
        'support',
        'high',
        verificationEvent ? [verificationEvent.id] : [],
        now + 1,
      );
      next = {
        ...next,
        evidence: [...next.evidence, verificationEvidence],
        diagnoses: next.diagnoses.map((item) => {
          if (item.code !== matchingCode) return item;
          const repeatedCandidate = item.status === 'possible' || item.status === 'supported';
          return {
            ...item,
            id: uid('dia', now + 2),
            status: repeatedCandidate ? 'supported' as const : 'possible' as const,
            confidence: repeatedCandidate ? Math.max(item.confidence, 0.86) : 0.62,
            summary: repeatedCandidate
              ? '原探究中的候选观点又在无提示新情境中出现，当前已有多条证据支持。'
              : '此前探究中未观察到稳定困难，但无提示新情境出现了相关错误；当前仅作为待教师复核的候选。',
            evidenceRefs: [...new Set([...item.evidenceRefs, verificationEvidence.id])],
          };
        }),
      };
    }
  }
  return success(next, passed ? '独立验证通过。' : '验证完成，结果已交给教师工作台。');
}

export function retryAfterFailedVerification(
  session: InquirySession,
  now = Date.now(),
): TransitionResult {
  if (session.phase !== 'complete' || session.verification?.passed !== false) {
    return failure(session, '只有已完成且未通过的迁移验证可以返回实验补充证据。');
  }
  const previousVerification = session.verification;
  const previousVerificationEvent = [...session.events].reverse().find((event) => (
    event.type === 'verification_completed'
  ));
  const diagnosisCode = misconceptionCodeForVerificationChoice(
    session.experimentId,
    previousVerification.answerChoice,
  ) ?? 'P02_EVIDENCE_ALIGNMENT';
  const intervention: Intervention = {
    id: uid('int_retry', now),
    diagnosisCode,
    level: 1,
    prompt: retryProbePrompt(session.experimentId, diagnosisCode),
    createdAt: now,
    acceptedAt: now,
    closedAt: null,
  };
  let next: InquirySession = {
    ...session,
    phase: 'experiment',
    interventions: [...session.interventions, intervention],
  };
  next = appendEvent(next, 'verification_retry_started', {
    interventionId: intervention.id,
    diagnosisCode,
    previousVerificationEventId: previousVerificationEvent?.id ?? null,
    previousCompletedAt: previousVerification.completedAt,
    previousPassed: previousVerification.passed,
    previousAnswerChoice: previousVerification.answerChoice,
    previousNumericAnswer: previousVerification.numericAnswer,
    previousExplanation: previousVerification.explanation,
    previousExpected: previousVerification.expected,
    previousFeedback: previousVerification.feedback,
    attempt: session.events.filter((event) => event.type === 'verification_completed').length,
  }, 'experiment', now);
  return success(next, '已保留本次验证结果并返回实验；请先完成一组可区分的补充证据。');
}

export function applyTeacherOverride(
  session: InquirySession,
  diagnosisCode: string,
  verdict: TeacherOverride['verdict'],
  note = '',
  now = Date.now(),
): InquirySession {
  const targetDiagnosis = session.diagnoses.find((item) => item.code === diagnosisCode);
  if (!targetDiagnosis) return session;
  const override: TeacherOverride = {
    diagnosisId: targetDiagnosis.id,
    diagnosisCode,
    verdict,
    note: note.trim(),
    timestamp: now,
  };
  const teacherOverrides = [
    ...session.teacherOverrides.filter((item) => item.diagnosisCode !== diagnosisCode),
    override,
  ];
  let next: InquirySession = { ...session, teacherOverrides };
  let interventionId: string | null = null;
  if (verdict === 'insufficient') {
    const teacherTask: Intervention = {
      id: uid('int_teacher', now),
      diagnosisCode,
      level: 1,
      prompt: override.note || '教师请你回到装置，补做一组能区分当前两种解释的对照实验。',
      createdAt: now,
      acceptedAt: now,
      closedAt: null,
    };
    interventionId = teacherTask.id;
    next = {
      ...next,
      phase: 'experiment',
      interventions: [...next.interventions, teacherTask],
    };
  }
  return appendEvent(
    next,
    'teacher_overridden',
    {
      diagnosisId: targetDiagnosis.id,
      diagnosisCode,
      verdict,
      note: override.note,
      interventionId,
      returnedToExperiment: verdict === 'insufficient',
    },
    next.phase,
    now,
  );
}

export function getCurrentTeacherOverride(session: InquirySession, diagnosisItem: Diagnosis) {
  return [...session.teacherOverrides].reverse().find((item) => item.diagnosisId === diagnosisItem.id);
}

export function confidenceBand(confidence: number) {
  if (confidence >= 0.8) return '较高';
  if (confidence >= 0.55) return '中等';
  return '较低';
}

export function diagnosisNeedsTeacherAttention(session: InquirySession, diagnosisItem: Diagnosis) {
  const override = getCurrentTeacherOverride(session, diagnosisItem);
  if (override?.verdict === 'reject') return false;
  if (override?.verdict === 'confirm' || override?.verdict === 'insufficient') return true;
  return diagnosisItem.status === 'supported';
}

function diagnosisBelongsInClassMap(session: InquirySession, diagnosisItem: Diagnosis) {
  const override = getCurrentTeacherOverride(session, diagnosisItem);
  if (override?.verdict === 'reject' || override?.verdict === 'insufficient') return false;
  return override?.verdict === 'confirm' || diagnosisItem.status === 'supported';
}

export function summarizeSessions(sessions: InquirySession[]): ClassSummary {
  const completed = sessions.filter((session) => session.phase === 'complete');
  const verified = completed.filter((session) => session.verification?.passed).length;
  const actionable = sessions.filter((session) => session.verification?.passed === false
    || session.diagnoses.some((diagnosisItem) => diagnosisNeedsTeacherAttention(session, diagnosisItem)));
  const counts = new Map<string, { label: string; count: number }>();
  for (const session of sessions) {
    for (const item of session.diagnoses) {
      if (!diagnosisBelongsInClassMap(session, item)) continue;
      const current = counts.get(item.code) ?? { label: item.label, count: 0 };
      counts.set(item.code, { ...current, count: current.count + 1 });
    }
  }
  return {
    total: sessions.length,
    active: sessions.filter((session) => session.phase !== 'complete').length,
    needsAttention: actionable.length,
    verified,
    verificationRate: completed.length ? Math.round(verified / completed.length * 100) : 0,
    interventions: sessions.reduce((sum, session) => sum + session.interventions.length, 0),
    diagnosisCounts: [...counts.entries()]
      .map(([code, value]) => ({ code, ...value }))
      .sort((a, b) => b.count - a.count),
  };
}

export function phaseLabel(phase: InquiryPhase) {
  return {
    prediction: '提出预测',
    plan: '设计实验',
    experiment: '采集证据',
    conclusion: '形成结论',
    diagnosis: '诊断与干预',
    verification: '迁移验证',
    complete: '已完成',
  }[phase];
}

export function createDemoSessions(policy: ClassPolicy, now = Date.now()) {
  let ohm = createSession('陈同学', 'ohm', policy, now - 900_000);
  ohm = submitPrediction(ohm, 'same', '我认为电阻决定电流，电压变化影响不大', now - 890_000).session;
  ohm = submitPlan(ohm, { independent: 'voltage', dependent: 'current', control: 'resistance' }, now - 880_000).session;
  for (const [voltage, resistance] of [[2, 20], [4, 30], [8, 40]] as const) {
    ohm = changeParameter(ohm, 'voltage', voltage, now - 870_000 + voltage * 1000);
    ohm = changeParameter(ohm, 'resistance', resistance, now - 869_000 + voltage * 1000);
    ohm = captureMeasurement(ohm, now - 868_000 + voltage * 1000).session;
  }
  ohm = finishCollection(ohm, now - 820_000).session;
  ohm = submitConclusion(ohm, 'same', '三组数据里的电流差别并不大，所以没有关系', 78, policy, [ohm.measurements[0].id, ohm.measurements.at(-1)!.id], now - 810_000).session;

  let lens = createSession('林同学', 'lens', policy, now - 600_000);
  lens = submitPrediction(lens, 'farther_smaller', '物体越远，成的实像越小并靠近焦点', now - 590_000).session;
  lens = submitPlan(lens, { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' }, now - 580_000).session;
  for (const distance of [22, 30, 40]) {
    lens = changeParameter(lens, 'objectDistance', distance, now - 570_000 + distance * 1000);
    lens = captureMeasurement(lens, now - 569_000 + distance * 1000).session;
  }
  lens = finishCollection(lens, now - 500_000).session;
  lens = submitConclusion(lens, 'farther_smaller', '焦距保持十厘米时，物距越大，像距和放大率都减小', 88, policy, [lens.measurements[0].id, lens.measurements.at(-1)!.id], now - 490_000).session;
  lens = beginVerification(lens, now - 480_000).session;
  lens = submitVerification(lens, 'real_inverted_smaller', 15, '代入薄透镜公式并判断放大率小于一', now - 470_000).session;

  let screen = createSession('王同学', 'lens', policy, now - 300_000);
  screen = submitPrediction(screen, 'screen_controls', '光屏放在哪里，像就会出现在那里', now - 290_000).session;
  screen = submitPlan(screen, { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' }, now - 280_000).session;
  for (const distance of [18, 25, 35]) {
    screen = changeParameter(screen, 'objectDistance', distance, now - 270_000 + distance * 1000);
    screen = captureMeasurement(screen, now - 269_000 + distance * 1000).session;
  }
  screen = finishCollection(screen, now - 220_000).session;
  screen = submitConclusion(screen, 'screen_controls', '移动光屏以后清晰位置改变，所以像的位置由光屏决定', 91, policy, [screen.measurements[0].id, screen.measurements.at(-1)!.id], now - 210_000).session;

  let sound = createSession('赵同学', 'sound', policy, now - 180_000);
  sound = submitPrediction(sound, 'higher_pitch', '同一段时间内振动次数越多，听起来音调应当越高', now - 175_000).session;
  sound = submitPlan(sound, { independent: 'frequencyHz', dependent: 'pitchHz', control: 'loudnessAndWaveform' }, now - 170_000).session;
  for (const frequencyHz of [220, 440, 880]) {
    sound = changeParameter(sound, 'frequencyHz', frequencyHz, now - 165_000 + frequencyHz);
    sound = captureMeasurement(sound, now - 164_000 + frequencyHz).session;
  }
  sound = finishCollection(sound, now - 150_000).session;
  sound = submitConclusion(sound, 'higher_pitch', '三组中频率从220升至880赫兹，音调对应读数也依次升高', 86, policy, [sound.measurements[0].id, sound.measurements.at(-1)!.id], now - 145_000).session;
  sound = beginVerification(sound, now - 140_000).session;
  sound = submitVerification(sound, 'higher_pitch', 880, '由周期约1.14毫秒可估算频率约为880赫兹', now - 135_000).session;

  return [ohm, lens, screen, sound].map((session) => ({ ...session, dataOrigin: 'demo' as const }));
}
