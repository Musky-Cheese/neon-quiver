// Zombie movement harness, run inside the game page (open with ?nowarn):
//   await import('/test/perf/zombie_sim.js'); await __suite()   // damage taken + logic ms over five scenarios
//   await __stalls()   // stall-respawn count per district;  await __trails('label', {strafe: 1.2})   // top-down path plot
// Frames are stepped by hand with a seeded spawn, so two builds can be compared run for run.
window.__sim = async function (opts) {
  const N = NQ, G = N.GAME, P = N.PLAYER;
  N.noLoop(true); N.play(); N.clear(); G.interT = 1e9; G.intermission = true; G.toSpawn = 0; G.wave = opts.wave || 8;
  const s = N.DISTRICTS.find(d => d.id === (opts.spot || 'hub')) || N.DISTRICTS[0];
  const px = s.env[0], pz = s.env[2];
  N.pose({ x: px, z: pz, y: 0, yaw: 0, pitch: 0, roll: 0 });
  let seed = 99; const mr = Math.random; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  try { for (let i = 0; i < opts.n; i++) { const t = opts.types[i % opts.types.length], a = i * 2.4, d = 14 + (i % 5) * 3; N.spawnZombie(t, px + Math.sin(a) * d, pz + Math.cos(a) * d, G.wave); } } finally { Math.random = mr; }
  const out = { steps: [], samples: [] };
  for (let f = 0; f < opts.frames; f++) {
    P.hp = P.maxHp; P.dead = false;
    if (opts.strafe) { const x = px + Math.sin(f / 60 * opts.strafe) * 6; P.vx = (x - P.x) * 60; P.vz = 0; N.pose({ x, z: pz }); } else N.pose({ x: px, z: pz });
    const t0 = performance.now(); N.step(1 / 60); out.steps.push(performance.now() - t0);
    if (f % 60 === 59) {
      const Z = N.ZOMBIES.filter(z => !z.dead);
      let minD = 9, nan = 0, overl = 0;
      for (const a of Z) { if (!isFinite(a.x + a.z)) nan++; for (const b of Z) if (a !== b) { const d = Math.hypot(a.x - b.x, a.z - b.z); minD = Math.min(minD, d); if (d < 0.5 * (a.scale + b.scale)) overl++; } }
      const dist = z => Math.hypot(z.x - P.x, z.z - P.z);
      out.samples.push({ t: (f + 1) / 60, alive: Z.length, tok: Z.filter(z => z.tok).length, within3: Z.filter(z => dist(z) < 3).length, within5: Z.filter(z => dist(z) < 5).length, attacking: Z.filter(z => z.state === 'attack').length, back: Z.filter(z => z.back).length, minD: +minD.toFixed(2), overlapPairs: overl / 2, nan, meanSpd: +(Z.reduce((s, z) => s + (z.mv || 0), 0) / Z.length).toFixed(2) });
    }
  }
  const st = out.steps.sort((a, b) => a - b);
  out.stepMed = +st[st.length >> 1].toFixed(2); out.stepP95 = +st[Math.floor(st.length * 0.95)].toFixed(2); delete out.steps;
  return out;
};
window.__dmg = async function (o) { const P = NQ.PLAYER, oh = P.hurt; let hits = 0, dmg = 0; P.hurt = function (d) { hits++; dmg += d; }; try { const r = await __sim(o); return { hits, dmg: Math.round(dmg), stepMed: r.stepMed, stepP95: r.stepP95, last: r.samples[r.samples.length - 1], firstHitAt: r.samples.findIndex(s => s.attacking > 0) + 1 }; } finally { P.hurt = oh; } };
window.__suite = async function () {
  const mix = ['walker', 'walker', 'runner', 'walker', 'brute'];
  return { a: await __dmg({ n: 30, types: mix, frames: 1200 }), b: await __dmg({ n: 12, types: ['walker', 'runner', 'walker'], frames: 1200 }), c: await __dmg({ n: 30, types: mix, frames: 1200, strafe: 1.2 }), d: await __dmg({ n: 20, types: mix, frames: 1200, spot: 'suburbs' }), e: await __dmg({ n: 20, types: mix, frames: 1200, spot: 'garden' }) };
};
window.__trails = async function (label, opts) {
  const N = NQ, P = N.PLAYER, tr = new Map();
  const o = Object.assign({ n: 24, types: ['walker', 'walker', 'runner', 'walker', 'brute'], frames: 720 }, opts);
  const oh = P.hurt; P.hurt = () => {};
  const step0 = N.step; let f = 0;
  N.step = function (dt) { step0(dt); if (f++ % 3 === 0) for (const z of N.ZOMBIES) { if (!tr.has(z)) tr.set(z, []); tr.get(z).push([z.x - P.x, z.z - P.z, z.tok ? 1 : 0]); } };
  try { await __sim(o); } finally { N.step = step0; P.hurt = oh; }
  let c = document.getElementById('__tc'); if (!c) { c = document.createElement('canvas'); c.id = '__tc'; c.width = 1800; c.height = 900; c.style.cssText = 'position:fixed;left:60px;top:90px;width:1800px;height:900px;z-index:99999;background:#0b0d12'; document.body.appendChild(c); }
  const g = c.getContext('2d'), ox = label === 'main' ? 0 : 900, S = 17, cx = ox + 450, cy = 450;
  g.fillStyle = '#0b0d12'; g.fillRect(ox, 0, 900, 900);
  g.strokeStyle = '#223'; for (let r = 2; r <= 24; r += 2) { g.beginPath(); g.arc(cx, cy, r * S, 0, 7); g.stroke(); }
  const col = { walker: '#7fd36b', runner: '#ffd23f', brute: '#ff5b6b' };
  for (const [z, pts] of tr) { g.strokeStyle = col[z.type] || '#aaa'; g.globalAlpha = 0.55; g.lineWidth = 1.5; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(cx + p[0] * S, cy - p[1] * S) : g.moveTo(cx + p[0] * S, cy - p[1] * S)); g.stroke();
    const l = pts[pts.length - 1]; g.globalAlpha = 1; g.fillStyle = col[z.type]; g.beginPath(); g.arc(cx + l[0] * S, cy - l[1] * S, 0.4 * z.scale * S, 0, 7); g.fill(); if (l[2]) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); } }
  g.fillStyle = '#4cf'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText(label + (o.strafe ? ' (player strafing)' : ''), ox + 20, 40);
  g.font = '18px sans-serif'; g.fillStyle = '#aaa'; g.fillText('rings every 2 m · green walker · yellow runner · red brute · white outline = token', ox + 20, 880);
  return 'drawn';
};
window.__stalls = async function () {
  const N = NQ, P = N.PLAYER, res = {};
  for (const spot of ['hub', 'suburbs', 'garden', 'yard']) {
    let tp = 0; const last = new Map(); const step0 = N.step;
    N.step = function (dt) { step0(dt); for (const z of N.ZOMBIES) { const l = last.get(z); if (l && Math.hypot(z.x - l[0], z.z - l[1]) > 4) tp++; last.set(z, [z.x, z.z]); } };
    const oh = P.hurt; P.hurt = () => {};
    try { const r = await __sim({ n: 24, types: ['walker', 'runner', 'walker', 'brute', 'climber', 'walker'], frames: 1800, spot }); res[spot] = { teleports: tp, within5: r.samples[r.samples.length - 1].within5, alive: r.samples[r.samples.length - 1].alive }; } finally { N.step = step0; P.hurt = oh; }
  }
  return res;
};
