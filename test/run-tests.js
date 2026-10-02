// 单元测试：node test/run-tests.js
// 无框架依赖，Node 直接运行；store 在 Node 下自动使用内存后端。
const assert = require('assert');
const store = require('../utils/store');
const T = require('../utils/tasks');
const C = require('../utils/checkin');
const B = require('../utils/badges');
const D = require('../utils/date');

let passed = 0;
// 串行执行（异步用例共享内存 store，不能并发）
let chain = Promise.resolve();
function t(name, fn) {
  chain = chain.then(() => {
    const r = fn();
    return Promise.resolve(r).then(() => { passed++; console.log('  ✓ ' + name); });
  });
}

function reset() { store.clearAll(); }

// 按某天生成清单，把指定任务全部打卡（默认给 2 星）
function seedDay(date, grade, taskIds, stars) {
  const tasks = T.generateDailyTasks(grade, date);
  taskIds.forEach(id => {
    const task = tasks.find(x => x.id === id);
    assert(task, '任务 ' + id + ' 应存在于 ' + date + ' 的清单中');
    C.upsertRecord(date, id, task.type === 'done' ? 1 : task.target, stars || 2, '');
  });
}
const mustIds = date => grade => T.generateDailyTasks(grade, date).filter(x => x.must).map(x => x.id);

console.log('— 日期工具 —');
t('2026-10-05 是周一，2026-10-10 是周六', () => {
  assert.strictEqual(D.dayOfWeek('2026-10-05'), 1);
  assert.strictEqual(D.dayOfWeek('2026-10-10'), 6);
});
t('跨月加一天 / 周一对齐', () => {
  assert.strictEqual(D.addDays('2026-09-30', 1), '2026-10-01');
  assert.strictEqual(D.mondayOf('2026-10-10'), '2026-10-05');
  assert.strictEqual(D.mondayOf('2026-10-04'), '2026-09-28'); // 周日归前一周
});

console.log('— 任务生成 —');
t('三年级上学日：4 项必做，周一含古诗，不含练字', () => {
  const ts = T.generateDailyTasks(3, '2026-10-05');
  const must = ts.filter(x => x.must);
  assert.strictEqual(must.length, 4);
  ['chinese_read', 'math_calc', 'english_listen', 'pe_rope', 'chinese_poem']
    .forEach(id => assert(ts.find(x => x.id === id), '应包含 ' + id));
  assert(!ts.find(x => x.id === 'chinese_write'), '周一不应有练字');
  const ids = ts.map(x => x.id);
  assert.strictEqual(new Set(ids).size, ids.length, '任务 id 不应重复');
});
t('生成是确定性的（同年级同日期结果一致）', () => {
  const a = JSON.stringify(T.generateDailyTasks(3, '2026-10-05'));
  const b = JSON.stringify(T.generateDailyTasks(3, '2026-10-05'));
  assert.strictEqual(a, b);
});
t('三年级周六：户外必做，含知识梳理与桌游', () => {
  const ts = T.generateDailyTasks(3, '2026-10-10');
  assert(ts.find(x => x.id === 'pe_outdoor').must, '周末户外应必做');
  assert(ts.find(x => x.id === 'math_review'), '周六应有知识梳理');
  assert(ts.find(x => x.id === 'fun_board'));
});
t('五年级：口算 50 题、跳绳 400 个', () => {
  const ts = T.generateDailyTasks(5, '2026-10-05');
  assert.strictEqual(ts.find(x => x.id === 'math_calc').target, 50);
  assert.strictEqual(ts.find(x => x.id === 'pe_rope').target, 400);
});
t('一年级：无思维题，周二有练字，屏幕任务需家长确认', () => {
  const ts = T.generateDailyTasks(1, '2026-10-06'); // 周二
  assert(!ts.find(x => x.id === 'math_think'));
  assert(ts.find(x => x.id === 'chinese_write'));
  assert.strictEqual(ts.find(x => x.id === 'fun_screen').parentConfirm, true);
});

console.log('— 打卡与统计 —');
t('打卡幂等：同日同任务覆盖为一条记录', () => {
  reset();
  C.upsertRecord('2026-10-05', 'math_calc', 30, 3, '');
  C.upsertRecord('2026-10-05', 'math_calc', 28, 2, '');
  const day = C.getDayRecords('2026-10-05');
  assert.strictEqual(day.length, 1);
  assert.strictEqual(day[0].value.n, 28);
  assert.strictEqual(day[0].stars, 2);
});
t('完成度：完成全部必做 → allMustDone', () => {
  reset();
  seedDay('2026-10-05', 3, mustIds('2026-10-05')(3), 2);
  const comp = C.dayCompletion(T.generateDailyTasks(3, '2026-10-05'), C.getDayRecords('2026-10-05'));
  assert.strictEqual(comp.mustDone, comp.mustTotal);
  assert.strictEqual(comp.allMustDone, true);
});
t('总星星 = 任务星 + 全必做加成 1 星', () => {
  reset();
  // 4 项必做分别 3/2/1/2 星 = 8，加成 1 → 9
  const must = T.generateDailyTasks(3, '2026-10-05').filter(x => x.must);
  const stars = [3, 2, 1, 2];
  must.forEach((task, i) => C.upsertRecord('2026-10-05', task.id, task.target, stars[i], ''));
  assert.strictEqual(C.totalStars(store.getRecords(), 3), 9);
});
t('总星星计入勋章奖励：百日挑战王 +50 应体现在总数', () => {
  reset();
  C.upsertRecord('2026-10-05', 'habit_sleep', 1, 2, '');
  const base = C.totalStars(store.getRecords(), 3);
  const withBadge = C.totalStars(store.getRecords(), 3, [{ id: 'streak_100', earnedAt: 1 }]);
  assert.strictEqual(withBadge - base, 50, '勋章奖励星应计入总星数');
  // 未知/未配置的勋章 id 不应报错也不加星
  assert.strictEqual(C.totalStars(store.getRecords(), 3, [{ id: 'no_such_badge' }]), base);
  // bonus 表与 BADGE_DEFS 的 bonus 字段一致（防两处失配）
  B.BADGE_DEFS.forEach(d => assert.strictEqual(d.bonus, C.BADGE_BONUS[d.id] || 0, d.id + ' 的 bonus 应与计算表一致'));
});
t('勋章奖励计入后称号门槛随之推进', () => {
  reset();
  for (let i = 0; i < 3; i++) C.upsertRecord(D.addDays('2026-10-05', i), 'habit_sleep', 1, 2, '');
  assert.strictEqual(B.rankInfo(C.totalStars(store.getRecords(), 3)).name, '见习小达人');
  // 6 星打卡 + 百日挑战王 50 + 月度坚持王 20 = 76 → 越过铜星门槛 50
  const boosted = [{ id: 'streak_100' }, { id: 'streak_30' }];
  assert.strictEqual(B.rankInfo(C.totalStars(store.getRecords(), 3, boosted)).name, '铜星小达人');
});
t('连击：5 天连续，中间断一天后重计', () => {
  reset();
  for (let i = 0; i < 5; i++) C.upsertRecord(D.addDays('2026-10-01', i), 'habit_sleep', 1, 2, '');
  let s = C.streaks(store.getRecords(), '2026-10-05');
  assert.strictEqual(s.current, 5); assert.strictEqual(s.best, 5);
  store.saveRecords(store.getRecords().filter(r => r.date !== '2026-10-03'));
  s = C.streaks(store.getRecords(), '2026-10-05');
  assert.strictEqual(s.current, 2); assert.strictEqual(s.best, 2);
});
t('今天还没打卡不打断连击', () => {
  reset();
  C.upsertRecord('2026-10-04', 'habit_sleep', 1, 2, '');
  C.upsertRecord('2026-10-05', 'habit_sleep', 1, 2, '');
  const s = C.streaks(store.getRecords(), '2026-10-06'); // 10-06 未打卡
  assert.strictEqual(s.current, 2);
});
t('周统计与月历', () => {
  reset();
  seedDay('2026-10-05', 3, mustIds('2026-10-05')(3), 2);
  const w = C.weeklyStats(store.getRecords(), 3, '2026-10-05');
  assert.strictEqual(w.days, 1); assert.strictEqual(w.achieved, 1); assert.strictEqual(w.stars, 8);
  const m = C.monthStats(2026, 10, store.getRecords(), 3);
  assert.strictEqual(m.cells.length, 31);
  assert.strictEqual(m.lead, 3); // 10-01 周四，周一起始网格前空 3 格
  assert.strictEqual(m.checkinDays, 1); assert.strictEqual(m.achievedDays, 1);
});

console.log('— 勋章 —');
t('首次打卡 → 第一次的勇气；重复评估不再触发', () => {
  reset();
  C.upsertRecord('2026-10-05', 'habit_sleep', 1, 2, '');
  let fresh = B.evaluate(store.getRecords(), { grade: 3 }, '2026-10-05');
  assert(fresh.find(b => b.id === 'first_checkin'));
  fresh = B.evaluate(store.getRecords(), { grade: 3 }, '2026-10-05');
  assert.strictEqual(fresh.length, 0);
});
t('连续 7 天 → 一周坚持王（+5 星）', () => {
  reset();
  for (let i = 0; i < 7; i++) C.upsertRecord(D.addDays('2026-10-05', i), 'habit_sleep', 1, 2, '');
  const fresh = B.evaluate(store.getRecords(), { grade: 3 }, '2026-10-11');
  assert(fresh.find(b => b.id === 'streak_7'));
});
t('完美一天勋章', () => {
  reset();
  seedDay('2026-10-05', 3, mustIds('2026-10-05')(3), 2);
  const fresh = B.evaluate(store.getRecords(), { grade: 3 }, '2026-10-05');
  assert(fresh.find(b => b.id === 'perfect_day'));
});
t('跳绳累计 10000 → 跳绳小飞人', () => {
  reset();
  C.upsertRecord('2026-10-05', 'pe_rope', 10000, 2, '');
  const fresh = B.evaluate(store.getRecords(), { grade: 3 }, '2026-10-05');
  assert(fresh.find(b => b.id === 'rope_10k'));
});
t('全勤周（周一至周日每天全必做）→ 全勤小明星', () => {
  reset();
  for (let i = 0; i < 7; i++) {
    const date = D.addDays('2026-10-05', i);
    seedDay(date, 3, mustIds(date)(3), 2);
  }
  const fresh = B.evaluate(store.getRecords(), { grade: 3 }, '2026-10-11');
  assert(fresh.find(b => b.id === 'full_week'));
});
t('称号进度：0 星见习、150 星银星', () => {
  assert.strictEqual(B.rankInfo(0).name, '见习小达人');
  assert.strictEqual(B.rankInfo(149).name, '铜星小达人');
  const r = B.rankInfo(150);
  assert.strictEqual(r.name, '银星小达人');
  assert.strictEqual(r.next.name, '金星小达人');
});

console.log('— 同步引擎 —');
const S = require('../utils/sync');
const CTX = require('../utils/context');
const T0 = 1727740800000;

function seedRaw(records) { store.saveRecords(records); }
function mkRec(id, ts, extra) {
  return { id, date: id.split('#')[0], taskId: id.split('#')[1], value: { type: 'done', n: 1 }, stars: 2, note: '', updatedAt: ts, ...extra };
}
// 模拟云端：按 updatedAt 新者胜接收推送，按 since 增量返回
function mockCloud() {
  const server = { records: [], profile: null, badges: [], overrides: null, now: 0 };
  return {
    server,
    pushData: async p => {
      p.records.forEach(r => {
        const i = server.records.findIndex(x => x.id === r.id);
        if (i < 0) server.records.push(r);
        else if ((server.records[i].updatedAt || 0) < (r.updatedAt || 0)) server.records[i] = r;
      });
      if (p.profile && (!server.profile || (server.profile.updatedAt || 0) < (p.profile.updatedAt || 0))) server.profile = p.profile;
      if (p.overrides && (!server.overrides || (server.overrides.updatedAt || 0) < (p.overrides.updatedAt || 0))) server.overrides = p.overrides;
      p.badges.forEach(b => { if (!server.badges.find(x => x.id === b.id)) server.badges.push(b); });
      return { ok: true, serverTime: server.now || Date.now() };
    },
    pullData: async q => ({
      ok: true,
      records: server.records.filter(r => (r.updatedAt || 0) > (q.since || 0)),
      profile: server.profile,
      overrides: server.overrides,
      badges: server.badges,
      serverTime: server.now || Date.now(),
    }),
  };
}

t('推送：首次全量，之后仅增量（含 profile/badges）', async () => {
  reset();
  seedRaw([mkRec('2026-10-05#math_calc', T0), mkRec('2026-10-05#pe_rope', T0 + 1)]);
  store.saveProfile({ nickname: '小豆', role: 'child' });
  store.saveBadges([{ id: 'first_checkin', earnedAt: T0 }]);
  const api = mockCloud();
  assert(await S.push(api));
  assert.strictEqual(api.server.records.length, 2);
  assert(api.server.profile && api.server.profile.nickname === '小豆');
  assert.strictEqual(api.server.badges.length, 1);
  const lastPushAt = store.getSyncState().lastPushAt;
  assert(lastPushAt >= T0 + 1, '游标应推进到最大已发送 updatedAt');

  await S.push(api); // 无变更
  assert.strictEqual(api.server.records.length, 2);

  seedRaw([...store.getRecordsRaw(), mkRec('2026-10-06#pe_rope', lastPushAt + 5)]);
  await S.push(api);
  assert.strictEqual(api.server.records.length, 3);
});

t('拉取合并：新者胜 + 勋章并集 + 远端资料较新才覆盖', async () => {
  reset();
  seedRaw([
    mkRec('2026-10-05#math_calc', T0),        // 远端更新 → 覆盖
    mkRec('2026-10-05#pe_rope', T0 + 100),    // 本地更新 → 保留
  ]);
  store.saveProfileRaw({ nickname: '本地名', updatedAt: T0 + 50 });
  store.saveBadges([{ id: 'first_checkin', earnedAt: T0 }]);
  const api = {
    ok: true,
    pullData: async () => ({
      ok: true,
      records: [
        mkRec('2026-10-05#math_calc', T0 + 10, { stars: 3 }),
        mkRec('2026-10-05#pe_rope', T0 + 10),
        mkRec('2026-10-07#habit_sleep', T0 + 20),
      ],
      profile: { nickname: '云端名', updatedAt: T0 + 60 },
      badges: [{ id: 'streak_7', earnedAt: T0 + 30 }],
    }),
  };
  assert(await S.pull(api));
  const local = {};
  store.getRecords().forEach(r => { local[r.id] = r; });
  assert.strictEqual(local['2026-10-05#math_calc'].stars, 3, '远端较新应覆盖');
  assert.strictEqual(local['2026-10-05#pe_rope'].updatedAt, T0 + 100, '本地较新应保留');
  assert(local['2026-10-07#habit_sleep'], '远端新增应写入');
  assert.strictEqual(store.getProfile().nickname, '云端名', '远端资料较新应覆盖');
  const ids = store.getBadges().map(b => b.id);
  assert(ids.includes('first_checkin') && ids.includes('streak_7'), '勋章应取并集');
});

t('墓碑：远端删除同步到本地；本地删除传播到云端', async () => {
  reset();
  seedRaw([mkRec('2026-10-05#habit_sleep', T0)]);
  const api = mockCloud();
  api.server.records.push(mkRec('2026-10-06#pe_rope', T0 + 1, { deleted: true }));
  await S.pull(api);
  assert(!store.getRecords().find(r => r.id === '2026-10-06#pe_rope'), '墓碑记录不应出现在业务读取');
  assert(store.getRecordsRaw().find(r => r.id === '2026-10-06#pe_rope' && r.deleted), 'raw 中保留墓碑');

  C.removeRecord('2026-10-05', 'habit_sleep'); // 本地删除 → 墓碑
  assert(!store.getRecords().find(r => r.id === '2026-10-05#habit_sleep'));
  await S.push(api);
  const pushed = api.server.records.find(r => r.id === '2026-10-05#habit_sleep');
  assert(pushed && pushed.deleted === true, '墓碑应被推送');
});

t('任务覆盖随同步往返：盖章才上传，远端较新才覆盖', async () => {
  reset();
  // 家长未改过（无盖章，如从未保存或同步来的默认态）→ push 不携带 overrides
  store.saveTaskOverridesRaw({ targets: {}, customs: [] });
  const api = mockCloud();
  await S.push(api);
  assert.strictEqual(api.server.overrides, null, '未盖章的空配置不应上传');

  // 家长调整目标（saveTaskOverrides 自动盖章）→ 上传
  store.saveTaskOverrides({ targets: { pe_rope: 500 }, customs: [{ id: 'custom_x', name: '练琴', target: 20 }] });
  await S.push(api);
  assert(api.server.overrides, '盖章后应上传');
  assert.strictEqual(api.server.overrides.targets.pe_rope, 500);

  // 孩子端 pull：远端较新 → 应用；本地相同/更新 → 保留
  await S.pull(api);
  assert.strictEqual(store.getTaskOverrides().targets.pe_rope, 500, '远端覆盖应写入本地');
  // 本地更新（时间戳更新）→ 不被远端旧数据覆盖
  // （用 Raw 入口显式指定更新的时间戳：真实场景 saveTaskOverrides 盖 Date.now()，天然晚于已推送的远端）
  const remoteTs = api.server.overrides.updatedAt;
  store.saveTaskOverridesRaw({ targets: { pe_rope: 600 }, customs: [], updatedAt: remoteTs + 10 });
  await S.pull(api);
  assert.strictEqual(store.getTaskOverrides().targets.pe_rope, 600, '本地较新不应被覆盖');
});

t('时钟快于服务器：游标被封顶，重推幂等不丢数据', async () => {
  reset();
  const api = mockCloud();
  api.server.now = 1000000; // 服务器真实时间
  // 设备时钟快 1 小时：记录时间戳是"未来"
  seedRaw([mkRec('2026-10-05#habit_sleep', 1000000 + 3600 * 1000)]);
  assert(await S.push(api));
  const cursor = store.getSyncState().lastPushAt;
  assert.strictEqual(cursor, 1000000, '游标应被 serverTime 封顶，不得越过真实时间');
  // 游标 < 记录时间戳 → 下次 push 仍会重发（云端幂等），记录不丢
  assert(await S.push(api));
  assert.strictEqual(api.server.records.length, 1, '重发后云端仍只有一份');
  assert.strictEqual(api.server.records[0].id, '2026-10-05#habit_sleep');
  // 对照：若不封顶（旧实现），游标=未来时间，新记录 updatedAt=正常时间将永远小于游标 → 丢失
  seedRaw([...store.getRecordsRaw(), mkRec('2026-10-06#habit_sleep', 1000000 + 5000)]);
  assert(await S.push(api));
  assert.strictEqual(api.server.records.length, 2, '后续正常记录应能推送');
});

t('任务生成缓存：同参命中缓存，覆盖变化立即生效', () => {
  reset();
  const a = T.generateDailyTasks(3, '2026-10-06');
  const b = T.generateDailyTasks(3, '2026-10-06');
  assert.strictEqual(a, b, '同 (grade, date) 应命中缓存返回同一对象');
  // 覆盖变化（含无盖章内容变化）→ 指纹变化 → 立即反映，不命中旧缓存
  withOverrides({ targets: { pe_rope: 100 }, customs: [] }, () => {
    const r = T.generateDailyTasks(3, '2026-10-06').find(x => x.id === 'pe_rope');
    assert.strictEqual(r.target, 100, '覆盖后应立即生效（缓存不得返回旧值）');
  });
  const back = T.generateDailyTasks(3, '2026-10-06').find(x => x.id === 'pe_rope');
  assert.strictEqual(back.target, 300, '移除覆盖后恢复默认');
});

t('数据作用域：孩子端读本机，家长端只读孩子缓存', () => {
  reset();
  store.saveProfile({ nickname: '小豆', role: 'child', grade: 3 });
  seedRaw([mkRec('2026-10-05#math_calc', T0)]);
  let s = CTX.scope();
  assert.strictEqual(s.role, 'child');
  assert.strictEqual(s.records.length, 1);
  assert.strictEqual(s.readOnly, false);

  store.saveProfileRaw({ nickname: '家长', role: 'parent', grade: 0, updatedAt: Date.now() });
  s = CTX.scope();
  assert.strictEqual(s.role, 'parent');
  assert.strictEqual(s.bound, false, '未绑定孩子');
  assert.strictEqual(s.records.length, 0, '家长端不读自己（空的）本机记录');

  store.saveChildData({ nickname: '小豆', grade: 3 }, [mkRec('2026-10-05#math_calc', T0)], []);
  s = CTX.scope();
  assert.strictEqual(s.bound, true);
  assert.strictEqual(s.grade, 3);
  assert.strictEqual(s.records.length, 1);
  assert.strictEqual(s.readOnly, true);
});

console.log('— 校历与假期模式 —');
const CAL = require('../utils/calendar-config');

t('校历：区间内外与边界判断', () => {
  assert.strictEqual(CAL.holidayAt('2027-01-23').name, '寒假');   // 起始日含
  assert.strictEqual(CAL.holidayAt('2027-02-21').name, '寒假');   // 结束日含
  assert.strictEqual(CAL.holidayAt('2027-02-22'), null);          // 开学日
  assert.strictEqual(CAL.holidayAt('2026-11-11'), null);          // 学期中
  assert.strictEqual(CAL.holidayAt('2026-08-15').name, '暑假');
});
t('假期生成：4 必做（作业/阅读/口算减量/户外120），无整理书包，轮换正确', () => {
  assert.strictEqual(D.dayOfWeek('2027-01-27'), 3, '测试日期应为周三');
  const ts = T.generateDailyTasks(3, '2027-01-27'); // 寒假周三
  const must = ts.filter(x => x.must);
  assert.strictEqual(must.length, 4);
  ['holiday_homework', 'chinese_reading_ext', 'math_calc', 'pe_outdoor']
    .forEach(id => assert(ts.find(x => x.id === id), '应包含 ' + id));
  assert.strictEqual(ts.find(x => x.id === 'pe_outdoor').target, 120);
  assert(!ts.find(x => x.id === 'habit_bag'), '假期不应有整理书包');
  assert(ts.find(x => x.id === 'fun_board') && ts.find(x => x.id === 'habit_chore'));
  assert(ts.find(x => x.id === 'chinese_poem'), '周三应有古诗');
  assert(!ts.find(x => x.id === 'english_words'), '周三不应有单词');
});
t('假期与学期生成不同，且均确定', () => {
  const hol = T.generateDailyTasks(3, '2027-01-27');
  assert.strictEqual(JSON.stringify(hol), JSON.stringify(T.generateDailyTasks(3, '2027-01-27')));
  const term = T.generateDailyTasks(3, '2026-10-06'); // 学期周二
  assert(term.find(x => x.id === 'habit_bag'), '学期应有整理书包');
  assert(!hol.find(x => x.id === 'habit_bag'));
  assert(term.find(x => x.id === 'pe_rope').must, '学期跳绳必做');
  assert(!hol.find(x => x.id === 'pe_rope').must, '假期跳绳自选');
});
t('假期各年级段目标：口算 10/20/30 题，作业 30/40/60 分钟', () => {
  assert.strictEqual(D.dayOfWeek('2027-01-25'), 1, '测试日期应为周一');
  [1, 3, 5].forEach((g, i) => {
    const ts = T.generateDailyTasks(g, '2027-01-25');
    assert.strictEqual(ts.find(x => x.id === 'math_calc').target, [10, 20, 30][i]);
    assert.strictEqual(ts.find(x => x.id === 'holiday_homework').target, [30, 40, 60][i]);
  });
});
t('假期打卡统计照常：全必做 → 加成星', () => {
  reset();
  const date = '2027-01-25';
  T.generateDailyTasks(3, date).filter(x => x.must)
    .forEach(task => C.upsertRecord(date, task.id, task.target, 2, ''));
  const comp = C.dayCompletion(T.generateDailyTasks(3, date), C.getDayRecords(date));
  assert.strictEqual(comp.allMustDone, true);
  assert.strictEqual(C.totalStars(store.getRecords(), 3), 9);
});

console.log('— 跟读教室 —');
const RA = require('../utils/readaloud');
const EC = require('../utils/english-content');

t('内容库完整：Unit 1 句子/情境 id 唯一且非空', () => {
  const u = EC.units[0];
  assert.strictEqual(u.id, 'english-g1s1-u1');
  const ids = [...u.sentences, ...u.scenes].map(x => x.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 不应重复');
  assert(u.sentences.length + u.scenes.length >= 10, '内容量应足够');
  u.sentences.forEach(s => assert(s.text && s.tip));
  u.scenes.forEach(s => assert(s.when && s.say));
});
t('录音状态机：只允许合法转移', () => {
  assert(RA.canRecord('idle') && RA.canRecord('recorded'), '空闲/已录可开始录音');
  assert(!RA.canRecord('recording'), '录音中不能重复开始');
  assert(RA.canStop('recording') && !RA.canStop('idle'));
  assert(RA.canPlay('recorded') && !RA.canPlay('recording') && !RA.canPlay('idle'));
});
t('时长钳制到 1-60 秒', () => {
  assert.strictEqual(RA.clampDuration(0), 1);
  assert.strictEqual(RA.clampDuration(600), 60);
  assert.strictEqual(RA.clampDuration(8), 8);
  assert.strictEqual(RA.clampDuration(undefined), 1);
});
t('跟读记录：同日同句覆盖为一条 + 完成度计算', () => {
  reset();
  RA.saveReading('2026-10-01', 'u1-s1', '/a1.mp3', 3);
  const r2 = RA.saveReading('2026-10-01', 'u1-s1', '/a2.mp3', 5);
  assert(r2.previous && r2.previous.filePath === '/a1.mp3', '应返回被覆盖的旧记录');
  RA.saveReading('2026-10-01', 'u1-s2', '/b.mp3', 4);
  const rs = RA.getDayReadings('2026-10-01');
  assert.strictEqual(rs.length, 2);
  assert.strictEqual(rs.find(r => r.sentenceId === 'u1-s1').filePath, '/a2.mp3');
  const u = EC.units[0];
  const cards = [...u.sentences, ...u.scenes];
  const comp = RA.completion(cards, rs);
  assert.strictEqual(comp.total, cards.length);
  assert.strictEqual(comp.recorded, 2);
  assert.strictEqual(comp.allDone, false);
});
t('跨日记录互不影响', () => {
  RA.saveReading('2026-10-02', 'u1-s1', '/c.mp3', 2);
  assert.strictEqual(RA.getDayReadings('2026-10-01').length, 2);
  assert.strictEqual(RA.getDayReadings('2026-10-02').length, 1);
});

console.log('— 口算挑战 —');
const AR = require('../utils/arithmetic');

// 可复现的伪随机源
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

t('级别表完整，按年级推荐合理', () => {
  AR.LEVEL_ORDER.forEach(k => assert(AR.LEVELS[k] && AR.LEVELS[k].name));
  assert.strictEqual(AR.recommendByGrade(1), 'addsub10');
  assert.strictEqual(AR.recommendByGrade(2), 'addsub20');
  assert.strictEqual(AR.recommendByGrade(5), 'addsub100');
});
t('10以内加减：范围合法、答案正确、判定无误', () => {
  const rng = seededRng(42);
  const ps = AR.generate('addsub10', 50, rng);
  assert.strictEqual(ps.length, 50);
  ps.forEach(p => {
    assert(p.kind === 'result');
    if (p.op === '+') { assert(p.a + p.b <= 10 && p.a + p.b > 0); assert.strictEqual(p.answer, p.a + p.b); }
    else { assert(p.a >= 1 && p.b >= 0 && p.b <= p.a); assert.strictEqual(p.answer, p.a - p.b); }
    assert(AR.check(p, p.answer));
    assert(!AR.check(p, p.answer === 10 ? 9 : p.answer + 1));
  });
});
t('10以内填空：四种未知位变体、答案均在 0-10 且语义自洽', () => {
  const rng = seededRng(7);
  const ps = AR.generate('missing10', 60, rng);
  const shapes = new Set();
  ps.forEach(p => {
    assert.strictEqual(p.kind, 'missing');
    assert(p.answer >= 0 && p.answer <= 10);
    assert(AR.check(p, p.answer));
    if (p.op === '+' && p.a === null) { shapes.add('□+b=c'); assert.strictEqual(p.answer + p.b, p.c); }
    else if (p.op === '+') { shapes.add('a+□=c'); assert.strictEqual(p.a + p.answer, p.c); }
    else if (p.op === '-' && p.a === null) { shapes.add('□-b=c'); assert.strictEqual(p.answer - p.b, p.c); }
    else { shapes.add('a-□=c'); assert.strictEqual(p.a - p.answer, p.c); }
  });
  assert.strictEqual(shapes.size, 4, '应覆盖全部四种变体，实际: ' + [...shapes].join(','));
});
t('确定性：同一随机源两次生成完全一致', () => {
  const a = AR.generate('addsub10', 20, seededRng(99)).map(p => p.id);
  const b = AR.generate('addsub10', 20, seededRng(99)).map(p => p.id);
  assert.deepStrictEqual(a, b);
});
t('会话内按 id 去重，数量足够（窄级别不超过其容量）', () => {
  const rng = seededRng(3);
  // add5 全量仅 20 种（a+b≤5 且 >0），请求数须 ≤ 容量
  const ps5 = AR.buildSession('add5', 15, rng);
  assert.strictEqual(ps5.length, 15);
  assert.strictEqual(new Set(ps5.map(p => p.id)).size, 15);
  const psM = AR.buildSession('mul99', 30, rng);
  assert.strictEqual(psM.length, 30);
  assert.strictEqual(new Set(psM.map(p => p.id)).size, 30);
  const ps100 = AR.buildSession('addsub100', 30, rng);
  assert.strictEqual(ps100.length, 30);
  assert.strictEqual(new Set(ps100.map(p => p.id)).size, 30);
});
t('表内乘除法：乘积与除法商均正确', () => {
  const rng = seededRng(11);
  AR.generate('mul99', 40, rng).forEach(p => {
    if (p.op === '×') assert.strictEqual(p.answer, p.a * p.b);
    else { assert(p.b >= 1); assert.strictEqual(p.answer, p.a / p.b); assert(Number.isInteger(p.answer)); }
    assert(AR.check(p, p.answer));
  });
});
t('错题本：答错入本累计、答对销账', () => {
  reset();
  const rng = seededRng(5);
  const p = AR.generate('addsub10', 1, rng)[0];
  assert.strictEqual(AR.markResult(p, false, 'addsub10'), 'recorded');
  assert.strictEqual(AR.markResult(p, false, 'addsub10'), 'recorded');
  let wrong = store.getMathWrong();
  assert.strictEqual(wrong.length, 1);
  assert.strictEqual(wrong[0].wrongCount, 2, '同一题应累计次数');
  assert.strictEqual(wrong[0].level, 'addsub10');
  assert.strictEqual(AR.markResult(p, true, 'addsub10'), 'mastered');
  assert.strictEqual(store.getMathWrong().length, 0);
});
t('会话自动混入错题（≤40%），答对后错题本清空', () => {
  reset();
  const rng = seededRng(21);
  const seeds = AR.generate('addsub10', 3, rng);
  seeds.forEach(p => AR.markResult(p, false, 'addsub10'));
  const session = AR.buildSession('addsub10', 10, rng);
  const mixed = session.filter(p => seeds.find(s => s.id === p.id));
  assert.strictEqual(mixed.length, 3, '3 道错题应全部混入（3 ≤ ceil(10×0.4)）');
  // 答对全部错题 → 销账；此后同一 id 仍可能作为"新题"随机出现，属正常
  seeds.forEach(p => AR.markResult(p, true, 'addsub10'));
  assert.strictEqual(store.getMathWrong().length, 0);
  const next = AR.buildSession('addsub10', 10, seededRng(22));
  assert.strictEqual(next.length, 10);
});
t('不同级别的错题互不混入', () => {
  reset();
  // 选一道必然超出 10 以内范围的题（a>10），其 id 不可能被 addsub10 生成器撞出
  const p20 = AR.generate('addsub20', 10, seededRng(31)).find(p => p.a > 10);
  assert(p20, '应能取到超出 10 范围的题');
  AR.markResult(p20, false, 'addsub20');
  const s10 = AR.buildSession('addsub10', 10, seededRng(32));
  assert(!s10.find(p => p.id === p20.id), 'addsub10 会话不应混入 addsub20 错题');
  assert.strictEqual(store.getMathWrong().length, 1);
  assert.strictEqual(store.getMathWrong()[0].level, 'addsub20');
});

t('跟读记录清理：只删 cutoff 之前的，并同步存储', () => {
  reset();
  RA.saveReading('2026-09-20', 'u1-s1', '/old1.mp3', 3);
  RA.saveReading('2026-09-25', 'u1-s2', '/old2.mp3', 3);
  RA.saveReading('2026-10-01', 'u1-s1', '/new.mp3', 4);
  const { removed, kept } = RA.pruneReadings('2026-09-30'); // 保留 9-30 及以后
  assert.strictEqual(removed.length, 2);
  assert.strictEqual(kept, 1);
  assert.deepStrictEqual(removed.map(r => r.date).sort(), ['2026-09-20', '2026-09-25']);
  assert.strictEqual(RA.getDayReadings('2026-10-01').length, 1, '新记录保留');
  assert.strictEqual(store.getReadings().length, 1, '存储已同步清理');
});

console.log('— 任务管理 —');

// 安全设置覆盖源：用例结束（含失败）时恢复
function withOverrides(data, fn) {
  T.setOverrideProvider(() => data);
  try { fn(); } finally { T.setOverrideProvider(null); }
}

t('目标覆盖：生成清单使用新目标，必做结构不变', () => {
  reset();
  withOverrides({ targets: { pe_rope: 100 }, customs: [] }, () => {
    const ts = T.generateDailyTasks(3, '2026-10-06'); // 学期周二
    const rope = ts.find(x => x.id === 'pe_rope');
    assert.strictEqual(rope.target, 100);
    assert(rope.targetLabel.indexOf('100') >= 0, '目标文案应更新');
    assert.strictEqual(rope.customized, true);
    assert.strictEqual(ts.filter(x => x.must).length, 4, '必做恒 4 项不应被改变');
  });
  const back = T.generateDailyTasks(3, '2026-10-06').find(x => x.id === 'pe_rope');
  assert.strictEqual(back.target, 300, '移除覆盖后应恢复默认');
});
t('自定义任务：学期日/周末/假期都出现，可解析可打卡', () => {
  reset();
  const custom = { id: 'custom_test1', section: 'fun', name: '练钢琴', emoji: '🎹', type: 'duration', unit: '分钟', target: 20, desc: '自定义任务' };
  withOverrides({ targets: {}, customs: [custom] }, () => {
    ['2026-10-06', '2026-10-10', '2027-01-27'].forEach(date => { // 学期周二 / 周六 / 寒假周三
      const ts = T.generateDailyTasks(3, date);
      const c = ts.find(x => x.id === 'custom_test1');
      assert(c, '自定义任务应出现在 ' + date);
      assert.strictEqual(c.target, 20);
      assert.strictEqual(c.must, false, '自定义任务恒为自选');
      assert.strictEqual(T.SECTIONS[c.section].name, '娱乐');
    });
    assert.strictEqual(T.getTaskDef('custom_test1').name, '练钢琴');
    C.upsertRecord('2026-10-06', 'custom_test1', 20, 3, '');
    assert(C.getDayRecords('2026-10-06').find(r => r.taskId === 'custom_test1'), '自定义任务可打卡');
  });
  assert.strictEqual(T.getTaskDef('custom_test1'), null, '覆盖源移除后不再解析');
});
t('自定义任务不计入必做，不影响达成判定', () => {
  reset();
  const custom = { id: 'custom_test2', section: 'habit', name: '跳绳加练', emoji: '🤸', type: 'done', unit: '', target: 1 };
  withOverrides({ targets: {}, customs: [custom] }, () => {
    const date = '2026-10-06';
    T.generateDailyTasks(3, date).filter(x => x.must)
      .forEach(task => C.upsertRecord(date, task.id, task.target, 2, ''));
    const comp = C.dayCompletion(T.generateDailyTasks(3, date), C.getDayRecords(date));
    assert.strictEqual(comp.allMustDone, true, '完成全部必做即达成，自定义任务不拦路');
    assert.strictEqual(comp.total, 14, '三年级周二 13 项（10 基础 + 3 轮换）+ 自定义 1 项');
  });
});
t('覆盖源异常时安全回退默认值', () => {
  T.setOverrideProvider(() => { throw new Error('boom'); });
  try {
    const ts = T.generateDailyTasks(3, '2026-10-06');
    assert.strictEqual(ts.find(x => x.id === 'pe_rope').target, 300);
    assert(!ts.find(x => x.custom), '异常时不应出现自定义任务');
  } finally { T.setOverrideProvider(null); }
});
t('任务覆盖持久化读写', () => {
  reset();
  store.saveTaskOverrides({ targets: { chinese_read: 25 }, customs: [{ id: 'custom_x', name: 'x' }] });
  const o = store.getTaskOverrides();
  assert.strictEqual(o.targets.chinese_read, 25);
  assert.strictEqual(o.customs.length, 1);
  store.clearAll();
  assert.deepStrictEqual(store.getTaskOverrides(), { targets: {}, customs: [] });
});

console.log('— 每周一卷 —');
const QZ = require('../utils/quiz');
const QBANK = require('../utils/quiz-bank');

t('题库完整：id 唯一、来源可溯、选项与答案自洽', () => {
  const ids = QBANK.bank.map(q => q.id);
  assert.strictEqual(new Set(ids).size, ids.length, '题 id 不应重复');
  QBANK.bank.forEach(q => {
    assert(q.id && q.subject && q.unit && q.prompt && q.source, '元数据齐全: ' + q.id);
    if (q.type === 'judge') {
      assert(['√', '×'].includes(q.answerText));
    } else {
      assert(q.options.length >= 2);
      assert(q.options.includes(q.answerText), '答案必须在选项中: ' + q.id);
    }
  });
});
t('三个学科各有足够题量', () => {
  const subs = QZ.subjects();
  ['math', 'chinese', 'english'].forEach(s => {
    const row = subs.find(x => x.key === s);
    assert(row && row.count >= 10, s + ' 题量应 ≥10，实际 ' + (row && row.count));
  });
});
t('等第制：阈值正确，不打分数排名', () => {
  assert.strictEqual(QZ.verdict(10, 10).label, '优秀');
  assert.strictEqual(QZ.verdict(10, 9).label, '优秀');   // 90%
  assert.strictEqual(QZ.verdict(10, 8).label, '良好');   // 80%
  assert.strictEqual(QZ.verdict(10, 7).label, '合格');   // 70%
  assert.strictEqual(QZ.verdict(10, 5).label, '继续加油');
  assert.strictEqual(QZ.verdict(10, 9).accuracy, 90);
});
t('组卷：确定性、数量正确、judge/choice 实例化正确', () => {
  reset();
  const r1 = QZ.buildQuiz('english', 10, seededRng(77));
  const r2 = QZ.buildQuiz('english', 10, seededRng(77));
  assert.deepStrictEqual(r1.cards.map(c => c.id), r2.cards.map(c => c.id), '同种子组卷应一致');
  assert.strictEqual(r1.total, 10);
  r1.cards.forEach(c => {
    assert(c.options.length >= 2 && c.answerIndex >= 0 && c.answerIndex < c.options.length);
    assert.strictEqual(c.options[c.answerIndex], c.answerText);
  });
  // compare 类不打乱：< = > 顺序保持
  const cmp = QZ.buildQuiz('math', 10, seededRng(78)).cards.find(c => c.options.length === 3);
  assert.deepStrictEqual(cmp.options, ['<', '=', '>']);
});
t('错题本：答错入本、混入重练（≤40%）、答对销账', () => {
  reset();
  const rng = seededRng(91);
  const seeds = QZ.poolFor('chinese').slice(0, 3);
  seeds.forEach(q => QZ.markResult(q, false));
  assert.strictEqual(store.getQuizWrong().length, 3);
  const quiz = QZ.buildQuiz('chinese', 10, rng);
  const mixed = quiz.cards.filter(c => seeds.find(s => s.id === c.id));
  assert.strictEqual(mixed.length, 3, '3 道错题应全部混入');
  seeds.forEach(q => QZ.markResult(q, true));
  assert.strictEqual(store.getQuizWrong().length, 0, '答对后应销账');
});
t('学科间错题互不混入', () => {
  reset();
  const q = QZ.poolFor('math')[0];
  QZ.markResult(q, false);
  const cn = QZ.buildQuiz('chinese', 10, seededRng(92));
  assert(!cn.cards.find(c => c.id === q.id), '语文卷不应混入数学错题');
  assert.strictEqual(store.getQuizWrong()[0].subject, 'math');
});
t('历史：最新在前且最多保留 50 条', () => {
  reset();
  for (let i = 0; i < 55; i++) QZ.saveHistory({ subject: 'math', total: 10, correct: i, label: '良好' });
  const h = QZ.getHistory();
  assert.strictEqual(h.length, 50);
  assert.strictEqual(h[0].correct, 54, '最新的在前');
  assert(h[0].at >= h[49].at, '时间戳应递减');
});

console.log('— 古诗库与单元筛选 —');
const POEMS = require('../utils/poems');

t('古诗库：统编版一上 6 首，内容完整', () => {
  assert.strictEqual(POEMS.poems.length, 6);
  const ids = POEMS.poems.map(p => p.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  POEMS.poems.forEach(p => {
    assert(p.id && p.title && p.author && p.tip, p.id + ' 元数据齐全');
    assert(p.lines.length >= 4 && p.lines.every(l => typeof l === 'string' && l.length > 0), p.title + ' 诗句非空');
    assert(p.text === undefined, 'text 由页面拼接，库中不存');
  });
  ['咏鹅', '悯农（其二）', '古朗月行（节选）'].forEach(t2 =>
    assert(POEMS.poems.find(p => p.title === t2), '应包含 ' + t2));
});

t('每周一卷按单元筛选：只出该单元的题（不超单元容量）', () => {
  const quiz3 = QZ.buildQuiz('math', 5, seededRng(101), 3);   // 数学第三单元共 5 题
  assert.strictEqual(quiz3.total, 5);
  quiz3.cards.forEach(c => assert.strictEqual(c.unit, 3));
  const quiz1 = QZ.buildQuiz('chinese', 4, seededRng(102), 1); // 语文第一单元共 4 题
  assert.strictEqual(quiz1.total, 4);
  quiz1.cards.forEach(c => assert.strictEqual(c.unit, 1));
});

t('单元筛选下错题本同样按单元过滤', () => {
  reset();
  const u2 = QZ.poolFor('math').find(q => q.unit === 2);
  QZ.markResult(u2, false);
  const quiz4 = QZ.buildQuiz('math', 10, seededRng(103), 4);
  assert(!quiz4.cards.find(c => c.id === u2.id), '第 4 单元的卷子不应混入第 2 单元错题');
  const quizAll = QZ.buildQuiz('math', 10, seededRng(104));
  assert(quizAll.cards.find(c => c.id === u2.id), '不筛单元时应混入错题');
});

console.log('— 云能力封装 —');
// cloud.js 用模块级 available 缓存状态，且 CLOUD_ENV 为空；测试需整体重载模块
const CLOUD_PATH = require.resolve('../utils/cloud');
function reloadCloud(handlers) {
  delete require.cache[CLOUD_PATH];
  global.wx = { cloud: { init: () => (handlers.initThrows ? (() => { throw new Error('init failed'); })() : {}), callFunction: handlers.call } };
  return require('../utils/cloud');
}
function unloadCloud() { delete require.cache[CLOUD_PATH]; delete global.wx; }

t('未配置环境 ID：全部调用静默降级为 {ok:false,degraded:true}', async () => {
  reset();
  const cloud = reloadCloud({ call: () => { throw new Error('不应发起真实调用'); } });
  unloadCloud();
  assert.strictEqual(cloud.isAvailable(), false, '无 wx.cloud 或 CLOUD_ENV 空时应不可用');
  const res = await cloud.call('sync', { action: 'push' });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.degraded, true, '降级调用方无需判空');
  assert.strictEqual(await cloud.syncAll(true), false);
});

t('init 抛异常时降级而非崩溃', () => {
  const cloud = reloadCloud({ call: () => {}, initThrows: true });
  unloadCloud();
  assert.strictEqual(cloud.init(), false);
  assert.strictEqual(cloud.isAvailable(), false);
});

t('familyRefresh：成功时写入 store 的孩子缓存（回归：store 曾未 require 导致 ReferenceError）', async () => {
  reset();
  const calls = [];
  const cloud = reloadCloud({
    call: (p) => {
      calls.push({ name: p.name, data: p.data });
      return Promise.resolve({ result: { ok: true, profile: { nickname: '小豆', grade: 4 }, records: [], badges: [{ id: 'first_checkin', earnedAt: 1 }] } });
    },
  });
  assert.strictEqual(cloud.init("prod-test"), true);
  const res = await cloud.familyRefresh();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(calls[0].name, 'family');
  assert.strictEqual(calls[0].data.action, 'summary');
  assert.strictEqual(store.getChildProfile().nickname, '小豆', '孩子资料应写入缓存');
  assert.deepStrictEqual(store.getChildBadges(), [{ id: 'first_checkin', earnedAt: 1 }]);
  unloadCloud();
});

t('familyRefresh：res.ok 非真时不写缓存且不抛错', async () => {
  reset();
  const cloud = reloadCloud({ call: () => Promise.resolve({ result: { ok: false, error: '尚未绑定' } }) });
  cloud.init("prod-test");
  const res = await cloud.familyRefresh();
  assert.strictEqual(res.error, '尚未绑定');
  assert.strictEqual(store.getChildProfile(), null, '失败不应写缓存');
  unloadCloud();
});

t('familyJoin：邀请码去空格并转大写', async () => {
  reset();
  let seen = null;
  const cloud = reloadCloud({ call: (p) => { seen = p.data; return Promise.resolve({ result: { ok: true } }); } });
  cloud.init("prod-test");
  await cloud.familyJoin('  ab3fgh ');
  assert.strictEqual(seen.code, 'AB3FGH');
  unloadCloud();
});

t('call：云函数返回空 result 时兜底为失败而非 undefined', async () => {
  reset();
  const cloud = reloadCloud({ call: () => Promise.resolve({}) });
  cloud.init("prod-test");
  const res = await cloud.call('sync', {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'empty result');
  unloadCloud();
});

t('call：底层 reject 被转为 {ok:false,error}，不外泄异常', async () => {
  reset();
  const cloud = reloadCloud({ call: () => Promise.reject({ errMsg: 'request:fail timeout' }) });
  cloud.init("prod-test");
  const res = await cloud.call('sync', {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'request:fail timeout');
  unloadCloud();
});

chain.then(() => {
  console.log('\n全部通过：' + passed + ' 项 ✓');
}).catch(e => {
  console.error('\n✗ 测试失败：' + ((e && e.message) || e));
  console.error(e && e.stack);
  process.exit(1);
});
