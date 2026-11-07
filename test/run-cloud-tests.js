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
t('安全：订阅配额的授权次数被限制在 1-3，传负数 / 超大数不能把配额改成负数或无限', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1'); await family.main({ action: 'join', code });
  await family.main({ action: 'grantWeekly', n: 100 });
  await family.main({ action: 'grantParentSub', n: -50 });
  const m = CM.db.families[0].members[0];
  assert.deepStrictEqual([m.weeklyQuota, m.parentSubQuota], [3, 1], '100 → 封顶 3；-50 → 至少 1 次');
});
t('性能：同一个云函数实例里，重复登录只检查一次集合（不是每次都 createCollection × 5）', async () => {
  reset();
  CM.setOpenid('kid1');
  const login = CM.load('login');
  await login.main();
  const first = CM.stats.createCollection;
  assert.strictEqual(first, 5);
  await login.main(); await login.main();
  assert.strictEqual(CM.stats.createCollection, first, '热实例不再重复建集合');
});
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
t('补卡标记：push 后 pull 与家长 summary 都保留 makeup / makeupAt', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [rec('2026-10-20#pe_rope', { stars: 1, makeup: true, makeupAt: 555 })] });
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.deepStrictEqual([p.records[0].makeup, p.records[0].makeupAt], [true, 555]);
  const plain = rec('2026-10-21#pe_rope');
  await sync.main({ action: 'push', records: [plain] });
  const p2 = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(p2.records.find(x => x.date === '2026-10-21').makeup, false, '普通记录 makeup 为 false');
  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  const s = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(s.records.find(x => x.date === '2026-10-20').makeup, true, '家长端看到补卡标记');
});
t('安全：push 只存白名单字段，伪造的 openid / _id / 额外字段进不了库；非法记录丢弃；未来时间戳封顶', async () => {
  reset();
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const before = Date.now();
  const r = await CM.load('sync').main({ action: 'push', records: [
    { ...rec('2026-11-05#pe_rope'), openid: 'victim', _id: 'forged', evil: { deep: 1 }, updatedAt: 99999999999999, note: 'x'.repeat(1000) },
    { id: 'bad', date: '2026-11-05', taskId: 'pe_rope' },
    { ...rec('2026-11-05#a b') },
  ] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(CM.db.checkins.length, 1, '非法记录没有入库');
  const d = CM.db.checkins[0];
  assert.strictEqual(d.openid, 'kid1', 'openid 取自调用上下文');
  assert.notStrictEqual(d._id, 'forged');
  assert.strictEqual(d.evil, undefined, '额外字段被丢弃');
  assert.strictEqual(d.note.length, 200);
  assert(d.updatedAt <= Date.now() + 5 * 60 * 1000 + 1000 && d.updatedAt >= before, '未来时间戳封顶到服务器时间附近：' + d.updatedAt);
  // 伪造的"几百年后"最多让这条记录领先 5 分钟，不会永久压住之后的正常编辑
});
t('性能：push 一批记录只用批量查询找已有记录（不是每条一次 get），重复推送幂等、较新的才覆盖', async () => {
  reset();
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const sync = CM.load('sync');
  const days = n => Array.from({ length: n }, (_, i) => rec(new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 5) * 86400000).toISOString().slice(0, 10) + '#t' + (i % 5), { updatedAt: 1000 + i }));
  const batch = days(200);
  CM.stats.gets.checkins = 0;
  await sync.main({ action: 'push', records: batch });
  assert.strictEqual(CM.db.checkins.length, 200);
  assert(CM.stats.gets.checkins <= 3, '200 条只用 ≤3 次查询，实际 ' + CM.stats.gets.checkins);
  CM.stats.gets.checkins = 0;
  await sync.main({ action: 'push', records: batch });
  assert.strictEqual(CM.db.checkins.length, 200, '重复推送不新增');
  // 较新的覆盖、较旧的不覆盖
  const older = { ...batch[0], stars: 1, updatedAt: 500 };
  const newer = { ...batch[1], stars: 1, updatedAt: batch[1].updatedAt + 50 };
  await sync.main({ action: 'push', records: [older, newer] });
  assert.strictEqual(CM.db.checkins.find(c => c.id === batch[0].id).stars, 2, '较旧的不覆盖');
  assert.strictEqual(CM.db.checkins.find(c => c.id === batch[1].id).stars, 1, '较新的覆盖');
});
t('安全：单次 push 超过 500 条整体拒绝、什么都不写；超大的资料 / 练习历史被忽略；无效勋章丢弃且最多 100 枚', async () => {
  reset();
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const sync = CM.load('sync');
  const many = Array.from({ length: 501 }, (_, i) => rec('2026-11-05#t' + i));
  const r = await sync.main({ action: 'push', records: many });
  assert.deepStrictEqual([r.ok, r.error], [false, 'too_many_records']);
  assert.strictEqual(CM.db.checkins.length, 0);
  await sync.main({ action: 'push', profile: { nickname: '小豆', grade: 1, updatedAt: 1 } });
  await sync.main({ action: 'push', profile: { nickname: 'x'.repeat(10000), grade: 1, updatedAt: 2 },
    practice: { drill: [], quiz: [{ subject: 'math', total: 1, correct: 1, at: 1, label: 'y'.repeat(400000) }], review: [] } });
  const u = CM.db.users.find(x => x.openid === 'kid1');
  assert.strictEqual(u.profile.nickname, '小豆', '超大的资料被忽略，保留旧的');
  assert(!u.practice || JSON.stringify(u.practice).length < 1000, '超大练习历史被忽略');
  const badges = [{ id: 'streak_7', earnedAt: 5 }, { id: '../etc', earnedAt: 1 }, { id: 'a'.repeat(80) }, null].concat(Array.from({ length: 150 }, (_, i) => ({ id: 'b' + i, earnedAt: i })));
  await sync.main({ action: 'push', badges });
  const stored = CM.db.badges.map(b => b.id);
  assert(stored.includes('streak_7') && !stored.includes('../etc'), JSON.stringify(stored.slice(0, 3)));
  assert.strictEqual(stored.length, 100, '最多 100 枚');
});
t('安全：邀请码猜错 5 次后 15 分钟内不能再试（连正确的也拒绝），过了窗口恢复，成功后清零', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('guesser'); await CM.load('login').main({});
  for (let i = 0; i < 5; i++) {
    const w = await family.main({ action: 'join', code: 'AAAAA' + i });
    assert.strictEqual(w.error, '邀请码不存在');
  }
  const blocked = await family.main({ action: 'join', code });
  assert.strictEqual(blocked.ok, false);
  assert(/太多次/.test(blocked.error), blocked.error);
  assert.strictEqual(CM.db.families[0].members.length, 0, '被限制时没有加入');
  // 窗口过去
  const u = CM.db.users.find(x => x.openid === 'guesser');
  u.joinFail = { n: 5, since: Date.now() - 16 * 60 * 1000 };
  const ok = await family.main({ action: 'join', code });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(CM.db.users.find(x => x.openid === 'guesser').joinFail, undefined, '成功后清零');
});
t('安全：孩子可以更换邀请码并解除全部家长绑定；旧码作废、被移除的家长看不到数据；非孩子不能调用', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const old = (await family.main({ action: 'create' })).code;
  await CM.load('sync').main({ action: 'push', profile: { nickname: '小豆', grade: 1, updatedAt: 1 }, records: [rec('2026-11-05#pe_rope')] });
  CM.setOpenid('parent1'); await family.main({ action: 'join', code: old });
  assert.strictEqual((await family.main({ action: 'summary', since: 0 })).ok, true);
  assert.strictEqual((await family.main({ action: 'resetCode' })).ok, false, '家长不能更换孩子的邀请码');
  CM.setOpenid('kid1');
  const r = await family.main({ action: 'resetCode' });
  assert.strictEqual(r.ok, true);
  assert.notStrictEqual(r.code, old);
  assert.strictEqual(CM.db.families[0].members.length, 0, '所有家长被移除');
  CM.setOpenid('parent1');
  assert.strictEqual((await family.main({ action: 'summary', since: 0 })).ok, false, '被移除的家长拿不到数据');
  assert.strictEqual((await family.main({ action: 'join', code: old })).ok, false, '旧邀请码作废');
  assert.strictEqual((await family.main({ action: 'join', code: r.code })).ok, true, '新邀请码可用');
});
t('布置练习：家长给孩子布置某单元的小卷，孩子拉到列表，做完回报结果，家长 summary 看到结果', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1'); await family.main({ action: 'join', code });
  const a = await family.main({ action: 'assign', subject: 'math', unit: 6 });
  assert.strictEqual(a.ok, true);
  const again = await family.main({ action: 'assign', subject: 'math', unit: 6 });
  assert.strictEqual(again.id, a.id, '同一单元还没做完时重复布置不新增');
  for (const bad of [{ subject: 'art', unit: 1 }, { subject: 'math', unit: 77 }, { subject: 'math', unit: 'x' }]) {
    assert.strictEqual((await family.main({ action: 'assign', ...bad })).ok, false, JSON.stringify(bad));
  }
  CM.setOpenid('kid1');
  assert.strictEqual((await family.main({ action: 'assign', subject: 'math', unit: 5 })).ok, false, '孩子不能给自己布置');
  const list = await family.main({ action: 'assignments' });
  assert.deepStrictEqual(list.assignments.map(x => [x.subject, x.unit, x.label, x.doneAt]), [['math', 6, '数学第6单元', 0]]);
  assert(!JSON.stringify(list).includes('parent1'), '不回传家长 openid');
  const done = await family.main({ action: 'assignDone', id: a.id, total: 10, correct: 999 });
  assert.strictEqual(done.ok, true);
  CM.setOpenid('stranger');
  assert.strictEqual((await family.main({ action: 'assignDone', id: a.id, total: 1, correct: 1 })).ok, false, '外人不能回报');
  CM.setOpenid('parent1');
  const s = await family.main({ action: 'summary', since: 0 });
  const row = s.assignments.find(x => x.id === a.id);
  assert(row.doneAt > 0);
  assert.deepStrictEqual([row.total, row.correct], [10, 10], '答对数不超过题数');
});
t('布置练习：同时最多 10 份没做完的', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  CM.setOpenid('parent1'); await family.main({ action: 'join', code });
  for (let u = 1; u <= 8; u++) assert.strictEqual((await family.main({ action: 'assign', subject: 'chinese', unit: u })).ok, true);
  for (let u = 1; u <= 2; u++) assert.strictEqual((await family.main({ action: 'assign', subject: 'english', unit: u })).ok, true);
  const over = await family.main({ action: 'assign', subject: 'english', unit: 3 });
  assert.deepStrictEqual([over.ok, over.error], [false, '没做完的练习已经有 10 份了，等孩子做完再布置吧']);
});
t('家长 summary 带上孩子的任务覆盖（自定义任务名、目标、冲刺窗口）', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  const overrides = { targets: { pe_rope: 80 }, customs: [{ id: 'custom_p1', name: '练钢琴', emoji: '🎹', type: 'duration', unit: '分钟', target: 20 }], sprintDays: 28, updatedAt: 5 };
  await CM.load('sync').main({ action: 'push', overrides });
  CM.setOpenid('parent1'); await family.main({ action: 'join', code });
  const s = await family.main({ action: 'summary', since: 0 });
  assert.deepStrictEqual(s.overrides.customs[0].name, '练钢琴');
  assert.strictEqual(s.overrides.sprintDays, 28);
});
t('同步用服务端时间戳：离线很久的设备后上传的"旧"记录，另一台设备照样拉得到', async () => {
  reset();
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [rec('2026-11-01#pe_rope', { updatedAt: 5000 })] });
  // 设备 B 拉取，游标推进到服务器写入时间
  const b1 = await sync.main({ action: 'pull', since: 0 });
  assert.strictEqual(b1.records.length, 1);
  const cursor = b1.records[0].serverAt;
  assert(cursor > 0, '记录带服务器写入时间 serverAt');
  // 设备 A 离线时（时钟较早）写的记录，现在才上传：updatedAt 比 B 的游标小得多
  await sync.main({ action: 'push', records: [rec('2026-10-20#pe_rope', { updatedAt: 100 })] });
  const b2 = await sync.main({ action: 'pull', since: cursor });
  assert.deepStrictEqual(b2.records.map(x => x.id), ['2026-10-20#pe_rope'], '按服务器时间拉取，拉得到');
  // 同一批写入的 serverAt 互不相同（游标在截断边界不会因并列跳过记录）
  await sync.main({ action: 'push', records: [rec('2026-11-02#a'), rec('2026-11-02#b'), rec('2026-11-02#c')] });
  const at = CM.db.checkins.filter(d => d.date === '2026-11-02').map(d => d.serverAt);
  assert.strictEqual(new Set(at).size, 3);
});
t('回归：孩子记录超过 1000 条时，家长 summary 仍能拿到最新的（不能只返回最旧的 1000 条）', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  const start = Date.UTC(2026, 0, 1);
  for (let i = 0; i < 2300; i++) { // 约 230 天，每天 10 条
    const date = new Date(start + Math.floor(i / 10) * 86400000).toISOString().slice(0, 10);
    CM.db.checkins.push({ _id: 'c' + i, openid: 'kid1', ...rec(date + '#t' + (i % 10), { updatedAt: 1000 + i }) });
  }
  CM.setOpenid('parent1');
  await family.main({ action: 'join', code });
  const s = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(s.records.length, 2300, '全部返回');
  assert.strictEqual(s.records.reduce((m, r) => (r.date > m ? r.date : m), ''), new Date(start + 229 * 86400000).toISOString().slice(0, 10), '最新一天在里面');
});
t('回归：同一部手机先当孩子（自动建了自己的家庭）再切成家长绑定别人，之后家长动作要落在绑定的家庭上', async () => {
  reset();
  const family = CM.load('family');
  CM.setOpenid('kidA'); await CM.load('login').main({});
  const codeA = (await family.main({ action: 'create' })).code;
  await CM.load('sync').main({ action: 'push', profile: { nickname: '小豆', grade: 1, updatedAt: 1 }, records: [rec('2026-10-20#pe_rope')] });
  CM.setOpenid('dual'); await CM.load('login').main({});
  const mine = (await family.main({ action: 'create' })).code; // 先以孩子身份打开"我的"页：自动建家庭
  assert.notStrictEqual(mine, codeA);
  assert.strictEqual((await family.main({ action: 'join', code: codeA })).ok, true);
  const s = await family.main({ action: 'summary', since: 0 });
  assert.strictEqual(s.code, codeA, 'summary 看的是绑定的孩子，不是自己的空家庭');
  assert.strictEqual(s.records.length, 1);
  const c = await family.main({ action: 'cheer', from: '妈妈', text: '加油' });
  assert.strictEqual(c.ok, true, '能以家长身份留言：' + JSON.stringify(c));
  const mineList = await family.main({ action: 'cheers', as: 'parent' });
  assert.strictEqual(mineList.cheers.length, 1, '家长身份看的是自己发出的留言');
  assert.strictEqual((await family.main({ action: 'grantWeekly', n: 1 })).ok, true);
  await family.main({ action: 'leave' });
  CM.setOpenid('kidA');
  const fam = CM.db.families.find(f => f.code === codeA);
  assert.strictEqual(fam.members.length, 0, '退出绑定移除的是绑定家庭里的自己');
});
t('回归：push 分支曾引用未定义的 openid（同步全挂）', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', records: [rec('2026-11-05#b')] }); // 旧代码在此抛 ReferenceError
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
  // since 是服务器写入时间（serverAt）：同一批按顺序递增
  const firstAt = all.records.find(x => x.id === '2026-10-05#habit_sleep').serverAt;
  const inc = await sync.main({ action: 'pull', since: firstAt });
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
t('周目标：push 按周合并（已达成优先），pull 取回', async () => {
  reset();
  CM.setOpenid('kid1');
  await CM.load('login').main({});
  const sync = CM.load('sync');
  await sync.main({ action: 'push', practice: { goals: { w1: { id: 'a', setAt: 10, achievedAt: 40 } } } });
  await sync.main({ action: 'push', practice: { goals: { w1: { id: 'b', setAt: 99, achievedAt: 0 }, w2: { id: 'c', setAt: 5 } } } });
  const p = await sync.main({ action: 'pull', since: 0 });
  assert.deepStrictEqual([p.practice.goals.w1.id, p.practice.goals.w2.id], ['a', 'c'], '已达成的不被后设置的未达成目标覆盖');
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
t('孩子回复表情：家长在已发出列表看到；回复即已读；可改回复', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1');
  const a = await family.main({ action: 'cheer', from: '妈妈', text: '加油哦' });
  CM.setOpenid('kid1');
  const r1 = await family.main({ action: 'cheerReact', id: a.id, reaction: '❤️' });
  assert.strictEqual(r1.ok, true, JSON.stringify(r1));
  CM.setOpenid('parent1');
  let sent = (await family.main({ action: 'cheers' })).cheers[0];
  assert.strictEqual(sent.reaction, '❤️');
  assert(sent.reactedAt > 0);
  assert(sent.readAt > 0, '回复即已读');
  CM.setOpenid('kid1');
  await family.main({ action: 'cheerReact', id: a.id, reaction: '💪' });
  CM.setOpenid('parent1');
  sent = (await family.main({ action: 'cheers' })).cheers[0];
  assert.strictEqual(sent.reaction, '💪', '可以改回复');
});
t('回复校验：只能用固定表情；只能回复自己收到的；家长不能替孩子回复', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1'); const a = await family.main({ action: 'cheer', from: '妈妈', text: '加油哦' });
  CM.setOpenid('parent2'); const b = await family.main({ action: 'cheer', from: '爸爸', text: '真棒' });
  CM.setOpenid('kid1');
  assert.strictEqual((await family.main({ action: 'cheerReact', id: a.id, reaction: '自由文字' })).ok, false, '非固定表情被拒');
  assert.strictEqual((await family.main({ action: 'cheerReact', id: b.id, reaction: '❤️' })).ok, false, '别家的留言不能回');
  CM.setOpenid('parent1');
  assert.strictEqual((await family.main({ action: 'cheerReact', id: a.id, reaction: '❤️' })).ok, false, '家长不能替孩子回');
  assert(!CM.db.cheers.find(c => c._id === a.id).reaction);
  assert(!CM.db.cheers.find(c => c._id === b.id).reaction);
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
console.log('— 周报推送 weeklyReport —');
t('家长订阅周报：grantWeekly 累加配额（上限 3）；孩子不能订阅', async () => {
  const family = await twoFamilies();
  CM.setOpenid('parent1');
  await family.main({ action: 'grantWeekly', n: 1 });
  await family.main({ action: 'grantWeekly', n: 5 });
  assert.strictEqual(CM.db.families.find(f => f.members.some(m => m.openid === 'parent1')).members[0].weeklyQuota, 3);
  CM.setOpenid('kid1');
  assert.strictEqual((await family.main({ action: 'grantWeekly', n: 1 })).ok, false);
  CM.setOpenid('parent1');
  const conf = await family.main({ action: 'config' });
  assert(conf.weeklyTemplateId, 'config 返回周报模板 ID');
});
t('weeklyReport：只能定时触发；模板未配置时跳过不发', async () => {
  reset();
  const fn = CM.load('weeklyReport');
  assert.strictEqual((await fn.main({})).ok, false, '非定时触发拒绝');
  const r = await fn.main({ Type: 'Timer' });
  assert.strictEqual(r.ok, false);
  assert(/WEEKLY_TEMPLATE_ID/.test(r.error));
  assert.strictEqual(CM.sent.length, 0);
});
t('weeklyReport：给有配额的家长推送孩子上周摘要，扣配额；无配额不发；43101 清零', async () => {
  const family = await twoFamilies();
  CM.setConfig('weeklyReport', { WEEKLY_TEMPLATE_ID: 'tmpl-weekly-test' });
  // kid1 上周（2026-10-19 周）打卡 2 天、本周 1 天
  CM.setOpenid('kid1');
  const sync = CM.load('sync');
  await sync.main({ action: 'push', profile: { nickname: '小豆', grade: 1, updatedAt: 1 },
    records: [rec('2026-10-19#pe_rope'), rec('2026-10-20#pe_rope'), rec('2026-10-26#pe_rope')] });
  CM.setOpenid('parent1'); await family.main({ action: 'grantWeekly', n: 2 });
  // parent2（kid2 家）没有订阅
  const fn = CM.load('weeklyReport');
  const r = await fn.main({ Type: 'Timer', today: '2026-10-26' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.sent, 1);
  const msg = CM.sent[0];
  assert.deepStrictEqual([msg.touser, msg.templateId, msg.page], ['parent1', 'tmpl-weekly-test', 'pages/report/report']);
  assert(msg.data.thing1.value.indexOf('小豆') === 0, msg.data.thing1.value);
  assert(msg.data.thing2.value.indexOf('打卡2天') > -1, '只统计上周：' + msg.data.thing2.value);
  assert(Array.from(msg.data.thing1.value).length <= 20 && Array.from(msg.data.thing2.value).length <= 20);
  const m1 = () => CM.db.families.find(f => f.members.some(m => m.openid === 'parent1')).members[0];
  assert.strictEqual(m1().weeklyQuota, 1, '发送成功扣 1');
  CM.setSendImpl(async () => { throw Object.assign(new Error('unsub'), { errCode: 43101 }); });
  await fn.main({ Type: 'Timer', today: '2026-10-26' });
  assert.strictEqual(m1().weeklyQuota, 0, '43101 清零');
});
t('weeklyReport：孩子上周有薄弱单元时，推送摘要带上「再练…」', async () => {
  const family = await twoFamilies();
  CM.setConfig('weeklyReport', { WEEKLY_TEMPLATE_ID: 'tmpl-weekly-test' });
  CM.setOpenid('kid1');
  const at = new Date('2026-10-21T02:00:00Z').getTime(); // 北京时间 10-21 10:00
  await CM.load('sync').main({ action: 'push', profile: { nickname: '小豆', grade: 1, updatedAt: 1 },
    records: [rec('2026-10-19#pe_rope')],
    practice: { drill: [], quiz: [{ subject: 'math', total: 5, correct: 2, label: '继续加油', at, units: [{ unit: 6, total: 5, correct: 2 }] }], review: [] } });
  CM.setOpenid('parent1'); await family.main({ action: 'grantWeekly', n: 1 });
  const r = await CM.load('weeklyReport').main({ Type: 'Timer', today: '2026-10-26' });
  assert.strictEqual(r.sent, 1);
  const text = CM.sent[0].data.thing2.value;
  assert(text.indexOf('再练数学第6单元') > -1, text);
  assert(Array.from(text).length <= 20, text);
});
t('周报模板 ID 契约：family 与 weeklyReport 两处 config 必须同源', () => {
  const famConf = require('../cloudfunctions/family/config.js');
  const wkConf = require('../cloudfunctions/weeklyReport/config.js');
  assert.strictEqual(famConf.WEEKLY_TEMPLATE_ID, wkConf.WEEKLY_TEMPLATE_ID);
  const trig = require('../cloudfunctions/weeklyReport/config.json').triggers[0];
  assert.strictEqual(trig.config, '0 0 8 * * 1 *', '每周一 08:00');
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
t('回归：绑定两位家长时，notify 每人各扣 1 次配额（后一次回写不能覆盖前一位的扣减）', async () => {
  reset();
  CM.setConfig('family', { NOTIFY_TEMPLATE_ID: 'tmpl-notify-test' });
  const family = CM.load('family');
  CM.setOpenid('kid1'); await CM.load('login').main({});
  const code = (await family.main({ action: 'create' })).code;
  for (const p of ['parentA', 'parentB']) {
    CM.setOpenid(p);
    await family.main({ action: 'join', code });
    await family.main({ action: 'grantParentSub', n: 2 });
  }
  CM.setOpenid('kid1');
  const r = await family.main({ action: 'notify', title: '达成', body: '勋章' });
  assert.strictEqual(r.sent, 2);
  const quotas = CM.db.families[0].members.map(m => [m.openid, m.parentSubQuota]);
  assert.deepStrictEqual(quotas, [['parentA', 1], ['parentB', 1]]);
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