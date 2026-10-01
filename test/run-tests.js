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
  const server = { records: [], profile: null, badges: [] };
  return {
    server,
    pushData: async p => {
      p.records.forEach(r => {
        const i = server.records.findIndex(x => x.id === r.id);
        if (i < 0) server.records.push(r);
        else if ((server.records[i].updatedAt || 0) < (r.updatedAt || 0)) server.records[i] = r;
      });
      if (p.profile && (!server.profile || (server.profile.updatedAt || 0) < (p.profile.updatedAt || 0))) server.profile = p.profile;
      p.badges.forEach(b => { if (!server.badges.find(x => x.id === b.id)) server.badges.push(b); });
      return { ok: true };
    },
    pullData: async q => ({
      ok: true,
      records: server.records.filter(r => (r.updatedAt || 0) > (q.since || 0)),
      profile: server.profile,
      badges: server.badges,
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

chain.then(() => {
  console.log('\n全部通过：' + passed + ' 项 ✓');
}).catch(e => {
  console.error('\n✗ 测试失败：' + ((e && e.message) || e));
  console.error(e && e.stack);
  process.exit(1);
});
