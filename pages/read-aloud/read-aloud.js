const store = require('../../utils/store');
const C = require('../../utils/checkin');
const B = require('../../utils/badges');
const T = require('../../utils/tasks');
const D = require('../../utils/date');
const cloud = require('../../utils/cloud');
const RA = require('../../utils/readaloud');
const EC = require('../../utils/english-content');

Page({
  data: {
    title: '',
    subtitle: '',
    cards: [],
    recordedCount: 0,
    total: 0,
    canFinish: false,
    recordingId: '',
    seconds: 0,
  },

  onLoad() {
    this.date = D.todayStr();
    this.unit = EC.units[0];
    this.recorder = wx.getRecorderManager();
    this.recorder.onStop(res => this._onRecorderStop(res));
    this.recorder.onError(err => this._onRecorderError(err));
    this.audio = wx.createInnerAudioContext();
    this.fs = wx.getFileSystemManager();
    this.dir = wx.env.USER_DATA_PATH + '/readaloud';
    this._pruneOldRecordings();
    this.refresh();
  },

  // 清理过期录音（保留最近 PRUNE_DAYS 天），避免本地存储无限累积
  _pruneOldRecordings() {
    try {
      const cutoff = D.addDays(this.date, -RA.PRUNE_DAYS);
      RA.pruneReadings(cutoff).removed.forEach(r => {
        try { this.fs.unlinkSync(r.filePath); } catch (e) { /* 文件可能已不存在 */ }
      });
    } catch (e) { /* 清理失败不影响使用 */ }
  },

  // 录音出错：权限被拒时引导去设置开启麦克风
  _onRecorderError(err) {
    this._resetRecording();
    const msg = (err && err.errMsg) || '';
    if (/auth|deny|permission/i.test(msg)) {
      wx.showModal({
        title: '无法录音',
        content: '跟读需要使用麦克风。点击「去设置」，允许麦克风权限后回来重试。',
        confirmText: '去设置',
        success: res => { if (res.confirm) wx.openSetting(); },
      });
    } else {
      wx.showToast({ title: '录音出错了，再试一次', icon: 'none' });
    }
  },

  onUnload() {
    if (this.data.recordingId) { try { this.recorder.stop(); } catch (e) { /* 忽略 */ } }
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { this.audio.destroy(); } catch (e) { /* 忽略 */ }
  },

  refresh() {
    const readings = RA.getDayReadings(this.date);
    const map = {};
    readings.forEach(r => { map[r.sentenceId] = r; });
    const mk = item => {
      const r = map[item.id];
      const status = r ? RA.STATE.RECORDED : RA.STATE.IDLE;
      return {
        id: item.id,
        text: item.text || item.say,
        tip: item.tip || ('情境：' + item.when),
        status,
        isRecording: status === RA.STATE.RECORDING,
        filePath: r ? r.filePath : '',
        durationSec: r ? r.durationSec : 0,
      };
    };
    const cards = this.unit.sentences.map(mk).concat(this.unit.scenes.map(mk));
    const comp = RA.completion(cards, readings);
    this.setData({
      title: this.unit.title,
      subtitle: EC.textbook,
      cards,
      total: comp.total,
      recordedCount: comp.recorded,
      canFinish: comp.recorded > 0,
    });
  },

  onRecord(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.recordingId) {
      wx.showToast({ title: '先完成当前录音哦', icon: 'none' });
      return;
    }
    const card = this.data.cards.find(c => c.id === id);
    if (!card || !RA.canRecord(card.status)) return;
    try { this.fs.mkdirSync(this.dir, true); } catch (err) { /* 目录已存在 */ }
    this.recorder.start({
      format: 'mp3',
      duration: RA.MAX_SEC * 1000,
      sampleRate: 44100,
      numberOfChannels: 1,
      encodeBitRate: 96000,
    });
    this.setData({ recordingId: id, seconds: 0 });
    this.timer = setInterval(() => this.setData({ seconds: this.data.seconds + 1 }), 1000);
  },

  onStop() {
    if (this.data.recordingId) this.recorder.stop();
  },

  _onRecorderStop(res) {
    const id = this.data.recordingId;
    this._resetRecording();
    if (!id || !res || !res.tempFilePath) return;
    const fallback = Math.round((res.duration || 0) / 1000) || this.data.seconds;
    const dur = RA.clampDuration(fallback);
    const dest = this.dir + '/' + this.date + '-' + id + '.mp3';
    let saved = dest;
    try { this.fs.copyFileSync(res.tempFilePath, dest); } catch (err) { saved = res.tempFilePath; }
    const { previous } = RA.saveReading(this.date, id, saved, dur);
    if (previous && previous.filePath !== saved) {
      try { this.fs.unlinkSync(previous.filePath); } catch (err) { /* 旧文件可能已不存在 */ }
    }
    this.refresh();
  },

  _resetRecording() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.setData({ recordingId: '', seconds: 0 });
  },

  onPlay(e) {
    const id = e.currentTarget.dataset.id;
    const r = RA.getDayReadings(this.date).find(x => x.sentenceId === id);
    if (!r) return;
    this.audio.src = r.filePath;
    this.audio.play();
  },

  onFinish() {
    if (!this.data.canFinish) return;
    const readings = RA.getDayReadings(this.date);
    const comp = RA.completion(this.data.cards, readings);
    const stars = comp.allDone ? 3 : (comp.recorded * 2 >= comp.total ? 2 : 1);
    const profile = store.getProfile();
    const grade = Number(profile && profile.grade) || 1;
    const inList = T.generateDailyTasks(grade, this.date).find(t => t.id === 'english_listen');
    const task = inList || T.buildTask('english_listen', grade, true);
    C.upsertRecord(this.date, 'english_listen', task.target, stars, '跟读教室 ' + comp.recorded + '/' + comp.total + ' 句');
    const fresh = B.evaluate(store.getRecords(), profile);
    if (fresh.length) {
      const b = B.badgeById(fresh[0].id);
      cloud.notifyParents((profile && profile.nickname ? profile.nickname : '孩子') + '达成新勋章', b ? '「' + b.name + '」' : '继续加油！');
    }
    cloud.syncAll();
    wx.showToast({ title: '打卡成功 +' + stars + ' ⭐', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 700);
  },
});
