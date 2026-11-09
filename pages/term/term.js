// 学期成长报告：按上海校历划分学期 / 假期，可前后翻；孩子端读本机，家长端读孩子缓存
const D = require('../../utils/date');
const CTX = require('../../utils/context');
const TERM = require('../../utils/term');

const SUBJ = require('../../utils/subjects');
const FC = require('../../utils/flashcards');
const SHARE = require('../../utils/share-image');

Page({
  data: {
    s: null,            // TERM.termSummary 结果
    canNext: false,
    drillTrend: '',
    readingHours: 0,
    outdoorHours: 0,
    role: 'child',
  },

  onLoad() {
    this.period = TERM.periodAt(D.todayStr());
    this.refresh();
  },

  refresh() {
    const today = D.todayStr();
    const scope = CTX.scope();
    const s = TERM.termSummary(scope, this.period, today);
    this.setData({
      s,
      role: scope.role,
      canNext: this.period.end < today, // 最远翻到当前时段
      drillTrend: s.drill.firstAccuracy === null ? '' : ' · 正确率 ' + s.drill.firstAccuracy + '% → ' + s.drill.lastAccuracy + '%',
      readingHours: Math.round(s.totals.readingMinutes / 6) / 10,
      outdoorHours: Math.round(s.totals.outdoorMinutes / 6) / 10,
      unitRows: s.units.map(u => ({
        name: u.subjectName + u.label,
        text: u.total ? u.correct + '/' + u.total + ' · ' + u.rate + '%' : '',
        mark: SUBJ.MASTERY_MARK[u.status],
        status: u.status,
      })),
    });
  },

  // 学期成长证书：画成图片后弹出系统分享菜单（可存相册 / 发给家人）
  onCertificate() {
    const scope = CTX.scope();
    const who = scope.role === 'parent' ? scope.child : scope.profile;
    const { width, height, ops } = SHARE.certificate(this.data.s, who && who.nickname, { cardsMastered: FC.summary(scope.flashcards).mastered });
    const canvas = wx.createOffscreenCanvas({ type: '2d', width, height });
    SHARE.paint(canvas.getContext('2d'), ops);
    wx.canvasToTempFilePath({
      canvas,
      success: res => wx.showShareImageMenu({
        path: res.tempFilePath,
        fail: () => wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath, success: () => wx.showToast({ title: '已保存到相册', icon: 'none' }) }),
      }),
      fail: () => wx.showToast({ title: '生成图片失败，稍后再试', icon: 'none' }),
    });
  },

  onPrev() {
    this.period = TERM.prev(this.period);
    this.refresh();
  },

  onNext() {
    if (!this.data.canNext) return;
    this.period = TERM.next(this.period);
    this.refresh();
  },
});
