"""Pixel diff of two shots.py runs. Exit 1 if any image changed beyond float noise.
   python3 test/perf/diff.py BEFORE AFTER [--out DIFFDIR]"""
import sys, os, argparse
import numpy as np
from PIL import Image
ap = argparse.ArgumentParser(); ap.add_argument('a'); ap.add_argument('b'); ap.add_argument('--out', default=''); ap.add_argument('--tol', type=int, default=3)
ap.add_argument('--frac', type=float, default=0.0005); a = ap.parse_args()
bad = 0; rows = []
for f in sorted(os.listdir(a.a)):
    if not f.endswith('.png'): continue
    pb = os.path.join(a.b, f)
    if not os.path.exists(pb): print('MISSING', f); bad += 1; continue
    A = np.asarray(Image.open(os.path.join(a.a, f)).convert('RGB')).astype(int); B = np.asarray(Image.open(pb).convert('RGB')).astype(int)
    if A.shape != B.shape: print('SIZE', f, A.shape, B.shape); bad += 1; continue
    d = np.abs(A - B).max(axis=2); frac = float((d > a.tol).mean()); mx = int(d.max()); mean = float(d.mean())
    changed = frac > a.frac
    rows.append((f, mx, mean, frac, changed)); bad += changed
    if changed and a.out:
        os.makedirs(a.out, exist_ok=True)
        heat = np.clip(d * 8, 0, 255).astype(np.uint8)
        Image.fromarray(np.concatenate([A, B, np.stack([heat] * 3, 2)], 1).astype(np.uint8)).save(os.path.join(a.out, f))
for f, mx, mean, frac, ch in rows:
    if ch or mx > 0: print(f'{"CHANGED" if ch else "noise  "} {f:40s} max {mx:3d}  mean {mean:.3f}  >tol {frac * 100:.3f}%')
print(f'{len(rows)} images, {bad} changed (tol {a.tol}/255 on more than {a.frac * 100:.2f}% of pixels)')
sys.exit(1 if bad else 0)
