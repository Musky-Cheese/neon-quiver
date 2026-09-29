"""Frame-cost benchmark on SwiftShader (the GPU runs on the CPU, so shading, triangle and pass costs show up
   roughly in proportion to a weak integrated GPU). Per spot: wall ms/frame with a GPU sync, JS-only CPU ms of
   step + render, draw calls, triangles. 30 infected near the camera.
   python3 test/perf/bench.py [--q 0,1,2] [--only hub,warrens] [--size 480x270] [--json out.json]"""
import sys, os, json, argparse, time
sys.path.insert(0, os.path.dirname(__file__))
from common import serve, open_game, SPOTS_JS
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--q', default='0,1,2'); ap.add_argument('--only', default=''); ap.add_argument('--size', default='480x270')
ap.add_argument('--frames', type=int, default=3); ap.add_argument('--json', default=''); a = ap.parse_args()
W, H = map(int, a.size.split('x'))
httpd, url = serve(); res = {}
with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, W, H, capture=False)
    spots = [s for s in pg.evaluate(SPOTS_JS) if s['id'].endswith('-a')]
    if a.only: spots = [s for s in spots if s['id'].rsplit('-', 1)[0] in a.only.split(',')]
    for q in map(int, a.q.split(',')):
        for s in spots:
            r = pg.evaluate("""([q, s, n]) => { const N = window.NQ; N.noLoop(true); N.SETTINGS.quality = q; N.play(); N.clear(); N.freeze(false);
              Object.assign(N.WX, { state: 'rain', forced: 'rain', precip: 0.68, snow: 0, wet: 1, cover: 0, flash: 0 });
              const K = ['walker', 'walker', 'walker', 'runner', 'runner', 'brute'];
              for (let i = 0; i < 30; i++) { const a = i * 0.7, d = 8 + (i % 7) * 3; N.spawnZombie(K[i % 6], s.x + Math.sin(a) * d, s.z + Math.cos(a) * d, 5); }
              N.pose({ x: s.x, z: s.z, y: 0, yaw: s.yaw, pitch: -0.07, roll: 0 });
              const gl = N.renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
              for (let i = 0; i < 2; i++) { N.pose({ x: s.x, z: s.z }); N.step(1 / 60); N.renderOnce(); } sync();
              N.renderer.info.autoReset = false; N.renderer.info.reset();
              let wall = 0, cpuStep = 0, cpuRender = 0;
              for (let i = 0; i < n; i++) { N.pose({ x: s.x, z: s.z }); const t0 = performance.now(); N.step(1 / 60); const t1 = performance.now(); N.renderOnce(); const t2 = performance.now(); sync(); const t3 = performance.now();
                cpuStep += t1 - t0; cpuRender += t2 - t1; wall += t3 - t0; }
              const inf = N.renderer.info.render; N.renderer.info.autoReset = true;
              return { wall: +(wall / n).toFixed(0), step: +(cpuStep / n).toFixed(2), renderJS: +(cpuRender / n).toFixed(2), calls: Math.round(inf.calls / n), ktris: Math.round(inf.triangles / n / 1e3) }; }""", [q, s, a.frames])
            res[f'q{q} {s["id"]}'] = r; print(f'q{q} {s["id"]:14s} {r}', flush=True)
        qs = [v for k, v in res.items() if k.startswith(f'q{q} ')]
        print(f'q{q} MEAN wall {sum(v["wall"] for v in qs) / len(qs):.0f} ms  step {sum(v["step"] for v in qs) / len(qs):.2f}  renderJS {sum(v["renderJS"] for v in qs) / len(qs):.2f}  calls {sum(v["calls"] for v in qs) / len(qs):.0f}  ktris {sum(v["ktris"] for v in qs) / len(qs):.0f}', flush=True)
    print('errors:', errs[:5]); b.close()
if a.json: json.dump(res, open(a.json, 'w'), indent=1)
httpd.shutdown()
