// 每周一卷：组卷、判定、等第制评价、错题本与历史（纯逻辑，rng 可注入）
// 等第制对齐上海评价要求：只给 优秀/良好/合格/继续加油，不打百分制分数、不排名。
const store = require('./store');
const D = require('./date');
const REVIEW = require('./review');
const { bank: BANK, unitLabel } = require('./quiz-bank');

const GRADES = [
  { min: 0.9, label: '优秀', emoji: '🌟' },
  { min: 0.75, label: '良好', emoji: '😊' },
  { min: 0.6, label: '合格', emoji: '🙂' },
  { min: 0, label: '继续加油', emoji: '💪' },
];

// 等第：按正确率给档，同时给出百分数仅供家长参考（孩子端只展示等第）
function verdict(total, correct) {
  const accuracy = total ? correct / total : 0;
  const g = GRADES.find(x => accuracy >= x.min) || GRADES[GRADES.length - 1];
  return { label: g.label, emoji: g.emoji, accuracy: Math.round(accuracy * 100) };
}

function subjects() {
  const seen = {};
  BANK.forEach(q => { seen[q.subject] = (seen[q.subject] || 0) + 1; });
  return Object.keys(seen).map(key => ({ key, count: seen[key] }));
}

function poolFor(subject) {
  return BANK.filter(q => q.subject === subject);
}

// 把库题实例化成会话卡：judge 统一为 √/× 两选项；shuffle:true 的选择项每份卷打乱顺序
function instantiate(q, rng) {
  if (q.type === 'judge') {
    return { ...q, options: ['√', '×'], answerIndex: q.answerText === '√' ? 0 : 1 };
  }
  if (q.type === 'multi') {
    const mopts = q.options.slice();
    if (q.shuffle) {
      for (let i = mopts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [mopts[i], mopts[j]] = [mopts[j], mopts[i]];
      }
    }
    return { ...q, options: mopts, answerSet: q.answers.map(a => mopts.indexOf(a)).sort((x, y) => x - y) };
  }
  if (q.shuffle) {
    const opts = q.options.slice();
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return { ...q, options: opts, answerIndex: opts.indexOf(q.answerText) };
  }
  return { ...q, options: q.options.slice(), answerIndex: q.options.indexOf(q.answerText) };
}

// 多选判分：选中集合与答案集合完全一致（与顺序无关），多选/漏选都算错
function gradeMulti(card, pickedIndexes) {
  const norm = a => a.slice().sort((x, y) => x - y).join(',');
  return norm(pickedIndexes) === norm(card.answerSet);
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 组一份小卷：错题优先混入（≤40%），其余从题库随机抽，整体打散。
// unit 可选：只从指定单元出题（错题本同样按单元过滤）。
function buildQuiz(subject, n, rng, unit) {
  rng = rng || Math.random;
  const u = unit ? Number(unit) : null;
  // 到期的错题优先混入
  const wrong = store.getQuizWrong().filter(w => w.subject === subject && (!u || w.question.unit === u))
    .sort((a, b) => ((a.due || '') < (b.due || '') ? -1 : (a.due || '') > (b.due || '') ? 1 : 0));
  const take = Math.min(Math.ceil(n * 0.4), wrong.length);
  const wrongItems = wrong.slice(0, take).map(w => w.question);
  const used = new Set(wrongItems.map(q => q.id));
  const fresh = shuffle(
    poolFor(subject).filter(q => (!u || q.unit === u) && !used.has(q.id)),
    rng
  ).slice(0, Math.max(0, n - wrongItems.length));
  const cards = shuffle(wrongItems.concat(fresh), rng).map(q => instantiate(q, rng));
  return { cards, total: cards.length };
}

// 期末冲刺：从全册每个单元（含期末卷）抽题。每个单元先保底 1 题，其余名额按权重
// （1 + 该单元错题本题数）用最高平均数法分配，单元题量不够时名额让给别的单元；
// 每个单元内错题优先，其余随机。
function buildSprint(subject, n, rng) {
  rng = rng || Math.random;
  const pool = poolFor(subject);
  const units = [...new Set(pool.map(q => q.unit))].sort((a, b) => a - b);
  const wrong = store.getQuizWrong().filter(w => w.subject === subject)
    .sort((a, b) => ((a.due || '') < (b.due || '') ? -1 : (a.due || '') > (b.due || '') ? 1 : 0));
  const rows = units.map(u => ({
    unit: u,
    items: pool.filter(q => q.unit === u),
    wrong: wrong.filter(w => w.question.unit === u).map(w => w.question),
    quota: 0,
  }));
  rows.forEach(row => { row.weight = 1 + row.wrong.length; });
  let left = Math.min(n, pool.length);
  rows.forEach(row => { if (left > 0) { row.quota = 1; left--; } });
  while (left > 0) {
    const open = rows.filter(row => row.quota < row.items.length);
    if (!open.length) break;
    open.sort((a, b) => b.weight / (b.quota + 1) - a.weight / (a.quota + 1));
    open[0].quota++;
    left--;
  }
  const picked = [];
  rows.forEach(row => {
    const first = row.wrong.slice(0, row.quota);
    const used = new Set(first.map(q => q.id));
    const rest = shuffle(row.items.filter(q => !used.has(q.id)), rng).slice(0, row.quota - first.length);
    picked.push(...first, ...rest);
  });
  const cards = shuffle(picked, rng).map(q => instantiate(q, rng));
  return { cards, total: cards.length };
}

// 冲刺卷分单元结果：results 为 [{ unit, ok }]，按单元汇总，正确率 ≥80% 记为掌握
const MASTERED_MIN = 0.8;
function unitBreakdown(results) {
  const by = {};
  results.forEach(r => {
    const row = by[r.unit] || (by[r.unit] = { unit: r.unit, label: unitLabel(r.unit), total: 0, correct: 0 });
    row.total++;
    if (r.ok) row.correct++;
  });
  return Object.values(by).sort((a, b) => a.unit - b.unit)
    .map(row => ({ ...row, mastered: row.correct / row.total >= MASTERED_MIN }));
}

// 错题本：答错入本累计，到期答对按间隔升级，连对 3 次销账（排期见 utils/review.js）
// 始终存原始库题，不含会话期打乱的选项顺序；today 可注入（测试用）
function markResult(question, correct, today) {
  const orig = BANK.find(b => b.id === question.id) || question;
  const { list, result } = REVIEW.apply(store.getQuizWrong(), orig.id, correct, today || D.todayStr(),
    () => ({ subject: orig.subject, question: orig }));
  if (result !== 'none' && result !== 'early') store.saveQuizWrong(list);
  return result;
}

// 历史记录（最新在前，最多 50 条）
function saveHistory(entry) {
  const list = store.getQuizHistory();
  list.unshift({ ...entry, at: Date.now() });
  store.saveQuizHistory(list.slice(0, require('./history-merge').QUIZ_CAP));
}

function getHistory() { return store.getQuizHistory(); }

module.exports = { GRADES, verdict, subjects, poolFor, buildQuiz, buildSprint, unitBreakdown, instantiate, gradeMulti, markResult, saveHistory, getHistory };
