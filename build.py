import base64, os, shutil
root = os.path.dirname(os.path.abspath(__file__))
S = lambda f: open(os.path.join(root, 'src', f)).read()
fonts = ''
for w, st, f in [(400, 'normal', 'heroscn-regular.woff'), (700, 'normal', 'heroscn-bold.woff'), (700, 'italic', 'heroscn-bolditalic.woff')]:
    fonts += '@font-face{font-family:"Quiver Cn";font-weight:%d;font-style:%s;font-display:block;src:url(fonts/%s) format("woff");}\n' % (w, st, f)
css = S('style.css').replace('/*__FONTS__*/', fonts)
IMPORTS = '''import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
'''
js = IMPORTS + '\n'.join(S(f) for f in ['models.js', 'engine.js', 'theme.js', 'seg.js', 'audio.js', 'fx.js', 'city.js', 'districts.js', 'world.js', 'bow.js', 'zombies.js', 'rig.js', 'r3.js', 'game.js'])
body = S('body.html')
title = '<title>Neon Quiver</title>'
meta = '<meta name="description" content="Neon Quiver: a first-person archery survival game. Hold a sealed cyberpunk plaza against endless zombie waves, right in your browser.">'
importmap = '<script type="importmap">{"imports":{"three":"./vendor/three.module.js","three/addons/":"./vendor/addons/"}}</script>'
head = f'<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n{title}\n{meta}\n<meta property="og:title" content="Neon Quiver">\n<meta property="og:description" content="Draw. Release. Survive the horde. A first-person archer vs. zombies game in a rain-soaked cyberpunk city.">\n<meta property="og:image" content="https://musky-cheese.github.io/neon-quiver/ads/social-1200x628.jpg">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="theme-color" content="#07060f">\n<link rel="icon" type="image/png" href="favicon-64.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n{importmap}\n<style>\n{css}\n</style>'
full = f'<!doctype html>\n<html lang="en">\n<head>\n{head}\n</head>\n<body>\n{body}\n<script type="module">\n{js}\n</script>\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w').write(full)
art = f'{title}\n<script>window.__NQ_RIG_URL="models/zombie.glb.json";</script>\n{importmap}\n<style>\n{css}\n</style>\n{body}\n<script type="module">\n{js}\n</script>\n'
os.makedirs(os.path.join(root, 'build'), exist_ok=True)
open(os.path.join(root, 'build', 'artifact.html'), 'w').write(art)
import json
json.dump({'glb': base64.b64encode(open(os.path.join(root, 'models', 'zombie.glb'), 'rb').read()).decode()}, open(os.path.join(root, 'build', 'zombie.glb.json'), 'w'))
print('built', len(full) // 1024, 'KB  (serve this folder: index.html + vendor/ + models/zombie.glb)')
