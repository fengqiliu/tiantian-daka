const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const cloud = require('../../utils/cloud');
const MK = require('../../utils/makeup');
const TM = require('../../utils/timer');

const MOODS = [
  { stars: 1, emoji: '😅', label: '加油' },
  { stars: 2, emoji: '😊', label: '不错' },
  { stars: 3, emoji: '🤩', label: '超棒' },
];

Page({
  data: {
    task: null,
    secName: '',
    secColor: '',
    secBg: '',
    dateLabel: '',
    value: 0,
    stars: 2,
    note: '',
    exists: false,
    makeup: false, // 补打卡模式（从日历进入）
    canTime: false, // 时长类任务、当天、非补卡 → 显示计时卡
    timer: null,    // 本任务的计时视图（TM.view）；null = 未开始
    timerBusy: '',  // 别的任务正在计时时，显示它的名字
    moods: MOODS,
    steps: [],
  },

  onLoad(options) {
    if (CTX.scope().role === 'parent') {
      wx.showToast({ title: '家长端只读', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.taskId = options.taskId;
    this.date = options.date || D.todayStr();
    const profile = store.getProfile();
    const grade = Number(profile && profile.grade) || 3;
    this.grade = grade;
    // 补打卡模式：只能从日历进入，打开时再校验一次规则（窗口 / 每周额度）
    this.makeup = options.makeup === '1';
    if (this.makeup) {
      const c = MK.check(store.getRecords(), this.date, D.todayStr());
      if (!c.ok) {
        wx.showToast({ title: c.error, icon: 'none' });
        setTimeout(() => wx.navigateBack(), 900);
        return;
      }
    }

    let task = T.generateDailyTasks(grade, this.date).find(t => t.id === this.taskId);
    if (!task) task = T.buildTask(this.taskId, grade, false); // 历史日期或年级变动时的兜底
    if (!task) { wx.navigateBack(); return; }

    const meta = T.SECTIONS[task.section];
    const rec = C.getDayRecords(this.date).find(r => r.taskId === this.taskId);
    const steps = task.type === 'duration'
      ? [10, 15, 20, 30, 45, 60]
      : task.type === 'count'
        ? [task.target, task.target * 2, task.target * 3].map(n => Math.round(n))
        : [];

    this.setData({
      task,
      secName: meta.name,
      secColor: meta.color,
      secBg: meta.bg,
      dateLabel: (this.makeup ? '补打卡 · ' : '') + D.dateLabel(this.date),
      makeup: this.makeup,
      canTime: TM.isTimerTask(task.id) && !this.makeup && this.date === D.todayStr(),
      value: rec ? rec.value.n : (task.type === 'done' ? 1 : task.target),
      stars: rec ? rec.stars : 2,
      note: rec ? rec.note : '',
      exists: !!rec,
      steps,
    });
  },

  onShow() { this.refreshTimer(); },
  onHide() { this._stopTick(); },
  onUnload() { this._stopTick(); },

  // ── 计时打卡（utils/timer.js：按开始时间推算，离开页面/锁屏不丢）──
  refreshTimer() {
    if (!this.data.canTime) return;
    const st = TM.getActive();
    const mine = st && st.taskId === this.data.task.id && st.date === this.date;
    const busyDef = st && !mine ? T.getTaskDef(st.taskId) : null;
    const v = mine ? TM.view(st) : null;
    if (this._buzzed === undefined) this._buzzed = !!(v && v.reached); // 回到页面时已到点不再震
    this.setData({ timer: v, timerBusy: busyDef ? busyDef.name : '' });
    if (v && !v.paused) this._startTick(); else this._stopTick();
  },

  _startTick() {
    if (this._tick) return;
    this._tick = setInterval(() => {
      const st = TM.getActive();
      if (!st) { this._stopTick(); return; }
      const v = TM.view(st);
      if (v.reached && !this._buzzed) {
        this._buzzed = true;
        try { wx.vibrateLong(); } catch (e) { /* 忽略 */ }
        wx.showToast({ title: '时间到！🎉 可以结束啦', icon: 'none' });
      }
      this.setData({ timer: v });
    }, 1000);
  },

  _stopTick() {
    if (this._tick) { clearInterval(this._tick); this._tick = null; }
  },

  onTimerStart() {
    const res = TM.start(this.data.task.id, this.date, this.data.task.target);
    if (!res.ok) {
      const def = T.getTaskDef(res.active.taskId);
      wx.showToast({ title: '「' + (def ? def.name : '') + '」还在计时，先结束它', icon: 'none' });
      return;
    }
    this._buzzed = false;
    this.refreshTimer();
  },

  onTimerPause() { TM.pause(); this.refreshTimer(); },
  onTimerResume() { TM.resume(); this.refreshTimer(); },

  // 结束并把分钟数填入（不直接保存，孩子再评星/写一句后点打卡）
  onTimerStop() {
    const st = TM.getActive();
    if (!st) return;
    if (TM.view(st).minutes < 1) {
      wx.showToast({ title: '还不到 1 分钟，再坚持一下', icon: 'none' });
      return;
    }
    const r = TM.stop();
    this._stopTick();
    this.setData({ timer: null, value: Math.min(999, r.minutes) });
    wx.showToast({ title: '已填入 ' + r.minutes + ' 分钟，点下面打卡', icon: 'none' });
  },

  onTimerCancel() {
    wx.showModal({
      title: '放弃这次计时？',
      content: '计时会清零，不会填入分钟数。',
      confirmText: '放弃',
      success: res => {
        if (!res.confirm) return;
        TM.cancel();
        this._stopTick();
        this.setData({ timer: null });
      },
    });
  },

  onMinus() {
    const { task, value } = this.data;
    if (task.type === 'done') return;
    const step = task.target >= 50 ? 10 : 5;
    this.setData({ value: Math.max(step, (value || 0) - step) });
  },

  onPlus() {
    const { task, value } = this.data;
    if (task.type === 'done') return;
    const step = task.target >= 50 ? 10 : 5;
    this.setData({ value: Math.min(999, (value || 0) + step) });
  },

  onStep(e) {
    if (this.data.task.type === 'done') return;
    this.setData({ value: Number(e.currentTarget.dataset.n) });
  },

  onStar(e) {
    this.setData({ stars: Number(e.currentTarget.dataset.stars) });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  onSave() {
    const { task, value, stars, note, exists } = this.data;
    if (task.type !== 'done' && (!value || value <= 0)) {
      wx.showToast({ title: '先填写完成量哦', icon: 'none' });
      return;
    }
    const doSave = () => {
      if (this.makeup) {
        const res = MK.save(this.date, task.id, task.type === 'done' ? 1 : value, note, D.todayStr(), this.grade);
        if (!res.ok) { wx.showToast({ title: res.error, icon: 'none' }); return; }
      } else {
        C.upsertRecord(this.date, task.id, task.type === 'done' ? 1 : value, stars, note);
      }
      try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 老基础库忽略 */ }
      const fresh = B.evaluate(store.getRecords(), store.getProfile());
      if (fresh.length) {
        const b = B.badgeById(fresh[0].id);
        wx.showToast({ title: '获得新勋章 ' + (b ? b.emoji : '🏅'), icon: 'none' });
        // 通知绑定的家长（未开通云开发时静默跳过）
        const me = store.getProfile();
        cloud.notifyParents(
          (me && me.nickname ? me.nickname : '孩子') + '达成新勋章',
          b ? '「' + b.name + '」' + (b.desc || '') : '继续加油！'
        );
      } else {
        wx.showToast({ title: (this.makeup ? '补打卡成功 +1' : '打卡成功 +' + stars) + ' ⭐', icon: 'none' });
      }
      cloud.syncAll(); // 静默增量同步
      setTimeout(() => wx.navigateBack(), 700);
    };
    // 补打卡一律需家长确认
    if (this.makeup) {
      wx.showModal({
        title: '请家长确认补打卡',
        content: '确认孩子 ' + D.dateLabel(this.date) + ' 完成了「' + task.name + '」，只是忘了打卡吗？补卡记 1 ⭐。',
        confirmText: '确认补卡',
        success: res => { if (res.confirm) doSave(); },
      });
      return;
    }
    if (task.parentConfirm && !exists) {
      wx.showModal({
        title: '请家长确认',
        content: '「' + task.name + '」需要家长确认后才能打卡，确认已完成且时长适量吗？',
        confirmText: '确认完成',
        success: res => { if (res.confirm) doSave(); },
      });
      return;
    }
    doSave();
  },

  goPoems() {
    wx.navigateTo({ url: '/pages/poems/poems' });
  },

  goReadAloud() {
    wx.navigateTo({ url: '/pages/read-aloud/read-aloud' });
  },

  goMathDrill() {
    wx.navigateTo({ url: '/pages/math-drill/math-drill' });
  },

  onRemove() {
    const { task } = this.data;
    wx.showModal({
      title: '取消打卡',
      content: '要取消「' + task.name + '」本次打卡吗？',
      confirmColor: '#FF5A3C',
      success: res => {
        if (res.confirm) {
          C.removeRecord(this.date, task.id);
          cloud.syncAll();
          wx.navigateBack();
        }
      },
    });
  },
});
