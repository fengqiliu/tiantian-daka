// 口算挑战：分级出题、判定与错题本（纯逻辑，随机源 rng 可注入以便测试）
// 分级对齐沪教版（2024修订）一年级上册进度，并向上覆盖中高年级常用口算：
// 5以内加减（U3 分与合）→ 10以内加减（U4）→ 10以内填空（U4 填一填）
// → 20以内进位加 / 不退位减（U6，一上不学退位减）→ 20以内加减（一下）→ 表内乘除法（二上）→ 100以内加减（二下/三上）
const store = require('./store');
const D = require('./date');
const REVIEW = require('./review');

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// 题目模型：{ id, kind:'result'|'missing', a, op:'+'|'-'|'×'|'÷', b, c, answer }
// result: a op b = ?    missing: a op □ = c 或 □ op b = c
const LEVELS = {
  add5:      { name: '5以内加法',   gen: rng => genBinary(rng, 5, '+') },
  sub5:      { name: '5以内减法',   gen: rng => genBinary(rng, 5, '-') },
  addsub10:  { name: '10以内加减',  gen: rng => genBinary(rng, 10, rng() < 0.5 ? '+' : '-') },
  missing10: { name: '10以内填空',  gen: rng => genMissing(rng, 10) },
  add20carry: { name: '20以内进位加（凑十）', gen: genCarryAdd },
  sub20nb:   { name: '20以内不退位减', gen: genNoBorrowSub },
  addsub20:  { name: '20以内加减',  gen: rng => genBinary(rng, 20, rng() < 0.5 ? '+' : '-') },
  mul99:     { name: '表内乘除法',  gen: genMul99 },
  addsub100: { name: '100以内加减', gen: rng => genBinary(rng, 100, rng() < 0.5 ? '+' : '-') },
};
const LEVEL_ORDER = ['add5', 'sub5', 'addsub10', 'missing10', 'add20carry', 'sub20nb', 'addsub20', 'mul99', 'addsub100'];

function genBinary(rng, max, op) {
  if (op === '+') {
    const a = randInt(rng, 0, max);
    const b = randInt(rng, 0, max - a);
    if (a + b === 0) return genBinary(rng, max, op); // 避开 0+0
    return { kind: 'result', a, op, b, c: null, answer: a + b, id: `${a}+${b}=` };
  }
  const a = randInt(rng, 1, max);
  const b = randInt(rng, 0, a);
  return { kind: 'result', a, op, b, c: null, answer: a - b, id: `${a}-${b}=` };
}

function genMissing(rng, max) {
  const variant = randInt(rng, 0, 3);
  if (variant === 0) { // a + □ = c
    const c = randInt(rng, 1, max);
    const ans = randInt(rng, 0, c);
    const a = c - ans;
    return { kind: 'missing', a, op: '+', b: null, c, answer: ans, id: `${a}+□=${c}` };
  }
  if (variant === 1) { // □ + b = c
    const c = randInt(rng, 1, max);
    const ans = randInt(rng, 0, c);
    const b = c - ans;
    return { kind: 'missing', a: null, op: '+', b, c, answer: ans, id: `□+${b}=${c}` };
  }
  if (variant === 2) { // a - □ = c
    const a = randInt(rng, 1, max);
    const ans = randInt(rng, 0, a);
    const c = a - ans;
    return { kind: 'missing', a, op: '-', b: null, c, answer: ans, id: `${a}-□=${c}` };
  }
  // □ - b = c（答案 = c + b，必在 1..max）
  const b = randInt(rng, 1, max);
  const c = randInt(rng, 0, max - b);
  const ans = c + b;
  return { kind: 'missing', a: null, op: '-', b, c, answer: ans, id: `□-${b}=${c}` };
}

// 进位加：两个一位数，和在 11-18（如 9+6、8+5），对应第六单元"凑十法"
function genCarryAdd(rng) {
  const a = randInt(rng, 2, 9);
  const b = randInt(rng, 11 - a, 9);
  return { kind: 'result', a, op: '+', b, c: null, answer: a + b, id: `${a}+${b}=` };
}

// 不退位减：十几减几（减数不大于个位，如 18-6），或十几/20 减 10
function genNoBorrowSub(rng) {
  const a = randInt(rng, 11, 20);
  const ones = a % 10;
  const k = randInt(rng, 0, ones); // 0..ones-1 → 减一位数；ones → 减 10
  const b = k < ones ? k + 1 : 10;
  return { kind: 'result', a, op: '-', b, c: null, answer: a - b, id: `${a}-${b}=` };
}

function genMul99(rng) {
  if (rng() < 0.5) {
    const a = randInt(rng, 1, 9);
    const b = randInt(rng, 1, 9);
    return { kind: 'result', a, op: '×', b, c: null, answer: a * b, id: `${a}×${b}=` };
  }
  const a = randInt(rng, 1, 9);   // 除数
  const q = randInt(rng, 1, 9);   // 商
  return { kind: 'result', a: a * q, op: '÷', b: a, c: null, answer: q, id: `${a * q}÷${a}=` };
}

// 生成 n 题：会话内按 id 去重（excludeKeys 供错题混入时排重）
function generate(level, n, rng, excludeKeys) {
  const def = LEVELS[level];
  if (!def) return [];
  rng = rng || Math.random;
  const used = new Set(excludeKeys || []);
  const out = [];
  let guard = n * 40 + 40;
  while (out.length < n && guard-- > 0) {
    const p = def.gen(rng);
    if (used.has(p.id)) continue;
    used.add(p.id);
    out.push(p);
  }
  return out;
}

// 判定
function check(problem, input) {
  return Number(input) === problem.answer;
}

// 题面文本
function textOf(p) {
  if (p.kind === 'missing') {
    return p.a === null ? `□ ${p.op} ${p.b} = ${p.c}` : `${p.a} ${p.op} □ = ${p.c}`;
  }
  return `${p.a} ${p.op} ${p.b} = ?`;
}

// 错题本：答错入本（累计次数），到期答对按间隔升级，连对 3 次销账（排期见 utils/review.js）
// today 可注入（测试用）；返回 recorded | promoted | mastered | early | none
function markResult(problem, correct, level, today) {
  const { list, result } = REVIEW.apply(store.getMathWrong(), problem.id, correct, today || D.todayStr(),
    () => ({ level, problem }));
  if (result !== 'none' && result !== 'early') store.saveMathWrong(list);
  return result;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 组一组练习：错题优先混入（最多 40%），其余新题，整体打散
function buildSession(level, n, rng) {
  rng = rng || Math.random;
  // 到期的错题优先混入
  const wrong = store.getMathWrong().filter(w => w.level === level)
    .sort((a, b) => ((a.due || '') < (b.due || '') ? -1 : (a.due || '') > (b.due || '') ? 1 : 0));
  const take = Math.min(Math.ceil(n * 0.4), wrong.length);
  const wrongItems = wrong.slice(0, take).map(w => w.problem);
  const used = new Set(wrongItems.map(p => p.id));
  const fresh = generate(level, n - wrongItems.length, rng, used);
  return shuffle(wrongItems.concat(fresh), rng);
}

// 按年级推荐级别；一年级按月份跟上教学进度（date 为 YYYY-MM-DD，缺省今天）：
// 上册 9-11 月 10以内加减 → 12-1 月学到第六单元进位加 → 下册（2-8 月）学过退位减后用 20以内加减
function recommendByGrade(grade, date) {
  const g = Number(grade) || 1;
  if (g <= 1) {
    const month = Number((date || D.todayStr()).slice(5, 7));
    if (month >= 9 && month <= 11) return 'addsub10';
    if (month === 12 || month === 1) return 'add20carry';
    return 'addsub20';
  }
  if (g === 2) return 'addsub20';
  return 'addsub100';
}

// ── 练习会话历史（供家长报告看正确率趋势）──
const SESSION_CAP = require('./history-merge').DRILL_CAP; // 100，与云端合并上限同源

function saveSession(session) {
  const list = store.getDrillHistory();
  list.unshift({ ...session, at: Date.now() });
  store.saveDrillHistory(list.slice(0, SESSION_CAP));
}

function getSessions() { return store.getDrillHistory(); }


module.exports = {
  LEVELS, LEVEL_ORDER,
  randInt, generate, check, textOf,
  markResult, buildSession, recommendByGrade,
  saveSession, getSessions,
};
