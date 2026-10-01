// 每日提醒：订阅配额登记 / 状态 / 关闭
// 一次性订阅消息的配额模式：用户每点一次"允许"积累 1 条可发送额度（上限 3），
// 每日 20:00 由 dailyRemind 定时函数消费额度发送。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { REMIND_TEMPLATE_ID, REMIND_HOUR } = require('./config.js');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, error: 'no openid' };
  const action = event.action;
  const users = db.collection('users');

  if (action === 'config') {
    return { ok: true, templateId: REMIND_TEMPLATE_ID, hour: REMIND_HOUR };
  }

  if (action === 'grant') {
    const n = Math.max(1, Math.min(3, Number(event.n) || 1));
    const hour = Math.max(6, Math.min(22, Number(event.hour) || REMIND_HOUR));
    const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
    if (!u) return { ok: false, error: '用户不存在，请稍后重试' };
    await users.doc(u._id).update({
      data: {
        remindEnabled: true,
        remindHour: hour,
        remindQuota: _.set(Math.min(3, (u.remindQuota || 0) + n)),
      },
    });
    return { ok: true };
  }

  if (action === 'status') {
    const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
    return {
      ok: true,
      enabled: !!(u && u.remindEnabled),
      quota: (u && u.remindQuota) || 0,
      hour: (u && u.remindHour) || REMIND_HOUR,
    };
  }

  if (action === 'disable') {
    const u = (await users.where({ openid: OPENID }).limit(1).get()).data[0];
    if (u) await users.doc(u._id).update({ data: { remindEnabled: false, remindQuota: _.set(0) } });
    return { ok: true };
  }

  return { ok: false, error: 'unknown action' };
};
