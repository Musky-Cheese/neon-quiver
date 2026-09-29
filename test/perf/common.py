"""Shared helpers for the perf harness: serve the repo on a free port, launch SwiftShader Chromium, seed Math.random."""
import os, socket, threading, http.server, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CHROME = '/opt/pw-browsers/chromium'
ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
# deterministic Math.random (mulberry32) so rain, flicker, spawns and shake are identical run to run
SEED_JS = """(() => { let a = 0x9e3779b9; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"""

class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(_Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{port}/index.html'

def open_game(pw, url, w, h, capture=True, query=''):
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    pg = b.new_page(viewport={'width': w, 'height': h})
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGE ' + str(e)[:300]))
    pg.on('console', lambda m: m.type == 'error' and errs.append('CONSOLE ' + m.text[:300]))
    pg.add_init_script(SEED_JS + ('window.__NQ_CAPTURE = true; window.__NQ_CAPTURE_DPR = 1;' if capture else ''))
    pg.goto(url + query); pg.wait_for_function('window.NQ_READY === true', timeout=300000)
    return b, pg, errs

# camera spots: every district's environment-capture point (so a bigger map adds spots automatically),
# looking both ways along its long axis, plus the plaza from the fountain
SPOTS_JS = """() => { const N = window.NQ, out = [];
  for (const d of N.DISTRICTS) { const [x, , z] = d.env; out.push({ id: d.id + '-a', x, z, yaw: 0.35 }, { id: d.id + '-b', x, z, yaw: 0.35 + Math.PI }); }
  return out; }"""
