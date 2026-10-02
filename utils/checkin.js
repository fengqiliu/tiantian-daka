// 打卡记录、统计与进度计算
const store = require('./store');
const T = require('./tasks');
const D = require('./date');

function recordId(date, taskId) { return date + '#' + taskId; }

// stars: 1=加油 2=不错 3=超棒（自评/家长评），一条记录一天内幂等覆盖
function upsertRecord(date, taskId, value, stars, note) {
  const def = T.getTaskDef(taskId);
  if (!def) return null;
  stars = Math.min(3, Math.max(1, Number(stars) || 2));
  const n = def.type === 'done' ? 1 : Math.max(0, Number(value) || 0);
  const records = store.getRecordsRaw(); // 读写走 raw，避免丢掉同步墓碑
  const id = recordId(date, taskId);
  const rec = { id, date, taskId, value: { type: def.type, n }, stars, note: note || '', updatedAt: Date.now() };
  const i = records.findIndex(r => r.id === id);
  if (i >= 0) records[i] = rec; else records.push(rec);
  store.saveRecords(records);
  return rec;
}

// 删除 = 打墓碑（deleted: true），增量同步时告知云端；物理删除会让本地删掉的记录在云端复活
function removeRecord(date, taskId) {
  const id = recordId(date, taskId);
  const records = store.getRecordsRaw();
  const i = records.findIndex(r => r.id === id);
  if (i < 0) return;
  records[i] = { ...records[i], deleted: true, stars: 0, updatedAt: Date.now() };
  store.saveRecords(records);
}

function getDayRecords(date) {
  return store.getRecords().filter(r => r.date === date);
}

// 当日完成度：tasks 来自 generateDailyTasks，records 为当日记录
function dayCompletion(tasks, dayRecords) {
  const map = {};
  (dayRecords || []).forEach(r => { map[r.taskId] = r; });
  let done = 0, mustTotal = 0, mustDone = 0, stars = 0;
  tasks.forEach(t => {
    if (t.must) mustTotal++;
    const r = map[t.id];
    if (r) { done++; stars += (r.stars || 0); if (t.must) mustDone++; }
  });
  return {
    total: tasks.length, done, mustTotal, mustDone,
    allMustDone: mustTotal > 0 && mustDone === mustTotal,
    stars,
  };
}

function groupByDate(records) {
  const byDate = {};
  records.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  return byDate;
}

// 连续打卡：任一任务打卡即算一天；today 可注入便于测试
function streaks(records, today) {
  today = today || D.todayStr();
  const dates = [...new Set(records.map(r => r.date))].sort();
  if (!dates.length) return { current: 0, best: 0 };
  let best = 1, run = 1;
  for (let i = 1; i < dates.length; i++) {
    run = (D.addDays(dates[i - 1], 1) === dates[i]) ? run + 1 : 1;
    if (run > best) best = run;
  }
  const set = new Set(dates);
  let cur = 0;
  let cursor = set.has(today) ? today : D.addDays(today, -1); // 今天还没打卡不打断连击
  while (set.has(cursor)) { cur++; cursor = D.addDays(cursor, -1); }
  return { current: cur, best };
}

// 勋章奖励星：与 utils/badges.js 的 BADGE_DEFS[].bonus 一一对应（单向依赖，badges.js 读本表）。
// 勋章奖励并入总星数，故此处不得反向 require badges.js 以免循环依赖。
const BADGE_BONUS = {
  first_checkin: 0, perfect_day: 1, streak_7: 5, streak_30: 20, streak_100: 50,
  full_week: 7, reader_10h: 10, calc_1000: 10, rope_10k: 10,
  bookworm: 10, sunshine: 10, writer: 5,
};

// 总星星 = Σ任务星 + 每日全必做加成1星 + Σ已获勋章奖励
// badges 为已获勋章数组（utils/badges.js 的 evaluate/badgeWall 传同一份 store.getBadges()）；
// 动态计算，不冗余存储，避免与勋章列表不一致。
function totalStars(records, grade, badges) {
  const byDate = groupByDate(records);
  let total = 0;
  const cache = {};
  Object.keys(byDate).forEach(date => {
    const recs = byDate[date];
    recs.forEach(r => { total += (r.stars || 0); });
    if (!cache[date]) cache[date] = T.generateDailyTasks(grade, date);
    if (dayCompletion(cache[date], recs).allMustDone) total += 1;
  });
  (badges || []).forEach(b => { total += BADGE_BONUS[b.id] || 0; });
  return total;
}

// 某周统计（传入该周任意一天）
function weeklyStats(records, grade, anyDateInWeek) {
  const monday = D.mondayOf(anyDateInWeek || D.todayStr());
  let days = 0, achieved = 0, stars = 0;
  const bySection = {};
  for (let i = 0; i < 7; i++) {
    const date = D.addDays(monday, i);
    const recs = records.filter(r => r.date === date);
    if (!recs.length) continue;
    days++;
    stars += recs.reduce((s, r) => s + (r.stars || 0), 0);
    if (dayCompletion(T.generateDailyTasks(grade, date), recs).allMustDone) achieved++;
    recs.forEach(r => {
      const def = T.getTaskDef(r.taskId);
      if (def) bySection[def.section] = (bySection[def.section] || 0) + 1;
    });
  }
  return { monday, days, achieved, stars, bySection };
}

// 月历数据：lead 为周一开头网格的前置空格数
function monthStats(year, month, records, grade) {
  const today = D.todayStr();
  const lead = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDate = groupByDate(records);
  const cells = [];
  let checkinDays = 0, achievedDays = 0, stars = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = D.formatDate(new Date(year, month - 1, d));
    const recs = byDate[date] || [];
    let has = recs.length > 0, achieved = false;
    if (has) {
      checkinDays++;
      stars += recs.reduce((s, r) => s + (r.stars || 0), 0);
      achieved = dayCompletion(T.generateDailyTasks(grade, date), recs).allMustDone;
      if (achieved) achievedDays++;
    }
    cells.push({ date, day: d, isToday: date === today, has, achieved });
  }
  return { lead, cells, checkinDays, achievedDays, stars };
}

// 累计聚合（勋章用）：对指定 taskId 集合求 value.n 之和
function aggregateSum(records, taskIds) {
  const set = new Set(taskIds);
  return records.reduce((s, r) => set.has(r.taskId) ? s + ((r.value && r.value.n) || 0) : s, 0);
}

// 是否存在"完美一天"（任一天完成全部必做）
function hasPerfectDay(records, grade) {
  const byDate = groupByDate(records);
  return Object.keys(byDate).some(date =>
    dayCompletion(T.generateDailyTasks(grade, date), byDate[date]).allMustDone);
}

// 是否存在"全勤周"（任一自然周一至周日全部达成）
function hasFullWeek(records, grade, today) {
  today = today || D.todayStr();
  const dates = [...new Set(records.map(r => r.date))].sort();
  if (!dates.length) return false;
  let m = D.mondayOf(dates[0]);
  const byDate = groupByDate(records);
  while (m <= today) {
    let all = true;
    for (let i = 0; i < 7; i++) {
      const date = D.addDays(m, i);
      const recs = byDate[date] || [];
      if (!recs.length || !dayCompletion(T.generateDailyTasks(grade, date), recs).allMustDone) { all = false; break; }
    }
    if (all) return true;
    m = D.addDays(m, 7);
  }
  return false;
}

module.exports = {
  recordId, upsertRecord, removeRecord, getDayRecords, dayCompletion,
  groupByDate, streaks, totalStars, weeklyStats, monthStats,
  aggregateSum, hasPerfectDay, hasFullWeek, BADGE_BONUS,
};
