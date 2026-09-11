(() => {
  'use strict';
  const O = globalThis.OpticsPhysics, esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const n = (x) => Number(x.toFixed(3)), xy = (p) => `${n(p.x)} ${n(p.y)}`;
  const line = (a, b, cls, extra = '') => `<path d="M${xy(a)}L${xy(b)}" class="${cls}" ${extra}/>`;
  function arrow(a, b, cls, color) {
    const d = O.norm(O.sub(b, a)), normal = { x: -d.y, y: d.x }, left = O.add(O.sub(b, O.mul(d, 10)), O.mul(normal, 6)), right = O.sub(O.sub(b, O.mul(d, 10)), O.mul(normal, 6));
    return `<g class="${cls}" style="--light:${color}">${line(a, b, 'ob-arrow-shaft')}<path d="M${xy(left)}L${xy(b)}L${xy(right)}" class="ob-arrow-tip"/></g>`;
  }
  function screenSpots(hits) {
    const groups = new Map();
    for (const hit of hits) { const key = `${hit.componentId}:${hit.point.x.toFixed(2)}:${hit.point.y.toFixed(2)}`, group = groups.get(key); if (group) group.wavelengths.add(hit.wavelength); else groups.set(key, { ...hit, wavelengths: new Set([hit.wavelength]) }); }
    return [...groups.values()].map((h) => ({ ...h, color: h.wavelengths.size === 7 ? '#fff5d5' : h.color }));
  }
  function apparatus(c, selected) {
    const [a, b] = O.lineEnds(c), half = c.size / 2; let body = '';
    if (c.type === 'mirror') body = `${line(a, b, 'ob-mirror-back')}${line(O.add(a, O.mul(O.axis(c), -2)), O.add(b, O.mul(O.axis(c), -2)), 'ob-mirror-face')}`;
    if (c.type === 'lens' || c.type === 'diverging') {
      const shape = c.type === 'lens' ? `M0 ${-half}Q25 0 0 ${half}Q-25 0 0 ${-half}` : `M-13 ${-half}Q5 0 -13 ${half}L13 ${half}Q-5 0 13 ${-half}Z`;
      body = `<g transform="translate(${c.x} ${c.y}) rotate(${c.angle})"><path d="${shape}" class="ob-glass"/><path d="M0 ${-half}V${half}" stroke="#82c4d5" stroke-dasharray="3 5" opacity=".5"/></g>`;
    }
    if (c.type === 'prism' || c.type === 'glass') body = `<path d="M${O.polygon(c).map(xy).join('L')}Z" class="ob-glass"/>`;
    if (c.type === 'screen') { body = `${line(a, b, 'ob-screen-body')}${line(O.add(a, O.mul(O.axis(c), -4)), O.add(b, O.mul(O.axis(c), -4)), 'ob-screen-face')}`; for (const [p, sign] of [[a, '−'], [b, '＋']]) { const at = O.add(p, O.mul(O.axis(c), 18)); body += `<text x="${at.x}" y="${at.y + 5}" class="ob-caption">${sign}</text>`; } }
    if (c.type === 'filter') body = `${line(a, b, 'ob-filter', `style="--light:${{ red: '#fc6a69', green: '#7dd79e', blue: '#7aa6f0', all: '#ccd7da' }[c.pass]}"`)}`;
    if (c.type === 'aperture') { const t = O.tangent(c), gap = Math.min(c.gap, c.size); body = line(a, O.sub(c, O.mul(t, gap / 2)), 'ob-aperture') + line(O.add(c, O.mul(t, gap / 2)), b, 'ob-aperture'); }
    if (c.type === 'object') body = arrow(c, O.transform(c, { x: 0, y: -c.height }), 'ob-object', '#ffb67c') + `<circle cx="${c.x}" cy="${c.y}" r="6" fill="#ffb67c"/>`;
    if (c.type === 'beam') body = `<g transform="translate(${c.x} ${c.y}) rotate(${c.angle})"><rect x="-26" y="-13" width="42" height="26" rx="6" class="ob-source"/><path d="M-15 -6h13m-13 6h13m-13 6h13" stroke="#879ea9"/><rect x="13" y="-8" width="6" height="16" rx="2" fill="${c.on ? c.white ? '#fff2ce' : O.spectrumColor(c.wavelength) : '#647b87'}"/></g>`;
    const hit = c.type === 'object' ? line(c, O.transform(c, { x: 0, y: -c.height }), 'ob-item-hit') : ['mirror', 'lens', 'diverging', 'screen', 'filter', 'aperture'].includes(c.type) ? line(a, b, 'ob-item-hit') : '';
    const edgeY = ['prism', 'glass'].includes(c.type) ? Math.max(...O.polygon(c).map((p) => p.y)) : Math.max(a.y, b.y);
    const labelY = Math.min(580, c.type === 'beam' ? c.y + 33 : c.type === 'object' ? c.y + 27 : edgeY + 27);
    return `<g data-optic="${c.id}" tabindex="0" role="button" aria-label="${esc(c.label)} ${O.TYPES[c.type].name}，拖动移动" class="ob-item ${selected ? 'is-selected' : ''}">${body}${hit}<text x="${Math.max(70, Math.min(930, c.x))}" y="${labelY}" class="ob-item-label" text-anchor="middle">${esc(c.label)} · ${O.TYPES[c.type].name}</text><title>拖动移动；选中后可转动与调参</title></g>`;
  }
  function board(scene, result, selected, { virtual = true, normals = false } = {}) {
    let svg = '<defs><pattern id="obGrid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1" fill="#324554"/></pattern><clipPath id="obClip"><rect width="1000" height="600"/></clipPath></defs><rect width="1000" height="600" fill="#152535"/><rect width="1000" height="600" fill="url(#obGrid)"/><g clip-path="url(#obClip)">';
    svg += '<text x="20" y="27" class="ob-caption">拖动器材 · 拖圆形手柄旋转 · 方向键微调</text><path d="M25 555v8h100v-8" stroke="#8399a8" fill="none"/><text x="75" y="585" text-anchor="middle" class="ob-caption">10 cm</text>';
    for (const c of scene.parts.filter((c) => ['prism', 'glass'].includes(c.type))) svg += apparatus(c, c.id === selected);
    const segments = new Map();
    for (const ray of result.rays) for (const segment of ray.segments) {
      const key = [segment.a.x, segment.a.y, segment.b.x, segment.b.y].map((v) => v.toFixed(2)).join(','), found = segments.get(key);
      if (found) found.wavelengths.add(ray.wavelength); else segments.set(key, { ...segment, wavelengths: new Set([ray.wavelength]) });
    }
    for (const s of segments.values()) {
      const color = s.wavelengths.size === 7 ? '#fff5d5' : s.color, midpoint = O.add(s.a, O.mul(O.sub(s.b, s.a), .58));
      svg += line(s.a, s.b, 'ob-ray', `style="--light:${color}"`);
      if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 80) svg += arrow(O.sub(midpoint, O.mul(s.direction, 8)), O.add(midpoint, O.mul(s.direction, 4)), 'ob-ray-direction', color);
    }
    if (virtual) for (const image of result.virtuals) {
      svg += arrow(image.base, image.tip, 'ob-image', '#9be1db');
      svg += `<text x="${image.base.x}" y="${image.base.y + 25}" text-anchor="middle" class="ob-virtual-label">${esc(scene.parts.find((c) => c.id === image.objectId).label)}′ 虚像</text>`;
      for (const event of result.events.filter((e) => e.kind === 'mirror' && e.first && e.componentId === image.mirrorId && e.sourceId === image.objectId)) svg += line(event.point, image.tip, 'ob-virtual');
      const object = scene.parts.find((c) => c.id === image.objectId), mirror = scene.parts.find((c) => c.id === image.mirrorId), foot = O.mul(O.add(object, image.base), .5), shift = O.mul(O.tangent(mirror), 30);
      const a = O.add(object, shift), b = O.add(image.base, shift), m = O.add(foot, shift);
      svg += line(a, b, 'ob-distance');
      for (const p of [a, m, b]) svg += line(O.sub(p, O.mul(O.tangent(mirror), 5)), O.add(p, O.mul(O.tangent(mirror), 5)), 'ob-distance');
      for (const [left, right] of [[a, m], [m, b]]) { const p = O.add(O.mul(O.add(left, right), .5), O.mul(O.tangent(mirror), 18)); svg += `<text x="${p.x}" y="${p.y}" text-anchor="middle" class="ob-distance-label">${image.distance.toFixed(1)} cm</text>`; }
    }
    if (normals) for (const e of result.events.filter((e) => ['mirror', 'refraction', 'tir'].includes(e.kind)).filter((e, i, a) => a.findIndex((k) => k.componentId === e.componentId && Math.hypot(k.point.x - e.point.x, k.point.y - e.point.y) < 4) === i)) svg += line(O.sub(e.point, O.mul(e.normal, 24)), O.add(e.point, O.mul(e.normal, 24)), 'ob-normal');
    for (const c of scene.parts.filter((c) => !['prism', 'glass'].includes(c.type))) svg += apparatus(c, c.id === selected);
    for (const hit of screenSpots(result.hits)) svg += `<circle cx="${hit.point.x}" cy="${hit.point.y}" r="4" fill="${hit.color}" class="ob-hit"/>`;
    const c = scene.parts.find((c) => c.id === selected);
    if (c) {
      const projected = O.transform(c, { x: 65, y: 0 }), handle = { x: Math.max(18, Math.min(982, projected.x)), y: Math.max(18, Math.min(582, projected.y)) };
      svg += line(c, handle, 'ob-rotation-line') + `<g data-rotate="${c.id}" tabindex="0" role="button" aria-label="旋转 ${esc(c.label)}" class="ob-rotate"><circle cx="${handle.x}" cy="${handle.y}" r="12"/><text x="${handle.x}" y="${handle.y + 5}" text-anchor="middle">↻</text></g>`;
      if (['lens', 'diverging'].includes(c.type)) for (const sign of [-1, 1]) { const f = O.add(c, O.mul(O.axis(c), Math.abs(c.focal) * O.SCALE * sign)); svg += `<g class="ob-focus"><circle cx="${f.x}" cy="${f.y}" r="3"/><text x="${f.x}" y="${f.y + 18}" text-anchor="middle">F</text></g>`; }
    }
    if (!scene.parts.length) svg += '<text x="500" y="260" text-anchor="middle" class="ob-empty">从一束光开始搭建</text><text x="500" y="295" text-anchor="middle" class="ob-caption">添加光源，再放入镜面、透镜、棱镜或光屏。</text>';
    return svg + '</g>';
  }
  globalThis.OpticsDrawing = { board, apparatus, arrow, screenSpots, esc };
})();
