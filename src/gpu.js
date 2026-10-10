/* ============================================================
   NEON QUIVER — every shader in the game, in TSL
   Node materials for WebGPURenderer (WebGPU, or its WebGL2 backend): the shared surface material (windows, puddles,
   surface detail, vertex-mask tinting for the infected and the gauntlets), the sky dome, light cones, signs, decals,
   particles, rain, snow, halos, glass, and the post chain (MSAA, GTAO, bloom, colour grade) on a RenderPipeline.
   r3.js drives it (renderGPU).
   ============================================================ */
const { Fn, If, Loop, Discard, float, int, vec2, vec3, vec4, uniform, uniformArray, reference, attribute, texture, property, varyingProperty,
  positionLocal, positionWorld, positionView, positionViewDirection, normalWorldGeometry, normalView, materialNormal, materialReference, cameraPosition,
  cameraViewMatrix, cameraWorldMatrix, screenUV, uv, diffuseColor, mrt, output, mix, smoothstep, step: stepT, fract, floor, abs, min, max, clamp: clampT, sin, cos, pow, exp, sqrt,
  atan, length, normalize, dot, cross, sign, dFdx, dFdy, fwidth, select, pass, convertToTexture, cameraProjectionMatrix, varying, modelViewMatrix, renderGroup } = THREE.TSL;

/* ---- the shared uniforms (NQU, engine.js) as nodes: each one reads its NQU entry at every render call ---- */
const NQN = {};
for (const [k, t] of Object.entries({ uTime: 'float', uFogCol: 'color', uFogDen: 'float', uNeon: 'float', uWin: 'float', uWinWarm: 'float', uGrid: 'float', uDyn: 'float',
  uDynVM: 'float', uWet: 'float', uRimCol: 'color', uEnvK: 'float', uAirK: 'float', uZFill: 'float', uZRim: 'float', uWind: 'float', uReflOn: 'float', uRain: 'float',
  uOccB: 'vec4', uTexOn: 'float', uSnowCov: 'float' })) NQN[k] = uniform(NQU[k].value, t).setGroup(renderGroup).onRenderUpdate(() => NQU[k].value);
// shared by every draw: uploaded once per render pass, not once per object (the per-object path cost ~25 uniforms x every draw)
NQN.uTexM = uniformArray(NQU.uTexM.value, 'vec4').setGroup(renderGroup); NQN.uTexS = uniformArray(NQU.uTexS.value, 'vec2').setGroup(renderGroup);
// textures: one node each, pointed at whatever NQU holds (gpuSyncTextures, every frame)
const GPU_BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); GPU_BLACK.needsUpdate = true;
const GPU_WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); GPU_WHITE.needsUpdate = true;
const GPU_ARR = new THREE.DataArrayTexture(new Uint8Array(4 * 8).fill(128), 1, 1, 8); GPU_ARR.needsUpdate = true;
const TEXN = { occ: texture(GPU_WHITE), indoor: texture(GPU_BLACK), litter: texture(GPU_BLACK), refl: texture(GPU_BLACK), texA: texture(GPU_ARR), texN: texture(GPU_ARR), texR: texture(GPU_ARR) };
function gpuSyncTextures() {
  TEXN.occ.value = NQU.uOcc.value || GPU_WHITE; TEXN.indoor.value = NQU.uIndoor.value || GPU_BLACK; TEXN.litter.value = NQU.uLitter.value || GPU_BLACK;
  TEXN.texA.value = NQU.uTexA.value || GPU_ARR; TEXN.texN.value = NQU.uTexN.value || GPU_ARR; TEXN.texR.value = NQU.uTexR.value || GPU_ARR;
}
// point lights for the glowing air (world position + range, colour x intensity): r3.js updateLights3 fills them
const AIR = { pos: Array.from({ length: MAX_PL }, () => new THREE.Vector4()), col: Array.from({ length: MAX_PL }, () => new THREE.Vector4()) };
AIR.posN = uniformArray(AIR.pos, 'vec4').setGroup(renderGroup); AIR.colN = uniformArray(AIR.col, 'vec4').setGroup(renderGroup);

/* ---- noise: real shader functions, not inlined at each of the ~60 call sites ---- */
const h21 = Fn(([q]) => { const p = fract(q.mul(vec2(123.34, 456.21))).toVar(); p.addAssign(dot(p, p.add(45.32))); return fract(p.x.mul(p.y)); })
  .setLayout({ name: 'nqH21', type: 'float', inputs: [{ name: 'q', type: 'vec2' }] });
const vn = Fn(([p]) => {
  const i = floor(p).toVar(), f = fract(p).toVar(); f.assign(f.mul(f).mul(f.mul(-2).add(3)));
  return mix(mix(h21(i), h21(i.add(vec2(1, 0))), f.x), mix(h21(i.add(vec2(0, 1))), h21(i.add(vec2(1, 1))), f.x), f.y);
}).setLayout({ name: 'nqVN', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });
const gmod = (x, y) => x.sub(floor(x.div(y)).mul(y));   // GLSL mod (WGSL % truncates toward zero)
// Fallen litter under the trees: every petal or leaf drawn on its own, not noise blobs. Two offset layers of jittered cells,
// at most one piece per cell, each turned and sized at random. A cherry petal is narrow at the stalk with a notched round
// tip; a leaf is pointed at both ends with a darker midrib. Edges are antialiased by their pixel footprint, and once a
// piece shrinks to a few pixels the layer fades to its average colour, so the ground never shimmers in the distance.
// p: ground position in cells, dens: 0..1 how many cells hold a piece, leaf: 0 petals, 1 leaves. Returns colour + coverage.
const nqLitter = Fn(([p, dens, leaf]) => {
  const col = vec3(0).toVar(), cov = float(0).toVar();
  const avg = mix(vec3(0.92, 0.55, 0.7), vec3(0.52, 0.3, 0.1), leaf);
  for (let L = 0; L < 2; L++) {
    const q = p.add(vec2(L * 0.37, L * 0.71)), id = floor(q), f = fract(q).sub(0.5);
    const h1 = h21(id.add(L * 17.3)), h2 = h21(id.add(5.17 + L)), h3 = h21(id.add(9.71 + L * 3.1)), h4 = h21(id.add(3.3 + L * 7.7));
    const on = stepT(h1, dens.mul(L === 0 ? 1 : 0.75));
    const a = h2.mul(6.2831), cs = cos(a), sn = sin(a);
    const d = f.sub(vec2(h3, h4).sub(0.5).mul(0.22));
    const lp = vec2(d.x.mul(cs).add(d.y.mul(sn)), d.y.mul(cs).sub(d.x.mul(sn))).div(mix(0.24, 0.34, h3)).toVar();
    const x = lp.x, ax = abs(lp.y), t = clampT(x.mul(0.5).add(0.5), 0, 1);
    const sPet = max(ax.sub(sqrt(max(x.mul(x).oneMinus(), 0)).mul(t.mul(0.32).add(0.2))), x.sub(ax.mul(1.6)).sub(0.74));
    const sLeaf = ax.sub(x.mul(x).oneMinus().mul(0.3));
    const s = mix(sPet, sLeaf, leaf), aa = max(length(fwidth(lp)), 1e-4);
    const m = smoothstep(aa, aa.negate(), s).mul(on);
    // petals: white to deep pink, a few browning; leaves: olive, amber, rust and dead brown, with a darker midrib
    const pc = mix(vec3(1, 0.74, 0.84), vec3(0.95, 0.36, 0.58), h4).mul(t.mul(0.25).add(0.75));
    const pcA = mix(pc, vec3(0.42, 0.27, 0.22), stepT(0.86, h2).mul(0.65));
    const lc0 = mix(vec3(0.42, 0.4, 0.12), vec3(0.8, 0.46, 0.1), smoothstep(0.2, 0.55, h4));
    const lc = mix(lc0, vec3(0.62, 0.17, 0.07), smoothstep(0.6, 0.8, h4)).mul(mix(1, 0.6, stepT(0.82, h4))).mul(smoothstep(0, 0.05, ax).mul(0.3).add(0.7));
    col.assign(mix(col, mix(pcA, lc, leaf), m)); cov.assign(max(cov, m));
  }
  const fp = fwidth(p), far = smoothstep(0.12, 0.35, max(fp.x, fp.y));
  col.assign(mix(col, avg, far)); cov.assign(mix(cov, dens.mul(mix(0.32, 0.28, leaf)), far));
  return vec4(col, cov);
}).setLayout({ name: 'nqLitter', type: 'vec4', inputs: [{ name: 'p', type: 'vec2' }, { name: 'dens', type: 'float' }, { name: 'leaf', type: 'float' }] });
// rain rings on standing water: two drops per 0.45 m cell, each an expanding, fading ring
const nqRipple = Fn(([p, t]) => {
  const id = floor(p).toVar(), f = fract(p).sub(0.5).toVar(), h = float(0).toVar();
  for (let k = 0; k < 2; k++) {
    const o = vec2(h21(id.add(k * 7.1)), h21(id.add(13.7 + k))).sub(0.5);
    const ph = fract(t.mul(h21(id.add(k * 2.3)).mul(0.4).add(0.8)).add(h21(id.mul(1.7).add(k * 3.3)))).toVar();
    const d = length(f.sub(o.mul(0.5))), r = ph.mul(0.42);
    h.addAssign(sin(d.sub(r).mul(70)).mul(smoothstep(0.07, 0, abs(d.sub(r)))).mul(ph.oneMinus()).mul(ph.oneMinus()));
  }
  return h;
}).setLayout({ name: 'nqRipple', type: 'float', inputs: [{ name: 'p', type: 'vec2' }, { name: 't', type: 'float' }] });
// bricks in facade space: colour variation + mortar mask
const nqBrick = Fn(([fc]) => {
  const b = fc.div(vec2(0.62, 0.24)).toVar(); b.x.addAssign(stepT(1, gmod(floor(b.y), float(2))).mul(0.5));
  const f = fract(b), fw = max(fwidth(b), vec2(1e-3)).mul(1.5);
  const m = smoothstep(0.06, fw.x.add(0.06), min(f.x, f.x.oneMinus())).mul(smoothstep(0.1, fw.y.add(0.1), min(f.y, f.y.oneMinus()))).oneMinus();
  return vec2(h21(floor(b)), m);
}).setLayout({ name: 'nqBrick', type: 'vec2', inputs: [{ name: 'fc', type: 'vec2' }] });
// triplanar Ultra texture layer: colour (rgb) + AO/roughness, and a whiteout-blended world normal
const nqTri = (L, W, N, sc) => {
  const w = pow(abs(N), vec3(4)).toVar(); w.divAssign(w.x.add(w.y).add(w.z));
  const ux = W.zy.mul(sc), uy = W.xz.mul(sc), uz = W.xy.mul(sc);
  const a = vec3(0).toVar(), ro = vec2(0).toVar(), nx = vec3(0).toVar(), ny = vec3(0).toVar(), nz = vec3(0).toVar();
  for (const [wk, u, n] of [[w.x, ux, nx], [w.y, uy, ny], [w.z, uz, nz]]) If(wk.greaterThan(0.02), () => {
    a.addAssign(TEXN.texA.sample(u).depth(L).rgb.mul(wk)); ro.addAssign(TEXN.texR.sample(u).depth(L).rg.mul(wk)); n.assign(TEXN.texN.sample(u).depth(L).rgb.mul(2).sub(1));
  });
  a.divAssign(max(w.x.mul(stepT(0.02, w.x)).add(w.y.mul(stepT(0.02, w.y))).add(w.z.mul(stepT(0.02, w.z))), 1e-3));
  nx.assign(vec3(nx.xy.add(N.zy), abs(nx.z).mul(N.x))); ny.assign(vec3(ny.xy.add(N.xz), abs(ny.z).mul(N.y))); nz.assign(vec3(nz.xy.add(N.xy), abs(nz.z).mul(N.z)));
  return { a, ro, n: normalize(nx.zyx.mul(w.x).add(ny.xzy.mul(w.y)).add(nz.xyz.mul(w.z))) };
};

/* ---- one physically based material family for everything solid ----
   Values the surface code works out and the later stages need (bump height, emission, rim, wet mirror, sky
   visibility...) travel as shader-wide properties. */
const NQP = {
  base: property('vec3', 'nqBase'), emis: property('vec3', 'nqEmis'), rough: property('float', 'nqRough'), metal: property('float', 'nqMetal'),
  rimK: property('float', 'nqRimK'), envK: property('float', 'nqEnvK'), bump: property('float', 'nqBump'), wetRefl: property('float', 'nqWetRefl'),
  occ: property('float', 'nqOcc'), texN: property('vec3', 'nqTexN'), texK: property('float', 'nqTexK'), flash: property('float', 'nqFlash'), N0: property('vec3', 'nqN0'),
};
class NQLighting extends THREE.PhysicalLightingModel {
  indirect(builder) {   // sky visibility and envK scale the ambient and the env map
    const c = builder.context;
    c.iblIrradiance.mulAssign(NQP.envK.mul(0.25).mul(NQP.occ)); c.radiance.mulAssign(NQP.envK.mul(mix(1, NQP.occ, 0.6))); c.irradiance.mulAssign(NQP.occ);
    super.indirect(builder);
  }
}
// per-body values of the infected live on the mesh (rig.js), so one compiled pipeline serves every zombie, shadow pass included.
// The arrays need a fixed name: WGSL names an unnamed array uniform after a fresh node id, which made each body's shader unique.
const Z_ARRAYS = new Set(['uPT', 'uPS', 'uPE', 'uHide']);
const zRef = (k, t) => { const r = reference('userData.u.' + k + '.value', t); return Z_ARRAYS.has(k) ? r.setName('z_' + k) : r; };
// The same goes for three's skinning, which reads each skeleton's bones through an unnamed buffer: every body compiled its own
// vertex program for every pass it entered (world, mirror, each shadow-casting lamp), a ~30 ms stall mid-wave each time. With a
// fixed name all bodies share one program per pass; each mesh still binds its own bone matrices.
{ const set = THREE.ReferenceNode.prototype.setNodeType;
  THREE.ReferenceNode.prototype.setNodeType = function (t) { if (this.name === null && this.property === 'skeleton.boneMatrices') this.name = 'boneMatrices'; return set.call(this, t); }; }
let ZOMBIE_POSITION = null;
class NQMaterial extends THREE.MeshStandardNodeMaterial {
  constructor(kind) {
    super({ roughness: 0.7, metalness: 0 });
    this.nqKind = kind; this.defines = {}; this.fog = false; this.lights = true;
    this.roughnessNode = NQP.rough; this.metalnessNode = NQP.metal;
    const zp = kind === 'zombie', inst = kind === 'inst' || kind === 'vm';
    // One position node for every infected body (rig.js makes a material per body). The shadow pass borrows each object's
    // positionNode onto its one shared depth material and keys that material's program on the borrowed node, so a node built
    // per material gave every zombie its own shadow program per light: compiled when it first stepped into a lamp, mid-wave.
    if (zp) this.positionNode = ZOMBIE_POSITION || (ZOMBIE_POSITION = Fn(() => {   // a lost head, jaw or helmet: its triangles collapse to a point
      const pi = int(attribute('part', 'float').add(0.5));
      return select(zRef('uHide', 'float').element(pi).greaterThan(0.5), vec3(0), positionLocal);
    })());
    else if (!inst) this.positionNode = Fn(() => {   // foliage (and the blossom cards): a slow lean downwind plus a quick leaf flutter
      const p = positionLocal.toVar(), nqm = attribute('nqm', 'vec2');
      const D0 = this.defines, on = D0.NQ_CARDS ? float(1) : D0.NQ_TREE ? nqm.x : stepT(13.5, nqm.y).mul(stepT(nqm.y, 14.5));   // NQ_TREE: nqm.x is the leaf mask
      const t = NQN.uTime, hk = smoothstep(1.2, 4.5, p.y).mul(on);
      const lean = NQN.uWind.mul(sin(t.mul(0.8).add(p.x.mul(0.11)).add(p.z.mul(0.09))).mul(0.45).add(0.55));
      return p.add(vec3(lean.mul(0.16).mul(hk), 0, 0)).add(vec3(sin(t.mul(6.3).add(p.y.mul(4.1)).add(p.x.mul(2.7))), sin(t.mul(5.1).add(p.z.mul(3.3))).mul(0.5), cos(t.mul(5.7).add(p.x.mul(3.9))))
        .mul(0.014).mul(NQN.uWind.add(0.35)).mul(hk));
    })();
    this.normalNode = Fn(() => {   // derivative bump from the procedural height (view space), then the Ultra photo normals
      const n = materialNormal.toVar(), sp = positionView, dpx = dFdx(sp), dpy = dFdy(sp), dhx = dFdx(NQP.bump), dhy = dFdy(NQP.bump);
      const r1 = cross(dpy, n), r2 = cross(n, dpx), det = dot(dpx, r1);
      If(abs(det).greaterThan(1e-9), () => { n.assign(normalize(abs(det).mul(n).sub(sign(det).mul(dhx.mul(r1).add(dhy.mul(r2)))))); });
      if (!zp && kind !== 'vm') If(NQP.texK.greaterThan(0), () => { n.assign(normalize(n.add(cameraViewMatrix.mul(vec4(NQP.texN.sub(NQP.N0), 0)).xyz.mul(NQP.texK)))); });
      return n;
    })();
    this.emissiveNode = Fn(() => {
      const N = normalView, ndv = clampT(dot(N, positionViewDirection), 0, 1);
      const rim = pow(ndv.oneMinus(), 3).mul(kind === 'vm' ? 0.25 : 1);
      const tot = NQP.emis.add(NQN.uRimCol.mul(rim).mul(0.35).add(NQP.base.mul(NQN.uRimCol).mul(1.6).mul(rim).mul(0.6)).mul(NQP.rimK)).toVar();
      if (zp) {   // readability: a soft camera-side fill that fades with distance, and the city's neon edging the silhouette
        const zd = length(positionWorld.sub(cameraPosition));
        tot.addAssign(NQP.base.mul(NQN.uZFill).mul(ndv.mul(0.7).add(0.3)).mul(smoothstep(8, 38, zd).oneMinus()));
        const rz = pow(ndv.oneMinus(), 2.6).mul(smoothstep(-0.2, 0.4, N.y.add(0.3)));
        tot.addAssign(mix(vec3(1.0, 0.31, 0.64), vec3(0.22, 0.88, 0.95), stepT(0, N.x)).mul(rz).mul(NQN.uZRim));
      }
      if (kind !== 'vm') If(NQP.wetRefl.greaterThan(0).and(NQN.uReflOn.greaterThan(0.5)), () => {
        // the street mirrored (r3.js renderReflection), rippled by the bumped normal; rows run top-down here, so v offsets flip
        const wn = normalize(cameraWorldMatrix.mul(vec4(N, 0)).xyz);
        const suv = vec2(screenUV.x, screenUV.y.oneMinus()).add(wn.xz.mul(vec2(0.007, 0.007))).toVar();
        const fres = pow(ndv.oneMinus(), 5).mul(0.96).add(0.04);
        const str = clampT(NQP.wetRefl, 0, 1).oneMinus().mul(0.012).add(0.002);   // wet asphalt stretches lights into streaks
        const rc = TEXN.refl.sample(suv).rgb.mul(0.34).add(TEXN.refl.sample(suv.sub(vec2(0, str))).rgb.mul(0.26))
          .add(TEXN.refl.sample(suv.sub(vec2(0, str.mul(2.2)))).rgb.mul(0.22)).add(TEXN.refl.sample(suv.add(vec2(0, str))).rgb.mul(0.18));
        // kept faint, and the mirrored lights capped below the lens streak threshold: the street should hint at what stands
        // on it, not lay a second row of lamps across the floor
        tot.addAssign(min(rc, vec3(0.8)).mul(NQP.wetRefl).mul(mix(0.12, 0.45, fres)));
      });
      return tot;
    })();
  }
  customProgramCacheKey() { const d = this.defines; return 'nqg-' + this.nqKind + (d.NQ_ZTEX ? '-tex' : '') + (d.NQ_CARDS ? '-cards' : '') + (d.NQ_TREE ? '-tree' : '') + (d.NQ_MAPGLOW ? '-glow' + d.NQ_MAPGLOW : ''); }
  setupLightingModel() { return new NQLighting(); }
  setupDiffuseColor(builder) { nqSurface(this, builder); }
  setupOutput(builder, out) { return super.setupOutput(builder, nqFog(this, out)); }
}

/* ---- the surface: material id -> albedo, roughness, metal, emission, bump ---- */
function nqSurface(material, builder) {
  const kind = material.nqKind, D = material.defines, zp = kind === 'zombie', vm = kind === 'vm', inst = kind === 'inst' || vm, city = !zp && !vm;
  const geo = builder.geometry, ca = geo.getAttribute('color');
  const col = ca ? (ca.itemSize === 4 ? attribute('color', 'vec4') : vec4(attribute('color', 'vec3'), 1)) : vec4(0, 0, 0, 1);
  const W = positionWorld, N0 = NQP.N0, T = NQN.uTime;
  N0.assign(normalWorldGeometry);
  const tint = vec3(1).toVar(), skin = vec3(0.5).toVar(), iemit = vec3(0).toVar(), flash = NQP.flash; flash.assign(0);
  const C = vec4(col.rgb, 1).toVar(), mat = float(0).toVar(), mx = float(0).toVar(); let part = float(0);
  if (zp) {
    part = attribute('part', 'float');
    const pi = int(part.add(0.5));
    C.assign(col); mx.assign(col.a); mat.assign(D.NQ_ZTEX ? 25 : 6);
    tint.assign(zRef('uPT', 'vec3').element(pi)); skin.assign(zRef('uPS', 'vec3').element(pi)); iemit.assign(zRef('uPE', 'vec3').element(pi)); flash.assign(zRef('uFlash', 'float'));
  } else {
    const nqm = attribute('nqm', 'vec2'); mx.assign(nqm.x); mat.assign(nqm.y);
    // car paint and tree tone only: the colour three carries per instance (InstancedMesh) or per batched object (BatchedMesh: the wrecks, the trees)
    if (builder.object.instanceColor) If(mat.greaterThan(24.5).and(mat.lessThan(26.5)), () => { C.rgb.mulAssign(varyingProperty('vec3', 'vInstanceColor')); });
    else if (builder.object.isBatchedMesh && builder.object._colorsTexture) If(mat.greaterThan(24.5).and(mat.lessThan(26.5)), () => { C.rgb.mulAssign(varyingProperty('vec4', 'vBatchColor').rgb); });
  }
  if (inst) { const t = attribute('iTint', 'vec4'); tint.assign(t.rgb); flash.assign(t.a); iemit.assign(attribute('iEmit', 'vec3')); skin.assign(attribute('iSkin', 'vec3')); }
  const dynK = vm ? NQN.uDynVM : NQN.uDyn;
  const base = NQP.base; base.assign(C.rgb.mul(tint));
  const hasMap = !!material.map, mapS = hasMap ? materialReference('map', 'texture') : null, nqTex = hasMap ? mapS.rgb : vec3(1);
  if (hasMap) base.mulAssign(nqTex);
  const emis = NQP.emis; emis.assign(base.mul(mx).mul(NQN.uNeon).add(iemit.mul(dynK)));
  if (D.NQ_MAPGLOW) {   // the model's painted neon (saturated cyan/teal texels) lights up like the city's signs
    const cy = smoothstep(0.06, 0.22, min(nqTex.g, nqTex.b).sub(nqTex.r)).mul(smoothstep(0.12, 0.35, max(nqTex.g, nqTex.b)));
    emis.addAssign(nqTex.mul(cy).mul(+D.NQ_MAPGLOW).mul(NQN.uNeon));
  }
  const rough = NQP.rough, metal = NQP.metal, rimK = NQP.rimK, envK = NQP.envK, bumpH = NQP.bump, wetRefl = NQP.wetRefl, nqOcc = NQP.occ;
  rough.assign(0.72); metal.assign(0); rimK.assign(0); envK.assign(NQN.uEnvK); bumpH.assign(0); wetRefl.assign(0); nqOcc.assign(1);
  const nqTL = float(-1).toVar(), nqTS = float(0).toVar(), nqIn = float(0).toVar();
  const lit = vec2(0).toVar();   // fallen litter density here: x cherry petals, y leaves (r3.js buildOcclusion bakes it)
  if (city) {   // baked occlusion: how much open sky this spot sees; inside a walk-in room it is dry and evenly lit
    const B = NQN.uOccB;
    If(B.z.greaterThan(0), () => {
      const a = TEXN.occ.sample(W.xz.add(N0.xz.mul(0.4)).sub(B.xy).mul(B.zw)).r.toVar();
      a.assign(mix(a, 1, smoothstep(0, 14, W.y).mul(a)));
      nqOcc.assign(mix(a, 1, stepT(0.5, N0.y).mul(stepT(1.2, W.y))));
      nqIn.assign(stepT(0.5, TEXN.indoor.sample(W.xz.add(N0.xz.mul(0.3)).sub(B.xy).mul(B.zw)).r).mul(stepT(W.y, 4.5)));
      nqOcc.assign(mix(nqOcc, 0.82, nqIn));
      lit.assign(TEXN.litter.sample(W.xz.sub(B.xy).mul(B.zw)).rg);
    });
  }
  const wetK = NQN.uWet.mul(nqIn.oneMinus()).toVar(), wet1 = clampT(wetK, 0, 1);
  const fcW = select(abs(N0.x).greaterThan(0.5), vec2(W.z, W.y), vec2(W.x, W.y)).toVar();
  const M = (a, b) => mat.greaterThan(a).and(mat.lessThan(b));
  const streak = float(0).toVar();   // rain streaks down walls: only facades, corrugated, glass, car paint and cast concrete pay for them
  If(M(0.5, 1.5).or(M(7.5, 11.5)).or(M(15.5, 16.5)), () => { streak.assign(vn(vec2(fcW.x.mul(3.1), fcW.y.mul(0.08).sub(T.mul(0.02)))).mul(vn(vec2(fcW.x.mul(11.7), fcW.y.mul(0.3)))).mul(nqIn.oneMinus())); });
  const pud2 = (s, k, wide) => max(smoothstep(...wide, vn(W.xz.mul(s))), smoothstep(0.8, 0.5, nqOcc).mul(k));
  // petals and leaves lying where the trees dropped them, in drifts; pb: a light scatter of petals everywhere (the gardens)
  const litter = (pb = 0) => {
    const pk = lit.x.add(pb), leafK = stepT(pk, lit.y.sub(1e-3)), dens = clampT(max(pk, lit.y).mul(smoothstep(0.15, 0.85, vn(W.xz.mul(0.45).add(vn(W.xz.mul(1.7)).mul(0.6)))).mul(1.1).add(0.25)), 0, 0.95);   // swept into drifts
    If(dens.greaterThan(0.015).and(N0.y.greaterThan(0.5)), () => {
      const lc = nqLitter(W.xz.mul(mix(10, 6, leafK)), dens, leafK).toVar();
      base.assign(mix(base, lc.rgb, lc.a)); rough.assign(mix(rough, 0.62, lc.a)); wetRefl.mulAssign(lc.a.mul(-0.7).add(1)); bumpH.addAssign(lc.a.mul(0.002)); nqTS.mulAssign(lc.a.oneMinus());   // the photo detail stays on the ground beneath
      emis.addAssign(lc.rgb.mul(lc.a).mul(leafK.oneMinus()).mul(NQN.uNeon.mul(0.06).add(0.03)));   // petals glow faintly, like the canopy
    });
  };
  If(M(0.5, 1.5).or(M(8.5, 9.5)), () => {   // facades with windows (concrete panels or brick)
    If(abs(N0.y).lessThan(0.5), () => {
      const fc = fcW, cell = fc.div(vec2(2.4, 3.3)), id = floor(cell).toVar(), f = fract(cell).toVar();
      // Far windows span a few pixels, so hard window edges, mullions, blinds and the room parallax resolved to a different
      // value every time the camera moved: whole windows seemed to light up and go out as you walked. The edges are now
      // antialiased by their pixel footprint, and the fine detail fades to its average below ~22 px per window (det);
      // up close nothing changes.
      const fw = fwidth(cell).toVar(), px = float(1).div(max(fw.x, fw.y).add(1e-5)).toVar(), det = smoothstep(5, 22, px).toVar();
      const edge = (e, v, w) => smoothstep(e.sub(w), e.add(w), v);
      const win = edge(float(0.16), f.x, fw.x).mul(edge(float(0.84), f.x, fw.x).oneMinus()).mul(edge(float(0.22), f.y, fw.y)).mul(edge(float(0.78), f.y, fw.y).oneMinus()).toVar();
      // The building seed used to hash the raw normal. three derives the world normal from the view-space one through the
      // camera matrix, so it carried rounding noise that changed with every turn of the head, and the hash turned that
      // noise into a different set of lit windows each frame. Rounded, the normal's contribution is exact per facade.
      const bseed = h21(floor(W.xz.div(37)).add(floor(N0.xz.mul(3.1).add(0.5)))).toVar();
      const seed = h21(id.mul(1.37).add(bseed.mul(91))).toVar();
      const floorLit = stepT(0.968, h21(vec2(id.y.mul(1.7).add(0.3), bseed.mul(53.1)))).mul(stepT(4.5, W.y)).toVar();   // an office floor someone left on
      const lit = max(stepT(bseed.mul(-0.1).add(0.82), seed), floorLit).mul(stepT(1.2, W.y));   // dead city: most rooms still dark
      const wc = select(seed.greaterThan(0.93), vec3(1.0, 0.25, 0.6), select(seed.greaterThan(0.84), vec3(0.25, 0.85, 1.0), vec3(1.0, 0.68, 0.38))).toVar();
      wc.assign(mix(wc, vec3(1.0, 0.66, 0.36).mul(h21(id.add(3.7)).mul(0.6).add(0.7)), NQN.uWinWarm));
      const tv = stepT(0.78, h21(id.add(8.8))).mul(floorLit.oneMinus());   // a TV still playing to an empty room
      wc.assign(mix(wc, vec3(0.36, 0.6, 1.0).mul(vn(vec2(T.mul(4.7).add(seed.mul(40)), seed.mul(9))).mul(0.55).add(0.45)), tv));
      wc.assign(mix(wc, vec3(0.8, 0.9, 1.0), floorLit));
      // inside the glass: a room gradient, mullions, and some blinds half drawn
      const mull = max(smoothstep(0, 0.012, abs(f.x.sub(0.5))).oneMinus(), smoothstep(0, 0.015, abs(f.y.sub(0.62))).oneMinus()).mul(det);
      const drawn = stepT(h21(id.add(9.1)).mul(0.8).oneMinus(), f.y.oneMinus()), hasBlind = h21(id.add(5.3)).lessThan(0.35);   // how far the blind is pulled down
      const blind = select(hasBlind, mix(drawn.mul(0.5), stepT(0.5, fract(f.y.mul(18))).mul(drawn), det), float(0));   // 18 slats, or their average coverage when they can't be resolved
      const room = smoothstep(0.2, 0.8, f.y).mul(0.55).add(0.45).mul(h21(id.add(1.9)).mul(0.6).add(0.4)).toVar();
      If(lit.mul(win).greaterThan(0.5), () => {   // interior mapping: trace the view ray into a box room behind the glass
        const V = normalize(W.sub(cameraPosition));
        const d = vec3(select(abs(N0.x).greaterThan(0.5), V.z, V.x), V.y, max(dot(V, N0).negate(), 0.05)).toVar();
        const rs = vec2(2.4, 3.3), p = f.mul(rs), dep = h21(id.add(2.3)).mul(1.6).add(2.2);
        const tx = select(d.x.greaterThan(0), rs.x.sub(p.x), p.x.negate()).div(select(abs(d.x).lessThan(1e-4), float(1e-4), d.x));
        const ty = select(d.y.greaterThan(0), rs.y.sub(p.y), p.y.negate()).div(select(abs(d.y).lessThan(1e-4), float(1e-4), d.y));
        const tz = dep.div(d.z), t = min(min(tx, ty), tz).toVar();
        const hp = vec3(p, 0).add(d.mul(t)).toVar(), sh = float(0.42).toVar();   // side walls
        If(t.equal(tz), () => {   // back wall with a piece of furniture or a figure in silhouette
          const fx = hp.x.div(rs.x), ft = h21(id.add(4.4));
          const furn = stepT(abs(fx.sub(0.3).sub(ft.mul(0.4))), ft.mul(0.15).add(0.12)).mul(stepT(hp.y, ft.mul(1.1).add(0.9)));
          sh.assign(mix(0.62, 0.08, furn));
        }).ElseIf(t.equal(ty), () => { sh.assign(select(d.y.greaterThan(0), float(1), vn(hp.xz.mul(3)).mul(0.3).add(0.7).mul(0.3))); });   // ceiling light / floor
        sh.mulAssign(smoothstep(0, dep, dep.sub(hp.z.mul(0.6))).mul(0.45).add(0.55));   // falls off toward the back
        room.assign(mix(room, sh.mul(h21(id.add(1.9)).mul(0.45).add(0.55)), det));       // the plain gradient stands in where the room is too small to read
      });
      // lit windows hold steady (the random quarter-second blackouts read as flicker, not as a failing grid)
      const wk = win.mul(lit).mul(mull.mul(0.85).oneMinus()).mul(blind.mul(0.7).oneMinus()).mul(room);
      // Below ~3 px per window the lit cells are sub-pixel sparkle: every step moved the pixel grid onto different random
      // cells, so distant windows twinkled on and off. There the per-cell lights blend into the facade's mean window glow
      // (the lit share × window area × mean room brightness × mean colour), the way a mipmap would average them.
      const far = smoothstep(1.5, 3.5, px), pLit = clampT(bseed.mul(-0.1).add(0.82).oneMinus(), 0, 1).add(stepT(4.5, W.y).mul(0.03)).mul(stepT(1.2, W.y));
      const avg = pLit.mul(0.17).mul(vec3(0.92, 0.66, 0.45));
      emis.addAssign(mix(avg, wk.mul(wc), far).mul(NQN.uWin).mul(select(mat.greaterThan(8.5), float(0.7), float(1))));
      const wall = vec3(0).toVar();
      If(mat.greaterThan(8.5), () => {   // brick tenements
        const br = select(NQN.uTexOn.greaterThan(0.5), vec2(0.5, 0), nqBrick(fc));
        wall.assign(base.mul(br.x.mul(0.5).add(0.75)).mul(br.y.mul(-0.55).add(1))); bumpH.assign(br.y.mul(-0.012));
      }).Else(() => {                     // concrete panels: seams every floor and bay, blotchy weathering
        const seam = max(smoothstep(0, 0.035, abs(f.y.sub(0.02))).oneMinus(), smoothstep(0, 0.02, abs(f.x.sub(0.02))).oneMinus());
        const panel = vn(fc.mul(vec2(0.9, 0.35)).add(bseed.mul(17))).mul(0.25).add(0.8).add(vn(fc.mul(4.3)).mul(0.1));
        wall.assign(base.mul(panel).mul(seam.mul(-0.45).add(1))); bumpH.assign(seam.mul(-0.01));
      });
      // dirty water runs down from every sill; sheltered walls collect more soot
      const sill = stepT(0.16, f.x).mul(stepT(f.x, 0.84)).mul(stepT(f.y, 0.22)).mul(smoothstep(0, 0.22, f.y)).mul(vn(vec2(fc.x.mul(14), id.y.mul(3.1))).mul(0.7).add(0.3));
      const grime = smoothstep(4, 0, fc.y).mul(0.35).add(streak.mul(0.5)).add(sill.mul(0.55)).add(nqOcc.oneMinus().mul(0.45));
      wall.mulAssign(clampT(grime, 0, 1.4).mul(-0.5).add(1));
      base.assign(mix(wall, vec3(0.015, 0.02, 0.04), win));
      bumpH.subAssign(win.mul(0.03));
      rough.assign(mix(mix(0.85, 0.45, streak.mul(wetK)), 0.08, win)); metal.assign(win.mul(0.2)); envK.assign(NQN.uEnvK.mul(mix(streak.add(0.6), 1.6, win)));
      nqTL.assign(select(mat.greaterThan(8.5), float(2), float(1))); nqTS.assign(win.oneMinus().mul(0.9));
    }).ElseIf(mat.greaterThan(8.5), () => { base.mulAssign(0.8); });
  }).ElseIf(M(1.5, 2.5), () => {      // plaza tiles, wet
    const q = W.xz.div(4), gd = abs(fract(q.sub(0.5)).sub(0.5)), fw = max(fwidth(q), vec2(1e-4));
    const l2 = smoothstep(vec2(0.012), fw.mul(1.5).add(0.012), gd).oneMinus();
    const line = max(l2.x, l2.y).mul(clampT(float(0.02).div(max(fw.x, fw.y)), 0, 1).mul(0.65).add(0.35));
    const pud = pud2(0.18, 0.75, [0.52, 0.66]).toVar();   // water pools along wall bases
    const tileV = h21(floor(q)).mul(0.2).add(0.9);
    emis.addAssign(vec3(0.1, 0.55, 1.0).mul(line).mul(NQN.uGrid).mul(pud.mul(-0.6).add(1)));
    const stain = vn(W.xz.mul(0.7)).mul(0.25).add(vn(W.xz.mul(3.7)).mul(0.12));
    base.assign(mix(base.mul(tileV).mul(line.mul(-0.5).add(1)).mul(stain.oneMinus()), base.mul(0.35), pud));
    bumpH.assign(line.mul(-0.01).add(pud.mul(nqRipple(W.xz.mul(2.2), T)).mul(0.002).mul(NQN.uRain)));
    // puddles mirror the street through the reflection pass (wetRefl), so the analytic lights keep a soft lobe here: at mirror
    // roughness every point light also printed a pin-sharp hot spot on the ground that the lens streaked, a second, floating lamp
    rough.assign(mix(0.62, mix(0.62, 0.32, wet1), pud)); envK.assign(NQN.uEnvK.mul(pud.mul(0.6).mul(wetK).add(1)));
    wetRefl.assign(mix(0.22, 1.0, pud).mul(wet1));   // the whole wet surface mirrors a little, puddles fully
    nqTL.assign(5); nqTS.assign(pud.mul(-0.7).add(1).mul(0.75));
  }).ElseIf(M(2.5, 3.5), () => {      // asphalt
    const pud = pud2(0.12, 0.8, [0.5, 0.7]).toVar();   // gutters stay wet
    const lane = stepT(abs(W.x), 0.12).mul(stepT(0.5, fract(W.z.div(6)))).mul(stepT(abs(W.x), 6));
    const lane2 = stepT(abs(W.z), 0.12).mul(stepT(0.5, fract(W.x.div(6)))).mul(stepT(abs(W.z), 6));
    emis.addAssign(vec3(1.0, 0.75, 0.3).mul(lane.add(lane2)).mul(NQN.uGrid).mul(0.55).mul(stepT(40.5, max(abs(W.x), abs(W.z)))));
    const grain = vn(W.xz.mul(3.1)), fine = vn(W.xz.mul(23));
    const crack = smoothstep(0.02, 0, abs(vn(W.xz.mul(0.9)).sub(0.5))).mul(0.6);
    base.mulAssign(pud.mul(-0.6).add(1).mul(grain.mul(0.3).add(0.78).add(fine.mul(0.1))).mul(crack.mul(-0.5).add(1)));
    // south of the suburbs the road breaks up: cracked, then patched with gravel and dirt toward the gardens
    const wild = smoothstep(128, 162, W.z).mul(stepT(abs(W.x), 40));
    const grav = wild.mul(smoothstep(0.35, 0.6, vn(W.xz.mul(0.35)).mul(wild.mul(-0.4).add(1)).add(wild.mul(0.55))));
    base.assign(mix(base.mul(crack.mul(wild).oneMinus()), vec3(0.12, 0.105, 0.085).mul(fine.mul(0.7).add(0.55)).mul(grain.mul(0.5).add(0.7)), grav));
    pud.mulAssign(grav.mul(-0.7).add(1));
    bumpH.assign(fine.mul(0.0025).sub(crack.mul(0.006)).add(pud.mul(nqRipple(W.xz.mul(2.2), T)).mul(0.002).mul(NQN.uRain)));
    rough.assign(mix(0.85, mix(0.8, 0.34, wet1), pud)); envK.assign(NQN.uEnvK.mul(pud.mul(0.6).mul(wetK).add(1)));
    wetRefl.assign(mix(0.2, 1.0, pud).mul(wet1));
    nqTL.assign(0); nqTS.assign(pud.mul(-0.75).add(1).mul(0.9));
  }).ElseIf(M(3.5, 4.5), () => {      // brushed metal
    const br = vn(vec2(fcW.x.mul(60), fcW.y.mul(1.5)));
    rough.assign(br.mul(0.15).add(0.3)); metal.assign(0.65); rimK.assign(1); bumpH.assign(br.mul(0.0015));
    base.mulAssign(vn(W.xz.mul(2.1).add(W.y)).mul(0.2).add(0.9));
  }).ElseIf(M(7.5, 8.5), () => {      // corrugated / painted steel: ribs, rust, scratches
    const along = select(abs(N0.y).greaterThan(0.5), W.x, fcW.x), rib = sin(along.mul(25.1));
    const rust = smoothstep(0.55, 0.8, vn(fcW.mul(1.3).add(N0.xz.mul(5))).add(streak.mul(0.4)));
    base.assign(mix(base.mul(rib.mul(0.15).add(0.85)), vec3(0.16, 0.07, 0.03), rust.mul(0.7)).mul(smoothstep(1.5, 0, W.y).mul(-0.25).add(1)));
    bumpH.assign(rib.mul(0.006)); rough.assign(mix(0.5, 0.85, rust)); metal.assign(rust.oneMinus().mul(0.45)); rimK.assign(1);
    nqTL.assign(3); nqTS.assign(0.55);
  }).ElseIf(M(9.5, 10.5), () => {     // glass: dark, glossy, streaked with rain
    base.mulAssign(0.35); rough.assign(streak.mul(0.14).mul(wetK).add(0.04)); metal.assign(0); envK.assign(NQN.uEnvK.mul(2.4)); rimK.assign(0.6); bumpH.assign(streak.mul(0.0015));
  }).ElseIf(M(10.5, 11.5), () => {    // car paint: clear coat, fine scratches, road grime low down
    const scr = smoothstep(0.93, 1.0, vn(vec2(fcW.x.mul(38), fcW.y.mul(2.5).add(N0.y.mul(7)))));
    const dirt = smoothstep(0.95, 0.15, W.y).mul(vn(W.xz.mul(3).add(W.y.mul(2))).mul(0.55).add(0.45));
    base.assign(mix(base, vec3(0.05, 0.045, 0.04), dirt.mul(0.65)).add(scr.mul(0.1)));
    rough.assign(mix(0.24, 0.75, dirt).add(streak.mul(0.05).mul(wetK))); metal.assign(mix(0.3, 0.05, dirt)); envK.assign(NQN.uEnvK.mul(mix(1.8, 0.6, dirt))); rimK.assign(1); bumpH.assign(scr.mul(-0.0008));
  }).ElseIf(M(11.5, 12.5), () => {    // bark: deep ridges, moss creeping up from the planter
    const rid = abs(vn(W.xz.mul(11).add(W.y.mul(1.7))).sub(0.5)).mul(2);
    const moss = smoothstep(1.6, 0.4, W.y).mul(vn(W.xz.mul(5).add(W.y.mul(4))));
    base.assign(mix(base.mul(rid.mul(0.6).add(0.55)), vec3(0.05, 0.09, 0.03), moss.mul(0.7)));
    bumpH.assign(rid.mul(0.012)); rough.assign(0.92); rimK.assign(0.4);
  }).ElseIf(M(12.5, 13.5), () => {    // wood slats: grain, darker and slicker when wet
    const gr = vn(vec2(W.x.add(W.z).mul(3.1), W.y.mul(40))).mul(0.5).add(vn(W.xz.mul(23)).mul(0.5));
    const up = wetK.mul(stepT(0.5, N0.y));
    base.mulAssign(gr.mul(0.45).add(0.7).mul(mix(1, 0.72, up)));
    bumpH.assign(gr.mul(0.002)); rough.assign(mix(0.62, 0.35, up)); rimK.assign(0.5);
  }).ElseIf(M(13.5, 14.5), () => {    // foliage: mottled leaves, light glowing through the canopy
    const pinkF = base.r.greaterThan(base.g.mul(1.35)).toVar();
    const an = abs(N0), lp = select(an.y.greaterThan(max(an.x, an.z)), W.xz, select(an.x.greaterThan(an.z), W.zy, W.xy)).toVar();
    lp.assign(lp.mul(select(pinkF, float(13), float(9))).add(vec2(vn(W.xz.mul(2.1)), vn(W.zy.mul(2.3))).mul(1.5)));
    const li = floor(lp).toVar(), lf = fract(lp).toVar(), F1 = float(9).toVar(), F2 = float(9).toVar(), cid = li.toVar();
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {   // individual leaves / petals: a cellular pattern
      const o = vec2(i, j), lo = li.add(o), pc = o.add(vec2(h21(lo), h21(lo.add(7.1))).mul(0.85)).add(0.075), dd = length(pc.sub(lf)).toVar();
      If(dd.lessThan(F1), () => { F2.assign(F1); F1.assign(dd); cid.assign(lo); }).ElseIf(dd.lessThan(F2), () => { F2.assign(dd); });
    }
    const edgeL = smoothstep(0, 0.14, F2.sub(F1)), hv = h21(cid.mul(1.31)), dome = clampT(F1.mul(1.6), 0, 1).oneMinus();
    // ragged silhouette: leaves at grazing angles fall away between the gaps
    const ndv = abs(dot(N0, normalize(cameraPosition.sub(W)))).toVar();
    Discard(F2.sub(F1).lessThan(ndv.oneMinus().mul(0.25).add(0.1)).and(ndv.lessThan(0.45)).and(vn(W.xz.mul(3.3).add(W.y.mul(2.9))).greaterThan(0.3)));
    const clump = vn(W.xz.mul(1.4).add(W.y.mul(1.7)));
    If(pinkF, () => { base.assign(mix(base, mix(vec3(1, 0.78, 0.86), vec3(0.86, 0.36, 0.55), hv), 0.65).mul(clump.mul(0.45).add(0.62))); })   // white to deep pink petals
      .Else(() => { base.mulAssign(mix(vec3(0.62, 0.72, 0.5), vec3(1.25, 1.12, 0.62), hv).mul(clump.mul(0.6).add(0.55))); });                   // dark to sunlit, yellowing leaves
    base.mulAssign(mix(clump.mul(0.3).add(0.62), 1, edgeL).mul(dome.mul(0.3).add(0.8)));
    If(pinkF, () => { base.mulAssign(vec3(1.12, 0.95, 1.02)); emis.addAssign(base.mul(dome.mul(0.16).add(0.1)).mul(clump.mul(0.4).add(0.6))); });   // petals glow softly, as if lit through
    emis.addAssign(base.mul(NQN.uNeon).mul(0.3)); rough.assign(mix(0.7, 0.4, dome)); rimK.assign(1.4);
    emis.addAssign(base.mul(ndv.oneMinus()).mul(ndv.oneMinus()).mul(NQN.uNeon.mul(0.6).add(0.25)).mul(select(pinkF, float(1.3), float(0.8))));   // thin leaves let the city light through at the edges
    bumpH.assign(dome.mul(0.012).sub(edgeL.oneMinus().mul(0.006)));
  }).ElseIf(M(14.5, 15.5), () => {    // moulded plastic / rubber
    base.mulAssign(vn(W.xz.mul(4).add(W.y.mul(3))).mul(0.22).add(0.88)); rough.assign(0.55); metal.assign(0); rimK.assign(0.7);
  }).ElseIf(M(15.5, 16.5), () => {    // cast concrete: aggregate, pits, wet tops
    const ag = vn(W.xz.mul(1.7).add(W.y.mul(1.3))).mul(0.25).add(vn(W.xz.mul(9).add(W.y.mul(7))).mul(0.12));
    const pit = smoothstep(0.78, 0.9, vn(W.xz.mul(31).add(W.y.mul(29)))), top = stepT(0.5, N0.y);
    base.mulAssign(ag.add(0.78).mul(pit.mul(-0.35).add(1)).mul(streak.mul(0.2).mul(top.oneMinus()).oneMinus()).mul(mix(1, 0.7, wetK.mul(top))));
    bumpH.assign(pit.mul(-0.004).add(ag.mul(0.004))); rough.assign(mix(0.92, 0.4, wetK.mul(top).mul(0.8))); rimK.assign(0.3);
    nqTL.assign(7); nqTS.assign(0.85);
  }).ElseIf(M(16.5, 17.5), () => {    // moss lawn strewn with fallen blossom
    const n1 = vn(W.xz.mul(0.9)), n2 = vn(W.xz.mul(7.3)), n3 = vn(W.xz.mul(31));
    base.mulAssign(n1.mul(0.5).add(0.6).add(n2.mul(0.25)).sub(n3.mul(0.15)));
    bumpH.assign(n3.mul(0.004).add(n2.mul(0.006))); rough.assign(mix(0.9, 0.55, wet1.mul(0.6))); rimK.assign(0.2);
  }).ElseIf(M(18.5, 19.5), () => {    // overgrown lawn: patchy weeds, bare mud, wet sheen
    const n1 = vn(W.xz.mul(0.7)), n2 = vn(W.xz.mul(6.1)), n3 = vn(W.xz.mul(27));
    base.mulAssign(n1.mul(0.6).add(0.5).add(n2.mul(0.3)).sub(n3.mul(0.15)));
    base.assign(mix(base, vec3(0.05, 0.04, 0.03), smoothstep(0.55, 0.75, vn(W.xz.mul(0.35).add(4.2))).mul(0.8)));
    bumpH.assign(n3.mul(0.005).add(n2.mul(0.006))); rough.assign(mix(0.92, 0.6, wet1.mul(0.5))); rimK.assign(0.2);
  }).ElseIf(M(22.5, 23.5), () => {    // harbour: black oily water, long swell, rain rings, a rainbow fuel sheen
    const sw = sin(W.x.mul(0.35).add(T.mul(0.7))).mul(0.5).add(sin(W.z.mul(0.23).sub(T.mul(0.5))).mul(0.5));
    const oil = smoothstep(0.55, 0.8, vn(W.xz.mul(0.08).add(vec2(T.mul(0.01), 0))));
    base.assign(vec3(0.008, 0.014, 0.016).add(cos(vec3(0, 0.33, 0.67).add(vn(W.xz.mul(0.4))).mul(6.2831)).mul(0.5).add(0.5).mul(0.03).mul(oil)));
    bumpH.assign(nqRipple(W.xz.mul(1.6), T).mul(0.003).mul(max(NQN.uRain, 0.2)).add(sw.mul(0.03)).add(vn(W.xz.mul(0.9).add(T.mul(0.15))).sub(0.5).mul(0.02)));
    rough.assign(0.05); metal.assign(0); envK.assign(NQN.uEnvK.mul(1.8)); rimK.assign(0); wetRefl.assign(0.9);
  }).ElseIf(M(17.5, 18.5), () => {    // koi pond: black mirror water, rain rings, drifting petals, koi below
    const pet = smoothstep(0.86, 0.93, vn(W.xz.mul(4.3).add(vec2(T.mul(0.05), 0))));
    const kp = W.xz.mul(0.6).add(vec2(sin(T.mul(0.3)), cos(T.mul(0.23))).mul(1.5)), koi = smoothstep(0.9, 0.96, vn(kp.mul(1.7)));
    base.assign(mix(vec3(0.01, 0.03, 0.035), vec3(0.8, 0.35, 0.5), pet));
    emis.addAssign(vec3(1.0, 0.35, 0.08).mul(koi).mul(0.18).mul(pet.oneMinus()));
    bumpH.assign(nqRipple(W.xz.mul(2.2), T).mul(0.003).mul(max(NQN.uRain, 0.25)).add(vn(W.xz.mul(1.3).add(T.mul(0.2))).sub(0.5).mul(0.004)));
    rough.assign(mix(0.03, 0.6, pet)); metal.assign(0); envK.assign(NQN.uEnvK.mul(1.6)); rimK.assign(0); wetRefl.assign(mix(0.85, 0.08, pet));
  }).ElseIf(M(24.5, 25.5), () => {
    if (zp && D.NQ_ZTEX) {   // Meshy-scanned zombie: the texture carries skin, clothes and gore (uPT tone, uPS.x Cryo frost: rig.js)
      const tx = nqTex, q = attribute('position', 'vec3').mul(7).add(zRef('uSeed', 'float')), L = attribute('position', 'vec3');
      const lum = dot(tx, vec3(0.3, 0.55, 0.15));
      const bl = smoothstep(0.05, 0.18, tx.r.sub(max(tx.g, tx.b).mul(1.35))).mul(smoothstep(0.12, 0.3, max(tx.g, tx.b)).oneMinus());   // open wounds, not brown stains
      base.assign(tx.mul(tint).mul(vn(q.xy.mul(0.9).add(q.z.mul(0.4))).mul(0.28).add(0.86)));
      const mud = smoothstep(0.05, 0.75, L.y).oneMinus().mul(vn(q.xz.mul(0.9).add(2.7)).mul(0.55).add(0.45));
      base.assign(mix(base.mul(mud.mul(-0.3).add(1)), vec3(0.075, 0.06, 0.045), mud.mul(0.3)));   // street filth up the shins
      base.assign(mix(base, lum.mul(1.5).add(0.06).mul(vec3(0.42, 0.62, 0.8)), skin.x));            // frost
      rough.assign(mix(0.74, 0.18, bl)); metal.assign(0); rimK.assign(mix(0.6, 1.35, bl));
      rough.assign(mix(rough, rough.mul(0.7), wet1)); base.mulAssign(wet1.mul(-0.15).add(1));
      emis.assign(vec3(0.5, 0.07, 0.045).mul(bl).mul(bl).mul(vn(q.xy.mul(5).add(q.z)).mul(0.14).add(0.22)).mul(skin.x.oneMinus()));   // wounds glow faintly
    } else {                  // wreck paint (Meshy cars): faded on top, rusting at the arches and sills (nqm.x is the baked wear mask)
      const wear = mx; emis.assign(iemit.mul(dynK));
      const n1 = vn(W.xz.mul(2.3).add(W.y.mul(1.7))), n2 = vn(fcW.mul(7.3).add(N0.xz.mul(3.1)));
      const oxid = smoothstep(0.5, 0.95, N0.y).mul(n1.mul(0.4).add(0.6));
      base.assign(mix(base, vec3(dot(base, vec3(0.333))).mul(1.1).add(0.01), oxid.mul(0.3)));
      const rustM = wear.mul(smoothstep(0.3, 0.75, n1.add(n2.sub(0.5).mul(0.3)))).mul(0.8);
      base.assign(mix(base, mix(vec3(0.15, 0.06, 0.025), vec3(0.3, 0.12, 0.04), n2), rustM));
      const dirt = smoothstep(0.7, 0.1, W.y).mul(n1.mul(0.4).add(0.6));
      base.assign(mix(base, vec3(0.045, 0.04, 0.035), dirt.mul(0.5)));
      const scr = smoothstep(0.93, 1.0, vn(vec2(fcW.x.mul(38), fcW.y.mul(2.5).add(N0.y.mul(7)))));
      base.addAssign(scr.mul(0.05).mul(rustM.oneMinus()));
      rough.assign(mix(mix(0.28, 0.55, oxid), 0.92, max(rustM, dirt.mul(0.8))).add(streak.mul(0.05).mul(wetK)));
      metal.assign(rustM.oneMinus().mul(0.22)); envK.assign(NQN.uEnvK.mul(mix(1.5, 0.25, max(rustM, dirt)))); rimK.assign(0.9);
      bumpH.assign(scr.mul(-0.0008).add(rustM.mul(n2).mul(0.003)));
    }
  }).ElseIf(M(5.5, 7.5), () => {      // sculpted characters / armour: rgb = (ao, cloth mask, blood mask)
    const ao = C.r, clm = C.g, bl = C.b.toVar();
    base.assign(mix(skin, tint, clm));
    if (zp) { bl.assign(smoothstep(0.3, 0.95, bl)); base.assign(mix(base, vec3(0.085, 0.01, 0.007), bl.mul(0.85))); }   // blood in stains and runs
    else base.assign(mix(base, vec3(0.13, 0.008, 0.006), bl.mul(0.92)));
    base.mulAssign(ao);
    emis.assign(iemit.mul(mx).mul(dynK));
    const armour = zp ? stepT(6.5, part).mul(stepT(part, 8.5)) : stepT(6.5, mat);
    rough.assign(mix(mix(mix(0.62, 0.88, clm), 0.25, bl), 0.55, armour)); metal.assign(armour.mul(0.08)); rimK.assign(0.6);
    if (zp) {   // decay: mottled skin, dark veins, wet wounds; grimy clothes torn open to the skin beneath
      const L = attribute('position', 'vec3'), q = L.mul(7).add(zRef('uSeed', 'float')).toVar(), skinM = clm.oneMinus().mul(armour.oneMinus());
      const mott = vn(q.xy.mul(1.3).add(q.z.mul(0.7)));
      const vein = smoothstep(0.03, 0, abs(vn(q.xz.mul(2.1).add(q.y.mul(0.6))).sub(0.5))).mul(skinM).mul(smoothstep(0.4, 0.7, vn(q.xy.mul(0.7).add(3.3))));
      const wound = smoothstep(0.68, 0.78, vn(q.yz.mul(0.8).add(7.3))).mul(armour.oneMinus());
      const tear = smoothstep(0.8, 0.86, vn(q.xy.mul(1.6).add(3.1))).mul(clm).mul(armour.oneMinus());
      const face = stepT(4.5, part).mul(stepT(part, 6.5));
      base.mulAssign(mix(1, ao.mul(ao), face.mul(0.85)));                              // deep sockets, mouth and nostrils read as holes
      const lum = dot(base, vec3(0.3, 0.55, 0.15)).toVar();
      base.assign(mix(base, lum.mul(vec3(0.86, 0.97, 0.8)), skinM.mul(0.4)));         // grey-green pallor
      base.assign(mix(base, base.mul(vec3(0.78, 0.72, 0.82)).mul(mott.mul(0.6).add(0.65)), skinM.mul(0.85)));
      base.assign(mix(base, base.mul(vec3(0.38, 0.3, 0.45)), vein.mul(0.8)));
      base.assign(mix(base, lum.mul(vec3(0.9, 1.0, 0.85)), clm.mul(0.26).mul(armour.oneMinus())));   // clothes: faded, filthy
      base.assign(mix(base, mix(skin.mul(ao).mul(0.45), vec3(0.09, 0.012, 0.008).mul(ao), 0.35), tear));   // rips show dark, bloodied skin
      base.mulAssign(clm.mul(tear.oneMinus()).mul(0.4).mul(vn(q.xz.mul(3).add(1.7))).oneMinus());
      base.assign(mix(base, vec3(0.16, 0.015, 0.012).mul(ao), wound.mul(0.9)));
      const dry = smoothstep(0.25, 0.6, vn(q.xy.mul(2.3).add(5.1)));                 // old blood dries brown-black; fresh stays wet and red
      base.assign(mix(base, vec3(0.07, 0.025, 0.018).mul(ao), bl.mul(dry).mul(0.65)));
      const mud = smoothstep(0.05, 0.8, L.y).oneMinus().mul(vn(q.xz.mul(0.9).add(2.7)).mul(0.55).add(0.45));   // street grime up the legs
      base.assign(mix(base.mul(mud.mul(-0.35).add(1)), vec3(0.075, 0.06, 0.045).mul(ao), mud.mul(0.4).mul(clm.mul(0.6).add(0.4))));
      base.assign(mix(base, base.mul(vec3(0.72, 0.6, 0.78)), skinM.mul(smoothstep(0.7, 1.3, L.y).oneMinus()).mul(0.35)));   // livor mortis
      rough.assign(mix(rough, 0.12, max(wound, bl.mul(dry.oneMinus()))));
      rough.assign(mix(rough, rough.mul(0.72), wet1.mul(skinM)));                      // rain: a thin sheen on skin, cloth dark and heavy
      rough.assign(mix(rough, 0.16, wet1.mul(skinM).mul(smoothstep(0.35, 0.9, N0.y))));
      base.mulAssign(wet1.mul(clm).mul(armour.oneMinus()).mul(-0.2).add(1));
      bumpH.assign(mott.sub(0.5).mul(0.004).mul(skinM).sub(wound.mul(0.008)).add(vein.mul(0.003)).add(vn(q.xy.mul(6)).sub(0.5).mul(0.0015).mul(clm)));
      const eye = stepT(0.97, mx).mul(stepT(4.5, part)).mul(stepT(part, 5.5));          // milky, bloodshot eyes with burning pupils
      base.assign(mix(base, vec3(0.3, 0.1, 0.07).mul(mix(1, vn(q.xy.mul(9)).mul(0.4).add(0.7), 0.5)), eye));
      rough.assign(mix(rough, 0.08, eye)); rimK.assign(mix(rimK, 0, eye));
      emis.addAssign(iemit.mul(eye).mul(3.2));
      const tooth = stepT(0.2, mx).mul(stepT(mx, 0.35)).mul(stepT(4.5, part)).mul(stepT(part, 6.5));   // stained, cracked enamel
      base.assign(mix(base, vec3(0.3, 0.25, 0.15).mul(ao).mul(vn(q.xy.mul(20)).mul(0.25).add(0.75)), tooth)); rough.assign(mix(rough, 0.3, tooth)); emis.mulAssign(tooth.oneMinus());
      emis.addAssign(vec3(0.5, 0.07, 0.045).mul(bl.mul(bl).mul(tooth.oneMinus())).mul(vn(q.xy.mul(5).add(q.z)).mul(0.25).add(0.55)));   // open wounds glow faintly
      rimK.assign(mix(rimK, 1.35, bl));
    }
  }).ElseIf(M(19.5, 20.5), () => {    // painted plaster: soft mottling, scuffed low down, faint roller texture
    const n1 = vn(fcW.mul(1.3).add(N0.xz.mul(3))), n2 = vn(fcW.mul(9)), n3 = vn(vec2(fcW.x.mul(40), fcW.y.mul(2)));
    base.mulAssign(n1.mul(0.14).add(0.9).sub(n2.mul(0.05)).sub(n3.mul(0.03)).mul(smoothstep(0.45, 0, W.y).mul(0.3).mul(stepT(0.5, abs(N0.y)).oneMinus()).oneMinus()));
    rough.assign(n2.mul(-0.08).add(0.85)); rimK.assign(0.15); bumpH.assign(n2.mul(0.0006).add(n3.mul(0.0003)));
    nqTL.assign(6); nqTS.assign(0.7);
  }).ElseIf(M(25.5, 26.5), () => {    // textured Meshy tree (nqm.x: 1 on the leaves, 0 on the bark): the scan's own colour, matte, clumps a shade apart
    const leaf = mx; emis.assign(vec3(0));
    base.mulAssign(mix(1, vn(W.xz.mul(1.7).add(W.y.mul(1.3))).mul(0.5).add(0.75), leaf));   // so a canopy isn't one flat green
    const wetBark = wet1.mul(leaf.oneMinus());
    base.mulAssign(wetBark.mul(-0.25).add(1)); rough.assign(mix(mix(0.82, 0.55, wetBark), 0.92, leaf)); rimK.assign(mix(0.3, 0.55, leaf));
  }).ElseIf(M(26.5, 27.5), () => {    // Meshy stone lantern (nqm.x: its paper fire box): weathered granite, darker in the rain, the paper lit from inside
    const glow = mx, fl = sin(T.mul(7.3).add(W.x.mul(3.1))).mul(0.035).add(sin(T.mul(12.7).add(W.z.mul(2.3))).mul(0.025)).add(0.94);
    base.mulAssign(wet1.mul(-0.3).add(1).mul(glow.mul(-0.4).add(1)));
    emis.assign(vec3(2.6, 1.55, 0.72).mul(glow).mul(fl).mul(NQN.uNeon));
    rough.assign(mix(mix(0.9, 0.48, wet1), 0.75, glow)); rimK.assign(0.2);
  }).ElseIf(M(27.5, 28.5), () => {    // kawara roof tiles: round cover tiles over concave pans in overlapping courses, smoke-fired silver grey
    // u runs along the eave (across the tile rows), v up the slope in courses; on near-vertical faces (the ridge's stacked
    // noshi tiles) the courses close up to thin layers. The relief fades to its average where a tile is under ~4 px.
    const sl = length(N0.xz).toVar(), tA = select(sl.greaterThan(0.08), N0.xz.div(max(sl, 1e-4)), vec2(0, 1));
    const crs = mix(0.27, 0.085, smoothstep(0.85, 0.97, sl));
    const u = dot(W.xz, vec2(tA.y.negate(), tA.x)).div(0.3).toVar(), v = W.y.div(max(sl, 0.25)).div(crs).toVar();
    const det = smoothstep(0.32, 0.1, max(fwidth(u), fwidth(v))).toVar();
    const p = abs(fract(u).sub(0.5)), q = p.div(0.22), pan = stepT(1, q).toVar();
    const rr = float(0.5).sub(p).div(0.28);
    const roll = select(q.lessThan(1), sqrt(max(q.mul(q).oneMinus(), 0)).mul(0.6), rr.mul(rr).oneMinus().mul(-0.4)).mul(det.mul(stepT(sl, 0.85)));
    const fv = fract(v), lipSh = smoothstep(0.72, 1.0, fv).mul(det);   // the shadow each course's lip throws on the one below
    const id = vec2(floor(u.add(select(pan.greaterThan(0.5), float(0.5), float(0)))), floor(v));
    const toneT = mix(1, h21(id).mul(0.32).add(0.84), det);
    const moss = smoothstep(0.62, 0.85, vn(W.xz.mul(0.8).add(W.y.mul(0.6)))).mul(pan.mul(0.6).add(0.4)).mul(smoothstep(0.85, 0.5, sl)).mul(0.55);
    base.assign(mix(base.mul(toneT).mul(roll.mul(0.75).add(0.95)).mul(lipSh.mul(-0.3).add(1)), vec3(0.035, 0.045, 0.022), moss));
    bumpH.assign(roll.mul(0.05).add(fv.oneMinus().mul(0.008).mul(det)));
    const wp = wet1.mul(pan.mul(0.5).add(0.5));   // rain runs in the pans
    base.mulAssign(wp.mul(-0.3).add(1));
    rough.assign(mix(0.5, 0.16, wp)); metal.assign(0.18); envK.assign(NQN.uEnvK.mul(mix(1.1, 2.0, wet1))); rimK.assign(0.5);
  }).ElseIf(M(20.5, 22.5), () => {    // indoor floor tiles (22: checkerboard): grout, per-tile tone, polished but scuffed
    const q = W.xz.div(select(mat.greaterThan(21.5), float(0.33), float(0.6))), gd = abs(fract(q).sub(0.5)), fw = max(fwidth(q), vec2(1e-4));
    const grout = smoothstep(fw.x.mul(-1.2).add(0.482), 0.494, max(gd.x, gd.y));
    const tv = h21(floor(q)).mul(0.2).add(0.88), scuff = vn(W.xz.mul(2.7)).mul(vn(W.xz.mul(13)));
    If(mat.greaterThan(21.5), () => { base.assign(mix(base, vec3(0.025, 0.025, 0.03), gmod(floor(q.x).add(floor(q.y)), float(2)))); });
    base.assign(mix(base.mul(tv).mul(scuff.mul(-0.25).add(1)), vec3(0.06, 0.055, 0.05), grout.mul(0.8)));
    rough.assign(mix(mix(0.18, 0.55, scuff), 0.95, grout)); envK.assign(NQN.uEnvK.mul(1.6)); rimK.assign(0.1); bumpH.assign(grout.mul(-0.002));
  }).ElseIf(M(23.5, 24.5), () => {    // beacons and hazard lights: a short flash on each light's own beat
    const ph = h21(floor(W.xz.mul(0.5)).add(floor(W.y.mul(0.25)))), cyc = fract(T.mul(ph.mul(0.35).add(0.5)).add(ph));
    emis.mulAssign(smoothstep(0, 0.04, cyc).mul(smoothstep(0.16, 0.34, cyc).oneMinus()).mul(1.7).add(0.06)); rimK.assign(0);
  }).ElseIf(M(4.5, 5.5), () => {      // hologram
    const sl = sin(W.y.mul(60).add(T.mul(8))).mul(0.35).add(0.65);
    emis.addAssign(base.mul(sl).mul(1.6)); base.assign(vec3(0));
  }).Else(() => { rimK.assign(1); });
  // petals and leaves on whatever ground lies under the trees (lawns, moss, paths, tiles, road), never on water
  if (city) If(W.y.lessThan(0.4).and(M(17.5, 18.5).not()).and(M(22.5, 23.5).not()).and(M(4.5, 5.5).not()), () => { litter(select(M(16.5, 17.5), float(0.06), float(0))); });
  const texN = NQP.texN, texK = NQP.texK; texN.assign(N0); texK.assign(0);
  if (city) {
    If(NQN.uTexOn.greaterThan(0.5).and(nqTL.greaterThan(-0.5)).and(nqTS.greaterThan(0.01)), () => {   // High and Ultra: CC0 photo detail, triplanar
      const li = int(nqTL.add(0.5)), sc = NQN.uTexS.element(li), mean = NQN.uTexM.element(li);
      const tr = nqTri(li, W, N0, sc.x);
      const det = pow(tr.a, vec3(2.2)).div(max(mean.rgb, vec3(0.02)));          // photo detail relative to the layer's average colour
      base.mulAssign(mix(vec3(1), clampT(det, 0, 3), nqTS));
      base.mulAssign(mix(1, tr.ro.x, nqTS.mul(0.8)));                              // baked cavity occlusion
      rough.assign(clampT(mix(rough, rough.mul(tr.ro.y).div(max(mean.a, 0.05)), nqTS.mul(0.7)), 0.03, 1));
      texN.assign(tr.n); texK.assign(nqTS.mul(sc.y));
    });
    // floors never go glossier than this: at mirror roughness every lamp and shop light printed a pin-sharp hot spot on the
    // wet ground that the lens then streaked, so the street read as a second row of lights; a soft sheen is all they leave now
    rough.assign(max(rough, smoothstep(0.5, 0.8, N0.y).mul(0.36)));
    // snow settles on anything facing the sky (not water, glass, holograms, or indoors), in drifts, thinner under cover
    If(NQN.uSnowCov.greaterThan(0.01).and(M(17.5, 18.5).not()).and(M(22.5, 23.5).not()).and(M(9.5, 10.5).not()).and(M(4.5, 5.5).not()), () => {
      const up = smoothstep(0.55, 0.9, N0.y), sc = NQN.uSnowCov;
      const drift = smoothstep(0.25, 0.6, vn(W.xz.mul(0.7)).mul(0.55).add(vn(W.xz.mul(3.1)).mul(0.2)).add(sc.mul(0.65)));
      const snowM = sc.mul(up).mul(clampT(nqOcc.mul(1.4).sub(0.2), 0, 1)).mul(nqIn.oneMinus()).mul(drift).toVar();
      base.assign(mix(base, vec3(0.56, 0.58, 0.64).mul(vn(W.xz.mul(9)).mul(0.08).add(0.92)), snowM));
      rough.assign(mix(rough, 0.72, snowM)); wetRefl.mulAssign(snowM.oneMinus()); emis.mulAssign(snowM.mul(-0.85).add(1)); texK.mulAssign(snowM.oneMinus()); bumpH.mulAssign(snowM.oneMinus());
    });
  }
  // alpha: the blossom cards cut their flowers out of the atlas (alpha test, or alpha-to-coverage under MSAA)
  let a = hasMap ? mapS.a : float(1);
  const at = material.nqAlphaTest || material.alphaTest;
  if (at > 0) {
    if (material.alphaToCoverage) { a = smoothstep(at, fwidth(a).add(at), a).toVar(); Discard(a.lessThanEqual(0)); }
    else Discard(a.lessThanEqual(at));
  }
  if (builder.isOpaque()) a = float(1);
  diffuseColor.assign(vec4(base.mul(mix(1, nqOcc, 0.55)), a));
}

/* ---- after lighting: fog (thinner high up), the glowing air round nearby lights, the hit flash ---- */
function nqFog(material, out) {
  const W = positionWorld, d = length(W.sub(cameraPosition)), c = out.rgb.toVar();
  const fog = exp(d.mul(NQN.uFogDen).negate()).oneMinus().mul(mix(1, 0.55, clampT(W.y.div(180), 0, 1)));
  c.assign(mix(c, NQN.uFogCol, clampT(fog, 0, 1)));
  if (material.nqKind !== 'vm') If(NQN.uAirK.greaterThan(0.0001), () => {
    // light scattered by the rain haze between the eye and this surface, integrated along the view ray per point light
    const P = W.sub(cameraPosition), t = length(P), v = P.div(max(t, 1e-4)), air = vec3(0).toVar();
    Loop(MAX_PL, ({ i }) => {
      const lp = AIR.posN.element(i), lc = AIR.colN.element(i).rgb;
      If(dot(lc, vec3(1)).greaterThan(0), () => {   // unused pool slots and lights whose range misses the ray add exactly 0
        const Lp = lp.xyz.sub(cameraPosition), b = dot(v, Lp), h = sqrt(max(dot(Lp, Lp).sub(b.mul(b)), 0).add(0.06)).toVar(), rng = lp.w;
        If(rng.lessThanEqual(0).or(h.lessThan(rng)), () => {
          const I = atan(t.sub(b).div(h)).sub(atan(b.negate().div(h))).div(h);
          const w = select(rng.greaterThan(0), clampT(h.div(rng).oneMinus(), 0, 1), float(1));
          air.addAssign(lc.mul(I).mul(w).mul(w));
        });
      });
    });
    c.addAssign(air.mul(NQN.uAirK));
  });
  c.assign(mix(c, vec3(1.0, 0.95, 0.9).mul(1.5), NQP.flash));
  return vec4(c, out.a);
}
// an alpha-tested cutout (the blossom cards) without material.alphaTest: three copies that onto the one shared shadow /
// AO-prepass override material per draw, and every flip across 0 bumps its version, which makes every later draw in
// the pass rebuild its cache key. The test runs in nqSurface instead, and the shadow keeps the flower shape via a mask.
function gpuCutout(m, at) { m.nqAlphaTest = at; m.maskShadowNode = texture(m.map).a.greaterThan(at); }
function nqMaterial(kind) {   // kind: 'static' | 'inst' | 'vm' | 'zombie'
  const m = new NQMaterial(kind); m.vertexColors = true;
  m.userData.u = kind === 'zombie' ? { uPT: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uPS: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uPE: { value: Array.from({ length: ZPARTS }, () => new THREE.Vector3()) }, uHide: { value: new Array(ZPARTS).fill(0) }, uFlash: { value: 0 }, uSeed: { value: 0 } } : {};
  return m;
}
const MAT = { static: nqMaterial('static'), inst: nqMaterial('inst'), vm: nqMaterial('vm') };
/* ---------------- sky dome (r3.js SKY_U drives it) ---------------- */
function skyMaterialGPU(U) {
  const R = (u, t) => reference('value', t, u);
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: true }); m.fog = false;
  // the dome sits at the far plane (depth just under 1, where the buffer is still clear), so with the depth test on it only
  // shades the pixels no geometry covers; the result is the same picture as drawing it first and painting the city over it
  m.vertexNode = Fn(() => { const c = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionLocal, 1)).toVar(); return vec4(c.xy, c.w.mul(0.9999998), c.w); })();
  m.fragmentNode = Fn(() => {
    const d = normalize(positionWorld.sub(cameraPosition)).toVar(), h = d.y, T = NQN.uTime, glow = R(U.uGlow, 'color'), disc = R(U.uDiscCol, 'color');
    const c = mix(NQN.uFogCol.mul(1.25), R(U.uMid, 'color'), smoothstep(0, 0.18, h)).toVar();
    c.assign(mix(c, R(U.uZen, 'color'), smoothstep(0.15, 0.7, h)));
    c.addAssign(glow.mul(exp(max(h, 0).mul(-14))).mul(0.5));
    const q = d.xz.div(max(h.add(0.08), 0.02));
    const cl = vn(q.mul(0.9).add(vec2(T.mul(0.01), 0))).mul(vn(q.mul(2.3).sub(vec2(T.mul(0.02), T.mul(0.01))))).toVar();
    cl.assign(smoothstep(0.15, 0.6, cl).mul(smoothstep(0.02, 0.25, h)).mul(smoothstep(0.5, 0.9, h).oneMinus()));
    // cloud undersides catch the city's glow: warmest low over the horizon, fading up into the dark
    c.assign(mix(c, R(U.uCloud, 'color').add(glow.mul(smoothstep(0.03, 0.45, h).oneMinus().mul(0.95).add(0.25))), cl.mul(0.75)));
    const sp = floor(vec2(atan(d.z, d.x).mul(180), h.mul(180)));
    const st = stepT(0.9975, h21(sp)).mul(smoothstep(0.25, 0.6, h)).mul(cl.oneMinus());
    c.addAssign(vec3(0.8, 0.85, 1).mul(st).mul(R(U.uStars, 'float')).mul(sin(T.mul(3).add(sp.x)).mul(0.5).add(0.5)));
    const md = normalize(R(U.uDiscDir, 'vec3')), mm = dot(d, md);
    c.addAssign(disc.mul(smoothstep(0.9993, 0.9996, mm)).mul(1.6));
    c.addAssign(disc.mul(0.4).mul(pow(max(mm, 0), 220)).mul(0.8).add(disc.mul(0.08).mul(pow(max(mm, 0), 8))));
    return vec4(c, 1);
  })();
  return m;
}
/* ---------------- light cones under the lamps (additive, order-free) ---------------- */
function coneMaterialGPU(U) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
  m.fog = false;
  m.fragmentNode = Fn(() => {
    const W = positionWorld, Nn = normalWorldGeometry, d = length(W.sub(cameraPosition));
    const facing = pow(abs(dot(Nn, normalize(cameraPosition.sub(W)))), 1.6);
    const h = clampT(uv().y, 0, 1);   // MSAA samples can land just outside the triangle: pow() of a negative is NaN
    const fall = pow(h, 1.8).mul(smoothstep(0, 0.25, h).mul(0.75).add(0.25));
    const streaks = vn(vec2(atan(Nn.z, Nn.x.add(1e-5)).mul(9), W.y.mul(1.4).add(NQN.uTime.mul(9)))).mul(0.35).add(0.65);
    const fogD = d.mul(NQN.uFogDen);
    const c = reference('value', 'color', U.uLamp).mul(facing).mul(fall).mul(streaks).mul(0.1).mul(reference('value', 'float', U.uVolK)).mul(smoothstep(0.5, 3, d)).mul(exp(fogD.mul(-0.5)));
    return vec4(c, 0);
  })();
  return m;
}

/* ---------------- the effects (r3.js builds the objects, these give them TSL shading) ----------------
   Fog for these: 1 - exp(-d * density), at 80% strength. */
const fogD = (d) => d.mul(NQN.uFogDen);
const fogMix = (c, d) => mix(c, NQN.uFogCol, clampT(exp(fogD(d).negate()).oneMinus().mul(0.8), 0, 1));
function basicGPU(o) { const m = new THREE.MeshBasicNodeMaterial(o); m.fog = false; m.lights = false; return m; }
const ADD = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor };
// signs: one instanced draw per texture size and blend mode, their canvases as the layers of one texture array
function signArrayGPU(texs) {
  const t0 = texs[0], w = t0.image.width, h = t0.image.height, row = w * 4, d = new Uint8Array(row * h * texs.length);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true });
  texs.forEach((t, L) => {   // rows bottom-up, as the GL upload (flipY) leaves them, so the sign shader's uv maths is unchanged
    cx.clearRect(0, 0, w, h); cx.drawImage(t.image, 0, 0); const src = cx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) d.set(src.subarray(y * row, (y + 1) * row), (L * h + (h - 1 - y)) * row);
  });
  const arr = new THREE.DataArrayTexture(d, w, h, texs.length);
  Object.assign(arr, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, colorSpace: t0.colorSpace, generateMipmaps: true, minFilter: t0.minFilter, magFilter: t0.magFilter,
    anisotropy: t0.anisotropy, wrapS: t0.wrapS, wrapT: t0.wrapT, premultiplyAlpha: t0.premultiplyAlpha });
  arr.needsUpdate = true; return arr;
}
function signMaterialGPU(arr, add) {
  const m = basicGPU({ transparent: add, depthWrite: !add, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NoBlending });   // additive signs weigh by alpha
  m.uA = uniform(1);
  m.fragmentNode = Fn(() => {
    const S = attribute('iSign', 'vec3'), col = attribute('iCol', 'vec3'), T = NQN.uTime, u = uv().toVar(), flick = float(1).toVar();
    If(S.y.greaterThan(0.5), () => {   // holo billboards: torn scanlines and a fast shimmer
      const row = floor(u.y.oneMinus().mul(24)), g = stepT(0.93, h21(vec2(row, floor(T.mul(6)).add(S.x))));
      u.x.addAssign(g.mul(h21(vec2(row, T)).sub(0.5)).mul(0.08)); flick.assign(sin(u.y.mul(300).add(T.mul(20))).mul(0.2).add(0.8));
    });   // neon tubes hold steady (the random dropouts read as flicker)
    const t = texture(arr, u).depth(int(S.z.add(0.5)));
    const c = fogMix(t.rgb.mul(col).mul(flick), length(positionWorld.sub(cameraPosition)));
    return vec4(c, t.a.mul(m.uA));
  })();
  return m;
}
function decalMaterialGPU(tex) {
  const m = basicGPU({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.fragmentNode = Fn(() => { const t = texture(tex, uv()); return vec4(fogMix(t.rgb, length(positionWorld.sub(cameraPosition))), t.a.mul(attribute('iAlpha', 'float'))); })();
  return m;
}
// screen-facing quads standing in for GL points (WebGPU points are always one pixel): corner -> clip-space offset in pixels
const SPRITE_QUAD = (() => { const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; })();
const spriteClip = (mv, px) => { const clip = cameraProjectionMatrix.mul(mv).toVar(); return clip.add(vec4(attribute('position', 'vec3').xy.mul(px).div(GRADE_U.uRes).mul(clip.w), 0, 0)); };
// sparks, blood, smoke: PART.data is [pos3, colour4, size1] per particle; a negative size means alpha-blended
function particlesGPU(data) {
  const g = new THREE.InstancedBufferGeometry(); g.index = SPRITE_QUAD.index; g.setAttribute('position', SPRITE_QUAD.attributes.position);
  const buf = new THREE.InstancedInterleavedBuffer(data, 8); buf.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('ppos', new THREE.InterleavedBufferAttribute(buf, 3, 0)); g.setAttribute('pcol', new THREE.InterleavedBufferAttribute(buf, 4, 3)); g.setAttribute('psize', new THREE.InterleavedBufferAttribute(buf, 1, 7));
  g.instanceCount = 0; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const m = basicGPU({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  m.uH = uniform(500);
  const ps = attribute('psize', 'float');
  m.vertexNode = Fn(() => { const mv = modelViewMatrix.mul(vec4(attribute('ppos', 'vec3'), 1)); return spriteClip(mv, clampT(abs(ps).mul(m.uH).div(max(mv.z.negate(), 0.05)), 1, 256)); })();
  m.fragmentNode = Fn(() => {
    const C = varying(attribute('pcol', 'vec4')), blend = varying(ps.lessThan(0).select(float(1), float(0))), d = length(attribute('position', 'vec3').xy).mul(0.5);
    const out = vec4(0).toVar();
    If(blend.greaterThan(0.5), () => { const s = smoothstep(0.5, 0.3, d).mul(C.a); out.assign(vec4(C.rgb.mul(s), s)); })
      .Else(() => { const a = smoothstep(0.5, 0, d); out.assign(vec4(C.rgb.mul(a.mul(a)).mul(C.a), 0)); });
    return out;
  })();
  m.uniforms = { uH: m.uH };   // r3.js sets it through .uniforms, like the other effect materials
  const mesh = new THREE.Mesh(g, m); mesh.userData.buf = buf; return mesh;
}
// rain: the drop buffer wrapped round the camera, falling, slanted by the wind, dry under ceilings (r3.js rainGeo)
const RAIN_U = { uAlpha: uniform(0.5), uRainCol: uniform(new THREE.Color()), uDens: uniform(0.7), uWind: uniform(0.4) };
const SNOW_U = { uAlpha: uniform(0.9), uCol: uniform(new THREE.Color()), uDens: uniform(0), uWind: uniform(0.3), uPx: uniform(1) };
const indoorAt = (x, z, y) => NQN.uOccB.z.greaterThan(0).select(stepT(0.5, TEXN.indoor.sample(vec2(x, z).sub(NQN.uOccB.xy).mul(NQN.uOccB.zw)).level(0).r).mul(stepT(y, 4.6)), float(0));
function rainGPU(geo) {
  const U = RAIN_U, m = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, ...ADD }); m.fog = false;
  const P = attribute('position', 'vec3'), a2 = attribute('aP2', 'vec2'), T = NQN.uTime, cp = cameraPosition, S = 50;
  const x = gmod(P.x.sub(cp.x), float(S)).sub(S * 0.5).add(cp.x), z = gmod(P.y.sub(cp.z), float(S)).sub(S * 0.5).add(cp.z);
  const y = gmod(P.z.sub(T.mul(a2.x.mul(8).add(24)).mul(U.uDens.mul(0.3).add(0.85))), float(36)).sub(6).add(cp.y);
  const patchD = sin(x.mul(0.09).add(T.mul(0.35))).mul(sin(z.mul(0.075).sub(T.mul(0.27)))).mul(0.5).add(0.5);
  const dens = clampT(U.uDens.mul(patchD.mul(0.6).add(0.7)), 0, 1), rnd = fract(a2.x.mul(7.31).add(P.x.mul(0.137)).add(P.y.mul(0.071)));
  const K = stepT(rnd, dens).mul(fract(rnd.mul(13.7)).mul(0.8).add(0.45)).mul(indoorAt(x, z, y).oneMinus());
  const wind = U.uWind.mul(0.32).add(0.08).add(sin(T.mul(1.3).add(P.y.mul(0.21))).mul(0.12)), len = fract(rnd.mul(5.3)).mul(0.9).add(0.55).mul(0.9);
  m.positionNode = vec3(x.add(a2.y.mul(wind).mul(len).mul(2)), y.add(a2.y.mul(len)), z.add(a2.y.mul(0.05)));
  m.fragmentNode = vec4(U.uRainCol.mul(U.uAlpha).mul(varying(a2.y).mul(0.7).add(0.3)).mul(varying(K)), 0);
  m.uniforms = U; return m;
}
// snow: one soft flake per drop that swirls and rides the wind (instanced quads over the drops' first vertices)
function snowGPU(rainGeo, n) {
  const g = new THREE.InstancedBufferGeometry(); g.index = SPRITE_QUAD.index; g.setAttribute('position', SPRITE_QUAD.attributes.position);
  const src = rainGeo.attributes.position.array, a2 = rainGeo.attributes.aP2.array, p = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { p.set(src.subarray(i * 6, i * 6 + 3), i * 3); s[i] = a2[i * 4]; }
  g.setAttribute('dpos', new THREE.InstancedBufferAttribute(p, 3)); g.setAttribute('dseed', new THREE.InstancedBufferAttribute(s, 1));
  g.instanceCount = n; g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const U = SNOW_U, m = basicGPU({ transparent: true, depthWrite: false, ...ADD });
  const P = attribute('dpos', 'vec3'), sd = attribute('dseed', 'float'), T = NQN.uTime, cp = cameraPosition, S = 24;
  const rnd = fract(sd.mul(7.31).add(P.x.mul(0.137)).add(P.y.mul(0.071)));
  const sw = sin(T.mul(rnd.add(0.7)).add(P.x.mul(3.1))).mul(0.7), sw2 = cos(T.mul(rnd.mul(0.8).add(0.5)).add(P.y.mul(2.3))).mul(0.5);
  const x = gmod(P.x.mul(0.48).add(U.uWind.mul(T).mul(3)).add(sw).sub(cp.x), float(S)).sub(S * 0.5).add(cp.x);
  const z = gmod(P.y.mul(0.48).add(sw2).sub(cp.z), float(S)).sub(S * 0.5).add(cp.z);
  const y = gmod(P.z.mul(0.55).sub(T.mul(rnd.mul(1.1).add(1.3))), float(20)).sub(4).add(cp.y);
  const K = stepT(rnd, U.uDens).mul(fract(rnd.mul(13.7)).mul(0.5).add(0.5)).mul(indoorAt(x, z, y).oneMinus());
  m.vertexNode = Fn(() => {
    const mv = cameraViewMatrix.mul(vec4(x, y, z, 1));
    const px = K.greaterThan(0).select(clampT(U.uPx.mul(fract(rnd.mul(5.3)).mul(0.07).add(0.07)).div(max(mv.z.negate(), 0.1)).mul(1000), 1.5, U.uPx.mul(16)), float(0));
    return spriteClip(mv, px);
  })();
  m.fragmentNode = Fn(() => { const d = length(attribute('position', 'vec3').xy).mul(0.5); return vec4(U.uCol.mul(smoothstep(0.5, 0.12, d).mul(varying(K)).mul(U.uAlpha)), 0); })();
  m.uniforms = U; return new THREE.Mesh(g, m);
}
// halos round bulbs: camera-facing quads pushed toward the eye, faded with distance and fog
function haloMaterialGPU(VU) {
  const m = basicGPU({ transparent: true, depthWrite: false, ...ADD });
  const hp = attribute('hp', 'vec4'), hc = attribute('hc', 'vec3'), c = cameraViewMatrix.mul(vec4(hp.xyz, 1)), vD = varying(c.z.negate());
  m.vertexNode = cameraProjectionMatrix.mul(vec4(c.xy.add(attribute('position', 'vec3').xy.mul(hp.w)), c.z.add(hp.w.mul(0.4)), c.w));
  m.fragmentNode = Fn(() => {
    const r = length(uv().sub(0.5)).mul(2), a = exp(r.mul(r).mul(-5)).mul(r.oneMinus()).mul(smoothstep(0.3, 2.5, vD));
    const col = varying(hc.x.lessThan(0).select(reference('value', 'color', VU.uLamp).mul(0.35), hc));
    return vec4(col.mul(max(a, 0)).mul(0.35).mul(reference('value', 'float', VU.uVolK)).mul(exp(fogD(vD).mul(-0.4))), 0);
  })();
  return m;
}
// shopfront glass: see-through, fresnel-bright at grazing angles, rain-beaded and grimy low down
function glassMaterialGPU() {
  const m = basicGPU({ transparent: true, depthWrite: false });
  m.fragmentNode = Fn(() => {
    const W = positionWorld, V = normalize(cameraPosition.sub(W)), N = normalize(normalWorldGeometry), ndv = abs(dot(N, V)), T = NQN.uTime, R = NQN.uRain;
    const fr = pow(ndv.oneMinus(), 5).mul(0.96).add(0.04), fc = select(abs(N.x).greaterThan(0.5), W.zy, W.xy);
    const beads = smoothstep(0.8, 0.95, vn(fc.mul(vec2(26, 14)))).mul(R.mul(0.6).add(0.3));
    const runs = smoothstep(0.6, 0.95, vn(vec2(fc.x.mul(11), fc.y.mul(0.6).add(T.mul(0.25))))).mul(R);
    const grime = smoothstep(1.1, 0, W.y).mul(0.5).add(smoothstep(0.55, 0.8, vn(fc.mul(1.3))).mul(0.25));
    const refl = NQN.uFogCol.mul(2.2).add(NQN.uRimCol.mul(0.2)).add(0.02);
    const col = attribute('color', 'vec3').mul(0.04).add(refl.mul(fr.add(0.08))).add(vec3(0.55, 0.6, 0.7).mul(beads.mul(0.07).add(runs.mul(0.06)))).add(vec3(0.05, 0.045, 0.04).mul(grime));
    const a = clampT(fr.mul(0.75).add(0.07).add(grime.mul(0.25)).add(beads.mul(0.06)).add(runs.mul(0.06)), 0, 0.9);
    return vec4(fogMix(col, length(W.sub(cameraPosition))), a);
  })();
  return m;
}

/* ---------------- post: world (MSAA) -> GTAO (Ultra) -> bow -> bloom -> grade, one RenderPipeline ----------------
   The bow is its own pass over a transparent clear; its alpha lays it over the world (the sky writes alpha 1 there). */
const GRADE_U = { uTime: uniform(0), uDmg: uniform(0), uLow: uniform(0), uExpo: uniform(1), uAberr: uniform(0), uSharp: uniform(0.3), uSat: uniform(1), uGrade: uniform(new THREE.Vector3(1, 1, 1)),
  uLift: uniform(new THREE.Vector3()), uRes: uniform(new THREE.Vector2(1, 1)), uFocus: uniform(0),
  uStreak: uniform(0.45), uStreakThr: uniform(1.8), uHal: uniform(5), uWhite: uniform(0.5) };   // the lens and film: anamorphic streaks, halation, highlights burning to white
// weather on the lens (r3.js updateLens): beads of water, drops running down, a damp film, frost creeping in from the edges
Object.assign(GRADE_U, { uLensDrop: uniform(0), uLensRun: uniform(0), uLensFog: uniform(0), uLensFrost: uniform(0) });
const GPOST = { pipe: null, key: '', world: null, vm: null, bloom: null, ao: null, pre: null, comb: null, streak: null };
const aces = (x) => clampT(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0, 1);
function buildPostGPU(q) {
  if (GPOST.pipe) { GPOST.pipe.dispose(); for (const k of ['world', 'vm', 'bloom', 'ao', 'pre', 'comb']) if (GPOST[k]) GPOST[k].dispose(); if (GPOST.streak) for (const n of GPOST.streak) n.dispose(); }
  const samples = 4;
  const world = pass(scene, camera, { samples }), vmP = pass(scene, vmCamera, { samples });
  world.name = 'world'; vmP.name = 'bow';
  vmP.setMRT(mrt({ output }).setClearColor('output', 0x000000, 0));   // transparent wherever the bow isn't, whoever triggers the pass
  let col = world.getTextureNode('output').rgb;
  let aoN = null, pre = null;
  if (q >= 3) {   // Ultra: real-time GTAO for contact shadows at feet, corners, under cars and between bodies
    // from its own depth + view-normal prepass of the opaque city, without MSAA (GTAO can't read a multisampled depth
    // buffer), as three's GTAOPass does; glass, glows and cones are left out, so they cast no fake occlusion
    pre = pass(scene, camera); pre.name = 'aoPrepass'; pre.transparent = false;
    const nm = new THREE.NodeMaterial(); nm.fragmentNode = vec4(normalView, 1); nm.side = THREE.DoubleSide; pre.overrideMaterial = nm;
    const pd = pre.getTextureNode('depth'), pn = pre.getTextureNode('output');
    aoN = ao(pd, pn, camera);
    aoN.radius.value = 1.1; aoN.distanceExponent.value = 1.4; aoN.thickness.value = 1.2; aoN.scale.value = 1.1; aoN.samples.value = 16; aoN.distanceFallOff.value = 1;
    const aoT = denoise(aoN.getTextureNode(), pd, pn, camera);
    aoT.lumaPhi.value = 10; aoT.depthPhi.value = 2; aoT.normalPhi.value = 3; aoT.radius.value = 6;
    col = col.mul(mix(1, aoT.r, 0.85));
  }
  const vm = vmP.getTextureNode('output');
  col = mix(col, vm.rgb, clampT(vm.a, 0, 1));
  // drop any NaN / Inf pixel: bloom would smear a single one across the whole frame. Then cap the hottest pixels, hue kept:
  // a sun-sharp lamp glint on wet glass or asphalt reaches the thousands, and the streaks and bloom turned that one pixel
  // into a flare brighter than any neon sign. Everything above the cap is pure white on screen anyway.
  const comb = convertToTexture(Fn(() => {
    const c = col.toVar(), ok = c.r.greaterThanEqual(0).and(c.r.lessThan(6e4)).and(c.g.greaterThanEqual(0)).and(c.g.lessThan(6e4)).and(c.b.greaterThanEqual(0)).and(c.b.lessThan(6e4));
    const v = select(ok, c, vec3(0)), m = max(max(v.r, v.g), v.b);
    return vec4(v.mul(min(float(1), float(24).div(max(m, 1e-4)))), 1);
  })());
  comb.name = 'composite';
  const bl = bloom(comb, 0.6, 0.55, 1.0);
  const blT = bl.getTextureNode();
  const S = (u) => comb.sample(u).rgb.add(blT.sample(u).rgb);
  const U = GRADE_U;
  // Anamorphic streaks: the hottest pixels (neon tubes, lamps, headlights) smeared sideways into the long thin flares a
  // cinema lens draws. Thresholded at full resolution, then three widening horizontal blurs at half resolution; the first
  // samples between four pixels, an exact 2x2 average, so a one-pixel light never shimmers as the camera moves.
  const sSrc = Fn(() => { const c = comb.sample(screenUV).rgb, l = max(max(c.r, c.g), c.b); return vec4(c.mul(smoothstep(U.uStreakThr, U.uStreakThr.mul(4), l)), 1); })();
  const st1 = gaussianBlur(sSrc, vec2(1, 0), 10, { resolutionScale: 0.5 }), st2 = gaussianBlur(st1.getTextureNode(), vec2(4, 0), 10), st3 = gaussianBlur(st2.getTextureNode(), vec2(16, 0), 10);
  for (const g of [st1, st2, st3]) for (const rt of [g._horizontalRT, g._verticalRT]) rt.texture.type = THREE.HalfFloatType;   // HDR: the hot cores must not clip at 1
  const stT = st3.getTextureNode(), st2T = st2.getTextureNode(), st1T = st1.getTextureNode();
  const grade = Fn(() => {
    const u0 = screenUV, cc = u0.sub(0.5), r2 = dot(cc, cc);
    // Water on the lens. Beads land, sit and slowly evaporate; in steady rain some grow heavy and run down the glass, leaving
    // a trail of tiny beads. Each drop is a little lens: it shows the scene behind it upside down and shrunk, dark at the rim
    // with a glint on top. In snow, frost grows in from the frame's edges and flakes melt into small beads. Worked out in
    // screen units one frame tall (p), so drops keep their shape at any aspect; none of it runs when the lens is dry.
    const lOff = vec2(0).toVar(), lM = float(0).toVar(), lSh = float(0).toVar(), lFr = float(0).toVar(), lClr = float(0).toVar();
    If(U.uLensDrop.add(U.uLensFrost).greaterThan(0.002), () => {
      const asp = U.uRes.x.div(U.uRes.y), p = vec2(u0.x.mul(asp), u0.y).toVar(), T = U.uTime;
      const drop = (d, r, m) => {   // keep the nearest drop's refraction, rim and glint
        If(m.greaterThan(lM), () => {
          const n = d.div(max(r, 1e-4)), ln = length(n);
          lOff.assign(d.mul(-4)); lM.assign(m);
          lSh.assign(smoothstep(0.6, 1, ln).mul(-0.22).add(smoothstep(0.3, 0, length(n.sub(vec2(-0.3, -0.4)))).mul(0.5)).mul(m));
        });
      };
      const ctr = smoothstep(0.01, 0.16, r2).mul(0.65).add(0.35);   // the middle of the frame stays clearer: you still have to aim
      for (const [sc, k] of [[9, 1], [21, 1.1]]) {   // beads: two sizes, one per cell, each with its own life
        const q = p.mul(sc).add(sc * 0.37), id = floor(q), f = fract(q).sub(0.5);
        const h1 = h21(id), h2 = h21(id.add(3.7)), h3 = h21(id.add(7.3)), h4 = h21(id.add(11.1));
        const ph = fract(T.mul(mix(0.03, 0.09, h4)).add(h2.mul(7.1)));
        const pres = smoothstep(h3, h3.add(0.12), U.uLensDrop.mul(0.42 * k).mul(ctr));
        const r = mix(0.14, 0.33, h4).mul(smoothstep(0, 0.04, ph)).mul(smoothstep(1, 0.72, ph)).mul(pres);
        const d = f.sub(vec2(h1, h2).sub(0.5).mul(float(0.85).sub(r.mul(2)))).mul(vec2(1, 1.12));
        const aa = fwidth(q.x).mul(1.5);
        drop(d.div(sc), r.div(sc), smoothstep(r.add(aa), r.mul(0.7), length(d)).mul(stepT(0.02, r)));
      }
      If(U.uLensRun.greaterThan(0.01), () => {   // runners: one lane every ~0.14 of the frame height, a drop sliding down now and then
        const cs = 7, lane = floor(p.x.mul(cs)), hc = h21(vec2(lane, 3.1)), on = stepT(hc, U.uLensRun.mul(0.45));
        const ph = fract(T.mul(mix(0.07, 0.16, h21(vec2(lane, 8.3)))).add(hc.mul(9.7)));
        const y0 = ph.mul(1.5).sub(0.25), wob = (y) => sin(y.mul(23).add(hc.mul(9))).mul(0.006).add(sin(y.mul(7).add(hc.mul(3))).mul(0.014));
        const dx = p.x.sub(lane.add(0.5).div(cs)).sub(wob(p.y)), r = mix(0.016, 0.026, hc).mul(on);
        const d = vec2(dx, p.y.sub(y0).mul(0.8));
        drop(d, r, smoothstep(r.add(0.002), r.mul(0.8), length(d)).mul(stepT(0.001, r)));
        const tt = y0.sub(p.y).div(0.32), inT = stepT(0, tt).mul(stepT(tt, 1)).mul(on);   // the trail it leaves above it
        const ty = floor(p.y.mul(45)), tyc = ty.add(0.5).div(45), hb = h21(vec2(lane, ty));
        const rt = float(0.0055).mul(tt.oneMinus()).mul(stepT(0.45, hb)).mul(inT);
        const dt = vec2(p.x.sub(lane.add(0.5).div(cs)).sub(wob(tyc)), p.y.sub(tyc));
        drop(dt, rt, smoothstep(rt.add(0.0015), rt.mul(0.75), length(dt)).mul(stepT(0.0005, rt)));
        lClr.assign(smoothstep(0.012, 0.004, abs(dx)).mul(inT).mul(tt.oneMinus()));   // the run wipes the damp film behind it
      });
      If(U.uLensFrost.greaterThan(0.005), () => {   // frost: feathery crystals growing in from the edges, heaviest in the corners
        const k = sqrt(u0.x.mul(u0.x.oneMinus()).mul(4).mul(u0.y.mul(u0.y.oneMinus()).mul(4)));   // 0 at the frame's edge, 1 in the middle: deepest in the corners
        const cr = vn(p.mul(3.1)).mul(0.5).add(vn(p.mul(9.3)).mul(0.3)).add(vn(p.mul(27)).mul(0.2));
        const field = k.add(cr.sub(0.5).mul(0.3)), fr = U.uLensFrost, edge = fr.mul(0.42);
        lFr.assign(smoothstep(edge, edge.sub(0.07), field).mul(min(fr.mul(3), float(1))));
        lOff.addAssign(vec2(vn(p.mul(30)), vn(p.mul(30).add(5.3))).sub(0.5).mul(0.003).mul(lFr));
      });
      lOff.assign(vec2(lOff.x.div(asp), lOff.y));
    });
    const u = u0.add(lOff).toVar();
    const ab = U.uDmg.mul(0.006).add(0.0015).add(U.uAberr).mul(r2).mul(4);
    const c = vec3(S(u.add(cc.mul(ab))).r, S(u).g, S(u.sub(cc.mul(ab))).b).toVar();
    {   // contrast-adaptive sharpen: pulls back the softness of MSAA + upscaling, eased off on already-contrasty edges
      const px = vec2(1).div(U.uRes), n = S(u.add(vec2(0, px.y))), s = S(u.sub(vec2(0, px.y))), e = S(u.add(vec2(px.x, 0))), w = S(u.sub(vec2(px.x, 0)));
      const mn = min(min(min(n, s), min(e, w)), c), mxv = max(max(max(n, s), max(e, w)), c);
      const amp = sqrt(clampT(min(mn, vec3(2).sub(mxv)).div(max(mxv, vec3(1e-4))), 0, 1)).mul(U.uSharp);
      c.assign(max(c.add(n.add(s).add(e).add(w).mul(amp.negate()).mul(0.25)).div(vec3(1).sub(amp)), vec3(0)));
    }
    If(lM.add(lFr).add(U.uLensFog).greaterThan(0.002), () => {   // the lens's damp film and frost soften what's behind them; drops stay sharp
      const fogK = clampT(U.uLensFog.mul(lM.oneMinus()).mul(lClr.oneMinus()).add(lFr.mul(0.85)), 0, 1);
      If(fogK.greaterThan(0.002), () => {
        const o = vec2(1).div(U.uRes).mul(mix(2.5, 5, lFr)), bl = vec3(0).toVar();
        for (let k = 0; k < 8; k++) { const a = k * 0.785 + 0.39, rr = k % 2 ? 1 : 1.9; bl.addAssign(S(u.add(o.mul(vec2(Math.cos(a) * rr, Math.sin(a) * rr))))); }   // a soft disc, not a doubled image
        bl.mulAssign(0.125);
        c.assign(mix(c, bl, fogK));
        If(lFr.greaterThan(0.001), () => {   // frost: pale ice that catches the light behind it, feathered with crystal ridges
          const asp = U.uRes.x.div(U.uRes.y), p = vec2(u0.x.mul(asp), u0.y);
          const facet = (q) => {   // ice crystals: cellular facets, each catching the light its own way, bright along the seams
            const qi = floor(q).toVar(), qf = fract(q).toVar(), F1 = float(9).toVar(), F2 = float(9).toVar(), id = qi.toVar();
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
              const o = vec2(i, j), lo = qi.add(o), dd = length(o.add(vec2(h21(lo), h21(lo.add(5.3)))).sub(qf)).toVar();
              If(dd.lessThan(F1), () => { F2.assign(F1); F1.assign(dd); id.assign(lo); }).ElseIf(dd.lessThan(F2), () => { F2.assign(dd); });
            }
            return h21(id.mul(1.7)).mul(0.5).add(smoothstep(0.07, 0, F2.sub(F1)).mul(0.7));
          };
          const fea = facet(p.mul(26)).mul(0.6).add(facet(p.mul(71).add(3.3)).mul(0.4)).mul(smoothstep(0, 0.6, lFr));
          const lum = dot(bl, vec3(0.3, 0.59, 0.11));
          const ice = bl.mul(0.62).add(vec3(0.62, 0.7, 0.8).mul(lum.mul(0.55).add(0.05))).add(vec3(0.75, 0.82, 0.92).mul(fea).mul(lum.mul(0.5).add(0.025)));
          c.assign(mix(c, ice, lFr.mul(0.85)));
        });
      });
      c.mulAssign(lSh.add(1));
    });
    If(U.uFocus.greaterThan(0.001), () => {   // aiming: the edges of the frame soften, the target stays crisp
      const k = U.uFocus.mul(smoothstep(0.02, 0.2, r2)), acc = c.toVar(), wsum = float(1).toVar();
      for (let i = 1; i <= 6; i++) { const t = i / 6, o = cc.mul(t * 0.014).mul(k), w = 1 - t * 0.5; acc.addAssign(S(u.sub(o)).mul(w).add(S(u.add(o.mul(0.5))).mul(w * 0.5))); wsum.addAssign(w * 1.5); }
      c.assign(mix(c, acc.div(wsum), clampT(k.mul(2), 0, 0.85)));
    });
    {   // the lens: streaks (a long faint tail over a short bright core, cooled the way anamorphic coatings tint them) and film
      // halation, the red-orange fringe light scatters into round bright things off the film base
      // a short bright core and a tail that fades out well before the frame edge: every lamp head used to draw a line across the whole screen
      const sk = st1T.sample(u).rgb.mul(1.5).add(st2T.sample(u).rgb.mul(2)).add(stT.sample(u).rgb.mul(2)), sl = dot(sk, vec3(0.3, 0.59, 0.11));
      c.addAssign(mix(sk, vec3(sl).mul(vec3(0.55, 0.8, 1.3)), 0.45).mul(U.uStreak));
      c.addAssign(blT.sample(u).rgb.mul(vec3(1.0, 0.38, 0.16)).mul(U.uHal));
    }
    c.mulAssign(U.uExpo);
    {   // highlights burn toward white the way film and the eye see a hot neon tube: the colour stays in the glow round it
      const mc = max(max(c.r, c.g), c.b);
      c.assign(mix(c, vec3(mc).mul(0.92).add(c.mul(0.08)), smoothstep(1.4, 9, mc).mul(U.uWhite)));
    }
    const lum = dot(c, vec3(0.3, 0.59, 0.11));
    c.assign(mix(c, vec3(lum).mul(vec3(1.1, 0.9, 0.9)), U.uLow.mul(0.55)));
    c.assign(aces(c));
    c.mulAssign(U.uGrade); const lm = dot(c, vec3(0.3, 0.59, 0.11)); c.assign(mix(vec3(lm), c, U.uSat)); c.addAssign(U.uLift.mul(c.oneMinus()));
    c.assign(pow(clampT(c, 0, 1), vec3(1 / 2.2)));
    c.assign(mix(c, c.mul(c).mul(c.mul(-2).add(3)), 0.42));   // S-curve: deeper blacks, punchier neon
    const l2 = dot(c, vec3(0.3, 0.59, 0.11)).toVar(); c.assign(max(mix(vec3(l2), c, 1.18), vec3(0))); c.mulAssign(smoothstep(0.12, 0, l2).mul(-0.35).add(1));   // richer colour, crushed shadows
    const vig = smoothstep(0.85, 0.2, sqrt(r2).mul(1.25)); c.mulAssign(mix(0.72, 1, vig));
    const edge = smoothstep(0.25, 0.75, sqrt(r2).mul(1.4));
    c.assign(mix(c, vec3(0.75, 0.02, 0.08), edge.mul(clampT(U.uDmg, 0, 1)).mul(0.75)));
    c.assign(mix(c, vec3(0.5, 0, 0.05), edge.mul(U.uLow).mul(sin(U.uTime.mul(6)).mul(0.2).add(0.25))));
    {   // film grain: triangular noise, strongest in the mid-tones the way silver grain shows, faint in deep shadow and highlights
      const gp = u.mul(U.uRes).add(fract(U.uTime).mul(100)), gl = dot(c, vec3(0.3, 0.59, 0.11));
      c.addAssign(h21(gp).add(h21(gp.add(vec2(17.31, 5.73)))).sub(1).mul(gl.mul(gl.oneMinus()).mul(2.4).add(0.35).mul(0.013)));
    }
    return vec4(c, 1);
  });
  const pipe = new THREE.RenderPipeline(renderer, grade());
  pipe.outputColorTransform = false;   // the grade does its own tone curve + gamma
  Object.assign(GPOST, { pipe, world, vm: vmP, bloom: bl, ao: aoN, pre, comb, streak: [st1, st2, st3], key: q });
}

/* ---------------- GPU timing per pass (?prof=1): WebGPU timestamp queries, one per render call ----------------
   A custom inspector names each render by what it draws; after the queries resolve, their times are summed by name. */
const GPU_PROF = { names: new Map(), acc: {}, shadowCams: new Set(), busy: false, ok: false, tag: null };   // tag: r3.js names whole jobs (env capture, mirror)
class GPUProfInspector extends THREE.InspectorBase {
  beginRender(uid, scn, cam, rt) {
    let n;
    if (GPU_PROF.shadowCams.has(cam)) n = 'shadows'; else if (GPU_PROF.tag) n = GPU_PROF.tag; else if (cam === camera) n = GPOST.pre && rt === GPOST.pre.renderTarget ? 'ao prepass' : 'world'; else if (cam === vmCamera) n = 'bow';
    else { const s = (scn && scn.name) || ''; n = /Bloom/.test(s) ? 'bloom' : /AO|Denoise/.test(s) ? 'gtao' : /Render Pipeline/.test(s) ? 'grade' : 'post'; }
    GPU_PROF.names.set(uid, n);
  }
}
function gpuProfPoll() {
  if (!renderer.backend.trackTimestamp || GPU_PROF.busy) return;
  GPU_PROF.busy = true;
  renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER).then(() => {
    const pool = renderer.backend.timestampQueryPool.render; if (!pool) return;
    const frames = {};   // per-frame sums by pass name, then averaged over the frames resolved
    for (const [uid, ms] of pool.timestamps) {
      const n = GPU_PROF.names.get(uid) || 'post', f = uid.slice(uid.lastIndexOf(':f') + 2);
      const fr = frames[f] || (frames[f] = {}); fr[n] = (fr[n] || 0) + ms; GPU_PROF.names.delete(uid);
    }
    for (const fr of Object.values(frames)) for (const n in fr) { const a = GPU_PROF.acc[n] || (GPU_PROF.acc[n] = { s: 0, n: 0 }); a.s += fr[n]; a.n++; }
    if (GPU_PROF.names.size > 4096) GPU_PROF.names.clear();
    GPU_PROF.ok = true;
  }).catch(() => { }).finally(() => { GPU_PROF.busy = false; });
}
