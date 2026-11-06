// 记忆卡：语文生字 + 英语单词 + 数学（凑十 / 数的组成）闪卡（自节奏"认识/再练练"练习）
// 卡片内容全部取自试卷知识库答案页实际考到的字/词（content/exams/data/*.json），
// 组词/释义为教材常用义。牌库按单元划分，与每周一卷的单元筛选同构。
const store = require('./store');

// ── 语文生字牌库（组词为教材常用义）──
const CN_U1 = ['天:白天', '地:土地', '你:你好', '我:我们', '他:他们', '口:口水', '耳:耳朵', '目:目光', '手:小手', '足:手足', '上:上面', '下:下面', '日:日子', '月:月亮', '水:喝水', '火:火苗', '山:大山', '田:田地', '禾:禾苗', '站:站立', '坐:坐下', '一:一个', '三:三个', '六:六个', '八:八个', '十:十个'];
const CN_U5 = ['人:大人', '大:大小', '可:可以', '东:东西', '西:西瓜', '是:不是', '四:四个', '秋:秋天', '莲:莲叶', '竹:竹子', '冬:冬天', '条:一条', '片:一片', '群:一群', '只:一只'];
const CN_U6 = ['云:白云', '虫:虫子', '书:书本', '尺:尺子', '中:中间', '森:森林', '林:树林', '明:明天', '从:从前', '尘:灰尘', '立:立正', '旗:国旗'];
const CN_U7 = ['儿:儿子', '里:里面', '左:左边', '右:右边', '见:看见', '贝:宝贝', '在:正在', '才:刚才', '弯:弯弯', '影:影子', '事:事情'];
const CN_U8 = ['比:比一比', '巴:尾巴', '石:石头', '出:出来', '回:回去', '半:一半', '多:多少', '短:长短', '少:多少', '进:进来', '低:低头', '友:朋友', '有:没有'];

// ── 语文拼音牌库（第 2-4 单元，音节 → 汉字；全部取自试卷答案页的「拼音和汉字手拉手」「看图选音节」等题）──
const PY_U2 = ['bā:八', 'tǔ:土', 'mù:木', 'nǐ:你', 'tā:他', 'dì:地'];
const PY_U3 = ['shí:十', 'rì:日', 'qī:七', 'xià:下', 'tǔ:土', 'mù:木'];
const PY_U4 = ['bái yún:白云', 'qì qiú:气球', 'yuè liang:月亮', 'míng liàng:明亮', 'mào zi:帽子', 'tài yáng:太阳', 'cǎi hóng:彩虹', 'mèi mei:妹妹'];

// ── 英语单词牌库（back = 教材中文义）──
const EN_U2 = ['friend:朋友', 'name:姓名', 'welcome:欢迎', 'China:中国'];
const EN_U3 = ['schoolbag:书包', 'pencil:铅笔', 'ruler:尺子', 'book:书', 'eraser:橡皮', 'pencil case:铅笔盒'];
const EN_U4 = ['desk:课桌', 'chair:椅子', 'door:门', 'blackboard:黑板', 'floor:地面', 'classroom:教室'];
const EN_U5 = ['eye:眼睛', 'ear:耳朵', 'nose:鼻子', 'mouth:嘴巴', 'face:脸'];
const EN_U6 = ['mum:妈妈', 'dad:爸爸', 'sister:姐妹', 'brother:兄弟', 'family:家庭'];

// ── 数学牌库（由算式生成，答案不会写错）──
// 凑十搭档：对应第三、四单元"10 的分与合"，也是第六单元凑十法的基础
const MA_TEN = Array.from({ length: 9 }, (_, i) => (i + 1) + ' 和几凑成 10？:' + (10 - (i + 1)));
// 20 以内数的组成：对应第五单元"1 个十和几个一"
const MA_U5 = Array.from({ length: 9 }, (_, i) => '1 个十和 ' + (i + 1) + ' 个一是几？:' + (11 + i)).concat(['2 个十是几？:20']);

function toCards(pairs) {
  return pairs.map(pair => {
    const i = pair.indexOf(':');
    return { front: pair.slice(0, i), back: pair.slice(i + 1) };
  });
}

// 掌握门槛：连续"认识"2 次即视为已掌握（不再优先出现在会话里）
const MASTER_AT = 2;

const DECKS = [
  { id: 'cn-u1', subject: 'chinese', unit: 1, name: '语文 · 第 1 单元生字', cards: toCards(CN_U1) },
  { id: 'cn-u2', subject: 'chinese', unit: 2, kind: 'pinyin', name: '语文 · 第 2 单元拼音', cards: toCards(PY_U2) },
  { id: 'cn-u3', subject: 'chinese', unit: 3, kind: 'pinyin', name: '语文 · 第 3 单元拼音', cards: toCards(PY_U3) },
  { id: 'cn-u4', subject: 'chinese', unit: 4, kind: 'pinyin', name: '语文 · 第 4 单元拼音', cards: toCards(PY_U4) },
  { id: 'cn-u5', subject: 'chinese', unit: 5, name: '语文 · 第 5 单元生字', cards: toCards(CN_U5) },
  { id: 'cn-u6', subject: 'chinese', unit: 6, name: '语文 · 第 6 单元生字', cards: toCards(CN_U6) },
  { id: 'cn-u7', subject: 'chinese', unit: 7, name: '语文 · 第 7 单元生字', cards: toCards(CN_U7) },
  { id: 'cn-u8', subject: 'chinese', unit: 8, name: '语文 · 第 8 单元生字', cards: toCards(CN_U8) },
  { id: 'en-u2', subject: 'english', unit: 2, name: '英语 · U2 新朋友', cards: toCards(EN_U2) },
  { id: 'en-u3', subject: 'english', unit: 3, name: '英语 · U3 我的书包', cards: toCards(EN_U3) },
  { id: 'en-u4', subject: 'english', unit: 4, name: '英语 · U4 我的教室', cards: toCards(EN_U4) },
  { id: 'en-u5', subject: 'english', unit: 5, name: '英语 · U5 可爱的脸', cards: toCards(EN_U5) },
  { id: 'en-u6', subject: 'english', unit: 6, name: '英语 · U6 我的家庭', cards: toCards(EN_U6) },
  { id: 'ma-ten', subject: 'math', unit: 3, name: '数学 · 凑十搭档', cards: toCards(MA_TEN) },
  { id: 'ma-u5', subject: 'math', unit: 5, name: '数学 · 20 以内数的组成', cards: toCards(MA_U5) },
];

function getDeck(id) { return DECKS.find(d => d.id === id) || null; }

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
