// 学期成长报告：由上海校历推出学期 / 假期，汇总一个时段的成长（纯逻辑，today 可注入）
//
// 时段划分只依赖 calendar-config.js 的 HOLIDAYS：暑假之后到寒假之前是"第一学期"，
// 寒假之后到暑假之前是"第二学期"，假期本身也是一个时段。校历之外（第一个假期之前、
// 最后一个假期之后）按惯例推算（9-01 开学、1 月底 / 6-30 结束），并标记 approx。
const CAL = require('./calendar-config');
const D = require('./date');
const C = require('./checkin');
const B = require('./badges');
const REPORT = require('./report');

const year = d => Number(d.slice(0, 4));

function _holidayPeriod(h) {
  return { kind: 'holiday', name: h.name, emoji: h.emoji, label: year(h.start) + ' ' + h.name, start: h.start, end: h.end, approx: false };
}

// 假期 h 之后的学期；nextH 为下一个假期（没有则按惯例推算学期末）
function _termAfter(h, nextH) {
  const first = h.name === '暑假';
  const schoolYear = first ? year(h.end) : year(h.end) - 1;
  const name = first ? '第一学期' : '第二学期';
  const end = nextH ? D.addDays(nextH.start, -1) : (first ? (schoolYear + 1) + '-01-31' : year(h.end) + '-06-30');
  return { kind: 'term', name, emoji: '📖', label: schoolYear + ' 学年' + name, start: D.addDays(h.end, 1), end, approx: !nextH };
}

// 第一个假期之前的学期（推算）
function _termBefore(h) {
  if (h.name === '寒假') {
    const sy = year(h.start) - 1;
    return { kind: 'term', name: '第一学期', emoji: '📖', label: sy + ' 学年第一学期', start: sy + '-09-01', end: D.addDays(h.start, -1), approx: true };
  }
  const sy = year(h.start) - 1;
  return { kind: 'term', name: '第二学期', emoji: '📖', label: sy + ' 学年第二学期', start: year(h.start) + '-03-01', end: D.addDays(h.start, -1), approx: true };
}

// 校历完全覆盖不到的日期：按月份惯例推算
function _generic(date) {
  const y = year(date);
  const m = Number(date.slice(5, 7));
  if (m >= 9) return { kind: 'term', name: '第一学期', emoji: '📖', label: y + ' 学年第一学期', start: y + '-09-01', end: (y + 1) + '-01-31', approx: true };
  if (m === 1) return { kind: 'term', name: '第一学期', emoji: '📖', label: (y - 1) + ' 学年第一学期', start: (y - 1) + '-09-01', end: y + '-01-31', approx: true };
  if (m <= 6) return { kind: 'term', name: '第二学期', emoji: '📖', label: (y - 1) + ' 学年第二学期', start: y + '-02-01', end: y + '-06-30', approx: true };
  return { kind: 'holiday', name: '暑假', emoji: '🏖️', label: y + ' 暑假', start: y + '-07-01', end: y + '-08-31', approx: true };
}

// 按时间顺序的全部已知时段
function periods() {
  const hs = CAL.HOLIDAYS.slice().sort((a, b) => (a.start < b.start ? -1 : 1));
  if (!hs.length) return [];
  const out = [_termBefore(hs[0])];
  hs.forEach((h, i) => {
    out.push(_holidayPeriod(h));
    out.push(_termAfter(h, hs[i + 1] || null));
  });
  return out;
}

function periodAt(date) {
  const list = periods();
  return list.find(p => date >= p.start && date <= p.end) || _generic(date);
}

function prev(p) { return periodAt(D.addDays(p.start, -1)); }
function next(p) { return periodAt(D.addDays(p.end, 1)); }

function _longestRun(dates) {
  const sorted = Array.from(new Set(dates)).sort();
  let best = 0, run = 0, last = null;
  sorted.forEach(d => {
    run = last && D.addDays(last, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  });
  return best;
}

function _accuracy(list) {
  const total = list.reduce((s, x) => s + (x.total || 0), 0);
  const correct = list.reduce((s, x) => s + (x.correct || 0), 0);
  return total ? Math.round((correct / total) * 100) : null;
}

// data = { records, grade, badges, goals, drillSessions, quizHistory, reviewLog }（来自 CTX.scope()）
function termSummary(data, period, today) {
  const base = { label: period.label, kind: period.kind, emoji: period.emoji, start: period.start, end: period.end, approx: period.approx };
  if (today < period.start) {
    return { ...base, notStarted: true, inProgress: false, to: period.start, checkinDays: 0, achievedDays: 0, stars: 0, bestStreak: 0,
      totals: { rope: 0, readingMinutes: 0, outdoorMinutes: 0, poems: 0, calc: 0 }, badges: [], goalsAchieved: 0,
      drill: { count: 0, firstAccuracy: null, lastAccuracy: null }, quizCount: 0, reviewDays: 0, highlights: [] };
  }
  const to = today < period.end ? today : period.end;
  const inRange = d => d >= period.start && d <= to;
  const startTs = new Date(period.start + 'T00:00:00').getTime();
  const endTs = new Date(D.addDays(to, 1) + 'T00:00:00').getTime();
  const inTs = ts => ts >= startTs && ts < endTs;

  let days = 1;
  while (D.addDays(period.start, days - 1) < to) days++;
  const records = (data.records || []).filter(r => inRange(r.date));
  const ov = REPORT.overview(records, data.grade, days, to);
  const totals = {
    rope: C.aggregateSum(records, ['pe_rope']),
    readingMinutes: C.aggregateSum(records, ['chinese_reading_ext', 'english_read']),
    outdoorMinutes: C.aggregateSum(records, ['pe_outdoor']),
    poems: C.aggregateSum(records, ['chinese_poem']),
    calc: C.aggregateSum(records, ['math_calc']),
  };
  const badges = (data.badges || []).filter(b => inTs(b.earnedAt)).map(b => {
    const def = B.badgeById(b.id);
    return { id: b.id, name: def ? def.name : b.id, emoji: def ? def.emoji : '🏅' };
  });
  const goalsAchieved = Object.keys(data.goals || {}).filter(k => data.goals[k] && inTs(data.goals[k].achievedAt)).length;

  // 口算：本时段内的会话按时间排序，前一半 vs 后一半的正确率
  const sessions = (data.drillSessions || []).filter(s => inRange(s.date)).sort((a, b) => (a.at || 0) - (b.at || 0));
  const half = Math.floor(sessions.length / 2);
  const drill = {
    count: sessions.length,
    firstAccuracy: half ? _accuracy(sessions.slice(0, half)) : null,
    lastAccuracy: half ? _accuracy(sessions.slice(-half)) : null,
  };

  const bestStreak = _longestRun(records.map(r => r.date));
  const highlights = [];
  if (ov.checkinDays) highlights.push('坚持打卡 ' + ov.checkinDays + ' 天，最长连续 ' + bestStreak + ' 天');
  if (drill.firstAccuracy !== null && drill.lastAccuracy > drill.firstAccuracy) {
    highlights.push('口算正确率从 ' + drill.firstAccuracy + '% 提高到 ' + drill.lastAccuracy + '%');
  }
  if (totals.rope) highlights.push('跳绳累计 ' + totals.rope + ' 个');
  if (totals.readingMinutes >= 60) highlights.push('课外阅读 ' + Math.round(totals.readingMinutes / 6) / 10 + ' 小时');
  if (badges.length) highlights.push('获得 ' + badges.length + ' 枚新勋章');
  if (goalsAchieved) highlights.push('完成 ' + goalsAchieved + ' 个周目标');

  return {
    ...base,
    notStarted: false,
    inProgress: today <= period.end,
    to,
    checkinDays: ov.checkinDays,
    achievedDays: ov.achievedDays,
    stars: ov.stars,
    bestStreak,
    totals,
    badges,
    goalsAchieved,
    drill,
    quizCount: (data.quizHistory || []).filter(q => inTs(q.at)).length,
    reviewDays: (data.reviewLog || []).filter(x => inRange(x.date)).length,
    highlights: highlights.slice(0, 4),
  };
}

module.exports = { periods, periodAt, prev, next, termSummary };
