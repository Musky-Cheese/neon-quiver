/* ---------------- daily + custom runs, mutators ----------------
   Normal runs are untouched: every dr() call below is exactly the Math.random() it replaced. In a daily run the three
   run-defining streams are seeded from the UTC date: 'wave' (enemy mix, elites, packs; reseeded per wave so wave N is the
   same for everyone however long the earlier waves took), 'obj' (field objectives, also per wave) and 'wx' (the weather
   schedule, seeded once). What the infected then do depends on the player, as do spawn spots. */
function makeRng(seed) {
  let a = seed | 0;
  return { seed(s) { a = s | 0; }, next() { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; } };
}
const RNG = { wave: makeRng(1), obj: makeRng(1), wx: makeRng(1) };
function dr(k) { return RUN.mode === 'daily' ? RNG[k].next() : Math.random(); }
function hash2(a, b) { let h = (a ^ Math.imul((b | 0) + 0x9e3779b9 | 0, 0x85ebca6b)) | 0; h = Math.imul(h ^ h >>> 16, 0x7feb352d); h = Math.imul(h ^ h >>> 15, 0x846ca68b); return (h ^ h >>> 16) >>> 0; }
function hashStr(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; }
function runSeedWave(w) { if (RUN.mode !== 'daily') return; RNG.wave.seed(hash2(RUN.seed, w)); RNG.obj.seed(hash2(RUN.seed ^ 0x51ed, w)); }

// each mutator only nudges numbers in RUN (or flips a flag); the game reads RUN where it already had a constant
const MUTATORS = [
  { id: 'blackout', name: 'Blackout', mult: 1.2, desc: 'The grid is down: the lamps and the sky run dark.', apply(R) { R.expo = 0.55; R.amb = 0.5; } },
  { id: 'noregen', name: 'No Regen', mult: 1.2, desc: 'No natural healing. Only pickups, the Med Injector and Plating.', apply(R) { R.regenK = 0; } },
  { id: 'glass', name: 'Glass Cannon', mult: 1.25, desc: '50 max health, +50% arrow damage.', apply(R) { R.hpK = 0.5; R.dmgK = 1.5; } },
  { id: 'elite', name: 'Elite Night', mult: 1.25, desc: 'Elites from wave 3, and many more of them.', apply(R) { R.eliteNight = true; } },
  { id: 'swarm', name: 'Swarm', mult: 1.2, desc: '50% more infected, each with 30% less health.', apply(R) { R.spawnK = 1.5; R.zhpK = 0.7; } },
  { id: 'snow', name: 'Snowbound', mult: 1.1, desc: 'It snows all night.', apply(R) { R.snow = true; } },
  { id: 'scarce', name: 'Scarce Arrows', mult: 1.15, desc: 'Half the special arrows from caches, drops and the start.', apply(R) { R.ammoK = 0.5; } },
];
const RUN_NEUTRAL = { hpK: 1, dmgK: 1, ammoK: 1, spawnK: 1, zhpK: 1, regenK: 1, expo: 1, amb: 1, eliteNight: false, snow: false, scoreMult: 1 };
const mutName = (id) => MUTATORS.find(m => m.id === id).name;
function runReset() { Object.assign(RUN, RUN_NEUTRAL, { mode: 'normal', date: '', seed: 0, ids: [] }); REGEN.cap = 0.5; if (RUN._snow) { RUN._snow = false; WX.force(null); } applyUpgrades(); }
function utcDate() { return new Date().toISOString().slice(0, 10); }
function dailyIds(date) {
  const r = makeRng(hash2(hashStr(date), 77)), i = Math.floor(r.next() * MUTATORS.length); let j = Math.floor(r.next() * (MUTATORS.length - 1)); if (j >= i) j++;
  return [MUTATORS[i].id, MUTATORS[j].id];
}
// mode: 'normal' | 'daily' | 'custom'. Takes effect from the next newGame (runBegin).
function runConfigure(mode, ids, date) {
  runReset(); RUN.mode = mode;
  if (mode === 'daily') { RUN.date = date || utcDate(); RUN.seed = hashStr(RUN.date); ids = dailyIds(RUN.date); }
  RUN.ids = mode === 'normal' ? [] : ids || [];
  for (const m of MUTATORS) if (RUN.ids.includes(m.id)) { m.apply(RUN); RUN.scoreMult *= m.mult; }
  RUN.scoreMult = Math.round(RUN.scoreMult * 1000) / 1000;
  REGEN.cap = 0.5 * RUN.regenK; applyUpgrades();
}
function runLabel() { return RUN.mode === 'daily' ? 'DAILY RUN' : RUN.mode === 'custom' ? 'CUSTOM RUN' : ''; }
// called from GAME.newGame, before the weather resets (so the first spell is already on the daily schedule)
function runSeed() {
  if (RUN.mode === 'daily') { RNG.wx.seed(hash2(RUN.seed, 0xa11)); runSeedWave(0); }
  if (RUN.mode === 'daily') { const s = dailyStore(RUN.date); s.attempts++; saveLS('nq_daily_' + RUN.date, s); refreshDailyUI(); }
  for (let i = 1; i < 7; i++) if (PLAYER.ammo[i] !== undefined) PLAYER.ammo[i] = Math.max(1, Math.round(PLAYER.ammo[i] * RUN.ammoK));
}
function runWeather() { if (RUN.snow) { RUN._snow = true; WX.force('snow'); } else if (RUN._snow) { RUN._snow = false; WX.force(null); } }
const ammoGain = (n) => RUN.ammoK === 1 ? n : Math.max(1, Math.round(n * RUN.ammoK));

/* ---------- local results (this device only) ---------- */
function dailyStore(date) { const s = loadLS('nq_daily_' + date, null); return s && Array.isArray(s.runs) ? s : { attempts: 0, runs: [] }; }
function runFinish() {
  const G = GAME, final = Math.round(G.score * RUN.scoreMult), res = { mode: RUN.mode, date: RUN.date, ids: RUN.ids.slice(), score: G.score, final, wave: G.wave, kills: G.kills };
  if (RUN.mode === 'daily') {
    const s = dailyStore(RUN.date); s.runs.push({ s: final, w: G.wave, k: G.kills }); s.runs.sort((a, b) => b.s - a.s); s.runs.length = Math.min(10, s.runs.length);
    saveLS('nq_daily_' + RUN.date, s); res.best = s.runs[0].s; res.rank = s.runs.findIndex(r => r.s === final) + 1;
  }
  res.text = `Neon Quiver ${RUN.mode === 'daily' ? 'Daily ' + RUN.date : 'Custom'} · Wave ${G.wave} · ${final.toLocaleString('en-US')} pts` + (RUN.ids.length ? ' · ' + RUN.ids.map(mutName).join(' + ') : '');
  return res;
}
function runBanner() { return RUN.ids.length ? RUN.ids.map(mutName).join(' + ').toUpperCase() : ''; }

/* ---------- UI ---------- */
function refreshDailyUI() {
  const date = utcDate(), ids = dailyIds(date), s = dailyStore(date), best = s.runs.length ? s.runs[0].s : 0;
  $('dailyBtn').textContent = 'Daily run';
  $('dailyNote').innerHTML = `<b>${date}</b> · ${ids.map(mutName).join(' + ')}<br>${best ? 'Your best today: ' + best.toLocaleString('en-US') + ' · ' : ''}${s.attempts} attempt${s.attempts === 1 ? '' : 's'}<br><span>Same waves, same weather, same mutators for everyone today. Scores stay on this device.</span>`;
}
function startRun(mode, ids) { AUD.init(); AUD.setMusic(SETTINGS.music); AUD.click(); runConfigure(mode, ids); ZOMBIES.length = 0; GAME.newGame(); requestLock(); }
function customIds() { return MUTATORS.filter(m => $('cm-' + m.id).checked).map(m => m.id); }
function customRefresh() { const ids = customIds(), k = MUTATORS.filter(m => ids.includes(m.id)).reduce((a, m) => a * m.mult, 1); $('customMult').textContent = ids.length ? `Score ×${k.toFixed(2)}` : 'No mutators: a normal run that doesn\'t count toward your best.'; }
function wireRun() {
  $('customList').innerHTML = MUTATORS.map(m => `<label class="mut" for="cm-${m.id}"><input type="checkbox" id="cm-${m.id}"><span><b>${m.name}</b> <i>×${m.mult}</i><br><small>${m.desc}</small></span></label>`).join('');
  for (const m of MUTATORS) $('cm-' + m.id).addEventListener('change', customRefresh);
  $('dailyBtn').addEventListener('click', () => startRun('daily'));
  $('customBtn').addEventListener('click', () => { AUD.click(); customRefresh(); setScreen('custom'); });
  $('customBack').addEventListener('click', () => { AUD.click(); setScreen('title'); });
  $('customStart').addEventListener('click', () => startRun('custom', customIds()));
  $('copyBtn').addEventListener('click', async () => {
    const t = GAME.lastResult && GAME.lastResult.text; if (!t) return;
    try { await navigator.clipboard.writeText(t); $('copyBtn').textContent = 'Copied'; }
    catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); $('copyBtn').textContent = 'Copied'; } catch (e2) { $('copyBtn').textContent = 'Copy failed'; } ta.remove(); }
    setTimeout(() => { $('copyBtn').textContent = 'Copy result'; }, 1800);
  });
  refreshDailyUI();
}
Object.assign(window.NQ, { REGEN, OBJ, RUN, RNG, MUTATORS, runConfigure, runReset, dailyIds, dr, utcDate, dailyStore, runFinish, runSeedWave, hashStr, hash2 });
