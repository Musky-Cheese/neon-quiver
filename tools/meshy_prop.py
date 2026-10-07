"""Neon Quiver: turn a textured Meshy prop (GLB with embedded colour / normal maps) into a game model.

Runs inside Blender, like tools/meshy_tree.py:

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/meshy_prop.py -- in.glb models/bush_box.glb --mask foliage
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --python tools/meshy_prop.py -- in.glb models/lantern_kasuga.glb --mask glow --band 0.55 0.75

Options: --tris N (decimate to N triangles if the mesh has more; Meshy's own Remesh first keeps the texture baked for the
low mesh, this is the fallback), --tex PX (shrink the colour and normal maps), --mask:
  foliage  everything above --base (fraction of the height, default 0.08) is foliage: COLOR_0.r = 1 (r3.js loadMeshyProps
           shades it like leaves), the stems and the soil under it 0
  glow     the lantern's fire box: in the height band --band LO HI, the bright, warm texels (the paper screens) get
           COLOR_0.r = their glow (0..1); r3.js turns that into the lantern's light
  none     COLOR_0.r = 0 everywhere
The model is joined into one mesh, triangulated, its metal/rough map dropped (the game shades roughness itself) and written
as one GLB with JPEG textures, Y up, no animation. r3.js stands it on its base and scales it to size.
"""
import sys, os
import bpy, bmesh
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2: print(__doc__); sys.exit(1)
src, out = argv[0], argv[1]
def opt(name, default): return type(default)(argv[argv.index(name) + 1]) if name in argv else default
TRIS, TEX, MASK, BASE = opt('--tris', 10000), opt('--tex', 1024), opt('--mask', 'foliage'), opt('--base', 0.08)
BAND = (float(argv[argv.index('--band') + 1]), float(argv[argv.index('--band') + 2])) if '--band' in argv else (0.5, 0.8)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert meshes, 'no mesh in ' + src
for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
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

# ---- textures: the colour and normal maps on the material ----
mat = ob.active_material or (me.materials[0] if me.materials else None)
assert mat and mat.node_tree, "no material"
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

# ---- the mask, per vertex, into COLOR_0.r ----
nv = len(me.vertices)
co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
y = co[:, 2]; y0, y1 = y.min(), y.max(); hy = (y - y0) / max(1e-6, y1 - y0)   # Blender is Z up after the glTF import
mask = np.zeros(nv, np.float32)
if MASK == 'foliage':
    mask = np.clip((hy - BASE) / 0.04, 0, 1)
elif MASK == 'glow':
    img = col_node.image; W, H = img.size
    px = np.empty(W * H * img.channels, np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, img.channels)
    uvl = me.uv_layers.active; assert uvl, 'no UVs'
    nl = len(me.loops); uv = np.empty(nl * 2, np.float32); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    u = np.clip((uv[:, 0] % 1.0) * W, 0, W - 1).astype(np.int64); v = np.clip((uv[:, 1] % 1.0) * H, 0, H - 1).astype(np.int64)
    c = px[v, u, :3]; lum = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    li = np.empty(nl, np.int64); me.loops.foreach_get('vertex_index', li)
    # paper: brighter than the stone round it and not green (moss), inside the fire box's height band
    warm = np.clip((c[:, 0] - c[:, 2]) * 6 + 0.6, 0, 1) * np.clip((c[:, 0] - c[:, 1] * 0.92) * 8 + 0.6, 0, 1)
    st = np.percentile(lum, 60)
    glow_loop = np.clip((lum - st * 1.15) / max(1e-4, st * 0.5), 0, 1) * warm
    s = np.bincount(li, glow_loop, nv); k = np.bincount(li, None, nv); mask = s / np.maximum(k, 1)
    band = np.clip((hy - BAND[0]) / 0.02, 0, 1) * np.clip((BAND[1] - hy) / 0.02, 0, 1)
    mask = (mask * band).astype(np.float32)
print('mask %s: mean %.3f, >0.5 on %.1f%% of vertices' % (MASK, mask.mean(), 100 * (mask > 0.5).mean()))
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
cols = np.zeros((nv, 4), np.float32); cols[:, 0] = mask; cols[:, 3] = 1
ca.data.foreach_set('color', cols.ravel())
me.color_attributes.active_color = ca; me.color_attributes.render_color_index = 0

# ---- shrink the maps, export ----
for n in nt.nodes:   # every map the export keeps (a normal map behind its Normal Map node too)
    if n.type == 'TEX_IMAGE' and n.image:
        n.image.pixels[0]   # packed images load lazily: their size reads 0 until touched
        if n.image.size[0] > TEX or n.image.size[1] > TEX:
            # a fresh image from the scaled pixels: the exporter otherwise re-embeds the packed original's bytes
            src_img = n.image; src_img.scale(TEX, TEX); cs = src_img.colorspace_settings.name
            img2 = bpy.data.images.new(src_img.name + '_s', TEX, TEX, alpha=False); img2.colorspace_settings.name = cs
            px2 = np.empty(TEX * TEX * 4, np.float32); src_img.pixels.foreach_get(px2); img2.pixels.foreach_set(px2); img2.pack()
            n.image = img2
        print('map', n.image.name, tuple(n.image.size))
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
