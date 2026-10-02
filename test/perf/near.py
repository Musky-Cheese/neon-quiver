"""Near-zone shots for the laptop pass: fixed poses x qualities, each with a per-pixel view-depth map.
   python3 test/perf/near.py OUTDIR [--q 0,1,L,2,3] [--size 480x270]
   Writes q{Q}_{pose}.png (the frame) and d{Q}_{pose}.png (16-bit distance from the eye in cm; 0 = viewmodel, 65535 = sky).
   'L' is the Laptop level (Balanced pipeline + SETTINGS.laptop). Compare runs with test/perf/neardiff.py."""
import sys, os, base64, argparse, time
sys.path.insert(0, os.path.dirname(__file__))
from common import serve, open_game
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--q', default='0,1,L,2,3'); ap.add_argument('--size', default='480x270')
ap.add_argument('--only', default=''); a = ap.parse_args()
W, H = map(int, a.size.split('x')); os.makedirs(a.out, exist_ok=True)
# x, z, yaw (0 looks toward -z), pitch, zombie distances in front, bow drawn
POSES = [
  ('fight05', 0, 18, 0, -0.04, [5, 9, 60, 90], True),
  ('fight15', 0, 18, 0, -0.04, [15, 22, 70], True),
  ('fight30', 0, 18, 0, -0.04, [30, 38, 80], True),
  ('feet', 6, 4, 0.8, -0.5, [8], False),
  ('storefront', 20, 10, -1.57, -0.02, [10], False),
  ('plaza', 0, 36, 0, -0.08, [12, 50], False),
  ('market', 106, 0, -1.57, -0.06, [7, 14, 58], False),
  ('warrens', -84, 0, 1.57, -0.06, [7, 14, 58], False),
  ('suburbs', 0, 125, 0, -0.06, [8, 16, 64], False),
  ('yard', 0, -104, 0, -0.06, [8, 48], False),
  ('metro', -113, -96, 0.35, -0.06, [6, 50], False),
  ('garden', 0, 190, 0, -0.06, [8, 60], False),
]
WET = dict(state='rain', precip=0.68, snow=0, wind=0.4, storm=0, wet=1.0, cover=0)
DEPTH_JS = """() => { const N = window.NQ, T = N.THREE, r = N.renderer, W = r.domElement.width, H = r.domElement.height;
  if (!window.__nqD || window.__nqD.W !== W || window.__nqD.H !== H) {
    const mk = () => { const t = new T.WebGLRenderTarget(W, H); t.depthTexture = new T.DepthTexture(W, H); t.depthTexture.type = T.UnsignedIntType; return t; };
    const out = new T.WebGLRenderTarget(W, H);
    const mat = new T.ShaderMaterial({ uniforms: { tW: { value: null }, tV: { value: null }, n: { value: 0 }, f: { value: 0 }, pinv: { value: new T.Matrix4() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `varying vec2 vUv; uniform sampler2D tW, tV; uniform float n, f; uniform mat4 pinv;
        void main(){ float d = texture2D(tW, vUv).x, dv = texture2D(tV, vUv).x;
          vec4 vp = pinv * vec4(vUv * 2. - 1., d * 2. - 1., 1.); float z = d >= 1. ? 65535. : min(65534., length(vp.xyz / vp.w) * 100.);   // distance from the eye, cm
          if (dv < 1.) z = 0.;   // viewmodel pixel
          float hi = floor(z / 256.), lo = z - hi * 256.; gl_FragColor = vec4(hi / 255., lo / 255., 0., 1.); }`, depthTest: false, depthWrite: false });
    const q = new T.Mesh(new T.PlaneGeometry(2, 2), mat); q.frustumCulled = false; const sc = new T.Scene(); sc.add(q);
    window.__nqD = { W, H, w: mk(), v: mk(), out, mat, sc, cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
  }
  const D = window.__nqD, cam = N.camera, vm = N.vmCamera;
  r.setRenderTarget(D.w); r.clear(true, true, false); r.render(N.scene, cam);
  r.setRenderTarget(D.v); r.clear(true, true, false); if (!N.DBG.noVM) r.render(N.scene, vm);
  D.mat.uniforms.tW.value = D.w.depthTexture; D.mat.uniforms.tV.value = D.v.depthTexture; D.mat.uniforms.n.value = cam.near; D.mat.uniforms.f.value = cam.far; D.mat.uniforms.pinv.value.copy(cam.projectionMatrixInverse);
  r.setRenderTarget(D.out); r.render(D.sc, D.cam); const px = new Uint8Array(W * H * 4);
  r.readRenderTargetPixels(D.out, 0, 0, W, H, px); r.setRenderTarget(null);
  let s = ''; for (let i = 0; i < px.length; i += 4) s += String.fromCharCode(px[i], px[i + 1]);
  return [W, H, btoa(s)]; }"""
httpd, url = serve(); t0 = time.time()
with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, W, H, loop=False, query='?nowarn=1')
    pg.evaluate("() => { const N = window.NQ; N.noLoop(true); N.play(); N.clear(); N.freeze(true); N.DBG.noVM = false; }")
    poses = [p for p in POSES if not a.only or p[0] in a.only.split(',')]
    for qs in a.q.split(','):
        q = 1 if qs == 'L' else int(qs); lap = qs == 'L'
        pg.evaluate("([q, l]) => { const N = window.NQ; N.SETTINGS.quality = q; N.SETTINGS.laptop = l; N.renderOnce(); }", [q, lap])
        if q >= 1:
            pg.wait_for_function("(q) => { const U = window.NQ.ULTRA; return U.state === 'failed' || (U.state === 'ready' && U.res === (q >= 2 ? 'full' : 'half')); }", arg=q, timeout=180000, polling=250)
        if qs == a.q.split(',')[0]:   # every build captures its env maps under the same conditions (at the first pose, in play)
            pg.evaluate("() => { const N = window.NQ, k = N.SETTINGS.look; N.setTheme(k === 'smog' ? 'noir' : 'smog'); N.setTheme(k); }")
        for (pid, x, z, yaw, pitch, zd, drawn) in poses:
            png = pg.evaluate("""([p, w]) => { const [pid, x, z, yaw, pitch, zd, drawn] = p, N = window.NQ;
              Object.assign(N.WX, w, { flash: 0, gust: 0, forced: w.state }); N.WX.thunder.length = 0;
              N.clear(); N.GAME.time = 100; N.PLAYER.dmgFlash = 0; window.__nqSeed(12345);
              const K = ['walker', 'runner', 'brute', 'walker'];
              zd.forEach((d, i) => { const zz = N.spawnZombie(K[i % 4], x - Math.sin(yaw) * d + (i % 2 ? 1.2 : -1.2), z - Math.cos(yaw) * d, 1); zz.speed = 0; });
              N.BOW.state = drawn ? 'drawing' : 'ready'; N.BOW.draw = drawn ? 1 : 0;
              N.pose({ x, z, y: 0, yaw, pitch, roll: 0, fov: 70 });
              for (let i = 0; i < 10; i++) N.renderOnce();   // enough for a spread env capture to finish
              return N.renderer.domElement.toDataURL('image/png'); }""", [[pid, x, z, yaw, pitch, zd, drawn], WET])
            open(os.path.join(a.out, f'q{qs}_{pid}.png'), 'wb').write(base64.b64decode(png.split(',')[1]))
            w, h, raw = pg.evaluate(DEPTH_JS)
            import numpy as np
            from PIL import Image
            arr = np.frombuffer(base64.b64decode(raw), np.uint8).reshape(h, w, 2).astype(np.uint16)
            dep = np.flipud((arr[..., 0] << 8) | arr[..., 1])   # GL rows run bottom-up
            Image.fromarray(dep.astype(np.uint16)).save(os.path.join(a.out, f'd{qs}_{pid}.png'))
            print(qs, pid, f'near<45m {100 * (dep < 4500).mean():.0f}%', flush=True)
    pg.evaluate("() => { const N = window.NQ; N.BOW.state = 'ready'; N.BOW.draw = 0; }")
    open(os.path.join(a.out, 'errors.txt'), 'w').write('\n'.join(errs))
    print('errors:', errs[:5], f'({time.time() - t0:.0f}s)'); b.close()
httpd.shutdown()
