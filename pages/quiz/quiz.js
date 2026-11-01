const store = require('../../utils/store');
const D = require('../../utils/date');
const QZ = require('../../utils/quiz');
const QB = require('../../utils/quiz-bank');
const T = require('../../utils/tasks');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const cloud = require('../../utils/cloud');

const SPRINT_SIZE = 20;

const SUBJECT_META = {
  math: { name: '数学', emoji: '🧮' },
  chinese: { name: '语文', emoji: '📕' },
  english: { name: '英语', emoji: '🔤' },
};

Page({
  data: {
    subjects: [],
    selected: 'math',
    units: [],
    selectedUnit: 0,
    phase: 'setup', // setup | play | done
    cards: [],
    idx: 0,
    total: 0,
    answered: 0,
    correctCount: 0,
    feedback: '', // '' | 'right' | 'wrong'
    optStates: [], // 当前题每个选项的状态：'' | 'sel' | 'right' | 'wrong'
    footHint: '选出正确的一项',
    explain: '', // 答错时的解析（为什么）
    verdict: null,
    mode: 'unit', // unit：按科目/单元组 10 题 | sprint：期末冲刺 20 题 | wrong：只练某单元错题
    breakdown: [], // 冲刺卷分单元结果
    historyLine: '',
    wrongCount: 0,
  },

  // 入口参数（都可选）：subject 科目；unit 单元（直接开这个单元的小卷，来自家长报告）；
  // wrong=1 只练这个单元的错题（来自错题本）；mode=sprint 直接开期末冲刺（来自首页倒计时）
  onLoad(options) {
    const o = options || {};
    this.date = D.todayStr();
    const subject = SUBJECT_META[o.subject] ? o.subject : this.data.selected;
    const unit = Number(o.unit) || 0;
    this.setData({
      subjects: QZ.subjects().map(s => ({
        key: s.key, name: SUBJECT_META[s.key].name, emoji: SUBJECT_META[s.key].emoji, count: s.count,
      })),
      selected: subject,
      units: this._unitsFor(subject),
      selectedUnit: unit,
    });
    this.refreshMeta();
    if (o.mode === 'sprint') this.onSprint();
    else if (unit && o.wrong === '1') this.onWrongOnly();
    else if (unit) this.onStart();
  },

  // 只练所选单元的错题；这组错题都已销账时提示并留在选择页
  onWrongOnly() {
    const quiz = QZ.buildWrongQuiz(this.data.selected, this.data.selectedUnit);
    if (!quiz.total) {
      wx.showToast({ title: '这组错题已经练完啦', icon: 'none' });
      return;
    }
    this._play('wrong', quiz);
  },

  onShow() { this.refreshMeta(); },

  onUnload() {
    if (this._t) { clearTimeout(this._t); this._t = null; }
  },

  refreshMeta() {
    const h = QZ.getHistory();
    const wrong = store.getQuizWrong();
    this.setData({
      historyLine: h.length
        ? '上次：' + (SUBJECT_META[h[0].subject] || {}).name + '小卷「' + h[0].label + '」'
        : '第一次练习，做完给等第哦',
      wrongCount: wrong.length,
    });
  },

  _unitsFor(subject) {
    return [...new Set(QZ.poolFor(subject).map(q => q.unit))].sort((a, b) => a - b)
      .map(value => ({ value, label: QB.unitLabel(value) }));
  },

  onPick(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ selected: key, selectedUnit: 0, units: this._unitsFor(key) });
  },

  onPickUnit(e) {
    this.setData({ selectedUnit: Number(e.currentTarget.dataset.unit) || 0 });
  },

  onStart() {
    const unit = this.data.selectedUnit || undefined;
    this._play('unit', QZ.buildQuiz(this.data.selected, 10, null, unit));
  },

  // 期末冲刺：全册每个单元都抽到，错得多的单元多抽
  onSprint() {
    this._play('sprint', QZ.buildSprint(this.data.selected, SPRINT_SIZE));
  },

  onAgain() {
    if (this.data.mode === 'sprint') this.onSprint();
    else if (this.data.mode === 'wrong' && QZ.buildWrongQuiz(this.data.selected, this.data.selectedUnit).total) this.onWrongOnly();
    else this.onStart();
  },

  // 期末复习期间（今日清单里有「期末冲刺」）做完冲刺卷自动打卡：全对 3⭐、≥80% 2⭐、其余 1⭐
  _checkinSprint() {
    const profile = store.getProfile();
    const grade = Number(profile && profile.grade) || 1;
    if (!T.generateDailyTasks(grade, this.date).some(t => t.id === 'exam_sprint')) return 0;
    const acc = this.data.total ? this.data.correctCount / this.data.total : 0;
    const stars = acc === 1 ? 3 : acc >= 0.8 ? 2 : 1;
    C.upsertRecord(this.date, 'exam_sprint', 1, stars, '期末冲刺 ' + this.data.correctCount + '/' + this.data.total);
    B.evaluate(store.getRecords(), profile);
    return stars;
  },

  _play(mode, { cards, total }) {
    this._results = [];
    this.setData({
      mode, breakdown: [],
      phase: 'play', cards, total,
      idx: 0, answered: 0, correctCount: 0,
      feedback: '', optStates: [],
      footHint: '选出正确的一项',
    });
  },

  _card() { return this.data.cards[this.data.idx]; },

  onOption(e) {
    if (this.data.feedback) return;
    const card = this._card();
    const idx = Number(e.currentTarget.dataset.index);
    if (card.type === 'multi') {
      const picked = this._multiPicked();
      const i = picked.indexOf(idx);
      if (i > -1) picked.splice(i, 1); else picked.push(idx);
      this._multiPicked(picked);
      this.setData({ optStates: card.options.map((_, k) => (picked.indexOf(k) > -1 ? 'sel' : '')) });
      return;
    }
    // 单选：立即判分
    const ok = idx === card.answerIndex;
    QZ.markResult(card, ok);
    this._results.push({ unit: card.unit, ok });
    const answered = this.data.answered + 1;
    const correctCount = this.data.correctCount + (ok ? 1 : 0);
    this._setSingleStates(card, idx, ok);
    const explain = ok ? '' : QZ.explainOf(card); // 答错说一句"为什么"，有解析时多停一会儿
    this.setData({ answered, correctCount, feedback: ok ? 'right' : 'wrong', explain });
    this._t = setTimeout(() => this.advance(answered), ok ? 600 : explain ? 2800 : 1400);
  },

  onMultiSubmit() {
    if (this.data.feedback) return;
    const card = this._card();
    const picked = this._multiPicked();
    if (!picked.length) {
      wx.showToast({ title: '先点选至少一项', icon: 'none' });
      return;
    }
    const ok = QZ.gradeMulti(card, picked);
    QZ.markResult(card, ok);
    this._results.push({ unit: card.unit, ok });
    const answered = this.data.answered + 1;
    const correctCount = this.data.correctCount + (ok ? 1 : 0);
    const states = card.options.map((_, i) => {
      if (card.answerSet.indexOf(i) > -1) return 'right';
      if (picked.indexOf(i) > -1) return 'wrong';
      return '';
    });
    const explain = ok ? '' : QZ.explainOf(card);
    this.setData({ answered, correctCount, feedback: ok ? 'right' : 'wrong', optStates: states, explain });
    this._t = setTimeout(() => this.advance(answered), ok ? 900 : explain ? 2800 : 1800);
  },

  // 多选题当前选中项（按题缓存；set 传入时为写入）
  _multiPicked(set) {
    if (this._pickedFor !== this.data.idx) {
      this._pickedFor = this.data.idx;
      this._pickedCache = [];
    }
    if (set) this._pickedCache = set.slice();
    return this._pickedCache;
  },

  _setSingleStates(card, pickedIdx, ok) {
    const states = card.options.map((_, i) => {
      if (i === card.answerIndex) return 'right';
      if (i === pickedIdx && !ok) return 'wrong';
      return '';
    });
    this.setData({ optStates: states });
  },

  advance(answered) {
    this._t = null;
    this._pickedFor = null;
    this._pickedCache = [];
    this.setData({
      feedback: '', optStates: [], explain: '',
      footHint: this._card() && this._card().type === 'multi' ? '可多选，选完点提交' : '选出正确的一项',
    });
    if (answered >= this.data.total) {
      const v = QZ.verdict(this.data.total, this.data.correctCount);
      const sprint = this.data.mode === 'sprint';
      const breakdown = QZ.unitBreakdown(this._results);
      QZ.saveHistory({
        subject: this.data.selected, total: this.data.total,
        correct: this.data.correctCount, label: v.label,
        units: breakdown.map(row => ({ unit: row.unit, total: row.total, correct: row.correct })), // 家长报告按单元汇总掌握情况
        ...(sprint ? { sprint: true } : {}),
      });
      const sprintStars = sprint ? this._checkinSprint() : 0;
      cloud.syncAll(); // 小卷历史上云，家长报告可见（节流 1 分钟，静默失败）
      this.setData({ phase: 'done', verdict: v, breakdown: sprint ? breakdown : [] });
      if (sprintStars) wx.showToast({ title: '期末冲刺打卡 +' + sprintStars + ' ⭐', icon: 'none' });
      this.refreshMeta();
    } else {
      const next = this.data.cards[this.data.idx + 1];
      this.setData({
        idx: this.data.idx + 1,
        footHint: next && next.type === 'multi' ? '可多选，选完点提交' : '选出正确的一项',
      });
    }
  },

  onBack() { wx.navigateBack(); },
});
