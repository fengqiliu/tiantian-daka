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

// records：孩子的打卡记录（已过滤墓碑即可，其他周的会被忽略）；monday：要汇总那一周的周一
function brief(records, grade, monday) {
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
  const text = ('打卡' + checkinDays + '天·达成' + achievedDays + '天·⭐' + stars).slice(0, 20);
  return { monday, checkinDays, achievedDays, stars, text };
}

module.exports = { cnToday, lastWeekMonday, brief };
