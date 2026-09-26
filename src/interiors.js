/* ============================================================
   Walk-in shop interiors. Every ground-floor shop in the plaza ring is a real room:
   one shell (floor, walls, ceiling, glass shopfront) plus a kit of furniture and goods,
   laid out per shop type so what is inside matches the sign outside.
   Local frame: a runs along the facade (door at a = 0), dd runs into the room (0 = shopfront, D = back wall).
   ============================================================ */
const SHOP_DEFS = {
  ramen:    { sign: 'RAMEN', st: 'font', wall: [0.3, 0.16, 0.1], floor: [0.14, 0.1, 0.08], glow: [1, 0.55, 0.25], fmat: 13, wmat: 16, ceil: [0.06, 0.06, 0.07] },
  clinic:   { sign: 'CLONE CLINIC', st: 'font', wall: [0.55, 0.6, 0.62], floor: [0.3, 0.33, 0.34], glow: [0.4, 1, 0.95], fmat: 21, wmat: 20, ceil: [0.55, 0.57, 0.58] },
  pawn:     { sign: 'PAWN + CHIPS', st: 'panel', wall: [0.2, 0.17, 0.2], floor: [0.12, 0.11, 0.1], glow: [1, 0.75, 0.3], fmat: 16, wmat: 16, ceil: [0.06, 0.06, 0.07] },
  conbini:  { sign: 'OPEN 25H', st: 'seg', wall: [0.6, 0.61, 0.58], floor: [0.46, 0.47, 0.46], glow: [0.85, 0.95, 1], fmat: 21, wmat: 20, ceil: [0.55, 0.56, 0.57] },
  bar:      { sign: 'SYNTH BAR', st: 'font', wall: [0.09, 0.05, 0.07], floor: [0.13, 0.075, 0.05], glow: [1, 0.25, 0.65], fmat: 13, wmat: 13, ceil: [0.04, 0.03, 0.03] },
  lucky:    { sign: 'LUCKY 88', st: 'seg', wall: [0.2, 0.035, 0.03], floor: [0.12, 0.05, 0.04], glow: [1, 0.4, 0.15], fmat: 15, wmat: 20, ceil: [0.08, 0.02, 0.02] },
  cafe:     { sign: 'DATA CAFE', st: 'panel', wall: [0.34, 0.25, 0.18], floor: [0.22, 0.14, 0.08], glow: [1, 0.72, 0.42], fmat: 13, wmat: 20, ceil: [0.3, 0.25, 0.2] },
  volt:     { sign: 'VOLT', st: 'seg', wall: [0.13, 0.14, 0.17], floor: [0.24, 0.25, 0.27], glow: [0.35, 0.85, 1], fmat: 21, wmat: 20, ceil: [0.45, 0.46, 0.5] },
  memory:   { sign: 'MEMORY SHOP', st: 'panel', wall: [0.07, 0.07, 0.11], floor: [0.1, 0.1, 0.13], glow: [0.75, 0.4, 1], fmat: 15, wmat: 8, ceil: [0.05, 0.05, 0.07] },
  hotel:    { sign: 'HOTEL ORBIT', st: 'panel', wall: [0.42, 0.35, 0.26], floor: [0.9, 0.86, 0.8], glow: [1, 0.8, 0.5], fmat: 10, wmat: 20, ceil: [0.62, 0.58, 0.52] },
  karaoke:  { sign: 'KARAOKE', st: 'font', wall: [0.14, 0.05, 0.18], floor: [0.08, 0.05, 0.1], glow: [0.85, 0.3, 1], fmat: 15, wmat: 20, ceil: [0.05, 0.03, 0.06] },
  cyberdoc: { sign: 'CYBERDOC', st: 'seg', wall: [0.44, 0.48, 0.5], floor: [0.27, 0.29, 0.3], glow: [0.5, 1, 0.75], fmat: 21, wmat: 20, ceil: [0.5, 0.53, 0.55] },
  diner:    { sign: 'KAIJU NOODLE', st: 'font', wall: [0.5, 0.12, 0.1], floor: [0.4, 0.39, 0.36], glow: [1, 0.85, 0.6], fmat: 22, wmat: 20, ceil: [0.55, 0.55, 0.53] },
  grocer:   { sign: 'FRESH MARKET', st: 'font', wall: [0.45, 0.43, 0.38], floor: [0.35, 0.34, 0.32], glow: [0.6, 1, 0.4], fmat: 21, wmat: 20, ceil: [0.4, 0.4, 0.38] },
  herbal:   { sign: 'HERBALIST', st: 'font', wall: [0.28, 0.18, 0.1], floor: [0.16, 0.1, 0.06], glow: [1, 0.6, 0.2], fmat: 13, wmat: 13, ceil: [0.08, 0.05, 0.03] },
  hardware: { sign: 'HARDWARE', st: 'panel', wall: [0.5, 0.5, 0.48], floor: [0.3, 0.3, 0.29], glow: [1, 0.85, 0.4], fmat: 16, wmat: 20, ceil: [0.4, 0.4, 0.4] },
  kiosk:    { sign: '', st: 'panel', wall: [0.55, 0.55, 0.53], floor: [0.4, 0.4, 0.4], glow: [0.4, 1, 0.7], fmat: 21, wmat: 20, ceil: [0.5, 0.5, 0.5] },
  tattoo:   { sign: 'INK + STEEL', st: 'font', wall: [0.09, 0.08, 0.08], floor: [0.13, 0.1, 0.09], glow: [1, 0.3, 0.2], fmat: 13, wmat: 13, ceil: [0.04, 0.04, 0.04] },
};
const SHOP_ORDER = ['ramen', 'conbini', 'bar', 'pawn', 'cafe', 'hotel', 'clinic', 'volt', 'karaoke', 'cyberdoc', 'diner', 'memory', 'tattoo', 'lucky'];
const MARKET_ORDER = ['grocer', 'diner', 'herbal', 'bar', 'ramen', 'lucky', 'cafe', 'karaoke', 'conbini', 'tattoo', 'grocer', 'herbal'];

/* a stand-alone walk-in room (for buildings outside the plaza ring): facade point fx,fz, th = rotation of the room frame */
function makeRoom(g, gCast, fx, fz, th, W, D, RH, type, seed, solidFn) {
  const ca = Math.cos(th), sa = Math.sin(th), ax = Math.abs(ca) > 0.5, Mm = M4.create();
  const wp = (a, dd) => [fx + a * ca + dd * sa, fz - a * sa + dd * ca];
  const bx = (G, a, dd, y, sA, sD, sy, c, e = 0, mat = 16) => { const [x, z] = wp(a, dd); G.box(M4.trs(Mm, x, y, z, 0, 0, 0, ax ? sA : sD, sy, ax ? sD : sA), c, e, mat); };
  const L = { g, W, D, RH, R: mulberry(seed), wp,
    Bl: (...q) => bx(g, ...q), BlP: (...q) => bx(gCast, ...q),
    Sl: (a0, a1, d0, d1, y0, y1) => { const [xa, za] = wp(a0, d0), [xb, zb] = wp(a1, d1); solidFn(Math.min(xa, xb), Math.max(xa, xb), y0, y1, Math.min(za, zb), Math.max(za, zb)); },
    M: (a, dd, y, ry = 0, rx = 0, rz = 0) => { const [x, z] = wp(a, dd); return M4.trs(Mm, x, y, z, rx, th + ry, rz, 1, 1, 1); },
    MS: (a, dd, y, ry, sx, sy, sz, rx = 0, rz = 0) => { const [x, z] = wp(a, dd); return M4.trs(Mm, x, y, z, rx, th + ry, rz, sx, sy, sz); },
    glass: (a, dd, y, sA, sD, sy, c) => { const [x, z] = wp(a, dd); WORLD.glass.push({ m: M4.trs(M4.create(), x, y, z, 0, th, 0, sA, sy, sD), c }); },
    halo: (a, dd, y, s, c) => { const [x, z] = wp(a, dd); WORLD.halos.push({ p: [x, y, z], s, c }); },
    light: (a, dd, y, r, c) => { const [x, z] = wp(a, dd); WORLD.lights.push({ p: [x, y, z], r, c, shop: true }); } };
  { const [xa, za] = wp(-W / 2, 0.3), [xb, zb] = wp(W / 2, D); WORLD.indoor.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), y1: RH }); }
  propShopInterior(L, type);
}
const _im = M4.create();

/* shared shell detail + dispatch; the legacy ramen / clinic / pawn rooms still draw their own furniture in props.js */
function interiorKit(L, type) {
  const { g, Bl, Sl, W, D, RH, R, light, halo, M, MS } = L, T = SHOP_DEFS[type];
  const rr = (a, b) => a + R() * (b - a), pk = (a) => a[Math.floor(R() * a.length)];
  const K = {};
  K.box = (a, dd, y, sa, sd, sy, c, e = 0, mat = 15, ry = 0, rx = 0, rz = 0) => g.box(MS(a, dd, y, ry, sa, sy, sd, rx, rz), c, e, mat);
  K.rb = (a, dd, y, sa, sd, sy, r, c, e = 0, mat = 15, ry = 0, rx = 0) => g.rbox(M(a, dd, y, ry, rx), sa, sy, sd, r, c, e, mat);
  K.cyl = (a, dd, y, rad, h, c, e = 0, mat = 4, seg = 10, rx = 0, ry = 0, rz = 0) => g.cyl(MS(a, dd, y, ry, rad * 2, h, rad * 2, rx, rz), c, e, mat, seg);
  K.lat = (a, dd, y, prof, c, e = 0, mat = 15, seg = 8) => g.lathe(M(a, dd, y, 0), prof, c, e, mat, seg);
  K.sph = (a, dd, y, r, c, e = 0, mat = 4, seg = 8) => g.sphere(MS(a, dd, y, 0, r * 2, r * 2, r * 2), c, e, mat, seg, 5);
  K.blob = (a, dd, y, rx, ry, rz, c, e = 0) => g.blob(M(a, dd, y, R() * 6), rx, ry, rz, 0.25, Math.floor(R() * 999), c, e, 14, 10, 7);
  const PK = [[0.8, 0.1, 0.08], [0.1, 0.32, 0.8], [0.95, 0.72, 0.1], [0.1, 0.52, 0.25], [0.88, 0.88, 0.84], [0.5, 0.1, 0.52], [0.95, 0.42, 0.1], [0.16, 0.16, 0.18], [0.25, 0.72, 0.85], [0.95, 0.5, 0.62]];
  K.pack = (a, dd, y, w, d, h, ry = 0) => { const c = pk(PK); K.box(a, dd, y + h / 2, w, d, h, c, 0, 15, ry); if (h > 0.12 && R() < 0.7) K.box(a, dd, y + h * 0.62, w * 1.02, d * 1.02, h * 0.22, pk(PK), 0, 15, ry); };
  K.can = (a, dd, y, h = 0.12, c = pk(PK)) => K.cyl(a, dd, y + h / 2, h * 0.28, h, c, 0, 4, 7);
  K.bottle = (a, dd, y, h, c, e = 0.25) => { const r = h * 0.13, n = h * 0.045; K.lat(a, dd, y, [[0, 0], [r, 0], [r, h * 0.6], [n * 1.15, h * 0.78], [n, h * 0.94], [n * 1.3, h * 0.95], [n * 1.3, h]], c, e, 10, 8); };
  K.cup = (a, dd, y, h = 0.1, c = [0.85, 0.85, 0.82]) => K.lat(a, dd, y, [[0, 0], [h * 0.3, 0], [h * 0.42, h], [h * 0.38, h], [h * 0.26, h * 0.1]], c, 0, 15, 8);
  K.chair = (a, dd, ry, c, legC = [0.08, 0.08, 0.09]) => {
    const ca = Math.cos(ry), sa = Math.sin(ry), P = (x, z) => [a + x * ca + z * sa, dd - x * sa + z * ca];
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) { const [pa, pd] = P(x, z); K.box(pa, pd, 0.22, 0.035, 0.035, 0.44, legC, 0, 4); }
    K.rb(a, dd, 0.46, 0.44, 0.44, 0.05, 0.02, c, 0, 15, ry); const [ba, bd] = P(0, 0.2); K.rb(ba, bd, 0.74, 0.42, 0.04, 0.5, 0.02, c, 0, 15, ry, -0.08);
  };
  K.stool = (a, dd, h, c) => { K.cyl(a, dd, 0.02, 0.18, 0.04, [0.1, 0.1, 0.11], 0, 4, 12); K.cyl(a, dd, h / 2, 0.025, h, [0.5, 0.5, 0.52], 0, 4, 6); K.lat(a, dd, h, [[0, 0], [0.19, 0], [0.2, 0.05], [0.17, 0.08], [0, 0.085]], c, 0, 15, 12); };
  K.table = (a, dd, r, h, top, legC = [0.1, 0.1, 0.11]) => { K.cyl(a, dd, h - 0.02, r, 0.04, top, 0, 13, 16); K.cyl(a, dd, h / 2, 0.035, h, legC, 0, 4, 6); K.cyl(a, dd, 0.015, r * 0.55, 0.03, legC, 0, 4, 12); };
  K.plant = (a, dd, s = 1) => { K.lat(a, dd, 0, [[0, 0], [0.16 * s, 0], [0.22 * s, 0.42 * s], [0.24 * s, 0.44 * s], [0.2 * s, 0.44 * s]], [0.16, 0.14, 0.13], 0, 16, 10); K.blob(a, dd, 0.6 * s + 0.25 * s, 0.34 * s, 0.5 * s, 0.34 * s, [0.12, 0.32, 0.1]); Sl(a - 0.25 * s, a + 0.25 * s, dd - 0.25 * s, dd + 0.25 * s, 0, 1.2 * s); };
  K.screen = (a, dd, y, w, h, c, ry = 0, e = 1.6) => { K.box(a, dd, y, w + 0.06, 0.05, h + 0.06, [0.03, 0.03, 0.035], 0, 15, ry); K.box(a, dd - 0.03 * Math.cos(ry), y, w, 0.01, h, c, e, 0, ry); };
  K.pendant = (a, dd, y, c) => { K.cyl(a, dd, (RH + y) / 2, 0.006, RH - y, [0.05, 0.05, 0.05], 0, 4, 4); K.lat(a, dd, y - 0.18, [[0.05, 0.19], [0.22, 0], [0.2, 0], [0.04, 0.17]], [0.08, 0.08, 0.09], 0, 4, 12); K.sph(a, dd, y - 0.12, 0.06, c, 4, 0, 6); halo(a, dd, y - 0.14, 0.9, [c[0] * 0.4, c[1] * 0.4, c[2] * 0.4]); };
  K.tube = (a0, d0, y0, a1, d1, y1, r, c, e = 0) => { const p0 = L.wp(a0, d0), p1 = L.wp(a1, d1); g.tube([[p0[0], y0, p0[1]], [p1[0], y1, p1[1]]], [r, r], c, e, 4, 5, false); };
  K.booth = (a, dd, len, side, c) => {   // bench seat + back against a wall on 'side' (+1 = back toward +dd)
    K.rb(a, dd, 0.24, len, 0.55, 0.48, 0.05, [0.07, 0.06, 0.06], 0, 15); K.rb(a, dd, 0.5, len, 0.55, 0.12, 0.05, c, 0, 15);
    K.rb(a, dd + side * 0.24, 0.85, len, 0.14, 0.75, 0.06, c, 0, 15); Sl(a - len / 2, a + len / 2, dd - 0.28, dd + 0.28, 0, 0.55);
  };
  K.shelf = (ca, cd, len, dep, h, levels, axis, fill, twoSided = false, frame = [0.12, 0.12, 0.13]) => {
    const A = axis === 'a', sa = A ? len : dep, sd = A ? dep : len;
    for (const s of [-1, 1]) K.box(ca + (A ? s * len / 2 : 0), cd + (A ? 0 : s * len / 2), h / 2, A ? 0.04 : dep, A ? dep : 0.04, h, frame, 0, 4);
    if (twoSided) K.box(ca, cd, h / 2 + 0.05, A ? len : 0.03, A ? 0.03 : len, h - 0.1, frame, 0, 4);
    for (let i = 0; i < levels; i++) {
      const y = 0.1 + i * (h - 0.25) / Math.max(1, levels - 1) * (levels > 1 ? 1 : 0), clear = (h - 0.25) / Math.max(1, levels - 1) - 0.06;
      K.box(ca, cd, y, sa, sd, 0.025, frame, 0, 4);
      for (const side of twoSided ? [-1, 1] : [0]) {
        const off = side * dep / 4, n = Math.floor(len / 0.2);
        for (let k = 0; k < n; k++) { const t = -len / 2 + (k + 0.5) * len / n; fill(A ? ca + t : ca + off, A ? cd + off : cd + t, y + 0.013, Math.min(clear, 0.42), A ? 'a' : 'd', side, i); }
      }
    }
    Sl(ca - sa / 2, ca + sa / 2, cd - sd / 2, cd + sd / 2, 0, h);
  };
  K.scatter = (n, c = null) => { for (let i = 0; i < n; i++) { const a = rr(-W / 2 + 0.6, W / 2 - 0.6), dd = rr(0.8, D - 1); K.box(a, dd, 0.004, rr(0.15, 0.3), rr(0.2, 0.3), 0.004, c || [0.7, 0.68, 0.6], 0, 15, rr(0, 6)); } };
  K.fluor = (a, dd, len, axis = 'd', c = [0.9, 0.97, 1]) => { K.box(a, dd, RH - 0.14, axis === 'a' ? len : 0.22, axis === 'a' ? 0.22 : len, 0.05, [0.2, 0.2, 0.22], 0, 4); K.box(a, dd, RH - 0.17, axis === 'a' ? len - 0.1 : 0.12, axis === 'a' ? 0.12 : len - 0.1, 0.02, c, 3.2, 0); };

  /* ---- shell detail common to every room: baseboards, ceiling grid, exit sign, posters, vents, door frame, dust ---- */
  const trim = [T.wall[0] * 0.45, T.wall[1] * 0.45, T.wall[2] * 0.45];
  for (const s of [-1, 1]) K.box(s * (W / 2 - 0.07), D / 2, 0.06, 0.03, D - 0.1, 0.12, trim, 0, 15);
  K.box(0, D - 0.07, 0.06, W - 0.1, 0.03, 0.12, trim, 0, 15);
  for (let dd = 1.2; dd < D; dd += 1.2) K.box(0, dd, RH - 0.11, W - 0.1, 0.03, 0.02, [0.1, 0.1, 0.11], 0, 4);
  for (const s of [-1, 1]) K.box(s * 1.33, 0.08, 1.6, 0.1, 0.14, 3.2, [0.1, 0.1, 0.11], 0, 4);
  K.box(0, 0.08, 3.25, 2.76, 0.14, 0.1, [0.1, 0.1, 0.11], 0, 4);
  K.box(0, 0.3, 3.05, 0.34, 0.03, 0.14, [0.1, 0.9, 0.3], 2.4, 0);                          // exit sign over the door
  K.box(-W / 2 + 1.2, D - 0.2, RH - 0.35, 0.7, 0.2, 0.3, [0.2, 0.2, 0.21], 0, 8);          // AC vent
  K.box(0, 0.5, 0.004, 1.4, 0.8, 0.008, [0.08, 0.07, 0.06], 0, 15);                        // entry mat
  if (R() < 0.8) K.box(-W / 2 + 0.035, rr(1.5, 2.5), 1.7, 0.012, 0.6, 0.85, pk(PK), 0.25, 15);   // faded poster
  K.scatter(3 + Math.floor(R() * 4));

  const F = INTERIORS[type]; if (F) F(L, T, K, rr, pk, PK);
}

const INTERIORS = {
  /* ---- convenience store: fridges along the back, gondolas, a checkout by the door ---- */
  conbini(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const nf = Math.floor((W - 0.8) / 1.25), fw = (W - 0.8) / nf;
    for (let i = 0; i < nf; i++) {
      const a = -W / 2 + 0.4 + fw * (i + 0.5);
      K.box(a, D - 0.45, 1.15, fw, 0.8, 2.3, [0.15, 0.15, 0.16], 0, 4);
      K.box(a, D - 0.83, 1.15, fw - 0.12, 0.02, 2.0, [0.75, 0.88, 1], 1.5, 0);           // lit back of the cooler
      K.box(a, D - 0.1, 2.38, fw, 0.2, 0.14, T.glow, 1.8, 0);
      for (let y = 0.3; y < 2.0; y += 0.42) {
        K.box(a, D - 0.5, y - 0.02, fw - 0.1, 0.62, 0.015, [0.5, 0.52, 0.55], 0.2, 4);
        for (let k = 0; k < 5; k++) { const pa = a - fw / 2 + 0.14 + k * (fw - 0.28) / 4, c = pk(PK); if (R() < 0.12) continue; R() < 0.5 ? K.bottle(pa, D - 0.25, y, 0.3, c, 0.3) : K.can(pa, D - 0.25, y, 0.13, c); }
      }
      K.box(a - fw / 2 + 0.02, D - 0.06, 1.15, 0.05, 0.05, 2.2, [0.6, 0.62, 0.65], 0, 4);
    }
    Sl(-W / 2, W / 2, D - 0.9, D, 0, 2.4);
    const goods = (a, dd, y, clear, ax, side) => { if (R() < 0.1) return; const h = rr(0.12, Math.min(clear, 0.3)); if (R() < 0.3) { K.can(a, dd, y, 0.12); K.can(a + 0.07 * (ax === 'd'), dd + 0.07 * (ax === 'a'), y, 0.12); } else K.pack(a, dd, y, ax === 'a' ? 0.16 : 0.12, ax === 'a' ? 0.12 : 0.16, h); };
    const glen = D - 5;
    for (const s of [-1, 1]) K.shelf(s * 1.7, 3.0 + glen / 2, glen, 0.8, 1.55, 4, 'd', goods, true);
    K.shelf(-W / 2 + 0.3, 1.9 + (D - 3.2) / 2, D - 3.2, 0.5, 2.0, 5, 'd', goods);
    K.shelf(W / 2 - 0.3, 3.3 + (D - 4.6) / 2, D - 4.6, 0.5, 2.0, 5, 'd', goods);
    // checkout: counter, register, hot-food case, cigarettes behind
    const ca = W / 2 - 1.9;
    K.rb(ca, 1.9, 0.5, 0.75, 1.9, 1.0, 0.04, [0.8, 0.8, 0.78], 0, 15); K.box(ca, 1.9, 1.02, 0.85, 2.0, 0.04, [0.2, 0.2, 0.22], 0, 10); Sl(ca - 0.4, ca + 0.4, 0.95, 2.85, 0, 1.05);
    K.box(ca, 1.4, 1.14, 0.35, 0.3, 0.2, [0.12, 0.12, 0.13], 0, 15); K.screen(ca + 0.05, 1.45, 1.38, 0.28, 0.2, [0.3, 1, 0.6], -Math.PI / 2, 1.2);
    K.box(ca, 2.4, 1.28, 0.6, 0.55, 0.5, [1, 0.7, 0.35], 0.9, 10);
    for (let y = 1.2; y < 2.4; y += 0.28) for (let dd = 1.1; dd < 2.8; dd += 0.14) K.box(W / 2 - 0.2, dd, y, 0.12, 0.09, 0.14, pk(PK), 0.1, 15);
    K.box(W / 2 - 0.2, 1.95, 1.75, 0.3, 1.9, 1.35, [0.1, 0.1, 0.11], 0, 4); Sl(W / 2 - 0.4, W / 2, 1, 2.9, 0, 2.5);
    // magazine rack under the window
    K.box(-W / 2 + 2, 0.6, 0.45, 2.6, 0.35, 0.9, [0.15, 0.15, 0.16], 0, 4); Sl(-W / 2 + 0.7, -W / 2 + 3.3, 0.4, 0.8, 0, 0.9);
    for (let a = -W / 2 + 0.85; a < -W / 2 + 3.2; a += 0.24) K.box(a, 0.62, 0.95, 0.2, 0.02, 0.28, pk(PK), 0.15, 15, 0, -0.3);
    for (const a of [-2.6, 0, 2.6]) K.fluor(a, D / 2, D - 1.2);
    light(0, D * 0.35, RH - 0.5, 9, [1.5, 1.6, 1.7]); light(0, D * 0.8, RH - 0.5, 8, [1.2, 1.4, 1.6]);
    for (let i = 0; i < 6; i++) K.pack(rr(-2, 2), rr(1.5, D - 2), 0, 0.16, 0.12, 0.2, rr(0, 6));   // knocked off the shelves
    K.box(rr(-1, 1), rr(2, 4), 0.14, 0.45, 0.3, 0.28, [0.8, 0.1, 0.1], 0, 15, 0.4, 0, 1.4);            // dropped basket
  },

  /* ---- cocktail bar: long counter and back bar of bottles on the right, booths on the left ---- */
  bar(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L, ca = W / 2 - 2.2, d0 = 1.8, d1 = D - 0.7, len = d1 - d0, dm = (d0 + d1) / 2;
    const wood = [0.2, 0.09, 0.04], top = [0.32, 0.16, 0.07];
    K.rb(ca, dm, 0.52, 0.6, len, 1.04, 0.04, wood, 0, 13); K.rb(ca, dm, 1.07, 0.78, len + 0.1, 0.06, 0.02, top, 0, 13);
    K.box(ca - 0.31, dm, 0.1, 0.02, len, 0.04, T.glow, 2.2, 0);                                  // under-glow
    K.cyl(ca - 0.45, dm, 0.22, 0.02, len, [0.7, 0.6, 0.35], 0, 4, 6, Math.PI / 2);                // foot rail
    Sl(ca - 0.4, ca + 0.4, d0, d1, 0, 1.1);
    for (let dd = d0 + 0.5; dd < d1 - 0.3; dd += 0.95) K.stool(ca - 0.9, dd, 0.78, [0.5, 0.05, 0.12]);
    for (let dd = d0 + 0.4; dd < d1 - 0.2; dd += rr(0.4, 0.9)) R() < 0.5 ? K.cup(ca + rr(-0.15, 0.15), dd, 1.1, 0.12, [0.7, 0.8, 0.85]) : K.bottle(ca + rr(-0.1, 0.2), dd, 1.1, 0.3, pk(PK), 0.3);
    for (let i = 0; i < 3; i++) K.cyl(ca + 0.2, d0 + 0.8 + i * 0.25, 1.35, 0.025, 0.5, [0.75, 0.75, 0.78], 0, 4, 6);   // beer taps
    // back bar: cabinet, mirror, glass shelves of backlit bottles
    const ba = W / 2 - 0.25;
    K.box(ba, dm, 0.5, 0.45, len, 1.0, wood, 0, 13); K.box(ba + 0.2, dm, 1.95, 0.02, len - 0.2, 1.5, [0.5, 0.52, 0.55], 0, 10);
    for (const y of [1.3, 1.75, 2.2]) {
      K.box(ba, dm, y, 0.3, len - 0.3, 0.02, [0.6, 0.7, 0.75], 0.4, 10); K.box(ba + 0.12, dm, y + 0.02, 0.02, len - 0.3, 0.02, T.glow, 2.4, 0);
      for (let dd = d0 + 0.3; dd < d1 - 0.2; dd += rr(0.12, 0.18)) K.bottle(ba + rr(-0.06, 0.06), dd, y + 0.01, rr(0.26, 0.36), pk([[0.5, 0.25, 0.05], [0.1, 0.4, 0.15], [0.7, 0.7, 0.72], [0.35, 0.05, 0.05], [0.8, 0.6, 0.2], [0.1, 0.2, 0.5]]), 0.45);
    }
    Sl(ba - 0.25, W / 2, d0, d1, 0, 2.6);
    // booths along the left wall
    for (let dd = 2.2; dd < D - 1.2; dd += 2.3) {
      const a = -W / 2 + 0.95, bc = [0.35, 0.04, 0.08];
      K.booth(a, dd - 0.75, 1.5, -1, bc); K.booth(a, dd + 0.75, 1.5, 1, bc);
      K.box(a, dd, 0.72, 1.2, 0.7, 0.05, [0.08, 0.06, 0.05], 0, 13); K.box(a, dd, 0.36, 0.1, 0.1, 0.72, [0.1, 0.1, 0.1], 0, 4); Sl(a - 0.6, a + 0.6, dd - 0.35, dd + 0.35, 0, 0.75);
      K.cup(a + 0.2, dd, 0.745, 0.11, [0.7, 0.8, 0.85]); K.bottle(a - 0.2, dd + 0.1, 0.745, 0.28, [0.4, 0.2, 0.05]);
      K.pendant(a, dd, 1.9, [1, 0.6, 0.3]);
    }
    K.box(-0.5, D - 0.06, 2.4, 2.6, 0.04, 0.6, T.glow, 2.6, 0);                                   // neon script on the back wall
    K.rb(-1.2, D - 0.5, 0.85, 0.9, 0.6, 1.7, 0.12, [0.3, 0.05, 0.1], 0.2, 15); K.box(-1.2, D - 0.81, 1.2, 0.7, 0.02, 0.6, [1, 0.55, 0.2], 2, 0); Sl(-1.65, -0.75, D - 0.8, D, 0, 1.7);   // jukebox
    for (let dd = d0 + 0.6; dd < d1; dd += 1.6) K.pendant(ca, dd, 2.1, [1, 0.7, 0.4]);
    light(ca, dm, 2.4, 9, [2.2, 1.2, 0.65]); light(-W / 2 + 1.5, D / 2, 2.2, 8, [T.glow[0] * 1.3, T.glow[1] * 1.3, T.glow[2] * 1.3]);
  },

  /* ---- slot parlour: rows of machines back to back, a cashier cage, red lanterns ---- */
  lucky(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const slot = (a, dd, fs) => {   // cabinet whose screen faces fs (+1 toward +a)
      K.rb(a, dd, 0.75, 0.6, 0.62, 1.5, 0.05, [0.5, 0.06, 0.08], 0, 11);
      K.box(a + fs * 0.31, dd, 1.05, 0.02, 0.5, 0.45, pk([[1, 0.8, 0.3], [0.3, 1, 0.7], [1, 0.3, 0.8]]), 1.8, 0);
      K.box(a + fs * 0.31, dd, 1.62, 0.02, 0.55, 0.22, [1, 0.85, 0.3], 2.5, 0); K.box(a + fs * 0.36, dd, 0.72, 0.12, 0.56, 0.06, [0.15, 0.15, 0.16], 0, 4);
      K.stool(a + fs * 0.8, dd, 0.62, [0.5, 0.05, 0.05]); };
    for (let dd = 2.3; dd < D - 1.6; dd += 0.68) { slot(-0.32, dd, -1); slot(0.32, dd, 1); slot(-W / 2 + 0.35, dd, 1); }
    Sl(-0.62, 0.62, 1.95, D - 1.55, 0, 1.6); Sl(-W / 2, -W / 2 + 0.65, 1.95, D - 1.55, 0, 1.6);
    const ca = W / 2 - 1.2; K.box(ca, D - 1.4, 0.55, 1.6, 1.6, 1.1, [0.25, 0.2, 0.1], 0, 13);
    for (let k = 0; k < 7; k++) K.box(ca - 0.8 + k * 0.26, D - 2.21, 1.9, 0.02, 0.02, 1.6, [0.7, 0.6, 0.3], 0, 4);   // cage bars
    K.box(ca, D - 1.4, 2.72, 1.7, 1.7, 0.06, [0.3, 0.25, 0.12], 0, 4); Sl(ca - 0.85, ca + 0.85, D - 2.25, D - 0.5, 0, 2.7);
    for (let a = -W / 2 + 1; a < W / 2; a += 1.7) { K.cyl(a, D / 2, RH - 0.9, 0.24, 0.42, [1, 0.15, 0.1], 1.6, 15, 10); halo(a, D / 2, RH - 0.9, 1.2, [0.5, 0.08, 0.05]); }
    K.scatter(10, [0.8, 0.7, 0.3]);
    light(0, D * 0.4, RH - 0.6, 9, [1.8, 0.6, 0.3]); light(0, D * 0.8, RH - 0.6, 8, [1.5, 0.8, 0.3]);
  },

  /* ---- café: espresso counter across the back, pastry case, small tables with laptops ---- */
  cafe(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L, cd = D - 1.8, c0 = -W / 2 + 2.2, c1 = W / 2 - 0.5, cm = (c0 + c1) / 2, cl = c1 - c0;
    K.rb(cm, cd, 0.52, cl, 0.65, 1.04, 0.04, [0.25, 0.14, 0.07], 0, 13); K.box(cm, cd, 1.06, cl + 0.1, 0.75, 0.05, [0.72, 0.7, 0.66], 0, 16); Sl(c0, c1, cd - 0.38, cd + 0.38, 0, 1.1);
    K.rb(cm + 1, cd + 0.05, 1.3, 0.8, 0.45, 0.45, 0.05, [0.75, 0.75, 0.78], 0, 4); K.box(cm + 1, cd - 0.18, 1.35, 0.5, 0.02, 0.12, [1, 0.5, 0.2], 1.5, 0);   // espresso machine
    for (const o of [-0.2, 0.2]) K.cyl(cm + 1 + o, cd - 0.2, 1.15, 0.03, 0.08, [0.2, 0.2, 0.2], 0, 4, 6);
    K.cyl(cm + 1.7, cd, 1.25, 0.08, 0.35, [0.12, 0.12, 0.13], 0, 4, 10); K.lat(cm + 1.7, cd, 1.42, [[0.02, 0], [0.1, 0.18]], [0.3, 0.3, 0.32], 0, 10, 10);
    for (let k = 0; k < 4; k++) K.cup(cm + 0.1 + k * 0.08, cd + 0.1, 1.085 + k * 0.001, 0.09);
    K.box(cm - 0.9, cd, 1.3, 1.3, 0.6, 0.45, [0.6, 0.7, 0.72], 0.25, 10); K.box(cm - 0.9, cd, 1.1, 1.25, 0.55, 0.03, [1, 0.85, 0.6], 1.2, 0);   // pastry case
    for (let k = 0; k < 6; k++) K.sph(cm - 1.4 + k * 0.2, cd + rr(-0.12, 0.12), 1.16, 0.06, pk([[0.7, 0.45, 0.2], [0.5, 0.25, 0.1], [0.9, 0.8, 0.6]]), 0, 15, 6);
    for (let k = 0; k < 3; k++) K.screen(cm - 1.2 + k * 1.3, D - 0.08, 2.6, 1.1, 0.7, [0.06, 0.05, 0.04], 0, 0.5);   // menu boards
    for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) K.box(cm - 1.2 + k * 1.3, D - 0.11, 2.85 - j * 0.12, 0.8 * rr(0.6, 1), 0.005, 0.03, [1, 0.9, 0.75], 1.2, 0);
    for (let y = 1.2; y < 2.4; y += 0.45) { K.box(-W / 2 + 0.3, D - 1.3, y, 0.4, 1.8, 0.03, [0.3, 0.18, 0.08], 0, 13); for (let dd = D - 2.1; dd < D - 0.5; dd += 0.18) R() < 0.5 ? K.lat(-W / 2 + 0.3, dd, y + 0.015, [[0.05, 0], [0.05, 0.16], [0.03, 0.18], [0.035, 0.2]], pk([[0.6, 0.4, 0.2], [0.3, 0.2, 0.1], [0.5, 0.5, 0.5]]), 0, 10, 8) : K.pack(-W / 2 + 0.3, dd, y + 0.015, 0.13, 0.08, 0.2); }
    Sl(-W / 2, -W / 2 + 0.55, D - 2.3, D - 0.3, 0, 2.4);
    for (const [a, dd] of [[-2.3, 2.3], [2.3, 2.3], [-2.3, 4.3], [0.4, 3.4]]) {
      K.table(a, dd, 0.38, 0.74, [0.4, 0.26, 0.14]); Sl(a - 0.38, a + 0.38, dd - 0.38, dd + 0.38, 0, 0.75);
      K.chair(a - 0.62, dd, Math.PI / 2 * (R() < 0.3 ? 1.4 : 1), [0.1, 0.1, 0.11]); K.chair(a + 0.62, dd, -Math.PI / 2, [0.1, 0.1, 0.11]);
      if (R() < 0.7) { K.box(a, dd, 0.765, 0.32, 0.22, 0.012, [0.15, 0.15, 0.16], 0, 4); K.box(a, dd + 0.11, 0.87, 0.32, 0.01, 0.22, [0.1, 0.1, 0.12], 0, 4, 0, -0.35); K.box(a, dd + 0.105, 0.87, 0.28, 0.004, 0.18, [0.4, 0.75, 1], 1.4, 0, 0, -0.35); }
      K.cup(a + 0.2, dd - 0.1, 0.76, 0.09);
    }
    K.plant(-W / 2 + 0.5, 0.6, 1.2); K.plant(W / 2 - 0.5, 0.6, 1.1); K.plant(-W / 2 + 0.5, D - 2.6, 0.9);
    for (const [a, dd] of [[-2.3, 2.3], [2.3, 2.3], [-2.3, 4.3], [0.4, 3.4], [cm, cd]]) K.pendant(a, dd, 2.0, [1, 0.72, 0.4]);
    light(0, D * 0.35, 2.8, 8, [1.7, 1.1, 0.6]); light(cm, cd, 2.6, 7, [1.6, 1.05, 0.6]);
  },

  /* ---- electronics: a wall of screens, display tables of devices, pegboards of boxed gear ---- */
  volt(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const hues = [[0.2, 0.7, 1], [1, 0.3, 0.6], [0.3, 1, 0.6], [1, 0.75, 0.25], [0.6, 0.4, 1], [0.9, 0.95, 1]];
    const nx = Math.floor((W - 1) / 1.2);
    for (let i = 0; i < nx; i++) for (let j = 0; j < 3; j++) K.screen(-W / 2 + 0.5 + (i + 0.5) * (W - 1) / nx, D - 0.1, 0.9 + j * 0.85, 1.05, 0.72, pk(hues), 0, rr(0.9, 1.9));
    for (const s of [-1, 1]) {   // display tables
      const a = s * 1.6, dd = D / 2 - 0.3;
      K.rb(a, dd, 0.45, 1.1, 2.6, 0.9, 0.04, [0.85, 0.85, 0.86], 0, 15); K.box(a, dd, 0.91, 1.14, 2.64, 0.02, [0.05, 0.05, 0.06], 0, 10); Sl(a - 0.55, a + 0.55, dd - 1.3, dd + 1.3, 0, 0.92);
      for (let k = 0; k < 6; k++) { const pd = dd - 1.05 + k * 0.42; K.box(a - 0.2, pd, 0.93, 0.08, 0.16, 0.01, [0.05, 0.05, 0.06], 0, 4); K.box(a - 0.2, pd, 0.938, 0.07, 0.14, 0.004, pk(hues), 1.5, 0);
        K.box(a + 0.22, pd, 0.95, 0.24, 0.02, 0.17, [0.06, 0.06, 0.07], 0, 4, 0, -0.4); K.box(a + 0.22, pd - 0.012, 0.95, 0.21, 0.004, 0.14, pk(hues), 1.3, 0, 0, -0.4); }
    }
    for (const s of [-1, 1]) {   // pegboards of boxed gear and coiled cable
      const a = s * (W / 2 - 0.05); K.box(a, D / 2 - 0.5, 1.6, 0.03, D - 3, 2.2, [0.55, 0.5, 0.42], 0, 13);
      for (let y = 0.8; y < 2.6; y += 0.4) for (let dd = 1.6; dd < D - 2; dd += 0.3) if (R() < 0.8) K.pack(a - s * 0.07, dd, y - 0.15, 0.1, 0.22, rr(0.2, 0.3));
      for (let k = 0; k < 3; k++) { const dd = 1.8 + k * 1.2; for (let t = 0; t < 3; t++) g_ring(K, a - s * 0.1, dd, 2.55 - t * 0.05); }
      Sl(a - 0.25, a + 0.25, 1.5, D - 2, 0, 2.7);
    }
    const ca = W / 2 - 1.5; K.rb(ca, 1.6, 0.5, 1.4, 0.7, 1.0, 0.04, [0.1, 0.1, 0.12], 0, 15); K.box(ca, 1.27, 0.2, 1.3, 0.02, 0.08, T.glow, 2, 0); Sl(ca - 0.7, ca + 0.7, 1.25, 1.95, 0, 1.05);
    K.screen(ca, 1.7, 1.25, 0.4, 0.28, [0.4, 0.9, 1], 0, 1.3);
    for (const a of [-2.5, 0, 2.5]) K.fluor(a, D / 2, D - 1.4, 'd', [0.85, 0.95, 1]);
    light(0, D * 0.4, RH - 0.5, 9, [1.2, 1.4, 1.8]); light(0, D - 1, 2, 7, [0.8, 1.1, 1.6]);
  },

  /* ---- memory shop: server racks with blinking LEDs, jars of glowing memory, a recliner rig ---- */
  memory(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const nr = Math.floor((W - 1) / 0.75);
    for (let i = 0; i < nr; i++) { const a = -W / 2 + 0.5 + (i + 0.5) * (W - 1) / nr;
      K.box(a, D - 0.5, 1.1, 0.66, 0.8, 2.2, [0.05, 0.05, 0.06], 0, 4);
      for (let y = 0.3; y < 2.1; y += 0.18) { K.box(a, D - 0.91, y, 0.58, 0.01, 0.12, [0.08, 0.08, 0.09], 0, 4); for (let k = 0; k < 3; k++) if (R() < 0.6) K.box(a - 0.2 + k * 0.06, D - 0.92, y, 0.02, 0.005, 0.02, pk([[0.3, 1, 0.4], [0.3, 0.7, 1], [1, 0.6, 0.2]]), 3, 0); } }
    Sl(-W / 2, W / 2, D - 0.95, D, 0, 2.3);
    for (const s of [-1, 1]) { const a = s * (W / 2 - 0.3);
      for (const y of [0.9, 1.5, 2.1]) { K.box(a, D / 2 - 0.3, y, 0.45, D - 3.6, 0.03, [0.3, 0.3, 0.33], 0, 4);
        for (let dd = 2; dd < D - 2; dd += 0.26) K.lat(a, dd, y + 0.015, [[0.07, 0], [0.07, 0.2], [0.05, 0.23], [0.05, 0.26]], pk([[0.75, 0.4, 1], [0.3, 0.9, 1], [1, 0.4, 0.7]]), R() < 0.8 ? 1.2 : 0.1, 10, 8); }
      Sl(a - 0.25, a + 0.25, 1.8, D - 2, 0, 2.3); }
    K.rb(0, D / 2 - 0.2, 0.55, 0.8, 1.9, 0.3, 0.1, [0.25, 0.25, 0.28], 0, 15, 0, 0.15); K.rb(0, D / 2 + 0.7, 0.9, 0.75, 0.4, 0.8, 0.1, [0.25, 0.25, 0.28], 0, 15, 0, -0.5);
    K.cyl(0, D / 2 - 0.2, 0.2, 0.08, 0.4, [0.5, 0.5, 0.52], 0, 4, 8); K.lat(0, D / 2 + 0.85, 1.35, [[0.22, 0], [0.24, 0.1], [0.16, 0.2]], [0.5, 0.5, 0.55], 0.3, 4, 12);
    K.tube(0, D / 2 + 0.9, 1.5, 0.4, D - 1, 2.6, 0.02, [0.1, 0.1, 0.1]); K.tube(0, D / 2 + 0.9, 1.5, -0.5, D - 1, 2.2, 0.02, [0.1, 0.1, 0.1]);
    Sl(-0.45, 0.45, D / 2 - 1.2, D / 2 + 1, 0, 0.9);
    K.screen(-1.4, D / 2 + 0.3, 1.5, 0.6, 0.4, [0.75, 0.4, 1], Math.PI / 2, 1.5);
    const ca = W / 2 - 1.5; K.rb(ca, 1.5, 0.5, 1.2, 0.6, 1.0, 0.03, [0.08, 0.08, 0.1], 0, 15); K.box(ca, 1.19, 0.5, 1.1, 0.02, 0.6, T.glow, 1.2, 0); Sl(ca - 0.6, ca + 0.6, 1.2, 1.8, 0, 1.05);
    light(0, D * 0.5, RH - 0.8, 8, [1.2, 0.8, 1.8]); light(0, D - 1.5, 2, 6, [0.6, 1, 1.4]);
  },

  /* ---- hotel lobby: reception and key wall, elevators, a lounge, a chandelier ---- */
  hotel(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L, rd = D - 2.2, ra = -1.2;
    K.rb(ra, rd, 0.55, 3.2, 0.7, 1.1, 0.06, [0.25, 0.14, 0.07], 0, 13); K.box(ra, rd, 1.12, 3.3, 0.8, 0.04, [0.85, 0.82, 0.78], 0, 10); K.box(ra, rd - 0.36, 0.3, 3.1, 0.02, 0.05, T.glow, 2, 0); Sl(ra - 1.6, ra + 1.6, rd - 0.4, rd + 0.4, 0, 1.15);
    K.screen(ra - 0.8, rd + 0.1, 1.35, 0.4, 0.26, [0.5, 0.8, 1], 0, 1.2); K.sph(ra + 0.6, rd - 0.1, 1.16, 0.05, [0.8, 0.65, 0.3], 0, 4, 8);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { K.box(ra - 1.4 + i * 0.4, D - 0.12, 1.4 + j * 0.34, 0.36, 0.1, 0.3, [0.2, 0.11, 0.05], 0, 13); if (R() < 0.5) K.box(ra - 1.4 + i * 0.4, D - 0.18, 1.35 + j * 0.34, 0.03, 0.01, 0.1, [0.8, 0.65, 0.3], 0, 4); }
    K.box(ra, D - 0.08, 3.25, 2.2, 0.03, 0.5, T.glow, 1.8, 0);                                              // name in lights
    const ea = W / 2 - 0.08;                                                                                 // elevators
    for (const dd of [2.3, 4.6]) { K.box(ea, dd, 1.3, 0.1, 1.5, 2.6, [0.3, 0.28, 0.24], 0, 4); for (const o of [-0.34, 0.34]) K.box(ea - 0.06, dd + o, 1.2, 0.02, 0.66, 2.3, [0.7, 0.68, 0.62], 0, 4); K.box(ea - 0.06, dd, 2.65, 0.02, 0.4, 0.1, [1, 0.6, 0.2], 2.2, 0); K.box(ea - 0.06, dd + 0.9, 1.2, 0.02, 0.08, 0.14, [0.8, 0.8, 0.8], 0.8, 0); }
    Sl(ea - 0.1, W / 2, 1.5, 5.4, 0, 2.7);
    const la = -W / 2 + 2, ld = 2.8;                                                                         // lounge
    K.box(la, ld, 0.005, 2.8, 2.4, 0.01, [0.35, 0.12, 0.1], 0, 15);
    K.rb(la - 1.1, ld, 0.25, 0.8, 1.9, 0.5, 0.08, [0.2, 0.18, 0.15], 0, 15); K.rb(la - 1.4, ld, 0.6, 0.25, 1.9, 0.7, 0.08, [0.2, 0.18, 0.15], 0, 15); Sl(la - 1.55, la - 0.7, ld - 0.95, ld + 0.95, 0, 0.6);
    for (const s of [-1, 1]) { K.rb(la + 0.8, ld + s * 0.8, 0.28, 0.75, 0.75, 0.55, 0.1, [0.5, 0.36, 0.2], 0, 15); K.rb(la + 1.1, ld + s * 0.8, 0.62, 0.2, 0.75, 0.6, 0.08, [0.5, 0.36, 0.2], 0, 15); Sl(la + 0.42, la + 1.2, ld + s * 0.8 - 0.4, ld + s * 0.8 + 0.4, 0, 0.6); }
    K.rb(la - 0.1, ld, 0.2, 0.7, 1.1, 0.4, 0.03, [0.6, 0.58, 0.55], 0, 10); Sl(la - 0.45, la + 0.25, ld - 0.55, ld + 0.55, 0, 0.4);
    K.box(la - 0.1, ld, 0.41, 0.3, 0.2, 0.03, pk(PK), 0, 15);
    K.plant(-W / 2 + 0.5, 0.7, 1.5); K.plant(W / 2 - 0.6, 0.7, 1.5); K.plant(-W / 2 + 0.5, D - 0.6, 1.3);
    K.cyl(la - 1.2, ld + 1.35, 0.8, 0.02, 1.6, [0.7, 0.6, 0.3], 0, 4, 6); K.lat(la - 1.2, ld + 1.35, 1.5, [[0.18, 0], [0.12, 0.3]], [1, 0.85, 0.6], 1.5, 15, 10);
    for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2; K.sph(0.3 + Math.cos(t) * 0.55, D / 2 + Math.sin(t) * 0.55, RH - 0.9 - (k % 2) * 0.15, 0.05, [1, 0.9, 0.7], 5, 0, 6); }
    K.cyl(0.3, D / 2, RH - 0.45, 0.01, 0.9, [0.7, 0.6, 0.3], 0, 4, 4); halo(0.3, D / 2, RH - 0.95, 2.2, [0.5, 0.4, 0.25]);
    // luggage cart left mid-escape
    const ga = 0.8, gd = 1.6; K.box(ga, gd, 0.2, 0.6, 1.1, 0.05, [0.7, 0.6, 0.3], 0, 4); for (const s of [-1, 1]) K.tube(ga + s * 0.28, gd - 0.5, 0.2, ga + s * 0.28, gd - 0.5, 1.7, 0.02, [0.8, 0.65, 0.3]);
    K.tube(ga - 0.28, gd - 0.5, 1.7, ga + 0.28, gd - 0.5, 1.7, 0.02, [0.8, 0.65, 0.3]); K.rb(ga, gd + 0.1, 0.5, 0.45, 0.7, 0.55, 0.06, [0.15, 0.2, 0.35], 0, 15); K.rb(ga, gd + 0.1, 0.9, 0.35, 0.55, 0.3, 0.05, [0.4, 0.15, 0.1], 0, 15);
    Sl(ga - 0.3, ga + 0.3, gd - 0.55, gd + 0.55, 0, 1.1);
    light(0.3, D / 2, RH - 1.1, 10, [1.8, 1.4, 0.9]); light(ra, rd, 2.2, 6, [1.2, 0.9, 0.5]);
  },

  /* ---- karaoke lounge: a big screen, a U of sofas, mics on the table, a mirror ball ---- */
  karaoke(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    K.box(0, D - 0.08, 1.9, 3.6, 0.06, 2.0, [0.03, 0.03, 0.04], 0, 15);
    const bands = [[0.9, 0.2, 0.7], [0.5, 0.2, 1], [0.2, 0.5, 1], [0.1, 0.9, 1]];
    for (let j = 0; j < 4; j++) K.box(0, D - 0.12, 1.1 + j * 0.47, 3.4, 0.01, 0.46, bands[j], 1.4, 0);
    K.box(0, D - 0.13, 1.4, 2.4, 0.01, 0.08, [1, 1, 1], 2.5, 0);                                               // lyrics bar
    for (const s of [-1, 1]) { K.rb(s * 2.3, D - 0.4, 1, 0.5, 0.45, 2.0, 0.05, [0.06, 0.06, 0.07], 0, 15); K.cyl(s * 2.3, D - 0.64, 1.3, 0.14, 0.02, [0.2, 0.2, 0.22], 0, 4, 12, Math.PI / 2); Sl(s * 2.3 - 0.25, s * 2.3 + 0.25, D - 0.65, D, 0, 2); }
    const sc = [0.4, 0.08, 0.35], sd0 = 2.4, sd1 = D - 1.4;
    for (const s of [-1, 1]) { const a = s * (W / 2 - 0.55); K.rb(a, (sd0 + sd1) / 2, 0.25, 0.7, sd1 - sd0, 0.45, 0.08, [0.06, 0.05, 0.06], 0, 15); K.rb(a, (sd0 + sd1) / 2, 0.52, 0.72, sd1 - sd0, 0.14, 0.06, sc, 0, 15); K.rb(a + s * 0.3, (sd0 + sd1) / 2, 0.85, 0.16, sd1 - sd0, 0.75, 0.06, sc, 0, 15); Sl(a - 0.35, a + 0.35, sd0, sd1, 0, 0.6); }
    const fw = W - 3.6;
    K.rb(0, sd0 - 0.1, 0.25, fw, 0.7, 0.45, 0.08, [0.06, 0.05, 0.06], 0, 15); K.rb(0, sd0 - 0.1, 0.52, fw, 0.72, 0.14, 0.06, sc, 0, 15); K.rb(0, sd0 - 0.4, 0.72, fw, 0.16, 0.5, 0.06, sc, 0, 15); Sl(-fw / 2, fw / 2, sd0 - 0.5, sd0 + 0.25, 0, 0.6);
    K.rb(0, (sd0 + sd1) / 2 + 0.2, 0.22, 2.2, 1.2, 0.44, 0.04, [0.1, 0.1, 0.12], 0, 10); K.box(0, (sd0 + sd1) / 2 + 0.2, 0.45, 2.1, 1.1, 0.01, T.glow, 0.6, 10); Sl(-1.1, 1.1, (sd0 + sd1) / 2 - 0.4, (sd0 + sd1) / 2 + 0.8, 0, 0.45);
    for (let k = 0; k < 2; k++) { const a = -0.4 + k * 0.8, dd = (sd0 + sd1) / 2 + 0.1; K.cyl(a, dd, 0.5, 0.02, 0.18, [0.15, 0.15, 0.16], 0, 4, 6, Math.PI / 2); K.sph(a + 0.1, dd, 0.5, 0.035, [0.6, 0.6, 0.62], 0, 4, 6); }
    for (let k = 0; k < 5; k++) R() < 0.6 ? K.bottle(rr(-0.9, 0.9), (sd0 + sd1) / 2 + rr(-0.1, 0.6), 0.455, 0.26, pk([[0.1, 0.4, 0.15], [0.5, 0.3, 0.05]])) : K.cup(rr(-0.9, 0.9), (sd0 + sd1) / 2 + rr(-0.1, 0.6), 0.455, 0.1, [0.7, 0.8, 0.85]);
    K.sph(0, D / 2, RH - 0.7, 0.28, [0.8, 0.8, 0.85], 0.2, 4, 12); K.cyl(0, D / 2, RH - 0.2, 0.006, 0.4, [0.1, 0.1, 0.1], 0, 4, 4);
    for (const [a, c] of [[-2.5, [1, 0.2, 0.8]], [0, [0.3, 0.4, 1]], [2.5, [0.2, 1, 0.9]]]) { K.cyl(a, 1.2, RH - 0.25, 0.1, 0.2, [0.1, 0.1, 0.1], 0, 4, 8); halo(a, 1.3, RH - 0.4, 1.4, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5]); }
    light(-2, D / 2, 2.6, 7, [1.6, 0.3, 1.3]); light(2, D / 2, 2.6, 7, [0.4, 0.6, 1.8]); light(0, D - 1, 1.6, 6, [0.9, 0.5, 1.6]);
  },

  /* ---- black-market surgery: a reclined chair under robot arms, prosthetics on the wall, vials ---- */
  cyberdoc(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L, cd = D / 2 + 0.3;
    K.cyl(0, cd, 0.3, 0.15, 0.6, [0.5, 0.5, 0.52], 0, 4, 10); K.rb(0, cd - 0.4, 0.75, 0.7, 1.1, 0.14, 0.06, [0.15, 0.15, 0.16], 0, 15, 0, 0.12); K.rb(0, cd + 0.55, 1.05, 0.66, 0.8, 0.14, 0.06, [0.15, 0.15, 0.16], 0, 15, 0, -0.9);
    K.rb(0, cd - 1.1, 0.5, 0.6, 0.5, 0.12, 0.05, [0.15, 0.15, 0.16], 0, 15, 0, 0.9); Sl(-0.45, 0.45, cd - 1.35, cd + 0.9, 0, 0.95);
    for (const s of [-1, 1]) {   // ceiling-hung robot arms reaching down to the chair
      const p0 = [s * 0.3, cd + 0.2, RH - 0.1], p1 = [s * 0.9, cd + 0.1, 2.6], p2 = [s * 0.55, cd - 0.3, 1.7], p3 = [s * 0.22, cd - 0.35, 1.25];
      K.tube(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.07, [0.7, 0.7, 0.72]); K.tube(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 0.055, [0.7, 0.7, 0.72]); K.tube(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 0.035, [0.3, 0.3, 0.32]);
      for (const p of [p1, p2]) K.sph(p[0], p[1], p[2], 0.09, [0.15, 0.15, 0.16], 0, 4, 8);
      K.sph(p3[0], p3[1], p3[2], 0.03, T.glow, 3, 0, 6);
    }
    K.cyl(0, cd + 0.2, RH - 0.05, 0.25, 0.1, [0.2, 0.2, 0.22], 0, 4, 12);
    K.lat(0, cd - 0.2, 2.5, [[0.3, 0], [0.26, 0.1], [0.08, 0.16]], [0.7, 0.72, 0.75], 0, 4, 14); K.cyl(0, cd - 0.2, 2.5, 0.25, 0.01, [0.9, 1, 0.95], 3, 0, 14);   // surgical lamp
    halo(0, cd - 0.2, 2.45, 1.2, [0.4, 0.5, 0.45]);
    K.cyl(1.1, cd - 0.6, 0.5, 0.02, 1.0, [0.6, 0.6, 0.62], 0, 4, 6); K.box(1.1, cd - 0.6, 1.0, 0.55, 0.38, 0.02, [0.7, 0.7, 0.72], 0, 4);   // instrument tray
    for (let k = 0; k < 6; k++) K.box(1.0 + (k % 3) * 0.1, cd - 0.7 + Math.floor(k / 3) * 0.2, 1.015, 0.012, 0.14, 0.01, [0.8, 0.82, 0.85], 0, 4, rr(-0.3, 0.3));
    K.screen(-1.2, cd - 0.2, 1.7, 0.6, 0.4, [0.4, 1, 0.6], Math.PI / 2, 1.4); K.cyl(-1.2, cd - 0.2, 0.75, 0.025, 1.5, [0.5, 0.5, 0.52], 0, 4, 6);
    const wa = -W / 2 + 0.2;                                                                                         // prosthetic arms hung on the left wall
    K.box(wa, D / 2, 1.8, 0.05, D - 2.5, 0.08, [0.3, 0.3, 0.32], 0, 4);
    for (let dd = 1.6; dd < D - 1.5; dd += 0.55) { const y = 1.75, c = pk([[0.75, 0.75, 0.78], [0.12, 0.12, 0.13], [0.6, 0.45, 0.35]]);
      K.tube(wa + 0.12, dd, y, wa + 0.14, dd, y - 0.45, 0.05, c); K.tube(wa + 0.14, dd, y - 0.45, wa + 0.14, dd, y - 0.85, 0.04, c); K.sph(wa + 0.14, dd, y - 0.45, 0.055, [0.2, 0.2, 0.22], 0, 4, 6); K.box(wa + 0.14, dd, y - 0.93, 0.06, 0.1, 0.12, c, 0, 4); }
    for (let dd = 1.6; dd < D - 1.5; dd += 0.7) { K.tube(wa + 0.15, dd, 0.5, wa + 0.2, dd + 0.1, 0.02, 0.07, [0.7, 0.7, 0.72]); }
    Sl(wa - 0.2, wa + 0.35, 1.4, D - 1.4, 0, 2);
    const va = W / 2 - 0.35;                                                                                         // cabinet of glowing vials
    K.box(va, D / 2, 1.1, 0.6, 2.8, 2.2, [0.8, 0.82, 0.84], 0, 4); K.box(va - 0.31, D / 2, 1.1, 0.02, 2.7, 2.1, [0.5, 0.6, 0.62], 0.1, 10);
    for (let y = 0.4; y < 2.1; y += 0.4) { K.box(va, D / 2, y - 0.02, 0.5, 2.6, 0.02, [0.7, 0.7, 0.72], 0, 4); for (let dd = D / 2 - 1.2; dd < D / 2 + 1.2; dd += 0.14) K.cyl(va - 0.1, dd, y + 0.08, 0.03, 0.16, pk([[0.3, 1, 0.5], [1, 0.3, 0.3], [0.4, 0.7, 1]]), R() < 0.8 ? 1.3 : 0, 10, 6); }
    Sl(va - 0.3, W / 2, D / 2 - 1.4, D / 2 + 1.4, 0, 2.2);
    K.box(0.4, cd - 1.6, 0.003, 0.9, 0.7, 0.004, [0.2, 0.01, 0.01], 0, 15, 0.5);                                   // old stain under the chair
    for (const a of [-2.2, 2.2]) K.fluor(a, D / 2, D - 1.6, 'd', [0.85, 1, 0.92]);
    light(0, cd - 0.2, 2.3, 7, [1.6, 1.8, 1.7]); light(0, 2, RH - 0.6, 8, [0.8, 1.5, 1.1]);
  },

  /* ---- noodle diner: a long counter with stools and a kitchen pass, booths down the side ---- */
  diner(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L, cd = D - 2.1, c0 = -W / 2 + 0.6, c1 = W / 2 - 2.8, cm = (c0 + c1) / 2, cl = c1 - c0;
    K.rb(cm, cd, 0.52, cl, 0.6, 1.04, 0.04, [0.75, 0.1, 0.08], 0, 11); K.box(cm, cd, 1.06, cl + 0.1, 0.7, 0.05, [0.85, 0.85, 0.82], 0, 15); K.box(cm, cd - 0.31, 0.95, cl, 0.02, 0.06, [0.8, 0.8, 0.82], 0, 4); Sl(c0, c1, cd - 0.36, cd + 0.36, 0, 1.1);
    for (let a = c0 + 0.4; a < c1 - 0.2; a += 0.75) K.stool(a, cd - 0.75, 0.75, [0.8, 0.12, 0.1]);
    for (let a = c0 + 0.3; a < c1; a += rr(0.5, 0.9)) { K.lat(a, cd + rr(-0.15, 0.15), 1.085, [[0.04, 0], [0.12, 0.08], [0.11, 0.08]], [0.9, 0.9, 0.86], 0, 15, 10); if (R() < 0.5) K.box(a + 0.1, cd, 1.1, 0.01, 0.2, 0.01, [0.4, 0.25, 0.1], 0, 13, 0.3); }
    K.box(cm, D - 0.9, 2.2, cl, 0.05, 0.9, [0.2, 0.2, 0.21], 0, 4); K.box(cm, D - 0.9, 1.2, cl, 0.05, 0.1, [0.6, 0.6, 0.62], 0, 4);   // kitchen pass
    for (let a = c0 + 0.6; a < c1 - 0.4; a += 1.3) { K.cyl(a, D - 0.5, 1.4, 0.22, 0.4, [0.6, 0.6, 0.62], 0, 4, 12); K.box(a, D - 0.5, 1.0, 0.8, 0.7, 0.9, [0.4, 0.4, 0.42], 0, 4); }
    Sl(c0, c1, D - 1, D, 0, 2.5);
    for (let k = 0; k < Math.floor(cl / 1.1); k++) { K.box(c0 + 0.55 + k * 1.1, D - 0.95, 2.95, 1.0, 0.06, 0.5, [1, 0.92, 0.75], 1.4, 0); K.box(c0 + 0.55 + k * 1.1, D - 0.99, 2.95, 0.4, 0.005, 0.25, pk([[0.8, 0.4, 0.1], [0.9, 0.7, 0.3], [0.6, 0.2, 0.1]]), 0.6, 0); }
    const ba = W / 2 - 0.9;                                                                                               // booths
    for (let dd = 2; dd < D - 2.5; dd += 2.3) { K.booth(ba, dd - 0.75, 1.4, -1, [0.8, 0.12, 0.1]); K.booth(ba, dd + 0.75, 1.4, 1, [0.8, 0.12, 0.1]);
      K.box(ba, dd, 0.74, 1.2, 0.7, 0.04, [0.85, 0.85, 0.82], 0, 15); K.box(ba, dd, 0.37, 0.08, 0.08, 0.74, [0.6, 0.6, 0.62], 0, 4); Sl(ba - 0.6, ba + 0.6, dd - 0.35, dd + 0.35, 0, 0.76);
      K.box(ba + 0.4, dd, 0.8, 0.08, 0.12, 0.1, [0.75, 0.75, 0.78], 0, 4); K.cyl(ba + 0.25, dd + 0.15, 0.82, 0.025, 0.12, [0.7, 0.15, 0.1], 0, 15, 6); K.lat(ba - 0.2, dd, 0.76, [[0.04, 0], [0.12, 0.08]], [0.9, 0.9, 0.86], 0, 15, 10); }
    K.blob(-W / 2 + 0.6, 1.2, 0.9, 0.3, 0.8, 0.3, [0.15, 0.4, 0.15], 0);                                                  // the kaiju mascot figure
    for (const s of [-1, 1]) K.sph(-W / 2 + 0.6 + s * 0.1, 1.05, 1.5, 0.04, [1, 0.8, 0.1], 3, 0, 6);
    Sl(-W / 2 + 0.3, -W / 2 + 0.9, 0.9, 1.5, 0, 1.7);
    for (let a = c0 + 0.8; a < c1; a += 1.8) K.pendant(a, cd, 2.1, [1, 0.85, 0.6]);
    for (const a of [-1.5, 1.5]) K.fluor(a, D / 2 - 1, D - 3, 'd', [1, 0.95, 0.85]);
    light(0, D * 0.4, RH - 0.5, 9, [1.8, 1.5, 1.1]); light(cm, cd, 2.4, 7, [1.6, 1.2, 0.8]);
  },

  /* ---- fresh market: tilted produce crates, hanging bananas, a scale, a cold case ---- */
  grocer(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const fruit = [[0.7, 0.08, 0.05], [0.9, 0.55, 0.05], [0.85, 0.8, 0.15], [0.25, 0.5, 0.1], [0.4, 0.1, 0.3], [0.5, 0.35, 0.15], [0.12, 0.2, 0.06]];
    const crateRow = (a, d0, d1, face) => {   // stepped display of crates leaning toward the aisle
      for (let dd = d0; dd < d1 - 0.3; dd += 0.62) for (let t = 0; t < 2; t++) {
        const y = 0.45 + t * 0.42, ao = a - face * t * 0.32, c = pk(fruit);
        K.box(ao, dd, y, 0.5, 0.58, 0.2, [0.45, 0.32, 0.18], 0, 13, 0, 0, face * 0.25);
        for (let k = 0; k < 9; k++) K.sph(ao + rr(-0.18, 0.18), dd + rr(-0.22, 0.22), y + 0.12 + rr(0, 0.05), rr(0.035, 0.055), R() < 0.12 ? [0.15, 0.12, 0.05] : c, 0, 15, 6);
      }
      K.box(a, (d0 + d1) / 2, 0.22, 0.9, d1 - d0, 0.44, [0.3, 0.22, 0.12], 0, 13); Sl(a - 0.45, a + 0.45, d0, d1, 0, 1.1);
    };
    crateRow(-W / 2 + 0.6, 1.5, D - 1.2, 1); crateRow(W / 2 - 0.6, 3.0, D - 1.2, -1);
    crateRow(-0.6, 2.6, D - 2.4, -1); crateRow(0.6, 2.6, D - 2.4, 1);
    for (let k = 0; k < 3; k++) { const a = -1.5 + k * 1.5; K.cyl(a, D - 0.6, 2.7, 0.01, 0.8, [0.2, 0.2, 0.2], 0, 4, 4); for (let j = 0; j < 6; j++) K.cyl(a + rr(-0.08, 0.08), D - 0.6 + rr(-0.08, 0.08), 2.2 + rr(-0.1, 0.1), 0.025, 0.2, [0.85, 0.7, 0.1], 0, 15, 5, rr(-0.5, 0.5)); }
    K.box(0, D - 0.45, 0.5, W - 1, 0.8, 1.0, [0.8, 0.82, 0.84], 0, 4); K.box(0, D - 0.45, 1.05, W - 1.1, 0.7, 0.05, [0.4, 0.6, 0.7], 0.6, 10); Sl(-(W - 1) / 2, (W - 1) / 2, D - 0.9, D, 0, 1.1);   // cold case
    for (let a = -W / 2 + 0.8; a < W / 2 - 0.8; a += 0.3) K.pack(a, D - 0.45, 0.9, 0.22, 0.4, 0.12);
    const ca = W / 2 - 1.3; K.rb(ca, 1.6, 0.5, 1.2, 0.6, 1.0, 0.03, [0.3, 0.2, 0.1], 0, 13); Sl(ca - 0.6, ca + 0.6, 1.3, 1.9, 0, 1.05);
    K.box(ca - 0.2, 1.6, 1.08, 0.35, 0.3, 0.12, [0.8, 0.8, 0.8], 0, 4); K.lat(ca - 0.2, 1.6, 1.14, [[0.14, 0], [0.16, 0.03]], [0.75, 0.75, 0.78], 0, 4, 12);   // scale
    for (let i = 0; i < 8; i++) K.sph(rr(-2, 2), rr(1.5, D - 1.5), 0.04, 0.045, [0.2, 0.12, 0.05], 0, 15, 6);   // rotten fruit on the floor
    for (const a of [-2.2, 0, 2.2]) K.fluor(a, D / 2, D - 1.4, 'd', [0.95, 1, 0.9]);
    light(0, D * 0.4, RH - 0.5, 9, [1.4, 1.6, 1.3]); light(0, D * 0.8, RH - 0.5, 8, [1.3, 1.4, 1.2]);
  },

  /* ---- herbalist: a wall of little drawers, jars of roots and powders, dried bundles overhead ---- */
  herbal(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const wood = [0.25, 0.13, 0.06];
    K.box(0, D - 0.3, 1.3, W - 0.6, 0.5, 2.6, wood, 0, 13); Sl(-(W - 0.6) / 2, (W - 0.6) / 2, D - 0.55, D, 0, 2.6);
    for (let a = -W / 2 + 0.55; a < W / 2 - 0.5; a += 0.32) for (let y = 0.25; y < 2.5; y += 0.26) { K.box(a, D - 0.56, y, 0.28, 0.02, 0.22, [0.3, 0.17, 0.08], 0, 13); K.box(a, D - 0.58, y, 0.05, 0.02, 0.02, [0.7, 0.55, 0.2], 0, 4); if (R() < 0.3) K.box(a, D - 0.575, y + 0.07, 0.14, 0.005, 0.05, [0.85, 0.8, 0.65], 0, 15); }
    for (const s of [-1, 1]) { const a = s * (W / 2 - 0.3);
      for (const y of [0.9, 1.4, 1.9, 2.4]) { K.box(a, D / 2 - 0.6, y, 0.4, D - 3.4, 0.03, wood, 0, 13);
        for (let dd = 1.6; dd < D - 1.9; dd += 0.2) { const h = rr(0.16, 0.26); K.lat(a, dd, y + 0.015, [[0.06, 0], [0.065, h * 0.85], [0.04, h * 0.9], [0.045, h]], [0.55, 0.6, 0.55], 0.05, 10, 8); K.cyl(a, dd, y + h * 0.35, 0.05, h * 0.6, pk([[0.45, 0.3, 0.1], [0.3, 0.35, 0.1], [0.6, 0.15, 0.05], [0.7, 0.6, 0.4]]), 0, 15, 6); } }
      Sl(a - 0.22, a + 0.22, 1.3, D - 1.8, 0, 2.5); }
    const cd = D - 2.2; K.rb(0, cd, 0.5, W - 3.4, 0.7, 1.0, 0.04, wood, 0, 13); K.box(0, cd, 1.02, W - 3.3, 0.8, 0.04, [0.2, 0.1, 0.05], 0, 13); Sl(-(W - 3.4) / 2, (W - 3.4) / 2, cd - 0.35, cd + 0.35, 0, 1.05);
    K.box(-1, cd, 1.1, 0.4, 0.3, 0.1, [0.6, 0.5, 0.2], 0, 4); for (const o of [-0.15, 0.15]) K.lat(-1 + o, cd, 1.25, [[0.1, 0], [0.12, 0.03]], [0.7, 0.55, 0.2], 0, 4, 10);
    for (let k = 0; k < 5; k++) K.lat(0.3 + k * 0.25, cd + rr(-0.1, 0.1), 1.04, [[0.07, 0], [0.08, 0.06], [0.05, 0.07]], [0.3, 0.2, 0.12], 0, 15, 8);
    for (let a = -W / 2 + 1; a < W / 2 - 0.8; a += 0.6) for (let dd = 1.5; dd < D - 2.6; dd += 1.2) { K.cyl(a, dd, RH - 0.35, 0.005, 0.5, [0.2, 0.15, 0.1], 0, 4, 4); K.blob(a, dd, RH - 0.8, 0.1, 0.22, 0.1, pk([[0.3, 0.3, 0.1], [0.25, 0.2, 0.08], [0.35, 0.28, 0.12]])); }
    K.lat(W / 2 - 1.1, 1.3, 0, [[0.3, 0], [0.35, 0.6], [0.3, 0.7], [0.12, 0.8]], [0.35, 0.25, 0.15], 0, 16, 12); K.sph(W / 2 - 1.1, 1.3, 0.85, 0.08, T.glow, 2, 0, 6); Sl(W / 2 - 1.45, W / 2 - 0.75, 0.95, 1.65, 0, 0.8);
    for (const a of [-2, 0, 2]) { K.cyl(a, D / 2, RH - 0.9, 0.2, 0.35, [1, 0.35, 0.1], 1.4, 15, 10); halo(a, D / 2, RH - 0.9, 1.1, [0.45, 0.2, 0.05]); }
    light(0, D * 0.45, RH - 1, 8, [1.9, 1.1, 0.5]); light(0, cd, 2.2, 6, [1.5, 0.9, 0.45]);
  },

  /* ---- hardware store: paint cans, pegboards of tools, a lumber rack, a ladder ---- */
  hardware(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    const paint = (a, dd, y, clear, ax) => { if (R() < 0.12) return; if (R() < 0.6) K.cyl(a, dd, y + 0.1, 0.085, 0.2, pk([[0.8, 0.8, 0.78], [0.7, 0.1, 0.08], [0.1, 0.3, 0.7], [0.9, 0.7, 0.1], [0.15, 0.45, 0.2]]), 0, 4, 10); else K.pack(a, dd, y, ax === 'a' ? 0.18 : 0.14, ax === 'a' ? 0.14 : 0.18, rr(0.1, 0.25)); };
    K.shelf(-W / 2 + 0.35, 1.8 + (D - 3) / 2, D - 3, 0.55, 2.3, 5, 'd', paint);
    for (const s of [-1, 1]) K.shelf(s * 1.6, 2.6 + (D - 4.8) / 2, D - 4.8, 0.8, 1.6, 4, 'd', paint, true, [0.5, 0.35, 0.1]);
    const pa = W / 2 - 0.05; K.box(pa, D / 2 - 0.2, 1.5, 0.03, D - 3.5, 2.0, [0.6, 0.5, 0.35], 0, 13);   // pegboard of tools
    for (let dd = 1.7; dd < D - 2; dd += 0.28) for (let y = 0.8; y < 2.4; y += 0.4) { const kind = Math.floor(R() * 3);
      if (kind === 0) { K.box(pa - 0.06, dd, y, 0.03, 0.03, 0.3, [0.6, 0.35, 0.1], 0, 13); K.box(pa - 0.06, dd, y + 0.16, 0.05, 0.12, 0.05, [0.4, 0.4, 0.42], 0, 4); }
      else if (kind === 1) K.box(pa - 0.05, dd, y, 0.02, 0.05, 0.25, [0.7, 0.7, 0.72], 0, 4);
      else K.pack(pa - 0.08, dd, y - 0.15, 0.06, 0.2, 0.28); }
    Sl(pa - 0.25, W / 2, 1.6, D - 2, 0, 2.5);
    for (let k = 0; k < 10; k++) K.box(rr(-0.5, 0.5), D - 0.35, 1.4 + k * 0.03, 3.2, 0.09, 0.04, [0.55, 0.42, 0.25], 0, 13, 0, 0, rr(-0.03, 0.03));   // lumber rack
    for (const a of [-1.6, 1.6]) K.box(a, D - 0.3, 1.1, 0.06, 0.5, 2.2, [0.3, 0.3, 0.32], 0, 4); Sl(-1.8, 1.8, D - 0.6, D, 0, 2.2);
    for (const s of [-1, 1]) K.box(W / 2 - 1.4 + s * 0.22, 1.9, 1.1, 0.05, 0.05, 2.3, [0.75, 0.6, 0.2], 0, 4, 0, 0.3); for (let y = 0.3; y < 2.1; y += 0.3) K.box(W / 2 - 1.4, 1.9 - (y - 1.1) * 0.3, y, 0.44, 0.04, 0.04, [0.75, 0.6, 0.2], 0, 4);   // ladder
    const ca = 0; K.rb(ca, 1.3, 0.5, 2.2, 0.6, 1.0, 0.03, [0.2, 0.2, 0.22], 0, 15); Sl(ca - 1.1, ca + 1.1, 1.0, 1.6, 0, 1.05);
    for (const a of [-2.2, 0, 2.2]) K.fluor(a, D / 2, D - 1.2, 'd');
    light(0, D * 0.4, RH - 0.5, 9, [1.5, 1.45, 1.3]); light(0, D * 0.8, RH - 0.5, 8, [1.4, 1.35, 1.2]);
  },

  /* ---- gas-station kiosk: drinks coolers, a snack rack, a coffee counter ---- */
  kiosk(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L;
    for (let i = 0; i < 3; i++) { const a = -W / 2 + 1.1 + i * 1.2;
      K.box(a, D - 0.4, 1.1, 1.15, 0.7, 2.2, [0.15, 0.15, 0.16], 0, 4); K.box(a, D - 0.74, 1.1, 1.02, 0.02, 1.95, [0.75, 0.88, 1], 1.5, 0);
      for (let y = 0.3; y < 2; y += 0.42) for (let k = 0; k < 4; k++) R() < 0.5 ? K.bottle(a - 0.42 + k * 0.28, D - 0.55, y, 0.28, pk(PK), 0.3) : K.can(a - 0.42 + k * 0.28, D - 0.55, y, 0.13); }
    Sl(-W / 2, -W / 2 + 3.8, D - 0.8, D, 0, 2.3);
    K.shelf(-W / 2 + 0.3, 1.3, 1.6, 0.45, 1.5, 4, 'd', (a, dd, y) => { if (R() < 0.85) K.pack(a, dd, y, 0.12, 0.16, rr(0.12, 0.22)); });
    const ca = W / 2 - 1.2; K.rb(ca, 1.5, 0.5, 1.6, 1.2, 1.0, 0.03, [0.7, 0.7, 0.68], 0, 15); Sl(ca - 0.8, ca + 0.8, 0.9, 2.1, 0, 1.05);
    K.box(ca + 0.3, 1.5, 1.2, 0.35, 0.3, 0.35, [0.12, 0.12, 0.13], 0, 4); K.box(ca + 0.3, 1.34, 1.3, 0.2, 0.01, 0.08, [1, 0.4, 0.1], 1.4, 0);
    K.screen(ca - 0.4, 1.7, 1.25, 0.26, 0.18, [0.3, 1, 0.6], 0, 1.2);
    for (let k = 0; k < 4; k++) K.cup(ca + rr(-0.6, 0.6), 1.2 + rr(-0.3, 0.3), 1.0, 0.1);
    K.fluor(0, D / 2, W - 1, 'a'); light(0, D / 2, RH - 0.4, 7, [1.4, 1.6, 1.5]);
  },

  /* ---- tattoo parlour: a chair and lamp, walls of flash art, a mirror and binders ---- */
  tattoo(L, T, K, rr, pk, PK) {
    const { W, D, RH, Sl, light, halo, R } = L, cd = D / 2 + 0.5;
    K.rb(0.6, cd, 0.55, 0.7, 1.9, 0.18, 0.08, [0.08, 0.08, 0.09], 0, 15); K.rb(0.6, cd + 0.9, 0.85, 0.66, 0.2, 0.6, 0.08, [0.08, 0.08, 0.09], 0, 15, 0, -0.3); K.cyl(0.6, cd, 0.25, 0.12, 0.5, [0.6, 0.6, 0.62], 0, 4, 10); Sl(0.25, 0.95, cd - 0.95, cd + 1.05, 0, 0.7);
    K.stool(-0.3, cd - 0.3, 0.55, [0.08, 0.08, 0.09]);
    K.tube(-0.7, cd + 0.6, 0, -0.7, cd + 0.6, 1.8, 0.02, [0.5, 0.5, 0.52]); K.tube(-0.7, cd + 0.6, 1.8, 0.2, cd, 1.6, 0.018, [0.5, 0.5, 0.52]); K.lat(0.2, cd, 1.45, [[0.02, 0.15], [0.16, 0], [0.14, 0]], [0.1, 0.1, 0.1], 0, 4, 10); K.sph(0.2, cd, 1.5, 0.05, [1, 0.95, 0.85], 4, 0, 6);
    K.box(-0.6, cd - 0.9, 0.45, 0.5, 0.4, 0.9, [0.6, 0.6, 0.62], 0, 4); for (let k = 0; k < 5; k++) K.cyl(-0.75 + k * 0.07, cd - 0.9, 0.93, 0.015, 0.06, pk([[0.1, 0.1, 0.1], [0.8, 0.1, 0.1], [0.1, 0.3, 0.8], [0.1, 0.6, 0.2]]), 0, 10, 6);
    for (const s of [-1, 1]) { const a = s * (W / 2 - 0.03);   // flash art
      for (let dd = 1.4; dd < D - 0.6; dd += 0.5) for (let y = 1.0; y < 2.9; y += 0.55) { K.box(a, dd, y, 0.02, 0.42, 0.48, [0.08, 0.06, 0.05], 0, 13); K.box(a - s * 0.012, dd, y, 0.005, 0.36, 0.42, pk([[0.9, 0.85, 0.75], [0.85, 0.3, 0.3], [0.3, 0.5, 0.8], [0.9, 0.7, 0.3]]), 0.35, 0); } }
    K.box(-W / 2 + 1.5, D - 0.05, 1.6, 1.2, 0.02, 1.6, [0.6, 0.62, 0.65], 0, 10);
    const ca = -W / 2 + 1.6; K.rb(ca, 1.8, 0.5, 1.6, 0.6, 1.0, 0.03, [0.12, 0.08, 0.06], 0, 13); Sl(ca - 0.8, ca + 0.8, 1.5, 2.1, 0, 1.05);
    for (let k = 0; k < 4; k++) K.rb(ca - 0.5 + k * 0.3, 1.8, 1.05, 0.26, 0.34, 0.06, 0.01, pk(PK), 0, 15, rr(-0.3, 0.3));
    K.box(0, D - 0.05, 2.9, 2.2, 0.03, 0.5, T.glow, 2.4, 0);
    K.plant(W / 2 - 0.6, 0.6, 1.1);
    light(0.4, cd, 2.2, 8, [2.1, 1.7, 1.4]); light(0, 2, 2.8, 8, [T.glow[0] * 1.8, T.glow[1] * 1.8, T.glow[2] * 1.8]); for (const a of [-2, 2]) K.pendant(a, D / 2 - 1, 2.3, [1, 0.8, 0.6]);
  },
};
function g_ring(K, a, dd, y) { K.cyl(a, dd, y, 0.14, 0.03, [0.08, 0.08, 0.09], 0, 15, 10); }
