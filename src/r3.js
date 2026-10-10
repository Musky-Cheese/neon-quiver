/* ============================================================
   three.js scene graph + frame pipeline
   world pass (MSAA, baked occlusion) -> viewmodel pass -> bloom -> grade
   ============================================================ */
const R3 = { W: 0, H: 0, quality: -1, tick: 0 };
var ENV_DIRTY = true;
scene.matrixAutoUpdate = false;   // the root stays at the origin: don't force a full-scene matrix refresh every render
function onThemeChanged() { ENV_DIRTY = true; }

/* ---------------- instanced draw batches (world + viewmodel) ---------------- */
const BATCHES = [new Map(), new Map()];
function batchFor(geo, vm) {
  const map = BATCHES[vm ? 1 : 0];
  let b = map.get(geo);
  if (!b) { b = { geo, vm, cap: 0, im: null, n: 0 }; map.set(geo, b); }
  return b;
}
function growBatch(b, need) {
  if (b.cap >= need) return;
  const cap = Math.max(need, b.cap * 2, 8);
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'nqm']) g.setAttribute(k, b.geo.attributes[k]);
  g.setIndex(b.geo.index);
  const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  g.setAttribute('iTint', mk(4)); g.setAttribute('iEmit', mk(3)); g.setAttribute('iSkin', mk(3));
  const im = new THREE.InstancedMesh(g, b.vm ? MAT.vm : MAT.inst, cap);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false; im.castShadow = !b.vm; im.receiveShadow = !b.vm;
  if (b.vm) im.layers.set(LAYER_VM);
  if (b.im) { scene.remove(b.im); b.im.dispose(); }
  scene.add(im); b.im = im; b.cap = cap;
}
function upRange(a, count) { a.clearUpdateRanges(); a.addUpdateRange(0, count); a.needsUpdate = true; }
function flushList(list, vm) {
  const map = BATCHES[vm ? 1 : 0];
  for (const b of map.values()) b.n = 0;
  for (let i = 0; i < list.n; i++) list.a[i].b = batchFor(list.a[i].mesh, vm), list.a[i].b.n++;
  for (const b of map.values()) { if (b.n) growBatch(b, b.n); b.fill = 0; }
  for (let i = 0; i < list.n; i++) {
    const it = list.a[i], b = it.b, k = b.fill++, g = b.im.geometry;
    b.im.instanceMatrix.array.set(it.m, k * 16);
    const t = g.attributes.iTint.array, e = g.attributes.iEmit.array, s = g.attributes.iSkin.array;
    t[k * 4] = it.col[0]; t[k * 4 + 1] = it.col[1]; t[k * 4 + 2] = it.col[2]; t[k * 4 + 3] = it.flash;
    e[k * 3] = it.emit[0]; e[k * 3 + 1] = it.emit[1]; e[k * 3 + 2] = it.emit[2];
    s[k * 3] = it.skin[0]; s[k * 3 + 1] = it.skin[1]; s[k * 3 + 2] = it.skin[2];
  }
  for (const b of map.values()) {
    if (!b.im) continue;
    b.im.count = b.n; b.im.visible = b.n > 0;
    if (b.n) {   // upload only the instances in use, not the whole (up to 2x) capacity
      const g = b.im.geometry, n = b.n;
      upRange(b.im.instanceMatrix, n * 16); upRange(g.attributes.iTint, n * 4); upRange(g.attributes.iEmit, n * 3); upRange(g.attributes.iSkin, n * 3);
    } else if (R3.warming) {
      // warm-up frame: one all-zero instance (every vertex at the origin, no pixels) so each pass builds and compiles
      // this batch's render state now rather than the first time an arrow, pickup or flame appears in it
      const g = b.im.geometry;
      b.im.instanceMatrix.array.fill(0, 0, 16); g.attributes.iTint.array.fill(0, 0, 4); g.attributes.iEmit.array.fill(0, 0, 3); g.attributes.iSkin.array.fill(0, 0, 3);
      upRange(b.im.instanceMatrix, 16); upRange(g.attributes.iTint, 4); upRange(g.attributes.iEmit, 3); upRange(g.attributes.iSkin, 3);
      b.im.count = 1; b.im.visible = true;
    }
  }
}

/* ---------------- sky dome ---------------- */
const SKY_U = { uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uDiscCol: { value: new THREE.Color() }, uDiscDir: { value: new THREE.Vector3() }, uStars: { value: 1 } };
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24),
  skyMaterialGPU(SKY_U)
);
// drawn after every other opaque surface, at the far plane (gpu.js skyMaterialGPU): only the pixels the city leaves open run the
// sky shader, where before the whole screen did and was then painted over
skyMesh.frustumCulled = false; skyMesh.renderOrder = 1000; skyMesh.matrixAutoUpdate = true;
scene.add(skyMesh);

/* ---------------- signs + decals (textured quads) ---------------- */
const PLANE = new THREE.PlaneGeometry(1, 1);
// Signs are drawn in batches: one instanced draw per texture size and blend mode instead of one per sign. Each
// batch keeps its signs' canvases as the layers of a texture array (gpu.js signArrayGPU), and the per-sign uniforms
// become per-instance attributes.
const SIGNS = [];          // { s: WORLD.signs entry, b: its batch, layer, vis }
const SIGN_BATCHES = [];   // { mesh, list }
function buildSigns() {
  const groups = new Map();
  for (const s of WORLD.signs) {
    const k = s.tex.image.width + 'x' + s.tex.image.height + (s.add ? '+' : '');
    let g = groups.get(k); if (!g) groups.set(k, g = { add: s.add, list: [], texs: [], layer: new Map() });
    if (!g.layer.has(s.tex)) { g.layer.set(s.tex, g.texs.length); g.texs.push(s.tex); }
    g.list.push(s);
  }
  for (const g of groups.values()) {
    const n = g.list.length;
    const arr = signArrayGPU(g.texs), mat = signMaterialGPU(arr, g.add);
    const geo = new THREE.BufferGeometry(); geo.index = PLANE.index;   // WebGPU reads an InstancedBufferGeometry's own instanceCount, not the mesh's count
    for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, PLANE.attributes[k]);
    const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), sg = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    col.setUsage(THREE.DynamicDrawUsage); sg.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iCol', col); geo.setAttribute('iSign', sg);
    const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.visible = false;
    mesh.frustumCulled = false; mesh.renderOrder = g.add ? 5 : 0; mesh.name = g.add ? 'signsAdd' : 'signs';
    scene.add(mesh);
    const b = { mesh, list: [], arr, texs: g.texs }; SIGN_BATCHES.push(b);
    for (const s of g.list) { const q = { s, b, layer: g.layer.get(s.tex), vis: false }; b.list.push(q); SIGNS.push(q); }
  }
}
// a sign's canvas was redrawn after its batch was built: re-upload just that layer
function signLayerRefresh(tex) { for (const b of SIGN_BATCHES) { const L = b.texs.indexOf(tex); if (L >= 0) signArrayLayer(b.arr, tex, L); } }
// per frame: the visible signs of each batch, packed in their original order, with this frame's flicker
function syncSigns(time, T) {
  for (const b of SIGN_BATCHES) {
    const m = b.mesh, g = m.geometry, M = m.instanceMatrix.array, C = g.attributes.iCol.array, S = g.attributes.iSign.array; let n = 0;
    for (const { s, layer, vis } of b.list) {   // dead city: some signs are out; the rest hold steady (the sputtering third read as flicker)
      if (!vis) continue;
      const f = s.seed % 1, k = f < 0.08 ? 0.06 : 1;
      M.set(s.m, n * 16);
      C[n * 3] = s.col[0] * T.sign * k; C[n * 3 + 1] = s.col[1] * T.sign * k; C[n * 3 + 2] = s.col[2] * T.sign * k;
      S[n * 3] = s.seed; S[n * 3 + 1] = s.mode; S[n * 3 + 2] = layer; n++;
    }
    m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; g.attributes.iCol.needsUpdate = true; g.attributes.iSign.needsUpdate = true; }
  }
}
const DECAL_POOL = [];
function buildDecalPool() {
  for (let v = 0; v < DECAL_TEX.length; v++) {
    const g = PLANE.clone(); const alpha = new THREE.InstancedBufferAttribute(new Float32Array(DECAL_CAP), 1); alpha.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iAlpha', alpha);
    const mat = decalMaterialGPU(DECAL_TEX[v]);
    const m = new THREE.InstancedMesh(g, mat, DECAL_CAP); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; m.renderOrder = 2; m.receiveShadow = false;
    scene.add(m); DECAL_POOL.push(m);
  }
}
let _decalCounts = null; const _decalM = new Float32Array(16);
function syncDecals() {
  if (!_decalCounts || _decalCounts.length !== DECAL_POOL.length) _decalCounts = new Uint16Array(DECAL_POOL.length);
  const counts = _decalCounts; counts.fill(0);
  for (const d of DECALS) {
    const dd2 = (d.x - PLAYER.x) ** 2 + (d.z - PLAYER.z) ** 2;
    if (dd2 > 150 * 150) continue;
    const m = DECAL_POOL[d.v], i = counts[d.v]++;
    const fadeAt = DECAL_LIFE - 9;
    const a = Math.min(1, d.t * 6) * (d.t > fadeAt ? Math.max(0, 1 - (d.t - fadeAt) / 9) : 1);
    m.instanceMatrix.array.set(M4.trs(_decalM, d.x, 0.035, d.z, -Math.PI / 2, d.rot, 0, d.r * 2, d.r * 2, 1), i * 16);
    m.geometry.attributes.iAlpha.array[i] = a * 0.92;
  }
  for (let v = 0; v < DECAL_POOL.length; v++) {
    const m = DECAL_POOL[v], n = counts[v]; m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.iAlpha.needsUpdate = true; }
    else if (R3.warming) {   // as for the batches: one invisible decal per pool, so the first blood on the street compiles nothing
      m.instanceMatrix.array.fill(0, 0, 16); m.geometry.attributes.iAlpha.array[0] = 0; m.instanceMatrix.needsUpdate = true; m.geometry.attributes.iAlpha.needsUpdate = true;
      m.count = 1; m.visible = true;
    }
  }
}

/* ---------------- particles + rain ---------------- */
const partPoints = particlesGPU(PART.data), partBuf = partPoints.userData.buf, partGeo = partPoints.geometry, partMat = partPoints.material;
partPoints.frustumCulled = false; partPoints.renderOrder = 10; scene.add(partPoints);

const rainGeo = (function () {
  const p = new Float32Array(RAIN_N * 2 * 3), a = new Float32Array(RAIN_N * 2 * 2);
  for (let i = 0; i < RAIN_N; i++) { const x = Math.random() * 50, z = Math.random() * 50, y = Math.random() * 36, s = Math.random(); for (let e = 0; e < 2; e++) { const o = i * 2 + e; p[o * 3] = x; p[o * 3 + 1] = z; p[o * 3 + 2] = y; a[o * 2] = s; a[o * 2 + 1] = e; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aP2', new THREE.BufferAttribute(a, 2)); return g;
})();
const rainMat = rainGPU(rainGeo);
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; rainLines.renderOrder = 11; scene.add(rainLines);
// snow: soft flakes that drift, swirl and ride the wind (same drop buffer, one point per drop)
const snowPts = snowGPU(rainGeo, RAIN_N), snowMat = snowPts.material;
snowPts.frustumCulled = false; snowPts.renderOrder = 11; scene.add(snowPts);

/* ---------------- lights ---------------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, Math.PI); hemi.layers.enableAll(); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, Math.PI); sun.layers.enableAll(); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
const PL = [];
for (let i = 0; i < MAX_PL; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1); l.layers.enableAll(); scene.add(l); PL.push(l); }
const SPOTS = [];      // pool of spot lights parked on the nearest street lamps / floodlights
const N_SPOTS = 6, N_SHADOW_SPOTS = 4;
const SHADOW_CACHE = { sunX: Infinity, sunZ: Infinity, frame: -1 };
const PL_K = Math.PI * 0.142;   // matches the old (1-d/r)^2 falloff with decay=1 lights
function setPL(l, p, c, r) { l.position.set(p[0], p[1], p[2]); l.color.setRGB(c[0], c[1], c[2]); l.distance = r; l.intensity = PL_K * r; }
function buildLights() {
  for (let i = 0; i < N_SPOTS; i++) {
    const s = new THREE.SpotLight(0xffffff, 0, 28, 1.2, 0.55, 1); s.layers.enableAll();
    s.shadow.mapSize.set(1024, 1024); s.shadow.camera.near = 0.5; s.shadow.camera.far = 30; s.shadow.bias = -0.0008; s.shadow.normalBias = 0.03; s.shadow.radius = 3;
    s.shadow.autoUpdate = false;   // refreshed by updateLights3: half of them per frame, or at once when moved
    scene.add(s); scene.add(s.target); SPOTS.push({ s, shadow: i < N_SHADOW_SPOTS, lamp: null });
    GPU_PROF.shadowCams.add(s.shadow.camera);
  }
  GPU_PROF.shadowCams.add(sun.shadow.camera);
}
const _dyn = [], _stat = [], _lampsNear = [];
// dynamic light candidates come from a reused pool (no per-frame objects); p is either the source's own
// position array (flashes, the Warden's core) or the entry's own scratch array
const _dynPool = []; let _dynN = 0;
function dynE() { let e = _dynPool[_dynN]; if (!e) e = _dynPool[_dynN] = { p: null, own: [0, 0, 0], r: 0, c: [0, 0, 0], d: 0 }; _dynN++; return e; }
function dynL(p, r, cr, cg, cb) { const e = dynE(); e.p = p; e.r = r; e.c[0] = cr; e.c[1] = cg; e.c[2] = cb; }
function dynP(x, y, z, r, cr, cg, cb) { const e = dynE(); e.p = e.own; e.own[0] = x; e.own[1] = y; e.own[2] = z; e.r = r; e.c[0] = cr; e.c[1] = cg; e.c[2] = cb; }
const byD = (a, b) => a.d - b.d;
const d2c = (p, cam) => (p[0] - cam[0]) * (p[0] - cam[0]) + (p[2] - cam[2]) * (p[2] - cam[2]);
// Static lights (shops, rooms, doorways) outnumber the pool indoors. Picking the N nearest every frame made rooms
// swap their light on every step, so each one carries a fade weight (fw): the chosen set eases in/out, and a lit
// light keeps its slot until an unlit one is clearly closer (STAT_STICK on d²). The static budget is fixed, so arrows
// and pickups coming and going never push a room light out.
const STAT_PL = 11, DYN_MIN = 2, STAT_FADE = 4, STAT_STICK = 0.6;
const _statLit = []; let _statT = 0;
const byFD = (a, b) => a.fd - b.fd;
function updateLights3(cam) {
  const T = THEME;
  const fl = 1 + WX.flash * 7; hemi.color.setRGB(T.ambHi[0] * fl, T.ambHi[1] * fl, T.ambHi[2] * fl * 1.1); hemi.groundColor.setRGB(T.ambLo[0], T.ambLo[1], T.ambLo[2]);
  // the sun's shadow box follows the player (snapped so the shadow texels don't swim)
  const sd = norm3(T.sunDir), ox = Math.round(cam[0] / 4) * 4, oz = Math.round(cam[2] / 4) * 4;
  sun.color.setRGB(T.sun[0], T.sun[1], T.sun[2]); sun.position.set(ox + sd[0] * 120, sd[1] * 120, oz + sd[2] * 120); sun.target.position.set(ox, 0, oz);
  sun.shadow.autoUpdate = false;
  // lamps: nearest ones get the spot pool (the first few cast shadows); the same tile query also yields the static lights below
  R3.tick = (R3.tick + 1) | 0;
  _lampsNear.length = 0; _stat.length = 0;
  for (const l of nearbyWorld('lights', cam[0], cam[2], 72)) {
    const d = d2c(l.p, cam);
    if (l.kind === 'lamp') { if (d < 70 * 70) _lampsNear.push(l); }
    else if (d < 55 * 55) { l.fd = l.fw > 0 ? d * STAT_STICK : d; l.ftick = R3.tick; _stat.push(l); }
  }
  _lampsNear.sort((a, b) => d2c(a.p, cam) - d2c(b.p, cam));
  const sunCadence = SETTINGS.quality >= 3 ? 1 : PERF.pressure > 0.55 ? 3 : 2;
  if (SHADOW_CACHE.sunX !== ox || SHADOW_CACHE.sunZ !== oz || R3.tick - SHADOW_CACHE.frame >= sunCadence) {
    sun.shadow.needsUpdate = true; SHADOW_CACHE.sunX = ox; SHADOW_CACHE.sunZ = oz; SHADOW_CACHE.frame = R3.tick;
  }
  for (let i = 0; i < SPOTS.length; i++) {
    const sp = SPOTS[i], s = sp.s, l = _lampsNear[i];
    if (sp.lamp !== l) { sp.lamp = l; s.shadow.needsUpdate = true; }
    // Ultra keeps shadows fresh (3 of every 4 lamps refresh each frame) without forcing every shadow map to redraw
    // in the same frame every frame — that all-at-once cost was compounding with heavy single-frame spikes (e.g. a
    // multi-kill AOE hit) into visible stalls. High refreshes each lamp every third frame (every fourth under load).
    else { const cadence = SETTINGS.quality >= 3 ? 2 : PERF.pressure > 0.55 ? 4 : 3; if ((i + R3.tick) % cadence === 0) s.shadow.needsUpdate = true; }
    if (!l) { s.intensity = 0; continue; }
    s.position.set(l.p[0], l.p[1], l.p[2]); s.target.position.set(l.p[0] + 0.01, 0, l.p[2] + 0.01);
    s.color.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); s.intensity = PL_K * l.r * 1.35; s.distance = l.r + 6;
  }
  // static point lights: the nearest shops, fountain and doorways; then dynamic flashes, arrows, fires...
  const now = performance.now(), fdt = Math.min(0.1, Math.max(0, (now - _statT) / 1000)); _statT = now;
  // _stat holds this frame's in-range static lights (gathered with the lamps above, tagged with this tick)
  for (const l of _statLit) if (l.ftick !== R3.tick) { l.fd = Infinity; l.ftick = R3.tick; _stat.push(l); }   // out of range: fade out
  _stat.sort(byFD);
  _statLit.length = 0;
  for (let i = 0; i < _stat.length; i++) {
    const l = _stat[i], on = i < STAT_PL && l.fd !== Infinity;
    l.fw = Math.min(1, Math.max(0, (l.fw || 0) + (on ? fdt : -fdt) * STAT_FADE));
    if (l.fw > 0) _statLit.push(l);
  }
  _dyn.length = 0; _dynN = 0;
  for (const d of DLIGHTS) { const k = d.life / d.max; dynL(d.p, d.r, d.c[0] * k, d.c[1] * k, d.c[2] * k); }
  for (const a of PROJ) if (!a.stuck && a.type !== 0) { const g = ARROWS[a.type].glow; dynP(a.x, a.y, a.z, 7, g[0] * 0.5, g[1] * 0.5, g[2] * 0.5); }
  for (const f of FIRES) dynP(f.x, 0.6, f.z, 6, 2.2, 0.9, 0.2);
  for (const f of nearbyWorld('fires', cam[0], cam[2], 42)) if ((f.x - cam[0]) * (f.x - cam[0]) + (f.z - cam[2]) * (f.z - cam[2]) < 40 * 40) { const tt = NQU.uTime.value, fl = 0.72 + 0.18 * Math.sin(tt * 17 + f.x) * Math.sin(tt * 7.3 + f.z) + 0.1 * Math.sin(tt * 31 + f.z * 3); dynP(f.x, f.y + 0.6, f.z, 9, 2.2 * fl, 0.95 * fl, 0.25 * fl); }
  for (const z of ZOMBIES) if (z.burn > 0) dynP(z.x, 1.2 * z.scale, z.z, 6, 2, 0.8, 0.15);
  if (GAME.boss && !GAME.boss.dead) dynL(GAME.boss.core, 9, 2.4, 0.4, 2.2);
  for (const p of PICKUPS) { if (p.kind === 'health') dynP(p.x, 1, p.z, 4, 0.3, 1.4, 0.6); else { const g = ARROWS[p.at].glow; dynP(p.x, 1, p.z, 4, g[0] * 0.4, g[1] * 0.4, g[2] * 0.4); } }
  for (let i = 0; i < _dynN; i++) { const e = _dynPool[i]; e.d = d2c(e.p, cam); _dyn.push(e); }
  _dyn.sort(byD);
  let n = 0;
  const lightCap = MAX_PL;
  if (GAME.state !== 'title') { const g = ARROWS[BOW.type].glow; const hl = PL[n++]; setPL(hl, [BOW.handWorld[0] || cam[0], (BOW.handWorld[1] || cam[1]) + 0.25, BOW.handWorld[2] || cam[2]], [g[0] * 0.15 + 0.12, g[1] * 0.15 + 0.1, g[2] * 0.15 + 0.18], 2.2); hl.intensity *= 0.3; }
  // lit static lights first (chosen ones, then any still fading out); a fade-out that doesn't fit is dropped
  const statCap = lightCap - DYN_MIN;
  for (const l of _statLit) {
    if (n >= statCap) { l.fw = 0; continue; }
    const c = l.kind === 'fountain' ? T.fountain : l.shop ? [l.c[0] * T.shop, l.c[1] * T.shop, l.c[2] * T.shop] : l.c;
    const pl = PL[n++]; setPL(pl, l.p, c, l.r); pl.intensity *= l.fw;
  }
  for (const d of _dyn) { if (n >= lightCap) break; setPL(PL[n++], d.p, d.c, d.r); }
  for (; n < MAX_PL; n++) PL[n].intensity = 0;
  for (let i = 0; i < MAX_PL; i++) { const l = PL[i], k = l.intensity; AIR.pos[i].set(l.position.x, l.position.y, l.position.z, l.distance); AIR.col[i].set(l.color.r * k, l.color.g * k, l.color.b * k, 0); }   // the glowing air (gpu.js nqFog)
}

/* ---------------- world meshes ---------------- */
const WORLD_CHUNK_SIZE = 56;
const WORLD_MESHES = [];
const WORLD_STREAM = { x: Infinity, z: Infinity, active: 0 };

// Split a city.js mesh into spatial buckets by triangle centroid. Each bucket gets its own compact vertex
// buffers and a tight bounding sphere + box, so the main camera, mirror camera and every shadow camera can
// reject whole parts of the city before issuing a draw. Lossless clean-up on the way (the picture is identical):
//  - vertices whose attributes are bit-identical are welded (the vertex shader would compute the same thing twice)
//  - triangles with two coincident corners are dropped (zero area: they never produce a fragment in any pass)
//  - a bucket with fewer than 65535 vertices gets 16-bit indices
// The bounding sphere is taken over the original triangle set, exactly as before, because streaming and the
// opaque draw order are keyed on it.
function weldVerts(geo) {
  const A = Object.values(geo.attributes), n = geo.attributes.position.count;
  let K = 0; for (const a of A) K += a.itemSize;
  const R = new Uint32Array(n * K);   // every vertex's attribute bits in one row
  for (let o = 0, a = 0; a < A.length; a++) {
    const s = A[a].itemSize, src = A[a].array, u = new Uint32Array(src.buffer, src.byteOffset, src.length);
    for (let v = 0; v < n; v++) for (let j = 0; j < s; j++) R[v * K + o + j] = u[v * s + j];
    o += s;
  }
  let cap = 1; while (cap < n * 2) cap <<= 1;
  const table = new Int32Array(cap).fill(-1), canon = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const r = v * K; let h = 0x811c9dc5;
    for (let j = 0; j < K; j++) h = Math.imul(h ^ R[r + j], 0x01000193);
    let k = (h >>> 0) & (cap - 1);
    for (;;) {
      const w = table[k];
      if (w < 0) { table[k] = v; canon[v] = v; break; }
      let j = 0; const q = w * K; while (j < K && R[r + j] === R[q + j]) j++;
      if (j === K) { canon[v] = w; break; }
      k = (k + 1) & (cap - 1);
    }
  }
  return canon;
}
function spatialChunks(geo, size = WORLD_CHUNK_SIZE) {
  if (!geo || !geo.index || !geo.attributes.position) return geo ? [geo] : [];
  for (const k in geo.attributes) { const a = geo.attributes[k].array; if (a.BYTES_PER_ELEMENT !== 4) throw new Error('spatialChunks: 32-bit attributes only'); }
  const pos = geo.attributes.position, src = geo.index.array, buckets = new Map();
  for (let i = 0; i < src.length; i += 3) {
    const a = src[i], b = src[i + 1], c = src[i + 2];
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const key = Math.floor(cx / size) + ',' + Math.floor(cz / size);
    let out = buckets.get(key); if (!out) { out = []; buckets.set(key, out); }
    out.push(a, b, c);
  }
  const canon = weldVerts(geo), P = new Uint32Array(pos.array.buffer, pos.array.byteOffset, pos.array.length);
  const same = (a, b) => P[a * 3] === P[b * 3] && P[a * 3 + 1] === P[b * 3 + 1] && P[a * 3 + 2] === P[b * 3 + 2];
  const local = new Int32Array(pos.count).fill(-1), attrs = Object.entries(geo.attributes);
  const chunks = [];
  for (const [key, I] of buckets) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < I.length; i++) {
      const k = I[i], x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const center = new THREE.Vector3((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
    let r2 = 0;
    for (let i = 0; i < I.length; i++) {
      const k = I[i], dx = pos.getX(k) - center.x, dy = pos.getY(k) - center.y, dz = pos.getZ(k) - center.z;
      r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
    }
    // welded, non-degenerate triangles in their original order, re-indexed into a compact local vertex list
    const triAll = new Uint32Array(I.length), vertsAll = new Int32Array(I.length); let nt = 0, nv = 0;
    for (let i = 0; i < I.length; i += 3) {
      const a = canon[I[i]], b = canon[I[i + 1]], c = canon[I[i + 2]];
      if (same(a, b) || same(b, c) || same(a, c)) continue;
      if (local[a] < 0) vertsAll[local[a] = nv++] = a; triAll[nt++] = local[a];
      if (local[b] < 0) vertsAll[local[b] = nv++] = b; triAll[nt++] = local[b];
      if (local[c] < 0) vertsAll[local[c] = nv++] = c; triAll[nt++] = local[c];
    }
    const verts = vertsAll.subarray(0, nv), tri = triAll.subarray(0, nt);
    for (const v of verts) local[v] = -1;
    if (!nt) continue;
    const g = new THREE.BufferGeometry();
    for (const [name, attr] of attrs) {
      const s = attr.itemSize, from = attr.array, to = new from.constructor(verts.length * s);
      for (let j = 0; j < verts.length; j++) for (let q = 0, o = verts[j] * s; q < s; q++) to[j * s + q] = from[o + q];
      g.setAttribute(name, new THREE.BufferAttribute(to, s, attr.normalized));
    }
    g.setIndex(new THREE.BufferAttribute(nv < 65535 ? new Uint16Array(tri) : tri.slice(), 1));
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    g.boundingSphere = new THREE.Sphere(center, Math.sqrt(r2));
    g.userData.cullBox = g.boundingBox;
    const [gx, gz] = key.split(',').map(Number); g.userData.chunkX = gx; g.userData.chunkZ = gz;
    chunks.push(g);
  }
  return chunks;
}
// The same lossless clean-up for a geometry that stays whole (the car models): bit-identical vertices welded, zero-area
// triangles dropped, 16-bit indices when they fit. carParts gives every triangle its own corners so material ids never blend
// across an edge; where two corners are identical in every attribute they interpolate identically, so one vertex serves both.
function weldGeometry(geo) {
  const canon = weldVerts(geo), pos = geo.attributes.position, n = pos.count, src = geo.index ? geo.index.array : null, nt = src ? src.length / 3 : n / 3;
  const P = new Uint32Array(pos.array.buffer, pos.array.byteOffset, pos.array.length);
  const same = (a, b) => P[a * 3] === P[b * 3] && P[a * 3 + 1] === P[b * 3 + 1] && P[a * 3 + 2] === P[b * 3 + 2];
  const local = new Int32Array(n).fill(-1), verts = new Int32Array(n), tri = new Uint32Array(nt * 3); let nv = 0, k = 0;
  for (let t = 0; t < nt; t++) {
    const a = canon[src ? src[t * 3] : t * 3], b = canon[src ? src[t * 3 + 1] : t * 3 + 1], c = canon[src ? src[t * 3 + 2] : t * 3 + 2];
    if (same(a, b) || same(b, c) || same(a, c)) continue;
    if (local[a] < 0) verts[local[a] = nv++] = a; tri[k++] = local[a];
    if (local[b] < 0) verts[local[b] = nv++] = b; tri[k++] = local[b];
    if (local[c] < 0) verts[local[c] = nv++] = c; tri[k++] = local[c];
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const s = attr.itemSize, from = attr.array, to = new from.constructor(nv * s);
    for (let j = 0; j < nv; j++) for (let q = 0, o = verts[j] * s; q < s; q++) to[j * s + q] = from[o + q];
    out.setAttribute(name, new THREE.BufferAttribute(to, s, attr.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(nv < 65535 ? new Uint16Array(tri.subarray(0, k)) : tri.slice(0, k), 1));
  return out;
}
// Frustum test for anything that carries a bounding box (world chunks): the sphere test first, as three.js does,
// then the box. A tall city block's sphere is mostly empty air; its box is not. Only ever rejects a chunk none of
// whose triangles is inside the frustum, so nothing that was drawn can go missing.
const _cullBoxW = new THREE.Box3();
{
  const F = THREE.Frustum.prototype, sphereTest = F.intersectsObject;
  F.intersectsObject = function (object) {
    if (!sphereTest.call(this, object)) return false;
    const b = object.geometry && object.geometry.userData.cullBox;
    return !b || this.intersectsBox(_cullBoxW.copy(b).applyMatrix4(object.matrixWorld));
  };
}

function addWorldChunks(geo, castShadow, receiveShadow, name) {
  const streamRadius = name === 'far' ? 900 : name === 'near' ? 420 : 300;
  const chunks = spatialChunks(geo, WORLD_CHUNK_SIZE);
  // the chunks own compact copies of everything now: keep only the source's index (triangle counts for tests)
  for (const k of Object.keys(geo.attributes)) geo.deleteAttribute(k);
  for (let i = 0; i < chunks.length; i++) {
    const mesh = new THREE.Mesh(chunks[i], MAT.static);
    mesh.name = name + '-' + i; mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
    mesh.userData.streamRadius = streamRadius;
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = true; scene.add(mesh); WORLD_MESHES.push(mesh);
  }
}

/* ---------------- sakura flower cards ----------------
   The canopies are thousands of small alpha-tested cards, each painted with a little bunch of five-petal flowers
   (a canvas atlas of four variants drawn at load), lit by the world shader with the blossom's own soft glow and
   swaying with the foliage wind. Shadows come out flower-shaped too (three.js alpha-tests the shadow pass). */
function blossomAtlas() {
  const S = 512, H = S / 2, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * H, oy = (v >> 1) * H, n = 7 + (v % 2) * 3;
    c.save(); c.beginPath(); c.rect(ox + 2, oy + 2, H - 4, H - 4); c.clip();
    // a few twig strokes behind the flowers
    c.strokeStyle = 'rgb(46,26,24)'; c.lineCap = 'round';
    for (let t = 0; t < 2; t++) { c.lineWidth = 3 + rnd() * 3; c.beginPath(); c.moveTo(ox + H * (0.15 + rnd() * 0.2), oy + H * (0.8 + rnd() * 0.15)); c.quadraticCurveTo(ox + H * (0.3 + rnd() * 0.4), oy + H * (0.45 + rnd() * 0.2), ox + H * (0.6 + rnd() * 0.3), oy + H * (0.12 + rnd() * 0.2)); c.stroke(); }
    for (let f = 0; f < n; f++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * H * 0.3, fx = ox + H / 2 + Math.cos(a) * d, fy = oy + H / 2 + Math.sin(a) * d;
      const R0 = H * (0.1 + rnd() * 0.06), rot = rnd() * Math.PI, pale = rnd();
      const outer = pale < 0.25 ? [255, 238, 244] : pale > 0.85 ? [236, 120, 168] : [255, 183, 208], inner = [214, 92, 140];
      if (rnd() < 0.18) {   // a closed bud
        c.fillStyle = `rgb(${inner})`; c.beginPath(); c.ellipse(fx, fy, R0 * 0.32, R0 * 0.48, rot, 0, Math.PI * 2); c.fill(); continue;
      }
      for (let p = 0; p < 5; p++) {
        const pa = rot + p / 5 * Math.PI * 2, px = fx + Math.cos(pa) * R0 * 0.52, py = fy + Math.sin(pa) * R0 * 0.52;
        const g = c.createRadialGradient(fx, fy, R0 * 0.05, fx, fy, R0 * 1.05);
        g.addColorStop(0, `rgb(${inner})`); g.addColorStop(0.45, `rgb(${outer.map((x, i) => (x + inner[i]) / 2 | 0)})`); g.addColorStop(1, `rgb(${outer})`);
        c.fillStyle = g; c.save(); c.translate(px, py); c.rotate(pa);
        c.beginPath(); c.moveTo(-R0 * 0.5, 0);   // petal with the cherry's notched tip
        c.bezierCurveTo(-R0 * 0.45, -R0 * 0.55, R0 * 0.35, -R0 * 0.55, R0 * 0.55, -R0 * 0.12);
        c.lineTo(R0 * 0.42, 0); c.lineTo(R0 * 0.55, R0 * 0.12);
        c.bezierCurveTo(R0 * 0.35, R0 * 0.55, -R0 * 0.45, R0 * 0.55, -R0 * 0.5, 0); c.fill(); c.restore();
      }
      c.fillStyle = 'rgb(150,40,80)'; c.beginPath(); c.arc(fx, fy, R0 * 0.16, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgb(255,226,150)';
      for (let k = 0; k < 7; k++) { const sa = k / 7 * Math.PI * 2 + rot; c.beginPath(); c.arc(fx + Math.cos(sa) * R0 * 0.27, fy + Math.sin(sa) * R0 * 0.27, R0 * 0.045, 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; return tex;
}
function buildBlossoms() {
  const B = WORLD.blossoms, N = B.length / 12; if (!N) return;
  const mat = nqMaterial('static'); mat.map = blossomAtlas(); gpuCutout(mat, 0.42); mat.alphaToCoverage = true; mat.side = THREE.DoubleSide;
  mat.defines.NQ_CARDS = 1; mat.needsUpdate = true;
  const cells = new Map(), CELL = 64;
  for (let i = 0; i < N; i++) { const k = Math.floor(B[i * 12] / CELL) + ',' + Math.floor(B[i * 12 + 2] / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); }
  const t = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), up = new THREE.Vector3();
  for (const list of cells.values()) {
    const m = list.length, P = new Float32Array(m * 12), Nn = new Float32Array(m * 12), UV = new Float32Array(m * 8), C = new Float32Array(m * 12), Q = new Float32Array(m * 8), I = new Uint32Array(m * 6);
    list.forEach((ci, j) => {
      const o = ci * 12; n.set(B[o + 3], B[o + 4], B[o + 5]);
      up.set(0, 1, 0); if (Math.abs(n.y) > 0.9) up.set(1, 0, 0);
      t.crossVectors(up, n).normalize(); b.crossVectors(n, t);
      const ang = (B[o] * 12.9898 + B[o + 2] * 78.233) % 6.283, ca = Math.cos(ang), sa = Math.sin(ang), h = B[o + 6] / 2;
      const v = B[o + 11], u0 = (v % 2) * 0.5, v0 = (v >> 1) * 0.5;
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      corners.forEach(([cx, cy, uu, vv], k) => {
        const rx = (cx * ca - cy * sa) * h, ry = (cx * sa + cy * ca) * h, q = (j * 4 + k);
        P[q * 3] = B[o] + t.x * rx + b.x * ry; P[q * 3 + 1] = B[o + 1] + t.y * rx + b.y * ry; P[q * 3 + 2] = B[o + 2] + t.z * rx + b.z * ry;
        Nn[q * 3] = n.x; Nn[q * 3 + 1] = n.y; Nn[q * 3 + 2] = n.z;
        UV[q * 2] = u0 + 0.01 + uu * 0.48; UV[q * 2 + 1] = v0 + 0.01 + vv * 0.48;
        C[q * 3] = Math.min(1, B[o + 7] * 1.05); C[q * 3 + 1] = Math.min(1, B[o + 8] * 1.05); C[q * 3 + 2] = Math.min(1, B[o + 9] * 1.05);
        Q[q * 2] = B[o + 10] * 0.55; Q[q * 2 + 1] = 0;
      });
      I.set([j * 4, j * 4 + 1, j * 4 + 2, j * 4, j * 4 + 2, j * 4 + 3], j * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3)); geo.setAttribute('nqm', new THREE.BufferAttribute(Q, 2));
    geo.setIndex(new THREE.BufferAttribute(I, 1)); geo.computeBoundingBox(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'blossoms'; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = true; mesh.userData.streamRadius = 300;
    scene.add(mesh); WORLD_MESHES.push(mesh);
  }
}

/* ---------------- Meshy wrecked cars ----------------
   Two downloaded models (sedan, van), geometry only, one instanced draw each, split into parts by carParts(). Every
   car gets its own paint colour through instanceColor (paint only); glass, tyres, chrome and lamps keep their own. */
/* Meshy cars arrive as one grey shell (simplified offline by tools/qem.cpp, which keeps panels flat). carParts() gives it
   crease-aware normals and splits it per triangle into parts by where they sit on the car: tyres, hubs,
   glass, bumpers, lamps, dark trim and paint. Every triangle gets its own vertices so material ids never blend across
   an edge (blended ids were the jagged bright seam along the sills). Paint is material 25, the aged-wreck paint; its
   nqm.x carries a baked wear mask (wheel arches, sills) that the shader turns into rust. Units: metres, model frame. */
const CAR_LAYOUT = {
  sedan: { wx: [-1.54, 1.21], wy: 0.38, wr: 0.37, glass: [-1.02, 1.68, 1.03, 1.43], top: 1.47,
    bumpF: [-2.12, 0.2, 0.56], bumpR: [2.08, 0.2, 0.53], chrome: true,
    head: [-2.1, 0.56, 0.86, 0.42], tail: [2.12, 0.55, 0.85, 0.42] },
  van: { wx: [-1.69, 1.62], wy: 0.4, wr: 0.4, glass: [-2.62, -0.78, 1.28, 2.25], top: 9,
    bumpF: [-2.42, 0.2, 0.72], bumpR: [2.48, 0.2, 0.6], chrome: false,
    head: [-2.38, 0.74, 1.05, 0.45], tail: [2.55, 0.65, 1.5, 0.82] },
};
function carParts(src, kind) {
  const L = CAR_LAYOUT[kind], idx = src.index.array, P = src.attributes.position.array, nv = P.length / 3, nt = idx.length / 3;
  // per-vertex face lists (CSR), then crease-aware normals below: a corner averages only the faces around its vertex
  // that bend less than ~38 degrees from its own face, so panels shade smooth and their edges stay crisp
  const deg = new Uint32Array(nv + 1);
  for (let t = 0; t < nt * 3; t++) deg[idx[t] + 1]++;
  for (let i = 0; i < nv; i++) deg[i + 1] += deg[i];
  const vfl = new Uint32Array(nt * 3), fill = deg.slice(0, nv);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) vfl[fill[idx[t * 3 + k]]++] = t;
  const FN = new Float32Array(nt * 3);   // area-weighted face normals
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    FN[t * 3] = uy * vz - uz * vy; FN[t * 3 + 1] = uz * vx - ux * vz; FN[t * 3 + 2] = ux * vy - uy * vx;
  }
  const CREASE = Math.cos(38 * Math.PI / 180);
  const cornerN = (t, v, out) => {
    const fl = Math.hypot(FN[t * 3], FN[t * 3 + 1], FN[t * 3 + 2]) || 1, fx = FN[t * 3] / fl, fy = FN[t * 3 + 1] / fl, fz = FN[t * 3 + 2] / fl;
    let x = 0, y = 0, z = 0;
    for (let j = deg[v]; j < deg[v + 1]; j++) { const u = vfl[j] * 3, l = Math.hypot(FN[u], FN[u + 1], FN[u + 2]) || 1;
      if ((FN[u] * fx + FN[u + 1] * fy + FN[u + 2] * fz) / l >= CREASE) { x += FN[u]; y += FN[u + 1]; z += FN[u + 2]; } }
    const l = Math.hypot(x, y, z) || 1; out[0] = x / l; out[1] = y / l; out[2] = z / l;
  };
  let hw = 0; for (let i = 0; i < nv; i++) hw = Math.max(hw, Math.abs(P[i * 3 + 2]));
  const wheelD = (x, y) => Math.min(Math.hypot(x - L.wx[0], y - L.wy), Math.hypot(x - L.wx[1], y - L.wy));
  // part table: [r, g, b, material id]
  const PAINT = [1, 1, 1, 25], TYRE = [0.035, 0.035, 0.037, 15], HUB = [0.3, 0.3, 0.29, 4], GLASS = [0.24, 0.29, 0.32, 10],
    CHROME = [0.48, 0.47, 0.45, 4], TRIM = [0.055, 0.055, 0.06, 15], HEAD = [0.75, 0.72, 0.62, 10], TAIL = [0.6, 0.05, 0.035, 10], RACK = [0.12, 0.12, 0.13, 4];
  const part = (cx, cy, cz, fx, fy, fz) => {
    const az = Math.abs(cz), d = wheelD(cx, cy);
    if (d < L.wr * 1.03 && cy < L.wy + L.wr) return (d < L.wr * 0.56 && az > hw - 0.3 && Math.abs(fz) > 0.45) ? HUB : TYRE;
    if (cy > L.top) return RACK;
    const G = L.glass; if (cx > G[0] && cx < G[1] && cy > G[2] && cy < G[3] && fy < 0.9) return GLASS;
    const H = L.head; if (cx < H[0] && cy > H[1] && cy < H[2] && az > H[3] && fx < -0.3) return HEAD;
    const T = L.tail; if (cx > T[0] && cy > T[1] && cy < T[2] && az > T[3] && fx > 0.3) return TAIL;
    const bF = L.bumpF, bR = L.bumpR;
    if ((cx < bF[0] && cy > bF[1] && cy < bF[2]) || (cx > bR[0] && cy > bR[1] && cy < bR[2])) return L.chrome ? CHROME : TRIM;
    if (cy < 0.3 || (fy < -0.6 && cy < 0.9)) return TRIM;   // rockers and the undertray facing the road
    return PAINT;
  };
  const cn = [0, 0, 0], n3 = nt * 3, oP = new Float32Array(n3 * 3), oN = new Float32Array(n3 * 3), oC = new Float32Array(n3 * 3), oQ = new Float32Array(n3 * 2);
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const q = part((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, fx, fy, fz);
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k] * 3, o = t * 3 + k;
      oP[o * 3] = P[v]; oP[o * 3 + 1] = P[v + 1]; oP[o * 3 + 2] = P[v + 2]; cornerN(t, idx[t * 3 + k], cn); oN[o * 3] = cn[0]; oN[o * 3 + 1] = cn[1]; oN[o * 3 + 2] = cn[2];
      oC[o * 3] = q[0]; oC[o * 3 + 1] = q[1]; oC[o * 3 + 2] = q[2]; oQ[o * 2 + 1] = q[3];
      if (q === PAINT) {   // wear: rust gathers around the wheel arches and along the sills
        const arch = Math.max(0, Math.min(1, (L.wr + 0.32 - wheelD(P[v], P[v + 1])) / 0.28)), sill = Math.max(0, Math.min(1, (0.62 - P[v + 1]) / 0.3));
        oQ[o * 2] = Math.max(arch, sill * 0.8);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(oP, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(oN, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(oC, 3)); geo.setAttribute('nqm', new THREE.BufferAttribute(oQ, 2));
  return geo;
}
async function loadMeshyCars() {
  const spots = WORLD.carSpots || []; if (!spots.length) return;
  const loader = new GLTFLoader(), V = typeof CARS_VER === 'string' ? CARS_VER : '0', geos = {};
  for (const kind of ['sedan', 'van']) {
    if (!spots.some(s => s.kind === kind)) continue;
    try {
      const gltf = await loader.loadAsync('models/car_' + kind + '.glb?v=' + V);
      let src = null; gltf.scene.traverse(o => { if (!src && o.isMesh) src = o.geometry; });
      const geo = weldGeometry(carParts(src, kind)); geo.rotateY(-Math.PI / 2); geo.computeBoundingSphere();   // modelled along +x (front at -x); the game's cars run along z
      geos[kind] = geo;
    } catch (err) { console.warn('car load failed', kind, err); }
  }
  const list = spots.filter(s => geos[s.kind]); if (!list.length) return;
  // The 23 wrecks were one instanced draw per model whose bounding sphere spanned the whole city, so every pass (the world,
  // the mirror, each shadow map) drew all of them, about a million triangles, wherever the camera looked. In one BatchedMesh
  // three culls them car by car for every camera, and the lot is one program with a per-car paint colour.
  let nv = 0, ni = 0; for (const g of Object.values(geos)) { nv += g.attributes.position.count; ni += g.index.count; }
  const batch = new THREE.BatchedMesh(list.length, nv, ni, nqMaterial('static')), gid = {};
  for (const [kind, g] of Object.entries(geos)) gid[kind] = batch.addGeometry(g);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (const s of list) {
    const id = batch.addInstance(gid[s.kind]);
    q.setFromEuler(e.set(s.roll || 0, s.ry, (s.roll || 0) * 0.6, 'YXZ'));
    m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1)); batch.setMatrixAt(id, m);
    batch.setColorAt(id, c.setRGB(s.paint[0], s.paint[1], s.paint[2]));
  }
  batch.computeBoundingSphere();
  batch.name = 'meshy-cars'; batch.castShadow = true; batch.receiveShadow = true; batch.userData.streamRadius = 1e5;
  scene.add(batch); WORLD_MESHES.push(batch);
  updateWorldStreaming([PLAYER.x, PLAYER.y, PLAYER.z], true); REFL_CACHE.valid = false;
}

/* ---------------- Meshy trees ----------------
   The plain (non-blossom) trees: the suburbs' yards, the dark woods along its edges and round the refinery fence
   (WORLD.treeSpots, placed by props.js propTreeSpot: x, z, height, yaw, tint). One textured Meshy model
   (models/tree.glb from tools/meshy_tree.py: colour and normal maps, COLOR_0.r marking the leaves) in one BatchedMesh,
   culled tree by tree, each a shade lighter or darker. */
async function loadMeshyTrees() {
  const spots = WORLD.treeSpots || []; if (!spots.length) return;
  try {
    const gltf = await new GLTFLoader().loadAsync('models/tree.glb?v=' + (typeof TREE_VER === 'string' ? TREE_VER : '0'));
    let srcMesh = null; gltf.scene.traverse(o => { if (!srcMesh && o.isMesh) srcMesh = o; });
    if (!srcMesh || !srcMesh.geometry.attributes.position) throw new Error('missing geometry');
    gltf.scene.updateMatrixWorld(true);
    const geo = srcMesh.geometry.clone(); geo.applyMatrix4(srcMesh.matrixWorld);
    if (!geo.index) { const n0 = geo.attributes.position.count, ix = new Uint32Array(n0); for (let i = 0; i < n0; i++) ix[i] = i; geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position, n = pos.count, ca = geo.attributes.color;
    // the converter paints the leaf mask into the vertex colour's red: it becomes nqm.x (wind, leaf shading) and the colour goes back to white, so the texture shows as scanned
    const nqm = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
    for (let i = 0; i < n; i++) { nqm[i * 2] = ca ? ca.getX(i) : 1; nqm[i * 2 + 1] = 26; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('nqm', new THREE.BufferAttribute(nqm, 2));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color', 'nqm'].includes(k)) geo.deleteAttribute(k);
    // stand the model on its trunk base at the origin, 1 unit tall: the per-tree height is the scale
    geo.computeBoundingBox(); const bb = geo.boundingBox, H = Math.max(1e-3, bb.max.y - bb.min.y); let cx = 0, cz = 0, cn = 0;
    for (let i = 0; i < n; i++) if (pos.getY(i) < bb.min.y + H * 0.05) { cx += pos.getX(i); cz += pos.getZ(i); cn++; }
    cx = cn ? cx / cn : (bb.min.x + bb.max.x) / 2; cz = cn ? cz / cn : (bb.min.z + bb.max.z) / 2;
    geo.translate(-cx, -bb.min.y, -cz); geo.scale(1 / H, 1 / H, 1 / H); geo.computeBoundingBox(); geo.computeBoundingSphere();
    const sm = srcMesh.material || {}, tex = sm.map || null, mat = nqMaterial('static');
    if (tex) { mat.map = tex; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }
    if (sm.normalMap) { mat.normalMap = sm.normalMap; mat.normalScale.set(1, 1); }
    mat.defines.NQ_TREE = 1; mat.needsUpdate = true;
    const batch = new THREE.BatchedMesh(spots.length, n, geo.index.count, mat), gid = batch.addGeometry(geo);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    for (const s of spots) {
      const id = batch.addInstance(gid);
      m.compose(new THREE.Vector3(s.x, -0.04, s.z), q.setFromAxisAngle(Y, s.ry), new THREE.Vector3(s.h, s.h, s.h)); batch.setMatrixAt(id, m);
      batch.setColorAt(id, c.setRGB(s.tint, s.tint, s.tint));
    }
    batch.computeBoundingSphere();
    batch.name = 'meshy-trees'; batch.castShadow = true; batch.receiveShadow = true; batch.userData.streamRadius = 1e5;
    scene.add(batch); WORLD_MESHES.push(batch);
    updateWorldStreaming([PLAYER.x, PLAYER.y, PLAYER.z], true); REFL_CACHE.valid = false;
  } catch (e) { console.warn('tree load failed', e); }
}

/* ---------------- Meshy props: bushes, hedges, stone lanterns ----------------
   WORLD.propSpots (props.js propSpot: kind, x, z, yaw, height h, hedge length len, tint), one textured Meshy model per kind
   (models/prop_<kind>.glb from tools/meshy_prop.py: colour and normal maps, COLOR_0.r the mask) and one BatchedMesh per
   model, culled spot by spot. Bushes shade like the trees' leaves (mat 26, NQ_TREE: the mask marks the foliage over the
   stems), each a shade lighter or darker; lanterns are mat 27, the mask lighting their paper fire boxes. */
const PROP_MAT = { kasuga: 27, yukimi: 27 };
async function loadMeshyProps() {
  const spots = WORLD.propSpots || [], have = typeof PROP_MODELS !== 'undefined' ? PROP_MODELS : [];
  const kinds = [...new Set(spots.map(s => s.kind))].filter(k => have.includes(k)); if (!kinds.length) return;
  const loader = new GLTFLoader(), V = typeof PROPS_VER === 'string' ? PROPS_VER : '0';
  await Promise.all(kinds.map(async (kind) => {
    try {
      const gltf = await loader.loadAsync('models/prop_' + kind + '.glb?v=' + V);
      let srcMesh = null; gltf.scene.traverse(o => { if (!srcMesh && o.isMesh) srcMesh = o; });
      if (!srcMesh || !srcMesh.geometry.attributes.position) throw new Error('missing geometry');
      gltf.scene.updateMatrixWorld(true);
      const geo = srcMesh.geometry.clone(); geo.applyMatrix4(srcMesh.matrixWorld);
      if (!geo.index) { const n0 = geo.attributes.position.count, ix = new Uint32Array(n0); for (let i = 0; i < n0; i++) ix[i] = i; geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const pos = geo.attributes.position, n = pos.count, ca = geo.attributes.color, mid = PROP_MAT[kind] || 26;
      const nqm = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
      for (let i = 0; i < n; i++) { nqm[i * 2] = ca ? ca.getX(i) : (mid === 26 ? 1 : 0); nqm[i * 2 + 1] = mid; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('nqm', new THREE.BufferAttribute(nqm, 2));
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color', 'nqm'].includes(k)) geo.deleteAttribute(k);
      geo.computeBoundingBox(); let bb = geo.boundingBox;
      if (mid === 26 && bb.max.z - bb.min.z > (bb.max.x - bb.min.x) * 1.15) { geo.rotateY(Math.PI / 2); geo.computeBoundingBox(); bb = geo.boundingBox; }   // a hedge's length runs along local x
      // stand it on its base at the origin, 1 unit tall: the spot's height is the scale
      const H = Math.max(1e-3, bb.max.y - bb.min.y); let cx = 0, cz = 0, cn = 0;
      for (let i = 0; i < n; i++) if (pos.getY(i) < bb.min.y + H * 0.05) { cx += pos.getX(i); cz += pos.getZ(i); cn++; }
      cx = cn ? cx / cn : (bb.min.x + bb.max.x) / 2; cz = cn ? cz / cn : (bb.min.z + bb.max.z) / 2;
      if (mid === 26) { cx = (bb.min.x + bb.max.x) / 2; cz = (bb.min.z + bb.max.z) / 2; }   // a bush's stems can sit off centre
      geo.translate(-cx, -bb.min.y, -cz); geo.scale(1 / H, 1 / H, 1 / H); geo.computeBoundingBox(); geo.computeBoundingSphere();
      const xLen = Math.max(1e-3, geo.boundingBox.max.x - geo.boundingBox.min.x);
      const sm = srcMesh.material || {}, tex = sm.map || null, mat = nqMaterial('static');
      if (tex) { mat.map = tex; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; }
      if (sm.normalMap) { mat.normalMap = sm.normalMap; mat.normalScale.set(1, 1); }
      if (mid === 26) mat.defines.NQ_TREE = 1;
      mat.needsUpdate = true;
      const list = spots.filter(s => s.kind === kind);
      const batch = new THREE.BatchedMesh(list.length, n, geo.index.count, mat), gid = batch.addGeometry(geo);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
      for (const s of list) {
        const id = batch.addInstance(gid);
        m.compose(new THREE.Vector3(s.x, -0.02, s.z), q.setFromAxisAngle(Y, s.ry), new THREE.Vector3(s.len ? s.len / xLen : s.h, s.h, s.h)); batch.setMatrixAt(id, m);
        batch.setColorAt(id, c.setRGB(s.tint, s.tint, s.tint));
      }
      batch.computeBoundingSphere();
      batch.name = 'meshy-' + kind; batch.castShadow = true; batch.receiveShadow = true; batch.userData.streamRadius = 1e5;
      scene.add(batch); WORLD_MESHES.push(batch);
    } catch (e) { console.warn('prop load failed', kind, e); }
  }));
  updateWorldStreaming([PLAYER.x, PLAYER.y, PLAYER.z], true); REFL_CACHE.valid = false;
}

function updateWorldStreaming(cam, force = false) {
  const x = cam[0], z = cam[2];
  if (!force && (x - WORLD_STREAM.x) ** 2 + (z - WORLD_STREAM.z) ** 2 < 12 * 12) return;
  WORLD_STREAM.x = x; WORLD_STREAM.z = z; let active = 0;
  for (const m of WORLD_MESHES) {
    const s = m.geometry.boundingSphere; if (!s) { m.visible = true; active++; continue; } const r = m.userData.streamRadius;
    const d2 = (s.center.x - x) ** 2 + (s.center.z - z) ** 2;
    m.visible = d2 <= (r + s.radius) ** 2;
    if (m.visible) active++;
  }
  WORLD_STREAM.active = active;
  const sr = 260;
  for (const q of SIGNS) { const e = q.s.m; q.vis = (e[12] - x) ** 2 + (e[14] - z) ** 2 < sr * sr; }
  REFL_CACHE.valid = false;   // newly resident geometry must appear in the next mirror refresh
}

function buildWorld3() {
  const t0 = performance.now();
  addWorldChunks(WORLD.meshProps, true, true, 'props');
  addWorldChunks(WORLD.mesh, false, true, 'near');
  addWorldChunks(WORLD.meshFar, false, true, 'far');
  addWorldChunks(WORLD.meshGarden, true, true, 'garden');
  addWorldChunks(WORLD.meshForest, false, true, 'forest');
  addWorldChunks(WORLD.meshSub, true, true, 'suburbs');
  buildBlossoms();
  if (window.DBG_OCC) console.log('world chunks ms', (performance.now() - t0).toFixed(0));
  buildSigns(); buildDecalPool(); buildLights(); buildVolumes(); buildOcclusion(); buildGlass();
  updateWorldStreaming([PLAYER.x, PLAYER.y, PLAYER.z], true);
}

/* ---------------- shopfront glass: see-through, fresnel-bright at grazing angles, rain-beaded and grimy low down ---------------- */
function buildGlass() {
  if (!WORLD.glass.length) return;
  const gg = new Geo(); for (const q of WORLD.glass) gg.box(q.m, q.c, 0, 0);
  const mat = glassMaterialGPU();
  const chunks = spatialChunks(gg.build());
  for (let i = 0; i < chunks.length; i++) {
    const m = new THREE.Mesh(chunks[i], mat); m.name = 'glass-' + i; m.matrixAutoUpdate = false; m.renderOrder = 3; m.frustumCulled = true; m.userData.streamRadius = 280;
    scene.add(m); WORLD_MESHES.push(m);
  }
}

/* ---------------- baked occlusion: sky visibility of every half-metre of street ----------------
   The city's collision boxes become a top-down height map. For each open cell we march 16 jittered directions
   and keep the steepest skyline, so alleys, wall bases, corners and the ground under props darken.
   Computed once at load (well under a second), then one texture lookup per pixel: it replaces the old per-frame AO pass. */
function buildOcclusion() {
  const t0 = performance.now(), C = 0.5, X0 = WORLD_BOUNDS.x0 - 14, Z0 = WORLD_BOUNDS.z0 - 14;
  const W = Math.ceil((WORLD_BOUNDS.x1 + 14 - X0) / C), H = Math.ceil((WORLD_BOUNDS.z1 + 14 - Z0) / C);
  const hgt = new Float32Array(W * H);
  for (const b of WORLD.boxes) {
    if (b.y1 < 0.35) continue;
    const i0 = Math.max(0, Math.ceil((b.x0 - X0) / C - 0.5)), i1 = Math.min(W - 1, Math.floor((b.x1 - X0) / C - 0.5));
    const j0 = Math.max(0, Math.ceil((b.z0 - Z0) / C - 0.5)), j1 = Math.min(H - 1, Math.floor((b.z1 - Z0) / C - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * W + i; if (b.y1 > hgt[k]) hgt[k] = b.y1; }
  }
  const D = [1, 2, 3, 4.5, 6.5, 9, 13, 18, 25, 34, 46, 62];   // march distances, in cells
  const ND = 16, occ = new Float32Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; if (hgt[k] > 0) continue;
    let blocked = 0; const jit = ((i * 73856093 ^ j * 19349663) >>> 0) % 1000 / 1000;   // per-cell rotation: no wedge banding
    for (let a = 0; a < ND; a++) {
      const ang = (a + jit) * Math.PI * 2 / ND, dx = Math.cos(ang), dz = Math.sin(ang);
      let s = 0;
      for (const d of D) {
        const x = Math.round(i + dx * d), z = Math.round(j + dz * d);
        if (x < 0 || z < 0 || x >= W || z >= H) break;
        const hh = hgt[z * W + x]; if (hh > 0) { const sl = (hh - 0.2) / (d * C); if (sl > s) s = sl; }
      }
      blocked += s * s / (1 + s * s);              // sin^2 of the skyline angle: the cosine-weighted share of sky it hides
    }
    occ[k] = 1 - blocked / ND;
  }
  // spread open-cell values into the solid cells, so filtering at a wall's foot never blends in a rooftop
  for (let pass = 0; pass < 4; pass++) {
    const src = occ.slice();
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = j * W + i; if (src[k] >= 0) continue;
      let s = 0, n = 0; for (const o of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) if (src[k + o] >= 0) { s += src[k + o]; n++; }
      if (n) occ[k] = s / n;
    }
  }
  for (let k = 0; k < W * H; k++) if (occ[k] < 0) occ[k] = 1;
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {          // separable 5-tap box blur, twice: smooths the jitter into soft gradients
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const x = i + d; if (x >= 0 && x < W) { s += occ[j * W + x]; n++; } } tmp[j * W + i] = s / n; }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const z = j + d; if (z >= 0 && z < H) { s += tmp[z * W + i]; n++; } } occ[j * W + i] = s / n; }
  }
  const px = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) px[k] = Math.round(Math.min(1, occ[k]) * 255);
  if (window.DBG_OCC) console.log('occlusion map ms', (performance.now() - t0).toFixed(0));
  const tex = new THREE.DataTexture(px, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  NQU.uOcc.value = tex; NQU.uOccB.value.set(X0, Z0, 1 / (W * C), 1 / (H * C));
  const inn = new Uint8Array(W * H);
  for (const q of WORLD.indoor) {
    const i0 = Math.max(0, Math.ceil((q.x0 - X0) / C - 0.5)), i1 = Math.min(W - 1, Math.floor((q.x1 - X0) / C - 0.5));
    const j0 = Math.max(0, Math.ceil((q.z0 - Z0) / C - 0.5)), j1 = Math.min(H - 1, Math.floor((q.z1 - Z0) / C - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) inn[j * W + i] = 255;
  }
  const tin = new THREE.DataTexture(inn, W, H, THREE.RedFormat, THREE.UnsignedByteType); tin.magFilter = tin.minFilter = THREE.NearestFilter; tin.needsUpdate = true;
  NQU.uIndoor.value = tin;
}

/* ---------------- environment: one cube capture per district, swapped as you walk ----------------
   scene.environment is set once and never swapped: WebGPURenderer rebuilds every object's render state, in every pass,
   when the scene's environment texture changes (well over a second on a fast desktop). Each district's capture is
   convolved once into its own PMREM target and copied into the one the scene points at when you walk in.
   Captures always draw through the same camera into the same cube target, so the renderer reuses its per-object
   state, and a new district renders one face per frame (PMREM on the seventh) while the old map stays up. */
let pmrem = null;
const ENV = { pm: {}, live: null, cur: null, want: null, job: null, vis: true, refl: 0 };   // pm: district id -> PMREM target of the current Look
const capRT = new THREE.CubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.5, 1200, capRT); scene.add(cubeCam);
const faceCam = new THREE.PerspectiveCamera(90, 1, 0.5, 1200); faceCam.matrixAutoUpdate = false; faceCam.matrixWorldAutoUpdate = false;
// Hide what must not be baked into the cube (particles, rain, zombies, instanced batches) for one face render.
function envHide(on) {
  if (on) { ENV.vis = partPoints.visible; partPoints.visible = false; rainLines.visible = false; snowPts.visible = false; ENV.refl = NQU.uReflOn.value; NQU.uReflOn.value = 0; }
  else { partPoints.visible = ENV.vis; rainLines.visible = true; snowPts.visible = true; NQU.uReflOn.value = ENV.refl; }
  for (const z of ZRIG.live) if (z.rig) z.rig.mesh.visible = !on;
  for (const m of BATCHES[0].values()) if (m.im) m.im.visible = on ? false : m.n > 0;
}
function envFace(face) {   // one cube face, as CubeCamera.update renders it, through the shared face camera
  // no env map in its own capture: envK 0 drops the env term exactly as a null scene.environment would, without the rebuild
  const prevT = renderer.getRenderTarget(), ek = NQU.uEnvK.value; NQU.uEnvK.value = 0;
  if (cubeCam.coordinateSystem !== renderer.coordinateSystem) { cubeCam.coordinateSystem = renderer.coordinateSystem; cubeCam.updateCoordinateSystem(); }
  cubeCam.updateMatrixWorld(true);
  const c = cubeCam.children[face]; faceCam.coordinateSystem = c.coordinateSystem;
  faceCam.matrixWorld.copy(c.matrixWorld); faceCam.matrixWorldInverse.copy(c.matrixWorldInverse); faceCam.projectionMatrix.copy(c.projectionMatrix); faceCam.projectionMatrixInverse.copy(c.projectionMatrixInverse);
  envHide(true); if (face === 0) renderer.shadowMap.needsUpdate = true;
  const gm = capRT.texture.generateMipmaps; if (face < 5) capRT.texture.generateMipmaps = false;   // mips build on the last face
  renderer.setRenderTarget(capRT, face); renderer.render(scene, faceCam);
  envHide(false); capRT.texture.generateMipmaps = gm; renderer.setRenderTarget(prevT); NQU.uEnvK.value = ek;
}
function envFinish(id) {   // the captured cube -> this district's PMREM (and, the first time, the scene's)
  ENV.pm[id] = pmrem.fromCubemap(capRT.texture, ENV.pm[id] || null);
  if (!ENV.live) { ENV.live = pmrem.fromCubemap(capRT.texture); scene.environment = ENV.live.texture; }   // once, at boot
}
function envShow(id) { if (ENV.cur === id) return; renderer.copyTextureToTexture(ENV.pm[id].texture, ENV.live.texture); ENV.cur = id; }
function updateEnv(cam) {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  if (ENV_DIRTY) { for (const k in ENV.pm) ENV.pm[k].dispose(); ENV.pm = {}; ENV.cur = null; ENV.job = null; ENV_DIRTY = false; }   // new Look: every capture is stale
  const d = districtAt(cam[0], cam[2]);
  if (ENV.pm[d.id]) { ENV.job = null; envShow(d.id); return; }
  if (!ENV.job || ENV.job.id !== d.id) { ENV.job = { id: d.id, face: 0 }; cubeCam.position.set(d.env[0], d.env[1], d.env[2]); }
  if (!ENV.live) { for (let f = 0; f < 6; f++) envFace(f); ENV.job.face = 6; }   // first frame: nothing to show yet
  if (ENV.job.face < 6) { envFace(ENV.job.face++); return; }
  envFinish(d.id); ENV.job = null; ENV.cur = null; envShow(d.id);
}

/* ---------------- light you can see: cones under lamps, halos round bulbs ---------------- */
const VOL_U = { uLamp: { value: new THREE.Color() }, uVolK: { value: 1 } };
const coneMat = coneMaterialGPU(VOL_U);
function buildVolumes() {
  // every lamp cone in one mesh: they share a material and blend additively (order-free), so one draw (two: back
  // faces, then front) replaces two per cone; the cones are baked in world space, their shading uses no model matrix
  const cones = [];
  for (const l of WORLD.lights) if (l.kind === 'lamp') {
    const h = l.p[1] - 0.2, rb = Math.min(6, l.r * 0.3);
    const g = new THREE.CylinderGeometry(0.35, rb, h, 24, 1, true); g.translate(0, -h / 2, 0); g.translate(l.p[0], l.p[1] - 0.1, l.p[2]);
    cones.push(g);
  }
  if (cones.length) {
    const g = cones.length > 1 ? mergeGeometries(cones) : cones[0]; g.computeBoundingSphere(); g.computeBoundingBox(); g.userData.cullBox = g.boundingBox;
    const m = new THREE.Mesh(g, coneMat); m.name = 'cones'; m.renderOrder = 8; m.frustumCulled = true; m.matrixAutoUpdate = false;
    scene.add(m);
  }
  const mat = haloMaterialGPU(VOL_U);
  // all halos in one instanced draw: additive (order-free) camera-facing quads, a few hundred of them
  const quad = new THREE.PlaneGeometry(1, 1);
  for (const H of WORLD.halos.length ? [WORLD.halos] : []) {
    const n = H.length, geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    const pos = new Float32Array(n * 4), col = new Float32Array(n * 3); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    H.forEach((h, i) => { pos.set([h.p[0], h.p[1], h.p[2], h.s], i * 4); col.set(h.c, i * 3); x0 = Math.min(x0, h.p[0] - h.s); x1 = Math.max(x1, h.p[0] + h.s); y0 = Math.min(y0, h.p[1] - h.s); y1 = Math.max(y1, h.p[1] + h.s); z0 = Math.min(z0, h.p[2] - h.s); z1 = Math.max(z1, h.p[2] + h.s); });
    geo.setAttribute('hp', new THREE.InstancedBufferAttribute(pos, 4)); geo.setAttribute('hc', new THREE.InstancedBufferAttribute(col, 3)); geo.instanceCount = n;
    const center = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); geo.boundingSphere = new THREE.Sphere(center, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = true; mesh.renderOrder = 9; scene.add(mesh);
  }
}

/* ---------------- wet-street reflections: the scene mirrored in y, at full resolution ---------------- */
const reflRT = new THREE.RenderTarget(4, 4, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera(); reflCam.matrixAutoUpdate = false; reflCam.matrixWorldAutoUpdate = false;
reflCam.coordinateSystem = renderer.coordinateSystem;   // the projection is copied from the main camera: never rebuilt from reflCam's own fov
const _S = new THREE.Matrix4().makeScale(1, -1, 1);
const REFL_CACHE = { valid: false, frame: 0, matrix: new THREE.Matrix4(), quality: -1 };
const MIRROR_NEAR = 70, MIRROR_SMALL = /^(props|garden|forest|suburbs|glass|blossoms)/, _mirrorOff = [];
function renderReflection(r) {
  const W = Math.max(4, R3.W), H = Math.max(4, R3.H);
  const resized = reflRT.width !== W || reflRT.height !== H;
  if (resized) { reflRT.setSize(W, H); REFL_CACHE.valid = false; }
  const cm = camera.matrixWorld.elements, pm = REFL_CACHE.matrix.elements;
  const dx = cm[12] - pm[12], dy = cm[13] - pm[13], dz = cm[14] - pm[14];
  const movedFar = dx * dx + dy * dy + dz * dz > 16;
  const turnedFar = Math.abs(cm[0] - pm[0]) + Math.abs(cm[2] - pm[2]) + Math.abs(cm[8] - pm[8]) + Math.abs(cm[10] - pm[10]) > 0.7;
  const cadence = SETTINGS.quality >= 3 ? 1 : PERF.pressure > 0.55 ? 3 : 2;
  const stale = R3.tick - REFL_CACHE.frame >= cadence;
  const mode = SETTINGS.quality;
  const refresh = !REFL_CACHE.valid || REFL_CACHE.quality !== mode || movedFar || turnedFar || stale;
  if (!refresh) { NQU.uReflOn.value = 1;
    TEXN.refl.value = reflRT.texture;
    return; }
  reflCam.projectionMatrix.copy(camera.projectionMatrix); reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  reflCam.matrixWorld.copy(_S).multiply(camera.matrixWorld).multiply(_S); reflCam.matrixWorldInverse.copy(reflCam.matrixWorld).invert();
  NQU.uReflOn.value = 0; TEXN.refl.value = GPU_BLACK;   // a pass can't sample the target it draws into
  const f = THEME.fog; r.setRenderTarget(reflRT); r.setClearColor(new THREE.Color(f[0], f[1], f[2]), 1); r.clear(true, true, false);
  renderer.shadowMap.needsUpdate = false;
  partPoints.visible = false; rainLines.visible = false; snowPts.visible = false;
  const decalVis = DECAL_POOL.map(m => m.visible); for (const m of DECAL_POOL) m.visible = false;
  const hiddenRigs = [];
  for (const z of ZRIG.live) if (z.rig && (z.dead || (z.x - PLAYER.x) ** 2 + (z.z - PLAYER.z) ** 2 > 10000)) { if (z.rig.mesh.visible) hiddenRigs.push(z.rig.mesh); z.rig.mesh.visible = false; }
  // WebGPU pays per draw on the CPU: small street props, trees and shopfront glass far from the eye can't be told
  // apart in a rippled puddle, so the mirror leaves those chunks out past MIRROR_NEAR (buildings,
  // signs, the skyline and anything nearby still reflect)
  const mirrorOff = _mirrorOff; mirrorOff.length = 0;
  for (const m of WORLD_MESHES) if (m.visible && MIRROR_SMALL.test(m.name)) { const c = m.geometry.boundingSphere; if (c && (c.center.x - PLAYER.x) ** 2 + (c.center.z - PLAYER.z) ** 2 > (MIRROR_NEAR + c.radius) ** 2) { m.visible = false; mirrorOff.push(m); } }
  r.render(scene, reflCam);
  for (const m of mirrorOff) m.visible = true;
  for (const m of hiddenRigs) m.visible = true; for (let i = 0; i < DECAL_POOL.length; i++) DECAL_POOL[i].visible = decalVis[i];
  partPoints.visible = true; rainLines.visible = true; snowPts.visible = true;
  NQU.uReflOn.value = 1;
  TEXN.refl.value = reflRT.texture;
  REFL_CACHE.valid = true; REFL_CACHE.frame = R3.tick; REFL_CACHE.matrix.copy(camera.matrixWorld);
  REFL_CACHE.quality = mode;
}

/* ---------------- post: passes ---------------- */
/* ---- GPU profiler (?prof=1): per-pass GPU time from timestamp queries (gpu.js GPUProfInspector), plus draw calls / triangles ---- */
const PROF = { on: false, ts: false, cpu: 0, n: 0, el: null, t: 0, calls: 0, tris: 0 };
try { PROF.on = new URLSearchParams(location.search).has('prof'); } catch (e) { }
if (PROF.on) {
  PROF.ts = renderer.backend.trackTimestamp && renderer.hasFeature('timestamp-query');   // WebGPU timestamp queries, or EXT_disjoint_timer_query on WebGL2
  if (PROF.ts) renderer.inspector = new GPUProfInspector();   // gpu.js: names each render call so the timestamp queries add up per pass
  renderer.info.autoReset = false;
  PROF.el = document.createElement('pre');
  Object.assign(PROF.el.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: 99, margin: 0, padding: '6px 9px', font: '11px/1.35 monospace', color: '#bff6ff', background: 'rgba(0,0,0,0.72)', pointerEvents: 'none', whiteSpace: 'pre' });
  document.body.appendChild(PROF.el);
}
function profFrame(cpuMs) {
  if (!PROF.on) return; PROF.cpu += cpuMs; PROF.n++;
  const inf = renderer.info.render; PROF.calls = inf.drawCalls; PROF.tris = inf.triangles; renderer.info.reset();   // per-frame totals across every pass
  if (performance.now() - PROF.t < 500) return; PROF.t = performance.now();
  let gpu = 0, lines = [];
  for (const [k, a] of Object.entries(GPU_PROF.acc)) { if (!a.n) continue; const m = a.s / a.n; gpu += m; lines.push(`  ${k.padEnd(14)} ${m.toFixed(2)} ms`); a.s = 0; a.n = 0; }
  const alive = ZOMBIES.filter(z => !z.dead).length;
  const gpuT = !PROF.ts ? 'timestamp queries unavailable' : GPU_PROF.ok ? gpu.toFixed(2) + ' ms' : 'waiting for timestamps';
  PROF.el.textContent = `${BACKEND_NAME()}  GPU ${gpuT}\n${lines.join('\n')}\nCPU frame ${(PROF.cpu / PROF.n).toFixed(2)} ms\ncalls ${PROF.calls}  tris ${(PROF.tris / 1e6).toFixed(2)}M\nzombies ${alive}  chunks ${WORLD_STREAM.active}/${WORLD_MESHES.length}  quality ${QUALITY_NAMES[SETTINGS.quality]}  res ${SETTINGS.res === 'auto' ? 'auto ' + Math.round(PERF.scale * 100) : SETTINGS.res}%  textures ${ULTRA.state}`;
  PROF.cpu = 0; PROF.n = 0;
}
const BACKEND_NAME = () => NQ_BACKEND === 'webgpu' ? 'WebGPU' : 'WebGL2 (compatibility)';
/* ---- surface textures: CC0 texture arrays (textures/*.jpg), loaded once at the first frame, on High and Ultra alike ---- */
const ULTRA = { state: 'none' };
function loadUltraTextures() {
  if (ULTRA.state !== 'none') return; ULTRA.state = 'loading';
  const load = (n) => new Promise((ok, rej) => { const im = new Image(); im.onload = () => ok(im); im.onerror = rej; im.src = 'textures/' + n + '.jpg?v=' + TEX_VER; });
  Promise.all(['albedo', 'normal', 'orm'].map(load)).then((ims) => {
    const arr = ims.map((im) => {
      const w = im.width, H = im.height, h = H / TEX_LAYERS.length;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
      const src = cx.getImageData(0, 0, w, H).data, d = new Uint8Array(src.length), row = w * 4;
      for (let L = 0; L < TEX_LAYERS.length; L++) for (let y = 0; y < h; y++) d.set(src.subarray((L * h + y) * row, (L * h + y + 1) * row), (L * h + (h - 1 - y)) * row);   // GL rows run bottom-up
      const t = new THREE.DataArrayTexture(d, w, h, TEX_LAYERS.length);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.getMaxAnisotropy()); t.needsUpdate = true;
      return { t, d, w, h };
    });
    const [A, N, O] = arr;
    for (let L = 0; L < TEX_LAYERS.length; L++) {   // per-layer means: the photo adds detail around the city's own colours
      let r = 0, g = 0, b = 0, ro = 0, c = 0, co = 0;
      for (let y = 0; y < A.h; y += 8) for (let x = 0; x < A.w; x += 8) { const i = ((L * A.h + y) * A.w + x) * 4; r += (A.d[i] / 255) ** 2.2; g += (A.d[i + 1] / 255) ** 2.2; b += (A.d[i + 2] / 255) ** 2.2; c++; }
      for (let y = 0; y < O.h; y += 8) for (let x = 0; x < O.w; x += 8) { ro += O.d[((L * O.h + y) * O.w + x) * 4 + 1] / 255; co++; }
      NQU.uTexM.value[L].set(r / c, g / c, b / c, ro / co);
    }
    for (const t of [A.t, N.t, O.t]) renderer.initTexture(t);   // upload + mipmaps now, outside any frame (no mid-frame stall or half-bound state)
    NQU.uTexA.value = A.t; NQU.uTexN.value = N.t; NQU.uTexR.value = O.t;
    ULTRA.state = 'ready'; NQU.uTexOn.value = 1;
  }).catch((e) => { ULTRA.state = 'failed'; console.warn('surface textures failed to load', e); });
}
function applyQuality3(q) {
  loadUltraTextures(); NQU.uTexOn.value = NQU.uTexA.value ? 1 : 0;
  // Ultra shadows: the moon/sun map at 4x the texels over a wider box; lamp shadows at 2x, all six lamps casting
  const U = q >= 3, sm = U ? 4096 : 2048, box = U ? 80 : 52;
  if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box }); sun.shadow.camera.updateProjectionMatrix();
  SPOTS.forEach((sp, i) => { const ms = U ? 2048 : 1024; sp.shadow = i < (U ? N_SPOTS : N_SHADOW_SPOTS); if (sp.s.shadow.mapSize.x !== ms) { sp.s.shadow.mapSize.set(ms, ms); if (sp.s.shadow.map) { sp.s.shadow.map.dispose(); sp.s.shadow.map = null; } } sp.s.shadow.needsUpdate = true; });
  sun.castShadow = true; for (const { s, shadow } of SPOTS) s.castShadow = shadow;
}

/* ---------------- shader warm-up: compile every program at load, not on first use in play ---------------- */
// every shadow map redraws in the warm-up frame, so the shadow-pass pipelines of the stand-ins are built too
function warmShadows() { sun.shadow.needsUpdate = true; for (const { s } of SPOTS) s.shadow.needsUpdate = true; renderer.shadowMap.needsUpdate = true; }
// Scene passes draw into render targets, whose program keys differ from the screen's, so compile against one.
// Materials that may have no object yet (the bow viewmodel, instanced items) get a throwaway stand-in mesh.
function warmShaders() {
  const t0 = performance.now(), progs = () => renderer.info.memory.programs, before = progs();
  const g = new THREE.BufferGeometry(), n = 3;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('nqm', new THREE.BufferAttribute(new Float32Array(6), 2));
  for (const [k, w] of [['iTint', 4], ['iEmit', 3], ['iSkin', 3]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(w), w));
  g.setIndex([0, 1, 2]);   // the real meshes are indexed, and the index is part of the program key: an unindexed stand-in warms a program nothing else uses
  const stand = [new THREE.Mesh(g, MAT.static)]; stand[0].receiveShadow = true;
  for (const m of stand) { m.frustumCulled = false; scene.add(m); }
  // Every instanced batch the game can ever draw exists from here on, sized for a busy wave, and flushList draws each one as a
  // single invisible instance during the warm-up: three compiles a program per InstancedMesh per pass, so a batch born or
  // regrown mid-game (the first flame, the first helmet knocked off, a crowded blast) used to stall the frame for every pass it
  // then entered. The bow's batches are built the same way by drawing it once now.
  for (const [geo, cap] of [[MESH.box, 256], [MESH.cyl, 96], [MESH.sphere, 128], [MESH.cone, 96], [MESH.metal, 64], [MESH.ring, 48], [MODEL.jaw, 16], [MODEL.brute_helmet, 16]]) if (geo) growBatch(batchFor(geo, false), cap);
  const showBow = GAME.showBowInTitle; GAME.showBowInTitle = true;
  // a stand-in Meshy zombie, so the textured-body program is built now and not on the first spawn
  const wz = typeof MZ !== 'undefined' && Object.keys(MZ).length ? { type: 'walker', seed: 0.5, warm: true } : null;
  if (wz) { makeRig(wz); wz.rig.mesh.position.set(0, -60, 0); wz.rig.mesh.frustumCulled = false; wz.rig.mesh.updateMatrixWorld(true); }
  const batches = WORLD_MESHES.filter(m => m.isBatchedMesh); for (const b of batches) { b.frustumCulled = false; b.perObjectFrustumCulled = false; }   // the trees stand far from the title camera: draw them once so their program exists before the suburbs come into view
  const prev = renderer.getRenderTarget();
  try {
    // the renderer builds a pipeline per pass (mirror, world, bow, shadows, AO prepass) the first time it draws a material:
    // draw one frame now with every stand-in in it, plus a spark and a smoke puff for the particle pipeline
    emit(0, -60, 0, 0, 0, 0, 0.05, [0, 0, 0], 0.1); emit(0, -60, 0, 0, 0, 0, 0.05, [0, 0, 0], -0.1); updateParticles(0.001);
    R3.warming = true; warmShadows(); render(GAME.time);
  } catch (e) { console.warn('shader warm-up', e); }
  finally { R3.warming = false; GAME.showBowInTitle = showBow; renderer.setRenderTarget(prev); for (const m of stand) scene.remove(m); g.dispose(); if (wz) { wz.rig.mesh.frustumCulled = true; releaseRig(wz); } for (const b of batches) { b.frustumCulled = true; b.perObjectFrustumCulled = true; } }
  warmMeshyZombies();   // every breed and outfit that has landed so far
  R3.warm = { programs: progs() - before, ms: Math.round(performance.now() - t0) };
}

// The breeds that stream in after boot (and the walker outfits): draw one of each once, out of sight, as soon as they
// land, so the first wave that brings one doesn't upload its model and textures and build its render state mid-fight.
function warmMeshyZombies() {
  if (typeof MZ === 'undefined') return;
  const zs = [];
  for (const [b, l] of Object.entries(MZ_BY)) l.forEach((t, k) => {
    if (MZ[t].warmed) return; MZ[t].warmed = true;
    let seed = 0.5; for (let i = 0; i < 400; i++) { const s = (i + 0.5) / 400; if (Math.floor(((s * 9.173) % 1 + 1) % 1 * l.length) % l.length === k) { seed = s; break; } }   // a seed that picks this outfit (rig.js mzFor)
    const z = { type: b, seed, warm: true }; makeRig(z);
    if (z.rig) { z.rig.mesh.position.set(0, -60, 0); z.rig.mesh.frustumCulled = false; z.rig.mesh.updateMatrixWorld(true); zs.push(z); }
  });
  if (!zs.length) return;
  try { R3.warming = true; warmShadows(); render(GAME.time); } catch (e) { console.warn('zombie warm-up', e); }
  finally { R3.warming = false; for (const z of zs) { z.rig.mesh.frustumCulled = true; releaseRig(z); } }
}

/* ---------------- per-frame sync + render ---------------- */
function render3(time, W, H, fov, cam) {
  if (R3.quality !== SETTINGS.quality) { applyQuality3(SETTINGS.quality); R3.quality = SETTINGS.quality; }
  if (R3.W !== W || R3.H !== H) { renderer.setSize(W, H, false); R3.W = W; R3.H = H; }
  if (canvas.width !== W || canvas.height !== H) renderer.setSize(W, H, false);
  // cameras
  camera.matrixWorld.fromArray(camM); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.fov = fov; camera.aspect = W / H; camera.updateProjectionMatrix();
  updateWorldStreaming(cam);
  vmCamera.matrixWorld.copy(camera.matrixWorld); vmCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
  vmCamera.fov = VM_FOV; vmCamera.aspect = W / H; vmCamera.updateProjectionMatrix();
  M4.mul(_vp, camera.projectionMatrix.elements, camera.matrixWorldInverse.elements);
  skyMesh.position.set(cam[0], cam[1], cam[2]);
  // theme + shared uniforms
  applyThemeUniforms(); NQU.uTime.value = time;
  const T = THEME;
  SKY_U.uZen.value.setRGB(...T.zen); SKY_U.uMid.value.setRGB(...T.mid); SKY_U.uGlow.value.setRGB(...T.glow); SKY_U.uCloud.value.setRGB(...T.cloud); SKY_U.uDiscCol.value.setRGB(...T.disc); SKY_U.uDiscDir.value.set(...T.discDir); SKY_U.uStars.value = T.stars;
  syncSigns(time, T);
  // weather (weather.js) on top of the Look: how much falls, rain or snow, wind, how wet or white the streets are, lightning
  const rk = wxRainK(), sk = wxSnowK(), wetK = T.rain > 0.2 ? 1 : 0.5;
  rainMat.uniforms.uAlpha.value = Math.max(0.35, T.rain) * (0.75 + 0.45 * rk); rainMat.uniforms.uRainCol.value.setRGB(...T.rainCol); rainMat.uniforms.uDens.value = rk * wetK; rainMat.uniforms.uWind.value = WX.wind + WX.gust;
  snowMat.uniforms.uDens.value = sk; snowMat.uniforms.uWind.value = WX.wind + WX.gust * 0.6; snowMat.uniforms.uPx.value = H / 1000;
  snowMat.uniforms.uCol.value.setRGB(T.rainCol[0] * 0.8 + 0.25, T.rainCol[1] * 0.8 + 0.25, T.rainCol[2] * 0.8 + 0.27);
  NQU.uWet.value = T.wet * WX.wet * (1 - WX.cover * 0.85); NQU.uSnowCov.value = WX.cover;
  NQU.uEnvK.value = T.envK !== undefined ? T.envK : 0.5; NQU.uRain.value = T.rain * rk * 1.4;
  NQU.uAirK.value = 0.0078 * (0.6 + T.rain * (0.3 + rk + sk * 1.2)) * (T.airK !== undefined ? T.airK : 1);
  VOL_U.uLamp.value.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); VOL_U.uVolK.value = 0.35 + T.rain * (0.3 + rk + sk * 0.8);
  if (WX.flash > 0) { const f = WX.flash * (0.6 + 0.4 * Math.random()); SKY_U.uCloud.value.setRGB(T.cloud[0] + f * 0.6, T.cloud[1] + f * 0.62, T.cloud[2] + f * 0.75); SKY_U.uMid.value.setRGB(T.mid[0] + f * 0.25, T.mid[1] + f * 0.26, T.mid[2] + f * 0.32); }
  updateLights3(cam);
  // dynamic geometry
  flushList(WORLD_ITEMS, false); flushList(VM_ITEMS, true);
  partBuf.needsUpdate = true; partBuf.updateRanges.length = 0; partBuf.addUpdateRange(0, Math.max(1, PART.n) * 8);
  partGeo.instanceCount = PART.n;   // 0 skips the draw
  partMat.uniforms.uH.value = H / (2 * Math.tan(fov * Math.PI / 360));
  syncDecals();
  GPU_PROF.tag = 'env map';
  updateEnv(cam);
  GPU_PROF.tag = null;
  renderGPU(T, W, H, time);
}
/* ---- the frame: wet-street mirror, then the RenderPipeline (gpu.js buildPostGPU) ---- */
const _clr = new THREE.Color();
function renderGPU(T, W, H, time) {
  if (!GPOST.pipe || GPOST.key !== SETTINGS.quality) buildPostGPU(SETTINGS.quality);
  gpuSyncTextures();
  const nf = renderer._nodes.nodeFrame; nf.update(); renderer.info.frame = nf.frameId;   // one node frame per game frame: every pass redraws
  const U = GRADE_U;
  U.uTime.value = time; U.uDmg.value = PLAYER.dmgFlash; U.uLow.value = GAME.state === 'playing' || GAME.state === 'over' ? clamp(1 - PLAYER.hp / PLAYER.maxHp / 0.35, 0, 1) : 0;
  U.uExpo.value = T.expo * (1 + WX.flash * 0.9); U.uSat.value = T.sat; U.uGrade.value.set(...T.grade); U.uLift.value.set(...T.lift); U.uAberr.value = BOW.state === 'drawing' ? BOW.draw * 0.002 : 0; U.uFocus.value = GAME.state === 'playing' && BOW.state === 'drawing' ? easeOut(BOW.draw) : 0; U.uRes.value.set(W, H); U.uSharp.value = 0.45;
  const B = GPOST.bloom; B.strength.value = T.bloom * (T.bloomK || 0.32) * 1.2; B.threshold.value = T.thr; B.radius.value = T.bloomR || 0.3;
  vmCamera.layers.set((VM_ITEMS.n > 0 && !DBG.noVM) || R3.warming ? LAYER_VM : 30);
  scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false;
  try {
    GPU_PROF.tag = 'reflection';
    if (THEME.wet > 0.2) renderReflection(renderer); else { NQU.uReflOn.value = 0; TEXN.refl.value = GPU_BLACK; }
    GPU_PROF.tag = null; renderer.setRenderTarget(null);
    const f = T.fog; renderer.setClearColor(_clr.setRGB(f[0], f[1], f[2]), 0);   // alpha 0: the bow pass lays over the world by its alpha
    GPOST.pipe.render();
  } finally { scene.matrixWorldAutoUpdate = true; }
  if (PROF.ts) gpuProfPoll();
}
