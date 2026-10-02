"""Depth-masked diff of two near.py runs. Pixels nearer than --near metres (by the BEFORE depth map, viewmodel
   included) must match; pixels past it may differ. Exit 1 if any near pixel moved by more than --tol.
   python3 test/perf/neardiff.py BEFORE AFTER [--near 45] [--tol 0] [--exact q2,q3] [--out DIR]"""
import sys, os, argparse
import numpy as np
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('--near', type=float, default=45)
ap.add_argument('--tol', type=int, default=0); ap.add_argument('--exact', default='q2,q3', help='prefixes whose WHOLE frame must match')
ap.add_argument('--out', default=''); a = ap.parse_args()
exact = [p for p in a.exact.split(',') if p]; bad = 0; n = 0
for f in sorted(os.listdir(a.a)):
    if not (f.startswith('q') and f.endswith('.png')): continue
    pb = os.path.join(a.b, f)
    if not os.path.exists(pb): print('MISSING', f); bad += 1; continue
    A = np.asarray(Image.open(os.path.join(a.a, f)).convert('RGB')).astype(int); B = np.asarray(Image.open(pb).convert('RGB')).astype(int)
    dep = np.asarray(Image.open(os.path.join(a.a, 'd' + f[1:])))
    d = np.abs(A - B).max(axis=2); whole = any(f.startswith(p + '_') for p in exact)
    near = np.ones_like(d, bool) if whole else dep < a.near * 100
    nmax = int(d[near].max()) if near.any() else 0; nfrac = float((d[near] > a.tol).mean()) if near.any() else 0.
    far = ~near; fmax = int(d[far].max()) if far.any() else 0; ffrac = float((d[far] > 3).mean()) if far.any() else 0.
    ok = nmax <= a.tol; bad += not ok; n += 1
    print(f'{"OK  " if ok else "FAIL"} {f:28s} {"whole" if whole else "near "} {100 * near.mean():5.1f}%  max {nmax:3d}  >tol {100 * nfrac:6.3f}%   | far max {fmax:3d} changed {100 * ffrac:5.1f}%')
    if a.out and (not ok or fmax > 0):
        os.makedirs(a.out, exist_ok=True); heat = np.clip(d * 8, 0, 255).astype(np.uint8)
        mask = (near * 255).astype(np.uint8)
        Image.fromarray(np.concatenate([A, B, np.stack([heat, heat, mask // 3], 2)], 1).astype(np.uint8)).save(os.path.join(a.out, f))
print(f'{n} frames, {bad} with near-zone changes (near < {a.near} m, tol {a.tol}/255; {",".join(exact)} checked whole-frame)')
sys.exit(1 if bad else 0)
