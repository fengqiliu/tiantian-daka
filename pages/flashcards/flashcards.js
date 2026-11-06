const FC = require('../../utils/flashcards');
const CTX = require('../../utils/context');
const B = require('../../utils/badges');
const store = require('../../utils/store');
const cloud = require('../../utils/cloud');

const SUBJECT_META = {
  chinese: { name: '语文', emoji: '📕' },
  english: { name: '英语', emoji: '🔤' },
};

Page({
  data: {
    phase: 'decks', // decks | play | done
    groups: [],
    deckId: '',
    deckName: '',
    cards: [],
    total: 0,
    idx: 0,
    flipped: false,
    sessionKnown: 0,
    newBadge: '',
    isChinese: false,
    cardClass: 'en', // cn：大字 / en：单词 / ma：数学题面
  },

  onLoad() {
    if (CTX.scope().role === 'parent') {
      wx.showToast({ title: '记忆卡在孩子设备上练习', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.refresh();
  },

  onShow() { if (this.data.phase === 'decks') this.refresh(); },

  refresh() {
    const groups = [
      { key: 'chinese', name: '语文生字', emoji: '📕' },
      { key: 'english', name: '英语单词', emoji: '🔤' },
      { key: 'math', name: '数学小卡片', emoji: '🧮' },
    ].map(g => ({
      ...g,
      decks: FC.DECKS.filter(d => d.subject === g.key).map(d => {
        const st = FC.deckStats(d.id);
        return { ...d, mastered: st.mastered, total: st.total, pct: st.total ? Math.round((st.mastered / st.total) * 100) : 0 };
      }),
    }));
    this.setData({ groups });
  },

  onStart(e) {
    const deckId = e.currentTarget.dataset.id;
    const deck = FC.getDeck(deckId);
    if (!deck) return;
    const { cards, total } = FC.buildSession(deckId, 10);
    if (!total) {
      wx.showToast({ title: '这个牌库是空的', icon: 'none' });
      return;
    }
    this.deckId = deckId;
    this.setData({
      phase: 'play', deckId, deckName: deck.name,
      cards, total, idx: 0, flipped: false, sessionKnown: 0,
      isChinese: deck.subject === 'chinese',
      cardClass: deck.subject === 'chinese' ? 'cn' : deck.subject === 'math' ? 'ma' : 'en',
    });
  },

  onFlip() {
    if (!this.data.flipped) this.setData({ flipped: true });
  },

  onMark(e) {
    if (!this.data.flipped) return;
    const known = e.currentTarget.dataset.known === '1';
    const card = this.data.cards[this.data.idx];
    FC.markCard(this.deckId, card.front, known);
    const sessionKnown = this.data.sessionKnown + (known ? 1 : 0);
    const idx = this.data.idx + 1;
    if (idx >= this.data.total) {
      // 一组练完：检查勋章（「小小字典」：一个牌组全部掌握），并把进度同步上云
      const fresh = B.evaluate(store.getRecords(), store.getProfile());
      const b = fresh.length ? B.badgeById(fresh[0].id) : null;
      this.setData({ sessionKnown, phase: 'done', newBadge: b ? b.emoji + ' ' + b.name : '' });
      cloud.syncAll();
      this.refresh();
      return;
    }
    this.setData({ sessionKnown, idx, flipped: false });
  },

  onAgain() {
    this.onStart({ currentTarget: { dataset: { id: this.deckId } } });
  },

  onBack() { wx.navigateBack(); },
});
