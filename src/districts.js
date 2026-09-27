/* ============================================================
   Districts: the Rail Yard (north), the Night Market (east), the
   Warrens (west) and the Sakura Gardens (south, through the torii)
   hang off Sector 7 plaza. The Docks lie past the far end of the market.
   ============================================================ */
const DISTRICTS = [
  { id: 'hub', name: 'SECTOR 7 PLAZA', x0: -40, x1: 40, z0: -40, z1: 40, env: [0, 5, 10] },
  { id: 'yard', name: 'RAIL YARD', x0: -32, x1: 32, z0: -138, z1: -74, env: [0, 5, -104] },
  { id: 'market', name: 'NIGHT MARKET', x0: 74, x1: 138, z0: -32, z1: 32, env: [106, 5, 0] },
  { id: 'warrens', name: 'THE WARRENS', x0: -138, x1: -74, z0: -32, z1: 32, env: [-84, 5, 0] },
  { id: 'garden', name: 'SAKURA GARDENS', x0: -32, x1: 32, z0: 164, z1: 228, env: [0, 5, 190] },
  { id: 'suburbs', name: 'THE SUBURBS', x0: -60, x1: 60, z0: 74, z1: 162, env: [0, 5, 125] },
  { id: 'docks', name: 'THE DOCKS', x0: 164, x1: 228, z0: -48, z1: 40, env: [196, 5, -4] },
];
function districtAt(x, z) {
  for (const d of DISTRICTS) if (x > d.x0 - 2 && x < d.x1 + 2 && z > d.z0 - 2 && z < d.z1 + 2) return d;
  // avenues belong to whichever district they lead to
  if (Math.abs(x) < 8 && z < -40) return DISTRICTS[1];
  if (Math.abs(z) < 8 && x > 138) return DISTRICTS[6];   // the cut through the market's far wall
  if (Math.abs(z) < 8 && x > 40) return DISTRICTS[2];
  if (Math.abs(z) < 8 && x < -40) return DISTRICTS[3];
  if (Math.abs(x) < 8 && z > 40) return z < 162 ? DISTRICTS[5] : DISTRICTS[4];
  return DISTRICTS[0];
}
const WORLD_BOUNDS = { x0: -140, x1: 226.5, z0: -140, z1: 226 };

// terminals and ammo caches: static base geometry (the glow is drawn per frame in world.js)
function supplyProp(g, sp) {
  const M = M4.create();
  const box = (x, y, z, sx, sy, sz, c, e = 0, mat = 0, ry = 0) => g.box(M4.trs(M, x, y, z, 0, ry, 0, sx, sy, sz), c, e, mat);
  if (sp.kind === 'terminal') {
    const ry = sp.ry || 0, fx = Math.sin(ry), fz = Math.cos(ry);
    box(sp.x, 1.2, sp.z, 1.3, 2.4, 0.8, [0.12, 0.12, 0.15], 0, 4, ry);
    box(sp.x + fx * 0.41, 1.5, sp.z + fz * 0.41, 1.0, 0.9, 0.04, [0.1, 0.6, 0.7], 1.6, 0, ry);
    box(sp.x + fx * 0.5, 0.85, sp.z + fz * 0.5, 1.1, 0.12, 0.35, [0.1, 0.1, 0.12], 0, 4, ry);
    box(sp.x, 2.45, sp.z, 1.4, 0.1, 0.9, NEON.cyan, 2.2, 0, ry);
    WORLD.boxes.push({ x0: sp.x - 0.75, x1: sp.x + 0.75, y0: 0, y1: 2.4, z0: sp.z - 0.75, z1: sp.z + 0.75 });
    WORLD.lights.push({ p: [sp.x + fx * 1.5, 2.2, sp.z + fz * 1.5], r: 7, c: [0.3, 1.2, 1.5], shop: true });
  } else {
    box(sp.x, 0.45, sp.z, 1.5, 0.9, 1.0, [0.16, 0.15, 0.13], 0, 8);
    box(sp.x, 0.62, sp.z, 1.54, 0.1, 1.04, NEON.amber, 1.8);
    box(sp.x + 0.55, 1.3, sp.z - 0.3, 0.05, 0.9, 0.05, [0.1, 0.1, 0.1], 0, 4);
    WORLD.boxes.push({ x0: sp.x - 0.78, x1: sp.x + 0.78, y0: 0, y1: 0.9, z0: sp.z - 0.55, z1: sp.z + 0.55 });
  }
}

function buildDistricts(C) {
  const { B, solid, building, lamp, barrier, addSign, r, R, neonPick, setG } = C;
  const quad = (x0, x1, z0, z1, y, col, mat) => C.getG().quad(null, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], col, 0, mat);
  // a contiguous row of buildings between a0..a1 along one axis
  function row(axis, a0, a1, b0, b1, face, hmin, hmax, opt) {
    let a = a0;
    while (a < a1 - 0.01) {
      let w = r(11, 20); if (a1 - (a + w) < 7) w = a1 - a;
      const o = typeof opt === 'function' ? opt(w) : opt;
      if (axis === 'x') building(a, a + w, b0, b1, r(hmin, hmax), face, o); else building(b0, b1, a, a + w, r(hmin, hmax), face, o);
      a += w;
    }
  }
  const M = M4.create();
  const rot = (x, y, z, sx, sy, sz, c, e, mat, rx, ry, rz) => C.getG().box(M4.trs(M, x, y, z, rx, ry, rz, sx, sy, sz), c, e, mat);
  // a sagging cable between two points, optionally strung with lanterns
  function cable(ax, ay, az, bx, by, bz, sag, lanterns, lc) {
    const n = 10; let px = ax, py = ay, pz = az;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = lerp(ax, bx, t), z = lerp(az, bz, t), y = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag;
      C.getG().box(M4.align(M, px, py, pz, x, y, z, 0.035, 0.035), [0.03, 0.03, 0.035], 0, 0);
      if (lanterns && i < n && i % 1 === 0) { const c = lc || [1, 0.4, 0.15]; C.getG().sphere(M4.trs(M, x, y - 0.3, z, 0, 0, 0, 0.36, 0.44, 0.36), c, 2.6, 0, 8, 6); WORLD.halos.push({ p: [x, y - 0.3, z], s: 1.3, c: [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5] }); }
      px = x; py = y; pz = z;
    }
  }
  const CONT = [[0.3, 0.12, 0.06], [0.05, 0.17, 0.19], [0.2, 0.2, 0.21], [0.28, 0.05, 0.05], [0.06, 0.09, 0.2], [0.26, 0.2, 0.06]];
  function container(x, z, alongX, stack) {
    for (let k = 0; k < stack; k++) {
      const c = CONT[Math.floor(R() * CONT.length)], y = 1.3 + k * 2.62, jit = (R() - 0.5) * 0.3;
      if (alongX) { B(x + jit, y, z, 6.1, 2.6, 2.44, c, 0, 8); } else { B(x, y, z + jit, 2.44, 2.6, 6.1, c, 0, 8); }
    }
    if (alongX) solid(x - 3.1, x + 3.1, 0, stack * 2.62, z - 1.25, z + 1.25); else solid(x - 1.25, x + 1.25, 0, stack * 2.62, z - 3.1, z + 3.1);
  }
  function flood(x, z) {
    B(x, 6, z, 0.4, 12, 0.4, [0.1, 0.1, 0.11], 0, 4);
    B(x, 12.1, z, 2.2, 0.35, 0.7, [0.1, 0.1, 0.11], 0, 4);
    B(x, 11.9, z, 2.0, 0.08, 0.5, [0.95, 0.95, 1.0], 4);
    WORLD.circles.push({ x, z, r: 0.35, h: 12 });
    WORLD.lights.push({ p: [x, 11.6, z], r: 24, c: [1.5, 1.5, 1.6], kind: 'lamp' });
    WORLD.halos.push({ p: [x, 11.85, z], s: 3.4, c: [-1, 0, 0] });
  }
  const burnBarrel = (x, z) => propBurnBarrel(C.getG(), x, z);
  const dumpster = (x, z, ry) => propDumpster(C.getG(), R, x, z, ry, solid);
  const crates = (x, z) => propCrates(C.getG(), R, x, z, solid);
  const bench = (x, z, face, len) => propBench(C.getG(), R, x, z, face, len);

  /* ---------------- RAIL YARD (north) ---------------- */
  setG('near');
  quad(-32, 32, -138, -74, 0.012, [0.07, 0.068, 0.064], 3);
  row('z', -164, -74, -58, -32, '+x', 14, 30, { industrial: true, mat: 8, col: [0.16, 0.15, 0.14] });
  row('z', -164, -74, 32, 58, '-x', 14, 30, { industrial: true, mat: 8, col: [0.14, 0.15, 0.16] });
  row('x', -32, 32, -164, -138, '+z', 18, 34, { industrial: true, mat: 8, col: [0.15, 0.14, 0.14] });
  setG('props');
  for (const tz of [-100, -116]) {   // tracks
    for (let x = -31; x <= 31; x += 0.9) B(x, 0.07, tz, 0.26, 0.12, 2.7, [0.09, 0.07, 0.06]);
    for (const o of [-0.72, 0.72]) B(0, 0.2, tz + o, 64, 0.14, 0.1, [0.25, 0.24, 0.24], 0, 4);
  }
  const carC = [[0.24, 0.1, 0.05], [0.08, 0.1, 0.12], [0.2, 0.18, 0.08], [0.1, 0.04, 0.05]];
  for (const cx of [-22.5, -8.5, 5.5, 19.5]) {   // parked freight (gaps between cars stay walkable)
    const c = carC[Math.floor(R() * carC.length)];
    B(cx, 2.35, -116, 12, 3.4, 3.0, c, 0, 8); B(cx, 4.12, -116, 11.6, 0.14, 2.8, [0.07, 0.07, 0.08], 0, 4);
    for (const bx of [-4, 4]) B(cx + bx, 0.55, -116, 2.4, 0.6, 2.4, [0.05, 0.05, 0.05], 0, 4);
    B(cx, 1.9, -114.46, 11.4, 0.14, 0.04, NEON.amber, 1.4);
    solid(cx - 6, cx + 6, 0, 4.1, -117.5, -114.5);
  }
  container(-27.5, -84, false, 2); container(-27.5, -92, false, 1); container(27.5, -86, false, 3); container(27.5, -94.5, false, 1);
  container(-27.5, -128, false, 3); container(27.5, -130, false, 2); container(-8, -130, true, 1); container(10, -86, true, 2); container(-14, -106.5, true, 1);
  // gantry crane over the far tracks
  for (const lx of [-29.5, 29.5]) { B(lx, 8.5, -126, 1.2, 17, 1.2, [0.3, 0.22, 0.04], 0, 4); B(lx, 8.5, -132, 1.2, 17, 1.2, [0.3, 0.22, 0.04], 0, 4); solid(lx - 0.6, lx + 0.6, 0, 17, -126.6, -125.4); solid(lx - 0.6, lx + 0.6, 0, 17, -132.6, -131.4); }
  B(0, 17.3, -126, 61, 1.2, 1.0, [0.3, 0.22, 0.04], 0, 4); B(0, 17.3, -132, 61, 1.2, 1.0, [0.3, 0.22, 0.04], 0, 4);
  B(6, 16.3, -129, 3, 1.6, 7, [0.12, 0.12, 0.13], 0, 4); B(6, 11, -129, 0.06, 9, 0.06, [0.05, 0.05, 0.05]); B(6, 6.4, -129, 0.9, 0.5, 0.4, [0.3, 0.22, 0.04], 0, 4);
  B(-29.5, 17.4, -129, 0.5, 0.5, 0.5, NEON.red, 4); B(29.5, 17.4, -129, 0.5, 0.5, 0.5, NEON.red, 4);
  flood(-20, -95); flood(20, -122); flood(20, -80);
  barrier(-4, -90, 0); barrier(12, -104, 1); barrier(-18, -122, 0);
  crates(14, -97); crates(-24, -110);
  bench(-6, -77, '+z'); bench(16, -77, '+z');
  // yard signage
  addSign(signTexture('RAIL YARD 7', '#ffb52e', 'seg'), 0, 9, -74.3, Math.PI, 12, 3, [1.3, 1.3, 1.3], 0, true);
  WORLD.supplies.push({ kind: 'terminal', x: -22, z: -79, ry: 0.4, d: 'yard' }, { kind: 'cache', x: 25, z: -104, d: 'yard' }, { kind: 'cache', x: -12, z: -135, d: 'yard' });

  /* ---------------- NIGHT MARKET (east) ---------------- */
  setG('near');
  quad(74, 138, -32, 32, 0.014, [0.1, 0.082, 0.075], 2);
  let mk = 0; const mshop = (w) => w >= 12 ? { shop: MARKET_ORDER[mk++ % MARKET_ORDER.length] } : {};   // market frontages are all walk-in shops
  row('x', 74, 164, 32, 58, '-z', 26, 70, mshop);
  row('x', 74, 164, -58, -32, '+z', 26, 70, mshop);
  row('z', -32, -8, 138, 164, '-x', 40, 90, mshop);   // the far wall, split by the cut through to the docks
  row('z', 8, 32, 138, 164, '-x', 40, 90, mshop);
  setG('props');
  const awn = [[0.35, 0.05, 0.06], [0.05, 0.2, 0.22], [0.3, 0.2, 0.04], [0.2, 0.06, 0.25], [0.08, 0.2, 0.08]];
  function stall(x, z, facing) {   // facing: +1 counter toward +z, -1 toward -z
    const c = awn[Math.floor(R() * awn.length)], fz = z + facing * 1.05;
    B(x, 0.55, fz, 3.1, 1.1, 0.5, [0.16, 0.12, 0.09], 0, 8);
    B(x, 1.12, fz, 3.2, 0.06, 0.62, [0.22, 0.2, 0.18], 0, 4);
    B(x, 1.3, z - facing * 0.9, 3.1, 2.6, 0.3, [0.08, 0.07, 0.07]);
    for (const sx of [-1.5, 1.5]) for (const sz of [-1, 1]) B(x + sx, 1.3, z + sz * 1.05, 0.08, 2.6, 0.08, [0.06, 0.06, 0.06], 0, 4);
    for (let i = 0; i < 4; i++) rot(x - 1.2 + i * 0.8, 2.75, z + facing * 0.3, 0.8, 0.07, 2.8, i % 2 ? c : [0.75, 0.72, 0.65], i % 2 ? 0.25 : 0.05, 0, facing * 0.22, 0, 0);
    B(x, 2.35, z + facing * 1.55, 2.8, 0.22, 0.04, c, 2.4);
    for (let i = 0; i < 5; i++) B(x - 1.2 + i * 0.6, 1.3, fz - facing * 0.05, 0.3, 0.25, 0.3, [0.3 + R() * 0.5, 0.2 + R() * 0.4, 0.1 + R() * 0.3], 0.3);
    solid(x - 1.6, x + 1.6, 0, 1.2, z - 1.2, z + 1.35 * (facing > 0 ? 1 : 0.9));
    if (R() < 0.45) WORLD.lights.push({ p: [x, 2.1, z + facing * 2.2], r: 7, c: [c[0] * 3 + 0.4, c[1] * 3 + 0.3, c[2] * 3 + 0.2], shop: true });
  }
  for (let i = 0; i < 13; i++) {
    if (i % 4 === 3) continue;   // cross lanes
    const x = 80 + i * 4.3;
    stall(x, -14, 1); stall(x, -18.6, -1); stall(x, 14, -1); stall(x, 18.6, 1);
  }
  for (let x = 82; x <= 134; x += 6.5) cable(x, 5.2, -12.4, x + 1.5, 5.4, 12.4, 1.2, true, R() < 0.5 ? [1, 0.25, 0.1] : [1, 0.6, 0.15]);
  // food carts + tables in the central lane
  for (const [x, z] of [[88, -4], [104, 5], [121, -6], [131, 4]]) propFoodCart(C.getG(), R, x, z, awn[Math.floor(R() * awn.length)], solid);
  for (const x of [84, 110, 127]) bench(x, -11.2, '+z');
  for (const x of [93, 116]) bench(x, 11.2, '-z');
  // entrance arch
  for (const az of [-6.5, 6.5]) { B(76, 3.5, az, 0.5, 7, 0.5, [0.25, 0.05, 0.05], 0, 4); WORLD.circles.push({ x: 76, z: az, r: 0.35, h: 7 }); }
  B(76, 7.2, 0, 0.6, 0.5, 14.5, [0.25, 0.05, 0.05], 0, 4);
  addSign(signTexture('NIGHT MARKET', '#ff5a3c', 'font'), 76.35, 8.2, 0, -Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  addSign(signTexture('NIGHT MARKET', '#ff5a3c', 'font'), 75.65, 8.2, 0, Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  addSign(billboardTexture(2), 137.6, 22, -20, -Math.PI / 2, 16, 8, [1.2, 1.2, 1.2], 1, true);
  WORLD.supplies.push({ kind: 'terminal', x: 79, z: 25, ry: Math.PI / 2 + 0.3, d: 'market' }, { kind: 'cache', x: 134, z: -2, d: 'market' }, { kind: 'cache', x: 108, z: -27, d: 'market' });


  /* ---------------- THE DOCKS (far east, through the market) ---------------- */
  // a dead container port: stacks you can get lost in, two gantry cranes over the quay, a ship that never sailed
  setG('near');
  quad(138, 164, -8, 8, 0.013, [0.06, 0.058, 0.055], 3);                           // the cut through the market wall
  quad(164, 228, -48, 40, 0.012, [0.075, 0.073, 0.068], 16);                        // quay concrete
  for (const lz of [-7.5, 7.5]) quad(166, 226, lz - 0.12, lz + 0.12, 0.02, [0.42, 0.33, 0.05], 16);   // haul-lane lines
  for (let x = 170; x < 226; x += 5) quad(x, x + 2.4, -0.1, 0.1, 0.02, [0.42, 0.33, 0.05], 16);
  quad(210, 226, -48, 40, 0.015, [0.06, 0.06, 0.058], 16);                          // crane apron
  for (const rx of [211.2, 224.6]) quad(rx - 0.15, rx + 0.15, -48, 40, 0.03, [0.2, 0.19, 0.18], 4);   // crane rails
  quad(226.8, 228.4, -48, 40, 0.04, [0.45, 0.35, 0.05], 16);                        // painted quay edge
  const dind = (c) => ({ industrial: true, mat: 8, col: c });
  row('x', 164, 244, -74, -48, '+z', 13, 24, () => dind([0.13 + R() * 0.04, 0.13, 0.12]));
  row('x', 164, 244, 40, 66, '-z', 13, 24, () => dind([0.12, 0.13, 0.14 + R() * 0.03]));
  // harbour: black oily water to the horizon, a quay wall, and the ship
  setG('far');
  quad(228.5, 700, -400, 400, -1.3, [0.012, 0.02, 0.024], 23);
  B(228.6, -0.62, -4, 0.8, 1.3, 88, [0.1, 0.1, 0.1], 0, 16);
  setG('props');
  // the ship: hull along the quay, bridge house aft, deck cargo, running lights
  const hull = [0.2, 0.05, 0.04];
  B(242, 2.2, -8, 17, 9, 76, hull, 0, 8); B(242, 6.9, -8, 17.4, 0.5, 76.4, [0.1, 0.1, 0.1], 0, 4);
  B(242, -1.5, -8, 17.2, 1.6, 76.2, [0.05, 0.05, 0.06], 0, 4);                     // boot-top at the waterline
  rot(242, 2.6, -50.5, 12, 8.2, 12, hull, 0, 8, 0, Math.PI / 4, 0);                 // bow
  B(242, 14, 22, 15, 14, 9, [0.52, 0.52, 0.5], 0, 8); B(242, 21.3, 22, 16, 0.6, 10, [0.1, 0.1, 0.1], 0, 4);
  for (let i = 0; i < 5; i++) B(242, 9.5 + i * 2.6, 17.4, 12, 0.7, 0.1, [0.9, 0.75, 0.5], 1.4);   // lit bridge windows
  B(245, 25.5, 24, 2.4, 8, 2.4, [0.15, 0.03, 0.03], 0, 4); B(245, 29.7, 24, 2.5, 0.5, 2.5, [0.05, 0.05, 0.05]);
  B(242, 22.5, 22, 0.2, 5, 0.2, [0.1, 0.1, 0.1]); B(242, 25, 22, 0.5, 0.5, 0.5, NEON.red, 4);
  for (let bz = -40; bz <= 10; bz += 6.4) for (let bx = -1; bx <= 1; bx++) {
    const h = 1 + Math.floor(R() * 3);
    for (let k = 0; k < h; k++) B(242 + bx * 5.2, 8.5 + k * 2.62, bz, 5, 2.6, 6.1, CONT[Math.floor(R() * CONT.length)], 0, 8);
  }
  B(242, 8, -52, 0.3, 0.3, 0.3, NEON.red, 5); B(233.3, 6, -8, 0.3, 0.3, 0.3, NEON.cyan, 4);
  solid(233.5, 250.5, -3, 30, -58, 30);
  // mooring: bollards and slack lines out to the hull
  for (let bz = -44; bz <= 36; bz += 8) { B(227.2, 0.35, bz, 0.5, 0.7, 0.5, [0.12, 0.12, 0.13], 0, 4); WORLD.circles.push({ x: 227.2, z: bz, r: 0.3, h: 0.7 }); }
  cable(227.2, 0.6, -36, 233.6, 6.5, -40, 1.2, false); cable(227.2, 0.6, 20, 233.6, 6.5, 24, 1.2, false); cable(227.2, 0.6, -4, 233.6, 6.5, -6, 1.0, false);
  // ship-to-shore gantry cranes: legs straddle the apron, booms reach over the ship
  const craneC = [0.34, 0.16, 0.03];
  for (const cz of [-26, 14]) {
    for (const lx of [211.2, 224.6]) for (const oz of [-5.5, 5.5]) { B(lx, 16, cz + oz, 1.1, 32, 1.1, craneC, 0, 8); solid(lx - 0.55, lx + 0.55, 0, 32, cz + oz - 0.55, cz + oz + 0.55); }
    for (const oz of [-5.5, 5.5]) B(217.9, 9, cz + oz, 14.5, 0.9, 0.9, craneC, 0, 8);            // portal ties (overhead)
    for (const lx of [211.2, 224.6]) B(lx, 31.5, cz, 1.1, 1.1, 12, craneC, 0, 8);
    for (const oz of [-2, 2]) B(236, 33, cz + oz, 64, 1.2, 1.0, craneC, 0, 8);                 // boom + back reach
    B(213, 36.5, cz, 4, 6, 12, [0.2, 0.2, 0.21], 0, 8);                                         // machinery house
    B(232, 30.5, cz, 3.2, 2.6, 3.2, [0.45, 0.45, 0.43], 0, 8); B(232, 30.5, cz - 1.62, 2.6, 1.2, 0.05, [0.9, 0.8, 0.5], 1.6);   // cab
    B(240, 25.5, cz, 0.08, 14, 0.08, [0.05, 0.05, 0.05]); B(240, 18, cz, 2.6, 0.6, 6.1, CONT[Math.floor(R() * CONT.length)], 0, 8);   // spreader with a box still hanging
    B(267.5, 33.8, cz, 0.6, 0.6, 0.6, NEON.red, 5); B(211.2, 38.5, cz, 0.5, 0.5, 0.5, NEON.red, 5);
    for (const lx of [211.2, 224.6]) { B(lx, 0.6, cz, 1.6, 1.2, 13, [0.3, 0.14, 0.03], 0, 8); solid(lx - 0.8, lx + 0.8, 0, 1.2, cz - 6.5, cz + 6.5); }   // bogies on the rails
    WORLD.lights.push({ p: [218, 8, cz], r: 18, c: [1.6, 1.4, 1.1], kind: 'lamp' });
  }
  // the container yard: stacks in blocks, lanes between them, gaps to slip through
  for (const [bz, alongX] of [[-12.6, true], [-15.2, true], [-24.6, true], [-27.2, true], [-37.4, true], [-40, true], [12.6, true], [15.2, true], [24.6, true], [27.2, true], [34.8, true]])
    for (const bx of [171.5, 178, 191.5, 198]) { if (R() < 0.22) continue; const r0 = R(); container(bx, bz, alongX, r0 < 0.3 ? 1 : r0 < 0.72 ? 2 : 3); }
  for (const [bx, bz] of [[206, -20], [206, 22], [168.5, -30], [168.5, 30]]) container(bx, bz, false, 1 + Math.floor(R() * 2));
  // reefer rack and odds and ends on the apron
  for (let i = 0; i < 4; i++) { B(218, 1.3 + i * 2.62, -44.2, 6.1, 2.6, 2.44, [0.7, 0.7, 0.68], 0, 8); B(215.2, 1.3 + i * 2.62, -43, 0.08, 0.3, 0.3, i % 2 ? NEON.lime : NEON.red, 2.5); }
  solid(214.9, 221.1, 0, 10.5, -45.4, -43);
  barrier(186, -5, 1); barrier(203, 4.5, 0); barrier(214, -9, 1);
  crates(209, -3); crates(184, 20); crates(174, -46);
  dumpster(165.5, -44, Math.PI / 2); dumpster(186, 38.2, 0);
  burnBarrel(188, -33); burnBarrel(205, 31); burnBarrel(220, -12);
  for (const [x, z] of [[176, -6], [196, 6], [218, -34], [218, 34]]) flood(x, z);
  lamp(168, 9.5); lamp(186, -9.5); lamp(204, 9.5);
  for (const [x, z] of [[190, -33], [205, 31], [220, -12]]) WORLD.steam.push([x, 0.1, z]);
  // entrance arch from the market side, and the port's name on the warehouse wall
  for (const az of [-7.5, 7.5]) { B(164.5, 4, az, 0.6, 8, 0.6, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: 164.5, z: az, r: 0.4, h: 8 }); }
  B(164.5, 8.2, 0, 0.7, 0.6, 15.6, [0.3, 0.2, 0.03], 0, 4);
  B(164.5, 9.4, 0, 0.45, 2.5, 9.6, [0.04, 0.04, 0.045], 0, 4);                         // sign board between the two faces
  addSign(signTexture('PORT SEVEN', '#ffb52e', 'seg'), 164.15, 9.4, 0, -Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  addSign(signTexture('THE DOCKS', '#29e7ff', 'font'), 164.85, 9.4, 0, Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  addSign(signTexture('CUSTOMS HOLD', '#ff5a3c', 'panel'), 196, 12, -47.9, 0, 12, 3, [1.3, 1.3, 1.3], 0, false);
  // the harbour itself is off-limits ground
  WORLD.navBlocks.push({ x0: 227.4, x1: 260, z0: -80, z1: 80 });
  WORLD.supplies.push({ kind: 'terminal', x: 166.4, z: -13, ry: Math.PI / 2 + 0.4, d: 'docks' }, { kind: 'cache', x: 222, z: 38, d: 'docks' }, { kind: 'cache', x: 194.5, z: -46, d: 'docks' });

  /* ---------------- THE WARRENS (west) ---------------- */
  setG('near');
  quad(-138, -74, -32, 32, 0.013, [0.04, 0.04, 0.05], 3);
  const brick = { tenement: true, mat: 9, col: [0.16, 0.09, 0.07] }, brick2 = { tenement: true, mat: 9, col: [0.12, 0.1, 0.09] };
  row('x', -164, -74, 32, 58, '-z', 18, 36, brick);
  row('x', -164, -74, -58, -32, '+z', 18, 36, brick2);
  row('z', -32, 32, -164, -138, '+x', 22, 40, brick);
  // four tenement blocks, each split so every alley gets a face
  for (const [x0, x1] of [[-132, -116], [-110, -94]]) for (const s of [-1, 1]) {
    const zi = s * 6, zm = s * 16.5, zo = s * 27;
    building(x0, x1, Math.min(zi, zm), Math.max(zi, zm), r(16, 30), s > 0 ? '-z' : '+z', s > 0 ? brick : brick2);
    building(x0, x1, Math.min(zm, zo), Math.max(zm, zo), r(16, 30), s > 0 ? '+z' : '-z', s > 0 ? brick2 : brick);
  }
  setG('props');
  dumpster(-120, -3.4, 0); dumpster(-101, 3.6, 0); dumpster(-135.5, 14, Math.PI / 2); dumpster(-113, -22, Math.PI / 2); dumpster(-90, 29.3, 0); dumpster(-127, 29.4, 0);
  crates(-97, -29.6); crates(-136, -20); crates(-114.5, 10);
  burnBarrel(-86, -8); burnBarrel(-113, -29); burnBarrel(-135, 5);
  for (const [x, z] of [[-116, 0], [-94, -30], [-138, 18], [-104, 29], [-121, -29]]) WORLD.steam.push([x, 0.1, z]);
  for (const x of [-128, -120, -106, -98]) { cable(x, 9, -6, x + 2, 10, 6, 1.4, false); cable(x, 11, 27, x - 1, 10, 32, 0.8, false); cable(x, 10, -32, x + 1, 11, -27, 0.8, false); }
  cable(-110, 7, 1.5, -94, 7.5, -1.5, 1, true, [0.9, 0.2, 0.6]);
  for (const [x, z] of [[-113, -4], [-135, 22], [-90, 18], [-113, 30], [-128, -30]]) { B(x, 3.6, z, 0.18, 0.18, 0.9, [0.1, 0.1, 0.1], 0, 4); B(x, 3.5, z, 0.5, 0.1, 0.5, [1, 0.8, 0.55], 3.5); WORLD.halos.push({ p: [x, 3.45, z], s: 1.6, c: [0.6, 0.42, 0.22] }); WORLD.lights.push({ p: [x, 3.2, z], r: 11, c: [1.6, 1.1, 0.55], shop: true }); }
  lamp(-80, -20); lamp(-88, 22);
  bench(-77, -13, '-x'); bench(-90.5, 10, '+x', 1.6);
  WORLD.supplies.push({ kind: 'terminal', x: -79, z: 26, ry: Math.PI / 2 + 0.6, d: 'warrens' }, { kind: 'cache', x: -135, z: -29, d: 'warrens' }, { kind: 'cache', x: -113, z: 29.4, d: 'warrens' });


  /* ---------------- THE SUBURBS (south of the plaza) ---------------- */
  // dead suburbia between the towers and the gardens: a strip of low shops, then houses on two cross streets
  setG('near');
  row('z', 89, 101, -24, -8, '+x', 7, 11, (w) => w >= 12 ? { shop: 'hardware' } : {});                                           // two-storey shops on one side, a gas station on the other
  setG('sub');
  const SG = C.getG();
  quad(-64, 64, 100, 163, 0.012, [0.06, 0.08, 0.045], 19);                          // overgrown lawns
  quad(-64, 64, 74, 100, 0.012, [0.07, 0.07, 0.07], 3); quad(-64, -24, 74, 100, 0.013, [0.06, 0.08, 0.045], 19); quad(24, 64, 74, 100, 0.013, [0.06, 0.08, 0.045], 19);
  quad(-6, 6, 100, 163, 0.016, [0.05, 0.05, 0.055], 3);                             // the avenue runs on to the gardens
  for (const sz of [116, 142]) {                                                     // cross streets + sidewalks
    quad(-62, 62, sz - 5, sz + 5, 0.017, [0.05, 0.05, 0.055], 3);
    for (const o of [-6.2, 6.2]) quad(-62, 62, sz + o - 1.2, sz + o + 1.2, 0.03, [0.2, 0.2, 0.2], 16);
  }
  for (const o of [-7.2, 7.2]) quad(o - 1.2, o + 1.2, 100, 163, 0.03, [0.2, 0.2, 0.2], 16);
  // houses: [row z, facing]; lots every 11 m either side of the avenue
  for (const [hz, face] of [[106.5, '+z'], [125.5, '-z'], [132.5, '+z'], [151.5, '-z']])
    for (const hx of [-51, -40, -29, -18, 18, 29, 40, 51]) propHouse(SG, R, hx + (R() - 0.5) * 1.2, hz, face, solid);
  for (const [x, z] of [[-10, 104], [10, 128], [-10, 148], [10, 104]]) lamp(x, z);
  for (let i = 0; i < 14; i++) { const x = (R() < 0.5 ? -1 : 1) * (9.5 + R() * 50), z = 118 + (R() < 0.5 ? 0 : 26) + (R() - 0.5) * 4; if (Math.abs(x) > 12) propSakuraFar(SG, R, x, z + (R() < 0.5 ? -9 : 9), 0.8 + R() * 0.3, 1, R() < 0.3 ? null : [0.07, 0.12, 0.05]); }
  // the edges: dark woods you can't enter
  for (let fz = 78; fz < 168; fz += 8) for (const sgn of [-1, 1]) for (let k = 0; k < 4; k++) {
    const x = sgn * (66 + k * 8 + (R() - 0.5) * 4), z = fz + (R() - 0.5) * 5;
    propSakuraFar(C.getForest(), R, x, z, 1 + R() * 0.4, k === 0 ? 1 : 0, [0.05, 0.08, 0.04]);
  }
  propHighway(SG, R, 80, solid);                                                     // the freeway: city behind, suburbs ahead
  propGasStation(SG, 16, 95, solid);
  quad(-62, 62, 155.8, 161.2, 0.014, [0.03, 0.03, 0.025], 16);                         // the stream and its muddy banks
  quad(-62, 62, 156.6, 160.4, 0.024, [0.02, 0.04, 0.045], 18);
  for (let i = 0; i < 40; i++) { const x = -60 + i * 3 + (R() - 0.5) * 2; if (Math.abs(x) < 3) continue; const s = 0.25 + R() * 0.4; SG.blob(pT(PM.a, x, 0.05, (R() < 0.5 ? 156.3 : 160.7) + (R() - 0.5) * 0.5, R() * 6), s * 1.2, s * 0.5, s, 0.3, R() * 99, [0.2, 0.2, 0.19], 0, 16, 9, 6); }
  propFootBridge(SG, 0, 158.5, solid);
  WORLD.navBlocks.push({ x0: -150, x1: -61, z0: 76, z1: 166 }, { x0: 61, x1: 150, z0: 76, z1: 166 });
  WORLD.supplies.push({ kind: 'terminal', x: 8.5, z: 108, ry: -1.2, d: 'suburbs' }, { kind: 'cache', x: -40, z: 118, d: 'suburbs' }, { kind: 'cache', x: 44, z: 145, d: 'suburbs' });

  /* ---------------- SAKURA GARDENS (far south) ---------------- */
  // no buildings: the grove is walled in by cherry forest that fades into the mist
  const OZ = 90;
  setG('garden');
  const G = C.getG();
  quad(-110, 110, 74 + OZ, 230 + OZ, 0.012, [0.07, 0.11, 0.05], 17);
  quad(-64, 64, 160, 164, 0.013, [0.06, 0.08, 0.045], 19);
  for (let fz = 77; fz < 200; fz += 8.5) for (let fx = -90; fx <= 90; fx += 8.5) {
    const x = fx + (R() - 0.5) * 6, z = fz + (R() - 0.5) * 6 + OZ;
    if (Math.abs(x) < 33 && z < 137.5 + OZ) continue;                 // the grove itself
    if (z < 166 && Math.abs(x) < 62) continue;                        // leave the way in from the suburbs open
    const edge = Math.max(0, Math.min(Math.abs(x) - 33, z - 137.5 - OZ)); if (edge > 48 || (edge > 22 && R() < 0.35)) continue;
    propSakuraFar(C.getForest(), R, x, z, 0.9 + R() * 0.5 + edge * 0.012, edge < 7 ? 2 : edge < 20 ? 1 : 0);
  }
  // hedge line between the last houses and the grove, with a gap for the path
  for (let x = -60; x <= 60; x += 2.4) if (Math.abs(x) > 6) SG.blob(pT(PM.a, x, 0.5, 163.5, R() * 6), 1.5, 0.9, 1.1, 0.3, R() * 99, [0.05, 0.09, 0.04], 0, 14, 8, 5);
  solid(-62, -5.5, 0, 1.4, 162.6, 164.4); solid(5.5, 62, 0, 1.4, 162.6, 164.4);
  WORLD.navBlocks.push({ x0: -150, x1: -32, z0: 166, z1: 240 }, { x0: 32, x1: 150, z0: 166, z1: 240 }, { x0: -150, x1: 150, z0: 227, z1: 240 });
  propTorii(G, 0, 77 + OZ);
  const gt = signTexture('SAKURA GARDENS', '#ff8fc8', 'font');
  addSign(gt, 0, 4.45, 76.6 + OZ, Math.PI, 6.4, 1.6, [1.4, 1.4, 1.4], 0, true);
  propPath(G, R, [[0, 75 + OZ], [0, 90 + OZ], [0.6, 104 + OZ], [0, 118 + OZ], [0, 122.4 + OZ]], 2.2);
  const loop = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU; loop.push([-11 + Math.cos(a) * 12.5, 102 + OZ + Math.sin(a) * 9]); }
  propPath(G, R, loop, 1.3);
  propPond(G, R, -11, 102 + OZ, 9, 6.5);
  for (let i = 0; i < 13; i++) propSteppingStone(G, R, -3.2 - i * 1.3, 102 + OZ + (i % 2 ? 0.35 : -0.35));
  for (const [x, z, s] of [[-24, 80, 1.1], [-12, 79.5, 0.95], [12, 81, 1.05], [25, 84, 1.2], [-27, 92, 1.0], [-6, 86, 1.0], [5, 88, 0.9], [9, 95, 1.1],
    [17, 104, 1.25], [27, 110, 1.0], [-28, 112, 1.05], [-19, 117, 1.1], [-6, 109, 0.95], [10, 109.5, 1.15], [22, 126, 1.2], [-22, 128, 1.1], [-17, 134, 1.3], [17.5, 134.5, 1.25]])
    propSakura(G, R, x, z + OZ, s, false);
  for (const [x, z] of [[2.3, 80], [-2.3, 80], [2.3, 92], [-2.3, 94], [2.4, 110], [-2.4, 114], [3.4, 120.8], [-3.4, 120.8], [-11, 91.5], [-25, 108.5]]) propToro(G, x, z + OZ);
  propShrine(G, 20, 115 + OZ, solid);                                   // the old shrine now sits off to the side
  // the end of the path: a walled manor
  propManor(G, 0, 219, solid);
  propGate(G, 0, 207.5, 5, solid);
  propCompoundWall(G, -13.5, 207.5, -3, 207.5, solid); propCompoundWall(G, 3, 207.5, 13.5, 207.5, solid);
  propCompoundWall(G, -13.5, 207.5, -13.5, 226, solid); propCompoundWall(G, 13.5, 207.5, 13.5, 226, solid);
  bench(-11, 113.2 + OZ, '-z'); bench(3.6, 99 + OZ, '-x'); bench(-26.3, 101 + OZ, '+x');
  setG('props');
  WORLD.supplies.push({ kind: 'terminal', x: 6.5, z: 203, ry: -0.6, d: 'garden' }, { kind: 'cache', x: -26, z: 86 + OZ, d: 'garden' }, { kind: 'cache', x: 26, z: 131 + OZ, d: 'garden' });

}
