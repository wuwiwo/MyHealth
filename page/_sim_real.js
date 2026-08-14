// 真实手速测试: 2~3 次/秒点击
// 输出: 伤害 | 持续时间 | 命中次数 | 月奖励换算
function runSim(prop, tapsPerSec, buff, iterations) {
  let totalDmg = 0, totalCrits = 0, totalHits = 0, totalDur = 0, totalHitCounts = 0;
  const { atk, soulAtk, def, soulDef } = prop;
  for (let i = 0; i < iterations; i++) {
    let baseDur;
    if (buff === 'time') {
      baseDur = 8 + 4 * (0.8 + Math.random() * 0.2); // 11.2~12s
    } else {
      baseDur = 8 + Math.random() * 4; // 8~12s
    }
    const dur = buff === 'time' ? baseDur * 1.8 : baseDur;
    // 真实手速: 每秒 tapsPerSec 次，但 hits = 持续时间×手速（带随机波动）
    const hits = Math.max(1, Math.floor(dur * tapsPerSec));
    let critRate = 0.20, critMult = 1;
    if (buff === 'critRate') { critRate = 0.60; critMult = 1.2; }
    if (buff === 'critDmg') { critRate = 0.35; critMult = 3.0; }
    let dmg = 0, crits = 0;
    for (let h = 0; h < hits; h++) {
      const base = (atk + soulAtk) * 0.10 * (0.5 + Math.random());
      let hit = base;
      if (Math.random() < critRate) { hit += (def + soulDef) * critMult; crits++; }
      dmg += hit;
    }
    totalDmg += dmg; totalCrits += crits; totalHits += hits;
    totalDur += dur; totalHitCounts += hits;
  }
  return {
    avgDmg: Math.round(totalDmg / iterations),
    avgDur: Math.round(totalDur / iterations * 10) / 10,
    avgHits: Math.round(totalHitCounts / iterations),
    avgCrits: Math.round(totalCrits / iterations)
  };
}

const props = [
  { label: '前期  (攻15 魂攻0 防8 魂防0)', atk: 15, soulAtk: 0, def: 8, soulDef: 0 },
  { label: '中期  (攻40 魂攻5 防20 魂防3)', atk: 40, soulAtk: 5, def: 20, soulDef: 3 },
  { label: '后期  (攻80 魂攻15 防45 魂防8)', atk: 80, soulAtk: 15, def: 45, soulDef: 8 },
  { label: '高防流 (攻30 魂攻0 防80 魂防20)', atk: 30, soulAtk: 0, def: 80, soulDef: 20 },
  { label: '均衡流 (攻60 魂攻10 防50 魂防15)', atk: 60, soulAtk: 10, def: 50, soulDef: 15 }
];
const buffs = [
  { id: 'none', name: '无buff' },
  { id: 'critRate', name: '暴击率复合' },
  { id: 'critDmg', name: '暴击伤害复合' },
  { id: 'time', name: '倒计时复合' }
];
const N = 20000;

for (const tps of [2, 2.5, 3]) {
  console.log('='.repeat(86));
  console.log('手速 ' + tps + ' 次/秒 (各 ' + N + ' 场)');
  console.log('='.repeat(86));
  for (const p of props) {
    console.log('\n■ ' + p.label);
    for (const b of buffs) {
      const r = runSim(p, tps, b.id, N);
      const atk = Math.floor(r.avgDmg / 500), def = Math.floor(r.avgDmg / 750), hp = Math.floor(r.avgDmg / 150) * 3;
      console.log('  ' + b.name.padEnd(8) + ' 伤害 ' + String(r.avgDmg).padStart(5) + ' | 时长 ' + r.avgDur + 's | 命中 ' + r.avgHits + '次 | 暴击 ' + r.avgCrits + '次 → ⚔️+' + atk + ' 🛡️+' + def + ' ❤️+' + hp);
    }
  }
  console.log();
}
