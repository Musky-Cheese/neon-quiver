from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(); E = []
    pg.on('pageerror', lambda e: E.append('PAGE ' + str(e))); pg.on('console', lambda m: m.type in ('error', 'warning') and E.append(m.text[:300]))
    pg.goto('http://localhost:8765/index.html')
    try: pg.wait_for_function('window.NQ_READY === true', timeout=600000, polling=500); print('READY', pg.evaluate('NQ.backend()'))
    except Exception: print('NOT READY')
    for e in E[:8]: print(e)
    b.close()
