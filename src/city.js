/* ============================================================
   The city: Sector 7 plaza + endless neon skyline
   ============================================================ */
const PLAZA = 40, RING = 74;   // plaza half-size; the inner ring of buildings reaches out to RING
const WORLD = {
  boxes: [],    // {x0,x1,y0,y1,z0,z1} solid for everyone
  circles: [],  // {x,z,r,h}
  signs: [],    // {tex,m,col,mode,seed,add}
  lights: [],   // static {p:[x,y,z], r, c:[r,g,b]}
  train: null, mesh: null, supplies: [], fires: [], steam: [], halos: [],
  petals: [],   // [x, y, z, radius] blossom canopies that shed petals
  carSpots: [], // wrecked cars {x, z, ry, kind: 'sedan'|'van', paint, roll} drawn from the Meshy models (r3.js loadMeshyCars)
  propSpots: [], // Meshy props {kind, x, z, ry, h, len, tint}: bushes, hedges, stone lanterns (r3.js loadMeshyProps)
  treeSpots: [], // plain trees {x, z, h, ry, tint}: one textured Meshy model, batched (r3.js loadMeshyTrees)
  blossoms: [], // flat list, 12 floats per flower card: x, y, z, nx, ny, nz, size, r, g, b, glow, variant (r3.js buildBlossoms)
  ponds: [],    // {x, z, rx, rz} shallow water you wade through
  navBlocks: [],   // {x0,x1,z0,z1} ground zombies never path through
  glass: [],       // {m, c} see-through shopfront panes (r3.js draws them blended)
  indoor: [],      // {x0,x1,z0,z1,y1} rooms: no rain, no wet surfaces, no sky light inside
  floods: [],      // {x0,x1,z0,z1} knee-deep standing water (the Metro's track beds)
  cascades: [],    // [x, y, z, dx, dz] water pouring out of broken pipes
  tanks: [],       // {x, z, r, h, circle} the Refinery's fuel tanks (hazards.js blows them up)
  flares: [],      // [x, y, z] flare stacks, burning
  plumes: [],      // [x, y, z, r] cooling-tower steam
};
const NEON = { mag: hex('#ff2e88'), cyan: hex('#29e7ff'), amber: hex('#ffb52e'), violet: hex('#b44dff'), red: hex('#ff3040'), lime: hex('#a6ff3a'), white: [1, 1, 1] };

function signTexture(text, color, style, vertical) {
  const cv = document.createElement('canvas');
  const W = vertical ? 128 : 512, H = vertical ? 512 : 128; cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  if (style === 'panel') {
    x.fillStyle = '#07050d'; x.fillRect(0, 0, W, H);
    x.strokeStyle = color; x.lineWidth = 6; x.shadowColor = color; x.shadowBlur = 14; x.strokeRect(8, 8, W - 16, H - 16); x.shadowBlur = 0;
  }
  x.fillStyle = color; x.shadowColor = color; x.shadowBlur = 18;
  if (vertical) {
    const chars = text.split(''); const step = (H - 40) / chars.length;
    x.font = `700 ${Math.min(96, step * 0.95)}px "Quiver Cn", "TeX Gyre Heros Cn", "Arial Narrow", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    chars.forEach((c, i) => { x.fillText(c, W / 2, 20 + step * (i + 0.5)); });
    x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.55; chars.forEach((c, i) => x.fillText(c, W / 2, 20 + step * (i + 0.5)));
  } else if (style === 'seg') {
    x.shadowBlur = 0; segText(x, text, W / 2, H / 2, H * 0.52, { color, align: 'center', glow: 0.6, ghostColor: 'rgba(255,255,255,0.04)' });
  } else {
    x.font = `700 84px "Quiver Cn", "TeX Gyre Heros Cn", "Arial Narrow", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const y = H / 2;
    let fs = 84; while (x.measureText(text).width > W - 50 && fs > 20) { fs -= 4; x.font = `700 ${fs}px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif`; }
    x.fillText(text, W / 2, y); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.6; x.fillText(text, W / 2, y);
  }
  return canvasTex(cv);
}
// the game's own ad (ads/ key art) on a holo billboard: loaded before the city is built, one texture shared by every copy
let AD_ART = null, AD_TEX = null;
function loadAdArt() {
  return new Promise(res => { const im = new Image(); im.onload = () => { AD_ART = im; res(); }; im.onerror = () => res(); im.src = 'ads/social-1200x628.jpg'; setTimeout(res, 4000); });
}
function billboardTexture(kind) {
  if (kind === 4) {   // a bigger canvas (its own sign batch) so the tagline still reads at 30 m; falls back to the curfew board if the art never loaded
    if (!AD_ART) return billboardTexture(3);
    if (!AD_TEX) { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const x = cv.getContext('2d');
      const sw = AD_ART.width, sh = sw / 2; x.drawImage(AD_ART, 0, (AD_ART.height - sh) / 2, sw, sh, 0, 0, 1024, 512);   // 1.91:1 art, cropped to the board's 2:1
      AD_TEX = canvasTex(cv); }
    return AD_TEX;
  }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const x = cv.getContext('2d');
  const F = (w, s) => `${w} ${s}px "Quiver Cn", "TeX Gyre Heros Cn", "Arial Narrow", sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (kind === 0) { // quarantine
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,40,70,0.55)'); g.addColorStop(1, 'rgba(80,0,20,0.25)'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#ffd0d8'; x.font = F(700, 70); x.shadowColor = '#ff2040'; x.shadowBlur = 20; x.fillText('QUARANTINE', 256, 96);
    x.font = F(400, 30); x.fillText('SECTOR 7 SEALED · STAY INDOORS', 256, 168);
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#ff2040' : '#1a0008'; x.fillRect(i * 32, 222, 32, 24); }
  } else if (kind === 1) { // VOLT drink
    const g = x.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, 'rgba(40,230,255,0.5)'); g.addColorStop(1, 'rgba(180,70,255,0.45)'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.shadowColor = '#29e7ff'; x.shadowBlur = 24; x.fillStyle = '#e8fdff'; x.font = F('700 italic', 120); x.fillText('VOLT', 290, 118);
    x.beginPath(); x.moveTo(90, 40); x.lineTo(50, 140); x.lineTo(95, 140); x.lineTo(70, 220); x.lineTo(150, 110); x.lineTo(105, 110); x.lineTo(135, 40); x.closePath(); x.fill();
    x.font = F(400, 28); x.fillText('STAY AWAKE. STAY ALIVE.', 290, 205);
  } else if (kind === 2) { // noodle
    x.fillStyle = 'rgba(255,120,30,0.35)'; x.fillRect(0, 0, 512, 256);
    x.shadowColor = '#ffb52e'; x.shadowBlur = 20; x.fillStyle = '#fff1d6'; x.font = F(700, 78); x.fillText('KAIJU NOODLE', 256, 100);
    x.font = F(400, 30); x.fillText('OPEN 25 HOURS · LEVEL 3', 256, 175);
    x.strokeStyle = '#ffb52e'; x.lineWidth = 5; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(140 + i * 30, 215); x.bezierCurveTo(170 + i * 30, 180, 200 + i * 30, 250, 240 + i * 30, 215); x.stroke(); }
  } else { // curfew / ad for archery :)
    const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,46,136,0.5)'); g.addColorStop(1, 'rgba(60,0,90,0.3)'); x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    x.shadowBlur = 0; segText(x, 'CURFEW 20:00', 256, 100, 70, { color: '#ff2e88', align: 'center', glow: 0.7 });
    x.shadowColor = '#ff2e88'; x.shadowBlur = 14; x.fillStyle = '#ffe6f1'; x.font = F(400, 30); x.fillText('VIOLATORS WILL BE RECYCLED', 256, 190);
  }
  return canvasTex(cv);
}

function buildCity() {
  const R = mulberry(7);
  const r = (a, b) => a + R() * (b - a);
  const gNear = new Geo(), gFar = new Geo(), gProps = new Geo(), gGarden = new Geo(), gForest = new Geo(), gSub = new Geo(); let g = gNear;   // near: facades + ground (receive shadows); props: cast shadows too; far: skyline
  const M = M4.create();
  const B = (x, y, z, sx, sy, sz, c, e = 0, mat = 0, ry = 0) => g.box(M4.trs(M, x, y, z, 0, ry, 0, sx, sy, sz), c, e, mat);
  const solid = (x0, x1, y0, y1, z0, z1) => WORLD.boxes.push({ x0, x1, y0, y1, z0, z1 });
  const addSign = (tex, x, y, z, ry, w, h, col, mode = 0, add = true) => WORLD.signs.push({ tex, m: M4.trs(M4.create(), x, y, z, 0, ry, 0, w, h, 1), col, mode, seed: R() * 100, add });

  // ---------- ground ----------
  gFar.quad(null, [-900, -0.04, 900], [900, -0.04, 900], [900, -0.04, -900], [-900, -0.04, -900], [0, 1, 0], [0.045, 0.045, 0.06], 0, 3);
  g.quad(null, [-PLAZA, 0.02, PLAZA], [PLAZA, 0.02, PLAZA], [PLAZA, 0.02, -PLAZA], [-PLAZA, 0.02, -PLAZA], [0, 1, 0], [0.085, 0.085, 0.115], 0, 2);
  // curbs / sidewalks around plaza (visual only)
  const curbC = [0.12, 0.12, 0.15];
  for (const s of [-1, 1]) {
    B(s * 24, 0.08, s * (PLAZA + 1), 34, 0.16, 2, curbC); B(-s * 24, 0.08, s * (PLAZA + 1), 34, 0.16, 2, curbC); // (split at street)
    B(s * (PLAZA + 1), 0.08, 24, 2, 0.16, 34, curbC); B(s * (PLAZA + 1), 0.08, -24, 2, 0.16, 34, curbC);
  }
  // neon edge line of plaza
  for (const s of [-1, 1]) {
    B(s * 23, 0.05, s * PLAZA, 34, 0.04, 0.12, NEON.cyan, 1.2); B(-s * 23, 0.05, s * PLAZA, 34, 0.04, 0.12, NEON.cyan, 1.2);
    B(s * PLAZA, 0.05, 23, 0.12, 0.04, 34, NEON.cyan, 1.2); B(s * PLAZA, 0.05, -23, 0.12, 0.04, 34, NEON.cyan, 1.2);
  }

  // ---------- inner ring of buildings ----------
  const facadeCols = [[0.075, 0.08, 0.1], [0.09, 0.085, 0.11], [0.06, 0.07, 0.09], [0.1, 0.09, 0.1], [0.07, 0.075, 0.085]];
  const neonPick = () => [NEON.mag, NEON.cyan, NEON.amber, NEON.violet, NEON.cyan, NEON.mag][Math.floor(R() * 6)];
  const signWords = [['KAIJU NOODLE', 'font'], ['HOTEL ORBIT', 'panel'], ['OPEN 25H', 'seg'], ['ARC MEDICAL', 'panel'], ['SYNTH BAR', 'font'], ['CYBERDOC', 'seg'], ['NO EXIT', 'seg'],
    ['PAWN + CHIPS', 'panel'], ['KARAOKE', 'font'], ['VOLT', 'seg'], ['DATA CAFE', 'panel'], ['LUCKY 88', 'seg'], ['RAMEN', 'font'], ['MEMORY SHOP', 'panel'], ['SECTOR 7', 'seg'], ['CLONE CLINIC', 'font']];
  const vertWords = ['HOTEL', 'BAR', 'RAMEN', 'LIVE', 'OPEN', 'TATTOO', 'CHIPS', 'CLUB'];
  let sw = 0, vw = 0, bb = 0;
  const RC = mulberry(555), rc = (a, b) => a + RC() * (b - a);   // street clutter has its own dice so the city layout stays put
  const SMALL = [['NOODLES', '#ff5a3c', 'font'], ['PHARMACY', '#3cff9a', 'panel'], ['CASH 4 CHROME', '#ffb52e', 'seg'], ['HOSTEL', '#29e7ff', 'panel'], ['REPAIR', '#ff2e88', 'seg'], ['SUSHI', '#ff3040', 'font'], ['NAILS', '#b44dff', 'font'], ['DENTIST', '#9fe7ff', 'panel'], ['LAUNDRY', '#a6ff3a', 'seg'], ['NO VACANCY', '#ff3040', 'seg']].map(([t, c, st]) => [signTexture(t, c, st), hex(c)]);
  const bagC = [[0.02, 0.02, 0.025], [0.03, 0.035, 0.04], [0.12, 0.1, 0.05]];
  let shopN = 0; const nextShop = () => SHOP_ORDER[shopN % SHOP_ORDER.length];
  // a building with a walk-in ground-floor shop: the upper floors sit on a back block and two flanks around an open room
  function shopBody(x0, x1, z0, z1, h, face, col, type, smat = 1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = face[1] === 'z' ? x1 - x0 : z1 - z0, DF = face[1] === 'z' ? z1 - z0 : x1 - x0;
    const tx = face[1] === 'z' ? 1 : 0, tz = 1 - tx, nx = face === '-x' ? -1 : face === '+x' ? 1 : 0, nz = face === '-z' ? -1 : face === '+z' ? 1 : 0;
    const fx = nx ? (nx < 0 ? x0 : x1) : cx, fz = nz ? (nz < 0 ? z0 : z1) : cz;
    const W = Math.min(span - 3, 11), D = 8, RH = 4.4;
    const th = Math.atan2(-nx, -nz), ca = Math.cos(th), sa = Math.sin(th);   // a rotation (never a mirror) from room space to world
    const wp = (a, dd) => [fx + a * ca + dd * sa, fz - a * sa + dd * ca];
    const Bl = (a, dd, y, sa, sd, sy, c, e = 0, mat = 16) => { const [x, z] = wp(a, dd); B(x, y, z, tx ? sa : sd, sy, tz ? sa : sd, c, e, mat); };
    const BlP = (...args) => { const pg = g; g = gProps; Bl(...args); g = pg; };
    const Sl = (a0, a1, d0, d1, y0, y1) => { const [xa, za] = wp(a0, d0), [xb, zb] = wp(a1, d1); solid(Math.min(xa, xb), Math.max(xa, xb), y0, y1, Math.min(za, zb), Math.max(za, zb)); };
    const Mm = M4.create();
    const Mr = (a, dd, y, ry = 0, rx = 0, rz = 0) => { const [x, z] = wp(a, dd); return M4.trs(Mm, x, y, z, rx, th + ry, rz, 1, 1, 1); };
    const MS = (a, dd, y, ry, sx, sy, sz, rx = 0, rz = 0) => { const [x, z] = wp(a, dd); return M4.trs(Mm, x, y, z, rx, th + ry, rz, sx, sy, sz); };
    const glass = (a, dd, y, sa, sd, sy, c) => { const [x, z] = wp(a, dd); WORLD.glass.push({ m: M4.trs(M4.create(), x, y, z, 0, th, 0, sa, sy, sd), c }); };
    const halo = (a, dd, y, s, c) => { const [x, z] = wp(a, dd); WORLD.halos.push({ p: [x, y, z], s, c }); };
    { const [xa, za] = wp(-W / 2, 0.3), [xb, zb] = wp(W / 2, D); WORLD.indoor.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), y1: RH }); }
    Bl(0, DF / 2, (h + RH) / 2, span, DF, h - RH, col, 0, smat); Sl(-span / 2, span / 2, 0, DF, RH, h);
    Bl(0, D + (DF - D) / 2, RH / 2, span, DF - D, RH, col, 0, smat); Sl(-span / 2, span / 2, D, DF, 0, RH);
    for (const s of [-1, 1]) { Bl(s * (W / 2 + span / 2) / 2, D / 2, RH / 2, span / 2 - W / 2, D, RH, col, 0, smat); Sl(s * W / 2, s * span / 2, 0, D, 0, RH); }
    propShopInterior({ g, Bl, BlP, Sl, W, D, RH, R: mulberry(1000 + shopN++ * 97), M: Mr, MS, wp, glass, halo,
      light: (a, dd, y, r, c) => { const [x, z] = wp(a, dd); WORLD.lights.push({ p: [x, y, z], r, c, shop: true }); } }, type);
  }
  // real depth on the street face, following the building's facade style (the window openings the facade shader paints, on
  // its 2.4 m bays and 3.3 m floors, world-aligned): stone sills and lintels round punched and paired windows, a continuous
  // sill under ribbon windows, metal fins up a curtain wall, deep piers between slot windows; a ledge every other floor and a
  // cornice at the roofline. The per-window pieces stop after the lower floors: that's what you see.
  const FSTYLE = [[0.16, 0.84, 0.22, 0.78], [0.04, 0.96, 0.12, 0.92], [0, 1, 0.3, 0.74], [0.22, 0.78, 0.16, 0.82], [0.24, 0.76, 0.06, 0.94]];
  function facadeDetail(x0, x1, z0, z1, h, face, col, groundTop, sills, sty = 0) {
    const alongX = face === '-z' || face === '+z', a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
    const plane = face === '-z' ? z0 : face === '+z' ? z1 : face === '-x' ? x0 : x1, out = face[0] === '-' ? -1 : 1;
    const stone = [col[0] * 1.25 + 0.035, col[1] * 1.25 + 0.035, col[2] * 1.25 + 0.035];
    const bx = (along, y, oOut, sA, sy, sO, c = stone, mat = 16) => { const cc = plane + out * oOut; if (alongX) B(along, y, cc, sA, sy, sO, c, 0, mat); else B(cc, y, along, sO, sy, sA, c, 0, mat); };
    const [wx0, wx1, wy0, wy1] = FSTYLE[sty], half = sty === 3, ww = (wx1 - wx0) * (half ? 1.2 : 2.4);
    const floors = Math.floor(h / 3.3), kMin = Math.max(0, Math.ceil((groundTop + 0.4) / 3.3 - wy0)), kMax = Math.min(floors - 1, kMin + 4);
    for (let k = kMin; k <= kMax; k++) {
      const ys = (k + wy0) * 3.3, yl = (k + wy1) * 3.3; if (yl + 0.3 > h - 1.2) break;
      if (sty === 0 || sty === 3) for (let id = Math.ceil(a0 / 2.4 + 0.02); (id + 1) * 2.4 <= a1 - 0.05; id++) for (const c of half ? [(id + 0.25) * 2.4, (id + 0.75) * 2.4] : [(id + 0.5) * 2.4]) {
        if (sills) bx(c, ys - 0.06, 0.1, ww + 0.23, 0.12, 0.2);
        bx(c, yl + 0.08, 0.06, ww + 0.15, 0.16, 0.12);
      }
      if (sty === 2) bx((a0 + a1) / 2, ys - 0.06, 0.12, a1 - a0, 0.12, 0.24);
      if ((k - kMin) % 2 === 1 && sty !== 1 && sty !== 4) bx((a0 + a1) / 2, (k + 1) * 3.3 + 0.02, 0.08, a1 - a0, 0.14, 0.16);
    }
    if (sty === 1 || sty === 4) {   // full-height relief at every bay line, from above the shopfront to the cornice
      const top = h - 0.8, y0 = groundTop + 0.3, fin = sty === 1, c = fin ? [0.1, 0.1, 0.115] : [col[0] * 1.12 + 0.01, col[1] * 1.12 + 0.01, col[2] * 1.12 + 0.01];
      if (top - y0 > 3) for (let id = Math.ceil((a0 + 0.6) / 2.4); id * 2.4 <= a1 - 0.6; id++) bx(id * 2.4, (y0 + top) / 2, fin ? 0.09 : 0.16, fin ? 0.07 : 0.5, top - y0, fin ? 0.18 : 0.32, c, fin ? 4 : 16);
    }
    if (h > 8) bx((a0 + a1) / 2, h - 0.3, 0.2, a1 - a0 + 0.3, 0.45, 0.4);
  }
  // a parapet round a roof's edge
  function roofRim(cx, cz, w, d, y, c = [0.05, 0.05, 0.06]) {
    for (const s of [-1, 1]) { B(cx, y + 0.5, cz + s * (d / 2 - 0.15), w, 1, 0.3, c); B(cx + s * (w / 2 - 0.15), y + 0.5, cz, 0.3, 1, d - 0.6, c); }
  }
  // the skyline: what stands on a roof (y is the top of the roof cap). The old tenements carry a timber water tank on a steel
  // stand; a tower gets a stepped crown, a slender spire, a crown of neon fins, a helipad, or a railing round its plant.
  // RB is the building's own dice. Scenery only: nothing up here is solid.
  const CROWN_NEON = [NEON.mag, NEON.cyan, NEON.amber, NEON.violet];
  function roofTop(RB, cx, cz, w, d, y, col, tenement, smat) {
    const rr = (a, b) => a + RB() * (b - a), Mt = M4.create(), STEEL = [0.07, 0.07, 0.08];
    const beacon = (x, yy, z) => B(x, yy, z, 0.6, 0.6, 0.6, NEON.red, 3, 24);
    if (tenement) {
      if (RB() < 0.7) {
        const tx = cx + rr(-w / 5, w / 5), tz = cz + rr(-d / 5, d / 5), R0 = rr(1.2, 1.6), th = rr(2.4, 3.2), legH = rr(1.4, 2.2), y0 = y + legH;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(tx + sx * R0 * 0.62, y + legH / 2, tz + sz * R0 * 0.62, 0.14, legH, 0.14, STEEL, 0, 4);
        B(tx, y0 - 0.06, tz, R0 * 1.75, 0.12, R0 * 1.75, STEEL, 0, 4);
        g.cyl(M4.trs(Mt, tx, y0 + th / 2, tz, 0, 0, 0, R0 * 2, th, R0 * 2), [0.15, 0.1, 0.07], 0, 13, 16);                 // staves
        for (const k of [0.2, 0.55, 0.88]) g.cyl(M4.trs(Mt, tx, y0 + th * k, tz, 0, 0, 0, R0 * 2.04, 0.07, R0 * 2.04), STEEL, 0, 4, 16, 0.5, 0.5, false);   // hoops
        g.cyl(M4.trs(Mt, tx, y0 + th + 0.45, tz, 0, 0, 0, R0 * 2.12, 0.9, R0 * 2.12), [0.06, 0.06, 0.065], 0, 4, 16, 0.06, 0.5);   // conical lid
      }
      if (RB() < 0.5) roofRim(cx, cz, w, d, y - 0.6, [0.07, 0.065, 0.06]);
      return;
    }
    const k = RB(), big = Math.min(w, d);
    if (k < 0.22 && big > 9) {            // stepped crown: two or three shrinking storeys, a mast on top
      let cw = w * 0.72, cd = d * 0.72, yy = y;
      for (let i = 0, n = RB() < 0.5 ? 2 : 3; i < n; i++) { const sh = rr(3.3, 6.6); B(cx, yy + sh / 2, cz, cw, sh, cd, col, 0, smat); B(cx, yy + sh + 0.25, cz, cw + 0.2, 0.5, cd + 0.2, [0.05, 0.05, 0.06]); yy += sh + 0.5; cw *= 0.7; cd *= 0.7; }
      if (RB() < 0.7) { const mh = rr(5, 12); B(cx, yy + mh / 2, cz, 0.3, mh, 0.3, [0.1, 0.1, 0.12], 0, 4); beacon(cx, yy + mh + 0.3, cz); }
    } else if (k < 0.36 && big > 9) {     // a slender spire on a plinth
      const sh = rr(14, 34), pr = big * 0.2;
      B(cx, y + 1, cz, pr * 1.6, 2, pr * 1.6, [0.06, 0.06, 0.07], 0, 4);
      g.cyl(M4.trs(Mt, cx, y + 2 + sh / 2, cz, 0, 0, 0, pr, sh, pr), [0.09, 0.09, 0.11], 0, 4, 8, 0.03, 0.5);
      beacon(cx, y + 2 + sh + 0.3, cz);
    } else if (k < 0.56) {                // a crown of neon fins along the roof edge
      const c = CROWN_NEON[Math.floor(RB() * 4)], fh = rr(2.2, 4.5);
      for (const s of [-1, 1]) {
        for (let a = -w / 2 + 0.6; a <= w / 2 - 0.6; a += 2.4) B(cx + a, y + fh / 2, cz + s * (d / 2 - 0.2), 0.14, fh, 0.14, c, 1.5);
        for (let a = -d / 2 + 0.6; a <= d / 2 - 0.6; a += 2.4) B(cx + s * (w / 2 - 0.2), y + fh / 2, cz + a, 0.14, fh, 0.14, c, 1.5);
        B(cx, y + fh + 0.06, cz + s * (d / 2 - 0.2), w - 1, 0.12, 0.12, STEEL, 0, 4); B(cx + s * (w / 2 - 0.2), y + fh + 0.06, cz, 0.12, 0.12, d - 1, STEEL, 0, 4);
      }
    } else if (k < 0.7 && big > 14) {     // a helipad: a raised deck, its lit ring and corner lamps
      const pw = Math.min(big - 3, 12);
      B(cx, y + 0.9, cz, pw, 0.3, pw, [0.06, 0.06, 0.07], 0, 16);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { B(cx + sx * pw * 0.35, y + 0.37, cz + sz * pw * 0.35, 0.3, 0.75, 0.3, STEEL, 0, 4); B(cx + sx * (pw / 2 - 0.2), y + 1.12, cz + sz * (pw / 2 - 0.2), 0.25, 0.15, 0.25, NEON.lime, 2.5); }
      g.ring(M4.trs(Mt, cx, y + 1.07, cz, 0, 0, 0, pw * 0.36, 1, pw * 0.36), NEON.amber, 1.8, 0, 1, 0.03, 40, 4);
    } else if (RB() < 0.6) {              // a railing round the roof plant
      for (const s of [-1, 1]) for (const yy of [0.55, 1.05]) { B(cx, y + yy, cz + s * (d / 2 - 0.4), w - 0.8, 0.06, 0.06, STEEL, 0, 4); B(cx + s * (w / 2 - 0.4), y + yy, cz, 0.06, 0.06, d - 0.8, STEEL, 0, 4); }
      for (const s of [-1, 1]) { for (let a = -w / 2 + 0.4; a <= w / 2 - 0.4; a += 1.6) B(cx + a, y + 0.55, cz + s * (d / 2 - 0.4), 0.06, 1.1, 0.06, STEEL, 0, 4);
        for (let a = -d / 2 + 0.4; a <= d / 2 - 0.4; a += 1.6) B(cx + s * (w / 2 - 0.4), y + 0.55, cz + a, 0.06, 1.1, 0.06, STEEL, 0, 4); }
    }
  }
  function building(x0, x1, z0, z1, h, face, opt = {}) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, h0 = h;
    const col = opt.col || facadeCols[Math.floor(R() * facadeCols.length)];
    // the facade style and everything on the roof roll their own dice, seeded by the plot, so the rest of the city never moves
    const RB = mulberry(Math.round(x0 * 131 + z0 * 977 + 7)), fm = opt.mat || 1;
    const sty = opt.industrial || (fm !== 1 && fm !== 9) ? 0 : fm === 9 ? [0, 0, 0, 3, 3, 4][Math.floor(RB() * 6)] : opt.tenement ? [0, 2, 3, 3][Math.floor(RB() * 4)] : [0, 0, 1, 1, 2, 3, 4][Math.floor(RB() * 7)];
    const smat = fm + sty * 0.1;
    if (opt.shop) shopBody(x0, x1, z0, z1, h, face, col, opt.shop, smat);
    else { B(cx, h / 2, cz, w, h, d, col, 0, smat); solid(x0, x1, 0, h, z0, z1); }
    // setback tier (the lower roof gets a parapet: the tier used to stand on it bare)
    let tw = w, td = d;
    if (R() < 0.6) { const h2 = r(10, 40), s = r(0.55, 0.8); B(cx, h + h2 / 2, cz, w * s, h2, d * s, col, 0, smat); if (R() < 0.5) B(cx, h + h2 + 0.3, cz, w * s + 0.3, 0.3, d * s + 0.3, neonPick(), 1.2);
      roofRim(cx, cz, w, d, h); h += h2; tw = w * s; td = d * s; }
    // roof bits: a cap the size of the top block (it used to be the whole plot, a slab hanging out over any setback), plant on it
    B(cx, h + 0.6, cz, tw + 0.2, 1.2, td + 0.2, [0.05, 0.05, 0.06]);   // (just inside the neon trim a tier may carry, so the trim shows)
    for (let i = 0; i < 3; i++) B(cx + r(-tw / 3, tw / 3), h + 1.8, cz + r(-td / 3, td / 3), r(2, 4), r(1.5, 3), r(2, 4), [0.08, 0.08, 0.09], 0, 4);
    if (R() < 0.7) { const ax = cx + r(-tw / 4, tw / 4), az = cz + r(-td / 4, td / 4), ah = r(8, 22); B(ax, h + ah / 2, az, 0.3, ah, 0.3, [0.1, 0.1, 0.12]); B(ax, h + ah + 0.3, az, 0.7, 0.7, 0.7, NEON.red, 3, 24); }
    if (!opt.industrial) roofTop(RB, cx, cz, tw, td, h + 1.2, col, opt.tenement, smat);
    // facade orientation
    let fx, fz, ry, tx, tz, span; // facade point & normal toward plaza
    if (face === '-z') { fz = z0 - 0.02; fx = cx; ry = Math.PI; tx = 1; tz = 0; span = w; }
    else if (face === '+z') { fz = z1 + 0.02; fx = cx; ry = 0; tx = 1; tz = 0; span = w; }
    else if (face === '-x') { fx = x0 - 0.02; fz = cz; ry = -Math.PI / 2; tx = 0; tz = 1; span = d; }
    else { fx = x1 + 0.02; fz = cz; ry = Math.PI / 2; tx = 0; tz = 1; span = d; }
    const nx = face === '-x' ? -1 : face === '+x' ? 1 : 0, nz = face === '-z' ? -1 : face === '+z' ? 1 : 0;
    const P = (along, y, out) => [fx + tx * along + nx * out, y, fz + tz * along + nz * out];
    if (!opt.industrial) facadeDetail(x0, x1, z0, z1, h0, face, col, opt.tenement ? 3 : 6.7, !opt.tenement, sty);
    if (opt.industrial) {   // warehouse: roll-up shutters, a hazard strip and a caged work light, no shop signs
      const n = Math.max(1, Math.floor(span / 9));
      for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * (span / n); const p = P(a, 2.6, 0.06); B(p[0], 2.6, p[2], tx ? 4.2 : 0.12, 5.2, tz ? 4.2 : 0.12, [0.2, 0.19, 0.17], 0, 8);
        const q = P(a, 5.6, 0.25); B(q[0], 5.6, q[2], tx ? 0.6 : 0.3, 0.3, tz ? 0.6 : 0.3, [1, 0.8, 0.5], 3);
        WORLD.halos.push({ p: P(a, 5.6, 0.45), s: 1.6, c: [0.7, 0.5, 0.25] });
        if (i % 2 === 0) WORLD.lights.push({ p: P(a, 5, 2.5), r: 11, c: [1.8, 1.25, 0.6], shop: true }); }
      const hz = P(0, 0.5, 0.08); B(hz[0], 0.5, hz[2], tx ? span * 0.96 : 0.14, 0.25, tz ? span * 0.96 : 0.14, NEON.amber, 0.9);
      if (R() < 0.5) { const [txt, st] = [['DOCK ' + (1 + Math.floor(R() * 9)), 'seg'], ['FREIGHT', 'panel'], ['NO ENTRY', 'seg'], ['HAZMAT', 'panel']][Math.floor(R() * 4)]; const sp = P(0, 8.5, 0.15); addSign(signTexture(txt, '#ffb52e', st), sp[0], sp[1], sp[2], ry, Math.min(span * 0.5, 8), Math.min(span * 0.5, 8) / 4, [1.4, 1.4, 1.4], 0, st !== 'panel'); }
      return;
    }
    if (opt.tenement) {     // alley walls: fire escapes, AC units, pipes, one lit doorway
      // fire escapes: a grated landing per floor on wall brackets, railings, a steep stair flight up to the next landing
      // (switching back each floor), and the drop ladder hung up out of reach under the first. Scenery only: nothing to stand on.
      const floors = Math.floor((h - 3) / 3.3), nF = Math.min(floors, 7), IRON = [0.07, 0.07, 0.08];
      const Bf = (along, y, out, sA, sy, sO) => { const p = P(along, y, out); B(p[0], y, p[2], tx ? sA : sO, sy, tz ? sA : sO, IRON, 0, 4); };
      const Lf = (a0, y0, o0, a1, y1, o1, w) => { const p = P(a0, y0, o0), q = P(a1, y1, o1); g.box(M4.align(M, p[0], p[1], p[2], q[0], q[1], q[2], w, w), IRON, 0, 4); };
      for (const a of [-span * 0.25, span * 0.2]) for (let f = 1; f < nF; f++) {
        const y = f * 3.3 + 0.6, dir = f % 2 ? 1 : -1;
        Bf(a, y, 0.7, 3.2, 0.06, 1.3);                                                    // the deck
        for (const ry of [0.5, 0.95]) Bf(a, y + ry, 1.33, 3.2, 0.04, 0.04);                // front rails
        for (const s of [-1, 1]) { Bf(a + s * 1.6, y + 0.95, 0.7, 0.04, 0.04, 1.3); Lf(a + s * 1.35, y - 0.9, 0.04, a + s * 1.35, y - 0.03, 1.28, 0.05); }   // end rails, brackets
        for (const s of [-1, 0, 1]) Bf(a + s * 1.6, y + 0.48, 1.33, 0.045, 0.95, 0.045);   // posts
        if (f + 1 < nF) {                                                                  // the flight up, along the outer half of the deck
          const a0 = a - dir * 1.15, a1 = a + dir * 1.15;
          for (const o of [0.78, 1.24]) Lf(a0, y, o, a1, y + 3.3, o, 0.05);
          for (let k = 1; k < 8; k++) Bf(lerp(a0, a1, k / 8), y + 3.3 * k / 8, 1.01, 0.24, 0.035, 0.44);
          Lf(a0, y + 0.9, 1.26, a1, y + 4.2, 1.26, 0.035);
        }
        if (f === 1) { const la = a + dir * 1.25; for (const o of [0.84, 1.18]) Bf(la, y - 0.75, o, 0.045, 1.5, 0.045); for (let k = 0; k < 5; k++) Bf(la, y - 1.4 + k * 0.3, 1.01, 0.03, 0.03, 0.34); }
      }
      for (let i = 0; i < 4; i++) { const p = P(r(-span / 2 + 1, span / 2 - 1), r(3, h - 2), 0.35); B(p[0], p[1], p[2], tx ? 0.9 : 0.7, 0.6, tz ? 0.9 : 0.7, [0.14, 0.14, 0.15], 0, 4); }
      const pp = P(span / 2 - 0.6, h / 2, 0.2); B(pp[0], pp[1], pp[2], 0.18, h, 0.18, [0.1, 0.09, 0.08], 0, 4);
      const dc = neonPick(), dp = P(r(-span / 4, span / 4), 1.3, 0.04); B(dp[0], 1.3, dp[2], tx ? 1.4 : 0.08, 2.4, tz ? 1.4 : 0.08, [dc[0] * 0.25 + 0.05, dc[1] * 0.25 + 0.05, dc[2] * 0.25 + 0.05], 0.8);
      B(dp[0] + nx * 0.3, 2.75, dp[2] + nz * 0.3, tx ? 0.5 : 0.25, 0.1, tz ? 0.5 : 0.25, [1, 0.85, 0.6], 3);
      WORLD.lights.push({ p: [dp[0] + nx * 2, 2.6, dp[2] + nz * 2], r: 9, c: [dc[0] * 1.2, dc[1] * 1.2, dc[2] * 1.2], shop: true });
      if (R() < 0.45) { const [txt, st] = signWords[sw++ % signWords.length]; const sp = P(dp[0] * tx + dp[2] * tz - (fx * tx + fz * tz), 3.6, 0.15); addSign(signTexture(txt, rgbHex(dc), st), sp[0], sp[1], sp[2], ry, 5, 1.25, [1.5, 1.5, 1.5], 0, st !== 'panel'); }
      return;
    }
    // corner neon strips
    const nc = neonPick();
    for (const s of [-1, 1]) { const p = P(s * (span / 2 - 0.15), h / 2, 0.1); B(p[0], p[1], p[2], nx ? 0.2 : 0.25, h, nz ? 0.2 : 0.25, nc, 2.2); }
    // horizontal band
    if (R() < 0.6) { const y = r(12, Math.min(h - 4, 40)); const p = P(0, y, 0.12); B(p[0], y, p[2], tx ? span : 0.25, 0.35, tz ? span : 0.25, neonPick(), 2.2); }
    // storefront: glowing window + awning
    const sc = neonPick();
    const pw = P(0, 1.8, 0.05); if (!opt.shop) B(pw[0], 1.8, pw[2], tx ? span * 0.8 : 0.1, 2.6, tz ? span * 0.8 : 0.1, [sc[0] * 0.3 + 0.1, sc[1] * 0.3 + 0.1, sc[2] * 0.3 + 0.1], 0.9);
    const pa = P(0, 3.6, 0.9); B(pa[0], 3.6, pa[2], tx ? span * 0.85 : 1.8, 0.2, tz ? span * 0.85 : 1.8, [0.05, 0.05, 0.07]);
    const pe = P(0, 3.5, 1.8); B(pe[0], 3.5, pe[2], tx ? span * 0.85 : 0.1, 0.12, tz ? span * 0.85 : 0.1, sc, 2.5);
    // a downlight in the awning's underside, and the light it throws: the light used to hang a metre past the awning with
    // nothing drawn there, so on the wet street its reflection was a bright spot floating in front of the shop
    const pl = P(0, 3.42, 1.2); B(pl[0], 3.42, pl[2], tx ? 0.7 : 0.3, 0.1, tz ? 0.7 : 0.3, sc, 2.4);
    WORLD.lights.push({ p: P(0, 3.25, 1.2), r: 12, c: [sc[0] * 1.6, sc[1] * 1.6, sc[2] * 1.6], shop: true });
    // horizontal sign above storefront
    const [txt, st] = opt.shop ? [SHOP_DEFS[opt.shop].sign, SHOP_DEFS[opt.shop].st] : signWords[sw++ % signWords.length];
    const signW = Math.min(span * 0.7, 11), sp = P(r(-span * 0.1, span * 0.1), 5.2, 0.15);
    addSign(signTexture(txt, rgbHex([nc, sc, NEON.amber][sw % 3]), st), sp[0], sp[1], sp[2], ry, signW, signW / 4, [1.6, 1.6, 1.6], 0, st !== 'panel');
    // vertical blade sign
    if (R() < 0.75) {
      const along = (R() < 0.5 ? -1 : 1) * (span / 2 - 2.5), vh = r(7, 12), vy = r(9, 16);
      const vp = P(along, vy, 1.2); const vc = neonPick();
      B(vp[0], vy, vp[2], tx ? 0.25 : 2.3, vh + 0.4, tz ? 0.25 : 2.3, [0.03, 0.03, 0.04]);
      const hexc = rgbHex(vc);
      const t = signTexture(vertWords[vw++ % vertWords.length], hexc, 'font', true);
      // both faces of the blade (perpendicular to facade)
      const bry = ry + Math.PI / 2;
      addSign(t, vp[0] + tx * 0.14, vy, vp[2] + tz * 0.14, bry, 2.1, vh, [1.8, 1.8, 1.8], 0, true);
      addSign(t, vp[0] - tx * 0.14, vy, vp[2] - tz * 0.14, bry + Math.PI, 2.1, vh, [1.8, 1.8, 1.8], 0, true);
    }
    // facade + street detail: a drainpipe, cornice ledges, AC units under windows, small projecting signs, and rubbish at the kerb
    { const dcol = [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75];
      const dp = P((RC() < 0.5 ? -1 : 1) * (span / 2 - 0.35), h / 2, 0.12); B(dp[0], h / 2, dp[2], 0.14, h, 0.14, [0.06, 0.06, 0.065], 0, 4);
      for (let y = 7.4 + rc(0, 3); y < Math.min(h, 60) - 2; y += rc(9, 15)) { const q = P(0, y, 0.18); B(q[0], y, q[2], tx ? span : 0.36, 0.28, tz ? span : 0.36, dcol, 0, 16); }
      for (let i = 0; i < Math.floor(span / 3.2); i++) if (RC() < 0.5) {
        const y = 3.3 * Math.floor(rc(2, Math.min(h / 3.3 - 1, 9))) + 0.75, a = rc(-span / 2 + 1, span / 2 - 1), q = P(a, y, 0.34);
        B(q[0], y, q[2], tx ? 0.85 : 0.6, 0.55, tz ? 0.85 : 0.6, [0.42, 0.42, 0.44], 0, 4);
        const f = P(a, y, 0.65); B(f[0], y, f[2], tx ? 0.5 : 0.02, 0.4, tz ? 0.5 : 0.02, [0.08, 0.08, 0.09], 0, 4);
        const k = P(a, y - 0.32, 0.4); B(k[0], y - 0.32, k[2], tx ? 0.9 : 0.5, 0.04, tz ? 0.9 : 0.5, [0.2, 0.2, 0.21], 0, 4);   // bracket
      }
      if (RC() < 0.7) { const [tex, sc2] = SMALL[Math.floor(RC() * SMALL.length)], a = rc(-span / 2 + 1.5, span / 2 - 1.5), y = rc(6, 9), q = P(a, y, 0.9), bry = ry + Math.PI / 2;
        B(q[0], y, q[2], tx ? 0.12 : 1.5, 0.7, tz ? 0.12 : 1.5, [0.03, 0.03, 0.04]);
        for (const o of [0.07, -0.07]) WORLD.signs.push({ tex, m: M4.trs(M4.create(), q[0] + tx * o, y, q[2] + tz * o, 0, bry + (o < 0 ? Math.PI : 0), 0, 1.4, 0.35, 1), col: [sc2[0] * 1.4, sc2[1] * 1.4, sc2[2] * 1.4], mode: 0, seed: RC() * 100, add: true }); }
      const pg = g; g = gProps;
      for (let i = 0; i < 3; i++) if (RC() < 0.45) { const a = rc(-span / 2 + 0.8, span / 2 - 0.8); if (opt.shop && Math.abs(a) < 2) continue;
        for (let k = 0; k < 2 + Math.floor(RC() * 3); k++) { const q = P(a + rc(-0.6, 0.6), 0, rc(0.4, 1.1)), sz = rc(0.32, 0.5); g.blob(M4.trs(M, q[0], sz * 0.55, q[2], 0, rc(0, 6), 0, 1, 1, 1), sz, sz * 0.62, sz * 0.8, 0.22, Math.floor(RC() * 999), bagC[Math.floor(RC() * 3)], 0, 15, 9, 6); } }
      if (RC() < 0.25) { const q = P(rc(-span / 2 + 1, span / 2 - 1), 0, 1.6); B(q[0], 0.4, q[2], 0.26, 0.8, 0.26, [0.55, 0.08, 0.05], 0, 11); B(q[0], 0.82, q[2], 0.2, 0.1, 0.2, [0.55, 0.08, 0.05], 0, 11); WORLD.circles.push({ x: q[0], z: q[2], r: 0.2, h: 0.85 }); }   // hydrant
      if (RC() < 0.3) { const q = P(rc(-span / 2 + 1, span / 2 - 1), 0, 1.3); B(q[0], 0.55, q[2], tx ? 0.5 : 0.45, 1.1, tz ? 0.5 : 0.45, [0.12, 0.25, 0.5], 0, 8); B(q[0], 0.8, q[2] , tx ? 0.35 : 0.46, 0.2, tz ? 0.35 : 0.46, [0.7, 0.8, 0.85], 0.2, 10); WORLD.circles.push({ x: q[0], z: q[2], r: 0.3, h: 1.1 }); }   // newspaper box
      g = pg;
    }
    // holo billboard on some tall facades
    if (h > 45 && R() < 0.7) {
      const by = r(20, Math.min(h - 10, 34)), bw = Math.min(span * 0.8, 18); const bp = P(0, by, 0.4);
      const kind = bb++ % 5; addSign(billboardTexture(kind), bp[0], by, bp[2], ry, bw, bw / 2, kind === 4 ? [1, 1, 1] : [1.3, 1.3, 1.3], 1, true);
    }
  }
  // north (+z) and south (-z) sides: span x [-64,-6] & [6,64]
  for (const side of [1, -1]) {
    for (const half of [-1, 1]) {
      let a = 6; while (a < 64) {
        const wdt = Math.min(r(12, 22), 64 - a); if (wdt < 6) break;
        const x0 = half > 0 ? a : -a - wdt, x1 = half > 0 ? a + wdt : -a;
        const depth = RING - PLAZA - 2.5, z0 = side > 0 ? PLAZA + 2.5 : -(PLAZA + 2.5) - depth, z1 = side > 0 ? PLAZA + 2.5 + depth : -(PLAZA + 2.5);
        building(x0, x1, z0, z1, r(28, 95), side > 0 ? '-z' : '+z', wdt >= 12 ? { shop: nextShop() } : {});
        a += wdt + 0.01;
      }
    }
  }
  { const pg = g; g = gProps; const Mc = M4.create();
    const span = (ax, ay, az, bx, by, bz, sag, lit) => { let px = ax, py = ay, pz = az; for (let i = 1; i <= 10; i++) { const t = i / 10, x = lerp(ax, bx, t), z = lerp(az, bz, t), y = lerp(ay, by, t) - Math.sin(t * Math.PI) * sag; g.box(M4.align(Mc, px, py, pz, x, y, z, 0.03, 0.03), [0.03, 0.03, 0.035], 0, 0); if (lit && i % 2 === 0 && i < 10) { g.sphere(M4.trs(Mc, x, y - 0.12, z, 0, 0, 0, 0.12, 0.12, 0.12), lit, 3, 0, 6, 4); } px = x; py = y; pz = z; } };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 45; d < 72; d += rc(2.2, 4.5)) {
      const c = dx ? [d * dx, 0] : [0, d * dz], y0 = rc(5.5, 12), y1 = y0 + rc(-1.5, 1.5), lit = RC() < 0.25 ? [[1, 0.8, 0.5], [1, 0.3, 0.6], [0.4, 0.9, 1]][Math.floor(RC() * 3)] : null;
      if (dx) span(c[0] + rc(-1, 1), y0, -5.9, c[0] + rc(-1, 1), y1, 5.9, rc(0.4, 1.4), lit); else span(-5.9, y0, c[1] + rc(-1, 1), 5.9, y1, c[1] + rc(-1, 1), rc(0.4, 1.4), lit);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const side of [-1, 1]) for (let d = 47 + (side > 0 ? 3 : 0); d < 72; d += 8) {   // wall lamps down the side streets
      const lc = RC() < 0.7 ? [1.7, 1.15, 0.6] : [0.7, 1.3, 1.7], dead = RC() < 0.15;
      const wx = dx ? d * dx : side * 5.95, wz = dx ? side * 5.95 : d * dz, ox = dx ? 0 : -side * 0.3, oz = dx ? -side * 0.3 : 0;
      g.box(M4.trs(Mc, wx + ox * 0.5, 3.4, wz + oz * 0.5, 0, 0, 0, dx ? 0.35 : 0.3, 0.1, dx ? 0.3 : 0.35), [0.08, 0.08, 0.09], 0, 4);
      g.box(M4.trs(Mc, wx + ox, 3.33, wz + oz, 0, 0, 0, 0.28, 0.06, 0.28), dead ? [0.2, 0.2, 0.2] : lc, dead ? 0 : 3, 0);
      if (!dead) { WORLD.lights.push({ p: [wx + ox * 3, 3.1, wz + oz * 3], r: 9, c: lc, shop: true }); WORLD.halos.push({ p: [wx + ox * 1.2, 3.25, wz + oz * 1.2], s: 1.3, c: [lc[0] * 0.35, lc[1] * 0.35, lc[2] * 0.35] }); }
      if (RC() < 0.4) for (let k = 0; k < 3; k++) { const bx = wx + ox * 2 + rc(-1, 1) * (dx ? 1 : 0), bz = wz + oz * 2 + rc(-1, 1) * (dx ? 0 : 1), sz = rc(0.3, 0.5); g.blob(M4.trs(Mc, bx, sz * 0.55, bz, 0, rc(0, 6), 0, 1, 1, 1), sz, sz * 0.62, sz * 0.8, 0.22, Math.floor(RC() * 999), bagC[Math.floor(RC() * 3)], 0, 15, 9, 6); }
    }
    g = pg; }
  // east / west: span z [-42.5,-6] & [6,42.5]
  for (const side of [1, -1]) {
    for (const half of [-1, 1]) {
      let a = 6; while (a < PLAZA + 2.4) {
        const wdt = Math.min(r(12, 20), PLAZA + 2.5 - a); if (wdt < 5) break;
        const z0 = half > 0 ? a : -a - wdt, z1 = half > 0 ? a + wdt : -a;
        const depth = RING - PLAZA - 2.5, x0 = side > 0 ? PLAZA + 2.5 : -(PLAZA + 2.5) - depth, x1 = side > 0 ? PLAZA + 2.5 + depth : -(PLAZA + 2.5);
        building(x0, x1, z0, z1, r(28, 95), side > 0 ? '-x' : '+x', wdt >= 12 ? { shop: nextShop() } : {});
        a += wdt + 0.01;
      }
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {   // corner towers
    const x0 = sx > 0 ? 57 : -RING - 2, x1 = sx > 0 ? RING + 2 : -57, z0 = sz > 0 ? 43 : -RING - 2, z1 = sz > 0 ? RING + 2 : -43, h = r(70, 130);
    B((x0 + x1) / 2, h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, facadeCols[Math.floor(R() * 5)], 0, 1); solid(x0, x1, 0, h, z0, z1);
  }
  g = gFar;
  // ---------- outer skyline ----------
  for (let gx = -420; gx <= 420; gx += 34) for (let gz = -420; gz <= 420; gz += 34) {
    const x = gx + r(-6, 6), z = gz + r(-6, 6); const dist = Math.hypot(x, z);
    if (dist > 440) continue;
    const ax = Math.abs(x), az = Math.abs(z), mx = Math.max(ax, az);
    if (ax < 86 && az < 86) continue;                       // inner ring lives here
    if (DISTRICTS.some(d => x > d.x0 - 34 && x < d.x1 + 34 && z > d.z0 - 34 && z < d.z1 + 34)) continue;   // districts + their walls
    if ((ax < 36 || az < 36) && mx < 165) continue;          // street walls live here
    if (ax < 24 || az < 24) continue;                        // keep avenues open to the horizon
    if (z > 66) continue;                                    // south of the plaza is cherry forest, not city
    if (x > 200 && Math.abs(z) < 170) continue;              // open harbour past the docks
    if (R() < 0.18) continue;
    const w = r(14, 26), d = r(14, 26);
    let h = r(35, 120) + (dist > 180 ? r(0, 140) : 0) + (R() < 0.06 ? r(120, 220) : 0);
    const col = facadeCols[Math.floor(R() * facadeCols.length)];
    const RB = mulberry(Math.round(x * 131 + z * 977 + 3)), smat = 1 + [0, 0, 1, 1, 2, 3, 4][Math.floor(RB() * 7)] * 0.1, h0 = h;
    B(x, h / 2, z, w, h, d, col, 0, smat);
    let tw = w, td = d;   // the top block's footprint: the roof trim and the crown sit on it, not on the whole plot
    if (R() < 0.45) { const h2 = r(15, 60); B(x, h + h2 / 2, z, w * 0.6, h2, d * 0.6, col, 0, smat); h += h2; tw = w * 0.6; td = d * 0.6; }
    if (R() < 0.5) { B(x, h + 0.5, z, tw + 0.4, 0.5, td + 0.4, neonPick(), 1.6); }
    if (R() < 0.35) { const nc = neonPick(); B(x + w / 2, h0 / 2, z + d / 2, 0.6, h0, 0.6, nc, 2); B(x - w / 2, h0 / 2, z + d / 2, 0.6, h0, 0.6, nc, 2); }
    if (R() < 0.5) B(x, h + 6, z, 0.5, 12, 0.5, [0.1, 0.1, 0.1]), B(x, h + 12.4, z, 1.2, 1.2, 1.2, NEON.red, 4, 24);
    else roofTop(RB, x, z, tw, td, h, col, false, smat);
    if (mx < 130) solid(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2);
  }
  // the Spire — megatower at the end of the north avenue
  B(0, 210, -520, 44, 420, 44, [0.06, 0.06, 0.09], 0, 1);
  B(0, 450, -520, 28, 60, 28, [0.05, 0.05, 0.08], 0, 1);
  for (let i = 0; i < 6; i++) B(0, 60 + i * 70, -520, 46, 1.2, 46, NEON.mag, 2.2);
  B(0, 500, -520, 2, 40, 2, NEON.white, 4);
  // monorail track crossing over the plaza
  B(0, 24, -24, 1000, 0.9, 2.2, [0.08, 0.08, 0.1], 0, 4);
  B(0, 23.5, -24, 1000, 0.1, 0.3, NEON.cyan, 2.5);
  for (let x = -420; x <= 420; x += 60) if (Math.abs(x) > 70) { B(x, 12, -24, 1.4, 24, 1.4, [0.07, 0.07, 0.08], 0, 4); if (Math.abs(x) < 250) WORLD.circles.push({ x, z: -24, r: 0.9, h: 24 }); }

  g = gProps;
  // ---------- plaza props ----------
  // holo fountain
  g.cyl(M4.trs(M, 0, 0.45, 0, 0, 0, 0, 8.4, 0.9, 8.4), [0.1, 0.1, 0.13], 0, 4, 32);
  g.cyl(M4.trs(M, 0, 0.92, 0, 0, 0, 0, 7.4, 0.04, 7.4), NEON.cyan, 0.5, 0, 32);
  g.ring(M4.trs(M, 0, 0.92, 0, 0, 0, 0, 4.2, 1, 4.2), NEON.cyan, 3, 0, 1, 0.05, 48, 4);
  g.cyl(M4.trs(M, 0, 1.4, 0, 0, 0, 0, 1.4, 1.2, 1.4), [0.08, 0.08, 0.1], 0, 4, 16);
  WORLD.circles.push({ x: 0, z: 0, r: 4.3, h: 1.0 }, { x: 0, z: 0, r: 0.8, h: 2.1 });
  WORLD.lights.push({ p: [0, 3.5, 0], r: 18, c: [0.4, 1.6, 2.2], kind: 'fountain' });
  // crashed hover-cars (props.js)
  propHoverCar(g, R, 15, -17, 0.55, [0.25, 0.05, 0.12], 1);
  propHoverCar(g, R, -21, 12, -1.1, [0.05, 0.12, 0.22], 0);
  propHoverCar(g, R, 24, 22, 2.2, [0.18, 0.18, 0.2], 2);
  // abandoned where they stalled on the avenues
  propHoverCar(g, R, -2.8, -58, 0.35, [0.1, 0.1, 0.12], 1); propHoverCar(g, R, 57, 2.6, 1.9, [0.22, 0.12, 0.04], 0);
  propHoverCar(g, R, -55, -3, -1.3, [0.06, 0.14, 0.08], 2); propHoverCar(g, R, 44, -3.2, 1.45, [0.2, 0.2, 0.22], 0);
  // jersey barriers
  function barrier(x, z, rot) { propBarrier(g, x, z, rot); }
  barrier(-9, 24, 0); barrier(-5.5, 24.6, 0); barrier(11, -26, 0); barrier(27, 5, 1); barrier(-28, -9, 1); barrier(-5, -30, 0); barrier(6, 30, 0); barrier(30, -12, 1);
  // vending machines / kiosks
  function vend(x, z, ry, c) { const fx = ry === 0 ? 0 : ry > 0 ? 1 : -1, fz = ry === 0 ? -Math.sign(z) : 0; propVend(g, R, x, z, fx, fz, c); }
  vend(-17.4, 38.8, 0, NEON.cyan); vend(-16, 38.8, 0, NEON.mag); vend(19, -38.8, 0, NEON.amber); vend(38.8, 16, -1, NEON.mag); vend(-38.8, -20, 1, NEON.cyan);
  // bioluminescent trees in planters (props.js)
  const tree = (x, z, c) => propSakura(g, R, x, z, 1, true, c);
  tree(-17, -19, NEON.cyan); tree(18, 16, NEON.mag); tree(-26, 26, NEON.violet); tree(28, -27, NEON.cyan);
  // street lamps
  function lamp(x, z) { propLamp(g, x, z); }
  lamp(-32, -32); lamp(32, 32); lamp(-32, 32); lamp(32, -32);
  // benches facing the fountain, with bins between them
  for (const bx of [-3.4, 3.4]) { propBench(g, R, bx, -12.5, '+z'); propBench(g, R, bx, 12.5, '-z'); propBench(g, R, -12.5, bx, '+x'); }
  propBench(g, R, 12.5, -3.4, '-x');
  for (const [x, z] of [[0, -12.7], [0, 12.7], [-12.7, 0], [12.7, -6]]) propBin(g, R, x, z);
  // run fn against a throwaway mesh and collision lists: it rolls the same dice as the real build, so cutting
  // an opening through a wall never reshuffles the random layout of everything built after it
  const ghost = (fn) => {
    const pg = g, keep = {}; g = new Geo();
    for (const k of ['boxes', 'circles', 'signs', 'lights', 'halos', 'fires', 'steam', 'supplies', 'indoor', 'glass', 'petals', 'blossoms', 'carSpots', 'treeSpots', 'propSpots', 'ponds', 'navBlocks']) { keep[k] = WORLD[k]; WORLD[k] = []; }
    try { fn(g); } finally { g = pg; Object.assign(WORLD, keep); }
  };
  buildDistricts({ B, solid, building, lamp, barrier, vend, addSign, r, R, neonPick, facadeCols, ghost, setG: (k) => { g = k === 'props' ? gProps : k === 'far' ? gFar : k === 'garden' ? gGarden : k === 'sub' ? gSub : gNear; }, getG: () => g, getForest: () => gForest });
  g = gProps;
  // hub supply points
  WORLD.supplies.push({ kind: 'terminal', x: 9.5, z: 4.5, ry: -0.6, d: 'hub' }, { kind: 'cache', x: -33, z: 34, d: 'hub' }, { kind: 'cache', x: 34, z: -33, d: 'hub' });
  for (const sp of WORLD.supplies) supplyProp(g, sp);
  adsBuildWorld(g);   // sponsor slots (ads.js): claim their billboards, hang a flyer by each terminal

  WORLD.mesh = gNear.build(); WORLD.meshFar = gFar.build(); WORLD.meshProps = gProps.build(); WORLD.meshGarden = gGarden.build(); WORLD.meshForest = gForest.build(); WORLD.meshSub = gSub.build();

  WORLD.train = { x: 34, wait: 0 };   // stalled over the plaza since the outbreak
}

function drawCityDynamic(time) {
  const T = WORLD.train;
  if (T.wait <= 0 && (T.x - PLAYER.x) ** 2 + (-24 - PLAYER.z) ** 2 < 260 * 260) for (let i = 0; i < 5; i++) {
    const x = T.x - i * 13.5;
    drawItem(MESH.metal, M4.trs(poolM(), x, 26.1, -24, 0, 0, 0, 13, 3, 2.8), [0.16, 0.16, 0.2]);
    drawItem(MESH.box, M4.trs(poolM(), x, 26.4, -24, 0, 0, 0, 12, 0.9, 2.9), [0.04, 0.045, 0.05]);   // dark, dead windows
  }
  // fountain hologram: rotating rings + beam
  if (PLAYER.x * PLAYER.x + PLAYER.z * PLAYER.z > 190 * 190) return;
  for (let i = 0; i < 3; i++) {
    const m = M4.trs(poolM(), 0, 4.5 + i * 0.3, 0, 0.5 + i * 0.4 + Math.sin(time * 0.5 + i) * 0.2, time * (0.4 + i * 0.25), 0.3 * i, 2.2 + i * 0.7, 2.2 + i * 0.7, 2.2 + i * 0.7);
    drawItem(MESH.ring, m, [0.2, 0.9, 1.0], [0.3, 1.6, 2.2]);
  }
  drawItem(MESH.cyl, M4.trs(poolM(), 0, 8, 0, 0, 0, 0, 0.12, 12, 0.12), [0.4, 1, 1], [0.6, 2.2, 2.6]);
  const pulse = 0.5 + 0.5 * Math.sin(time * 2);
  drawItem(MESH.sphere, M4.trs(poolM(), 0, 4.8 + Math.sin(time) * 0.2, 0, time, time * 0.7, 0, 0.9, 0.9, 0.9), [0.3, 0.9, 1], [0.6 + pulse, 2 + pulse, 2.6 + pulse]);
}
