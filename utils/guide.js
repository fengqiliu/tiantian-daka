// 首次使用引导：首页弹出的 3 步卡片（孩子 / 家长各一套）。纯逻辑，页面只负责展示与记住「看过了」。
// 只给新用户弹（建档 7 天内且没看过）；老用户升级后不被打扰，可在「我的」里手动重看（replay 会带上 guideForce）。
const NEW_USER_DAYS = 7;

const CHILD = [
  { emoji: '✅', title: '每天打卡', text: '今日清单从上往下做：必做 4 项做完就算达成，自选的随心做。点任务写下完成情况，星星会越攒越多。' },
  { emoji: '✏️', title: '练一练', text: '口算、跟读、每周一卷、古诗都在任务里。答错的题会进错题本，隔几天再来一次，连对 3 次就毕业。' },
  { emoji: '🗺️', title: '点亮单元星图', text: '在「成长」页看每个单元亮了几颗星，点一个单元就能直接练。全部点亮能拿勋章！' },
];
const PARENT = [
  { emoji: '🔗', title: '绑定孩子', text: '请孩子在「我的 → 家人绑定」查看 6 位邀请码，在这里输入就能看到孩子的进度（需要开通云开发）。' },
  { emoji: '📊', title: '看报告', text: '「家长报告」里有周报、任务完成率和各单元掌握情况，哪个单元还要再练一目了然。' },
  { emoji: '💌', title: '发鼓励', text: '给孩子发一句鼓励，孩子首页会弹出来并用表情回复。孩子获得勋章时你也会收到通知。' },
];

function stepsFor(role) { return role === 'parent' ? PARENT : CHILD; }

// step 从 0 开始；返回 null 表示不显示。force（或 profile.guideForce）：手动重看，不受新用户期限限制
function view(profile, step, now, force) {
  if (!profile || !profile.onboarded || profile.guideSeen) return null;
  const t = now === undefined ? Date.now() : now;
  if (!(force || profile.guideForce) && !(profile.createdAt >= t - NEW_USER_DAYS * 24 * 3600 * 1000)) return null;
  const steps = stepsFor(profile.role);
  const i = Number(step) || 0;
  if (i < 0 || i >= steps.length) return null;
  const last = i === steps.length - 1;
  return { ...steps[i], step: i + 1, total: steps.length, last, next: last ? '开始使用' : '下一步' };
}

// 记住看过了（返回新对象，不改原 profile）
function markSeen(profile) { return { ...profile, guideSeen: true, guideForce: false }; }
// 手动重看：清除已看标记并标记 guideForce（建档时间不变，老用户也能看到）
function replay(profile) { return { ...profile, guideSeen: false, guideForce: true }; }

module.exports = { NEW_USER_DAYS, view, markSeen, replay };
