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
t('任务覆盖：push 存入 users.taskOverrides，pull 回传；云端较旧忽略', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  // 家长手机（同一账号在家长设备上登录的场景）推 500
  await sync.main({ action: 'push', overrides: { targets: { pe_rope: 500 }, customs: [], updatedAt: 200 } });
  let p = await sync.main({ action: 'pull', since: 0 });
  assert(p.overrides, 'pull 应回传 taskOverrides');
  assert.strictEqual(p.overrides.targets.pe_rope, 500);
  // 较旧的覆盖（updatedAt 更小）不应覆盖云端
  await sync.main({ action: 'push', overrides: { targets: { pe_rope: 300 }, customs: [], updatedAt: 100 } });
  p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.overrides.targets.pe_rope, 500, '较旧的覆盖不应覆盖云端');
  // 较新的覆盖生效
  await sync.main({ action: 'push', overrides: { targets: { pe_rope: 700 }, customs: [], updatedAt: 300 } });
  p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.overrides.targets.pe_rope, 700);
  // 未推送过覆盖的用户 pull 得 null（而非报错）
  CM.setOpenid('kid2');
  await CM.load('login').main({});
  p = await CM.load('sync').main({ action: 'pull', since: 0 });
  assert.strictEqual(p.overrides, null);
});
t('serverTime 随 push/pull 返回（时钟漂移封顶依据）', async () => {
  reset();
  CM.setOpenid('kid1');
  const sync = CM.load('sync');
  const rp = await sync.main({ action: 'push', records: [] });
  assert(typeof rp.serverTime === 'number' && rp.serverTime > 0, 'push 应返回 serverTime');
  const rl = await sync.main({ action: 'pull', since: 0 });
  assert(typeof rl.serverTime === 'number' && rl.serverTime > 0, 'pull 应返回 serverTime');
});
t('奖励小铺：push 存 users.shop，pull 回传；较旧忽略', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  const shop = {
    rewards: [{ id: 'r-1', name: '小零食', emoji: '🍬', cost: 10 }],
    redemptions: [{ id: 'rd-1', rewardId: 'r-1', name: '小零食', emoji: '🍬', cost: 10, at: 100 }],
    updatedAt: 200,
  };
  await sync.main({ action: 'push', shop });
  let p = await sync.main({ action: 'pull', since: 0 });
  assert(p.shop, 'pull 应回传 shop');
  assert.strictEqual(p.shop.rewards.length, 1);
  assert.strictEqual(p.shop.redemptions.length, 1);
  // 较旧的 shop 不覆盖云端
  await sync.main({ action: 'push', shop: { ...shop, rewards: [], redemptions: [], updatedAt: 100 } });
  p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.shop.rewards.length, 1, '较旧的 shop 不应覆盖云端');
  // 较新的 shop 生效
  await sync.main({ action: 'push', shop: { ...shop, updatedAt: 300, rewards: shop.rewards.concat([{ id: 'r-2', name: '动画', emoji: '📺', cost: 20 }]) } });
  p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.shop.rewards.length, 2);
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

t('练习记录：push 按 at 并集合并入 users.practice，pull 取回，并按上限截断', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  // 设备 A
  await sync.main({ action: 'push', practice: { drill: [{ at: 100, correct: 8 }], quiz: [{ at: 150 }] } });
  // 设备 B（含一条重复 + 一条新的）：不应覆盖 A 的记录
  await sync.main({ action: 'push', practice: { drill: [{ at: 100, correct: 8 }, { at: 300, correct: 10 }], quiz: [] } });
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.deepStrictEqual(p.practice.drill.map(x => x.at), [300, 100], '并集去重、最新在前');
  assert.strictEqual(p.practice.quiz.length, 1, '另一台设备没带的小卷记录不丢');

  // 上限：口算最多 100 条
  const many = Array.from({ length: 120 }, (_, i) => ({ at: 1000 + i }));
  await sync.main({ action: 'push', practice: { drill: many, quiz: [] } });
  const p2 = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p2.practice.drill.length, 100);
  assert.strictEqual(p2.practice.drill[0].at, 1119, '保留最新');
});
t('复习日志：push 按日期合并（同日取次数多的），pull 取回', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', practice: { drill: [], quiz: [], review: [{ date: '2026-10-05', total: 5, correct: 5 }] } });
  await sync.main({ action: 'push', practice: { review: [{ date: '2026-10-05', total: 3, correct: 1 }, { date: '2026-10-06', total: 5, correct: 4 }] } });
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.deepStrictEqual(p.practice.review.map(x => [x.date, x.total]), [['2026-10-06', 5], ['2026-10-05', 5]]);
});
t('错题本：push 云端较旧才覆盖，pull 取回；家长 summary 返回孩子错题本', async () => {
  reset();
  const family = CM.load('family');
  const sync = CM.load('sync');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  await sync.main({ action: 'push', wrong: { math: [{ key: 'a' }, { key: 'b' }], quiz: [], updatedAt: 200 } });
  await sync.main({ action: 'push', wrong: { math: [], quiz: [], updatedAt: 100 } }); // 旧数据不覆盖
  let p = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p.wrong.math.length, 2, '旧时间戳不应覆盖');
  await sync.main({ action: 'push', wrong: { math: [{ key: 'b' }], quiz: [], updatedAt: 300 } }); // 销账一题
  p = await sync.main({ action: 'pull', since: 0 });
  assert.deepStrictEqual(p.wrong.math.map(x => x.key), ['b'], '新数据整体替换（数组不残留旧元素）');

  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  const s = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(s.wrongBook.math.length, 1, '家长拿到孩子错题本');
});
t('reset：清空调用者云端数据（记录/勋章/资料/覆盖/小铺/练习/错题本），保留档案、提醒设置与家人绑定，不碰别人', async () => {
  reset();
  const family = CM.load('family');
  const sync = CM.load('sync');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  await sync.main({
    action: 'push',
    records: [rec('2026-10-05#pe_rope'), rec('2026-10-06#pe_rope')],
    profile: { nickname: '小豆', updatedAt: 100 },
    badges: [{ id: 'first_checkin', earnedAt: 100 }],
    overrides: { targets: { pe_rope: 50 }, customs: [], updatedAt: 100 },
    shop: { rewards: [{ id: 'r' }], redemptions: [], updatedAt: 100 },
    practice: { drill: [{ at: 1 }], quiz: [], review: [{ date: '2026-10-05', total: 5, correct: 5 }] },
    wrong: { math: [{ key: 'a' }], quiz: [], updatedAt: 100 },
  });
  CM.db.users.find(u => u.openid === 'kid1').remindEnabled = true;
  CM.setOpenid('kid2');
  await CM.load('login').main({});
  await sync.main({ action: 'push', records: [rec('2026-10-05#pe_rope')], badges: [{ id: 'first_checkin', earnedAt: 1 }] });
  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });

  CM.setOpenid('kid1');
  const r = await sync.main({ action: 'reset' });
  assert.strictEqual(r.ok, true);
  assert(r.serverTime > 0);
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.deepStrictEqual([p.records.length, p.badges.length], [0, 0], '记录与勋章删除');
  assert.deepStrictEqual([p.profile, p.overrides, p.shop, p.practice, p.wrong], [null, null, null, null, null], '同步字段清空');
  const u = CM.db.users.find(x => x.openid === 'kid1');
  assert(u, '保留用户档案（openid / 提醒订阅）');
  assert.strictEqual(u.remindEnabled, true, '提醒设置不属于打卡数据，保留');
  assert.strictEqual(CM.db.checkins.filter(c => c.openid === 'kid2').length, 1, '不碰别人的记录');
  assert.strictEqual(CM.db.badges.filter(b => b.openid === 'kid2').length, 1, '不碰别人的勋章');
  assert.strictEqual(CM.db.families[0].members.length, 1, '家人绑定保留：家长继续看到孩子重新开始后的数据');

  // 重置后可以正常重新开始
  await sync.main({ action: 'push', records: [rec('2026-10-07#pe_rope', { updatedAt: 300 })] });
  assert.strictEqual((await sync.main({ action: 'pull', since: 0 })).records.length, 1);
});
t('reset：无 openid 拒绝', async () => {
  reset();
  CM.setOpenid('');
  const r = await CM.load('sync').main({ action: 'reset' });
  assert.strictEqual(r.ok, false);
});
t('练习记录 openid 隔离：B 拉不到 A 的练习', async () => {
  reset();
  const sync = CM.load('sync');
  CM.setOpenid('kidA');
  await CM.load('login').main({});
  await sync.main({ action: 'push', practice: { drill: [{ at: 1 }], quiz: [] } });
  CM.setOpenid('kidB');
  await CM.load('login').main({});
  const pb = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(pb.practice, null, 'B 不应看到 A 的练习记录');
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
t('summary 返回孩子的练习记录（口算会话 + 小卷历史）', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  await CM.load('sync').main({
    action: 'push',
    practice: { drill: [{ level: 'addsub10', total: 10, correct: 8, at: 100 }], quiz: [{ subject: 'math', total: 10, correct: 9, at: 200 }] },
  });

  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  const s = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(s.practice.drill.length, 1, '家长应拿到孩子口算会话');
  assert.strictEqual(s.practice.quiz.length, 1, '家长应拿到孩子小卷历史');
});
// 家庭：kid1 创建，parent1 加入；kid2/parent2 另一家
async function twoFamilies() {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const c1 = (await family.main({ action: 'create' })).code;
  CM.setOpenid('kid2'); await CM.load('login').main({});
  const c2 = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1'); await family.main({ action: 'join', code: c1 });
  CM.setOpenid('parent2'); await family.main({ action: 'join', code: c2 });
  return family;
}
console.log('— 家长鼓励留言 cheer —');
t('家长留言 → 孩子收到（未读）；家长看到自己发出的；别的家庭互不可见', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1');
  const s = await family.main({ action: 'cheer', from: '妈妈', text: '今天跳绳真棒！', recordId: '2026-10-05#pe_rope', recordLabel: '跳绳' });
  assert.strictEqual(s.ok, true, JSON.stringify(s));
  assert(s.id);
  CM.setOpenid('kid1');
  const got = await family.main({ action: 'cheers' });
  assert.strictEqual(got.ok, true);
  assert.strictEqual(got.cheers.length, 1);
  assert.deepStrictEqual(
    [got.cheers[0].from, got.cheers[0].text, got.cheers[0].recordLabel, got.cheers[0].readAt],
    ['妈妈', '今天跳绳真棒！', '跳绳', 0]);
  assert.strictEqual(got.cheers[0].fromOpenid, undefined, '不回传对方 openid');
  CM.setOpenid('parent1');
  assert.strictEqual((await family.main({ action: 'cheers' })).cheers.length, 1, '家长看到自己发出的');
  CM.setOpenid('kid2');
  assert.strictEqual((await family.main({ action: 'cheers' })).cheers.length, 0, '别家孩子收不到');
  CM.setOpenid('parent2');
  assert.strictEqual((await family.main({ action: 'cheers' })).cheers.length, 0, '别家家长看不到');
});
t('只有绑定的家长能留言：孩子自己、未绑定者被拒', async () => {
  const family = await twoFamilies();
  CM.setOpenid('kid1');
  assert.strictEqual((await family.main({ action: 'cheer', from: '妈妈', text: '加油' })).ok, false, '孩子不能给自己留言');
  CM.setOpenid('stranger');
  assert.strictEqual((await family.main({ action: 'cheer', from: '妈妈', text: '加油' })).ok, false, '未绑定者被拒');
  assert.strictEqual(CM.db.cheers ? CM.db.cheers.length : 0, 0);
});
t('校验：空/超长内容、非法称呼、超长关联标签被拒；内容去首尾空白', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1');
  for (const bad of [
    { from: '妈妈', text: '   ' },
    { from: '妈妈', text: '好'.repeat(41) },
    { from: '隔壁老王', text: '加油' },
    { from: '妈妈', text: '加油', recordLabel: '长'.repeat(21) },
  ]) {
    assert.strictEqual((await family.main({ action: 'cheer', ...bad })).ok, false, JSON.stringify(bad));
  }
  const ok = await family.main({ action: 'cheer', from: '爸爸', text: '  ' + '好'.repeat(40) + '  ' });
  assert.strictEqual(ok.ok, true, '40 字以内可发');
  CM.setOpenid('kid1');
  assert.strictEqual((await family.main({ action: 'cheers' })).cheers[0].text, '好'.repeat(40));
});
t('内容安全：自定义文字送审，常用语免审；风险或审核不可用时拒绝', async () => {
  const family = await twoFamilies();
  const CHEER = require('../utils/cheer');
  CM.setOpenid('parent1');
  await family.main({ action: 'cheer', from: '妈妈', text: CHEER.PRESETS[0] });
  assert.strictEqual(CM.secChecks.length, 0, '常用语不送审');
  await family.main({ action: 'cheer', from: '妈妈', text: '周末带你去公园' });
  assert.strictEqual(CM.secChecks.length, 1, '自定义文字送审');
  assert.deepStrictEqual([CM.secChecks[0].openid, CM.secChecks[0].scene, CM.secChecks[0].version, CM.secChecks[0].content], ['parent1', 2, 2, '周末带你去公园']);
  CM.setSecImpl(async () => ({ errCode: 0, result: { suggest: 'risky', label: 20001 } }));
  const risky = await family.main({ action: 'cheer', from: '妈妈', text: '某些不合适的话' });
  assert.strictEqual(risky.ok, false);
  CM.setSecImpl(async () => { throw Object.assign(new Error('api unauthorized'), { errCode: -604101 }); });
  const down = await family.main({ action: 'cheer', from: '妈妈', text: '审核挂了时的自定义话' });
  assert.strictEqual(down.ok, false, '审核不可用时宁可拒绝（读者是孩子）');
  assert.strictEqual(CM.db.cheers.length, 2, '只落库通过的两条');
});
t('防刷：同一家长 24 小时内最多 10 条', async () => {
  const family = await twoFamilies();
  const CHEER = require('../utils/cheer');
  CM.setOpenid('parent1');
  for (let i = 0; i < CHEER.DAILY_LIMIT; i++) {
    assert.strictEqual((await family.main({ action: 'cheer', from: '妈妈', text: CHEER.PRESETS[i % CHEER.PRESETS.length] })).ok, true);
  }
  const over = await family.main({ action: 'cheer', from: '妈妈', text: CHEER.PRESETS[0] });
  assert.strictEqual(over.ok, false);
  CM.db.cheers.forEach(c => { c.createdAt -= 25 * 3600 * 1000; }); // 一天后
  assert.strictEqual((await family.main({ action: 'cheer', from: '妈妈', text: CHEER.PRESETS[0] })).ok, true, '窗口过后恢复');
});
t('孩子标记已读：只能标自己的', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1'); const a = await family.main({ action: 'cheer', from: '妈妈', text: '加油哦' });
  CM.setOpenid('parent2'); const b = await family.main({ action: 'cheer', from: '爸爸', text: '真棒' });
  CM.setOpenid('kid1');
  const r = await family.main({ action: 'cheerRead', ids: [a.id, b.id] });
  assert.strictEqual(r.ok, true);
  assert(CM.db.cheers.find(c => c._id === a.id).readAt > 0, '自己的标记已读');
  assert.strictEqual(CM.db.cheers.find(c => c._id === b.id).readAt, 0, '别人的不受影响');
  CM.setOpenid('parent1');
  await family.main({ action: 'cheerRead', ids: [a.id] });
  assert.strictEqual(CM.db.cheers.find(c => c._id === a.id).readAt > 0, true);
});
t('一键清空（sync reset）删除孩子收到的留言', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1'); await family.main({ action: 'cheer', from: '妈妈', text: '加油哦' });
  CM.setOpenid('parent2'); await family.main({ action: 'cheer', from: '爸爸', text: '真棒' });
  CM.setOpenid('kid1');
  await CM.load('sync').main({ action: 'reset' });
  assert.deepStrictEqual(CM.db.cheers.map(c => c.ownerOpenid), ['kid2'], '只删 kid1 收到的');
});
t('login 自愈创建 cheers 集合', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  assert(Array.isArray(CM.db.cheers));
});
t('family lib：cheer.js 与 utils/ 一致', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const lib = path.join(root, 'cloudfunctions/family/lib/cheer.js');
  assert(fs.existsSync(lib), '应由 scripts/sync-cloud-libs.js 复制');
  assert.strictEqual(fs.readFileSync(lib, 'utf8'), fs.readFileSync(path.join(root, 'utils/cheer.js'), 'utf8'));
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
t('dailyRemind 注入家长覆盖：自定义任务计入完成判定', async () => {
  reset();
  CM.setConfig('dailyRemind', { REMIND_TEMPLATE_ID: 'tmpl-remind-test' });
  const D = require('../utils/date');
  const T = require('../utils/tasks');
  const today = D.todayStr();
  // 孩子已完成全部默认任务
  const allIds = T.generateDailyTasks(3, today).map(x => x.id);
  CM.db.users.push({
    _id: 'u1', openid: 'kid1', remindEnabled: true, remindQuota: 2,
    profile: { nickname: '小豆', grade: 3 },
    // 家长加了自定义任务"练琴"（未打卡）
    taskOverrides: { targets: {}, customs: [{ id: 'custom_piano', section: 'fun', name: '练琴', emoji: '🎹', type: 'duration', unit: '分钟', target: 20, desc: '自定义任务' }], updatedAt: 100 },
  });
  CM.db.checkins.push(...allIds.map((id, i) => ({
    openid: 'kid1', id: today + '#' + id, date: today, taskId: id,
    value: { type: 'done', n: 1 }, stars: 2, updatedAt: 100 + i,
  })));
  const r = await CM.load('dailyRemind').main({ Type: 'Timer' });
  assert.strictEqual(r.sent, 1, '默认任务全完成但自定义任务未打 → 仍应提醒');
  assert(/1 项/.test(CM.sent[0].data.thing2.value), '剩余数应为 1（自定义任务计入）');
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