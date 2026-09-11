(() => {
  'use strict';
  const M = globalThis.Mechanics, I = globalThis.MechanicsInteraction;
  function install(h) {
    const board = h.board, eventTarget = h.eventTarget || globalThis; let gesture = null, frame = 0, pan = null, lastMoveEvent = null, lastFinishEvent = null;
    const pointAt = (e) => { const r = board.getBoundingClientRect(); return { x: (e.clientX - r.left) * 1000 / r.width, y: (e.clientY - r.top) * 650 / r.height }; };
    const closest = (e, selector) => {
      const direct = typeof e.target?.closest === 'function' ? e.target.closest(selector) : null;
      if (direct) return direct;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      return path.find((node) => typeof node?.matches === 'function' && node.matches(selector)) || null;
    };
    const repaint = () => { if (!frame) frame = h.frame(() => { frame = 0; h.renderPreview(); }); };
    const stopRepaint = () => { if (frame) h.cancelFrame(frame); frame = 0; };
    const eatClick = () => { h.suppressClick = true; h.defer(() => { h.suppressClick = false; }, 0); };
    const capture = (e) => { try { board.setPointerCapture?.(e.pointerId); } catch { /* Window listeners keep the drag alive when capture is unavailable. */ } e.preventDefault?.(); };
    const movedEnough = (g, e) => Math.hypot(e.clientX - g.screenX, e.clientY - g.screenY) >= (e.pointerType === 'touch' ? 4 : 2);
    function hasCapture(id) { try { return !!board.hasPointerCapture?.(id); } catch { return false; } }
    function releaseCapture(id) { try { if (hasCapture(id)) board.releasePointerCapture?.(id); } catch { /* Capture may already belong to another SVG node. */ } }
    function wireGesture(e, at, extra = {}) { gesture = { pointer: e.pointerId, last: at, start: at, screenX: e.clientX, screenY: e.clientY, moved: false, ...extra }; capture(e); }
    function beginRewire(id, end = null) {
      h.clearMotion(false); h.cancelConnect(); const rope = h.scene.ropes.find((r) => r.id === id); if (!rope) return;
      h.editingRope = id; h.pending = end === null ? [rope.nodes[0]] : (end === 0 ? [...rope.nodes].reverse() : [...rope.nodes]).slice(0, -1);
      h.wireSides = Object.fromEntries(h.pending.filter((k) => k.endsWith(':wheel')).map((k) => [k, h.scene.parts.find((p) => p.id === k.split(':')[0]).wrap]));
      h.selected = id; h.cursor = M.point(M.positions(h.scene), end === null ? rope.nodes[0] : end === 0 ? rope.nodes[0] : rope.nodes.at(-1));
      h.beginPreview(); h.announce(end === null ? '从原起点重新穿绳；经过轮缘，再放到末端挂钩。Esc 取消。' : '拖到新挂钩改接；途中可以继续绕轮。Esc 保留原绳。'); h.renderBoard();
    }
    function beginRopeMove(e, at, rope, end = null) {
      h.clearMotion(false); h.cancelConnect();
      let grip; try { grip = I.ropeGrip(h.scene, rope, at, end); } catch (error) { h.announce(error.message); return; }
      const c = h.scene.parts.find((p) => p.id === grip.id); h.selected = rope.id;
      h.drag = { id: c.id, pointer: e.pointerId, start: at, screenX: e.clientX, screenY: e.clientY, x: c.x, y: c.y, before: M.clone(h.scene), moved: false, ropeAdjust: true, gain: grip.gain };
      capture(e); h.announce(`拖动调整 ${h.name(grip.key)} 的位置与绳角，拉力实时更新。切换“穿绳／改接”可改变连接。`);
    }
    function cancel() {
      const pointer = h.drag?.pointer ?? gesture?.pointer ?? pan?.pointer; stopRepaint(); if (h.drag) h.scene = h.drag.before;
      h.drag = null; h.snapTarget = null; gesture = null; pan = null; h.cancelConnect(); if (pointer !== undefined) releaseCapture(pointer); h.endPreview(); h.render();
    }
    function visitWheels(from, to) {
      const ignore = gesture?.ignoreWheel;
      if (ignore) { const p = M.point(M.positions(h.scene), ignore); if (Math.hypot(to.x - p.x, to.y - p.y) > M.RADIUS + 20) gesture.ignoreWheel = null; }
      for (const found of I.wheelHits(h.scene, from, to, [...h.pending, ...h.wireTail, ...(ignore ? [ignore] : [])])) h.connectPort(found.key, true, true);
      const positions = M.positions(h.scene);
      for (const key of h.pending.filter((k) => k.endsWith(':wheel'))) { const p = M.point(positions, key), dy = to.y - p.y, d = Math.hypot(to.x - p.x, dy); if (d >= M.RADIUS * .65 && d <= M.RADIUS + 15 && Math.abs(dy) > M.RADIUS * .6) h.wireSides[key] = dy > 0 ? 'bottom' : 'top'; }
    }
    function beginSection(g) {
      const rope = h.scene.ropes.find((r) => r.id === g.ropeId); if (!rope) return false;
      let section; try { section = I.ropeSection(h.scene, rope, g.start); } catch (error) { h.announce(error.message); return false; }
      if (section.end !== undefined) { beginRewire(rope.id, section.end); return true; }
      h.clearMotion(false); h.cancelConnect(); h.editingRope = rope.id; h.selected = rope.id; h.pending = section.prefix; h.wireTail = section.tail; g.ignoreWheel = section.removed; g.section = true;
      h.wireSides = Object.fromEntries(rope.nodes.filter((k) => k.endsWith(':wheel') && k !== section.removed).map((k) => [k, h.scene.parts.find((p) => p.id === k.split(':')[0]).wrap]));
      h.cursor = g.start; h.beginPreview(); h.announce(section.removed ? '已提起这段绳。松手从当前滑轮取下，或拖到其他轮缘改绕；两端保留。' : '把这段绳拖过空轮缘，再松手挂上；绳的两端和其余绕法保留。'); h.renderBoard(); return true;
    }
    board.addEventListener('pointerdown', (e) => {
      if ((e.button ?? 0) !== 0 || gesture || h.drag || pan) return;
      const at = pointAt(e), end = closest(e, '[data-wire-end]'), pivot = closest(e, '[data-pivot]');
      if (end) { const key = end.dataset.wireEnd, split = key.lastIndexOf(':'), id = key.slice(0, split), which = Number(key.slice(split + 1)); if (h.mode === 'move' && !h.pending.length) beginRopeMove(e, at, h.scene.ropes.find((r) => r.id === id), which); else { beginRewire(id, which); wireGesture(e, at); } return; }
      const port = closest(e, '[data-port]'), near = h.pending.length && !h.wireTail.length ? I.hitPort(h.scene, at) : null;
      if (port && !h.pending.length && ['move', 'rope'].includes(h.mode) && !port.dataset.port.endsWith(':wheel') && !e.shiftKey) {
        const key = port.dataset.port, connected = h.scene.ropes.filter((r) => r.nodes[0] === key || r.nodes.at(-1) === key);
        if (connected.length === 1 || h.mode === 'move' && connected.length) { const rope = connected[0], which = rope.nodes[0] === key ? 0 : 1; if (h.mode === 'move') beginRopeMove(e, at, rope, which); else { beginRewire(rope.id, which); wireGesture(e, at, { automaticRewire: true }); } return; }
      }
      if (h.mode !== 'hang' && !pivot && (port && !port.dataset.port.endsWith(':wheel') || near || h.mode === 'rope' && port)) {
        const key = port?.dataset.port || near?.key; if (!key) return; if (!h.pending.length || key.endsWith(':wheel')) h.connectPort(key, true, true); if (!h.pending.length) return;
        wireGesture(e, at); h.cursor = at; h.beginPreview(); h.renderBoard(); return;
      }
      const ropeNode = closest(e, '[data-rope]');
      if (ropeNode) { if (h.mode === 'move' && !h.pending.length) { beginRopeMove(e, at, h.scene.ropes.find((r) => r.id === ropeNode.dataset.rope)); return; } h.clearMotion(false); h.selected = ropeNode.dataset.rope; wireGesture(e, at, { ropeId: h.selected, dormant: true }); h.renderBoard(); return; }
      const node = closest(e, '[data-part]');
      if (!node && !pivot) {
        if (h.scroller && !h.pending.length) { pan = { pointer: e.pointerId, x: e.clientX, scroll: h.scroller.scrollLeft }; capture(e); }
        return;
      }
      h.clearMotion(false); if (h.pending.length) h.cancelConnect(); h.selected = pivot?.dataset.pivot || node.dataset.part;
      const picked = h.selected, coupledRoot = pivot || typeof I.ropeAssemblyRoot !== 'function' ? null : I.ropeAssemblyRoot(h.scene, picked), dragId = coupledRoot || picked;
      const posed = M.positions(h.scene).get(dragId); h.drag = { id: dragId, picked, coupled: !!coupledRoot, pointer: e.pointerId, start: at, screenX: e.clientX, screenY: e.clientY, x: posed.x, y: posed.y, before: M.clone(h.scene), moved: false, pivot: !!pivot };
      // Keep the actual hit element connected until the browser finishes pointerdown.
      capture(e);
    });
    function updatePointer(e) {
      if (lastMoveEvent === e) return; lastMoveEvent = e;
      if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return; const at = pointAt(e);
      if (pan) { if (e.pointerId === pan.pointer) h.scroller.scrollLeft = pan.scroll + pan.x - e.clientX; return; }
      if (gesture) {
        if (e.pointerId !== gesture.pointer) return;
        if (!gesture.moved && movedEnough(gesture, e)) { if (gesture.dormant && !beginSection(gesture)) return; gesture.dormant = false; gesture.moved = true; }
        if (!gesture.moved) return; visitWheels(gesture.last, at); gesture.last = at; h.cursor = at;
        h.wireHover = h.wireTail.length ? null : I.hitPort(h.scene, at, { wheels: false, exclude: h.pending, radius: e.pointerType === 'touch' ? 27 : 21 }); repaint(); return;
      }
      if (!h.drag) { if (h.pending.length) { h.cursor = at; h.wireHover = h.wireTail.length ? null : I.hitPort(h.scene, at, { wheels: false, exclude: h.pending }); repaint(); } return; }
      const d = h.drag; if (e.pointerId !== d.pointer) return; const dx = at.x - d.start.x, dy = at.y - d.start.y; if (!d.moved && !movedEnough(d, e)) return;
      if (!d.moved) {
        if (d.coupled && e.altKey) { const pose = M.positions(h.scene).get(d.picked); h.scene = I.detached(h.scene, d.picked); Object.assign(d, { id: d.picked, x: pose.x, y: pose.y, coupled: false }); }
        h.beginPreview(d.ropeAdjust || d.coupled || h.scene.ropes.length > 0);
        if (!d.pivot && !d.ropeAdjust && !d.coupled) { h.scene = I.detached(h.scene, d.id); d.targets = I.mountTargets(h.scene, d.id); }
      }
      if (d.ropeAdjust) { d.moved = true; I.translateAssembly(h.scene, d.id, d.x + dx * d.gain, d.y + dy * d.gain); repaint(); return; }
      if (d.coupled) { d.moved = true; I.translateAssembly(h.scene, d.id, d.x + dx, d.y + dy); h.announce('整套负载随指针移动，滑轮与绳形、绳角和拉力实时更新；按住 Alt 可只取下当前器材。'); repaint(); return; }
      if (d.pivot) { const c = d.before.parts.find((p) => p.id === d.id), projected = (dx * Math.cos(c.angle) + dy * Math.sin(c.angle)) / 30; h.scene = I.pivot(d.before, d.id, c.pivot + projected); d.moved = true; h.announce('拖动中保持杆身位置；松手后将按新的两侧力矩自动倾斜。'); repaint(); return; }
      d.moved = true; const c = h.scene.parts.find((p) => p.id === d.id); c.x = d.x + dx; c.y = d.y + dy; I.clampPart(c);
      h.snapTarget = h.snapping && !e.altKey ? I.snapMount(h.scene, d.id, { targets: d.targets, previous: h.snapTarget?.key }) : null;
      h.announce(h.snapTarget ? `松手挂到 ${h.name(h.snapTarget.key)}；关闭自动挂接或按住 Alt 可自由放置。` : '器材跟随指针自由移动，松手放置；靠近挂点可悬挂。'); repaint();
    }
    board.addEventListener('pointermove', updatePointer);
    function finish(e) {
      if (lastFinishEvent === e) return; lastFinishEvent = e;
      // Devices may coalesce the final move into the release event.
      if (e.type === 'pointerup') updatePointer(e);
      if (pan && e.pointerId === pan.pointer) { const id = pan.pointer; pan = null; releaseCapture(id); return; }
      if (gesture && e.pointerId === gesture.pointer) {
        const g = gesture; gesture = null; stopRepaint();
        if (!g.moved && g.ropeId) { h.selected = g.ropeId; h.cancelConnect(); }
        else if (e.type !== 'pointerup') { h.cancelConnect(); h.announce('已取消本次穿绳，原装置保留。'); }
        else if (g.automaticRewire && !g.moved) { h.cancelConnect(); h.announce('已选中绳索。抓住绳段或圆形绳端即可改绕、改接。'); }
        else if (g.section) {
          try { const next = I.route(h.scene, [...h.pending, ...h.wireTail], h.editingRope, h.editingRope, h.wireSides); h.remember(); h.scene = next; h.cancelConnect(); h.announce('这段绳已重新穿绕，其余接点保留；可继续抓住绳段调整。'); }
          catch (error) { h.cancelConnect(); h.announce(`${error.message}；原绳已保留。`); }
        } else { const at = pointAt(e), end = I.hitPort(h.scene, at, { wheels: false, exclude: h.pending, radius: e.pointerType === 'touch' ? 27 : 21 }); if (end) h.connectPort(end.key, true); else { h.cursor = at; h.announce('绳端暂放在这里。继续点击轮槽或另一挂钩完成；Esc 取消。'); } }
        eatClick(); releaseCapture(g.pointer); h.endPreview(); h.render(); return;
      }
      const d = h.drag; if (!d || e.pointerId !== d.pointer) return; stopRepaint(); h.drag = null;
      if (d.moved) {
        if (e.type !== 'pointerup') { h.scene = d.before; h.announce('已取消拖动，器材回到原位。'); }
        else {
          if (h.snapTarget && !d.pivot) { try { h.scene = I.mount(h.scene, d.id, h.snapTarget.key); h.announce(`已挂到 ${h.name(h.snapTarget.key)}。可以继续拖动换位。`); } catch (error) { h.scene = d.before; h.announce(error.message); } }
          else h.announce(d.ropeAdjust || d.coupled ? '绳形、绳角与拉力已更新。可继续拖动钩码、滑轮或绳端比较。' : d.pivot ? '支点已移动；杠杆将按新的合力矩显示下沉方向。' : '器材已自由放置，可随时拖回挂点。'); h.remember(d.before);
        }
        eatClick();
      }
      h.snapTarget = null; releaseCapture(d.pointer); h.endPreview(); h.render();
    }
    board.addEventListener('pointerup', finish); board.addEventListener('pointercancel', finish);
    eventTarget.addEventListener?.('pointermove', updatePointer, { passive: false });
    eventTarget.addEventListener?.('pointerup', finish);
    eventTarget.addEventListener?.('pointercancel', finish);
    eventTarget.addEventListener?.('blur', () => { if (h.drag || gesture || pan) cancel(); });
    board.addEventListener('lostpointercapture', (e) => {
      // A child's implicit capture may end while capture is transferred to the board.
      if (e.target === board && !hasCapture(e.pointerId)) finish(e);
    });
    return { cancel, beginRewire, pointAt };
  }
  globalThis.MechanicsControls = { install };
})();
