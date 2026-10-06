"""First-use stalls: which events compile a new shader program (or spike the frame) the first time they happen.
   python3 test/perf/firstuse.py [--q 2] [--size 480x270]
   Prints, per event, the programs that appeared and the slowest frame (wall ms with a GPU sync) right after it."""
import sys, os, json, argparse
sys.path.insert(0, os.path.dirname(__file__))
from common import serve, open_game
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--q', default='2'); ap.add_argument('--size', default='480x270'); a = ap.parse_args()
W, H = map(int, a.size.split('x'))
STEP_JS = """([label, code, frames]) => { const N = window.NQ, r = N.renderer, gl = r.getContext(), px = new Uint8Array(4);
  const before = r.info.memory.programs;
  (new Function('N', code))(N);
  let worst = 0, sum = 0;
  for (let i = 0; i < frames; i++) { const t0 = performance.now(); N.step(1 / 60); N.renderOnce(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t = performance.now() - t0; worst = Math.max(worst, t); sum += t; }
  const added = r.info.memory.programs - before;   // WebGPURenderer counts programs, it doesn't list them
  return { label, newPrograms: added, worstMs: Math.round(worst), avgMs: Math.round(sum / frames), total: r.info.memory.programs }; }"""
EVENTS = [
  ('settle (title -> play)', "", 6),
  ('repeat frames (control)', "", 6),
] + [(f'spawn {t}', f"N.spawnZombie('{t}', N.PLAYER.x + 1, N.PLAYER.z - 12, 5).speed = 0;", 4)
     for t in ['walker', 'runner', 'brute', 'spitter', 'screamer', 'climber']] + [
  ('boss', "N.GAME.spawnBoss();", 6),
] + [(f'arrow {k}', f"N.shootAt(N.PLAYER.x + 1, 1.2, N.PLAYER.z - 12, {i}, 1);", 10)
     for i, k in enumerate(['std', 'fire', 'boom', 'rail', 'frost', 'tether', 'scatter'])] + [
  ('arrow frost again', "N.shootAt(N.PLAYER.x + 1, 1.2, N.PLAYER.z - 12, 4, 1);", 10),
] + [(f'enter {d}', f"N.pose({{ x: {x}, z: {z} }});", 10) for d, x, z in
     [('market', 106, 0), ('warrens', -84, 0), ('suburbs', 0, 125), ('docks', 196, -4), ('metro', -113, -96), ('hub again', 0, 14)]]
httpd, url = serve(); out = []
with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, W, H, capture=False, loop=False, query='?nowarn=1')
    pg.evaluate("(q) => { const N = window.NQ; N.noLoop(true); N.SETTINGS.quality = q; N.play(); N.clear(); N.pose({ x: 0, z: 14, yaw: 0, pitch: -0.05 }); N.renderOnce(); }", int(a.q))
    for e in EVENTS:
        r = pg.evaluate(STEP_JS, list(e)); out.append(r)
        print(f"{r['label']:26s} worst {r['worstMs']:6d} ms  avg {r['avgMs']:6d}  programs {r['total']:3d}  new: {r['newPrograms'] or '-'}", flush=True)
    print('errors:', errs[:5]); b.close()
httpd.shutdown()
