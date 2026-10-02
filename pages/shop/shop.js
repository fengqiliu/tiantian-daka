const store = require('../../utils/store');
const C = require('../../utils/checkin');
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const SHOP = require('../../utils/shop');

const EMOJIS = ['🍬', '🍦', '🍿', '📺', '🎮', '🎁', '📚', '⛲', '🎪', '🍕', '🧸', '🎨'];

Page({
  data: {
    manage: false,
    balance: { earned: 0, spent: 0, balance: 0 },
    rewards: [],
    redemptions: [],
    // 管理表单
    formOpen: false,
    formName: '',
    formEmoji: '🎁',
    formCost: 20,
    emojis: EMOJIS,
  },

  onLoad(options) {
    this.manage = options.manage === '1';
    if (CTX.scope().role === 'parent') {
      wx.showToast({ title: '奖励小铺在孩子设备上使用', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.date = D.todayStr();
    this.setData({ manage: this.manage });
    this.refresh();
  },

  onShow() { this.refresh(); },

  refresh() {
    const s = CTX.scope();
    const earned = C.totalStars(s.records, s.grade, s.badges);
    const bal = SHOP.balance(earned);
    const rewards = SHOP.getRewards().map(r => ({
      ...r,
      can: bal.balance >= r.cost,
      shortage: Math.max(0, r.cost - bal.balance),
    }));
    this.setData({
      balance: bal,
      rewards,
      redemptions: SHOP.getRedemptions().slice(0, 6).map(rd => ({
        ...rd,
        dateLabel: D.dateLabel(D.formatDate(new Date(rd.at))),
      })),
    });
  },

  onRedeem(e) {
    const id = e.currentTarget.dataset.id;
    const reward = this.data.rewards.find(r => r.id === id);
    if (!reward) return;
    if (!reward.can) {
      wx.showToast({ title: '还差 ' + reward.shortage + ' 积分，继续加油！', icon: 'none' });
      return;
    }
    const earned = this.data.balance.earned;
    wx.showModal({
      title: '确认兑换',
      content: '用 ' + reward.cost + ' 积分兑换「' + reward.name + '」？兑换后找爸爸妈妈领取哦。',
      success: res => {
        if (!res.confirm) return;
        const r = SHOP.redeem(reward, earned);
        if (r.ok) {
          try { wx.vibrateShort({ type: 'light' }); } catch (e) { /* 忽略 */ }
          wx.showToast({ title: '兑换成功！找爸妈领取 🎉', icon: 'none' });
          this.refresh();
        } else {
          wx.showToast({ title: '积分不足', icon: 'none' });
        }
      },
    });
  },

  // ── 家长管理 ──
  onToggleForm() { this.setData({ formOpen: !this.data.formOpen }); },
  onFormName(e) { this.setData({ formName: e.detail.value }); },
  onFormEmoji(e) { this.setData({ formEmoji: e.currentTarget.dataset.emoji }); },
  onFormCostInput(e) { this.setData({ formCost: Number(e.detail.value) || 0 }); },
  onFormCostMinus() { this.setData({ formCost: Math.max(1, this.data.formCost - 5) }); },
  onFormCostPlus() { this.setData({ formCost: Math.min(9999, this.data.formCost + 5) }); },

  onFormSubmit() {
    const { formName, formEmoji, formCost } = this.data;
    if (!formName) {
      wx.showToast({ title: '先给奖品起个名字', icon: 'none' });
      return;
    }
    if (!formCost || formCost <= 0) {
      wx.showToast({ title: '积分价格要大于 0', icon: 'none' });
      return;
    }
    SHOP.addReward({ name: formName, emoji: formEmoji, cost: formCost });
    this.setData({ formOpen: false, formName: '', formCost: 20 });
    this.refresh();
    wx.showToast({ title: '已上架 ✓', icon: 'none' });
  },

  onDelReward(e) {
    const id = e.currentTarget.dataset.id;
    const item = SHOP.getRewards().find(r => r.id === id);
    wx.showModal({
      title: '下架奖品',
      content: '「' + (item ? item.name : '') + '」将从奖品架移除（兑换记录保留）。确定吗？',
      confirmColor: '#FF5A3C',
      success: res => {
        if (res.confirm) { SHOP.removeReward(id); this.refresh(); }
      },
    });
  },

  onUndoRedemption(e) {
    wx.showModal({
      title: '撤销兑换',
      content: '撤销后对应积分会退回余额（用于家长漏兑现等情况）。确定撤销吗？',
      confirmColor: '#FF5A3C',
      success: res => {
        if (!res.confirm) return;
        SHOP.removeRedemption(e.currentTarget.dataset.id);
        this.refresh();
        wx.showToast({ title: '已撤销，积分已退回', icon: 'none' });
      },
    });
  },
});
