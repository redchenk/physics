(() => {
  'use strict';
  const M = globalThis.Mechanics;
  const W = globalThis.MechanicsWorkbench;
  const root = document.getElementById('mechanicsLab');
  if (!root || !M || !W) return;

  const presets = [
    ['lever', '杠杆平衡', '移动支点与钩码'],
    ['fixed', '定滑轮', '改变力的方向'],
    ['moving', '动滑轮', '观察省力规律'],
    ['tilt', '绳角实验', '比较分力与夹角'],
    ['group', '滑轮组', '四段绳共同承重'],
    ['combo', '组合机械', '杠杆联动滑轮'],
    ['empty', '自由搭建', '从空白实验台开始'],
  ];
  const equipment = ['lever', 'fixed', 'moving', 'beam', 'weight', 'scale', 'anchor'];
  const colorForRope = ['#d67828', '#2c7f9d', '#7c5bb3', '#26856a', '#b44f69'];
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clone = (value) => M.clone(value);
  const fmt = (value, unit = '', digits = 2) => Number.isFinite(value) ? `${Math.abs(value) < 1e-8 ? (0).toFixed(digits) : value.toFixed(digits)}${unit ? ` ${unit}` : ''}` : '—';

  let scene = W.settleLevers(M.example('lever'));
  let preset = 'lever';
  let selected = { kind: 'part', id: 'l1' };
  let gesture = null;
  let gestureBefore = null;
  let pointer = null;
  let snapping = true;
  let wiring = false;
  let ropeDraft = [];
  let history = [];
  let future = [];
  const records = [];
  let serial = 100;
  let motionBase = null;
  let view = { x: 240, y: 155, scale: 2 };
  const fullView = () => { view = { x: 0, y: 0, scale: 1 }; };

  root.innerHTML = `
    <nav class="mw-presets" aria-label="选择力学实验">
      ${presets.map(([id, title, note]) => `<button type="button" data-preset="${id}" aria-pressed="${id === preset}"><strong>${title}</strong><small>${note}</small></button>`).join('')}
    </nav>
    <section class="mw-shell">
      <aside class="mw-side" aria-label="器材与属性">
        <div class="mw-side-title"><div><span>器材盒</span><small>点击添加到实验台</small></div><b id="mwReady">交互已就绪</b></div>
        <div class="mw-equipment">
          ${equipment.map((type) => `<button type="button" data-add="${type}"><b>${M.TYPES[type].symbol}</b><span>${M.TYPES[type].name}</span><i>＋</i></button>`).join('')}
        </div>
        <div class="mw-inspector" id="mwInspector"></div>
      </aside>
      <div class="mw-main">
        <div class="mw-toolbar" aria-label="实验台工具">
          <button type="button" data-action="select" aria-pressed="true">↖ 拖动器材</button>
          <button type="button" data-action="wire" aria-pressed="false">⌁ 连接绳索</button>
          <button type="button" data-action="snap" aria-pressed="true">自动挂接：开</button>
          <button type="button" data-action="view">完整实验台</button>
          <span></span>
          <button type="button" data-action="undo" disabled>撤销</button>
          <button type="button" data-action="redo" disabled>重做</button>
          <button type="button" data-action="clear">清空</button>
        </div>
        <div class="mw-tip" id="mwTip" role="status">直接抓住任意器材拖动；抓住三角支点可改变力臂。</div>
        <div class="mw-canvas-wrap">
          <canvas id="mwCanvas" width="1000" height="620" tabindex="0" aria-label="可拖动力学实验台"></canvas>
          <div class="mw-canvas-badge" id="mwCanvasHint">拖动杆身移动装置 · 拖动钩码改变挂点</div>
        </div>
        <div class="mw-status" id="mwStatus"></div>
        <div class="mw-metrics" id="mwMetrics"></div>
        <section class="mw-motion" id="mwMotion" aria-label="试拉装置">
          <div><strong>缓慢试拉</strong><select id="mwDriver" aria-label="选择测力计"></select><button type="button" data-action="motion-reset">回到起点</button></div>
          <label><span>向上拉</span><input id="mwPull" type="range" min="-100" max="100" step="2" value="0"><span>向下拉</span><output id="mwPullValue">0.00 m</output></label>
          <p id="mwMotionNote">选择接入绳索的测力计，拖动滑块观察物体位移和功。</p>
        </section>
      </div>
    </section>
    <section class="mw-bottom">
      <article><span>探究任务</span><h2 id="mwQuestion"></h2><p id="mwInquiry"></p></article>
      <article><span>操作提示</span><h2>每次只改变一个条件</h2><p>改变前后各记录一次，比较拉力、力矩、承重绳段与移动距离。</p></article>
    </section>
    <section class="mw-records">
      <div><div><span>学习证据</span><h2>实验记录 <small id="mwRecordCount">0 组</small></h2></div><button type="button" data-action="record">＋ 记录当前状态</button><button type="button" data-action="csv" disabled>导出 CSV</button><button type="button" data-action="save">保存装置</button><label class="mw-file">载入装置<input id="mwFile" type="file" accept="application/json,.json"></label></div>
      <div class="mw-table"><table><thead><tr><th>组次</th><th>实验</th><th>变量</th><th>测量结果</th><th>状态</th></tr></thead><tbody id="mwRecordBody"><tr><td colspan="5">拖动器材改变装置，再记录前后两组数据。</td></tr></tbody></table></div>
    </section>
    <details class="mw-model"><summary>模型范围与课堂使用说明</summary><p>实验按理想轻绳、光滑轮轴和刚性杆处理。测力计显示静止或缓慢运动所需的张力；斜绳按竖直分力计算。杠杆两侧力矩不等时会向力矩较大的一侧倾斜，平衡时自动回到水平。拖动挂在动滑轮或横梁下方的负载会移动整套承重组件；按住 Alt 可单独取下器材。</p></details>`;

  const canvas = document.getElementById('mwCanvas');
  const context = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const tip = (message, kind = '') => {
    const target = $('mwTip');
    target.textContent = message;
    target.dataset.kind = kind;
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const commit = (before) => {
    if (same(before, scene)) return;
    history.push(before);
    if (history.length > 60) history.shift();
    future = [];
  };
  const findPart = (id) => scene.parts.find((part) => part.id === id);
  const nameOf = (id) => findPart(id)?.label || id;

  function focusScene() {
    const points = [...M.positions(scene).values()].flatMap((part) => {
      if (part.type === 'lever') return ['s-5', 's5'].flatMap((port) => {
        const p = M.endpoint(part, port);
        return [{ x: p.x - 20, y: p.y - 75 }, { x: p.x + 20, y: p.y + 45 }];
      });
      return [{ x: part.x - 45, y: part.y - 65 }, { x: part.x + 45, y: part.y + 90 }];
    });
    if (!points.length) { fullView(); return; }
    const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
    const scale = Math.max(1, Math.min(2, 840 / (maxX - minX), 460 / (maxY - minY)));
    view = {
      scale,
      x: Math.max(0, Math.min(1000 - 1000 / scale, (minX + maxX) / 2 - 500 / scale)),
      y: Math.max(0, Math.min(620 - 620 / scale, (minY + maxY) / 2 - 310 / scale)),
    };
  }

  function resizeCanvas() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = W.WORLD.width * ratio, height = W.WORLD.height * ratio;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawGrid(ctx) {
    ctx.fillStyle = '#fcfdfc';
    ctx.fillRect(0, 0, W.WORLD.width, W.WORLD.height);
    // Grid and hit testing share the same view; one interval is always 0.2 m.
    const step = 30 * view.scale;
    ctx.fillStyle = '#dce5e4';
    for (let x = (-view.x * view.scale % step + step) % step; x < W.WORLD.width; x += step) {
      for (let y = (-view.y * view.scale % step + step) % step; y < W.WORLD.height; y += step) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = '#254c52'; ctx.font = '600 17px "Microsoft YaHei", sans-serif';
    ctx.fillText(scene.parts.some((p) => p.type === 'lever') ? '杠杆 · 力与力臂' : '自由组合实验台', 28, 36);
    ctx.fillStyle = '#708581'; ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText('相邻挂孔 0.2 m', 28, 60);
    ctx.textAlign = 'right'; ctx.fillText(view.scale > 1 ? '装置放大视图' : '完整实验台', 972, 36); ctx.textAlign = 'left';
  }

  function weightColor(part, posed) {
    const link = scene.links.find((item) => item.child === part.id);
    const parent = link && posed.get(link.parent.split(':')[0]);
    if (parent?.type === 'lever') return part.x > parent.x + .1 ? '#b76b2b' : part.x < parent.x - .1 ? '#347a9a' : '#637975';
    return '#347a9a';
  }

  function drawSuspensions(ctx, posed) {
    ctx.save(); ctx.lineCap = 'round';
    for (const link of scene.links) {
      const child = posed.get(link.child);
      const from = M.point(posed, link.parent);
      // Links are actual suspension connections, distinct from routed ropes.
      const to = child.type === 'weight' || child.type === 'scale' ? M.endpoint(child, 'hook') : child;
      ctx.strokeStyle = child.type === 'weight' ? weightColor(child, posed) : '#6a858a';
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLever(ctx, part) {
    const active = selectedPart(part.id);
    // The stationary stand is drawn before rotating just the beam.
    ctx.save(); ctx.translate(part.x, part.y);
    ctx.fillStyle = '#dce7e3'; ctx.strokeStyle = active ? '#267966' : '#738e86'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-13, 32); ctx.lineTo(13, 32); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8ca49b'; roundRect(ctx, -20, 32, 40, 4, 2); ctx.fill();
    ctx.fillStyle = '#456e61'; ctx.beginPath(); ctx.arc(0, 25, 2, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(part.angle || 0);
    const left = (-5 - part.pivot) * 30, right = (5 - part.pivot) * 30;
    if (active) {
      ctx.strokeStyle = '#8fbcae'; ctx.lineWidth = 1;
      roundRect(ctx, left - 9, -15, right - left + 18, 29, 7); ctx.stroke();
    }
    ctx.fillStyle = '#e6efed'; ctx.strokeStyle = '#6b8c84'; ctx.lineWidth = 1;
    roundRect(ctx, left - 5, -10, right - left + 10, 20, 4); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#347a9a'; ctx.beginPath(); ctx.moveTo(left, -9); ctx.lineTo(0, -9); ctx.stroke();
    ctx.strokeStyle = '#b76b2b'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(right, -9); ctx.stroke();
    for (let slot = -5; slot <= 5; slot++) {
      const x = (slot - part.pivot) * 30;
      const occupied = scene.links.some((link) => link.parent === `${part.id}:s${slot}`);
      const color = slot < part.pivot ? '#347a9a' : slot > part.pivot ? '#b76b2b' : '#315e51';
      ctx.strokeStyle = '#8fa59e'; ctx.lineWidth = .6;
      if (slot < 5) for (let tick = 1; tick < 5; tick++) { ctx.beginPath(); ctx.moveTo(x + tick * 6, -7); ctx.lineTo(x + tick * 6, -4); ctx.stroke(); }
      ctx.fillStyle = occupied ? color : '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, 2, occupied ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = slot === part.pivot ? '#225f4b' : '#506d65';
      ctx.font = `${slot === part.pivot ? '700' : '500'} 10px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillText(String(slot), x, -20);
    }
    ctx.fillStyle = '#315f51'; ctx.beginPath(); ctx.arc(0, 2, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2f7f4'; ctx.beginPath(); ctx.arc(0, 2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawLeverGuides(ctx, posed) {
    if (scene.ropes.length || [...posed.values()].filter((p) => p.type === 'lever').length !== 1) return;
    const lever = [...posed.values()].find((p) => p.type === 'lever');
    if (!lever) return;
    const loads = scene.links.filter((link) => link.parent.startsWith(`${lever.id}:`) && posed.get(link.child)?.type === 'weight');
    // Dense arrangements retain the apparatus and metrics without overlapping callouts.
    if (loads.length > 2) return;
    ctx.save(); ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    const guideY = Math.min(M.endpoint(lever, 's-5').y, M.endpoint(lever, 's5').y) - 54;
    for (const link of loads) {
      const load = posed.get(link.child), at = M.point(posed, link.parent), arm = Math.abs(at.x - lever.x) / M.SCALE;
      const color = weightColor(load, posed);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = .8;
      if (arm > .15 && loads.filter((other) => Math.sign(posed.get(other.child).x - lever.x) === Math.sign(at.x - lever.x)).length === 1) {
        ctx.beginPath(); ctx.moveTo(lever.x, guideY); ctx.lineTo(at.x, guideY); ctx.stroke();
        for (const x of [lever.x, at.x]) { ctx.beginPath(); ctx.moveTo(x, guideY - 3); ctx.lineTo(x, guideY + 3); ctx.stroke(); }
        ctx.fillText(`${arm.toFixed(2)} m`, (at.x + lever.x) / 2, guideY - 7);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = '#b3c5bd'; ctx.beginPath(); ctx.moveTo(at.x, guideY + 7); ctx.lineTo(at.x, at.y - 31); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(load.x, load.y + 45); ctx.lineTo(load.x, load.y + 68); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(load.x - 3, load.y + 63); ctx.lineTo(load.x, load.y + 69); ctx.lineTo(load.x + 3, load.y + 63); ctx.stroke();
      ctx.fillText(`${fmt(load.mass * scene.g, 'N', 0)}`, load.x, load.y + 84);
    }
    ctx.restore();
  }

  function drawRope(ctx, rope, geometry, index) {
    ctx.save();
    ctx.strokeStyle = selected?.kind === 'rope' && selected.ropeId === rope.id ? '#d3651e' : colorForRope[index % colorForRope.length];
    ctx.lineWidth = selected?.kind === 'rope' && selected.ropeId === rope.id ? 6 : 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const line of geometry.lines) {
      ctx.beginPath(); ctx.moveTo(line.a.x, line.a.y); ctx.lineTo(line.b.x, line.b.y); ctx.stroke();
    }
    for (const arc of geometry.arcs) {
      const start = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x);
      const end = Math.atan2(arc.to.y - arc.center.y, arc.to.x - arc.center.x);
      ctx.beginPath(); ctx.arc(arc.center.x, arc.center.y, M.RADIUS, start, end, !arc.sweep); ctx.stroke();
    }
    const posed = M.positions(scene);
    for (const key of [rope.nodes[0], rope.nodes.at(-1)]) {
      const point = M.point(posed, key);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = colorForRope[index % colorForRope.length]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(point.x, point.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBrokenRope(ctx, rope, index) {
    const posed = M.positions(scene), points = rope.nodes.map((key) => {
      try { return M.point(posed, key); } catch { return null; }
    }).filter(Boolean);
    if (points.length < 2) return;
    ctx.save(); ctx.strokeStyle = '#c55346'; ctx.setLineDash([8, 6]); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = colorForRope[index % colorForRope.length];
    ctx.restore();
  }

  function selectedPart(id) { return selected?.kind === 'part' && selected.id === id; }

  function drawPart(ctx, part) {
    if (part.type === 'lever') { drawLever(ctx, part); return; }
    ctx.save();
    ctx.translate(part.x, part.y);
    ctx.rotate(part.angle || 0);
    const active = selectedPart(part.id);
    if (active && part.type !== 'weight') {
      ctx.strokeStyle = '#20906f'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.arc(0, 0, part.type === 'lever' ? 42 : 50, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#416478';
    ctx.fillStyle = '#eff5f7';
    ctx.lineWidth = 2;
    if (part.type === 'fixed' || part.type === 'moving') {
      if (part.type === 'fixed') {
        ctx.strokeStyle = '#738d9a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -54); ctx.lineTo(0, -30); ctx.stroke();
        ctx.fillStyle = '#738d9a'; ctx.beginPath(); ctx.arc(0, -56, 6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = part.type === 'moving' ? '#dcecf2' : '#edf4f6'; ctx.strokeStyle = '#55798b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, M.RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#88a4b0'; ctx.lineWidth = 2;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(angle) * 23, Math.sin(angle) * 23); ctx.stroke(); }
      ctx.fillStyle = '#456d80'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      if (part.type === 'moving') { ctx.strokeStyle = '#55798b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 28); ctx.lineTo(0, 42); ctx.stroke(); }
    } else if (part.type === 'beam') {
      roundRect(ctx, -78, -10, 156, 20, 5); ctx.fillStyle = '#d8e6ed'; ctx.fill(); ctx.strokeStyle = '#688797'; ctx.stroke();
      for (let slot = -2; slot <= 2; slot++) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#648292'; ctx.beginPath(); ctx.arc(slot * 28, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    } else if (part.type === 'weight') {
      const color = weightColor(part, M.positions(scene));
      if (active) { ctx.strokeStyle = color; ctx.lineWidth = 1; roundRect(ctx, -15, -33, 30, 75, 5); ctx.stroke(); }
      ctx.strokeStyle = '#78928b'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(0, -24, 4, Math.PI * .1, Math.PI * 1.8); ctx.lineTo(0, -15); ctx.stroke();
      ctx.fillStyle = color; roundRect(ctx, -12, -16, 24, 41, 3); ctx.fill();
      ctx.fillStyle = '#ffffff30'; ctx.fillRect(-10, -13, 3, 34);
      ctx.strokeStyle = '#ffffff60'; ctx.lineWidth = .7;
      for (const y of [-6, 4, 14]) { ctx.beginPath(); ctx.moveTo(-11, y); ctx.lineTo(11, y); ctx.stroke(); }
      ctx.fillStyle = color; ctx.font = '600 10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${part.mass} kg`, 0, 38);
    } else if (part.type === 'scale') {
      ctx.strokeStyle = '#4f7181'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, -39); ctx.stroke();
      roundRect(ctx, -27, -39, 54, 82, 12); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8f1f4'; ctx.fillRect(-19, -27, 38, 25); ctx.strokeStyle = '#7f9ba8'; ctx.strokeRect(-19, -27, 38, 25);
      ctx.fillStyle = '#265b70'; ctx.font = '700 13px ui-monospace, monospace'; ctx.textAlign = 'center';
      const analysis = safeAnalyze(); const meter = analysis.meters?.find((item) => item.id === part.id);
      ctx.fillText(meter?.tension == null ? '— N' : `${meter.tension.toFixed(1)} N`, 0, -10);
      ctx.strokeStyle = '#4f7181'; ctx.beginPath(); ctx.arc(0, 54, 11, 0, Math.PI * 2); ctx.stroke();
    } else if (part.type === 'anchor') {
      ctx.strokeStyle = '#557681'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-30, -16); ctx.lineTo(30, -16); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 2); ctx.arc(0, 12, 10, -Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    }
    if (part.type !== 'weight') {
      ctx.fillStyle = '#405f70'; ctx.font = '600 13px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(part.label, 0, part.type === 'scale' ? 78 : part.type === 'anchor' ? 48 : 62);
    }
    ctx.restore();
  }

  function drawPorts(ctx) {
    if (!wiring) return;
    const posed = M.positions(scene);
    for (const part of posed.values()) for (const port of M.ports(part)) {
      const at = M.endpoint(part, port);
      ctx.fillStyle = port === 'wheel' ? '#2e8e7030' : '#fff';
      ctx.strokeStyle = ropeDraft.includes(`${part.id}:${port}`) ? '#d36b24' : '#2c8c70';
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(at.x, at.y, port === 'wheel' ? M.RADIUS + 9 : 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  function drawDraft(ctx) {
    const posed = M.positions(scene);
    if (ropeDraft.length) {
      const points = ropeDraft.map((key) => M.point(posed, key));
      if (pointer) points.push(pointer);
      ctx.save(); ctx.strokeStyle = '#21866b'; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y)); ctx.stroke(); ctx.restore();
    }
    if (gesture?.kind === 'rope-end' && gesture.current) {
      const rope = scene.ropes.find((item) => item.id === gesture.ropeId);
      if (!rope) return;
      const adjacent = gesture.end ? rope.nodes.at(-2) : rope.nodes[1];
      const from = M.point(posed, adjacent);
      ctx.save(); ctx.strokeStyle = '#d3651e'; ctx.lineWidth = 4; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(gesture.current.x, gesture.current.y); ctx.stroke(); ctx.restore();
    }
  }

  function draw() {
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, W.WORLD.width, W.WORLD.height);
    drawGrid(context);
    context.save();
    context.scale(view.scale, view.scale); context.translate(-view.x, -view.y);
    const analysis = safeAnalyze();
    scene.ropes.forEach((rope, index) => {
      const geometry = analysis.geometries?.[index];
      if (geometry) drawRope(context, rope, geometry, index); else drawBrokenRope(context, rope, index);
    });
    const posed = M.positions(scene);
    drawSuspensions(context, posed);
    drawLeverGuides(context, posed);
    for (const part of posed.values()) drawPart(context, part);
    drawPorts(context);
    drawDraft(context);
    context.restore();
  }

  function safeAnalyze() {
    try { return M.analyze(scene); }
    catch (error) { return { valid: false, status: 'geometry', issues: [error.message], meters: [], levers: [], supports: [], geometries: [] }; }
  }

  function renderInspector() {
    const box = $('mwInspector');
    if (!selected) {
      box.innerHTML = '<h2>尚未选择器材</h2><p>在实验台上点击器材，可查看并修改质量、量程或连接状态。</p>';
      return;
    }
    if (selected.kind === 'rope') {
      const rope = scene.ropes.find((item) => item.id === selected.ropeId);
      if (!rope) { selected = null; return renderInspector(); }
      box.innerHTML = `<h2>绳索 ${esc(rope.id)}</h2><p>${rope.nodes.map((key) => esc(key)).join(' → ')}</p><button type="button" data-action="rewire">重新穿绳</button><button type="button" class="danger" data-action="delete">删除绳索</button>`;
      return;
    }
    const item = findPart(selected.id);
    if (!item) { selected = null; return renderInspector(); }
    const link = scene.links.find((entry) => entry.child === item.id);
    const mass = ['lever', 'fixed', 'moving', 'beam', 'weight'].includes(item.type) ? `<label>质量 / kg<input type="number" min="0" max="20" step="0.1" value="${item.mass}" data-property="mass"></label>` : '';
    const range = item.type === 'scale' ? `<label>测力计量程<select data-property="range">${[5, 10, 50, 100, 500].map((value) => `<option value="${value}" ${item.range === value ? 'selected' : ''}>0–${value} N</option>`).join('')}</select></label>` : '';
    const pivot = item.type === 'lever' ? `<label>支点刻度<select data-property="pivot">${Array.from({ length: 9 }, (_, index) => index - 4).map((value) => `<option value="${value}" ${item.pivot === value ? 'selected' : ''}>${value} 格</option>`).join('')}</select></label><p>也可以直接拖动实验台上的三角支点。</p>` : '';
    box.innerHTML = `<h2>${esc(item.label)} · ${esc(M.TYPES[item.type].name)}</h2>${mass}${range}${pivot}${link ? `<p>当前挂在 ${esc(link.parent)}。拖到空白处可取下。</p><button type="button" data-action="detach">解除挂接</button>` : ''}<button type="button" class="danger" data-action="delete">删除器材</button><small>${item.type === 'weight' && globalThis.MechanicsInteraction.ropeAssemblyRoot(scene, item.id) ? '直接拖动会带着承重滑轮和绳子一起移动；按住 Alt 可单独取下。' : '直接按住器材主体即可拖动。'}</small>`;
  }

  function renderStatus() {
    const analysis = safeAnalyze();
    const statusNames = { balanced: '装置可测量', unbalanced: '杠杆未平衡', geometry: '装置几何冲突', slack: '绳索松弛', indeterminate: '约束不足' };
    const valid = analysis.valid;
    $('mwStatus').className = `mw-status ${valid ? 'ok' : 'warn'}`;
    const leverOnly = analysis.levers?.length === 1 && !scene.ropes.length;
    $('mwStatus').innerHTML = `<div><b>${valid ? '✓' : '!'}</b><span><strong>${leverOnly && valid ? '杠杆已平衡' : statusNames[analysis.status] || '等待搭建'}</strong><small>${leverOnly ? '拖动钩码改变挂点；拖动三角支点改变两侧力臂。' : valid ? '当前连接可用于读取数据与缓慢试拉。' : esc(analysis.issues?.[0] || '请继续搭建或调整装置。')}</small></span></div>`;
    const metrics = [];
    for (const meter of analysis.meters || []) metrics.push(['测力计', nameOf(meter.id), fmt(meter.tension, 'N'), meter.issue || (meter.overload ? '已超量程' : `绳方向 ${fmt(meter.angle, '°', 1)}`)]);
    for (const lever of analysis.levers || []) if (!leverOnly) metrics.push(['杠杆力矩', nameOf(lever.id), lever.netMoment == null ? '—' : fmt(Math.abs(lever.netMoment), 'N·m'), lever.netMoment == null ? '等待有效约束' : Math.abs(lever.netMoment) < .01 ? '两侧力矩平衡' : lever.netMoment > 0 ? '顺时针侧较大' : '逆时针侧较大']);
    for (const support of analysis.supports || []) metrics.push(['承重分力', nameOf(support.id), fmt(support.forceUp, 'N'), `${support.sides.length} 个绳段共同承重`]);
    if (!metrics.length && !leverOnly) metrics.push(['当前器材', `${scene.parts.length} 件`, `${scene.ropes.length} 根绳`, '添加器材或选择上方实验起点']);
    let comparison = '';
    if (leverOnly) {
      const lever = analysis.levers[0], balance = Math.abs(lever.netMoment) < .01;
      const sum = lever.counterclockwise + lever.clockwise;
      const leftShare = sum > .0001 ? lever.counterclockwise / sum * 100 : 50;
      comparison = `<div class="mw-lever-comparison"><article class="mw-torque-left"><span>左侧力矩 · 逆时针</span><strong>${fmt(lever.counterclockwise)} <em>N·m</em></strong><small>重力 × 水平力臂</small></article><article class="mw-torque-balance"><span>${balance ? '两侧相等' : lever.netMoment > 0 ? '右侧力矩较大' : '左侧力矩较大'}</span><strong>${balance ? '=' : lever.netMoment > 0 ? '＜' : '＞'}</strong><small>力矩差 ${fmt(Math.abs(lever.netMoment), 'N·m')}</small></article><article class="mw-torque-right"><span>右侧力矩 · 顺时针</span><strong>${fmt(lever.clockwise)} <em>N·m</em></strong><small>重力 × 水平力臂</small></article><div class="mw-torque-bar" aria-hidden="true"><i style="width:${leftShare.toFixed(2)}%"></i></div></div>`;
    }
    $('mwMetrics').innerHTML = comparison + metrics.map(([label, name, value, note]) => `<article><span>${esc(label)} · ${esc(name)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
    const drivers = scene.parts.filter((item) => item.type === 'scale');
    $('mwMotion').hidden = !drivers.length;
    $('mwCanvasHint').textContent = leverOnly ? '拖动杆身移动装置 · 拖动钩码改变挂点' : '拖动器材自由摆放 · 拖动绳端重新连接';
    const select = $('mwDriver'), current = select.value;
    select.innerHTML = drivers.length ? drivers.map((item) => `<option value="${item.id}">${esc(item.label)}</option>`).join('') : '<option value="">暂无测力计</option>';
    if (drivers.some((item) => item.id === current)) select.value = current;
  }

  function renderQuestion() {
    const copy = {
      lever: ['怎样移动支点或钩码，才能让杠杆恢复水平？', '比较两侧“力 × 力臂”，判断倾斜方向。'],
      fixed: ['定滑轮是否省力？它改变了什么？', '移动钩码和测力计，比较重力与绳子拉力。'],
      moving: ['动滑轮为什么能省力？', '改变负载质量，观察两个承重绳段的竖直分力。'],
      tilt: ['绳子变斜后，拉力为什么会增大？', '水平移动两端，保持负载不变，比较角度与张力。'],
      group: ['承重绳段越多，拉力一定越小吗？', '重新穿绳或调整滑轮，数清真正向上的承重分力。'],
      combo: ['杠杆与滑轮组合后，省力效果怎样叠加？', '先改变杠杆作用点，再观察测力计与负载。'],
      empty: ['你能自由搭建一个既省力又能移动的装置吗？', '添加器材、挂接负载，再用“连接绳索”依次选择接点。'],
    };
    const [question, inquiry] = copy[preset] || copy.empty;
    $('mwQuestion').textContent = question;
    $('mwInquiry').textContent = inquiry;
  }

  function renderRecords() {
    $('mwRecordCount').textContent = `${records.length} 组`;
    root.querySelector('[data-action="csv"]').disabled = records.length === 0;
    $('mwRecordBody').innerHTML = records.length ? records.map((record, index) => `<tr><td>${index + 1}</td><td>${esc(record.preset)}</td><td>${esc(record.variables)}</td><td>${esc(record.measurement)}</td><td>${esc(record.status)}</td></tr>`).join('') : '<tr><td colspan="5">拖动器材改变装置，再记录前后两组数据。</td></tr>';
  }

  function renderControls() {
    root.querySelectorAll('[data-preset]').forEach((button) => { button.setAttribute('aria-pressed', String(button.dataset.preset === preset)); });
    root.querySelector('[data-action="wire"]').setAttribute('aria-pressed', String(wiring));
    root.querySelector('[data-action="select"]').setAttribute('aria-pressed', String(!wiring));
    root.querySelector('[data-action="snap"]').setAttribute('aria-pressed', String(snapping));
    root.querySelector('[data-action="snap"]').textContent = `自动挂接：${snapping ? '开' : '关'}`;
    root.querySelector('[data-action="undo"]').disabled = history.length === 0;
    root.querySelector('[data-action="redo"]').disabled = future.length === 0;
    root.querySelector('[data-action="view"]').textContent = view.scale > 1 ? '完整实验台' : '放大装置';
  }

  function renderAll() {
    renderControls();
    renderInspector();
    renderStatus();
    renderQuestion();
    renderRecords();
    draw();
  }

  function setPreset(kind) {
    preset = kind;
    scene = W.settleLevers(M.example(kind));
    view = kind === 'lever' ? { x: 240, y: 155, scale: 2 } : { x: 0, y: 0, scale: 1 };
    selected = scene.parts[0] ? { kind: 'part', id: scene.parts[0].id } : null;
    history = []; future = []; ropeDraft = []; wiring = false; motionBase = null;
    $('mwPull').value = '0'; $('mwPullValue').textContent = '0.00 m';
    tip(kind === 'empty' ? '从器材盒添加元件，再直接拖动摆放。' : '直接抓住器材拖动；绳子会跟随相连器材实时移动。');
    renderAll();
  }

  function addPart(type) {
    const before = clone(scene);
    serial += 1;
    const count = scene.parts.filter((part) => part.type === type).length + 1;
    const x = 300 + (serial * 71) % 420, y = type === 'fixed' || type === 'anchor' ? 150 : 260 + (serial * 43) % 210;
    const item = M.component(type, `${M.TYPES[type].prefix.toLowerCase()}${serial}`, x, y, count);
    scene.parts.push(item);
    fullView();
    scene = W.settleLevers(scene);
    selected = { kind: 'part', id: item.id };
    commit(before);
    tip(`${M.TYPES[type].name}已加入，可以直接拖动。`, 'ok');
    renderAll();
  }

  function removeSelected() {
    if (!selected) return;
    const before = clone(scene);
    if (selected.kind === 'rope') scene.ropes = scene.ropes.filter((rope) => rope.id !== selected.ropeId);
    else {
      const id = selected.id;
      const descendants = globalThis.MechanicsInteraction.descendants(scene, id);
      scene.parts = scene.parts.filter((part) => !descendants.has(part.id));
      scene.links = scene.links.filter((link) => !descendants.has(link.child) && !descendants.has(link.parent.split(':')[0]));
      scene.ropes = scene.ropes.filter((rope) => !rope.nodes.some((key) => descendants.has(key.split(':')[0])));
    }
    selected = null; scene = W.settleLevers(scene); commit(before);
    tip('已删除选中对象，可用“撤销”恢复。'); renderAll();
  }

  function handleWirePoint(point) {
    const target = W.nearestPort(scene, point, { includeWheels: true, radius: 20 });
    if (!target) { tip('请点击发光的接点或滑轮轮槽。', 'warn'); return; }
    if (!ropeDraft.length && target.wheel) { tip('先选择固定绳端、钩码或测力计作为绳子的起点。', 'warn'); return; }
    if (ropeDraft.at(-1) === target.key) return;
    if (ropeDraft.includes(target.key)) { tip('同一接点不能在一根绳中重复经过。', 'warn'); return; }
    ropeDraft.push(target.key);
    if (!target.wheel && ropeDraft.length >= 2) {
      const before = clone(scene);
      try {
        scene = W.createRope(scene, ropeDraft);
        commit(before); ropeDraft = [];
        tip('绳索连接完成。拖动任意相连器材，绳形会实时跟随。', 'ok');
      } catch (error) {
        ropeDraft.pop(); tip(error.message, 'warn');
      }
      renderAll(); return;
    }
    tip(target.wheel ? '已经过滑轮；继续点另一个滑轮或绳端。' : '已选择绳子起点；继续点击滑轮或终点。');
    draw();
  }

  W.bindPointerDrag(canvas, window, {
    start(event) {
      canvas.focus({ preventScroll: true });
      const point = W.canvasPoint(canvas, event, view); pointer = point;
      if (wiring) {
        const port = W.nearestPort(scene, point, { includeWheels: true, radius: 18 });
        if (port) { gestureBefore = clone(scene); gesture = { kind: 'wire-tap', start: point }; return true; }
      }
      const hit = W.hitTest(scene, point);
      if (!hit) { selected = null; renderInspector(); draw(); return false; }
      gestureBefore = clone(scene);
      const started = W.beginDrag(scene, point, { hit, individual: event.altKey });
      scene = started.scene; gesture = started.gesture;
      if (hit.kind === 'part' || hit.kind === 'pivot') selected = { kind: 'part', id: hit.id };
      else selected = { kind: 'rope', ropeId: hit.ropeId };
      renderInspector(); draw();
      return Boolean(gesture);
    },
    move(event) {
      const point = W.canvasPoint(canvas, event, view); pointer = point;
      if (gesture?.kind === 'wire-tap') {
        if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 6) gesture.kind = 'wire-cancel';
        draw(); return;
      }
      scene = W.moveDrag(scene, gesture, point);
      draw(); renderStatus();
    },
    end(event) {
      const point = W.canvasPoint(canvas, event, view); pointer = point;
      if (gesture?.kind === 'wire-tap') handleWirePoint(point);
      else if (gesture?.kind === 'wire-cancel') draw();
      else {
        scene = W.endDrag(scene, gesture, point, { snap: snapping });
        if (gestureBefore) commit(gestureBefore);
        tip(gesture?.kind === 'rope-end' ? '绳端已更新；如靠近接点会自动连接。' : '器材已移动，相关绳索和测量结果同步更新。', 'ok');
        renderAll();
      }
      gesture = null; gestureBefore = null;
    },
    cancel() {
      if (gestureBefore) scene = gestureBefore;
      gesture = null; gestureBefore = null; pointer = null;
      tip('已取消本次拖动，装置保持原状。'); renderAll();
    },
  }, { pointerEvents: 'PointerEvent' in window });

  canvas.addEventListener('pointermove', (event) => {
    pointer = W.canvasPoint(canvas, event, view);
    if (!gesture) {
      const hit = W.hitTest(scene, pointer);
      canvas.style.cursor = hit?.kind === 'pivot' ? 'ew-resize' : hit ? 'grab' : wiring && W.nearestPort(scene, pointer) ? 'crosshair' : 'default';
      if (ropeDraft.length) draw();
    }
  }, { passive: true });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    const action = button?.dataset.action;
    if (button?.dataset.preset) return setPreset(button.dataset.preset);
    if (button?.dataset.add) return addPart(button.dataset.add);
    if (!action) return;
    if (action === 'select') { wiring = false; ropeDraft = []; tip('拖动模式：直接抓住器材、支点或绳端。'); }
    if (action === 'wire') { wiring = true; ropeDraft = []; tip('连接绳索：先点绳端，再依次点滑轮，最后点另一个绳端。'); }
    if (action === 'snap') { snapping = !snapping; tip(`自动挂接已${snapping ? '开启' : '关闭'}。`); }
    if (action === 'view') { if (view.scale > 1) fullView(); else focusScene(); }
    if (action === 'undo' && history.length) { future.push(clone(scene)); scene = history.pop(); selected = null; tip('已撤销上一步。'); }
    if (action === 'redo' && future.length) { history.push(clone(scene)); scene = future.pop(); selected = null; tip('已恢复下一步。'); }
    if (action === 'clear') { const before = clone(scene); scene = M.example('empty'); fullView(); selected = null; ropeDraft = []; commit(before); tip('实验台已清空，可从器材盒重新搭建。'); }
    if (action === 'delete') removeSelected();
    if (action === 'detach' && selected?.kind === 'part') { const before = clone(scene); scene = globalThis.MechanicsInteraction.detached(scene, selected.id); commit(before); tip('器材已解除挂接，可以自由拖动。'); }
    if (action === 'rewire' && selected?.kind === 'rope') { const before = clone(scene); const rope = scene.ropes.find((item) => item.id === selected.ropeId); ropeDraft = rope ? [rope.nodes[0]] : []; scene.ropes = scene.ropes.filter((item) => item.id !== selected.ropeId); commit(before); wiring = true; selected = null; tip('保留了原绳端，请重新选择经过的滑轮和终点。'); }
    if (action === 'record') recordCurrent();
    if (action === 'csv') exportCsv();
    if (action === 'save') saveScene();
    if (action === 'motion-reset') { if (motionBase) scene = motionBase; motionBase = null; $('mwPull').value = '0'; $('mwPullValue').textContent = '0.00 m'; tip('装置已回到试拉起点。'); }
    renderAll();
  });

  root.addEventListener('change', (event) => {
    const property = event.target.dataset.property;
    if (property && selected?.kind === 'part') {
      const before = clone(scene), item = findPart(selected.id), value = Number(event.target.value);
      if (item && Number.isFinite(value)) item[property] = property === 'pivot' ? Math.round(value) : value;
      scene = W.settleLevers(scene); commit(before); tip('器材参数已更新，测量结果同步重算。', 'ok'); renderAll();
    }
  });

  $('mwPull').addEventListener('input', (event) => {
    const driver = $('mwDriver').value, value = Number(event.target.value);
    if (!motionBase) motionBase = clone(scene);
    const moved = M.pull(motionBase, driver, value);
    $('mwPullValue').textContent = fmt(value / M.SCALE, 'm');
    if (moved.ok) {
      scene = moved.scene;
      const lift = moved.lifts.filter((item) => Math.abs(item.height) > 1e-5).map((item) => `${nameOf(item.id)} ${fmt(item.height, 'm')}`).join('，');
      $('mwMotionNote').textContent = `${lift || '负载未移动'}；输出功 ${fmt(moved.outputWork, 'J')}。`;
      tip('正在按恒定绳长缓慢试拉。'); renderStatus(); draw();
    } else {
      $('mwMotionNote').textContent = moved.issue;
      tip(moved.issue, 'warn');
    }
  });

  function recordCurrent() {
    const analysis = safeAnalyze();
    const masses = scene.parts.filter((item) => item.mass > 0).map((item) => `${item.label}=${item.mass} kg`).join('，') || '无负载';
    const values = [
      ...(analysis.meters || []).map((item) => `${nameOf(item.id)}=${fmt(item.tension, 'N')}`),
      ...(analysis.levers || []).map((item) => `${nameOf(item.id)}逆时针重力矩=${fmt(item.counterclockwise, 'N·m')}，顺时针重力矩=${fmt(item.clockwise, 'N·m')}，净力矩=${fmt(item.netMoment, 'N·m')}`),
    ].join('；') || '尚无可测读数';
    records.push({ preset: presets.find((item) => item[0] === preset)?.[1] || '自由搭建', variables: masses, measurement: values, status: analysis.valid ? '可测量' : analysis.issues?.[0] || '待调整', scene: clone(scene) });
    tip(`已记录第 ${records.length} 组数据。`, 'ok'); renderRecords();
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function saveScene() { download('力学实验装置.json', JSON.stringify(scene, null, 2), 'application/json'); }
  function exportCsv() {
    const rows = [['组次', '实验', '变量', '测量结果', '状态'], ...records.map((record, index) => [index + 1, record.preset, record.variables, record.measurement, record.status])];
    download('力学实验记录.csv', `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
  }

  $('mwFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const next = M.validate(JSON.parse(await file.text())), before = clone(scene);
      scene = W.settleLevers(next); fullView(); selected = null; commit(before); tip('装置载入成功，可以继续拖动和测量。', 'ok'); renderAll();
    } catch (error) { tip(`载入失败：${error.message}`, 'warn'); }
    event.target.value = '';
  });

  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (gestureBefore) scene = gestureBefore;
      gesture = null; gestureBefore = null; ropeDraft = []; wiring = false; tip('已取消当前操作。'); renderAll(); event.preventDefault(); return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { removeSelected(); event.preventDefault(); return; }
    if (!selected || selected.kind !== 'part' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const before = clone(scene), pose = M.positions(scene).get(selected.id), step = event.shiftKey ? 20 : 5;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    const started = W.beginDrag(scene, { x: pose.x, y: pose.y }, { hit: { kind: 'part', id: selected.id }, individual: event.altKey });
    scene = W.endDrag(started.scene, started.gesture, { x: pose.x + delta[0], y: pose.y + delta[1] }, { snap: snapping });
    commit(before); tip('已用方向键微调器材位置。'); renderAll(); event.preventDefault();
  });

  window.addEventListener('resize', resizeCanvas, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resizeCanvas).observe(canvas);
  resizeCanvas();
  renderAll();
})();
