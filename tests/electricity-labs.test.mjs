import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Script } from 'node:vm';
import '../electricity/circuit-physics.js';
import '../electricity/lab-models.js';
import '../electricity/lab-visuals.js';
import '../electricity/wire-router.js';

const M = globalThis.ElectricModels, R = globalThis.WireRouter;
const { createComponent, createExample, solveCircuit } = globalThis.CircuitPhysics;
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test('欧姆实验电源电压等于两段分压，电源功率等于负载与变阻器功率之和', () => {
  for (const source of [3, 6, 12]) for (const resistance of [5, 20, 60]) for (const rheostat of [0, 20, 120]) {
    const m = M.ohm({ source, resistance, rheostat, closed: true });
    close(m.voltage + m.rheostatVoltage, source);
    close(m.voltage / m.current, resistance);
    close(source * m.current, m.power + m.current ** 2 * rheostat);
  }
  const off = M.ohm({ source: 6, resistance: 20, rheostat: 20, closed: false });
  assert.equal(off.current, 0); assert.equal(off.voltage, 0);
});

test('I–R 实验调整变阻器后保持 2 V，电流与 R 成反比', () => {
  for (const resistance of [5, 10, 20, 40, 60]) {
    const m = M.ohm({ source: 6, resistance, rheostat: resistance * 2, closed: true });
    close(m.voltage, 2); close(m.current * resistance, 2);
  }
});

test('串并联满足电流、电压和功率守恒，任意支路断开符合实际拓扑', () => {
  for (const topology of ['series', 'parallel']) for (const s1 of [false, true]) for (const s2 of [false, true]) {
    const m = M.network({ source: 6, r1: 20, r2: 40, topology, s1, s2 });
    close(m.p1 + m.p2, 6 * m.current);
    if (topology === 'series') {
      close(m.i1, m.i2); close(m.current, m.i1);
      if (s1 && s2) close(m.v1 + m.v2, 6);
      else { assert.equal(m.current, 0); assert.equal(m.p1 + m.p2, 0); }
    } else {
      close(m.current, m.i1 + m.i2);
      close(m.i1, s1 ? 0.3 : 0); close(m.i2, s2 ? 0.15 : 0);
      close(m.v1, s1 ? 6 : 0); close(m.v2, s2 ? 6 : 0);
    }
  }
});

test('灯泡零功率熄灭，功率增加时发光增强，过高功率显示亮度有上限', () => {
  assert.equal(M.lampState(0).on, false);
  assert.equal(M.lampState(0).label, '未亮');
  const states = [0.005, 0.03, 0.3, 1.8, 10].map(M.lampState);
  assert.ok(states.every((s) => s.on && s.level > 0 && s.level <= 1));
  assert.ok(states.every((s, i) => !i || s.level >= states[i - 1].level));
  assert.equal(states.at(-1).level, 1);
  assert.match(globalThis.ElectricVisuals.lamp(1.8), /#fffbe0/);
  assert.doesNotMatch(globalThis.ElectricVisuals.lamp(0), /#fffbe0/);
});

test('电表低电流刻度不被取整成重复数字', () => {
  const markup = globalThis.ElectricVisuals.gauge(0.15, 0.6, 'A', '电流表');
  for (const label of ['0.0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6']) assert.ok(markup.includes(`>${label}</text>`));
});

test('定值电阻正反向特性为直线，灯泡电阻随温升工作点增大', () => {
  for (const voltage of [-12, -6, 0, 6, 12]) {
    const resistor = M.iv('resistor', voltage), bulb = M.iv('bulb', voltage);
    close(resistor.current * 30, voltage);
    close(10 * bulb.current + 80 * bulb.current ** 3, voltage);
    close(M.iv('bulb', -voltage).current, -bulb.current);
    assert.ok(bulb.power >= 0);
  }
  assert.ok(M.iv('bulb', 12).resistance > M.iv('bulb', 6).resistance);
  assert.ok(M.iv('bulb', 6).resistance > M.iv('bulb', 1).resistance);
});

test('二极管反向电流极小，正向电流非线性增大，零电压不产生电流', () => {
  assert.equal(M.iv('diode', 0).current, 0);
  assert.ok(Math.abs(M.iv('diode', -0.8).current) < 1e-8);
  assert.ok(M.iv('diode', 0.8).current > 100 * M.iv('diode', 0.6).current);
  assert.ok(M.iv('diode', 0.8).current < 0.5);
});

const magnet = { position: -6, velocity: 4, turns: 300, field: 0.3, polarity: 1, closed: true };
test('磁铁静止无感应，反向运动或对调磁极使电动势反号', () => {
  const m = M.induction(magnet);
  assert.ok(m.emf < 0);
  close(M.induction({ ...magnet, velocity: 0 }).emf, 0);
  close(M.induction({ ...magnet, velocity: -4 }).emf, -m.emf);
  close(M.induction({ ...magnet, polarity: -1 }).emf, -m.emf);
  close(M.induction({ ...magnet, position: 6 }).emf, -m.emf);
  close(M.induction({ ...magnet, position: 0 }).emf, 0);
});

test('感应电动势符合独立数值微分的法拉第定律，速度、匝数、场强成比例', () => {
  const h = 1e-4, m = M.induction(magnet);
  const before = M.induction({ ...magnet, position: magnet.position - magnet.velocity * h }).flux;
  const after = M.induction({ ...magnet, position: magnet.position + magnet.velocity * h }).flux;
  close(m.emf, -magnet.turns * (after - before) / (2 * h), 1e-8);
  for (const key of ['velocity', 'turns', 'field']) close(M.induction({ ...magnet, [key]: magnet[key] * 2 }).emf, 2 * m.emf);
  const open = M.induction({ ...magnet, closed: false });
  close(open.emf, m.emf); assert.equal(open.current, 0); close(m.current * 20, m.emf);
});

function assertRoute(route, components, wire) {
  assert.equal(route.failed, false, wire.id);
  const endpoint = (key) => { const [id, port] = key.split(':'); return R.terminal(components.find((c) => c.id === id), port); };
  const a = endpoint(wire.from), b = endpoint(wire.to);
  close(route.points[0].x, a.x); close(route.points[0].y, a.y);
  close(route.points.at(-1).x, b.x); close(route.points.at(-1).y, b.y);
  for (let i = 1; i < route.points.length; i++) {
    const p = route.points[i - 1], q = route.points[i];
    assert.ok(p.x === q.x || p.y === q.y, '导线应水平或竖直');
    assert.ok(q.x >= 0 && q.x <= 960 && q.y >= 0 && q.y <= 650);
  }
}

test('所有起始电路均能避障布线，精确连接各接线柱', () => {
  for (const kind of ['lamp', 'ohm', 'series', 'parallel']) {
    const { components, wires } = createExample(kind);
    const routes = R.routeWires(components, wires);
    routes.forEach((route, i) => assertRoute(route, components, wires[i]));
    // Interior segments must not cut through a component body.
    for (const route of routes) for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i], length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      for (let d = 0; d <= length; d += 2) {
        const x = a.x + (b.x - a.x) * d / (length || 1), y = a.y + (b.y - a.y) * d / (length || 1);
        for (const c of components) {
          const vertical = c.rotation % 180 !== 0;
          assert.ok(Math.abs(x - c.x) >= (vertical ? 28 : 52) || Math.abs(y - c.y) >= (vertical ? 52 : 28), `${kind}/${route.id} 穿过 ${c.id}`);
        }
      }
    }
  }
});

test('密集平行线路选择不同通道，不将无关线路画成长段重合', () => {
  const components = [createComponent('resistor', 'r1', 200, 200), createComponent('resistor', 'r2', 200, 400), createComponent('resistor', 'r3', 700, 200), createComponent('resistor', 'r4', 700, 400)];
  const wires = [{ id: 'w1', from: 'r1:b', to: 'r4:a' }, { id: 'w2', from: 'r2:b', to: 'r3:a' }];
  const routes = R.routeWires(components, wires), edges = new Set();
  routes.forEach((route, i) => {
    assertRoute(route, components, wires[i]);
    for (let j = 1; j < route.points.length; j++) {
      const a = route.points[j - 1], b = route.points[j], length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      for (let n = 0; n < length; n++) {
        const x = a.x + Math.sign(b.x - a.x) * n, y = a.y + Math.sign(b.y - a.y) * n;
        const nx = x + Math.sign(b.x - a.x), ny = y + Math.sign(b.y - a.y);
        const key = [`${x},${y}`, `${nx},${ny}`].sort().join('|');
        assert.ok(!edges.has(key), `无关导线重合 ${key}`); edges.add(key);
      }
    }
  });
});

test('元件旋转及变阻器 A、B、W 三个端子均可布线，标注不堵住出口', () => {
  for (const rotation of [0, 90, 180, 270]) for (const port of ['a', 'b', 'w']) {
    const components = [{ ...createComponent('rheostat', 'rp', 430, 300), rotation }, createComponent('junction', 'j', 800, 500)];
    const wire = { id: 'w', from: `rp:${port}`, to: 'j:a' };
    assertRoute(R.routeWires(components, [wire])[0], components, wire);
  }
});

test('手动路径经过指定点；只改走向不改变电路计算；移除路径后恢复自动', () => {
  const circuit = createExample('ohm'), original = solveCircuit(circuit.components, circuit.wires);
  circuit.wires[0].via = { x: 430, y: 250 };
  const route = R.routeWires(circuit.components, circuit.wires)[0];
  assertRoute(route, circuit.components, circuit.wires[0]);
  assert.deepEqual(route.handle, { x: 430, y: 250 });
  assert.ok(route.points.some((p, i) => { const q = route.points[i + 1]; return q && (p.x === 430 && q.x === 430 && Math.min(p.y, q.y) <= 250 && Math.max(p.y, q.y) >= 250 || p.y === 250 && q.y === 250 && Math.min(p.x, q.x) <= 430 && Math.max(p.x, q.x) >= 430); }));
  close(solveCircuit(circuit.components, circuit.wires).readings.a1.value, original.readings.a1.value);
  delete circuit.wires[0].via;
  assert.equal(R.routeWires(circuit.components, circuit.wires)[0].failed, false);
});

test('手动点落入元件内部时明确报告布线失败', () => {
  const { components, wires } = createExample('ohm');
  wires[0].via = { x: components[2].x, y: components[2].y };
  assert.equal(R.routeWires(components, wires)[0].failed, true);
});

test('向起始电路添加电压表时不会堵住已有导线的接线出口', () => {
  for (const kind of ['lamp', 'ohm', 'series', 'parallel']) {
    const { components, wires } = createExample(kind);
    const { x, y } = R.findPlacement(components, wires, 'voltmeter');
    components.push(createComponent('voltmeter', 'extra', x, y));
    assert.ok(R.routeWires(components, wires).every((r) => !r.failed), kind);
  }
});

test('示例按支路摆放，无无关交叉或重叠，并联公共线合并且有四个分支点', () => {
  for (const kind of ['lamp', 'ohm', 'series', 'parallel']) {
    const c = createExample(kind), routes = R.routeWires(c.components, c.wires), scene = R.scene(routes);
    assert.deepEqual(scene.conflicts, [], kind); assert.equal(scene.crossings.length, 0, kind);
    if (kind === 'parallel') {
      assert.equal(scene.junctions.length, 4);
      const length = (items) => items.reduce((sum, r) => sum + r.points.slice(1).reduce((n, p, i) => n + Math.abs(p.x - r.points[i].x) + Math.abs(p.y - r.points[i].y), 0), 0);
      assert.ok(length(scene.paths) <= length(routes) - 400, '共用支路应只画一次');
    }
  }
});

test('跨线桥只用于不同节点，同节点交叉为实心分支，异节点贴接必须拒绝', () => {
  const h = { id: 'h', net: 'a', points: [{ x: 100, y: 300 }, { x: 700, y: 300 }] };
  const v = { id: 'v', net: 'b', points: [{ x: 400, y: 100 }, { x: 400, y: 500 }] };
  const crossing = R.scene([h, v]);
  assert.equal(crossing.crossings.length, 1); assert.equal(crossing.junctions.length, 0);
  assert.deepEqual(crossing.conflicts, []);
  const connected = R.scene([h, { ...v, net: 'a' }]);
  assert.equal(connected.crossings.length, 0); assert.equal(connected.junctions.length, 1);
  assert.equal(R.scene([h, { ...v, points: [{ x: 400, y: 300 }, { x: 400, y: 500 }] }]).conflicts.length, 2);
});

test('整段拖动固定两端，保持直角与测量结果，其他导线走向不变', () => {
  const c = createExample('ohm'), original = R.routeWires(c.components, c.wires), before = solveCircuit(c.components, c.wires);
  const points = R.editPoints(original[0].points);
  c.wires[0].manual = R.moveSegment(points, 1, 80);
  const next = R.routeWires(c.components, c.wires, { previous: original });
  next.forEach((r, i) => assertRoute(r, c.components, c.wires[i]));
  assert.deepEqual(R.scene(next).conflicts, []);
  assert.deepEqual(next.slice(1).map((r) => r.points), original.slice(1).map((r) => r.points));
  assert.ok(next[0].points.some((p) => p.y === 210));
  assert.deepEqual(solveCircuit(c.components, c.wires), before);
});

test('手动线路不能穿过元件或逆向折回接线柱，移动端点后仍连接实际位置', () => {
  const c = createExample('ohm'), original = R.routeWires(c.components, c.wires);
  c.wires[0].manual = R.moveSegment(R.editPoints(original[0].points), 1, 80);
  let next = R.routeWires(c.components, c.wires, { previous: original });
  c.components[1].x += 30;
  next = R.routeWires(c.components, c.wires, { previous: next });
  assertRoute(next[0], c.components, c.wires[0]);
  c.wires[0].manual = [{ x: 215, y: 130 }, { x: 200, y: 130 }, { x: 200, y: 210 }, { x: 350, y: 210 }, { x: 350, y: 130 }, { x: 375, y: 130 }];
  assert.equal(R.routeWires(c.components, c.wires)[0].failed, true);
});

test('移动并联电阻保持无关线路稳定，恢复历史走向可精确重现', () => {
  const c = createExample('parallel'), before = R.routeWires(c.components, c.wires), snapshot = structuredClone(c);
  c.components.find((p) => p.id === 'r2').x -= 50;
  const after = R.routeWires(c.components, c.wires, { previous: before });
  after.forEach((r, i) => assertRoute(r, c.components, c.wires[i]));
  for (const id of ['w1', 'w2', 'w3']) assert.deepEqual(after.find((r) => r.id === id).points, before.find((r) => r.id === id).points);
  assert.deepEqual(R.scene(after).conflicts, []);
  assert.deepEqual(R.routeWires(snapshot.components, snapshot.wires, { previous: before }), before);
});

test('多个手动拐点按顺序经过，路径没有折回重叠', () => {
  const c = createExample('lamp'); c.wires[2].waypoints = [{ x: 740, y: 490 }, { x: 400, y: 490 }, { x: 160, y: 490 }];
  const route = R.routeWires(c.components, c.wires)[2]; assertRoute(route, c.components, c.wires[2]);
  assert.ok(route.points.some((p) => p.y === 490));
  for (let i = 1; i < route.points.length - 1; i++) {
    const a = route.points[i - 1], b = route.points[i], d = route.points[i + 1];
    assert.ok((b.x - a.x) * (d.x - b.x) + (b.y - a.y) * (d.y - b.y) >= 0, '不得形成折回尖刺');
  }
});

test('全部电学资源在独立页、旧地址、内嵌课堂保持一致且脚本语法有效', async () => {
  for (const filename of await readdir(new URL('../electricity/', import.meta.url))) {
    const source = await readFile(new URL(`../electricity/${filename}`, import.meta.url), 'utf8');
    if (filename.endsWith('.js')) assert.doesNotThrow(() => new Script(source));
    for (const directory of ['public/electricity', 'public/classroom/electricity']) assert.equal(await readFile(new URL(`../${directory}/${filename}`, import.meta.url), 'utf8'), source, `${directory}/${filename}`);
  }
});
