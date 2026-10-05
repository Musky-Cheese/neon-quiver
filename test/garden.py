"""Garden shots of the Meshy hero sakuras. usage: garden.py out.jpg [quality]"""
import sys, json, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/garden.jpg'; Q = int(sys.argv[2]) if len(sys.argv) > 2 else 1
POSES = [(-11, 178, 0.2, 0.12), (16, 200, 0.3, 0.1), (-4, 178, 0.6, 0.12), (0, 186, 3.14, 0.08), (0, 192, 0, 0.05), (0, 210, 0, 0.05)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 450}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type in ('error', 'warning') and errs.append(m.text))
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto('http://localhost:8765/index.html?nowarn=1'); pg.wait_for_function('window.NQ_READY === true', timeout=180000, polling=500)
    info = pg.evaluate(f"""() => {{ const N = window.NQ; N.SETTINGS.quality = {Q}; N.play(); N.clear(); N.noLoop(true);
      return {{ petals: N.WORLD.petals.length }}; }}""")
    print(json.dumps(info))
    tiles = []
    for (x, z, yaw, pitch) in POSES:
        url = pg.evaluate(f"""() => {{ const N = window.NQ; N.pose({{ x: {x}, z: {z}, y: 0, yaw: {yaw}, pitch: {pitch}, roll: 0 }}); N.DBG.noVM = true;
          for (let i = 0; i < 3; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.85); }}""")
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).resize((400, 225)))
    print('errors:', errs[:6])
    g = Image.new('RGB', (1200, 450))
    for i, t in enumerate(tiles): g.paste(t, ((i % 3) * 400, (i // 3) * 225))
    g.save(out, quality=82); b.close()
