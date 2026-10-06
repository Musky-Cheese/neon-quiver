"""Shots of the Meshy wrecked cars from street level. usage: cars.py out.jpg [quality]"""
import sys, json, base64, io, math
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cars.jpg'; Q = int(sys.argv[2]) if len(sys.argv) > 2 else 2
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 450}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and 'ReadPixels' not in m.text and errs.append(m.text[:300]))
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto('http://localhost:8765/index.html?nowarn=1'); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    pg.wait_for_function('!!window.NQ.scene.getObjectByName("meshy-cars-van")', timeout=90000, polling=500)
    spots = pg.evaluate(f"""() => {{ const N = window.NQ; N.SETTINGS.quality = {Q}; N.play(); N.clear(); N.noLoop(true);
      return N.WORLD.carSpots.map(s => [s.x, s.z, s.kind]); }}""")
    print(len(spots), 'cars:', sum(1 for s in spots if s[2] == 'van'), 'vans')
    pick = [s for s in spots if abs(s[0]) < 70 and abs(s[1]) < 70][:int(sys.argv[3]) if len(sys.argv) > 3 else 6]
    tiles = []
    for i, (x, z, k) in enumerate(pick):
        a = 0.6 + i * 1.1; d = 7.5; cx, cz = x + math.sin(a) * d, z + math.cos(a) * d
        yaw = math.atan2(-(x - cx), -(z - cz))
        url = pg.evaluate(f"""() => {{ const N = window.NQ; N.pose({{ x: {cx}, z: {cz}, y: 0, yaw: {yaw}, pitch: -0.12, roll: 0 }}); N.DBG.noVM = true;
          for (let i = 0; i < 3; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.85); }}""")
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).resize((400, 225)))
    print('errors:', errs[:int(sys.argv[3]) if len(sys.argv) > 3 else 6])
    g = Image.new('RGB', (1200, 450))
    for i, t in enumerate(tiles): g.paste(t, ((i % 3) * 400, (i // 3) * 225))
    g.save(out, quality=82); b.close()
