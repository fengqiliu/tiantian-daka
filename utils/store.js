// 存储适配层：小程序环境使用 wx storage；Node 测试环境自动退化为内存存储。
// Phase 2：新增同步状态与家长端"孩子数据缓存"；本地优先，云端为备份/跨设备通道。
const KEY_PREFIX = 'ttdr_';
const KEYS = {
  PROFILE: 'profile',
  RECORDS: 'records',                // 旧版单一记录键（只用于迁移；现按年分片 records_YYYY）
  RECORDS_YEARS: 'records_years',    // 打卡记录分片的年份索引
  BADGES: 'badges',
  SETTINGS: 'settings',
  SYNC: 'sync',                      // 同步游标
  READINGS: 'readings',              // 跟读教室录音记录（音频文件仅存本机）
  MATH_WRONG: 'math_wrong',          // 口算错题本（本地）
  QUIZ_WRONG: 'quiz_wrong',          // 每周一卷错题本（本地）
  QUIZ_HISTORY: 'quiz_history',      // 每周一卷历史（本地）
  WRONG_STAMP: 'wrong_stamp',        // 两本错题本的整体时间戳（同步冲突以新者为准）
  TASK_OVERRIDES: 'task_overrides',  // 家长任务管理：目标覆盖 + 自定义任务
  REWARDS: 'rewards',                // 奖励小铺：奖品架（家长维护）
  REDEMPTIONS: 'redemptions',        // 奖励小铺：兑换账本（只追加）
  SHOP_STAMP: 'shop_stamp',          // 奖励小铺整体时间戳（同步冲突以新者为准）
  DRILL_HISTORY: 'drill_history',    // 口算挑战会话历史（家长报告用）
  REVIEW_LOG: 'review_log',          // 错题复习日志：每天一条 { date, total, correct }
  CHEERS: 'cheers',                  // 孩子端：收到的家长留言缓存（云端为准，离线可看）
  GOALS: 'goals',                    // 每周小目标：{ [周一日期]: goal }
  TIMER: 'timer',                    // 计时打卡：进行中的计时（同时只有一个；仅本机）
  CHILD_PROFILE: 'child_profile',    // 家长端缓存：孩子资料
  CHILD_RECORDS: 'child_records',    // 家长端缓存：孩子打卡记录
  CHILD_BADGES: 'child_badges',      // 家长端缓存：孩子勋章
  CHILD_DRILL: 'child_drill',        // 家长端缓存：孩子口算会话
  CHILD_QUIZ: 'child_quiz',          // 家长端缓存：孩子小卷历史
  CHILD_REVIEW: 'child_review',      // 家长端缓存：孩子错题复习日志
  CHILD_MATH_WRONG: 'child_math_wrong', // 家长端缓存：孩子口算错题本
  CHILD_QUIZ_WRONG: 'child_quiz_wrong', // 家长端缓存：孩子小卷错题本
  CHILD_GOALS: 'child_goals',        // 家长端缓存：孩子每周小目标
};

let memory = {};
const hasWx = typeof wx !== 'undefined' && !!wx.getStorageSync;

// 写入失败（如超出微信单键 1MB / 总量 10MB）由 _set 统一处理，这里不吞异常
const defaultBackend = {
  get(k) {
    if (hasWx) { try { return wx.getStorageSync(KEY_PREFIX + k); } catch (e) { return undefined; } }
    return memory[k];
  },
  set(k, v) {
    if (hasWx) { wx.setStorageSync(KEY_PREFIX + k, v); return; }
    memory[k] = v;
  },
  remove(k) {
    if (hasWx) { try { wx.removeStorageSync(KEY_PREFIX + k); } catch (e) { /* 忽略 */ } return; }
    delete memory[k];
  },
};

let backend = defaultBackend;
let fallback = {};        // 写入失败的键：本次会话内从这里读，不丢当前数据
let storageError = null;  // 最近一次写入失败 { key, message, at }，页面据此提示导出备份
let recCache = null;      // 打卡记录分片的内存缓存（见下方"打卡记录"）

// 测试注入后端；不传则恢复默认（wx storage / 内存）。同时清空缓存与错误状态
function init(b) {
  backend = b || defaultBackend;
  fallback = {};
  storageError = null;
  recCache = null;
}

function _rawGet(key) {
  if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
  return backend.get(key);
}

function _get(key, def) {
  const v = _rawGet(key);
  return (v === undefined || v === null || v === '') ? def : v;
}

function _set(key, value) {
  try {
    backend.set(key, value);
    delete fallback[key];
  } catch (e) {
    fallback[key] = value;
    storageError = { key, message: (e && (e.errMsg || e.message)) || String(e), at: Date.now() };
  }
}

function _remove(key) {
  delete fallback[key];
  backend.remove(key);
}

function getStorageError() { return storageError; }

// ── 资料 ──
function getProfile() { return _get(KEYS.PROFILE, null); }
// 页面保存入口：自动盖时间戳（同步冲突以 updatedAt 新者为准）
function saveProfile(p) {
  if (!p) return;
  _set(KEYS.PROFILE, { ...p, updatedAt: Date.now() });
}
// 同步合并专用：保留远端时间戳，不重新盖章
function saveProfileRaw(p) { if (p) _set(KEYS.PROFILE, p); }

// ── 打卡记录 ──
// raw 含墓碑（deleted: true，删除不物理删，供增量同步）；对外一律用 getRecords（已过滤）
//
// 按年分片存储：records_2026、records_2027 … + 年索引 records_years。
// 一年约 400KB，单一大键约 2-3 年就会超过微信单键 1MB 上限（写入失败）；分片后每片只装一年。
// - 旧版单一 records 键在首次读取时自动迁移并删除
// - 内存缓存已解析的分片（只有本进程写存储，缓存不会过期）；读取返回新数组，调用方改副本不污染缓存
// - 保存时按引用比较每年的元素，只重写有变化的年份（调用方修改记录都是替换为新对象，不原地改）
const RECORD_SHARD = 'records_';

function _yearOf(r) { return Number(String((r && r.date) || '').slice(0, 4)) || 0; }

function _writeRecords(cache, list) {
  const byYear = {};
  list.forEach(r => { const y = _yearOf(r); (byYear[y] = byYear[y] || []).push(r); });
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  years.forEach(y => {
    const prev = cache.shards[y];
    const next = byYear[y];
    const same = prev && prev.length === next.length && prev.every((x, i) => x === next[i]);
    if (!same) _set(RECORD_SHARD + y, next);
    cache.shards[y] = next;
  });
  cache.years.filter(y => !byYear[y]).forEach(y => { _remove(RECORD_SHARD + y); delete cache.shards[y]; });
  if (years.join(',') !== cache.years.join(',')) _set(KEYS.RECORDS_YEARS, years);
  cache.years = years;
}

function _loadRecords() {
  if (recCache) return recCache;
  const cache = { years: [], shards: {} };
  recCache = cache;
  const legacy = _rawGet(KEYS.RECORDS);
  if (Array.isArray(legacy)) {
    _writeRecords(cache, legacy);
    _remove(KEYS.RECORDS);
    return cache;
  }
  const years = _get(KEYS.RECORDS_YEARS, []);
  cache.years = (Array.isArray(years) ? years : []).map(Number).sort((a, b) => a - b);
  cache.years.forEach(y => {
    const s = _rawGet(RECORD_SHARD + y);
    cache.shards[y] = Array.isArray(s) ? s : [];
  });
  return cache;
}

function getRecordsRaw() {
  const c = _loadRecords();
  return [].concat(...c.years.map(y => c.shards[y]));
}
function getRecords() { return getRecordsRaw().filter(r => !r.deleted); }
function saveRecords(list) { _writeRecords(_loadRecords(), list || []); }

// ── 勋章 ──
function getBadges() { return _get(KEYS.BADGES, []); }
function saveBadges(list) { _set(KEYS.BADGES, list); }

function getSettings() { return _get(KEYS.SETTINGS, {}); }
function saveSettings(s) { _set(KEYS.SETTINGS, s); }

// ── 跟读教室（本地记录，音频不参与云同步）──
function getReadings() { return _get(KEYS.READINGS, []); }
function saveReadings(list) { _set(KEYS.READINGS, list); }

// ── 错题本（口算 + 小卷）──
// 条目会升盒、销账（原地修改），不能并集合并：两本共用一个整体时间戳，同步时新者胜
function getMathWrong() { return _get(KEYS.MATH_WRONG, []); }
function saveMathWrong(list) {
  _set(KEYS.MATH_WRONG, list);
  _bumpStamp(KEYS.WRONG_STAMP);
}
function getQuizWrong() { return _get(KEYS.QUIZ_WRONG, []); }
function saveQuizWrong(list) {
  _set(KEYS.QUIZ_WRONG, list);
  _bumpStamp(KEYS.WRONG_STAMP);
}
function getWrongStamp() { return _get(KEYS.WRONG_STAMP, 0); }
// 同步合并专用：保留远端时间戳，不重新盖章
function saveWrongRaw(math, quiz, stamp) {
  _set(KEYS.MATH_WRONG, math || []);
  _set(KEYS.QUIZ_WRONG, quiz || []);
  _set(KEYS.WRONG_STAMP, stamp || 0);
}

// ── 每周一卷历史（本地）──
function getQuizHistory() { return _get(KEYS.QUIZ_HISTORY, []); }
function saveQuizHistory(list) { _set(KEYS.QUIZ_HISTORY, list); }

// ── 任务管理（家长：目标覆盖 + 自定义任务，本地）──
function getTaskOverrides() { return _get(KEYS.TASK_OVERRIDES, { targets: {}, customs: [] }); }
// 页面保存入口：自动盖时间戳（同步冲突以 updatedAt 新者为准；
// 严格递增防同毫秒连续保存时云端比较失效）
function saveTaskOverrides(o) {
  if (!o) return;
  const prev = (_get(KEYS.TASK_OVERRIDES, {}) || {}).updatedAt || 0;
  _set(KEYS.TASK_OVERRIDES, { ...o, updatedAt: Math.max(Date.now(), prev + 1) });
}
// 同步合并专用：保留远端时间戳，不重新盖章
function saveTaskOverridesRaw(o) { if (o) _set(KEYS.TASK_OVERRIDES, o); }

// ── 奖励小铺（奖品架 + 兑换账本，本地）──
// 时间戳严格递增（Date.now() 同毫秒连续写入时至少 +1）：
// 否则同步"新者胜"比较失效，云端不更新
function _bumpStamp(key) {
  const prev = _get(key, 0) || 0;
  const next = Math.max(Date.now(), prev + 1);
  _set(key, next);
  return next;
}
function getRewards() { return _get(KEYS.REWARDS, []); }
// 写奖品架/账本统一盖整体时间戳（同步冲突以新者为准）
function saveRewards(list) {
  _set(KEYS.REWARDS, list);
  _bumpStamp(KEYS.SHOP_STAMP);
}
function getRedemptions() { return _get(KEYS.REDEMPTIONS, []); }
function saveRedemptions(list) {
  _set(KEYS.REDEMPTIONS, list);
  _bumpStamp(KEYS.SHOP_STAMP);
}
function getShopStamp() { return _get(KEYS.SHOP_STAMP, 0); }
// 同步合并专用：保留远端时间戳，不重新盖章
function saveShopRaw(rewards, redemptions, stamp) {
  _set(KEYS.REWARDS, rewards || []);
  _set(KEYS.REDEMPTIONS, redemptions || []);
  _set(KEYS.SHOP_STAMP, stamp || 0);
}

// ── 口算会话历史（本地）──
function getDrillHistory() { return _get(KEYS.DRILL_HISTORY, []); }
function saveDrillHistory(list) { _set(KEYS.DRILL_HISTORY, list); }

// ── 错题复习日志（本地）──
function getReviewLog() { return _get(KEYS.REVIEW_LOG, []); }
function saveReviewLog(list) { _set(KEYS.REVIEW_LOG, list); }

// 孩子端本地回复表情（回复即已读），云端 cheerReact 异步跟上
function reactCheerLocal(id, reaction) {
  const now = Date.now();
  saveCheers(getCheers().map(c => (c.id === id ? { ...c, reaction, reactedAt: now, readAt: c.readAt || now } : c)));
}

// ── 每周小目标 ──
function getGoals() { return _get(KEYS.GOALS, {}); }
function saveGoals(map) { _set(KEYS.GOALS, map); }

// ── 计时打卡（本机，不同步）──
function getTimer() { return _get(KEYS.TIMER, null); }
function saveTimer(t) { if (t) _set(KEYS.TIMER, t); else _remove(KEYS.TIMER); }

// ── 家长留言（孩子端缓存）──
function getCheers() { return _get(KEYS.CHEERS, []); }
function saveCheers(list) { _set(KEYS.CHEERS, list); }
// 本地先标已读（横幅立刻换下一条），云端 cheerRead 异步跟上
function markCheersRead(ids) {
  const now = Date.now();
  saveCheers(getCheers().map(c => (ids.indexOf(c.id) > -1 && !c.readAt ? { ...c, readAt: now } : c)));
}

// ── 同步游标 ──
function getSyncState() {
  return _get(KEYS.SYNC, { lastPullAt: 0, lastPushAt: 0 });
}
function saveSyncState(s) { _set(KEYS.SYNC, s); }

// ── 家长端：孩子数据缓存 ──
function getChildProfile() { return _get(KEYS.CHILD_PROFILE, null); }
function getChildRecords() { return _get(KEYS.CHILD_RECORDS, []).filter(r => !r.deleted); }
function getChildBadges() { return _get(KEYS.CHILD_BADGES, []); }
function getChildDrillHistory() { return _get(KEYS.CHILD_DRILL, []); }
function getChildQuizHistory() { return _get(KEYS.CHILD_QUIZ, []); }
function getChildReviewLog() { return _get(KEYS.CHILD_REVIEW, []); }
function getChildMathWrong() { return _get(KEYS.CHILD_MATH_WRONG, []); }
function getChildQuizWrong() { return _get(KEYS.CHILD_QUIZ_WRONG, []); }
function getChildGoals() { return _get(KEYS.CHILD_GOALS, {}); }
// practice / wrongBook 缺省（旧版云函数不返回）时保留已有缓存
function saveChildData(profile, records, badges, practice, wrongBook) {
  if (wrongBook) {
    _set(KEYS.CHILD_MATH_WRONG, wrongBook.math || []);
    _set(KEYS.CHILD_QUIZ_WRONG, wrongBook.quiz || []);
  }
  if (profile) _set(KEYS.CHILD_PROFILE, profile);
  if (records) _set(KEYS.CHILD_RECORDS, records);
  if (badges) _set(KEYS.CHILD_BADGES, badges);
  if (practice) {
    _set(KEYS.CHILD_DRILL, practice.drill || []);
    _set(KEYS.CHILD_QUIZ, practice.quiz || []);
    _set(KEYS.CHILD_REVIEW, practice.review || []);
    _set(KEYS.CHILD_GOALS, practice.goals || {});
  }
}

function clearChildData() {
  _remove(KEYS.CHILD_PROFILE);
  _remove(KEYS.CHILD_RECORDS);
  _remove(KEYS.CHILD_BADGES);
  _remove(KEYS.CHILD_DRILL);
  _remove(KEYS.CHILD_QUIZ);
  _remove(KEYS.CHILD_REVIEW);
  _remove(KEYS.CHILD_MATH_WRONG);
  _remove(KEYS.CHILD_QUIZ_WRONG);
  _remove(KEYS.CHILD_GOALS);
}

function clearAll() {
  const c = _loadRecords();
  c.years.forEach(y => _remove(RECORD_SHARD + y));
  Object.keys(KEYS).forEach(k => _remove(KEYS[k]));
  recCache = null;
}

module.exports = {
  KEYS, init, getStorageError,
  getProfile, saveProfile, saveProfileRaw,
  getRecords, getRecordsRaw, saveRecords,
  getBadges, saveBadges,
  getSettings, saveSettings,
  getReadings, saveReadings,
  getMathWrong, saveMathWrong, getWrongStamp, saveWrongRaw,
  getQuizWrong, saveQuizWrong,
  getQuizHistory, saveQuizHistory,
  getTaskOverrides, saveTaskOverrides, saveTaskOverridesRaw,
  getRewards, saveRewards,
  getRedemptions, saveRedemptions,
  getShopStamp, saveShopRaw,
  getDrillHistory, saveDrillHistory,
  getReviewLog, saveReviewLog,
  getCheers, saveCheers, markCheersRead, reactCheerLocal,
  getGoals, saveGoals,
  getTimer, saveTimer,
  getSyncState, saveSyncState,
  getChildProfile, getChildRecords, getChildBadges, getChildDrillHistory, getChildQuizHistory, getChildReviewLog,
  getChildMathWrong, getChildQuizWrong, getChildGoals,
  saveChildData, clearChildData,
  clearAll,
};
