# Neon Quiver

A first-person archery survival game that runs in the browser. You are sealed inside Sector 7 plaza, a neon cyberpunk city at night in the rain. Hold the bow, draw, release, and survive endless zombie waves coming down the four avenues.

- **No dependencies.** Everything is one self-contained `index.html`: a custom WebGL2 renderer, synthesized audio, and an embedded font. It needs no build step and no CDN.
- **Desktop only:** keyboard and mouse, in any current Chrome, Edge, Firefox or Safari with WebGL2.

## Play locally

Open `index.html` in a browser. Or serve the folder with `python3 -m http.server`, then open `http://localhost:8000`.

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
| 1 – 4, mouse wheel | Switch arrow type · Q swaps to the last one |
| P / Esc | Pause · M toggles music |

## What's in the game

- **Bow viewmodel with real animation:** limbs flex and cams glow as you draw, the string snaps and oscillates on release, then the hand pulls back, reaches for the quiver and nocks the next arrow. Arrows fly with gravity drop.
- **Four arrow types:** Carbon (unlimited), Incendiary (sets zombies and the ground on fire), Plasma Charge (explodes on impact) and Rail Piercer (flat, fast, passes through five bodies).
- **The infected:** sculpted walkers, sprinting runners and armored brutes, with hit-location staggers, falls driven by the arrow's force, crawlers from leg shots, wall pinning and moderate gore. Every 5th wave brings *The Warden*, a boss that drops from the sky, slams the ground (jump to dodge) and summons runners. Hit its glowing core for extra damage.
- **Headshots, combos and credits.** Chain kills to build a score multiplier. Between waves, spend credits at the Armory Terminal on draw speed, damage, reload speed, max health, move speed, healing and special arrows.
- **The city:** a procedural skyline, neon signs, holo billboards, flying traffic, a monorail crossing overhead, rain, wet reflective ground and bloom.
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
   It writes one JSON file per part into `models/`, plus `_log.txt`.
2. Run `python3 tools/pack_models.py`, then `python3 build.py`.

Each part is built from blended spheres, voxel-remeshed and smoothed, then sculpted with noise (brows, sockets, cheekbones, ribs, torn cloth). It is decimated and painted with vertex masks: ambient occlusion, cloth, blood and glow. The game tints each zombie's skin, clothes and hair from those masks, so every zombie looks different.

## Editing the game

The readable source is in `src/`:

- `engine.js`: math, meshes, shaders, bloom and post-processing
- `city.js`: plaza, buildings, signs and traffic
- `bow.js`: bow viewmodel and draw/release/reload animation
- `zombies.js`: enemy types, AI and procedural animation
- `game.js`: player, arrows, waves, shop, HUD and the main loop
- `audio.js`: synthesized sound effects and music
- `seg.js`: the 16-segment neon lettering

After editing, run `python3 build.py`. It rebuilds `index.html` with everything inlined.

Balance numbers you will probably want to tune live near the top of their files: `ZTYPES` in `zombies.js` (health, speed and damage per enemy), `SHOP` in `game.js` (upgrade prices), and `GAME.startWave` / `GAME.spawnOne` in `game.js` (wave sizes and the enemy mix).

## Credits

- Code, art and audio were generated procedurally for this project.
- The UI font is a subset of **TeX Gyre Heros Condensed** by GUST e-foundry, renamed "Quiver Cn" for embedding, and used under the GUST Font License.
