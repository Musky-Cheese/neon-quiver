# Renderer choice (src/boot.js): boot screen, both bundles, fallback to Classic, Settings → Renderer.
# Serve the repo on :8765 first (python3 -m http.server 8765). Screenshots go to test/out/renderer/.
import os, sys, json
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'renderer'); os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:8765/index.html'
GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']   # no WebGPU adapter
# SwiftShader WebGPU adapter. Without Vulkan, headless Chromium's Dawn drops the device ~50 ms in, even on a bare clear loop
GPU = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader']
FAILS = []
def check(ok, msg): print(('  ok   ' if ok else '  FAIL ') + msg); ok or FAILS.append(msg)
def page(b, init=None):
    pg = b.new_page(viewport={'width': 1280, 'height': 720}); E = []
    pg.on('pageerror', lambda e: E.append('PAGE ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and E.append(m.text[:300]))
    pg.add_init_script(FAST)
    if init: pg.add_init_script(init)
    return pg, E
# SwiftShader frames are slow: once the game is up, its loop is paused and frames are drawn on demand
def ready(pg, t=240000): pg.wait_for_function('window.NQ_READY === true', timeout=t, polling=500); pg.evaluate('NQ.noLoop(true)')
def shot(pg, n):
    if pg.evaluate('!!window.NQ_READY'): pg.evaluate('NQ.renderOnce()')
    pg.screenshot(path=os.path.join(OUT, n + '.png'))
FAST = 'localStorage.getItem("nq_settings") || localStorage.setItem("nq_settings", JSON.stringify({ quality: 0, auto: false }))'   # Fast tier: quicker software frames
def ls(pg, k): return pg.evaluate(f'localStorage.getItem("{k}")')
def errs(E): return [e for e in E if 'favicon' not in e]
with sync_playwright() as p:
    print('1. no WebGPU adapter: boot screen, WebGPU greyed out, Classic preselected')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GL); pg, E = page(b)
    pg.goto(URL + '?boot&nowarn'); pg.wait_for_function('document.getElementById("bootGPU").classList.contains("na")', timeout=10000)
    check(pg.is_visible('#scr-boot'), 'boot screen shown')
    check(pg.evaluate('document.getElementById("bootGPU").disabled'), 'WebGPU option disabled: ' + pg.inner_text('#bootGPUs'))
    check(pg.get_attribute('#bootGL', 'aria-checked') == 'true', 'Classic preselected')
    shot(pg, '1-boot-nowebgpu')
    pg.click('#bootGo'); ready(pg)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgl' and json.loads(ls(pg, 'nq_renderer')) == 'webgl', 'started Classic and remembered it')
    check(pg.evaluate('document.getElementById("renderer").querySelector("option[value=webgpu]").disabled'), 'Settings: WebGPU greyed out')
    check(not errs(E), 'no console errors ' + str(errs(E)[:3])); shot(pg, '1-title-classic')
    E.clear(); pg.goto(URL + '?nowarn'); ready(pg)
    check(not pg.is_visible('#scr-boot') and pg.evaluate('NQ_BOOT.gpu') == 'webgl', 'returning player skips the screen')
    print('2. ?gpu=webgpu without WebGPU: falls back to Classic and says so')
    E.clear(); pg.goto(URL + '?gpu=webgpu&nowarn'); ready(pg)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgl', 'started Classic: ' + pg.url)
    check(pg.is_visible('#gpuNote'), 'notice shown: ' + pg.inner_text('#gpuNoteC')); shot(pg, '2-fallback-note')
    check(not [e for e in errs(E) if 'WebGPU' not in e], 'no unexpected console errors ' + str(errs(E)[:3]))
    b.close()

    print('3. WebGPU adapter (SwiftShader): offered but not preselected (software / preview); pick it')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GPU); pg, E = page(b)
    pg.goto(URL + '?boot&nowarn'); pg.wait_for_function('!document.getElementById("bootGPU").disabled', timeout=10000)
    check(pg.get_attribute('#bootGL', 'aria-checked') == 'true', 'Classic preselected: ' + pg.inner_text('#bootGPUs'))
    pg.click('#bootGPU'); check(pg.get_attribute('#bootGPU', 'aria-checked') == 'true', 'WebGPU selectable')
    pg.wait_for_timeout(400); shot(pg, '3-boot-webgpu')
    pg.click('#bootGo'); ready(pg, 600000)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgpu' and pg.evaluate('NQ.renderer.backend.isWebGPUBackend') is True, 'running on the WebGPU backend')
    check(pg.evaluate('typeof NQ.renderer.render') == 'function' and pg.evaluate('NQ.GPU.name') != '', 'GPU name: ' + pg.evaluate('NQ.GPU.name'))
    pg.evaluate('NQ.run(30)'); shot(pg, '3-title-webgpu')
    check(pg.evaluate('document.getElementById("renderer").value') == 'webgpu', 'Settings shows WebGPU')
    pg.evaluate('NQ.play(); NQ.run(120)'); shot(pg, '3-play-webgpu')
    real = [e for e in errs(E)]
    check(not real, 'no console errors on WebGPU ' + str(real[:4]))
    print('4. Settings → Renderer on the pause screen asks first, then reloads into Classic')
    E.clear(); pg.evaluate('NQ.GAME.pause()'); pg.wait_for_timeout(300)
    pg.select_option('#renderer2', 'webgl'); check(pg.is_visible('#sysErr') and pg.is_visible('#sysErrBtn2'), 'confirm shown')
    shot(pg, '4-pause-confirm'); pg.click('#sysErrBtn2'); check(not pg.is_visible('#sysErr') and pg.evaluate('NQ_BOOT.gpu') == 'webgpu', 'Keep playing: nothing changes')
    pg.select_option('#renderer2', 'webgl'); pg.click('#sysErrBtn'); ready(pg)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgl' and json.loads(ls(pg, 'nq_renderer')) == 'webgl', 'switched to Classic')
    print('5. title screen switch back to WebGPU reloads straight away')
    pg.select_option('#renderer', 'webgpu'); ready(pg, 600000)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgpu', 'back on WebGPU')
    b.close()

    print('6. WebGPU device lost during startup: falls back to Classic')
    LOSE = '''(() => { const rd = GPUAdapter.prototype.requestDevice; let n = 0;
      GPUAdapter.prototype.requestDevice = async function (d) { const dev = await rd.call(this, d); if (++n === 2 || !window.NQ_BOOT || NQ_BOOT.gpu === 'webgpu') {   // the game's device, not boot.js's probe
        const lost = new Promise((r) => setTimeout(() => r({ reason: 'unknown', message: 'simulated loss' }), DELAY)); Object.defineProperty(dev, 'lost', { get: () => lost }); } return dev; }; })();'''
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GPU); pg, E = page(b, LOSE.replace('DELAY', '200'))
    pg.goto(URL + '?gpu=webgpu&nowarn'); ready(pg, 600000)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgl' and pg.is_visible('#gpuNote'), 'Classic + notice: ' + pg.inner_text('#gpuNoteC'))
    b.close()
    print('6b. no adapter for the game (three would quietly use its WebGL2 backend): falls back to Classic')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GPU); pg, E = page(b, 'navigator.gpu && (navigator.gpu.requestAdapter = async () => null)')
    pg.goto(URL + '?gpu=webgpu&nowarn'); ready(pg, 600000)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgl' and 'gpu=webgl' in pg.url and pg.is_visible('#gpuNote'), 'Classic + notice: ' + pg.inner_text('#gpuNoteC'))
    b.close()
    print('7. WebGPU device lost mid-game: pause + explain, with a way back to Classic')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GPU); pg, E = page(b)
    pg.goto(URL + '?gpu=webgpu&nowarn'); ready(pg, 600000)
    pg.evaluate('NQ.renderer.onDeviceLost({ api: "WebGPU", message: "simulated loss", reason: "unknown" })')
    pg.wait_for_timeout(500)
    check(pg.is_visible('#sysErr') and 'reload in' in pg.inner_text('#sysErrBtn2').lower(), 'GRAPHICS screen: ' + pg.inner_text('#sysErrT'))
    shot(pg, '7-device-lost')
    pg.click('#sysErrBtn2'); ready(pg)
    check(pg.evaluate('NQ_BOOT.gpu') == 'webgl' and json.loads(ls(pg, 'nq_renderer')) == 'webgl', 'Reload in Classic: switched')
    b.close()

print('FAILED: %d' % len(FAILS) if FAILS else 'ALL OK'); sys.exit(1 if FAILS else 0)
