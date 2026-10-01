const store = require('../../utils/store');

const AVATARS = ['🐱', '🦊', '🐰', '🐻', '🐸', '🦁', '🐼', '🐷'];
const GRADE_HINTS = { 1: '低年级 · 快乐起点', 2: '低年级 · 快乐起点', 3: '中年级 · 稳步前进', 4: '中年级 · 稳步前进', 5: '高年级 · 冲刺准备' };

Page({
  data: {
    step: 0,
    role: 'child', // child=孩子打卡 parent=家长查看
    avatars: AVATARS,
    avatar: AVATARS[0],
    grades: [1, 2, 3, 4, 5],
    grade: 0,
    gradeHint: '',
    nickname: '',
    school: '',
  },

  pickRole(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ role, step: role === 'parent' ? 3 : 1 });
  },

  goStep(e) {
    const step = Number(e.currentTarget.dataset.step);
    if (step === 2 && !this.data.grade) return;
    this.setData({ step });
  },

  pickAvatar(e) {
    this.setData({ avatar: e.currentTarget.dataset.emoji });
  },

  pickGrade(e) {
    const grade = Number(e.currentTarget.dataset.grade);
    this.setData({ grade, gradeHint: GRADE_HINTS[grade] });
  },

  onNickname(e) { this.setData({ nickname: e.detail.value }); },
  onSchool(e) { this.setData({ school: e.detail.value }); },

  finish() {
    const { role, grade, nickname, avatar, school } = this.data;
    if (role === 'child' && !grade) {
      wx.showToast({ title: '先选择年级哦', icon: 'none' });
      this.setData({ step: 1 });
      return;
    }
    store.saveProfile({
      role,
      nickname: nickname || (role === 'parent' ? '家长' : '小达人'),
      avatar,
      grade: role === 'parent' ? 0 : grade,
      school: school || '',
      createdAt: Date.now(),
      onboarded: true,
    });
    wx.switchTab({ url: '/pages/index/index' });
  },
});
