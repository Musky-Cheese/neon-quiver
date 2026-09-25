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
  uRimCol: { value: new THREE.Color() }, uEnvK: { value: 0.4 },
  uRefl: { value: null }, uReflOn: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uRain: { value: 0.5 },
};
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
function nqMaterial(kind) {   // kind: 'static' | 'inst' | 'vm' | 'zombie'
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  m.defines = {};
  if (kind === 'inst' || kind === 'vm') m.defines.NQ_INST = 1;
  if (kind === 'vm') m.defines.NQ_VM = 1;
  if (kind === 'zombie') m.defines.NQ_Z = 1;
  const own = kind === 'zombie' ? { uPT: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uPS: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uPE: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uHide: { value: new Float32Array(ZPARTS) }, uFlash: { value: 0 } } : {};
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
attribute float part; uniform float uHide[${ZPARTS}]; varying float vPart;
#else
attribute vec2 nqm;
#endif`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{ vec4 w = vec4(transformed, 1.0); vec3 wn = objectNormal;
#ifdef USE_INSTANCING
  w = instanceMatrix * w; wn = mat3(instanceMatrix) * wn;
#endif
  w = modelMatrix * w; vNqW = w.xyz; vNqN = normalize(mat3(modelMatrix) * wn); }
#ifdef NQ_Z
  vNqC = vec4(color); vNqM = vec2(color.a, 6.0); vPart = part;
  int pi = int(part + 0.5); if (uHide[pi] > 0.5) gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
#else
  vNqC = vec4(color.rgb, 1.0); vNqM = nqm;
#endif
#ifdef NQ_INST
  vITint = iTint; vIEmit = iEmit; vISkin = iSkin;
#endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vNqW; varying vec3 vNqN; varying vec4 vNqC; varying vec2 vNqM;
uniform float uTime, uNeon, uWin, uWinWarm, uGrid, uDyn, uDynVM, uWet, uFogDen, uEnvK, uReflOn, uRain; uniform vec3 uFogCol, uRimCol; uniform sampler2D uRefl; uniform vec2 uRes;
${NOISE_GLSL}
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
varying float vPart; uniform vec3 uPT[${ZPARTS}]; uniform vec3 uPS[${ZPARTS}]; uniform vec3 uPE[${ZPARTS}]; uniform float uFlash;
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
  vec3 base = vNqC.rgb * tint;
  vec3 emis = base * vNqM.x * uNeon + iemit * dynK;
  float rough = 0.72, metal = 0.0, rimK = 0.0, envK = uEnvK;
  float bumpH = 0.0, wetRefl = 0.0;
  vec3 N0 = normalize(vNqN);
  vec2 fcW = abs(N0.x) > 0.5 ? vec2(vNqW.z, vNqW.y) : vec2(vNqW.x, vNqW.y);
  // rain streaks running down walls: darker, glossier stripes that fade toward the top
  float streak = vn(vec2(fcW.x * 3.1, fcW.y * 0.08 - uTime * 0.02)) * vn(vec2(fcW.x * 11.7, fcW.y * 0.3));
  if ((mat > 0.5 && mat < 1.5) || (mat > 8.5 && mat < 9.5)) {   // facades with windows (concrete panels or brick)
    if (abs(N0.y) < 0.5) {
      vec2 fc = abs(N0.x) > 0.5 ? vec2(vNqW.z, vNqW.y) : vec2(vNqW.x, vNqW.y);
      vec2 cell = fc / vec2(2.4, 3.3); vec2 id = floor(cell); vec2 f = fract(cell);
      float win = step(0.16,f.x)*step(f.x,0.84)*step(0.22,f.y)*step(f.y,0.78);
      float bseed = h21(floor(vNqW.xz/37.) + N0.xz*3.1);
      float seed = h21(id*1.37 + bseed*91.);
      float lit = step(0.7 - bseed*0.22, seed) * step(1.2, vNqW.y);
      float flick = step(0.997, h21(id + floor(uTime*4.)));
      vec3 wc = seed > 0.93 ? vec3(1.0,0.25,0.6) : seed > 0.84 ? vec3(0.25,0.85,1.0) : vec3(1.0,0.68,0.38);
      wc = mix(wc, vec3(1.0,0.66,0.36)*(0.7+0.6*h21(id+3.7)), uWinWarm);
      // inside the glass: a room gradient, mullions, and some blinds half drawn
      float mull = max(1. - smoothstep(0.0, 0.012, abs(f.x - 0.5)), 1. - smoothstep(0.0, 0.015, abs(f.y - 0.62)));
      float blind = h21(id + 5.3) < 0.35 ? step(0.5, fract(f.y * 18.)) * step(1. - h21(id + 9.1) * 0.8, 1. - f.y) : 0.;
      float room = (0.45 + 0.55 * smoothstep(0.2, 0.8, f.y)) * (0.4 + 0.6 * h21(id + 1.9));
      float wk = win * lit * (1. - flick) * (1. - mull * 0.85) * (1. - blind * 0.7) * room;
      emis += wk * wc * uWin * (mat > 8.5 ? 0.7 : 1.0);
      vec3 wall;
      if (mat > 8.5) {        // brick tenements
        vec2 br = nqBrick(fc);
        wall = base * (0.75 + 0.5 * br.x) * (1. - br.y * 0.55);
        bumpH = -br.y * 0.012;
      } else {                // concrete panels: seams every floor and bay, blotchy weathering
        float seam = max(1. - smoothstep(0., 0.035, abs(f.y - 0.02)), 1. - smoothstep(0., 0.02, abs(f.x - 0.02)));
        float panel = 0.8 + 0.25 * vn(fc * vec2(0.9, 0.35) + bseed * 17.) + 0.1 * vn(fc * 4.3);
        wall = base * panel * (1. - seam * 0.45);
        bumpH = -seam * 0.01;
      }
      float grime = smoothstep(4., 0., fc.y) * 0.35 + streak * 0.5;
      wall *= 1. - grime * 0.5;
      base = mix(wall, vec3(0.015,0.02,0.04), win);
      bumpH -= win * 0.03;
      rough = mix(mix(0.85, 0.45, streak * uWet), 0.08, win); metal = win*0.2; envK = uEnvK*mix(0.6 + streak, 1.6, win);
    } else if (mat > 8.5) { base *= 0.8; }
  } else if (mat > 1.5 && mat < 2.5) {      // plaza tiles, wet
    vec2 q = vNqW.xz/4.; vec2 gd = abs(fract(q-0.5)-0.5); vec2 fw = max(fwidth(q), vec2(1e-4));
    vec2 l2 = 1. - smoothstep(vec2(0.012), vec2(0.012)+fw*1.5, gd);
    float line = max(l2.x,l2.y) * (0.35 + 0.65*clamp(0.02/max(fw.x,fw.y),0.,1.));
    float pud = smoothstep(0.52,0.66, vn(vNqW.xz*0.18));
    float tileV = 0.9 + 0.2*h21(floor(q));
    emis += vec3(0.1,0.55,1.0)*line*uGrid*(1.-pud*0.6);
    float stain = vn(vNqW.xz * 0.7) * 0.25 + vn(vNqW.xz * 3.7) * 0.12;
    base = mix(base*tileV*(1.-line*0.5)*(1. - stain), base*0.35, pud);
    bumpH = -line * 0.01 + pud * nqRipple(vNqW.xz * 2.2, uTime) * 0.002 * uRain;
    rough = mix(0.62, mix(0.62, 0.04, clamp(uWet, 0., 1.)), pud); envK = uEnvK*(1.0 + pud*0.6*uWet);
    wetRefl = mix(0.04, 0.9, pud) * clamp(uWet, 0., 1.);
  } else if (mat > 2.5 && mat < 3.5) {      // asphalt
    float pud = smoothstep(0.5,0.7, vn(vNqW.xz*0.12));
    float lane = step(abs(vNqW.x),0.12)*step(0.5,fract(vNqW.z/6.))*step(abs(vNqW.x),6.);
    float lane2 = step(abs(vNqW.z),0.12)*step(0.5,fract(vNqW.x/6.))*step(abs(vNqW.z),6.);
    emis += vec3(1.0,0.75,0.3)*(lane+lane2)*uGrid*0.55*step(40.5,max(abs(vNqW.x),abs(vNqW.z)));
    float grain = vn(vNqW.xz*3.1), fine = vn(vNqW.xz*23.);
    float crack = smoothstep(0.02, 0., abs(vn(vNqW.xz*0.9) - 0.5)) * 0.6;
    base *= (1.-pud*0.6) * (0.78 + 0.3*grain + 0.1*fine) * (1. - crack * 0.5);
    bumpH = fine * 0.0025 - crack * 0.006 + pud * nqRipple(vNqW.xz * 2.2, uTime) * 0.002 * uRain;
    rough = mix(0.85, mix(0.8, 0.05, clamp(uWet,0.,1.)), pud); envK = uEnvK*(1.0 + pud*0.6*uWet);
    wetRefl = mix(0.03, 0.9, pud) * clamp(uWet, 0., 1.);
  } else if (mat > 3.5 && mat < 4.5) {      // brushed metal
    float br = vn(vec2(fcW.x * 60., fcW.y * 1.5));
    rough = 0.3 + br * 0.15; metal = 0.65; rimK = 1.0; bumpH = br * 0.0015;
    base *= 0.9 + 0.2 * vn(vNqW.xz * 2.1 + vNqW.y);
  } else if (mat > 7.5 && mat < 8.5) {      // corrugated / painted steel: ribs, rust, scratches
    float along = abs(N0.y) > 0.5 ? vNqW.x : fcW.x;
    float rib = sin(along * 25.1);
    float rust = smoothstep(0.55, 0.8, vn(fcW * 1.3 + N0.xz * 5.) + streak * 0.4);
    base = mix(base * (0.85 + 0.15 * rib), vec3(0.16, 0.07, 0.03), rust * 0.7) * (1. - smoothstep(1.5, 0., vNqW.y) * 0.25);
    bumpH = rib * 0.006; rough = mix(0.5, 0.85, rust); metal = 0.45 * (1. - rust); rimK = 1.0;
  } else if (mat > 5.5 && mat < 7.5) {      // sculpted characters / armour: rgb = (ao, cloth mask, blood mask)
    float ao = vNqC.r, clm = vNqC.g, bl = vNqC.b;
    base = mix(skin, tint, clm);
    base = mix(base, vec3(0.13,0.008,0.006), bl*0.92);
    base *= ao;
    emis = iemit * vNqM.x * dynK;
    float armour = step(6.5, mat);
#ifdef NQ_Z
    armour = step(6.5, vPart) * step(vPart, 8.5);
#endif
    rough = mix(mix(0.58, 0.2, bl), 0.32, armour); metal = armour*0.7; rimK = 1.0;
  } else if (mat > 4.5 && mat < 5.5) {      // hologram
    float sl = 0.65 + 0.35*sin(vNqW.y*60. + uTime*8.);
    emis += base*sl*1.6; base *= 0.0;
  } else { rimK = 1.0; }
  diffuseColor.rgb = base;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {   // derivative bump from the procedural height (view space)
    vec3 sp = -vViewPosition, dpx = dFdx(sp), dpy = dFdy(sp);
    float dhx = dFdx(bumpH), dhy = dFdy(bumpH);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
    if (abs(det) > 1e-9) normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2));
  }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = rough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = metal;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { float rim = pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 3.);
#ifdef NQ_VM
    rim *= 0.25;
#endif
    totalEmissiveRadiance = emis + (uRimCol*rim*0.35 + base*uRimCol*1.6*rim*0.6)*rimK;
#ifndef NQ_VM
    // planar reflection of the street (rendered mirrored by r3.js), rippled by the bumped normal
    if (wetRefl > 0.0 && uReflOn > 0.5) {
      vec2 suv = gl_FragCoord.xy / uRes; suv.y = 1. - suv.y;
      vec3 wn = normalize((vec4(normal, 0.) * viewMatrix).xyz);
      suv += wn.xz * vec2(0.025, -0.025);
      float fres = 0.04 + 0.96 * pow(1. - clamp(dot(normal, normalize(vViewPosition)), 0., 1.), 5.);
      totalEmissiveRadiance += texture2D(uRefl, suv).rgb * wetRefl * mix(0.2, 1.0, fres);
    }
#endif
  }`)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  iblIrradiance *= envK * 0.25; radiance *= envK;')
      .replace('#include <fog_fragment>', `
  { float d = length(vNqW - cameraPosition); float fog = 1. - exp(-d*uFogDen);
    fog *= mix(1.0, 0.55, clamp(vNqW.y/180., 0., 1.));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogCol, clamp(fog, 0., 1.));
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
