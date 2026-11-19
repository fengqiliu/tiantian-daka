const store = require('../../utils/store');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const D = require('../../utils/date');
const cloud = require('../../utils/cloud');
const POEMS = require('../../utils/poems');

const TERM_NAME = { '一上': '一年级上册', '一下': '一年级下册' };

Page({
  data: {
    textbook: '',
    poems: [],
    expandedId: '',
    pickId: '',
    masteredCount: 0,
  },

  onLoad() {
    this.date = D.todayStr();
    const done = {}; // 今天已背的诗
    // 同一天背多首时 note 累计为「会背《A》、会背《B》」，要拆开逐首判断
    // （之前按整条 note 匹配，背了两首后重新进入页面两首都显示没背，可以重复计数）
    C.getDayRecords(this.date).forEach(r => {
      if (r.taskId === 'chinese_poem' && r.note) r.note.split('、').forEach(s => { done[s] = true; });
    });
    // 历史上背过的（任意一天打过卡）：「已会背 N 首」
    const all = store.getRecords();
    const ever = POEMS.masteredTitles(all);
    this.setData({
      textbook: POEMS.textbook,
      // 每个学期第一首带分段标题（termHead）
      poems: POEMS.poems.map((p, i, all) => ({
        ...p,
        termHead: i === 0 || all[i - 1].term !== p.term ? TERM_NAME[p.term] || p.term : '',
        text: p.lines.join('\n'),
        doneToday: !!done['会背《' + p.title + '》'],
        mastered: !!ever[p.title],
      })),
    });
    // 推荐「今天背这首」：当前学期第一首还没会背的（本学期都会了就从头找），默认展开
    const pick = POEMS.recommend(all, this.date);
    this.setData({
      masteredCount: this.data.poems.filter(p => p.mastered).length,
      pickId: pick ? pick.id : '',
      expandedId: pick ? pick.id : '',
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
    const poems = this.data.poems.map(p => (p.id === poem.id ? { ...p, doneToday: true, mastered: true } : p));
    this.setData({ poems, masteredCount: poems.filter(p => p.mastered).length });
    wx.showToast({ title: '真棒！+' + 3 + ' ⭐', icon: 'none' });
  },
});
