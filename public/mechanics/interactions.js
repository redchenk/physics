(() => {
  'use strict';
  const M = globalThis.Mechanics;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function descendants(scene, id) {
    const ids = new Set([id]); let changed = true;
    while (changed) { changed = false; for (const l of scene.links) if (ids.has(l.parent.split(':')[0]) && !ids.has(l.child)) { ids.add(l.child); changed = true; } }
    return ids;
  }
  function detached(scene, id) {
    const next = M.clone(scene), posed = M.positions(scene).get(id), child = next.parts.find((p) => p.id === id);
    next.links = next.links.filter((l) => l.child !== id); Object.assign(child, { x: posed.x, y: posed.y }); return next;
  }
  function mount(scene, id, parentKey) {
    const next = detached(scene, id), parent = next.parts.find((p) => p.id === parentKey.split(':')[0]), child = next.parts.find((p) => p.id === id);
    const above = parent.type === 'beam' && ['moving', 'fixed'].includes(child.type);
    const used = next.links.filter((l) => l.parent === parentKey).map((l) => l.dy);
    let dy = above ? -90 : 70; while (used.some((y) => Math.abs(y - dy) < 60)) dy += above ? -70 : 70;
    next.links.push({ child: id, parent: parentKey, dx: 0, dy });
    M.validate(next); const pose = M.positions(next).get(id); if (pose.y < 70 || pose.y > 580) throw new Error('这个挂点没有足够空间，请换一个挂点');
    return next;
  }
  function mountTargets(scene, id) {
    const positions = M.positions(scene), c = positions.get(id); if (!['weight', 'moving', 'fixed', 'beam'].includes(c?.type)) return [];
    const excluded = descendants(scene, id), candidates = [];
    for (const p of positions.values()) {
      if (excluded.has(p.id) || !['lever', 'beam', 'moving'].includes(p.type)) continue;
      for (const port of M.ports(p).filter((port) => port !== 'wheel')) {
        const at = M.endpoint(p, port), above = p.type === 'beam' && ['fixed', 'moving'].includes(c.type);
        try { const next = mount(scene, id, `${p.id}:${port}`); candidates.push({ key: `${p.id}:${port}`, at, pose: M.positions(next).get(id), above, radius: p.type === 'moving' ? 30 : 21 }); } catch { /* Invalid cycle or no room: not a drop target. */ }
      }
    }
    return candidates;
  }
  function snapMount(scene, id, { targets = null, previous = null } = {}) {
    const c = scene.parts.find((p) => p.id === id); if (!c) return null;
    return (targets || mountTargets(scene, id)).map((t) => {
      const dx = Math.abs(c.x - t.at.x), dy = c.y - t.at.y;
      if (dx > t.radius || (t.above ? dy < t.pose.y - t.at.y - 35 || dy > -20 : dy < -10 || dy > Math.max(110, t.pose.y - t.at.y + 35))) return null;
      return { ...t, score: dx + Math.abs(c.y - t.pose.y) * .06 - (t.key === previous ? 3 : 0) };
    }).filter(Boolean).sort((a, b) => a.score - b.score)[0] || null;
  }
  function ropeSection(scene, rope, at) {
    const posed = M.positions(scene), geometry = M.ropeGeometry(posed, rope);
    for (const end of [0, 1]) if (distance(at, M.point(posed, end ? rope.nodes.at(-1) : rope.nodes[0])) < 22) return { end };
    const choices = geometry.lines.map((l, index) => {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, t = Math.max(0, Math.min(1, ((at.x - l.a.x) * dx + (at.y - l.a.y) * dy) / (dx * dx + dy * dy)));
      return { distance: distance(at, { x: l.a.x + t * dx, y: l.a.y + t * dy }), index, arc: false };
    });
    for (const [index, arc] of geometry.arcs.entries()) {
      const start = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x), angle = Math.atan2(at.y - arc.center.y, at.x - arc.center.x), turn = arc.sweep ? 1 : -1;
      const along = ((angle - start) * turn % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (along <= arc.angle) choices.push({ distance: Math.abs(distance(at, arc.center) - M.RADIUS), index, arc: true });
    }
    const picked = choices.sort((a, b) => a.distance - b.distance || Number(b.arc) - Number(a.arc))[0];
    return { prefix: rope.nodes.slice(0, picked.index + 1), tail: rope.nodes.slice(picked.index + (picked.arc ? 2 : 1)), removed: picked.arc ? rope.nodes[picked.index + 1] : null, index: picked.index, arc: picked.arc };
  }
  function assemblyRoot(scene, id) {
    let link; while ((link = scene.links.find((l) => l.child === id))) id = link.parent.split(':')[0]; return id;
  }
  function ropeAssemblyRoot(scene, id) {
    let root = id, link;
    // A moving pulley, crossbar and everything hung below it form one rigid
    // load assembly. Grabbing any member should therefore move the assembly
    // which the rope actually supports, instead of silently detaching the load.
    while ((link = scene.links.find((item) => item.child === root))) {
      const parentId = link.parent.split(':')[0], parent = scene.parts.find((p) => p.id === parentId);
      if (!parent || !['moving', 'beam'].includes(parent.type)) break;
      root = parentId;
    }
    // If the rigid assembly is itself hung from a lever, keep the established
    // drag-to-rehang behaviour. It can still be detached explicitly or with Alt.
    if (scene.links.some((item) => item.child === root)) return null;
    const members = descendants(scene, root);
    return scene.ropes.some((rope) => rope.nodes.some((key) => members.has(key.split(':')[0]))) ? root : null;
  }
  function ropeGrip(scene, rope, at, end = null) {
    const section = end === null ? ropeSection(scene, rope, at) : { end };
    let key, gain = 1;
    if (section.end !== undefined) key = section.end ? rope.nodes.at(-1) : rope.nodes[0];
    else if (section.arc) key = rope.nodes[section.index + 1];
    else {
      const lines = M.ropeGeometry(M.positions(scene), rope).lines, line = lines[section.index];
      const t = Math.max(0, Math.min(1, ((at.x - line.a.x) * line.direction.x + (at.y - line.a.y) * line.direction.y) / line.length));
      const first = section.index === 0 && (lines.length > 1 || t < .5), last = section.index === lines.length - 1 && !first;
      key = first ? rope.nodes[0] : last ? rope.nodes.at(-1) : rope.nodes[section.index + (t < .5 ? 0 : 1)];
      // Moving an endpoint twice as far makes a grip at the middle follow the pointer.
      gain = 1 / Math.max(.25, first || !last && t < .5 ? 1 - t : t);
    }
    return { id: assemblyRoot(scene, key.split(':')[0]), key, gain };
  }
  function translateAssembly(scene, id, x, y) {
    const c = scene.parts.find((p) => p.id === id), posed = M.positions(scene), members = descendants(scene, id);
    let dx = x - c.x, dy = y - c.y;
    for (const member of members) {
      const p = posed.get(member), proposed = clampPart({ ...p, x: p.x + dx, y: p.y + dy });
      dx = proposed.x - p.x; dy = proposed.y - p.y;
    }
    c.x += dx; c.y += dy;
  }
  function hitPort(scene, at, { wheels = true, endpoints = true, exclude = [], radius = 19 } = {}) {
    const found = [];
    for (const c of M.positions(scene).values()) for (const port of M.ports(c)) {
      const key = `${c.id}:${port}`, wheel = port === 'wheel'; if (exclude.includes(key) || wheel && !wheels || !wheel && !endpoints) continue;
      const p = M.endpoint(c, port), d = distance(at, p); if (d <= (wheel ? M.RADIUS + 16 : radius)) found.push({ key, p, distance: d, score: wheel ? d + 20 : d });
    }
    return found.sort((a, b) => a.score - b.score)[0] || null;
  }
  function wheelHits(scene, from, to, exclude = []) {
    const dx = to.x - from.x, dy = to.y - from.y, square = dx * dx + dy * dy;
    return [...M.positions(scene).values()].filter((p) => ['fixed', 'moving'].includes(p.type) && !exclude.includes(`${p.id}:wheel`)).map((p) => {
      const t = Math.max(0, Math.min(1, square ? ((p.x - from.x) * dx + (p.y - from.y) * dy) / square : 0));
      return { key: `${p.id}:wheel`, t, distance: distance(p, { x: from.x + dx * t, y: from.y + dy * t }) };
    }).filter((p) => p.distance < M.RADIUS + 14).sort((a, b) => a.t - b.t);
  }
  function route(scene, nodes, id, editing = null, wraps = {}) {
    const next = M.clone(scene); next.ropes = next.ropes.filter((r) => r.id !== editing);
    const rope = { id, nodes: [...nodes] }; next.ropes.push(rope); M.validate(next);
    const geometry = M.ropeGeometry(M.positions(next), rope, { autoWrap: true, wraps });
    nodes.slice(1, -1).forEach((key, i) => { next.parts.find((p) => p.id === key.split(':')[0]).wrap = geometry.wraps[i]; });
    M.ropeGeometry(M.positions(next), rope); return next;
  }
  function pivot(scene, id, slot) {
    const next = M.clone(scene), c = next.parts.find((p) => p.id === id), value = Math.max(-4, Math.min(4, Math.round(slot))), offset = (value - c.pivot) * 30;
    c.x += offset * Math.cos(c.angle); c.y += offset * Math.sin(c.angle); c.pivot = value; return next;
  }
  function clampPart(c) {
    const cos = Math.cos(c.angle), left = c.type === 'lever' ? 24 + (5 + c.pivot) * 30 * cos : 42, right = c.type === 'lever' ? 976 - (5 - c.pivot) * 30 * cos : 958;
    c.x = Math.max(left, Math.min(right, c.x)); c.y = Math.max(['lever', 'fixed'].includes(c.type) ? 125 : 65, Math.min(c.type === 'scale' ? 555 : 560, c.y)); return c;
  }
  globalThis.MechanicsInteraction = { detached, mount, mountTargets, snapMount, hitPort, wheelHits, ropeSection, ropeGrip, assemblyRoot, ropeAssemblyRoot, translateAssembly, route, pivot, clampPart, descendants };
})();
