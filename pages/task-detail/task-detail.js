const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const cloud = require('../../utils/cloud');

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
      dateLabel: D.dateLabel(this.date),
      value: rec ? rec.value.n : (task.type === 'done' ? 1 : task.target),
      stars: rec ? rec.stars : 2,
      note: rec ? rec.note : '',
      exists: !!rec,
      steps,
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
      C.upsertRecord(this.date, task.id, task.type === 'done' ? 1 : value, stars, note);
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
        wx.showToast({ title: '打卡成功 +' + stars + ' ⭐', icon: 'none' });
      }
      cloud.syncAll(); // 静默增量同步
      setTimeout(() => wx.navigateBack(), 700);
    };
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
