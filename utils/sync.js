// 数据同步引擎（纯逻辑，可用 Node 直接测试）
//
// 协议（与云函数 cloudfunctions/sync 对应）：
// - 推送 pushData：本地 updatedAt > lastPushAt 的记录（含墓碑）+ 全量 profile / badges
// - 拉取 pullData：云端 updatedAt > lastPullAt 的记录（含墓碑）+ profile + badges
// - 冲突规则：记录/资料按 updatedAt 新者胜；勋章只增不删，取并集
// - 删除：墓碑（deleted: true）双向传播
// - 游标取本次传输的最大 updatedAt，避免测试/时钟回拨下的丢包
const store = require('./store');

// 把一次拉取结果合并进本地（可独立测试的纯合并步骤）
function mergePull({ records = [], profile = null, badges = [], overrides = null }) {
  let maxPulled = 0;
  if (records.length) {
    const raw = store.getRecordsRaw();
    const index = {};
    raw.forEach((r, i) => { index[r.id] = i; });
    records.forEach(rm => {
      maxPulled = Math.max(maxPulled, rm.updatedAt || 0);
      const i = index[rm.id];
      if (i === undefined) { raw.push(rm); index[rm.id] = raw.length - 1; }
      else if ((rm.updatedAt || 0) > (raw[i].updatedAt || 0)) { raw[i] = rm; }
    });
    store.saveRecords(raw);
  }
  if (profile) {
    maxPulled = Math.max(maxPulled, profile.updatedAt || 0);
    const local = store.getProfile();
    if (!local || (profile.updatedAt || 0) > (local.updatedAt || 0)) {
      store.saveProfileRaw(profile);
    }
  }
  if (overrides && typeof overrides === 'object') {
    maxPulled = Math.max(maxPulled, overrides.updatedAt || 0);
    const local = store.getTaskOverrides();
    if (!local.updatedAt || (overrides.updatedAt || 0) > (local.updatedAt || 0)) {
      store.saveTaskOverridesRaw(overrides);
    }
  }
  if (badges.length) {
    const cur = store.getBadges();
    const have = new Set(cur.map(b => b.id));
    badges.forEach(b => {
      if (!have.has(b.id)) { cur.push(b); have.add(b.id); }
      maxPulled = Math.max(maxPulled, b.earnedAt || 0);
    });
    store.saveBadges(cur);
  }
  return maxPulled;
}

// 推送本地变更；api = { pushData(payload) -> {ok} }（云端不可用时 api 为降级桩）
async function push(api) {
  const st = store.getSyncState();
  const records = store.getRecordsRaw().filter(r => (r.updatedAt || 0) > (st.lastPushAt || 0));
  // 任务覆盖只在家长改过（有盖章）时上传，避免空配置覆盖云端
  const localOverrides = store.getTaskOverrides();
  const overrides = localOverrides.updatedAt ? localOverrides : null;
  const payload = {
    records,
    profile: store.getProfile(),
    badges: store.getBadges(),
    overrides,
  };
  const res = await api.pushData(payload);
  if (!res || res.ok === false) return false; // 失败不推进游标，下次重试
  const maxSent = records.reduce((m, r) => Math.max(m, r.updatedAt || 0), 0);
  // 游标用服务器时间封顶：设备时钟快于真实时间时，避免游标越过"未来"时间戳
  // 导致后续正常记录永远不被推送（数据丢失）；被跳过的记录最多重发，云端幂等
  const serverTime = res.serverTime || Infinity;
  const cap = Math.min(maxSent, serverTime);
  store.saveSyncState({ ...store.getSyncState(), lastPushAt: Math.max(cap, st.lastPushAt) });
  return true;
}

// 拉取云端变更并合并；api = { pullData({since}) -> {ok, records, profile, badges, overrides?} }
async function pull(api) {
  const st = store.getSyncState();
  const res = await api.pullData({ since: st.lastPullAt || 0 });
  if (!res || res.ok === false) return false;
  const maxPulled = mergePull(res);
  // 与 push 一致：游标用服务器时间封顶，防时钟漂移导致丢包
  const cap = Math.min(maxPulled, res.serverTime || Infinity);
  store.saveSyncState({ ...store.getSyncState(), lastPullAt: Math.max(cap, st.lastPullAt) });
  return true;
}

// 先拉后推：拉取合并后，本地较新的数据立即回推（冲突收敛）
async function syncAll(api) {
  const pulled = await pull(api);
  const pushed = await push(api);
  return { pulled, pushed };
}

module.exports = { mergePull, push, pull, syncAll };
