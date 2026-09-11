import assert from 'node:assert/strict';
import test from 'node:test';

const {
  EXPERIMENTS,
  applyTeacherOverride,
  beginVerification,
  calculateLens,
  calculateOhm,
  calculateSound,
  captureMeasurement,
  captureSoundObservation,
  changeParameter,
  createDemoSessions,
  createSession,
  finishCollection,
  getCurrentTeacherOverride,
  removeMeasurement,
  retryAfterFailedVerification,
  submitConclusion: submitConclusionEngine,
  submitPlan,
  submitPrediction,
  submitVerification,
  acceptLatestIntervention,
  summarizeSessions,
} = await import(new URL('../app/inquiry-engine.ts', import.meta.url));

const observePolicy = { automationMode: 'observe', maxHintsPerSession: 1 };
const lowPolicy = { automationMode: 'low', maxHintsPerSession: 1 };

function advance(result) {
  assert.equal(result.ok, true, result.message);
  return result.session;
}

function submitConclusion(
  session,
  choice,
  text,
  confidence,
  policy,
  evidenceIdsOrNow,
  explicitNow,
) {
  const evidenceIds = Array.isArray(evidenceIdsOrNow)
    ? evidenceIdsOrNow
    : session.measurements.length >= 2
      ? [session.measurements[0].id, session.measurements.at(-1).id]
      : session.measurements.map((measurement) => measurement.id);
  const now = Array.isArray(evidenceIdsOrNow) ? explicitNow : evidenceIdsOrNow;
  return submitConclusionEngine(session, choice, text, confidence, policy, evidenceIds, now);
}

function recordOhmRows(session, rows, startAt = 1_000) {
  let next = session;
  rows.forEach(([voltage, resistance], index) => {
    const now = startAt + index * 10;
    next = changeParameter(next, 'voltage', voltage, now);
    next = changeParameter(next, 'resistance', resistance, now + 1);
    next = advance(captureMeasurement(next, now + 2));
  });
  return next;
}

function recordLensRows(session, distances, startAt = 1_000) {
  let next = session;
  distances.forEach((objectDistance, index) => {
    const now = startAt + index * 10;
    next = changeParameter(next, 'objectDistance', objectDistance, now);
    next = advance(captureMeasurement(next, now + 1));
  });
  return next;
}

function recordSoundRows(session, rows, startAt = 1_000) {
  let next = session;
  rows.forEach(([frequencyHz, loudness, waveformCode], index) => {
    const now = startAt + index * 10;
    next = changeParameter(next, 'frequencyHz', frequencyHz, now);
    next = changeParameter(next, 'loudness', loudness, now + 1);
    next = changeParameter(next, 'waveformCode', waveformCode, now + 2);
    next = advance(captureMeasurement(next, now + 3));
  });
  return next;
}

function createPlannedOhmSession(policy = observePolicy, now = 100) {
  let session = createSession('测试学生', 'ohm', policy, now);
  session = advance(submitPrediction(
    session,
    'direct',
    '电阻不变时电压越高，电流也会同比增大',
    now + 1,
  ));
  session = advance(submitPlan(
    session,
    { independent: 'voltage', dependent: 'current', control: 'resistance' },
    now + 2,
  ));
  return session;
}

function createPlannedSoundSession(policy = observePolicy, now = 100, prediction = 'higher_pitch') {
  let session = createSession('声学测试学生', 'sound', policy, now);
  session = advance(submitPrediction(
    session,
    prediction,
    prediction === 'higher_pitch'
      ? '波形和响度不变时，频率越高，振动越快，音调应当越高'
      : '我认为数字响度相同就会保持相同的音调',
    now + 1,
  ));
  session = advance(submitPlan(
    session,
    { independent: 'frequencyHz', dependent: 'pitchHz', control: 'loudnessAndWaveform' },
    now + 2,
  ));
  return session;
}

function createFailedVerificationSession(experimentId, now) {
  if (experimentId === 'ohm') {
    let session = createPlannedOhmSession(observePolicy, now);
    session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], now + 10);
    session = advance(finishCollection(session, now + 50));
    session = advance(submitConclusion(
      session,
      'direct',
      '电阻不变时电压与电流按照相同比例共同增大',
      88,
      observePolicy,
      now + 60,
    ));
    session = advance(beginVerification(session, now + 70));
    return advance(submitVerification(session, 'same', 0.4, '我认为换电阻以后电流保持不变', now + 80));
  }
  if (experimentId === 'lens') {
    let session = createSession('重试光学', 'lens', observePolicy, now);
    session = advance(submitPrediction(session, 'farther_smaller', '物体远离透镜时实像会变小并靠近焦点', now + 1));
    session = advance(submitPlan(
      session,
      { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' },
      now + 2,
    ));
    session = recordLensRows(session, [20, 30, 40], now + 10);
    session = advance(finishCollection(session, now + 50));
    session = advance(submitConclusion(
      session,
      'farther_smaller',
      '焦距不变时物距增大，实像的像距和放大率都减小',
      88,
      observePolicy,
      now + 60,
    ));
    session = advance(beginVerification(session, now + 70));
    return advance(submitVerification(
      session,
      'real_inverted_larger',
      15,
      '我认为新情境会得到倒立放大的实像',
      now + 80,
    ));
  }
  let session = createPlannedSoundSession(observePolicy, now);
  session = recordSoundRows(session, [[220, 60, 1], [440, 60, 1], [660, 60, 1]], now + 10);
  session = advance(finishCollection(session, now + 50));
  session = advance(submitConclusion(
    session,
    'higher_pitch',
    '波形和响度不变时，频率与音调读数沿相同方向升高',
    88,
    observePolicy,
    now + 60,
  ));
  session = advance(beginVerification(session, now + 70));
  return advance(submitVerification(
    session,
    'lower_pitch',
    880,
    '我认为新情境中频率升高会使音调降低',
    now + 80,
  ));
}

test('欧姆定律正确探究可形成一致证据并通过迁移验证', () => {
  let session = createPlannedOhmSession(observePolicy, 100);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 200);
  session = advance(finishCollection(session, 240));
  session = advance(submitConclusion(
    session,
    'direct',
    '三组记录中电阻保持不变，电压加倍时电流也接近加倍',
    88,
    observePolicy,
    250,
  ));

  const diagnoses = new Map(session.diagnoses.map((item) => [item.code, item]));
  assert.equal(diagnoses.get('P01_CONTROL_VARIABLE').status, 'resolved');
  assert.equal(diagnoses.get('P02_EVIDENCE_ALIGNMENT').status, 'resolved');
  assert.equal(diagnoses.get('M01_OHM_CURRENT_CONSTANT').status, 'resolved');
  assert.equal(session.interventions.length, 0);

  session = advance(beginVerification(session, 260));
  session = advance(submitVerification(
    session,
    'direct',
    0.4,
    '新情境仍可用电流等于电压除以电阻计算',
    270,
  ));

  assert.equal(session.phase, 'complete');
  assert.equal(session.verification?.passed, true);
  assert.equal(session.verification?.expected, '0.40 A（允许 ±0.03 A）');
  assert.equal(session.events.at(-1)?.type, 'verification_completed');
});

test('结论必须结构化引用至少两组仍存在的实验记录', () => {
  let session = createPlannedOhmSession(observePolicy, 280);
  session = recordOhmRows(session, [[2, 20], [2, 20], [4, 20], [6, 20]], 290);
  session = advance(finishCollection(session, 340));
  const [first, repeated, , last] = session.measurements;

  const oneCitation = submitConclusion(
    session,
    'direct',
    '第一组与第三组显示电压和电流按相同比例增大',
    88,
    observePolicy,
    [first.id],
    350,
  );
  assert.equal(oneCitation.ok, false);
  assert.match(oneCitation.message, /至少两组/);
  assert.strictEqual(oneCitation.session, session);

  const duplicateCitation = submitConclusion(
    session,
    'direct',
    '我不能用同一条记录重复充当两组独立证据',
    88,
    observePolicy,
    [first.id, first.id],
    351,
  );
  assert.equal(duplicateCitation.ok, false);
  assert.match(duplicateCitation.message, /至少两组/);

  const deletedCitation = submitConclusion(
    session,
    'direct',
    '第一组和一条不存在的记录不能构成可靠证据',
    88,
    observePolicy,
    [first.id, 'mea_deleted'],
    352,
  );
  assert.equal(deletedCitation.ok, false);
  assert.match(deletedCitation.message, /已不存在/);

  const sameIndependentValue = submitConclusion(
    session,
    'direct',
    '两条记录虽然编号不同，但电压取值完全相同，不能比较变化',
    88,
    observePolicy,
    [first.id, repeated.id],
    353,
  );
  assert.equal(sameIndependentValue.ok, false);
  assert.match(sameIndependentValue.message, /不同自变量/);

  session = advance(submitConclusion(
    session,
    'direct',
    '第一组与第三组显示电压增至三倍时电流也增至三倍',
    88,
    observePolicy,
    [first.id, last.id],
    354,
  ));
  assert.deepEqual(session.conclusionEvidenceIds, [first.id, last.id]);
  const claim = session.events.find((event) => event.type === 'claim_submitted');
  assert.deepEqual(claim?.payload.evidenceIds, [first.id, last.id]);
  assert.equal(session.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status, 'resolved');
});

test('欧姆定律错误预测与错误结论会形成候选误概念和最小干预', () => {
  let session = createSession('错误案例', 'ohm', lowPolicy, 300);
  session = advance(submitPrediction(
    session,
    'same',
    '我认为电阻决定电流，因此改变电压不会影响电流',
    301,
  ));
  session = advance(submitPlan(
    session,
    { independent: 'voltage', dependent: 'current', control: 'resistance' },
    302,
  ));
  session = recordOhmRows(session, [[2, 20], [4, 20], [8, 20]], 310);
  session = advance(finishCollection(session, 350));
  session = advance(submitConclusion(
    session,
    'same',
    '这些电流读数看起来差别不大，所以电压变化没有影响',
    80,
    lowPolicy,
    360,
  ));

  const misconception = session.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT');
  assert.equal(misconception?.status, 'possible');
  assert.equal(misconception?.confidence, 0.58);
  assert.ok((misconception?.evidenceRefs.length ?? 0) > 0);
  assert.equal(session.interventions.length, 1);
  assert.equal(session.interventions[0].level, 1);
  assert.equal(session.events.filter((event) => event.type === 'intervention_delivered').length, 1);
});

test('数据少于三组或没有三个不同自变量值时拒绝结束采集', () => {
  let session = createPlannedOhmSession(observePolicy, 400);
  session = recordOhmRows(session, [[2, 20], [4, 20]], 410);

  const tooFew = finishCollection(session, 440);
  assert.equal(tooFew.ok, false);
  assert.match(tooFew.message, /至少记录 3 组数据/);
  assert.strictEqual(tooFew.session, session);
  assert.equal(session.phase, 'experiment');

  session = advance(captureMeasurement(session, 450));
  const repeatedIndependent = finishCollection(session, 460);
  assert.equal(repeatedIndependent.ok, false);
  assert.match(repeatedIndependent.message, /3 个不同的自变量取值/);
  assert.equal(repeatedIndependent.session.phase, 'experiment');

  session = changeParameter(session, 'voltage', 6, 470);
  session = advance(captureMeasurement(session, 471));
  const enoughDistinctEvidence = finishCollection(session, 480);
  assert.equal(enoughDistinctEvidence.ok, true);
  assert.equal(enoughDistinctEvidence.session.phase, 'conclusion');
});

test('直接评估少量记录时明确弃权，而不是把证据不足当成错误', async () => {
  const { evaluateSession } = await import(new URL('../app/inquiry-engine.ts', import.meta.url));
  let session = createPlannedOhmSession(observePolicy, 500);
  session = recordOhmRows(session, [[2, 20], [4, 20]], 510);

  const { diagnoses } = evaluateSession(session, 540);
  assert.equal(
    diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE')?.status,
    'insufficient',
  );
  assert.equal(
    diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status,
    'insufficient',
  );
});

test('凸透镜光屏观点在独立探针前保持为候选', () => {
  let session = createSession('光学案例', 'lens', observePolicy, 600);
  session = advance(submitPrediction(
    session,
    'screen_controls',
    '光屏放到什么位置，像就会跟着移动到那个位置',
    601,
  ));
  session = advance(submitPlan(
    session,
    { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' },
    602,
  ));
  session = recordLensRows(session, [18, 25, 35], 610);
  session = advance(finishCollection(session, 650));
  session = advance(submitConclusion(
    session,
    'screen_controls',
    '移动光屏以后看到的清晰位置不同，所以像的位置由光屏决定',
    91,
    observePolicy,
    660,
  ));

  const misconception = session.diagnoses.find((item) => item.code === 'M02_LENS_SCREEN_POSITION');
  assert.equal(misconception?.status, 'possible');
  assert.equal(misconception?.confidence, 0.58);
  assert.equal(misconception?.evidenceRefs.length, 1);

  const supportingEvidence = session.evidence.find((item) => item.id === misconception?.evidenceRefs[0]);
  const referencedTypes = supportingEvidence?.eventRefs.map((eventId) => (
    session.events.find((event) => event.id === eventId)?.type
  ));
  assert.deepEqual(referencedTypes, ['prediction_submitted', 'claim_submitted']);
  assert.equal(supportingEvidence?.reliability, 'high');
});

test('凸透镜正确探究可用结构化证据完成无提示迁移验证', () => {
  let session = createSession('光学完整流程', 'lens', observePolicy, 680);
  session = advance(submitPrediction(session, 'farther_smaller', '物体远离透镜时，像会靠近透镜并变小', 681));
  session = advance(submitPlan(
    session,
    { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' },
    682,
  ));
  session = recordLensRows(session, [20, 30, 40], 690);
  session = advance(finishCollection(session, 730));
  session = advance(submitConclusion(
    session,
    'farther_smaller',
    '第一与第三组焦距相同，物距增大时像距和放大率都减小',
    90,
    observePolicy,
    [session.measurements[0].id, session.measurements[2].id],
    740,
  ));
  session = advance(beginVerification(session, 750));
  session = advance(submitVerification(
    session,
    'real_inverted_smaller',
    15,
    '薄透镜公式给出像距约十五厘米，放大率小于一',
    760,
  ));

  assert.equal(session.phase, 'complete');
  assert.equal(session.verification?.passed, true);
  assert.equal(summarizeSessions([session]).verificationRate, 100);
});

test('暂缓下结论不能被误判为已修正先前概念', () => {
  const cases = [
    {
      experimentId: 'ohm',
      prediction: 'same',
      code: 'M01_OHM_CURRENT_CONSTANT',
      plan: { independent: 'voltage', dependent: 'current', control: 'resistance' },
      record: (session, now) => recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], now),
    },
    {
      experimentId: 'lens',
      prediction: 'screen_controls',
      code: 'M02_LENS_SCREEN_POSITION',
      plan: { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' },
      record: (session, now) => recordLensRows(session, [20, 30, 40], now),
    },
    {
      experimentId: 'lens',
      prediction: 'farther_bigger',
      code: 'M03_LENS_DISTANCE_RELATION',
      plan: { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' },
      record: (session, now) => recordLensRows(session, [20, 30, 40], now),
    },
    {
      experimentId: 'sound',
      prediction: 'loudness_controls_pitch',
      code: 'M04_SOUND_LOUDNESS_PITCH',
      plan: { independent: 'frequencyHz', dependent: 'pitchHz', control: 'loudnessAndWaveform' },
      record: (session, now) => recordSoundRows(session, [[220, 50, 0], [440, 50, 0], [880, 50, 0]], now),
    },
    {
      experimentId: 'sound',
      prediction: 'same_pitch',
      code: 'M05_SOUND_FREQUENCY_PITCH_RELATION',
      plan: { independent: 'frequencyHz', dependent: 'pitchHz', control: 'loudnessAndWaveform' },
      record: (session, now) => recordSoundRows(session, [[220, 50, 0], [440, 50, 0], [880, 50, 0]], now),
    },
  ];

  cases.forEach(({ experimentId, prediction, code, plan, record }, index) => {
    const now = 7_500 + index * 100;
    let session = createSession(`暂缓结论-${code}`, experimentId, observePolicy, now);
    session = advance(submitPrediction(session, prediction, '这是我实验前持有的初始关系观点', now + 1));
    session = advance(submitPlan(session, plan, now + 2));
    session = record(session, now + 10);
    session = advance(finishCollection(session, now + 50));
    session = advance(submitConclusion(
      session,
      'insufficient',
      '虽然记录充分，但我目前选择暂缓判断，不确认原观点已经改变',
      55,
      observePolicy,
      [session.measurements[0].id, session.measurements.at(-1).id],
      now + 60,
    ));

    const diagnosis = session.diagnoses.find((item) => item.code === code);
    assert.equal(diagnosis?.status, 'possible');
    assert.match(diagnosis?.summary ?? '', /尚不能.*修正/);
    assert.equal(session.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status, 'supported');
  });
});

test('自动干预严格遵守每次探究最多两条提示的预算', () => {
  const policy = { automationMode: 'guide', maxHintsPerSession: 2 };
  let session = createSession('提示预算', 'ohm', policy, 700);
  session = advance(submitPrediction(
    session,
    'same',
    '我认为电流只由电阻决定，与电压的变化没有关系',
    701,
  ));
  session = advance(submitPlan(
    session,
    { independent: 'voltage', dependent: 'current', control: 'resistance' },
    702,
  ));
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 710);

  for (let round = 0; round < 3; round += 1) {
    session = advance(finishCollection(session, 750 + round * 20));
    session = advance(submitConclusion(
      session,
      'same',
      '我仍认为这些记录不能说明电压会使电流发生变化',
      75,
      policy,
      751 + round * 20,
    ));
    if (round < 2) {
      session = advance(acceptLatestIntervention(session, 752 + round * 20));
      session = changeParameter(session, 'voltage', 8 + round * 2, 753 + round * 20);
      session = advance(captureMeasurement(session, 754 + round * 20));
    }
  }

  assert.equal(session.interventions.length, 2);
  assert.deepEqual(session.interventions.map((item) => item.level), [2, 2]);
  assert.equal(session.events.filter((event) => event.type === 'intervention_delivered').length, 2);
  assert.equal(session.events.filter((event) => event.type === 'diagnosis_emitted').length, 3);
});

test('教师否决诊断会从班级待关注统计中移除，并可再次确认', () => {
  let session = createPlannedOhmSession(lowPolicy, 800);
  session = recordOhmRows(session, [[2, 10], [4, 20], [6, 30]], 810);
  session = advance(finishCollection(session, 850));
  session = advance(submitConclusion(
    session,
    'direct',
    '根据记录可以判断电压增大时电流也随之增大',
    84,
    lowPolicy,
    860,
  ));

  const supportedCodes = session.diagnoses
    .filter((item) => item.status === 'supported')
    .map((item) => item.code);
  assert.deepEqual(supportedCodes, ['P01_CONTROL_VARIABLE']);
  assert.equal(summarizeSessions([session]).needsAttention, 1);
  assert.equal(summarizeSessions([session]).diagnosisCounts[0]?.code, 'P01_CONTROL_VARIABLE');

  session = applyTeacherOverride(
    session,
    'P01_CONTROL_VARIABLE',
    'reject',
    '课堂观察显示学生是有意比较不同电阻，不纳入本题诊断。',
    870,
  );
  let summary = summarizeSessions([session]);
  assert.equal(summary.needsAttention, 0);
  assert.deepEqual(summary.diagnosisCounts, []);

  session = applyTeacherOverride(
    session,
    'P01_CONTROL_VARIABLE',
    'confirm',
    '复核任务要求后确认控制变量执行偏离。',
    880,
  );
  summary = summarizeSessions([session]);
  assert.equal(summary.needsAttention, 1);
  assert.equal(summary.diagnosisCounts[0]?.count, 1);
  assert.equal(session.teacherOverrides.length, 1);
  assert.equal(session.events.at(-1)?.type, 'teacher_overridden');
});

test('教师“要求补证据”会真实返回实验阶段并留下任务', () => {
  let session = createPlannedOhmSession(lowPolicy, 885);
  session = recordOhmRows(session, [[2, 10], [4, 20], [6, 30]], 890);
  session = advance(finishCollection(session, 930));
  session = advance(submitConclusion(session, 'direct', '这三组数据中电压和电流看起来同时增大', 75, lowPolicy, 940));

  session = applyTeacherOverride(
    session,
    'P01_CONTROL_VARIABLE',
    'insufficient',
    '请固定电阻 20 欧，只改变电压补一组对照。',
    950,
  );
  assert.equal(session.phase, 'experiment');
  assert.equal(session.interventions.at(-1)?.acceptedAt, 950);
  assert.match(session.interventions.at(-1)?.prompt ?? '', /固定电阻/);
  assert.equal(session.events.at(-1)?.payload.returnedToExperiment, true);
  assert.equal(finishCollection(session, 960).ok, false);
});

test('教师确认候选与要求补证据会优先进入待关注语义', () => {
  let candidate = createSession('教师确认候选', 'ohm', lowPolicy, 965);
  candidate = advance(submitPrediction(candidate, 'same', '我认为电流由电阻决定，和电压变化没有关系', 966));
  candidate = advance(submitPlan(candidate, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 967));
  candidate = recordOhmRows(candidate, [[2, 20], [4, 20], [6, 20]], 970);
  candidate = advance(finishCollection(candidate, 1_000));
  candidate = advance(submitConclusion(candidate, 'same', '三组记录里的电流看起来没有明显变化', 78, lowPolicy, 1_001));
  assert.equal(candidate.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT')?.status, 'possible');
  assert.equal(summarizeSessions([candidate]).diagnosisCounts.some((item) => item.code === 'M01_OHM_CURRENT_CONSTANT'), false);

  candidate = applyTeacherOverride(candidate, 'M01_OHM_CURRENT_CONSTANT', 'confirm', '课堂追问后确认该候选观点。', 1_002);
  let summary = summarizeSessions([candidate]);
  assert.equal(summary.needsAttention, 1);
  assert.equal(summary.diagnosisCounts.some((item) => item.code === 'M01_OHM_CURRENT_CONSTANT'), true);

  let resolved = createPlannedOhmSession(observePolicy, 1_010);
  resolved = recordOhmRows(resolved, [[2, 20], [4, 20], [6, 20]], 1_020);
  resolved = advance(finishCollection(resolved, 1_050));
  resolved = advance(submitConclusion(resolved, 'direct', '固定电阻后电压与电流按相同比例一起增大', 88, observePolicy, 1_060));
  assert.equal(summarizeSessions([resolved]).needsAttention, 0);

  resolved = applyTeacherOverride(resolved, 'M01_OHM_CURRENT_CONSTANT', 'insufficient', '再补一组跨度更大的电压对照。', 1_070);
  summary = summarizeSessions([resolved]);
  assert.equal(summary.needsAttention, 1);
  assert.equal(summary.diagnosisCounts.some((item) => item.code === 'M01_OHM_CURRENT_CONSTANT'), false);
});

test('物理计算函数在正常值、零值和透镜焦点奇点处保持有限且不修改输入', () => {
  const ohmInput = { voltage: 6, resistance: 15 };
  const ohmSnapshot = structuredClone(ohmInput);
  assert.deepEqual(calculateOhm(ohmInput), {
    voltage: 6,
    resistance: 15,
    current: 0.4,
    power: 2.4,
  });
  assert.deepEqual(ohmInput, ohmSnapshot);

  const zeroResistance = calculateOhm({ voltage: 6, resistance: 0 });
  assert.equal(zeroResistance.resistance, 0.1);
  assert.equal(zeroResistance.current, 60);
  assert.equal(Number.isFinite(zeroResistance.power), true);

  const lensInput = { focalLength: 10, objectDistance: 30 };
  const lensSnapshot = structuredClone(lensInput);
  assert.deepEqual(calculateLens(lensInput), {
    focalLength: 10,
    objectDistance: 30,
    imageDistance: 15,
    magnification: -0.5,
    nature: '实像·倒立',
  });
  assert.deepEqual(lensInput, lensSnapshot);

  const atFocus = calculateLens({ focalLength: 10, objectDistance: 10 });
  assert.equal(atFocus.imageDistance, null);
  assert.equal(atFocus.magnification, null);
  assert.equal(atFocus.nature, '折射光平行');
  assert.equal(Object.values(atFocus).some((value) => value === Infinity || value === -Infinity), false);

  const virtualImage = calculateLens({ focalLength: 10, objectDistance: 5 });
  assert.equal(virtualImage.imageDistance, -10);
  assert.equal(virtualImage.magnification, 2);
  assert.equal(virtualImage.nature, '虚像·正立');
});

test('迁移验证必须同时答对关系和数值', () => {
  let session = createPlannedOhmSession(observePolicy, 900);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 910);
  session = advance(finishCollection(session, 950));
  session = advance(submitConclusion(
    session,
    'direct',
    '电阻不变时三组数据的电流与电压同方向变化',
    85,
    observePolicy,
    960,
  ));
  session = advance(beginVerification(session, 970));
  session = advance(submitVerification(
    session,
    'inverse',
    0.4,
    '数值计算是零点四，但我认为关系是相反的',
    980,
  ));
  assert.equal(session.verification?.passed, false);
  const transferCandidate = session.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT');
  const transferEvidence = session.evidence.find((item) => item.label === '新情境独立验证');
  assert.equal(transferCandidate?.status, 'possible');
  assert.equal(transferEvidence?.reliability, 'high');
  assert.equal(transferEvidence && transferCandidate?.evidenceRefs.includes(transferEvidence.id), true);
  assert.equal(summarizeSessions([session]).needsAttention, 1);
});

test('关系选对但数值答错时仍进入教师待关注队列，不臆断稳定误概念', () => {
  let session = createPlannedOhmSession(observePolicy, 990);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 1_000);
  session = advance(finishCollection(session, 1_040));
  session = advance(submitConclusion(
    session,
    'direct',
    '固定电阻后三组记录中的电流与电压按照相同比例增大',
    88,
    observePolicy,
    1_050,
  ));
  session = advance(beginVerification(session, 1_060));
  session = advance(submitVerification(
    session,
    'direct',
    4,
    '我判断关系相同，但数值计算成了四安培',
    1_070,
  ));

  assert.equal(session.verification?.passed, false);
  assert.equal(session.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT')?.status, 'resolved');
  assert.equal(summarizeSessions([session]).needsAttention, 1);
  assert.equal(session.evidence.some((item) => item.label === '新情境独立验证'), false);
});

test('接受最小干预后，没有新记录时不能空转下一轮', () => {
  let session = createSession('补证据案例', 'ohm', lowPolicy, 1_000);
  session = advance(submitPrediction(session, 'same', '我认为电压对电流没有影响', 1_001));
  session = advance(submitPlan(session, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_002));
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 1_010);
  session = advance(finishCollection(session, 1_050));
  session = advance(submitConclusion(session, 'same', '这些电流读数差别不大，所以电压没有影响', 80, lowPolicy, 1_060));
  session = advance(acceptLatestIntervention(session, 1_070));
  const blocked = finishCollection(session, 1_080);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /新记录 1 组证据/);
});

test('初始答错后自行修正不贴标签，探针后仍坚持才升为有支持候选', () => {
  let corrected = createSession('自行修正', 'ohm', observePolicy, 1_100);
  corrected = advance(submitPrediction(corrected, 'same', '我刚开始认为电压变化不会影响电流', 1_101));
  corrected = advance(submitPlan(corrected, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_102));
  corrected = recordOhmRows(corrected, [[2, 20], [4, 20], [8, 20]], 1_110);
  corrected = advance(finishCollection(corrected, 1_150));
  corrected = advance(submitConclusion(corrected, 'direct', '第一与第三组电阻相同，电压和电流都增大了四倍', 82, observePolicy, 1_160));
  const correctedFinding = corrected.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT');
  assert.equal(correctedFinding?.status, 'resolved');
  assert.match(correctedFinding?.summary ?? '', /自行修正/);

  let persistent = createSession('持续观点', 'ohm', lowPolicy, 1_200);
  persistent = advance(submitPrediction(persistent, 'same', '我认为电压不会影响电流读数', 1_201));
  persistent = advance(submitPlan(persistent, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_202));
  persistent = recordOhmRows(persistent, [[2, 20], [4, 20], [6, 20]], 1_210);
  persistent = advance(finishCollection(persistent, 1_250));
  persistent = advance(submitConclusion(persistent, 'same', '我还是认为这三组的电流基本不变', 80, lowPolicy, 1_260));
  assert.equal(persistent.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT')?.status, 'possible');
  persistent = advance(acceptLatestIntervention(persistent, 1_270));
  persistent = changeParameter(persistent, 'voltage', 10, 1_271);
  persistent = advance(captureMeasurement(persistent, 1_272));
  persistent = advance(finishCollection(persistent, 1_280));
  persistent = advance(submitConclusion(persistent, 'same', '补充一组后我仍认为电流没有随电压变化', 85, lowPolicy, 1_290));
  assert.equal(persistent.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT')?.status, 'supported');
});

test('迁移验证拒绝空白、非白名单和非有限数值，并保持在验证阶段', () => {
  let session = createPlannedOhmSession(observePolicy, 1_300);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 1_310);
  session = advance(finishCollection(session, 1_350));
  session = advance(submitConclusion(
    session,
    'direct',
    '三组数据中电压增大时电流按相同比例增大',
    85,
    observePolicy,
    1_360,
  ));
  session = advance(beginVerification(session, 1_370));

  for (const [choice, numericAnswer, message] of [
    ['', 0.4, /请选择一个有效/],
    ['not-an-option', 0.4, /请选择一个有效/],
    ['direct', null, /有效的数值答案/],
    ['direct', Number.NaN, /有效的数值答案/],
    ['direct', Number.POSITIVE_INFINITY, /有效的数值答案/],
  ]) {
    const rejected = submitVerification(session, choice, numericAnswer, '这是我的判断依据', 1_380);
    assert.equal(rejected.ok, false);
    assert.strictEqual(rejected.session, session);
    assert.equal(rejected.session.phase, 'verification');
    assert.equal(rejected.session.verification, null);
    assert.match(rejected.message, message);
  }

  let lens = createSession('验证白名单', 'lens', observePolicy, 1_400);
  lens = advance(submitPrediction(lens, 'farther_smaller', '物体越远时实像会变小并靠近焦点', 1_401));
  lens = advance(submitPlan(lens, { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' }, 1_402));
  lens = recordLensRows(lens, [20, 30, 40], 1_410);
  lens = advance(finishCollection(lens, 1_450));
  lens = advance(submitConclusion(lens, 'farther_smaller', '三组记录显示物距增大时像距与放大率都减小', 88, observePolicy, 1_460));
  lens = advance(beginVerification(lens, 1_470));
  const wrongDomainChoice = submitVerification(lens, 'direct', 15, '这是欧姆任务的选项', 1_480);
  assert.equal(wrongDomainChoice.ok, false);
  assert.equal(wrongDomainChoice.session.phase, 'verification');
});

test('干预只接受仍存在、可区分且属于同一诊断的新增记录', () => {
  let session = createSession('探针约束', 'ohm', lowPolicy, 1_500);
  session = advance(submitPrediction(session, 'same', '我认为电流只由电阻决定不会随电压变化', 1_501));
  session = advance(submitPlan(session, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_502));
  session = recordOhmRows(session, [[2, 10], [4, 20], [6, 30]], 1_510);
  session = advance(finishCollection(session, 1_550));
  session = advance(submitConclusion(session, 'same', '三组电流相同所以我认为电压没有影响', 80, lowPolicy, 1_560));
  assert.equal(session.interventions.at(-1)?.diagnosisCode, 'P01_CONTROL_VARIABLE');
  session = advance(acceptLatestIntervention(session, 1_570));

  session = advance(captureMeasurement(session, 1_571));
  const duplicateId = session.measurements.at(-1)?.id;
  const duplicateBlocked = finishCollection(session, 1_572);
  assert.equal(duplicateBlocked.ok, false);
  assert.match(duplicateBlocked.message, /可区分/);

  session = removeMeasurement(session, duplicateId, 1_573);
  const deletedBlocked = finishCollection(session, 1_574);
  assert.equal(deletedBlocked.ok, false);
  assert.match(deletedBlocked.message, /已删除/);

  session = changeParameter(session, 'voltage', 8, 1_575);
  session = advance(captureMeasurement(session, 1_576));
  session = advance(finishCollection(session, 1_580));
  session = advance(submitConclusion(session, 'same', '补充对照后我仍认为电压不会改变电流', 82, lowPolicy, 1_590));
  assert.equal(
    session.diagnoses.find((item) => item.code === 'M01_OHM_CURRENT_CONSTANT')?.status,
    'possible',
  );
});

test('证据不足时正确拒判不会被诊断为证据结论不一致', () => {
  let abstained = createSession('正确拒判', 'ohm', observePolicy, 1_600);
  abstained = advance(submitPrediction(abstained, 'uncertain', '需要先控制变量并观察数据才能判断', 1_601));
  abstained = advance(submitPlan(abstained, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_602));
  abstained = recordOhmRows(abstained, [[2, 10], [4, 20], [6, 30]], 1_610);
  abstained = advance(finishCollection(abstained, 1_650));
  abstained = advance(submitConclusion(
    abstained,
    'insufficient',
    '三组记录中的电阻也同时改变，因此不能把结果归因于电压',
    75,
    observePolicy,
    1_660,
  ));
  assert.equal(
    abstained.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE')?.status,
    'supported',
  );
  assert.equal(
    abstained.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status,
    'resolved',
  );

  let overclaimed = createSession('过早结论', 'ohm', observePolicy, 1_700);
  overclaimed = advance(submitPrediction(overclaimed, 'direct', '我预计电阻固定时电流与电压成正比', 1_701));
  overclaimed = advance(submitPlan(overclaimed, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_702));
  overclaimed = recordOhmRows(overclaimed, [[2, 10], [4, 20], [6, 30]], 1_710);
  overclaimed = advance(finishCollection(overclaimed, 1_750));
  overclaimed = advance(submitConclusion(
    overclaimed,
    'direct',
    '虽然电阻同时改变，我仍直接断定电流与电压成正比',
    80,
    observePolicy,
    1_760,
  ));
  assert.equal(
    overclaimed.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status,
    'insufficient',
  );

  let repeated = createPlannedOhmSession(observePolicy, 1_770);
  repeated = recordOhmRows(repeated, [[2, 20], [4, 20], [4, 20], [6, 20]], 1_780);
  repeated = advance(finishCollection(repeated, 1_830));
  repeated = advance(submitConclusion(
    repeated,
    'direct',
    '重复记录不改变其余三组中电流与电压的正比例趋势',
    85,
    observePolicy,
    1_840,
  ));
  assert.equal(
    repeated.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status,
    'resolved',
  );
});

test('教师复核绑定诊断版本，重新诊断后仅事件时间线保留旧复核', () => {
  let session = createSession('复核版本', 'ohm', observePolicy, 1_800);
  session = advance(submitPrediction(session, 'direct', '我预计电阻固定时电流随电压成比例变化', 1_801));
  session = advance(submitPlan(session, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 1_802));
  session = recordOhmRows(session, [[2, 10], [4, 20], [6, 30]], 1_810);
  session = advance(finishCollection(session, 1_850));
  session = advance(submitConclusion(session, 'direct', '当前三组数据里电阻也发生了改变，需要补证据', 70, observePolicy, 1_860));
  const originalDiagnosis = session.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE');
  assert.ok(originalDiagnosis);

  session = applyTeacherOverride(
    session,
    'P01_CONTROL_VARIABLE',
    'insufficient',
    '固定电阻后重新取得三组数据。',
    1_870,
  );
  assert.equal(getCurrentTeacherOverride(session, originalDiagnosis)?.diagnosisId, originalDiagnosis.id);
  const teacherEvent = session.events.at(-1);
  assert.equal(teacherEvent?.type, 'teacher_overridden');
  assert.equal(teacherEvent?.payload.diagnosisId, originalDiagnosis.id);

  for (const measurement of session.measurements) {
    session = removeMeasurement(session, measurement.id, 1_871);
  }
  session = changeParameter(session, 'resistance', 20, 1_872);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 1_880);
  session = advance(finishCollection(session, 1_920));
  session = advance(submitConclusion(
    session,
    'direct',
    '固定电阻后二、四、六伏对应的电流按相同比例增加',
    90,
    observePolicy,
    1_930,
  ));
  const currentDiagnosis = session.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE');
  assert.ok(currentDiagnosis);
  assert.notEqual(currentDiagnosis.id, originalDiagnosis.id);
  assert.equal(currentDiagnosis.status, 'resolved');
  assert.equal(getCurrentTeacherOverride(session, currentDiagnosis), undefined);
  assert.equal(session.teacherOverrides.some((item) => item.diagnosisCode === currentDiagnosis.code), false);
  assert.equal(session.events.filter((event) => event.type === 'teacher_overridden').length, 1);
  assert.equal(session.events.find((event) => event.id === teacherEvent?.id)?.payload.note, '固定电阻后重新取得三组数据。');
});

test('凸透镜像大小计划使用可记录的 magnification 字段', () => {
  const dependentValues = EXPERIMENTS.lens.variables.map((item) => item.value);
  assert.ok(dependentValues.includes('magnification'));
  assert.equal(dependentValues.includes('imageSize'), false);
});

test('声学纯函数派生音调、振幅与音色，并对装置边界做确定性钳制', () => {
  const input = { frequencyHz: 880, loudness: 75, waveformCode: 2 };
  const snapshot = structuredClone(input);
  assert.deepEqual(calculateSound(input), {
    frequencyHz: 880,
    loudness: 75,
    waveformCode: 2,
    pitchHz: 880,
    periodMs: 1000 / 880,
    amplitude: 0.75,
    waveformLabel: '方波',
    nature: '明亮·含丰富奇次谐波',
  });
  assert.deepEqual(input, snapshot);

  assert.deepEqual(calculateSound({ frequencyHz: 10, loudness: 120, waveformCode: 2.6 }), {
    frequencyHz: 50,
    loudness: 100,
    waveformCode: 3,
    pitchHz: 50,
    periodMs: 20,
    amplitude: 1,
    waveformLabel: '锯齿波',
    nature: '明亮·含丰富谐波',
  });
  assert.equal(calculateSound({ frequencyHz: Number.NaN, loudness: Number.NaN, waveformCode: Number.NaN }).pitchHz, 440);
  assert.equal(calculateSound({ frequencyHz: 440, loudness: 0, waveformCode: 0 }).pitchHz, null);
});

test('静音状态不能伪造可测音调或进入声学证据本', () => {
  let session = createPlannedSoundSession(observePolicy, 1_950);
  session = changeParameter(session, 'loudness', 0, 1_953);

  for (const [index, frequencyHz] of [220, 440, 880].entries()) {
    session = changeParameter(session, 'frequencyHz', frequencyHz, 1_954 + index * 2);
    const capture = captureMeasurement(session, 1_955 + index * 2);
    assert.equal(capture.ok, false);
    assert.match(capture.message, /静音.*无法观察音调/);
    assert.strictEqual(capture.session, session);
  }

  assert.equal(session.measurements.length, 0);
  assert.equal(finishCollection(session, 1_970).ok, false);
});

test('示波器只导入结构化声学快照，麦克风观察不冒充控制变量实验', () => {
  let session = createPlannedSoundSession(observePolicy, 1_975);
  const baseObservation = {
    source: 'microphone',
    capturedAt: 1_980,
    pitchHz: null,
    dbfs: -24,
    clarity: 0.7,
    centroidHz: 1_500,
    timeWindowMs: 40,
    verticalGain: 2.5,
    clipSlot: null,
    generator: null,
    samples: new Float32Array([0.1, -0.1]),
  };
  const noPitch = captureSoundObservation(session, baseObservation, 1_981);
  assert.equal(noPitch.ok, false);
  assert.match(noPitch.message, /没有识别出稳定音调/);

  for (const [index, pitchHz] of [220, 440, 880].entries()) {
    session = advance(captureSoundObservation(session, {
      ...baseObservation,
      capturedAt: 1_982 + index,
      pitchHz,
      clipSlot: index === 0 ? 'A' : null,
    }, 1_985 + index));
  }
  const first = session.measurements[0];
  assert.equal(first.values.source, 'microphone');
  assert.equal(first.values.loudness, null);
  assert.equal(first.values.waveformCode, null);
  assert.equal(first.values.clipSlot, 'A');
  assert.equal('samples' in first.values, false);
  const recordedEvent = session.events.at(-1);
  assert.equal(recordedEvent?.payload.structuredOnly, true);
  assert.equal('samples' in (recordedEvent?.payload ?? {}), false);

  session = advance(finishCollection(session, 1_990));
  session = advance(submitConclusion(
    session,
    'insufficient',
    '麦克风三次观察没有标定响度和波形，不能作为严格控制变量实验',
    70,
    observePolicy,
    [session.measurements[0].id, session.measurements[2].id],
    1_991,
  ));
  assert.equal(session.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE')?.status, 'insufficient');
  assert.equal(session.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status, 'resolved');

  let generated = createPlannedSoundSession(observePolicy, 1_992);
  generated = advance(captureSoundObservation(generated, {
    source: 'generator',
    capturedAt: 1_993,
    pitchHz: 440,
    dbfs: -18,
    clarity: 1,
    centroidHz: 440,
    timeWindowMs: 20,
    verticalGain: 2,
    clipSlot: 'B',
    generator: { frequencyHz: 440, loudness: 50, waveformCode: 1 },
  }, 1_994));
  assert.equal(generated.measurements[0].values.frequencyHz, 440);
  assert.equal(generated.measurements[0].values.waveformLabel, '三角波');
  assert.equal(generated.measurements[0].values.source, 'generator');
});

test('声学正确探究形成完整证据链并通过关系加数值的迁移验证', () => {
  let session = createPlannedSoundSession(observePolicy, 2_000);
  session = recordSoundRows(session, [[220, 60, 1], [440, 60, 1], [880, 60, 1]], 2_010);

  assert.deepEqual(session.measurements[1].values, {
    frequencyHz: 440,
    loudness: 60,
    waveformCode: 1,
    pitchHz: 440,
    periodMs: 1000 / 440,
    amplitude: 0.6,
    waveformLabel: '三角波',
    nature: '柔和·含奇次谐波',
  });

  session = advance(finishCollection(session, 2_050));
  session = advance(submitConclusion(
    session,
    'higher_pitch',
    '三组数据的响度和波形相同，频率依次升高时音调读数也同步升高',
    90,
    observePolicy,
    2_060,
  ));
  const diagnoses = new Map(session.diagnoses.map((item) => [item.code, item]));
  assert.equal(diagnoses.get('P01_CONTROL_VARIABLE').status, 'resolved');
  assert.equal(diagnoses.get('P02_EVIDENCE_ALIGNMENT').status, 'resolved');
  assert.equal(diagnoses.get('M04_SOUND_LOUDNESS_PITCH').status, 'resolved');
  assert.equal(diagnoses.get('M05_SOUND_FREQUENCY_PITCH_RELATION').status, 'resolved');
  assert.equal(session.interventions.length, 0);

  session = advance(beginVerification(session, 2_070));
  const crossDomain = submitVerification(session, 'direct', 880, '这是电学选项', 2_071);
  assert.equal(crossDomain.ok, false);
  assert.strictEqual(crossDomain.session, session);
  session = advance(submitVerification(
    session,
    'higher_pitch',
    880,
    '新情境中频率升至八百八十赫兹，所以音调也升至八百八十赫兹',
    2_080,
  ));
  assert.equal(session.verification?.passed, true);
  assert.match(session.verification?.expected ?? '', /880 Hz/);
  assert.deepEqual(summarizeSessions([session]), {
    total: 1,
    active: 0,
    needsAttention: 0,
    verified: 1,
    verificationRate: 100,
    interventions: 0,
    diagnosisCounts: [],
  });
});

test('声学控制变量判断同时检查数字响度和波形', () => {
  let session = createPlannedSoundSession(observePolicy, 2_100);
  session = recordSoundRows(session, [[220, 40, 0], [440, 60, 0], [880, 60, 2]], 2_110);
  session = advance(finishCollection(session, 2_150));
  session = advance(submitConclusion(
    session,
    'insufficient',
    '响度和波形也发生了改变，现有记录不能单独归因于频率',
    82,
    observePolicy,
    2_160,
  ));
  assert.equal(
    session.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE')?.status,
    'supported',
  );
  assert.equal(
    session.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT')?.status,
    'resolved',
  );
});

test('响度—音调候选仅在同频不同响度的存活探针后升级', () => {
  let session = createPlannedSoundSession(lowPolicy, 2_200, 'loudness_controls_pitch');
  session = recordSoundRows(session, [[220, 50, 0], [440, 50, 0], [880, 50, 0]], 2_210);
  session = advance(finishCollection(session, 2_250));
  session = advance(submitConclusion(
    session,
    'loudness_controls_pitch',
    '三组的数字响度相同，所以我认为它们的音调也应相同',
    84,
    lowPolicy,
    2_260,
  ));
  assert.equal(session.diagnoses.find((item) => item.code === 'M04_SOUND_LOUDNESS_PITCH')?.status, 'possible');
  assert.equal(session.interventions.at(-1)?.diagnosisCode, 'M04_SOUND_LOUDNESS_PITCH');

  session = advance(acceptLatestIntervention(session, 2_270));
  session = changeParameter(session, 'loudness', 80, 2_271);
  session = advance(captureMeasurement(session, 2_272));
  const removedProbeId = session.measurements.at(-1)?.id;
  session = removeMeasurement(session, removedProbeId, 2_273);
  assert.equal(finishCollection(session, 2_274).ok, false);

  session = advance(captureMeasurement(session, 2_275));
  session = advance(finishCollection(session, 2_280));
  session = advance(submitConclusion(
    session,
    'loudness_controls_pitch',
    '改变响度后我仍坚持认为，响度相同才会得到相同音调',
    86,
    lowPolicy,
    2_290,
  ));
  assert.equal(session.diagnoses.find((item) => item.code === 'M04_SOUND_LOUDNESS_PITCH')?.status, 'supported');
});

test('频率—音调候选使用同响度同波形探针，迁移失败也可独立确认', () => {
  let probed = createPlannedSoundSession(lowPolicy, 2_300, 'same_pitch');
  probed = recordSoundRows(probed, [[220, 55, 2], [440, 55, 2], [660, 55, 2]], 2_310);
  probed = advance(finishCollection(probed, 2_350));
  probed = advance(submitConclusion(
    probed,
    'same_pitch',
    '我认为数字响度不变时，改变频率不会让音调发生变化',
    80,
    lowPolicy,
    2_360,
  ));
  assert.equal(probed.diagnoses.find((item) => item.code === 'M05_SOUND_FREQUENCY_PITCH_RELATION')?.status, 'possible');
  assert.equal(probed.interventions.at(-1)?.diagnosisCode, 'M05_SOUND_FREQUENCY_PITCH_RELATION');
  probed = advance(acceptLatestIntervention(probed, 2_370));
  probed = changeParameter(probed, 'frequencyHz', 880, 2_371);
  probed = advance(captureMeasurement(probed, 2_372));
  probed = advance(finishCollection(probed, 2_380));
  probed = advance(submitConclusion(
    probed,
    'same_pitch',
    '补做同响度同波形的记录后，我仍认为频率变化不会改变音调',
    85,
    lowPolicy,
    2_390,
  ));
  assert.equal(probed.diagnoses.find((item) => item.code === 'M05_SOUND_FREQUENCY_PITCH_RELATION')?.status, 'supported');
  const classSummary = summarizeSessions([probed]);
  assert.equal(classSummary.needsAttention, 1);
  assert.equal(
    classSummary.diagnosisCounts.find((item) => item.code === 'M05_SOUND_FREQUENCY_PITCH_RELATION')?.count,
    1,
  );

  let transferred = createPlannedSoundSession(observePolicy, 2_400, 'same_pitch');
  transferred = recordSoundRows(transferred, [[220, 55, 3], [440, 55, 3], [660, 55, 3]], 2_410);
  transferred = advance(finishCollection(transferred, 2_450));
  transferred = advance(submitConclusion(
    transferred,
    'same_pitch',
    '我认为三组声音只是频率数字不同，音调听起来没有变化',
    80,
    observePolicy,
    2_460,
  ));
  assert.equal(transferred.diagnoses.find((item) => item.code === 'M05_SOUND_FREQUENCY_PITCH_RELATION')?.status, 'possible');
  transferred = advance(beginVerification(transferred, 2_470));
  transferred = advance(submitVerification(
    transferred,
    'lower_pitch',
    880,
    '我认为频率提高后音调反而会降低',
    2_480,
  ));
  assert.equal(transferred.verification?.passed, false);
  assert.equal(transferred.diagnoses.find((item) => item.code === 'M05_SOUND_FREQUENCY_PITCH_RELATION')?.status, 'supported');
});

test('三个实验的迁移失败都可回到实验，但必须先补充匹配诊断的存活证据', () => {
  const cases = [
    {
      experimentId: 'ohm',
      diagnosisCode: 'M01_OHM_CURRENT_CONSTANT',
      addProbe: (session, now) => (
        captureMeasurement(changeParameter(session, 'voltage', 8, now), now + 1)
      ),
      conclusionChoice: 'direct',
      conclusionText: '补充记录后可见固定电阻时电压与电流按照相同比例增大',
      verificationChoice: 'direct',
      verificationValue: 0.4,
      verificationExplanation: '新情境中仍用电流等于电压除以电阻得到零点四安培',
    },
    {
      experimentId: 'lens',
      diagnosisCode: 'M03_LENS_DISTANCE_RELATION',
      addProbe: (session, now) => (
        captureMeasurement(changeParameter(session, 'objectDistance', 50, now), now + 1)
      ),
      conclusionChoice: 'farther_smaller',
      conclusionText: '补充记录后可见固定焦距时物距增大，像距和放大率都减小',
      verificationChoice: 'real_inverted_smaller',
      verificationValue: 15,
      verificationExplanation: '新情境代入薄透镜公式后得到约十五厘米的倒立缩小实像',
    },
    {
      experimentId: 'sound',
      diagnosisCode: 'M05_SOUND_FREQUENCY_PITCH_RELATION',
      addProbe: (session, now) => (
        captureMeasurement(changeParameter(session, 'frequencyHz', 880, now), now + 1)
      ),
      conclusionChoice: 'higher_pitch',
      conclusionText: '补充记录后可见频率升高时音调读数也随之升高',
      verificationChoice: 'higher_pitch',
      verificationValue: 880,
      verificationExplanation: '新情境的频率为八百八十赫兹，因此音调也升高到八百八十赫兹',
    },
  ];

  cases.forEach(({
    experimentId,
    diagnosisCode,
    addProbe,
    conclusionChoice,
    conclusionText,
    verificationChoice,
    verificationValue,
    verificationExplanation,
  }, index) => {
    const now = 3_000 + index * 1_000;
    const failed = createFailedVerificationSession(experimentId, now);
    const failedSnapshot = structuredClone(failed.verification);
    assert.equal(failed.phase, 'complete');
    assert.equal(failed.verification?.passed, false);
    const transferCandidate = failed.diagnoses.find((item) => item.code === diagnosisCode);
    const transferEvidence = failed.evidence.find((item) => item.label === '新情境独立验证');
    assert.equal(transferCandidate?.status, 'possible');
    assert.equal(transferEvidence?.reliability, 'high');
    assert.equal(transferEvidence && transferCandidate?.evidenceRefs.includes(transferEvidence.id), true);
    assert.equal(summarizeSessions([failed]).needsAttention, 1);

    let retried = advance(retryAfterFailedVerification(failed, now + 100));
    assert.equal(retried.phase, 'experiment');
    assert.deepEqual(retried.verification, failedSnapshot);
    const intervention = retried.interventions.at(-1);
    assert.equal(intervention?.diagnosisCode, diagnosisCode);
    assert.equal(intervention?.acceptedAt, now + 100);
    assert.match(intervention?.prompt ?? '', /迁移验证未通过/);

    const retryEvent = retried.events.at(-1);
    assert.equal(retryEvent?.type, 'verification_retry_started');
    assert.equal(retryEvent?.payload.interventionId, intervention?.id);
    assert.equal(retryEvent?.payload.diagnosisCode, diagnosisCode);
    assert.equal(retryEvent?.payload.previousAnswerChoice, failedSnapshot.answerChoice);
    assert.equal(retryEvent?.payload.previousNumericAnswer, failedSnapshot.numericAnswer);
    assert.equal(retryEvent?.payload.previousExplanation, failedSnapshot.explanation);
    assert.equal(retryEvent?.payload.previousExpected, failedSnapshot.expected);
    assert.equal(retryEvent?.payload.previousFeedback, failedSnapshot.feedback);
    assert.equal(retryEvent?.payload.attempt, 1);

    const blocked = finishCollection(retried, now + 101);
    assert.equal(blocked.ok, false);
    assert.strictEqual(blocked.session, retried);
    assert.match(blocked.message, /新记录 1 组证据/);

    retried = advance(addProbe(retried, now + 102));
    if (experimentId === 'sound') {
      const deletedProbeId = retried.measurements.at(-1)?.id;
      retried = removeMeasurement(retried, deletedProbeId, now + 104);
      const deletedProbeBlocked = finishCollection(retried, now + 105);
      assert.equal(deletedProbeBlocked.ok, false);
      assert.match(deletedProbeBlocked.message, /已删除/);
      retried = advance(captureMeasurement(retried, now + 106));
    }
    const continued = finishCollection(retried, now + 110);
    assert.equal(continued.ok, true, continued.message);
    assert.equal(continued.session.phase, 'conclusion');
    const oldEvidenceOnly = submitConclusion(
      continued.session,
      conclusionChoice,
      conclusionText,
      90,
      observePolicy,
      [continued.session.measurements[0].id, continued.session.measurements[1].id],
      now + 115,
    );
    assert.equal(oldEvidenceOnly.ok, false);
    assert.match(oldEvidenceOnly.message, /本轮补做/);
    const citedIds = [continued.session.measurements[0].id, continued.session.measurements.at(-1).id];
    let verifiedAgain = advance(submitConclusion(
      continued.session,
      conclusionChoice,
      conclusionText,
      90,
      observePolicy,
      citedIds,
      now + 120,
    ));
    verifiedAgain = advance(beginVerification(verifiedAgain, now + 130));
    verifiedAgain = advance(submitVerification(
      verifiedAgain,
      verificationChoice,
      verificationValue,
      verificationExplanation,
      now + 140,
    ));
    assert.equal(verifiedAgain.verification?.passed, true);
    assert.equal(summarizeSessions([verifiedAgain]).needsAttention, 0);
    assert.equal(summarizeSessions([verifiedAgain]).verified, 1);
    assert.equal(summarizeSessions([verifiedAgain]).verificationRate, 100);
    assert.deepEqual(
      verifiedAgain.events.filter((event) => event.type === 'verification_completed').map((event) => event.payload.passed),
      [false, true],
    );
    assert.equal(
      verifiedAgain.events.find((event) => event.type === 'verification_retry_started')?.payload.previousPassed,
      false,
    );
  });
});

test('已通过迁移验证或仍在其他阶段时拒绝重试', () => {
  const prediction = createSession('阶段守卫', 'ohm', observePolicy, 7_000);
  const wrongPhase = retryAfterFailedVerification(prediction, 7_001);
  assert.equal(wrongPhase.ok, false);
  assert.strictEqual(wrongPhase.session, prediction);

  let passed = createPlannedOhmSession(observePolicy, 7_100);
  passed = recordOhmRows(passed, [[2, 20], [4, 20], [6, 20]], 7_110);
  passed = advance(finishCollection(passed, 7_150));
  passed = advance(submitConclusion(
    passed,
    'direct',
    '固定电阻时电流与电压按照相同比例共同增大',
    90,
    observePolicy,
    7_160,
  ));
  passed = advance(beginVerification(passed, 7_170));
  passed = advance(submitVerification(
    passed,
    'direct',
    0.4,
    '新情境中仍使用电流等于电压除以电阻',
    7_180,
  ));
  const passedRetry = retryAfterFailedVerification(passed, 7_190);
  assert.equal(passedRetry.ok, false);
  assert.strictEqual(passedRetry.session, passed);
  assert.equal(passedRetry.session.phase, 'complete');
});

test('演示班级的四条证据链不会因样例构造失败而停在结论阶段', () => {
  const sessions = createDemoSessions(lowPolicy, 20_000);
  assert.equal(sessions.length, 4);
  assert.equal(sessions.every((session) => session.dataOrigin === 'demo'), true);
  assert.equal(sessions.some((session) => session.phase === 'conclusion'), false);
  assert.equal(sessions.every((session) => session.conclusionEvidenceIds.length >= 2), true);
  assert.equal(sessions.every((session) => session.diagnoses.length > 0), true);

  const completed = sessions.filter((session) => session.phase === 'complete');
  assert.deepEqual(completed.map((session) => session.experimentId).sort(), ['lens', 'sound']);
  assert.equal(completed.every((session) => session.verification?.passed === true), true);
});

test('输入必须使用当前任务白名单，并显式提交结论引用', () => {
  let session = createSession('入口约束', 'ohm', lowPolicy, 30_000);
  assert.equal(submitPrediction(session, 'not-an-option', '测试有效理由', 30_001).ok, false);
  session = advance(submitPrediction(session, 'uncertain', '先测量再判断关系', 30_002));
  assert.equal(submitPlan(session, { independent: 'frequencyHz', dependent: 'current', control: 'resistance' }, 30_003).ok, false);
  session = advance(submitPlan(session, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 30_004));
  assert.strictEqual(changeParameter(session, 'frequencyHz', 400, 30_005), session);
  assert.strictEqual(changeParameter(session, 'voltage', NaN, 30_006), session);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 30_010);
  session = advance(finishCollection(session, 30_050));
  const missingCitation = submitConclusionEngine(session, 'direct', '三组记录显示电流与电压同比例变化', 80, lowPolicy, 30_060);
  assert.equal(missingCitation.ok, false);
  assert.match(missingCitation.message, /明确选择/);
  assert.equal(submitConclusion(session, 'not-an-option', '三组记录显示电流与电压同比例变化', 80, lowPolicy, 30_061).ok, false);
});

test('允许按非标准计划采集并在补证时修订，不把学生锁死在错误方案中', () => {
  let session = createSession('方案修订', 'ohm', lowPolicy, 31_000);
  session = advance(submitPrediction(session, 'uncertain', '先固定电压试一试', 31_001));
  session = advance(submitPlan(session, { independent: 'resistance', dependent: 'current', control: 'voltage' }, 31_002));
  session = recordOhmRows(session, [[3, 10], [3, 20], [3, 30]], 31_010);
  session = advance(finishCollection(session, 31_050));
  session = advance(submitConclusion(session, 'insufficient', '我改变的是电阻，不能用这三组数据判断固定电阻时的电流电压关系', 70, lowPolicy, 31_060));
  assert.equal(session.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE').status, 'supported');
  assert.equal(session.diagnoses.find((item) => item.code === 'P02_EVIDENCE_ALIGNMENT').status, 'resolved');
  session = advance(acceptLatestIntervention(session, 31_070));
  for (const row of session.measurements) session = removeMeasurement(session, row.id, 31_071);
  session = advance(submitPlan(session, { independent: 'voltage', dependent: 'current', control: 'resistance' }, 31_080));
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 31_100);
  session = advance(finishCollection(session, 31_150));
  session = advance(submitConclusion(session, 'direct', '新方案固定电阻后电流与电压同比例增大', 85, lowPolicy, 31_160));
  assert.equal(session.diagnoses.find((item) => item.code === 'P01_CONTROL_VARIABLE').status, 'resolved');
  assert.equal(session.events.filter((event) => event.type === 'plan_submitted').length, 2);
  assert.equal(session.events.filter((event) => event.type === 'evidence_recorded').length, 6);
});

test('重做结论后不会重新激活被旧诊断遗留的未接受提示', () => {
  let session = createPlannedOhmSession(lowPolicy, 32_000);
  session = recordOhmRows(session, [[2, 20], [4, 20], [6, 20]], 32_010);
  session = advance(finishCollection(session, 32_050));
  session = advance(submitConclusion(session, 'same', '我仍认为电压改变不会改变电流大小', 80, lowPolicy, 32_060));
  const pendingId = session.interventions[0].id;
  session = applyTeacherOverride(session, 'M01_OHM_CURRENT_CONSTANT', 'insufficient', '保持电阻不变再改变电压做对照', 32_070);
  session = recordOhmRows(session, [[8, 20]], 32_080);
  session = advance(finishCollection(session, 32_100));
  session = advance(submitConclusion(session, 'direct', '比较原始记录与新增记录，电流跟随电压同比例增大', 90, lowPolicy, 32_110));
  assert.equal(session.interventions.find((item) => item.id === pendingId).closedAt, 32_110);
  assert.equal(acceptLatestIntervention(session, 32_120).ok, false);
});

test('五类误概念升级时均可追溯到构成探针的两条实验采集事件', () => {
  const cases = [
    { experiment: 'ohm', code: 'M01_OHM_CURRENT_CONSTANT', choice: 'same', plan: { independent: 'voltage', dependent: 'current', control: 'resistance' }, rows: [[2, 20], [4, 20], [6, 20]], record: recordOhmRows, probe: [[8, 20]] },
    { experiment: 'lens', code: 'M02_LENS_SCREEN_POSITION', choice: 'screen_controls', plan: { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' }, rows: [15, 20, 30], record: recordLensRows, screenProbe: true },
    { experiment: 'lens', code: 'M03_LENS_DISTANCE_RELATION', choice: 'farther_bigger', plan: { independent: 'objectDistance', dependent: 'imageDistance', control: 'focalLength' }, rows: [15, 20, 30], record: recordLensRows, probe: [40] },
    { experiment: 'sound', code: 'M04_SOUND_LOUDNESS_PITCH', choice: 'loudness_controls_pitch', plan: { independent: 'frequencyHz', dependent: 'pitchHz', control: 'loudnessAndWaveform' }, rows: [[200, 50, 0], [400, 50, 0], [600, 50, 0]], record: recordSoundRows, probe: [[600, 20, 0]] },
    { experiment: 'sound', code: 'M05_SOUND_FREQUENCY_PITCH_RELATION', choice: 'same_pitch', plan: { independent: 'frequencyHz', dependent: 'pitchHz', control: 'loudnessAndWaveform' }, rows: [[200, 50, 0], [400, 50, 0], [600, 50, 0]], record: recordSoundRows, probe: [[800, 50, 0]] },
  ];
  for (const [index, config] of cases.entries()) {
    const now = 33_000 + index * 1_000;
    let session = createSession('探针追溯', config.experiment, lowPolicy, now);
    session = advance(submitPrediction(session, config.choice, '这是我的初始关系预测', now + 1));
    session = advance(submitPlan(session, config.plan, now + 2));
    session = config.record(session, config.rows, now + 10);
    session = advance(finishCollection(session, now + 50));
    session = advance(submitConclusion(session, config.choice, '根据当前三组实验数据我仍然坚持初始观点', 80, lowPolicy, now + 60));
    assert.equal(session.interventions.at(-1).diagnosisCode, config.code);
    session = advance(acceptLatestIntervention(session, now + 70));
    if (config.screenProbe) {
      session = changeParameter(session, 'screenPosition', 25, now + 80);
      session = advance(captureMeasurement(session, now + 81));
    } else session = config.record(session, config.probe, now + 80);
    const probeId = session.measurements.at(-1).id;
    session = advance(finishCollection(session, now + 100));
    session = advance(submitConclusion(session, config.choice, '新增对照以后我依然坚持原来作出的关系判断', 85, lowPolicy, now + 110));
    const diagnosis = session.diagnoses.find((item) => item.code === config.code);
    assert.equal(diagnosis.status, 'supported', config.code);
    const linkedRecords = session.evidence.filter((item) => diagnosis.evidenceRefs.includes(item.id))
      .flatMap((item) => item.eventRefs).map((id) => session.events.find((event) => event.id === id))
      .filter((event) => event?.type === 'evidence_recorded');
    assert.equal(linkedRecords.length, 2, config.code);
    assert.equal(linkedRecords.some((event) => event.payload.measurementId === probeId), true, config.code);
  }
});
