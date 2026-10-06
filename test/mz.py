"""Meshy zombie close-ups -> grid JPEG.  usage: mz.py out.jpg [types] [quality] [anim_seconds]
types: comma list (default walker). Each type: front, 3/4 and side views at 2.4 m, head height."""
import sys, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1]; TYPES = (sys.argv[2] if len(sys.argv) > 2 else 'walker').split(','); Q = int(sys.argv[3]) if len(sys.argv) > 3 else 1
T = float(sys.argv[4]) if len(sys.argv) > 4 else 0.8
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 640, 'height': 400}); E = []
    pg.on('pageerror', lambda e: E.append(str(e)))
    pg.on('console', lambda m: E.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=150000, polling=500)
    info = pg.evaluate("(Q) => { const N = window.NQ; N.SETTINGS.quality = Q; N.play(); N.clear(); N.noLoop(true); N.DBG.noVM = true; N.GAME.state = 'play'; return Object.keys(N.MZ || {}); }", Q)
    tiles = []
    for t in TYPES:
        for (dx, dz, yaw) in ((0, 1.1, 0.0), (0.8, 0.8, 0.785), (1.1, 0, 1.5708)):
            url = pg.evaluate("""([t, dx, dz, yaw, T]) => { const N = window.NQ; N.clear();
              const z = N.spawnZombie(t, 0, 30, 3); z.seed = 4.2; z.x0 = 0;
              N.pose({ x: dx, z: 30 + dz, y: 0.15, yaw, pitch: 0.05, roll: 0 });
              const n = Math.round(T / 0.05); for (let i = 0; i < n; i++) { N.step(0.05); z.x = 0; z.z = 30; z.yaw = 0; }
              for (let i = 0; i < 2; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.88); }""", [t, dx, dz, yaw, T])
            tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))))
    print('mz types:', info, 'errors:', E[:5])
    W, H = tiles[0].size
    g = Image.new('RGB', (W * 3, H * len(TYPES)))
    for i, t in enumerate(tiles): g.paste(t, ((i % 3) * W, (i // 3) * H))
    g.save(out, quality=85); b.close()
