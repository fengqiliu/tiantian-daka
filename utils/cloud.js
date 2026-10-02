const store = require('./store');

// 云能力封装：初始化、云函数调用、同步、家人绑定、订阅消息
// ⚠️ 接入步骤见 README「云开发接入指南」：
//   1) 开通云开发后把 CLOUD_ENV 改成你的环境 ID（留空 = 纯本地模式，所有云功能静默降级）
//   2) 在 mp.weixin.qq.com 申请订阅消息模板，把模板 ID 填到 cloudfunctions/remind/config.js
//      与 cloudfunctions/family/config.js
const CLOUD_ENV = ''; // 例如 'prod-3g0abc123def456'

const REMIND_PAGE = 'pages/index/index';

let available = null; // null=未初始化, true/false

// envOverride 仅供测试注入 CLOUD_ENV（生产环境不传，走下方常量）
function init(envOverride) {
  const env = envOverride !== undefined ? envOverride : CLOUD_ENV;
  if (typeof wx === 'undefined' || !wx.cloud || !env) {
    available = false;
    return false;
  }
  try {
    wx.cloud.init({ env, traceUser: true });
    available = true;
  } catch (e) {
    available = false;
  }
  return available;
}

function isAvailable() { return available === true; }

// 统一调用：云不可用时返回 {ok:false, degraded:true}，调用方无需判空
function call(name, data = {}) {
  if (!isAvailable()) return Promise.resolve({ ok: false, degraded: true });
  return wx.cloud.callFunction({ name, data })
    .then(r => (r && r.result) || { ok: false, error: 'empty result' })
    .catch(err => ({ ok: false, error: (err && err.errMsg) || String(err) }));
}

// ── 同步（utils/sync.js 的传输层实现）──
const syncEngine = require('./sync');

const syncApi = {
  pushData: payload => call('sync', { action: 'push', ...payload }),
  pullData: q => call('sync', { action: 'pull', since: q.since }),
};

let syncing = false;
let lastSyncAt = 0;

// 全量同步（先拉后推）；fire-and-forget，失败静默（下次再试）
function syncAll(force) {
  if (!isAvailable() || syncing) return Promise.resolve(false);
  if (!force && Date.now() - lastSyncAt < 60 * 1000) return Promise.resolve(false); // 节流 1 分钟
  syncing = true;
  return syncEngine.syncAll(syncApi)
    .then(() => { lastSyncAt = Date.now(); return true; })
    .catch(() => false)
    .then(r => { syncing = false; return r; });
}

// ── 家人绑定 ──
function familyCreate() { return call('family', { action: 'create' }); }
function familyJoin(code) { return call('family', { action: 'join', code: (code || '').trim().toUpperCase() }); }
function familyLeave() { return call('family', { action: 'leave' }); }
// 家长端拉孩子摘要（since 增量；写入 store 的孩子缓存）
function familyRefresh() {
  return call('family', { action: 'summary', since: 0 }).then(res => {
    if (res && res.ok) {
      store.saveChildData(res.profile, res.records, res.badges);
    }
    return res;
  });
}
// 孩子端：达成里程碑后通知家长（fire-and-forget）
function notifyParents(title, body) {
  return call('family', { action: 'notify', title, body });
}
function grantParentSub(n) { return call('family', { action: 'grantParentSub', n }); }
function familyConfig() { return call('family', { action: 'config' }); }

// ── 每日提醒订阅 ──
function remindConfig() { return call('remind', { action: 'config' }); }
function remindGrant(n, hour) { return call('remind', { action: 'grant', n, hour }); }
function remindStatus() { return call('remind', { action: 'status' }); }
function remindDisable() { return call('remind', { action: 'disable' }); }

// 请求订阅并按接受数量登记配额；templateId 从云函数配置读取（单一配置源）
// 返回 {ok, accepted, degraded?, error?}
function subscribeAndGrant(kind) { // kind: 'remind' | 'parent'
  const conf = kind === 'remind' ? remindConfig() : familyConfig();
  return conf.then(c => {
    if (!c || c.ok === false) return { ok: false, degraded: c && c.degraded, error: c && c.error };
    const tmpl = c.templateId;
    if (!tmpl || tmpl.indexOf('REPLACE_') === 0) {
      return { ok: false, error: '模板 ID 未配置' };
    }
    return new Promise(resolve => {
      wx.requestSubscribeMessage({
        tmplIds: [tmpl],
        success: r => {
          const accepted = r[tmpl] === 'accept' ? 1 : 0;
          if (!accepted) return resolve({ ok: false, error: '未授权订阅' });
          const grant = kind === 'remind' ? remindGrant(accepted, c.hour) : grantParentSub(accepted);
          grant.then(g => resolve({ ok: g && g.ok !== false, accepted }));
        },
        fail: e => resolve({ ok: false, error: (e && e.errMsg) || '订阅失败' }),
      });
    });
  });
}

module.exports = {
  CLOUD_ENV, init, isAvailable, call,
  syncAll,
  familyCreate, familyJoin, familyLeave, familyRefresh, notifyParents, grantParentSub, familyConfig,
  remindConfig, remindGrant, remindStatus, remindDisable, subscribeAndGrant,
  REMIND_PAGE,
};
