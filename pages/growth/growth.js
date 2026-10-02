const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const QZ = require('../../utils/quiz');
const SHOP = require('../../utils/shop');

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
    const total = C.totalStars(records, grade, s.badges);
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
    const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };
    const quizHistory = QZ.getHistory();
    const quizWrong = store.getQuizWrong();
    const quizHint = quizHistory.length
      ? '上次' + (SUBJECT_NAME[quizHistory[0].subject] || '') + '小卷「' + quizHistory[0].label + '」'
        + (quizWrong.length ? ' · 错题 ' + quizWrong.length + ' 题' : '')
      : (quizWrong.length ? '错题 ' + quizWrong.length + ' 题，来练一练' : '判断选择小卷，做完给等第');

    // 错题本入口文案
    const mathWrong = store.getMathWrong().length;
    const quizWrongN = store.getQuizWrong().length;
    const wrongHint = (mathWrong + quizWrongN)
      ? '口算 ' + mathWrong + ' 题 · 小卷 ' + quizWrongN + ' 题，练对自动销账'
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
      role: s.role,
      shopHint,
    });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  goWrongBook() {
    wx.navigateTo({ url: '/pages/wrong-book/wrong-book' });
  },

  goShop() {
    wx.navigateTo({ url: '/pages/shop/shop' });
  },
});
