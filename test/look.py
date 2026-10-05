"""Look-dev contact sheet: fixed camera spots across the city plus a zombie line-up, one JPEG per quality.
usage: python3 test/look.py out_prefix [q list, e.g. 1,L]   (L = Laptop)"""
import sys, os, io, base64
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, open_game
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1] if len(sys.argv) > 1 else 'look'; QS = (sys.argv[2] if len(sys.argv) > 2 else '1').split(',')
W, H = 960, 540
# x, z, yaw, pitch, y-eye-extra, label
SPOTS = [(0, 26, 0.0, -0.02, 'plaza'), (-14, -12, -0.9, 0.05, 'plaza-cars'), (0, 110, 1.57, -0.02, 'suburbs-street'), (0, 196, 0.0, -0.02, 'gardens'),
         (-90, 0, -1.57, 0.02, 'warrens'), (96, 6, 1.57, -0.02, 'market'), (0, -100, 0.0, 0.0, 'railyard'), ('zoo', 0, 0, 0, 'infected')]
httpd, url = serve()
with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, W, H, capture=True, loop=False)
    for qs in QS:
        q = 1 if qs == 'L' else int(qs); lap = qs == 'L'
        pg.evaluate(f"() => {{ const N = NQ; N.SETTINGS.quality = {q}; N.SETTINGS.laptop = {str(lap).lower()}; N.noLoop(true); N.play(); N.clear(); N.GAME.toSpawn = 0; N.GAME.intermission = true; N.GAME.interT = 1e9; N.DBG.noVM = true; N.HUDVIS.on = false; document.getElementById('hud').hidden = true;"
                    "Object.assign(N.WX, { state: 'rain', forced: 'rain', precip: 0.6, snow: 0, wet: 1, cover: 0, flash: 0 }); }")
        tiles = []
        for s in SPOTS:
            if s[0] == 'zoo':
                js = """() => { const N = NQ; N.clear(); const P = { x: 0, z: 30, y: 0, yaw: 0, pitch: -0.06, roll: 0 }; N.pose(P);
                  const T = ['walker', 'runner', 'brute', 'spitter', 'screamer', 'walker']; const zs = [];
                  T.forEach((t, i) => { const z = N.spawnZombie(t, (i - 2.5) * 1.6, 24.5 - Math.abs(i - 2.5) * 0.3, 6); z.speed = 0; z.yaw = Math.PI; zs.push(z); });
                  for (let i = 0; i < 40; i++) { N.pose(P); N.step(1 / 60); } N.renderOnce(); N.renderOnce();
                  return document.getElementById('gl').toDataURL('image/jpeg', 0.88); }"""
            else:
                x, z, yaw, pitch, lab = s
                js = f"""() => {{ const N = NQ; N.clear(); const P = {{ x: {x}, z: {z}, y: 0, yaw: {yaw}, pitch: {pitch}, roll: 0 }};
                  for (let i = 0; i < 8; i++) {{ N.pose(P); N.step(1 / 60); }} N.pose(P); N.renderOnce(); N.renderOnce();
                  return document.getElementById('gl').toDataURL('image/jpeg', 0.88); }}"""
            d = pg.evaluate(js)
            tiles.append(Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).resize((W // 2, H // 2)))
        g = Image.new('RGB', (W, (H // 2) * ((len(tiles) + 1) // 2)))
        for i, t in enumerate(tiles): g.paste(t, ((i % 2) * (W // 2), (i // 2) * (H // 2)))
        g.save(f'{out}-{qs}.jpg', quality=85); print('saved', f'{out}-{qs}.jpg')
    print('errors:', errs[:5]); b.close()
httpd.shutdown()
