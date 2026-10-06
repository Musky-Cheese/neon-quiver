"""Neon Quiver: turn a Meshy textured + auto-rigged character into a game zombie GLB.

Input is the bundle built in the browser by window.__nqZBundle (see claude/neon-quiver-meshy-workflow.md):
the textured mesh (positions already in the rig's metre space), Meshy's Mixamo skin weights transferred
onto it, the Mixamo inverse bind matrices, and three 1024px JPEGs (colour, metal/rough, normal).

What this does:
  1. Straightens Meshy's A-pose limbs into the game's rest pose (arms hanging, legs straight down),
     because every clip in models/zombie.glb is authored as rotations from that rest pose.
  2. Folds the 28 Mixamo bones into the game's 13 (root, pelvis, spine, neck, jaw, shoulder/elbow/hip/knee .L/.R),
     with identity rest rotations, exactly like tools/make_rig.py.
  3. Writes models/mz_<name>.glb: one skinned mesh (POSITION, NORMAL, TEXCOORD_0, COLOR_0, JOINTS_0,
     WEIGHTS_0, _PART), the 13-bone armature, the three textures, and `extras.nq` hit-volume offsets.

    python3 tools/meshy_zombie.py <bundle.b64> models/mz_walker.glb [--scale 1.08]
"""
import sys, json, struct, base64, gzip, argparse
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('bundle'); ap.add_argument('out'); ap.add_argument('--scale', type=float, default=1.08)
ap.add_argument('--arm-drop', type=float, default=1.0, help='1 = arms straight down, <1 keeps some of the A-pose')
A = ap.parse_args()

raw = gzip.decompress(base64.b64decode(open(A.bundle).read()))
hl = struct.unpack('<I', raw[:4])[0]; H = json.loads(raw[4:4 + hl]); o = 4 + hl; S = {}
for n, l in H['sections']: S[n] = raw[o:o + l]; o += l
pos = np.frombuffer(S['pos'], np.float32).reshape(-1, 3).astype(np.float64)
nrm = np.frombuffer(S['nrm'], np.float32).reshape(-1, 3).astype(np.float64)
uv = np.frombuffer(S['uv'], np.float32).reshape(-1, 2)
idx = np.frombuffer(S['idx'], np.uint32)
jnt = np.frombuffer(S['jnt'], np.uint8).reshape(-1, 4).astype(np.int64)
wgt = np.frombuffer(S['wgt'], np.uint8).reshape(-1, 4).astype(np.float64) / 255.0
names = [n.replace('mixamorig:', '') for n in H['names']]; parent = H['parent']
ibm = np.array(H['ibm'], np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)
JP = np.linalg.inv(ibm)[:, :3, 3]          # joint positions, mesh space
NB = len(names); ix = {n: i for i, n in enumerate(names)}
nv = len(pos)

# ---------- 1. repose: rotate each limb chain so it hangs straight down ----------
def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * (1 / (1 + c))
def slerp_rot(R, t):   # partial rotation (axis-angle scaled)
    ang = np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))
    if ang < 1e-6 or t >= 1: return R
    ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * np.sin(ang))
    a = ang * t; K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K
M = [np.eye(4) for _ in range(NB)]       # per-bone repose transform (mesh space)
def children(i): return [k for k in range(NB) if parent[k] == i]
def subtree(i):
    out = [i]
    for c in children(i): out += subtree(c)
    return out
def apply(i, R, pivot):
    T = np.eye(4); T[:3, :3] = R; T[:3, 3] = pivot - R @ pivot
    for k in subtree(i): M[k] = T @ M[k]
def cur(i): return (M[i] @ np.append(JP[i], 1))[:3]
DOWN = np.array([0, -1.0, 0])
for side in ('Left', 'Right'):
    for a, b, t in ((side + 'Arm', side + 'ForeArm', A.arm_drop), (side + 'ForeArm', side + 'Hand', A.arm_drop),
                    (side + 'UpLeg', side + 'Leg', 1.0), (side + 'Leg', side + 'Foot', 1.0)):
        R = slerp_rot(rot_to(cur(ix[b]) - cur(ix[a]), DOWN), t); apply(ix[a], R, cur(ix[a]))
    # keep the feet flat: undo the shin's rotation below the ankle
    f = ix[side + 'Foot']; Rf = np.linalg.inv(M[f][:3, :3]); apply(f, Rf, cur(f))
P4 = np.c_[pos, np.ones(nv)]
newp = np.zeros((nv, 3)); newn = np.zeros((nv, 3))
for c in range(4):
    Mv = np.stack(M)[jnt[:, c]]                       # nv x 4 x 4
    newp += wgt[:, c:c + 1] * np.einsum('nij,nj->ni', Mv, P4)[:, :3]
    newn += wgt[:, c:c + 1] * np.einsum('nij,nj->ni', Mv[:, :3, :3], nrm)
newn /= np.linalg.norm(newn, axis=1, keepdims=True) + 1e-12
JPn = np.array([cur(i) for i in range(NB)])

# ---------- 2. fold into the game skeleton ----------
sc = A.scale
newp *= sc; JPn *= sc
gl = lambda n: JPn[ix[n]]
# game side '.L' sits at -x (see tools/make_rig.py); Meshy's 'Right' bones are the ones at -x
SIDE = {'L': 'Right', 'R': 'Left'}
GJ = {   # name -> (position, parent)
    'root': (np.array([0.0, 0, 0]), None),
    'pelvis': (gl('Hips'), 'root'),
    'spine': (gl('Spine'), 'pelvis'),
    'neck': (gl('Neck'), 'spine'),
    'jaw': (gl('Head') + np.array([0, 0.0, 0.03]), 'neck'),
}
for g, m in SIDE.items():
    GJ['shoulder.' + g] = (gl(m + 'Arm'), 'spine'); GJ['elbow.' + g] = (gl(m + 'ForeArm'), 'shoulder.' + g)
    GJ['hip.' + g] = (gl(m + 'UpLeg'), 'pelvis'); GJ['knee.' + g] = (gl(m + 'Leg'), 'hip.' + g)
ORDER = ['root', 'pelvis', 'spine', 'neck', 'jaw', 'shoulder.L', 'elbow.L', 'shoulder.R', 'elbow.R', 'hip.L', 'knee.L', 'hip.R', 'knee.R']
GI = {n: i for i, n in enumerate(ORDER)}
def gmap(n):
    if n == 'Hips': return 'pelvis'
    if n.startswith('Spine') or n.endswith('Shoulder'): return 'spine'
    if n in ('Neck', 'Head', 'HeadTop_End', 'headfront'): return 'neck'
    for g, m in SIDE.items():
        if n == m + 'Arm': return 'shoulder.' + g
        if n.startswith(m + 'ForeArm') or n.startswith(m + 'Hand'): return 'elbow.' + g
        if n == m + 'UpLeg': return 'hip.' + g
        if n.startswith(m + 'Leg') or n.startswith(m + 'Foot') or n.startswith(m + 'Toe'): return 'knee.' + g
    raise SystemExit('unmapped bone ' + n)
B2G = np.array([GI[gmap(n)] for n in names])
GW = np.zeros((nv, len(ORDER)))
for c in range(4): np.add.at(GW, (np.arange(nv), B2G[jnt[:, c]]), wgt[:, c])
top = np.argsort(-GW, axis=1)[:, :4]
tw = np.take_along_axis(GW, top, 1); tw /= tw.sum(1, keepdims=True)
dom = top[:, 0]
PART = {'spine': 0, 'shoulder.L': 1, 'shoulder.R': 1, 'elbow.L': 2, 'elbow.R': 2, 'pelvis': 3, 'hip.L': 4, 'hip.R': 4, 'knee.L': 4, 'knee.R': 4, 'neck': 5, 'jaw': 6, 'root': 3}
part = np.array([PART[ORDER[d]] for d in dom], np.float32)

# hit volumes in each bone's local frame (rest rotations are identity, so local = world - joint)
head_c = (gl('Head') + gl('HeadTop_End')) / 2
mid_sp = (gl('Spine1') + gl('Spine2')) / 2
nq = {
    'head': list(head_c - GJ['neck'][0]),
    'chest': list(gl('Spine2') + np.array([0, 0.06 * sc, 0]) - GJ['spine'][0]),
    'core': list(mid_sp + np.array([0, 0, 0.12 * sc]) - GJ['spine'][0]),
    'foot': list(np.array([0, (gl('LeftFoot')[1] - gl('LeftLeg')[1]), 0])),
    'eyes': list(np.array([0.034 * sc, 0, 0]) + np.array([0, head_c[1] - GJ['neck'][0][1] - 0.005 * sc, 0])),
    'height': float(newp[:, 1].max()), 'hipY': float(GJ['pelvis'][0][1]),
}
# eye depth: the frontmost face point at eye height (within the head, near the centre line)
hm = (part == 5) & (np.abs(newp[:, 1] - (GJ['neck'][0][1] + nq['eyes'][1])) < 0.02) & (np.abs(newp[:, 0] - head_c[0]) < 0.05)
nq['eyes'][2] = float(newp[hm, 2].max() - GJ['neck'][0][2] - 0.012 * sc) if hm.any() else 0.08
nq = {k: ([round(float(x), 4) for x in v] if isinstance(v, list) else round(v, 4)) for k, v in nq.items()}

# ---------- 3. write the GLB ----------
bin_ = bytearray(); views = []; accs = []
def blob(data, target=None):
    while len(bin_) % 4: bin_.append(0)
    views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), **({'target': target} if target else {})}); bin_.extend(data); return len(views) - 1
def acc(arr, ctype, typ, target=None, minmax=False, norm=False):
    v = blob(arr.tobytes(), target); a = {'bufferView': v, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
    if norm: a['normalized'] = True
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
col = np.ones((nv, 4), np.float32); col[:, 3] = 0
attrs = {
    'POSITION': acc(newp.astype(np.float32), 5126, 'VEC3', 34962, True),
    'NORMAL': acc(newn.astype(np.float32), 5126, 'VEC3', 34962),
    'TEXCOORD_0': acc(np.ascontiguousarray(uv), 5126, 'VEC2', 34962),
    'COLOR_0': acc(col, 5126, 'VEC4', 34962),
    'JOINTS_0': acc(top.astype(np.uint8), 5121, 'VEC4', 34962),
    'WEIGHTS_0': acc(tw.astype(np.float32), 5126, 'VEC4', 34962),
    '_PART': acc(part.reshape(-1, 1).copy(), 5126, 'SCALAR', 34962),
}
ind = acc(idx.astype(np.uint16) if nv < 65536 else idx, 5123 if nv < 65536 else 5125, 'SCALAR', 34963)
inv = np.zeros((len(ORDER), 4, 4), np.float32)
for i, n in enumerate(ORDER): m = np.eye(4); m[:3, 3] = -GJ[n][0]; inv[i] = m.T   # column-major
ibm_acc = acc(inv.reshape(-1, 16), 5126, 'MAT4')
imgs = [{'bufferView': blob(S['img%d' % k]), 'mimeType': 'image/jpeg'} for k in range(3)]
nodes = [{'name': 'mz_mesh', 'mesh': 0, 'skin': 0}]
for n in ORDER:
    p, par = GJ[n]; t = p - (GJ[par][0] if par else 0)
    nodes.append({'name': n, 'translation': [round(float(x), 6) for x in t]})
for n in ORDER:
    kids = [1 + GI[c] for c in ORDER if GJ[c][1] == n]
    if kids: nodes[1 + GI[n]]['children'] = kids
gltf = {
    'asset': {'version': '2.0', 'generator': 'neon-quiver meshy_zombie.py'},
    'scene': 0, 'scenes': [{'nodes': [0, 1]}], 'nodes': nodes,
    'meshes': [{'name': 'mz_mesh', 'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}],
    'skins': [{'joints': [1 + i for i in range(len(ORDER))], 'inverseBindMatrices': ibm_acc, 'skeleton': 1}],
    'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicRoughnessTexture': {'index': 1}}, 'normalTexture': {'index': 2}}],
    'textures': [{'source': k, 'sampler': 0} for k in range(3)], 'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
    'images': imgs, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
    'extras': {'nq': nq},
}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((4 - len(js) % 4) % 4)
while len(bin_) % 4: bin_.append(0)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(A.out, 'wb').write(out)
cnt = np.bincount(part.astype(int), minlength=7)
print(json.dumps({'out': A.out, 'bytes': len(out), 'verts': nv, 'tris': len(idx) // 3, 'height': nq['height'], 'parts': cnt.tolist(), 'nq': nq}))
