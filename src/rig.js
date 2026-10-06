/* ============================================================
   Rigged infected: one skinned mesh per zombie, built from the Blender
   armature + clips (tools/make_rig.py -> models/zombie.glb).
   Clips drive the living body; hit reactions are layered on top as
   additive rotations; deaths, pins and crumples blend over to the
   procedural physics pose from zPose().
   ============================================================ */
const ZRIG = { ready: false, clips: {}, geos: {}, parts: {}, boneNames: [], inverses: null, rootTemplate: null, bindMatrix: null, pool: {}, live: new Set() };
const CLIP_RANGES = { walk: [0, 36, 1], run: [42, 60, 1], heavy: [66, 110, 1], boss_walk: [116, 172, 1], idle: [178, 238, 1], attack: [244, 274, 0], crawl: [280, 320, 1], crawl_attack: [326, 350, 0], slam: [356, 404, 0], roar: [410, 452, 0],
  walk_b: [458, 498, 1], walk_c: [504, 540, 1], run_b: [546, 564, 1], idle_b: [570, 642, 1] };
const PARTMAP = [['torso_', 0], ['uarm_', 1], ['farm', 2], ['pelvis', 3], ['thigh', 4], ['shin', 4], ['head_', 5], ['jaw', 6], ['brute_helmet', 8], ['brute_', 7], ['boss_hump', 9], ['boss_arm', 9], ['walker_ribs', 9], ['runner_tendons', 9], ['brute_breach', 9]];
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
  const kind = ['walker', 'runner', 'brute', 'boss'].includes(z.type) ? z.type : 'walker';
  const top = ZRIG.parts['torso_' + z.top] ? z.top : z.bare ? 'bare' : 'shirt';
  const arm = top === 'jacket' || kind === 'brute' ? 'jacket' : z.sleeve && !z.bare && top !== 'bloat' ? 'sleeve' : 'bare';
  const head = ZRIG.parts['head_' + z.headVar] ? z.headVar : 'a';
  return 'torso_' + top + '|head_' + head + '|' + arm + '|' + kind;
}
function zGeometry(key) {
  if (ZRIG.geos[key]) return ZRIG.geos[key];
  const [torso, head, arm, kind] = key.split('|');
  const fa = arm === 'jacket' && ZRIG.parts.farm_jacketL ? 'farm_jacket' : 'farm';
  const names = [torso, head, 'jaw', 'uarm_' + arm + 'L', 'uarm_' + arm + 'R', fa + 'L', fa + 'R', 'pelvis', 'thighL', 'thighR', 'shinL', 'shinR'];
  if (kind === 'brute') names.push('brute_vest', 'brute_padL', 'brute_padR', 'brute_helmet', 'brute_kneeL', 'brute_kneeR', 'brute_guardL', 'brute_guardR');
  if (kind === 'boss') names.push('brute_padL', 'brute_padR', 'boss_hump', 'boss_arm');
  if (kind === 'walker') names.push('walker_ribs');
  if (kind === 'runner') names.push('runner_tendonsL', 'runner_tendonsR');
  if (kind === 'brute') names.push('brute_breach');
  const list = names.map(n => ZRIG.parts[n]).filter(Boolean);
  const g = mergeGeometries(list, false); g.computeBoundingSphere();
  return (ZRIG.geos[key] = g);
}

/* ---------- Meshy zombies: textured, auto-rigged models folded onto this skeleton (tools/meshy_zombie.py) ----------
   One model per breed (models/mz_<type>.glb). Same 13 bones, same clips: position tracks are re-based onto the new
   rest pose so longer or shorter legs still plant the feet. Breeds without a model keep the sculpted parts. */
const MZ = {}, MZ_BY = {};   // model name -> template; breed -> its model names (walker, walker_dock, ...)
async function loadMeshyZombies(pick) {   // pick(name) -> bool: load a subset (boot waits for the walkers, the rest stream in)
  if (!ZRIG.ready || typeof MZ_TYPES === 'undefined' || !MZ_TYPES.length || (window.__NQ_RIG_URL || '').endsWith('.json')) return;
  if (window.__NQ_NOMZ || /[?&]nomz=1/.test(location.search)) return;   // fall back to the sculpted bodies (comparisons, debugging)
  const logical = (n) => n.replace(/_\d+$/, '').replace(/\./g, '');
  const oldRest = {}; ZRIG.rootTemplate.traverse(o => { if (o.isBone) oldRest[logical(o.name)] = o.position.clone(); });
  const list = MZ_TYPES.filter(t => !MZ[t] && (!pick || pick(t)));
  await Promise.all(list.map(async (t) => {
    try {
      const g = await new GLTFLoader().loadAsync('models/mz_' + t + '.glb?v=' + MZ_VER);
      let sm = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isSkinnedMesh && !sm) sm = o; });
      if (!sm) return;
      const geo = sm.geometry;
      if (geo.attributes._part) { geo.setAttribute('part', geo.attributes._part); geo.deleteAttribute('_part'); }
      if (geo.attributes.skinIndex.array.constructor !== Uint16Array) geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Uint16Array.from(geo.attributes.skinIndex.array), 4));
      geo.computeBoundingSphere();
      const skel = sm.skeleton; let root = skel.bones[0]; while (root.parent && root.parent.isBone) root = root.parent;
      const byLogical = {}, newRest = {}; skel.bones.forEach(b => { byLogical[logical(b.name)] = b.name; newRest[logical(b.name)] = b.position.clone(); });
      const clips = {};
      for (const k in ZRIG.clips) {
        const src = ZRIG.clips[k], tracks = [];
        for (const tr of src.tracks) {
          const dot = tr.name.lastIndexOf('.'), node = logical(tr.name.slice(0, dot)), prop = tr.name.slice(dot + 1);
          if (!byLogical[node]) continue;
          const c = tr.clone(); c.name = byLogical[node] + '.' + prop;
          if (prop === 'position' && oldRest[node] && newRest[node]) {
            const d = newRest[node].clone().sub(oldRest[node]);
            for (let i = 0; i < c.values.length; i += 3) { c.values[i] += d.x; c.values[i + 1] += d.y; c.values[i + 2] += d.z; }
          }
          tracks.push(c);
        }
        const c = new THREE.AnimationClip(k, src.duration, tracks); c.userData = src.userData; clips[k] = c;
      }
      const m = sm.material, nq = (g.parser.json.extras || {}).nq || {};
      for (const tx of [m.map, m.normalMap]) if (tx) { tx.anisotropy = 4; tx.needsUpdate = true; }
      MZ[t] = { geo, rootTemplate: root, boneNames: skel.bones.map(b => b.name), inverses: skel.boneInverses.map(x => x.clone()), bindMatrix: sm.bindMatrix.clone(),
        name: t, logicalOf: Object.fromEntries(skel.bones.map(b => [b.name, logical(b.name)])), map: m.map, normalMap: m.normalMap, nq, clips, hipD: (newRest.pelvis ? newRest.pelvis.y : 0.95) - 0.95 };
    } catch (e) { console.warn('meshy zombie unavailable:', t, e); }
  }));
  for (const t of list) if (MZ[t]) { const b = t.split('_')[0]; (MZ_BY[b] || (MZ_BY[b] = [])).push(t); }
}
// each body keeps its model for life: chosen from its seed, so a crowd mixes every outfit the breed has
function mzFor(z) { const l = MZ_BY[z.type]; if (!l) return null; return MZ[l[Math.floor(((z.seed * 9.173) % 1 + 1) % 1 * l.length) % l.length]]; }

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
  const mz = mzFor(z);
  const key = mz ? 'mz|' + mz.name : zVariant(z);
  const pool = ZRIG.pool[key] || (ZRIG.pool[key] = []);
  let r = pool.pop();
  if (!r) {
    const mat = nqMaterial('zombie');
    if (mz) { mat.defines.NQ_ZTEX = 1; mat.map = mz.map; mat.normalMap = mz.normalMap; mat.normalScale.set(1, 1); mat.customProgramCacheKey = () => 'nq-zombie-tex'; }
    const mesh = new THREE.SkinnedMesh(mz ? mz.geo : zGeometry(key), mat);
    mesh.name = 'zmesh'; mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = zDepthMat(mat.userData.u);
    const T = mz || ZRIG;
    const root = T.rootTemplate.clone(true);
    const byName = {}; root.traverse(o => { if (o.isBone) byName[o.name] = o; });
    const bones = T.boneNames.map(n => byName[n]);
    mesh.add(root);
    mesh.bind(new THREE.Skeleton(bones, T.inverses), T.bindMatrix);
    const B = {}; for (const b of bones) B[T.logicalOf[b.name]] = b;
    B.shoulderL = B.shoulderL || B['shoulder.L']; // defensive
    const mixer = new THREE.AnimationMixer(mesh);
    // the rig's local matrices are composed by poseZombieRig only (once per pose), not again on every scene render
    const nodes = []; mesh.traverse(o => { o.matrixAutoUpdate = false; nodes.push(o); });
    r = { key, mesh, mat, u: mat.userData.u, B, mixer, actions: {}, cur: null, nodes, poseN: 0, skelN: -1, mz, clips: mz ? mz.clips : ZRIG.clips };
    // three refreshes a skeleton (and re-uploads its bone texture) once per render call - reflection, world, bow pass...
    // The bones only move in poseZombieRig, so recompute them only when a new pose has been made since the last time.
    const rr = r; mesh.skeleton.update = function () { if (rr.skelN === rr.poseN) return; rr.skelN = rr.poseN; THREE.Skeleton.prototype.update.call(this); };
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
  if (!a) { const c = r.clips[name]; a = r.actions[name] = r.mixer.clipAction(c); a.setLoop(c.userData.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = true; }
  return a;
}
const LOCO = { walker: 'walk', runner: 'run', brute: 'heavy', boss: 'boss_walk', spitter: 'walk', screamer: 'walk', climber: 'run' };
const PHASE_RATE = { walker: 5.2, runner: 11, brute: 4.2, boss: 3.2, spitter: 5, screamer: 5, climber: 9 };
function zWantClip(z) {
  if (z.crawl) return z.state === 'attack' ? 'crawl_attack' : 'crawl';
  if (z.state === 'attack') return 'attack';
  if (z.state === 'slam') return 'slam';
  if (z.state === 'roar') return 'roar';
  if (z.state === 'drop') return 'idle';
  if (z.state === 'dying') return z.rig.cur || 'idle';
  if ((z.mv || 0) > 0.1) return (z.type === 'walker' || z.type === 'runner') && ZRIG.clips[z.gait] ? z.gait : LOCO[z.type];
  return ZRIG.clips[z.idleClip] ? z.idleClip : 'idle';
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _qa = new THREE.Quaternion();
function qEuler(x, y, z) { _e.set(x, y, z, 'YXZ'); return _q.setFromEuler(_e); }
function addRot(bone, x, y, z) { if (x || y || z) bone.quaternion.multiply(qEuler(x, y, z)); }
function blendRot(bone, w, x, y, z) { qEuler(x, y, z); bone.quaternion.slerp(_q, w); }
const _hv = [0, 0, 0];
const _ZP_ALIVE = { rootRx: 0, rootRz: 0 };

function poseZombieRig(z, dt, time) {
  const r = z.rig || makeRig(z);
  z._ps = STEPN.n;
  // the procedural pose only matters once dying (it drives the root tilt and the death blend); the living layers don't read it
  const P = z.state === 'dying' ? zPose(z, time) : _ZP_ALIVE, B = r.B;
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
    else { const rate = z.crawl ? 3.2 : PHASE_RATE[z.type] * (r.cur === 'walk_b' ? 0.85 : 1) * (0.92 + 0.16 * ((z.seed * 7.31) % 1)); act.timeScale = rate / (TAU / dur) * (z.crawl ? 1 : clamp((z.mv || 0) / Math.max(0.5, z.speed), 0.6, 1.25)); }
  }
  r.mixer.update(dt);
  // ---------- procedural layers ----------
  const R = z.R;
  // body shape per breed (the mixer rewrites scale every update)
  B.pelvis.scale.setScalar(1); B.spine.scale.setScalar(1); B.neck.scale.setScalar(1); B.shoulderL.scale.setScalar(1); B.shoulderR.scale.setScalar(1); B.elbowL.scale.setScalar(1); B.elbowR.scale.setScalar(1);
  if (r.mz) { }
  else if (z.type === 'brute') { B.pelvis.scale.set(1.28, 1, 1.28); B.spine.scale.set(1.18, 1, 1.18); B.neck.scale.set(0.78, 0.92, 0.78); B.shoulderL.scale.set(1.12, 1, 1.12); B.shoulderR.scale.set(1.12, 1, 1.12); }
  else if (z.type === 'boss') { B.pelvis.scale.set(0.96, 1, 0.96); B.spine.scale.set(1.42, 1, 1.28); B.neck.scale.set(0.68, 0.82, 0.68); B.shoulderL.scale.set(1.32, 1.04, 1.25); B.shoulderR.scale.set(1.45, 1.08, 1.36); B.elbowR.scale.set(1.55, 1.18, 1.55); }
  else if (z.type === 'runner') { B.pelvis.scale.set(0.82, 1.04, 0.82); B.spine.scale.set(0.78, 1.12, 0.84); B.neck.scale.set(1.05, 0.94, 1.05); B.shoulderL.scale.set(0.82, 1.14, 0.82); B.shoulderR.scale.set(0.82, 1.14, 0.82); B.elbowL.scale.set(0.78, 1.14, 0.78); B.elbowR.scale.set(0.78, 1.14, 0.78); }
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
    if (z.type === 'runner') { addRot(B.spine, 0.3, 0, 0); addRot(B.neck, -0.22, 0, 0); }   // hunched, head up to keep the gaze level
    if (z.type === 'walker' && !z.crawl) addRot(B.neck, 0, 0, Math.sin(time * 2.1 + z.seed) * 0.08);
    if (z.type === 'brute') { addRot(B.shoulderL, 0, 0, 0.16); addRot(B.shoulderR, 0, 0, -0.16); }   // arms in closer to the body under the gear
    zLife(z, r, dt, time);
  }
  if (w > 0) {
    // physics-driven death pose (pins, crumples, falls) takes over from the clip
    blendRot(B.pelvis, w, P.pelRx, P.twist, 0); B.pelvis.position.x *= 1 - w; B.pelvis.position.z *= 1 - w; B.pelvis.position.y = lerp(B.pelvis.position.y, P.hipY + (r.mz ? r.mz.hipD * clamp(P.hipY / 0.95, 0, 1) : 0), w);
    blendRot(B.spine, w, P.lean, -P.twist * 1.5 + P.torYaw, P.spRz);
    blendRot(B.neck, w, P.headRx, 0, P.roll); blendRot(B.jaw, w, P.jaw, 0, 0);
    blendRot(B.shoulderL, w, P.shL, 0, -P.spread); blendRot(B.shoulderR, w, P.shR, 0, P.spread);
    blendRot(B.elbowL, w, P.elL, 0, 0); blendRot(B.elbowR, w, P.elR, 0, 0);
    blendRot(B.hipL, w, P.hipLa, 0, 0.03); blendRot(B.hipR, w, P.hipRa, 0, -0.03);
    blendRot(B.kneeL, w, P.knLa, 0, 0); blendRot(B.kneeR, w, P.knRa, 0, 0);
  }
  // ---------- root transform ----------
  const m = r.mesh;
  m.position.set(z.x, z.y - (z.sink || 0), z.z); m.rotation.set(P.rootRx, z.yaw, P.rootRz, 'YXZ'); m.scale.setScalar(z.scale);
  m.castShadow = SETTINGS.quality > 0 || (PLAYER.x - z.x) ** 2 + (PLAYER.z - z.z) ** 2 < 400;   // Low: only nearby bodies cast shadows
  for (const o of r.nodes) o.updateMatrix();   // same result as the renderer's auto-update, done once here
  m.updateMatrixWorld(true); r.poseN++;
  // ---------- hit volumes from the skeleton ----------
  const hs = z.type === 'boss' ? 0.85 : 1;
  const nq = r.mz && r.mz.nq.head ? r.mz.nq : null;
  if (nq) {
    M4.pt(B.neck.matrixWorld.elements, nq.head[0], nq.head[1], nq.head[2], z.head);
    M4.pt(B.pelvis.matrixWorld.elements, 0, 0, 0, z.a); M4.pt(B.spine.matrixWorld.elements, nq.chest[0], nq.chest[1], nq.chest[2], z.b);
    M4.pt(B.spine.matrixWorld.elements, nq.core[0], nq.core[1], nq.core[2], z.core);
  } else {
  M4.pt(B.neck.matrixWorld.elements, 0, 0.155 * (z.type === 'boss' ? 1 : hs), 0.01, z.head);
  M4.pt(B.pelvis.matrixWorld.elements, 0, 0, 0, z.a); M4.pt(B.spine.matrixWorld.elements, 0, 0.5, 0, z.b);
  M4.pt(B.spine.matrixWorld.elements, 0, 0.32, 0.14, z.core);
  }
  const fy = nq ? nq.foot[1] : -0.42;
  M4.pt(B.hipL.matrixWorld.elements, 0, 0, 0, z.hipL); M4.pt(B.kneeL.matrixWorld.elements, 0, 0, 0, z.knL); M4.pt(B.kneeL.matrixWorld.elements, 0, fy, 0, z.ftL);
  M4.pt(B.hipR.matrixWorld.elements, 0, 0, 0, z.hipR); M4.pt(B.kneeR.matrixWorld.elements, 0, 0, 0, z.knR); M4.pt(B.kneeR.matrixWorld.elements, 0, fy, 0, z.ftR);
  return r;
}

/* ---- the living layer: head tracking the player, ragged breathing, twitches, reaching when close, leaning into turns ---- */
function zLife(z, r, dt, time) {
  const B = r.B, alive = z.state !== 'dying' && z.state !== 'drop';
  const dx = PLAYER.x - z.x, dz = PLAYER.z - z.z, dist = Math.hypot(dx, dz) || 1;
  // head tracks the player: yaw relative to the body, pitch toward the player's eyes
  let rel = Math.atan2(dx, dz) - z.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const want = alive && dist < 14 && Math.abs(rel) < 1.9 ? clamp(rel, -0.75, 0.75) : 0;
  const wantP = alive && dist < 14 ? clamp(-Math.atan2((PLAYER.y || 0) + 1.6 - (z.y + 1.7 * z.scale), dist), -0.4, 0.4) : 0;
  const k = 1 - Math.exp(-dt * 4);
  z.look += (want - z.look) * k; z.lookP += (wantP - z.lookP) * k;
  const wy = z.crawl ? 0.4 : 1;
  addRot(B.neck, z.lookP * 0.6 * wy, z.look * 0.65 * wy, 0); addRot(B.spine, 0, z.look * 0.3 * wy, 0);
  if (!alive) return;
  // breathing: ragged chest heave, jaw working
  const br = Math.sin(time * 1.9 * z.breath + z.seed), br2 = Math.max(0, Math.sin(time * 3.8 * z.breath + z.seed * 2));
  addRot(B.spine, 0.025 * br, 0, 0); addRot(B.shoulderL, 0, 0, -0.02 * br); addRot(B.shoulderR, 0, 0, 0.02 * br); addRot(B.jaw, 0.12 * br2, 0, 0);
  // a slack, hanging jaw that opens into a snarl as the player closes in
  if (z.gape === undefined) z.gape = rand(0.14, 0.32);
  addRot(B.jaw, z.gape + clamp((8 - dist) / 6, 0, 1) * 0.28 + (z.state === 'attack' ? 0.2 : 0), 0, 0);
  // posture: every body carries its damage differently. A hunched spine, a head that hangs to one side,
  // one shoulder dropped, arms hanging unevenly and a slow, drunken sway, so a crowd never reads as mannequins.
  if (!z.crawl && z.type !== 'boss') {
    if (!z.pose) { const sg = () => (Math.random() < 0.5 ? -1 : 1); z.pose = { hunch: rand(0.14, 0.36), tilt: rand(0.1, 0.32) * sg(), drop: rand(0.05, 0.15) * sg(), twist: rand(0.04, 0.14) * sg(), armL: rand(-0.14, 0.16), armR: rand(-0.14, 0.16), outL: rand(0, 0.14), outR: rand(0, 0.14), elL: rand(0.02, 0.3), elR: rand(0.02, 0.3), swayF: rand(0.45, 0.9) }; }
    const Q = z.pose, bk = z.type === 'brute' ? 0.45 : z.type === 'runner' ? 0.55 : 1, still = (z.mv || 0) > 0.1 ? 0.5 : 1;
    const sway = Math.sin(time * Q.swayF + z.seed * 3), sway2 = Math.sin(time * Q.swayF * 0.61 + z.seed);
    addRot(B.spine, Q.hunch * bk + 0.03 * sway2 * still, Q.twist * bk, (Q.drop + 0.05 * sway * still) * bk);
    addRot(B.neck, -Q.hunch * 0.45 * bk, 0, (Q.tilt + 0.06 * sway2 * still) * bk);   // lift the gaze back toward level, keep the lolling tilt
    if (z.state !== 'attack') {
      addRot(B.shoulderL, Q.armL * bk, 0, Q.outL * bk); addRot(B.shoulderR, Q.armR * bk, 0, -Q.outR * bk);
      addRot(B.elbowL, Q.elL * bk, 0, 0); addRot(B.elbowR, Q.elR * bk, 0, 0);
    }
  }
  // twitches: short spasms through the hit-reaction springs
  z.twT -= dt;
  if (z.twT <= 0) { z.twT = rand(1.5, 7); const R = z.R, s = z.type === 'brute' ? 0.4 : 1; R.hv += rand(-5, 5) * s; R.yv += rand(-3, 3) * s; if (Math.random() < 0.4) R.tv += rand(-2, 2) * s; }
  // reach for the player when close
  if (z.state !== 'attack' && !z.crawl && z.type !== 'boss') {
    const reach = clamp((3.2 - dist) / 2, 0, 1) * (Math.abs(rel) < 1 ? 1 : 0);
    if (reach > 0) { addRot(B.shoulderL, -0.7 * reach, 0, 0); addRot(B.shoulderR, -0.6 * reach, 0, 0); addRot(B.elbowL, 0.25 * reach, 0, 0); addRot(B.elbowR, 0.25 * reach, 0, 0); }
  }
  // lean into turns
  const dyaw = z._py === undefined ? 0 : Math.atan2(Math.sin(z.yaw - z._py), Math.cos(z.yaw - z._py)); z._py = z.yaw;
  z.bank = (z.bank || 0) + (clamp(dt > 0 ? dyaw / dt : 0, -3, 3) * 0.06 - (z.bank || 0)) * k;
  addRot(B.spine, 0, 0, -z.bank * (z.type === 'runner' ? 1.6 : 1));
}
const _v3 = (a) => a;
function setV(v, c, k = 1) { v.set(c[0] * k, c[1] * k, c[2] * k); }
// scratch colours for drawZombieRig (copied straight into the material's uniforms, never kept)
const _vein = [0, 0, 0], _skin = [0, 0, 0], _cloth = [0, 0, 0], _pants = [0, 0, 0];
function icy(out, c, ice) { if (!ice) return c; out[0] = c[0] + (0.42 - c[0]) * ice; out[1] = c[1] + (0.62 - c[1]) * ice; out[2] = c[2] + (0.8 - c[2]) * ice; return out; }
function drawZombieRig(z, time) {
  if (!z.rig || z._ps === undefined) poseZombieRig(z, 0, time);
  const r = z.rig, u = r.u, T = z.type, B = r.B;
  const P = _ZP; zPose(z, time); // colours / flash for this frame
  const dying = z.state === 'dying', fl = z.flash > 0 ? 0.55 : 0;
  const e = z.eyes || z.T.eyes, vk = (T === 'boss' ? 1.35 : z.elite ? 0.9 : 0.34) * (dying ? 0.1 : 0.7 + 0.3 * Math.sin(time * 3 + z.seed));
  const vein = _vein; vein[0] = e[0] * vk; vein[1] = e[1] * vk; vein[2] = e[2] * vk;
  const eyeGlow = dying ? 0.0 : T === 'boss' ? 1.75 : z.elite ? 0.8 : 0.42, pul = 0.6 + 0.4 * Math.sin(time * 6);
  const ice = z.chill > 0 ? Math.min(1, z.chill / 1.5) * (z.chillK <= 0 ? 0.9 : 0.55) : 0;   // frosted over by a Cryo Burst
  const skin = icy(_skin, P.skin, ice), cloth = icy(_cloth, P.cloth, ice), pants = icy(_pants, P.pants, ice);
  const skinK = T === 'walker' ? 1.38 : T === 'runner' ? 1.22 : 1;
  for (let i = 0; i < ZPARTS; i++) setV(u.uPS.value[i], skin, skinK);
  setV(u.uPT.value[0], cloth); setV(u.uPE.value[0], vein);
  setV(u.uPT.value[1], cloth); setV(u.uPE.value[1], vein);
  setV(u.uPT.value[2], cloth); setV(u.uPE.value[2], vein);
  setV(u.uPT.value[3], pants); setV(u.uPE.value[3], vein);
  setV(u.uPT.value[4], pants); u.uPE.value[4].set(0, 0, 0);
  setV(u.uPT.value[5], z.hair); setV(u.uPE.value[5], e, eyeGlow);
  setV(u.uPT.value[6], skin); u.uPE.value[6].set(0, 0, 0);
  if (T === 'boss') { u.uPT.value[7].set(0.22, 0.16, 0.24); u.uPS.value[7].set(0.12, 0.09, 0.14); u.uPE.value[7].set(2 * pul, 0.3, 1.8 * pul); }
  else { setV(u.uPT.value[7], ARMOUR_PLATE); setV(u.uPS.value[7], ARMOUR_DARK); u.uPE.value[7].set(0, 0, 0); }
  setV(u.uPT.value[8], ARMOUR_PLATE); setV(u.uPS.value[8], ARMOUR_DARK); if (dying) u.uPE.value[8].set(0.3, 0, 0.05); else u.uPE.value[8].set(e[0] * 0.55, e[1] * 0.5, e[2] * 0.5);
  if (T === 'boss') { setV(u.uPT.value[9], skin); setV(u.uPS.value[9], skin, 0.8); u.uPE.value[9].set(2.4 * pul, 0.3, 2.2 * pul); }
  else if (T === 'walker' || T === 'spitter' || T === 'screamer') { u.uPT.value[9].set(0.72, 0.66, 0.54); u.uPS.value[9].set(0.25, 0.035, 0.04); u.uPE.value[9].set(e[0] * 0.11, e[1] * 0.045, e[2] * 0.035); }
  else if (T === 'runner' || T === 'climber') { setV(u.uPT.value[9], skin, 0.72); setV(u.uPS.value[9], skin, 0.58); u.uPE.value[9].set(0.04, 0.13, 0.035); }
  else { u.uPT.value[9].set(0.28, 0.025, 0.035); u.uPS.value[9].set(0.12, 0.018, 0.025); u.uPE.value[9].set(0.18, 0.012, 0.02); }
  if (r.mz) {   // textured scans: a per-body tone (no two shades of rot alike) and the Cryo frost, read by the NQ_ZTEX shader branch
    const h1 = (z.seed * 13.71) % 1, h2 = (z.seed * 7.13 + 0.37) % 1, k = 0.88 + 0.2 * h1;
    for (let i = 0; i < ZPARTS; i++) { u.uPT.value[i].set(k * (0.96 + 0.08 * h2), k, k * (1.04 - 0.08 * h2)); u.uPS.value[i].set(ice, 0, 0); }
  }
  u.uHide.value[5] = z.headless ? 1 : 0; u.uHide.value[6] = z.headless || z.jawGone ? 1 : 0; u.uHide.value[8] = z.headless || z.helmetGone ? 1 : 0;
  u.uFlash.value = fl; u.uSeed.value = z.seed;
  r.mesh.visible = true;
  // ---------- rigid extras attached to bones ----------
  const neck = B.neck.matrixWorld.elements, spine = B.spine.matrixWorld.elements;
  if (r.mz && r.mz.nq.eyes && !z.headless) {
    const E = r.mz.nq.eyes, g = (dying ? 0.15 : 1) * (T === 'boss' ? 2.2 : z.elite ? 1.5 : 1.1);
    for (const sx of [-1, 1]) part(neck, E[0] * sx, E[1], E[2], 0.0105, 0.0075, 0.006, [0.05, 0.02, 0.01], [e[0] * 3.2 * g, e[1] * 3.2 * g, e[2] * 3.2 * g], 0, MESH.sphere);
  }
  if (!z.headless) { if (z.jawGone) part(neck, 0, 0.07, 0.05, 0.1, 0.03, 0.07, [0.3, 0.02, 0.02], null, 0); }
  else part(neck, 0, 0.0, 0.02, 0.1, 0.04, 0.1, [0.3, 0.03, 0.03], null, 0);
  if (T === 'boss' && r.mz) {
    const C = r.mz.nq.core; part(spine, C[0], C[1], C[2] + 0.02, 0.13, 0.13, 0.07, [1, 0.3, 0.9], [4 * pul, 0.8, 3.6 * pul], fl, MESH.sphere);
  } else if (T === 'boss') {
    part(spine, 0, 0.32, 0.14, 0.2, 0.2, 0.1, [1, 0.3, 0.9], [4 * pul, 0.8, 3.6 * pul], fl, MESH.sphere);
    if (!z.headless) for (let k = 0; k < 3; k++) part(neck, (k - 1) * 0.07, 0.29, -0.02, 0.05, 0.14, 0.05, [0.9, 0.2, 0.8], [2 * pul, 0.3, 1.8 * pul], 0, MESH.cone, -0.2, 0, (k - 1) * 0.4);
    part(B.elbowR.matrixWorld.elements, 0, -0.47, 0.06, 0.1, 0.12, 0.1, [1, 0.3, 0.9], [2.4, 0.4, 2.2], 0, MESH.cone, Math.PI);
  }
  // ---------- tether: stakes into the ground and glowing lines to the zombies it chained ----------
  if (z.pin > 0 && !z.dead) {
    const TC = ARROWS[5].color, TG = ARROWS[5].glow, k = Math.min(1, z.pin);
    for (const s of [-1, 1]) drawItem(MESH.box, M4.align(poolM(), z.core[0], z.core[1] * 0.7, z.core[2], z.x + s * 0.9, 0.02, z.z + 0.6 * s, 0.02, 0.02), TC, [TG[0] * k, TG[1] * k, TG[2] * k]);
    if (z.tetherTo) for (const o of z.tetherTo) if (!o.dead) drawItem(MESH.box, M4.align(poolM(), z.core[0], z.core[1], z.core[2], o.core[0], o.core[1], o.core[2], 0.025, 0.025), TC, [TG[0] * k, TG[1] * k, TG[2] * k]);
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
