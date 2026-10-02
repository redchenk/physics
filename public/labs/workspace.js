/* Shared classroom helpers. Works with standalone files and embedded labs. */
(() => {
  'use strict';
  function createStore(key, validate, report, storage) {
    let adapter = storage, previous = null, blocked = false;
    try { if (adapter === undefined) adapter = globalThis.localStorage; } catch { adapter = null; }
    const status = (message) => report?.(message);
    return {
      load() {
        if (!adapter) { status('无法自动保存，请导出备份'); return null; }
        try {
          previous = adapter.getItem(key);
          if (!previous) return null;
          const value = validate(JSON.parse(previous));
          status('已恢复上次实验'); return value;
        } catch {
          blocked = true; status('原保存数据无法读取，已保留；请导出当前实验备份'); return null;
        }
      },
      save(value) {
        if (!adapter || blocked) return false;
        try {
          if (adapter.getItem(key) !== previous) {
            blocked = true; status('另一页面已更新实验；请先导出当前备份，再刷新'); return false;
          }
          const next = JSON.stringify(validate(value));
          if (next !== previous) { adapter.setItem(key, next); previous = next; }
          status('已自动保存在此浏览器'); return true;
        } catch { status('自动保存失败，请导出备份'); return false; }
      },
    };
  }

  function download(name, content, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function viewport({ board, stage, scroll, width, height, controls, output }) {
    let scale = 1, fitting = true;
    function apply() {
      const available = scroll.clientWidth || width;
      if (fitting) scale = Math.min(1, available / width);
      scale = Math.max(.25, Math.min(1.5, scale));
      stage.style.width = `${width * scale}px`; stage.style.height = `${height * scale}px`;
      board.style.width = `${width}px`; board.style.height = `${height}px`;
      board.style.transform = `scale(${scale})`; board.style.transformOrigin = 'top left';
      board.style.setProperty('--lab-hit-size', `${Math.max(22, 36 / scale)}px`);
      output.textContent = `${Math.round(scale * 100)}%`;
      controls.querySelectorAll('[data-lab-zoom]').forEach((button) => {
        if (button.dataset.labZoom === 'fit') button.setAttribute('aria-pressed', String(fitting));
      });
    }
    controls.addEventListener('click', (event) => {
      const action = event.target.closest('[data-lab-zoom]')?.dataset.labZoom;
      if (!action) return;
      if (action === 'fit') fitting = true;
      else { fitting = false; scale = action === 'actual' ? 1 : scale + (action === 'in' ? .15 : -.15); }
      apply();
    });
    new ResizeObserver(apply).observe(scroll); apply();
    return { refresh: apply, scale: () => scale };
  }
  globalThis.LabWorkspace = { createStore, download, viewport };
})();
