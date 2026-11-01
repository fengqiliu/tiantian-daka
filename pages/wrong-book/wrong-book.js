const store = require('../../utils/store');
const AR = require('../../utils/arithmetic');
const CTX = require('../../utils/context');
const D = require('../../utils/date');
const RV = require('../../utils/review');

const LEVEL_NAME = {};
Object.keys(AR.LEVELS).forEach(k => { LEVEL_NAME[k] = AR.LEVELS[k].name; });
const QB = require('../../utils/quiz-bank');

const SUBJECT_NAME = { math: '数学', chinese: '语文', english: '英语' };
const SUBJECT_ORDER = ['math', 'chinese', 'english'];

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
        hint: AR.hintOf(w.problem),
        wrongCount: w.wrongCount,
        schedule: this._schedule(w, today),
      });
    });
    const mathGroups = Object.keys(byLevel).map(name => ({ name, items: byLevel[name] }));

    // 小卷错题：按「科目 · 单元」分组（数学→语文→英语，单元升序，期末在最后），孩子端可只练这一组
    const quizWrong = s.quizWrong;
    const byUnit = {};
    quizWrong.forEach(w => {
      const unit = w.question.unit;
      const key = w.subject + '#' + unit;
      const grp = byUnit[key] || (byUnit[key] = {
        key, subject: w.subject, unit,
        name: (SUBJECT_NAME[w.subject] || w.subject) + ' · ' + QB.unitLabel(unit),
        items: [],
      });
      grp.items.push({
        key: w.key,
        text: w.question.prompt,
        answer: w.question.answerText || (w.question.answers || []).join('、'),
        wrongCount: w.wrongCount,
        schedule: this._schedule(w, today),
      });
    });
    const quizGroups = Object.values(byUnit)
      .sort((a, b) => SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject) || a.unit - b.unit);

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

  // 只练这个单元的错题（家长端只读，不跳转）
  onPracticeUnit(e) {
    if (this.data.readOnly) return;
    const { subject, unit } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/quiz/quiz?subject=' + subject + '&unit=' + unit + '&wrong=1' });
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
