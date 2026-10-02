// 奖励小铺：积分 = 累计获得的星数（与称号同源、独立消费），兑换走追加式账本
// 设计要点：花积分不减星星（称号不降级）；账本只追加、撤销即删除记录恢复积分。
const store = require('./store');
const C = require('./checkin');

// 首次使用的默认奖品架（家长可在管理模式修改）
const DEFAULT_REWARDS = [
  { id: 'r-snack', name: '一份小零食', emoji: '🍬', cost: 10 },
  { id: 'r-cartoon', name: '看一集动画', emoji: '📺', cost: 20 },
  { id: 'r-icecream', name: '一个冰淇淋', emoji: '🍦', cost: 30 },
  { id: 'r-toy', name: '神秘小玩具', emoji: '🎁', cost: 80 },
  { id: 'r-park', name: '周末去公园', emoji: '⛲', cost: 120 },
  { id: 'r-book', name: '买一本新书', emoji: '📚', cost: 150 },
];

function getRewards() {
  const list = store.getRewards();
  if (list.length) return list;
  store.saveRewards(DEFAULT_REWARDS.slice()); // 首次自动播种
  return store.getRewards();
}

function addReward({ name, emoji, cost }) {
  const list = store.getRewards();
  const reward = {
    id: 'r_' + Date.now().toString(36),
    name: String(name || '').slice(0, 12),
    emoji: emoji || '🎁',
    cost: Math.max(1, Math.round(Number(cost) || 1)),
  };
  if (!reward.name) return null;
  list.push(reward);
  store.saveRewards(list);
  return reward;
}

function removeReward(id) {
  store.saveRewards(store.getRewards().filter(r => r.id !== id));
}

// 某设备上的累计兑换支出
function spentTotal() {
  return store.getRedemptions().reduce((s, r) => s + (r.cost || 0), 0);
}

// 兑换账本（最新在前）
function getRedemptions() { return store.getRedemptions(); }

// 余额：earned 由页面按数据作用域算好传入（家长端看孩子、孩子端看自己）
function balance(earnedStars) {
  const spent = spentTotal();
  return { earned: earnedStars, spent, balance: earnedStars - spent };
}

// 兑换：余额不足拒绝且不入账
function redeem(reward, earnedStars) {
  const bal = balance(earnedStars);
  if (!reward || bal.balance < reward.cost) {
    return { ok: false, shortage: reward ? reward.cost - bal.balance : 0 };
  }
  const list = store.getRedemptions();
  list.unshift({
    id: 'rd_' + Date.now().toString(36),
    rewardId: reward.id,
    name: reward.name,
    emoji: reward.emoji,
    cost: reward.cost,
    at: Date.now(),
  });
  store.saveRedemptions(list);
  return { ok: true, balance: bal.balance - reward.cost };
}

// 撤销兑换（家长误操作/未兑现时恢复积分）
function removeRedemption(id) {
  store.saveRedemptions(store.getRedemptions().filter(r => r.id !== id));
}

module.exports = { DEFAULT_REWARDS, getRewards, addReward, removeReward, spentTotal, balance, redeem, getRedemptions, removeRedemption };
