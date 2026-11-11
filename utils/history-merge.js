// 练习历史合并（纯逻辑，无依赖；客户端与云函数 sync 共用）
// ⚠️ 云函数副本 cloudfunctions/sync/lib/history-merge.js 由 scripts/sync-cloud-libs.js 复制，勿直接改
//
// 口算会话 / 小卷历史都是只追加列表，每条带 at（完成时间戳）；错题复习日志按日期合并（见 mergeReviewLog）；
// 每周小目标按周合并（见 mergeGoals）；记忆卡进度按卡取最近练过的（见 mergeFlashcards）。
// 合并规则：按 at 取并集（同 at 保留第一方），最新在前，按上限截断。
// 与"整体新者胜"不同，并集不会因两台设备各自新增而丢记录。
const DRILL_CAP = 100; // 口算会话上限（utils/arithmetic.js 引用此值）
const QUIZ_CAP = 400;  // 小卷历史上限（utils/quiz.js 引用此值）。单元星图 / 各单元掌握按它累计：今日一练每天写 1-2 条，50 条约 25 天就把早先的作答挤掉、星星消失；400 条（约 62KB）覆盖一个学期
const REVIEW_CAP = 366; // 错题复习日志上限（每天一条，约一年）
const GOAL_WEEKS_CAP = 60; // 每周小目标保留最近 60 周
const DAILY_LOG_CAP = 400; // 今日一练日志：做过的日期（约一年多）

function mergeHistory(a, b, cap) {
  const seen = {};
  const out = [];
  (a || []).concat(b || []).forEach(x => {
    if (!x || typeof x.at !== 'number' || seen[x.at]) return;
    seen[x.at] = true;
    out.push(x);
  });
  out.sort((x, y) => y.at - x.at);
  return out.slice(0, cap);
}

// 错题复习日志：每天一条 { date, total, correct }，同日在各设备上分别累计，
// 无法相加去重，按日期取次数多的一份；最新在前
function mergeReviewLog(a, b, cap) {
  const byDate = {};
  (a || []).concat(b || []).forEach(x => {
    if (!x || typeof x.date !== 'string') return;
    const cur = byDate[x.date];
    if (!cur || (x.total || 0) > (cur.total || 0)) byDate[x.date] = x;
  });
  return Object.keys(byDate).sort().reverse().slice(0, cap).map(d => byDate[d]);
}

// 每周小目标：{ [周一日期]: { id, type, target, setAt, achievedAt, ... } }，按周合并：
// 已达成的优先（都达成取更早达成的，奖励星只算一次）；都未达成取后设置的
function mergeGoals(a, b) {
  const out = {};
  const pick = (x, y) => {
    if (!x) return y;
    if (!y) return x;
    if (x.achievedAt && y.achievedAt) return x.achievedAt <= y.achievedAt ? x : y;
    if (x.achievedAt || y.achievedAt) return x.achievedAt ? x : y;
    return (y.setAt || 0) > (x.setAt || 0) ? y : x;
  };
  [a || {}, b || {}].forEach(m => Object.keys(m).forEach(k => { if (m[k]) out[k] = pick(out[k], m[k]); }));
  const keep = Object.keys(out).sort().reverse().slice(0, GOAL_WEEKS_CAP);
  const capped = {};
  keep.forEach(k => { capped[k] = out[k]; });
  return capped;
}

// 记忆卡进度：{ [牌组 id]: { [卡片正面]: { knownCount, lastAt } } }，每张卡取最近练过（lastAt 大）的一方；
// 两台设备各自练的卡都保留。坏数据（非对象）丢弃
function mergeFlashcards(a, b) {
  const out = {};
  [a, b].forEach(m => {
    if (!m || typeof m !== 'object') return;
    Object.keys(m).forEach(deck => {
      const cards = m[deck];
      if (!cards || typeof cards !== 'object' || Array.isArray(cards)) return;
      const dst = out[deck] || (out[deck] = {});
      Object.keys(cards).forEach(front => {
        const c = cards[front];
        if (!c || typeof c !== 'object') return;
        if (!dst[front] || (c.lastAt || 0) > (dst[front].lastAt || 0)) dst[front] = { knownCount: Number(c.knownCount) || 0, lastAt: Number(c.lastAt) || 0 };
      });
    });
  });
  return out;
}

// 日期列表（今日一练日志）：并集去重，丢弃非法项，最新在前，按上限截断
function mergeDates(a, b, cap) {
  const set = new Set();
  (a || []).concat(b || []).forEach(d => { if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d); });
  return [...set].sort().reverse().slice(0, cap || DAILY_LOG_CAP);
}

function mergePractice(a, b) {
  const pa = a || {};
  const pb = b || {};
  return {
    drill: mergeHistory(pa.drill, pb.drill, DRILL_CAP),
    quiz: mergeHistory(pa.quiz, pb.quiz, QUIZ_CAP),
    review: mergeReviewLog(pa.review, pb.review, REVIEW_CAP),
    goals: mergeGoals(pa.goals, pb.goals),
    cards: mergeFlashcards(pa.cards, pb.cards),
    daily: mergeDates(pa.daily, pb.daily, DAILY_LOG_CAP),
  };
}

module.exports = { DRILL_CAP, QUIZ_CAP, REVIEW_CAP, GOAL_WEEKS_CAP, DAILY_LOG_CAP, mergeHistory, mergeReviewLog, mergeGoals, mergeFlashcards, mergeDates, mergePractice };
