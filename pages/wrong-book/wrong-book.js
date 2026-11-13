const store = require('../../utils/store');
const AR = require('../../utils/arithmetic');
const CTX = require('../../utils/context');
const D = require('../../utils/date');
const RV = require('../../utils/review');

const LEVEL_NAME = {};
Object.keys(AR.LEVELS).forEach(k => { LEVEL_NAME[k] = AR.LEVELS[k].name; });
const SUBJ = require('../../utils/subjects');
const QZ = require('../../utils/quiz');
const EXPORT = require('../../utils/wrongexport');

Page({
  data: {
    mathGroups: [],
    quizGroups: [],
    mathCount: 0,
    quizCount: 0,
    dueCount: 0,
    readOnly: false,
    filters: { subject: '', dueOnly: false },
    subjectOptions: [{ key: '', name: '全部' }].concat(SUBJ.SUBJECTS.map(s => ({ key: s.key, name: s.name }))),
    shown: 0,
    conqueredCount: 0,
    conquered: [],
    emptyHint: '',
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
    // 筛选：科目（口算属于数学）+ 只看今天到期的；总数、清空与导出不受筛选影响
    const f = this.data.filters;
    const keep = (w, subject) => (!f.subject || f.subject === subject) && (!f.dueOnly || RV.isDue(w, today));
    const mathWrong = s.mathWrong.filter(w => keep(w, 'math'));
    // 口算错题：按级别分组
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
    const quizWrong = s.quizWrong.filter(w => keep(w, w.subject));
    const byUnit = {};
    quizWrong.forEach(w => {
      const unit = w.question.unit;
      const key = w.subject + '#' + unit;
      const grp = byUnit[key] || (byUnit[key] = {
        key, subject: w.subject, unit,
        name: SUBJ.nameOf(w.subject) + ' · ' + SUBJ.unitLabel(unit),
        items: [],
      });
      grp.items.push({
        key: w.key,
        text: w.question.prompt,
        answer: w.question.answerText || (w.question.answers || []).join('、'),
        explain: QZ.explainOf(w.question),
        wrongCount: w.wrongCount,
        schedule: this._schedule(w, today),
      });
    });
    const quizGroups = Object.values(byUnit)
      .sort(SUBJ.compareUnits);

    const total = s.mathWrong.length + s.quizWrong.length;
    const shown = mathWrong.length + quizWrong.length;
    this.setData({
      mathGroups,
      quizGroups,
      mathCount: s.mathWrong.length,
      quizCount: s.quizWrong.length,
      shown,
      emptyHint: total && !shown ? '这个条件下没有错题' : '',
      // 已攻克的错题（只存孩子本机，家长端不显示）
      conqueredCount: s.readOnly ? 0 : RV.conquered().length,
      conquered: s.readOnly ? [] : RV.conquered().slice(0, 10).map(x => ({ key: x.source + x.key, text: x.text, tag: x.tag, dateLabel: D.dateLabel(x.date) })),
      dueCount: s.readOnly ? 0 : RV.dueCount(today),
      readOnly: s.readOnly,
    });
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  onFilterSubject(e) {
    this.setData({ filters: { ...this.data.filters, subject: e.currentTarget.dataset.key || '' } });
    this.refresh();
  },

  onToggleDue() {
    this.setData({ filters: { ...this.data.filters, dueOnly: !this.data.filters.dueOnly } });
    this.refresh();
  },

  // 导出错题：整理成文字复制到剪贴板（孩子端与家长端都可用，家长可粘贴到文档打印）
  onExport() {
    if (!this.data.mathCount && !this.data.quizCount) {
      wx.showToast({ title: '还没有错题，不用导出哦', icon: 'none' });
      return;
    }
    const s = CTX.scope();
    const who = s.role === 'parent' ? s.child : s.profile;
    const text = EXPORT.build({
      mathWrong: s.mathWrong, quizWrong: s.quizWrong,
      nickname: who && who.nickname, date: D.todayStr(),
    });
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制 ' + (this.data.mathCount + this.data.quizCount) + ' 道错题，粘贴到文档即可打印', icon: 'none' }),
    });
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
