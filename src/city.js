/* ============================================================
   The city: Sector 7 plaza + endless neon skyline
   ============================================================ */
const PLAZA = 40, RING = 74;   // plaza half-size; the inner ring of buildings reaches out to RING
const WORLD = {
  boxes: [],    // {x0,x1,y0,y1,z0,z1} solid for everyone
  circles: [],  // {x,z,r,h}
  signs: [],    // {tex,m,col,mode,seed,add}
  lights: [],   // static {p:[x,y,z], r, c:[r,g,b]}
  cars: [], train: null, mesh: null, spawns: [], supplies: [], fires: [], steam: [], halos: [],
  petals: [],   // [x, y, z, radius] blossom canopies that shed petals
  ponds: [],    // {x, z, rx, rz} shallow water you wade through
  navBlocks: [],   // {x0,x1,z0,z1} ground zombies never path through
};
const NEON = { mag: hex('#ff2e88'), cyan: hex('#29e7ff'), amber: hex('#ffb52e'), violet: hex('#b44dff'), red: hex('#ff3040'), lime: hex('#a6ff3a'), white: [1, 1, 1] };

function signTexture(text, color, style, vertical, sub) {
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
    x.font = `700 ${sub ? 64 : 84}px "Quiver Cn", "TeX Gyre Heros Cn", "Arial Narrow", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const y = sub ? H * 0.4 : H / 2;
    let fs = sub ? 64 : 84; while (x.measureText(text).width > W - 50 && fs > 20) { fs -= 4; x.font = `700 ${fs}px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif`; }
    x.fillText(text, W / 2, y); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.6; x.fillText(text, W / 2, y);
    if (sub) { x.globalAlpha = 1; x.font = `400 26px "Quiver Cn", "TeX Gyre Heros Cn", sans-serif`; x.fillStyle = color; x.fillText(sub, W / 2, H * 0.8); }
  }
  return canvasTex(cv);
}
function billboardTexture(kind) {
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
  const gNear = new Geo(), gFar = new Geo(), gProps = new Geo(), gGarden = new Geo(), gForest = new Geo(); let g = gNear;   // near: facades + ground (receive shadows); props: cast shadows too; far: skyline
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
  function building(x0, x1, z0, z1, h, face, opt = {}) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    const col = opt.col || facadeCols[Math.floor(R() * facadeCols.length)];
    B(cx, h / 2, cz, w, h, d, col, 0, opt.mat || 1);
    solid(x0, x1, 0, h, z0, z1);
    // setback tier
    if (R() < 0.6) { const h2 = r(10, 40), s = r(0.55, 0.8); B(cx, h + h2 / 2, cz, w * s, h2, d * s, col, 0, 1); if (R() < 0.5) B(cx, h + h2 + 0.3, cz, w * s + 0.3, 0.3, d * s + 0.3, neonPick(), 1.2); h += h2; }
    // roof bits
    B(cx, h + 0.6, cz, w, 1.2, d, [0.05, 0.05, 0.06]);
    for (let i = 0; i < 3; i++) B(cx + r(-w / 3, w / 3), h + 1.8, cz + r(-d / 3, d / 3), r(2, 4), r(1.5, 3), r(2, 4), [0.08, 0.08, 0.09], 0, 4);
    if (R() < 0.7) { const ax = cx + r(-w / 4, w / 4), az = cz + r(-d / 4, d / 4), ah = r(8, 22); B(ax, h + ah / 2, az, 0.3, ah, 0.3, [0.1, 0.1, 0.12]); B(ax, h + ah + 0.3, az, 0.7, 0.7, 0.7, NEON.red, 3); }
    // facade orientation
    let fx, fz, ry, tx, tz, span; // facade point & normal toward plaza
    if (face === '-z') { fz = z0 - 0.02; fx = cx; ry = Math.PI; tx = 1; tz = 0; span = w; }
    else if (face === '+z') { fz = z1 + 0.02; fx = cx; ry = 0; tx = 1; tz = 0; span = w; }
    else if (face === '-x') { fx = x0 - 0.02; fz = cz; ry = -Math.PI / 2; tx = 0; tz = 1; span = d; }
    else { fx = x1 + 0.02; fz = cz; ry = Math.PI / 2; tx = 0; tz = 1; span = d; }
    const nx = face === '-x' ? -1 : face === '+x' ? 1 : 0, nz = face === '-z' ? -1 : face === '+z' ? 1 : 0;
    const P = (along, y, out) => [fx + tx * along + nx * out, y, fz + tz * along + nz * out];
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
      const floors = Math.floor((h - 3) / 3.3);
      for (const a of [-span * 0.25, span * 0.2]) for (let f = 1; f < Math.min(floors, 7); f++) { const p = P(a, f * 3.3 + 0.6, 0.7); B(p[0], p[1], p[2], tx ? 3.2 : 1.3, 0.08, tz ? 3.2 : 1.3, [0.07, 0.07, 0.08], 0, 4); const q = P(a, f * 3.3 + 1.1, 1.3); B(q[0], q[1], q[2], tx ? 3.2 : 0.05, 0.9, tz ? 3.2 : 0.05, [0.06, 0.06, 0.07], 0, 4); }
      for (let i = 0; i < 4; i++) { const p = P(r(-span / 2 + 1, span / 2 - 1), r(3, h - 2), 0.35); B(p[0], p[1], p[2], tx ? 0.9 : 0.7, 0.6, tz ? 0.9 : 0.7, [0.14, 0.14, 0.15], 0, 4); }
      const pp = P(span / 2 - 0.6, h / 2, 0.2); B(pp[0], pp[1], pp[2], 0.18, h, 0.18, [0.1, 0.09, 0.08], 0, 4);
      const dc = neonPick(), dp = P(r(-span / 4, span / 4), 1.3, 0.04); B(dp[0], 1.3, dp[2], tx ? 1.4 : 0.08, 2.4, tz ? 1.4 : 0.08, [dc[0] * 0.25 + 0.05, dc[1] * 0.25 + 0.05, dc[2] * 0.25 + 0.05], 0.8);
      const dl = P(dp[0] - fx, 2.8, 0.3); B(dp[0] + nx * 0.3, 2.75, dp[2] + nz * 0.3, tx ? 0.5 : 0.25, 0.1, tz ? 0.5 : 0.25, [1, 0.85, 0.6], 3);
      WORLD.lights.push({ p: [dp[0] + nx * 2, 2.6, dp[2] + nz * 2], r: 9, c: [dc[0] * 1.2, dc[1] * 1.2, dc[2] * 1.2], shop: true });
      if (R() < 0.45) { const [txt, st] = signWords[sw++ % signWords.length]; const sp = P(dp[0] * tx + dp[2] * tz - (fx * tx + fz * tz), 3.6, 0.15); addSign(signTexture(txt, '#' + dc.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''), st), sp[0], sp[1], sp[2], ry, 5, 1.25, [1.5, 1.5, 1.5], 0, st !== 'panel'); }
      return;
    }
    // corner neon strips
    const nc = neonPick();
    for (const s of [-1, 1]) { const p = P(s * (span / 2 - 0.15), h / 2, 0.1); B(p[0], p[1], p[2], nx ? 0.2 : 0.25, h, nz ? 0.2 : 0.25, nc, 2.2); }
    // horizontal band
    if (R() < 0.6) { const y = r(12, Math.min(h - 4, 40)); const p = P(0, y, 0.12); B(p[0], y, p[2], tx ? span : 0.25, 0.35, tz ? span : 0.25, neonPick(), 2.2); }
    // storefront: glowing window + awning
    const sc = neonPick();
    const pw = P(0, 1.8, 0.05); B(pw[0], 1.8, pw[2], tx ? span * 0.8 : 0.1, 2.6, tz ? span * 0.8 : 0.1, [sc[0] * 0.3 + 0.1, sc[1] * 0.3 + 0.1, sc[2] * 0.3 + 0.1], 0.9);
    const pa = P(0, 3.6, 0.9); B(pa[0], 3.6, pa[2], tx ? span * 0.85 : 1.8, 0.2, tz ? span * 0.85 : 1.8, [0.05, 0.05, 0.07]);
    const pe = P(0, 3.5, 1.8); B(pe[0], 3.5, pe[2], tx ? span * 0.85 : 0.1, 0.12, tz ? span * 0.85 : 0.1, sc, 2.5);
    WORLD.lights.push({ p: P(0, 2.5, 3), r: 12, c: [sc[0] * 1.6, sc[1] * 1.6, sc[2] * 1.6], shop: true });
    // horizontal sign above storefront
    const [txt, st] = signWords[sw++ % signWords.length];
    const signW = Math.min(span * 0.7, 11), sp = P(r(-span * 0.1, span * 0.1), 5.2, 0.15);
    addSign(signTexture(txt, '#' + [nc, sc, NEON.amber][sw % 3].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''), st), sp[0], sp[1], sp[2], ry, signW, signW / 4, [1.6, 1.6, 1.6], 0, st !== 'panel');
    // vertical blade sign
    if (R() < 0.75) {
      const along = (R() < 0.5 ? -1 : 1) * (span / 2 - 2.5), vh = r(7, 12), vy = r(9, 16);
      const vp = P(along, vy, 1.2); const vc = neonPick();
      B(vp[0], vy, vp[2], tx ? 0.25 : 2.3, vh + 0.4, tz ? 0.25 : 2.3, [0.03, 0.03, 0.04]);
      const hexc = '#' + vc.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
      const t = signTexture(vertWords[vw++ % vertWords.length], hexc, 'font', true);
      // both faces of the blade (perpendicular to facade)
      const bry = ry + Math.PI / 2;
      addSign(t, vp[0] + tx * 0.14, vy, vp[2] + tz * 0.14, bry, 2.1, vh, [1.8, 1.8, 1.8], 0, true);
      addSign(t, vp[0] - tx * 0.14, vy, vp[2] - tz * 0.14, bry + Math.PI, 2.1, vh, [1.8, 1.8, 1.8], 0, true);
    }
    // holo billboard on some tall facades
    if (h > 45 && R() < 0.7) {
      const by = r(20, Math.min(h - 10, 34)), bw = Math.min(span * 0.8, 18); const bp = P(0, by, 0.4);
      addSign(billboardTexture(bb++ % 4), bp[0], by, bp[2], ry, bw, bw / 2, [1.3, 1.3, 1.3], 1, true);
    }
  }
  // north (+z) and south (-z) sides: span x [-64,-6] & [6,64]
  for (const side of [1, -1]) {
    for (const half of [-1, 1]) {
      let a = 6; while (a < 64) {
        const wdt = Math.min(r(12, 22), 64 - a); if (wdt < 6) break;
        const x0 = half > 0 ? a : -a - wdt, x1 = half > 0 ? a + wdt : -a;
        const depth = RING - PLAZA - 2.5, z0 = side > 0 ? PLAZA + 2.5 : -(PLAZA + 2.5) - depth, z1 = side > 0 ? PLAZA + 2.5 + depth : -(PLAZA + 2.5);
        building(x0, x1, z0, z1, r(28, 95), side > 0 ? '-z' : '+z');
        a += wdt + 0.01;
      }
    }
  }
  // east / west: span z [-42.5,-6] & [6,42.5]
  for (const side of [1, -1]) {
    for (const half of [-1, 1]) {
      let a = 6; while (a < PLAZA + 2.4) {
        const wdt = Math.min(r(12, 20), PLAZA + 2.5 - a); if (wdt < 5) break;
        const z0 = half > 0 ? a : -a - wdt, z1 = half > 0 ? a + wdt : -a;
        const depth = RING - PLAZA - 2.5, x0 = side > 0 ? PLAZA + 2.5 : -(PLAZA + 2.5) - depth, x1 = side > 0 ? PLAZA + 2.5 + depth : -(PLAZA + 2.5);
        building(x0, x1, z0, z1, r(28, 95), side > 0 ? '-x' : '+x');
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
    if (R() < 0.18) continue;
    const w = r(14, 26), d = r(14, 26);
    let h = r(35, 120) + (dist > 180 ? r(0, 140) : 0) + (R() < 0.06 ? r(120, 220) : 0);
    const col = facadeCols[Math.floor(R() * facadeCols.length)];
    B(x, h / 2, z, w, h, d, col, 0, 1);
    if (R() < 0.45) { const h2 = r(15, 60); B(x, h + h2 / 2, z, w * 0.6, h2, d * 0.6, col, 0, 1); h += h2; }
    if (R() < 0.5) { B(x, h + 0.5, z, w + 0.4, 0.5, d + 0.4, neonPick(), 1.6); }
    if (R() < 0.35) { const nc = neonPick(); B(x + w / 2, h / 2, z + d / 2, 0.6, h, 0.6, nc, 2); B(x - w / 2, h / 2, z + d / 2, 0.6, h, 0.6, nc, 2); }
    if (R() < 0.5) B(x, h + 6, z, 0.5, 12, 0.5, [0.1, 0.1, 0.1]), B(x, h + 12.4, z, 1.2, 1.2, 1.2, NEON.red, 4);
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
  for (let x = -420; x <= 420; x += 60) if (Math.abs(x) > 70) { B(x, 12, -24, 1.4, 24, 1.4, [0.07, 0.07, 0.08], 0, 4); if (Math.abs(x) < 170) WORLD.circles.push({ x, z: -24, r: 0.9, h: 24 }); }

  g = gProps;
  // ---------- plaza props ----------
  const metal = [0.13, 0.13, 0.16];
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
  // jersey barriers
  function barrier(x, z, rot) { propBarrier(g, x, z, rot); }
  barrier(-9, 24, 0); barrier(-5.5, 24.6, 0); barrier(11, -26, 0); barrier(27, 5, 1); barrier(-28, -9, 1); barrier(-5, -30, 0); barrier(6, 30, 0); barrier(30, -12, 1);
  // vending machines / kiosks
  function vend(x, z, ry, c) { const fx = ry === 0 ? 0 : ry > 0 ? 1 : -1, fz = ry === 0 ? -Math.sign(z) : 0; propVend(g, R, x, z, fx, fz, c); }
  vend(-14, 38.8, 0, NEON.cyan); vend(-12.6, 38.8, 0, NEON.mag); vend(19, -38.8, 0, NEON.amber); vend(38.8, 16, -1, NEON.mag); vend(-38.8, -20, 1, NEON.cyan);
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
  buildDistricts({ B, solid, building, lamp, barrier, vend, addSign, r, R, neonPick, facadeCols, setG: (k) => { g = k === 'props' ? gProps : k === 'far' ? gFar : k === 'garden' ? gGarden : gNear; }, getG: () => g, getForest: () => gForest });
  g = gProps;
  // hub supply points
  WORLD.supplies.push({ kind: 'terminal', x: 9.5, z: 4.5, ry: -0.6, d: 'hub' }, { kind: 'cache', x: -33, z: 34, d: 'hub' }, { kind: 'cache', x: 34, z: -33, d: 'hub' });
  for (const sp of WORLD.supplies) supplyProp(g, sp);

  WORLD.mesh = gNear.build(); WORLD.meshFar = gFar.build(); WORLD.meshProps = gProps.build(); WORLD.meshGarden = gGarden.build(); WORLD.meshForest = gForest.build();

  // no flying traffic: the city is dead (WORLD.cars stays empty)
  WORLD.train = { x: 34, speed: 0, wait: 0 };   // stalled over the plaza since the outbreak
}

const _pv = [0, 0, 0];
function updateCity(dt) {
  for (const c of WORLD.cars) { c.t += c.s * dt; if (c.t > 480) c.t = -480; if (c.t < -480) c.t = 480; }
  const T = WORLD.train;
  // the monorail is dead: it never moves
}
function drawCityDynamic(time) {
  for (const c of WORLD.cars) {
    const x = c.alongX ? c.t : c.off, z = c.alongX ? c.off : c.t, ry = c.alongX ? (c.s > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.s > 0 ? 0 : Math.PI);
    const L = c.big ? 9 : 4.2, W = c.big ? 3 : 1.8;
    const m = M4.trs(poolM(), x, c.h, z, 0, ry, 0, W, c.big ? 2.2 : 0.9, L); drawItem(MESH.metal, m, [0.12, 0.12, 0.15]);
    const f = M4.trs(poolM(), x + Math.sin(ry) * L / 2, c.h, z + Math.cos(ry) * L / 2, 0, ry, 0, W * 0.8, 0.2, 0.1); drawItem(MESH.box, f, [1, 1, 1], [3, 3, 2.6]);
    const b = M4.trs(poolM(), x - Math.sin(ry) * L / 2, c.h, z - Math.cos(ry) * L / 2, 0, ry, 0, W * 0.8, 0.2, 0.1); drawItem(MESH.box, b, [1, 0.1, 0.1], [4, 0.2, 0.3]);
    const u = M4.trs(poolM(), x, c.h - 0.5, z, 0, ry, 0, W * 0.9, 0.08, L * 0.9); drawItem(MESH.box, u, c.c, [c.c[0] * 2, c.c[1] * 2, c.c[2] * 2]);
  }
  const T = WORLD.train;
  if (T.wait <= 0) for (let i = 0; i < 5; i++) {
    const x = T.x - i * 13.5;
    drawItem(MESH.metal, M4.trs(poolM(), x, 26.1, -24, 0, 0, 0, 13, 3, 2.8), [0.16, 0.16, 0.2]);
    drawItem(MESH.box, M4.trs(poolM(), x, 26.4, -24, 0, 0, 0, 12, 0.9, 2.9), [0.04, 0.045, 0.05]);   // dark, dead windows
  }
  // fountain hologram: rotating rings + beam
  for (let i = 0; i < 3; i++) {
    const m = M4.trs(poolM(), 0, 4.5 + i * 0.3, 0, 0.5 + i * 0.4 + Math.sin(time * 0.5 + i) * 0.2, time * (0.4 + i * 0.25), 0.3 * i, 2.2 + i * 0.7, 2.2 + i * 0.7, 2.2 + i * 0.7);
    drawItem(MESH.ring, m, [0.2, 0.9, 1.0], [0.3, 1.6, 2.2]);
  }
  drawItem(MESH.cyl, M4.trs(poolM(), 0, 8, 0, 0, 0, 0, 0.12, 12, 0.12), [0.4, 1, 1], [0.6, 2.2, 2.6]);
  const pulse = 0.5 + 0.5 * Math.sin(time * 2);
  drawItem(MESH.sphere, M4.trs(poolM(), 0, 4.8 + Math.sin(time) * 0.2, 0, time, time * 0.7, 0, 0.9, 0.9, 0.9), [0.3, 0.9, 1], [0.6 + pulse, 2 + pulse, 2.6 + pulse]);
}
