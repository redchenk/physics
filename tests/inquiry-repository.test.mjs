import assert from 'node:assert/strict';
import test from 'node:test';

const {
  createSession,
  getCurrentTeacherOverride,
  summarizeSessions,
} = await import(new URL('../app/inquiry-engine.ts', import.meta.url));
const {
  DEFAULT_WORKSPACE,
  LocalSessionRepository,
  MemorySessionRepository,
} = await import(new URL('../app/inquiry-repository.ts', import.meta.url));

class FakeStorage {
  values = new Map();
  throwingMethods;

  constructor(throwingMethods = []) {
    this.throwingMethods = new Set(throwingMethods);
  }

  maybeThrow(method) {
    if (this.throwingMethods.has(method)) throw new Error(`fake ${method} failure`);
  }

  getItem(key) {
    this.maybeThrow('getItem');
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.maybeThrow('setItem');
    this.values.set(key, value);
  }

  removeItem(key) {
    this.maybeThrow('removeItem');
    this.values.delete(key);
  }
}

test('本地仓储可完整往返会话，并在损坏数据时安全回退', () => {
  const storage = new FakeStorage();
  const repository = new LocalSessionRepository({ storage, key: 'test-workspace' });
  const session = createSession('本地学生', 'lens', DEFAULT_WORKSPACE.policy, 100);
  const state = { sessions: [session], policy: DEFAULT_WORKSPACE.policy, activeSessionId: session.id };

  assert.equal(repository.save(state), true);
  assert.deepEqual(repository.load(), state);
  const envelope = JSON.parse(storage.getItem('test-workspace'));
  assert.equal(envelope.version, 1);

  storage.setItem('test-workspace', '{broken json');
  assert.deepEqual(repository.load(), DEFAULT_WORKSPACE);
  const invalid = repository.loadWithStatus();
  assert.equal(invalid.status, 'invalid');
  assert.equal(invalid.recoveryRaw, '{broken json');
  assert.equal(storage.getItem('test-workspace'), '{broken json');
});

test('内存仓储返回隔离副本，不泄漏可变引用', () => {
  const repository = new MemorySessionRepository();
  const first = repository.load();
  first.policy.automationMode = 'guide';
  assert.equal(repository.load().policy.automationMode, 'low');

  repository.save(first);
  const saved = repository.load();
  saved.policy.automationMode = 'observe';
  assert.equal(repository.load().policy.automationMode, 'guide');
  assert.equal(repository.clear(), true);
  assert.deepEqual(repository.load(), DEFAULT_WORKSPACE);
  assert.equal(repository.loadWithStatus().status, 'empty');
});

test('本地仓储捕获底层 storage 异常，并向调用方报告保存失败', () => {
  const storage = new FakeStorage(['getItem', 'setItem', 'removeItem']);
  const repository = new LocalSessionRepository({ storage, key: 'throwing-workspace' });

  assert.deepEqual(repository.load(), DEFAULT_WORKSPACE);
  assert.equal(repository.loadWithStatus().status, 'unavailable');
  assert.equal(repository.save(DEFAULT_WORKSPACE), false);
  assert.equal(repository.clear(), false);
});

test('旧版无 diagnosisId 的教师复核仍可载入，不会清空整个工作区', () => {
  const storage = new FakeStorage();
  const repository = new LocalSessionRepository({ storage, key: 'legacy-override-workspace' });
  const session = createSession('旧版会话', 'ohm', DEFAULT_WORKSPACE.policy, 200);
  session.diagnoses = [{
    id: 'dia_legacy_supported',
    code: 'M01_OHM_CURRENT_CONSTANT',
    kind: 'misconception',
    label: '电流—电压关系',
    status: 'supported',
    confidence: 0.86,
    summary: '旧版候选判断',
    evidenceRefs: [],
    counterEvidenceRefs: [],
  }];
  session.teacherOverrides = [{
    diagnosisCode: 'M01_OHM_CURRENT_CONSTANT',
    verdict: 'reject',
    note: '旧版复核记录',
    timestamp: 300,
  }];
  session.interventions = [{
    id: 'int_legacy',
    diagnosisCode: 'M01_OHM_CURRENT_CONSTANT',
    level: 1,
    prompt: '旧版提示',
    createdAt: 280,
    acceptedAt: null,
  }];
  const state = { sessions: [session], policy: DEFAULT_WORKSPACE.policy, activeSessionId: session.id };

  assert.equal(repository.save(state), true);
  const loaded = repository.load();
  const diagnosis = loaded.sessions[0].diagnoses[0];
  assert.equal(loaded.sessions[0].teacherOverrides[0].diagnosisId, diagnosis.id);
  assert.equal(getCurrentTeacherOverride(loaded.sessions[0], diagnosis)?.verdict, 'reject');
  assert.equal(summarizeSessions(loaded.sessions).needsAttention, 0);
  assert.equal(loaded.sessions[0].interventions[0].closedAt, null);
});

test('本地仓储拒绝语义损坏的事件或阶段，并保留原始数据用于恢复', () => {
  const createEnvelope = (session) => JSON.stringify({
    version: 1,
    savedAt: 500,
    state: { sessions: [session], policy: DEFAULT_WORKSPACE.policy, activeSessionId: session.id },
  });
  const cases = [
    (session) => { session.events[0].type = 'unknown_event'; },
    (session) => { session.events[0].sessionId = 'another_session'; },
    (session) => { session.phase = 'complete'; },
    (session) => { session.predictionChoice = 'not_an_option'; },
  ];

  cases.forEach((damage, index) => {
    const storage = new FakeStorage();
    const key = `semantic-damage-${index}`;
    const repository = new LocalSessionRepository({ storage, key });
    const session = createSession('语义校验', 'ohm', DEFAULT_WORKSPACE.policy, 500 + index);
    damage(session);
    const raw = createEnvelope(session);
    storage.setItem(key, raw);

    const loaded = repository.loadWithStatus();
    assert.equal(loaded.status, 'invalid');
    assert.equal(loaded.recoveryRaw, raw);
    assert.equal(storage.getItem(key), raw);
    assert.deepEqual(loaded.state, DEFAULT_WORKSPACE);
  });
});

test('旧版会话会迁移凸透镜变量名并补齐结构化结论引用', () => {
  const storage = new FakeStorage();
  const repository = new LocalSessionRepository({ storage, key: 'legacy-lens-workspace' });
  const session = createSession('旧版光学会话', 'lens', DEFAULT_WORKSPACE.policy, 400);
  session.plan = { independent: 'objectDistance', dependent: 'imageSize', control: 'focalLength' };
  delete session.conclusionEvidenceIds;
  const state = { sessions: [session], policy: DEFAULT_WORKSPACE.policy, activeSessionId: session.id };

  storage.setItem('legacy-lens-workspace', JSON.stringify({ version: 1, savedAt: 450, state }));
  const loaded = repository.load();
  assert.equal(loaded.sessions[0].plan.dependent, 'magnification');
  assert.deepEqual(loaded.sessions[0].conclusionEvidenceIds, []);
  assert.equal(loaded.activeSessionId, session.id);
});

test('声学探究会话可以本地保存并完整恢复', () => {
  const storage = new FakeStorage();
  const repository = new LocalSessionRepository({ storage, key: 'sound-workspace' });
  const session = createSession('声学学生', 'sound', DEFAULT_WORKSPACE.policy, 1_000);
  const state = { ...DEFAULT_WORKSPACE, sessions: [session], activeSessionId: session.id };

  assert.equal(repository.save(state), true);
  const loaded = repository.load();
  assert.equal(loaded.sessions.length, 1);
  assert.equal(loaded.sessions[0].experimentId, 'sound');
  assert.deepEqual(loaded.sessions[0].parameters, {
    frequencyHz: 440,
    loudness: 50,
    waveformCode: 0,
  });
  assert.equal(loaded.activeSessionId, session.id);
});
