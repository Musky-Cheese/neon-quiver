"""Side-view gait strip: one zombie per gait, N frames. usage: gait.py out.jpg [look]"""
import sys, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1]; LOOK = sys.argv[2] if len(sys.argv) > 2 else 'dawn'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 400}); E = []
    pg.on('pageerror', lambda e: E.append(str(e)))
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    pg.evaluate("""(L) => { const N = window.NQ; N.SETTINGS.quality = 2; N.play(); N.clear(); N.noLoop(true); N.DBG.noVM = true; N.setTheme(L);
      const G = [['walker','walk','shirt'],['walker','walk_b','jacket'],['walker','walk_c','bloat'],['runner','run','lean'],['runner','run_b','shirt'],['brute','heavy','shirt']];
      window.__zs = G.map(([k, g, top], i) => { const z = N.spawnZombie(k, 0, 24 + i * 1.6, 3); z.gait = g; z.top = top; z.bare = top === 'lean'; z.seed = i * 5.1; z.z0 = z.z; return z; }); }""", LOOK)
    tiles = []
    for f in range(4):
        url = pg.evaluate("""() => { const N = window.NQ; N.pose({ x: 7.5, z: 28, y: 0, yaw: 1.5708, pitch: 0.05, roll: 0 });
          for (let i = 0; i < 4; i++) { N.step(0.05); for (const z of window.__zs) { z.x = 0; z.z = z.z0; z.yaw = Math.PI; z.mv = z.speed; } }
          N.renderOnce(); N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.9); }""")
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))))
    print('errors:', E[:3])
    W, H = tiles[0].size; g = Image.new('RGB', (W, H * len(tiles)))
    for i, t in enumerate(tiles): g.paste(t, (0, i * H))
    g.save(out, quality=85); b.close()
