const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const CTX = require('../../utils/context');

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
    const total = C.totalStars(records, grade);
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

    this.setData({
      totalStars: total,
      rank,
      streak: C.streaks(records),
      week: { achieved: week.achieved, days: week.days },
      bars,
      wall: B.badgeWall(records, { grade }, s.badges),
    });
  },
});
