// 家长报告：任务完成率、口算趋势等分析（纯逻辑，today 可注入测试）
const D = require('./date');
const T = require('./tasks');
const B = require('./badges');

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

// ── 家长周报（周一至周日）──
// 默认看"上一个完整周"：周一打开看的是上周，周日打开看的是再前一周（本周尚未结束）
function lastWeekMonday(today) { return D.addDays(D.mondayOf(today), -7); }

function _md(date) {
  const d = D.parseDate(date);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function weekLabel(monday) { return _md(monday) + '–' + _md(D.addDays(monday, 6)); }

// 必做任务逐项统计：同一任务有的日子必做、有的日子选做（如户外），只计必做的日子
function _mustRates(records, grade, monday, span) {
  const byKey = {};
  records.forEach(r => { byKey[r.date + '#' + r.taskId] = true; });
  const agg = {};
  for (let i = 0; i < span; i++) {
    const date = D.addDays(monday, i);
    T.generateDailyTasks(grade, date).filter(t => t.must).forEach(t => {
      const a = (agg[t.id] = agg[t.id] || { id: t.id, name: t.name, appeared: 0, done: 0 });
      a.appeared++;
      if (byKey[date + '#' + t.id]) a.done++;
    });
  }
  return Object.values(agg).map(a => ({ ...a, rate: Math.round((a.done / a.appeared) * 100) }));
}

// 周报：data = { records, grade, badges, drillSessions, quizHistory, reviewLog, today? }（来自 CTX.scope()）
// today 落在本周内时（本周进行中），任务完成率只算到今天，未来的日子不算漏做
// 亮点/需关注按固定规则挑选，各最多 3 条；只陈述事实并给温和建议，不和别人比
function weeklyDigest(data, monday) {
  const records = data.records || [];
  const grade = data.grade;
  const sunday = D.addDays(monday, 6);
  const end = data.today && data.today >= monday && data.today < sunday ? data.today : sunday;
  let span = 1;
  while (D.addDays(monday, span - 1) < end) span++;
  const inWeek = date => date >= monday && date <= sunday;

  const ov = overview(records, grade, 7, sunday);
  const prev = overview(records, grade, 7, D.addDays(monday, -1));
  const vsPrev = ov.achievedDays - prev.achievedDays;

  const ds = drillSummary(data.drillSessions || [], 7, sunday);
  const drill = { count: ds.count, total: ds.total, correct: ds.correct, accuracy: ds.accuracy };
  const quizIn = (data.quizHistory || []).filter(q => inWeek(D.formatDate(new Date(q.at))));
  const quiz = { count: quizIn.length, labels: quizIn.map(q => q.label) };
  const revIn = (data.reviewLog || []).filter(x => inWeek(x.date));
  const review = {
    days: revIn.length,
    total: revIn.reduce((s, x) => s + (x.total || 0), 0),
    correct: revIn.reduce((s, x) => s + (x.correct || 0), 0),
  };
  const startTs = new Date(monday + 'T00:00:00').getTime();
  const endTs = new Date(D.addDays(monday, 7) + 'T00:00:00').getTime();
  const badgesEarned = (data.badges || [])
    .filter(b => b.earnedAt >= startTs && b.earnedAt < endTs)
    .map(b => {
      const def = B.badgeById(b.id);
      return { id: b.id, name: def ? def.name : b.id, emoji: def ? def.emoji : '🏅' };
    });

  const mustRates = _mustRates(records, grade, monday, span);
  const highlights = [];
  if (ov.achievedDays === 7) highlights.push('全勤一周：7 天都完成了必做任务');
  else if (ov.achievedDays >= 5) highlights.push('有 ' + ov.achievedDays + ' 天完成了全部必做任务');
  // 坚持最久的选做任务（不含需家长确认的屏幕时间）
  const extra = taskRates(records, grade, span, end)
    .filter(a => a.rate === 100 && a.appeared >= 3)
    .filter(a => {
      const def = T.getTaskDef(a.id);
      return !(def && def.parentConfirm) && !mustRates.some(m => m.id === a.id);
    })
    .sort((x, y) => y.appeared - x.appeared)[0];
  if (extra) highlights.push('「' + extra.name + '」' + extra.done + '/' + extra.appeared + ' 天都做到了');
  if (badgesEarned.length) highlights.push('获得勋章' + badgesEarned.map(b => '「' + b.name + '」').join(''));
  if (drill.count >= 2 && drill.accuracy >= 90) highlights.push('口算正确率 ' + drill.accuracy + '%（' + drill.count + ' 次练习）');
  if (review.days >= 3) highlights.push('错题复习坚持了 ' + review.days + ' 天');
  if (quiz.labels.indexOf('优秀') > -1) highlights.push('小卷拿到「优秀」');

  const attention = [];
  if (!ov.checkinDays) {
    attention.push('这周没有打卡记录，可以和孩子一起定个小目标');
  } else {
    mustRates
      .filter(a => a.appeared >= 3 && a.rate < 50)
      .sort((x, y) => x.rate - y.rate)
      .slice(0, 2)
      .forEach(a => attention.push('必做「' + a.name + '」只完成 ' + a.done + '/' + a.appeared + ' 天'));
    if (drill.count && drill.accuracy < 70) attention.push('口算正确率 ' + drill.accuracy + '%，可以先回到低一级巩固');
    if (vsPrev <= -2) attention.push('达成天数比前一周少 ' + (-vsPrev) + ' 天');
  }

  return {
    monday, sunday,
    label: weekLabel(monday),
    checkinDays: ov.checkinDays,
    achievedDays: ov.achievedDays,
    stars: ov.stars,
    vsPrev,
    drill, quiz, review, badgesEarned,
    highlights: highlights.slice(0, 3),
    attention: attention.slice(0, 3),
  };
}

module.exports = { taskRates, overview, drillSummary, lastWeekMonday, weekLabel, weeklyDigest };
