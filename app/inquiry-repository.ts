import { EXPERIMENTS } from './inquiry-engine.ts';
import type {
  EventType,
  ClassPolicy,
  Diagnosis,
  Evidence,
  InquiryEvent,
  InquirySession,
  Intervention,
  Measurement,
  TeacherOverride,
  VerificationResult,
} from './inquiry-engine';

export type WorkspaceState = {
  sessions: InquirySession[];
  policy: ClassPolicy;
  activeSessionId: string | null;
};

export type RepositoryLoadResult = {
  state: WorkspaceState;
  status: 'loaded' | 'empty' | 'invalid' | 'unavailable';
  recoveryRaw: string | null;
};

export const DEFAULT_WORKSPACE: WorkspaceState = {
  sessions: [],
  policy: {
    automationMode: 'low',
    maxHintsPerSession: 1,
  },
  activeSessionId: null,
};

export interface SessionRepository {
  load(): WorkspaceState;
  loadWithStatus(): RepositoryLoadResult;
  save(state: WorkspaceState): boolean;
  clear(): boolean;
}

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type StoredWorkspace = {
  version: typeof STORAGE_VERSION;
  savedAt: number;
  state: WorkspaceState;
};

type LocalRepositoryOptions = {
  key?: string;
  storage?: StorageAdapter | null;
};

const STORAGE_VERSION = 1 as const;
const DEFAULT_STORAGE_KEY = 'gewuphysics.inquiry-workspace';
const AUTOMATION_MODES = new Set(['observe', 'low', 'guide']);
const PHASES = new Set([
  'prediction',
  'plan',
  'experiment',
  'conclusion',
  'diagnosis',
  'verification',
  'complete',
]);
const DIAGNOSIS_STATUSES = new Set(['supported', 'possible', 'insufficient', 'resolved']);
const EVENT_TYPES = new Set<EventType>([
  'session_started',
  'prediction_submitted',
  'plan_submitted',
  'parameter_changed',
  'evidence_recorded',
  'evidence_removed',
  'collection_completed',
  'claim_submitted',
  'diagnosis_emitted',
  'intervention_delivered',
  'intervention_accepted',
  'verification_started',
  'verification_completed',
  'verification_retry_started',
  'teacher_overridden',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isEventValue(value: unknown): boolean {
  return value === null
    || isString(value)
    || isFiniteNumber(value)
    || typeof value === 'boolean'
    || (Array.isArray(value) && (value.every(isString) || value.every(isFiniteNumber)));
}

function isEvent(value: unknown): value is InquiryEvent {
  if (!isRecord(value) || !isRecord(value.payload)) return false;
  return isString(value.id)
    && isString(value.sessionId)
    && (value.experimentId === 'ohm' || value.experimentId === 'lens' || value.experimentId === 'sound')
    && isString(value.taskVersion)
    && isString(value.phase)
    && PHASES.has(value.phase)
    && isString(value.type)
    && EVENT_TYPES.has(value.type as EventType)
    && isFiniteNumber(value.timestamp)
    && Object.values(value.payload).every(isEventValue);
}

function isMeasurement(value: unknown): value is Measurement {
  if (!isRecord(value) || !isRecord(value.values)) return false;
  return isString(value.id)
    && isFiniteNumber(value.timestamp)
    && Object.values(value.values).every(
      (item) => item === null || isString(item) || isFiniteNumber(item),
    );
}

function isEvidence(value: unknown): value is Evidence {
  if (!isRecord(value)) return false;
  return isString(value.id)
    && isString(value.constructCode)
    && isString(value.label)
    && isString(value.detail)
    && (value.direction === 'support' || value.direction === 'counter' || value.direction === 'context')
    && (value.reliability === 'high' || value.reliability === 'medium' || value.reliability === 'low')
    && isStringArray(value.eventRefs);
}

function isDiagnosis(value: unknown): value is Diagnosis {
  if (!isRecord(value)) return false;
  return isString(value.id)
    && isString(value.code)
    && (value.kind === 'misconception' || value.kind === 'inquiry')
    && isString(value.label)
    && isString(value.status)
    && DIAGNOSIS_STATUSES.has(value.status)
    && isFiniteNumber(value.confidence)
    && isString(value.summary)
    && isStringArray(value.evidenceRefs)
    && isStringArray(value.counterEvidenceRefs);
}

function isIntervention(value: unknown): value is Intervention {
  if (!isRecord(value)) return false;
  return isString(value.id)
    && isString(value.diagnosisCode)
    && (value.level === 1 || value.level === 2)
    && isString(value.prompt)
    && isFiniteNumber(value.createdAt)
    && (value.acceptedAt === null || isFiniteNumber(value.acceptedAt))
    && (value.closedAt === undefined || value.closedAt === null || isFiniteNumber(value.closedAt));
}

function isVerification(value: unknown): value is VerificationResult {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.completedAt)
    && typeof value.passed === 'boolean'
    && isString(value.answerChoice)
    && (value.numericAnswer === null || isFiniteNumber(value.numericAnswer))
    && isString(value.explanation)
    && isString(value.expected)
    && isString(value.feedback);
}

function isTeacherOverride(value: unknown): value is TeacherOverride {
  if (!isRecord(value)) return false;
  return (value.diagnosisId === undefined || isString(value.diagnosisId))
    && isString(value.diagnosisCode)
    && (value.verdict === 'confirm' || value.verdict === 'reject' || value.verdict === 'insufficient')
    && isString(value.note)
    && isFiniteNumber(value.timestamp);
}

function isPolicy(value: unknown): value is ClassPolicy {
  if (!isRecord(value) || !isString(value.automationMode)) return false;
  return AUTOMATION_MODES.has(value.automationMode)
    && (value.maxHintsPerSession === 1 || value.maxHintsPerSession === 2);
}

function isSession(value: unknown): value is InquirySession {
  if (!isRecord(value) || !isRecord(value.plan) || !isRecord(value.parameters)) return false;
  const structurallyValid = isString(value.id)
    && isString(value.studentAlias)
    && (value.experimentId === 'ohm' || value.experimentId === 'lens' || value.experimentId === 'sound')
    && isString(value.taskVersion)
    && isString(value.automationMode)
    && AUTOMATION_MODES.has(value.automationMode)
    && isString(value.phase)
    && PHASES.has(value.phase)
    && isFiniteNumber(value.startedAt)
    && isFiniteNumber(value.updatedAt)
    && isString(value.predictionChoice)
    && isString(value.predictionReason)
    && isString(value.plan.independent)
    && isString(value.plan.dependent)
    && isString(value.plan.control)
    && Object.values(value.parameters).every(isFiniteNumber)
    && Array.isArray(value.measurements)
    && value.measurements.every(isMeasurement)
    && isString(value.conclusionChoice)
    && isString(value.conclusionText)
    && isFiniteNumber(value.conclusionConfidence)
    && (value.conclusionEvidenceIds === undefined || isStringArray(value.conclusionEvidenceIds))
    && Array.isArray(value.events)
    && value.events.every(isEvent)
    && Array.isArray(value.evidence)
    && value.evidence.every(isEvidence)
    && Array.isArray(value.diagnoses)
    && value.diagnoses.every(isDiagnosis)
    && Array.isArray(value.interventions)
    && value.interventions.every(isIntervention)
    && (value.verification === null || isVerification(value.verification))
    && Array.isArray(value.teacherOverrides)
    && value.teacherOverrides.every(isTeacherOverride)
    && (value.dataOrigin === 'local' || value.dataOrigin === 'demo');
  if (!structurallyValid) return false;

  const experimentId = value.experimentId as InquirySession['experimentId'];
  const experiment = EXPERIMENTS[experimentId];
  const allowedVariables = new Set<string>(experiment.variables.map((item) => item.value));
  // imageSize 是早期光学版本的旧字段，会在载入后迁移为 magnification。
  if (experimentId === 'lens') allowedVariables.add('imageSize');
  const planValues = [value.plan.independent, value.plan.dependent, value.plan.control] as string[];
  const planIsBlank = planValues.every((item) => item === '');
  const planIsComplete = planValues.every((item) => allowedVariables.has(item))
    && new Set(planValues).size === planValues.length;
  if (!planIsBlank && !planIsComplete) return false;

  const validPredictions = new Set<string>(experiment.predictionOptions.map((item) => item.value));
  const validConclusions = new Set<string>(experiment.conclusionOptions.map((item) => item.value));
  const predictionChoice = value.predictionChoice as string;
  const conclusionChoice = value.conclusionChoice as string;
  const phase = value.phase as string;
  if (predictionChoice !== '' && !validPredictions.has(predictionChoice)) return false;
  if (conclusionChoice !== '' && !validConclusions.has(conclusionChoice)) return false;

  const laterThanPrediction = phase !== 'prediction';
  const laterThanPlan = !['prediction', 'plan'].includes(phase);
  const needsConclusion = ['diagnosis', 'verification', 'complete'].includes(phase);
  if (laterThanPrediction && predictionChoice === '') return false;
  if (laterThanPlan && !planIsComplete) return false;
  if (needsConclusion && conclusionChoice === '') return false;
  if (phase === 'complete' && value.verification === null) return false;

  const sessionId = value.id as string;
  const taskVersion = value.taskVersion as string;
  const events = value.events as InquiryEvent[];
  if (events.some((event) => event.sessionId !== sessionId
    || event.experimentId !== experimentId
    || event.taskVersion !== taskVersion)) {
    return false;
  }
  return true;
}

function cloneWorkspace(state: WorkspaceState): WorkspaceState {
  return JSON.parse(JSON.stringify(state)) as WorkspaceState;
}

function defaultWorkspace(): WorkspaceState {
  return cloneWorkspace(DEFAULT_WORKSPACE);
}

function migrateSession(session: InquirySession): InquirySession {
  let migrated = Array.isArray(session.conclusionEvidenceIds)
    ? session
    : { ...session, conclusionEvidenceIds: [] };
  const interventions = migrated.interventions.map((item) => (
    item.closedAt === undefined ? { ...item, closedAt: null } : item
  ));
  if (interventions.some((item, index) => item !== migrated.interventions[index])) {
    migrated = { ...migrated, interventions };
  }
  const teacherOverrides = migrated.teacherOverrides.map((item) => {
    if (item.diagnosisId) return item;
    const diagnosisItem = [...migrated.diagnoses].reverse().find((candidate) => candidate.code === item.diagnosisCode);
    return diagnosisItem ? { ...item, diagnosisId: diagnosisItem.id } : item;
  });
  if (teacherOverrides.some((item, index) => item !== migrated.teacherOverrides[index])) {
    migrated = { ...migrated, teacherOverrides };
  }
  if (session.experimentId !== 'lens') return migrated;
  const migrateVariable = (value: string) => value === 'imageSize' ? 'magnification' : value;
  const plan = {
    independent: migrateVariable(migrated.plan.independent),
    dependent: migrateVariable(migrated.plan.dependent),
    control: migrateVariable(migrated.plan.control),
  };
  if (plan.independent === migrated.plan.independent
    && plan.dependent === migrated.plan.dependent
    && plan.control === migrated.plan.control) {
    return migrated;
  }
  migrated = { ...migrated, plan };
  return migrated;
}

function parseWorkspace(raw: string | null): WorkspaceState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)
      || parsed.version !== STORAGE_VERSION
      || !isFiniteNumber(parsed.savedAt)
      || !isRecord(parsed.state)) {
      return null;
    }

    const storedState = parsed.state;
    if (!Array.isArray(storedState.sessions)
      || !storedState.sessions.every(isSession)
      || !isPolicy(storedState.policy)
      || !(storedState.activeSessionId === null || isString(storedState.activeSessionId))) {
      return null;
    }

    const sessions = storedState.sessions.map(migrateSession);
    if (new Set(sessions.map((session) => session.id)).size !== sessions.length) return null;
    const activeSessionId = sessions.some((session) => session.id === storedState.activeSessionId)
      ? storedState.activeSessionId
      : null;
    return cloneWorkspace({ sessions, policy: storedState.policy, activeSessionId });
  } catch {
    return null;
  }
}

export function decodeWorkspaceBackup(raw: string): WorkspaceState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (parsed.version === STORAGE_VERSION && isRecord(parsed.state)) return parseWorkspace(raw);
    if (parsed.version !== undefined && parsed.version !== STORAGE_VERSION) return null;
    if (!isString(parsed.exportedAt)) return null;
    return parseWorkspace(JSON.stringify({ version: STORAGE_VERSION, savedAt: Date.now(), state: parsed }));
  } catch { return null; }
}

export function mergeWorkspaceBackup(current: WorkspaceState, incoming: WorkspaceState): WorkspaceState {
  const known = new Set(current.sessions.map((session) => session.id));
  return cloneWorkspace({
    ...current,
    sessions: [...current.sessions, ...incoming.sessions.filter((session) => !known.has(session.id))],
  });
}

export class LocalSessionRepository implements SessionRepository {
  private readonly key: string;
  private readonly configuredStorage: StorageAdapter | null | undefined;
  private previousRaw: string | null | undefined;

  constructor(options: LocalRepositoryOptions = {}) {
    this.key = options.key ?? DEFAULT_STORAGE_KEY;
    this.configuredStorage = Object.prototype.hasOwnProperty.call(options, 'storage')
      ? options.storage ?? null
      : undefined;
  }

  load(): WorkspaceState {
    return this.loadWithStatus().state;
  }

  loadWithStatus(): RepositoryLoadResult {
    const storage = this.resolveStorage();
    if (!storage) {
      return { state: defaultWorkspace(), status: 'unavailable', recoveryRaw: null };
    }
    try {
      const raw = storage.getItem(this.key);
      this.previousRaw = raw;
      if (raw === null) {
        return { state: defaultWorkspace(), status: 'empty', recoveryRaw: null };
      }
      const state = parseWorkspace(raw);
      return state
        ? { state, status: 'loaded', recoveryRaw: null }
        : { state: defaultWorkspace(), status: 'invalid', recoveryRaw: raw };
    } catch {
      return { state: defaultWorkspace(), status: 'unavailable', recoveryRaw: null };
    }
  }

  save(state: WorkspaceState): boolean {
    const storage = this.resolveStorage();
    if (!storage || !isPolicy(state.policy) || !state.sessions.every(isSession)) return false;
    const sessions = state.sessions.map(migrateSession);
    const activeSessionId = sessions.some((session) => session.id === state.activeSessionId)
      ? state.activeSessionId
      : null;
    const envelope: StoredWorkspace = {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      state: cloneWorkspace({ ...state, sessions, activeSessionId }),
    };
    try {
      if (this.previousRaw !== undefined && storage.getItem(this.key) !== this.previousRaw) return false;
      const raw = JSON.stringify(envelope);
      storage.setItem(this.key, raw);
      this.previousRaw = raw;
      return true;
    } catch {
      return false;
    }
  }

  clear(): boolean {
    const storage = this.resolveStorage();
    if (!storage) return false;
    try {
      if (this.previousRaw !== undefined && storage.getItem(this.key) !== this.previousRaw) return false;
      storage.removeItem(this.key);
      this.previousRaw = null;
      return true;
    } catch {
      return false;
    }
  }

  private resolveStorage(): StorageAdapter | null {
    if (this.configuredStorage !== undefined) return this.configuredStorage;
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
}

export class MemorySessionRepository implements SessionRepository {
  private state: WorkspaceState;

  constructor(initialState: WorkspaceState = DEFAULT_WORKSPACE) {
    this.state = cloneWorkspace(initialState);
  }

  load(): WorkspaceState {
    return cloneWorkspace(this.state);
  }

  loadWithStatus(): RepositoryLoadResult {
    return {
      state: this.load(),
      status: this.state.sessions.length > 0 ? 'loaded' : 'empty',
      recoveryRaw: null,
    };
  }

  save(state: WorkspaceState): boolean {
    this.state = cloneWorkspace(state);
    return true;
  }

  clear(): boolean {
    this.state = defaultWorkspace();
    return true;
  }
}
