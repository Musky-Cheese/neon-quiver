# Neon Quiver

A first-person archery survival game that runs in the browser. Sector 7 is under quarantine: a rain-soaked cyberpunk city at night, with the plaza at its heart and three districts around it. Hold the bow, draw, release, and survive endless zombie waves that find you wherever you go.

- **Rendered with three.js** (r186, vendored in `vendor/`, no CDN): physically based lighting, shadows from the street lamps, mirror-accurate reflections in the puddles with rain ripples, light cones in the rain, procedural brick, concrete, steel and asphalt detail, bloom, and ambient occlusion on the High setting.
- **Small download:** about 1 MB on a first visit (the page, three.js and the zombie model).
- **Rigged zombies:** one skinned mesh per infected, rigged and animated in Blender (`models/zombie.glb`, built by `tools/make_rig.py`). Walk, run, heavy, crawl, attack, slam and roar clips blend into hit reactions and physics-driven deaths.
- **Desktop only:** keyboard and mouse, in any current Chrome, Edge, Firefox or Safari with WebGL2.

## Play locally

Serve the folder, then open it: `python3 -m http.server`, then `http://localhost:8000`. (Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.)

To rebuild `index.html` after editing `src/`, run `python3 build.py`.

## Deploy

**GitHub Pages**
1. Create a new repository and push the contents of this folder (the `index.html` must be at the repository root).
2. In the repo, open **Settings → Pages**, set **Source** to "Deploy from a branch", then choose `main` and `/ (root)`.
3. The game goes live at `https://<you>.github.io/<repo>/` within a minute or two.

**Netlify / Vercel / Cloudflare Pages / itch.io:** drag this folder onto their "deploy" drop zone. For itch.io, zip the folder and upload it as an HTML game with `index.html` as the entry point.

## Controls

| Input | Action |
|---|---|
| Mouse | Aim |
| Hold left click | Draw the bow (a full draw gives full damage, speed and a tight crosshair) |
| Release | Loose the arrow |
| Right click | Let the string down without firing |
| W A S D | Move · Shift sprint · Space jump |
| E | Open an Armory Terminal (between waves) |
| 1 – 4, mouse wheel | Switch arrow type · Q swaps to the last one |
| P / Esc | Pause · M toggles music |

## What's in the game

- **Bow viewmodel with real animation:** limbs flex and cams glow as you draw, the string snaps and oscillates on release, then the hand pulls back, reaches for the quiver and nocks the next arrow. Arrows fly with gravity drop.
- **Four arrow types:** Carbon (unlimited), Incendiary (sets zombies and the ground on fire), Plasma Charge (explodes on impact) and Rail Piercer (flat, fast, passes through five bodies).
- **The infected:** sculpted walkers, sprinting runners and armored brutes, with hit-location staggers, falls driven by the arrow's force, crawlers from leg shots, wall pinning and moderate gore. Every 5th wave brings *The Warden*, a boss that drops from the sky, slams the ground (jump to dodge) and summons runners. Hit its glowing core for extra damage.
- **An open city to roam:** Sector 7 plaza sits at the centre. North is the **Rail Yard** (container stacks, a parked freight train, a gantry crane and floodlights). East is the **Night Market** (rows of stalls, lantern strings, food carts and steam). West is **the Warrens** (brick tenements, fire escapes, dumpsters and burning barrels in narrow alleys). The south avenue is sealed by the quarantine gate. Zombies spawn out of sight around you and path through the streets to reach you. A minimap sits under the score.
- **Supplies:** amber **supply caches** refill special arrows and some health, then recharge. After each wave you have 35 seconds to reach one of the cyan **Armory Terminals** (one in the plaza and one per district) and press E to spend credits on draw speed, damage, reload speed, max health, move speed, healing and special arrows. An arrow on screen points to the nearest terminal.
- **Headshots, combos and credits.** Chain kills to build a score multiplier.
- **The city:** a procedural skyline, neon signs, holo billboards, flying traffic, a monorail crossing overhead, rain and bloom.
- Best score and best wave are saved in the browser.

## Ad and marketing assets (`ads/`)

| File | Use |
|---|---|
| `keyart-1920x1080.png` | Hero / YouTube / Steam-style capsule with logo and CTA |
| `square-1080x1080.png` | Instagram / Facebook feed (boss ad) |
| `story-1080x1920.png` | Stories / Reels / TikTok / Shorts |
| `social-1200x628.png` (+ `.jpg`) | Link-preview / X / LinkedIn / Facebook link ads (also the `og:image`) |
| `screenshot-horde-1920x1080.png`, `screenshot-boss-1920x1080.png` | Clean gameplay screenshots with the HUD, no ad copy |
| `logo-stacked-transparent.png`, `logo-wordmark-transparent.png`, `logo-stacked-dark.png` | Logos |
| `app-icon-1024.png` | Store and app icon (`icon-512.png`, `icon-192.png` and `favicon-64.png` sit at the root) |

If you host the game somewhere with a real domain, change the `og:image` meta tag in `index.html` to an absolute URL (for example `https://you.github.io/neon-quiver/ads/social-1200x628.png`). Link previews need an absolute URL.

## Characters (built in Blender)

The zombies, the Warden's growth, the brute armor and the player's cyber-armor gauntlets are sculpted by a Blender script, then packed into the game:

1. In Blender (tested on 5.2), open the **Scripting** tab and run this in the Python console:
   `exec(open(r"C:\path\to\neon-quiver\tools\make_models.py").read())`
   It writes one JSON file per part into `tools/sculpts/`.
2. Run `tools/make_rig.py` the same way. It skins the parts to an armature, bakes the animation clips and exports `models/zombie.glb`.
3. Shrink it for the web: `python3 tools/optimize_glb.py models/zombie.glb models/zombie.glb` (decimates to about half the triangles and quantizes the data, 1.3 MB to 0.45 MB).
4. Run `python3 tools/pack_models.py` (gauntlets and debris pieces), then `python3 build.py`.

Each part is built from blended spheres, voxel-remeshed and smoothed, then sculpted with noise (brows, sockets, cheekbones, ribs, torn cloth). It is decimated and painted with vertex masks: ambient occlusion, cloth, blood and glow. The game tints each zombie's skin, clothes and hair from those masks, so every zombie looks different.

## Editing the game

The readable source is in `src/`:

- `engine.js`: math, geometry and the shared material (surface detail, windows, puddles, reflections)
- `r3.js`: the three.js scene, lights, reflections, light cones, post-processing
- `city.js`: plaza, buildings, signs and traffic
- `districts.js`: the Rail Yard, Night Market and Warrens
- `world.js`: zombie pathfinding, spawning, supply caches, terminals and the minimap
- `rig.js`: the skinned zombies and their animation blending
- `bow.js`: bow viewmodel and draw/release/reload animation
- `zombies.js`: enemy types, AI and procedural animation
- `game.js`: player, arrows, waves, shop, HUD and the main loop
- `audio.js`: synthesized sound effects and music
- `seg.js`: the 16-segment neon lettering

After editing, run `python3 build.py`. It rebuilds `index.html`.

Balance numbers you will probably want to tune live near the top of their files: `ZTYPES` in `zombies.js` (health, speed and damage per enemy), `SHOP` in `game.js` (upgrade prices), and `GAME.startWave` / `GAME.spawnOne` in `game.js` (wave sizes and the enemy mix).

## Credits

- Code, art and audio were generated procedurally for this project.
- The UI font is a subset of **TeX Gyre Heros Condensed** by GUST e-foundry, renamed "Quiver Cn" for embedding, and used under the GUST Font License.
