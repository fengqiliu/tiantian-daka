const store = require('../../utils/store');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const cloud = require('../../utils/cloud');
const POEMS = require('../../utils/poems');

Page({
  data: {
    textbook: '',
    poems: [],
    expandedId: '',
  },

  onLoad() {
    this.date = D.todayStr();
    const done = {}; // 今天已背的诗
    C.getDayRecords(this.date).forEach(r => {
      if (r.taskId === 'chinese_poem' && r.note) done[r.note] = true;
    });
    this.setData({
      textbook: POEMS.textbook,
      poems: POEMS.poems.map(p => ({
        ...p,
        text: p.lines.join('\n'),
        doneToday: !!done['会背《' + p.title + '》'],
      })),
    });
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ expandedId: this.data.expandedId === id ? '' : id });
  },

  onRecite(e) {
    const poem = this.data.poems.find(p => p.id === e.currentTarget.dataset.id);
    if (!poem) return;
    if (poem.doneToday) {
      wx.showToast({ title: '今天这首已经背过啦', icon: 'none' });
      return;
    }
    // 同日多首累计：value 逐次 +1，note 追加标题（勋章按累计首数判定）
    const existing = C.getDayRecords(this.date).find(r => r.taskId === 'chinese_poem');
    const count = existing ? (existing.value.n || 0) + 1 : 1;
    const note = existing && existing.note ? existing.note + '、会背《' + poem.title + '》' : '会背《' + poem.title + '》';
    C.upsertRecord(this.date, 'chinese_poem', count, 3, note);
    const profile = store.getProfile();
    const fresh = B.evaluate(store.getRecords(), profile);
    if (fresh.length) {
      const b = B.badgeById(fresh[0].id);
      cloud.notifyParents((profile && profile.nickname ? profile.nickname : '孩子') + '达成新勋章', b ? '「' + b.name + '」' : '继续加油！');
    }
    cloud.syncAll();
    this.setData({
      poems: this.data.poems.map(p => (p.id === poem.id ? { ...p, doneToday: true } : p)),
    });
    wx.showToast({ title: '真棒！+' + 3 + ' ⭐', icon: 'none' });
  },
});
