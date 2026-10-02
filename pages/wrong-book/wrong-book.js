const store = require('../../utils/store');
const AR = require('../../utils/arithmetic');

const LEVEL_NAME = {};
Object.keys(AR.LEVELS).forEach(k => { LEVEL_NAME[k] = AR.LEVELS[k].name; });
const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };

Page({
  data: {
    mathGroups: [],
    quizGroups: [],
    mathCount: 0,
    quizCount: 0,
  },

  onShow() { this.refresh(); },

  refresh() {
    // 口算错题：按级别分组
    const mathWrong = store.getMathWrong();
    const byLevel = {};
    mathWrong.forEach(w => {
      const name = LEVEL_NAME[w.level] || w.level;
      (byLevel[name] = byLevel[name] || []).push({
        key: w.key,
        text: AR.textOf(w.problem),
        answer: w.problem.answer,
        wrongCount: w.wrongCount,
      });
    });
    const mathGroups = Object.keys(byLevel).map(name => ({ name, items: byLevel[name] }));

    // 小卷错题：按科目分组
    const quizWrong = store.getQuizWrong();
    const bySubject = {};
    quizWrong.forEach(w => {
      const name = SUBJECT_NAME[w.subject] || w.subject;
      (bySubject[name] = bySubject[name] || []).push({
        key: w.key,
        text: w.question.prompt,
        answer: w.question.answerText,
        wrongCount: w.wrongCount,
      });
    });
    const quizGroups = Object.keys(bySubject).map(name => ({ name, items: bySubject[name] }));

    this.setData({
      mathGroups,
      quizGroups,
      mathCount: mathWrong.length,
      quizCount: quizWrong.length,
    });
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
    if (!count) return;
    wx.showModal({
      title: '清空' + name,
      content: '共 ' + count + ' 题。清空后这些题不再自动重练（建议先让孩子练一遍）。确定清空吗？',
      confirmColor: '#FF5A3C',
      success: res => { if (res.confirm) cb(); },
    });
  },
});
