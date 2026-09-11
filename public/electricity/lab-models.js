(() => {
  'use strict';
  function lampState(power) {
    const level = Math.min(1, Math.sqrt(Math.max(0, power) / 1.8));
    return { level, on: power >= 0.005, label: power < 0.005 ? '未亮' : level < 0.25 ? '微亮' : level < 0.7 ? '发光' : '明亮' };
  }
  function ohm({ source, resistance, rheostat, closed }) {
    const current = closed ? source / (resistance + rheostat) : 0;
    return { current, voltage: current * resistance, resistance, power: current * current * resistance, rheostatVoltage: current * rheostat };
  }
  function network({ source, r1, r2, topology, s1, s2 }) {
    const i1 = topology === 'series' ? s1 && s2 ? source / (r1 + r2) : 0 : s1 ? source / r1 : 0;
    const i2 = topology === 'series' ? i1 : s2 ? source / r2 : 0;
    const current = topology === 'series' ? i1 : i1 + i2;
    return { current, i1, i2, v1: i1 * r1, v2: i2 * r2, p1: i1 * i1 * r1, p2: i2 * i2 * r2, resistance: current ? source / current : null };
  }
  function iv(type, voltage) {
    let current;
    if (type === 'resistor') current = voltage / 30;
    else if (type === 'bulb') {
      // Monotone steady-state teaching approximation: U = 10 I + 80 I³.
      let low = 0, high = Math.abs(voltage) / 10;
      for (let i = 0; i < 55; i++) { const middle = (low + high) / 2; if (10 * middle + 80 * middle ** 3 > Math.abs(voltage)) high = middle; else low = middle; }
      current = Math.sign(voltage) * (low + high) / 2;
    } else current = 1e-9 * Math.expm1(voltage / 0.04);
    return { voltage, current, power: voltage * current, resistance: Math.abs(current) > 1e-12 ? voltage / current : null };
  }
  function induction({ position, velocity, turns, field, polarity = 1, closed = true }) {
    const sigma = 6, area = 0.002;
    const flux = polarity * field * area * Math.exp(-position * position / (2 * sigma * sigma));
    const derivative = -position / (sigma * sigma) * flux;
    const emf = -turns * derivative * velocity;
    return { flux, emf, current: closed ? emf / 20 : 0, fluxRate: derivative * velocity };
  }
  globalThis.ElectricModels = { lampState, ohm, network, iv, induction };
})();
