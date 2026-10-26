// 家长端：给孩子发鼓励留言（常用语一键填 + 自定义），可关联某次打卡；下方显示已发出的
const store = require('../../utils/store');
const cloud = require('../../utils/cloud');
const CHEER = require('../../utils/cheer');

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function timeLabel(ts) {
  const d = new Date(ts);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

Page({
  data: {
    fromOptions: CHEER.FROM_OPTIONS,
    presets: CHEER.PRESETS,
    maxLen: CHEER.MAX_LEN,
    from: '妈妈',
    text: '',
    recordId: '',
    recordLabel: '',
    sending: false,
    sent: [],
    cloudOff: false,
  },

  onLoad(q) {
    const settings = store.getSettings() || {};
    this.setData({
      from: CHEER.FROM_OPTIONS.indexOf(settings.cheerFrom) > -1 ? settings.cheerFrom : '妈妈',
      recordId: q && q.recordId ? decodeURIComponent(q.recordId) : '',
      recordLabel: q && q.label ? decodeURIComponent(q.label) : '',
      cloudOff: !cloud.isAvailable(),
    });
    this.loadSent();
  },

  loadSent() {
    cloud.cheerList().then(res => {
      if (!res || !res.ok) return;
      this.setData({
        sent: (res.cheers || []).map(c => ({ ...c, timeLabel: timeLabel(c.createdAt) })),
      });
    });
  },

  onFrom(e) { this.setData({ from: e.currentTarget.dataset.v }); },
  onPreset(e) { this.setData({ text: e.currentTarget.dataset.v }); },
  onInput(e) { this.setData({ text: e.detail.value }); },
  onUnlink() { this.setData({ recordId: '', recordLabel: '' }); },

  onSend() {
    if (this.data.sending) return;
    const v = CHEER.validate({
      from: this.data.from, text: this.data.text,
      recordId: this.data.recordId, recordLabel: this.data.recordLabel,
    });
    if (!v.ok) { wx.showToast({ title: v.error, icon: 'none' }); return; }
    this.setData({ sending: true });
    store.saveSettings({ ...(store.getSettings() || {}), cheerFrom: v.from }); // 记住称呼
    cloud.cheerSend(v).then(res => {
      this.setData({ sending: false });
      if (!res || res.ok === false) {
        wx.showToast({ title: (res && res.error) || '发送失败，稍后再试', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已送到孩子手机 💌', icon: 'none' });
      this.setData({ text: '', recordId: '', recordLabel: '' });
      this.loadSent();
    });
  },
});
