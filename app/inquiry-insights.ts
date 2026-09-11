import { EXPERIMENTS, getCurrentTeacherOverride } from './inquiry-engine.ts';
import type { InquiryEvent, InquiryPhase, InquirySession, Measurement } from './inquiry-engine';

export type ProcessIndicator = {
  code: string;
  label: string;
  state: 'observed' | 'attention' | 'unknown';
  detail: string;
  eventRefs: string[];
};

const PARAMETER_KEYS = {
  ohm: ['voltage', 'resistance'],
  lens: ['objectDistance', 'focalLength', 'screenPosition'],
  sound: ['frequencyHz', 'loudness', 'waveformCode'],
} as const;

const INITIAL_PARAMETERS: Record<InquirySession['experimentId'], Record<string, number>> = {
  ohm: { voltage: 3, resistance: 20 },
  lens: { objectDistance: 30, focalLength: 10, screenPosition: 20 },
  sound: { frequencyHz: 440, loudness: 50, waveformCode: 0 },
};

const RECORD_META = new Set(['measurementId', 'measurementIndex', 'structuredOnly']);

/** 重建指定事件之后的装置与记录；不使用会话末尾的参数冒充历史状态。 */
export function replayInquiryAt(session: InquirySession, eventIndex: number) {
  const boundedIndex = Math.min(session.events.length - 1, Math.max(0, Math.floor(eventIndex)));
  const parameters = { ...INITIAL_PARAMETERS[session.experimentId] };
  const measurements = new Map<string, Measurement>();
  const incompleteRecordIds = new Set<string>();
  const keys = PARAMETER_KEYS[session.experimentId] as readonly string[];
  let phase: InquiryPhase = 'prediction';
  let prediction = '';
  let conclusion = '';
  let explanation = '';

  for (const event of session.events.slice(0, boundedIndex + 1)) {
    const payload = event.payload;
    phase = event.phase;
    if (event.type === 'session_started') {
      for (const key of keys) if (typeof payload[key] === 'number') parameters[key] = payload[key];
    }
    if (event.type === 'parameter_changed' && typeof payload.key === 'string'
      && keys.includes(payload.key) && typeof payload.after === 'number') {
      parameters[payload.key] = payload.after;
    }
    if (event.type === 'evidence_recorded' && typeof payload.measurementId === 'string') {
      const values = Object.fromEntries(Object.entries(payload).filter(([key, value]) => (
        !RECORD_META.has(key) && (value === null || typeof value === 'number' || typeof value === 'string')
      ))) as Measurement['values'];
      const hasSnapshot = keys.some((key) => Object.hasOwn(values, key));
      const legacy = session.measurements.find((row) => row.id === payload.measurementId);
      if (hasSnapshot || legacy) {
        measurements.set(payload.measurementId, {
          id: payload.measurementId,
          timestamp: event.timestamp,
          values: hasSnapshot ? values : { ...legacy!.values },
        });
      } else {
        incompleteRecordIds.add(payload.measurementId);
      }
    }
    if (event.type === 'evidence_removed' && typeof payload.measurementId === 'string') {
      measurements.delete(payload.measurementId);
      incompleteRecordIds.delete(payload.measurementId);
    }
    if (event.type === 'prediction_submitted') {
      prediction = typeof payload.choice === 'string' ? payload.choice : '';
      phase = 'plan';
    }
    if (event.type === 'plan_submitted') phase = 'experiment';
    if (event.type === 'collection_completed') phase = 'conclusion';
    if (event.type === 'claim_submitted') {
      conclusion = typeof payload.choice === 'string' ? payload.choice : '';
      explanation = typeof payload.text === 'string' ? payload.text : '';
      phase = 'diagnosis';
    }
    if (event.type === 'intervention_accepted' || event.type === 'verification_retry_started'
      || (event.type === 'teacher_overridden' && payload.returnedToExperiment === true)) phase = 'experiment';
    if (event.type === 'verification_completed') phase = 'complete';
  }
  return {
    event: session.events[boundedIndex] ?? null,
    eventIndex: boundedIndex,
    parameters,
    measurements: [...measurements.values()],
    incompleteRecords: incompleteRecordIds.size,
    phase,
    prediction,
    conclusion,
    explanation,
  };
}

function refsFor(session: InquirySession, types: InquiryEvent['type'][]) {
  return session.events.filter((event) => types.includes(event.type)).map((event) => event.id);
}

function indicatorFromDiagnosis(session: InquirySession, code: string, label: string): ProcessIndicator {
  const item = session.diagnoses.find((candidate) => candidate.code === code);
  if (!item) return { code, label, state: 'unknown', detail: '尚未形成足够的过程证据。', eventRefs: [] };
  const override = getCurrentTeacherOverride(session, item);
  const evidenceIds = new Set([...item.evidenceRefs, ...item.counterEvidenceRefs]);
  const eventRefs = [...new Set(session.evidence.filter((row) => evidenceIds.has(row.id)).flatMap((row) => row.eventRefs))];
  if (override) {
    const overrideEvent = session.events.findLast((event) => event.type === 'teacher_overridden'
      && event.payload.diagnosisId === item.id && event.timestamp === override.timestamp);
    if (overrideEvent) eventRefs.push(overrideEvent.id);
  }
  if (override?.verdict === 'reject' || override?.verdict === 'insufficient') {
    return { code, label, state: 'unknown', detail: override.verdict === 'reject'
      ? '教师已否决机器候选；仍需另取证据评价此项。' : '教师要求补证据，当前暂不判断。', eventRefs };
  }
  return {
    code, label, eventRefs,
    state: override?.verdict === 'confirm' || item.status === 'supported' || item.status === 'possible'
      ? 'attention' : item.status === 'resolved' ? 'observed' : 'unknown',
    detail: item.summary,
  };
}

/** 只报告本次可观察的行为；次数和未出现的行为均不直接换算成能力分数。 */
export function buildProcessProfile(session: InquirySession): ProcessIndicator[] {
  const predictions = refsFor(session, ['prediction_submitted']);
  const recordRefs = refsFor(session, ['evidence_recorded', 'evidence_removed']);
  const keys = PARAMETER_KEYS[session.experimentId];
  const signatures = session.measurements.filter((row) => row.values.source !== 'microphone').map((row) => (
    keys.map((key) => `${key}:${row.values[key]}`).join('|')
  ));
  const repeatCount = signatures.length - new Set(signatures).size;
  const accepted = session.events.filter((event) => event.type === 'intervention_accepted'
    || event.type === 'verification_retry_started'
    || (event.type === 'teacher_overridden' && event.payload.returnedToExperiment === true));
  const latestAcceptanceIndex = session.events.findLastIndex((event) => accepted.some((item) => item.id === event.id));
  const followupRecords = latestAcceptanceIndex < 0 ? [] : session.events.slice(latestAcceptanceIndex + 1)
    .filter((event) => event.type === 'evidence_recorded'
      && session.measurements.some((row) => row.id === event.payload.measurementId));
  const verificationRefs = refsFor(session, ['verification_completed']);
  return [
    { code: 'prediction', label: '猜想表达', state: predictions.length ? 'observed' : 'unknown',
      detail: predictions.length ? '已在操作前提交预测和理由；这只说明完成了表达，不代表猜想正确。' : '尚未提交预测和理由。', eventRefs: predictions },
    indicatorFromDiagnosis(session, 'P01_CONTROL_VARIABLE', '实验设计与控制变量'),
    { code: 'recording', label: '记录与复测', state: session.measurements.length ? 'observed' : 'unknown',
      detail: `当前保留 ${session.measurements.length} 组记录；其中同装置参数重复记录 ${repeatCount} 组。理想仿真重复不会产生随机误差，次数不用于评分。`, eventRefs: recordRefs },
    indicatorFromDiagnosis(session, 'P02_EVIDENCE_ALIGNMENT', '证据推理'),
    { code: 'reflection', label: '补证与反思', state: accepted.length === 0 ? 'unknown' : followupRecords.length ? 'observed' : 'attention',
      detail: accepted.length === 0 ? '本次尚未安排补证任务，不据此判断反思能力。' : followupRecords.length
        ? `接受最近一次任务后，已补充 ${followupRecords.length} 组仍保留的记录；是否修正观点请结合后续结论。` : '已接受补证任务，尚无仍保留的新记录。',
      eventRefs: [...accepted.map((event) => event.id), ...followupRecords.map((event) => event.id)] },
    { code: 'verification', label: '独立迁移', state: !session.verification ? 'unknown' : session.verification.passed ? 'observed' : 'attention',
      detail: !session.verification ? '尚未完成无提示的新情境验证。' : `${session.verification.passed ? '最近一次验证通过' : '最近一次验证未通过'}，共完成 ${verificationRefs.length} 次。${session.verification.feedback}`,
      eventRefs: verificationRefs },
  ];
}

export function variableLabel(session: InquirySession, key: string) {
  return EXPERIMENTS[session.experimentId].variables.find((item) => item.value === key)?.label ?? key;
}

export const KNOWLEDGE_CONSTRUCTS = [
  { code: 'P01_CONTROL_VARIABLE', domain: 'inquiry', label: '控制变量', parent: '科学探究' },
  { code: 'P02_EVIDENCE_ALIGNMENT', domain: 'inquiry', label: '证据与结论', parent: '科学探究' },
  { code: 'M01_OHM_CURRENT_CONSTANT', domain: 'ohm', label: '电流—电压关系', parent: '欧姆定律' },
  { code: 'M02_LENS_SCREEN_POSITION', domain: 'lens', label: '像的位置与光屏', parent: '凸透镜成像' },
  { code: 'M03_LENS_DISTANCE_RELATION', domain: 'lens', label: '物距—像距—像大小', parent: '凸透镜成像' },
  { code: 'M04_SOUND_LOUDNESS_PITCH', domain: 'sound', label: '响度与音调的区分', parent: '声音特征' },
  { code: 'M05_SOUND_FREQUENCY_PITCH_RELATION', domain: 'sound', label: '频率—音调关系', parent: '声音特征' },
] as const;

/** 分母仅包含涉及该构念的任务会话；未评估不会自动算作通过。 */
export function buildClassCognitionMap(sessions: InquirySession[]) {
  return KNOWLEDGE_CONSTRUCTS.map((construct) => {
    const eligible = sessions.filter((session) => construct.domain === 'inquiry' || session.experimentId === construct.domain);
    const counts = { observed: 0, candidate: 0, supported: 0, unknown: 0 };
    for (const session of eligible) {
      const item = session.diagnoses.find((diagnosis) => diagnosis.code === construct.code);
      if (!item) { counts.unknown += 1; continue; }
      const override = getCurrentTeacherOverride(session, item);
      if (override?.verdict === 'reject' || override?.verdict === 'insufficient') counts.unknown += 1;
      else if (override?.verdict === 'confirm' || item.status === 'supported') counts.supported += 1;
      else if (item.status === 'insufficient') counts.unknown += 1;
      else if (item.status === 'possible') counts.candidate += 1;
      else counts.observed += 1;
    }
    return { ...construct, ...counts, total: eligible.length };
  }).filter((construct) => construct.total > 0);
}

export function eventDescription(session: InquirySession, event: InquiryEvent): string {
  const p = event.payload;
  const field = (key: string, fallback = '未记录') => {
    const value = p[key];
    if (value === null || value === undefined || value === '') return fallback;
    return Array.isArray(value) ? value.join('、') : String(value);
  };
  const experiment = EXPERIMENTS[session.experimentId];
  const optionLabel = (key: unknown, kind: 'prediction' | 'conclusion') => (
    (kind === 'prediction' ? experiment.predictionOptions : experiment.conclusionOptions)
      .find((option) => option.value === key)?.label ?? (typeof key === 'string' ? key : '未记录')
  );
  if (event.type === 'parameter_changed') return `${variableLabel(session, field('key'))}：${field('before')} → ${field('after')}`;
  if (event.type === 'prediction_submitted') return `${optionLabel(p.choice, 'prediction')}；理由：${field('reason')}`;
  if (event.type === 'plan_submitted') return `${p.revised ? '修订方案：' : ''}改变${variableLabel(session, String(p.independent))}，观察${variableLabel(session, String(p.dependent))}，保持${variableLabel(session, String(p.control))}。`;
  if (event.type === 'claim_submitted') return `${optionLabel(p.choice, 'conclusion')}；${field('text', '')}（引用 ${Array.isArray(p.evidenceIds) ? p.evidenceIds.length : 0} 组记录）`;
  if (event.type === 'evidence_recorded') return `主动记录第 ${field('measurementIndex', '—')} 组${p.source === 'microphone' ? '麦克风观察' : '实验证据'}。`;
  if (event.type === 'evidence_removed') return '从当前证据本移除一组记录；原始采集事件仍保留，可回到前一步查看。';
  if (event.type === 'diagnosis_emitted') return Array.isArray(p.summaries) ? p.summaries.join('\n') : `形成候选：${Array.isArray(p.codes) ? p.codes.join('、') : '—'}`;
  if (event.type === 'intervention_delivered' || event.type === 'intervention_accepted' || event.type === 'verification_retry_started') {
    return session.interventions.find((item) => item.id === p.interventionId)?.prompt ?? '已记录再探究任务。';
  }
  if (event.type === 'teacher_overridden') return `教师${p.verdict === 'confirm' ? '确认候选' : p.verdict === 'reject' ? '标记不成立' : '要求补证据'}：${field('diagnosisCode')}。${field('note', '未补充文字说明。')}`;
  if (event.type === 'verification_completed') return `${p.passed ? '验证通过' : '验证未通过'}；数值回答 ${field('numericAnswer')}；${field('explanation', '旧记录未保存说明。')}`;
  if (event.type === 'verification_started') return '更换参数或表征，学生独立作答。';
  if (event.type === 'collection_completed') return `完成 ${field('measurementCount')} 组记录，进入结论阶段。`;
  return `开始${experiment.title}。`;
}
