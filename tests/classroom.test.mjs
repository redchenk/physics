import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Script, runInNewContext } from 'node:vm';
import { CLASSROOM_MODULES, classroomUrl, parsePlatformHash, platformHash } from '../app/classroom-catalog.ts';
import { classroomDocument } from '../scripts/sync-classroom.mjs';

test('课堂是默认入口，声光电、学生探究、教师和声音证据采集都有独立可返回的地址', () => {
  assert.deepEqual(parsePlatformHash(''), { view: 'classroom', module: null });
  assert.deepEqual(parsePlatformHash('#missing'), { view: 'classroom', module: null });
  const locations = [
    { view: 'classroom', module: null },
    ...CLASSROOM_MODULES.map((item) => ({ view: 'classroom', module: item.id })),
    { view: 'student', module: null },
    { view: 'teacher', module: null },
    { view: 'sound', module: null },
  ];
  for (const location of locations) assert.deepEqual(parsePlatformHash(platformHash(location)), location);
});

const required = {
  mechanics: ['mechanicsLab', 'mechanics/physics.js', 'mechanics/workbench-core.js', 'mechanics/workbench.js', 'mechanics/workbench.css'],
  sound: ['toneFrequency', 'toneVolume', 'toneTimbre', 'startBtn', 'waveCanvas', 'compareTimebase'],
  optics: ['data-mode="bench"', 'data-mode="mirror-image"', 'data-mode="dispersion"', 'optics/physics.js', 'optics/bench.js', 'data-mode="reflection"', 'data-mode="refraction"', 'data-mode="lens"', 'data-lens="convex"', 'data-lens="concave"', '2F'],
  electricity: ['data-mode="ohm"', 'data-mode="network"', 'data-mode="iv"', 'data-mode="induction"', 'electricity/teaching-labs.js', 'electricity/lab-models.js'],
};
for (const experiment of CLASSROOM_MODULES) {
  test(`${experiment.title}保留全部原始脚本和控件，打包文件与源文件一致且不依赖线上资源`, async () => {
    const source = await readFile(new URL(`../${experiment.filename}`, import.meta.url), 'utf8');
    const generated = classroomDocument(source, experiment.id);
    const packaged = await readFile(new URL(`../public/classroom/${experiment.filename}`, import.meta.url), 'utf8');
    const legacy = await readFile(new URL(`../public/${experiment.filename}`, import.meta.url), 'utf8');
    assert.equal(packaged, generated);
    assert.equal(legacy, source);
    for (const token of required[experiment.id]) assert.ok(generated.includes(token), token);
    const inlineScripts = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    assert.deepEqual(inlineScripts(generated), inlineScripts(source));
    for (const script of inlineScripts(generated)) assert.doesNotThrow(() => new Script(script));
    assert.doesNotMatch(generated, /(?:src|href)=["'](?:https?:)?\/\//);
    assert.equal(classroomUrl(experiment.id, true), `${classroomUrl(experiment.id)}?embedded=1`);
    assert.equal(decodeURIComponent(classroomUrl(experiment.id)), `/classroom/${experiment.filename}`);
  });
}

const bridge = await readFile(new URL('../public/classroom/classroom-bridge.js', import.meta.url), 'utf8');
function bridgeEnvironment({ moduleId = 'sound', embedded = true, height = 1350, getUserMedia } = {}) {
  const listeners = {};
  const observers = [];
  const messages = [];
  const frames = [];
  const status = { live: false, classList: { contains: () => status.live } };
  let microphoneStops = 0;
  let toneStops = 0;
  const stopTone = { disabled: true, click: () => { toneStops++; stopTone.disabled = true; } };
  const nodes = {
    'classroom-bridge': { dataset: { module: moduleId } },
    status,
    stopTone,
    stopBtn: { click: () => { microphoneStops++; status.live = false; } },
  };
  const app = { getBoundingClientRect: () => ({ height }) };
  const home = {};
  const document = {
    documentElement: { dataset: {} },
    getElementById: (id) => nodes[id],
    querySelector: (selector) => selector === 'a.brand' ? home : app,
  };
  const parent = { postMessage: (data, target) => messages.push({ data, target }) };
  const origin = 'http://127.0.0.1:3001';
  const navigator = { mediaDevices: { getUserMedia: getUserMedia ?? (async () => ({ getTracks: () => [] })) } };
  const window = {
    parent: embedded ? parent : null,
    addEventListener: (type, handler) => { listeners[type] = handler; },
    dispatchEvent: (event) => listeners[event.type]?.(event),
  };
  if (!embedded) window.parent = window;
  const context = {
    document, window, parent, navigator,
    location: { origin, search: embedded ? '?embedded=1' : '' },
    URLSearchParams, DOMException, Event,
    requestAnimationFrame: (handler) => frames.push(handler),
    ResizeObserver: class { observe() {} },
    MutationObserver: class { constructor(handler) { observers.push(handler); } observe() {} },
  };
  runInNewContext(bridge, context);
  const activate = (active, overrides = {}) => {
    listeners.message?.({ origin, source: parent, data: { type: 'gewulab:active', active }, ...overrides });
    frames.splice(0).forEach((handler) => handler());
  };
  return { document, home, navigator, messages, status, stopTone, activate, mutation: () => observers.forEach((handler) => handler()), stops: () => ({ microphoneStops, toneStops }) };
}

test('嵌入课堂只接受同源父页面通知，并报告内容高度；假来源不能启动课堂', () => {
  const env = bridgeEnvironment();
  env.activate(true, { origin: 'https://other.example' });
  env.activate(true, { source: {} });
  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].data.type, 'gewulab:ready');
  env.activate(true);
  assert.ok(env.messages.some(({ data }) => data.type === 'gewulab:height' && data.height === 1350));
  assert.ok(env.messages.every(({ target }) => target === 'http://127.0.0.1:3001'));
});

test('离开课堂声学停止采集和发生器，回到课堂不自动开启声音', () => {
  const env = bridgeEnvironment();
  env.activate(true);
  env.status.live = true;
  env.stopTone.disabled = false;
  env.mutation();
  assert.deepEqual(env.stops(), { microphoneStops: 0, toneStops: 0 });
  env.activate(false);
  assert.deepEqual(env.stops(), { microphoneStops: 1, toneStops: 1 });
  env.activate(true);
  assert.equal(env.status.live, false);
  assert.equal(env.stopTone.disabled, true);
});

test('离开课堂后才完成的麦克风授权会释放声轨，不能在隐藏页开始采集', async () => {
  let grant;
  let released = 0;
  const env = bridgeEnvironment({ getUserMedia: () => new Promise((resolve) => { grant = resolve; }) });
  env.activate(true);
  const pending = env.navigator.mediaDevices.getUserMedia({ audio: true });
  env.activate(false);
  grant({ getTracks: () => [{ stop: () => released++ }] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(released, 1);
});

test('隐藏页面迟到的发生器启动会被停止，未更改实验记录或学生档案', () => {
  const env = bridgeEnvironment();
  env.activate(false);
  env.stopTone.disabled = false;
  env.mutation();
  assert.equal(env.stops().toneStops, 1);
  assert.doesNotMatch(bridge, /localStorage|sessionStorage|fetch\(|XMLHttpRequest/);
});

test('独立实验窗口保留单独上课模式和返回入口，不接管麦克风接口', () => {
  const getUserMedia = async () => ({});
  const env = bridgeEnvironment({ embedded: false, getUserMedia });
  assert.equal(env.document.documentElement.dataset.embedded, 'false');
  assert.equal(env.home.href, '/#classroom');
  assert.equal(env.navigator.mediaDevices.getUserMedia, getUserMedia);
  assert.equal(env.messages.length, 0);
});

test('原平台首页书签转到新的课堂实验中心', async () => {
  const portal = await readFile(new URL('../public/物理教学仿真实验平台.html', import.meta.url), 'utf8');
  assert.match(portal, /location\.replace\('\/#classroom'\)/);
  assert.match(portal, /http-equiv="refresh" content="0;url=\/#classroom"/);
});
