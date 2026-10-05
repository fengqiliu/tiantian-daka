// 存储适配层：小程序环境使用 wx storage；Node 测试环境自动退化为内存存储。
// Phase 2：新增同步状态与家长端"孩子数据缓存"；本地优先，云端为备份/跨设备通道。
const KEY_PREFIX = 'ttdr_';
const KEYS = {
  PROFILE: 'profile',
  RECORDS: 'records',
  BADGES: 'badges',
  SETTINGS: 'settings',
  SYNC: 'sync',                      // 同步游标
  READINGS: 'readings',              // 跟读教室录音记录（音频文件仅存本机）
  MATH_WRONG: 'math_wrong',          // 口算错题本（本地）
  QUIZ_WRONG: 'quiz_wrong',          // 每周一卷错题本（本地）
  QUIZ_HISTORY: 'quiz_history',      // 每周一卷历史（本地）
  TASK_OVERRIDES: 'task_overrides',  // 家长任务管理：目标覆盖 + 自定义任务
  REWARDS: 'rewards',                // 奖励小铺：奖品架（家长维护）
  REDEMPTIONS: 'redemptions',        // 奖励小铺：兑换账本（只追加）
  SHOP_STAMP: 'shop_stamp',          // 奖励小铺整体时间戳（同步冲突以新者为准）
  DRILL_HISTORY: 'drill_history',    // 口算挑战会话历史（家长报告用）
  CHILD_PROFILE: 'child_profile',    // 家长端缓存：孩子资料
  CHILD_RECORDS: 'child_records',    // 家长端缓存：孩子打卡记录
  CHILD_BADGES: 'child_badges',      // 家长端缓存：孩子勋章
};

let memory = {};
const hasWx = typeof wx !== 'undefined' && !!wx.getStorageSync;

const defaultBackend = {
  get(k) {
    if (hasWx) { try { return wx.getStorageSync(KEY_PREFIX + k); } catch (e) { return undefined; } }
    return memory[k];
  },
  set(k, v) {
    if (hasWx) { try { wx.setStorageSync(KEY_PREFIX + k, v); return; } catch (e) { /* 落入内存 */ } }
    memory[k] = v;
  },
  remove(k) {
    if (hasWx) { try { wx.removeStorageSync(KEY_PREFIX + k); return; } catch (e) { /* 落入内存 */ } }
    delete memory[k];
  },
};

let backend = defaultBackend;

function init(b) { backend = b; }

function _get(key, def) {
  const v = backend.get(key);
  return (v === undefined || v === null || v === '') ? def : v;
}

// ── 资料 ──
function getProfile() { return _get(KEYS.PROFILE, null); }
// 页面保存入口：自动盖时间戳（同步冲突以 updatedAt 新者为准）
function saveProfile(p) {
  if (!p) return;
  backend.set(KEYS.PROFILE, { ...p, updatedAt: Date.now() });
}
// 同步合并专用：保留远端时间戳，不重新盖章
function saveProfileRaw(p) { if (p) backend.set(KEYS.PROFILE, p); }

// ── 打卡记录 ──
// raw 含墓碑（deleted: true，删除不物理删，供增量同步）；对外一律用 getRecords（已过滤）
function getRecordsRaw() { return _get(KEYS.RECORDS, []); }
function getRecords() { return getRecordsRaw().filter(r => !r.deleted); }
function saveRecords(list) { backend.set(KEYS.RECORDS, list); }

// ── 勋章 ──
function getBadges() { return _get(KEYS.BADGES, []); }
function saveBadges(list) { backend.set(KEYS.BADGES, list); }

function getSettings() { return _get(KEYS.SETTINGS, {}); }
function saveSettings(s) { backend.set(KEYS.SETTINGS, s); }

// ── 跟读教室（本地记录，音频不参与云同步）──
function getReadings() { return _get(KEYS.READINGS, []); }
function saveReadings(list) { backend.set(KEYS.READINGS, list); }

// ── 口算错题本（本地）──
function getMathWrong() { return _get(KEYS.MATH_WRONG, []); }
function saveMathWrong(list) { backend.set(KEYS.MATH_WRONG, list); }

// ── 每周一卷（错题本与历史，本地）──
function getQuizWrong() { return _get(KEYS.QUIZ_WRONG, []); }
function saveQuizWrong(list) { backend.set(KEYS.QUIZ_WRONG, list); }
function getQuizHistory() { return _get(KEYS.QUIZ_HISTORY, []); }
function saveQuizHistory(list) { backend.set(KEYS.QUIZ_HISTORY, list); }

// ── 任务管理（家长：目标覆盖 + 自定义任务，本地）──
function getTaskOverrides() { return _get(KEYS.TASK_OVERRIDES, { targets: {}, customs: [] }); }
// 页面保存入口：自动盖时间戳（同步冲突以 updatedAt 新者为准；
// 严格递增防同毫秒连续保存时云端比较失效）
function saveTaskOverrides(o) {
  if (!o) return;
  const prev = (_get(KEYS.TASK_OVERRIDES, {}) || {}).updatedAt || 0;
  backend.set(KEYS.TASK_OVERRIDES, { ...o, updatedAt: Math.max(Date.now(), prev + 1) });
}
// 同步合并专用：保留远端时间戳，不重新盖章
function saveTaskOverridesRaw(o) { if (o) backend.set(KEYS.TASK_OVERRIDES, o); }

// ── 奖励小铺（奖品架 + 兑换账本，本地）──
// 时间戳严格递增（Date.now() 同毫秒连续写入时至少 +1）：
// 否则同步"新者胜"比较失效，云端不更新
function _bumpStamp(key) {
  const prev = _get(key, 0) || 0;
  const next = Math.max(Date.now(), prev + 1);
  backend.set(key, next);
  return next;
}
function getRewards() { return _get(KEYS.REWARDS, []); }
// 写奖品架/账本统一盖整体时间戳（同步冲突以新者为准）
function saveRewards(list) {
  backend.set(KEYS.REWARDS, list);
  _bumpStamp(KEYS.SHOP_STAMP);
}
function getRedemptions() { return _get(KEYS.REDEMPTIONS, []); }
function saveRedemptions(list) {
  backend.set(KEYS.REDEMPTIONS, list);
  _bumpStamp(KEYS.SHOP_STAMP);
}
function getShopStamp() { return _get(KEYS.SHOP_STAMP, 0); }
// 同步合并专用：保留远端时间戳，不重新盖章
function saveShopRaw(rewards, redemptions, stamp) {
  backend.set(KEYS.REWARDS, rewards || []);
  backend.set(KEYS.REDEMPTIONS, redemptions || []);
  backend.set(KEYS.SHOP_STAMP, stamp || 0);
}

// ── 口算会话历史（本地）──
function getDrillHistory() { return _get(KEYS.DRILL_HISTORY, []); }
function saveDrillHistory(list) { backend.set(KEYS.DRILL_HISTORY, list); }

// ── 同步游标 ──
function getSyncState() {
  return _get(KEYS.SYNC, { lastPullAt: 0, lastPushAt: 0 });
}
function saveSyncState(s) { backend.set(KEYS.SYNC, s); }

// ── 家长端：孩子数据缓存 ──
function getChildProfile() { return _get(KEYS.CHILD_PROFILE, null); }
function getChildRecords() { return _get(KEYS.CHILD_RECORDS, []).filter(r => !r.deleted); }
function getChildBadges() { return _get(KEYS.CHILD_BADGES, []); }
function saveChildData(profile, records, badges) {
  if (profile) backend.set(KEYS.CHILD_PROFILE, profile);
  if (records) backend.set(KEYS.CHILD_RECORDS, records);
  if (badges) backend.set(KEYS.CHILD_BADGES, badges);
}

function clearChildData() {
  backend.remove(KEYS.CHILD_PROFILE);
  backend.remove(KEYS.CHILD_RECORDS);
  backend.remove(KEYS.CHILD_BADGES);
}

function clearAll() { Object.keys(KEYS).forEach(k => backend.remove(KEYS[k])); }

module.exports = {
  KEYS, init,
  getProfile, saveProfile, saveProfileRaw,
  getRecords, getRecordsRaw, saveRecords,
  getBadges, saveBadges,
  getSettings, saveSettings,
  getReadings, saveReadings,
  getMathWrong, saveMathWrong,
  getQuizWrong, saveQuizWrong,
  getQuizHistory, saveQuizHistory,
  getTaskOverrides, saveTaskOverrides, saveTaskOverridesRaw,
  getRewards, saveRewards,
  getRedemptions, saveRedemptions,
  getShopStamp, saveShopRaw,
  getDrillHistory, saveDrillHistory,
  getSyncState, saveSyncState,
  getChildProfile, getChildRecords, getChildBadges, saveChildData, clearChildData,
  clearAll,
};
