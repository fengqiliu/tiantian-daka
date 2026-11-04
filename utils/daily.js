// 今日一练：解决"不知道练什么"——3 题口算 + 5 题小卷（约 3 分钟）。
// 小卷里 2 题来自孩子最薄弱的单元，其余 3 题按星期轮换科目（周日 / 周三 / 周六数学，周一 / 周四语文，周二 / 周五英语）。
// 复用错题复习页的卡片与判分，答错同样进错题本；做完按科目写入小卷历史（带单元）和口算会话。
const store = require('./store');
const D = require('./date');
const AR = require('./arithmetic');
const QZ = require('./quiz');
const REPORT = require('./report');
const SUBJ = require('./subjects');

const MATH_N = 3;
const QUIZ_N = 5;
const WEAK_N = 2;

function subjectOf(date) { return SUBJ.ORDER[D.dayOfWeek(date) % SUBJ.ORDER.length]; }

// 最薄弱的单元：小卷历史里答满 3 题且正确率不到 80% 中最低的一个
function weakUnit(quizHistory) {
  const weak = REPORT.unitMastery(quizHistory, []).filter(u => u.status === 'practice').sort((a, b) => a.rate - b.rate)[0];
  return weak ? { subject: weak.subject, unit: weak.unit, label: weak.subjectName + weak.label } : null;
}

// 从 (subject, unit?) 里取 n 道不在 used 里的题（到期错题优先，沿用 quiz.buildQuiz 的规则）
function _take(subject, n, rng, used, unit) {
  const out = [];
  // buildQuiz 的结果是打散过的：把错题本里的题排到前面，保证"错题优先"
  const wrongIds = new Set(store.getQuizWrong().map(w => w.question.id));
  const cards = QZ.buildQuiz(subject, n + used.size + 4, rng, unit).cards;
  cards.sort((a, b) => (wrongIds.has(b.id) ? 1 : 0) - (wrongIds.has(a.id) ? 1 : 0));
  cards.forEach(c => {
    if (out.length < n && !used.has(c.id)) { used.add(c.id); out.push(c); }
  });
  return out;
}

// opts = { grade, date, rng?, quizHistory }；返回 { cards, weak }，cards 与错题复习页同一格式
function build(opts) {
  const rng = opts.rng || Math.random;
  const level = AR.recommendByGrade(opts.grade, opts.date);
  const mathCards = AR.buildSession(level, MATH_N, rng)
    .map(p => ({ source: 'math', key: p.id, level, problem: p, tag: '口算', text: AR.textOf(p) }));

  const weak = weakUnit(opts.quizHistory || []);
  const used = new Set();
  const picked = [];
  if (weak) picked.push(..._take(weak.subject, WEAK_N, rng, used, weak.unit));
  picked.push(..._take(subjectOf(opts.date), QUIZ_N - picked.length, rng, used));
  const quizCards = picked.map(c => ({ ...c, source: 'quiz', key: c.id, tag: SUBJ.nameOf(c.subject) + '小卷' }));
  return { cards: mathCards.concat(quizCards), weak };
}

// results = [{ source:'math', level, ok } | { source:'quiz', subject, unit, ok }]
function record(results, date) {
  const byLevel = {};
  results.filter(r => r.source === 'math').forEach(r => {
    const row = byLevel[r.level] || (byLevel[r.level] = { total: 0, correct: 0 });
    row.total++;
    if (r.ok) row.correct++;
  });
  Object.keys(byLevel).forEach(level => AR.saveSession({ date, level, total: byLevel[level].total, correct: byLevel[level].correct }));

  const bySubject = {};
  results.filter(r => r.source === 'quiz').forEach(r => {
    const s = bySubject[r.subject] || (bySubject[r.subject] = { total: 0, correct: 0, units: {} });
    const u = s.units[r.unit] || (s.units[r.unit] = { unit: r.unit, total: 0, correct: 0 });
    s.total++; u.total++;
    if (r.ok) { s.correct++; u.correct++; }
  });
  Object.keys(bySubject).forEach(subject => {
    const s = bySubject[subject];
    QZ.saveHistory({
      subject, total: s.total, correct: s.correct, label: QZ.verdict(s.total, s.correct).label,
      units: Object.values(s.units).sort((a, b) => a.unit - b.unit),
      daily: true, date,
    });
  });
}

function doneOn(date, quizHistory) { return (quizHistory || []).some(h => h.daily && h.date === date); }

module.exports = { MATH_N, QUIZ_N, WEAK_N, subjectOf, weakUnit, build, record, doneOn };
