# Neon Quiver

A first-person archery survival game that runs in the browser. Sector 7 is under quarantine: a rain-soaked cyberpunk city at night, with the plaza at its heart and districts all around it. Hold the bow, draw, release, and survive endless zombie waves that find you wherever you go.

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
| P / Esc | Pause |

## What's in the game

- **Bow viewmodel with real animation:** limbs flex and cams glow as you draw, the string snaps and oscillates on release, then the hand pulls back, reaches for the quiver and nocks the next arrow. Arrows fly with gravity drop.
- **Seven arrow types:** Carbon (unlimited), Incendiary (sets zombies and the ground on fire), Plasma Charge (explodes on impact), Rail Piercer (flat, fast, passes through five bodies), Cryo Burst (frosts everything within 5 m to a crawl), Tether (stakes its target in place and chains two more) and Scatter (six shards in a cone, brutal up close).
- **The infected:** sculpted walkers, sprinting runners and armored brutes, with hit-location staggers, falls driven by the arrow's force, crawlers from leg shots, wall pinning and moderate gore. Every 5th wave brings *The Warden*, a boss that drops from the sky, slams the ground (jump to dodge) and summons runners. Hit its glowing core for extra damage.
- **An open city to roam:** Sector 7 plaza sits at the centre. North is the **Rail Yard** (container stacks, a parked freight train, a gantry crane and floodlights). East is the **Night Market** (rows of stalls, lantern strings, food carts and steam). Past the far end of the market lie **the Docks** (a dead container port: stacks to get lost in, two gantry cranes over the quay, a cargo ship moored in black harbour water). The **Freight Line**, a walled rail cut lined with parked boxcars, runs from the Rail Yard's east wall round to the Docks. West is **the Warrens** (brick tenements, fire escapes, dumpsters and burning barrels in narrow alleys). North-west, between the Warrens and the Rail Yard, is the **Flooded Metro**: Line 3's open cut below the streets, with knee-deep water in the track beds, an island platform, a stalled train and a street bridge that came down into the cut. You reach it through a tiled underpass from the Warrens or a tunnel through the Rail Yard's west wall. South, past the freeway, are **the Suburbs** and the **Sakura Gardens**. South-east is **the Refinery** (a tank farm, distillation columns still venting, a loading rack with tankers, a tanker moored at the jetty, and a flare stack and cooling towers on the skyline). It lies between the Suburbs, down an access road off their eastern cross street, and the Docks, through a gate in the port's south wall. So both sides of the city loop. Zombies spawn out of sight around you and path through the streets to reach you. A minimap sits under the score.
- **Hazards:** flood water in the Metro slows you and the infected by about 30% as you wade through it knee-deep. A Cryo Burst landing in or near it freezes a 5 m patch over for about 14 seconds, and everyone crosses the ice at full speed. The Refinery's small **fuel tanks** bite back. An Incendiary arrow in a tank's wall, or burning ground at its base, starts it cooking: it hisses, jets flame and goes up about 1.6 seconds later. A Plasma Charge or any other explosion sets it off almost at once. The 9 m blast hits zombies hard and sets survivors on fire, hurts you too if you're inside it, leaves the ground burning and sets off any neighbours in reach. A Cryo Burst within about 5 m cools a cooking tank before it blows. Blown tanks come back 3 waves later.
- **Supplies:** amber **supply caches** refill special arrows and some health, then recharge. After each wave a 25-second countdown shows in the HUD (press N to start the next wave early) while you reach one of the cyan **Armory Terminals** (one in the plaza and one per district) and press E to spend credits on draw speed, damage, reload speed, max health, move speed, healing and special arrows. An arrow on screen points to the nearest terminal.
- **Health:** after 6 seconds without taking a hit you slowly regenerate, but only up to half your max health; pickups, the Med Injector and Dermal Plating get you the rest of the way.
- **Difficulty keeps climbing:** zombies hit harder and move faster every wave, the mix shifts toward runners and brutes, runners come in packs from wave 6, and white-eyed **elites** (tougher, faster, double rewards) appear from wave 8.
- **Grappling hook (Q):** fire at any wall, pole, crane or container within 36 m and get reeled toward it, keeping your momentum when it lets go (Q again cuts the rope; 8 s cooldown). You always come back down to the street, and falls over 5 m hurt, so the reticle turns green / amber / red to show what the landing will cost. X switches back to your last arrow.
- **Field objectives:** from wave 3, most waves throw up an optional goal mid-fight: hold a **Data Uplink** ring for 20 seconds while runners converge, or destroy a **Hive Nest** that keeps birthing the infected (the wave can't end while it lives). Both pay credits and drop supplies.
- **Weather that changes:** every minute or two the sky shifts between dry spells, drizzle, steady rain, wind-driven downpours with lightning and thunder, and snow that settles white on the streets and melts when the rain returns. Streets soak and dry gradually.
- **Headshots, combos and credits.** Chain kills to build a score multiplier.
- **The city:** a procedural skyline, neon signs, holo billboards, flying traffic, a monorail crossing overhead, rain and bloom.
- **Gamepad support:** plug in any standard-mapping controller (Xbox, PlayStation, Switch Pro in standard mode) and the game picks it up. Left stick moves (`L3` toggles sprint), right stick aims, `RT` draws and looses, `B` lets the string down (or cuts the grapple rope), `LT` is the grappling hook (hold to preview, release to fire), `A` jumps, `LB`/`RB` cycle arrows, `Y` returns to the last arrow, `X` uses an armory terminal, D-pad up starts the next wave early and `Start` pauses. The menus, shop and pause screen work from the pad too (d-pad or left stick to move, `A` to select, `B` to go back). Prompts switch to button names while you're on the pad, rumble marks drawing, firing, damage and explosions, and the pause menu gains Pad aim, Deadzone and Vibration settings once a controller is connected. Browsers only expose a pad after you press a button on it.
- **Settings and accessibility:** FOV slider (60–100), Invert Y, a screen-shake slider (0 turns it off), *Reduce flashing* (softens lightning, flashes and the draw aberration; on by default if your system asks for reduced motion) and a **Controls** screen where every key can be rebound (Esc, 1–7 and the arrow keys are fixed). Everything is saved in the browser.
- Best score and best wave are saved in the browser.
- **Surface textures on Balanced and up:** photo-scanned PBR textures (half resolution on Balanced, full on Sharp/Ultra, none on Fast) and real stone sills, lintels, ledges and cornices on street-facing buildings at every quality level.
- **Ultra quality** (Settings → Quality → Ultra) is for strong desktop GPUs: full-resolution photo-scanned PBR surface textures (asphalt, concrete, brick, rusted and corrugated steel, pavers, plaster) projected triplanar in world space on top of the city's own shading, real-time GTAO contact shadows, 1.5x supersampling, 4x-resolution moon/sun shadows over a wider area, and full-rate 2x-resolution shadows on all six nearby lamps. It never lowers resolution automatically. Textures download on demand: about 0.8 MB on Balanced, 3.7 MB on Sharp/Ultra.
- Add `?prof=1` to the URL for a performance overlay: GPU time per render pass, CPU frame time, draw calls and triangles.

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
- `districts.js`: the Rail Yard, Night Market, Docks, Freight Line, Warrens, Suburbs, Sakura Gardens, Flooded Metro and Refinery
- `hazards.js`: flood water and Cryo ice, the Refinery's exploding fuel tanks, and the Metro and Refinery's pouring pipes, flare stack, steam plumes and ambient sound
- `world.js`: zombie pathfinding, spawning, supply caches, terminals and the minimap
- `rig.js`: the skinned zombies and their animation blending
- `bow.js`: bow viewmodel and draw/release/reload animation
- `zombies.js`: enemy types, AI and procedural animation
- `game.js`: player, arrows, waves, shop, HUD and the main loop
- `audio.js`: synthesized sound effects and music
- `seg.js`: the 16-segment neon lettering
- `input.js`: the Controls (rebinding) screen and gamepad support

After editing, run `python3 build.py`. It rebuilds `index.html`.

Balance numbers you will probably want to tune live near the top of their files: `ZTYPES` in `zombies.js` (health, speed and damage per enemy), `SHOP` in `game.js` (upgrade prices), and `GAME.startWave` / `GAME.spawnOne` in `game.js` (wave sizes and the enemy mix).

## Credits

- Code, art and audio were generated procedurally for this project.
- The UI font is a subset of **TeX Gyre Heros Condensed** by GUST e-foundry, renamed "Quiver Cn" for embedding, and used under the GUST Font License.

## Credits
- Ultra surface textures: [Poly Haven](https://polyhaven.com) (CC0): asphalt_02, concrete_wall_008, red_brick_03, rusty_metal_02, corrugated_iron_02, concrete_pavers, plastered_wall_02, concrete_floor_worn_001. Re-fetch with `tools/fetch_textures.py`, pack with `tools/pack_textures.py`.
