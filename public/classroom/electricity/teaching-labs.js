(() => {
  'use strict';
  const root = document.getElementById('fixedElectricLab');
  const M = globalThis.ElectricModels, V = globalThis.ElectricVisuals;
  const $ = (id) => document.getElementById(id);
  const fmt = (v, places = 3) => Number.isFinite(v) ? (Math.abs(v) < 10 ** -places / 2 ? 0 : v).toFixed(places) : '—';
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const state = {
    ohm: { source: 6, resistance: 20, rheostat: 20, closed: true, task: 'iu', theory: false },
    network: { source: 6, r1: 20, r2: 40, topology: 'series', s1: true, s2: true, load: 'lamp' },
    iv: { type: 'bulb', voltage: 6, closed: true, theory: false },
    induction: { position: -14, velocity: 0, speed: 4, turns: 300, field: 0.3, polarity: 1, closed: true, moving: 0 },
  };
  const records = { ohm: [], network: [], iv: [], induction: [] };
  let mode = 'ohm', interaction = null, scan = null, clock = 0, traceClock = 0, previousTime = 0, classroomActive = true;
  const trace = [];
  const titles = {
    ohm: ['欧姆定律 · 控制变量实验', '拖动滑片，读取电表，把测量结果描在坐标系中。'],
    network: ['串联与并联 · 电路中的分配', '切换接法，断开一条支路，比较灯泡、电流和电压。'],
    iv: ['伏安特性 · 测出元件的曲线', '改变电压，观察发光与读数，比较三种元件的 I–U 特性。'],
    induction: ['电磁感应 · 运动产生的电流', '拖动磁铁穿过线圈，或控制匀速运动，观察检流计的正负偏转。'],
  };
  const range = (key, label, value, min, max, step, unit, note = '') => `<div class="el-field"><label for="el-${key}">${label}<output id="out-${key}">${value} ${unit}</output></label><input id="el-${key}" data-param="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">${note ? `<small>${note}</small>` : ''}</div>`;
  function controls() {
    const s = state[mode];
    if (mode === 'ohm') return `<h3>实验条件</h3><div class="el-field"><label for="el-task">探究任务</label><select id="el-task" data-param="task"><option value="iu" ${s.task === 'iu' ? 'selected' : ''}>R 一定，探究 I 与 U</option><option value="ir" ${s.task === 'ir' ? 'selected' : ''}>U 一定，探究 I 与 R</option></select></div>${range('source', '电源电压', s.source, 3, 12, 0.5, 'V')}${range('resistance', '被测电阻 R', s.resistance, 5, 60, 5, 'Ω', s.task === 'iu' ? '选定后保持不变，再改变滑片位置。' : '换电阻后调节滑片，使电压表回到 2.0 V。')}${range('rheostat', '滑动变阻器接入电阻', s.rheostat, 0, 120, 1, 'Ω', '也可以直接拖动装置中的滑片。')}<button type="button" data-lab-action="toggle">${s.closed ? '断开开关' : '闭合开关'}</button><div class="el-instruction"><strong>${s.task === 'iu' ? '本轮保持 R 不变' : '目标：电压表示数 2.0 V'}</strong><p>${s.task === 'iu' ? '每移动一次滑片，记录一组 U、I。至少选取三个不同的电压。' : '换成不同电阻后，先调整滑动变阻器，再记录 I、R。比较时检查 U 是否相同。'}</p></div>`;
    if (mode === 'network') return `<h3>连接与负载</h3><div class="el-field"><label>连接方式</label><div class="el-choice"><button type="button" data-lab-action="series" data-topology="series" class="${s.topology === 'series' ? 'is-active' : ''}">串联</button><button type="button" data-lab-action="parallel" data-topology="parallel" class="${s.topology === 'parallel' ? 'is-active' : ''}">并联</button></div></div><div class="el-field"><label for="el-load">被测负载</label><select id="el-load" data-param="load"><option value="lamp" ${s.load === 'lamp' ? 'selected' : ''}>两个小灯泡</option><option value="resistor" ${s.load === 'resistor' ? 'selected' : ''}>两个定值电阻</option></select></div>${range('source', '电源电压', s.source, 0, 12, 0.5, 'V')}${range('r1', '负载 1 的电阻', s.r1, 5, 100, 5, 'Ω')}${range('r2', '负载 2 的电阻', s.r2, 5, 100, 5, 'Ω')}<div class="el-switches"><button type="button" data-lab-action="s1">${s.s1 ? '断开' : '闭合'} S₁</button><button type="button" data-lab-action="s2">${s.s2 ? '断开' : '闭合'} S₂</button></div><div class="el-instruction"><strong>先预测：断开 S₁ 会怎样？</strong><p>观察另一盏灯是否继续发光，再比较 I、I₁、I₂ 和两端电压。黄色流动点表示约定电流方向。</p></div>`;
    if (mode === 'iv') return `<h3>被测元件</h3><div class="el-field"><label for="el-type">元件种类</label><select id="el-type" data-param="type"><option value="resistor" ${s.type === 'resistor' ? 'selected' : ''}>定值电阻 · 30 Ω</option><option value="bulb" ${s.type === 'bulb' ? 'selected' : ''}>小灯泡 · 温升近似</option><option value="diode" ${s.type === 'diode' ? 'selected' : ''}>二极管 · 正向 / 反向</option></select></div>${range('voltage', '元件两端电压', s.voltage, s.type === 'diode' ? -0.8 : -12, s.type === 'diode' ? 0.8 : 12, s.type === 'diode' ? 0.01 : 0.1, 'V', '正负电压可比较反向与正向导电。')}<div class="el-field"><button type="button" data-lab-action="toggle">${s.closed ? '断开开关' : '闭合开关'}</button><button type="button" data-lab-action="scan" ${!s.closed ? 'disabled' : ''}>${scan ? '停止扫描' : '自动扫描并记录'}</button></div><div class="el-instruction"><strong>曲线来自测量记录</strong><p>点击记录留下一个测量点；自动扫描逐步改变电压并采样。切换元件后，各自的数据分开保存。</p></div>`;
    return `<h3>磁铁与线圈</h3>${range('position', '磁铁中心位置', fmt(s.position, 1), -18, 18, 0.1, 'cm', '拖动位置滑块或直接拖动红蓝磁铁。')}${range('speed', '自动移动速率', s.speed, 1, 10, 0.5, 'cm/s')}<div class="el-field"><div class="el-choice"><button type="button" data-lab-action="left">← 向左</button><button type="button" data-lab-action="right">向右 →</button></div><button type="button" data-lab-action="stop">停止运动</button></div>${range('turns', '线圈匝数', s.turns, 100, 800, 50, '匝')}${range('field', '磁场强度', s.field, 0.1, 0.6, 0.05, 'T')}<div class="el-field"><button type="button" data-lab-action="polarity">对调磁极 N / S</button><button type="button" data-lab-action="toggle">${s.closed ? '断开' : '闭合'}线圈回路</button><button type="button" data-lab-action="reset-position">磁铁回到左侧</button></div><div class="el-instruction"><strong>保持磁铁静止时会怎样？</strong><p>比较靠近、远离与静止。对调磁极，再按相同方向运动，观察指针是否反向。</p></div>`;
  }
  function mount() {
    const [title, subtitle] = titles[mode];
    root.innerHTML = `<div class="el-title"><div><h2>${title}</h2><p>${subtitle}</p></div><span id="elStatus" class="el-tag"></span></div><div class="el-layout"><aside class="el-controls" id="elControls">${controls()}</aside><div class="el-main"><div class="el-stage"><div class="el-stage-head"><span>${mode === 'induction' ? '磁铁 · 线圈 · 检流计' : '可操作的实验装置'}</span><small>${mode === 'induction' ? '拖动磁铁，停下即归零' : '点击开关操作 · 亮度与功率同步'}</small></div><p class="el-scroll-hint">↔ 左右滑动装置区域可查看完整电路</p><div id="elScene" tabindex="0" aria-label="实验装置，可横向滚动"></div><p class="el-stage-caption" id="elCaption"></p></div><div class="el-meters" id="elMeters"></div><div class="el-analysis"><section class="el-panel"><div class="el-panel-head"><h3 id="elGraphTitle"></h3>${mode === 'ohm' || mode === 'iv' ? `<button type="button" data-lab-action="theory">${state[mode].theory ? '隐藏参考曲线' : '显示参考曲线'}</button>` : ''}</div><div id="elGraph"></div><div id="elGraphNote" class="el-chart-note"></div></section><section class="el-panel"><h3>观察与比较</h3><div id="elObserve"></div></section></div></div></div><section class="el-panel el-records"><div class="el-panel-head"><h3>实验记录 <span id="elRecordCount"></span></h3><div class="el-record-actions"><button type="button" class="primary" data-lab-action="record">＋ 记录本次数据</button><button type="button" data-lab-action="export">导出 CSV</button><button type="button" data-lab-action="clear">清空当前实验记录</button></div></div><p id="elRecordNote" class="el-note" aria-live="polite"></p><div class="el-table-scroll"><table><thead id="elTableHead"></thead><tbody id="elTableBody"></tbody></table></div></section><p class="el-model" id="elModel"></p>`;
    render(); renderTable();
  }
  function measurement() {
    if (mode === 'ohm') return M.ohm(state.ohm);
    if (mode === 'network') return M.network(state.network);
    if (mode === 'iv') return M.iv(state.iv.type, state.iv.closed ? state.iv.voltage : 0);
    return M.induction(state.induction);
  }
  const svg = (content, label) => `<svg class="el-diagram" viewBox="0 0 980 460" role="group" aria-label="${label}">${content}</svg>`;
  function singleCircuit(m) {
    const s = state[mode], isOhm = mode === 'ohm', sourceValue = isOhm ? s.source : s.voltage;
    let drawing = V.wire('M170 170V100H506', m.current) + V.wire('M554 100H720V170', m.current);
    drawing += V.source(170, 230, sourceValue) + V.switchSymbol(340, 100, s.closed, 'toggle', 'S');
    drawing += V.meter(530, 100, 'A', fmt(m.current) + ' A');
    drawing += V.wire('M720 170H880V206M880 254V290H720', 0, '#c5a7ef') + V.meter(880, 230, 'V', fmt(m.voltage, 2) + ' V') + V.node(720, 170) + V.node(720, 290);
    if (isOhm) {
      drawing += '<path d="M720 170V213M720 247V290" stroke="#9bbfcc" stroke-width="3"/><rect x="703" y="213" width="34" height="34" rx="3" fill="#19384b" stroke="#f1c18b" stroke-width="3"/>' + V.text('R = ' + s.resistance + ' Ω', 635, 232, '#f0c58d', 17);
      const sliderX = 315 + 170 * s.rheostat / 120;
      drawing += V.wire('M720 290V390H560V280H' + sliderX + 'V322', m.current);
      drawing += V.wire('M315 340H170V290', m.current);
      drawing += '<rect x="315" y="323" width="170" height="34" rx="5" fill="#1c3f50" stroke="#c9b18b" stroke-width="2"/>' + Array.from({ length: 18 }, (_, i) => '<path d="M' + (319 + i * 9) + ' 325V355" stroke="#778f98"/>').join('');
      drawing += '<g data-rheostat-drag="true" class="el-svg-button" role="slider" tabindex="0" aria-label="拖动滑动变阻器滑片" aria-valuemin="0" aria-valuemax="120" aria-valuenow="' + s.rheostat + '"><rect x="' + (sliderX - 18) + '" y="288" width="36" height="82" rx="5" fill="transparent"/><path d="M' + sliderX + ' 288V322m-7-7 7 7 7-7" stroke="#ffd277" stroke-width="4"/>' + V.text('W', sliderX, 268, '#ffd277', 15) + '</g>' + V.node(315,340) + V.text('A', 295, 374, '#d1dddf', 14) + V.text('B（未接）', 493, 374, '#799aaa', 13) + V.text('A–W 接入电阻 Rp = ' + s.rheostat + ' Ω', 390, 431, '#d8e4d7', 17);
    } else {
      drawing += V.wire('M720 290V370H170V290', m.current);
      if (s.type === 'bulb') drawing += '<path d="M720 170V178M720 282V290" stroke="#96b9c5" stroke-width="3"/><g transform="translate(720 230) rotate(90) translate(-52 -28)">' + V.lamp(m.power, 'iv') + '</g>' + V.text('小灯泡 · ' + M.lampState(m.power).label, 565, 238, '#f1d58b', 17);
      else if (s.type === 'resistor') drawing += V.resistor(720, 230, '', '', true) + V.text('R = 30 Ω', 610, 234, '#f1c18b', 17);
      else drawing += '<g transform="translate(720 230) rotate(90)"><rect x="-48" y="-28" width="96" height="56" fill="#102235"/><path d="M-60 0H-20M20 0H60M-20-22V22L20 0ZM20-24V24" fill="#244553" stroke="#8ddddb" stroke-width="3"/></g>' + V.text('二极管', 610, 234, '#acd7df', 17);
    }
    drawing += V.text(isOhm ? '电流表串联，电压表跨接在 R 两端' : '改变正负电压，观察电流方向与工作点', 480, 40, '#b2d0dc', 17);
    return svg(drawing, isOhm ? '欧姆定律伏安法电路' : '伏安特性测量电路');
  }
  function networkCircuit(m) {
    const s = state.network, parallel = s.topology === 'parallel';
    const load = (x, y, index, power, resistance) => s.load === 'lamp' ? '<g transform="translate(' + (x - 52) + ' ' + (y - 28) + ')">' + V.lamp(power, 'network-' + index) + '</g>' + V.text('L' + index + ' · ' + M.lampState(power).label, x, y + 62, '#f3d489', 15) + V.text(resistance + ' Ω', x, y - 54, '#b8d5dc', 14) : V.resistor(x, y, 'R' + index, resistance + ' Ω');
    let drawing = V.source(155, 250, s.source);
    drawing += V.wire('M155 190V120H256', m.current) + V.meter(280, 120, 'A', 'I = ' + fmt(m.current) + ' A');
    if (parallel) {
      drawing += V.wire('M304 120H385V170', m.current) + V.wire('M840 310V400H155V310', m.current);
      drawing += V.wire('M385 170H561', m.i1, '#7cd8da') + V.wire('M609 170H648M752 170H840V310', m.i1, '#7cd8da');
      drawing += V.wire('M385 170V310H561', m.i2, '#d8b181') + V.wire('M609 310H648M752 310H840', m.i2, '#d8b181');
      drawing += V.switchSymbol(460, 170, s.s1, 's1', 'S₁') + V.switchSymbol(460, 310, s.s2, 's2', 'S₂');
      drawing += V.meter(585, 170, 'A₁', fmt(m.i1) + ' A') + V.meter(585, 310, 'A₂', fmt(m.i2) + ' A');
      drawing += load(700, 170, 1, m.p1, s.r1) + load(700, 310, 2, m.p2, s.r2) + V.node(385, 170) + V.node(840, 310);
    } else {
      drawing += V.wire('M304 120H648M752 120H840V360H752M648 360H155V310', m.current);
      drawing += V.switchSymbol(455, 120, s.s1, 's1', 'S₁') + load(700, 120, 1, m.p1, s.r1);
      drawing += V.switchSymbol(455, 360, s.s2, 's2', 'S₂') + load(700, 360, 2, m.p2, s.r2);
      drawing += V.text('I₁ = ' + fmt(m.i1) + ' A', 520, 230, '#85d7da', 18) + V.text('I₂ = ' + fmt(m.i2) + ' A', 520, 265, '#e0bb83', 18);
    }
    drawing += V.text(parallel ? '两条支路独立控制，共用同一电源' : '只有一条电流路径，任一开关断开即断路', 500, 35, '#b6d4dd', 17);
    return svg(drawing, parallel ? '并联灯泡与独立支路开关' : '串联灯泡与开关');
  }
  function inductionScene() {
    const s = state.induction;
    const coil = Array.from({ length: 11 }, (_, i) => `<ellipse cx="${438 + i * 10}" cy="195" rx="17" ry="76" fill="none" stroke="${i % 2 ? '#d7985e' : '#f4c38d'}" stroke-width="4"/>`).join('');
    let drawing = `<defs><marker id="field-arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#789cab"/></marker></defs>`;
    drawing += `<path d="M438 265V365H710V265H538" stroke="#84ccd4" stroke-width="3" fill="none"/><path id="indCurrentFlow" class="el-flow" d="M438 265V365H710V265H538" stroke="#fff0a1" stroke-width="4" stroke-dasharray="2 23" fill="none"/>`;
    drawing += V.switchSymbol(590, 365, s.closed, 'toggle', 'S');
    drawing += `<g transform="translate(710 315)"><circle r="44" fill="#eff5ee" stroke="#9dc4c9" stroke-width="3"/><path d="M-32-15Q0-53 32-15" fill="none" stroke="#6a8d96" stroke-width="2"/><text x="0" y="-21" fill="#355c68" font-size="15" text-anchor="middle">0</text><text x="-29" y="0" fill="#355c68" font-size="15">−</text><text x="22" y="0" fill="#355c68" font-size="15">+</text><path id="indNeedle" d="M0 15V-25" stroke="#d26a3e" stroke-width="3"/><circle cy="15" r="4" fill="#264c56"/>${V.text('G', 0, 33, '#355c68', 16)}</g>`;
    drawing += `<path d="M120 195H870" stroke="#3d5b70" stroke-dasharray="5 8"/>${Array.from({ length: 7 }, (_, i) => V.text(`${-18 + i * 6}`, 180 + i * 100, 438, '#7fa6b7', 13)).join('')}${V.text('位置 / cm', 880, 438, '#91b4c2', 14)}`;
    drawing += `<g id="indMagnet" class="el-magnet" data-magnet-drag="true" tabindex="0" role="slider" aria-label="可拖动磁铁" aria-valuemin="-18" aria-valuemax="18" aria-valuenow="${s.position}"><g id="indFieldLines" opacity=".65">${[-1, 1].map((sign) => `<path d="M${60 * s.polarity} 0C${130 * s.polarity} ${sign * 125} ${-130 * s.polarity} ${sign * 125} ${-60 * s.polarity} 0" stroke="#789cab" fill="none" stroke-width="1.7" marker-end="url(#field-arrow)"/>`).join('')}</g><rect x="-66" y="-30" width="66" height="60" rx="4" fill="${s.polarity === 1 ? '#487da8' : '#d87060'}"/><rect x="0" y="-30" width="66" height="60" rx="4" fill="${s.polarity === 1 ? '#d87060' : '#487da8'}"/>${V.text(s.polarity === 1 ? 'S' : 'N', -33, 8, '#fff', 27)}${V.text(s.polarity === 1 ? 'N' : 'S', 33, 8, '#fff', 27)}${V.text('拖动磁铁', 0, -45, '#c6dfeb', 14)}</g>`;
    drawing += '<g pointer-events="none">' + coil + '</g>' + V.text(`${s.turns} 匝`, 490, 88, '#e8be91', 18) + V.text('线圈中心 x = 0', 490, 300, '#b4d2dc', 14);
    drawing += `<text id="indFluxLabel" x="490" y="45" fill="#bfdee4" font-size="17" text-anchor="middle"></text><text id="indMotionLabel" x="820" y="70" fill="#f0d19a" font-size="17" text-anchor="middle"></text>`;
    return svg(drawing, '可以拖动磁铁的线圈与检流计装置');
  }
  function meterCard(label, value, unit, note, gaugeMax, bipolar = false) {
    return `<div class="el-meter-card">${gaugeMax ? V.gauge(value, gaugeMax, unit, label, bipolar) : ''}<span>${label}</span><strong>${fmt(value, unit === 'mA' || unit === 'mV' ? 1 : 3)} ${unit}</strong><small>${note}</small></div>`;
  }
  function chart(points, live, { xMax = 12, yMax = 0.6, xMin = 0, yMin = 0, xLabel = 'U / V', yLabel = 'I / A', curve = [] } = {}) {
    const px = (x) => 60 + (x - xMin) / (xMax - xMin) * 425, py = (y) => 240 - (y - yMin) / (yMax - yMin) * 200;
    let content = '';
    for (let i = 0; i <= 4; i++) { const x = xMin + i * (xMax - xMin) / 4, y = yMin + i * (yMax - yMin) / 4; content += `<path d="M${px(x)} 40V240M60 ${py(y)}H485" stroke="#dce6df" stroke-width="1"/><text x="${px(x)}" y="260" font-size="12" fill="#597463" text-anchor="middle">${fmt(x, Math.abs(x) < 1 && x !== 0 ? 2 : 1)}</text><text x="50" y="${py(y) + 4}" font-size="12" fill="#597463" text-anchor="end">${fmt(y, yMax <= 1 ? 2 : 0)}</text>`; }
    const axisX = xMin < 0 && xMax > 0 ? px(0) : 60, axisY = yMin < 0 && yMax > 0 ? py(0) : 240;
    content += `<path d="M${axisX} 30V240M60 ${axisY}H495" fill="none" stroke="#819c8c" stroke-width="1.5"/><text x="${axisX + 5}" y="21" font-size="14" fill="#365f4d">${yLabel}</text><text x="500" y="287" font-size="14" fill="#365f4d" text-anchor="end">${xLabel}</text>`;
    const path = (items) => items.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)} ${py(p.y)}`).join(' ');
    if (curve.length) content += `<path d="${path(curve)}" stroke="#93b2a0" stroke-dasharray="5 4" stroke-width="2" fill="none"/>`;
    if (mode === 'induction' && points.length) content += `<path d="${path(points)}" stroke="#2b9681" stroke-width="2.5" fill="none"/>`;
    else content += points.map((p) => `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="4.5" fill="#2b927a" stroke="#fff" stroke-width="1.5"/>`).join('');
    if (live) content += `<circle cx="${px(live.x)}" cy="${py(live.y)}" r="6" fill="#ec994f" stroke="#fff" stroke-width="2"/>`;
    return `<svg class="el-chart" viewBox="0 0 540 300" role="img" aria-label="${yLabel} 随 ${xLabel} 变化的图表">${content}</svg>`;
  }
  function renderGraphs(m) {
    if (mode === 'ohm') {
      const s = state.ohm, ir = s.task === 'ir';
      const rows = records.ohm.filter((r) => r.config.task === s.task && (ir || r.config.resistance === s.resistance));
      const points = rows.map((r) => ({ x: ir ? r.measurement.resistance : r.measurement.voltage, y: r.measurement.current }));
      const xMax = ir ? 60 : 12, yMax = Math.max(0.2, Math.ceil(Math.max(m.current, ...points.map((p) => p.y)) * 10) / 10);
      const curve = s.theory ? Array.from({ length: 61 }, (_, i) => ({ x: ir ? 5 + i * 55 / 60 : i / 5, y: ir ? 2 / (5 + i * 55 / 60) : i / 5 / s.resistance })) : [];
      $('elGraphTitle').textContent = ir ? 'I–R 图像 · 检查 U 是否相同' : `I–U 图像 · R = ${s.resistance} Ω`;
      $('elGraph').innerHTML = chart(points, { x: ir ? m.resistance : m.voltage, y: m.current }, { xMax, yMax: Math.max(yMax, ...curve.map((p) => p.y)), xLabel: ir ? 'R / Ω' : 'U / V', curve });
      $('elGraphNote').innerHTML = `<span>● 已记录 ${points.length} 点</span><b>● 当前读数</b>${s.theory ? '<span>虚线：参考关系</span>' : ''}`;
      $('elObserve').innerHTML = `<div class="el-law">U = ${fmt(m.voltage, 2)} V<br>I = ${fmt(m.current)} A<br>U / I = ${m.current ? fmt(m.voltage / m.current, 1) : '—'} Ω</div><p class="el-note">${ir ? `目标 U = 2.00 V。当前${Math.abs(m.voltage - 2) < 0.05 ? '已接近目标，可以记录。' : '尚未达到目标，请调节滑片。'}` : '比较同一电阻下的测量点。电压变大时，电流怎样改变？'}</p><p class="el-live-note">${s.closed ? `电源电压 ${fmt(s.source, 1)} V 分配在 R 与 Rp 上；Rp 两端为 ${fmt(m.rheostatVoltage, 2)} V。` : '开关已断开，电流为零。'}</p>`;
    } else if (mode === 'network') {
      const s = state.network;
      $('elGraphTitle').textContent = '各处电流对比';
      const max = Math.max(m.current, m.i1, m.i2, 0.1);
      $('elGraph').innerHTML = `<div class="el-compare">${[['I', m.current, '#338e88'], ['I₁', m.i1, '#58b2c0'], ['I₂', m.i2, '#dba563']].map(([label, value, color]) => `<div class="el-bar-row"><strong>${label}</strong><span class="el-bar"><i style="width:${100 * value / max}%;background:${color}"></i></span><span>${fmt(value)} A</span></div>`).join('')}</div>`;
      $('elGraphNote').textContent = '柱长共用同一标尺；数值是对应导线中的电流。';
      $('elObserve').innerHTML = `<div class="el-law">${s.topology === 'series' ? `I = I₁ = I₂ = ${fmt(m.current)} A` : `I₁ + I₂ = ${fmt(m.i1 + m.i2)} A`}</div><table><thead><tr><th>负载</th><th>两端电压</th><th>功率</th></tr></thead><tbody><tr><td>1</td><td>${fmt(m.v1, 2)} V</td><td>${fmt(m.p1, 2)} W</td></tr><tr><td>2</td><td>${fmt(m.v2, 2)} V</td><td>${fmt(m.p2, 2)} W</td></tr></tbody></table><p class="el-live-note">${s.topology === 'series' ? m.current ? `U₁ + U₂ = ${fmt(m.v1 + m.v2, 2)} V` : '串联回路已断开，两处电流均为零。' : !s.s1 || !s.s2 ? '断开的支路不再有电流；其他闭合支路仍可导通。' : '两个负载跨接在同一对节点上，两端电压相同。'}</p>`;
    } else if (mode === 'iv') {
      const s = state.iv, diode = s.type === 'diode', scale = diode ? 1000 : 1, xmax = diode ? 0.8 : 12;
      const points = records.iv.filter((r) => r.config.type === s.type).map((r) => ({ x: r.measurement.voltage, y: r.measurement.current * scale }));
      const ymax = diode ? 500 : 0.6;
      const curve = s.theory ? Array.from({ length: 161 }, (_, i) => { const x = -xmax + i * xmax / 80; return { x, y: M.iv(s.type, x).current * scale }; }) : [];
      $('elGraphTitle').textContent = `${{ resistor: '定值电阻', bulb: '小灯泡', diode: '二极管' }[s.type]}的 I–U 曲线`;
      $('elGraph').innerHTML = chart(points, { x: m.voltage, y: m.current * scale }, { xMin: -xmax, xMax: xmax, yMin: diode ? -25 : -ymax, yMax: ymax, yLabel: diode ? 'I / mA' : 'I / A', curve });
      $('elGraphNote').innerHTML = `<span>● 本元件记录 ${points.length} 点</span><b>● 当前工作点</b>${s.theory ? '<span>虚线：模型参考曲线</span>' : ''}`;
      $('elObserve').innerHTML = `<div class="el-law">R工作 = ${fmt(m.resistance, 1)} Ω<br>P = ${fmt(m.power, 2)} W</div><p>${s.type === 'bulb' ? `灯泡状态：${M.lampState(m.power).label}。观察电压增大时曲线的斜率变化。` : s.type === 'diode' ? '比较相同大小的正、负电压。反向电流很小，请结合 mA 读数判断。' : '比较不同工作点的 U / I 是否保持不变。'}</p><p class="el-live-note">${scan ? '正在逐点改变电压并采样；点击“停止扫描”可随时结束。' : '橙点随电压移动；只有主动记录或扫描得到的绿色点会留下。'}</p>`;
    } else {
      const xMax = Math.max(12, clock), xMin = Math.max(0, xMax - 12), max = Math.max(100, ...trace.map((p) => Math.abs(p.y)));
      $('elGraphTitle').textContent = '感应电动势随时间变化';
      $('elGraph').innerHTML = chart(trace.filter((p) => p.x >= xMin), { x: clock, y: m.emf * 1000 }, { xMin, xMax, yMin: -max, yMax: max, xLabel: 't / s', yLabel: 'ε / mV' });
      $('elGraphNote').textContent = '最近 12 秒；正负表示线圈所选绕向下的电动势方向。';
      const s = state.induction;
      $('elObserve').innerHTML = `<div class="el-law">ε = −N · ΔΦ / Δt</div><p>每匝磁通量：${fmt(m.flux * 1000, 3)} mWb<br>实际速度：${fmt(s.velocity, 1)} cm/s<br>回路电流：${fmt(m.current * 1000, 2)} mA</p><p class="el-live-note">${!s.velocity ? '磁铁静止，磁通量不变，感应电动势与电流均为零。' : !s.closed ? '回路断开：磁通量仍在变化，有感应电动势，但检流计电流为零。' : Math.abs(m.emf) < 1e-6 ? '经过线圈中心时磁通量达到极值，瞬时变化率为零。' : m.fluxRate > 0 ? '磁通量正在增加，指针向负方向偏转。' : '磁通量正在减小，指针向正方向偏转。'}</p>`;
    }
  }
  function renderReadings(m) {
    const s = state[mode];
    if (mode === 'ohm') {
      $('elMeters').innerHTML = meterCard('电压表', m.voltage, 'V', '跨接在被测电阻两端', 12) + meterCard('电流表', m.current, 'A', '串联在主回路中', (m.current <= 0.6 ? 0.6 : m.current <= 3 ? 3 : 6)) + meterCard('被测电阻', s.resistance, 'Ω', `消耗功率 ${fmt(m.power, 2)} W`);
      $('elStatus').textContent = s.closed ? `通路 · ${s.task === 'iu' ? '保持 R 不变' : '调节到 U = 2.0 V'}` : '开关断开';
      $('elCaption').textContent = '黄色流动点表示约定电流方向，流动快慢示意电流大小；紫色支线为电压表连接。';
      $('elModel').textContent = '教学模型：理想电源、电表、导线与定值电阻；滑动变阻器与被测电阻串联。U 指被测电阻两端电压。';
    } else if (mode === 'network') {
      $('elMeters').innerHTML = meterCard('干路电流 I', m.current, 'A', '电源输出电流', (m.current <= 0.6 ? 0.6 : m.current <= 3 ? 3 : 6)) + meterCard('负载 1 电流 I₁', m.i1, 'A', `U₁ = ${fmt(m.v1, 2)} V`) + meterCard('负载 2 电流 I₂', m.i2, 'A', `U₂ = ${fmt(m.v2, 2)} V`);
      $('elStatus').textContent = `${s.topology === 'series' ? '串联' : '并联'} · ${m.current ? '有电流' : '无电流'}`;
      $('elCaption').textContent = '● 实心点表示导线相连；S₁、S₂ 可直接点击。灯泡光晕和亮度由各自的功率决定。';
      $('elModel').textContent = '教学模型：理想电源与电表。此处灯泡以所设定值电阻近似，便于定量比较串并联功率；灯丝温升特性请进入“伏安特性”。';
    } else if (mode === 'iv') {
      const scale = s.type === 'diode' ? 1000 : 1;
      $('elMeters').innerHTML = meterCard('元件电压 U', m.voltage, 'V', '负值表示电源极性反向', s.type === 'diode' ? 0.8 : 12, true) + meterCard('元件电流 I', m.current * scale, s.type === 'diode' ? 'mA' : 'A', '正值表示从图中上端流入', s.type === 'diode' ? 500 : 0.6, true) + meterCard('消耗功率', m.power, 'W', s.type === 'bulb' ? `灯泡 ${M.lampState(m.power).label}` : `R工作 = ${fmt(m.resistance, 1)} Ω`);
      $('elStatus').textContent = s.closed ? s.voltage < 0 ? '反向电压' : '正向电压' : '开关断开';
      $('elCaption').textContent = '电流方向随电压极性改变；灯泡的光晕、亮度与工作点同步变化。';
      $('elModel').textContent = '教学近似：定值电阻 30 Ω；灯泡采用 U = 10I + 80I³ 的稳态温升近似；二极管采用指数伏安关系，未模拟反向击穿。参考曲线可按需显示。';
    } else {
      $('elMeters').innerHTML = meterCard('感应电动势 ε', m.emf * 1000, 'mV', '由磁通量的变化率决定', 200, true) + meterCard('检流计电流', m.current * 1000, 'mA', '回路总电阻 20 Ω', 10, true) + meterCard('每匝磁通量 Φ', m.flux * 1000, 'mWb', `线圈 ${s.turns} 匝`);
      $('elStatus').textContent = s.velocity ? `${s.velocity > 0 ? '向右' : '向左'}移动 · ${fmt(Math.abs(s.velocity), 1)} cm/s` : '磁铁静止 · 指针归零';
      $('elCaption').textContent = '绕向约定使磁通量增加时 ε 为负；正电流流入检流计正接线柱。示意指针超过标尺时限幅，数值仍完整显示。';
      $('elModel').textContent = '空间磁通量采用高斯近似，Φ = ±BA·exp(−x²/2σ²)，A = 20 cm²、σ = 6 cm；ε = −N(dΦ/dx)v。仅计算磁铁移动引起的感应，忽略线圈自感与运动反作用。';
    }
  }
  function updateInductionScene(m) {
    const s = state.induction;
    $('indMagnet').setAttribute('transform', `translate(${480 + s.position * (100 / 6)} 195)`);
    $('indMagnet').setAttribute('aria-valuenow', fmt(s.position, 1));
    $('indNeedle').setAttribute('transform', `rotate(${Math.max(-60, Math.min(60, m.current / 0.01 * 60))} 0 15)`);
    $('indFluxLabel').textContent = `每匝磁通量 Φ = ${fmt(m.flux * 1000, 3)} mWb`;
    $('indMotionLabel').textContent = s.velocity ? `${s.velocity > 0 ? '→' : '←'} ${fmt(Math.abs(s.velocity), 1)} cm/s` : '静止';
    $('indCurrentFlow').style.opacity = Math.abs(m.current) > 1e-8 ? '1' : '0';
    $('indCurrentFlow').style.animationDirection = m.current < 0 ? 'reverse' : 'normal';
  }
  function render() {
    const m = measurement();
    $('elScene').innerHTML = mode === 'induction' ? inductionScene() : mode === 'network' ? networkCircuit(m) : singleCircuit(m);
    if (mode === 'induction') updateInductionScene(m);
    renderReadings(m); renderGraphs(m);
  }
  function record() {
    const list = records[mode]; if (list.length >= 150) { $('elRecordNote').textContent = '已达到 150 组，请导出或清空当前实验记录。'; return; }
    list.push({ config: { ...state[mode] }, measurement: measurement(), time: clock });
    renderTable(); renderGraphs(measurement()); $('elRecordNote').textContent = `已记录第 ${list.length} 组。${mode === 'ohm' && state.ohm.task === 'ir' && Math.abs(measurement().voltage - 2) > 0.05 ? '本组 U 未达到 2.0 V，比较时注意控制变量。' : ''}`;
  }
  function rows() {
    return records[mode].map(({ config: s, measurement: m, time }, i) => {
      if (mode === 'ohm') return [i + 1, s.task === 'iu' ? 'I–U' : 'I–R', fmt(m.voltage), fmt(m.current), s.resistance, s.rheostat, s.closed ? '闭合' : '断开'];
      if (mode === 'network') return [i + 1, s.topology === 'series' ? '串联' : '并联', s.source, s.r1, s.r2, fmt(m.current), fmt(m.i1), fmt(m.i2), fmt(m.v1), fmt(m.v2), `${s.s1 ? '闭' : '开'} / ${s.s2 ? '闭' : '开'}`];
      if (mode === 'iv') return [i + 1, { bulb: '小灯泡', resistor: '定值电阻', diode: '二极管' }[s.type], fmt(m.voltage), fmt(m.current, 6), fmt(m.resistance, 1), fmt(m.power), s.closed ? '闭合' : '断开'];
      return [i + 1, fmt(time, 1), fmt(s.position, 1), fmt(s.velocity, 1), s.turns, s.field, s.polarity > 0 ? 'N 向右' : 'S 向右', fmt(m.flux * 1000), fmt(m.emf * 1000), fmt(m.current * 1000)];
    });
  }
  function headings() { return { ohm: ['组次', '任务', 'U / V', 'I / A', 'R / Ω', 'Rp / Ω', '开关'], network: ['组次', '连接', '电源 / V', 'R₁ / Ω', 'R₂ / Ω', 'I / A', 'I₁ / A', 'I₂ / A', 'U₁ / V', 'U₂ / V', 'S₁ / S₂'], iv: ['组次', '元件', 'U / V', 'I / A', 'R工作 / Ω', 'P / W', '开关'], induction: ['组次', 't / s', 'x / cm', 'v / cm·s⁻¹', 'N / 匝', 'B / T', '磁极', 'Φ / mWb', 'ε / mV', 'I / mA'] }[mode]; }
  function renderTable() { const data = rows(); $('elTableHead').innerHTML = `<tr>${headings().map((label) => `<th>${label}</th>`).join('')}</tr>`; $('elTableBody').innerHTML = data.length ? data.map((r) => `<tr>${r.map((value) => `<td>${escape(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headings().length}">尚未记录。改变一个条件，点击“记录本次数据”。</td></tr>`; $('elRecordCount').textContent = `· ${data.length} 组`; }
  function exportData() { const csv = [headings(), ...rows()].map((r) => r.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'); const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${titles[mode][0]}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function action(name) {
    const s = state[mode];
    if (name === 'record') { record(); return; }
    if (name === 'export') { exportData(); return; }
    if (name === 'clear') { records[mode] = []; if (mode === 'induction') trace.length = 0; renderTable(); renderGraphs(measurement()); return; }
    if (name === 'toggle') { s.closed = !s.closed; scan = null; }
    if (name === 'theory') s.theory = !s.theory;
    if (name === 'series' || name === 'parallel') s.topology = name;
    if (name === 's1' || name === 's2') s[name] = !s[name];
    if (name === 'polarity') { s.polarity *= -1; }
    if (name === 'left' || name === 'right') { interaction = null; s.moving = name === 'left' ? -1 : 1; s.velocity = s.moving * s.speed; }
    if (name === 'stop') { interaction = null; s.moving = 0; s.velocity = 0; }
    if (name === 'reset-position') { interaction = null; s.position = -14; s.moving = 0; s.velocity = 0; trace.length = 0; clock = 0; }
    if (name === 'scan') { scan = scan ? null : { index: 0, last: 0 }; }
    mount();
  }
  root.addEventListener('click', (event) => { const name = event.target.closest('[data-lab-action]')?.dataset.labAction; if (name) action(name); });
  root.addEventListener('input', (event) => {
    const key = event.target.dataset.param; if (!key || event.target.tagName === 'SELECT') return;
    const s = state[mode], value = Number(event.target.value); if (!Number.isFinite(value)) return;
    if (mode === 'induction' && key === 'position') { s.moving = 0; const now = performance.now(); s.velocity = Math.max(-20, Math.min(20, (value - s.position) / Math.max(0.016, (now - (interaction?.last || now - 50)) / 1000))); interaction = { type: 'position', last: now }; }
    s[key] = value;
    if (mode === 'iv') { scan = null; root.querySelector('[data-lab-action="scan"]').textContent = '自动扫描并记录'; }
    if (mode === 'induction' && key === 'speed' && s.moving) s.velocity = s.moving * s.speed;
    const out = $(`out-${key}`); if (out) out.textContent = `${fmt(value, key === 'field' || key === 'voltage' && s.type === 'diode' ? 2 : ['position', 'voltage', 'source', 'speed'].includes(key) ? 1 : 0)} ${out.textContent.split(' ').at(-1)}`;
    render();
  });
  root.addEventListener('change', (event) => {
    const key = event.target.dataset.param; if (!key) return;
    if (event.target.tagName === 'SELECT') { state[mode][key] = event.target.value; scan = null; if (mode === 'iv') state.iv.voltage = state.iv.type === 'diode' ? 0.6 : 6; mount(); }
    if (mode === 'induction' && key === 'position') { state.induction.velocity = 0; interaction = null; render(); }
  });
  function scenePoint(event) { const scene = $('elScene').querySelector('svg'), rect = scene.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 980, y: (event.clientY - rect.top) / rect.height * 460 }; }
  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('[data-magnet-drag]')) { event.preventDefault(); state.induction.moving = 0; interaction = { type: 'magnet', pointer: event.pointerId, last: performance.now() }; root.setPointerCapture(event.pointerId); }
    if (event.target.closest('[data-rheostat-drag]')) { event.preventDefault(); interaction = { type: 'rheostat', pointer: event.pointerId }; root.setPointerCapture(event.pointerId); }
  });
  root.addEventListener('pointermove', (event) => {
    if (!interaction || interaction.pointer !== event.pointerId) return;
    const p = scenePoint(event);
    if (interaction.type === 'rheostat') { const s = state.ohm; s.rheostat = Math.round(Math.max(0, Math.min(120, (p.x - 315) / 170 * 120))); $('el-rheostat').value = s.rheostat; $('out-rheostat').textContent = `${s.rheostat} Ω`; render(); }
    if (interaction.type === 'magnet') { const s = state.induction, now = performance.now(), next = Math.max(-18, Math.min(18, (p.x - 480) * 6 / 100)); s.velocity = Math.max(-20, Math.min(20, (next - s.position) / Math.max(0.016, (now - interaction.last) / 1000))); s.position = next; interaction.last = now; $('el-position').value = next; $('out-position').textContent = `${fmt(next, 1)} cm`; updateInductionScene(measurement()); }
  });
  function release(event) { if (!interaction || interaction.pointer !== event.pointerId) return; interaction = null; if (mode === 'induction') { state.induction.velocity = 0; render(); } }
  root.addEventListener('pointerup', release); root.addEventListener('pointercancel', release);
  root.addEventListener('keydown', (event) => {
    const button = event.target.closest('g[data-lab-action]'); if (button && ['Enter', ' '].includes(event.key)) { event.preventDefault(); action(button.dataset.labAction); }
    if (event.target.closest('[data-rheostat-drag]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); state.ohm.rheostat = Math.max(0, Math.min(120, state.ohm.rheostat + (event.key === 'ArrowLeft' ? -1 : 1))); mount(); root.querySelector('[data-rheostat-drag]')?.focus(); }
    if (event.target.closest('[data-magnet-drag]') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const s = state.induction; s.moving = 0; s.position = Math.max(-18, Math.min(18, s.position + (event.key === 'ArrowLeft' ? -0.5 : 0.5))); s.velocity = event.key === 'ArrowLeft' ? -5 : 5; interaction = { type: 'position', last: performance.now() }; $('el-position').value = s.position; $('out-position').textContent = `${fmt(s.position, 1)} cm`; updateInductionScene(measurement()); }
  });
  function stopMotion() { state.induction.velocity = 0; state.induction.moving = 0; interaction = null; scan = null; }
  document.querySelectorAll('.tab[data-mode]').forEach((tab) => tab.addEventListener('click', () => { stopMotion(); mode = tab.dataset.mode; mount(); $('formula').textContent = { ohm: 'I = U / R', network: '观察分流与分压', iv: '逐点测出 I–U 曲线', induction: 'ε = −N · ΔΦ / Δt' }[mode]; }));
  $('builderTab').addEventListener('click', stopMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMotion(); });
  window.addEventListener('message', (event) => { if (event.origin === location.origin && event.source === parent && event.data?.type === 'gewulab:active') { classroomActive = event.data.active === true; if (!classroomActive) stopMotion(); } });
  function animate(time) {
    const dt = Math.min(0.05, (time - (previousTime || time)) / 1000); previousTime = time;
    if (!root.hidden && !document.hidden && classroomActive) {
      if (mode === 'induction') {
        clock += dt; traceClock += dt; const s = state.induction;
        if (s.moving) { s.velocity = s.moving * s.speed; s.position += s.velocity * dt; if (Math.abs(s.position) >= 18) { s.position = Math.sign(s.position) * 18; s.velocity = 0; s.moving = 0; } }
        if (interaction && time - interaction.last > 120) s.velocity = 0;
        const m = measurement(); updateInductionScene(m);
        if (traceClock >= 0.1) { traceClock = 0; trace.push({ x: clock, y: m.emf * 1000 }); if (trace.length > 140) trace.shift(); $('el-position').value = s.position; $('out-position').textContent = `${fmt(s.position, 1)} cm`; renderReadings(m); renderGraphs(m); }
      }
      if (mode === 'iv' && scan && time - scan.last > 180) { scan.last = time; const limit = state.iv.type === 'diode' ? 0.8 : 12; state.iv.voltage = Number((-limit + scan.index * limit / 20).toFixed(3)); $('el-voltage').value = state.iv.voltage; $('out-voltage').textContent = `${fmt(state.iv.voltage, 2)} V`; render(); record(); scan.index++; if (scan.index > 40) { scan = null; $('elControls').innerHTML = controls(); renderGraphs(measurement()); } }
    }
    requestAnimationFrame(animate);
  }
  mount(); requestAnimationFrame(animate);
})();
