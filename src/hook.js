/* ============================================================
   Grappling hook (Q): fire at any wall, pole, crane or container within 36 m,
   get reeled toward it, keep your momentum when it lets go. Streets only:
   you're pulled to a point just off the wall and below the anchor, so you
   never land on roofs (zombies can't reach them). High anchors mean long
   falls, and falls hurt, so the reticle shows the risk before you commit.
   ============================================================ */
const HOOK = { state: 'idle', cd: 0, t: 0, ax: 0, ay: 0, az: 0, tx: 0, ty: 0, tz: 0, hx: 0, hy: 0, hz: 0, flyT: 0, stuckT: 0, aim: null, aimT: 0 };
const HOOK_CFG = { range: 36, cooldown: 8, reel: 27, hang: 1.5, maxReel: 1.8, safeFall: 5, fallDmg: 5.5 };

// ray against the city's boxes and poles, returning the hit point, its surface normal and the top of what was hit
function hookRay(ox, oy, oz, dx, dy, dz, maxD) {
  let best = null;
  const ex = ox + dx * maxD, ez = oz + dz * maxD;
  const [boxes, circles] = worldCandidates(Math.min(ox, ex), Math.max(ox, ex), Math.min(oz, ez), Math.max(oz, ez));
  for (const b of boxes) {
    if (b.y1 < 0.6) continue;
    let t0 = 0, t1 = maxD, ok = true, ax0 = -1, sg = 0; const o = [ox, oy, oz], d = [dx, dy, dz], mn = [b.x0, b.y0, b.z0], mx = [b.x1, b.y1, b.z1];
    for (let a = 0; a < 3 && ok; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) ok = false; continue; }
      let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a], s = -1; if (ta > tb) { const q = ta; ta = tb; tb = q; s = 1; }
      if (ta > t0) { t0 = ta; ax0 = a; sg = s; } t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
    }
    if (ok && ax0 >= 0 && t0 > 0.5 && (!best || t0 < best.t)) { const n = [0, 0, 0]; n[ax0] = sg; best = { t: t0, n, top: b.y1 }; }
  }
  for (const c of circles) {
    if (c.h < 0.6) continue;
    const px = ox - c.x, pz = oz - c.z, A = dx * dx + dz * dz; if (A < 1e-9) continue;
    const B = 2 * (px * dx + pz * dz), C = px * px + pz * pz - c.r * c.r, D = B * B - 4 * A * C; if (D < 0) continue;
    const t = (-B - Math.sqrt(D)) / (2 * A); if (t < 0.5 || t > maxD || oy + dy * t > c.h) continue;
    if (!best || t < best.t) { const hx = px + dx * t, hz = pz + dz * t, L = Math.hypot(hx, hz) || 1; best = { t, n: [hx / L, 0, hz / L], top: c.h }; }
  }
  if (!best) return null;
  best.x = ox + dx * best.t; best.y = oy + dy * best.t; best.z = oz + dz * best.t;
  return best;
}
// where a hook along the view would take you, and how far you'd fall from there
function hookAim() {
  camBasis();
  const P = PLAYER, h = hookRay(P.x, P.y + 1.62, P.z, _cf[0], _cf[1], _cf[2], HOOK_CFG.range);
  if (!h) return null;
  const ty = clamp(Math.min(h.y, h.top - 0.3) - HOOK_CFG.hang, 0, 400);
  h.tx = h.x + h.n[0] * 0.75; h.tz = h.z + h.n[2] * 0.75; h.ty = ty;
  h.drop = Math.max(0, h.ty + 0.4);   // you let go with a little upward hop, then fall to the street
  return h;
}
function hookRisk(drop) { return drop <= HOOK_CFG.safeFall ? 0 : Math.round((drop - HOOK_CFG.safeFall) * HOOK_CFG.fallDmg); }

function hookFire() {
  if (GAME.state !== 'playing' || PLAYER.dead) return;
  if (HOOK.state !== 'idle') { if (HOOK.state === 'reel') hookRelease(); return; }   // Q again cuts the rope
  if (HOOK.cd > 0) { AUD.deny(); return; }
  const h = hookAim();
  bowCancel();
  camBasis();
  if (!h) {   // nothing in range: the hook flies out and falls short
    HOOK.state = 'whiff'; HOOK.t = 0; HOOK.cd = 1;
    HOOK.ax = PLAYER.x + _cf[0] * HOOK_CFG.range; HOOK.ay = PLAYER.y + 1.62 + _cf[1] * HOOK_CFG.range; HOOK.az = PLAYER.z + _cf[2] * HOOK_CFG.range;
    AUD.hookFire(); return;
  }
  Object.assign(HOOK, { state: 'fly', t: 0, ax: h.x, ay: h.y, az: h.z, tx: h.tx, ty: h.ty, tz: h.tz, flyT: h.t / 140, cd: HOOK_CFG.cooldown, stuckT: 0 });
  AUD.hookFire();
}
function hookRelease() {
  const P = PLAYER;
  if (HOOK.state === 'reel') { P.vy = clamp(P.vy, -4, 1.5) + 2.5; P.fling = true; }   // a small hop off the rope; the fall is what the reticle promised
  HOOK.state = 'idle'; AUD.hookRelease();
}
// hand point for the rope: low and to the right of the camera
function hookHand(out) { camBasis(); const P = PLAYER; out[0] = P.x + _cr[0] * 0.28 + _cf[0] * 0.3; out[1] = P.y + 1.3; out[2] = P.z + _cr[2] * 0.28 + _cf[2] * 0.3; return out; }
const _hh = [0, 0, 0];

// runs inside updatePlayer; returns true while the hook owns the player's movement
function updateHook(dt) {
  const P = PLAYER;
  HOOK.cd = Math.max(0, HOOK.cd - dt);
  HOOK.aimT -= dt; if (HOOK.aimT <= 0) { HOOK.aimT = 0.05; HOOK.aim = HOOK.state === 'idle' && HOOK.aiming ? hookAim() : null; }   // only while Q is held
  if (HOOK.state === 'whiff') { HOOK.t += dt; if (HOOK.t > 0.35) HOOK.state = 'idle'; return false; }
  if (HOOK.state === 'fly') {
    HOOK.t += dt; const k = Math.min(1, HOOK.t / HOOK.flyT);
    hookHand(_hh); HOOK.hx = lerp(_hh[0], HOOK.ax, k); HOOK.hy = lerp(_hh[1], HOOK.ay, k); HOOK.hz = lerp(_hh[2], HOOK.az, k);
    if (k >= 1) { HOOK.state = 'reel'; HOOK.t = 0; AUD.hookAttach(); burst(HOOK.ax, HOOK.ay, HOOK.az, 14, [1.6, 1.4, 1.1], 4, 0.3, 0.05, 6, 1.6); }
    return false;
  }
  if (HOOK.state !== 'reel') return false;
  HOOK.t += dt;
  const dx = HOOK.tx - P.x, dy = HOOK.ty - P.y, dz = HOOK.tz - P.z, d = Math.hypot(dx, dy, dz) || 1e-3;
  const sp = HOOK_CFG.reel * Math.min(1, 0.45 + HOOK.t * 2.5);          // ramps up over the first quarter second
  const k = Math.min(1, dt * 9);
  P.vx = lerp(P.vx, dx / d * sp, k); P.vy = lerp(P.vy, dy / d * sp, k); P.vz = lerp(P.vz, dz / d * sp, k);
  const x0 = P.x, z0 = P.z, y0 = P.y;
  P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt; P.y = Math.max(0, P.y); P.grounded = false;
  pushOutCircle(P, 0.42);
  const moved = Math.hypot(P.x - x0, P.y - y0, P.z - z0);
  if (moved < sp * dt * 0.25) HOOK.stuckT += dt; else HOOK.stuckT = 0;
  if (d < 1.4 || HOOK.t > HOOK_CFG.maxReel || HOOK.stuckT > 0.2) hookRelease();
  AUD.hookReel(dt, sp / HOOK_CFG.reel);
  return true;
}
// falls: anything past 5 m hurts, and it climbs fast
function hookLanded(drop) {
  const d = hookRisk(drop);
  if (d > 0) { PLAYER.hurt(d, PLAYER.x + Math.sin(PLAYER.yaw) * 0.01, PLAYER.z + 0.01); shake(0.4 + d / 60); GAME.toast(`HARD LANDING  -${d}`, '#ff5a3c'); }
}

function drawHook() {
  if (HOOK.state === 'idle' || GAME.state === 'title') return;
  hookHand(_hh);
  let ex = HOOK.ax, ey = HOOK.ay, ez = HOOK.az;
  if (HOOK.state === 'fly') { ex = HOOK.hx; ey = HOOK.hy; ez = HOOK.hz; }
  if (HOOK.state === 'whiff') { const k = Math.sin(Math.min(1, HOOK.t / 0.35) * Math.PI) * 0.55; ex = lerp(_hh[0], HOOK.ax, k); ey = lerp(_hh[1], HOOK.ay, k) - k * 4; ez = lerp(_hh[2], HOOK.az, k); }
  drawItem(MESH.box, M4.align(poolM(), _hh[0], _hh[1], _hh[2], ex, ey, ez, 0.012, 0.012), [0.9, 0.95, 1], [0.6, 1.4, 1.8]);
  drawItem(MESH.box, M4.trs(poolM(), ex, ey, ez, 0, 0, 0, 0.12, 0.12, 0.12), [0.2, 0.2, 0.22], [0.9, 1.8, 2.2]);
}
// reticle: a ring round the crosshair when a hook point is in range, coloured by how far you'd fall
function drawHookHUD(hx, cx, cy, W, H) {
  const h = HOOK.aim, cdK = HOOK.cd / HOOK_CFG.cooldown;
  if (HOOK.state === 'idle' && HOOK.aiming && h && cdK <= 0) {   // preview only while Q is held
    const risk = hookRisk(h.drop), col = risk <= 0 ? '#a6ff3a' : risk < 40 ? '#ffb52e' : '#ff3040';
    const p = toScreen(h.x, h.y, h.z, W, H);
    if (p) { hx.strokeStyle = col; hx.lineWidth = 2; hx.globalAlpha = 0.9; hx.beginPath(); hx.arc(p[0], p[1], 7, 0, TAU); hx.stroke();
      hx.beginPath(); hx.moveTo(p[0] - 11, p[1]); hx.lineTo(p[0] - 4, p[1]); hx.moveTo(p[0] + 4, p[1]); hx.lineTo(p[0] + 11, p[1]); hx.stroke(); hx.globalAlpha = 1; }
    hx.font = '700 12px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = col;
    hx.fillText(risk <= 0 ? `Q  GRAPPLE ${Math.round(h.t)} m` : risk < 40 ? `Q  GRAPPLE · FALL -${risk}` : `Q  GRAPPLE · FALL -${risk} !`, cx, cy + 46);
  }
  // cooldown arc under the crosshair
  if (cdK > 0) { hx.strokeStyle = '#bff6ff'; hx.globalAlpha = 0.55; hx.lineWidth = 2; hx.beginPath(); hx.arc(cx, cy, 44, Math.PI * 0.62, Math.PI * 0.62 + Math.PI * 0.76 * (1 - cdK)); hx.stroke(); hx.globalAlpha = 1; }
}
