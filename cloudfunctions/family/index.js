// 家人绑定：邀请码创建/加入/退出、家长拉取孩子摘要、家长动态订阅、里程碑推送、家长鼓励留言
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { NOTIFY_TEMPLATE_ID } = require('./config.js');
const CHEER = require('./lib/cheer.js');

const DAY_MS = 24 * 3600 * 1000;

// 留言对外字段（不回传 openid）
function cheerView(d) {
  return {
    id: d._id, from: d.from, text: d.text,
    recordId: d.recordId || null, recordLabel: d.recordLabel || '',
    createdAt: d.createdAt, readAt: d.readAt || 0,
    reaction: d.reaction || '', reactedAt: d.reactedAt || 0,
  };
}

// 内容安全（读者是孩子）：常用语免审；自定义文字送审，风险或审核不可用一律拒绝
async function contentOk(openid, text) {
  if (CHEER.isPreset(text)) return true;
  try {
    const r = await cloud.openapi.security.msgSecCheck({ openid, scene: 2, version: 2, content: text });
    return !!(r && r.result && r.result.suggest === 'pass');
  } catch (e) {
    return false;
  }
}

// 邀请码：6 位，去掉易混淆的 0/O/1/I/L
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

async function findMyFamily(openid) {
  const asOwner = (await db.collection('families').where({ ownerOpenid: openid }).limit(1).get()).data[0];
  if (asOwner) return asOwner;
  return (await db.collection('families').where({ members: _.elemMatch({ openid }) }).limit(1).get()).data[0];
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const action = event.action;

  // 孩子端：创建（幂等，返回现有邀请码）
  if (action === 'create') {
    let fam = await findMyFamily(OPENID);
    if (!fam) {
      const u = (await db.collection('users').where({ openid: OPENID }).limit(1).get()).data[0];
      for (let tries = 0; tries < 5 && !fam; tries++) {
        const code = genCode();
        const clash = await db.collection('families').where({ code }).limit(1).get();
        if (clash.data.length) continue;
        const doc = {
          code,
          ownerOpenid: OPENID,
          ownerProfile: (u && u.profile) || null,
          members: [],
          createdAt: Date.now(),
        };
        const added = await db.collection('families').add({ data: doc });
        fam = { _id: added._id, ...doc };
      }
      if (!fam) return { ok: false, error: '邀请码生成失败，请重试' };
    }
    return { ok: true, code: fam.code };
  }

  // 家长端：凭邀请码加入
  if (action === 'join') {
    const code = String(event.code || '').trim().toUpperCase();
    if (!code) return { ok: false, error: '请输入邀请码' };
    const fam = (await db.collection('families').where({ code }).limit(1).get()).data[0];
    if (!fam) return { ok: false, error: '邀请码不存在' };
    if (fam.ownerOpenid === OPENID) return { ok: false, error: '不能绑定自己哦' };
    if (!(fam.members || []).find(m => m.openid === OPENID)) {
      await db.collection('families').doc(fam._id).update({
        data: { members: _.push([{ openid: OPENID, parentSubQuota: 0, joinedAt: Date.now() }]) },
      });
    }
    const owner = (await db.collection('users').where({ openid: fam.ownerOpenid }).limit(1).get()).data[0];
    return { ok: true, profile: (owner && owner.profile) || null };
  }

  // 家长端：拉取孩子摘要（资料 + 记录 + 勋章 + 练习历史 + 错题本）
  if (action === 'summary') {
    const fam = await findMyFamily(OPENID);
    if (!fam) return { ok: false, error: '尚未绑定' };
    const owner = fam.ownerOpenid;
    const since = Number(event.since) || 0;
    const recDocs = await db.collection('checkins')
      .where({ openid: owner, updatedAt: _.gt(since) })
      .orderBy('updatedAt', 'asc')
      .limit(1000)
      .get();
    const ownerDoc = (await db.collection('users').where({ openid: owner }).limit(1).get()).data[0] || {};
    const profile = ownerDoc.profile || null;
    const practice = ownerDoc.practice || null; // 口算会话 + 小卷历史 + 复习日志（家长报告用）
    const wrongBook = ownerDoc.wrongBook || null; // 口算 + 小卷错题本（家长端只读查看）
    const badges = (await db.collection('badges').where({ openid: owner }).limit(1000).get()).data
      .map(b => ({ id: b.id, earnedAt: b.earnedAt }));
    return {
      ok: true,
      code: fam.code,
      profile,
      badges,
      practice,
      wrongBook,
      records: recDocs.data.map(d => ({
        id: d.id, date: d.date, taskId: d.taskId, value: d.value,
        stars: d.stars, note: d.note, deleted: !!d.deleted, updatedAt: d.updatedAt,
      })),
    };
  }

  // 家长端：退出绑定
  if (action === 'leave') {
    const fam = await findMyFamily(OPENID);
    if (fam && fam.ownerOpenid !== OPENID) {
      const members = (fam.members || []).filter(m => m.openid !== OPENID);
      await db.collection('families').doc(fam._id).update({ data: { members } });
    }
    return { ok: true };
  }

  // 家长端：授权接收孩子动态（订阅消息配额，一次授权一次推送）
  if (action === 'grantParentSub') {
    const fam = await findMyFamily(OPENID);
    if (!fam || fam.ownerOpenid === OPENID) return { ok: false, error: '仅家长可设置' };
    const members = (fam.members || []).map(m =>
      m.openid === OPENID ? { ...m, parentSubQuota: Math.min(3, (m.parentSubQuota || 0) + (Number(event.n) || 1)) } : m);
    await db.collection('families').doc(fam._id).update({ data: { members } });
    return { ok: true };
  }

  // 孩子端：达成里程碑后推送给家长
  if (action === 'notify') {
    const fam = await findMyFamily(OPENID);
    if (!fam || fam.ownerOpenid !== OPENID) return { ok: true, sent: 0 };
    if (!NOTIFY_TEMPLATE_ID || NOTIFY_TEMPLATE_ID.indexOf('REPLACE_') === 0) {
      return { ok: true, sent: 0, hint: '模板 ID 未配置' };
    }
    const members = fam.members || [];
    let sent = 0;
    for (const m of members) {
      if ((m.parentSubQuota || 0) <= 0) continue;
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: m.openid,
          templateId: NOTIFY_TEMPLATE_ID,
          page: 'pages/index/index',
          // ⚠️ 字段名（thing1/thing2…）需与你申请的模板字段一致，见 docs/data-model.md
          data: {
            thing1: { value: String(event.title || '打卡里程碑').slice(0, 20) },
            thing2: { value: String(event.body || '').slice(0, 20) },
          },
        });
        sent++;
        await db.collection('families').doc(fam._id).update({
          data: { members: fam.members.map(x => (x.openid === m.openid ? { ...x, parentSubQuota: x.parentSubQuota - 1 } : x)) },
        });
      } catch (e) {
        if (e.errCode === 43101) { // 用户未订阅/配额用尽
          await db.collection('families').doc(fam._id).update({
            data: { members: fam.members.map(x => (x.openid === m.openid ? { ...x, parentSubQuota: 0 } : x)) },
          });
        }
      }
    }
    return { ok: true, sent };
  }

  // 家长端：给孩子留言（只有绑定的家长可发）
  if (action === 'cheer') {
    const fam = await findMyFamily(OPENID);
    if (!fam || fam.ownerOpenid === OPENID) return { ok: false, error: '仅绑定的家长可以留言' };
    const v = CHEER.validate(event);
    if (!v.ok) return v;
    const recent = await db.collection('cheers')
      .where({ fromOpenid: OPENID, createdAt: _.gt(Date.now() - DAY_MS) })
      .limit(CHEER.DAILY_LIMIT)
      .get();
    if (recent.data.length >= CHEER.DAILY_LIMIT) return { ok: false, error: '今天的留言够多啦，明天再来' };
    if (!(await contentOk(OPENID, v.text))) return { ok: false, error: '这句话发不出去，换个说法或用常用语吧' };
    const added = await db.collection('cheers').add({
      data: {
        ownerOpenid: fam.ownerOpenid, fromOpenid: OPENID,
        from: v.from, text: v.text, recordId: v.recordId, recordLabel: v.recordLabel,
        createdAt: Date.now(), readAt: 0,
      },
    });
    return { ok: true, id: added._id };
  }

  // 孩子端：收到的留言；家长端：自己发出的（各最近 20 条）
  if (action === 'cheers') {
    const fam = await findMyFamily(OPENID);
    if (!fam) return { ok: false, error: '尚未绑定' };
    const where = fam.ownerOpenid === OPENID
      ? { ownerOpenid: OPENID }
      : { ownerOpenid: fam.ownerOpenid, fromOpenid: OPENID };
    const res = await db.collection('cheers').where(where).orderBy('createdAt', 'desc').limit(20).get();
    return { ok: true, cheers: res.data.map(cheerView) };
  }

  // 孩子端：标记已读（只能标自己收到的）
  if (action === 'cheerRead') {
    const ids = (Array.isArray(event.ids) ? event.ids : []).slice(0, 50);
    const now = Date.now();
    for (const id of ids) {
      await db.collection('cheers').where({ _id: id, ownerOpenid: OPENID }).update({ data: { readAt: now } });
    }
    return { ok: true };
  }

  // 孩子端：给收到的留言回一个表情（只能是固定表情；只能回自己收到的；回复即已读，可改）
  if (action === 'cheerReact') {
    if (!CHEER.isReaction(event.reaction)) return { ok: false, error: '请选择一个表情' };
    const now = Date.now();
    const target = db.collection('cheers').where({ _id: String(event.id || ''), ownerOpenid: OPENID });
    const found = (await target.limit(1).get()).data[0];
    if (!found) return { ok: false, error: '留言不存在' };
    await db.collection('cheers').doc(found._id).update({
      data: { reaction: event.reaction, reactedAt: now, readAt: found.readAt || now },
    });
    return { ok: true };
  }

  if (action === 'config') {
    return { ok: true, templateId: NOTIFY_TEMPLATE_ID };
  }

  return { ok: false, error: 'unknown action' };
};
