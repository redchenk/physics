(() => {
  'use strict';
  const { TYPES, terminals, solveCircuit, createComponent, createExample } = globalThis.CircuitPhysics;
  const root = document.getElementById('circuitBuilder');
  if (!root) return;
  let circuit = createExample('empty');
  let selected = null, pending = null, drag = null, sequence = 100;
  let parameterEdit = null;
  let routes = [];
  const router = globalThis.WireRouter;
  let wireScene = { paths: [], junctions: [], crossings: [], conflicts: [] }, wireStyle = 'schematic', routeCache = [], routeSignature = '';
  let pins = [], previewPoint = null, suppressClick = false, dragFrame = 0, lastPointer = null;
  let result = solveCircuit([], []);
  const undo = [], redo = [], records = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = (value, unit) => value === null || value === undefined ? '未接入' : `${(Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)} ${unit}`;
  root.innerHTML = `
    <div class="cb-heading"><div><h2>自由搭建电路</h2><p>添加元件 → 点击两个接线柱接线 → 闭合开关 → 读取电表</p></div><span class="cb-live" id="cbStatus" role="status"></span></div>
    <div class="cb-layout">
      <aside class="cb-sidebar"><h3>元件盒 <small>点击添加，可重复使用</small></h3><div class="cb-palette">${Object.entries(TYPES).map(([type, t]) => `<button type="button" data-add="${type}" aria-label="添加${t.name}"><b>${t.symbol}</b><span>${t.name}</span><i>＋</i></button>`).join('')}</div>
        <section class="cb-inspector" id="cbInspector" aria-label="选中对象的属性"></section>
        <details class="cb-help"><summary>接线与操作说明</summary><p>点击两个接线柱即可接线。接线途中点击空白处可指定拐点，Backspace 退回一个拐点，Esc 取消。同一接线柱可接多根线，也可用分线点分支。</p><p>实心圆点表示分支相通，跨线桥表示交叉不相通。点击导线会高亮两端，拖动线段上的握柄调整走向；方向键也可调整。</p><p>拖动元件主体移动，方向键微调。Delete 删除选中对象，误操作可撤销。“整理自动导线”保留手动调整的线路。</p><p>电流表串入被测支路，电压表跨接在被测元件两端。红色为正接线柱，深色为负接线柱；负读数表示反向偏转。</p><p>滑动变阻器：接 A 与滑片 W，或 B 与 W 调阻；只接 A、B 时始终使用全部电阻。</p></details>
      </aside>
      <div class="cb-workspace">
        <div class="cb-toolbar"><label for="cbExample">起始电路</label><select id="cbExample"><option value="empty">空白实验台</option><option value="lamp">点亮小灯泡</option><option value="ohm">伏安法测电阻</option><option value="series">两个电阻串联</option><option value="parallel">两个电阻并联</option></select><button type="button" id="cbLoad">载入</button><span class="cb-toolbar-spacer"></span><button type="button" id="cbUndo" disabled>撤销</button><button type="button" id="cbRedo" disabled>重做</button><button type="button" id="cbClear">清空实验台</button></div>
        <div class="cb-wiring-tools"><label for="cbWireStyle">导线外观</label><select id="cbWireStyle"><option value="schematic">教材电路图</option><option value="smooth">圆滑导线</option></select><button type="button" id="cbArrangeWires">整理自动导线</button><span>点击接线柱接线 · 空白处可指定拐点</span></div>
        <p class="cb-message" id="cbMessage" aria-live="polite">先从左侧添加电源、开关和负载，或载入一个示例后改接。</p>
        <div class="cb-scroll" tabindex="0" aria-label="可横向滚动的电路实验台"><div class="cb-board" id="cbBoard" aria-label="电路搭建区域"><svg id="cbWires" viewBox="0 0 960 650" aria-label="已连接的导线"></svg><div id="cbParts"></div><svg id="cbOverlay" viewBox="0 0 960 650" aria-label="导线编辑与接线预览"></svg><div class="cb-empty" id="cbEmpty"><b>从一根导线开始</b><p>元件可以自由组合。接线柱间的连接决定电路。</p><span>＋ 添加元件，或选择上方示例</span></div></div></div>
        <p class="cb-wire-legend"><span><b>●</b> 实心点：分支相通</span><span><b>⌒</b> 跨线桥：交叉不相通</span><span><b>↕</b> 选中导线：拖动整段调整</span></p><div class="cb-feedback" id="cbFeedback" aria-live="polite"></div>
        <section class="cb-meters"><div class="cb-section-heading"><h3>电表读数</h3><button type="button" id="cbRecord">＋ 记录本次读数</button></div><div class="cb-readings" id="cbReadings"></div></section>
      </div>
    </div>
    <section class="cb-records"><div class="cb-section-heading"><h3>实验记录 <small id="cbRecordCount">0 组</small></h3><button type="button" id="cbExport" disabled>导出 CSV</button></div><div class="cb-table-scroll"><table><thead><tr><th>组次</th><th>电路与参数</th><th>电表读数</th><th>状态</th></tr></thead><tbody id="cbRecordBody"><tr><td colspan="4">接好电路后，主动记录一组读数，再改变接法或参数进行比较。</td></tr></tbody></table></div></section>
    <p class="cb-model">直流稳态教学模型：导线和闭合开关理想，电源内阻 0.1 Ω，电流表内阻 0.01 Ω，电压表内阻无限大；灯泡按所设定值电阻计算，亮度随功率变化。记录仅保留在当前页面，可导出保存。</p>`;

  function remember(snapshot = circuit, savedRoutes = routeCache) { undo.push({ circuit: clone(snapshot), routes: clone(savedRoutes) }); if (undo.length > 60) undo.shift(); redo.length = 0; }
  function announce(message) { $('cbMessage').textContent = message; }
  function selectedPart() { return circuit.components.find((c) => c.id === selected); }
  function terminalName(key) {
    const [id, port] = key.split(':');
    const c = circuit.components.find((item) => item.id === id);
    if (!c) return key;
    const label = c.type === 'rheostat' ? port.toUpperCase() : ['battery', 'ammeter', 'voltmeter'].includes(c.type) ? port === 'a' ? '正极' : '负极' : port.toUpperCase();
    return `${c.label} ${label}`;
  }
  function localPort(c, port) {
    if (c.type === 'junction') return { x: 0, y: 0 };
    return port === 'w' ? { x: 0, y: -48 } : { x: port === 'a' ? -65 : 65, y: 0 };
  }
  function symbol(c) {
    const stroke = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
    let shape = '';
    if (c.type === 'battery') shape = '<path d="M0 28H39M45 6V50M58 16V40M64 28H104"/>';
    if (c.type === 'resistor' || c.type === 'rheostat') shape = '<path d="M0 28H22M82 28H104"/><rect x="22" y="16" width="60" height="24"/>' + (c.type === 'rheostat' ? `<path d="M52 0V7L${22 + c.position * 60} 16m-5-7 5 7 5-5"/>` : '');
    if (c.type === 'lamp') shape = globalThis.ElectricVisuals.lamp(result.readings[c.id]?.power || 0, c.id);
    if (c.type === 'switch') shape = `<path d="M0 28H28M76 28H104M28 28L76 ${c.closed ? 28 : 7}"/><circle cx="28" cy="28" r="3"/><circle cx="76" cy="28" r="3"/>`;
    if (c.type === 'ammeter' || c.type === 'voltmeter') shape = `<path d="M0 28H30M74 28H104"/><circle cx="52" cy="28" r="22"/><text x="52" y="35" transform="rotate(${-c.rotation} 52 28)" text-anchor="middle" fill="currentColor" stroke="none" font-size="24" font-family="sans-serif">${TYPES[c.type].symbol}</text>`;
    if (c.type === 'junction') shape = '<circle cx="52" cy="28" r="8" fill="currentColor"/>';
    return `<svg viewBox="0 0 104 56" aria-hidden="true"><g ${stroke}>${shape}</g></svg>`;
  }
  function description(c) {
    const r = result.readings[c.id];
    if (TYPES[c.type].range) return result.valid ? number(r?.value, c.type === 'ammeter' ? 'A' : 'V') : '短路 · 暂停读数';
    if (c.type === 'switch') return c.closed ? '闭合' : '断开';
    if (c.type === 'lamp') return `${globalThis.ElectricModels.lampState(r?.power || 0).label} · ${(r?.power || 0).toFixed(2)} W`;
    if (c.type === 'rheostat') return `A–W ${(c.value * c.position).toFixed(1)} Ω`;
    return c.value !== undefined ? `${c.value} ${TYPES[c.type].unit}` : '共用节点';
  }
  const netColors = new Map();
  function color(net) { const palette = ['#8edce1', '#f0c281', '#b1d890', '#c4b0f1', '#efa4b0', '#94baf0']; if (!netColors.has(net)) netColors.set(net, palette[netColors.size % palette.length]); return netColors.get(net); }
  const radius = () => wireStyle === 'smooth' ? 24 : 7;
  function renderWires(fresh = false) {
    const focused = document.activeElement?.dataset.wire;
    const signature = JSON.stringify([circuit.components.map(({ id, type, x, y, rotation }) => ({ id, type, x, y, rotation })), circuit.wires]);
    if (fresh || signature !== routeSignature) {
      routes = router.routeWires(circuit.components, circuit.wires, { previous: fresh ? [] : routeCache });
      routeCache = routes; routeSignature = signature; wireScene = router.scene(routes);
    }
    const active = routes.find((r) => r.id === selected), activeNet = active?.net;
    const tone = (net) => activeNet && net !== activeNet ? ' is-muted' : '';
    let drawing = wireScene.paths.map((path) => `<g class="cb-net${tone(path.net)}" style="--wire-color:${color(path.net)}"><path class="cb-wire-line" d="${router.pathData(path.points, radius())}"/></g>`).join('');
    if (active) drawing += `<path class="cb-selected-wire" d="${router.pathData(active.points, radius())}"/>`;
    drawing += wireScene.crossings.map((p) => `<g class="cb-bridge${tone(p.net)}" style="--wire-color:${color(p.net)}"><path d="M${p.x} ${p.y - 9}V${p.y + 9}" class="cb-bridge-cut"/><path d="M${p.x} ${p.y - 9}C${p.x + 14} ${p.y - 9} ${p.x + 14} ${p.y + 9} ${p.x} ${p.y + 9}" class="cb-wire-casing"/><path d="M${p.x} ${p.y - 9}C${p.x + 14} ${p.y - 9} ${p.x + 14} ${p.y + 9} ${p.x} ${p.y + 9}" class="cb-wire-line"/></g>`).join('');
    drawing += wireScene.junctions.map((p) => `<circle class="cb-junction${tone(p.net)}" cx="${p.x}" cy="${p.y}" r="5.5" fill="${color(p.net)}"><title>同一节点，分支相通</title></circle>`).join('');
    drawing += routes.filter((r) => r.failed).map((r) => `<path class="cb-unrouted" d="${router.pathData(r.points, 0)}"><title>${r.issue}</title></path>`).join('');
    drawing += circuit.wires.map((wire, index) => `<g data-wire="${wire.id}" tabindex="0" role="button" aria-label="导线 ${index + 1}：${terminalName(wire.from)} 接 ${terminalName(wire.to)}" class="cb-wire"><path class="cb-wire-hit" d="${router.pathData(routes[index].points, radius())}"/><title>导线 ${index + 1} · ${terminalName(wire.from)} → ${terminalName(wire.to)}</title></g>`).join('');
    $('cbWires').innerHTML = drawing;
    renderOverlay();
    if (focused) $('cbWires').querySelector(`[data-wire="${focused}"]`)?.focus({ preventScroll: true });
    board.querySelectorAll('[data-terminal]').forEach((node) => node.classList.toggle('is-wire-end', !!active && [active.from, active.to].includes(node.dataset.terminal)));
  }
  function renderOverlay() {
    const active = routes.find((r) => r.id === selected); let content = '';
    if (active && !pending) {
      const points = router.editPoints(active.points);
      for (let i = 1; i < points.length - 2; i++) {
        const a = points[i], b = points[i + 1], horizontal = a.y === b.y;
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 28) continue;
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        content += `<g data-segment="${i}" data-route-handle="${active.id}" tabindex="0" role="button" aria-label="第 ${i} 段导线，${horizontal ? '上下' : '左右'}拖动或方向键调整" class="cb-segment-handle ${horizontal ? 'horizontal' : 'vertical'}" transform="translate(${x} ${y})"><rect x="${horizontal ? -19 : -9}" y="${horizontal ? -9 : -19}" width="${horizontal ? 38 : 18}" height="${horizontal ? 18 : 38}" rx="7"/><path d="${horizontal ? 'M-6-3V3M0-3V3M6-3V3' : 'M-3-6H3M-3 0H3M-3 6H3'}"/></g>`;
      }
      for (const [label, p] of [['起', active.points[0]], ['终', active.points.at(-1)]]) if (p) content += `<circle cx="${p.x}" cy="${p.y}" r="20" class="cb-end-ring"/><text x="${p.x + 25}" y="${p.y - 21}" class="cb-end-label">${label}</text>`;
    }
    if (pending) {
      const [id, port] = pending.split(':'), c = circuit.components.find((p) => p.id === id);
      if (c) {
        const a = router.terminal(c, port), path = [a], targets = [...pins, ...(previewPoint ? [previewPoint] : [])];
        for (const p of targets) { const last = path.at(-1); path.push({ x: p.x, y: last.y }, p); }
        content += `<path class="cb-pending-wire" d="${router.pathData(router.simplify(path), 7)}"/>` + pins.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" class="cb-pin"/>`).join('');
      }
    }
    $('cbOverlay').innerHTML = content;
  }
  function renderParts() {
    const focused = document.activeElement;
    const focusAttribute = focused?.dataset.terminal ? 'terminal' : focused?.dataset.select ? 'select' : null;
    const focusKey = focusAttribute ? focused.dataset[focusAttribute] : null;
    $('cbParts').innerHTML = circuit.components.map((c) => `<div class="cb-part ${c.x > 730 ? 'labels-left' : ''} ${c.type === 'lamp' ? 'is-lamp' : ''} ${c.type === 'rheostat' ? 'is-rheostat' : ''} ${c.rotation % 180 ? 'is-vertical' : ''} ${selected === c.id ? 'is-selected' : ''}" data-part="${c.id}" style="left:${c.x}px;top:${c.y}px">
      <span class="cb-part-title">${c.label} <small>${TYPES[c.type].name}</small></span>
      <div class="cb-rotor" style="transform:rotate(${c.rotation}deg)"><button type="button" class="cb-body" data-select="${c.id}" aria-label="选择 ${c.label} ${TYPES[c.type].name}，方向键移动">${symbol(c)}</button>${terminals(c).map((port) => { const p = localPort(c, port), key = `${c.id}:${port}`; return `<button type="button" class="cb-terminal ${port === 'a' && ['battery', 'ammeter', 'voltmeter'].includes(c.type) ? 'positive' : ''} ${pending === key ? 'is-pending' : ''}" style="left:${65 + p.x}px;top:${28 + p.y}px" data-terminal="${key}" aria-label="接线柱 ${terminalName(key)}" title="${terminalName(key)}"><span style="transform:rotate(${-c.rotation}deg)">${c.type === 'rheostat' ? port.toUpperCase() : ['battery', 'ammeter', 'voltmeter'].includes(c.type) ? port === 'a' ? '+' : '−' : '•'}</span></button>`; }).join('')}</div>
      <span class="cb-part-value ${result.readings[c.id]?.overload ? 'cb-overload' : ''}">${description(c)}</span></div>`).join('');
    $('cbEmpty').hidden = circuit.components.length > 0;
    renderWires();
    if (focusKey) $('cbParts').querySelector(`[data-${focusAttribute}="${focusKey}"]`)?.focus({ preventScroll: true });
  }
  function renderInspector() {
    const c = selectedPart();
    const wire = circuit.wires.find((item) => item.id === selected);
    if (!c && !wire) { $('cbInspector').innerHTML = '<h3>元件属性</h3><p>点击实验台上的元件可调节参数、开关和电表量程。</p>'; return; }
    if (wire) {
      const route = routes.find((r) => r.id === wire.id), related = routes.filter((r) => r.net === route?.net);
      $('cbInspector').innerHTML = `<h3>导线 ${circuit.wires.indexOf(wire) + 1} <small>${wire.manual || wire.waypoints || wire.via ? '已手动调整' : '自动避让'}</small></h3><p class="cb-wire-endpoints">${terminalName(wire.from)}<br>↓<br>${terminalName(wire.to)}</p><p>拖动握柄平移整段线路，方向键微调。接线关系保持不变。</p><button type="button" data-action="autoroute">恢复这根线的自动布线</button><button type="button" data-action="delete">删除这根导线</button>${related.length > 1 ? `<div class="cb-related-wires"><small>此节点包含 ${related.length} 根导线，点击切换</small>${related.map((r) => `<button type="button" data-pick-wire="${r.id}" aria-pressed="${r.id === selected}">${terminalName(r.from)} ↔ ${terminalName(r.to)}</button>`).join('')}</div>` : ''}`; return;
    }
    const t = TYPES[c.type];
    $('cbInspector').innerHTML = `<h3>${c.label} · ${t.name}</h3>
      ${t.value !== undefined ? `<label for="cbValue">${c.type === 'battery' ? '电源电动势' : c.type === 'rheostat' ? '最大电阻' : '电阻'} / ${t.unit}</label><input id="cbValue" data-property="value" type="number" min="${t.min}" max="${t.max}" step="${t.step}" value="${c.value}"><small>范围 ${t.min}–${t.max} ${t.unit}</small>` : ''}
      ${c.type === 'rheostat' ? `<label for="cbPosition">滑片位置 <output id="cbPositionOut">${Math.round(c.position * 100)}%</output></label><input id="cbPosition" data-property="position" type="range" min="0" max="100" step="1" value="${c.position * 100}"><p>0% 靠近 A；100% 靠近 B</p>` : ''}
      ${t.range ? `<label for="cbRange">量程 / ${c.type === 'ammeter' ? 'A' : 'V'}</label><select id="cbRange" data-property="range">${(c.type === 'ammeter' ? [0.6, 3] : [3, 15]).map((v) => `<option value="${v}" ${v === c.range ? 'selected' : ''}>0–${v}</option>`).join('')}</select>` : ''}
      ${c.type === 'switch' ? `<button type="button" data-action="toggle">${c.closed ? '断开开关' : '闭合开关'}</button>` : ''}
      <div class="cb-property-actions"><button type="button" data-action="rotate">旋转 90°</button><button type="button" data-action="delete">删除元件</button></div><small>删除元件会一起移除其导线，可撤销。</small>`;
  }
  function renderReadings() {
    const meters = circuit.components.filter((c) => TYPES[c.type].range);
    $('cbReadings').innerHTML = meters.length ? meters.map((c) => {
      const r = result.readings[c.id];
      return `<div class="cb-reading ${r?.overload ? 'cb-reading-warning' : ''}"><span>${c.label} · ${TYPES[c.type].name} <small>量程 ${c.range} ${c.type === 'ammeter' ? 'A' : 'V'}</small></span><strong>${description(c)}</strong><small>${r?.overload ? '超量程' : r?.reversed ? '反向偏转' : c.type === 'ammeter' ? '正值：从 + 流入' : '正极电势 − 负极电势'}</small></div>`;
    }).join('') : '<p>添加电流表或电压表，接入后在这里比较读数。</p>';
    const status = { 'no-source': '待接入电源', open: '断路 / 无电流', closed: '通路', short: '电源短路' };
    $('cbStatus').textContent = `${status[result.status]} · ${circuit.components.length} 个元件 / ${circuit.wires.length} 根导线`;
    $('cbStatus').dataset.state = result.status;
    $('cbFeedback').innerHTML = result.warnings.length ? `<ul>${result.warnings.map((w) => `<li>${escape(w)}</li>`).join('')}</ul>` : `<p>${result.status === 'open' ? '未形成有电流的闭合回路。检查开关和负载接线；电压表串联时不导通。' : result.status === 'closed' ? '已按当前接线计算。移动电表接线位置，可比较不同支路的电流和不同元件两端的电压。' : '实验台未接入电源，可先完成接线。'}</p>`;
    $('cbFeedback').classList.toggle('has-warning', result.warnings.length > 0);
    if (routes.some((route) => route.failed)) { $('cbFeedback').innerHTML += '<p>虚线处布线空间不足：请移开重叠元件，或选中导线调整走向 / 恢复自动布线。</p>'; $('cbFeedback').classList.add('has-warning'); }
    if (wireScene.conflicts.length) { $('cbFeedback').innerHTML += '<p>不同节点的导线重叠，请调整走向或恢复自动布线。</p>'; $('cbFeedback').classList.add('has-warning'); }
    $('cbRecord').disabled = !result.valid || !meters.length || result.status === 'no-source' || meters.some((c) => result.readings[c.id].value === null);
  }
  function render(inspector = true) {
    result = solveCircuit(circuit.components, circuit.wires);
    renderParts(); if (inspector) renderInspector(); renderReadings();
    $('cbUndo').disabled = !undo.length; $('cbRedo').disabled = !redo.length;
  }
  function cancelConnection() { pending = null; pins = []; previewPoint = null; }
  function resetRoutes() { routeCache = []; routeSignature = ''; }
  function selectWire(id) { cancelConnection(); selected = id; renderParts(); renderInspector(); }
  function connect(key) {
    if (!pending) { selected = null; pending = key; pins = []; previewPoint = null; announce(`已选择 ${terminalName(key)}。点击目标接线柱自动连接，也可先点空白处指定拐点。Esc 取消。`); renderParts(); renderInspector(); return; }
    if (pending === key) { cancelConnection(); announce('已取消接线。'); renderParts(); return; }
    if (circuit.wires.some((w) => (w.from === pending && w.to === key) || (w.to === pending && w.from === key))) { announce('这两个接线柱已有导线，无需重复连接。'); cancelConnection(); renderParts(); return; }
    if (circuit.wires.length >= 180) { announce('最多放置 180 根导线，请先删除不需要的导线。'); return; }
    const next = { id: `wire${sequence++}`, from: pending, to: key, ...(pins.length ? { waypoints: clone(pins) } : {}) };
    const trial = router.routeWires(circuit.components, [...circuit.wires, next], { previous: routeCache });
    if (trial.some((r) => r.failed && !routes.find((old) => old.id === r.id)?.failed) || router.scene(trial).conflicts.length) { announce('这条路径被挡住了。请移开元件，或按 Backspace 撤回拐点后重新选择。'); return; }
    remember(); circuit.wires.push(next);
    announce(`已连接 ${terminalName(pending)} 与 ${terminalName(key)}。点击线路可调整走向。`); cancelConnection(); selected = next.id; render();
  }
  function removeSelected() {
    if (!selected) return;
    remember();
    circuit.components = circuit.components.filter((c) => c.id !== selected);
    circuit.wires = circuit.wires.filter((w) => w.id !== selected && !w.from.startsWith(`${selected}:`) && !w.to.startsWith(`${selected}:`));
    selected = null; cancelConnection(); resetRoutes(); render(); announce('已删除，可点击“撤销”恢复。');
  }
  root.addEventListener('click', (event) => {
    if (suppressClick) { suppressClick = false; return; }
    if (event.target.closest('[data-route-handle]')) return;
    const pickWire = event.target.closest('[data-pick-wire]');
    if (pickWire) { selectWire(pickWire.dataset.pickWire); return; }
    const add = event.target.closest('[data-add]');
    if (add) {
      if (circuit.components.length >= 60) { announce('最多放置 60 个元件，请先删除不需要的元件。'); return; }
      remember(); const type = add.dataset.add;
      const ordinal = Math.max(0, ...circuit.components.filter((c) => c.type === type).map((c) => Number(c.label.replace(/\D/g, '')))) + 1;
      const { x, y } = globalThis.WireRouter.findPlacement(circuit.components, circuit.wires, type);
      const c = createComponent(type, `part${sequence++}`, x, y, ordinal); circuit.components.push(c); selected = c.id; cancelConnection(); render(); announce(`已添加 ${c.label} ${TYPES[type].name}。拖动调整位置，点击接线柱连线。`); return;
    }
    const terminal = event.target.closest('[data-terminal]');
    if (terminal) { connect(terminal.dataset.terminal); return; }
    const body = event.target.closest('[data-select]');
    if (body) { selected = body.dataset.select; cancelConnection(); renderParts(); renderInspector(); return; }
    const wire = event.target.closest('[data-wire]');
    if (wire && !pending) { selectWire(wire.dataset.wire); return; }
    if (pending && board.contains(event.target)) {
      const p = boardPoint(event);
      if (circuit.components.flatMap(router.obstacles).some((r) => router.inside(p, r))) { announce('拐点不能放在元件或标注上，请点空白网格。'); return; }
      if (pins.length >= 8) { announce('最多设置 8 个拐点。请点击目标接线柱完成接线。'); return; }
      pins.push(p); previewPoint = p; renderOverlay(); announce(`已指定 ${pins.length} 个拐点。继续点击空白处，或点击目标接线柱完成接线；Backspace 退回。`); return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'delete') { removeSelected(); return; }
    if (action === 'autoroute') { const wire = circuit.wires.find((w) => w.id === selected); if (wire) { remember(); delete wire.via; delete wire.manual; delete wire.waypoints; routeCache = routeCache.filter((r) => r.id !== wire.id); routeSignature = ''; render(); announce('已恢复这根线的自动布线。'); } return; }
    const c = selectedPart();
    if (c && (action === 'rotate' || action === 'toggle')) { remember(); if (action === 'rotate') c.rotation = (c.rotation + 90) % 360; else c.closed = !c.closed; render(); }
  });
  root.addEventListener('change', (event) => {
    const key = event.target.dataset.property, c = selectedPart();
    if (!key || !c) return;
    const value = Number(event.target.value);
    if (!event.target.checkValidity() || event.target.value === '' || !Number.isFinite(value)) { announce('请输入标注范围内的有效数值。'); renderInspector(); return; }
    remember(parameterEdit?.id === c.id ? parameterEdit.snapshot : circuit); parameterEdit = null;
    c[key] = key === 'position' ? value / 100 : value;
    render(false); if (key === 'position') $('cbPositionOut').textContent = `${value}%`;
    announce(`${c.label} 参数已更新，电表按当前接线重新计算。`);
  });
  root.addEventListener('input', (event) => {
    const c = selectedPart();
    if (event.target.id !== 'cbPosition' || !c) return;
    parameterEdit ??= { id: c.id, snapshot: clone(circuit) };
    c.position = Number(event.target.value) / 100;
    $('cbPositionOut').textContent = `${event.target.value}%`;
    render(false);
  });
  const board = $('cbBoard');
  const clampPosition = (c) => { c.x = Math.max(90, Math.min(870, c.x)); c.y = Math.max(110, Math.min(c.rotation % 180 ? 540 : 570, c.y)); };
  const boardPoint = (event) => { const rect = board.getBoundingClientRect(); return { x: Math.max(10, Math.min(950, Math.round((event.clientX - rect.left) * 960 / rect.width / 10) * 10)), y: Math.max(10, Math.min(640, Math.round((event.clientY - rect.top) * 650 / rect.height / 10) * 10)) }; };
  function invalidEdit(before) { return routes.some((r) => r.failed && !before.find((p) => p.id === r.id)?.failed) || wireScene.conflicts.length > router.scene(before).conflicts.length; }
  board.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-route-handle]');
    if (handle && event.button === 0) {
      event.preventDefault(); selected = handle.dataset.routeHandle; const route = routes.find((r) => r.id === selected);
      const points = router.editPoints(route.points), index = Number(handle.dataset.segment);
      drag = { kind: 'wire', id: selected, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, points, index, horizontal: points[index].y === points[index + 1].y, snapshot: clone(circuit), routes: clone(routes), moved: false };
      board.setPointerCapture(event.pointerId); return;
    }
    const body = event.target.closest('[data-select]');
    if (!body || event.button !== 0) return;
    selected = body.dataset.select; const c = selectedPart();
    cancelConnection();
    drag = { id: c.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: c.x, y: c.y, snapshot: clone(circuit), routes: clone(routes), moved: false };
    renderInspector();
    renderWires();
    board.querySelectorAll('.cb-part').forEach((node) => node.classList.toggle('is-selected', node.dataset.part === selected));
  });
  board.addEventListener('pointermove', (event) => {
    if (!drag) { if (pending) { previewPoint = boardPoint(event); renderOverlay(); } return; }
    if (event.pointerId !== drag.pointer) return;
    lastPointer = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; if (drag && lastPointer) updateDrag(lastPointer); });
  });
  function updateDrag(event) {
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) board.setPointerCapture(event.pointerId);
    drag.moved = true;
    if (drag.kind === 'wire') {
      const wire = circuit.wires.find((w) => w.id === drag.id); wire.manual = router.moveSegment(drag.points, drag.index, drag.horizontal ? dy : dx); delete wire.via; delete wire.waypoints;
      routeCache = drag.routes; renderWires(); board.classList.toggle('has-invalid-route', invalidEdit(drag.routes)); return;
    }
    const c = selectedPart();
    c.x = Math.round((drag.x + dx) / 10) * 10; c.y = Math.round((drag.y + dy) / 10) * 10; clampPosition(c);
    const node = board.querySelector(`[data-part="${c.id}"]`); node.style.left = `${c.x}px`; node.style.top = `${c.y}px`; node.classList.toggle('labels-left', c.x > 730); routeCache = drag.routes; renderWires();
  }
  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (dragFrame) { cancelAnimationFrame(dragFrame); dragFrame = 0; }
    if (lastPointer) updateDrag(lastPointer);
    const moved = drag.moved, rejected = event.type === 'pointercancel' || drag.kind === 'wire' && invalidEdit(drag.routes);
    if (moved && rejected) { circuit = drag.snapshot; routeCache = drag.routes; routeSignature = ''; announce('该位置会穿过元件或重叠其他导线，已恢复原走向。请向另一侧调整。'); }
    else if (moved) { remember(drag.snapshot, drag.routes); announce(drag.kind === 'wire' ? '已调整整段导线，接线关系不变。可撤销，或恢复自动布线。' : '元件已对齐网格，相关导线已更新。'); }
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
    drag = null; lastPointer = null; board.classList.remove('has-invalid-route');
    if (moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); render(); }
  }
  board.addEventListener('pointerup', finishDrag);
  board.addEventListener('pointercancel', finishDrag);
  board.addEventListener('dblclick', (event) => { const c = circuit.components.find((item) => item.id === event.target.closest('[data-select]')?.dataset.select); if (c?.type === 'switch') { remember(); c.closed = !c.closed; render(); } });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { cancelConnection(); renderParts(); announce('已取消接线。'); return; }
    if (event.target.matches('input,select,textarea')) return;
    if (event.key === 'Backspace' && pending) { event.preventDefault(); pins.pop(); renderOverlay(); announce(`剩余 ${pins.length} 个拐点，点击接线柱完成接线。`); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); return; }
    const wire = event.target.closest('[data-wire]');
    const handle = event.target.closest('[data-route-handle]');
    if (handle && event.key.startsWith('Arrow')) {
      event.preventDefault(); selected = handle.dataset.routeHandle;
      const w = circuit.wires.find((item) => item.id === selected), route = routes.find((r) => r.id === selected), points = router.editPoints(route.points), index = Number(handle.dataset.segment), horizontal = points[index].y === points[index + 1].y;
      const delta = horizontal ? event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0 : event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0;
      if (!delta) return;
      const snapshot = clone(circuit), before = clone(routes); w.manual = router.moveSegment(points, index, delta); delete w.via; delete w.waypoints; renderWires();
      if (invalidEdit(before)) { circuit = snapshot; routeCache = before; routeSignature = ''; announce('此方向会挡住元件或重叠导线，请反向调整。'); }
      else { remember(snapshot, before); announce('已微调导线一格，连接关系不变。'); }
      render(); $('cbOverlay').querySelector(`[data-segment="${index}"]`)?.focus({ preventScroll: true }); return;
    }
    if (wire && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectWire(wire.dataset.wire); }
    const c = circuit.components.find((item) => item.id === event.target.closest('[data-select]')?.dataset.select);
    if (c && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); remember(); selected = c.id; c.x += event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0; c.y += event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0; clampPosition(c); render(); board.querySelector(`[data-select="${c.id}"]`).focus({ preventScroll: true }); }
  });
  function replaceCircuit(next) { remember(); circuit = next; selected = null; cancelConnection(); resetRoutes(); netColors.clear(); render(); announce('实验台已更新。所有元件和导线均可自由修改；可撤销恢复原电路。'); }
  $('cbLoad').addEventListener('click', () => replaceCircuit(createExample($('cbExample').value)));
  $('cbClear').addEventListener('click', () => replaceCircuit(createExample('empty')));
  for (const [id, from, to] of [['cbUndo', undo, redo], ['cbRedo', redo, undo]]) $(id).addEventListener('click', () => { if (!from.length) return; to.push({ circuit: clone(circuit), routes: clone(routes) }); const previous = from.pop(); circuit = previous.circuit; routeCache = previous.routes; routeSignature = ''; selected = null; cancelConnection(); render(); announce(id === 'cbUndo' ? '已撤销，接线和走向均已恢复。' : '已重做。'); });
  $('cbWireStyle').addEventListener('change', (event) => { wireStyle = event.target.value; renderWires(); announce(`已切换为${wireStyle === 'smooth' ? '圆滑导线' : '教材电路图'}，接线关系不变。`); });
  $('cbArrangeWires').addEventListener('click', () => { remember(); renderWires(true); renderReadings(); $('cbUndo').disabled = false; $('cbRedo').disabled = true; announce('已重新整理自动导线，手动调整的线路已保留。'); });
  $('cbRecord').addEventListener('click', () => {
    if ($('cbRecord').disabled) return;
    if (records.length >= 100) { announce('已达到 100 组记录，请导出保存。'); return; }
    const row = {
      circuit: clone(circuit), readings: clone(result), time: new Date().toISOString(),
      parameters: circuit.components.map((c) => `${c.label} ${TYPES[c.type].name} ${description(c)}`).join('；') + `；${circuit.wires.length} 根导线`,
      meters: circuit.components.filter((c) => TYPES[c.type].range).map((c) => `${c.label}: ${description(c)}（量程 ${c.range}）`).join('；'),
      status: result.warnings.length ? result.warnings.join('；') : result.status === 'closed' ? '通路' : '断路 / 无电流',
    };
    records.push(row); $('cbRecordBody').innerHTML = records.map((r, i) => `<tr><td>${i + 1}</td><td>${escape(r.parameters)}</td><td>${escape(r.meters)}</td><td>${escape(r.status)}</td></tr>`).join(''); $('cbRecordCount').textContent = `${records.length} 组`; $('cbExport').disabled = false; announce(`已记录第 ${records.length} 组，后续改接不会改变已有记录。`);
  });
  $('cbExport').addEventListener('click', () => {
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const data = [['组次', '时间', '电路与参数', '电表读数', '状态', '接线快照'], ...records.map((r, i) => [i + 1, r.time, r.parameters, r.meters, r.status, JSON.stringify(r.circuit)])].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', data], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = '自由电路实验记录.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const builderTab = $('builderTab'), fixed = $('fixedElectricLab');
  function showBuilder() { root.hidden = false; fixed.hidden = true; builderTab.classList.add('active'); builderTab.setAttribute('aria-pressed', 'true'); document.querySelectorAll('.tab[data-mode]').forEach((tab) => { tab.classList.remove('active'); tab.setAttribute('aria-pressed', 'false'); }); $('formula').textContent = '自主接线 · 实时测量'; }
  builderTab.addEventListener('click', showBuilder);
  document.querySelectorAll('.tab[data-mode]').forEach((tab) => tab.addEventListener('click', () => { root.hidden = true; fixed.hidden = false; builderTab.classList.remove('active'); builderTab.setAttribute('aria-pressed', 'false'); document.querySelectorAll('.tab[data-mode]').forEach((button) => { button.classList.toggle('active', button === tab); button.setAttribute('aria-pressed', String(button === tab)); }); window.dispatchEvent(new Event('resize')); }));
  render(); showBuilder();
})();
