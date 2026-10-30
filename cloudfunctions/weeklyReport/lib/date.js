// 日期工具：全部使用本地时区，日期字符串统一为 'YYYY-MM-DD'
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function parseDate(s) {
  const parts = (s || '').split('-').map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function todayStr() { return formatDate(new Date()); }

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// 0=周日 ... 6=周六
function dayOfWeek(s) { return parseDate(s).getDay(); }

function isWeekend(s) { const w = dayOfWeek(s); return w === 0 || w === 6; }

function weekLabel(s) { return '周' + WEEK_CN[dayOfWeek(s)]; }

// 返回该日期所在周的周一
function mondayOf(s) {
  const dow = dayOfWeek(s);
  return addDays(s, dow === 0 ? -6 : 1 - dow);
}

function dateLabel(s) {
  const d = parseDate(s);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + weekLabel(s);
}

function greeting(hour) {
  if (hour < 6) return '夜深了，早点睡 🌙';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 21) return '晚上好';
  return '今天打卡完成了吗？';
}

module.exports = {
  WEEK_CN, formatDate, parseDate, todayStr, addDays,
  dayOfWeek, isWeekend, weekLabel, mondayOf, dateLabel, greeting,
};
