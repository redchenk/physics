(() => {
  'use strict';
  const O = globalThis.OpticsPhysics, D = globalThis.OpticsDrawing, root = document.getElementById('opticsBench'); if (!root) return;
  const $ = (id) => document.getElementById(id), esc = D.esc, fmt = (n, unit = '') => Number.isFinite(n) ? `${n.toFixed(2)}${unit ? ` ${unit}` : ''}` : '—';
  const states = { bench: { scene: O.example('periscope'), records: [], undo: [], redo: [] }, 'mirror-image': { scene: O.example('mirror'), records: [], undo: [], redo: [] }, dispersion: { scene: O.example('dispersion'), records: [], undo: [], redo: [] } };
  let mode = 'bench', selected = null, result, serial = 100, drag = null, pendingFrame = 0, inputBefore = null, suppressClick = false, virtual = true, normals = false;
  const current = () => states[mode], scene = () => current().scene, setScene = (s) => { current().scene = s; }, part = () => scene().parts.find((c) => c.id === selected);
  const presets = [['empty', '空白实验台'], ['periscope', '双镜潜望镜'], ['focus', '透镜与光屏'], ['image', '凸透镜成像'], ['diverging', '凹透镜发散'], ['dispersion', '白光过棱镜'], ['filter', '滤光片＋棱镜'], ['glass', '玻璃砖偏移']];
  root.innerHTML = `<div class="ob-heading"><div><h2 id="obTitle">光学自由探索</h2><p id="obDescription"></p></div><button type="button" id="obTransfer" class="ob-button">带到自由探索</button></div>
    <div class="ob-presets" id="obPresets" aria-label="可拆改的起始装置">${presets.map(([id, label]) => `<button type="button" data-optics-preset="${id}">${label}</button>`).join('')}</div>
    <div class="ob-layout"><aside class="ob-sidebar"><details class="lab-palette-panel" id="obPalette" open><summary class="lab-palette-summary">添加光学器材</summary><h3>器材盒 <small>可重复添加、自由组合</small></h3><div class="ob-palette">${Object.entries(O.TYPES).map(([id, info]) => `<button type="button" data-optics-add="${id}" aria-label="添加${info.name}"><b>${info.symbol}</b>${info.name}<span>＋</span></button>`).join('')}</div></details></aside><section id="obInspector" class="ob-inspector ob-sidebar" aria-label="所选器材属性"></section>
    <div class="ob-workspace"><div class="ob-toolbar"><button type="button" id="obUndo" class="ob-button">撤销</button><button type="button" id="obRedo" class="ob-button">重做</button><button type="button" id="obVirtual" class="ob-button" aria-pressed="true">虚像与延长线</button><button type="button" id="obNormals" class="ob-button" aria-pressed="false">界面法线</button><span></span><button type="button" id="obSave" class="ob-button">保存装置</button><button type="button" id="obImport" class="ob-button">载入装置</button><input type="file" accept=".json,application/json" id="obFile" hidden aria-label="载入光学装置"><button type="button" id="obReset" class="ob-button">恢复起点</button></div>
    <div class="lab-view-tools" id="obViewTools"><button type="button" class="ob-button" data-lab-zoom="fit" aria-pressed="true">适应窗口</button><button type="button" class="ob-button" data-lab-zoom="out" aria-label="缩小光路图">−</button><output id="obZoom">100%</output><button type="button" class="ob-button" data-lab-zoom="in" aria-label="放大光路图">＋</button><button type="button" class="ob-button" data-lab-zoom="actual">原始大小</button><select id="obObjects" aria-label="选择光学器材"></select><button type="button" class="ob-button" id="obProperties">查看属性</button><span class="lab-save-status" id="obSaveStatus" role="status">自动保存准备中</span></div><p id="obNotice" class="ob-notice" role="status">拖动器材移动，选中后拖圆形手柄旋转。光线会按实际位置重新计算。</p><div class="ob-scroll" id="obScroll" tabindex="0" aria-label="可缩放和左右滚动的光学实验台"><div class="lab-stage" id="obStage"><svg id="obBoard" class="ob-board" viewBox="0 0 1000 600" aria-label="可拖放组合的光路图"></svg></div></div><p class="ob-legend"><span>实线：实际光路</span><span>虚线：反向延长线，不是真实光线</span><span>光屏亮点：实际到达的光</span></p><div id="obStatus" class="ob-status" aria-live="polite"></div><div id="obMetrics" class="ob-metrics"></div><section class="ob-screen-readout"><div class="ob-readout-heading"><h3>光屏读数</h3><select id="obScreen" aria-label="选择观察光屏"></select></div><div id="obScreenData"></div></section></div></div>
    <div class="ob-questions"><div><h3>先预测，再操作</h3><p id="obQuestion"></p></div><div><h3>改变一个条件</h3><p id="obMethod"></p></div></div>
    <section class="ob-records"><div class="ob-record-heading"><h3>探索记录 <small id="obRecordCount">0 组</small></h3><button type="button" id="obRecord" class="ob-button primary">记录当前结果</button><button type="button" id="obBackup" class="ob-button">保存装置与记录</button><button type="button" id="obCsv" class="ob-button">导出 CSV</button></div><div class="ob-table-scroll"><table><thead><tr><th>组次</th><th>器材与变量</th><th>测量结果</th><th>模型提示</th></tr></thead><tbody id="obRows"></tbody></table></div></section>
    <details class="ob-model"><summary>操作说明与模型范围</summary><p>直接拖动器材；点击后拖圆形手柄旋转，也可用属性数值精调。方向键移动，Q / E 转动，Delete 删除，Esc 取消拖动。所有起始装置可拆改；保存装置导出 JSON，探索记录可导出 CSV。</p><p>镜面采用理想双面反射，棱镜与玻璃砖在每个表面按折射定律追迹并处理全反射。白光以七个代表波长取样；色散用可调的正常色散教学模型 n(λ)=n₅₅₀+B(1/λ²−1/0.55²)，λ 以 μm 计，不对应指定牌号玻璃。颜色位置由光路计算，颜色显示不是光谱仪测量的强度。</p><p>透镜采用薄透镜近轴近似，不计算色差或像差。仅显示物体顶端的代表光线，平面镜虚像轮廓显示第一次直接反射的对称像；不将多镜反射的所有高阶虚像都画出。光屏只截获实际光线，虚像不能投到光屏上；零散亮点不等于完整清晰像。忽略衍射、干涉、偏振、界面部分反射及真实吸收，每条光线最多追踪 32 次相互作用。透明器材不宜重叠。</p><p>实验依据：<a href="https://openstax.org/books/university-physics-volume-3/pages/2-1-images-formed-by-plane-mirrors" target="_blank" rel="noreferrer">平面镜成像</a>、<a href="https://openstax.org/books/university-physics-volume-3/pages/1-5-dispersion" target="_blank" rel="noreferrer">色散</a>、<a href="https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses" target="_blank" rel="noreferrer">薄透镜</a>（OpenStax）。三个自由探索专题的装置与记录自动保存在此浏览器；“保存装置与记录”导出完整备份，“载入装置”可恢复备份或单个装置。</p></details>`;
  const board = $('obBoard');
  function validateWorkspace(raw) {
    if (!raw || raw.version !== 1 || !raw.states) throw new Error('光学备份格式不正确');
    const clean = { version: 1, states: {} };
    for (const key of ['bench', 'mirror-image', 'dispersion']) {
      const item = raw.states[key];
      if (!item || !Array.isArray(item.records) || item.records.length > 200) throw new Error('专题记录格式不正确');
      clean.states[key] = { scene: O.validate(item.scene), records: item.records.map((r) => {
        if (!r || ['time', 'conditions', 'measurements', 'notes'].some((k) => typeof r[k] !== 'string' || r[k].length > 100000)) throw new Error('实验记录不正确');
        return { scene: O.validate(r.scene), ...Object.fromEntries(['time', 'conditions', 'measurements', 'notes'].map((k) => [k, r[k]])) };
      }) };
    }
    return clean;
  }
  const store = globalThis.LabWorkspace?.createStore('gewuphysics.classroom.optics.v1', validateWorkspace, (message) => { $('obSaveStatus').textContent = message; });
  const workspace = () => ({ version: 1, states: Object.fromEntries(Object.entries(states).map(([key, value]) => [key, { scene: value.scene, records: value.records }])) });
  function persist() { store?.save(workspace()); }
  function announce(message) { $('obNotice').textContent = message; }
  function remember(before = scene()) { current().undo.push(O.clone(before)); if (current().undo.length > 60) current().undo.shift(); current().redo.length = 0; }
  function cancelDrag() { if (pendingFrame) cancelAnimationFrame(pendingFrame); pendingFrame = 0; if (drag) { const old = drag; drag = null; setScene(old.before); if (board.hasPointerCapture(old.pointer)) board.releasePointerCapture(old.pointer); } if (inputBefore) { remember(inputBefore); inputBefore = null; } }
  function inspector() {
    const c = part(); if (!c) { $('obInspector').innerHTML = '<h3>器材属性</h3><p>点击器材调节光源、焦距、介质或尺寸。所有器材都可以拖动和旋转。</p>'; return; }
    const field = (key, label, min, max, step = 1, value = c[key], type = 'number') => `<label>${label}<input data-optics-property="${key}" type="${type}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(c.label)} ${label}"></label>`;
    const source = ['beam', 'object'].includes(c.type);
    let html = `<h3>${esc(c.label)} · ${O.TYPES[c.type].name}</h3><div class="ob-position">${field('x', '水平位置 / cm', 1.5, 98.5, .5, c.x / O.SCALE)}${field('y', '竖直位置 / cm', 1.5, 58.5, .5, c.y / O.SCALE)}</div>${field('angle', '转角 / °', -180, 180, 1)}<div class="ob-rotate-buttons"><button type="button" data-optics-action="turn-left">↶ 15°</button><button type="button" data-optics-action="turn-right">↷ 15°</button></div>`;
    if (source) html += `<label class="ob-check"><input data-optics-property="on" type="checkbox" ${c.on ? 'checked' : ''}>打开光源</label><label>光源颜色<select data-optics-property="white" aria-label="光源颜色"><option value="true" ${c.white ? 'selected' : ''}>白光（七个代表波长）</option><option value="false" ${!c.white ? 'selected' : ''}>单色光</option></select></label>${!c.white ? field('wavelength', '波长 / nm', 400, 700, 5, c.wavelength, 'range') + `<output id="obWavelength">${c.wavelength} nm</output>` : ''}`;
    if (c.type === 'beam') html += field('count', '光线束数', 1, 15) + field('width', '光束宽度 / cm', 0, 15, .5, c.width / O.SCALE) + field('spread', '发散角 / °', 0, 100);
    if (c.type === 'object') html += field('height', '物体高度 / cm', 1.5, 12, .5, c.height / O.SCALE);
    if (!source) html += field('size', `${c.type === 'prism' ? '棱镜高度' : '有效尺寸'} / cm`, 4, 38, 1, c.size / O.SCALE);
    if (['lens', 'diverging'].includes(c.type)) html += field('focal', '焦距大小 / cm', 4, 45, 1, Math.abs(c.focal)) + `<small>${c.type === 'lens' ? '正焦距，会聚光线' : '负焦距，发散光线'}；选中显示焦点 F。</small>`;
    if (['prism', 'glass'].includes(c.type)) html += field('index', '550 nm 折射率', 1.1, 2.2, .01) + field('dispersion', '色散系数 B', 0, .025, .001) + `<small>B=0 时各色光的折射率相同。</small>`;
    if (c.type === 'prism') html += field('apex', '棱镜顶角 / °', 25, 90);
    if (c.type === 'glass') html += field('depth', '玻璃砖厚度 / cm', 2.5, 22, .5, c.depth / O.SCALE);
    if (c.type === 'aperture') html += field('gap', '狭缝宽度 / cm', .4, 16, .2, c.gap / O.SCALE);
    if (c.type === 'filter') html += `<label>透过颜色<select data-optics-property="pass" aria-label="滤光片透过颜色">${[['red', '红光区域'], ['green', '绿光区域'], ['blue', '蓝光区域'], ['all', '全部透过']].map(([value, name]) => `<option value="${value}" ${c.pass === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label><small>理想波段滤光片，不改变透过光的传播方向。</small>`;
    $('obInspector').innerHTML = html + '<div class="ob-inspector-actions"><button type="button" data-optics-action="align">对齐高度与方向</button><button type="button" data-optics-action="duplicate">复制器材</button><button type="button" data-optics-action="delete" class="danger">删除器材</button></div>';
  }
  function screenReadout() {
    const screens = scene().parts.filter((c) => c.type === 'screen'), previous = $('obScreen').value;
    $('obScreen').innerHTML = screens.length ? screens.map((c) => `<option value="${c.id}" ${c.id === previous ? 'selected' : ''}>${esc(c.label)} 光屏</option>`).join('') : '<option value="">未添加光屏</option>';
    const c = screens.find((c) => c.id === $('obScreen').value); if (!c) { $('obScreenData').innerHTML = '<p>添加光屏截获光束。平面镜虚像只能用延长线定位，不能被光屏承接。</p>'; return; }
    const hits = result.hits.filter((h) => h.componentId === c.id);
    if (!hits.length) { $('obScreenData').innerHTML = '<p>当前没有光线到达这块光屏。移动或旋转光屏，让它与实际光路相交。</p>'; return; }
    const offsets = hits.map((h) => h.offset), lo = Math.min(...offsets), hi = Math.max(...offsets), span = Math.max(1, hi - lo), min = lo - span * .15, max = hi + span * .15;
    const scale = (value) => 40 + (value - min) / (max - min || 1) * 600;
    $('obScreenData').innerHTML = `<svg viewBox="0 0 680 72" class="ob-profile" aria-label="光屏上各色光的位置，自动放大显示"><path d="M40 40H640" stroke="#657b88"/>${D.screenSpots(hits).map((h) => `<path d="M${scale(h.offset)} 17v28" stroke="${h.color}" stroke-width="4"/><circle cx="${scale(h.offset)}" cy="31" r="4" fill="${h.color}"/>`).join('')}<text x="40" y="64">${fmt(min)} cm</text><text x="640" y="64" text-anchor="end">${fmt(max)} cm</text></svg><p>相对光屏中心，沿图中＋方向为正；各波长数值为其取样光线的平均落点。图中自动放大位置差，实际跨度 ${fmt(hi - lo, 'cm')}；共 ${hits.length} 条取样光线到达。</p><div class="ob-spectrum-readings">${[...new Set(hits.map((h) => h.wavelength))].sort((a, b) => b - a).map((w) => { const values = hits.filter((h) => h.wavelength === w).map((h) => h.offset); return `<span><i style="background:${O.spectrumColor(w)}"></i>${w} nm <b>${fmt(values.reduce((s, v) => s + v, 0) / values.length, 'cm')}</b></span>`; }).join('')}</div>`;
  }
  function measurements() {
    const list = [], image = result.virtuals[0], prism = scene().parts.find((c) => c.type === 'prism');
    if (image) list.push(['物体到镜面', image.distance, 'cm'], ['像到镜面', image.distance, 'cm'], ['物体 / 像的高度', image.height, 'cm'], ['像 / 物高度比', 1, '']);
    if (prism) { list.push(['红光折射率', O.refractiveIndex(prism, 650), ''], ['紫光折射率', O.refractiveIndex(prism, 420), '']); }
    const screenId = $('obScreen').value || scene().parts.find((c) => c.type === 'screen')?.id, hits = result.hits.filter((h) => h.componentId === screenId);
    if (hits.length) list.push(['光屏亮点跨度', Math.max(...hits.map((h) => h.offset)) - Math.min(...hits.map((h) => h.offset)), 'cm']);
    list.push(['实际光线取样', result.rays.length, '条']); return list;
  }
  function records() {
    const rows = current().records; $('obRecordCount').textContent = `${rows.length} 组`; $('obCsv').disabled = !rows.length; $('obRecord').disabled = !scene().parts.length || !!drag;
    $('obRows').innerHTML = rows.length ? rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.conditions)}</td><td>${esc(r.measurements)}</td><td>${esc(r.notes)}</td></tr>`).join('') : '<tr><td colspan="4">改动前后分别记录，比较像距、光线方向或光屏上的分色位置。</td></tr>';
  }
  function render(full = true) {
    result = O.trace(scene()); const propertyKey = document.activeElement?.dataset.opticsProperty; const focusAttr = ['data-optic', 'data-rotate'].find((k) => document.activeElement?.getAttribute(k)), focusId = focusAttr && document.activeElement.getAttribute(focusAttr);
    board.innerHTML = D.board(scene(), result, selected, { virtual, normals }); if (focusId && !drag) board.querySelector(`[${focusAttr}="${focusId}"]`)?.focus({ preventScroll: true });
    screenReadout(); $('obMetrics').innerHTML = measurements().map(([name, value, unit]) => `<div><span>${name}</span><strong>${fmt(value, unit)}</strong></div>`).join('');
    const special = mode === 'mirror-image' ? result.virtuals.length ? '虚像与物体关于镜面对称，镜后的虚线只是定位辅助；移动物体或镜面继续比较。' : '添加发光物体与平面镜，或调整位置使光线到达镜面。' : mode === 'dispersion' ? '改变棱镜、入射方向或光屏位置，观察各色光的偏折；紫光通常比红光偏折更多。' : '实线按当前器材位置逐次反射或折射。器材不用“连线”，放进光路就会参与实验。';
    $('obStatus').textContent = result.issues.length ? result.issues.join('；') : special; $('obStatus').classList.toggle('warning', !!result.issues.length);
    $('obUndo').disabled = !current().undo.length; $('obRedo').disabled = !current().redo.length; $('obRecord').disabled = !scene().parts.length || !!drag;
    $('obObjects').innerHTML = '<option value="">选择器材…</option>' + scene().parts.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.label)} ${O.TYPES[c.type].name}</option>`).join('');
    if (full) { inspector(); records(); if (propertyKey) $('obInspector').querySelector(`[data-optics-property="${propertyKey}"]`)?.focus({ preventScroll: true }); if (!drag && !inputBefore) persist(); }
  }
  function selectMode(next) {
    if (!Object.hasOwn(states, next)) return; cancelDrag(); mode = next; selected = null;
    const content = { bench: ['光学自由探索', '移动、旋转、组合器材，让每一条光路都由你的装置决定。', '怎样用两面镜子让光线绕过障碍？怎样让光在光屏上会聚？', '从一个起始装置开始，每次只改变一个位置、角度或器材。'], 'mirror-image': ['平面镜成像', '拖动物体或镜面，比较像与物的位置、大小和对称关系。', '物体离镜面更近时，像怎样移动？把光屏放在虚像处能接到像吗？', '先固定镜面改变物距，再固定物体转动镜面。分别记录物距、像距与高度比。'], dispersion: ['白光色散', '让白光穿过棱镜，在光屏上观察不同波长的分离。', '红光与紫光的偏折一样吗？单色光通过棱镜会变成七色吗？', '保持入射方向不变，分别调节色散系数、棱镜顶角和光屏位置；再加入滤光片。'] }[mode];
    [$('obTitle'), $('obDescription'), $('obQuestion'), $('obMethod')].forEach((el, i) => { el.textContent = content[i]; });
    $('obPresets').hidden = mode !== 'bench'; $('obTransfer').hidden = mode === 'bench'; render();
  }
  function loadPreset(kind) { cancelDrag(); remember(); setScene(O.example(kind)); selected = null; render(); announce('已载入装置。所有器材可继续移动、旋转、复制或删除。'); }
  function remove() { if (!part()) return; cancelDrag(); remember(); setScene({ ...scene(), parts: scene().parts.filter((c) => c.id !== selected) }); selected = null; render(); announce('器材已移除，光路重新计算；可撤销。'); }
  function add(type, copy = null) {
    const ordinal = scene().parts.filter((p) => p.type === type).length + 1, positions = [170, 400, 650, 850].flatMap((x) => [150, 300, 460].map((y) => ({ x, y })));
    const vacant = positions.sort((a, b) => Math.min(10000, ...scene().parts.map((c) => Math.hypot(c.x - b.x, c.y - b.y))) - Math.min(10000, ...scene().parts.map((c) => Math.hypot(c.x - a.x, c.y - a.y))))[0];
    let id; do { id = `optic${serial++}`; } while (scene().parts.some((c) => c.id === id));
    const c = copy ? { ...O.clone(copy), id, label: `${O.TYPES[type].prefix}${ordinal}`, x: Math.min(940, copy.x + 45), y: Math.min(550, copy.y + 35) } : O.component(type, id, vacant.x, vacant.y, ordinal), next = O.clone(scene()); next.parts.push(c);
    try { O.validate(next); } catch (e) { announce(e.message); return; } remember(); setScene(next); selected = c.id; render(); announce(`已添加 ${O.TYPES[type].name}。拖到光路上，再调整方向。`);
  }
  function turn(degrees) { const c = part(); if (!c) return; remember(); c.angle = ((c.angle + degrees + 540) % 360) - 180; render(); }
  root.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const preset = e.target.closest('[data-optics-preset]'), item = e.target.closest('[data-optic]'), create = e.target.closest('[data-optics-add]');
    if (preset) { loadPreset(preset.dataset.opticsPreset); return; }
    if (create) { cancelDrag(); add(create.dataset.opticsAdd); return; }
    if (item) { selected = item.dataset.optic; render(); return; }
    const action = e.target.closest('[data-optics-action]')?.dataset.opticsAction;
    if (action === 'align' && part()) { const c = part(), reference = scene().parts.find((p) => p.id !== c.id && ['beam', 'object', 'lens', 'diverging'].includes(p.type)); remember(); c.y = reference?.y ?? 300; c.angle = reference?.angle ?? 0; render(); announce('已对齐参考器材的方向和高度；可继续精调或撤销。'); }
    if (action === 'delete') remove(); if (action === 'duplicate' && part()) add(part().type, part()); if (action === 'turn-left') turn(-15); if (action === 'turn-right') turn(15);
  });
  function property(e, complete) {
    const target = e.target, key = target.dataset.opticsProperty, c = part(); if (!key || !c) return;
    if (!target.checkValidity() || target.value === '' && target.type !== 'checkbox') { if (complete) { if (inputBefore) setScene(inputBefore); inputBefore = null; render(); announce('请输入范围内的数值。'); } return; }
    const next = O.clone(scene()), p = next.parts.find((p) => p.id === c.id); let value = target.type === 'checkbox' ? target.checked : key === 'white' ? target.value === 'true' : key === 'pass' ? target.value : Number(target.value);
    if (['x', 'y', 'size', 'height', 'width', 'depth', 'gap'].includes(key)) value *= O.SCALE; if (key === 'focal' && p.type === 'diverging') value = -value; p[key] = value;
    try { O.validate(next); } catch (error) { announce(error.message); return; }
    if (!inputBefore) inputBefore = O.clone(scene()); setScene(next); if (complete) { remember(inputBefore); inputBefore = null; } render(complete);
    if (key === 'wavelength' && $('obWavelength')) $('obWavelength').textContent = `${value} nm`;
  }
  root.addEventListener('input', (e) => { if (['range', 'number'].includes(e.target.type)) property(e, false); }); root.addEventListener('change', (e) => property(e, true));
  root.addEventListener('focusout', (e) => { if (inputBefore && e.target.dataset.opticsProperty) property(e, true); });
  const pointAt = (e) => { const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) * O.WIDTH / r.width, y: (e.clientY - r.top) * O.HEIGHT / r.height }; };
  board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return; const handle = e.target.closest('[data-rotate]'), item = e.target.closest('[data-optic]'); if (!handle && !item) return;
    selected = handle?.dataset.rotate || item.dataset.optic; const c = part(), at = pointAt(e); drag = { id: c.id, pointer: e.pointerId, rotate: !!handle, before: O.clone(scene()), start: at, x: c.x, y: c.y, angle: c.angle, moved: false };
    board.setPointerCapture(e.pointerId); e.preventDefault(); inspector();
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointer !== e.pointerId) return; const at = pointAt(e), dx = at.x - drag.start.x, dy = at.y - drag.start.y; if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true; const c = part(); if (drag.rotate) { const delta = (Math.atan2(at.y - c.y, at.x - c.x) - Math.atan2(drag.start.y - c.y, drag.start.x - c.x)) * 180 / Math.PI; c.angle = ((Math.round(drag.angle + delta) + 540) % 360) - 180; } else { c.x = Math.max(25, Math.min(975, Math.round((drag.x + dx) / (e.shiftKey ? 1 : 5)) * (e.shiftKey ? 1 : 5))); c.y = Math.max(25, Math.min(575, Math.round((drag.y + dy) / (e.shiftKey ? 1 : 5)) * (e.shiftKey ? 1 : 5))); }
    if (!pendingFrame) pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; render(false); });
  });
  function finishDrag(e) {
    if (!drag || drag.pointer !== e.pointerId) return; const d = drag; drag = null; if (pendingFrame) cancelAnimationFrame(pendingFrame); pendingFrame = 0;
    if (d.moved) { if (e.type !== 'pointerup') setScene(d.before); else remember(d.before); suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
    if (board.hasPointerCapture(e.pointerId)) board.releasePointerCapture(e.pointerId); render();
  }
  board.addEventListener('pointerup', finishDrag); board.addEventListener('pointercancel', finishDrag); board.addEventListener('lostpointercapture', finishDrag);
  root.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $(e.shiftKey ? 'obRedo' : 'obUndo').click(); return; }
    if (e.key === 'Escape') { cancelDrag(); render(); announce('已取消拖动，器材恢复原位。'); return; }
    const target = e.target.closest('[data-optic],[data-rotate]'); if (target) selected = target.dataset.optic || target.dataset.rotate;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    if (!part()) return;
    if (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') { e.preventDefault(); turn(e.key.toLowerCase() === 'q' ? -5 : 5); return; }
    if (e.key.startsWith('Arrow') && target) { e.preventDefault(); remember(); const c = part(); c.x = Math.max(25, Math.min(975, c.x + (e.key === 'ArrowLeft' ? -5 : e.key === 'ArrowRight' ? 5 : 0))); c.y = Math.max(25, Math.min(575, c.y + (e.key === 'ArrowUp' ? -5 : e.key === 'ArrowDown' ? 5 : 0))); render(); }
    if (['Enter', ' '].includes(e.key) && target) { e.preventDefault(); render(); }
  });
  for (const [id, fromKey, toKey] of [['obUndo', 'undo', 'redo'], ['obRedo', 'redo', 'undo']]) $(id).addEventListener('click', () => {
    cancelDrag(); const state = current(); if (!state[fromKey].length) return; const previous = state[fromKey].pop();
    state[toKey].push(previous.scene ? { scene: O.clone(scene()), records: O.clone(state.records) } : O.clone(scene()));
    setScene(previous.scene || previous); if (previous.scene) state.records = previous.records; selected = null; render();
  });
  $('obVirtual').addEventListener('click', () => { virtual = !virtual; $('obVirtual').setAttribute('aria-pressed', String(virtual)); render(false); }); $('obNormals').addEventListener('click', () => { normals = !normals; $('obNormals').setAttribute('aria-pressed', String(normals)); render(false); });
  $('obScreen').addEventListener('change', () => render(false)); $('obReset').addEventListener('click', () => loadPreset(mode === 'mirror-image' ? 'mirror' : mode === 'dispersion' ? 'dispersion' : 'periscope'));
  $('obTransfer').addEventListener('click', () => { const copy = O.clone(scene()); states.bench.undo.push(O.clone(states.bench.scene)); states.bench.redo = []; states.bench.scene = copy; document.querySelector('[data-mode="bench"]').click(); announce('装置已带到自由探索；原专题的装置与记录保留。继续加器材组合实验。'); });
  function download(name, content, type) { if (globalThis.LabWorkspace) { globalThis.LabWorkspace.download(name, content, type); return; } const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('obSave').addEventListener('click', () => download('光学探索装置.json', JSON.stringify(scene(), null, 2), 'application/json')); $('obImport').addEventListener('click', () => $('obFile').click());
  $('obFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('文件过大，最多 5 MB'); const raw = JSON.parse(await file.text());
      if (raw.states) {
        const next = validateWorkspace(raw); cancelDrag();
        for (const key of Object.keys(states)) { states[key].undo.push({ scene: O.clone(states[key].scene), records: O.clone(states[key].records) }); states[key].redo = []; states[key].scene = next.states[key].scene; states[key].records = next.states[key].records; }
      } else { const next = O.validate(raw); cancelDrag(); remember(); setScene(next); }
      selected = null; render(); announce('已载入装置或完整备份；本专题导入前的装置和记录可撤销恢复。');
    }
    catch (error) { announce(`载入失败：${error.message}。原装置保留。`); } finally { e.target.value = ''; }
  });
  $('obRecord').addEventListener('click', () => {
    if (!scene().parts.length || drag) return; if (current().records.length >= 200) { announce('已记录 200 组，请先导出保存。'); return; }
    const conditions = scene().parts.map((c) => `${c.label} ${O.TYPES[c.type].name} (${fmt(c.x / 10)},${fmt(c.y / 10)}) cm ${c.angle}°${['lens', 'diverging'].includes(c.type) ? ` f=${c.focal} cm` : ''}${['prism', 'glass'].includes(c.type) ? ` n550=${c.index} B=${c.dispersion} 顶角=${c.apex}°` : ''}${['beam', 'object'].includes(c.type) ? ` ${c.on ? c.white ? '白光' : `${c.wavelength} nm` : '关闭'}` : ''}`).join('；');
    const screen = result.hits.map((h) => `${scene().parts.find((c) => c.id === h.componentId).label} ${h.wavelength} nm: ${fmt(h.offset, 'cm')}`).join('；');
    current().records.push({ time: new Date().toISOString(), scene: O.clone(scene()), conditions, measurements: measurements().map(([name, value, unit]) => `${name} ${fmt(value, unit)}`).join('；') + (screen ? `；${screen}` : ''), notes: result.issues.join('；') || '理想几何光学；光屏只记录实际到达的光' }); records(); persist(); announce(`已记录 ${current().records.length} 组。之后的修改不会改变这组快照。`);
  });
  $('obCsv').addEventListener('click', () => { const cell = (s) => `"${String(s).replace(/"/g, '""')}"`, rows = [['组次', '时间', '器材与变量', '测量结果', '模型提示', '装置快照'], ...current().records.map((r, i) => [i + 1, r.time, r.conditions, r.measurements, r.notes, JSON.stringify(r.scene)])]; download('光学探索记录.csv', '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); });
  window.addEventListener('optics:mode', (e) => { if (Object.hasOwn(states, e.detail)) { selectMode(e.detail); viewport?.refresh(); } else cancelDrag(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelDrag(); render(); } });
  window.addEventListener('message', (e) => { if (e.source === window.parent && e.origin === location.origin && e.data?.type === 'gewulab:active' && e.data.active === false) { cancelDrag(); render(); } });
  $('obObjects').addEventListener('change', (event) => { cancelDrag(); selected = event.target.value || null; render(); });
  $('obProperties').addEventListener('click', () => { $('obInspector').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); $('obInspector').querySelector('input,select,button')?.focus({ preventScroll: true }); });
  $('obBackup').addEventListener('click', () => download('光学实验完整备份.json', JSON.stringify(workspace(), null, 2), 'application/json'));
  const restored = store?.load(); if (restored) for (const key of Object.keys(states)) { states[key].scene = restored.states[key].scene; states[key].records = restored.states[key].records; }
  const viewport = globalThis.LabWorkspace?.viewport({ board, stage: $('obStage'), scroll: $('obScroll'), width: O.WIDTH, height: O.HEIGHT, controls: $('obViewTools'), output: $('obZoom') });
  if (window.matchMedia?.('(max-width:760px)').matches) $('obPalette').open = false;
  selectMode('bench'); document.querySelector('[data-mode="bench"]').click();
})();
