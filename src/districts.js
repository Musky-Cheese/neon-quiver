/* ============================================================
   Districts: the Rail Yard (north), the Night Market (east), the
   Warrens (west) and the Sakura Gardens (south, through the torii)
   hang off Sector 7 plaza. The Docks lie past the far end of the market,
   and the Freight Line runs from the Rail Yard round to the Docks.
   The Flooded Metro joins the Warrens to the Rail Yard, and the Refinery
   joins the Suburbs to the Docks, so both sides of the city loop.
   ============================================================ */
const DISTRICTS = [
  { id: 'hub', name: 'SECTOR 7 PLAZA', x0: -40, x1: 40, z0: -40, z1: 40, env: [0, 5, 10] },
  { id: 'yard', name: 'RAIL YARD', x0: -32, x1: 32, z0: -138, z1: -74, env: [0, 5, -104] },
  { id: 'market', name: 'NIGHT MARKET', x0: 74, x1: 138, z0: -32, z1: 32, env: [106, 5, 0] },
  { id: 'warrens', name: 'THE WARRENS', x0: -138, x1: -74, z0: -32, z1: 32, env: [-84, 5, 0] },
  { id: 'garden', name: 'SAKURA GARDENS', x0: -32, x1: 32, z0: 164, z1: 228, env: [0, 5, 190] },
  { id: 'suburbs', name: 'THE SUBURBS', x0: -60, x1: 60, z0: 74, z1: 162, env: [0, 5, 125] },
  { id: 'docks', name: 'THE DOCKS', x0: 164, x1: 228, z0: -48, z1: 40, env: [196, 5, -4] },
  { id: 'freight', name: 'FREIGHT LINE', x0: 32, x1: 206, z0: -108, z1: -48, env: [118, 5, -100] },
  { id: 'metro', name: 'FLOODED METRO', x0: -136, x1: -34, z0: -136, z1: -36, env: [-113, 2.5, -96] },   // with the underpass from the Warrens and the tunnel from the yard
  { id: 'refinery', name: 'THE REFINERY', x0: 60, x1: 228, z0: 42, z1: 150, env: [168, 5, 116] },       // with the access road from the Suburbs and the gate from the Docks
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
  // a contiguous row of buildings between a0..a1 along one axis. A cut [c0, c1] leaves an opening: the buildings it
  // touches are rolled as ghosts (same dice, nothing built) and rebuilt round the gap at the end (see rebuildCuts)
  const CUTS = [];
  function row(axis, a0, a1, b0, b1, face, hmin, hmax, opt, cut) {
    let a = a0;
    while (a < a1 - 0.01) {
      let w = r(11, 20); if (a1 - (a + w) < 7) w = a1 - a;
      const o = typeof opt === 'function' ? opt(w) : opt, s0 = a, s1 = a + w;
      const make = () => { if (axis === 'x') building(s0, s1, b0, b1, r(hmin, hmax), face, o); else building(b0, b1, s0, s1, r(hmin, hmax), face, o); };
      if (cut && s0 < cut.c1 && s1 > cut.c0) { C.ghost(make); CUTS.push({ axis, s0, s1, b0, b1, face, hmin, hmax, o, cut }); } else make();
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
  row('z', -164, -74, -58, -32, '+x', 14, 30, { industrial: true, mat: 8, col: [0.16, 0.15, 0.14] }, { c0: -108, c1: -92, roof: 6.2 });   // the tunnel out to the Metro
  row('z', -164, -108, 32, 58, '-x', 14, 30, { industrial: true, mat: 8, col: [0.14, 0.15, 0.16] });   // split by the Freight Line cut
  row('z', -92, -74, 32, 58, '-x', 14, 30, { industrial: true, mat: 8, col: [0.14, 0.15, 0.16] });
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
  B(-29.5, 17.4, -129, 0.5, 0.5, 0.5, NEON.red, 4, 24); B(29.5, 17.4, -129, 0.5, 0.5, 0.5, NEON.red, 4, 24);
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
  row('x', 164, 190, -74, -48, '+z', 13, 24, () => dind([0.13 + R() * 0.04, 0.13, 0.12]));   // split by the Freight Line coming in from the north
  row('x', 206, 244, -74, -48, '+z', 13, 24, () => dind([0.13 + R() * 0.04, 0.13, 0.12]));
  row('x', 164, 244, 40, 66, '-z', 13, 24, () => dind([0.12, 0.13, 0.14 + R() * 0.03]), { c0: 199, c1: 213 });   // the gate through to the Refinery
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
  B(242, 22.5, 22, 0.2, 5, 0.2, [0.1, 0.1, 0.1]); B(242, 25, 22, 0.5, 0.5, 0.5, NEON.red, 4, 24);
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
    B(267.5, 33.8, cz, 0.6, 0.6, 0.6, NEON.red, 5, 24); B(211.2, 38.5, cz, 0.5, 0.5, 0.5, NEON.red, 5, 24);
    for (const lx of [211.2, 224.6]) { B(lx, 0.6, cz, 1.6, 1.2, 13, [0.3, 0.14, 0.03], 0, 8); solid(lx - 0.8, lx + 0.8, 0, 1.2, cz - 6.5, cz + 6.5); }   // bogies on the rails
    WORLD.lights.push({ p: [218, 8, cz], r: 18, c: [1.6, 1.4, 1.1], kind: 'lamp' });
  }
  // the container yard: stacks in blocks, lanes between them, gaps to slip through
  for (const [bz, alongX] of [[-12.6, true], [-15.2, true], [-24.6, true], [-27.2, true], [-37.4, true], [-40, true], [12.6, true], [15.2, true], [24.6, true], [27.2, true], [34.8, true]])
    for (const bx of [171.5, 178, 191.5, 198]) { if (R() < 0.22 || (bx > 190 && bz < -36)) continue; const r0 = R(); container(bx, bz, alongX, r0 < 0.3 ? 1 : r0 < 0.72 ? 2 : 3); }
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
  addSign(signTexture('CUSTOMS HOLD', '#ff5a3c', 'panel'), 177, 12, -47.9, 0, 12, 3, [1.3, 1.3, 1.3], 0, false);
  // the harbour itself is off-limits ground
  WORLD.navBlocks.push({ x0: 227.4, x1: 260, z0: -80, z1: 80 });
  WORLD.supplies.push({ kind: 'terminal', x: 166.4, z: -13, ry: Math.PI / 2 + 0.4, d: 'docks' }, { kind: 'cache', x: 222, z: 38, d: 'docks' }, { kind: 'cache', x: 194.5, z: -46, d: 'docks' });


  /* ---------------- FREIGHT LINE (Rail Yard east to the Docks) ---------------- */
  // the yard's free track runs on out through the east wall, along a walled rail cut, and curves south into the port
  setG('near');
  quad(32, 206, -108, -92, 0.012, [0.065, 0.062, 0.058], 3);
  quad(190, 206, -92, -48, 0.012, [0.065, 0.062, 0.058], 3);
  row('x', 58, 216, -134, -108, '+z', 12, 22, () => dind([0.12 + R() * 0.04, 0.12, 0.115]));
  row('x', 58, 190, -92, -66, '-z', 12, 22, () => dind([0.12, 0.12 + R() * 0.03, 0.13]));
  row('z', -108, -74, 206, 232, '-x', 12, 22, () => dind([0.13, 0.12, 0.12]));
  setG('props');
  function track(pts) {   // sleepers + two rails along a polyline
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ang = Math.atan2(dx, dz);
      for (let d = 0; d < L; d += 0.9) rot(ax + ux * d, 0.07, az + uz * d, 2.7, 0.12, 0.26, [0.09, 0.07, 0.06], 0, 0, 0, ang, 0);
      for (const o of [-0.72, 0.72]) C.getG().box(M4.align(M, ax - uz * o, 0.2, az + ux * o, bx - uz * o, 0.2, bz + ux * o, 0.1, 0.14), [0.25, 0.24, 0.24], 0, 4);
    }
  }
  const arc = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI / 2; arc.push([190 + Math.cos(a) * 8, -92 + Math.sin(a) * 8]); }
  track([[32, -100], [190, -100]]); track(arc); track([[198, -92], [198, -52]]);
  // buffer stop where the line ends at the docks
  B(198, 0.6, -51, 3.2, 1.2, 0.6, [0.3, 0.22, 0.04], 0, 8); B(198, 1.3, -50.7, 3, 0.2, 0.1, NEON.red, 2); solid(196.4, 199.6, 0, 1.2, -51.3, -50.7);
  // parked freight on the line (cover, with room to pass either side), and one car that came off the rails
  const fc = [[0.22, 0.09, 0.05], [0.07, 0.09, 0.11], [0.19, 0.17, 0.07], [0.12, 0.05, 0.05]];
  for (const cx of [72, 124, 160]) {
    const c = fc[Math.floor(R() * fc.length)];
    B(cx, 2.35, -100, 12, 3.4, 3.0, c, 0, 8); B(cx, 4.12, -100, 11.6, 0.14, 2.8, [0.07, 0.07, 0.08], 0, 4);
    for (const bx of [-4, 4]) B(cx + bx, 0.55, -100, 2.4, 0.6, 2.4, [0.05, 0.05, 0.05], 0, 4);
    B(cx, 2.4, -98.46, 3.2, 2.6, 0.06, [0.05, 0.05, 0.05], 0, 8);   // door gap
    solid(cx - 6, cx + 6, 0, 4.1, -101.5, -98.5);
  }
  rot(98, 1.9, -103.5, 12, 3.4, 3.0, [0.2, 0.08, 0.04], 0, 8, -0.32, 0.18, 0);   // derailed and tipped against the wall
  solid(92, 104, 0, 3.6, -106.2, -101.2);
  crates(104, -95.5); crates(146, -105.5); barrier(88, -95, 0); barrier(178, -104, 1); barrier(195, -70, 0);
  burnBarrel(110, -95); burnBarrel(185, -95); dumpster(60, -106.2, 0);
  for (const [x, z] of [[110, -95], [185, -95], [140, -106]]) WORLD.steam.push([x, 0.1, z]);
  // signal masts along the line: red aspect, the line is closed
  for (const x of [50, 96, 142, 182]) { B(x, 3, -107, 0.25, 6, 0.25, [0.1, 0.1, 0.11], 0, 4); B(x, 5.8, -106.8, 0.6, 1.2, 0.35, [0.05, 0.05, 0.05]); B(x, 6.1, -106.6, 0.22, 0.22, 0.05, NEON.red, 4); WORLD.circles.push({ x, z: -107, r: 0.2, h: 6 }); }
  B(203, 3, -80, 0.25, 6, 0.25, [0.1, 0.1, 0.11], 0, 4); B(202.8, 6.1, -80, 0.05, 0.22, 0.22, NEON.red, 4);
  flood(84, -106); flood(134, -94); flood(192, -106); flood(204, -66);
  // gantry sign over the yard end of the cut
  for (const gz of [-107.4, -92.6]) { B(33, 4.5, gz, 0.5, 9, 0.5, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: 33, z: gz, r: 0.35, h: 9 }); }
  B(33, 9, -100, 0.6, 0.6, 15.6, [0.3, 0.2, 0.03], 0, 4); B(33, 10.3, -100, 0.4, 2.3, 9.4, [0.04, 0.04, 0.045], 0, 4);
  addSign(signTexture('PORT SEVEN', '#ffb52e', 'seg'), 32.75, 10.3, -100, -Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  addSign(signTexture('RAIL YARD 7', '#ffb52e', 'seg'), 33.25, 10.3, -100, Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  for (const gx of [190.6, 205.4]) { B(gx, 4.5, -48.6, 0.5, 9, 0.5, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: gx, z: -48.6, r: 0.35, h: 9 }); }   // where the line meets the port
  B(198, 9, -48.6, 15.4, 0.6, 0.6, [0.3, 0.2, 0.03], 0, 4); B(198, 10.3, -48.6, 9.4, 2.3, 0.4, [0.04, 0.04, 0.045], 0, 4);
  addSign(signTexture('FREIGHT LINE', '#29e7ff', 'font'), 198, 10.3, -48.35, 0, 9, 2.25, [1.3, 1.3, 1.3], 0, true);
  addSign(signTexture('PORT SEVEN', '#ffb52e', 'seg'), 198, 10.3, -48.85, Math.PI, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
  WORLD.supplies.push({ kind: 'cache', x: 120, z: -106.2, d: 'freight' });

  /* ---------------- THE WARRENS (west) ---------------- */
  setG('near');
  quad(-138, -74, -32, 32, 0.013, [0.04, 0.04, 0.05], 3);
  const brick = { tenement: true, mat: 9, col: [0.16, 0.09, 0.07] }, brick2 = { tenement: true, mat: 9, col: [0.12, 0.1, 0.09] };
  row('x', -164, -74, 32, 58, '-z', 18, 36, brick);
  row('x', -164, -74, -58, -32, '+z', 18, 36, brick2, { c0: -98, c1: -84, roof: 5.4 });   // the Metro underpass
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
    const x = sgn * (66 + k * 8 + (R() - 0.5) * 4), z = fz + (R() - 0.5) * 5, s = 1 + R() * 0.4;
    if (sgn > 0 && z > 105 && z < 127) C.ghost((dummy) => propSakuraFar(dummy, R, x, z, s, k === 0 ? 1 : 0, [0.05, 0.08, 0.04]));   // cleared for the refinery road
    else propSakuraFar(C.getForest(), R, x, z, s, k === 0 ? 1 : 0, [0.05, 0.08, 0.04]);
  }
  propHighway(SG, R, 80, solid);                                                     // the freeway: city behind, suburbs ahead
  propGasStation(SG, 16, 95, solid);
  quad(-62, 62, 155.8, 161.2, 0.014, [0.03, 0.03, 0.025], 16);                         // the stream and its muddy banks
  quad(-62, 62, 156.6, 160.4, 0.024, [0.02, 0.04, 0.045], 18);
  for (let i = 0; i < 40; i++) { const x = -60 + i * 3 + (R() - 0.5) * 2; if (Math.abs(x) < 3) continue; const s = 0.25 + R() * 0.4; SG.blob(pT(PM.a, x, 0.05, (R() < 0.5 ? 156.3 : 160.7) + (R() - 0.5) * 0.5, R() * 6), s * 1.2, s * 0.5, s, 0.3, R() * 99, [0.2, 0.2, 0.19], 0, 16, 9, 6); }
  propFootBridge(SG, 0, 158.5, solid);
  WORLD.navBlocks.push({ x0: -150, x1: -61, z0: 76, z1: 166 }, { x0: 61, x1: 108, z0: 76, z1: 110.4 }, { x0: 61, x1: 108, z0: 121.6, z1: 166 });   // east: the refinery road runs through
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
  // A few big Meshy sakuras instead of a dense procedural grove (r3.js loadHeroSakuras draws them):
  // [x, z, height in metres, yaw]. Each gets a moss mound and a trunk collider here.
  WORLD.heroTrees = [[-13, 80.5 + OZ, 8.2, 0.3], [13.5, 82 + OZ, 7.4, 2.1], [-27, 93 + OZ, 8.8, 4.0], [18.5, 105 + OZ, 9.4, 1.2],
    [-21, 127 + OZ, 8.6, 5.3], [21, 129 + OZ, 9.0, 3.1], [-9.5, 202, 7.6, 0.9], [11, 199.5, 7.8, 2.6]];
  for (const [x, z, h] of WORLD.heroTrees) {
    WORLD.petals.push([x, h * 0.62, z, h * 0.42]);
    G.blob(pT(PM.a, x, 0.0, z, R() * TAU), 1.6, 0.16, 1.6, 0.3, R() * 99, [0.05, 0.08, 0.03], 0, 17, 12, 5);   // moss mound
    solid(x - 0.55, x + 0.55, 0, 3.2, z - 0.55, z + 0.55);
  }
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

  // the buildings the cuts went through, rebuilt either side of the opening; with a roof height the block carries on overhead
  setG('near');
  for (const q of CUTS) {
    const { axis, s0, s1, b0, b1, face, hmin, hmax, o, cut } = q, h = r(hmin, hmax);
    const mk = (a0, a1) => { if (a1 - a0 < 0.3) return; if (axis === 'x') building(a0, a1, b0, b1, h, face, o); else building(b0, b1, a0, a1, h, face, o); };
    mk(s0, Math.min(s1, cut.c0)); mk(Math.max(s0, cut.c1), s1);
    if (cut.roof) {
      const a0 = Math.max(s0, cut.c0), a1 = Math.min(s1, cut.c1);
      const [x0, x1, z0, z1] = axis === 'x' ? [a0, a1, b0, b1] : [b0, b1, a0, a1];
      B((x0 + x1) / 2, (cut.roof + h) / 2, (z0 + z1) / 2, x1 - x0, h - cut.roof, z1 - z0, o.col || [0.12, 0.12, 0.12], 0, o.mat || 1);
      solid(x0, x1, cut.roof, h, z0, z1);
    }
  }

  /* ---------------- THE FLOODED METRO (north-west, between the Warrens and the Rail Yard) ---------------- */
  // Line 3 ran in an open cut below the streets. The pumps died with the power: the track beds are knee-deep in black
  // water, a stalled train still waits at Sector 7 West, and one of the street bridges has come down into the cut.
  {
    const WALL = [0.12, 0.12, 0.125], WALL2 = [0.1, 0.1, 0.105], TILE = [0.46, 0.45, 0.41], DARK = [0.06, 0.06, 0.065], L3 = hex('#ff3d7a'), TOP = 7.4;
    const TR = [-127.5, -98.5];   // the two track centre lines
    setG('near');
    quad(-136, -84, -136, -58, 0.011, [0.05, 0.051, 0.054], 16);                  // the floor of the cut
    quad(-84, -58, -108, -92, 0.012, [0.06, 0.06, 0.062], 3);                      // service ramp to the yard tunnel
    quad(-58, -32, -108, -92, 0.012, [0.055, 0.053, 0.05], 3);                     // the tunnel under the yard wall
    quad(-98, -84, -58, -32, 0.02, [0.3, 0.29, 0.27], 21);                        // underpass tiles
    const water = (x0, x1, z0, z1) => { quad(x0, x1, z0, z1, 0.034, [0.012, 0.02, 0.024], 23); WORLD.floods.push({ x0, x1, z0, z1 }); };
    water(-134, -121, -131, -64); water(-105, -92, -131, -64);
    for (const [x0, x1] of [[-134, -121], [-105, -92]]) B((x0 + x1) / 2, 0.03, -63.85, x1 - x0, 0.06, 0.3, [0.2, 0.2, 0.2], 0, 16);   // the lip where the track bed ends
    // retaining walls: west and north sides of the cut, the street up at the top, buttresses, a tie beam and a railing
    B(-139, TOP / 2, -100, 6, TOP, 84, WALL, 0, 16); solid(-142, -136, 0, TOP, -142, -58);
    B(-113, TOP / 2, -139, 58, TOP, 6, WALL, 0, 16); solid(-142, -84, 0, TOP, -142, -136);
    for (let z = -130; z <= -62; z += 6) { B(-135.7, TOP / 2 - 0.3, z, 0.6, TOP - 0.6, 0.8, WALL2, 0, 16); solid(-136, -135.4, 0, TOP - 0.6, z - 0.4, z + 0.4); }
    for (let x = -130; x <= -90; x += 6) { B(x, TOP / 2 - 0.3, -135.7, 0.8, TOP - 0.6, 0.6, WALL2, 0, 16); solid(x - 0.4, x + 0.4, 0, TOP - 0.6, -136, -135.4); }
    B(-135.75, 6.9, -97, 0.5, 0.4, 78, WALL2, 0, 16); B(-110, 6.9, -135.75, 52, 0.4, 0.5, WALL2, 0, 16);
    B(-135.9, 0.35, -97, 0.2, 0.7, 78, [0.03, 0.035, 0.03], 0, 16); B(-110, 0.35, -135.9, 52, 0.7, 0.2, [0.03, 0.035, 0.03], 0, 16);   // tide mark
    for (const y of [TOP + 0.55, TOP + 1.05]) { B(-136.2, y, -100, 0.07, 0.07, 84, DARK, 0, 4); B(-113, y, -136.2, 58, 0.07, 0.07, DARK, 0, 4); }
    for (let z = -140; z <= -60; z += 2.4) B(-136.2, TOP + 0.55, z, 0.07, 1.1, 0.07, DARK, 0, 4);
    for (let x = -140; x <= -86; x += 2.4) B(x, TOP + 0.55, -136.2, 0.07, 1.1, 0.07, DARK, 0, 4);
    // street lamps at the top, their heads out over the edge: they light the cut from above
    const edgeLamp = (x, z, dx, dz) => {
      B(x, TOP + 3, z, 0.22, 6, 0.22, [0.08, 0.08, 0.1], 0, 4);
      B(x + dx * 1.4, TOP + 6, z + dz * 1.4, dx ? 2.8 : 0.16, 0.14, dz ? 2.8 : 0.16, [0.08, 0.08, 0.1], 0, 4);
      B(x + dx * 2.6, TOP + 5.86, z + dz * 2.6, dx ? 1.0 : 0.4, 0.1, dz ? 1.0 : 0.4, [0.95, 0.9, 0.8], 3.5);
      WORLD.lights.push({ p: [x + dx * 2.6, TOP + 5.4, z + dz * 2.6], r: 24, c: [1.5, 1.3, 1.0], kind: 'lamp' });
      WORLD.halos.push({ p: [x + dx * 2.6, TOP + 5.75, z + dz * 2.6], s: 2.8, c: [-1, 0, 0] });
    };
    edgeLamp(-137.6, -120, 1, 0); edgeLamp(-137.6, -96, 1, 0); edgeLamp(-137.6, -66, 1, 0); edgeLamp(-112, -137.6, 0, 1);
    // emergency lighting on the walls: red, running off batteries that should have died years ago
    for (const [x, z, ry] of [[-135.3, -124, 0], [-135.3, -106, 0], [-135.3, -88, 0], [-135.3, -70, 0], [-121, -135.3, 1], [-104, -135.3, 1], [-90, -135.3, 1]]) {
      B(x, 3.3, z, ry ? 1.2 : 0.12, 0.14, ry ? 0.12 : 1.2, [1, 0.15, 0.12], 3.2);
      WORLD.halos.push({ p: [ry ? x : x + 0.25, 3.3, ry ? z + 0.25 : z], s: 1.4, c: [0.8, 0.08, 0.06] });
      WORLD.lights.push({ p: [ry ? x : x + 1.5, 3, ry ? z + 1.5 : z], r: 9, c: [1.5, 0.18, 0.12] });
    }
    // the tunnel mouths at the north end: black, with the signals still at danger
    for (const tx of TR) {
      B(tx, 2.9, -135.94, 6.2, 5.8, 0.1, [0.004, 0.004, 0.006]);
      B(tx, 6.1, -135.7, 7.4, 0.6, 0.6, WALL2, 0, 16); for (const s of [-1, 1]) B(tx + s * 3.4, 2.9, -135.7, 0.6, 5.8, 0.6, WALL2, 0, 16);
      for (let i = 0; i < 6; i++) B(tx - 3.1 + i * 1.24, 6.1, -135.38, 0.55, 0.3, 0.04, i % 2 ? [0.03, 0.03, 0.03] : [0.9, 0.62, 0.08], i % 2 ? 0 : 0.6);
      B(tx + 2.2, 4.6, -135.5, 0.4, 0.9, 0.3, DARK, 0, 4); B(tx + 2.2, 4.8, -135.33, 0.2, 0.2, 0.05, NEON.red, 4);
      WORLD.halos.push({ p: [tx + 2.2, 4.8, -135.2], s: 1.1, c: [0.8, 0.05, 0.05] });
      for (const o of [-0.72, 0.72]) B(tx + o, 0.03, -97.5, 0.1, 0.06, 67, [0.3, 0.26, 0.24], 0, 4);   // rails just breaking the surface
      addSign(signTexture('LINE 3', '#ff3d7a', 'seg'), tx, 7.0, -135.3, 0, 4.4, 1.1, [1.3, 1.3, 1.3], 0, true);
    }
    // the island platform: dry ground, with steps up out of the water
    B(-113, 0.22, -98, 16, 0.44, 60, [0.15, 0.15, 0.15], 0, 16); solid(-121, -105, 0, 0.44, -128, -68);
    for (const ex of [-120.7, -105.3]) { B(ex, 0.447, -98, 0.36, 0.01, 60, [0.8, 0.62, 0.08], 0.35, 0); B(ex + (ex < -113 ? 0.9 : -0.9), 0.447, -98, 0.5, 0.01, 60, [0.3, 0.28, 0.22], 0, 16); }
    const step = (x0, x1, z0, z1) => { B((x0 + x1) / 2, 0.11, (z0 + z1) / 2, x1 - x0, 0.22, z1 - z0, [0.13, 0.13, 0.13], 0, 16); solid(x0, x1, 0, 0.22, z0, z1); };
    step(-121, -105, -68, -67.2); step(-121, -105, -128.8, -128);
    for (const sz of [-106, -88, -74]) { step(-121.8, -121, sz - 1.6, sz + 1.6); step(-105, -104.2, sz - 1.6, sz + 1.6); }
    // the canopy over the middle of the platform: out of the rain, lit by the last working tubes
    for (const cx of [-117, -109]) for (const cz of [-101, -93, -85]) { B(cx, 2.5, cz, 0.5, 5, 0.5, [0.2, 0.2, 0.21], 0, 4); WORLD.circles.push({ x: cx, z: cz, r: 0.3, h: 5 }); }
    B(-113, 5.2, -93, 17, 0.4, 23, WALL, 0, 16); solid(-121.5, -104.5, 5.0, 5.4, -104.5, -81.5);
    for (const ex of [-121.4, -104.6]) B(ex, 4.7, -93, 0.2, 0.7, 23, [0.08, 0.08, 0.09], 0, 4);
    WORLD.indoor.push({ x0: -121, x1: -105, z0: -104, z1: -82, y1: 5 });
    for (const tx of [-117, -109]) for (let tz = -102; tz <= -84; tz += 3) { const dead = ((tx * 7 + tz * 13) & 7) === 3; B(tx, 4.96, tz, 0.12, 0.06, 1.3, dead ? [0.25, 0.25, 0.27] : [0.9, 0.95, 1], dead ? 0 : 3); }
    for (const tz of [-99, -91, -84]) WORLD.lights.push({ p: [-113, 4.4, tz], r: 11, c: [1.0, 1.15, 1.3] });
    const stn = signTexture('SECTOR 7 WEST', '#ff3d7a', 'panel');
    addSign(stn, -121.55, 4.7, -93, -Math.PI / 2, 8, 2, [1.3, 1.3, 1.3], 0, false); addSign(stn, -104.45, 4.7, -93, Math.PI / 2, 8, 2, [1.3, 1.3, 1.3], 0, false);
    for (const [bz, ry] of [[-103.6, Math.PI], [-82.4, 0]]) { B(-113, 4.3, bz, 3.6, 0.8, 0.2, [0.03, 0.03, 0.035], 0, 4); addSign(signTexture('NO SERVICE', '#ffb52e', 'seg'), -113, 4.3, bz + (ry ? -0.12 : 0.12), ry, 3.2, 0.8, [1.3, 1.3, 1.3], 0, true); }
    // the train that never left: three cars in the east track bed, doors open, one still lit inside
    const car = (z0, z1, lit) => {
      const cz = (z0 + z1) / 2, L = z1 - z0, x = TR[1];
      B(x, 2.05, cz, 2.9, 3.5, L, [0.44, 0.46, 0.48], 0, 8); B(x, 3.86, cz, 2.6, 0.2, L - 0.3, [0.18, 0.18, 0.2], 0, 4);
      B(x, 0.25, cz, 2.5, 0.5, L - 2, [0.04, 0.04, 0.045], 0, 4);
      for (const s of [-1, 1]) {
        B(x + s * 1.46, 2.55, cz, 0.04, 0.85, L - 1.4, lit ? [0.35, 0.45, 0.5] : [0.05, 0.06, 0.07], lit ? 0.9 : 0);
        B(x + s * 1.47, 1.3, cz, 0.04, 0.16, L - 0.4, L3, 1.6);
        for (const d of [-L / 4, L / 4]) B(x + s * 1.48, 1.75, cz + d, 0.05, 2.5, 1.3, [0.02, 0.02, 0.025], 0, 4);
      }
      solid(x - 1.5, x + 1.5, 0, 3.95, z0, z1);
      if (lit) { WORLD.lights.push({ p: [x, 2.6, cz], r: 8, c: [0.6, 0.85, 1.0] }); WORLD.halos.push({ p: [x + 1.5, 2.55, cz], s: 2, c: [0.15, 0.2, 0.25] }); }
    };
    car(-127, -113, false); car(-110, -96, true); car(-93, -79, false);
    B(TR[1], 2.3, -127.05, 2.4, 0.9, 0.08, [0.03, 0.03, 0.03], 0, 4); addSign(signTexture('3  TERMINUS', '#ffb52e', 'seg'), TR[1], 2.3, -127.12, Math.PI, 2.2, 0.55, [1.3, 1.3, 1.3], 0, true);
    for (const s of [-0.9, 0.9]) B(TR[1] + s, 1.2, -127.06, 0.35, 0.2, 0.05, [1, 0.95, 0.8], 2.5);
    // the street bridge that came down: stubs on the walls, the deck slid into the west track bed and across the platform
    B(-131, 7.0, -120, 10, 0.9, 8, WALL, 0, 16); solid(-136, -126, 6.55, 7.45, -124, -116);
    B(-89, 7.0, -120, 10, 0.9, 8, WALL, 0, 16); solid(-94, -84, 6.55, 7.45, -124, -116);
    for (const x of [-126.3, -93.7]) for (let i = 0; i < 5; i++) rot(x + (x < -110 ? 0.4 : -0.4) * (i % 2), 6.9 + (i - 2) * 0.12, -123 + i * 1.6, 1.4 + (i % 3) * 0.5, 0.05, 0.05, [0.3, 0.16, 0.08], 0, 4, 0, 0.3 * (i - 2), 0);   // rebar
    { const ax = -126, ay = 6.6, bx = -110, by = 0.55, L = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      rot((ax + bx) / 2, (ay + by) / 2, -120, L + 0.6, 0.8, 7.6, WALL, 0, 16, 0, 0, ang);
      rot((ax + bx) / 2, (ay + by) / 2 + 0.6, -123.7, L, 0.9, 0.3, WALL2, 0, 16, 0, 0, ang); rot((ax + bx) / 2, (ay + by) / 2 + 0.6, -116.3, L, 0.9, 0.3, WALL2, 0, 16, 0, 0, ang);   // parapets
      for (let x = ax; x < bx; x += 2) { const t = (x + 2 - ax) / (bx - ax); solid(x, Math.min(bx, x + 2), 0, lerp(ay, by, Math.min(1, t)) + 0.5, -123.8, -116.2); }
      for (let i = 0; i < 16; i++) { const t = R(), s = 0.3 + R() * 0.5; C.getG().blob(pT(PM.a, lerp(ax + 3, bx + 1, t) + (R() - 0.5) * 2, s * 0.4 + (t > 0.7 ? 0.44 : 0), -120 + (R() < 0.5 ? -1 : 1) * (4.2 + R() * 1.2), R() * 6), s * 1.3, s * 0.6, s, 0.35, R() * 99, [0.14, 0.14, 0.14], 0, 16, 9, 6); }
    }
    // a bridge that held: shelter from the rain, and a deck overhead
    B(-110, 7.45, -76, 52, 0.9, 8, WALL, 0, 16); solid(-136, -84, 7.0, 7.9, -80, -72);
    for (const bz of [-80.15, -71.85]) B(-110, 8.4, bz, 52, 1.0, 0.3, WALL2, 0, 16);
    for (const bz of [-78.5, -73.5]) B(-110, 6.8, bz, 52, 0.4, 0.5, DARK, 0, 4);
    B(-113, 3.5, -76, 1.4, 7, 1.4, WALL2, 0, 16); WORLD.circles.push({ x: -113, z: -76, r: 0.75, h: 7 });
    WORLD.indoor.push({ x0: -136, x1: -84, z0: -80, z1: -72, y1: 7 });
    for (const x of [-126, -99]) { B(x, 6.5, -76, 0.6, 0.12, 0.3, [1, 0.55, 0.2], 3); WORLD.lights.push({ p: [x, 6, -76], r: 11, c: [1.6, 0.75, 0.22], shop: true }); }
    addSign(signTexture("DON'T TOUCH THE WATER", '#a6ff3a', 'font'), -135.35, 3.6, -94, Math.PI / 2, 7, 1.75, [1.2, 1.2, 1.2], 0, true);
    addSign(signTexture('THEY LIVE BELOW', '#ff2e88', 'font'), -118, 3.2, -135.35, 0, 6, 1.5, [1.1, 1.1, 1.1], 0, true);
    // broken pipes in the walls still pouring into the cut
    for (const [x, y, z, dx, dz] of [[-135.4, 5.0, -109, 1, 0], [-135.4, 4.2, -83, 1, 0], [-114, 5.4, -135.4, 0, 1], [-101.5, 4.6, -135.4, 0, 1]]) {
      B(x + dx * 0.3, y, z + dz * 0.3, dx ? 0.8 : 0.5, 0.5, dz ? 0.8 : 0.5, [0.2, 0.12, 0.07], 0, 4);
      WORLD.cascades.push([x + dx * 0.7, y - 0.1, z + dz * 0.7, dx, dz]);
    }
    // east side: the station buildings, the service strip along the train, and the ramp to the yard tunnel
    building(-84, -58, -142, -108, r(16, 26), '-x', { industrial: true, mat: 8, col: [0.13, 0.13, 0.135] });
    building(-84, -58, -92, -58, r(16, 26), '-x', { industrial: true, mat: 8, col: [0.12, 0.125, 0.13] });
    // behind the walls, up at street level: tenements looking down into the cut
    const flats = () => R() < 0.5 ? { tenement: true, mat: 9, col: [0.15, 0.09, 0.07] } : { tenement: true, mat: 1, col: [0.1, 0.1, 0.115] };
    row('z', -176, -58, -178, -142, '+x', 24, 52, flats);
    row('x', -142, -84, -178, -142, '+z', 24, 52, flats);
    // the Warrens underpass: white tile, Line 3 magenta, a row of dead ticket gates
    for (const wx of [-97.95, -84.05]) { B(wx, 2.7, -45, 0.1, 5.4, 26, TILE, 0, 20); B(wx + (wx < -91 ? 0.06 : -0.06), 2.1, -45, 0.06, 0.35, 26, L3, 0.9); }
    B(-91, 5.35, -45, 14, 0.1, 26, [0.2, 0.2, 0.21], 0, 16);
    WORLD.indoor.push({ x0: -98, x1: -84, z0: -58, z1: -32, y1: 5.4 });
    for (const tz of [-54, -45, -36]) { B(-91, 5.27, tz, 0.16, 0.06, 2.4, [0.9, 0.95, 1], 3); WORLD.lights.push({ p: [-91, 4.8, tz], r: 10, c: [1.0, 1.1, 1.25] }); }
    for (const gx of [-96, -91, -86]) { B(gx, 0.5, -49, 0.3, 1.0, 1.6, [0.3, 0.3, 0.32], 0, 4); B(gx, 1.02, -49, 0.34, 0.06, 1.64, L3, 1.2); solid(gx - 0.15, gx + 0.15, 0, 1.0, -49.8, -48.2); }
    addSign(signTexture('METRO  LINE 3', '#ff3d7a', 'panel'), -91, 6.6, -31.75, 0, 10, 2.5, [1.3, 1.3, 1.3], 0, false);
    addSign(signTexture('SECTOR 7 WEST', '#ff3d7a', 'panel'), -91, 6.6, -58.25, Math.PI, 10, 2.5, [1.3, 1.3, 1.3], 0, false);
    for (const gx of [-99.2, -82.8]) {   // the magenta globes either side of the entrance
      B(gx, 1.6, -31.2, 0.14, 3.2, 0.14, DARK, 0, 4); C.getG().sphere(M4.trs(M, gx, 3.45, -31.2, 0, 0, 0, 0.55, 0.55, 0.55), L3, 2.4, 0, 12, 8);
      WORLD.halos.push({ p: [gx, 3.45, -31.2], s: 2, c: [0.6, 0.12, 0.28] }); WORLD.lights.push({ p: [gx, 3.2, -30.4], r: 9, c: [1.6, 0.3, 0.7], shop: true }); WORLD.circles.push({ x: gx, z: -31.2, r: 0.12, h: 3.2 });
    }
    // the yard tunnel: bare concrete, sodium lamps, the way marked in paint
    for (const wz of [-107.95, -92.05]) { B(-45, 3.1, wz, 26, 6.2, 0.1, [0.16, 0.16, 0.155], 0, 16); B(-45, 0.6, wz + (wz < -100 ? 0.06 : -0.06), 26, 0.3, 0.05, NEON.amber, 0.7); }
    B(-45, 6.15, -100, 26, 0.1, 16, [0.13, 0.13, 0.13], 0, 16);
    WORLD.indoor.push({ x0: -58, x1: -32, z0: -108, z1: -92, y1: 6.2 });
    for (const tx of [-52, -38]) { B(tx, 6.05, -100, 0.6, 0.12, 0.3, [1, 0.55, 0.2], 3); WORLD.lights.push({ p: [tx, 5.4, -100], r: 12, c: [1.6, 0.75, 0.22], shop: true }); }
    addSign(signTexture('METRO  LINE 3', '#ff3d7a', 'panel'), -31.75, 7.4, -100, Math.PI / 2, 9, 2.25, [1.3, 1.3, 1.3], 0, false);
    addSign(signTexture('RAIL YARD 7', '#ffb52e', 'seg'), -58.25, 7.4, -100, -Math.PI / 2, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
    setG('props');
    // wreckage and squatters' camps
    propHoverCar(C.getG(), R, TR[0], -70.5, 0.5, [0.22, 0.05, 0.07], 1); solid(TR[0] - 1.6, TR[0] + 1.6, 0, 1.3, -73.2, -67.8);   // fell in from the street
    for (const [x, z] of [[-110, -61], [-87, -82]]) burnBarrel(x, z);
    crates(-89, -114); crates(-126, -60.5); barrier(-88, -100, 1); barrier(-96, -62, 0); dumpster(-131, -60.4, 0);
    for (const [x, z] of [[-86, -104], [-121, -61], [-113, -66]]) WORLD.steam.push([x, 0.1, z]);
    propVend(C.getG(), R, -113, -103.3, 0, 1, NEON.cyan); propVend(C.getG(), R, -114.3, -103.3, 0, 1, NEON.mag);
    bench(-113.4, -89, '-x'); bench(-112.6, -89, '+x'); bench(-113.4, -97, '-x'); bench(-112.6, -97, '+x');
    propBin(C.getG(), R, -113, -93); propBin(C.getG(), R, -113, -85.5);
    { const kx = -113, kz = -73; B(kx, 1.3, kz, 3.2, 2.6, 2.2, [0.12, 0.12, 0.14], 0, 4); B(kx, 1.4, kz + 1.12, 2.8, 1.0, 0.04, [0.2, 0.18, 0.15], 0.5, 8); B(kx, 2.75, kz, 3.5, 0.15, 2.5, L3, 1.2); solid(kx - 1.6, kx + 1.6, 0, 2.6, kz - 1.1, kz + 1.1);
      addSign(signTexture('TICKETS', '#ff3d7a', 'font'), kx, 2.2, kz + 1.16, 0, 2.4, 0.6, [1.3, 1.3, 1.3], 0, true); }
    for (const [x, z] of [[-89, -124], [-89, -71]]) { B(x, 1.1, z, 2.4, 2.2, 3.2, [0.2, 0.22, 0.2], 0, 8); B(x - 1.25, 1.6, z, 0.06, 0.4, 0.4, NEON.lime, 2); solid(x - 1.2, x + 1.2, 0, 2.2, z - 1.6, z + 1.6); }   // dead pump sets
    WORLD.supplies.push({ kind: 'terminal', x: -119.4, z: -97, ry: Math.PI / 2, d: 'metro' }, { kind: 'cache', x: -88.5, z: -118, d: 'metro' }, { kind: 'cache', x: -131, z: -63, d: 'metro' });
  }

  /* ---------------- THE REFINERY (south-east, between the Suburbs and the Docks) ---------------- */
  // Petrochem 7: a tank farm, a process unit still venting, a loading rack and a tanker at the jetty. Down the access
  // road from the Suburbs, or through the gate at the south end of the Docks. The small fuel tanks still hold pressure.
  {
    const STEEL = [0.5, 0.5, 0.47], DARK = [0.06, 0.06, 0.065], YEL = [0.8, 0.6, 0.08], CONCR = [0.2, 0.2, 0.19];
    setG('near');
    quad(104, 228, 66, 146, 0.012, [0.068, 0.066, 0.062], 16);                        // plant concrete
    quad(199, 213, 40, 66, 0.012, [0.07, 0.068, 0.064], 16);                          // the gate through the Docks wall
    quad(60, 108, 108.5, 123.5, 0.013, [0.04, 0.05, 0.035], 19);                      // verges of the access road
    quad(62, 226, 111, 121, 0.016, [0.045, 0.045, 0.05], 3);                           // the road in, carrying on through the plant to the jetty
    quad(201, 211, 40, 144, 0.017, [0.045, 0.045, 0.05], 3);                           // north-south haul road from the Docks
    for (let x = 64; x < 224; x += 5) if (x < 199 || x > 211) quad(x, x + 2.4, 115.9, 116.1, 0.021, YEL, 16);
    for (let z = 42; z < 142; z += 5) if (z < 109 || z > 121) quad(205.9, 206.1, z, z + 2.4, 0.021, YEL, 16);
    quad(114, 166, 72, 97, 0.014, [0.055, 0.052, 0.048], 16);                          // inside the bund
    quad(226.8, 228.4, 66, 146, 0.04, [0.45, 0.35, 0.05], 16);                         // painted quay edge
    row('x', 104, 164, 56, 66, '+z', 12, 22, () => dind([0.13, 0.125 + R() * 0.03, 0.12]));   // the north wall: backs onto the market
    // fences: chain-link on posts, barbed wire on top (the woods show through)
    const fence = (x0, z0, x1, z1) => {
      const ax = z0 === z1, L = ax ? x1 - x0 : z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, out = ax ? (cz > 116 ? 1 : -1) : -1;
      for (const y of [0.2, 1.4, 2.6]) B(cx, y, cz, ax ? L : 0.05, 0.05, ax ? 0.05 : L, [0.2, 0.21, 0.22], 0, 4);
      for (const y of [3.05, 3.25, 3.45]) B(cx + (ax ? 0 : out * (y - 2.85)), y, cz + (ax ? out * (y - 2.85) : 0), ax ? L : 0.02, 0.02, ax ? 0.02 : L, [0.15, 0.15, 0.16], 0, 4);
      for (let a = 0; a <= L + 0.01; a += 3) { const px = ax ? x0 + a : cx, pz = ax ? cz : z0 + a; B(px, 1.45, pz, 0.08, 2.9, 0.08, DARK, 0, 4); rot(px + (ax ? 0 : out * 0.2), 3.1, pz + (ax ? out * 0.2 : 0), 0.05, 0.6, 0.05, DARK, 0, 4, ax ? out * 0.6 : 0, 0, ax ? 0 : -out * 0.6); }
      solid(ax ? x0 : cx - 0.1, ax ? x1 : cx + 0.1, 0, 3.4, ax ? cz - 0.1 : z0, ax ? cz + 0.1 : z1);
    };
    fence(60, 110.2, 108, 110.2); fence(60, 121.8, 108, 121.8);
    fence(108, 66, 108, 110.2); fence(108, 121.8, 108, 144); fence(108, 144, 228, 144);
    // woods round the outside of the fence, closing the gap to the suburbs' treeline
    for (let i = 0; i < 70; i++) {
      const x = 76 + R() * 30, z = 58 + R() * 92; if (z > 106 && z < 126) continue; if (x < 96 && z > 74) continue;
      propSakuraFar(C.getForest(), R, x, z, 1 + R() * 0.4, x > 100 ? 1 : 0, [0.05, 0.08, 0.04]);
    }
    setG('props');
    // the checkpoint where the road meets the fence
    for (const gz of [110.6, 121.4]) { B(106, 3.5, gz, 0.5, 7, 0.5, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: 106, z: gz, r: 0.35, h: 7 }); }
    B(106, 7.1, 116, 0.6, 0.6, 11.4, [0.3, 0.2, 0.03], 0, 4); B(106, 8.3, 116, 0.4, 2.2, 8.4, [0.04, 0.04, 0.045], 0, 4);
    addSign(signTexture('PETROCHEM 7', '#ffb52e', 'seg'), 105.75, 8.3, 116, -Math.PI / 2, 8, 2, [1.4, 1.4, 1.4], 0, true);
    addSign(signTexture('SUBURBS', '#29e7ff', 'font'), 106.25, 8.3, 116, Math.PI / 2, 8, 2, [1.3, 1.3, 1.3], 0, true);
    { const bx = 110.8, bz = 124.6; B(bx, 1.4, bz, 3, 2.8, 3, [0.16, 0.16, 0.17], 0, 8); B(bx - 1.52, 1.7, bz, 0.04, 1.0, 2.2, [0.3, 0.4, 0.42], 0.8); B(bx, 2.95, bz, 3.4, 0.2, 3.4, DARK, 0, 4); solid(bx - 1.5, bx + 1.5, 0, 2.8, bz - 1.5, bz + 1.5);
      WORLD.lights.push({ p: [bx - 2.5, 2.2, bz], r: 8, c: [0.9, 1.1, 1.2], shop: true }); }
    B(108.6, 0.6, 121.1, 0.3, 1.2, 0.3, DARK, 0, 4); rot(108.6, 3.2, 118.9, 0.14, 4.6, 0.14, [0.8, 0.1, 0.08], 0.3, 0, 0.55, 0, 0);   // the boom, left up
    WORLD.circles.push({ x: 108.6, z: 121.1, r: 0.2, h: 1.2 });
    addSign(signTexture('DANGER  FLAMMABLE', '#ff3040', 'panel'), 107.85, 2.1, 103, -Math.PI / 2, 4, 1, [1.2, 1.2, 1.2], 0, false);
    addSign(signTexture('NO NAKED FLAMES', '#ff3040', 'panel'), 107.85, 2.1, 129, -Math.PI / 2, 4, 1, [1.2, 1.2, 1.2], 0, false);
    lamp(74, 111.4); lamp(94, 120.6);
    propHoverCar(C.getG(), R, 85, 117.5, 2.2, [0.2, 0.2, 0.08], 0); solid(83, 87, 0, 1.3, 115.6, 119.4);
    barrier(98, 113.5, 0); barrier(117, 119.3, 0);
    // sodium masts: the plant's own lighting, orange and hard
    const sodium = (x, z) => {
      B(x, 7, z, 0.35, 14, 0.35, [0.14, 0.14, 0.15], 0, 4); B(x, 14.1, z, 1.8, 0.2, 0.5, DARK, 0, 4);
      for (const o of [-0.6, 0.6]) B(x + o, 13.9, z, 0.5, 0.12, 0.35, [1, 0.62, 0.25], 3.5);
      WORLD.circles.push({ x, z, r: 0.25, h: 14 }); WORLD.lights.push({ p: [x, 13.3, z], r: 26, c: [1.8, 1.05, 0.45], kind: 'lamp' });
      WORLD.halos.push({ p: [x, 13.8, z], s: 3.2, c: [0.9, 0.5, 0.15] });
    };
    sodium(112, 124); sodium(162, 123); sodium(199.5, 123); sodium(199.5, 70); sodium(213, 109); sodium(140, 69); sodium(222, 141);
    // tank farm: two big storage tanks in a bund
    for (const [x0, x1, z0, z1] of [[114, 166, 71.85, 72.15], [114, 138, 96.85, 97.15], [142, 166, 96.85, 97.15], [113.85, 114.15, 72, 97], [165.85, 166.15, 72, 97]]) { B((x0 + x1) / 2, 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, CONCR, 0, 16); solid(x0, x1, 0, 0.3, z0, z1); }
    for (const [x, z, id] of [[126, 84, 'T-101'], [153, 84, 'T-102']]) {
      const g = C.getG();
      g.cyl(M4.trs(M, x, 5.5, z, 0, 0, 0, 14, 11, 14), [0.52, 0.51, 0.47], 0, 8, 32, 0.5, 0.5, false);
      g.lathe(pT(PM.a, x, 11, z), [[7.05, 0], [5.2, 0.7], [0.5, 1.3], [0.01, 1.35]], [0.4, 0.4, 0.38], 0, 8, 32, true, false);
      g.ring(M4.trs(M, x, 9.8, z, 0, 0, 0, 1, 1, 1), [0.3, 0.3, 0.29], 0, 4, 7.15, 0.12, 40, 4);
      g.ring(M4.trs(M, x, 0.35, z, 0, 0, 0, 1, 1, 1), [0.12, 0.1, 0.08], 0, 8, 7.05, 0.3, 40, 4);   // rusted foot
      for (let i = 0; i < 18; i++) { const a = 0.6 + i / 18 * Math.PI * 0.95, y = 0.35 + i * 0.6; rot(x + Math.cos(a) * 7.55, y, z + Math.sin(a) * 7.55, 1.0, 0.08, 0.9, [0.3, 0.22, 0.04], 0, 4, 0, -a, 0); if (i % 3 === 0) B(x + Math.cos(a) * 8.05, y + 0.55, z + Math.sin(a) * 8.05, 0.06, 1.1, 0.06, [0.3, 0.22, 0.04], 0, 4); }
      addSign(signTexture(id, '#ffb52e', 'panel'), x, 6.5, z + 7.1, 0, 4.4, 1.1, [1.1, 1.1, 1.1], 0, false);
      B(x, 12.55, z, 0.35, 0.35, 0.35, NEON.red, 4); WORLD.halos.push({ p: [x, 12.6, z], s: 1.3, c: [0.8, 0.05, 0.05] });
      WORLD.circles.push({ x, z, r: 7.1, h: 11 });
    }
    // the process unit: distillation columns in a steel frame, exchangers on saddles, lights up the columns
    for (const [x, z, rad, h] of [[176, 80, 2.0, 34], [186, 76.5, 1.4, 26], [193, 89, 1.7, 30]]) {
      const g = C.getG();
      g.cyl(M4.trs(M, x, h / 2, z, 0, 0, 0, rad * 2, h, rad * 2), [0.56, 0.56, 0.54], 0, 4, 18);
      g.sphere(M4.trs(M, x, h, z, 0, 0, 0, rad * 2, rad * 1.1, rad * 2), [0.5, 0.5, 0.48], 0, 4, 14, 6);
      for (let y = 6; y < h - 2; y += 6) { g.ring(M4.trs(M, x, y, z, 0, 0, 0, 1, 1, 1), [0.3, 0.22, 0.04], 0, 4, rad + 0.7, 0.06, 24, 3); B(x + rad + 0.2, y - 0.02, z, 1, 0.06, 1.2, [0.2, 0.2, 0.2], 0, 4);
        if ((y / 6) % 2) { B(x + rad + 0.75, y + 0.9, z, 0.2, 0.2, 0.2, [1, 0.8, 0.5], 3); WORLD.halos.push({ p: [x + rad + 0.9, y + 0.9, z], s: 1.1, c: [0.5, 0.35, 0.15] }); } }
      B(x + rad + 0.1, h / 2, z - 0.6, 0.06, h, 0.06, DARK, 0, 4); B(x + rad + 0.1, h / 2, z + 0.6, 0.06, h, 0.06, DARK, 0, 4);   // ladder
      B(x, h + rad * 0.6 + 0.5, z, 0.3, 0.3, 0.3, NEON.red, 4); WORLD.halos.push({ p: [x, h + rad * 0.6 + 0.5, z], s: 1.6, c: [0.8, 0.05, 0.05] });
      WORLD.circles.push({ x, z, r: rad + 0.1, h });
    }
    for (const [fx, fz] of [[171, 72], [197, 72], [171, 98], [197, 98]]) { B(fx, 7.5, fz, 0.4, 15, 0.4, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: fx, z: fz, r: 0.25, h: 15 }); }
    for (const y of [5, 10, 15]) { for (const fz of [72, 98]) B(184, y, fz, 26, 0.35, 0.35, [0.3, 0.2, 0.03], 0, 4); for (const fx of [171, 197]) B(fx, y, 85, 0.35, 0.35, 26, [0.3, 0.2, 0.03], 0, 4); }
    B(184, 10.1, 94, 26, 0.08, 8, [0.14, 0.14, 0.15], 0, 4); solid(171, 197, 9.9, 10.2, 90, 98);   // a grating deck
    for (let i = 0; i < 7; i++) { B(172 + i * 4, 9.6, 90.3, 0.25, 0.2, 0.25, [1, 0.85, 0.6], 3); } WORLD.lights.push({ p: [184, 8.5, 92], r: 14, c: [1.4, 1.2, 0.9] });
    for (const [x, z] of [[179, 93.5], [188, 95]]) {
      const g = C.getG(); g.cyl(M4.trs(M, x, 1.5, z, 0, 0, Math.PI / 2, 2.0, 8, 2.0), [0.42, 0.44, 0.44], 0, 4, 14);
      for (const o of [-2.6, 2.6]) B(x + o, 0.35, z, 0.5, 0.7, 2.2, CONCR, 0, 16);
      solid(x - 4, x + 4, 0, 2.5, z - 1, z + 1);
    }
    // the pipe rack along the road, and the pipe bridge that crosses it
    for (let x = 112; x <= 196; x += 8) for (const pz of [107.4, 109.6]) { B(x, 3.7, pz, 0.3, 7.4, 0.3, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x, z: pz, r: 0.2, h: 7.4 }); }
    for (const y of [4.8, 6.8]) B(154, y, 108.5, 84.5, 0.3, 2.5, [0.3, 0.2, 0.03], 0, 4);
    for (const [y, pz, rad, c] of [[5.2, 107.8, 0.45, [0.5, 0.5, 0.48]], [5.2, 108.7, 0.3, [0.1, 0.25, 0.4]], [5.15, 109.3, 0.25, [0.55, 0.1, 0.08]], [7.2, 108, 0.35, [0.4, 0.4, 0.38]], [7.15, 109, 0.3, [0.2, 0.3, 0.12]]])
      C.getG().cyl(M4.trs(M, 154, y, pz, 0, 0, Math.PI / 2, rad * 2, 84, rad * 2), c, 0, 4, 10);
    solid(112, 196, 4.6, 7.6, 107.2, 109.8);
    for (const [px, pz] of [[148, 110.6], [152, 110.6], [148, 121.4], [152, 121.4]]) { B(px, 3.4, pz, 0.35, 6.8, 0.35, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: px, z: pz, r: 0.22, h: 6.8 }); }
    B(150, 6.7, 116, 4.4, 0.3, 14.5, [0.3, 0.2, 0.03], 0, 4);
    for (const [ox, rad, c] of [[-1.2, 0.4, [0.5, 0.5, 0.48]], [0, 0.3, [0.1, 0.25, 0.4]], [1.1, 0.35, [0.55, 0.1, 0.08]]]) C.getG().cyl(M4.trs(M, 150 + ox, 7.2, 116, Math.PI / 2, 0, 0, rad * 2, 16, rad * 2), c, 0, 4, 10);
    solid(147.5, 152.5, 6.5, 7.6, 108, 124);
    WORLD.fires.push({ x: 160, y: 5.35, z: 108.3 }); WORLD.halos.push({ p: [160, 5.9, 108.3], s: 2.6, c: [0.9, 0.4, 0.08] }); WORLD.lights.push({ p: [160, 5, 110], r: 12, c: [1.9, 0.8, 0.2] });   // a flange that's been burning for weeks
    // the loading rack: a canopy over two bays, tankers still waiting to fill
    for (const cx of [130, 144, 158]) for (const cz of [125.5, 140.5]) { B(cx, 3.2, cz, 0.45, 6.4, 0.45, [0.25, 0.25, 0.27], 0, 4); WORLD.circles.push({ x: cx, z: cz, r: 0.28, h: 6.4 }); }
    B(144, 6.6, 133, 34, 0.4, 17, [0.3, 0.3, 0.31], 0, 8); B(144, 6.25, 124.55, 34, 0.5, 0.1, [0.9, 0.9, 0.9], 0, 16); B(144, 6.25, 141.45, 34, 0.5, 0.1, [0.9, 0.9, 0.9], 0, 16);
    B(144, 6.25, 124.5, 34, 0.14, 0.12, [0.8, 0.15, 0.1], 1.2);
    solid(127, 161, 6.4, 6.8, 124.5, 141.5); WORLD.indoor.push({ x0: 128, x1: 160, z0: 125, z1: 141, y1: 6.4 });
    for (const lx of [134, 144, 154]) for (const lz of [128, 138]) { B(lx, 6.36, lz, 2.2, 0.06, 0.2, [0.95, 0.95, 1], 3); }
    for (const [lx, lz] of [[137, 128], [151, 128], [137, 138], [151, 138]]) WORLD.lights.push({ p: [lx, 5.8, lz], r: 11, c: [1.2, 1.25, 1.35] });
    addSign(signTexture('LOADING  BAY 1-2', '#ffb52e', 'seg'), 144, 5.7, 124.4, Math.PI, 8, 1.4, [1.3, 1.3, 1.3], 0, true);
    B(144, 0.12, 133, 24, 0.24, 1.4, CONCR, 0, 16); solid(132, 156, 0, 0.24, 132.3, 133.7);
    for (const mx of [137, 144, 151]) { B(mx, 1.1, 133, 0.7, 1.8, 0.6, [0.2, 0.22, 0.25], 0, 8); B(mx, 1.5, 133.31, 0.4, 0.3, 0.02, NEON.lime, 1.4); WORLD.circles.push({ x: mx, z: 133, r: 0.35, h: 1.9 }); rot(mx, 4.2, 131.6, 0.18, 3.2, 0.18, DARK, 0, 4, 0.5, 0, 0); }
    const tanker = (x, z, dir) => {
      const g = C.getG(), paint = [0.7, 0.68, 0.62];
      B(x + dir * 6.3, 1.7, z, 2.4, 2.6, 2.5, [0.55, 0.08, 0.06], 0, 11); B(x + dir * 7.52, 2.2, z, 0.04, 0.9, 2.1, [0.05, 0.07, 0.08], 0.2, 0);
      B(x, 0.7, z, 14.5, 0.35, 1.2, DARK, 0, 4);
      g.cyl(M4.trs(M, x - dir * 1.2, 2.2, z, 0, 0, Math.PI / 2, 2.5, 10, 2.5), paint, 0, 11, 16);
      B(x - dir * 1.2, 2.2, z, 9.4, 0.3, 2.56, [0.8, 0.45, 0.05], 0.15, 0);
      for (const wx of [-5, -3.6, 1, 6]) for (const s of [-1, 1]) C.getG().cyl(M4.trs(M, x + dir * wx, 0.5, z + s * 1.1, Math.PI / 2, 0, 0, 1, 0.35, 1), [0.03, 0.03, 0.03], 0, 15, 12);
      solid(x - 7.6, x + 7.6, 0, 3.5, z - 1.3, z + 1.3);
    };
    tanker(143, 128, 1); tanker(145, 138, -1);
    // control room: squat, blast-proof, a few screens still on
    { const cx = 220.5, cz = 134; B(cx, 3, cz, 11, 6, 16, [0.2, 0.2, 0.21], 0, 16); B(cx, 6.2, cz, 11.4, 0.4, 16.4, DARK, 0, 4); solid(cx - 5.5, cx + 5.5, 0, 6, cz - 8, cz + 8);
      for (let i = 0; i < 5; i++) B(cx - 5.52, 3.4, cz - 6 + i * 3, 0.04, 1.0, 2.2, i === 2 ? [0.2, 0.5, 0.45] : [0.05, 0.07, 0.08], i === 2 ? 1.4 : 0.1);
      B(cx - 5.52, 1.3, cz + 7, 0.05, 2.5, 1.4, [0.03, 0.03, 0.035], 0, 4);
      addSign(signTexture('CONTROL', '#29e7ff', 'seg'), cx - 5.55, 5.1, cz, -Math.PI / 2, 5, 1.25, [1.3, 1.3, 1.3], 0, true);
      B(cx + 2, 9.5, cz - 4, 0.15, 7, 0.15, DARK, 0, 4); B(cx + 2, 13.1, cz - 4, 0.3, 0.3, 0.3, NEON.red, 4); WORLD.halos.push({ p: [cx + 2, 13.1, cz - 4], s: 1.3, c: [0.8, 0.05, 0.05] });
      WORLD.lights.push({ p: [cx - 7, 3, cz], r: 10, c: [0.4, 1.1, 1.0], shop: true }); }
    // the jetty: loading arms over the water, a manifold, bollards, and a tanker that will never sail
    for (const az of [88, 100]) {
      B(224.6, 1.8, az, 1.1, 3.6, 1.1, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: 224.6, z: az, r: 0.6, h: 3.6 });
      rot(226.2, 6.2, az, 0.5, 0.5, 6.4, [0.3, 0.2, 0.03], 0, 4, 0, Math.PI / 2, -0.95); rot(230.4, 7.4, az, 0.4, 0.4, 5.4, [0.3, 0.2, 0.03], 0, 4, 0, Math.PI / 2, 0.7);
      B(223.2, 4.4, az, 1.2, 1.2, 1.2, [0.2, 0.2, 0.2], 0, 4);
    }
    B(222, 0.45, 94, 1.2, 0.9, 20, [0.4, 0.2, 0.05], 0, 4); solid(221.4, 222.6, 0, 0.9, 84, 104);
    for (let bz = 70; bz <= 140; bz += 10) { B(227.2, 0.35, bz, 0.5, 0.7, 0.5, [0.12, 0.12, 0.13], 0, 4); WORLD.circles.push({ x: 227.2, z: bz, r: 0.3, h: 0.7 }); }
    { const hull = [0.1, 0.12, 0.14];
      B(237, 2.2, 108, 13, 9, 52, hull, 0, 8); B(237, -1.5, 108, 13.2, 1.6, 52.2, [0.3, 0.06, 0.05], 0, 4); B(237, 6.9, 108, 13.4, 0.4, 52.4, [0.2, 0.25, 0.22], 0, 4);
      rot(237, 2.6, 81.5, 9.2, 8.2, 9.2, hull, 0, 8, 0, Math.PI / 4, 0);
      B(237, 12.5, 129, 12, 11, 7, [0.6, 0.6, 0.58], 0, 8); for (let i = 0; i < 3; i++) B(237, 9.5 + i * 3, 125.45, 10, 0.7, 0.1, [0.9, 0.75, 0.5], i === 2 ? 1.6 : 0.3);
      B(237, 20, 131, 2.6, 5, 2.6, [0.1, 0.1, 0.12], 0, 4); B(237, 22.7, 131, 2.8, 0.5, 2.8, [0.8, 0.15, 0.1], 0.2, 4);
      for (const o of [-2.5, 0, 2.5]) C.getG().cyl(M4.trs(M, 237 + o, 7.6, 104, Math.PI / 2, 0, 0, 0.7, 40, 0.7), [0.35, 0.36, 0.33], 0, 4, 8);
      B(237, 14, 96, 0.3, 14, 0.3, DARK, 0, 4); B(237, 21.2, 96, 0.4, 0.4, 0.4, NEON.red, 4); WORLD.halos.push({ p: [237, 21.2, 96], s: 1.6, c: [0.8, 0.05, 0.05] });
      B(230.45, 5, 108, 0.1, 1.2, 12, [0.9, 0.9, 0.85], 0.1, 0);
      solid(230.5, 243.5, -3, 20, 80, 136); }
    // the fuel tanks that still bite (hazards.js blows them up and brings them back)
    const fuelTank = (x, z) => {
      const g = C.getG();
      g.cyl(M4.trs(M, x, 0.15, z, 0, 0, 0, 3.9, 0.3, 3.9), CONCR, 0, 16, 18);
      g.cyl(M4.trs(M, x, 0.95, z, 0, 0, 0, 2.9, 1.3, 2.9), [0.04, 0.035, 0.03], 0, 8, 14);   // the shell that's left when one goes: hidden inside the tank until then
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; B(x + Math.cos(a) * 1.72, 0.5, z + Math.sin(a) * 1.72, 0.22, 0.4, 0.22, YEL, 0.3, 4); }
      const c = { x, z, r: 1.6, h: 4.5 }; WORLD.circles.push(c); WORLD.tanks.push({ x, z, r: 1.6, h: 4.5, circle: c, alive: true, fuse: 0, cook: null, burnT: 0, deadWave: -99 });
    };
    for (const [x, z] of [[118, 104], [124.5, 106], [131, 104], [166, 127.5], [166, 135.5], [175, 105], [181.5, 105.5], [218, 78], [216, 104], [190, 139]]) fuelTank(x, z);
    // odds and ends
    burnBarrel(198, 73); burnBarrel(126, 142.5);
    container(186, 128, true, 2); container(186, 134.5, true, 1); crates(170, 140.5); crates(212.5, 70); dumpster(116, 70, 0);
    for (const [x, z] of [[186, 99.5], [150, 104], [196, 131]]) WORLD.steam.push([x, 0.1, z]);
    // the Docks gate
    for (const gx of [199.6, 212.4]) { B(gx, 4.5, 40.6, 0.5, 9, 0.5, [0.3, 0.2, 0.03], 0, 4); WORLD.circles.push({ x: gx, z: 40.6, r: 0.35, h: 9 }); }
    B(206, 9, 40.6, 13.4, 0.6, 0.6, [0.3, 0.2, 0.03], 0, 4); B(206, 10.3, 40.6, 9.4, 2.3, 0.4, [0.04, 0.04, 0.045], 0, 4);
    addSign(signTexture('REFINERY', '#ffb52e', 'seg'), 206, 10.3, 40.35, Math.PI, 9, 2.25, [1.4, 1.4, 1.4], 0, true);
    addSign(signTexture('PORT SEVEN', '#29e7ff', 'font'), 206, 10.3, 40.85, 0, 9, 2.25, [1.3, 1.3, 1.3], 0, true);
    WORLD.navBlocks.push({ x0: 227.4, x1: 260, z0: 80, z1: 160 });
    WORLD.supplies.push({ kind: 'terminal', x: 212.3, z: 124.6, ry: -Math.PI / 2, d: 'refinery' }, { kind: 'cache', x: 114.5, z: 128, d: 'refinery' }, { kind: 'cache', x: 222, z: 69.5, d: 'refinery' });
    // on the skyline: the flare stack, the far tank farm and two cooling towers breathing steam
    setG('far');
    { const g = C.getG(), fx = 172, fz = 158;
      g.cyl(M4.trs(M, fx, 23, fz, 0, 0, 0, 1.6, 46, 1.6), [0.4, 0.4, 0.4], 0, 4, 12); g.cyl(M4.trs(M, fx, 46.3, fz, 0, 0, 0, 2.2, 0.6, 2.2), [0.2, 0.2, 0.2], 0, 4, 12);
      for (let i = 0; i < 12; i++) B(fx, 3 + i * 3.6, fz - 0.7, 0.9, 0.1, 0.1, [0.9, 0.1, 0.08], 0.2, 0);
      for (const a of [0.5, 2.6, 4.7]) C.getG().box(M4.align(M, fx, 40, fz, fx + Math.cos(a) * 26, 0, fz + Math.sin(a) * 26, 0.05, 0.05), DARK, 0, 4);
      WORLD.flares.push([fx, 46.9, fz]); WORLD.halos.push({ p: [fx, 48.5, fz], s: 9, c: [1.1, 0.5, 0.12] }); WORLD.lights.push({ p: [fx, 44, fz], r: 40, c: [2.2, 1.0, 0.3] }); }
    for (const [x, z, rad, h] of [[122, 168, 9, 12], [150, 172, 11, 15], [196, 166, 8, 11], [218, 176, 10, 13]]) {
      C.getG().cyl(M4.trs(M, x, h / 2, z, 0, 0, 0, rad * 2, h, rad * 2), [0.3, 0.3, 0.28], 0, 8, 24);
      C.getG().lathe(pT(PM.a, x, h, z), [[rad, 0], [rad * 0.6, rad * 0.12], [0.01, rad * 0.18]], [0.24, 0.24, 0.22], 0, 8, 24, true, false);
      B(x, h + rad * 0.18 + 0.4, z, 0.5, 0.5, 0.5, NEON.red, 4); WORLD.halos.push({ p: [x, h + rad * 0.18 + 0.4, z], s: 2.4, c: [0.8, 0.05, 0.05] });
    }
    for (const [x, z] of [[128, 212], [204, 206]]) {
      C.getG().lathe(pT(PM.a, x, 0, z), [[18, 0], [15.5, 9], [12.6, 24], [11.8, 33], [12.4, 41], [13.2, 46]], [0.3, 0.3, 0.29], 0, 16, 36, false, false);
      C.getG().lathe(pT(PM.a, x, 0, z), [[12.9, 46], [12.1, 41], [11.5, 33], [12.3, 24], [15.2, 9], [17.7, 0]], [0.06, 0.06, 0.065], 0, 16, 36, false, false);   // the inside wall
      WORLD.plumes.push([x, 46, z, 11]);
    }
    setG('props');
  }
}
