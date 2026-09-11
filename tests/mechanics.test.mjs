import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';
import '../mechanics/physics.js';
import '../mechanics/interactions.js';
import '../mechanics/drawing.js';
import '../mechanics/controls.js';

const M = globalThis.Mechanics;
const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const part = (s, id) => s.parts.find((p) => p.id === id);


test('杠杆两侧分别为 8 N·m，换挂点和质量后按方向失衡', () => {
  const s = M.example('lever'); let r = M.analyze(s);
  assert.equal(r.valid, true); close(r.levers[0].clockwise, 8); close(r.levers[0].counterclockwise, 8);
  part(s, 'g2').mass = 2; r = M.analyze(s);
  assert.equal(r.status, 'unbalanced'); close(r.levers[0].netMoment, 8);
  s.links[1].parent = 'l1:s2'; assert.equal(M.analyze(s).valid, true);
  part(s, 'g1').mass = 3; close(M.analyze(s).levers[0].netMoment, -4);
});
test('支点、自重、杠杆倾角和重力加速度参与力矩计算', () => {
  const s = M.example('lever'); const l = part(s, 'l1'); l.mass = 2; l.pivot = 1;
  close(M.analyze(s).levers[0].gravityMoment, -10);
  l.angle = Math.PI / 6; close(M.analyze(s).levers[0].gravityMoment, -10 * Math.cos(l.angle));
  s.g = 9.8; close(M.analyze(s).levers[0].gravityMoment, -9.8 * Math.cos(l.angle));
});
for (const [kind, tension, lift] of [['fixed', 20, .2], ['moving', 10, .1], ['group', 5, .05]]) {
  test(`${kind}：2 kg 负载的拉力、反向试拉、绳长及功符合简单机械关系`, () => {
    const s = M.example(kind), r = M.analyze(s);
    assert.equal(r.valid, true); close(r.meters[0].tension, tension);
    for (const sign of [-1, 1]) {
      const moved = M.pull(s, 'f1', sign * 30); assert.equal(moved.ok, true, moved.issue);
      close(moved.lifts[0].height, sign * lift); close(moved.outputWork, sign * tension * .2);
      close(moved.result.geometries[0].length, r.geometries[0].length);
    }
    assert.deepEqual(s, M.example(kind), '试拉不改写原装置');
  });
}
test('动滑轮、横梁自重计入所需拉力，固定支架自重不增加负载', () => {
  const s = M.example('group'); part(s, 'm1').mass = 1; part(s, 'm2').mass = 1; part(s, 'b1').mass = 2; part(s, 'p1').mass = 20;
  close(M.analyze(s).meters[0].tension, 15);
});
test('杠杆测力与杠杆＋滑轮组合由两根绳相互传递力和运动', () => {
  const single = M.example('lever-force'); close(M.analyze(single).meters[0].tension, 10);
  const s = M.example('combo'), r = M.analyze(s); close(r.tensions.r1, 10); close(r.tensions.r2, 5);
  const moved = M.pull(s, 'f1', 15); assert.ok(moved.ok, moved.issue); assert.ok(moved.lifts[0].height > .025 && moved.lifts[0].height < .026);
  r.geometries.forEach((g, i) => close(moved.result.geometries[i].length, g.length));
  s.ropes[1].nodes[0] = 'l1:s3'; part(s, 'f1').x = 534;
  close(M.analyze(s).meters[0].tension, 20 / 3);
});
test('移开绳端形成斜绳后按竖直分力计算，不固定套用二分之一', () => {
  const s = M.example('moving'); part(s, 'a1').x = 260;
  const r = M.analyze(s), g = r.geometries[0];
  const left = g.lines[0].direction.y, right = -g.lines[1].direction.y;
  close(r.tensions.r1, 20 / (left + right)); assert.ok(r.tensions.r1 > 10);
  const moved = M.pull(s, 'f1', 20); assert.ok(moved.ok, moved.issue); close(moved.result.geometries[0].length, g.length);
});
test('同一批器材改变穿绳顺序，支持绳段数和拉力随拓扑改变', () => {
  const s = M.example('moving'); part(s, 'a1').x = 504; part(s, 'a1').y = 250;
  part(s, 'f1').x = 300; part(s, 'f1').y = 180;
  // Free end is now above the moving pulley, so the effort is upward.
  s.ropes[0].nodes = ['f1:hook', 'm1:wheel', 'p1:wheel', 'a1:hook'];
  const r = M.analyze(s); assert.ok(r.valid, r.issues.join()); assert.ok(r.meters[0].forceY < 0);
  const moved = M.pull(s, 'f1', -15); assert.ok(moved.ok, moved.issue); assert.ok(moved.lifts[0].height > 0);
});
test('每段绳与轮缘相切、接弧连续；反向描述同一根绳长度不变', () => {
  for (const kind of ['fixed', 'moving', 'group', 'combo']) {
    const s = M.example(kind), posed = M.positions(s);
    for (const rope of s.ropes) {
      const g = M.ropeGeometry(posed, rope);
      close(M.ropeGeometry(posed, { nodes: [...rope.nodes].reverse() }).length, g.length);
      for (const [i, arc] of g.arcs.entries()) {
        const incoming = g.lines[i], outgoing = g.lines[i + 1];
        for (const [p, line] of [[arc.from, incoming], [arc.to, outgoing]]) {
          close(Math.hypot(p.x - arc.center.x, p.y - arc.center.y), M.RADIUS);
          close((p.x - arc.center.x) * line.direction.x + (p.y - arc.center.y) * line.direction.y, 0);
        }
      }
    }
  }
});
test('重叠轮槽返回几何错误，不显示假拉力或继续运动', () => {
  const s = M.example('group'); s.links.find((l) => l.child === 'm2').parent = 'b1:s-2';
  // The two moving wheels now occupy one position in the same rope.
  part(s, 'p1').x = 372; part(s, 'p1').y = 330;
  const r = M.analyze(s); assert.equal(r.status, 'geometry'); assert.equal(r.valid, false); assert.equal(M.pull(s, 'f1', 10).ok, false);
});
test('需要绳索推动、重复绳与未加载绳不会伪造平衡读数', () => {
  const s = M.example('lever-force'); s.ropes[0].nodes[0] = 'l1:s-4'; part(s, 'f1').x = 370;
  assert.equal(M.analyze(s).status, 'slack'); assert.equal(M.analyze(s).tensions.r1, null);
  const repeated = M.example('lever-force'); repeated.ropes.push({ ...M.clone(repeated.ropes[0]), id: 'r2' });
  assert.equal(M.analyze(repeated).status, 'indeterminate');
  const unloaded = M.example('empty'); unloaded.parts.push(M.component('anchor', 'a', 200, 100), M.component('scale', 'f', 200, 400)); unloaded.ropes.push({ id: 'r', nodes: ['a:hook', 'f:hook'] });
  assert.equal(M.analyze(unloaded).status, 'indeterminate');
});
test('两个独立动滑轮共用一绳却未刚性连接时，不臆造运动分配', () => {
  const s = M.example('group'); s.links = s.links.filter((l) => !['m1', 'm2'].includes(l.child));
  s.parts = s.parts.filter((p) => !['g1', 'b1'].includes(p.id)); s.links = [];
  part(s, 'm1').mass = 1; part(s, 'm2').mass = 1;
  assert.equal(M.analyze(s).valid, true); const moved = M.pull(s, 'f1', 10);
  assert.equal(moved.ok, false); assert.match(moved.issue, /不能唯一/);
});
test('超量程、未接入测力计、画布边界和极端输入单独报告', () => {
  const s = M.example('fixed'); part(s, 'f1').range = 5;
  assert.equal(M.analyze(s).meters[0].overload, true);
  s.parts.push(M.component('scale', 'f2', 800, 500)); assert.equal(M.pull(s, 'f2', 10).ok, false);
  assert.equal(M.pull(s, 'f1', 151).ok, false); assert.equal(M.pull(s, 'f1', NaN).ok, false);
  assert.equal(M.pull(M.example('combo'), 'f1', 100).ok, false);
});
test('导入支持往返并过滤未知字段，拒绝重复 ID、循环挂接和危险类型', () => {
  const s = M.example('group'); assert.deepEqual(M.validate(JSON.parse(JSON.stringify(s))), s);
  s.extra = 'discard'; part(s, 'g1').extra = 'discard'; assert.equal(M.validate(s).extra, undefined); assert.equal(part(M.validate(s), 'g1').extra, undefined);
  for (const mutate of [
    (s) => s.parts.push(M.clone(s.parts[0])),
    (s) => { s.parts[0].type = '__proto__'; },
    (s) => { s.parts[0].mass = -1; },
    (s) => { s.parts[0].x = Infinity; },
    (s) => s.links.push({ child: 'b1', parent: 'm1:hook', dx: 0, dy: 70 }),
    (s) => s.ropes.push({ id: 'r2', nodes: ['a1:hook', 'm1:wheel', 'f1:hook'] }),
  ]) { const next = M.example('group'); mutate(next); assert.throws(() => M.validate(next)); }
});

// Event-level controller harness: no browser, layout assumptions or private UI API.
const uiSource = await readFile(new URL('../mechanics/lab.js', import.meta.url), 'utf8');
function controller() {
  const nodes = new Map(), frames = new Map(), windowEvents = {}, documentEvents = {}; let frameId = 1, observed, observedResult;
  const attrName = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  class Element {
    constructor(tag = 'div', attributes = {}) { this.tag = tag; this.attributes = attributes; this.dataset = {}; this.events = {}; this.children = []; this.disabled = 'disabled' in attributes; this.value = attributes.value || ''; this.classList = { toggle() {} }; for (const [k, v] of Object.entries(attributes)) if (k.startsWith('data-')) this.dataset[attrName(k.slice(5))] = v; if (attributes.id) nodes.set(attributes.id, this); }
    set innerHTML(html) { this.writes = (this.writes || 0) + 1; this.html = html; this.children = [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((m) => { const a = Object.fromEntries([...m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((p) => [p[1], p[2] || ''])); return new Element(m[1], a); }); if (this.tag === 'select') this.value = (this.children.find((n) => 'selected' in n.attributes) || this.children.find((n) => n.tag === 'option'))?.value || ''; }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    async dispatch(type, extras = {}) { for (const fn of this.events[type] || []) await fn({ target: this, type, preventDefault() {}, ...extras }); }
    matches(selector) { return selector.split(',').some((s) => { const m = s.trim().match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/); return m ? m[1] in this.attributes && (m[2] === undefined || m[2] === this.attributes[m[1]]) : s.trim() === this.tag; }); }
    closest(selector) { return this.matches(selector) ? this : null; }
    querySelectorAll(selector) { return this.children.filter((n) => n.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    getAttribute(k) { return this.attributes[k]; }
    setAttribute(k, v) { this.attributes[k] = v; }
    hasAttribute(k) { return k in this.attributes; }
    checkValidity() { return true; }
    focus() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 650 }; }
    setPointerCapture(id) { this.capturedPointer = id; } hasPointerCapture(id) { return this.capturedPointer === id; } releasePointerCapture(id) { if (this.capturedPointer === id) this.capturedPointer = undefined; }
  }
  const root = new Element('section', { id: 'mechanicsLab' });
  const document = { getElementById: (id) => nodes.get(id), activeElement: null, hidden: false, addEventListener: (k, fn) => { documentEvents[k] = fn; } };
  const parent = {}, origin = 'http://localhost';
  runInNewContext(uiSource, { document, window: { parent, addEventListener: (k, fn) => { windowEvents[k] = fn; } }, location: { origin }, MechanicsInteraction: globalThis.MechanicsInteraction, MechanicsDrawing: { ...globalThis.MechanicsDrawing, part(c, options, handles) { observed = M.clone(options.scene); return globalThis.MechanicsDrawing.part(c, options, handles); } }, MechanicsControls: globalThis.MechanicsControls, Mechanics: { ...M, analyze(s) { observed = M.clone(s); observedResult = M.analyze(s); return observedResult; } }, requestAnimationFrame: (fn) => { const id = frameId++; frames.set(id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id), setTimeout: (fn) => fn(), Date, Blob, URL, MouseEvent: class {} });
  const click = async (selector, container = root) => { const n = selector.startsWith('#') ? nodes.get(selector.slice(1)) : container.querySelector(selector); assert.ok(n, selector); await n.dispatch('click'); await root.dispatch('click', { target: n }); };
  return { root, nodes, document, documentEvents, windowEvents, parent, origin, frames, click, scene: () => observed, result: () => observedResult, async boardClick(selector) { await click(selector, nodes.get('mlBoard')); }, async changeProperty(key, value) { const n = nodes.get('mlInspector').querySelector(`[data-property="${key}"]`); n.value = String(value); await root.dispatch('change', { target: n }); }, async tick(time) { const next = [...frames.values()]; frames.clear(); next.forEach((fn) => fn(time)); } };
}
test('控制器能初始化所有实验起点，生成唯一挂点并显示真实读数', async () => {
  const e = controller(); assert.equal(e.result().valid, true); assert.match(e.nodes.get('mlMetrics').innerHTML, /8.00 N·m/);
  for (const kind of ['empty', 'lever', 'fixed', 'moving', 'tilt', 'group', 'combo']) {
    await e.click(`[data-starter="${kind}"]`); assert.equal(e.result().valid, true);
    const ports = e.nodes.get('mlBoard').querySelectorAll('[data-port]').map((n) => n.dataset.port);
    assert.equal(new Set(ports).size, ports.length);
  }
});
test('空白台添加器材、挂钩码、修改质量、撤销重做和删除都更新同一装置', async () => {
  const e = controller(); await e.click('[data-starter="empty"]'); await e.click('[data-add="lever"]'); await e.click('[data-add="weight"]');
  const [l, w] = e.scene().parts;
  await e.click('[data-mode="hang"]'); await e.boardClick(`[data-port="${l.id}:s2"]`); await e.boardClick(`[data-part="${w.id}"]`);
  assert.equal(e.scene().links[0].parent, `${l.id}:s2`);
  await e.changeProperty('mass', 3); assert.ok(part(e.scene(), l.id).angle > 0); close(e.result().levers[0].gravityMoment, 12 * Math.cos(part(e.scene(), l.id).angle));
  await e.click('#mlUndo'); close(part(e.scene(), w.id).mass, 1);
  await e.click('#mlRedo'); close(part(e.scene(), w.id).mass, 3);
  await e.boardClick(`[data-part="${w.id}"]`); await e.click('[data-action="delete"]', e.nodes.get('mlInspector'));
  assert.equal(e.scene().parts.length, 1); assert.equal(e.scene().links.length, 0);
});
test('拆下预设绳后，逐点重新穿绕轮槽即可恢复测量，按 Esc 取消不会添绳', async () => {
  const e = controller(); await e.click('[data-starter="moving"]');
  await e.boardClick('[data-rope="r1"]'); await e.click('[data-action="delete"]', e.nodes.get('mlInspector')); assert.equal(e.scene().ropes.length, 0);
  await e.click('[data-mode="rope"]');
  for (const port of ['a1:hook', 'm1:wheel', 'p1:wheel', 'f1:hook']) await e.boardClick(`[data-port="${port}"]`);
  assert.equal(e.scene().ropes.length, 1); close(e.result().meters[0].tension, 10);
  await e.boardClick('[data-port="a1:hook"]'); await e.root.dispatch('keydown', { key: 'Escape' }); assert.equal(e.scene().ropes.length, 1);
});
test('移动支点后杠杆按新力矩倾斜，同一挂点的多个钩码仍分层显示', async () => {
  const e = controller(); const before = M.positions(e.scene());
  await e.boardClick('[data-part="l1"]'); await e.changeProperty('pivot', 2);
  const after = M.positions(e.scene()); close(after.get('l1').x, before.get('l1').x + 60); assert.ok(part(e.scene(), 'l1').angle < 0); assert.ok(after.get('g1').y > before.get('g1').y); assert.ok(after.get('g2').y < before.get('g2').y);
  await e.click('[data-add="weight"]'); const added = e.scene().parts.at(-1);
  await e.click('[data-mode="hang"]'); await e.boardClick('[data-port="l1:s-2"]'); await e.boardClick(`[data-part="${added.id}"]`);
  const positions = M.positions(e.scene()); assert.ok(positions.get(added.id).y - positions.get('g1').y >= 60);
});
test('试拉滑块、回到起点、记录快照，以及离开页面暂停动画', async () => {
  const e = controller(); await e.click('[data-starter="group"]'); const before = e.scene();
  const slider = e.nodes.get('mlPull'); slider.value = '.2'; await slider.dispatch('input');
  close(M.positions(before).get('g1').y - M.positions(e.scene()).get('g1').y, 7.5);
  await e.click('#mlRecord'); const saved = e.nodes.get('mlRecords').innerHTML;
  await e.click('#mlReturn'); assert.deepEqual(e.scene(), before); assert.equal(e.nodes.get('mlRecords').innerHTML, saved);
  await e.click('#mlPlay'); await e.tick(1000); await e.tick(1100); assert.ok(e.frames.size > 0);
  e.windowEvents.message({ origin: 'https://other.example', source: e.parent, data: { type: 'gewulab:active', active: false } }); assert.ok(e.frames.size > 0);
  e.windowEvents.message({ origin: e.origin, source: e.parent, data: { type: 'gewulab:active', active: false } }); assert.equal(e.frames.size, 0); assert.equal(e.nodes.get('mlRecord').disabled, false);
  await e.click('#mlPlay'); e.document.hidden = true; e.documentEvents.visibilitychange(); assert.equal(e.frames.size, 0);
});
test('全部力学资源在独立页与内嵌课堂保持一致，脚本均可解析', async () => {
  for (const filename of await readdir(new URL('../mechanics/', import.meta.url))) {
    const source = await readFile(new URL(`../mechanics/${filename}`, import.meta.url), 'utf8');
    if (filename.endsWith('.js')) assert.doesNotThrow(() => new Script(source));
    for (const directory of ['public/mechanics', 'public/classroom/mechanics']) assert.equal(await readFile(new URL(`../${directory}/${filename}`, import.meta.url), 'utf8'), source);
  }
});

async function pointerDrag(e, selector, points, pointerType = 'mouse', cancel = false) {
  const board = e.nodes.get('mlBoard'), target = board.querySelector(selector); assert.ok(target, selector);
  const event = (p, more = {}) => ({ target: board, button: 0, pointerId: 7, pointerType, clientX: p[0], clientY: p[1], ...more });
  await board.dispatch('pointerdown', event(points[0], { target }));
  for (const [i, p] of points.slice(1).entries()) { await board.dispatch('pointermove', event(p)); await e.tick(1000 + i * 100); }
  await board.dispatch(cancel ? 'pointercancel' : 'pointerup', event(points.at(-1)));
}
test('拖动已悬挂钩码直接更换挂点，不需先解除挂接', async () => {
  const e = controller();
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [520, 340], [610, 340]]);
  assert.equal(e.scene().links.find((l) => l.child === 'g1').parent, 'l1:s4');
  assert.ok(part(e.scene(), 'l1').angle > 0); close(e.result().levers[0].gravityMoment, 24 * Math.cos(part(e.scene(), 'l1').angle));
  await e.click('#mlUndo'); assert.equal(e.scene().links.find((l) => l.child === 'g1').parent, 'l1:s-2');
});
test('直接从挂点拖出绳索绕过轮缘并放到末端挂点，无须切换模式', async () => {
  const e = controller(); await e.click('[data-starter="fixed"]');
  await e.boardClick('[data-rope="r1"]'); await e.click('[data-action="delete"]', e.nodes.get('mlInspector'));
  await pointerDrag(e, '[data-port="g1:hook"]', [[442, 381], [442, 130], [470, 102], [498, 410]]);
  assert.equal(e.scene().ropes.length, 1); assert.deepEqual([...e.scene().ropes[0].nodes], ['g1:hook', 'p1:wheel', 'f1:hook']);
  close(e.result().meters[0].tension, 20);
});

test('触屏拖动可取下钩码再挂回，取消拖动保留原装置且可继续操作', async () => {
  const e = controller(), original = e.scene();
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [700, 500]], 'touch', true);
  assert.deepEqual(e.scene(), original);
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [700, 500]], 'touch');
  assert.equal(e.scene().links.some((l) => l.child === 'g1'), false); close(part(e.scene(), 'g1').x, 700);
  await pointerDrag(e, '[data-part="g1"]', [[700, 500], [370, 340]], 'touch');
  assert.equal(e.scene().links.find((l) => l.child === 'g1').parent, 'l1:s-4');
  await e.click('#mlUndo'); assert.equal(e.scene().links.some((l) => l.child === 'g1'), false);
});
test('缩放后的画布使用实际坐标，直接拖挂同样准确', async () => {
  const e = controller(); e.nodes.get('mlBoard').getBoundingClientRect = () => ({ left: 80, top: 100, width: 800, height: 520 });
  const screen = ([x, y]) => [80 + x * .8, 100 + y * .8];
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [550, 340]].map(screen));
  assert.equal(e.scene().links.find((l) => l.child === 'g1').parent, 'l1:s2');
});
test('支点能直接拖动及键盘移动，松手后杠杆按新力矩显示倾斜', async () => {
  const e = controller(), before = M.positions(e.scene());
  await pointerDrag(e, '[data-pivot="l1"]', [[490, 292], [550, 292]]);
  assert.equal(part(e.scene(), 'l1').pivot, 2);
  assert.ok(part(e.scene(), 'l1').angle < 0); assert.ok(M.positions(e.scene()).get('g1').y > before.get('g1').y); assert.ok(M.positions(e.scene()).get('g2').y < before.get('g2').y);
  await e.root.dispatch('keydown', { key: 'ArrowLeft', target: e.nodes.get('mlBoard').querySelector('[data-pivot="l1"]') }); assert.equal(part(e.scene(), 'l1').pivot, 1);
});
test('已挂接钩码可用左右方向键换挂点，取下与拖动采用同一挂接计算', async () => {
  const e = controller(); await e.root.dispatch('keydown', { key: 'ArrowRight', target: e.nodes.get('mlBoard').querySelector('[data-part="g1"]') });
  assert.equal(e.scene().links.find((l) => l.child === 'g1').parent, 'l1:s-1'); assert.ok(part(e.scene(), 'l1').angle > 0); close(e.result().levers[0].gravityMoment, 4 * Math.cos(part(e.scene(), 'l1').angle));
});
test('已有绳索拖动末端即可改接测力计，取消改接保留原路径', async () => {
  const e = controller(); await e.click('[data-starter="fixed"]'); await e.click('[data-add="scale"]');
  const scale = e.scene().parts.at(-1); await pointerDrag(e, `[data-part="${scale.id}"]`, [[scale.x, scale.y], [620, 460]]);
  await e.click('[data-mode="rope"]'); await e.boardClick('[data-rope="r1"]'); const before = e.scene();
  await pointerDrag(e, '[data-wire-end="r1:1"]', [[498, 410], [620, 410]], 'touch', true); assert.deepEqual(e.scene(), before);
  await e.boardClick('[data-rope="r1"]'); await pointerDrag(e, '[data-wire-end="r1:1"]', [[498, 410], [620, 410]]);
  assert.equal(e.scene().ropes.length, 1); assert.equal(e.scene().ropes[0].nodes.at(-1), `${scale.id}:hook`);
  close(e.result().meters.find((m) => m.id === scale.id).tension, 20); assert.equal(e.result().meters.find((m) => m.id === 'f1').tension, null);
  await e.click('#mlUndo'); assert.deepEqual(e.scene(), before);
});
test('滑轮组可以一笔重穿四个轮槽，自动沿指定轮缘贴合并恢复 5 N 拉力', async () => {
  const e = controller(); await e.click('[data-starter="group"]'); await e.boardClick('[data-rope="r1"]');
  await e.click('[data-action="rewire"]', e.nodes.get('mlInspector'));
  await pointerDrag(e, '[data-port="a1:hook"]', [[344, 80], [344, 330], [372, 358], [400, 130], [428, 102], [512, 330], [484, 358], [540, 102], [568, 440]], 'touch');
  assert.equal(e.scene().ropes.length, 1); assert.deepEqual(e.scene().ropes[0].nodes, M.example('group').ropes[0].nodes);
  close(e.result().meters[0].tension, 5); assert.equal(e.nodes.get('mlWireStrip').hidden, true);
});
test('穿绳可以松手暂停再继续，退回、取消与占用轮槽不会破坏装置', async () => {
  const e = controller(); await e.click('[data-starter="moving"]'); await e.boardClick('[data-rope="r1"]');
  await e.click('[data-action="rewire"]', e.nodes.get('mlInspector')); const before = e.scene();
  await pointerDrag(e, '[data-port="a1:hook"]', [[392, 90], [392, 335], [420, 363], [440, 480]]);
  assert.equal(e.nodes.get('mlWireStrip').hidden, false); assert.match(e.nodes.get('mlWireTrail').textContent, /M1/);
  await e.click('#mlWireBack'); assert.doesNotMatch(e.nodes.get('mlWireTrail').textContent, /M1/);
  await e.click('#mlWireCancel'); assert.deepEqual(e.scene(), before);
  await e.click('[data-mode="rope"]'); await e.boardClick('[data-port="a1:hook"]'); await e.boardClick('[data-port="m1:wheel"]');
  assert.match(e.nodes.get('mlMessage').textContent, /已有绳索/); assert.equal(e.scene().ropes.length, 1);
});
test('重穿时无需提前设置滑轮上下侧；明确的拖动侧会被保留', () => {
  const I = globalThis.MechanicsInteraction;
  for (const kind of ['fixed', 'moving', 'group']) {
    let s = M.example(kind); const expected = M.analyze(s).meters[0].tension;
    for (const c of s.parts) if (['moving', 'fixed'].includes(c.type)) c.wrap = c.wrap === 'top' ? 'bottom' : 'top';
    for (const r of s.ropes) s = I.route(s, r.nodes, r.id, r.id);
    close(M.analyze(s).meters[0].tension, expected);
  }
  const s = M.example('moving'), r = s.ropes[0]; const next = I.route(s, r.nodes, r.id, r.id, { 'm1:wheel': 'bottom', 'p1:wheel': 'top' });
  assert.equal(part(next, 'm1').wrap, 'bottom'); assert.equal(part(next, 'p1').wrap, 'top');
});
test('全部杠杆挂点在常用倾角下均可拖挂，渲染支架不会与钩码主体相交', () => {
  const D = globalThis.MechanicsDrawing, I = globalThis.MechanicsInteraction;
  for (const angle of [-.43, 0, .43]) for (let slot = -5; slot <= 5; slot++) {
    const s = M.example('lever'); part(s, 'l1').angle = angle;
    const next = I.mount(s, 'g1', `l1:s${slot}`), posed = M.positions(next), lever = posed.get('l1'), weight = posed.get('g1');
    const markup = D.part(weight, { scene: next, result: M.analyze(next), selected: null, pending: [], attachParent: null, name: (k) => k, rotation: () => 0 });
    const rect = markup.match(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="5" class="ml-body ml-weight-body"/); assert.ok(rect);
    const [x, y, width, height] = rect.slice(1).map(Number), support = D.supportBounds(lever);
    assert.ok(x + width <= support.x || x >= support.x + support.width || y >= support.y + support.height || y + height <= support.y, `挂点 ${slot} 角度 ${angle} 支架不得遮挡钩码`);
    const detached = I.detached(next, 'g1'); const target = M.endpoint(lever, `s${slot}`); Object.assign(part(detached, 'g1'), { x: target.x + 4, y: target.y + 70 });
    assert.equal(I.snapMount(detached, 'g1').key, `l1:s${slot}`);
  }
});
test('拖挂不会产生父子循环；导入和保存仍兼容之前的装置格式', () => {
  const I = globalThis.MechanicsInteraction, s = M.example('group');
  assert.throws(() => I.mount(s, 'b1', 'm1:hook'), /循环/);
  const loaded = M.validate(JSON.parse(JSON.stringify(s))), moved = I.mount(loaded, 'g1', 'b1:s1');
  assert.equal(M.validate(JSON.parse(JSON.stringify(moved))).links.find((l) => l.child === 'g1').parent, 'b1:s1');
});
test('预设装置上的已有绳端可以直接拖走改接，不用先选绳或删除', async () => {
  const e = controller(); await e.click('[data-starter="fixed"]'); await e.click('[data-add="scale"]');
  const added = e.scene().parts.at(-1); await pointerDrag(e, `[data-part="${added.id}"]`, [[added.x, added.y], [620, 460]]);
  await e.click('[data-mode="rope"]'); await pointerDrag(e, '[data-port="f1:hook"]', [[498, 410], [620, 410]], 'touch');
  assert.equal(e.scene().ropes.length, 1); assert.equal(e.scene().ropes[0].id, 'r1'); assert.equal(e.scene().ropes[0].nodes.at(-1), `${added.id}:hook`);
});

test('自由拖动按指针小数坐标连续跟随，不强制跳到五像素网格', async () => {
  const e = controller(); const board = e.nodes.get('mlBoard');
  await board.dispatch('pointerdown', { target: board.querySelector('[data-part="g1"]'), button: 0, pointerId: 7, clientX: 430, clientY: 340 });
  for (const dx of [6.25, 7.5, 8.75]) { await board.dispatch('pointermove', { pointerId: 7, clientX: 430 + dx, clientY: 343.25 }); await e.tick(); close(part(e.scene(), 'g1').x, 430 + dx); close(part(e.scene(), 'g1').y, 343.25); }
  await board.dispatch('pointercancel', { pointerId: 7 });
});
test('快速松手时用 pointerup 的最终位置换挂点，不停在上一次移动的位置', async () => {
  const e = controller(), board = e.nodes.get('mlBoard');
  await board.dispatch('pointerdown', { target: board.querySelector('[data-part="g1"]'), button: 0, pointerId: 7, clientX: 430, clientY: 340 });
  await board.dispatch('pointermove', { pointerId: 7, clientX: 460, clientY: 340 });
  await board.dispatch('pointerup', { pointerId: 7, clientX: 610, clientY: 340 });
  assert.equal(e.scene().links.find((l) => l.child === 'g1').parent, 'l1:s4');
});
test('已有绳子的中段也能直接抓住拖动，进入局部重新穿绕', async () => {
  const e = controller(); await e.click('[data-starter="fixed"]'); await e.click('[data-mode="rope"]'); const board = e.nodes.get('mlBoard');
  await board.dispatch('pointerdown', { target: board.querySelector('[data-rope="r1"]'), button: 0, pointerId: 7, clientX: 442, clientY: 260 });
  await board.dispatch('pointermove', { pointerId: 7, clientX: 380, clientY: 260 }); await e.tick();
  assert.equal(e.nodes.get('mlWireStrip').hidden, false); assert.match(e.nodes.get('mlDraft').innerHTML, /ml-rope-preview/);
  await board.dispatch('pointercancel', { pointerId: 7 }); assert.deepEqual(e.scene().ropes, M.example('fixed').ropes);
});
test('穿绳时移动游离绳端只更新光标和绳形，不反复重建测量与试拉控件', async () => {
  const e = controller(); await e.click('[data-starter="moving"]'); await e.boardClick('[data-rope="r1"]'); await e.click('[data-action="delete"]', e.nodes.get('mlInspector'));
  const board = e.nodes.get('mlBoard'); await board.dispatch('pointerdown', { target: board.querySelector('[data-port="a1:hook"]'), button: 0, pointerId: 7, clientX: 392, clientY: 90 });
  const writes = e.nodes.get('mlDriver').writes;
  for (let i = 0; i < 15; i++) { await board.dispatch('pointermove', { pointerId: 7, clientX: 280 + i, clientY: 160 }); await e.tick(); }
  assert.equal(e.nodes.get('mlDriver').writes, writes);
});

test('关闭自动挂接或按住 Alt 可以在挂点附近自由放置，重新打开后仍可挂回', async () => {
  const e = controller(); await e.click('#mlSnap'); await pointerDrag(e, '[data-part="g1"]', [[430,340],[520,340]]);
  assert.equal(e.scene().links.some(l=>l.child==='g1'),false);close(part(e.scene(),'g1').x,520);
  await e.click('#mlSnap');await pointerDrag(e,'[data-part="g1"]',[[520,340],[550,340]]);assert.equal(e.scene().links.find(l=>l.child==='g1').parent,'l1:s2');
  const board=e.nodes.get('mlBoard');await board.dispatch('pointerdown',{target:board.querySelector('[data-part="g1"]'),button:0,pointerId:7,clientX:550,clientY:340});await board.dispatch('pointerup',{pointerId:7,clientX:520,clientY:340,altKey:true});assert.equal(e.scene().links.some(l=>l.child==='g1'),false);
});
test('向下移开钩码能取下，不会被很远的原挂点强行吸回',async()=>{
  const e=controller();await pointerDrag(e,'[data-part="g1"]',[[430,340],[430,390]]);assert.equal(e.scene().links.some(l=>l.child==='g1'),false);close(part(e.scene(),'g1').y,390);
});
test('抓住轮上的绳段拖开可取下该轮，绳两端保留并可撤销',async()=>{
  const e=controller();await e.click('[data-starter="fixed"]');await e.click('[data-mode="rope"]'); const before=e.scene();await pointerDrag(e,'[data-rope="r1"]',[[470,102],[350,70],[330,200]]);
  assert.deepEqual([...e.scene().ropes[0].nodes],['g1:hook','f1:hook']);await e.click('#mlUndo');assert.deepEqual(e.scene(),before);
});
test('抓住绳中段绕上新增滑轮，无需拆掉原有端点和其余滑轮',async()=>{
  const e=controller();await e.click('[data-starter="fixed"]');await e.click('[data-add="moving"]');const c=e.scene().parts.at(-1);await pointerDrag(e,`[data-part="${c.id}"]`,[[c.x,c.y],[350,280]]);await e.click('[data-mode="rope"]'); const before=e.scene();
  await pointerDrag(e,'[data-rope="r1"]',[[442,260],[390,280],[350,308],[320,340]],'touch');
  assert.deepEqual([...e.scene().ropes[0].nodes],['g1:hook',`${c.id}:wheel`,'p1:wheel','f1:hook']);assert.equal(e.scene().ropes[0].id,'r1');assert.ok(e.result().geometries[0]);
  await e.click('#mlUndo');assert.deepEqual(e.scene(),before);
});
test('试拉之后抓住器材从眼前的位置继续移动，不跳回试拉起点',async()=>{
  const e=controller();await e.click('[data-starter="group"]');const slider=e.nodes.get('mlPull');slider.value='.2';await slider.dispatch('input');
  const position=M.positions(e.scene()).get('g1');await pointerDrag(e,'[data-part="g1"]',[[position.x,position.y],[position.x+80.25,position.y+2.5]]);
  close(M.positions(e.scene()).get('g1').x,position.x+80.25);close(M.positions(e.scene()).get('g1').y,position.y+2.5);assert.equal(e.scene().links.find((l)=>l.child==='g1').parent,'b1:s0');
});
test('绳端最后一段只收到松手事件，也能经过轮缘并连到目标挂钩',async()=>{
  const e=controller();await e.click('[data-starter="fixed"]');await e.boardClick('[data-rope="r1"]');await e.click('[data-action="delete"]',e.nodes.get('mlInspector'));const board=e.nodes.get('mlBoard');
  await board.dispatch('pointerdown',{target:board.querySelector('[data-port="g1:hook"]'),button:0,pointerId:7,clientX:442,clientY:381});await board.dispatch('pointermove',{pointerId:7,clientX:470,clientY:102});await board.dispatch('pointerup',{pointerId:7,clientX:498,clientY:410});
  assert.deepEqual([...e.scene().ropes[0].nodes],['g1:hook','p1:wheel','f1:hook']);close(e.result().meters[0].tension,20);
});
test('来自画布子元素的点击不误触工具模式，逐点穿绳可以连续完成',async()=>{
  const e=controller();await e.click('[data-starter="fixed"]');await e.boardClick('[data-rope="r1"]');await e.click('[data-action="delete"]',e.nodes.get('mlInspector'));const board=e.nodes.get('mlBoard');
  for(const key of ['g1:hook','p1:wheel','f1:hook']){const port=board.querySelector(`[data-port="${key}"]`);await e.root.dispatch('click',{target:{closest(selector){return selector==='[data-mode]'?board:selector==='[data-port]'?port:null;}}});}
  assert.equal(e.scene().ropes.length,1);close(e.result().meters[0].tension,20);
});
test('只移动游离绳端时保留装置 SVG 与测量控件，每帧仅更新穿绳预览',async()=>{
  const e=controller();await e.click('[data-starter="fixed"]');await e.boardClick('[data-rope="r1"]');await e.click('[data-action="delete"]',e.nodes.get('mlInspector'));const board=e.nodes.get('mlBoard');
  await board.dispatch('pointerdown',{target:board.querySelector('[data-port="g1:hook"]'),button:0,pointerId:7,clientX:442,clientY:381});const writes=board.writes,driver=e.nodes.get('mlDriver').writes;
  for(let i=0;i<60;i++){await board.dispatch('pointermove',{pointerId:7,clientX:300+i*.25,clientY:440});await e.tick();}
  assert.equal(board.writes,writes);assert.equal(e.nodes.get('mlDriver').writes,driver);assert.equal(e.nodes.get('mlRecord').disabled,true);
  await board.dispatch('pointercancel',{pointerId:7});assert.equal(e.nodes.get('mlRecord').disabled,false);
});
test('穿绳提示在画布之后，消息区高度固定，开始穿绳不把画布向下推',async()=>{
  const css=await readFile(new URL('../mechanics/lab.css',import.meta.url),'utf8');const e=controller();assert.ok(e.root.innerHTML.indexOf('id="mlBoard"')<e.root.innerHTML.indexOf('id="mlWireStrip"'));assert.match(css,/\.ml-message\s*\{\s*height:68px;\s*min-height:68px;/);
});

test('按下钩码、绳端或绳段时不重建属性栏，窄屏开始拖动不会改变画布上方高度',async()=>{
  for(const selector of ['[data-part="g1"]','[data-port="g1:hook"]','[data-rope="r1"]']){
    const e=controller();await e.click('[data-starter="fixed"]');const board=e.nodes.get('mlBoard'),writes=e.nodes.get('mlInspector').writes;
    await board.dispatch('pointerdown',{target:board.querySelector(selector),button:0,pointerId:7,clientX:442,clientY:405});
    assert.equal(e.nodes.get('mlInspector').writes,writes);await board.dispatch('pointercancel',{pointerId:7});
  }
});

test('已有绳端默认带着测力计自由移动，拖动途中显示拉力而不是进入改接', async () => {
  const e = controller(); await e.click('[data-starter="fixed"]');
  const board = e.nodes.get('mlBoard'), before = e.scene();
  await board.dispatch('pointerdown', { target: board.querySelector('[data-port="f1:hook"]'), button: 0, pointerId: 7, clientX: 498, clientY: 410 });
  await board.dispatch('pointermove', { pointerId: 7, clientX: 670.25, clientY: 355.5 }); await e.tick();
  close(part(e.scene(), 'f1').x, 670.25); close(part(e.scene(), 'f1').y, 405.5);
  assert.deepEqual(e.scene().ropes, before.ropes); assert.equal(e.nodes.get('mlWireStrip').hidden, true);
  close(e.result().meters[0].tension, 20); assert.match(e.nodes.get('mlMetrics').innerHTML, /20.00 N/);
  assert.ok(e.result().meters[0].angle > 20);
  await board.dispatch('pointerup', { pointerId: 7, clientX: 680, clientY: 350 });
  close(part(e.scene(), 'f1').x, 680); close(part(e.scene(), 'f1').y, 400);
  await e.click('#mlUndo'); assert.deepEqual(e.scene(), before);
});
test('无绳杠杆按水平状态的合力矩自动给出下沉方向，平衡时保持水平', () => {
  const s = M.example('lever');
  close(M.leverAutoAngle(s, 'l1'), 0);
  part(s, 'g2').mass = 2;
  close(M.leverAutoAngle(s, 'l1'), Math.PI / 12);
  s.links[1].parent = 'l1:s2';
  close(M.leverAutoAngle(s, 'l1'), 0);
  part(s, 'g1').mass = 3;
  close(M.leverAutoAngle(s, 'l1'), -Math.PI / 12);
  assert.equal(M.leverAutoAngle(M.example('lever-force'), 'l1'), null, '接入绳索的杠杆由绳约束，不强制自动倾斜');
});

test('动滑轮对称斜绳在 0、30、45、60 度时满足 T=G/(2cosθ)，绳段分力合计等于重力', () => {
  for (const degrees of [0, 30, 45, 60]) {
    const s = M.example('tilt'), theta = degrees * Math.PI / 180, dx = M.RADIUS / Math.cos(theta) + 200 * Math.tan(theta);
    Object.assign(part(s, 'a1'), { x: 500 - dx, y: 180 }); Object.assign(part(s, 'f1'), { x: 500 + dx, y: 230 });
    const r = M.analyze(s); assert.equal(r.valid, true); close(r.tensions.r1, 10 / Math.cos(theta));
    const support = r.supports[0]; for (const side of support.sides) { close(side.angle, degrees); close(side.forceUp, 10); }
    close(support.forceX, 0); close(support.forceUp, 20);
    close(Math.hypot(r.meters[0].forceX, r.meters[0].forceY), r.tensions.r1);
    const reversed = M.clone(s); reversed.ropes[0].nodes.reverse(); close(M.analyze(reversed).tensions.r1, r.tensions.r1);
    const moved = M.pull(s, 'f1', -10); assert.ok(moved.ok, moved.issue); close(moved.result.geometries[0].length, r.geometries[0].length);
  }
});

test('只拖一侧绳端也能测非对称夹角；增加动滑轮和钩码质量会增加张力', () => {
  const s = M.example('tilt'); part(s, 'a1').x = 200; part(s, 'm1').mass = .5; part(s, 'g1').mass = 3;
  const r = M.analyze(s), support = r.supports[0], [a, b] = support.sides;
  assert.ok(a.angle > 40); close(b.angle, 0); close(r.tensions.r1, 35 / (Math.cos(a.angle * Math.PI / 180) + 1));
  close(support.forceUp, 35); assert.ok(Math.abs(support.forceX) > 0);
});

test('绳角实验两端默认可直接拖动，连续移动中实时更新分力并保持钩码悬挂', async () => {
  const e = controller(); await e.click('[data-starter="tilt"]'); const original = e.scene(), board = e.nodes.get('mlBoard');
  const at = M.point(M.positions(original), 'a1:hook'), driverWrites = e.nodes.get('mlDriver').writes, inspectorWrites = e.nodes.get('mlInspector').writes;
  await board.dispatch('pointerdown', { target: board.querySelector('[data-wire-end="r1:0"]'), button: 0, pointerId: 8, clientX: at.x, clientY: at.y });
  let previous = 10;
  for (const dx of [-60, -120, -180]) {
    await board.dispatch('pointermove', { pointerId: 8, clientX: at.x + dx, clientY: at.y + 10.25 }); await e.tick();
    close(part(e.scene(), 'a1').x, at.x + dx); assert.ok(e.result().tensions.r1 > previous); previous = e.result().tensions.r1;
    close(e.result().supports[0].forceUp, 20); assert.deepEqual(e.scene().links, original.links); assert.deepEqual(e.scene().ropes, original.ropes);
    assert.match(board.innerHTML, /θ₁=/); assert.match(e.nodes.get('mlMetrics').innerHTML, /向上分力/);
  }
  assert.equal(e.nodes.get('mlDriver').writes, driverWrites); assert.equal(e.nodes.get('mlInspector').writes, inspectorWrites);
  assert.equal(e.root.dataset.live, 'true'); assert.equal(e.nodes.get('mlWireStrip').hidden, true);
  await board.dispatch('pointercancel', { pointerId: 8 }); assert.deepEqual(e.scene(), original); close(e.result().tensions.r1, 10);
});

test('抓住绳中段默认改变绳角，抓轮上绳段移动整个悬挂装置，不拆掉任何连接', async () => {
  const e = controller(); await e.click('[data-starter="tilt"]'); const before = e.scene(), g = e.result().geometries[0], line = g.lines[1];
  const at = [(line.a.x + line.b.x) / 2, (line.a.y + line.b.y) / 2];
  await pointerDrag(e, '[data-rope="r1"]', [at, [at[0] + 70, at[1] - 15]], 'touch');
  close(part(e.scene(), 'f1').x, part(before, 'f1').x + 140); assert.ok(e.result().tensions.r1 > 10); assert.deepEqual(e.scene().ropes, before.ropes);
  await e.click('#mlUndo');
  await pointerDrag(e, '[data-rope="r1"]', [[500, 408], [550, 428]]);
  close(part(e.scene(), 'm1').x, 550); close(part(e.scene(), 'm1').y, 400); close(M.positions(e.scene()).get('g1').x, 550);
  assert.deepEqual(e.scene().links, before.links); assert.deepEqual(e.scene().ropes, before.ropes);
});

test('拖动挂在动滑轮下的钩码会带动滑轮与绳形，不再把钩码单独拆下', async () => {
  const e = controller(); await e.click('[data-starter="moving"]');
  const before = e.scene(), beforePath = e.result().geometries[0].d, weight = M.positions(before).get('g1');
  await pointerDrag(e, '[data-part="g1"]', [[weight.x, weight.y], [weight.x + 85.5, weight.y + 35.25]]);
  const after = e.scene(), posed = M.positions(after);
  close(part(after, 'm1').x, part(before, 'm1').x + 85.5);
  close(part(after, 'm1').y, part(before, 'm1').y + 35.25);
  close(posed.get('g1').x, weight.x + 85.5);
  close(posed.get('g1').y, weight.y + 35.25);
  assert.equal(after.links.find((link) => link.child === 'g1').parent, 'm1:hook');
  assert.deepEqual(after.ropes, before.ropes);
  assert.notEqual(e.result().geometries[0].d, beforePath);
  await e.click('#mlUndo'); assert.deepEqual(e.scene(), before);
});

test('斜绳进入几何冲突时不保留旧拉力，拉开后立即恢复，Esc 和撤销均能恢复连接', async () => {
  const e = controller(); await e.click('[data-starter="tilt"]'); const before = e.scene(), board = e.nodes.get('mlBoard'), at = M.point(M.positions(before), 'f1:hook');
  await board.dispatch('pointerdown', { target: board.querySelector('[data-wire-end="r1:1"]'), button: 0, pointerId: 9, clientX: at.x, clientY: at.y });
  await board.dispatch('pointermove', { pointerId: 9, clientX: 500, clientY: 380 }); await e.tick();
  assert.equal(e.result().valid, false); assert.doesNotMatch(e.nodes.get('mlMetrics').innerHTML, /10.00 N/);
  await board.dispatch('pointermove', { pointerId: 9, clientX: 720, clientY: 180 }); await e.tick(); assert.equal(e.result().valid, true);
  await e.root.dispatch('keydown', { key: 'Escape' }); assert.deepEqual(e.scene(), before);
});

test('缩放触屏、方向键微调和记录支持绳角实验，穿绳模式仍然可以改接', async () => {
  const e = controller(); await e.click('[data-starter="tilt"]'); const board = e.nodes.get('mlBoard'), s = e.scene(), at = M.point(M.positions(s), 'f1:hook');
  board.getBoundingClientRect = () => ({ left: 80, top: 100, width: 800, height: 520 });
  const screen = ([x, y]) => [80 + x * .8, 100 + y * .8];
  await pointerDrag(e, '[data-wire-end="r1:1"]', [[at.x, at.y], [at.x + 111.25, at.y + 32.5]].map(screen), 'touch');
  close(part(e.scene(), 'f1').x, at.x + 111.25); close(part(e.scene(), 'f1').y, part(s, 'f1').y + 32.5);
  await e.root.dispatch('keydown', { key: 'ArrowRight', shiftKey: true, target: board.querySelector('[data-wire-end="r1:1"]') });
  close(part(e.scene(), 'f1').x, at.x + 112.25);
  await e.click('#mlRecord'); const record = e.nodes.get('mlRecords').innerHTML; assert.match(record, /θ₁=/); assert.match(record, /θ₂=/); assert.match(record, /竖直分力/);
  await e.click('#mlUndo'); assert.equal(e.nodes.get('mlRecords').innerHTML, record);
});

test('装置无法平衡时未知分力显示缺测，不能把缺测转换成 0 N', async () => {
  const e = controller(); await e.click('#mlLeverForce'); await e.boardClick('[data-part="l1"]'); await e.changeProperty('pivot', 4);
  assert.equal(e.result().valid, false); assert.equal(e.result().meters[0].tension, null);
  assert.match(e.nodes.get('mlMetrics').innerHTML, /水平分力 — · 竖直分力 —/);
  await e.click('#mlRecord'); assert.match(e.nodes.get('mlRecords').innerHTML, /水平分力 — 竖直分力 —/);
});

test('穿绳工具打开后仍可抓住钩码主体自由移动，模式不能锁死器材', async () => {
  const e = controller(); await e.click('[data-mode="rope"]');
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [710, 510]]);
  close(part(e.scene(), 'g1').x, 710); close(part(e.scene(), 'g1').y, 510);
  assert.equal(e.scene().links.some((l) => l.child === 'g1'), false);
});

test('按下砝码或已有绳时保留原 SVG 命中节点，浏览器可完成抓取再开始拖动', async () => {
  for (const selector of ['[data-part="g1"]', '[data-wire-end="r1:1"]', '[data-rope="r1"]']) {
    const e = controller(); await e.click('[data-starter="fixed"]'); const board = e.nodes.get('mlBoard'), target = board.querySelector(selector), writes = board.writes;
    await board.dispatch('pointerdown', { target, button: 0, pointerId: 11, pointerType: 'touch', clientX: 442, clientY: 405 });
    assert.equal(board.writes, writes); assert.equal(board.querySelector(selector), target);
    await board.dispatch('pointercancel', { pointerId: 11 });
  }
});

test('图形子节点释放隐式抓取时，不取消画布仍持有的正在进行的拖动', async () => {
  const e = controller(), board = e.nodes.get('mlBoard'), target = board.querySelector('[data-part="g1"]');
  await board.dispatch('pointerdown', { target, button: 0, pointerId: 7, clientX: 430, clientY: 340 });
  await board.dispatch('pointermove', { pointerId: 7, clientX: 670, clientY: 470 }); await e.tick();
  await board.dispatch('lostpointercapture', { target, pointerId: 7 });
  await board.dispatch('pointermove', { pointerId: 7, clientX: 700, clientY: 510 }); await e.tick();
  close(part(e.scene(), 'g1').x, 700); close(part(e.scene(), 'g1').y, 510);
  await board.dispatch('pointerup', { pointerId: 7, clientX: 700, clientY: 510 });
});

test('真正失去画布抓取时取消拖动，随后仍能重新抓住并放置钩码', async () => {
  const e = controller(), board = e.nodes.get('mlBoard'), original = e.scene();
  await board.dispatch('pointerdown', { target: board.querySelector('[data-part="g1"]'), button: 0, pointerId: 7, clientX: 430, clientY: 340 });
  await board.dispatch('pointermove', { pointerId: 7, clientX: 700, clientY: 500 }); await e.tick();
  board.releasePointerCapture(7); await board.dispatch('lostpointercapture', { pointerId: 7 });
  assert.deepEqual(e.scene(), original);
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [650, 500]]); close(part(e.scene(), 'g1').x, 650);
});

test('窄屏拖空白处横向平移，不移动器材或占用下一次拖动', async () => {
  const e = controller(), board = e.nodes.get('mlBoard'), scroller = e.nodes.get('mlScroll'), original = e.scene(); scroller.scrollLeft = 50;
  await board.dispatch('pointerdown', { button: 0, pointerId: 12, pointerType: 'touch', clientX: 300, clientY: 550 });
  await board.dispatch('pointermove', { pointerId: 12, clientX: 190, clientY: 550 }); assert.equal(scroller.scrollLeft, 160);
  await board.dispatch('pointerup', { pointerId: 12, clientX: 180, clientY: 550 }); assert.equal(scroller.scrollLeft, 170); assert.deepEqual(e.scene(), original);
  await pointerDrag(e, '[data-part="g1"]', [[430, 340], [650, 500]]); close(part(e.scene(), 'g1').x, 650);
});

test('画布拒绝指针捕获时仍可从窗口接收移动和松手，所有器材不会整体失去拖动', async () => {
  const e = controller(), board = e.nodes.get('mlBoard'), target = board.querySelector('[data-part="g1"]');
  board.setPointerCapture = () => { throw new Error('pointer capture unavailable'); };
  await assert.doesNotReject(board.dispatch('pointerdown', { target, button: 0, pointerId: 21, pointerType: 'mouse', clientX: 430, clientY: 340 }));
  assert.equal(typeof e.windowEvents.pointermove, 'function');
  await e.windowEvents.pointermove({ target: e.root, pointerId: 21, pointerType: 'mouse', clientX: 680, clientY: 480, preventDefault() {} }); await e.tick();
  await e.windowEvents.pointerup({ target: e.root, type: 'pointerup', pointerId: 21, pointerType: 'mouse', clientX: 680, clientY: 480, preventDefault() {} });
  close(part(e.scene(), 'g1').x, 680); close(part(e.scene(), 'g1').y, 480);
});

test('SVG 子节点没有 closest 时可通过 composedPath 找到器材并完成拖动', async () => {
  const e = controller(), board = e.nodes.get('mlBoard'), partNode = board.querySelector('[data-part="g1"]'), leaf = {};
  const path = () => [leaf, partNode, board];
  await board.dispatch('pointerdown', { target: leaf, composedPath: path, button: 0, pointerId: 22, pointerType: 'touch', clientX: 430, clientY: 340 });
  await board.dispatch('pointermove', { target: board, button: 0, pointerId: 22, pointerType: 'touch', clientX: 690, clientY: 490 }); await e.tick();
  await board.dispatch('pointerup', { target: board, type: 'pointerup', button: 0, pointerId: 22, pointerType: 'touch', clientX: 690, clientY: 490 });
  close(part(e.scene(), 'g1').x, 690); close(part(e.scene(), 'g1').y, 490);
});

test('器材盒中的七类器材均可用鼠标或触屏从主体直接拖动', async () => {
  for (const [index, type] of Object.keys(M.TYPES).entries()) {
    const e = controller(); await e.click('[data-starter="empty"]'); await e.click(`[data-add="${type}"]`);
    const id = e.scene().parts[0].id, before = M.positions(e.scene()).get(id), pointerType = index % 2 ? 'touch' : 'mouse';
    await pointerDrag(e, `[data-part="${id}"]`, [[before.x, before.y], [before.x + 60, before.y + 25]], pointerType);
    const after = M.positions(e.scene()).get(id); close(after.x, before.x + 60); close(after.y, before.y + 25);
  }
});

test('绳索装置中的定滑轮、动滑轮、横梁和负载都能直接带着相连绳形移动', async () => {
  for (const [kind, id] of [['fixed', 'p1'], ['moving', 'm1'], ['group', 'b1'], ['group', 'g1']]) {
    const e = controller(); await e.click(`[data-starter="${kind}"]`); const before = e.scene(), pose = M.positions(before).get(id), path = e.result().geometries[0].d;
    await pointerDrag(e, `[data-part="${id}"]`, [[pose.x, pose.y], [pose.x + 47.5, pose.y + 18.25]], 'touch');
    const moved = M.positions(e.scene()).get(id); close(moved.x, pose.x + 47.5); close(moved.y, pose.y + 18.25);
    assert.notEqual(e.result().geometries[0].d, path); assert.deepEqual(e.scene().ropes, before.ropes);
  }
});
