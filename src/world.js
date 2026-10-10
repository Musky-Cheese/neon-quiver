/* ============================================================
   Open city: navigation flow field, spawning around the player,
   supply caches + armory terminals, ambient emitters, minimap
   ============================================================ */
const NAV = { cell: 1.5, x0: -142, z0: -142, w: 0, h: 0, block: null, dist: null, queue: null, t: 0, ready: false };
const NAV_INF = 65535;

/* ---------------- scalable static-world queries ----------------
   The authored collision arrays stay the source of truth, while this coarse
   grid makes runtime queries depend on nearby streets instead of total map
   size. It is deliberately independent of render chunks: gameplay remains
   deterministic even when a visual district is streamed out. */
const WORLD_INDEX = { cell: 16, boxes: new Map(), circles: new Map(), stamp: 1, ready: false };
const _worldQB = [], _worldQC = [];
const WORLD_TILES = { cell: 56, maps: {}, out: {} };
const worldCellKey = (i, j) => i * 2097152 + j;   // numeric key, unique for |j| < 2^20 cells (no string building per lookup)
function buildWorldSpatialIndex() {
  const S = WORLD_INDEX.cell; WORLD_INDEX.boxes.clear(); WORLD_INDEX.circles.clear();
  const add = (map, o, x0, x1, z0, z1) => {
    for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) {
      const k = worldCellKey(i, j); let a = map.get(k); if (!a) map.set(k, a = []); a.push(o);
    }
  };
  for (const b of WORLD.boxes) add(WORLD_INDEX.boxes, b, b.x0, b.x1, b.z0, b.z1);
  for (const c of WORLD.circles) add(WORLD_INDEX.circles, c, c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r);
  const tiled = {
    lights: [WORLD.lights, o => o.p[0], o => o.p[2]], fires: [WORLD.fires, o => o.x, o => o.z],
    steam: [WORLD.steam, o => o[0], o => o[2]], petals: [WORLD.petals, o => o[0], o => o[2]], supplies: [WORLD.supplies, o => o.x, o => o.z],
  };
  WORLD_TILES.maps = {}; WORLD_TILES.out = {};
  for (const [kind, [list, getX, getZ]] of Object.entries(tiled)) {
    const map = WORLD_TILES.maps[kind] = new Map(); WORLD_TILES.out[kind] = [];
    for (const o of list) { const k = worldCellKey(Math.floor(getX(o) / WORLD_TILES.cell), Math.floor(getZ(o) / WORLD_TILES.cell)); let a = map.get(k); if (!a) map.set(k, a = []); a.push(o); }
  }
  WORLD_INDEX.ready = true;
}
function nearbyWorld(kind, x, z, radius) {
  const map = WORLD_TILES.maps[kind], out = WORLD_TILES.out[kind]; if (!map || !out) return WORLD[kind] || [];
  out.length = 0; const S = WORLD_TILES.cell;
  const i0 = Math.floor((x - radius) / S), i1 = Math.floor((x + radius) / S), j1 = Math.floor((z + radius) / S);
  for (let j = Math.floor((z - radius) / S); j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = map.get(worldCellKey(i, j)); if (a) for (let n = 0; n < a.length; n++) out.push(a[n]); }
  return out;
}
const _worldQ = [_worldQB, _worldQC];   // callers destructure the pair straight away
function worldCollect(map, out, x0, x1, z0, z1, stamp) {
  const S = WORLD_INDEX.cell, i0 = Math.floor(x0 / S), i1 = Math.floor(x1 / S), j1 = Math.floor(z1 / S);
  for (let j = Math.floor(z0 / S); j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const a = map.get(worldCellKey(i, j)); if (!a) continue;
    for (let n = 0; n < a.length; n++) { const o = a[n]; if (o._wq !== stamp) { o._wq = stamp; out.push(o); } }
  }
}
function worldCandidates(x0, x1, z0, z1) {
  if (!WORLD_INDEX.ready) return [WORLD.boxes, WORLD.circles];
  _worldQB.length = 0; _worldQC.length = 0;
  const stamp = ++WORLD_INDEX.stamp;
  worldCollect(WORLD_INDEX.boxes, _worldQB, x0, x1, z0, z1, stamp); worldCollect(WORLD_INDEX.circles, _worldQC, x0, x1, z0, z1, stamp);
  return _worldQ;
}

function navIdx(x, z) { const i = Math.floor((x - NAV.x0) / NAV.cell), j = Math.floor((z - NAV.z0) / NAV.cell); return (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) ? -1 : j * NAV.w + i; }
function navCenter(k, out) { out[0] = NAV.x0 + (k % NAV.w + 0.5) * NAV.cell; out[1] = NAV.z0 + (Math.floor(k / NAV.w) + 0.5) * NAV.cell; return out; }

function buildNav() {
  NAV.x0 = WORLD_BOUNDS.x0 - 2; NAV.z0 = WORLD_BOUNDS.z0 - 2;
  const c = NAV.cell; NAV.w = Math.ceil((WORLD_BOUNDS.x1 + 2 - NAV.x0) / c); NAV.h = Math.ceil((WORLD_BOUNDS.z1 + 2 - NAV.z0) / c);
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
  NAV.block = B; NAV.dist = new Uint16Array(N).fill(NAV_INF); NAV.touched = []; NAV.lastS = -1; NAV.gen = 1;
  NAV.hd = new Int32Array(8 * N + 8); NAV.hn = new Int32Array(8 * N + 8);   // the flood's binary heap: at most one push per relaxed edge
  NAV.tgt = new Int32Array(N); NAV.tgtGen = new Uint32Array(N);             // navTarget per start cell, valid for one flood (gen)
  // nearest free cell of every blocked one, looked up once here instead of a 285-cell scan per zombie per frame
  NAV.free = new Int32Array(N); for (let k = 0; k < N; k++) NAV.free[k] = B[k] ? navNearestFreeScan(k) : k;
  NAV.walk = []; for (let k = 0; k < N; k++) if (!B[k]) NAV.walk.push(k);
  NAV.ready = true;
  buildMinimap();
}
// shortest-path distances (in cells, 8-connected without corner cutting, octile costs 10 / 14) from the player.
// Dijkstra with a binary heap settles every cell once; the old label-correcting FIFO re-expanded cells many times
// and gave the same field. Cells at or past maxCost are never expanded, so the field is identical either way.
const NB_DI = new Int32Array([1, -1, 0, 0, 1, 1, -1, -1]), NB_DJ = new Int32Array([0, 0, 1, -1, 1, -1, 1, -1]), NB_C = new Int32Array([10, 10, 10, 10, 14, 14, 14, 14]);
function navUpdate(px, pz) {
  const D = NAV.dist, B = NAV.block, W = NAV.w, H = NAV.h, touched = NAV.touched;
  let s = navIdx(px, pz); if (s >= 0 && B[s]) s = NAV.free[s];
  if (s === NAV.lastS && s >= 0) return;   // same start cell as the last flood over a static grid: the field is unchanged
  for (let i = 0; i < touched.length; i++) D[touched[i]] = NAV_INF;
  touched.length = 0; NAV.lastS = s; NAV.gen++;
  if (s < 0) return;
  const maxCost = Math.ceil(135 / NAV.cell) * 10;   // active district + spawn ring; constant work as the map grows
  const hd = NAV.hd, hn = NAV.hn; let hs = 0;
  D[s] = 0; touched.push(s); hd[0] = 0; hn[0] = s; hs = 1;
  while (hs > 0) {
    const dk = hd[0], k = hn[0];
    // pop: move the last entry to the root and sift it down
    hs--; if (hs > 0) { const ld = hd[hs], ln = hn[hs]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hs) break; if (c + 1 < hs && hd[c + 1] < hd[c]) c++; if (hd[c] >= ld) break; hd[i] = hd[c]; hn[i] = hn[c]; i = c; } hd[i] = ld; hn[i] = ln; }
    if (dk !== D[k] || dk >= maxCost) continue;   // a stale entry (the cell was reached cheaper since), or past the cutoff
    const i = k % W, j = (k / W) | 0;
    for (let n = 0; n < 8; n++) {
      const a = i + NB_DI[n], b = j + NB_DJ[n]; if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const m = b * W + a; if (B[m]) continue;
      if (n >= 4 && (B[j * W + a] || B[b * W + i])) continue;
      const nd = dk + NB_C[n];
      if (nd < D[m]) {
        if (D[m] === NAV_INF) touched.push(m); D[m] = nd;
        let c = hs++; while (c > 0) { const p = (c - 1) >> 1; if (hd[p] <= nd) break; hd[c] = hd[p]; hn[c] = hn[p]; c = p; } hd[c] = nd; hn[c] = m;   // push: sift up
      }
    }
  }
}
function navNearestFree(k) { return NAV.free[k]; }
function navNearestFreeScan(k) {
  const W = NAV.w, i0 = k % W, j0 = (k / W) | 0;
  for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i0 + di, b = j0 + dj; if (a < 0 || b < 0 || a >= W || b >= NAV.h) continue; const m = b * W + a; if (!NAV.block[m]) return m; }
  return -1;
}
function navDistAt(x, z) { const k = navIdx(x, z); if (k < 0) return 1e9; const d = NAV.dist[Math.max(0, NAV.free[k])]; return d === NAV_INF ? 1e9 : d / 10 * NAV.cell; }
// steering target for a zombie: a point two cells down the distance field. It depends only on the zombie's cell and
// the current field, so each cell's answer is kept until the next flood (zombies share cells and stay in one for a while)
const _nc = [0, 0];
function navTarget(x, z, out) {
  const k0 = navIdx(x, z); if (k0 < 0) return false;
  const D = NAV.dist; let k;
  if (NAV.tgtGen[k0] === NAV.gen) k = NAV.tgt[k0];
  else {
    k = NAV.free[k0];
    if (k >= 0) {
      const W = NAV.w, B = NAV.block;
      for (let step = 0; step < 2; step++) {
        const i = k % W, j = (k / W) | 0; let best = k, bd = D[k];
        for (let n = 0; n < 8; n++) { const a = i + NB_DI[n], b = j + NB_DJ[n]; if (a < 0 || b < 0 || a >= W || b >= NAV.h) continue; const m = b * W + a; if (B[m]) continue; if (n >= 4 && (B[j * W + a] || B[b * W + i])) continue; if (D[m] < bd) { bd = D[m]; best = m; } }
        if (best === k) break; k = best;
      }
    }
    NAV.tgt[k0] = k; NAV.tgtGen[k0] = NAV.gen;
  }
  if (k < 0) return false;
  navCenter(k, out); return D[k] !== NAV_INF;
}
function navNearestPoint(x, z) { let k = navIdx(clamp(x, NAV.x0 + 1, WORLD_BOUNDS.x1), clamp(z, NAV.z0 + 1, WORLD_BOUNDS.z1)); if (k < 0 || NAV.block[k]) k = navNearestFree(k < 0 ? navIdx(0, 14) : k); if (k < 0) return [0, 14]; return navCenter(k, [0, 0]); }
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
  for (const s of nearbyWorld('supplies', x, z, 12)) { if (s.kind !== kind) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best ? { s: best, d: bd } : null;
}
function updateSupplies(dt) {
  for (const s of WORLD.supplies) {
    s.cd = Math.max(0, (s.cd || 0) - dt);
    if (GAME.state !== 'playing' || PLAYER.dead) continue;
    const d = Math.hypot(s.x - PLAYER.x, s.z - PLAYER.z);
    if (s.kind === 'cache' && s.cd <= 0 && d < 1.9) {
      supplyRefill(); s.cd = 70; AUD.pickup();
      GAME.toast('SUPPLY CACHE  +ARROWS  +15 HP', '#ffb52e');
      burst(s.x, 1, s.z, 36, [2.4, 1.6, 0.5], 4, 0.6, 0.08, 0, 2);
    }
  }
  const t = nearestSupply('terminal', PLAYER.x, PLAYER.z);
  GAME.nearTerminal = GAME.intermission && t && t.d < 2.6 ? t.s : null;
}
// burn barrels: a bright core and flickering tongues of flame above the rim (particles do the rest)
function drawFires(time) {
  for (const f of nearbyWorld('fires', PLAYER.x, PLAYER.z, 48)) {
    if (Math.abs(f.x - PLAYER.x) > 45 || Math.abs(f.z - PLAYER.z) > 45) continue;
    const s0 = f.x * 1.7 + f.z * 3.1, lean = (WX.wind + WX.gust) * 0.25;
    for (let i = 0; i < 5; i++) {
      const ph = time * (7 + i * 1.3) + s0 + i * 2.1, fl = 0.55 + 0.45 * Math.sin(ph) * Math.sin(ph * 0.53 + 1.7);
      const a = i / 5 * TAU + time * 0.6, off = i === 0 ? 0 : 0.13, h = (i === 0 ? 0.62 : 0.4) * (0.6 + 0.6 * fl), w = (i === 0 ? 0.2 : 0.11) * (0.8 + 0.3 * fl);
      const k = 0.6 + 0.6 * fl, col = i === 0 ? [1, 0.75, 0.35] : [1, 0.42, 0.08];
      drawItem(MESH.cone, M4.trs(poolM(), f.x + Math.cos(a) * off + lean * h * 0.5, f.y - 0.02 + h * 0.5, f.z + Math.sin(a) * off, Math.sin(ph * 0.7) * 0.18, a, Math.sin(ph * 0.9) * 0.18 - lean, w, h, w), col, i === 0 ? [5 * k, 3.4 * k, 1.1 * k] : [4.2 * k, 1.5 * k, 0.25 * k]);
    }
  }
}
function drawSupplies(time) {
  for (const s of nearbyWorld('supplies', PLAYER.x, PLAYER.z, 92)) {
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
  AUD.harbour(GAME.state === 'title' ? 0 : clamp((px - 150) / 30, 0, 1) * clamp((60 - Math.abs(pz + 4)) / 20, 0, 1), dt);   // water, horns, cranes near the Docks
  // steam vents breathe: a steady plume that swells in pulses, billows as it rises, leans with the wind,
  // takes the colour of the night air, and hangs thicker in the cold
  const wx = (WX.wind + WX.gust) * 1.4, cold = 1 + 0.8 * WX.snow, fc = THEME.fog;
  const stc = [fc[0] * 1.15 + 0.055, fc[1] * 1.15 + 0.055, fc[2] * 1.15 + 0.065];
  const steamNear = nearbyWorld('steam', px, pz, 52);
  for (let i = 0; i < steamNear.length; i++) {
    const s = steamNear[i];
    if (Math.abs(s[0] - px) > 50 || Math.abs(s[2] - pz) > 50) continue;
    const pulse = 0.55 + 0.9 * Math.max(0, Math.sin(GAME.time * 0.8 + i * 2.3)) ** 2;
    if (Math.random() < dt * 30 * pulse * cold) emit(s[0] + rand(-0.25, 0.25), s[1] + 0.05, s[2] + rand(-0.25, 0.25), rand(-0.3, 0.3) + wx * 0.3, rand(1.3, 2.4) * (0.7 + 0.4 * pulse), rand(-0.3, 0.3), rand(2.2, 3.6), stc, -rand(0.3, 0.55), -0.35, 0.55, 0.75 * cold, 0.2);
    if (Math.random() < dt * 5 * cold) emit(s[0] + rand(-1.2, 1.2), 0.12, s[2] + rand(-1.2, 1.2), rand(-0.3, 0.3) + wx * 0.5, rand(0.05, 0.25), rand(-0.3, 0.3), rand(3, 5), stc, -rand(0.7, 1.1), -0.02, 0.4, 0.35, 0.1);   // low mist pooling round the grate
  }
  // burn barrels: licking flame, a bright core, embers that ride the heat, the odd crackle of sparks, and smoke that leans with the wind
  for (const f of nearbyWorld('fires', px, pz, 52)) {
    if (Math.abs(f.x - px) > 50 || Math.abs(f.z - pz) > 50) continue;
    if (Math.random() < dt * 48) { const hot = Math.random(); emit(f.x + rand(-0.2, 0.2), f.y - 0.05, f.z + rand(-0.2, 0.2), rand(-0.18, 0.18) + wx * 0.15, rand(1.4, 2.6), rand(-0.18, 0.18), rand(0.28, 0.55), hot < 0.3 ? [3, 2.1, 0.7] : [2.8, 0.95 + hot * 0.6, 0.12], rand(0.22, 0.42), -1.2, 1.2, -0.35); }
    if (Math.random() < dt * 9) emit(f.x + rand(-0.15, 0.15), f.y + 0.1, f.z + rand(-0.15, 0.15), rand(-0.6, 0.6) + wx * 0.4, rand(2, 4.2), rand(-0.6, 0.6), rand(1.2, 2.4), [3.2, 1.3, 0.25], rand(0.025, 0.045), -0.6, 0.35, 0);   // embers
    if (Math.random() < dt * 0.6) for (let k = 0; k < 8; k++) emit(f.x, f.y + 0.1, f.z, rand(-1.8, 1.8), rand(2.5, 5), rand(-1.8, 1.8), rand(0.5, 1.1), [3.5, 2, 0.6], rand(0.02, 0.035), 6, 0.2, 0);   // crackle
    if (Math.random() < dt * 6) emit(f.x + rand(-0.1, 0.1), f.y + 0.7, f.z + rand(-0.1, 0.1), rand(-0.2, 0.2) + wx * 0.6, rand(1, 1.7), rand(-0.2, 0.2), rand(2.6, 4.4), [0.045, 0.04, 0.04], -rand(0.35, 0.5), -0.25, 0.45, 0.95, 0.5);
  }
  // cherry blossom petals drifting down from nearby canopies
  for (const t of nearbyWorld('petals', px, pz, 48)) {
    const dx = t[0] - px, dz = t[2] - pz; if (dx * dx + dz * dz > 45 * 45) continue;
    if (Math.random() < dt * 7) { const a = Math.random() * TAU, r = Math.random() * t[3];
      emit(t[0] + Math.cos(a) * r, t[1] + rand(-0.4, 0.3), t[2] + Math.sin(a) * r, rand(0.2, 0.7) + WX.wind * 1.4 + WX.gust * 2.6, rand(-0.5, -0.2), rand(-0.3, 0.3), rand(5, 8), [1.0, 0.5 + Math.random() * 0.15, 0.68], rand(0.04, 0.07), 0.25, 0.9, 0, 0.95); }
  }
  // wading through a pond: little splashes round the ankles
  if (PLAYER.y < 0.05 && inPond(px, pz) && Math.hypot(PLAYER.vx, PLAYER.vz) > 1 && Math.random() < dt * 24)
    emit(px + rand(-0.3, 0.3), 0.05, pz + rand(-0.3, 0.3), rand(-0.8, 0.8), rand(1, 2), rand(-0.8, 0.8), 0.35, [0.45, 0.55, 0.62], 0.04, 9, 0, 0, 0.7);
  // rain splashes on the ground around the camera
  const n = THEME.rain * wxRainK() * 1.4 * dt * 90;   // splashes follow the weather
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
  const s = MINI.scale, W = Math.ceil((WORLD_BOUNDS.x1 + 2 - NAV.x0) * s), H = Math.ceil((WORLD_BOUNDS.z1 + 2 - NAV.z0) * s);
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
  { // only the part of the map that can show inside the ring (the clip hides the rest): a crop with a wide margin, not the whole city
    const ms = MINI.scale, cv = MINI.cv, half = Math.ceil(R / 0.9) + 16, mx = (PLAYER.x - NAV.x0) * ms, mz = (PLAYER.z - NAV.z0) * ms;
    const sx = Math.max(0, Math.floor(mx - half)), sz = Math.max(0, Math.floor(mz - half)), sw = Math.min(cv.width, Math.ceil(mx + half)) - sx, sh = Math.min(cv.height, Math.ceil(mz + half)) - sz;
    if (sw > 0 && sh > 0) hx.drawImage(cv, sx, sz, sw, sh, (NAV.x0 - PLAYER.x) * ms + sx, (NAV.z0 - PLAYER.z) * ms + sz, sw, sh);
  }
  hx.setTransform(1, 0, 0, 1, 0, 0); const dpr = Math.min(2, devicePixelRatio || 1); hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cy_ = Math.cos(PLAYER.yaw), sy_ = Math.sin(PLAYER.yaw);
  const map = (x, z) => { const dx = (x - PLAYER.x) * s, dz = (z - PLAYER.z) * s; return [cx + dx * cy_ - dz * sy_, cy + dx * sy_ + dz * cy_]; };
  hx.beginPath(); hx.arc(cx, cy, R, 0, TAU); hx.clip();
  const cull = R / s + 6;   // past this (in metres) a dot can't reach the ring, so it isn't drawn at all
  for (const sp of WORLD.supplies) {
    if (Math.abs(sp.x - PLAYER.x) > cull || Math.abs(sp.z - PLAYER.z) > cull) continue;
    const [x, y] = map(sp.x, sp.z);
    if (sp.kind === 'terminal') { hx.fillStyle = GAME.intermission ? '#29e7ff' : 'rgba(41,231,255,0.45)'; hx.fillRect(x - 3.5, y - 3.5, 7, 7); }
    else { hx.fillStyle = sp.cd > 0 ? 'rgba(255,181,46,0.3)' : '#ffb52e'; hx.beginPath(); hx.moveTo(x, y - 4); hx.lineTo(x + 4, y); hx.lineTo(x, y + 4); hx.lineTo(x - 4, y); hx.fill(); }
  }
  for (const p of PICKUPS) { const [x, y] = map(p.x, p.z); hx.fillStyle = p.kind === 'health' ? '#6dff9a' : '#ffd23a'; hx.fillRect(x - 1.5, y - 1.5, 3, 3); }
  for (const z of ZOMBIES) { if (z.dead || Math.abs(z.x - PLAYER.x) > cull || Math.abs(z.z - PLAYER.z) > cull) continue; const [x, y] = map(z.x, z.z); hx.fillStyle = z.type === 'boss' ? '#ff3df0' : z.type === 'brute' ? '#ff6b3d' : '#ff3040'; const r = z.type === 'boss' ? 4.5 : z.type === 'brute' ? 3 : 2.2; hx.beginPath(); hx.arc(x, y, r, 0, TAU); hx.fill(); }
  drawObjectiveMinimap(hx, map, cx, cy, R, time);
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
  hx.fillText(GAME.nearTerminal ? 'PRESS E TO OPEN THE ARMORY' : `NEXT WAVE IN ${Math.ceil(GAME.interT)}s  ·  SPEND SCRAP AT AN ARMORY TERMINAL  ·  N TO START NOW`, cx, H - 64);
}
