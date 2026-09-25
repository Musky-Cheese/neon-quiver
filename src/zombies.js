/* ============================================================
   The infected: walkers, runners, brutes and the Warden
   ============================================================ */
const ZTYPES = {
  walker: { hp: 60, hpW: 10, speed: [1.5, 2.3], dmg: 10, scale: 1, score: 100, cash: 10, eyes: [0.65, 1, 0.25], reach: 1.35, atk: 0.85 },
  runner: { hp: 34, hpW: 5, speed: [4.9, 5.9], dmg: 7, scale: 0.94, score: 150, cash: 15, eyes: [1, 0.4, 0.1], reach: 1.3, atk: 0.6 },
  brute: { hp: 300, hpW: 34, speed: [1.25, 1.55], dmg: 24, scale: 1.55, score: 450, cash: 45, eyes: [1, 0.1, 0.25], reach: 2.0, atk: 1.1 },
  boss: { hp: 2000, hpW: 0, speed: [2.2, 2.2], dmg: 34, scale: 3.1, score: 6000, cash: 600, eyes: [1, 0.2, 0.9], reach: 3.6, atk: 1.2 },
};
const SKINS = [[0.42, 0.50, 0.36], [0.55, 0.52, 0.44], [0.38, 0.45, 0.50], [0.50, 0.45, 0.40], [0.45, 0.52, 0.44]];
const CLOTHES = [[0.10, 0.10, 0.16], [0.16, 0.06, 0.08], [0.06, 0.12, 0.14], [0.18, 0.16, 0.14], [0.08, 0.08, 0.08], [0.2, 0.12, 0.05]];
const TRIMS = [hex('#ff2e88'), hex('#29e7ff'), hex('#ffb52e'), hex('#b44dff'), null, null, null];
const ZOMBIES = [];
const STEPN = { n: 0 };
function ensurePose(z) { if (z._ps !== STEPN.n) drawZombieFramesOnly(z); }
let groanCd = 0;

function spawnZombie(type, x, z, wave) {
  const T = ZTYPES[type];
  const hp = (T.hp + T.hpW * Math.max(0, wave - 1)) * (type === 'boss' ? 1 + Math.max(0, GAME.bossCount - 1) * 0.7 : 1);
  const zz = {
    type, T, x, y: 0, z, yaw: Math.atan2(-x, -z), hp, maxHp: hp, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(0.35, wave * 0.02)), scale: T.scale * rand(0.95, 1.06),
    phase: Math.random() * TAU, state: 'walk', atkT: 0, atkCd: 0.5, flinch: 0, flash: 0, burn: 0, dieT: 0, dead: false, fallDir: 1,
    skin: pick(SKINS), cloth: pick(CLOTHES), pants: pick(CLOTHES), trim: pick(TRIMS), seed: Math.random() * 100, side: Math.random() < 0.5 ? -1 : 1,
    stuck: [], headless: false, lastX: x, lastZ: z, stuckT: 0, dmgShown: 0, hpBarT: 0, groan: rand(1, 6),
    slamCd: 4, summonCd: 10, roarT: 0, spawnT: type === 'boss' ? 0 : 1, jaw: 0, vx: 0, vz: 0,
    head: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0], core: [0, 0, 0], frames: {},
  };
  if (type === 'boss') { zz.y = 40; zz.state = 'drop'; }
  ZOMBIES.push(zz);
  return zz;
}

/* -------- collision helpers -------- */
function pushOutCircle(o, rad) {
  for (const b of WORLD.boxes) {
    if (o.y > b.y1) continue;
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
  for (const c of WORLD.circles) {
    if (o.y > c.h) continue;
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

/* -------- damage -------- */
function damageZombie(z, dmg, part, hitPos, dir, arrowType) {
  if (z.dead) return false;
  z.hp -= dmg; z.flash = 0.12; z.flinch = Math.min(1, z.flinch + (z.type === 'boss' ? 0.2 : 0.8)); z.hpBarT = 2.5;
  if (dir && z.type !== 'boss') { const kb = z.type === 'brute' ? 0.15 : 0.45; z.vx += dir[0] * kb * 6; z.vz += dir[2] * kb * 6; }
  if (z.hp <= 0) { killZombie(z, part, dir, arrowType); return true; }
  return false;
}
function killZombie(z, part, dir, arrowType) {
  z.dead = true; z.state = 'dying'; z.dieT = 0; z.burn = Math.min(z.burn, 1.5);
  if (dir) { const fx = Math.sin(z.yaw), fz = Math.cos(z.yaw); z.fallDir = (dir[0] * fx + dir[2] * fz) > 0 ? 1 : -1; } else z.fallDir = -1;
  if (part === 'head' && z.type !== 'boss') { z.headless = true; burst(z.head[0], z.head[1], z.head[2], 40, [0.5, 1.4, 0.3], 5, 0.8, 0.12, 12, 1.5, 2); }
  GAME.onKill(z, part, arrowType);
}

/* -------- update -------- */
function updateZombies(dt, time) {
  const P = PLAYER;
  groanCd -= dt;
  for (let i = ZOMBIES.length - 1; i >= 0; i--) {
    const z = ZOMBIES[i];
    z.flash = Math.max(0, z.flash - dt); z.flinch = Math.max(0, z.flinch - dt * 3); z.hpBarT = Math.max(0, z.hpBarT - dt);
    if (z.burn > 0) {
      z.burn -= dt;
      if (!z.dead) { if (damageZombie(z, 14 * PLAYER.dmgMult * dt * (z.type === 'boss' ? 2 : 1), 'body', null, null, 1)) {} }
      if (Math.random() < dt * 40) emit(z.x + rand(-0.3, 0.3) * z.scale, z.y + rand(0.3, 1.7) * z.scale, z.z + rand(-0.3, 0.3) * z.scale, rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(0.3, 0.6), [2.4, 0.9 + Math.random() * 0.5, 0.15], rand(0.18, 0.35) * z.scale, -1, 1, -0.3);
    }
    if (z.state === 'dying') {
      z.dieT += dt;
      if (z.dieT > 2.6) { z.y -= dt * 0.8; }
      if (z.dieT > 4.2) { ZOMBIES.splice(i, 1); }
      continue;
    }
    if (z.state === 'drop') { // boss falls from the sky
      z.vy = (z.vy || 0) - 40 * dt; z.y += z.vy * dt;
      if (z.y <= 0) { z.y = 0; z.state = 'roar'; z.roarT = 0; shake(1.2); AUD.slam(); AUD.roar(); flashLight(z.x, 2, z.z, [4, 1, 3], 30, 0.6);
        for (let k = 0; k < 90; k++) { const a = k / 90 * TAU; emit(z.x + Math.cos(a) * 2, 0.3, z.z + Math.sin(a) * 2, Math.cos(a) * 16, rand(0.5, 2), Math.sin(a) * 16, 0.8, [2.5, 0.5, 2.2], 0.5, 2, 2.5); }
        burst(z.x, 0.5, z.z, 60, [0.6, 0.5, 0.7], 8, 1.4, 0.8, 4, 1.5, 3);
      }
      continue;
    }
    // --- steering
    let tx = P.x, tz = P.z;
    if (GAME.state === 'title') { if (!z.wt || Math.hypot(z.wt[0] - z.x, z.wt[1] - z.z) < 2) z.wt = [rand(-30, 30), rand(-30, 30)]; tx = z.wt[0]; tz = z.wt[1]; }
    const dx = tx - z.x, dz = tz - z.z; const dist = Math.hypot(dx, dz) || 1e-3;
    const want = Math.atan2(dx, dz);
    let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const turn = z.type === 'runner' ? 7 : z.type === 'boss' ? 1.6 : 3.2;
    z.yaw += clamp(dyaw, -turn * dt, turn * dt);
    const reach = z.T.reach * (z.type === 'boss' ? 1 : z.scale) + 0.35;
    const slow = z.state === 'attack' || z.state === 'slam' || z.state === 'roar' ? 0 : 1;
    let spd = z.speed * slow * (z.burn > 0 ? 1.08 : 1) * (1 - z.flinch * 0.6);
    if (dist < reach * 0.8) spd = 0;
    // forward + sidestep when stuck
    let mx = Math.sin(z.yaw) * spd, mz = Math.cos(z.yaw) * spd;
    if (z.stuckT > 0.5) { mx += Math.cos(z.yaw) * z.side * spd * 0.9; mz -= Math.sin(z.yaw) * z.side * spd * 0.9; }
    z.x += (mx + z.vx) * dt; z.z += (mz + z.vz) * dt; z.vx *= Math.max(0, 1 - 6 * dt); z.vz *= Math.max(0, 1 - 6 * dt);
    // separation
    for (const o of ZOMBIES) { if (o === z || o.dead || o.state === 'drop') continue; const sx = z.x - o.x, sz = z.z - o.z, d2 = sx * sx + sz * sz, R = 0.55 * (z.scale + o.scale); if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d * 0.5; z.x += sx * k; z.z += sz * k; } }
    pushOutCircle(z, 0.32 * z.scale);
    const moved = Math.hypot(z.x - z.lastX, z.z - z.lastZ); z.lastX = z.x; z.lastZ = z.z;
    if (spd > 0.5 && moved < spd * dt * 0.3) z.stuckT += dt; else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
    if (z.stuckT > 2.5) { z.side *= -1; z.stuckT = 0.6; }
    z.phase += dt * (z.type === 'runner' ? 11 : z.type === 'brute' ? 4.2 : z.type === 'boss' ? 3.2 : 5.2) * (spd > 0.1 ? 1 : 0.15);
    // --- anti-stuck: if no progress toward the player for a while, re-enter from an avenue
    if (GAME.state === 'playing' && z.type !== 'boss') {
      if (dist < (z.bestD ?? 1e9) - 1) { z.bestD = dist; z.progT = 0; } else z.progT = (z.progT || 0) + dt;
      if ((z.progT > 9 && dist > 5) || !isFinite(z.x + z.z)) {
        let s = pick(WORLD.spawns); for (let k = 0; k < 8; k++) { s = pick(WORLD.spawns); if (Math.hypot(s[0] - P.x, s[1] - P.z) > 30) break; }
        z.x = s[0]; z.z = s[1]; z.lastX = z.x; z.lastZ = z.z; z.bestD = 1e9; z.progT = 0; z.stuckT = 0; z.vx = z.vz = 0;
      }
    }
    // --- groans
    z.groan -= dt;
    if (z.groan <= 0 && groanCd <= 0 && dist < 38) { z.groan = rand(4, 9); groanCd = 0.6; AUD.groan(PLAYER.panOf(z.x, z.z), clamp(0.16 - dist / 300, 0.03, 0.16), z.type === 'brute' ? 0.7 : z.type === 'runner' ? 1.3 : 1); z.jaw = 1; }
    z.jaw = Math.max(0, z.jaw - dt * 1.2);
    // --- attacks
    z.atkCd -= dt;
    if (z.type === 'boss') { updateBoss(z, dt, dist); continue; }
    if (z.state === 'walk' && dist < reach && z.atkCd <= 0) { z.state = 'attack'; z.atkT = 0; z.hitDone = false; }
    if (z.state === 'attack') {
      z.atkT += dt / z.T.atk;
      if (!z.hitDone && z.atkT > 0.55) { z.hitDone = true; if (dist < reach + 0.5 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg, z.x, z.z); }
      if (z.atkT >= 1) { z.state = 'walk'; z.atkCd = rand(0.3, 0.7); }
    }
  }
}
function updateBoss(z, dt, dist) {
  z.slamCd -= dt; z.summonCd -= dt;
  if (z.state === 'roar') { z.roarT += dt; z.jaw = 1; if (z.roarT > 1.4) { z.state = 'walk'; } return; }
  if (z.state === 'walk') {
    if (dist < 8 && z.slamCd <= 0) { z.state = 'slam'; z.atkT = 0; z.hitDone = false; AUD.groan(0, 0.35, 0.5); }
    else if (z.summonCd <= 0) { z.state = 'roar'; z.roarT = 0; z.summonCd = rand(13, 17); AUD.roar(); shake(0.3); for (let k = 0; k < 2 + Math.min(3, GAME.bossCount); k++) { const s = pick(WORLD.spawns); GAME.spawnExtra('runner', s[0] + rand(-3, 3), s[1] + rand(-3, 3)); } }
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
      if (pd < 7.5 && PLAYER.y < 0.9 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * (pd < 4 ? 1 : 0.6), fx, fz);
    }
    if (z.atkT >= 1) { z.state = 'walk'; z.slamCd = rand(3.5, 5.5); }
  }
}

/* -------- pose + draw -------- */
const _F = {}; ['root', 'pel', 'tor', 'neck', 'shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR'].forEach(k => _F[k] = M4.create());
const _tmpM = M4.create();
function fr(out, parent, px, py, pz, rx, ry, rz) { M4.trs(_tmpM, px, py, pz, rx, ry, rz, 1, 1, 1); return M4.mul(out, parent, _tmpM); }
function part(F, x, y, z, sx, sy, sz, col, emitC, flash, mesh = MESH.box, rx = 0, ry = 0, rz = 0) { M4.trs(_tmpM, x, y, z, rx, ry, rz, sx, sy, sz); const m = poolM(); M4.mul(m, F, _tmpM); drawItem(mesh, m, col, emitC, flash); return m; }

function drawZombie(z, time) {
  z._ps = STEPN.n;
  const s = z.scale, T = z.type, fl = z.flash > 0 ? 0.6 : 0;
  const burnK = z.burn > 0 ? 0.45 : 1;
  const sk = T === 'boss' ? [0.44, 0.34, 0.5] : z.skin; const skin = [sk[0] * burnK, sk[1] * burnK, sk[2] * burnK];
  const cloth = z.cloth, pants = z.pants;
  const p = z.phase;
  // death fall
  let fall = 0; if (z.state === 'dying') fall = easeOut(Math.min(1, z.dieT / 0.75)) * (Math.PI / 2 - 0.08) * -z.fallDir;
  // spawn (boss) / sink handled by y
  const w = Math.sin(p), c = Math.cos(p);
  let moving = z.state === 'walk' ? 1 : 0.2;
  const hipBob = Math.abs(c) * 0.05 * moving;
  M4.trs(_F.root, z.x, z.y, z.z, 0, z.yaw, 0, s, s, s);
  if (fall) { fr(_F.root, _F.root, 0, 0, 0, fall, 0, 0); }
  let lean = T === 'runner' ? 0.5 : T === 'brute' ? 0.22 : T === 'boss' ? 0.3 : 0.28;
  let shL = -1.35, shR = -1.25, elL = -0.25, elR = -0.35, spread = 0.12, headRx = -0.15, twist = w * 0.12 * moving;
  if (T === 'walker') { shL += Math.sin(p * 0.5 + z.seed) * 0.18; shR += Math.cos(p * 0.5 + z.seed) * 0.18; }
  if (T === 'runner') { shL = -0.5 - w * 0.95; shR = -0.5 + w * 0.95; elL = elR = -1.3; headRx = 0.35; spread = 0.2; }
  if (T === 'brute') { shL = -0.35 + w * 0.35; shR = -0.35 - w * 0.35; elL = elR = -0.5; spread = 0.3; }
  if (T === 'boss') { shL = -0.6 + w * 0.3; shR = -0.6 - w * 0.3; elL = elR = -0.7; spread = 0.35; }
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
  if (z.state === 'dying') { shL = shR = -2.6 * z.fallDir * 0.5 - 0.6; spread = 0.5; }
  lean -= z.flinch * 0.35; headRx -= z.flinch * 0.5;
  const hipY = 0.95 + hipBob;
  fr(_F.pel, _F.root, 0, hipY, 0, 0, twist, 0);
  fr(_F.tor, _F.pel, 0, 0.08, 0, lean, -twist * 1.5, Math.sin(p * 0.5) * 0.05);
  const roll = T === 'walker' ? Math.sin(time * 2.1 + z.seed) * 0.18 + 0.12 : Math.sin(time * 3 + z.seed) * 0.05;
  fr(_F.neck, _F.tor, 0, 0.6, 0.02, headRx + Math.sin(time * 5 + z.seed) * 0.05, 0, roll);
  fr(_F.shL, _F.tor, -0.27, 0.52, 0, shL, 0, -spread); fr(_F.shR, _F.tor, 0.27, 0.52, 0, shR, 0, spread);
  fr(_F.elL, _F.shL, 0, -0.32, 0, elL, 0, 0); fr(_F.elR, _F.shR, 0, -0.32, 0, elR, 0, 0);
  const legA = 0.55 * moving * (T === 'runner' ? 1.35 : 1);
  fr(_F.hipL, _F.pel, -0.11, -0.02, 0, w * legA, 0, 0.03); fr(_F.hipR, _F.pel, 0.11, -0.02, 0, -w * legA, 0, -0.03);
  fr(_F.knL, _F.hipL, 0, -0.45, 0, Math.max(0, -c) * 0.9 * moving + 0.05, 0, 0); fr(_F.knR, _F.hipR, 0, -0.45, 0, Math.max(0, c) * 0.9 * moving + 0.05, 0, 0);
  const thin = T === 'runner' ? 0.82 : 1, wide = T === 'brute' ? 1.25 : T === 'boss' ? 1.2 : 1;
  const armW = T === 'runner' ? 0.09 : T === 'brute' ? 0.15 : 0.11;
  // torso + pelvis
  part(_F.pel, 0, 0, 0, 0.36 * wide, 0.2, 0.22, pants, null, fl);
  part(_F.tor, 0, 0.3, 0, 0.44 * thin * wide, 0.58, 0.26 * wide, cloth, null, fl);
  part(_F.tor, 0, 0.3, 0.13 * wide, 0.14 * thin, 0.4, 0.02, skin, null, fl); // exposed chest
  // infection veins glowing through the skin
  if (z.state !== 'dying') { const e = z.T.eyes, k = (T === 'boss' ? 1.1 : 0.55) + 0.25 * Math.sin(time * 3 + z.seed);
    part(_F.tor, -0.05, 0.36, 0.132 * wide, 0.018, 0.22, 0.01, e, [e[0] * k, e[1] * k, e[2] * k], 0, MESH.box, 0, 0, 0.35);
    part(_F.elL, 0.0, -0.12, armW * 0.46, 0.012, 0.2, 0.012, e, [e[0] * k, e[1] * k, e[2] * k], 0); }
  if (z.trim && T !== 'boss') part(_F.tor, 0.2 * thin * wide, 0.3, 0.131 * wide, 0.025, 0.5, 0.01, z.trim, [z.trim[0] * 1.6, z.trim[1] * 1.6, z.trim[2] * 1.6], 0);
  if (T === 'brute') {
    part(_F.tor, 0, 0.36, 0.02, 0.62, 0.5, 0.36, [0.13, 0.13, 0.16], null, fl, MESH.metal);
    part(_F.tor, 0, 0.42, 0.19, 0.4, 0.04, 0.02, [1, 0.1, 0.4], [2.4, 0.2, 0.8], 0);
    part(_F.shL, 0, 0.02, 0, 0.26, 0.16, 0.26, [0.14, 0.14, 0.17], null, fl, MESH.metal); part(_F.shR, 0, 0.02, 0, 0.26, 0.16, 0.26, [0.14, 0.14, 0.17], null, fl, MESH.metal);
  }
  if (T === 'boss') {
    const pul = 0.6 + 0.4 * Math.sin(time * 6);
    part(_F.tor, 0, 0.5, -0.14, 0.7, 0.4, 0.3, [0.2, 0.16, 0.22], null, fl); // hunch
    for (let k = 0; k < 5; k++) part(_F.tor, (k - 2) * 0.12, 0.62 + Math.abs(k - 2) * -0.05, -0.22, 0.07, 0.3, 0.07, [0.9, 0.2, 0.8], [2.2 * pul, 0.3, 2 * pul], 0, MESH.cone, -0.6, 0, (k - 2) * 0.25);
    part(_F.tor, 0, 0.32, 0.14, 0.2, 0.2, 0.1, [1, 0.3, 0.9], [4 * pul, 0.8, 3.6 * pul], fl, MESH.sphere);
    part(_F.shL, 0, 0.0, 0, 0.3, 0.2, 0.3, [0.16, 0.14, 0.18], null, fl, MESH.metal); part(_F.shR, 0, 0.0, 0, 0.3, 0.2, 0.3, [0.16, 0.14, 0.18], null, fl, MESH.metal);
    part(_F.shL, 0, -0.1, 0, 0.31, 0.02, 0.31, [1, 0.3, 0.9], [2 * pul, 0.3, 1.8 * pul], 0); part(_F.shR, 0, -0.1, 0, 0.31, 0.02, 0.31, [1, 0.3, 0.9], [2 * pul, 0.3, 1.8 * pul], 0);
    part(_F.tor, 0.12, 0.2, 0.135, 0.02, 0.3, 0.01, [1, 0.3, 0.9], [2.4 * pul, 0.4, 2.2 * pul], 0, MESH.box, 0, 0, -0.4);
    part(_F.tor, -0.14, 0.45, 0.135, 0.02, 0.22, 0.01, [1, 0.3, 0.9], [2.4 * pul, 0.4, 2.2 * pul], 0, MESH.box, 0, 0, 0.6);
    for (let k = 0; k < 3; k++) part(_F.neck, (k - 1) * 0.07, 0.29, -0.02, 0.05, 0.14, 0.05, [0.9, 0.2, 0.8], [2 * pul, 0.3, 1.8 * pul], 0, MESH.cone, -0.2, 0, (k - 1) * 0.4);
  }
  // head
  if (!z.headless) {
    const hs = T === 'boss' ? 0.8 : 1;
    const hc = T === 'boss' ? [0.46, 0.36, 0.5] : skin;
    part(_F.neck, 0, 0.14 * hs, 0.02, 0.25 * hs, 0.27 * hs, 0.26 * hs, hc, null, fl);
    part(_F.neck, 0, 0.02 * hs, 0.06 + z.jaw * 0.03, 0.2 * hs, 0.06, 0.17 * hs, [skin[0] * 0.6, skin[1] * 0.5, skin[2] * 0.5], null, fl, MESH.box, z.jaw * 0.5);
    const e = z.T.eyes, eb = z.state === 'dying' ? 0.2 : 3.4;
    if (T === 'brute') part(_F.neck, 0, 0.17, 0.12, 0.28, 0.2, 0.08, [0.12, 0.12, 0.14], null, fl, MESH.metal), part(_F.neck, 0, 0.17, 0.162, 0.22, 0.03, 0.01, e, [e[0] * eb * 1.3, e[1] * eb, e[2] * eb], 0);
    else { part(_F.neck, -0.06 * hs, 0.16 * hs, 0.135 * hs, 0.06 * hs, 0.034 * hs, 0.02, e, [e[0] * eb, e[1] * eb, e[2] * eb], 0); part(_F.neck, 0.06 * hs, 0.16 * hs, 0.135 * hs, 0.06 * hs, 0.034 * hs, 0.02, e, [e[0] * eb, e[1] * eb, e[2] * eb], 0); }
    if (T === 'walker' && z.seed > 50) part(_F.neck, 0.06, 0.26, 0.0, 0.14, 0.04, 0.2, [0.12, 0.1, 0.1], null, fl); // hair tuft
  } else { part(_F.neck, 0, 0.0, 0.02, 0.12, 0.05, 0.12, [0.5, 1.2, 0.3], [0.5, 1.4, 0.3], 0); }
  // arms
  part(_F.shL, 0, -0.16, 0, armW, 0.34, armW, T === 'walker' && z.seed > 30 ? skin : cloth, null, fl); part(_F.shR, 0, -0.16, 0, armW, 0.34, armW, T === 'walker' && z.seed > 30 ? skin : cloth, null, fl);
  const bossArm = T === 'boss' ? 1.35 : 1;
  part(_F.elL, 0, -0.15, 0, armW * 0.9, 0.3, armW * 0.9, skin, null, fl); part(_F.elR, 0, -0.15 * bossArm, 0, armW * 0.9 * bossArm, 0.3 * bossArm, armW * 0.9 * bossArm, skin, null, fl);
  part(_F.elL, 0, -0.33, 0.01, armW * 0.85, 0.1, armW * 0.6, skin, null, fl); part(_F.elR, 0, -0.33 * bossArm - 0.02, 0.01, armW * 0.85 * bossArm, 0.1 * bossArm, armW * 0.7 * bossArm, skin, null, fl);
  if (T === 'boss') part(_F.elR, 0, -0.4 * bossArm, 0.02, 0.12, 0.12, 0.12, [1, 0.3, 0.9], [2.4, 0.4, 2.2], 0, MESH.cone, Math.PI);
  // legs
  part(_F.hipL, 0, -0.22, 0, 0.15 * wide, 0.46, 0.16 * wide, pants, null, fl); part(_F.hipR, 0, -0.22, 0, 0.15 * wide, 0.46, 0.16 * wide, pants, null, fl);
  part(_F.knL, 0, -0.22, 0, 0.13 * wide, 0.44, 0.13 * wide, pants, null, fl); part(_F.knR, 0, -0.22, 0, 0.13 * wide, 0.44, 0.13 * wide, pants, null, fl);
  part(_F.knL, 0, -0.45, 0.05, 0.13 * wide, 0.07, 0.25, [0.06, 0.06, 0.07], null, fl); part(_F.knR, 0, -0.45, 0.05, 0.13 * wide, 0.07, 0.25, [0.06, 0.06, 0.07], null, fl);
  // hit volumes
  M4.pt(_F.neck, 0, 0.14 * (T === 'boss' ? 0.8 : 1), 0.02, z.head);
  M4.pt(_F.pel, 0, -0.42, 0, z.a); M4.pt(_F.tor, 0, 0.5, 0, z.b);
  M4.pt(_F.tor, 0, 0.32, 0.14, z.core);
  // stuck arrows
  for (const sa of z.stuck) {
    const F = sa.part === 'head' ? _F.neck : _F.tor;
    const a = M4.pt(F, sa.lp[0], sa.lp[1], sa.lp[2], [0, 0, 0]);
    const d = M4.dir(F, sa.ld[0], sa.ld[1], sa.ld[2], [0, 0, 0]); const L = Math.hypot(d[0], d[1], d[2]) || 1;
    const len = 0.6; const bx = a[0] - d[0] / L * len, by = a[1] - d[1] / L * len, bz = a[2] - d[2] / L * len;
    const m = M4.align(poolM(), a[0], a[1], a[2], bx, by, bz, 0.02, 0.02); drawItem(MESH.box, m, [0.08, 0.08, 0.09]);
    const A = ARROWS[sa.type]; const m2 = M4.align(poolM(), bx + d[0] / L * 0.04, by + d[1] / L * 0.04, bz + d[2] / L * 0.04, bx, by, bz, 0.035, 0.035); drawItem(MESH.box, m2, A.color, A.glow);
  }
}
// convert world hit to local (for stuck arrows): we store in torso/head frame
function localize(z, part, pw, dir) {
  const F = part === 'head' ? _F.neck : _F.tor; // frames from last draw of THIS zombie are not retained; recompute
  drawZombieFramesOnly(z);
  const inv = M4.invert(M4.create(), F); if (!inv) return null;
  return { lp: M4.pt(inv, pw[0], pw[1], pw[2], [0, 0, 0]), ld: M4.dir(inv, dir[0], dir[1], dir[2], [0, 0, 0]) };
}
function drawZombieFramesOnly(z) {
  // recompute frames without drawing (swap draw target)
  const saved = DRAW_SUPPRESS.on; DRAW_SUPPRESS.on = true; drawZombie(z, GAME.time); DRAW_SUPPRESS.on = saved;
}
