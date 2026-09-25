/* ============================================================
   Synth audio: SFX + ambient + music, all generated
   ============================================================ */
const AUD = {
  ctx: null, master: null, sfx: null, music: null, amb: null, musicOn: true, noise: null, drawNode: null, started: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    let AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = 0.35; this.amb.connect(this.master);
    // delay send for music
    this.delay = c.createDelay(1); this.delay.delayTime.value = 0.375; const fb = c.createGain(); fb.gain.value = 0.35;
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.music);
    const len = c.sampleRate * 2; const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.startAmbient(); this.startMusic();
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); return s; },
  env(g, t, a, peak, dcy, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + dcy); },
  out(pan) {
    if (pan === undefined || !this.ctx.createStereoPanner) return this.sfx;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(this.sfx); return p;
  },
  tone(type, f0, f1, dur, vol, dest, t = this.now(), a = 0.005) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain(); this.env(g, t, a, vol, dur); o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + a + dur + 0.05); return o;
  },
  burst(fType, f0, f1, q, dur, vol, dest, t = this.now(), a = 0.004) {
    const c = this.ctx; const s = this.noiseSrc(); const f = c.createBiquadFilter(); f.type = fType; f.Q.value = q;
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
  },
  nock() { if (!this.ctx) return; const t = this.now(); this.burst('bandpass', 2500, 2500, 6, 0.05, 0.12); this.tone('square', 1800, 1700, 0.03, 0.03, this.sfx, t + 0.02); },
  quiver() { if (!this.ctx) return; this.burst('bandpass', 1800, 900, 2, 0.18, 0.08); },
  hit(head, pan) { if (!this.ctx) return; const o = this.out(pan); this.burst('lowpass', 900, 200, 1, 0.14, 0.45, o); this.tone('sine', 120, 50, 0.12, 0.35, o); if (head) { this.tone('sine', 1650, 1600, 0.25, 0.14, o); this.tone('sine', 2475, 2450, 0.18, 0.06, o); } },
  thunk() { if (!this.ctx) return; this.burst('bandpass', 1200, 500, 3, 0.08, 0.2); this.tone('triangle', 300, 120, 0.06, 0.1); },
  land(k = 1) { if (!this.ctx) return; this.tone('sine', 95, 42, 0.13, 0.12 * k); this.burst('lowpass', 500, 180, 0.7, 0.07, 0.07 * k); },
  kill() { if (!this.ctx) return; this.tone('square', 660, 660, 0.05, 0.04); this.tone('square', 990, 990, 0.08, 0.04, this.sfx, this.now() + 0.05); },
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
  pickup() { if (!this.ctx) return; const t = this.now(); [880, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.08, this.sfx, t + i * 0.06)); },
  heal() { if (!this.ctx) return; const t = this.now(); [523, 659, 784, 1047].forEach((f, i) => this.tone('sine', f, f, 0.2, 0.08, this.sfx, t + i * 0.05)); },
  click() { if (!this.ctx) return; this.tone('square', 1400, 1400, 0.03, 0.04); },
  buy() { if (!this.ctx) return; const t = this.now(); this.tone('square', 740, 740, 0.06, 0.05); this.tone('square', 1480, 1480, 0.1, 0.05, this.sfx, t + 0.06); },
  deny() { if (!this.ctx) return; this.tone('square', 180, 140, 0.15, 0.06); },
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
  cleared() { if (!this.ctx) return; const t = this.now(); [392, 523, 659, 784].forEach((f, i) => this.tone('square', f, f, 0.25, 0.05, this.sfx, t + i * 0.09)); },
  gameOver() { if (!this.ctx) return; const t = this.now(); [392, 330, 262, 196].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.5, 0.08, this.sfx, t + i * 0.28)); },
  heartbeat() { if (!this.ctx) return; const t = this.now(); this.tone('sine', 60, 40, 0.12, 0.35, this.sfx, t); this.tone('sine', 55, 38, 0.12, 0.25, this.sfx, t + 0.18); },
  // ---------------- ambient ----------------
  startAmbient() {
    const c = this.ctx;
    const r = this.noiseSrc(); const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2600; rf.Q.value = 0.4;
    const rg = c.createGain(); rg.gain.value = 0.16; r.connect(rf); rf.connect(rg); rg.connect(this.amb); r.start();
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
  setMusic(on) { this.musicOn = on; if (!this.ctx) return; const t = this.now(); this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.4); },
};
