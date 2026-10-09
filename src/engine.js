'use strict';
/* ============================================================
   NEON QUIVER — math + geometry helpers on top of three.js
   ============================================================ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const MAX_PL = 16;             // point-light pool (static shop/fountain lights + dynamic flashes); the shader's air-glow loop runs over the same count
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hex(h, k = 1) { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k]; }

/* ---------------- mat4 (column-major) ---------------- */
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
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
    if (rx === 0 && rz === 0) {   // yaw only (most props, pickups, decals): the same expressions with cos 0 = 1 and sin 0 = 0 written in, bit for bit
      const cy = Math.cos(ry), syr = Math.sin(ry);
      m[0] = (cy + (syr * 0) * 0) * sx; m[1] = 0 * sx; m[2] = (-syr + (cy * 0) * 0) * sx; m[3] = 0;
      m[4] = (-cy * 0 + syr * 0) * sy; m[5] = sy; m[6] = (syr * 0 + cy * 0) * sy; m[7] = 0;
      m[8] = syr * sz; m[9] = (-0) * sz; m[10] = cy * sz; m[11] = 0;
      m[12] = tx; m[13] = ty; m[14] = tz; m[15] = 1;
      return m;
    }
    const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
    m[0] = (cy * cz + syr * sxr * szr) * sx; m[1] = (cx * szr) * sx; m[2] = (-syr * cz + cy * sxr * szr) * sx; m[3] = 0;
    m[4] = (-cy * szr + syr * sxr * cz) * sy; m[5] = (cx * cz) * sy; m[6] = (syr * szr + cy * sxr * cz) * sy; m[7] = 0;
    m[8] = (syr * cx) * sz; m[9] = (-sxr) * sz; m[10] = (cy * cx) * sz; m[11] = 0;
    m[12] = tx; m[13] = ty; m[14] = tz; m[15] = 1;
    return m;
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
const _t4b = M4.create(), _t4c = M4.create();

/* ---------------- renderer ---------------- */
const canvas = document.getElementById('gl');
let renderer;
// three r186 passes the identity texture-view swizzle as the newer string form ('rgba'); browsers from before that
// spec change (Chromium 141 and older) reject the string. Identity is the default, so leaving it out changes nothing.
if (typeof GPUTexture !== 'undefined') {
  const cv = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (d) { if (d && d.swizzle === 'rgba') { const { swizzle, ...rest } = d; return cv.call(this, rest); } return cv.call(this, d); };
}
// One renderer: WebGPURenderer on WebGPU, or on its own WebGL2 backend where src/boot.js found no working WebGPU
// (or ?gpu=webgl). Same TSL shaders either way. NQ_BACKEND says which one is drawing (Settings, ?prof overlay).
let NQ_BACKEND = 'webgpu';
try {
  const trackTimestamp = new URLSearchParams(location.search).has('prof');   // ?prof=1: per-pass GPU timing (r3.js profiler)
  const forceWebGL = !!(window.NQ_BOOT && window.NQ_BOOT.forceWebGL);
  // A textured Meshy model (colour + normal map) beside the city's own maps (occlusion, rooms, mirror, the Ultra texture
  // strips, the env map) and six lamp shadows plus the moon's samples 17 textures, one over WebGPU's default 16, and that
  // pipeline fails to build. Most adapters allow far more: ask for up to 32 where the hardware has them.
  let requiredLimits;
  try {
    if (!forceWebGL && navigator.gpu) {
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }), L = a && a.limits;
      if (L) { requiredLimits = {}; for (const k of ['maxSampledTexturesPerShaderStage', 'maxSamplersPerShaderStage']) if (L[k] > 16) requiredLimits[k] = Math.min(L[k], 32); }
    }
  } catch (e) { requiredLimits = undefined; }
  renderer = new THREE.WebGPURenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', trackTimestamp, forceWebGL, requiredLimits });
  renderer.onDeviceLost = (info) => gpuDeviceLost(info);   // game.js: pause and explain, offer a reload
  await renderer.init();
  NQ_BACKEND = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
  if (window.NQ_BOOT) window.NQ_BOOT.backend = NQ_BACKEND;
} catch (e) { document.getElementById('nogl').hidden = false; throw e; }
// Note on shader programs: three r186 compiles a separate program per InstancedMesh per pass (its instance buffers are baked
// into the compiled state, so they can't be shared), and every compile stalls the GPU for tens of ms. The game therefore
// creates every instanced batch it will ever draw at boot and draws each of them once in the warm-up frame (r3.js
// warmShaders / flushList), so no program is built mid-game.
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
  uReflOn: { value: 0 }, uRain: { value: 0.5 },
  // baked sky-visibility map of the city (r3.js buildOcclusion): x0, z0, 1/width, 1/depth in metres
  uOcc: { value: null }, uOccB: { value: new THREE.Vector4(0, 0, 0, 0) }, uIndoor: { value: null },
  // Ultra: CC0 Poly Haven texture arrays (textures/*.jpg, packed by tools/pack_textures.py), triplanar in world space
  uTexA: { value: null }, uTexN: { value: null }, uTexR: { value: null }, uTexOn: { value: 0 },
  uSnowCov: { value: 0 },   // weather.js: how snowed-over the city is
  uTexM: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0.5, 0.5, 0.5, 0.5)) },   // per layer: mean linear albedo (rgb), mean roughness (a)
  // per layer: x = 1 / tile size in metres, y = normal strength   [asphalt, concrete, brick, rust, corrugated, pavers, plaster, cast concrete]
  uTexS: { value: [[1 / 3.5, 1.0], [1 / 3, 0.8], [1 / 2.4, 1.1], [1 / 2, 0.9], [1 / 2, 1.0], [1 / 2.6, 1.0], [1 / 3, 0.7], [1 / 3, 0.9]].map(([a, b]) => new THREE.Vector2(a, b)) },
};
const TEX_LAYERS = ['asphalt', 'concrete', 'brick', 'rust', 'corrugated', 'pavers', 'plaster', 'castconc'];
/* One physically-based material family for everything solid.
   Static geometry carries   color = albedo (or ao/cloth/blood masks for sculpts), nqm = (emissive k, material id).
   Instanced items carry     iTint (rgb + flash), iEmit, iSkin per instance.
   Skinned zombies carry     color = (ao, cloth, blood, glow) and a per-vertex part id that indexes per-zombie uniform arrays. */
const ZPARTS = 10;
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
