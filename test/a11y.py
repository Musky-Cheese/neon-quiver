"""Settings + accessibility: FOV, shake, invert Y, reduce flashing, key rebinding. Drives the real UI, reloads to check persistence.
   python3 test/a11y.py   (serves the repo itself)"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, CHROME, ARGS
from playwright.sync_api import sync_playwright
httpd, url = serve(); fails = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {info}' if info and not ok else '')); 
    if not ok: fails.append(name)
def load(ctx):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto(url); pg.wait_for_function('window.NQ_READY === true', timeout=900000, polling=500)
    return pg, errs
def setrange(pg, id, v): pg.evaluate("([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }", [id, v])
def setcheck(pg, id, v): pg.evaluate("([id, v]) => { const e = document.getElementById(id); e.checked = v; e.dispatchEvent(new Event('change', { bubbles: true })); }", [id, v])
def saved(pg, k): return pg.evaluate("(k) => JSON.parse(localStorage.getItem(k) || 'null')", k)
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    ctx = b.new_context(viewport={'width': 640, 'height': 360})
    pg, errs = load(ctx)
    d = pg.evaluate("() => { const S = window.NQ.SETTINGS; return [S.fov, S.invertY, S.shake, S.reduceFlash]; }")
    check('defaults', d == [78, False, 1, False], d)
    # --- every control updates SETTINGS, saves, and mirrors into the pause copy
    setrange(pg, 'fov', 92); setrange(pg, 'shake', 0.25); setcheck(pg, 'invy2', True); setcheck(pg, 'rf', True)
    s = saved(pg, 'nq_settings')
    check('settings saved', s and s['fov'] == 92 and s['shake'] == 0.25 and s['invertY'] is True and s['reduceFlash'] is True, s)
    m = pg.evaluate("() => [document.getElementById('fov2').value, document.getElementById('invy').checked, document.getElementById('rf2').checked, document.getElementById('fovv2').textContent]")
    check('title and pause copies stay in sync', m == ['92', True, True, '92°'], m)
    # --- persistence across reload
    pg.close(); pg, errs = load(ctx)
    d = pg.evaluate("() => { const S = window.NQ.SETTINGS; return [S.fov, S.invertY, S.shake, S.reduceFlash, document.getElementById('fov').value, document.getElementById('rf').checked]; }")
    check('persist after reload', d == [92, True, 0.25, True, '92', True], d)
    # --- FOV reaches the camera
    r = pg.evaluate("() => { const N = window.NQ; N.noLoop(true); N.play(); N.run(240); N.renderOnce(); return [N.PLAYER.fov, N.THREE && N.camera.fov]; }")
    check('FOV drives the camera', abs(r[0] - 92) < 0.5 and abs(r[1] - 92) < 0.5, r)
    # --- invert Y: the same mouse delta pitches the other way
    r = pg.evaluate("() => { const N = window.NQ; const out = []; for (const inv of [false, true]) { N.SETTINGS.invertY = inv; N.PLAYER.pitch = 0; N.INPUT.dy = 40; N.run(1); out.push(N.PLAYER.pitch); } return out; }")
    check('invert Y flips pitch', r[0] < 0 and r[1] > 0 and abs(r[0] + r[1]) < 1e-9, r)
    # --- shake: scale 0 -> no jitter; 1 -> jitter
    def jitter(sc):
        return pg.evaluate("(sc) => { const N = window.NQ; N.SETTINGS.shake = sc; const xs = []; for (let i = 0; i < 12; i++) { N.shake(1); N.SHAKE.amt = 1.2; N.renderOnce(); xs.push(N.camM[12]); } return Math.max(...xs) - Math.min(...xs); }", sc)
    j0, j1 = jitter(0), jitter(1)
    check('shake 0 gives a steady camera', j0 < 1e-9, j0); check('shake 1 still shakes', j1 > 0.005, j1)
    # --- reduce flashing: lightning peak is clamped
    def peak(rf):
        return pg.evaluate("(rf) => { const N = window.NQ; N.SETTINGS.reduceFlash = rf; N.WX.storm = 1; N.WX.flashT = 0; N.WX.flash = 0; N.run(1); return N.WX.flash; }", rf)
    p_on, p_off = peak(True), peak(False)
    check('reduce flashing clamps lightning', p_on <= 0.26 and p_on > 0 and p_off >= 0.99, [p_on, p_off])
    # --- rebinding through real key events
    pg.evaluate("() => { window.NQ.GAME.state = 'title'; window.NQ.setScreen('title'); }")
    pg.click('#ctrlBtn')
    check('controls screen opens', pg.evaluate("() => !document.getElementById('scr-controls').hidden"))
    pg.click('#ctrlList button[data-act=jump]'); pg.keyboard.press('KeyK')
    j = pg.evaluate("() => window.NQ.BINDS.jump"); check('jump rebound to K', j == 'KeyK', j)
    check('rebind saved', (saved(pg, 'nq_binds') or {}).get('jump') == 'KeyK')
    pg.click('#ctrlList button[data-act=fwd]'); pg.keyboard.press('KeyK')   # already used by jump -> swap
    r = pg.evaluate("() => [window.NQ.BINDS.fwd, window.NQ.BINDS.jump, document.querySelector('.ctrl-clash').textContent]")
    check('conflict swaps and warns', r[0] == 'KeyK' and r[1] == 'KeyW' and 'swapped' in r[2], r)
    pg.click('#ctrlList button[data-act=hook]'); pg.keyboard.press('Digit3'); pg.keyboard.press('ArrowUp')   # stays listening after a refused key
    r = pg.evaluate("() => [window.NQ.BINDS.hook, document.querySelector('.ctrl-clash').textContent]")
    check('reserved keys refused', r[0] == 'KeyQ' and 'reserved' in r[1], r)
    pg.keyboard.press('Escape')
    check('Esc while listening cancels, screen stays', pg.evaluate("() => !document.getElementById('scr-controls').hidden && window.NQ.BINDS.hook === 'KeyQ'"))
    pg.keyboard.press('Escape')
    check('Esc closes the screen', pg.evaluate("() => document.getElementById('scr-controls').hidden && !document.getElementById('scr-title').hidden"))
    lbl = pg.evaluate("() => document.querySelector('[data-k=\"jump\"]').textContent"); check('help text follows the binding', lbl == 'W', lbl)
    # in game: K is now forward, W jumps
    r = pg.evaluate("() => { const N = window.NQ; N.noLoop(true); N.play(); N.pose({ x: 0, z: 40, y: 0, yaw: 0, vx: 0, vz: 0 }); return 1; }")
    pg.keyboard.down('KeyK'); pg.evaluate("() => window.NQ.run(30)"); pg.keyboard.up('KeyK')
    z = pg.evaluate("() => window.NQ.PLAYER.z"); check('rebound forward key moves the player', z < 38, z)
    pg.keyboard.down('KeyW'); pg.evaluate("() => window.NQ.run(3)"); vy = pg.evaluate("() => window.NQ.PLAYER.vy"); pg.keyboard.up('KeyW')
    check('rebound jump key jumps', vy > 1, vy)
    pg.evaluate("() => { window.NQ.GAME.state = 'title'; window.NQ.setScreen('title'); }"); pg.click('#ctrlBtn'); pg.click('#ctrlReset')
    r = pg.evaluate("() => JSON.stringify(window.NQ.BINDS) === JSON.stringify(window.NQ.BIND_DEFAULTS)"); check('reset restores defaults', r)
    check('no page errors', not errs, errs)
    pg.close()
    # --- prefers-reduced-motion defaults reduce-flashing on first run only
    ctx2 = b.new_context(viewport={'width': 640, 'height': 360}, reduced_motion='reduce'); pg2, e2 = load(ctx2)
    check('reduced-motion sets the default', pg2.evaluate("() => window.NQ.SETTINGS.reduceFlash") is True)
    setcheck(pg2, 'rf', False); pg2.close(); pg2, e2 = load(ctx2)
    check('a saved choice beats the media query', pg2.evaluate("() => window.NQ.SETTINGS.reduceFlash") is False)
    b.close()
httpd.shutdown()
print('FAILED: ' + ', '.join(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
