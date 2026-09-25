/* ============================================================
   Particles, dynamic lights, floating damage numbers
   ============================================================ */
const MAXP = 5000;
const PART = { n: 0, data: new Float32Array(MAXP * 8), p: [] };
for (let i = 0; i < MAXP; i++) PART.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, r: 1, g: 1, b: 1, a: 1, size: 0.1, grav: 0, drag: 0, grow: 0, alive: false });
let _pi = 0;
function emit(x, y, z, vx, vy, vz, life, col, size, grav = 0, drag = 0, grow = 0, a = 1) {
  const p = PART.p[_pi]; _pi = (_pi + 1) % MAXP;
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.r = col[0]; p.g = col[1]; p.b = col[2]; p.a = a;
  p.size = size; p.grav = grav; p.drag = drag; p.grow = grow; p.alive = true; p.blood = false;
  return p;
}
function burst(x, y, z, n, col, speed, life, size, grav = 9, drag = 1, up = 0) {
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * TAU, s = Math.sqrt(1 - u * u), sp = speed * (0.3 + Math.random() * 0.7);
    emit(x, y, z, Math.cos(th) * s * sp, u * sp + up, Math.sin(th) * s * sp, life * (0.5 + Math.random() * 0.5), col, size * (0.6 + Math.random() * 0.8), grav, drag);
  }
}
function updateParticles(dt) {
  let n = 0; const d = PART.data;
  for (const p of PART.p) {
    if (!p.alive) continue;
    p.life -= dt; if (p.life <= 0) { p.alive = false; continue; }
    p.vy -= p.grav * dt; const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.03 && p.grav > 0) {
      if (p.blood) { if (Math.random() < 0.3) addDecal(p.x, p.z, Math.abs(p.size) * rand(2.5, 5)); p.alive = false; continue; }
      p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6;
    }
    p.size += p.grow * dt * Math.sign(p.size || 1);
    const t = p.life / p.max; const a = p.a * Math.min(1, t * 2.5);
    const o = n * 8; d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = p.r; d[o + 4] = p.g; d[o + 5] = p.b; d[o + 6] = a; d[o + 7] = p.size;
    n++;
  }
  PART.n = n;
}
// particle + rain GPU objects live in r3.js
const RAIN_N = 2600;

// dynamic lights (short-lived flashes + attached)
const DLIGHTS = [];
function flashLight(x, y, z, col, r, life) { DLIGHTS.push({ p: [x, y, z], c: col, r, life, max: life }); }
function updateLights(dt) { for (let i = DLIGHTS.length - 1; i >= 0; i--) { DLIGHTS[i].life -= dt; if (DLIGHTS[i].life <= 0) DLIGHTS.splice(i, 1); } }

// floating texts (screen-projected)
const FLOATS = [];
function floatText(x, y, z, text, color, size = 1, life = 0.9) { FLOATS.push({ x, y, z, text, color, size, life, max: life, vy: 1.4 }); if (FLOATS.length > 40) FLOATS.shift(); }
function updateFloats(dt) { for (let i = FLOATS.length - 1; i >= 0; i--) { const f = FLOATS[i]; f.life -= dt; f.y += f.vy * dt; f.vy *= 0.96; if (f.life <= 0) FLOATS.splice(i, 1); } }

// camera shake
const SHAKE = { amt: 0 };
function shake(a) { SHAKE.amt = Math.min(1.2, SHAKE.amt + a); }

/* ---------------- gore: dark blood (alpha-blended particles) + ground decals ---------------- */
function bloodBurst(x, y, z, dir, n, spread = 1, scale = 1) {
  for (let i = 0; i < n; i++) {
    const sp = rand(1.5, 5) * spread;
    const back = Math.random() < 0.65 ? 1 : -0.6; // most spray exits along the arrow's path
    const vx = (dir ? dir[0] * sp * back : 0) + rand(-1.6, 1.6) * spread, vy = rand(-0.5, 2.5) * spread, vz = (dir ? dir[2] * sp * back : 0) + rand(-1.6, 1.6) * spread;
    const c = rand(0.55, 1);
    const p = emit(x, y, z, vx, vy, vz, rand(0.5, 1.1), [0.32 * c, 0.02 * c, 0.02 * c], -rand(0.03, 0.08) * scale, 9.8, 0.6, 0, 1);
    p.blood = true;
  }
  for (let i = 0; i < Math.ceil(n / 4); i++) emit(x, y, z, rand(-0.4, 0.4), rand(-0.1, 0.4), rand(-0.4, 0.4), rand(0.3, 0.6), [0.22, 0.015, 0.015], -rand(0.12, 0.22) * scale, 0.5, 2, 0.5, 0.8); // mist
}
const DECALS = [];
function addDecal(x, z, r) {
  if (Math.abs(x) > 60 || Math.abs(z) > 60) return;
  DECALS.push({ x, z, r: clamp(r, 0.08, 1.4), rot: Math.random() * TAU, t: 0, v: Math.floor(Math.random() * 4) });
  if (DECALS.length > 90) DECALS.shift();
}
function updateDecals(dt) { for (let i = DECALS.length - 1; i >= 0; i--) { const d = DECALS[i]; d.t += dt; if (d.t > 45) DECALS.splice(i, 1); } }
const DECAL_TEX = [];
function makeDecalTextures() {
  for (let v = 0; v < 4; v++) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    const R = mulberry(31 + v * 17);
    const blob = (cx, cy, r, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(42,2,2,${a})`); g.addColorStop(0.7, `rgba(34,2,2,${a * 0.9})`); g.addColorStop(1, "rgba(25,1,1,0)"); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); };
    blob(64, 64, 30 + R() * 10, 0.95);
    for (let i = 0; i < 14; i++) { const a = R() * TAU, d = 20 + R() * 36; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + R() * 9, 0.9); }
    for (let i = 0; i < 5; i++) { const a = R() * TAU; x.strokeStyle = 'rgba(38,2,2,0.8)'; x.lineWidth = 2 + R() * 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * (40 + R() * 20), 64 + Math.sin(a) * (40 + R() * 20)); x.stroke(); }
    DECAL_TEX.push(canvasTex(cv));
  }
}

/* ---------------- debris: jaws, helmets knocked off by headshots ---------------- */
const DEBRIS = [];
function spawnDebris(mesh, pos, vel, scale, tint, skin, emit) {
  DEBRIS.push({ mesh, p: pos.slice(), v: vel.slice(), r: [rand(0, TAU), rand(0, TAU), 0], w: [rand(-9, 9), rand(-9, 9), rand(-9, 9)], s: scale, tint, skin, emit: emit || null, t: 0 });
  if (DEBRIS.length > 24) DEBRIS.shift();
}
function updateDebris(dt) {
  for (let i = DEBRIS.length - 1; i >= 0; i--) {
    const d = DEBRIS[i]; d.t += dt;
    d.v[1] -= 9.8 * dt; for (let k = 0; k < 3; k++) { d.p[k] += d.v[k] * dt; d.r[k] += d.w[k] * dt; }
    if (d.p[1] < 0.04) { d.p[1] = 0.04; d.v[1] *= -0.3; d.v[0] *= 0.6; d.v[2] *= 0.6; for (let k = 0; k < 3; k++) d.w[k] *= 0.6; if (Math.abs(d.v[1]) < 0.3) d.v[1] = 0; }
    if (d.t < 1 && Math.random() < dt * 25) { const p = emit(d.p[0], d.p[1], d.p[2], 0, 0, 0, 0.8, [0.3, 0.02, 0.02], -0.035, 9.8, 0.5); p.blood = true; }
    if (d.t > 20) DEBRIS.splice(i, 1);
  }
}
