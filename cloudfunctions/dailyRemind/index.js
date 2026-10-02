// 每日提醒定时任务：每天 20:00（北京时间）检查未完成任务并发送订阅消息
// 触发配置见 config.json triggers；一次性订阅配额在发送成功后扣减。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { REMIND_TEMPLATE_ID } = require('./config.js');
const tasksLib = require('./lib/tasks.js');
const dateLib = require('./lib/date.js');

// 与 utils/checkin.js 的 dayCompletion 一致的最小实现（云函数不依赖 store）
function dayCompletion(tasks, records) {
  const map = {};
  records.forEach(r => { map[r.taskId] = r; });
  let done = 0, mustTotal = 0, mustDone = 0;
  tasks.forEach(t => {
    if (t.must) mustTotal++;
    if (map[t.id]) { done++; if (t.must) mustDone++; }
  });
  return { total: tasks.length, done, allMustDone: mustTotal > 0 && mustDone === mustTotal };
}

exports.main = async (event) => {
  // 仅允许定时器触发（也可手动在测试环境传 {Type:'Timer'}）
  if (event.Type !== 'Timer' && !event.TriggerName) {
    return { ok: false, error: 'timer-only function' };
  }
  if (!REMIND_TEMPLATE_ID || REMIND_TEMPLATE_ID.indexOf('REPLACE_') === 0) {
    return { ok: false, error: 'REMIND_TEMPLATE_ID 未配置（cloudfunctions/remind 与本函数的 config.js）' };
  }

  const users = (await db.collection('users')
    .where({ remindEnabled: true, remindQuota: _.gt(0) })
    .limit(1000)
    .get()).data;

  const today = dateLib.todayStr(); // 云函数运行在北京时间
  let sent = 0, skipped = 0;

  for (const u of users) {
    if (!u.profile) { skipped++; continue; }
    const recs = (await db.collection('checkins')
      .where({ openid: u.openid, date: today })
      .limit(100)
      .get()).data.filter(r => !r.deleted);
    // 注入家长任务覆盖（调目标/自定义任务），保证"是否全部完成"判定与孩子端一致
    tasksLib.setOverrideProvider(() => u.taskOverrides || null);
    const tasks = tasksLib.generateDailyTasks(u.profile.grade || 3, today);
    const comp = dayCompletion(tasks, recs);
    if (comp.done >= comp.total) { skipped++; continue; } // 今日已全部完成，不打扰

    const nickname = (u.profile.nickname || '小达人').slice(0, 10);
    const body = `还有 ${comp.total - comp.done} 项任务没打卡，加油！`.slice(0, 20);
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: u.openid,
        templateId: REMIND_TEMPLATE_ID,
        page: 'pages/index/index',
        // ⚠️ 字段名需与你申请的模板一致（thing1=昵称、thing2=内容）
        data: { thing1: { value: nickname }, thing2: { value: body } },
      });
      sent++;
      await db.collection('users').doc(u._id).update({ data: { remindQuota: _.inc(-1) } });
    } catch (e) {
      if (e.errCode === 43101) { // 未订阅/配额失效，清零待重新授权
        await db.collection('users').doc(u._id).update({ data: { remindQuota: _.set(0) } });
      }
    }
  }
  return { ok: true, candidates: users.length, sent, skipped };
};
