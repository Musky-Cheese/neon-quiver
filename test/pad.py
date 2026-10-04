"""Gamepad: a mocked standard-mapping pad drives movement, aim, bow, grapple, arrows, pause and the menus.
   A real controller is not involved, only the Gamepad API surface (navigator.getGamepads) is faked.
   python3 test/pad.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, CHROME, ARGS
from playwright.sync_api import sync_playwright
MOCK = """(() => {
  const pad = { id: 'Xbox 360 Controller (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), vibrationActuator: { calls: [], playEffect(t, p) { this.calls.push(p); return Promise.resolve('complete'); } } };
  window.__pad = pad; window.__padOn = false;
  navigator.getGamepads = () => window.__padOn ? [pad, null, null, null] : [null, null, null, null];
})();"""
httpd, url = serve(); fails = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {info}' if info != '' and not ok else ''))
    if not ok: fails.append(name)
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=ARGS)
    pg = b.new_page(viewport={'width': 640, 'height': 360}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.add_init_script(MOCK)
    pg.goto(url); pg.wait_for_function('window.NQ_READY === true', timeout=900000, polling=500)
    E = lambda js, arg=None: pg.evaluate(js, arg)
    def btn(i, on=True, val=None): E("([i, on, v]) => { const b = window.__pad.buttons[i]; b.pressed = on; b.value = v === null ? (on ? 1 : 0) : v; }", [i, on, val])
    def axes(a): E("(a) => { window.__pad.axes = a; }", a)
    def run(n=1): E("(n) => window.NQ.run(n)", n)
    def tap(i, steps=2): btn(i, True); run(steps); btn(i, False); run(steps)
    st = lambda: E("() => window.NQ.GAME.state")
    E("() => window.NQ.noLoop(true)")
    check('pad-only settings hidden without a pad', E("() => getComputedStyle(document.getElementById('padvib')).display === 'none' || document.getElementById('padvib').offsetParent === null"))
    # --- connect, then drive the title screen by pad
    E("() => { window.__padOn = true; }"); run(2)
    check('connect detected', E("() => window.NQ.PAD.idx === 0 && document.body.classList.contains('haspad')"))
    check('pad-only settings appear', E("() => document.getElementById('padvib').offsetParent !== null"))
    check('toast on connect', E("() => window.NQ.GAME.toasts.some(t => /CONTROLLER CONNECTED/.test(t.text || t.t || JSON.stringify(t)))") )
    tap(0)   # first press only reveals the focus ring
    check('first press focuses Enter the plaza, does not start', E("() => document.activeElement.id === 'playBtn' && window.NQ.GAME.state === 'title' && document.body.classList.contains('padnav')"), st())
    E("() => { document.getElementById('look').focus(); }"); btn(13, True); run(2); btn(13, False); run(2)   # d-pad down from a select
    moved = E("() => document.activeElement.id"); check('d-pad moves focus', moved != 'look', moved)
    E("() => document.getElementById('playBtn').focus()")
    btn(0, True); run(2); check('A on the play button starts the run', st() == 'playing', st())
    E("() => { const N = window.NQ; N.pose({ x: 0, z: 40, y: 0, yaw: 0, pitch: 0, vx: 0, vz: 0 }); }"); run(3)
    # A is still held from the menu: it must not jump
    vy = E("() => window.NQ.PLAYER.vy"); check('A held over from the menu does not jump', vy <= 0.01, vy)
    btn(0, False); run(2); btn(0, True); run(2); vy = E("() => window.NQ.PLAYER.vy"); btn(0, False); run(60)
    check('A jumps', vy > 1, vy)
    # --- left stick: direction, analog magnitude, deadzone
    def walk(a, n=30):
        E("() => window.NQ.pose({ x: 0, z: 40, y: 0, yaw: 0, vx: 0, vz: 0 })"); run(5); axes(a); run(n); axes([0, 0, 0, 0])
        r = E("() => [window.NQ.PLAYER.x, window.NQ.PLAYER.z]"); run(20); return r
    full = walk([0, -1, 0, 0]); half = walk([0, -0.5, 0, 0]); tiny = walk([0.1, -0.1, 0, 0])
    check('left stick moves forward', full[1] < 38, full)
    d_full, d_half = 40 - full[1], 40 - half[1]
    check('stick magnitude is analog', 0 < d_half < d_full * 0.6, [d_full, d_half])
    check('inside the deadzone nothing moves', abs(tiny[0]) < 0.05 and abs(tiny[1] - 40) < 0.05, tiny)
    right = walk([1, 0, 0, 0]); check('left stick strafes right', right[0] > 1, right)
    # --- right stick: look, deadzone, invert Y, same sensitivity as the mouse path
    E("() => { window.NQ.PLAYER.yaw = 0; window.NQ.PLAYER.pitch = 0; }"); axes([0, 0, 0.1, 0.1]); run(30); axes([0, 0, 0, 0])
    r = E("() => [window.NQ.PLAYER.yaw, window.NQ.PLAYER.pitch]"); check('right stick deadzone ignores drift', abs(r[0]) < 1e-9 and abs(r[1]) < 1e-9, r)
    axes([0, 0, 1, 0]); run(30); axes([0, 0, 0, 0]); yaw = E("() => window.NQ.PLAYER.yaw")
    check('right stick turns right at the expected rate', -2.0 < yaw < -1.2, yaw)
    E("() => { window.NQ.PLAYER.pitch = 0; window.NQ.SETTINGS.invertY = false; }"); axes([0, 0, 0, 1]); run(15); axes([0, 0, 0, 0]); p0 = E("() => window.NQ.PLAYER.pitch")
    E("() => { window.NQ.PLAYER.pitch = 0; window.NQ.SETTINGS.invertY = true; }"); axes([0, 0, 0, 1]); run(15); axes([0, 0, 0, 0]); p1 = E("() => window.NQ.PLAYER.pitch")
    E("() => { window.NQ.SETTINGS.invertY = false; }")
    check('stick down looks down, Invert Y flips it', p0 < -0.1 and p1 > 0.1, [p0, p1])
    E("() => { window.NQ.SETTINGS.padSens = 2; window.NQ.PLAYER.yaw = 0; }"); axes([0, 0, 1, 0]); run(15); axes([0, 0, 0, 0]); y2 = E("() => window.NQ.PLAYER.yaw"); E("() => { window.NQ.SETTINGS.padSens = 1; }")
    check('Pad aim setting scales the turn rate', y2 < -1.2, y2)
    # --- RT: draw, release fires
    E("() => { const N = window.NQ; N.PROJ.length = 0; N.BOW.state = 'ready'; N.BOW.draw = 0; N.BOW.type = 0; }"); run(30)
    btn(7, True); run(10); drawing = E("() => window.NQ.BOW.state"); run(60); full_draw = E("() => window.NQ.BOW.draw")
    check('RT starts the draw', drawing == 'drawing', drawing); check('the draw builds while held', full_draw > 0.9, full_draw)
    rumble = E("() => window.__pad.vibrationActuator.calls.length"); check('draw tension rumbles', rumble > 0, rumble)
    btn(7, False); run(2); n = E("() => window.NQ.PROJ.length"); check('releasing RT looses an arrow', n >= 1, n)
    run(60)
    E("() => { window.NQ.PROJ.length = 0; }"); btn(7, True); run(10); btn(1, True); run(1); s1 = E("() => window.NQ.BOW.state"); btn(1, False); btn(7, False); run(2)
    check('B lets the string down without firing', s1 == 'letdown' and E("() => window.NQ.PROJ.length") == 0, s1)
    # --- arrows: RB next, Y last
    E("() => { const N = window.NQ; N.PLAYER.ammo[1] = 3; N.PLAYER.ammo[2] = 2; N.BOW.state = 'ready'; }"); run(60)
    tap(5); run(60); t1 = E("() => window.NQ.BOW.type"); check('RB selects the next arrow', t1 == 1, t1)
    tap(3); run(60); t2 = E("() => window.NQ.BOW.type"); check('Y returns to the last arrow', t2 == 0, t2)
    tap(4); run(60); t3 = E("() => window.NQ.BOW.type"); check('LB selects the previous arrow (wraps to one you own)', t3 in (1, 2, 3, 4, 5, 6), t3)
    E("() => { window.NQ.selectArrow(0); }"); run(60)
    # --- LT: hold to aim, release to fire the hook
    btn(6, True); run(2); aim = E("() => window.NQ.HOOK.aiming"); btn(6, False); run(2); hs = E("() => window.NQ.HOOK.state")
    check('LT hold previews, release fires the grapple', aim is True and hs != 'idle', [aim, hs])
    E("() => { const H = window.NQ.HOOK; H.state = 'idle'; H.cd = 0; H.aiming = false; }"); run(5)
    # --- X opens the shop at a terminal; B leaves it
    E("() => { window.NQ.GAME.nearTerminal = true; }"); tap(2, 1); s = st()
    check('X opens the armory terminal', s == 'shop', s)
    run(3); f = E("() => document.activeElement && document.activeElement.id"); check('shop gets a focused control', bool(f), f)
    tap(1); check('B leaves the shop', st() == 'playing', st())
    E("() => { window.NQ.GAME.nearTerminal = false; }")
    # --- D-pad up skips the intermission
    E("() => { const G = window.NQ.GAME; G.intermission = true; G.interT = 20; }"); tap(12, 1); it = E("() => window.NQ.GAME.interT")
    check('D-pad up skips the countdown', it <= 0.1, it)
    # --- Start pauses, B resumes; Start resumes
    tap(9); check('Start pauses', st() == 'paused', st()); run(2)
    check('pause menu focuses Resume', E("() => document.activeElement.id") == 'resumeBtn')
    tap(1); check('B resumes', st() == 'playing', st())
    tap(9); tap(9); check('Start toggles pause', st() == 'playing', st())
    # --- pad play is not paused by a lost pointer lock; mouse play still is
    E("() => { Object.defineProperty(document, 'pointerLockElement', { get: () => null, configurable: true }); }")   # headless may really hold the lock: simulate losing it
    E("() => { document.dispatchEvent(new Event('pointerlockchange')); }"); check('pad play ignores a lost pointer lock', st() == 'playing', st())
    E("() => { window.NQ.PAD.last = 'kbm'; document.dispatchEvent(new Event('pointerlockchange')); }"); check('mouse play still pauses on a lost lock', st() == 'paused', [st(), E("() => [window.NQ.PAD.last, window.NQ.INPUT.locked]")])
    E("() => { delete document.pointerLockElement; window.NQ.GAME.resume(); }")   # drop the stub
    # --- mouse + keyboard are untouched
    E("() => { const N = window.NQ; N.INPUT.freeLook = true; N.PROJ.length = 0; N.BOW.state = 'ready'; N.BOW.draw = 0; }"); run(30)
    pg.mouse.move(300, 180); pg.mouse.down(); run(60); pg.mouse.up(); run(2)
    check('mouse draw and release still fire', E("() => window.NQ.PROJ.length") >= 1)
    check('glyph hint follows the last device', E("() => window.NQ.hint('use')") == 'E')
    E("() => { window.NQ.PAD.last = 'pad'; }"); check('pad hints use button glyphs', E("() => [window.NQ.hint('use'), window.NQ.hint('next')]") == ['[X]', '[D-PAD UP]'])
    # --- rumble on damage, and the setting turns it off
    E("() => { window.__pad.vibrationActuator.calls.length = 0; window.NQ.PLAYER.hurt(10, 0, 0); }"); c = E("() => window.__pad.vibrationActuator.calls.length"); check('damage rumbles', c > 0, c)
    E("() => { window.NQ.SETTINGS.vibration = false; window.__pad.vibrationActuator.calls.length = 0; window.NQ.PLAYER.hurt(10, 0, 0); }"); c = E("() => window.__pad.vibrationActuator.calls.length"); check('Vibration off silences it', c == 0, c)
    E("() => { window.NQ.SETTINGS.vibration = true; }")
    # --- disconnect mid-run pauses; PlayStation naming
    E("() => { window.__padOn = false; }"); run(2); check('unplugging pauses the run', st() == 'paused', st())
    E("() => { window.__pad.id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'; window.__padOn = true; window.NQ.PAD.last = 'pad'; }"); run(2)
    check('PlayStation controller gets PlayStation glyphs', E("() => window.NQ.hint('use')") == '[SQUARE]')
    check('no page errors', not errs, errs)
    b.close()
httpd.shutdown()
print('FAILED: ' + ', '.join(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
