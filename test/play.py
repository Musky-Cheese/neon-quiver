from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 640, 'height': 360}); E = []
    pg.on('pageerror', lambda e: E.append(str(e)))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500)
    r = pg.evaluate("""() => { const N = window.NQ; N.noLoop(true); N.play(); const q = N.WORLD.indoor[1];
      N.pose({ x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, y: 0 });
      for (let i = 0; i < 6; i++) N.spawnZombie('walker', N.PLAYER.x - 18 * Math.sign(N.PLAYER.x) * (Math.abs(N.PLAYER.x) > 50) + i, N.PLAYER.z - 18 * Math.sign(N.PLAYER.z) * (Math.abs(N.PLAYER.z) > 50) + i, 1);
      N.run(1500, 1 / 60); N.renderOnce();
      const d = N.ZOMBIES.map(z => Math.hypot(z.x - N.PLAYER.x, z.z - N.PLAYER.z));
      return { hp: N.PLAYER.hp, state: N.GAME.state, zDist: d.map(v => +v.toFixed(1)), inRoom: (N.PLAYER.x > q.x0 && N.PLAYER.x < q.x1 && N.PLAYER.z > q.z0 && N.PLAYER.z < q.z1) }; }""")
    print(r, E[:3]); b.close()
