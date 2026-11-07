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
const SUBJ = require('../../utils/subjects');
const FC = require('../../utils/flashcards');
const cloud = require('../../utils/cloud');
const SHARE = require('../../utils/share-image');

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
    mastery: [],
    masteryLine: '',
    flashRows: [],
    flashLine: '',
    assignRows: [],
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

  // 孩子端：从「再练练」的单元直接开这个单元的小卷（家长端只看不练）
  onPracticeUnit(e) {
    const { subject, unit, can } = e.currentTarget.dataset;
    if (this.data.role === 'parent' || can === false) return;
    wx.navigateTo({ url: '/pages/quiz/quiz?subject=' + subject + '&unit=' + unit });
  },

  // 周报分享图：按 utils/share-image 的排版画到离屏画布，导出图片后弹出系统分享菜单（可保存相册 / 发给家人）
  onShareImage() {
    const s = CTX.scope();
    const who = s.role === 'parent' ? s.child : s.profile;
    const { width, height, ops } = SHARE.layout(this.data.week, who && who.nickname);
    const canvas = wx.createOffscreenCanvas({ type: '2d', width, height });
    const ctx = canvas.getContext('2d');
    ops.forEach(op => {
      ctx.fillStyle = op.color;
      if (op.type === 'rect') ctx.fillRect(op.x, op.y, op.w, op.h);
      else { ctx.font = (op.bold ? 'bold ' : '') + op.size + 'px sans-serif'; ctx.fillText(op.text, op.x, op.y); }
    });
    wx.canvasToTempFilePath({
      canvas,
      success: res => wx.showShareImageMenu({
        path: res.tempFilePath,
        // 低版本微信没有分享菜单：直接存相册
        fail: () => wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath, success: () => wx.showToast({ title: '已保存到相册', icon: 'none' }) }),
      }),
      fail: () => wx.showToast({ title: '生成图片失败，稍后再试', icon: 'none' }),
    });
  },

  // 家长端：把「再练练」的单元布置给孩子（孩子首页会出现这份练习）
  onAssignUnit(e) {
    if (this.data.role !== 'parent') return;
    const { subject, unit } = e.currentTarget.dataset;
    cloud.assignUnit(subject, unit).then(res => {
      wx.showToast({ title: res && res.ok ? '已布置，孩子首页会看到' : (res && res.error) || '布置失败，稍后再试', icon: 'none' });
      if (res && res.ok) cloud.familyRefresh().then(() => this.refresh());
    });
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
    const bal = SHOP.balance(C.totalStars(records, grade, badges, s.goals));

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
        subjectName: SUBJ.nameOf(h.subject),
      }));

    // 各单元掌握：按全部小卷历史累计（不随 7/30 天切换），需要再练的排前面
    const mastery = REPORT.unitMastery(s.quizHistory, s.quizWrong)
      .map(row => ({
        ...row,
        name: row.subjectName + row.label,
        text: row.total ? row.correct + '/' + row.total + ' · ' + row.rate + '%' : '还没有作答记录',
        mark: SUBJ.MASTERY_MARK[row.status],
        canPractice: s.role !== 'parent' && row.status === 'practice', // 孩子端点「再练练」直接开这个单元的小卷
        canAssign: s.role === 'parent' && row.status === 'practice',   // 家长端：布置给孩子
      }))
      .sort((a, b) => (a.status === 'practice' ? 0 : 1) - (b.status === 'practice' ? 0 : 1));
    const needCount = mastery.filter(row => row.status === 'practice').length;
    const masteryLine = !mastery.length ? ''
      : needCount ? needCount + ' 个单元需要再练'
        : '练过的单元都掌握得不错';

    // 记忆卡进度（家长端读孩子同步过来的）：每个牌组已掌握 / 总数，没记住的字词最多列 6 个
    const fsum = FC.summary(s.flashcards);
    const flashRows = fsum.decks.map(d => {
      const touched = Object.keys((s.flashcards || {})[d.id] || {}).length > 0;
      const left = !touched ? '还没开始练'
        : !d.left.length ? '全部记住了 🎉'
          : '还没记住：' + d.left.slice(0, 6).join('、') + (d.left.length > 6 ? ' 等 ' + d.left.length + ' 个' : '');
      return { id: d.id, name: d.name, text: d.mastered + '/' + d.total, left, done: !d.left.length };
    });
    const flashLine = '记忆卡已掌握 ' + fsum.mastered + '/' + fsum.total + ' 张';

    // 布置的练习（家长端，读孩子同步过来的）
    const assignRows = s.role === 'parent' ? store.getChildAssignments().slice(0, 10).map(a => ({
      id: a.id, label: a.label,
      status: a.doneAt ? '已完成 · 答对 ' + a.correct + '/' + a.total : '还没做',
      done: !!a.doneAt,
    })) : [];

    const thisMonday = D.mondayOf(today);
    const week = REPORT.weeklyDigest({ ...s, today }, this.data.weekMonday);
    week.title = this.data.weekMonday === thisMonday ? '本周（进行中）'
      : this.data.weekMonday === REPORT.lastWeekMonday(today) ? '上周周报' : '周报';
    week.vsPrevAbs = Math.abs(week.vsPrev);
    week.practiceLine = '🧮 口算 ' + week.drill.count + ' 次'
      + (week.drill.accuracy === null ? '' : ' · 正确率 ' + week.drill.accuracy + '%')
      + '　📝 小卷 ' + week.quiz.count + ' 份　🧠 复习 ' + week.review.days + ' 天'
      + '　🎯 今日一练 ' + week.daily.days + ' 天　🃏 记住 ' + week.cards.learned + ' 张';

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
      mastery,
      masteryLine,
      flashRows,
      flashLine,
      assignRows,
    });
  },
});
