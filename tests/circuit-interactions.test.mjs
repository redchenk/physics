import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import '../electricity/circuit-physics.js';
import '../electricity/lab-visuals.js';
import '../electricity/wire-router.js';
const source = await readFile(new URL('../electricity/circuit-builder.js', import.meta.url), 'utf8');

// Exercise the controller through public DOM events at a half-sized viewport.
function controller() {
  const nodes = new Map(), windowEvents = {}, documentEvents = {}, frames = new Map(), downloads = []; let frameId = 1, captured = null;
  class Element {
    constructor(tag = 'div', attributes = {}) {
      this.tag = tag; this.attributes = attributes; this.children = []; this.events = {}; this.style = {}; this.dataset = {}; this.value = attributes.value || ''; this.type = attributes.type || '';
      this.classList = { toggle() {}, remove() {}, add() {} };
      for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      if (attributes.id) nodes.set(attributes.id, this);
    }
    set innerHTML(html) {
      this.html = html;
      this.children = [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((match) => new Element(match[1], Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((p) => [p[1], p[2] || '']))));
      if (this.tag === 'select') this.value = (this.children.find((n) => 'selected' in n.attributes) || this.children.find((n) => n.tag === 'option'))?.value || '';
    }
    get innerHTML() { return this.html || ''; }
    matches(selector) { return selector.split(',').some((s) => { const m = s.trim().match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/); return m ? m[1] in this.attributes && (m[2] === undefined || m[2] === this.attributes[m[1]]) : s[0] === '.' ? (this.attributes.class || '').split(' ').includes(s.slice(1)) : s.trim() === this.tag; }); }
    closest(selector) { return this.matches(selector) ? this : null; }
    querySelectorAll(selector) { const descendants = this.attributes.id === 'cbBoard' ? [...this.children, ...['cbParts', 'cbWires', 'cbOverlay'].flatMap((id) => nodes.get(id)?.children || [])] : this.children; return descendants.filter((n) => n.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    contains(node) { return this === node || this.children.includes(node); }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    dispatch(type, extra = {}) { for (const fn of this.events[type] || []) fn({ type, target: this, preventDefault() {}, ...extra }); }
    click() { this.dispatch('click'); }
    setAttribute(key, value) { this.attributes[key] = value; }
    checkValidity() { return Number.isFinite(Number(this.value)) && Number(this.value) >= Number(this.attributes.min) && Number(this.value) <= Number(this.attributes.max); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 325 }; }
    setPointerCapture(id) { captured = id; } hasPointerCapture(id) { return captured === id; } releasePointerCapture() { captured = null; }
    focus() {}
  }
  const root = new Element('section', { id: 'circuitBuilder' });
  nodes.set('builderTab', new Element('button')); nodes.set('fixedElectricLab', new Element()); nodes.set('formula', new Element());
  const document = { getElementById: (id) => nodes.get(id), activeElement: null, hidden: false, querySelectorAll: () => [], addEventListener: (type, fn) => { documentEvents[type] = fn; } };
  const window = { parent: {}, addEventListener: (type, fn) => { windowEvents[type] = fn; } };
  runInNewContext(source, { document, window, location: { origin: 'http://localhost' }, LabWorkspace: { createStore() {}, viewport() {}, download(name, content) { downloads.push({ name, content }); } }, CircuitPhysics: globalThis.CircuitPhysics, ElectricVisuals: globalThis.ElectricVisuals, WireRouter: globalThis.WireRouter, requestAnimationFrame: (fn) => { const id = frameId++; frames.set(id, fn); return id; }, cancelAnimationFrame: (id) => frames.delete(id), setTimeout: (fn) => fn(), Date, Blob, URL });
  const click = (selector, container = root) => root.dispatch('click', { target: container.querySelector(selector) });
  click('[data-add="resistor"]');
  const board = nodes.get('cbBoard'), id = nodes.get('cbObjects').children.find((n) => n.value)?.value;
  const position = () => ({ ...nodes.get('cbParts').querySelector(`[data-part="${id}"]`).style });
  // Initial coordinates are inline styles; subsequent drag updates use style.left/top.
  const initial = nodes.get('cbParts').querySelector(`[data-part="${id}"]`).attributes.style;
  const left = () => Number((position().left || nodes.get('cbParts').querySelector(`[data-part="${id}"]`).attributes.style.match(/left:([\d.]+)px/)[1]).toString().replace('px', ''));
  const pointer = (type, x, y = 55) => board.dispatch(type, { button: 0, pointerId: 7, clientX: x, clientY: y, target: type === 'pointerdown' ? nodes.get('cbParts').querySelector(`[data-select="${id}"]`) : board });
  const tick = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); };
  return { root, nodes, windowEvents, documentEvents, document, click, pointer, tick, left, initial, downloads };
}

test('缩放电路图后元件跟随指针，pointerup 位置也会提交，撤销恢复原位', () => {
  const e = controller(), start = e.left();
  e.pointer('pointerdown', 70); e.pointer('pointermove', 100); e.tick(); assert.equal(e.left(), start + 60);
  e.pointer('pointerup', 120); assert.equal(e.left(), start + 100);
  e.nodes.get('cbUndo').click(); assert.equal(e.left(), start);
});

test('电学失去捕获、Esc 或隐藏页面会恢复半次拖动，并停止未完成动画', () => {
  for (const cancel of [(e) => e.pointer('lostpointercapture', 120), (e) => e.root.dispatch('keydown', { key: 'Escape' }), (e) => { e.document.hidden = true; e.documentEvents.visibilitychange(); }]) {
    const e = controller(), start = e.left(); e.pointer('pointerdown', 70); e.pointer('pointermove', 120); e.tick(); assert.equal(e.left(), start + 100);
    cancel(e); assert.equal(e.left(), start); e.tick(); assert.equal(e.left(), start);
  }
});

test('电阻数值输入即时改变计算，离开输入框只生成一次撤销', () => {
  const e = controller(), input = e.nodes.get('cbValue');
  input.value = '60'; e.root.dispatch('input', { target: input }); assert.match(e.nodes.get('cbParts').innerHTML, /60 Ω/);
  e.root.dispatch('focusout', { target: input }); e.nodes.get('cbUndo').click(); assert.match(e.nodes.get('cbParts').innerHTML, /30 Ω/);
});

test('导入完整电路备份后撤销和重做会同时恢复装置与记录', async () => {
  const e = controller(); e.nodes.get('cbRecord').disabled = false; e.nodes.get('cbRecord').click();
  assert.equal(e.nodes.get('cbRecordCount').textContent, '1 组');
  e.nodes.get('cbSave').click();
  const exported = e.downloads[0]; assert.match(exported.name, /备份.json/);
  assert.equal(JSON.parse(exported.content).records.length, 1);
  const input = e.nodes.get('cbFile');
  input.files = [{ size: 200, text: async () => JSON.stringify({ version: 1, circuit: { components: [], wires: [] }, records: [] }) }];
  await input.events.change[0]({ target: input });
  assert.equal(e.nodes.get('cbRecordCount').textContent, '0 组'); assert.equal(e.nodes.get('cbParts').innerHTML, '');
  e.nodes.get('cbUndo').click();
  assert.equal(e.nodes.get('cbRecordCount').textContent, '1 组'); assert.match(e.nodes.get('cbParts').innerHTML, /30 Ω/);
  e.nodes.get('cbRedo').click();
  assert.equal(e.nodes.get('cbRecordCount').textContent, '0 组'); assert.equal(e.nodes.get('cbParts').innerHTML, '');
  input.files = [{ size: exported.content.length, text: async () => exported.content }];
  await input.events.change[0]({ target: input });
  assert.equal(e.nodes.get('cbRecordCount').textContent, '1 组'); assert.match(e.nodes.get('cbParts').innerHTML, /30 Ω/);
});
