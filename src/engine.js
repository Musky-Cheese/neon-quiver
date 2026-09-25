'use strict';
/* ============================================================
   NEON QUIVER — tiny WebGL2 engine (math, meshes, shaders, post)
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

/* ---------------- GL context ---------------- */
const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__NQ_CAPTURE });
if (!gl) { document.getElementById('nogl').hidden = false; throw new Error('WebGL2 unavailable'); }
const extCBF = gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('OES_texture_float_linear');

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); console.error(log, src); throw new Error('shader: ' + log); }
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

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
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.v), gl.STATIC_DRAW);
    const big = this.n > 65535;
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(this.i) : new Uint16Array(this.i), gl.STATIC_DRAW);
    const S = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 36);
    gl.bindVertexArray(null);
    return { vao, count: this.i.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
}

/* ---------------- Shaders ---------------- */
const NOISE_GLSL = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;
const MAX_LIGHTS = 16;
const MAIN_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aMat;
uniform mat4 uProj, uView, uModel;
out vec3 vW; out vec3 vN; out vec3 vC; out vec2 vM;
void main(){ vec4 w=uModel*vec4(aPos,1.); vW=w.xyz; vN=mat3(uModel)*aNor; vC=aCol; vM=aMat; gl_Position=uProj*uView*w; }`;
const MAIN_FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec3 vC; in vec2 vM;
uniform vec3 uCam; uniform vec4 uTint; uniform vec3 uEmit; uniform float uTime; uniform float uFlash; uniform float uRim; uniform vec3 uSkin;
uniform vec3 uFogCol; uniform float uFogDen;
uniform vec3 uAmbLo, uAmbHi, uSunCol, uSunDir, uRimCol; uniform float uNeon, uWin, uWinWarm, uGrid, uDyn, uWet;
uniform int uNL; uniform vec4 uLP[${MAX_LIGHTS}]; uniform vec3 uLC[${MAX_LIGHTS}];
out vec4 o;
${NOISE_GLSL}
void main(){
  vec3 N=normalize(vN);
  vec3 base=vC*uTint.rgb;
  float mat=vM.y;
  vec3 emis=base*vM.x*uNeon + uEmit*uDyn;
  vec3 V=normalize(uCam-vW);
  float spec=0.12, rough=24.;
  if(mat>0.5 && mat<1.5){ // facade with windows
    if(abs(N.y)<0.5){
      vec2 fc = abs(N.x)>0.5 ? vec2(vW.z, vW.y) : vec2(vW.x, vW.y);
      vec2 cell = fc/vec2(2.4,3.3); vec2 id=floor(cell); vec2 f=fract(cell);
      float win = step(0.16,f.x)*step(f.x,0.84)*step(0.22,f.y)*step(f.y,0.78);
      float bseed = h21(floor(vW.xz/37.)+N.xz*3.1);
      float seed = h21(id*1.37 + bseed*91.);
      float lit = step(0.7 - bseed*0.22, seed) * step(1.2, vW.y);
      float flick = step(0.997, h21(id+floor(uTime*4.)));
      vec3 wc = seed>0.93? vec3(1.0,0.25,0.6) : seed>0.84? vec3(0.25,0.85,1.0) : vec3(1.0,0.68,0.38);
      wc = mix(wc, vec3(1.0,0.66,0.36)*(0.7+0.6*h21(id+3.7)), uWinWarm);
      emis += win*lit*(1.-flick)*wc*uWin;
      base = mix(base, vec3(0.015,0.02,0.04), win);
      spec = 0.1+0.8*win; rough = 40.+win*60.;
    }
  } else if(mat>1.5 && mat<2.5){ // plaza tiles, wet
    vec2 q = vW.xz/4.; vec2 gd = abs(fract(q-0.5)-0.5); vec2 fw = max(fwidth(q), vec2(1e-4));
    vec2 l2 = 1. - smoothstep(vec2(0.012), vec2(0.012)+fw*1.5, gd);
    float line = max(l2.x,l2.y) * (0.35 + 0.65*clamp(0.02/max(fw.x,fw.y),0.,1.));
    float pud = smoothstep(0.52,0.66, vn(vW.xz*0.18));
    emis += vec3(0.1,0.55,1.0)*line*uGrid*(1.-pud*0.6);
    base = mix(base*(1.-line*0.5), base*0.35, pud);
    spec = 0.35 + pud*1.6*uWet; rough = 30.+pud*260.;
  } else if(mat>2.5 && mat<3.5){ // asphalt
    float pud = smoothstep(0.5,0.7, vn(vW.xz*0.12));
    float lane = step(abs(abs(vW.x)-0.0),0.12)*step(0.5,fract(vW.z/6.)) * step(abs(vW.z),1e5)*step(abs(vW.x),6.);
    float lane2 = step(abs(vW.z),0.12)*step(0.5,fract(vW.x/6.))*step(abs(vW.z),6.);
    emis += vec3(1.0,0.75,0.3)*(lane+lane2)*uGrid*0.55*step(40.5,max(abs(vW.x),abs(vW.z)));
    base *= 1.-pud*0.6; spec=0.2+pud*1.4*uWet; rough=20.+pud*200.;
  } else if(mat>3.5 && mat<4.5){ // metal panel
    spec=0.7; rough=48.;
  } else if(mat>5.5 && mat<7.5){ // sculpted characters / armour: vC = (ao, cloth mask, blood mask), vM.x = glow mask
    float ao=vC.r, clm=vC.g, bl=vC.b;
    base = mix(uSkin, uTint.rgb, clm);
    base = mix(base, vec3(0.13,0.008,0.006), bl*0.92);
    base *= ao;
    emis = uEmit*vM.x*uDyn;
    float armour = step(6.5, mat);
    spec = mix(0.18 + bl*0.9, 0.9, armour); rough = mix(18. + bl*60., 60., armour);
  } else if(mat>4.5 && mat<5.5){ // hologram (unlit, scanlines)
    float sl = 0.65+0.35*sin(vW.y*60.+uTime*8.);
    o=vec4(base*sl*1.6+emis, 1.);
    float d=length(vW-uCam); o.rgb=mix(o.rgb,uFogCol,clamp(1.-exp(-d*uFogDen*0.6),0.,1.)); return;
  }
  float hemi = N.y*0.5+0.5;
  vec3 amb = mix(uAmbLo, uAmbHi, hemi);
  vec3 L = uSunDir;
  vec3 col = base*(amb + uSunCol*max(dot(N,L),0.));
  vec3 H0=normalize(L+V); vec3 sp = uSunCol*1.15*pow(max(dot(N,H0),0.),rough)*spec;
  for(int i=0;i<${MAX_LIGHTS};i++){
    if(i>=uNL) break;
    vec3 d=uLP[i].xyz-vW; float dist=length(d); float r=uLP[i].w;
    float att=clamp(1.-dist/r,0.,1.); att*=att;
    if(att<=0.) continue;
    vec3 l=d/max(dist,1e-3);
    col += base*uLC[i]*max(dot(N,l),0.)*att;
    vec3 H=normalize(l+V); sp += uLC[i]*pow(max(dot(N,H),0.),rough)*att*spec;
  }
  if(mat<0.5 || (mat>3.5 && mat<4.5) || mat>5.5){ float rim=pow(1.-clamp(dot(N,V),0.,1.),3.); col += (uRimCol*rim*0.35 + base*uRimCol*1.6*rim*0.6)*uRim; }
  col += sp + emis;
  col = mix(col, vec3(1.0,0.95,0.9), uFlash);
  float dist=length(vW-uCam);
  float fog = 1.-exp(-dist*uFogDen);
  fog *= mix(1.0, 0.55, clamp(vW.y/180.,0.,1.)); // tall towers poke through the haze
  col = mix(col, uFogCol, clamp(fog,0.,1.));
  o=vec4(col, uTint.a);
}`;

const SKY_VS = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
out vec2 vP; void main(){ vP=P[gl_VertexID]; gl_Position=vec4(vP,0.9999,1.); }`;
const SKY_FS = `#version 300 es
precision highp float; in vec2 vP; uniform mat4 uInvVP; uniform float uTime; uniform vec3 uFogCol; uniform vec3 uZen, uMid, uGlow, uCloud, uDiscCol, uDiscDir; uniform float uStars; out vec4 o;
${NOISE_GLSL}
void main(){
  vec4 a=uInvVP*vec4(vP,1.,1.); vec4 b=uInvVP*vec4(vP,-1.,1.);
  vec3 d=normalize(a.xyz/a.w-b.xyz/b.w);
  float h=d.y;
  vec3 zen=uZen, mid=uMid, hor=uFogCol*1.25;
  vec3 c=mix(hor, mid, smoothstep(0.0,0.18,h)); c=mix(c, zen, smoothstep(0.15,0.7,h));
  // city glow near horizon
  c += uGlow*exp(-max(h,0.)*14.)*0.5;
  // clouds lit from below
  vec2 uv=d.xz/max(h+0.08,0.02);
  float cl = vn(uv*0.9+vec2(uTime*0.01,0.)) * vn(uv*2.3-vec2(uTime*0.02,uTime*0.01));
  cl = smoothstep(0.15,0.6,cl)*smoothstep(0.02,0.25,h)*(1.-smoothstep(0.5,0.9,h));
  c = mix(c, uCloud, cl*0.7);
  // stars
  vec2 sp = floor(vec2(atan(d.z,d.x)*180., h*180.));
  float st = step(0.9975, h21(sp)) * smoothstep(0.25,0.6,h) * (1.-cl);
  c += vec3(0.8,0.85,1.)*st*uStars*(0.5+0.5*sin(uTime*3.+sp.x));
  // moon
  vec3 md=normalize(uDiscDir);
  float m=dot(d,md);
  c += uDiscCol*smoothstep(0.9993,0.9996,m)*1.6;
  c += uDiscCol*0.4*pow(max(m,0.),220.)*0.8 + uDiscCol*0.08*pow(max(m,0.),8.);
  o=vec4(c,1.);
}`;

const PT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in float aSize;
uniform mat4 uProj, uView; uniform float uH; out vec4 vC; out float vBlend;
void main(){ vec4 v=uView*vec4(aPos,1.); gl_Position=uProj*v; gl_PointSize=clamp(abs(aSize)*uH/max(-v.z,0.05),1.,256.); vC=aCol; vBlend=aSize<0.?1.:0.; }`;
const PT_FS = `#version 300 es
precision mediump float; in vec4 vC; in float vBlend; out vec4 o;
void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); float a=smoothstep(0.5,0.0,d);
  if(vBlend>0.5){ float s=smoothstep(0.5,0.3,d)*vC.a; o=vec4(vC.rgb*s, s); } else { a*=a; o=vec4(vC.rgb*a*vC.a, 0.); } }`;

const RAIN_VS = `#version 300 es
layout(location=0) in vec4 aP; // x z y seed
layout(location=1) in float aEnd;
uniform mat4 uProj, uView; uniform vec3 uCam; uniform float uTime;
out float vA;
void main(){
  float S=50.;
  float x = mod(aP.x - uCam.x, S) - S*0.5 + uCam.x;
  float z = mod(aP.y - uCam.z, S) - S*0.5 + uCam.z;
  float y = mod(aP.z - uTime*(24.+aP.w*8.), 36.) - 6. + uCam.y;
  vec3 p = vec3(x + aEnd*0.18, y + aEnd*0.9, z + aEnd*0.05);
  vA = aEnd;
  gl_Position = uProj*uView*vec4(p,1.);
}`;
const RAIN_FS = `#version 300 es
precision mediump float; in float vA; uniform float uAlpha; uniform vec3 uRainCol; out vec4 o;
void main(){ o=vec4(uRainCol*uAlpha*(0.3+vA*0.7),0.); }`;

const TEX_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uProj, uView, uModel; out vec2 vUV; out vec3 vW;
void main(){ vec4 w=uModel*vec4(aPos,1.); vW=w.xyz; vUV=aUV; gl_Position=uProj*uView*w; }`;
const TEX_FS = `#version 300 es
precision highp float; in vec2 vUV; in vec3 vW; uniform sampler2D uTex; uniform vec3 uCol; uniform float uTime; uniform float uMode;
uniform vec3 uCam; uniform vec3 uFogCol; uniform float uFogDen; uniform float uSeed; uniform float uA; out vec4 o;
${NOISE_GLSL}
void main(){
  vec2 uv=vUV;
  float flick=1.;
  if(uMode>0.5){ // holo billboard: glitch rows + scanlines
    float row=floor(uv.y*24.); float g=step(0.93,h21(vec2(row,floor(uTime*6.)+uSeed)));
    uv.x += g*(h21(vec2(row,uTime))-0.5)*0.08;
    flick = 0.8+0.2*sin(uv.y*300.+uTime*20.);
  } else {
    flick = 1. - step(0.985, h21(vec2(floor(uTime*9.), uSeed)))*0.85;
  }
  vec4 t=texture(uTex,uv);
  vec3 c=t.rgb*uCol*flick;
  float d=length(vW-uCam); c=mix(c,uFogCol,clamp((1.-exp(-d*uFogDen))*0.8,0.,1.));
  o=vec4(c, t.a*uA);
}`;

const FS_VS = `#version 300 es
const vec2 P[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));
out vec2 vUV; void main(){ vUV=P[gl_VertexID]*0.5+0.5; gl_Position=vec4(P[gl_VertexID],0.,1.); }`;
const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; uniform float uThr; out vec4 o;
void main(){ vec3 c=texture(uTex,vUV).rgb; float l=max(max(c.r,c.g),c.b); o=vec4(c*smoothstep(uThr,uThr+0.6,l),1.); }`;
const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){ vec3 c=texture(uTex,vUV).rgb*0.227;
  c+=texture(uTex,vUV+uDir*1.385).rgb*0.316; c+=texture(uTex,vUV-uDir*1.385).rgb*0.316;
  c+=texture(uTex,vUV+uDir*3.231).rgb*0.07; c+=texture(uTex,vUV-uDir*3.231).rgb*0.07; o=vec4(c,1.); }`;
const COMP_FS = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uScene, uB1, uB2; uniform float uTime, uDmg, uLow, uBloom, uExpo, uAberr, uSat; uniform vec3 uGrade, uLift; out vec4 o;
${NOISE_GLSL}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
void main(){
  vec2 uv=vUV; vec2 cc=uv-0.5; float r2=dot(cc,cc);
  float ab = (0.0015 + uDmg*0.006 + uAberr)*r2*4.;
  vec3 s; s.r=texture(uScene,uv+cc*ab).r; s.g=texture(uScene,uv).g; s.b=texture(uScene,uv-cc*ab).b;
  vec3 b=texture(uB1,uv).rgb*0.9 + texture(uB2,uv).rgb*1.1;
  vec3 c = s + b*uBloom;
  c *= uExpo;
  float lum=dot(c,vec3(0.3,0.59,0.11));
  c = mix(c, vec3(lum)*vec3(1.1,0.9,0.9), uLow*0.55);
  c = aces(c);
  c *= uGrade; float lm=dot(c,vec3(0.3,0.59,0.11)); c = mix(vec3(lm), c, uSat); c += uLift*(1.-c);
  c = pow(clamp(c,0.,1.), vec3(1./2.2));
  // vignette + damage
  float vig = smoothstep(0.85,0.2,sqrt(r2)*1.25);
  c *= mix(0.72,1.,vig);
  float edge = smoothstep(0.25,0.75,sqrt(r2)*1.4);
  c = mix(c, vec3(0.75,0.02,0.08), edge*clamp(uDmg,0.,1.)*0.75);
  c = mix(c, vec3(0.5,0.0,0.05), edge*uLow*(0.25+0.2*sin(uTime*6.)));
  // grain + scan
  c += (h21(uv*vec2(1920.,1080.)+fract(uTime)*100.)-0.5)*0.035;
  c *= 0.985+0.015*sin(uv.y*900.);
  o=vec4(c,1.);
}`;

const PROG = {
  main: program(MAIN_VS, MAIN_FS), sky: program(SKY_VS, SKY_FS), pt: program(PT_VS, PT_FS), rain: program(RAIN_VS, RAIN_FS),
  tex: program(TEX_VS, TEX_FS), bright: program(FS_VS, BRIGHT_FS), blur: program(FS_VS, BLUR_FS), comp: program(FS_VS, COMP_FS),
};
const emptyVAO = gl.createVertexArray();

/* ---------------- Unit meshes ---------------- */
const MESH = {};
(function () {
  const W = [1, 1, 1];
  let g = new Geo(); g.box(null, W); MESH.box = g.build();
  g = new Geo(); g.cyl(null, W, 0, 0, 14); MESH.cyl = g.build();
  g = new Geo(); g.sphere(null, W, 0, 0, 12, 8); MESH.sphere = g.build();
  g = new Geo(); g.cyl(null, W, 0, 0, 4, 0.0, 0.5, true); MESH.cone = g.build(); // pyramid-ish tip
  g = new Geo(); g.box(null, W, 0, 4); MESH.metal = g.build();
  g = new Geo(); g.ring(null, W, 0, 0, 1, 0.04, 40, 5); MESH.ring = g.build();
})();

/* ---------------- Render targets ---------------- */
const RT = { w: 0, h: 0 };
function makeTex(w, h, hdr) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function makeFB(tex) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; }
let HDR = !!extCBF;
function resizeTargets(w, h) {
  if (RT.w === w && RT.h === h) return;
  for (const k of ['sceneTex', 't1', 't2', 't3', 't4']) if (RT[k]) gl.deleteTexture(RT[k]);
  for (const k of ['msFB', 'sceneFB', 'f1', 'f2', 'f3', 'f4']) if (RT[k]) gl.deleteFramebuffer(RT[k]);
  if (RT.msColor) gl.deleteRenderbuffer(RT.msColor); if (RT.msDepth) gl.deleteRenderbuffer(RT.msDepth);
  RT.w = w; RT.h = h;
  const fmt = HDR ? gl.RGBA16F : gl.RGBA8;
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  RT.msFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, RT.msFB);
  RT.msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, RT.msColor);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, RT.msColor);
  RT.msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, RT.msDepth);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, RT.msDepth);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    if (HDR) { HDR = false; RT.w = 0; return resizeTargets(w, h); }
  }
  RT.sceneTex = makeTex(w, h, HDR); RT.sceneFB = makeFB(RT.sceneTex);
  const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
  RT.t1 = makeTex(hw, hh, HDR); RT.f1 = makeFB(RT.t1); RT.t2 = makeTex(hw, hh, HDR); RT.f2 = makeFB(RT.t2);
  RT.t3 = makeTex(qw, qh, HDR); RT.f3 = makeFB(RT.t3); RT.t4 = makeTex(qw, qh, HDR); RT.f4 = makeFB(RT.t4);
  RT.hw = hw; RT.hh = hh; RT.qw = qw; RT.qh = qh;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/* ---------------- Canvas textures ---------------- */
function canvasTex(cv) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
// textured quad mesh (unit plane in XY facing +Z)
const QUAD = (function () {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, 0, 0, 1, .5, -.5, 0, 1, 1, .5, .5, 0, 1, 0, -.5, -.5, 0, 0, 1, .5, .5, 0, 1, 0, -.5, .5, 0, 0, 0]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null); return vao;
})();

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
    const v = new Float32Array(vc * 11);
    for (let i = 0; i < vc; i++) {
      const o = i * 11;
      for (let k = 0; k < 3; k++) { v[o + k] = m.min[k] + P[i * 3 + k] / 65535 * m.sc[k]; v[o + 3 + k] = N[i * 3 + k] / 127; }
      v[o + 6] = C[i * 4] / 255; v[o + 7] = C[i * 4 + 1] / 255; v[o + 8] = C[i * 4 + 2] / 255; v[o + 9] = C[i * 4 + 3] / 255; v[o + 10] = mat;
    }
    const idx = m.i32 ? new Uint32Array(buf, m.i, m.ic) : new Uint16Array(buf, m.i, m.ic);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const S = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 36);
    gl.bindVertexArray(null);
    MODEL[name] = { vao, count: m.ic, type: m.i32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
  return true;
}
