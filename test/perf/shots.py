"""Fixed-camera screenshots: every district x every quality x wet / dry / snow.
   python3 test/perf/shots.py OUTDIR [--q 0,1,2,3] [--wx wet,dry,snow] [--only hub,yard] [--size 400x225]
   Compare two runs with test/perf/diff.py A B."""
import sys, os, json, base64, argparse, time
sys.path.insert(0, os.path.dirname(__file__))
from common import serve, open_game, SPOTS_JS
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--q', default='0,1,2,3'); ap.add_argument('--wx', default='wet,dry,snow')
ap.add_argument('--only', default=''); ap.add_argument('--size', default='400x225'); a = ap.parse_args()
W, H = map(int, a.size.split('x')); os.makedirs(a.out, exist_ok=True)
WX = {  # surface + sky state pinned exactly (no easing: the game loop is frozen)
  'wet':  dict(state='rain', precip=0.68, snow=0, wind=0.4, storm=0, wet=1.0, cover=0),
  'dry':  dict(state='dry', precip=0.0, snow=0, wind=0.15, storm=0, wet=0.12, cover=0),
  'snow': dict(state='snow', precip=0.62, snow=1, wind=0.3, storm=0, wet=0.3, cover=1),
}
httpd, url = serve(); t0 = time.time()
with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, W, H)
    pg.evaluate("""() => { const N = window.NQ; N.noLoop(true); N.play(); N.clear(); N.freeze(true); N.DBG.noVM = false; }""")
    spots = pg.evaluate(SPOTS_JS)
    if a.only: spots = [s for s in spots if s['id'].rsplit('-', 1)[0] in a.only.split(',')]
    for q in map(int, a.q.split(',')):
        pg.evaluate("(q) => { window.NQ.SETTINGS.quality = q; window.NQ.renderOnce(); }", q)
        if q >= 1:   # surface textures stream in: wait for the right set
            pg.wait_for_function("(q) => { const U = window.NQ.ULTRA; return U.state === 'failed' || (U.state === 'ready' && U.res === (q >= 2 ? 'full' : 'half')); }", arg=q, timeout=120000)
        for wx in a.wx.split(','):
            for s in spots:
                png = pg.evaluate("""([s, w]) => { const N = window.NQ; Object.assign(N.WX, w, { flash: 0, gust: 0, forced: w.state }); N.WX.thunder.length = 0;
                  N.clear(); N.GAME.time = 100; N.PLAYER.dmgFlash = 0;
                  // a few infected in view so skinned shading is covered too
                  for (let i = 0; i < 5; i++) { const z = N.spawnZombie(['walker', 'runner', 'brute', 'walker', 'walker'][i], s.x - Math.sin(s.yaw) * (6 + i * 2.5) + (i - 2) * 1.6, s.z - Math.cos(s.yaw) * (6 + i * 2.5), 1); z.speed = 0; }
                  N.pose({ x: s.x, z: s.z, y: 0, yaw: s.yaw, pitch: -0.07, roll: 0, fov: 70 });
                  for (let i = 0; i < 4; i++) N.renderOnce();
                  return N.renderer.domElement.toDataURL('image/png'); }""", [s, WX[wx]])
                fn = os.path.join(a.out, f'q{q}_{wx}_{s["id"]}.png')
                open(fn, 'wb').write(base64.b64decode(png.split(',')[1]))
                print(fn, flush=True)
    json.dump({'errors': errs}, open(os.path.join(a.out, 'errors.json'), 'w'))
    print('errors:', errs[:5], f'({time.time() - t0:.0f}s)'); b.close()
httpd.shutdown()
