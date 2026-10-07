/* ============================================================
   Field objectives: optional goals that turn up mid-wave (from wave 3)
   - UPLINK: stand in the beacon's ring for 20 s while runners converge (60 s limit)
   - NEST:   a pulsing hive keeps birthing the infected; the wave can't end until it dies
   - BOUNTY: a named Alpha (a souped-up elite) leads runner packs; bring it down inside 90 s
   - DROP:   a supply crate parachutes in; hold E beside it for 4 s to crack it open (55 s limit)
   All pay out scrap, score and supplies. One per wave at most, never on Warden waves.
   ============================================================ */
const OBJ = { cur: null, t: 0, armed: false, delay: 0, last: null };
const OBJ_COL = { uplink: '#a6ff3a', nest: '#ff3df0', bounty: '#ffd23a', drop: '#ff8a2e' };
const OBJ_NAME = { uplink: 'UPLINK', nest: 'NEST', bounty: 'ALPHA', drop: 'SUPPLY DROP' };
const ALPHA_NAMES = ['THE BUTCHER', 'OLD TOM', 'KNUCKLES', 'THE GRIN', 'MOTHER', 'BIG SAL', 'LOCKJAW', 'THE DEACON', 'PATIENT ZERO', 'HOLLOW JACK'];

function objReset() { OBJ.cur = null; OBJ.armed = false; OBJ.delay = 0; OBJ.last = null; mutReset(); }
// called when a wave starts
function objWaveStart(wave) {
  OBJ.cur = null; OBJ.armed = wave >= 3 && wave % 5 !== 0 && Math.random() < 0.75; OBJ.delay = rand(8, 18);
}
function objOpenSpot() {
  for (let t = 0; t < 30; t++) {
    const p = navSpawnPoint(25, 55); let ok = true;
    for (const [ox, oz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) { const k = navIdx(p[0] + ox, p[1] + oz); if (k < 0 || NAV.block[k]) { ok = false; break; } }
    if (ok) return p;
  }
  return navSpawnPoint(25, 55);
}
// a different objective from last time
function objPick() { const k = Object.keys(OBJ_COL).filter(t => t !== OBJ.last); return OBJ.last = pick(k); }
function objStart(type) {
  const [x, z] = objOpenSpot(), w = GAME.wave;
  if (type === 'uplink') {
    OBJ.cur = { type, x, z, r: 5, need: 20, prog: 0, limit: 60, t: 0, spawnT: 3 };
    GAME.showBanner('FIELD OBJECTIVE', 'HOLD THE DATA UPLINK · 20s INSIDE THE RING', OBJ_COL.uplink);
  } else if (type === 'nest') {
    const hp = 420 + w * 70;
    OBJ.cur = { type, x, z, hp, maxHp: hp, t: 0, spawnT: 2, flash: 0, y: 1.1 };
    GAME.showBanner('FIELD OBJECTIVE', 'DESTROY THE HIVE NEST BEFORE IT FLOODS THE STREETS', OBJ_COL.nest);
  } else if (type === 'bounty') {
    // a brute that shrugs off arrows, or a runner that's hard to pin down: either way it keeps calling its pack
    const s = navSpawnPoint(32, 60), brute = Math.random() < 0.55;
    const a = makeElite(spawnZombie(brute ? 'brute' : 'runner', s[0], s[1], w));
    a.hp *= brute ? 1 : 3.5; a.maxHp = a.hp; a.scale *= 1.1; a.speed *= brute ? 1.15 : 1.05; a.eyes = [2.8, 1.9, 0.25];
    a.alpha = pick(ALPHA_NAMES); a.mzAlpha = true; a.markT = 1e9;   // tagged through walls for as long as the bounty stands
    OBJ.cur = { type, x: a.x, z: a.z, a, limit: 90, t: 0, spawnT: 6 };
    GAME.showBanner('BOUNTY', `${a.alpha} LEADS THE PACK · TAKE IT DOWN IN 90s`, OBJ_COL.bounty);
    AUD.groan(PLAYER.at(a.x, a.z), 0.3, 0.55);
  } else {
    OBJ.cur = { type: 'drop', x, z, y: 62, landed: false, prog: 0, need: 4, limit: 55, t: 0, spawnT: 2, tick: 0 };
    GAME.showBanner('FIELD OBJECTIVE', 'SUPPLY DROP INBOUND · HOLD E AT THE CRATE TO CRACK IT', OBJ_COL.drop);
  }
  AUD.waveHorn(false);
}
function objFinish(ok) {
  const o = OBJ.cur; if (!o) return; const w = GAME.wave;
  if (o.type === 'bounty' && o.a) { o.a.markT = 0; if (!ok) o.a.alpha = null; }
  if (ok) {
    const scrap = (o.type === 'bounty' ? 60 : o.type === 'nest' ? 50 : o.type === 'drop' ? 35 : 40) + w * (o.type === 'bounty' ? 8 : 6);
    GAME.scrap += scrap; GAME.score += scrap * 14; hudScore();
    const title = { nest: 'NEST DESTROYED', uplink: 'UPLINK SECURED', bounty: 'BOUNTY CLAIMED', drop: 'DROP SECURED' }[o.type];
    if (o.type === 'drop') {
      // a full quiver, a top-up of every special you carry and a patch-up
      const P = PLAYER; P.ammo[0] = Math.max(P.ammo[0], P.quiverMax);
      for (const t of availTypes()) if (t) P.ammo[t] += ALLOT[t];
      P.hp = Math.min(P.maxHp, P.hp + 30); updateQuiverHUD(); AUD.heal();
      GAME.showBanner(title, `+${scrap} SCRAP · FULL QUIVER · +30 HP`, OBJ_COL.drop);
      burst(o.x, 1, o.z, 50, [2.6, 1.4, 0.4], 6, 0.7, 0.1, 2, 2);
    } else {
      GAME.showBanner(title, o.type === 'bounty' ? `${o.a.alpha} IS DOWN · +${scrap} SCRAP` : `+${scrap} SCRAP · SUPPLIES DROPPED`, OBJ_COL[o.type]);
      for (let k = 0; k < 3; k++) dropPickup(o.x + rand(-2, 2), o.z + rand(-2, 2), k === 0 ? 'health' : 'ammo');
    }
    AUD.cleared();
  } else GAME.showBanner('OBJECTIVE FAILED', { uplink: 'THE UPLINK WENT DARK', bounty: 'THE BOUNTY EXPIRED', drop: 'THE INFECTED LOOTED THE DROP', nest: '' }[o.type], '#ff3040');
  OBJ.cur = null;
}
function objNestAlive() { return !!(OBJ.cur && OBJ.cur.type === 'nest'); }
// GAME.onKill: was that the Alpha?
function objOnKill(z) { const o = OBJ.cur; if (o && o.type === 'bounty' && o.a === z) { o.x = z.x; o.z = z.z; objFinish(true); shake(0.5); } }

function updateObjectives(dt) {
  updateMutators(dt);
  if (GAME.state !== 'playing') return;
  if (!OBJ.cur && OBJ.armed && !GAME.intermission && GAME.wave > 0) {
    OBJ.delay -= dt;
    if (OBJ.delay <= 0) { OBJ.armed = false; objStart(objPick()); }
  }
  const o = OBJ.cur; if (!o) return;
  o.t += dt;
  const d = Math.hypot(PLAYER.x - o.x, PLAYER.z - o.z), maxAlive = Math.min(36, 9 + GAME.wave * 2);
  if (o.type === 'uplink') {
    const inside = d < o.r;
    if (inside) o.prog += dt;
    // while you hold it, runners home in on the signal
    o.spawnT -= dt;
    if (inside && o.spawnT <= 0 && GAME.aliveCount() < maxAlive) { o.spawnT = Math.max(2.2, 4.5 - GAME.wave * 0.1); const s = navSpawnPoint(18, 36); GAME.spawnExtra(Math.random() < 0.7 ? 'runner' : 'walker', s[0], s[1]); }
    if (Math.random() < dt * (inside ? 40 : 10)) { const a = Math.random() * TAU; emit(o.x + Math.cos(a) * o.r, 0.1, o.z + Math.sin(a) * o.r, 0, rand(1, 3), 0, 0.6, [0.9, 2.4, 0.4], 0.06, 0, 2); }
    if (o.prog >= o.need) objFinish(true);
    else if (o.t > o.limit || GAME.intermission) objFinish(false);
  } else if (o.type === 'nest') {
    o.flash = Math.max(0, o.flash - dt);
    o.spawnT -= dt;
    if (o.spawnT <= 0) {
      o.spawnT = Math.max(3.5, 7 - GAME.wave * 0.15);
      if (GAME.aliveCount() < maxAlive) for (let k = 0; k < 2; k++) { const a = Math.random() * TAU; GAME.spawnExtra(Math.random() < 0.35 ? 'runner' : 'walker', o.x + Math.cos(a) * 2.2, o.z + Math.sin(a) * 2.2); }
      burst(o.x, 0.6, o.z, 24, [0.35, 0.02, 0.05], 5, 0.8, 0.12, 6, 1.2, 1);
    }
    if (Math.random() < dt * 8) emit(o.x + rand(-1, 1), 0.2, o.z + rand(-1, 1), rand(-0.2, 0.2), rand(0.4, 1.2), rand(-0.2, 0.2), rand(1, 2), [0.12, 0.02, 0.08], rand(0.2, 0.4), -0.2, 0.6, 0.5, 0.5);
  } else if (o.type === 'bounty') {
    const a = o.a;
    if (!a || a.dead || ZOMBIES.indexOf(a) < 0) { OBJ.cur = null; return; }   // cleared some other way (new game, debug)
    o.x = a.x; o.z = a.z;
    // the pack leader howls up runners every few seconds
    o.spawnT -= dt;
    if (o.spawnT <= 0) {
      o.spawnT = Math.max(6, 11 - GAME.wave * 0.25);
      if (GAME.aliveCount() < maxAlive) { for (let k = 0; k < 2; k++) { const s = navSpawnPoint(14, 30); GAME.spawnExtra('runner', s[0], s[1]); } AUD.groan(PLAYER.at(a.x, a.z), 0.24, 0.6); a.jaw = 1; }
    }
    if (Math.random() < dt * 10) emit(a.x + rand(-0.3, 0.3) * a.scale, a.y + rand(1.2, 2) * a.scale, a.z + rand(-0.3, 0.3) * a.scale, 0, rand(0.4, 0.9), 0, 0.6, [2.6, 1.8, 0.3], rand(0.04, 0.07), -0.3, 1);
    if (o.t > o.limit) objFinish(false);
  } else {
    if (!o.landed) {
      // a slow parachute fall trailing flare smoke, then a thump
      o.y = Math.max(0, o.y - dt * 12);
      if (Math.random() < dt * 30) emit(o.x + rand(-0.2, 0.2), o.y + 0.9, o.z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(0.2, 0.6), rand(-0.3, 0.3), rand(1.5, 2.5), [1.6, 0.25, 0.1], rand(0.25, 0.4), -0.1, 0.6, 0.6, 0.6);
      if (o.y <= 0) { o.landed = true; AUD.land(1.5); burst(o.x, 0.3, o.z, 40, [0.3, 0.28, 0.26], 5, 0.9, 0.25, 3, 2, 1); flashLight(o.x, 1.5, o.z, [3, 1.4, 0.4], 14, 0.4); }
    } else {
      const near = d < 2.4, hold = near && INPUT.keys.KeyE;
      if (hold) { o.prog += dt; o.tick -= dt; if (o.tick <= 0) { o.tick = 0.5; AUD.tick(); } } else o.prog = Math.max(0, o.prog - dt * 0.5);
      // the flare keeps smoking, and the noise of a crate being forced draws them in
      if (Math.random() < dt * 14) emit(o.x + 0.5, 1.0, o.z + 0.4, rand(-0.2, 0.2) + WX.wind * 0.6, rand(1, 1.8), rand(-0.2, 0.2), rand(2, 3.5), [1.4, 0.2, 0.08], rand(0.25, 0.45), -0.25, 0.5, 0.7, 0.55);
      o.spawnT -= dt;
      if (near && o.spawnT <= 0 && GAME.aliveCount() < maxAlive) { o.spawnT = Math.max(2.6, 5 - GAME.wave * 0.1); const s = navSpawnPoint(16, 32); GAME.spawnExtra(Math.random() < 0.6 ? 'runner' : 'walker', s[0], s[1]); }
      if (o.prog >= o.need) objFinish(true);
    }
    if (OBJ.cur && (o.t > o.limit || GAME.intermission)) objFinish(false);
  }
}
// arrows and blasts against the nest
function objNestHit(seg0, seg1, so) {
  const o = OBJ.cur; if (!o || o.type !== 'nest') return -1;
  const c = [o.x, o.y, o.z], r = 1.25;
  return segPointDist2(seg0, seg1, c, so) < r * r ? so.s : -1;
}
function objNestDamage(dmg, hx, hy, hz) {
  const o = OBJ.cur; if (!o || o.type !== 'nest') return;
  o.hp -= dmg; o.flash = 0.12; GAME.hitMarker(false, false);
  burst(hx, hy, hz, 14, [0.4, 0.02, 0.2], 5, 0.6, 0.08, 8, 1.3, 1);
  floatText(hx, hy + 0.3, hz, Math.round(dmg).toString(), '#ff9ce8', 1);
  if (o.hp <= 0) { const x = o.x, z = o.z; objFinish(true); explode(x, 1, z); }   // finish first: the blast must not hit the dead nest again
}
function objBlast(x, y, z, R, dmg) {
  const o = OBJ.cur; if (!o || o.type !== 'nest') return;
  const d = Math.hypot(o.x - x, o.z - z); if (d < R) objNestDamage(dmg * (1 - d / R * 0.6), o.x, o.y, o.z);
}

function drawObjectives(time) {
  drawMutators(time);
  const o = OBJ.cur; if (!o) return;
  if (o.type === 'uplink') {
    const k = 0.6 + 0.4 * Math.sin(time * 5), f = o.prog / o.need;
    drawItem(MESH.cyl, M4.trs(poolM(), o.x, 1.1, o.z, 0, 0, 0, 0.35, 2.2, 0.35), [0.12, 0.13, 0.14]);
    drawItem(MESH.box, M4.trs(poolM(), o.x, 2.35, o.z, 0, time, 0, 0.5, 0.3, 0.5), [0.6, 1, 0.3], [1.4 * k, 3.2 * k, 0.5 * k]);
    drawItem(MESH.cyl, M4.trs(poolM(), o.x, 20, o.z, 0, 0, 0, 0.1 + f * 0.2, 36, 0.1 + f * 0.2), [0.6, 1, 0.3], [0.8, 2.2 * (0.4 + f), 0.3]);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + time * 0.3; drawItem(MESH.box, M4.trs(poolM(), o.x + Math.cos(a) * o.r, 0.05, o.z + Math.sin(a) * o.r, 0, -a, 0, 0.9, 0.05, 0.12), [0.6, 1, 0.3], i / 24 < f ? [1.2, 3, 0.4] : [0.2, 0.5, 0.08]); }
  } else if (o.type === 'nest') {
    const p = 1 + 0.08 * Math.sin(time * 3.2), hf = o.hp / o.maxHp, fl = o.flash > 0 ? 1.8 : 1;
    drawItem(MESH.sphere, M4.trs(poolM(), o.x, o.y, o.z, 0, time * 0.2, 0, 1.25 * p, 1.05 * p, 1.25 * p), [0.14, 0.03, 0.06], [0.6 * fl * (0.5 + 0.5 * Math.sin(time * 3.2)), 0.02, 0.35 * fl]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4, s = 0.45 + 0.1 * Math.sin(time * 2 + i); drawItem(MESH.sphere, M4.trs(poolM(), o.x + Math.cos(a) * 1.3, 0.35, o.z + Math.sin(a) * 1.3, 0, 0, 0, s, s * 0.7, s), [0.1, 0.02, 0.05], [0.9 * hf, 0.05, 0.6 * hf]); }
    drawItem(MESH.sphere, M4.trs(poolM(), o.x, o.y + 0.2, o.z + 0.9, 0, 0, 0, 0.35, 0.35, 0.35), [1, 0.3, 0.9], [3.2 * fl, 0.4, 2.6 * fl]);
  } else if (o.type === 'bounty') {
    // a gold halo turning over the Alpha's head
    const a = o.a; if (!a || a.dead) return; const k = 0.7 + 0.3 * Math.sin(time * 6);
    drawItem(MESH.ring, M4.trs(poolM(), a.head[0], a.head[1] + 0.4, a.head[2], 0, time * 1.5, 0, 0.32 * a.scale, 1, 0.32 * a.scale), [1, 0.8, 0.2], [3 * k, 2.1 * k, 0.3 * k]);
  } else {
    // the crate: olive steel with amber light strips and a blinking beacon; a canopy above it while it falls
    const y = o.y, bl = Math.sin(time * 9) > 0 ? 1 : 0.15, f = o.prog / o.need, sw = o.landed ? 0 : Math.sin(time * 1.3) * 0.08;
    drawItem(MESH.metal, M4.trs(poolM(), o.x, y + 0.42, o.z, sw, 0.5, 0, 1.2, 0.84, 0.9), [0.17, 0.19, 0.15]);
    for (const s of [-1, 1]) drawItem(MESH.box, M4.trs(poolM(), o.x, y + 0.42 + s * 0.24, o.z, sw, 0.5, 0, 1.22, 0.05, 0.92), [1, 0.55, 0.15], [2.4 * (0.5 + f), 1.2 * (0.5 + f), 0.25]);
    drawItem(MESH.sphere, M4.trs(poolM(), o.x, y + 0.92, o.z, 0, 0, 0, 0.09, 0.09, 0.09), [1, 0.4, 0.1], [4 * bl, 1.4 * bl, 0.2 * bl]);
    if (!o.landed) {
      drawItem(MESH.sphere, M4.trs(poolM(), o.x, y + 4.2, o.z, sw, time * 0.3, 0, 2.3, 0.75, 2.3), [0.55, 0.22, 0.08]);
      for (const [cx, cz] of [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]]) drawItem(MESH.box, M4.align(poolM(), o.x + cx * 0.32, y + 0.84, o.z + cz * 0.32, o.x + cx, y + 4, o.z + cz, 0.012, 0.012), [0.6, 0.6, 0.6]);
    } else {
      drawItem(MESH.cyl, M4.trs(poolM(), o.x, 18, o.z, 0, 0, 0, 0.08 + f * 0.15, 34, 0.08 + f * 0.15), [1, 0.55, 0.2], [1.6, 0.8 * (0.4 + f), 0.15]);
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; drawItem(MESH.box, M4.trs(poolM(), o.x + Math.cos(a) * 2.4, 0.05, o.z + Math.sin(a) * 2.4, 0, -a, 0, 0.7, 0.05, 0.1), [1, 0.55, 0.2], i / 18 < f ? [2.8, 1.4, 0.3] : [0.4, 0.2, 0.05]); }
    }
  }
}
function drawFieldObjectiveHUD(hx, W, H) {
  drawMutatorHUD(hx, W, H);
  const o = OBJ.cur; if (!o || GAME.state !== 'playing') return;
  const col = OBJ_COL[o.type], cx = W / 2, cy = H / 2;
  const d = Math.hypot(o.x - PLAYER.x, o.z - PLAYER.z);
  const close = (o.type === 'uplink' && d < o.r) || (o.type === 'drop' && d < 2.4);
  if (!close && o.type !== 'bounty') {   // pointer toward it (the Alpha has its own through-wall mark)
    const ang = Math.atan2(o.x - PLAYER.x, o.z - PLAYER.z), fwd = Math.atan2(-Math.sin(PLAYER.yaw), -Math.cos(PLAYER.yaw));
    let rel = ang - fwd; rel = ((rel + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const R = Math.min(W, H) * 0.26, a = -rel - Math.PI / 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    hx.save(); hx.translate(x, y); hx.rotate(a + Math.PI / 2); hx.fillStyle = col; hx.shadowColor = col; hx.shadowBlur = 10;
    hx.beginPath(); hx.moveTo(0, -12); hx.lineTo(9, 6); hx.lineTo(0, 1); hx.lineTo(-9, 6); hx.fill(); hx.restore();
    hx.font = '700 13px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = col;
    hx.fillText(`${OBJ_NAME[o.type]} ${Math.round(d)} m`, x, y + 24);
  }
  // status line + bar under the wave counter
  const bw = 220, by = 96;
  let f, label;
  if (o.type === 'uplink') { f = o.prog / o.need; label = d < o.r ? `UPLINK ${Math.ceil(o.need - o.prog)}s · HOLD THE RING` : `REACH THE UPLINK · ${Math.max(0, Math.ceil(o.limit - o.t))}s LEFT`; }
  else if (o.type === 'nest') { f = o.hp / o.maxHp; label = 'DESTROY THE HIVE NEST'; }
  else if (o.type === 'bounty') { f = o.a ? o.a.hp / o.a.maxHp : 0; label = `BOUNTY · ${o.a ? o.a.alpha : ''} · ${Math.max(0, Math.ceil(o.limit - o.t))}s`; }
  else { f = o.prog / o.need; label = !o.landed ? 'SUPPLY DROP INBOUND' : d < 2.4 ? (o.prog > 0 ? 'CRACKING THE CRATE · KEEP HOLDING E' : 'HOLD E TO CRACK THE CRATE') : `REACH THE DROP · ${Math.max(0, Math.ceil(o.limit - o.t))}s LEFT`; }
  hx.font = '700 13px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = col; hx.fillText(label, cx, by);
  hx.fillStyle = 'rgba(8,6,16,0.7)'; hx.fillRect(cx - bw / 2 - 1, by + 10, bw + 2, 6); hx.fillStyle = col; hx.fillRect(cx - bw / 2, by + 11, bw * clamp(f, 0, 1), 4);
  if (o.type === 'drop' && o.landed && d < 2.4) {   // a big prompt by the crosshair while you're at the crate
    hx.font = '700 16px "Quiver Cn", sans-serif'; hx.fillStyle = '#ffe2c4'; hx.fillText(o.prog > 0 ? `${Math.round(f * 100)}%` : 'HOLD  E', cx, cy + 64);
  }
}
// where the objective is on the minimap (pinned to the rim when it's out of range)
function drawObjectiveMinimap(hx, map, cx, cy, R, time) {
  const o = OBJ.cur; if (!o || GAME.state === 'title') return;
  let [x, y] = map(o.x, o.z); const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy);
  if (L > R - 7) { x = cx + dx / L * (R - 7); y = cy + dy / L * (R - 7); }
  const k = 0.65 + 0.35 * Math.sin(time * 6);
  hx.fillStyle = OBJ_COL[o.type]; hx.strokeStyle = OBJ_COL[o.type]; hx.globalAlpha = k; hx.lineWidth = 2;
  if (o.type === 'uplink') { hx.beginPath(); hx.arc(x, y, 5, 0, TAU); hx.stroke(); hx.beginPath(); hx.arc(x, y, 2, 0, TAU); hx.fill(); }
  else if (o.type === 'bounty') { hx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 2.4 : 6; hx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } hx.closePath(); hx.fill(); }
  else if (o.type === 'drop') { hx.fillRect(x - 4, y - 4, 8, 8); hx.fillStyle = '#1a0d04'; hx.fillRect(x - 4, y - 0.75, 8, 1.5); }
  else { hx.beginPath(); hx.arc(x, y, 4.5, 0, TAU); hx.fill(); }
  hx.globalAlpha = 1;
}

/* ============================================================
   Sector alerts: from wave 4, some waves come with a twist, called on the wave banner.
   They pay a bigger clear bonus. Never on Warden waves, never the same one twice running.
   - FRENZY:     runners and climbers only, a smaller wave
   - IRONCLAD:   brutes in force
   - SWARM:      nearly twice as many, at half the health, arriving faster
   - BLOOD MOON: elites everywhere (from wave 6)
   - VOLATILE:   bodies swell and burst a moment after they drop: it hurts them and you
   ============================================================ */
const MUTS = {
  frenzy: { name: 'FRENZY', sub: 'RUNNERS AND CLIMBERS ONLY', col: '#a6ff3a', count: 0.8, bonus: 1.4 },
  ironclad: { name: 'IRONCLAD', sub: 'THE BRUTES ARE OUT IN FORCE', col: '#ff6b3d', count: 0.7, bonus: 1.5 },
  swarm: { name: 'SWARM', sub: 'TWICE THE NUMBERS · HALF THE HEALTH', col: '#ff2e88', count: 1.9, hpK: 0.5, spawnK: 0.5, bonus: 1.3 },
  bloodmoon: { name: 'BLOOD MOON', sub: 'ELITES EVERYWHERE', col: '#ff3040', count: 0.85, bonus: 1.5, minWave: 6 },
  volatile: { name: 'VOLATILE', sub: 'THE DEAD BURST · KEEP YOUR DISTANCE', col: '#c8ff2e', count: 1, bonus: 1.35 },
};
const MUT = { cur: null, last: null, pops: [] };
function mutReset() { MUT.cur = null; MUT.last = null; MUT.pops.length = 0; }
function mutDef() { return MUT.cur ? MUTS[MUT.cur] : null; }
// called by GAME.startWave before the wave is sized
function mutRoll(wave) {
  MUT.cur = null; MUT.pops.length = 0;
  if (wave < 4 || wave % 5 === 0 || Math.random() > 0.4) return null;
  const keys = Object.keys(MUTS).filter(k => k !== MUT.last && wave >= (MUTS[k].minWave || 0));
  MUT.cur = MUT.last = pick(keys);
  return MUTS[MUT.cur];
}
// GAME.spawnOne: bend the enemy mix
function mutType(type) {
  const m = MUT.cur;
  if (m === 'frenzy') return Math.random() < 0.75 ? 'runner' : 'climber';
  if (m === 'ironclad' && GAME.wave >= 3 && Math.random() < 0.4) return 'brute';
  return type;
}
function mutElite(p) { return MUT.cur === 'bloodmoon' ? Math.max(p, 0.45) : p; }
function mutSpawned(z) { const M = mutDef(); if (M && M.hpK) { z.hp *= M.hpK; z.maxHp = z.hp; } }
function mutOnKill(z) {
  if (MUT.cur !== 'volatile' || z.type === 'boss' || GAME.state !== 'playing') return;
  MUT.pops.push({ z, t: 0.85 });
}
const VOL_R = 2.8, VOL_COL = [1.4, 2.6, 0.3];
function updateMutators(dt) {
  if (!MUT.pops.length) return;
  for (let i = MUT.pops.length - 1; i >= 0; i--) {
    const p = MUT.pops[i], z = p.z; p.t -= dt;
    const x = z.x, y = (z.core && z.core[1]) || 0.9, zz = z.z;
    if (Math.random() < dt * 30) emit(x + rand(-0.3, 0.3), y + rand(-0.2, 0.3), zz + rand(-0.3, 0.3), rand(-0.4, 0.4), rand(0.4, 1.4), rand(-0.4, 0.4), 0.5, VOL_COL, rand(0.05, 0.09), -0.5, 1);
    if (p.t > 0) continue;
    MUT.pops.splice(i, 1);
    // the burst: acid and bone, a shove for anything close, and it chains if it finishes one off
    burst(x, y, zz, 46, VOL_COL, 7, 0.6, 0.12, 6, 1.6);
    burst(x, y, zz, 24, [0.18, 0.3, 0.04], 4, 1.2, 0.3, 1, 1.3, 1);
    flashLight(x, y + 0.5, zz, [2.2, 4, 0.6], 10, 0.3);
    AUD.pop(PLAYER.at(x, zz, y));
    for (const o of zombieCandidates(x - VOL_R, x + VOL_R, zz - VOL_R, zz + VOL_R)) {
      if (o.dead || o === z) continue; const d = Math.hypot(o.x - x, o.z - zz); if (d > VOL_R) continue;
      const k = 1 - d / VOL_R, dir = [(o.x - x) / (d || 1), 0, (o.z - zz) / (d || 1)];
      if (!damageZombie(o, (22 + 26 * k) * PLAYER.dmgMult, 'body', [o.x, 1.1 * o.scale, o.z], dir, 2, 1, true)) { o.vx += dir[0] * 6 * k; o.vz += dir[2] * 6 * k; }
    }
    const pd = Math.hypot(PLAYER.x - x, PLAYER.z - zz);
    if (pd < VOL_R && GAME.state === 'playing') { PLAYER.hurt((9 + GAME.wave * 0.6) * (1 - pd / VOL_R * 0.5), x, zz); shake(0.25); }
  }
}
function drawMutators(time) {
  // a swelling, glowing blister on each body that's about to go
  for (const p of MUT.pops) {
    const z = p.z, k = 1 - p.t / 0.85, s = (0.18 + 0.32 * k) * z.scale, fl = 0.6 + 0.4 * Math.sin(time * (14 + k * 30));
    drawItem(MESH.sphere, M4.trs(poolM(), z.core ? z.core[0] : z.x, z.core ? z.core[1] : 0.6, z.core ? z.core[2] : z.z, 0, 0, 0, s, s * 0.85, s), [0.5, 0.9, 0.15], [VOL_COL[0] * fl * (0.5 + k), VOL_COL[1] * fl * (0.5 + k), VOL_COL[2] * fl]);
  }
}
// the alert's name sits under the infected counter for the whole wave
function drawMutatorHUD(hx, W, H) {
  const M = mutDef(); if (!M || GAME.state !== 'playing' || GAME.intermission) return;
  hx.font = '700 12px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = M.col; hx.globalAlpha = 0.9;
  hx.letterSpacing = '3px'; hx.fillText(`SECTOR ALERT · ${M.name}`, W / 2, OBJ.cur ? 134 : 96); hx.letterSpacing = '0px'; hx.globalAlpha = 1;
}
