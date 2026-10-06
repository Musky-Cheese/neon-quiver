"""Turn a Meshy model packed in the browser (vertex-clustered, uint16-quantized, gzip, base64) into a game GLB.

usage: python tools/meshy_unpack.py packed.txt out.glb length_m [--orient]
       python tools/meshy_unpack.py simplified.bin out.glb length_m      (output of tools/qem.cpp; the preferred route)
  packed.txt: the browser tool's saved result (JSON [{text}] wrapping 'NQB64:<base64>:END'), or the bare base64
  length_m:   real length of the longest axis in metres (the model is rescaled to it, base at y=0, centred on x/z)
  --orient:   for boxy hulls that came out of clustering with folded double shells (Meshy vans): face every
              triangle away from the hull's centre line and drop slivers, so no surface renders inside-out
"""
import sys, json, re, gzip, base64, struct
import numpy as np

src, out, L = sys.argv[1], sys.argv[2], float(sys.argv[3])
if src.endswith('.bin'):   # tools/qem output: uint32 nv, nt, float32 pos, uint32 idx
    b = open(src, 'rb').read(); nv, nt = struct.unpack('<II', b[:8])
    q = np.frombuffer(b, np.float32, nv * 3, 8).reshape(-1, 3).copy(); idx = np.frombuffer(b, np.uint32, nt * 3, 8 + nv * 12).reshape(-1, 3).copy()
    q -= q.min(0)
else:
    t = open(src).read()
    try: t = ''.join(x.get('text', '') for x in json.loads(t))
    except Exception: pass
    m = re.search(r'NQB64:([A-Za-z0-9+/=]+):END', t); b = gzip.decompress(base64.b64decode(m.group(1) if m else t.strip().strip('"')))
    head = np.frombuffer(b[:32], np.float32); nv, ni, ext, isz = int(head[0]), int(head[1]), float(head[5]), int(head[6])
    q = np.frombuffer(b[32:32 + nv * 6], np.uint16).reshape(-1, 3).astype(np.float32) / 65535 * ext
    idx = np.array(np.frombuffer(b[32 + nv * 6:32 + nv * 6 + ni * isz], np.uint16 if isz == 2 else np.uint32).astype(np.uint32).reshape(-1, 3))
p = q * (L / (q.max(0) - q.min(0)).max())
p[:, 0] -= (p[:, 0].max() + p[:, 0].min()) / 2; p[:, 2] -= (p[:, 2].max() + p[:, 2].min()) / 2; p[:, 1] -= p[:, 1].min()
if '--orient' in sys.argv:
    c = (p[idx[:, 0]] + p[idx[:, 1]] + p[idx[:, 2]]) / 3
    fn0 = np.cross(p[idx[:, 1]] - p[idx[:, 0]], p[idx[:, 2]] - p[idx[:, 0]]); area = np.linalg.norm(fn0, axis=1)
    # outward = from the nearest point on the hull's long centre line (x axis, mid height, z=0) to the triangle
    mid = np.stack([np.clip(c[:, 0], p[:, 0].min() * 0.7, p[:, 0].max() * 0.7), np.full(len(c), p[:, 1].max() * 0.5), np.zeros(len(c))], 1)
    out_ = c - mid; flip = (fn0 * out_).sum(1) < 0
    idx[flip] = idx[flip][:, [0, 2, 1]]
    # slivers: long thin folds left where two shells were merged
    e = np.stack([np.linalg.norm(p[idx[:, k]] - p[idx[:, (k + 1) % 3]], axis=1) for k in range(3)], 1)
    keep = area / np.maximum(e.max(1) ** 2, 1e-12) > 0.02
    idx = idx[keep]; print(f'orient: flipped {flip.mean():.1%}, dropped {1 - keep.mean():.1%} slivers')
# smooth vertex normals (area weighted)
fn = np.cross(p[idx[:, 1]] - p[idx[:, 0]], p[idx[:, 2]] - p[idx[:, 0]]); n = np.zeros_like(p)
for k in range(3): np.add.at(n, idx[:, k], fn)
n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
P, N = p.astype(np.float32).tobytes(), n.astype(np.float32).tobytes()
small = nv < 65536; I = idx.astype(np.uint16 if small else np.uint32).tobytes()
pad = lambda x: x + b'\0' * (-len(x) % 4)
bin_ = pad(P) + pad(N) + pad(I)
J = {'asset': {'version': '2.0', 'generator': 'neon-quiver meshy_unpack'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
     'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2}]}],
     'buffers': [{'byteLength': len(bin_)}],
     'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(P), 'target': 34962}, {'buffer': 0, 'byteOffset': len(pad(P)), 'byteLength': len(N), 'target': 34962},
                     {'buffer': 0, 'byteOffset': len(pad(P)) + len(pad(N)), 'byteLength': len(I), 'target': 34963}],
     'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': nv, 'type': 'VEC3', 'min': p.min(0).tolist(), 'max': p.max(0).tolist()},
                   {'bufferView': 1, 'componentType': 5126, 'count': nv, 'type': 'VEC3'},
                   {'bufferView': 2, 'componentType': 5123 if small else 5125, 'count': idx.size, 'type': 'SCALAR'}]}
js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
open(out, 'wb').write(glb)
print(f'{out}: {nv} verts, {len(idx)} tris, {len(glb)//1024} KB, size {np.round(p.max(0)-p.min(0), 2).tolist()} m')
