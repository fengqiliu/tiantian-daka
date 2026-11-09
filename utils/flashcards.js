// 记忆卡：语文生字 + 英语单词 + 数学（凑十 / 数的组成）闪卡（自节奏"认识/再练练"练习）
// 卡片内容全部取自试卷知识库答案页实际考到的字/词（content/exams/data/*.json），
// 组词/释义为教材常用义。牌库按单元划分，与每周一卷的单元筛选同构。
const store = require('./store');

const { DECKS, getDeck } = require('./flashcard-decks');

// 掌握门槛：连续"认识"2 次即视为已掌握（不再优先出现在会话里）
const MASTER_AT = 2;


// 牌组掌握状态：{front: {knownCount, lastAt}}
function _deckState(deckId) {
  const all = store.getFlashcards();
  return all[deckId] || {};
}

function _saveDeckState(deckId, state) {
  const all = store.getFlashcards();
  all[deckId] = state;
  store.saveFlashcards(all);
}

// 标一张卡：认识 → knownCount+1；再练练 → 清零重来
function markCard(deckId, front, known, now) {
  const state = _deckState(deckId);
  const prev = state[front] || { knownCount: 0, lastAt: 0 };
  state[front] = {
    knownCount: known ? (prev.knownCount || 0) + 1 : 0,
    lastAt: now || Date.now(),
  };
  _saveDeckState(deckId, state);
  return state[front];
}

// 间隔巩固：掌握（连认 2 次）后隔 3 天再出一次，再认识（3 次）隔 7 天再出一次；连认 4 次后不再主动出现。
// 巩固时点"再练练"会清零，回到未掌握
const DAY_MS = 24 * 3600 * 1000;
const REVIEW_DAYS = { 2: 3, 3: 7 };
function isDue(entry, now) {
  if (!entry || (entry.knownCount || 0) < MASTER_AT) return false;
  const days = REVIEW_DAYS[entry.knownCount];
  return !!days && (now || Date.now()) - (entry.lastAt || 0) >= days * DAY_MS;
}

function dueCount(deckId, now) {
  const deck = getDeck(deckId);
  if (!deck) return 0;
  const state = _deckState(deckId);
  return deck.cards.filter(c => isDue(state[c.front], now)).length;
}

// 组一次练习（默认 10 张）：没掌握的优先（knownCount 小者先、久未练者先），
// 其次是到期该巩固的已掌握卡（标 due），其余已掌握的仅在没牌可排时兜底补充；rng / now 可注入以便测试。
function buildSession(deckId, n, rng, now) {
  const deck = getDeck(deckId);
  if (!deck) return { cards: [], total: 0 };
  rng = rng || Math.random;
  now = now || Date.now();
  const state = _deckState(deckId);
  const withState = deck.cards.map(c => {
    const s = state[c.front] || { knownCount: 0, lastAt: 0 };
    return { ...c, knownCount: s.knownCount || 0, lastAt: s.lastAt || 0 };
  });
  const unmastered = withState.filter(c => c.knownCount < MASTER_AT)
    .sort((a, b) => (a.knownCount - b.knownCount) || (a.lastAt - b.lastAt));
  const due = withState.filter(c => isDue(c, now)).sort((a, b) => a.lastAt - b.lastAt).map(c => ({ ...c, due: true }));
  let picked = unmastered.concat(due).slice(0, n);
  if (picked.length < n) { // 不够时，用其余已掌握的补齐（最久没练的先）
    const rest = withState
      .filter(c => !picked.some(p => p.front === c.front))
      .sort((a, b) => a.lastAt - b.lastAt);
    picked = picked.concat(rest.slice(0, n - picked.length));
  }
  picked = picked.slice(0, n);
  // 打散顺序，避免每次都从同一张开始
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return { cards: picked, total: picked.length };
}

// 牌组统计
function deckStats(deckId) {
  const deck = getDeck(deckId);
  if (!deck) return { total: 0, mastered: 0, unseen: 0 };
  const state = _deckState(deckId);
  let mastered = 0, unseen = 0;
  deck.cards.forEach(c => {
    const s = state[c.front];
    if (!s) unseen++;
    else if ((s.knownCount || 0) >= MASTER_AT) mastered++;
  });
  return { total: deck.cards.length, mastered, unseen };
}

// 全部牌组的掌握汇总（纯函数）：state 传入进度对象（孩子端本机 / 家长端孩子缓存），缺省读本机
// 返回 { decks: [{ id, name, subject, total, mastered, left: [没记住的卡面] }], total, mastered, fullDecks }
function summary(state) {
  const all = state === undefined ? store.getFlashcards() : (state || {});
  let total = 0, mastered = 0, fullDecks = 0;
  const decks = DECKS.map(d => {
    const st = all[d.id] || {};
    const left = d.cards.filter(c => !(st[c.front] && (st[c.front].knownCount || 0) >= MASTER_AT)).map(c => c.front);
    const m = d.cards.length - left.length;
    total += d.cards.length;
    mastered += m;
    if (!left.length) fullDecks++;
    return { id: d.id, name: d.name, subject: d.subject, total: d.cards.length, mastered: m, left };
  });
  return { decks, total, mastered, fullDecks };
}

module.exports = { DECKS, getDeck, markCard, buildSession, deckStats, summary, isDue, dueCount, MASTER_AT, REVIEW_DAYS };
