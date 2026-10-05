/* ============================================================
   Field objectives: optional goals that turn up mid-wave (from wave 3)
   - UPLINK: stand in the beacon's ring for 20 s while runners converge (60 s limit)
   - NEST:   a pulsing hive keeps birthing the infected; the wave can't end until it dies
   Both pay out credits, score and supplies. One per wave at most, never on Warden waves.
   ============================================================ */
const OBJ = { cur: null, t: 0, armed: false, delay: 0 };
const OBJ_COL = { uplink: '#a6ff3a', nest: '#ff3df0' };

function objReset() { OBJ.cur = null; OBJ.armed = false; OBJ.delay = 0; }
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
function objStart(type) {
  const [x, z] = objOpenSpot(), w = GAME.wave;
  if (type === 'uplink') {
    OBJ.cur = { type, x, z, r: 5, need: 20, prog: 0, limit: 60, t: 0, spawnT: 3 };
    GAME.showBanner('FIELD OBJECTIVE', 'HOLD THE DATA UPLINK · 20s INSIDE THE RING', OBJ_COL.uplink);
  } else {
    const hp = 420 + w * 70;
    OBJ.cur = { type, x, z, hp, maxHp: hp, t: 0, spawnT: 2, flash: 0, y: 1.1 };
    GAME.showBanner('FIELD OBJECTIVE', 'DESTROY THE HIVE NEST BEFORE IT FLOODS THE STREETS', OBJ_COL.nest);
  }
  AUD.waveHorn(false);
}
function objFinish(ok) {
  const o = OBJ.cur; if (!o) return; const w = GAME.wave;
  if (ok) {
    const scrap = (o.type === 'nest' ? 50 : 40) + w * 6;
    GAME.scrap += scrap; GAME.score += scrap * 14; hudScore();
    GAME.showBanner(o.type === 'nest' ? 'NEST DESTROYED' : 'UPLINK SECURED', `+${scrap} SCRAP · SUPPLIES DROPPED`, OBJ_COL[o.type]);
    for (let k = 0; k < 3; k++) dropPickup(o.x + rand(-2, 2), o.z + rand(-2, 2), k === 0 ? 'health' : 'ammo');
    AUD.cleared();
  } else GAME.showBanner('OBJECTIVE FAILED', 'THE UPLINK WENT DARK', '#ff3040');
  OBJ.cur = null;
}
function objNestAlive() { return !!(OBJ.cur && OBJ.cur.type === 'nest'); }

function updateObjectives(dt) {
  if (GAME.state !== 'playing') return;
  if (!OBJ.cur && OBJ.armed && !GAME.intermission && GAME.wave > 0) {
    OBJ.delay -= dt;
    if (OBJ.delay <= 0) { OBJ.armed = false; objStart(Math.random() < 0.5 ? 'uplink' : 'nest'); }
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
  } else {
    o.flash = Math.max(0, o.flash - dt);
    o.spawnT -= dt;
    if (o.spawnT <= 0) {
      o.spawnT = Math.max(3.5, 7 - GAME.wave * 0.15);
      if (GAME.aliveCount() < maxAlive) for (let k = 0; k < 2; k++) { const a = Math.random() * TAU; GAME.spawnExtra(Math.random() < 0.35 ? 'runner' : 'walker', o.x + Math.cos(a) * 2.2, o.z + Math.sin(a) * 2.2); }
      burst(o.x, 0.6, o.z, 24, [0.35, 0.02, 0.05], 5, 0.8, 0.12, 6, 1.2, 1);
    }
    if (Math.random() < dt * 8) emit(o.x + rand(-1, 1), 0.2, o.z + rand(-1, 1), rand(-0.2, 0.2), rand(0.4, 1.2), rand(-0.2, 0.2), rand(1, 2), [0.12, 0.02, 0.08], rand(0.2, 0.4), -0.2, 0.6, 0.5, 0.5);
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
  const o = OBJ.cur; if (!o) return;
  if (o.type === 'uplink') {
    const k = 0.6 + 0.4 * Math.sin(time * 5), f = o.prog / o.need;
    drawItem(MESH.cyl, M4.trs(poolM(), o.x, 1.1, o.z, 0, 0, 0, 0.35, 2.2, 0.35), [0.12, 0.13, 0.14]);
    drawItem(MESH.box, M4.trs(poolM(), o.x, 2.35, o.z, 0, time, 0, 0.5, 0.3, 0.5), [0.6, 1, 0.3], [1.4 * k, 3.2 * k, 0.5 * k]);
    drawItem(MESH.cyl, M4.trs(poolM(), o.x, 20, o.z, 0, 0, 0, 0.1 + f * 0.2, 36, 0.1 + f * 0.2), [0.6, 1, 0.3], [0.8, 2.2 * (0.4 + f), 0.3]);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + time * 0.3; drawItem(MESH.box, M4.trs(poolM(), o.x + Math.cos(a) * o.r, 0.05, o.z + Math.sin(a) * o.r, 0, -a, 0, 0.9, 0.05, 0.12), [0.6, 1, 0.3], i / 24 < f ? [1.2, 3, 0.4] : [0.2, 0.5, 0.08]); }
  } else {
    const p = 1 + 0.08 * Math.sin(time * 3.2), hf = o.hp / o.maxHp, fl = o.flash > 0 ? 1.8 : 1;
    drawItem(MESH.sphere, M4.trs(poolM(), o.x, o.y, o.z, 0, time * 0.2, 0, 1.25 * p, 1.05 * p, 1.25 * p), [0.14, 0.03, 0.06], [0.6 * fl * (0.5 + 0.5 * Math.sin(time * 3.2)), 0.02, 0.35 * fl]);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4, s = 0.45 + 0.1 * Math.sin(time * 2 + i); drawItem(MESH.sphere, M4.trs(poolM(), o.x + Math.cos(a) * 1.3, 0.35, o.z + Math.sin(a) * 1.3, 0, 0, 0, s, s * 0.7, s), [0.1, 0.02, 0.05], [0.9 * hf, 0.05, 0.6 * hf]); }
    drawItem(MESH.sphere, M4.trs(poolM(), o.x, o.y + 0.2, o.z + 0.9, 0, 0, 0, 0.35, 0.35, 0.35), [1, 0.3, 0.9], [3.2 * fl, 0.4, 2.6 * fl]);
  }
}
function drawFieldObjectiveHUD(hx, W, H) {
  const o = OBJ.cur; if (!o || GAME.state !== 'playing') return;
  const col = OBJ_COL[o.type], cx = W / 2, cy = H / 2;
  const d = Math.hypot(o.x - PLAYER.x, o.z - PLAYER.z);
  if (!(o.type === 'uplink' && d < o.r)) {   // pointer toward it
    const ang = Math.atan2(o.x - PLAYER.x, o.z - PLAYER.z), fwd = Math.atan2(-Math.sin(PLAYER.yaw), -Math.cos(PLAYER.yaw));
    let rel = ang - fwd; rel = ((rel + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const R = Math.min(W, H) * 0.26, a = -rel - Math.PI / 2, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    hx.save(); hx.translate(x, y); hx.rotate(a + Math.PI / 2); hx.fillStyle = col; hx.shadowColor = col; hx.shadowBlur = 10;
    hx.beginPath(); hx.moveTo(0, -12); hx.lineTo(9, 6); hx.lineTo(0, 1); hx.lineTo(-9, 6); hx.fill(); hx.restore();
    hx.font = '700 13px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = col;
    hx.fillText(`${o.type === 'nest' ? 'NEST' : 'UPLINK'} ${Math.round(d)} m`, x, y + 24);
  }
  // status line + bar under the wave counter
  const bw = 220, by = 96;
  const f = o.type === 'uplink' ? o.prog / o.need : o.hp / o.maxHp;
  const label = o.type === 'uplink' ? (d < o.r ? `UPLINK ${Math.ceil(o.need - o.prog)}s · HOLD THE RING` : `REACH THE UPLINK · ${Math.max(0, Math.ceil(o.limit - o.t))}s LEFT`) : 'DESTROY THE HIVE NEST';
  hx.font = '700 13px "Quiver Cn", sans-serif'; hx.textAlign = 'center'; hx.fillStyle = col; hx.fillText(label, cx, by);
  hx.fillStyle = 'rgba(8,6,16,0.7)'; hx.fillRect(cx - bw / 2 - 1, by + 10, bw + 2, 6); hx.fillStyle = col; hx.fillRect(cx - bw / 2, by + 11, bw * clamp(f, 0, 1), 4);
}
