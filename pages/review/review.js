// 今日错题复习：口算 + 小卷到期错题混合，每组 5 题（排期见 utils/review.js）
const store = require('../../utils/store');
const D = require('../../utils/date');
const AR = require('../../utils/arithmetic');
const QZ = require('../../utils/quiz');
const B = require('../../utils/badges');
const RV = require('../../utils/review');
const DAILY = require('../../utils/daily');
const FC = require('../../utils/flashcards');
const UI = require('../../utils/display');
const cloud = require('../../utils/cloud');

const SUBJ = require('../../utils/subjects');

Page({
  data: {
    mode: 'review', // review：到期错题复习 | today：今日一练
    phase: 'play', // play | done | empty
    cards: [],
    idx: 0,
    total: 0,
    answered: 0,
    correctCount: 0,
    input: '',
    feedback: '', // '' | 'right' | 'wrong'
    wrongText: '',
    explain: '', // 答错时的方法提示 / 解析
    flipped: false, // 记忆卡是否已翻面
    optStates: [],
    mastered: 0,
    promoted: 0,
    remaining: 0,
    newBadge: '',
  },

  // options.mode === 'today'：今日一练（3 题口算 + 5 题小卷，见 utils/daily.js）；默认是到期错题复习
  onLoad(options) {
    this.today = D.todayStr();
    this.mode = options && options.mode === 'today' ? 'today' : 'review';
    this.setData({ mode: this.mode, big: UI.bigFont() });
    this.start();
  },

  onUnload() {
    if (this._t) { clearTimeout(this._t); this._t = null; }
  },

  start() {
    let cards;
    if (this.mode === 'today') {
      const profile = store.getProfile() || {};
      cards = DAILY.build({ grade: Number(profile.grade) || 1, date: this.today, quizHistory: store.getQuizHistory() }).cards;
    } else {
      const queue = RV.dailyQueue(this.today);
      if (!queue.length) {
        this.setData({ phase: 'empty' });
        return;
      }
      // 统一成会话卡：口算走数字键盘，小卷走选项（选项每次重新打乱）
      cards = queue.map(it => (it.source === 'math'
        ? { source: 'math', key: it.key, level: it.level, problem: it.problem, tag: '口算', text: AR.textOf(it.problem) }
        : { ...QZ.instantiate(it.question, Math.random), source: 'quiz', key: it.key, tag: SUBJ.nameOf(it.question.subject) + '小卷' }));
    }
    this._results = [];
    this._picked = [];
    this.setData({
      phase: 'play', cards, total: cards.length,
      idx: 0, answered: 0, correctCount: 0, input: '',
      feedback: '', wrongText: '', optStates: [],
      mastered: 0, promoted: 0, newBadge: '',
    });
  },

  _card() { return this.data.cards[this.data.idx]; },

  // 记一次作答：走各自错题本的 markResult（与口算/小卷同一套排期）
  _record(ok) {
    const c = this._card();
    // 记忆卡不进错题本，掌握进度由 flashcards.markCard 记（见 onFlash）
    const res = c.source === 'math' ? AR.markResult(c.problem, ok, c.level, this.today)
      : c.source === 'quiz' ? QZ.markResult(c, ok, this.today) : 'none';
    this._results.push(c.source === 'math' ? { source: 'math', level: c.level, ok }
      : c.source === 'quiz' ? { source: 'quiz', subject: c.subject, unit: c.unit, ok } : { source: 'flash', ok });
    const answered = this.data.answered + 1;
    this.setData({
      answered,
      correctCount: this.data.correctCount + (ok ? 1 : 0),
      mastered: this.data.mastered + (res === 'mastered' ? 1 : 0),
      promoted: this.data.promoted + (res === 'promoted' ? 1 : 0),
      feedback: ok ? 'right' : 'wrong',
      // 答错时说明方法：口算给凑十 / 破十提示，小卷给「为什么」
      explain: ok || c.source === 'flash' ? '' : c.source === 'math' ? AR.hintOf(c.problem) : QZ.explainOf(c),
    });
    return answered;
  },

  // 判分后停留时长：答对短、答错长，有提示时再长一点让孩子看完
  _delay(ok, base) { return ok ? base[0] : this.data.explain ? 2800 : base[1]; },

  // ── 口算：数字键盘 ──
  onKey(e) {
    if (this.data.feedback || this.data.input.length >= 4) return;
    this.setData({ input: this.data.input + e.currentTarget.dataset.d });
  },

  onDel() {
    if (this.data.feedback) return;
    this.setData({ input: this.data.input.slice(0, -1) });
  },

  onConfirm() {
    if (this.data.feedback || this.data.input === '') return;
    const c = this._card();
    const ok = AR.check(c.problem, this.data.input);
    if (!ok) this.setData({ wrongText: c.text + '  正确答案 ' + c.problem.answer });
    const answered = this._record(ok);
    this._t = setTimeout(() => this.advance(answered), this._delay(ok, [450, 1400]));
  },

  // ── 记忆卡（今日一练末尾）：先翻面看答案，再自评 认识 / 再练练 ──
  onFlip() {
    if (this.data.feedback) return;
    this.setData({ flipped: true });
  },

  onFlash(e) {
    if (this.data.feedback || !this.data.flipped) return;
    const c = this._card();
    const known = e.currentTarget.dataset.known === true || e.currentTarget.dataset.known === 'true';
    FC.markCard(c.deckId, c.front, known);
    const answered = this._record(known);
    this._t = setTimeout(() => this.advance(answered), 300);
  },

  // ── 小卷：单选立即判分，多选点提交 ──
  onOption(e) {
    if (this.data.feedback) return;
    const c = this._card();
    const idx = Number(e.currentTarget.dataset.index);
    if (c.type === 'multi') {
      const i = this._picked.indexOf(idx);
      if (i > -1) this._picked.splice(i, 1); else this._picked.push(idx);
      this.setData({ optStates: c.options.map((_, k) => (this._picked.indexOf(k) > -1 ? 'sel' : '')) });
      return;
    }
    const ok = idx === c.answerIndex;
    this.setData({
      optStates: c.options.map((_, i) => (i === c.answerIndex ? 'right' : i === idx && !ok ? 'wrong' : '')),
    });
    const answered = this._record(ok);
    this._t = setTimeout(() => this.advance(answered), this._delay(ok, [600, 1400]));
  },

  onMultiSubmit() {
    if (this.data.feedback) return;
    if (!this._picked.length) {
      wx.showToast({ title: '先点选至少一项', icon: 'none' });
      return;
    }
    const c = this._card();
    const ok = QZ.gradeMulti(c, this._picked);
    this.setData({
      optStates: c.options.map((_, i) => (c.answerSet.indexOf(i) > -1 ? 'right' : this._picked.indexOf(i) > -1 ? 'wrong' : '')),
    });
    const answered = this._record(ok);
    this._t = setTimeout(() => this.advance(answered), this._delay(ok, [900, 1800]));
  },

  advance(answered) {
    this._t = null;
    this._picked = [];
    this.setData({ feedback: '', input: '', wrongText: '', explain: '', optStates: [], flipped: false });
    if (answered >= this.data.total) this.finish();
    else this.setData({ idx: this.data.idx + 1 });
  },

  finish() {
    // 今日一练记入口算会话 / 小卷历史（家长报告可见）；不算"错题复习"，不影响错题克星勋章
    if (this.mode === 'today') DAILY.record(this._results, this.today);
    else RV.logSession(this.today, this.data.total, this.data.correctCount);
    const profile = store.getProfile();
    const fresh = B.evaluate(store.getRecords(), profile);
    const b = fresh.length ? B.badgeById(fresh[0].id) : null;
    if (b) {
      cloud.notifyParents(
        (profile && profile.nickname ? profile.nickname : '孩子') + '达成新勋章',
        '「' + b.name + '」'
      );
    }
    cloud.syncAll(); // 新勋章上云（节流 1 分钟，静默失败）
    this.setData({
      phase: 'done',
      remaining: this.mode === 'today' ? 0 : RV.dueCount(this.today),
      newBadge: b ? b.emoji + ' ' + b.name : '',
    });
  },

  onMore() { this.start(); },

  onBack() { wx.navigateBack(); },
});
