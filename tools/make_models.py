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
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

OUT = globals().get('NQ_OUT') or r"C:\Users\fouad\Downloads\neon-quiver\models"
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
EYES = [V((-0.042, 0.168, 0.092)), V((0.042, 0.168, 0.092))]
HEAD_C, HEAD_R = V((0, 0.155, 0.01)), V((0.094, 0.122, 0.108))

def build_head(variant):
    ob = ico_obj('head', 1.0, 5)
    me = evaluated_mesh(ob)
    def shape(p):
        d = p.normalized()
        q = V((HEAD_C.x + d.x * HEAD_R.x, HEAD_C.y + d.y * HEAD_R.y, HEAD_C.z + d.z * HEAD_R.z))
        # narrow the lower face / jaw area, flatten the back of the skull a bit
        if q.y < 0.11: q.x *= 0.82 + 0.18 * smooth01((q.y - 0.04) / 0.07)
        if q.z < -0.04: q.z = -0.04 + (q.z + 0.04) * 0.9
        return q
    deform(me, shape)
    def sculpt(p, n):
        o = 0.0
        for e in EYES: o -= 0.028 * gauss((p - e).length, 0.03)                       # deep sockets
        front = smooth01((p.z - 0.03) / 0.05)
        o += 0.013 * gauss(p.y - 0.198, 0.012) * front * smooth01(1 - abs(p.x) / 0.08)   # brow ridge
        for sx in (-1, 1):
            o += 0.012 * gauss((p - V((sx * 0.062, 0.128, 0.07))).length, 0.022)         # cheekbones
            o -= 0.012 * gauss((p - V((sx * 0.066, 0.095, 0.06))).length, 0.022)         # hollow cheeks
            o -= 0.006 * gauss((p - V((sx * 0.085, 0.18, 0.02))).length, 0.02)          # temples
            o += 0.010 * gauss((p - V((sx * 0.094, 0.15, -0.005))).length, 0.013)        # ears
        o += 0.020 * gauss(abs(p.x), 0.012) * gauss(p.y - 0.14, 0.02) * front            # nose bridge
        o -= 0.016 * gauss((p - V((0, 0.128, 0.112))).length, 0.013)                     # rotted nose hole
        o -= 0.014 * gauss(p.y - 0.085, 0.011) * gauss(abs(p.x), 0.035) * front          # lip line / mouth slit
        o += 0.0035 * fbm(p, 55, 3)                                                       # skin grit
        if variant == 'a':
            o -= 0.012 * gauss((p - V((0.05, 0.25, 0.0))).length, 0.03)                  # caved scalp wound
        return o
    displace(me, sculpt)
    ob2 = remesh_from_mesh('head', me, 0.0045, 3)
    me = decimate('head', evaluated_mesh(ob2), 2600)
    teeth = []
    for i in range(7):
        x = (i - 3) * 0.011
        teeth.append(box_mesh((x, 0.083, 0.093 - abs(x) * 0.35), (0.009, 0.013, 0.008), 0.0015, 1))
    eyes = [small_sphere(tuple(e + V((0, 0, -0.006))), 0.017, 2) for e in EYES]
    def mask(p, n):
        cloth, blood, em, bright = 0.0, 0.0, 0.0, 1.0
        if variant == 'b':  # patchy hair (tinted by the per-draw hair colour)
            hair = smooth01((p.y - 0.19) / 0.02) * smooth01((0.07 - p.z) / 0.04)
            hair *= smooth01((fbm(p, 30, 2, 5) + 0.15) * 3)
            cloth = hair
        if variant == 'a':
            blood = smooth01(1 - (p - V((0.05, 0.25, 0.0))).length / 0.04)
        blood = max(blood, smooth01((fbm(p, 18, 2, 9) - 0.38) * 5) * 0.8)
        blood = max(blood, gauss(p.y - 0.083, 0.012) * gauss(abs(p.x), 0.04) * smooth01(p.z / 0.08) * 0.9)  # mouth gore
        for e in EYES: bright *= 1 - 0.55 * gauss((p - e).length, 0.032)
        # glowing infection veins
        v = abs(fbm(p, 22, 2, 3)); em = 0.55 * smooth01((0.035 - v) / 0.02) * smooth01((0.12 - abs(p.x)) / 0.05)
        return cloth, blood, em * (1 - cloth), bright
    export('head_' + variant, me, mask, ao_dist=0.05, emissive_parts=[(join_meshes('eyes', eyes), 1.0), (join_meshes('teeth', teeth), 0.0)])

def build_jaw():
    verts = [(0, 0.0, 0.0), (0, -0.03, 0.05), (0, -0.045, 0.09)]
    ob = skin_obj('jaw', verts, [(0, 1), (1, 2)], [(0.055), (0.05), (0.035)], 2, 0.004)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x * 1.15, p.y * 0.55, p.z)))
    displace(me, lambda p, n: 0.003 * fbm(p, 50, 2))
    me = decimate('jaw', me, 700)
    teeth = [box_mesh(((i - 3) * 0.011, -0.012, 0.085 - abs((i - 3) * 0.011) * 0.35), (0.009, 0.011, 0.008), 0.0015, 1) for i in range(7)]
    export('jaw', me, lambda p, n: (0, max(0.6 * smooth01((p.z - 0.05) / 0.03) * smooth01((p.y + 0.01) / 0.02), 0), 0, 1), ao_dist=0.03,
           emissive_parts=[(join_meshes('jt', teeth), 0.0)])

def build_torso(variant):
    verts = [(0, -0.06, 0.0), (0, 0.12, 0.012), (0, 0.29, 0.005), (0, 0.44, -0.012), (0, 0.555, -0.02), (0, 0.66, 0.0),
             (-0.21, 0.515, -0.025), (0.21, 0.515, -0.025), (-0.265, 0.5, -0.02), (0.265, 0.5, -0.02)]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (3, 6), (3, 7), (6, 8), (7, 9)]
    radii = [0.145, 0.13, 0.165, 0.185, 0.12, 0.055, 0.075, 0.075, 0.062, 0.062]
    ob = skin_obj('torso', verts, edges, radii, 2, 0.008)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x, p.y, p.z * (0.68 if p.y < 0.55 else 0.8) + (0.018 if p.y > 0.3 else 0))))
    bare = variant == 'bare'
    def sculpt(p, n):
        o = 0.004 * fbm(p, 35, 3)
        front = smooth01(p.z / 0.06); side = smooth01((abs(p.x) - 0.06) / 0.08)
        ribs = gauss(p.y - 0.36, 0.1) * (front * 0.6 + side)
        o += (0.007 if bare else 0.002) * math.sin(p.y * 2 * math.pi / 0.042) * ribs          # ribcage
        o -= 0.012 * gauss(p.y - 0.12, 0.05) * gauss(p.x, 0.07) * front * (1 if bare else 0.3) # sunken belly
        o += 0.008 * gauss(p.y - 0.47, 0.04) * front * smooth01(abs(p.x) / 0.05)              # pecs / collar
        o -= 0.014 * gauss((p - V((-0.07, 0.2, 0.1))).length, 0.035)                          # bite wound
        o += 0.006 * gauss(p.y - 0.585, 0.025) * smooth01((abs(p.x) - 0.05) / 0.05)           # trapezius
        if not bare:
            cl = shirt(p)
            o += 0.006 * cl + 0.004 * cl * fbm(p, 14, 2, 2)                                    # cloth folds
        return o
    def shirt(p):
        if p.y > 0.575: return 0.0
        tear = fbm(p, 9, 3, 4)
        return 0.0 if tear > 0.38 or (p.z > 0.06 and gauss((p - V((-0.07, 0.2, 0.1))).length, 0.06) > 0.5) else 1.0
    displace(me, sculpt)
    me = decimate('torso', me, 3400)
    def mask(p, n):
        cloth = 0.0 if bare else shirt(p)
        blood = max(smooth01(1 - (p - V((-0.07, 0.2, 0.1))).length / 0.06), smooth01((fbm(p, 12, 2, 8) - 0.35) * 4) * 0.7)
        if not bare: blood = max(blood * (1 - cloth * 0.5), cloth * smooth01((fbm(p, 6, 2, 11) - 0.25) * 3) * 0.6)
        v = abs(fbm(p, 16, 2, 6)); em = 0.5 * smooth01((0.03 - v) / 0.02) * (1 - cloth)
        return cloth, blood, em, 1.0
    export('torso_' + variant, me, mask, ao_dist=0.08)

def build_pelvis():
    verts = [(0, 0.09, 0.0), (0, -0.04, 0.0), (-0.105, -0.07, 0.0), (0.105, -0.07, 0.0)]
    ob = skin_obj('pelvis', verts, [(0, 1), (1, 2), (1, 3)], [0.14, 0.15, 0.09, 0.09], 2, 0.008)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x, p.y, p.z * 0.72)))
    displace(me, lambda p, n: 0.004 * fbm(p, 14, 2, 1) + 0.006 * gauss(p.y - 0.07, 0.012))
    me = decimate('pelvis', me, 1100)
    export('pelvis', me, lambda p, n: (1.0, smooth01((fbm(p, 8, 2, 12) - 0.3) * 3) * 0.5, 0, 0.55 if abs(p.y - 0.07) < 0.012 else 1.0), ao_dist=0.07)

def build_uarm(variant):
    ob = skin_obj('uarm', [(0, 0.03, 0), (0, -0.1, 0.0), (0, -0.33, 0)], [(0, 1), (1, 2)], [0.062, 0.056, 0.042], 2, 0.005)
    me = evaluated_mesh(ob)
    displace(me, lambda p, n: 0.003 * fbm(p, 40, 3) + 0.006 * gauss(p.y + 0.06, 0.05) * smooth01(-p.x / 0.03))
    me = decimate('uarm', me, 900)
    sleeve = variant == 'sleeve'
    def mask(p, n):
        cloth = 1.0 if sleeve and p.y > -0.19 + 0.05 * fbm(p, 20, 2, 4) else 0.0
        blood = smooth01((fbm(p, 15, 2, 14) - 0.35) * 4) * 0.7
        v = abs(fbm(p, 20, 2, 16)); em = 0.5 * smooth01((0.03 - v) / 0.02) * (1 - cloth)
        return cloth, blood, em, 1.0
    export('uarm_' + variant, me, mask, ao_dist=0.05)

def build_farm():
    verts = [(0, 0.02, 0), (0, -0.14, 0.004), (0, -0.285, 0.004), (0, -0.315, 0.012), (0, -0.37, 0.022),
             ]
    edges = [(0, 1), (1, 2), (2, 3), (3, 4)]
    radii = [0.047, 0.043, 0.032, 0.028, (0.036)]
    # four clawed fingers + thumb
    fx = [-0.024, -0.008, 0.008, 0.024]
    for i, x in enumerate(fx):
        k = len(verts)
        verts += [(x, -0.395, 0.03), (x * 1.1, -0.435, 0.05), (x * 1.15, -0.455, 0.082)]
        edges += [(4, k), (k, k + 1), (k + 1, k + 2)]
        radii += [0.012, 0.0105, 0.007]
    k = len(verts)
    verts += [(0.032, -0.35, 0.03), (0.046, -0.385, 0.058), (0.044, -0.405, 0.082)]
    edges += [(4, k), (k, k + 1), (k + 1, k + 2)]
    radii += [0.013, 0.011, 0.008]
    ob = skin_obj('farm', verts, edges, radii, 2, 0.0028, 4)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x, p.y, p.z * (0.8 if p.y > -0.3 else 1.0))))
    displace(me, lambda p, n: 0.0025 * fbm(p, 45, 3) + 0.004 * gauss(p.y + 0.06, 0.06))
    me = decimate('farm', me, 1800)
    def mask(p, n):
        blood = max(smooth01((fbm(p, 14, 2, 21) - 0.3) * 4) * 0.7, smooth01((-p.y - 0.43) / 0.02) * 0.9)
        bright = 0.55 if p.y < -0.44 else 1.0   # dark claws
        v = abs(fbm(p, 22, 2, 18)); em = 0.5 * smooth01((0.03 - v) / 0.02) * smooth01((p.y + 0.3) / 0.05)
        return 0.0, blood, em, bright
    export('farm', me, mask, ao_dist=0.03)

def build_thigh():
    ob = skin_obj('thigh', [(0, 0.05, 0), (0, -0.2, 0.012), (0, -0.445, 0.0)], [(0, 1), (1, 2)], [0.088, 0.077, 0.056], 2, 0.006)
    me = evaluated_mesh(ob)
    def hole(p): return fbm(p, 11, 3, 25) > 0.33 and p.z > 0
    displace(me, lambda p, n: 0.004 * fbm(p, 12, 2, 3) + (0.0 if hole(p) else 0.005))
    me = decimate('thigh', me, 1000)
    export('thigh', me, lambda p, n: (0.0 if hole(p) else 1.0, smooth01((fbm(p, 10, 2, 30) - 0.3) * 3) * (0.9 if hole(p) else 0.45), 0, 1.0), ao_dist=0.06)

def build_shin():
    verts = [(0, 0.02, 0), (0, -0.2, -0.012), (0, -0.415, 0.0), (0, -0.46, -0.03), (0, -0.465, 0.07), (0, -0.465, 0.14)]
    ob = skin_obj('shin', verts, [(0, 1), (1, 2), (2, 3), (2, 4), (4, 5)], [0.058, 0.053, 0.04, 0.046, 0.045, 0.04], 2, 0.006)
    me = evaluated_mesh(ob)
    deform(me, lambda p: V((p.x * (1.15 if p.y < -0.42 else 1.0), max(p.y, -0.495), p.z)))
    displace(me, lambda p, n: 0.004 * fbm(p, 12, 2, 5) + (0.006 if p.y < -0.41 else 0.004))
    me = decimate('shin', me, 1000)
    def mask(p, n):
        shoe = p.y < -0.405
        return 1.0, smooth01((fbm(p, 10, 2, 33) - 0.3) * 3) * 0.4, 0, 0.32 if shoe else 1.0
    export('shin', me, mask, ao_dist=0.06)

# ---------- brute armor (colours baked: cloth=plate accent) ----------
def build_brute():
    vest = join_meshes('vest', [box_mesh((0, 0.36, 0.012), (0.5, 0.42, 0.33), 0.06, 3),
                                box_mesh((0, 0.4, 0.172), (0.36, 0.26, 0.03), 0.012, 2),
                                box_mesh((0, 0.17, 0.155), (0.3, 0.12, 0.04), 0.012, 2)])
    ob = remesh_from_mesh('vest', vest, 0.008, 2); me = decimate('vest', evaluated_mesh(ob), 1600)
    displace(me, lambda p, n: 0.002 * fbm(p, 25, 2, 40))
    export('brute_vest', me, lambda p, n: (1.0 if p.z > 0.15 else 0.35, smooth01((fbm(p, 9, 2, 41) - 0.3) * 3) * 0.5,
                                           1.0 if (abs(p.y - 0.44) < 0.012 and p.z > 0.18 and abs(p.x) < 0.15) else 0.0, 1.0), ao_dist=0.06)
    pad = ico_obj('pad', 1.0, 4); pm = evaluated_mesh(pad)
    deform(pm, lambda p: V((p.x * 0.15, max(p.y, -0.2) * 0.1 + 0.02, p.z * 0.15)))
    export('brute_pad', pm, lambda p, n: (0.6, 0.2 * smooth01(fbm(p, 20, 2, 44) * 3), 1.0 if abs(p.y - 0.005) < 0.006 else 0.0, 1.0), ao_dist=0.03)
    hel = ico_obj('helmet', 1.0, 4); hm = evaluated_mesh(hel)
    deform(hm, lambda p: V((HEAD_C.x + p.x * 0.112, HEAD_C.y + 0.012 + max(p.y, -0.35) * 0.132, HEAD_C.z + p.z * 0.125)))
    export('brute_helmet', hm, lambda p, n: (0.35, 0.0, 1.0 if (abs(p.y - 0.17) < 0.012 and p.z > 0.07) else 0.0,
                                             0.4 if (abs(p.y - 0.17) < 0.02 and p.z > 0.06) else 1.0), ao_dist=0.03)

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
    jobs = [('head_a', lambda: build_head('a')), ('head_b', lambda: build_head('b')), ('jaw', build_jaw),
            ('torso_shirt', lambda: build_torso('shirt')), ('torso_bare', lambda: build_torso('bare')), ('pelvis', build_pelvis),
            ('uarm_sleeve', lambda: build_uarm('sleeve')), ('uarm_bare', lambda: build_uarm('bare')), ('farm', build_farm),
            ('thigh', build_thigh), ('shin', build_shin), ('brute', build_brute), ('boss_hump', build_boss_hump),
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
