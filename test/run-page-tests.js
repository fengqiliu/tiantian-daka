// 页面流程测试：node test/run-page-tests.js
// 用 test/page-harness.js 在 Node 里加载真实页面，按用户操作顺序调用页面方法，
// 校验 data、存储与界面反馈；家长/孩子联动走真实云函数 + 内存数据库。
// 不覆盖：WXML 渲染与样式（静态绑定检查见 scripts/check-pages.js）、真机录音、真实云环境。
const assert = require('assert');
const H = require('./page-harness');
const store = require('../utils/store');
const D = require('../utils/date');
const T = require('../utils/tasks');
const C = require('../utils/checkin');
const QZ = require('../utils/quiz');
const SHOP = require('../utils/shop');
const cloud = require('../utils/cloud');

const { ui, load, CM } = H;
let passed = 0;
let chain = Promise.resolve();
function t(name, fn) {
  chain = chain.then(() => {
    reset();
    return Promise.resolve(fn()).then(() => { passed++; console.log('  ✓ ' + name); });
  });
}
function reset() {
  store.clearAll();
  CM.reset();
  H.resetUI();
  H.restoreNow();
  cloud.init(''); // 默认纯本地模式；需要云的用例自行 cloud.init('test-env')
}
const today = () => D.todayStr();
const child = (grade) => store.saveProfile({ role: 'child', grade: grade || 2, nickname: '小豆', onboarded: true });
const tap = data => ({ currentTarget: { dataset: data } });
const input = value => ({ detail: { value } });

console.log('— 引导 —');
t('孩子引导：没选年级不能完成；选好后建档并回首页', () => {
  const p = load('pages/onboarding/onboarding');
  p.pickRole(tap({ role: 'child' }));
  assert.strictEqual(p.data.step, 1);
  p.finish();
  assert.strictEqual(ui.toasts.pop(), '先选择年级哦');
  assert.strictEqual(store.getProfile(), null);
  p.pickGrade(tap({ grade: 3 }));
  p.onNickname(input('小豆'));
  p.finish();
  const prof = store.getProfile();
  assert.deepStrictEqual([prof.role, prof.grade, prof.nickname, prof.onboarded], ['child', 3, '小豆', true]);
  assert.strictEqual(ui.navs.pop(), 'tab:/pages/index/index');
});
t('家长引导：跳过年级，grade 为 0', () => {
  const p = load('pages/onboarding/onboarding');
  p.pickRole(tap({ role: 'parent' }));
  p.finish();
  assert.deepStrictEqual([store.getProfile().role, store.getProfile().grade], ['parent', 0]);
});

console.log('— 今日与打卡 —');
t('首页：清单含 4 项必做；选本周目标', () => {
  child(2);
  const home = load('pages/index/index');
  home.onShow();
  const tasks = home.data.sections.reduce((a, s) => a.concat(s.tasks), []);
  assert.strictEqual(tasks.filter(x => x.must).length, 4);
  assert.strictEqual(home.data.done, 0);
  assert.strictEqual(home.data.goal, null);
  ui.sheetPick = 3;
  home.onGoalTap();
  assert.strictEqual(ui.sheets[0].length, 4);
  assert.strictEqual(home.data.goal.label, '错题复习 3 天');
});
t('任务打卡：保存记录、提示星星并返回', () => {
  child(2);
  const p = load('pages/task-detail/task-detail');
  p.onLoad({ taskId: 'pe_rope', date: today() });
  p.onStar(tap({ stars: 3 }));
  p.onSave();
  const rec = store.getRecords().find(r => r.taskId === 'pe_rope');
  assert.deepStrictEqual([rec.stars, rec.value.n], [3, T.generateDailyTasks(2, today()).find(x => x.id === 'pe_rope').target]);
  assert(ui.navs.includes('back'));
});
t('屏幕时间：家长不确认就不保存', () => {
  child(2);
  const p = load('pages/task-detail/task-detail');
  p.onLoad({ taskId: 'fun_screen', date: today() });
  ui.modalAnswer = false;
  p.onSave();
  assert.strictEqual(ui.modals.pop(), '请家长确认');
  assert.strictEqual(store.getRecords().length, 0);
  ui.modalAnswer = true;
  p.onSave();
  assert.strictEqual(store.getRecords().length, 1);
});
t('计时打卡：倒计时、到点只震一次、离开再回来不丢时间、结束填入分钟', () => {
  child(2);
  const N0 = new Date(today() + 'T16:00:00').getTime();
  H.setNow(N0);
  let p = load('pages/task-detail/task-detail');
  p.onLoad({ taskId: 'chinese_reading_ext', date: today() });
  p.onShow();
  assert.strictEqual(p.data.canTime, true);
  p.onTimerStart();
  H.setNow(N0 + 30 * 1000);
  p.onTimerStop();
  assert.strictEqual(ui.toasts.pop(), '还不到 1 分钟，再坚持一下');
  p.onHide();
  H.setNow(N0 + 25 * 60 * 1000); // 锁屏 25 分钟
  p = load('pages/task-detail/task-detail');
  p.onLoad({ taskId: 'chinese_reading_ext', date: today() });
  p.onShow();
  assert.strictEqual(p.data.timer.minutes, 25);
  assert.strictEqual(p.data.timer.clock, '+05:00');
  ui.interval();
  assert.strictEqual(ui.vibrates, 0, '回到页面时已过目标，不再震');
  const other = load('pages/task-detail/task-detail');
  other.onLoad({ taskId: 'pe_outdoor', date: today() });
  other.onShow();
  assert.strictEqual(other.data.timerBusy, '课外阅读');
  p.onTimerStop();
  assert.strictEqual(p.data.value, 25);
  p.onSave();
  assert.strictEqual(store.getRecords().find(r => r.taskId === 'chinese_reading_ext').value.n, 25);
});
t('计时：在页面上跑到目标时震动一次', () => {
  child(1);
  const N0 = new Date(today() + 'T16:00:00').getTime();
  H.setNow(N0);
  const p = load('pages/task-detail/task-detail');
  p.onLoad({ taskId: 'chinese_write', date: today() });
  p.onShow();
  p.onTimerStart();
  H.setNow(N0 + 9 * 60 * 1000); ui.interval();
  assert.strictEqual(ui.vibrates, 0);
  H.setNow(N0 + 10 * 60 * 1000); ui.interval();
  H.setNow(N0 + 11 * 60 * 1000); ui.interval();
  assert.strictEqual(ui.vibrates, 1);
});

console.log('— 补打卡 —');
t('日历：昨天出现补卡区；补卡要家长确认，记 1⭐ 并标「补」', () => {
  child(2);
  const y = D.addDays(today(), -1);
  const cal = load('pages/calendar/calendar');
  cal.onShow();
  cal.onPickDay(tap({ date: D.addDays(today(), -3) }));
  assert.strictEqual(cal.data.makeup, null, '三天前不能补');
  cal.onPickDay(tap({ date: y }));
  assert.strictEqual(cal.data.makeup.remaining, 2);
  cal.onMakeupTask(tap({ id: 'pe_rope' }));
  const url = ui.navs.pop();
  const q = Object.fromEntries(url.split('?')[1].split('&').map(kv => kv.split('=')));
  const p = load('pages/task-detail/task-detail');
  p.onLoad(q);
  ui.modalAnswer = false;
  p.onSave();
  assert.strictEqual(ui.modals.pop(), '请家长确认补打卡');
  assert.strictEqual(store.getRecords().length, 0, '家长没确认不保存');
  ui.modalAnswer = true;
  p.onSave();
  const rec = store.getRecords()[0];
  assert.deepStrictEqual([rec.date, rec.stars, rec.makeup], [y, 1, true]);
  cal.onPickDay(tap({ date: y }));
  assert(cal.data.dayRecords.some(r => r.makeup));
  assert.strictEqual(cal.data.makeup.remaining, 1);
});
t('补卡模式绕过日历直接打开：窗口外被拦下', () => {
  child(2);
  const p = load('pages/task-detail/task-detail');
  p.onLoad({ taskId: 'pe_rope', date: D.addDays(today(), -5), makeup: '1' });
  assert.strictEqual(ui.toasts.pop(), '只能补昨天或前天的打卡');
  assert(ui.navs.includes('back'));
});

console.log('— 练习 —');
t('口算挑战：全对 → 完成打卡并记会话', () => {
  child(1);
  const p = load('pages/math-drill/math-drill');
  p.onLoad();
  const total = p.data.total;
  for (let i = 0; i < total; i++) {
    String(p.data.problems[p.data.idx].answer).split('').forEach(d => p.onKey(tap({ d })));
    p.onConfirm();
  }
  assert.strictEqual(p.data.phase, 'done');
  assert.strictEqual(p.data.correctCount, total);
  p.onFinish();
  const rec = store.getRecords().find(r => r.taskId === 'math_calc');
  assert.deepStrictEqual([rec.value.n, rec.stars], [total, 3]);
  assert.strictEqual(store.getDrillHistory()[0].correct, total);
});
t('每周一卷：全对得「优秀」并记历史', () => {
  child(1);
  const p = load('pages/quiz/quiz');
  p.onLoad();
  p.onStart();
  while (p.data.phase === 'play') {
    const c = p.data.cards[p.data.idx];
    if (c.type === 'multi') {
      c.answerSet.forEach(i => p.onOption(tap({ index: i })));
      p.onMultiSubmit();
    } else {
      p.onOption(tap({ index: c.answerIndex }));
    }
  }
  assert.strictEqual(p.data.verdict.label, '优秀');
  assert.strictEqual(QZ.getHistory()[0].label, '优秀');
});
t('错题复习：答错进本 → 到期出现在复习 → 答对升级', () => {
  child(1);
  const AR = require('../utils/arithmetic');
  const prob = { kind: 'result', a: 3, op: '+', b: 4, c: null, answer: 7, id: '3+4=' };
  AR.markResult(prob, false, 'addsub10', D.addDays(today(), -1)); // 昨天答错 → 今天到期
  const home = load('pages/index/index');
  home.onShow();
  assert.strictEqual(home.data.reviewDue, 1);
  const p = load('pages/review/review');
  p.onLoad();
  '7'.split('').forEach(d => p.onKey(tap({ d })));
  p.onConfirm();
  assert.strictEqual(p.data.phase, 'done');
  assert.strictEqual(p.data.promoted, 1);
  assert.strictEqual(store.getMathWrong()[0].box, 1);
});

console.log('— 奖励小铺 —');
t('孩子兑换：积分足够才能换，换后余额减少', () => {
  child(2);
  store.saveBadges([{ id: 'streak_100', earnedAt: 1 }]); // 50⭐
  const p = load('pages/shop/shop');
  p.onLoad({});
  const cheap = p.data.rewards.filter(r => r.can).sort((a, b) => a.cost - b.cost)[0];
  assert(cheap, '至少有一个能兑换的奖品');
  p.onRedeem(tap({ id: cheap.id }));
  assert.strictEqual(SHOP.getRedemptions().length, 1);
  assert.strictEqual(p.data.balance.balance, 50 - cheap.cost);
});
t('奖品管理：从孩子手机「我的 → 奖品管理」进入可以上架（家长在孩子手机上操作）', () => {
  child(2);
  const p = load('pages/shop/shop');
  p.onLoad({ manage: '1' });
  assert(!ui.navs.includes('back'), '不应被弹回：' + ui.toasts.join(' / '));
  assert.strictEqual(p.data.manage, true);
  p.onToggleForm();
  p.onFormName(input('周末露营'));
  p.onFormSubmit();
  assert(SHOP.getRewards().some(r => r.name === '周末露营'));
});
t('奖品管理：家长自己的手机上不提供（数据在孩子手机上）', () => {
  store.saveProfile({ role: 'parent', onboarded: true });
  const p = load('pages/shop/shop');
  p.onLoad({ manage: '1' });
  assert(ui.navs.includes('back'));
});

console.log('— 我的：一键清空 —');
t('纯本地：确认两次后清空并回到引导', () => {
  child(2);
  C.upsertRecord(today(), 'pe_rope', 100, 2, '');
  const p = load('pages/profile/profile');
  p.onShow();
  p.clearData();
  assert.deepStrictEqual(ui.modals, ['清空所有数据', '再次确认']);
  return H.flush().then(() => {
    assert.strictEqual(store.getProfile(), null);
    assert.strictEqual(ui.navs.pop(), 'relaunch:/pages/onboarding/onboarding');
  });
});
t('开通云：云端先清；云端失败时本机不动', () => {
  cloud.init('test-env');
  CM.setOpenid('kid1');
  child(2);
  C.upsertRecord(today(), 'pe_rope', 100, 2, '');
  const p = load('pages/profile/profile');
  p.onShow();
  const realReset = cloud.resetCloud;
  cloud.resetCloud = () => Promise.resolve({ ok: false, error: 'timeout' });
  ui.modalAnswer = true; // 两次确认；失败弹窗点确认 =「稍后重试」（取消 =「只清本机」）
  p.clearData();
  return H.flush().then(() => {
    assert(ui.modals.includes('云端清空失败'));
    assert.strictEqual(store.getRecords().length, 1, '选「稍后重试」：本机数据保留');
    ui.modalAnswer = o => o.title !== '云端清空失败'; // 这次选「只清本机」
    p.clearData();
    return H.flush();
  }).then(() => {
    cloud.resetCloud = realReset;
    assert.strictEqual(store.getRecords().length, 0, '选「只清本机」：本机清空');
    assert.strictEqual(ui.navs.pop(), 'relaunch:/pages/onboarding/onboarding');
  });
});
t('开通云：云端清空成功后才清本机，云端数据也没了', () => {
  cloud.init('test-env');
  CM.setOpenid('kid1');
  child(2);
  return CM.load('login').main({}).then(() => {
    C.upsertRecord(today(), 'pe_rope', 100, 2, '');
    return cloud.syncAll(true);
  }).then(() => {
    assert.strictEqual(CM.db.checkins.length, 1);
    const p = load('pages/profile/profile');
    p.onShow();
    p.clearData();
    return H.flush();
  }).then(() => {
    assert.strictEqual(CM.db.checkins.length, 0, '云端记录删除');
    assert.strictEqual(store.getRecords().length, 0, '本机清空');
    assert.strictEqual(ui.navs.pop(), 'relaunch:/pages/onboarding/onboarding');
  });
});

console.log('— 家长 ⇄ 孩子（真实云函数 + 内存库）—');
t('绑定 → 家长看孩子进度/日历/错题本 → 留言 → 孩子表情回复 → 家长看到', () => {
  cloud.init('test-env');
  // 孩子手机：建档、打卡、错题、同步、生成邀请码
  CM.setOpenid('kid1');
  child(2);
  return CM.load('login').main({})
    .then(() => {
      C.upsertRecord(today(), 'pe_rope', 100, 3, '');
      require('../utils/arithmetic').markResult({ kind: 'result', a: 9, op: '+', b: 8, c: null, answer: 17, id: '9+8=' }, false, 'addsub20');
      return cloud.syncAll(true);
    })
    .then(() => cloud.familyCreate())
    .then(res => {
      const code = res.code;
      // 家长手机
      store.clearAll();
      CM.setOpenid('mom');
      store.saveProfile({ role: 'parent', onboarded: true });
      const home = load('pages/index/index');
      home.onShow();
      home.onBindInput(input(code));
      home.onBind();
      return H.flush().then(() => home);
    })
    .then(home => {
      assert.strictEqual(home.data.bound, true, '绑定成功：' + ui.toasts.join(' / '));
      assert.strictEqual(home.data.childDone, 1, '家长看到孩子今天打了 1 项');
      const cal = load('pages/calendar/calendar');
      cal.onShow();
      cal.onPickDay(tap({ date: today() }));
      assert.strictEqual(cal.data.dayRecords.length, 1, '家长日历当天明细读孩子数据');
      assert.strictEqual(cal.data.makeup, null, '家长端没有补卡区');
      const wb = load('pages/wrong-book/wrong-book');
      wb.refresh();
      assert.deepStrictEqual([wb.data.readOnly, wb.data.mathCount], [true, 1]);
      // 留言
      const cheer = load('pages/cheer/cheer');
      cheer.onLoad({});
      cheer.onPreset(tap({ v: '今天表现真棒！👍' }));
      cheer.onSend();
      return H.flush();
    })
    .then(() => {
      // 孩子手机：收到 → 回复
      store.clearAll();
      CM.setOpenid('kid1');
      child(2);
      const home = load('pages/index/index');
      home.onShow();
      return H.flush().then(() => home);
    })
    .then(home => {
      assert.strictEqual(home.data.cheer.cheer.text, '今天表现真棒！👍');
      home.onCheerReact(tap({ r: '❤️' }));
      assert.strictEqual(home.data.cheer, null);
      return H.flush();
    })
    .then(() => {
      store.clearAll();
      CM.setOpenid('mom');
      store.saveProfile({ role: 'parent', onboarded: true });
      const cheer = load('pages/cheer/cheer');
      cheer.onLoad({});
      return H.flush().then(() => cheer);
    })
    .then(cheer => {
      assert.strictEqual(cheer.data.sent[0].reaction, '❤️', '家长看到孩子的回复');
    });
});

console.log('— 周报推送订阅 —');
t('家长首页订阅周报：模板未配置时提示；配置后授权成功累加配额', () => {
  cloud.init('test-env');
  CM.setOpenid('kid1');
  return CM.load('login').main({}).then(() => cloud.familyCreate()).then(res => {
    CM.setOpenid('mom');
    return CM.load('family').main({ action: 'join', code: res.code });
  }).then(() => {
    store.saveProfile({ role: 'parent', onboarded: true });
    const home = load('pages/index/index');
    home.onSubscribeWeekly();
    return H.flush().then(() => {
      assert.strictEqual(ui.toasts.pop(), '模板 ID 未配置', '占位模板时不打扰家长');
      CM.setConfig('family', { NOTIFY_TEMPLATE_ID: 'tmpl-n', WEEKLY_TEMPLATE_ID: 'tmpl-weekly' });
      home.onSubscribeWeekly();
      return H.flush();
    }).then(() => {
      assert.strictEqual(ui.toasts.pop(), '已订阅，下周一早上推送');
      const m = CM.db.families[0].members.find(x => x.openid === 'mom');
      assert.strictEqual(m.weeklyQuota, 1);
      ui.subscribeAnswer = 'reject';
      home.onSubscribeWeekly();
      return H.flush();
    }).then(() => {
      assert.strictEqual(ui.toasts.pop(), '未授权订阅');
      assert.strictEqual(CM.db.families[0].members.find(x => x.openid === 'mom').weeklyQuota, 1, '拒绝不加配额');
    });
  });
});

console.log('— 学期成长报告 —');
t('成长页入口 → 学期报告：当前学期、可往前翻、不能翻到未来；家长端读孩子数据', () => {
  child(2);
  C.upsertRecord(today(), 'pe_rope', 100, 2, '');
  const g = load('pages/growth/growth');
  g.onShow();
  assert(g.data.termHint.indexOf(require('../utils/term').periodAt(today()).label) === 0);
  g.goTerm();
  assert.strictEqual(ui.navs.pop(), '/pages/term/term');
  const p = load('pages/term/term');
  p.onLoad();
  assert.strictEqual(p.data.s.inProgress, true);
  assert.strictEqual(p.data.s.checkinDays, 1);
  assert.strictEqual(p.data.s.totals.rope, 100);
  assert.strictEqual(p.data.canNext, false);
  const label = p.data.s.label;
  p.onNext();
  assert.strictEqual(p.data.s.label, label, '不能翻到未来');
  p.onPrev();
  assert.notStrictEqual(p.data.s.label, label);
  assert.strictEqual(p.data.canNext, true);
  p.onNext();
  assert.strictEqual(p.data.s.label, label);
  // 家长端：读孩子缓存
  const rec = store.getRecords()[0];
  store.clearAll();
  store.saveProfile({ role: 'parent', onboarded: true });
  store.saveChildData({ nickname: '小豆', grade: 2 }, [rec], [], null, null);
  const pp = load('pages/term/term');
  pp.onLoad();
  assert.deepStrictEqual([pp.data.role, pp.data.s.checkinDays], ['parent', 1]);
});

console.log('— 任务管理 —');
function withOverrides(fn) {
  T.setOverrideProvider(() => store.getTaskOverrides()); // 与 app.js 启动时一致
  try { return fn(); } finally { T.setOverrideProvider(null); }
}
t('调整目标：保存后今日清单用新目标，恢复默认后回到原值；完成类任务不能调', () => withOverrides(() => {
  child(2);
  const p = load('pages/tasks-manage/tasks-manage');
  p.onLoad();
  const def = T.generateDailyTasks(2, today()).find(x => x.id === 'pe_rope').target;
  p.onEdit(tap({ id: 'pe_rope' }));
  p.onEditPlus(); p.onEditPlus();
  p.onEditSave();
  assert.strictEqual(T.generateDailyTasks(2, today()).find(x => x.id === 'pe_rope').target, def + 20);
  assert.strictEqual(ui.toasts.pop(), '已保存 ✓');
  p.onEdit(tap({ id: 'pe_rope' }));
  p.onEditReset();
  assert.strictEqual(T.generateDailyTasks(2, today()).find(x => x.id === 'pe_rope').target, def);
  p.onEdit(tap({ id: 'habit_sleep' }));
  assert.strictEqual(ui.toasts.pop(), '该任务完成即可，无需调整');
}));
t('添加自定义任务：今天起出现在清单里，不追溯到过去的完成率；可以删除', () => withOverrides(() => {
  child(2);
  const p = load('pages/tasks-manage/tasks-manage');
  p.onLoad();
  p.onToggleForm();
  p.onFormSubmit();
  assert.strictEqual(ui.toasts.pop(), '先给任务起个名字');
  p.onFormName(input('练钢琴'));
  p.onFormType(tap({ key: 'duration' }));
  p.onFormSubmit();
  assert.strictEqual(ui.toasts.pop(), '已添加，今天起出现在清单里 ✓');
  const custom = store.getTaskOverrides().customs[0];
  assert.strictEqual(custom.from, today(), '记录生效日期');
  assert(T.generateDailyTasks(2, today()).some(x => x.id === custom.id), '今天的清单里有');
  assert(!T.generateDailyTasks(2, D.addDays(today(), -1)).some(x => x.id === custom.id), '昨天的清单里没有');
  const REPORT = require('../utils/report');
  const rate = REPORT.taskRates([], 2, 30, today()).find(a => a.id === custom.id);
  assert.strictEqual(rate.appeared, 1, '近 30 天只出现了今天这 1 次，不会显示 0/30');
  p.onDelCustom(tap({ id: custom.id }));
  assert.strictEqual(store.getTaskOverrides().customs.length, 0);
  assert(!T.generateDailyTasks(2, today()).some(x => x.id === custom.id));
}));

console.log('— 古诗与跟读 —');
t('古诗：同一天背两首后重新进入页面，两首都显示已背，不能重复计数', () => {
  child(1);
  let p = load('pages/poems/poems');
  p.onLoad();
  const [a, b] = p.data.poems;
  p.onRecite(tap({ id: a.id }));
  p.onRecite(tap({ id: b.id }));
  assert.strictEqual(store.getRecords().find(r => r.taskId === 'chinese_poem').value.n, 2);
  p = load('pages/poems/poems'); // 重新进入
  p.onLoad();
  assert.strictEqual(p.data.poems.find(x => x.id === a.id).doneToday, true, '第一首仍显示已背');
  assert.strictEqual(p.data.poems.find(x => x.id === b.id).doneToday, true, '第二首仍显示已背');
  p.onRecite(tap({ id: a.id }));
  assert.strictEqual(ui.toasts.pop(), '今天这首已经背过啦');
  assert.strictEqual(store.getRecords().find(r => r.taskId === 'chinese_poem').value.n, 2, '没有重复计数');
});
t('跟读教室：录一句 → 保存录音 → 回放 → 完成打卡', () => {
  child(1);
  const p = load('pages/read-aloud/read-aloud');
  p.onLoad();
  assert.strictEqual(p.data.canFinish, false);
  const first = p.data.cards[0];
  p.onRecord(tap({ id: first.id }));
  assert.strictEqual(ui.recorder.starts, 1);
  p.onRecord(tap({ id: p.data.cards[1].id }));
  assert.strictEqual(ui.toasts.pop(), '先完成当前录音哦');
  p.onStop();
  ui.recorder.fireStop({ tempFilePath: 'tmp://a.mp3', duration: 3200 });
  assert.strictEqual(p.data.recordingId, '');
  assert.strictEqual(p.data.recordedCount, 1);
  assert.strictEqual(p.data.canFinish, true);
  p.onPlay(tap({ id: first.id }));
  assert(/readaloud\/.*\.mp3$/.test(ui.played), '播放保存到用户目录的录音：' + ui.played);
  p.onFinish();
  const rec = store.getRecords().find(r => r.taskId === 'english_listen');
  assert(rec, '完成跟读打卡');
  assert(/跟读教室 1\//.test(rec.note));
  assert(ui.navs.includes('back'));
});
t('跟读教室：麦克风权限被拒时引导去设置', () => {
  child(1);
  const p = load('pages/read-aloud/read-aloud');
  p.onLoad();
  p.onRecord(tap({ id: p.data.cards[0].id }));
  ui.recorder.fireError({ errMsg: 'operateRecorder:fail auth deny' });
  assert.strictEqual(ui.modals.pop(), '无法录音');
  assert.strictEqual(ui.openedSetting, 1);
  assert.strictEqual(p.data.recordingId, '', '录音状态复位');
});

console.log('— 我的：资料、备份、身份 —');
t('改年级后今日清单跟着变', () => {
  child(1);
  const p = load('pages/profile/profile');
  p.onShow();
  p.pickGrade(tap({ grade: 5 }));
  p.save();
  assert.strictEqual(store.getProfile().grade, 5);
  const rope = T.generateDailyTasks(5, today()).find(x => x.id === 'pe_rope');
  const home = load('pages/index/index');
  home.onShow();
  const tasks = home.data.sections.reduce((a, s) => a.concat(s.tasks), []);
  assert.strictEqual(tasks.find(x => x.id === 'pe_rope').targetLabel.indexOf(String(rope.target)) > -1, true);
});
t('导出到剪贴板 → 清空 → 从剪贴板导入，数据恢复；坏数据给出原因', () => {
  child(2);
  C.upsertRecord(today(), 'pe_rope', 100, 3, '');
  const p = load('pages/profile/profile');
  p.onShow();
  p.exportData();
  const text = ui.clipboard;
  assert.strictEqual(JSON.parse(text).app, 'tiantian-daka');
  store.clearAll();
  child(2);
  const p2 = load('pages/profile/profile');
  p2.onShow();
  p2.importData();
  assert.strictEqual(ui.modals.pop(), '确认导入');
  assert.strictEqual(store.getRecords().length, 1, '记录恢复');
  assert.strictEqual(ui.toasts.pop(), '恢复完成 ✓');
  ui.clipboard = '不是备份';
  p2.importData();
  assert.strictEqual(ui.modals.pop(), '导入失败');
});
t('切换到家长模式再切回来，孩子的年级不变', () => {
  child(1);
  let p = load('pages/profile/profile');
  p.onShow();
  p.switchRole();
  assert.strictEqual(store.getProfile().role, 'parent');
  p = load('pages/profile/profile');
  p.onShow();
  p.switchRole();
  assert.strictEqual(store.getProfile().role, 'child');
  assert.strictEqual(store.getProfile().grade, 1, '年级应恢复为 1，而不是默认的 3');
});

console.log('— 存储读取与写入失败 —');
t('每个页面刷新时，每个打卡记录年分片最多从存储读一次（一年数据）', () => {
  // 计数后端：包一层内存存储，统计每个键被读的次数
  const mem = {};
  const reads = {};
  const counting = {
    get(k) { reads[k] = (reads[k] || 0) + 1; return mem[k]; },
    set(k, v) { mem[k] = JSON.parse(JSON.stringify(v)); },
    remove(k) { delete mem[k]; },
  };
  store.init(counting);
  try {
    store.saveProfile({ role: 'child', grade: 3, nickname: '小豆', onboarded: true });
    require('./perf-fixture').seedYear(today(), 365, 3);
    const R = require('../utils/report');
    const pages = {
      index: () => load('pages/index/index').refreshChild(store.getProfile()),
      calendar: () => load('pages/calendar/calendar').onShow(),
      growth: () => load('pages/growth/growth').onShow(),
      report: () => { const p = load('pages/report/report'); p.setData({ weekMonday: R.lastWeekMonday(today()) }); p.refresh(); },
      term: () => load('pages/term/term').onLoad(),
      profile: () => load('pages/profile/profile').onShow(),
    };
    Object.keys(pages).forEach(name => {
      store.init(counting); // 冷缓存：模拟刚打开小程序
      Object.keys(reads).forEach(k => delete reads[k]);
      pages[name]();
      const shards = Object.keys(reads).filter(k => /^records_\d{4}$/.test(k));
      assert(shards.length >= 1, name + ' 应读到记录分片');
      shards.forEach(k => assert.strictEqual(reads[k], 1, name + ' 读了 ' + k + ' ' + reads[k] + ' 次'));
    });
  } finally {
    store.init();
  }
});
t('存储写入失败时「我的」页提示导出备份', () => {
  const mem = {};
  store.init({
    get(k) { return mem[k]; },
    set(k, v) { if (/^records_/.test(k)) throw new Error('setStorageSync:fail exceed max size'); mem[k] = v; },
    remove(k) { delete mem[k]; },
  });
  try {
    child(2);
    C.upsertRecord(today(), 'pe_rope', 100, 2, '');
    const p = load('pages/profile/profile');
    p.onShow();
    assert(/存储空间不足/.test(p.data.backupHint), p.data.backupHint);
    assert.strictEqual(store.getRecords().length, 1, '当前会话数据还在');
  } finally {
    store.init();
  }
});

console.log('— 报告 —');
t('周报：默认上周，可翻到本周、不能翻到未来', () => {
  child(2);
  const p = load('pages/report/report');
  p.onLoad();
  assert.strictEqual(p.data.week.title, '上周周报');
  p.onNextWeek();
  assert.strictEqual(p.data.week.title, '本周（进行中）');
  assert.strictEqual(p.data.canNextWeek, false);
  p.onNextWeek();
  assert.strictEqual(p.data.week.title, '本周（进行中）');
  p.onPrevWeek(); p.onPrevWeek();
  assert.strictEqual(p.data.week.title, '周报');
});

chain.then(() => {
  console.log('\n页面流程全部通过：' + passed + ' 项 ✓');
}).catch(e => {
  console.error('\n✗ 页面流程测试失败：' + ((e && e.message) || e));
  console.error(e && e.stack);
  process.exit(1);
});
