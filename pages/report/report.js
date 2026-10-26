const store = require('../../utils/store');
const C = require('../../utils/checkin');
const D = require('../../utils/date');
const T = require('../../utils/tasks');
const AR = require('../../utils/arithmetic');
const SHOP = require('../../utils/shop');
const REPORT = require('../../utils/report');
const CTX = require('../../utils/context');

const LEVEL_NAME = {};
Object.keys(AR.LEVELS).forEach(k => { LEVEL_NAME[k] = AR.LEVELS[k].name; });
const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };

Page({
  data: {
    range: 7,
    weekMonday: '',
    canNextWeek: false,
    week: null,
    gradeLabel: '',
    role: 'child',
    ov: null,
    balance: 0,
    rates: [],
    lowCount: 0,
    drill: null,
    drillRows: [],
    quizRows: [],
  },

  onLoad() {
    this.setData({ weekMonday: REPORT.lastWeekMonday(D.todayStr()) });
    this.refresh();
  },

  // 周报翻页：最远翻到本周（进行中）
  onPrevWeek() {
    this.setData({ weekMonday: D.addDays(this.data.weekMonday, -7) });
    this.refresh();
  },

  onNextWeek() {
    if (!this.data.canNextWeek) return;
    this.setData({ weekMonday: D.addDays(this.data.weekMonday, 7) });
    this.refresh();
  },

  onRange(e) {
    this.setData({ range: Number(e.currentTarget.dataset.days) });
    this.refresh();
  },

  refresh() {
    // 数据作用域：孩子端读本机，家长端读孩子缓存（家长报告的目标读者是家长）
    const s = CTX.scope();
    const grade = s.grade;
    const today = D.todayStr();
    const days = this.data.range;
    const records = s.records;
    const badges = s.badges;

    const ov = REPORT.overview(records, grade, days, today);
    const bal = SHOP.balance(C.totalStars(records, grade, badges));

    const rates = REPORT.taskRates(records, grade, days, today).map(a => ({
      ...a,
      color: (T.SECTIONS[a.section] || {}).color || '#999',
      bg: (T.SECTIONS[a.section] || {}).bg || '#F7F2E8',
      low: a.rate < 50,
    }));
    const lowCount = rates.filter(a => a.rate < 50 && a.appeared >= 2).length;

    const drill = REPORT.drillSummary(s.drillSessions, days, today);
    const drillRows = drill.sessions.slice(0, 5).map(x => ({
      ...x,
      levelName: LEVEL_NAME[x.level] || x.level,
      dateLabel: D.dateLabel(x.date),
    }));

    const startTs = new Date(D.addDays(today, -(days - 1)) + 'T00:00:00').getTime();
    const quizRows = s.quizHistory
      .filter(h => h.at >= startTs)
      .slice(0, 5)
      .map(h => ({
        ...h,
        dateLabel: D.dateLabel(D.formatDate(new Date(h.at))),
        subjectName: SUBJECT_NAME[h.subject] || h.subject,
      }));

    const thisMonday = D.mondayOf(today);
    const week = REPORT.weeklyDigest({ ...s, today }, this.data.weekMonday);
    week.title = this.data.weekMonday === thisMonday ? '本周（进行中）'
      : this.data.weekMonday === REPORT.lastWeekMonday(today) ? '上周周报' : '周报';
    week.vsPrevAbs = Math.abs(week.vsPrev);
    week.practiceLine = '🧮 口算 ' + week.drill.count + ' 次'
      + (week.drill.accuracy === null ? '' : ' · 正确率 ' + week.drill.accuracy + '%')
      + '　📝 小卷 ' + week.quiz.count + ' 份　🧠 复习 ' + week.review.days + ' 天';

    this.setData({
      week,
      canNextWeek: this.data.weekMonday < thisMonday,
      gradeLabel: grade + ' 年级 · 近 ' + days + ' 天',
      role: s.role,
      ov,
      balance: bal.balance,
      rates,
      lowCount,
      drill,
      drillRows,
      quizRows,
    });
  },
});
