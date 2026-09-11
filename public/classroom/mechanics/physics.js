(() => {
  'use strict';
  const SCALE = 150, RADIUS = 28, TAU = Math.PI * 2;
  const TYPES = {
    lever: { name: '杠杆', symbol: '─△─', prefix: 'L', mass: 0 },
    fixed: { name: '定滑轮', symbol: '⊙', prefix: 'P', mass: 0 },
    moving: { name: '动滑轮', symbol: '↕', prefix: 'M', mass: 0 },
    beam: { name: '连接横梁', symbol: '┬─┬', prefix: 'B', mass: 0 },
    weight: { name: '钩码', symbol: 'kg', prefix: 'G', mass: 1 },
    scale: { name: '测力计 / 拉绳端', symbol: 'N', prefix: 'F', mass: 0 },
    anchor: { name: '固定绳端', symbol: '⊥', prefix: 'A', mass: 0 },
  };
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const mod = (a) => (a % TAU + TAU) % TAU;
  const length = (p) => Math.hypot(p.x, p.y);
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const unit = (v) => { const d = length(v); return { x: v.x / (d || 1), y: v.y / (d || 1) }; };
  const num = (n) => Number(n.toFixed(3));
  function component(type, id, x, y, ordinal = 1) {
    return { id, type, label: `${TYPES[type].prefix}${ordinal}`, x, y, mass: TYPES[type].mass, angle: 0, pivot: 0, wrap: type === 'moving' ? 'bottom' : 'top', range: 50 };
  }
  function ports(p) {
    if (p.type === 'lever') return Array.from({ length: 11 }, (_, i) => `s${i - 5}`);
    if (p.type === 'beam') return ['s-2', 's-1', 's0', 's1', 's2'];
    if (p.type === 'fixed' || p.type === 'moving') return ['wheel', 'hook'];
    return ['hook'];
  }
  function endpoint(p, port) {
    if (p.type === 'lever') { const offset = (Number(port.slice(1)) - p.pivot) * 30; return { x: p.x + offset * Math.cos(p.angle), y: p.y + offset * Math.sin(p.angle) }; }
    if (p.type === 'beam') return { x: p.x + Number(port.slice(1)) * 28, y: p.y };
    if (port === 'wheel') return { x: p.x, y: p.y, r: RADIUS, wrap: p.wrap };
    return { x: p.x, y: p.y + (p.type === 'weight' ? -24 : p.type === 'scale' ? -50 : p.type === 'fixed' || p.type === 'moving' ? 42 : 0) };
  }
  function positions(scene) {
    const source = new Map(scene.parts.map((p) => [p.id, p])), links = new Map(scene.links.map((l) => [l.child, l])), placed = new Map(), visiting = new Set();
    function place(id) {
      if (placed.has(id)) return placed.get(id);
      if (visiting.has(id) || !source.has(id)) throw new Error('挂接关系形成循环或元件不存在');
      visiting.add(id); const p = { ...source.get(id) }, link = links.get(id);
      if (link) { const [parent, port] = link.parent.split(':'), target = endpoint(place(parent), port); p.x = target.x + link.dx; p.y = target.y + link.dy; }
      visiting.delete(id); placed.set(id, p); return p;
    }
    scene.parts.forEach((p) => place(p.id)); return placed;
  }
  function point(scenePositions, key) { const [id, port] = key.split(':'); const p = scenePositions.get(id); if (!p || !ports(p).includes(port)) throw new Error('接点不存在'); return endpoint(p, port); }
  function tangentCandidates(a, b) {
    const delta = sub(b, a), d = length(delta), r1 = a.r || 0, r2 = b.r || 0;
    if (d < r1 + r2 + 2) return [];
    if (!r1 && !r2) return [{ a, b, direction: unit(delta), length: d }];
    const u = unit(delta), found = new Map();
    for (const side of [1, -1]) for (const sign of [1, -1]) {
      const k = (r1 - side * r2) / d;
      if (Math.abs(k) >= 1) continue;
      const h = Math.sqrt(1 - k * k) * sign, normal = { x: u.x * k - u.y * h, y: u.y * k + u.x * h };
      const p = { x: a.x + r1 * normal.x, y: a.y + r1 * normal.y }, q = { x: b.x + side * r2 * normal.x, y: b.y + side * r2 * normal.y };
      found.set([p.x, p.y, q.x, q.y].map(num).join(','), { a: p, b: q, direction: unit(sub(q, p)), length: length(sub(q, p)) });
    }
    return [...found.values()];
  }
  function arcJoin(center, incoming, outgoing) {
    const a = sub(incoming.b, center), b = sub(outgoing.a, center), turn = Math.sign(cross(a, incoming.direction));
    if (!turn || turn !== Math.sign(cross(b, outgoing.direction))) return null;
    const start = Math.atan2(a.y, a.x), end = Math.atan2(b.y, b.x), angle = mod((end - start) * turn);
    const desired = center.wrap === 'bottom' ? Math.PI / 2 : Math.PI * 1.5;
    if (angle < .02 || angle > Math.PI * 1.95 || center.wrap !== 'auto' && mod((desired - start) * turn) > angle + 1e-7) return null;
    return { center, from: incoming.b, to: outgoing.a, angle, sweep: turn > 0 ? 1 : 0, length: center.r * angle };
  }
  function ropeGeometry(scenePositions, rope, { autoWrap = false, wraps = {} } = {}) {
    const nodes = rope.nodes.map((key) => { const p = point(scenePositions, key); return p.r ? { ...p, wrap: wraps[key] || (autoWrap ? 'auto' : p.wrap) } : p; });
    if (nodes.length < 2 || nodes[0].r || nodes.at(-1).r || nodes.slice(1, -1).some((p) => !p.r)) throw new Error('绳索需从挂点开始，经滑轮轮槽，到另一个挂点结束');
    const candidates = nodes.slice(1).map((p, i) => tangentCandidates(nodes[i], p));
    if (candidates.some((list) => !list.length)) throw new Error('绳端离滑轮过近或滑轮重叠，请拉开距离');
    let states = candidates[0].map((line) => ({ cost: line.length, lines: [line], arcs: [] }));
    for (let i = 1; i < candidates.length; i++) {
      const next = [];
      for (const line of candidates[i]) {
        let best = null;
        for (const state of states) { const arc = arcJoin(nodes[i], state.lines.at(-1), line); if (!arc) continue; const cost = state.cost + line.length + arc.length; if (!best || cost < best.cost) best = { cost, lines: [...state.lines, line], arcs: [...state.arcs, arc] }; }
        if (best) next.push(best);
      }
      states = next;
    }
    const best = states.sort((a, b) => a.cost - b.cost)[0];
    if (!best) throw new Error('此穿绳方向不能贴合轮槽，请改变滑轮绕行侧或元件位置');
    let d = `M${num(best.lines[0].a.x)} ${num(best.lines[0].a.y)}`;
    best.lines.forEach((line, i) => { d += ` L${num(line.b.x)} ${num(line.b.y)}`; const arc = best.arcs[i]; if (arc) d += ` A${arc.center.r} ${arc.center.r} 0 ${arc.angle > Math.PI ? 1 : 0} ${arc.sweep} ${num(arc.to.x)} ${num(arc.to.y)}`; });
    const resolvedWraps = best.arcs.map((arc) => {
      const start = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x), turn = arc.sweep ? 1 : -1;
      return mod((Math.PI * 1.5 - start) * turn) <= arc.angle + 1e-7 ? 'top' : 'bottom';
    });
    return { length: best.cost, lines: best.lines, arcs: best.arcs, wraps: resolvedWraps, d };
  }
  function variables(scene) {
    const attached = new Set(scene.links.map((l) => l.child));
    const connected = new Set(scene.ropes.flatMap((r) => r.nodes.map((key) => key.split(':')[0])));
    return scene.parts.filter((p) => !attached.has(p.id) && ['lever', 'moving', 'beam', 'weight'].includes(p.type) && (p.type !== 'weight' || connected.has(p.id))).map((p) => ({ id: p.id, key: p.type === 'lever' ? 'angle' : 'y', step: p.type === 'lever' ? 1e-5 : 1e-3 }));
  }
  function differentiate(scene, variable, fn) {
    const a = clone(scene), b = clone(scene); a.parts.find((p) => p.id === variable.id)[variable.key] -= variable.step; b.parts.find((p) => p.id === variable.id)[variable.key] += variable.step;
    const left = fn(a), right = fn(b); return right.map((value, i) => (value - left[i]) / (2 * variable.step));
  }
  function gravity(scene, posed) {
    return scene.parts.reduce((sum, p) => { const q = posed.get(p.id); const y = q.type === 'lever' ? q.y - q.pivot * 30 * Math.sin(q.angle) : q.y; return sum + p.mass * scene.g * y; }, 0);
  }
  function leverAutoAngle(scene, id, limit = Math.PI / 12) {
    const lever = scene.parts.find((p) => p.id === id && p.type === 'lever'); if (!lever) return null;
    const members = new Set([id]); let changed = true;
    while (changed) { changed = false; for (const link of scene.links) if (members.has(link.parent.split(':')[0]) && !members.has(link.child)) { members.add(link.child); changed = true; } }
    // A rope-coupled lever is governed by the complete rope constraint solver;
    // forcing a display angle here would contradict that solution.
    if (scene.ropes.some((rope) => rope.nodes.some((key) => members.has(key.split(':')[0])))) return null;
    const horizontal = clone(scene), testLever = horizontal.parts.find((p) => p.id === id); testLever.angle = 0;
    const moment = differentiate(horizontal, { id, key: 'angle', step: 1e-5 }, (s) => [gravity(s, positions(s))])[0] / SCALE;
    return Math.abs(moment) < .01 ? 0 : Math.sign(moment) * Math.abs(limit);
  }
  function linearSolve(matrix, rhs, columns) {
    const rows = matrix.map((row, i) => [...row, rhs[i]]), pivots = []; let next = 0;
    for (let col = 0; col < columns; col++) {
      let best = next;
      for (let i = next; i < rows.length; i++) if (Math.abs(rows[i][col]) > Math.abs(rows[best]?.[col] || 0)) best = i;
      if (!rows[best] || Math.abs(rows[best][col]) < 1e-7) continue;
      [rows[next], rows[best]] = [rows[best], rows[next]];
      const pivot = rows[next][col]; for (let j = col; j <= columns; j++) rows[next][j] /= pivot;
      for (let i = 0; i < rows.length; i++) if (i !== next) { const factor = rows[i][col]; for (let j = col; j <= columns; j++) rows[i][j] -= factor * rows[next][j]; }
      pivots.push(col); next++;
    }
    const inconsistent = rows.some((row) => row.slice(0, columns).every((v) => Math.abs(v) < 1e-6) && Math.abs(row[columns]) > 1e-4);
    const values = Array(columns).fill(0); pivots.forEach((col, i) => { values[col] = rows[i][columns]; });
    return { values, rank: pivots.length, unique: pivots.length === columns, inconsistent };
  }
  function validate(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.parts) || !Array.isArray(raw.ropes) || !Array.isArray(raw.links) || raw.parts.length > 40 || raw.ropes.length > 30 || raw.links.length > 40 || ![9.8, 9.81, 10].includes(raw.g)) throw new Error('装置文件格式不正确或超出容量');
    const ids = new Set(), safe = { version: 1, g: raw.g, parts: [], ropes: [], links: [] };
    const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,50}$/.test(value);
    const finite = (value, lo, hi) => Number.isFinite(value) && value >= lo && value <= hi;
    for (const p of raw.parts) {
      if (!p || !Object.hasOwn(TYPES, p.type) || !id(p.id) || ids.has(p.id) || !finite(p.x, -500, 1500) || !finite(p.y, -500, 1500) || !finite(p.mass, 0, 20) || !finite(p.angle, -.7, .7) || !Number.isInteger(p.pivot) || Math.abs(p.pivot) > 4 || !['top', 'bottom'].includes(p.wrap) || ![5, 10, 50, 100, 500].includes(p.range) || typeof p.label !== 'string' || p.label.length > 20) throw new Error('元件参数不正确');
      ids.add(p.id); safe.parts.push(Object.fromEntries(['id', 'type', 'label', 'x', 'y', 'mass', 'angle', 'pivot', 'wrap', 'range'].map((k) => [k, p[k]])));
    }
    const known = (key) => { if (typeof key !== 'string') return false; const [part, port, rest] = key.split(':'); const p = safe.parts.find((q) => q.id === part); return !rest && p && ports(p).includes(port); };
    const ropeIds = new Set(), occupiedWheels = new Set();
    for (const r of raw.ropes) {
      if (!id(r.id) || ropeIds.has(r.id) || !Array.isArray(r.nodes) || r.nodes.length < 2 || r.nodes.length > 14 || new Set(r.nodes).size !== r.nodes.length || !r.nodes.every(known) || r.nodes[0].endsWith(':wheel') || r.nodes.at(-1).endsWith(':wheel') || r.nodes.slice(1, -1).some((k) => !k.endsWith(':wheel'))) throw new Error('绳索连接不正确');
      for (const key of r.nodes.slice(1, -1)) { if (occupiedWheels.has(key)) throw new Error('同一个轮槽不能同时穿两根绳'); occupiedWheels.add(key); }
      ropeIds.add(r.id); safe.ropes.push({ id: r.id, nodes: [...r.nodes] });
    }
    const children = new Set();
    for (const l of raw.links) {
      const child = safe.parts.find((p) => p.id === l.child), parent = safe.parts.find((p) => p.id === l.parent?.split(':')[0]);
      if (!child || !parent || children.has(l.child) || !known(l.parent) || l.parent.endsWith(':wheel') || !['weight', 'fixed', 'moving', 'beam'].includes(child.type) || !['lever', 'moving', 'beam'].includes(parent.type) || !finite(l.dx, -500, 500) || !finite(l.dy, -500, 500)) throw new Error('挂接关系不正确');
      children.add(l.child); safe.links.push({ child: l.child, parent: l.parent, dx: l.dx, dy: l.dy });
    }
    positions(safe); return safe;
  }
  function analyze(input) {
    const scene = validate(input), posed = positions(scene), issues = [], vars = variables(scene);
    const geometries = scene.ropes.map((r) => { try { return ropeGeometry(posed, r); } catch (e) { issues.push(e.message); return null; } });
    if (issues.length) return { valid: false, status: 'geometry', issues, posed, geometries, tensions: {}, meters: [], levers: [] };
    const lengths = (s) => { const p = positions(s); return s.ropes.map((r) => ropeGeometry(p, r).length); };
    let jacobian, forces;
    try { jacobian = vars.map((v) => differentiate(scene, v, lengths)); forces = vars.map((v) => differentiate(scene, v, (s) => [gravity(s, positions(s))])[0]); }
    catch { return { valid: false, status: 'geometry', issues: ['元件过近，暂时无法测量，请拉开距离'], posed, geometries, tensions: {}, meters: [], levers: [] }; }
    const solution = linearSolve(jacobian, forces, scene.ropes.length);
    let status = 'balanced';
    if (solution.inconsistent) { status = 'unbalanced'; issues.push('装置不能保持静止：检查钩码、挂接点和绳索，或调整杠杆两侧力矩。'); }
    else if (!solution.unique) { status = 'indeterminate'; issues.push('存在未加载或重复约束的绳索，张力不能唯一确定，请简化连接或接入负载。'); }
    else if (solution.values.some((v) => v < -1e-4)) { status = 'slack'; issues.push('此接法需要绳索向外推，实际绳索会松弛；请改换作用点或穿绳方向。'); }
    const valid = status === 'balanced', tensions = Object.fromEntries(scene.ropes.map((r, i) => [r.id, valid ? Math.max(0, solution.values[i]) : null]));
    const meters = scene.parts.filter((p) => p.type === 'scale').map((p) => {
      const connected = scene.ropes.map((r, i) => ({ r, i })).filter(({ r }) => r.nodes[0] === `${p.id}:hook` || r.nodes.at(-1) === `${p.id}:hook`);
      if (connected.length !== 1) return { id: p.id, tension: null, forceY: null, issue: connected.length ? '测力计只能接一根绳端' : '未接入绳索' };
      const { r, i } = connected[0], line = r.nodes[0] === `${p.id}:hook` ? geometries[i].lines[0] : geometries[i].lines.at(-1);
      const sign = r.nodes[0] === `${p.id}:hook` ? 1 : -1, tension = tensions[r.id];
      return { id: p.id, tension, forceX: tension === null ? null : -line.direction.x * sign * tension, forceY: tension === null ? null : -line.direction.y * sign * tension, angle: Math.atan2(Math.abs(line.direction.x), Math.abs(line.direction.y)) * 180 / Math.PI, overload: tension > p.range, tilted: Math.abs(line.direction.x) > .02 };
    });
    const supports = [];
    scene.ropes.forEach((rope, ri) => rope.nodes.slice(1, -1).forEach((key, i) => {
      const c = posed.get(key.split(':')[0]); if (c.type !== 'moving') return;
      const tension = tensions[rope.id], lines = geometries[ri].lines;
      const sides = [[lines[i], -1], [lines[i + 1], 1]].map(([line, sign]) => {
        const direction = { x: line.direction.x * sign, y: line.direction.y * sign };
        return { at: sign < 0 ? line.b : line.a, direction, angle: Math.atan2(Math.abs(direction.x), -direction.y) * 180 / Math.PI, forceX: tension === null ? null : tension * direction.x, forceUp: tension === null ? null : -tension * direction.y };
      });
      supports.push({ id: c.id, ropeId: rope.id, tension, sides, forceX: tension === null ? null : sides[0].forceX + sides[1].forceX, forceUp: tension === null ? null : sides[0].forceUp + sides[1].forceUp });
    }));
    const levers = vars.filter((v) => v.key === 'angle').map((v) => {
      const i = vars.indexOf(v), ropeMoment = valid ? jacobian[i].reduce((sum, a, j) => sum - a * solution.values[j], 0) / SCALE : null, gravityMoment = forces[i] / SCALE;
      const moments = differentiate(scene, v, (s) => { const positionsNow = positions(s); return s.parts.map((p) => { const q = positionsNow.get(p.id); return p.mass * s.g * (q.y - (q.type === 'lever' ? q.pivot * 30 * Math.sin(q.angle) : 0)); }); }).map((n) => n / SCALE);
      return { id: v.id, gravityMoment, ropeMoment, clockwise: moments.reduce((s, n) => s + Math.max(0, n), 0), counterclockwise: moments.reduce((s, n) => s - Math.min(0, n), 0), netMoment: valid ? gravityMoment + ropeMoment : scene.ropes.length ? null : gravityMoment, balanced: valid };
    });
    return { valid, status, issues, posed, geometries, tensions, meters, supports, levers, vars, jacobian, forces };
  }
  function pull(base, driverId, displacement) {
    const scene = clone(base), driver = scene.parts.find((p) => p.id === driverId);
    if (!driver || driver.type !== 'scale' || !Number.isFinite(displacement) || Math.abs(displacement) > 150) return { ok: false, issue: '请选择一个测力计，移动范围为 ±1 m' };
    const initial = analyze(base); if (!initial.valid) return { ok: false, issue: '请先完成能平衡的连接，再试拉' };
    const vars = variables(scene), target = initial.geometries.map((g) => g.length), baseY = driver.y;
    const meter = initial.meters.find((m) => m.id === driverId);
    if (!meter || meter.issue) return { ok: false, issue: meter?.issue || '测力计尚未接绳' };
    const distances = Math.max(1, Math.ceil(Math.abs(displacement) / 4));
    for (let step = 1; step <= distances; step++) {
      driver.y = baseY + displacement * step / distances;
      let converged = false;
      for (let iteration = 0; iteration < 12; iteration++) {
        let g, derivatives;
        try { g = scene.ropes.map((r) => ropeGeometry(positions(scene), r).length); derivatives = vars.map((v) => differentiate(scene, v, (s) => s.ropes.map((r) => ropeGeometry(positions(s), r).length))); } catch { break; }
        const residual = target.map((v, i) => v - g[i]);
        if (residual.every((v) => Math.abs(v) < 1e-5)) { converged = true; break; }
        const matrix = residual.map((_, i) => vars.map((v, j) => derivatives[j][i])), solution = linearSolve(matrix, residual, vars.length);
        if (solution.inconsistent) break;
        // A rope coupling two independent free bodies determines only their sum.
        // Do not invent a split of the motion for these unconstrained mechanisms.
        const active = vars.map((_, j) => matrix.some((row) => Math.abs(row[j]) > 1e-7)).filter(Boolean).length;
        if (solution.rank < active) return { ok: false, issue: '运动分配不能唯一确定，请固定一个运动部件或用横梁连接成一体' };
        vars.forEach((v, i) => { scene.parts.find((p) => p.id === v.id)[v.key] += Math.max(v.key === 'angle' ? -.1 : -15, Math.min(v.key === 'angle' ? .1 : 15, solution.values[i])); });
      }
      if (!converged) return { ok: false, issue: '装置被约束或穿绳方向到达极限，不能继续拉动' };
      const p = positions(scene);
      if ([...p.values()].some((c) => c.x < 35 || c.x > 965 || c.y < 60 || c.y > (c.type === 'scale' ? 565 : c.type === 'weight' ? 580 : 600) || Math.abs(c.angle) > .52 || c.type === 'lever' && ['s-5', 's5'].some((port) => { const end = endpoint(c, port); return end.x < 20 || end.x > 980 || end.y < 65 || end.y > 545; }))) return { ok: false, issue: '已到达实验台或杠杆转角边界，请缩短移动距离' };
    }
    const final = analyze(scene); if (!final.valid) return { ok: false, issue: final.issues[0] };
    const before = positions(base), lifts = scene.parts.filter((p) => p.type === 'weight').map((p) => ({ id: p.id, height: (before.get(p.id).y - final.posed.get(p.id).y) / SCALE, mass: p.mass }));
    const outputWork = lifts.reduce((sum, p) => sum + p.height * p.mass * scene.g, 0);
    return { ok: true, scene, displacement: displacement / SCALE, lifts, outputWork, result: final };
  }
  function example(kind = 'lever') {
    const s = { version: 1, g: 10, parts: [], ropes: [], links: [] };
    const add = (type, id, x, y, extra = {}) => { const p = { ...component(type, id, x, y, s.parts.filter((p) => p.type === type).length + 1), ...extra }; s.parts.push(p); return p; };
    const hang = (child, parent, dy = 70) => s.links.push({ child, parent, dx: 0, dy });
    const rope = (...nodes) => s.ropes.push({ id: `r${s.ropes.length + 1}`, nodes });
    if (kind === 'empty') return s;
    if (kind === 'lever' || kind === 'lever-force') {
      add('lever', 'l1', 490, 270); add('weight', 'g1', 430, 340, { mass: 2 }); hang('g1', 'l1:s-2');
      if (kind === 'lever') { add('weight', 'g2', 610, 340, { mass: 1 }); hang('g2', 'l1:s4'); }
      else { add('scale', 'f1', 610, 460); rope('l1:s4', 'f1:hook'); }
    } else if (kind === 'tilt') {
      add('anchor', 'a1', 472, 110); add('moving', 'm1', 500, 380);
      add('scale', 'f1', 528, 160); add('weight', 'g1', 500, 492, { mass: 2 }); hang('g1', 'm1:hook');
      rope('a1:hook', 'm1:wheel', 'f1:hook');
    } else if (kind === 'fixed') {
      add('fixed', 'p1', 470, 130); add('weight', 'g1', 442, 405, { mass: 2 }); add('scale', 'f1', 498, 460); rope('g1:hook', 'p1:wheel', 'f1:hook');
    } else if (kind === 'moving' || kind === 'combo') {
      add('anchor', 'a1', 392, 90); add('moving', 'm1', 420, 335); add('fixed', 'p1', 476, 130); add('weight', 'g1', 420, 405, { mass: 2 }); hang('g1', 'm1:hook');
      if (kind === 'moving') { add('scale', 'f1', 504, 470); rope('a1:hook', 'm1:wheel', 'p1:wheel', 'f1:hook'); }
      else { s.parts.find((p) => p.id === 'm1').y = 190; add('lever', 'l1', 444, 400); add('scale', 'f1', 564, 500); rope('a1:hook', 'm1:wheel', 'p1:wheel', 'l1:s2'); rope('l1:s4', 'f1:hook'); }
    } else if (kind === 'group') {
      add('anchor', 'a1', 344, 80); add('fixed', 'p1', 428, 130); add('fixed', 'p2', 540, 130);
      add('beam', 'b1', 428, 420); add('moving', 'm1', 372, 330); add('moving', 'm2', 484, 330);
      hang('m1', 'b1:s-2', -90); hang('m2', 'b1:s2', -90); add('weight', 'g1', 428, 490, { mass: 2 }); hang('g1', 'b1:s0');
      add('scale', 'f1', 568, 490); rope('a1:hook', 'm1:wheel', 'p1:wheel', 'm2:wheel', 'p2:wheel', 'f1:hook');
    }
    return s;
  }
  globalThis.Mechanics = { TYPES, SCALE, RADIUS, component, ports, endpoint, positions, point, ropeGeometry, variables, linearSolve, validate, analyze, pull, leverAutoAngle, example, clone };
})();
