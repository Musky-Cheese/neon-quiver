/* ============================================================
   Clustered lighting (WebGPU): every point light in reach, not just the nearest sixteen
   Forward+ clustered shading after three r186's ClusteredLightsNode (examples/jsm/tsl/lighting), changed for this game:
   - the cluster grid is a fixed 48 x 27 x 24 in screen fractions, not pixel tiles, so one grid serves every target the
     scene draws into (the MSAA world pass, the bow, the puddle mirror, the 128 px env cube faces) and the material shaders
     never change when the target size does (a pixel grid rebuilt its shader on every size change: a compile per pass);
   - depth slices run from 0.3 m to 300 m (the camera's 0.03 m near plane wasted a third of them on the first metre);
   - each cluster lists its nearest lights first, so a crowded far cluster drops distant lights, never close ones;
   - a light with userData.src (the neon, r3.js buildNeonLights) is a small glowing body of that radius, lit with
     1 / (d^2 + src^2): bright along the wall it hangs on, without the hot point a bare 1 / d^2 burns into the bricks.
     Every other light keeps three's usual falloff, so the lamps, shops and flashes look exactly as they did.
   Lights with intensity 0 are skipped, so a pool can be parked by zeroing it, without changing the scene's light list
   (which would rebuild every material). Shadow-casting lights stay on three's own path.
   ============================================================ */
const CL = { NX: 48, NY: 27, NZ: 24, PER: 96, MAX: 1024, ZN: 0.3, ZF: 300 };
CL.CHUNKS = CL.PER / 4;
const _clV = new THREE.Vector3(), _clSize = new THREE.Vector2();
class NQClusterNode extends THREE.LightsNode {
  static get type() { return 'NQClusterNode'; }
  constructor() {
    super();
    this.materialLights = []; this.clusteredLights = [];
    const T = THREE.TSL;
    const data = new Float32Array(CL.MAX * 4 * 2);
    this._lightsTexture = new THREE.DataTexture(data, CL.MAX, 2, THREE.RGBAFormat, THREE.FloatType);
    this._zData = new Float32Array(CL.NZ * 4);
    this._zTexture = new THREE.DataTexture(this._zData, CL.NZ, 1, THREE.RGBAFormat, THREE.FloatType);
    this._viewZ = new Float32Array(CL.MAX); this._order = []; this._active = [];
    this._count = T.uniform(0, 'int');
    const G = (n, v, t) => T.uniform(v, t).setName(n).setGroup(T.renderGroup);
    this._zn = G('clZn', CL.ZN); this._zf = G('clZf', CL.ZF); this._far = G('clFar', 1000);
    this._view = G('clView', new THREE.Matrix4(), 'mat4'); this._proj = G('clProj', new THREE.Matrix4(), 'mat4');
    this._target = G('clTarget', new THREE.Vector2(1, 1));
    this._build();
    this.updateBeforeType = THREE.NodeUpdateType.RENDER;
  }
  customCacheKey() { return this._compute.getCacheKey() + super.customCacheKey(); }
  // the depth slice a view distance falls in (the same formula on the CPU and in both shaders)
  _sliceNear(z) { return z === 0 ? 0 : CL.ZN * Math.pow(CL.ZF / CL.ZN, z / CL.NZ); }
  _sliceFar(z, far) { return z === CL.NZ - 1 ? far : CL.ZN * Math.pow(CL.ZF / CL.ZN, (z + 1) / CL.NZ); }
  updateLightsTexture(camera) {
    const data = this._lightsTexture.image.data, line = CL.MAX * 4, act = this._active; act.length = 0;
    for (const l of this.clusteredLights) if (l.intensity > 0 && l.visible && act.length < CL.MAX) act.push(l);
    const n = act.length, vz = this._viewZ, ord = this._order; ord.length = n;
    this._count.value = n;
    for (let i = 0; i < n; i++) { _clV.setFromMatrixPosition(act[i].matrixWorld).applyMatrix4(camera.matrixWorldInverse); vz[i] = _clV.z; ord[i] = i; }
    ord.sort((a, b) => vz[b] - vz[a]);   // nearest first (view z is negative in front)
    for (let i = 0; i < n; i++) {
      const l = act[ord[i]], o = i * 4, k = l.intensity, s = l.userData.src;
      _clV.setFromMatrixPosition(l.matrixWorld);
      data[o] = _clV.x; data[o + 1] = _clV.y; data[o + 2] = _clV.z; data[o + 3] = l.distance;
      data[line + o] = l.color.r * k; data[line + o + 1] = l.color.g * k; data[line + o + 2] = l.color.b * k; data[line + o + 3] = s ? -s : l.decay;
    }
    this._lightsTexture.needsUpdate = true;
    const zr = this._zData, far = camera.far;
    for (let z = 0; z < CL.NZ; z++) {
      const sn = -this._sliceNear(z), sf = -this._sliceFar(z, far);
      let a = n, b = 0;
      for (let i = 0; i < n; i++) { const v = vz[ord[i]], r = act[ord[i]].distance || far; if (v + r >= sf && v - r <= sn) { if (i < a) a = i; b = i + 1; } }
      if (a >= n) { a = 0; b = 0; }
      zr[z * 4] = a; zr[z * 4 + 1] = b;
    }
    this._zTexture.needsUpdate = true;
  }
  updateBefore(frame) {
    const { renderer, camera } = frame, rt = renderer.getRenderTarget();
    if (rt) this._target.value.set(rt.width, rt.height); else { renderer.getDrawingBufferSize(_clSize); this._target.value.copy(_clSize); }
    this.updateLightsTexture(camera);
    this._far.value = camera.far;
    this._view.value = camera.matrixWorldInverse; this._proj.value = camera.projectionMatrix;
    renderer.compute(this._compute);
  }
  setLights(lights) {
    const C = this.clusteredLights, M = this.materialLights; let m = 0, c = 0;
    for (const l of lights) { if (l.isPointLight === true && l.castShadow !== true) C[c++] = l; else M[m++] = l; }
    M.length = m; C.length = c;
    return super.setLights(lights);
  }
  getBuiltinLights() { return this.materialLights; }
  _light(index) {
    const T = THREE.TSL, a = T.textureLoad(this._lightsTexture, T.ivec2(index, 0)), b = T.textureLoad(this._lightsTexture, T.ivec2(index, 1));
    return { position: a.xyz, viewPosition: this._view.mul(T.vec4(a.xyz, 1)).xyz, distance: a.w, color: b.rgb, decay: b.w };
  }
  _build() {
    const T = THREE.TSL, { Fn, If, Loop, Return, int, float, vec3, ivec2, ivec4, min, max, pow, log, clamp, dot, instanceIndex } = T;
    const { NX, NY, NZ, CHUNKS, PER } = CL, count = NX * NY * NZ;
    const idx = T.attributeArray(new Int32Array(count * CHUNKS * 4), 'ivec4').setName('nqClusterLights');
    const slot = (base, s) => { s = int(s); return idx.element(base.mul(CHUNKS).add(s.div(4))).element(s.mod(4)); };
    const lnZ = log(float(CL.ZF / CL.ZN));
    this._compute = Fn(() => {
      const ifx = float(1).div(this._proj.element(0).element(0)), ify = float(1).div(this._proj.element(1).element(1));
      const cx = instanceIndex.mod(NX), cy = instanceIndex.div(NX).mod(NY), cz = instanceIndex.div(NX * NY);
      const x0 = float(cx).mul(2 / NX).sub(1), x1 = float(cx.add(1)).mul(2 / NX).sub(1);
      const y1 = float(1).sub(float(cy).mul(2 / NY)), y0 = float(1).sub(float(cy.add(1)).mul(2 / NY));
      // slice 0 reaches back to the eye and the last one out to the far plane, so nothing falls outside the grid
      const zn = cz.equal(0).select(float(0), this._zn.mul(T.exp(float(cz).mul(lnZ.div(NZ))))).negate();
      const zf = cz.equal(NZ - 1).select(this._far, this._zn.mul(T.exp(float(cz.add(1)).mul(lnZ.div(NZ))))).negate();
      const sxn = zn.negate().mul(ifx), sxf = zf.negate().mul(ifx), syn = zn.negate().mul(ify), syf = zf.negate().mul(ify);
      const bmin = vec3(min(x0.mul(sxn), x0.mul(sxf)), min(y0.mul(syn), y0.mul(syf)), zf), bmax = vec3(max(x1.mul(sxn), x1.mul(sxf)), max(y1.mul(syn), y1.mul(syf)), zn);
      Loop(CHUNKS, ({ i }) => { idx.element(instanceIndex.mul(CHUNKS).add(i)).assign(ivec4(0)); });
      const n = int(0).toVar(), zr = T.textureLoad(this._zTexture, ivec2(cz, 0)), a = int(zr.x), b = int(zr.y);
      Loop(CL.MAX, ({ i }) => {
        const li = a.add(i);
        If(n.greaterThanEqual(PER).or(li.greaterThanEqual(b)), () => { Return(); });
        const { viewPosition, distance } = this._light(li);
        const d = viewPosition.sub(max(bmin, min(viewPosition, bmax)));
        If(dot(d, d).lessThanEqual(distance.mul(distance)), () => { slot(instanceIndex, n).assign(li.add(1)); n.addAssign(1); });
      });
    })().compute(count).setName('NQ clustered lights');
    // fragment -> its cluster, in fractions of whatever target is being drawn
    this._cluster = Fn(() => {
      const t = T.screenCoordinate.div(this._target), tx = clamp(T.floor(t.x.mul(NX)), 0, NX - 1), ty = clamp(T.floor(t.y.mul(NY)), 0, NY - 1);
      const zs = clamp(T.floor(log(max(T.positionView.z.negate(), CL.ZN).div(this._zn)).div(lnZ).mul(NZ)), 0, NZ - 1);
      return int(tx).add(int(ty).mul(NX)).add(int(zs).mul(NX * NY));
    })().toVar();
    this._slot = (i) => slot(this._cluster, i);
  }
  setupLights(builder, lightNodes) {
    const T = THREE.TSL, { Fn, If, Loop, Break, int, float, max, dot } = T;
    const lm = builder.context.reflectedLight; lm.directDiffuse.toStack(); lm.directSpecular.toStack();
    const pbr = builder.material && builder.material.isMeshStandardMaterial === true;
    super.setupLights(builder, lightNodes);
    Fn(() => {
      Loop(CL.PER, ({ i }) => {
        const li = this._slot(i);
        If(li.equal(int(0)), () => { Break(); });
        const { color, decay, viewPosition, distance } = this._light(li.sub(1));
        const lv = viewPosition.sub(T.positionView), d2 = dot(lv, lv);
        If(d2.lessThanEqual(distance.mul(distance)), () => {
          // three's window (Frostbite eq. 26) on both kinds; a glowing body (neon, decay < 0 holds its radius) falls off as
          // 1 / (d^2 + r^2), every other light as three's 1 / max(d^decay, 0.01). One BRDF evaluation either way.
          const w = d2.div(distance.mul(distance)), win = w.mul(w).oneMinus().clamp().pow2();
          const att = T.select(decay.lessThan(0), float(1).div(d2.add(decay.mul(decay))), T.pow(T.sqrt(d2), max(decay, 0)).max(0.01).reciprocal());
          if (!pbr) { builder.lightsNode.setupDirectLight(builder, this, { lightDirection: lv.normalize(), lightColor: color.mul(att.mul(win)) }); return; }
          // A glowing body's highlight on a near-mirror (wet glass, polished paint) is the tube's own shape, which the mirror
          // and env map already draw; as a point it burned a pin-sharp star the streaks smeared across the frame. Karis's
          // sphere-light normalisation scales its specular by (a / a')^2, a' = a + radius / (2 d): the energy a highlight as
          // wide as the tube would spread out. Plain point lights (radius 0) are untouched.
          const sp0 = lm.directSpecular.toVar(), a = T.roughness.mul(T.roughness).max(0.002);
          const a2 = a.add(max(decay.negate(), 0).mul(T.inverseSqrt(d2.max(1e-4))).mul(0.5)).min(1), norm = a.div(a2).pow2();
          builder.lightsNode.setupDirectLight(builder, this, { lightDirection: lv.normalize(), lightColor: color.mul(att.mul(win)) });
          lm.directSpecular.assign(sp0.add(lm.directSpecular.sub(sp0).mul(norm)));
        });
      });
    }, 'void')();
  }
  dispose() { this._compute.dispose(); this._lightsTexture.dispose(); this._zTexture.dispose(); super.dispose(); }
}
class NQClusterLighting extends THREE.Lighting {
  createNode(lights = []) { return new NQClusterNode().setLights(lights); }
}
// WebGPU only: the WebGL2 backend has no storage buffers in fragment shaders, so it keeps three's forward lights
const CLUSTERED = NQ_BACKEND === 'webgpu';
if (CLUSTERED) renderer.lighting = new NQClusterLighting();
