'use strict';
/* ============================================================
   NEON QUIVER — math + geometry helpers on top of three.js
   ============================================================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hex(h, k = 1) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k]; }

/* ---------------- mat4 (column-major) ---------------- */
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy(o, a) { o.set(a); return o; },
  mul(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      out[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      out[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      out[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return out;
  },
  // T * Ry * Rx * Rz * S
  trs(m, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
    m[0] = (cy * cz + syr * sxr * szr) * sx; m[1] = (cx * szr) * sx; m[2] = (-syr * cz + cy * sxr * szr) * sx; m[3] = 0;
    m[4] = (-cy * szr + syr * sxr * cz) * sy; m[5] = (cx * cz) * sy; m[6] = (syr * szr + cy * sxr * cz) * sy; m[7] = 0;
    m[8] = (syr * cx) * sz; m[9] = (-sxr) * sz; m[10] = (cy * cx) * sz; m[11] = 0;
    m[12] = tx; m[13] = ty; m[14] = tz; m[15] = 1;
    return m;
  },
  invertRigid(out, m) {
    const r00 = m[0], r01 = m[1], r02 = m[2], r10 = m[4], r11 = m[5], r12 = m[6], r20 = m[8], r21 = m[9], r22 = m[10];
    const tx = m[12], ty = m[13], tz = m[14];
    out[0] = r00; out[1] = r10; out[2] = r20; out[3] = 0;
    out[4] = r01; out[5] = r11; out[6] = r21; out[7] = 0;
    out[8] = r02; out[9] = r12; out[10] = r22; out[11] = 0;
    out[12] = -(r00 * tx + r01 * ty + r02 * tz);
    out[13] = -(r10 * tx + r11 * ty + r12 * tz);
    out[14] = -(r20 * tx + r21 * ty + r22 * tz);
    out[15] = 1;
    return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2); out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) / (near - far); out[11] = -1; out[14] = 2 * far * near / (near - far);
    return out;
  },
  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
      b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
      b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null; det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  // matrix whose local Y axis spans a->b, with thickness w (x) and t (z)
  align(m, ax, ay, az, bx, by, bz, w, t, refx = 0, refy = 0, refz = 1) {
    let dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz) || 1e-6;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // X = normalize(cross(Y, ref))
    let xx = uy * refz - uz * refy, xy = uz * refx - ux * refz, xz = ux * refy - uy * refx; let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-4) { xx = uy * 0 - uz * 1; xy = uz * 0 - ux * 0; xz = ux * 1 - uy * 0; xl = Math.hypot(xx, xy, xz) || 1; if (xl < 1e-4) { xx = 1; xy = 0; xz = 0; xl = 1; } }
    xx /= xl; xy /= xl; xz /= xl;
    const zx = xy * uz - xz * uy, zy = xz * ux - xx * uz, zz = xx * uy - xy * ux;
    m[0] = xx * w; m[1] = xy * w; m[2] = xz * w; m[3] = 0;
    m[4] = dx; m[5] = dy; m[6] = dz; m[7] = 0;
    m[8] = zx * t; m[9] = zy * t; m[10] = zz * t; m[11] = 0;
    m[12] = (ax + bx) / 2; m[13] = (ay + by) / 2; m[14] = (az + bz) / 2; m[15] = 1;
    return m;
  },
  pt(m, x, y, z, out) { out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[2] = m[2] * x + m[6] * y + m[10] * z + m[14]; return out; },
  dir(m, x, y, z, out) { out[0] = m[0] * x + m[4] * y + m[8] * z; out[1] = m[1] * x + m[5] * y + m[9] * z; out[2] = m[2] * x + m[6] * y + m[10] * z; return out; },
};
const _t4a = M4.create(), _t4b = M4.create(), _t4c = M4.create();

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__NQ_CAPTURE });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
} catch (e) { document.getElementById('nogl').hidden = false; throw e; }
renderer.setPixelRatio(1);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the grade pass does its own tone curve + gamma
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = true;
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.03, 1400); camera.matrixAutoUpdate = false; camera.matrixWorldAutoUpdate = false;
const vmCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.02, 50); vmCamera.matrixAutoUpdate = false; vmCamera.matrixWorldAutoUpdate = false; vmCamera.layers.set(1);
scene.add(camera); scene.add(vmCamera);
const LAYER_VM = 1;

/* ---------------- shared shader uniforms (theme + time) ---------------- */
const NQU = {
  uTime: { value: 0 }, uFogCol: { value: new THREE.Color() }, uFogDen: { value: 0.01 },
  uNeon: { value: 1 }, uWin: { value: 1 }, uWinWarm: { value: 0 }, uGrid: { value: 0 }, uDyn: { value: 1 }, uDynVM: { value: 1 }, uWet: { value: 1 },
  uRimCol: { value: new THREE.Color() }, uEnvK: { value: 0.4 }, uAirK: { value: 0 },
  // release look pass: soft camera-side fill + two-tone neon rim on the infected, and wind for the foliage (weather.js)
  uZFill: { value: 0.1 }, uZRim: { value: 0.25 }, uWind: { value: 0.3 },
  uRefl: { value: null }, uReflOn: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uRain: { value: 0.5 },
  // baked sky-visibility map of the city (r3.js buildOcclusion): x0, z0, 1/width, 1/depth in metres
  uOcc: { value: null }, uOccB: { value: new THREE.Vector4(0, 0, 0, 0) }, uIndoor: { value: null },
  // Ultra: CC0 Poly Haven texture arrays (textures/*.jpg, packed by tools/pack_textures.py), triplanar in world space
  uTexA: { value: null }, uTexN: { value: null }, uTexR: { value: null }, uTexOn: { value: 0 },
  uSnowCov: { value: 0 },   // weather.js: how snowed-over the city is
  // r3.js FAR: distant-detail fade start/end in metres + on flag (Low/Balanced/Laptop), and Laptop's extra fog past a start distance
  uFar: { value: new THREE.Vector3(45, 55, 0) }, uFogFar: { value: new THREE.Vector2(1e5, 0) },
  uTexM: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0.5, 0.5, 0.5, 0.5)) },   // per layer: mean linear albedo (rgb), mean roughness (a)
  // per layer: x = 1 / tile size in metres, y = normal strength   [asphalt, concrete, brick, rust, corrugated, pavers, plaster, cast concrete]
  uTexS: { value: [[1 / 3.5, 1.0], [1 / 3, 0.8], [1 / 2.4, 1.1], [1 / 2, 0.9], [1 / 2, 1.0], [1 / 2.6, 1.0], [1 / 3, 0.7], [1 / 3, 0.9]].map(([a, b]) => new THREE.Vector2(a, b)) },
};
const TEX_LAYERS = ['asphalt', 'concrete', 'brick', 'rust', 'corrugated', 'pavers', 'plaster', 'castconc'];
const NOISE_GLSL = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;

/* One physically-based material family for everything solid.
   Static geometry carries   color = albedo (or ao/cloth/blood masks for sculpts), nqm = (emissive k, material id).
   Instanced items carry     iTint (rgb + flash), iEmit, iSkin per instance.
   Skinned zombies carry     color = (ao, cloth, blood, glow) and a per-vertex part id that indexes per-zombie uniform arrays. */
const ZPARTS = 10;
/* three's direct-light loops, with lossless early-outs: a point/spot light whose colour is zero, or whose range
   cutoff this fragment is beyond, contributes exactly 0 (getDistanceAttenuation), so skip its info, shadow and BRDF.
   (Unrolled loops: no `continue`, so the body is wrapped in an `if`.) Falls back to the stock chunk if three changes. */
const NQ_LIGHTS_FRAG = (() => {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const RE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const PT = 'getPointLightInfo( pointLight, geometryPosition, directLight );', SP = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
  const iS = src.indexOf('#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )'), iE = src.indexOf('#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )');
  if (iS < 0 || iE < iS) return null;
  let pre = src.slice(0, iS), spot = src.slice(iS, iE);
  if (pre.split(PT).length !== 2 || pre.split(RE).length !== 2 || spot.split(SP).length !== 2 || spot.split(RE).length !== 2) return null;
  pre = pre.replace(PT, 'if ( nqLightOn( pointLight.position, pointLight.color, pointLight.distance, geometryPosition ) ) {\n\t\t' + PT).replace(RE, RE + ' }');
  spot = spot.replace(SP, 'if ( nqLightOn( spotLight.position, spotLight.color, spotLight.distance, geometryPosition ) ) {\n\t\t' + SP + '\n\t\tif ( directLight.visible ) {').replace(RE, RE + ' } }');
  return pre + spot + src.slice(iE);
})();
/* Distant-detail budget for Fast, Balanced and Laptop (never Sharp or Ultra). Nothing nearer than NEAR changes on
   any setting; past it, detail fades out over FADE metres so there is no visible line. Laptop also thickens the
   fog past lap.fogStart and draws small props, glass and signs less far. Tune here. */
const FAR = {
  NEAR: 45, FADE: 10,
  lap: { fogStart: 55, fogK: 0.014, props: 220, near: 340, glass: 220 },
  on: false, laptop: false, _lap: null, _key: -1,
};
// every material whose shader has the far-detail / Laptop-fog switches; r3.js syncFar() flips their defines
const FAR_MATS = [];
function farDefines(m) {   // NQ_FAR: Fast / Balanced / Laptop, NQ_FOGFAR: Laptop. Returns true if anything changed.
  const on = FAR.on, fog = FAR.laptop, d = m.defines || (m.defines = {});
  const far = on && m.userData.farOK !== false;
  if (!!d.NQ_FAR === far && !!d.NQ_FOGFAR === fog) return false;
  if (far) d.NQ_FAR = 1; else delete d.NQ_FAR;
  if (fog) d.NQ_FOGFAR = 1; else delete d.NQ_FOGFAR;
  m.needsUpdate = true; return true;
}
function nqMaterial(kind) {   // kind: 'static' | 'inst' | 'vm' | 'zombie'
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  m.defines = {};
  m.userData.farOK = kind === 'static' || kind === 'inst';   // detail fade is for the city; bodies and the bow stay as they are
  FAR_MATS.push(m); farDefines(m);
  if (kind === 'inst' || kind === 'vm') m.defines.NQ_INST = 1;
  if (kind === 'vm') m.defines.NQ_VM = 1;
  if (kind === 'zombie') m.defines.NQ_Z = 1;
  const own = kind === 'zombie' ? { uPT: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uPS: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uPE: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uHide: { value: new Float32Array(ZPARTS) }, uFlash: { value: 0 }, uSeed: { value: 0 } } : {};
  m.userData.u = own;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, NQU, own);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vNqW; varying vec3 vNqN; varying vec4 vNqC; varying vec2 vNqM;
#ifdef NQ_INST
attribute vec4 iTint; attribute vec3 iEmit; attribute vec3 iSkin; varying vec4 vITint; varying vec3 vIEmit; varying vec3 vISkin;
#endif
#ifdef NQ_Z
attribute float part; uniform float uHide[${ZPARTS}]; varying float vPart; varying vec3 vNqL;
#else
attribute vec2 nqm;
#endif
uniform float uTime, uWind;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#if !defined(NQ_Z) && !defined(NQ_VM) && !defined(NQ_INST)
#ifdef NQ_CARDS
  if (true) {   // flower cards sway like the foliage
#else
  if (nqm.y > 13.5 && nqm.y < 14.5) {   // foliage: a slow lean downwind (+x, like the rain) plus a quick leaf flutter, both from the weather
#endif
    vec3 wp = transformed; float hk = smoothstep(1.2, 4.5, wp.y);
    float lean = uWind * (0.55 + 0.45 * sin(uTime * 0.8 + wp.x * 0.11 + wp.z * 0.09));
    transformed.x += lean * 0.16 * hk;
    transformed += vec3(sin(uTime * 6.3 + wp.y * 4.1 + wp.x * 2.7), sin(uTime * 5.1 + wp.z * 3.3) * 0.5, cos(uTime * 5.7 + wp.x * 3.9)) * 0.014 * (0.35 + uWind) * hk;
  }
#endif`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{ vec4 w = vec4(transformed, 1.0); vec3 wn = objectNormal;
#ifdef USE_INSTANCING
  w = instanceMatrix * w; wn = mat3(instanceMatrix) * wn;
#endif
  w = modelMatrix * w; vNqW = w.xyz; vNqN = normalize(mat3(modelMatrix) * wn); }
#ifdef NQ_Z
  vNqC = vec4(color); vNqM = vec2(color.a, 6.0); vPart = part;
#ifdef NQ_ZTEX
  vNqM.y = 25.0;   // Meshy scan: colour comes from the texture
#endif
  vNqL = position;   // bind-pose position: decay patterns stick to the body
  int pi = int(part + 0.5); if (uHide[pi] > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
#else
  vNqC = vec4(color.rgb, 1.0); vNqM = nqm;
#ifdef USE_INSTANCING_COLOR
  if (nqm.y > 24.5 && nqm.y < 25.5) vNqC.rgb *= instanceColor;   // per-instance paint (Meshy cars): paint only, not glass or tyres
#endif
#endif
#ifdef NQ_INST
  vITint = iTint; vIEmit = iEmit; vISkin = iSkin;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vNqW; varying vec3 vNqN; varying vec4 vNqC; varying vec2 vNqM;
uniform float uTime, uNeon, uWin, uWinWarm, uGrid, uDyn, uDynVM, uWet, uFogDen, uEnvK, uReflOn, uRain; uniform vec3 uFogCol, uRimCol; uniform sampler2D uRefl; uniform vec2 uRes;
uniform sampler2D uOcc; uniform vec4 uOccB; uniform sampler2D uIndoor; uniform float uAirK;
uniform float uTexOn, uSnowCov, uZFill, uZRim;
${NOISE_GLSL}
#ifdef NQ_FAR
// Fast / Balanced / Laptop only (r3.js FAR). 0 everywhere inside the near zone; past it, fine detail fades to its
// mean (it is under a pixel there anyway). Without NQ_FAR the shader compiles exactly as it always did.
uniform vec3 uFar;
float nqFar = 0.;
float vnf(vec2 p) { return nqFar <= 0. ? vn(p) : nqFar >= 1. ? 0.5 : mix(vn(p), 0.5, nqFar); }
#else
#define vnf vn
#endif
#ifdef NQ_FOGFAR
uniform vec2 uFogFar;   // Laptop: extra fog past a start distance
#endif
// does a point/spot light (view-space position, colour, range cutoff) reach this fragment at all?
bool nqLightOn(vec3 p, vec3 c, float r, vec3 g) { vec3 d = p - g; return c != vec3(0.) && (r <= 0. || dot(d, d) < r * r); }
#if !defined(NQ_Z) && !defined(NQ_VM)
uniform sampler2DArray uTexA, uTexN, uTexR; uniform vec4 uTexM[8]; uniform vec2 uTexS[8];
// triplanar sample of one layer: colour, AO + roughness, and a whiteout-blended world-space normal
void nqTri(float L, vec3 W, vec3 N, float sc, out vec3 a, out vec2 ro, out vec3 n) {
  vec3 w = pow(abs(N), vec3(4.)); w /= (w.x + w.y + w.z);
  vec2 ux = W.zy * sc, uy = W.xz * sc, uz = W.xy * sc;
  vec3 nx = vec3(0.), ny = vec3(0.), nz = vec3(0.); a = vec3(0.); ro = vec2(0.);
  if (w.x > 0.02) { a += texture(uTexA, vec3(ux, L)).rgb * w.x; ro += texture(uTexR, vec3(ux, L)).rg * w.x; nx = texture(uTexN, vec3(ux, L)).rgb * 2. - 1.; }
  if (w.y > 0.02) { a += texture(uTexA, vec3(uy, L)).rgb * w.y; ro += texture(uTexR, vec3(uy, L)).rg * w.y; ny = texture(uTexN, vec3(uy, L)).rgb * 2. - 1.; }
  if (w.z > 0.02) { a += texture(uTexA, vec3(uz, L)).rgb * w.z; ro += texture(uTexR, vec3(uz, L)).rg * w.z; nz = texture(uTexN, vec3(uz, L)).rgb * 2. - 1.; }
  a /= max(w.x * step(0.02, w.x) + w.y * step(0.02, w.y) + w.z * step(0.02, w.z), 1e-3);
  nx = vec3(nx.xy + N.zy, abs(nx.z) * N.x); ny = vec3(ny.xy + N.xz, abs(ny.z) * N.y); nz = vec3(nz.xy + N.xy, abs(nz.z) * N.z);
  n = normalize(nx.zyx * w.x + ny.xzy * w.y + nz.xyz * w.z);
}
#endif
// rain rings on standing water: two drops per 0.45 m cell, each an expanding, fading ring
float nqRipple(vec2 p, float t) {
  vec2 id = floor(p), f = fract(p) - 0.5; float h = 0.;
  for (int k = 0; k < 2; k++) {
    float fk = float(k); vec2 o = vec2(h21(id + fk * 7.1), h21(id + 13.7 + fk)) - 0.5;
    float ph = fract(t * (0.8 + 0.4 * h21(id + fk * 2.3)) + h21(id * 1.7 + fk * 3.3));
    float d = length(f - o * 0.5), r = ph * 0.42;
    h += sin((d - r) * 70.) * smoothstep(0.07, 0., abs(d - r)) * (1. - ph) * (1. - ph);
  }
  return h;
}
// bricks in facade space (x along the wall, y up): colour variation + mortar mask
vec2 nqBrick(vec2 fc) {
  vec2 b = fc / vec2(0.62, 0.24); b.x += step(1., mod(floor(b.y), 2.)) * 0.5;
  vec2 f = fract(b), fw = max(fwidth(b), vec2(1e-3)) * 1.5;
  float m = 1. - smoothstep(0.06, 0.06 + fw.x, min(f.x, 1. - f.x)) * smoothstep(0.1, 0.1 + fw.y, min(f.y, 1. - f.y));
  return vec2(h21(floor(b)), m);
}
#ifdef NQ_INST
varying vec4 vITint; varying vec3 vIEmit; varying vec3 vISkin;
#endif
#ifdef NQ_Z
varying float vPart; varying vec3 vNqL; uniform vec3 uPT[${ZPARTS}]; uniform vec3 uPS[${ZPARTS}]; uniform vec3 uPE[${ZPARTS}]; uniform float uFlash, uSeed;
#endif
`)
      .replace('#include <color_fragment>', `
  vec3 tint = vec3(1.0), skin = vec3(0.5), iemit = vec3(0.0); float flash = 0.0;
#ifdef NQ_INST
  tint = vITint.rgb; flash = vITint.a; iemit = vIEmit; skin = vISkin;
#endif
#ifdef NQ_Z
  { int pi = int(vPart + 0.5); tint = uPT[pi]; skin = uPS[pi]; iemit = uPE[pi]; flash = uFlash; }
#endif
#ifdef NQ_VM
  float dynK = uDynVM;
#else
  float dynK = uDyn;
#endif
  float mat = vNqM.y;
#if defined(NQ_FAR) && !defined(NQ_Z) && !defined(NQ_VM)
  if (uFar.z > 0.5) nqFar = smoothstep(uFar.x, uFar.y, length(vNqW - cameraPosition));
#endif
  vec3 base = vNqC.rgb * tint;
#ifdef USE_MAP
  vec3 nqTex = texture2D(map, vMapUv).rgb;   // downloaded (Meshy) models carry their own colour texture
  base *= nqTex;
#endif
  vec3 emis = base * vNqM.x * uNeon + iemit * dynK;
#ifdef NQ_MAPGLOW
  {   // the model's painted neon (saturated cyan/teal texels) lights up like the city's signs
    float cy = smoothstep(0.06, 0.22, min(nqTex.g, nqTex.b) - nqTex.r) * smoothstep(0.12, 0.35, max(nqTex.g, nqTex.b));
    emis += nqTex * cy * NQ_MAPGLOW * uNeon;
  }
#endif
  float rough = 0.72, metal = 0.0, rimK = 0.0, envK = uEnvK;
  float bumpH = 0.0, wetRefl = 0.0;
  float nqTL = -1., nqTS = 0.;   // Ultra texture layer + strength, chosen per material below
  vec3 N0 = normalize(vNqN);
  // baked occlusion: how much open sky this spot sees (alley floors, wall bases and corners go dark).
  // Step out of the surface first so a wall samples the street in front of it, then fade up the wall.
  float nqOcc = 1.0, nqIn = 0.0;
#if !defined(NQ_Z) && !defined(NQ_VM)
  if (uOccB.z > 0.0) {
    vec2 ouv = (vNqW.xz + N0.xz * 0.4 - uOccB.xy) * uOccB.zw;
    float a = texture2D(uOcc, ouv).r;
    a = mix(a, 1.0, smoothstep(0.0, 14.0, vNqW.y) * a);
    nqOcc = mix(a, 1.0, step(0.5, N0.y) * step(1.2, vNqW.y));   // roofs and ledges look at the sky
    // inside a walk-in room: dry, sheltered, evenly lit (the sky map knows nothing of ceilings)
    nqIn = step(0.5, texture2D(uIndoor, (vNqW.xz + N0.xz * 0.3 - uOccB.xy) * uOccB.zw).r) * step(vNqW.y, 4.5);
    nqOcc = mix(nqOcc, 0.82, nqIn);
  }
#endif
  float wetK = uWet * (1. - nqIn);
  vec2 fcW = abs(N0.x) > 0.5 ? vec2(vNqW.z, vNqW.y) : vec2(vNqW.x, vNqW.y);
  // rain streaks running down walls: darker, glossier stripes that fade toward the top
  // (only the materials below that use it pay for the two noise lookups: facades, corrugated, glass, car paint, cast concrete)
  float streak = 0.;
  if ((mat > 0.5 && mat < 1.5) || (mat > 7.5 && mat < 11.5) || (mat > 15.5 && mat < 16.5))
    streak = vn(vec2(fcW.x * 3.1, fcW.y * 0.08 - uTime * 0.02)) * vnf(vec2(fcW.x * 11.7, fcW.y * 0.3)) * (1. - nqIn);
  if ((mat > 0.5 && mat < 1.5) || (mat > 8.5 && mat < 9.5)) {   // facades with windows (concrete panels or brick)
    if (abs(N0.y) < 0.5) {
      vec2 fc = abs(N0.x) > 0.5 ? vec2(vNqW.z, vNqW.y) : vec2(vNqW.x, vNqW.y);
      vec2 cell = fc / vec2(2.4, 3.3); vec2 id = floor(cell); vec2 f = fract(cell);
      float win = step(0.16,f.x)*step(f.x,0.84)*step(0.22,f.y)*step(f.y,0.78);
      float bseed = h21(floor(vNqW.xz/37.) + N0.xz*3.1);
      float seed = h21(id*1.37 + bseed*91.);
      float floorLit = step(0.968, h21(vec2(id.y * 1.7 + 0.3, bseed * 53.1))) * step(4.5, vNqW.y);   // an office floor someone left on
      float lit = max(step(0.82 - bseed*0.1, seed), floorLit) * step(1.2, vNqW.y);   // dead city: most rooms still dark
      float flick = step(0.997, h21(id + floor(uTime*4.)));
      vec3 wc = seed > 0.93 ? vec3(1.0,0.25,0.6) : seed > 0.84 ? vec3(0.25,0.85,1.0) : vec3(1.0,0.68,0.38);
      wc = mix(wc, vec3(1.0,0.66,0.36)*(0.7+0.6*h21(id+3.7)), uWinWarm);
      float tv = step(0.78, h21(id + 8.8)) * (1. - floorLit);   // a TV still playing to an empty room
      wc = mix(wc, vec3(0.36, 0.6, 1.0) * (0.45 + 0.55 * vn(vec2(uTime * 4.7 + seed * 40., seed * 9.))), tv);
      wc = mix(wc, vec3(0.8, 0.9, 1.0), floorLit);
      // inside the glass: a room gradient, mullions, and some blinds half drawn
      float mull = max(1. - smoothstep(0.0, 0.012, abs(f.x - 0.5)), 1. - smoothstep(0.0, 0.015, abs(f.y - 0.62)));
      float blind = h21(id + 5.3) < 0.35 ? step(0.5, fract(f.y * 18.)) * step(1. - h21(id + 9.1) * 0.8, 1. - f.y) : 0.;
      float room = (0.45 + 0.55 * smoothstep(0.2, 0.8, f.y)) * (0.4 + 0.6 * h21(id + 1.9));
      if (lit * win > 0.5) {   // interior mapping: trace the view ray into a box room behind the glass
#ifdef NQ_FAR
       float roomFar = 0.5 * (0.55 + 0.45 * h21(id + 1.9));   // far away: the room's average brightness, no trace
       if (nqFar < 1.) {
#endif
        vec3 V = normalize(vNqW - cameraPosition);
        vec3 d = vec3(abs(N0.x) > 0.5 ? V.z : V.x, V.y, max(-dot(V, N0), 0.05));
        vec2 rs = vec2(2.4, 3.3); vec2 p = f * rs; float dep = 2.2 + 1.6 * h21(id + 2.3);
        float tx = (d.x > 0. ? rs.x - p.x : -p.x) / (abs(d.x) < 1e-4 ? 1e-4 : d.x);
        float ty = (d.y > 0. ? rs.y - p.y : -p.y) / (abs(d.y) < 1e-4 ? 1e-4 : d.y);
        float tz = dep / d.z; float t = min(min(tx, ty), tz);
        vec3 hp = vec3(p, 0.) + d * t; float sh;
        if (t == tz) {         // back wall with a piece of furniture or a figure in silhouette
          float fx = hp.x / rs.x, ft = h21(id + 4.4);
          float furn = step(abs(fx - 0.3 - ft * 0.4), 0.12 + ft * 0.15) * step(hp.y, 0.9 + ft * 1.1);
          sh = mix(0.62, 0.08, furn);
        } else if (t == ty) sh = d.y > 0. ? 1.0 : 0.3 * (0.7 + 0.3 * vn(hp.xz * 3.));   // ceiling light / floor
        else sh = 0.42;        // side walls
        sh *= 0.55 + 0.45 * smoothstep(0., dep, dep - hp.z * 0.6);   // falls off toward the back
        room = sh * (0.55 + 0.45 * h21(id + 1.9));
#ifdef NQ_FAR
        if (nqFar > 0.) room = mix(room, roomFar, nqFar);
       } else room = roomFar;
#endif
      }
      float wk = win * lit * (1. - flick) * (1. - mull * 0.85) * (1. - blind * 0.7) * room;
      emis += wk * wc * uWin * (mat > 8.5 ? 0.7 : 1.0);
      vec3 wall;
      if (mat > 8.5) {        // brick tenements
        vec2 br = uTexOn > 0.5 ? vec2(0.5, 0.) : nqBrick(fc);
        wall = base * (0.75 + 0.5 * br.x) * (1. - br.y * 0.55);
        bumpH = -br.y * 0.012;
      } else {                // concrete panels: seams every floor and bay, blotchy weathering
        float seam = max(1. - smoothstep(0., 0.035, abs(f.y - 0.02)), 1. - smoothstep(0., 0.02, abs(f.x - 0.02)));
        float panel = 0.8 + 0.25 * vn(fc * vec2(0.9, 0.35) + bseed * 17.) + 0.1 * vn(fc * 4.3);
        wall = base * panel * (1. - seam * 0.45);
        bumpH = -seam * 0.01;
      }
      // dirty water runs down from every sill; sheltered walls collect more soot
      float sill = step(0.16, f.x) * step(f.x, 0.84) * step(f.y, 0.22) * smoothstep(0.0, 0.22, f.y) * (0.3 + 0.7 * vnf(vec2(fc.x * 14., id.y * 3.1)));
      float grime = smoothstep(4., 0., fc.y) * 0.35 + streak * 0.5 + sill * 0.55 + (1. - nqOcc) * 0.45;
      wall *= 1. - clamp(grime, 0., 1.4) * 0.5;
      base = mix(wall, vec3(0.015,0.02,0.04), win);
      bumpH -= win * 0.03;
      rough = mix(mix(0.85, 0.45, streak * wetK), 0.08, win); metal = win*0.2; envK = uEnvK*mix(0.6 + streak, 1.6, win);
      nqTL = mat > 8.5 ? 2. : 1.; nqTS = 0.9 * (1. - win);
    } else if (mat > 8.5) { base *= 0.8; }
  } else if (mat > 1.5 && mat < 2.5) {      // plaza tiles, wet
    vec2 q = vNqW.xz/4.; vec2 gd = abs(fract(q-0.5)-0.5); vec2 fw = max(fwidth(q), vec2(1e-4));
    vec2 l2 = 1. - smoothstep(vec2(0.012), vec2(0.012)+fw*1.5, gd);
    float line = max(l2.x,l2.y) * (0.35 + 0.65*clamp(0.02/max(fw.x,fw.y),0.,1.));
    float pud = max(smoothstep(0.52,0.66, vn(vNqW.xz*0.18)), smoothstep(0.8, 0.5, nqOcc) * 0.75);   // water pools along wall bases
    float tileV = 0.9 + 0.2*h21(floor(q));
    emis += vec3(0.1,0.55,1.0)*line*uGrid*(1.-pud*0.6);
    float stain = vn(vNqW.xz * 0.7) * 0.25 + vn(vNqW.xz * 3.7) * 0.12;
    base = mix(base*tileV*(1.-line*0.5)*(1. - stain), base*0.35, pud);
    bumpH = -line * 0.01 + pud * nqRipple(vNqW.xz * 2.2, uTime) * 0.002 * uRain;
    rough = mix(0.62, mix(0.62, 0.04, clamp(wetK, 0., 1.)), pud); envK = uEnvK*(1.0 + pud*0.6*wetK);
    wetRefl = mix(0.22, 1.0, pud) * clamp(wetK, 0., 1.);   // the whole wet surface mirrors a little, puddles fully
    nqTL = 5.; nqTS = 0.75 * (1. - pud * 0.7);
  } else if (mat > 2.5 && mat < 3.5) {      // asphalt
    float pud = max(smoothstep(0.5,0.7, vn(vNqW.xz*0.12)), smoothstep(0.8, 0.5, nqOcc) * 0.8);     // gutters stay wet
    float lane = step(abs(vNqW.x),0.12)*step(0.5,fract(vNqW.z/6.))*step(abs(vNqW.x),6.);
    float lane2 = step(abs(vNqW.z),0.12)*step(0.5,fract(vNqW.x/6.))*step(abs(vNqW.z),6.);
    emis += vec3(1.0,0.75,0.3)*(lane+lane2)*uGrid*0.55*step(40.5,max(abs(vNqW.x),abs(vNqW.z)));
    float grain = vn(vNqW.xz*3.1), fine = vnf(vNqW.xz*23.);
    float crack = smoothstep(0.02, 0., abs(vn(vNqW.xz*0.9) - 0.5)) * 0.6;
    base *= (1.-pud*0.6) * (0.78 + 0.3*grain + 0.1*fine) * (1. - crack * 0.5);
    {   // south of the suburbs the road breaks up: cracked, then patched with gravel and dirt toward the gardens
      float wild = smoothstep(128., 162., vNqW.z) * step(abs(vNqW.x), 40.);
      float grav = wild * smoothstep(0.35, 0.6, vn(vNqW.xz * 0.35) * (1. - wild * 0.4) + wild * 0.55);
      base = mix(base * (1. - crack * wild), vec3(0.12, 0.105, 0.085) * (0.55 + 0.7 * fine) * (0.7 + 0.5 * grain), grav);
      pud *= 1. - grav * 0.7; bumpH += grav * fine * 0.006;
    }
    bumpH = fine * 0.0025 - crack * 0.006 + pud * nqRipple(vNqW.xz * 2.2, uTime) * 0.002 * uRain;
    rough = mix(0.85, mix(0.8, 0.05, clamp(wetK,0.,1.)), pud); envK = uEnvK*(1.0 + pud*0.6*wetK);
    wetRefl = mix(0.2, 1.0, pud) * clamp(wetK, 0., 1.);
    nqTL = 0.; nqTS = 0.9 * (1. - pud * 0.75);
  } else if (mat > 3.5 && mat < 4.5) {      // brushed metal
    float br = vnf(vec2(fcW.x * 60., fcW.y * 1.5));
    rough = 0.3 + br * 0.15; metal = 0.65; rimK = 1.0; bumpH = br * 0.0015;
    base *= 0.9 + 0.2 * vn(vNqW.xz * 2.1 + vNqW.y);
  } else if (mat > 7.5 && mat < 8.5) {      // corrugated / painted steel: ribs, rust, scratches
    float along = abs(N0.y) > 0.5 ? vNqW.x : fcW.x;
    float rib = sin(along * 25.1);
    float rust = smoothstep(0.55, 0.8, vn(fcW * 1.3 + N0.xz * 5.) + streak * 0.4);
    base = mix(base * (0.85 + 0.15 * rib), vec3(0.16, 0.07, 0.03), rust * 0.7) * (1. - smoothstep(1.5, 0., vNqW.y) * 0.25);
    bumpH = rib * 0.006; rough = mix(0.5, 0.85, rust); metal = 0.45 * (1. - rust); rimK = 1.0;
    nqTL = 3.; nqTS = 0.55;
  } else if (mat > 9.5 && mat < 10.5) {     // glass: dark, glossy, streaked with rain
    base *= 0.35; rough = 0.04 + streak * 0.14 * wetK; metal = 0.0; envK = uEnvK * 2.4; rimK = 0.6; bumpH = streak * 0.0015;
  } else if (mat > 10.5 && mat < 11.5) {    // car paint: clear coat, fine scratches, road grime low down
    float scr = smoothstep(0.93, 1.0, vnf(vec2(fcW.x * 38., fcW.y * 2.5 + N0.y * 7.)));
    float dirt = smoothstep(0.95, 0.15, vNqW.y) * (0.45 + 0.55 * vn(vNqW.xz * 3. + vNqW.y * 2.));
    base = mix(base, vec3(0.05, 0.045, 0.04), dirt * 0.65) + scr * 0.1;
    rough = mix(0.24, 0.75, dirt) + streak * 0.05 * wetK; metal = mix(0.3, 0.05, dirt); envK = uEnvK * mix(1.8, 0.6, dirt); rimK = 1.0; bumpH = -scr * 0.0008;
  } else if (mat > 11.5 && mat < 12.5) {    // bark: deep ridges, moss creeping up from the planter
    float rid = abs(vnf(vNqW.xz * 11. + vNqW.y * 1.7) - 0.5) * 2.;
    float moss = smoothstep(1.6, 0.4, vNqW.y) * vn(vNqW.xz * 5. + vNqW.y * 4.);
    base = mix(base * (0.55 + 0.6 * rid), vec3(0.05, 0.09, 0.03), moss * 0.7);
    bumpH = rid * 0.012; rough = 0.92; rimK = 0.4;
  } else if (mat > 12.5 && mat < 13.5) {    // wood slats: grain, darker and slicker when wet
    float gr = vn(vec2((vNqW.x + vNqW.z) * 3.1, vNqW.y * 40.)) * 0.5 + vnf(vNqW.xz * 23.) * 0.5;
    base *= (0.7 + 0.45 * gr) * mix(1., 0.72, wetK * step(0.5, N0.y));
    bumpH = gr * 0.002; rough = mix(0.62, 0.35, wetK * step(0.5, N0.y)); rimK = 0.5;
  } else if (mat > 13.5 && mat < 14.5) {    // foliage: mottled leaves, light glowing through the canopy
    // individual leaves / petals: a cellular pattern laid on the dominant plane of the canopy surface
    bool pinkF = base.r > base.g * 1.35;
    vec3 an = abs(N0); vec2 lp = an.y > max(an.x, an.z) ? vNqW.xz : an.x > an.z ? vNqW.zy : vNqW.xy;
    lp = lp * (pinkF ? 13. : 9.) + vec2(vn(vNqW.xz * 2.1), vn(vNqW.zy * 2.3)) * 1.5;
    vec2 li = floor(lp), lf = fract(lp); float F1 = 9., F2 = 9.; vec2 cid = li;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j)); vec2 pc = o + vec2(h21(li + o), h21(li + o + 7.1)) * 0.85 + 0.075;
      float dd = length(pc - lf); if (dd < F1) { F2 = F1; F1 = dd; cid = li + o; } else if (dd < F2) F2 = dd;
    }
    float edgeL = smoothstep(0.0, 0.14, F2 - F1), hv = h21(cid * 1.31), dome = 1. - clamp(F1 * 1.6, 0., 1.);
    // ragged silhouette: leaves at grazing angles fall away between the gaps
    float ndv = abs(dot(N0, normalize(cameraPosition - vNqW)));
    if (F2 - F1 < 0.1 + (1. - ndv) * 0.25 && ndv < 0.45 && vn(vNqW.xz * 3.3 + vNqW.y * 2.9) > 0.3) discard;
    float clump = vn(vNqW.xz * 1.4 + vNqW.y * 1.7);
    if (pinkF) base = mix(base, mix(vec3(1., 0.78, 0.86), vec3(0.86, 0.36, 0.55), hv), 0.65) * (0.62 + 0.45 * clump);   // white to deep pink petals
    else base *= mix(vec3(0.62, 0.72, 0.5), vec3(1.25, 1.12, 0.62), hv) * (0.55 + 0.6 * clump);                           // dark to sunlit, yellowing leaves
    base *= mix(0.62 + 0.3 * clump, 1.0, edgeL) * (0.8 + 0.3 * dome);
    if (pinkF) { base *= vec3(1.12, 0.95, 1.02); emis += base * (0.1 + 0.16 * dome) * (0.6 + 0.4 * clump); }   // petals glow softly, as if lit through
    emis += base * uNeon * 0.3; rough = mix(0.7, 0.4, dome); rimK = 1.4;
    emis += base * (1. - ndv) * (1. - ndv) * (0.25 + 0.6 * uNeon) * (pinkF ? 1.3 : 0.8);   // thin leaves and petals let the city light through at the edges
    bumpH = dome * 0.012 - (1. - edgeL) * 0.006;
  } else if (mat > 14.5 && mat < 15.5) {    // moulded plastic / rubber
    base *= 0.88 + 0.22 * vn(vNqW.xz * 4. + vNqW.y * 3.); rough = 0.55; metal = 0.0; rimK = 0.7;
  } else if (mat > 15.5 && mat < 16.5) {    // cast concrete: aggregate, pits, wet tops
    float ag = vn(vNqW.xz * 1.7 + vNqW.y * 1.3) * 0.25 + vnf(vNqW.xz * 9. + vNqW.y * 7.) * 0.12;
    float pit = smoothstep(0.78, 0.9, vnf(vNqW.xz * 31. + vNqW.y * 29.));
    float top = step(0.5, N0.y);
    base *= (0.78 + ag) * (1. - pit * 0.35) * (1. - streak * 0.2 * (1. - top)) * mix(1., 0.7, wetK * top);
    bumpH = -pit * 0.004 + ag * 0.004; rough = mix(0.92, 0.4, wetK * top * 0.8); rimK = 0.3;
    nqTL = 7.; nqTS = 0.85;
  } else if (mat > 16.5 && mat < 17.5) {    // moss lawn strewn with fallen blossom
    float n1 = vn(vNqW.xz * 0.9), n2 = vn(vNqW.xz * 7.3), n3 = vnf(vNqW.xz * 31.);
    base *= 0.6 + 0.5 * n1 + 0.25 * n2 - 0.15 * n3;
    float pet = smoothstep(0.8, 0.9, vn(vNqW.xz * 5.1 + 3.7)) * smoothstep(0.3, 0.6, vn(vNqW.xz * 0.4 + 9.1));
    base = mix(base, vec3(0.75, 0.32, 0.45), pet * 0.85);
    emis += vec3(0.6, 0.18, 0.3) * pet * 0.08 * uNeon;
    bumpH = n3 * 0.004 + n2 * 0.006; rough = mix(0.9, 0.55, clamp(wetK, 0., 1.) * 0.6); rimK = 0.2;
  } else if (mat > 18.5 && mat < 19.5) {    // overgrown lawn: patchy weeds, bare mud, wet sheen
    float n1 = vn(vNqW.xz * 0.7), n2 = vn(vNqW.xz * 6.1), n3 = vnf(vNqW.xz * 27.);
    base *= 0.5 + 0.6 * n1 + 0.3 * n2 - 0.15 * n3;
    base = mix(base, vec3(0.05, 0.04, 0.03), smoothstep(0.55, 0.75, vn(vNqW.xz * 0.35 + 4.2)) * 0.8);
    bumpH = n3 * 0.005 + n2 * 0.006; rough = mix(0.92, 0.6, clamp(wetK, 0., 1.) * 0.5); rimK = 0.2;
  } else if (mat > 22.5 && mat < 23.5) {    // harbour: black oily water, long swell, rain rings, a rainbow fuel sheen
    float sw = sin(vNqW.x * 0.35 + uTime * 0.7) * 0.5 + sin(vNqW.z * 0.23 - uTime * 0.5) * 0.5;
    float oil = smoothstep(0.55, 0.8, vn(vNqW.xz * 0.08 + vec2(uTime * 0.01, 0.)));
    base = vec3(0.008, 0.014, 0.016) + (0.5 + 0.5 * cos(6.2831 * (vn(vNqW.xz * 0.4) + vec3(0., 0.33, 0.67)))) * 0.03 * oil;
    bumpH = nqRipple(vNqW.xz * 1.6, uTime) * 0.003 * max(uRain, 0.2) + sw * 0.03 + (vn(vNqW.xz * 0.9 + uTime * 0.15) - 0.5) * 0.02;
    rough = 0.05; metal = 0.0; envK = uEnvK * 1.8; rimK = 0.0; wetRefl = 0.9;
  } else if (mat > 17.5 && mat < 18.5) {    // koi pond: black mirror water, rain rings, drifting petals, koi below
    float pet = smoothstep(0.86, 0.93, vn(vNqW.xz * 4.3 + vec2(uTime * 0.05, 0.)));
    vec2 kp = vNqW.xz * 0.6 + vec2(sin(uTime * 0.3), cos(uTime * 0.23)) * 1.5;
    float koi = smoothstep(0.9, 0.96, vn(kp * 1.7));
    base = mix(vec3(0.01, 0.03, 0.035), vec3(0.8, 0.35, 0.5), pet);
    emis += vec3(1.0, 0.35, 0.08) * koi * 0.18 * (1. - pet);
    bumpH = nqRipple(vNqW.xz * 2.2, uTime) * 0.003 * max(uRain, 0.25) + (vn(vNqW.xz * 1.3 + uTime * 0.2) - 0.5) * 0.004;
    rough = mix(0.03, 0.6, pet); metal = 0.0; envK = uEnvK * 1.6; rimK = 0.0;
    wetRefl = mix(0.85, 0.08, pet);
#ifdef NQ_ZTEX
  } else if (mat > 24.5 && mat < 25.5) {    // Meshy-scanned zombie: the texture carries skin, clothes and gore
    // uPT = per-zombie tone, uPS.x = frost (Cryo Burst) set by rig.js drawZombieRig
    vec3 tx = nqTex, q = vNqL * 7. + uSeed;
    float lum = dot(tx, vec3(0.3, 0.55, 0.15));
    float bl = smoothstep(0.05, 0.18, tx.r - max(tx.g, tx.b) * 1.35) * (1. - smoothstep(0.12, 0.3, max(tx.g, tx.b)));   // deep, saturated red only: open wounds, not brown stains
    base = tx * tint * (0.86 + 0.28 * vn(q.xy * 0.9 + q.z * 0.4));                 // grime breaks up the scan's even tone
    float mud = (1. - smoothstep(0.05, 0.75, vNqL.y)) * (0.45 + 0.55 * vn(q.xz * 0.9 + 2.7));
    base = mix(base * (1. - 0.3 * mud), vec3(0.075, 0.06, 0.045), mud * 0.3);       // street filth up the shins
    base = mix(base, (lum * 1.5 + 0.06) * vec3(0.42, 0.62, 0.8), skin.x);              // frost
    rough = mix(0.74, 0.18, bl); metal = 0.0; rimK = mix(0.6, 1.35, bl);
    float soak = clamp(wetK, 0., 1.);
    rough = mix(rough, rough * 0.7, soak); base *= 1. - 0.15 * soak;
    emis = vec3(0.5, 0.07, 0.045) * bl * bl * (0.22 + 0.14 * vn(q.xy * 5. + q.z)) * (1. - skin.x);   // wounds glow faintly, like the sculpts
#endif
  } else if (mat > 5.5 && mat < 7.5) {      // sculpted characters / armour: rgb = (ao, cloth mask, blood mask)
    float ao = vNqC.r, clm = vNqC.g, bl = vNqC.b;
    base = mix(skin, tint, clm);
#ifdef NQ_Z
    bl = smoothstep(0.3, 0.95, bl);     // blood in stains and runs, not a wash over everything
    base = mix(base, vec3(0.085,0.01,0.007), bl*0.85);
#else
    base = mix(base, vec3(0.13,0.008,0.006), bl*0.92);
#endif
    base *= ao;
    emis = iemit * vNqM.x * dynK;
    float armour = step(6.5, mat);
#ifdef NQ_Z
    armour = step(6.5, vPart) * step(vPart, 8.5);
#endif
    rough = mix(mix(mix(0.62, 0.88, clm), 0.25, bl), 0.55, armour); metal = armour * 0.08; rimK = 0.6;
#ifdef NQ_Z
    {   // decay: mottled skin, dark veins, wet wounds; grimy clothes torn open to the skin beneath
      vec3 q = vNqL * 7. + uSeed; float skinM = (1. - clm) * (1. - armour);
      float mott = vn(q.xy * 1.3 + q.z * 0.7);
      float vein = smoothstep(0.03, 0.0, abs(vn(q.xz * 2.1 + q.y * 0.6) - 0.5)) * skinM * smoothstep(0.4, 0.7, vn(q.xy * 0.7 + 3.3));
      float wound = smoothstep(0.68, 0.78, vn(q.yz * 0.8 + 7.3)) * (1. - armour);
      float tear = smoothstep(0.8, 0.86, vn(q.xy * 1.6 + 3.1)) * clm * (1. - armour);
      float face = step(4.5, vPart) * step(vPart, 6.5);
      base *= mix(1., ao * ao, face * 0.85);                                   // deep sockets, mouth and nostrils actually read as holes
      float lum = dot(base, vec3(0.3, 0.55, 0.15));
      base = mix(base, lum * vec3(0.86, 0.97, 0.8), skinM * 0.4);                // grey-green pallor: dead, not just pale
      base = mix(base, base * vec3(0.78, 0.72, 0.82) * (0.65 + 0.6 * mott), skinM * 0.85);
      base = mix(base, base * vec3(0.38, 0.3, 0.45), vein * 0.8);
      base = mix(base, lum * vec3(0.9, 1.0, 0.85), clm * 0.26 * (1. - armour));        // clothes: faded, filthy, nothing saturated survives
      base = mix(base, mix(skin * ao * 0.45, vec3(0.09, 0.012, 0.008) * ao, 0.35), tear);   // rips show dark, bloodied skin
      base *= 1. - clm * (1. - tear) * 0.4 * vn(q.xz * 3. + 1.7);
      base = mix(base, vec3(0.16, 0.015, 0.012) * ao, wound * 0.9);
      // old blood dries brown-black; fresh stays wet and red
      float dry = smoothstep(0.25, 0.6, vn(q.xy * 2.3 + 5.1));
      base = mix(base, vec3(0.07, 0.025, 0.018) * ao, bl * dry * 0.65);
      // grime from the street: mud and filth climbing the legs, heaviest on shoes and cuffs
      float mud = (1. - smoothstep(0.05, 0.8, vNqL.y)) * (0.45 + 0.55 * vn(q.xz * 0.9 + 2.7));
      base = mix(base * (1. - 0.35 * mud), vec3(0.075, 0.06, 0.045) * ao, mud * 0.4 * (0.4 + 0.6 * clm));
      // livor mortis: blood pooled low in the body darkens and purples the skin
      base = mix(base, base * vec3(0.72, 0.6, 0.78), skinM * (1. - smoothstep(0.7, 1.3, vNqL.y)) * 0.35);
      rough = mix(rough, 0.12, max(wound, bl * (1. - dry)));
      float soak = clamp(wetK, 0., 1.);                                   // rain: skin takes a thin sheen, cloth goes dark and heavy
      rough = mix(rough, rough * 0.72, soak * skinM);
      rough = mix(rough, 0.16, soak * skinM * smoothstep(0.35, 0.9, N0.y));   // rain beads on the crown and shoulders
      base *= 1. - 0.2 * soak * clm * (1. - armour);
      bumpH = (mott - 0.5) * 0.004 * skinM - wound * 0.008 + vein * 0.003 + (vn(q.xy * 6.) - 0.5) * 0.0015 * clm;   // weave
      // eyes (full-emissive verts on the head): milky, clouded, wet, with only a faint infected glint
      float eye = step(0.97, vNqM.x) * step(4.5, vPart) * step(vPart, 5.5);
      base = mix(base, vec3(0.3, 0.1, 0.07) * mix(1., vn(q.xy * 9.) * 0.4 + 0.7, 0.5), eye);   // bloodshot
      rough = mix(rough, 0.08, eye); rimK = mix(rimK, 0.0, eye);
      emis += iemit * eye * 3.2;                                              // burning pupils: readable at night from across the street
      // teeth (tagged 0.9 in the sculpt, 0.27 after the vein softening): stained, cracked enamel, never glowing
      float tooth = step(0.2, vNqM.x) * step(vNqM.x, 0.35) * step(4.5, vPart) * step(vPart, 6.5);
      base = mix(base, vec3(0.3, 0.25, 0.15) * ao * (0.75 + 0.25 * vn(q.xy * 20.)), tooth); rough = mix(rough, 0.3, tooth); emis *= 1. - tooth;
      // open wounds (carved craters/notches, authored in the blood mask) get the same treatment as the
      // eyes: a faint infected glow so the carved geometry actually reads in this dark, backlit lighting
      // instead of vanishing into the near-black silhouette. Concentrated on real wound centers (bl is
      // already smoothstepped away from incidental blood specks), not a wash over every stain.
      float woundGlow = bl * bl * (1. - tooth);
      emis += vec3(0.5, 0.07, 0.045) * woundGlow * (0.55 + 0.25 * vn(q.xy * 5. + q.z));
      rimK = mix(rimK, 1.35, bl);                                              // wet, torn edges catch rim light harder
    }
#endif
  } else if (mat > 19.5 && mat < 20.5) {    // painted plaster: soft mottling, scuffed low down, faint roller texture
    float n1 = vn(fcW * 1.3 + N0.xz * 3.), n2 = vn(fcW * 9.), n3 = vnf(vec2(fcW.x * 40., fcW.y * 2.));
    base *= (0.9 + 0.14 * n1 - 0.05 * n2 - 0.03 * n3) * (1. - smoothstep(0.45, 0.0, vNqW.y) * 0.3 * (1. - step(0.5, abs(N0.y))));
    rough = 0.85 - n2 * 0.08; rimK = 0.15; bumpH = n2 * 0.0006 + n3 * 0.0003;
    nqTL = 6.; nqTS = 0.7;
  } else if (mat > 20.5 && mat < 22.5) {    // indoor floor tiles (22: checkerboard): grout, per-tile tone, polished but scuffed
    vec2 q = vNqW.xz / (mat > 21.5 ? 0.33 : 0.6); vec2 gd = abs(fract(q) - 0.5); vec2 fw = max(fwidth(q), vec2(1e-4));
    float grout = smoothstep(0.482 - fw.x * 1.2, 0.494, max(gd.x, gd.y));
    float tv = 0.88 + 0.2 * h21(floor(q)), scuff = vn(vNqW.xz * 2.7) * vnf(vNqW.xz * 13.);
    if (mat > 21.5) base = mix(base, vec3(0.025, 0.025, 0.03), mod(floor(q.x) + floor(q.y), 2.));
    base = mix(base * tv * (1. - scuff * 0.25), vec3(0.06, 0.055, 0.05), grout * 0.8);
    rough = mix(mix(0.18, 0.55, scuff), 0.95, grout); envK = uEnvK * 1.6; rimK = 0.1; bumpH = -grout * 0.002;
  } else if (mat > 23.5 && mat < 24.5) {    // beacons and hazard lights: a short flash on each light's own beat
    float ph = h21(floor(vNqW.xz * 0.5) + floor(vNqW.y * 0.25)), cyc = fract(uTime * (0.5 + 0.35 * ph) + ph);
    emis *= 0.06 + 1.7 * smoothstep(0., 0.04, cyc) * (1. - smoothstep(0.16, 0.34, cyc)); rimK = 0.;
  } else if (mat > 24.5 && mat < 25.5) {    // wreck paint (Meshy cars): years-old, faded on top, rusting at the arches and sills
    float wear = vNqM.x; emis = iemit * dynK;   // nqm.x is the baked wear mask here, not a glow
    float n1 = vn(vNqW.xz * 2.3 + vNqW.y * 1.7), n2 = vnf(fcW * 7.3 + N0.xz * 3.1);
    float oxid = smoothstep(0.5, 0.95, N0.y) * (0.6 + 0.4 * n1);   // sun-baked hood and roof: a little paler and duller
    base = mix(base, vec3(dot(base, vec3(0.333))) * 1.1 + 0.01, oxid * 0.3);
    float rustM = wear * smoothstep(0.3, 0.75, n1 + (n2 - 0.5) * 0.3) * 0.8;   // soft rust only where the wear mask says (arches, sills)
    base = mix(base, mix(vec3(0.15, 0.06, 0.025), vec3(0.3, 0.12, 0.04), n2), rustM);
    float dirt = smoothstep(0.7, 0.1, vNqW.y) * (0.6 + 0.4 * n1);   // road grime: a smooth fade up from the sills, no blotches
    base = mix(base, vec3(0.045, 0.04, 0.035), dirt * 0.5);
    float scr = smoothstep(0.93, 1.0, vnf(vec2(fcW.x * 38., fcW.y * 2.5 + N0.y * 7.)));
    base += scr * 0.05 * (1. - rustM);
    rough = mix(mix(0.28, 0.55, oxid), 0.92, max(rustM, dirt * 0.8)) + streak * 0.05 * wetK;
    metal = 0.22 * (1. - rustM); envK = uEnvK * mix(1.5, 0.25, max(rustM, dirt)); rimK = 0.9;
    bumpH = -scr * 0.0008 + rustM * n2 * 0.003;
  } else if (mat > 4.5 && mat < 5.5) {      // hologram
    float sl = 0.65 + 0.35*sin(vNqW.y*60. + uTime*8.);
    emis += base*sl*1.6; base *= 0.0;
  } else { rimK = 1.0; }
  vec3 nqTexN = N0; float nqTexK = 0.;
#if !defined(NQ_Z) && !defined(NQ_VM)
  if (uTexOn > 0.5 && nqTL > -0.5 && nqTS > 0.01) {
    int li = int(nqTL + 0.5); vec3 ta; vec2 tro; vec3 tn;
    nqTri(nqTL, vNqW, N0, uTexS[li].x, ta, tro, tn);
    vec3 det = pow(ta, vec3(2.2)) / max(uTexM[li].rgb, vec3(0.02));            // photo detail relative to the layer's average colour
    base *= mix(vec3(1.), clamp(det, 0., 3.), nqTS);
    base *= mix(1., tro.x, nqTS * 0.8);                                           // baked cavity occlusion
    rough = clamp(mix(rough, rough * tro.y / max(uTexM[li].a, 0.05), nqTS * 0.7), 0.03, 1.);
    nqTexN = tn; nqTexK = nqTS * uTexS[li].y;
  }
  // snow settles on anything facing the sky (not water, glass, holograms, or indoors), in drifts, thinner under cover
  if (uSnowCov > 0.01 && !(mat > 17.5 && mat < 18.5) && !(mat > 22.5 && mat < 23.5) && !(mat > 9.5 && mat < 10.5) && !(mat > 4.5 && mat < 5.5)) {
    float up = smoothstep(0.55, 0.9, N0.y);
    float drift = smoothstep(0.25, 0.6, vn(vNqW.xz * 0.7) * 0.55 + vn(vNqW.xz * 3.1) * 0.2 + uSnowCov * 0.65);
    float snowM = uSnowCov * up * clamp(nqOcc * 1.4 - 0.2, 0., 1.) * (1. - nqIn) * drift;
    base = mix(base, vec3(0.56, 0.58, 0.64) * (0.92 + 0.08 * vnf(vNqW.xz * 9.)), snowM);
    rough = mix(rough, 0.72, snowM); wetRefl *= 1. - snowM; emis *= 1. - snowM * 0.85; nqTexK *= 1. - snowM; bumpH *= 1. - snowM;
  }
#endif
  diffuseColor.rgb = base * mix(1.0, nqOcc, 0.55);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {   // derivative bump from the procedural height (view space)
    vec3 sp = -vViewPosition, dpx = dFdx(sp), dpy = dFdy(sp);
    float dhx = dFdx(bumpH), dhy = dFdy(bumpH);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
    if (abs(det) > 1e-9) normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2));
  }
  if (nqTexK > 0.) normal = normalize(normal + (viewMatrix * vec4(nqTexN - N0, 0.)).xyz * nqTexK);   // Ultra: photo-scanned surface normals`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = metal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float rim = pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 3.);
#ifdef NQ_VM
    rim *= 0.25;
#endif
    totalEmissiveRadiance = emis + (uRimCol*rim*0.35 + base*uRimCol*1.6*rim*0.6)*rimK;
#ifdef NQ_Z
    {   // readability: a soft fill from the camera side that fades with distance, and the city's neon edging the silhouette
      float ndv = clamp(dot(normal, normalize(vViewPosition)), 0., 1.), zd = length(vNqW - cameraPosition);
      totalEmissiveRadiance += base * uZFill * (0.3 + 0.7 * ndv) * (1. - smoothstep(8., 38., zd));
      float rz = pow(1. - ndv, 2.6) * smoothstep(-0.2, 0.4, normal.y + 0.3);
      totalEmissiveRadiance += mix(vec3(1.0, 0.31, 0.64), vec3(0.22, 0.88, 0.95), step(0., normal.x)) * rz * uZRim;
    }
#endif
#ifndef NQ_VM
    // planar reflection of the street (rendered mirrored by r3.js), rippled by the bumped normal
    if (wetRefl > 0.0 && uReflOn > 0.5) {
      vec2 suv = gl_FragCoord.xy / uRes; suv.y = 1. - suv.y;
      vec3 wn = normalize((vec4(normal, 0.) * viewMatrix).xyz);
      suv += wn.xz * vec2(0.007, -0.007);   // puddles stay sharp; only the ripples bend them
      float fres = 0.04 + 0.96 * pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 5.);
      // wet asphalt stretches lights into vertical streaks: a few taps down the screen, tighter on standing water
      float str = (1. - clamp(wetRefl, 0., 1.)) * 0.012 + 0.002; vec3 rc = texture2D(uRefl, suv).rgb * 0.34;
      rc += texture2D(uRefl, suv + vec2(0., str)).rgb * 0.26 + texture2D(uRefl, suv + vec2(0., str * 2.2)).rgb * 0.22 + texture2D(uRefl, suv - vec2(0., str)).rgb * 0.18;
      totalEmissiveRadiance += rc * wetRefl * mix(0.35, 1.1, fres);
    }
#endif
  }`)
      .replace('#include <lights_fragment_begin>', NQ_LIGHTS_FRAG || '#include <lights_fragment_begin>')
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  iblIrradiance *= envK * 0.25 * nqOcc; radiance *= envK * mix(1.0, nqOcc, 0.6); irradiance *= nqOcc;')
      .replace('#include <fog_fragment>', `
  { float d = length(vNqW - cameraPosition);
#ifdef NQ_FOGFAR
    float fog = 1. - exp(-(d * uFogDen + max(d - uFogFar.x, 0.) * uFogFar.y));
#else
    float fog = 1. - exp(-d*uFogDen);
#endif
    fog *= mix(1.0, 0.55, clamp(vNqW.y/180., 0., 1.));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogCol, clamp(fog, 0., 1.));
#if NUM_POINT_LIGHTS > 0 && !defined(NQ_VM)
    // glowing air: light scattered by the rain haze between the eye and this surface, integrated
    // analytically along the view ray for every nearby point light (so walls and bodies occlude it)
    if (uAirK > 0.0001) {
      vec3 P = -vViewPosition; float t = length(P); vec3 v = P / max(t, 1e-4); vec3 air = vec3(0.);
      for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
        if (pointLights[i].color != vec3(0.)) {   // unused pool slots and lights whose range misses the ray add exactly 0
          vec3 Lp = pointLights[i].position; float b = dot(v, Lp); float h = sqrt(max(dot(Lp, Lp) - b * b, 0.) + 0.06);
          float rng = pointLights[i].distance;
          if (rng <= 0. || h < rng) {
            float I = (atan((t - b) / h) - atan(-b / h)) / h;
            float w = rng > 0. ? clamp(1. - h / rng, 0., 1.) : 1.;
            air += pointLights[i].color * I * w * w;
          }
        }
      }
      gl_FragColor.rgb += air * uAirK;
    }
#endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0,0.95,0.9)*1.5, flash); }`);
  };
  m.customProgramCacheKey = () => 'nq-' + kind;
  return m;
}
const MAT = { static: nqMaterial('static'), inst: nqMaterial('inst'), vm: nqMaterial('vm') };

/* ---------------- Geometry builder ---------------- */
/* ---------------- Geometry builder ---------------- */
// vertex layout: pos3 nor3 col3 mat2 => 11 floats
class Geo {
  constructor() { this.v = []; this.i = []; this.n = 0; }
  _vert(m, x, y, z, nx, ny, nz, c, e, mat) {
    let px = x, py = y, pz = z, qx = nx, qy = ny, qz = nz;
    if (m) {
      px = m[0] * x + m[4] * y + m[8] * z + m[12]; py = m[1] * x + m[5] * y + m[9] * z + m[13]; pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      // normals: use inverse-scale-aware transform (divide by squared column lengths)
      const l0 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2], l1 = m[4] * m[4] + m[5] * m[5] + m[6] * m[6], l2 = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
      const ax = nx / l0, ay = ny / l1, az = nz / l2;
      qx = m[0] * ax + m[4] * ay + m[8] * az; qy = m[1] * ax + m[5] * ay + m[9] * az; qz = m[2] * ax + m[6] * ay + m[10] * az;
      const L = Math.hypot(qx, qy, qz) || 1; qx /= L; qy /= L; qz /= L;
    }
    this.v.push(px, py, pz, qx, qy, qz, c[0], c[1], c[2], e, mat);
    return this.n++;
  }
  quad(m, p0, p1, p2, p3, nrm, c, e = 0, mat = 0) {
    const a = this._vert(m, ...p0, ...nrm, c, e, mat), b = this._vert(m, ...p1, ...nrm, c, e, mat), cc = this._vert(m, ...p2, ...nrm, c, e, mat), d = this._vert(m, ...p3, ...nrm, c, e, mat);
    this.i.push(a, b, cc, a, cc, d);
  }
  // unit box centered at origin (size 1) transformed by m
  box(m, c, e = 0, mat = 0, skipBottom = false) {
    const h = 0.5;
    this.quad(m, [h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0], c, e, mat);
    this.quad(m, [-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0], c, e, mat);
    this.quad(m, [-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0], c, e, mat);
    if (!skipBottom) this.quad(m, [-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0], c, e, mat);
    this.quad(m, [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1], c, e, mat);
    this.quad(m, [h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1], c, e, mat);
  }
  boxAt(x, y, z, sx, sy, sz, c, e = 0, mat = 0, ry = 0, rx = 0, rz = 0) { this.box(M4.trs(_t4a, x, y, z, rx, ry, rz, sx, sy, sz), c, e, mat); }
  // cylinder along Y, radius 0.5, height 1, centered
  cyl(m, c, e = 0, mat = 0, seg = 12, rTop = 0.5, rBot = 0.5, caps = true) {
    const base = this.n;
    for (let s = 0; s <= seg; s++) {
      const a = s / seg * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const slope = (rBot - rTop); const nl = Math.hypot(1, slope);
      this._vert(m, ca * rBot, -0.5, sa * rBot, ca / nl, slope / nl, sa / nl, c, e, mat);
      this._vert(m, ca * rTop, 0.5, sa * rTop, ca / nl, slope / nl, sa / nl, c, e, mat);
    }
    for (let s = 0; s < seg; s++) { const a = base + s * 2; this.i.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    if (caps) {
      const ct = this._vert(m, 0, 0.5, 0, 0, 1, 0, c, e, mat); const cb = this._vert(m, 0, -0.5, 0, 0, -1, 0, c, e, mat);
      const t0 = this.n; for (let s = 0; s <= seg; s++) { const a = s / seg * TAU; this._vert(m, Math.cos(a) * rTop, 0.5, Math.sin(a) * rTop, 0, 1, 0, c, e, mat); }
      const b0 = this.n; for (let s = 0; s <= seg; s++) { const a = s / seg * TAU; this._vert(m, Math.cos(a) * rBot, -0.5, Math.sin(a) * rBot, 0, -1, 0, c, e, mat); }
      for (let s = 0; s < seg; s++) { this.i.push(ct, t0 + s + 1, t0 + s); this.i.push(cb, b0 + s, b0 + s + 1); }
    }
  }
  sphere(m, c, e = 0, mat = 0, seg = 10, rings = 7) {
    const base = this.n;
    for (let r = 0; r <= rings; r++) {
      const v = r / rings * Math.PI, sv = Math.sin(v), cv = Math.cos(v);
      for (let s = 0; s <= seg; s++) { const u = s / seg * TAU; const x = Math.cos(u) * sv, y = cv, z = Math.sin(u) * sv; this._vert(m, x * 0.5, y * 0.5, z * 0.5, x, y, z, c, e, mat); }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) { const a = base + r * (seg + 1) + s, b = a + seg + 1; this.i.push(a, a + 1, b, b, a + 1, b + 1); }
  }
  // torus-ish ring in XZ plane
  ring(m, c, e, mat, R, r, seg = 32, tube = 6) {
    const base = this.n;
    for (let s = 0; s <= seg; s++) {
      const u = s / seg * TAU, cu = Math.cos(u), su = Math.sin(u);
      for (let t = 0; t <= tube; t++) {
        const v = t / tube * TAU, cv = Math.cos(v), sv = Math.sin(v);
        this._vert(m, (R + r * cv) * cu, r * sv, (R + r * cv) * su, cv * cu, sv, cv * su, c, e, mat);
      }
    }
    for (let s = 0; s < seg; s++) for (let t = 0; t < tube; t++) { const a = base + s * (tube + 1) + t, b = a + tube + 1; this.i.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  /* ---- modeling kit for props (m must be rigid: rotation + translation only) ---- */
  // re-orient triangles [i0, i1) so each faces along its vertices' normals
  _fixWinding(i0) {
    const I = this.i, v = this.v;
    for (let k = i0; k < I.length; k += 3) {
      const a = I[k] * 11, b = I[k + 1] * 11, c = I[k + 2] * 11;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nx * (v[a + 3] + v[b + 3] + v[c + 3]) + ny * (v[a + 4] + v[b + 4] + v[c + 4]) + nz * (v[a + 5] + v[b + 5] + v[c + 5]) < 0) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
    }
  }
  // box with rounded edges: size sx,sy,sz, edge radius r, s steps per bevel. taper = top face scale [tx, tz]
  rbox(m, sx, sy, sz, r, c, e = 0, mat = 0, s = 2, taper = null) {
    if (r <= 0.012 && !taper) { this.box(M4.mul(_t4c, m, M4.trs(_t4b, 0, 0, 0, 0, 0, 0, sx, sy, sz)), c, e, mat); return; }   // too small to see a bevel: 12 triangles
    const H = [sx / 2, sy / 2, sz / 2]; r = Math.min(r, H[0] * 0.98, H[1] * 0.98, H[2] * 0.98);
    const i0 = this.i.length, P = [0, 0, 0];
    const co = (h) => { const a = []; for (let k = 0; k <= s; k++) a.push(-h + r * k / s); for (let k = 0; k <= s; k++) a.push(h - r + r * k / s); return a; };
    for (let ax = 0; ax < 3; ax++) for (const sg of [-1, 1]) {
      const u = (ax + 1) % 3, w = (ax + 2) % 3, U = co(H[u]), W = co(H[w]), base = this.n;
      for (let j = 0; j < W.length; j++) for (let i = 0; i < U.length; i++) {
        P[ax] = sg * H[ax]; P[u] = U[i]; P[w] = W[j];
        let ox = 0, oy = 0, oz = 0; const q = [0, 0, 0];
        for (let k = 0; k < 3; k++) q[k] = Math.max(-(H[k] - r), Math.min(H[k] - r, P[k]));
        ox = P[0] - q[0]; oy = P[1] - q[1]; oz = P[2] - q[2]; const L = Math.hypot(ox, oy, oz) || 1;
        let x = q[0] + ox / L * r, y = q[1] + oy / L * r, z = q[2] + oz / L * r;
        if (taper) { const t = (y + H[1]) / sy; x *= 1 + (taper[0] - 1) * t; z *= 1 + (taper[1] - 1) * t; }
        this._vert(m, x, y, z, ox / L, oy / L, oz / L, c, e, mat);
      }
      const nu = U.length;
      for (let j = 0; j < W.length - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = base + j * nu + i; this.i.push(a, a + 1, a + nu + 1, a, a + nu + 1, a + nu); }
    }
    this._fixWinding(i0);
  }
  // surface of revolution around local Y. prof: [[r, y, color?, emissive?], ...] bottom to top; a repeated point makes a hard edge
  lathe(m, prof, c, e = 0, mat = 0, seg = 16, capTop = true, capBot = false) {
    const i0 = this.i.length, n = prof.length, NR = [];
    const segN = (a, b) => { const dr = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dr, dy) || 1; return [dy / L, -dr / L]; };
    for (let k = 0; k < n; k++) {
      const p = prof[k], pv = prof[k - 1], nx = prof[k + 1];
      const hardPrev = pv && pv[0] === p[0] && pv[1] === p[1], hardNext = nx && nx[0] === p[0] && nx[1] === p[1];
      let a = null, b = null;
      if (pv && !hardPrev) a = segN(pv, p); if (nx && !hardNext) b = segN(p, nx);
      const nn = a && b ? [a[0] + b[0], a[1] + b[1]] : (a || b || [1, 0]); const L = Math.hypot(nn[0], nn[1]) || 1; NR.push([nn[0] / L, nn[1] / L]);
    }
    const base = this.n;
    for (let k = 0; k < n; k++) {
      const [r, y] = prof[k], cc = prof[k][2] || c, ee = prof[k][3] !== undefined ? prof[k][3] : e;
      for (let sI = 0; sI <= seg; sI++) { const a = sI / seg * TAU, ca = Math.cos(a), sa = Math.sin(a); this._vert(m, ca * r, y, sa * r, ca * NR[k][0], NR[k][1], sa * NR[k][0], cc, ee, mat); }
    }
    for (let k = 0; k < n - 1; k++) {
      if (prof[k][0] === prof[k + 1][0] && prof[k][1] === prof[k + 1][1]) continue;
      for (let sI = 0; sI < seg; sI++) { const a = base + k * (seg + 1) + sI, b = a + seg + 1; this.i.push(a, a + 1, b + 1, a, b + 1, b); }
    }
    const cap = (p, up) => { const cc = p[2] || c, ee = p[3] !== undefined ? p[3] : e; const ct = this._vert(m, 0, p[1], 0, 0, up, 0, cc, ee, mat), r0 = this.n;
      for (let sI = 0; sI <= seg; sI++) { const a = sI / seg * TAU; this._vert(m, Math.cos(a) * p[0], p[1], Math.sin(a) * p[0], 0, up, 0, cc, ee, mat); }
      for (let sI = 0; sI < seg; sI++) this.i.push(ct, r0 + sI, r0 + sI + 1); };
    if (capTop && prof[n - 1][0] > 0) cap(prof[n - 1], 1); if (capBot && prof[0][0] > 0) cap(prof[0], -1);
    this._fixWinding(i0);
  }
  // tube along world-space points with per-point radius (branches, pipes, rails). cols: optional per-point colours
  tube(pts, rad, c, e = 0, mat = 0, sides = 6, capEnd = true, cols = null) {
    const i0 = this.i.length, n = pts.length, base = this.n;
    let T = [0, 1, 0], N = null;
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      if (!N) { N = Math.abs(ty) < 0.9 ? [0, 1, 0] : [1, 0, 0]; }
      // parallel transport: remove the tangent component from the previous normal
      const d = N[0] * tx + N[1] * ty + N[2] * tz; N = [N[0] - d * tx, N[1] - d * ty, N[2] - d * tz]; const nl = Math.hypot(...N) || 1; N = N.map(v => v / nl);
      const Bx = ty * N[2] - tz * N[1], By = tz * N[0] - tx * N[2], Bz = tx * N[1] - ty * N[0]; T = [tx, ty, tz];
      const cc = cols ? cols[k] : c;
      for (let sI = 0; sI <= sides; sI++) {
        const an = sI / sides * TAU, ca = Math.cos(an), sa = Math.sin(an), ox = N[0] * ca + Bx * sa, oy = N[1] * ca + By * sa, oz = N[2] * ca + Bz * sa;
        this._vert(null, p[0] + ox * rad[k], p[1] + oy * rad[k], p[2] + oz * rad[k], ox, oy, oz, cc, e, mat);
      }
    }
    for (let k = 0; k < n - 1; k++) for (let sI = 0; sI < sides; sI++) { const a = base + k * (sides + 1) + sI, b = a + sides + 1; this.i.push(a, a + 1, b + 1, a, b + 1, b); }
    if (capEnd && rad[n - 1] > 0.004) { const p = pts[n - 1], cc = cols ? cols[n - 1] : c, ct = this._vert(null, p[0] + T[0] * rad[n - 1] * 0.6, p[1] + T[1] * rad[n - 1] * 0.6, p[2] + T[2] * rad[n - 1] * 0.6, T[0], T[1], T[2], cc, e, mat); const r0 = base + (n - 1) * (sides + 1); for (let sI = 0; sI < sides; sI++) this.i.push(ct, r0 + sI, r0 + sI + 1); }
    this._fixWinding(i0);
  }
  // lumpy organic ball (foliage, rubbish bags): sphere displaced by 3D value noise, smooth normals rebuilt
  blob(m, rx, ry, rz, amp, seed, c, e = 0, mat = 0, seg = 12, rings = 8, emisMask = 0) {
    const i0 = this.i.length, base = this.n;
    const hsh = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453; return s - Math.floor(s); };
    const vn3 = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
      const L = (a, b, t) => a + (b - a) * t; const h = (i, j, k) => hsh(ix + i, iy + j, iz + k);
      return L(L(L(h(0, 0, 0), h(1, 0, 0), sx), L(h(0, 1, 0), h(1, 1, 0), sx), sy), L(L(h(0, 0, 1), h(1, 0, 1), sx), L(h(0, 1, 1), h(1, 1, 1), sx), sy), sz); };
    for (let r = 0; r <= rings; r++) {
      const vv = r / rings * Math.PI, sv = Math.sin(vv), cv = Math.cos(vv);
      for (let sI = 0; sI <= seg; sI++) {
        const u = (sI % seg) / seg * TAU, x = Math.cos(u) * sv, y = cv, z = Math.sin(u) * sv;
        const nz = vn3(x * 2.1, y * 2.1, z * 2.1) * 0.65 + vn3(x * 5.3, y * 5.3, z * 5.3) * 0.35, k = 1 + (nz - 0.5) * 2 * amp;
        const cv2 = 0.75 + 0.5 * vn3(x * 3.7 + 9, y * 3.7, z * 3.7);
        const ee = emisMask ? e * Math.max(0, (vn3(x * 6 + 3, y * 6, z * 6) - 0.55) * 4) * (0.4 + 0.6 * Math.max(0, y)) : e;
        this._vert(m, x * rx * k, y * ry * k, z * rz * k, 0, 0, 0, [c[0] * cv2, c[1] * cv2, c[2] * cv2], ee, mat);
      }
    }
    for (let r = 0; r < rings; r++) for (let sI = 0; sI < seg; sI++) { const a = base + r * (seg + 1) + sI, b = a + seg + 1; this.i.push(a, a + 1, b, b, a + 1, b + 1); }
    // smooth normals from the displaced shape (seam columns share a position, so average them too)
    const v = this.v, acc = new Float32Array((this.n - base) * 3);
    for (let k = i0; k < this.i.length; k += 3) {
      const A = this.i[k], B = this.i[k + 1], C = this.i[k + 2], a = A * 11, b = B * 11, cI = C * 11;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[cI] - v[a], wy = v[cI + 1] - v[a + 1], wz = v[cI + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const q of [A, B, C]) { const o = (q - base) * 3; acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz; }
    }
    const cx = [0, 0, 0]; for (let q = base; q < this.n; q++) { cx[0] += v[q * 11]; cx[1] += v[q * 11 + 1]; cx[2] += v[q * 11 + 2]; } for (let k = 0; k < 3; k++) cx[k] /= this.n - base;
    for (let r = 0; r <= rings; r++) { const a = (r * (seg + 1)) * 3, b = (r * (seg + 1) + seg) * 3; for (let k = 0; k < 3; k++) { const s = acc[a + k] + acc[b + k]; acc[a + k] = acc[b + k] = s; } }
    for (let q = base; q < this.n; q++) {
      const o = (q - base) * 3; let nx = acc[o], ny = acc[o + 1], nz = acc[o + 2];
      const ox = v[q * 11] - cx[0], oy = v[q * 11 + 1] - cx[1], oz = v[q * 11 + 2] - cx[2];
      if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }   // outward
      const L = Math.hypot(nx, ny, nz) || 1; v[q * 11 + 3] = nx / L; v[q * 11 + 4] = ny / L; v[q * 11 + 5] = nz / L;
    }
    this._fixWinding(i0);
  }
  // convex 2D profile [[x, y], ...] (counter-clockwise) extruded along local Z, centred, flat-shaded
  extrude(m, prof, len, c, e = 0, mat = 0) {
    const i0 = this.i.length, n = prof.length, h = len / 2;
    for (let k = 0; k < n; k++) {
      const a = prof[k], b = prof[(k + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
      this.quad(m, [a[0], a[1], -h], [b[0], b[1], -h], [b[0], b[1], h], [a[0], a[1], h], [nx, ny, 0], c, e, mat);
    }
    for (const sz of [-1, 1]) { const b0 = this.n; for (const p of prof) this._vert(m, p[0], p[1], sz * h, 0, 0, sz, c, e, mat); for (let k = 1; k < n - 1; k++) this.i.push(b0, b0 + k, b0 + k + 1); }
    this._fixWinding(i0);
  }
  build() {
    const n = this.n, v = this.v;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), nqm = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const o = i * 11; pos.set(v.slice(o, o + 3), i * 3); nor.set(v.slice(o + 3, o + 6), i * 3); col.set(v.slice(o + 6, o + 9), i * 3); nqm[i * 2] = v[o + 9]; nqm[i * 2 + 1] = v[o + 10]; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('nqm', new THREE.BufferAttribute(nqm, 2));
    g.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.i), 1) : new THREE.BufferAttribute(new Uint16Array(this.i), 1));
    g.computeBoundingSphere();
    return g;
  }
}

/* ---------------- Unit meshes ---------------- */
const MESH = {};
(function () {
  const W = [1, 1, 1];
  let g = new Geo(); g.box(null, W); MESH.box = g.build();
  g = new Geo(); g.cyl(null, W, 0, 0, 14); MESH.cyl = g.build();
  g = new Geo(); g.sphere(null, W, 0, 0, 16, 10); MESH.sphere = g.build();
  g = new Geo(); g.cyl(null, W, 0, 0, 4, 0.0, 0.5, true); MESH.cone = g.build();
  g = new Geo(); g.box(null, W, 0, 4); MESH.metal = g.build();
  g = new Geo(); g.ring(null, W, 0, 0, 1, 0.04, 40, 5); MESH.ring = g.build();
})();

/* ---------------- Canvas textures ---------------- */
function canvasTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* ---------------- sculpted models (built in Blender, packed by tools/pack_models.py) ---------------- */
const MODEL = {};
async function loadModels() {
  const bin = Uint8Array.from(atob(MODEL_BLOB), c => c.charCodeAt(0));
  let buf;
  try { buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); }
  catch (e) { console.warn('model decompress failed', e); return false; }
  for (const name in MODEL_MANIFEST) {
    const m = MODEL_MANIFEST[name], vc = m.vc;
    const P = new Uint16Array(buf, m.p, vc * 3), N = new Int8Array(buf, m.n, vc * 3), C = new Uint8Array(buf, m.c, vc * 4);
    const mat = name.startsWith('g_') || name.startsWith('brute_') ? 7 : 6;
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3), nqm = new Float32Array(vc * 2);
    for (let i = 0; i < vc; i++) {
      for (let k = 0; k < 3; k++) { pos[i * 3 + k] = m.min[k] + P[i * 3 + k] / 65535 * m.sc[k]; nor[i * 3 + k] = N[i * 3 + k] / 127; col[i * 3 + k] = C[i * 4 + k] / 255; }
      nqm[i * 2] = C[i * 4 + 3] / 255; nqm[i * 2 + 1] = mat;
    }
    const idx = m.i32 ? new Uint32Array(buf, m.i, m.ic) : new Uint16Array(buf, m.i, m.ic);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('nqm', new THREE.BufferAttribute(nqm, 2));
    g.setIndex(new THREE.BufferAttribute(idx.slice(), 1)); g.computeBoundingSphere();
    MODEL[name] = g;
  }
  return true;
}
