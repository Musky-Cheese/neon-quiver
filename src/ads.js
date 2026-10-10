/* ============================================================
   Sponsor ad slots: a fixed registry of placements in the city and the Armory.
   Who fills a slot comes from ads/sponsors.json ({ "<slot id>": { name, image, url } }), fetched after boot without
   blocking it. An unsold slot reads PUT YOUR COMPANY AD HERE in the city's neon style; ?ads=demo adds each slot's
   id and art size, for sales-sheet shots. Every slot takes the same art: one AD_SIZE (2:1) image from a sponsor
   fits all of them. World slots are ordinary WORLD.signs entries in the holo billboards' own 512×256 additive batch,
   so they light, bloom, fog and reflect like the rest of the neon and compile nothing new (every sign batch is its
   own shader program, so a 1024×512 batch would add two per MSAA mode); the art is resampled to fit that layer.
   A sponsor's image is drawn into the slot's canvas and that one texture-array layer re-uploaded.
   ============================================================ */

// one art size for every slot: logo inside the centred safe area, light art on dark or clear reads best at night
const AD_SIZE = [1024, 512], AD_SAFE = [896, 384], AD_MAX_KB = 500;
const AD_LAYER = [512, 256];   // what a world slot draws into: a layer of the billboard batch, same 2:1 aspect
const ADS_CONTACT = '@fouadmoabi8';   // advertisers DM this X (Twitter) handle; the title card shows it, empty hides the line
// world: a billboard picked by its spot on the plaza ring (the city layout decides where they are; these are the
// biggest ones the title orbit and the spawn view show), or a flyer hung beside each Armory terminal
const ADS = {
  demo: new URLSearchParams(location.search).get('ads') === 'demo',
  slots: [
    { id: 'title-1', kind: 'world', at: [-15.9, 33.2, -42.1], note: 'plaza, north facade (title orbit)' },
    { id: 'title-2', kind: 'world', at: [42.1, 31.1, -13.8], note: 'plaza, east facade (title orbit)' },
    { id: 'title-3', kind: 'world', at: [-42.1, 29.4, 15], note: 'plaza, west facade (title orbit)' },
    { id: 'title-4', kind: 'world', at: [42.1, 26.5, 33.4], note: 'plaza, east facade by the south corner (title orbit)' },
    { id: 'spawn', kind: 'world', at: [14.8, 24.6, -42.1], note: 'straight ahead of the player when wave 1 starts' },
    ...['hub', 'yard', 'market', 'docks', 'warrens', 'suburbs', 'garden', 'metro', 'refinery'].map(d => ({ id: 'terminal-' + d, kind: 'terminal', d, note: 'flyer beside the ' + d + ' Armory terminal' })),
    { id: 'armory', kind: 'ui', note: 'SPONSORED card in the Armory menu' },
  ],
  stats: {},        // seconds each slot has been on screen (in view, in range, facing the camera); in memory only
  manifest: null,
};
for (const s of ADS.slots) ADS.stats[s.id] = 0;
const adsSlot = (id) => ADS.slots.find(s => s.id === id);

// the unsold / demo art: one neon panel per slot, in the sign colours of the street
const ADS_COL = [['#29e7ff', 'rgba(41,231,255,0.42)', 'rgba(120,40,255,0.22)'], ['#ff2e88', 'rgba(255,46,136,0.42)', 'rgba(70,0,100,0.25)'], ['#ffb52e', 'rgba(255,140,40,0.36)', 'rgba(120,30,0,0.22)']];
function adsDrawPitch(cv, slot, i) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / 512, [c, g0, g1] = ADS_COL[i % ADS_COL.length], small = slot.kind === 'terminal';
  const F = (s) => `700 ${s}px "Quiver Cn", "TeX Gyre Heros Cn", "Arial Narrow", sans-serif`;
  const sw = W * AD_SAFE[0] / AD_SIZE[0];   // the text keeps to the same safe area a sponsor's logo does
  const glowText = (t, cx, cy, s) => { s *= k; x.font = F(s); while (x.measureText(t).width > sw && s > 16) x.font = F(s -= 4);
    x.fillStyle = c; x.shadowColor = c; x.shadowBlur = 22 * k; x.fillText(t, cx, cy); x.shadowBlur = 0; x.fillStyle = '#fff'; x.globalAlpha = 0.6; x.fillText(t, cx, cy); x.globalAlpha = 1; };
  x.clearRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, g0); g.addColorStop(1, g1); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = c; x.lineWidth = 6 * k; x.shadowColor = c; x.shadowBlur = 16 * k; x.strokeRect(10 * k, 10 * k, W - 20 * k, H - 20 * k); x.shadowBlur = 0;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const tag = ADS.demo ? `${slot.id} · ${AD_SIZE[0]}×${AD_SIZE[1]}` : '';
  if (small) glowText('YOUR AD HERE', W / 2, tag ? H * 0.42 : H / 2, 96);
  else { glowText('PUT YOUR COMPANY', W / 2, tag ? H * 0.3 : H * 0.36, 70); glowText('AD HERE', W / 2, tag ? H * 0.58 : H * 0.68, 84); }
  if (tag) { x.font = `400 ${26 * k}px "Quiver Cn", "TeX Gyre Heros Cn", "Arial Narrow", sans-serif`; x.fillStyle = '#eef6ff'; x.shadowColor = c; x.shadowBlur = 10 * k; x.fillText(tag, W / 2, H * 0.84); x.shadowBlur = 0; }
}
// a sponsor's art, fitted whole inside the panel (black reads as clear on an additive sign, so letterboxing is free)
function adsDrawImage(cv, img) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  x.clearRect(0, 0, W, H); x.imageSmoothingQuality = 'high'; x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

// called from buildCity once the districts and supply points exist, before the signs are batched (r3.js buildSigns)
function adsBuildWorld(g) {
  const M = M4.create(), box = (x, y, z, sx, sy, sz, c, e, ry) => g.box(M4.trs(M, x, y, z, 0, ry, 0, sx, sy, sz), c, e, 0);
  const holo = WORLD.signs.filter(s => s.mode === 1 && s.add && s.tex.image.width === AD_LAYER[0] && s.tex.image.height === AD_LAYER[1]);
  const art = () => { const cv = document.createElement('canvas'); cv.width = AD_LAYER[0]; cv.height = AD_LAYER[1]; return cv; };
  let i = 0;
  for (const slot of ADS.slots) {
    if (slot.kind === 'world') {
      // the billboard nearest the anchor takes the slot; if the city moved, the slot just isn't placed
      let best = null, bd = 36;
      for (const s of holo) { const d = (s.m[12] - slot.at[0]) ** 2 + (s.m[13] - slot.at[1]) ** 2 + (s.m[14] - slot.at[2]) ** 2; if (d < bd && !s.slot) { bd = d; best = s; } }
      if (!best) continue;
      const cv = art(); adsDrawPitch(cv, slot, i++);
      best.tex = canvasTex(cv); best.slot = slot.id; if (best.seed % 1 < 0.08) best.seed += 0.1;   // never one of the dead-sign seeds
      slot.sign = best;
    } else if (slot.kind === 'terminal') {
      const t = WORLD.supplies.find(s => s.kind === 'terminal' && s.d === slot.d); if (!t) continue;
      // a 1.2 × 0.6 m flyer on an arm off the terminal's side, facing the same way as its screen, on whichever side is clear
      const ry = t.ry || 0, fx = Math.sin(ry), fz = Math.cos(ry), rx = fz, rz = -fx, off = 1.42, y = 1.95;
      const clear = (sd) => { const cx = t.x + rx * off * sd, cz = t.z + rz * off * sd;
        for (const b of WORLD.boxes) if (b.y1 > 1.5 && b.y0 < 2.4 && cx + 0.75 > b.x0 && cx - 0.75 < b.x1 && cz + 0.75 > b.z0 && cz - 0.75 < b.z1 && !(b.x0 === t.x - 0.75 && b.z0 === t.z - 0.75)) return false;
        for (const c of WORLD.circles) if (Math.hypot(c.x - cx, c.z - cz) < c.r + 0.7 && (c.h || 9) > 1.5) return false;
        return true; };
      const sd = clear(1) ? 1 : clear(-1) ? -1 : 0; if (!sd) continue;
      const cx = t.x + rx * off * sd, cz = t.z + rz * off * sd;
      box(t.x + rx * ((0.65 + off) / 2) * sd, 2.33, t.z + rz * ((0.65 + off) / 2) * sd, off - 0.6, 0.05, 0.06, [0.1, 0.1, 0.12], 0, ry);                    // arm off the terminal's top
      box(cx - fx * 0.02, y, cz - fz * 0.02, 1.28, 0.68, 0.035, [0.05, 0.05, 0.07], 0, ry);                                                                  // backing plate
      box(cx - fx * 0.02, y - 0.37, cz - fz * 0.02, 1.28, 0.03, 0.05, NEON.cyan, 2.2, ry);                                                                  // lit sill, like the terminal's cap
      const cv = art(); adsDrawPitch(cv, slot, i++);
      const s = { tex: canvasTex(cv), m: M4.trs(M4.create(), cx + fx * 0.004, y, cz + fz * 0.004, 0, ry, 0, 1.2, 0.6, 1), col: [1.4, 1.4, 1.4], mode: 0, seed: 0.5, add: true, slot: slot.id };
      WORLD.signs.push(s); slot.sign = s;
    }
  }
}

// after boot: the Armory card, then the manifest (never in demo mode, which always shows the pitch)
function adsInit() {
  adsCard();
  const ct = document.getElementById('adContact');
  if (ct && ADS_CONTACT) {
    const a = document.createElement('a'); a.href = 'https://x.com/' + encodeURIComponent(ADS_CONTACT.replace(/^@/, '')); a.target = '_blank'; a.rel = 'noopener'; a.textContent = ADS_CONTACT;
    a.addEventListener('click', e => e.stopPropagation());   // a link out, never a click into the game
    ct.replaceChildren('DM ', a, ' on X (Twitter)'); ct.hidden = false;
  }
  if (ADS.demo) return;
  fetch('ads/sponsors.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(m => {
    if (!m || typeof m !== 'object') return;
    ADS.manifest = m;
    for (const slot of ADS.slots) {
      const e = m[slot.id]; if (!e || typeof e !== 'object' || typeof e.image !== 'string' || !e.image) continue;
      const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
      img.onload = () => {
        if (slot.kind === 'ui') { adsCard(); return; }
        if (!slot.sign) return;
        try { adsDrawImage(slot.sign.tex.image, img); slot.sign.tex.needsUpdate = true; signLayerRefresh(slot.sign.tex); } catch (err) { }   // a cross-origin image without CORS can't be read back: keep the pitch
      };
      img.src = e.image; slot.img = img;
    }
  }).catch(() => { });
}
const adsUrl = (u) => { try { const x = new URL(u, location.href); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; } };
// the Armory's SPONSORED card: the sponsor's art (a link only when the manifest gives a url), else the pitch
function adsCard() {
  const el = document.getElementById('aqSpon'); if (!el) return;
  const slot = adsSlot('armory'), e = (ADS.manifest && ADS.manifest.armory) || null, url = e && e.url ? adsUrl(e.url) : null;
  const art = el.querySelector('.aq-sponart');
  if (!ADS.demo && e && slot.img && slot.img.complete && slot.img.naturalWidth) {
    art.textContent = ''; const im = document.createElement('img'); im.src = slot.img.src; im.alt = e.name || 'Sponsor'; art.appendChild(im); art.classList.add('img');
  } else {
    art.classList.remove('img');
    art.innerHTML = '<span>PUT YOUR COMPANY</span><span>AD HERE</span>' + (ADS.demo ? `<small>armory · ${AD_SIZE[0]}×${AD_SIZE[1]}</small>` : '');
  }
  if (url && !ADS.demo) { el.href = url; el.target = '_blank'; el.rel = 'noopener sponsored'; el.classList.add('live'); el.setAttribute('aria-label', 'Sponsored: ' + (e.name || url)); }
  else { el.removeAttribute('href'); el.removeAttribute('target'); el.removeAttribute('rel'); el.classList.remove('live'); el.setAttribute('aria-label', 'Sponsored slot'); }
}
// per frame: on-screen seconds per slot. A world slot counts when it is within sign range, inside a cone round the
// view direction and facing the camera (no occlusion test); the Armory card counts while the Armory is open
function adsTick(dt) {
  if (GAME.state === 'shop') { ADS.stats.armory += dt; return; }
  const cx = camM[12], cy = camM[13], cz = camM[14], fx = -camM[8], fy = -camM[9], fz = -camM[10];
  for (const slot of ADS.slots) {
    const s = slot.sign; if (!s) continue; const m = s.m;
    const dx = m[12] - cx, dy = m[13] - cy, dz = m[14] - cz, d = Math.hypot(dx, dy, dz); if (d > 260 || d < 0.5) continue;
    if ((dx * fx + dy * fy + dz * fz) / d < 0.72) continue;
    const nl = Math.hypot(m[8], m[9], m[10]); if ((dx * m[8] + dy * m[9] + dz * m[10]) / (d * nl) > -0.15) continue;
    ADS.stats[slot.id] += dt;
  }
}
