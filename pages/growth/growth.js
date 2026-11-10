const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const QZ = require('../../utils/quiz');
const SHOP = require('../../utils/shop');
const TERM = require('../../utils/term');
const SUBJ = require('../../utils/subjects');
const FC = require('../../utils/flashcards');
const REPORT = require('../../utils/report');

Page({
  data: {
    totalStars: 0,
    rank: null,
    streak: { current: 0, best: 0 },
    week: null,
    bars: [],
    wall: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    const profile = store.getProfile();
    if (!profile || !profile.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }

    const s = CTX.scope();
    const grade = s.grade;
    const records = s.records;
    const total = C.totalStars(records, grade, s.badges, s.goals);
    const rank = B.rankInfo(total);
    const week = C.weeklyStats(records, grade);

    // 本周各板块完成次数条形图（以最大值为 100%）
    let max = 1;
    T.SECTION_ORDER.forEach(k => { max = Math.max(max, week.bySection[k] || 0); });
    const bars = T.SECTION_ORDER
      .filter(k => week.bySection[k])
      .map(k => ({
        key: k,
        name: T.SECTIONS[k].name,
        color: T.SECTIONS[k].color,
        count: week.bySection[k],
        pct: Math.round(((week.bySection[k] || 0) / max) * 100),
      }));

    // 每周一卷入口文案
    const quizHistory = s.quizHistory; // 走 scope()：家长端读孩子的小卷历史，不是家长手机本地的
    const quizWrong = s.quizWrong;
    const quizHint = quizHistory.length
      ? '上次' + SUBJ.nameOf(quizHistory[0].subject) + '小卷「' + quizHistory[0].label + '」'
        + (quizWrong.length ? ' · 错题 ' + quizWrong.length + ' 题' : '')
      : (quizWrong.length ? '错题 ' + quizWrong.length + ' 题，来练一练' : '判断选择小卷，做完给等第');

    // 错题本入口文案（家长端读孩子缓存）
    const mathWrong = s.mathWrong.length;
    const quizWrongN = s.quizWrong.length;
    const wrongHint = (mathWrong + quizWrongN)
      ? '口算 ' + mathWrong + ' 题 · 小卷 ' + quizWrongN + ' 题，间隔复习连对 3 次移出'
      : '暂无错题，练一练看看';

    // 奖励小铺（仅孩子端；积分 = 累计星数 − 已兑换）
    const shopBal = SHOP.balance(total);
    const shopHint = '💰 ' + shopBal.balance + ' 积分可兑换奖品零食';

    this.setData({
      totalStars: total,
      rank,
      streak: C.streaks(records),
      week: { achieved: week.achieved, days: week.days },
      bars,
      wall: B.badgeWall(records, { grade }, s.badges),
      quizHint,
      wrongHint,
      termHint: TERM.periodAt(D.todayStr()).label + ' · 打卡、累计与勋章总结',
      role: s.role,
      starMap: this.starMapView(s.quizHistory),
      flashLine: this.flashLine(s.flashcards),
      ...this.trendView(records, s.quizHistory),
      shopHint,
    });
  },

  // 单元星图：每科全册单元，星级见 utils/quiz.js starsOf
  starMapView(quizHistory) {
    return QZ.starMap(quizHistory).map(sub => ({
      ...sub,
      summary: '已点亮 ' + sub.lit + '/' + sub.units.length + ' 个单元',
      units: sub.units.map(u => ({ ...u, starText: '★'.repeat(u.stars) + '☆'.repeat(3 - u.stars) })),
    }));
  },

  // 近 8 周进步曲线：每周星星（柱高）与小卷正确率
  trendView(records, quizHistory) {
    const trend = REPORT.weeklyTrend(records, quizHistory, D.todayStr(), 8);
    return { trend, trendLine: '近 8 周共 ' + trend.reduce((s, w) => s + w.stars, 0) + ' ⭐' };
  },

  flashLine(cards) {
    const sum = FC.summary(cards);
    return '记忆卡已掌握 ' + sum.mastered + '/' + sum.total + ' 张' + (sum.fullDecks ? ' · ' + sum.fullDecks + ' 个牌组全部记住' : '');
  },

  // 点单元直接练这个单元（家长端只看）
  onStarUnit(e) {
    if (this.data.role === 'parent') return;
    const { subject, unit } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/quiz/quiz?subject=' + subject + '&unit=' + unit });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  goTerm() {
    wx.navigateTo({ url: '/pages/term/term' });
  },

  goWrongBook() {
    wx.navigateTo({ url: '/pages/wrong-book/wrong-book' });
  },

  goFlashcards() {
    wx.navigateTo({ url: '/pages/flashcards/flashcards' });
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop/shop' });
  },
});
