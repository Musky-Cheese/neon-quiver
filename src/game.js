/* ============================================================
   Game: player, arrows, waves, shop, HUD, render loop
   ============================================================ */
/* ---------------- draw lists ---------------- */
const MPOOL = []; let mpi = 0;
function poolM() { if (mpi >= MPOOL.length) MPOOL.push(new Float32Array(16)); return MPOOL[mpi++]; }
class DrawList { constructor() { this.a = []; this.n = 0; } push(mesh, m, col, emit, flash, skin) { let it = this.a[this.n]; if (!it) it = this.a[this.n] = {}; it.mesh = mesh; it.m = m; it.col = col; it.emit = emit; it.flash = flash; it.skin = skin; this.n++; } }
const WORLD_ITEMS = new DrawList(), VM_ITEMS = new DrawList();
const DRAW_SUPPRESS = { on: false };
const ZERO3 = [0, 0, 0];
const DEF_SKIN = [0.5, 0.5, 0.5];
function drawItem(mesh, m, col, emit, flash = 0, list = WORLD_ITEMS, skin) { if (DRAW_SUPPRESS.on || !mesh) return; list.push(mesh, m, col, emit || ZERO3, flash || 0, skin || DEF_SKIN); }

/* ---------------- settings (per-viewer) ---------------- */
const SETTINGS = { sens: 1, music: true, quality: 1, laptop: false, look: 'noir', fov: 78, invertY: false, shake: 1, reduceFlash: false, padSens: 1, padZone: 0.15, vibration: true };
function loadLS(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
const SAVED_SETTINGS = loadLS('nq_settings', {});
Object.assign(SETTINGS, SAVED_SETTINGS);
if (!THEMES[SETTINGS.look]) SETTINGS.look = 'noir';
SETTINGS.fov = clamp(+SETTINGS.fov || 78, 60, 100); SETTINGS.shake = clamp(+SETTINGS.shake, 0, 1); if (!(SETTINGS.shake >= 0)) SETTINGS.shake = 1; SETTINGS.padSens = clamp(+SETTINGS.padSens || 1, 0.4, 2.5); SETTINGS.padZone = clamp(+SETTINGS.padZone || 0.15, 0.05, 0.4);   // saved values from older builds, or hand-edited
try { if (!('reduceFlash' in SAVED_SETTINGS) && matchMedia('(prefers-reduced-motion: reduce)').matches) SETTINGS.reduceFlash = true; } catch (e) { }   // first run only; a saved choice wins
setTheme(SETTINGS.look);

/* ---------------- player ---------------- */
const REGEN = { delay: 6, rate: 2.5, cap: 0.5 };
// per-run knobs (daily.js sets them from the active mutators; the neutral values change nothing)
const RUN = { mode: 'normal', date: '', seed: 0, ids: [], hpK: 1, dmgK: 1, ammoK: 1, spawnK: 1, zhpK: 1, regenK: 1, expo: 1, amb: 1, eliteNight: false, snow: false, scoreMult: 1, _snow: false };
const INTERMISSION = 25;   // seconds between waves (visible countdown; N starts the next wave early)
const PLAYER = {
  x: 0, y: 0, z: 14, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, roll: 0, grounded: true,
  hp: 100, maxHp: 100, speedMult: 1, drawTime: 0.62, reloadTime: 0.62, dmgMult: 1, ammo: [Infinity, 4, 2, 4, 2, 2, 3],
  dmgFlash: 0, hurtDirs: [], vmIn: 0, fov: 78, lastHurt: 0, dead: false, deathT: 0, beat: 0,
  up: { draw: 0, dmg: 0, hp: 0, reload: 0, speed: 0 },
  panOf(x, z) { const dx = x - this.x, dz = z - this.z, L = Math.hypot(dx, dz) || 1; return clamp((dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / L, -1, 1); },
  hurt(d, fx, fz) {
    if (this.dead || GAME.state !== 'playing') return;
    this.hp -= d; this.lastHurt = GAME.time; this.dmgFlash = Math.min(1, this.dmgFlash + 0.35 + d / 60); shake(0.25 + d / 80); AUD.hurt(); padRumble(0.3, clamp(0.5 + d / 40, 0.5, 1), 180);
    const ang = Math.atan2(fx - this.x, fz - this.z); this.hurtDirs.push({ ang, t: 1.2 });
    if (this.hp <= 0) { this.hp = 0; GAME.gameOver(); }
  },
};
function applyUpgrades() {
  const u = PLAYER.up;
  PLAYER.drawTime = 0.62 * Math.pow(0.86, u.draw);
  PLAYER.dmgMult = (1 + 0.16 * u.dmg) * RUN.dmgK;
  PLAYER.maxHp = 100 * RUN.hpK + 25 * u.hp;
  PLAYER.reloadTime = 0.62 * Math.pow(0.84, u.reload);
  PLAYER.speedMult = 1 + 0.08 * u.speed;
}

/* ---------------- input ---------------- */
const INPUT = { keys: {}, mouseDown: false, dx: 0, dy: 0, locked: false, freeLook: false };
// rebindable actions -> KeyboardEvent.code. Esc (pause), 1-7 (arrows), the arrow keys and Right Shift stay fixed.
const BIND_DEFAULTS = { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space', hook: 'KeyQ', use: 'KeyE', next: 'KeyN', last: 'KeyX', pause: 'KeyP' };
const BINDS = Object.assign({}, BIND_DEFAULTS);
{ const sv = loadLS('nq_binds', {}); if (sv && typeof sv === 'object') for (const a in BIND_DEFAULTS) if (typeof sv[a] === 'string' && sv[a] && sv[a] !== 'Escape') BINDS[a] = sv[a]; }
function keyLabel(code) {
  const m = /^(Shift|Control|Alt)(Left|Right)$/.exec(code); if (m) return (m[2] === 'Right' ? 'R ' : '') + (m[1] === 'Control' ? 'CTRL' : m[1].toUpperCase());
  return code === 'Space' ? 'SPACE' : code.replace(/^(Key|Digit)/, '').replace(/^Numpad/, 'NUM ').replace(/^Arrow/, '').toUpperCase();
}
function hint(act) { return PAD.last === 'pad' ? padGlyph(act) : keyLabel(BINDS[act]); }   // what to tell the player to press (the pad build swaps in a button glyph)
const gameEl = document.getElementById('game');
// player actions, shared by keyboard, mouse and gamepad (input.js)
function actDrawStart() { INPUT.mouseDown = true; bowStartDraw(); }
function actDrawEnd() { INPUT.mouseDown = false; if (GAME.state === 'playing') { const p = bowRelease(); if (p) fireArrow(p); } }
function actHookDown() { if (HOOK.state === 'reel') hookFire(); else if (HOOK.state === 'idle') { HOOK.aiming = true; HOOK.aimT = 0; } }   // hold to preview the anchor, release to fire; again while reeling cuts the rope
function actHookUp() { if (HOOK.aiming) { HOOK.aiming = false; HOOK.aim = null; if (GAME.state === 'playing') hookFire(); } }
function actCycleArrow(dir) { let t = BOW.nextType >= 0 ? BOW.nextType : BOW.type; const NA = ARROWS.length; for (let i = 0; i < NA; i++) { t = (t + dir + NA) % NA; if (t === 0 || PLAYER.ammo[t] > 0) break; } selectArrow(t); }
addEventListener('keydown', (e) => {
  const k = e.code; INPUT.keys[k] = true; PAD.last = 'kbm';
  if (GAME.state === 'playing') {
    const dn = /^Digit([1-7])$/.exec(k); if (dn) selectArrow(+dn[1] - 1);
    if (k === BINDS.last) selectArrow(GAME.lastType);
    // grapple: hold Q to preview the anchor and fall risk, release to fire; Q while reeling cuts the rope
    if (k === BINDS.hook && !e.repeat) actHookDown();
    if (k === BINDS.pause || k === 'Escape') GAME.pause();
    if (k === 'Space' || k === BINDS.jump) e.preventDefault();
    if (k === BINDS.use && GAME.nearTerminal) GAME.openShop();
    if (k === BINDS.next && GAME.intermission) { GAME.interT = 0; }
  } else if (GAME.state === 'paused' && k === BINDS.pause && $('scr-controls').hidden) GAME.resume();
});
addEventListener('keyup', (e) => { INPUT.keys[e.code] = false; if (e.code === BINDS.hook) actHookUp(); });
addEventListener('blur', () => { INPUT.keys = {}; HOOK.aiming = false; if (INPUT.mouseDown) { INPUT.mouseDown = false; } });
addEventListener('mousemove', (e) => { if (e.movementX || e.movementY) PAD.last = 'kbm'; if (GAME.state !== 'playing') return; if (INPUT.locked || INPUT.freeLook) { INPUT.dx += e.movementX || 0; INPUT.dy += e.movementY || 0; } });
gameEl.addEventListener('mousedown', (e) => {
  PAD.last = 'kbm';
  if (GAME.state !== 'playing') return;
  if (!INPUT.locked && !INPUT.freeLook) { requestLock(); return; }
  if (INPUT.freeLook && !INPUT.locked) requestLock(true);
  if (e.button === 0) actDrawStart();
  if (e.button === 2) { bowCancel(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) actDrawEnd(); });
gameEl.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (GAME.state !== 'playing') return; actCycleArrow(e.deltaY > 0 ? 1 : -1); }, { passive: true });
function requestLock(quiet) {
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { INPUT.freeLook = true; }); } catch (e) { INPUT.freeLook = true; }
  if (!quiet) setTimeout(() => { if (!INPUT.locked) INPUT.freeLook = true; }, 1500);
}
document.addEventListener('pointerlockchange', () => {
  INPUT.locked = document.pointerLockElement === canvas;
  if (INPUT.locked) INPUT.freeLook = false;
  if (!INPUT.locked && GAME.state === 'playing' && PAD.last !== 'pad') GAME.pause();   // Esc (or alt-tab) always pauses; a pad player never had the lock to lose
});
function selectArrow(t) {
  if (t < 0 || t >= ARROWS.length) return;
  if (t !== 0 && PLAYER.ammo[t] <= 0) { AUD.deny(); flashQuiver(t); return; }
  const cur = BOW.nextType >= 0 ? BOW.nextType : BOW.type; if (cur === t) return;
  GAME.lastType = cur; bowSwap(t);
}

/* ---------------- projectiles ---------------- */
const PROJ = [];
const GRAV = 9.5;
const _cf = [0, 0, 0], _cr = [0, 0, 0], _cu = [0, 0, 0];
function camBasis() {
  const cy = Math.cos(PLAYER.yaw), sy = Math.sin(PLAYER.yaw), cp = Math.cos(PLAYER.pitch), sp = Math.sin(PLAYER.pitch);
  _cf[0] = -sy * cp; _cf[1] = sp; _cf[2] = -cy * cp; _cr[0] = cy; _cr[1] = 0; _cr[2] = -sy; _cu[0] = sy * sp; _cu[1] = cp; _cu[2] = cy * sp;
}
function fireArrow(power) {
  const type = BOW.type, A = ARROWS[type]; padRumble(0.15 + power * 0.3, 0.1, 90);
  if (type !== 0) { PLAYER.ammo[type]--; }
  camBasis();
  const eye = [PLAYER.x, PLAYER.y + 1.62 - (PLAYER.sink || 0), PLAYER.z];
  const spd = (40 + 64 * power) * A.speed;
  // tiny spread when not fully drawn
  const spr = (1 - power) * 0.012 + (BOW.hold > 2.2 ? 0.004 : 0);
  const dx = _cf[0] + (Math.random() - 0.5) * spr, dy = _cf[1] + (Math.random() - 0.5) * spr, dz = _cf[2] + (Math.random() - 0.5) * spr;
  const n = type === AT.SCATTER ? 6 : 1, cone = type === AT.SCATTER ? 0.08 : 0;
  for (let s = 0; s < n; s++) {
    const jx = dx + (Math.random() - 0.5) * cone * 2, jy = dy + (Math.random() - 0.5) * cone * 1.4, jz = dz + (Math.random() - 0.5) * cone * 2, jl = Math.hypot(jx, jy, jz);
    PROJ.push({
      x: eye[0] + _cf[0] * 0.4 - _cu[0] * 0.04, y: eye[1] + _cf[1] * 0.4 - _cu[1] * 0.04, z: eye[2] + _cf[2] * 0.4 - _cu[2] * 0.04,
      vx: jx / jl * spd, vy: jy / jl * spd, vz: jz / jl * spd, type, power, pierce: type === 3 ? 5 : 0, hits: [], age: 0, stuck: false, stuckT: 0, dir: [jx / jl, jy / jl, jz / jl], stuckZ: null,
      life: type === AT.SCATTER ? 0.24 : 6,   // scatter shards burn out after ~20 m
    });
  }
  AUD.release(power, type); shake(0.04 + power * 0.05);
  GAME.shots++;
  if (type !== 0 && PLAYER.ammo[type] <= 0) { GAME.lastType = 0; BOW.nextType = 0; }
  updateQuiverHUD();
}
const _seg0 = [0, 0, 0], _seg1 = [0, 0, 0], _so = { s: 0 };
const _trailC = [0, 0, 0];
const LEG_SEGS = ['hipL', 'knL', 'knL', 'ftL', 'hipR', 'knR', 'knR', 'ftR'];
function updateProjectiles(dt) {
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const a = PROJ[i];
    if (a.stuck) { a.stuckT += dt; if (a.stuckT > 14 || (a.stuckZ && a.stuckZ.dead && a.stuckZ.dieT > 4)) PROJ.splice(i, 1); continue; }
    a.age += dt; if (a.age > (a.life || 6)) { PROJ.splice(i, 1); continue; }
    _seg0[0] = a.x; _seg0[1] = a.y; _seg0[2] = a.z;
    a.vy -= GRAV * dt * (a.type === 3 ? 0.35 : 1);
    const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt, nz = a.z + a.vz * dt;
    _seg1[0] = nx; _seg1[1] = ny; _seg1[2] = nz;
    const sl = Math.hypot(a.vx, a.vy, a.vz); a.dir[0] = a.vx / sl; a.dir[1] = a.vy / sl; a.dir[2] = a.vz / sl;
    // trail
    const A = ARROWS[a.type]; const tc = A.glow, trc = _trailC; trc[0] = tc[0] * 0.5; trc[1] = tc[1] * 0.5; trc[2] = tc[2] * 0.5;   // emit copies the colour
    for (let k = 0; k < (a.type === 0 ? 1 : 3); k++) { const t = Math.random(); emit(lerp(a.x, nx, t), lerp(a.y, ny, t), lerp(a.z, nz, t), rand(-0.2, 0.2), rand(-0.1, 0.3), rand(-0.2, 0.2), a.type === 0 ? 0.25 : 0.5, trc, a.type === 0 ? 0.05 : 0.12, 0, 2, a.type === 1 ? 0.3 : 0.05, a.type === 0 ? 0.5 : 1); }
    // --- find earliest hit
    let best = 1.01, hitKind = null, hitZ = null, hitPart = null; const segL = Math.hypot(nx - a.x, ny - a.y, nz - a.z) || 1e-3;
    // zombies
    const zPad = 4;
    for (const z of zombieCandidates(Math.min(a.x, nx) - zPad, Math.max(a.x, nx) + zPad, Math.min(a.z, nz) - zPad, Math.max(a.z, nz) + zPad)) {
      if (z.dead || z.state === 'drop' || a.hits.includes(z)) continue;
      const sc = z.scale;
      if (Math.abs(z.x - a.x) > 20 || Math.abs(z.z - a.z) > 20) continue;
      ensurePose(z);
      if (Math.abs(z.x - nx) > 12 && Math.abs(z.x - a.x) > 12) continue;
      if (!z.headless) { const hr = 0.19 * sc * (z.type === 'boss' ? 0.8 : 1); if (segPointDist2(_seg0, _seg1, z.head, _so) < hr * hr && _so.s < best) { best = _so.s; hitKind = 'z'; hitZ = z; hitPart = 'head'; } }
      if (z.type === 'boss') { const cr = 0.16 * sc; if (segPointDist2(_seg0, _seg1, z.core, _so) < cr * cr && _so.s < best) { best = _so.s; hitKind = 'z'; hitZ = z; hitPart = 'core'; } }
      const br = (z.type === 'brute' ? 0.33 : z.type === 'boss' ? 0.3 : 0.24) * sc, lr = (z.type === 'brute' ? 0.11 : 0.085) * sc;
      // a clean line through the head wins over grazing the top of the torso capsule
      const mg = hitZ === z && hitPart === 'head' ? Math.max(0.02, 0.3 / segL) : 0.02;
      if (segSegDist2(_seg0, _seg1, z.a, z.b, _so) < br * br && _so.s < best - mg) { best = _so.s; hitKind = 'z'; hitZ = z; hitPart = 'body'; }
      for (let L = 0; L < 8; L += 2) if (segSegDist2(_seg0, _seg1, z[LEG_SEGS[L]], z[LEG_SEGS[L + 1]], _so) < lr * lr && _so.s < best - 0.02) { best = _so.s; hitKind = 'z'; hitZ = z; hitPart = 'legs'; }
    }
    // the hive nest (field objective)
    { const t = objNestHit(_seg0, _seg1, _so); if (t >= 0 && t < best) { best = t; hitKind = 'n'; } }
    // ground
    if (ny <= 0.02) { const t = (a.y - 0.02) / (a.y - ny); if (t < best) { best = t; hitKind = 'w'; } }
    // boxes (slab test)
    const [nearBoxes, nearCircles] = worldCandidates(Math.min(a.x, nx) - 0.2, Math.max(a.x, nx) + 0.2, Math.min(a.z, nz) - 0.2, Math.max(a.z, nz) + 0.2);
    for (const b of nearBoxes) {
      let t0 = 0, t1 = 1; const d = [nx - a.x, ny - a.y, nz - a.z], o = [a.x, a.y, a.z], mn = [b.x0, b.y0, b.z0], mx = [b.x1, b.y1, b.z1]; let ok = true;
      for (let ax = 0; ax < 3 && ok; ax++) { if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < mn[ax] || o[ax] > mx[ax]) ok = false; } else { let ta = (mn[ax] - o[ax]) / d[ax], tb = (mx[ax] - o[ax]) / d[ax]; if (ta > tb) { const q = ta; ta = tb; tb = q; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false; } }
      if (ok && t0 < best) { best = t0; hitKind = 'w'; }
    }
    // circles (vertical cylinders)
    for (const c of nearCircles) {
      const ox = a.x - c.x, oz = a.z - c.z, dx = nx - a.x, dz = nz - a.z; const A2 = dx * dx + dz * dz; if (A2 < 1e-9) continue;
      const Bq = 2 * (ox * dx + oz * dz), C = ox * ox + oz * oz - c.r * c.r; const disc = Bq * Bq - 4 * A2 * C; if (disc < 0) continue;
      const t = (-Bq - Math.sqrt(disc)) / (2 * A2); if (t < 0 || t > best) continue; const y = a.y + (ny - a.y) * t; if (y > c.h) continue; best = t; hitKind = 'w';
    }
    if (!hitKind) { a.x = nx; a.y = ny; a.z = nz; continue; }
    const hx = a.x + (nx - a.x) * best, hy = a.y + (ny - a.y) * best, hz = a.z + (nz - a.z) * best;
    if (hitKind === 'n') {
      objNestDamage(52 * (0.3 + 0.7 * a.power) * A.dmg * PLAYER.dmgMult, hx, hy, hz); GAME.hits++; AUD.hit(false, PLAYER.panOf(hx, hz));
      if (a.type === 2) explode(hx, hy, hz); else if (a.type === AT.FROST) frostBurst(hx, hy, hz);
      PROJ.splice(i, 1); continue;
    }
    if (hitKind === 'z') {
      const z = hitZ; a.hits.push(z);
      const dmgBase = 52 * (0.3 + 0.7 * a.power) * A.dmg * PLAYER.dmgMult;
      const mult = hitPart === 'head' ? (z.type === 'boss' ? 1.8 : 2.6) : hitPart === 'core' ? 2.2 : 1;
      const dmg = dmgBase * mult;
      const dir = a.dir.slice();
      const wasAlive = !z.dead;
      if (hitPart === 'head' || hitPart === 'core') { GAME.hitMarker(true); if (hitPart === 'head') GAME.headHits++; }
      else GAME.hitMarker(false);
      GAME.hits++;
      // stick arrow into zombie (not rail)
      if (a.type !== 3 && a.type !== 2 && a.type !== AT.SCATTER && a.type !== AT.FROST && z.stuck.length < 8 && hitPart !== 'legs') { const loc = localize(z, hitPart === 'head' ? 'head' : 'body', [hx, hy, hz], dir); if (loc) z.stuck.push({ part: hitPart === 'head' ? 'head' : 'body', lp: loc.lp, ld: loc.ld, type: a.type }); }
      const killed = damageZombie(z, dmg, hitPart, [hx, hy, hz], dir, a.type, a.power);
      floatText(hx, hy + 0.2, hz, Math.round(dmg).toString(), hitPart !== 'body' ? '#ffd23a' : '#ffffff', hitPart !== 'body' ? 1.3 : 1);
      burst(hx, hy, hz, hitPart === 'head' ? 10 : 5, [0.45, 1.3, 0.25], 3, 0.4, 0.05, 10, 1.2);
      burst(hx, hy, hz, 8, A.glow, 6, 0.25, 0.05, 0, 3);
      AUD.hit(hitPart !== 'body', PLAYER.panOf(hx, hz));
      if (killed) { GAME.hitMarker(true, true); }
      if (a.type === 1 && wasAlive) { z.burn = 4.5; AUD.fireIgnite(); }
      if (a.type === AT.FROST) { frostBurst(hx, hy, hz); PROJ.splice(i, 1); continue; }
      if (a.type === AT.TETHER) { tetherFrom(z, hx, hy, hz); }
      if (a.type === 2) { explode(hx, hy, hz); PROJ.splice(i, 1); continue; }
      if (a.type === 3 && a.pierce > 0) { a.pierce--; a.x = hx + a.dir[0] * 0.05; a.y = hy + a.dir[1] * 0.05; a.z = hz + a.dir[2] * 0.05; continue; }
      PROJ.splice(i, 1); continue; // arrow now drawn as stuck on zombie
    } else {
      a.x = hx - a.dir[0] * 0.05; a.y = hy - a.dir[1] * 0.05; a.z = hz - a.dir[2] * 0.05;
      a.stuck = true; a.stuckT = 0;
      hazArrowHit(hx, hy, hz, a.type);
      burst(hx, hy, hz, 10, [1.5, 1.4, 1.2], 4, 0.3, 0.04, 8, 2);
      if (a.type === 2) { explode(hx, hy + 0.2, hz); PROJ.splice(i, 1); continue; }
      if (a.type === AT.FROST) { frostBurst(hx, hy + 0.2, hz); PROJ.splice(i, 1); continue; }
      if (a.type === AT.SCATTER) { PROJ.splice(i, 1); continue; }   // shards shatter on walls
      if (a.type === 1) { FIRES.push({ x: hx, z: hz, t: 4.5 }); AUD.fireIgnite(); }
      AUD.thunk();
      if (PROJ.filter(p => p.stuck).length > 45) { const k = PROJ.findIndex(p => p.stuck); if (k >= 0 && k !== i) PROJ.splice(k, 1); }
    }
  }
}
/* height of the highest walkable top under a footprint of radius rad. Only tops you are already level
   with (or just below, so a jump that clips an edge still lands) count; taller things stay walls. */
function groundAt(x, z, y, rad) {
  let h = 0; const lim = y + 0.32;
  const [boxes, circles] = worldCandidates(x - rad, x + rad, z - rad, z + rad);
  for (const b of boxes) {
    if (b.y1 > lim || b.y1 > 2.5 || b.y1 <= h) continue;
    if (x + rad < b.x0 || x - rad > b.x1 || z + rad < b.z0 || z - rad > b.z1) continue;
    h = b.y1;
  }
  for (const c of circles) {
    if (c.h > lim || c.h > 2.5 || c.h <= h) continue;
    const dx = x - c.x, dz = z - c.z, R = c.r + rad * 0.5;
    if (dx * dx + dz * dz < R * R) h = c.h;
  }
  return h;
}
/* ray vs static world (boxes + cylinders); returns distance or null */
function rayWorld(ox, oy, oz, dx, dy, dz, maxD) {
  const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
  let best = null; const o = [ox, oy, oz], d = [dx, dy, dz];
  const ex = ox + dx * maxD, ez = oz + dz * maxD;
  const [boxes, circles] = worldCandidates(Math.min(ox, ex), Math.max(ox, ex), Math.min(oz, ez), Math.max(oz, ez));
  for (const b of boxes) {
    let t0 = 0, t1 = maxD, ok = true; const mn = [b.x0, b.y0, b.z0], mx = [b.x1, b.y1, b.z1];
    for (let a = 0; a < 3 && ok; a++) { if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) ok = false; } else { let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a]; if (ta > tb) { const q = ta; ta = tb; tb = q; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false; } }
    if (ok && (best === null || t0 < best)) best = t0;
  }
  for (const c of circles) {
    const px = ox - c.x, pz = oz - c.z, A = dx * dx + dz * dz; if (A < 1e-9) continue;
    const B = 2 * (px * dx + pz * dz), C = px * px + pz * pz - c.r * c.r, D = B * B - 4 * A * C; if (D < 0) continue;
    const t = (-B - Math.sqrt(D)) / (2 * A); if (t < 0 || t > maxD) continue; if (oy + dy * t > c.h) continue; if (best === null || t < best) best = t;
  }
  return best;
}
const FIRES = [];
function updateFires(dt) {
  for (let i = FIRES.length - 1; i >= 0; i--) {
    const f = FIRES[i]; f.t -= dt; if (f.t <= 0) { FIRES.splice(i, 1); continue; }
    if (Math.random() < dt * 30) emit(f.x + rand(-0.6, 0.6), 0.1, f.z + rand(-0.6, 0.6), rand(-0.2, 0.2), rand(1.5, 3), rand(-0.2, 0.2), rand(0.4, 0.8), [2.6, 1 + Math.random() * 0.4, 0.15], rand(0.25, 0.5), -1, 1, -0.3);
    for (const z of zombieCandidates(f.x - 1.8, f.x + 1.8, f.z - 1.8, f.z + 1.8)) if (!z.dead && Math.hypot(z.x - f.x, z.z - f.z) < 1.8) z.burn = Math.max(z.burn, 2);
  }
}
function explode(x, y, z) {
  const R = 6;
  objBlast(x, y, z, R, 160 * PLAYER.dmgMult);
  AUD.explode(Math.hypot(x - PLAYER.x, z - PLAYER.z)); shake(clamp(1.2 - Math.hypot(x - PLAYER.x, z - PLAYER.z) / 30, 0.15, 0.9)); padRumble(0.5, clamp(1.1 - Math.hypot(x - PLAYER.x, z - PLAYER.z) / 25, 0, 1), 220);
  flashLight(x, y + 1, z, [6, 1.2, 5.5], 26, 0.55);
  burst(x, y, z, 120, [2.8, 0.5, 2.6], 14, 0.7, 0.3, 2, 2.5);
  burst(x, y, z, 60, [3, 2.2, 3], 8, 0.35, 0.45, 0, 4);
  burst(x, y, z, 50, [0.25, 0.18, 0.3], 5, 1.6, 0.9, -0.5, 1.2, 1);
  for (let k = 0; k < 48; k++) { const a = k / 48 * TAU; emit(x, Math.max(0.2, y * 0.3), z, Math.cos(a) * 18, 0.3, Math.sin(a) * 18, 0.4, [2.5, 0.6, 2.4], 0.3, 0, 4); }
  for (const zz of zombieCandidates(x - R * 1.4, x + R * 1.4, z - R * 1.4, z + R * 1.4)) {
    if (zz.dead) continue; const d = Math.hypot(zz.x - x, (zz.y + 1) - y, zz.z - z);
    if (d < R * (zz.type === 'boss' ? 1.4 : 1)) { const k = 1 - d / (R * 1.4); const dir = [(zz.x - x) / (d || 1), 0, (zz.z - z) / (d || 1)];
      const killed = damageZombie(zz, (70 + 110 * k) * PLAYER.dmgMult, 'body', [zz.x, 1.1 * zz.scale, zz.z], dir, 2, 1, true); if (!killed) { zz.vx += dir[0] * 10 * k; zz.vz += dir[2] * 10 * k; } GAME.hitMarker(false, killed); }
  }
  const pd = Math.hypot(PLAYER.x - x, PLAYER.z - z); if (pd < 3.2 && GAME.state === 'playing') PLAYER.hurt(8, x, z);
  hazBlast(x, z, R, y);   // fuel tanks in reach go up too
}

/* ---------------- pickups ---------------- */
const PICKUPS = [];
function dropPickup(x, z, forceType) {
  const r = Math.random();
  let kind = forceType || (r < 0.55 ? 'ammo' : 'health');
  const at = kind === 'ammo' ? pick([1, 1, 2, 3, 3, 4, 5, 6, 6]) : 0;
  PICKUPS.push({ x, z, kind, at, t: 0 });
}
function updatePickups(dt) {
  for (let i = PICKUPS.length - 1; i >= 0; i--) {
    const p = PICKUPS[i]; p.t += dt;
    if (p.t > 25) { PICKUPS.splice(i, 1); continue; }
    if (GAME.state === 'playing' && Math.hypot(p.x - PLAYER.x, p.z - PLAYER.z) < 1.7) {
      if (p.kind === 'health') { if (PLAYER.hp >= PLAYER.maxHp) continue; const h = Math.round(Math.max(25, PLAYER.maxHp * 0.25)); PLAYER.hp = Math.min(PLAYER.maxHp, PLAYER.hp + h); AUD.heal(); GAME.toast(`+${h} HEALTH`, '#6dff9a'); }
      else { const n = ammoGain(p.at === 2 || p.at === AT.FROST || p.at === AT.TETHER ? 2 : 3); PLAYER.ammo[p.at] += n; AUD.pickup(); GAME.toast(`+${n} ${ARROWS[p.at].name.toUpperCase()}`, rgbHex(ARROWS[p.at].color)); updateQuiverHUD(); }
      burst(p.x, 1, p.z, 30, p.kind === 'health' ? [0.4, 2.4, 0.9] : ARROWS[p.at].glow, 4, 0.5, 0.08, 0, 2);
      PICKUPS.splice(i, 1);
    }
  }
}
function drawPickups(time) {
  for (const p of PICKUPS) {
    const c = p.kind === 'health' ? [0.3, 1, 0.55] : ARROWS[p.at].color, g = p.kind === 'health' ? [0.6, 2.6, 1.1] : ARROWS[p.at].glow;
    const blink = p.t > 20 ? (Math.sin(time * 20) > 0 ? 1 : 0.2) : 1;
    const y = 0.9 + Math.sin(time * 3 + p.x) * 0.12;
    drawItem(MESH.metal, M4.trs(poolM(), p.x, y, p.z, 0.3, time * 2, 0, 0.28, 0.5, 0.28), [0.15, 0.15, 0.18]);
    drawItem(MESH.cyl, M4.trs(poolM(), p.x, y, p.z, 0.3, time * 2, 0, 0.3, 0.3, 0.3), c, [g[0] * blink, g[1] * blink, g[2] * blink]);
    drawItem(MESH.ring, M4.trs(poolM(), p.x, 0.06, p.z, 0, time, 0, 0.9, 1, 0.9), c, [g[0] * 0.8 * blink, g[1] * 0.8 * blink, g[2] * 0.8 * blink]);
    drawItem(MESH.cyl, M4.trs(poolM(), p.x, 2.5, p.z, 0, 0, 0, 0.05, 5, 0.05), c, [g[0] * 0.5 * blink, g[1] * 0.5 * blink, g[2] * 0.5 * blink]);
    if (p.kind === 'health') { drawItem(MESH.box, M4.trs(poolM(), p.x, y + 0.45, p.z, 0, time * 2, 0, 0.3, 0.09, 0.09), c, g); drawItem(MESH.box, M4.trs(poolM(), p.x, y + 0.45, p.z, 0, time * 2, 0, 0.09, 0.3, 0.09), c, g); }
  }
}
function drawProjectiles() {
  for (const a of PROJ) {
    const A = ARROWS[a.type], d = a.dir; const L = 0.78;
    const bx = a.x - d[0] * L, by = a.y - d[1] * L, bz = a.z - d[2] * L;
    drawItem(MESH.box, M4.align(poolM(), bx, by, bz, a.x, a.y, a.z, 0.02, 0.02), [0.08, 0.08, 0.09]);
    const fl = a.stuck ? Math.max(0.3, 1 - a.stuckT / 14) : 1;
    drawItem(MESH.box, M4.align(poolM(), bx, by, bz, bx + d[0] * 0.14, by + d[1] * 0.14, bz + d[2] * 0.14, 0.05, 0.05), A.color, [A.glow[0] * 0.6 * fl, A.glow[1] * 0.6 * fl, A.glow[2] * 0.6 * fl]);
    if (!a.stuck) drawItem(MESH.cone, M4.align(poolM(), a.x - d[0] * 0.07, a.y - d[1] * 0.07, a.z - d[2] * 0.07, a.x, a.y, a.z, 0.05, 0.05), A.color, A.glow);
  }
}

/* ---------------- game state ---------------- */
const GAME = {
  state: 'title', wave: 0, toSpawn: 0, spawnT: 0, score: 0, cash: 0, kills: 0, headshots: 0, shots: 0, hits: 0, headHits: 0, combo: 0, comboT: 0,
  best: loadLS('nq_best', 0), bestWave: loadLS('nq_bestwave', 0), time: 0, bossCount: 0, clearT: 0, bannerT: 0, banner: null, lastType: 0, frozen: false,
  boss: null, bossPending: 0, hm: { t: 0, head: false, kill: false }, startT: 0, toasts: [],
  newGame() {
    AUD.setMusicScreen(false);
    for (const k of ['wave', 'score', 'cash', 'kills', 'headshots', 'shots', 'hits', 'headHits', 'combo', 'comboT', 'bossCount']) this[k] = 0;
    ZOMBIES.length = 0; PROJ.length = 0; ZPROJ.length = 0; PICKUPS.length = 0; FIRES.length = 0; DECALS.length = 0; DEBRIS.length = 0; this.boss = null; this.intermission = false; this.interT = 0; for (const sp of WORLD.supplies) sp.cd = 0; this.clearedShown = false; this.bossPending = 0; this.toasts = []; this.bannerT = 0; this.toSpawn = 0; document.getElementById('bossbar').hidden = true;
    Object.assign(PLAYER, { x: 0, y: 0, z: 14, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0.02, dead: false, deathT: 0, dmgFlash: 0, vmIn: 0, hurtDirs: [] });
    PLAYER.up = { draw: 0, dmg: 0, hp: 0, reload: 0, speed: 0 }; applyUpgrades(); PLAYER.hp = PLAYER.maxHp; PLAYER.lastHurt = -99; PLAYER.fling = false; PLAYER.peakY = 0; HOOK.state = 'idle'; HOOK.cd = 0; PLAYER.ammo = [Infinity, 4, 2, 4, 2, 2, 3];
    Object.assign(BOW, { draw: 0, state: 'ready', t: 0, type: 0, nextType: -1, hold: 0 });
    this.state = 'playing'; this.startT = this.time; setScreen(null); updateQuiverHUD();
    runSeed(); objReset(); wxReset(); runWeather(); hazReset(); PLAYER.sink = 0; this.lastResult = null;
    this.intermission = true; this.interT = 8; this.showBanner(runLabel() || 'GET READY', (RUN.ids.length ? runBanner() + ' · ' : '') + 'FIRST WAVE INBOUND · PRESS ' + hint('next') + ' TO START NOW', '#29e7ff');
  },
  startWave() {
    if (this.state !== 'playing') return;
    this.intermission = false; this.clearedShown = false;
    this.wave++;
    const boss = this.wave % 5 === 0;
    runSeedWave(this.wave);
    const n = Math.round((6 + this.wave * 3.2) * (boss ? (this.wave >= 10 ? 0.75 : 0.55) : 1) * RUN.spawnK);
    this.toSpawn = n; this.spawnT = 1.2; this.clearT = 0;
    this.showBanner(`WAVE ${this.wave}`, boss ? 'THE WARDEN IS COMING' : this.wave === 1 ? 'SURVIVE THE NIGHT' : `${n} INFECTED INBOUND`, boss ? '#ff3df0' : '#ff2e88');
    AUD.waveHorn(boss); AUD.intensity = boss ? 1 : Math.min(0.9, 0.55 + this.wave * 0.05);
    if (boss) this.bossPending = 4;
    objWaveStart(this.wave);
    hudWave();
  },
  spawnOne() {
    const w = this.wave;
    const r = dr('wave');
    // the mix keeps shifting toward runners and brutes well past wave 10, and elites start showing up from wave 8
    const pRun = w >= 2 ? Math.min(0.45, 0.1 + (w - 2) * 0.045) : 0, pBrute = w >= 3 ? Math.min(0.3, 0.06 + (w - 3) * 0.022) : 0;
    // spitters and screamers start from wave 4, climbers from wave 5 — all stay a rare mix-in
    const pSpit = w >= 4 ? Math.min(0.14, (w - 4) * 0.012) : 0, pScream = w >= 5 ? Math.min(0.1, (w - 5) * 0.01) : 0, pClimb = w >= 5 ? Math.min(0.14, (w - 5) * 0.013) : 0;
    const pElite = RUN.eliteNight ? (w >= 3 ? Math.min(0.6, 0.12 + (w - 3) * 0.04) : 0) : w >= 8 ? Math.min(0.35, (w - 7) * 0.03) : 0;
    let type;
    if (r < pBrute) type = 'brute';
    else if (r < pBrute + pSpit) type = 'spitter';
    else if (r < pBrute + pSpit + pScream) type = 'screamer';
    else if (r < pBrute + pSpit + pScream + pClimb) type = 'climber';
    else if (r < pBrute + pSpit + pScream + pClimb + pRun) type = 'runner';
    else type = 'walker';
    // pick a spawn not right next to the player
    const s = navSpawnPoint();
    const z = spawnZombie(type, s[0] + rand(-0.4, 0.4), s[1] + rand(-0.4, 0.4), w);
    if (dr('wave') < pElite) makeElite(z);
    // from wave 6, runners sometimes come as a pack from the same spot
    if (type === 'runner' && w >= 6 && this.toSpawn > 2 && dr('wave') < Math.min(0.35, 0.1 + (w - 6) * 0.03)) {
      const extra = Math.min(this.toSpawn - 1, w >= 14 ? 3 : 2);
      for (let k = 0; k < extra; k++) { spawnZombie('runner', s[0] + rand(-1.2, 1.2), s[1] + rand(-1.2, 1.2), w); this.toSpawn--; }
    }
  },
  spawnExtra(type, x, z) { spawnZombie(type, x, z, this.wave); },
  aliveCount() { let n = 0; for (const z of ZOMBIES) if (!z.dead) n++; return n; },
  update(dt) {
    if (this.state === 'playing') {
      const maxAlive = Math.min(36, 9 + this.wave * 2);
      if (this.toSpawn > 0) { this.spawnT -= dt; if (this.spawnT <= 0 && this.aliveCount() < maxAlive) { this.spawnOne(); this.toSpawn--; this.spawnT = Math.max(0.35, 1.7 - this.wave * 0.09) * rand(0.6, 1.3); } }
      if (this.bossPending > 0) { this.bossPending -= dt; if (this.bossPending <= 0) this.spawnBoss(); }
      if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; hudScore(); } }
      if (this.wave > 0 && this.toSpawn === 0 && this.bossPending <= 0 && this.aliveCount() === 0 && !objNestAlive()) {
        this.clearT += dt;
        if (this.clearT > 0.4 && !this.clearedShown) { this.clearedShown = true; const bonus = 40 + this.wave * 15; this.cash += bonus; this.score += bonus * 5; this.showBanner('WAVE CLEARED', `+¢${bonus} · ${INTERMISSION}s TO RESUPPLY · N TO SKIP`, '#29e7ff'); AUD.cleared(); AUD.intensity = 0.35; hudScore(); this.intermission = true; this.interT = INTERMISSION; }
      }
    }
    // 25 s between waves; the clock keeps running while you shop, and the next wave kicks you out of the armory
    if (this.intermission && (this.state === 'playing' || this.state === 'shop')) { const t0 = this.interT; this.interT -= dt; if (this.state === 'playing' && Math.ceil(t0) !== Math.ceil(this.interT) && this.interT > 0 && this.interT <= 5) AUD.tick && AUD.tick(); if (this.interT <= 0) { this.intermission = false; this.clearedShown = false; if (this.state === 'shop') this.closeShop(); else this.startWave(); } }
    if (this.bannerT > 0) this.bannerT -= dt;
    this.hm.t = Math.max(0, this.hm.t - dt);
    for (let i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].t -= dt; if (this.toasts[i].t <= 0) this.toasts.splice(i, 1); }
  },
  spawnBoss() {
    this.bossCount++;
    // drop in front of the player, inside the plaza
    camBasis(); let [x, z] = navNearestPoint(PLAYER.x + _cf[0] * 18, PLAYER.z + _cf[2] * 18);
    if (Math.hypot(x - PLAYER.x, z - PLAYER.z) < 8) [x, z] = navSpawnPoint(10, 24);
    this.boss = spawnZombie('boss', x, z, this.wave);
    this.showBanner('THE WARDEN', 'AIM FOR THE GLOWING CORE', '#ff3df0');
    document.getElementById('bossbar').hidden = false;
  },
  onKill(z, part, arrowType) {
    const head = part === 'head';
    this.combo++; this.comboT = 3.5;
    const mult = 1 + Math.min(8, Math.floor(this.combo / 3)) * 0.25;
    const pts = Math.round(z.T.score * (z.elite ? 2 : 1) * (head ? 1.5 : 1) * mult);
    const cash = z.T.cash * (z.elite ? 2 : 1) + (head ? 5 : 0);
    this.score += pts; this.cash += cash; this.kills++; if (head) this.headshots++;
    AUD.kill();
    floatText(z.x, (z.y + 2.1) * 1, z.z, `+${pts}`, head ? '#ffd23a' : '#29e7ff', head ? 1.2 : 1, 1.2);
    if (head) this.toast(`HEADSHOT  +${pts}`, '#ffd23a'); else if (z.elite) this.toast(`ELITE DOWN  +${pts}`, '#f4f0ff'); else if (z.type === 'brute') this.toast(`BRUTE DOWN  +${pts}`, '#ff2e88');
    // drops
    const r = Math.random();
    if (z.type === 'boss') { for (let k = 0; k < 6; k++) dropPickup(z.x + rand(-3, 3), z.z + rand(-3, 3), k < 4 ? 'ammo' : 'health'); explode(z.x, 2, z.z); this.showBanner('WARDEN DOWN', `+${pts}`, '#ffd23a'); this.boss = null; document.getElementById('bossbar').hidden = true; shake(1.2); }
    else if (z.type === 'brute' ? r < 0.75 : r < 0.16) dropPickup(z.x, z.z);
    hudScore();
  },
  hitMarker(head, kill) { this.hm.t = 0.18; this.hm.head = !!head; this.hm.kill = !!kill; },
  toast(text, color) { this.toasts.unshift({ text, color, t: 1.6 }); if (this.toasts.length > 4) this.toasts.pop(); },
  showBanner(title, sub, color) { this.banner = { title, sub, color }; this.bannerT = 3; },
  openShop() { this.state = 'shop'; AUD.drawStop(); INPUT.mouseDown = false; BOW.state = 'ready'; BOW.draw = 0; if (document.exitPointerLock) document.exitPointerLock(); renderShop(); setScreen('shop'); },
  closeShop() { setScreen(null); this.state = 'playing'; requestLock(); if (!this.intermission) this.startWave(); },   // leaving early keeps the countdown
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; AUD.drawStop(); INPUT.mouseDown = false; if (BOW.state === 'drawing') BOW.state = 'letdown'; setScreen('pause'); drawLogo($('pauseLogo'), 'PAUSED', '#29e7ff'); if (document.exitPointerLock && INPUT.locked) document.exitPointerLock(); },
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; setScreen(null); requestLock(); },
  gameOver() {
    this.state = 'over'; PLAYER.dead = true; AUD.drawStop(); AUD.gameOver(); AUD.intensity = 0.2; INPUT.mouseDown = false;
    const normal = RUN.mode === 'normal', res = normal ? null : runFinish(); this.lastResult = res;   // daily and custom runs never touch the saved bests
    const newBest = normal && this.score > this.best; if (newBest) { this.best = this.score; saveLS('nq_best', this.best); }
    if (normal && this.wave > this.bestWave) { this.bestWave = this.wave; saveLS('nq_bestwave', this.bestWave); }
    setTimeout(() => {
      if (document.exitPointerLock) document.exitPointerLock();
      document.getElementById('goStats').innerHTML = [['Wave reached', this.wave], ['Score', this.score.toLocaleString()], ['Kills', this.kills], ['Headshots', this.headshots], ['Accuracy', this.shots ? Math.round(this.hits / this.shots * 100) + '%' : '—'], res ? ['Final (×' + RUN.scoreMult + ')', res.final.toLocaleString()] : ['Best', this.best.toLocaleString()]]
        .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
      document.getElementById('goBest').hidden = !newBest;
      $('goRun').hidden = !res; $('copyBtn').hidden = !(res && res.mode === 'daily'); $('copyBtn').textContent = 'Copy result';
      if (res) $('goRun').innerHTML = `<b>${runLabel()}${res.date ? ' · ' + res.date : ''}</b>${res.ids.length ? '<br>' + runBanner() : ''}${res.mode === 'daily' ? `<br>Today's best: ${res.best.toLocaleString('en-US')} (this run: #${res.rank} on this device)` : ''}`;
      setScreen('over'); drawLogo(document.getElementById('goLogo'), 'OVERRUN', '#ff3040');
    }, 1600);
  },
};

/* ---------------- shop ---------------- */
const SHOP = [
  { id: 'draw', name: 'Tension Servos', desc: 'Draw the bow faster', max: 6, cost: (l) => Math.round(70 * Math.pow(1.55, l)), level: () => PLAYER.up.draw, buy() { PLAYER.up.draw++; applyUpgrades(); } },
  { id: 'dmg', name: 'Tungsten Heads', desc: '+16% arrow damage', max: 10, cost: (l) => Math.round(80 * Math.pow(1.5, l)), level: () => PLAYER.up.dmg, buy() { PLAYER.up.dmg++; applyUpgrades(); } },
  { id: 'reload', name: 'Auto-Quiver', desc: 'Nock the next arrow faster', max: 5, cost: (l) => Math.round(60 * Math.pow(1.6, l)), level: () => PLAYER.up.reload, buy() { PLAYER.up.reload++; applyUpgrades(); } },
  { id: 'hp', name: 'Dermal Plating', desc: '+25 max health', max: 6, cost: (l) => Math.round(90 * Math.pow(1.55, l)), level: () => PLAYER.up.hp, buy() { PLAYER.up.hp++; applyUpgrades(); PLAYER.hp += 25; } },
  { id: 'speed', name: 'Kinetic Boots', desc: '+8% move speed', max: 4, cost: (l) => Math.round(70 * Math.pow(1.6, l)), level: () => PLAYER.up.speed, buy() { PLAYER.up.speed++; applyUpgrades(); } },
  { id: 'heal', name: 'Med Injector', desc: 'Restore full health', cost: () => 45, level: () => 0, can: () => PLAYER.hp < PLAYER.maxHp, buy() { PLAYER.hp = PLAYER.maxHp; } },
  { id: 'a1', name: 'Incendiary ×4', desc: 'Sets the infected on fire', cost: () => 55, level: () => 0, ammo: 1, buy() { PLAYER.ammo[1] += 4; } },
  { id: 'a2', name: 'Plasma Charge ×2', desc: 'Explodes on impact', cost: () => 80, level: () => 0, ammo: 2, buy() { PLAYER.ammo[2] += 2; } },
  { id: 'a3', name: 'Rail Piercer ×4', desc: 'Flat and fast, pierces 5', cost: () => 65, level: () => 0, ammo: 3, buy() { PLAYER.ammo[3] += 4; } },
  { id: 'a4', name: 'Cryo Burst ×3', desc: 'Freezes a crowd to a crawl', cost: () => 70, level: () => 0, ammo: 4, buy() { PLAYER.ammo[4] += 3; } },
  { id: 'a5', name: 'Tether ×3', desc: 'Pins its target and two more', cost: () => 60, level: () => 0, ammo: 5, buy() { PLAYER.ammo[5] += 3; } },
  { id: 'a6', name: 'Scatter ×4', desc: 'Six shards, point blank', cost: () => 50, level: () => 0, ammo: 6, buy() { PLAYER.ammo[6] += 4; } },
];
function renderShop() {
  const el = document.getElementById('shopGrid');
  document.getElementById('shopCash').textContent = '¢' + GAME.cash.toLocaleString();
  document.getElementById('shopWave').textContent = `Wave ${GAME.wave} cleared · Next: wave ${GAME.wave + 1}${(GAME.wave + 1) % 5 === 0 ? ' — the Warden' : ''}`;
  document.getElementById('shopHp').textContent = `${Math.ceil(PLAYER.hp)} / ${PLAYER.maxHp}`;
  el.innerHTML = '';
  for (const it of SHOP) {
    const lvl = it.level(), maxed = it.max && lvl >= it.max, cost = it.cost(lvl), can = !maxed && GAME.cash >= cost && (!it.can || it.can());
    const b = document.createElement('button'); b.className = 'card' + (it.ammo ? ' ammo a' + it.ammo : '') + (can ? '' : ' off'); b.type = 'button'; b.id = 'shop-' + it.id;
    const pips = it.max ? `<div class="pips">${Array.from({ length: it.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : (it.ammo ? `<div class="own">In quiver: ${PLAYER.ammo[it.ammo]}</div>` : `<div class="own">${Math.ceil(PLAYER.hp)} / ${PLAYER.maxHp} HP</div>`);
    b.innerHTML = `<div class="cname">${it.name}</div><div class="cdesc">${it.desc}</div>${pips}<div class="cost">${maxed ? 'MAXED' : '¢' + cost}</div>`;
    b.addEventListener('click', () => { if (!can) { AUD.deny(); return; } GAME.cash -= cost; it.buy(); AUD.buy(); renderShop(); updateQuiverHUD(); hudScore(); });
    el.appendChild(b);
  }
}

/* ---------------- HUD (DOM) ---------------- */
const $ = (id) => document.getElementById(id);
function rgbHex(c) { return '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); }
function hudScore() { $('score').textContent = GAME.score.toLocaleString(); $('cash').textContent = '¢' + GAME.cash.toLocaleString(); const m = 1 + Math.min(8, Math.floor(GAME.combo / 3)) * 0.25; $('combo').textContent = GAME.combo >= 3 ? `×${m.toFixed(2)} COMBO` : ''; }
function hudWave() { $('waveNum').textContent = GAME.wave; }
function updateQuiverHUD() {
  const el = $('quiver'); if (!el.children.length) {
    ARROWS.forEach((A, i) => { const d = document.createElement('div'); d.className = 'slot'; d.id = 'slot' + i; d.style.setProperty('--c', rgbHex(A.color)); d.innerHTML = `<span class="k">${i + 1}</span><span class="nm">${A.name}</span><span class="ct"></span><span class="bar"></span>`; el.appendChild(d); });
  }
  ARROWS.forEach((A, i) => { const d = $('slot' + i); const cur = (BOW.nextType >= 0 ? BOW.nextType : BOW.type) === i; d.classList.toggle('sel', cur); d.classList.toggle('empty', i > 0 && PLAYER.ammo[i] <= 0); d.querySelector('.ct').textContent = i === 0 ? '∞' : PLAYER.ammo[i]; });
}
function flashQuiver(i) { const d = $('slot' + i); if (!d) return; d.classList.remove('deny'); void d.offsetWidth; d.classList.add('deny'); }
let _lastSel = -1;
// per-frame HUD: write to the DOM only when a value actually changes (each write can cost a style recalc)
const _hudC = new Map();
function hudSet(id, prop, v) { const k = id + prop, c = _hudC.get(k); if (c === v) return; _hudC.set(k, v); const el = $(id); if (prop === 't') el.textContent = v; else el.style.transform = v; }
function hudCls(id, cls, on) { const k = id + '.' + cls, c = _hudC.get(k); if (c === on) return; _hudC.set(k, on); $(id).classList.toggle(cls, on); }
function hudFrame() {
  const hpK = PLAYER.hp / PLAYER.maxHp;
  hudSet('hpFill', 's', `scaleX(${clamp(hpK, 0, 1)})`); hudSet('hpText', 't', String(Math.ceil(PLAYER.hp))); hudSet('hpMax', 't', '/ ' + PLAYER.maxHp);
  hudCls('hp', 'low', hpK < 0.3);
  let alive = 0; for (const z of ZOMBIES) if (!z.dead) alive++;
  if (GAME.intermission) { const t = Math.max(0, Math.ceil(GAME.interT)); hudSet('remain', 't', `NEXT WAVE IN ${t}s · ${hint('next')} TO SKIP`); hudCls('remain', 'soon', t <= 5); hudCls('remain', 'count', true); }
  else { hudSet('remain', 't', GAME.wave ? `${alive + GAME.toSpawn} INFECTED` : ''); hudCls('remain', 'soon', false); hudCls('remain', 'count', false); }
  hudCls('hp', 'regen', !!PLAYER.regen);
  const sel = BOW.nextType >= 0 ? BOW.nextType : BOW.type; if (sel !== _lastSel) { _lastSel = sel; updateQuiverHUD(); }
  if (GAME.boss) hudSet('bossFill', 's', `scaleX(${clamp(GAME.boss.hp / GAME.boss.maxHp, 0, 1)})`);
}
function setScreen(name) {
  if (name === null && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  for (const s of ['title', 'pause', 'shop', 'over', 'controls', 'custom']) $('scr-' + s).hidden = s !== name;
  $('hud').hidden = !(name === null && GAME.state !== 'title');
  document.body.classList.toggle('ingame', name === null && GAME.state === 'playing');
}

/* ---------------- HUD (canvas) ---------------- */
const hud = $('hud2d'), hx = hud.getContext('2d');
const _vp = M4.create(), _clip = [0, 0, 0, 0];
function toScreen(x, y, z, W, H) {
  const m = _vp; const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (cw <= 0.1) return null; return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H, cw];
}
function drawHUD2D(time) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = hud.clientWidth, H = hud.clientHeight;
  if (hud.width !== Math.round(W * dpr) || hud.height !== Math.round(H * dpr)) { hud.width = Math.round(W * dpr); hud.height = Math.round(H * dpr); }
  hx.setTransform(dpr, 0, 0, dpr, 0, 0); hx.clearRect(0, 0, W, H);
  if (GAME.state === 'title' || !HUDVIS.on) return;
  const cx = W / 2, cy = H / 2;
  const A = ARROWS[BOW.type], col = rgbHex(A.color);
  // hp bars over damaged zombies
  for (const z of ZOMBIES) {
    if (z.dead || z.hpBarT <= 0 || z.type === 'boss') continue;
    const p = toScreen(z.x, z.y + 2.15 * z.scale, z.z, W, H); if (!p) continue;
    const w = clamp(600 / p[2], 18, 70), k = z.hp / z.maxHp; hx.globalAlpha = Math.min(1, z.hpBarT);
    hx.fillStyle = 'rgba(8,6,16,0.7)'; hx.fillRect(p[0] - w / 2 - 1, p[1] - 1, w + 2, 5); hx.fillStyle = k > 0.5 ? '#a6ff3a' : k > 0.25 ? '#ffb52e' : '#ff3040'; hx.fillRect(p[0] - w / 2, p[1], w * k, 3);
  }
  hx.globalAlpha = 1;
  // floating numbers
  hx.textAlign = 'center'; hx.textBaseline = 'middle';
  for (const f of FLOATS) {
    const p = toScreen(f.x, f.y, f.z, W, H); if (!p) continue;
    const a = Math.min(1, f.life / f.max * 2); const s = clamp(26 / Math.sqrt(p[2]), 12, 26) * f.size * (1 + (1 - f.life / f.max) * 0.1);
    hx.font = `700 ${s}px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif`; hx.globalAlpha = a;
    hx.fillStyle = 'rgba(0,0,0,0.6)'; hx.fillText(f.text, p[0] + 1.5, p[1] + 1.5); hx.fillStyle = f.color; hx.fillText(f.text, p[0], p[1]);
  }
  hx.globalAlpha = 1;
  // crosshair
  if (GAME.state === 'playing') {
    const d = BOW.state === 'drawing' ? easeOut(BOW.draw) : 0; const gap = lerp(22, 5, d), len = lerp(9, 7, d);
    hx.strokeStyle = col; hx.lineWidth = 2; hx.shadowColor = col; hx.shadowBlur = 8 * d;
    hx.beginPath();
    hx.moveTo(cx - gap - len, cy); hx.lineTo(cx - gap, cy); hx.moveTo(cx + gap, cy); hx.lineTo(cx + gap + len, cy);
    hx.moveTo(cx, cy + gap); hx.lineTo(cx, cy + gap + len); hx.moveTo(cx, cy - gap - len * 0.6); hx.lineTo(cx, cy - gap);
    hx.stroke();
    hx.fillStyle = '#fff'; hx.beginPath(); hx.arc(cx, cy, 1.6, 0, TAU); hx.fill();
    // draw power arc
    if (d > 0) { hx.lineWidth = 3; hx.globalAlpha = 0.9; hx.beginPath(); hx.arc(cx, cy, 34, -Math.PI / 2, -Math.PI / 2 + TAU * d); hx.stroke();
      hx.globalAlpha = 0.18; hx.beginPath(); hx.arc(cx, cy, 34, 0, TAU); hx.stroke(); hx.globalAlpha = 1;
      if (BOW.draw >= 1) { hx.font = '700 11px "Quiver Cn", sans-serif'; hx.fillStyle = col; hx.fillText(BOW.hold > 2.2 ? 'STEADY…' : 'FULL DRAW', cx, cy + 50); } }
    hx.shadowBlur = 0;
    // arrow drop hint (ticks under the crosshair)
    // hit marker
    if (GAME.hm.t > 0) { const k = GAME.hm.t / 0.18, r0 = 8 + (1 - k) * 4, r1 = r0 + 7; hx.strokeStyle = GAME.hm.kill ? '#ff3040' : GAME.hm.head ? '#ffd23a' : '#ffffff'; hx.lineWidth = GAME.hm.kill ? 3 : 2; hx.globalAlpha = k;
      hx.beginPath(); for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { hx.moveTo(cx + sx * r0, cy + sy * r0); hx.lineTo(cx + sx * r1, cy + sy * r1); } hx.stroke(); hx.globalAlpha = 1; }
    // damage direction arcs
    for (const h of PLAYER.hurtDirs) { const rel = h.ang - Math.atan2(-Math.sin(PLAYER.yaw), -Math.cos(PLAYER.yaw)); const a = -rel - Math.PI / 2; hx.strokeStyle = `rgba(255,40,70,${clamp(h.t, 0, 1)})`; hx.lineWidth = 6; hx.beginPath(); hx.arc(cx, cy, 120, a - 0.35, a + 0.35); hx.stroke(); }
    drawHookHUD(hx, cx, cy, W, H);
    // toasts
    hx.font = '700 15px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif';
    GAME.toasts.forEach((t, i) => { hx.globalAlpha = Math.min(1, t.t * 2) * (1 - i * 0.2); hx.fillStyle = t.color; hx.fillText(t.text, cx, cy + 78 + i * 20); });
    hx.globalAlpha = 1;
  }
  drawMinimap(hx, W, H, time); drawObjective(hx, W, H); drawFieldObjectiveHUD(hx, W, H);
  // banners
  if (GAME.bannerT > 0 && GAME.banner) {
    const t = 3 - GAME.bannerT; const a = Math.min(1, t * 4, GAME.bannerT * 2);
    const h = clamp(W / 14, 40, 96);
    hx.globalAlpha = a;
    segText(hx, GAME.banner.title, cx, H * 0.3, h, { color: GAME.banner.color, align: 'center', flicker: (i) => t < 0.6 ? (Math.random() < t / 0.6 + 0.2 ? 1 : 0.1) : 1 });
    if (GAME.banner.sub) { hx.font = `700 ${Math.round(h * 0.26)}px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif`; hx.fillStyle = '#e9ecff'; hx.letterSpacing = '4px'; hx.fillText(GAME.banner.sub, cx, H * 0.3 + h * 0.95); hx.letterSpacing = '0px'; }
    hx.globalAlpha = 1;
  }
}
const HUDVIS = { on: true };
const DBG = {};

/* ---------------- logo ---------------- */
function drawLogo(cv, text = 'NEON QUIVER', color = '#ff2e88', sub = true, left = false) {
  const dpr = Math.min(2, devicePixelRatio || 1); const W = cv.clientWidth || 600, H = cv.clientHeight || 160;
  cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
  const words = text.split(' ');
  if (words.length === 2 && sub) {
    const h = Math.min(H * 0.4, (W - 40) / (segWidth(words[1], 1) + 0.1));
    const ax = left ? h * 0.25 : W / 2, al = left ? 'left' : 'center';
    segText(x, words[0], ax + (left ? h * 0.12 : 0), H * 0.26, h * 0.5, { color: '#29e7ff', align: al, glow: 1, core: '#effdff', track: 0.6 });
    segText(x, words[1], ax, H * 0.66, h, { color, align: al, glow: 1.1 });
  } else {
    const h = Math.min(H * 0.6, W / (text.length * 0.5 * 1.42 + 1));
    segText(x, text, W / 2, H / 2, h, { color, align: 'center', glow: 1.1 });
  }
}

/* ---------------- main update ---------------- */
function updatePlayer(dt) {
  const P = PLAYER;
  // look
  padLook(dt);   // right stick feeds the same dx/dy the mouse does, so sensitivity, draw-slow and invert Y apply to both
  const drawSlow = BOW.state === 'drawing' && BOW.draw >= 1 ? 0.7 : 1;
  const sens = 0.0022 * SETTINGS.sens * drawSlow;
  P.yaw -= INPUT.dx * sens; P.pitch = clamp(P.pitch - INPUT.dy * sens * (SETTINGS.invertY ? -1 : 1), -1.45, 1.45);
  BOW.lagX = clamp(BOW.lagX + INPUT.dx * 0.00005, -0.03, 0.03); BOW.lagY = clamp(BOW.lagY - INPUT.dy * 0.00005, -0.03, 0.03);
  BOW.lagX *= Math.max(0, 1 - dt * 8); BOW.lagY *= Math.max(0, 1 - dt * 8);
  INPUT.dx = 0; INPUT.dy = 0;
  // move
  const K = INPUT.keys;
  let fx = 0, fz = 0;
  if (K[BINDS.fwd] || K.ArrowUp) fz -= 1; if (K[BINDS.back] || K.ArrowDown) fz += 1; if (K[BINDS.left] || K.ArrowLeft) fx -= 1; if (K[BINDS.right] || K.ArrowRight) fx += 1;
  const l = Math.hypot(fx, fz); if (l > 0) { fx /= l; fz /= l; }
  if (PAD.mx || PAD.mz) { fx = PAD.mx; fz = PAD.mz; }   // a deflected stick wins over the keys, and keeps its analog magnitude
  const drawing = BOW.state === 'drawing';
  const sprint = (K[BINDS.sprint] || (BINDS.sprint === 'ShiftLeft' && K.ShiftRight) || PAD.sprint) && fz < 0 && !drawing;
  const water = P.y < 0.05 ? waterAt(P.x, P.z) : 0; P.wading = water > 0;   // knee-deep in the koi pond, or the Metro's flooded track beds
  P.sink = lerp(P.sink || 0, P.wading ? 0.26 : 0, Math.min(1, dt * 6));
  const spd = 5.4 * P.speedMult * (sprint ? 1.55 : 1) * (drawing ? 0.55 : 1) * (water === 1 ? 0.62 : water === 2 ? 0.7 : 1);
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  const wx = (fx * cy + fz * sy) * spd, wz = (-fx * sy + fz * cy) * spd;
  const hooked = updateHook(dt);   // while reeling in, the grapple owns the movement
  if (!hooked) {
    const acc = P.grounded ? 12 : P.fling ? 0.8 : 3;   // flung off the hook: keep the momentum
    P.vx = lerp(P.vx, wx, Math.min(1, acc * dt)); P.vz = lerp(P.vz, wz, Math.min(1, acc * dt));
    P.x += P.vx * dt; P.z += P.vz * dt;
    if ((K[BINDS.jump] || PAD.jump) && P.grounded) { P.vy = 6.6; P.grounded = false; }
    P.vy -= 20 * dt; P.y += P.vy * dt;
  }
  if (!P.grounded) P.peakY = Math.max(P.peakY ?? P.y, P.y);
  // land on whatever is under your feet: benches, planters, barriers, the fountain rim
  const gy = groundAt(P.x, P.z, P.y, 0.26);
  if (!hooked && P.y <= gy && P.vy <= 0) {
    if (!P.grounded) { if (P.vy < -3) AUD.land(Math.min(1.5, -P.vy / 6)); hookLanded((P.peakY ?? gy) - gy); P.fling = false; }
    P.y = gy; P.vy = 0; P.grounded = true; P.peakY = gy;
  }
  else if (P.y > gy + 0.03) P.grounded = false;
  pushOutCircle(P, 0.42);
  P.x = clamp(P.x, WORLD_BOUNDS.x0, WORLD_BOUNDS.x1); P.z = clamp(P.z, WORLD_BOUNDS.z0, WORLD_BOUNDS.z1);
  if (P.z > 165.5) P.x = clamp(P.x, -31, 31);   // the grove's treeline
  else if (P.z > 75.5 && !(P.x > 50 && P.z > 110.3 && P.z < 121.7)) {   // the suburbs' woods; east of them, the refinery road and the plant inside its fence
    if (P.x > 104) { P.x = Math.max(P.x, 108.4); P.z = Math.min(P.z, 143.6); } else P.x = clamp(P.x, -59, 59);
  }
  const hs = Math.hypot(P.vx, P.vz);
  BOW.walkAmt = lerp(BOW.walkAmt, P.grounded ? clamp(hs / 5.4, 0, 1.3) : 0, Math.min(1, dt * 8));
  BOW.sprintAmt = lerp(BOW.sprintAmt, sprint && hs > 3 ? 1 : 0, Math.min(1, dt * 6));
  const ph0 = BOW.walkPhase; BOW.walkPhase += dt * hs * 1.6 * (1 + BOW.sprintAmt * 0.35);
  if (P.grounded && hs > 1.5 && Math.floor(ph0 / Math.PI) !== Math.floor(BOW.walkPhase / Math.PI)) AUD.step(0.5 + BOW.sprintAmt * 0.7);   // footsteps
  P.roll = lerp(P.roll, -fx * 0.012 + Math.sin(BOW.walkPhase) * 0.014 * BOW.sprintAmt, Math.min(1, dt * 6));
  P.fov = lerp(P.fov, SETTINGS.fov - (BOW.state === 'drawing' ? easeOut(BOW.draw) * 14 : 0) + BOW.sprintAmt * 6, Math.min(1, dt * 10));
  P.dmgFlash = Math.max(0, P.dmgFlash - dt * 1.4);
  for (let i = P.hurtDirs.length - 1; i >= 0; i--) { P.hurtDirs[i].t -= dt; if (P.hurtDirs[i].t <= 0) P.hurtDirs.splice(i, 1); }
  P.vmIn = Math.min(1, P.vmIn + dt * 2.5);
  // slow regen: kicks in 6 s after the last hit, 2.5 HP/s, and only up to 50% of max health.
  // Pickups, the Med Injector and Dermal Plating are still the only way back to full.
  const regenCap = P.maxHp * REGEN.cap;
  P.regen = GAME.state === 'playing' && !P.dead && P.hp < regenCap && GAME.time - P.lastHurt > REGEN.delay;
  if (P.regen) P.hp = Math.min(regenCap, P.hp + REGEN.rate * dt);
  if (P.hp / P.maxHp < 0.3) { P.beat -= dt; if (P.beat <= 0) { P.beat = 0.9; AUD.heartbeat(); } }
}

let lastT = performance.now() / 1000, acc = 0;
const camM = M4.create();
function step(dt) {
  padPoll(dt);
  GAME.time += dt; STEPN.n++;
  const t = GAME.time;
  if (GAME.state === 'playing') { updatePlayer(dt); updateBow(dt, INPUT); }
  else if (GAME.state === 'over') { PLAYER.deathT += dt; }
  else if (GAME.state === 'title') { updateBow(dt, INPUT); }
  if (GAME.state !== 'paused' && GAME.state !== 'shop') {
    updateZombies(dt, t); if (ZRIG.ready) { syncRigs(); for (const z of ZOMBIES) if (z.state !== 'drop' || z.y < 30) {
      // Animation LOD: full rate close up; progressively lower only where distance and fog hide the difference.
      z._pdt = (z._pdt || 0) + dt;
      const zd2 = (z.x - PLAYER.x) ** 2 + (z.z - PLAYER.z) ** 2, phase = STEPN.n + (z.seed * 10 | 0);
      if (z.rig && z.state === 'dying' && z.dieT > 4 && z.dieT < CORPSE_SETTLE && phase % 12) continue;
      if (z.rig && z.state !== 'dying' && ((zd2 > 8100 && phase % 4) || (zd2 > 2025 && phase % 2))) continue;
      poseZombieRig(z, z._pdt, t); z._pdt = 0; } } updateProjectiles(dt); updateZProj(dt); updateFires(dt); updatePickups(dt); updateDebris(dt);
  }
  if (GAME.state !== 'paused') { updateParticles(dt); updateLights(dt); updateFloats(dt); updateCity(dt); updateDecals(dt); }
  if (NAV.ready) { NAV.t -= dt; if (NAV.t <= 0 && GAME.state !== 'title') { NAV.t = 0.3; navUpdate(PLAYER.x, PLAYER.z); } }
  if (GAME.state !== 'paused' && GAME.state !== 'shop') { updateSupplies(dt); updateAmbient(dt); updateObjectives(dt); updateWeather(dt); updateHazards(dt); }
  const dnow = districtAt(PLAYER.x, PLAYER.z); if (dnow !== PLAYER.district) { const first = !PLAYER.district; PLAYER.district = dnow; if (!first && GAME.state === 'playing') GAME.toast(dnow.name, '#bff6ff'); }
  GAME.update(dt);
  SHAKE.amt = Math.max(0, SHAKE.amt - dt * 2.2);
  // fire arrow nocked: flames at tip
  if ((GAME.state === 'playing') && BOW.hasVisibleArrow && BOW.type === 1 && Math.random() < dt * 40) { const p = BOW.tipWorld; emit(p[0] + rand(-0.02, 0.02), p[1], p[2] + rand(-0.02, 0.02), rand(-0.1, 0.1), rand(0.3, 0.8), rand(-0.1, 0.1), 0.3, [2.4, 1.0, 0.15], 0.05, -0.5, 1, 0.05); }
  if ((GAME.state === 'playing') && BOW.hasVisibleArrow && BOW.type === 2 && Math.random() < dt * 20) { const p = BOW.tipWorld; emit(p[0], p[1], p[2], rand(-0.2, 0.2), rand(-0.2, 0.2), rand(-0.2, 0.2), 0.2, [2, 0.3, 2], 0.03, 0, 3); }
}

const PERF = { scale: 1, acc: 0, n: 0, pressure: 0, fAcc: 0, fN: 0, fSlow: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  now /= 1000; const raw = now - lastT; let dt = Math.min(0.05, raw); lastT = now;
  if (!window.__NQ_CAPTURE && GAME.state === 'playing' && raw < 0.5) {
    PERF.acc += raw; PERF.n++;
    if (PERF.n >= 90) { const avg = PERF.acc / PERF.n; PERF.pressure = lerp(PERF.pressure, clamp((avg - 1 / 60) / 0.018, 0, 1), 0.5); if (avg > 0.024 && PERF.scale > 0.35) PERF.scale *= 0.8; else if (avg < 0.012 && PERF.scale < 1) PERF.scale = Math.min(1, PERF.scale * 1.15); PERF.acc = 0; PERF.n = 0; }
    // fast path for genuinely slow machines: a third of a second where nearly every frame misses 30 fps steps the
    // resolution down right away instead of waiting out the 1.5 s window (a lone hitch never qualifies; scaling back
    // up still only happens through the slow window above, so fast frames render exactly as before)
    PERF.fAcc += raw; PERF.fN++; if (raw > 0.028) PERF.fSlow++;
    if (PERF.fN >= 20) {
      const avg = PERF.fAcc / PERF.fN;
      if (PERF.fSlow >= 16 && avg > 0.034 && PERF.scale > 0.35) { PERF.scale *= 0.8; PERF.pressure = lerp(PERF.pressure, clamp((avg - 1 / 60) / 0.018, 0, 1), 0.5); PERF.acc = 0; PERF.n = 0; }
      PERF.fAcc = 0; PERF.fN = 0; PERF.fSlow = 0;
    }
  }
  if (GAME.noLoop) return;
  const c0 = performance.now();
  if (!GAME.frozen) step(dt);
  render(GAME.time);
  if (GAME.state !== 'title') hudFrame();
  drawHUD2D(GAME.time);
  profFrame(performance.now() - c0);
}

/* ---------------- render ---------------- */
function setCamera(time) {
  const P = PLAYER;
  let x = P.x, y = P.y + 1.62 - (P.sink || 0), z = P.z, yaw = P.yaw, pitch = P.pitch, roll = P.roll;
  if (GAME.state === 'title' || GAME.attract) {
    const a = time * 0.06; x = Math.sin(a) * 19; z = Math.cos(a) * 19; y = 3.2 + Math.sin(time * 0.2) * 0.6; yaw = a + 0.35; pitch = 0.1; roll = 0;
    if (GAME.camOverride) ({ x, y, z, yaw, pitch, roll } = GAME.camOverride);
  } else if (GAME.state === 'over') {
    const k = easeOut(Math.min(1, P.deathT / 1.2)); y = lerp(P.y + 1.62, 0.35, k); roll = k * 1.2; pitch = lerp(P.pitch, 0.3, k);
  }
  const bob = Math.sin(BOW.walkPhase * 2) * 0.03 * BOW.walkAmt * (1 + BOW.sprintAmt);
  const sh = SHAKE.amt * SHAKE.amt * 0.06 * SETTINGS.shake;
  M4.trs(camM, x + (Math.random() - 0.5) * sh, y + bob + (Math.random() - 0.5) * sh, z, pitch + (Math.random() - 0.5) * sh * 0.5, yaw + (Math.random() - 0.5) * sh * 0.5, roll, 1, 1, 1);
  return [x, y, z];
}
function render(time) {
  // resolution: pixel budget per quality level, plus automatic scaling if frames run slow
  const q = SETTINGS.quality;   // Ultra never drops resolution behind your back
  const budget = (q === 0 ? 1.0e6 : q >= 2 ? 8.3e6 : 2.4e6) * (q >= 3 ? 1 : PERF.scale);   // High / Ultra render up to native 4K
  const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
  let dpr = Math.min(2, devicePixelRatio || 1); if (q >= 3) dpr = Math.min(2.25, dpr * 1.5);   // Ultra supersamples: renders at 1.5x and scales down
  if (cw * ch * dpr * dpr > budget) dpr = Math.sqrt(budget / (cw * ch));
  if (window.__NQ_CAPTURE) dpr = window.__NQ_CAPTURE_DPR || 1;
  const W = Math.max(1, Math.round(cw * dpr)), H = Math.max(1, Math.round(ch * dpr));
  mpi = 0; WORLD_ITEMS.n = 0; VM_ITEMS.n = 0;
  const cam = setCamera(time);
  const fov = GAME.state === 'title' ? 70 : PLAYER.fov;
  // ---- collect draws
  if (ZRIG.ready) syncRigs();
  drawCityDynamic(time);
  for (const z of ZOMBIES) drawZombie(z, time);
  drawDebris();
  drawProjectiles(); drawZProj(); drawPickups(time); drawSupplies(time); drawFires(time); drawObjectives(time); drawHazards(time); drawHook();
  if (GAME.state === 'playing' || GAME.state === 'paused' || GAME.state === 'shop' || (GAME.state === 'over' && PLAYER.deathT < 0.6) || GAME.showBowInTitle) drawBowViewmodel(camM, time, PLAYER);
  render3(time, W, H, fov, cam);
}
/* ---------------- UI wiring ---------------- */
function syncMusicBtn() { const b = $('musicBtn'); if (b) b.textContent = 'Title music: ' + (SETTINGS.music ? 'On' : 'Off'); }
function wireUI() {
  $('playBtn').addEventListener('click', () => startRun('normal'));
  $('resumeBtn').addEventListener('click', () => { AUD.click(); GAME.resume(); });
  $('quitBtn').addEventListener('click', () => { AUD.click(); toTitle(); });
  $('againBtn').addEventListener('click', () => { AUD.click(); ZOMBIES.length = 0; GAME.newGame(); requestLock(); });
  $('menuBtn').addEventListener('click', () => { AUD.click(); toTitle(); });
  $('nextWaveBtn').addEventListener('click', () => { AUD.click(); GAME.closeShop(); });
  $('musicBtn').addEventListener('click', () => { AUD.init(); SETTINGS.music = !SETTINGS.music; AUD.setMusic(SETTINGS.music); saveLS('nq_settings', SETTINGS); syncMusicBtn(); });
  for (const id of ['sens', 'sens2']) { const s = $(id); s.value = SETTINGS.sens; s.addEventListener('input', () => { SETTINGS.sens = +s.value; $('sens').value = $('sens2').value = s.value; saveLS('nq_settings', SETTINGS); }); }
  for (const id of ['look', 'look2']) { const s = $(id); s.innerHTML = THEME_ORDER.map(k => `<option value="${k}">${THEMES[k].name}</option>`).join(''); s.value = SETTINGS.look; s.addEventListener('change', () => { SETTINGS.look = s.value; setTheme(s.value); $('look').value = $('look2').value = s.value; saveLS('nq_settings', SETTINGS); }); }
  // 'L' is the Laptop level: Balanced's pipeline, plus lighter detail on distant things (r3.js FAR)
  const qv = () => SETTINGS.laptop && SETTINGS.quality === 1 ? 'L' : String(SETTINGS.quality);
  for (const id of ['quality', 'quality2']) { const s = $(id); s.value = qv(); s.addEventListener('change', () => { PERF.scale = 1; SETTINGS.laptop = s.value === 'L'; SETTINGS.quality = s.value === 'L' ? 1 : +s.value; $('quality').value = $('quality2').value = s.value; saveLS('nq_settings', SETTINGS); }); }
  // both settings panels (title and pause) carry the same extra controls; any change redraws both
  const syncSettingsUI = () => { for (const n of ['', '2']) { $('fov' + n).value = SETTINGS.fov; $('fovv' + n).textContent = SETTINGS.fov + '°'; $('shake' + n).value = SETTINGS.shake; $('invy' + n).checked = SETTINGS.invertY; $('rf' + n).checked = SETTINGS.reduceFlash; $('padsens' + n).value = SETTINGS.padSens; $('padzone' + n).value = SETTINGS.padZone; $('padvib' + n).checked = SETTINGS.vibration; } };
  for (const n of ['', '2']) {
    const upd = (k, v) => { SETTINGS[k] = v; syncSettingsUI(); saveLS('nq_settings', SETTINGS); };
    $('fov' + n).addEventListener('input', (e) => upd('fov', +e.target.value));
    $('shake' + n).addEventListener('input', (e) => upd('shake', +e.target.value));
    $('invy' + n).addEventListener('change', (e) => upd('invertY', e.target.checked));
    $('rf' + n).addEventListener('change', (e) => upd('reduceFlash', e.target.checked));
    $('padsens' + n).addEventListener('input', (e) => upd('padSens', +e.target.value));
    $('padzone' + n).addEventListener('input', (e) => upd('padZone', +e.target.value));
    $('padvib' + n).addEventListener('change', (e) => upd('vibration', e.target.checked));
  }
  syncSettingsUI(); wireControls(); wireRun();
  syncMusicBtn();
  addEventListener('resize', () => { if (GAME.state === 'title') drawLogo($('logo'), 'NEON QUIVER', '#ff2e88', true, true); });
}
function toTitle() {
  GAME.state = 'title'; ZOMBIES.length = 0; DECALS.length = 0; DEBRIS.length = 0; PROJ.length = 0; ZPROJ.length = 0; PICKUPS.length = 0; FIRES.length = 0; GAME.boss = null; $('bossbar').hidden = true; hazReset();
  for (let i = 0; i < 9; i++) { const zz = spawnZombie(pick(['walker', 'walker', 'walker', 'runner', 'brute']), rand(-30, 30), rand(-30, 30), 1); zz.speed *= 0.5; }
  setScreen('title'); updateTitleStats(); drawLogo($('logo'), 'NEON QUIVER', '#ff2e88', true, true); AUD.intensity = 0.35; AUD.setMusicScreen(true);
}
function updateTitleStats() { refreshDailyUI(); $('bestScore').textContent = GAME.best ? GAME.best.toLocaleString() : '—'; $('bestWave').textContent = GAME.bestWave || '—'; }

/* ---------------- GPU check: software-rendering warning, first-run quality pick ---------------- */
function gpuName() {
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); } catch (e) { return ''; }
}
function gpuCheck() {
  const g = gpuName(), q = new URLSearchParams(location.search);
  const soft = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i.test(g);
  if (soft && !q.has('nowarn') && !window.__NQ_CAPTURE) { $('swWarn').hidden = false; $('swWarnX').addEventListener('click', () => { $('swWarn').hidden = true; }); }
  // first run only: integrated GPUs start on Laptop. A saved choice is never overridden.
  const integrated = /intel|iris|uhd|radeon\(tm\) graphics|radeon graphics|\b(680|740|760|780|880|890)m\b|adreno|apple/i.test(g) && !/\b(arc(\(tm\))? a\d+|rx|rtx|gtx|radeon pro)\b/i.test(g);
  if (!('quality' in SAVED_SETTINGS) && integrated && !soft) { SETTINGS.quality = 1; SETTINGS.laptop = true; }
  GPU.name = g; GPU.soft = soft; GPU.integrated = integrated;
}
const GPU = { name: '', soft: false, integrated: false };

/* ---------------- boot ---------------- */
async function boot() {
  try { await Promise.race([Promise.all([document.fonts.load('700 40px "Quiver Cn"'), document.fonts.load('400 40px "Quiver Cn"')]), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  await loadModels(); makeDecalTextures();
  buildCity(); buildWorldSpatialIndex(); buildNav(); buildWorld3();
  await loadZombieRig(window.__NQ_RIG_URL || 'models/zombie.glb?v=' + (typeof RIG_VER === 'string' ? RIG_VER : '0'));
  gpuCheck();
  wireUI();
  toTitle();
  render(GAME.time); warmShaders();   // build the post chain, then compile everything before the first real frame
  $('loading').hidden = true;
  requestAnimationFrame(frame);
  window.NQ_READY = true;
}
/* ---------------- capture / debug API (used to render ad assets) ---------------- */
window.NQ = {
  BINDS, BIND_DEFAULTS, INPUT, SHAKE, shake, camM, DBG, GAME, THREE, scene, renderer, camera, vmCamera, WORLD_ITEMS, GPU, gpuCheck, R3, FAR, warmShaders, FAR_MATS_N: () => FAR_MATS.length, ZRIG, WORLD, NAV, PLAYER, BOW, ZOMBIES, PROJ, ZPROJ, PICKUPS, emit, burst, explode, flashLight, spawnZombie, setScreen, step, drawLogo, segText, HUDVIS, SETTINGS,
  play() { GAME.newGame(); },
  fire(t, power = 1) { BOW.type = t; fireArrow(power); },
  OBJ, objStart, AUD, HOOK, hookFire, hookAim, ULTRA, NQU, WX, HAZ, waterAt, districtAt, DISTRICTS, WORLD_BOUNDS,
  killTest(z, part, dir, hit, power, ex) { killZombie(z, part, dir, 0, hit, power, ex); },
  dmgTest(z, d, part, hit, dir) { return damageZombie(z, d, part, hit, dir, 0, 1); },
  decalCount() { return DECALS.length; },
  setTheme, THEMES,
  renderOnce() { render(GAME.time); if (GAME.state !== 'title') hudFrame(); drawHUD2D(GAME.time); },
  noLoop(b) { GAME.noLoop = b; },
  particles(dt = 0.001) { updateParticles(dt); },
  AUD,
  bowStartDraw, bowRelease, fireArrow, selectArrow, SHOP, renderShop, camBasis,
  freeze(b) { GAME.frozen = b; },
  run(n, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
  pose(o) { Object.assign(PLAYER, o); },
  occMap() { return NQU.uOcc.value; },
  bow(state, draw, type) { Object.assign(BOW, { state, draw, type, nextType: -1, t: 0, hold: 0 }); },
  clear() { ZOMBIES.length = 0; PROJ.length = 0; ZPROJ.length = 0; PICKUPS.length = 0; },
  shootAt(x, y, z, type = 0, power = 1) { const d = [x - PLAYER.x, y - (PLAYER.y + 1.62), z - PLAYER.z]; const L = Math.hypot(...d); const spd = (40 + 64 * power) * ARROWS[type].speed; PROJ.push({ x: PLAYER.x + d[0] / L * 2, y: PLAYER.y + 1.5 + d[1] / L * 2, z: PLAYER.z + d[2] / L * 2, vx: d[0] / L * spd, vy: d[1] / L * spd, vz: d[2] / L * spd, type, power, pierce: 5, hits: [], age: 0, stuck: false, stuckT: 0, dir: [d[0] / L, d[1] / L, d[2] / L] }); },
};
boot();
