"""Pack the CC0 Poly Haven sets in textures_src/ (see tools/fetch_textures.py) into three vertical strips
that the Ultra quality level loads as texture arrays:
  textures/albedo.jpg  1024 x 8192  (8 layers, sRGB colour)
  textures/normal.jpg  1024 x 8192  (8 layers, OpenGL normal maps)
  textures/orm.jpg      512 x 4096  (8 layers: R = ambient occlusion, G = roughness)
plus *_half.jpg at half resolution for Balanced.
Layer order must match TEX_LAYERS in src/engine.js."""
import os, sys
from PIL import Image
LAYERS = ['asphalt', 'concrete', 'brick', 'rust', 'corrugated', 'pavers', 'plaster', 'castconc']
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'textures_src')
out = os.path.join(os.path.dirname(__file__), '..', 'textures'); os.makedirs(out, exist_ok=True)
S, s = 1024, 512
alb = Image.new('RGB', (S, S * len(LAYERS))); nor = Image.new('RGB', (S, S * len(LAYERS))); orm = Image.new('RGB', (s, s * len(LAYERS)))
for i, L in enumerate(LAYERS):
    d = os.path.join(src, L)
    alb.paste(Image.open(os.path.join(d, 'diff.jpg')).convert('RGB').resize((S, S), Image.LANCZOS), (0, i * S))
    nor.paste(Image.open(os.path.join(d, 'nor.jpg')).convert('RGB').resize((S, S), Image.LANCZOS), (0, i * S))
    ao = Image.open(os.path.join(d, 'ao.jpg')).convert('L').resize((s, s), Image.LANCZOS) if os.path.exists(os.path.join(d, 'ao.jpg')) else Image.new('L', (s, s), 255)
    ro = Image.open(os.path.join(d, 'rough.jpg')).convert('L').resize((s, s), Image.LANCZOS)
    orm.paste(Image.merge('RGB', (ao, ro, Image.new('L', (s, s), 0))), (0, i * s))
alb.save(os.path.join(out, 'albedo.jpg'), quality=84, optimize=True, progressive=True)
nor.save(os.path.join(out, 'normal.jpg'), quality=90, optimize=True, progressive=True)
orm.save(os.path.join(out, 'orm.jpg'), quality=86, optimize=True, progressive=True)
# half-resolution set for Balanced
alb.resize((S // 2, S // 2 * len(LAYERS)), Image.LANCZOS).save(os.path.join(out, 'albedo_half.jpg'), quality=84, optimize=True, progressive=True)
nor.resize((S // 2, S // 2 * len(LAYERS)), Image.LANCZOS).save(os.path.join(out, 'normal_half.jpg'), quality=90, optimize=True, progressive=True)
orm.resize((s // 2, s // 2 * len(LAYERS)), Image.LANCZOS).save(os.path.join(out, 'orm_half.jpg'), quality=86, optimize=True, progressive=True)
for f in ('albedo.jpg', 'normal.jpg', 'orm.jpg', 'albedo_half.jpg', 'normal_half.jpg', 'orm_half.jpg'): print(f, os.path.getsize(os.path.join(out, f)) // 1024, 'KB')
