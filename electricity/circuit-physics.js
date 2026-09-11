/* Shared by the offline classroom and the node regression tests. No DOM state. */
(() => {
  'use strict';
  const SOURCE_R = 0.1;
  const AMMETER_R = 0.01;
  const TYPES = {
    battery: { name: '电源', symbol: 'E', value: 6, min: 0, max: 24, step: 0.5, unit: 'V' },
    resistor: { name: '定值电阻', symbol: 'R', value: 30, min: 1, max: 1000, step: 1, unit: 'Ω' },
    rheostat: { name: '滑动变阻器', symbol: 'Rp', value: 50, min: 1, max: 1000, step: 1, unit: 'Ω' },
    lamp: { name: '小灯泡', symbol: 'L', value: 20, min: 1, max: 200, step: 1, unit: 'Ω' },
    switch: { name: '开关', symbol: 'S' },
    ammeter: { name: '电流表', symbol: 'A', range: 0.6 },
    voltmeter: { name: '电压表', symbol: 'V', range: 3 },
    junction: { name: '分线点', symbol: 'J' },
  };
  const terminals = (c) => c.type === 'junction' ? ['a'] : c.type === 'rheostat' ? ['a', 'b', 'w'] : ['a', 'b'];
  const terminalId = (id, port) => `${id}:${port}`;
  function unionFind(keys) {
    const parent = new Map(keys.map((key) => [key, key]));
    function find(key) {
      if (parent.get(key) !== key) parent.set(key, find(parent.get(key)));
      return parent.get(key);
    }
    return { find, join: (a, b) => parent.set(find(a), find(b)) };
  }
  function linearSolve(matrix, rhs) {
    const n = rhs.length;
    const a = matrix.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('电路无法求解，请检查元件参数。');
      [a[col], a[pivot]] = [a[pivot], a[col]];
      for (let row = col + 1; row < n; row++) {
        const factor = a[row][col] / a[col][col];
        for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
      }
    }
    const x = Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let value = a[row][n];
      for (let col = row + 1; col < n; col++) value -= a[row][col] * x[col];
      x[row] = value / a[row][row];
    }
    return x;
  }
  function solveCircuit(components, wires) {
    const readings = {};
    const warnings = [];
    const keys = components.flatMap((c) => terminals(c).map((port) => terminalId(c.id, port)));
    const validKeys = new Set(keys);
    if (components.length > 60 || wires.length > 180 || validKeys.size !== keys.length) throw new Error('元件或导线数量无效。');
    for (const c of components) {
      const type = TYPES[c.type];
      if (!type || (type.value !== undefined && (!Number.isFinite(c.value) || c.value < type.min || c.value > type.max))) throw new Error('元件参数无效。');
      if (c.type === 'rheostat' && (!Number.isFinite(c.position) || c.position < 0 || c.position > 1)) throw new Error('滑片位置无效。');
      if (type.range && !(c.type === 'ammeter' ? [0.6, 3] : [3, 15]).includes(c.range)) throw new Error('电表量程无效。');
    }
    const nodes = unionFind(keys);
    for (const wire of wires) {
      if (!validKeys.has(wire.from) || !validKeys.has(wire.to)) throw new Error('导线连接到了不存在的接线柱。');
      nodes.join(wire.from, wire.to);
    }
    const rawEdges = [];
    function edge(c, p, q, r, emf = 0) {
      const a = terminalId(c.id, p), b = terminalId(c.id, q);
      if (r === 0) nodes.join(a, b);
      else rawEdges.push({ id: c.id, type: c.type, a, b, r, emf });
    }
    for (const c of components) {
      if (c.type === 'battery') edge(c, 'a', 'b', SOURCE_R, c.value);
      if (c.type === 'resistor' || c.type === 'lamp') edge(c, 'a', 'b', c.value);
      if (c.type === 'ammeter') edge(c, 'a', 'b', AMMETER_R);
      if (c.type === 'switch' && c.closed) edge(c, 'a', 'b', 0);
      if (c.type === 'rheostat') {
        edge(c, 'a', 'w', c.value * c.position);
        edge(c, 'w', 'b', c.value * (1 - c.position));
      }
    }
    const nodeKeys = [...new Set(keys.map(nodes.find))];
    const islands = unionFind(nodeKeys);
    const edges = rawEdges.map((e) => ({ ...e, a: nodes.find(e.a), b: nodes.find(e.b) }));
    const shortcuts = unionFind(nodeKeys);
    for (const e of edges) {
      islands.join(e.a, e.b);
      if (e.type === 'ammeter') shortcuts.join(e.a, e.b);
    }
    const batteries = components.filter((c) => c.type === 'battery');
    for (const c of batteries) {
      if (c.value > 0 && shortcuts.find(nodes.find(`${c.id}:a`)) === shortcuts.find(nodes.find(`${c.id}:b`))) {
        warnings.push(`${c.label} 短路：电源两端经导线、闭合开关或电流表直接相连。请串入负载。`);
      }
    }
    if (warnings.length) return { status: 'short', readings, warnings, valid: false };
    const potentials = new Map();
    const groups = new Map();
    for (const key of nodeKeys) {
      const island = islands.find(key);
      if (!groups.has(island)) groups.set(island, []);
      groups.get(island).push(key);
    }
    for (const group of groups.values()) {
      const ground = group[0];
      const unknowns = group.slice(1);
      const indices = new Map(unknowns.map((key, i) => [key, i]));
      const matrix = unknowns.map(() => Array(unknowns.length).fill(0));
      const rhs = Array(unknowns.length).fill(0);
      for (const e of edges) {
        if (islands.find(e.a) !== islands.find(ground) || e.a === e.b) continue;
        const a = indices.get(e.a), b = indices.get(e.b), g = 1 / e.r;
        if (a !== undefined) { matrix[a][a] += g; rhs[a] += e.emf * g; }
        if (b !== undefined) { matrix[b][b] += g; rhs[b] -= e.emf * g; }
        if (a !== undefined && b !== undefined) { matrix[a][b] -= g; matrix[b][a] -= g; }
      }
      potentials.set(ground, 0);
      linearSolve(matrix, rhs).forEach((v, i) => potentials.set(unknowns[i], v));
    }
    let flowing = false;
    for (const c of components) {
      const a = nodes.find(`${c.id}:a`), b = nodes.find(`${c.id}:${c.type === 'junction' ? 'a' : 'b'}`);
      const voltage = islands.find(a) === islands.find(b) ? potentials.get(a) - potentials.get(b) : null;
      const branch = edges.find((e) => e.id === c.id);
      let current = branch ? (potentials.get(branch.a) - potentials.get(branch.b) - branch.emf) / branch.r : 0;
      if (Math.abs(current) < 1e-9) current = 0;
      if (c.type === 'battery') { current = -current; flowing ||= Math.abs(current) > 1e-8; }
      const reading = { voltage, current, power: voltage === null ? 0 : Math.abs(voltage * current) };
      if (c.type === 'ammeter' || c.type === 'voltmeter') {
        reading.value = c.type === 'ammeter' ? current : voltage;
        reading.overload = reading.value !== null && Math.abs(reading.value) > c.range + 1e-8;
        reading.reversed = reading.value !== null && reading.value < -1e-8;
        if (reading.value === null) warnings.push(`${c.label} 未完整接入同一电路，无法确定电压。`);
        if (reading.overload) warnings.push(`${c.label} 超出 ${c.range} ${c.type === 'ammeter' ? 'A' : 'V'} 量程，请换大量程或调整电路。`);
        if (reading.reversed) warnings.push(`${c.label} 反向偏转：检查电表正、负接线柱。`);
      }
      if (c.type === 'battery' && Math.abs(current) > 5) warnings.push(`${c.label} 电流超过 5 A，请检查是否用电流表旁路了负载或电阻过小。`);
      readings[c.id] = reading;
    }
    const status = !batteries.length ? 'no-source' : flowing ? 'closed' : 'open';
    return { status, readings, warnings, valid: true };
  }
  function createComponent(type, id, x, y, ordinal = 1) {
    const t = TYPES[type];
    return { id, type, label: `${t.symbol}${ordinal}`, x, y, rotation: 0,
      ...(t.value !== undefined ? { value: t.value } : {}),
      ...(t.range ? { range: t.range } : {}),
      ...(type === 'rheostat' ? { position: 0.5 } : {}),
      ...(type === 'switch' ? { closed: false } : {}) };
  }
  function createExample(kind) {
    if (kind === 'empty') return { components: [], wires: [] };
    if (kind === 'lamp') return {
      components: [{ ...createComponent('battery', 'e1', 160, 290), rotation: 90 }, { ...createComponent('switch', 's1', 450, 130), closed: true }, { ...createComponent('lamp', 'l1', 740, 290), rotation: 90 }],
      wires: [{ id: 'w1', from: 'e1:a', to: 's1:a' }, { id: 'w2', from: 's1:b', to: 'l1:a' }, { id: 'w3', from: 'l1:b', to: 'e1:b' }],
    };
    const components = [
      { ...createComponent('battery', 'e1', 150, 130), rotation: 180 },
      createComponent('switch', 's1', 410, 130),
      createComponent('ammeter', 'a1', 720, 130),
      { ...createComponent('resistor', 'r1', 720, 270), rotation: 180 },
      { ...createComponent('voltmeter', 'v1', 720, kind === 'parallel' ? 570 : 470), rotation: 180 },
    ];
    components[1].closed = true;
    components[4].range = 15;
    const links = [['e1:a', 's1:a'], ['s1:b', 'a1:a'], ['a1:b', 'r1:a'], ['r1:b', 'e1:b'], ['v1:a', 'r1:a'], ['v1:b', 'r1:b']];
    if (kind === 'series' || kind === 'parallel') {
      components.push({ ...createComponent('resistor', 'r2', kind === 'parallel' ? 720 : 300, kind === 'parallel' ? 420 : 270, 2), rotation: 180 });
      components.at(-1).value = 60;
      if (kind === 'series') {
        links.splice(3, 1, ['r1:b', 'r2:a'], ['r2:b', 'e1:b']);
      } else links.push(['r2:a', 'r1:a'], ['r2:b', 'r1:b']);
    }
    return { components, wires: links.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })) };
  }
  globalThis.CircuitPhysics = { TYPES, terminals, terminalId, solveCircuit, createComponent, createExample, SOURCE_R, AMMETER_R };
})();
