// 登录：openid 换取 + 用户档案初始化 + 集合自愈创建
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function ensureCollection(name) {
  try { await db.createCollection(name); } catch (e) { /* 已存在 */ }
}

// 云函数实例会被复用（热启动）：集合只需在实例的第一次登录时检查，之后不再每次发 5 个 createCollection 请求
let collectionsReady = false;

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  if (!collectionsReady) {
    for (const name of ['users', 'checkins', 'badges', 'families', 'cheers']) await ensureCollection(name);
    collectionsReady = true;
  }

  const users = db.collection('users');
  let u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
  if (!u) {
    const now = Date.now();
    await users.add({ data: { openid: OPENID, profile: null, remindEnabled: false, remindQuota: 0, remindHour: 20, createdAt: now, updatedAt: now } });
    u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
  }
  return { ok: true, openid: OPENID, user: u };
};
