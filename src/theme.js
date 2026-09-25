/* ============================================================
   Looks: switchable art directions for the whole city
   ============================================================ */
const THEMES = {
  noir: {
    name: 'Rain Noir', blurb: 'Toned-down night. Sodium streetlights, warm windows, neon only as small accents.',
    fog: [0.045, 0.05, 0.062], fogDen: 0.011,
    zen: [0.008, 0.009, 0.013], mid: [0.03, 0.034, 0.044], glow: [0.14, 0.1, 0.06], cloud: [0.06, 0.062, 0.072], stars: 0.2, disc: [0.25, 0.28, 0.32], discDir: [-0.55, 0.42, -0.72],
    ambLo: [0.02, 0.021, 0.026], ambHi: [0.05, 0.056, 0.072], sun: [0.05, 0.06, 0.08], sunDir: [-0.35, 0.75, 0.25], rim: [0.12, 0.13, 0.16],
    neon: 0.22, win: 0.5, winWarm: 0.85, grid: 0.05, dyn: 0.35, sign: 0.45, wet: 1.25,
    bloom: 0.45, thr: 1.0, expo: 1.15, sat: 0.72, grade: [1.0, 0.98, 0.95], lift: [0.01, 0.012, 0.016],
    rain: 0.7, rainCol: [0.5, 0.55, 0.65], lamp: [2.0, 1.2, 0.5], fountain: [0.35, 0.6, 0.7], shop: 0.45,
  },
  neon: {
    name: 'Full Neon', blurb: 'The original look: saturated magenta and cyan, heavy bloom.',
    fog: [0.10, 0.035, 0.12], fogDen: 0.0085,
    zen: [0.012, 0.008, 0.03], mid: [0.09, 0.025, 0.12], glow: [0.35, 0.08, 0.25], cloud: [0.16, 0.05, 0.2], stars: 1, disc: [0.75, 0.9, 1.0], discDir: [-0.55, 0.42, -0.72],
    ambLo: [0.03, 0.02, 0.05], ambHi: [0.06, 0.07, 0.14], sun: [0.1, 0.12, 0.22], sunDir: [-0.35, 0.75, 0.25], rim: [0.3, 0.16, 0.42],
    neon: 1, win: 0.8, winWarm: 0, grid: 0.22, dyn: 1, sign: 1, wet: 1,
    bloom: 0.85, thr: 0.85, expo: 1.1, sat: 1, grade: [1, 1, 1], lift: [0, 0, 0],
    rain: 0.55, rainCol: [0.45, 0.55, 0.9], lamp: [1.2, 1.5, 2.0], fountain: [0.4, 1.6, 2.2], shop: 1,
  },
  smog: {
    name: 'Brutalist Smog', blurb: 'Concrete megablocks in thick grey-green smog. Almost monochrome, oppressive and quiet.',
    fog: [0.15, 0.16, 0.145], fogDen: 0.02,
    zen: [0.08, 0.09, 0.085], mid: [0.13, 0.14, 0.125], glow: [0.05, 0.05, 0.03], cloud: [0.17, 0.18, 0.165], stars: 0, disc: [0, 0, 0], discDir: [-0.55, 0.42, -0.72],
    ambLo: [0.06, 0.065, 0.06], ambHi: [0.14, 0.15, 0.14], sun: [0.07, 0.07, 0.065], sunDir: [-0.35, 0.75, 0.25], rim: [0.08, 0.09, 0.08],
    neon: 0.08, win: 0.22, winWarm: 1, grid: 0.015, dyn: 0.2, sign: 0.22, wet: 0.6,
    bloom: 0.3, thr: 1.1, expo: 1.0, sat: 0.45, grade: [0.98, 1.02, 0.97], lift: [0.02, 0.022, 0.02],
    rain: 0.25, rainCol: [0.5, 0.52, 0.5], lamp: [1.3, 1.3, 1.1], fountain: [0.3, 0.45, 0.45], shop: 0.3,
  },
  amber: {
    name: 'Amber Haze', blurb: 'Dust storm over a dead megacity. Burnt orange air, silhouettes, a hazy low sun.',
    fog: [0.30, 0.12, 0.035], fogDen: 0.014,
    zen: [0.08, 0.035, 0.012], mid: [0.24, 0.09, 0.025], glow: [0.4, 0.15, 0.03], cloud: [0.34, 0.14, 0.04], stars: 0, disc: [1.2, 0.7, 0.3], discDir: [0.5, 0.12, -0.85],
    ambLo: [0.06, 0.03, 0.015], ambHi: [0.17, 0.085, 0.03], sun: [0.4, 0.18, 0.05], sunDir: [0.5, 0.25, -0.83], rim: [0.3, 0.14, 0.04],
    neon: 0.14, win: 0.28, winWarm: 1, grid: 0.02, dyn: 0.25, sign: 0.35, wet: 0.25,
    bloom: 0.5, thr: 0.95, expo: 1.05, sat: 0.8, grade: [1.05, 0.95, 0.85], lift: [0.02, 0.01, 0.0],
    rain: 0.12, rainCol: [0.7, 0.45, 0.2], lamp: [1.6, 0.9, 0.4], fountain: [0.6, 0.45, 0.25], shop: 0.35,
  },
  dawn: {
    name: 'Cold Dawn', blurb: 'Overcast morning after the outbreak. Readable daylight, blue-grey towers, color from blood and fire only.',
    fog: [0.42, 0.46, 0.52], fogDen: 0.006,
    zen: [0.22, 0.3, 0.42], mid: [0.42, 0.46, 0.53], glow: [0.2, 0.15, 0.16], cloud: [0.58, 0.6, 0.65], stars: 0, disc: [1.0, 0.85, 0.75], discDir: [0.6, 0.16, -0.78],
    ambLo: [0.12, 0.12, 0.13], ambHi: [0.34, 0.37, 0.44], sun: [0.55, 0.5, 0.45], sunDir: [0.55, 0.45, -0.7], rim: [0.1, 0.1, 0.12],
    neon: 0.05, win: 0.04, winWarm: 1, grid: 0.015, dyn: 0.15, sign: 0.3, wet: 0.5,
    bloom: 0.22, thr: 1.3, expo: 1.0, sat: 0.72, grade: [1, 1, 1.02], lift: [0, 0, 0],
    rain: 0.25, rainCol: [0.6, 0.62, 0.68], lamp: [0.15, 0.15, 0.15], fountain: [0.15, 0.3, 0.4], shop: 0.12,
  },
  blackout: {
    name: 'Blackout', blurb: 'The grid is down. Moonlight, red emergency lamps, and whatever your arrows set on fire.',
    fog: [0.012, 0.013, 0.022], fogDen: 0.012,
    zen: [0.004, 0.005, 0.01], mid: [0.012, 0.014, 0.024], glow: [0.08, 0.012, 0.01], cloud: [0.02, 0.022, 0.035], stars: 1.3, disc: [0.9, 0.95, 1.05], discDir: [-0.55, 0.42, -0.72],
    ambLo: [0.012, 0.013, 0.02], ambHi: [0.03, 0.036, 0.065], sun: [0.08, 0.095, 0.14], sunDir: [-0.45, 0.6, -0.6], rim: [0.08, 0.1, 0.18],
    neon: 0.03, win: 0.07, winWarm: 1, grid: 0.0, dyn: 0.4, sign: 0.05, wet: 1.1,
    bloom: 0.6, thr: 0.8, expo: 1.35, sat: 0.8, grade: [1.0, 0.95, 0.95], lift: [0.004, 0.005, 0.01],
    rain: 0.45, rainCol: [0.45, 0.5, 0.6], lamp: [2.4, 0.12, 0.08], fountain: [0, 0, 0], shop: 0.04,
  },
};
const THEME_ORDER = ['noir', 'smog', 'amber', 'dawn', 'blackout', 'neon'];
let THEME = THEMES.noir;
function setTheme(k) { THEME = THEMES[k] || THEMES.noir; }
const _n3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
function applyThemeMain(U, vm) {
  const T = THEME;
  gl.uniform3fv(U.uAmbLo, T.ambLo); gl.uniform3fv(U.uAmbHi, T.ambHi); gl.uniform3fv(U.uSunCol, T.sun); gl.uniform3fv(U.uSunDir, _n3(T.sunDir)); gl.uniform3fv(U.uRimCol, T.rim);
  gl.uniform1f(U.uNeon, T.neon); gl.uniform1f(U.uWin, T.win); gl.uniform1f(U.uWinWarm, T.winWarm); gl.uniform1f(U.uGrid, T.grid); gl.uniform1f(U.uDyn, vm ? 0.5 + 0.5 * Math.max(T.neon, 0.2) : T.dyn); gl.uniform1f(U.uWet, T.wet);
}
function applyThemeSky(U) {
  const T = THEME;
  gl.uniform3fv(U.uZen, T.zen); gl.uniform3fv(U.uMid, T.mid); gl.uniform3fv(U.uGlow, T.glow); gl.uniform3fv(U.uCloud, T.cloud); gl.uniform3fv(U.uDiscCol, T.disc); gl.uniform3fv(U.uDiscDir, T.discDir); gl.uniform1f(U.uStars, T.stars);
}
