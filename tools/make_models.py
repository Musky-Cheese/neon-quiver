# Neon Quiver — character model generator for Blender (tested design for 4.x/5.x API)
# Builds zombie body parts, brute armor, boss growths and cyber gauntlets with
# Skin + Subdivision + Voxel Remesh + Smooth modifiers, sculpts details with noise,
# decimates, paints vertex masks (AO / cloth / blood / emissive) and exports JSON.
#
# Run inside Blender's Python console:
#   exec(open(r"C:\Users\fouad\Downloads\neon-quiver\tools\make_models.py").read())
#
# Coordinate convention: Y is up, +Z is the direction a zombie faces (game space).

import bpy, bmesh, json, math, os, random, time, traceback
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

OUT = globals().get("NQ_OUT") or r"C:\Users\fouad\Downloads\neon-quiver\tools\sculpts"
os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    LOG.append(' '.join(str(x) for x in a))
    try:
        with open(os.path.join(OUT, '_log.txt'), 'w') as f: f.write('\n'.join(LOG))
    except Exception: pass

random.seed(7)
V = Vector
def clamp(x, a, b): return a if x < a else b if x > b else x
def smooth01(x): x = clamp(x, 0, 1); return x * x * (3 - 2 * x)
def gauss(d, r): return math.exp(-(d / r) ** 2)
def n3(p, s, seed=0.0):
    return noise.noise(V((p.x * s + seed * 7.1, p.y * s + seed * 3.3, p.z * s + seed * 1.7)))
def fbm(p, s, oct=3, seed=0.0):
    t, a, f = 0.0, 1.0, 1.0
    for i in range(oct):
        t += a * n3(p, s * f, seed + i * 11.0); a *= 0.5; f *= 2.03
    return t

COLL = None
def scene_setup():
    global COLL
    name = 'NQ_build'
    COLL = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if COLL.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(COLL)
    for o in list(COLL.objects): bpy.data.objects.remove(o, do_unlink=True)

def link(ob): COLL.objects.link(ob); return ob

def mesh_obj(name, me): return link(bpy.data.objects.new(name, me))

def evaluated_mesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    return bpy.data.meshes.new_from_object(ev)

# ---------- base shapes ----------
def skin_obj(name, verts, edges, radii, subsurf=2, voxel=0.006, smooth_iter=6):
    """Skeleton (verts/edges + radius per vertex) -> chain of overlapping spheres -> voxel remesh (union) -> smooth.
    Same idea as a Skin-modifier base mesh, but with exact radii."""
    bm = bmesh.new()
    def rad(r): return r if not isinstance(r, (tuple, list)) else r[0]
    def sphere_at(c, r):
        tmp = bmesh.new()
        try: bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=r)
        except TypeError: bmesh.ops.create_icosphere(tmp, subdivisions=2, diameter=r)
        bmesh.ops.translate(tmp, verts=tmp.verts[:], vec=V(c))
        m = bpy.data.meshes.new('tmp'); tmp.to_mesh(m); tmp.free(); bm.from_mesh(m); bpy.data.meshes.remove(m)
    for (i, j) in edges:
        a, b = V(verts[i]), V(verts[j]); ra, rb = rad(radii[i]), rad(radii[j])
        L = (b - a).length; n = max(1, int(L / (0.3 * max(0.002, min(ra, rb)))))
        for k in range(n + 1):
            t = k / n; sphere_at(a.lerp(b, t), ra + (rb - ra) * t)
    me = bpy.data.meshes.new(name + '_chain'); bm.to_mesh(me); bm.free()
    ob = mesh_obj(name + '_src', me)
    rm = ob.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.6; sm.iterations = smooth_iter
    return ob

def ico_obj(name, radius=1.0, subdiv=5):
    bm = bmesh.new()
    try: bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    except TypeError: bmesh.ops.create_icosphere(bm, subdivisions=subdiv, diameter=radius)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return mesh_obj(name + '_src', me)

def remesh_from_mesh(name, me, voxel, smooth_iter=4):
    ob = mesh_obj(name + '_rm', me)
    rm = ob.modifiers.new('rm', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel
    sm = ob.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.5; sm.iterations = smooth_iter
    return ob

def join_meshes(name, mes):
    bm = bmesh.new()
    for me in mes: bm.from_mesh(me)
    out = bpy.data.meshes.new(name); bm.to_mesh(out); bm.free()
    return out

def displace(me, fn):
    """fn(p, n) -> offset along normal."""
    bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * fn(v.co.copy(), v.normal.copy())
    bm.to_mesh(me); bm.free(); me.update()
    return me

def deform(me, fn):
    """fn(p) -> new p."""
    bm = bmesh.new(); bm.from_mesh(me)
    for v in bm.verts: v.co = fn(v.co.copy())
    bm.to_mesh(me); bm.free(); me.update()
    return me

def decimate(name, me, target_tris):
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if tris <= target_tris: return me
    ob = mesh_obj(name + '_dec', me)
    d = ob.modifiers.new('dec', 'DECIMATE'); d.decimate_type = 'COLLAPSE'; d.ratio = max(0.02, target_tris / tris)
    return evaluated_mesh(ob)

def noisy_blob(center, radius, seed=0.0, irregularity=0.16, subdiv=3, freq=18):
    """A jittered sphere used as a boolean cutter: an actual missing chunk of flesh,
    not a smooth sphere, so the carved rim reads as torn rather than surgical.
    Kept gentle (low amplitude relative to radius, low-ish frequency, and displaced
    inward-only) so the cutter stays manifold and doesn't self-intersect and wreck
    the boolean into spikes/slivers."""
    bm = bmesh.new()
    try: bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    except TypeError: bmesh.ops.create_icosphere(bm, subdivisions=subdiv, diameter=radius)
    me = bpy.data.meshes.new('blob'); bm.to_mesh(me); bm.free()
    # bias the noise to mostly-positive (0..1-ish) so the cutter only ever grows outward from
    # its base sphere a little; never pulls a vertex past its neighbours into a self-intersection
    displace(me, lambda p, n: radius * irregularity * (0.5 + 0.5 * fbm(p, freq, 2, seed)))
    deform(me, lambda p: p + V(center))
    return me

def carve(me, name, cutter_meshes):
    """Boolean-subtract cutter_meshes from me: a real hole/missing chunk, not a shader trick."""
    ob = mesh_obj(name + '_carve', me)
    cut_obs = []
    for i, cme in enumerate(cutter_meshes):
        cob = mesh_obj(name + '_cut%d' % i, cme); cut_obs.append(cob)
        mod = ob.modifiers.new('cut%d' % i, 'BOOLEAN'); mod.operation = 'DIFFERENCE'
        try: mod.solver = 'EXACT'
        except Exception: pass
        mod.object = cob
    result = evaluated_mesh(ob)
    for cob in cut_obs: bpy.data.objects.remove(cob, do_unlink=True)
    return result

def fuse(me, name, addon_meshes):
    """Boolean-union addon_meshes onto me: geometry that actually pokes out past the original
    silhouette (a jagged bone shard, a protruding rib), which is what reads in a dark, backlit
    scene where a recessed crater alone is invisible."""
    ob = mesh_obj(name + '_fuse', me)
    add_obs = []
    for i, ame in enumerate(addon_meshes):
        aob = mesh_obj(name + '_add%d' % i, ame); add_obs.append(aob)
        mod = ob.modifiers.new('add%d' % i, 'BOOLEAN'); mod.operation = 'UNION'
        try: mod.solver = 'EXACT'
        except Exception: pass
        mod.object = aob
    result = evaluated_mesh(ob)
    for aob in add_obs: bpy.data.objects.remove(aob, do_unlink=True)
    return result

def rib_bone(anchor, aim, length, r0=0.009, r1=0.003, curve=0.0, seed=0, segs=4):
    """A thin curved bone/rib shard from anchor, extending `length` along the normalized `aim`
    direction, tapering from r0 to r1, with a slight sideways `curve`. Used to fuse a protruding
    broken-bone shape onto a wound instead of relying on a texture or a recessed dent."""
    aim = V(aim).normalized()
    side = aim.orthogonal().normalized()
    verts, radii = [], []
    for i in range(segs):
        t = i / (segs - 1)
        p = V(anchor) + aim * (length * t) + side * (curve * t * t)
        verts.append((p.x, p.y, p.z))
        radii.append(r0 + (r1 - r0) * t)
    edges = [(i, i + 1) for i in range(segs - 1)]
    ob = skin_obj('rib', verts, edges, radii, 2, 0.0018, 3)
    me = evaluated_mesh(ob)
    displace(me, lambda p, n: 0.0012 * fbm(p, 90, 2, seed))
    return me

# ---------- masks + export ----------
def export(name, me, maskfn, ao_dist=0.06, ao_strength=0.75, rays=12, emissive_parts=None):
    """maskfn(p, n) -> (cloth, blood, emissive, bright). emissive_parts: list of (mesh, emissive_value) appended unlit."""
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    rnd = random.Random(1)
    dirs = []
    for i in range(rays):
        # fibonacci hemisphere-ish directions
        z = 1 - (i + 0.5) / rays; r = math.sqrt(max(0, 1 - z * z)); a = i * 2.39996
        dirs.append(V((math.cos(a) * r, math.sin(a) * r, z)))
    pos, nor, col, emi, idx = [], [], [], [], []
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        p, n = v.co, v.normal.normalized()
        # AO: rays in the hemisphere around n
        t = n.orthogonal().normalized(); b = n.cross(t)
        hits = 0
        for d in dirs:
            w = (t * d.x + b * d.y + n * d.z).normalized()
            h = bvh.ray_cast(p + n * 0.0015, w, ao_dist)
            if h[0] is not None: hits += 1
        ao = 1.0 - ao_strength * hits / rays
        cloth, blood, em, bright = maskfn(p, n)
        ao = clamp(ao * bright, 0, 1)
        pos += [round(p.x, 4), round(p.y, 4), round(p.z, 4)]
        nor += [round(n.x, 3), round(n.y, 3), round(n.z, 3)]
        col += [int(ao * 255), int(clamp(cloth, 0, 1) * 255), int(clamp(blood, 0, 1) * 255)]
        emi.append(int(clamp(em, 0, 1) * 255))
    for f in bm.faces: idx += [v.index for v in f.verts]
    base = len(pos) // 3
    bm.free()
    for (pm, ev) in (emissive_parts or []):
        b2 = bmesh.new(); b2.from_mesh(pm); bmesh.ops.triangulate(b2, faces=b2.faces[:]); b2.normal_update()
        b2.verts.ensure_lookup_table()
        for v in b2.verts:
            pos += [round(v.co.x, 4), round(v.co.y, 4), round(v.co.z, 4)]
            nn = v.normal.normalized(); nor += [round(nn.x, 3), round(nn.y, 3), round(nn.z, 3)]
            col += [255, 0, 0]; emi.append(int(ev * 255))
        for f in b2.faces: idx += [base + v.index for v in f.verts]
        base += len(b2.verts); b2.free()
    data = {'name': name, 'pos': pos, 'nor': nor, 'col': col, 'emi': emi, 'idx': idx}
    with open(os.path.join(OUT, name + '.json'), 'w') as f: json.dump(data, f, separators=(',', ':'))
    log('exported', name, 'verts', len(pos) // 3, 'tris', len(idx) // 3)

def small_sphere(center, r, subdiv=2):
    bm = bmesh.new()
    try: bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    except TypeError: bmesh.ops.create_icosphere(bm, subdivisions=subdiv, diameter=r)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=V(center))
    me = bpy.data.meshes.new('ss'); bm.to_mesh(me); bm.free(); return me

def box_mesh(center, size, bevel=0.0, segs=2):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=V(size), verts=bm.verts[:])
    if bevel > 0:
        try: bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=bevel, segments=segs, affect='EDGES', profile=0.5)
        except TypeError: bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=bevel, segments=segs, vertex_only=False, profile=0.5)
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=V(center))
    me = bpy.data.meshes.new('bx'); bm.to_mesh(me); bm.free(); return me

# ================= ZOMBIE PARTS =================
# Realism pass: anatomical masses (deltoids, pecs, scapulae, quads, calves), clothing with real
# thickness, hems, collars and torn flaps, four head types, sculpted riot gear with a gas mask.
EYES = [V((-0.042, 0.168, 0.092)), V((0.042, 0.168, 0.092))]
HEAD_C, HEAD_R = V((0, 0.155, 0.01)), V((0.094, 0.122, 0.108))

def chain_dist(p, pts):
    """signed distance to a chain of spheres [(center, r), ...] (negative inside)"""
    best = 1e9
    for i in range(len(pts) - 1):
        a, ra = pts[i]; b, rb = pts[i + 1]
        ab = b - a; L2 = max(1e-9, ab.dot(ab)); t = clamp((p - a).dot(ab) / L2, 0, 1)
        best = min(best, (p - (a + ab * t)).length - (ra + (rb - ra) * t))
    return best

def _hair_clumps():
    rnd = random.Random(33); out = [[(V((0, 0.235, 0.02)), 0.07), (V((0, 0.215, -0.04)), 0.078), (V((0, 0.16, -0.075)), 0.072)]]   # crown, lying on the scalp
    n = 18
    for i in range(n):
        a = math.radians(58 + (360 - 116) * i / (n - 1) + rnd.uniform(-5, 5))   # skip the face (front +-58 deg)
        s, c = math.sin(a), math.cos(a); j = rnd.uniform(-0.012, 0.012); L = rnd.uniform(0.0, 0.07)
        out.append([(V((s * 0.083, 0.215, 0.01 + c * 0.092)), 0.03), (V((s * 0.104 + j, 0.125, 0.0 + c * 0.108)), 0.022),
                    (V((s * 0.1 + j, 0.03 - L * 0.4, c * 0.1 - 0.02)), 0.017), (V((s * 0.092 + j * 1.5, -0.04 - L, c * 0.088 - 0.04)), 0.009)])
    return out
LONG_HAIR = _hair_clumps()

def build_head(variant):
    """a: bald, caved scalp wound  b: patchy hair  c: long matted hair, finer features  d: torn cheek, missing eye"""
    ob = ico_obj('head', 1.0, 5)
    me = evaluated_mesh(ob)
    fine = variant == 'c'
    def shape(p):
        d = p.normalized()
        q = V((HEAD_C.x + d.x * HEAD_R.x * (0.94 if fine else 1.0), HEAD_C.y + d.y * HEAD_R.y, HEAD_C.z + d.z * HEAD_R.z))
        if q.y < 0.11: q.x *= (0.78 if fine else 0.84) + 0.18 * smooth01((q.y - 0.04) / 0.07)   # jaw taper
        if q.z < -0.04: q.z = -0.04 + (q.z + 0.04) * 0.9
        if q.y < 0.06 and q.z > 0.0: q.z += 0.012 * smooth01((0.06 - q.y) / 0.03) * smooth01(1 - abs(q.x) / 0.05)   # chin
        return q
    deform(me, shape)
    def sculpt(p, n):
        o = 0.0
        front = smooth01((p.z - 0.03) / 0.05)
        for i, e in enumerate(EYES):
            de = (p - e).length
            deep = 0.036 if (variant == 'd' and i == 0) else 0.027
            o -= deep * gauss(de, 0.03)                                                  # sockets
            if not (variant == 'd' and i == 0):
                o += 0.0045 * gauss(de - 0.026, 0.006)                                   # eyelid rims
            o += 0.004 * gauss((p - (e + V((0, -0.024, 0.004)))).length, 0.012)          # under-eye bags
        o += 0.014 * gauss(p.y - 0.199, 0.012) * front * smooth01(1 - abs(p.x) / 0.085)  # brow ridge
        o -= 0.004 * gauss(p.y - 0.186, 0.006) * front * smooth01(1 - abs(p.x) / 0.07)   # brow crease
        for sx in (-1, 1):
            o += 0.012 * gauss((p - V((sx * 0.062, 0.128, 0.07))).length, 0.022)          # cheekbones
            o -= 0.013 * gauss((p - V((sx * 0.066, 0.095, 0.06))).length, 0.022)          # hollow cheeks
            o -= 0.006 * gauss((p - V((sx * 0.085, 0.18, 0.02))).length, 0.02)           # temples
            o += 0.007 * gauss((p - V((sx * 0.07, 0.062, 0.01))).length, 0.02)           # jaw angle
            # ears: a rim with a hollow bowl
            ec = V((sx * 0.095, 0.15, -0.008)); de = (p - ec).length
            o += 0.013 * gauss(de, 0.016) - 0.006 * gauss(de, 0.006) + 0.003 * gauss(de - 0.014, 0.004)
            # nasolabial folds
            f = V((sx * (0.022 + (0.125 - p.y) * 0.25), p.y, 0.1))
            o -= 0.004 * gauss((p - f).length, 0.006) * gauss(p.y - 0.105, 0.02) * front
        o += 0.021 * gauss(abs(p.x), 0.012) * gauss(p.y - 0.14, 0.02) * front            # nose bridge
        o += 0.008 * gauss((p - V((0, 0.125, 0.112))).length, 0.016)                    # nose tip mass
        o -= 0.018 * gauss((p - V((0, 0.12, 0.117))).length, 0.009)                     # rotted nostrils
        o += 0.006 * gauss(p.y - 0.094, 0.006) * gauss(abs(p.x), 0.03) * front           # upper lip
        o += 0.005 * gauss(p.y - 0.074, 0.006) * gauss(abs(p.x), 0.028) * front          # lower lip
        o -= 0.016 * gauss(p.y - 0.085, 0.006) * gauss(abs(p.x), 0.032) * front          # mouth slit (lips pulled back)
        o += 0.0035 * fbm(p, 55, 3) + 0.0015 * fbm(p, 140, 2, 3)                          # skin grit, pores
        if variant == 'a':
            o -= 0.03 * gauss((p - V((0.05, 0.25, 0.0))).length, 0.038)                  # caved scalp wound (deeper crater, carved for real below)
        if variant == 'b':
            hair = smooth01((p.y - 0.19) / 0.02) * smooth01((0.07 - p.z) / 0.04) * smooth01((fbm(p, 30, 2, 5) + 0.15) * 3)
            o += 0.004 * hair
        if variant == 'd':
            o -= 0.045 * gauss((p - V((0.058, 0.098, 0.072))).length, 0.028)               # torn cheek (deeper, carved for real below)
        if variant in ('a', 'd'):
            # jagged bone/flesh shards right at the crater's rim, poking OUT past the head's base
            # silhouette. A recessed crater alone is invisible in this game's dark, backlit lighting
            # (mostly rim light + silhouette) — only geometry that breaks the outer profile reads.
            c, rad, sd = (V((0.05, 0.253, 0.0)), 0.04, 77) if variant == 'a' else (V((0.06, 0.096, 0.078)), 0.032, 78)
            d = (p - c).length
            ring = smooth01(1 - abs(d - rad) / 0.014)
            spike = max(0.0, fbm(p, 140, 3, sd))
            o += 0.03 * ring * spike
        return o
    displace(me, sculpt)
    if variant == 'a':   # scalp wound: actually remove a jagged chunk of skull, not just a dent
        me = carve(me, 'head', [noisy_blob((0.05, 0.253, 0.0), 0.04, seed=21, irregularity=0.5, subdiv=2)])
    if variant == 'd':   # torn cheek: an actual gap through to the jaw, ragged edges
        me = carve(me, 'head', [noisy_blob((0.06, 0.096, 0.078), 0.032, seed=22, irregularity=0.55, subdiv=2)])
    if variant == 'c':   # long matted hair: separate volume, remeshed together with the head
        hm = []
        for ch in LONG_HAIR:
            vs = [tuple(c) for c, r in ch]; rs = [r for c, r in ch]
            hob = skin_obj('hair', vs, [(i, i + 1) for i in range(len(vs) - 1)], rs, 2, 0.004, 2)
            hme = evaluated_mesh(hob)
            displace(hme, lambda p, n: 0.004 * fbm(V((p.x * 4, p.y * 0.5, p.z * 4)), 40, 2, 61) - 0.002)   # strands
            hm.append(hme)
        me = join_meshes('headhair', [me] + hm)
    ob2 = remesh_from_mesh('head', me, 0.004, 2)
    me = decimate('head', evaluated_mesh(ob2), 4200 if variant == 'c' else 3600)
    teeth = []
    for i in range(8):
        x = (i - 3.5) * 0.0105
        teeth.append(box_mesh((x, 0.084, 0.094 - abs(x) * 0.38), (0.0085, 0.012 + 0.002 * (i % 3), 0.007), 0.0015, 1))
    eyes = [small_sphere(tuple(e + V((0, 0, -0.006))), 0.017, 2) for i, e in enumerate(EYES) if not (variant == 'd' and i == 0)]
    def mask(p, n):
        cloth, blood, em, bright = 0.0, 0.0, 0.0, 1.0
        if variant == 'b':
            cloth = smooth01((p.y - 0.19) / 0.02) * smooth01((0.07 - p.z) / 0.04) * smooth01((fbm(p, 30, 2, 5) + 0.15) * 3)
        if variant == 'c':
            face = smooth01((p.z - 0.02) / 0.03) * smooth01((0.2 - p.y) / 0.02) * smooth01(1 - abs(p.x) / 0.085)
            inhair = min(1.0, max(0.0, 1.0 - (min(chain_dist(p, ch) for ch in LONG_HAIR) + 0.004) / 0.008))
            cloth = max(inhair, smooth01((p.y - 0.2) / 0.015)) * (1 - face)
        if variant == 'a':
            blood = smooth01(1 - (p - V((0.05, 0.25, 0.0))).length / 0.045)
        if variant == 'd':
            blood = max(smooth01(1 - (p - V((0.058, 0.098, 0.072))).length / 0.035), smooth01(1 - (p - EYES[0]).length / 0.03) * 0.9)
            bright *= 1 - 0.6 * gauss((p - EYES[0]).length, 0.02)
        blood = max(blood, smooth01((fbm(p, 18, 2, 9) - 0.42) * 5) * 0.7)
        blood = max(blood, gauss(p.y - 0.078, 0.014) * gauss(abs(p.x), 0.04) * smooth01(p.z / 0.08))   # mouth gore, chin drip
        blood = max(blood, gauss(abs(p.x), 0.012) * smooth01((0.08 - p.y) / 0.03) * smooth01(p.z / 0.08) * 0.8)
        for e in EYES: bright *= 1 - 0.5 * gauss((p - e).length, 0.03)
        bright *= 1 - 0.35 * gauss((p - V((0, 0.12, 0.117))).length, 0.01)
        v = abs(fbm(p, 22, 2, 3)); em = 0.4 * smooth01((0.03 - v) / 0.02) * smooth01((0.12 - abs(p.x)) / 0.05)
        return cloth, blood * (1 - cloth * 0.6), em * (1 - cloth), bright
    export('head_' + variant, me, mask, ao_dist=0.05, emissive_parts=[(join_meshes('eyes', eyes), 1.0), (join_meshes('teeth', teeth), 0.9)])

JAW_CHUNK = V((0.043, -0.016, 0.072))
JAW_CHUNK_R = 0.032
def build_jaw():
    verts = [(0, 0.0, 0.0), (0, -0.03, 0.05), (0, -0.045, 0.09)]
    ob = skin_obj('jaw', verts, [(0, 1), (1, 2)], [(0.055), (0.05), (0.035)], 2, 0.004)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x * 1.15, p.y * 0.55, p.z)))
    displace(me, lambda p, n: 0.003 * fbm(p, 50, 2))
    # missing jaw chunk: bite a real, jagged notch out of the mandible (not just a bloody tint)
    me = carve(me, 'jaw', [noisy_blob(JAW_CHUNK, JAW_CHUNK_R, seed=31, irregularity=0.55, subdiv=2)])
    # a couple of broken bone shards jutting out of the notch: in this game's dark backlit lighting a
    # recessed hole alone is invisible, so give the break something that actually pokes past the jaw's
    # outer edge and catches rim light
    me = fuse(me, 'jaw', [
        rib_bone((0.05, -0.01, 0.075), (1.0, 0.35, 0.2), 0.032, r0=0.007, r1=0.002, curve=0.01, seed=33),
        rib_bone((0.052, -0.028, 0.06), (0.8, -0.2, 0.4), 0.026, r0=0.006, r1=0.0015, curve=-0.008, seed=34),
    ])
    me = decimate('jaw', me, 800)
    teeth_pos = [((i - 3) * 0.011, -0.012, 0.085 - abs((i - 3) * 0.011) * 0.35) for i in range(7)]
    teeth = [box_mesh(tp, (0.009, 0.011, 0.008), 0.0015, 1) for tp in teeth_pos
             if (V(tp) - JAW_CHUNK).length > JAW_CHUNK_R * 0.85]   # drop teeth that now sit in the missing chunk
    def mask(p, n):
        exposed = smooth01(1 - (p - JAW_CHUNK).length / (JAW_CHUNK_R * 1.1))
        blood = max(0.6 * smooth01((p.z - 0.05) / 0.03) * smooth01((p.y + 0.01) / 0.02), exposed)
        return 0, blood, 0, 1 - 0.35 * exposed
    export('jaw', me, mask, ao_dist=0.03, emissive_parts=[(join_meshes('jt', teeth), 0.9)])

# torso skeleton (spine-local; the pelvis sits below y 0, shoulders at y ~0.52)
def torso_skel(variant):
    v = [(0, -0.06, 0.0), (0, 0.12, 0.015), (0, 0.29, 0.01), (0, 0.42, -0.005), (0, 0.52, -0.02), (0, 0.6, -0.012), (0, 0.68, 0.0)]
    r = [0.145, 0.128, 0.155, 0.17, 0.14, 0.07, 0.056]
    e = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6)]
    def add(pts, rs, parent):
        nonlocal v, r, e
        k = len(v); v += pts; r += rs; e.append((parent, k))
        for i in range(1, len(pts)): e.append((k + i - 1, k + i))
    for sx in (-1, 1):
        add([(sx * 0.11, 0.55, 0.005), (sx * 0.2, 0.535, -0.02), (sx * 0.262, 0.505, -0.015)], [0.06, 0.07, 0.072], 4)   # clavicle -> deltoid
        add([(sx * 0.085, 0.435, 0.065)], [0.085], 3)                                                                    # pecs
        add([(sx * 0.1, 0.44, -0.09)], [0.085], 3)                                                                       # scapulae
        add([(sx * 0.13, 0.33, -0.03)], [0.1], 2)                                                                        # lats
        add([(sx * 0.085, 0.585, -0.03)], [0.06], 5)                                                                     # trapezius
    if variant == 'jacket':
        add([(0, 0.6, -0.13), (0, 0.52, -0.16)], [0.09, 0.07], 5)                                                        # hood bunched on the back
    return v, e, r

BITE = V((-0.07, 0.2, 0.1))
def build_torso(variant):
    v, e, r = torso_skel(variant)
    bare, jacket = variant in ('bare', 'lean'), variant == 'jacket'
    lean, bloat = variant == 'lean', variant == 'bloat'
    if jacket: r = [x + 0.012 for x in r]
    if lean: r = [x * (0.86 if i < 5 else 0.94) for i, x in enumerate(r)]
    if bloat: r[1] = 0.17; r[2] = 0.185
    ob = skin_obj('torso', v, e, r, 2, 0.007)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x, p.y, p.z * (0.74 if p.y < 0.55 else 0.82) + (0.018 if p.y > 0.3 else 0))))
    if bloat: deform(me, lambda p: p + V((0, -0.02 * gauss(p.y - 0.15, 0.1), 0.06 * gauss(p.y - 0.17, 0.11) * smooth01((p.z + 0.02) / 0.06))))
    def cover(p):
        """1 where cloth covers the body"""
        if bare: return 0.0
        top = 0.64 if jacket else 0.575
        if p.y > top + 0.028 * fbm(p, 16, 2, 3): return 0.0   # ragged hem, not a clean cutoff line
        if jacket:
            return 0.0 if (p.z > 0.03 and abs(p.x) < 0.035 + 0.05 * smooth01((p.y - 0.3) / 0.3) and p.y > 0.3) else 1.0   # open zip at the neck
        tear = fbm(p, 7, 3, 4)
        if tear > 0.4: return 0.0   # lower threshold: bigger, more frequent open rips
        if p.z > 0.06 and gauss((p - BITE).length, 0.075) > 0.42: return 0.0   # bite tears cloth open wider
        if bloat and p.z > 0.02 and p.y < 0.34 - 0.06 * abs(fbm(p, 12, 2, 5)) and abs(p.x) < 0.13: return 0.0   # shirt split over the gut
        return 1.0
    def sculpt(p, n):
        o = 0.003 * fbm(p, 35, 3) + 0.0012 * fbm(p, 120, 2, 7)
        front = smooth01(p.z / 0.06); back = smooth01(-p.z / 0.06); side = smooth01((abs(p.x) - 0.06) / 0.08)
        ribs = gauss(p.y - 0.34, 0.1) * (front * 0.6 + side)
        cl = cover(p)
        skin = 1 - cl
        o += (0.013 if bare else 0.005) * math.sin(p.y * 2 * math.pi / 0.04) * ribs * (0.4 + 0.6 * skin)   # ribcage (deeper: reads from further away)
        o -= 0.006 * gauss(p.x, 0.012) * front * smooth01((p.y - 0.25) / 0.1) * smooth01((0.5 - p.y) / 0.05)  # sternum
        o -= 0.007 * gauss(p.x, 0.014) * back * smooth01((p.y + 0.02) / 0.1) * smooth01((0.56 - p.y) / 0.05)  # spine groove
        for sx in (-1, 1):
            o += 0.005 * gauss(p.y - 0.555, 0.01) * gauss(p.x - sx * 0.1, 0.05) * front                        # clavicles
            o -= 0.003 * gauss((p - V((sx * 0.045, 0.02, 0.1))).length, 0.03) * skin                            # hip hollows
        o -= 0.014 * gauss(p.y - 0.12, 0.05) * gauss(p.x, 0.07) * front * (1 if bare else 0.3)                 # sunken belly
        o -= 0.006 * gauss((p - V((0, 0.08, 0.1))).length, 0.008) * skin                                        # navel
        wound = gauss((p - BITE).length, 0.05)                                                                  # open bite wound: broken silhouette
        o -= 0.045 * wound                                                                                      # deep crater (carved for real below)
        o += 0.024 * math.sin(p.y * 2 * math.pi / 0.026) * wound * smooth01((p.z + 0.02) / 0.05)                # exposed ribs inside the crater
        if variant == 'bare': o -= 0.03 * gauss((p - V((0.06, 0.1, 0.1))).length, 0.05)                         # torn-open flank
        if lean:
            o += 0.004 * math.sin(p.y * 2 * math.pi / 0.04) * ribs                                              # deeper ribs
            o += 0.008 * gauss(p.x, 0.012) * back * (0.5 + 0.5 * math.cos(p.y * 2 * math.pi / 0.035))          # vertebrae
            o -= 0.01 * gauss(p.y - 0.12, 0.05) * gauss(p.x, 0.07) * front                                      # caved belly
        if bloat:
            o += 0.004 * fbm(p, 20, 2, 12) * gauss(p.y - 0.17, 0.1) * skin                                      # stretched, blistered skin
        if cl > 0:
            thick = 0.014 if jacket else 0.007
            fold = fbm(V((p.x * 1.6, p.y * 0.5, p.z * 1.6)), 14, 2, 2)                     # vertical drape folds
            creases = math.sin(p.y * 2 * math.pi / 0.05 + fbm(p, 8, 1, 9) * 4) * gauss(p.y - 0.02, 0.07)   # bunching at the waist
            o += thick + 0.006 * fold + 0.003 * creases
            if p.y < 0.05: o += (0.05 - p.y) * (0.55 if jacket else 0.45) * (0.6 + 0.4 * fbm(p, 12, 1, 5))  # loose, ragged hem hangs away
            if not jacket:
                tear_edge = smooth01(1 - abs(fbm(p, 7, 3, 4) - 0.4) / 0.06)
                o += 0.018 * tear_edge * (0.5 + 0.5 * fbm(p, 40, 2, 15))                    # frayed flap poking out at a torn edge
            if jacket:
                o -= 0.004 * gauss(abs(p.x) - 0.035, 0.004) * front * smooth01((0.34 - p.y) / 0.02)           # zip seam
                for sx in (-1, 1): o += 0.006 * gauss((p - V((sx * 0.1, 0.05, 0.12))).length, 0.04)             # pockets
                o += 0.012 * gauss(p.y - 0.63, 0.012)                                                           # collar ring
            else:
                o += 0.004 * gauss(p.y - 0.572, 0.006)                                                          # shirt collar
        return o
    displace(me, sculpt)
    me = carve(me, 'torso', [noisy_blob(BITE, 0.042, seed=41, irregularity=0.5, subdiv=2)])   # real open wound, not a shader dent
    # broken ribs actually jutting out of the bite wound, past the torso's outer silhouette — a
    # recessed crater alone is invisible in this game's dark, backlit lighting, so give the wound
    # something that pokes into rim light
    me = fuse(me, 'torso', [
        rib_bone(BITE + V((0.0, 0.02, 0.03)), (0.25, 0.35, 1.0), 0.05, r0=0.009, r1=0.0025, curve=0.015, seed=43),
        rib_bone(BITE + V((-0.02, -0.015, 0.025)), (-0.3, -0.1, 1.0), 0.042, r0=0.008, r1=0.002, curve=-0.01, seed=44),
        rib_bone(BITE + V((0.018, -0.01, 0.028)), (0.5, -0.25, 0.9), 0.038, r0=0.0075, r1=0.002, curve=0.008, seed=45),
    ])
    me = decimate('torso', me, 5200)
    def mask(p, n):
        cloth = cover(p)
        blood = max(smooth01(1 - (p - BITE).length / 0.07), smooth01((fbm(p, 12, 2, 8) - 0.38) * 4) * 0.6)
        if variant == 'bare': blood = max(blood, smooth01(1 - (p - V((0.06, 0.1, 0.1))).length / 0.06))
        if cloth: blood = max(blood * 0.5, smooth01((fbm(p, 6, 2, 11) - 0.3) * 3) * 0.55 * smooth01((0.4 - p.y) / 0.3 + 0.3))   # soaked from the collar down
        bright = 1.0 - 0.3 * smooth01((0.03 - p.y) / 0.08) * cloth                                             # dark under the hem
        if bloat: bright *= 1 - 0.25 * gauss(p.y - 0.17, 0.08) * smooth01(fbm(p, 10, 2, 21) * 3) * (1 - cloth)   # bruised, gassy discolouring
        v = abs(fbm(p, 16, 2, 6)); em = 0.4 * smooth01((0.03 - v) / 0.02) * (1 - cloth)
        return cloth, blood, em, bright
    export('torso_' + variant, me, mask, ao_dist=0.08)

def build_pelvis():
    verts = [(0, 0.09, 0.0), (0, -0.04, 0.0), (-0.105, -0.07, 0.0), (0.105, -0.07, 0.0), (0, -0.03, -0.07)]
    ob = skin_obj('pelvis', verts, [(0, 1), (1, 2), (1, 3), (1, 4)], [0.14, 0.15, 0.095, 0.095, 0.1], 2, 0.007)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x, p.y, p.z * 0.74)))
    def sculpt(p, n):
        o = 0.008 + 0.004 * fbm(p, 14, 2, 1) + 0.007 * gauss(p.y - 0.07, 0.01)            # jeans + belt
        o -= 0.004 * gauss(p.x, 0.01) * smooth01(p.z / 0.05) * smooth01((0.05 - p.y) / 0.05)   # fly seam
        o -= 0.003 * gauss(p.x, 0.01) * smooth01(-p.z / 0.05)                                  # back seam
        return o
    displace(me, sculpt)
    me = decimate('pelvis', me, 1400)
    def mask(p, n):
        belt = abs(p.y - 0.07) < 0.012
        return (1.0, smooth01((fbm(p, 8, 2, 12) - 0.3) * 3) * 0.45, 0, 0.45 if belt else 1.0)
    export('pelvis', me, mask, ao_dist=0.07)

def build_uarm(variant):
    ob = skin_obj('uarm', [(0, 0.03, 0), (0, -0.08, 0.0), (0, -0.2, 0.005), (0, -0.33, 0)], [(0, 1), (1, 2), (2, 3)], [0.066, 0.06, 0.05, 0.042], 2, 0.0045)
    me = evaluated_mesh(ob)
    sleeve, jacket = variant == 'sleeve', variant == 'jacket'
    def covered(p):
        if jacket: return True
        return sleeve and p.y > -0.19 + 0.05 * fbm(p, 20, 2, 4)
    def sculpt(p, n):
        o = 0.003 * fbm(p, 40, 3)
        o += 0.008 * gauss(p.y + 0.02, 0.05)                                  # deltoid cap
        o += 0.006 * gauss(p.y + 0.16, 0.06) * smooth01(p.z / 0.03)           # biceps
        o += 0.006 * gauss(p.y + 0.13, 0.07) * smooth01(-p.z / 0.03)          # triceps
        if covered(p):
            o += (0.016 if jacket else 0.007) + 0.005 * fbm(V((p.x * 2, p.y * 0.4, p.z * 2)), 18, 2, 7)
            if sleeve: o += 0.006 * gauss(p.y + 0.19 - 0.05 * fbm(p, 20, 2, 4), 0.008)    # rolled cuff
            if jacket: o += 0.004 * math.sin(p.y * 2 * math.pi / 0.045) * gauss(p.y + 0.3, 0.05)   # bunching at the elbow
        return o
    displace(me, sculpt)
    me = decimate('uarm', me, 1200)
    def mask(p, n):
        cloth = 1.0 if covered(p) else 0.0
        blood = smooth01((fbm(p, 15, 2, 14) - 0.38) * 4) * 0.6
        v = abs(fbm(p, 20, 2, 16)); em = 0.4 * smooth01((0.03 - v) / 0.02) * (1 - cloth)
        return cloth, blood, em, 1.0
    export('uarm_' + variant, me, mask, ao_dist=0.05)

def build_farm(variant='bare'):
    jacket = variant == 'jacket'
    verts = [(0, 0.02, 0), (0, -0.1, 0.004), (0, -0.2, 0.004), (0, -0.285, 0.004), (0, -0.315, 0.012), (0, -0.37, 0.022)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)]
    radii = [0.047, 0.046, 0.037, 0.031, 0.028, 0.036]
    fx = [-0.024, -0.008, 0.008, 0.024]
    for i, x in enumerate(fx):
        k = len(verts); L = 1.0 - 0.12 * abs(i - 1.5)
        verts += [(x, -0.395, 0.03), (x * 1.1, -0.395 - 0.04 * L, 0.05), (x * 1.15, -0.395 - 0.06 * L, 0.082)]
        edges += [(5, k), (k, k + 1), (k + 1, k + 2)]
        radii += [0.012, 0.0105, 0.007]
    k = len(verts)
    verts += [(0.032, -0.35, 0.03), (0.046, -0.385, 0.058), (0.044, -0.405, 0.082)]
    edges += [(5, k), (k, k + 1), (k + 1, k + 2)]
    radii += [0.013, 0.011, 0.008]
    ob = skin_obj('farm', verts, edges, radii, 2, 0.0026, 4)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x, p.y, p.z * (0.8 if p.y > -0.3 else 1.0))))
    def sleeved(p): return jacket and p.y > -0.27 + 0.02 * fbm(p, 20, 1, 3)
    def sculpt(p, n):
        o = 0.0025 * fbm(p, 45, 3) + 0.005 * gauss(p.y + 0.06, 0.06)                   # forearm flexor mass
        o += 0.002 * gauss(p.y + 0.4, 0.01) * smooth01(p.z / 0.02)                      # knuckles
        if sleeved(p): o += 0.014 + 0.005 * fbm(V((p.x * 2, p.y * 0.5, p.z * 2)), 16, 2, 9) + 0.006 * gauss(p.y + 0.26, 0.01)   # cuff
        return o
    displace(me, sculpt)
    me = decimate('farm', me, 2000)
    def mask(p, n):
        cloth = 1.0 if sleeved(p) else 0.0
        blood = max(smooth01((fbm(p, 14, 2, 21) - 0.3) * 4) * 0.7, smooth01((-p.y - 0.43) / 0.02) * 0.9)
        bright = 0.55 if p.y < -0.44 else 1.0   # dark claws
        v = abs(fbm(p, 22, 2, 18)); em = 0.4 * smooth01((0.03 - v) / 0.02) * smooth01((p.y + 0.3) / 0.05) * (1 - cloth)
        return cloth, blood * (1 - cloth * 0.4), em, bright
    export('farm' if variant == 'bare' else 'farm_' + variant, me, mask, ao_dist=0.03)

def build_thigh():
    ob = skin_obj('thigh', [(0, 0.05, 0), (0, -0.12, 0.012), (0, -0.3, 0.008), (0, -0.445, 0.0)], [(0, 1), (1, 2), (2, 3)], [0.09, 0.083, 0.068, 0.056], 2, 0.0055)
    me = evaluated_mesh(ob)
    def hole(p): return (fbm(p, 7, 3, 25) > 0.47 and p.z > 0) or (gauss(p.y + 0.42, 0.04) * smooth01(p.z / 0.03) * (fbm(p, 12, 2, 26) + 0.6) > 0.75)   # a few big rips, torn-out knees
    def sculpt(p, n):
        o = 0.004 * fbm(p, 12, 2, 3)
        o += 0.006 * gauss(p.y + 0.2, 0.1) * smooth01(p.z / 0.03)                           # quads
        o += 0.004 * gauss(p.y + 0.18, 0.1) * smooth01(-p.z / 0.03)                          # hamstrings
        if not hole(p):
            o += 0.011 + 0.004 * math.sin(p.y * 2 * math.pi / 0.06 + 3 * fbm(p, 6, 1, 4)) * gauss(p.y + 0.42, 0.05)   # jeans, bunched at the knee
            o += 0.003 * fbm(V((p.x * 2, p.y * 0.3, p.z * 2)), 14, 2, 8)
        return o
    displace(me, sculpt)
    me = decimate('thigh', me, 1300)
    export('thigh', me, lambda p, n: (0.0 if hole(p) else 1.0, smooth01((fbm(p, 10, 2, 30) - 0.3) * 3) * (0.9 if hole(p) else 0.4), 0, 1.0), ao_dist=0.06)

def build_shin():
    verts = [(0, 0.02, 0), (0, -0.12, -0.02), (0, -0.25, -0.01), (0, -0.4, 0.0), (0, -0.455, -0.035), (0, -0.462, 0.06), (0, -0.465, 0.13)]
    ob = skin_obj('shin', verts, [(0, 1), (1, 2), (2, 3), (3, 4), (3, 5), (5, 6)], [0.058, 0.057, 0.046, 0.04, 0.047, 0.047, 0.042], 2, 0.0055)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x * (1.18 if p.y < -0.42 else 1.0), max(p.y, -0.495), p.z)))
    def sculpt(p, n):
        shoe = p.y < -0.405
        o = 0.004 * fbm(p, 12, 2, 5)
        o += 0.008 * gauss(p.y + 0.12, 0.07) * smooth01(-p.z / 0.02)                        # calf
        if shoe:
            o += 0.007 - 0.003 * gauss(p.y + 0.475, 0.005)                                  # sole edge
            o += 0.002 * math.sin(p.z * 2 * math.pi / 0.02) * smooth01((p.y + 0.43) / 0.02) * smooth01(p.z / 0.02)   # laces
        else:
            o += 0.012 + 0.003 * fbm(V((p.x * 2, p.y * 0.3, p.z * 2)), 14, 2, 6)            # loose trouser leg
            o += 0.006 * gauss(p.y + 0.39, 0.012) * (0.6 + 0.4 * fbm(p, 20, 1, 2))           # ragged cuff
        return o
    displace(me, sculpt)
    me = decimate('shin', me, 1300)
    def mask(p, n):
        shoe = p.y < -0.405
        mud = smooth01((-0.3 - p.y) / 0.12) * smooth01((fbm(p, 9, 2, 40) + 0.2) * 2)
        return 1.0, smooth01((fbm(p, 10, 2, 33) - 0.3) * 3) * 0.35, 0, (0.3 if shoe else 1.0) * (1 - 0.35 * mud)
    export('shin', me, mask, ao_dist=0.06)

# ---------- brute: riot gear (plate carrier with pouches, pauldrons, helmet with gas mask, knee pads, forearm guards) ----------
def build_brute():
    v = [(0, -0.02, 0.0), (0, 0.12, 0.015), (0, 0.29, 0.01), (0, 0.42, -0.005), (0, 0.5, -0.02), (-0.085, 0.435, 0.065), (0.085, 0.435, 0.065),
         (-0.1, 0.44, -0.09), (0.1, 0.44, -0.09), (-0.13, 0.33, -0.03), (0.13, 0.33, -0.03), (-0.12, 0.52, -0.01), (0.12, 0.52, -0.01)]
    e = [(0, 1), (1, 2), (2, 3), (3, 4), (3, 5), (3, 6), (3, 7), (3, 8), (2, 9), (2, 10), (4, 11), (4, 12)]
    r = [x + 0.03 for x in (0.15, 0.14, 0.165, 0.18, 0.15, 0.09, 0.09, 0.09, 0.09, 0.105, 0.105, 0.07, 0.07)]
    ob = skin_obj('vest_base', v, e, r, 2, 0.009, 3)
    base = evaluated_mesh(ob)
    deform(base, lambda p: V((p.x, p.y, p.z * 0.8 + 0.02)))
    parts = [base,
             box_mesh((0, 0.38, 0.16), (0.3, 0.24, 0.035), 0.014, 2),                 # front plate
             box_mesh((0, 0.38, -0.15), (0.3, 0.26, 0.03), 0.014, 2)]                 # back plate
    for i, x in enumerate((-0.1, 0.0, 0.1)):
        parts.append(box_mesh((x, 0.16, 0.175), (0.085, 0.1, 0.05), 0.012, 2))       # magazine pouches
        parts.append(box_mesh((x, 0.215, 0.2), (0.09, 0.02, 0.04), 0.006, 1))        # pouch flaps
    parts.append(box_mesh((0.13, 0.46, 0.18), (0.05, 0.08, 0.035), 0.01, 2))          # radio pouch
    parts.append(box_mesh((0, 0.0, 0.02), (0.36, 0.06, 0.3), 0.02, 2))                # duty belt
    for sx in (-1, 1): parts.append(box_mesh((sx * 0.16, 0.0, 0.1), (0.07, 0.08, 0.06), 0.012, 2))   # belt pouches
    me = join_meshes('vest', parts)
    ob = remesh_from_mesh('vest', me, 0.007, 2); me = evaluated_mesh(ob)
    displace(me, lambda p, n: 0.0015 * fbm(p, 25, 2, 40) - 0.004 * gauss(((p.y - 0.3) * 30) % 1.0 - 0.5, 0.05) * smooth01((abs(p.z) - 0.15) / 0.02))
    me = decimate('vest', me, 3200)
    def vmask(p, n):
        pouch = p.z > 0.15 and p.y < 0.25
        strap = abs(abs(p.x) - 0.12) < 0.02 and p.y > 0.45
        return (0.25 if pouch or strap else 1.0, smooth01((fbm(p, 9, 2, 41) - 0.35) * 3) * 0.45, 0.0, 0.8 if pouch else 1.0)
    export('brute_vest', me, vmask, ao_dist=0.06)
    # pauldron: two overlapping curved shells
    shells = []
    for k, (oy, s) in enumerate(((0.03, 1.0), (-0.035, 0.86))):
        pad = ico_obj('pad%d' % k, 1.0, 4); pm = evaluated_mesh(pad)
        deform(pm, lambda p, oy=oy, s=s: V((p.x * 0.088 * s, max(p.y, 0.0) * 0.07 * s + oy, p.z * 0.1 * s)))
        shells.append(pm)
    pm = join_meshes('pad', shells)
    export('brute_pad', pm, lambda p, n: (1.0, 0.25 * smooth01(fbm(p, 20, 2, 44) * 3), 0.0, 1.0 - 0.3 * gauss(p.y - 0.03, 0.005)), ao_dist=0.03)
    # riot helmet + gas mask
    hel = ico_obj('helmet', 1.0, 5); hm = evaluated_mesh(hel)
    deform(hm, lambda p: V((HEAD_C.x + p.x * 0.118, HEAD_C.y + 0.016 + max(p.y, -0.15) * 0.135, HEAD_C.z - 0.005 + p.z * 0.13 * (1.0 if p.z < 0 else 0.3 + 0.7 * smooth01((p.y - 0.15) / 0.25)))))
    brim = box_mesh((0, HEAD_C.y + 0.07, 0.1), (0.2, 0.012, 0.07), 0.006, 2)                                  # raised visor
    mask_face = ico_obj('mask', 1.0, 4); mf = evaluated_mesh(mask_face)
    deform(mf, lambda p: V((p.x * 0.078, 0.11 + p.y * 0.075, 0.07 + p.z * 0.06)))
    filt = []
    for sx in (-1, 1):   # twin filter canisters on the cheeks
        c = bmesh.new()
        try: bmesh.ops.create_cone(c, cap_ends=True, segments=16, radius1=0.028, radius2=0.028, depth=0.035)
        except TypeError: bmesh.ops.create_cone(c, cap_ends=True, segments=16, diameter1=0.028, diameter2=0.028, depth=0.035)
        bmesh.ops.rotate(c, verts=c.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(70), 3, 'X') @ Matrix.Rotation(math.radians(sx * 35), 3, 'Y'))
        bmesh.ops.translate(c, verts=c.verts[:], vec=V((sx * 0.055, 0.08, 0.125)))
        m = bpy.data.meshes.new('flt'); c.to_mesh(m); c.free(); filt.append(m)
    me = join_meshes('helmet', [hm, brim, mf] + filt)
    ob = remesh_from_mesh('helmet', me, 0.0035, 1); me = decimate('helmet', evaluated_mesh(ob), 3400)
    lenses = [small_sphere((sx * 0.042, 0.168, 0.118), 0.02, 2) for sx in (-1, 1)]
    for L in lenses: deform(L, lambda p: V((p.x, p.y, 0.118 + (p.z - 0.118) * 0.35)))
    def hmask(p, n):
        rubber = p.y < 0.19 and p.z > 0.02
        return (0.0 if rubber else 1.0, 0.2 * smooth01((fbm(p, 12, 2, 46) - 0.3) * 3), 0.0, 0.55 if rubber else 1.0)
    export('brute_helmet', me, hmask, ao_dist=0.03, emissive_parts=[(join_meshes('lens', lenses), 1.0)])
    # knee pads + forearm guards (rigid to the knee / elbow)
    kp = ico_obj('knee', 1.0, 3); km = evaluated_mesh(kp)
    deform(km, lambda p: V((p.x * 0.07, p.y * 0.085 - 0.02, max(p.z, -0.2) * 0.05 + 0.06)))
    export('brute_knee', km, lambda p, n: (1.0, 0.2 * smooth01(fbm(p, 20, 2, 47) * 3), 0.0, 1.0), ao_dist=0.03)
    gd = skin_obj('guard', [(0, -0.06, 0.012), (0, -0.27, 0.018)], [(0, 1)], [0.038, 0.032], 2, 0.004, 2)
    gm = evaluated_mesh(gd); deform(gm, lambda p: V((p.x * 1.05, p.y, max(p.z, 0.0) + 0.01)))
    gm = decimate('guard', gm, 500)
    export('brute_guard', gm, lambda p, n: (1.0, 0.2 * smooth01(fbm(p, 20, 2, 48) * 3), 0.0, 1.0), ao_dist=0.03)

# ---------- boss growth: hunched spiky mass on the upper back ----------
def build_boss_hump():
    verts = [(0, 0.3, -0.12), (0, 0.5, -0.2), (-0.14, 0.58, -0.16), (0.16, 0.55, -0.15), (0, 0.66, -0.12)]
    edges = [(0, 1), (1, 2), (1, 3), (1, 4)]
    radii = [0.14, 0.2, 0.12, 0.13, 0.1]
    tips = []
    for i in range(7):
        a = (i - 3) * 0.33
        base = (math.sin(a) * 0.18, 0.5 + math.cos(a) * 0.12, -0.26)
        k = len(verts)
        verts += [base, (base[0] * 1.35, base[1] + 0.06, -0.38), (base[0] * 1.5, base[1] + 0.1, -0.47)]
        edges += [(1, k), (k, k + 1), (k + 1, k + 2)]; radii += [0.05, 0.025, 0.006]
        tips.append(V((base[0] * 1.5, base[1] + 0.1, -0.47)))
    ob = skin_obj('hump', verts, edges, radii, 2, 0.008)
    me = evaluated_mesh(ob)
    displace(me, lambda p, n: 0.008 * fbm(p, 12, 3, 50))
    me = decimate('hump', me, 2600)
    def mask(p, n):
        tip = max(smooth01(1 - (p - t).length / 0.12) for t in tips)
        return 0.0, smooth01((fbm(p, 8, 2, 51) - 0.3) * 3) * 0.6, tip, 1.0 - 0.3 * tip
    export('boss_hump', me, mask, ao_dist=0.1)

# ---------- boss mutation: asymmetric crystalline growth sleeving the right forearm ----------
def build_boss_arm():
    # Local elbow space, following the bare forearm down -Y. The clustered off-axis branches make the
    # Warden readable in silhouette without relying on a bright shader halo.
    verts = [(0, -0.02, 0.015), (0.015, -0.18, 0.025), (0.035, -0.39, 0.045), (0.055, -0.56, 0.07)]
    edges = [(0, 1), (1, 2), (2, 3)]
    radii = [0.075, 0.095, 0.115, 0.08]
    tips = []
    branches = [(-0.11, -0.12, 0.035), (0.15, -0.22, 0.06), (-0.16, -0.33, 0.075),
                (0.18, -0.43, 0.09), (-0.1, -0.55, 0.1)]
    for i, (x, y, z) in enumerate(branches):
        anchor = min(3, i // 2 + 1); k = len(verts)
        tip = (x * 1.45, y - 0.025, z * 1.8)
        verts += [(x * 0.58, y, z * 0.65), tip]
        edges += [(anchor, k), (k, k + 1)]; radii += [0.04, 0.006]
        tips.append(V(tip))
    ob = skin_obj('boss_arm', verts, edges, radii, 2, 0.006, 3)
    me = evaluated_mesh(ob)
    displace(me, lambda p, n: 0.006 * fbm(p, 15, 3, 63))
    me = decimate('boss_arm', me, 2200)
    def mask(p, n):
        tip = max(smooth01(1 - (p - t).length / 0.1) for t in tips)
        fissure = smooth01((fbm(p, 11, 2, 64) - 0.18) * 2.6)
        return 0.0, fissure * 0.45, max(tip, fissure * 0.55), 1.0 - 0.25 * fissure
    export('boss_arm', me, mask, ao_dist=0.07)

# ---------- archetype silhouette pieces ----------
def build_walker_ribs():
    # Six pale, broken ribs pushed well through an open chest cavity. These intentionally sit proud of
    # every torso variant: the earlier subtle version disappeared into dark shirts at gameplay distance.
    parts = []
    for i in range(3):
        y = 0.22 + i * 0.085
        for sx in (-1, 1):
            reach = 0.17 + i * 0.015
            vs = [(0.028 * sx, y, 0.215), (0.105 * sx, y - 0.012, 0.255), (reach * sx, y - 0.045, 0.29)]
            ob = skin_obj('rib_growth', vs, [(0, 1), (1, 2)], [0.026, 0.019, 0.006], 1, 0.0025, 2)
            parts.append(evaluated_mesh(ob))
    # Ragged sternum and wet tissue behind the ribs give the pale arcs a dark readable surround.
    core = skin_obj('rib_core', [(0, 0.17, 0.205), (0, 0.31, 0.225), (0, 0.46, 0.205)], [(0, 1), (1, 2)], [0.055, 0.07, 0.045], 2, 0.004, 2)
    parts.append(evaluated_mesh(core))
    me = join_meshes('walker_ribs', parts)
    me = decimate('walker_ribs', me, 1500)
    export('walker_ribs', me, lambda p, n: (0.0, 0.85 * smooth01((0.245 - p.z) / 0.05), 0.0, 1.0), ao_dist=0.03)

def build_runner_tendons():
    # A corded, split forearm with two bone-like blades; mirrored by the rig for the other arm.
    verts = [(0, -0.02, 0), (0.012, -0.18, 0.018), (0.025, -0.38, 0.035),
             (-0.09, -0.29, 0.055), (-0.14, -0.42, 0.085), (0.1, -0.36, 0.05), (0.16, -0.51, 0.08)]
    edges = [(0, 1), (1, 2), (1, 3), (3, 4), (2, 5), (5, 6)]
    radii = [0.052, 0.06, 0.045, 0.035, 0.005, 0.03, 0.005]
    ob = skin_obj('runner_tendons', verts, edges, radii, 2, 0.004, 2)
    me = evaluated_mesh(ob); displace(me, lambda p, n: 0.004 * fbm(p, 22, 2, 71)); me = decimate('runner_tendons', me, 1500)
    export('runner_tendons', me, lambda p, n: (0.0, 0.65 * smooth01((fbm(p, 12, 2, 72) - 0.1) * 2), 0.2, 0.9), ao_dist=0.035)

def build_brute_breach():
    # Jagged exposed tissue protruding through a split in the right side of the chest plate.
    verts = [(0.09, 0.27, 0.175), (0.13, 0.34, 0.195), (0.12, 0.43, 0.18),
             (0.19, 0.31, 0.2), (0.21, 0.39, 0.19)]
    edges = [(0, 1), (1, 2), (1, 3), (2, 4)]
    ob = skin_obj('brute_breach', verts, edges, [0.045, 0.065, 0.05, 0.025, 0.01], 2, 0.004, 2)
    me = evaluated_mesh(ob); displace(me, lambda p, n: 0.005 * fbm(p, 18, 3, 74)); me = decimate('brute_breach', me, 1000)
    export('brute_breach', me, lambda p, n: (0.0, 0.8, 0.15, 0.75), ao_dist=0.035)

# ================= CYBER GAUNTLETS (bow-local space, metres) =================
def plate_mask(p, n, seam_scale):
    band = (p.y * seam_scale) % 1.0
    seam = 1.0 if band < 0.06 else 0.0
    return seam

def build_gauntlet_right():
    # origin = the nocking point on the string; fingers hook around it from +x/+z
    verts = [(0.05, -0.03, 0.075), (0.046, -0.012, 0.047)]   # wrist, palm centre
    edges = [(0, 1)]; radii = [0.024, (0.031)]
    for i in range(3):
        y = 0.012 - i * 0.02
        k = len(verts)
        verts += [(0.03, y, 0.032), (0.011, y, 0.004), (-0.004, y, -0.006), (-0.009, y, 0.01)]
        edges += [(1, k), (k, k + 1), (k + 1, k + 2), (k + 2, k + 3)]; radii += [0.0105, 0.0095, 0.0085, 0.0075]
    k = len(verts)
    verts += [(0.036, -0.058, 0.03), (0.02, -0.06, 0.012)]   # pinky tucked
    edges += [(1, k), (k, k + 1)]; radii += [0.009, 0.008]
    k = len(verts)
    verts += [(0.056, 0.012, 0.04), (0.05, 0.03, 0.02), (0.04, 0.036, 0.004)]   # thumb
    edges += [(1, k), (k, k + 1), (k + 1, k + 2)]; radii += [0.011, 0.0095, 0.0085]
    ob = skin_obj('gr', verts, edges, radii, 2, 0.0022, 3)
    me = evaluated_mesh(ob)
    # armour plates: raise knuckle + back-of-hand plates, carve seams
    def sculpt(p, n):
        o = 0.0
        back = smooth01((p.x - 0.035) / 0.02) * smooth01((p.z - 0.03) / 0.02)
        o += 0.0035 * back
        o -= 0.0014 * (1.0 if (p.x * 180) % 1.0 < 0.12 else 0.0) * back
        return o
    displace(me, sculpt)
    me = decimate('gr', me, 3000)
    def mask(p, n):
        back = smooth01((p.x - 0.035) / 0.015) * smooth01((p.z - 0.03) / 0.015)
        seam = 1.0 if (p.x * 180) % 1.0 < 0.12 and back > 0.5 else 0.0
        knuckle = 1.0 if 0.02 < p.x < 0.036 and p.z > 0.02 else 0.0
        return max(back, knuckle) * 0.9, 0.0, seam, 1.0
    export('g_right', me, mask, ao_dist=0.02, ao_strength=0.6)

def build_gauntlet_left():
    # origin = grip centre; the grip runs along y; palm on +z, fingers wrap round -x to the front
    verts = [(-0.004, -0.075, 0.035), (0.0, -0.035, 0.042)]
    edges = [(0, 1)]; radii = [0.026, (0.034)]
    for i in range(4):
        y = 0.018 - i * 0.022
        k = len(verts)
        verts += [(-0.03, y, 0.034), (-0.037, y, 0.0), (-0.024, y, -0.036), (0.004, y, -0.041)]
        edges += [(1, k), (k, k + 1), (k + 1, k + 2), (k + 2, k + 3)]; radii += [0.011, 0.0105, 0.0095, 0.0085]
    k = len(verts)
    verts += [(0.028, 0.0, 0.04), (0.034, 0.028, 0.012), (0.024, 0.036, -0.02)]
    edges += [(1, k), (k, k + 1), (k + 1, k + 2)]; radii += [0.013, 0.011, 0.009]
    ob = skin_obj('gl', verts, edges, radii, 2, 0.0024, 3)
    me = evaluated_mesh(ob)
    displace(me, lambda p, n: 0.003 * smooth01((-p.x - 0.03) / 0.01) * smooth01((p.z + 0.02) / 0.03))
    me = decimate('gl', me, 3000)
    def mask(p, n):
        plate = smooth01((-p.x - 0.028) / 0.01)
        seam = 1.0 if plate > 0.5 and (p.y * 45 + 0.5) % 1.0 < 0.1 else 0.0
        return plate * 0.9, 0.0, seam, 1.0
    export('g_left', me, mask, ao_dist=0.02, ao_strength=0.6)

def build_gauntlet_forearm():
    # unit-sized: y from -0.5 (wrist) to 0.5 (elbow), radius ~0.5; drawn with M4.align
    verts = [(0, -0.5, 0), (0, -0.15, 0), (0, 0.2, 0), (0, 0.5, 0)]
    ob = skin_obj('gf', verts, [(0, 1), (1, 2), (2, 3)], [0.4, 0.5, 0.52, 0.47], 2, 0.03, 3)
    me = evaluated_mesh(ob)
    def sculpt(p, n):
        band = ((p.y + 0.5) * 4.0) % 1.0
        o = -0.035 if band < 0.07 else 0.0                        # grooves between plates
        o += 0.05 * smooth01((p.z - 0.25) / 0.1) * gauss(p.y + 0.25, 0.12)   # wrist display housing
        o += 0.02 * gauss(p.x, 0.12) * smooth01(-p.z / 0.2)        # dorsal ridge
        return o
    displace(me, sculpt)
    me = decimate('gf', me, 1800)
    def mask(p, n):
        band = ((p.y + 0.5) * 4.0) % 1.0
        seam = 1.0 if band < 0.07 else 0.0
        display = 1.0 if (p.z > 0.4 and abs(p.y + 0.25) < 0.1 and abs(p.x) < 0.2) else 0.0
        accent = 1.0 if int((p.y + 0.5) * 4.0) % 2 == 0 else 0.0
        return accent * 0.9, 0.0, max(seam, display), 1.0
    export('g_forearm', me, mask, ao_dist=0.2, ao_strength=0.5)

# ================= RUN =================
def run():
    t0 = time.time()
    scene_setup()
    jobs = [('head_a', lambda: build_head('a')), ('head_b', lambda: build_head('b')), ('head_c', lambda: build_head('c')), ('head_d', lambda: build_head('d')), ('jaw', build_jaw),
            ('torso_shirt', lambda: build_torso('shirt')), ('torso_bare', lambda: build_torso('bare')), ('torso_jacket', lambda: build_torso('jacket')), ('torso_lean', lambda: build_torso('lean')), ('torso_bloat', lambda: build_torso('bloat')), ('pelvis', build_pelvis),
            ('uarm_sleeve', lambda: build_uarm('sleeve')), ('uarm_bare', lambda: build_uarm('bare')), ('uarm_jacket', lambda: build_uarm('jacket')),
            ('farm', build_farm), ('farm_jacket', lambda: build_farm('jacket')),
            ('thigh', build_thigh), ('shin', build_shin), ('brute', build_brute), ('boss_hump', build_boss_hump), ('boss_arm', build_boss_arm),
            ('walker_ribs', build_walker_ribs), ('runner_tendons', build_runner_tendons), ('brute_breach', build_brute_breach),
            ('g_right', build_gauntlet_right), ('g_left', build_gauntlet_left), ('g_forearm', build_gauntlet_forearm)]
    only = globals().get('NQ_ONLY')
    for name, fn in jobs:
        if only and name not in only: continue
        try:
            t = time.time(); fn(); log('ok', name, round(time.time() - t, 1), 's')
        except Exception:
            log('FAILED', name, traceback.format_exc())
    log('DONE', round(time.time() - t0, 1), 's', 'blender', bpy.app.version_string)
    return '\n'.join(LOG[-3:])

print(run())
