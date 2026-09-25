"""Shrink models/zombie.glb for the web.

- decimates each part with quadric half-edge collapses (keeps sculpt silhouette, vertex colours and skin weights)
- quantizes attributes (KHR_mesh_quantization): normals int8, colour/weights uint8, animation rotations int16
- drops constant animation channels (scale everywhere, translation on every bone but the pelvis)

usage: python tools/optimize_glb.py models/zombie.glb models/zombie.glb [keep_ratio]
"""
import json, struct, sys, heapq
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    J = json.loads(b[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack('<I', b[o:o + 4])[0]
    return J, b[o + 8:o + 8 + bl]


def get(J, B, i):
    a = J['accessors'][i]; v = J['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]; n = NC[a['type']]; cnt = a['count']
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = v.get('byteStride', 0) or np.dtype(dt).itemsize * n
    raw = np.frombuffer(B, dtype=np.uint8, count=stride * (cnt - 1) + np.dtype(dt).itemsize * n, offset=off)
    arr = np.lib.stride_tricks.as_strided(raw, shape=(cnt, np.dtype(dt).itemsize * n), strides=(stride, 1)).copy().view(dt).reshape(cnt, n)
    if a.get('normalized'):
        mx = float(np.iinfo(dt).max); arr = np.maximum(arr.astype(np.float32) / mx, -1.0)
    return arr


def quadrics(P, F):
    Q = np.zeros((len(P), 4, 4))
    v0, v1, v2 = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    n = np.cross(v1 - v0, v2 - v0); ln = np.linalg.norm(n, axis=1, keepdims=True); ln[ln == 0] = 1; n /= ln
    d = -np.einsum('ij,ij->i', n, v0)
    p = np.concatenate([n, d[:, None]], 1)
    K = np.einsum('ij,ik->ijk', p, p)
    for c in range(3): np.add.at(Q, F[:, c], K)
    return Q


def decimate(P, F, keep):
    """half-edge collapse: vertex u merges into v (v survives). Returns new faces and surviving vertex mask."""
    nv = len(P); target = int(len(F) * keep)
    Q = quadrics(P, F)
    faces = [list(f) for f in F]; alive_f = [True] * len(F)
    vf = [set() for _ in range(nv)]
    for i, f in enumerate(faces):
        for x in f: vf[x].add(i)
    # boundary edges (count 1) are locked by heavy penalty
    from collections import Counter
    ec = Counter()
    for f in faces:
        for a, b in ((f[0], f[1]), (f[1], f[2]), (f[2], f[0])): ec[(min(a, b), max(a, b))] += 1
    bnd = np.zeros(nv, bool)
    for (a, b), c in ec.items():
        if c == 1: bnd[a] = bnd[b] = True
    alive_v = np.ones(nv, bool); ver = [0] * nv
    def cost(u, v):
        if bnd[u]: return None
        q = Q[u] + Q[v]; h = np.append(P[v], 1.0)
        return float(h @ q @ h)
    heap = []
    for (a, b) in ec:
        for u, v in ((a, b), (b, a)):
            c = cost(u, v)
            if c is not None: heapq.heappush(heap, (c, u, v, ver[u], ver[v]))
    nf = len(F)
    def fnorm(f):
        a, b, c = P[f[0]], P[f[1]], P[f[2]]; n = np.cross(b - a, c - a); l = np.linalg.norm(n); return n / l if l > 0 else n
    while nf > target and heap:
        c, u, v, vu, vv = heapq.heappop(heap)
        if not (alive_v[u] and alive_v[v]) or ver[u] != vu or ver[v] != vv: continue
        # faces shared by u and v disappear; others around u are re-pointed to v; reject flips
        shared = vf[u] & vf[v]
        if not shared: continue
        ok = True
        for fi in vf[u] - shared:
            f = faces[fi]; nf0 = fnorm(f); g = [v if x == u else x for x in f]
            if len(set(g)) < 3: ok = False; break
            nf1 = fnorm(g)
            if np.dot(nf0, nf1) < 0.2: ok = False; break
        if not ok: continue
        # link condition: shared neighbours must be exactly the two opposite verts of the shared faces
        nu = set(x for fi in vf[u] for x in faces[fi]); nvv = set(x for fi in vf[v] for x in faces[fi])
        if len((nu & nvv) - {u, v}) != len(shared): continue
        for fi in shared:
            alive_f[fi] = False; nf -= 1
            for x in faces[fi]:
                if x != u: vf[x].discard(fi)
        for fi in vf[u] - shared:
            faces[fi] = [v if x == u else x for x in faces[fi]]; vf[v].add(fi)
        vf[u] = set(); alive_v[u] = False
        Q[v] += Q[u]; ver[v] += 1
        for w in nvv | nu:
            if w == v or not alive_v[w]: continue
            ver[w] += 1
            for a, b in ((w, v), (v, w)):
                cc = cost(a, b)
                if cc is not None: heapq.heappush(heap, (cc, a, b, ver[a], ver[b]))
    Fo = np.array([faces[i] for i in range(len(faces)) if alive_f[i]], dtype=np.int64)
    return Fo, alive_v


def main(src, dst, keep=0.5):
    J, B = read_glb(src)
    out = bytearray(); views = []; accs = []
    def add(arr, ctype, typ, target=None, normalized=False, minmax=False, stride=None):
        while len(out) % 4: out.append(0)
        raw = arr.tobytes()
        view = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(raw)}
        if target: view['target'] = target
        if stride: view['byteStride'] = stride
        out.extend(raw); views.append(view)
        a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax:
            f = arr.reshape(arr.shape[0], -1).astype(np.float64)
            a['min'] = f.min(0).tolist(); a['max'] = f.max(0).tolist()
        accs.append(a); return len(accs) - 1
    tris0 = tris1 = 0
    for m in J['meshes']:
        for pr in m['primitives']:
            at = pr['attributes']
            P = get(J, B, at['POSITION']).astype(np.float64); N = get(J, B, at['NORMAL'])
            C = get(J, B, at['COLOR_0']); Jn = get(J, B, at['JOINTS_0']); W = get(J, B, at['WEIGHTS_0'])
            F = get(J, B, pr['indices']).reshape(-1, 3).astype(np.int64)
            tris0 += len(F)
            k = keep if len(F) > 900 else min(1.0, keep + 0.25)
            F2, alive = decimate(P, F, k) if k < 1 else (F, np.ones(len(P), bool))
            used = np.zeros(len(P), bool); used[F2.ravel()] = True
            remap = -np.ones(len(P), np.int64); remap[used] = np.arange(used.sum())
            F2 = remap[F2]; tris1 += len(F2)
            P2 = P[used].astype(np.float32)
            N2 = N[used]; N2 = N2 / np.maximum(np.linalg.norm(N2, axis=1, keepdims=True), 1e-6)
            Nq = np.zeros((len(N2), 4), np.int8); Nq[:, :3] = np.round(N2 * 127).astype(np.int8)
            Cq = np.round(np.clip(C[used], 0, 1) * 255).astype(np.uint8)
            Jq = Jn[used].astype(np.uint8)
            W2 = W[used]; W2 = W2 / np.maximum(W2.sum(1, keepdims=True), 1e-6)
            Wq = np.floor(W2 * 255).astype(np.int32)
            Wq[np.arange(len(Wq)), W2.argmax(1)] += 255 - Wq.sum(1)       # weights must sum to exactly 255
            Wq = Wq.astype(np.uint8)
            newat = {}
            newat['POSITION'] = add(P2, 5126, 'VEC3', 34962, minmax=True)
            newat['NORMAL'] = add(Nq, 5120, 'VEC3', 34962, normalized=True, stride=4)
            accs[-1]['count'] = len(Nq); views[-1]['byteStride'] = 4
            # NORMAL accessor must describe 3 of the 4 packed bytes
            newat['COLOR_0'] = add(Cq, 5121, 'VEC4', 34962, normalized=True)
            newat['JOINTS_0'] = add(Jq, 5121, 'VEC4', 34962)
            newat['WEIGHTS_0'] = add(Wq, 5121, 'VEC4', 34962, normalized=True)
            pr['attributes'] = newat
            pr['indices'] = add(F2.astype(np.uint16).ravel()[:, None], 5123, 'SCALAR', 34963)
    # skins
    for s in J['skins']:
        s['inverseBindMatrices'] = add(get(J, B, s['inverseBindMatrices']).astype(np.float32), 5126, 'MAT4')
    # animation: drop constant channels, quantize rotations
    an = J['animations'][0]; nodes = J['nodes']
    chans, samps = [], []
    tcache = {}
    for ch in an['channels']:
        name = nodes[ch['target']['node']].get('name', ''); path = ch['target']['path']
        s = an['samplers'][ch['sampler']]
        vals = get(J, B, s['output'])
        if path == 'scale' and np.allclose(vals, 1, atol=1e-4): continue
        if path == 'translation' and (name != 'pelvis' and np.ptp(vals, axis=0).max() < 1e-4): continue
        if s['input'] not in tcache: tcache[s['input']] = add(get(J, B, s['input']).astype(np.float32), 5126, 'SCALAR', minmax=True)
        if path == 'rotation':
            o = add(np.round(np.clip(vals, -1, 1) * 32767).astype(np.int16), 5122, 'VEC4', normalized=True)
        else:
            o = add(vals.astype(np.float32), 5126, 'VEC3')
        samps.append({'input': tcache[s['input']], 'output': o, 'interpolation': s.get('interpolation', 'LINEAR')})
        chans.append({'sampler': len(samps) - 1, 'target': ch['target']})
    an['channels'] = chans; an['samplers'] = samps
    J['accessors'] = accs; J['bufferViews'] = views
    J['buffers'] = [{'byteLength': len(out)}]
    J['extensionsUsed'] = sorted(set(J.get('extensionsUsed', []) + ['KHR_mesh_quantization']))
    J['extensionsRequired'] = sorted(set(J.get('extensionsRequired', []) + ['KHR_mesh_quantization']))
    js = json.dumps(J, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(out) % 4: out.append(0)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    open(dst, 'wb').write(glb)
    print(f'triangles {tris0} -> {tris1}; channels {len(chans)}; bytes {len(glb)}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.5)
