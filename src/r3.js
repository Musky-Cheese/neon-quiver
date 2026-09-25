/* ============================================================
   three.js scene graph + frame pipeline
   world pass -> GTAO (high) -> viewmodel pass -> bloom -> grade
   ============================================================ */
const MAX_PL = 16;             // point-light pool (static shop/fountain lights + dynamic flashes)
const R3 = { W: 0, H: 0, quality: -1, envDirty: true, built: false };
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
  vertexShader: `attribute vec2 aP2; uniform float uTime; varying float vA;
void main(){ float S = 50.;
  float x = mod(position.x - cameraPosition.x, S) - S*0.5 + cameraPosition.x;
  float z = mod(position.y - cameraPosition.z, S) - S*0.5 + cameraPosition.z;
  float y = mod(position.z - uTime*(24.+aP2.x*8.), 36.) - 6. + cameraPosition.y;
  vec3 p = vec3(x + aP2.y*0.18, y + aP2.y*0.9, z + aP2.y*0.05); vA = aP2.y;
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.); }`,
  fragmentShader: `precision mediump float; varying float vA; uniform float uAlpha; uniform vec3 uRainCol; void main(){ gl_FragColor = vec4(uRainCol*uAlpha*(0.3+vA*0.7), 0.); }`,
});
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; rainLines.renderOrder = 11; scene.add(rainLines);

/* ---------------- lights ---------------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, Math.PI); hemi.layers.enableAll(); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, Math.PI); sun.layers.enableAll(); scene.add(sun); scene.add(sun.target);
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 260 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
const PL = [];
for (let i = 0; i < MAX_PL; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1); l.layers.enableAll(); scene.add(l); PL.push(l); }
const LAMPS = [];
const PL_K = Math.PI * 0.142;   // matches the old (1-d/r)^2 falloff with decay=1 lights
function setPL(l, p, c, r) { l.position.set(p[0], p[1], p[2]); l.color.setRGB(c[0], c[1], c[2]); l.distance = r; l.intensity = PL_K * r; }
function buildLights() {
  for (const l of WORLD.lights) if (l.kind === 'lamp') {
    const s = new THREE.SpotLight(0xffffff, 0, 26, 1.2, 0.55, 1);
    s.position.set(l.p[0], l.p[1], l.p[2]); s.target.position.set(l.p[0] * 0.98, 0, l.p[2] * 0.98); s.layers.enableAll();
    s.shadow.mapSize.set(1024, 1024); s.shadow.camera.near = 0.5; s.shadow.camera.far = 28; s.shadow.bias = -0.0008; s.shadow.normalBias = 0.03;
    scene.add(s); scene.add(s.target); LAMPS.push({ l, s });
  }
}
const _dyn = [];
function updateLights3(cam) {
  const T = THEME;
  hemi.color.setRGB(T.ambHi[0], T.ambHi[1], T.ambHi[2]); hemi.groundColor.setRGB(T.ambLo[0], T.ambLo[1], T.ambLo[2]);
  const sd = _n3(T.sunDir); sun.color.setRGB(T.sun[0], T.sun[1], T.sun[2]); sun.position.set(sd[0] * 120, sd[1] * 120, sd[2] * 120); sun.target.position.set(0, 0, 0);
  for (const { s } of LAMPS) { s.color.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]); s.intensity = PL_K * 20 * 1.35; }
  // static: fountain + shops; dynamic: flashes, arrows, fires, burning zombies, boss core, pickups, hand light
  let n = 0;
  for (const l of WORLD.lights) {
    if (l.kind === 'lamp') continue; if (n >= MAX_PL) break;
    const c = l.kind === 'fountain' ? T.fountain : l.shop ? [l.c[0] * T.shop, l.c[1] * T.shop, l.c[2] * T.shop] : l.c;
    setPL(PL[n++], l.p, c, l.r);
  }
  _dyn.length = 0;
  for (const d of DLIGHTS) { const k = d.life / d.max; _dyn.push({ p: d.p, r: d.r, c: [d.c[0] * k, d.c[1] * k, d.c[2] * k] }); }
  for (const a of PROJ) if (!a.stuck && a.type !== 0) _dyn.push({ p: [a.x, a.y, a.z], r: 7, c: ARROWS[a.type].glow.map(v => v * 0.5) });
  for (const f of FIRES) _dyn.push({ p: [f.x, 0.6, f.z], r: 6, c: [2.2, 0.9, 0.2] });
  for (const z of ZOMBIES) if (z.burn > 0) _dyn.push({ p: [z.x, 1.2 * z.scale, z.z], r: 6, c: [2, 0.8, 0.15] });
  if (GAME.boss && !GAME.boss.dead) _dyn.push({ p: GAME.boss.core, r: 9, c: [2.4, 0.4, 2.2] });
  for (const p of PICKUPS) _dyn.push({ p: [p.x, 1, p.z], r: 4, c: p.kind === 'health' ? [0.3, 1.4, 0.6] : ARROWS[p.at].glow.map(v => v * 0.4) });
  _dyn.sort((a, b) => Math.hypot(a.p[0] - cam[0], a.p[2] - cam[2]) - Math.hypot(b.p[0] - cam[0], b.p[2] - cam[2]));
  if (GAME.state !== 'title') { const g = ARROWS[BOW.type].glow; const hl = PL[n++]; setPL(hl, [BOW.handWorld[0] || cam[0], (BOW.handWorld[1] || cam[1]) + 0.25, BOW.handWorld[2] || cam[2]], [g[0] * 0.15 + 0.12, g[1] * 0.15 + 0.1, g[2] * 0.15 + 0.18], 2.2); hl.intensity *= 0.3; }
  for (const d of _dyn) { if (n >= MAX_PL) break; setPL(PL[n++], d.p, d.c, d.r); }
  for (; n < MAX_PL; n++) PL[n].intensity = 0;
}

/* ---------------- world meshes ---------------- */
function buildWorld3() {
  const props = new THREE.Mesh(WORLD.meshProps, MAT.static); props.castShadow = true; props.receiveShadow = true; props.matrixAutoUpdate = false; scene.add(props);
  const near = new THREE.Mesh(WORLD.mesh, MAT.static); near.castShadow = false; near.receiveShadow = true; near.matrixAutoUpdate = false; scene.add(near);
  const far = new THREE.Mesh(WORLD.meshFar, MAT.static); far.receiveShadow = true; far.matrixAutoUpdate = false; scene.add(far);
  buildSigns(); buildDecalPool(); buildLights();
  R3.built = true;
}

/* ---------------- environment (wet reflections): cube capture of the plaza ---------------- */
let pmrem = null, envRT = null;
const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(0.5, 1200, cubeRT); cubeCam.position.set(0, 5, 10); scene.add(cubeCam);
function captureEnv() {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = null;
  const vis = partPoints.visible; partPoints.visible = false; rainLines.visible = false;
  for (const z of ZRIG.live) if (z.rig) z.rig.mesh.visible = false;
  for (const m of BATCHES[0].values()) if (m.im) m.im.visible = false;
  renderer.shadowMap.needsUpdate = true;
  cubeCam.update(renderer, scene);
  partPoints.visible = vis; rainLines.visible = true;
  for (const z of ZRIG.live) if (z.rig) z.rig.mesh.visible = true;
  for (const m of BATCHES[0].values()) if (m.im) m.im.visible = m.n > 0;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromCubemap(cubeRT.texture);
  scene.environment = envRT.texture;
  ENV_DIRTY = false;
}

/* ---------------- post: passes ---------------- */
class ScenePass extends Pass {
  constructor(cam, first) { super(); this.cam = cam; this.first = first; this.needsSwap = false; }
  render(r, writeBuffer, readBuffer) {
    r.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.first) { const f = THEME.fog; r.setClearColor(new THREE.Color(f[0], f[1], f[2]), 1); r.clear(true, true, false); renderer.shadowMap.needsUpdate = true; }
    else r.clearDepth();
    r.render(scene, this.cam);
  }
}
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDmg: { value: 0 }, uLow: { value: 0 }, uExpo: { value: 1 }, uAberr: { value: 0 }, uSat: { value: 1 }, uGrade: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uDmg, uLow, uExpo, uAberr, uSat; uniform vec3 uGrade, uLift; uniform vec2 uRes;
${NOISE_GLSL}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
void main(){
  vec2 uv = vUv; vec2 cc = uv-0.5; float r2 = dot(cc,cc);
  float ab = (0.0015 + uDmg*0.006 + uAberr)*r2*4.;
  vec3 c; c.r = texture2D(tDiffuse, uv+cc*ab).r; c.g = texture2D(tDiffuse, uv).g; c.b = texture2D(tDiffuse, uv-cc*ab).b;
  c *= uExpo;
  float lum = dot(c, vec3(0.3,0.59,0.11));
  c = mix(c, vec3(lum)*vec3(1.1,0.9,0.9), uLow*0.55);
  c = aces(c);
  c *= uGrade; float lm = dot(c, vec3(0.3,0.59,0.11)); c = mix(vec3(lm), c, uSat); c += uLift*(1.-c);
  c = pow(clamp(c,0.,1.), vec3(1./2.2));
  float vig = smoothstep(0.85,0.2,sqrt(r2)*1.25); c *= mix(0.72,1.,vig);
  float edge = smoothstep(0.25,0.75,sqrt(r2)*1.4);
  c = mix(c, vec3(0.75,0.02,0.08), edge*clamp(uDmg,0.,1.)*0.75);
  c = mix(c, vec3(0.5,0.0,0.05), edge*uLow*(0.25+0.2*sin(uTime*6.)));
  c += (h21(uv*uRes+fract(uTime)*100.)-0.5)*0.03;
  gl_FragColor = vec4(c,1.);
}`,
};
let composer = null, worldPass, gtaoPass, vmPass, bloomPass, gradePass;
function buildComposer(W, H, q) {
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); if (gtaoPass) gtaoPass.dispose(); bloomPass.dispose(); }
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: q >= 1 ? 4 : 0 });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(1);
  worldPass = new ScenePass(camera, true); composer.addPass(worldPass);
  gtaoPass = null;
  if (q >= 2) { gtaoPass = new GTAOPass(scene, camera, W, H); gtaoPass.blendIntensity = 0.85; gtaoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1 }); composer.addPass(gtaoPass); }
  vmPass = new ScenePass(vmCamera, false); composer.addPass(vmPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.55, 1.0); composer.addPass(bloomPass);
  gradePass = new ShaderPass(GradeShader); composer.addPass(gradePass);
  composer.setSize(W, H);
  R3.quality = q; R3.W = W; R3.H = H;
}
function applyQuality3(q) {
  const sh = q >= 1;
  sun.castShadow = sh; for (const { s } of LAMPS) s.castShadow = sh;
  const ms = q >= 2 ? 2048 : 1024; if (sun.shadow.mapSize.x !== ms * 2 && sh) { sun.shadow.mapSize.set(ms * 2, ms * 2); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
}

/* ---------------- per-frame sync + render ---------------- */
function render3(time, W, H, fov, cam) {
  if (!composer || R3.quality !== SETTINGS.quality) { buildComposer(W, H, SETTINGS.quality); applyQuality3(SETTINGS.quality); }
  if (R3.W !== W || R3.H !== H) { renderer.setSize(W, H, false); composer.setSize(W, H); R3.W = W; R3.H = H; }
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
  for (const { s, m } of SIGNS) m.material.uniforms.uCol.value.setRGB(s.col[0] * T.sign, s.col[1] * T.sign, s.col[2] * T.sign);
  rainMat.uniforms.uAlpha.value = T.rain; rainMat.uniforms.uRainCol.value.setRGB(...T.rainCol);
  NQU.uEnvK.value = T.envK !== undefined ? T.envK : 0.5;
  updateLights3(cam);
  // dynamic geometry
  flushList(WORLD_ITEMS, false); flushList(VM_ITEMS, true);
  partBuf.needsUpdate = true; partBuf.updateRanges.length = 0; partBuf.addUpdateRange(0, Math.max(1, PART.n) * 8); partGeo.setDrawRange(0, PART.n);
  partMat.uniforms.uH.value = H / (2 * Math.tan(fov * Math.PI / 360));
  syncDecals();
  if (ENV_DIRTY) captureEnv();
  // post
  const U = gradePass.uniforms;
  U.uTime.value = time; U.uDmg.value = PLAYER.dmgFlash; U.uLow.value = GAME.state === 'playing' || GAME.state === 'over' ? clamp(1 - PLAYER.hp / PLAYER.maxHp / 0.35, 0, 1) : 0;
  U.uExpo.value = T.expo; U.uSat.value = T.sat; U.uGrade.value.set(...T.grade); U.uLift.value.set(...T.lift); U.uAberr.value = BOW.state === 'drawing' ? BOW.draw * 0.002 : 0; U.uRes.value.set(W, H);
  bloomPass.strength = T.bloom * (T.bloomK || 0.32); bloomPass.threshold = T.thr; bloomPass.radius = T.bloomR || 0.3;
  vmPass.enabled = VM_ITEMS.n > 0 && !DBG.noVM;
  composer.render();
}
