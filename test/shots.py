"""Render interior shots of walk-in shops into one grid JPEG. usage: shots.py out.jpg [n] [q]"""
import sys, json, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots.jpg'; N = int(sys.argv[2]) if len(sys.argv) > 2 else 12; Q = int(sys.argv[3]) if len(sys.argv) > 3 else 2; MODE = sys.argv[4] if len(sys.argv) > 4 else 'in'; START = int(sys.argv[5]) if len(sys.argv) > 5 else 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 450}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    info = pg.evaluate(f"""() => {{ const N = window.NQ; N.SETTINGS.quality = {Q}; N.play(); N.clear(); N.noLoop(true);
      return {{ shops: N.WORLD.indoor.length, glass: N.WORLD.glass.length, lights: N.WORLD.lights.length, tris: N.WORLD.mesh.index.count / 3 + N.WORLD.meshProps.index.count / 3 }}; }}""")
    print(json.dumps(info))
    tiles = []
    for k in range(START, min(START + N, info['shops'])):
        url = pg.evaluate(f"""() => {{ const N = window.NQ, q = N.WORLD.indoor[{k}];
          const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2; let dx = cx, dz = cz;
          if ((q.x1 - q.x0) > (q.z1 - q.z0)) dx = 0; else dz = 0; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
          const hw = Math.min(q.x1 - q.x0, q.z1 - q.z0) / 2;   // depth half
          const back = '{MODE}' === 'out' ? hw + 7 : hw - 0.6; N.pose({{ x: cx - dx * back, z: cz - dz * back, y: 0, yaw: Math.atan2(-dx, -dz), pitch: '{MODE}' === 'out' ? -0.02 : -0.12, roll: 0 }}); N.BOW.state = 'idle'; N.DBG.noVM = true;
          for (let i = 0; i < 3; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.85); }}""")
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).resize((400, 225)))
    print('errors:', errs[:5])
    cols = 4; rows = (len(tiles) + cols - 1) // cols
    g = Image.new('RGB', (400 * cols, 225 * rows))
    for i, t in enumerate(tiles): g.paste(t, ((i % cols) * 400, (i // cols) * 225))
    g.save(out, quality=80); b.close()
