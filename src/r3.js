/* ============================================================
   three.js scene graph + frame pipeline
   world pass (MSAA, baked occlusion) -> viewmodel pass -> bloom -> grade
   ============================================================ */
const MAX_PL = 16;             // point-light pool (static shop/fountain lights + dynamic flashes)
const R3 = { W: 0, H: 0, quality: -1, envDirty: true, built: false, tick: 0 };
// FAR (the distant-detail budget and its tuning numbers) lives in engine.js, next to the shaders that read it
function syncFar() {
  FAR.on = SETTINGS.quality <= 1 && !DBG.noFar; FAR.laptop = FAR.on && SETTINGS.quality === 1 && !!SETTINGS.laptop;   // DBG.noFar: A/B against the old paths
  NQU.uFar.value.set(FAR.NEAR, FAR.NEAR + FAR.FADE, FAR.on ? 1 : 0);
  NQU.uFogFar.value.set(FAR.laptop ? FAR.lap.fogStart : 1e5, FAR.laptop ? FAR.lap.fogK : 0);
  const key = (FAR.on ? 1 : 0) + (FAR.laptop ? 2 : 0);
  if (key !== FAR._key) { FAR._key = key; for (const m of FAR_MATS) farDefines(m); }   // shaders rebuild, like any quality switch
}
// The wet-street mirror and the district env map put distant things onto NEAR pixels (a tower in the puddle at
// your feet), so those passes render the full scene: far-detail off, Laptop's culled chunks back, normal fog.
const _farSave = { k: 0, fog: 0, hidden: [] };
function farSuspend() {
  _farSave.k = NQU.uFar.value.z; _farSave.fog = NQU.uFogFar.value.y; NQU.uFar.value.z = 0; NQU.uFogFar.value.y = 0;
  const h = _farSave.hidden; h.length = 0;
  if (FAR.laptop) for (const m of WORLD_MESHES) if (m.userData.lapHidden) { m.visible = true; h.push(m); }
}
function farResume() {
  NQU.uFar.value.z = _farSave.k; NQU.uFogFar.value.y = _farSave.fog;
  for (const m of _farSave.hidden) m.visible = false; _farSave.hidden.length = 0;
}
// 0 inside the near zone, 1 once fully past the fade (always 0 on Sharp / Ultra)
function farK(d) { return FAR.on ? clamp((d - FAR.NEAR) / FAR.FADE, 0, 1) : 0; }
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
    }
  }
}

/* ---------------- sky dome ---------------- */
const SKY_U = { uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() }, uDiscCol: { value: new THREE.Color() }, uDiscDir: { value: new THREE.Vector3() }, uStars: { value: 1 } };
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
  uniforms: Object.assign({ uTime: NQU.uTime, uFogCol: NQU.uFogCol }, SKY_U), side: THREE.BackSide, depthWrite: false, depthTest: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `precision highp float; varying vec3 vW; uniform float uTime; uniform vec3 uFogCol, uZen, uMid, uGlow, uCloud, uDiscCol, uDiscDir; uniform float uStars;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(vW - cameraPosition); float h = d.y;
  vec3 hor = uFogCol*1.25;
  vec3 c = mix(hor, uMid, smoothstep(0.0,0.18,h)); c = mix(c, uZen, smoothstep(0.15,0.7,h));
  c += uGlow*exp(-max(h,0.)*14.)*0.5;
  vec2 uv = d.xz/max(h+0.08,0.02);
  float cl = vn(uv*0.9+vec2(uTime*0.01,0.)) * vn(uv*2.3-vec2(uTime*0.02,uTime*0.01));
  cl = smoothstep(0.15,0.6,cl)*smoothstep(0.02,0.25,h)*(1.-smoothstep(0.5,0.9,h));
  c = mix(c, uCloud, cl*0.7);
  vec2 sp = floor(vec2(atan(d.z,d.x)*180., h*180.));
  float st = step(0.9975, h21(sp)) * smoothstep(0.25,0.6,h) * (1.-cl);
  c += vec3(0.8,0.85,1.)*st*uStars*(0.5+0.5*sin(uTime*3.+sp.x));
  vec3 md = normalize(uDiscDir); float m = dot(d, md);
  c += uDiscCol*smoothstep(0.9993,0.9996,m)*1.6;
  c += uDiscCol*0.4*pow(max(m,0.),220.)*0.8 + uDiscCol*0.08*pow(max(m,0.),8.);
  gl_FragColor = vec4(c,1.);
}` }));
skyMesh.frustumCulled = false; skyMesh.renderOrder = -1000; skyMesh.matrixAutoUpdate = true;
scene.add(skyMesh);

/* ---------------- signs + decals (textured quads) ---------------- */
const PLANE = new THREE.PlaneGeometry(1, 1);
// Signs are drawn in batches: one instanced draw per texture size and blend mode instead of one per sign. Each
// batch keeps its signs' canvases, untouched, as the layers of a texture array (same size, format, filtering,
// mip chain and anisotropy as the single textures), and the per-sign uniforms become per-instance attributes.
const SIGN_VS = `attribute vec3 iCol; attribute vec3 iSign; varying vec2 vUV; varying vec3 vW; flat varying vec3 vCol; flat varying vec3 vSign;
void main(){ vec4 w = modelMatrix*(instanceMatrix*vec4(position,1.)); vW = w.xyz; vUV = uv; vCol = iCol; vSign = iSign; gl_Position = projectionMatrix*viewMatrix*w; }`;
// fog for the non-uber shaders: Laptop (NQ_FOGFAR) adds density past a start distance; otherwise the original formula
const FOG_GLSL = `#ifdef NQ_FOGFAR
uniform vec2 uFogFar;
#define NQ_FOGD(d) ((d) * uFogDen + max((d) - uFogFar.x, 0.) * uFogFar.y)
#else
#define NQ_FOGD(d) d * uFogDen
#endif`;   // no parentheses: expands to exactly the original fog expressions
function fogMat(m) { m.userData.farOK = false; FAR_MATS.push(m); farDefines(m); return m; }
const SIGN_FS = `precision highp float; varying vec2 vUV; varying vec3 vW; flat varying vec3 vCol; flat varying vec3 vSign; uniform highp sampler2DArray uTex; uniform float uTime, uA, uFogDen; uniform vec3 uFogCol;
${NOISE_GLSL}
${FOG_GLSL}
void main(){
  vec2 uv = vUV; float flick = 1.; float uMode = vSign.y, uSeed = vSign.x;
  if (uMode > 0.5) { float row = floor((1.-uv.y)*24.); float g = step(0.93, h21(vec2(row, floor(uTime*6.)+uSeed))); uv.x += g*(h21(vec2(row,uTime))-0.5)*0.08; flick = 0.8+0.2*sin(uv.y*300.+uTime*20.); }
  else flick = 1. - step(0.985, h21(vec2(floor(uTime*9.), uSeed)))*0.85;
  vec4 t = texture(uTex, vec3(uv, vSign.z));
  vec3 c = t.rgb*vCol*flick;
  float d = length(vW - cameraPosition); c = mix(c, uFogCol, clamp((1.-exp(-NQ_FOGD(d)))*0.8, 0., 1.));
  gl_FragColor = vec4(c, t.a*uA);
}`;
const SIGNS = [];          // { s: WORLD.signs entry, b: its batch, layer, vis }
const SIGN_BATCHES = [];   // { mesh, list }
function signArray(texs) {
  // a texture array holding these canvas textures as layers, uploaded exactly as three.js uploads a CanvasTexture
  const t0 = texs[0], w = t0.image.width, h = t0.image.height;
  const arr = new THREE.DataArrayTexture(null, w, h, texs.length);
  arr.source.dataReady = false;   // storage only: the layers are copied in below
  Object.assign(arr, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, colorSpace: t0.colorSpace, generateMipmaps: true, minFilter: t0.minFilter, magFilter: t0.magFilter,
    anisotropy: t0.anisotropy, wrapS: t0.wrapS, wrapT: t0.wrapT, flipY: t0.flipY, premultiplyAlpha: t0.premultiplyAlpha, unpackAlignment: t0.unpackAlignment });
  arr.needsUpdate = true; renderer.initTexture(arr);
  const gl = renderer.getContext(), pos = new THREE.Vector3();
  renderer.state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);   // NoColorSpace canvases: no conversion, as for the single textures
  texs.forEach((t, i) => { arr.generateMipmaps = i === texs.length - 1; renderer.copyTextureToTexture(t, arr, null, pos.set(0, 0, i)); });   // mips once, after the last layer
  arr.generateMipmaps = true;
  return arr;
}
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
    const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: signArray(g.texs) }, uTime: NQU.uTime, uA: { value: 1 }, uFogDen: NQU.uFogDen, uFogFar: NQU.uFogFar, uFogCol: NQU.uFogCol },
      vertexShader: SIGN_VS, fragmentShader: SIGN_FS, transparent: g.add, depthWrite: !g.add, blending: g.add ? THREE.AdditiveBlending : THREE.NoBlending, side: THREE.DoubleSide });
    fogMat(mat);
    const geo = new THREE.InstancedBufferGeometry(); geo.index = PLANE.index; for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, PLANE.attributes[k]);
    const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), sg = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    col.setUsage(THREE.DynamicDrawUsage); sg.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iCol', col); geo.setAttribute('iSign', sg);
    const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.visible = false;
    mesh.frustumCulled = false; mesh.renderOrder = g.add ? 5 : 0; mesh.name = g.add ? 'signsAdd' : 'signs';
    scene.add(mesh);
    const b = { mesh, list: [] }; SIGN_BATCHES.push(b);
    for (const s of g.list) { const q = { s, b, layer: g.layer.get(s.tex), vis: false }; b.list.push(q); SIGNS.push(q); }
  }
}
// per frame: the visible signs of each batch, packed in their original order, with this frame's flicker
function syncSigns(time, T) {
  for (const b of SIGN_BATCHES) {
    const m = b.mesh, g = m.geometry, M = m.instanceMatrix.array, C = g.attributes.iCol.array, S = g.attributes.iSign.array; let n = 0;
    for (const { s, layer, vis } of b.list) {   // dead city: some signs are out, a third sputter on failing power
      if (!vis) continue;
      const f = s.seed % 1; let k = 1;
      if (f < 0.08) k = 0.06;
      else if (f < 0.35) k = (Math.sin(time * 23 + s.seed * 7) > 0.55 || Math.sin(time * 1.3 + s.seed) > 0.9) ? 0.12 : 1;
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
  const vs = `attribute float iAlpha; varying vec2 vUV; varying vec3 vW; varying float vA;
void main(){ vec4 w=modelMatrix*instanceMatrix*vec4(position,1.); vW=w.xyz; vUV=uv; vA=iAlpha; gl_Position=projectionMatrix*viewMatrix*w; }`;
  const fs = `precision highp float; varying vec2 vUV; varying vec3 vW; varying float vA; uniform sampler2D uTex; uniform float uFogDen; uniform vec3 uFogCol;
${FOG_GLSL}
void main(){ vec4 t=texture2D(uTex,vUV); vec3 c=t.rgb; float d=length(vW-cameraPosition); c=mix(c,uFogCol,clamp((1.-exp(-NQ_FOGD(d)))*.8,0.,1.)); gl_FragColor=vec4(c,t.a*vA); }`;
  for (let v = 0; v < DECAL_TEX.length; v++) {
    const g = PLANE.clone(); const alpha = new THREE.InstancedBufferAttribute(new Float32Array(DECAL_CAP), 1); alpha.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iAlpha', alpha);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: DECAL_TEX[v] }, uFogDen: NQU.uFogDen, uFogFar: NQU.uFogFar, uFogCol: NQU.uFogCol }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    fogMat(mat);
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
    const fk = FAR.on && dd2 > FAR.NEAR * FAR.NEAR ? farK(Math.sqrt(dd2)) : 0;   // far-detail tiers: blood pools fade out past the near zone
    if (dd2 > 150 * 150 || fk >= 1) continue;
    const m = DECAL_POOL[d.v], i = counts[d.v]++;
    const fadeAt = DECAL_LIFE - 9;
    const a = Math.min(1, d.t * 6) * (d.t > fadeAt ? Math.max(0, 1 - (d.t - fadeAt) / 9) : 1);
    m.instanceMatrix.array.set(M4.trs(_decalM, d.x, 0.035, d.z, -Math.PI / 2, d.rot, 0, d.r * 2, d.r * 2, 1), i * 16);
    m.geometry.attributes.iAlpha.array[i] = fk > 0 ? a * 0.92 * (1 - fk) : a * 0.92;
  }
  for (let v = 0; v < DECAL_POOL.length; v++) {
    const m = DECAL_POOL[v], n = counts[v]; m.count = n; m.visible = n > 0;
    if (n) { m.instanceMatrix.needsUpdate = true; m.geometry.attributes.iAlpha.needsUpdate = true; }
  }
}

/* ---------------- particles + rain ---------------- */
const partGeo = new THREE.BufferGeometry();
const partBuf = new THREE.InterleavedBuffer(PART.data, 8); partBuf.setUsage(THREE.DynamicDrawUsage);
partGeo.setAttribute('position', new THREE.InterleavedBufferAttribute(partBuf, 3, 0));
partGeo.setAttribute('pcol', new THREE.InterleavedBufferAttribute(partBuf, 4, 3));
partGeo.setAttribute('psize', new THREE.InterleavedBufferAttribute(partBuf, 1, 7));
const partMat = new THREE.ShaderMaterial({
  uniforms: { uH: { value: 500 } }, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  vertexShader: `attribute vec4 pcol; attribute float psize; uniform float uH; varying vec4 vC; varying float vBlend;
void main(){ vec4 v = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*v; gl_PointSize = clamp(abs(psize)*uH/max(-v.z,0.05), 1., 256.); vC = pcol; vBlend = psize < 0. ? 1. : 0.; }`,
  fragmentShader: `precision mediump float; varying vec4 vC; varying float vBlend;
void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c); float a = smoothstep(0.5,0.0,d);
  if (vBlend > 0.5) { float s = smoothstep(0.5,0.3,d)*vC.a; gl_FragColor = vec4(vC.rgb*s, s); } else { a *= a; gl_FragColor = vec4(vC.rgb*a*vC.a, 0.); } }`,
});
const partPoints = new THREE.Points(partGeo, partMat); partPoints.frustumCulled = false; partPoints.renderOrder = 10; scene.add(partPoints);

const rainGeo = (function () {
  const p = new Float32Array(RAIN_N * 2 * 3), a = new Float32Array(RAIN_N * 2 * 2);
  for (let i = 0; i < RAIN_N; i++) { const x = Math.random() * 50, z = Math.random() * 50, y = Math.random() * 36, s = Math.random(); for (let e = 0; e < 2; e++) { const o = i * 2 + e; p[o * 3] = x; p[o * 3 + 1] = z; p[o * 3 + 2] = y; a[o * 2] = s; a[o * 2 + 1] = e; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aP2', new THREE.BufferAttribute(a, 2)); return g;
})();
const rainMat = new THREE.ShaderMaterial({
  uniforms: { uTime: NQU.uTime, uAlpha: { value: 0.5 }, uRainCol: { value: new THREE.Color() }, uIndoor: NQU.uIndoor, uOccB: NQU.uOccB, uDens: { value: 0.7 }, uWind: { value: 0.4 } }, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `attribute vec2 aP2; uniform float uTime, uDens, uWind; uniform sampler2D uIndoor; uniform vec4 uOccB; varying float vA, vK;
void main(){ float S = 50.;
  float x = mod(position.x - cameraPosition.x, S) - S*0.5 + cameraPosition.x;
  float z = mod(position.y - cameraPosition.z, S) - S*0.5 + cameraPosition.z;
  float y = mod(position.z - uTime*(24.+aP2.x*8.)*(0.85 + 0.3*uDens), 36.) - 6. + cameraPosition.y;
  // how much falls is the weather's call (weather.js); drifting patches keep it uneven, gusts swing the slant
  float spell = uWind;
  float patchD = 0.5 + 0.5 * sin(x * 0.09 + uTime * 0.35) * sin(z * 0.075 - uTime * 0.27);
  float dens = clamp(uDens * (0.7 + 0.6 * patchD), 0., 1.);
  float rnd = fract(aP2.x * 7.31 + position.x * 0.137 + position.y * 0.071);
  vK = step(rnd, dens) * (0.45 + 0.8 * fract(rnd * 13.7));
  if (uOccB.z > 0.) vK *= 1. - step(0.5, texture2D(uIndoor, (vec2(x, z) - uOccB.xy) * uOccB.zw).r) * step(y, 4.6);   // dry under a ceiling
  float wind = 0.08 + 0.32 * spell + 0.12 * sin(uTime * 1.3 + position.y * 0.21), len = 0.9 * (0.55 + 0.9 * fract(rnd * 5.3));
  vec3 p = vec3(x + aP2.y * wind * len * 2., y + aP2.y * len, z + aP2.y * 0.05); vA = aP2.y;
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
  fragmentShader: `precision mediump float; varying float vA, vK; uniform float uAlpha; uniform vec3 uRainCol; void main(){ gl_FragColor = vec4(uRainCol*uAlpha*(0.3+vA*0.7)*vK, 0.); }`,
});
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; rainLines.renderOrder = 11; scene.add(rainLines);
// snow: soft flakes that drift, swirl and ride the wind (same drop buffer, one point per drop)
const snowMat = new THREE.ShaderMaterial({
  uniforms: { uTime: NQU.uTime, uAlpha: { value: 0.9 }, uCol: { value: new THREE.Color() }, uIndoor: NQU.uIndoor, uOccB: NQU.uOccB, uDens: { value: 0 }, uWind: { value: 0.3 }, uPx: { value: 1 } },
  transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `attribute vec2 aP2; uniform float uTime, uDens, uWind, uPx; uniform sampler2D uIndoor; uniform vec4 uOccB; varying float vK;
void main(){ float S = 24.; float rnd = fract(aP2.x * 7.31 + position.x * 0.137 + position.y * 0.071);
  float sw = sin(uTime * (0.7 + rnd) + position.x * 3.1) * 0.7, sw2 = cos(uTime * (0.5 + rnd * 0.8) + position.y * 2.3) * 0.5;
  float x = mod(position.x * 0.48 + uWind * uTime * 3. + sw - cameraPosition.x, S) - S*0.5 + cameraPosition.x;
  float z = mod(position.y * 0.48 + sw2 - cameraPosition.z, S) - S*0.5 + cameraPosition.z;
  float y = mod(position.z * 0.55 - uTime*(1.3 + rnd * 1.1), 20.) - 4. + cameraPosition.y;
  vK = step(rnd, uDens) * step(aP2.y, 0.5) * (0.5 + 0.5 * fract(rnd * 13.7));
  if (uOccB.z > 0.) vK *= 1. - step(0.5, texture2D(uIndoor, (vec2(x, z) - uOccB.xy) * uOccB.zw).r) * step(y, 4.6);
  vec4 mv = viewMatrix * vec4(x, y, z, 1.); gl_Position = projectionMatrix * mv;
  gl_PointSize = vK > 0. ? clamp(uPx * (0.07 + 0.07 * fract(rnd * 5.3)) / max(-mv.z, 0.1) * 1000., 1.5, 16. * uPx) : 0.; }`,
  fragmentShader: `precision mediump float; varying float vK; uniform float uAlpha; uniform vec3 uCol; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d) * vK * uAlpha; gl_FragColor = vec4(uCol * a, 0.); }`,
});
const snowPts = new THREE.Points(rainGeo, snowMat); snowPts.frustumCulled = false; snowPts.renderOrder = 11; scene.add(snowPts);

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
  }
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
// Far-detail tiers: a lamp's shadow map only changes when something that moves is within its reach (the city is
// static), so while nothing is, its scheduled refresh is skipped: the map it keeps is the one it would redraw.
// A grace period after the last mover leaves lets that mover's shadow clear on the usual schedule.
const SHADOW_REACH = 34;   // spot shadow camera far (30 m) + a body's size
const _movers = { n: 0, xz: new Float32Array(4096), full: false };
// What moved since last frame: a zombie (they always animate), a drawn item whose matrix or mesh changed, or
// anything that was drawn last frame and is gone now (its old shadow has to be cleared too). Items drawn every
// frame without changing (most props) are not movers.
let _seenA = new Map(), _seenB = new Map();   // matrix array -> { mesh, m16, x, z } (swapped each frame)
let _zA = new Map(), _zB = new Map();         // zombie -> [x, z]
function gatherMovers() {
  let n = 0; const a = _movers.xz, cap = a.length >> 1;
  const add = (x, z) => { if (n < cap) { a[n * 2] = x; a[n * 2 + 1] = z; n++; } };
  _zB.clear();
  for (const z of ZRIG.live) if (z.rig && z.rig.mesh.visible) { add(z.x, z.z); _zB.set(z, [z.x, z.z]); }
  for (const [z, p] of _zA) if (!_zB.has(z)) add(p[0], p[1]);
  [_zA, _zB] = [_zB, _zA];
  _seenB.clear();
  for (let i = 0; i < WORLD_ITEMS.n; i++) {
    const it = WORLD_ITEMS.a[i], m = it.m; let r = _seenA.get(m);
    if (!r) { r = { mesh: it.mesh, m16: new Float32Array(16) }; r.m16.set(m); add(m[12], m[14]); }
    else {
      let moved = r.mesh !== it.mesh; if (!moved) for (let k = 0; k < 16; k++) if (r.m16[k] !== m[k]) { moved = true; break; }
      if (moved) { add(r.m16[12], r.m16[14]); add(m[12], m[14]); r.mesh = it.mesh; r.m16.set(m); }
    }
    _seenB.set(m, r);
  }
  for (const [m, r] of _seenA) if (!_seenB.has(m)) add(r.m16[12], r.m16[14]);
  [_seenA, _seenB] = [_seenB, _seenA];
  _movers.n = n; _movers.full = n >= cap;
}
function spotQuiet(sp, l, cadence) {
  if (!l || DBG.noQuiet) return false;
  if (_movers.full) { sp.dynT = R3.tick; return false; }
  const a = _movers.xz, r2 = SHADOW_REACH * SHADOW_REACH;
  for (let i = 0; i < _movers.n; i++) { const dx = a[i * 2] - l.p[0], dz = a[i * 2 + 1] - l.p[2]; if (dx * dx + dz * dz < r2) { sp.dynT = R3.tick; break; } }
  return R3.tick - sp.dynT > cadence * 2 + 1;   // quiet once no mover has been in reach for two full turns
}
function updateLights3(cam) {
  const T = THEME;
  const fl = 1 + WX.flash * 7; hemi.color.setRGB(T.ambHi[0] * fl, T.ambHi[1] * fl, T.ambHi[2] * fl * 1.1); hemi.groundColor.setRGB(T.ambLo[0], T.ambLo[1], T.ambLo[2]);
  // the sun's shadow box follows the player (snapped so the shadow texels don't swim)
  const sd = _n3(T.sunDir), ox = Math.round(cam[0] / 4) * 4, oz = Math.round(cam[2] / 4) * 4;
  sun.color.setRGB(T.sun[0], T.sun[1], T.sun[2]); sun.position.set(ox + sd[0] * 120, sd[1] * 120, oz + sd[2] * 120); sun.target.position.set(ox, 0, oz);
  sun.shadow.autoUpdate = false;
  // lamps: nearest ones get the spot pool (the first few cast shadows)
  _lampsNear.length = 0; for (const l of nearbyWorld('lights', cam[0], cam[2], 72)) if (l.kind === 'lamp' && d2c(l.p, cam) < 70 * 70) _lampsNear.push(l);
  _lampsNear.sort((a, b) => d2c(a.p, cam) - d2c(b.p, cam));
  R3.tick = (R3.tick + 1) | 0;
  if (FAR.on) gatherMovers();
  const sunCadence = SETTINGS.quality >= 3 ? 1 : PERF.pressure > 0.55 ? 3 : 2;
  if (SHADOW_CACHE.sunX !== ox || SHADOW_CACHE.sunZ !== oz || R3.tick - SHADOW_CACHE.frame >= sunCadence) {
    sun.shadow.needsUpdate = true; SHADOW_CACHE.sunX = ox; SHADOW_CACHE.sunZ = oz; SHADOW_CACHE.frame = R3.tick;
  }
  for (let i = 0; i < SPOTS.length; i++) {
    const sp = SPOTS[i], s = sp.s, l = _lampsNear[i];
    if (sp.lamp !== l) { sp.lamp = l; s.shadow.needsUpdate = true; sp.dynT = R3.tick; }
    // Ultra keeps shadows fresh (3 of every 4 lamps refresh each frame) without forcing every shadow map to redraw
    // in the same frame every frame — that all-at-once cost was compounding with heavy single-frame spikes (e.g. a
    // multi-kill AOE hit) into visible stalls. Lower tiers keep their coarser alternating refresh.
    else { const cadence = SETTINGS.quality >= 3 ? 2 : PERF.pressure > 0.55 ? 4 : 3; if ((i + R3.tick) % cadence === 0 && !(FAR.on && spotQuiet(sp, l, cadence))) s.shadow.needsUpdate = true; }
    if (!l) { s.intensity = 0; continue; }
    s.position.set(l.p[0], l.p[1], l.p[2]); s.target.position.set(l.p[0] + 0.01, 0, l.p[2] + 0.01);
    s.color.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); s.intensity = PL_K * l.r * 1.35; s.distance = l.r + 6;
  }
  // static point lights: the nearest shops, fountain and doorways; then dynamic flashes, arrows, fires...
  _stat.length = 0; for (const l of nearbyWorld('lights', cam[0], cam[2], 58)) if (l.kind !== 'lamp' && d2c(l.p, cam) < 55 * 55) _stat.push(l);
  _stat.sort((a, b) => d2c(a.p, cam) - d2c(b.p, cam));
  _dyn.length = 0; _dynN = 0;
  const dlk = SETTINGS.reduceFlash ? 0.4 : 1; for (const d of DLIGHTS) { const k = d.life / d.max * dlk; dynL(d.p, d.r, d.c[0] * k, d.c[1] * k, d.c[2] * k); }
  for (const a of PROJ) if (!a.stuck && a.type !== 0) { const g = ARROWS[a.type].glow; dynP(a.x, a.y, a.z, 7, g[0] * 0.5, g[1] * 0.5, g[2] * 0.5); }
  for (const f of FIRES) dynP(f.x, 0.6, f.z, 6, 2.2, 0.9, 0.2);
  for (const f of nearbyWorld('fires', cam[0], cam[2], 42)) if ((f.x - cam[0]) * (f.x - cam[0]) + (f.z - cam[2]) * (f.z - cam[2]) < 40 * 40) { const tt = NQU.uTime.value, fl = 0.72 + 0.18 * Math.sin(tt * 17 + f.x) * Math.sin(tt * 7.3 + f.z) + 0.1 * Math.sin(tt * 31 + f.z * 3); dynP(f.x, f.y + 0.6, f.z, 9, 2.2 * fl, 0.95 * fl, 0.25 * fl); }
  for (const z of ZOMBIES) if (z.burn > 0) dynP(z.x, 1.2 * z.scale, z.z, 6, 2, 0.8, 0.15);
  if (GAME.boss && !GAME.boss.dead) dynL(GAME.boss.core, 9, 2.4, 0.4, 2.2);
  for (const p of PICKUPS) { if (p.kind === 'health') dynP(p.x, 1, p.z, 4, 0.3, 1.4, 0.6); else { const g = ARROWS[p.at].glow; dynP(p.x, 1, p.z, 4, g[0] * 0.4, g[1] * 0.4, g[2] * 0.4); } }
  for (let i = 0; i < _dynN; i++) { const e = _dynPool[i]; e.d = d2c(e.p, cam); _dyn.push(e); }
  _dyn.sort(byD);
  let n = 0;
  if (GAME.state !== 'title') { const g = ARROWS[BOW.type].glow; const hl = PL[n++]; setPL(hl, [BOW.handWorld[0] || cam[0], (BOW.handWorld[1] || cam[1]) + 0.25, BOW.handWorld[2] || cam[2]], [g[0] * 0.15 + 0.12, g[1] * 0.15 + 0.1, g[2] * 0.15 + 0.18], 2.2); hl.intensity *= 0.3; }
  const nStat = Math.min(_stat.length, 8);
  for (let i = 0; i < nStat && n < MAX_PL; i++) { const l = _stat[i]; const c = l.kind === 'fountain' ? T.fountain : l.shop ? [l.c[0] * T.shop, l.c[1] * T.shop, l.c[2] * T.shop] : l.c; setPL(PL[n++], l.p, c, l.r); }
  for (const d of _dyn) { if (n >= MAX_PL) break; setPL(PL[n++], d.p, d.c, d.r); }
  for (let i = nStat; i < _stat.length && n < MAX_PL; i++) { const l = _stat[i]; const c = l.kind === 'fountain' ? T.fountain : l.shop ? [l.c[0] * T.shop, l.c[1] * T.shop, l.c[2] * T.shop] : l.c; setPL(PL[n++], l.p, c, l.r); }
  for (; n < MAX_PL; n++) PL[n].intensity = 0;
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
    mesh.userData.streamLap = name === 'far' ? 0 : name === 'near' ? FAR.lap.near : FAR.lap.props;   // 0: the skyline keeps its reach
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = true; scene.add(mesh); WORLD_MESHES.push(mesh);
  }
}

function updateWorldStreaming(cam, force = false) {
  const x = cam[0], z = cam[2];
  if (FAR._lap !== FAR.laptop) { FAR._lap = FAR.laptop; force = true; }   // Laptop toggled: re-resolve every radius now
  if (!force && (x - WORLD_STREAM.x) ** 2 + (z - WORLD_STREAM.z) ** 2 < 12 * 12) return;
  WORLD_STREAM.x = x; WORLD_STREAM.z = z; let active = 0;
  for (const m of WORLD_MESHES) {
    const s = m.geometry.boundingSphere; if (!s) { m.visible = true; active++; continue; } const r = FAR.laptop && m.userData.streamLap ? m.userData.streamLap : m.userData.streamRadius;
    const d2 = (s.center.x - x) ** 2 + (s.center.z - z) ** 2, r0 = m.userData.streamRadius;
    m.visible = d2 <= (r + s.radius) ** 2;
    m.userData.lapHidden = !m.visible && d2 <= (r0 + s.radius) ** 2;   // culled only because of Laptop's shorter reach
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
  if (window.DBG_OCC) console.log('world chunks ms', (performance.now() - t0).toFixed(0));
  buildSigns(); buildDecalPool(); buildLights(); buildVolumes(); buildOcclusion(); buildGlass();
  updateWorldStreaming([PLAYER.x, PLAYER.y, PLAYER.z], true);
  R3.built = true;
}

/* ---------------- shopfront glass: see-through, fresnel-bright at grazing angles, rain-beaded and grimy low down ---------------- */
function buildGlass() {
  if (!WORLD.glass.length) return;
  const gg = new Geo(); for (const q of WORLD.glass) gg.box(q.m, q.c, 0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: NQU.uTime, uFogCol: NQU.uFogCol, uFogDen: NQU.uFogDen, uFogFar: NQU.uFogFar, uRimCol: NQU.uRimCol, uRain: NQU.uRain },
    transparent: true, depthWrite: false, vertexColors: true,
    vertexShader: `varying vec3 vW, vN, vC; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vC = color; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `precision highp float; varying vec3 vW, vN, vC; uniform float uTime, uFogDen, uRain; uniform vec3 uFogCol, uRimCol;
${FOG_GLSL}

${NOISE_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vW), N = normalize(vN); float ndv = abs(dot(N, V));
  float fr = 0.04 + 0.96 * pow(1. - ndv, 5.);
  vec2 fc = abs(N.x) > 0.5 ? vW.zy : vW.xy;
  float beads = smoothstep(0.8, 0.95, vn(fc * vec2(26., 14.))) * (0.3 + uRain * 0.6);
  float runs = smoothstep(0.6, 0.95, vn(vec2(fc.x * 11., fc.y * 0.6 + uTime * 0.25))) * uRain;
  float grime = smoothstep(1.1, 0.0, vW.y) * 0.5 + smoothstep(0.55, 0.8, vn(fc * 1.3)) * 0.25;
  vec3 refl = uFogCol * 2.2 + uRimCol * 0.2 + vec3(0.02);
  vec3 col = vC * 0.04 + refl * (fr + 0.08) + vec3(0.55, 0.6, 0.7) * (beads * 0.07 + runs * 0.06) + vec3(0.05, 0.045, 0.04) * grime;
  float a = clamp(0.07 + fr * 0.75 + grime * 0.25 + beads * 0.06 + runs * 0.06, 0., 0.9);
  float d = length(vW - cameraPosition); col = mix(col, uFogCol, clamp((1. - exp(-NQ_FOGD(d))) * 0.8, 0., 1.));
  gl_FragColor = vec4(col, a);
}` });
  const chunks = spatialChunks(gg.build());
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) fogMat(mat);
    const m = new THREE.Mesh(chunks[i], mat); m.name = 'glass-' + i; m.matrixAutoUpdate = false; m.renderOrder = 3; m.frustumCulled = true; m.userData.streamRadius = 280; m.userData.streamLap = FAR.lap.glass;
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

/* ---------------- environment: one cube capture per district, swapped as you walk ---------------- */
let pmrem = null;
const ENV = { cache: {}, cur: null, job: null, old: null, vis: true, refl: 0 };
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.5, 1200, cubeRT); scene.add(cubeCam);
// Hide what must not be baked into the cube (particles, rain, zombies, instanced batches) for one face render.
function envHide(on) {
  if (on) { ENV.vis = partPoints.visible; partPoints.visible = false; rainLines.visible = false; snowPts.visible = false; ENV.refl = NQU.uReflOn.value; NQU.uReflOn.value = 0; }
  else { partPoints.visible = ENV.vis; rainLines.visible = true; snowPts.visible = true; NQU.uReflOn.value = ENV.refl; }
  for (const z of ZRIG.live) if (z.rig) z.rig.mesh.visible = !on;
  for (const m of BATCHES[0].values()) if (m.im) m.im.visible = on ? false : m.n > 0;
}
function envFace(face) {   // one cube face, exactly as CubeCamera.update renders it
  const prevT = renderer.getRenderTarget(), env = scene.environment; scene.environment = null;
  if (cubeCam.coordinateSystem !== renderer.coordinateSystem) { cubeCam.coordinateSystem = renderer.coordinateSystem; cubeCam.updateCoordinateSystem(); }
  cubeCam.updateMatrixWorld(true);
  envHide(true); if (face === 0) renderer.shadowMap.needsUpdate = true;
  const gm = cubeRT.texture.generateMipmaps; if (face < 5) cubeRT.texture.generateMipmaps = false;   // mips build on the last face
  renderer.setRenderTarget(cubeRT, face); farSuspend(); renderer.render(scene, cubeCam.children[face]); farResume();
  envHide(false); cubeRT.texture.generateMipmaps = gm; renderer.setRenderTarget(prevT); scene.environment = env;
}
function envFinish(d) {
  if (ENV.cache[d.id]) ENV.cache[d.id].dispose();
  ENV.cache[d.id] = pmrem.fromCubemap(cubeRT.texture);
  return ENV.cache[d.id];
}
function captureEnv(d) {   // all six faces in one frame: only when nothing else can be shown yet
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  ENV.job = null; cubeCam.position.set(d.env[0], d.env[1], d.env[2]);
  for (let f = 0; f < 6; f++) envFace(f);
  return envFinish(d);
}
// Crossing into a district not captured yet (Fast / Balanced / Laptop): keep showing the old map, render one face
// per frame, then the PMREM on the seventh frame, so a district boundary never pays for 6 scene renders + a
// convolution at once. Faces after the first see the shadow maps of later frames, so a nearby zombie's shadow can
// fade into the ambient light a little; Sharp and Ultra keep the one-frame capture untouched.
function updateEnv(cam) {
  if (ENV_DIRTY) {   // new Look: every capture is stale. Keep the one on screen alive until its replacement is ready.
    for (const k in ENV.cache) if (ENV.cache[k].texture !== scene.environment) ENV.cache[k].dispose(); else ENV.old = ENV.cache[k];
    ENV.cache = {}; ENV.job = null; ENV_DIRTY = false;
  }
  const d = districtAt(cam[0], cam[2]);
  let rt = ENV.cache[d.id];
  if (!rt) {
    if (!scene.environment || !FAR.on) rt = captureEnv(d);   // first frame, or Sharp / Ultra: one frame, exactly as before
    else {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      if (!ENV.job || ENV.job.d !== d) { ENV.job = { d, face: 0 }; cubeCam.position.set(d.env[0], d.env[1], d.env[2]); }
      if (ENV.job.face < 6) envFace(ENV.job.face++);
      else { ENV.job = null; rt = envFinish(d); }
    }
  }
  if (rt && scene.environment !== rt.texture) {
    scene.environment = rt.texture;
    if (ENV.old && ENV.old !== rt) { ENV.old.dispose(); ENV.old = null; }
  }
}

/* ---------------- light you can see: cones under lamps, halos round bulbs ---------------- */
const VOL_U = { uLamp: { value: new THREE.Color() }, uVolK: { value: 1 } };
const coneMat = new THREE.ShaderMaterial({
  uniforms: Object.assign({ uTime: NQU.uTime, uFogCol: NQU.uFogCol, uFogDen: NQU.uFogDen, uFogFar: NQU.uFogFar }, VOL_U),
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `varying vec3 vW, vN; varying float vH; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vH = uv.y; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `precision highp float; varying vec3 vW, vN; varying float vH; uniform vec3 uLamp; uniform float uVolK, uTime, uFogDen; uniform vec3 uFogCol;
${FOG_GLSL}

${NOISE_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float facing = pow(abs(dot(normalize(vN), V)), 1.6);
  float h = clamp(vH, 0., 1.);   // MSAA samples can land just outside the triangle: pow() of a negative is NaN on D3D
  float fall = pow(h, 1.8) * (0.25 + 0.75 * smoothstep(0.0, 0.25, h));
  float streaks = 0.65 + 0.35 * vn(vec2(atan(vN.z, vN.x + 1e-5) * 9., vW.y * 1.4 + uTime * 9.));
  float d = length(vW - cameraPosition);
  float near = smoothstep(0.5, 3.0, d);
  vec3 c = uLamp * facing * fall * streaks * 0.1 * uVolK * near * exp(-NQ_FOGD(d) * 0.5);
  gl_FragColor = vec4(c, 0.);
}` });
const CONES = [];
const HALOS = [];
function buildVolumes() {
  fogMat(coneMat);
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
    scene.add(m); CONES.push(m);
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uFogCol: NQU.uFogCol, uFogDen: NQU.uFogDen, uFogFar: NQU.uFogFar }, VOL_U), transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `attribute vec4 hp; attribute vec3 hc; uniform vec3 uLamp; varying vec2 vUv; varying vec3 vC; varying float vD;
void main(){ vec4 c = viewMatrix * vec4(hp.xyz, 1.); vD = -c.z; c.xy += position.xy * hp.w; c.z += hp.w * 0.4; vUv = uv; vC = hc.x < 0. ? uLamp * 0.35 : hc; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `precision mediump float; varying vec2 vUv; varying vec3 vC; varying float vD; uniform float uVolK, uFogDen;
${FOG_GLSL}

void main(){ float r = length(vUv - 0.5) * 2.; float a = exp(-r * r * 5.) * (1. - r) * smoothstep(0.3, 2.5, vD); gl_FragColor = vec4(vC * max(a, 0.) * 0.35 * uVolK * exp(-NQ_FOGD(vD) * 0.4), 0.); }` });
  // all halos in one instanced draw: additive (order-free) camera-facing quads, a few hundred of them
  const quad = new THREE.PlaneGeometry(1, 1);
  for (const H of WORLD.halos.length ? [WORLD.halos] : []) {
    const n = H.length, geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
    const pos = new Float32Array(n * 4), col = new Float32Array(n * 3); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    H.forEach((h, i) => { pos.set([h.p[0], h.p[1], h.p[2], h.s], i * 4); col.set(h.c, i * 3); x0 = Math.min(x0, h.p[0] - h.s); x1 = Math.max(x1, h.p[0] + h.s); y0 = Math.min(y0, h.p[1] - h.s); y1 = Math.max(y1, h.p[1] + h.s); z0 = Math.min(z0, h.p[2] - h.s); z1 = Math.max(z1, h.p[2] + h.s); });
    geo.setAttribute('hp', new THREE.InstancedBufferAttribute(pos, 4)); geo.setAttribute('hc', new THREE.InstancedBufferAttribute(col, 3)); geo.instanceCount = n;
    const center = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); geo.boundingSphere = new THREE.Sphere(center, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
    fogMat(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = true; mesh.renderOrder = 9; scene.add(mesh); HALOS.push(mesh);
  }
}

/* ---------------- wet-street reflections: the scene mirrored in y, at half resolution ---------------- */
const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera(); reflCam.matrixAutoUpdate = false; reflCam.matrixWorldAutoUpdate = false;
const _S = new THREE.Matrix4().makeScale(1, -1, 1);
const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK_TEX.needsUpdate = true;
const REFL_CACHE = { valid: false, frame: 0, matrix: new THREE.Matrix4(), quality: -1, w: 0, h: 0 };
NQU.uRefl.value = BLACK_TEX;
function renderReflection(r) {
  const k = SETTINGS.quality >= 2 ? 1 : 0.7, W = Math.max(4, Math.round(R3.W * k)), H = Math.max(4, Math.round(R3.H * k));   // sharper mirror on High
  const resized = reflRT.width !== W || reflRT.height !== H;
  if (resized) { reflRT.setSize(W, H); REFL_CACHE.valid = false; }
  const cm = camera.matrixWorld.elements, pm = REFL_CACHE.matrix.elements;
  const dx = cm[12] - pm[12], dy = cm[13] - pm[13], dz = cm[14] - pm[14];
  const movedFar = dx * dx + dy * dy + dz * dz > 16;
  const turnedFar = Math.abs(cm[0] - pm[0]) + Math.abs(cm[2] - pm[2]) + Math.abs(cm[8] - pm[8]) + Math.abs(cm[10] - pm[10]) > 0.7;
  const cadence = SETTINGS.quality >= 3 ? 1 : PERF.pressure > 0.55 ? 3 : 2;   // reuse more only while the frame budget is under pressure
  const stale = R3.tick - REFL_CACHE.frame >= cadence;
  const refresh = !REFL_CACHE.valid || REFL_CACHE.quality !== SETTINGS.quality || movedFar || turnedFar || stale;
  if (!refresh) { NQU.uRefl.value = reflRT.texture; NQU.uReflOn.value = 1; NQU.uRes.value.set(R3.W, R3.H); return; }
  reflCam.projectionMatrix.copy(camera.projectionMatrix); reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  reflCam.matrixWorld.copy(_S).multiply(camera.matrixWorld).multiply(_S); reflCam.matrixWorldInverse.copy(reflCam.matrixWorld).invert();
  NQU.uReflOn.value = 0; NQU.uRefl.value = BLACK_TEX;
  const f = THEME.fog; r.setRenderTarget(reflRT); r.setClearColor(new THREE.Color(f[0], f[1], f[2]), 1); r.clear(true, true, false);
  const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.needsUpdate = false;
  partPoints.visible = false; rainLines.visible = false; snowPts.visible = false;
  const decalVis = DECAL_POOL.map(m => m.visible); for (const m of DECAL_POOL) m.visible = false;
  const hiddenRigs = [];
  for (const z of ZRIG.live) if (z.rig && (z.dead || (z.x - PLAYER.x) ** 2 + (z.z - PLAYER.z) ** 2 > 10000)) { if (z.rig.mesh.visible) hiddenRigs.push(z.rig.mesh); z.rig.mesh.visible = false; }
  farSuspend(); r.render(scene, reflCam); farResume();
  for (const m of hiddenRigs) m.visible = true; for (let i = 0; i < DECAL_POOL.length; i++) DECAL_POOL[i].visible = decalVis[i];
  partPoints.visible = true; rainLines.visible = true; snowPts.visible = true;
  NQU.uRefl.value = reflRT.texture; NQU.uReflOn.value = 1; NQU.uRes.value.set(R3.W, R3.H);
  REFL_CACHE.valid = true; REFL_CACHE.frame = R3.tick; REFL_CACHE.matrix.copy(camera.matrixWorld);
  REFL_CACHE.quality = SETTINGS.quality; REFL_CACHE.w = W; REFL_CACHE.h = H;
}

/* ---------------- post: passes ---------------- */
// Anti-aliasing lives in its own multisampled target that is copied into the (plain) composer buffer:
// some GPUs (ANGLE / D3D) output pure black when the bloom pass writes back into a multisampled buffer.
let msRT = null;
const copyMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  // also drops any NaN / Inf pixel: bloom would smear a single one across the whole frame
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; void main(){ vec4 c = texture2D(tDiffuse, vUv); bool ok = c.r >= 0. && c.r < 6e4 && c.g >= 0. && c.g < 6e4 && c.b >= 0. && c.b < 6e4; gl_FragColor = ok ? c : vec4(0., 0., 0., 1.); }` });
const copyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMat); copyQuad.frustumCulled = false;
const copyScene = new THREE.Scene(); copyScene.add(copyQuad); const copyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
class ScenePass extends Pass {
  constructor(cam, first) { super(); this.cam = cam; this.first = first; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    const out = this.renderToScreen ? null : readBuffer;
    if (this.first) {
      if (SETTINGS.quality >= 1 && THEME.wet > 0.2) renderReflection(r); else { NQU.uReflOn.value = 0; NQU.uRefl.value = BLACK_TEX; }
      const tgt = msRT || out;
      r.setRenderTarget(tgt);
      const f = THEME.fog; r.setClearColor(new THREE.Color(f[0], f[1], f[2]), 1); r.clear(true, true, false); renderer.shadowMap.needsUpdate = true;
      r.render(scene, this.cam);
      if (msRT) {
        if (this.withVM) { r.clearDepth(); r.render(scene, vmCamera); }
        copyMat.uniforms.tDiffuse.value = msRT.texture; r.setRenderTarget(out); r.render(copyScene, copyCam);
      }
      return;
    }
    r.setRenderTarget(out); r.clearDepth();
    r.render(scene, this.cam);
  }
}
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDmg: { value: 0 }, uLow: { value: 0 }, uExpo: { value: 1 }, uAberr: { value: 0 }, uSharp: { value: 0.3 }, uSat: { value: 1 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2(1, 1) }, uFocus: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uDmg, uLow, uExpo, uAberr, uSat, uFocus, uSharp; uniform vec3 uGrade, uLift; uniform vec2 uRes;
${NOISE_GLSL}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
void main(){
  vec2 uv = vUv; vec2 cc = uv-0.5; float r2 = dot(cc,cc);
  float ab = (0.0015 + uDmg*0.006 + uAberr)*r2*4.;
  vec3 c; c.r = texture2D(tDiffuse, uv+cc*ab).r; c.g = texture2D(tDiffuse, uv).g; c.b = texture2D(tDiffuse, uv-cc*ab).b;
  {   // contrast-adaptive sharpen: pulls back the softness of MSAA + upscaling, eased off on already-contrasty edges
    vec2 px = 1. / uRes; vec3 n = texture2D(tDiffuse, uv + vec2(0., px.y)).rgb, s = texture2D(tDiffuse, uv - vec2(0., px.y)).rgb, e = texture2D(tDiffuse, uv + vec2(px.x, 0.)).rgb, w = texture2D(tDiffuse, uv - vec2(px.x, 0.)).rgb;
    vec3 mn = min(min(min(n, s), min(e, w)), c), mx = max(max(max(n, s), max(e, w)), c);
    vec3 amp = sqrt(clamp(min(mn, 2. - mx) / max(mx, 1e-4), 0., 1.)) * uSharp;
    c = max((c + (n + s + e + w) * -amp * 0.25) / (1. - amp), 0.);
  }
  if (uFocus > 0.001) {   // aiming: the edges of the frame soften, the target stays crisp
    float k = uFocus * smoothstep(0.02, 0.2, r2); vec3 acc = c; float wsum = 1.;
    for (int i = 1; i <= 6; i++) { float t = float(i) / 6.; vec2 o = cc * t * 0.014 * k; float w = 1. - t * 0.5; acc += texture2D(tDiffuse, uv - o).rgb * w + texture2D(tDiffuse, uv + o * 0.5).rgb * w * 0.5; wsum += w * 1.5; }
    c = mix(c, acc / wsum, clamp(k * 2., 0., 0.85));
  }
  c *= uExpo;
  float lum = dot(c, vec3(0.3,0.59,0.11));
  c = mix(c, vec3(lum)*vec3(1.1,0.9,0.9), uLow*0.55);
  c = aces(c);
  c *= uGrade; float lm = dot(c, vec3(0.3,0.59,0.11)); c = mix(vec3(lm), c, uSat); c += uLift*(1.-c);
  c = pow(clamp(c,0.,1.), vec3(1./2.2));
  c = mix(c, c * c * (3. - 2. * c), 0.42);   // S-curve: deeper blacks, punchier neon
  { float l2 = dot(c, vec3(0.3, 0.59, 0.11)); c = max(mix(vec3(l2), c, 1.18), 0.); c *= 1. - 0.35 * smoothstep(0.12, 0.0, l2); }   // richer colour, crushed shadows
  float vig = smoothstep(0.85,0.2,sqrt(r2)*1.25); c *= mix(0.72,1.,vig);
  float edge = smoothstep(0.25,0.75,sqrt(r2)*1.4);
  c = mix(c, vec3(0.75,0.02,0.08), edge*clamp(uDmg,0.,1.)*0.75);
  c = mix(c, vec3(0.5,0.0,0.05), edge*uLow*(0.25+0.2*sin(uTime*6.)));
  c += (h21(uv*uRes+fract(uTime)*100.)-0.5)*0.014;
  gl_FragColor = vec4(c,1.);
}`,
};
let composer = null, worldPass, gtaoPass, vmPass, bloomPass, gradePass;
/* ---- GPU profiler (?prof=1): per-pass GPU time via EXT_disjoint_timer_query_webgl2, plus draw calls / triangles ---- */
const PROF = { on: false, ext: null, gl: null, pending: [], free: [], acc: {}, cpu: 0, n: 0, el: null, t: 0 };
try { PROF.on = new URLSearchParams(location.search).has('prof'); } catch (e) { }
if (PROF.on) {
  PROF.gl = renderer.getContext(); PROF.ext = PROF.gl.getExtension('EXT_disjoint_timer_query_webgl2'); renderer.info.autoReset = false;
  PROF.el = document.createElement('pre');
  Object.assign(PROF.el.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: 99, margin: 0, padding: '6px 9px', font: '11px/1.35 monospace', color: '#bff6ff', background: 'rgba(0,0,0,0.72)', pointerEvents: 'none', whiteSpace: 'pre' });
  document.body.appendChild(PROF.el);
}
function profBegin(name) { if (!PROF.ext) return; const gl = PROF.gl, q = PROF.free.pop() || gl.createQuery(); gl.beginQuery(PROF.ext.TIME_ELAPSED_EXT, q); PROF.pending.push({ name, q }); }
function profEnd() { if (PROF.ext) PROF.gl.endQuery(PROF.ext.TIME_ELAPSED_EXT); }
function profPoll() {
  if (!PROF.ext) return; const gl = PROF.gl, dis = gl.getParameter(PROF.ext.GPU_DISJOINT_EXT);
  while (PROF.pending.length) { const p = PROF.pending[0]; if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break; PROF.pending.shift();
    const ms = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6; PROF.free.push(p.q); if (dis) continue; const a = PROF.acc[p.name] || (PROF.acc[p.name] = { s: 0, n: 0 }); a.s += ms; a.n++; }
}
function profInstrument() {
  if (!PROF.on) return;
  const names = new Map([[worldPass, 'world+shadows'], [gtaoPass, 'gtao'], [vmPass, 'bow'], [bloomPass, 'bloom'], [gradePass, 'grade']]);
  for (const p of composer.passes) { if (p._prof) continue; const orig = p.render.bind(p), nm = names.get(p) || p.constructor.name; p.render = (...a) => { profBegin(nm); orig(...a); profEnd(); }; p._prof = true; }
}
function profFrame(cpuMs) {
  if (!PROF.on) return; profPoll(); PROF.cpu += cpuMs; PROF.n++;
  const inf = renderer.info.render; PROF.calls = inf.calls; PROF.tris = inf.triangles; renderer.info.reset();   // per-frame totals across every pass
  if (performance.now() - PROF.t < 500) return; PROF.t = performance.now();
  let gpu = 0, lines = [];
  for (const [k, a] of Object.entries(PROF.acc)) { const m = a.s / Math.max(1, a.n); gpu += m; lines.push(`  ${k.padEnd(14)} ${m.toFixed(2)} ms`); a.s = 0; a.n = 0; }
  const alive = ZOMBIES.filter(z => !z.dead).length;
  PROF.el.textContent = `GPU ${PROF.ext ? gpu.toFixed(2) + ' ms' : 'timer ext unavailable'}\n${lines.join('\n')}\nCPU frame ${(PROF.cpu / PROF.n).toFixed(2)} ms\ncalls ${PROF.calls}  tris ${(PROF.tris / 1e6).toFixed(2)}M\nzombies ${alive}  chunks ${WORLD_STREAM.active}/${WORLD_MESHES.length}  quality ${['Low', 'Balanced', 'High', 'Ultra'][SETTINGS.quality]}${SETTINGS.quality >= 1 ? '  textures ' + ULTRA.state + ' ' + (ULTRA.res || '') : ''}`;
  PROF.cpu = 0; PROF.n = 0;
}
function buildComposer(W, H, q) {
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); if (gtaoPass) gtaoPass.dispose(); bloomPass.dispose(); }
  if (msRT) { msRT.dispose(); msRT = null; }
  if (q >= 1) msRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(1);
  worldPass = new ScenePass(camera, true); composer.addPass(worldPass);
  gtaoPass = null;
  // (Low..High: ambient occlusion comes from the baked occlusion map, at no per-frame cost)
  if (q >= 3) {   // Ultra: real-time GTAO on top, for contact shadows at feet, corners, under cars and between bodies
    gtaoPass = new GTAOPass(scene, camera, W, H);
    gtaoPass.output = GTAOPass.OUTPUT.Default; gtaoPass.blendIntensity = 0.85;
    gtaoPass.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    // glass, glows, signs and anything else see-through must not cast fake occlusion
    const hideT = gtaoPass._overrideVisibility.bind(gtaoPass);
    gtaoPass._overrideVisibility = function () { hideT(); this.scene.traverse((o) => { if (o.visible && o.material && (o.material.transparent || o.material.blending === THREE.AdditiveBlending)) { o.visible = false; this._visibilityCache.push(o); } }); };
    composer.addPass(gtaoPass);
  }
  vmPass = new ScenePass(vmCamera, false); composer.addPass(vmPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.55, 1.0); composer.addPass(bloomPass);
  gradePass = new ShaderPass(GradeShader); composer.addPass(gradePass);
  composer.setSize(W, H); profInstrument();
  R3.quality = q; R3.W = W; R3.H = H;
}
/* ---- surface textures: CC0 texture arrays, loaded on demand. Balanced gets the half-res set, High and Ultra the full one; Fast none ---- */
const ULTRA = { state: 'none', res: null };
const wantTexRes = (q) => q >= 2 ? 'full' : q >= 1 ? 'half' : null;
function loadUltraTextures(res) {
  if (ULTRA.state === 'loading' || ULTRA.res === res) return; ULTRA.state = 'loading';
  const sfx = res === 'half' ? '_half' : '';
  const load = (n) => new Promise((ok, rej) => { const im = new Image(); im.onload = () => ok(im); im.onerror = rej; im.src = 'textures/' + n + sfx + '.jpg?v=' + TEX_VER; });
  Promise.all(['albedo', 'normal', 'orm'].map(load)).then((ims) => {
    const arr = ims.map((im) => {
      const w = im.width, H = im.height, h = H / TEX_LAYERS.length;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
      const src = cx.getImageData(0, 0, w, H).data, d = new Uint8Array(src.length), row = w * 4;
      for (let L = 0; L < TEX_LAYERS.length; L++) for (let y = 0; y < h; y++) d.set(src.subarray((L * h + y) * row, (L * h + y + 1) * row), (L * h + (h - 1 - y)) * row);   // GL rows run bottom-up
      const t = new THREE.DataArrayTexture(d, w, h, TEX_LAYERS.length);
      t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true;
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
    for (const u of [NQU.uTexA, NQU.uTexN, NQU.uTexR]) if (u.value) u.value.dispose();   // swapping half <-> full
    NQU.uTexA.value = A.t; NQU.uTexN.value = N.t; NQU.uTexR.value = O.t;
    ULTRA.state = 'ready'; ULTRA.res = res; NQU.uTexOn.value = wantTexRes(SETTINGS.quality) ? 1 : 0;
    const w = wantTexRes(SETTINGS.quality); if (w && w !== res) loadUltraTextures(w);   // quality changed while loading
  }).catch((e) => { ULTRA.state = NQU.uTexA.value ? 'ready' : 'failed'; console.warn('surface textures failed to load', e); });
}
function applyQuality3(q) {
  const tr = wantTexRes(q); if (tr) loadUltraTextures(tr);
  NQU.uTexOn.value = tr && NQU.uTexA.value ? 1 : 0;
  // Ultra shadows: the moon/sun map at 4x the texels over a wider box; lamp shadows at 2x, all six lamps casting
  const U = q >= 3, sm = U ? 4096 : 2048, box = U ? 80 : 52;
  if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box }); sun.shadow.camera.updateProjectionMatrix();
  SPOTS.forEach((sp, i) => { const ms = U ? 2048 : 1024; sp.shadow = i < (U ? N_SPOTS : N_SHADOW_SPOTS); if (sp.s.shadow.mapSize.x !== ms) { sp.s.shadow.mapSize.set(ms, ms); if (sp.s.shadow.map) { sp.s.shadow.map.dispose(); sp.s.shadow.map = null; } } sp.s.shadow.needsUpdate = true; });
  const sh = q >= 1;
  sun.castShadow = sh; for (const { s, shadow } of SPOTS) s.castShadow = sh && shadow;
}

/* ---------------- shader warm-up: compile every program at load, not on first use in play ---------------- */
// Scene passes draw into render targets, whose program keys differ from the screen's, so compile against one.
// Materials that may have no object yet (the bow viewmodel, instanced items) get a throwaway stand-in mesh.
function warmShaders() {
  const t0 = performance.now(), before = renderer.info.programs.length;
  const g = new THREE.BufferGeometry(), n = 3;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('nqm', new THREE.BufferAttribute(new Float32Array(6), 2));
  for (const [k, w] of [['iTint', 4], ['iEmit', 3], ['iSkin', 3]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(w), w));
  const stand = [new THREE.Mesh(g, MAT.static), new THREE.InstancedMesh(g, MAT.inst, 1), new THREE.InstancedMesh(g, MAT.vm, 1)];
  stand[1].castShadow = stand[1].receiveShadow = true; stand[2].layers.set(LAYER_VM);
  for (const m of stand) { m.frustumCulled = false; scene.add(m); }
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(msRT || (composer && composer.readBuffer) || null);
    renderer.compile(scene, camera); renderer.compile(scene, vmCamera);
  } catch (e) { console.warn('shader warm-up', e); }
  finally { renderer.setRenderTarget(prev); for (const m of stand) scene.remove(m); g.dispose(); }
  R3.warm = { programs: renderer.info.programs.length - before, ms: Math.round(performance.now() - t0) };
}

/* ---------------- per-frame sync + render ---------------- */
function render3(time, W, H, fov, cam) {
  if (!composer || R3.quality !== SETTINGS.quality) { buildComposer(W, H, SETTINGS.quality); applyQuality3(SETTINGS.quality); }
  if (R3.W !== W || R3.H !== H) { renderer.setSize(W, H, false); composer.setSize(W, H); if (msRT) msRT.setSize(W, H); R3.W = W; R3.H = H; }
  if (canvas.width !== W || canvas.height !== H) renderer.setSize(W, H, false);
  syncFar();
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
  NQU.uAirK.value = SETTINGS.quality === 0 ? 0 : 0.0078 * (0.6 + T.rain * (0.3 + rk + sk * 1.2)) * (T.airK !== undefined ? T.airK : 1);
  VOL_U.uLamp.value.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); VOL_U.uVolK.value = (0.35 + T.rain * (0.3 + rk + sk * 0.8)) * (SETTINGS.quality === 0 ? 0.6 : 1);
  if (WX.flash > 0) { const f = WX.flash * (0.6 + 0.4 * Math.random()); SKY_U.uCloud.value.setRGB(T.cloud[0] + f * 0.6, T.cloud[1] + f * 0.62, T.cloud[2] + f * 0.75); SKY_U.uMid.value.setRGB(T.mid[0] + f * 0.25, T.mid[1] + f * 0.26, T.mid[2] + f * 0.32); }
  updateLights3(cam);
  // dynamic geometry
  flushList(WORLD_ITEMS, false); flushList(VM_ITEMS, true);
  partBuf.needsUpdate = true; partBuf.updateRanges.length = 0; partBuf.addUpdateRange(0, Math.max(1, PART.n) * 8); partGeo.setDrawRange(0, PART.n);
  partMat.uniforms.uH.value = H / (2 * Math.tan(fov * Math.PI / 360));
  syncDecals();
  updateEnv(cam);
  // post
  const U = gradePass.uniforms;
  U.uTime.value = time; U.uDmg.value = PLAYER.dmgFlash; U.uLow.value = GAME.state === 'playing' || GAME.state === 'over' ? clamp(1 - PLAYER.hp / PLAYER.maxHp / 0.35, 0, 1) : 0;
  U.uExpo.value = T.expo * (1 + WX.flash * 0.9); U.uSat.value = T.sat; U.uGrade.value.set(...T.grade); U.uLift.value.set(...T.lift); U.uAberr.value = BOW.state === 'drawing' && !SETTINGS.reduceFlash ? BOW.draw * 0.002 : 0; U.uFocus.value = GAME.state === 'playing' && BOW.state === 'drawing' ? easeOut(BOW.draw) : 0; U.uRes.value.set(W, H); U.uSharp.value = SETTINGS.quality === 0 ? 0.2 : SETTINGS.quality >= 2 ? 0.45 : 0.35;
  bloomPass.strength = T.bloom * (T.bloomK || 0.32) * 1.2; bloomPass.threshold = T.thr; bloomPass.radius = T.bloomR || 0.3;
  const vmOn = VM_ITEMS.n > 0 && !DBG.noVM;
  worldPass.withVM = vmOn && !!msRT && !gtaoPass;       // no AO pass in between: draw the bow into the anti-aliased buffer too
  vmPass.enabled = vmOn && !worldPass.withVM;
  // Scene matrices: one update per frame, not one per scene render (reflection, world, bow, GTAO each re-ran it).
  // The scene root never moves, so it no longer forces every static object's world matrix to be recomputed either;
  // only objects that auto-update (or were flagged) are refreshed.
  scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false;
  try { composer.render(); } finally { scene.matrixWorldAutoUpdate = true; }
}
