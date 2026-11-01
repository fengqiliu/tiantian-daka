// 学期成长报告：按上海校历划分学期 / 假期，可前后翻；孩子端读本机，家长端读孩子缓存
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const TERM = require('../../utils/term');

const UNIT_MARK = { mastered: '👍 掌握', practice: '💪 再练练', few: '题还少' };

Page({
  data: {
    s: null,            // TERM.termSummary 结果
    canNext: false,
    drillTrend: '',
    readingHours: 0,
    outdoorHours: 0,
    role: 'child',
  },

  onLoad() {
    this.period = TERM.periodAt(D.todayStr());
    this.refresh();
  },

  refresh() {
    const today = D.todayStr();
    const scope = CTX.scope();
    const s = TERM.termSummary(scope, this.period, today);
    this.setData({
      s,
      role: scope.role,
      canNext: this.period.end < today, // 最远翻到当前时段
      drillTrend: s.drill.firstAccuracy === null ? '' : ' · 正确率 ' + s.drill.firstAccuracy + '% → ' + s.drill.lastAccuracy + '%',
      readingHours: Math.round(s.totals.readingMinutes / 6) / 10,
      outdoorHours: Math.round(s.totals.outdoorMinutes / 6) / 10,
      unitRows: s.units.map(u => ({
        name: u.subjectName + u.label,
        text: u.total ? u.correct + '/' + u.total + ' · ' + u.rate + '%' : '',
        mark: UNIT_MARK[u.status],
        status: u.status,
      })),
    });
  },

  onPrev() {
    this.period = TERM.prev(this.period);
    this.refresh();
  },

  onNext() {
    if (!this.data.canNext) return;
    this.period = TERM.next(this.period);
    this.refresh();
  },
});
