/* ============================================================
   Synth audio: SFX + ambient + music, all generated
   ============================================================ */
function fillPink(d) {   // Paul Kellet's pink noise filter
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
  }
}
const AUD = {
  ctx: null, master: null, sfx: null, ui: null, music: null, amb: null, musicOn: true, musicScreen: true, noise: null, pink: null, drawNode: null, started: false,
  vol: { master: 1, sfx: 1, music: 1, amb: 1 },   // player volume sliders, 0..1
  lis: { x: 0, y: 1.6, z: 0 },                       // last listener position, for the distance filter
  _pv: 1, _vv: 1,                                    // per-sound pitch / volume variation (see the wrapper at the bottom)
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    // bus compressor glues the mix; a soft clipper after it rounds off the peaks when a wave piles sounds on top of each
    // other (linear below 0.8, so normal levels pass untouched, then a tanh knee that never exceeds 1)
    const lim = c.createWaveShaper(), cv = new Float32Array(2049);
    for (let i = 0; i < cv.length; i++) { const x = i / 1024 - 1, a = Math.abs(x); cv[i] = Math.sign(x) * (a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2)); }
    lim.curve = cv; lim.oversample = '2x'; lim.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.006; comp.release.value = 0.2; comp.connect(lim);
    this.master = c.createGain(); this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.ui = c.createGain(); this.ui.connect(this.master);   // menu / pickup blips: dry, no reverb
    this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    // reverb: one convolver fed by sends from the world SFX and ambience buses (post-volume, so the sliders scale it too)
    this.verb = c.createConvolver(); this.verb.buffer = this.makeIR(1.8, 3); this.verb.connect(this.master);
    const ss = c.createGain(); ss.gain.value = 0.22; this.sfx.connect(ss); ss.connect(this.verb);
    const as = c.createGain(); as.gain.value = 0.3; this.amb.connect(as); as.connect(this.verb);
    this.applyVol(true);
    // delay send for music
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.375; const fb = c.createGain(); fb.gain.value = 0.35;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.music);
    const len = c.sampleRate * 2; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const pb = c.createBuffer(1, len, c.sampleRate); fillPink(pb.getChannelData(0)); this.pink = pb;
    this.startAmbient(); this.startMusic();
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  noiseSrc(pink) { const s = this.ctx.createBufferSource(); s.buffer = pink ? this.pink : this.noise; s.loop = true; s.loopStart = Math.random(); return s; },
  // a room-ish impulse response: a few early reflections, then a decaying noise tail that loses its top end as it dies
  makeIR(dur, decay) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * dur), b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) { const k = i / n, a = 0.9 - 0.75 * k; lp += (Math.random() * 2 - 1 - lp) * a; d[i] = i < sr * 0.012 ? 0 : lp * Math.pow(1 - k, decay); }
      for (const [ms, g] of [[11, 0.5], [19, 0.35], [27, 0.3], [41, 0.22], [53, 0.16]]) d[Math.floor(sr * (ms + ch * 3.5) / 1000)] += g * (Math.random() < 0.5 ? -1 : 1);
    }
    return b;
  },
  applyVol(now) {   // now: jump straight to the levels (at startup) instead of a short glide
    if (!this.ctx) return; const t = this.now(), v = this.vol;
    const set = (g, x) => { if (now) g.gain.value = x; else g.gain.setTargetAtTime(x, t, 0.03); };
    set(this.master, 0.75 * v.master); set(this.sfx, 0.9 * v.sfx); set(this.ui, 0.9 * v.sfx); set(this.amb, 0.35 * v.amb);
    this.applyMusic();
  },
  setVolume(k, x) { this.vol[k] = clamp(+x, 0, 1); this.applyVol(); },
  // the player's ears: called every frame with the eye position and view yaw (forward is -z rotated by yaw, as for the camera)
  listen(x, y, z, yaw) {
    if (!this.ctx) return; const L = this.ctx.listener; this.lis.x = x; this.lis.y = y; this.lis.z = z;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (L.positionX) { L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    else { L.setPosition(x, y, z); L.setOrientation(fx, 0, fz, 0, 1, 0); }
  },
  // a 3D source at world point p {x, y, z}: HRTF panning (front / back / above), gentle distance falloff, and
  // air absorption so far-off sounds come in muffled
  at(p) {
    const c = this.ctx; if (!c.createPanner) return this.sfx;
    const pn = c.createPanner(); pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 6; pn.rolloffFactor = 0.5; pn.maxDistance = 300;
    if (pn.positionX) { pn.positionX.value = p.x; pn.positionY.value = p.y; pn.positionZ.value = p.z; } else pn.setPosition(p.x, p.y, p.z);
    const L = this.lis, d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(20000 / (1 + d / 10), 1500, 20000); lp.Q.value = 0.5;
    lp.connect(pn); pn.connect(this.sfx); return lp;
  },
  env(g, t, a, peak, dcy, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + dcy); },
  out(pan) {   // pan: undefined (centred), a number -1..1 (stereo), or a world position {x, y, z} (3D)
    if (pan && typeof pan === 'object') return this.at(pan);
    if (pan === undefined || !this.ctx.createStereoPanner) return this.sfx;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(this.sfx); return p;
  },
  tone(type, f0, f1, dur, vol, dest, t = this.now(), a = 0.005) {
    const c = this.ctx; f0 *= this._pv; f1 *= this._pv; vol *= this._vv; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain(); this.env(g, t, a, vol, dur); o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + a + dur + 0.05); return o;
  },
  burst(fType, f0, f1, q, dur, vol, dest, t = this.now(), a = 0.004) {
    const c = this.ctx; f0 *= this._pv; f1 *= this._pv; vol *= this._vv;
    // low, filtered noise uses the pink buffer (warmer, less fizzy); the gain keeps it level with what white noise gave
    const pink = fType === 'lowpass' || (fType === 'bandpass' && f0 < 1200);
    if (pink) vol *= fType === 'lowpass' ? Math.pow(f0 / 1300, 0.4) : Math.pow(f0 / 210, 0.47);
    const s = this.noiseSrc(pink); const f = c.createBiquadFilter(); f.type = fType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = c.createGain(); this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
  },
  // ---------------- SFX ----------------
  drawStart(time) {
    if (!this.ctx) return; this.drawStop();
    const c = this.ctx, t = this.now();
    const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1900, t + time);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.08); g.gain.linearRampToValueAtTime(0.08, t + time);
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(140, t + time);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.03, t + time); const lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 500;
    s.connect(f); f.connect(g); g.connect(this.sfx); o.connect(lf); lf.connect(og); og.connect(this.sfx);
    s.start(t); o.start(t);
    this.drawNode = { s, o, g, og };
  },
  drawStop() {
    if (!this.drawNode) return; const t = this.now(); const n = this.drawNode; this.drawNode = null;
    n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.og.gain.cancelScheduledValues(t); n.og.gain.setValueAtTime(n.og.gain.value || 0.0001, t); n.og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.s.stop(t + 0.1); n.o.stop(t + 0.1);
  },
  release(power, type) {
    if (!this.ctx) return; this.drawStop(); const t = this.now();
    this.tone('triangle', 180 + power * 60, 60, 0.22, 0.5 * (0.5 + power * 0.5));
    this.tone('sine', 90, 45, 0.18, 0.35);
    this.burst('highpass', 3000, 1200, 0.7, 0.25, 0.18 + power * 0.2);
    this.burst('bandpass', 900, 3000, 1.5, 0.3, 0.12);
    if (type === 1) this.burst('bandpass', 400, 200, 1, 0.5, 0.12);
    if (type === 2) this.tone('square', 900, 300, 0.25, 0.05);
    if (type === 3) { this.tone('sawtooth', 2400, 600, 0.2, 0.06); this.tone('sine', 1200, 3000, 0.15, 0.05); }
    if (type === 4) { this.burst('highpass', 6000, 3000, 2, 0.35, 0.1); this.tone('sine', 1900, 2400, 0.25, 0.05); }
    if (type === 5) { this.tone('square', 300, 1400, 0.12, 0.05); }
    if (type === 6) { this.burst('lowpass', 1400, 300, 1, 0.3, 0.3); this.tone('square', 120, 50, 0.15, 0.1); }
    if (type === 7) { this.tone('sawtooth', 1600, 3200, 0.12, 0.04); this.burst('highpass', 5000, 7000, 3, 0.12, 0.08); }
    if (type === 8) { this.tone('sine', 2200, 2600, 0.1, 0.05); }
  },
  nock() { if (!this.ctx) return; const t = this.now(); this.burst('bandpass', 2500, 2500, 6, 0.05, 0.12); this.tone('square', 1800, 1700, 0.03, 0.03, this.sfx, t + 0.02); },
  quiver() { if (!this.ctx) return; this.burst('bandpass', 1800, 900, 2, 0.18, 0.08); },
  hit(head, pan) { if (!this.ctx) return; const o = this.out(pan); this.burst('lowpass', 900, 200, 1, 0.14, 0.45, o); this.tone('sine', 120, 50, 0.12, 0.35, o); if (head) { this.tone('sine', 1650, 1600, 0.25, 0.14, o); this.tone('sine', 2475, 2450, 0.18, 0.06, o); } },
  thunk() { if (!this.ctx) return; this.burst('bandpass', 1200, 500, 3, 0.08, 0.2); this.tone('triangle', 300, 120, 0.06, 0.1); },
  step(k = 1) { if (!this.ctx) return; this.burst('lowpass', 900, 260, 0.8, 0.05, 0.05 * k); this.tone('sine', 70, 50, 0.05, 0.03 * k); },
  land(k = 1) { if (!this.ctx) return; this.tone('sine', 95, 42, 0.13, 0.12 * k); this.burst('lowpass', 500, 180, 0.7, 0.07, 0.07 * k); },
  kill() { if (!this.ctx) return; this.tone('square', 660, 660, 0.05, 0.04, this.ui); this.tone('square', 990, 990, 0.08, 0.04, this.ui, this.now() + 0.05); },
  explode(dist) {
    if (!this.ctx) return; const v = clamp(1.4 - dist / 40, 0.2, 1.2);
    this.burst('lowpass', 2400, 90, 0.8, 1.2, 0.9 * v); this.tone('sine', 110, 28, 0.9, 0.9 * v); this.burst('highpass', 4000, 2000, 0.5, 0.2, 0.2 * v);
  },
  fireIgnite() { if (!this.ctx) return; this.burst('bandpass', 600, 2400, 0.7, 0.4, 0.25); },
  groan(pan, vol = 0.12, low = 1) {
    if (!this.ctx) return; const c = this.ctx, t = this.now(), d = rand(0.6, 1.3);
    const o = c.createOscillator(); o.type = 'sawtooth'; const f0 = rand(70, 120) * low; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rand(0.7, 1.2), t + d);
    const lfo = c.createOscillator(); lfo.frequency.value = rand(5, 9); const lg = c.createGain(); lg.gain.value = f0 * 0.06; lfo.connect(lg); lg.connect(o.frequency);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6; f1.frequency.setValueAtTime(rand(450, 750), t); f1.frequency.linearRampToValueAtTime(rand(300, 900), t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(f1); f1.connect(g); g.connect(this.out(pan)); o.start(t); lfo.start(t); o.stop(t + d + 0.05); lfo.stop(t + d + 0.05);
  },
  roar() { if (!this.ctx) return; this.groan(0, 0.5, 0.45); this.groan(0, 0.35, 0.6); this.burst('lowpass', 500, 120, 1, 1.3, 0.4); },
  slam() { if (!this.ctx) return; this.tone('sine', 70, 25, 0.8, 1.0); this.burst('lowpass', 900, 60, 0.7, 0.9, 0.8); },
  hurt() { if (!this.ctx) return; this.tone('square', 160, 90, 0.12, 0.1); this.burst('lowpass', 600, 200, 1, 0.15, 0.3); this.tone('sine', 55, 40, 0.3, 0.4); },
  pickup() { if (!this.ctx) return; const t = this.now(); [880, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.08, this.ui, t + i * 0.06)); },
  heal() { if (!this.ctx) return; const t = this.now(); [523, 659, 784, 1047].forEach((f, i) => this.tone('sine', f, f, 0.2, 0.08, this.ui, t + i * 0.05)); },
  click() { if (!this.ctx) return; this.tone('square', 1400, 1400, 0.03, 0.04, this.ui); },
  buy() { if (!this.ctx) return; const t = this.now(); this.tone('square', 740, 740, 0.06, 0.05, this.ui); this.tone('square', 1480, 1480, 0.1, 0.05, this.ui, t + 0.06); },
  deny() { if (!this.ctx) return; this.tone('square', 180, 140, 0.15, 0.06, this.ui); },
  // Shock Arrow arc: a crackle that gets denser with every zombie in the chain
  zap(pan, n = 1) { if (!this.ctx) return; const o = this.out(pan), t = this.now(); for (let i = 0; i < Math.min(5, n + 1); i++) { this.burst('highpass', 3500, 1800, 4, 0.08, 0.16, o, t + i * 0.045); this.tone('square', 90 + i * 25, 60, 0.07, 0.05, o, t + i * 0.045); } },
  // Tracer tag: a short rising ping
  tag(pan) { if (!this.ctx) return; const o = this.out(pan), t = this.now(); this.tone('sine', 1400, 2100, 0.09, 0.07, o); this.tone('sine', 2100, 2100, 0.12, 0.05, o, t + 0.08); },
  // armory: purchase confirmation already exists (buy); a soft panel-open chirp
  armory() { if (!this.ctx) return; const t = this.now(); [392, 523, 784].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.06, this.ui, t + i * 0.07)); },
  swap() { if (!this.ctx) return; this.tone('triangle', 500, 900, 0.07, 0.06); },
  waveHorn(boss) {
    if (!this.ctx) return; const c = this.ctx, t = this.now(), d = boss ? 3.2 : 2.2;
    [55, 55 * 1.5, 110.5].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = boss ? f * 0.75 : f; const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(120, t); lp.frequency.exponentialRampToValueAtTime(boss ? 1600 : 1100, t + 0.6); lp.frequency.exponentialRampToValueAtTime(200, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 / (i + 1), t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp); lp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + d + 0.1);
    });
  },
  // ---------------- harbour ambience: lapping water (faded in near the Docks), a far-off horn, crane steel creaking ----------------
  harb: null,
  harbour(k, dt) {
    if (!this.ctx) return; const c = this.ctx;
    if (!this.harb) {
      const s = this.noiseSrc(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.7;
      const sw = c.createGain(); sw.gain.value = 0.5; const lfo = c.createOscillator(); lfo.frequency.value = 0.17; const lg = c.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(sw.gain);
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(sw); sw.connect(g); g.connect(this.amb); s.start(); lfo.start();
      const hl = c.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 420; hl.connect(this.amb);
      this.harb = { g, hl, horn: rand(6, 20), creak: rand(3, 9) };
    }
    const H = this.harb, t = this.now();
    H.g.gain.setTargetAtTime(0.55 * k, t, 0.6);
    if (k < 0.05) return;
    H.horn -= dt; H.creak -= dt;
    if (H.horn <= 0) { H.horn = rand(28, 55); for (const f of [82, 87.5, 164]) this.tone('sawtooth', f, f * 0.985, 2.6, 0.07 * k * (f > 100 ? 0.4 : 1), H.hl, t, 0.35); }
    if (H.creak <= 0) { H.creak = rand(7, 16); this.burst('bandpass', rand(300, 500), rand(700, 1100), 18, 1.2, 0.05 * k, this.amb, t, 0.2); this.tone('triangle', rand(90, 130), rand(70, 90), 0.9, 0.025 * k, this.amb, t + 0.2, 0.15); }
  },
  hookFire() { if (!this.ctx) return; this.burst('highpass', 2500, 900, 1.5, 0.22, 0.2); this.tone('square', 900, 1500, 0.08, 0.04); },
  hookAttach() { if (!this.ctx) return; this.tone('square', 220, 90, 0.08, 0.12); this.burst('bandpass', 1800, 600, 4, 0.12, 0.18); },
  hookRelease() { if (!this.ctx) return; this.tone('triangle', 700, 300, 0.12, 0.05); },
  _reelT: 0,
  hookReel(dt, k) { if (!this.ctx) return; this._reelT -= dt; if (this._reelT > 0) return; this._reelT = 0.05; this.burst('bandpass', 700 + 1400 * k, 900 + 1600 * k, 6, 0.06, 0.05); },
  // rain is built from layers so it never sits on one steady hiss: a slowly drifting mid "wash", a bright
  // hiss, a soft low body, plus randomly timed droplets and the odd bigger plink. Everything breathes with gusts.
  startRain() {
    const c = this.ctx, sr = c.sampleRate, len = sr * 12;
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    fillPink(d);   // pink-ish noise: softer and more natural than white
    const xf = Math.floor(sr * 0.6);   // crossfade the loop seam so the repeat can't be heard
    for (let i = 0; i < xf; i++) { const k = i / xf; d[i] = d[i] * k + d[len - xf + i] * (1 - k); }
    this.rainBuf = buf; this.rainLen = len - xf;
    const master = c.createGain(); master.gain.value = 0.16; master.connect(this.amb); this.rainG = master;
    const layer = (type, freq, q, gain, lfoRate, gainDepth, freqDepth) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.loopEnd = this.rainLen;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master);
      const l = c.createOscillator(); l.frequency.value = lfoRate;
      const lg = c.createGain(); lg.gain.value = gainDepth; l.connect(lg); lg.connect(g.gain);
      if (freqDepth) { const lf = c.createGain(); lf.gain.value = freqDepth; l.connect(lf); lf.connect(f.frequency); }
      s.start(0, Math.random() * (this.rainLen / sr)); l.start();
      return { f, g, base: gain };
    };
    this.rainL = {
      wash: layer('bandpass', 1500, 0.45, 0.55, 0.083, 0.16, 380),
      hiss: layer('highpass', 4800, 0.7, 0.10, 0.19, 0.03, 0),
      body: layer('lowpass', 650, 0.6, 0.45, 0.047, 0.10, 0),
    };
    this._dropT = 0; this._plinkT = 0;
  },
  weather(rain, snow, wind) {
    if (!this.ctx || !this.rainG) return; const t = this.now(), L = this.rainL;
    // slow, uneven swelling like gusts pushing sheets of rain past
    const swell = 0.86 + 0.14 * Math.sin(t * 0.31) * Math.sin(t * 0.083 + 1.3) + 0.06 * Math.sin(t * 1.7 + Math.sin(t * 0.21) * 3);
    this.rainG.gain.setTargetAtTime((0.02 + 0.24 * rain) * swell * (1 + 0.25 * wind), t, 0.5);
    // light rain is soft and dull with a few sharp drops; heavy rain is fuller, lower and brighter
    L.wash.f.frequency.setTargetAtTime(1100 + 900 * rain, t, 1.5);
    L.wash.g.gain.setTargetAtTime(L.wash.base * (0.6 + 0.6 * rain), t, 1.5);
    L.hiss.g.gain.setTargetAtTime(L.hiss.base * (0.3 + 1.4 * rain * rain), t, 1.5);
    L.body.g.gain.setTargetAtTime(L.body.base * rain * rain * 1.6, t, 1.5);
    this.windG.gain.setTargetAtTime(0.015 + 0.09 * wind + 0.05 * snow, t, 1.2);
    this.windF.frequency.setTargetAtTime(320 + 260 * wind + 120 * Math.sin(t * 0.4) + 90 * Math.sin(t * 1.3), t, 0.6);
    if (rain < 0.03) { this._dropT = t; this._plinkT = t; return; }
    // random droplets (poisson-ish spacing, clustered by the swell)
    if (this._dropT < t - 0.3) this._dropT = t;
    const rate = (2 + 26 * rain) * swell;
    let n = 0;
    while (this._dropT < t + 0.12 && n++ < 8) {
      const at = Math.max(t, this._dropT), fq = rand(2200, 7500);
      let dest = this.amb;
      if (this.ctx.createStereoPanner && Math.random() < 0.6) { const p = this.ctx.createStereoPanner(); p.pan.value = rand(-0.9, 0.9); p.connect(this.amb); dest = p; }
      this.burst('bandpass', fq, fq * rand(0.6, 0.9), rand(4, 10), rand(0.012, 0.035), rand(0.01, 0.045) * (0.5 + rain), dest, at, 0.002);
      this._dropT += -Math.log(1 - Math.random()) / rate;
    }
    // now and then a bigger drop lands in a puddle or on metal
    if (this._plinkT < t - 0.3) this._plinkT = t;
    while (this._plinkT < t + 0.12) {
      const at = Math.max(t, this._plinkT), f = rand(500, 1500);
      let dest = this.amb;
      if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = rand(-1, 1); p.connect(this.amb); dest = p; }
      this.tone('sine', f, f * rand(1.4, 2.1), rand(0.04, 0.09), rand(0.008, 0.022) * (0.4 + rain), dest, at, 0.003);
      this._plinkT += rand(0.4, 2.6) / (0.25 + rain);
    }
  },
  thunder(k) {
    if (!this.ctx) return; const t = this.now(), v = clamp(k, 0.25, 1.2);
    if (k > 0.9) this.burst('highpass', 2500, 700, 0.6, 0.35, 0.28 * v, this.amb, t, 0.002);   // close strike: the crack
    this.burst('lowpass', rand(700, 1100), 60, 0.7, rand(2.8, 4), 0.45 * v, this.amb, t + (k > 0.9 ? 0.05 : 0), 0.03);
    // rolling rumble: several swells at uneven intervals that die away
    const n = 3 + Math.floor(Math.random() * 3); let at = t + 0.3;
    for (let i = 0; i < n; i++) {
      const fall = 1 - i / (n + 1);
      this.burst('lowpass', rand(150, 400), rand(35, 70), rand(0.4, 1), rand(1.2, 2.6), rand(0.2, 0.42) * v * fall, this.amb, at, rand(0.15, 0.5));
      at += rand(0.3, 1.1);
    }
    this.tone('sine', rand(45, 65), 28, 3.5, 0.25 * v, this.amb, t + 0.1, 0.2);
  },
  tick() { if (!this.ctx) return; const t = this.now(); this.tone('square', 880, 880, 0.06, 0.04, this.ui, t); },
  frost(pan) { if (!this.ctx) return; const o = this.out(pan); this.burst('highpass', 5000, 2500, 3, 0.6, 0.25, o); this.tone('sine', 2600, 900, 0.5, 0.05, o); },
  tether() { if (!this.ctx) return; this.tone('sawtooth', 1600, 400, 0.3, 0.05); this.burst('bandpass', 2200, 800, 4, 0.25, 0.1); },
  spit(pan) { if (!this.ctx) return; const o = this.out(pan); this.burst('bandpass', 700, 1800, 2, 0.22, 0.22, o); this.tone('sawtooth', 240, 90, 0.2, 0.12, o); },
  scream(pan) { if (!this.ctx) return; const o = this.out(pan); this.groan(pan, 0.4, 1.3); this.burst('highpass', 2200, 4200, 3, 0.5, 0.22, o); },
  pounce(pan) { if (!this.ctx) return; const o = this.out(pan); this.burst('lowpass', 1400, 300, 1, 0.18, 0.3, o); this.tone('sine', 90, 45, 0.14, 0.2, o); },
  cleared() { if (!this.ctx) return; const t = this.now(); [392, 523, 659, 784].forEach((f, i) => this.tone('square', f, f, 0.25, 0.05, this.ui, t + i * 0.09)); },
  gameOver() { if (!this.ctx) return; const t = this.now(); [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.5, 0.08, this.ui, t + i * 0.28)); },
  heartbeat() { if (!this.ctx) return; const t = this.now(); this.tone('sine', 60, 40, 0.12, 0.35, this.sfx, t); this.tone('sine', 55, 38, 0.12, 0.25, this.sfx, t + 0.18); },
  // ---------------- ambient ----------------
  startAmbient() {
    const c = this.ctx;
    this.startRain();
    // wind: a low hollow howl that rises in gusts, storms and snow
    const wn = this.noiseSrc(true), wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 1.4; const wg = c.createGain(); wg.gain.value = 0; const wc = c.createGain(); wc.gain.value = Math.pow(420 / 210, 0.47); wn.connect(wf); wf.connect(wc); wc.connect(wg); wg.connect(this.amb); wn.start(); this.windG = wg; this.windF = wf;
    const r2 = this.noiseSrc(); const rf2 = c.createBiquadFilter(); rf2.type = 'lowpass'; rf2.frequency.value = 260; const rg2 = c.createGain(); rg2.gain.value = 0.25; r2.connect(rf2); rf2.connect(rg2); rg2.connect(this.amb); r2.start();
    [41.2, 41.7, 61.8].forEach(f => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; const g = c.createGain(); g.gain.value = 0.05; o.connect(lp); lp.connect(g); g.connect(this.amb); o.start(); });
    // occasional distant siren
    setInterval(() => { if (!this.ctx || Math.random() < 0.6) return; const t = this.now(); const o = c.createOscillator(); o.type = 'sine'; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 1); g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
      for (let i = 0; i < 6; i++) { o.frequency.setValueAtTime(700, t + i); o.frequency.linearRampToValueAtTime(980, t + i + 0.5); o.frequency.linearRampToValueAtTime(700, t + i + 1); }
      const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { p.pan.value = rand(-1, 1); o.connect(g); g.connect(p); p.connect(this.amb); } else { o.connect(g); g.connect(this.amb); } o.start(t); o.stop(t + 6.2); }, 9000);
  },
  // ---------------- music ----------------
  startMusic() {
    const c = this.ctx; const bpm = 94, step = 60 / bpm / 4; let next = c.currentTime + 0.1, n = 0;
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    this.intensity = 0.5;
    const sched = () => {
      if (!this.ctx) return;
      while (next < c.currentTime + 0.2) {
        const bar = Math.floor(n / 16) % 4, s = n % 16, ch = prog[bar], t = next;
        // bass
        if (s % 2 === 0) {
          const root = ch[0] - 24 + (s % 8 === 6 ? 12 : 0);
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
          lp.frequency.setValueAtTime(200 + 700 * this.intensity, t); lp.frequency.exponentialRampToValueAtTime(120, t + step * 1.8);
          const g = c.createGain(); this.env(g, t, 0.005, 0.16, step * 1.8); o.connect(lp); lp.connect(g); g.connect(this.music); o.start(t); o.stop(t + step * 2);
        }
        // pad per bar
        if (s === 0) ch.forEach(m => { [0, 7].forEach(dt => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt - 3;
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 16.5);
          o.connect(lp); lp.connect(g); g.connect(this.music); o.start(t); o.stop(t + step * 17); }); });
        // arp
        if (this.intensity > 0.3) {
          const m = ch[[0, 1, 2, 1][s % 4]] + 12 + (s >= 8 ? 12 : 0);
          const o = c.createOscillator(); o.type = 'square'; o.frequency.value = mtof(m); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
          const g = c.createGain(); this.env(g, t, 0.003, 0.018, step * 0.9); o.connect(lp); lp.connect(g); g.connect(this.music); g.connect(this.delay); o.start(t); o.stop(t + step);
        }
        // drums
        if (this.intensity > 0.6) {
          if (s % 4 === 0) this.tone('sine', 140, 40, 0.18, 0.35, this.music, t);
          if (s % 8 === 4) this.burst('highpass', 1800, 1500, 0.8, 0.12, 0.08, this.music, t);
          if (s % 2 === 1) this.burst('highpass', 8000, 8000, 1, 0.03, 0.03, this.music, t);
        }
        next += step; n++;
      }
    };
    setInterval(sched, 40);
  },
  applyMusic() { if (!this.ctx) return; const t = this.now(); this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(this.musicOn && this.musicScreen ? 0.55 * this.vol.music : 0, t, 0.4); },
  setMusic(on) { this.musicOn = !!on; this.applyMusic(); },
  setMusicScreen(on) { this.musicScreen = !!on; this.applyMusic(); },
};
// Every play of these gets its own slight pitch and level, so repeated hits, steps and shots don't sound copy-pasted.
// [name, pitch spread, volume spread]; all layers of one play shift together.
for (const [k, p, v] of [['release', 0.04, 0.1], ['nock', 0.06, 0.15], ['quiver', 0.08, 0.2], ['hit', 0.07, 0.15], ['thunk', 0.08, 0.2], ['step', 0.1, 0.3], ['land', 0.08, 0.2],
  ['explode', 0.06, 0.1], ['fireIgnite', 0.08, 0.15], ['hurt', 0.06, 0.12], ['slam', 0.05, 0.1], ['spit', 0.08, 0.15], ['pounce', 0.08, 0.15], ['zap', 0.06, 0.15],
  ['tag', 0.03, 0.1], ['frost', 0.05, 0.1], ['tether', 0.05, 0.1], ['scream', 0.06, 0.1], ['hookFire', 0.06, 0.12], ['hookAttach', 0.07, 0.15], ['hookRelease', 0.06, 0.12], ['hookReel', 0.1, 0.25], ['swap', 0.05, 0.1]]) {
  const f = AUD[k];
  AUD[k] = function (...a) { this._pv = rand(1 - p, 1 + p); this._vv = rand(1 - v, 1 + v * 0.4); try { return f.apply(this, a); } finally { this._pv = this._vv = 1; } };
}
