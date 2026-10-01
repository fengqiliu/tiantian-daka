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
    phase: 'setup', // setup | play | done
    cards: [],
    idx: 0,
    total: 0,
    answered: 0,
    correctCount: 0,
    feedback: '', // '' | 'right' | 'wrong'
    pickedIndex: -1,
    rightIndex: -1,
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

  onPick(e) {
    this.setData({ selected: e.currentTarget.dataset.key });
  },

  onStart() {
    const { cards, total } = QZ.buildQuiz(this.data.selected, 10);
    this.setData({
      phase: 'play', cards, total,
      idx: 0, answered: 0, correctCount: 0,
      feedback: '', pickedIndex: -1, rightIndex: -1,
    });
  },

  onOption(e) {
    if (this.data.feedback) return;
    const card = this.data.cards[this.data.idx];
    const picked = Number(e.currentTarget.dataset.index);
    const ok = picked === card.answerIndex;
    QZ.markResult(card, ok);
    const answered = this.data.answered + 1;
    const correctCount = this.data.correctCount + (ok ? 1 : 0);
    this.setData({
      answered, correctCount,
      feedback: ok ? 'right' : 'wrong',
      pickedIndex: picked,
      rightIndex: card.answerIndex,
    });
    this._t = setTimeout(() => this.advance(answered), ok ? 600 : 1400);
  },

  advance(answered) {
    this._t = null;
    this.setData({ feedback: '', pickedIndex: -1, rightIndex: -1 });
    if (answered >= this.data.total) {
      const v = QZ.verdict(this.data.total, this.data.correctCount);
      QZ.saveHistory({
        subject: this.data.selected, total: this.data.total,
        correct: this.data.correctCount, label: v.label,
      });
      this.setData({ phase: 'done', verdict: v });
      this.refreshMeta();
    } else {
      this.setData({ idx: this.data.idx + 1 });
    }
  },

  onBack() { wx.navigateBack(); },
});
