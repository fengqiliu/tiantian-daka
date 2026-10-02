// 云函数单元测试：node test/run-cloud-tests.js
// 用内存数据库桩替代 wx-server-sdk，重点覆盖安全边界（openid 隔离）与订阅配额逻辑。
const assert = require('assert');
const CM = require('./cloud-mock');

let passed = 0;
let chain = Promise.resolve();
function t(name, fn) {
  chain = chain.then(() => Promise.resolve(fn()).then(() => { passed++; console.log('  ✓ ' + name); }));
}

function reset() { CM.reset(); }
const rec = (id, extra) => ({
  id, date: id.split('#')[0], taskId: id.split('#')[1],
  value: { type: 'done', n: 1 }, stars: 2, note: '', updatedAt: 100, ...extra,
});
async function asUser(openid, fn) { CM.setOpenid(openid); return fn(CM.load('login')); }

console.log('— 登录 login —');
t('首次登录创建用户档案，重复登录幂等', async () => {
  reset();
  const login = CM.load('login');
  CM.setOpenid('kid1');
  const first = await login.main({});
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.user.profile, null);
  assert.strictEqual(CM.db.users.length, 1, '首次应创建');
  const second = await login.main({});
  assert.strictEqual(second.user._id, first.user._id, '重复登录不应重复建档');
  assert.strictEqual(CM.db.users.length, 1);
});
t('无 openid（上下文缺失）时拒绝', async () => {
  reset();
  CM.setOpenid('');
  const r = await CM.load('login').main({});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'no openid');
});

console.log('— 数据同步 sync —');
t('push 落库并 pull 取回，字段完整', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  const r = await sync.main({
    action: 'push',
    records: [rec('2026-10-05#habit_sleep', { updatedAt: 100 })],
    profile: { nickname: '小豆', updatedAt: 100 },
    badges: [{ id: 'first_checkin', earnedAt: 100 }],
  });
  assert.strictEqual(r.ok, true);
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.records.length, 1);
  assert.strictEqual(p.records[0].taskId, 'habit_sleep');
  assert.strictEqual(p.profile.nickname, '小豆');
  assert.strictEqual(p.badges.length, 1);
});
t('回归：push 分支曾引用未定义的 openid（同步全挂）', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [rec('a#b')] }); // 旧代码在此抛 ReferenceError
  assert.strictEqual(CM.db.checkins.length, 1, '记录应写入');
});
t('openid 隔离：A 的数据 B 拉不到，推送也不串号', async () => {
  reset();
  CM.setOpenid('kidA');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [rec('2026-10-05#pe_rope')], profile: { nickname: 'A', updatedAt: 100 } });

  CM.setOpenid('kidB');
  await CM.load('login').main({});
  const pb = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(pb.records.length, 0, 'B 不应看到 A 的记录');
  assert.strictEqual(pb.profile, null, 'B 不应看到 A 的资料');
  // B 用相同 record id 推送，应独立成行而非覆盖 A 的
  await sync.main({ action: 'push', records: [rec('2026-10-05#pe_rope', { updatedAt: 200 })] });
  assert.strictEqual(CM.db.checkins.length, 2, '相同 id 在不同 openid 下应是两条');
  assert.deepStrictEqual(CM.db.checkins.map(c => c.openid).sort(), ['kidA', 'kidB']);
});
t('资料冲突：云端较新则忽略旧的推送', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', profile: { nickname: '新名', updatedAt: 200 } });
  await sync.main({ action: 'push', profile: { nickname: '旧名', updatedAt: 100 } });
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.profile.nickname, '新名', '较旧的资料不应覆盖云端');
});
t('pull 支持 since 增量，墓碑一并回传', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [
    rec('2026-10-05#habit_sleep', { updatedAt: 100 }),
    rec('2026-10-06#pe_rope', { updatedAt: 300, deleted: true }),
  ] });
  const all = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(all.records.length, 2);
  const inc = await sync.main({ action: 'pull', since: 200 });
  assert.strictEqual(inc.records.length, 1, 'since 应只返回更新的');
  assert.strictEqual(inc.records[0].deleted, true);
});
t('非法记录（缺 id/date/taskId）被跳过而非写脏数据', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [null, {}, { id: 'x' }, { id: 'x', date: '2026-10-05' }] });
  assert.strictEqual(CM.db.checkins.length, 0);
});
t('未知 action 返回错误', async () => {
  reset();
  CM.setOpenid('kid1');
  const r = await CM.load('sync').main({ action: 'drop-table' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'unknown action');
});

console.log('— 提醒订阅 remind —');
t('grant 累加配额且上限 3；status 如实回报', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const remind = CM.load('remind');
  await remind.main({ action: 'grant', n: 2, hour: 20 });
  let s = await remind.main({ action: 'status' });
  assert.strictEqual(s.enabled, true);
  assert.strictEqual(s.quota, 2);
  assert.strictEqual(s.hour, 20);
  await remind.main({ action: 'grant', n: 3 });   // 2+3 → 封顶 3
  s = await remind.main({ action: 'status' });
  assert.strictEqual(s.quota, 3, '配额应封顶 3');
});
t('hour 被钳制在 6-22，n 被钳制在 1-3', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const remind = CM.load('remind');
  await remind.main({ action: 'grant', n: 99, hour: 99 });
  const s = await remind.main({ action: 'status' });
  assert.strictEqual(s.quota, 3);
  assert.strictEqual(s.hour, 22);
  await remind.main({ action: 'grant', n: 0, hour: -5 });
  const s2 = await remind.main({ action: 'status' });
  assert.strictEqual(s2.hour, 6, 'hour 应钳到下限 6');
});
t('disable 关闭提醒并清零配额', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const remind = CM.load('remind');
  await remind.main({ action: 'grant', n: 2 });
  await remind.main({ action: 'disable' });
  const s = await remind.main({ action: 'status' });
  assert.strictEqual(s.enabled, false);
  assert.strictEqual(s.quota, 0);
});
t('未建档用户 grant 时报错而非静默丢失', async () => {
  reset();
  CM.setOpenid('ghost');
  const r = await CM.load('remind').main({ action: 'grant', n: 1 });
  assert.strictEqual(r.ok, false);
});

console.log('— 家人绑定 family —');
t('孩子创建邀请码幂等；家长凭码加入', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const c1 = await family.main({ action: 'create' });
  assert.strictEqual(c1.ok, true);
  assert.strictEqual(c1.code.length, 6);
  const c2 = await family.main({ action: 'create' });
  assert.strictEqual(c2.code, c1.code, '重复创建应返回同一邀请码');

  CM.setOpenid('parent1');
  const j = await family.main({ action: 'join', code: c1.code });
  assert.strictEqual(j.ok, true);
  assert.strictEqual(CM.db.families[0].members.length, 1);
  await family.main({ action: 'join', code: c1.code }); // 重复加入
  assert.strictEqual(CM.db.families[0].members.length, 1, '重复加入不应重复添加');
});
t('不能绑定自己；不存在的码被拒绝', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  const self = await family.main({ action: 'join', code });
  assert.strictEqual(self.ok, false, '不应允许绑定自己');
  const nope = await family.main({ action: 'join', code: 'ZZZZZZ' });
  assert.strictEqual(nope.ok, false);
  const empty = await family.main({ action: 'join', code: '  ' });
  assert.strictEqual(empty.ok, false);
});
t('summary 只返回 owner 的数据；未绑定者被拒', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  // 孩子打卡
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [rec('2026-10-05#pe_rope')], profile: { nickname: '小豆', grade: 3, updatedAt: 100 } });

  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  const s = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(s.ok, true);
  assert.strictEqual(s.records.length, 1);
  assert.strictEqual(s.profile.nickname, '小豆');
  assert.strictEqual(CM.db.checkins[0].openid, 'kid1');

  CM.setOpenid('stranger');
  const denied = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(denied.ok, false, '未绑定者不应拿到孩子数据');
});
t('leave 移除家长成员；孩子端 leave 不影响家庭', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  await family.main({ action: 'leave' });
  assert.strictEqual(CM.db.families[0].members.length, 0);
  // 孩子调用 leave 不应解散家庭
  CM.setOpenid('kid1');
  await family.main({ action: 'leave' });
  assert(CM.db.families[0].ownerOpenid === 'kid1', '孩子不应能解散家庭');
});
t('notify 消耗家长配额；43101 时清零', async () => {
  reset();
  CM.setConfig('family', { NOTIFY_TEMPLATE_ID: 'tmpl-notify-test' });
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  await family.main({ action: 'grantParentSub', n: 2 });
  assert.strictEqual(CM.db.families[0].members[0].parentSubQuota, 2);

  CM.setOpenid('kid1');
  const sent = await family.main({ action: 'notify', title: '达成', body: '勋章' });
  assert.strictEqual(sent.sent, 1, '应发送一条');
  assert.strictEqual(CM.sent[0].touser, 'parent1', '应发给家长');
  assert.strictEqual(CM.sent[0].templateId, 'tmpl-notify-test');
  assert.strictEqual(CM.db.families[0].members[0].parentSubQuota, 1, '发送后扣减配额');

  // 模拟订阅失效（43101）：配额清零且不计入 sent
  CM.setSendImpl(() => { throw Object.assign(new Error('fail'), { errCode: 43101 }); });
  const failed = await family.main({ action: 'notify', title: 'x', body: 'y' });
  assert.strictEqual(failed.sent, 0);
  assert.strictEqual(CM.db.families[0].members[0].parentSubQuota, 0, '43101 应清零配额');
});
t('notify：模板未配置时静默跳过（不发消息也不报错）', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  await family.main({ action: 'grantParentSub', n: 1 });
  CM.setOpenid('kid1');
  const r = await family.main({ action: 'notify', title: 'x', body: 'y' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(CM.sent.length, 0);
  assert.strictEqual(CM.db.families[0].members[0].parentSubQuota, 1, '未发送不应扣配额');
});
t('家长端不能给自己开配额；未绑定不能 notify', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  const self = await family.main({ action: 'grantParentSub', n: 1 });
  assert.strictEqual(self.ok, false, '孩子(owner)不能开家长配额');
  CM.setOpenid('lonely');
  const n = await family.main({ action: 'notify', title: 'x', body: 'y' });
  assert.strictEqual(n.sent, 0, '未绑定家庭 notify 应静默 0');
});

console.log('— 每日提醒定时器 dailyRemind —');
t('仅定时器可触发，非定时调用被拒', async () => {
  reset();
  const r = await CM.load('dailyRemind').main({});
  assert.strictEqual(r.ok, false);
  assert(/timer-only/.test(r.error));
});
t('模板 ID 未配置时安全退出（不发送、不崩溃）', async () => {
  reset();
  CM.db.users.push({ _id: 'u1', openid: 'kid1', remindEnabled: true, remindQuota: 2, profile: { nickname: '小豆', grade: 3 } });
  const r = await CM.load('dailyRemind').main({ Type: 'Timer' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(CM.sent.length, 0, '模板未配置不应发送任何消息');
});
t('未完成任务才提醒：发送成功扣减配额', async () => {
  reset();
  CM.setConfig('dailyRemind', { REMIND_TEMPLATE_ID: 'tmpl-remind-test' });
  const D = require('../utils/date');
  const today = D.todayStr();
  const T = require('../utils/tasks');
  const mustIds = T.generateDailyTasks(3, today).filter(x => x.must).map(x => x.id);
  CM.db.users.push({ _id: 'u1', openid: 'kid1', remindEnabled: true, remindQuota: 2, profile: { nickname: '小豆', grade: 3 } });

  const r = await CM.load('dailyRemind').main({ Type: 'Timer' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sent, 1, '未完成应提醒');
  assert.strictEqual(CM.sent[0].touser, 'kid1');
  assert.strictEqual(CM.sent[0].templateId, 'tmpl-remind-test');
  assert.strictEqual(CM.db.users[0].remindQuota, 1, '发送后配额 -1');

  // 全部任务完成 → 不打扰（云函数判定的是 done >= total，而非仅必做）
  const allIds = T.generateDailyTasks(3, today).map(x => x.id);
  CM.db.checkins.push(...allIds.map((id, i) => ({
    openid: 'kid1', id: today + '#' + id, date: today, taskId: id,
    value: { type: 'done', n: 1 }, stars: 2, updatedAt: 100 + i,
  })));
  const r2 = await CM.load('dailyRemind').main({ Type: 'Timer' });
  assert.strictEqual(r2.sent, 0, '今日已全部完成不应打扰');
  assert.strictEqual(r2.skipped, 1);
});
t('订阅失效 43101：配额清零待重新授权', async () => {
  reset();
  CM.setConfig('dailyRemind', { REMIND_TEMPLATE_ID: 'tmpl-remind-test' });
  CM.db.users.push({ _id: 'u1', openid: 'kid1', remindEnabled: true, remindQuota: 2, profile: { nickname: '小豆', grade: 3 } });
  CM.setSendImpl(() => { throw Object.assign(new Error('fail'), { errCode: 43101 }); });
  const r = await CM.load('dailyRemind').main({ Type: 'Timer' });
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(CM.db.users[0].remindQuota, 0, '43101 应清零配额');
});
t('只提醒开启且有配额的用户', async () => {
  reset();
  CM.setConfig('dailyRemind', { REMIND_TEMPLATE_ID: 'tmpl-remind-test' });
  CM.db.users.push(
    { _id: 'u1', openid: 'off', remindEnabled: false, remindQuota: 3, profile: { nickname: '甲', grade: 3 } },
    { _id: 'u2', openid: 'noquota', remindEnabled: true, remindQuota: 0, profile: { nickname: '乙', grade: 3 } },
    { _id: 'u3', openid: 'ok', remindEnabled: true, remindQuota: 1, profile: { nickname: '丙', grade: 3 } },
  );
  const r = await CM.load('dailyRemind').main({ Type: 'Timer' });
  assert.strictEqual(r.candidates, 1, '仅开启且有配额的用户入选');
  assert.strictEqual(r.sent, 1);
  assert.strictEqual(CM.sent[0].touser, 'ok');
});
t('remind 与 dailyRemind 的模板 ID 契约：两处 config 必须同源', () => {
  const a = require('../cloudfunctions/remind/config.js').REMIND_TEMPLATE_ID;
  const b = require('../cloudfunctions/dailyRemind/config.js').REMIND_TEMPLATE_ID;
  assert(a && b, '两个云函数的 config.js 都必须存在且导出 REMIND_TEMPLATE_ID');
  assert.strictEqual(a, b, 'remind 与 dailyRemind 的模板 ID 不一致会导致订阅成功但发不出提醒');
});
t('dailyRemind 的 config.js 存在（回归：曾缺失导致定时函数部署即崩溃）', () => {
  const fs = require('fs');
  const p = require('path').join(__dirname, '..', 'cloudfunctions', 'dailyRemind', 'config.js');
  assert(fs.existsSync(p), 'dailyRemind/index.js require(\'./config.js\')，文件必须存在');
});

chain.then(() => {
  console.log('\n云函数全部通过：' + passed + ' 项 ✓');
}).catch(e => {
  console.error('\n✗ 云函数测试失败：' + ((e && e.message) || e));
  console.error(e && e.stack);
  process.exit(1);
});