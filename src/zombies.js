/* ============================================================
   The infected: walkers, runners, brutes and the Warden
   Sculpted in Blender (tools/make_models.py), animated procedurally here.
   ============================================================ */
const ZTYPES = {
  walker: { hp: 60, hpW: 10, speed: [1.5, 2.3], dmg: 10, scale: 1, score: 100, cash: 10, eyes: [0.65, 1, 0.25], reach: 1.35, atk: 0.85 },
  runner: { hp: 34, hpW: 5, speed: [4.9, 5.9], dmg: 7, scale: 0.94, score: 150, cash: 15, eyes: [1, 0.4, 0.1], reach: 1.3, atk: 0.6 },
  brute: { hp: 300, hpW: 34, speed: [1.25, 1.55], dmg: 24, scale: 1.55, score: 450, cash: 45, eyes: [1, 0.1, 0.25], reach: 2.0, atk: 1.1 },
  boss: { hp: 2000, hpW: 0, speed: [2.2, 2.2], dmg: 34, scale: 3.1, score: 6000, cash: 600, eyes: [1, 0.2, 0.9], reach: 3.6, atk: 1.2 },
};
const SKINS = [[0.46, 0.52, 0.40], [0.58, 0.54, 0.46], [0.42, 0.47, 0.50], [0.52, 0.46, 0.40], [0.47, 0.53, 0.45], [0.36, 0.33, 0.30]];
const CLOTHES = [[0.14, 0.15, 0.2], [0.26, 0.09, 0.1], [0.1, 0.18, 0.2], [0.3, 0.27, 0.22], [0.12, 0.12, 0.12], [0.3, 0.2, 0.09], [0.36, 0.36, 0.38], [0.2, 0.24, 0.16]];
const PANTS = [[0.1, 0.11, 0.16], [0.16, 0.14, 0.12], [0.08, 0.08, 0.09], [0.2, 0.2, 0.22], [0.13, 0.16, 0.11]];
const HAIRS = [[0.06, 0.05, 0.04], [0.16, 0.1, 0.06], [0.3, 0.27, 0.22], [0.05, 0.05, 0.06]];
const ZOMBIES = [];
const STEPN = { n: 0 };
function ensurePose(z) { if (z._ps !== STEPN.n) { if (ZRIG.ready) poseZombieRig(z, 0, GAME.time); else drawZombieFramesOnly(z); } }
let groanCd = 0;
const V0 = () => [0, 0, 0];

function spawnZombie(type, x, z, wave) {
  const T = ZTYPES[type];
  const hp = (T.hp + T.hpW * Math.max(0, wave - 1)) * (type === 'boss' ? 1 + Math.max(0, GAME.bossCount - 1) * 0.7 : 1);
  const zz = {
    type, T, x, y: 0, z, yaw: Math.atan2(-x, -z), hp, maxHp: hp, speed: rand(T.speed[0], T.speed[1]) * (1 + Math.min(0.35, wave * 0.02)), scale: T.scale * rand(0.95, 1.06),
    phase: Math.random() * TAU, state: 'walk', atkT: 0, atkCd: 0.5, flinch: 0, flash: 0, burn: 0, dieT: 0, dead: false,
    skin: pick(SKINS), cloth: pick(CLOTHES), pants: pick(PANTS), hair: pick(HAIRS), seed: Math.random() * 100, side: Math.random() < 0.5 ? -1 : 1,
    bare: Math.random() < 0.3, sleeve: Math.random() < 0.55, headVar: Math.random() < 0.5 ? 'a' : 'b',
    stuck: [], headless: false, jawGone: false, helmetGone: false, lastX: x, lastZ: z, stuckT: 0, hpBarT: 0, groan: rand(1, 6),
    slamCd: 4, summonCd: 10, roarT: 0, jaw: 0, vx: 0, vz: 0,
    // hit reactions (damped springs): head pitch, torso pitch, torso yaw, leg buckle
    R: { h: 0, hv: 0, t: 0, tv: 0, y: 0, yv: 0, l: 0, lv: 0 }, stumble: 0, legDmg: 0, crawl: false, crawlT: 0,
    // death physics
    dv: V0(), pitch: 0, pitchV: 0, roll: 0, rollV: 0, crumple: 0, crumpleMode: false, pin: null, neckBleed: 0, fallBack: false,
    head: V0(), a: V0(), b: V0(), core: V0(), hipL: V0(), knL: V0(), ftL: V0(), hipR: V0(), knR: V0(), ftR: V0(),
  };
  if (type === 'runner') zz.bare = Math.random() < 0.5;
  if (type === 'boss') { zz.y = 40; zz.state = 'drop'; zz.bare = true; zz.headVar = 'a'; }
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
    if (t !== null) { z.pin = { x: z.x + dir[0] * (t - 0.28), z: z.z + dir[2] * (t - 0.28), t: 0, yaw: Math.atan2(-dir[0], -dir[2]) }; }
  }
  if (!z.pin) {
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
  if (z.pin) {
    const P = z.pin; P.t += dt;
    const k = Math.min(1, dt * 18); z.x = lerp(z.x, P.x, k); z.z = lerp(z.z, P.z, k);
    let dy = ((P.yaw - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI; z.yaw += dy * Math.min(1, dt * 10);
    if (z.dieT > 3.6) z.y -= dt * 0.5;
    return;
  }
  if (z.crawl) { z.pitch = 0; if (z.dieT > 3.2) z.y -= dt * 0.5; return; }
  // translate with the hit's momentum, slide to a stop on the ground
  z.x += z.dv[0] * dt; z.z += z.dv[2] * dt; z.y += z.dv[1] * dt;
  if (z.y > 0.001) z.dv[1] -= 12 * dt; else { z.y = Math.max(z.y, z.dieT > 3.4 ? z.y : 0); z.dv[1] = Math.max(0, z.dv[1]); const f = Math.max(0, 1 - 5 * dt); z.dv[0] *= f; z.dv[2] *= f; }
  pushOutCircle(z, 0.28 * z.scale);
  // crumple: knees give first, then the body tips over
  if (z.crumpleMode && z.crumple < 1) { z.crumple = Math.min(1, z.crumple + dt * 2.6); if (z.crumple > 0.7 && z.pitchV === 0) z.pitchV = z.pitchSign * 0.6; }
  const lim = 1.5;
  if (Math.abs(z.pitch) < lim || z.y > 0.05) {
    z.pitchV += z.pitchSign * (4 + 9 * Math.abs(Math.sin(z.pitch))) * dt * (z.crumpleMode && z.crumple < 0.7 ? 0 : 1);
    z.pitch += z.pitchV * dt;
    if (Math.abs(z.pitch) >= lim && z.y <= 0.05) { z.pitch = lim * Math.sign(z.pitch); z.pitchV = -z.pitchV * 0.18; if (Math.abs(z.pitchV) > 0.8) { shakeNear(z, 0.08); bloodBurst(z.x, 0.1, z.z, null, 6, 0.6); } else z.pitchV = 0; }
  }
  z.roll = clamp(z.roll + z.rollV * dt, -0.6, 0.6); z.rollV *= Math.max(0, 1 - 3 * dt);
  if (z.dieT > 3.4) z.y -= dt * 0.55;
}
function shakeNear(z, a) { const d = Math.hypot(z.x - PLAYER.x, z.z - PLAYER.z); if (d < 10) shake(a * (1 - d / 10)); }

/* -------- update -------- */
function updateZombies(dt, time) {
  const P = PLAYER;
  groanCd -= dt;
  for (let i = ZOMBIES.length - 1; i >= 0; i--) {
    const z = ZOMBIES[i];
    z.flash = Math.max(0, z.flash - dt); z.flinch = Math.max(0, z.flinch - dt * 3); z.hpBarT = Math.max(0, z.hpBarT - dt); z.stumble = Math.max(0, z.stumble - dt);
    updateReact(z, dt);
    if (z.burn > 0) {
      z.burn -= dt;
      if (!z.dead) damageZombie(z, 14 * PLAYER.dmgMult * dt * (z.type === 'boss' ? 2 : 1), 'body', null, null, 1);
      if (Math.random() < dt * 40) emit(z.x + rand(-0.3, 0.3) * z.scale, z.y + rand(0.3, 1.7) * z.scale * (z.crawl ? 0.3 : 1), z.z + rand(-0.3, 0.3) * z.scale, rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), rand(0.3, 0.6), [2.4, 0.9 + Math.random() * 0.5, 0.15], rand(0.18, 0.35) * z.scale, -1, 1, -0.3);
    }
    if (z.state === 'dying') {
      updateDying(z, dt);
      if (z.dieT > 5.2) ZOMBIES.splice(i, 1);
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
    if (z.crawl) z.crawlT += dt;
    // --- steering
    let tx = P.x, tz = P.z;
    if (GAME.state === 'title') { if (!z.wt || Math.hypot(z.wt[0] - z.x, z.wt[1] - z.z) < 2) z.wt = [rand(-30, 30), rand(-30, 30)]; tx = z.wt[0]; tz = z.wt[1]; }
    const dx = tx - z.x, dz = tz - z.z; const dist = Math.hypot(dx, dz) || 1e-3;
    const want = Math.atan2(dx, dz);
    let dyaw = ((want - z.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const turn = z.crawl ? 1.8 : z.type === 'runner' ? 7 : z.type === 'boss' ? 1.6 : 3.2;
    z.yaw += clamp(dyaw, -turn * dt, turn * dt);
    const reach = z.crawl ? 1.25 : z.T.reach * (z.type === 'boss' ? 1 : z.scale) + 0.35;
    const slow = z.state === 'attack' || z.state === 'slam' || z.state === 'roar' ? 0 : 1;
    let spd = z.speed * slow * (z.burn > 0 ? 1.08 : 1) * (1 - z.flinch * 0.6) * (z.stumble > 0 ? 0.35 : 1);
    if (z.crawl) spd *= z.crawlT < 0.8 ? 0 : (0.6 + 0.4 * Math.max(0, Math.sin(z.phase)));  // lurching pulls
    if (dist < reach * 0.8) spd = 0;
    z.mv = spd;
    let mx = Math.sin(z.yaw) * spd, mz = Math.cos(z.yaw) * spd;
    if (z.stuckT > 0.5) { mx += Math.cos(z.yaw) * z.side * spd * 0.9; mz -= Math.sin(z.yaw) * z.side * spd * 0.9; }
    z.x += (mx + z.vx) * dt; z.z += (mz + z.vz) * dt; z.vx *= Math.max(0, 1 - 6 * dt); z.vz *= Math.max(0, 1 - 6 * dt);
    for (const o of ZOMBIES) { if (o === z || o.dead || o.state === 'drop') continue; const sx = z.x - o.x, sz = z.z - o.z, d2 = sx * sx + sz * sz, R = 0.55 * (z.scale + o.scale); if (d2 < R * R && d2 > 1e-6) { const d = Math.sqrt(d2), k = (R - d) / d * 0.5; z.x += sx * k; z.z += sz * k; } }
    pushOutCircle(z, 0.32 * z.scale);
    const moved = Math.hypot(z.x - z.lastX, z.z - z.lastZ); z.lastX = z.x; z.lastZ = z.z;
    if (spd > 0.5 && moved < spd * dt * 0.3) z.stuckT += dt; else z.stuckT = Math.max(0, z.stuckT - dt * 0.5);
    if (z.stuckT > 2.5) { z.side *= -1; z.stuckT = 0.6; }
    z.phase += dt * (z.crawl ? 3.2 : z.type === 'runner' ? 11 : z.type === 'brute' ? 4.2 : z.type === 'boss' ? 3.2 : 5.2) * (spd > 0.1 || z.crawl ? 1 : 0.15);
    if (GAME.state === 'playing' && z.type !== 'boss') {
      if (dist < (z.bestD ?? 1e9) - 1) { z.bestD = dist; z.progT = 0; } else z.progT = (z.progT || 0) + dt;
      if ((z.progT > (z.crawl ? 30 : 9) && dist > 5) || !isFinite(z.x + z.z)) {
        let s = pick(WORLD.spawns); for (let k = 0; k < 8; k++) { s = pick(WORLD.spawns); if (Math.hypot(s[0] - P.x, s[1] - P.z) > 30) break; }
        z.x = s[0]; z.z = s[1]; z.lastX = z.x; z.lastZ = z.z; z.bestD = 1e9; z.progT = 0; z.stuckT = 0; z.vx = z.vz = 0;
      }
    }
    z.groan -= dt;
    if (z.groan <= 0 && groanCd <= 0 && dist < 38) { z.groan = rand(4, 9); groanCd = 0.6; AUD.groan(PLAYER.panOf(z.x, z.z), clamp(0.16 - dist / 300, 0.03, 0.16), z.type === 'brute' ? 0.7 : z.type === 'runner' ? 1.3 : 1); z.jaw = 1; }
    z.jaw = Math.max(0, z.jaw - dt * 1.2);
    z.atkCd -= dt;
    if (z.type === 'boss') { updateBoss(z, dt, dist); continue; }
    if (z.state === 'walk' && dist < reach && z.atkCd <= 0 && (!z.crawl || z.crawlT > 0.8)) { z.state = 'attack'; z.atkT = 0; z.hitDone = false; }
    if (z.state === 'attack') {
      z.atkT += dt / z.T.atk;
      if (!z.hitDone && z.atkT > 0.55) { z.hitDone = true; if (dist < reach + 0.5 && GAME.state === 'playing') PLAYER.hurt(z.T.dmg * (z.crawl ? 0.7 : 1), z.x, z.z); }
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
    if (z.pin) {
      const sl = smooth(clamp((z.pin.t - 2.3) / 1.1, 0, 1));
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
  const e = z.T.eyes, vk = (T === 'boss' ? 1.6 : 1.0) * (dying ? 0.1 : 0.7 + 0.3 * Math.sin(time * 3 + z.seed));
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
  if (ZRIG.ready) ensurePose(z); else drawZombieFramesOnly(z);
  const F = zFrame(z, part);
  const inv = M4.invert(M4.create(), F); if (!inv) return null;
  return { lp: M4.pt(inv, pw[0], pw[1], pw[2], [0, 0, 0]), ld: M4.dir(inv, dir[0], dir[1], dir[2], [0, 0, 0]) };
}
function drawZombieFramesOnly(z) {
  const saved = DRAW_SUPPRESS.on; DRAW_SUPPRESS.on = true; drawZombie(z, GAME.time); DRAW_SUPPRESS.on = saved;
}
