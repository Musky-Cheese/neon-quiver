'use strict';
/* ============================================================
   NEON QUIVER — boot: pick the renderer before the game module loads
   Plain script (build.py inlines it into index.html, ahead of any module). It decides WebGPU or WebGL2 (Classic),
   writes the import map for that build, then loads game-webgpu.js or game-webgl.js. Only one ever downloads.
   ============================================================ */
(function () {
  var BUNDLES = /*__BUNDLES__*/{};   // build.py: { webgl: 'game-webgl.js?v=…', webgpu: 'game-webgpu.js?v=…' }
  // The WebGPU build draws everything Classic does (roadmap Phase 3) but is still being tuned for CPU cost: it is
  // offered, but Classic stays the preselected choice until it is. Flip this when it is, and rename the storage key so everyone is asked again.
  var WEBGPU_PREVIEW = true, KEY = 'nq_renderer';
  var MAPS = {
    webgl: { 'three': './vendor/three.module.js', 'three/addons/': './vendor/addons/' },
    webgpu: { 'three': './vendor/three.webgpu.js', 'three/webgpu': './vendor/three.webgpu.js', 'three/tsl': './vendor/three.tsl.js', 'three/addons/': './vendor/addons/' },
  };
  var NAMES = { webgl: 'WebGL2 (Classic)', webgpu: 'WebGPU' };
  function loadLS(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function $(id) { return document.getElementById(id); }
  var q = new URLSearchParams(location.search);
  var B = window.NQ_BOOT = { gpu: null, preview: WEBGPU_PREVIEW, names: NAMES, probe: probe, fallback: fallback, choose: choose, falling: false };

  /* ---- can this browser really run WebGPU? Ask for an adapter and a device, not just navigator.gpu ---- */
  var _probe = null;
  function probe() {
    if (_probe) return _probe;
    _probe = new Promise(function (ok) {
      var to = setTimeout(function () { ok({ ok: false, why: 'The graphics adapter didn’t answer.' }); }, 4000);
      function done(r) { clearTimeout(to); ok(r); }
      if (!window.isSecureContext) return done({ ok: false, why: 'WebGPU needs a secure page (https or localhost).' });
      if (!navigator.gpu) return done({ ok: false, why: 'This browser doesn’t support WebGPU yet.' });
      navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).then(function (a) {
        if (!a) return done({ ok: false, why: 'No WebGPU adapter: it may be switched off for this GPU or driver.' });
        var i = a.info || {}, name = [i.vendor, i.architecture, i.description].filter(Boolean).join(' ');
        var soft = !!(i.isFallbackAdapter || a.isFallbackAdapter) || /swiftshader|llvmpipe|software|basic render/i.test(name);
        return a.requestDevice().then(function (d) { d.destroy(); done({ ok: true, soft: soft, name: name }); });
      }).catch(function (e) { done({ ok: false, why: 'WebGPU failed to start: ' + String(e && e.message || e).slice(0, 120) }); });
    });
    return _probe;
  }
  // the best option that works: WebGPU on real hardware once it's out of preview, otherwise Classic
  function best(r) { return r.ok && !r.soft && !WEBGPU_PREVIEW ? 'webgpu' : 'webgl'; }

  /* ---- load the chosen build: its import map, then its module ---- */
  function start(kind) {
    if (B.gpu) return; B.gpu = kind; document.documentElement.setAttribute('data-gpu', kind);
    var im = document.createElement('script'); im.type = 'importmap'; im.textContent = JSON.stringify({ imports: MAPS[kind] }); document.head.appendChild(im);
    var pre = document.createElement('link'); pre.rel = 'modulepreload'; pre.href = MAPS[kind].three; document.head.appendChild(pre);   // fetch three.js alongside the game, not after it
    var s = document.createElement('script'); s.type = 'module'; s.src = BUNDLES[kind];
    s.onerror = function () { if (!fallback(new Error('The WebGPU build failed to load.')) && window.NQ_FATAL) window.NQ_FATAL(new Error(BUNDLES[kind] + ' failed to load')); };
    document.body.appendChild(s);
  }
  // Settings → Renderer: remember, reload into the other build
  function choose(kind) {
    saveLS(KEY, kind);
    if (q.has('gpu')) q.delete('gpu');
    var s = q.toString(); location.replace(location.pathname + (s ? '?' + s : '') + location.hash);
  }
  // WebGPU didn't start (no adapter, init failed, device lost or a startup error): remember Classic, say why, reload once
  function fallback(err) {
    if (B.gpu !== 'webgpu' || B.falling || window.NQ_READY) return false;
    B.falling = true;
    try { sessionStorage.setItem('nq_gpu_note', String(err && (err.message || err) || 'unknown error').slice(0, 240)); } catch (e) { }
    saveLS(KEY, 'webgl');
    if (q.get('gpu') === 'webgpu') q.set('gpu', 'webgl');
    var s = q.toString(); location.replace(location.pathname + (s ? '?' + s : '') + location.hash);
    return true;
  }

  /* ---- after a fallback: tell the player what happened ---- */
  function note(why) {
    var n = $('gpuNote'); if (!n || window.__NQ_CAPTURE) return;
    $('gpuNoteC').textContent = why || ''; $('gpuNoteC').hidden = !why; n.hidden = false;
    $('gpuNoteX').onclick = function () { n.hidden = true; };
  }
  var why = null; try { why = sessionStorage.getItem('nq_gpu_note'); sessionStorage.removeItem('nq_gpu_note'); } catch (e) { }

  /* ---- first visit: the choice screen ---- */
  function screen() {
    var scr = $('scr-boot'), opts = { webgl: $('bootGL'), webgpu: $('bootGPU') }, go = $('bootGo'), sel = 'webgl';
    function pick(k) { if (opts[k].disabled) return; sel = k; for (var j in opts) opts[j].setAttribute('aria-checked', j === k ? 'true' : 'false'); go.textContent = 'Start with ' + NAMES[k]; }
    function launch() { saveLS(KEY, sel); scr.hidden = true; $('loading').hidden = false; start(sel); }
    $('loading').hidden = true; scr.hidden = false; pick('webgl'); opts.webgpu.disabled = true; $('bootGPUs').textContent = 'Checking…';
    for (var k in opts) (function (k) { opts[k].addEventListener('click', function () { pick(k); }); opts[k].addEventListener('dblclick', function () { pick(k); launch(); }); })(k);
    scr.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { pick(sel === 'webgl' ? 'webgpu' : 'webgl'); opts[sel].focus(); e.preventDefault(); }
      else if (e.key === 'Enter' && e.target !== go) { if (e.target === opts.webgl || e.target === opts.webgpu) pick(e.target === opts.webgl ? 'webgl' : 'webgpu'); launch(); e.preventDefault(); }
    });
    go.addEventListener('click', launch);
    probe().then(function (r) {
      opts.webgpu.disabled = !r.ok;
      $('bootGPUs').textContent = !r.ok ? r.why : r.soft ? 'Works here, but on a software adapter: expect it to be slow.' : WEBGPU_PREVIEW ? 'Ready. Preview: fully ported, still being tuned for speed.' : 'Ready on this GPU.';
      $('bootGPU').classList.toggle('na', !r.ok || !!r.soft);
      pick(best(r));
    });
    go.focus();
  }

  var forced = q.get('gpu'), saved = loadLS(KEY, null);
  if (forced !== 'webgl' && forced !== 'webgpu') forced = null;
  if (saved !== 'webgl' && saved !== 'webgpu') saved = null;
  if (forced === 'webgpu' && !navigator.gpu) { why = why || 'This browser doesn\u2019t support WebGPU yet.'; start('webgl'); }
  else if (forced) start(forced);   // ?gpu=webgl / ?gpu=webgpu: tests and benchmarks; not remembered
  else if (saved === 'webgpu' && !navigator.gpu) { why = why || 'This browser no longer offers WebGPU.'; saveLS(KEY, 'webgl'); start('webgl'); }
  else if (saved) start(saved);   // returning players skip the screen
  else if (navigator.webdriver && !q.has('boot')) probe().then(function (r) { start(best(r)); });   // automation takes the preselection (add ?boot to see the screen)
  else screen();
  if (why) note(why);
})();
