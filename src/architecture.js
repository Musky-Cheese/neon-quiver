/* ============================================================
   NEON QUIVER — hand-built architecture
   The curved Japanese roof (irimoya hip-and-gable or a plain gable, kawara tiles, upswept corners, rafter tails, round
   tile ends), and the Sakura Gardens manor, its compound wall and gate built on it.
   ============================================================ */

const KAWARA = [0.105, 0.11, 0.122];    // ibushi-gawara: smoke-fired clay tile, silver grey (mat 28)
const SOFFIT = [0.075, 0.048, 0.032];   // the boards under the eaves
const TIMBER = [0.1, 0.062, 0.04];      // posts, beams, brackets
const PLASTER = [0.6, 0.57, 0.51];      // white lime plaster
const AGED = [0.2, 0.14, 0.09];         // weathered bargeboards and fascias

/* A Japanese roof in its own frame: x along the ridge, z across it, centred on (cx, cz), turned by ry (0 or a quarter
   turn). Every point's height comes from one function of its distance d in from the nearest eave, so the faces meet
   exactly along the hips:
     h(d) = ye + H (a t + (1 - a) t^2),  t = d / hz     (shallow at the eave, steepening toward the ridge: the sori curve)
   plus a lift that sweeps the eaves up toward each corner. Ds > 0 makes an irimoya: hip faces on the ends up to depth Ds,
   then a vertical gable (tsuma) set back under the long faces, which overhang it by og. Ds = 0 is a plain gable.
   o: { cx, cz, ry, hx, hz, ye, H, a, Ds, og, L, E, th, tile, ridge, discs, rafters, tsuma, oni, oniH } */
function jRoof(g, o) {
  const { cx, cz, hx, hz, ye, H } = o, ry = o.ry || 0, a = o.a ?? 0.4, Ds = o.Ds || 0, og = o.og ?? 0.6, L = o.L ?? 0.5, E = o.E ?? 4,
    th = o.th ?? 0.22, tile = o.tile || KAWARA, mat = 28;
  const cr = Math.cos(ry), sr = Math.sin(ry);
  const W = (x, z) => [cx + cr * x + sr * z, cz - sr * x + cr * z], WV = (x, z) => [cr * x + sr * z, -sr * x + cr * z];
  const prof = (d) => { const t = Math.min(1, Math.max(0, d / hz)); return H * (a * t + (1 - a) * t * t); };
  const lift = (e) => { const k = Math.max(0, 1 - e / E); return L * k * k; };
  // face height functions in the local frame: long faces (+-z) and hip ends (+-x)
  const hLong = (x, z) => { const d = hz - Math.abs(z); return ye + prof(d) + lift(hx - Math.abs(x) + d); };
  const hHip = (x, z) => { const d = hx - Math.abs(x); return ye + prof(d) + lift(d + hz - Math.abs(z)); };
  const nrm = (f, x, z) => { const e = 0.01, gx = (f(x + e, z) - f(x - e, z)) / (2 * e), gz = (f(x, z + e) - f(x, z - e)) / (2 * e), [wx, wz] = WV(-gx, -gz), l = Math.hypot(wx, 1, wz); return [wx / l, 1 / l, wz / l]; };
  const i0 = g.i.length;
  const V = (x, y, z, n, c, m) => { const [wx, wz] = W(x, z); return g._vert(null, wx, y, wz, n[0], n[1], n[2], c, 0, m); };
  // a patch of roof: P(s, t) -> local [x, z] for s, t in [0, 1]; top tiles and the soffit boards th below, facing down
  const patch = (P, f, ns, nt) => {
    for (const under of [false, true]) {
      const b0 = g.n;
      for (let j = 0; j <= nt; j++) for (let i = 0; i <= ns; i++) {
        const [x, z] = P(i / ns, j / nt), n = nrm(f, x, z), y = f(x, z);
        if (under) V(x, y - th, z, [-n[0], -n[1], -n[2]], SOFFIT, 13); else V(x, y, z, n, tile, mat);
      }
      for (let j = 0; j < nt; j++) for (let i = 0; i < ns; i++) { const p = b0 + j * (ns + 1) + i, q = p + ns + 1; g.i.push(p, p + 1, q + 1, p, q + 1, q); }
    }
  };
  // a fascia along an exposed edge (list of local [x, z] on the roof): from the tiles down by depth, facing outward
  const fascia = (pts, f, depth, col, out) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], [nx, nz] = WV(out[0], out[1]);
      const y0 = f(x0, z0), y1 = f(x1, z1), n = [nx, 0, nz], b = g.n;
      V(x0, y0 + 0.02, z0, n, col, 13); V(x1, y1 + 0.02, z1, n, col, 13); V(x1, y1 - depth, z1, n, col, 13); V(x0, y0 - depth, z0, n, col, 13);
      g.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  const seq = (n, fn) => { const r = []; for (let k = 0; k <= n; k++) r.push(fn(k / n)); return r; };
  const xs = hx - Ds, xg = Ds > 0 ? xs + og : hx;            // where the hip skirt ends, and how far the long faces reach
  const nS = (len) => Math.max(4, Math.ceil(len / 0.9)), nD = (len) => Math.max(3, Math.ceil(len / 0.32));
  for (const sz of [-1, 1]) {
    if (Ds > 0) {
      patch((s, t) => { const d = t * Ds; return [(s * 2 - 1) * (hx - d), sz * (hz - d)]; }, hLong, nS(2 * hx), nD(Ds));                 // long face, eave to skirt top
      patch((s, t) => { const d = Ds + t * (hz - Ds); return [(s * 2 - 1) * xs, sz * (hz - d)]; }, hLong, nS(2 * hx), nD(hz - Ds));      // and on up to the ridge
      for (const sx of [-1, 1]) patch((s, t) => { const d = Ds + t * (hz - Ds); return [sx * (xs + s * og), sz * (hz - d)]; }, hLong, 2, nD(hz - Ds));   // over the gable
    } else patch((s, t) => [(s * 2 - 1) * hx, sz * hz * (1 - t)], hLong, nS(2 * hx), nD(hz));
  }
  if (Ds > 0) for (const sx of [-1, 1]) patch((s, t) => { const d = t * Ds; return [sx * (hx - d), (s * 2 - 1) * (hz - d)]; }, hHip, nS(2 * hz), nD(Ds));
  // fascias: every eave, the gable edges, and the underside of the overhang where it clears the skirt
  for (const sz of [-1, 1]) fascia(seq(nS(2 * hx), (s) => [(s * 2 - 1) * hx, sz * hz]), hLong, th + 0.06, AGED, [0, sz]);
  if (Ds > 0) for (const sx of [-1, 1]) {
    fascia(seq(nS(2 * hz), (s) => [sx * hx, (s * 2 - 1) * hz]), hHip, th + 0.06, AGED, [sx, 0]);
    for (const sz of [-1, 1]) fascia(seq(2, (s) => [sx * (xs + s * og), sz * (hz - Ds)]), hLong, th, AGED, [0, sz]);
  }
  // bargeboards (hafu) down both slopes of each gable, deeper than the eave fascia
  for (const sx of [-1, 1]) fascia(seq(nD(hz - Ds) * 2, (s) => [sx * xg, (s * 2 - 1) * (hz - Ds)]), hLong, th + 0.32, AGED, [sx, 0]);
  // the gable walls themselves: white plaster between dark timbers, set back under the overhang
  if (Ds > 0 && o.tsuma !== false) for (const sx of [-1, 1]) {
    const x = sx * xs, n = WV(sx, 0), zs = seq(16, (s) => (s * 2 - 1) * (hz - Ds)), bot = (z) => hHip(x, z) - 0.05, top = (z) => hLong(x, z) - th;
    for (let k = 0; k < zs.length - 1; k++) { const b = g.n, z0 = zs[k], z1 = zs[k + 1];
      V(x, bot(z0), z0, [n[0], 0, n[1]], PLASTER, 20); V(x, bot(z1), z1, [n[0], 0, n[1]], PLASTER, 20); V(x, top(z1), z1, [n[0], 0, n[1]], PLASTER, 20); V(x, top(z0), z0, [n[0], 0, n[1]], PLASTER, 20);
      g.i.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const beam = (z0, y0, z1, y1, w) => { const [ax, az] = W(x + sx * 0.06, z0), [bx, bz] = W(x + sx * 0.06, z1); g.box(M4.align(PM.c, ax, y0, az, bx, y1, bz, w, w, 0, 1, 0), TIMBER, 0, 13); };
    const yb = bot(0) + 0.12; beam(-(hz - Ds), yb, hz - Ds, yb, 0.16);                                 // tie beam along the foot
    for (const zf of [-0.5, 0, 0.5]) { const z = zf * (hz - Ds); beam(z, yb, z, top(z) - 0.02, 0.13); }   // struts up to the ridge
    // gegyo: a pendant board under the apex, gilt-capped
    const [gx, gz] = W(sx * (xg + 0.1), 0), ga = hLong(sx * xg, 0) - th - 0.3;
    g.rbox(M4.trs(PM.c, gx, ga, gz, 0, ry + Math.PI / 2, 0, 1, 1, 1), 0.9, 0.5, 0.08, 0.04, AGED, 0, 13, 2);
    g.cyl(M4.align(PM.c, gx, ga, gz, gx + n[0] * 0.07, ga, gz + n[1] * 0.07, 0.26, 0.26, 0, 1, 0), [0.55, 0.4, 0.14], 0, 4, 10);
  }
  // round tile ends (tomoe-gawara) along every eave, lined up with the cover-tile rows the shader paints
  if (o.discs !== false) {
    const P = 0.3, dr = o.discR || 0.17, row = (f, ax, len, fixed, sAxis, out) => {   // sAxis 'x': points (u, fixed); 'z': (fixed, u)
      const [ox, oz] = WV(out[0], out[1]), tA = [-oz, ox], c0 = W(sAxis === 'x' ? 0 : fixed, sAxis === 'x' ? fixed : 0), dir = WV(sAxis === 'x' ? 1 : 0, sAxis === 'x' ? 0 : 1);
      const du = dir[0] * tA[0] + dir[1] * tA[1], u0 = c0[0] * tA[0] + c0[1] * tA[1];   // world u = u0 + du * s along the edge
      for (let k = Math.ceil((u0 - Math.abs(du) * len) / P - 0.5); (k + 0.5) * P <= u0 + Math.abs(du) * len; k++) {
        const s = ((k + 0.5) * P - u0) / du; if (Math.abs(s) > len - 0.12) continue;
        const lx = sAxis === 'x' ? s : fixed, lz = sAxis === 'x' ? fixed : s, y = f(lx, lz) - 0.07, [px, pz] = W(lx, lz);
        g.cyl(M4.align(PM.c, px - ox * 0.02, y - 0.012, pz - oz * 0.02, px + ox * 0.07, y - 0.03, pz + oz * 0.07, dr, dr, 0, 1, 0), tile, 0, 0, 8);
      }
    };
    for (const sz of [-1, 1]) row(hLong, 0, hx, sz * (hz + 0.005), 'x', [0, sz]);
    if (Ds > 0) for (const sx of [-1, 1]) row(hHip, 0, hz, sx * (hx + 0.005), 'z', [sx, 0]);
  }
  // rafter tails under the eaves, square-cut, clear of the corners where the fan would cross the next face
  if (o.rafters !== false) {
    const rf = (f, Pt, n) => { for (let k = 0; k <= n; k++) { const s = k / n, [x0, z0] = Pt(s, 0.04), [x1, z1] = Pt(s, 1.5);
      const [ax, az] = W(x0, z0), [bx, bz] = W(x1, z1); g.box(M4.align(PM.c, ax, f(x0, z0) - th - 0.06, az, bx, f(x1, z1) - th - 0.06, bz, 0.1, 0.12, 0, 1, 0), TIMBER, 0, 13); } };
    for (const sz of [-1, 1]) { const span = hx - 1.9, n = Math.floor(2 * span / 0.5); rf(hLong, (s, d) => [(s * 2 - 1) * span, sz * (hz - d)], n); }
    if (Ds > 0) for (const sx of [-1, 1]) { const span = hz - 1.9, n = Math.floor(2 * span / 0.5); if (n > 0) rf(hHip, (s, d) => [sx * (hx - d), (s * 2 - 1) * span], n); }
  }
  g._fixWinding(i0);
  // ridges: the main ridge (stacked noshi tiles under a round cap), the hips, and the descending ridges down the gables
  const rw = o.ridge || 0.6, yr = ye + H + lift(hx - xg + hz);
  { const [ax, az] = W(-xg - 0.05, 0), [bx, bz] = W(xg + 0.05, 0);
    g.box(M4.align(PM.c, ax, yr + rw * 0.28, az, bx, yr + rw * 0.28, bz, rw * 0.9, rw * 0.8, 0, 1, 0), tile, 0, mat);
    g.cyl(M4.align(PM.c, ax, yr + rw * 0.68, az, bx, yr + rw * 0.68, bz, rw * 0.62, rw * 0.62, 0, 1, 0), tile, 0, 0, 10, 0.5, 0.5, true); }
  const ridgeLine = (pts, r) => g.tube(pts.map(([x, z, y]) => { const [wx, wz] = W(x, z); return [wx, y + r * 0.6, wz]; }), pts.map(() => r), tile, 0, 0, 7, true);
  if (Ds > 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) ridgeLine(seq(10, (s) => { const d = 0.12 + s * (Ds - 0.12); return [sx * (hx - d), sz * (hz - d), hLong(sx * (hx - d), sz * (hz - d))]; }), rw * 0.32);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ridgeLine(seq(10, (s) => { const z = sz * s * (hz - Ds - 0.15), x = sx * (xg - 0.22); return [x, z, hLong(x, z)]; }), rw * 0.28);
  // onigawara (Meshy): the demon-face tiles that cap each ridge end
  if (o.oni === true) {   // off: no onigawara model ships
    const oh = o.oniH || rw * 1.9, put = (x, z, y, yaw, h) => { const [wx, wz] = W(x, z); propSpot('onigawara', wx, wz, yaw + ry, h, 0, 1, y); };
    for (const sx of [-1, 1]) put(sx * (xg + 0.02), 0, yr - 0.05, sx > 0 ? Math.PI / 2 : -Math.PI / 2, oh);
    if (Ds > 0) for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(sx * (hx - 0.3), sz * (hz - 0.3), hLong(sx * (hx - 0.3), sz * (hz - 0.3)) + 0.05, Math.atan2(sx, sz), oh * 0.55);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const z = sz * (hz - Ds - 0.15), x = sx * (xg - 0.22); put(x, z, hLong(x, z) + 0.05, sz > 0 ? 0 : Math.PI, oh * 0.45); }
  }
  return { hLong, hHip, yr };
}

/* ---------- Japanese manor: cut-stone platform, engawa veranda, shoji hall, irimoya roof ---------- */
function propManor(g, x, z, solid) {
  const R = mulberry(219), stone = [0.25, 0.245, 0.23], wood = [0.17, 0.11, 0.065], dark = TIMBER, shoji = [1.0, 0.82, 0.58];
  const B = (bx, by, bz, sx, sy, sz, c, e, mat) => g.box(M4.trs(PM.a, x + bx, by, z + bz, 0, 0, 0, sx, sy, sz), c, e, mat);
  const RB = (bx, by, bz, sx, sy, sz, c, mat = 13, r = 0.02) => g.rbox(pT(PM.a, x + bx, by, z + bz), sx, sy, sz, r, c, 0, mat, 1);
  const tone = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  // ---- the platform (kidan): a core faced with two courses of cut stone and a capstone lip, every block its own shade ----
  B(0, 0.55, 0, 19.9, 1.1, 11.9, tone(stone, 0.8), 0, 16); solid(x - 10, x + 10, 0, 1.15, z - 6, z + 6);
  const course = (y0, y1, out, lip) => {
    for (const [ax, sx, sz, len] of [['x', 0, -1, 20], ['x', 0, 1, 20], ['z', -1, 0, 12], ['z', 1, 0, 12]]) {
      let a = -len / 2;
      while (a < len / 2 - 0.05) {
        const bl = Math.min(len / 2 - a, 0.9 + R() * 0.8), mid = a + bl / 2, c = tone(stone, 0.82 + R() * 0.32);
        if (ax === 'x') B(mid, (y0 + y1) / 2, sz * (6 + out / 2), bl - 0.035, y1 - y0 - 0.03, lip, c, 0, 16);
        else B(sx * (10 + out / 2), (y0 + y1) / 2, mid, lip, y1 - y0 - 0.03, bl - 0.035, c, 0, 16);
        a += bl;
      }
    }
  };
  course(0, 0.5, 0.08, 0.12); course(0.5, 0.97, 0.06, 0.1); course(0.97, 1.13, 0.1, 0.24);
  // steps up to the open front, each under the 0.32 m you can walk up, slabs with a nosing
  for (let i = 0; i < 3; i++) { const h = 0.29 * (i + 1), d = 0.45, zz = -6 - (2.5 - i) * d; B(0, h / 2, zz, 5, h, d, tone(stone, 0.9 + i * 0.05), 0, 16); B(0, h - 0.04, zz - 0.03, 5.1, 0.08, d + 0.06, tone(stone, 1.05), 0, 16); solid(x - 2.5, x + 2.5, 0, h, z - 6 - (3 - i) * d, z - 6 - (2 - i) * d); }
  // ---- engawa: a deck of long boards with a dark edge beam ----
  for (let k = 0; k < 55; k++) { const bz = -5.5 + 0.1 + k * 0.2; B(0, 1.09, bz, 18, 0.14, 0.188, tone(wood, 0.85 + R() * 0.3), 0, 13); }
  for (const s of [-1, 1]) { B(0, 1.02, s * 5.5, 18.1, 0.2, 0.14, dark, 0, 13); B(s * 9.0, 1.02, 0, 0.14, 0.2, 11, dark, 0, 13); }
  // ---- veranda posts on bracket blocks, a tie beam (nuki) and the eave beam (keta) they carry ----
  const posts = [];
  for (let px = -8.6; px <= 8.61; px += 2.15) for (const pz of [-5.2, 5.2]) posts.push([px, pz]);
  for (let pz = -3.1; pz <= 3.11; pz += 2.07) for (const px of [-8.6, 8.6]) posts.push([px, pz]);
  for (const [px, pz] of posts) {
    RB(px, 2.965, pz, 0.26, 3.61, 0.26, dark);
    RB(px, 4.86, pz, 0.42, 0.18, 0.42, dark, 13, 0.03);                                     // masu block
    const alongX = Math.abs(pz) > 5;
    RB(px, 4.86, pz, alongX ? 1.3 : 0.16, 0.14, alongX ? 0.16 : 1.3, tone(dark, 1.15), 13, 0.03);   // hijiki bracket arm
  }
  for (const s of [-1, 1]) {
    RB(0, 5.07, s * 5.2, 17.6, 0.25, 0.28, dark); RB(s * 8.6, 5.07, 0, 0.28, 0.25, 10.7, dark);   // keta
    RB(0, 4.3, s * 5.2, 17.4, 0.2, 0.12, dark); RB(s * 8.6, 4.3, 0, 0.12, 0.2, 10.6, dark);       // nuki
  }
  // ---- the hall: kick panel, shoji with real kumiko lattice, nageshi beam, glowing ranma transom, plaster up to the roof ----
  const bay = (px, pz, w, alongX, open) => {
    const P = (a, y, sa, sy, so, c, e = 0, mat = 13) => B(alongX ? px + a : px, y, alongX ? pz : pz + a, alongX ? sa : so, sy, alongX ? so : sa, c, e, mat);
    if (open) return;
    P(0, 1.39, w, 0.46, 0.09, tone(wood, 0.7));                                              // koshi-ita
    P(0, 2.585, w - 0.06, 1.93, 0.035, tone(shoji, 0.92 + R() * 0.1), 0.9, 0);               // paper, lit from inside
    for (const s of [-1, 1]) P(s * (w / 2 - 0.05), 2.585, 0.07, 1.95, 0.09, dark);          // stiles
    for (const y of [1.65, 3.52]) P(0, y, w, 0.07, 0.09, dark);                             // rails
    for (let k = 1; k < 4; k++) P(-w / 2 + w * k / 4, 2.585, 0.025, 1.9, 0.07, dark);     // kumiko
    for (let k = 1; k < 6; k++) P(0, 1.65 + 1.87 * k / 6, w - 0.1, 0.025, 0.07, dark);
  };
  const wall = (cx, cz, len, alongX, door) => {
    const n = Math.round(len / 1.8), step = len / n;
    for (let i = 0; i < n; i++) { const o = -len / 2 + step * (i + 0.5); bay(alongX ? cx + o : cx, alongX ? cz : cz + o, step - 0.22, alongX, door && Math.abs(o) < 1.5); }
    for (let i = 0; i <= n; i++) { const o = -len / 2 + step * i; if (door && Math.abs(o) < 1) continue; RB(alongX ? cx + o : cx, 2.86, alongX ? cz : cz + o, 0.22, 3.4, 0.22, dark); }   // hashira
    const W = (y, sy, so, c, e = 0, mat = 13) => B(cx, y, cz, alongX ? len + 0.2 : so, sy, alongX ? so : len + 0.2, c, e, mat);
    W(3.65, 0.2, 0.3, dark);                                                                   // nageshi
    W(4.02, 0.52, 0.04, tone(shoji, 0.7), 0.6, 0);                                             // ranma paper
    for (let a = -len / 2 + 0.1; a < len / 2; a += 0.2) B(alongX ? cx + a : cx, 4.02, alongX ? cz : cz + a, alongX ? 0.05 : 0.1, 0.52, alongX ? 0.1 : 0.05, dark, 0, 13);
    W(4.4, 0.24, 0.28, dark);                                                                  // head beam
    W(5.15, 1.3, 0.2, PLASTER, 0, 20);                                                         // kokabe
  };
  wall(0, -4, 15, true, true); wall(0, 4, 15, true, false); wall(-7.5, 0, 8, false, false); wall(7.5, 0, 8, false, false);
  // noren over the open doorway: three indigo panels, the house crest on the middle one
  for (const k of [-1, 0, 1]) B(k * 0.98, 3.86, -4.02, 0.94, 0.95, 0.02, [0.025, 0.04, 0.1], 0, 15);
  g.cyl(M4.trs(PM.a, x, 3.9, z - 4.04, Math.PI / 2, 0, 0, 0.42, 0.01, 0.42), [0.62, 0.6, 0.55], 0, 15, 16);
  B(0, 4.33, -4.05, 3.1, 0.05, 0.05, dark, 0, 13);
  // ---- inside: ceiling with battens, tatami, low table, cushions, alcove with scroll and katana, paper lamps ----
  B(0, 4.55, 0, 15.4, 0.3, 8.4, tone(wood, 0.6), 0, 13);
  for (let k = -8; k <= 8; k++) B(0, 4.38, k * 0.45, 14.8, 0.05, 0.05, dark, 0, 13);
  // the hall is enterable: thin walls with the doorway gap
  for (const s of [-1, 1]) { solid(x + s * 1.4 - (s < 0 ? 6.1 : 0), x + s * 1.4 + (s > 0 ? 6.1 : 0), 1.15, 4.6, z - 4.1, z - 3.9); solid(x + s * 7.4, x + s * 7.6, 1.15, 4.6, z - 4.1, z + 4.1); }
  solid(x - 7.6, x + 7.6, 1.15, 4.6, z + 3.9, z + 4.1);
  for (let i = -3; i <= 3; i++) for (let k = -1; k <= 1; k++) { B(i * 2, 1.18, k * 2.5, 1.95, 0.04, 2.45, tone([0.42, 0.38, 0.2], 0.92 + R() * 0.12), 0, 13); B(i * 2, 1.17, k * 2.5, 1.97, 0.035, 2.47, [0.04, 0.035, 0.03], 0, 15); }
  B(0, 1.42, 0.6, 2.4, 0.08, 1.2, [0.08, 0.04, 0.03], 0, 13); for (const s of [-1, 1]) for (const t of [-1, 1]) B(s * 1.05, 1.3, 0.6 + t * 0.5, 0.08, 0.2, 0.08, [0.08, 0.04, 0.03], 0, 13);
  for (const [cx, cz] of [[-1.8, 0.6], [1.8, 0.6], [0, -0.4], [0, 1.6]]) g.rbox(pT(PM.a, x + cx, 1.24, z + cz), 0.6, 0.09, 0.6, 0.035, [0.45, 0.08, 0.1], 0, 15, 2);
  B(0, 2.4, 3.6, 3, 2.4, 0.5, [0.1, 0.06, 0.04], 0, 13); B(0, 2.6, 3.3, 1.6, 1.8, 0.04, [0.85, 0.8, 0.7], 0.3, 0);    // alcove with a hanging scroll
  B(0, 1.9, 3.25, 0.9, 0.05, 0.05, [0.1, 0.1, 0.1], 0, 4); B(0, 1.95, 3.2, 0.95, 0.03, 0.03, [0.8, 0.8, 0.85], 0.2, 4);  // katana on its stand
  for (const lx of [-5, 5]) { g.lathe(pT(PM.a, x + lx, 1.2, z + 2.5), [[0.05, 0], [0.18, 0.1], [0.2, 0.5], [0.16, 0.8], [0.05, 0.85]], [1, 0.7, 0.4], 1.8, 15, 10, true, true); }
  WORLD.lights.push({ p: [x, 3.4, z + 0.5], r: 10, c: [1.4, 0.95, 0.5], shop: true });
  // ---- the roof: irimoya, eaves 2 m past the posts, corners swept up ----
  jRoof(g, { cx: x, cz: z, hx: 10.6, hz: 7.2, ye: 4.75, H: 4.2, a: 0.4, Ds: 3.6, og: 0.7, L: 0.6, E: 5, th: 0.24, ridge: 0.62, oniH: 1.15 });
  // hanging lanterns from the keta, warm light spilling onto the veranda
  for (const lx of [-6, -2, 2, 6]) {
    B(lx, 4.62, -5.6, 0.02, 0.5, 0.02, [0.03, 0.03, 0.03], 0, 4);
    g.lathe(pT(PM.a, x + lx, 3.6, z - 5.6), [[0.1, 0], [0.3, 0.14], [0.32, 0.4], [0.3, 0.66], [0.1, 0.78]], [1, 0.32, 0.16], 2.6, 15, 12, true, true);
    for (const y of [3.6, 4.38]) g.cyl(M4.trs(PM.a, x + lx, y, z - 5.6, 0, 0, 0, 0.24, 0.05, 0.24), [0.05, 0.03, 0.02], 0, 13, 10);
    WORLD.halos.push({ p: [x + lx, 4.0, z - 5.6], s: 1.8, c: [0.6, 0.14, 0.06] });
  }
  WORLD.lights.push({ p: [x, 3.2, z - 7], r: 14, c: [1.9, 1.2, 0.6], shop: true }, { p: [x - 7, 3, z], r: 9, c: [1.4, 0.9, 0.45], shop: true }, { p: [x + 7, 3, z], r: 9, c: [1.4, 0.9, 0.45], shop: true });
}

// tsuiji-bei: a plastered compound wall on a cut-stone footing, dark posts through it, under its own little tiled roof
function propCompoundWall(g, x0, z0, x1, z1, solid) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = mulberry(Math.floor(cx * 31 + cz * 7));
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
  for (let a = -L / 2; a < L / 2 - 0.05;) {   // footing stones
    const bl = Math.min(L / 2 - a, 0.7 + R() * 0.6), k = 0.8 + R() * 0.3, m = a + bl / 2;
    g.box(M4.trs(PM.a, cx + ux * m, 0.27, cz + uz * m, 0, ry, 0, 0.68, 0.54, bl - 0.03), [0.24 * k, 0.235 * k, 0.22 * k], 0, 16); a += bl;
  }
  g.box(M4.trs(PM.a, cx, 1.32, cz, 0, ry, 0, 0.5, 1.6, L), PLASTER, 0, 20);
  for (let a = -L / 2 + 0.15; a <= L / 2; a += 2.0) g.box(M4.trs(PM.a, cx + ux * a, 1.32, cz + uz * a, 0, ry, 0, 0.58, 1.6, 0.16), TIMBER, 0, 13);
  g.box(M4.trs(PM.a, cx, 2.06, cz, 0, ry, 0, 0.6, 0.12, L), TIMBER, 0, 13);
  jRoof(g, { cx, cz, ry: ry - Math.PI / 2, hx: L / 2 + 0.15, hz: 0.62, ye: 2.06, H: 0.42, a: 0.5, L: 0, th: 0.1, ridge: 0.2, rafters: false, oni: false, discs: false });
  solid(Math.min(x0, x1) - 0.25, Math.max(x0, x1) + 0.25, 0, 2.2, Math.min(z0, z1) - 0.25, Math.max(z0, z1) + 0.25);
}
// munamon gate: two pillars on stone feet, tie and header beams, a tiled gable roof, its heavy doors swung open inside
function propGate(g, x, z, w, solid) {
  const h = 3.7;
  for (const s of [-1, 1]) {
    g.rbox(pT(PM.a, x + s * w / 2, h / 2, z), 0.4, h, 0.4, 0.03, TIMBER, 0, 13, 1); solid(x + s * w / 2 - 0.2, x + s * w / 2 + 0.2, 0, 3.2, z - 0.2, z + 0.2);
    g.rbox(pT(PM.a, x + s * w / 2, 0.12, z), 0.62, 0.24, 0.62, 0.05, [0.24, 0.235, 0.22], 0, 16, 1);
    // the door leaf, open against the inside of the gate: planks, three iron straps
    const dx = x + s * (w / 2 - 0.12), dz = z + 0.3 + 1.15;
    g.box(M4.trs(PM.a, dx, 1.65, dz, 0, 0, 0, 0.1, 3.0, 2.3), [0.15, 0.095, 0.055], 0, 13);
    for (const y of [0.6, 1.65, 2.7]) g.box(M4.trs(PM.a, dx, y, dz, 0, 0, 0, 0.13, 0.1, 2.32), [0.05, 0.05, 0.055], 0, 4);
    solid(dx - 0.06, dx + 0.06, 0, 3.15, dz - 1.15, dz + 1.15);
  }
  g.rbox(pT(PM.a, x, 2.9, z), w + 0.5, 0.2, 0.16, 0.02, TIMBER, 0, 13, 1);
  g.rbox(pT(PM.a, x, 3.55, z), w + 1.4, 0.3, 0.34, 0.03, TIMBER, 0, 13, 1);
  for (const s of [-1, 1]) g.rbox(pT(PM.a, x + s * w / 2, 3.78, z), 0.36, 0.16, 1.9, 0.03, TIMBER, 0, 13, 1);   // beams carrying the roof
  g.rbox(pT(PM.a, x, 3.22, z - 0.12), 1.3, 0.55, 0.06, 0.02, [0.06, 0.04, 0.03], 0, 13, 1);                    // name board
  g.box(M4.trs(PM.a, x, 3.22, z - 0.155, 0, 0, 0, 1.18, 0.43, 0.01), [0.55, 0.42, 0.16], 0, 4);
  jRoof(g, { cx: x, cz: z, hx: w / 2 + 1.5, hz: 1.75, ye: 3.82, H: 1.05, a: 0.45, L: 0.28, E: 1.6, th: 0.16, ridge: 0.34, oniH: 0.55, discR: 0.14 });
}
