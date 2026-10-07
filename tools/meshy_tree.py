"""Neon Quiver: turn a textured Meshy tree (GLB with embedded colour / normal maps) into models/tree.glb.

Runs inside Blender (no PIL or numpy-only path needed for the images):

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/meshy_tree.py -- in.glb models/tree.glb [--tris 12000] [--tex 1024]

What it does:
  1. imports the GLB, joins its meshes into one, triangulates, and decimates to --tris triangles if it has more
     (Meshy's own Remesh to that count first keeps the texture baked for the low mesh; this is the fallback)
  2. paints a leaf mask into the vertex colour's red channel: a vertex is a leaf when the colour map under it is
     green (g above r and b). r3.js loadMeshyTrees turns that into nqm.x: wind sway and the leaf shading, bark stays put
  3. shrinks the colour and normal maps to --tex px, drops the metal/rough map (the game shades roughness itself)
     and writes one GLB with JPEG textures, Y up, no animation.
"""
import sys, os
import bpy, bmesh
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2: print(__doc__); sys.exit(1)
src, out = argv[0], argv[1]
def opt(name, default): return type(default)(argv[argv.index(name) + 1]) if name in argv else default
TRIS, TEX = opt('--tris', 12000), opt('--tex', 1024)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert meshes, 'no mesh in ' + src
for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
# drop armatures / empties, bake the object's transform into the vertices
for o in list(bpy.context.scene.objects):
    if o is not ob: bpy.data.objects.remove(o, do_unlink=True)
ob.parent = None
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for m in list(ob.modifiers): ob.modifiers.remove(m)
me = ob.data
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(me); bm.free()
n_in = len(me.polygons)
if n_in > TRIS:
    mod = ob.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = TRIS / n_in; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
print('triangles %d -> %d, vertices %d' % (n_in, len(me.polygons), len(me.vertices)))

# ---- textures: find the colour and normal maps on the material ----
mat = ob.active_material or (me.materials[0] if me.materials else None)
assert mat and mat.use_nodes, 'no material'
nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
def tex_of(sock):
    for l in nt.links:
        if l.to_socket == sock:
            n = l.from_node
            if n.type == 'TEX_IMAGE': return n
            if n.type == 'NORMAL_MAP': return tex_of(n.inputs['Color'])
    return None
col_node, nrm_node = tex_of(bsdf.inputs['Base Color']), tex_of(bsdf.inputs['Normal'])
assert col_node and col_node.image, 'no colour map'
for name in ('Metallic', 'Roughness', 'Specular IOR Level', 'Emission Color', 'Emission Strength', 'Alpha'):
    s = bsdf.inputs.get(name)
    if s is None: continue
    for l in [l for l in nt.links if l.to_socket == s]: nt.links.remove(l)
bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 0.85
for n in [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n not in (col_node, nrm_node)]: nt.nodes.remove(n)

# ---- leaf mask from the colour map under each face corner ----
img = col_node.image; W, H = img.size
px = np.empty(W * H * img.channels, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, img.channels)
uvl = me.uv_layers.active; assert uvl, 'no UVs'
nl = len(me.loops); uv = np.empty(nl * 2, np.float32); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
u = np.clip((uv[:, 0] % 1.0) * W, 0, W - 1).astype(np.int64); v = np.clip((uv[:, 1] % 1.0) * H, 0, H - 1).astype(np.int64)
c = px[v, u, :3]
leaf_loop = ((c[:, 1] > c[:, 0] * 1.08) & (c[:, 1] > c[:, 2] * 1.08)).astype(np.float32)
# per vertex: the mean over its corners, then a vote with its neighbours so a leaf-coloured fleck of moss on a trunk stays bark
li = np.empty(nl, np.int64); me.loops.foreach_get('vertex_index', li)
nv = len(me.vertices); s = np.bincount(li, leaf_loop, nv); k = np.bincount(li, None, nv); leaf_v = s / np.maximum(k, 1)
ei = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', ei); ei = ei.reshape(-1, 2)
for _ in range(2):
    acc = np.bincount(ei[:, 0], leaf_v[ei[:, 1]], nv) + np.bincount(ei[:, 1], leaf_v[ei[:, 0]], nv)
    cnt = np.bincount(ei[:, 0], None, nv) + np.bincount(ei[:, 1], None, nv)
    leaf_v = 0.5 * leaf_v + 0.5 * acc / np.maximum(cnt, 1)
leaf_v = (leaf_v > 0.5).astype(np.float32)
print('leaf vertices %.1f%%' % (100 * leaf_v.mean()))
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
cols = np.zeros((nv, 4), np.float32); cols[:, 0] = leaf_v; cols[:, 3] = 1
ca.data.foreach_set('color', cols.ravel())
me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0

# ---- shrink the maps, export ----
for n in (col_node, nrm_node):
    if n and n.image and (n.image.size[0] > TEX or n.image.size[1] > TEX): n.image.scale(TEX, TEX)
if nrm_node and nrm_node.image: nrm_node.image.colorspace_settings.name = 'Non-Color'
kw = dict(filepath=out, export_format='GLB', export_apply=True, export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=86,
          export_texcoords=True, export_normals=True, export_yup=True, export_animations=False, export_skins=False, export_morph=False,
          export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True, use_selection=True)
for attempt in range(6):
    try: bpy.ops.export_scene.gltf(**kw); break
    except TypeError as e:   # an option this Blender does not know: drop it and retry
        bad = str(e).split('"')[1] if '"' in str(e) else None
        if bad and bad in kw: kw.pop(bad); continue
        raise
print('wrote', out, os.path.getsize(out) // 1024, 'KB')
