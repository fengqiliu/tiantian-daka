// 家人绑定：邀请码创建/加入/退出、家长拉取孩子摘要、家长动态订阅、里程碑推送、家长鼓励留言
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { NOTIFY_TEMPLATE_ID, WEEKLY_TEMPLATE_ID } = require('./config.js');
const CHEER = require('./lib/cheer.js');
const SUBJ = require('./lib/subjects.js');
const DECKS = require('./lib/flashcard-decks.js');

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

const MAX_SUMMARY_RECORDS = 5000;
const MAX_OPEN_ASSIGN = 10; // 同时没做完的布置练习上限

// 给有订阅配额的家长发一条订阅消息，成功扣 1 次配额，43101 清零；返回发送条数。
// 回写基于最新的成员列表（循环里每位家长都改同一份文档，用读到的旧数组回写会覆盖前一位的扣减）
async function notifyParentsOf(fam, title, body, page) {
  if (!NOTIFY_TEMPLATE_ID || NOTIFY_TEMPLATE_ID.indexOf('REPLACE_') === 0) return 0;
  let sent = 0;
  for (const m of fam.members || []) {
    if ((m.parentSubQuota || 0) <= 0) continue;
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: m.openid,
        templateId: NOTIFY_TEMPLATE_ID,
        page,
        // ⚠️ 字段名（thing1/thing2…）需与你申请的模板字段一致，见 docs/data-model.md
        data: { thing1: { value: title.slice(0, 20) }, thing2: { value: body.slice(0, 20) } },
      });
      sent++;
      fam.members = fam.members.map(x => (x.openid === m.openid ? { ...x, parentSubQuota: x.parentSubQuota - 1 } : x));
      await db.collection('families').doc(fam._id).update({ data: { members: fam.members } });
    } catch (e) {
      if (e.errCode === 43101) { // 用户未订阅/配额用尽
        fam.members = fam.members.map(x => (x.openid === m.openid ? { ...x, parentSubQuota: 0 } : x));
        await db.collection('families').doc(fam._id).update({ data: { members: fam.members } });
      }
    }
  }
  return sent;
}

// 布置练习对外字段（带显示用的单元名）
function assignView(a) {
  const deck = a.kind === 'deck' ? DECKS.getDeck(a.deckId) : null;
  return { id: a.id, kind: a.kind || 'unit', deckId: a.deckId || '', subject: a.subject || '', unit: a.unit || 0,
    label: deck ? deck.name : SUBJ.nameOf(a.subject) + SUBJ.unitLabel(a.unit), createdAt: a.createdAt, doneAt: a.doneAt || 0, total: a.total || 0, correct: a.correct || 0 };
}
const JOIN_MAX_FAILS = 5;
// 订阅授权次数：客户端说一次授权几次，限制在 1-3（不信任负数 / 超大数）
const grantCount = n => Math.max(1, Math.min(3, Math.floor(Number(n)) || 1));
const JOIN_WINDOW_MS = 15 * 60 * 1000;

// 邀请码：6 位，去掉易混淆的 0/O/1/I/L
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function genCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// as：'parent' = 以家长身份行动，优先找自己作为成员绑定的家庭；其余（孩子）优先找自己拥有的家庭。
// 同一部手机先以孩子身份打开过小程序（自动建了自己的家庭），再切成家长绑定别人时，家长动作必须落在绑定的家庭上
async function findMyFamily(openid, as) {
  const owned = async () => (await db.collection('families').where({ ownerOpenid: openid }).limit(1).get()).data[0];
  const joined = async () => (await db.collection('families').where({ members: _.elemMatch({ openid }) }).limit(1).get()).data[0];
  if (as === 'parent') return (await joined()) || (await owned());
  return (await owned()) || (await joined());
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

  // ── 布置练习：家长给孩子布置某科某单元的小卷，孩子做完回报结果 ──
  // 存在家庭文档上（assignments，最近 30 份）；不回传家长 openid
  if (action === 'assign') {
    const fam = await findMyFamily(OPENID, 'parent');
    if (!fam || fam.ownerOpenid === OPENID) return { ok: false, error: '只有绑定的家长可以布置' };
    const isDeck = event.kind === 'deck';
    const subject = String(event.subject || '');
    const unit = Number(event.unit);
    const deckId = String(event.deckId || '');
    if (isDeck ? !DECKS.getDeck(deckId)
      : SUBJ.ORDER.indexOf(subject) < 0 || !(Number.isInteger(unit) && ((unit >= 1 && unit <= 9) || unit === SUBJ.FINAL_UNIT))) {
      return { ok: false, error: isDeck ? '记忆卡牌组不存在' : '科目或单元不对' };
    }
    const list = fam.assignments || [];
    const open = list.filter(a => !a.doneAt);
    const same = open.find(a => (isDeck ? a.kind === 'deck' && a.deckId === deckId : a.kind !== 'deck' && a.subject === subject && a.unit === unit));
    if (same) return { ok: true, id: same.id };
    if (open.length >= MAX_OPEN_ASSIGN) return { ok: false, error: '没做完的练习已经有 10 份了，等孩子做完再布置吧' };
    const base = { id: 'as' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), doneAt: 0, total: 0, correct: 0 };
    const item = isDeck ? { ...base, kind: 'deck', deckId } : { ...base, kind: 'unit', subject, unit };
    await db.collection('families').doc(fam._id).update({ data: { assignments: [item].concat(list).slice(0, 30) } });
    return { ok: true, id: item.id };
  }

  // 家长端：撤销还没做完的布置（做完的保留，作为记录）
  if (action === 'unassign') {
    const fam = await findMyFamily(OPENID, 'parent');
    if (!fam || fam.ownerOpenid === OPENID) return { ok: false, error: '只有绑定的家长可以撤销' };
    const list = fam.assignments || [];
    const target = list.find(a => a.id === String(event.id || ''));
    if (!target) return { ok: false, error: '练习不存在' };
    if (target.doneAt) return { ok: false, error: '孩子已经做完了，不能撤销' };
    await db.collection('families').doc(fam._id).update({ data: { assignments: list.filter(a => a !== target) } });
    return { ok: true };
  }

  // 孩子端 / 家长端：布置的练习列表（最新在前）
  if (action === 'assignments') {
    const fam = await findMyFamily(OPENID, event.as === 'parent' ? 'parent' : undefined);
    if (!fam) return { ok: false, error: '尚未绑定' };
    return { ok: true, assignments: (fam.assignments || []).map(assignView) };
  }

  // 孩子端：做完回报结果（只能回报自己家庭的）
  if (action === 'assignDone') {
    const fam = (await db.collection('families').where({ ownerOpenid: OPENID }).limit(1).get()).data[0];
    if (!fam) return { ok: false, error: '只有孩子可以回报' };
    const list = fam.assignments || [];
    const i = list.findIndex(a => a.id === String(event.id || ''));
    if (i < 0) return { ok: false, error: '练习不存在' };
    const total = Math.max(0, Math.min(50, Math.floor(Number(event.total)) || 0));
    const correct = Math.max(0, Math.min(total, Math.floor(Number(event.correct)) || 0));
    const first = !list[i].doneAt;
    list[i] = { ...list[i], doneAt: Date.now(), total, correct };
    await db.collection('families').doc(fam._id).update({ data: { assignments: list } });
    // 第一次做完时通知家长（用家长订阅配额；点开直接看报告）
    let notified = 0;
    if (first) {
      const owner = (await db.collection('users').where({ openid: OPENID }).limit(1).get()).data[0];
      const name = ((owner && owner.profile && owner.profile.nickname) || '孩子').slice(0, 8);
      notified = await notifyParentsOf(fam, name + '做完了布置的练习', assignView(list[i]).label + (list[i].kind === 'deck' ? ' · 认识 ' : ' · 答对 ') + correct + '/' + total, 'pages/report/report');
    }
    return { ok: true, notified };
  }

  // 孩子端：更换邀请码并解除全部家长绑定（邀请码泄露、或想让某位家长不再看到数据时用）
  if (action === 'resetCode') {
    const fam = (await db.collection('families').where({ ownerOpenid: OPENID }).limit(1).get()).data[0];
    if (!fam) return { ok: false, error: '只有孩子可以更换邀请码' };
    let code = '';
    for (let tries = 0; tries < 5 && !code; tries++) {
      const c = genCode();
      if (!(await db.collection('families').where({ code: c }).limit(1).get()).data.length) code = c;
    }
    if (!code) return { ok: false, error: '邀请码生成失败，请重试' };
    await db.collection('families').doc(fam._id).update({ data: { code, members: [] } });
    return { ok: true, code };
  }

  // 家长端：凭邀请码加入
  if (action === 'join') {
    const code = String(event.code || '').trim().toUpperCase();
    if (!code) return { ok: false, error: '请输入邀请码' };
    // 防暴力猜邀请码：同一个微信用户 15 分钟内猜错 5 次后，窗口内一律拒绝（连正确的也不行）
    const me = (await db.collection('users').where({ openid: OPENID }).limit(1).get()).data[0];
    const fail = me && me.joinFail && Date.now() - (me.joinFail.since || 0) < JOIN_WINDOW_MS ? me.joinFail : null;
    if (fail && fail.n >= JOIN_MAX_FAILS) return { ok: false, error: '尝试太多次了，请 15 分钟后再试' };
    const fam = (await db.collection('families').where({ code }).limit(1).get()).data[0];
    if (!fam) {
      const next = { n: (fail ? fail.n : 0) + 1, since: fail ? fail.since : Date.now() };
      if (me) await db.collection('users').doc(me._id).update({ data: { joinFail: next } });
      else await db.collection('users').add({ data: { openid: OPENID, profile: null, joinFail: next, createdAt: Date.now(), updatedAt: Date.now() } });
      return { ok: false, error: '邀请码不存在' };
    }
    if (fam.ownerOpenid === OPENID) return { ok: false, error: '不能绑定自己哦' };
    if (me && me.joinFail) await db.collection('users').doc(me._id).update({ data: { joinFail: _.remove() } });
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
    const fam = await findMyFamily(OPENID, 'parent');
    if (!fam) return { ok: false, error: '尚未绑定' };
    const owner = fam.ownerOpenid;
    const since = Number(event.since) || 0;
    // 单次查询最多 1000 条：分页取全（上限 MAX_SUMMARY_RECORDS，约 500 天），否则孩子记录超过 1000 条后
    // 家长端只能看到最旧的 1000 条，最新的永远看不到
    const recDocs = { data: [] };
    for (let skip = 0; skip < MAX_SUMMARY_RECORDS; skip += 1000) {
      const page = await db.collection('checkins')
        .where({ openid: owner, updatedAt: _.gt(since) })
        .orderBy('updatedAt', 'asc')
        .skip(skip)
        .limit(1000)
        .get();
      recDocs.data.push(...page.data);
      if (page.data.length < 1000) break;
    }
    const ownerDoc = (await db.collection('users').where({ openid: owner }).limit(1).get()).data[0] || {};
    const profile = ownerDoc.profile || null;
    const practice = ownerDoc.practice || null; // 口算会话 + 小卷历史 + 复习日志（家长报告用）
    const wrongBook = ownerDoc.wrongBook || null; // 口算 + 小卷错题本（家长端只读查看）
    const overrides = ownerDoc.taskOverrides || null; // 任务覆盖：家长端显示孩子的自定义任务名、清单与孩子一致
    const badges = (await db.collection('badges').where({ openid: owner }).limit(1000).get()).data
      .map(b => ({ id: b.id, earnedAt: b.earnedAt }));
    return {
      ok: true,
      code: fam.code,
      profile,
      badges,
      practice,
      wrongBook,
      overrides,
      assignments: (fam.assignments || []).map(assignView),
      records: recDocs.data.map(d => ({
        id: d.id, date: d.date, taskId: d.taskId, value: d.value,
        stars: d.stars, note: d.note, deleted: !!d.deleted, updatedAt: d.updatedAt,
        makeup: !!d.makeup, makeupAt: d.makeupAt || 0, // 补打卡标记（家长日历显示「补」）
      })),
    };
  }

  // 家长端：退出绑定
  if (action === 'leave') {
    const fam = await findMyFamily(OPENID, 'parent');
    if (fam && fam.ownerOpenid !== OPENID) {
      const members = (fam.members || []).filter(m => m.openid !== OPENID);
      await db.collection('families').doc(fam._id).update({ data: { members } });
    }
    return { ok: true };
  }

  // 家长端：授权接收孩子动态（订阅消息配额，一次授权一次推送）
  if (action === 'grantParentSub') {
    const fam = await findMyFamily(OPENID, 'parent');
    if (!fam || fam.ownerOpenid === OPENID) return { ok: false, error: '仅家长可设置' };
    const members = (fam.members || []).map(m =>
      m.openid === OPENID ? { ...m, parentSubQuota: Math.min(3, (m.parentSubQuota || 0) + grantCount(event.n)) } : m);
    await db.collection('families').doc(fam._id).update({ data: { members } });
    return { ok: true };
  }

  // 家长端：订阅每周一的周报推送（一次授权一次推送，上限 3）
  if (action === 'grantWeekly') {
    const fam = await findMyFamily(OPENID, 'parent');
    if (!fam || fam.ownerOpenid === OPENID) return { ok: false, error: '仅家长可订阅' };
    const members = (fam.members || []).map(m =>
      m.openid === OPENID ? { ...m, weeklyQuota: Math.min(3, (m.weeklyQuota || 0) + grantCount(event.n)) } : m);
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
    const sent = await notifyParentsOf(fam, String(event.title || '打卡里程碑'), String(event.body || ''), 'pages/index/index');
    return { ok: true, sent };
  }

  // 家长端：给孩子留言（只有绑定的家长可发）
  if (action === 'cheer') {
    const fam = await findMyFamily(OPENID, 'parent');
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
    const fam = await findMyFamily(OPENID, event.as === 'parent' ? 'parent' : undefined);
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
    return { ok: true, templateId: NOTIFY_TEMPLATE_ID, weeklyTemplateId: WEEKLY_TEMPLATE_ID };
  }

  return { ok: false, error: 'unknown action' };
};
