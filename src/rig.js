/* ============================================================
   Rigged infected: one skinned mesh per zombie, built from the Blender
   armature + clips (tools/make_rig.py -> models/zombie.glb).
   Clips drive the living body; hit reactions are layered on top as
   additive rotations; deaths, pins and crumples blend over to the
   procedural physics pose from zPose().
   ============================================================ */
const ZRIG = { ready: false, clips: {}, geos: {}, parts: {}, boneNames: [], inverses: null, rootTemplate: null, bindMatrix: null, pool: {}, live: new Set() };
const CLIP_RANGES = { walk: [0, 36, 1], run: [42, 60, 1], heavy: [66, 110, 1], boss_walk: [116, 172, 1], idle: [178, 238, 1], attack: [244, 270, 0], crawl: [276, 316, 1], crawl_attack: [322, 346, 0], slam: [352, 400, 0], roar: [406, 448, 0] };
const PARTMAP = [['torso_shirt', 0], ['torso_bare', 0], ['uarm_sleeve', 1], ['uarm_bare', 1], ['farm', 2], ['pelvis', 3], ['thigh', 4], ['shin', 4], ['head_a', 5], ['head_b', 5], ['jaw', 6], ['brute_vest', 7], ['brute_pad', 7], ['brute_helmet', 8], ['boss_hump', 9]];
const LOGICAL = ['root', 'pelvis', 'spine', 'neck', 'jaw', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR'];

async function loadZombieRig(url = 'models/zombie.glb') {
  let gltf;
  try {
    if (url.endsWith('.json')) {   // hosts that won't serve .glb get a base64 copy
      const j = await (await fetch(url)).json(); const bin = Uint8Array.from(atob(j.glb), c => c.charCodeAt(0));
      gltf = await new GLTFLoader().parseAsync(bin.buffer, '');
    } else gltf = await new GLTFLoader().loadAsync(url);
  } catch (e) { console.warn('zombie rig unavailable, using the procedural renderer', e); return false; }
  const meshes = []; let skel = null, bindMatrix = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) { meshes.push(o); if (!skel) { skel = o.skeleton; bindMatrix = o.bindMatrix.clone(); } } });
  if (!skel || !meshes.length) return false;
  // logical bone names: strip the loader's de-duplication suffix and the '.L'/'.R' dot
  const logical = (n) => n.replace(/_\d+$/, '').replace(/\./g, '');
  ZRIG.boneNames = skel.bones.map(b => b.name);
  ZRIG.logicalOf = {}; skel.bones.forEach(b => { ZRIG.logicalOf[b.name] = logical(b.name); });
  ZRIG.inverses = skel.boneInverses.map(m => m.clone());
  ZRIG.bindMatrix = bindMatrix;
  let root = skel.bones[0]; while (root.parent && root.parent.isBone) root = root.parent;
  ZRIG.rootTemplate = root;
  // part geometries, tagged with a per-vertex part id
  for (const m of meshes) {
    const base = m.name.replace(/_\d+$/, '');
    const hit = PARTMAP.find(([k]) => base.startsWith(k)); if (!hit) continue;
    const g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count; g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(n).fill(hit[1]), 1));
    if (g.attributes.skinIndex.array.constructor !== Uint16Array) g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(g.attributes.skinIndex.array), 4));
    if (!g.index) g.setIndex([...Array(n).keys()]);
    ZRIG.parts[base] = g;
  }
  // clips
  const full = gltf.animations[0];
  for (const k in CLIP_RANGES) { const [a, b, loop] = CLIP_RANGES[k]; const c = THREE.AnimationUtils.subclip(full, k, a, b + 1, 30); c.userData = { loop: !!loop }; ZRIG.clips[k] = c; }
  ZRIG.ready = true;
  return true;
}

function zVariant(z) {
  const kind = z.type === 'brute' ? 'brute' : z.type === 'boss' ? 'boss' : 'n';
  return (z.bare ? 'torso_bare' : 'torso_shirt') + '|' + (z.headVar === 'b' ? 'head_b' : 'head_a') + '|' + (z.sleeve && !z.bare ? 'uarm_sleeve' : 'uarm_bare') + '|' + kind;
}
function zGeometry(key) {
  if (ZRIG.geos[key]) return ZRIG.geos[key];
  const [torso, head, arm, kind] = key.split('|');
  const names = [torso, head, 'jaw', arm + 'L', arm + 'R', 'farmL', 'farmR', 'pelvis', 'thighL', 'thighR', 'shinL', 'shinR'];
  if (kind === 'brute') names.push('brute_vest', 'brute_padL', 'brute_padR', 'brute_helmet');
  if (kind === 'boss') names.push('brute_padL', 'brute_padR', 'boss_hump');
  const list = names.map(n => ZRIG.parts[n]).filter(Boolean);
  const g = mergeGeometries(list, false); g.computeBoundingSphere();
  return (ZRIG.geos[key] = g);
}

function zDepthMat(own) {
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dm.onBeforeCompile = (sh) => {
    sh.uniforms.uHide = own.uHide;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute float part; uniform float uHide[${ZPARTS}];`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n  if (uHide[int(part + 0.5)] > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);');
  };
  dm.customProgramCacheKey = () => 'nq-zdepth';
  return dm;
}

function makeRig(z) {
  const key = zVariant(z);
  const pool = ZRIG.pool[key] || (ZRIG.pool[key] = []);
  let r = pool.pop();
  if (!r) {
    const mat = nqMaterial('zombie');
    const mesh = new THREE.SkinnedMesh(zGeometry(key), mat);
    mesh.name = 'zmesh'; mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = zDepthMat(mat.userData.u);
    const root = ZRIG.rootTemplate.clone(true);
    const byName = {}; root.traverse(o => { if (o.isBone) byName[o.name] = o; });
    const bones = ZRIG.boneNames.map(n => byName[n]);
    mesh.add(root);
    mesh.bind(new THREE.Skeleton(bones, ZRIG.inverses), ZRIG.bindMatrix);
    const B = {}; for (const b of bones) B[ZRIG.logicalOf[b.name]] = b;
    B.shoulderL = B.shoulderL || B['shoulder.L']; // defensive
    const mixer = new THREE.AnimationMixer(mesh);
    r = { key, mesh, mat, u: mat.userData.u, B, mixer, actions: {}, cur: null };
  }
  r.mixer.stopAllAction(); r.cur = null; r.procW = 0;
  scene.add(r.mesh);
  z.rig = r; ZRIG.live.add(z);
  return r;
}
function releaseRig(z) {
  const r = z.rig; if (!r) return;
  scene.remove(r.mesh); r.mixer.stopAllAction(); (ZRIG.pool[r.key] || (ZRIG.pool[r.key] = [])).push(r);
  z.rig = null; ZRIG.live.delete(z);
}
// called once per frame: drop rigs whose zombie left the list
const _zset = new Set();
function syncRigs() {
  _zset.clear(); for (const z of ZOMBIES) _zset.add(z);
  for (const z of ZRIG.live) if (!_zset.has(z)) releaseRig(z);
}

function zAction(r, name) {
  let a = r.actions[name];
  if (!a) { a = r.actions[name] = r.mixer.clipAction(ZRIG.clips[name]); a.setLoop(ZRIG.clips[name].userData.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; }
  return a;
}
const LOCO = { walker: 'walk', runner: 'run', brute: 'heavy', boss: 'boss_walk' };
const PHASE_RATE = { walker: 5.2, runner: 11, brute: 4.2, boss: 3.2 };
function zWantClip(z) {
  if (z.crawl) return z.state === 'attack' ? 'crawl_attack' : 'crawl';
  if (z.state === 'attack') return 'attack';
  if (z.state === 'slam') return 'slam';
  if (z.state === 'roar') return 'roar';
  if (z.state === 'drop') return 'idle';
  if (z.state === 'dying') return z.rig.cur || 'idle';
  return (z.mv || 0) > 0.1 ? LOCO[z.type] : 'idle';
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _qa = new THREE.Quaternion();
function qEuler(x, y, z) { _e.set(x, y, z, 'YXZ'); return _q.setFromEuler(_e); }
function addRot(bone, x, y, z) { if (x || y || z) bone.quaternion.multiply(qEuler(x, y, z)); }
function blendRot(bone, w, x, y, z) { qEuler(x, y, z); bone.quaternion.slerp(_q, w); }
const _hv = [0, 0, 0];

function poseZombieRig(z, dt, time) {
  const r = z.rig || makeRig(z);
  z._ps = STEPN.n;
  const P = zPose(z, time), B = r.B;
  // ---------- clip selection + playback ----------
  const want = zWantClip(z);
  if (want !== r.cur && z.state !== 'dying') {
    const next = zAction(r, want); const prev = r.cur ? zAction(r, r.cur) : null;
    next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(1); next.play();
    if (prev) next.crossFadeFrom(prev, want === 'crawl' ? 0.6 : want === 'attack' || want === 'crawl_attack' ? 0.12 : 0.25, false);
    r.cur = want;
  }
  const act = r.cur ? zAction(r, r.cur) : null, dur = act ? act.getClip().duration : 1;
  if (act) {
    const timed = { attack: z.atkT, crawl_attack: z.atkT, slam: z.atkT, roar: z.type === 'boss' ? clamp(z.roarT / 1.4, 0, 1) : null }[r.cur];
    if (timed !== undefined && timed !== null && z.state !== 'dying') { act.timeScale = 0; act.time = clamp(timed, 0, 0.999) * dur; }
    else if (z.state === 'dying') act.timeScale = 0;
    else if (r.cur === 'idle') act.timeScale = 1;
    else { const rate = z.crawl ? 3.2 : PHASE_RATE[z.type]; act.timeScale = rate / (TAU / dur) * (z.crawl ? 1 : clamp((z.mv || 0) / Math.max(0.5, z.speed), 0.6, 1.25)); }
  }
  r.mixer.update(dt);
  // ---------- procedural layers ----------
  const R = z.R;
  // body shape per breed (the mixer rewrites scale every update)
  B.pelvis.scale.setScalar(1); B.spine.scale.setScalar(1); B.neck.scale.setScalar(1); B.shoulderL.scale.setScalar(1); B.shoulderR.scale.setScalar(1); B.elbowR.scale.setScalar(1);
  if (z.type === 'brute') { B.pelvis.scale.set(1.22, 1, 1.22); B.neck.scale.set(1 / 1.22, 1, 1 / 1.22); }
  else if (z.type === 'boss') { B.pelvis.scale.set(1.2, 1, 1.2); B.neck.scale.set(0.85 / 1.2, 0.85, 0.85 / 1.2); B.elbowR.scale.setScalar(1.35); }
  else if (z.type === 'runner') { B.spine.scale.set(0.88, 1, 1); B.neck.scale.set(1 / 0.88, 1, 1); B.shoulderL.scale.set(0.9, 1, 0.9); B.shoulderR.scale.set(0.9, 1, 0.9); }
  const dying = z.state === 'dying';
  r.procW = dying ? Math.min(1, r.procW + dt / 0.22) : Math.max(0, r.procW - dt / 0.3);
  if (dt === 0 && dying) r.procW = Math.max(r.procW, 0.001);
  const w = r.procW;
  if (w < 1) {
    // additive hit reactions over the clip
    const legs = R.l;
    addRot(B.neck, R.h, 0, 0);
    addRot(B.spine, R.t - z.flinch * 0.2 + 0.3 * legs, R.y, 0);
    addRot(B.jaw, z.jaw * 0.45, 0, 0);
    if (legs > 0) { addRot(B.kneeL, 0.9 * legs, 0, 0); addRot(B.kneeR, 0.7 * legs, 0, 0); addRot(B.hipL, -0.5 * legs, 0, 0); addRot(B.hipR, -0.4 * legs, 0, 0); B.pelvis.position.y -= 0.12 * legs; }
    if (z.type === 'walker' && !z.crawl) addRot(B.neck, 0, 0, Math.sin(time * 2.1 + z.seed) * 0.12);
  }
  if (w > 0) {
    // physics-driven death pose (pins, crumples, falls) takes over from the clip
    blendRot(B.pelvis, w, P.pelRx, P.twist, 0); B.pelvis.position.x *= 1 - w; B.pelvis.position.z *= 1 - w; B.pelvis.position.y = lerp(B.pelvis.position.y, P.hipY, w);
    blendRot(B.spine, w, P.lean, -P.twist * 1.5 + P.torYaw, P.spRz);
    blendRot(B.neck, w, P.headRx, 0, P.roll); blendRot(B.jaw, w, P.jaw, 0, 0);
    blendRot(B.shoulderL, w, P.shL, 0, -P.spread); blendRot(B.shoulderR, w, P.shR, 0, P.spread);
    blendRot(B.elbowL, w, P.elL, 0, 0); blendRot(B.elbowR, w, P.elR, 0, 0);
    blendRot(B.hipL, w, P.hipLa, 0, 0.03); blendRot(B.hipR, w, P.hipRa, 0, -0.03);
    blendRot(B.kneeL, w, P.knLa, 0, 0); blendRot(B.kneeR, w, P.knRa, 0, 0);
  }
  // ---------- root transform ----------
  const m = r.mesh;
  m.position.set(z.x, z.y, z.z); m.rotation.set(P.rootRx, z.yaw, P.rootRz, 'YXZ'); m.scale.setScalar(z.scale);
  m.updateMatrixWorld(true);
  // ---------- hit volumes from the skeleton ----------
  const hs = z.type === 'boss' ? 0.85 : 1;
  M4.pt(B.neck.matrixWorld.elements, 0, 0.155 * (z.type === 'boss' ? 1 : hs), 0.01, z.head);
  M4.pt(B.pelvis.matrixWorld.elements, 0, 0, 0, z.a); M4.pt(B.spine.matrixWorld.elements, 0, 0.5, 0, z.b);
  M4.pt(B.spine.matrixWorld.elements, 0, 0.32, 0.14, z.core);
  M4.pt(B.hipL.matrixWorld.elements, 0, 0, 0, z.hipL); M4.pt(B.kneeL.matrixWorld.elements, 0, 0, 0, z.knL); M4.pt(B.kneeL.matrixWorld.elements, 0, -0.42, 0, z.ftL);
  M4.pt(B.hipR.matrixWorld.elements, 0, 0, 0, z.hipR); M4.pt(B.kneeR.matrixWorld.elements, 0, 0, 0, z.knR); M4.pt(B.kneeR.matrixWorld.elements, 0, -0.42, 0, z.ftR);
  return r;
}

const _v3 = (a) => a;
function setV(v, c, k = 1) { v.set(c[0] * k, c[1] * k, c[2] * k); }
function drawZombieRig(z, time) {
  if (!z.rig || z._ps === undefined) poseZombieRig(z, 0, time);
  const r = z.rig, u = r.u, T = z.type, B = r.B;
  const P = _ZP; zPose(z, time); // colours / flash for this frame
  const dying = z.state === 'dying', fl = z.flash > 0 ? 0.55 : 0;
  const e = z.T.eyes, vk = (T === 'boss' ? 1.6 : 1.0) * (dying ? 0.1 : 0.7 + 0.3 * Math.sin(time * 3 + z.seed));
  const vein = [e[0] * vk, e[1] * vk, e[2] * vk], eyeGlow = dying ? 0.15 : 2.6, pul = 0.6 + 0.4 * Math.sin(time * 6);
  const skin = P.skin, cloth = P.cloth, pants = P.pants;
  for (let i = 0; i < ZPARTS; i++) setV(u.uPS.value[i], skin);
  setV(u.uPT.value[0], cloth); setV(u.uPE.value[0], vein);
  setV(u.uPT.value[1], cloth); setV(u.uPE.value[1], vein);
  setV(u.uPT.value[2], cloth); setV(u.uPE.value[2], vein);
  setV(u.uPT.value[3], pants); setV(u.uPE.value[3], vein);
  setV(u.uPT.value[4], pants); u.uPE.value[4].set(0, 0, 0);
  setV(u.uPT.value[5], z.hair); setV(u.uPE.value[5], e, eyeGlow);
  setV(u.uPT.value[6], skin); u.uPE.value[6].set(0, 0, 0);
  if (T === 'boss') { u.uPT.value[7].set(0.22, 0.16, 0.24); u.uPS.value[7].set(0.12, 0.09, 0.14); u.uPE.value[7].set(2 * pul, 0.3, 1.8 * pul); }
  else { setV(u.uPT.value[7], ARMOUR_PLATE); setV(u.uPS.value[7], ARMOUR_DARK); u.uPE.value[7].set(1.7, 0.13, 0.35); }
  setV(u.uPT.value[8], ARMOUR_PLATE); setV(u.uPS.value[8], ARMOUR_DARK); if (dying) u.uPE.value[8].set(0.3, 0, 0.05); else setV(u.uPE.value[8], [e[0] * 3.2, e[1] * 3, e[2] * 3]);
  setV(u.uPT.value[9], skin); setV(u.uPS.value[9], skin, 0.8); u.uPE.value[9].set(2.4 * pul, 0.3, 2.2 * pul);
  u.uHide.value[5] = z.headless ? 1 : 0; u.uHide.value[6] = z.headless || z.jawGone ? 1 : 0; u.uHide.value[8] = z.headless || z.helmetGone ? 1 : 0;
  u.uFlash.value = fl; u.uSeed.value = z.seed;
  r.mesh.visible = true;
  // ---------- rigid extras attached to bones ----------
  const neck = B.neck.matrixWorld.elements, spine = B.spine.matrixWorld.elements;
  if (!z.headless) { if (z.jawGone) part(neck, 0, 0.07, 0.05, 0.1, 0.03, 0.07, [0.3, 0.02, 0.02], null, 0); }
  else part(neck, 0, 0.0, 0.02, 0.1, 0.04, 0.1, [0.3, 0.03, 0.03], null, 0);
  if (T === 'boss') {
    part(spine, 0, 0.32, 0.14, 0.2, 0.2, 0.1, [1, 0.3, 0.9], [4 * pul, 0.8, 3.6 * pul], fl, MESH.sphere);
    if (!z.headless) for (let k = 0; k < 3; k++) part(neck, (k - 1) * 0.07, 0.29, -0.02, 0.05, 0.14, 0.05, [0.9, 0.2, 0.8], [2 * pul, 0.3, 1.8 * pul], 0, MESH.cone, -0.2, 0, (k - 1) * 0.4);
    part(B.elbowR.matrixWorld.elements, 0, -0.47, 0.06, 0.1, 0.12, 0.1, [1, 0.3, 0.9], [2.4, 0.4, 2.2], 0, MESH.cone, Math.PI);
  }
  // ---------- stuck arrows ----------
  for (const sa of z.stuck) {
    if (sa.part === 'head' && z.headless) continue;
    const F = zFrame(z, sa.part);
    const a = M4.pt(F, sa.lp[0], sa.lp[1], sa.lp[2], [0, 0, 0]);
    const d = M4.dir(F, sa.ld[0], sa.ld[1], sa.ld[2], [0, 0, 0]); const L = Math.hypot(d[0], d[1], d[2]) || 1;
    const len = 0.6; const bx = a[0] - d[0] / L * len, by = a[1] - d[1] / L * len, bz = a[2] - d[2] / L * len;
    drawItem(MESH.box, M4.align(poolM(), a[0], a[1], a[2], bx, by, bz, 0.02, 0.02), [0.08, 0.08, 0.09]);
    const A = ARROWS[sa.type]; drawItem(MESH.box, M4.align(poolM(), bx + d[0] / L * 0.04, by + d[1] / L * 0.04, bz + d[2] / L * 0.04, bx, by, bz, 0.035, 0.035), A.color, A.glow);
  }
}
