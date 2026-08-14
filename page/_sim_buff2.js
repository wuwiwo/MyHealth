// Re-balance check: critRate+40% | critDmg+40% | time+50%
function runSim(prop, tapsPerSec, buff, iterations) {
  let totalDmg = 0, totalCrits = 0, totalHits = 0;
  const { atk, soulAtk, def, soulDef } = prop;
  for (let i = 0; i < iterations; i++) {
    const baseDur = 8 + Math.random() * 4;
    const dur = buff === 'time' ? baseDur * 1.5 : baseDur;
    const hits = Math.floor(dur * tapsPerSec);
    let critRate = 0.20, critMult = 1;
    if (buff === 'critRate') critRate = 0.60;
    if (buff === 'critDmg') critMult = 1.4;
    let dmg = 0, crits = 0;
    for (let h = 0; h < hits; h++) {
      const base = (atk + soulAtk) * 0.10 * (0.5 + Math.random());
      let hit = base;
      if (Math.random() < critRate) { hit += (def + soulDef) * critMult; crits++; }
      dmg += hit;
    }
    totalDmg += dmg; totalCrits += crits; totalHits += hits;
  }
  return { avgDmg: Math.round(totalDmg / iterations) };
}

const props = [
  { label: '前期 (攻15 防8)', atk: 15, soulAtk: 0, def: 8, soulDef: 0 },
  { label: '中期 (攻40 魂攻5 防20 魂防3)', atk: 40, soulAtk: 5, def: 20, soulDef: 3 },
  { label: '后期 (攻80 魂攻15 防45 魂防8)', atk: 80, soulAtk: 15, def: 45, soulDef: 8 },
  { label: '极端高防 (攻30 防80 魂防20)', atk: 30, soulAtk: 0, def: 80, soulDef: 20 }
];
const N = 20000;
console.log('='.repeat(74));
console.log('新数值验证: 暴击率+40% | 暴击伤害+40% | 倒计时+50%');
console.log('='.repeat(74));
for (const p of props) {
  const base = runSim(p, 6, 'none', N).avgDmg;
  const g = {};
  for (const b of ['critRate', 'critDmg', 'time']) {
    g[b] = Math.round((runSim(p, 6, b, N).avgDmg / base - 1) * 1000) / 10;
  }
  console.log('\n■ ' + p.label + '  (6次/秒, 无buff=' + base + ')');
  console.log('  暴击率+40%: +' + g.critRate + '%  暴击伤害+40%: +' + g.critDmg + '%  倒计时+50%: +' + g.time + '%');
  // ratio to strongest
  const best = Math.max(g.critRate, g.critDmg, g.time);
  const worst = Math.min(g.critRate, g.critDmg, g.time);
  console.log('  强弱比: ' + Math.round(best / worst * 100) / 100 + 'x  (越接近1越平衡)');
}
