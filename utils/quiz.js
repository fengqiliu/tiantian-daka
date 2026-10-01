// 每周一卷：组卷、判定、等第制评价、错题本与历史（纯逻辑，rng 可注入）
// 等第制对齐上海评价要求：只给 优秀/良好/合格/继续加油，不打百分制分数、不排名。
const store = require('./store');
const BANK = require('./quiz-bank').bank;

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

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 组一份小卷：错题优先混入（≤40%），其余从题库随机抽，整体打散
function buildQuiz(subject, n, rng) {
  rng = rng || Math.random;
  const wrong = store.getQuizWrong().filter(w => w.subject === subject);
  const take = Math.min(Math.ceil(n * 0.4), wrong.length);
  const wrongItems = wrong.slice(0, take).map(w => w.question);
  const used = new Set(wrongItems.map(q => q.id));
  const fresh = shuffle(poolFor(subject).filter(q => !used.has(q.id)), rng)
    .slice(0, Math.max(0, n - wrongItems.length));
  const cards = shuffle(wrongItems.concat(fresh), rng).map(q => instantiate(q, rng));
  return { cards, total: cards.length };
}

// 错题本：答错入本累计，答对销账（始终存原始库题，不含会话期打乱的选项顺序）
function markResult(question, correct) {
  const orig = BANK.find(b => b.id === question.id) || question;
  const list = store.getQuizWrong();
  const i = list.findIndex(w => w.key === orig.id);
  if (correct) {
    if (i >= 0) { list.splice(i, 1); store.saveQuizWrong(list); }
    return 'mastered';
  }
  if (i >= 0) {
    list[i].wrongCount += 1;
    list[i].lastWrongAt = Date.now();
  } else {
    list.push({ key: orig.id, subject: orig.subject, question: orig, wrongCount: 1, lastWrongAt: Date.now() });
  }
  store.saveQuizWrong(list);
  return 'recorded';
}

// 历史记录（最新在前，最多 50 条）
function saveHistory(entry) {
  const list = store.getQuizHistory();
  list.unshift({ ...entry, at: Date.now() });
  store.saveQuizHistory(list.slice(0, 50));
}

function getHistory() { return store.getQuizHistory(); }

module.exports = { GRADES, verdict, subjects, poolFor, buildQuiz, instantiate, markResult, saveHistory, getHistory };
