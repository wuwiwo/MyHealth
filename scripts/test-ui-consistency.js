#!/usr/bin/env node
/* v2.14.26：全项目 UI/UX 评审（doc/ui-ux-review-whole-2026-11-27.md）落地后的契约测试
   覆盖批次 A（P1）+ 批次 B（P2）+ 批次 C 的一部分：
   · P1-A 本旬目标三卡：值/单位拆 span、nowrap、第三卡改「本旬状态」不再重复数值
   · P1-B 调试 FAB 默认不挂 DOM，只有 ?debug=1 / localStorage.mh_debug='1' 才建
   · P1-C 图鉴激活页签计数用品牌前景色（曾是橙字蓝底 1.3:1）
   · P1-D 个人最佳空态 CTA 指向真实 tab（曾是 switchTab("strength") 死按钮）
   · P2-1 区块标题是 h2（全站曾 0 个 heading）
   · P2-2 动作库图标按钮有 aria-label（编辑/删除 + 动作名）
   · P2-3 主按钮三档（btn-primary / btn-entry / btn-quiet），数据页不再混搭
   · P2-4/7 空态统一走 .empty 组件，计划页空态带一个真动作
   · P2-5 编队队卡降层（外框 → 上分隔线）
   · P2-6 统计卡数值中性色（曾 4 卡 4 色）
   · P2-8 设置子页签「玩法」（与「挑战·战斗」不再撞名）
   · P2-9 动作库权重徽标 / 热力图「今天」
   · P2-11 图鉴筛选芯片 min-width 44
   Run: node scripts/test-ui-consistency.js */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'page');
const src = f => fs.readFileSync(path.join(PAGE, f), 'utf8');
const css = () => src('index.css');
const html = () => src('index.html');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg, extra) {
  if (cond) { pass++; console.log(' ✓ ' + msg); }
  else { fail++; fails.push(msg); console.log(' ✗ ' + msg + (extra !== undefined ? '  → ' + extra : '')); }
}

/* ---------- 批次 A ---------- */
console.log('\n[1] P1-A 本旬目标三卡（折行错版 + 数值重复）');
const gv = src('game-views.js');
ok(/period-kpi-row/.test(gv), '三卡走 .period-kpi-row');
ok(/period-kpi-v[\s\S]{0,80}period-kpi-u">\/6天/.test(gv), '训练天数：数字与 /6天 拆成两个 span');
ok(!/💪 '\s*\+\s*stats\.periodDays/.test(gv), '不再拼「💪 N/6天」整串');
ok(/wkDone/.test(gv) && /已达标/.test(gv) && /本旬状态/.test(gv), '第三卡表达「本旬状态」（已达标 / 差 N 天）');
ok(!/>状态<\/div>'/.test(gv), '第三卡标签不再是与第一卡重复的「状态」');
const c = css();
ok(/\.period-kpi-v\{[^}]*white-space:nowrap/.test(c), 'CSS：.period-kpi-v nowrap（防窄卡折行）');
ok(/\.period-kpi\.is-done \.period-kpi-v\{color:var\(--green\)\}/.test(c), 'CSS：达标态才转绿');

console.log('\n[2] P1-B 调试 FAB 不再常驻遮挡');
const dbg = src('debug.js');
ok(/DEBUG_UI_ON/.test(dbg), 'debug.js 有显式开关 DEBUG_UI_ON');
ok(/if \(DEBUG_UI_ON\) build\(\)/.test(dbg), '挂载点受开关控制（不再无条件 build()）');
ok(/debug=1/.test(dbg), '开关支持 ?debug=1');
ok(/mh_debug/.test(dbg), '开关支持 localStorage.mh_debug=1');
ok(!/\n  build\(\);\n/.test(dbg), '文件尾部没有无条件 build() 残留');

console.log('\n[3] P1-C 图鉴激活页签计数对比度');
ok(/\.codex-tab\.active \.codex-tab-n\{color:var\(--on-brand\)\}/.test(c), '激活态计数用 --on-brand（品牌底上的前景色）');
ok(!/\.codex-tab\.active \.codex-tab-n\{color:var\(--orange\)\}/.test(c), '不再橙字压蓝底');

console.log('\n[4] P1-D 个人最佳空态 CTA');
const tp = src('tab-profile.js');
ok(!/switchTab\(&quot;strength&quot;\)/.test(tp), '不再用不存在的 tab 名 strength');
ok(/switchTab\(&quot;training&quot;\);switchSub\(&quot;training&quot;,&quot;strength&quot;\)/.test(tp), 'CTA 指向 训练→力量 两级切换');

/* ---------- 批次 B ---------- */
console.log('\n[5] P2-1 标题语义');
const staticH2 = (html().match(/<h2 class="section-hdr/g) || []).length;
ok(staticH2 >= 10, 'index.html 静态标题为 h2（实测 ' + staticH2 + ' 个）');
ok((html().match(/<div class="section-hdr/g) || []).length === 0, 'index.html 无 section-hdr 的 div 残留');
['tab-settings.js', 'tab-profile.js', 'game-views.js', 'game-records.js'].forEach(f => {
  const s = src(f);
  ok((s.match(/<div class="section-hdr/g) || []).length === 0, f + ' 无 div 标题残留');
  ok((s.match(/<h2 class="section-hdr/g) || []).length > 0, f + ' 至少一个 h2 标题');
});

console.log('\n[6] P2-2 动作库图标按钮可访问名称');
const ts = src('tab-settings.js');
ok(/aria-label="编辑 '?\+\s*exName/.test(ts), '✏️ 按钮带 aria-label="编辑 {动作名}"');
ok(/aria-label="删除 '?\+\s*exName/.test(ts), '🗑️ 按钮带 aria-label="删除 {动作名}"');
ok(/var exName=String\(ex\.name/.test(ts), '动作名做了属性转义（防引号破标签）');

console.log('\n[7] P2-3 主按钮三档');
ok(/\.btn-quiet\{/.test(c), 'CSS 定义 .btn-quiet');
ok(/id="exportDataBtn">📤 导出数据/.test(ts) && /class="btn-quiet" style="flex:1" id="exportDataBtn"/.test(ts), '导出按钮 → .btn-quiet');
ok(/class="btn-quiet" style="flex:1" id="importDataBtn"/.test(ts), '导入按钮 → .btn-quiet');
ok(/class="btn-quiet" id="syncDataBtn"/.test(ts), '云同步 → .btn-quiet');
ok(/class="sb-btn btn-primary" id="pfSave"/.test(tp), '保存资料 = 唯一主操作（btn-primary）');
ok(!/plan-card__btn--edit" style="flex:1;padding:12px;" id="exportDataBtn"/.test(ts), '数据页不再混用 plan-card 按钮');

console.log('\n[8] P2-4 / P2-7 空态统一 + 空态要有动作');
ok(/gvEmpty\('🏆', '暂无最佳记录'/.test(gv), '记录页历史最佳空态 → .empty 组件');
ok(/gvEmpty\('📅', '本月暂无挑战记录'/.test(gv), '记录页每月挑战空态 → .empty 组件');
ok(/emptyHtml\('📋','还没有力量计划'[^)]*gotoTraining/.test(ts), '计划页力量空态带「去训练」动作');
ok(/emptyHtml\('📋','还没有有氧计划'[^)]*gotoCardio/.test(ts), '计划页有氧空态带「去训练」动作');
ok(/act==='gotoTraining'[\s\S]{0,120}switchSub\('training','strength'\)/.test(ts), 'gotoTraining 接到真实页面');
ok(/act==='gotoCardio'[\s\S]{0,120}switchSub\('training','cardio'\)/.test(ts), 'gotoCardio 接到真实页面');
ok(/function gvEmpty/.test(gv) && /typeof emptyHtml === 'function'/.test(gv), 'game-views 的空态工具在测试沙箱里可降级');

console.log('\n[9] P2-5 编队队卡降层');
ok(/\.pet-squad-card\{border:0;border-top:var\(--bw\) solid var\(--bd-l\)/.test(c), '队卡改为上分隔线（不再四层盒子）');

console.log('\n[10] P2-6 统计卡数值中性色');
ok(/\.sc-total \.sc-v,\.sc-vol \.sc-v,\.sc-rate \.sc-v\{color:var\(--text\)\}/.test(c), '四张统计卡数值统一 --text');
ok(!/\.sc-vol \.sc-v\{color:var\(--purple\)\}/.test(c), '不再紫/橙各给一色');

console.log('\n[11] P2-8 命名去重');
ok(/aria-controls="subGame">🎮 玩法</.test(html()), '设置子页签 = 🎮 玩法');
ok(!/aria-controls="subGame">🎮 挑战</.test(html()), '不再与「挑战·战斗」撞名');

console.log('\n[12] P2-9 图标语义');
ok(/exCardHtml\(ex,'权重 '\+ratioLabel\)/.test(ts), '力量徽标 = 「权重 100%」（不再是 🥇 100%）');
ok(!/exCardHtml\(ex,'💪 '/.test(ts), '不再用 💪 当权重前缀');
ok(/data-n="hmT" aria-label="回到本月" title="回到本月">今天</.test(tp), '热力图 📍 → 「今天」');

console.log('\n[13] P2-11 图鉴筛选芯片触摸宽度');
ok(/\.codex-chip\{min-height:var\(--touch-min\);min-width:var\(--touch-min\)/.test(c), 'R/SR 芯片 min-width 44');

console.log('\n[14] P2-10 字号阶梯（v2.14.27：10px 档下线）');
ok(/--fs-3xs:\.6875rem/.test(c), '--fs-3xs 已提到 .6875rem（11px）');
ok(!/--fs-3xs:\.625rem/.test(c), '不再出现 10px（.625rem）这一档');
ok(/--fs-2xs:\.6875rem/.test(c), '--fs-3xs 与 --fs-2xs 同值（最小档只有一个尺寸）');
ok(/\.gl-group-desc\{font-size:var\(--fs-xs\)/.test(c), '试炼卡副标题提到 12px（--fs-xs）');
ok(/\.gl-group-state\{font-size:var\(--fs-xs\)/.test(c), '试炼卡状态行提到 12px（--fs-xs）');

console.log('\n[15] P2-5/P3-4 个人表单降层 + 导入语义（v2.14.28）');
ok(/\.pf-row input,\.pf-row select\{flex:1;[^}]*border:0;border-bottom:var\(--bw\) solid var\(--bd\)/.test(c), '表单输入项只留一条 2px 下划线（不再叠 2px 外框）');
ok(/\.pf-row input:focus,\.pf-row select:focus\{border-bottom-color:var\(--brand\)/.test(c), '获焦时下划线转品牌色，不改尺寸');
ok(/\.data-hint\{margin-top:8px;font-size:var\(--fs-2xs\)/.test(c), '数据页说明行有独立样式（左对齐多行）');
const syncJs = src('sync.js');
ok(/导入 = 按键合并/.test(syncJs), '导入前写明「按键合并」语义');
ok(/导入 = 按键合并[^']*[\n ]*[^']*confirm\(/.test(syncJs) || /如果|文件里包含的/.test(syncJs), '导入前有覆盖语义确认');

console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
if (fail) { console.log('失败项:\n - ' + fails.join('\n - ')); process.exit(1); }
