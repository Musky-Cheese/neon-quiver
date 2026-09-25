/* ============================================================
   Street props, modelled in code with the Geo kit (rounded boxes, lathes, tubes, blobs).
   Every builder keeps the collision footprint it replaced, so navigation is unchanged.
   Material ids: 4 metal, 8 painted steel, 10 glass, 11 car paint, 12 bark, 13 wood,
                 14 foliage, 15 plastic, 16 concrete.
   ============================================================ */
const PM = { a: M4.create(), b: M4.create(), c: M4.create() };
// rigid transform: translate + rotate (ry yaw, rx pitch, rz roll)
const pT = (m, x, y, z, ry = 0, rx = 0, rz = 0) => M4.trs(m, x, y, z, rx, ry, rz, 1, 1, 1);
// parent * local rigid transform
const pChild = (parent, x, y, z, ry = 0, rx = 0, rz = 0) => M4.mul(PM.c, parent, pT(PM.b, x, y, z, ry, rx, rz));
const pPt = (parent, x, y, z) => M4.pt(parent, x, y, z, [0, 0, 0]);
const DARK = [0.1, 0.1, 0.12], STEEL = [0.2, 0.2, 0.22], CONC = [0.3, 0.29, 0.28];
// axis-aligned footprint of a local rectangle [x0,x1]x[z0,z1] turned by a quarter-turn yaw
function pFoot(x, z, ry, lx0, lx1, lz0, lz1, y1) {
  const c = Math.round(Math.cos(ry)), s = Math.round(Math.sin(ry)), xs = [], zs = [];
  for (const lx of [lx0, lx1]) for (const lz of [lz0, lz1]) { xs.push(x + lx * c + lz * s); zs.push(z - lx * s + lz * c); }
  WORLD.boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: 0, y1, z0: Math.min(...zs), z1: Math.max(...zs) });
}

/* ---------- crashed hover-car: sculpted body, glass cabin, hover pods, damage ---------- */
function propHoverCar(g, R, x, z, ry, paint, variant = 0) {
  const P = M4.trs(PM.a, x, 0, z, 0.06, ry, 0.08, 1, 1, 1), W = M4.create(); W.set(P);
  const part = (lx, ly, lz, sx, sy, sz, r, c, e, mat, lry = 0, lrx = 0, lrz = 0, taper = null, s = 2) => g.rbox(pChild(W, lx, ly, lz, lry, lrx, lrz), sx, sy, sz, r, c, e, mat, s, taper);
  const glass = [0.05, 0.08, 0.1], trim = [0.06, 0.06, 0.07];
  // hull: belly, flanks, sloped hood and deck
  part(0, 0.6, 0, 2.2, 0.56, 4.7, 0.24, paint, 0, 11);
  part(0, 0.93, -1.72, 2.08, 0.34, 1.45, 0.17, paint, 0, 11, 0, -0.1 - (variant === 1 ? 0.14 : 0), variant === 1 ? 0.07 : 0);
  part(0, 0.98, 1.82, 2.12, 0.4, 1.2, 0.18, paint, 0, 11, 0, 0.07);
  part(0, 0.36, 0, 1.9, 0.14, 4.3, 0.06, trim, 0, 15);                                       // undertray
  // cabin: tapered glass canopy, roof skin and pillars
  part(0, 1.27, 0.12, 1.82, 0.62, 2.35, 0.27, variant === 2 ? [0.02, 0.03, 0.035] : glass, 0, 10, 0, 0, 0, [0.8, 0.72]);
  part(0, 1.6, 0.2, 1.4, 0.07, 1.45, 0.035, paint, 0, 11);
  for (const sx of [-1, 1]) {
    part(sx * 0.8, 1.26, -0.95, 0.07, 0.6, 0.09, 0.03, paint, 0, 11, 0, 0.55, -sx * 0.13);
    part(sx * 0.78, 1.28, 0.35, 0.07, 0.58, 0.1, 0.03, paint, 0, 11, 0, 0, -sx * 0.1);
    // side light strip + skirt
    part(sx * 1.1, 0.46, 0.1, 0.05, 0.06, 3.8, 0.02, NEON.cyan, variant === 1 && sx > 0 ? 0.2 : 2.4, 0);
    part(sx * 1.06, 0.62, 0, 0.12, 0.2, 4.1, 0.08, trim, 0, 11);
    // headlights and the tail bar
    part(sx * 0.62, 0.86, -2.36, 0.52, 0.12, 0.12, 0.05, [1, 0.95, 0.85], variant === 1 && sx < 0 ? 0 : 3.2, 0);
  }
  part(0, 1.07, 2.43, 1.75, 0.07, 0.08, 0.03, NEON.red, 4, 0);
  // spoiler on two struts
  for (const sx of [-0.6, 0.6]) part(sx, 1.28, 2.2, 0.06, 0.26, 0.12, 0.02, trim, 0, 4, 0, 0.3);
  part(0, 1.42, 2.28, 1.95, 0.05, 0.36, 0.02, paint, 0, 11, 0, 0.1);
  // hover pods: turned housings with glowing emitters underneath (one dead on a wreck)
  let k = 0;
  for (const sx of [-0.98, 0.98]) for (const sz of [-1.55, 1.55]) {
    const dead = variant > 0 && k === variant + 1; k++;
    if (variant === 2 && k === 4) continue;   // this one was torn off (lies nearby)
    g.lathe(pChild(W, sx, 0.3, sz), [[0.24, -0.16, dead ? DARK : NEON.cyan, dead ? 0 : 2.8], [0.24, -0.16], [0.3, -0.14], [0.37, 0], [0.3, 0.13], [0.18, 0.18]], trim, 0, 4, 14, true, true);
  }
  // damage: a door hanging open, a crumpled panel
  if (variant === 1) part(1.35, 1.0, -0.35, 0.07, 0.58, 1.15, 0.03, paint, 0, 11, 0.95, 0, 0.12);
  if (variant === 2) g.lathe(pT(PM.b, x + Math.cos(ry) * 2.6, 0.15, z - Math.sin(ry) * 2.6, 0.4, 1.2, 0.3), [[0.24, -0.16, DARK, 0], [0.24, -0.16], [0.3, -0.14], [0.37, 0], [0.3, 0.13], [0.18, 0.18]], trim, 0, 4, 14, true, true);
  const s = Math.sin(ry), co = Math.cos(ry);
  WORLD.circles.push({ x: x + s * 1.3, z: z + co * 1.3, r: 1.3, h: 1.7 }, { x: x - s * 1.3, z: z - co * 1.3, r: 1.3, h: 1.7 });
}

/* ---------- bioluminescent tree: branching trunk in a concrete planter, glowing canopy ---------- */
function propTree(g, R, x, z, col) {
  const r = (a, b) => a + (b - a) * R();
  // planter with a lip, soil, and a thin light ring
  g.lathe(pT(PM.a, x, 0, z), [[1.36, 0], [1.4, 0.06], [1.37, 0.7], [1.47, 0.73], [1.47, 0.84], [1.3, 0.86], [1.27, 0.8]], CONC, 0, 16, 28, false, false);
  g.cyl(M4.trs(PM.a, x, 0.76, z, 0, 0, 0, 2.56, 0.04, 2.56), [0.035, 0.03, 0.025], 0, 16, 24);
  g.ring(M4.trs(PM.a, x, 0.42, z, 0, 0, 0, 1, 1, 1), col, 2.2, 0, 1.415, 0.018, 40, 4);
  const bark = [0.13, 0.1, 0.085], leaf = [col[0] * 0.22 + 0.03, col[1] * 0.22 + 0.06, col[2] * 0.22 + 0.04];
  // roots flaring over the soil
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r(0, 0.6); g.tube([[x, 1.1, z], [x + Math.cos(a) * 0.35, 0.86, z + Math.sin(a) * 0.35], [x + Math.cos(a) * 0.7, 0.78, z + Math.sin(a) * 0.7]], [0.12, 0.07, 0.02], bark, 0, 12, 5); }
  const tips = [];
  function grow(p, d, len, rad, depth) {
    const pts = [p], rr = [rad]; let q = p, dir = d.slice();
    for (let s = 1; s <= 3; s++) {
      dir = [dir[0] + r(-0.18, 0.18), dir[1] + 0.12 * (depth > 0 ? 1 : -0.3), dir[2] + r(-0.18, 0.18)]; const L = Math.hypot(...dir); dir = dir.map(v => v / L);
      q = [q[0] + dir[0] * len / 3, q[1] + dir[1] * len / 3, q[2] + dir[2] * len / 3]; pts.push(q); rr.push(rad * (1 - s * 0.12));
    }
    g.tube(pts, rr, bark, 0, 12, depth >= 2 ? 7 : 5, depth === 0);
    if (depth === 0) { tips.push(q); return; }
    const n = depth >= 2 ? 3 : 2, a0 = r(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r(-0.3, 0.3), spread = r(0.45, 0.8);
      const nd = [dir[0] * (1 - spread) + Math.cos(a) * spread, dir[1] * (1 - spread * 0.6) + 0.25, dir[2] * (1 - spread) + Math.sin(a) * spread];
      grow(q, nd, len * r(0.62, 0.78), rad * 0.62, depth - 1);
    }
    if (depth === 1) tips.push(q);
  }
  grow([x, 0.8, z], [r(-0.08, 0.08), 1, r(-0.08, 0.08)], 2.3, 0.2, 2);
  // canopy: lumpy leaf clusters with glowing speckles, plus a few hanging fruit
  for (const t of tips) {
    g.blob(pT(PM.a, t[0], t[1] + 0.15, t[2], r(0, TAU)), r(0.6, 0.85), r(0.45, 0.6), r(0.6, 0.85), 0.42, r(0, 99), leaf, 3.6, 14, 14, 10, 1);
    for (let i = 0; i < 2; i++) { const a = r(0, TAU); g.blob(pT(PM.a, t[0] + Math.cos(a) * 0.6, t[1] + r(-0.25, 0.3), t[2] + Math.sin(a) * 0.6, r(0, TAU)), r(0.32, 0.48), r(0.28, 0.4), r(0.32, 0.48), 0.45, r(0, 99), leaf, 3.6, 14, 10, 7, 1); }
  }
  for (let i = 0; i < 4; i++) { const t = tips[Math.floor(R() * tips.length)]; const fx = t[0] + r(-0.6, 0.6), fz = t[2] + r(-0.6, 0.6), fy = t[1] - r(0.5, 0.9);
    g.tube([[fx, t[1] - 0.1, fz], [fx, fy + 0.1, fz]], [0.008, 0.008], DARK, 0, 0, 3, false); g.sphere(M4.trs(PM.a, fx, fy, fz, 0, 0, 0, 0.16, 0.2, 0.16), col, 3.2, 0, 8, 6); }
  WORLD.halos.push({ p: [x, 4.2, z], s: 3.2, c: [col[0] * 0.25, col[1] * 0.25, col[2] * 0.25] });
  WORLD.circles.push({ x, z, r: 1.45, h: 0.86 }, { x, z, r: 0.3, h: 5 });
}

/* ---------- park bench: bent steel frame, wooden slats. face: '+z' '-z' '+x' '-x' (direction a sitter looks) ---------- */
function propBench(g, R, x, z, face, len = 1.9) {
  const ry = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[face];
  const P = pT(M4.create(), x, 0, z, ry), wood = [0.27 + R() * 0.05, 0.15, 0.08], frame = [0.07, 0.07, 0.08], h = len / 2;
  for (const sx of [-h + 0.14, h - 0.14]) {
    const path = [[sx, 0.02, 0.24], [sx, 0.42, 0.22], [sx, 0.44, 0.1], [sx, 0.45, -0.18], [sx, 0.55, -0.26], [sx, 0.92, -0.33]].map(p => pPt(P, ...p));
    g.tube(path, [0.028, 0.028, 0.028, 0.028, 0.028, 0.025], frame, 0, 4, 6, true);
    g.tube([[sx, 0.45, -0.18], [sx, 0.2, -0.22], [sx, 0.02, -0.26]].map(p => pPt(P, ...p)), [0.026, 0.026, 0.026], frame, 0, 4, 6, true);
    g.rbox(pChild(P, sx, 0.012, 0), 0.1, 0.024, 0.62, 0.01, frame, 0, 4, 1);
    // armrest
    g.tube([[sx, 0.45, 0.12], [sx, 0.66, 0.1], [sx, 0.68, -0.12], [sx, 0.6, -0.22]].map(p => pPt(P, ...p)), [0.022, 0.022, 0.022, 0.022], frame, 0, 4, 6, true);
  }
  for (let i = 0; i < 5; i++) g.rbox(pChild(P, 0, 0.475, 0.19 - i * 0.092), len, 0.04, 0.078, 0.014, wood, 0, 13, 1);
  for (let i = 0; i < 3; i++) g.rbox(pChild(P, 0, 0.62 + i * 0.11, -0.25 - i * 0.025, 0, -0.22), len, 0.04, 0.09, 0.014, wood, 0, 13, 1);
  pFoot(x, z, ry, -h, h, -0.2, 0.25, 0.52);          // seat: stand on it
  pFoot(x, z, ry, -h, h, -0.36, -0.2, 0.95);         // backrest: stops you walking off the back
}

/* ---------- litter bin ---------- */
function propBin(g, R, x, z, col = [0.08, 0.12, 0.1]) {
  g.lathe(pT(PM.a, x, 0, z), [[0.22, 0], [0.26, 0.05], [0.28, 0.8], [0.3, 0.82], [0.3, 0.86], [0.26, 0.86], [0.26, 0.86, [0.02, 0.02, 0.02]], [0, 0.84, [0.02, 0.02, 0.02]]], col, 0, 15, 16, false, false);
  g.ring(M4.trs(PM.a, x, 0.7, z, 0, 0, 0, 1, 1, 1), NEON.lime, 1.4, 0, 0.285, 0.008, 24, 3);
  WORLD.circles.push({ x, z, r: 0.3, h: 0.86 });
}

/* ---------- street lamp: turned post, collar, blade head with diffuser ---------- */
function propLamp(g, x, z) {
  g.lathe(pT(PM.a, x, 0, z), [[0.24, 0], [0.24, 0.12], [0.16, 0.2], [0.1, 0.55], [0.085, 5.8], [0.1, 5.85], [0.1, 6.0], [0.075, 6.05], [0.065, 6.95], [0.1, 7.0]], [0.09, 0.09, 0.11], 0, 4, 12, true, false);
  g.rbox(pT(PM.a, x, 7.05, z), 1.7, 0.18, 0.46, 0.08, [0.08, 0.08, 0.1], 0, 4, 2);
  g.rbox(pT(PM.a, x, 6.94, z), 1.46, 0.04, 0.32, 0.02, [0.8, 0.95, 1.0], 4, 0, 1);
  g.rbox(pT(PM.a, x, 7.16, z), 0.5, 0.06, 0.2, 0.03, NEON.cyan, 1.5, 0, 1);
  WORLD.circles.push({ x, z, r: 0.25, h: 7 });
  WORLD.lights.push({ p: [x, 6.4, z], r: 20, c: [1.2, 1.5, 2.0], kind: 'lamp' });
  WORLD.halos.push({ p: [x, 6.8, z], s: 2.6, c: [-1, 0, 0] });
}

/* ---------- jersey barrier: cast profile, reflector strips ---------- */
function propBarrier(g, x, z, rot) {
  const prof = [[-0.35, 0], [0.35, 0], [0.34, 0.07], [0.13, 0.3], [0.1, 0.98], [0.08, 1.0], [-0.08, 1.0], [-0.1, 0.98], [-0.13, 0.3], [-0.34, 0.07]];
  const m = pT(PM.a, x, 0, z, rot ? 0 : Math.PI / 2);
  g.extrude(m, prof, 3.16, CONC, 0, 16);
  for (const sx of [-1, 1]) g.rbox(pChild(pT(M4.create(), x, 0, z, rot ? 0 : Math.PI / 2), sx * 0.113, 0.74, 0, 0, sx * 0.03), 0.012, 0.1, 2.9, 0.004, NEON.amber, 1.8, 0, 1);
  const sx = rot ? 0.7 : 3.2, sz = rot ? 3.2 : 0.7;
  WORLD.boxes.push({ x0: x - sx / 2, x1: x + sx / 2, y0: 0, y1: 1.0, z0: z - sz / 2, z1: z + sz / 2 });
}

/* ---------- vending machine: glass front with lit product rows ---------- */
function propVend(g, R, x, z, fx, fz, c) {
  const P = pT(M4.create(), x, 0, z, Math.atan2(fx, fz)), body = [0.11, 0.11, 0.13];
  // shell with a recessed display window on the left and a control column on the right
  g.rbox(pChild(P, 0, 1.1, -0.08), 1.18, 2.2, 0.72, 0.05, body, 0, 4, 2);
  g.rbox(pChild(P, 0.41, 1.1, 0.36), 0.36, 2.2, 0.18, 0.03, body, 0, 4, 1);
  g.rbox(pChild(P, -0.56, 1.1, 0.36), 0.06, 2.2, 0.18, 0.02, body, 0, 4, 1);
  g.rbox(pChild(P, -0.15, 2.1, 0.36), 0.76, 0.2, 0.18, 0.02, body, 0, 4, 1);
  g.rbox(pChild(P, -0.15, 0.26, 0.36), 0.76, 0.52, 0.18, 0.02, body, 0, 4, 1);
  g.rbox(pChild(P, -0.15, 1.3, 0.29), 0.76, 1.5, 0.02, 0.005, [0.5, 0.5, 0.55], 0.5, 15, 1);   // lit back wall
  for (let row = 0; row < 5; row++) {
    g.rbox(pChild(P, -0.15, 0.6 + row * 0.28, 0.36), 0.76, 0.02, 0.14, 0.006, [0.3, 0.3, 0.32], 0.3, 4, 1);   // shelf
    for (let i = 0; i < 5; i++) { const pc = [0.3 + R() * 0.7, 0.2 + R() * 0.6, 0.2 + R() * 0.7]; g.rbox(pChild(P, -0.45 + i * 0.15, 0.7 + row * 0.28, 0.36), 0.1, 0.17, 0.08, 0.01, pc, 0.4 + R() * 0.6, 15, 1); }
  }
  for (const [fx0, fy0, fw, fh] of [[-0.15, 2.02, 0.8, 0.04], [-0.15, 0.54, 0.8, 0.04], [-0.54, 1.28, 0.03, 1.5], [0.24, 1.28, 0.03, 1.5]]) g.rbox(pChild(P, fx0, fy0, 0.45), fw, fh, 0.03, 0.01, [0.2, 0.2, 0.22], 0, 4, 1);
  g.rbox(pChild(P, 0.41, 1.45, 0.455), 0.24, 0.46, 0.02, 0.01, c, 1.8, 0, 1);                       // lit panel
  for (let i = 0; i < 4; i++) g.rbox(pChild(P, 0.41, 1.08 - i * 0.07, 0.455), 0.14, 0.04, 0.02, 0.008, [0.9, 0.9, 0.9], i === 0 ? 2.4 : 0.6, 0, 1);
  g.rbox(pChild(P, -0.15, 0.3, 0.455), 0.6, 0.18, 0.02, 0.02, [0.01, 0.01, 0.01], 0, 4, 1);         // pickup slot
  for (const sx of [-0.59, 0.59]) g.rbox(pChild(P, sx, 1.1, 0.3), 0.02, 2.1, 0.03, 0.008, c, 2.4, 0, 1);
  WORLD.boxes.push({ x0: x - 0.6, x1: x + 0.6, y0: 0, y1: 2.2, z0: z - 0.6, z1: z + 0.6 });
}

/* ---------- district props ---------- */
function propDumpster(g, R, x, z, ry, solid) {
  const c = R() < 0.5 ? [0.06, 0.14, 0.09] : [0.07, 0.09, 0.16], P = pT(M4.create(), x, 0, z, ry);
  g.rbox(pChild(P, 0, 0.72, 0), 1.9, 1.16, 1.12, 0.07, c, 0, 8, 2, [1.06, 1.1]);
  g.rbox(pChild(P, 0, 1.36, -0.05, 0, -0.18), 2.04, 0.06, 1.26, 0.025, [0.04, 0.04, 0.05], 0, 15, 1);
  for (const sx of [-1.02, 1.02]) g.rbox(pChild(P, sx, 0.95, 0), 0.08, 0.1, 0.9, 0.02, [0.05, 0.05, 0.05], 0, 4, 1);
  for (const sx of [-0.8, 0.8]) for (const sz of [-0.42, 0.42]) g.lathe(pChild(P, sx, 0.07, sz, 0, 0, Math.PI / 2), [[0.08, -0.03], [0.08, 0.03]], [0.02, 0.02, 0.02], 0, 15, 10, true, true);
  const hx = Math.abs(Math.cos(ry)) > 0.5 ? 1.0 : 0.62, hz = Math.abs(Math.cos(ry)) > 0.5 ? 0.62 : 1.0;
  solid(x - hx, x + hx, 0, 1.3, z - hz, z + hz);
  for (let i = 0; i < 4; i++) g.blob(pT(PM.a, x + (R() - 0.5) * 2.8, 0.26, z + (R() - 0.5) * 2.8, R() * 6), 0.34 + R() * 0.12, 0.28, 0.32, 0.18, R() * 99, [0.025, 0.025, 0.03], 0, 15, 10, 6);
}
function propCrate(g, x, y, z, s, ry) {
  const P = pT(M4.create(), x, y, z, ry), wood = [0.24, 0.16, 0.08], edge = [0.17, 0.11, 0.06], t = 0.07, h = s / 2 - t / 2;
  g.rbox(P, s - 0.04, s - 0.04, s - 0.04, 0.02, wood, 0, 13, 1);
  for (const a of [-h, h]) for (const b of [-h, h]) {
    g.rbox(pChild(P, 0, a, b), s, t, t, 0.012, edge, 0, 13, 1);
    g.rbox(pChild(P, a, 0, b), t, s, t, 0.012, edge, 0, 13, 1);
    g.rbox(pChild(P, a, b, 0), t, t, s, 0.012, edge, 0, 13, 1);
  }
}
function propCrates(g, R, x, z, solid) {
  for (let i = 0; i < 3; i++) { const s = 0.8 + R() * 0.3; propCrate(g, x + (i % 2) * 1.0, s / 2 + (i === 2 ? 1.0 : 0), z + (i === 1 ? 0.2 : 0), s, (R() - 0.5) * 0.4); }
  solid(x - 0.55, x + 1.55, 0, 1.2, z - 0.55, z + 0.75);
}
function propBurnBarrel(g, x, z) {
  const rust = [0.16, 0.08, 0.045];
  g.lathe(pT(PM.a, x, 0, z), [[0.3, 0], [0.33, 0.03], [0.33, 0.28], [0.345, 0.3], [0.33, 0.32], [0.33, 0.66], [0.345, 0.68], [0.33, 0.7], [0.33, 0.97], [0.35, 1.0], [0.31, 1.0], [0.31, 1.0, [0.02, 0.01, 0.005]], [0.0, 0.92, [0.3, 0.1, 0.02], 1.5]], rust, 0, 8, 20, false, false);
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; g.rbox(pT(PM.a, x + Math.cos(a) * 0.335, 0.16 + (i % 2) * 0.06, z + Math.sin(a) * 0.335, -a), 0.02, 0.05, 0.05, 0.01, [1.0, 0.45, 0.1], 3.2, 0, 1); }
  WORLD.circles.push({ x, z, r: 0.45, h: 1.0 });
  WORLD.fires.push({ x, y: 1.0, z }); WORLD.halos.push({ p: [x, 1.5, z], s: 2.4, c: [0.9, 0.4, 0.08] });
}
// market food cart with a round table and stools around it
function propFoodCart(g, R, x, z, awningCol, solid) {
  const P = pT(M4.create(), x, 0, z);
  g.rbox(pChild(P, 0, 0.72, 0), 2.2, 0.96, 1.2, 0.08, [0.22, 0.22, 0.24], 0, 4, 2);
  g.rbox(pChild(P, 0, 1.24, 0), 2.32, 0.08, 1.32, 0.035, [0.14, 0.14, 0.15], 0, 4, 1);
  g.rbox(pChild(P, 0, 0.8, 0.61), 1.6, 0.42, 0.02, 0.01, awningCol, 1.4, 0, 1);                        // lit menu board
  for (const sx of [-0.8, 0.8]) g.lathe(pChild(P, sx, 0.2, -0.62, 0, 0, Math.PI / 2), [[0.2, -0.05], [0.2, 0.05]], [0.03, 0.03, 0.03], 0, 15, 14, true, true);
  g.lathe(pChild(P, 0.6, 1.28, -0.3), [[0.2, 0], [0.22, 0.02], [0.22, 0.22], [0.2, 0.24]], [0.3, 0.3, 0.32], 0, 4, 14, true, false);   // stock pot
  g.cyl(M4.trs(PM.a, x, 1.9, z, 0, 0, 0, 0.06, 1.3, 0.06), [0.1, 0.1, 0.1], 0, 4, 6);
  g.lathe(pT(PM.a, x, 2.45, z), [[1.5, 0], [1.48, 0.04], [0.02, 0.5]], awningCol, 0.3, 15, 16, false, false);
  g.lathe(pT(PM.a, x, 2.44, z), [[0.02, 0.49], [1.47, 0.03]], [awningCol[0] * 0.5, awningCol[1] * 0.5, awningCol[2] * 0.5], 0.5, 15, 16, false, false);   // underside
  solid(x - 1.15, x + 1.15, 0, 1.3, z - 0.65, z + 0.65); WORLD.steam.push([x + 0.6, 1.4, z]);
  WORLD.lights.push({ p: [x, 2.2, z], r: 8, c: [1.8, 0.9, 0.4], shop: true });
  for (let k = 0; k < 2; k++) {
    const tx = x + (R() - 0.5) * 8, tz = z + (k ? 4.5 : -4.5);
    g.lathe(pT(PM.a, tx, 0, tz), [[0.3, 0], [0.3, 0.03], [0.06, 0.06], [0.05, 0.72], [0.55, 0.74], [0.55, 0.78], [0.5, 0.8]], [0.1, 0.1, 0.11], 0, 4, 16, true, false);
    g.cyl(M4.trs(PM.a, tx, 0.795, tz, 0, 0, 0, 1.12, 0.03, 1.12), [0.3, 0.2, 0.11], 0, 13, 20);
    WORLD.circles.push({ x: tx, z: tz, r: 0.55, h: 0.8 });
    for (let s = 0; s < 3; s++) {
      const a = s / 3 * TAU + R(), sx = tx + Math.cos(a) * 0.95, sz = tz + Math.sin(a) * 0.95;
      g.lathe(pT(PM.a, sx, 0, sz), [[0.16, 0], [0.16, 0.02], [0.03, 0.04], [0.03, 0.43], [0.19, 0.44], [0.19, 0.48], [0.17, 0.49]], [0.1, 0.1, 0.11], 0, 4, 12, true, false);
      g.cyl(M4.trs(PM.a, sx, 0.49, sz, 0, 0, 0, 0.36, 0.03, 0.36), [0.35, 0.08, 0.06], 0, 15, 12);
      WORLD.circles.push({ x: sx, z: sz, r: 0.19, h: 0.5 });
    }
  }
}

/* ============================================================
   Sakura Gardens pieces
   ============================================================ */
// cherry blossom: short gnarled trunk, limbs spreading low and wide, a broad umbrella of pink clusters.
// planter: sit it in a concrete planter (plaza) or straight in the lawn (garden). Returns canopy centre.
function propSakura(g, R, x, z, s = 1, planter = false, ringCol = null) {
  const r = (a, b) => a + (b - a) * R();
  const base = planter ? 0.8 : 0.02;
  if (planter) {
    g.lathe(pT(PM.a, x, 0, z), [[1.36, 0], [1.4, 0.06], [1.37, 0.7], [1.47, 0.73], [1.47, 0.84], [1.3, 0.86], [1.27, 0.8]], CONC, 0, 16, 28, false, false);
    g.cyl(M4.trs(PM.a, x, 0.76, z, 0, 0, 0, 2.56, 0.04, 2.56), [0.06, 0.03, 0.035], 0, 16, 24);
    if (ringCol) g.ring(M4.trs(PM.a, x, 0.42, z, 0, 0, 0, 1, 1, 1), ringCol, 2.2, 0, 1.415, 0.018, 40, 4);
  } else {
    g.blob(pT(PM.a, x, 0.0, z, r(0, TAU)), 1.1 * s, 0.14, 1.1 * s, 0.3, r(0, 99), [0.05, 0.08, 0.03], 0, 17, 12, 5);   // moss mound
  }
  const bark = [0.075, 0.05, 0.05], tips = [];
  const blossom = [0.95, 0.5 + r(-0.06, 0.06), 0.68 + r(-0.06, 0.06)];
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r(0, 0.6); g.tube([[x, base + 0.35 * s, z], [x + Math.cos(a) * 0.4 * s, base + 0.06, z + Math.sin(a) * 0.4 * s], [x + Math.cos(a) * 0.8 * s, base - 0.02, z + Math.sin(a) * 0.8 * s]], [0.16 * s, 0.08 * s, 0.03 * s], bark, 0, 12, 5); }
  function grow(p, d, len, rad, depth) {
    const pts = [p], rr = [rad]; let q = p, dir = d.slice();
    for (let k = 1; k <= 4; k++) {   // kinked, slightly drooping limbs
      dir = [dir[0] + r(-0.3, 0.3), dir[1] + (depth >= 2 ? 0.05 : -0.06) + r(-0.12, 0.12), dir[2] + r(-0.3, 0.3)]; const L = Math.hypot(...dir); dir = dir.map(v => v / L);
      q = [q[0] + dir[0] * len / 4, q[1] + dir[1] * len / 4, q[2] + dir[2] * len / 4]; pts.push(q); rr.push(rad * (1 - k * 0.1));
    }
    g.tube(pts, rr, bark, 0, 12, depth >= 2 ? 8 : depth === 1 ? 6 : 4, depth === 0);
    if (depth === 0) { tips.push(q); return; }
    const n = depth === 2 ? 4 : 2 + (R() < 0.5 ? 1 : 0), a0 = r(0, TAU);
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU + r(-0.35, 0.35), spread = depth === 2 ? r(0.7, 0.95) : r(0.45, 0.8);
      const nd = [dir[0] * (1 - spread) + Math.cos(a) * spread, dir[1] * (1 - spread) * 0.6 + (depth === 2 ? 0.28 : 0.12), dir[2] * (1 - spread) + Math.sin(a) * spread];
      grow(q, nd, len * r(0.65, 0.85), rad * 0.6, depth - 1);
    }
    if (depth === 1) tips.push(q);
  }
  grow([x, base, z], [r(-0.12, 0.12), 1, r(-0.12, 0.12)], 1.7 * s, 0.26 * s, 2);
  // blossom: a big soft cluster at every tip plus smaller puffs around it, glowing faintly pink
  let cx = 0, cy = 0, cz = 0;
  for (const t of tips) {
    cx += t[0]; cy += t[1]; cz += t[2];
    g.blob(pT(PM.a, t[0], t[1] + 0.2, t[2], r(0, TAU)), r(0.75, 1.0) * s, r(0.5, 0.62) * s, r(0.75, 1.0) * s, 0.4, r(0, 99), blossom, 1.8, 14, 10, 7, 1);
    for (let i = 0; i < 1; i++) { const a = r(0, TAU), d = r(0.5, 0.8) * s; g.blob(pT(PM.a, t[0] + Math.cos(a) * d, t[1] + r(-0.3, 0.2), t[2] + Math.sin(a) * d, r(0, TAU)), r(0.35, 0.5) * s, r(0.28, 0.4) * s, r(0.35, 0.5) * s, 0.45, r(0, 99), blossom, 1.8, 14, 9, 6, 1); }
  }
  cx /= tips.length; cy /= tips.length; cz /= tips.length;
  WORLD.halos.push({ p: [cx, cy + 0.4, cz], s: 4.2 * s, c: [0.22, 0.07, 0.12] });
  WORLD.petals.push([cx, cy, cz, 2.6 * s]);
  WORLD.circles.push({ x, z, r: 0.34 * s, h: 5 });
  if (planter) WORLD.circles.push({ x, z, r: 1.45, h: 0.86 });
}
// stone lantern (toro): turned pedestal, glowing fire box, pyramid roof
function propToro(g, x, z, lit = true) {
  const st = [0.24, 0.24, 0.23];
  g.lathe(pT(PM.a, x, 0, z), [[0.36, 0], [0.36, 0.12], [0.14, 0.2], [0.11, 0.78], [0.3, 0.84], [0.3, 0.94]], st, 0, 16, 10, true, false);
  g.rbox(pT(PM.a, x, 1.12, z), 0.44, 0.36, 0.44, 0.03, st, 0, 16, 1);
  for (const [dx, dz] of [[0, 0.225], [0, -0.225], [0.225, 0], [-0.225, 0]]) g.rbox(pT(PM.a, x + dx, 1.12, z + dz, dx ? Math.PI / 2 : 0), 0.24, 0.22, 0.012, 0.004, [1, 0.72, 0.38], lit ? 2.6 : 0, 0, 1);
  g.lathe(pT(PM.a, x, 0, z, Math.PI / 4), [[0.5, 1.3], [0.5, 1.33], [0.12, 1.55], [0, 1.6]], st, 0, 16, 4, false, false);
  g.sphere(M4.trs(PM.a, x, 1.66, z, 0, 0, 0, 0.12, 0.14, 0.12), st, 0, 16, 8, 6);
  WORLD.circles.push({ x, z, r: 0.36, h: 1.6 });
  if (lit) { WORLD.lights.push({ p: [x, 1.2, z], r: 7, c: [1.5, 0.95, 0.5], shop: true }); WORLD.halos.push({ p: [x, 1.12, z], s: 1.4, c: [0.5, 0.32, 0.15] }); }
}
// torii gate across the avenue: two red pillars, black-capped curved top beam, tie beam, name plaque
function propTorii(g, x, z, span = 8.4) {
  const red = [0.5, 0.05, 0.035], blk = [0.03, 0.03, 0.035], h = span / 2;
  for (const sx of [-h, h]) {
    g.lathe(pT(PM.a, x + sx, 0, z), [[0.42, 0, blk], [0.42, 0.55, blk], [0.42, 0.55], [0.3, 0.6], [0.26, 6.0]], red, 0, 11, 16, false, false);
    WORLD.circles.push({ x: x + sx, z, r: 0.42, h: 6.5 });
  }
  g.rbox(pT(PM.a, x, 5.15, z), span + 1.6, 0.34, 0.34, 0.05, red, 0, 11, 1);                                  // nuki
  g.rbox(pT(PM.a, x, 6.05, z), span + 1.2, 0.36, 0.46, 0.05, red, 0, 11, 1);                                   // shimaki
  for (const sx of [-1, 1]) g.rbox(pT(PM.a, x + sx * (h + 1.1), 6.42, z, 0, 0, -sx * 0.12), 2.6, 0.32, 0.7, 0.06, blk, 0, 11, 1);   // upswept ends
  g.rbox(pT(PM.a, x, 6.36, z), span - 0.6, 0.3, 0.7, 0.06, blk, 0, 11, 1);                                      // kasagi
  g.rbox(pT(PM.a, x, 5.6, z), 0.9, 0.9, 0.16, 0.04, blk, 0, 11, 1);                                             // plaque
  g.rbox(pT(PM.a, x, 5.6, z), 0.76, 0.76, 0.18, 0.02, [1, 0.55, 0.72], 1.4, 0, 1);
}
// small shrine on a raised deck: two steps, vermilion posts, sweeping roof, hanging lanterns
function propShrine(g, x, z, solid) {
  const red = [0.5, 0.05, 0.035], wood = [0.2, 0.12, 0.07], roof = [0.07, 0.08, 0.08];
  g.rbox(pT(PM.a, x, 0.3, z), 8, 0.6, 6, 0.04, wood, 0, 13, 1); solid(x - 4, x + 4, 0, 0.6, z - 3, z + 3);
  g.rbox(pT(PM.a, x, 0.15, z - 3.4), 4, 0.3, 0.8, 0.03, [0.26, 0.25, 0.24], 0, 16, 1); solid(x - 2, x + 2, 0, 0.3, z - 3.8, z - 3);
  for (const sx of [-3.5, 3.5]) for (const sz of [-2.5, 2.5]) { g.lathe(pT(PM.a, x + sx, 0.6, z + sz), [[0.2, 0], [0.18, 3.3]], red, 0, 11, 12, false, false); WORLD.circles.push({ x: x + sx, z: z + sz, r: 0.22, h: 4 }); }
  g.rbox(pT(PM.a, x, 2.6, z + 2.4), 7, 2.0, 0.2, 0.03, [0.12, 0.07, 0.05], 0, 13, 1);                           // back wall
  g.rbox(pT(PM.a, x, 1.4, z + 2.25), 2.2, 1.2, 0.06, 0.02, [1, 0.62, 0.4], 0.9, 0, 1);                          // glowing screen
  solid(x - 3.5, x + 3.5, 0.6, 3.6, z + 2.3, z + 2.5);
  g.rbox(pT(PM.a, x, 3.9, z), 8.6, 0.2, 6.6, 0.05, red, 0, 11, 1);
  g.extrude(pT(PM.a, x, 4.0, z, Math.PI / 2), [[-4.3, 0], [4.3, 0], [4.6, 0.25], [2.5, 1.1], [0.35, 1.9], [-0.35, 1.9], [-2.5, 1.1], [-4.6, 0.25]], 10.2, roof, 0, 8);
  g.rbox(pT(PM.a, x, 5.95, z), 10.6, 0.22, 0.5, 0.06, roof, 0, 8, 1);                                          // ridge
  for (const sx of [-2.8, -0.9, 0.9, 2.8]) {
    g.tube([[x + sx, 3.8, z - 3.2], [x + sx, 3.3, z - 3.2]], [0.01, 0.01], [0.03, 0.03, 0.03], 0, 0, 3, false);
    g.lathe(pT(PM.a, x + sx, 2.75, z - 3.2), [[0.08, 0], [0.24, 0.12], [0.26, 0.3], [0.24, 0.48], [0.08, 0.58]], [1, 0.3, 0.18], 2.6, 15, 12, true, true);
    WORLD.halos.push({ p: [x + sx, 3.05, z - 3.2], s: 1.5, c: [0.6, 0.12, 0.06] });
  }
  WORLD.lights.push({ p: [x, 2.8, z - 4], r: 10, c: [1.8, 0.6, 0.35], shop: true });
}
// irregular pond at water level with a muddy rim and bank stones. Returns the rim points.
function propPond(g, R, cx, cz, rx, rz) {
  const N = 40, pts = [];
  for (let i = 0; i < N; i++) { const a = i / N * TAU, k = 1 + 0.12 * Math.sin(a * 3 + 1.3) + 0.07 * Math.sin(a * 5 + 0.4); pts.push([cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k]); }
  const fan = (scale, y, c, mat) => { const i0 = g.i.length, c0 = g._vert(null, cx, y, cz, 0, 1, 0, c, 0, mat), r0 = g.n;
    for (const [px, pz] of pts) g._vert(null, cx + (px - cx) * scale, y, cz + (pz - cz) * scale, 0, 1, 0, c, 0, mat);
    for (let i = 0; i < N; i++) g.i.push(c0, r0 + (i + 1) % N, r0 + i); g._fixWinding(i0); };
  fan(1.1, 0.014, [0.03, 0.03, 0.025], 16);          // wet mud band
  fan(1.0, 0.02, [0.02, 0.04, 0.045], 18);            // water
  for (let i = 0; i < N; i += 1) { if (R() < 0.35) continue; const [px, pz] = pts[i], s = 0.25 + R() * 0.35;
    g.blob(pT(PM.a, cx + (px - cx) * 1.05, 0.05, cz + (pz - cz) * 1.05, R() * 6), s * 1.2, s * 0.55, s, 0.3, R() * 99, [0.2, 0.2, 0.19], 0, 16, 9, 6); }
  WORLD.ponds.push({ x: cx, z: cz, rx: rx * 0.95, rz: rz * 0.95 });
  return pts;
}
function propSteppingStone(g, R, x, z) {
  g.blob(pT(PM.a, x, 0.08, z, R() * 6), 0.5, 0.16, 0.44, 0.15, R() * 99, [0.22, 0.22, 0.21], 0, 16, 10, 6);
  WORLD.circles.push({ x, z, r: 0.42, h: 0.2 });
}
// flat stone path along a polyline (flagstones with gaps)
function propPath(g, R, pts, w, y = 0.018) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.1));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t, ry = Math.atan2(bx - ax, bz - az);
      const sh = 0.85 + R() * 0.2, c = 0.19 + R() * 0.05;
      g.rbox(pT(PM.a, px + (R() - 0.5) * 0.08, y, pz + (R() - 0.5) * 0.08, ry + (R() - 0.5) * 0.12), w * sh, 0.04, L / n * 0.9, 0.012, [c, c, c * 0.95], 0, 16, 1);
    }
  }
}
function inPond(x, z) { for (const p of WORLD.ponds) { const dx = (x - p.x) / p.rx, dz = (z - p.z) / p.rz; if (dx * dx + dz * dz < 1) return true; } return false; }
// background cherry tree for the forest round the grove: same silhouette, far fewer triangles, no collision
function propSakuraFar(g, R, x, z, s = 1, detail = 1) {
  const r = (a, b) => a + (b - a) * R(), bark = [0.075, 0.05, 0.05];
  const blossom = [0.95, 0.5 + r(-0.06, 0.06), 0.68 + r(-0.06, 0.06)];
  const h = r(1.4, 1.9) * s, sides = detail >= 2 ? 6 : 4;
  g.tube([[x, 0, z], [x + r(-0.2, 0.2), h * 0.6, z + r(-0.2, 0.2)], [x + r(-0.3, 0.3), h, z + r(-0.3, 0.3)]], [0.24 * s, 0.2 * s, 0.16 * s], bark, 0, 12, sides, false);
  const n = detail >= 2 ? 5 : detail === 1 ? 3 : 2, a0 = r(0, TAU), seg = detail >= 2 ? 10 : detail === 1 ? 7 : 6, rings = detail >= 2 ? 7 : detail === 1 ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const a = a0 + i / n * TAU + r(-0.3, 0.3), d = r(1.2, 2.0) * s, tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d, ty = h + r(0.6, 1.3) * s;
    g.tube([[x, h * 0.9, z], [tx, ty, tz]], [0.12 * s, 0.05 * s], bark, 0, 12, 4, false);
    g.blob(pT(PM.a, tx, ty + 0.3 * s, tz, r(0, TAU)), r(1.1, 1.5) * s, r(0.75, 1.0) * s, r(1.1, 1.5) * s, 0.35, r(0, 99), blossom, 1.6, 14, seg, rings, 1);
  }
  g.blob(pT(PM.a, x, h + 1.4 * s, z, r(0, TAU)), 1.5 * s, 0.9 * s, 1.5 * s, 0.3, r(0, 99), blossom, 1.6, 14, seg, rings, 1);
  if (detail >= 2 && R() < 0.5) WORLD.petals.push([x, h + 1.2 * s, z, 2.2 * s]);
}
