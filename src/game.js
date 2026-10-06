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
// quality: 2 = High, 3 = Ultra. res: 'auto' (resolution scales itself when frames run slow) or a fixed percentage
const SETTINGS = { sens: 1, music: true, volMaster: 1, volSfx: 1, volMusic: 1, volAmb: 1, quality: 2, res: 'auto', look: 'noir', v: 2 };
const QUALITY_NAMES = { 2: 'High', 3: 'Ultra' }, RES_STEPS = [100, 85, 75, 67, 50];
function loadLS(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
const SAVED_SETTINGS = loadLS('nq_settings', {});
Object.assign(SETTINGS, SAVED_SETTINGS);
if (SAVED_SETTINGS.v !== 2) {   // from the Fast/Laptop/Balanced/Sharp/Ultra + Auto ladder: Ultra stays Ultra, everything else is High now
  SETTINGS.quality = SAVED_SETTINGS.quality >= 3 && !SAVED_SETTINGS.auto ? 3 : 2; SETTINGS.res = 'auto'; SETTINGS.v = 2;
  delete SETTINGS.laptop; delete SETTINGS.auto; if ('quality' in SAVED_SETTINGS) saveLS('nq_settings', SETTINGS);
}
if (SETTINGS.quality !== 2 && SETTINGS.quality !== 3) SETTINGS.quality = 2;
if (SETTINGS.res !== 'auto' && !RES_STEPS.includes(SETTINGS.res)) SETTINGS.res = 'auto';
if (!THEMES[SETTINGS.look]) SETTINGS.look = 'noir';
setTheme(SETTINGS.look);
const VOLS = [['volMaster', 'master'], ['volSfx', 'sfx'], ['volMusic', 'music'], ['volAmb', 'amb']];
for (const [k, b] of VOLS) AUD.vol[b] = clamp(+SETTINGS[k] || 0, 0, 1);

/* ---------------- player ---------------- */
const REGEN = { delay: 6 };   // out of combat = 6 s without taking a hit; the rate (1 HP every 4 s at base) comes from the armory
const INTERMISSION = 45;      // seconds between waves, shown in the Armory and the HUD (Start wave / N skips it)
const EYE = 1.62, CROUCH_DROP = 0.55;
function newAmmo() { const a = ARROWS.map(() => 0); a[0] = 20; return a; }
const PLAYER = {
  x: 0, y: 0, z: 14, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, roll: 0, grounded: true,
  hp: 100, maxHp: 100, speedMult: 1, drawTime: 1, reloadTime: 0.62, dmgMult: 1, powerMult: 1, armor: 0, quiverMax: 20, regenInt: 4, swayK: 1, recoverR: 1.3,
  stam: 5, stamMax: 5, stamT: 0, winded: false, crouch: 0, eyeH: EYE, swayX: 0, swayY: 0, ammo: newAmmo(),
  dmgFlash: 0, hurtDirs: [], vmIn: 0, fov: 78, lastHurt: 0, dead: false, deathT: 0, beat: 0,
  // where a sound happens, for AUD's 3D panner (height defaults to roughly head level)
  at(x, z, y) { return { x, y: y === undefined ? this.y + 1.4 : y, z }; },
  panOf(x, z) { const dx = x - this.x, dz = z - this.z, L = Math.hypot(dx, dz) || 1; return clamp((dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw)) / L, -1, 1); },
  hurt(d, fx, fz) {
    if (this.dead || GAME.state !== 'playing') return;
    d *= 1 - this.armor;   // Armor Plating
    this.hp -= d; this.lastHurt = GAME.time; this.dmgFlash = Math.min(1, this.dmgFlash + 0.35 + d / 60); shake(0.25 + d / 80); AUD.hurt();
    const ang = Math.atan2(fx - this.x, fz - this.z); this.hurtDirs.push({ ang, t: 1.2 });
    if (this.hp <= 0) { this.hp = 0; GAME.gameOver(); }
  },
};
// armory levels -> live player numbers (tables in armory.js: UPG)
function applyUpgrades() {
  const P = PLAYER;
  P.drawTime = UPG.draw[upLv('drawspeed')]; P.powerMult = UPG.power[upLv('power')]; P.quiverMax = UPG.quiver[upLv('quiver')];
  P.swayK = UPG.sway[upLv('aim')]; P.recoverR = UPG.recover[upLv('recovery')];
  P.regenInt = UPG.regen[upLv('regen')]; P.maxHp = UPG.maxhp[upLv('maxhp')]; P.armor = UPG.armor[upLv('armor')]; P.stamMax = UPG.stamina[upLv('stamina')];
}
/* ---------------- quiver: standard + up to 3 equipped specials ---------------- */
function arrowAvailable(t) { return t === 0 || LOADOUT.equipped.some((id) => SPECIAL_AT[id] === t); }
function availTypes() { const a = [0]; for (const id of LOADOUT.equipped) a.push(SPECIAL_AT[id]); return a; }
function slotType(n) { const id = LOADOUT.equipped[n]; return id ? SPECIAL_AT[id] : -1; }
function firstLoaded() { for (const t of availTypes()) if (PLAYER.ammo[t] > 0) return t; return 0; }
let _oooT = -9;
function outOfArrows() { AUD.deny(); flashQuiver(0); if (GAME.time - _oooT > 2.5) { _oooT = GAME.time; GAME.toast('OUT OF ARROWS · PICK UP SPENT ONES', '#ff6fb4'); } }
// every wave starts with a full quiver of standard arrows and each equipped special topped up to its allotment
function refillForWave() {
  const P = PLAYER; P.ammo[0] = Math.max(P.ammo[0], P.quiverMax);
  for (const t of availTypes()) if (t) P.ammo[t] = Math.max(P.ammo[t], ALLOT[t]);
  updateQuiverHUD();
}
// supply caches (world.js)
function supplyRefill() {
  const P = PLAYER; P.ammo[0] = Math.min(P.quiverMax, P.ammo[0] + 10);
  for (const t of availTypes()) if (t) P.ammo[t] += Math.ceil(ALLOT[t] / 2);
  P.hp = Math.min(P.maxHp, P.hp + 15); updateQuiverHUD();
}

/* ---------------- input ---------------- */
const INPUT = { keys: {}, mouseDown: false, dx: 0, dy: 0, locked: false, freeLook: false };
const gameEl = document.getElementById('game');
addEventListener('keydown', (e) => {
  const k = e.code; INPUT.keys[k] = true;
  if (GAME.state === 'playing') {
    const dn = /^Digit([1-3])$/.exec(k); if (dn) selectSlot(+dn[1] - 1);
    if (k === 'Backquote') selectArrow(0);
    if (k === 'KeyX') selectArrow(GAME.lastType);
    // grapple: hold Q to preview the anchor and fall risk, release to fire; Q while reeling cuts the rope
    if (k === 'KeyQ' && !e.repeat) { if (HOOK.state === 'reel') hookFire(); else if (HOOK.state === 'idle') { HOOK.aiming = true; HOOK.aimT = 0; } }
    if (k === 'KeyP' || k === 'Escape') GAME.pause();
    if (k === 'Space') e.preventDefault();
    if (k === 'KeyE' && GAME.nearTerminal) GAME.openShop();
    if (k === 'KeyN' && GAME.intermission) { GAME.interT = 0; }
  } else if (GAME.state === 'paused' && (k === 'KeyP')) GAME.resume();
  else if (GAME.state === 'shop' && k === 'Escape') { e.preventDefault(); GAME.closeShop(); }   // back to the street; the countdown keeps running
});
addEventListener('keyup', (e) => { INPUT.keys[e.code] = false; if (e.code === 'KeyQ' && HOOK.aiming) { HOOK.aiming = false; HOOK.aim = null; if (GAME.state === 'playing') hookFire(); } });
addEventListener('blur', () => { INPUT.keys = {}; HOOK.aiming = false; if (INPUT.mouseDown) { INPUT.mouseDown = false; } });
addEventListener('mousemove', (e) => { if (GAME.state !== 'playing') return; if (INPUT.locked || INPUT.freeLook) { INPUT.dx += e.movementX || 0; INPUT.dy += e.movementY || 0; } });
gameEl.addEventListener('mousedown', (e) => {
  if (GAME.state !== 'playing') return;
  if (!INPUT.locked && !INPUT.freeLook) { requestLock(); return; }
  if (INPUT.freeLook && !INPUT.locked) requestLock(true);
  if (e.button === 0) { INPUT.mouseDown = true; if (BOW.state === 'ready' && PLAYER.ammo[BOW.type] <= 0) { const t = firstLoaded(); if (t !== BOW.type && PLAYER.ammo[t] > 0) { selectArrow(t); return; } } bowStartDraw(); }
  if (e.button === 2) { bowCancel(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) { INPUT.mouseDown = false; if (GAME.state === 'playing') { const p = bowRelease(); if (p) fireArrow(p); } } });
gameEl.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (GAME.state !== 'playing') return; const dir = e.deltaY > 0 ? 1 : -1, L = availTypes(), N = L.length;
  let i = Math.max(0, L.indexOf(BOW.nextType >= 0 ? BOW.nextType : BOW.type));
  for (let k = 0; k < N; k++) { i = (i + dir + N) % N; if (PLAYER.ammo[L[i]] > 0) break; }
  selectArrow(L[i]);
}, { passive: true });
function requestLock(quiet) {
  try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { INPUT.freeLook = true; }); } catch (e) { INPUT.freeLook = true; }
  if (!quiet) setTimeout(() => { if (!INPUT.locked) INPUT.freeLook = true; }, 1500);
}
document.addEventListener('pointerlockchange', () => {
  INPUT.locked = document.pointerLockElement === canvas;
  if (INPUT.locked) INPUT.freeLook = false;
  if (!INPUT.locked && GAME.state === 'playing') GAME.pause();   // Esc (or alt-tab) always pauses
});
function selectArrow(t) {
  if (t < 0 || t >= ARROWS.length || !arrowAvailable(t)) return;
  if (PLAYER.ammo[t] <= 0) { AUD.deny(); flashQuiver(t); return; }
  const cur = BOW.nextType >= 0 ? BOW.nextType : BOW.type; if (cur === t) return;
  GAME.lastType = cur; bowSwap(t);
}
// keys 1–3: the special in that loadout slot; pressing the active slot again goes back to standard arrows
function selectSlot(n) {
  const t = slotType(n); if (t < 0) { AUD.deny(); flashQuiver('e' + n); return; }
  const cur = BOW.nextType >= 0 ? BOW.nextType : BOW.type;
  selectArrow(cur === t ? 0 : t);
}

/* ---------------- projectiles ---------------- */
const PROJ = [];
const GRAV = 9.5;
const _cf = [0, 0, 0], _cr = [0, 0, 0], _cu = [0, 0, 0];
function camBasis(swX = 0, swY = 0) {
  const yaw = PLAYER.yaw + swX, pitch = PLAYER.pitch + swY;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  _cf[0] = -sy * cp; _cf[1] = sp; _cf[2] = -cy * cp; _cr[0] = cy; _cr[1] = 0; _cr[2] = -sy; _cu[0] = sy * sp; _cu[1] = cp; _cu[2] = cy * sp;
}
function fireArrow(power) {
  const type = BOW.type, A = ARROWS[type];
  if (PLAYER.ammo[type] <= 0) return;
  PLAYER.ammo[type]--;
  camBasis(PLAYER.swayX, PLAYER.swayY);   // the arrow goes where the swaying crosshair is
  const eye = [PLAYER.x, PLAYER.y + PLAYER.eyeH - (PLAYER.sink || 0), PLAYER.z];
  const spd = (40 + 64 * power) * A.speed;
  const spr = (1 - power) * 0.012;   // tiny spread when not fully drawn
  const dx = _cf[0] + (Math.random() - 0.5) * spr, dy = _cf[1] + (Math.random() - 0.5) * spr, dz = _cf[2] + (Math.random() - 0.5) * spr, jl = Math.hypot(dx, dy, dz);
  const a = {
    x: eye[0] + _cf[0] * 0.4 - _cu[0] * 0.04, y: eye[1] + _cf[1] * 0.4 - _cu[1] * 0.04, z: eye[2] + _cf[2] * 0.4 - _cu[2] * 0.04,
    vx: dx / jl * spd, vy: dy / jl * spd, vz: dz / jl * spd, type, power, hits: [], age: 0, stuck: false, stuckT: 0, dir: [dx / jl, dy / jl, dz / jl], stuckZ: null, life: 6,
    pierce: type === AT.PIERCE ? UPG.pierce[upLv('piercer')] : 0,
    split: type === AT.SCATTER ? UPG.split[upLv('splitter')] : 0, tok: null,
  };
  if (type === 0) a.tok = recToken(a);   // standard arrows can be picked up again
  PROJ.push(a);
  AUD.release(power, type); shake(0.04 + power * 0.05);
  GAME.shots++;
  if (PLAYER.ammo[type] <= 0) { const nx = firstLoaded(); if (nx !== type && PLAYER.ammo[nx] > 0) BOW.nextType = nx; }
  updateQuiverHUD();
}
// Splitter: one arrow leaves the bow and breaks into a fan of bolts ~4 m out
function splitArrow(a) {
  const n = a.split, wide = upLv('splitter') >= 3, cone = wide ? 0.085 : 0.05, sp = Math.hypot(a.vx, a.vy, a.vz), d = a.dir;
  const rl = Math.hypot(d[0], d[2]) || 1, rx = -d[2] / rl, rz = d[0] / rl;
  for (let k = 0; k < n; k++) {
    const off = (n === 1 ? 0 : (k / (n - 1) - 0.5) * 2) * cone + rand(-0.008, 0.008), up = rand(-0.3, 0.3) * cone;
    const jx = d[0] + rx * off, jy = d[1] + up, jz = d[2] + rz * off, jl = Math.hypot(jx, jy, jz);
    PROJ.push({ x: a.x, y: a.y, z: a.z, vx: jx / jl * sp, vy: jy / jl * sp, vz: jz / jl * sp, type: AT.SCATTER, power: a.power, hits: [], age: 0, stuck: false, stuckT: 0, dir: [jx / jl, jy / jl, jz / jl], stuckZ: null, life: 1.2, pierce: 0, split: 0, tok: null });
  }
  burst(a.x, a.y, a.z, 10, ARROWS[AT.SCATTER].glow, 3, 0.2, 0.04, 0, 2);
}
// level-aware special effects (armory.js UPG); a locked arrow never reaches these, but Lv 1 is the floor anyway
function arrowDamage(a, A) { return 52 * (0.3 + 0.7 * a.power) * A.dmg * (1 + (PLAYER.powerMult - 1) * a.power) * PLAYER.dmgMult; }
function blastAt(x, y, z) { const L = Math.max(1, upLv('blast')); explode(x, y, z, UPG.blastR[L], L >= 3); }
function cryoAt(x, y, z, t) { const c = UPG.cryo[Math.max(1, upLv('cryo'))]; cryoHit(x, y, z, t, c[0], c[1]); }
function shockAt(x, y, z, t, dmg) { const L = Math.max(1, upLv('shock')); shockChain(x, y, z, t, UPG.shock[L], Math.max(14, dmg * 0.45), L >= 3 ? 1 : 0); }
function tracerAt(x, z, t) { const L = Math.max(1, upLv('tracer')); tracerMark(x, z, t, UPG.tracer[L], L >= 3 ? 10 : 1.5); }

/* ---------------- arrow recovery ---------------- */
// one token per standard arrow fired, oldest first. Picking an arrow up spends its token; at Arrow Recovery Lv 4
// any token still unspent after 10 s brings that arrow home on its own.
const RECQ = [];
function recToken(proj) { const k = { t: GAME.time, done: false, proj, z: null }; RECQ.push(k); return k; }
function dropZombieArrow(z) { const i = z.stuck.findIndex((sa) => sa.type === 0); if (i >= 0) z.stuck.splice(i, 1); }
function updateRecovery() {
  const P = PLAYER; let got = 0, back = 0;
  if (P.ammo[0] < P.quiverMax) {
    const r = P.recoverR, r2 = r * r, top = r > 1.5 ? 4 : 2.6;
    for (let i = PROJ.length - 1; i >= 0 && P.ammo[0] + got < P.quiverMax; i--) {
      const a = PROJ[i]; if (!a.stuck || !a.tok || a.tok.done) continue;
      const dx = a.x - P.x, dz = a.z - P.z, dy = a.y - P.y; if (dx * dx + dz * dz > r2 || dy < -1 || dy > top) continue;
      a.tok.done = true; PROJ.splice(i, 1); got++;
    }
    const rc = r + 0.6;
    for (const z of ZOMBIES) {
      if (!z.dead || !z.quiver || P.ammo[0] + got >= P.quiverMax) continue;
      if ((z.x - P.x) ** 2 + (z.z - P.z) ** 2 > rc * rc) continue;
      const n = Math.min(z.quiver, P.quiverMax - P.ammo[0] - got);
      for (let k = 0; k < n; k++) { const t = z.toks && z.toks.pop(); if (t) t.done = true; dropZombieArrow(z); }
      z.quiver -= n; got += n;
    }
  }
  const ret = upLv('recovery') >= 4;
  while (RECQ.length && (RECQ[0].done || GAME.time - RECQ[0].t >= 10)) {
    const k = RECQ.shift(); if (k.done || !ret) continue;   // below Lv 4 it simply stays where it fell
    if (P.ammo[0] + got + back >= P.quiverMax) { k.t = GAME.time; RECQ.push(k); break; }   // quiver full: try again later
    k.done = true; back++;
    if (k.z) { k.z.quiver = Math.max(0, k.z.quiver - 1); const j = k.z.toks ? k.z.toks.indexOf(k) : -1; if (j >= 0) k.z.toks.splice(j, 1); dropZombieArrow(k.z); }
    else if (k.proj) { const j = PROJ.indexOf(k.proj); if (j >= 0) PROJ.splice(j, 1); }
  }
  if (got || back) {
    P.ammo[0] += got + back; AUD.quiver(); updateQuiverHUD();
    GAME.toast(got && back ? `+${got + back} ARROWS` : got ? `+${got} ARROW${got > 1 ? 'S' : ''}` : `+${back} ARROW${back > 1 ? 'S' : ''} RETURNED`, '#dff3ff');
  }
}
const _seg0 = [0, 0, 0], _seg1 = [0, 0, 0], _so = { s: 0 };
const _trailC = [0, 0, 0];
const LEG_SEGS = ['hipL', 'knL', 'knL', 'ftL', 'hipR', 'knR', 'knR', 'ftR'];
function updateProjectiles(dt) {
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const a = PROJ[i];
    if (a.stuck) { a.stuckT += dt; if (a.stuckT > (a.tok ? 40 : 14) || (a.stuckZ && a.stuckZ.dead && a.stuckZ.dieT > 4)) PROJ.splice(i, 1); continue; }
    a.age += dt; if (a.age > (a.life || 6)) { PROJ.splice(i, 1); continue; }
    if (a.split && a.age > 0.04) { splitArrow(a); PROJ.splice(i, 1); continue; }
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
      const nd = arrowDamage(a, A); objNestDamage(nd, hx, hy, hz); GAME.hits++; AUD.hit(false, PLAYER.at(hx, hz, hy));
      if (a.type === AT.BLAST) blastAt(hx, hy, hz); else if (a.type === AT.FROST) cryoAt(hx, hy, hz, null); else if (a.type === AT.SHOCK) shockAt(hx, hy, hz, null, nd); else if (a.type === AT.TRACER) tracerAt(hx, hz, null);
      PROJ.splice(i, 1); continue;
    }
    if (hitKind === 'z') {
      const z = hitZ; a.hits.push(z);
      const dmgBase = arrowDamage(a, A);
      const mult = hitPart === 'head' ? (z.type === 'boss' ? 1.8 : 2.6) : hitPart === 'core' ? 2.2 : 1;
      const dmg = dmgBase * mult;
      const dir = a.dir.slice();
      const wasAlive = !z.dead;
      if (hitPart === 'head' || hitPart === 'core') { GAME.hitMarker(true); if (hitPart === 'head') GAME.headHits++; }
      else GAME.hitMarker(false);
      GAME.hits++;
      // stick arrow into zombie (not rail)
      if (a.type !== 3 && a.type !== 2 && a.type !== AT.SCATTER && a.type !== AT.FROST && z.stuck.length < 8 && hitPart !== 'legs') { const loc = localize(z, hitPart === 'head' ? 'head' : 'body', [hx, hy, hz], dir); if (loc) z.stuck.push({ part: hitPart === 'head' ? 'head' : 'body', lp: loc.lp, ld: loc.ld, type: a.type }); }
      if (a.tok) { a.tok.proj = null; a.tok.z = z; z.quiver++; (z.toks || (z.toks = [])).push(a.tok); a.tok = null; }   // carried until it drops
      const killed = damageZombie(z, dmg, hitPart, [hx, hy, hz], dir, a.type, a.power);
      floatText(hx, hy + 0.2, hz, Math.round(dmg).toString(), hitPart !== 'body' ? '#ffd23a' : '#ffffff', hitPart !== 'body' ? 1.3 : 1);
      burst(hx, hy, hz, hitPart === 'head' ? 10 : 5, [0.45, 1.3, 0.25], 3, 0.4, 0.05, 10, 1.2);
      burst(hx, hy, hz, 8, A.glow, 6, 0.25, 0.05, 0, 3);
      AUD.hit(hitPart !== 'body', PLAYER.at(hx, hz, hy));
      if (killed) { GAME.hitMarker(true, true); }
      if (a.type === 1 && wasAlive) { z.burn = 4.5; AUD.fireIgnite(); }
      if (a.type === AT.FROST) { cryoAt(hx, hy, hz, z); PROJ.splice(i, 1); continue; }
      if (a.type === AT.TETHER) { tetherFrom(z, hx, hy, hz); }
      if (a.type === AT.SHOCK) { shockAt(hx, hy, hz, z, dmg); PROJ.splice(i, 1); continue; }
      if (a.type === AT.TRACER) { tracerAt(hx, hz, z); PROJ.splice(i, 1); continue; }
      if (a.type === AT.BLAST) { blastAt(hx, hy, hz); PROJ.splice(i, 1); continue; }
      if (a.type === 3 && a.pierce > 0) { a.pierce--; a.x = hx + a.dir[0] * 0.05; a.y = hy + a.dir[1] * 0.05; a.z = hz + a.dir[2] * 0.05; continue; }
      PROJ.splice(i, 1); continue; // arrow now drawn as stuck on zombie
    } else {
      a.x = hx - a.dir[0] * 0.05; a.y = hy - a.dir[1] * 0.05; a.z = hz - a.dir[2] * 0.05;
      a.stuck = true; a.stuckT = 0;
      hazArrowHit(hx, hy, hz, a.type);
      burst(hx, hy, hz, 10, [1.5, 1.4, 1.2], 4, 0.3, 0.04, 8, 2);
      if (a.type === AT.BLAST) { blastAt(hx, hy + 0.2, hz); PROJ.splice(i, 1); continue; }
      if (a.type === AT.FROST) { cryoAt(hx, hy + 0.2, hz, null); PROJ.splice(i, 1); continue; }
      if (a.type === AT.SHOCK) shockAt(hx, hy + 0.2, hz, null, arrowDamage(a, A));
      if (a.type === AT.TRACER) tracerAt(hx, hz, null);
      if (a.type === AT.SCATTER) { PROJ.splice(i, 1); continue; }   // shards shatter on walls
      if (a.type === 1) { FIRES.push({ x: hx, z: hz, t: 4.5 }); AUD.fireIgnite(); }
      AUD.thunk();
      let nst = 0; for (const p of PROJ) if (p.stuck) nst++;
      if (nst > 60) { const k = PROJ.findIndex(p => p.stuck); if (k >= 0 && k !== i) PROJ.splice(k, 1); }
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
// R: damage radius (Blast Arrow 2–4 m by level; tanks, the nest and the Warden's death use the full 6 m). knock: hard shove for survivors
function explode(x, y, z, R = 6, knock = true) {
  const q = clamp(R / 6, 0.35, 1);   // smaller blasts spend fewer particles
  objBlast(x, y, z, R, 160 * PLAYER.dmgMult);
  AUD.explode(Math.hypot(x - PLAYER.x, z - PLAYER.z) + (1 - q) * 14); shake(clamp(1.2 - Math.hypot(x - PLAYER.x, z - PLAYER.z) / 30, 0.15, 0.9) * (0.5 + 0.5 * q));
  flashLight(x, y + 1, z, [6, 1.2, 5.5], 26 * (0.4 + 0.6 * q), 0.55);
  burst(x, y, z, Math.round(120 * q), [2.8, 0.5, 2.6], 14 * q, 0.7, 0.3, 2, 2.5);
  burst(x, y, z, Math.round(60 * q), [3, 2.2, 3], 8 * q, 0.35, 0.45, 0, 4);
  burst(x, y, z, Math.round(50 * q), [0.25, 0.18, 0.3], 5, 1.6, 0.9, -0.5, 1.2, 1);
  const ring = Math.round(48 * q); for (let k = 0; k < ring; k++) { const a = k / ring * TAU; emit(x, Math.max(0.2, y * 0.3), z, Math.cos(a) * 18 * q, 0.3, Math.sin(a) * 18 * q, 0.4, [2.5, 0.6, 2.4], 0.3, 0, 4); }
  for (const zz of zombieCandidates(x - R * 1.4, x + R * 1.4, z - R * 1.4, z + R * 1.4)) {
    if (zz.dead) continue; const d = Math.hypot(zz.x - x, (zz.y + 1) - y, zz.z - z);
    if (d < R * (zz.type === 'boss' ? 1.4 : 1)) { const k = 1 - d / (R * 1.4); const dir = [(zz.x - x) / (d || 1), 0, (zz.z - z) / (d || 1)];
      const killed = damageZombie(zz, (70 + 110 * k) * PLAYER.dmgMult, 'body', [zz.x, 1.1 * zz.scale, zz.z], dir, 2, 1, true);
      if (!killed) { const kb = knock ? 12 : 3; zz.vx += dir[0] * kb * k; zz.vz += dir[2] * kb * k; if (knock && zz.type !== 'boss') zz.stumble = Math.max(zz.stumble, 0.8); }
      GAME.hitMarker(false, killed); }
  }
  const pd = Math.hypot(PLAYER.x - x, PLAYER.z - z); if (pd < Math.min(3.2, R * 0.6) && GAME.state === 'playing') PLAYER.hurt(8, x, z);
  hazBlast(x, z, R, y);   // fuel tanks in reach go up too
}

/* ---------------- pickups ---------------- */
const PICKUPS = [];
function dropPickup(x, z, forceType, std = false) {
  const r = Math.random();
  const kind = forceType || (r < 0.55 ? 'ammo' : 'health');
  // arrow drops: standard arrows, or one of the specials you have equipped
  const sp = availTypes().slice(1), at = kind === 'ammo' && !std && sp.length && Math.random() < 0.45 ? pick(sp) : 0;
  PICKUPS.push({ x, z, kind, at, t: 0 });
}
function updatePickups(dt) {
  for (let i = PICKUPS.length - 1; i >= 0; i--) {
    const p = PICKUPS[i]; p.t += dt;
    if (p.t > 25) { PICKUPS.splice(i, 1); continue; }
    if (GAME.state === 'playing' && Math.hypot(p.x - PLAYER.x, p.z - PLAYER.z) < 1.7) {
      if (p.kind === 'health') { if (PLAYER.hp >= PLAYER.maxHp) continue; const h = Math.round(Math.max(25, PLAYER.maxHp * 0.25)); PLAYER.hp = Math.min(PLAYER.maxHp, PLAYER.hp + h); AUD.heal(); GAME.toast(`+${h} HEALTH`, '#6dff9a'); }
      else if (p.at === 0) { const n = Math.min(6, PLAYER.quiverMax - PLAYER.ammo[0]); if (n <= 0) continue; PLAYER.ammo[0] += n; AUD.pickup(); GAME.toast(`+${n} ARROWS`, '#dff3ff'); updateQuiverHUD(); }
      else { const n = p.at === AT.BLAST || p.at === AT.FROST || p.at === AT.SHOCK ? 2 : 3; PLAYER.ammo[p.at] += n; AUD.pickup(); GAME.toast(`+${n} ${ARROWS[p.at].name.toUpperCase()}`, rgbHex(ARROWS[p.at].color)); updateQuiverHUD(); }
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
  state: 'title', wave: 0, toSpawn: 0, spawnT: 0, score: 0, scrap: 0, armoryT: 0, kills: 0, headshots: 0, shots: 0, hits: 0, headHits: 0, combo: 0, comboT: 0,
  best: loadLS('nq_best', 0), bestWave: loadLS('nq_bestwave', 0), time: 0, bossCount: 0, clearT: 0, bannerT: 0, banner: null, lastType: 0, frozen: false,
  boss: null, bossPending: 0, hm: { t: 0, head: false, kill: false }, startT: 0, toasts: [],
  newGame() {
    AUD.setMusicScreen(false);
    for (const k of ['wave', 'score', 'scrap', 'kills', 'headshots', 'shots', 'hits', 'headHits', 'combo', 'comboT', 'bossCount', 'armoryT']) this[k] = 0;
    loadoutReset(); RECQ.length = 0; ARCS.length = 0; this.lastType = 0;
    ZOMBIES.length = 0; PROJ.length = 0; ZPROJ.length = 0; PICKUPS.length = 0; FIRES.length = 0; DECALS.length = 0; DEBRIS.length = 0; this.boss = null; this.intermission = false; this.interT = 0; for (const sp of WORLD.supplies) sp.cd = 0; this.clearedShown = false; this.bossPending = 0; this.toasts = []; this.bannerT = 0; this.toSpawn = 0; document.getElementById('bossbar').hidden = true;
    Object.assign(PLAYER, { x: 0, y: 0, z: 14, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0.02, dead: false, deathT: 0, dmgFlash: 0, vmIn: 0, hurtDirs: [] });
    applyUpgrades(); PLAYER.hp = PLAYER.maxHp; PLAYER.lastHurt = -99; PLAYER.fling = false; PLAYER.peakY = 0; HOOK.state = 'idle'; HOOK.cd = 0;
    PLAYER.ammo = newAmmo(); PLAYER.ammo[0] = PLAYER.quiverMax; Object.assign(PLAYER, { stam: PLAYER.stamMax, stamT: 0, winded: false, crouch: 0, eyeH: EYE, swayX: 0, swayY: 0 });
    Object.assign(BOW, { draw: 0, state: 'ready', t: 0, type: 0, nextType: -1, hold: 0 });
    this.state = 'playing'; this.startT = this.time; setScreen(null); updateQuiverHUD();
    objReset(); wxReset(); hazReset(); PLAYER.sink = 0;
    this.intermission = true; this.interT = 8; this.showBanner('GET READY', 'FIRST WAVE INBOUND · PRESS N TO START NOW', '#29e7ff');
  },
  startWave() {
    if (this.state !== 'playing') return;
    this.intermission = false; this.clearedShown = false; this.armoryT = 0;
    this.wave++;
    refillForWave();
    const boss = this.wave % 5 === 0;
    const n = Math.round((6 + this.wave * 3.2) * (boss ? (this.wave >= 10 ? 0.75 : 0.55) : 1));
    this.toSpawn = n; this.spawnT = 1.2; this.clearT = 0;
    this.showBanner(`WAVE ${this.wave}`, boss ? 'THE WARDEN IS COMING' : this.wave === 1 ? 'SURVIVE THE NIGHT' : `${n} INFECTED INBOUND`, boss ? '#ff3df0' : '#ff2e88');
    AUD.waveHorn(boss); AUD.intensity = boss ? 1 : Math.min(0.9, 0.55 + this.wave * 0.05);
    if (boss) this.bossPending = 4;
    objWaveStart(this.wave);
    hudWave();
  },
  spawnOne() {
    const w = this.wave;
    const r = Math.random();
    // the mix keeps shifting toward runners and brutes well past wave 10, and elites start showing up from wave 8
    const pRun = w >= 2 ? Math.min(0.45, 0.1 + (w - 2) * 0.045) : 0, pBrute = w >= 3 ? Math.min(0.3, 0.06 + (w - 3) * 0.022) : 0;
    // spitters and screamers start from wave 4, climbers from wave 5 — all stay a rare mix-in
    const pSpit = w >= 4 ? Math.min(0.14, (w - 4) * 0.012) : 0, pScream = w >= 5 ? Math.min(0.1, (w - 5) * 0.01) : 0, pClimb = w >= 5 ? Math.min(0.14, (w - 5) * 0.013) : 0;
    const pElite = w >= 8 ? Math.min(0.35, (w - 7) * 0.03) : 0;
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
    if (Math.random() < pElite) makeElite(z);
    // from wave 6, runners sometimes come as a pack from the same spot
    if (type === 'runner' && w >= 6 && this.toSpawn > 2 && Math.random() < Math.min(0.35, 0.1 + (w - 6) * 0.03)) {
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
        if (this.clearT > 0.4 && !this.clearedShown) {
          this.clearedShown = true; const bonus = 20 + this.wave * 6; this.scrap += bonus; this.score += bonus * 12;
          this.showBanner('WAVE CLEARED', `+${bonus} SCRAP · ARMORY OPENING`, '#29e7ff'); AUD.cleared(); AUD.intensity = 0.35; hudScore();
          this.intermission = true; this.interT = INTERMISSION; this.armoryT = 1.8;   // a beat to see the banner, then the Armory opens
        }
      }
    }
    // 25 s between waves; the clock keeps running while you shop, and the next wave kicks you out of the armory
    if (this.intermission && (this.state === 'playing' || this.state === 'shop')) { const t0 = this.interT; this.interT -= dt; if (this.state === 'playing' && Math.ceil(t0) !== Math.ceil(this.interT) && this.interT > 0 && this.interT <= 5) AUD.tick && AUD.tick(); if (this.interT <= 0) { this.intermission = false; this.clearedShown = false; if (this.state === 'shop') this.closeShop(); else this.startWave(); } }
    if (this.armoryT > 0 && this.state === 'playing' && this.intermission) { this.armoryT -= dt; if (this.armoryT <= 0) this.openShop(); }
    if (this.state === 'shop') armoryTick();
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
    const scrap = z.T.scrap * (z.elite ? 2 : 1) + (head ? 2 : 0);   // scrap per kill: see ZTYPES in zombies.js
    this.score += pts; this.scrap += scrap; this.kills++; if (head) this.headshots++;
    AUD.kill();
    floatText(z.x, (z.y + 2.1) * 1, z.z, `+${pts}`, head ? '#ffd23a' : '#29e7ff', head ? 1.2 : 1, 1.2);
    if (head) this.toast(`HEADSHOT  +${pts}`, '#ffd23a'); else if (z.elite) this.toast(`ELITE DOWN  +${pts}`, '#f4f0ff'); else if (z.type === 'brute') this.toast(`BRUTE DOWN  +${pts}`, '#ff2e88');
    // drops
    const r = Math.random();
    if (z.type === 'boss') { for (let k = 0; k < 6; k++) dropPickup(z.x + rand(-3, 3), z.z + rand(-3, 3), k < 4 ? 'ammo' : 'health'); explode(z.x, 2, z.z); this.showBanner('WARDEN DOWN', `+${pts}`, '#ffd23a'); this.boss = null; document.getElementById('bossbar').hidden = true; shake(1.2); }
    else if (z.type === 'brute' ? r < 0.75 : r < 0.16) dropPickup(z.x, z.z);
    else if (PLAYER.ammo[0] < PLAYER.quiverMax * 0.3 && Math.random() < 0.3) dropPickup(z.x, z.z, 'ammo', true);   // running dry: the dead give back arrows
    hudScore();
  },
  hitMarker(head, kill) { this.hm.t = 0.18; this.hm.head = !!head; this.hm.kill = !!kill; },
  toast(text, color) { this.toasts.unshift({ text, color, t: 1.6 }); if (this.toasts.length > 4) this.toasts.pop(); },
  showBanner(title, sub, color) { this.banner = { title, sub, color }; this.bannerT = 3; },
  openShop() {
    if (this.state !== 'playing') return;
    this.state = 'shop'; this.armoryT = 0; AUD.drawStop(); INPUT.mouseDown = false; INPUT.keys = {}; HOOK.aiming = false; HOOK.aim = null; BOW.state = 'ready'; BOW.draw = 0;
    if (document.exitPointerLock) document.exitPointerLock(); setScreen('shop'); armoryOpen(); AUD.armory();
  },
  closeShop() { if (this.state !== 'shop') return; setScreen(null); this.state = 'playing'; requestLock(); if (!this.intermission) this.startWave(); },   // Esc keeps the countdown running
  startNow() { this.intermission = false; this.interT = 0; this.closeShop(); },
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; AUD.drawStop(); INPUT.mouseDown = false; if (BOW.state === 'drawing') BOW.state = 'letdown'; setScreen('pause'); drawLogo($('pauseLogo'), 'PAUSED', '#29e7ff'); if (document.exitPointerLock && INPUT.locked) document.exitPointerLock(); },
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; setScreen(null); requestLock(); },
  gameOver() {
    this.state = 'over'; PLAYER.dead = true; AUD.drawStop(); AUD.gameOver(); AUD.intensity = 0.2; INPUT.mouseDown = false;
    const newBest = this.score > this.best; if (newBest) { this.best = this.score; saveLS('nq_best', this.best); }
    if (this.wave > this.bestWave) { this.bestWave = this.wave; saveLS('nq_bestwave', this.bestWave); }
    setTimeout(() => {
      if (document.exitPointerLock) document.exitPointerLock();
      document.getElementById('goStats').innerHTML = [['Wave reached', this.wave], ['Score', this.score.toLocaleString()], ['Kills', this.kills], ['Headshots', this.headshots], ['Accuracy', this.shots ? Math.round(this.hits / this.shots * 100) + '%' : '—'], ['Best', this.best.toLocaleString()]]
        .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
      document.getElementById('goBest').hidden = !newBest;
      setScreen('over'); drawLogo(document.getElementById('goLogo'), 'OVERRUN', '#ff3040');
    }, 1600);
  },
};

/* ---------------- HUD (DOM) ---------------- */
const $ = (id) => document.getElementById(id);
function rgbHex(c) { return '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); }
function hudScore() { $('score').textContent = GAME.score.toLocaleString(); $('scrap').textContent = GAME.scrap.toLocaleString(); const m = 1 + Math.min(8, Math.floor(GAME.combo / 3)) * 0.25; $('combo').textContent = GAME.combo >= 3 ? `×${m.toFixed(2)} COMBO` : ''; }
function hudWave() { $('waveNum').textContent = GAME.wave; }
// bottom-right quiver: standard arrows (` key) and the three loadout slots (1–3); rebuilt only when the loadout changes
let _qSig = '';
function updateQuiverHUD() {
  const el = $('quiver'), sig = LOADOUT.equipped.join(',');
  if (sig !== _qSig || !el.children.length) {
    _qSig = sig;
    const row = (id, key, A, empty) => `<div class="slot${empty ? ' none' : ''}" id="${id}" style="--c:${A ? rgbHex(A.color) : '#5b6078'}"><span class="k">${key}</span><span class="nm">${A ? A.name : 'Empty slot'}</span><span class="ct"></span><span class="bar"></span></div>`;
    let h = row('slot0', '`', ARROWS[0]);
    for (let n = 0; n < SLOT_COUNT; n++) { const t = slotType(n); h += t >= 0 ? row('slot' + t, n + 1, ARROWS[t]) : row('slote' + n, n + 1, null, true); }
    el.innerHTML = h;
  }
  const cur = BOW.nextType >= 0 ? BOW.nextType : BOW.type;
  for (const t of availTypes()) { const d = $('slot' + t); if (!d) continue; d.classList.toggle('sel', cur === t); d.classList.toggle('empty', PLAYER.ammo[t] <= 0); d.querySelector('.ct').textContent = t === 0 ? `${PLAYER.ammo[0]} / ${PLAYER.quiverMax}` : PLAYER.ammo[t]; }
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
  if (GAME.intermission) { const t = Math.max(0, Math.ceil(GAME.interT)); hudSet('remain', 't', `NEXT WAVE IN ${t}s · N TO START NOW`); hudCls('remain', 'soon', t <= 5); hudCls('remain', 'count', true); }
  else { hudSet('remain', 't', GAME.wave ? `${alive + GAME.toSpawn} INFECTED` : ''); hudCls('remain', 'soon', false); hudCls('remain', 'count', false); }
  hudCls('hp', 'regen', !!PLAYER.regen);
  hudSet('stFill', 's', `scaleX(${clamp(PLAYER.stam / PLAYER.stamMax, 0, 1).toFixed(3)})`); hudCls('stam', 'winded', PLAYER.winded); hudCls('stam', 'full', PLAYER.stam >= PLAYER.stamMax);
  const sel = BOW.nextType >= 0 ? BOW.nextType : BOW.type; if (sel !== _lastSel) { _lastSel = sel; updateQuiverHUD(); }
  if (GAME.boss) hudSet('bossFill', 's', `scaleX(${clamp(GAME.boss.hp / GAME.boss.maxHp, 0, 1)})`);
}
function setScreen(name) {
  if (name === null && document.activeElement && document.activeElement.blur) document.activeElement.blur();
  for (const s of ['title', 'pause', 'shop', 'over']) $('scr-' + s).hidden = s !== name;
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
  drawMarks(W, H);
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
    // the crosshair rides the aim sway, so what you see is where the arrow goes
    const ppr = (H / 2) / Math.tan(PLAYER.fov * Math.PI / 360), cx = W / 2 - PLAYER.swayX * ppr, cy = H / 2 - PLAYER.swayY * ppr;
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
    drawHookHUD(hx, W / 2, H / 2, W, H);
    // toasts
    hx.font = '700 15px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif';
    GAME.toasts.forEach((t, i) => { hx.globalAlpha = Math.min(1, t.t * 2) * (1 - i * 0.2); hx.fillStyle = t.color; hx.fillText(t.text, W / 2, H / 2 + 78 + i * 20); });
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
// Tracer marks: a neon diamond over every tagged zombie, drawn on the HUD layer so walls never hide it
function drawMarks(W, H) {
  let any = false; for (const z of ZOMBIES) if (z.markT > 0 && !z.dead) { any = true; break; }
  if (!any) return;
  const col = rgbHex(ARROWS[AT.TRACER].color);
  hx.strokeStyle = col; hx.fillStyle = col; hx.lineWidth = 2; hx.textAlign = 'center'; hx.font = '700 11px "Quiver Cn", sans-serif';
  for (const z of ZOMBIES) {
    if (z.dead || z.markT <= 0) continue;
    const p = toScreen(z.x, z.y + 1.25 * z.scale * (z.crawl ? 0.35 : 1), z.z, W, H); if (!p) continue;
    const r = clamp(220 / p[2], 7, 22), a = Math.min(1, z.markT / 0.6);
    hx.globalAlpha = a * (0.65 + 0.35 * Math.sin(GAME.time * 8 + z.seed));
    hx.beginPath(); hx.moveTo(p[0], p[1] - r); hx.lineTo(p[0] + r * 0.7, p[1]); hx.lineTo(p[0], p[1] + r); hx.lineTo(p[0] - r * 0.7, p[1]); hx.closePath(); hx.stroke();
    if (p[2] > 14) { hx.globalAlpha = a * 0.8; hx.fillText(Math.round(p[2]) + ' m', p[0], p[1] - r - 6); }
  }
  hx.globalAlpha = 1;
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
  const drawSlow = BOW.state === 'drawing' && BOW.draw >= 1 ? 0.7 : 1;
  const sens = 0.0022 * SETTINGS.sens * drawSlow;
  P.yaw -= INPUT.dx * sens; P.pitch = clamp(P.pitch - INPUT.dy * sens, -1.45, 1.45);
  BOW.lagX = clamp(BOW.lagX + INPUT.dx * 0.00005, -0.03, 0.03); BOW.lagY = clamp(BOW.lagY - INPUT.dy * 0.00005, -0.03, 0.03);
  BOW.lagX *= Math.max(0, 1 - dt * 8); BOW.lagY *= Math.max(0, 1 - dt * 8);
  INPUT.dx = 0; INPUT.dy = 0;
  // move
  const K = INPUT.keys;
  let fx = 0, fz = 0;
  if (K.KeyW || K.ArrowUp) fz -= 1; if (K.KeyS || K.ArrowDown) fz += 1; if (K.KeyA || K.ArrowLeft) fx -= 1; if (K.KeyD || K.ArrowRight) fx += 1;
  const l = Math.hypot(fx, fz); if (l > 0) { fx /= l; fz /= l; }
  const drawing = BOW.state === 'drawing';
  // crouch (hold C): lower and slower, and with Steady Aim Lv 4 the bow stops swaying
  P.crouch = lerp(P.crouch, K.KeyC && P.grounded && HOOK.state === 'idle' ? 1 : 0, Math.min(1, dt * 10)); P.eyeH = EYE - CROUCH_DROP * P.crouch;
  // sprint stamina: drains while sprinting, refills after a short breather; run it dry and you're winded until 30%
  if (P.winded && P.stam >= P.stamMax * 0.3) P.winded = false;
  const sprint = (K.ShiftLeft || K.ShiftRight) && fz < 0 && !drawing && P.crouch < 0.3 && !P.winded && P.stam > 0;
  if (sprint && l > 0) { P.stam -= dt; P.stamT = 0; if (P.stam <= 0) { P.stam = 0; P.winded = true; } }
  else { P.stamT += dt; if (P.stamT > 0.8) P.stam = Math.min(P.stamMax, P.stam + dt * P.stamMax / 4); }
  const water = P.y < 0.05 ? waterAt(P.x, P.z) : 0; P.wading = water > 0;   // knee-deep in the koi pond, or the Metro's flooded track beds
  P.sink = lerp(P.sink || 0, P.wading ? 0.26 : 0, Math.min(1, dt * 6));
  const spd = 5.4 * P.speedMult * (sprint ? 1.55 : 1) * (drawing ? 0.55 : 1) * (1 - 0.5 * P.crouch) * (water === 1 ? 0.62 : water === 2 ? 0.7 : 1);
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  const wx = (fx * cy + fz * sy) * spd, wz = (-fx * sy + fz * cy) * spd;
  const hooked = updateHook(dt);   // while reeling in, the grapple owns the movement
  if (!hooked) {
    const acc = P.grounded ? 12 : P.fling ? 0.8 : 3;   // flung off the hook: keep the momentum
    P.vx = lerp(P.vx, wx, Math.min(1, acc * dt)); P.vz = lerp(P.vz, wz, Math.min(1, acc * dt));
    P.x += P.vx * dt; P.z += P.vz * dt;
    if (K.Space && P.grounded && P.crouch < 0.3) { P.vy = 6.6; P.grounded = false; }
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
  // aim sway at draw: grows if you hold a full draw too long; Steady Aim scales it down
  { const dk = BOW.state === 'drawing' ? easeOut(BOW.draw) : 0, hold = BOW.hold > 2.2 ? Math.min(1, (BOW.hold - 2.2) / 2) : 0;
    const amp = upLv('aim') >= 4 && P.crouch > 0.8 ? 0 : (0.0045 + 0.007 * hold) * dk * P.swayK * (1 + Math.min(1, hs / 5) * 0.6), t = GAME.time;
    P.swayX = amp * (Math.sin(t * 1.15) * 0.75 + Math.sin(t * 2.7 + 1.3) * 0.25); P.swayY = amp * (Math.sin(t * 1.6 + 2.1) * 0.6 + Math.sin(t * 0.85 + 0.4) * 0.4); }
  BOW.walkAmt = lerp(BOW.walkAmt, P.grounded ? clamp(hs / 5.4, 0, 1.3) : 0, Math.min(1, dt * 8));
  BOW.sprintAmt = lerp(BOW.sprintAmt, sprint && hs > 3 ? 1 : 0, Math.min(1, dt * 6));
  const ph0 = BOW.walkPhase; BOW.walkPhase += dt * hs * 1.6 * (1 + BOW.sprintAmt * 0.35);
  if (P.grounded && hs > 1.5 && Math.floor(ph0 / Math.PI) !== Math.floor(BOW.walkPhase / Math.PI)) AUD.step(0.5 + BOW.sprintAmt * 0.7);   // footsteps
  P.roll = lerp(P.roll, -fx * 0.012 + Math.sin(BOW.walkPhase) * 0.014 * BOW.sprintAmt, Math.min(1, dt * 6));
  P.fov = lerp(P.fov, 78 - (BOW.state === 'drawing' ? easeOut(BOW.draw) * 14 : 0) + BOW.sprintAmt * 6, Math.min(1, dt * 10));
  P.dmgFlash = Math.max(0, P.dmgFlash - dt * 1.4);
  for (let i = P.hurtDirs.length - 1; i >= 0; i--) { P.hurtDirs[i].t -= dt; if (P.hurtDirs[i].t <= 0) P.hurtDirs.splice(i, 1); }
  P.vmIn = Math.min(1, P.vmIn + dt * 2.5);
  // slow regen, on purpose: 6 s after the last hit, 1 HP every 4 s (Slow Regen: down to every 2.5 s)
  P.regen = GAME.state === 'playing' && !P.dead && P.hp < P.maxHp && GAME.time - P.lastHurt > REGEN.delay;
  if (P.regen) P.hp = Math.min(P.maxHp, P.hp + dt / P.regenInt);
  if (GAME.state === 'playing' && !P.dead) updateRecovery();
  if (P.hp / P.maxHp < 0.3) { P.beat -= dt; if (P.beat <= 0) { P.beat = 0.9; AUD.heartbeat(); } }
}

let lastT = performance.now() / 1000, acc = 0;
const camM = M4.create();
function step(dt) {
  GAME.time += dt; STEPN.n++;
  const t = GAME.time;
  AUD.listen(PLAYER.x, PLAYER.y + PLAYER.eyeH, PLAYER.z, PLAYER.yaw);
  if (GAME.state === 'playing') { updatePlayer(dt); updateBow(dt, INPUT); }
  else if (GAME.state === 'over') { PLAYER.deathT += dt; }
  else if (GAME.state === 'title') { updateBow(dt, INPUT); }
  if (GAME.state !== 'paused' && GAME.state !== 'shop') {
    updateZombies(dt, t); if (ZRIG.ready) { syncRigs(); for (const z of ZOMBIES) if (z.state !== 'drop' || z.y < 30) {
      // Animation LOD: full rate close up; progressively lower only where distance and fog hide the difference.
      z._pdt = (z._pdt || 0) + dt;
      const zd2 = (z.x - PLAYER.x) ** 2 + (z.z - PLAYER.z) ** 2, phase = STEPN.n + (z.seed * 10 | 0);
      if (z.rig && z.state === 'dying' && z.dieT > 4 && z.dieT < CORPSE_SETTLE && phase % 12) continue;
      if (z.rig && z.state !== 'dying' && ((zd2 > 8100 && phase % 4) || (zd2 > 2025 && phase % 2))) continue;   // half rate past 45 m, quarter past 90 m
      poseZombieRig(z, z.chill > 0 && z.chillK <= 0 && !z.dead ? 0 : z._pdt, t); z._pdt = 0; } } updateProjectiles(dt); updateArcs(dt); updateZProj(dt); updateFires(dt); updatePickups(dt); updateDebris(dt);
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
const FRAME_ERR = { n: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  now /= 1000; const raw = now - lastT; let dt = Math.min(0.05, raw); lastT = now;
  if (SETTINGS.res !== 'auto') PERF.scale = 1;
  else if (!window.__NQ_CAPTURE && GAME.state === 'playing' && raw < 0.5) {
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
  try {
    if (!GAME.frozen) step(dt);
    // the Armory is an opaque full-screen board, and a lost GPU context can't draw: skip the 3D frame and the HUD
    if (GAME.state !== 'shop' && !GPU.lost) { render(GAME.time); if (GAME.state !== 'title') hudFrame(); drawHUD2D(GAME.time); }
    FRAME_ERR.n = 0;
  } catch (e) {
    // one bad frame is survivable; three in a row means the game is wedged: stop and say so instead of freezing silently
    console.error(e); if (++FRAME_ERR.n >= 3) { GAME.noLoop = true; if (window.NQ_FATAL) window.NQ_FATAL(e); }
  }
  profFrame(performance.now() - c0);
}

/* ---------------- render ---------------- */
function setCamera(time) {
  const P = PLAYER;
  let x = P.x, y = P.y + P.eyeH - (P.sink || 0), z = P.z, yaw = P.yaw, pitch = P.pitch, roll = P.roll;
  if (GAME.state === 'title' || GAME.attract) {
    const a = time * 0.06; x = Math.sin(a) * 19; z = Math.cos(a) * 19; y = 3.2 + Math.sin(time * 0.2) * 0.6; yaw = a + 0.35; pitch = 0.1; roll = 0;
    if (GAME.camOverride) ({ x, y, z, yaw, pitch, roll } = GAME.camOverride);
  } else if (GAME.state === 'over') {
    const k = easeOut(Math.min(1, P.deathT / 1.2)); y = lerp(P.y + 1.62, 0.35, k); roll = k * 1.2; pitch = lerp(P.pitch, 0.3, k);
  }
  const bob = Math.sin(BOW.walkPhase * 2) * 0.03 * BOW.walkAmt * (1 + BOW.sprintAmt);
  const sh = SHAKE.amt * SHAKE.amt * 0.06;
  M4.trs(camM, x + (Math.random() - 0.5) * sh, y + bob + (Math.random() - 0.5) * sh, z, pitch + (Math.random() - 0.5) * sh * 0.5, yaw + (Math.random() - 0.5) * sh * 0.5, roll, 1, 1, 1);
  return [x, y, z];
}
function render(time) {
  // resolution: up to native 4K (Ultra supersamples at 1.5x), times the Resolution setting: Auto scales the pixel
  // count down when frames run slow and back up when they don't; a fixed percentage scales width and height
  const q = SETTINGS.quality, auto = SETTINGS.res === 'auto';
  const budget = 8.3e6 * (auto ? PERF.scale : 1);
  const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
  let dpr = Math.min(2, devicePixelRatio || 1); if (q >= 3) dpr = Math.min(2.25, dpr * 1.5);
  if (cw * ch * dpr * dpr > budget) dpr = Math.sqrt(budget / (cw * ch));
  if (!auto) dpr *= SETTINGS.res / 100;
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
  drawProjectiles(); drawArcs(); drawZProj(); drawPickups(time); drawSupplies(time); drawFires(time); drawObjectives(time); drawHazards(time); drawHook();
  if (GAME.state === 'playing' || GAME.state === 'paused' || GAME.state === 'shop' || (GAME.state === 'over' && PLAYER.deathT < 0.6) || GAME.showBowInTitle) drawBowViewmodel(camM, time, PLAYER);
  render3(time, W, H, fov, cam);
}
/* ---------------- UI wiring ---------------- */
// quality (High / Ultra) and resolution (Auto / fixed %) dropdowns, on the title screen and in the pause menu
function syncQualityUI() {
  for (const id of ['quality', 'quality2']) { const s = $(id); if (s) s.value = String(SETTINGS.quality); }
  for (const id of ['res', 'res2']) { const s = $(id); if (s) s.value = String(SETTINGS.res); }
  for (const id of ['backend', 'backend2']) { const e = $(id); if (!e) continue; e.textContent = BACKEND_NAME(); e.title = NQ_BACKEND === 'webgpu' ? '' : 'WebGPU isn\u2019t available here, so the game draws through WebGL2. ' + ((window.NQ_BOOT && window.NQ_BOOT.why) || ''); }
}
function syncMusicBtn() { const b = $('musicBtn'); if (b) b.textContent = 'Title music: ' + (SETTINGS.music ? 'On' : 'Off'); }
function wireUI() {
  $('playBtn').addEventListener('click', () => { AUD.init(); AUD.setMusic(SETTINGS.music); AUD.click(); ZOMBIES.length = 0; GAME.newGame(); requestLock(); });
  $('resumeBtn').addEventListener('click', () => { AUD.click(); GAME.resume(); });
  $('quitBtn').addEventListener('click', () => { AUD.click(); toTitle(); });
  $('againBtn').addEventListener('click', () => { AUD.click(); ZOMBIES.length = 0; GAME.newGame(); requestLock(); });
  $('menuBtn').addEventListener('click', () => { AUD.click(); toTitle(); });
  armoryWire();
  $('musicBtn').addEventListener('click', () => { AUD.init(); SETTINGS.music = !SETTINGS.music; AUD.setMusic(SETTINGS.music); saveLS('nq_settings', SETTINGS); syncMusicBtn(); });
  for (const [k, b] of VOLS) for (const id of [k, k + '2']) { const s = $(id); s.value = SETTINGS[k];
    s.addEventListener('input', () => { AUD.init(); SETTINGS[k] = +s.value; $(k).value = $(k + '2').value = s.value; AUD.setVolume(b, s.value); saveLS('nq_settings', SETTINGS); });
    if (b === 'sfx' || b === 'master') s.addEventListener('change', () => AUD.thunk()); }   // a sample hit to judge the level by
  for (const id of ['sens', 'sens2']) { const s = $(id); s.value = SETTINGS.sens; s.addEventListener('input', () => { SETTINGS.sens = +s.value; $('sens').value = $('sens2').value = s.value; saveLS('nq_settings', SETTINGS); }); }
  for (const id of ['look', 'look2']) { const s = $(id); s.innerHTML = THEME_ORDER.map(k => `<option value="${k}">${THEMES[k].name}</option>`).join(''); s.value = SETTINGS.look; s.addEventListener('change', () => { SETTINGS.look = s.value; setTheme(s.value); $('look').value = $('look2').value = s.value; saveLS('nq_settings', SETTINGS); }); }
  for (const id of ['quality', 'quality2']) { const s = $(id); s.addEventListener('change', () => { SETTINGS.quality = +s.value === 3 ? 3 : 2; saveLS('nq_settings', SETTINGS); syncQualityUI(); }); }
  for (const id of ['res', 'res2']) { const s = $(id); s.addEventListener('change', () => { SETTINGS.res = s.value === 'auto' ? 'auto' : +s.value; PERF.scale = 1; PERF.acc = 0; PERF.n = 0; saveLS('nq_settings', SETTINGS); syncQualityUI(); }); }
  syncQualityUI();
  syncMusicBtn();
  addEventListener('resize', () => { if (GAME.state === 'title') drawLogo($('logo'), 'NEON QUIVER', '#ff2e88', true, true); });
}
function toTitle() {
  GAME.state = 'title'; ZOMBIES.length = 0; DECALS.length = 0; DEBRIS.length = 0; PROJ.length = 0; ZPROJ.length = 0; PICKUPS.length = 0; FIRES.length = 0; GAME.boss = null; $('bossbar').hidden = true; hazReset();
  for (let i = 0; i < 9; i++) { const zz = spawnZombie(pick(['walker', 'walker', 'walker', 'runner', 'brute']), rand(-30, 30), rand(-30, 30), 1); zz.speed *= 0.5; }
  setScreen('title'); updateTitleStats(); drawLogo($('logo'), 'NEON QUIVER', '#ff2e88', true, true); AUD.intensity = 0.35; AUD.setMusicScreen(true);
}
function updateTitleStats() { $('bestScore').textContent = GAME.best ? GAME.best.toLocaleString() : '—'; $('bestWave').textContent = GAME.bestWave || '—'; }

/* ---------------- GPU check: software-rendering warning ---------------- */
function gpuName() {
  try {
    if (NQ_BACKEND === 'webgpu') { const i = renderer.backend.device.adapterInfo || {}; return [i.vendor, i.architecture, i.description].filter(Boolean).join(' '); }
    const gl = renderer.backend.gl, ext = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
  } catch (e) { return ''; }
}
function gpuCheck() {
  const g = gpuName(), q = new URLSearchParams(location.search);
  const soft = /swiftshader|llvmpipe|softpipe|microsoft basic render|software/i.test(g);
  if (soft && !q.has('nowarn') && !window.__NQ_CAPTURE) { $('swWarn').hidden = false; $('swWarnX').addEventListener('click', () => { $('swWarn').hidden = true; }); }
  GPU.name = g; GPU.soft = soft;
}
// renderer.onDeviceLost (engine.js), on either backend: before the game is up that's a fatal error; mid-game, pause and
// explain. A lost device doesn't come back by itself, so the way on is a reload.
function gpuDeviceLost(info) {
  const why = 'Device lost' + (info && info.message ? ': ' + info.message : '') + (info && info.reason ? ' (' + info.reason + ')' : '');
  if (!window.NQ_READY) { if (window.NQ_FATAL) window.NQ_FATAL(new Error(why)); return; }
  GPU.lost = true; if (GAME.state === 'playing') GAME.pause();
  if (window.NQ_SYS) window.NQ_SYS.show('GRAPHICS', 'Graphics were reset', 'Your browser reset the graphics card, which can happen after sleep or when the GPU is busy. Reload to pick up again: your best score is saved.', why);
}
const GPU = { name: '', soft: false, lost: false };

/* ---------------- boot ---------------- */
async function boot() {
  try { await Promise.race([Promise.all([document.fonts.load('700 40px "Quiver Cn"'), document.fonts.load('400 40px "Quiver Cn"')]), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  await loadModels(); makeDecalTextures();
  buildCity(); buildWorldSpatialIndex(); buildNav(); buildWorld3();
  await Promise.all([
    loadZombieRig(window.__NQ_RIG_URL || 'models/zombie.glb?v=' + (typeof RIG_VER === 'string' ? RIG_VER : '0')),
    loadHeroSakuras(),
    loadMeshyCars(),
  ]);
  await loadMeshyZombies(t => t.startsWith('walker'));   // after the rig: the Meshy breeds borrow its clips. Walkers first (the title crowd),
  loadMeshyZombies().then(() => { window.NQ_MZ_READY = true; });   // the other breeds stream in behind; until theirs lands a body uses the sculpt
  gpuCheck();
  wireUI();
  // the Armory's faces are only used on that screen: fetch them in the background so it never opens in a fallback font
  try { for (const f of ['400 20px "Chakra Petch"', '500 20px "Chakra Petch"', '600 20px "Chakra Petch"', '700 20px "Chakra Petch"', '400 20px "IBM Plex Mono"', '500 20px "IBM Plex Mono"', '600 20px "IBM Plex Mono"']) document.fonts.load(f).catch(() => { }); } catch (e) { }
  toTitle();
  if (new URLSearchParams(location.search).has('tree')) { GAME.newGame(); PLAYER.x = -18; PLAYER.z = 166; PLAYER.yaw = -2.2; PLAYER.pitch = 0.02; }
  render(GAME.time); warmShaders();   // build the post chain, then compile everything before the first real frame
  $('loading').hidden = true;
  requestAnimationFrame(frame);
  window.NQ_READY = true;
}
/* ---------------- capture / debug API (used to render ad assets) ---------------- */
window.NQ = {
  DBG, GAME, THREE, scene, renderer, camera, vmCamera, WORLD_ITEMS, GPU, gpuCheck, R3, warmShaders, nqMaterial, backend: () => NQ_BACKEND, ZRIG, MZ, WORLD, NAV, PLAYER, BOW, ZOMBIES, PROJ, ZPROJ, PICKUPS, emit, burst, explode, flashLight, spawnZombie, setScreen, step, drawLogo, segText, HUDVIS, SETTINGS,
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
  bowStartDraw, bowRelease, fireArrow, selectArrow, selectSlot, camBasis, PERF, ARMORY, LOADOUT, UPG, AQ, armoryBuy, armoryPick, armoryPickTab, armoryToggleEquip, armoryRender, updateQuiverHUD, upLv, RECQ, ARCS,
  freeze(b) { GAME.frozen = b; },
  run(n, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt); },
  pose(o) { Object.assign(PLAYER, o); },
  occMap() { return NQU.uOcc.value; },
  bow(state, draw, type) { Object.assign(BOW, { state, draw, type, nextType: -1, t: 0, hold: 0 }); },
  GPOST, TEXN, NQP, NQN, GPU_PROF, TSL: THREE.TSL, buildPostGPU, BLACK_TEX: () => BLACK_TEX,
  clear() { ZOMBIES.length = 0; PROJ.length = 0; ZPROJ.length = 0; PICKUPS.length = 0; },
  shootAt(x, y, z, type = 0, power = 1) { const d = [x - PLAYER.x, y - (PLAYER.y + PLAYER.eyeH), z - PLAYER.z]; const L = Math.hypot(...d); const spd = (40 + 64 * power) * ARROWS[type].speed; PROJ.push({ x: PLAYER.x + d[0] / L * 2, y: PLAYER.y + 1.5 + d[1] / L * 2, z: PLAYER.z + d[2] / L * 2, vx: d[0] / L * spd, vy: d[1] / L * spd, vz: d[2] / L * spd, type, power, pierce: 5, hits: [], age: 0, stuck: false, stuckT: 0, dir: [d[0] / L, d[1] / L, d[2] / L] }); },
};
boot();
