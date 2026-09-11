(() => {
  'use strict';
  const M = globalThis.Mechanics;
  const I = globalThis.MechanicsInteraction;
  if (!M || !I) throw new Error('力学模型未加载');

  const WORLD = { width: 1000, height: 620 };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function localPoint(part, point) {
    const dx = point.x - part.x, dy = point.y - part.y;
    const cos = Math.cos(-part.angle), sin = Math.sin(-part.angle);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  function partContains(part, point) {
    const local = localPoint(part, point);
    if (part.type === 'lever') {
      const left = (-5 - part.pivot) * 30 - 18;
      const right = (5 - part.pivot) * 30 + 18;
      return local.x >= left && local.x <= right && local.y >= -25 && local.y <= 12;
    }
    if (part.type === 'fixed' || part.type === 'moving') return distance(part, point) <= 44;
    if (part.type === 'beam') return Math.abs(local.x) <= 82 && Math.abs(local.y) <= 28;
    if (part.type === 'weight') return Math.abs(local.x) <= 14 && local.y >= -31 && local.y <= 40;
    if (part.type === 'scale') return Math.abs(local.x) <= 38 && local.y >= -62 && local.y <= 62;
    if (part.type === 'anchor') return Math.abs(local.x) <= 38 && local.y >= -32 && local.y <= 38;
    return false;
  }

  function lineDistance(point, line) {
    const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y;
    const square = dx * dx + dy * dy;
    const t = clamp(square ? ((point.x - line.a.x) * dx + (point.y - line.a.y) * dy) / square : 0, 0, 1);
    return distance(point, { x: line.a.x + dx * t, y: line.a.y + dy * t });
  }

  function ropeHit(scene, point) {
    const posed = M.positions(scene);
    for (let ri = scene.ropes.length - 1; ri >= 0; ri--) {
      const rope = scene.ropes[ri];
      try {
        const first = M.point(posed, rope.nodes[0]);
        const last = M.point(posed, rope.nodes.at(-1));
        if (distance(point, first) <= 20) return { kind: 'rope-end', ropeId: rope.id, end: 0 };
        if (distance(point, last) <= 20) return { kind: 'rope-end', ropeId: rope.id, end: 1 };
        const geometry = M.ropeGeometry(posed, rope);
        if (geometry.lines.some((line) => lineDistance(point, line) <= 13)) return { kind: 'rope', ropeId: rope.id };
        if (geometry.arcs.some((arc) => Math.abs(distance(point, arc.center) - M.RADIUS) <= 13)) return { kind: 'rope', ropeId: rope.id };
      } catch { /* Invalid geometry remains selectable from the list, not the drawing. */ }
    }
    return null;
  }

  function hitTest(scene, point) {
    const posed = M.positions(scene);
    const rope = ropeHit(scene, point);
    // End handles intentionally win over component bodies so a rope attached to
    // a weight or scale can still be grabbed and reconnected directly.
    if (rope?.kind === 'rope-end') return rope;
    const parts = [...posed.values()];
    for (let index = parts.length - 1; index >= 0; index--) {
      const current = parts[index];
      // The stand stays upright even when the beam tilts. Its target must not
      // cover the neighbouring hooks or the beam's own drag surface.
      if (current.type === 'lever' && Math.abs(point.x - current.x) <= 21 && point.y >= current.y + 13 && point.y <= current.y + 39) {
        return { kind: 'pivot', id: current.id };
      }
      if (partContains(current, point)) return { kind: 'part', id: current.id };
    }
    return rope;
  }

  function settleLevers(input) {
    const scene = M.clone(input);
    for (const lever of scene.parts.filter((item) => item.type === 'lever')) {
      const angle = M.leverAutoAngle(scene, lever.id);
      if (angle !== null) lever.angle = angle;
    }
    return scene;
  }

  function beginPivotDrag(scene, id) {
    const current = M.positions(scene).get(id);
    if (!current || current.type !== 'lever') throw new Error('没有找到杠杆支点');
    return { scene: M.clone(scene), gesture: { kind: 'pivot', id, pointerId: null } };
  }

  function beginDrag(input, point, options = {}) {
    let scene = M.clone(input);
    const hit = options.hit || hitTest(scene, point);
    if (!hit) return { scene, gesture: null };
    if (hit.kind === 'pivot') return beginPivotDrag(scene, hit.id);
    if (hit.kind === 'rope-end') {
      return { scene, gesture: { ...hit, start: { ...point }, current: { ...point } } };
    }
    if (hit.kind === 'rope') {
      const rope = scene.ropes.find((item) => item.id === hit.ropeId);
      const grip = I.ropeGrip(scene, rope, point);
      const pose = M.positions(scene).get(grip.id);
      return {
        scene,
        gesture: {
          kind: 'rope-part',
          ropeId: hit.ropeId,
          id: grip.id,
          start: { ...point },
          origin: { x: pose.x, y: pose.y },
          gain: grip.gain,
        },
      };
    }
    const originalPose = M.positions(scene).get(hit.id);
    const id = options.individual ? hit.id : I.ropeAssemblyRoot(scene, hit.id) || hit.id;
    if (id === hit.id && scene.links.some((link) => link.child === hit.id)) scene = I.detached(scene, hit.id);
    const pose = M.positions(scene).get(id);
    return {
      scene,
      gesture: {
        kind: 'part',
        id,
        sourceId: hit.id,
        start: { ...point },
        offset: { x: point.x - pose.x, y: point.y - pose.y },
        originalPose,
        moved: false,
      },
    };
  }

  function moveDrag(input, gesture, point) {
    let scene = M.clone(input);
    if (!gesture) return scene;
    if (gesture.kind === 'pivot') {
      const lever = scene.parts.find((item) => item.id === gesture.id);
      if (!lever) return scene;
      const local = localPoint(lever, point);
      scene = I.pivot(scene, lever.id, lever.pivot + Math.round(local.x / 30));
      return settleLevers(scene);
    }
    if (gesture.kind === 'part') {
      I.translateAssembly(scene, gesture.id, point.x - gesture.offset.x, point.y - gesture.offset.y);
      gesture.moved = gesture.moved || distance(gesture.start, point) > 2;
      return settleLevers(scene);
    }
    if (gesture.kind === 'rope-part') {
      const dx = (point.x - gesture.start.x) * gesture.gain;
      const dy = (point.y - gesture.start.y) * gesture.gain;
      I.translateAssembly(scene, gesture.id, gesture.origin.x + dx, gesture.origin.y + dy);
      return settleLevers(scene);
    }
    if (gesture.kind === 'rope-end') {
      gesture.current = { x: clamp(point.x, 18, WORLD.width - 18), y: clamp(point.y, 18, WORLD.height - 18) };
    }
    return scene;
  }

  function endDrag(input, gesture, point, options = {}) {
    let scene = moveDrag(input, gesture, point);
    if (!gesture) return scene;
    if (gesture.kind === 'part' && options.snap !== false && gesture.id === gesture.sourceId) {
      const target = I.snapMount(scene, gesture.id);
      if (target) {
        try { scene = I.mount(scene, gesture.id, target.key); } catch { /* Keep the freely placed position. */ }
      }
    }
    if (gesture.kind === 'rope-end') {
      const target = nearestPort(scene, point, { includeWheels: false, radius: 28 });
      if (target) scene = reconnectRope(scene, gesture.ropeId, gesture.end, target.key);
    }
    return settleLevers(scene);
  }

  function nearestPort(scene, point, { includeWheels = true, radius = 28, exclude = [] } = {}) {
    const posed = M.positions(scene), hits = [];
    for (const current of posed.values()) {
      for (const port of M.ports(current)) {
        if (!includeWheels && port === 'wheel') continue;
        const key = `${current.id}:${port}`;
        if (exclude.includes(key)) continue;
        const at = M.endpoint(current, port), gap = distance(point, at);
        if (gap <= (port === 'wheel' ? M.RADIUS + 14 : radius)) hits.push({ key, at, distance: gap, wheel: port === 'wheel' });
      }
    }
    return hits.sort((a, b) => a.distance - b.distance)[0] || null;
  }

  function reconnectRope(input, ropeId, end, key) {
    const scene = M.clone(input), rope = scene.ropes.find((item) => item.id === ropeId);
    if (!rope) throw new Error('没有找到这根绳子');
    M.point(M.positions(scene), key);
    rope.nodes[end ? rope.nodes.length - 1 : 0] = key;
    return scene;
  }

  function createRope(input, nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) throw new Error('一根绳子至少需要两个接点');
    const scene = M.clone(input), posed = M.positions(scene);
    const first = posed.get(nodes[0].split(':')[0]), last = posed.get(nodes.at(-1).split(':')[0]);
    if (!first || !last || nodes[0].endsWith(':wheel') || nodes.at(-1).endsWith(':wheel')) throw new Error('绳端必须连接固定端、钩码或测力计');
    nodes.forEach((key) => M.point(posed, key));
    const serial = scene.ropes.reduce((max, rope) => Math.max(max, Number(rope.id.replace(/\D/g, '')) || 0), 0) + 1;
    return I.route(scene, nodes, `r${serial}`);
  }

  function canvasPoint(canvas, event, view = { x: 0, y: 0, scale: 1 }) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(view.x + (event.clientX - rect.left) * WORLD.width / rect.width / view.scale, 0, WORLD.width),
      y: clamp(view.y + (event.clientY - rect.top) * WORLD.height / rect.height / view.scale, 0, WORLD.height),
    };
  }

  function bindPointerDrag(surface, host, handlers, options = {}) {
    const usePointer = options.pointerEvents !== false;
    const registrations = [];
    let active = null;
    const on = (target, type, handler, config) => {
      target.addEventListener(type, handler, config);
      registrations.push(() => target.removeEventListener(type, handler, config));
    };
    const safePrevent = (event) => { if (event.cancelable !== false) event.preventDefault?.(); };
    const begin = (event, key, source = event) => {
      if (active || source.button !== undefined && source.button !== 0) return;
      if (handlers.start(source) === false) return;
      active = key;
      safePrevent(event);
      try { surface.setPointerCapture?.(source.pointerId); } catch { /* Window listeners are the reliable fallback. */ }
    };
    const move = (event, key, source = event) => {
      if (active !== key) return;
      safePrevent(event);
      handlers.move(source);
    };
    const end = (event, key, source = event, cancelled = false) => {
      if (active !== key) return;
      safePrevent(event);
      active = null;
      (cancelled ? handlers.cancel : handlers.end)(source);
    };
    if (usePointer) {
      on(surface, 'pointerdown', (event) => begin(event, `p${event.pointerId}`, event));
      on(host, 'pointermove', (event) => move(event, `p${event.pointerId}`, event));
      on(host, 'pointerup', (event) => end(event, `p${event.pointerId}`, event));
      on(host, 'pointercancel', (event) => end(event, `p${event.pointerId}`, event, true));
    } else {
      on(surface, 'mousedown', (event) => begin(event, 'mouse', event));
      on(host, 'mousemove', (event) => move(event, 'mouse', event));
      on(host, 'mouseup', (event) => end(event, 'mouse', event));
      const touch = (event, identifier) => [...(event.changedTouches || []), ...(event.touches || [])].find((item) => item.identifier === identifier);
      on(surface, 'touchstart', (event) => {
        const source = event.changedTouches?.[0];
        if (source) begin(event, `t${source.identifier}`, source);
      }, { passive: false });
      on(host, 'touchmove', (event) => {
        if (!active?.startsWith('t')) return;
        const source = touch(event, Number(active.slice(1)));
        if (source) move(event, active, source);
      }, { passive: false });
      on(host, 'touchend', (event) => {
        if (!active?.startsWith('t')) return;
        const source = touch(event, Number(active.slice(1)));
        if (source) end(event, active, source);
      }, { passive: false });
      on(host, 'touchcancel', (event) => {
        if (!active?.startsWith('t')) return;
        const source = touch(event, Number(active.slice(1))) || { clientX: 0, clientY: 0 };
        end(event, active, source, true);
      }, { passive: false });
    }
    on(host, 'blur', (event) => {
      if (!active) return;
      active = null;
      handlers.cancel(event);
    });
    return () => { active = null; registrations.splice(0).forEach((remove) => remove()); };
  }

  globalThis.MechanicsWorkbench = {
    WORLD,
    partContains,
    hitTest,
    beginDrag,
    beginPivotDrag,
    moveDrag,
    endDrag,
    settleLevers,
    nearestPort,
    reconnectRope,
    createRope,
    canvasPoint,
    bindPointerDrag,
  };
})();
