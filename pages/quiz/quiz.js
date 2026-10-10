const store = require('../../utils/store');
const D = require('../../utils/date');
const QZ = require('../../utils/quiz');

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
    verdict: null,
    historyLine: '',
    wrongCount: 0,
  },

  onLoad() {
    this.date = D.todayStr();
    this.setData({
      subjects: QZ.subjects().map(s => ({
        key: s.key, name: SUBJECT_META[s.key].name, emoji: SUBJECT_META[s.key].emoji, count: s.count,
      })),
      units: this._unitsFor(this.data.selected),
    });
    this.refreshMeta();
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
    return [...new Set(QZ.poolFor(subject).map(q => q.unit))].sort((a, b) => a - b);
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
    const { cards, total } = QZ.buildQuiz(this.data.selected, 10, null, unit);
    this.setData({
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
    const answered = this.data.answered + 1;
    const correctCount = this.data.correctCount + (ok ? 1 : 0);
    this._setSingleStates(card, idx, ok);
    this.setData({ answered, correctCount, feedback: ok ? 'right' : 'wrong' });
    this._t = setTimeout(() => this.advance(answered), ok ? 600 : 1400);
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
    const answered = this.data.answered + 1;
    const correctCount = this.data.correctCount + (ok ? 1 : 0);
    const states = card.options.map((_, i) => {
      if (card.answerSet.indexOf(i) > -1) return 'right';
      if (picked.indexOf(i) > -1) return 'wrong';
      return '';
    });
    this.setData({ answered, correctCount, feedback: ok ? 'right' : 'wrong', optStates: states });
    this._t = setTimeout(() => this.advance(answered), ok ? 900 : 1800);
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
      feedback: '', optStates: [],
      footHint: this._card() && this._card().type === 'multi' ? '可多选，选完点提交' : '选出正确的一项',
    });
    if (answered >= this.data.total) {
      const v = QZ.verdict(this.data.total, this.data.correctCount);
      QZ.saveHistory({
        subject: this.data.selected, total: this.data.total,
        correct: this.data.correctCount, label: v.label,
      });
      this.setData({ phase: 'done', verdict: v });
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
