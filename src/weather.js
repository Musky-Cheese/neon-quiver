/* ============================================================
   Weather: the sky never sits still. Dry spells, drizzle, steady rain, full
   downpours with wind, lightning and thunder, and now and then the rain turns
   to snow that settles on the streets. Each spell lasts a minute or two and
   everything eases in and out: streets soak and dry slowly, snow builds up
   and melts away. The Look (theme) still sets the base colour and amount.
   ============================================================ */
const WX_STATES = {
  //          precip  snow  wind  storm   weight  duration (s)
  dry:      { p: 0.0,  s: 0, w: 0.15, st: 0, wt: 14, d: [50, 110] },
  drizzle:  { p: 0.32, s: 0, w: 0.2,  st: 0, wt: 22, d: [60, 130] },
  rain:     { p: 0.68, s: 0, w: 0.4,  st: 0, wt: 30, d: [70, 150] },
  downpour: { p: 1.0,  s: 0, w: 0.9,  st: 1, wt: 18, d: [45, 100] },
  snow:     { p: 0.62, s: 1, w: 0.3,  st: 0, wt: 16, d: [80, 160] },
};
const WX = {
  state: 'rain', t: 0, dur: 90,
  precip: 0.68, snow: 0, wind: 0.4, storm: 0,   // current (smoothed) values
  wet: 0.8, cover: 0,                            // surface state: how soaked, how snowed-over
  flash: 0, flashT: 8, gust: 0, thunder: [],
  forced: null,                                   // testing / debugging: WX.force('snow')
};
function wxPick() {
  const keys = Object.keys(WX_STATES).filter(k => k !== WX.state && !(WX.state === 'snow' && k === 'downpour'));
  let tot = 0; for (const k of keys) tot += WX_STATES[k].wt;
  let r = dr('wx') * tot; for (const k of keys) { r -= WX_STATES[k].wt; if (r <= 0) return k; }
  return 'rain';
}
function wxSet(k) {
  const S = WX_STATES[k]; const prev = WX.state; WX.state = k; WX.t = 0; WX.dur = S.d[0] + dr('wx') * (S.d[1] - S.d[0]);
  if (GAME.state === 'playing' && prev !== k) { const msg = { downpour: 'STORM ROLLING IN', snow: 'THE RAIN IS TURNING TO SNOW', dry: 'THE RAIN EASES OFF' }[k]; if (msg) GAME.toast(msg, '#bfe4ff'); }
}
function wxReset() { wxSet('rain'); WX.precip = 0.68; WX.snow = 0; WX.wind = 0.4; WX.storm = 0; WX.wet = 0.8; WX.cover = 0; WX.flash = 0; WX.thunder.length = 0; }
WX.force = (k) => { WX.forced = k; if (k) { wxSet(k); } };

function updateWeather(dt) {
  WX.t += dt;
  if (!WX.forced && WX.t > WX.dur) wxSet(wxPick());
  const S = WX_STATES[WX.forced || WX.state], ease = (cur, want, tau) => cur + (want - cur) * (1 - Math.exp(-dt / tau));
  WX.precip = ease(WX.precip, S.p, 14); WX.snow = ease(WX.snow, S.s, 12); WX.wind = ease(WX.wind, S.w, 8); WX.storm = ease(WX.storm, S.st, 6);
  // streets soak in the rain (fast) and dry out slowly; snow settles over a minute and melts faster in rain
  const rainNow = WX.precip * (1 - WX.snow), snowNow = WX.precip * WX.snow;
  WX.wet = rainNow > 0.05 ? ease(WX.wet, 0.35 + 0.65 * Math.min(1, rainNow * 1.4), 18) : ease(WX.wet, 0.12, 110);
  WX.cover = snowNow > 0.1 ? ease(WX.cover, Math.min(1, snowNow * 1.5), 55) : ease(WX.cover, 0, rainNow > 0.1 ? 25 : 140);
  // gusts: the slant swings; heavier in storms
  WX.gust = Math.max(0, Math.sin(GAME.time * 0.37) * Math.sin(GAME.time * 0.113 + 2)) * WX.wind;
  // lightning in storms: a double flicker, thunder a few seconds later (sound travels)
  WX.flash = Math.max(0, WX.flash - dt * 3.2);
  if (WX.storm > 0.5) {
    WX.flashT -= dt;
    if (WX.flashT <= 0) {
      WX.flashT = rand(6, 16); const fk = SETTINGS.reduceFlash ? 0.25 : 1; WX.flash = fk; const dist = rand(0.6, 5);
      WX.thunder.push({ t: dist, k: 1.2 - dist / 6 });
      setTimeout(() => { WX.flash = Math.max(WX.flash, 0.7 * fk); }, 120);
    }
  }
  for (let i = WX.thunder.length - 1; i >= 0; i--) { const th = WX.thunder[i]; th.t -= dt; if (th.t <= 0) { AUD.thunder(th.k); WX.thunder.splice(i, 1); } }
  AUD.weather(rainNow, snowNow, WX.wind);
}
// what the renderer and effects read
function wxRainK() { return WX.precip * (1 - WX.snow); }
function wxSnowK() { return WX.precip * WX.snow; }
