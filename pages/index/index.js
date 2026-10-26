const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const cloud = require('../../utils/cloud');
const CAL = require('../../utils/calendar-config');
const RV = require('../../utils/review');
const REPORT = require('../../utils/report');
const CHEER = require('../../utils/cheer');

Page({
  data: {
    // 公共
    isParent: false,
    // 孩子模式
    dateLabel: '',
    dayTag: '',
    greeting: '',
    nickname: '',
    gradeLabel: '',
    sections: [],
    done: 0,
    total: 0,
    pct: 0,
    starsToday: 0,
    totalStars: 0,
    streak: 0,
    reviewDue: 0,
    reviewDone: false,
    cheer: null, // { cheer, unread }：家长留言横幅
    // 家长模式
    bound: false,
    bindCode: '',
    childName: '',
    childGradeLabel: '',
    childStars: 0,
    childStreak: 0,
    childSections: [],
    childDone: 0,
    childTotal: 0,
    childPct: 0,
    weekStrip: [],
    weekly: null,
    cloudOff: false,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    const profile = store.getProfile();
    if (!profile || !profile.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }
    const s = CTX.scope();
    if (s.role === 'parent') {
      this.setData({ isParent: true });
      this.refreshParent();
    } else {
      this.setData({ isParent: false });
      this.refreshChild(s.profile);
      cloud.syncAll(); // 节流 1 分钟，静默失败
      this.refreshCheers();
    }
  },

  // ── 孩子模式（本机打卡）──
  refreshChild(profile) {
    const grade = Number(profile.grade) || 3;
    const today = D.todayStr();
    const tasks = T.generateDailyTasks(grade, today);
    const records = C.getDayRecords(today);
    const comp = C.dayCompletion(tasks, records);
    const all = store.getRecords();

    this.setData({
      dateLabel: D.dateLabel(today),
      dayTag: this.dayTag(today),
      greeting: D.greeting(new Date().getHours()),
      nickname: profile.nickname,
      gradeLabel: '上海 · ' + grade + ' 年级',
      sections: this.buildSections(tasks, records),
      done: comp.done,
      total: comp.total,
      pct: comp.total ? Math.round((comp.done / comp.total) * 100) : 0,
      starsToday: comp.stars + (comp.allMustDone ? 1 : 0),
      totalStars: C.totalStars(all, grade, store.getBadges()),
      streak: C.streaks(all).current,
      reviewDue: RV.dueCount(today),
      reviewDone: RV.reviewedToday(today),
      cheer: CHEER.banner(store.getCheers()),
    });
  },

  // 家长留言：先显示缓存，再静默拉最新（节流 1 分钟）
  refreshCheers() {
    if (!cloud.isAvailable() || Date.now() - (this._cheersAt || 0) < 60 * 1000) return;
    this._cheersAt = Date.now();
    cloud.cheerList().then(res => {
      if (res && res.ok) this.setData({ cheer: CHEER.banner(store.getCheers()) });
    });
  },

  // 「收到啦」：本地先标已读（横幅换下一条），云端异步跟上
  onCheerAck() {
    const c = this.data.cheer && this.data.cheer.cheer;
    if (!c) return;
    store.markCheersRead([c.id]);
    cloud.cheerRead([c.id]);
    this.setData({ cheer: CHEER.banner(store.getCheers()) });
  },

  // 状态标签：假期 > 周末 > 上学日
  dayTag(today) {
    const hol = CAL.holidayAt(today);
    if (hol) return hol.name + '模式 ' + hol.emoji;
    return D.isWeekend(today) ? '周末模式 🎈' : '上学日 🏫';
  },

  buildSections(tasks, records) {
    const map = {};
    records.forEach(r => { map[r.taskId] = r; });
    return T.SECTION_ORDER.map(key => {
      const meta = T.SECTIONS[key];
      const ts = tasks.filter(t => t.section === key).map(t => {
        const r = map[t.id];
        return {
          id: t.id,
          emoji: t.emoji,
          name: t.name,
          must: t.must,
          targetLabel: t.targetLabel + (t.parentConfirm ? ' · 需家长确认' : ''),
          done: !!r,
          stars: r ? r.stars : 0,
        };
      });
      return {
        key, color: meta.color, bg: meta.bg, name: meta.name,
        tasks: ts,
        done: ts.filter(x => x.done).length,
        total: ts.length,
      };
    }).filter(s => s.total > 0);
  },

  onTaskTap(e) {
    wx.navigateTo({
      url: '/pages/task-detail/task-detail?taskId=' + e.currentTarget.dataset.id + '&date=' + D.todayStr(),
    });
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  goGrowth() {
    wx.switchTab({ url: '/pages/growth/growth' });
  },

  // ── 家长模式（云端只读）──
  refreshParent() {
    if (!cloud.isAvailable()) {
      this.setData({ cloudOff: true, bound: false });
      return;
    }
    const child = store.getChildProfile();
    if (!child) {
      this.setData({ bound: false });
      return;
    }
    const s = CTX.scope();
    const grade = s.grade;
    const today = D.todayStr();
    const tasks = T.generateDailyTasks(grade, today);
    const records = s.records;
    const comp = C.dayCompletion(tasks, records.filter(r => r.date === today));

    const weekStrip = [];
    for (let i = 6; i >= 0; i--) {
      const date = D.addDays(today, -i);
      const recs = records.filter(r => r.date === date);
      let state = 'none';
      if (recs.length) {
        const c = C.dayCompletion(T.generateDailyTasks(grade, date), recs);
        state = c.allMustDone ? 'ok' : 'part';
      }
      weekStrip.push({ label: '周' + D.WEEK_CN[D.dayOfWeek(date)], state });
    }

    this.setData({
      bound: true,
      cloudOff: false,
      childName: (child.avatar || '🦊') + ' ' + (child.nickname || '小达人'),
      childGradeLabel: '上海 · ' + grade + ' 年级',
      childSections: this.buildSections(tasks, records.filter(r => r.date === today)),
      childDone: comp.done,
      childTotal: comp.total,
      childPct: comp.total ? Math.round((comp.done / comp.total) * 100) : 0,
      childStars: C.totalStars(records, grade, s.badges),
      childStreak: C.streaks(records, today).current,
      weekStrip,
      weekly: this.buildWeekly(s, today),
    });

    // 后台刷新最新数据（节流由 syncAt 控制）
    if (!this._refreshing && Date.now() - (this._lastRefresh || 0) > 60 * 1000) {
      this._refreshing = true;
      cloud.familyRefresh().then(res => {
        this._refreshing = false;
        this._lastRefresh = Date.now();
        if (res && res.ok) this.refreshParent();
      }).catch(() => { this._refreshing = false; });
    }
  },

  // 上周周报摘要卡（家长端）：一句话 + 首条亮点/需关注
  buildWeekly(s, today) {
    const g = REPORT.weeklyDigest(s, REPORT.lastWeekMonday(today));
    return {
      label: g.label,
      line: '打卡 ' + g.checkinDays + '/7 天 · 达成 ' + g.achievedDays + ' 天 · ⭐ ' + g.stars,
      highlight: g.highlights[0] || '',
      attention: g.attention[0] || '',
    };
  },

  goReport() {
    wx.navigateTo({ url: '/pages/report/report' });
  },

  onBindInput(e) { this.setData({ bindCode: e.detail.value }); },

  onBind() {
    const code = this.data.bindCode;
    if (!code) { wx.showToast({ title: '请输入邀请码', icon: 'none' }); return; }
    wx.showLoading({ title: '绑定中…' });
    cloud.familyJoin(code).then(res => {
      if (!res || res.ok === false) {
        wx.hideLoading();
        wx.showToast({ title: (res && res.error) || '绑定失败', icon: 'none' });
        return;
      }
      return cloud.familyRefresh().then(r2 => {
        wx.hideLoading();
        if (r2 && r2.ok) {
          wx.showToast({ title: '绑定成功 🎉', icon: 'none' });
          this.setData({ bindCode: '' });
          this.refreshParent();
        } else {
          wx.showToast({ title: '已绑定，拉取数据失败，稍后自动重试', icon: 'none' });
        }
      });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    });
  },

  // 家长端：点已完成的任务 → 给这次打卡点赞留言；未完成的仍提示只读
  onParentTaskTap(e) {
    const { id, done, name } = e.currentTarget.dataset;
    if (!done) {
      wx.showToast({ title: '家长端只读，去孩子手机上打卡吧', icon: 'none' });
      return;
    }
    const recordId = D.todayStr() + '#' + id;
    wx.navigateTo({
      url: '/pages/cheer/cheer?recordId=' + encodeURIComponent(recordId) + '&label=' + encodeURIComponent(name),
    });
  },

  goCheer() {
    wx.navigateTo({ url: '/pages/cheer/cheer' });
  },
});
