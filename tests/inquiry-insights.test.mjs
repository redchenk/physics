import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClassCognitionMap, buildProcessProfile, eventDescription, replayInquiryAt } from '../app/inquiry-insights.ts';
import {
  createSession, submitPrediction, submitPlan, changeParameter, captureMeasurement,
  removeMeasurement, finishCollection, submitConclusion, beginVerification, submitVerification,
  createDemoSessions, applyTeacherOverride,
} from '../app/inquiry-engine.ts';

const policy = { automationMode: 'observe', maxHintsPerSession: 1 };
function advance(result) { assert.equal(result.ok, true, result.message); return result.session; }
function plannedSession() {
  let session = createSession('回放学生', 'ohm', policy, 100);
  session = advance(submitPrediction(session, 'direct', '我预测电流会随电压同比例增大', 110));
  return advance(submitPlan(session, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 120));
}

test('回放按历史事件恢复装置，删除记录后仍能查看此前的真实快照', () => {
  let session = plannedSession();
  session = changeParameter(session, 'voltage', 4, 130);
  session = advance(captureMeasurement(session, 140));
  const firstCapture = session.events.length - 1;
  const firstMeasurement = session.measurements[0];
  session = changeParameter(session, 'voltage', 8, 150);
  session = removeMeasurement(session, firstMeasurement.id, 160);
  const original = JSON.stringify(session);

  const before = replayInquiryAt(session, 0);
  assert.equal(before.parameters.voltage, 3);
  assert.equal(before.phase, 'prediction');
  const captured = replayInquiryAt(session, firstCapture);
  assert.equal(captured.parameters.voltage, 4);
  assert.equal(captured.measurements[0].values.current, 0.2);
  assert.equal(captured.incompleteRecords, 0);
  const deleted = replayInquiryAt(session, session.events.length - 1);
  assert.equal(deleted.parameters.voltage, 8);
  assert.equal(deleted.measurements.length, 0);
  assert.equal(JSON.stringify(session), original);
});

test('旧事件缺少被删除记录的快照时标为不可还原，不捏造读数', () => {
  let session = plannedSession();
  session = advance(captureMeasurement(session, 140));
  const eventIndex = session.events.length - 1;
  const measurementId = session.measurements[0].id;
  session.events[eventIndex].payload = { measurementId, measurementIndex: 1 };
  session = removeMeasurement(session, measurementId, 150);
  const old = replayInquiryAt(session, eventIndex);
  assert.equal(old.measurements.length, 0);
  assert.equal(old.incompleteRecords, 1);
});

test('过程画像将未观察到与待关注分开，独立迁移使用实际结果', () => {
  let session = createSession('过程画像', 'ohm', policy, 100);
  assert.equal(buildProcessProfile(session).every((item) => item.state === 'unknown'), true);
  session = plannedSession();
  for (const voltage of [2, 4, 6]) {
    session = changeParameter(session, 'voltage', voltage, 150 + voltage);
    session = advance(captureMeasurement(session, 160 + voltage));
  }
  session = advance(finishCollection(session, 200));
  session = advance(submitConclusion(session, 'direct', '三组记录在电阻不变时电流与电压同比例增大', 90, policy, session.measurements.map((row) => row.id), 210));
  session = advance(beginVerification(session, 220));
  session = advance(submitVerification(session, 'direct', 0.8, '我把两倍关系直接套用到了新电阻', 230));
  const profile = buildProcessProfile(session);
  assert.equal(profile.find((item) => item.code === 'P01_CONTROL_VARIABLE').state, 'observed');
  assert.equal(profile.find((item) => item.code === 'reflection').state, 'unknown');
  assert.equal(profile.find((item) => item.code === 'verification').state, 'attention');
  assert.match(eventDescription(session, session.events.at(-1)), /把两倍关系/);
  const ids = new Set(session.events.map((event) => event.id));
  assert.equal(profile.every((item) => item.eventRefs.every((id) => ids.has(id))), true);
});

test('认知地图按相关任务计算分母，教师复核优先且不把未评估计为掌握', () => {
  const sessions = createDemoSessions(policy, 2_000);
  let map = buildClassCognitionMap(sessions);
  assert.equal(map.find((item) => item.code === 'P01_CONTROL_VARIABLE').total, 4);
  assert.equal(map.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT').total, 1);
  assert.equal(map.find((item) => item.code === 'M02_LENS_SCREEN_POSITION').total, 2);
  for (const item of map) assert.equal(item.observed + item.candidate + item.supported + item.unknown, item.total);
  const original = sessions.find((session) => session.experimentId === 'ohm');
  const confirmed = applyTeacherOverride(original, 'M01_OHM_CURRENT_CONSTANT', 'confirm', '已通过课堂追问复核', 3_000);
  map = buildClassCognitionMap([confirmed]);
  assert.equal(map.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT').supported, 1);
  const rejected = applyTeacherOverride(confirmed, 'M01_OHM_CURRENT_CONSTANT', 'reject', '补充观察不能支持候选', 3_010);
  map = buildClassCognitionMap([rejected]);
  const row = map.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT');
  assert.equal(row.unknown, 1);
  assert.equal(row.observed, 0);
  assert.equal(row.supported, 0);
});
