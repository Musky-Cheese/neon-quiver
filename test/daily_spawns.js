() => { const N = window.NQ; N.noLoop(true); window.__nqSeed(4242); N.play(); const out = [];
  for (let w = 1; w <= 12; w++) { N.GAME.wave = w; N.GAME.toSpawn = 9; N.clear(); const row = [];
    for (let i = 0; i < 14; i++) { const before = N.ZOMBIES.length; N.GAME.spawnOne(); for (let k = before; k < N.ZOMBIES.length; k++) { const z = N.ZOMBIES[k]; row.push(z.type + (z.elite ? '*' : '')); } }
    out.push(row.join(',')); }
  return out; }
