// 激励体系：称号（星星等级）+ 勋章
const store = require('./store');
const C = require('./checkin');

// 称号门槛（按总星星）
const RANKS = [
  { min: 0, name: '见习小达人', emoji: '🌱' },
  { min: 50, name: '铜星小达人', emoji: '🥉' },
  { min: 150, name: '银星小达人', emoji: '🥈' },
  { min: 350, name: '金星小达人', emoji: '🥇' },
  { min: 700, name: '传奇小达人', emoji: '👑' },
];

function rankInfo(totalStars) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (totalStars >= RANKS[i].min) idx = i;
  const cur = RANKS[idx];
  const next = RANKS[idx + 1] || null;
  const pct = next ? Math.min(100, Math.round(((totalStars - cur.min) / (next.min - cur.min)) * 100)) : 100;
  return { ...cur, totalStars, next, pct };
}

// 勋章定义：check(ctx) 返回是否达成
// 奖励星（bonus）统一从 checkin.BADGE_BONUS 取，避免与 totalStars 的计算表两处失配
const BADGE_DEFS = [
  { id: 'first_checkin', name: '第一次的勇气', emoji: '🎉', desc: '完成第一次打卡', check: c => c.totalRecords >= 1 },
  { id: 'perfect_day', name: '完美一天', emoji: '💯', desc: '某天完成全部必做任务', check: c => c.hasPerfectDay },
  { id: 'streak_7', name: '一周坚持王', emoji: '🔥', desc: '连续打卡 7 天', check: c => c.streak.current >= 7 || c.streak.best >= 7 },
  { id: 'streak_30', name: '月度坚持王', emoji: '🌙', desc: '连续打卡 30 天', check: c => c.streak.current >= 30 || c.streak.best >= 30 },
  { id: 'streak_100', name: '百日挑战王', emoji: '🏆', desc: '连续打卡 100 天', check: c => c.streak.current >= 100 || c.streak.best >= 100 },
  { id: 'full_week', name: '全勤小明星', emoji: '🌟', desc: '一整周每天都达成目标', check: c => c.hasFullWeek },
  { id: 'reader_10h', name: '朗读者', emoji: '🎙️', desc: '累计朗读 10 小时', check: c => c.sum(['chinese_read']) >= 600 },
  { id: 'calc_1000', name: '口算小能手', emoji: '🧮', desc: '累计口算 1000 题', check: c => c.sum(['math_calc']) >= 1000 },
  { id: 'rope_10k', name: '跳绳小飞人', emoji: '🪢', desc: '累计跳绳 10000 个', check: c => c.sum(['pe_rope']) >= 10000 },
  { id: 'bookworm', name: '小书虫', emoji: '📚', desc: '累计课外阅读 30 小时', check: c => c.sum(['chinese_reading_ext']) >= 1800 },
  { id: 'sunshine', name: '阳光少年', emoji: '🌞', desc: '累计户外活动 50 小时', check: c => c.sum(['pe_outdoor']) >= 3000 },
  { id: 'writer', name: '小作家萌芽', emoji: '📔', desc: '累计完成 10 篇日记', check: c => c.sum(['chinese_diary']) >= 10 },
].map(d => ({ ...d, bonus: C.BADGE_BONUS[d.id] || 0 }));

// 每次打卡保存后调用：评估新勋章并落盘，返回本次新获得列表
// today 参数可注入（测试用），生产环境省略
function evaluate(records, profile, today) {
  const grade = (profile && Number(profile.grade)) || 3;
  const ctx = {
    totalRecords: records.length,
    streak: C.streaks(records, today),
    sum: ids => C.aggregateSum(records, ids),
    hasPerfectDay: C.hasPerfectDay(records, grade),
    hasFullWeek: C.hasFullWeek(records, grade, today),
  };
  const earned = store.getBadges();
  const have = new Set(earned.map(b => b.id));
  const fresh = [];
  BADGE_DEFS.forEach(def => {
    if (!have.has(def.id) && def.check(ctx)) {
      const b = { id: def.id, earnedAt: Date.now() };
      fresh.push(b);
      earned.push(b);
    }
  });
  if (fresh.length) store.saveBadges(earned);
  return fresh;
}

function badgeById(id) { return BADGE_DEFS.find(b => b.id === id) || null; }

// 勋章墙视图数据（badgesList 供家长端传入孩子的勋章缓存）
function badgeWall(records, profile, badgesList) {
  const grade = (profile && Number(profile.grade)) || 3;
  const earned = badgesList || store.getBadges();
  const have = {};
  earned.forEach(b => { have[b.id] = b.earnedAt; });
  return BADGE_DEFS.map(def => ({
    id: def.id, name: def.name, emoji: def.emoji, desc: def.desc, bonus: def.bonus,
    earnedAt: have[def.id] || 0,
    earned: !!have[def.id],
  }));
}

module.exports = { RANKS, rankInfo, BADGE_DEFS, evaluate, badgeById, badgeWall };
