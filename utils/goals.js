// 每周小目标：孩子每周自己选一个目标，首页看进度，达成得奖励星（纯逻辑，today 可注入）
//
// 目标类型：
// - achieve_days：本周有 N 天完成全部必做
// - task_sum：某任务本周累计量 ≥ N（如跳绳个数、课外阅读分钟）
// - review_days：本周有 N 天完成错题复习
// 进度只算本周、且只算到今天；首次达成时盖章 achievedAt（像勋章一样，之后不收回），
// 每个达成的目标 +checkin.GOAL_BONUS 星。达成前可以更换，达成后锁定。
const store = require('./store');
const D = require('./date');
const T = require('./tasks');
const C = require('./checkin');

// 按年级给出 4 个目标；任务累计量 = 该年级每日目标 × 天数
function presets(grade) {
  const g = Number(grade) || 1;
  const rope = T.buildTask('pe_rope', g, false).target * 5;
  const read = T.buildTask('chinese_reading_ext', g, false).target * 4;
  return [
    { id: 'days5', type: 'achieve_days', target: 5, emoji: '✅', label: '5 天完成全部必做' },
    { id: 'rope', type: 'task_sum', taskId: 'pe_rope', target: rope, emoji: '🪢', label: '跳绳累计 ' + rope + ' 个' },
    { id: 'reading', type: 'task_sum', taskId: 'chinese_reading_ext', target: read, emoji: '📚', label: '课外阅读累计 ' + read + ' 分钟' },
    { id: 'review3', type: 'review_days', target: 3, emoji: '🧠', label: '错题复习 3 天' },
  ];
}

function getGoal(monday) { return store.getGoals()[monday] || null; }

// 设定/更换本周目标；已达成的周不能再换，返回 false
function setGoal(monday, preset) {
  const goals = store.getGoals();
  const cur = goals[monday];
  if (cur && cur.achievedAt) return false;
  goals[monday] = {
    id: preset.id, type: preset.type, taskId: preset.taskId || null, target: preset.target,
    emoji: preset.emoji, label: preset.label,
    setAt: Math.max(Date.now(), ((cur && cur.setAt) || 0) + 1), // 严格递增，同步按后设置的胜
    achievedAt: 0,
  };
  store.saveGoals(goals);
  return true;
}

// 进度：data = { records, grade, reviewLog }；返回 { current, target, pct, done }
function progress(goal, data, monday, today) {
  const sunday = D.addDays(monday, 6);
  const end = today && today < sunday ? today : sunday;
  const inWeek = date => date >= monday && date <= end;
  const records = (data.records || []).filter(r => inWeek(r.date));
  let current = 0;
  if (goal.type === 'achieve_days') {
    const byDate = {};
    records.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
    current = Object.keys(byDate).filter(date =>
      C.dayCompletion(T.generateDailyTasks(data.grade, date), byDate[date]).allMustDone).length;
  } else if (goal.type === 'task_sum') {
    current = C.aggregateSum(records, [goal.taskId]);
  } else if (goal.type === 'review_days') {
    current = (data.reviewLog || []).filter(x => inWeek(x.date)).length;
  }
  const target = goal.target || 1;
  return { current, target, pct: Math.min(100, Math.round((current / target) * 100)), done: current >= target };
}

// 检查本周与上周（防止周末达成后没打开首页就跨周）是否新达成，盖章并返回新达成列表
function checkAchievements(data, today) {
  const thisMonday = D.mondayOf(today);
  const goals = store.getGoals();
  const fresh = [];
  [thisMonday, D.addDays(thisMonday, -7)].forEach(m => {
    const g = goals[m];
    if (!g || g.achievedAt) return;
    if (progress(g, data, m, today).done) {
      goals[m] = { ...g, achievedAt: Date.now() };
      fresh.push({ monday: m, goal: goals[m] });
    }
  });
  if (fresh.length) store.saveGoals(goals);
  return fresh;
}

module.exports = { presets, getGoal, setGoal, progress, checkAchievements };
