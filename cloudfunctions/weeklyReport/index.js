// 周报推送定时任务：每周一 08:00（北京时间）给订阅了周报的家长推送孩子上周摘要
// 触发配置见 config.json triggers；一次性订阅配额（families.members[].weeklyQuota）在发送成功后扣减。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { WEEKLY_TEMPLATE_ID } = require('./config.js');
const tasksLib = require('./lib/tasks.js');
const dateLib = require('./lib/date.js');
const WB = require('./lib/week-brief.js');

exports.main = async (event) => {
  if (event.Type !== 'Timer' && !event.TriggerName) {
    return { ok: false, error: 'timer-only function' };
  }
  if (!WEEKLY_TEMPLATE_ID || WEEKLY_TEMPLATE_ID.indexOf('REPLACE_') === 0) {
    return { ok: false, error: 'WEEKLY_TEMPLATE_ID 未配置（cloudfunctions/family 与本函数的 config.js）' };
  }

  const today = event.today || WB.cnToday(); // 按北京时间取日期（服务器可能是 UTC）；测试可注入
  const monday = WB.lastWeekMonday(today);
  const nextMonday = dateLib.addDays(monday, 7);
  const families = (await db.collection('families').limit(1000).get()).data
    .filter(f => (f.members || []).some(m => (m.weeklyQuota || 0) > 0));

  let sent = 0, skipped = 0;
  for (const fam of families) {
    const owner = (await db.collection('users').where({ openid: fam.ownerOpenid }).limit(1).get()).data[0];
    if (!owner || !owner.profile) { skipped++; continue; }
    const recs = (await db.collection('checkins')
      .where({ openid: fam.ownerOpenid, date: _.gte(monday) })
      .limit(200)
      .get()).data.filter(r => !r.deleted && r.date < nextMonday);
    tasksLib.setOverrideProvider(() => owner.taskOverrides || null); // 与孩子端清单一致
    const b = WB.brief(recs, owner.profile.grade || 3, monday);
    const title = ((owner.profile.nickname || '孩子').slice(0, 10) + '上周周报').slice(0, 20);

    for (const m of fam.members || []) {
      if ((m.weeklyQuota || 0) <= 0) continue;
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: m.openid,
          templateId: WEEKLY_TEMPLATE_ID,
          page: 'pages/report/report',
          // ⚠️ 字段名需与你申请的模板一致（thing1=标题、thing2=内容）
          data: { thing1: { value: title }, thing2: { value: b.text } },
        });
        sent++;
        await db.collection('families').doc(fam._id).update({
          data: { members: (fam.members = fam.members.map(x => (x.openid === m.openid ? { ...x, weeklyQuota: x.weeklyQuota - 1 } : x))) },
        });
      } catch (e) {
        if (e.errCode === 43101) { // 未订阅 / 配额失效：清零，等家长下次授权
          await db.collection('families').doc(fam._id).update({
            data: { members: (fam.members = fam.members.map(x => (x.openid === m.openid ? { ...x, weeklyQuota: 0 } : x))) },
          });
        }
      }
    }
  }
  return { ok: true, families: families.length, sent, skipped, week: monday };
};
