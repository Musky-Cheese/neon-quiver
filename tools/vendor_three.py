import re,os,shutil
J='/home/claude/three/package/examples/jsm/'
OUT='vendor/addons/'
seen=set()
def go(rel):
    if rel in seen: return
    seen.add(rel)
    src=J+rel; dst=OUT+rel
    os.makedirs(os.path.dirname(dst),exist_ok=True); shutil.copy(src,dst)
    txt=open(src).read()
    for m in re.findall(r"""(?:from|import)\s*['"]([^'"]+)['"]""",txt):
        if m=='three': continue
        if m.startswith('three/addons/'): go(m[len('three/addons/'):])
        elif m.startswith('.'): go(os.path.normpath(os.path.join(os.path.dirname(rel),m)))
        else: print('??',m)
for f in ['postprocessing/EffectComposer.js','postprocessing/Pass.js','postprocessing/ShaderPass.js','postprocessing/UnrealBloomPass.js','postprocessing/GTAOPass.js','loaders/GLTFLoader.js','utils/BufferGeometryUtils.js']: go(f)
print(sorted(seen))
# the WebGPU build (game-webgpu.js): three.webgpu.js shares three.core.js with three.module.js; three.tsl.js is the TSL entry point
for f in ['three.module.js', 'three.core.js', 'three.webgpu.js', 'three.tsl.js']: shutil.copy(J + '../../build/' + f, 'vendor/' + f)
