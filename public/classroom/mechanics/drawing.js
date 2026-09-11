(() => {
  'use strict';
  const M = globalThis.Mechanics;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const number = (n) => n === null || n === undefined ? '—' : Number(n.toFixed(1)).toString();
  const supportBounds = (c) => ({ x: c.x - 18, y: c.y + 9, width: 36, height: 24 });
  function port(c, key, at, active, name, wired = false) {
    return `<g data-port="${key}" tabindex="0" role="button" aria-label="${esc(name(key))}，${wired ? '拖动位置改变绳角' : '拖出绳索'}" class="ml-port ${active ? 'is-pending' : ''} ${wired ? 'is-wired' : ''}"><circle class="ml-port-hit" cx="${at.x}" cy="${at.y}" r="${c.type === 'lever' || c.type === 'beam' ? 11 : c.type === 'weight' ? 9 : 14}"/><circle class="ml-port-dot" cx="${at.x}" cy="${at.y}" r="${c.type === 'lever' || c.type === 'beam' ? 5 : 7}"/><title>${esc(name(key))} · ${wired ? '拖动位置改变绳角；“穿绳／改接”可换挂钩，Shift 可另穿新绳' : '拖出绳索'}</title></g>`;
  }
  function part(c, options, handles = false) {
    const { scene, result, selected, pending, attachParent, name, rotation } = options, { x, y } = c;
    if (handles) return M.ports(c).map((key) => {
      const full = `${c.id}:${key}`;
      if (key === 'wheel') return `<g data-port="${full}" tabindex="0" role="button" aria-label="${esc(name(full))}" class="ml-wheel-target ${pending.includes(full) ? 'is-pending' : ''}"><circle cx="${x}" cy="${y}" r="30" class="ml-port-ring"/><title>把绳端拖过轮缘，或点击穿绕</title></g>`;
      return port(c, full, M.endpoint(c, key), pending.includes(full) || attachParent === full, name, scene.ropes.some((r) => r.nodes[0] === full || r.nodes.at(-1) === full));
    }).join('');
    let body = '', labelY = y - 43, labelX = x; const label = c.label;
    if (c.type === 'lever') {
      const left = M.endpoint(c, 's-5'), bounds = supportBounds(c); labelX = left.x - 28; labelY = left.y + 5;
      body = `<g data-pivot="${c.id}" tabindex="0" role="button" aria-label="拖动 ${esc(c.label)} 支点" class="ml-pivot"><rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="transparent"/><path d="M${x} ${y + 10}l-12 17h24Z" class="ml-fulcrum"/><path d="M${x - 18} ${y + 31}h36" class="ml-foot"/><title>左右拖动支点，钩码保持原位置</title></g><g transform="translate(${x} ${y}) rotate(${c.angle * 180 / Math.PI})"><rect x="${(-5 - c.pivot) * 30 - 12}" y="-9" width="324" height="18" rx="6" class="ml-body ml-lever-bar"/><path d="M${(-5 - c.pivot) * 30 - 5} -4h310" stroke="#fff5c9" stroke-width="2"/>${Array.from({ length: 11 }, (_, i) => `<path d="M${(i - 5 - c.pivot) * 30} -10v-5" stroke="#ad955b"/><text x="${(i - 5 - c.pivot) * 30}" y="-24" text-anchor="middle" class="ml-tick-label">${i - 5 > 0 ? '+' : ''}${i - 5}</text>`).join('')}</g>`;
    } else if (c.type === 'fixed' || c.type === 'moving') {
      labelX = x + 43; labelY = y + 5;
      const mounted = scene.links.some((l) => l.child === c.id);
      body = `${c.type === 'fixed' && !mounted ? `<path d="M${x - 20} ${y - 65}h40m-32 -5-8 5m18 -5-8 5m18 -5-8 5m18 -5-8 5M${x} ${y - 65}v33" class="ml-support"/>` : ''}<path d="M${x - 17} ${y - 23}Q${x - 34} ${y + 20} ${x} ${y + 42}Q${x + 34} ${y + 20} ${x + 17} ${y - 23}" class="ml-support"/><circle cx="${x}" cy="${y}" r="25" class="ml-body ml-wheel-disc"/><circle cx="${x}" cy="${y}" r="19" fill="none" stroke="#afc3ce" stroke-width="1.5"/><g transform="rotate(${rotation(c)} ${x} ${y})">${[0, 60, 120].map((a) => `<path d="M${x - 17} ${y}h34" class="ml-wheel-spoke" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g><circle cx="${x}" cy="${y}" r="6" fill="#617d90"/><circle cx="${x - 1}" cy="${y - 1}" r="2" fill="#ecf3f6"/>`;
    } else if (c.type === 'weight') {
      labelY = y + 46;
      body = `<path d="M${x - 7} ${y - 19}h14v6h-14Z" fill="#7292a6"/><rect x="${x - 14}" y="${y - 13}" width="28" height="43" rx="5" class="ml-body ml-weight-body"/><path d="M${x - 10} ${y - 9}v34" stroke="#8bb3cb" stroke-width="2"/><text x="${x + 1}" y="${y + 4}" text-anchor="middle" class="ml-weight-number">${number(c.mass)}</text><text x="${x + 1}" y="${y + 19}" text-anchor="middle" class="ml-weight-unit">kg</text>`;
    } else if (c.type === 'beam') {
      labelY = y + 31;
      body = `<rect x="${x - 69}" y="${y - 6}" width="138" height="12" rx="4" class="ml-body ml-crossbar"/>`;
    } else if (c.type === 'scale') {
      const meter = result.meters.find((m) => m.id === c.id), stretch = Math.min(1, (meter?.tension || 0) / c.range) * 10; labelY = y + 76;
      body = `<rect x="${x - 20}" y="${y - 38}" width="40" height="99" rx="12" class="ml-body ml-scale-body"/><path d="M${x} ${y - 50}v25l-7 4 14 5-14 5 14 5-14 5 14 5-7 ${5 + stretch}v5" class="ml-spring"/><path d="M${x - 9} ${y + 22 + stretch}h18" stroke="#c47b30" stroke-width="2"/><rect x="${x - 16}" y="${y + 37}" width="32" height="17" rx="4" fill="#e6eef2"/><text x="${x}" y="${y + 49}" text-anchor="middle" class="ml-scale-number">${number(meter?.tension)}</text><text x="${x + 27}" y="${y + 49}" class="ml-caption">N</text>`;
    } else {
      labelX = x + 32; labelY = y + 4;
      body = `<path d="M${x - 18} ${y - 19}h36m-28 -5-8 5m18 -5-8 5m18 -5-8 5M${x} ${y - 19}v19" class="ml-support"/>`;
    }
    return `<g data-part="${c.id}" tabindex="0" role="button" aria-label="选择 ${esc(c.label)} ${M.TYPES[c.type].name}，拖动移动${c.type === 'weight' ? '或换挂点' : ''}" class="ml-component ml-part-${c.type}${selected === c.id ? ' is-selected' : ''}">${c.type === 'weight' ? `<rect x="${x - 20}" y="${y - 13}" width="40" height="46" fill="transparent"/>` : ''}${body}<text x="${labelX}" y="${labelY}" text-anchor="middle" class="ml-label">${esc(label)}</text><title>${esc(c.label)} ${M.TYPES[c.type].name} · 拖动${c.type === 'weight' ? '换挂点，移到空白处取下' : '调整位置'}</title></g>`;
  }
  globalThis.MechanicsDrawing = { part, port, supportBounds };
})();
