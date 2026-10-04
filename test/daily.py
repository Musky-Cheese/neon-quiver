"""Daily + custom runs and mutators.
   - normal runs still spawn exactly what the build before this feature did (test/daily_baseline.json, recorded from commit f105608)
   - a daily run's enemy mix, objectives and weather depend only on the date, whatever else consumes Math.random
   - every mutator applies and reverts cleanly; daily/custom results never touch the saved bests
   python3 test/daily.py"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'perf'))
from common import serve, open_game
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = json.load(open(os.path.join(HERE, 'daily_baseline.json'))); SPAWNS = open(os.path.join(HERE, 'daily_spawns.js')).read()
httpd, url = serve(); fails = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  {info}' if info != '' and not ok else ''))
    if not ok: fails.append(name)
# one daily run's worth of run-defining draws: enemy mix per wave, objective roll per wave, weather schedule. `burn` consumes
# Math.random between waves (the AI, particles ...) and `mseed` reseeds it, neither may change the result.
SEQ = """([date, burn, mseed]) => { const N = window.NQ; N.noLoop(true); window.__nqSeed(mseed); N.runConfigure('daily', null, date); N.play();
  const out = { wx: [], waves: [], obj: [] }; out.wx.push(N.WX.state + ':' + N.WX.dur.toFixed(3));
  for (let i = 0; i < 6; i++) { N.WX.t = 1e6; N.run(1); out.wx.push(N.WX.state + ':' + N.WX.dur.toFixed(3)); for (let k = 0; k < burn; k++) Math.random(); }
  for (let w = 1; w <= 10; w++) { N.GAME.wave = w - 1; N.GAME.intermission = false; N.GAME.startWave(); out.obj.push([N.OBJ.armed, +N.OBJ.delay.toFixed(3)]);
    const n = N.GAME.toSpawn; N.clear(); const row = [n]; for (let k = 0; k < burn * (w % 3); k++) Math.random();
    N.GAME.toSpawn = 9; for (let i = 0; i < 14; i++) { const b = N.ZOMBIES.length; N.GAME.spawnOne(); for (let k = b; k < N.ZOMBIES.length; k++) { const z = N.ZOMBIES[k]; row.push(z.type + (z.elite ? '*' : '')); } for (let k = 0; k < burn; k++) Math.random(); }
    out.waves.push(row.join(',')); }
  return out; }"""
with sync_playwright() as pw:
    b, pg, errs = open_game(pw, url, 480, 270, loop=False)
    E = lambda js, arg=None: pg.evaluate(js, arg)
    E("() => window.NQ.noLoop(true)")
    # ---- 1. normal runs are unchanged
    got = E(SPAWNS); check('normal run spawns exactly what the old build did', got == BASE, [(i, a, c) for i, (a, c) in enumerate(zip(got, BASE)) if a != c][:1])
    check('normal run is neutral', E("() => { const R = window.NQ.RUN; return R.mode === 'normal' && R.hpK === 1 && R.spawnK === 1 && R.scoreMult === 1 && !R.snow; }"))
    # ---- 2. daily determinism
    a = E(SEQ, ['2026-10-04', 0, 1]); c = E(SEQ, ['2026-10-04', 7, 99991]); d = E(SEQ, ['2026-10-05', 0, 1])
    check('same date, different Math.random use: same enemy mix, waves 1-10', a['waves'] == c['waves'], [x for x in zip(a['waves'], c['waves']) if x[0] != x[1]][:1])
    check('same date: same objective rolls', a['obj'] == c['obj'], [a['obj'], c['obj']])
    check('same date: same weather schedule', a['wx'] == c['wx'], [a['wx'], c['wx']])
    check('enemy mix is not trivially constant', len(set(a['waves'])) > 5 and any('runner' in w for w in a['waves']) and any('*' in w for w in a['waves']), a['waves'][-1])
    check('different dates give different runs', a['waves'] != d['waves'] and a['wx'] != d['wx'])
    check('the day picks two different mutators', E("() => { const i = window.NQ.dailyIds('2026-10-04'); return i.length === 2 && i[0] !== i[1] && window.NQ.dailyIds('2026-10-04').join() === i.join(); }"))
    # ---- 3. each mutator applies, and reverts cleanly
    FRESH = "() => { const N = window.NQ; N.runConfigure('normal'); N.play(); N.clear(); return JSON.stringify({ maxHp: N.PLAYER.maxHp, hp: N.PLAYER.hp, dmg: N.PLAYER.dmgMult, ammo: N.PLAYER.ammo.map(a => a === Infinity ? 'inf' : a), regen: N.REGEN ? N.REGEN.cap : 0, forced: N.WX.forced, run: N.RUN }); }"
    E("() => { window.NQ.REGEN = undefined; }")
    base = E(FRESH)
    eff = E("""() => { const N = window.NQ, o = {};
      for (const m of N.MUTATORS) { N.runConfigure('custom', [m.id]); N.play(); N.clear(); const z = N.spawnZombie('walker', 5, 5, 1); const hp = z.hp; N.clear();
        N.GAME.wave = 0; N.GAME.intermission = false; N.GAME.startWave(); const n = N.GAME.toSpawn; N.clear(); window.__nqSeed(5); let el = 0; N.GAME.wave = 5; for (let i = 0; i < 150; i++) { const b = N.ZOMBIES.length; N.GAME.toSpawn = 9; N.GAME.spawnOne(); for (let k = b; k < N.ZOMBIES.length; k++) if (N.ZOMBIES[k].elite) el++; } N.clear();
        o[m.id] = { maxHp: N.PLAYER.maxHp, dmg: N.PLAYER.dmgMult, ammo1: N.PLAYER.ammo[1], forced: N.WX.forced, hp, n, el, expo: N.RUN.expo, regenK: N.RUN.regenK, mult: N.RUN.scoreMult }; }
      N.runConfigure('normal'); return o; }""")
    check('Blackout dims exposure and ambient', eff['blackout']['expo'] < 1)
    check('No Regen turns natural healing off', eff['noregen']['regenK'] == 0)
    check('Glass Cannon: 50 max HP, +50% damage', eff['glass']['maxHp'] == 50 and abs(eff['glass']['dmg'] - 1.5) < 1e-9, eff['glass'])
    check('Elite Night makes elites early', eff['elite']['el'] > 20 and eff['swarm']['el'] == 0, [eff['elite']['el'], eff['swarm']['el']])
    check('Swarm: more infected, less health', eff['swarm']['n'] >= 14 and eff['swarm']['hp'] < eff['glass']['hp'] * 0.8, [eff['swarm'], eff['glass']['hp']])
    check('Snowbound forces snow', eff['snow']['forced'] == 'snow', eff['snow']['forced'])
    check('Scarce Arrows halves the starting quiver', eff['scarce']['ammo1'] == 2, eff['scarce']['ammo1'])
    check('every mutator carries a score bonus', all(v['mult'] > 1 for v in eff.values()))
    after = E(FRESH); check('after reverting, a normal run is back to baseline', after == base, [base[:200], after[:200]])
    E("() => { const N = window.NQ; N.runConfigure('custom', ['glass', 'noregen', 'snow']); N.play(); N.runConfigure('normal'); N.play(); }")
    check('mutators do not leak into the next normal run', E("() => { const N = window.NQ; return N.PLAYER.maxHp === 100 && N.WX.forced === null && N.RUN.scoreMult === 1 && N.RUN.ids.length === 0; }"))
    # ---- 4. saved bests are untouched by daily / custom runs; daily results are kept per date
    E("() => { localStorage.setItem('nq_best', '123'); localStorage.setItem('nq_bestwave', '4'); const N = window.NQ; N.GAME.best = 123; N.GAME.bestWave = 4; }")
    E("() => { for (const k of Object.keys(localStorage)) if (k.startsWith('nq_daily_')) localStorage.removeItem(k); }")   # the determinism runs above counted attempts too
    E("() => { window.NQ.GAME.state = 'title'; window.NQ.setScreen('title'); }")
    pg.click('#dailyBtn'); st = E("() => [window.NQ.GAME.state, window.NQ.RUN.mode, window.NQ.RUN.date]")
    today = E("() => window.NQ.utcDate()"); check('Daily button starts a daily run for today (UTC)', st == ['playing', 'daily', today], st)
    check('banner names the run and its mutators', E("() => /DAILY RUN/.test(window.NQ.GAME.banner.title) && window.NQ.GAME.banner.sub.length > 20"))
    seed = E("() => window.NQ.RUN.seed")
    E("() => { const G = window.NQ.GAME; G.score = 5000; G.wave = 7; G.kills = 30; G.gameOver(); }")
    pg.wait_for_function("!document.getElementById('scr-over').hidden", timeout=15000, polling=250)
    ls = E("() => [localStorage.getItem('nq_best'), localStorage.getItem('nq_bestwave'), JSON.parse(localStorage.getItem('nq_daily_' + window.NQ.utcDate()))]")
    mult = E("() => window.NQ.RUN.scoreMult")
    check('daily run leaves nq_best / nq_bestwave alone', ls[0] == '123' and ls[1] == '4', ls[:2])
    check('daily result stored under the date', ls[2] and ls[2]['attempts'] == 1 and ls[2]['runs'][0]['s'] == round(5000 * mult) and ls[2]['runs'][0]['w'] == 7, ls[2])
    check('game over shows the daily summary and Copy button', E("() => !document.getElementById('goRun').hidden && !document.getElementById('copyBtn').hidden && !document.getElementById('goBest').hidden === false"))
    txt = E("() => window.NQ.GAME.lastResult.text"); check('result text format', txt.startswith(f'Neon Quiver Daily {today} · Wave 7 · ') and txt.endswith(' + '.join(E("() => window.NQ.RUN.ids.map(i => window.NQ.MUTATORS.find(m => m.id === i).name)"))), txt)
    pg.click('#againBtn'); st = E("() => [window.NQ.GAME.state, window.NQ.RUN.mode, window.NQ.RUN.seed]")
    check('Run it back restarts the same daily seed', st == ['playing', 'daily', seed], st)
    check('attempt counted', E("() => window.NQ.dailyStore(window.NQ.utcDate()).attempts") == 2)
    # a second, worse result keeps the best and sorts
    E("() => { const G = window.NQ.GAME; G.score = 100; G.wave = 1; G.gameOver(); }"); pg.wait_for_function("!document.getElementById('scr-over').hidden", timeout=15000, polling=250)
    runs = E("() => window.NQ.dailyStore(window.NQ.utcDate()).runs.map(r => r.s)"); check('local top list is sorted', runs == sorted(runs, reverse=True) and len(runs) == 2, runs)
    # custom run through the UI
    E("() => { window.NQ.GAME.state = 'title'; window.NQ.setScreen('title'); }")
    pg.click('#customBtn'); pg.check('#cm-glass'); pg.check('#cm-noregen')
    check('custom screen shows the combined multiplier', '1.50' in E("() => document.getElementById('customMult').textContent"), E("() => document.getElementById('customMult').textContent"))
    pg.click('#customStart'); st = E("() => [window.NQ.GAME.state, window.NQ.RUN.mode, window.NQ.RUN.ids.slice().sort(), window.NQ.PLAYER.maxHp]")
    check('custom run starts with the chosen mutators', st == ['playing', 'custom', ['glass', 'noregen'], 50], st)
    E("() => { const G = window.NQ.GAME; G.score = 99999; G.wave = 20; G.gameOver(); }"); pg.wait_for_function("!document.getElementById('scr-over').hidden", timeout=15000, polling=250)
    ls = E("() => [localStorage.getItem('nq_best'), localStorage.getItem('nq_bestwave'), document.getElementById('copyBtn').hidden]")
    check('custom run leaves the bests alone too', ls[0] == '123' and ls[1] == '4', ls)
    # back to a normal run: neutral again, and it does count
    E("() => { window.NQ.GAME.state = 'title'; window.NQ.setScreen('title'); }"); pg.click('#playBtn')
    check('Enter the plaza is a normal run again', E("() => window.NQ.RUN.mode === 'normal' && window.NQ.PLAYER.maxHp === 100 && window.NQ.RUN.ids.length === 0"))
    E("() => { const G = window.NQ.GAME; G.score = 777; G.wave = 5; G.gameOver(); }"); pg.wait_for_function("!document.getElementById('scr-over').hidden", timeout=15000, polling=250)
    ls = E("() => [localStorage.getItem('nq_best'), localStorage.getItem('nq_bestwave'), document.getElementById('goRun').hidden]")
    check('a normal run still saves its best', ls[0] == '777' and ls[1] == '5' and ls[2] is True, ls)
    check('no page errors', not errs, errs[:3])
    b.close()
httpd.shutdown()
print('FAILED: ' + ', '.join(fails) if fails else 'all passed'); sys.exit(1 if fails else 0)
