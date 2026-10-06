"""Neon Quiver: pack a rigged Meshy GLB (Mixamo-named skeleton, embedded textures) into the bundle tools/meshy_zombie.py reads.

This is the local stand-in for the browser bundler (window.__nqZBundle): the same sections, built straight from the
GLB Meshy's auto-rigger downloads, so there is no weight transfer to do (the textured mesh is the skinned mesh).

  1. python tools/meshy_glb_bundle.py extract Meshy_Rigged.glb work/            -> work/img0.png (colour), img1 (metal/rough), img2 (normal)
  2. shrink those to 1024 px JPEGs as work/img0.jpg ... (any tool; the game reads colour + normal)
  3. python tools/meshy_glb_bundle.py bundle  Meshy_Rigged.glb work/ work/alpha.b64 [--height 1.7]
  4. python tools/meshy_zombie.py work/alpha.b64 models/mz_alpha.glb

The mesh is rescaled to --height metres (1.7, the bundler's rig space: meshy_zombie.py's --scale 1.08 makes 1.836),
feet on y = 0, centred on x/z, facing +z.
"""
import sys, os, json, struct, base64, gzip
import numpy as np

def load_glb(path):
    b = open(path, 'rb').read()
    assert struct.unpack('<I', b[:4])[0] == 0x46546C67, 'not a GLB'
    o, J, BIN = 12, None, b''
    while o < len(b):
        n, t = struct.unpack('<II', b[o:o + 8]); c = b[o + 8:o + 8 + n]; o += 8 + n
        if t == 0x4E4F534A: J = json.loads(c)
        elif t == 0x004E4942: BIN = c
    return J, BIN

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def accessor(J, BIN, i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); nc = NC[a['type']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', 0) or dt.itemsize * nc
    raw = np.frombuffer(BIN, np.uint8, stride * (a['count'] - 1) + dt.itemsize * nc, off)
    out = np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * nc), (stride, 1)).copy().view(dt).reshape(a['count'], nc)
    if a.get('normalized'): out = out.astype(np.float64) / np.iinfo(dt).max
    return out

def image_bytes(J, BIN, tex):
    img = J['images'][J['textures'][tex['index']]['source']]; v = J['bufferViews'][img['bufferView']]
    o = v.get('byteOffset', 0); return BIN[o:o + v['byteLength']], img.get('mimeType', 'image/png')

def skinned(J):
    for ni, n in enumerate(J['nodes']):
        if 'mesh' in n and 'skin' in n: return ni, n
    raise SystemExit('no skinned mesh in this GLB: download the rigged model')

cmd, src = sys.argv[1], sys.argv[2]
J, BIN = load_glb(src)
_, node = skinned(J)
mesh = J['meshes'][node['mesh']]
mat = J['materials'][mesh['primitives'][0].get('material', 0)]
pbr = mat.get('pbrMetallicRoughness', {})
texs = [pbr.get('baseColorTexture'), pbr.get('metallicRoughnessTexture'), mat.get('normalTexture')]

if cmd == 'extract':
    out = sys.argv[3]; os.makedirs(out, exist_ok=True)
    for k, t in enumerate(texs):
        if not t: print('img%d: none' % k); continue
        data, mime = image_bytes(J, BIN, t); ext = 'jpg' if 'jpeg' in mime else 'png'
        open(os.path.join(out, 'src%d.%s' % (k, ext)), 'wb').write(data); print('img%d: %s %d KB' % (k, mime, len(data) // 1024))
    sys.exit()

work, dst = sys.argv[3], sys.argv[4]
H = float(sys.argv[sys.argv.index('--height') + 1]) if '--height' in sys.argv else 1.7
# one primitive per mesh is what Meshy writes; merge them anyway
P, N, UV, JN, WT, IDX = [], [], [], [], [], []; base = 0
for pr in mesh['primitives']:
    A = pr['attributes']
    p = accessor(J, BIN, A['POSITION']).astype(np.float64)
    P.append(p); N.append(accessor(J, BIN, A['NORMAL']).astype(np.float64)); UV.append(accessor(J, BIN, A['TEXCOORD_0']).astype(np.float32))
    JN.append(accessor(J, BIN, A['JOINTS_0']).astype(np.int64)); WT.append(accessor(J, BIN, A['WEIGHTS_0']).astype(np.float64))
    IDX.append(accessor(J, BIN, pr['indices']).reshape(-1).astype(np.uint32) + base); base += len(p)
pos, nrm, uv, jnt, wgt, idx = map(np.concatenate, (P, N, UV, JN, WT, IDX))
if wgt.max() > 1.5: wgt = wgt / 255.0
skin = J['skins'][node['skin']]; joints = skin['joints']
ibm = accessor(J, BIN, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)   # row-major now
names = [J['nodes'][j].get('name', 'j%d' % k) for k, j in enumerate(joints)]
jix = {j: k for k, j in enumerate(joints)}
par = {}
for ni, n in enumerate(J['nodes']):
    for c in n.get('children', []): par[c] = ni
parent = [jix.get(par.get(j), -1) for j in joints]
JP = np.linalg.inv(ibm)[:, :3, 3]   # joint positions in the mesh's bind space

# normalise: feet on the ground, centred, H metres tall
lo, hi = pos.min(0), pos.max(0); h = hi[1] - lo[1]
up = int(np.argmax(hi - lo))
assert up == 1, 'expected a y-up character, got the tallest axis %d' % up
s = H / h; c = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
pos = (pos - c) * s; JP = (JP - c) * s
# facing: the toes should point +z
bn = [n.replace('mixamorig:', '') for n in names]
if 'LeftToeBase' in bn and 'LeftFoot' in bn and JP[bn.index('LeftToeBase'), 2] < JP[bn.index('LeftFoot'), 2]:
    pos[:, [0, 2]] *= -1; nrm[:, [0, 2]] *= -1; JP[:, [0, 2]] *= -1; print('turned 180 degrees to face +z')
ibm_n = np.repeat(np.eye(4)[None], len(JP), 0); ibm_n[:, :3, 3] = -JP   # translation-only binds (meshy_zombie.py reads joint positions only)

# keep the 4 strongest influences as uint8, renormalised
top = np.argsort(-wgt, axis=1)[:, :4]; tw = np.take_along_axis(wgt, top, 1); tj = np.take_along_axis(jnt, top, 1)
tw /= np.maximum(tw.sum(1, keepdims=True), 1e-9)
w8 = np.round(tw * 255).astype(np.int64); w8[:, 0] += 255 - w8.sum(1)

sections = [('pos', pos.astype(np.float32).tobytes()), ('nrm', nrm.astype(np.float32).tobytes()), ('uv', np.ascontiguousarray(uv).tobytes()),
            ('idx', idx.astype(np.uint32).tobytes()), ('jnt', tj.astype(np.uint8).tobytes()), ('wgt', w8.astype(np.uint8).tobytes())]
for k in range(3):
    f = os.path.join(work, 'img%d.jpg' % k)
    if os.path.exists(f): sections.append(('img%d' % k, open(f, 'rb').read()))
head = {'names': names, 'parent': parent, 'ibm': ibm_n.transpose(0, 2, 1).reshape(-1).tolist(), 'sections': [[n, len(d)] for n, d in sections]}
hb = json.dumps(head).encode()
raw = struct.pack('<I', len(hb)) + hb + b''.join(d for _, d in sections)
open(dst, 'w').write(base64.b64encode(gzip.compress(raw)).decode())
print(json.dumps({'verts': len(pos), 'tris': len(idx) // 3, 'bones': len(names), 'height_in': round(float(h), 3), 'images': [n for n, _ in sections if n.startswith('img')], 'names': bn}))
