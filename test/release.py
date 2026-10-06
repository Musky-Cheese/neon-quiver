"""Release checks: settings start on High / Auto resolution and old saves migrate (Fast, Laptop, Balanced, Sharp, Auto
-> High; Ultra stays Ultra), the Resolution setting saves and sizes the canvas, a lost GPU context pauses and offers
a reload, and a crash in the frame loop shows the error screen instead of freezing.
Runs on the WebGL2 backend (no WebGPU adapter), so the context can be lost on purpose. Run from the repo root: python3 test/release.py"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, CHROME, ARGS_GL
from playwright.sync_api import sync_playwright

httpd, url = serve(); fails = []
def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what, flush=True)
    if not ok: fails.append(what)
def load(pg, saved):   # one visit with this localStorage (None: first visit)
    pg.goto(url + '?nowarn'); pg.evaluate('(s) => { localStorage.clear(); if (s) localStorage.setItem("nq_settings", s); }', json.dumps(saved) if saved else None)
    pg.goto(url + '?nowarn'); pg.wait_for_function('window.NQ_READY === true', timeout=900000, polling=500); pg.evaluate('NQ.noLoop(true)')
    return pg.evaluate('() => ({ q: NQ.SETTINGS.quality, res: NQ.SETTINGS.res, laptop: "laptop" in NQ.SETTINGS, auto: "auto" in NQ.SETTINGS, ui: document.getElementById("quality").value, stored: JSON.parse(localStorage.getItem("nq_settings") || "null") })')

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS_GL)
    pg = b.new_page(viewport={'width': 960, 'height': 540}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    # 1. defaults and migration
    r = load(pg, None); print('  first visit:', r)
    check(r['q'] == 2 and r['res'] == 'auto' and r['ui'] == '2', 'new players start on High, Auto resolution')
    for old, want in [({'quality': 0, 'auto': False, 'look': 'noir'}, 2), ({'quality': 1, 'laptop': True, 'auto': False}, 2), ({'quality': 1, 'auto': True}, 2),
                      ({'quality': 2, 'auto': False, 'sens': 1.4}, 2), ({'quality': 3, 'auto': False}, 3)]:
        r = load(pg, old)
        check(r['q'] == want and r['res'] == 'auto' and not r['laptop'] and not r['auto'] and r['stored']['v'] == 2 and r['stored']['quality'] == want and r['stored'].get('sens', 1) == old.get('sens', 1),
              f'old save {old} -> {["", "", "High", "Ultra"][want]}: {r["stored"]}')
    # 2. Resolution: a fixed percentage scales the canvas, Auto goes back to the full size
    pg.evaluate('() => NQ.renderOnce()'); full = pg.evaluate('document.getElementById("gl").width')
    pg.select_option('#res', '50'); pg.evaluate('NQ.renderOnce()'); half = pg.evaluate('document.getElementById("gl").width')
    check(abs(half - full / 2) <= 2 and json.loads(pg.evaluate('localStorage.getItem("nq_settings")'))['res'] == 50, f'Resolution 50%: canvas {full} -> {half} px wide, saved')
    pg.select_option('#res', 'auto'); pg.evaluate('NQ.renderOnce()'); check(pg.evaluate('document.getElementById("gl").width') == full, 'Resolution Auto: back to full size')
    pg.select_option('#quality', '3'); check(pg.evaluate('NQ.SETTINGS.quality') == 3 and json.loads(pg.evaluate('localStorage.getItem("nq_settings")'))['quality'] == 3, 'Quality Ultra saved')
    pg.select_option('#quality', '2')
    # 3. GPU context lost mid-run: pause + notice with a Reload button
    pg.evaluate("() => { NQ.play(); NQ.GAME.interT = 0; NQ.noLoop(false); }"); pg.wait_for_timeout(1500)
    pg.evaluate("() => { window.__lc = NQ.renderer.backend.gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); }")
    pg.wait_for_timeout(2000)
    lost = pg.evaluate("() => ({ shown: !document.getElementById('sysErr').hidden, title: document.getElementById('sysErrT').textContent, btn: document.getElementById('sysErrBtn').textContent, btn2: !document.getElementById('sysErrBtn2').hidden, state: NQ.GAME.state, gl: NQ.GPU.lost })")
    print('  after loss:', lost)
    check(lost['shown'] and 'reset' in lost['title'] and lost['btn'] == 'Reload' and not lost['btn2'], 'lost context shows the graphics-reset notice with Reload')
    check(lost['state'] == 'paused' and lost['gl'], 'game paused, frames stopped')
    check(not [e for e in errs if 'context' not in e.lower()], f'no page errors through the loss: {errs[:3]}')
    # 4. a frame that keeps throwing ends in the error screen, not a frozen picture
    pg.goto(url + '?nowarn'); pg.wait_for_function('window.NQ_READY === true', timeout=900000, polling=500)
    pg.evaluate("() => { NQ.GAME.boom = true; const u = NQ.GAME.update.bind(NQ.GAME); NQ.GAME.update = (dt) => { if (NQ.GAME.boom) throw new Error('test: frame failure'); u(dt); }; }")
    pg.wait_for_function("!document.getElementById('sysErr').hidden", timeout=600000, polling=500)
    crash = pg.evaluate("() => ({ shown: !document.getElementById('sysErr').hidden, code: document.getElementById('sysErrC').textContent })")
    check(crash['shown'] and 'test: frame failure' in crash['code'], 'a wedged frame loop shows the error screen with the error')
    b.close()
httpd.shutdown()
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails)))
sys.exit(1 if fails else 0)
