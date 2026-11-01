// 周报推送摘要（纯逻辑；客户端与 weeklyReport 云函数共用）
// ⚠️ 云函数副本 cloudfunctions/weeklyReport/lib/week-brief.js 由 scripts/sync-cloud-libs.js 复制，勿直接改
// 只依赖同目录的 date.js / tasks.js（云函数 lib 里也有同名副本）
const D = require('./date');
const T = require('./tasks');

// 北京时间的今天：云函数服务器可能运行在 UTC，不能直接用本地时区
function cnToday(nowMs) {
  return new Date((nowMs || Date.now()) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function lastWeekMonday(today) { return D.addDays(D.mondayOf(today), -7); }

const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };
// 与 utils/quiz-bank.js unitLabel 一致（期末卷 unit 记为 90；云函数 lib 里没有题库，这里单独写一份，有测试守护）
const unitLabel = unit => (unit === 90 ? '期末' : '第' + unit + '单元');
const cnDate = ms => new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);

// 这一周练过、答满 3 题且正确率不到 80% 的单元里最弱的一个（规则同家长报告周报"需关注"）
function weakUnit(quizHistory, monday) {
  const sunday = D.addDays(monday, 6);
  const by = {};
  (quizHistory || []).forEach(h => {
    const date = cnDate(h.at || 0);
    if (date < monday || date > sunday) return;
    (h.units || []).forEach(u => {
      const row = by[h.subject + '#' + u.unit] || (by[h.subject + '#' + u.unit] = { subject: h.subject, unit: u.unit, total: 0, correct: 0 });
      row.total += u.total || 0;
      row.correct += u.correct || 0;
    });
  });
  const weak = Object.values(by)
    .filter(x => x.total >= 3 && x.correct / x.total < 0.8)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)[0];
  return weak ? (SUBJECT_NAME[weak.subject] || weak.subject) + unitLabel(weak.unit) : null;
}

// records：孩子的打卡记录（已过滤墓碑即可，其他周的会被忽略）；monday：要汇总那一周的周一
// quizHistory（可选）：小卷历史，有薄弱单元时文案带上「再练…」；订阅消息 thing 字段限 20 字
function brief(records, grade, monday, quizHistory) {
  const sunday = D.addDays(monday, 6);
  const byDate = {};
  (records || []).forEach(r => {
    if (r.deleted || r.date < monday || r.date > sunday) return;
    (byDate[r.date] = byDate[r.date] || []).push(r);
  });
  let checkinDays = 0, achievedDays = 0, stars = 0;
  Object.keys(byDate).forEach(date => {
    const recs = byDate[date];
    checkinDays++;
    stars += recs.reduce((s, r) => s + (r.stars || 0), 0);
    const done = new Set(recs.map(r => r.taskId));
    const must = T.generateDailyTasks(grade, date).filter(t => t.must);
    if (must.length && must.every(t => done.has(t.id))) achievedDays++;
  });
  const weak = weakUnit(quizHistory, monday);
  const fit = s => Array.from(s).length <= 20;
  const full = '打卡' + checkinDays + '天·达成' + achievedDays + '天·⭐' + stars;
  let text = full;
  if (weak) {
    // 放不下时去掉"达成"，优先保留打卡天数、星星和要再练的单元
    const withWeak = full + '·再练' + weak;
    const short = '打卡' + checkinDays + '天·⭐' + stars + '·再练' + weak;
    text = fit(withWeak) ? withWeak : short;
  }
  text = Array.from(text).slice(0, 20).join('');
  return { monday, checkinDays, achievedDays, stars, weakUnit: weak, text };
}

module.exports = { cnToday, lastWeekMonday, weakUnit, brief };
