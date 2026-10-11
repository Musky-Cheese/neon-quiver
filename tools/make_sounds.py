"""Turns the raw CC0 recordings in sounds_src/ (gitignored) into the game's sound sets: sounds/<set>_<n>.ogg + .mp3.

Run with Blender's Python, whose `aud` module decodes and encodes audio (there is no ffmpeg on this machine):
    blender -b --factory-startup --python tools/make_sounds.py

Every take is mixed to mono, has its leading silence cut (a late transient feels like input lag), its tail trimmed
and faded, and is levelled so its loudest 50 ms sits at the same short-term loudness as every other take. Per-set
balance then lives in src/audio.js, where each sound picks its own gain. A source file holding several takes in a
row is split on its silent gaps ('split'), or cut at given times ('cuts').
"""
import os, sys, glob
import numpy as np
import aud

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(root, 'sounds_src'), os.path.join(root, 'sounds')
RATE = 44100

# set -> sources. A source is a file name in sounds_src/ (glob allowed), optionally with options:
#   split: split the file into takes at silent gaps of at least this many seconds
#   cuts: [(start, end), ...] seconds to keep as separate takes
#   max: keep at most this many takes from this source
#   maxlen: cut each take to this many seconds (with a fade)
# Source files are named after their Freesound / OpenGameArt / Kenney originals: see sounds/CREDITS.md.
RECIPE = {
    # JoeDines' longbow was recorded from outside a shed: the quiet release first, the arrow striking the shed ~2 s later.
    # The release of take 1 sits too near the noise floor, so only takes 2 and 3 give a bow sound; all three give a hit.
    'bow':    [('longbow_release_*.ogg', {'maxlen': 0.8}), ('joedines_shoot_2.ogg', {'cuts': [(0.27, 0.95)]}), ('joedines_shoot_3.ogg', {'cuts': [(0.32, 1.0)]})],
    'thunk':  [('joedines_wood_impact_*.ogg', {'maxlen': 0.7}), ('joedines_target_impact_*.ogg', {'maxlen': 0.7}), ('twisted_arrow_impact.ogg', {'maxlen': 0.7}),
               ('joedines_shoot_1.ogg', {'cuts': [(1.8, 2.45)]}), ('joedines_shoot_2.ogg', {'cuts': [(2.5, 3.15)]}), ('joedines_shoot_3.ogg', {'cuts': [(2.75, 3.4)]})],
    'flesh':  [('flesh_1.ogg', {'maxlen': 0.6}), ('flesh_2.ogg', {'split': 0.4, 'maxlen': 0.5}), ('flesh_3.ogg', {'maxlen': 0.6})],
    'step':   [('kenney/Audio/footstep_concrete_*.ogg', {'maxlen': 0.4})],
    'zgroan': [('zombie_moans.ogg', {'split': 0.25, 'maxlen': 2.4}), ('tonsil5_growl_*.ogg', {'maxlen': 2.4})],
    'zpain':  [('tonsil5_pain_*.ogg', {'maxlen': 1.0})],
    'zdie':   [('tonsil5_death_*.ogg', {'maxlen': 1.8})],
}
TARGET_DB, PEAK_DB, GATE_DB = -14.0, -1.0, -42.0


def load(path):
    s = aud.Sound(path).resample(RATE, 3)
    d = np.asarray(s.data(), dtype=np.float32)
    d = d.mean(axis=1) if d.ndim == 2 else d
    return d - d.mean()


def windows_db(d, win):
    n = len(d) // win
    if n == 0: return np.array([-120.0])
    r = np.sqrt((d[:n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(r)


def split(d, gap):
    """indices of takes separated by at least `gap` s below the gate (relative to the file's loudest window)"""
    win = int(RATE * 0.01); db = windows_db(d, win); on = db > db.max() + GATE_DB + 10
    takes, start, quiet = [], None, 0
    for i, v in enumerate(on):
        if v:
            if start is None: start = i
            quiet = 0
        elif start is not None:
            quiet += 1
            if quiet * win >= gap * RATE: takes.append((start * win, (i - quiet + 1) * win)); start = None
    if start is not None: takes.append((start * win, len(d)))
    return [d[a:b + int(RATE * 0.15)] for a, b in takes if b - a > RATE * 0.03]


def clean(d, maxlen=None):
    win = int(RATE * 0.002); db = windows_db(d, win); thr = db.max() + GATE_DB
    loud = np.nonzero(db > thr)[0]
    if not len(loud): return None
    a = max(0, loud[0] * win - int(RATE * 0.003)); b = min(len(d), (loud[-1] + 1) * win + int(RATE * 0.03))
    d = d[a:b].copy()
    cut = maxlen and len(d) > maxlen * RATE
    if cut: d = d[:int(maxlen * RATE)]
    fi, fo = int(RATE * 0.002), min(int(RATE * (0.2 if cut else 0.04)), len(d) // 4)   # a cut-short voice dies away, not clicks off
    d[:fi] *= np.linspace(0, 1, fi); d[-fo:] *= np.linspace(1, 0, fo)
    st = windows_db(d, int(RATE * 0.05)).max()
    d *= 10 ** ((TARGET_DB - st) / 20)
    pk = np.abs(d).max(); lim = 10 ** (PEAK_DB / 20)
    if pk > lim: d *= lim / pk
    return d


def write(d, base):
    s = aud.Sound.buffer(d.reshape(-1, 1).astype(np.float32), RATE)
    s.write(base + '.ogg', RATE, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_OGG, aud.CODEC_VORBIS, 128000)
    s.write(base + '.mp3', RATE, aud.CHANNELS_MONO, aud.FORMAT_S16, aud.CONTAINER_MP3, aud.CODEC_MP3, 128000)


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, '*_*.ogg')) + glob.glob(os.path.join(OUT, '*_*.mp3')): os.remove(f)
    for name, sources in RECIPE.items():
        n = 0
        for pat, opt in sources:
            files = sorted(glob.glob(os.path.join(SRC, pat)))
            if not files: print('  missing', pat); continue
            for path in files:
                d = load(path)
                takes = [d[int(a * RATE):int(b * RATE)] for a, b in opt['cuts']] if 'cuts' in opt else split(d, opt['split']) if 'split' in opt else [d]
                for t in takes[:opt.get('max', 99)]:
                    t = clean(t, opt.get('maxlen'))
                    if t is None: continue
                    n += 1; write(t, os.path.join(OUT, '%s_%d' % (name, n)))
                    print('  %s_%d  %.2fs  <- %s' % (name, n, len(t) / RATE, os.path.basename(path)))
        print(name, n, 'takes')


main()
