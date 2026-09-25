import base64, os
root = os.path.dirname(os.path.abspath(__file__))
S = lambda f: open(os.path.join(root, 'src', f)).read()
fonts = ''
for w, st, f in [(400, 'normal', 'heroscn-regular.woff'), (700, 'normal', 'heroscn-bold.woff'), (700, 'italic', 'heroscn-bolditalic.woff')]:
    b = base64.b64encode(open(os.path.join(root, 'fonts', f), 'rb').read()).decode()
    fonts += '@font-face{font-family:"Quiver Cn";font-weight:%d;font-style:%s;font-display:block;src:url(data:font/woff;base64,%s) format("woff");}\n' % (w, st, b)
css = S('style.css').replace('/*__FONTS__*/', fonts)
js = '\n'.join(S(f) for f in ['engine.js', 'theme.js', 'seg.js', 'audio.js', 'fx.js', 'city.js', 'bow.js', 'zombies.js', 'game.js'])
js = '(function(){\n' + js + '\n})();'
body = S('body.html')
title = '<title>Neon Quiver</title>'
meta = '<meta name="description" content="Neon Quiver: a first-person archery survival game. Hold a sealed cyberpunk plaza against endless zombie waves, right in your browser.">'
art = f'{title}\n<style>\n{css}\n</style>\n{body}\n<script>\n{js}\n</script>\n'
full = f'<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n{title}\n{meta}\n<meta property="og:title" content="Neon Quiver">\n<meta property="og:description" content="Draw. Release. Survive the horde. A first-person archer vs. zombies game in a neon city.">\n<meta property="og:image" content="https://musky-cheese.github.io/neon-quiver/ads/social-1200x628.jpg">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="theme-color" content="#07060f">\n<link rel="icon" type="image/png" href="favicon-64.png">\n<link rel="apple-touch-icon" href="icon-192.png">\n<style>\n{css}\n</style>\n</head>\n<body>\n{body}\n<script>\n{js}\n</script>\n</body>\n</html>\n'

open(os.path.join(root, 'index.html'), 'w').write(full)
os.makedirs(os.path.join(root, 'build'), exist_ok=True)
open(os.path.join(root, 'build', 'artifact.html'), 'w').write(art)
print('built', len(full) // 1024, 'KB')
