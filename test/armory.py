"""Armory smoke test: clear a wave, the shop opens only at a terminal, buy/equip/unlock, every special arrow fires cleanly,
standard arrows can be picked back up, and the armory board is screenshotted at 1920x1080 and 1366x768.
Run from the repo root: python3 test/armory.py  (writes test/out/armory-*.png)"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, open_game
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), 'out'); os.makedirs(OUT, exist_ok=True)
httpd, url = serve()
fails = []
def check(ok, what):
    print(('PASS ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)

with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, 1280, 720, capture=True, loop=False)
    J = pg.evaluate
    J("() => { NQ.play(); NQ.GAME.interT = 0; NQ.run(2); }")
    check(J("() => NQ.GAME.wave") == 1, 'wave 1 starts')
    check(J("() => NQ.PLAYER.ammo[0]") == 20, 'standard quiver starts at 20')
    check(J("() => NQ.PLAYER.drawTime") == 1.0, 'base draw time is 1.0 s')
    # clear the wave: kill everything that spawns
    J("""() => { const G = NQ.GAME; for (let i = 0; i < 2400 && (G.toSpawn > 0 || G.aliveCount() > 0 || !G.clearedShown); i++) {
        for (const z of NQ.ZOMBIES) if (!z.dead) NQ.killTest(z, 'body', [0, 0, -1], [z.x, 1, z.z], 1, false);
        NQ.run(1, 1 / 30); } }""")
    check(J("() => NQ.GAME.clearedShown && NQ.GAME.intermission"), 'wave cleared, intermission running')
    scrap1 = J("() => NQ.GAME.scrap"); print('  scrap after wave 1:', scrap1)
    check(scrap1 > 0, 'kills + clear bonus pay scrap')
    J("() => NQ.run(90, 1 / 30)")   # 3 s: the armory must not open on its own
    check(J("() => NQ.GAME.state") == 'playing', 'armory stays shut away from a terminal')
    check(J("() => !NQ.GAME.nearTerminal"), 'no terminal prompt away from a terminal')
    # walk up to the nearest terminal: E opens it
    J("() => { const t = NQ.WORLD.supplies.find(s => s.kind === 'terminal'); NQ.pose({ x: t.x + 1, z: t.z }); NQ.run(1, 1 / 30); }")
    check(bool(J("() => NQ.GAME.nearTerminal")), 'terminal prompt at the terminal')
    pg.keyboard.press('KeyE')
    check(J("() => NQ.GAME.state") == 'shop', 'E at a terminal opens the armory')
    check(J("() => !document.getElementById('scr-shop').hidden"), 'armory screen visible')
    t = J("() => document.getElementById('aqTimer').textContent"); check(t.startswith('0:4'), f'countdown shows {t}')
    # buy Tracer (90) if affordable, else just verify the "Need X more" label
    J("() => { NQ.GAME.scrap = 1000; NQ.armoryPickTab('arrows'); NQ.armoryPick('tracer'); }")
    check(J("() => NQ.armoryBuy()"), 'buy Tracer')
    check(J("() => NQ.LOADOUT.equipped.join(',')") == 'tracer', 'unlocked arrow auto-equips')
    check(J("() => NQ.PLAYER.ammo[8]") >= 5, 'Tracer allotment granted')
    for item in ['piercer', 'blast', 'shock']:
        J(f"() => {{ NQ.GAME.scrap = 5000; NQ.armoryPick('{item}'); NQ.armoryBuy(); }}")
    msg = J("() => NQ.AQ.msg"); check('Quiver is full' in msg, f'full-quiver message: {msg}')
    for item in ['piercer', 'blast', 'shock', 'cryo', 'splitter']:
        J(f"() => {{ NQ.GAME.scrap = 5000; NQ.armoryPick('{item}'); NQ.armoryBuy(); NQ.armoryBuy(); NQ.armoryBuy(); }}")
    check(J("() => NQ.LOADOUT.equipped.length") == 3, 'quiver holds 3 specials')
    J("() => { NQ.armoryPick('tracer'); NQ.armoryToggleEquip(); NQ.armoryPick('splitter'); NQ.armoryToggleEquip(); }")
    check('splitter' in J("() => NQ.LOADOUT.equipped"), 'equip swap works')
    for item in ['drawspeed', 'power', 'quiver', 'aim', 'recovery', 'regen', 'maxhp', 'armor', 'stamina']:
        J(f"() => {{ NQ.GAME.scrap = 9000; NQ.armoryPick('{item}'); for (let i = 0; i < 4; i++) NQ.armoryBuy(); }}")
    P = J("() => ({ d: NQ.PLAYER.drawTime, q: NQ.PLAYER.quiverMax, hp: NQ.PLAYER.maxHp, a: NQ.PLAYER.armor, s: NQ.PLAYER.stamMax, r: NQ.PLAYER.regenInt, rr: NQ.PLAYER.recoverR })")
    print('  maxed player:', P)
    check(P == {'d': 0.6, 'q': 42, 'hp': 150, 'a': 0.3, 's': 9, 'r': 2.5, 'rr': 6}, 'every upgrade reaches its top value')
    lab = J("() => document.querySelector('.aq-buy').textContent"); check(lab == 'Fully upgraded', f'buy button at max: {lab}')
    # start the wave from the armory
    J("() => document.getElementById('aqStart').click()")
    check(J("() => NQ.GAME.state") == 'playing' and J("() => NQ.GAME.wave") == 2, 'Start wave closes the armory and starts wave 2')
    check(J("() => NQ.PLAYER.ammo[0]") == 42, 'quiver refilled to 42 at wave start')
    # every equipped special and standard fires and resolves without errors
    J("() => { NQ.clear(); NQ.run(1); }")
    for t in [0, 3, 2, 7, 4, 6, 8]:
        J(f"""() => {{ const P = NQ.PLAYER; P.x = 0; P.z = 14; P.yaw = 0; P.pitch = 0;
            for (let k = 0; k < 4; k++) {{ const z = NQ.spawnZombie('walker', -1 + k * 0.7, 2 - k * 1.5, 2); z.speed = 0; }}
            NQ.run(2); NQ.PLAYER.ammo[{t}] = 9; NQ.fire({t}, 1); NQ.run(45, 1 / 60); }}""")
    marked = J("() => NQ.ZOMBIES.filter(z => z.markT > 0).length"); print('  marked by tracer:', marked)
    check(len(errs) == 0, 'no page errors while firing every arrow type')
    # recovery: arrows in the ground come back by walking over them
    J("""() => { NQ.clear(); const P = NQ.PLAYER; P.recoverR = 1.3; P.x = 0; P.z = 14; P.yaw = 0; P.pitch = -0.5; P.ammo[0] = 10; NQ.fire(0, 1); NQ.run(60, 1 / 60); }""")
    stuck = J("() => NQ.PROJ.filter(p => p.stuck && p.tok).map(p => [p.x, p.z])")
    check(len(stuck) == 1, f'standard arrow sticks in the street: {stuck}')
    if stuck:
        J(f"() => {{ NQ.PLAYER.x = {stuck[0][0]}; NQ.PLAYER.z = {stuck[0][1]}; NQ.run(2); }}")
        check(J("() => NQ.PLAYER.ammo[0]") == 10, 'walking over it picks it back up')
    # regen: 1 HP every 2.5 s at max level after 6 s out of combat
    hp = J("() => { NQ.clear(); NQ.GAME.toSpawn = 0; NQ.GAME.bossPending = 0; NQ.GAME.clearedShown = true; const P = NQ.PLAYER; P.hp = 50; P.lastHurt = NQ.GAME.time; NQ.run(360, 1 / 30); return P.hp; }")
    check(abs(hp - (50 + 6 / 2.5)) < 0.3, f'regen after 12 s: {hp:.2f} HP (expect ~52.4)')
    check(len(errs) == 0, 'no page errors')
    for e in errs[:10]: print('  ', e)
    b.close()

    # screenshots of the board itself, in the design's own state (wave 7 cleared, 640 scrap, Cryo selected)
    for (w, h) in [(1920, 1080), (1366, 768)]:
        b, pg, errs = open_game(pw, url, w, h, capture=True, loop=False)
        pg.evaluate("""() => { NQ.play(); NQ.GAME.wave = 7; Object.assign(NQ.LOADOUT.levels, { piercer: 1, cryo: 2, drawspeed: 2, quiver: 1, maxhp: 1 });
            NQ.LOADOUT.equipped.push('piercer', 'cryo'); NQ.GAME.scrap = 640; NQ.GAME.intermission = true; NQ.GAME.interT = 45; NQ.GAME.openShop(); NQ.armoryPick('cryo'); }""")
        pg.evaluate("() => document.fonts.ready")
        pg.wait_for_timeout(400)
        pg.screenshot(path=os.path.join(OUT, f'armory-{w}x{h}.png'))
        check(len(errs) == 0, f'no errors at {w}x{h}')
        b.close()
httpd.shutdown()
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED: ' + '; '.join(fails)))
sys.exit(1 if fails else 0)
