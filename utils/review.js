// 错题统一复习：间隔重复（Leitner 盒）、每日复习队列、复习日志（纯逻辑，today 可注入）
//
// 口算错题本与小卷错题本共用同一套排期：
// - 答错：进盒 0，明天到期（错题累计次数 +1）；已在本里的随时打回盒 0
// - 到期后答对：升一盒，盒 1 隔 3 天、盒 2 隔 7 天；在盒 2 再答对（共连对 3 次）移出错题本
// - 未到期答对：不变（同一天在口算/小卷/复习里反复答对不会被刷掉）
// 旧版错题没有 box/due：视为盒 0、今天到期。
const store = require('./store');
const D = require('./date');

const INTERVALS = [1, 3, 7]; // 盒 0/1/2 的复习间隔（天）
const MASTER_BOX = 3;        // 升到此盒即掌握，移出错题本
const DAILY_N = 5;           // 每日复习题数

function isDue(entry, today) { return (entry.due || '') <= today; }

// 把一次作答应用到错题列表；makeEntry() 返回新错题的业务字段（含 key）
// 返回 { list, result }，result: recorded | promoted | mastered | early | none
function apply(list, key, correct, today, makeEntry) {
  const out = (list || []).slice();
  const i = out.findIndex(w => w.key === key);
  if (correct) {
    if (i < 0) return { list: out, result: 'none' };
    const e = out[i];
    if (!isDue(e, today)) return { list: out, result: 'early' };
    const box = (e.box || 0) + 1;
    if (box >= MASTER_BOX) {
      out.splice(i, 1);
      return { list: out, result: 'mastered' };
    }
    out[i] = { ...e, box, due: D.addDays(today, INTERVALS[box]) };
    return { list: out, result: 'promoted' };
  }
  const due = D.addDays(today, INTERVALS[0]);
  if (i >= 0) {
    out[i] = { ...out[i], wrongCount: (out[i].wrongCount || 0) + 1, lastWrongAt: Date.now(), box: 0, due };
  } else {
    out.push({ ...makeEntry(), key, wrongCount: 1, lastWrongAt: Date.now(), box: 0, due });
  }
  return { list: out, result: 'recorded' };
}

function _dueItems(today) {
  const math = store.getMathWrong().filter(w => isDue(w, today)).map(w => ({
    source: 'math', key: w.key, level: w.level, problem: w.problem, due: w.due || '', wrongCount: w.wrongCount || 0,
  }));
  const quiz = store.getQuizWrong().filter(w => isDue(w, today)).map(w => ({
    source: 'quiz', key: w.key, question: w.question, due: w.due || '', wrongCount: w.wrongCount || 0,
  }));
  return math.concat(quiz);
}

function dueCount(today) { return _dueItems(today || D.todayStr()).length; }

// 今日复习队列：先到期先复习，同一天到期的错得多的优先
function dailyQueue(today, n) {
  return _dueItems(today || D.todayStr())
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : b.wrongCount - a.wrongCount))
    .slice(0, n || DAILY_N);
}

// 复习日志：每天一条，同日多组累计
function logSession(today, total, correct) {
  const log = store.getReviewLog().slice();
  const i = log.findIndex(x => x.date === today);
  if (i >= 0) log[i] = { date: today, total: log[i].total + total, correct: log[i].correct + correct };
  else log.unshift({ date: today, total, correct });
  store.saveReviewLog(log);
}

function reviewedToday(today) { return store.getReviewLog().some(x => x.date === (today || D.todayStr())); }
function reviewDays() { return store.getReviewLog().length; }

module.exports = {
  INTERVALS, MASTER_BOX, DAILY_N,
  isDue, apply, dueCount, dailyQueue, logSession, reviewedToday, reviewDays,
};
