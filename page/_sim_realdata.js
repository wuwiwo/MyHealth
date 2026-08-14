// 真实属性测试: 攻558 魂攻49 防96 魂防8 (生命2009)
// Buff: critRate+50%&critDmg+20% | critDmg+200%&critRate+10% | time+100%&每5s+10%
function runSim(prop, tapsPerSec, buff, iterations) {
  let totalDmg = 0, totalCrits = 0, totalHits = 0, totalDur = 0;
  const { atk, soulAtk, def, soulDef } = prop;
  for (let i = 0; i < iterations; i++) {
    let baseDur;
    if (buff === 'time') {
      baseDur = 8 + 4 * (0.8 + Math.random() * 0.2); // 11.2~12s
    } else {
      baseDur = 8 + Math.random() * 4; // 8~12s
    }
    const dur = buff === 'time' ? baseDur * 2 : baseDur;
    const hits = Math.max(1, Math.floor(dur * tapsPerSec));
    let critRate = 0.20, critMult = 1;
    if (buff === 'critRate') { critRate = 0.70; critMult = 1.2; }
    if (buff === 'critDmg') { critRate = 0.30; critMult = 3.0; }
    let dmg = 0, crits = 0;
    for (let h = 0; h < hits; h++) {
      let mult = 1;
      if (buff === 'time') {
        const elapsed = h / tapsPerSec;
        mult = 1 + 0.1 * Math.floor(elapsed / 5);
      }
      const base = (atk + soulAtk) * 0.10 * (0.5 + Math.random());
      let hit = base * mult;
      if (Math.random() < critRate) { hit += (def + soulDef) * critMult * mult; crits++; }
      dmg += hit;
    }
    totalDmg += dmg; totalCrits += crits; totalHits += hits;
    totalDur += dur;
  }
  return {
    avgDmg: Math.round(totalDmg / iterations),
    avgDur: Math.round(totalDur / iterations * 10) / 10,
    avgHits: Math.round(totalHits / iterations),
    avgCrits: Math.round(totalCrits / iterations)
  };
}

const prop = { label: '你的真实属性 (攻558 魂攻49 防96 魂防8 生2009)', atk: 558, soulAtk: 49, def: 96, soulDef: 8 };
const buffs = [
  { id: 'none', name: '无buff' },
  { id: 'critRate', name: '暴击率复合' },
  { id: 'critDmg', name: '暴击伤害复合' },
  { id: 'time', name: '倒计时复合' }
];
const N = 50000;

console.log('='.repeat(92));
console.log('真实属性测试 (各 ' + N + ' 场)');
console.log(prop.label);
console.log('='.repeat(92));

for (const tps of [2, 2.5, 3]) {
  console.log('\n■ 手速 ' + tps + ' 次/秒');
  console.log('  ' + 'buff'.padEnd(10) + '伤害'.padStart(6) + ' | 时长'.padStart(7) + ' | 命中'.padStart(5) + ' | 暴击'.padStart(5) + ' | 月奖励');
  for (const b of buffs) {
    const r = runSim(prop, tps, b.id, N);
    const atk = Math.floor(r.avgDmg / 500), def = Math.floor(r.avgDmg / 750), hp = Math.floor(r.avgDmg / 150) * 3;
    console.log('  ' + b.name.padEnd(10) + String(r.avgDmg).padStart(6) + ' | ' + String(r.avgDur).padStart(6) + 's | ' + String(r.avgHits).padStart(5) + ' | ' + String(r.avgCrits).padStart(5) + ' | ⚔️+' + atk + ' 🛡️+' + def + ' ❤️+' + hp);
  }
}

// 相对提升（相对无buff）
console.log('\n' + '='.repeat(92));
console.log('相对无buff的提升（各手速）');
console.log('='.repeat(92));
for (const tps of [2, 2.5, 3]) {
  const base = runSim(prop, tps, 'none', N).avgDmg;
  const g = {};
  for (const b of ['critRate', 'critDmg', 'time']) {
    g[b] = Math.round((runSim(prop, tps, b, N).avgDmg / base - 1) * 1000) / 10;
  }
  console.log('  ' + tps + '次/秒: 暴击率 +' + g.critRate + '% | 暴击伤害 +' + g.critDmg + '% | 倒计时 +' + g.time + '%');
}

// 一次 vs 全月（假设每月 30 次挑战）
console.log('\n' + '='.repeat(92));
console.log('月度累计（假设每月 30 次挑战 × 2.5次/秒）');
console.log('='.repeat(92));
for (const b of ['critRate', 'critDmg', 'time']) {
  const r = runSim(prop, 2.5, b, N);
  const per = { atk: Math.floor(r.avgDmg / 500), def: Math.floor(r.avgDmg / 750), hp: Math.floor(r.avgDmg / 150) * 3 };
  console.log('  ' + (b === 'critRate' ? '暴击率' : b === 'critDmg' ? '暴击伤害' : '倒计时')
    + ': 单次 ⚔️+' + per.atk + ' 🛡️+' + per.def + ' ❤️+' + per.hp
    + ' → 月度 ⚔️+' + per.atk * 30 + ' 🛡️+' + per.def * 30 + ' ❤️+' + per.hp * 30);
}
