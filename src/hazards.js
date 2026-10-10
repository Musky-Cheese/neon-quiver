/* ============================================================
   District hazards. The Metro's flood water slows everyone who
   wades through it, and a Cryo Burst freezes a patch over. The
   Refinery's fuel tanks go up when a Blast Arrow or any other
   blast gets them; they set their neighbours off, and come back
   a few waves later. Plus the ambient life of both districts:
   water pouring from broken pipes, the flare stack, steam plumes.
   ============================================================ */
const HAZ = { ice: [], hinted: {}, tick: 0, wadeT: 0 };
const TANK_BLAST_R = 9, TANK_RESPAWN_WAVES = 3, TANK_COOK = 1.6, TANK_BURN = 26;

// 0 dry, 1 koi pond, 2 flood water (ice over it counts as dry)
function waterAt(x, z) {
  for (const f of WORLD.floods) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) {
    for (const i of HAZ.ice) if ((x - i.x) ** 2 + (z - i.z) ** 2 < i.r * i.r) return 0;
    return 2;
  }
  return inKoiPond(x, z) ? 1 : 0;
}

function hazReset() {
  HAZ.ice.length = 0;
  for (const t of WORLD.tanks) { t.alive = true; t.fuse = 0; t.cook = null; t.burnT = 0; t.deadWave = -99; t.circle.h = t.h; }
}

/* ---------------- fuel tanks ---------------- */
function tankAt(x, y, z, pad) {
  for (const t of WORLD.tanks) if (t.alive && y < t.h + pad && (x - t.x) ** 2 + (z - t.z) ** 2 < (t.r + pad) ** 2) return t;
  return null;
}
function tankIgnite(t, fuse, cookAt) {
  if (!t.alive) return;
  if (t.fuse > 0 && t.fuse <= fuse) return;
  if (cookAt && !(t.fuse > 0)) { const d = Math.hypot(t.x - PLAYER.x, t.z - PLAYER.z); if (d < 70) AUD.tankHiss(PLAYER.at(t.x, t.z), 1 - d / 80); }
  t.fuse = fuse; if (cookAt) t.cook = cookAt;
}
// any explosion (Plasma, the hive nest, another tank) sets off the tanks it reaches
function hazBlast(x, z, R, y = 0) {
  for (const t of WORLD.tanks) {
    if (!t.alive || y > t.h + 3) continue; const d = Math.hypot(t.x - x, t.z - z);
    if (d < R + t.r) tankIgnite(t, 0.18 + d * 0.035 + Math.random() * 0.12, null);
  }
}
// a Cryo Burst freezes the flood water over and cools a tank that's cooking
function hazFrost(x, z) {
  let wet = false;
  for (const f of WORLD.floods) if (x > f.x0 - 5 && x < f.x1 + 5 && z > f.z0 - 5 && z < f.z1 + 5) wet = true;
  if (wet) { HAZ.ice.push({ x, z, r: 5, t: 14 }); if (HAZ.ice.length > 6) HAZ.ice.shift(); }
  for (const t of WORLD.tanks) if (t.alive && t.cook && Math.hypot(t.x - x, t.z - z) < 5 + t.r) {
    t.fuse = 0; t.cook = null; burst(t.x, 2.5, t.z, 30, [0.8, 1.6, 2.4], 3, 0.8, 0.12, 1, 1.5);
    for (const f of FIRES) if (Math.hypot(f.x - t.x, f.z - t.z) < t.r + 1.6) f.t = 0;   // and the fire at its foot, or it cooks again
  }
}
function tankBlast(t) {
  const x = t.x, z = t.z, R = TANK_BLAST_R, pd = Math.hypot(PLAYER.x - x, PLAYER.z - z);
  t.alive = false; t.fuse = 0; t.cook = null; t.burnT = TANK_BURN; t.deadWave = GAME.wave; t.circle.h = 1.6;
  explode(x, 1.8, z);   // the blast core: flash, sound, the inner ring of damage, the hive nest
  AUD.tankBoom(pd); shake(clamp(1.5 - pd / 26, 0.15, 1.1));
  flashLight(x, 5, z, [9, 3.6, 0.9], 42, 0.9);
  burst(x, 2.6, z, 150, [3, 1.25, 0.22], 12, 0.9, 0.5, -2, 3.5);
  burst(x, 3.5, z, 60, [3.2, 2.2, 0.8], 7, 0.5, 0.7, 0, 5);
  burst(x, 2.2, z, 36, [0.09, 0.085, 0.08], 17, 1.5, 0.1, 9.8, 0.3);   // shrapnel
  for (let k = 0; k < 40; k++) emit(x + rand(-1.5, 1.5), rand(1.5, 5), z + rand(-1.5, 1.5), rand(-2, 2), rand(2, 6), rand(-2, 2), rand(2.5, 4.5), [0.05, 0.045, 0.04], -rand(1, 1.8), -0.5, 0.6, 1.1, 0.8);
  for (const zz of zombieCandidates(x - R, x + R, z - R, z + R)) {
    if (zz.dead) continue; const d = Math.hypot(zz.x - x, zz.z - z); if (d > R) continue;
    const k = 1 - d / R, dir = [(zz.x - x) / (d || 1), 0, (zz.z - z) / (d || 1)];
    const killed = damageZombie(zz, (90 + 300 * k) * PLAYER.dmgMult, 'body', [zz.x, 1.1 * zz.scale, zz.z], dir, 2, 1, true);
    if (!killed) { zz.burn = Math.max(zz.burn, 5); zz.vx += dir[0] * 12 * k; zz.vz += dir[2] * 12 * k; }
    GAME.hitMarker(false, killed);
  }
  const hurt = pd < R ? Math.round(46 * (1 - pd / R) ** 1.2) : 0;
  if (hurt > 0 && GAME.state === 'playing' && !PLAYER.dead) PLAYER.hurt(hurt, x, z);
  for (let i = PROJ.length - 1; i >= 0; i--) { const a = PROJ[i]; if (a.stuck && a.y > 1.5 && Math.hypot(a.x - x, a.z - z) < t.r + 0.6) PROJ.splice(i, 1); }   // arrows in its wall go with it
  for (let i = 0; i < 7; i++) { const a = Math.random() * TAU, rr = rand(1.9, 5.5); FIRES.push({ x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr, t: rand(6, 11) }); }
  hazBlast(x, z, R - 1.5);
}

/* ---------------- per frame ---------------- */
function updateHazards(dt) {
  const px = PLAYER.x, pz = PLAYER.z, T = GAME.time;
  for (let i = HAZ.ice.length - 1; i >= 0; i--) { const c = HAZ.ice[i]; c.t -= dt; if (c.t <= 0) HAZ.ice.splice(i, 1); else if (c.t < 2) c.r = 5 * c.t / 2; }
  HAZ.tick -= dt; const slow = HAZ.tick <= 0; if (slow) HAZ.tick = 1;
  for (const t of WORLD.tanks) {
    const d2 = (t.x - px) ** 2 + (t.z - pz) ** 2;
    if (t.alive) {
      if (!(t.fuse > 0)) {   // ground fire lapping at the base starts one cooking
        if (slow) for (const f of FIRES) if (Math.hypot(f.x - t.x, f.z - t.z) < t.r + 1.3) { tankIgnite(t, TANK_COOK, { x: f.x, y: 0.9, z: f.z, nx: 0, nz: 0 }); break; }
        continue;
      }
      t.fuse -= dt;
      const c = t.cook;
      if (c && d2 < 90 * 90) for (let k = 0; k < 3; k++) if (Math.random() < dt * 30) emit(c.x, c.y, c.z, c.nx * rand(4, 8) + rand(-0.6, 0.6), rand(0.4, 1.8), c.nz * rand(4, 8) + rand(-0.6, 0.6), rand(0.25, 0.45), [3, 1.2 + Math.random() * 0.5, 0.2], rand(0.2, 0.4), -1.5, 1.4, -0.3);
      if (c && d2 < 35 * 35 && Math.random() < dt * 5) AUD.tick();
      if (t.fuse <= 0) tankBlast(t);
    } else {
      if (t.burnT > 0) {
        t.burnT -= dt;
        if (d2 < 70 * 70) {
          const k = clamp(t.burnT / 8, 0.25, 1);
          if (Math.random() < dt * 40 * k) emit(t.x + rand(-1, 1), 1.7, t.z + rand(-1, 1), rand(-0.3, 0.3), rand(1.8, 3.5), rand(-0.3, 0.3), rand(0.35, 0.7), [2.8, 1 + Math.random() * 0.5, 0.15], rand(0.3, 0.6), -1.2, 1.2, -0.3);
          if (Math.random() < dt * 7 * k) emit(t.x + rand(-0.5, 0.5), 2.8, t.z + rand(-0.5, 0.5), rand(-0.2, 0.2) + (WX.wind + WX.gust) * 0.6, rand(1.4, 2.4), rand(-0.2, 0.2), rand(3, 5), [0.045, 0.04, 0.04], -rand(0.6, 0.9), -0.3, 0.45, 1.1, 0.6);
        }
      } else if (slow && GAME.wave >= t.deadWave + TANK_RESPAWN_WAVES && d2 > 30 * 30) { t.alive = true; t.circle.h = t.h; }
    }
  }
  // water pouring out of the Metro's broken pipes
  for (const c of WORLD.cascades) {
    if (Math.abs(c[0] - px) > 45 || Math.abs(c[2] - pz) > 45) continue;
    const v = 1.3, lx = c[0] + c[3] * v * Math.sqrt(2 * c[1] / 9.8), lz = c[2] + c[4] * v * Math.sqrt(2 * c[1] / 9.8);
    for (let k = 0; k < 2; k++) if (Math.random() < dt * 30) emit(c[0] + rand(-0.12, 0.12), c[1], c[2] + rand(-0.12, 0.12), c[3] * rand(1.1, 1.5) + rand(-0.08, 0.08), rand(-0.3, 0.2), c[4] * rand(1.1, 1.5) + rand(-0.08, 0.08), Math.sqrt(2 * c[1] / 9.8) + 0.05, [0.32, 0.38, 0.44], rand(0.04, 0.07), 9.8, 0.05, 0, 0.75);
    if (Math.random() < dt * 22) emit(lx + rand(-0.3, 0.3), 0.06, lz + rand(-0.3, 0.3), rand(-0.9, 0.9), rand(1, 2.4), rand(-0.9, 0.9), 0.35, [0.4, 0.46, 0.52], 0.04, 9, 0, 0, 0.7);
    if (Math.random() < dt * 3) emit(lx, 0.2, lz, rand(-0.3, 0.3), rand(0.2, 0.5), rand(-0.3, 0.3), rand(1.5, 2.5), THEME.fog.map(v => v * 1.2 + 0.05), -rand(0.4, 0.7), -0.05, 0.5, 0.6, 0.12);
  }
  // wading: splashes round anyone moving through the flood, a slosh with each of your strides
  for (const z of zombieCandidates(px - 35, px + 35, pz - 35, pz + 35)) if (z.wade < 1 && !z.dead && z.mv > 0.4 && Math.random() < dt * 12) emit(z.x + rand(-0.35, 0.35), 0.06, z.z + rand(-0.35, 0.35), rand(-0.8, 0.8), rand(1, 2.2), rand(-0.8, 0.8), 0.35, [0.4, 0.47, 0.53], 0.045, 9, 0, 0, 0.7);
  const hs = Math.hypot(PLAYER.vx, PLAYER.vz);
  if (GAME.state === 'playing' && PLAYER.wading && PLAYER.grounded && hs > 1) { HAZ.wadeT -= dt * hs / 5.4; if (HAZ.wadeT <= 0) { HAZ.wadeT = 0.42; AUD.wade(clamp(hs / 5.4, 0.5, 1.3)); } }
  // the flare stack and the cooling towers, seen from across the city
  for (const f of WORLD.flares) { const d2 = (f[0] - px) ** 2 + (f[2] - pz) ** 2; if (d2 < 260 * 260 && Math.random() < dt * 14) emit(f[0] + rand(-0.8, 0.8), f[1] + 3.5, f[2] + rand(-0.8, 0.8), rand(-0.4, 0.4) + (WX.wind + WX.gust) * 1.2, rand(2, 3.5), rand(-0.4, 0.4), rand(3, 5), [0.05, 0.045, 0.04], -rand(1.4, 2.2), -0.3, 0.3, 1.2, 0.55); }
  for (const p of WORLD.plumes) { const d2 = (p[0] - px) ** 2 + (p[2] - pz) ** 2; if (d2 < 280 * 280 && Math.random() < dt * 5) { const a = Math.random() * TAU, r = Math.random() * p[3] * 0.8, fc = THEME.fog; emit(p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r, rand(-0.3, 0.3) + (WX.wind + WX.gust) * 1.5, rand(1.8, 3.2), rand(-0.3, 0.3), rand(7, 11), [fc[0] * 1.4 + 0.08, fc[1] * 1.4 + 0.08, fc[2] * 1.4 + 0.09], -rand(3.5, 5.5), -0.1, 0.2, 0.9, 0.3); } }
  // first time in: what's different here
  const d = PLAYER.district;
  if (GAME.state === 'playing' && d && !HAZ.hinted[d.id]) {
    if (d.id === 'metro' && PLAYER.wading) { HAZ.hinted.metro = true; GAME.toast('FLOOD WATER SLOWS EVERYONE · CRYO FREEZES IT OVER', '#9fe7ff'); }
    if (d.id === 'refinery') { HAZ.hinted.refinery = true; GAME.toast('FUEL TANKS BLOW TO BLAST ARROWS · KEEP YOUR DISTANCE', '#ffb52e'); }
  }
  const id = GAME.state === 'title' ? '' : districtAt(px, pz).id;
  AUD.hazAmb(id === 'metro' ? 1 : 0, id === 'refinery' ? 1 : 0, dt);
}

const TANK_COL = [0.6, 0.59, 0.55], TANK_BAND = [0.55, 0.07, 0.05], TANK_STRIPE = [0.8, 0.6, 0.08];
function drawHazards(time) {
  const px = PLAYER.x, pz = PLAYER.z;
  for (const t of WORLD.tanks) {
    if ((t.x - px) ** 2 + (t.z - pz) ** 2 > 170 * 170) continue;
    if (t.alive) {
      const heat = t.fuse > 0 ? clamp(1 - t.fuse / TANK_COOK, 0, 1) : 0, g = heat * heat, E = [2.4 * g, 0.7 * g, 0.12 * g];
      drawItem(MESH.cyl, M4.trs(poolM(), t.x, 2.45, t.z, 0, 0, 0, 3.1, 4.1, 3.1), TANK_COL, E);
      drawItem(MESH.cyl, M4.trs(poolM(), t.x, 3.6, t.z, 0, 0, 0, 3.16, 0.42, 3.16), TANK_BAND, E);
      drawItem(MESH.cyl, M4.trs(poolM(), t.x, 1.1, t.z, 0, 0, 0, 3.14, 0.2, 3.14), TANK_STRIPE, [0.25 + E[0], 0.18 + E[1], 0.03]);
      drawItem(MESH.sphere, M4.trs(poolM(), t.x, 4.5, t.z, 0, 0, 0, 3.1, 0.8, 3.1), TANK_COL, E);
      drawItem(MESH.metal, M4.trs(poolM(), t.x + 0.5, 4.95, t.z, 0, 0.4, 0, 0.35, 0.35, 0.35), [0.25, 0.25, 0.27]);
      drawItem(MESH.metal, M4.trs(poolM(), t.x - 1.58, 2.5, t.z, 0, 0, 0, 0.06, 4.2, 0.5), [0.3, 0.22, 0.04]);
      for (const s of [-1, 1]) drawItem(MESH.box, M4.trs(poolM(), t.x, 2.4, t.z + s * 1.56, 0, 0, Math.PI / 4, 0.6, 0.6, 0.04), [1, 0.5, 0.08], [1.4, 0.6, 0.08]);
      const on = t.fuse > 0 ? Math.sin(time * 34) > 0 : Math.sin(time * 2.2 + t.x) > 0.75;
      drawItem(MESH.sphere, M4.trs(poolM(), t.x - 0.5, 5.02, t.z, 0, 0, 0, 0.22, 0.22, 0.22), [1, 0.15, 0.1], on ? [4, 0.4, 0.3] : [0.3, 0.02, 0.02]);
    } else {
      drawItem(MESH.cyl, M4.trs(poolM(), t.x, 0.018, t.z, 0, 0, 0, 9, 0.01, 9), [0.012, 0.01, 0.009]);   // scorched ground
      if (t.burnT > 0) {
        const k = clamp(t.burnT / 8, 0.3, 1);
        for (let i = 0; i < 5; i++) {
          const ph = time * (6 + i * 1.3) + t.x + i * 2.1, fl = 0.55 + 0.45 * Math.sin(ph) * Math.sin(ph * 0.53 + 1.7), a = i / 5 * TAU + time * 0.5;
          const h = (i === 0 ? 2.6 : 1.6) * (0.6 + 0.6 * fl) * k, w = (i === 0 ? 0.9 : 0.5) * (0.8 + 0.3 * fl) * k, off = i === 0 ? 0 : 0.7;
          drawItem(MESH.cone, M4.trs(poolM(), t.x + Math.cos(a) * off, 1.55 + h * 0.5, t.z + Math.sin(a) * off, Math.sin(ph * 0.7) * 0.15, a, Math.sin(ph * 0.9) * 0.15, w, h, w), i === 0 ? [1, 0.75, 0.35] : [1, 0.42, 0.08], i === 0 ? [5 * fl, 3.3 * fl, 1] : [4.2 * fl, 1.5 * fl, 0.25]);
        }
      }
    }
  }
  for (const c of HAZ.ice) {   // a skin of ice over the flood
    if ((c.x - px) ** 2 + (c.z - pz) ** 2 > 80 * 80) continue;
    drawItem(MESH.cyl, M4.trs(poolM(), c.x, 0.05, c.z, 0, 0, 0, c.r * 2, 0.03, c.r * 2), [0.55, 0.7, 0.8], [0.06, 0.16, 0.24]);
    drawItem(MESH.cyl, M4.trs(poolM(), c.x, 0.06, c.z, 0, 0, 0, c.r * 1.3, 0.03, c.r * 1.3), [0.75, 0.88, 0.95], [0.1, 0.22, 0.32]);
  }
  for (const f of WORLD.flares) {   // the flare: a ragged flame that never goes out
    for (let i = 0; i < 4; i++) {
      const ph = time * (5 + i * 1.7) + i * 2.3, fl = 0.6 + 0.4 * Math.sin(ph) * Math.sin(ph * 0.61 + 0.9), lean = (WX.wind + WX.gust) * 0.3;
      const h = (i === 0 ? 7 : 4.5) * (0.7 + 0.5 * fl), w = (i === 0 ? 2.2 : 1.4) * (0.8 + 0.3 * fl), a = i / 4 * TAU + time;
      drawItem(MESH.cone, M4.trs(poolM(), f[0] + Math.cos(a) * (i ? 0.5 : 0) + lean * h * 0.4, f[1] + h * 0.5, f[2] + Math.sin(a) * (i ? 0.5 : 0), Math.sin(ph * 0.8) * 0.12, a, -lean, w, h, w), i === 0 ? [1, 0.75, 0.35] : [1, 0.45, 0.1], i === 0 ? [7 * fl, 4.5 * fl, 1.4] : [5.5 * fl, 2 * fl, 0.35]);
    }
  }
}

/* ---------------- sound ---------------- */
Object.assign(AUD, {
  wade(k = 1) { if (!this.ctx) return; this.burst('bandpass', 750, 280, 1.1, 0.24, 0.09 * k); this.burst('highpass', 2600, 1500, 0.8, 0.14, 0.035 * k); },
  tankHiss(pan, k = 1) {
    if (!this.ctx) return; const o = this.out(pan), t = this.now();
    this.burst('highpass', 3200, 5500, 1.2, TANK_COOK, 0.2 * k, o);
    for (let i = 0; i < 4; i++) this.tone('square', 1320, 1320, 0.09, 0.05 * k, o, t + i * 0.36);
  },
  tankBoom(dist) {
    if (!this.ctx) return; const v = clamp(1.3 - dist / 90, 0.25, 1.3);
    this.explode(dist * 0.6); this.tone('sine', 48, 18, 2.2, 0.9 * v); this.burst('lowpass', 700, 40, 0.7, 2.6, 0.7 * v);
    this.burst('bandpass', 400, 120, 1.5, 3.5, 0.25 * v, this.amb, this.now() + 0.3);   // the roar of the fire after
  },
  hazAmb(metroK, refK, dt) {
    if (!this.ctx || !this.amb) return; const c = this.ctx;
    if (!this.hz) {
      const s = this.noiseSrc(), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 0.5;
      const gw = c.createGain(); gw.gain.value = 0; s.connect(f); f.connect(gw); gw.connect(this.amb); s.start();   // running water
      const o1 = c.createOscillator(), o2 = c.createOscillator(), hf = c.createBiquadFilter(), gh = c.createGain();   // the plant's hum, beating slowly
      o1.type = 'sawtooth'; o1.frequency.value = 50; o2.type = 'sine'; o2.frequency.value = 100.6; hf.type = 'lowpass'; hf.frequency.value = 240; gh.gain.value = 0;
      o1.connect(hf); o2.connect(hf); hf.connect(gh); gh.connect(this.amb); o1.start(); o2.start();
      const s2 = this.noiseSrc(), f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 3800; const gv = c.createGain(); gv.gain.value = 0; s2.connect(f2); f2.connect(gv); gv.connect(this.amb); s2.start();   // venting gas
      this.hz = { gw, gh, gv, drip: 1 };
    }
    const H = this.hz, t = this.now();
    paramTarget(H.gw.gain, 0.14 * metroK, t, 0.8); paramTarget(H.gh.gain, 0.05 * refK, t, 0.8); paramTarget(H.gv.gain, 0.018 * refK, t, 0.8);
    if (metroK > 0) { H.drip -= dt; if (H.drip <= 0) { H.drip = rand(0.2, 1.1); this.tone('sine', rand(1000, 1800), rand(500, 800), 0.08, 0.035, this.amb, t, 0.003); } }
  },
});
