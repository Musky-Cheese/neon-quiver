"""Horde stress: 40 mixed zombies chasing the player, kills and crawlers, every quality level. Reports errors + scene triangles."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 640, 'height': 360}); E = []
    pg.on('pageerror', lambda e: E.append('PAGE ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and E.append(m.text[:200]))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_function('window.NQ_READY === true', timeout=120000)
    for q in (0, 1, 2):
        r = pg.evaluate("""(q) => { const N = window.NQ; N.SETTINGS.quality = q; N.play(); N.clear(); N.noLoop(true); N.DBG.noVM = true;
          const K = ['walker','walker','walker','runner','runner','brute'];
          for (let i = 0; i < 40; i++) { const a = i * 0.7, d = 6 + (i % 7) * 2.5; N.spawnZombie(K[i % 6], Math.sin(a) * d, Math.cos(a) * d - 10, 5); }
          N.pose({ x: 0, z: -10, y: 0, yaw: 0, pitch: 0, roll: 0 });
          for (let i = 0; i < 90; i++) N.step(1 / 30);
          // damage some: legs (crawl), head kills, body kills
          N.ZOMBIES.slice(0, 12).forEach((z, i) => { if (i % 3 === 0) N.dmgTest(z, z.hp * 0.45, 'legs', [z.x, 0.5, z.z], [0, 0, 1]); else if (i % 3 === 1) N.killTest(z, 'head', [0, 0, 1], [z.x, 1.7, z.z], 1, false); else N.killTest(z, 'body', [1, 0, 0], [z.x, 1.2, z.z], 1, false); });
          for (let i = 0; i < 60; i++) N.step(1 / 30);
          N.renderOnce();
          let tris = 0; N.scene.traverse(o => { if (o.isMesh && o.visible && o.geometry) { const g = o.geometry; const n = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0); tris += n / 3 * (o.count || 1); } });
          const zt = N.ZOMBIES.filter(z => z.rig).map(z => z.rig.mesh.geometry.index.count / 3);
          return { q, zombies: N.ZOMBIES.length, rigs: zt.length, avgZTris: Math.round(zt.reduce((a, b) => a + b, 0) / Math.max(1, zt.length)), sceneTris: Math.round(tris), variants: Object.keys(N.ZRIG.geos).length }; }""", q)
        print(r)
    print('errors:', E[:6]); b.close()
