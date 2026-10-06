'use strict';
/* ============================================================
   NEON QUIVER — boot: decide the backend, then load the game module
   Plain script (build.py inlines it into index.html, ahead of any module). There is one renderer, three.js's
   WebGPURenderer, drawing the same TSL shaders on WebGPU or, where WebGPU can't start, on its own WebGL2 backend.
   This only asks the browser for a real WebGPU adapter + device and tells the module whether to force WebGL2.
   ?gpu=webgl forces the WebGL2 backend (tests, and checking the fallback); ?gpu=webgpu skips the probe.
   ============================================================ */
(function () {
  var GAME_JS = /*__GAME__*/"";   // build.py: 'game.js?v=…'
  var q = new URLSearchParams(location.search), forced = q.get('gpu');
  var B = window.NQ_BOOT = { forceWebGL: false, why: '', backend: null };   // backend: set by engine.js once the renderer is up

  /* ---- can this browser really run WebGPU? Ask for an adapter and a device, not just navigator.gpu ---- */
  function probe() {
    return new Promise(function (ok) {
      var to = setTimeout(function () { ok({ ok: false, why: 'The graphics adapter didn’t answer.' }); }, 4000);
      function done(r) { clearTimeout(to); ok(r); }
      if (!window.isSecureContext) return done({ ok: false, why: 'WebGPU needs a secure page (https or localhost).' });
      if (!navigator.gpu) return done({ ok: false, why: 'This browser doesn’t support WebGPU.' });
      navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).then(function (a) {
        if (!a) return done({ ok: false, why: 'No WebGPU adapter: it may be switched off for this GPU or driver.' });
        return a.requestDevice().then(function (d) { d.destroy(); done({ ok: true }); });
      }).catch(function (e) { done({ ok: false, why: 'WebGPU failed to start: ' + String(e && e.message || e).slice(0, 120) }); });
    });
  }
  function start() { var s = document.createElement('script'); s.type = 'module'; s.src = GAME_JS; s.onerror = function () { if (window.NQ_FATAL) window.NQ_FATAL(new Error(GAME_JS + ' failed to load')); }; document.body.appendChild(s); }

  if (forced === 'webgl') { B.forceWebGL = true; B.why = 'Forced by ?gpu=webgl.'; start(); }
  else if (forced === 'webgpu') start();
  else probe().then(function (r) { if (!r.ok) { B.forceWebGL = true; B.why = r.why; } start(); });
})();
