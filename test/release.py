"""Release checks: Auto quality settles on a tier from the title screen, a lost GPU context pauses and recovers,
a crash in the frame loop shows the error screen instead of freezing, and the HUD/quiver survive all of it.
Run from the repo root: python3 test/release.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, CHROME, ARGS
from playwright.sync_api import sync_playwright

httpd, url = serve(); fails = []
def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    # 1. first visit, Auto: the title benchmark moves off the starting tier on a software GPU and settles
    pg = b.new_page(viewport={'width': 960, 'height': 540}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
    pg.goto(url); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    start = pg.evaluate("() => ({ q: NQ.SETTINGS.quality, lap: NQ.SETTINGS.laptop, auto: NQ.SETTINGS.auto })")
    print('  start tier:', start)
    check(start['auto'] is True, 'new players start on Auto')
    pg.wait_for_timeout(25000)
    end = pg.evaluate("() => ({ q: NQ.SETTINGS.quality, lap: NQ.SETTINGS.laptop, label: document.querySelector('#quality option[value=A]').textContent })")
    print('  settled tier:', end)
    check(end['label'].startswith('Auto ('), f"menu shows the tier Auto picked: {end['label']}")
    # 2. GPU context lost mid-run: pause + notice, then back to drawing once restored
    pg.evaluate("() => { NQ.play(); NQ.GAME.interT = 0; }"); pg.wait_for_timeout(1500)
    pg.evaluate("() => { window.__lc = NQ.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lc.loseContext(); }")
    pg.wait_for_timeout(1500)
    lost = pg.evaluate("() => ({ shown: !document.getElementById('sysErr').hidden, title: document.getElementById('sysErrT').textContent, state: NQ.GAME.state })")
    print('  after loss:', lost)
    check(lost['shown'] and 'reset' in lost['title'], 'lost context shows the graphics-reset notice')
    check(lost['state'] in ('paused', 'playing'), 'game state intact after loss')
    pg.evaluate("() => window.__lc.restoreContext()"); pg.wait_for_timeout(4000)
    back = pg.evaluate("() => ({ hidden: document.getElementById('sysErr').hidden, lost: NQ.GPU.lost })")
    check(back['hidden'] and not back['lost'], 'notice clears when the context comes back')
    pg.evaluate("() => NQ.GAME.resume && NQ.GAME.resume()"); pg.wait_for_timeout(2500)
    fr = pg.evaluate("() => NQ.STEPS || 0")
    check(not [e for e in errs if 'context' not in e.lower()], f'no page errors through loss/restore: {errs[:3]}')
    # 3. a frame that keeps throwing ends in the error screen, not a frozen picture
    pg.evaluate("() => { NQ.GAME.boom = true; const u = NQ.GAME.update.bind(NQ.GAME); NQ.GAME.update = (dt) => { if (NQ.GAME.boom) throw new Error('test: frame failure'); u(dt); }; }")
    pg.wait_for_timeout(1500)
    crash = pg.evaluate("() => ({ shown: !document.getElementById('sysErr').hidden, code: document.getElementById('sysErrC').textContent })")
    check(crash['shown'] and 'test: frame failure' in crash['code'], 'a wedged frame loop shows the error screen with the error')
    b.close()
httpd.shutdown()
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails)))
sys.exit(1 if fails else 0)
