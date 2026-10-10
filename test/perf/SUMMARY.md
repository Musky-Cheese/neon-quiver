# Performance pass: overnight summary (29 Sep 2026)

Built on the expanded map (Flooded Metro + Refinery). `src/districts.js` is untouched, and `WORLD_BOUNDS`, `DISTRICTS` and the `Geo` helpers behave exactly as before.

## What changed

**Shading (`engine.js`)**
- Point and spot lights that are off (zero colour) or out of range for a pixel are skipped, including their shadow lookup and lighting maths. The pool always holds 16 point lights and 6 spots, and most of them don't reach any given pixel. Out of range, a light adds exactly 0, so skipping it changes nothing on screen.
- The rain-haze glow loop skips the same lights before its two `atan` calls.
- The rain-streak noise is only computed for the materials that use it.

**CPU (`game.js`, `r3.js`, `rig.js`, `world.js`, `zombies.js`)**
- Scene matrices are updated once per frame instead of once per render pass, and static objects are no longer recomputed every frame.
- Zombie bone matrices and bone textures only rebuild after a new pose, not on every render pass (reflection, world and bow).
- No per-frame allocations in the light pool, decals, hit tests or rig colours. Spatial lookups use numeric keys instead of strings.
- Instance buffers upload only the part in use. HUD text and styles are only written when they change.
- Auto-resolution: if almost every frame over about 1/3 s misses 30 fps, resolution steps down right away instead of waiting 1.5 s. When frames are fast, nothing changes.

**Geometry (`r3.js`)**
- Each 56 m world chunk now has its own compact vertex buffers. Bit-identical vertices are merged, zero-area triangles dropped, and 16-bit indices used where they fit.
- Camera culling also tests each chunk's bounding box, not just its sphere. Tall blocks' spheres are mostly empty air, so fewer chunks reach the main, reflection and shadow passes.
- All lamp light cones are drawn in one call, all halos in one instanced call, and signs in one instanced call per texture size.

## Numbers (SwiftShader software GPU in the cloud, 480x270, 30 zombies, every district, two clean runs each)

| | Low before | Low after | Balanced before | Balanced after |
|---|---|---|---|---|
| Draw calls / frame | 282 | 169 (-40%) | 534 | 328 (-39%) |
| Triangles / frame | 662k | 602k (-9%) | 2.18M | 1.72M (-21%) |
| Render JS (CPU) ms | 6.2 | 4.9–5.4 (-14–21%) | 8.4 | 6.5–6.6 (-22%) |
| Game logic ms | 1.8–2.2 | 1.8–2.1 | 1.3–1.4 | 1.3–1.4 |
| Wall ms (software GPU) | 903–931 | 964 (+5%) | 3509–3520 | 3520–3618 (+0–3%) |

Honest caveat: the cloud has no real GPU. SwiftShader runs both sides of every shader branch, so the light-skipping gain can't show up there, and total frame time comes out flat (Balanced) or about 5% slower (Low). The CPU savings and the lower draw-call and triangle counts carry over to a real laptop. The shader gain should too, but it has to be measured on your machine (see below).

## Visual check
`test/perf/shots.py` took 240 shots from fixed cameras (every district, all four qualities, wet/dry/snow) before and after. `test/perf/diff.py` flagged 235 as identical. The 5 flagged are all the same Sakura Gardens view (`garden-b`), with 0.05–0.07% of pixels differing on blossom edges. Two runs of the unchanged game already differ by about 0.04% on that view (software-renderer thread noise), and the changed pixels match that noise pattern. No console errors. All existing tests pass: `horde`, `play`, `shots`, `err`, `gait`, `street` and `zoo`. `play.py` ends with the player dead, but it does exactly the same on the old build.

## Rejected / skipped
- **Burying hidden faces** (removing faces inside closed boxes). Cut more triangles, but changed a few pixels in the Plaza, so it's left out.
- **Render-pipeline pass** (reflection, shadow and post-processing caching). That agent hit its usage limit before finishing, so its work was dropped unverified.
- **Not tried, because it changes the look** (your call):
  - Default to Low on weak integrated GPUs.
  - Lower the reflection resolution on Balanced.
  - Shorten the draw distance for props and foliage (it's 300 m today, and on clear-sky Looks the fog doesn't hide it).
  - Cap the point lights at 8 on Low.

## Check it on your laptop
1. Open the game with `?prof=1` on the URL, e.g. `https://musky-cheese.github.io/neon-quiver/?prof=1`.
2. Play a wave in a few districts. The overlay shows GPU time per pass, CPU frame time, draw calls and triangles.
3. For a before/after, compare against the old build at the commit before this work (`df39169`). If GPU time per frame is still high on Balanced, try Low. The auto-resolution now also reacts within about a third of a second.

# CPU pass (9 Oct 2026)

Step-side and render-side CPU work that leaves the picture untouched. Checked three ways: a seeded 90-step horde
(arrows, a blast, blood, corpses, a moving player) gives a bit-identical state sequence before and after; the nav
field and steering targets match the old flood cell for cell on every district; and fixed-camera frames of four
districts (3D and HUD canvases) match to within the software renderer's own run-to-run noise.

- **Rig posing:** bones no longer recompute their Euler `.rotation` on every quaternion write (nothing reads it);
  single-axis procedural rotations skip the trig on the zero axes (same expressions, bit for bit).
- **Nav:** the flood is Dijkstra with a binary heap (each cell settled once) and is skipped while the player stays in
  the same cell; the nearest free cell of every blocked cell is a table; a cell's steering target is kept for one flood.
- **Zombies:** corpses stay out of the spatial grid (every query skips them anyway); a body at rest reuses its ground
  height and skips the wall push.
- **Particles:** the update stops once every live particle has been seen instead of scanning all 5000 slots.
- **Render side:** sign buffers are repacked only when visibility or the Look changes; decal matrices are built once
  and uploaded only when a slot's decal changes (alpha only while fading); identity-transform scene objects skip the
  per-frame matrix recompose; the lamp sort uses the distances already measured; yaw-only `M4.trs` skips four trig calls.
- **HUD / audio:** the canvas HUD measures before the DOM HUD writes (no forced layout mid-frame); the minimap draws a
  crop of the map, not the whole city; ambient AudioParams are re-aimed only when the target changes; the listener is
  updated only when the player moved.

Measured in the cloud (no GPU, so only `step` is meaningful): 44 bodies (32 alive, 12 corpses) with a moving player,
`step()` went from about 0.8 ms to about 0.5 ms per frame.
