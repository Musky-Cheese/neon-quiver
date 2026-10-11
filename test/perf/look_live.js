// Look-dev contact sheet from the live page (desktop app browser pane): `await import('/test/perf/look_live.js')`, then
// __L.setup(3); __L.go('name') renders the fixed spots and POSTs one JPEG to a local sink (__L.sink, default :8795).
// Long runs: __L.go starts the job and returns; poll __L.r for [width, height, status] (a pane call times out at 45 s).
const L = window.__L = {
  sink: 'http://127.0.0.1:8795/save?name=',
  SPOTS: [[0, 26, 0, -0.02, 'plaza'], [-14, -12, -0.9, 0.05, 'plaza-cars'], [0, 110, 1.57, -0.02, 'suburbs'], [-90, 0, -1.57, 0.02, 'warrens'],
    [96, 6, 1.57, -0.02, 'market'], [0, -100, 0, 0, 'railyard'], [20, -8, 2.4, 0.0, 'plaza-b'], [110, 0, -1.2, 0.0, 'market-b']],
  r: null,
  setup(q = 3) {
    const N = NQ; N.SETTINGS.quality = q; N.noLoop(true); if (N.GAME.state === 'title') N.play(); N.clear(); N.GAME.toSpawn = 0; N.GAME.intermission = true; N.GAME.interT = 1e9;
    N.DBG.noVM = true; N.HUDVIS.on = false; document.getElementById('hud').hidden = true;
    Object.assign(N.WX, { state: 'rain', forced: 'rain', precip: 0.6, snow: 0, wet: 1, cover: 0, flash: 0 });
  },
  async shot(name, spots = L.SPOTS, scale = 0.5) {
    const N = NQ, gl = document.getElementById('gl'), W = Math.round(gl.width * scale), H = Math.round(gl.height * scale);
    const cv = document.createElement('canvas'); cv.width = W * Math.min(2, spots.length); cv.height = H * Math.ceil(spots.length / 2); const cx = cv.getContext('2d');
    for (let i = 0; i < spots.length; i++) {
      const [x, z, yaw, pitch] = spots[i]; N.clear(); const P = { x, z, y: 0, yaw, pitch, roll: 0 };
      for (let k = 0; k < 16; k++) { N.pose(P); N.step(1 / 60); N.renderOnce(); }   // rendered each step: TAA builds its history
      cx.drawImage(gl, (i % 2) * W, Math.floor(i / 2) * H, W, H);
    }
    const r = await fetch(L.sink + name + '.jpg', { method: 'POST', body: cv.toDataURL('image/jpeg', 0.9) });
    return [gl.width, gl.height, r.status];
  },
  async crop(name, spot, x0, y0, w, h) {   // one spot, a full-resolution window of it
    const N = NQ, gl = document.getElementById('gl'), [x, z, yaw, pitch] = spot, P = { x, z, y: 0, yaw, pitch, roll: 0 };
    for (let k = 0; k < 16; k++) { N.pose(P); N.step(1 / 60); N.renderOnce(); }
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(gl, x0, y0, w, h, 0, 0, w, h);
    return (await fetch(L.sink + name + '.jpg', { method: 'POST', body: cv.toDataURL('image/jpeg', 0.92) })).status;
  },
  // per-pass GPU ms (needs ?prof=1) and CPU render ms over n frames at one spot, each frame waited out on the GPU
  async bench(spot, n = 40) {
    const N = NQ, G = N.GPU_PROF, dev = N.renderer.backend.device, [x, z, yaw, pitch] = spot, P = { x, z, y: 0, yaw, pitch, roll: 0 };
    for (let k = 0; k < 5; k++) { N.pose(P); N.step(1 / 60); N.renderOnce(); } await dev.queue.onSubmittedWorkDone(); await new Promise(r => setTimeout(r, 600));
    for (const a of Object.values(G.acc)) { a.s = 0; a.n = 0; }
    let cpu = 0; for (let i = 0; i < n; i++) { N.pose(P); N.step(1 / 60); const t = performance.now(); N.renderOnce(); cpu += performance.now() - t; await dev.queue.onSubmittedWorkDone(); }
    await new Promise(r => setTimeout(r, 1500));
    const out = {}; let tot = 0; for (const [k, a] of Object.entries(G.acc)) if (a.n) { out[k] = +(a.s / a.n).toFixed(2); tot += a.s / a.n; }
    out.total = +tot.toFixed(2); out.cpu = +(cpu / n).toFixed(2); return out;
  },
  go(name, spots, scale) { L.r = null; L.shot(name, spots, scale).then(r => L.r = r, e => L.r = 'ERR ' + e.stack); },
};
