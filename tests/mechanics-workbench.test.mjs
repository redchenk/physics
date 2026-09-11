import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import '../mechanics/physics.js';
import '../mechanics/interactions.js';
import '../mechanics/workbench-core.js';

const M = globalThis.Mechanics;
const W = globalThis.MechanicsWorkbench;

class Bus {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, data = {}) {
    const event = { type, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...data };
    for (const handler of this.listeners.get(type) || []) handler(event);
  }
}

const part = (scene, id) => scene.parts.find((item) => item.id === id);

test('新力学页只加载单画布工作台，不再加载旧 SVG 拖动链', async () => {
  const html = await readFile(new URL('../力学仿真实验室.html', import.meta.url), 'utf8');
  assert.match(html, /workbench-core\.js\?v=20260908-lever-design1/);
  assert.match(html, /workbench\.js\?v=20260908-lever-design1/);
  assert.doesNotMatch(html, /drawing\.js|controls\.js|lab\.js/);
});

test('七类器材在同一个 Canvas 命中模型中都能被直接抓取', () => {
  const scene = M.example('empty');
  const types = ['lever', 'fixed', 'moving', 'beam', 'weight', 'scale', 'anchor'];
  types.forEach((type, index) => scene.parts.push(M.component(type, `p${index}`, 100 + index * 120, 260)));
  for (const [index, type] of types.entries()) {
    const hit = W.hitTest(scene, { x: 100 + index * 120, y: 260 });
    assert.equal(hit?.kind, 'part', type);
    assert.equal(hit?.id, `p${index}`, type);
  }
});

test('拖动从画布开始后由窗口继续接收，指针捕获失败也不中断', () => {
  const canvas = new Bus(), host = new Bus(), calls = [];
  canvas.setPointerCapture = () => { throw new Error('capture unavailable'); };
  const remove = W.bindPointerDrag(canvas, host, {
    start: () => { calls.push('start'); return true; },
    move: () => calls.push('move'),
    end: () => calls.push('end'),
    cancel: () => calls.push('cancel'),
  });
  canvas.emit('pointerdown', { pointerId: 9, clientX: 20, clientY: 30 });
  host.emit('pointermove', { pointerId: 9, clientX: 600, clientY: 500 });
  host.emit('pointerup', { pointerId: 9, clientX: 900, clientY: 700 });
  assert.deepEqual(calls, ['start', 'move', 'end']);
  remove();
  assert.equal(canvas.listeners.get('pointerdown').size, 0);
});

test('无 PointerEvent 时鼠标与触屏备用链仍能拖动', () => {
  for (const family of ['mouse', 'touch']) {
    const canvas = new Bus(), host = new Bus(), calls = [];
    const remove = W.bindPointerDrag(canvas, host, {
      start: () => { calls.push('start'); return true; },
      move: () => calls.push('move'),
      end: () => calls.push('end'),
      cancel: () => calls.push('cancel'),
    }, { pointerEvents: false });
    if (family === 'mouse') {
      canvas.emit('mousedown'); host.emit('mousemove'); host.emit('mouseup');
    } else {
      const touch = { identifier: 4, clientX: 10, clientY: 10 };
      canvas.emit('touchstart', { changedTouches: [touch], touches: [touch] });
      host.emit('touchmove', { changedTouches: [touch], touches: [touch] });
      host.emit('touchend', { changedTouches: [touch], touches: [] });
    }
    assert.deepEqual(calls, ['start', 'move', 'end'], family);
    remove();
  }
});

test('拖动器材采用世界坐标且不依赖 DOM 子节点', () => {
  let scene = M.example('fixed');
  const started = W.beginDrag(scene, { x: part(scene, 'p1').x, y: part(scene, 'p1').y });
  assert.equal(started.gesture.id, 'p1');
  scene = W.moveDrag(started.scene, started.gesture, { x: 720, y: 300 });
  assert.equal(part(scene, 'p1').x, 720);
  assert.equal(part(scene, 'p1').y, 300);
  assert.equal(scene.ropes[0].nodes.includes('p1:wheel'), true);
});

test('拖动动滑轮负载会移动整套悬挂组件，绳索连接保持不变', () => {
  const original = M.example('moving'), posed = M.positions(original);
  const weight = posed.get('g1');
  const started = W.beginDrag(original, { x: weight.x, y: weight.y });
  assert.equal(started.gesture.id, 'm1');
  const moved = W.moveDrag(started.scene, started.gesture, { x: weight.x + 85, y: weight.y + 35 });
  assert.equal(part(moved, 'm1').x, part(original, 'm1').x + 85);
  assert.equal(part(moved, 'm1').y, part(original, 'm1').y + 35);
  assert.deepEqual(moved.ropes, original.ropes);
  assert.deepEqual(moved.links, original.links);
});

test('抓住绳子中段会移动该段连接的器材，而不是出现没有反应', () => {
  const original = M.example('fixed');
  const line = M.ropeGeometry(M.positions(original), original.ropes[0]).lines[0];
  const point = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
  const started = W.beginDrag(original, point);
  assert.equal(started.gesture.kind, 'rope-part');
  const moved = W.moveDrag(started.scene, started.gesture, { x: point.x - 50, y: point.y + 20 });
  assert.notEqual(part(moved, started.gesture.id).x, part(original, started.gesture.id).x);
  assert.deepEqual(moved.ropes, original.ropes);
});

test('杠杆支点可拖动，挂码改变后倾角按力矩自动更新', () => {
  let scene = M.example('lever');
  const lever = part(scene, 'l1');
  const started = W.beginPivotDrag(scene, 'l1');
  scene = W.moveDrag(started.scene, started.gesture, { x: lever.x + 90, y: lever.y + 35 });
  assert.equal(part(scene, 'l1').pivot, 3);
  scene = W.settleLevers(scene);
  assert.notEqual(part(scene, 'l1').angle, 0);
});

test('绳端可以改接，新增绳索必须从端点开始并经过可选滑轮', () => {
  let scene = M.example('fixed');
  scene = W.reconnectRope(scene, 'r1', 1, 'g1:hook');
  assert.equal(scene.ropes[0].nodes.at(-1), 'g1:hook');
  const empty = M.example('fixed');
  empty.ropes = [];
  const routed = W.createRope(empty, ['g1:hook', 'p1:wheel', 'f1:hook']);
  assert.equal(routed.ropes.length, 1);
  assert.throws(() => W.createRope(empty, ['p1:wheel', 'f1:hook']), /绳端/);
});

test('Canvas 坐标换算在页面缩放后仍准确', () => {
  const canvas = { width: 2000, height: 1240, getBoundingClientRect: () => ({ left: 20, top: 40, width: 500, height: 310 }) };
  assert.deepEqual(W.canvasPoint(canvas, { clientX: 270, clientY: 195 }), { x: 500, y: 310 });
});

test('杠杆放大后，在页面缩放和高分屏下仍抓住同一挂码', () => {
  const canvas = { width: 2000, height: 1240, getBoundingClientRect: () => ({ left: 20, top: 40, width: 500, height: 310 }) };
  const scene = M.example('lever'), weight = M.positions(scene).get('g1');
  const view = { x: 240, y: 155, scale: 2 };
  const point = W.canvasPoint(canvas, { clientX: 20 + weight.x - view.x, clientY: 40 + weight.y - view.y }, view);
  assert.deepEqual(point, { x: weight.x, y: weight.y });
  assert.equal(W.hitTest(scene, point).id, weight.id);
  const started = W.beginDrag(scene, point);
  const moved = W.moveDrag(started.scene, started.gesture, { x: point.x - 20, y: point.y + 50 });
  assert.equal(M.positions(moved).get('g1').x, weight.x - 20);
});

test('相邻挂点的窄钩码分别命中，支架不会抢走钩码的拖动', () => {
  const scene = M.example('lever');
  scene.links[0].parent = 'l1:s0';
  scene.links[1].parent = 'l1:s1';
  const posed = M.positions(scene);
  for (const id of ['g1', 'g2']) {
    const weight = posed.get(id);
    for (const offset of [-11, 0, 11]) assert.equal(W.hitTest(scene, { x: weight.x + offset, y: weight.y }).id, id);
  }
  assert.equal(W.hitTest(scene, { x: 490, y: 296 }).kind, 'pivot');
  assert.equal(W.hitTest(scene, { x: 490, y: 270 }).kind, 'part');
});

test('杠杆倾斜后支架仍在支点正下方命中', () => {
  const scene = M.example('lever');
  part(scene, 'l1').angle = .45;
  const hit = W.hitTest(scene, { x: 490, y: 302 });
  assert.equal(hit.kind, 'pivot');
  assert.equal(hit.id, 'l1');
});

test('新工作台脚本可独立解析且课堂与独立资源保持一致', async () => {
  for (const file of ['workbench-core.js', 'workbench.js']) {
    const source = await readFile(new URL(`../mechanics/${file}`, import.meta.url), 'utf8');
    new Script(source, { filename: file });
  }
});

test('完整工作台在最小 DOM 中启动，并实际走完按下、移动、松手', async () => {
  const events = (node = {}) => Object.assign(node, {
    listeners: new Map(),
    addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(handler); },
    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); },
    emit(type, extra = {}) {
      const event = { type, button: 0, clientX: 0, clientY: 0, target: this, preventDefault() {}, ...extra };
      for (const handler of this.listeners.get(type) || []) handler(event);
    },
  });
  const simple = () => ({ innerHTML: '', textContent: '', value: '', disabled: false, dataset: {}, className: '', setAttribute() {} });
  const nodes = new Map(['mwTip', 'mwInspector', 'mwStatus', 'mwMetrics', 'mwDriver', 'mwPull', 'mwPullValue', 'mwMotionNote', 'mwMotion', 'mwCanvasHint', 'mwQuestion', 'mwInquiry', 'mwRecordCount', 'mwRecordBody', 'mwFile', 'mwReady'].map((id) => [id, events(simple())]));
  const canvasContext = new Proxy({}, { get(target, property) { if (!(property in target)) target[property] = () => {}; return target[property]; } });
  const canvas = events({ ...simple(), width: 1000, height: 620, style: {}, getContext: () => canvasContext, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 620 }), focus() {} });
  nodes.set('mwCanvas', canvas);
  const actions = new Map(['select', 'wire', 'snap', 'view', 'undo', 'redo', 'clear', 'csv'].map((action) => [action, { dataset: { action }, disabled: false, setAttribute() {} }]));
  const presetButtons = ['lever', 'fixed', 'moving', 'tilt', 'group', 'combo', 'empty'].map((value) => ({ dataset: { preset: value }, setAttribute() {} }));
  const root = events({ ...simple(), querySelector(selector) { return actions.get(selector.match(/data-action="([^"]+)/)?.[1]) || null; }, querySelectorAll: () => presetButtons });
  nodes.set('mechanicsLab', root);
  const host = events({ devicePixelRatio: 1 });
  const document = { getElementById: (id) => nodes.get(id) || null, createElement: () => ({ click() {} }) };
  const source = await readFile(new URL('../mechanics/workbench.js', import.meta.url), 'utf8');
  new Script(source, { filename: 'workbench.js' }).runInNewContext({
    document, window: host, Mechanics: M, MechanicsInteraction: globalThis.MechanicsInteraction, MechanicsWorkbench: W,
    Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout: (fn) => fn(), console,
  });
  assert.match(root.innerHTML, /直接抓住任意器材拖动/);
  assert.match(nodes.get('mwMetrics').innerHTML, /左侧力矩.*8\.00.*右侧力矩.*8\.00/s);
  assert.equal(nodes.get('mwMotion').hidden, true);
  // The default view doubles the apparatus, so (500, 230) is the lever's pivot.
  canvas.emit('mousedown', { clientX: 500, clientY: 230 });
  host.emit('mousemove', { clientX: 580, clientY: 290 });
  host.emit('mouseup', { clientX: 580, clientY: 290 });
  assert.match(nodes.get('mwTip').textContent, /器材已移动/);
  root.emit('click', { target: { closest: () => actions.get('view') } });
  assert.equal(actions.get('view').textContent, '放大装置');
  root.emit('click', { target: { closest: () => presetButtons.find((button) => button.dataset.preset === 'fixed') } });
  assert.equal(nodes.get('mwMotion').hidden, false);
  assert.match(nodes.get('mwMetrics').innerHTML, /测力计/);
});
