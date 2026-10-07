/* ============================================================
   The infected: walkers, runners, brutes and the Warden
   Sculpted in Blender (tools/make_models.py), animated procedurally here.
   ============================================================ */
const ZTYPES = {
  walker: { hp: 60, hpW: 10, speed: [1.5, 2.3], dmg: 10, scale: 1, score: 100, scrap: 7, eyes: [1, 0.55, 0.12], reach: 1.35, atk: 0.85 },
  runner: { hp: 34, hpW: 5, speed: [4.9, 5.9], dmg: 7, scale: 0.94, score: 150, scrap: 9, eyes: [0.35, 1, 0.2], reach: 1.3, atk: 0.6 },
  brute: { hp: 300, hpW: 34, speed: [1.25, 1.55], dmg: 24, scale: 1.55, score: 450, scrap: 22, eyes: [1, 0.1, 0.25], reach: 2.0, atk: 1.1 },
  boss: { hp: 2000, hpW: 0, speed: [2.2, 2.2], dmg: 34, scale: 3.1, score: 6000, scrap: 150, eyes: [1, 0.2, 0.9], reach: 3.6, atk: 1.2 },
  // spitter: hangs back and lobs acid; screamer: hangs back and buffs the pack; climber: fast, scales a wall and pounces
  spitter: { hp: 42, hpW: 6, speed: [1.3, 1.7], dmg: 6, scale: 0.96, score: 180, scrap: 10, eyes: [0.25, 1, 0.35], reach: 1.3, atk: 0.85 },
  screamer: { hp: 48, hpW: 6, speed: [1.7, 2.1], dmg: 6, scale: 1, score: 200, scrap: 11, eyes: [0.85, 0.25, 1], reach: 1.3, atk: 0.85 },
  climber: { hp: 38, hpW: 5, speed: [3.4, 4.2], dmg: 16, scale: 0.92, score: 220, scrap: 11, eyes: [0.6, 1, 0.15], reach: 1.4, atk: 0.6 },
};
// how long a corpse holds before it starts sinking, and before it's finally removed (blood pools use DECAL_LIFE/DECAL_CAP in fx.js)
const CORPSE_SETTLE = 14, CORPSE_LIFE = 24, CORPSE_CAP = 26;
// dead skin across every complexion: pallid, ashen, olive, brown, deep brown, sallow, livid, jaundiced
const SKINS = [[0.36, 0.3, 0.25], [0.31, 0.29, 0.27], [0.25, 0.19, 0.14], [0.15, 0.095, 0.07], [0.085, 0.055, 0.042], [0.29, 0.28, 0.2], [0.27, 0.2, 0.24], [0.33, 0.27, 0.16]];
// what they were wearing when it happened: [top, trousers]
const JEANS = [0.12, 0.16, 0.26], BLACK = [0.05, 0.05, 0.06], KHAKI = [0.32, 0.28, 0.2];
const OUTFITS = {
  walker: [[[0.42, 0.42, 0.4], BLACK], [[0.18, 0.25, 0.38], JEANS], [[0.2, 0.2, 0.21], JEANS], [[0.28, 0.06, 0.07], KHAKI], [[0.17, 0.19, 0.12], BLACK], [[0.12, 0.3, 0.3], [0.12, 0.3, 0.3]],
    [[0.05, 0.07, 0.14], [0.05, 0.06, 0.1]], [[0.38, 0.16, 0.04], [0.14, 0.14, 0.16]], [[0.2, 0.11, 0.06], JEANS], [[0.04, 0.04, 0.045], [0.18, 0.18, 0.2]], [[0.35, 0.07, 0.06], JEANS], [[0.4, 0.34, 0.24], BLACK]],
  runner: [[BLACK, BLACK], [[0.45, 0.08, 0.06], [0.1, 0.1, 0.1]], [[0.14, 0.2, 0.3], [0.14, 0.14, 0.15]], [[0.3, 0.3, 0.28], BLACK], [[0.1, 0.25, 0.12], [0.08, 0.08, 0.09]], [[0.5, 0.5, 0.48], JEANS]],
  brute: [[[0.05, 0.07, 0.14], [0.05, 0.06, 0.1]], [[0.06, 0.06, 0.07], [0.06, 0.06, 0.07]]],
  boss: [[[0.14, 0.15, 0.2], [0.1, 0.11, 0.16]]],
};
OUTFITS.spitter = OUTFITS.walker; OUTFITS.screamer = OUTFITS.walker; OUTFITS.climber = OUTFITS.runner;
const HAIRS = [[0.06, 0.05, 0.04], [0.16, 0.1, 0.06], [0.3, 0.27, 0.22], [0.05, 0.05, 0.06], [0.42, 0.35, 0.22], [0.34, 0.34, 0.33]];
const ZOMBIES = [];
const STEPN = { n: 0 };
// numeric cell keys (i * 2^21 + j, unique for any |j| < 2^20 cells) instead of 'i,j' strings: no string building per
// lookup. Cell arrays are reused between frames; a cell that empties stays in the map as an empty list (same query results).
const ZGRID = { cell: 4, map: new Map(), out: [], used: [] };
const zCellKey = (i, j) => i * 2097152 + j;
function rebuildZombieGrid() {
  const S = ZGRID.cell, map = ZGRID.map, used = ZGRID.used;
  for (let u = 0; u < used.length; u++) used[u].length = 0;
  used.length = 0;
  if (map.size > 4096) map.clear();   // forget stale cells now and then
  for (const z of ZOMBIES) { const k = zCellKey(Math.floor(z.x / S), Math.floor(z.z / S)); let a = map.get(k); if (!a) map.set(k, a = []); if (!a.length) used.push(a); a.push(z); }
}
function zombieCandidates(x0, x1, z0, z1) {
  const out = ZGRID.out; out.length = 0; const S = ZGRID.cell, map = ZGRID.map;
  const i0 = Math.floor(x0 / S), i1 = Math.floor(x1 / S), j1 = Math.floor(z1 / S);
  for (let j = Math.floor(z0 / S); j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = map.get(zCellKey(i, j)); if (a) for (let n = 0; n < a.length; n++) out.push(a[n]); }
  return out;
}
function ensurePose(z) { if (z._ps !== STEPN.n) { if (ZRIG.ready) poseZombieRig(z, 0, GAME.time); else drawZombieFramesOnly(z); } }
let groanCd = 0;
const V0 = () => [0, 0, 0];

function spawnZombie(type, x, z, wave) {
  const T = ZTYPES[type];
  // difficulty keeps climbing past wave 10: extra HP %, harder hits, faster feet (the Warden scales per encounter instead)
  const late = Math.max(0, wave - 10);
  const hp = (T.hp + T.hpW * Math.max(0, wave - 1)) * (type === 'boss' ? 1 + Math.max(0, GAME.bossCount - 1) * 0.7 : 1 + late * 0.03);
  const dmgK = type === 'boss' ? 1 + Math.max(0, GAME.bossCount - 1) * 0.15 : 1 + Math.min(0.9, Math.max(0, wave - 1) * 0.035);
  const zz = {
    type, T, x, y: 0, z, yaw: Math.atan2(-x, -z), hp, maxHp: hp, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(0.5, wave * 0.022)), dmgK, elite: false, eyes: null, scale: T.scale * rand(0.95, 1.06),
    phase: Math.random() * TAU, state: 'walk', atkT: 0, atkCd: 0.5, flinch: 0, flash: 0, burn: 0, dieT: 0, dead: false,
    skin: pick(SKINS), ...(() => { const o = pick(OUTFITS[type]); return { cloth: o[0], pants: o[1] }; })(), hair: pick(HAIRS), seed: Math.random() * 100, side: Math.random() < 0.5 ? -1 : 1,
    bare: false, sleeve: Math.random() < 0.55, headVar: pick(['a', 'a', 'b', 'b', 'c', 'd']), top: 'shirt', gait: 'walk', idleClip: Math.random() < 0.5 ? 'idle' : 'idle_b',
    look: 0, lookP: 0, twT: rand(2, 8), breath: rand(0.8, 1.3),
    chill: 0, chillK: 0.3, stun: 0, markT: 0, quiver: 0, toks: null, pin: 0, tetherTo: null, stuck: [], headless: false, jawGone: false, helmetGone: false, lastX: x, lastZ: z, stuckT: 0, hpBarT: 0, groan: rand(1, 6),
    slamCd: 4, summonCd: 10, roarT: 0, jaw: 0, vx: 0, vz: 0,
    // spitter/screamer/climber state
    spitCd: rand(2.5, 4.5), screamCd: rand(5, 9), buffT: 0, climbState: 'ground', climbCd: rand(3, 6), climbT: 0, perchT: 0, pounceT: 0,
    // hit reactions (damped springs): head pitch, torso pitch, torso yaw, leg buckle
    R: { h: 0, hv: 0, t: 0, tv: 0, y: 0, yv: 0, l: 0, lv: 0 }, stumble: 0, legDmg: 0, crawl: false, crawlT: 0,
    // death physics
    dv: V0(), pitch: 0, pitchV: 0, roll: 0, rollV: 0, crumple: 0, crumpleMode: false, neckBleed: 0, fallBack: false,
    head: V0(), a: V0(), b: V0(), core: V0(), hipL: V0(), knL: V0(), ftL: V0(), hipR: V0(), knR: V0(), ftR: V0(),
  };
  // what each body looks like and how it moves: clothes, build, gait
  const r = Math.random();
  if (type === 'walker') {
    zz.top = r < 0.45 ? 'bare' : r < 0.65 ? 'lean' : r < 0.8 ? 'jacket' : r < 0.9 ? 'bloat' : 'shirt';
    const g = Math.random(); zz.gait = g < 0.45 ? 'walk' : g < 0.7 ? 'walk_b' : 'walk_c';
    if (zz.gait === 'walk_b') zz.speed *= 0.8;
  } else if (type === 'runner') {
    zz.top = r < 0.4 ? 'lean' : r < 0.65 ? 'bare' : 'shirt'; zz.gait = Math.random() < 0.6 ? 'run' : 'run_b';
    if (zz.headVar === 'c' && Math.random() < 0.5) zz.headVar = 'a';
  } else if (type === 'brute') { zz.top = 'shirt'; zz.headVar = Math.random() < 0.5 ? 'a' : 'b'; }
  else if (type === 'spitter') { zz.top = r < 0.5 ? 'shirt' : r < 0.8 ? 'jacket' : 'bloat'; zz.gait = 'walk'; }
  else if (type === 'screamer') { zz.top = r < 0.4 ? 'lean' : r < 0.75 ? 'bare' : 'shirt'; zz.gait = 'walk'; }
  else if (type === 'climber') { zz.top = r < 0.55 ? 'lean' : 'bare'; zz.gait = 'run'; }
  zz.bare = zz.top === 'bare' || zz.top === 'lean';
  if (zz.headVar === 'c') zz.hair = pick([HAIRS[0], HAIRS[1], HAIRS[3], HAIRS[4]]);   // long hair reads as hair, not a grey cap
  if (type === 'boss') { zz.y = 40; zz.state = 'drop'; zz.bare = true; zz.top = 'bare'; zz.headVar = 'a'; }
  ZOMBIES.push(zz);
  return zz;
}

/* -------- collision helpers -------- */
function pushOutCircle(o, rad) {
  const [boxes, circles] = worldCandidates(o.x - rad - 0.5, o.x + rad + 0.5, o.z - rad - 0.5, o.z + rad + 0.5);
  for (const b of boxes) {
    if (o.y > b.y1 - 0.02) continue;   // standing on top of it
    if ((o.grounded || o.T) && b.y1 - (o.y || 0) < (o.T ? 0.45 : 0.33)) continue;   // a step you can walk up (zombies wade over low ones)
    if (b.y0 > o.y + 2.2) continue;     // overhead (upper floors above a walk-in shop, the manor roof)
    const cx = clamp(o.x, b.x0, b.x1), cz = clamp(o.z, b.z0, b.z1);
    const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < rad * rad) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (rad - d) / d; o.x += dx * k; o.z += dz * k; }
      else { // inside: push to nearest face
        const l = o.x - b.x0, r = b.x1 - o.x, f = o.z - b.z0, bk = b.z1 - o.z; const m = Math.min(l, r, f, bk);
        if (m === l) o.x = b.x0 - rad; else if (m === r) o.x = b.x1 + rad; else if (m === f) o.z = b.z0 - rad; else o.z = b.z1 + rad;
      }
    }
  }
  for (const c of circles) {
    if (o.y > c.h - 0.02) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d2 = dx * dx + dz * dz, R = rad + c.r;
    if (d2 < R * R && d2 > 1e-8) { const d = Math.sqrt(d2), k = (R - d) / d; o.x += dx * k; o.z += dz * k; }
  }
}
// closest-point distance² between segments p1-q1 and p2-q2
function segSegDist2(p1, q1, p2, q2, out) {
  const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2], d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
  const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else { const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else { const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b; s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); } } }
  const cx = p1[0] + d1x * s - (p2[0] + d2x * t), cy = p1[1] + d1y * s - (p2[1] + d2y * t), cz = p1[2] + d1z * s - (p2[2] + d2z * t);
  if (out) { out.s = s; }
  return cx * cx + cy * cy + cz * cz;
}
function segPointDist2(p, q, c, out) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2]; const L = dx * dx + dy * dy + dz * dz;
  let t = L > 0 ? ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy + (c[2] - p[2]) * dz) / L : 0; t = clamp(t, 0, 1);
  const x = p[0] + dx * t - c[0], y = p[1] + dy * t - c[1], z = p[2] + dz * t - c[2]; if (out) out.s = t; return x * x + y * y + z * z;
}

/* -------- damage & reactions -------- */
function damageZombie(z, dmg, part, hitPos, dir, arrowType, power = 1, explosive = false) {
  if (z.dead) return false;
  z.hp -= dmg; z.flash = 0.1; z.hpBarT = 2.5;
  const k = z.type === 'boss' ? 0.18 : z.type === 'brute' ? 0.5 : 1, R = z.R;
  z.flinch = Math.min(1, z.flinch + 0.5 * k);
  if (part === 'head') { R.hv -= (7 + 6 * power) * k; R.tv -= 2 * k; }
  else if (part === 'legs') { R.lv += (5 + 3 * power) * k; z.stumble = Math.max(z.stumble, 0.7 * k); z.legDmg += dmg; }
  else if (dir || hitPos) {
    R.tv -= (3.5 + 3 * power) * k;
    if (hitPos) { const rx = Math.cos(z.yaw), rz = -Math.sin(z.yaw); const side = Math.sign((hitPos[0] - z.x) * rx + (hitPos[2] - z.z) * rz) || 1; R.yv -= side * (6 + 4 * power) * k; }
  }
  if (dir && z.type !== 'boss') { const kb = z.type === 'brute' ? 0.15 : 0.45; z.vx += dir[0] * kb * 6 * power; z.vz += dir[2] * kb * 6 * power; }
  if (hitPos && dmg > 3) bloodBurst(hitPos[0], hitPos[1], hitPos[2], dir, part === 'head' ? 26 : 14, 1, z.type === 'boss' ? 2 : 1);
  // enough damage to the legs drops walkers and runners to a crawl
  if (!z.crawl && part === 'legs' && (z.type === 'walker' || z.type === 'runner') && z.legDmg >= 0.4 * z.maxHp && z.hp > 0) {
    z.crawl = true; z.crawlT = 0; z.state = 'walk'; z.speed *= 0.34; bloodBurst(z.hipL[0], 0.5, z.hipL[2], null, 16);
  }
  if (z.hp <= 0) { killZombie(z, part, dir, arrowType, hitPos, power, explosive); return true; }
  return false;
}
function killZombie(z, part, dir, arrowType, hitPos, power = 1, explosive = false) {
  z.dead = true; z.state = 'dying'; z.dieT = 0; z.burn = Math.min(z.burn, 1.5);
  const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw);
  const along = dir ? dir[0] * fx + dir[2] * fz : -1;          // >0: shot from behind -> falls forward
  const force = explosive ? rand(6, 9) : 1.6 + 2.8 * power;
  z.fallBack = along < 0;
  // head trauma
  if (part === 'head' && z.type !== 'boss') {
    if (z.type === 'brute' && !z.helmetGone) { z.helmetGone = true; spawnDebris(MODEL.brute_helmet, z.head, [(dir ? dir[0] : 0) * 5, 3.5, (dir ? dir[2] : 0) * 5], z.scale, [0.2, 0.19, 0.22], [0.1, 0.1, 0.12], [2.4, 0.2, 0.5]); }
    else if (Math.random() < 0.5) { z.jawGone = true; spawnDebris(MODEL.jaw, z.head, [(dir ? dir[0] : 0) * 3 + rand(-1, 1), 2.5, (dir ? dir[2] : 0) * 3 + rand(-1, 1)], z.scale, z.skin, z.skin, null); bloodBurst(z.head[0], z.head[1] - 0.08, z.head[2], dir, 30, 1.2); }
    else { z.headless = true; z.neckBleed = 1.6; bloodBurst(z.head[0], z.head[1], z.head[2], dir, 60, 1.6, 1.3); }
  }
  // pinned to a wall: a strong arrow that exits into geometry close behind the target
  if (!explosive && arrowType !== 2 && power > 0.75 && dir && hitPos && !z.crawl && (z.type === 'walker' || z.type === 'runner')) {
    const t = rayWorld(hitPos[0], hitPos[1], hitPos[2], dir[0], 0, dir[2], 1.7);
    if (t !== null) { z.wallPin = { x: z.x + dir[0] * (t - 0.28), z: z.z + dir[2] * (t - 0.28), t: 0, yaw: Math.atan2(-dir[0], -dir[2]) }; }
  }
  if (!z.wallPin) {
    const d = dir || [-fx, 0, -fz];
    z.dv = [d[0] * force * (z.type === 'brute' ? 0.5 : 1), explosive ? rand(3, 5) : 0.2, d[2] * force * (z.type === 'brute' ? 0.5 : 1)];
    if (z.type === 'boss') z.dv = [0, 0, 0];
    z.crumpleMode = !z.crawl && !explosive && (force < 3.2 || z.burn > 0) && Math.random() < 0.6;
    const sgn = along >= 0 ? 1 : -1;
    z.pitchSign = z.crumpleMode ? (Math.random() < 0.6 ? 1 : -1) : sgn;
    z.pitchV = z.crumpleMode ? 0 : z.pitchSign * (force * (explosive ? 1.1 : 0.55));
    z.rollV = rand(-1, 1) * (explosive ? 3 : 0.8); z.rollT = rand(-0.35, 0.35);
  }
  GAME.onKill(z, part, arrowType);
}
function updateReact(z, dt) {
  const R = z.R, K = 110, C = 13;
  R.hv += (-K * R.h - C * R.hv) * dt; R.h += R.hv * dt;
  R.tv += (-K * R.t - C * R.tv) * dt; R.t += R.tv * dt;
  R.yv += (-K * R.y - C * R.yv) * dt; R.y += R.yv * dt;
  R.lv += (-60 * R.l - 10 * R.lv) * dt; R.l += R.lv * dt;
  R.h = clamp(R.h, -1.2, 0.6); R.t = clamp(R.t, -0.8, 0.5); R.y = clamp(R.y, -0.9, 0.9); R.l = clamp(R.l, 0, 1);
}
function updateDying(z, dt) {
  z.dieT += dt;
  if (z.neckBleed > 0) { z.neckBleed -= dt; if (Math.random() < dt * 30) { const p = emit(z.head[0], z.head[1] - 0.1, z.head[2], rand(-0.6, 0.6), rand(1, 2.4), rand(-0.6, 0.6), 0.8, [0.3, 0.02, 0.02], -rand(0.03, 0.06), 9.8, 0.4); p.blood = true; } }
  if (z.wallPin) {
    const P = z.wallPin; P.t += dt;
    const k = Math.min(1, dt * 18); z.x = lerp(z.x, P.x, k); z.z = lerp(z.z, P.z, k);
    let dy = ((P.yaw - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI; z.yaw += dy * Math.min(1, dt * 10);
    if (z.dieT > CORPSE_SETTLE) z.y -= dt * 0.5;
    return;
  }
  if (z.crawl) { z.pitch = 0; if (z.dieT > CORPSE_SETTLE) z.y -= dt * 0.5; return; }
  // translate with the hit's momentum, slide to a stop on the ground
  z.x += z.dv[0] * dt; z.z += z.dv[2] * dt; z.y += z.dv[1] * dt;
  const fl = z.floor || 0;
  if (z.y > fl + 0.001) z.dv[1] -= 12 * dt; else { z.y = Math.max(z.y, z.dieT > 3.4 ? z.y : fl); z.dv[1] = Math.max(0, z.dv[1]); const f = Math.max(0, 1 - 5 * dt); z.dv[0] *= f; z.dv[2] *= f; }
  pushOutCircle(z, 0.28 * z.scale);
  // crumple: knees give first, then the body tips over
  if (z.crumpleMode && z.crumple < 1) { z.crumple = Math.min(1, z.crumple + dt * 2.6); if (z.crumple > 0.7 && z.pitchV === 0) z.pitchV = z.pitchSign * 0.6; }
  const lim = 1.5;
  if (Math.abs(z.pitch) < lim || z.y > fl + 0.05) {
    z.pitchV += z.pitchSign * (4 + 9 * Math.abs(Math.sin(z.pitch))) * dt * (z.crumpleMode && z.crumple < 0.7 ? 0 : 1);
    z.pitch += z.pitchV * dt;
    if (Math.abs(z.pitch) >= lim && z.y <= fl + 0.05) { z.pitch = lim * Math.sign(z.pitch); z.pitchV = -z.pitchV * 0.18; if (Math.abs(z.pitchV) > 0.8) { shakeNear(z, 0.08); bloodBurst(z.x, fl + 0.1, z.z, null, 6, 0.6); } else z.pitchV = 0; }
  }
  z.roll = clamp(z.roll + z.rollV * dt, -0.6, 0.6); z.rollV *= Math.max(0, 1 - 3 * dt);
  if (z.dieT > CORPSE_SETTLE) z.y -= dt * 0.55;
}
function shakeNear(z, a) { const d = Math.hypot(z.x - PLAYER.x, z.z - PLAYER.z); if (d < 10) shake(a * (1 - d / 10)); }

/* -------- update -------- */
function updateZombies(dt, time) {
  const P = PLAYER;
  groanCd -= dt;
  rebuildZombieGrid();
  // corpse cap: if too many bodies are lying around, retire the oldest one (past its death flail) a little early
  let deadN = 0; for (const zz of ZOMBIES) if (zz.dead) deadN++;
  if (deadN > CORPSE_CAP) {
    let oldestIdx = -1, oldestT = -1;
    for (let j = 0; j < ZOMBIES.length; j++) { const zz = ZOMBIES[j]; if (zz.dead && zz.dieT > 2 && zz.dieT > oldestT) { oldestT = zz.dieT; oldestIdx = j; } }
    if (oldestIdx >= 0) ZOMBIES.splice(oldestIdx, 1);
  }
  for (let i = ZOMBIES.length - 1; i >= 0; i--) {
    const z = ZOMBIES[i];
    z.flash = Math.max(0, z.flash - dt); z.flinch = Math.max(0, z.flinch - dt * 3); z.hpBarT = Math.max(0, z.hpBarT - dt); z.stumble = Math.max(0, z.stumble - dt);
    z.buffT = Math.max(0, (z.buffT || 0) - dt);
    updateReact(z, dt);
    z.chill = Math.max(0, z.chill - dt); z.stun = Math.max(0, z.stun - dt); z.markT = Math.max(0, z.markT - dt); z.pin = Math.max(0, z.pin - dt); if (z.pin <= 0) z.tetherTo = null;
    // stand on low things they walk over (the Metro's island platform, steps, kerbs) instead of wading through them
    if (z.state !== 'drop' && z.climbState === 'ground') { const fy = z.floor = groundAt(z.x, z.z, (z.dead ? z.floor || 0 : z.y) + 0.15, 0.2 * z.scale);
      if (!z.dead) z.y = fy > z.y ? Math.min(fy, z.y + dt * 3) : Math.max(fy, z.y - dt * 5); }
    { const wet = z.y < 0.05 && waterAt(z.x, z.z) > 0; z.wade = wet && !z.dead ? 0.7 : 1;   // wading slows them; the rig sinks to the knees (bodies slip under)
      z.sink = lerp(z.sink || 0, wet ? (z.dead ? 0.5 : z.crawl ? 0.08 : 0.3) : 0, Math.min(1, dt * (z.dead ? 0.6 : 5))); }
    if (z.chill > 0 && !z.dead && Math.random() < dt * 14) emit(z.x + rand(-0.3, 0.3) * z.scale, z.y + rand(0.2, 1.7) * z.scale, z.z + rand(-0.3, 0.3) * z.scale, rand(-0.2, 0.2), rand(-0.4, 0.1), rand(-0.2, 0.2), rand(0.4, 0.8), [0.8, 1.6, 2.4], rand(0.04, 0.09), 0.3, 1, 0.2);
    if (z.burn > 0) {
      z.burn -= dt;
      if (!z.dead) damageZombie(z, 14 * PLAYER.dmgMult * dt * (z.type === 'boss' ? 2 : 1), 'body', null, null, 1);
      if (Math.random() < dt * 40) emit(z.x + rand(-0.3, 0.3) * z.scale, z.y + rand(0.3, 1.7) * z.scale * (z.crawl ? 0.3 : 1), z.z + rand(-0.3, 0.3) * z.scale, rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(0.3, 0.6), [2.4, 0.9 + Math.random() * 0.5, 0.15], rand(0.18, 0.35) * z.scale, -1, 1, -0.3);
    }
    if (z.state === 'dying') {
      updateDying(z, dt);
      if (z.dieT > CORPSE_LIFE) ZOMBIES.splice(i, 1);
      continue;
    }
    if (z.type === 'spitter') { updateSpitter(z, dt, P); continue; }
    if (z.type === 'screamer') { updateScreamer(z, dt, P); continue; }
    if (z.type === 'climber') { updateClimber(z, dt, P); continue; }
    if (z.state === 'drop') { // boss falls from the sky
      z.vy = (z.vy || 0) - 40 * dt; z.y += z.vy * dt;
      if (z.y <= 0) { z.y = 0; z.state = 'roar'; z.roarT = 0; shake(1.2); AUD.slam(); AUD.roar(); flashLight(z.x, 2, z.z, [4, 1, 3], 30, 0.6);
        for (let k = 0; k < 90; k++) { const a = k / 90 * TAU; emit(z.x + Math.cos(a) * 2, 0.3, z.z + Math.sin(a) * 2, Math.cos(a) * 16, rand(0.5, 2), Math.sin(a) * 16, 0.8, [2.5, 0.5, 2.2], 0.5, 2, 2.5); }
        burst(z.x, 0.5, z.z, 60, [0.6, 0.5, 0.7], 8, 1.4, 0.8, 4, 1.5, 3);
      }
      continue;
    }
    if (z.crawl) z.crawlT += dt;
    // --- steering
    let tx = P.x, tz = P.z;
    if (GAME.state === 'title') { if (!z.wt || Math.hypot(z.wt[0] - z.x, z.wt[1] - z.z) < 2) z.wt = [rand(-30, 30), rand(-30, 30)]; tx = z.wt[0]; tz = z.wt[1]; }
    const dist = Math.hypot(tx - z.x, tz - z.z) || 1e-3;
    // around corners the flow field (world.js) leads; in the open, head straight for the player
    if (GAME.state !== 'title' && NAV.ready && dist > 4.5 && navTarget(z.x, z.z, _nc)) { tx = _nc[0]; tz = _nc[1]; }
    const want = Math.atan2(tx - z.x, tz - z.z);
    let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const turn = z.crawl ? 1.8 : z.type === 'runner' ? 7 : z.type === 'boss' ? 1.6 : 3.2;
    z.yaw += clamp(dyaw, -turn * dt, turn * dt);
    const reach = z.crawl ? 1.25 : z.T.reach * (z.type === 'boss' ? 1 : z.scale) + 0.35;
    const slow = z.state === 'attack' || z.state === 'slam' || z.state === 'roar' ? 0 : 1;
    let spd = z.speed * slow * zSlowK(z) * z.wade * (z.pin > 0 ? 0 : 1) * (z.burn > 0 ? 1.08 : 1) * (1 - z.flinch * 0.6) * (z.stumble > 0 ? 0.35 : 1) * (z.buffT > 0 ? 1.22 : 1);
    if (z.crawl) spd *= z.crawlT < 0.8 ? 0 : (0.6 + 0.4 * Math.max(0, Math.sin(z.phase)));  // lurching pulls
    if (dist < reach * 0.8) spd = 0;
    z.mv = spd;
    let mx = Math.sin(z.yaw) * spd, mz = Math.cos(z.yaw) * spd;
    if (z.stuckT > 0.5) { mx += Math.cos(z.yaw) * z.side * spd * 0.9; mz -= Math.sin(z.yaw) * z.side * spd * 0.9; }
    if (z.pin > 0) { z.vx = 0; z.vz = 0; }
    z.x += (mx + z.vx) * dt; z.z += (mz + z.vz) * dt; z.vx *= Math.max(0, 1 - 6 * dt); z.vz *= Math.max(0, 1 - 6 * dt);
    for (const o of zombieCandidates(z.x - 2.2, z.x + 2.2, z.z - 2.2, z.z + 2.2)) { if (o === z || o.dead || o.state === 'drop') continue; const sx = z.x - o.x, sz = z.z - o.z, d2 = sx * sx + sz * sz, R = 0.55 * (z.scale + o.scale); if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d * 0.5; z.x += sx * k; z.z += sz * k; } }
    pushOutCircle(z, 0.32 * z.scale);
    const moved = Math.hypot(z.x - z.lastX, z.z - z.lastZ); z.lastX = z.x; z.lastZ = z.z;
    if (spd > 0.5 && moved < spd * dt * 0.3) z.stuckT += dt; else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
    if (z.stuckT > 2.5) { z.side *= -1; z.stuckT = 0.6; }
    z.phase += dt * (z.crawl ? 3.2 : z.type === 'runner' ? 11 : z.type === 'brute' ? 4.2 : z.type === 'boss' ? 3.2 : 5.2) * (spd > 0.1 || z.crawl ? 1 : 0.15);
    if (GAME.state === 'playing' && z.type !== 'boss') {
      const pd = NAV.ready ? Math.min(navDistAt(z.x, z.z), 1e6) : dist;
      if (pd < (z.bestD ?? 1e9) - 1) { z.bestD = pd; z.progT = 0; } else z.progT = (z.progT || 0) + dt;
      if ((z.progT > (z.crawl ? 30 : 12) && dist > 5) || !isFinite(z.x + z.z)) {
        const s = navSpawnPoint();
        z.x = s[0]; z.z = s[1]; z.lastX = z.x; z.lastZ = z.z; z.bestD = 1e9; z.progT = 0; z.stuckT = 0; z.vx = z.vz = 0;
      }
    }
    z.groan -= dt;
    if (z.groan <= 0 && groanCd <= 0 && dist < 38) { z.groan = rand(4, 9); groanCd = 0.6; AUD.groan(PLAYER.at(z.x, z.z), clamp(0.16 - dist / 300, 0.03, 0.16), z.type === 'brute' ? 0.7 : z.type === 'runner' ? 1.3 : 1); z.jaw = 1; }
    z.jaw = Math.max(0, z.jaw - dt * 1.2);
    z.atkCd -= dt;
    if (z.type === 'boss') { updateBoss(z, dt, dist); continue; }
    if (z.state === 'walk' && dist < reach && z.atkCd <= 0 && (!z.crawl || z.crawlT > 0.8)) { z.state = 'attack'; z.atkT = 0; z.hitDone = false; }
    if (z.state === 'attack') {
      z.atkT += dt / z.T.atk * zAtkK(z);
      if (!z.hitDone && z.atkT > 0.55) { z.hitDone = true; if (dist < reach + 0.5 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * z.dmgK * (z.crawl ? 0.7 : 1) * (z.buffT > 0 ? 1.2 : 1), z.x, z.z); }
      if (z.atkT >= 1) { z.state = 'walk'; z.atkCd = rand(0.3, 0.7); }
    }
  }
}
// speed / attack-rate factors from Cryo (slow or freeze) and Shock (stun)
function zSlowK(z) { return z.stun > 0 ? 0 : z.chill > 0 ? z.chillK : 1; }
function zAtkK(z) { return z.stun > 0 ? 0 : z.chill > 0 ? (z.chillK <= 0 ? 0 : Math.max(0.45, z.chillK)) : 1; }
// Cryo Arrow: the coolant capsule slows (Lv 3: freezes) whatever it hits, plus anything standing right at the impact.
// slowK is the speed left (0.6 = 40% slower, 0 = frozen solid); the Warden shrugs it off in half the time.
function cryoHit(x, y, z, target, slowK, dur) {
  const hitOne = (o) => {
    if (o.dead || o.state === 'drop') return;
    const d = o.type === 'boss' ? dur * 0.5 : dur;
    if (o.chill <= 0 || slowK <= o.chillK || d > o.chill) { o.chillK = slowK; o.chill = Math.max(o.chill, d); }
    o.burn = 0;
  };
  if (target) hitOne(target);
  for (const o of zombieCandidates(x - 1.4, x + 1.4, z - 1.4, z + 1.4)) if (o !== target && Math.hypot(o.x - x, o.z - z) < 1.3) hitOne(o);
  for (let k = 0; k < 26; k++) { const a = Math.random() * TAU, v = rand(1, 4); emit(x, y, z, Math.cos(a) * v, rand(0.5, 2.5), Math.sin(a) * v, rand(0.4, 0.8), [1.2, 2.4, 3.6], rand(0.04, 0.1), 2, 2, 0.1); }
  flashLight(x, Math.max(0.6, y), z, [1.4, 2.8, 4], 7, 0.35);
  for (const f of FIRES) if (Math.hypot(f.x - x, f.z - z) < 2) f.t = 0;
  AUD.frost(PLAYER.at(x, z));
  hazFrost(x, z);   // still ices over flood water and cools a cooking fuel tank
}
// Shock Arrow: current arcs from the struck zombie (or the impact point) to the nearest unhit neighbour, n hops.
// Each hop deals part of the hit; Lv 3 also stuns everything in the chain for a second.
const ARCS = [];
function shockChain(x, y, z, first, hops, dmg, stun) {
  const hit = first ? [first] : [];
  let fx = x, fy = y, fz = z;
  if (first && stun > 0 && !first.dead) { first.stun = Math.max(first.stun, first.type === 'boss' ? stun * 0.3 : stun); if (first.state === 'attack') first.state = 'walk'; }
  for (let n = 0; n < hops; n++) {
    let best = null, bd = 6.5;
    for (const o of zombieCandidates(fx - 6.5, fx + 6.5, fz - 6.5, fz + 6.5)) {
      if (o.dead || o.state === 'drop' || hit.includes(o)) continue;
      const d = Math.hypot(o.x - fx, o.z - fz); if (d < bd) { bd = d; best = o; }
    }
    if (!best) break;
    hit.push(best);
    const ty = best.y + 1.1 * best.scale;
    ARCS.push({ x0: fx, y0: fy, z0: fz, x1: best.x, y1: ty, z1: best.z, t: 0.22 });
    damageZombie(best, dmg, 'body', [best.x, ty, best.z], null, AT.SHOCK, 0.6);
    if (stun > 0 && !best.dead) { best.stun = Math.max(best.stun, best.type === 'boss' ? stun * 0.3 : stun); if (best.state === 'attack') best.state = 'walk'; }
    else best.flinch = 1;
    fx = best.x; fy = ty; fz = best.z;
  }
  if (ARCS.length > 24) ARCS.splice(0, ARCS.length - 24);
  flashLight(x, Math.max(0.8, y), z, [1.6, 2, 5], 9, 0.25);
  AUD.zap(PLAYER.at(x, z), hit.length);
}
// arcs are drawn as a few jittered glowing segments for a fraction of a second (no extra lights, no geometry)
function updateArcs(dt) {
  for (let i = ARCS.length - 1; i >= 0; i--) { ARCS[i].t -= dt; if (ARCS[i].t <= 0) ARCS.splice(i, 1); }
}
const _arcP = [0, 0, 0];
function drawArcs() {
  const C = ARROWS[AT.SHOCK].color, G = ARROWS[AT.SHOCK].glow;
  for (const a of ARCS) {
    const k = a.t / 0.22, SEG = 5; let px = a.x0, py = a.y0, pz = a.z0;
    for (let s = 1; s <= SEG; s++) {
      const u = s / SEG, j = s === SEG ? 0 : 0.35;
      const qx = lerp(a.x0, a.x1, u) + rand(-j, j), qy = lerp(a.y0, a.y1, u) + rand(-j, j) * 0.6, qz = lerp(a.z0, a.z1, u) + rand(-j, j);
      drawItem(MESH.box, M4.align(poolM(), px, py, pz, qx, qy, qz, 0.022, 0.022), C, [G[0] * k * 1.6, G[1] * k * 1.6, G[2] * k * 1.6]);
      px = qx; py = qy; pz = qz;
    }
  }
}
// Tracer: tags the infected with a marker the HUD draws through walls (game.js drawMarks). Lv 3 tags the whole group.
function tracerMark(x, z, target, dur, radius) {
  let n = 0;
  if (target && !target.dead) { target.markT = Math.max(target.markT, dur); n++; }
  for (const o of zombieCandidates(x - radius, x + radius, z - radius, z + radius)) {
    if (o === target || o.dead || Math.hypot(o.x - x, o.z - z) > radius) continue;
    o.markT = Math.max(o.markT, dur); n++;
  }
  burst(x, 1, z, 14, ARROWS[AT.TRACER].glow, 3, 0.4, 0.05, 0, 2);
  AUD.tag(PLAYER.at(x, z));
  return n;
}
// Tether: the struck zombie is staked where it stands, and the line jumps to the two nearest others
function tetherFrom(z, hx, hy, hz) {
  z.pin = Math.max(z.pin, z.type === 'boss' ? 1.2 : 4.5);
  const near = zombieCandidates(z.x - 6, z.x + 6, z.z - 6, z.z + 6).filter(o => o !== z && !o.dead && o.type !== 'boss' && o.state !== 'drop' && Math.hypot(o.x - z.x, o.z - z.z) < 6)
    .sort((a, b) => Math.hypot(a.x - z.x, a.z - z.z) - Math.hypot(b.x - z.x, b.z - z.z)).slice(0, 2);
  for (const o of near) { o.pin = Math.max(o.pin, 3.5); damageZombie(o, 12 * PLAYER.dmgMult, 'body', null, null, 5); }
  z.tetherTo = near;
  flashLight(hx, hy, hz, [2, 4, 0.6], 9, 0.3); AUD.tether();
}
// elites: a tougher, faster, harder-hitting version of any regular type, marked by white-hot eyes
function makeElite(z) {
  z.elite = true; z.hp *= 1.7; z.maxHp = z.hp; z.dmgK *= 1.3; z.speed *= 1.12; z.scale *= 1.07;
  z.eyes = [2.2, 2.0, 1.7];
  return z;
}
function updateBoss(z, dt, dist) {
  z.slamCd -= dt; z.summonCd -= dt;
  if (z.state === 'roar') { z.roarT += dt; z.jaw = 1; if (z.roarT > 1.4) { z.state = 'walk'; } return; }
  if (z.state === 'walk') {
    if (dist < 8 && z.slamCd <= 0) { z.state = 'slam'; z.atkT = 0; z.hitDone = false; AUD.groan(0, 0.35, 0.5); }
    else if (z.summonCd <= 0) { z.state = 'roar'; z.roarT = 0; z.summonCd = rand(13, 17); AUD.roar(); shake(0.3); for (let k = 0; k < 2 + Math.min(3, GAME.bossCount); k++) { const s = navSpawnPoint(14, 40); GAME.spawnExtra('runner', s[0], s[1]); } }
  }
  if (z.state === 'slam') {
    z.atkT += dt / 1.6;
    if (!z.hitDone && z.atkT > 0.62) {
      z.hitDone = true; shake(1); AUD.slam();
      const fx = z.x + Math.sin(z.yaw) * 3.5, fz = z.z + Math.cos(z.yaw) * 3.5;
      for (let k = 0; k < 80; k++) { const a = k / 80 * TAU; emit(fx + Math.cos(a) * 0.5, 0.25, fz + Math.sin(a) * 0.5, Math.cos(a) * 14, rand(0.2, 1.5), Math.sin(a) * 14, 0.7, [2.6, 0.4, 2.2], 0.45, 1, 2.8); }
      burst(fx, 0.4, fz, 40, [0.5, 0.45, 0.6], 7, 1.2, 0.6, 6, 1.5, 3);
      flashLight(fx, 1, fz, [4, 0.8, 3.4], 22, 0.5);
      const pd = Math.hypot(PLAYER.x - fx, PLAYER.z - fz);
      if (pd < 7.5 && PLAYER.y < 0.9 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * z.dmgK * (pd < 4 ? 1 : 0.6), fx, fz);
    }
    if (z.atkT >= 1) { z.state = 'walk'; z.slamCd = rand(3.5, 5.5); }
  }
}

/* -------- spitter: keeps its distance and lobs acid --------
   -------- screamer: keeps its distance and buffs the pack --------
   -------- climber: fast on the ground, scales a wall and pounces -------- */
function hasLineOfSight(z, P) {
  const ox = z.x, oy = 1.3 * z.scale, oz = z.z, dx = P.x - ox, dy = (P.y || 0) + 1.2 - oy, dz = P.z - oz, L = Math.hypot(dx, dy, dz) || 1e-3;
  const t = rayWorld(ox, oy, oz, dx, dy, dz, L);
  return t === null || t > L - 0.5;
}
function separateFrom(z, rad) {
  const rr = rad * (z.scale + 3.2);
  for (const o of zombieCandidates(z.x - rr, z.x + rr, z.z - rr, z.z + rr)) { if (o === z || o.dead || o.state === 'drop') continue; const sx = z.x - o.x, sz = z.z - o.z, d2 = sx * sx + sz * sz, R = rad * (z.scale + o.scale); if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d * 0.5; z.x += sx * k; z.z += sz * k; } }
}
const ZPROJ = [];
function spitAt(z, P) {
  const ox = z.x, oy = 1.35 * z.scale, oz = z.z;
  const dx = P.x - ox, dz = P.z - oz, dist = Math.hypot(dx, dz) || 1e-3, spd = 13, t = dist / spd;
  const vx = dx / t, vz = dz / t, vy = ((P.y || 0) + 1.1 - oy) / t + 0.5 * 9.5 * t;
  ZPROJ.push({ x: ox, y: oy, z: oz, vx, vy, vz, t: 0, life: 3, dmg: 9 * (1 + Math.max(0, GAME.wave - 1) * 0.02) });
  AUD.spit(PLAYER.at(z.x, z.z));
  emit(ox, oy, oz, vx * 0.08, vy * 0.08 + 1, vz * 0.08, 0.3, [0.4, 0.9, 0.15], 0.06, 0, 1, 0.4);
}
function updateZProj(dt) {
  for (let i = ZPROJ.length - 1; i >= 0; i--) {
    const a = ZPROJ[i]; a.t += dt; a.vy -= 9.5 * dt;
    const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt, nz = a.z + a.vz * dt;
    if (Math.random() < dt * 40) emit(lerp(a.x, nx, 0.5), lerp(a.y, ny, 0.5), lerp(a.z, nz, 0.5), rand(-0.2, 0.2), rand(-0.1, 0.1), rand(-0.2, 0.2), 0.3, [0.4, 0.9, 0.15], 0.05, 1, 2, 0.1);
    let hit = false;
    if (GAME.state === 'playing' && !PLAYER.dead) { const pd = Math.hypot(nx - PLAYER.x, ny - ((PLAYER.y || 0) + 1.1), nz - PLAYER.z); if (pd < 0.9) { PLAYER.hurt(a.dmg, a.x, a.z); hit = true; } }
    if (!hit && ny <= 0.05) hit = true;
    if (!hit && a.t > a.life) hit = true;
    if (hit) {
      burst(nx, Math.max(0.1, ny), nz, 18, [0.35, 1, 0.2], 4, 0.5, 0.07, 6, 1.3);
      for (let k = 0; k < 3; k++) emit(nx, Math.max(0.05, ny), nz, rand(-1, 1), rand(0.2, 1), rand(-1, 1), rand(0.4, 0.8), [0.35, 0.9, 0.15], -rand(0.05, 0.12), 4, 0.8, 0);
      ZPROJ.splice(i, 1); continue;
    }
    a.x = nx; a.y = ny; a.z = nz;
  }
}
function drawZProj() { for (const a of ZPROJ) drawItem(MESH.sphere, M4.trs(poolM(), a.x, a.y, a.z, 0, 0, 0, 0.09, 0.09, 0.09), [0.35, 0.9, 0.15], [0.5, 1.6, 0.2]); }
function updateSpitter(z, dt, P) {
  const dx = P.x - z.x, dz = P.z - z.z, dist = Math.hypot(dx, dz) || 1e-3;
  let tx = P.x, tz = P.z, hold = false;
  if (dist < 8) { tx = z.x - dx; tz = z.z - dz; } else if (dist <= 16) hold = true;
  const want = Math.atan2(tx - z.x, tz - z.z);
  let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
  z.yaw += clamp(dyaw, -3.6 * dt, 3.6 * dt);
  const spd = z.speed * zSlowK(z) * (z.wade || 1) * (z.pin > 0 ? 0 : 1) * (1 - z.flinch * 0.6) * (hold ? 0.12 : 1);
  z.mv = spd; z.x += Math.sin(z.yaw) * spd * dt; z.z += Math.cos(z.yaw) * spd * dt;
  pushOutCircle(z, 0.32 * z.scale); separateFrom(z, 0.55);
  z.phase += dt * 5.2 * (spd > 0.1 ? 1 : 0.2);
  // aim toward the player once inside its engagement band, whatever direction it's moving
  if (dist >= 6 && dist <= 18) { const aim = Math.atan2(dx, dz); let ay = ((aim - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI; z.yaw += clamp(ay, -6 * dt, 6 * dt); }
  z.spitCd -= dt;
  if (z.state === 'walk' && dist >= 6 && dist <= 18 && z.spitCd <= 0 && GAME.state === 'playing' && hasLineOfSight(z, P)) { z.state = 'attack'; z.atkT = 0; z.hitDone = false; }
  if (z.state === 'attack') {
    z.atkT += dt / 1.1 * zAtkK(z);
    if (!z.hitDone && z.atkT > 0.5) { z.hitDone = true; spitAt(z, P); z.spitCd = rand(2.6, 4.2); }
    if (z.atkT >= 1) z.state = 'walk';
  }
  z.groan -= dt; if (z.groan <= 0 && groanCd <= 0 && dist < 38) { z.groan = rand(4, 9); groanCd = 0.6; AUD.groan(PLAYER.at(z.x, z.z), clamp(0.14 - dist / 300, 0.03, 0.14), 1.05); z.jaw = 1; }
  z.jaw = Math.max(0, z.jaw - dt * 1.2);
}
function screamPulse(z) {
  AUD.scream(PLAYER.at(z.x, z.z)); shakeNear(z, 0.15); flashLight(z.x, 1.6, z.z, [1.3, 0.4, 1.6], 12, 0.5);
  for (const o of zombieCandidates(z.x - 9, z.x + 9, z.z - 9, z.z + 9)) { if (o === z || o.dead || o.state === 'drop' || o.type === 'boss') continue; if (Math.hypot(o.x - z.x, o.z - z.z) < 9) o.buffT = Math.max(o.buffT, 6); }
  for (let k = 0; k < 40; k++) { const a = Math.random() * TAU, v = rand(2, 6); emit(z.x, 1.4 * z.scale, z.z, Math.cos(a) * v, rand(0.5, 2), Math.sin(a) * v, 0.6, [0.9, 0.25, 1], 0.06, 1, 2, 0.2); }
}
function updateScreamer(z, dt, P) {
  const dx = P.x - z.x, dz = P.z - z.z, dist = Math.hypot(dx, dz) || 1e-3;
  let tx = P.x, tz = P.z;
  if (dist < 5.5) { tx = z.x - dx; tz = z.z - dz; }
  const want = Math.atan2(tx - z.x, tz - z.z);
  let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
  z.yaw += clamp(dyaw, -3.2 * dt, 3.2 * dt);
  let spd = z.speed * zSlowK(z) * (z.wade || 1) * (z.pin > 0 ? 0 : 1) * (1 - z.flinch * 0.6);
  const reach = z.T.reach * z.scale + 0.35;
  if (z.state === 'attack' || z.state === 'roar' || dist < 2.2) spd = 0;
  z.mv = spd; z.x += Math.sin(z.yaw) * spd * dt; z.z += Math.cos(z.yaw) * spd * dt;
  pushOutCircle(z, 0.32 * z.scale); separateFrom(z, 0.55);
  z.phase += dt * 5 * (spd > 0.1 ? 1 : 0.2);
  z.screamCd -= dt;
  if (z.state === 'walk' && z.screamCd <= 0 && GAME.state === 'playing') { z.state = 'roar'; z.roarT = 0; z.screamCd = rand(9, 13); z.screamed = false; }
  if (z.state === 'roar') { z.roarT += dt; z.jaw = 1; if (z.roarT > 0.15 && !z.screamed) { screamPulse(z); z.screamed = true; } if (z.roarT > 1.1) z.state = 'walk'; }
  z.atkCd -= dt;
  if (z.state === 'walk' && dist < reach && z.atkCd <= 0) { z.state = 'attack'; z.atkT = 0; z.hitDone = false; }
  if (z.state === 'attack') {
    z.atkT += dt / z.T.atk * zAtkK(z);
    if (!z.hitDone && z.atkT > 0.55) { z.hitDone = true; if (dist < reach + 0.5 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * z.dmgK, z.x, z.z); }
    if (z.atkT >= 1) { z.state = 'walk'; z.atkCd = rand(0.4, 0.8); }
  }
  z.groan -= dt; if (z.groan <= 0 && groanCd <= 0 && dist < 40) { z.groan = rand(5, 9); groanCd = 0.6; AUD.groan(PLAYER.at(z.x, z.z), clamp(0.14 - dist / 300, 0.03, 0.14), 1.15); z.jaw = Math.max(z.jaw, 0.6); }
  z.jaw = Math.max(0, z.jaw - dt * 1.2);
}
function findClimbWall(z) {
  let best = null, bestD = 2.4;
  const [boxes] = worldCandidates(z.x - bestD, z.x + bestD, z.z - bestD, z.z + bestD);
  for (const b of boxes) {
    if (b.y1 < 3.2 || b.y1 > 9) continue;
    const cx = clamp(z.x, b.x0, b.x1), cz = clamp(z.z, b.z0, b.z1), d = Math.hypot(z.x - cx, z.z - cz);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
function updateClimber(z, dt, P) {
  const dist = Math.hypot(P.x - z.x, P.z - z.z) || 1e-3;
  if (z.climbState === 'ground') {
    let tx = P.x, tz = P.z;
    if (NAV.ready && dist > 4.5 && navTarget(z.x, z.z, _nc)) { tx = _nc[0]; tz = _nc[1]; }
    const want = Math.atan2(tx - z.x, tz - z.z);
    let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    z.yaw += clamp(dyaw, -7 * dt, 7 * dt);
    let spd = z.speed * zSlowK(z) * (z.wade || 1) * (z.pin > 0 ? 0 : 1) * (1 - z.flinch * 0.6) * (z.stumble > 0 ? 0.35 : 1);
    const reach = z.T.reach * z.scale + 0.35;
    if (dist < reach * 0.8) spd = 0;
    z.mv = spd; z.x += Math.sin(z.yaw) * spd * dt; z.z += Math.cos(z.yaw) * spd * dt;
    pushOutCircle(z, 0.3 * z.scale); separateFrom(z, 0.5);
    z.phase += dt * 9 * (spd > 0.1 ? 1 : 0.2);
    z.climbCd -= dt;
    if (z.climbCd <= 0 && dist > 7 && dist < 26) {
      const wall = findClimbWall(z);
      if (wall) { z.climbState = 'climb'; z.climbT = 0; z.climbFrom = z.y; z.climbTo = Math.min(wall.y1 - 0.4, 6); AUD.groan(PLAYER.at(z.x, z.z), 0.12, 1.3); }
      else z.climbCd = rand(2, 4);
    }
    if (z.state === 'walk' && dist < reach && z.atkCd <= 0) { z.state = 'attack'; z.atkT = 0; z.hitDone = false; }
    if (z.state === 'attack') {
      z.atkT += dt / z.T.atk * zAtkK(z);
      if (!z.hitDone && z.atkT > 0.5) { z.hitDone = true; if (dist < reach + 0.5 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * z.dmgK, z.x, z.z); }
      if (z.atkT >= 1) { z.state = 'walk'; z.atkCd = rand(0.3, 0.6); }
    }
    z.atkCd -= dt;
  } else if (z.climbState === 'climb') {
    z.climbT += dt; const k = Math.min(1, z.climbT / 1.1);
    z.y = lerp(z.climbFrom, z.climbTo, easeOut(k)); z.state = 'walk';
    if (k >= 1) { z.climbState = 'perch'; z.perchT = 0; }
  } else if (z.climbState === 'perch') {
    z.perchT += dt;
    const want = Math.atan2(P.x - z.x, P.z - z.z); let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI; z.yaw += clamp(dyaw, -4 * dt, 4 * dt);
    if (z.perchT > 0.7) {
      const dx = P.x - z.x, dz = P.z - z.z, d = Math.hypot(dx, dz) || 1;
      z.climbState = 'pounce'; z.pounceT = 0;
      const spd = Math.min(d / 0.9, 14);
      z.dvx = dx / d * spd; z.dvz = dz / d * spd; z.dvy = 3.5;
      AUD.pounce(PLAYER.at(z.x, z.z));
    }
  } else if (z.climbState === 'pounce') {
    z.pounceT += dt; z.dvy -= 16 * dt;
    z.x += z.dvx * dt; z.z += z.dvz * dt; z.y = Math.max(0, z.y + z.dvy * dt);
    pushOutCircle(z, 0.3 * z.scale);
    if (z.y <= 0.02 && z.pounceT > 0.15) {
      z.y = 0; z.climbState = 'ground'; z.climbCd = rand(5, 9); shakeNear(z, 0.15);
      burst(z.x, 0.2, z.z, 20, [0.35, 0.3, 0.15], 5, 0.35, 0.08, 6, 1.4);
      const pd = Math.hypot(PLAYER.x - z.x, PLAYER.z - z.z);
      if (pd < 2.1 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * z.dmgK * 1.3, z.x, z.z);
    }
  }
  z.groan -= dt; if (z.groan <= 0 && groanCd <= 0 && dist < 38) { z.groan = rand(4, 8); groanCd = 0.6; AUD.groan(PLAYER.at(z.x, z.z), clamp(0.15 - dist / 300, 0.03, 0.15), 1.25); z.jaw = 1; }
  z.jaw = Math.max(0, z.jaw - dt * 1.2);
}

/* -------- pose + draw -------- */
const _F = {}; ['root', 'pel', 'tor', 'neck', 'jaw', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR'].forEach(k => _F[k] = M4.create());
const _tmpM = M4.create();
function fr(out, parent, px, py, pz, rx, ry, rz) { M4.trs(_tmpM, px, py, pz, rx, ry, rz, 1, 1, 1); return M4.mul(out, parent, _tmpM); }
function part(F, x, y, z, sx, sy, sz, col, emitC, flash, mesh = MESH.box, rx = 0, ry = 0, rz = 0) { M4.trs(_tmpM, x, y, z, rx, ry, rz, sx, sy, sz); const m = poolM(); M4.mul(m, F, _tmpM); drawItem(mesh, m, col, emitC, flash); return m; }
// sculpted mesh part: tint = cloth/hair/plate colour, skin = base colour
function mpart(F, mesh, sx, sy, sz, tint, skin, emitC, flash, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (!mesh) return; M4.trs(_tmpM, x, y, z, rx, ry, rz, sx, sy, sz); const m = poolM(); M4.mul(m, F, _tmpM); drawItem(mesh, m, tint, emitC, flash, WORLD_ITEMS, skin);
}
const ARMOUR_DARK = [0.09, 0.09, 0.11], ARMOUR_PLATE = [0.21, 0.2, 0.23];

/* procedural pose: joint angles for gait, attacks, reactions, crawling and death.
   The legacy renderer builds frames from these directly; the rigged renderer blends them over the Blender clips. */
const _ZP = {};
function zPose(z, time) {
  const s = z.scale, T = z.type, fl = z.flash > 0 ? 0.55 : 0, R = z.R;
  const burnK = z.burn > 0 ? 0.4 : 1;
  const sk = T === 'boss' ? [0.44, 0.34, 0.5] : z.skin; const skin = [sk[0] * burnK, sk[1] * burnK, sk[2] * burnK];
  const cloth = [z.cloth[0] * burnK, z.cloth[1] * burnK, z.cloth[2] * burnK], pants = [z.pants[0] * burnK, z.pants[1] * burnK, z.pants[2] * burnK];
  const p = z.phase, w = Math.sin(p), c = Math.cos(p);
  const dying = z.state === 'dying';
  let moving = z.state === 'walk' && !dying ? 1 : 0.2;
  // ---------- base gait ----------
  let lean = T === 'runner' ? 0.5 : T === 'brute' ? 0.22 : T === 'boss' ? 0.3 : 0.28;
  let shL = -1.35, shR = -1.25, elL = -0.25, elR = -0.35, spread = 0.12, headRx = -0.15, twist = w * 0.12 * moving;
  let hipY = 0.95 + Math.abs(c) * 0.05 * moving, pelRx = 0;
  let hipLa = w * 0.55 * moving * (T === 'runner' ? 1.35 : 1), hipRa = -hipLa;
  let knLa = Math.max(0, -c) * 0.9 * moving + 0.05, knRa = Math.max(0, c) * 0.9 * moving + 0.05;
  if (T === 'walker') { shL += Math.sin(p * 0.5 + z.seed) * 0.18; shR += Math.cos(p * 0.5 + z.seed) * 0.18; }
  if (T === 'runner') { shL = -0.5 - w * 0.95; shR = -0.5 + w * 0.95; elL = elR = -1.3; headRx = 0.35; spread = 0.2; }
  if (T === 'brute') { shL = -0.35 + w * 0.35; shR = -0.35 - w * 0.35; elL = elR = -0.5; spread = 0.3; }
  if (T === 'boss') { shL = -0.6 + w * 0.3; shR = -0.6 - w * 0.3; elL = elR = -0.7; spread = 0.35; }
  if (T === 'spitter') { lean = 0.3; headRx = 0.05; }
  if (T === 'screamer') { lean = 0.24; }
  if (T === 'climber') {
    lean = 0.4; shL = -0.55 - w * 0.5; shR = -0.55 + w * 0.5; elL = elR = -1.05; headRx = 0.3; spread = 0.22;
    if (z.climbState === 'climb') { lean = 0.7; shL = -2.4; shR = -2.2; elL = elR = -0.25; headRx = -0.35; moving = 0.6; }
    else if (z.climbState === 'perch') { lean = 0.42; shL = -1.7 + w * 0.15; shR = -1.6 - w * 0.15; }
    else if (z.climbState === 'pounce') { lean = -0.35; shL = shR = -2.7; elL = elR = -0.15; headRx = -0.45; }
  }
  if (z.state === 'attack') {
    const a = z.atkT; const up = a < 0.5 ? easeOut(a / 0.5) : 1 - easeInOut((a - 0.5) / 0.5);
    shL = lerp(shL, -2.6, up); shR = lerp(shR, -2.5, up * 0.9); if (a > 0.5) { shL = lerp(-2.6, -0.6, easeOut((a - 0.5) / 0.3)); shR = lerp(-2.5, -0.7, easeOut((a - 0.5) / 0.35)); }
    lean += (a > 0.5 ? 0.25 : -0.1);
  }
  if (z.state === 'slam') {
    const a = z.atkT; if (a < 0.55) { const k = easeOut(a / 0.55); shL = shR = lerp(-0.6, -3.1, k); elL = elR = lerp(-0.7, -0.4, k); lean = lerp(lean, -0.25, k); }
    else { const k = easeOut(Math.min(1, (a - 0.55) / 0.1)); shL = shR = lerp(-3.1, -1.0, k); elL = elR = -0.2; lean = lerp(-0.25, 0.75, k); }
    moving = 0;
  }
  if (z.state === 'roar') { headRx = -0.7; shL = shR = -0.9; spread = 0.9; lean = -0.15; }
  // ---------- hit reactions ----------
  headRx += R.h; lean += R.t - z.flinch * 0.2; let torYaw = R.y;
  if (R.l > 0) { hipY -= 0.12 * R.l; knLa += 0.9 * R.l; knRa += 0.7 * R.l; hipLa -= 0.5 * R.l; hipRa -= 0.4 * R.l; lean += 0.3 * R.l; }
  // ---------- crawler ----------
  if (z.crawl) {
    const k = easeOut(Math.min(1, z.crawlT / 0.7));
    hipY = lerp(hipY, 0.2, k); pelRx = lerp(0, 1.42, k); lean = lerp(lean, 0.08, k); headRx = lerp(headRx, -1.1 + R.h, k); twist = w * 0.15 * k;
    const reachL = -2.35 + 0.75 * w, reachR = -2.35 - 0.75 * w;
    if (z.state === 'attack') { const a = z.atkT; shL = lerp(shL, -2.9 + a * 1.5, k); shR = lerp(shR, -2.7 + a * 1.2, k); }
    else { shL = lerp(shL, reachL, k); shR = lerp(shR, reachR, k); }
    elL = lerp(elL, -0.2 - 0.5 * Math.max(0, w), k); elR = lerp(elR, -0.2 - 0.5 * Math.max(0, -w), k); spread = lerp(spread, 0.35, k);
    hipLa = lerp(hipLa, 0.12 + 0.08 * w, k); hipRa = lerp(hipRa, 0.1 - 0.08 * w, k); knLa = lerp(knLa, 0.35, k); knRa = lerp(knRa, 0.2, k);
  }
  // ---------- dying ----------
  let rootRx = 0, rootRz = 0;
  if (dying) {
    const limp = Math.min(1, z.dieT / 0.45);
    if (z.wallPin) {
      const sl = smooth(clamp((z.wallPin.t - 2.3) / 1.1, 0, 1));
      lean = lerp(lean, -0.12, limp); headRx = lerp(headRx, 0.75, limp); shL = lerp(shL, -0.15, limp); shR = lerp(shR, -0.25, limp); spread = 0.28; elL = elR = -0.3;
      hipY = 0.95 - 0.55 * sl; hipLa = -1.35 * sl; hipRa = -1.25 * sl; knLa = 1.5 * sl + 0.1; knRa = 1.4 * sl + 0.1;
    } else if (z.crawl) {
      headRx = lerp(headRx, 0.2, limp); shL = lerp(shL, -1.4, limp); shR = lerp(shR, -2.8, limp); elL = elR = -0.1;
    } else {
      rootRx = z.pitch; rootRz = z.roll;
      const b = z.crumple;
      hipY -= 0.5 * b; knLa = lerp(knLa, 1.6, b); knRa = lerp(knRa, 1.4, b); hipLa = lerp(hipLa, -0.9, b); hipRa = lerp(hipRa, -0.7, b); lean += 0.45 * b;
      // arms and head lag behind the fall
      const fling = z.fallBack ? -2.7 : -0.25;
      shL = lerp(shL, fling + Math.sin(z.seed) * 0.4, limp); shR = lerp(shR, fling + Math.cos(z.seed) * 0.5, limp); spread = lerp(spread, 0.55, limp); elL = elR = lerp(elL, -0.2, limp);
      headRx += -z.pitchV * 0.08; lean -= z.pitchV * 0.04;
      if (Math.abs(z.pitch) > 1.3) { hipLa *= 0.3; hipRa *= 0.3; knLa = Math.min(knLa, 0.4); knRa = Math.min(knRa, 0.25); }
    }
  }
  const roll = T === 'walker' && !dying ? Math.sin(time * 2.1 + z.seed) * 0.18 + 0.12 : Math.sin(time * 3 + z.seed) * 0.05 * (dying ? 0 : 1);
  const P = _ZP;
  P.rootRx = rootRx; P.rootRz = rootRz; P.hipY = hipY; P.pelRx = pelRx; P.twist = twist; P.lean = lean; P.torYaw = torYaw; P.spRz = Math.sin(p * 0.5) * 0.05 * moving;
  P.headRx = headRx + Math.sin(time * 5 + z.seed) * 0.05 * (dying ? 0 : 1); P.roll = roll; P.jaw = 0.15 + z.jaw * 0.45 + (dying ? 0.4 : 0);
  P.shL = shL; P.shR = shR; P.spread = spread; P.elL = elL; P.elR = elR; P.hipLa = hipLa; P.hipRa = hipRa; P.knLa = knLa; P.knRa = knRa;
  P.moving = moving; P.fl = fl; P.skin = skin; P.cloth = cloth; P.pants = pants; P.dying = dying;
  return P;
}
function drawZombie(z, time) {
  if (ZRIG.ready) return drawZombieRig(z, time);
  z._ps = STEPN.n;
  const s = z.scale, T = z.type, fl = z.flash > 0 ? 0.55 : 0;
  const P = zPose(z, time), skin = P.skin, cloth = P.cloth, pants = P.pants, dying = P.dying;
  M4.trs(_F.root, z.x, z.y, z.z, 0, z.yaw, 0, s, s, s);
  if (P.rootRx || P.rootRz) fr(_F.root, _F.root, 0, 0, 0, P.rootRx, 0, P.rootRz);
  fr(_F.pel, _F.root, 0, P.hipY, 0, P.pelRx, P.twist, 0);
  fr(_F.tor, _F.pel, 0, 0.08, 0, P.lean, -P.twist * 1.5 + P.torYaw, P.spRz);
  fr(_F.neck, _F.tor, 0, 0.6, 0.02, P.headRx, 0, P.roll);
  fr(_F.jaw, _F.neck, 0, 0.085, 0.02, P.jaw, 0, 0);
  fr(_F.shL, _F.tor, -0.27, 0.52, 0, P.shL, 0, -P.spread); fr(_F.shR, _F.tor, 0.27, 0.52, 0, P.shR, 0, P.spread);
  fr(_F.elL, _F.shL, 0, -0.32, 0, P.elL, 0, 0); fr(_F.elR, _F.shR, 0, -0.32, 0, P.elR, 0, 0);
  fr(_F.hipL, _F.pel, -0.11, -0.02, 0, P.hipLa, 0, 0.03); fr(_F.hipR, _F.pel, 0.11, -0.02, 0, P.hipRa, 0, -0.03);
  fr(_F.knL, _F.hipL, 0, -0.45, 0, P.knLa, 0, 0); fr(_F.knR, _F.hipR, 0, -0.45, 0, P.knRa, 0, 0);
  // ---------- meshes ----------
  const thin = T === 'runner' ? 0.86 : 1, wide = T === 'brute' ? 1.22 : T === 'boss' ? 1.2 : 1;
  const armS = T === 'runner' ? 0.85 : T === 'brute' ? 1.35 : 1;
  const e = z.eyes || z.T.eyes, vk = (T === 'boss' ? 1.6 : z.elite ? 1.8 : 1.0) * (dying ? 0.1 : 0.7 + 0.3 * Math.sin(time * 3 + z.seed));
  const vein = [e[0] * vk, e[1] * vk, e[2] * vk];
  mpart(_F.pel, MODEL.pelvis, wide, 1, wide, pants, skin, vein, fl);
  mpart(_F.tor, z.bare ? MODEL.torso_bare : MODEL.torso_shirt, thin * wide, 1, wide, cloth, skin, vein, fl);
  const uarm = z.sleeve && !z.bare ? MODEL.uarm_sleeve : MODEL.uarm_bare;
  mpart(_F.shL, uarm, armS, 1, armS, cloth, skin, vein, fl); mpart(_F.shR, uarm, armS, 1, armS, cloth, skin, vein, fl);
  const bossArm = T === 'boss' ? 1.35 : 1;
  mpart(_F.elL, MODEL.farm, -armS, 1, armS, cloth, skin, vein, fl); mpart(_F.elR, MODEL.farm, armS * bossArm, bossArm, armS * bossArm, cloth, skin, vein, fl);
  mpart(_F.hipL, MODEL.thigh, wide, 1, wide, pants, skin, null, fl); mpart(_F.hipR, MODEL.thigh, wide, 1, wide, pants, skin, null, fl);
  mpart(_F.knL, MODEL.shin, wide, 1, wide, pants, skin, null, fl); mpart(_F.knR, MODEL.shin, wide, 1, wide, pants, skin, null, fl);
  if (!z.headless) {
    const hs = T === 'boss' ? 0.85 : 1, eyeGlow = dying ? 0.15 : 2.6;
    mpart(_F.neck, z.headVar === 'b' ? MODEL.head_b : MODEL.head_a, hs, hs, hs, z.hair, skin, [e[0] * eyeGlow, e[1] * eyeGlow, e[2] * eyeGlow], fl);
    if (!z.jawGone) mpart(_F.jaw, MODEL.jaw, hs, hs, hs, skin, skin, null, fl);
    else part(_F.neck, 0, 0.07, 0.05, 0.1, 0.03, 0.07, [0.3, 0.02, 0.02], null, 0);
  } else part(_F.neck, 0, 0.0, 0.02, 0.1, 0.04, 0.1, [0.3, 0.03, 0.03], null, 0);
  if (T === 'brute') {
    mpart(_F.tor, MODEL.brute_vest, 1, 1, 1, ARMOUR_PLATE, ARMOUR_DARK, [2.6, 0.2, 0.5], fl);
    mpart(_F.shL, MODEL.brute_pad, 1, 1, 1, ARMOUR_PLATE, ARMOUR_DARK, [1.4, 0.1, 0.3], fl, 0, 0.02, 0); mpart(_F.shR, MODEL.brute_pad, 1, 1, 1, ARMOUR_PLATE, ARMOUR_DARK, [1.4, 0.1, 0.3], fl, 0, 0.02, 0);
    if (!z.helmetGone && !z.headless) mpart(_F.neck, MODEL.brute_helmet, 1, 1, 1, ARMOUR_PLATE, ARMOUR_DARK, dying ? [0.3, 0, 0.05] : [e[0] * 3.2, e[1] * 3, e[2] * 3], fl);
  }
  if (T === 'boss') {
    const pul = 0.6 + 0.4 * Math.sin(time * 6);
    mpart(_F.tor, MODEL.boss_hump, 1, 1, 1, skin, [skin[0] * 0.8, skin[1] * 0.8, skin[2] * 0.8], [2.4 * pul, 0.3, 2.2 * pul], fl);
    part(_F.tor, 0, 0.32, 0.14, 0.2, 0.2, 0.1, [1, 0.3, 0.9], [4 * pul, 0.8, 3.6 * pul], fl, MESH.sphere);
    mpart(_F.shL, MODEL.brute_pad, 1.2, 1.2, 1.2, [0.22, 0.16, 0.24], [0.12, 0.09, 0.14], [2 * pul, 0.3, 1.8 * pul], fl); mpart(_F.shR, MODEL.brute_pad, 1.2, 1.2, 1.2, [0.22, 0.16, 0.24], [0.12, 0.09, 0.14], [2 * pul, 0.3, 1.8 * pul], fl);
    if (!z.headless) for (let k = 0; k < 3; k++) part(_F.neck, (k - 1) * 0.07, 0.29, -0.02, 0.05, 0.14, 0.05, [0.9, 0.2, 0.8], [2 * pul, 0.3, 1.8 * pul], 0, MESH.cone, -0.2, 0, (k - 1) * 0.4);
    part(_F.elR, 0, -0.47 * bossArm, 0.06, 0.1, 0.12, 0.1, [1, 0.3, 0.9], [2.4, 0.4, 2.2], 0, MESH.cone, Math.PI);
  }
  // ---------- hit volumes ----------
  M4.pt(_F.neck, 0, 0.155 * (T === 'boss' ? 0.85 : 1), 0.01, z.head);
  M4.pt(_F.pel, 0, 0, 0, z.a); M4.pt(_F.tor, 0, 0.5, 0, z.b);
  M4.pt(_F.tor, 0, 0.32, 0.14, z.core);
  M4.pt(_F.hipL, 0, 0, 0, z.hipL); M4.pt(_F.knL, 0, 0, 0, z.knL); M4.pt(_F.knL, 0, -0.42, 0, z.ftL);
  M4.pt(_F.hipR, 0, 0, 0, z.hipR); M4.pt(_F.knR, 0, 0, 0, z.knR); M4.pt(_F.knR, 0, -0.42, 0, z.ftR);
  // ---------- stuck arrows ----------
  for (const sa of z.stuck) {
    if (sa.part === 'head' && (z.headless)) continue;
    const F = sa.part === 'head' ? _F.neck : _F.tor;
    const a = M4.pt(F, sa.lp[0], sa.lp[1], sa.lp[2], [0, 0, 0]);
    const d = M4.dir(F, sa.ld[0], sa.ld[1], sa.ld[2], [0, 0, 0]); const L = Math.hypot(d[0], d[1], d[2]) || 1;
    const len = 0.6; const bx = a[0] - d[0] / L * len, by = a[1] - d[1] / L * len, bz = a[2] - d[2] / L * len;
    const m = M4.align(poolM(), a[0], a[1], a[2], bx, by, bz, 0.02, 0.02); drawItem(MESH.box, m, [0.08, 0.08, 0.09]);
    const A = ARROWS[sa.type]; const m2 = M4.align(poolM(), bx + d[0] / L * 0.04, by + d[1] / L * 0.04, bz + d[2] / L * 0.04, bx, by, bz, 0.035, 0.035); drawItem(MESH.box, m2, A.color, A.glow);
  }
}
function drawDebris() {
  for (const d of DEBRIS) {
    const m = M4.trs(poolM(), d.p[0], d.p[1], d.p[2], d.r[0], d.r[1], d.r[2], d.s, d.s, d.s);
    // pieces are modelled around the head origin: recentre them
    M4.mul(m, m, M4.trs(_tmpM, 0, -0.1, 0, 0, 0, 0, 1, 1, 1));
    drawItem(d.mesh, m, d.tint, d.emit, 0, WORLD_ITEMS, d.skin);
  }
}
// convert world hit to local (for stuck arrows): stored in torso/head frame
function zFrame(z, part) { // 'head' -> neck frame, else torso frame (world matrices, column-major)
  if (ZRIG.ready && z.rig) return (part === 'head' ? z.rig.B.neck : z.rig.B.spine).matrixWorld.elements;
  return part === 'head' ? _F.neck : _F.tor;
}
function localize(z, part, pw, dir) {
  ensurePose(z);
  const F = zFrame(z, part);
  const inv = M4.invert(M4.create(), F); if (!inv) return null;
  return { lp: M4.pt(inv, pw[0], pw[1], pw[2], [0, 0, 0]), ld: M4.dir(inv, dir[0], dir[1], dir[2], [0, 0, 0]) };
}
function drawZombieFramesOnly(z) {
  const saved = DRAW_SUPPRESS.on; DRAW_SUPPRESS.on = true; drawZombie(z, GAME.time); DRAW_SUPPRESS.on = saved;
}
