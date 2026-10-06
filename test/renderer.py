# One renderer, two backends (src/boot.js + engine.js): WebGPURenderer on WebGPU where a real adapter + device start,
# otherwise on its own WebGL2 backend. Same TSL shaders on both. Checks the backend pick, ?gpu=webgl, the Settings
# label, device loss, and High / Ultra frames (MSAA, mirror, GTAO, textures, timestamps) on each backend.
# Serve the repo on :8765 first (python3 -m http.server 8765). Screenshots go to test/out/renderer/.
# usage: python3 test/renderer.py [quick]   (quick: skip the Ultra frames, the slowest part)
import os, sys
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'renderer'); os.makedirs(OUT, exist_ok=True)
URL = 'http://localhost:8765/index.html'
GL = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']   # no WebGPU adapter
# SwiftShader WebGPU adapter. Without Vulkan, headless Chromium's Dawn drops the device ~50 ms in, even on a bare clear loop
GPU = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader']
QUICK = 'quick' in sys.argv[1:]
FAILS = []
def check(ok, msg): print(('  ok   ' if ok else '  FAIL ') + msg, flush=True); ok or FAILS.append(msg)
SET = lambda q, res='auto': 'localStorage.setItem("nq_settings", JSON.stringify({ v: 2, quality: %d, res: %s }))' % (q, '"auto"' if res == 'auto' else res)
KEEP = lambda js: 'localStorage.getItem("nq_settings") || ' + js   # init scripts run on every load: only seed a first visit
def page(b, init=KEEP(SET(2, 50))):   # 50% resolution: quicker software frames
    pg = b.new_page(viewport={'width': 960, 'height': 540}); E = []
    pg.on('pageerror', lambda e: E.append('PAGE ' + str(e)[:300])); pg.on('console', lambda m: m.type == 'error' and E.append(m.text[:300]))
    if init: pg.add_init_script(init)
    return pg, E
# SwiftShader frames are slow: once the game is up, its loop is paused and frames are drawn on demand
def ready(pg, t=900000): pg.wait_for_function('window.NQ_READY === true', timeout=t, polling=500); pg.evaluate('NQ.noLoop(true)')
def shot(pg, n):
    if pg.evaluate('!!window.NQ_READY'): pg.evaluate('NQ.renderOnce()')
    pg.screenshot(path=os.path.join(OUT, n + '.png'), timeout=900000)   # a full frame on SwiftShader takes a minute or more
def errs(E): return [e for e in E if 'favicon' not in e]
def no_glsl(pg): return pg.evaluate('(() => { let n = 0; NQ.scene.traverse(o => { const m = o.material; if (m && (m.isShaderMaterial || !m.isNodeMaterial)) n++; }); return n; })()') == 0
ULTRA_JS = '''() => { const N = NQ; N.play(); N.clear(); N.GAME.toSpawn = 0; N.GAME.intermission = true; N.GAME.interT = 1e9;
  Object.assign(N.WX, { state: 'snow', forced: 'snow', precip: 0.7, snow: 1, wet: 1, cover: 0.3, flash: 0 });
  for (let i = 0; i < 40; i++) N.emit(1 + Math.random(), 1.2 + Math.random(), 8, Math.random() - 0.5, 1, 0, 0.5, [2.4, 1.0, 0.15], 0.12);
  const z = N.spawnZombie('walker', 3, 7, 1); z.speed = 0;
  const P = { x: 2, z: 12, y: 0, yaw: 0.3, pitch: -0.1, roll: 0 }; for (let i = 0; i < 4; i++) { N.pose(P); N.step(1 / 60); } N.pose(P); N.particles(0.016); N.renderOnce(); N.renderOnce(); }'''
def ultra(pg, E, tag):
    pg.evaluate(ULTRA_JS)
    check(pg.evaluate('NQ.NQU.uReflOn.value') == 1 and pg.evaluate('NQ.TEXN.refl.value.isRenderTargetTexture === true'), tag + ': wet-street mirror on')
    check(pg.evaluate('!!(NQ.GPOST.ao && NQ.GPOST.pre)') and pg.evaluate('NQ.GPOST.world.options.samples') == 4, tag + ': GTAO prepass + 4x MSAA on Ultra')
    pg.wait_for_function("NQ.ULTRA.state === 'ready'", timeout=600000, polling=1000); check(pg.evaluate('NQ.NQU.uTexOn.value') == 1, tag + ': surface textures on')
    if not pg.evaluate("NQ.renderer.hasFeature('timestamp-query')"): print('  skip ' + tag + ': no timestamp queries on this browser/backend')
    else:
        for i in range(12):   # timestamps resolve asynchronously and are collected by the next frame's poll
            pg.wait_for_timeout(5000); pg.evaluate('NQ.renderOnce()')
            if pg.evaluate('NQ.GPU_PROF.ok'): break
        acc = pg.evaluate('Object.keys(NQ.GPU_PROF.acc)'); check(len(acc) > 0, tag + ': GPU timestamps: ' + ', '.join(acc))
    shot(pg, tag + '-ultra')
    from PIL import Image, ImageStat   # the saved screenshot: a WebGL canvas reads back blank once it has been shown
    px = sum(ImageStat.Stat(Image.open(os.path.join(OUT, tag + '-ultra.png')).convert('RGB')).mean) / 3
    check(px > 8, tag + ': Ultra frame is not black (mean %.1f)' % px)
    check(not errs(E), tag + ': no console errors on Ultra ' + str(errs(E)[:4]))
with sync_playwright() as p:
    print('1. no WebGPU adapter: WebGL2 backend, said in Settings with the reason')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GL); pg, E = page(b)
    pg.goto(URL + '?nowarn'); ready(pg)
    check(pg.evaluate('NQ.backend()') == 'webgl2' and pg.evaluate('NQ.renderer.backend.isWebGLBackend') is True, 'running on the WebGL2 backend')
    check(pg.evaluate('NQ_BOOT.forceWebGL') is True and pg.evaluate('NQ_BOOT.why') != '', 'probe reason: ' + pg.evaluate('NQ_BOOT.why'))
    check(pg.inner_text('#backend') == 'WebGL2 (compatibility)' and pg.evaluate('NQ_BOOT.why') in (pg.get_attribute('#backend', 'title') or ''), 'Settings label: ' + pg.inner_text('#backend'))
    check(pg.evaluate('[...document.getElementById("quality").options].map(o => o.textContent).join()') == 'High,Ultra', 'Quality offers High and Ultra only')
    check(pg.evaluate('[...document.getElementById("res").options].map(o => o.value).join()') == 'auto,100,85,75,67,50', 'Resolution: Auto + fixed percentages')
    check(not pg.query_selector('#scr-boot') and not pg.query_selector('#renderer'), 'no renderer choice screen or selector left')
    check(no_glsl(pg), 'every material in the scene is a node material')
    check(pg.evaluate('!!(NQ.GPOST.pipe && NQ.GPOST.world && NQ.GPOST.bloom)') and pg.evaluate('NQ.GPOST.world.options.samples') == 4, 'TSL post pipeline built, 4x MSAA')
    check(not errs(E), 'no console errors ' + str(errs(E)[:3])); shot(pg, '1-title-webgl2')
    pg.evaluate("NQ.play(); NQ.bow('drawing', 1, 2); NQ.run(60)"); shot(pg, '1-play-webgl2')
    if not QUICK: E.clear(); pg.evaluate(SET(3, 100)); pg.goto(URL + '?nowarn&prof=1'); ready(pg); ultra(pg, E, '1-webgl2')
    b.close()

    print('2. WebGPU adapter (SwiftShader): WebGPU backend; ?gpu=webgl forces WebGL2')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GPU); pg, E = page(b)
    pg.goto(URL + '?nowarn'); ready(pg)
    check(pg.evaluate('NQ.backend()') == 'webgpu' and pg.evaluate('NQ.renderer.backend.isWebGPUBackend') is True and pg.evaluate('NQ_BOOT.forceWebGL') is False, 'running on the WebGPU backend')
    check(pg.inner_text('#backend') == 'WebGPU', 'Settings label: ' + pg.inner_text('#backend'))
    check(pg.evaluate('NQ.GPU.name') != '', 'GPU name: ' + pg.evaluate('NQ.GPU.name'))
    check(no_glsl(pg), 'every material in the scene is a node material')
    check(pg.evaluate('NQ.R3.warm && NQ.R3.warm.programs') > 0, 'shaders warmed at load: %s' % pg.evaluate('JSON.stringify(NQ.R3.warm)'))
    check(not errs(E), 'no console errors on WebGPU ' + str(errs(E)[:4])); shot(pg, '2-title-webgpu')
    pg.evaluate("NQ.play(); NQ.bow('drawing', 1, 2); NQ.run(60)"); shot(pg, '2-play-webgpu')
    print('3. WebGPU device lost mid-game: pause and explain, Reload only')
    pg.evaluate('NQ.renderer.onDeviceLost({ api: "WebGPU", message: "simulated loss", reason: "unknown" })'); pg.wait_for_timeout(500)
    check(pg.is_visible('#sysErr') and pg.text_content('#sysErrBtn') == 'Reload' and not pg.is_visible('#sysErrBtn2'), 'GRAPHICS screen: ' + pg.inner_text('#sysErrT'))
    check(pg.evaluate('NQ.GAME.state') == 'paused' and pg.evaluate('NQ.GPU.lost') is True, 'game paused, frames stopped')
    shot(pg, '3-device-lost')
    E.clear(); pg.goto(URL + '?nowarn&gpu=webgl&prof=1'); ready(pg)
    check(pg.evaluate('NQ.backend()') == 'webgl2' and pg.evaluate('NQ_BOOT.why') == 'Forced by ?gpu=webgl.', '?gpu=webgl draws on WebGL2 though WebGPU works')
    if pg.evaluate("NQ.renderer.hasFeature('timestamp-query')"):   # this adapter's ANGLE exposes EXT_disjoint_timer_query_webgl2
        for i in range(12):
            pg.wait_for_timeout(5000); pg.evaluate('NQ.renderOnce()')
            if pg.evaluate('NQ.GPU_PROF.ok'): break
        check(len(pg.evaluate('Object.keys(NQ.GPU_PROF.acc)')) > 0, 'WebGL2 GPU timestamps: ' + ', '.join(pg.evaluate('Object.keys(NQ.GPU_PROF.acc)')))
    else: print('  skip WebGL2 timestamps: no EXT_disjoint_timer_query here')
    shot(pg, '3-webgl2-forced')
    check(not [e for e in errs(E) if 'toInspector' not in e], 'no console errors ' + str(errs(E)[:3]))
    if not QUICK: E.clear(); pg.evaluate(SET(3, 100)); pg.goto(URL + '?nowarn&prof=1'); ready(pg); ultra(pg, E, '2-webgpu')
    b.close()

    print('4. the probe finds no adapter (driver switched off): WebGL2 backend, no reload loop')
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium', args=GPU)
    pg, E = page(b, KEEP(SET(2, 50)) + ';navigator.gpu && (navigator.gpu.requestAdapter = async () => null)')
    pg.goto(URL + '?nowarn'); ready(pg)
    check(pg.evaluate('NQ.backend()') == 'webgl2' and 'adapter' in pg.evaluate('NQ_BOOT.why'), 'WebGL2: ' + pg.evaluate('NQ_BOOT.why'))
    check(pg.evaluate('performance.getEntriesByType("navigation").length') == 1 and 'gpu=' not in pg.url, 'loaded once, URL untouched')
    check(not errs(E), 'no console errors ' + str(errs(E)[:3]))
    b.close()

print('FAILED: %d' % len(FAILS) if FAILS else 'ALL OK'); sys.exit(1 if FAILS else 0)
