import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';
import '../optics/physics.js';
import '../optics/drawing.js';
const O = globalThis.OpticsPhysics, D = globalThis.OpticsDrawing;
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} ≠ ${b}`);
const part = (s, id) => s.parts.find((c) => c.id === id);
const span = (hits) => Math.max(...hits.map((h) => h.offset)) - Math.min(...hits.map((h) => h.offset));

test('平面镜在任意转角下等距等大成像，再次对称得到原物体', () => {
  for (const angle of [-80, -30, 0, 45, 170]) {
    const s = O.example('mirror'), m = part(s, 'm1'), o = part(s, 'o1'); m.angle = angle;
    const v = O.mirrorImage(m, o), restored = O.mirrorPoint(m, v.base);
    close(restored.x, o.x); close(restored.y, o.y);
    close(Math.abs(O.local(m, v.base).x), Math.abs(O.local(m, o).x));
    close(Math.hypot(v.tip.x - v.base.x, v.tip.y - v.base.y), o.height);
    close(O.local(m, v.base).y, O.local(m, o).y);
  }
});
test('镜面反射光线的反向延长线交于计算的虚像，镜后光屏接不到虚像', () => {
  const s = O.example('mirror'), r = O.trace(s), image = r.virtuals[0];
  close(image.distance, 24); close(image.base.x, 770);
  for (const e of r.events) { close(O.cross(O.sub(image.tip, e.point), e.outgoing), 0); assert.ok(O.dot(O.sub(image.tip, e.point), e.outgoing) < 0); }
  s.parts.push({ ...O.component('screen', 'e1', 770, 320), size: 300 }); assert.equal(O.trace(s).hits.length, 0);
  part(s, 'o1').x += 100; const moved = O.trace(s).virtuals[0]; close(moved.distance, 14); close(moved.base.x, 670);
});
test('反射角遵守反射定律，转镜 10° 后出射方向转 20°', () => {
  const d = O.direction(0), a = O.reflect(d, O.direction(0)), b = O.reflect(d, O.direction(10));
  close(Math.acos(O.dot(a, b)) * 180 / Math.PI, 20);
  for (const angle of [0, 15, 30, 60, 80]) { const incident = O.direction(angle), normal = O.direction(0), out = O.reflect(incident, normal); close(Math.abs(O.dot(incident, normal)), Math.abs(O.dot(out, normal))); }
});
test('折射计算满足 Snell 定律、光路可逆和全反射临界条件', () => {
  const d = O.direction(40), n = O.direction(0), r = O.refract(d, n, 1, 1.5);
  close(r.direction.y * 1.5, d.y); assert.equal(r.tir, false);
  const reverse = O.refract(O.mul(r.direction, -1), n, 1.5, 1); close(reverse.direction.x, -d.x); close(reverse.direction.y, -d.y);
  assert.equal(O.refract(O.direction(50), n, 1.5, 1).tir, true);
  assert.equal(O.refract(O.direction(40), n, 1.5, 1).tir, false);
  const equal = O.refract(d, n, 1.5, 1.5); close(equal.direction.x, d.x); close(equal.direction.y, d.y);
});
test('白光棱镜在两界面折射，七个波长按计算分离，紫光偏折更多', () => {
  const s = O.example('dispersion'), r = O.trace(s); assert.equal(r.hits.length, 7); assert.deepEqual(r.issues, []);
  assert.ok(span(r.hits) > 2);
  for (let i = 1; i < r.hits.length; i++) assert.ok(r.hits[i].point.y > r.hits[i - 1].point.y);
  for (const ray of r.rays) { assert.equal(ray.interactions.length, 2); assert.ok(ray.interactions.every((e) => e.kind === 'refraction')); }
  assert.ok(O.refractiveIndex(part(s, 'p1'), 420) > O.refractiveIndex(part(s, 'p1'), 650));
  part(s, 'e1').x -= 100; assert.ok(span(O.trace(s).hits) < span(r.hits));
});
test('无色散介质使各波长重合，单色光不会自动变成七色', () => {
  const s = O.example('dispersion'); part(s, 'p1').dispersion = 0; const r = O.trace(s); assert.equal(r.hits.length, 7); close(span(r.hits), 0);
  part(s, 's1').white = false; part(s, 's1').wavelength = 475;
  assert.deepEqual(O.trace(s).hits.map((h) => h.wavelength), [475]);
  part(s, 's1').on = false; assert.equal(O.trace(s).rays.length, 0);
});
test('改变材料色散参数影响屏上分离，移开棱镜会改变真实光路', () => {
  const s = O.example('dispersion'), initial = O.trace(s); part(s, 'p1').dispersion = .015;
  const stronger = O.trace(s); assert.equal(stronger.hits.length, 7); assert.ok(span(stronger.hits) > span(initial.hits));
  part(s, 'p1').y = 490; assert.equal(O.trace(s).events.length, 0);
});
test('自由组合滤光片和棱镜按透射波段筛选，狭缝按位置遮挡', () => {
  const s = O.example('filter'); assert.deepEqual(O.trace(s).hits.map((h) => h.wavelength), [650, 610]);
  part(s, 'c1').pass = 'blue'; assert.deepEqual(O.trace(s).hits.map((h) => h.wavelength), [470, 420]);
  const focus = O.example('focus'); focus.parts.push({ ...O.component('aperture', 'a1', 300, 300), size: 200, gap: 24 });
  assert.equal(O.trace(focus).hits.length, 1); part(focus, 'a1').gap = 150; assert.equal(O.trace(focus).hits.length, 7);
});
test('两面镜子连续转向后落到光屏，移走中间镜子不再命中原光屏', () => {
  const s = O.example('periscope'), r = O.trace(s); assert.equal(r.hits.length, 3);
  r.hits.forEach((h) => { close(h.direction.x, 1); close(h.direction.y, 0); });
  r.rays.forEach((ray) => assert.deepEqual(ray.interactions.map((e) => e.componentId), ['m1', 'm2']));
  part(s, 'm2').x += 200; assert.equal(O.trace(s).hits.length, 0);
});
test('凸透镜平行光在焦平面会聚，离焦后分散，凹透镜使平行光发散', () => {
  const s = O.example('focus'); close(span(O.trace(s).hits), 0);
  part(s, 'e1').x += 100; assert.ok(span(O.trace(s).hits) > 5);
  part(s, 'l1').type = 'diverging'; part(s, 'l1').focal = -20; part(s, 'e1').size = 380;
  assert.ok(span(O.trace(s).hits) > 11);
  const reverse = { ...part(s, 'l1'), type: 'lens', focal: 20 };
  const out = O.lensDirection(reverse, { x: reverse.x, y: reverse.y + 20 }, { x: -1, y: 0 });
  close(out.y / -out.x, -.1);
});
test('倾斜玻璃砖逐面计算，出射与入射平行且发生侧向偏移', () => {
  const s = O.example('glass'), r = O.trace(s), incident = O.direction(part(s, 's1').angle);
  assert.equal(r.hits.length, 3); r.hits.forEach((h) => { close(h.direction.x, incident.x); close(h.direction.y, incident.y); });
  const center = r.rays[1], origin = center.segments[0].a, endpoint = r.hits[1].point;
  assert.ok(Math.abs(O.cross(O.sub(endpoint, origin), incident)) > 5);
  assert.equal(center.interactions.length, 2);
});
test('组合透明器材重叠会说明模型边界，闭合光路在 32 次相互作用后停止', () => {
  const s = O.example('glass'); s.parts.push({ ...O.clone(part(s, 'g1')), id: 'g2', x: 470 }); assert.match(O.trace(s).issues.join(''), /重叠/);
  const loop = { version: 1, parts: [O.component('beam', 's1', 400, 300), O.component('mirror', 'm1', 200, 300), O.component('mirror', 'm2', 600, 300)] };
  const r = O.trace(loop); assert.match(r.issues.join(''), /32/); assert.ok(r.rays.every((ray) => ray.interactions.length <= 32));
});
test('导入验证兼容保存快照，过滤未知字段并拒绝越界及无效器材', () => {
  const s = O.example('dispersion'); assert.deepEqual(O.validate(O.clone(s)), s); s.extra = 'discard'; s.parts[0].extra = 'discard'; const clean = O.validate(s); assert.equal(clean.extra, undefined); assert.equal(clean.parts[0].extra, undefined);
  for (const mutate of [(s) => s.parts.push(s.parts[0]), (s) => { s.parts[0].x = NaN; }, (s) => { s.parts[0].count = 1000; }, (s) => { s.parts[1].type = '__proto__'; }, (s) => { s.parts[1].index = -1; }, (s) => { s.parts[0].on = 'false'; }]) { const next = O.example('dispersion'); mutate(next); assert.throws(() => O.validate(next)); }
  const sources = { version: 1, parts: Array.from({ length: 7 }, (_, i) => O.component('beam', `s${i}`, 50 + i * 30, 200)) }; assert.throws(() => O.validate(sources), /6/);
});
test('绘图以追迹端点绘制实线和光屏亮点，虚像可隐藏且器材标签安全转义', () => {
  const s = O.example('mirror'), r = O.trace(s), normal = D.board(s, r, 'm1'), hidden = D.board(s, r, 'm1', { virtual: false });
  assert.match(normal, /O1′ 虚像/); assert.doesNotMatch(hidden, /O1′ 虚像/); assert.match(normal, /data-rotate="m1"/);
  const dispersion = O.example('dispersion'), hit = O.trace(dispersion); const markup = D.board(dispersion, hit, null);
  for (const h of hit.hits) assert.ok(markup.includes(`cx="${h.point.x}" cy="${h.point.y}"`));
  s.parts[0].label = '<img onerror="x">'; assert.doesNotMatch(D.board(s, O.trace(s), null), /<img/);
  part(dispersion, 'p1').dispersion = 0; const spots = D.screenSpots(O.trace(dispersion).hits); assert.equal(spots.length, 1); assert.equal(spots[0].color, '#fff5d5');
});

// Drive public DOM events with a small element fixture; no private controller API.
const uiSource = await readFile(new URL('../optics/bench.js', import.meta.url), 'utf8');
function controller() {
  const nodes = new Map(), frames = new Map(), windowEvents = {}, documentEvents = {}, downloads = []; let frameId = 1, observed, result;
  class Element {
    constructor(tag = 'div', attributes = {}) { this.tag = tag; this.attributes = attributes; this.dataset = {}; this.events = {}; this.children = []; this.disabled = 'disabled' in attributes; this.checked = 'checked' in attributes; this.type = attributes.type || ''; this.value = attributes.value || ''; this.classList = { toggle() {} }; for (const [k, v] of Object.entries(attributes)) if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v; if (attributes.id) nodes.set(attributes.id, this); }
    set innerHTML(html) { this.html = html; this.children = [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((m) => new Element(m[1], Object.fromEntries([...m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((p) => [p[1], p[2] || ''])))); if (this.tag === 'select') this.value = (this.children.find((n) => 'selected' in n.attributes) || this.children.find((n) => n.tag === 'option'))?.value || ''; }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    async dispatch(type, extras = {}) { for (const fn of this.events[type] || []) await fn({ target: this, type, preventDefault() {}, ...extras }); }
    click() { if (this.tag === 'a') downloads.push(this); return this.dispatch('click'); }
    matches(selector) { return selector.split(',').some((s) => { const m = s.trim().match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/); return m ? m[1] in this.attributes && (m[2] === undefined || m[2] === this.attributes[m[1]]) : s.trim() === this.tag; }); }
    closest(selector) { return this.matches(selector) ? this : null; }
    querySelectorAll(selector) { return this.children.filter((n) => n.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    getAttribute(k) { return this.attributes[k]; } setAttribute(k, v) { this.attributes[k] = v; }
    checkValidity() { return !['number', 'range'].includes(this.type) || Number.isFinite(Number(this.value)) && Number(this.value) >= Number(this.attributes.min) && Number(this.value) <= Number(this.attributes.max); }
    focus() {} getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 600 }; }
    setPointerCapture() {} hasPointerCapture() { return false; }
  }
  const root = new Element('section', { id: 'opticsBench' });
  const mode = (detail) => windowEvents['optics:mode']?.({ detail });
  const document = { getElementById: (id) => nodes.get(id), activeElement: null, hidden: false, addEventListener: (k, fn) => { documentEvents[k] = fn; }, createElement: (tag) => new Element(tag), querySelector: () => ({ click: () => mode('bench') }) };
  const parent = {}, origin = 'http://localhost';
  runInNewContext(uiSource, { document, window: { parent, addEventListener: (k, fn) => { windowEvents[k] = fn; } }, location: { origin }, OpticsDrawing: D, OpticsPhysics: { ...O, trace(s) { observed = O.clone(s); result = O.trace(s); return result; } }, requestAnimationFrame: (fn) => { const id = frameId++; frames.set(id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id), setTimeout: (fn) => fn(), Date, Blob, URL });
  const click = async (selector, container = root) => { const n = selector.startsWith('#') ? nodes.get(selector.slice(1)) : container.querySelector(selector); assert.ok(n, selector); await n.dispatch('click'); await root.dispatch('click', { target: n }); };
  return { root, nodes, document, documentEvents, windowEvents, parent, origin, frames, downloads, click, mode, scene: () => observed, result: () => result, async boardClick(selector) { await click(selector, nodes.get('obBoard')); }, async change(key, value, type = 'change') { const n = nodes.get('obInspector').querySelector(`[data-optics-property="${key}"]`); assert.ok(n, key); n.value = String(value); if (n.type === 'checkbox') n.checked = value; await root.dispatch(type, { target: n }); }, tick() { const next = [...frames.values()]; frames.clear(); next.forEach((fn) => fn()); } };
}
async function drag(e, selector, from, to, cancel = false, pointerType = 'mouse') {
  const board = e.nodes.get('obBoard'), target = board.querySelector(selector); assert.ok(target, selector);
  const event = (p, extras = {}) => ({ target: board, button: 0, pointerId: 7, pointerType, clientX: p[0], clientY: p[1], ...extras });
  await board.dispatch('pointerdown', event(from, { target })); await board.dispatch('pointermove', event(to)); e.tick(); await board.dispatch(cancel ? 'pointercancel' : 'pointerup', event(to));
}
test('光学控制器可初始化和切换全部起点，读数来自当前追迹', async () => {
  const e = controller(); assert.equal(e.result().hits.length, 3);
  for (const kind of ['empty', 'periscope', 'focus', 'dispersion', 'filter', 'glass']) { await e.click(`[data-optics-preset="${kind}"]`); assert.deepEqual(e.result().issues, []); }
  e.mode('dispersion'); assert.equal(e.result().hits.length, 7); assert.match(e.nodes.get('obScreenData').innerHTML, /2.22 cm/);
  e.mode('mirror-image'); assert.equal(e.result().virtuals.length, 1); assert.match(e.nodes.get('obMetrics').innerHTML, /24.00 cm/);
});
test('空白台可重复添加、复制、删除与撤销器材，属性直接改变装置', async () => {
  const e = controller(); await e.click('[data-optics-preset="empty"]');
  for (const type of Object.keys(O.TYPES)) await e.click(`[data-optics-add="${type}"]`);
  assert.equal(e.scene().parts.length, 10); const id = e.scene().parts.at(-1).id; await e.change('gap', 4); close(part(e.scene(), id).gap, 40);
  await e.click('[data-optics-action="duplicate"]', e.nodes.get('obInspector')); assert.equal(e.scene().parts.length, 11);
  await e.click('[data-optics-action="delete"]', e.nodes.get('obInspector')); assert.equal(e.scene().parts.length, 10);
  await e.click('#obUndo'); assert.equal(e.scene().parts.length, 11); await e.click('#obRedo'); assert.equal(e.scene().parts.length, 10);
  assert.equal(new Set(e.scene().parts.map((c) => c.id)).size, 10);
});
test('鼠标直接拖动物体后虚像跟随，触屏取消移动恢复原位且支持撤销重做', async () => {
  const e = controller(); e.mode('mirror-image'); const before = e.scene();
  await drag(e, '[data-optic="o1"]', [290, 365], [390, 365]); close(e.result().virtuals[0].distance, 14); close(e.result().virtuals[0].base.x, 670);
  await e.click('#obUndo'); assert.deepEqual(e.scene(), before); await e.click('#obRedo'); close(part(e.scene(), 'o1').x, 390);
  await drag(e, '[data-optic="o1"]', [390, 365], [190, 300], true, 'touch'); close(part(e.scene(), 'o1').x, 390);
  await drag(e, '[data-optic="o1"]', [390, 365], [190, 300], false, 'touch'); close(part(e.scene(), 'o1').x, 190);
});
test('缩放后的实验台仍按正确坐标移动，圆形手柄旋转改变镜面法线', async () => {
  const e = controller(); e.mode('mirror-image'); const board = e.nodes.get('obBoard'); board.getBoundingClientRect = () => ({ left: 100, top: 80, width: 800, height: 480 });
  await drag(e, '[data-optic="o1"]', [332, 372], [412, 372]); close(part(e.scene(), 'o1').x, 390);
  await e.boardClick('[data-optic="m1"]'); await drag(e, '[data-rotate="m1"]', [576, 316], [524, 368]); close(part(e.scene(), 'm1').angle, 90);
  await e.click('#obUndo'); close(part(e.scene(), 'm1').angle, 0);
  await e.root.dispatch('keydown', { target: board.querySelector('[data-optic="m1"]'), key: 'e' }); close(part(e.scene(), 'm1').angle, 5);
});
test('参数修改改变色散读数，单色波长滑块连续输入仅记一次撤销', async () => {
  const e = controller(); e.mode('dispersion'); await e.boardClick('[data-optic="p1"]'); await e.change('dispersion', 0); close(span(e.result().hits), 0);
  await e.boardClick('[data-optic="s1"]'); await e.change('white', false); assert.equal(e.result().hits.length, 1);
  await e.change('wavelength', 600, 'input'); await e.change('wavelength', 650, 'input'); await e.change('wavelength', 650);
  assert.equal(e.result().hits[0].wavelength, 650); await e.click('#obUndo'); assert.equal(e.result().hits[0].wavelength, 550);
  await e.boardClick('[data-optic="s1"]'); await e.change('on', false); assert.equal(e.result().rays.length, 0);
});
test('专题和自由探索保存独立装置与记录，转入自由探索是复制', async () => {
  const e = controller(); const bench = e.scene(); e.mode('mirror-image'); await e.click('#obRecord'); const rows = e.nodes.get('obRows').innerHTML;
  await drag(e, '[data-optic="o1"]', [290, 365], [390, 365]); assert.equal(e.nodes.get('obRows').innerHTML, rows);
  e.mode('bench'); assert.deepEqual(e.scene(), bench); e.mode('mirror-image'); close(part(e.scene(), 'o1').x, 390);
  await e.click('#obTransfer'); assert.equal(e.nodes.get('obTitle').textContent, '光学自由探索'); close(part(e.scene(), 'o1').x, 390);
  await drag(e, '[data-optic="o1"]', [390, 365], [190, 365]); e.mode('mirror-image'); close(part(e.scene(), 'o1').x, 390); assert.equal(e.nodes.get('obRows').innerHTML, rows);
});
test('导入失败保留装置，成功导入可继续复制且 ID 不冲突', async () => {
  const e = controller(), file = e.nodes.get('obFile'), before = e.scene(); file.files = [{ size: 30, text: async () => '{"parts":[]}' }]; await file.dispatch('change'); assert.deepEqual(e.scene(), before); assert.match(e.nodes.get('obNotice').textContent, /载入失败/);
  const s = O.example('dispersion'); s.parts[0].id = 'optic200'; file.files = [{ size: 2000, text: async () => JSON.stringify(s) }]; await file.dispatch('change'); assert.deepEqual(e.scene(), s);
  await e.click('[data-optics-add="beam"]'); assert.equal(new Set(e.scene().parts.map((c) => c.id)).size, 4);
});
test('取消捕获、Esc 和离开课堂不会留下半次拖动或未完成动画', async () => {
  const e = controller(); e.mode('mirror-image'); const before = e.scene(), board = e.nodes.get('obBoard');
  await board.dispatch('pointerdown', { target: board.querySelector('[data-optic="o1"]'), button: 0, pointerId: 7, clientX: 290, clientY: 365 }); await board.dispatch('pointermove', { pointerId: 7, clientX: 490, clientY: 365 });
  assert.equal(e.frames.size, 1); e.windowEvents.message({ origin: e.origin, source: e.parent, data: { type: 'gewulab:active', active: false } }); assert.equal(e.frames.size, 0); assert.deepEqual(e.scene(), before);
  await board.dispatch('pointerdown', { target: board.querySelector('[data-optic="o1"]'), button: 0, pointerId: 7, clientX: 290, clientY: 365 }); await board.dispatch('pointermove', { pointerId: 7, clientX: 400, clientY: 365 }); e.tick(); await e.root.dispatch('keydown', { key: 'Escape' }); assert.deepEqual(e.scene(), before);
});
test('光学脚本可以独立解析，独立文件与课堂发布资源完全相同', async () => {
  for (const name of await readdir(new URL('../optics/', import.meta.url))) { const source = await readFile(new URL(`../optics/${name}`, import.meta.url), 'utf8'); if (name.endsWith('.js')) assert.doesNotThrow(() => new Script(source)); for (const dir of ['public/optics', 'public/classroom/optics']) assert.equal(await readFile(new URL(`../${dir}/${name}`, import.meta.url), 'utf8'), source); }
});
test('画布边缘的旋转手柄仍可操作，从实际按下位置转动不会跳角', async () => {
  const e = controller(); e.mode('mirror-image'); await e.boardClick('[data-optic="m1"]'); await e.change('x', 97.5); await e.change('angle', 30);
  const board = e.nodes.get('obBoard'), handle = board.querySelector('[data-rotate="m1"]'); assert.ok(handle);
  const markup = board.innerHTML.split('data-rotate="m1"')[1], match = markup.match(/cx="([^"]+)" cy="([^"]+)"/); const [x, y] = match.slice(1).map(Number); assert.ok(x <= 982 && y <= 582);
  const c = part(e.scene(), 'm1'), vector = { x: x - c.x, y: y - c.y }, rotation = O.direction(10);
  await drag(e, '[data-rotate="m1"]', [x, y], [c.x + vector.x * rotation.x - vector.y * rotation.y, c.y + vector.x * rotation.y + vector.y * rotation.x]); close(part(e.scene(), 'm1').angle, 40);
});
test('原反射折射透镜实验与三个新增实验可交替切换，不把未知模式送入旧渲染器', async () => {
  const source = await readFile(new URL('../光学仿真实验室.html', import.meta.url), 'utf8'), script = source.match(/<script>([\s\S]*?)<\/script>/)[1], nodes = new Map(), listeners = {}, modes = [];
  const element = (dataset = {}) => ({ dataset, hidden: false, value: '', classList: { toggle() {} }, setAttribute() {}, addEventListener(k, fn) { this[k] = fn; }, getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 440 }; }, setPointerCapture(id) { this.pointer = id; }, hasPointerCapture(id) { return this.pointer === id; }, releasePointerCapture() { this.pointer = null; } });
  const tabs = ['bench', 'mirror-image', 'dispersion', 'reflection', 'refraction', 'lens'].map((mode) => element({ mode })), grid = element();
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  node('opticsCanvas').getContext = () => new Proxy({}, { get: (_t, k) => k === 'measureText' ? () => ({ width: 50 }) : () => {}, set: () => true });
  const document = { addEventListener() {}, getElementById: node, querySelector: () => grid, querySelectorAll: (selector) => selector === '.tab' ? tabs : selector === '.control-set' ? ['reflection', 'refraction', 'lens'].map((controls) => element({ controls })) : [] };
  runInNewContext(script, { document, window: { devicePixelRatio: 1, addEventListener: (k, fn) => { listeners[k] = fn; }, dispatchEvent: (e) => modes.push(e.detail) }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } } });
  for (const mode of ['bench', 'reflection', 'mirror-image', 'refraction', 'dispersion', 'lens', 'bench']) { tabs.find((t) => t.dataset.mode === mode).click(); const extended = ['bench', 'mirror-image', 'dispersion'].includes(mode); assert.equal(grid.hidden, extended); assert.equal(node('opticsBench').hidden, !extended); assert.equal(modes.at(-1), mode); assert.doesNotThrow(() => listeners.resize()); }
  tabs.find((t) => t.dataset.mode === 'reflection').click();
  const canvas = node('opticsCanvas'), before = node('reflectionAngleOut').textContent;
  canvas.pointerdown({ button: 0, pointerId: 7, clientX: 850, clientY: 400 });
  canvas.pointermove({ pointerId: 7, clientX: 20, clientY: 20 });
  assert.equal(node('reflectionAngleOut').textContent, before, '点击空白区不应改变入射角');
  const angle = 35 * Math.PI / 180, length = 440 * .52;
  canvas.pointerdown({ button: 0, pointerId: 7, clientX: 900 * .56 - Math.sin(angle) * length, clientY: 440 * .64 - Math.cos(angle) * length, preventDefault() {} });
  canvas.pointermove({ pointerId: 7, clientX: 250, clientY: 150 });
  assert.notEqual(node('reflectionAngleOut').textContent, before);
  canvas.pointercancel(); assert.equal(node('reflectionAngleOut').textContent, before, '取消拖动恢复原条件');
});
