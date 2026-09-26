/* ============================================================
   three.js scene graph + frame pipeline
   world pass (MSAA, baked occlusion) -> viewmodel pass -> bloom -> grade
   ============================================================ */
const MAX_PL = 16;             // point-light pool (static shop/fountain lights + dynamic flashes)
const R3 = { W: 0, H: 0, quality: -1, envDirty: true, built: false, tick: 0 };
var ENV_DIRTY = true;
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
    if (b.n) { b.im.instanceMatrix.needsUpdate = true; const g = b.im.geometry; g.attributes.iTint.needsUpdate = g.attributes.iEmit.needsUpdate = g.attributes.iSkin.needsUpdate = true; }
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
const SIGN_VS = `varying vec2 vUV; varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vUV = uv; gl_Position = projectionMatrix*viewMatrix*w; }`;
const SIGN_FS = `precision highp float; varying vec2 vUV; varying vec3 vW; uniform sampler2D uTex; uniform vec3 uCol; uniform float uTime, uMode, uSeed, uA, uFogDen; uniform vec3 uFogCol;
${NOISE_GLSL}
void main(){
  vec2 uv = vUV; float flick = 1.;
  if (uMode > 0.5) { float row = floor((1.-uv.y)*24.); float g = step(0.93, h21(vec2(row, floor(uTime*6.)+uSeed))); uv.x += g*(h21(vec2(row,uTime))-0.5)*0.08; flick = 0.8+0.2*sin(uv.y*300.+uTime*20.); }
  else flick = 1. - step(0.985, h21(vec2(floor(uTime*9.), uSeed)))*0.85;
  vec4 t = texture2D(uTex, uv);
  vec3 c = t.rgb*uCol*flick;
  float d = length(vW - cameraPosition); c = mix(c, uFogCol, clamp((1.-exp(-d*uFogDen))*0.8, 0., 1.));
  gl_FragColor = vec4(c, t.a*uA);
}`;
const SIGNS = [];
function buildSigns() {
  for (const s of WORLD.signs) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: s.tex }, uCol: { value: new THREE.Color() }, uTime: NQU.uTime, uMode: { value: s.mode }, uSeed: { value: s.seed }, uA: { value: 1 }, uFogDen: NQU.uFogDen, uFogCol: NQU.uFogCol },
      vertexShader: SIGN_VS, fragmentShader: SIGN_FS, transparent: s.add, depthWrite: !s.add, blending: s.add ? THREE.AdditiveBlending : THREE.NoBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(PLANE, mat); m.matrixAutoUpdate = false; m.matrix.fromArray(s.m); m.matrixWorldNeedsUpdate = true; m.renderOrder = s.add ? 5 : 0;
    scene.add(m); SIGNS.push({ s, m });
  }
}
const DECAL_POOL = [];
function buildDecalPool() {
  for (let i = 0; i < 90; i++) {
    const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: DECAL_TEX[0] }, uCol: { value: new THREE.Color(1, 1, 1) }, uTime: NQU.uTime, uMode: { value: 0 }, uSeed: { value: 0 }, uA: { value: 1 }, uFogDen: NQU.uFogDen, uFogCol: NQU.uFogCol },
      vertexShader: SIGN_VS, fragmentShader: SIGN_FS.replace('flick = 1. - step(0.985', 'flick = 1. - 0.0*step(0.985'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(PLANE, mat); m.matrixAutoUpdate = false; m.visible = false; m.renderOrder = 2; m.receiveShadow = false;
    scene.add(m); DECAL_POOL.push(m);
  }
}
function syncDecals() {
  for (let i = 0; i < DECAL_POOL.length; i++) {
    const m = DECAL_POOL[i], d = DECALS[i];
    if (!d) { m.visible = false; continue; }
    const a = Math.min(1, d.t * 6) * (d.t > 38 ? Math.max(0, 1 - (d.t - 38) / 7) : 1);
    M4.trs(m.matrix.elements, d.x, 0.035, d.z, -Math.PI / 2, d.rot, 0, d.r * 2, d.r * 2, 1); m.matrixWorldNeedsUpdate = true;
    m.material.uniforms.uTex.value = DECAL_TEX[d.v]; m.material.uniforms.uA.value = a * 0.92; m.visible = true;
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
  uniforms: { uTime: NQU.uTime, uAlpha: { value: 0.5 }, uRainCol: { value: new THREE.Color() } }, transparent: true, depthWrite: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `attribute vec2 aP2; uniform float uTime; varying float vA, vK;
void main(){ float S = 50.;
  float x = mod(position.x - cameraPosition.x, S) - S*0.5 + cameraPosition.x;
  float z = mod(position.y - cameraPosition.z, S) - S*0.5 + cameraPosition.z;
  float y = mod(position.z - uTime*(24.+aP2.x*8.), 36.) - 6. + cameraPosition.y;
  // the downpour comes and goes: slow heavy/light spells, drifting patches, gusts that swing the slant
  float spell = 0.5 + 0.5 * sin(uTime * 0.21) * sin(uTime * 0.067 + 1.3);
  float patchD = 0.5 + 0.5 * sin(x * 0.09 + uTime * 0.35) * sin(z * 0.075 - uTime * 0.27);
  float dens = clamp(0.2 + 0.7 * spell + 0.45 * (patchD - 0.5), 0.12, 1.);
  float rnd = fract(aP2.x * 7.31 + position.x * 0.137 + position.y * 0.071);
  vK = step(rnd, dens) * (0.45 + 0.8 * fract(rnd * 13.7));
  float wind = 0.08 + 0.32 * spell + 0.12 * sin(uTime * 1.3 + position.y * 0.21), len = 0.9 * (0.55 + 0.9 * fract(rnd * 5.3));
  vec3 p = vec3(x + aP2.y * wind * len * 2., y + aP2.y * len, z + aP2.y * 0.05); vA = aP2.y;
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
  fragmentShader: `precision mediump float; varying float vA, vK; uniform float uAlpha; uniform vec3 uRainCol; void main(){ gl_FragColor = vec4(uRainCol*uAlpha*(0.3+vA*0.7)*vK, 0.); }`,
});
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; rainLines.renderOrder = 11; scene.add(rainLines);

/* ---------------- lights ---------------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, Math.PI); hemi.layers.enableAll(); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, Math.PI); sun.layers.enableAll(); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
const PL = [];
for (let i = 0; i < MAX_PL; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1); l.layers.enableAll(); scene.add(l); PL.push(l); }
const SPOTS = [];      // pool of spot lights parked on the nearest street lamps / floodlights
const N_SPOTS = 6, N_SHADOW_SPOTS = 4;
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
const d2c = (p, cam) => (p[0] - cam[0]) * (p[0] - cam[0]) + (p[2] - cam[2]) * (p[2] - cam[2]);
function updateLights3(cam) {
  const T = THEME;
  hemi.color.setRGB(T.ambHi[0], T.ambHi[1], T.ambHi[2]); hemi.groundColor.setRGB(T.ambLo[0], T.ambLo[1], T.ambLo[2]);
  // the sun's shadow box follows the player (snapped so the shadow texels don't swim)
  const sd = _n3(T.sunDir), ox = Math.round(cam[0] / 4) * 4, oz = Math.round(cam[2] / 4) * 4;
  sun.color.setRGB(T.sun[0], T.sun[1], T.sun[2]); sun.position.set(ox + sd[0] * 120, sd[1] * 120, oz + sd[2] * 120); sun.target.position.set(ox, 0, oz);
  // lamps: nearest ones get the spot pool (the first few cast shadows)
  _lampsNear.length = 0; for (const l of WORLD.lights) if (l.kind === 'lamp' && d2c(l.p, cam) < 70 * 70) _lampsNear.push(l);
  _lampsNear.sort((a, b) => d2c(a.p, cam) - d2c(b.p, cam));
  R3.tick = (R3.tick + 1) | 0;
  for (let i = 0; i < SPOTS.length; i++) {
    const sp = SPOTS[i], s = sp.s, l = _lampsNear[i];
    if (sp.lamp !== l) { sp.lamp = l; s.shadow.needsUpdate = true; }
    else if ((i + R3.tick) % 2 === 0) s.shadow.needsUpdate = true;
    if (!l) { s.intensity = 0; continue; }
    s.position.set(l.p[0], l.p[1], l.p[2]); s.target.position.set(l.p[0] + 0.01, 0, l.p[2] + 0.01);
    s.color.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); s.intensity = PL_K * l.r * 1.35; s.distance = l.r + 6;
  }
  // static point lights: the nearest shops, fountain and doorways; then dynamic flashes, arrows, fires...
  _stat.length = 0; for (const l of WORLD.lights) if (l.kind !== 'lamp' && d2c(l.p, cam) < 55 * 55) _stat.push(l);
  _stat.sort((a, b) => d2c(a.p, cam) - d2c(b.p, cam));
  _dyn.length = 0;
  for (const d of DLIGHTS) { const k = d.life / d.max; _dyn.push({ p: d.p, r: d.r, c: [d.c[0] * k, d.c[1] * k, d.c[2] * k] }); }
  for (const a of PROJ) if (!a.stuck && a.type !== 0) _dyn.push({ p: [a.x, a.y, a.z], r: 7, c: ARROWS[a.type].glow.map(v => v * 0.5) });
  for (const f of FIRES) _dyn.push({ p: [f.x, 0.6, f.z], r: 6, c: [2.2, 0.9, 0.2] });
  for (const f of WORLD.fires) if (d2c([f.x, 0, f.z], cam) < 40 * 40) { const fl = 0.8 + 0.2 * Math.sin(NQU.uTime.value * 17 + f.x) * Math.sin(NQU.uTime.value * 7.3 + f.z); _dyn.push({ p: [f.x, f.y + 0.6, f.z], r: 9, c: [2.2 * fl, 0.95 * fl, 0.25 * fl] }); }
  for (const z of ZOMBIES) if (z.burn > 0) _dyn.push({ p: [z.x, 1.2 * z.scale, z.z], r: 6, c: [2, 0.8, 0.15] });
  if (GAME.boss && !GAME.boss.dead) _dyn.push({ p: GAME.boss.core, r: 9, c: [2.4, 0.4, 2.2] });
  for (const p of PICKUPS) _dyn.push({ p: [p.x, 1, p.z], r: 4, c: p.kind === 'health' ? [0.3, 1.4, 0.6] : ARROWS[p.at].glow.map(v => v * 0.4) });
  _dyn.sort((a, b) => d2c(a.p, cam) - d2c(b.p, cam));
  let n = 0;
  if (GAME.state !== 'title') { const g = ARROWS[BOW.type].glow; const hl = PL[n++]; setPL(hl, [BOW.handWorld[0] || cam[0], (BOW.handWorld[1] || cam[1]) + 0.25, BOW.handWorld[2] || cam[2]], [g[0] * 0.15 + 0.12, g[1] * 0.15 + 0.1, g[2] * 0.15 + 0.18], 2.2); hl.intensity *= 0.3; }
  const nStat = Math.min(_stat.length, 8);
  for (let i = 0; i < nStat && n < MAX_PL; i++) { const l = _stat[i]; const c = l.kind === 'fountain' ? T.fountain : l.shop ? [l.c[0] * T.shop, l.c[1] * T.shop, l.c[2] * T.shop] : l.c; setPL(PL[n++], l.p, c, l.r); }
  for (const d of _dyn) { if (n >= MAX_PL) break; setPL(PL[n++], d.p, d.c, d.r); }
  for (let i = nStat; i < _stat.length && n < MAX_PL; i++) { const l = _stat[i]; const c = l.kind === 'fountain' ? T.fountain : l.shop ? [l.c[0] * T.shop, l.c[1] * T.shop, l.c[2] * T.shop] : l.c; setPL(PL[n++], l.p, c, l.r); }
  for (; n < MAX_PL; n++) PL[n].intensity = 0;
}

/* ---------------- world meshes ---------------- */
function buildWorld3() {
  const props = new THREE.Mesh(WORLD.meshProps, MAT.static); props.castShadow = true; props.receiveShadow = true; props.matrixAutoUpdate = false; scene.add(props);
  const near = new THREE.Mesh(WORLD.mesh, MAT.static); near.castShadow = false; near.receiveShadow = true; near.matrixAutoUpdate = false; scene.add(near);
  const far = new THREE.Mesh(WORLD.meshFar, MAT.static); far.receiveShadow = true; far.matrixAutoUpdate = false; scene.add(far);
  const garden = new THREE.Mesh(WORLD.meshGarden, MAT.static); garden.castShadow = true; garden.receiveShadow = true; garden.matrixAutoUpdate = false; scene.add(garden);   // own mesh: culled when out of view
  const forest = new THREE.Mesh(WORLD.meshForest, MAT.static); forest.receiveShadow = true; forest.matrixAutoUpdate = false; scene.add(forest);   // background trees: no shadow casting
  const sub = new THREE.Mesh(WORLD.meshSub, MAT.static); sub.castShadow = true; sub.receiveShadow = true; sub.matrixAutoUpdate = false; scene.add(sub);
  buildSigns(); buildDecalPool(); buildLights(); buildVolumes(); buildOcclusion();
  R3.built = true;
}

/* ---------------- baked occlusion: sky visibility of every half-metre of street ----------------
   The city's collision boxes become a top-down height map. For each open cell we march 16 jittered directions
   and keep the steepest skyline, so alleys, wall bases, corners and the ground under props darken.
   Computed once at load (well under a second), then one texture lookup per pixel: it replaces the old per-frame AO pass. */
function buildOcclusion() {
  const t0 = performance.now(), C = 0.5, X0 = -154, Z0 = -154, W = 616, H = 800;   // covers x -154..154, z -154..246
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
}

/* ---------------- environment: one cube capture per district, swapped as you walk ---------------- */
let pmrem = null;
const ENV = { cache: {}, cur: null };
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.5, 1200, cubeRT); scene.add(cubeCam);
function captureEnv(d) {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = null;
  const vis = partPoints.visible; partPoints.visible = false; rainLines.visible = false;
  for (const z of ZRIG.live) if (z.rig) z.rig.mesh.visible = false;
  for (const m of BATCHES[0].values()) if (m.im) m.im.visible = false;
  const saveOn = NQU.uReflOn.value; NQU.uReflOn.value = 0;
  cubeCam.position.set(d.env[0], d.env[1], d.env[2]);
  renderer.shadowMap.needsUpdate = true;
  cubeCam.update(renderer, scene);
  NQU.uReflOn.value = saveOn;
  partPoints.visible = vis; rainLines.visible = true;
  for (const z of ZRIG.live) if (z.rig) z.rig.mesh.visible = true;
  for (const m of BATCHES[0].values()) if (m.im) m.im.visible = m.n > 0;
  if (ENV.cache[d.id]) ENV.cache[d.id].dispose();
  ENV.cache[d.id] = pmrem.fromCubemap(cubeRT.texture);
  return ENV.cache[d.id];
}
function updateEnv(cam) {
  if (ENV_DIRTY) { for (const k in ENV.cache) ENV.cache[k].dispose(); ENV.cache = {}; ENV_DIRTY = false; }
  const d = districtAt(cam[0], cam[2]);
  const rt = ENV.cache[d.id] || captureEnv(d);
  if (scene.environment !== rt.texture) scene.environment = rt.texture;
}

/* ---------------- light you can see: cones under lamps, halos round bulbs ---------------- */
const VOL_U = { uLamp: { value: new THREE.Color() }, uVolK: { value: 1 } };
const coneMat = new THREE.ShaderMaterial({
  uniforms: Object.assign({ uTime: NQU.uTime, uFogCol: NQU.uFogCol, uFogDen: NQU.uFogDen }, VOL_U),
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  vertexShader: `varying vec3 vW, vN; varying float vH; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vH = uv.y; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `precision highp float; varying vec3 vW, vN; varying float vH; uniform vec3 uLamp; uniform float uVolK, uTime, uFogDen; uniform vec3 uFogCol;
${NOISE_GLSL}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float facing = pow(abs(dot(normalize(vN), V)), 1.6);
  float h = clamp(vH, 0., 1.);   // MSAA samples can land just outside the triangle: pow() of a negative is NaN on D3D
  float fall = pow(h, 1.8) * (0.25 + 0.75 * smoothstep(0.0, 0.25, h));
  float streaks = 0.65 + 0.35 * vn(vec2(atan(vN.z, vN.x + 1e-5) * 9., vW.y * 1.4 + uTime * 9.));
  float d = length(vW - cameraPosition);
  float near = smoothstep(0.5, 3.0, d);
  vec3 c = uLamp * facing * fall * streaks * 0.1 * uVolK * near * exp(-d * uFogDen * 0.5);
  gl_FragColor = vec4(c, 0.);
}` });
const CONES = [];
const haloGeo = new THREE.InstancedBufferGeometry();
function buildVolumes() {
  for (const l of WORLD.lights) if (l.kind === 'lamp') {
    const h = l.p[1] - 0.2, rb = Math.min(6, l.r * 0.3);
    const g = new THREE.CylinderGeometry(0.35, rb, h, 24, 1, true); g.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(g, coneMat); m.position.set(l.p[0], l.p[1] - 0.1, l.p[2]); m.renderOrder = 8; m.frustumCulled = true;
    scene.add(m); CONES.push(m);
  }
  const H = WORLD.halos, n = H.length;
  const quad = new THREE.PlaneGeometry(1, 1);
  haloGeo.index = quad.index; haloGeo.setAttribute('position', quad.attributes.position); haloGeo.setAttribute('uv', quad.attributes.uv);
  const pos = new Float32Array(n * 4), col = new Float32Array(n * 3);
  H.forEach((h, i) => { pos.set([h.p[0], h.p[1], h.p[2], h.s], i * 4); col.set(h.c, i * 3); });
  haloGeo.setAttribute('hp', new THREE.InstancedBufferAttribute(pos, 4)); haloGeo.setAttribute('hc', new THREE.InstancedBufferAttribute(col, 3));
  haloGeo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({ uFogCol: NQU.uFogCol, uFogDen: NQU.uFogDen }, VOL_U), transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: `attribute vec4 hp; attribute vec3 hc; uniform vec3 uLamp; varying vec2 vUv; varying vec3 vC; varying float vD;
void main(){ vec4 c = viewMatrix * vec4(hp.xyz, 1.); vD = -c.z; c.xy += position.xy * hp.w; c.z += hp.w * 0.4; vUv = uv; vC = hc.x < 0. ? uLamp * 0.35 : hc; gl_Position = projectionMatrix * c; }`,
    fragmentShader: `precision mediump float; varying vec2 vUv; varying vec3 vC; varying float vD; uniform float uVolK, uFogDen;
void main(){ float r = length(vUv - 0.5) * 2.; float a = exp(-r * r * 5.) * (1. - r) * smoothstep(0.3, 2.5, vD); gl_FragColor = vec4(vC * max(a, 0.) * 0.35 * uVolK * exp(-vD * uFogDen * 0.4), 0.); }` });
  const mesh = new THREE.Mesh(haloGeo, mat); mesh.frustumCulled = false; mesh.renderOrder = 9; scene.add(mesh);
}

/* ---------------- wet-street reflections: the scene mirrored in y, at half resolution ---------------- */
const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const reflCam = new THREE.PerspectiveCamera(); reflCam.matrixAutoUpdate = false; reflCam.matrixWorldAutoUpdate = false;
const _S = new THREE.Matrix4().makeScale(1, -1, 1);
const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); BLACK_TEX.needsUpdate = true;
NQU.uRefl.value = BLACK_TEX;
function renderReflection(r) {
  const k = SETTINGS.quality >= 2 ? 1 : 0.7, W = Math.max(4, Math.round(R3.W * k)), H = Math.max(4, Math.round(R3.H * k));   // sharper mirror on High
  if (reflRT.width !== W || reflRT.height !== H) reflRT.setSize(W, H);
  reflCam.projectionMatrix.copy(camera.projectionMatrix); reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  reflCam.matrixWorld.copy(_S).multiply(camera.matrixWorld).multiply(_S); reflCam.matrixWorldInverse.copy(reflCam.matrixWorld).invert();
  NQU.uReflOn.value = 0; NQU.uRefl.value = BLACK_TEX;
  const f = THEME.fog; r.setRenderTarget(reflRT); r.setClearColor(new THREE.Color(f[0], f[1], f[2]), 1); r.clear(true, true, false);
  const sm = renderer.shadowMap.autoUpdate; renderer.shadowMap.needsUpdate = false;
  partPoints.visible = false; rainLines.visible = false;
  r.render(scene, reflCam);
  partPoints.visible = true; rainLines.visible = true;
  NQU.uRefl.value = reflRT.texture; NQU.uReflOn.value = 1; NQU.uRes.value.set(R3.W, R3.H);
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
function buildComposer(W, H, q) {
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); if (gtaoPass) gtaoPass.dispose(); bloomPass.dispose(); }
  if (msRT) { msRT.dispose(); msRT = null; }
  if (q >= 1) msRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(1);
  worldPass = new ScenePass(camera, true); composer.addPass(worldPass);
  gtaoPass = null;
  // (ambient occlusion comes from the baked occlusion map now, at no per-frame cost)
  vmPass = new ScenePass(vmCamera, false); composer.addPass(vmPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.55, 1.0); composer.addPass(bloomPass);
  gradePass = new ShaderPass(GradeShader); composer.addPass(gradePass);
  composer.setSize(W, H);
  R3.quality = q; R3.W = W; R3.H = H;
}
function applyQuality3(q) {
  const sh = q >= 1;
  sun.castShadow = sh; for (const { s, shadow } of SPOTS) s.castShadow = sh && shadow;
}

/* ---------------- per-frame sync + render ---------------- */
function render3(time, W, H, fov, cam) {
  if (!composer || R3.quality !== SETTINGS.quality) { buildComposer(W, H, SETTINGS.quality); applyQuality3(SETTINGS.quality); }
  if (R3.W !== W || R3.H !== H) { renderer.setSize(W, H, false); composer.setSize(W, H); if (msRT) msRT.setSize(W, H); R3.W = W; R3.H = H; }
  if (canvas.width !== W || canvas.height !== H) renderer.setSize(W, H, false);
  // cameras
  camera.matrixWorld.fromArray(camM); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.fov = fov; camera.aspect = W / H; camera.updateProjectionMatrix();
  vmCamera.matrixWorld.copy(camera.matrixWorld); vmCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
  vmCamera.fov = VM_FOV; vmCamera.aspect = W / H; vmCamera.updateProjectionMatrix();
  M4.mul(_vp, camera.projectionMatrix.elements, camera.matrixWorldInverse.elements);
  skyMesh.position.set(cam[0], cam[1], cam[2]);
  // theme + shared uniforms
  applyThemeUniforms(); NQU.uTime.value = time;
  const T = THEME;
  SKY_U.uZen.value.setRGB(...T.zen); SKY_U.uMid.value.setRGB(...T.mid); SKY_U.uGlow.value.setRGB(...T.glow); SKY_U.uCloud.value.setRGB(...T.cloud); SKY_U.uDiscCol.value.setRGB(...T.disc); SKY_U.uDiscDir.value.set(...T.discDir); SKY_U.uStars.value = T.stars;
  for (const { s, m } of SIGNS) {   // dead city: some signs are out, a third sputter on failing power
    const f = s.seed % 1; let k = 1;
    if (f < 0.08) k = 0.06;
    else if (f < 0.35) k = (Math.sin(time * 23 + s.seed * 7) > 0.55 || Math.sin(time * 1.3 + s.seed) > 0.9) ? 0.12 : 1;
    m.material.uniforms.uCol.value.setRGB(s.col[0] * T.sign * k, s.col[1] * T.sign * k, s.col[2] * T.sign * k);
  }
  rainMat.uniforms.uAlpha.value = T.rain; rainMat.uniforms.uRainCol.value.setRGB(...T.rainCol);
  NQU.uEnvK.value = T.envK !== undefined ? T.envK : 0.5; NQU.uRain.value = T.rain;
  VOL_U.uLamp.value.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); VOL_U.uVolK.value = (0.35 + T.rain) * (SETTINGS.quality === 0 ? 0.6 : 1);
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
  U.uExpo.value = T.expo; U.uSat.value = T.sat; U.uGrade.value.set(...T.grade); U.uLift.value.set(...T.lift); U.uAberr.value = BOW.state === 'drawing' ? BOW.draw * 0.002 : 0; U.uFocus.value = GAME.state === 'playing' && BOW.state === 'drawing' ? easeOut(BOW.draw) : 0; U.uRes.value.set(W, H); U.uSharp.value = SETTINGS.quality === 0 ? 0.2 : SETTINGS.quality === 2 ? 0.45 : 0.35;
  bloomPass.strength = T.bloom * (T.bloomK || 0.32) * 1.2; bloomPass.threshold = T.thr; bloomPass.radius = T.bloomR || 0.3;
  const vmOn = VM_ITEMS.n > 0 && !DBG.noVM;
  worldPass.withVM = vmOn && !!msRT && !gtaoPass;       // no AO pass in between: draw the bow into the anti-aliased buffer too
  vmPass.enabled = vmOn && !worldPass.withVM;
  composer.render();
}
