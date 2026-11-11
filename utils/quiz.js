// 每周一卷：组卷、判定、等第制评价、错题本与历史（纯逻辑，rng 可注入）
// 等第制对齐上海评价要求：只给 优秀/良好/合格/继续加油，不打百分制分数、不排名。
const store = require('./store');
const D = require('./date');
const REVIEW = require('./review');
const { bank: BANK } = require('./quiz-bank');
const SUBJ = require('./subjects');

const { unitLabel } = SUBJ;

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

// 错题专练：只出某科某单元的错题（按到期先后，最多 n 题）
function buildWrongQuiz(subject, unit, rng, n) {
  rng = rng || Math.random;
  const u = Number(unit);
  const items = store.getQuizWrong()
    .filter(w => w.subject === subject && w.question.unit === u)
    .sort((a, b) => ((a.due || '') < (b.due || '') ? -1 : (a.due || '') > (b.due || '') ? 1 : 0))
    .slice(0, n || 10)
    .map(w => w.question);
  const cards = shuffle(items, rng).map(q => instantiate(q, rng));
  return { cards, total: cards.length };
}

// ── 错题解析：答错时说一句"为什么"（题目自带 explain 优先，其余按题型规则生成，不适用返回 ''）──
const TONE_MARKS = { a: 'āáǎà', o: 'ōóǒò', e: 'ēéěè', i: 'īíǐì', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
const TONE_NAME = ['轻声', '第一声', '第二声', '第三声', '第四声'];
function _plain(s) {
  return s.replace(/[āáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜ]/g, ch => Object.keys(TONE_MARKS).find(k => TONE_MARKS[k].indexOf(ch) > -1));
}
function _toneOf(s) {
  for (const k of Object.keys(TONE_MARKS)) {
    for (let i = 0; i < 4; i++) if (s.indexOf(TONE_MARKS[k][i]) > -1) return i + 1;
  }
  return 0;
}
const INITIAL = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/;

// 读音二选一：找出正确读音和另一项第一个不同的音节，判断差在平翘舌、前后鼻还是声调
function _explainPinyin(word, ans, other) {
  const sa = ans.split(' '), so = other.split(' ');
  const i = sa.findIndex((x, k) => x !== so[k]);
  if (i < 0) return '';
  const a = sa[i], o = so[i] || '', pa = _plain(a), po = _plain(o);
  const head = '“' + word + '”读 ' + ans;
  if (pa === po) return head + '，注意是' + TONE_NAME[_toneOf(a)];
  const init = (INITIAL.exec(pa) || [''])[0];
  if (/^(zh|ch|sh)/.test(pa) && po === pa.replace(/^(z|c|s)h/, '$1')) return head + '，' + init + ' 是翘舌音';
  if (/^(z|c|s)/.test(pa) && pa === po.replace(/^(z|c|s)h/, '$1')) return head + '，' + init + ' 是平舌音';
  const rhyme = pa.slice(init.length);
  if (/ng$/.test(pa) && po === pa.slice(0, -1)) return head + '，' + rhyme + ' 是后鼻韵母';
  if (/n$/.test(pa) && po === pa + 'g') return head + '，' + rhyme + ' 是前鼻韵母';
  return head;
}

// 比大小：有算式的一边先算出得数，再比较
function _explainCompare(prompt, answer) {
  const m = /^(.+) ○ (.+)$/.exec(prompt);
  if (!m) return '';
  const val = s => s.split(' ').reduce((acc, tok, k, arr) => (k === 0 ? Number(tok) : /^[+-]$/.test(tok) ? acc : arr[k - 1] === '+' ? acc + Number(tok) : acc - Number(tok)), 0);
  const parts = [];
  [m[1], m[2]].forEach(side => { if (/[+-]/.test(side)) parts.push(side + ' = ' + val(side)); });
  parts.push(val(m[1]) + ' ' + answer + ' ' + val(m[2]));
  return parts.join('，') + '，所以填 ' + answer;
}

function explainOf(q) {
  if (!q) return '';
  if (q.explain) return q.explain;
  const p = q.prompt || '';
  if (/○/.test(p) && (q.options || []).indexOf('<') > -1) return _explainCompare(p, q.answerText);
  if (/声调标对了/.test(p)) return '标调口诀：有 a 不放过，没 a 找 o e，i u 并列标在后';
  const m = /^“(.+?)”的“(.+?)”读：$/.exec(p) || /^“(.+?)”的正确拼音是：$/.exec(p);
  if (m && q.type === 'choice') {
    const other = q.options.find(o => o !== q.answerText);
    return _explainPinyin(m[2] || m[1], q.answerText, other || '');
  }
  return '';
}

// ── 单元汇总与星图 ──
// 小卷历史（0.27.0 起每条带 units）按「科目#单元」累计答题数与答对数
function unitTally(history) {
  const by = {};
  (history || []).forEach(h => (h.units || []).forEach(u => {
    const key = h.subject + '#' + u.unit;
    const row = by[key] || (by[key] = { subject: h.subject, unit: u.unit, total: 0, correct: 0, wrongOpen: 0 });
    row.total += u.total || 0;
    row.correct += u.correct || 0;
  }));
  return by;
}

// 单元星级：答满 3 题 1 星；≥5 题且 ≥80% 2 星；≥10 题且 ≥90% 3 星
function starsOf(total, correct) {
  const rate = total ? correct / total : 0;
  if (total >= 10 && rate >= 0.9) return 3;
  if (total >= 5 && rate >= 0.8) return 2;
  return total >= 3 ? 1 : 0;
}

// 星图：题库里每科的全部单元（没练过的 0 星）
function starMap(history) {
  const tally = unitTally(history);
  return SUBJ.SUBJECTS.map(s => {
    const units = [...new Set(poolFor(s.key).map(q => q.unit))].sort((a, b) => a - b).map(unit => {
      const t = tally[s.key + '#' + unit] || { total: 0, correct: 0 };
      return { unit, label: unitLabel(unit), total: t.total, correct: t.correct, stars: starsOf(t.total, t.correct) };
    });
    return { subject: s.key, name: s.name, units, lit: units.filter(u => u.stars > 0).length };
  });
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

// 历史记录（最新在前，上限见 history-merge.QUIZ_CAP）
function saveHistory(entry) {
  const list = store.getQuizHistory();
  list.unshift({ ...entry, at: Date.now() });
  store.saveQuizHistory(list.slice(0, require('./history-merge').QUIZ_CAP));
}

function getHistory() { return store.getQuizHistory(); }

module.exports = { GRADES, verdict, subjects, poolFor, buildQuiz, buildSprint, buildWrongQuiz, unitBreakdown, explainOf, unitTally, starsOf, starMap, instantiate, gradeMulti, markResult, saveHistory, getHistory };
