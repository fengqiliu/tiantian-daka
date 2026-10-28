const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const MK = require('../../utils/makeup');

Page({
  data: {
    weekHeader: ['一', '二', '三', '四', '五', '六', '日'],
    year: 0,
    month: 0,
    monthLabel: '',
    grid: [],
    stats: null,
    selectedDate: '',
    selectedLabel: '',
    dayRecords: [],
    canNext: false,
    makeup: null, // 补打卡区：{ date, remaining, tasks[] }；不可补时为 null
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const profile = store.getProfile();
    if (!profile || !profile.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }
    if (!this.data.year) {
      const now = new Date();
      this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 });
    }
    this.refresh();
  },

  refresh() {
    const { year, month } = this.data;
    const s = CTX.scope();
    const grade = s.grade;
    const m = C.monthStats(year, month, s.records, grade);

    const grid = [];
    for (let i = 0; i < m.lead; i++) grid.push({ blank: true });
    m.cells.forEach(c => grid.push(c));

    const today = D.todayStr();
    const inMonth = today.startsWith(year + '-' + (month < 10 ? '0' + month : month));
    let selected = inMonth ? today : m.cells.length ? m.cells[0].date : '';
    if (this.data.selectedDate && this.data.selectedDate.startsWith(year + '-' + (month < 10 ? '0' + month : month))) {
      selected = this.data.selectedDate;
    }

    this.setData({
      monthLabel: year + ' 年 ' + month + ' 月',
      grid,
      stats: { checkinDays: m.checkinDays, achievedDays: m.achievedDays, stars: m.stars },
      canNext: !(year === new Date().getFullYear() && month === new Date().getMonth() + 1),
      selectedDate: selected,
    });
    this.loadDay(selected);
  },

  loadDay(date) {
    // 数据作用域：家长端读孩子缓存（此前读本机，家长点某天永远显示"没有记录"）
    const s = CTX.scope();
    const dayRecords = s.records.filter(r => r.date === date).map(r => {
      const def = T.getTaskDef(r.taskId);
      return {
        id: r.id,
        emoji: def ? def.emoji : '📌',
        name: def ? def.name : r.taskId,
        stars: r.stars,
        note: r.note,
        valueN: r.value && r.value.n,
        unit: def ? def.unit : '',
        type: def ? def.type : 'done',
        makeup: !!r.makeup,
      };
    });
    this.setData({ selectedLabel: date ? D.dateLabel(date) : '', dayRecords, makeup: this.makeupView(s, date) });
  },

  // 补打卡区：仅孩子端、仅昨天/前天、有没打卡的任务时显示
  makeupView(s, date) {
    const today = D.todayStr();
    if (s.readOnly || !date || !MK.canMakeupDate(date, today)) return null;
    const tasks = MK.missingTasks(s.records, s.grade, date);
    if (!tasks.length) return null;
    const c = MK.check(s.records, date, today);
    return {
      date,
      blocked: c.ok ? '' : c.error,
      remaining: MK.remaining(s.records, today),
      tasks: tasks.map(t => ({ id: t.id, emoji: t.emoji, name: t.name, must: t.must })),
    };
  },

  onMakeupTask(e) {
    const m = this.data.makeup;
    if (!m || m.blocked) return;
    wx.navigateTo({
      url: '/pages/task-detail/task-detail?taskId=' + e.currentTarget.dataset.id + '&date=' + m.date + '&makeup=1',
    });
  },

  onPrev() {
    let { year, month } = this.data;
    month--;
    if (month === 0) { month = 12; year--; }
    this.setData({ year, month, selectedDate: '' });
    this.refresh();
  },

  onNext() {
    if (!this.data.canNext) return;
    let { year, month } = this.data;
    month++;
    if (month === 13) { month = 1; year++; }
    this.setData({ year, month, selectedDate: '' });
    this.refresh();
  },

  onPickDay(e) {
    const date = e.currentTarget.dataset.date;
    this.setData({ selectedDate: date });
    this.loadDay(date);
  },
});
