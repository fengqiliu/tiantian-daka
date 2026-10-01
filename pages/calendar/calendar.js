const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const D = require('../../utils/date');
const CTX = require('../../utils/context');

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
    const dayRecords = C.getDayRecords(date).map(r => {
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
      };
    });
    this.setData({ selectedLabel: date ? D.dateLabel(date) : '', dayRecords });
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
