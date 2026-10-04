/* ---------------- controls screen: rebinding. (Gamepad support lives further down.) ---------------- */
const BIND_NAMES = { fwd: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', sprint: 'Sprint', jump: 'Jump', hook: 'Grappling hook', use: 'Use terminal', next: 'Start next wave', last: 'Last arrow', pause: 'Pause' };
const CTRL = { from: 'title', listen: null, clash: '' };
function refreshKeyLabels() {
  for (const el of document.querySelectorAll('[data-k]')) el.textContent = el.dataset.k.split(' ').map(hint).join(' ') + (el.dataset.esc ? ' / Esc' : '');
}
function renderControls() {
  const list = $('ctrlList'); list.textContent = '';
  for (const a in BIND_DEFAULTS) {
    const l = document.createElement('span'); l.textContent = BIND_NAMES[a];
    const b = document.createElement('button'); b.type = 'button'; b.className = 'linkbtn' + (CTRL.listen === a ? ' listening' : ''); b.dataset.act = a;
    b.textContent = CTRL.listen === a ? 'Press a key…' : hint(a); b.addEventListener('click', () => { CTRL.listen = CTRL.listen === a ? null : a; CTRL.clash = ''; renderControls(); });
    list.append(l, b);
  }
  const c = document.createElement('div'); c.className = 'ctrl-clash'; c.textContent = CTRL.clash; list.append(c);
}
function openControls() { CTRL.from = GAME.state === 'paused' ? 'pause' : 'title'; CTRL.listen = null; CTRL.clash = ''; renderControls(); setScreen('controls'); }
function closeControls() { CTRL.listen = null; setScreen(CTRL.from); refreshKeyLabels(); }
function rebind(a, code) {
  if (/^Digit[1-7]$/.test(code) || /^Arrow/.test(code) || code === 'ShiftRight') { CTRL.clash = `${keyLabel(code)} is reserved`; return; }
  if (code === 'Escape') { CTRL.listen = null; CTRL.clash = ''; return; }
  const other = Object.keys(BINDS).find(o => o !== a && BINDS[o] === code);
  CTRL.clash = other ? `${keyLabel(code)} was ${BIND_NAMES[other].toLowerCase()}: swapped` : '';
  if (other) BINDS[other] = BINDS[a];
  BINDS[a] = code; CTRL.listen = null; saveLS('nq_binds', BINDS);
}
function wireControls() {
  for (const n of ['', '2']) $('ctrlBtn' + n).addEventListener('click', () => { AUD.click(); openControls(); });
  $('ctrlBack').addEventListener('click', () => { AUD.click(); closeControls(); });
  $('ctrlReset').addEventListener('click', () => { AUD.click(); Object.assign(BINDS, BIND_DEFAULTS); saveLS('nq_binds', BINDS); CTRL.listen = null; CTRL.clash = ''; renderControls(); });
  // capture phase: while the screen is open, keys belong to it and never reach the game's handlers
  addEventListener('keydown', (e) => {
    if ($('scr-controls').hidden) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (CTRL.listen) { if (e.code === 'Escape' && !e.repeat) { CTRL.listen = null; CTRL.clash = ''; } else if (!e.repeat) { if (/^(Shift|Control|Alt|Meta)/.test(e.code) && !/^Shift/.test(e.code)) return; rebind(CTRL.listen, e.code); } renderControls(); }
    else if (e.code === 'Escape' && !e.repeat) closeControls();
  }, true);
  refreshKeyLabels();
}

/* ---------------- gamepad (standard mapping) ----------------
   padPoll(dt) runs once per step. In play it feeds the same actions the keyboard and mouse call (actDrawStart, actHookDown,
   selectArrow ...), the sticks feed INPUT.dx/dy and PAD.mx/mz. Outside play it moves focus around the DOM menus. */
const PAD = { idx: -1, gp: null, ps: false, last: 'kbm', mx: 0, mz: 0, lx: 0, ly: 0, jump: false, sprint: false, sprintOn: false,
  cur: new Uint8Array(20), prev: new Uint8Array(20), mask: new Uint8Array(20), rumbleT: 0, scr: '', navT: 0, navDir: 0 };
const PAD_LOOK_RATE = 1500;   // px/s at full deflection, the same units as mouse dx; PAD.lx/ly are already curved
const PAD_GLYPH = { use: 'X', next: 'D-PAD UP', hook: 'LT', last: 'Y', pause: 'START', jump: 'A', sprint: 'L3', fwd: 'L STICK', back: 'L STICK', left: 'L STICK', right: 'L STICK' };
const PAD_GLYPH_PS = { use: 'SQUARE', next: 'D-PAD UP', hook: 'L2', last: 'TRIANGLE', pause: 'OPTIONS', jump: 'CROSS', sprint: 'L3', fwd: 'L STICK', back: 'L STICK', left: 'L STICK', right: 'L STICK' };
function padGlyph(act) { return '[' + ((PAD.ps ? PAD_GLYPH_PS : PAD_GLYPH)[act] || keyLabel(BINDS[act])) + ']'; }
function padRumble(weak, strong, ms) {
  if (!PAD.gp || PAD.last !== 'pad' || !SETTINGS.vibration) return;
  const a = PAD.gp.vibrationActuator; if (!a || !a.playEffect) return;
  try { const r = a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong }); if (r && r.catch) r.catch(() => { }); } catch (e) { }
}
function padSetLast(v) { if (PAD.last === v) return; PAD.last = v; document.body.classList.toggle('padnav', v === 'pad'); if (v === 'pad') PAD.scr = ''; }
function padConnect(gp) {
  PAD.gp = gp; PAD.idx = gp ? gp.index : -1; PAD.cur.fill(0); PAD.prev.fill(0); PAD.mask.fill(0); PAD.sprintOn = false;
  if (gp) { PAD.ps = /054c|playstation|dualshock|dualsense/i.test(gp.id); document.body.classList.add('haspad'); if (GAME.toast) GAME.toast('CONTROLLER CONNECTED', '#bff6ff'); }
  else { PAD.mx = PAD.mz = PAD.lx = PAD.ly = 0; PAD.jump = PAD.sprint = false; if (GAME.state === 'playing' && PAD.last === 'pad') GAME.pause(); if (GAME.toast) GAME.toast('CONTROLLER DISCONNECTED', '#ffb52e'); }
}
const _st = [0, 0];
// radial deadzone: out = direction * rescaled magnitude (0 inside the zone); returns the magnitude
function padStick(x, y, dz, curve, out) {
  const m = Math.hypot(x, y); if (m <= dz) { out[0] = 0; out[1] = 0; return 0; }
  const k = Math.min(1, (m - dz) / (1 - dz)), c = curve === 1 ? k : Math.pow(k, curve); out[0] = x / m * c; out[1] = y / m * c; return k;
}
function padLook(dt) { if (PAD.lx || PAD.ly) { const r = PAD_LOOK_RATE * SETTINGS.padSens * dt; INPUT.dx += PAD.lx * r; INPUT.dy += PAD.ly * r; } }
function padPoll(dt) {
  const list = navigator.getGamepads ? navigator.getGamepads() : null; let gp = null;
  if (list) for (let i = 0; i < list.length; i++) { const g = list[i]; if (g && g.connected !== false && g.mapping === 'standard') { gp = g; break; } }
  if ((gp ? gp.index : -1) !== PAD.idx) padConnect(gp);
  if (!gp) return;
  PAD.gp = gp;
  const B = gp.buttons, A = gp.axes, cur = PAD.cur, prev = PAD.prev, n = Math.min(B.length, 17);
  let any = false;
  for (let i = 0; i < n; i++) {
    prev[i] = cur[i]; const b = B[i];
    cur[i] = (i === 6 || i === 7 ? b.value > (prev[i] ? 0.2 : 0.35) : b.pressed) ? 1 : 0;
    if (cur[i] && !prev[i]) any = true;
  }
  const dz = SETTINGS.padZone;
  padStick(A[0] || 0, A[1] || 0, dz, 1, _st); const mx = _st[0], mz = _st[1], lm = Math.hypot(mx, mz);
  padStick(A[2] || 0, A[3] || 0, dz, 1.7, _st); const lx = _st[0], ly = _st[1];
  if (lm > 0 || lx || ly) any = true;
  if (any) padSetLast('pad');
  const wasPlaying = GAME.state === 'playing';
  if (wasPlaying) padPlay(dt, mx, mz, lm, lx, ly); else padMenu(dt, mx, mz);
  if (!wasPlaying) {   // whatever the menus did (even starting the run), buttons held now stay dead once play begins
    PAD.mx = PAD.mz = PAD.lx = PAD.ly = 0; PAD.jump = PAD.sprint = false; PAD.sprintOn = false; for (let i = 0; i < 20; i++) PAD.mask[i] = cur[i];
  }
}
function padPlay(dt, mx, mz, lm, lx, ly) {
  const cur = PAD.cur, prev = PAD.prev, mask = PAD.mask;
  // a button still held from a menu (the A that started the run) stays dead until it's let go
  for (let i = 0; i < 20; i++) if (mask[i]) { if (!cur[i]) mask[i] = 0; else { cur[i] = 0; prev[i] = 0; } }
  const down = (i) => cur[i] && !prev[i], up = (i) => !cur[i] && prev[i];
  PAD.mx = mx; PAD.mz = mz; PAD.lx = lx; PAD.ly = ly;
  PAD.jump = !!cur[0];
  if (down(10)) PAD.sprintOn = !PAD.sprintOn;
  if (lm < 0.1) PAD.sprintOn = false;
  PAD.sprint = PAD.sprintOn;
  if (down(7)) actDrawStart(); if (up(7)) actDrawEnd();
  if (down(6)) actHookDown(); if (up(6)) actHookUp();
  if (down(1)) { if (HOOK.state === 'reel') hookFire(); else bowCancel(); }
  if (down(2) && GAME.nearTerminal) { GAME.openShop(); return; }
  if (down(3)) selectArrow(GAME.lastType);
  if (down(4)) actCycleArrow(-1);
  if (down(5)) actCycleArrow(1);
  if (down(12) && GAME.intermission) GAME.interT = 0;
  if (down(9)) { GAME.pause(); return; }
  if (BOW.state === 'drawing') { PAD.rumbleT -= dt; if (PAD.rumbleT <= 0) { PAD.rumbleT = 0.1; padRumble(0.04 + 0.22 * BOW.draw, 0, 130); } } else PAD.rumbleT = 0;
}
/* menus: spatial focus navigation over whichever .screen is showing */
const PAD_DEFAULT_FOCUS = { title: 'playBtn', pause: 'resumeBtn', over: 'againBtn', shop: 'nextWaveBtn', controls: 'ctrlBack', custom: 'customStart' };
function padVisible(el) { return !el.disabled && el.offsetParent !== null; }
function padNavigable(scr) { return Array.prototype.filter.call(scr.querySelectorAll('button, input, select'), padVisible); }
function padMove(scr, dx, dy) {
  const cur = document.activeElement && scr.contains(document.activeElement) && padVisible(document.activeElement) ? document.activeElement : null;
  if (cur && dx && cur.type === 'range') { const st = +cur.step || 1; cur.value = clamp(+cur.value + dx * st * (cur.max - cur.min > 20 ? 2 : 1), +cur.min, +cur.max); cur.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (cur && dx && cur.tagName === 'SELECT') { const i = clamp(cur.selectedIndex + dx, 0, cur.options.length - 1); if (i !== cur.selectedIndex) { cur.selectedIndex = i; cur.dispatchEvent(new Event('change', { bubbles: true })); } return; }
  const list = padNavigable(scr); if (!list.length) return;
  if (!cur) { padFocus(list[0]); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2; let best = null, bs = 1e9;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect(), ex = r.left + r.width / 2 - cx, ey = r.top + r.height / 2 - cy, along = ex * dx + ey * dy;
    if (along < 2) continue;
    const sc = along + Math.abs(ex * dy - ey * dx) * 2; if (sc < bs) { bs = sc; best = el; }
  }
  if (best) padFocus(best);
}
function padFocus(el) { el.focus({ preventScroll: true }); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); AUD.tick && AUD.ctx && AUD.tick(); }
function padActivate(el) {
  if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); }
  else if (el.type !== 'range') el.click();
}
function padMenu(dt, mx, mz) {
  const cur = PAD.cur, prev = PAD.prev;
  if (PAD.last !== 'pad') return;
  const scr = Array.prototype.find.call(document.querySelectorAll('.screen'), (e) => !e.hidden); if (!scr) return;
  if (CTRL.listen) return;   // rebinding wants the keyboard
  const id = scr.id.slice(4);
  if (PAD.scr !== id) {   // a new screen: start on its main button
    PAD.scr = id; PAD.navT = 0; PAD.navDir = 0;
    let el = $(PAD_DEFAULT_FOCUS[id]); if (id === 'shop') el = scr.querySelector('#shopGrid button:not(.off)') || el;
    if (el && padVisible(el)) padFocus(el); return;
  }
  const down = (i) => cur[i] && !prev[i];
  // direction: d-pad or left stick, once on press then repeating
  let dx = 0, dy = 0;
  if (cur[14] || mx < -0.5) dx = -1; else if (cur[15] || mx > 0.5) dx = 1; else if (cur[12] || mz < -0.5) dy = -1; else if (cur[13] || mz > 0.5) dy = 1;
  const dir = dx ? dx * 2 : dy;   // distinct non-zero id per direction
  if (!dir) PAD.navDir = 0;
  else if (dir !== PAD.navDir) { PAD.navDir = dir; PAD.navT = 0.38; padMove(scr, dx, dy); }
  else { PAD.navT -= dt; if (PAD.navT <= 0) { PAD.navT = 0.11; padMove(scr, dx, dy); } }
  if (down(0)) { const el = document.activeElement; if (el && scr.contains(el) && padVisible(el)) padActivate(el); }
  if (down(1)) {
    if (id === 'controls') closeControls(); else if (id === 'pause') GAME.resume(); else if (id === 'shop') $('nextWaveBtn').click();
  }
  if (down(9)) { if (id === 'pause') GAME.resume(); else if (id === 'title') $('playBtn').click(); }
}
window.NQ.PAD = PAD; window.NQ.padPoll = padPoll; window.NQ.CTRL = CTRL; window.NQ.hint = hint;
