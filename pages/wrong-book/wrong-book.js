const store = require('../../utils/store');
const AR = require('../../utils/arithmetic');
const CTX = require('../../utils/context');
const D = require('../../utils/date');
const RV = require('../../utils/review');

const LEVEL_NAME = {};
Object.keys(AR.LEVELS).forEach(k => { LEVEL_NAME[k] = AR.LEVELS[k].name; });
const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };

Page({
  data: {
    mathGroups: [],
    quizGroups: [],
    mathCount: 0,
    quizCount: 0,
    dueCount: 0,
    readOnly: false,
  },

  onShow() { this.refresh(); },

  // 复习进度："第 2/3 轮 · 10月12日 · 周一复习"；到期显示"今天复习"
  _schedule(w, today) {
    const round = '第 ' + ((w.box || 0) + 1) + '/' + RV.MASTER_BOX + ' 轮 · ';
    return round + (RV.isDue(w, today) ? '今天复习' : D.dateLabel(w.due) + '复习');
  },

  refresh() {
    const today = D.todayStr();
    // 数据作用域：孩子端读本机，家长端只读孩子缓存（随家人同步更新）
    const s = CTX.scope();
    // 口算错题：按级别分组
    const mathWrong = s.mathWrong;
    const byLevel = {};
    mathWrong.forEach(w => {
      const name = LEVEL_NAME[w.level] || w.level;
      (byLevel[name] = byLevel[name] || []).push({
        key: w.key,
        text: AR.textOf(w.problem),
        answer: w.problem.answer,
        wrongCount: w.wrongCount,
        schedule: this._schedule(w, today),
      });
    });
    const mathGroups = Object.keys(byLevel).map(name => ({ name, items: byLevel[name] }));

    // 小卷错题：按科目分组
    const quizWrong = s.quizWrong;
    const bySubject = {};
    quizWrong.forEach(w => {
      const name = SUBJECT_NAME[w.subject] || w.subject;
      (bySubject[name] = bySubject[name] || []).push({
        key: w.key,
        text: w.question.prompt,
        answer: w.question.answerText || (w.question.answers || []).join('、'),
        wrongCount: w.wrongCount,
        schedule: this._schedule(w, today),
      });
    });
    const quizGroups = Object.keys(bySubject).map(name => ({ name, items: bySubject[name] }));

    this.setData({
      mathGroups,
      quizGroups,
      mathCount: mathWrong.length,
      quizCount: quizWrong.length,
      dueCount: s.readOnly ? 0 : RV.dueCount(today),
      readOnly: s.readOnly,
    });
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  onClearMath() {
    this._confirmClear('口算错题本', this.data.mathCount, () => {
      store.saveMathWrong([]);
      this.refresh();
    });
  },

  onClearQuiz() {
    this._confirmClear('小卷错题本', this.data.quizCount, () => {
      store.saveQuizWrong([]);
      this.refresh();
    });
  },

  _confirmClear(name, count, cb) {
    if (!count || this.data.readOnly) return;
    wx.showModal({
      title: '清空' + name,
      content: '共 ' + count + ' 题。清空后这些题不再自动重练（建议先让孩子练一遍）。确定清空吗？',
      confirmColor: '#FF5A3C',
      success: res => { if (res.confirm) cb(); },
    });
  },
});
