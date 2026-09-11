(() => {
  'use strict';
  const M = globalThis.Mechanics, I = globalThis.MechanicsInteraction, root = document.getElementById('mechanicsLab');
  if (!root) return;
  // Keep the page operable even if a browser briefly combines old and new
  // cached module files during a release. A reload then enables the new model.
  if (typeof M.leverAutoAngle !== 'function') M.leverAutoAngle = () => null;
  if (typeof I.ropeAssemblyRoot !== 'function') I.ropeAssemblyRoot = () => null;
  const $ = (id) => document.getElementById(id), esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const leverAutoAngle = (value, id) => typeof M.leverAutoAngle === 'function' ? M.leverAutoAngle(value, id) : null;
  const fmt = (v, unit = '', digits = 2) => v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.abs(v) < 1e-7 ? (0).toFixed(digits) : v.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
  const fmtMagnitude = (v, unit = 'N') => fmt(v == null ? null : Math.abs(v), unit);
  const starters = [ ['empty', '自由组合', '从空白装置开始'], ['lever', '杠杆平衡', '改变挂点与钩码'], ['fixed', '定滑轮', '比较方向与拉力'], ['moving', '动滑轮', '省力与费距离'], ['tilt', '绳角与拉力', '拖斜绳子，实时测力'], ['group', '滑轮组', '重新穿绕绳索'], ['combo', '组合机械', '杠杆 × 滑轮'] ];
  const palettes = ['#286d9a', '#bb7332', '#548363', '#836bab', '#b95b71', '#428f99'];
  let scene = M.example('lever'), selected = null, mode = 'move', pending = [], attachParent = null, serial = 100, starter = 'lever';
  let result, drag = null, suppressClick = false, cursor = null, editSnapshot = null;
  let snapTarget = null, editingRope = null, wireHover = null, wireSides = {}, wireTail = [], snapping = true, editingPreview = false, liveForces = false;
  let motionBase = null, motionResult = null, motionValue = 0, playFrame = 0, playTime = 0, release = null;
  const undo = [], redo = [], records = [];
  root.innerHTML = `<nav class="ml-starts" aria-label="力学实验起点">${starters.map(([id, title, sub]) => `<button type="button" data-starter="${id}" aria-pressed="${id === starter}"><strong>${title}</strong><small>${sub}</small></button>`).join('')}</nav>
  <div class="ml-layout"><aside class="ml-side"><h2>器材盒<small>点击添加，可重复组合</small></h2><div class="ml-palette">${Object.entries(M.TYPES).map(([type, t]) => `<button type="button" data-add="${type}" aria-label="添加${t.name}"><b>${t.symbol}</b><span>${t.name}</span><i>＋</i></button>`).join('')}</div><section class="ml-inspector" id="mlInspector" aria-label="装置属性"></section><details class="ml-help"><summary>搭建与连接说明</summary><p>直接拖动杠杆上的钩码，可换挂点或取下；拖动挂在动滑轮、连接横梁下的钩码时，会带动整套悬挂组件，绳子、滑轮和负载始终同步。按住 Alt 可只取下当前器材。三角支点也能左右拖动，松手后杠杆会按两侧力矩自动倾斜。</p><p>挂接模式：先点杠杆、横梁或动滑轮的挂点，再点要挂上的钩码或滑轮。连接横梁可把多个动滑轮连成一体。</p><p>穿绳可以一笔拖动：从挂钩拖出，经过滑轮边缘，再放到另一挂钩。也可逐点点击，或松手暂停后继续。在“拖动／测力”中，已有绳端和绳段可直接拖动，连接的器材随之移动，倾角与拉力实时更新。在“穿绳／改接”中，器材主体仍可拖动，绳子中段可拖到空轮缘；轮上绳段拖开可取下，圆形绳端可改接。也可点“重新穿挂”更改整条路径。轮槽的上下绕行会自动确定。</p><p>Esc 取消连接，Backspace 退回穿绳的一步。选中对象后按 Delete 删除；可撤销恢复。选中绳索可拆下重新穿绳。</p><p>下方“试拉”通过测力计绳端驱动装置；它显示缓慢运动的几何关系，不模拟突然释放后的加速。</p></details></aside>
  <div class="ml-workspace"><div class="ml-toolbar" aria-label="装置编辑工具"><button type="button" class="ml-button" data-mode="move" aria-pressed="true">↖ 自由拖动／测力</button><button type="button" class="ml-button" data-mode="hang" aria-pressed="false">⌁ 点选挂接</button><button type="button" class="ml-button" data-mode="rope" aria-pressed="false">⌒ 穿绳／改接</button><button type="button" class="ml-button" id="mlSnap" aria-pressed="true">自动挂接：开</button><span class="spacer"></span><button type="button" class="ml-button" id="mlUndo" disabled>撤销</button><button type="button" class="ml-button" id="mlRedo" disabled>重做</button><label>重力加速度 <select id="mlGravity" aria-label="重力加速度"><option value="10">10 N/kg</option><option value="9.8">9.8 N/kg</option><option value="9.81">9.81 N/kg</option></select></label></div>
  <div class="ml-toolbar"><button type="button" class="ml-button" id="mlForces" aria-pressed="false">力与力臂</button><button type="button" class="ml-button" id="mlLeverForce">载入杠杆测力</button><span class="spacer"></span><button type="button" class="ml-button" id="mlSave">保存装置</button><button type="button" class="ml-button" id="mlImport">载入装置</button><input type="file" accept=".json,application/json" id="mlFile" aria-label="选择装置文件" hidden><button type="button" class="ml-button" id="mlClear">清空</button></div>
  <p id="mlMessage" class="ml-message" role="status">直接拖动钩码换挂点；拖动三角支点改变力臂。悬挂位置会亮起绿色提示。</p>

  <div class="ml-scroll" id="mlScroll" tabindex="0" aria-label="可横向滚动的力学实验台"><svg id="mlBoard" class="ml-board" viewBox="0 0 1000 650" aria-label="力学装置与绳索"></svg></div>
  <div class="ml-wire-strip" id="mlWireStrip" hidden><div><strong>正在穿绳</strong><span id="mlWireTrail"></span></div><button type="button" class="ml-button" id="mlWireBack">退回一步</button><button type="button" class="ml-button" id="mlWireCancel">取消</button></div>
  <p class="ml-legend"><span><b>●</b> 圆形绳端：拖动改变绳角</span><span><b>◉</b> 改绕或换挂钩：选“穿绳／改接”</span><span><b>↓</b> 橙色箭头：力的方向</span><span>1 格 = 0.2 m · 窄屏可拖动空白处左右平移</span></p>
  <div id="mlState" class="ml-state" aria-live="polite"></div><div id="mlMetrics" class="ml-metrics"></div>
  <section class="ml-motion"><div class="ml-motion-top"><h3>试拉与观察</h3><select id="mlDriver" aria-label="选择拉绳端"></select><button type="button" class="ml-button primary" id="mlPlay">缓慢试拉</button><button type="button" class="ml-button" id="mlStop" disabled>暂停</button><button type="button" class="ml-button" id="mlReturn">回到起点</button><button type="button" class="ml-button" id="mlRelease">重演杠杆倾斜</button></div><label for="mlPull" class="ml-pull-label"><span>向上拉 ← 绳端位移 → 向下拉</span><output id="mlPullValue">0.00 m</output></label><input id="mlPull" type="range" min="-0.6" max="0.6" step="0.01" value="0" aria-label="绳端位移"><p id="mlMotionNote">选择已接入的测力计，移动绳端，比较钩码上升高度。</p></section></div></div>
  <section class="ml-inquiry"><div class="ml-prompt"><h3>先预测，再动手</h3><p id="mlQuestion"></p></div><div class="ml-prompt"><h3>控制一个变量</h3><p id="mlExperimentTip"></p></div></section>
  <section class="ml-records"><div class="ml-record-head"><h3>实验记录 <small id="mlRecordCount">0 组</small></h3><button type="button" class="ml-button primary" id="mlRecord">＋ 记录当前状态</button><button type="button" class="ml-button" id="mlCsv" disabled>导出 CSV</button></div><div class="ml-table-scroll"><table><thead><tr><th>组次</th><th>装置与变量</th><th>测量与力矩</th><th>移动关系</th><th>状态</th></tr></thead><tbody id="mlRecords"><tr><td colspan="5">改动前后各记录一组，用数据检验预测。</td></tr></tbody></table></div></section>
  <details class="ml-model"><summary>模型范围与实验依据</summary><p>搭建时可移动支点与绳端、重新调整绳长，比较不同布置的静态拉力；下方“试拉”时绳长保持不变。绳索质量忽略，同一根绳的张力相等；轮轴无摩擦。杠杆和横梁视为刚体，可设置自重。水平位置由支架或竖直导轨约束；动滑轮、横梁和自由绳端负载沿竖直方向运动，杠杆绕固定支点转动。未接入的钩码放在实验台上，不参与受力计算。</p><p>无绳杠杆在两侧力矩不等时会向合力矩方向转动；画面用 15° 机械限位表示持续下沉方向，力矩相等时自动回到水平。接入绳索的杠杆由完整绳长与张力约束求解。测力计显示维持静止或缓慢运动所需的张力，试拉由外界控制绳端位移，不代表自由落体或突然施力的加速度。倾斜绳索会分解力，不能只按滑轮个数计算省力倍数。不支持弹性绳、摩擦效率或轮轴惯性；超量程、松绳、矛盾约束和未确定张力会单独提示。</p><p>实验依据：<a href="https://openstax.org/books/college-physics/pages/9-5-simple-machines" target="_blank" rel="noreferrer">OpenStax · 简单机械</a>。装置和记录可下载保存，刷新页面后内存记录清除。</p></details>`;
  const board = $('mlBoard'); let showForces = false;
  function announce(text) { if ($('mlMessage').textContent !== text) $('mlMessage').textContent = text; }
  function remember(snapshot = scene) { undo.push(M.clone(snapshot)); if (undo.length > 60) undo.shift(); redo.length = 0; }
  function stop() { if (playFrame) cancelAnimationFrame(playFrame); playFrame = 0; release = null; $('mlStop').disabled = true; $('mlPlay').disabled = !canPull() || editingPreview; $('mlRecord').disabled = !scene.parts.length || editingPreview || !!pending.length; }
  function clearMotion(restore = true) { stop(); if (restore && motionBase) scene = M.clone(motionBase); motionBase = null; motionResult = null; motionValue = 0; $('mlPull').value = '0'; $('mlPullValue').textContent = '0.00 m'; }
  function cancelConnect() { pending = []; attachParent = null; cursor = null; editingRope = null; wireHover = null; wireSides = {}; wireTail = []; }
  function beginPreview(live = false) { editingPreview = true; liveForces = live; root.dataset.editing = 'true'; root.dataset.live = String(live); $('mlRecord').disabled = true; if (!live) $('mlState').textContent = '正在搭建 · 松手后更新力矩、张力与试拉读数。'; }
  function endPreview() { editingPreview = !!pending.length; liveForces = false; root.dataset.editing = String(editingPreview); root.dataset.live = 'false'; }
  function selectedPart() { return scene.parts.find((p) => p.id === selected); }
  function applyLeverPose() { for (const lever of scene.parts.filter((p) => p.type === 'lever')) { const angle = leverAutoAngle(scene, lever.id); if (angle !== null) lever.angle = angle; } }
  function name(key) { const [id, port] = key.split(':'), c = scene.parts.find((p) => p.id === id); return c ? `${c.label}${port === 'wheel' ? ' 轮槽' : port.startsWith('s') ? ` ${Number(port.slice(1)) > 0 ? '+' : ''}${port.slice(1)} 挂点` : ' 挂点'}` : key; }
  function canPull() { return !!result?.valid && result.meters.some((m) => m.tension !== null && !m.issue); }
  function wheelRotation(c) {
    if (!motionBase || !motionResult) return 0;
    const ri = scene.ropes.findIndex((r) => r.nodes.includes(`${c.id}:wheel`)); if (ri < 0 || !result.geometries[ri]) return 0;
    const ai = scene.ropes[ri].nodes.indexOf(`${c.id}:wheel`) - 1;
    const before = M.ropeGeometry(M.positions(motionBase), motionBase.ropes[ri]), after = result.geometries[ri];
    const materialLength = (g) => g.lines.slice(0, ai + 1).reduce((s, l) => s + l.length, 0) + g.arcs.slice(0, ai).reduce((s, a) => s + a.length, 0);
    const angle = (g) => Math.atan2(g.arcs[ai].from.y - g.arcs[ai].center.y, g.arcs[ai].from.x - g.arcs[ai].center.x);
    const delta = Math.atan2(Math.sin(angle(after) - angle(before)), Math.cos(angle(after) - angle(before)));
    return (delta - (after.arcs[ai].sweep ? 1 : -1) * (materialLength(after) - materialLength(before)) / M.RADIUS) * 180 / Math.PI;
  }
  function partSvg(c, handles = false) { return globalThis.MechanicsDrawing.part(c, { scene, result, selected, pending, attachParent, name, rotation: wheelRotation }, handles); }
  function forceSvg() {
    if (!showForces || editingPreview && !liveForces) return '';
    let svg = '';
    for (const c of result.posed.values()) if (c.mass > 0) { const x = c.x + (c.type === 'weight' ? 42 : 38), y = c.y + 5; svg += `<path d="M${x} ${y}v48" class="ml-force" marker-end="url(#mlArrow)"/><text x="${x + 7}" y="${y + 32}" class="ml-force-label">G=${fmt(c.mass * scene.g, 'N', 1)}</text>`; }
    for (const lever of result.levers) {
      const c = result.posed.get(lever.id);
      for (const link of scene.links.filter((l) => l.parent.startsWith(`${c.id}:`))) { const p = M.point(result.posed, link.parent), arm = Math.abs(p.x - c.x) / M.SCALE; if (arm < .005) continue; svg += `<path d="M${p.x} ${c.y + 86}V${c.y + 74}H${c.x}v12" stroke="#91b9c7" stroke-dasharray="3 3" fill="none"/><text x="${(p.x + c.x) / 2}" y="${c.y + 104}" text-anchor="middle" class="ml-caption">${fmt(arm, 'm')}</text>`; }
    }
    scene.ropes.forEach((rope, ri) => {
      const g = result.geometries[ri], tension = result.tensions[rope.id]; if (!g || !tension) return;
      for (const [key, line, sign] of [[rope.nodes[0], g.lines[0], 1], [rope.nodes.at(-1), g.lines.at(-1), -1]]) {
        const c = result.posed.get(key.split(':')[0]); if (!['lever', 'scale'].includes(c.type)) continue;
        const p = M.point(result.posed, key), direction = c.type === 'scale' ? -sign : sign, dx = line.direction.x * direction, dy = line.direction.y * direction, x = p.x + (c.type === 'scale' ? 40 : 0);
        svg += `<path d="M${x} ${p.y}l${dx * 50} ${dy * 50}" class="ml-force" marker-end="url(#mlArrow)"/><text x="${x + 8}" y="${p.y + dy * 40}" class="ml-force-label">${c.type === 'scale' ? 'F' : 'T'}=${fmt(tension, 'N', 1)}</text>`;
      }
    });
    return svg;
  }
  function angleSvg() {
    if (editingPreview && !liveForces) return '';
    const meter = result.meters.find((m) => !m.issue);
    let svg = meter ? `<text x="22" y="56" class="ml-live-reading">沿绳拉力 ${fmt(meter.tension, 'N')} · 拉绳方向与竖直线夹角 ${fmt(meter.angle, '°', 1)}</text>` : '';
    if (starter !== 'tilt' && !showForces) return svg;
    for (const support of result.supports || []) {
      support.sides.forEach((side, i) => {
        const { at: p, direction: d, angle } = side, sideX = d.x < -.001 ? -1 : d.x > .001 ? 1 : i ? 1 : -1;
        const length = 75, radius = 35, tx = Math.max(65, Math.min(935, p.x + sideX * 74)), ty = Math.max(85, p.y - 58);
        svg += `<g class="ml-angle-diagram"><path d="M${p.x} ${p.y}v-90" class="ml-angle-reference"/>${angle > .1 ? `<path d="M${p.x} ${p.y - radius}A${radius} ${radius} 0 0 ${sideX > 0 ? 1 : 0} ${p.x + d.x * radius} ${p.y + d.y * radius}" class="ml-angle-arc"/>` : ''}<text x="${tx}" y="${ty}" text-anchor="middle" class="ml-force-label">θ${i ? '₂' : '₁'}=${fmt(angle, '°', 1)}</text>`;
        if (support.tension !== null) svg += `<path d="M${p.x} ${p.y}l${d.x * length} ${d.y * length}" class="ml-force" marker-end="url(#mlArrow)"/><text x="${tx}" y="${ty + 19}" text-anchor="middle" class="ml-force-label">T=${fmt(support.tension, 'N')}</text>`;
        svg += '</g>';
      });
    }
    return svg;
  }
  function renderWireInfo() {
    board.dataset.mode = mode; board.dataset.wiring = String(pending.length > 0);
    $('mlWireStrip').hidden = !pending.length; $('mlWireTrail').textContent = [...pending.map(name), ...(wireTail.length ? ['拖动中的绳段', ...wireTail.map(name)] : pending.length ? ['末端挂钩'] : [])].join(' → ');
  }
  function draftSvg() {
    if (!pending.length || !cursor) return '';
    const positions = new Map(result.posed); positions.set('__preview', { id: '__preview', type: 'anchor', x: cursor.x, y: cursor.y });
    const half = (nodes) => {
      try { return M.ropeGeometry(positions, { nodes: [...nodes, '__preview:hook'] }, { autoWrap: true, wraps: wireSides }).d; }
      catch { return [...nodes.map((key) => M.point(result.posed, key)), cursor].map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '); }
    };
    let svg = `<path d="${half(pending)}" class="ml-rope-preview"/>`;
    if (wireTail.length) svg += `<path d="${half([...wireTail].reverse())}" class="ml-rope-preview"/>`;
    svg += `<circle cx="${cursor.x}" cy="${cursor.y}" r="6" class="ml-wire-cursor"/>`;
    if (wireHover) svg += `<circle cx="${wireHover.p.x}" cy="${wireHover.p.y}" r="14" class="ml-wire-cursor ml-wire-target"/>`;
    pending.forEach((key, i) => { const p = M.point(result.posed, key); svg += `<g class="ml-draft-marker"><circle cx="${p.x + (key.endsWith(':wheel') ? -35 : -14)}" cy="${p.y - 18}" r="10"/><text x="${p.x + (key.endsWith(':wheel') ? -35 : -14)}" y="${p.y - 14}">${i + 1}</text></g>`; });
    return svg;
  }
  function renderBoard() {
    const focusAttribute = ['data-port', 'data-part', 'data-pivot', 'data-wire-end', 'data-rope'].find((k) => document.activeElement?.getAttribute(k));
    const focused = focusAttribute && document.activeElement.getAttribute(focusAttribute);
    let svg = `<defs><pattern id="mlGrid" width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1" fill="#d8e2e8"/></pattern><pattern id="mlHatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" stroke="#668391" stroke-width="1"/></pattern><marker id="mlArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#bb7b2b"/></marker></defs><rect width="1000" height="650" fill="url(#mlGrid)"/><text x="22" y="28" class="ml-caption">${pending.length ? '继续绕过轮缘，接到另一挂钩完成' : mode === 'hang' ? '点支承挂点，再点被挂器材' : mode === 'rope' ? '抓住绳段改绕 · 拖动绳端改接 · 空挂钩可穿新绳' : '拖动绳端或绳段改变倾角 · 拉力实时更新 · 钩码可拖挂'}</text><path d="M28 610v8h150v-8" stroke="#6e8b98" fill="none"/><text x="103" y="638" class="ml-caption" text-anchor="middle">1 m</text>`;
    scene.links.forEach((link) => { const a = M.point(result.posed, link.parent), child = result.posed.get(link.child), b = child.type === 'moving' || child.type === 'fixed' ? { x: child.x, y: child.y + (link.dy < 0 ? 42 : -34) } : M.endpoint(child, child.type === 'beam' ? 's0' : 'hook'); svg += `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" class="ml-link"/>`; });
    svg += [...result.posed.values()].map((c) => partSvg(c)).join('');
    scene.ropes.forEach((rope, index) => { if (rope.id === editingRope) return; const geometry = result.geometries[index], g = geometry || { d: rope.nodes.map((key, i) => { const p = M.point(result.posed, key); return `${i ? 'L' : 'M'}${p.x} ${p.y}`; }).join(' ') }; const color = palettes[index % palettes.length]; svg += `<g data-rope="${rope.id}" tabindex="0" role="button" aria-label="绳索 ${index + 1}：${esc(rope.nodes.map(name).join(' → '))}" class="ml-rope-group ${geometry ? '' : 'ml-rope-invalid'}" style="--rope:${color}"><path d="${g.d}" class="ml-rope-casing"/><path d="${g.d}" class="ml-rope ${selected === rope.id ? 'ml-rope-selected' : ''}"/><path d="${g.d}" class="ml-rope-hit"/><title>绳 ${index + 1} · 张力 ${fmt(result.tensions[rope.id], 'N')} · 交叉不连接</title></g>`; });
    // One accessible handle per port, painted above the ropes.
    for (const c of result.posed.values()) svg += partSvg(c, true);
    svg += forceSvg();
    svg += `<g id="mlDraft">${draftSvg()}</g>`;
    const activeRopes = pending.length ? [] : mode === 'move' ? scene.ropes : scene.ropes.filter((r) => r.id === selected);
    for (const activeRope of activeRopes) [activeRope.nodes[0], activeRope.nodes.at(-1)].forEach((key, end) => { const p = M.point(result.posed, key); svg += `<g data-wire-end="${activeRope.id}:${end}" tabindex="0" role="button" aria-label="拖动绳索${end ? '末端' : '起点'}${mode === 'move' ? '位置，改变绳角' : '改接'}" class="ml-wire-end"><circle cx="${p.x}" cy="${p.y}" r="16"/><circle cx="${p.x}" cy="${p.y}" r="4"/><title>${mode === 'move' ? '拖动位置观察绳角与拉力；方向键微调' : '拖到另一挂钩改接'}；Esc 取消</title></g>`; });
    if (!pending.length) svg += angleSvg();
    if (drag && snapTarget) {
      const { at, pose } = snapTarget, x = Math.max(10, Math.min(790, at.x - 82)), y = Math.max(45, at.y - 65);
      svg += `<g class="ml-snap-preview"><circle cx="${at.x}" cy="${at.y}" r="13"/><path d="M${at.x} ${at.y}L${pose.x} ${pose.y - 24}"/><rect x="${pose.x - 16}" y="${pose.y - 16}" width="32" height="48" rx="5"/><rect class="ml-snap-label" x="${x}" y="${y}" width="180" height="27" rx="6"/><text x="${x + 90}" y="${y + 18}" text-anchor="middle">松手挂到 ${esc(name(snapTarget.key))}</text></g>`;
    }
    if (!scene.parts.length) svg += '<text x="500" y="270" text-anchor="middle" fill="#3f5c70" font-size="26">搭起你的第一套装置</text><text x="500" y="310" text-anchor="middle" class="ml-caption">添加器材，拖放悬挂；从挂钩拖出绳索。</text>';
    renderWireInfo();
    board.innerHTML = svg;
    if (focused && !drag && !editingPreview) board.querySelector(`[${focusAttribute}="${focused}"]`)?.focus({ preventScroll: true });
  }
  function renderInspector() {
    const c = selectedPart(), rope = scene.ropes.find((r) => r.id === selected);
    if (rope) { $('mlInspector').innerHTML = `<h3>绳索 ${scene.ropes.indexOf(rope) + 1}</h3><p>${rope.nodes.map((k, i) => `<span class="ml-rope-stop">${esc(name(k))}${i > 0 && i < rope.nodes.length - 1 ? `<button type="button" data-unthread="${i}" aria-label="从绳索中取下 ${esc(name(k))}">取下</button>` : ''}</span>`).join('<span class="ml-route-arrow">↓</span>')}</p><p>张力：<b>${fmt(result.tensions[rope.id], 'N')}</b></p><small>拖动图中两端的圆点可改接挂钩；整条路径也可重新穿绕。</small><button type="button" data-action="rewire">重新穿挂</button><button type="button" data-action="delete" class="danger">删除绳索</button>`; return; }
    if (!c) { $('mlInspector').innerHTML = '<h3>装置属性</h3><p>选中器材后改变质量、支点或绕绳方向。所有起始装置都可自由拆改。</p>'; return; }
    const link = scene.links.find((l) => l.child === c.id), parent = link && scene.parts.find((p) => p.id === link.parent.split(':')[0]);
    $('mlInspector').innerHTML = `<h3>${esc(c.label)} · ${M.TYPES[c.type].name}</h3>${['weight', 'moving', 'lever', 'beam', 'fixed'].includes(c.type) ? `<label> ${c.type === 'weight' ? '钩码质量' : '器材自重质量'} / kg<input data-property="mass" type="number" min="0" max="20" step="0.1" value="${c.mass}" aria-label="${esc(c.label)}质量"></label><small>0–20 kg；当前重力 ${fmt(c.mass * scene.g, 'N')}</small>` : ''}${c.type === 'lever' ? `<label>支点位置<select data-property="pivot" aria-label="杠杆支点">${Array.from({ length: 9 }, (_, i) => i - 4).map((n) => `<option value="${n}" ${c.pivot === n ? 'selected' : ''}>${n} 格</option>`).join('')}</select></label>${M.leverAutoAngle(scene, c.id) === null ? `<label>杠杆角度 / °<input data-property="angle" type="range" min="-25" max="25" step="1" value="${c.angle * 180 / Math.PI}" aria-label="杠杆角度"></label><small>接入绳索后，角度可用于检查当前约束姿态。</small>` : `<small>倾角由两侧力矩自动决定：当前 ${fmt(c.angle * 180 / Math.PI, '°', 1)}。力矩相等时水平，不等时向较大力矩一侧下沉至演示限位。</small>`}` : ''}${['moving', 'fixed'].includes(c.type) ? `<label>绳索绕行侧<select data-property="wrap" aria-label="滑轮绕行侧"><option value="top" ${c.wrap === 'top' ? 'selected' : ''}>上侧轮槽</option><option value="bottom" ${c.wrap === 'bottom' ? 'selected' : ''}>下侧轮槽</option></select></label>` : ''}${c.type === 'scale' ? `<label>测力计量程<select data-property="range" aria-label="测力计量程">${[5, 10, 50, 100, 500].map((n) => `<option value="${n}" ${c.range === n ? 'selected' : ''}>0–${n} N</option>`).join('')}</select></label><small>显示维持静止或缓慢运动所需的绳索张力。</small>` : ''}${link ? `<p>挂在 ${esc(name(link.parent))}</p>${parent && ['lever', 'beam'].includes(parent.type) ? `<label>更换挂点<select data-link-slot aria-label="更换挂点">${M.ports(parent).map((key) => `<option value="${parent.id}:${key}" ${link.parent === `${parent.id}:${key}` ? 'selected' : ''}>${esc(name(`${parent.id}:${key}`))}</option>`).join('')}</select></label>` : ''}<button type="button" data-action="detach">解除挂接</button>` : ''}<button type="button" data-action="delete" class="danger">删除器材与相关连接</button><small>${c.type === 'weight' && I.ropeAssemblyRoot(scene, c.id) ? '此钩码属于绳索承载组件，直接拖动会带动整套滑轮与绳形；按住 Alt 可单独取下。' : '钩码可直接拖动换挂点；左右方向键也可换位。拖到空白处即可取下。'}</small>`;
  }
  function renderResults(live = false) {
    const label = { balanced: scene.parts.length ? '装置可平衡' : '等待搭建', unbalanced: '装置尚未平衡', indeterminate: '张力未确定', slack: '绳索会松弛', geometry: '请调整穿绳或位置' };
    $('mlState').classList.toggle('warning', !result.valid);
    $('mlState').innerHTML = `<strong>${label[result.status]} · ${scene.parts.length} 件器材 / ${scene.ropes.length} 根绳</strong>${result.issues.length ? esc(result.issues.join(' ')) : scene.ropes.length ? '拖动绳端调整布置与绳长，实时比较静态拉力；下方“试拉”保持绳长不变。' : scene.parts.length ? '选中钩码改变质量或挂点，比较两侧力矩。可用测力计替代一侧钩码。' : '从左侧添加器材，或选择一个实验起点。'}`;
    const metrics = result.meters.map((m) => { const c = scene.parts.find((p) => p.id === m.id); return `<div class="ml-metric ${m.overload ? 'warn' : ''}"><span>${esc(c.label)} · 沿绳所需拉力</span><strong>${fmt(m.tension, 'N')}</strong><small>${m.issue || `${m.overload ? `超出 ${c.range} N 量程 · ` : ''}与竖直线夹角 ${fmt(m.angle, '°', 1)}<br>水平分力 ${fmtMagnitude(m.forceX)} · 竖直分力 ${fmtMagnitude(m.forceY)}`}</small></div>`; });
    for (const support of result.supports || []) {
      const c = scene.parts.find((p) => p.id === support.id), [a, b] = support.sides;
      metrics.push(`<div class="ml-metric"><span>${esc(c.label)} · 两侧承重绳</span><strong>${fmt(a.angle, '°', 1)} / ${fmt(b.angle, '°', 1)}</strong><small>θ₁、θ₂ 从竖直向上量起<br>向上分力 ${fmt(a.forceUp, 'N')} ＋ ${fmt(b.forceUp, 'N')} ＝ ${fmt(support.forceUp, 'N')}<br>T(cos θ₁ + cos θ₂) = 向上合力<br>水平合力 ${fmtMagnitude(support.forceX)}，由支架或导轨约束</small></div>`);
    }
    for (const l of result.levers) { const c = scene.parts.find((p) => p.id === l.id), text = l.netMoment === null ? '请先修正绳索约束' : Math.abs(l.netMoment) < .01 && l.balanced ? '平衡' : l.netMoment > 0 ? '右侧下沉' : '左侧下沉'; metrics.push(`<div class="ml-metric"><span>${esc(c.label)} · 重力合力矩</span><strong>${fmt(l.gravityMoment, 'N·m')}</strong><small>倾角 ${fmt(c.angle * 180 / Math.PI, '°', 1)} · 顺时针 ${fmt(l.clockwise, 'N·m')} / 逆时针 ${fmt(l.counterclockwise, 'N·m')}<br>${l.ropeMoment !== null && scene.ropes.length ? `绳力矩 ${fmt(l.ropeMoment, 'N·m')}；` : ''}${text}（顺时针为正）</small></div>`); }
    if (scene.ropes.length > 1) for (const [i, r] of scene.ropes.entries()) metrics.push(`<div class="ml-metric"><span>绳 ${i + 1} · 张力</span><strong>${fmt(result.tensions[r.id], 'N')}</strong><small>${r.nodes.filter((key) => key.endsWith(':wheel')).length} 个轮槽 · ${fmt((result.geometries[i]?.length || 0) / M.SCALE, 'm')} 绳长</small></div>`);
    if (motionResult?.ok) for (const lift of motionResult.lifts) { const c = scene.parts.find((p) => p.id === lift.id); metrics.push(`<div class="ml-metric"><span>${esc(c.label)} · ${lift.height >= 0 ? '上升' : '下降'}高度</span><strong>${fmt(Math.abs(lift.height), 'm', 3)}</strong><small>${Math.abs(lift.height) > .0001 ? `绳端 / 负载距离比 ${fmt(Math.abs(motionResult.displacement / lift.height), '', 2)}` : '尚未移动'}</small></div>`); }
    $('mlMetrics').innerHTML = metrics.join('') || '<div class="ml-metric"><span>重力与负载</span><strong>' + fmt(scene.parts.filter((p) => p.type === 'weight').reduce((sum, p) => sum + p.mass, 0), 'kg', 1) + '</strong><small>添加测力计可直接测量绳索张力。</small></div>';
    if (live) return;
    const previousDriver = $('mlDriver').value;
    $('mlDriver').innerHTML = result.meters.length ? result.meters.map((m) => `<option value="${m.id}" ${m.id === previousDriver ? 'selected' : ''}>${esc(scene.parts.find((p) => p.id === m.id).label)} 拉绳端</option>`).join('') : '<option value="">先添加测力计</option>';
    $('mlPull').disabled = !canPull() || !!release; $('mlPlay').disabled = !canPull() || !!playFrame; $('mlReturn').disabled = !motionBase;
    const levers = scene.parts.filter((p) => p.type === 'lever');
    $('mlRelease').disabled = levers.length !== 1 || leverAutoAngle(scene, levers[0]?.id) === null || scene.parts.some((p) => !['lever', 'weight', 'anchor'].includes(p.type));
    $('mlRecord').disabled = !scene.parts.length || !!playFrame || editingPreview || !!pending.length;
    $('mlUndo').disabled = !undo.length; $('mlRedo').disabled = !redo.length;
    if (!motionBase) $('mlMotionNote').textContent = canPull() ? '拖动滑块缓慢移动绳端；正值向下，负值向上。观察负载升降，比较移动距离。' : scene.ropes.length ? '先完成能平衡的连接并接入测力计，再试拉。' : '无绳杠杆会按两侧力矩自动倾斜；可点击“重演杠杆倾斜”从水平状态再观察一次。';
    $('mlDriver').disabled = editingPreview || !result.meters.length;
    if (editingPreview) { if (!liveForces) $('mlState').textContent = '正在搭建 · 完成放置或穿绳后更新力矩、张力与试拉读数。'; for (const id of ['mlPull', 'mlPlay', 'mlRelease']) $(id).disabled = true; }
  }
  function render(inspector = true) { try { if (!release) applyLeverPose(); result = M.analyze(scene); } catch (error) { announce(error.message); return; } renderBoard(); renderResults(); if (inspector) renderInspector(); }
  function renderPreview() {
    if (drag) {
      if (liveForces) { result = M.analyze(scene); renderBoard(); renderResults(true); return; }
      const posed = M.positions(scene), geometries = scene.ropes.map((rope) => { try { return M.ropeGeometry(posed, rope); } catch { return null; } });
      result = { ...result, posed, geometries, tensions: {}, meters: result.meters.map((m) => ({ ...m, tension: null })) }; renderBoard();
    } else { $('mlDraft').innerHTML = draftSvg(); renderWireInfo(); }
  }
  function setMode(value) { controls.cancel(); clearMotion(false); mode = value; cancelConnect(); root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); announce(mode === 'rope' ? '从挂钩拖出绳端，沿轮缘穿绕，放到另一挂钩；也可逐点点击。Esc 取消。' : mode === 'hang' ? '先点击杠杆、横梁或动滑轮的支承挂点，再点击要挂上的器材主体。' : '直接拖动已有绳端或绳段，调整倾角并实时测力；钩码可拖挂，三角支点可左右拖动。'); render(); }
  function loadExample(kind) { controls.cancel(); clearMotion(false); remember(); scene = M.example(kind); starter = kind; selected = null; cancelConnect(); mode = 'move'; $('mlGravity').value = String(scene.g); root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode))); root.querySelectorAll('[data-starter]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.starter === kind))); updateQuestion(); render(); announce(kind === 'tilt' ? '把顶部两端的圆点向两侧拉开，观察 θ₁、θ₂ 和拉力；可以只动一端，也可以上下调整。' : scene.ropes.length ? '拖动绳端、绳段或悬挂组件，绳形会随钩码和滑轮实时移动；需要重新穿挂时选择“穿绳／改接”。' : '已载入装置；改变钩码、挂点或支点后，杠杆会按两侧力矩自动显示下沉方向。'); }
  function updateQuestion() {
    const q = { tilt: ['两侧承重绳越倾斜，为什么需要更大的拉力？只移动一侧会怎样？', '保持钩码质量与动滑轮位置不变，拖动顶部两个绳端。比较 T(cos θ₁ + cos θ₂) 与负载重力；角度从竖直向上量起。'], lever: ['同样的钩码，挂得越远会怎样？两侧质量不相同，仍能平衡吗？', '保持一侧质量和挂点不变，只改变另一侧的质量或挂点。比较力 × 水平力臂。'], fixed: ['定滑轮能省力吗？把绳端向下拉 0.2 m，负载上升多少？', '记录负载重力与测力计拉力，再记录绳端位移和负载高度。'], moving: ['动滑轮为什么省力？省下的力是否换来了更长的拉绳距离？', '保持负载不变，比较定滑轮与动滑轮。再给动滑轮增加自重。'], group: ['这套滑轮组有几段绳承担运动部分的重量？改变穿绳能否改变拉力？', '先记录原接法，再拆下绳索重新穿绕。倾斜绳索时，要考虑力的竖直分量。'], combo: ['杠杆和滑轮组合后能否进一步省力？绳端需要多走多远？', '先保持滑轮接法与负载不变，只改变杠杆作用点，记录拉力和负载升高。'] }[starter] || ['能否只用现有器材搭出两种拉力不同、却提升同一负载的装置？', '先预测，再搭建。一次只改变质量、挂点或穿绳中的一个条件，用记录表比较结果。'];
    $('mlQuestion').textContent = q[0]; $('mlExperimentTip').textContent = q[1];
  }
  function connectPort(key, direct = false, deferred = false) {
    clearMotion(false);
    if (mode === 'hang' && !direct) { const [id, port] = key.split(':'), p = scene.parts.find((p) => p.id === id); if (!['lever', 'beam', 'moving'].includes(p.type) || port === 'wheel') { announce('请选择杠杆、连接横梁或动滑轮的挂点作为支承。'); return; } attachParent = key; pending = []; announce(`支承：${name(key)}。现在点击要挂上的钩码、滑轮或横梁主体。`); renderBoard(); return; }
    if (!pending.length && key.endsWith(':wheel')) { announce('请先选择固定绳端、杠杆挂点、钩码或测力计，再经过轮槽。'); return; }
    if ([...pending, ...wireTail].includes(key)) { announce('同一根绳不能重复经过相同挂点或轮槽，Backspace 可退回。'); return; }
    if (key.endsWith(':wheel')) { if (scene.ropes.some((r) => r.id !== editingRope && r.nodes.includes(key))) { announce('这个轮槽已有绳索。选中原绳点“重新穿挂”，或换一个轮槽。'); return; } if (pending.length >= 13) { announce('一根绳最多经过 12 个轮槽，请点击末端挂点。'); return; } pending.push(key); if (!wireTail.length) announce(`已经过 ${pending.length - 1} 个轮槽，继续拖向轮缘或挂钩；松手可暂停。`); if (!deferred) renderBoard(); return; }
    if (!pending.length) { pending.push(key); selected = null; beginPreview(); announce(`起点：${name(key)}。继续点轮槽，或点击另一挂点完成直连。`); if (deferred) renderBoard(); else render(); return; }
    const id = editingRope || `rope${serial++}`; let proposed;
    try { proposed = I.route(scene, [...pending, key], id, editingRope, wireSides); } catch (e) { announce(e.message); return; }
    remember(); scene = proposed; selected = id; cancelConnect(); endPreview(); render(); announce('穿绳完成。可继续拖出另一根绳；“拖动／测力”可调整绳角；“穿绳／改接”可改变挂钩和绕法。');
  }
  function attach(id) {
    const child = scene.parts.find((p) => p.id === id); if (!attachParent || !child) return;
    if (attachParent.startsWith(`${id}:`) || !['weight', 'moving', 'fixed', 'beam'].includes(child.type)) { announce('请选择另一个钩码、滑轮或横梁作为被挂接器材。'); return; }
    let next; try { next = I.mount(scene, id, attachParent); } catch (e) { announce(e.message); return; }
    remember(); scene = next; selected = id; cancelConnect(); render(); announce('已挂接。器材将随上级装置运动，选中后可以换挂点或解除挂接。');
  }
  function remove() {
    if (!selected) return; controls.cancel(); clearMotion(false); remember(); const posed = M.positions(scene);
    for (const l of scene.links.filter((l) => l.parent.startsWith(`${selected}:`))) Object.assign(scene.parts.find((p) => p.id === l.child), { x: posed.get(l.child).x, y: posed.get(l.child).y });
    scene.parts = scene.parts.filter((p) => p.id !== selected); scene.ropes = scene.ropes.filter((r) => r.id !== selected && !r.nodes.some((k) => k.startsWith(`${selected}:`))); scene.links = scene.links.filter((l) => l.child !== selected && !l.parent.startsWith(`${selected}:`)); selected = null; cancelConnect(); render(); announce('已删除所选对象，关联连接已拆下。可撤销。');
  }
  root.addEventListener('click', (event) => {
    if (suppressClick) { suppressClick = false; return; }
    const start = event.target.closest('[data-starter]'); if (start) { loadExample(start.dataset.starter); return; }
    const modeButton = event.target.closest('[data-mode]'); if (modeButton && modeButton !== board) { setMode(modeButton.dataset.mode); return; }
    const add = event.target.closest('[data-add]'); if (add) {
      controls.cancel(); clearMotion(false); if (scene.parts.length >= 40) { announce('最多 40 件器材，请先移除不需要的器材。'); return; }
      remember(); const type = add.dataset.add, ordinal = Math.max(0, ...scene.parts.filter((p) => p.type === type).map((p) => Number(p.label.replace(/\D/g, '')) || 0)) + 1;
      const slots = [180, 500, 810].flatMap((x) => [150, 340, 530].map((y) => ({ x, y }))), posed = M.positions(scene);
      const best = slots.sort((a, b) => Math.min(Infinity, ...[...posed.values()].map((p) => Math.hypot(p.x - b.x, p.y - b.y))) - Math.min(Infinity, ...[...posed.values()].map((p) => Math.hypot(p.x - a.x, p.y - a.y))))[0];
      const p = M.component(type, `part${serial++}`, best.x, type === 'scale' ? Math.min(best.y, 550) : best.y, ordinal); scene.parts.push(p); selected = p.id; cancelConnect(); render(); announce(`已添加 ${p.label} ${M.TYPES[type].name}。先拖到合适位置，再挂接或穿绳。`); return;
    }
    const port = event.target.closest('[data-port]'); if (port) { if (mode === 'move' && !pending.length) { const rope = scene.ropes.find((r) => [r.nodes[0], r.nodes.at(-1)].includes(port.dataset.port)); if (rope) { selected = rope.id; render(); return; } } connectPort(port.dataset.port); return; }
    const part = event.target.closest('[data-part]'); if (part) { if (mode === 'hang' && attachParent) attach(part.dataset.part); else { selected = part.dataset.part; render(); } return; }
    const rope = event.target.closest('[data-rope]'); if (rope) { selected = rope.dataset.rope; renderInspector(); renderBoard(); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'rewire') controls.beginRewire(selected);
    const unthread = event.target.closest('[data-unthread]');
    if (unthread) { const rope = scene.ropes.find((r) => r.id === selected); if (!rope) return; try { const next = I.route(scene, rope.nodes.filter((_, i) => i !== Number(unthread.dataset.unthread)), rope.id, rope.id); remember(); scene = next; cancelConnect(); render(); announce('已从这根绳中取下该滑轮，其余路径已重新贴合。'); } catch (error) { announce(error.message); } }
    if (action === 'delete') remove();
    if (action === 'detach') { clearMotion(); const p = M.positions(scene).get(selected); remember(); Object.assign(selectedPart(), { x: p.x, y: p.y }); scene.links = scene.links.filter((l) => l.child !== selected); render(); announce('已解除挂接，器材保留在原位置。'); }
  });
  root.addEventListener('input', (event) => { if (event.target.dataset.property !== 'angle') return; if (!selectedPart()) return; if (!editSnapshot) { clearMotion(); editSnapshot = M.clone(scene); } const c = selectedPart(); c.angle = Number(event.target.value) * Math.PI / 180; render(false); });
  root.addEventListener('change', (event) => {
    const key = event.target.dataset.property;
    if (key || event.target.hasAttribute('data-link-slot')) {
      if (!editSnapshot) clearMotion(); const c = selectedPart(); if (!c) return;
      if (!event.target.checkValidity() || event.target.value === '') { announce('请输入范围内的有效数值。'); renderInspector(); return; }
      const before = editSnapshot || M.clone(scene); let next = M.clone(scene); const part = next.parts.find((p) => p.id === c.id);
      if (key) part[key] = key === 'wrap' ? event.target.value : key === 'angle' ? Number(event.target.value) * Math.PI / 180 : Number(event.target.value);
      else { try { next = I.mount(next, c.id, event.target.value); } catch (error) { announce(error.message); renderInspector(); return; } }
      if (key === 'pivot') { const offset = (part.pivot - c.pivot) * 30; part.x += offset * Math.cos(part.angle); part.y += offset * Math.sin(part.angle); }
      try { M.validate(next); } catch (e) { announce(e.message); renderInspector(); return; }
      remember(before); editSnapshot = null; scene = next; render(); announce('参数已更新，力矩、拉力和运动关系按当前装置重新计算。');
    }
  });
  const controls = globalThis.MechanicsControls.install({
    board, root, eventTarget: window, scroller: $('mlScroll'), frame: requestAnimationFrame, cancelFrame: cancelAnimationFrame, defer: setTimeout,
    get scene() { return scene; }, set scene(v) { scene = v; },
    get mode() { return mode; }, get selected() { return selected; }, set selected(v) { selected = v; },
    get pending() { return pending; }, set pending(v) { pending = v; },
    get wireTail() { return wireTail; }, set wireTail(v) { wireTail = v; },
    get snapping() { return snapping; },
    get drag() { return drag; }, set drag(v) { drag = v; },
    get snapTarget() { return snapTarget; }, set snapTarget(v) { snapTarget = v; },
    get editingRope() { return editingRope; }, set editingRope(v) { editingRope = v; },
    get cursor() { return cursor; }, set cursor(v) { cursor = v; },
    get wireHover() { return wireHover; }, set wireHover(v) { wireHover = v; },
    get wireSides() { return wireSides; }, set wireSides(v) { wireSides = v; },
    set suppressClick(v) { suppressClick = v; },
    clearMotion, cancelConnect, connectPort, render, renderPreview, beginPreview, endPreview, renderBoard, renderInspector, announce, remember, name,
  });
  root.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.key === 'Escape') { controls.cancel(); announce('已取消当前拖动或穿绳，原装置保留。'); return; }
    if (e.key === 'Backspace' && pending.length) { e.preventDefault(); rewindWire(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    const wireEnd = e.target.closest('[data-wire-end]'), pivot = e.target.closest('[data-pivot]');
    if (wireEnd && mode === 'move' && e.key.startsWith('Arrow')) {
      e.preventDefault(); clearMotion(false); const value = wireEnd.dataset.wireEnd, split = value.lastIndexOf(':'), rope = scene.ropes.find((r) => r.id === value.slice(0, split));
      const id = I.assemblyRoot(scene, (Number(value.slice(split + 1)) ? rope.nodes.at(-1) : rope.nodes[0]).split(':')[0]), c = scene.parts.find((p) => p.id === id), step = e.shiftKey ? 1 : 10;
      remember(); I.translateAssembly(scene, id, c.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), c.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0)); render(); return;
    }
    if (['Enter', ' '].includes(e.key)) {
      if (wireEnd) { e.preventDefault(); const key = wireEnd.dataset.wireEnd, split = key.lastIndexOf(':'); if (mode === 'move') { selected = key.slice(0, split); render(); announce('拖动绳端改变位置；方向键微调，Shift＋方向键每次移动 1 像素。'); } else controls.beginRewire(key.slice(0, split), Number(key.slice(split + 1))); return; }
      const port = e.target.closest('[data-port]'); if (port) { e.preventDefault(); if (mode === 'move' && !pending.length) { const rope = scene.ropes.find((r) => [r.nodes[0], r.nodes.at(-1)].includes(port.dataset.port)); if (rope) { selected = rope.id; render(); return; } } connectPort(port.dataset.port); return; }
      const part = e.target.closest('[data-part]'), rope = e.target.closest('[data-rope]'); if (part || rope || pivot) { e.preventDefault(); if (part && mode === 'hang' && attachParent) attach(part.dataset.part); else { selected = pivot?.dataset.pivot || part?.dataset.part || rope.dataset.rope; render(); } return; }
    }
    const node = e.target.closest('[data-part]');
    if ((node || pivot) && e.key.startsWith('Arrow')) {
      e.preventDefault(); selected = pivot?.dataset.pivot || node.dataset.part; clearMotion();
      const p = selectedPart(), step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, link = scene.links.find((l) => l.child === selected);
      if (pivot) { if (step) { remember(); scene = I.pivot(scene, selected, p.pivot + step); render(); } return; }
      if (link) {
        const parent = scene.parts.find((p) => p.id === link.parent.split(':')[0]);
        if (step && ['lever', 'beam'].includes(parent.type)) {
          const key = `s${Number(link.parent.split(':s')[1]) + step}`;
          if (M.ports(parent).includes(key)) { try { const next = I.mount(scene, selected, `${parent.id}:${key}`); remember(); scene = next; render(); } catch (error) { announce(error.message); } }
        } else announce('左右方向键更换挂点；拖到空白处可取下器材。');
        return;
      }
      remember(); p.x += step * 10; p.y += e.key === 'ArrowDown' ? 10 : e.key === 'ArrowUp' ? -10 : 0; I.clampPart(p); render();
    }
  });
  $('mlGravity').addEventListener('change', (e) => { clearMotion(); remember(); scene.g = Number(e.target.value); render(); });
  function rewindWire() { const key = pending.pop(); delete wireSides[key]; wireHover = null; if (!pending.length) cancelConnect(); render(); announce('已退回一步，可继续穿绳。'); }
  $('mlSnap').addEventListener('click', () => { snapping = !snapping; $('mlSnap').setAttribute('aria-pressed', String(snapping)); $('mlSnap').textContent = `自动挂接：${snapping ? '开' : '关'}`; announce(snapping ? '靠近挂点松手时自动挂接；按住 Alt 可临时自由放置。' : '自动挂接已关闭，器材可自由放置；点选挂接仍然可用。'); });
  $('mlWireBack').addEventListener('click', rewindWire);
  $('mlWireCancel').addEventListener('click', () => { controls.cancel(); announce('已取消穿绳，原装置保留。'); });
  $('mlForces').addEventListener('click', () => { showForces = !showForces; $('mlForces').setAttribute('aria-pressed', String(showForces)); renderBoard(); });
  $('mlLeverForce').addEventListener('click', () => loadExample('lever-force')); $('mlClear').addEventListener('click', () => loadExample('empty'));
  for (const [id, from, to] of [['mlUndo', undo, redo], ['mlRedo', redo, undo]]) $(id).addEventListener('click', () => { controls.cancel(); clearMotion(false); if (!from.length) return; to.push(M.clone(scene)); scene = from.pop(); selected = null; cancelConnect(); $('mlGravity').value = String(scene.g); render(); announce(id === 'mlUndo' ? '已撤销，装置与连接已恢复。' : '已重做。'); });
  function moveDriver(value) {
    if (!motionBase) motionBase = M.clone(scene);
    const moved = M.pull(motionBase, $('mlDriver').value, value * M.SCALE);
    if (!moved.ok) { $('mlPull').value = String(motionValue); $('mlMotionNote').textContent = moved.issue; return false; }
    scene = moved.scene; motionResult = moved; motionValue = value; $('mlPullValue').textContent = `${value < 0 ? '向上' : '向下'} ${fmt(Math.abs(value), 'm')}`; render(false);
    $('mlMotionNote').textContent = `绳端${value < 0 ? '向上' : '向下'}移动 ${fmt(Math.abs(value), 'm')}；${moved.lifts.map((p) => `${scene.parts.find((c) => c.id === p.id).label} ${p.height >= 0 ? '上升' : '下降'} ${fmt(Math.abs(p.height), 'm', 3)}`).join('；') || '当前没有钩码负载'}。`;
    return true;
  }
  $('mlPull').addEventListener('input', (e) => { stop(); moveDriver(Number(e.target.value)); });
  $('mlDriver').addEventListener('change', () => { clearMotion(); render(); });
  $('mlReturn').addEventListener('click', () => { clearMotion(); render(); announce('已回到试拉前的装置位置。'); });
  $('mlStop').addEventListener('click', () => { stop(); renderResults(); announce('已暂停，可记录当前位移或回到起点。'); });
  $('mlPlay').addEventListener('click', () => {
    if (!canPull()) return; stop(); if (!motionBase) motionBase = M.clone(scene); const startValue = motionValue, direction = startValue >= .5 ? -1 : 1; playTime = 0; let renderedAt = -Infinity;
    const tick = (time) => { if (!playTime) playTime = time; if (time - renderedAt < 65) { playFrame = requestAnimationFrame(tick); return; } renderedAt = time; const value = Math.max(-.6, Math.min(.6, startValue + direction * (time - playTime) / 15000)); $('mlPull').value = String(value); if (!moveDriver(value) || Math.abs(value - startValue) >= .4 || Math.abs(value) >= .6) { stop(); renderResults(); return; } playFrame = requestAnimationFrame(tick); };
    playFrame = requestAnimationFrame(tick); $('mlStop').disabled = false; $('mlPlay').disabled = true;
  });
  $('mlRelease').addEventListener('click', () => {
    clearMotion(); const c = scene.parts.find((p) => p.type === 'lever'); if (!c || $('mlRelease').disabled) return;
    const target = leverAutoAngle(scene, c.id); motionBase = M.clone(scene); c.angle = 0;
    if (target === null || Math.abs(target) < 1e-6) { render(); announce('两侧力矩相等，杠杆从水平位置释放后保持平衡。'); return; }
    release = { id: c.id, target, time: 0 }; render(false); $('mlStop').disabled = false;
    const tick = (time) => {
      if (!release) return; if (!release.time) release.time = time;
      const progress = Math.min(1, (time - release.time) / 700), eased = 1 - (1 - progress) ** 3;
      scene.parts.find((p) => p.id === release.id).angle = release.target * eased; render(false);
      if (progress >= 1) { const direction = release.target > 0 ? '右侧' : '左侧'; release = null; playFrame = 0; $('mlStop').disabled = true; render(); announce(`${direction}力矩较大，杠杆向${direction}下沉并到达 15° 演示限位。`); return; }
      playFrame = requestAnimationFrame(tick);
    }; playFrame = requestAnimationFrame(tick);
  });
  function download(filename, contents, type) { const url = URL.createObjectURL(new Blob([contents], { type })), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('mlSave').addEventListener('click', () => download('力学装置.json', JSON.stringify(motionBase || scene, null, 2), 'application/json'));
  $('mlImport').addEventListener('click', () => $('mlFile').click());
  $('mlFile').addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; if (file.size > 200000) { announce('装置文件过大，请选择本实验室导出的 JSON。'); e.target.value = ''; return; } try { const next = M.validate(JSON.parse(await file.text())); clearMotion(); remember(); scene = next; selected = null; cancelConnect(); $('mlGravity').value = String(scene.g); serial = Math.max(serial, ...scene.parts.map((p) => Number(p.id.replace(/\D/g, '')) + 1 || 100), ...scene.ropes.map((r) => Number(r.id.replace(/\D/g, '')) + 1 || 100)); render(); announce('装置已载入，可继续修改和记录。'); } catch (error) { announce(`未载入：${error.message}。原装置已保留。`); } finally { e.target.value = ''; } });
  $('mlRecord').addEventListener('click', () => {
    if ($('mlRecord').disabled) return; if (records.length >= 200) { announce('已记录 200 组，请导出保存。'); return; }
    const parameters = scene.parts.map((p) => `${p.label} ${M.TYPES[p.type].name}${['weight', 'lever', 'moving', 'beam'].includes(p.type) ? ` ${p.mass} kg` : ''}${p.type === 'lever' ? ` 支点${p.pivot}` : ''}`).join('；') + `；g=${scene.g}；` + scene.links.map((l) => `${scene.parts.find((p) => p.id === l.child).label} 挂 ${name(l.parent)}`).join('；');
    const measurements = [...result.meters.map((m) => `${scene.parts.find((p) => p.id === m.id).label} ${fmt(m.tension, 'N')}${m.overload ? ' 超量程' : ''} 竖直夹角 ${fmt(m.angle, '°', 1)} 水平分力 ${fmtMagnitude(m.forceX)} 竖直分力 ${fmtMagnitude(m.forceY)}`), ...(result.supports || []).map((p) => `${scene.parts.find((c) => c.id === p.id).label} θ₁=${fmt(p.sides[0].angle, '°', 1)} θ₂=${fmt(p.sides[1].angle, '°', 1)} 向上合力 ${fmt(p.forceUp, 'N')}`), ...result.levers.map((l) => `${scene.parts.find((p) => p.id === l.id).label} 重力矩 ${fmt(l.gravityMoment, 'N·m')} 绳力矩 ${fmt(l.ropeMoment, 'N·m')}`)].join('；');
    records.push({ scene: M.clone(scene), time: new Date().toISOString(), parameters, measurements, motion: motionResult ? $('mlMotionNote').textContent : '未试拉', status: result.valid ? '可平衡' : result.issues.join('；') });
    $('mlRecords').innerHTML = records.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.parameters)}</td><td>${esc(r.measurements || '未接入测力计')}</td><td>${esc(r.motion)}</td><td>${esc(r.status)}</td></tr>`).join(''); $('mlRecordCount').textContent = `${records.length} 组`; $('mlCsv').disabled = false; announce(`已记录第 ${records.length} 组，后续修改不会改变已有记录。`);
  });
  $('mlCsv').addEventListener('click', () => { const cell = (v) => `"${String(v).replace(/"/g, '""')}"`; const rows = [['组次', '时间', '装置与变量', '测量与力矩', '移动关系', '状态', '装置快照'], ...records.map((r, i) => [i + 1, r.time, r.parameters, r.measurements, r.motion, r.status, JSON.stringify(r.scene)])]; download('力学实验记录.csv', '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); controls.cancel(); } });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.source === window.parent && e.data?.type === 'gewulab:active' && e.data.active === false) { stop(); controls.cancel(); } });
  updateQuestion(); render();
})();
