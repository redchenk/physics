import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import '../electricity/circuit-physics.js';

const { createComponent, createExample, solveCircuit, SOURCE_R, AMMETER_R } = globalThis.CircuitPhysics;
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const run = (circuit) => solveCircuit(circuit.components, circuit.wires);
const wire = (from, to) => ({ id: `${from}-${to}`, from, to });
const part = (type, id, overrides = {}) => ({ ...createComponent(type, id, 100, 100), ...overrides });

test('空白实验台和没有电源的元件不会制造电流', () => {
  assert.equal(run(createExample('empty')).status, 'no-source');
  const result = solveCircuit([part('ammeter', 'a'), part('resistor', 'r')], [wire('a:a', 'r:a'), wire('a:b', 'r:b')]);
  close(result.readings.a.value, 0);
});
test('伏安法按实际支路求解，电压表不分流，电源和电流表内阻计入', () => {
  const result = run(createExample('ohm'));
  const current = 6 / (30 + SOURCE_R + AMMETER_R);
  assert.equal(result.status, 'closed');
  close(result.readings.a1.value, current);
  close(result.readings.v1.value, current * 30);
  close(result.readings.e1.current, current);
});
test('串联电阻电流相同，电压表只测被跨接的一个电阻', () => {
  const result = run(createExample('series'));
  const current = 6 / (90 + SOURCE_R + AMMETER_R);
  close(result.readings.r1.current, current);
  close(result.readings.r2.current, current);
  close(result.readings.v1.value, current * 30);
});
test('并联支路电流不同，干路电流等于支路之和', () => {
  const result = run(createExample('parallel'));
  close(result.readings.a1.value, 6 / (20 + SOURCE_R + AMMETER_R));
  close(result.readings.r1.voltage, result.readings.r2.voltage);
  close(result.readings.r1.current, 2 * result.readings.r2.current);
  close(result.readings.a1.current, result.readings.r1.current + result.readings.r2.current);
});
test('把电流表从干路移到支路后读数随接线变化', () => {
  const circuit = createExample('parallel');
  circuit.wires = circuit.wires.filter((w) => ![w.from, w.to].some((key) => key.startsWith('a1:')));
  circuit.wires.push(wire('s1:b', 'r1:a'), wire('r2:b', 'a1:a'), wire('a1:b', 'e1:b'));
  circuit.wires = circuit.wires.filter((w) => !(w.from === 'r2:b' && w.to === 'r1:b'));
  const result = run(circuit);
  close(result.readings.a1.value, result.readings.r2.current);
  assert.ok(result.readings.a1.value < result.readings.e1.current);
});
test('同一接线柱支持多根导线和独立分线点', () => {
  const circuit = createExample('parallel'), original = run(circuit);
  circuit.components.push(part('junction', 'j'));
  circuit.wires = circuit.wires.map((w) => ({ ...w, from: w.from === 'r1:a' ? 'j:a' : w.from, to: w.to === 'r1:a' ? 'j:a' : w.to }));
  circuit.wires.push(wire('j:a', 'r1:a'));
  close(run(circuit).readings.a1.value, original.readings.a1.value);
});
test('断开开关后电流归零，重新闭合恢复', () => {
  const circuit = createExample('ohm');
  circuit.components.find((c) => c.type === 'switch').closed = false;
  const result = run(circuit);
  assert.equal(result.status, 'open'); close(result.readings.a1.value, 0); close(result.readings.v1.value, 0);
  circuit.components.find((c) => c.type === 'switch').closed = true;
  assert.equal(run(circuit).status, 'closed');
});
test('电流表和电压表反接得到负读数及明确提示', () => {
  const circuit = createExample('ohm');
  circuit.wires = circuit.wires.map((w) => {
    const reverse = (key) => /^[av]1:/.test(key) ? key.slice(0, -1) + (key.endsWith('a') ? 'b' : 'a') : key;
    return { ...w, from: reverse(w.from), to: reverse(w.to) };
  });
  const result = run(circuit);
  assert.ok(result.readings.a1.value < 0 && result.readings.v1.value < 0);
  assert.equal(result.readings.a1.reversed, true); assert.equal(result.readings.v1.reversed, true);
});
test('电表量程独立于物理计算，超量程仍保留带符号的计算结果', () => {
  const circuit = createExample('ohm');
  circuit.components.find((c) => c.id === 'v1').range = 3;
  assert.equal(run(circuit).readings.v1.overload, true);
  circuit.components.find((c) => c.id === 'v1').range = 15;
  assert.equal(run(circuit).readings.v1.overload, false);
});
test('电压表串联阻断直流，但可测得接线柱之间的电压', () => {
  const result = solveCircuit([part('battery', 'e'), part('voltmeter', 'v', { range: 15 }), part('lamp', 'l')], [wire('e:a', 'v:a'), wire('v:b', 'l:a'), wire('l:b', 'e:b')]);
  assert.equal(result.status, 'open'); close(result.readings.l.current, 0); close(result.readings.v.value, 6);
});
test('电压表浮空或跨接不同独立电路时不显示伪造电压', () => {
  const circuit = createExample('ohm');
  circuit.wires = circuit.wires.filter((w) => w.from !== 'v1:b');
  assert.equal(run(circuit).readings.v1.value, null);
  circuit.components.push(part('battery', 'e2'));
  circuit.wires.push(wire('v1:b', 'e2:b'));
  assert.equal(run(circuit).readings.v1.value, null);
});
test('电压表两端接在同一节点时为零，不以导线位置判定连接', () => {
  const circuit = createExample('ohm');
  circuit.wires.find((w) => w.from === 'v1:b').to = 'r1:a';
  close(run(circuit).readings.v1.value, 0);
  circuit.components.forEach((c) => { c.x = 50; c.y = 50; c.rotation = 90; });
  close(run(circuit).readings.a1.value, 6 / 30.11);
});
for (const mode of ['wire', 'ammeter', 'switch']) test(`${mode}直接跨接电源检测短路，暂停所有读数`, () => {
  const components = [part('battery', 'e')];
  let wires = [wire('e:a', 'e:b')];
  if (mode !== 'wire') {
    components.push(part(mode, 'x', { closed: true }));
    wires = [wire('e:a', 'x:a'), wire('x:b', 'e:b')];
  }
  const result = solveCircuit(components, wires);
  assert.equal(result.status, 'short'); assert.equal(result.valid, false); assert.deepEqual(result.readings, {});
});
test('删除短路导线恢复正常，零电压电源不产生虚假短路电流', () => {
  const circuit = createExample('ohm'); circuit.wires.push(wire('e1:a', 'e1:b'));
  assert.equal(run(circuit).status, 'short'); circuit.wires.pop(); assert.equal(run(circuit).status, 'closed');
  circuit.components[0].value = 0; close(run(circuit).readings.a1.value, 0);
});
test('滑动变阻器 A-W 与 B-W 互补，A-B 接法不受滑片影响', () => {
  const components = [part('battery', 'e'), part('rheostat', 'r', { value: 100, position: 0.25 })];
  const measure = (a, b) => solveCircuit(components, [wire('e:a', `r:${a}`), wire(`r:${b}`, 'e:b')]).readings.e.current;
  close(measure('a', 'w'), 6 / 25.1); close(measure('b', 'w'), 6 / 75.1); close(measure('a', 'b'), 6 / 100.1);
  components[1].position = 0.7; close(measure('a', 'b'), 6 / 100.1);
  components[1].position = 0;
  assert.equal(solveCircuit(components, [wire('e:a', 'r:a'), wire('r:w', 'e:b')]).status, 'short');
  close(measure('a', 'b'), 6 / 100.1);
});
test('两电源串联同向相加，反向相抵；并联由内阻分配电流', () => {
  const components = [part('battery', 'e1'), part('battery', 'e2'), part('resistor', 'r')];
  const series = solveCircuit(components, [wire('e1:b', 'e2:a'), wire('e1:a', 'r:a'), wire('r:b', 'e2:b')]);
  close(series.readings.r.current, 12 / 30.2);
  const opposed = solveCircuit(components, [wire('e1:b', 'e2:b'), wire('e1:a', 'r:a'), wire('r:b', 'e2:a')]);
  close(opposed.readings.r.current, 0);
  const parallel = solveCircuit(components, [wire('e1:a', 'e2:a'), wire('e1:b', 'e2:b'), wire('e1:a', 'r:a'), wire('r:b', 'e1:b')]);
  close(parallel.readings.r.current, 6 / 30.05);
  close(parallel.readings.e1.current, parallel.readings.e2.current);
});
test('任意桥式拓扑满足节点电流守恒和平衡桥零电流', () => {
  const components = [part('battery', 'e'), ...['r1', 'r2', 'r3', 'r4'].map((id) => part('resistor', id)), part('ammeter', 'a')];
  const wires = [wire('e:a', 'r1:a'), wire('e:a', 'r3:a'), wire('r1:b', 'r2:a'), wire('r3:b', 'r4:a'), wire('r2:b', 'e:b'), wire('r4:b', 'e:b'), wire('r1:b', 'a:a'), wire('r3:b', 'a:b')];
  close(solveCircuit(components, wires).readings.a.value, 0);
  components.find((c) => c.id === 'r1').value = 60;
  const { readings: r } = solveCircuit(components, wires);
  close(r.r1.current, r.r2.current + r.a.current);
  close(r.r3.current + r.a.current, r.r4.current);
  close(r.e.current, r.r1.current + r.r3.current);
});
test('灯泡功率随实际电压变化，电压翻倍时定阻模型功率变四倍', () => {
  const components = [part('battery', 'e', { value: 3 }), part('lamp', 'l')];
  const wires = [wire('e:a', 'l:a'), wire('l:b', 'e:b')];
  const initial = solveCircuit(components, wires).readings.l.power;
  components[0].value = 6; close(solveCircuit(components, wires).readings.l.power, initial * 4);
});
test('非法参数、悬空导线和重复元件标识被拒绝', () => {
  assert.throws(() => solveCircuit([part('resistor', 'r', { value: NaN })], []));
  assert.throws(() => solveCircuit([part('rheostat', 'r', { position: 2 })], []));
  assert.throws(() => solveCircuit([part('ammeter', 'a', { range: 0 })], []));
  assert.throws(() => solveCircuit([], [wire('missing:a', 'missing:b')]));
  assert.throws(() => solveCircuit([part('resistor', 'r'), part('resistor', 'r')], []));
});
test('输入快照不被求解器改写，独立子电路互不影响', () => {
  const circuit = createExample('ohm'), before = JSON.stringify(circuit);
  const initial = run(circuit); assert.equal(JSON.stringify(circuit), before);
  circuit.components.push(part('battery', 'extra'), part('lamp', 'light'));
  circuit.wires.push(wire('extra:a', 'light:a'), wire('light:b', 'extra:b'));
  close(run(circuit).readings.a1.value, initial.readings.a1.value);
});
test('自由搭建在离线、旧地址和内嵌地址使用相同计算和编辑脚本', async () => {
  for (const filename of ['circuit-physics.js', 'circuit-builder.js', 'circuit-builder.css']) {
    const source = await readFile(new URL(`../electricity/${filename}`, import.meta.url), 'utf8');
    for (const base of ['public/electricity', 'public/classroom/electricity']) assert.equal(await readFile(new URL(`../${base}/${filename}`, import.meta.url), 'utf8'), source);
  }
  const source = await readFile(new URL('../电学仿真实验室.html', import.meta.url), 'utf8');
  assert.match(source, /id="circuitBuilder"/); assert.match(source, /id="builderTab"/);
  assert.match(source, /src="electricity\/circuit-physics.js"/); assert.match(source, /src="electricity\/circuit-builder.js"/);
});
