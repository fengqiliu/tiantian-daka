// 数据同步：push（本地→云端）/ pull（云端→本地）/ reset（一键清空云端）
// 冲突规则与 utils/sync.js 一致：记录/资料按 updatedAt 新者胜，勋章与练习历史并集，删除走墓碑。
// 安全：openid 一律取自调用上下文，绝不信任前端传入。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const HM = require('./lib/history-merge.js');

const MAX_PULL = 3000; // 拉取上限（约一年记录量）

async function pullRecords(openid, since) {
  const out = [];
  let offset = 0;
  while (out.length < MAX_PULL) {
    const page = await db.collection('checkins')
      .where({ openid, updatedAt: _.gt(since) })
      .orderBy('updatedAt', 'asc')
      .skip(offset)
      .limit(100)
      .get();
    out.push(...page.data);
    if (page.data.length < 100) break;
    offset += 100;
  }
  return out.map(strip);
}

function strip(doc) {
  // 只回传业务字段，本地以 r.id 为准
  return {
    id: doc.id, date: doc.date, taskId: doc.taskId,
    value: doc.value, stars: doc.stars, note: doc.note,
    deleted: !!doc.deleted, updatedAt: doc.updatedAt,
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const action = event.action;

  if (action === 'push') {
    // 记录：按 (openid, id) upsert，云端较新则忽略
    for (const r of event.records || []) {
      if (!r || !r.id || !r.date || !r.taskId) continue;
      const found = await db.collection('checkins').where({ openid: OPENID, id: r.id }).limit(1).get();
      if (found.data.length) {
        if ((found.data[0].updatedAt || 0) < (r.updatedAt || 0)) {
          await db.collection('checkins').doc(found.data[0]._id).update({ data: { ...r, openid: OPENID } });
        }
      } else {
        await db.collection('checkins').add({ data: { ...r, openid: OPENID } });
      }
    }
    // 资料：云端较旧才覆盖
    if (event.profile && typeof event.profile === 'object') {
      const { profile: incoming } = event;
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        if (!u.profile || (u.profile.updatedAt || 0) < (incoming.updatedAt || 0)) {
          await users.doc(u._id).update({ data: { profile: incoming, updatedAt: Date.now() } });
        }
      }
    }
    // 任务覆盖（家长调目标/自定义任务）：云端较旧才覆盖
    if (event.overrides && typeof event.overrides === 'object') {
      const { overrides: incoming } = event;
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        const cur = u.taskOverrides || {};
        if (!cur.updatedAt || (cur.updatedAt || 0) < (incoming.updatedAt || 0)) {
          await users.doc(u._id).update({ data: { taskOverrides: incoming } });
        }
      }
    }
    // 奖励小铺（奖品架 + 兑换账本）：云端较旧才覆盖
    if (event.shop && typeof event.shop === 'object') {
      const { shop: incoming } = event;
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        const cur = u.shop || {};
        if (!cur.updatedAt || (cur.updatedAt || 0) < (incoming.updatedAt || 0)) {
          await users.doc(u._id).update({ data: { shop: incoming } });
        }
      }
    }
    // 练习历史（口算会话 + 小卷）：按 at 并集合并，多设备各自新增都保留
    if (event.practice && typeof event.practice === 'object') {
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        const merged = HM.mergePractice(u.practice, event.practice);
        await users.doc(u._id).update({ data: { practice: _.set(merged) } });
      }
    }
    // 错题本（口算 + 小卷）：整体新者胜；_.set 整体替换，避免数组残留已销账的题
    if (event.wrong && typeof event.wrong === 'object') {
      const { wrong: incoming } = event;
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        const cur = u.wrongBook || {};
        if (!cur.updatedAt || (cur.updatedAt || 0) < (incoming.updatedAt || 0)) {
          await users.doc(u._id).update({ data: { wrongBook: _.set(incoming) } });
        }
      }
    }
    // 勋章：并集
    for (const b of event.badges || []) {
      if (!b || !b.id) continue;
      const found = await db.collection('badges').where({ openid: OPENID, id: b.id }).limit(1).get();
      if (!found.data.length) await db.collection('badges').add({ data: { ...b, openid: OPENID } });
    }
    return { ok: true, serverTime: Date.now() };
  }

  if (action === 'pull') {
    const since = Number(event.since) || 0;
    const records = await pullRecords(OPENID, since);
    const u = (await db.collection('users').where({ openid: OPENID }).limit(1).get()).data[0];
    const badges = (await db.collection('badges').where({ openid: OPENID }).limit(1000).get()).data
      .map(b => ({ id: b.id, earnedAt: b.earnedAt }));
    return { ok: true, records, profile: (u && u.profile) || null, overrides: (u && u.taskOverrides) || null, shop: (u && u.shop) || null, practice: (u && u.practice) || null, wrong: (u && u.wrongBook) || null, badges, serverTime: Date.now() };
  }

  // 一键清空：删除调用者的全部打卡数据（客户端「清空所有数据」先调此动作，成功后再清本机）
  // 保留 users 档案本身（openid、提醒订阅配额）与家人绑定：家长继续看到孩子重新开始后的数据
  if (action === 'reset') {
    await db.collection('checkins').where({ openid: OPENID }).remove();
    await db.collection('badges').where({ openid: OPENID }).remove();
    await db.collection('cheers').where({ ownerOpenid: OPENID }).remove(); // 收到的家长留言
    const users = db.collection('users');
    const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
    if (u) {
      await users.doc(u._id).update({
        data: {
          profile: null,
          taskOverrides: _.remove(),
          shop: _.remove(),
          practice: _.remove(),
          wrongBook: _.remove(),
          updatedAt: Date.now(),
        },
      });
    }
    return { ok: true, serverTime: Date.now() };
  }

  return { ok: false, error: 'unknown action' };
};
