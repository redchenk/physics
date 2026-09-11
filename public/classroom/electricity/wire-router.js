(() => {
  'use strict';
  const STEP = 10, COLS = 97, ROWS = 66;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const cell = (x, y) => y * COLS + x;
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const pointKey = (p) => `${p.x},${p.y}`;
  const same = (a, b) => Math.abs(a.x - b.x) < .01 && Math.abs(a.y - b.y) < .01;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const clean = (p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 });
  const direction = (a, b) => a.x < b.x ? 0 : a.x > b.x ? 2 : a.y < b.y ? 1 : 3;
  const grid = (p) => ({ x: Math.max(1, Math.min(COLS - 2, Math.round(p.x / STEP))), y: Math.max(1, Math.min(ROWS - 2, Math.round(p.y / STEP))) });
  class Heap {
    items = [];
    push(item) { const a = this.items; a.push(item); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= item.f) break; a[i] = a[p]; i = p; } a[i] = item; }
    pop() { const a = this.items, first = a[0], last = a.pop(); if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1].f < a[c].f) c++; if (a[c].f >= last.f) break; a[i] = a[c]; i = c; } a[i] = last; } return first; }
  }
  function terminal(c, port) {
    const angle = c.rotation * Math.PI / 180;
    const local = c.type === 'junction' ? [0, 0] : port === 'w' ? [0, -48] : [port === 'a' ? -65 : 65, 0];
    const heading = angle + (port === 'w' ? -Math.PI / 2 : port === 'a' ? Math.PI : 0);
    return { ...clean({ x: c.x + local[0] * Math.cos(angle) - local[1] * Math.sin(angle), y: c.y + local[0] * Math.sin(angle) + local[1] * Math.cos(angle) }), dx: Math.round(Math.cos(heading)), dy: Math.round(Math.sin(heading)), junction: c.type === 'junction' };
  }
  function simplify(points) {
    const out = [];
    for (const raw of points) {
      const p = clean(raw); if (out.length && same(out.at(-1), p)) continue;
      while (out.length > 1) { const a = out.at(-2), b = out.at(-1); if (((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) && (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) >= 0) out.pop(); else break; }
      out.push(p);
    }
    return out;
  }
  function obstacles(c) {
    if (c.type === 'junction') return [];
    const vertical = c.rotation % 180 !== 0, left = c.x > 730;
    const rect = (x1, y1, x2, y2) => ({ x1: c.x + x1, y1: c.y + y1, x2: c.x + x2, y2: c.y + y2, id: c.id });
    const list = [rect(vertical ? -43 : -78, vertical ? -78 : -43, vertical ? 43 : 78, vertical ? 78 : 43)];
    if (vertical) list.push(rect(left ? -215 : 55, -83, left ? -55 : 215, -55), rect(left ? -215 : 55, 56, left ? -55 : 215, 84));
    else if (c.type === 'rheostat') list.push(rect(left ? -175 : 30, -82, left ? -30 : 175, -54), rect(left ? -175 : 30, 60, left ? -30 : 175, 84));
    else list.push(rect(-78, -66, 78, -40), rect(-78, 38, 78, 64));
    return list;
  }
  function netMap(wires) {
    const parent = new Map();
    const find = (k) => { if (!parent.has(k)) parent.set(k, k); if (parent.get(k) !== k) parent.set(k, find(parent.get(k))); return parent.get(k); };
    for (const w of wires) { const a = find(w.from), b = find(w.to); parent.set(a < b ? b : a, a < b ? a : b); }
    return new Map(wires.map((w) => [w.id, find(w.from)]));
  }
  function inside(p, r) { return p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2; }
  function blockedSegment(a, b, rectangles) {
    return rectangles.some((r) => a.x === b.x ? a.x > r.x1 && a.x < r.x2 && Math.max(a.y, b.y) > r.y1 && Math.min(a.y, b.y) < r.y2 : a.y > r.y1 && a.y < r.y2 && Math.max(a.x, b.x) > r.x1 && Math.min(a.x, b.x) < r.x2);
  }
  function routeWires(components, wires, options = {}) {
    const map = new Map(components.map((c) => [c.id, c])), rectangles = components.flatMap(obstacles), blocked = new Uint8Array(COLS * ROWS);
    for (const r of rectangles) for (let y = Math.max(1, Math.ceil(r.y1 / STEP)); y <= Math.min(ROWS - 2, Math.floor(r.y2 / STEP)); y++) for (let x = Math.max(1, Math.ceil(r.x1 / STEP)); x <= Math.min(COLS - 2, Math.floor(r.x2 / STEP)); x++) blocked[cell(x, y)] = 1;
    const nets = netMap(wires), edges = new Map(), occupied = new Map(), done = new Map(), terminalNets = new Map(), exits = new Map();
    for (const w of wires) { terminalNets.set(w.from, nets.get(w.id)); terminalNets.set(w.to, nets.get(w.id)); }
    for (const c of components) for (const port of c.type === 'junction' ? ['a'] : c.type === 'rheostat' ? ['a', 'b', 'w'] : ['a', 'b']) {
      const p = terminal(c, port), q = grid({ x: p.x + (p.junction ? 0 : p.dx * 25), y: p.y + (p.junction ? 0 : p.dy * 25) }), owner = terminalNets.get(`${c.id}:${port}`) || `${c.id}:${port}`;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const key = cell(q.x + dx, q.y + dy); if (!exits.has(key)) exits.set(key, new Set()); exits.get(key).add(owner); }
    }
    const endpoint = (key) => { const [id, port] = key.split(':'); return map.has(id) ? terminal(map.get(id), port) : null; };
    const clearPath = (points, a, b) => {
      if (points.length < 2 || !same(points[0], a) || !same(points.at(-1), b)) return false;
      for (let i = 1; i < points.length; i++) {
        let p = points[i - 1], q = points[i];
        if (p.x !== q.x && p.y !== q.y || p.x < 10 || p.x > 950 || p.y < 10 || p.y > 640) return false;
        if (i === 1 && !a.junction) { if (direction(p, q) !== direction({ x: 0, y: 0 }, { x: a.dx, y: a.dy }) || distance(p, q) < 18) return false; p = { x: p.x + a.dx * 18, y: p.y + a.dy * 18 }; }
        if (i === points.length - 1 && !b.junction) { if (direction(q, p) !== direction({ x: 0, y: 0 }, { x: b.dx, y: b.dy }) || distance(p, q) < 18) return false; q = { x: q.x + b.dx * 18, y: q.y + b.dy * 18 }; }
        if (blockedSegment(p, q, rectangles)) return false;
      }
      return true;
    };
    const reserve = (route) => {
      for (let i = 1; i < route.points.length; i++) {
        const a = grid(route.points[i - 1]), b = grid(route.points[i]);
        if (a.x !== b.x && a.y !== b.y || same(a, b)) continue;
        const dir = direction(a, b), [dx, dy] = DIRS[dir];
        for (let x = a.x, y = a.y; x !== b.x || y !== b.y; x += dx, y += dy) {
          const c = cell(x, y), next = cell(x + dx, y + dy); edges.set(edgeKey(c, next), route.net);
          for (const [key, heading] of [[c, dir], [next, (dir + 2) % 4]]) { if (!occupied.has(key)) occupied.set(key, new Map()); const occ = occupied.get(key); occ.set(route.net, (occ.get(route.net) || 0) | (1 << heading)); }
        }
      }
    };
    const search = (start, end, net, startDirection = -1, endOutward = -1, forbidden = new Set()) => {
      const first = cell(start.x, start.y), last = cell(end.x, end.y);
      const unavailable = (n) => blocked[n] || [...(exits.get(n) || [])].some((owner) => owner !== net);
      if (unavailable(first) || unavailable(last)) return null;
      if (first === last) return [{ x: start.x * STEP, y: start.y * STEP }];
      const costs = new Float64Array(COLS * ROWS * 4).fill(Infinity), parents = new Int32Array(costs.length).fill(-1), heap = new Heap();
      for (let dir = 0; dir < 4; dir++) if (startDirection === -1 || startDirection === dir) { const id = first * 4 + dir; costs[id] = 0; heap.push({ id, g: 0, f: 0 }); }
      while (heap.items.length) {
        const current = heap.pop(); if (current.g !== costs[current.id]) continue;
        const c = current.id >> 2, x = c % COLS, y = Math.floor(c / COLS), previous = current.id % 4;
        if (c === last && previous !== endOutward) { const points = []; for (let id = current.id; id !== -1; id = parents[id]) { const n = id >> 2; points.push({ x: n % COLS * STEP, y: Math.floor(n / COLS) * STEP }); } return points.reverse(); }
        const crossingHere = [...(occupied.get(c) || [])].some(([owner]) => owner !== net);
        for (let dir = 0; dir < 4; dir++) {
          if (dir === (previous + 2) % 4 || crossingHere && dir !== previous) continue;
          const [dx, dy] = DIRS[dir], nx = x + dx, ny = y + dy;
          if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
          const n = cell(nx, ny); if (unavailable(n)) continue;
          const key = edgeKey(c, n), owner = edges.get(key); if (owner && owner !== net || forbidden.has(key)) continue;
          const foreign = [...(occupied.get(n) || [])].filter(([id]) => id !== net);
          if (foreign.some(([owner, mask]) => mask !== (dir % 2 ? 5 : 10) || [-1, 1].some((offset) => occupied.get(cell(nx + (dir % 2 ? offset : 0), ny + (dir % 2 ? 0 : offset)))?.get(owner) !== mask))) continue;
          let proximity = 0;
          for (const offset of [-2, -1, 1, 2]) { const nearX = x + (dir % 2 ? offset : 0), nearY = y + (dir % 2 ? 0 : offset); if (nearX < 0 || nearY < 0 || nearX + dx >= COLS || nearY + dy >= ROWS) continue; const neighbor = edges.get(edgeKey(cell(nearX, nearY), cell(nearX + dx, nearY + dy))); if (neighbor && neighbor !== net) proximity += Math.abs(offset) === 1 ? 22 : 3; }
          const g = current.g + (owner === net ? 5 : 10) + (dir === previous ? 0 : 55) + foreign.length * 100 + proximity;
          const id = n * 4 + dir; if (g >= costs[id]) continue;
          costs[id] = g; parents[id] = current.id; heap.push({ id, g, f: g + 5 * (Math.abs(nx - end.x) + Math.abs(ny - end.y)) });
        }
      }
      return null;
    };
    // Reserve unchanged routes first. Moving one component must not displace unrelated wires.
    const stable = new Map();
    for (const wire of wires) {
      const a = endpoint(wire.from), b = endpoint(wire.to), prior = options.previous?.find((r) => r.id === wire.id && r.net === nets.get(wire.id) && !r.failed);
      if (a && b && prior && (!wire.manual || JSON.stringify(simplify(wire.manual)) === JSON.stringify(prior.points)) && clearPath(prior.points, a, b)) { stable.set(wire.id, prior); reserve(prior); }
    }
    const work = wires.map((w) => ({ wire: w, a: endpoint(w.from), b: endpoint(w.to), net: nets.get(w.id) })).sort((a, b) => Number(!!b.wire.manual) - Number(!!a.wire.manual) || a.net.localeCompare(b.net) || (a.a && a.b ? distance(a.a, a.b) : 0) - (b.a && b.b ? distance(b.a, b.b) : 0) || a.wire.id.localeCompare(b.wire.id));
    for (const { wire, a, b, net } of work) {
      if (!a || !b) { done.set(wire.id, { id: wire.id, net, points: [], failed: true, issue: '接线端不存在', handle: { x: 100, y: 100 } }); continue; }
      const lead = (p) => grid({ x: p.x + (p.junction ? 0 : p.dx * 25), y: p.y + (p.junction ? 0 : p.dy * 25) });
      const start = lead(a), end = lead(b);
      const stub = (p, q) => p.dx ? [{ x: q.x, y: p.y }, q] : [{ x: p.x, y: q.y }, q];
      let points = [], failed = false, issue = '';
      if (stable.has(wire.id)) points = stable.get(wire.id).points.map(clean);
      else if (wire.manual?.length) {
        points = wire.manual.map(clean);
        if (!same(points[0], a) || !same(points.at(-1), b)) {
          // Keep the middle of a hand-edited wire; reconnect only the moved ends.
          const candidates = points.slice(1, -1).filter((p) => !rectangles.some((r) => inside(p, r)));
          const firstAnchor = candidates[0], lastAnchor = candidates.at(-1);
          const front = firstAnchor && search(start, grid(firstAnchor), net, a.junction ? -1 : direction({ x: 0, y: 0 }, { x: a.dx, y: a.dy }));
          const back = lastAnchor && search(grid(lastAnchor), end, net, -1, b.junction ? -1 : direction({ x: 0, y: 0 }, { x: b.dx, y: b.dy }));
          if (front && back) { const firstIndex = points.findIndex((p) => same(p, firstAnchor)), lastIndex = points.findLastIndex((p) => same(p, lastAnchor)); points = [a, ...stub(a, front[0]), ...front, ...points.slice(firstIndex, lastIndex + 1), ...back, ...stub(b, back.at(-1)).reverse(), b]; }
          else points = [];
        }
        points = simplify(points);
        if (!clearPath(points, a, b)) { failed = true; issue = '路径穿过元件、标注或超出实验台'; }
      }
      else {
        const pins = wire.waypoints || (wire.via ? [wire.via] : []), waypoints = [start, ...pins.map(grid), end], path = [], forbidden = new Set();
        for (let i = 1; i < waypoints.length; i++) {
          const section = search(waypoints[i - 1], waypoints[i], net, i === 1 && !a.junction ? direction({ x: 0, y: 0 }, { x: a.dx, y: a.dy }) : -1, i === waypoints.length - 1 && !b.junction ? direction({ x: 0, y: 0 }, { x: b.dx, y: b.dy }) : -1, forbidden);
          if (!section) { failed = true; issue = '空间不足，请移开元件或调整路径'; break; }
          path.push(...section);
          for (let j = 1; j < section.length; j++) forbidden.add(edgeKey(cell(section[j - 1].x / STEP, section[j - 1].y / STEP), cell(section[j].x / STEP, section[j].y / STEP)));
        }
        if (!failed) points = simplify([a, ...stub(a, path[0]), ...path, ...stub(b, path.at(-1)).reverse(), b]);
      }
      if (!points.length) points = [clean(a), clean({ x: a.x + a.dx * 22, y: a.y + a.dy * 22 }), clean({ x: b.x + b.dx * 22, y: b.y + b.dy * 22 }), clean(b)];
      const route = { id: wire.id, from: wire.from, to: wire.to, net, points, failed, issue, manual: !!wire.manual, handle: wire.via || points[Math.floor(points.length / 2)] };
      done.set(wire.id, route); if (!failed) reserve(route);
    }
    return wires.map((w) => done.get(w.id));
  }
  function segments(points) { return points.slice(1).map((b, i) => ({ a: points[i], b, index: i })).filter((s) => !same(s.a, s.b)); }
  function onSegment(p, s, strict = false) { return (s.a.x === s.b.x ? p.x === s.a.x && p.y >= Math.min(s.a.y, s.b.y) && p.y <= Math.max(s.a.y, s.b.y) : p.y === s.a.y && p.x >= Math.min(s.a.x, s.b.x) && p.x <= Math.max(s.a.x, s.b.x)) && (!strict || !same(p, s.a) && !same(p, s.b)); }
  function scene(routes) {
    const lines = routes.filter((r) => !r.failed).flatMap((r) => segments(r.points).map((s) => ({ ...s, net: r.net, split: [s.a, s.b] })));
    const crossings = new Map(), conflicts = new Set();
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j], av = a.a.x === a.b.x, bv = b.a.x === b.b.x;
      if (av === bv) {
        if (av ? a.a.x !== b.a.x : a.a.y !== b.a.y) continue;
        for (const p of [a.a, a.b, b.a, b.b]) if (onSegment(p, a) && onSegment(p, b)) { a.split.push(p); b.split.push(p); }
        const overlap = av ? Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) : Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) - Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x));
        if (a.net !== b.net && overlap > 1) { conflicts.add(a.net); conflicts.add(b.net); }
      } else {
        const v = av ? a : b, h = av ? b : a, p = { x: v.a.x, y: h.a.y };
        if (!onSegment(p, a) || !onSegment(p, b)) continue;
        if (a.net === b.net) { a.split.push(p); b.split.push(p); }
        else if (onSegment(p, a, true) && onSegment(p, b, true) && Math.min(...[a.a, a.b, b.a, b.b].map((q) => distance(p, q))) >= 18) crossings.set(pointKey(p), { ...p, net: v.net, under: h.net });
        else { conflicts.add(a.net); conflicts.add(b.net); }
      }
    }
    const nodes = new Map(), edges = new Map();
    for (const s of lines) {
      const sorted = [...new Map(s.split.map((p) => [pointKey(p), p])).values()].sort((a, b) => distance(s.a, a) - distance(s.a, b));
      for (let i = 1; i < sorted.length; i++) {
        const a = sorted[i - 1], b = sorted[i], ka = `${s.net}|${pointKey(a)}`, kb = `${s.net}|${pointKey(b)}`, key = [ka, kb].sort().join('~');
        if (edges.has(key)) continue;
        const edge = { key, ka, kb, net: s.net }; edges.set(key, edge);
        for (const [k, p] of [[ka, a], [kb, b]]) { if (!nodes.has(k)) nodes.set(k, { ...p, net: s.net, edges: [] }); nodes.get(k).edges.push(edge); }
      }
    }
    const used = new Set(), paths = [], junctions = [];
    const walk = (key, first) => { const points = [nodes.get(key)], net = first.net; let next = first; while (next && !used.has(next.key)) { used.add(next.key); key = next.ka === key ? next.kb : next.ka; const node = nodes.get(key); points.push(node); if (node.edges.length !== 2) break; next = node.edges.find((e) => !used.has(e.key)); } paths.push({ net, points: simplify(points) }); };
    for (const [key, node] of nodes) { if (node.edges.length >= 3) junctions.push({ x: node.x, y: node.y, net: node.net }); if (node.edges.length !== 2) for (const edge of node.edges) if (!used.has(edge.key)) walk(key, edge); }
    for (const edge of edges.values()) if (!used.has(edge.key)) walk(edge.ka, edge);
    return { paths, junctions, crossings: [...crossings.values()], conflicts: [...conflicts] };
  }
  function pathData(points, radius = 10) {
    if (!points.length) return '';
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) { const a = points[i - 1], p = points[i], b = points[i + 1], r = Math.min(radius, distance(a, p) / 2, distance(p, b) / 2); const before = { x: p.x - Math.sign(p.x - a.x) * r, y: p.y - Math.sign(p.y - a.y) * r }, after = { x: p.x + Math.sign(b.x - p.x) * r, y: p.y + Math.sign(b.y - p.y) * r }; d += ` L${before.x},${before.y} Q${p.x},${p.y} ${after.x},${after.y}`; }
    const end = points.at(-1); return `${d} L${end.x},${end.y}`;
  }
  function editPoints(points) {
    const out = points.map(clean); if (out.length < 2) return out;
    const a = out[0], b = out.at(-1), first = out[1], last = out.at(-2), front = Math.min(22, distance(a, first) / 3), back = Math.min(22, distance(last, b) / 3);
    out.splice(1, 0, clean({ x: a.x + Math.sign(first.x - a.x) * front, y: a.y + Math.sign(first.y - a.y) * front }));
    out.splice(out.length - 1, 0, clean({ x: b.x + Math.sign(last.x - b.x) * back, y: b.y + Math.sign(last.y - b.y) * back }));
    return out.filter((p, i) => !i || !same(p, out[i - 1]));
  }
  function moveSegment(points, index, offset) {
    const out = points.map(clean), a = out[index], b = out[index + 1];
    if (!a || !b || index < 1 || index >= out.length - 2) return out;
    const horizontal = a.y === b.y, delta = Math.round(offset / 10) * 10, movedA = { ...a }, movedB = { ...b };
    movedA[horizontal ? 'y' : 'x'] += delta; movedB[horizontal ? 'y' : 'x'] += delta;
    const previous = out[index - 1], next = out[index + 2], prefix = out.slice(0, index), suffix = out.slice(index + 2);
    if (horizontal ? previous.y === a.y : previous.x === a.x) prefix.push(a);
    prefix.push(movedA, movedB); if (horizontal ? next.y === b.y : next.x === b.x) prefix.push(b);
    return simplify([...prefix, ...suffix]);
  }
  function findPlacement(components, wires, type) {
    const failures = new Set(routeWires(components, wires).filter((r) => r.failed).map((r) => r.id));
    let fallback = { x: 140, y: 110 }, best = -1;
    for (const y of [110, 310, 510]) for (const x of [140, 360, 580, 800]) { const gap = Math.min(Infinity, ...components.map((c) => Math.hypot(c.x - x, c.y - y))); if (gap > best) { best = gap; fallback = { x, y }; } if (components.some((c) => Math.abs(c.x - x) < (c.rotation % 180 ? 300 : 210) && Math.abs(c.y - y) < 200)) continue; if (routeWires([...components, { id: '__placement__', type, x, y, rotation: 0 }], wires).every((r) => !r.failed || failures.has(r.id))) return { x, y }; }
    return fallback;
  }
  globalThis.WireRouter = { routeWires, terminal, pathData, findPlacement, scene, editPoints, moveSegment, simplify, obstacles, inside };
})();
