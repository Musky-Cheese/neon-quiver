/* ============================================================
   16-segment neon-tube lettering (logo, banners, signs)
   Cell: x 0..1, y 0..2 (y down)
   ============================================================ */
const SEG_LINES = {
  a1: [0, 0, .5, 0], a2: [.5, 0, 1, 0], b: [1, 0, 1, 1], c: [1, 1, 1, 2], d2: [1, 2, .5, 2], d1: [.5, 2, 0, 2],
  e: [0, 2, 0, 1], f: [0, 1, 0, 0], g1: [0, 1, .5, 1], g2: [.5, 1, 1, 1],
  h: [0, 0, .5, 1], i: [.5, 0, .5, 1], j: [1, 0, .5, 1], k: [0, 2, .5, 1], l: [.5, 1, .5, 2], m: [.5, 1, 1, 2],
  v1: [0, 1, .5, 2], v2: [1, 1, .5, 2],
};
const SEG_ALL = Object.keys(SEG_LINES).filter(k => k[0] !== 'v');
const SEG_MAP = {
  A: 'a1 a2 b c e f g1 g2', B: 'a1 a2 b c d1 d2 i l g2', C: 'a1 a2 f e d1 d2', D: 'a1 a2 b c d1 d2 i l',
  E: 'a1 a2 f e d1 d2 g1', F: 'a1 a2 f e g1', G: 'a1 a2 f e d1 d2 c g2', H: 'f e b c g1 g2', I: 'a1 a2 i l d1 d2',
  J: 'b c d1 d2 e', K: 'f e g1 j m', L: 'f e d1 d2', M: 'f e h j b c', N: 'f e h m c b', O: 'a1 a2 b c d1 d2 e f',
  P: 'a1 a2 b f e g1 g2', Q: 'a1 a2 b c d1 d2 e f m', R: 'a1 a2 b f e g1 g2 m', S: 'a1 a2 f g1 g2 c d1 d2', T: 'a1 a2 i l',
  U: 'f e d1 d2 c b', V: 'f b v1 v2', W: 'f e k m c b', X: 'h j k m', Y: 'h j l', Z: 'a1 a2 j k d1 d2',
  0: 'a1 a2 b c d1 d2 e f j k', 1: 'b c', 2: 'a1 a2 b g1 g2 e d1 d2', 3: 'a1 a2 b c d1 d2 g2', 4: 'f g1 g2 b c',
  5: 'a1 a2 f g1 g2 c d1 d2', 6: 'a1 a2 f e d1 d2 c g1 g2', 7: 'a1 a2 b c', 8: 'a1 a2 b c d1 d2 e f g1 g2', 9: 'a1 a2 f b g1 g2 c d1 d2',
  '-': 'g1 g2', '+': 'g1 g2 i l', '/': 'j k', '\'': 'i', '"': 'f i', '=': 'g1 g2 d1 d2', '_': 'd1 d2', '*': 'g1 g2 h i j k l m',
  '<': 'j m', '>': 'h k', '(': 'j m', ')': 'h k', '%': 'a1 f g1 i l c d2 g2 j k', '?': 'a1 a2 b g2 l',
};
for (const k in SEG_MAP) SEG_MAP[k] = SEG_MAP[k].split(' ');

// width of text in px for height h
function segWidth(text, h, track = 0.42) { const w = h * 0.5; let n = 0; for (const ch of text) n += (ch === ' ' ? 0.7 : (ch === '.' || ch === '!' || ch === ':') ? 0.35 : 1); return n * w + Math.max(0, text.length - 1) * w * track; }

/* draw neon segment text. opts: color, glow, ghost, slant, track, weight, flicker(fn), align */
function segText(ctx, text, x, y, h, opts = {}) {
  const color = opts.color || '#ff2e88', core = opts.core || '#fff4fb', slant = opts.slant ?? 0.18, track = opts.track ?? 0.42;
  const w = h * 0.5, lw = Math.max(1.5, h * (opts.weight ?? 0.1)), gap = lw * 0.7;
  text = text.toUpperCase();
  const total = segWidth(text, h, track);
  let cx = x - (opts.align === 'center' ? total / 2 : opts.align === 'right' ? total : 0);
  const S = h / 2;
  const glyphs = [];
  let idx = 0;
  for (const ch of text) {
    const adv = (ch === ' ' ? 0.7 : (ch === '.' || ch === '!' || ch === ':') ? 0.35 : 1) * w;
    glyphs.push({ ch, x: cx, idx: idx++ });
    cx += adv + w * track;
  }
  const P = (gx, px, py) => [gx + px * w + (2 - py) * S * slant * 0.5, y - h / 2 + py * S];
  function segPath(g, name) {
    const L = SEG_LINES[name];
    let [x1, y1, x2, y2] = L;
    // shrink each segment so tubes have gaps at joints
    const dx = (x2 - x1) * w, dy = (y2 - y1) * S; const len = Math.hypot(dx, dy); const sh = Math.min(gap / len, 0.3);
    const ax = x1 + (x2 - x1) * sh, ay = y1 + (y2 - y1) * sh, bx = x2 - (x2 - x1) * sh, by = y2 - (y2 - y1) * sh;
    const a = P(g.x, ax, ay), b = P(g.x, bx, by);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  function dotPath(g, px, py) { const p = P(g.x, px, py); ctx.moveTo(p[0] + lw * 0.01, p[1]); ctx.arc(p[0], p[1], lw * 0.55, 0, TAU); }
  function glyphPath(g, on) {
    const ch = g.ch;
    if (ch === '.') { if (on) dotPath(g, 0.2, 2); return; }
    if (ch === ':') { if (on) { dotPath(g, 0.2, 0.6); dotPath(g, 0.2, 1.5); } return; }
    if (ch === '!') { if (on) { const a = P(g.x, 0.2, 0.05), b = P(g.x, 0.2, 1.45); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); dotPath(g, 0.2, 1.95); } return; }
    const segs = on ? (SEG_MAP[ch] || []) : SEG_ALL;
    for (const s of segs) segPath(g, s);
  }
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // ghost (unlit) tubes
  if (opts.ghost !== false) {
    ctx.beginPath(); for (const g of glyphs) if (g.ch !== ' ' && g.ch !== '.' && g.ch !== ':' && g.ch !== '!') glyphPath(g, false);
    ctx.strokeStyle = opts.ghostColor || 'rgba(255,255,255,0.05)'; ctx.lineWidth = lw; ctx.stroke();
  }
  const lit = [];
  for (const g of glyphs) { const f = opts.flicker ? opts.flicker(g.idx) : 1; if (f > 0.02) lit.push([g, f]); }
  // glow
  const glow = opts.glow ?? 1;
  for (const [g, f] of lit) {
    ctx.globalAlpha = f;
    if (glow > 0) {
      ctx.beginPath(); glyphPath(g, true);
      ctx.shadowColor = color; ctx.shadowBlur = h * 0.35 * glow; ctx.strokeStyle = color; ctx.lineWidth = lw * 1.9; ctx.stroke();
      ctx.shadowBlur = h * 0.12 * glow; ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.beginPath(); glyphPath(g, true);
    ctx.strokeStyle = color; ctx.lineWidth = lw * 1.25; ctx.stroke();
    ctx.strokeStyle = core; ctx.lineWidth = lw * 0.5; ctx.stroke();
    if (g.ch === '.' || g.ch === ':' || g.ch === '!') { ctx.fillStyle = core; ctx.fill(); }
  }
  ctx.restore();
  return total;
}
