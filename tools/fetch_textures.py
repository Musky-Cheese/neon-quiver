"""Download CC0 PBR texture sets from Poly Haven (polyhaven.com, CC0: free for any use, no attribution needed).

Run from Blender's Python console (or any Python 3) on a machine with internet:
  exec(open(r'C:\\Users\\fouad\\Downloads\\neon-quiver\\tools\\fetch_textures.py').read())
Writes <repo>/textures_src/<slot>/{diff,nor,rough,ao}.jpg plus _log.txt describing what was picked.
"""
import json, os, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else r'C:\Users\fouad\Downloads\neon-quiver\tools', '..')
OUT = os.path.normpath(os.path.join(ROOT, 'textures_src'))
UA = {'User-Agent': 'NeonQuiver-texture-fetch/1.0 (CC0 game textures)'}
RES = '1k'
# slot -> (preferred asset ids, fallback keyword)
SLOTS = {
    'asphalt':    (['asphalt_02', 'asphalt_04', 'aerial_asphalt_01', 'asphalt_01'], 'asphalt'),
    'concrete':   (['concrete_wall_008', 'concrete_wall_004', 'concrete_wall_003', 'concrete_wall_006'], 'concrete_wall'),
    'brick':      (['red_brick_03', 'brick_wall_02', 'red_bricks_04', 'red_brick'], 'brick'),
    'rust':       (['rusty_metal_02', 'rusty_metal_03', 'rusty_metal_04', 'rust_coarse_01'], 'rust'),
    'corrugated': (['corrugated_iron_02', 'corrugated_iron', 'corrugated_iron_03'], 'corrugated'),
    'pavers':     (['concrete_pavers', 'patterned_concrete_pavers', 'patterned_paving_02', 'concrete_floor_02'], 'paver'),
    'plaster':    (['plastered_wall_02', 'plastered_wall_04', 'painted_plaster_wall', 'plastered_wall'], 'plaster'),
    'castconc':   (['concrete_floor_worn_001', 'dirty_concrete', 'rough_concrete', 'concrete_floor_01'], 'concrete_floor'),
}
MAPS = {'diff': ['Diffuse'], 'nor': ['nor_gl'], 'rough': ['Rough', 'rough'], 'ao': ['AO', 'ao']}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()

def main():
    os.makedirs(OUT, exist_ok=True)
    log = []
    assets = json.loads(get('https://api.polyhaven.com/assets?t=textures'))
    total = 0
    for slot, (prefs, kw) in SLOTS.items():
        pick = next((a for a in prefs if a in assets), None) or next((a for a in sorted(assets) if kw in a), None)
        if not pick:
            log.append(f'{slot}: NOTHING FOUND'); continue
        files = json.loads(get('https://api.polyhaven.com/files/' + pick))
        d = os.path.join(OUT, slot); os.makedirs(d, exist_ok=True)
        got = []
        for m, keys in MAPS.items():
            k = next((k for k in keys if k in files), None)
            if not k: continue
            url = files[k].get(RES, {}).get('jpg', {}).get('url')
            if not url: continue
            data = get(url); total += len(data)
            open(os.path.join(d, m + '.jpg'), 'wb').write(data); got.append(f'{m}({len(data) // 1024}KB)')
        log.append(f'{slot}: {pick} -> ' + ' '.join(got))
    log.append(f'TOTAL {total / 1e6:.1f} MB')
    open(os.path.join(OUT, '_log.txt'), 'w').write('\n'.join(log))
    print('\n'.join(log)); print('TEXTURES DONE')

main()
