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
  p.size = size; p.grav = grav; p.drag = drag; p.grow = grow; p.alive = true;
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
    if (p.y < 0.03 && p.grav > 0) { p.y = 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
    p.size += p.grow * dt;
    const t = p.life / p.max; const a = p.a * Math.min(1, t * 2.5);
    const o = n * 8; d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = p.r; d[o + 4] = p.g; d[o + 5] = p.b; d[o + 6] = a; d[o + 7] = p.size;
    n++;
  }
  PART.n = n;
}
const PVAO = gl.createVertexArray(), PVBO = gl.createBuffer();
gl.bindVertexArray(PVAO); gl.bindBuffer(gl.ARRAY_BUFFER, PVBO); gl.bufferData(gl.ARRAY_BUFFER, MAXP * 32, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 12);
gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 32, 28);
gl.bindVertexArray(null);

// rain
const RAIN_N = 2600;
const RAINVAO = (function () {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const a = new Float32Array(RAIN_N * 2 * 5);
  for (let i = 0; i < RAIN_N; i++) { const x = Math.random() * 50, z = Math.random() * 50, y = Math.random() * 36, s = Math.random(); for (let e = 0; e < 2; e++) { const o = (i * 2 + e) * 5; a[o] = x; a[o + 1] = z; a[o + 2] = y; a[o + 3] = s; a[o + 4] = e; } }
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
  gl.bindVertexArray(null); return vao;
})();

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
