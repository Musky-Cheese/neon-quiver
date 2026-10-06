# Neon Quiver

A first-person archery survival game that runs in the browser. Sector 7 is under quarantine: a rain-soaked cyberpunk city at night, with the plaza at its heart and districts all around it. Hold the bow, draw, release, and survive endless zombie waves that find you wherever you go.

- **Rendered with three.js** (r186, vendored in `vendor/`, no CDN): physically based lighting, shadows from the street lamps, mirror-accurate reflections in the puddles with rain ripples, light cones in the rain, procedural brick, concrete, steel and asphalt detail, bloom, and real-time ambient occlusion on Ultra.
- **Download:** about 1.7 MB compressed on a first visit (the page, the game, three.js's WebGPU build with its node post-processing, and the zombie rig). The textured zombie models and the surface textures (3.7 MB) stream in behind it.
- **Rigged zombies:** one skinned mesh per infected, rigged and animated in Blender (`models/zombie.glb`, built by `tools/make_rig.py`). Walk, run, heavy, crawl, attack, slam and roar clips blend into hit reactions and physics-driven deaths.
- **Desktop only:** keyboard and mouse, in any current Chrome, Edge, Firefox or Safari with WebGPU or WebGL2.
- **One renderer, two backends:** the game draws with three.js's WebGPURenderer and shaders written in TSL (three's node shading language). Where the browser has a working WebGPU adapter it runs on **WebGPU**; where it doesn't (no WebGPU, no adapter for this GPU or driver, or WebGPU fails to start) the same renderer and shaders run on its **WebGL2 compatibility** backend, with the same look. There is nothing to choose: **Settings** (title or pause screen) shows which backend is drawing, and hovering it on WebGL2 says why WebGPU wasn't used.

## Play locally

Serve the folder, then open it: `python3 -m http.server`, then `http://localhost:8000`. (Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.)

To rebuild after editing `src/`, run `python3 build.py`. It writes `index.html` (the page and its boot script) and `game.js` (the game). Add `?gpu=webgl` to the URL to force the WebGL2 backend even where WebGPU works (handy for checking it, and for comparing the two with `?prof=1`), or `?gpu=webgpu` to skip the WebGPU check.

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
| W A S D | Move · Shift sprint (limited by stamina) · Space jump · hold C to crouch |
| 1 – 3 | The special arrows in your quiver's three slots; press the same key again (or `` ` ``) for standard arrows · mouse wheel cycles · X swaps to the last one |
| E | Reopen the Armory at a terminal between waves · hold at a Supply Drop to crack it · N starts the next wave early |
| P / Esc | Pause |

## What's in the game

- **Bow viewmodel with real animation:** limbs flex and cams glow as you draw, the string snaps and oscillates on release, then the hand pulls back, reaches for the quiver and nocks the next arrow. Arrows fly with gravity drop.
- **Standard arrows plus six specials:** you carry 20 standard arrows into each wave (more with Quiver Size) and pick spent ones back up off the street and out of the bodies. Special arrows are unlocked and levelled in the Armory, and up to three ride in the quiver at once: **Piercer** (flat and fast, passes through 2/3/5 bodies), **Blast Arrow** (detonates on impact, 2–4 m, knockback at Lv 3), **Shock Arrow** (arcs to 2/3/5 nearby zombies, stuns at Lv 3), **Cryo Arrow** (slows what it hits 40–50%, freezes it solid at Lv 3, and still ices over flood water), **Splitter** (breaks into 3/4/5 bolts a few metres out) and **Tracer** (tags zombies with a marker you see through walls for 4–8 s; Lv 3 tags the whole group). Each equipped special is topped up at the start of every wave.
- **The infected:** sculpted walkers, sprinting runners and armored brutes, with hit-location staggers, falls driven by the arrow's force, crawlers from leg shots, wall pinning and moderate gore. Every 5th wave brings *The Warden*, a boss that drops from the sky, slams the ground (jump to dodge) and summons runners. Hit its glowing core for extra damage.
- **An open city to roam:** Sector 7 plaza sits at the centre. North is the **Rail Yard** (container stacks, a parked freight train, a gantry crane and floodlights). East is the **Night Market** (rows of stalls, lantern strings, food carts and steam). Past the far end of the market lie **the Docks** (a dead container port: stacks to get lost in, two gantry cranes over the quay, a cargo ship moored in black harbour water). The **Freight Line**, a walled rail cut lined with parked boxcars, runs from the Rail Yard's east wall round to the Docks. West is **the Warrens** (brick tenements, fire escapes, dumpsters and burning barrels in narrow alleys). North-west, between the Warrens and the Rail Yard, is the **Flooded Metro**: Line 3's open cut below the streets, with knee-deep water in the track beds, an island platform, a stalled train and a street bridge that came down into the cut. You reach it through a tiled underpass from the Warrens or a tunnel through the Rail Yard's west wall. South, past the freeway, are **the Suburbs** and the **Sakura Gardens**. South-east is **the Refinery** (a tank farm, distillation columns still venting, a loading rack with tankers, a tanker moored at the jetty, and a flare stack and cooling towers on the skyline). It lies between the Suburbs, down an access road off their eastern cross street, and the Docks, through a gate in the port's south wall. So both sides of the city loop. Zombies spawn out of sight around you and path through the streets to reach you. A minimap sits under the score.
- **Hazards:** flood water in the Metro slows you and the infected by about 30% as you wade through it knee-deep. A Cryo Arrow landing in or near it freezes a 5 m patch over for about 14 seconds, and everyone crosses the ice at full speed. The Refinery's small **fuel tanks** bite back. Burning ground at a tank's base starts it cooking: it hisses, jets flame and goes up about 1.6 seconds later. A Blast Arrow or any other explosion that reaches it sets it off almost at once. The 9 m blast hits zombies hard and sets survivors on fire, hurts you too if you're inside it, leaves the ground burning and sets off any neighbours in reach. A Cryo Arrow within about 5 m cools a cooking tank before it blows. Blown tanks come back 3 waves later.
- **The Armory:** a moment after each wave is cleared the Armory opens with a 45-second countdown to the next wave (**Start wave** skips it). Spend **scrap** in three tabs: **Arrows** (unlock, then upgrade to Lv 3: Piercer, Blast, Shock, Cryo, Splitter, Tracer), **Bow** (to Lv 4: Draw Speed, Draw Power, Quiver Size, Steady Aim, Arrow Recovery) and **Survival** (to Lv 3: Slow Regen, Max Health, Armor Plating, Sprint Stamina). Click a card for its description, level and Now → Next effect; the **Quiver loadout** row holds three special arrows (a newly unlocked arrow equips itself if a slot is free). Esc goes back to the street with the clock still running, and the cyan **Armory Terminals** (one in the plaza and one per district, E) reopen it.
- **Scrap:** 7 per walker, 9 per runner, 10–11 for spitters, screamers and climbers, 22 per brute and 150 for the Warden; elites pay double and headshots add 2. Clearing a wave pays 20 + 6 × the wave number and field objectives 40–50 + 6 × the wave. That buys roughly one upgrade per wave early on, and the whole Armory by around wave 20. Tune it in `ZTYPES` (`zombies.js`) and `GAME.update` (`game.js`); prices are in `ARMORY` and effects in `UPG` (`armory.js`).
- **Supplies:** amber **supply caches** give back 10 standard arrows, some of each equipped special and 15 HP, then recharge. The infected sometimes drop arrows and health.
- **Health:** regeneration is slow on purpose: 6 seconds after your last hit you get back 1 HP every 4 s (every 2.5 s with Slow Regen maxed). Pickups and supply caches are the fast way back.
- **Stamina:** sprinting lasts 5 s (up to 9 s with Sprint Stamina) and refills after a short breather; run it dry and you're winded until it's back to 30%.
- **Difficulty keeps climbing:** zombies hit harder and move faster every wave, the mix shifts toward runners and brutes, runners come in packs from wave 6, and white-eyed **elites** (tougher, faster, double rewards) appear from wave 8.
- **Grappling hook (Q):** fire at any wall, pole, crane or container within 36 m and get reeled toward it, keeping your momentum when it lets go (Q again cuts the rope; 8 s cooldown). You always come back down to the street, and falls over 5 m hurt, so the reticle turns green / amber / red to show what the landing will cost. X switches back to your last arrow.
- **Field objectives:** from wave 3, most waves throw up an optional goal mid-fight (never the same one twice running): hold a **Data Uplink** ring for 20 seconds while runners converge; destroy a **Hive Nest** that keeps birthing the infected (the wave can't end while it lives); claim a **Bounty** on a named, gold-eyed **Alpha** (a souped-up elite brute or runner, marked through walls) that keeps howling up runner packs, inside 90 seconds; or reach a parachuted **Supply Drop** and hold **E** beside it for 4 seconds to crack it open (a full quiver, a top-up of every equipped special and 30 HP) before the infected loot it. All pay scrap; the objective shows on the minimap.
- **Sector alerts:** from wave 4, about two in five regular waves come with a twist, named on the wave banner and paid for with a bigger clear bonus: **Frenzy** (runners and climbers only), **Ironclad** (brutes in force), **Swarm** (nearly twice as many at half the health), **Blood Moon** (elites everywhere, from wave 6) and **Volatile** (bodies swell and burst a moment after they drop, hurting nearby infected and you, and chaining). Never on Warden waves, and never the same alert twice in a row. Tune them in `MUTS` (`objectives.js`).
- **Weather that changes:** every minute or two the sky shifts between dry spells, drizzle, steady rain, wind-driven downpours with lightning and thunder, and snow that settles white on the streets and melts when the rain returns. Streets soak and dry gradually.
- **Headshots and combos.** Chain kills to build a score multiplier.
- **The city:** a procedural skyline, neon signs, holo billboards, flying traffic, a monorail crossing overhead, rain and bloom.
- Best score and best wave are saved in the browser.
- **Quality: High or Ultra** (Settings → Quality). Both draw the full city: photo-scanned PBR surface textures, 4x MSAA, the wet-street mirror at full resolution, bloom, lamp shadows and real stone sills, lintels, ledges and cornices on street-facing buildings. New players start on High.
- **Resolution** (Settings → Resolution): **Auto** (the default) renders up to native 4K and lowers the resolution by itself when frames run slow, raising it again when they don't; or pick a fixed 100%, 85%, 75%, 67% or 50%, which never changes. It scales the quality level's own render size, so on Ultra 100% still means 1.5x supersampling. Saved settings from older versions move to High (Ultra stays Ultra), with Auto resolution.
- **Hero cherry trees:** three Meshy-authored sakuras anchor the garden while sharing one 389 KB model and one instanced draw call; the surrounding forest keeps the lightweight procedural LODs.
- **Ultra quality** adds to High: real-time GTAO contact shadows, 1.5x supersampling, 4x-resolution moon/sun shadows over a wider area, the wet-street mirror refreshed every frame, and full-rate 2x-resolution shadows on all six nearby lamps. The surface textures (asphalt, concrete, brick, rusted and corrugated steel, pavers, plaster) are projected triplanar in world space on top of the city's own shading on both levels.
- **Built to keep running:** if the browser resets the graphics card (after sleep, or a busy GPU) the game pauses, says so, and offers a reload (your best score is saved). If something breaks, an error screen explains it and offers a reload instead of a frozen picture.
- **Look pass:** the infected get a soft camera-side fill and a two-tone neon rim so they read against the city, wet sheen on heads and shoulders in the rain, and brighter eyes. Towers have more life in their windows (office floors left on, blue TV rooms), mast beacons and car hazards blink on their own beat, clouds glow from the city below, working hover-car pods light the street, canopies sway with the weather and let light through their edges, and blossom petals ride the gusts. Art direction sheets for all of it live on the design canvas.
- Add `?prof=1` to the URL for a performance overlay: the backend, GPU time per render pass from timestamp queries (shadows, wet-street mirror, env map, world, bow, AO prepass, GTAO, bloom, grade), CPU frame time, draw calls and triangles. It needs a browser that exposes timestamp queries; on the WebGL2 backend the passes inside the post pipeline are timed together under one entry.

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

- `boot.js`: runs before any game code: checks for a working WebGPU adapter and device, tells the game whether to use the WebGL2 backend, then loads `game.js`
- `engine.js`: math, geometry, the renderer and the shared shader uniforms
- `gpu.js`: every shader, in TSL (three's node shading language): the shared material (surface detail, windows, puddles, reflections), sky, light cones, signs, decals, particles, rain, snow, halos and glass, the post chain (MSAA, GTAO, bloom, grade) and the per-pass GPU timer
- `r3.js`: the three.js scene, lights, shadows, the wet-street mirror, env maps, quality settings and the frame
- `city.js`: plaza, buildings, signs and traffic
- `districts.js`: the Rail Yard, Night Market, Docks, Freight Line, Warrens, Suburbs, Sakura Gardens, Flooded Metro and Refinery
- `hazards.js`: flood water and Cryo ice, the Refinery's exploding fuel tanks, and the Metro and Refinery's pouring pipes, flare stack, steam plumes and ambient sound
- `world.js`: zombie pathfinding, spawning, supply caches, terminals and the minimap
- `rig.js`: the skinned zombies and their animation blending
- `bow.js`: bow viewmodel and draw/release/reload animation
- `zombies.js`: enemy types, AI and procedural animation
- `armory.js`: the between-waves Armory: catalog and prices (`ARMORY`), what each level does (`UPG`), the quiver loadout and the screen itself
- `game.js`: player, arrows, arrow recovery, waves, HUD and the main loop
- `audio.js`: synthesized sound effects, ambience and music, with reverb, 3D (HRTF) positioning and per-bus volume
- `seg.js`: the 16-segment neon lettering

After editing, run `python3 build.py`. It rebuilds `index.html` and `game.js`. The game imports `three/webgpu` (`vendor/three.webgpu.js`, which loads `vendor/three.core.js`), `three/tsl`, and three's TSL bloom, GTAO and denoise nodes (`vendor/addons/tsl/display/`). `tools/vendor_three.py` refreshes `vendor/` from a three.js release.

Balance numbers you will probably want to tune live near the top of their files: `ZTYPES` in `zombies.js` (health, speed and damage per enemy), `ARMORY` / `UPG` / `ALLOT` in `armory.js` (prices, upgrade effects, special arrows per wave), and `GAME.startWave` / `GAME.spawnOne` in `game.js` (wave sizes and the enemy mix).

## Credits

- Code, art and audio were generated procedurally for this project.
- The UI font is a subset of **TeX Gyre Heros Condensed** by GUST e-foundry, renamed "Quiver Cn" for embedding, and used under the GUST Font License.
- The Armory uses Latin subsets of **Chakra Petch** (Cadson Demak) and **IBM Plex Mono** (IBM), both under the SIL Open Font License (`fonts/OFL-*.txt`).

## Credits
- Ultra surface textures: [Poly Haven](https://polyhaven.com) (CC0): asphalt_02, concrete_wall_008, red_brick_03, rusty_metal_02, corrugated_iron_02, concrete_pavers, plastered_wall_02, concrete_floor_worn_001. Re-fetch with `tools/fetch_textures.py`, pack with `tools/pack_textures.py`.
