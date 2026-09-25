/* ============================================================
   Open city: navigation flow field, spawning around the player,
   supply caches + armory terminals, ambient emitters, minimap
   ============================================================ */
const NAV = { cell: 1.5, x0: -142, z0: -142, w: 0, h: 0, block: null, dist: null, queue: null, t: 0, ready: false };
const NAV_INF = 65535;

function navIdx(x, z) { const i = Math.floor((x - NAV.x0) / NAV.cell), j = Math.floor((z - NAV.z0) / NAV.cell); return (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) ? -1 : j * NAV.w + i; }
function navCenter(k, out) { out[0] = NAV.x0 + (k % NAV.w + 0.5) * NAV.cell; out[1] = NAV.z0 + (Math.floor(k / NAV.w) + 0.5) * NAV.cell; return out; }

function buildNav() {
  const c = NAV.cell; NAV.w = Math.ceil((142 - NAV.x0) / c); NAV.h = Math.ceil((WORLD_BOUNDS.z1 + 2 - NAV.z0) / c);
  const N = NAV.w * NAV.h, B = new Uint8Array(N);
  const mark = (x0, x1, z0, z1) => {
    const i0 = Math.max(0, Math.floor((x0 - NAV.x0) / c)), i1 = Math.min(NAV.w - 1, Math.floor((x1 - NAV.x0) / c));
    const j0 = Math.max(0, Math.floor((z0 - NAV.z0) / c)), j1 = Math.min(NAV.h - 1, Math.floor((z1 - NAV.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) B[j * NAV.w + i] = 1;
  };
  const pad = 0.35;
  for (const b of WORLD.boxes) if (b.y0 < 1.2 && b.y1 > 0.5) mark(b.x0 - pad, b.x1 + pad, b.z0 - pad, b.z1 + pad);
  for (const q of WORLD.circles) if (q.h > 0.5) mark(q.x - q.r - pad, q.x + q.r + pad, q.z - q.r - pad, q.z + q.r + pad);
  for (const q of WORLD.navBlocks) mark(q.x0, q.x1, q.z0, q.z1);   // off-limits ground (the forest round the grove)
  // keep only cells reachable from the plaza
  const reach = new Uint8Array(N), Q = new Int32Array(N); let qh = 0, qt = 0;
  const s0 = navIdx(0, 14); reach[s0] = 1; Q[qt++] = s0;
  while (qh < qt) { const k = Q[qh++], i = k % NAV.w, j = (k / NAV.w) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NAV.w || b >= NAV.h) continue; const n = b * NAV.w + a; if (!reach[n] && !B[n]) { reach[n] = 1; Q[qt++] = n; } } }
  for (let k = 0; k < N; k++) if (!reach[k]) B[k] = 1;
  NAV.block = B; NAV.dist = new Uint16Array(N).fill(NAV_INF); NAV.queue = new Int32Array(N);
  NAV.walk = []; for (let k = 0; k < N; k++) if (!B[k]) NAV.walk.push(k);
  NAV.ready = true;
  buildMinimap();
}
// breadth-first distances (in cells, 8-connected without corner cutting) from the player
const _nb = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
function navUpdate(px, pz) {
  const D = NAV.dist, B = NAV.block, W = NAV.w, H = NAV.h, Q = NAV.queue, N = Q.length;
  const inQ = NAV.inQ || (NAV.inQ = new Uint8Array(N)); D.fill(NAV_INF); inQ.fill(0);
  let s = navIdx(px, pz); if (s < 0) return; if (B[s]) s = navNearestFree(s); if (s < 0) return;
  let qh = 0, qt = 0, cnt = 0; D[s] = 0; Q[qt] = s; qt = (qt + 1) % N; cnt++; inQ[s] = 1;
  while (cnt > 0) {   // label-correcting shortest paths with octile costs (10 / 14)
    const k = Q[qh]; qh = (qh + 1) % N; cnt--; inQ[k] = 0;
    const i = k % W, j = (k / W) | 0, dk = D[k];
    for (let n = 0; n < 8; n++) {
      const a = i + _nb[n][0], b = j + _nb[n][1]; if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const m = b * W + a; if (B[m]) continue;
      if (n >= 4 && (B[j * W + a] || B[b * W + i])) continue;
      const nd = dk + _nb[n][2];
      if (nd < D[m]) { D[m] = nd; if (!inQ[m]) { Q[qt] = m; qt = (qt + 1) % N; cnt++; inQ[m] = 1; } }
    }
  }
}
function navNearestFree(k) {
  const W = NAV.w, i0 = k % W, j0 = (k / W) | 0;
  for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i0 + di, b = j0 + dj; if (a < 0 || b < 0 || a >= W || b >= NAV.h) continue; const m = b * W + a; if (!NAV.block[m]) return m; }
  return -1;
}
function navDistAt(x, z) { const k = navIdx(x, z); if (k < 0) return 1e9; const d = NAV.dist[NAV.block[k] ? Math.max(0, navNearestFree(k)) : k]; return d === NAV_INF ? 1e9 : d / 10 * NAV.cell; }
// steering target for a zombie: a point two cells down the distance field
const _nc = [0, 0];
function navTarget(x, z, out) {
  let k = navIdx(x, z); if (k < 0) return false;
  if (NAV.block[k]) { k = navNearestFree(k); if (k < 0) return false; }
  const W = NAV.w, D = NAV.dist, B = NAV.block;
  for (let step = 0; step < 2; step++) {
    const i = k % W, j = (k / W) | 0; let best = k, bd = D[k];
    for (let n = 0; n < 8; n++) { const a = i + _nb[n][0], b = j + _nb[n][1]; if (a < 0 || b < 0 || a >= W || b >= NAV.h) continue; const m = b * W + a; if (B[m]) continue; if (n >= 4 && (B[j * W + a] || B[b * W + i])) continue; if (D[m] < bd) { bd = D[m]; best = m; } }
    if (best === k) break; k = best;
  }
  navCenter(k, out); return D[k] !== NAV_INF;
}
function navNearestPoint(x, z) { let k = navIdx(clamp(x, NAV.x0 + 1, 140), clamp(z, NAV.z0 + 1, WORLD_BOUNDS.z1)); if (k < 0 || NAV.block[k]) k = navNearestFree(k < 0 ? navIdx(0, 14) : k); if (k < 0) return [0, 14]; return navCenter(k, [0, 0]); }
// a spawn point out of sight, 26–60 m of walking from the player
function navSpawnPoint(minD = 26, maxD = 62) {
  let best = null, bestScore = -1;
  for (let t = 0; t < 40; t++) {
    const k = NAV.walk[Math.floor(Math.random() * NAV.walk.length)], d = NAV.dist[k] / 10 * NAV.cell;
    if (NAV.dist[k] === NAV_INF || d < minD || d > maxD * (t > 30 ? 1.6 : 1)) continue;
    const p = navCenter(k, [0, 0]); const eu = Math.hypot(p[0] - PLAYER.x, p[1] - PLAYER.z); if (eu < 20) continue;
    const dx = p[0] - PLAYER.x, dy = 1.2 - (PLAYER.y + 1.62), dz = p[1] - PLAYER.z;
    const hit = rayWorld(PLAYER.x, PLAYER.y + 1.62, PLAYER.z, dx, dy, dz, eu);
    const score = (hit !== null && hit < eu - 1 ? 2 : 0) + Math.random();
    if (score > bestScore) { bestScore = score; best = p; }
    if (bestScore >= 2 && t > 8) break;
  }
  return best || navCenter(NAV.walk[Math.floor(Math.random() * NAV.walk.length)], [0, 0]);
}

/* ---------------- supplies ---------------- */
function nearestSupply(kind, x, z) {
  let best = null, bd = 1e9;
  for (const s of WORLD.supplies) { if (s.kind !== kind) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best ? { s: best, d: bd } : null;
}
function updateSupplies(dt) {
  for (const s of WORLD.supplies) {
    s.cd = Math.max(0, (s.cd || 0) - dt);
    if (GAME.state !== 'playing' || PLAYER.dead) continue;
    const d = Math.hypot(s.x - PLAYER.x, s.z - PLAYER.z);
    if (s.kind === 'cache' && s.cd <= 0 && d < 1.9) {
      PLAYER.ammo[1] += 2; PLAYER.ammo[2] += 1; PLAYER.ammo[3] += 2; PLAYER.hp = Math.min(PLAYER.maxHp, PLAYER.hp + 15);
      s.cd = 70; AUD.pickup(); updateQuiverHUD();
      GAME.toast('SUPPLY CACHE  +2 FIRE  +1 PLASMA  +2 RAIL  +15 HP', '#ffb52e');
      burst(s.x, 1, s.z, 36, [2.4, 1.6, 0.5], 4, 0.6, 0.08, 0, 2);
    }
  }
  const t = nearestSupply('terminal', PLAYER.x, PLAYER.z);
  GAME.nearTerminal = GAME.intermission && t && t.d < 2.6 ? t.s : null;
}
function drawSupplies(time) {
  for (const s of WORLD.supplies) {
    if (Math.abs(s.x - PLAYER.x) > 90 || Math.abs(s.z - PLAYER.z) > 90) continue;
    if (s.kind === 'cache') {
      const on = s.cd <= 0, k = on ? 0.6 + 0.4 * Math.sin(time * 4 + s.x) : 0.08;
      drawItem(MESH.sphere, M4.trs(poolM(), s.x + 0.55, 1.8, s.z - 0.3, 0, 0, 0, 0.12, 0.12, 0.12), [1, 0.6, 0.2], [3 * k, 1.8 * k, 0.4 * k]);
      if (on) drawItem(MESH.cyl, M4.trs(poolM(), s.x, 6, s.z, 0, 0, 0, 0.06, 12, 0.06), [1, 0.7, 0.3], [1.2 * k, 0.7 * k, 0.15 * k]);
    } else {
      const on = GAME.intermission, k = on ? 0.7 + 0.3 * Math.sin(time * 5) : 0.2;
      drawItem(MESH.ring, M4.trs(poolM(), s.x, 3.1 + Math.sin(time * 2) * 0.1, s.z, 0, time, 0, 0.7, 1, 0.7), [0.2, 0.9, 1], [0.4 * k, 2 * k, 2.6 * k]);
      if (on) drawItem(MESH.cyl, M4.trs(poolM(), s.x, 14, s.z, 0, 0, 0, 0.12, 24, 0.12), [0.3, 0.9, 1], [0.3, 1.6, 2.2]);
    }
  }
}

/* ---------------- ambient emitters: steam vents, burn barrels, rain splashes ---------------- */
function updateAmbient(dt) {
  const px = PLAYER.x, pz = PLAYER.z;
  for (const s of WORLD.steam) {
    if (Math.abs(s[0] - px) > 45 || Math.abs(s[2] - pz) > 45) continue;
    if (Math.random() < dt * 14) emit(s[0] + rand(-0.2, 0.2), s[1], s[2] + rand(-0.2, 0.2), rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2), rand(1.4, 2.4), [0.1, 0.1, 0.11], -rand(0.4, 0.8), -0.3, 0.6, 0.9, 0.5);
  }
  for (const f of WORLD.fires) {
    if (Math.abs(f.x - px) > 50 || Math.abs(f.z - pz) > 50) continue;
    if (Math.random() < dt * 30) emit(f.x + rand(-0.2, 0.2), f.y, f.z + rand(-0.2, 0.2), rand(-0.15, 0.15), rand(1.2, 2.2), rand(-0.15, 0.15), rand(0.3, 0.6), [2.6, 1 + Math.random() * 0.5, 0.15], rand(0.2, 0.4), -1, 1, -0.3);
    if (Math.random() < dt * 4) emit(f.x, f.y + 0.6, f.z, rand(-0.2, 0.2), rand(1, 1.6), rand(-0.2, 0.2), 1.6, [0.05, 0.045, 0.045], -0.4, -0.2, 0.5, 0.8, 0.4);
  }
  // cherry blossom petals drifting down from nearby canopies
  for (const t of WORLD.petals) {
    const dx = t[0] - px, dz = t[2] - pz; if (dx * dx + dz * dz > 45 * 45) continue;
    if (Math.random() < dt * 7) { const a = Math.random() * TAU, r = Math.random() * t[3];
      emit(t[0] + Math.cos(a) * r, t[1] + rand(-0.4, 0.3), t[2] + Math.sin(a) * r, rand(0.2, 0.7), rand(-0.5, -0.2), rand(-0.3, 0.3), rand(5, 8), [1.0, 0.5 + Math.random() * 0.15, 0.68], rand(0.04, 0.07), 0.25, 0.9, 0, 0.95); }
  }
  // wading through a pond: little splashes round the ankles
  if (PLAYER.y < 0.05 && inPond(px, pz) && Math.hypot(PLAYER.vx, PLAYER.vz) > 1 && Math.random() < dt * 24)
    emit(px + rand(-0.3, 0.3), 0.05, pz + rand(-0.3, 0.3), rand(-0.8, 0.8), rand(1, 2), rand(-0.8, 0.8), 0.35, [0.45, 0.55, 0.62], 0.04, 9, 0, 0, 0.7);
  // rain splashes on the ground around the camera
  const n = THEME.rain * dt * 90;
  for (let i = 0; i < n; i++) {
    if (Math.random() > n - i) break;
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 14, x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    const rc = THEME.rainCol;
    for (let k = 0; k < 2; k++) emit(x, 0.04, z, rand(-0.6, 0.6), rand(0.8, 1.6), rand(-0.6, 0.6), 0.16, [rc[0] * 0.6, rc[1] * 0.6, rc[2] * 0.6], 0.035, 9, 0, 0, 0.8);
  }
}

/* ---------------- minimap ---------------- */
const MINI = { cv: null, scale: 2 };
function buildMinimap() {
  const s = MINI.scale, W = Math.ceil((142 - NAV.x0) * s), H = Math.ceil((WORLD_BOUNDS.z1 + 2 - NAV.z0) * s);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
  const img = x.createImageData(W, H), D = img.data;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const k = navIdx(NAV.x0 + (px + 0.5) / s, NAV.z0 + (py + 0.5) / s); if (k < 0 || NAV.block[k]) continue;
    const o = (py * W + px) * 4; D[o] = 46; D[o + 1] = 54; D[o + 2] = 66; D[o + 3] = 235;
  }
  x.putImageData(img, 0, 0);
  // building edges read better with a soft outline
  x.globalCompositeOperation = 'destination-over'; x.shadowColor = 'rgba(120,200,255,0.5)'; x.shadowBlur = 3; x.drawImage(cv, 0, 0);
  MINI.cv = cv;
}
function drawMinimap(hx, W, H, time) {
  if (!MINI.cv || GAME.state === 'title') return;
  const R = clamp(Math.min(W, H) * 0.11, 58, 92), cx = 24 + R, cy = 98 + R, s = MINI.scale * 0.9;
  hx.save();
  hx.beginPath(); hx.arc(cx, cy, R, 0, TAU); hx.fillStyle = 'rgba(6,8,14,0.72)'; hx.fill(); hx.clip();
  hx.translate(cx, cy); hx.rotate(PLAYER.yaw); hx.scale(s / MINI.scale, s / MINI.scale);
  hx.drawImage(MINI.cv, (NAV.x0 - PLAYER.x) * MINI.scale, (NAV.z0 - PLAYER.z) * MINI.scale);
  hx.setTransform(1, 0, 0, 1, 0, 0); const dpr = Math.min(2, devicePixelRatio || 1); hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cy_ = Math.cos(PLAYER.yaw), sy_ = Math.sin(PLAYER.yaw);
  const map = (x, z) => { const dx = (x - PLAYER.x) * s, dz = (z - PLAYER.z) * s; return [cx + dx * cy_ - dz * sy_, cy + dx * sy_ + dz * cy_]; };
  hx.beginPath(); hx.arc(cx, cy, R, 0, TAU); hx.clip();
  for (const sp of WORLD.supplies) {
    const [x, y] = map(sp.x, sp.z);
    if (sp.kind === 'terminal') { hx.fillStyle = GAME.intermission ? '#29e7ff' : 'rgba(41,231,255,0.45)'; hx.fillRect(x - 3.5, y - 3.5, 7, 7); }
    else { hx.fillStyle = sp.cd > 0 ? 'rgba(255,181,46,0.3)' : '#ffb52e'; hx.beginPath(); hx.moveTo(x, y - 4); hx.lineTo(x + 4, y); hx.lineTo(x, y + 4); hx.lineTo(x - 4, y); hx.fill(); }
  }
  for (const p of PICKUPS) { const [x, y] = map(p.x, p.z); hx.fillStyle = p.kind === 'health' ? '#6dff9a' : '#ffd23a'; hx.fillRect(x - 1.5, y - 1.5, 3, 3); }
  for (const z of ZOMBIES) { if (z.dead) continue; const [x, y] = map(z.x, z.z); hx.fillStyle = z.type === 'boss' ? '#ff3df0' : z.type === 'brute' ? '#ff6b3d' : '#ff3040'; const r = z.type === 'boss' ? 4.5 : z.type === 'brute' ? 3 : 2.2; hx.beginPath(); hx.arc(x, y, r, 0, TAU); hx.fill(); }
  hx.restore();
  // player + ring
  hx.fillStyle = '#ffffff'; hx.beginPath(); hx.moveTo(cx, cy - 6); hx.lineTo(cx + 4.5, cy + 5); hx.lineTo(cx, cy + 2.5); hx.lineTo(cx - 4.5, cy + 5); hx.fill();
  hx.strokeStyle = 'rgba(160,200,230,0.35)'; hx.lineWidth = 1.5; hx.beginPath(); hx.arc(cx, cy, R, 0, TAU); hx.stroke();
  hx.font = '700 11px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = 'rgba(200,220,240,0.85)'; hx.fillText(districtAt(PLAYER.x, PLAYER.z).name, cx, cy + R + 14);
  // N marker
  const nx = cx + Math.sin(PLAYER.yaw) * (R - 8), ny = cy - Math.cos(PLAYER.yaw) * (R - 8);
  hx.fillStyle = 'rgba(255,255,255,0.7)'; hx.font = '700 10px "Quiver Cn", sans-serif'; hx.fillText('N', nx, ny + 3);
}
// on-screen pointer to the nearest armory terminal during an intermission
function drawObjective(hx, W, H) {
  if (!GAME.intermission || GAME.state !== 'playing') return;
  const t = nearestSupply('terminal', PLAYER.x, PLAYER.z); if (!t) return;
  const cx = W / 2, cy = H / 2;
  const ang = Math.atan2(t.s.x - PLAYER.x, t.s.z - PLAYER.z), fwd = Math.atan2(-Math.sin(PLAYER.yaw), -Math.cos(PLAYER.yaw));
  let rel = ang - fwd; rel = ((rel + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const R = Math.min(W, H) * 0.3, a = -rel - Math.PI / 2;
  const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
  hx.save(); hx.translate(x, y); hx.rotate(a + Math.PI / 2);
  hx.fillStyle = '#29e7ff'; hx.shadowColor = '#29e7ff'; hx.shadowBlur = 10;
  hx.beginPath(); hx.moveTo(0, -12); hx.lineTo(9, 6); hx.lineTo(0, 1); hx.lineTo(-9, 6); hx.fill(); hx.restore();
  hx.font = '700 13px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = '#bff6ff';
  hx.fillText(`ARMORY ${Math.round(t.d)} m`, x, y + 24);
  hx.font = '700 15px "Quiver Cn", sans-serif'; hx.fillStyle = '#e9ecff';
  hx.fillText(GAME.nearTerminal ? 'PRESS E TO OPEN THE ARMORY' : `NEXT WAVE IN ${Math.ceil(GAME.interT)}s  ·  REACH AN ARMORY TERMINAL`, cx, H - 64);
}
