"""Zombie line-up close-ups -> grid JPEG. usage: zoo.py out.jpg [quality] [anim_seconds]
Spawns a row of zombie types/variants in front of the camera, advances their animation, renders 2 views."""
import sys, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1]; Q = int(sys.argv[2]) if len(sys.argv) > 2 else 2; T = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
JS_SETUP = """(T) => { const N = window.NQ; N.SETTINGS.quality = %d; N.play(); N.clear(); N.noLoop(true); N.DBG.noVM = true;
  N.GAME.state = 'play'; if (window.__LOOK) N.setTheme(window.__LOOK);
  const kinds = ['walker','walker','runner','brute','walker','runner','walker','brute'];
  const zs = kinds.map((k, i) => { const z = N.spawnZombie(k, -4.2 + i * 1.2, 30, 3); z.yaw = 0; z.seed = i * 13.7; z.headVar = 'abcd'[i %% 4]; z.top = ['shirt','jacket','lean','shirt','bloat','bare','jacket','shirt'][i]; z.bare = z.top === 'bare' || z.top === 'lean'; z.sleeve = i %% 2 === 0; z.gait = ['walk','walk_b','run','heavy','walk_c','run_b','walk','heavy'][i]; z.x0 = z.x; return z; });
  window.__zs = zs; return zs.length; }""" % Q
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 960, 'height': 540}); E = []
    pg.on('pageerror', lambda e: E.append(str(e)))
    pg.on('console', lambda m: E.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1; window.__LOOK = ' + repr(sys.argv[5] if len(sys.argv) > 5 else ''))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    pg.evaluate(JS_SETUP, T)
    tiles = []
    VIEWS = [(0, 34.6, 0.0, 0.08), (-1.2, 32.2, -0.35, 0.02), (-4.2, 31.25, 0.0, 0.12), (0.6, 31.3, 0.0, 0.1), (-0.6, 31.9, 0.0, 0.22)]
    if len(sys.argv) > 4: VIEWS = [VIEWS[int(i)] for i in sys.argv[4].split(',')]
    for (x, z, yaw, pitch) in VIEWS:
        url = pg.evaluate("""([x, z, yaw, pitch, T]) => { const N = window.NQ;
          for (const zz of window.__zs) { zz.x = zz.x; }
          N.pose({ x, z, y: 0, yaw, pitch, roll: 0 });
          const n = Math.round(T / 0.05); for (let i = 0; i < n; i++) { N.step(0.05); for (const zz of window.__zs) { zz.z = 30; zz.x = zz.x0; zz.yaw = 0; } }
          for (let i = 0; i < 2; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.9); }""", [x, z, yaw, pitch, T])
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))))
    print('errors:', E[:5])
    W, H = tiles[0].size
    g = Image.new('RGB', (W * 2, H * ((len(tiles) + 1) // 2)))
    for i, t in enumerate(tiles): g.paste(t, ((i % 2) * W, (i // 2) * H))
    g.save(out, quality=85); b.close()
