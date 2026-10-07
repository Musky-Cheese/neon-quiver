import os, hashlib, json
root = os.path.dirname(os.path.abspath(__file__))
S = lambda f: open(os.path.join(root, 'src', f)).read()
fonts = ''
for w, st, f in [(400, 'normal', 'heroscn-regular.woff'), (700, 'normal', 'heroscn-bold.woff'), (700, 'italic', 'heroscn-bolditalic.woff')]:
    fonts += '@font-face{font-family:"Quiver Cn";font-weight:%d;font-style:%s;font-display:block;src:url(fonts/%s) format("woff");}\n' % (w, st, f)
# the Armory screen's faces (Chakra Petch + IBM Plex Mono, SIL OFL, Latin subsets in fonts/). font-display: swap and a
# background document.fonts.load() at boot, so they never block the game and are ready before the first wave is cleared.
for fam, pre, ws in [('Chakra Petch', 'chakrapetch', [(400, 'regular'), (500, 'medium'), (600, 'semibold'), (700, 'bold')]), ('IBM Plex Mono', 'ibmplexmono', [(400, 'regular'), (500, 'medium'), (600, 'semibold')])]:
    for w, n in ws:
        fonts += '@font-face{font-family:"%s";font-weight:%d;font-style:normal;font-display:swap;src:url(fonts/%s-%s.woff) format("woff");}\n' % (fam, w, pre, n)
css = S('style.css').replace('/*__FONTS__*/', fonts)
# the game module: three.js's WebGPURenderer (WebGPU, or its own WebGL2 backend where WebGPU is missing) with TSL shaders
IMPORTS = '''import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
'''
RIG_VER = hashlib.sha1(open(os.path.join(root, 'models', 'zombie.glb'), 'rb').read()).hexdigest()[:10]
SAKURA_VER = hashlib.sha1(open(os.path.join(root, 'models', 'sakura.glb'), 'rb').read()).hexdigest()[:10]
TREE_VER = hashlib.sha1(open(os.path.join(root, 'models', 'tree.glb'), 'rb').read()).hexdigest()[:10] if os.path.exists(os.path.join(root, 'models', 'tree.glb')) else '0'
CARS_VER = hashlib.sha1(b''.join(open(os.path.join(root, 'models', f), 'rb').read() for f in ('car_sedan.glb', 'car_van.glb'))).hexdigest()[:10]
PROP_FILES = sorted(f for f in os.listdir(os.path.join(root, 'models')) if f.startswith('prop_') and f.endswith('.glb'))
PROPS_VER = hashlib.sha1(b''.join(open(os.path.join(root, 'models', f), 'rb').read() for f in PROP_FILES)).hexdigest()[:10]
MZ_FILES = sorted(f for f in os.listdir(os.path.join(root, 'models')) if f.startswith('mz_') and f.endswith('.glb'))
MZ_VER = hashlib.sha1(b''.join(open(os.path.join(root, 'models', f), 'rb').read() for f in MZ_FILES)).hexdigest()[:10]
TEX_VER = hashlib.sha1(b''.join(open(os.path.join(root, 'textures', f), 'rb').read() for f in ('albedo.jpg', 'normal.jpg', 'orm.jpg'))).hexdigest()[:10]
SRC = ['models.js', 'engine.js', 'gpu.js', 'props.js', 'interiors.js', 'theme.js', 'seg.js', 'audio.js', 'weather.js', 'fx.js', 'city.js', 'districts.js', 'world.js', 'bow.js', 'hook.js', 'zombies.js', 'objectives.js', 'hazards.js', 'rig.js', 'r3.js', 'armory.js', 'game.js']
CONSTS = 'const RIG_VER = "%s";   // content hash: a new model always busts the browser cache\n' % RIG_VER + 'const SAKURA_VER = "%s"; // Meshy hero-tree cache key\n' % SAKURA_VER + 'const CARS_VER = "%s";   // Meshy car models cache key\n' % CARS_VER + 'const TREE_VER = "%s";   // Meshy tree model cache key\n' % TREE_VER + 'const PROPS_VER = "%s";  // Meshy bushes and lanterns cache key\n' % PROPS_VER + 'const PROP_MODELS = %s;\n' % json.dumps([f[5:-4] for f in PROP_FILES]) + 'const MZ_VER = "%s";     // Meshy zombie models cache key\n' % MZ_VER + 'const MZ_TYPES = %s;\n' % json.dumps([f[3:-4] for f in MZ_FILES]) + 'const TEX_VER = "%s";   // same for the Ultra texture strips\n' % TEX_VER
js = IMPORTS + CONSTS + '\n'.join(S(f) for f in SRC)
assert '//#if' not in js and '//#endif' not in js, 'stray //#if in src: there is one bundle now'
open(os.path.join(root, 'game.js'), 'w').write(js)
for old in ('game-webgl.js', 'game-webgpu.js'):   # the two-bundle build's outputs
    if os.path.exists(os.path.join(root, old)): os.remove(os.path.join(root, old))
boot = S('boot.js').replace('/*__GAME__*/""', json.dumps('game.js?v=' + hashlib.sha1(js.encode()).hexdigest()[:10]))
body = S('body.html')
title = '<title>Neon Quiver</title>'
meta = '<meta name="description" content="Neon Quiver: a first-person archery survival game. Roam a quarantined cyberpunk city and hold off endless zombie waves, right in your browser.">'
importmap = '<script type="importmap">{"imports":{"three":"./vendor/three.webgpu.js","three/webgpu":"./vendor/three.webgpu.js","three/tsl":"./vendor/three.tsl.js","three/addons/":"./vendor/addons/"}}</script>'
head = f'<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n{title}\n{meta}\n{importmap}\n<link rel="modulepreload" href="vendor/three.webgpu.js">\n<link rel="modulepreload" href="vendor/three.core.js">\n<meta property="og:title" content="Neon Quiver">\n<meta property="og:description" content="Draw. Release. Survive the horde. A first-person archer vs. zombies game in a rain-soaked cyberpunk city.">\n<meta property="og:image" content="https://musky-cheese.github.io/neon-quiver/ads/social-1200x628.jpg">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="theme-color" content="#07060f">\n<link rel="icon" type="image/png" href="favicon-64.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n<style>\n{css}\n</style>'
full = f'<!doctype html>\n<html lang="en">\n<head>\n{head}\n</head>\n<body>\n{body}\n<script>\n{boot}\n</script>\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w').write(full)
print('built index.html %d KB, game.js %d KB  (serve this folder: index.html + game.js + vendor/ + models/)' % (len(full) // 1024, len(js) // 1024))
