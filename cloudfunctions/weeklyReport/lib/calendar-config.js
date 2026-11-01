// 上海市中小学校历配置（假期模式的数据源）
// 依据上海市教委发布的学年校历（经公开渠道转载核对）：
// - 2025 学年寒假：2026-02-02 ~ 2026-02-27
// - 2026 学年寒假：2027-01-23 ~ 2027-02-21（第一学期 2027-01-22 结束，2-22 开学）
// 暑假按惯例取 7-01 ~ 8-31。每年 6 月前后市教委公布下学年校历，届时更新此表即可，
// 任务生成、首页标签、统计与提醒（云函数 lib 同步后）自动生效。
const HOLIDAYS = [
  { name: '寒假', emoji: '❄️', start: '2026-02-02', end: '2026-02-27' },
  { name: '暑假', emoji: '🏖️', start: '2026-07-01', end: '2026-08-31' },
  { name: '寒假', emoji: '❄️', start: '2027-01-23', end: '2027-02-21' },
  { name: '暑假', emoji: '🏖️', start: '2027-07-01', end: '2027-08-31' },
];

// 返回日期所在假期 { name, emoji, start, end }；ISO 日期字符串可直接比较
function holidayAt(dateStr) {
  if (!dateStr) return null;
  for (const h of HOLIDAYS) {
    if (dateStr >= h.start && dateStr <= h.end) return h;
  }
  return null;
}

// 期末倒计时：dateStr 距下一个假期开始还有 1..days 天时返回 { name, emoji, start, daysLeft }，否则 null
// （期末考试一般在放假前一两周，提前 3 周开始复习冲刺）
const COUNTDOWN_DAYS = 21;
function examCountdown(dateStr, days) {
  if (!dateStr || holidayAt(dateStr)) return null;
  const limit = days || COUNTDOWN_DAYS;
  const dayMs = 24 * 3600 * 1000;
  const ts = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  for (const h of HOLIDAYS) {
    if (h.start <= dateStr) continue;
    const daysLeft = Math.round((ts(h.start) - ts(dateStr)) / dayMs);
    return daysLeft <= limit ? { name: h.name, emoji: h.emoji, start: h.start, daysLeft } : null;
  }
  return null;
}

module.exports = { HOLIDAYS, COUNTDOWN_DAYS, holidayAt, examCountdown };
