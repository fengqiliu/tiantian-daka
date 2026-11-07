// 学科与单元的共享常量（客户端各页面 / 报告与 weeklyReport 云函数共用）
// ⚠️ 云函数副本 cloudfunctions/weeklyReport/lib/subjects.js 由 scripts/sync-cloud-libs.js 复制，勿直接改；本文件不能依赖其他模块
const SUBJECTS = [
  { key: 'math', name: '数学', emoji: '🧮' },
  { key: 'chinese', name: '语文', emoji: '📕' },
  { key: 'english', name: '英语', emoji: '🔤' },
];
const ORDER = SUBJECTS.map(s => s.key);
const NAME = {};
SUBJECTS.forEach(s => { NAME[s.key] = s.name; });

function nameOf(key) { return NAME[key] || key; }

// 期末综合模拟卷的单元号记为 90，显示为「期末」
const FINAL_UNIT = 90;
function unitLabel(unit) { return unit === FINAL_UNIT ? '期末' : '第' + unit + '单元'; }

// 按 数学 → 语文 → 英语、单元升序（期末在最后）排列 { subject, unit } 行
function compareUnits(a, b) {
  return ORDER.indexOf(a.subject) - ORDER.indexOf(b.subject) || a.unit - b.unit;
}

// 单元掌握状态的文字标记（家长报告 / 学期报告 / 冲刺卷结果）
const MASTERY_MARK = { mastered: '👍 掌握', practice: '💪 再练练', few: '题还少' };

module.exports = { SUBJECTS, ORDER, NAME, nameOf, FINAL_UNIT, unitLabel, compareUnits, MASTERY_MARK };
