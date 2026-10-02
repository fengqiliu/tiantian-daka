const store = require('../../utils/store');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const cloud = require('../../utils/cloud');
const CAL = require('../../utils/calendar-config');

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
    });
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

  onParentTaskTap() {
    wx.showToast({ title: '家长端只读，去孩子手机上打卡吧', icon: 'none' });
  },
});
