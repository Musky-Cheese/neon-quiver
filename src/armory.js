/* ============================================================
   Armory: the between-waves upgrade shop and quiver loadout.
   Opens on its own a moment after each wave is cleared. Scrap from kills buys arrow unlocks and levels,
   bow tuning and survival perks; up to 3 special arrows ride in the quiver (keys 1–3), standard arrows always do.
   Layout, copy and logic follow the "Neon Quiver – Upgrade shop" design canvas: a 1920×1080 board scaled to fit.
   ============================================================ */

// ---- catalog (copy and prices straight from the design) ----
const ARMORY = [
  { id: 'piercer', cat: 'arrows', name: 'Piercer', tag: 'Special arrow', desc: 'A hardened tip that punches clean through bodies. Line them up in a corridor and one shot does the work of three.', base: 'Not owned', effects: ['Passes through 2 zombies', 'Passes through 3 zombies', 'Passes through 5 zombies'], costs: [120, 180, 260], icon: 'M3 12h16M15 8l4 4-4 4M8 6v12M12 6v12' },
  { id: 'blast', cat: 'arrows', name: 'Blast Arrow', tag: 'Special arrow', desc: 'Packed with a micro-charge that detonates on impact. Best saved for packs bunched at a choke point.', base: 'Not owned', effects: ['Explodes on impact, 2 m radius', 'Explodes on impact, 3 m radius', '4 m radius with knockback'], costs: [200, 280, 380], icon: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8' },
  { id: 'shock', cat: 'arrows', name: 'Shock Arrow', tag: 'Special arrow', desc: 'Releases an arc of current that jumps between nearby zombies. Wet streets make it even nastier.', base: 'Not owned', effects: ['Chains to 2 nearby zombies', 'Chains to 3 nearby zombies', 'Chains to 5 and stuns for 1 s'], costs: [180, 250, 340], icon: 'M13 2L4 14h7l-1 8 9-12h-7z' },
  { id: 'cryo', cat: 'arrows', name: 'Cryo Arrow', tag: 'Special arrow', desc: 'Coolant capsule that slows whatever it hits. Buys you time to reload when a runner closes in.', base: 'Not owned', effects: ['Slows target 40% for 2 s', 'Slows target 50% for 3 s', 'Freezes target solid for 1.5 s'], costs: [150, 210, 300], icon: 'M12 2v20M3.5 7l17 10M20.5 7l-17 10M9 4l3 3 3-3M9 20l3-3 3 3' },
  { id: 'splitter', cat: 'arrows', name: 'Splitter', tag: 'Special arrow', desc: 'Breaks apart mid-flight into a spread of smaller bolts. Forgiving against fast, scattered waves.', base: 'Not owned', effects: ['Splits into 3 mid-flight', 'Splits into 4 mid-flight', 'Splits into 5 with a wider spread'], costs: [220, 300, 400], icon: 'M3 12h7M10 12l10-7M10 12h10M10 12l10 7' },
  { id: 'tracer', cat: 'arrows', name: 'Tracer', tag: 'Special arrow', desc: 'Tags zombies with a neon marker you can see through walls. Cheap, and it never misses the big picture.', base: 'Not owned', effects: ['Marks zombies through walls for 4 s', 'Marks for 6 s', 'Marks the whole group for 8 s'], costs: [90, 140, 200], icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6' },

  { id: 'drawspeed', cat: 'bow', name: 'Draw Speed', tag: 'Bow', desc: 'Lighter limbs and a smoother cam. Reach full draw faster so you are never caught half-pulled.', base: 'Full draw in 1.0 s', effects: ['Full draw in 0.9 s', 'Full draw in 0.8 s', 'Full draw in 0.7 s', 'Full draw in 0.6 s'], costs: [100, 160, 240, 340], icon: 'M4 18a8 8 0 1 1 16 0M12 18l4-6' },
  { id: 'power', cat: 'bow', name: 'Draw Power', tag: 'Bow', desc: 'Heavier draw weight for more damage on a fully drawn shot. Rewards patience over spam.', base: 'Full-draw damage 100', effects: ['Full-draw damage 115', 'Full-draw damage 130', 'Full-draw damage 150', 'Full-draw damage 175'], costs: [120, 190, 280, 400], icon: 'M7 3c8 4 8 14 0 18M7 3v18M7 12h14M18 9l3 3-3 3' },
  { id: 'quiver', cat: 'bow', name: 'Quiver Size', tag: 'Bow', desc: 'Carry more standard arrows into each wave before you need to scavenge the street.', base: '20 arrows', effects: ['25 arrows', '30 arrows', '36 arrows', '42 arrows'], costs: [80, 130, 200, 290], icon: 'M7 21V8M12 21V5M17 21V8M5 10l2-3 2 3M10 7l2-3 2 3M15 10l2-3 2 3' },
  { id: 'aim', cat: 'bow', name: 'Steady Aim', tag: 'Bow', desc: 'Less sway while holding a full draw, so long shots across the plaza actually land.', base: 'Normal sway', effects: ['Sway reduced 20%', 'Sway reduced 35%', 'Sway reduced 50%', 'No sway while crouched'], costs: [90, 150, 220, 320], icon: 'M12 3v5M12 16v5M3 12h5M16 12h5M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8' },
  { id: 'recovery', cat: 'bow', name: 'Arrow Recovery', tag: 'Bow', desc: 'Pull spent arrows back into the quiver without walking over every single one.', base: 'Pick up arrows by hand', effects: ['Auto-collect within 2 m', 'Auto-collect within 4 m', 'Auto-collect within 6 m', 'Spent arrows return after 10 s'], costs: [70, 120, 180, 260], icon: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4' },

  { id: 'regen', cat: 'survival', name: 'Slow Regen', tag: 'Survival', desc: 'Health trickles back once you have been out of combat for a while. Kept slow on purpose: it saves runs, it does not make you tanky.', base: '1 HP every 4 s after 6 s out of combat', effects: ['1 HP every 3.5 s', '1 HP every 3 s', '1 HP every 2.5 s'], costs: [150, 240, 360], icon: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10zM12 9v6M9 12h6' },
  { id: 'maxhp', cat: 'survival', name: 'Max Health', tag: 'Survival', desc: 'Raises your health ceiling so one surprise bite from behind is not the end of the run.', base: '100 HP', effects: ['115 HP', '130 HP', '150 HP'], costs: [120, 200, 300], icon: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z' },
  { id: 'armor', cat: 'survival', name: 'Armor Plating', tag: 'Survival', desc: 'Lightweight plates under the jacket that soak part of every bite and swipe.', base: 'No armor', effects: ['Blocks 10% of damage', 'Blocks 20% of damage', 'Blocks 30% of damage'], costs: [140, 220, 330], icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' },
  { id: 'stamina', cat: 'survival', name: 'Sprint Stamina', tag: 'Survival', desc: 'Sprint longer before you are winded. Space is the archer’s best armor.', base: 'Sprint for 5 s', effects: ['Sprint for 6 s', 'Sprint for 7.5 s', 'Sprint for 9 s'], costs: [80, 140, 210], icon: 'M5 6l6 6-6 6M12 6l6 6-6 6' },
];
const ARMORY_TABS = [
  { id: 'arrows', label: 'Arrows', title: 'Special arrows', blurb: 'Unlock an arrow type, upgrade it, and equip up to 3 in your quiver.' },
  { id: 'bow', label: 'Bow', title: 'Bow upgrades', blurb: 'Permanent tuning for your draw, damage and ammo.' },
  { id: 'survival', label: 'Survival', title: 'Survival', blurb: 'Stay alive longer without making the waves any easier.' },
];
const SPECIAL_AT = { piercer: AT.PIERCE, blast: AT.BLAST, shock: AT.SHOCK, cryo: AT.FROST, splitter: AT.SCATTER, tracer: AT.TRACER };
const SLOT_COUNT = 3;
// special arrows topped up at the start of every wave for each equipped type (supply caches and drops add more)
const ALLOT = { [AT.PIERCE]: 4, [AT.BLAST]: 2, [AT.SHOCK]: 3, [AT.FROST]: 3, [AT.SCATTER]: 4, [AT.TRACER]: 5 };

// ---- what each level actually does in game (index = level; matches the Now / Next copy above) ----
const UPG = {
  draw: [1.0, 0.9, 0.8, 0.7, 0.6],          // seconds to full draw
  power: [1, 1.15, 1.3, 1.5, 1.75],         // full-draw damage multiplier (scales with how far you drew)
  quiver: [20, 25, 30, 36, 42],             // standard arrows carried into each wave
  sway: [1, 0.8, 0.65, 0.5, 0.5],           // aim sway at full draw (Lv 4: none while crouched)
  recover: [1.3, 2, 4, 6, 6],               // pick-up radius in metres (Lv 0 is walking over them)
  regen: [4, 3.5, 3, 2.5],                  // seconds per HP once out of combat for 6 s
  maxhp: [100, 115, 130, 150],
  armor: [0, 0.1, 0.2, 0.3],                // share of incoming damage blocked
  stamina: [5, 6, 7.5, 9],                  // seconds of sprint
  pierce: [2, 2, 3, 5],                     // bodies a Piercer passes through
  blastR: [2, 2, 3, 4],                     // Blast radius in metres (Lv 3 adds knockback)
  shock: [2, 2, 3, 5],                      // zombies a Shock arc jumps to (Lv 3 stuns 1 s)
  cryo: [[0.6, 2], [0.6, 2], [0.5, 3], [0, 1.5]],   // [speed left, seconds]; 0 = frozen solid
  split: [3, 3, 4, 5],                      // bolts a Splitter breaks into (Lv 3: wider spread)
  tracer: [4, 4, 6, 8],                     // seconds a Tracer mark lasts (Lv 3: the whole group)
};
const LOADOUT = { levels: {}, equipped: [] };
const upLv = (id) => LOADOUT.levels[id] || 0;
function loadoutReset() { LOADOUT.levels = {}; LOADOUT.equipped = []; AQ.tab = 'arrows'; AQ.sel = 'piercer'; AQ.msg = ''; }

// ---- screen state + design tokens ----
const AQ = { tab: 'arrows', sel: 'piercer', msg: '', sec: -1 };
const AQC = { accent: '#38E1F2', dim: '#A3AAC2', gold: '#FFC857', pink: '#FF6FB4' };
const aqItem = (id) => ARMORY.find((i) => i.id === id);
const aqPad = (n) => String(n).padStart(2, '0');

function aqDerive(it, selected) {
  const A = AQC, scrap = GAME.scrap, level = upLv(it.id), max = it.effects.length, maxed = level >= max;
  const cost = maxed ? 0 : it.costs[level], affordable = !maxed && scrap >= cost, isArrow = it.cat === 'arrows';
  const equipped = LOADOUT.equipped.includes(it.id);
  let status = 'Lv ' + level;
  if (level === 0) status = isArrow ? 'Locked' : 'Base';
  if (maxed) status = 'Max';
  if (equipped) status = 'Equipped';
  return {
    it, level, max, maxed, cost, affordable, isArrow, equipped, status, selected,
    pips: it.effects.map((_, i) => i < level),
    statusColor: maxed || equipped ? A.accent : A.dim,
    costLabel: maxed ? 'MAXED' : String(cost),
    costCaption: maxed ? 'Fully upgraded' : (level === 0 && isArrow ? 'Unlock' : 'Next level'),
    costColor: maxed ? A.accent : (affordable ? A.gold : A.pink),
    now: level === 0 ? it.base : it.effects[level - 1],
    next: maxed ? 'Fully upgraded' : it.effects[level],
  };
}
const aqIcon = (d, size, sw) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${AQC.accent}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"></path></svg>`;
const aqPips = (pips, cls) => pips.map((on) => `<i class="${cls}${on ? ' on' : ''}"></i>`).join('');

function armoryRender() {
  const A = AQC, s = AQ, all = ARMORY;
  const $a = (id) => document.getElementById(id);
  const focusAct = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.act : null;
  // header
  $a('aqWave').textContent = `WAVE ${aqPad(GAME.wave)} CLEARED`;
  $a('aqStartLbl').textContent = `Start wave ${aqPad(GAME.wave + 1)}`;
  $a('aqScrap').textContent = String(GAME.scrap);
  // tabs
  $a('aqTabs').innerHTML = ARMORY_TABS.map((t) => {
    const on = t.id === s.tab;
    return `<button type="button" class="aq-tab${on ? ' on' : ''}" data-act="tab:${t.id}" aria-pressed="${on}"><span>${t.label}</span><span class="aq-tabn">${all.filter((i) => i.cat === t.id).length}</span></button>`;
  }).join('');
  const tab = ARMORY_TABS.find((t) => t.id === s.tab);
  $a('aqTabTitle').textContent = tab.title; $a('aqTabBlurb').textContent = tab.blurb;
  // cards
  $a('aqGrid').innerHTML = all.filter((i) => i.cat === s.tab).map((i) => {
    const d = aqDerive(i, i.id === s.sel);
    return `<button type="button" class="aq-card${d.selected ? ' on' : ''}" data-act="item:${i.id}" aria-pressed="${d.selected}">
      <div class="aq-cardtop"><div class="aq-ico">${aqIcon(i.icon, 34, 1.6)}</div><div class="aq-status" style="color:${d.statusColor}">${d.status}</div></div>
      <div class="aq-cname">${i.name}</div>
      <div class="aq-pips">${aqPips(d.pips, 'aq-pip')}</div>
      <div class="aq-costrow"><div class="aq-cap">${d.costCaption}</div><div class="aq-cost" style="color:${d.costColor}">${d.costLabel}</div></div>
    </button>`;
  }).join('');
  // loadout slots
  let slots = '';
  for (let n = 0; n < SLOT_COUNT; n++) {
    const id = LOADOUT.equipped[n], it = id ? aqItem(id) : null;
    const lab = it ? `Slot ${n + 1}: ${it.name}. Select to view` : `Slot ${n + 1}: empty. Browse arrows`;
    slots += `<button type="button" class="aq-slot${it ? '' : ' empty'}${it && id === s.sel ? ' on' : ''}" data-act="slot:${n}" aria-label="${lab}">
      <div class="aq-key">${n + 1}</div>
      ${it ? `${aqIcon(it.icon, 32, 1.6)}<div class="aq-slottx"><div class="aq-slotname">${it.name}</div><div class="aq-slotlv">Lv ${upLv(id)} / ${it.effects.length}</div></div>` : '<div class="aq-slotempty">Empty slot</div>'}
    </button>`;
  }
  $a('aqSlots').innerHTML = slots;
  $a('aqSlotsUsed').textContent = `${LOADOUT.equipped.length} / ${SLOT_COUNT} special · standard arrows always equipped`;
  // detail panel
  const d = aqDerive(aqItem(s.sel) || all.find((i) => i.cat === s.tab), true), it = d.it;
  const cant = d.maxed || !d.affordable;
  const buyLabel = d.maxed ? 'Fully upgraded' : !d.affordable ? `Need ${d.cost - GAME.scrap} more scrap` : `${d.level === 0 && d.isArrow ? 'Unlock' : 'Upgrade'} · ${d.cost} scrap`;
  $a('aqDetail').innerHTML = `
    <div class="aq-dhead"><div class="aq-dico">${aqIcon(it.icon, 64, 1.4)}</div><div class="aq-dtitle"><div class="aq-dtag">${it.tag}</div><div class="aq-dname">${it.name}</div></div></div>
    <p class="aq-ddesc">${it.desc}</p>
    <div class="aq-dlevel"><div class="aq-dlvrow"><span>LEVEL</span><span>${d.level} / ${d.max}</span></div><div class="aq-dpips">${aqPips(d.pips, 'aq-dpip')}</div></div>
    <div class="aq-nn"><div class="aq-nnbox"><div class="aq-nnlbl">NOW</div><div class="aq-nntx">${d.now}</div></div><div class="aq-nnbox${d.maxed ? '' : ' next'}"><div class="aq-nnlbl next">NEXT</div><div class="aq-nntx">${d.next}</div></div></div>
    <div class="aq-spacer"></div>
    ${s.msg ? `<div role="status" class="aq-msg">${s.msg}</div>` : ''}
    ${d.isArrow && d.level > 0 ? `<button type="button" class="aq-equip" data-act="equip">${d.equipped ? 'Remove from quiver' : 'Equip to quiver'}</button>` : ''}
    <button type="button" class="aq-buy${cant ? ' off' : ''}" data-act="buy"${cant ? ' disabled' : ''}>${buyLabel}</button>`;
  // keep keyboard focus on the control that was used
  if (focusAct) { const el = document.querySelector(`#aqStage [data-act="${focusAct}"]`); if (el && !el.disabled) el.focus({ preventScroll: true }); else if (focusAct === 'buy') { const e2 = document.querySelector('#aqStage [data-act="item:' + s.sel + '"]'); if (e2) e2.focus({ preventScroll: true }); } }
}

// countdown: touch the DOM only when the shown second changes
function armoryTick() {
  const left = Math.max(0, Math.ceil(GAME.interT));
  if (left === AQ.sec) return; AQ.sec = left;
  const el = document.getElementById('aqTimer');
  el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  el.style.color = left <= 10 ? AQC.pink : '#EEF1F8';
}
// the board is laid out at 1920×1080 and scaled (one transform, no relayout) to fit any window
function armoryFit() {
  const scr = document.getElementById('scr-shop'), st = document.getElementById('aqStage');
  const W = scr.clientWidth || innerWidth, H = scr.clientHeight || innerHeight, k = Math.min(W / 1920, H / 1080);
  const tx = (W - 1920 * k) / 2, ty = (H - 1080 * k) / 2;
  st.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
  scr.style.backgroundSize = `${48 * k}px ${48 * k}px`; scr.style.backgroundPosition = `${tx}px ${ty}px`;
}
function armoryOpen() {
  if (!aqItem(AQ.sel)) AQ.sel = 'piercer';
  AQ.msg = ''; AQ.sec = -1;
  armoryFit(); armoryRender(); armoryTick();
}

// ---- actions ----
function armoryPickTab(id) { const first = ARMORY.find((i) => i.cat === id); AQ.tab = id; AQ.sel = first.id; AQ.msg = ''; AUD.click(); armoryRender(); }
function armoryPick(id) { AQ.sel = id; AQ.msg = ''; AUD.click(); armoryRender(); }
function armoryBuy() {
  const it = aqItem(AQ.sel), d = aqDerive(it, true);
  if (d.maxed || !d.affordable) { AUD.deny(); return false; }
  const P = PLAYER, hp0 = P.maxHp, q0 = P.quiverMax, st0 = P.stamMax;
  GAME.scrap -= d.cost; LOADOUT.levels[it.id] = d.level + 1;
  let msg = it.name + ' upgraded to level ' + (d.level + 1);
  if (d.level === 0 && d.isArrow) {
    const t = SPECIAL_AT[it.id]; P.ammo[t] = Math.max(P.ammo[t], ALLOT[t]);
    if (LOADOUT.equipped.length < SLOT_COUNT) { LOADOUT.equipped.push(it.id); msg = it.name + ' unlocked and equipped'; }
    else msg = it.name + ' unlocked. Quiver is full: remove an arrow to equip it.';
  }
  // new ceilings take effect now: the extra health, arrows and stamina come with them
  applyUpgrades();
  P.hp = Math.min(P.maxHp, P.hp + (P.maxHp - hp0)); P.ammo[0] += P.quiverMax - q0; P.stam += P.stamMax - st0;
  AQ.msg = msg; AUD.buy(); hudScore(); loadoutChanged(); armoryRender();
  return true;
}
function armoryToggleEquip() {
  const id = AQ.sel, it = aqItem(id), eq = LOADOUT.equipped;
  if (!it || it.cat !== 'arrows') return;
  if (eq.includes(id)) { LOADOUT.equipped = eq.filter((x) => x !== id); AQ.msg = it.name + ' removed from quiver'; AUD.swap(); }
  else if (upLv(id) === 0) return;
  else if (eq.length >= SLOT_COUNT) { AQ.msg = 'Quiver is full: remove an arrow first'; AUD.deny(); }
  else { LOADOUT.equipped = [...eq, id]; AQ.msg = it.name + ' equipped'; AUD.swap(); }
  loadoutChanged(); armoryRender();
}
function armorySlot(n) {
  const id = LOADOUT.equipped[n];
  AQ.tab = 'arrows'; if (id) AQ.sel = id; else if (aqItem(AQ.sel).cat !== 'arrows') AQ.sel = 'piercer';
  AQ.msg = ''; AUD.click(); armoryRender();
}
// a slot's arrow left the quiver: never keep a bow nocked with something you can't fire
function loadoutChanged() {
  if (!arrowAvailable(BOW.type)) { BOW.type = firstLoaded(); BOW.nextType = -1; }
  if (BOW.nextType >= 0 && !arrowAvailable(BOW.nextType)) BOW.nextType = -1;
  if (!arrowAvailable(GAME.lastType)) GAME.lastType = 0;
  updateQuiverHUD();
}
function armoryWire() {
  const st = document.getElementById('aqStage');
  st.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled || GAME.state !== 'shop') return;
    const [act, arg] = b.dataset.act.split(':');
    if (act === 'tab') armoryPickTab(arg);
    else if (act === 'item') armoryPick(arg);
    else if (act === 'slot') armorySlot(+arg);
    else if (act === 'buy') armoryBuy();
    else if (act === 'equip') armoryToggleEquip();
  });
  document.getElementById('aqStart').addEventListener('click', () => { if (GAME.state !== 'shop') return; AUD.click(); GAME.startNow(); });
  addEventListener('resize', () => { if (GAME.state === 'shop') armoryFit(); });
}
