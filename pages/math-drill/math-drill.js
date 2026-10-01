const store = require('../../utils/store');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const T = require('../../utils/tasks');
const D = require('../../utils/date');
const cloud = require('../../utils/cloud');
const AR = require('../../utils/arithmetic');

Page({
  data: {
    levels: [],
    level: '',
    levelName: '',
    problems: [],
    idx: 0,
    input: '',
    total: 0,
    answered: 0,
    correctCount: 0,
    feedback: '', // '' | 'right' | 'wrong'
    wrongText: '',
    phase: 'drill', // drill | done
    stars: 0,
  },

  onLoad() {
    this.date = D.todayStr();
    const profile = store.getProfile();
    this.grade = Number(profile && profile.grade) || 1;
    const task = T.buildTask('math_calc', this.grade, true);
    this.target = task.target;
    this.setData({ levels: AR.LEVEL_ORDER.map(k => ({ key: k, name: AR.LEVELS[k].name })) });
    this.startSession(AR.recommendByGrade(this.grade));
  },

  onUnload() {
    if (this._pendingAdvance) { clearTimeout(this._pendingAdvance); this._pendingAdvance = null; }
  },

  startSession(level) {
    const problems = AR.buildSession(level, this.target).map(p => ({ ...p, text: AR.textOf(p) }));
    this.level = level;
    this.setData({
      level,
      levelName: AR.LEVELS[level].name,
      problems,
      total: problems.length,
      idx: 0,
      input: '',
      answered: 0,
      correctCount: 0,
      feedback: '',
      wrongText: '',
      phase: 'drill',
    });
  },

  onLevel(e) {
    const key = e.currentTarget.dataset.key;
    if (key && key !== this.level) this.startSession(key);
  },

  current() { return this.data.problems[this.data.idx]; },

  onKey(e) {
    if (this.data.feedback) return; // 判分反馈期间锁定
    if (this.data.input.length >= 4) return;
    this.setData({ input: this.data.input + e.currentTarget.dataset.d });
  },

  onDel() {
    if (this.data.feedback) return;
    this.setData({ input: this.data.input.slice(0, -1) });
  },

  onConfirm() {
    if (this.data.feedback) return;
    const p = this.current();
    if (!p || this.data.input === '') return;
    const ok = AR.check(p, this.data.input);
    AR.markResult(p, ok, this.level);
    const answered = this.data.answered + 1;
    const correctCount = this.data.correctCount + (ok ? 1 : 0);
    if (ok) {
      this.setData({ answered, correctCount, feedback: 'right' });
      this._pendingAdvance = setTimeout(() => this.advance(answered), 350);
    } else {
      this.setData({
        answered, correctCount, feedback: 'wrong',
        wrongText: p.text + '  正确答案 ' + p.answer,
      });
      this._pendingAdvance = setTimeout(() => this.advance(answered), 1100);
    }
  },

  advance(answered) {
    this._pendingAdvance = null;
    this.setData({ feedback: '', input: '', wrongText: '' });
    if (answered >= this.data.total) {
      const acc = answered ? this.data.correctCount / answered : 0;
      this.setData({ phase: 'done', stars: acc === 1 ? 3 : acc >= 0.8 ? 2 : 1 });
    } else {
      this.setData({ idx: this.data.idx + 1 });
    }
  },

  onEarlyFinish() {
    if (this.data.answered < 5) {
      wx.showToast({ title: '至少完成 5 题再打卡哦', icon: 'none' });
      return;
    }
    this.complete();
  },

  onFinish() { this.complete(); },

  complete() {
    if (this._pendingAdvance) { clearTimeout(this._pendingAdvance); this._pendingAdvance = null; }
    const answered = this.data.answered;
    const acc = answered ? this.data.correctCount / answered : 0;
    const stars = acc === 1 ? 3 : acc >= 0.8 ? 2 : 1;
    C.upsertRecord(this.date, 'math_calc', answered, stars, '口算挑战 正确 ' + this.data.correctCount + '/' + answered);
    const profile = store.getProfile();
    const fresh = B.evaluate(store.getRecords(), profile);
    if (fresh.length) {
      const b = B.badgeById(fresh[0].id);
      cloud.notifyParents(
        (profile && profile.nickname ? profile.nickname : '孩子') + '达成新勋章',
        b ? '「' + b.name + '」' : '继续加油！'
      );
    }
    cloud.syncAll();
    wx.showToast({ title: '打卡成功 +' + stars + ' ⭐', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 700);
  },

  onRestart() { this.startSession(this.level); },
});
