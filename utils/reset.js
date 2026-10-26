// 一键清空：本机 + 云端（纯流程，cloud 可注入以便测试）
//
// 顺序：先清云端，成功后才清本机。反过来会出现"本机清了、云端删除失败、
// 下次同步数据又全部回来"的情况；先清云端失败时本机原样保留，可稍后重试。
// 未开通云开发（纯本地模式）时只清本机。
const store = require('./store');

// cloud = { isAvailable(), resetCloud() -> Promise<{ok, error?}> }
// 返回 { ok: true, cloud: boolean } 或 { ok: false, error }
function clearEverything(cloud) {
  if (!cloud.isAvailable()) {
    store.clearAll();
    return Promise.resolve({ ok: true, cloud: false });
  }
  return Promise.resolve()
    .then(() => cloud.resetCloud())
    .then(res => {
      if (!res || res.ok === false) return { ok: false, error: (res && res.error) || '云端清空失败' };
      store.clearAll();
      return { ok: true, cloud: true };
    })
    .catch(e => ({ ok: false, error: (e && e.message) || String(e) }));
}

module.exports = { clearEverything };
