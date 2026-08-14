// 最新热血 buff 数值测试 — 与线上 challenge.js 公式一致
// 公式: 基础伤害=(攻+魂攻)×10%×(0.5~1.5); 暴击时 +=(防+魂防)×倍率
// Buff: critRate 0.20→0.60 | critDmg 倍率1.0→1.4 | time 时长×1.5
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
  return {
    avgDmg: Math.round(totalDmg / iterations),
    critRate: Math.round(totalCrits / totalHits * 1000) / 10
  };
}

const props = [
  { label: '前期  (攻15 防8)', atk: 15, soulAtk: 0, def: 8, soulDef: 0 },
  { label: '中期  (攻40 魂攻5 防20 魂防3)', atk: 40, soulAtk: 5, def: 20, soulDef: 3 },
  { label: '后期  (攻80 魂攻15 防45 魂防8)', atk: 80, soulAtk: 15, def: 45, soulDef: 8 },
  { label: '高防流 (攻30 防80 魂防20)', atk: 30, soulAtk: 0, def: 80, soulDef: 20 },
  { label: '均衡流 (攻60 魂攻10 防50 魂防15)', atk: 60, soulAtk: 10, def: 50, soulDef: 15 }
];

const tapsList = [3, 6, 9];
const buffs = ['none', 'critRate', 'critDmg', 'time'];
const N = 20000;

console.log('='.repeat(78));
console.log('热血 buff 最新数值测试 (各 ' + N + ' 场模拟)');
console.log('暴击率+40% | 暴击伤害+40% | 倒计时+50% — 加算公式(暴击附加防御)');
console.log('='.repeat(78));

for (const p of props) {
  console.log('\n■ ' + p.label);
  // table
  console.log('  taps/s | none   | critRate | critDmg | time   ');
  for (const t of tapsList) {
    const row = buffs.map(b => String(runSim(p, t, b, N).avgDmg).padEnd(7));
    console.log('  ' + t + '次/秒 | ' + row.join(' | '));
  }
  // relative gain at 6 taps/s
  const base = runSim(p, 6, 'none', N).avgDmg;
  const gains = {};
  for (const b of ['critRate', 'critDmg', 'time']) {
    gains[b] = Math.round((runSim(p, 6, b, N).avgDmg / base - 1) * 1000) / 10;
  }
  const best = Math.max(gains.critRate, gains.critDmg, gains.time);
  const worst = Math.min(gains.critRate, gains.critDmg, gains.time);
  console.log('  → 6次/秒相对提升: 暴击率 +' + gains.critRate + '% | 暴击伤害 +' + gains.critDmg + '% | 倒计时 +' + gains.time + '%   (强弱比 ' + Math.round(best / worst * 100) / 100 + 'x)');
}

console.log('\n' + '='.repeat(78));
console.log('真实收益换算（按当前奖励公式: 500伤=+1攻, 750伤=+1防, 150伤=+3血）');
console.log('='.repeat(78));
const mid = props[1]; // 中期档
const base = runSim(mid, 6, 'none', N).avgDmg;
for (const b of ['critRate', 'critDmg', 'time']) {
  const d = runSim(mid, 6, b, N).avgDmg;
  const atk = Math.floor(d / 500), def = Math.floor(d / 750), hp = Math.floor(d / 150) * 3;
  console.log('  中期6次/秒  ' + (b === 'critRate' ? '暴击率' : b === 'critDmg' ? '暴击伤害' : '倒计时')
    + ': 伤害 ' + d + ' → 月奖励 ⚔️+' + atk + ' 🛡️+' + def + ' ❤️+' + hp);
}
