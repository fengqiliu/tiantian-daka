// 家长报告：任务完成率、口算趋势等分析（纯逻辑，today 可注入测试）
const D = require('./date');
const T = require('./tasks');

// 近 days 天逐个任务的出现/完成次数与完成率（升序，最常被跳过的排最前）
function taskRates(records, grade, days, today) {
  const byKey = {};
  records.forEach(r => { byKey[r.date + '#' + r.taskId] = true; });
  const agg = {};
  for (let i = 0; i < days; i++) {
    const date = D.addDays(today, -i);
    T.generateDailyTasks(grade, date).forEach(t => {
      const a = (agg[t.id] = agg[t.id] || {
        id: t.id, name: t.name, emoji: t.emoji, section: t.section, appeared: 0, done: 0,
      });
      a.appeared++;
      if (byKey[date + '#' + t.id]) a.done++;
    });
  }
  return Object.values(agg)
    .map(a => ({ ...a, rate: a.appeared ? Math.round((a.done / a.appeared) * 100) : 0 }))
    .sort((x, y) => x.rate - y.rate);
}

// 区间总览：打卡天数 / 达成天数 / 星星
function overview(records, grade, days, today) {
  const start = D.addDays(today, -(days - 1));
  const inRange = records.filter(r => r.date >= start && r.date <= today);
  const dates = new Set(inRange.map(r => r.date));
  let achieved = 0;
  dates.forEach(date => {
    const recs = inRange.filter(r => r.date === date);
    const tasks = T.generateDailyTasks(grade, date);
    let mustTotal = 0, mustDone = 0;
    tasks.forEach(t => {
      if (!t.must) return;
      mustTotal++;
      if (recs.some(r => r.taskId === t.id)) mustDone++;
    });
    if (mustTotal > 0 && mustDone === mustTotal) achieved++;
  });
  return {
    days,
    checkinDays: dates.size,
    achievedDays: achieved,
    stars: inRange.reduce((s, r) => s + (r.stars || 0), 0),
  };
}

// 口算练习：区间内会话过滤与正确率汇总
function drillSummary(sessions, days, today) {
  const start = D.addDays(today, -(days - 1));
  const inRange = sessions.filter(s => s.date >= start && s.date <= today);
  const total = inRange.reduce((s, x) => s + (x.total || 0), 0);
  const correct = inRange.reduce((s, x) => s + (x.correct || 0), 0);
  return {
    sessions: inRange,
    count: inRange.length,
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : null,
  };
}

module.exports = { taskRates, overview, drillSummary };
