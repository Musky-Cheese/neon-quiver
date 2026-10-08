// Live horde benchmark for the real GPU, run inside the game page (open with ?prof=1&nowarn at the size you want measured):
//   await import('/test/perf/horde_live.js'); await __B.run(__B.spots()[0], 44, 'front', 2)
// Frames are driven by hand (the browser pane is often hidden, so requestAnimationFrame does not fire) and each one waits for
// the GPU. Per-pass GPU ms come from the ?prof=1 timestamp queries. newProgs counts shader programs built during the run: each
// one is a compile that stalls the frame it lands in.
const N = window.NQ, G = N.GAME, R = N.renderer, P = N.GPU_PROF, TQ = N.THREE.TimestampQuery;
window.__NQ_CAPTURE = true; window.__NQ_CAPTURE_DPR = 1; N.noLoop(true); P.busy = true;   // fixed render size, no game loop, no game poller
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
async function gpuResolve(acc) {
  await R.resolveTimestampsAsync(TQ.RENDER); const p = R.backend.timestampQueryPool.render; if (!p) return; const fr = {};
  for (const [uid, ms] of p.timestamps) { const n = P.names.get(uid); if (n === undefined) continue; P.names.delete(uid); const f = uid.slice(uid.lastIndexOf(':f') + 2); (fr[f] ||= {}); fr[f][n] = (fr[f][n] || 0) + ms; }
  if (acc) for (const f in fr) { acc.frames++; let tot = 0; for (const n in fr[f]) { acc.p[n] = (acc.p[n] || 0) + fr[f][n]; tot += fr[f][n]; } acc.tot.push(tot); }
}
const spots = () => N.DISTRICTS.map(d => ({ id: d.id, x: d.env[0], z: d.env[2], yaw: 0.35 }));
// n infected from the wave-13 mix (seeded, so 30 is a prefix of 44), either in a ring around the player or all in front of the camera
function setup(s, n, layout, q) {
  N.SETTINGS.quality = q; N.play(); N.clear(); G.interT = 1e9; G.intermission = true; G.toSpawn = 0; G.wave = 13;
  Object.assign(N.WX, { state: 'rain', forced: 'rain', precip: 0.68, snow: 0, wet: 1, cover: 0, flash: 0 });
  N.pose({ x: s.x, z: s.z, y: 0, yaw: s.yaw, pitch: -0.07, roll: 0 });
  const mr = Math.random; Math.random = rng(1234); try { while (N.ZOMBIES.length < n) G.spawnOne(); } finally { Math.random = mr; }
  N.ZOMBIES.length = n;
  N.ZOMBIES.forEach((z, i) => { let a, d; if (layout === 'ring') { a = i * 0.7; d = 8 + (i % 7) * 3; } else { a = s.yaw + Math.PI + ((i % 11) - 5) * 0.08; d = 9 + Math.floor(i / 11) * 4 + (i % 3); } z.x = s.x + Math.sin(a) * d; z.z = s.z + Math.cos(a) * d; });
}
async function run(s, n, layout = 'front', q = 2, warm = 30, meas = 90) {
  setup(s, n, layout, q); const prog0 = R.info.memory.programs, acc = { frames: 0, p: {}, tot: [] }, st = [], rj = [], progs = [];
  for (let i = 0; i < warm + meas; i++) {
    N.PLAYER.hp = N.PLAYER.maxHp; N.PLAYER.dead = false; N.pose({ x: s.x, z: s.z }); const pr = R.info.memory.programs;
    const t0 = performance.now(); N.step(1 / 60); const t1 = performance.now(); N.renderOnce(); const t2 = performance.now();
    await R.backend.device.queue.onSubmittedWorkDone();
    if (R.info.memory.programs !== pr) progs.push([i, R.info.memory.programs - pr]);
    if (i >= warm) { st.push(t1 - t0); rj.push(t2 - t1); await gpuResolve(acc); } else await gpuResolve(null);
  }
  const gp = {}; for (const k in acc.p) gp[k] = +(acc.p[k] / acc.frames).toFixed(2);
  return { spot: s.id, n, alive: N.ZOMBIES.filter(z => !z.dead).length, layout, q, stepMed: +med(st).toFixed(2), renderJSMed: +med(rj).toFixed(2), cpuMed: +med(st.map((v, i) => v + rj[i])).toFixed(2), gpuMed: +med(acc.tot).toFixed(2), gpu: gp, newProgs: R.info.memory.programs - prog0, progEvents: progs };
}
// a deterministic frame per view, kept in IndexedDB under tag:view so two builds can be compared pixel for pixel across reloads
const SHOTS = [['hub', 'front'], ['garden', 'front'], ['suburbs', 'ring'], ['yard', 'front']];
const idb = () => new Promise((res, rej) => { const q = indexedDB.open('nqcap', 1); q.onupgradeneeded = () => q.result.createObjectStore('img'); q.onsuccess = () => res(q.result); q.onerror = rej; });
async function capture(tag) {
  const db = await idb(), out = [];
  for (const [id, layout] of SHOTS) {
    const s = spots().find(x => x.id === id), mr = Math.random; Math.random = rng(99);
    try {
      N.freeze(false); setup(s, 44, layout, 2); G.time = 100;
      for (let i = 0; i < 12; i++) { N.PLAYER.hp = 100; N.pose({ x: s.x, z: s.z }); N.step(1 / 60); N.renderOnce(); await R.backend.device.queue.onSubmittedWorkDone(); }
      N.freeze(true); N.renderOnce(); await R.backend.device.queue.onSubmittedWorkDone(); N.renderOnce();
      const gl = document.getElementById('gl'), c = document.createElement('canvas'); c.width = gl.width; c.height = gl.height; const x = c.getContext('2d'); x.drawImage(gl, 0, 0);
      const px = x.getImageData(0, 0, c.width, c.height).data;
      await new Promise((res, rej) => { const t = db.transaction('img', 'readwrite'); t.objectStore('img').put({ w: c.width, h: c.height, px: new Uint8Array(px) }, tag + ':' + id); t.oncomplete = res; t.onerror = rej; });
      out.push(id);
    } finally { Math.random = mr; N.freeze(false); }
  }
  return out;
}
async function compare(a, b) {
  const db = await idb(), get = k => new Promise(res => { const q = db.transaction('img').objectStore('img').get(k); q.onsuccess = () => res(q.result); });
  const out = {};
  for (const [id] of SHOTS) {
    const A = await get(a + ':' + id), B = await get(b + ':' + id); if (!A || !B) { out[id] = 'missing'; continue; }
    let diff = 0, max = 0; for (let i = 0; i < A.px.length; i += 4) { const d = Math.max(Math.abs(A.px[i] - B.px[i]), Math.abs(A.px[i + 1] - B.px[i + 1]), Math.abs(A.px[i + 2] - B.px[i + 2])); if (d) diff++; if (d > max) max = d; }
    out[id] = { pixelsDiffering: diff, pct: +(100 * diff / (A.px.length / 4)).toFixed(4), maxDelta: max };
  }
  return out;
}
window.__B = { run, spots, setup, capture, compare };
export default window.__B;
