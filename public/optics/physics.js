(() => {
  'use strict';
  const SCALE = 10, EPS = 1e-5, WIDTH = 1000, HEIGHT = 600;
  const TYPES = {
    beam: { name: '光束光源', prefix: 'S', symbol: '➜' }, object: { name: '发光物体', prefix: 'O', symbol: '↑' },
    mirror: { name: '平面镜', prefix: 'M', symbol: '╱' }, lens: { name: '凸透镜', prefix: 'L', symbol: '()' },
    diverging: { name: '凹透镜', prefix: 'D', symbol: ')(' }, prism: { name: '三棱镜', prefix: 'P', symbol: '△' },
    glass: { name: '玻璃砖', prefix: 'G', symbol: '▱' }, screen: { name: '光屏', prefix: 'E', symbol: '▏' },
    filter: { name: '滤光片', prefix: 'C', symbol: '▥' }, aperture: { name: '狭缝挡板', prefix: 'A', symbol: '┇' },
  };
  const SPECTRUM = [ { wavelength: 650, color: '#ff615a', name: '红' }, { wavelength: 610, color: '#ff9a45', name: '橙' }, { wavelength: 580, color: '#ffe16b', name: '黄' }, { wavelength: 550, color: '#82e186', name: '绿' }, { wavelength: 500, color: '#5ce0e8', name: '青' }, { wavelength: 470, color: '#7ca7ff', name: '蓝' }, { wavelength: 420, color: '#c59bff', name: '紫' } ];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const mul = (p, k) => ({ x: p.x * k, y: p.y * k });
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const norm = (p) => { const d = Math.hypot(p.x, p.y); return { x: p.x / (d || 1), y: p.y / (d || 1) }; };
  const direction = (degrees) => ({ x: Math.cos(degrees * Math.PI / 180), y: Math.sin(degrees * Math.PI / 180) });
  const axis = (c) => direction(c.angle);
  const tangent = (c) => { const a = axis(c); return { x: -a.y, y: a.x }; };
  const transform = (c, p) => add(c, add(mul(axis(c), p.x), mul(tangent(c), p.y)));
  const local = (c, p) => { const d = sub(p, c); return { x: dot(d, axis(c)), y: dot(d, tangent(c)) }; };
  function component(type, id, x, y, ordinal = 1) {
    return { id, type, label: `${TYPES[type].prefix}${ordinal}`, x, y, angle: 0, size: ['mirror', 'screen'].includes(type) ? 200 : 150, focal: type === 'diverging' ? -15 : 15, index: 1.52, dispersion: .009, apex: 60, depth: 100, gap: 22, height: 65, white: type === 'beam', wavelength: 550, count: type === 'beam' ? 1 : 9, spread: 0, width: 0, pass: 'red', on: true };
  }
  function lineEnds(c) { const t = mul(tangent(c), c.size / 2); return [sub(c, t), add(c, t)]; }
  function polygon(c) {
    const h = c.size, w = c.type === 'prism' ? h * Math.tan(c.apex * Math.PI / 360) : c.depth / 2;
    return (c.type === 'prism' ? [{ x: 0, y: -h * 2 / 3 }, { x: w, y: h / 3 }, { x: -w, y: h / 3 }] : [{ x: -w, y: -h / 2 }, { x: w, y: -h / 2 }, { x: w, y: h / 2 }, { x: -w, y: h / 2 }]).map((p) => transform(c, p));
  }
  function inside(p, vertices) {
    let yes = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const a = vertices[i], b = vertices[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) yes = !yes;
    }
    return yes;
  }
  function intersection(origin, d, a, b) {
    const edge = sub(b, a), den = cross(d, edge); if (Math.abs(den) < 1e-9) return null;
    const q = sub(a, origin), t = cross(q, edge) / den, u = cross(q, d) / den;
    return t > EPS && u >= -EPS && u <= 1 + EPS ? { t, point: add(origin, mul(d, t)), normal: norm({ x: -edge.y, y: edge.x }), edgePosition: u } : null;
  }
  function reflect(d, normal) { return norm(sub(d, mul(normal, 2 * dot(d, normal)))); }
  function refract(d, normal, n1, n2) {
    let n = normal; if (dot(d, n) > 0) n = mul(n, -1);
    const cos = -dot(d, n), eta = n1 / n2, k = 1 - eta * eta * Math.max(0, 1 - cos * cos);
    return k < -1e-10 ? { direction: reflect(d, n), tir: true } : { direction: norm(add(mul(d, eta), mul(n, eta * cos - Math.sqrt(Math.max(0, k))))), tir: false };
  }
  function refractiveIndex(c, wavelength) { const lambda = wavelength / 1000; return c.index + c.dispersion * (1 / (lambda * lambda) - 1 / (.55 * .55)); }
  function mirrorPoint(c, p) { return sub(p, mul(axis(c), 2 * dot(sub(p, c), axis(c)))); }
  function mirrorImage(c, object) {
    const base = { x: object.x, y: object.y }, tip = transform(object, { x: 0, y: -object.height });
    return { mirrorId: c.id, objectId: object.id, base: mirrorPoint(c, base), tip: mirrorPoint(c, tip), distance: Math.abs(dot(sub(base, c), axis(c))) / SCALE, height: object.height / SCALE, magnification: 1, virtual: true };
  }
  function lensDirection(c, at, d) {
    const a = axis(c), t = tangent(c), travel = dot(d, a) >= 0 ? a : mul(a, -1), forward = dot(d, travel);
    if (forward < .15) return null;
    const slope = dot(d, t) / forward - dot(sub(at, c), t) / (c.focal * SCALE);
    return norm(add(travel, mul(t, slope)));
  }
  function accepts(c, wavelength) { return c.pass === 'red' ? wavelength >= 600 : c.pass === 'green' ? wavelength >= 500 && wavelength < 590 : c.pass === 'blue' ? wavelength <= 490 : true; }
  function validate(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.parts) || raw.parts.length > 36) throw new Error('装置格式不正确；最多 36 件器材');
    const s = { version: 1, parts: [] }, ids = new Set(); let sources = 0;
    const finite = (x, lo, hi) => Number.isFinite(x) && x >= lo && x <= hi;
    for (const c of raw.parts) {
      if (!c || !Object.hasOwn(TYPES, c.type) || typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(c.id) || ids.has(c.id) || typeof c.label !== 'string' || c.label.length > 24 || !finite(c.x, 15, 985) || !finite(c.y, 15, 585) || !finite(c.angle, -180, 180) || !finite(c.size, 40, 380) || !finite(Math.abs(c.focal), 4, 45) || c.type === 'lens' && c.focal < 0 || c.type === 'diverging' && c.focal > 0 || !finite(c.index, 1.1, 2.2) || !finite(c.dispersion, 0, .025) || !finite(c.apex, 25, 90) || !finite(c.depth, 25, 220) || !finite(c.gap, 4, 160) || !finite(c.height, 15, 120) || !finite(c.wavelength, 400, 700) || !Number.isInteger(c.count) || !finite(c.count, 1, 15) || !finite(c.spread, 0, 100) || !finite(c.width, 0, 150) || !['red', 'green', 'blue', 'all'].includes(c.pass) || typeof c.white !== 'boolean' || typeof c.on !== 'boolean') throw new Error('器材参数不正确');
      if (['beam', 'object'].includes(c.type) && ++sources > 6) throw new Error('最多 6 个光源或发光物体');
      ids.add(c.id); const keys = Object.keys(component(c.type, c.id, c.x, c.y)); s.parts.push(Object.fromEntries(keys.map((k) => [k, c[k]])));
    }
    return s;
  }
  function mediumAt(scene, p, wavelength) {
    const media = scene.parts.filter((c) => ['glass', 'prism'].includes(c.type) && inside(p, polygon(c)));
    return { index: media.length ? refractiveIndex(media.at(-1), wavelength) : 1, overlap: media.length > 1 };
  }
  function emission(source, scene) {
    const origins = [], spectra = source.white ? SPECTRUM : [{ wavelength: source.wavelength, color: spectrumColor(source.wavelength) }];
    if (source.type === 'object') {
      const origin = transform(source, { x: 0, y: -source.height }), targets = scene.parts.filter((c) => ['mirror', 'lens', 'diverging'].includes(c.type));
      if (targets.length) for (const c of targets.slice(0, 6)) for (const frac of [-.4, -.2, 0, .2, .4]) origins.push({ origin, direction: norm(sub(add(c, mul(tangent(c), c.size * frac)), origin)) });
      else for (let i = 0; i < source.count; i++) origins.push({ origin, direction: direction(source.angle + (i / Math.max(1, source.count - 1) - .5) * 70) });
    } else for (let i = 0; i < source.count; i++) {
      const fraction = source.count > 1 ? i / (source.count - 1) - .5 : 0;
      origins.push({ origin: transform(source, { x: 18, y: fraction * source.width }), direction: direction(source.angle + source.spread * fraction) });
    }
    return origins.flatMap((ray) => spectra.map((s) => ({ ...ray, ...s, sourceId: source.id })));
  }
  function spectrumColor(wavelength) { return SPECTRUM.reduce((best, s) => Math.abs(s.wavelength - wavelength) < Math.abs(best.wavelength - wavelength) ? s : best).color; }
  function trace(input) {
    const scene = validate(input), rays = [], hits = [], events = [], issues = new Set(), virtuals = [], polygons = new Map(scene.parts.filter((c) => ['prism', 'glass'].includes(c.type)).map((c) => [c.id, polygon(c)]));
    const blockers = scene.parts.filter((c) => !['beam', 'object'].includes(c.type));
    const boundary = [{ x: 0, y: 0 }, { x: WIDTH, y: 0 }, { x: WIDTH, y: HEIGHT }, { x: 0, y: HEIGHT }];
    const sources = scene.parts.filter((c) => ['beam', 'object'].includes(c.type) && c.on);
    let total = 0;
    for (const source of sources) for (const initial of emission(source, scene)) {
      const segments = [], interactions = []; let origin = initial.origin, d = initial.direction, ended = false;
      if (origin.x < 0 || origin.x > WIDTH || origin.y < 0 || origin.y > HEIGHT) continue;
      for (let step = 0; step < 32; step++) {
        let nearest = null;
        for (const c of blockers) {
          const vertices = polygons.get(c.id), edges = vertices ? vertices.map((p, i) => [p, vertices[(i + 1) % vertices.length]]) : [lineEnds(c)];
          for (const [a, b] of edges) { const hit = intersection(origin, d, a, b); if (hit && (!nearest || hit.t < nearest.t)) nearest = { ...hit, component: c }; }
        }
        const border = boundary.map((a, i) => intersection(origin, d, a, boundary[(i + 1) % 4])).filter(Boolean).sort((a, b) => a.t - b.t)[0];
        if (!nearest || border && border.t < nearest.t) { if (border) segments.push({ a: origin, b: border.point, direction: d, wavelength: initial.wavelength, color: initial.color }); ended = true; break; }
        const at = nearest.point, c = nearest.component, incident = d; segments.push({ a: origin, b: at, direction: d, wavelength: initial.wavelength, color: initial.color });
        let kind = c.type, outgoing = d;
        if (c.type === 'screen') { hits.push({ componentId: c.id, sourceId: source.id, point: at, offset: dot(sub(at, c), tangent(c)) / SCALE, wavelength: initial.wavelength, color: initial.color, direction: d }); ended = true; break; }
        if (c.type === 'filter' && !accepts(c, initial.wavelength) || c.type === 'aperture' && Math.abs(dot(sub(at, c), tangent(c))) > c.gap / 2) { ended = true; break; }
        if (c.type === 'mirror') {
          outgoing = reflect(d, nearest.normal);
          if (source.type === 'object' && step === 0) {
            const image = mirrorImage(c, source); if (!virtuals.some((v) => v.mirrorId === c.id && v.objectId === source.id)) virtuals.push(image);
          }
        } else if (c.type === 'lens' || c.type === 'diverging') {
          outgoing = lensDirection(c, at, d); if (!outgoing) { issues.add('光线近乎擦过透镜：超出薄透镜近轴模型范围'); ended = true; break; }
          if (Math.abs(dot(d, tangent(c))) > .45 || Math.abs(dot(sub(at, c), tangent(c)) / (c.focal * SCALE)) > .7) issues.add('部分透镜光线偏离近轴条件；大角度结果仅作近似示意');
        } else if (polygons.has(c.id)) {
          const before = mediumAt(scene, sub(at, mul(d, .002)), initial.wavelength), after = mediumAt(scene, add(at, mul(d, .002)), initial.wavelength);
          if (before.overlap || after.overlap) { issues.add('透明器材重叠：请拉开后再观察折射'); ended = true; break; }
          const refracted = refract(d, nearest.normal, before.index, after.index); outgoing = refracted.direction; kind = refracted.tir ? 'tir' : 'refraction';
        }
        const event = { componentId: c.id, sourceId: source.id, kind, point: at, incoming: incident, outgoing, normal: nearest.normal, wavelength: initial.wavelength, first: step === 0 };
        interactions.push(event); events.push(event); origin = add(at, mul(outgoing, .001)); d = outgoing;
        if (++total > 12000) { issues.add('光路过于复杂，请减少光线或器材'); ended = true; break; }
      }
      if (!ended) issues.add('光线达到 32 次相互作用上限；闭合反射路径已截断');
      rays.push({ sourceId: source.id, wavelength: initial.wavelength, color: initial.color, segments, interactions });
      if (total > 12000) break;
    }
    return { scene, rays, hits, events, virtuals, issues: [...issues] };
  }
  function example(kind) {
    const s = { version: 1, parts: [] }, put = (type, id, x, y, extra = {}) => { const c = { ...component(type, id, x, y, s.parts.filter((p) => p.type === type).length + 1), ...extra }; s.parts.push(c); return c; };
    if (kind === 'empty') return s;
    if (kind === 'mirror') { put('object', 'o1', 290, 365); put('mirror', 'm1', 530, 295, { size: 320 }); }
    else if (kind === 'dispersion') { put('beam', 's1', 140, 250); put('prism', 'p1', 410, 305, { size: 170, angle: 20 }); put('screen', 'e1', 740, 430, { size: 300 }); }
    else if (kind === 'periscope') { put('beam', 's1', 125, 170, { white: false, count: 3, width: 22 }); put('mirror', 'm1', 390, 170, { angle: -45, size: 155 }); put('mirror', 'm2', 390, 420, { angle: -45, size: 155 }); put('screen', 'e1', 800, 420); }
    else if (kind === 'focus') { put('beam', 's1', 130, 300, { white: false, count: 7, width: 110 }); put('lens', 'l1', 440, 300, { size: 230, focal: 20 }); put('screen', 'e1', 640, 300, { size: 240 }); }
    else if (kind === 'image') { put('object', 'o1', 160, 300); put('lens', 'l1', 460, 300, { size: 230, focal: 15 }); put('screen', 'e1', 760, 300, { size: 240 }); }
    else if (kind === 'diverging') { put('beam', 's1', 140, 300, { white: false, count: 5, width: 80 }); put('diverging', 'd1', 440, 300, { size: 220 }); put('screen', 'e1', 740, 300, { size: 360 }); }
    else if (kind === 'filter') { put('beam', 's1', 130, 270); put('filter', 'c1', 290, 270); put('prism', 'p1', 480, 325, { size: 170, angle: 20 }); put('screen', 'e1', 790, 440, { size: 300 }); }
    else if (kind === 'glass') { put('beam', 's1', 160, 215, { white: false, angle: 18, count: 3, width: 25 }); put('glass', 'g1', 450, 315, { size: 270, angle: -15, dispersion: 0 }); put('screen', 'e1', 820, 410, { size: 290 }); }
    return s;
  }
  globalThis.OpticsPhysics = { SCALE, WIDTH, HEIGHT, TYPES, SPECTRUM, clone, add, sub, mul, dot, cross, norm, axis, tangent, direction, transform, local, component, lineEnds, polygon, inside, intersection, reflect, refract, refractiveIndex, mirrorPoint, mirrorImage, lensDirection, accepts, validate, mediumAt, emission, spectrumColor, trace, example };
})();
