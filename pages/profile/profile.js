const store = require('../../utils/store');
const C = require('../../utils/checkin');
const CTX = require('../../utils/context');
const cloud = require('../../utils/cloud');

const AVATARS = ['🐱', '🦊', '🐰', '🐻', '🐸', '🦁', '🐼', '🐷'];
const APP_VERSION = '0.7.1';

Page({
  data: {
    avatars: AVATARS,
    grades: [1, 2, 3, 4, 5],
    profile: null,
    role: 'child',
    nickname: '',
    avatar: '',
    grade: 0,
    school: '',
    totalStars: 0,
    streak: 0,
    checkinDays: 0,
    version: APP_VERSION,
    // 云能力
    cloudOn: false,
    familyCode: '',
    childInfo: null,
    bindCode: '',
    remindText: '',
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    const profile = store.getProfile();
    if (!profile || !profile.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }
    const s = CTX.scope();
    const records = s.records;
    const grade = s.grade;
    this.setData({
      profile,
      role: s.role,
      nickname: profile.nickname,
      avatar: profile.avatar,
      grade: Number(profile.grade) || 0,
      school: profile.school || '',
      totalStars: C.totalStars(records, grade, s.badges),
      streak: C.streaks(records).current,
      checkinDays: new Set(records.map(r => r.date)).size,
      cloudOn: cloud.isAvailable(),
      childInfo: s.role === 'parent' ? store.getChildProfile() : null,
    });
    this.loadCloudInfo(s.role);
  },

  loadCloudInfo(role) {
    if (!cloud.isAvailable()) return;
    if (role === 'child') {
      cloud.familyCreate().then(res => {
        if (res && res.ok) this.setData({ familyCode: res.code });
      });
      cloud.remindStatus().then(res => {
        if (res && res.ok) {
          this.setData({
            remindText: res.enabled
              ? '已开启 · 每天 ' + res.hour + ':00 左右提醒（剩余 ' + res.quota + ' 次授权）'
              : '未开启 · 建议每天 20:00 提醒打卡',
          });
        }
      });
    }
  },

  // 云端自检：验证环境 ID 配置与 login 云函数部署是否成功
  checkCloud() {
    wx.showLoading({ title: '检测中…' });
    cloud.call('login', {}).then(res => {
      wx.hideLoading();
      if (res && res.ok) {
        wx.showToast({ title: '云端连接正常 ✓', icon: 'none' });
      } else if (res && res.error) {
        wx.showModal({ title: '连接失败', content: 'login 云函数异常：' + res.error + '。请确认已在开发者工具中上传部署。', showCancel: false });
      } else {
        wx.showModal({ title: '连接失败', content: '请检查 utils/cloud.js 的环境 ID，以及 5 个云函数是否已「上传并部署」。', showCancel: false });
      }
    });
  },

  pickAvatar(e) { this.setData({ avatar: e.currentTarget.dataset.emoji }); },
  pickGrade(e) { this.setData({ grade: Number(e.currentTarget.dataset.grade) }); },
  onNickname(e) { this.setData({ nickname: e.detail.value }); },
  onSchool(e) { this.setData({ school: e.detail.value }); },
  onBindInput(e) { this.setData({ bindCode: e.detail.value }); },

  save() {
    const { profile, nickname, avatar, grade, school } = this.data;
    if (!nickname) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' });
      return;
    }
    store.saveProfile({ ...profile, nickname, avatar, grade, school });
    wx.showToast({ title: '已保存 ✓', icon: 'none' });
    this.onShow();
  },

  // ── 家人绑定 ──
  copyCode() {
    if (!this.data.familyCode) return;
    wx.setClipboardData({
      data: this.data.familyCode,
      success: () => wx.showToast({ title: '已复制，发给家长吧', icon: 'none' }),
    });
  },

  bind() {
    const code = this.data.bindCode;
    if (!code) { wx.showToast({ title: '请输入邀请码', icon: 'none' }); return; }
    cloud.familyJoin(code).then(res => {
      if (res && res.ok) {
        return cloud.familyRefresh().then(() => {
          wx.showToast({ title: '绑定成功 🎉', icon: 'none' });
          this.onShow();
        });
      }
      wx.showToast({ title: (res && res.error) || '绑定失败', icon: 'none' });
    });
  },

  unbind() {
    wx.showModal({
      title: '解除绑定',
      content: '解绑后将不再看到孩子的打卡数据，确定吗？',
      confirmColor: '#FF5A3C',
      success: res => {
        if (!res.confirm) return;
        cloud.familyLeave().then(() => {
          store.clearChildData();
          wx.showToast({ title: '已解绑', icon: 'none' });
          this.onShow();
        });
      },
    });
  },

  switchRole() {
    const toRole = this.data.role === 'child' ? 'parent' : 'child';
    wx.showModal({
      title: '切换身份',
      content: toRole === 'parent'
        ? '切换到「家长模式」后，首页将展示绑定孩子的打卡数据（只读）。'
        : '切换回「孩子模式」打卡。数据互不影响，随时可再切换。',
      success: res => {
        if (!res.confirm) return;
        store.saveProfile({ ...this.data.profile, role: toRole, grade: toRole === 'parent' ? 0 : (this.data.profile.grade || 3) });
        wx.reLaunch({ url: '/pages/index/index' });
      },
    });
  },

  // ── 订阅消息 ──
  subscribeRemind() {
    cloud.subscribeAndGrant('remind').then(res => {
      if (res.ok) wx.showToast({ title: '已开启每日提醒 🔔', icon: 'none' });
      else wx.showToast({ title: res.error || '未完成订阅', icon: 'none' });
      this.loadCloudInfo('child');
    });
  },

  subscribeParent() {
    cloud.subscribeAndGrant('parent').then(res => {
      if (res.ok) wx.showToast({ title: '开启成功，孩子达成里程碑会通知你 🔔', icon: 'none' });
      else wx.showToast({ title: res.error || '未完成订阅', icon: 'none' });
    });
  },

  goTaskManage() {
    wx.navigateTo({ url: '/pages/tasks-manage/tasks-manage' });
  },

  // ── 数据管理 ──
  exportData() {
    const data = JSON.stringify({
      profile: store.getProfile(),
      records: store.getRecordsRaw(),
      badges: store.getBadges(),
    });
    wx.setClipboardData({
      data,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'none' }),
    });
  },

  clearData() {
    wx.showModal({
      title: '清空所有数据',
      content: '将删除本机的全部打卡记录、勋章和资料，无法恢复。确定继续吗？',
      confirmColor: '#FF5A3C',
      success: res => {
        if (!res.confirm) return;
        wx.showModal({
          title: '再次确认',
          content: '真的要重新开始吗？建议先「导出数据」备份。',
          confirmColor: '#FF5A3C',
          success: r2 => {
            if (r2.confirm) {
              store.clearAll();
              wx.reLaunch({ url: '/pages/onboarding/onboarding' });
            }
          },
        });
      },
    });
  },
});
