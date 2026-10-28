// 补打卡：孩子忘了打卡时，补昨天或前天的任务（纯逻辑，today / now 可注入）
//
// 规则：
// - 只能补昨天、前天（WINDOW_DAYS = 2）；今天走正常打卡
// - 每周最多补 2 天（按补卡操作发生的那一周计；同一天补多项只占一次）
// - 补卡记录固定 1⭐（不自评），带 { makeup: true, makeupAt }；
//   补卡那天不拿"全部必做"+1 加成（见 checkin.totalStars），但能接上连击
// - 家长确认在页面上做（与屏幕时间任务同一模式），本模块只管规则
const store = require('./store');
const D = require('./date');
const T = require('./tasks');
const C = require('./checkin');

const WINDOW_DAYS = 2;
const WEEKLY_LIMIT = 2;

function canMakeupDate(date, today) {
  return date >= D.addDays(today, -WINDOW_DAYS) && date <= D.addDays(today, -1);
}

// 本周（today 所在周）已补过的日期集合
function _usedDates(records, today) {
  const monday = D.mondayOf(today);
  const start = new Date(monday + 'T00:00:00').getTime();
  const end = new Date(D.addDays(monday, 7) + 'T00:00:00').getTime();
  return new Set(records.filter(r => r.makeup && r.makeupAt >= start && r.makeupAt < end).map(r => r.date));
}

function remaining(records, today) {
  return Math.max(0, WEEKLY_LIMIT - _usedDates(records, today).size);
}

// 能否补 date 这一天：返回 { ok } 或 { ok:false, error }
function check(records, date, today) {
  if (!canMakeupDate(date, today)) return { ok: false, error: '只能补昨天或前天的打卡' };
  const used = _usedDates(records, today);
  if (!used.has(date) && used.size >= WEEKLY_LIMIT) {
    return { ok: false, error: '本周补打卡用完了（每周 ' + WEEKLY_LIMIT + ' 天）' };
  }
  return { ok: true };
}

// 那天清单里还没打卡的任务
function missingTasks(records, grade, date) {
  const done = new Set(records.filter(r => r.date === date).map(r => r.taskId));
  return T.generateDailyTasks(grade, date).filter(t => !done.has(t.id));
}

// 保存一条补卡记录；taskId 必须在那天的清单里
function save(date, taskId, value, note, today, grade, now) {
  today = today || D.todayStr();
  const records = store.getRecords();
  const c = check(records, date, today);
  if (!c.ok) return c;
  if (!T.generateDailyTasks(grade, date).some(t => t.id === taskId)) return { ok: false, error: '那天没有这项任务' };
  const rec = C.upsertRecord(date, taskId, value, 1, note, { makeup: true, makeupAt: now || Date.now() });
  return rec ? { ok: true, record: rec } : { ok: false, error: '任务不存在' };
}

module.exports = { WINDOW_DAYS, WEEKLY_LIMIT, canMakeupDate, remaining, check, missingTasks, save };
