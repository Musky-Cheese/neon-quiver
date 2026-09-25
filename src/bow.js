/* ============================================================
   First-person compound bow: draw, release, retract & reload
   ============================================================ */
const ARROWS = [
  { key: 'std', name: 'Carbon', color: hex('#dff3ff'), glow: [1.6, 2.2, 2.6], dmg: 1, speed: 1, infinite: true },
  { key: 'fire', name: 'Incendiary', color: hex('#ffb52e'), glow: [4, 1.8, 0.4], dmg: 0.9, speed: 0.95 },
  { key: 'boom', name: 'Plasma Charge', color: hex('#ff3df0'), glow: [3.5, 0.6, 3.2], dmg: 0.6, speed: 0.85 },
  { key: 'rail', name: 'Rail Piercer', color: hex('#37f3ff'), glow: [0.5, 3.2, 4], dmg: 1.25, speed: 1.45 },
];
const BOW = {
  draw: 0, state: 'ready', t: 0, relFrom: 0, type: 0, nextType: -1, carryOld: false, hold: 0,
  swayT: 0, lagX: 0, lagY: 0, walkPhase: 0, walkAmt: 0, sprintAmt: 0, kick: 0, tipWorld: [0, 0, 0], handWorld: [0, 0, 0],
};
const BRACE = 0.13, DRAWLEN = 0.42, ARROW_LEN = 0.78, VM_SCALE = 0.92;
const LIMB_L = [0.1, 0.1, 0.095, 0.09, 0.085, 0.075];
const LIMB_REST = [0.10, 0.16, 0.22, 0.30, 0.38, -0.6];
const LIMB_BEND = [0.05, 0.11, 0.19, 0.27, 0.36, 0.22];
const LIMB_W = [0.032, 0.03, 0.027, 0.024, 0.021, 0.018];

function bowStartDraw() {
  if (BOW.state !== 'ready') return false;
  BOW.state = 'drawing'; BOW.hold = 0; AUD.drawStart(PLAYER.drawTime * (1 - BOW.draw)); return true;
}
function bowRelease() {
  if (BOW.state !== 'drawing') return null;
  if (BOW.draw < 0.2) { BOW.state = 'letdown'; AUD.drawStop(); return null; }
  const power = BOW.draw; BOW.relFrom = BOW.draw; BOW.state = 'release'; BOW.t = 0; BOW.kick = 1;
  return power;
}
function bowCancel() { if (BOW.state === 'drawing') { BOW.state = 'letdown'; AUD.drawStop(); } }
function bowSwap(type) {
  if (type === BOW.type && BOW.nextType < 0) return;
  if (BOW.state === 'ready' || BOW.state === 'drawing' || BOW.state === 'letdown') {
    AUD.drawStop(); BOW.nextType = type; BOW.state = 'reload'; BOW.t = 0; BOW.carryOld = true; BOW.draw = 0; AUD.swap();
  } else { BOW.nextType = type; }
}

function updateBow(dt, input) {
  const B = BOW;
  B.swayT += dt;
  if (B.state === 'drawing') {
    B.draw = Math.min(1, B.draw + dt / PLAYER.drawTime);
    if (B.draw >= 1) B.hold += dt;
  } else if (B.state === 'letdown') {
    B.draw = Math.max(0, B.draw - dt * 3.5); if (B.draw <= 0) B.state = 'ready';
  } else if (B.state === 'release') {
    B.t += dt; B.draw = 0;
    if (B.t > 0.14) { B.state = 'reload'; B.t = 0; B.carryOld = false; AUD.quiver(); }
  } else if (B.state === 'reload') {
    B.t += dt / PLAYER.reloadTime;
    if (B.carryOld && B.t >= 0.45) { B.carryOld = false; if (B.nextType >= 0) { B.type = B.nextType; B.nextType = -1; } AUD.quiver(); }
    if (!B.carryOld && B.nextType >= 0 && B.t < 0.45) { B.type = B.nextType; B.nextType = -1; }
    if (B.t >= 1) {
      if (B.nextType >= 0 && B.nextType !== B.type) { B.t = 0; B.carryOld = true; return; }
      B.nextType = -1;
      B.state = 'ready'; B.t = 0; AUD.nock();
      if (B.type !== 0 && PLAYER.ammo[B.type] <= 0) { B.type = 0; }
      if (input.mouseDown && GAME.state === 'playing') bowStartDraw();
    }
  }
  B.kick = Math.max(0, B.kick - dt * 5);
}

// ---- viewmodel rendering -------------------------------------------------
const _bc = M4.create(), _bm = M4.create(), _lm = M4.create(), _wm = M4.create(), _p0 = [0, 0, 0], _p1 = [0, 0, 0];
function vm(mesh, local, col, emit, skin) { const m = poolM(); M4.mul(m, _bm, local); drawItem(mesh, m, col, emit, 0, VM_ITEMS, skin); return m; }
const GAUNT_DARK = [0.075, 0.08, 0.095], GAUNT_PLATE = [0.2, 0.21, 0.24];
function vmBox(x, y, z, sx, sy, sz, col, emit, rx = 0, ry = 0, rz = 0, mesh = MESH.box) { M4.trs(_lm, x, y, z, rx, ry, rz, sx, sy, sz); return vm(mesh, _lm, col, emit); }
function vmSeg(a, b, w, t, col, emit, mesh = MESH.box, ref) { if (ref) M4.align(_lm, a[0], a[1], a[2], b[0], b[1], b[2], w, t, ref[0], ref[1], ref[2]); else M4.align(_lm, a[0], a[1], a[2], b[0], b[1], b[2], w, t, 1, 0, 0); return vm(mesh, _lm, col, emit); }

function drawArrowModel(nock, dir, type, up, alpha = 1, emitBoost = 1) {
  const A = ARROWS[type];
  const tip = [nock[0] + dir[0] * ARROW_LEN, nock[1] + dir[1] * ARROW_LEN, nock[2] + dir[2] * ARROW_LEN];
  const shaftCol = [0.13, 0.13, 0.16];
  vmSeg(nock, tip, 0.011, 0.011, shaftCol, null, MESH.metal);
  // glowing stripe near fletching
  const s0 = [nock[0] + dir[0] * 0.13, nock[1] + dir[1] * 0.13, nock[2] + dir[2] * 0.13], s1 = [nock[0] + dir[0] * 0.17, nock[1] + dir[1] * 0.17, nock[2] + dir[2] * 0.17];
  vmSeg(s0, s1, 0.011, 0.011, A.color, [A.glow[0] * 0.5 * emitBoost, A.glow[1] * 0.5 * emitBoost, A.glow[2] * 0.5 * emitBoost]);
  // fletching: 3 vanes
  const f0 = [nock[0] + dir[0] * 0.02, nock[1] + dir[1] * 0.02, nock[2] + dir[2] * 0.02], f1 = [nock[0] + dir[0] * 0.11, nock[1] + dir[1] * 0.11, nock[2] + dir[2] * 0.11];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + 0.5;
    // perpendicular basis
    const px = up[1] * dir[2] - up[2] * dir[1], py = up[2] * dir[0] - up[0] * dir[2], pz = up[0] * dir[1] - up[1] * dir[0];
    const ox = (up[0] * Math.cos(a) + px * Math.sin(a)) * 0.011, oy = (up[1] * Math.cos(a) + py * Math.sin(a)) * 0.011, oz = (up[2] * Math.cos(a) + pz * Math.sin(a)) * 0.011;
    vmSeg([f0[0] + ox, f0[1] + oy, f0[2] + oz], [f1[0] + ox * 0.6, f1[1] + oy * 0.6, f1[2] + oz * 0.6], 0.002, 0.018, i === 0 ? A.color : [0.15, 0.15, 0.18], i === 0 ? [A.glow[0] * 0.25, A.glow[1] * 0.25, A.glow[2] * 0.25] : null, MESH.box, [ox, oy, oz]);
  }
  // nock
  vmSeg([nock[0] - dir[0] * 0.012, nock[1] - dir[1] * 0.012, nock[2] - dir[2] * 0.012], nock, 0.013, 0.013, A.color, [A.glow[0] * 0.4, A.glow[1] * 0.4, A.glow[2] * 0.4]);
  // head
  const hb = [tip[0] - dir[0] * 0.05, tip[1] - dir[1] * 0.05, tip[2] - dir[2] * 0.05];
  const pul = 0.75 + 0.25 * Math.sin(BOW.swayT * 9);
  if (type === 0) { vmSeg(hb, tip, 0.02, 0.02, [0.7, 0.75, 0.8], [0.4, 0.5, 0.6], MESH.cone); }
  else if (type === 1) { vmSeg(hb, tip, 0.024, 0.024, A.color, [A.glow[0] * pul, A.glow[1] * pul, A.glow[2] * pul], MESH.cone); const c0 = [hb[0] - dir[0] * 0.04, hb[1] - dir[1] * 0.04, hb[2] - dir[2] * 0.04]; vmSeg(c0, hb, 0.02, 0.02, [0.3, 0.12, 0.05], [0.8, 0.3, 0.05]); }
  else if (type === 2) { const c0 = [hb[0] - dir[0] * 0.06, hb[1] - dir[1] * 0.06, hb[2] - dir[2] * 0.06]; vmSeg(c0, hb, 0.03, 0.03, [0.2, 0.05, 0.2], null, MESH.cyl); vmSeg([c0[0] + dir[0] * 0.025, c0[1] + dir[1] * 0.025, c0[2] + dir[2] * 0.025], [c0[0] + dir[0] * 0.04, c0[1] + dir[1] * 0.04, c0[2] + dir[2] * 0.04], 0.034, 0.034, A.color, [A.glow[0] * pul * 1.4, A.glow[1] * pul * 1.4, A.glow[2] * pul * 1.4], MESH.cyl); vmSeg(hb, tip, 0.022, 0.022, [0.5, 0.5, 0.55], null, MESH.cone); }
  else { const h2 = [tip[0] - dir[0] * 0.1, tip[1] - dir[1] * 0.1, tip[2] - dir[2] * 0.1]; vmSeg(h2, tip, 0.016, 0.016, A.color, [A.glow[0] * pul, A.glow[1] * pul, A.glow[2] * pul], MESH.cone); vmSeg([h2[0] - dir[0] * 0.02, h2[1] - dir[1] * 0.02, h2[2] - dir[2] * 0.02], h2, 0.026, 0.026, [0.1, 0.12, 0.14], [0.2, 1.2, 1.6], MESH.cyl); }
  return tip;
}

function drawHand(pos, carrying, col, led) {
  // right cyber gauntlet, fingers hooked on the string at pos; armoured forearm runs back out of view
  const S = 0.9, g = [led[0] * 1.6, led[1] * 1.6, led[2] * 1.6];
  M4.trs(_lm, pos[0], pos[1], pos[2], 0, 0, 0, S, S, S); vm(MODEL.g_right, _lm, GAUNT_PLATE, g, GAUNT_DARK);
  const wrist = [pos[0] + 0.045 * S, pos[1] - 0.03 * S, pos[2] + 0.075 * S], elbow = [pos[0] + 0.24, pos[1] - 0.22, pos[2] + 0.5];
  M4.align(_lm, wrist[0], wrist[1], wrist[2], elbow[0], elbow[1], elbow[2], 0.078, 0.072, 0, 0, 1); vm(MODEL.g_forearm, _lm, GAUNT_PLATE, [led[0] * 1.3, led[1] * 1.3, led[2] * 1.3], GAUNT_DARK);
}
const _hm = M4.create(), _bmSave = M4.create();

function drawBowViewmodel(camM, time, player) {
  const B = BOW, A = ARROWS[B.type];
  const d = B.state === 'release' ? 0 : B.draw;
  const dE = easeOut(d);
  // ---- place bow in camera space
  const breath = Math.sin(time * 1.3) * 0.004;
  const walk = B.walkAmt, spr = B.sprintAmt;
  const bobX = Math.sin(B.walkPhase) * 0.014 * walk * (1 + spr), bobY = -Math.abs(Math.cos(B.walkPhase)) * 0.014 * walk * (1 + spr);
  let tremX = 0, tremY = 0; if (B.hold > 2.2) { const k = Math.min(1, (B.hold - 2.2) / 2) * 0.004; tremX = (Math.random() - 0.5) * k; tremY = (Math.random() - 0.5) * k; }
  let gx = lerp(-0.12, -0.085, dE) + bobX + B.lagX * 0.6 + tremX, gy = lerp(-0.15, -0.098, dE) + bobY + breath + B.lagY * 0.6 + tremY - spr * 0.07, gz = -0.62 + B.kick * 0.03;
  let rx = 0.02 + spr * -0.35 + B.lagY * 1.2 + B.kick * 0.06, ry = 0.0 + B.lagX * -1.2 + spr * 0.3, rz = 0.4 - dE * 0.08 + spr * 0.25;
  // reload: dip the bow slightly
  if (B.state === 'reload') { const k = Math.sin(clamp(B.t, 0, 1) * Math.PI); gy -= k * 0.02; rz -= k * 0.08; }
  // swap-in on game start / death anim
  gy -= (1 - player.vmIn) * 0.35; rx -= (1 - player.vmIn) * 0.6;
  M4.trs(_bc, gx, gy, gz, rx, ry, rz, VM_SCALE, VM_SCALE, VM_SCALE);
  M4.mul(_bm, camM, _bc);

  // ---- string / nock point
  let nockZ = BRACE + dE * DRAWLEN;
  if (B.state === 'release') { const t = B.t; nockZ = BRACE + B.relFrom * DRAWLEN * Math.exp(-t * 70) + 0.035 * Math.exp(-t * 16) * Math.sin(t * 95); }
  const bend = clamp((nockZ - BRACE) / DRAWLEN, -0.2, 1.1);
  // ---- limbs
  const tips = [];
  const glowK = 0.35 + d * 0.6 + (B.state === 'release' ? Math.exp(-B.t * 20) * 1.5 : 0);
  const limbGlow = [A.glow[0] * glowK * 0.4, A.glow[1] * glowK * 0.4, A.glow[2] * glowK * 0.4];
  for (const s of [1, -1]) {
    let p = [0, s * 0.11, 0.008]; let camP = null;
    for (let i = 0; i < 6; i++) {
      const th = LIMB_REST[i] + LIMB_BEND[i] * bend;
      const q = [0, p[1] + s * LIMB_L[i] * Math.cos(th), p[2] + LIMB_L[i] * Math.sin(th)];
      // split limbs: two carbon blades with glowing belly strips
      const lw = LIMB_W[i], off = lw * 0.55;
      for (const sx of [-1, 1]) {
        const pa = [p[0] + sx * off, p[1], p[2]], qa = [q[0] + sx * off, q[1], q[2]];
        vmSeg(pa, qa, lw * 0.55, 0.022, [0.05, 0.05, 0.062], null, i < 5 ? MESH.metal : MESH.box, [0, 0, 1]);
        if (i < 5) vmSeg([pa[0], pa[1], pa[2] + 0.0115], [qa[0], qa[1], qa[2] + 0.0115], lw * 0.14, 0.002, A.color, limbGlow, MESH.box, [0, 0, 1]);
      }
      if (i === 4) camP = q;
      p = q;
    }
    // cam wheel
    vmBox(camP[0], camP[1], camP[2], 0.085, 0.02, 0.085, [0.12, 0.12, 0.15], null, 0, 0, Math.PI / 2, MESH.cyl);
    vmBox(camP[0], camP[1], camP[2], 0.036, 0.6, 0.036, A.color, limbGlow, 0, 0, Math.PI / 2, MESH.ring);
    vmBox(camP[0], camP[1], camP[2], 0.02, 0.026, 0.02, [0.3, 0.3, 0.35], null, 0, 0, Math.PI / 2, MESH.cyl);
    tips.push([camP[0], camP[1] + s * 0.005, camP[2] + 0.027]);
  }
  // ---- riser
  const rc = [0.12, 0.12, 0.14];
  vmBox(0, 0.1, -0.012, 0.03, 0.12, 0.05, rc, null, -0.25, 0, 0, MESH.metal);   // upper riser (sweeps forward)
  vmBox(0, -0.1, -0.012, 0.03, 0.12, 0.05, rc, null, 0.25, 0, 0, MESH.metal);   // lower riser
  vmBox(0, 0.01, -0.03, 0.026, 0.1, 0.03, rc, null, 0, 0, 0, MESH.metal);        // spine
  vmBox(0, 0.16, 0.004, 0.04, 0.03, 0.04, [0.08, 0.08, 0.1], null, 0, 0, 0, MESH.metal); // limb pockets
  vmBox(0, -0.16, 0.004, 0.04, 0.03, 0.04, [0.08, 0.08, 0.1], null, 0, 0, 0, MESH.metal);
  vmBox(0, -0.035, 0.012, 0.04, 0.1, 0.06, [0.05, 0.05, 0.06]);                   // grip
  vmBox(0.016, 0.1, -0.012, 0.004, 0.1, 0.02, A.color, [A.glow[0] * 0.9, A.glow[1] * 0.9, A.glow[2] * 0.9], -0.25);  // accents
  vmBox(0.016, -0.1, -0.012, 0.004, 0.1, 0.02, A.color, [A.glow[0] * 0.9, A.glow[1] * 0.9, A.glow[2] * 0.9], 0.25);
  vmBox(0.012, 0.018, -0.004, 0.012, 0.008, 0.04, [0.2, 0.2, 0.22]);            // arrow shelf
  // sight
  vmBox(-0.035, 0.07, -0.03, 0.05, 0.012, 0.012, rc, null, 0, 0, 0, MESH.metal);
  vmBox(-0.062, 0.07, -0.03, 0.022, 0.022, 0.022, rc, null, Math.PI / 2, 0, 0, MESH.ring);
  vmBox(-0.062, 0.07, -0.03, 0.0035, 0.0035, 0.0035, [1, 0.3, 0.5], [4, 0.6, 1.6], 0, 0, 0, MESH.sphere);
  // stabilizer
  vmSeg([0, -0.07, -0.02], [0, -0.075, -0.3], 0.012, 0.012, [0.08, 0.08, 0.09], null, MESH.cyl, [1, 0, 0]);
  vmSeg([0, -0.075, -0.3], [0, -0.076, -0.34], 0.028, 0.028, [0.12, 0.12, 0.14], A.glow.map(v => v * 0.35), MESH.cyl, [1, 0, 0]);
  // ---- left cyber gauntlet wrapped round the grip
  M4.trs(_lm, 0, -0.035, 0.012, 0, 0, 0, 1, 1, 1); vm(MODEL.g_left, _lm, GAUNT_PLATE, A.glow.map(v => v * 1.2), GAUNT_DARK);
  M4.align(_lm, -0.006, -0.1, 0.035, -0.16, -0.34, 0.5, 0.08, 0.074, 0, 0, 1); vm(MODEL.g_forearm, _lm, GAUNT_PLATE, A.glow.map(v => v * 1.0), GAUNT_DARK);

  // ---- arrow + right hand
  const nock = [0.014, 0.02, nockZ];
  let handPos = nock.slice(); let arrowNock = null, arrowDir = [0, 0, -1], arrowUp = [0, 1, 0]; let carrying = false;
  const Q = [0.3, -0.36, 0.34];
  if (B.state === 'ready' || B.state === 'drawing' || B.state === 'letdown') { arrowNock = nock; }
  else if (B.state === 'release') {
    const k = easeOut(B.t / 0.14); handPos = [nock[0] + 0.05 * k, nock[1] - 0.01 * k, BRACE + B.relFrom * DRAWLEN + 0.06 * k];
  } else if (B.state === 'reload') {
    const t = clamp(B.t, 0, 1);
    const start = B.carryOld ? nock : [nock[0] + 0.05, nock[1] - 0.01, BRACE + DRAWLEN * 0.8];
    if (t < 0.45) { const k = easeInOut(t / 0.45); handPos = [lerp(start[0], Q[0], k), lerp(start[1], Q[1], k), lerp(start[2], Q[2], k)];
      if (B.carryOld) { arrowNock = handPos; const dk = k; arrowDir = norm3([lerp(0, 0.25, dk), lerp(0, 0.75, dk), lerp(-1, -0.6, dk)]); carrying = true; }
    } else {
      const k = easeInOut((t - 0.45) / 0.55);
      handPos = [lerp(Q[0], nock[0], k), lerp(Q[1], nock[1], k), lerp(Q[2], nock[2], k)];
      // arc over: lift slightly mid-way
      handPos[1] += Math.sin(k * Math.PI) * 0.08; handPos[0] += Math.sin(k * Math.PI) * 0.03;
      arrowNock = handPos; carrying = true;
      arrowDir = norm3([lerp(0.3, 0, k), lerp(0.85, 0, k), lerp(-0.45, -1, k)]);
      arrowUp = norm3([0, lerp(0.4, 1, k), lerp(0.9, 0, k)]);
    }
  }
  // string (two segments from cams to nock / hand)
  const sp = (B.state === 'ready' || B.state === 'drawing' || B.state === 'letdown') ? nock : [0.012, 0.02, nockZ];
  const strCol = [0.6, 0.65, 0.7], strE = [A.glow[0] * 0.2 * (0.5 + d), A.glow[1] * 0.2 * (0.5 + d), A.glow[2] * 0.2 * (0.5 + d)];
  vmSeg(tips[0], sp, 0.0035, 0.0035, strCol, strE); vmSeg(tips[1], sp, 0.0035, 0.0035, strCol, strE);
  // cable guard
  vmSeg([tips[0][0] + 0.004, tips[0][1], tips[0][2] - 0.02], [tips[1][0] + 0.004, tips[1][1], tips[1][2] - 0.02], 0.002, 0.002, [0.25, 0.25, 0.28], null);
  if (arrowNock) {
    const tip = drawArrowModel(arrowNock, arrowDir, B.type, arrowUp, 1, carrying ? 0.7 : 1 + d);
    vmToWorld(camM, tip, B.tipWorld);
    B.hasVisibleArrow = true;
  } else B.hasVisibleArrow = false;
  drawHand(handPos, carrying, [0.09, 0.09, 0.1], A.color);
  vmToWorld(camM, handPos, B.handWorld);
}
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

// viewmodel is drawn with its own FOV; map a bow-local point to the world point that lands on the same pixel
const VM_FOV = 60, _vc = [0, 0, 0];
function vmToWorld(camM, p, out) {
  M4.pt(_bc, p[0], p[1], p[2], _vc);
  const k = Math.tan(PLAYER.fov * Math.PI / 360) / Math.tan(VM_FOV * Math.PI / 360);
  M4.pt(camM, _vc[0] * k, _vc[1] * k, _vc[2], out);
}
