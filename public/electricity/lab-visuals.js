(() => {
  'use strict';
  const text = (label, x, y, color = '#c7d7e3', size = 16) => `<text x="${x}" y="${y}" fill="${color}" stroke="none" font-size="${size}" text-anchor="middle">${label}</text>`;
  function lamp(power, id = 'lamp') {
    const { level, on } = globalThis.ElectricModels.lampState(power);
    const rays = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<path d="M${52 + Math.cos(a) * 33} ${28 + Math.sin(a) * 33}L${52 + Math.cos(a) * 43} ${28 + Math.sin(a) * 43}"/>`; }).join('');
    return `<defs><radialGradient id="glow-${id}"><stop stop-color="#fff9bd" stop-opacity="${on ? 0.8 * level : 0}"/><stop offset=".5" stop-color="#ffd54e" stop-opacity="${on ? 0.4 * level : 0}"/><stop offset="1" stop-color="#ffd54e" stop-opacity="0"/></radialGradient></defs><path d="M0 28H104" stroke="#102235" stroke-width="9"/><circle cx="52" cy="28" r="63" fill="url(#glow-${id})" stroke="none"/>
      <g fill="none" stroke-linecap="round" stroke-width="3"><path stroke="#a6c3d1" d="M0 28H28M76 28H104"/><g stroke="#ffd45c" opacity="${on ? 0.35 + 0.65 * level : 0}">${rays}</g><circle cx="52" cy="28" r="24" stroke="${on ? '#ffe489' : '#93afc2'}" fill="${on ? `rgba(255,222,93,${0.25 + level * 0.65})` : '#1c3548'}"/><path d="m38 14 28 28m0-28-28 28" stroke="${on ? '#fffbe0' : '#6d8b9e'}" stroke-width="${on ? 4 : 2}"/></g>`;
  }
  function gauge(value, max, unit, label, bipolar = false) {
    const normalized = Math.max(bipolar ? -1 : 0, Math.min(1, value / max));
    const angle = (bipolar ? normalized * 60 : -60 + normalized * 120) * Math.PI / 180;
    const step = max / (bipolar ? 3 : 6), precision = step < 0.1 - 1e-9 ? 2 : step < 1 - 1e-9 ? 1 : 0;
    const ticks = Array.from({ length: 7 }, (_, i) => { const a = (-60 + i * 20) * Math.PI / 180; return `<path d="M${120 + Math.sin(a) * 75} ${106 - Math.cos(a) * 75}L${120 + Math.sin(a) * 85} ${106 - Math.cos(a) * 85}"/>${text(((bipolar ? -max + i * max / 3 : i * max / 6)).toFixed(precision), 120 + Math.sin(a) * 98, 109 - Math.cos(a) * 98, '#526976', 11)}`; }).join('');
    return `<svg class="el-gauge" viewBox="0 0 240 152" role="img" aria-label="${label} ${value.toFixed(3)} ${unit}"><rect x="1" y="1" width="238" height="150" rx="16" fill="#fafcf9" stroke="#d0dfdc"/><g stroke="#657d89" stroke-width="1.5">${ticks}</g><path d="M120 106L${120 + Math.sin(angle) * 78} ${106 - Math.cos(angle) * 78}" stroke="#df7147" stroke-width="3"/><circle cx="120" cy="106" r="6" fill="#244552"/>${text(unit, 120, 78, '#2a5262', 22)}${text(label, 120, 138, '#526976', 14)}</svg>`;
  }
  const wire = (d, current = 0, color = '#69cdd3', extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${Math.abs(current) > 1e-7 ? `<path d="${d}" class="el-flow" fill="none" stroke="#fff1a6" stroke-width="4" stroke-dasharray="2 23" style="--flow-duration:${Math.max(0.25, 1 / (0.8 + Math.abs(current) * 4))}s;animation-direction:${current < 0 ? 'reverse' : 'normal'}"/>` : ''}${extra}`;
  const node = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="#f6df8b" stroke="#102235" stroke-width="2"/>`;
  function resistor(x, y, label, value, vertical = false) {
    return `<g transform="translate(${x} ${y})"><g transform="rotate(${vertical ? 90 : 0})"><path d="M-60 0H-37M37 0H60" stroke="#8bbbc8" stroke-width="3"/><rect x="-37" y="-17" width="74" height="34" rx="3" fill="#18394b" stroke="#f0bd77" stroke-width="3"/></g>${text(label, vertical ? 74 : 0, -32, '#f0bd77')}${text(value, vertical ? 83 : 0, 44, '#d6e5ed', 14)}</g>`;
  }
  const source = (x, y, voltage) => `<g transform="translate(${x} ${y})"><path d="M0-60V-12M0 14V60M-24-12H24M-12 14H12" stroke="#f3cf71" stroke-width="4"/>${text('+', 35, -8, '#f3cf71', 20)}${text('−', 35, 22, '#f3cf71', 20)}${text(`${voltage.toFixed(1)} V`, -60, 7, '#f3cf71', 18)}</g>`;
  const meter = (x, y, symbol, label) => `<g transform="translate(${x} ${y})"><circle r="24" fill="#102235" stroke="#98dbe3" stroke-width="2.5"/>${text(symbol, 0, 7, '#a6e7ea', 22)}${text(label, 0, 46, '#d1e8ed', 14)}</g>`;
  function switchSymbol(x, y, closed, action, label = '开关') { return `<g class="el-svg-button" data-lab-action="${action}" role="button" tabindex="0" aria-label="${label}：${closed ? '闭合，点击断开' : '断开，点击闭合'}" transform="translate(${x} ${y})"><rect x="-45" y="-42" width="90" height="86" rx="8" fill="#102235"/><path d="M-45 0H-24M24 0H45M-24 0L24 ${closed ? 0 : -24}" stroke="${closed ? '#84ddc5' : '#f5b274'}" stroke-width="3"/><circle cx="-24" r="4" fill="#d5e8eb"/><circle cx="24" r="4" fill="#d5e8eb"/>${text(`${label} · ${closed ? '闭合' : '断开'}`, 0, 33, '#acc7d2', 13)}</g>`; }
  globalThis.ElectricVisuals = { text, lamp, gauge, wire, node, resistor, source, meter, switchSymbol };
})();
