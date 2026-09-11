'use client';

import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Download,
  Eye,
  FlaskConical,
  Gauge,
  Lightbulb,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EXPERIMENTS,
  acceptLatestIntervention,
  applyTeacherOverride,
  beginVerification,
  calculateLens,
  calculateOhm,
  calculateSound,
  captureMeasurement,
  captureSoundObservation,
  changeParameter,
  confidenceBand,
  createDemoSessions,
  createSession,
  diagnosisNeedsTeacherAttention,
  finishCollection,
  getCurrentTeacherOverride,
  hasCompletedInterventionProbe,
  phaseLabel,
  removeMeasurement,
  retryAfterFailedVerification,
  SOUND_WAVEFORMS,
  submitConclusion,
  submitPlan,
  submitPrediction,
  submitVerification,
  summarizeSessions,
  type ClassPolicy,
  type Diagnosis,
  type ExperimentId,
  type InquiryPhase,
  type InquiryPlan,
  type InquirySession,
  type SoundObservationInput,
  type TransitionResult,
} from './inquiry-engine';
import {
  DEFAULT_WORKSPACE,
  LocalSessionRepository,
  type WorkspaceState,
} from './inquiry-repository';
import { LensVisual, OhmVisual, SoundVisual } from './experiment-visuals';
import { SoundLab, type SoundObservationSnapshot } from './sound-lab';
import { gainFromLoudness } from './sound-physics';
import { TeacherEvidence } from './teacher-evidence';
import { buildClassCognitionMap } from './inquiry-insights';
import { ClassroomWorkspace } from './classroom-workspace';
import { parsePlatformHash, platformHash, type PlatformDestination, type PlatformLocation } from './classroom-catalog';

type PersistenceStatus = 'checking' | 'saved' | 'failed' | 'recovery';

const STEPS: Array<{ phase: InquiryPhase; short: string; label: string }> = [
  { phase: 'prediction', short: '1', label: '预测' },
  { phase: 'plan', short: '2', label: '计划' },
  { phase: 'experiment', short: '3', label: '操作与记录' },
  { phase: 'conclusion', short: '4', label: '结论' },
  { phase: 'diagnosis', short: '5', label: '证据反馈' },
  { phase: 'verification', short: '6', label: '新情境验证' },
  { phase: 'complete', short: '7', label: '完成' },
];

const EVENT_LABELS: Record<string, string> = {
  session_started: '开始探究',
  prediction_submitted: '提交预测',
  plan_submitted: '记录变量计划',
  parameter_changed: '调整参数',
  evidence_recorded: '记录实验证据',
  evidence_removed: '移除实验记录',
  collection_completed: '完成证据采集',
  claim_submitted: '提交结论',
  diagnosis_emitted: '生成候选判断',
  intervention_delivered: '给出最小探究任务',
  intervention_accepted: '返回实验补证据',
  verification_started: '开始无提示验证',
  verification_completed: '提交迁移验证',
  verification_retry_started: '验证未通过，返回实验补证据',
  teacher_overridden: '教师复核机器判断',
};

const STATUS_COPY: Record<Diagnosis['status'], { label: string; tone: string }> = {
  supported: { label: '有多条证据支持', tone: 'attention' },
  possible: { label: '候选·仍需验证', tone: 'candidate' },
  insufficient: { label: '证据不足·暂不判断', tone: 'neutral' },
  resolved: { label: '本次未观察到困难', tone: 'resolved' },
};

const TEACHING_SUGGESTIONS: Record<string, { title: string; action: string }> = {
  P01_CONTROL_VARIABLE: {
    title: '重做一次“只改一个量”的全班对照',
    action: '展示两份无法归因的记录，让学生先判断哪个量应保持不变，再完成新的三组数据。',
  },
  P02_EVIDENCE_ALIGNMENT: {
    title: '用“结论—证据—理由”重组讲解',
    action: '要求每个结论明确指向两组记录，再说明数据的变化方向为何支持该结论。',
  },
  M01_OHM_CURRENT_CONSTANT: {
    title: '固定电阻，用成倍电压做反例实验',
    action: '先不给公式，让学生比较 U=2V 与 8V 时电流的方向和倍数。',
  },
  M02_LENS_SCREEN_POSITION: {
    title: '区分“像的位置”与“光屏是否清晰”',
    action: '固定物体和透镜，只移动光屏，记录清晰度而不改动光线交点。',
  },
  M03_LENS_DISTANCE_RELATION: {
    title: '将物距、像距和放大率按大小排序',
    action: '从证据本中选物距最大与最小的两组，先用箭头标变化方向，再提炼关系。',
  },
  M04_SOUND_LOUDNESS_PITCH: {
    title: '把响度和音调拆成两个独立观察量',
    action: '固定频率和波形，只改变数字响度；比较波幅和音调读数分别发生了什么变化。',
  },
  M05_SOUND_FREQUENCY_PITCH_RELATION: {
    title: '用同标尺波形比较频率与音调',
    action: '保持数字响度和波形不变，对照两个频率，先数相同时间内的周期数，再描述听到的音调。',
  },
};

const EXPERIMENT_ICONS: Record<ExperimentId, React.ReactNode> = {
  ohm: <Activity />,
  lens: <Lightbulb />,
  sound: <Volume2 />,
};

function waveformTypeFromCode(code: number): OscillatorType {
  return (['sine', 'triangle', 'square', 'sawtooth'] as const)[Math.round(code)] ?? 'sine';
}

const SOUND_WAVEFORM_CODES = {
  sine: 0,
  triangle: 1,
  square: 2,
  sawtooth: 3,
} as const;

function toSoundObservationInput(snapshot: SoundObservationSnapshot): SoundObservationInput {
  return {
    source: snapshot.source,
    capturedAt: snapshot.capturedAt,
    pitchHz: snapshot.pitchHz,
    dbfs: snapshot.dbfs,
    clarity: snapshot.clarity,
    centroidHz: snapshot.centroidHz,
    timeWindowMs: snapshot.timeWindowMs,
    verticalGain: snapshot.verticalGain,
    clipSlot: snapshot.clipSlot ?? null,
    generator: snapshot.generator
      ? {
          frequencyHz: snapshot.generator.frequencyHz,
          loudness: snapshot.generator.loudness,
          waveformCode: SOUND_WAVEFORM_CODES[snapshot.generator.waveform],
        }
      : null,
  };
}

function soundPeriodMs(frequency: unknown) {
  return typeof frequency === 'number' && Number.isFinite(frequency) && frequency > 0
    ? 1000 / frequency
    : null;
}

function soundMeasurementSource(measurement: InquirySession['measurements'][number]) {
  if (measurement.values.source === 'microphone') return '麦克风';
  if (measurement.values.source === 'generator') return measurement.values.clipSlot ? `发生器·片段${measurement.values.clipSlot}` : '示波器发生器';
  return '探究发生器';
}

function formatMeasurementSummary(session: InquirySession, measurement: InquirySession['measurements'][number]) {
  if (session.experimentId === 'ohm') {
    return `U ${formatNumber(measurement.values.voltage, 1)} V · R ${formatNumber(measurement.values.resistance, 0)} Ω · I ${formatNumber(measurement.values.current, 3)} A · P ${formatNumber(measurement.values.power, 2)} W`;
  }
  if (session.experimentId === 'lens') {
    return `u ${formatNumber(measurement.values.objectDistance, 1)} cm · f ${formatNumber(measurement.values.focalLength, 1)} cm · v ${formatNumber(measurement.values.imageDistance, 1)} cm · |m| ${formatMagnification(measurement.values.magnification)} · ${String(measurement.values.nature ?? '—')} · 光屏 ${formatNumber(measurement.values.screenPosition, 1)} cm（${lensScreenObservationText(measurement.values.imageDistance, measurement.values.screenPosition)}）`;
  }
  return `${soundMeasurementSource(measurement)} · f ${formatOptionalNumber(measurement.values.frequencyHz, 0)} Hz · T ${formatOptionalNumber(measurement.values.periodMs ?? soundPeriodMs(measurement.values.frequencyHz), 2)} ms · 音调 ${formatOptionalNumber(measurement.values.pitchHz, 0)} Hz · 响度 ${formatOptionalNumber(measurement.values.loudness, 0)} · A ${formatOptionalNumber(measurement.values.amplitude, 2)} · ${String(measurement.values.waveformLabel ?? '—')}`;
}

function replaceSession(state: WorkspaceState, session: InquirySession): WorkspaceState {
  return {
    ...state,
    sessions: state.sessions.map((item) => item.id === session.id ? session : item),
    activeSessionId: session.id,
  };
}

function formatNumber(value: unknown, digits = 2) {
  if (value === null || value === undefined) return '∞';
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return '—';
  return Number.isFinite(value) ? value.toFixed(digits) : '∞';
}

function formatOptionalNumber(value: unknown, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

const VERIFICATION_CHOICE_LABELS: Record<string, string> = {
  direct: '同方向且成正比',
  same: '保持不变',
  inverse: '反向变化',
  real_inverted_smaller: '实像、倒立、缩小',
  real_inverted_larger: '实像、倒立、放大',
  virtual_upright_larger: '虚像、正立、放大',
  screen_controls: '由光屏位置决定',
  higher_pitch: '音调升高',
  same_pitch: '音调不变',
  lower_pitch: '音调降低',
  loudness_controls_pitch: '响度决定音调',
};

function formatVerificationAnswer(session: InquirySession) {
  const result = session.verification;
  if (!result) return '尚未提交';
  const unit = session.experimentId === 'ohm' ? 'A' : session.experimentId === 'lens' ? 'cm' : 'Hz';
  return `${VERIFICATION_CHOICE_LABELS[result.answerChoice] ?? result.answerChoice} · ${formatOptionalNumber(result.numericAnswer, session.experimentId === 'ohm' ? 2 : 0)} ${unit}`;
}

function formatMagnification(value: unknown) {
  if (value === null || value === undefined) return '—';
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.abs(value).toFixed(2)
    : '—';
}

function lensImageSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '无有限像';
  const magnitude = Math.abs(value);
  if (magnitude > 1.01) return '放大';
  if (magnitude < 0.99) return '缩小';
  return '等大';
}

function lensScreenObservation(imageDistance: unknown, screenPosition: unknown) {
  if (imageDistance === null) {
    return { label: '平行光', detail: '焦点处无有限像' };
  }
  if (typeof imageDistance !== 'number' || !Number.isFinite(imageDistance)) {
    return { label: '—', detail: '缺少像距数据' };
  }
  if (imageDistance < 0) {
    return { label: '不可承接', detail: '虚像不能投到光屏' };
  }
  if (typeof screenPosition !== 'number' || !Number.isFinite(screenPosition)) {
    return { label: '—', detail: '缺少光屏位置' };
  }
  const offset = Math.abs(imageDistance - screenPosition);
  return offset < 1
    ? { label: '清晰', detail: `偏差 ${offset.toFixed(1)} cm` }
    : { label: '模糊', detail: `偏差 ${offset.toFixed(1)} cm` };
}

function lensScreenObservationText(imageDistance: unknown, screenPosition: unknown) {
  const observation = lensScreenObservation(imageDistance, screenPosition);
  return `${observation.label} · ${observation.detail}`;
}

function phaseIndex(phase: InquiryPhase) {
  return STEPS.findIndex((step) => step.phase === phase);
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }> | readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="iq-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="iq-range-control">
      <div className="iq-range-head">
        <label htmlFor={`range-${label}`}>{label}</label>
        <div className="iq-number-unit">
          <input
            aria-label={`${label}数值`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) onChange(Math.max(min, Math.min(max, parsed)));
            }}
          />
          <span>{unit}</span>
        </div>
      </div>
      <input
        id={`range-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function StepRail({ phase }: { phase: InquiryPhase }) {
  const current = phaseIndex(phase);
  return (
    <nav className="iq-step-rail" aria-label="探究进度">
      {STEPS.map((step, index) => (
        <div
          key={step.phase}
          className={`iq-step ${index === current ? 'is-current' : ''} ${index < current ? 'is-done' : ''}`}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="iq-step-number">{index < current ? <Check aria-hidden="true" /> : step.short}</span>
          <span>{step.label}</span>
        </div>
      ))}
    </nav>
  );
}

function StatusChip({ status }: { status: Diagnosis['status'] }) {
  const copy = STATUS_COPY[status];
  return <span className={`iq-status iq-status-${copy.tone}`}>{copy.label}</span>;
}

function StartPanel({
  sessions,
  policy,
  onStart,
  onContinue,
}: {
  sessions: InquirySession[];
  policy: ClassPolicy;
  onStart: (alias: string, experimentId: ExperimentId) => void;
  onContinue: (sessionId: string) => void;
}) {
  const [alias, setAlias] = useState('');
  const [experiment, setExperiment] = useState<ExperimentId>('ohm');
  const recent = sessions.filter((session) => session.dataOrigin !== 'demo').slice(-3).reverse();
  return (
    <section className="iq-start-layout">
      <div className="iq-start-copy">
        <p className="iq-kicker">学生探究 · 学习证据</p>
        <h1>先提出猜想，再用实验验证</h1>
        <p>选择一个探究任务，记录预测、变量方案和实验数据。系统在结论提交后给出证据反馈，最后用新情境检验理解。</p>
        <div className="iq-principles">
          <span><Eye />先观察，不泄露规律</span>
          <span><ShieldCheck />证据不足时拒判</span>
          <span><ClipboardCheck />用新情境再验证</span>
        </div>
      </div>

      <form
        className="iq-start-card"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(alias, experiment);
        }}
      >
        <div className="iq-card-title">
          <span className="iq-icon-box"><FlaskConical /></span>
          <div><small>新建探究会话</small><h2>选择探究任务</h2></div>
        </div>
        <label className="iq-field">
          <span>学生称呼（可用化名）</span>
          <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="例：小林" />
        </label>
        <div className="iq-experiment-options" role="radiogroup" aria-label="选择实验">
          {(Object.keys(EXPERIMENTS) as ExperimentId[]).map((id) => {
            const item = EXPERIMENTS[id];
            return (
              <label key={id} className={`iq-experiment-option ${experiment === id ? 'is-selected' : ''}`}>
                <input type="radio" name="experiment" value={id} checked={experiment === id} onChange={() => setExperiment(id)} />
                <span>{EXPERIMENT_ICONS[id]}</span>
                <strong>{item.title}</strong>
                <small>{item.question}</small>
              </label>
            );
          })}
        </div>
        <div className="iq-policy-note"><Sparkles />当前策略：{policy.automationMode === 'observe' ? '仅观察' : policy.automationMode === 'low' ? '低干预' : '引导学习'}，最多 {policy.maxHintsPerSession} 次提示</div>
        <button className="iq-button iq-button-primary iq-button-wide" type="submit">开始探究 <ArrowRight /></button>
      </form>

      {recent.length > 0 && (
        <div className="iq-recent-card">
          <div><small>最近会话</small><h2>继续上次探究</h2></div>
          <div className="iq-recent-list">
            {recent.map((session) => (
              <button key={session.id} type="button" onClick={() => onContinue(session.id)}>
                <span><strong>{session.studentAlias}</strong><small>{EXPERIMENTS[session.experimentId].title} · {phaseLabel(session.phase)}</small></span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PredictionTask({ session, onSubmit }: { session: InquirySession; onSubmit: (choice: string, reason: string) => void }) {
  const experiment = EXPERIMENTS[session.experimentId];
  const [choice, setChoice] = useState(session.predictionChoice);
  const [reason, setReason] = useState(session.predictionReason);
  return (
    <form className="iq-task-form" onSubmit={(event) => { event.preventDefault(); onSubmit(choice, reason); }}>
      <p className="iq-task-step">01 · 提出预测</p>
      <h2 id="current-task-title">先别动装置</h2>
      <p>{experiment.question}</p>
      <fieldset className="iq-choice-list">
        <legend className="sr-only">预测选项</legend>
        {experiment.predictionOptions.map((option) => (
          <label key={option.value} className={choice === option.value ? 'is-selected' : ''}>
            <input type="radio" name="prediction" value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="iq-field">
        <span>我这样预测是因为……</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="用一句话写下你现在的想法" />
      </label>
      <button className="iq-button iq-button-primary" type="submit">锁定预测并继续 <ArrowRight /></button>
      <p className="iq-form-footnote">预测不按对错阻断，原始版本会被保留。</p>
    </form>
  );
}

function PlanTask({ session, onSubmit }: { session: InquirySession; onSubmit: (plan: InquiryPlan) => void }) {
  const [plan, setPlan] = useState<InquiryPlan>(session.plan);
  const options = [...EXPERIMENTS[session.experimentId].variables];
  const set = (key: keyof InquiryPlan, value: string) => setPlan((current) => ({ ...current, [key]: value }));
  return (
    <form className="iq-task-form" onSubmit={(event) => { event.preventDefault(); onSubmit(plan); }}>
      <p className="iq-task-step">02 · 设计实验</p>
      <h2 id="current-task-title">用一次对照说清因果</h2>
      <p>先分配变量角色。计划会与你后面的实际操作一起分析。</p>
      <div className="iq-sentence-plan">
        <span>我要改变</span>
        <SelectField label="自变量" value={plan.independent} options={options} onChange={(value) => set('independent', value)} />
        <span>保持不变</span>
        <SelectField label="控制变量" value={plan.control} options={options} onChange={(value) => set('control', value)} />
        <span>并测量</span>
        <SelectField label="因变量" value={plan.dependent} options={options} onChange={(value) => set('dependent', value)} />
      </div>
      <div className="iq-callout iq-callout-neutral"><Eye />诊断探究允许不完善的计划进入实验，系统不会在这里透露标准方案。</div>
      <button className="iq-button iq-button-primary" type="submit">记录计划并打开装置 <ArrowRight /></button>
    </form>
  );
}

function ExperimentTask({ session, onCapture, onFinish, onRevisePlan }: { session: InquirySession; onCapture: () => void; onFinish: () => void; onRevisePlan: (plan: InquiryPlan) => void }) {
  const [draftPlan, setDraftPlan] = useState(session.plan);
  const options = [...EXPERIMENTS[session.experimentId].variables];
  const latestAccepted = [...session.interventions].reverse().find((item) => item.acceptedAt !== null && item.closedAt === null);
  const activeProbe = latestAccepted && !hasCompletedInterventionProbe(session, latestAccepted) ? latestAccepted : null;
  return (
    <div className="iq-task-form">
      <p className="iq-task-step">03 · 操作与记录</p>
      <h2 id="current-task-title">收集可比较的证据</h2>
      <p>调整中间的实验装置，每确定一组条件就主动记录。只有拖动不算证据。</p>
      <div className="iq-evidence-counter">
        <span>{session.measurements.length}</span>
        <div><strong>已记录组数</strong><small>需要至少 3 个不同自变量取值</small></div>
      </div>
      <details className="iq-plan-revision">
        <summary>查看或修订我的变量计划</summary>
        <p>原计划会保留在操作轨迹中。新方案完成后，可从证据本移除不适用的记录再补充对照。</p>
        {(['independent', 'dependent', 'control'] as const).map((key) => (
          <SelectField key={key} label={key === 'independent' ? '自变量' : key === 'dependent' ? '因变量' : '控制变量'} value={draftPlan[key]} options={options} onChange={(value) => setDraftPlan((current) => ({ ...current, [key]: value }))} />
        ))}
        <button className="iq-button iq-button-outline" type="button" onClick={() => onRevisePlan(draftPlan)}>记录修订方案</button>
      </details>
      {activeProbe && (
        <div className="iq-callout iq-callout-action">
          <Sparkles />
          <div><strong>{activeProbe.id.startsWith('int_teacher') ? '教师要求的补充证据' : '当前最小探究任务'}</strong><p>{activeProbe.prompt}</p></div>
        </div>
      )}
      <button className="iq-button iq-button-primary iq-button-wide" type="button" onClick={onCapture}>
        <BookOpenCheck />记录当前这一组
      </button>
      <button className="iq-button iq-button-outline iq-button-wide" type="button" onClick={onFinish}>
        我的数据已够，开始写结论
      </button>
      <p className="iq-form-footnote">系统会检查取值覆盖和控制变量，但不会替你下结论。</p>
    </div>
  );
}

function ConclusionTask({ session, onSubmit }: { session: InquirySession; onSubmit: (choice: string, text: string, confidence: number, evidenceIds: string[]) => void }) {
  const experiment = EXPERIMENTS[session.experimentId];
  const [choice, setChoice] = useState(session.conclusionChoice);
  const [text, setText] = useState(session.conclusionText);
  const [confidence, setConfidence] = useState(session.conclusionConfidence);
  const availableMeasurementIds = new Set(session.measurements.map((measurement) => measurement.id));
  const [evidenceIds, setEvidenceIds] = useState(
    session.conclusionEvidenceIds.filter((measurementId) => availableMeasurementIds.has(measurementId)),
  );
  const toggleEvidence = (measurementId: string) => {
    setEvidenceIds((current) => current.includes(measurementId)
      ? current.filter((item) => item !== measurementId)
      : [...current, measurementId]);
  };
  return (
    <form className="iq-task-form" onSubmit={(event) => { event.preventDefault(); onSubmit(choice, text, confidence, evidenceIds); }}>
      <p className="iq-task-step">04 · 形成结论</p>
      <h2 id="current-task-title">先写出你的发现</h2>
      <p>只使用下方证据本中的记录。提交后系统才会给出证据反馈。</p>
      <fieldset className="iq-choice-list">
        <legend className="sr-only">结论选项</legend>
        {experiment.conclusionOptions.map((option) => (
          <label key={option.value} className={choice === option.value ? 'is-selected' : ''}>
            <input type="radio" name="conclusion" value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="iq-citation-picker">
        <legend>选择支撑结论的实验记录 <span>{evidenceIds.length} / 至少 2 组</span></legend>
        <div>
          {session.measurements.map((measurement, index) => {
            const selected = evidenceIds.includes(measurement.id);
            return (
              <label key={measurement.id} className={selected ? 'is-selected' : ''}>
                <input type="checkbox" checked={selected} onChange={() => toggleEvidence(measurement.id)} />
                <strong>#{index + 1}</strong>
                <span>{formatMeasurementSummary(session, measurement)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="iq-field">
        <span>解释这些记录为什么支持你的结论</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="例：我比较了第1组和第3组，控制……不变，发现……" />
      </label>
      <div className="iq-confidence">
        <div><span>我对结论的把握</span><strong>{confidence}%</strong></div>
        <input type="range" min="0" max="100" step="5" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} />
      </div>
      <button className="iq-button iq-button-primary" type="submit">提交结论，查看证据反馈 <ArrowRight /></button>
    </form>
  );
}

function FeedbackTask({
  session,
  onAcceptIntervention,
  onVerify,
}: {
  session: InquirySession;
  onAcceptIntervention: () => void;
  onVerify: () => void;
}) {
  const activeIntervention = [...session.interventions].reverse().find((item) => item.acceptedAt === null && item.closedAt === null);
  return (
    <div className="iq-task-form">
      <p className="iq-task-step">05 · 证据反馈</p>
      <h2 id="current-task-title">系统如何理解这次探究</h2>
      <p>下面是可回到原始记录核对的候选判断，不是对你的永久标签。</p>
      <div className="iq-feedback-list">
        {session.diagnoses.map((item) => (
          <article key={item.id} className="iq-feedback-card">
            <StatusChip status={item.status} />
            <h3>{item.label}</h3>
            <p>{item.summary}</p>
            <small>依据 {item.evidenceRefs.length + item.counterEvidenceRefs.length} 条 · 可信度 {confidenceBand(item.confidence)}</small>
          </article>
        ))}
      </div>
      {activeIntervention && (
        <div className="iq-callout iq-callout-action">
          <Sparkles />
          <div><strong>一个最小的再探究任务</strong><p>{activeIntervention.prompt}</p></div>
        </div>
      )}
      {activeIntervention && (
        <button className="iq-button iq-button-primary iq-button-wide" type="button" onClick={onAcceptIntervention}>
          <RotateCcw />回到装置补一组证据
        </button>
      )}
      <button className="iq-button iq-button-outline iq-button-wide" type="button" onClick={onVerify}>
        进入无提示新情境验证 <ArrowRight />
      </button>
    </div>
  );
}

function VerificationTask({ session, onSubmit }: { session: InquirySession; onSubmit: (choice: string, value: number | null, explanation: string) => void }) {
  const [choice, setChoice] = useState('');
  const [value, setValue] = useState('');
  const [explanation, setExplanation] = useState('');
  const isOhm = session.experimentId === 'ohm';
  const isLens = session.experimentId === 'lens';
  return (
    <form className="iq-task-form" onSubmit={(event) => { event.preventDefault(); onSubmit(choice, value === '' ? null : Number(value), explanation); }}>
      <p className="iq-task-step">06 · 新情境验证</p>
      <h2 id="current-task-title">这一题不再显示提示</h2>
      {isOhm ? (
        <>
          <div className="iq-transfer-case"><small>新电阻情境</small><strong>R = 15 Ω，U = 6 V</strong><p>预测电流大小，并判断 U 增大时 I 的变化方向。</p></div>
          <SelectField label="关系判断" value={choice} onChange={setChoice} options={[
            { value: 'direct', label: 'U 增大，I 也增大' },
            { value: 'same', label: 'U 改变，I 不变' },
            { value: 'inverse', label: 'U 增大，I 减小' },
          ]} />
          <label className="iq-field"><span>电流 I（A）</span><input type="number" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} /></label>
        </>
      ) : isLens ? (
        <>
          <div className="iq-transfer-case"><small>新焦距情境</small><strong>f = 10 cm，u = 30 cm</strong><p>判断像的性质，并计算像距。</p></div>
          <SelectField label="像的性质" value={choice} onChange={setChoice} options={[
            { value: 'real_inverted_smaller', label: '实像·倒立·缩小' },
            { value: 'real_inverted_larger', label: '实像·倒立·放大' },
            { value: 'virtual_upright_larger', label: '虚像·正立·放大' },
            { value: 'screen_controls', label: '由光屏位置决定' },
          ]} />
          <label className="iq-field"><span>像距 v（cm）</span><input type="number" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} /></label>
        </>
      ) : (
        <>
          <div className="iq-transfer-case"><small>新波形读图情境</small><strong>参考声 A：440 Hz；声 B：周期约 1.14 ms</strong><p>两者都是正弦波且数字响度相同。判断声 B 的音调，并由周期估算频率。</p></div>
          <SelectField label="音调判断" value={choice} onChange={setChoice} options={[
            { value: 'higher_pitch', label: '声 B 的音调更高' },
            { value: 'same_pitch', label: '两者音调相同' },
            { value: 'lower_pitch', label: '声 B 的音调更低' },
            { value: 'loudness_controls_pitch', label: '响度相同，所以音调相同' },
          ]} />
          <label className="iq-field"><span>声 B 的频率 f（Hz）</span><input type="number" min="50" max="2000" step="1" value={value} onChange={(event) => setValue(event.target.value)} /></label>
        </>
      )}
      <label className="iq-field"><span>简要说明判断依据</span><textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
      <button className="iq-button iq-button-primary" type="submit">提交独立验证</button>
    </form>
  );
}

function CompletionTask({ session, onNew, onRetry }: { session: InquirySession; onNew: () => void; onRetry: () => void }) {
  const result = session.verification;
  return (
    <div className="iq-task-form iq-complete-card">
      <span className={`iq-complete-icon ${result?.passed ? 'is-passed' : ''}`}>{result?.passed ? <Check /> : <ListChecks />}</span>
      <p className="iq-task-step">07 · 本次探究已归档</p>
      <h2 id="current-task-title">{result?.passed ? '无提示新情境验证通过' : '新情境还需要巩固'}</h2>
      <p>{result?.feedback}</p>
      <div className="iq-result-detail"><span>参考结果</span><strong>{result?.expected}</strong></div>
      <p className="iq-form-footnote">这个结果只描述本次表现，不作为对学生能力的永久标签。</p>
      {!result?.passed && <button className="iq-button iq-button-primary iq-button-wide" type="button" onClick={onRetry}><RotateCcw />返回装置补证据</button>}
      <button className={`iq-button ${result?.passed ? 'iq-button-primary' : 'iq-button-outline'} iq-button-wide`} type="button" onClick={onNew}>开始另一次探究</button>
    </div>
  );
}

function CurrentTask({
  session,
  policy,
  apply,
  onNew,
  onRetry,
}: {
  session: InquirySession;
  policy: ClassPolicy;
  apply: (result: TransitionResult) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  if (session.phase === 'prediction') return <PredictionTask session={session} onSubmit={(choice, reason) => apply(submitPrediction(session, choice, reason))} />;
  if (session.phase === 'plan') return <PlanTask session={session} onSubmit={(plan) => apply(submitPlan(session, plan))} />;
  if (session.phase === 'experiment') return <ExperimentTask session={session} onCapture={() => apply(captureMeasurement(session))} onFinish={() => apply(finishCollection(session))} onRevisePlan={(plan) => apply(submitPlan(session, plan))} />;
  if (session.phase === 'conclusion') return <ConclusionTask session={session} onSubmit={(choice, text, confidence, evidenceIds) => apply(submitConclusion(session, choice, text, confidence, policy, evidenceIds))} />;
  if (session.phase === 'diagnosis') return <FeedbackTask session={session} onAcceptIntervention={() => apply(acceptLatestIntervention(session))} onVerify={() => apply(beginVerification(session))} />;
  if (session.phase === 'verification') return <VerificationTask session={session} onSubmit={(choice, value, explanation) => apply(submitVerification(session, choice, value, explanation))} />;
  return <CompletionTask session={session} onNew={onNew} onRetry={onRetry} />;
}

function SoundInquiryInstrument({
  session,
  update,
}: {
  session: InquirySession;
  update: (session: InquirySession) => void;
}) {
  const locked = session.phase !== 'experiment';
  const reading = calculateSound(session.parameters);
  const periodMs = 1000 / reading.frequencyHz;
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState('');

  const disposeAudio = useCallback(() => {
    try {
      oscillatorRef.current?.stop();
      oscillatorRef.current?.disconnect();
      gainRef.current?.disconnect();
    } catch {
      // The oscillator may already have stopped during view or phase changes.
    }
    oscillatorRef.current = null;
    gainRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close();
  }, []);

  const stop = useCallback(() => {
    disposeAudio();
    setIsPlaying(false);
  }, [disposeAudio]);

  useEffect(() => {
    return disposeAudio;
  }, [disposeAudio]);

  useEffect(() => {
    if (!locked) return undefined;
    disposeAudio();
    const timeout = window.setTimeout(() => setIsPlaying(false), 0);
    return () => window.clearTimeout(timeout);
  }, [disposeAudio, locked]);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    oscillatorRef.current?.frequency.setTargetAtTime(reading.frequencyHz, context.currentTime, 0.012);
    if (oscillatorRef.current) oscillatorRef.current.type = waveformTypeFromCode(reading.waveformCode);
    gainRef.current?.gain.setTargetAtTime(gainFromLoudness(reading.loudness) * 0.6, context.currentTime, 0.018);
  }, [reading.frequencyHz, reading.loudness, reading.waveformCode]);

  const play = async () => {
    if (locked || isPlaying || audioContextRef.current) return;
    setAudioError('');
    try {
      const context = new AudioContext({ latencyHint: 'interactive' });
      audioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = waveformTypeFromCode(reading.waveformCode);
      oscillator.frequency.value = reading.frequencyHz;
      gain.gain.value = gainFromLoudness(reading.loudness) * 0.6;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillatorRef.current = oscillator;
      gainRef.current = gain;
      setIsPlaying(true);
    } catch {
      setAudioError('浏览器暂时无法播放，请检查音频设备后重试。');
      stop();
    }
  };

  return (
    <section className={`iq-instrument ${locked ? 'is-locked' : ''}`} aria-label="频率与音调实验装置" data-disabled={locked || undefined}>
      <div className="iq-instrument-head">
        <div><small>SIGNAL &amp; SCOPE</small><h2>声音发生与波形观测台</h2></div>
        <output className={`iq-live-dot ${isPlaying ? 'is-playing' : ''}`}><i />{isPlaying ? '正在发声' : '数字信号待机'}</output>
      </div>
      <SoundVisual frequencyHz={reading.frequencyHz} loudness={reading.loudness} waveformCode={reading.waveformCode} />
      <div className="iq-meter-strip iq-meter-strip-sound" aria-live="polite">
        <div><span>f</span><strong>{reading.frequencyHz.toFixed(0)}</strong><small>Hz</small></div>
        <div><span>T</span><strong>{periodMs.toFixed(2)}</strong><small>ms</small></div>
        <div><span>A</span><strong>{reading.amplitude.toFixed(2)}</strong><small>相对值</small></div>
        <div><span>波形</span><strong>{reading.waveformLabel}</strong><small>{reading.nature}</small></div>
      </div>
      <div className="iq-controls">
        <RangeControl label="频率 f" value={reading.frequencyHz} min={100} max={1200} step={20} unit="Hz" disabled={locked} onChange={(value) => update(changeParameter(session, 'frequencyHz', value))} />
        <RangeControl label="数字响度" value={reading.loudness} min={0} max={60} step={5} unit="/ 100" disabled={locked} onChange={(value) => update(changeParameter(session, 'loudness', value))} />
      </div>
      <fieldset className="iq-waveform-control" disabled={locked}>
        <legend>波形（音色）</legend>
        <div>
          {SOUND_WAVEFORMS.map((waveform) => (
            <button
              key={waveform.code}
              type="button"
              className={reading.waveformCode === waveform.code ? 'is-selected' : ''}
              aria-pressed={reading.waveformCode === waveform.code}
              onClick={() => update(changeParameter(session, 'waveformCode', waveform.code))}
            >
              <strong>{waveform.label}</strong><small>{waveform.nature}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="iq-sound-playback">
        <button className={`iq-button ${isPlaying ? 'iq-button-outline' : 'iq-button-primary'}`} type="button" disabled={locked} aria-pressed={isPlaying} onClick={() => isPlaying ? stop() : void play()}>
          {isPlaying ? <><Square />停止声音</> : <><Volume2 />播放当前声音</>}
        </button>
        <p>数字响度不是声压级；请先调低系统音量。独立声音示波器可进行麦克风采集与 A/B 录制。</p>
      </div>
      {audioError && <div className="iq-callout iq-callout-neutral" role="alert"><CircleAlert />{audioError}</div>}
      {locked && <div className="iq-instrument-lock"><Eye />完成当前任务后开放参数与播放</div>}
    </section>
  );
}

function InstrumentPanel({ session, update }: { session: InquirySession; update: (session: InquirySession) => void }) {
  const locked = session.phase !== 'experiment';
  if (session.experimentId === 'ohm') {
    const reading = calculateOhm(session.parameters);
    return (
      <section className={`iq-instrument ${locked ? 'is-locked' : ''}`} aria-label="欧姆定律实验装置">
        <div className="iq-instrument-head">
          <div><small>LIVE APPARATUS</small><h2>电流与电压实验台</h2></div>
          <span className="iq-live-dot"><i />仪表模拟</span>
        </div>
        <OhmVisual voltage={reading.voltage} resistance={reading.resistance} />
        <div className="iq-meter-strip">
          <div><span>U</span><strong>{reading.voltage.toFixed(1)}</strong><small>V</small></div>
          <div><span>I</span><strong>{reading.current.toFixed(3)}</strong><small>A</small></div>
          <div><span>R</span><strong>{reading.resistance.toFixed(0)}</strong><small>Ω</small></div>
          <div><span>P</span><strong>{reading.power.toFixed(2)}</strong><small>W</small></div>
        </div>
        <div className="iq-controls">
          <RangeControl label="电压 U" value={reading.voltage} min={0} max={12} step={1} unit="V" disabled={locked} onChange={(value) => update(changeParameter(session, 'voltage', value))} />
          <RangeControl label="电阻 R" value={reading.resistance} min={10} max={60} step={5} unit="Ω" disabled={locked} onChange={(value) => update(changeParameter(session, 'resistance', value))} />
        </div>
        {locked && <div className="iq-instrument-lock"><Eye />完成当前任务后开放参数操作</div>}
      </section>
    );
  }
  if (session.experimentId === 'sound') {
    return <SoundInquiryInstrument session={session} update={update} />;
  }
  const reading = calculateLens(session.parameters);
  const imageDistance = reading.imageDistance;
  const screenPosition = session.parameters.screenPosition ?? 20;
  const screenObservation = lensScreenObservation(imageDistance, screenPosition);
  return (
    <section className={`iq-instrument ${locked ? 'is-locked' : ''}`} aria-label="凸透镜成像实验装置">
      <div className="iq-instrument-head">
        <div><small>RAY BENCH</small><h2>凸透镜光路实验台</h2></div>
        <span className="iq-live-dot"><i />几何光学模型</span>
      </div>
      <LensVisual focalLength={reading.focalLength} objectDistance={reading.objectDistance} screenPosition={screenPosition} />
      <div className="iq-meter-strip iq-meter-strip-lens">
        <div><span>u</span><strong>{reading.objectDistance.toFixed(1)}</strong><small>cm</small></div>
        <div><span>f</span><strong>{reading.focalLength.toFixed(1)}</strong><small>cm</small></div>
        <div><span>v</span><strong>{formatNumber(imageDistance, 1)}</strong><small>cm</small></div>
        <div><span>|m|</span><strong>{formatMagnification(reading.magnification)}</strong><small>{lensImageSize(reading.magnification)}</small></div>
        <div><span>光屏</span><strong>{screenObservation.label}</strong><small>{screenObservation.detail}</small></div>
      </div>
      <div className="iq-controls iq-controls-three">
        <RangeControl label="物距 u" value={reading.objectDistance} min={5} max={50} step={1} unit="cm" disabled={locked} onChange={(value) => update(changeParameter(session, 'objectDistance', value))} />
        <RangeControl label="焦距 f" value={reading.focalLength} min={6} max={15} step={1} unit="cm" disabled={locked} onChange={(value) => update(changeParameter(session, 'focalLength', value))} />
        <RangeControl label="光屏位置" value={screenPosition} min={5} max={50} step={1} unit="cm" disabled={locked} onChange={(value) => update(changeParameter(session, 'screenPosition', value))} />
      </div>
      {locked && <div className="iq-instrument-lock"><Eye />完成当前任务后开放参数操作</div>}
    </section>
  );
}

function EvidenceNotebook({ session, onRemove }: { session: InquirySession; onRemove: (id: string) => void }) {
  const isOhm = session.experimentId === 'ohm';
  const isLens = session.experimentId === 'lens';
  return (
    <section className="iq-notebook">
      <div className="iq-section-head">
        <div><small>EVIDENCE NOTEBOOK</small><h2>学习证据本</h2></div>
        <span>{session.measurements.length} 组主动记录</span>
      </div>
      {session.measurements.length === 0 ? (
        <div className="iq-empty-state"><BookOpenCheck /><strong>还没有实验记录</strong><p>完成预测和计划后，在装置中调整参数并点击“记录当前这一组”。</p></div>
      ) : (
        <div className="iq-table-wrap">
          <table>
            <caption className="sr-only">{EXPERIMENTS[session.experimentId].title}实验记录</caption>
            <thead><tr>{isOhm ? <><th>#</th><th>U / V</th><th>R / Ω</th><th>I / A</th><th>P / W</th></> : isLens ? <><th>#</th><th>u / cm</th><th>f / cm</th><th>v / cm</th><th>|m| / 倍</th><th>像的大小</th><th>像的性质</th><th>光屏 / cm</th><th>光屏观察</th></> : <><th>#</th><th>来源</th><th>f / Hz</th><th>T / ms</th><th>音调读数 / Hz</th><th>数字响度</th><th>相对振幅</th><th>波形</th><th>音色 / 传感器摘要</th></>}<th><span className="sr-only">操作</span></th></tr></thead>
            <tbody>
              {session.measurements.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  {isOhm ? (
                    <><td>{formatNumber(row.values.voltage, 1)}</td><td>{formatNumber(row.values.resistance, 0)}</td><td>{formatNumber(row.values.current, 3)}</td><td>{formatNumber(row.values.power, 2)}</td></>
                  ) : isLens ? (
                    <>
                      <td>{formatNumber(row.values.objectDistance, 1)}</td>
                      <td>{formatNumber(row.values.focalLength, 1)}</td>
                      <td>{formatNumber(row.values.imageDistance, 1)}</td>
                      <td>{formatMagnification(row.values.magnification)}</td>
                      <td>{lensImageSize(row.values.magnification)}</td>
                      <td>{String(row.values.nature)}</td>
                      <td>{formatNumber(row.values.screenPosition, 1)}</td>
                      <td>{lensScreenObservationText(row.values.imageDistance, row.values.screenPosition)}</td>
                    </>
                  ) : (
                    <>
                      <td>{soundMeasurementSource(row)}</td>
                      <td>{formatOptionalNumber(row.values.frequencyHz, 0)}</td>
                      <td>{formatOptionalNumber(row.values.periodMs ?? soundPeriodMs(row.values.frequencyHz), 2)}</td>
                      <td>{formatOptionalNumber(row.values.pitchHz, 0)}</td>
                      <td>{row.values.loudness === null ? '未标定' : `${formatOptionalNumber(row.values.loudness, 0)} / 100`}</td>
                      <td>{formatOptionalNumber(row.values.amplitude, 2)}</td>
                      <td>{String(row.values.waveformLabel ?? '—')}</td>
                      <td>{String(row.values.nature ?? '—')}{typeof row.values.sensorDbfs === 'number' ? ` · ${row.values.sensorDbfs.toFixed(1)} dBFS · 清晰度 ${Math.round(Number(row.values.clarity ?? 0) * 100)}%` : ''}</td>
                    </>
                  )}
                  <td><button type="button" className="iq-icon-button" aria-label={`删除第 ${index + 1} 组记录`} onClick={() => onRemove(row.id)} disabled={session.phase !== 'experiment'}><X /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StudentWorkspace({
  state,
  setState,
  setNotice,
}: {
  state: WorkspaceState;
  setState: React.Dispatch<React.SetStateAction<WorkspaceState>>;
  setNotice: (message: string) => void;
}) {
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  const update = (next: InquirySession, message?: string) => {
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.id === next.id ? next : item),
    }));
    if (message) setNotice(message);
  };
  const apply = (result: TransitionResult) => {
    if (result.ok) setState((current) => replaceSession(current, result.session));
    setNotice(result.message);
  };
  if (!session) {
    return <StartPanel sessions={state.sessions} policy={state.policy} onContinue={(id) => setState((current) => ({ ...current, activeSessionId: id }))} onStart={(alias, experimentId) => {
      const next = createSession(alias, experimentId, state.policy);
      setState((current) => ({ ...current, sessions: [...current.sessions, next], activeSessionId: next.id }));
      setNotice('新探究已建立，预测阶段不显示规律性提示。');
    }} />;
  }
  return (
    <>
      <div className="iq-session-bar">
        <div>
          <span className="iq-origin-chip">{session.dataOrigin === 'demo' ? '演示数据' : '本机学生'}</span>
          <strong>{session.studentAlias}</strong>
          <span>{EXPERIMENTS[session.experimentId].title}</span>
        </div>
        <button className="iq-button iq-button-ghost" type="button" onClick={() => setState((current) => ({ ...current, activeSessionId: null }))}>退出当前会话</button>
      </div>
      <StepRail phase={session.phase} />
      <div className="iq-workbench">
        <aside className="iq-task-card" aria-labelledby="current-task-title">
          <CurrentTask session={session} policy={state.policy} apply={apply} onNew={() => setState((current) => ({ ...current, activeSessionId: null }))} onRetry={() => apply(retryAfterFailedVerification(session))} />
        </aside>
        <InstrumentPanel session={session} update={(next) => update(next)} />
      </div>
      <EvidenceNotebook session={session} onRemove={(id) => update(removeMeasurement(session, id), '该组记录已移出证据本。')} />
    </>
  );
}

function Metric({ icon, value, label, note }: { icon: React.ReactNode; value: string | number; label: string; note: string }) {
  return <article className="iq-metric"><span>{icon}</span><div><strong>{value}</strong><p>{label}</p><small>{note}</small></div></article>;
}

function TeacherWorkspace({
  state,
  setState,
  setNotice,
  onOpenStudentSession,
}: {
  state: WorkspaceState;
  setState: React.Dispatch<React.SetStateAction<WorkspaceState>>;
  setNotice: (message: string) => void;
  onOpenStudentSession: (sessionId: string) => void;
}) {
  const [dataScope, setDataScope] = useState<'local' | 'demo' | 'all'>('local');
  const [experimentScope, setExperimentScope] = useState<ExperimentId | 'all'>('all');
  const scopedSessions = useMemo(() => state.sessions.filter((session) => (
    (dataScope === 'all' || session.dataOrigin === dataScope)
    && (experimentScope === 'all' || session.experimentId === experimentScope)
  )), [state.sessions, dataScope, experimentScope]);
  const summary = useMemo(() => summarizeSessions(scopedSessions), [scopedSessions]);
  const cognitionMap = useMemo(() => buildClassCognitionMap(scopedSessions), [scopedSessions]);
  const demoCount = state.sessions.filter((session) => session.dataOrigin === 'demo').length;
  const localCount = state.sessions.length - demoCount;
  const [selectedId, setSelectedId] = useState<string | null>(state.sessions.at(-1)?.id ?? null);
  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>({});
  const selected = scopedSessions.find((session) => session.id === selectedId) ?? scopedSessions[0];
  const phases = STEPS.map((step) => ({ ...step, count: scopedSessions.filter((session) => session.phase === step.phase).length }));
  const suggestions = summary.diagnosisCounts
    .flatMap((item) => {
      const suggestion = TEACHING_SUGGESTIONS[item.code];
      return suggestion ? [{ ...item, suggestion }] : [];
    })
    .slice(0, 3);
  const updatePolicy = (patch: Partial<ClassPolicy>) => setState((current) => ({ ...current, policy: { ...current.policy, ...patch } }));
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `physics-inquiry-evidence-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('证据数据已导出为 JSON，原始事件与教师复核均已保留。');
  };
  const override = (diagnosisCode: string, verdict: 'confirm' | 'reject' | 'insufficient') => {
    if (!selected) return;
    const diagnosisItem = selected.diagnoses.find((item) => item.code === diagnosisCode);
    if (!diagnosisItem) return;
    const next = applyTeacherOverride(selected, diagnosisCode, verdict, teacherNotes[diagnosisItem.id] ?? '');
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((item) => item.id === next.id ? next : item),
    }));
    setTeacherNotes((current) => {
      const updated = { ...current };
      delete updated[diagnosisItem.id];
      return updated;
    });
    setNotice('教师复核已追加到事件时间线，机器原判未被删除。');
  };
  return (
    <div className="iq-teacher-layout">
      <section className="iq-teacher-intro">
        <div><p className="iq-kicker">Teacher OS · 本机学习证据</p><h1>教师工作台</h1><p>查看学生的探究过程、证据与待复核判断。数据仅保存在本机，不生成学生排名。</p></div>
        <div className="iq-teacher-actions">
          <button className="iq-button iq-button-outline" type="button" onClick={() => {
            const demos = createDemoSessions(state.policy);
            setState((current) => {
              const retained = current.sessions.filter((item) => item.dataOrigin !== 'demo');
              return {
                ...current,
                sessions: [...retained, ...demos],
                activeSessionId: retained.some((item) => item.id === current.activeSessionId) ? current.activeSessionId : null,
              };
            });
            setSelectedId(demos[0]?.id ?? null);
            setDataScope('demo');
            setExperimentScope('all');
            setNotice('已载入明确标记的演示班级数据。');
          }}><Users />载入演示班级</button>
          <button className="iq-button iq-button-primary" type="button" onClick={exportData}><Download />导出证据</button>
        </div>
      </section>

      <section className="iq-policy-card">
        <div className="iq-section-head"><div><small>INTERVENTION POLICY</small><h2>诊断与干预策略</h2></div><span>对新会话及后续分析生效</span></div>
        <div className="iq-policy-grid">
          <SelectField label="自动化模式" value={state.policy.automationMode} onChange={(value) => updatePolicy({ automationMode: value as ClassPolicy['automationMode'] })} options={[
            { value: 'observe', label: '仅观察：不自动发提示' },
            { value: 'low', label: '低干预：只发一个追问' },
            { value: 'guide', label: '引导学习：给出实验步骤' },
          ]} />
          <SelectField label="每人最多提示" value={String(state.policy.maxHintsPerSession)} onChange={(value) => updatePolicy({ maxHintsPerSession: Number(value) as 1 | 2 })} options={[
            { value: '1', label: '1 次' },
            { value: '2', label: '2 次' },
          ]} />
          <div className="iq-policy-rule"><ShieldCheck /><span><strong>置信度控制已启用</strong><small>证据不足显式拒判；教师纠正只追加，不覆盖原判。</small></span></div>
        </div>
      </section>

      {demoCount > 0 && (
        <div className="iq-data-scope" role="note">
          <CircleAlert />
          <span><strong>演示与本机数据已分开统计</strong><small>工作区中有演示会话 {demoCount} 个、本机会话 {localCount} 个；下方汇总仅统计当前筛选范围。</small></span>
        </div>
      )}

      <section className="iq-teacher-filters" aria-label="教师工作台统计范围">
        <SelectField label="数据来源" value={dataScope} onChange={(value) => setDataScope(value as typeof dataScope)} options={[
          { value: 'local', label: '仅本机学生记录' },
          { value: 'demo', label: '仅演示班级' },
          { value: 'all', label: '全部（包含演示）' },
        ]} />
        <SelectField label="探究任务" value={experimentScope} onChange={(value) => setExperimentScope(value as typeof experimentScope)} options={[
          { value: 'all', label: '全部任务' },
          ...Object.values(EXPERIMENTS).map((item) => ({ value: item.id, label: item.title })),
        ]} />
        <p>当前 {scopedSessions.length} 个会话 · 汇总、待处理队列和教学建议使用同一范围。导出仍保留完整工作区。</p>
      </section>

      <section className="iq-metric-grid">
        <Metric icon={<Users />} value={summary.total} label="会话数" note={`${summary.active} 个仍在进行`} />
        <Metric icon={<CircleAlert />} value={summary.needsAttention} label="需要关注" note="有支持证据，或新情境验证未通过" />
        <Metric icon={<ClipboardCheck />} value={`${summary.verificationRate}%`} label="独立验证率" note={`${summary.verified} 个会话通过新情境`} />
        <Metric icon={<Sparkles />} value={summary.interventions} label="已给出提示" note="受每人提示预算限制" />
      </section>

      <div className="iq-teacher-main">
        <section className="iq-overview-card">
          <div className="iq-section-head"><div><small>LIVE OVERVIEW</small><h2>阶段分布与待处理队列</h2></div><span>本机实时投影</span></div>
          <div className="iq-phase-bars">
            {phases.map((item) => (
              <div key={item.phase}><span>{item.label}</span><div><i style={{ width: summary.total && item.count ? `${Math.max(4, item.count / summary.total * 100)}%` : '0%' }} /></div><strong>{item.count}</strong></div>
            ))}
          </div>
          {scopedSessions.length === 0 ? (
            <div className="iq-empty-state"><Users /><strong>当前范围暂无会话</strong><p>可调整上方筛选范围，载入演示班级，或在学生探究中建立本机会话。</p></div>
          ) : (
            <div className="iq-student-list">
              {scopedSessions.map((session) => {
                const attention = session.diagnoses.filter((item) => diagnosisNeedsTeacherAttention(session, item)).length;
                const verificationFailed = session.verification?.passed === false;
                return (
                  <button key={session.id} className={selected?.id === session.id ? 'is-selected' : ''} type="button" onClick={() => setSelectedId(session.id)}>
                    <span className="iq-avatar">{session.studentAlias.slice(0, 1)}</span>
                    <span><strong>{session.studentAlias}</strong><small>{EXPERIMENTS[session.experimentId].title} · {phaseLabel(session.phase)}</small></span>
                    <span className={`iq-origin-chip ${session.dataOrigin === 'demo' ? 'is-demo' : ''}`}>{session.dataOrigin === 'demo' ? '演示' : '本机'}</span>
                    {(attention > 0 || verificationFailed) && (
                      <span className="iq-attention-count">
                        {verificationFailed ? `验证未通过${attention > 0 ? ` · ${attention} 项` : ''}` : `${attention} 项待处理`}
                      </span>
                    )}
                    <ChevronRight />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="iq-inspector-card">
          {selected ? (
            <>
              <div className="iq-section-head"><div><small>STUDENT EVIDENCE</small><h2>{selected.studentAlias}的证据链</h2></div><span>{EXPERIMENTS[selected.experimentId].title}</span></div>
              <div className="iq-inspector-summary">
                <div><span>预测</span><p>{selected.predictionReason || '尚未提交'}</p></div>
                <div><span>结论</span><p>{selected.conclusionText || '尚未提交'}</p></div>
                <div><span>记录</span><p>{selected.measurements.length} 组主动实验记录</p></div>
                <div><span>结论引用</span><p>{selected.conclusionEvidenceIds.length > 0 ? `${selected.conclusionEvidenceIds.length} 组已关联记录` : '尚未关联结构化证据'}</p></div>
              </div>
              {selected.verification && (
                <div className={`iq-verification-inspector ${selected.verification.passed ? 'is-passed' : 'is-failed'}`}>
                  {selected.verification.passed ? <Check /> : <CircleAlert />}
                  <div>
                    <strong>{selected.verification.passed ? '新情境独立验证通过' : '新情境独立验证未通过'}</strong>
                    <p>学生作答：{formatVerificationAnswer(selected)}</p>
                    <small>参考：{selected.verification.expected} · {selected.verification.feedback}</small>
                  </div>
                </div>
              )}
              {(selected.phase !== 'complete' || selected.verification?.passed === false) && (
                <button className="iq-button iq-button-outline iq-open-student-session" type="button" onClick={() => onOpenStudentSession(selected.id)}>
                  <ArrowRight />转到该学生会话继续探究
                </button>
              )}
              {selected.measurements.length > 0 && (
                <div className="iq-inspector-records">
                  <h3>实验记录摘要</h3>
                  <div>
                    {selected.measurements.slice(0, 8).map((measurement, index) => (
                      <span key={measurement.id} className={selected.conclusionEvidenceIds.includes(measurement.id) ? 'is-cited' : ''}>
                        <strong>#{index + 1}</strong>
                        {formatMeasurementSummary(selected, measurement)}
                        {selected.conclusionEvidenceIds.includes(measurement.id) && <em>结论引用</em>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="iq-teacher-diagnoses">
                <h3>候选判断与教师复核</h3>
                {selected.diagnoses.length === 0 ? <p className="iq-muted">结论提交后才会生成候选判断。</p> : selected.diagnoses.map((item) => {
                  const teacherOverride = getCurrentTeacherOverride(selected, item);
                  return (
                    <article key={item.id}>
                      <div><StatusChip status={item.status} />{teacherOverride && <span className="iq-reviewed">教师：{teacherOverride.verdict === 'confirm' ? '确认' : teacherOverride.verdict === 'reject' ? '不成立' : '要求补证据'}</span>}</div>
                      <h4>{item.label}</h4>
                      <p>{item.summary}</p>
                      <small>支持证据 {item.evidenceRefs.length} 条 · 反证 {item.counterEvidenceRefs.length} 条 · 可信度 {confidenceBand(item.confidence)}</small>
                      <label className="iq-field"><span>本项复核说明（可选）</span><textarea value={teacherNotes[item.id] ?? ''} onChange={(event) => setTeacherNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={`记录对“${item.label}”的课堂观察或复核理由`} /></label>
                      <div className="iq-review-actions">
                        <button type="button" onClick={() => override(item.code, 'confirm')}>确认候选</button>
                        <button type="button" onClick={() => override(item.code, 'reject')}>标记不成立</button>
                        <button type="button" onClick={() => override(item.code, 'insufficient')}>要求补证据</button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <TeacherEvidence key={selected.id} session={selected} eventLabels={EVENT_LABELS} formatMeasurement={formatMeasurementSummary} />
            </>
          ) : (
            <div className="iq-empty-state"><ListChecks /><strong>选择一个会话</strong><p>这里将展开预测、操作、记录、结论、候选判断和教师复核。</p></div>
          )}
        </section>
      </div>

      <section className="iq-diagnosis-distribution">
        <div className="iq-section-head"><div><small>CLASS KNOWLEDGE MAP</small><h2>班级认知证据地图</h2></div><span>按相关任务会话统计</span></div>
        <p className="iq-muted">“本次未发现困难”不等于已掌握；教师否决或要求补证的项目归入暂不判断。</p>
        {cognitionMap.length === 0 ? <p className="iq-muted">当前范围尚无可展示的探究会话。</p> : (
          <div className="iq-cognition-table-wrap">
            <table className="iq-cognition-table">
              <caption className="sr-only">每个知识或探究构念的证据状态分布</caption>
              <thead><tr><th>知识领域 / 探究构念</th><th>相关会话</th><th>本次未发现困难</th><th>候选待核对</th><th>有支持候选</th><th>未评估 / 暂不判断</th></tr></thead>
              <tbody>{cognitionMap.map((item) => (
                <tr key={item.code}><th scope="row"><span>{item.parent}</span>{item.label}</th><td>{item.total}</td><td className="is-observed">{item.observed}</td><td className="is-candidate">{item.candidate}</td><td className="is-supported">{item.supported}</td><td>{item.unknown}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {suggestions.length > 0 && (
        <section className="iq-recommendations">
          <div className="iq-section-head"><div><small>TEACHING NEXT STEP</small><h2>下一课教学建议草案</h2></div><span>必须由教师确认后使用</span></div>
          <div>
            {suggestions.map((item) => (
              <article key={item.code}>
                <span>{item.count} 个会话关联</span>
                <h3>{item.suggestion.title}</h3>
                <p>{item.suggestion.action}</p>
                <small>{item.code} · 自动生成草案，非自动教学决策</small>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function InquiryPlatform() {
  const repository = useMemo(() => new LocalSessionRepository(), []);
  const [state, setState] = useState<WorkspaceState>(DEFAULT_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('checking');
  const [persistenceBlocked, setPersistenceBlocked] = useState(false);
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null);
  const [recoveryResetArmed, setRecoveryResetArmed] = useState(false);
  const [location, setLocation] = useState<PlatformLocation>({ view: 'classroom', module: null });
  const view = location.view;
  const setView = (next: PlatformDestination) => {
    const destination = { view: next, module: null };
    setLocation(destination);
    window.location.hash = platformHash(destination);
  };
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const followHash = () => {
      setLocation(parsePlatformHash(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    followHash();
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const result = repository.loadWithStatus();
      setState(result.state);
      setPersistenceBlocked(result.status === 'invalid');
      setRecoveryRaw(result.recoveryRaw);
      setPersistenceStatus(result.status === 'invalid'
        ? 'recovery'
        : result.status === 'unavailable'
          ? 'failed'
          : 'saved');
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [repository]);

  useEffect(() => {
    if (!hydrated || persistenceBlocked) return;
    const nextStatus: PersistenceStatus = repository.save(state) ? 'saved' : 'failed';
    const timeout = window.setTimeout(() => {
      setPersistenceStatus((current) => current === nextStatus ? current : nextStatus);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [hydrated, persistenceBlocked, repository, state]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const downloadRecoveryData = () => {
    if (!recoveryRaw) return;
    const blob = new Blob([recoveryRaw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `physics-inquiry-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('原始受损数据已下载，浏览器中的副本没有被改写。');
  };

  const resetDamagedStorage = () => {
    if (!recoveryResetArmed) {
      setRecoveryResetArmed(true);
      setNotice('清除后无法从浏览器恢复。请先下载备份，再次点击红色按钮确认清除。');
      return;
    }
    if (!repository.clear()) {
      setNotice('无法清除受损数据；浏览器存储当前不可写，请先下载备份。');
      return;
    }
    const next = { ...DEFAULT_WORKSPACE, sessions: [], activeSessionId: null };
    setState(next);
    setPersistenceBlocked(false);
    setRecoveryRaw(null);
    setRecoveryResetArmed(false);
    setPersistenceStatus(repository.save(next) ? 'saved' : 'failed');
    setNotice('已清除受损的本机工作区，可以重新开始探究。');
  };

  const activeSoundSession = state.sessions.find((session) => (
    session.id === state.activeSessionId && session.experimentId === 'sound'
  ));
  const soundCaptureEnabled = Boolean(activeSoundSession && activeSoundSession.phase === 'experiment');
  const soundCaptureDescription = !activeSoundSession
    ? '先在“学生探究”中新建或打开一个声学探究，才能把结构化读数加入证据本。'
    : soundCaptureEnabled
      ? `将结构化读数加入“${activeSoundSession.studentAlias}”的声学证据本；不保存原始音频或波形样本。`
      : `“${activeSoundSession.studentAlias}”当前处于${phaseLabel(activeSoundSession.phase)}阶段；进入实验阶段后才能加入快照。`;
  const captureSoundSnapshot = (snapshot: SoundObservationSnapshot) => {
    if (!activeSoundSession) {
      setNotice('当前没有已打开的声学探究，请先在学生探究中建立或打开一个声学会话。');
      return;
    }
    const result = captureSoundObservation(activeSoundSession, toSoundObservationInput(snapshot));
    if (result.ok) setState((current) => replaceSession(current, result.session));
    setNotice(result.message);
  };

  return (
    <div className={`iq-shell iq-platform-shell${view === 'sound' ? ' iq-shell-sound' : ''}`}>
      <a className="iq-skip-link" href="#platform-content" onClick={(event) => {
        event.preventDefault();
        const content = document.getElementById('platform-content');
        content?.focus();
        content?.scrollIntoView();
      }}>跳到主要内容</a>
      <header className="iq-header">
        <a className="iq-brand" href="#classroom" aria-label="格物，返回课堂实验中心">
          <span><Gauge /></span>
          <span><strong>格物 · 物理实验</strong><small>课堂演示与探究学习</small></span>
        </a>
        <nav className="iq-view-switch" aria-label="平台视图">
          <a href="#classroom" aria-current={view === 'classroom' ? 'page' : undefined}><FlaskConical />课堂实验</a>
          <a href="#student" aria-current={view === 'student' || view === 'sound' ? 'page' : undefined}><BookOpenCheck />学生探究</a>
          <a href="#teacher" aria-current={view === 'teacher' ? 'page' : undefined}><Users />教师工作台</a>
        </nav>
        <div className="iq-local-state" aria-live="polite">
          <i />
          {persistenceStatus === 'checking'
            ? '正在检查本机保存'
            : persistenceStatus === 'saved'
              ? '已保存在本机'
              : persistenceStatus === 'recovery'
                ? '发现受损数据 · 已停止覆盖'
                : '保存不可用 · 仅留在当前页面'}
        </div>
      </header>

      {persistenceStatus === 'recovery' && (
        <div className="iq-data-scope iq-recovery-scope" role="alert">
          <CircleAlert />
          <span>
            <strong>检测到无法解析的本机记录，平台已停止自动保存</strong>
            <small>原始内容仍保留在浏览器中。请先下载备份；确认不再需要后，才清除并建立新的本机工作区。</small>
          </span>
          <div className="iq-recovery-actions">
            <button className="iq-button iq-button-outline" type="button" onClick={downloadRecoveryData} disabled={!recoveryRaw}><Download />下载原始备份</button>
            <button
              className={`iq-button iq-button-ghost${recoveryResetArmed ? ' is-armed' : ''}`}
              type="button"
              onClick={resetDamagedStorage}
            >
              <RotateCcw />{recoveryResetArmed ? '再次点击确认清除' : '清除并重新开始'}
            </button>
          </div>
        </div>
      )}

      {persistenceStatus === 'failed' && (
        <div className="iq-data-scope" role="alert">
          <CircleAlert />
          <span>
            <strong>本机保存失败，当前改动尚未持久化</strong>
            <small>数据目前只在此页面内存中；刷新或关闭页面会丢失。请保持页面打开，必要时前往 Teacher OS 导出证据。</small>
          </span>
        </div>
      )}

      <div id="platform-content" tabIndex={-1}>
      <ClassroomWorkspace active={view === 'classroom'} moduleId={location.module} />
      {view !== 'classroom' && (view === 'student' || view === 'sound') && <nav className="classroom-subnav" aria-label="探究工具导航"><a href="#student" aria-current={view === 'student' ? 'page' : undefined}><BookOpenCheck />探究任务与证据本</a><a href="#inquiry-scope" aria-current={view === 'sound' ? 'page' : undefined}><Volume2 />声音采集与波形对比</a></nav>}
      {view === 'classroom' ? null : !hydrated ? (
        <main className="iq-loading"><span /><p>正在读取本机探究记录……</p></main>
      ) : view === 'student' ? (
        <main className="iq-content"><StudentWorkspace state={state} setState={setState} setNotice={setNotice} /></main>
      ) : view === 'teacher' ? (
        <main className="iq-content"><TeacherWorkspace state={state} setState={setState} setNotice={setNotice} onOpenStudentSession={(sessionId) => {
          setState((current) => ({ ...current, activeSessionId: sessionId }));
          setView('student');
          setNotice('已打开教师选中的会话，可继续补证据或处理验证结果。');
        }} /></main>
      ) : (
        <div><div className="classroom-lab-heading"><div><h1>探究声音采集</h1><p>示波器读数与片段对比，可作为当前声学探究的结构化证据。</p></div><a className="iq-button iq-button-outline" href="#student"><BookOpenCheck />返回探究证据本</a></div><div className="iq-sound-legacy"><SoundLab
          onCaptureObservation={captureSoundSnapshot}
          captureEnabled={soundCaptureEnabled}
          captureDescription={soundCaptureDescription}
          captureButtonLabel="加入当前声学探究"
        /></div></div>
      )}
      </div>

      {notice && <output className="iq-toast" aria-live="polite"><Check />{notice}</output>}
      {view !== 'sound' && <footer className="iq-footer"><span><ShieldCheck />本地验证 · 课堂实验与探究档案分别记录</span><span>不上传学生数据 · 不生成学生排名</span></footer>}
    </div>
  );
}
