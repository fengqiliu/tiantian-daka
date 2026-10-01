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
function mergePull({ records = [], profile = null, badges = [] }) {
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
  const payload = {
    records,
    profile: store.getProfile(),
    badges: store.getBadges(),
  };
  const res = await api.pushData(payload);
  if (!res || res.ok === false) return false; // 失败不推进游标，下次重试
  const maxSent = records.reduce((m, r) => Math.max(m, r.updatedAt || 0), 0);
  store.saveSyncState({ ...store.getSyncState(), lastPushAt: Math.max(maxSent, st.lastPushAt) });
  return true;
}

// 拉取云端变更并合并；api = { pullData({since}) -> {ok, records, profile, badges} }
async function pull(api) {
  const st = store.getSyncState();
  const res = await api.pullData({ since: st.lastPullAt || 0 });
  if (!res || res.ok === false) return false;
  const maxPulled = mergePull(res);
  store.saveSyncState({ ...store.getSyncState(), lastPullAt: Math.max(maxPulled, st.lastPullAt) });
  return true;
}

// 先拉后推：拉取合并后，本地较新的数据立即回推（冲突收敛）
async function syncAll(api) {
  const pulled = await pull(api);
  const pushed = await push(api);
  return { pulled, pushed };
}

module.exports = { mergePull, push, pull, syncAll };
