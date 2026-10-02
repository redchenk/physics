import assert from 'node:assert/strict';
import test from 'node:test';
import '../labs/workspace.js';
import '../electricity/circuit-physics.js';
import '../optics/physics.js';

const { createStore } = globalThis.LabWorkspace;
const { validateCircuit, createExample, solveCircuit } = globalThis.CircuitPhysics;
const validate = (value) => {
  if (!value || value.version !== 1) throw new Error('invalid');
  return { version: 1, circuit: validateCircuit(value.circuit) };
};
function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('电路完整备份保留三端变阻器、接线与手动走向，恢复后读数一致', () => {
  const circuit = createExample('ohm');
  circuit.wires[0].waypoints = [{ x: 350, y: 250 }];
  const clean = validateCircuit(JSON.parse(JSON.stringify(circuit)));
  assert.deepEqual(clean, circuit);
  assert.deepEqual(solveCircuit(clean.components, clean.wires), solveCircuit(circuit.components, circuit.wires));
  for (const type of ['rheostat', 'junction']) {
    const c = globalThis.CircuitPhysics.createComponent(type, type, 400, 400);
    assert.deepEqual(validateCircuit({ components: [c], wires: [] }).components[0], c);
  }
});

test('电路导入拒绝重复 ID、不存在的端子、越界路径与无效参数', () => {
  for (const damage of [
    (s) => { s.components[0].id = '__proto__'; },
    (s) => s.components.push(s.components[0]),
    (s) => { s.wires[0].to = 'missing:a'; },
    (s) => { s.components[0].value = -1; },
    (s) => { s.components[0].rotation = 45; },
    (s) => { s.wires[0].manual = [{ x: 0, y: 0 }, { x: 400, y: 400 }]; },
    (s) => { s.components[0].label = '<img>'; },
  ]) { const circuit = createExample('ohm'); damage(circuit); assert.throws(() => validateCircuit(circuit)); }
});

test('自动保存可在新页面恢复装置，保存失败时不宣称已保存', () => {
  const disk = storage(), messages = [], value = { version: 1, circuit: createExample('parallel') };
  const first = createStore('test', validate, (message) => messages.push(message), disk);
  assert.equal(first.load(), null); assert.equal(first.save(value), true);
  assert.deepEqual(createStore('test', validate, null, disk).load(), value);
  disk.setItem = () => { throw new Error('quota'); };
  value.circuit.components[0].value = 12;
  assert.equal(first.save(value), false); assert.match(messages.at(-1), /失败/);
});

test('两个实验页面同时打开时，旧页面不能覆盖另一页面的新装置', () => {
  const disk = storage(), messages = [];
  const first = createStore('test', validate, null, disk), second = createStore('test', validate, (message) => messages.push(message), disk);
  first.load(); second.load();
  first.save({ version: 1, circuit: createExample('series') });
  const latest = disk.getItem('test');
  assert.equal(second.save({ version: 1, circuit: createExample('empty') }), false);
  assert.equal(disk.getItem('test'), latest); assert.match(messages.at(-1), /另一页面/);
});

test('损坏或不支持的保存版本不会在启动时被空白实验覆盖', () => {
  for (const raw of ['broken-json', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, circuit: { components: [{}], wires: [] } })]) {
    const disk = storage(); disk.setItem('test', raw);
    const store = createStore('test', validate, null, disk);
    assert.equal(store.load(), null);
    assert.equal(store.save({ version: 1, circuit: createExample('empty') }), false);
    assert.equal(disk.getItem('test'), raw);
  }
});

test('新增凸透镜成像装置的顶端光线在 2f 光屏相交，凹透镜使光束发散', () => {
  const O = globalThis.OpticsPhysics;
  const image = O.trace(O.example('image'));
  assert.equal(image.hits.length, 5);
  assert.ok(image.hits.every((h) => Math.abs(h.point.y - 365) < 1e-5));
  const divergent = O.trace(O.example('diverging'));
  assert.equal(divergent.hits.length, 5);
  const span = Math.max(...divergent.hits.map((h) => h.offset)) - Math.min(...divergent.hits.map((h) => h.offset));
  assert.ok(span > 8);
});
