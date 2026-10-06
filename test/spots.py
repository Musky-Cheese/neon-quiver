"""Shots of given spots. usage: spots.py out.jpg 'cx,cz,tx,ty,tz;...' [port]"""
import sys, base64, io, math
from playwright.sync_api import sync_playwright
from PIL import Image
import os
TW, TH = (800, 450) if os.environ.get('BIG') else (400, 225)
out = sys.argv[1]; poses = [[float(v) for v in p.split(',')] for p in sys.argv[2].split(';') if p]; port = sys.argv[3] if len(sys.argv) > 3 else '8765'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 450}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script('window.__NQ_CAPTURE = 1; window.__NQ_CAPTURE_DPR = 1;')
    pg.goto(f'http://localhost:{port}/index.html?nowarn=1'); pg.wait_for_function('window.NQ_READY === true', timeout=180000, polling=500)
    pg.evaluate("() => { const N = window.NQ; N.SETTINGS.quality = 1; N.play(); N.clear(); N.noLoop(true); N.DBG.noVM = true; }")
    if poses == []:   # no poses given: close-ups of the first sedan and van near the plaza
        cs = pg.evaluate("""() => { const W = window.NQ.WORLD, L = W.lights || [];
          const lit = s => Math.min(1e9, ...L.map(l => Math.hypot(l.p[0] - s.x, l.p[2] - s.z)));   // LIT=1: the cars nearest a lamp
          let c = W.carSpots.filter(s => Math.abs(s.x) < 70 && Math.abs(s.z) < 70);
          if (""" + ('true' if os.environ.get('LIT') else 'false') + """) c = W.carSpots.slice().sort((a, b) => lit(a) - lit(b));
          return c.map(s => [s.x, s.z, s.ry, s.kind]); }""")
        for k in ('sedan', 'van'):
            x, z, ry, _ = next(c for c in cs if c[3] == k)
            for a, d in (((0.9, 5.5), (2.4, 6.5), (-0.5, 5.0)) if not os.environ.get('BIG') else ((1.1, 4.2), (2.5, 4.6))):
                poses.append([x + math.sin(ry + a) * d, z + math.cos(ry + a) * d, x, 0.9, z])
    tiles = []
    for cx, cz, tx, ty, tz in poses:
        yaw = math.atan2(-(tx - cx), -(tz - cz)); pitch = math.atan2(ty - 1.7, math.hypot(tx - cx, tz - cz))
        url = pg.evaluate(f"() => {{ const N = window.NQ; N.pose({{ x: {cx}, z: {cz}, y: 0, yaw: {yaw}, pitch: {pitch}, roll: 0 }}); for (let i = 0; i < 3; i++) N.renderOnce(); return document.getElementById('gl').toDataURL('image/jpeg', 0.85); }}")
        tiles.append(Image.open(io.BytesIO(base64.b64decode(url.split(',')[1]))).resize((TW, TH)))
    print('errors:', errs[:6])
    C = 2 if os.environ.get('BIG') else 3; g = Image.new('RGB', (TW * min(C, len(tiles)), TH * ((len(tiles) + C - 1) // C)))
    for i, t in enumerate(tiles): g.paste(t, ((i % C) * TW, (i // C) * TH))
    g.save(out, quality=82); b.close()
