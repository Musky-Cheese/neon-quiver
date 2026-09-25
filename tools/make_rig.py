# Neon Quiver — rig + animate the zombie in Blender and export models/zombie.glb
# Run in Blender's Python console (after make_models.py has written tools/sculpts/*.json),
# then shrink it for the web with: python tools/optimize_glb.py models/zombie.glb models/zombie.glb
#   exec(open(r"C:\Users\fouad\Downloads\neon-quiver\tools\make_rig.py").read())
#
# Game space is used as-is: +Y up, +Z forward. Every bone has an identity rest basis
# (all bones point +Y), so a bone's local rotation equals the joint rotation the game uses.
import bpy, json, os, math, time, traceback
from mathutils import Vector, Euler, Matrix

ROOT = r"C:\Users\fouad\Downloads\neon-quiver"
MOD = os.path.join(ROOT, 'models')
OUT = os.path.join(MOD, 'zombie.glb')
LOG = []
def log(*a):
    LOG.append(' '.join(str(x) for x in a))
    with open(os.path.join(MOD, '_rig_log.txt'), 'w') as f: f.write('\n'.join(LOG))

# ---------- skeleton (joint positions in bind pose) ----------
J = {
    'root': ((0, 0, 0), None),
    'pelvis': ((0, 0.95, 0), 'root'),
    'spine': ((0, 1.03, 0), 'pelvis'),
    'neck': ((0, 1.63, 0.02), 'spine'),
    'jaw': ((0, 1.715, 0.04), 'neck'),
    'shoulder.L': ((-0.27, 1.55, 0), 'spine'), 'elbow.L': ((-0.27, 1.23, 0), 'shoulder.L'),
    'shoulder.R': ((0.27, 1.55, 0), 'spine'), 'elbow.R': ((0.27, 1.23, 0), 'shoulder.R'),
    'hip.L': ((-0.11, 0.93, 0), 'pelvis'), 'knee.L': ((-0.11, 0.48, 0), 'hip.L'),
    'hip.R': ((0.11, 0.93, 0), 'pelvis'), 'knee.R': ((0.11, 0.48, 0), 'hip.R'),
}
ORDER = list(J.keys())

COLL = None
def setup():
    global COLL
    name = 'NQ_rig'
    COLL = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if COLL.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(COLL)
    for o in list(COLL.objects): bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name.startswith('NQ_'): bpy.data.actions.remove(a)
    # hide everything else from the export by excluding other collections from selection
    for o in bpy.context.scene.objects: o.select_set(False)

def make_armature():
    arm = bpy.data.armatures.new('NQ_Armature')
    ob = bpy.data.objects.new('NQ_Zombie', arm); COLL.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n in ORDER:
        p, par = J[n]
        b = arm.edit_bones.new(n)
        b.head = Vector(p); b.tail = Vector(p) + Vector((0, 0.06, 0))
        b.align_roll(Vector((0, 0, 1)))
        eb[n] = b
    for n in ORDER:
        par = J[n][1]
        if par: eb[n].parent = eb[par]; eb[n].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob

# ---------- meshes from the sculpt JSON ----------
def load_part(name):
    d = json.load(open(os.path.join(ROOT, 'tools', 'sculpts', name + '.json')))
    P = d['pos']; C = d['col']; E = d['emi']; I = d['idx']
    verts = [(P[i], P[i + 1], P[i + 2]) for i in range(0, len(P), 3)]
    faces = [(I[i], I[i + 1], I[i + 2]) for i in range(0, len(I), 3)]
    cols = [(C[i * 3] / 255, C[i * 3 + 1] / 255, C[i * 3 + 2] / 255, E[i] / 255) for i in range(len(verts))]
    return verts, faces, cols

def soften_glow(name, cols):
    if name.startswith('g_') or name.startswith('brute_') or name.startswith('boss_'): return cols
    return [(r, g, b, a if a > 0.98 else a * 0.3) for (r, g, b, a) in cols]

def ramp(x, a, b):
    if b == a: return 1.0
    t = (x - a) / (b - a); return 0.0 if t < 0 else 1.0 if t > 1 else t

def build_mesh(objname, part, offset, weightfn, mirror=False, scale=(1, 1, 1)):
    verts, faces, cols = load_part(part)
    cols = soften_glow(part, cols)
    sx, sy, sz = scale
    out = []
    for v in verts:
        x, y, z = v
        if mirror: x = -x
        out.append((x * sx + offset[0], y * sy + offset[1], z * sz + offset[2]))
    if mirror: faces = [(a, c, b) for (a, b, c) in faces]
    me = bpy.data.meshes.new(objname)
    me.from_pydata(out, [], faces); me.update()
    try: me.shade_smooth()
    except Exception:
        for p in me.polygons: p.use_smooth = True
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(cols): ca.data[i].color = c
    try: me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0
    except Exception: pass
    mat = bpy.data.materials.get('NQ_Skin') or bpy.data.materials.new('NQ_Skin')
    me.materials.append(mat)
    ob = bpy.data.objects.new(objname, me); COLL.objects.link(ob)
    # weights: weightfn(local_vertex) -> {bone: w}
    groups = {}
    for i, v in enumerate(verts):
        x, y, z = v
        if mirror: x = -x
        ws = weightfn((x, y, z))
        tot = sum(ws.values()) or 1.0
        for bname, w in ws.items():
            if w <= 0: continue
            g = groups.get(bname) or ob.vertex_groups.new(name=bname); groups[bname] = g
            g.add([i], w / tot, 'REPLACE')
    return ob

def W(**k): return k

def w_pelvis(p): t = ramp(p[1], 0.03, 0.1); return W(pelvis=1 - t * 0.5, spine=t * 0.5)
def w_torso(p):
    lo = 1 - ramp(p[1], -0.06, 0.04)            # waist blends into the pelvis
    hi = ramp(p[1], 0.58, 0.66)                 # neck stub follows the head a bit
    sideL = ramp(-p[0], 0.2, 0.3) * ramp(p[1], 0.4, 0.5)
    sideR = ramp(p[0], 0.2, 0.3) * ramp(p[1], 0.4, 0.5)
    return {'spine': max(0.05, 1 - lo * 0.5 - hi * 0.6 - sideL * 0.5 - sideR * 0.5), 'pelvis': lo * 0.5, 'neck': hi * 0.6, 'shoulder.L': sideL * 0.5, 'shoulder.R': sideR * 0.5}
def w_head(p): lo = 1 - ramp(p[1], -0.04, 0.05); return W(neck=1 - lo * 0.4, spine=lo * 0.4)
def w_uarm(side):
    def f(p):
        top = ramp(p[1], -0.02, 0.04); bot = 1 - ramp(p[1], -0.33, -0.27)
        return {'shoulder.' + side: 1 - top * 0.35 - bot * 0.5, 'spine': top * 0.35, 'elbow.' + side: bot * 0.5}
    return f
def w_farm(side):
    def f(p): top = ramp(p[1], -0.03, 0.03); return {'elbow.' + side: 1 - top * 0.45, 'shoulder.' + side: top * 0.45}
    return f
def w_thigh(side):
    def f(p):
        top = ramp(p[1], -0.01, 0.06); bot = 1 - ramp(p[1], -0.45, -0.39)
        return {'hip.' + side: 1 - top * 0.4 - bot * 0.5, 'pelvis': top * 0.4, 'knee.' + side: bot * 0.5}
    return f
def w_shin(side):
    def f(p): top = ramp(p[1], -0.03, 0.03); return {'knee.' + side: 1 - top * 0.45, 'hip.' + side: top * 0.45}
    return f
def rigid(b): return lambda p: {b: 1.0}

def jpos(n): return J[n][0]

def build_meshes(arm):
    obs = []
    add = lambda o: obs.append(o)
    add(build_mesh('pelvis', 'pelvis', jpos('pelvis'), w_pelvis))
    add(build_mesh('torso_shirt', 'torso_shirt', jpos('spine'), w_torso))
    add(build_mesh('torso_bare', 'torso_bare', jpos('spine'), w_torso))
    add(build_mesh('head_a', 'head_a', jpos('neck'), w_head))
    add(build_mesh('head_b', 'head_b', jpos('neck'), w_head))
    add(build_mesh('jaw', 'jaw', jpos('jaw'), rigid('jaw')))
    for s, mir in (('L', True), ('R', False)):
        # left side is mirrored from the right-hand sculpts where handedness matters
        add(build_mesh('uarm_sleeve.' + s, 'uarm_sleeve', jpos('shoulder.' + s), w_uarm(s)))
        add(build_mesh('uarm_bare.' + s, 'uarm_bare', jpos('shoulder.' + s), w_uarm(s)))
        add(build_mesh('farm.' + s, 'farm', jpos('elbow.' + s), w_farm(s), mirror=mir))
        add(build_mesh('thigh.' + s, 'thigh', jpos('hip.' + s), w_thigh(s)))
        add(build_mesh('shin.' + s, 'shin', jpos('knee.' + s), w_shin(s)))
        add(build_mesh('brute_pad.' + s, 'brute_pad', (jpos('shoulder.' + s)[0], jpos('shoulder.' + s)[1] + 0.02, 0), rigid('shoulder.' + s)))
    add(build_mesh('brute_vest', 'brute_vest', jpos('spine'), rigid('spine')))
    add(build_mesh('brute_helmet', 'brute_helmet', jpos('neck'), rigid('neck')))
    add(build_mesh('boss_hump', 'boss_hump', jpos('spine'), rigid('spine')))
    for o in obs:
        o.parent = arm
        m = o.modifiers.new('Armature', 'ARMATURE'); m.object = arm
    return obs

# ---------- animation: procedural gaits sampled into keyframes ----------
FPS = 30
def pose_for(clip, t, kind):
    """Returns dict bone -> (rx, ry, rz) plus 'loc' for pelvis (offset from rest). t in [0,1) for loops."""
    TAU = math.tau
    p = t * TAU
    w, c = math.sin(p), math.cos(p)
    P = {}
    moving = 1.0
    lean = {'walker': 0.28, 'runner': 0.5, 'brute': 0.22, 'boss': 0.3}[kind]
    shL, shR, elL, elR, spread, headRx = -1.35, -1.25, -0.25, -0.35, 0.12, -0.15
    twist = w * 0.12
    hipY = abs(c) * 0.05
    hipLa = w * 0.55 * (1.35 if kind == 'runner' else 1); hipRa = -hipLa
    knLa = max(0, -c) * 0.9 + 0.05; knRa = max(0, c) * 0.9 + 0.05
    pelRx = 0.0; roll = 0.0; jaw = 0.15; spineRz = math.sin(p * 0.5) * 0.05
    if kind == 'walker':
        shL += math.sin(p * 0.5) * 0.18; shR += math.cos(p * 0.5) * 0.18
        roll = math.sin(p) * 0.12 + 0.1                     # lolling head
        hipLa *= 0.9; knRa *= 0.7                            # dragging right leg
    if kind == 'runner':
        shL, shR = -0.5 - w * 0.95, -0.5 + w * 0.95; elL = elR = -1.3; headRx = 0.35; spread = 0.2
        hipY = abs(c) * 0.08
    if kind == 'brute':
        shL, shR = -0.35 + w * 0.35, -0.35 - w * 0.35; elL = elR = -0.5; spread = 0.3; hipY = abs(c) * 0.035
    if kind == 'boss':
        shL, shR = -0.6 + w * 0.3, -0.6 - w * 0.3; elL = elR = -0.7; spread = 0.35
    if clip == 'idle':
        b = math.sin(p)
        hipLa = hipRa = 0.02; knLa = knRa = 0.08; hipY = 0.01 * b; twist = 0.05 * math.sin(p * 0.5)
        shL = -1.1 + 0.08 * b; shR = -1.0 - 0.08 * b; headRx = -0.1 + 0.08 * math.sin(p * 2); roll = 0.2 * math.sin(p * 0.5); jaw = 0.25 + 0.15 * max(0, b)
    if clip == 'attack':
        a = t
        up = (1 - (1 - a / 0.5) ** 3) if a < 0.5 else 1 - ease_in_out((a - 0.5) / 0.5)
        shL = lerp(shL, -2.6, up); shR = lerp(shR, -2.5, up * 0.9)
        if a > 0.5: shL = lerp(-2.6, -0.6, ease_out((a - 0.5) / 0.3)); shR = lerp(-2.5, -0.7, ease_out((a - 0.5) / 0.35))
        lean += 0.25 if a > 0.5 else -0.1; jaw = 0.6; hipLa = hipRa = 0.1; knLa = knRa = 0.15; hipY = 0; twist = 0.25 * math.sin(a * math.pi)
    if clip in ('crawl', 'crawl_attack'):
        hipY = 0.2 - 0.95; pelRx = 1.42; lean = 0.08; headRx = -1.1; twist = w * 0.15
        shL, shR = -2.35 + 0.75 * w, -2.35 - 0.75 * w; elL = -0.2 - 0.5 * max(0, w); elR = -0.2 - 0.5 * max(0, -w); spread = 0.35
        hipLa, hipRa = 0.12 + 0.08 * w, 0.1 - 0.08 * w; knLa, knRa = 0.35, 0.2; roll = 0.1 * w; jaw = 0.3
        if clip == 'crawl_attack':
            a = t; shL = -2.9 + a * 1.5; shR = -2.7 + a * 1.2; jaw = 0.7; twist = 0
    if clip == 'slam':
        a = t; hipLa = hipRa = 0.05; knLa = knRa = 0.1; hipY = 0
        if a < 0.55: k = ease_out(a / 0.55); shL = shR = lerp(-0.6, -3.1, k); elL = elR = lerp(-0.7, -0.4, k); lean = lerp(lean, -0.25, k)
        else: k = ease_out(min(1, (a - 0.55) / 0.1)); shL = shR = lerp(-3.1, -1.0, k); elL = elR = -0.2; lean = lerp(-0.25, 0.75, k); knLa = knRa = 0.1 + 0.4 * k; hipLa = hipRa = -0.3 * k; hipY = -0.08 * k
        jaw = 0.7
    if clip == 'roar':
        a = t; k = math.sin(min(1, a / 0.3) * math.pi / 2)
        headRx = lerp(headRx, -0.7, k); shL = shR = lerp(shL, -0.9, k); spread = lerp(spread, 0.9, k); lean = lerp(lean, -0.15, k); jaw = lerp(0.15, 0.9, k)
        hipLa = hipRa = 0.02; knLa = knRa = 0.1; hipY = 0; twist = 0.04 * math.sin(a * 40)
    P['pelvis'] = (pelRx, twist, 0.0); P['loc'] = (0, hipY, 0)
    P['spine'] = (lean, -twist * 1.5, spineRz)
    P['neck'] = (headRx, 0.0, roll)
    P['jaw'] = (jaw, 0, 0)
    P['shoulder.L'] = (shL, 0, -spread); P['shoulder.R'] = (shR, 0, spread)
    P['elbow.L'] = (elL, 0, 0); P['elbow.R'] = (elR, 0, 0)
    P['hip.L'] = (hipLa, 0, 0.03); P['hip.R'] = (hipRa, 0, -0.03)
    P['knee.L'] = (knLa, 0, 0); P['knee.R'] = (knRa, 0, 0)
    return P

def lerp(a, b, t): return a + (b - a) * t
def ease_out(t): t = max(0, min(1, t)); return 1 - (1 - t) ** 3
def ease_in_out(t):
    t = max(0, min(1, t)); return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2

# name, kind, clip, frames (loops sample t in [0,1) and repeat the first key at the end)
CLIPS = [('walk', 'walker', 'walk', 36, True), ('run', 'runner', 'run', 18, True), ('heavy', 'brute', 'walk', 44, True),
         ('boss_walk', 'boss', 'walk', 56, True), ('idle', 'walker', 'idle', 60, True), ('attack', 'walker', 'attack', 26, False),
         ('crawl', 'walker', 'crawl', 40, True), ('crawl_attack', 'walker', 'crawl_attack', 24, False),
         ('slam', 'boss', 'slam', 48, False), ('roar', 'boss', 'roar', 42, False)]

def animate(arm):
    arm.animation_data_create()
    act = bpy.data.actions.new('NQ_All'); arm.animation_data.action = act
    pb = arm.pose.bones
    for b in pb: b.rotation_mode = 'QUATERNION'
    start = 0; ranges = {}
    for (name, kind, clip, n, loop) in CLIPS:
        for f in range(n + 1):
            t = (f / n) if loop else min(1.0, f / n)
            if loop and f == n: t = 0.0
            P = pose_for(clip, t, kind)
            fr = start + f
            for bname in ORDER:
                if bname == 'root': continue
                e = P.get(bname, (0, 0, 0))
                q = Euler((e[0], e[1], e[2]), 'ZXY').to_quaternion()   # == Ry*Rx*Rz as used in the game
                pb[bname].rotation_quaternion = q
                pb[bname].keyframe_insert('rotation_quaternion', frame=fr)
                if bname == 'pelvis':
                    pb[bname].location = Vector(P['loc']); pb[bname].keyframe_insert('location', frame=fr)
        ranges[name] = [start, start + n, loop]
        start += n + 6
    bpy.context.scene.frame_start = 0; bpy.context.scene.frame_end = start
    bpy.context.scene.render.fps = FPS
    # constant interpolation between clips is irrelevant (the game subclips by frame ranges)
    with open(os.path.join(MOD, 'zombie_clips.json'), 'w') as f: json.dump({'fps': FPS, 'clips': ranges}, f)
    for b in pb: b.rotation_quaternion = (1, 0, 0, 0); b.location = (0, 0, 0)
    return ranges

def export(arm, obs):
    for o in bpy.context.scene.objects: o.select_set(False)
    arm.select_set(True)
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    want = dict(filepath=OUT, export_format='GLB', use_selection=True, export_yup=False, export_apply=False,
                export_animations=True, export_skins=True, export_def_bones=False, export_frame_range=True,
                export_force_sampling=True, export_optimize_animation_size=False, export_nla_strips=False,
                export_animation_mode='ACTIVE_ACTIONS', export_vertex_color='ACTIVE', export_all_vertex_colors=True,
                export_normals=True, export_texcoords=False, export_materials='PLACEHOLDER', export_extras=False,
                export_rest_position_armature=True, export_morph=False)
    kw = {k: v for k, v in want.items() if k in props}
    log('export kwargs', sorted(kw.keys()))
    r = bpy.ops.export_scene.gltf(**kw)
    log('export result', r, os.path.getsize(OUT) if os.path.exists(OUT) else 'missing')

def run():
    t0 = time.time()
    try:
        setup(); arm = make_armature(); log('armature ok')
        obs = build_meshes(arm); log('meshes', len(obs))
        ranges = animate(arm); log('clips', ranges)
        export(arm, obs)
    except Exception:
        log('FAILED', traceback.format_exc())
    log('DONE', round(time.time() - t0, 1), 's', bpy.app.version_string)
    return LOG[-1]

print(run())
