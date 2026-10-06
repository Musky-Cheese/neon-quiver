"""Fixed street poses -> one grid JPEG. usage: street.py out.jpg [quality]"""
import sys, base64, io, json
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1]; Q = int(sys.argv[2]) if len(sys.argv) > 2 else 2
POSES = [tuple(map(float, q.split(","))) for q in sys.argv[3].split(";")] if len(sys.argv) > 3 else [(0, -20, 3.14, 0.02), (-30, 30, -0.8, 0.0), (100, 0, -1.57, 0.02), (-110, 0, 1.57, 0.05), (0, 90, 0, 0.05), (0, -100, 3.14, 0.05), (15, 35, 0.3, 0.1), (0, 200, 0, 0.02)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 450}); E = []
    pg.on('pageerror', lambda e: E.append(str(e)))
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    pg.evaluate(f"() => {{ const N = window.NQ; N.SETTINGS.quality = {Q}; N.play(); N.clear(); N.noLoop(true); N.DBG.noVM = true; }}")
    tiles = []
    for x, z, yaw, pitch in POSES:
        url = pg.evaluate(f"() => {{ const N = window.NQ; N.pose({{ x: {x}, z: {z}, y: 0, yaw: {yaw}, pitch: {pitch}, roll: 0 }}); for (let i = 0; i < 3; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.85); }}")
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).resize((400, 225)))
    print('errors:', E[:3])
    g = Image.new('RGB', (1600, 225 * ((len(tiles) + 3) // 4)))
    for i, t in enumerate(tiles): g.paste(t, ((i % 4) * 400, (i // 4) * 225))
    g.save(out, quality=80); b.close()
