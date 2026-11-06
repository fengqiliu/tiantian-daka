// 数据同步：push（本地→云端）/ pull（云端→本地）/ reset（一键清空云端）
// 冲突规则与 utils/sync.js 一致：记录/资料按 updatedAt 新者胜，勋章与练习历史并集，删除走墓碑。
// 安全：openid 一律取自调用上下文，绝不信任前端传入。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const HM = require('./lib/history-merge.js');
const SAN = require('./lib/sanitize.js');

const PULL_PAGE = 1000; // 单次查询上限 1000：3000 条只需 3 次往返（原先每页 100 条要 30 次）
const MAX_PULL = 3000; // 拉取上限（约一年记录量）
// 本实例上一次分配的 serverAt：同一毫秒内的连续 push 也严格递增（否则游标用 _.gt 会跳过同一时刻写入的记录）
let lastStamp = 0;

// 拉取按服务器写入时间 serverAt 做游标（不用客户端写的 updatedAt）：
// 离线很久的设备晚上传的"旧"记录，updatedAt 早于别的设备的游标，用 updatedAt 就永远拉不到
async function pullRecords(openid, since) {
  const out = [];
  let offset = 0;
  while (out.length < MAX_PULL) {
    const page = await db.collection('checkins')
      .where({ openid, serverAt: _.gt(since) })
      .orderBy('serverAt', 'asc')
      .skip(offset)
      .limit(PULL_PAGE)
      .get();
    out.push(...page.data);
    if (page.data.length < PULL_PAGE) break;
    offset += PULL_PAGE;
  }
  return out.map(strip);
}

function strip(doc) {
  // 只回传业务字段，本地以 r.id 为准
  return {
    id: doc.id, date: doc.date, taskId: doc.taskId,
    value: doc.value, stars: doc.stars, note: doc.note,
    deleted: !!doc.deleted, updatedAt: doc.updatedAt, serverAt: doc.serverAt || 0,
    makeup: !!doc.makeup, makeupAt: doc.makeupAt || 0, // 补打卡标记
  };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const action = event.action;

  if (action === 'push') {
    const now = Date.now();
    const rawRecords = Array.isArray(event.records) ? event.records : [];
    // 条数上限：一次调用逐条写库，超过上限整体拒绝（客户端按 200 条一批发送，正常使用不会碰到）
    if (rawRecords.length > SAN.MAX_PUSH_RECORDS) return { ok: false, error: 'too_many_records' };
    // 记录：清洗成白名单字段（不接受客户端的 openid / _id / 额外字段，时间戳封顶），按 (openid, id) upsert，云端较新则忽略
    // 性能：一批记录用 id 批量查出已有的（每 100 条 1 次查询），而不是每条先 get 再写；写入并发 20 条一组。
    // 同一批里重复的 id 只留 updatedAt 最大的一条
    const cleaned = new Map();
    for (const raw of rawRecords) {
      const r = SAN.cleanRecord(raw, now);
      if (r && (!cleaned.has(r.id) || cleaned.get(r.id).updatedAt < r.updatedAt)) cleaned.set(r.id, r);
    }
    const ids = [...cleaned.keys()];
    const existing = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const found = await db.collection('checkins').where({ openid: OPENID, id: _.in(ids.slice(i, i + 100)) }).limit(1000).get();
      found.data.forEach(d => existing.set(d.id, d));
    }
    // 每条写入盖服务器时间 serverAt（拉取游标用）；同一批逐条 +1，保证互不相同，截断边界不会因并列跳过
    let stamp = Math.max(now, lastStamp + 1);
    const writes = [];
    cleaned.forEach(r => {
      const cur = existing.get(r.id);
      if (!cur) { const doc = { ...r, openid: OPENID, serverAt: stamp++ }; writes.push(() => db.collection('checkins').add({ data: doc })); }
      else if ((cur.updatedAt || 0) < r.updatedAt) { const doc = { ...r, openid: OPENID, serverAt: stamp++ }; writes.push(() => db.collection('checkins').doc(cur._id).update({ data: doc })); }
    });
    lastStamp = stamp - 1;
    for (let i = 0; i < writes.length; i += 20) await Promise.all(writes.slice(i, i + 20).map(w => w()));
    // 资料：云端较旧才覆盖
    if (SAN.withinBytes(event.profile, SAN.LIMITS.profile)) {
      const incoming = { ...event.profile, updatedAt: SAN.clampStamp(event.profile.updatedAt, now) };
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        if (!u.profile || (u.profile.updatedAt || 0) < (incoming.updatedAt || 0)) {
          await users.doc(u._id).update({ data: { profile: incoming, updatedAt: Date.now() } });
        }
      }
    }
    // 任务覆盖（家长调目标/自定义任务）：云端较旧才覆盖
    if (SAN.withinBytes(event.overrides, SAN.LIMITS.overrides)) {
      const incoming = { ...event.overrides, updatedAt: SAN.clampStamp(event.overrides.updatedAt, now) };
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
    if (SAN.withinBytes(event.shop, SAN.LIMITS.shop)) {
      const incoming = { ...event.shop, updatedAt: SAN.clampStamp(event.shop.updatedAt, now) };
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
    if (SAN.withinBytes(event.practice, SAN.LIMITS.practice)) {
      const users = db.collection('users');
      const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
      if (u) {
        const merged = HM.mergePractice(u.practice, event.practice);
        await users.doc(u._id).update({ data: { practice: _.set(merged) } });
      }
    }
    // 错题本（口算 + 小卷）：整体新者胜；_.set 整体替换，避免数组残留已销账的题
    if (SAN.withinBytes(event.wrong, SAN.LIMITS.wrong)) {
      const incoming = { ...event.wrong, updatedAt: SAN.clampStamp(event.wrong.updatedAt, now) };
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
    const badges = (Array.isArray(event.badges) ? event.badges : []).map(SAN.cleanBadge).filter(Boolean).slice(0, SAN.MAX_BADGES);
    for (const b of badges) {
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
