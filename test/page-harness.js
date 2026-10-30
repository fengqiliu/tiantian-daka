// 页面测试桩：在 Node 里加载真实页面 JS，驱动它们的方法，检查 data 与界面反馈。
// - Page() 捕获定义对象，实例的 setData 合并进 data（与小程序一致的浅合并）
// - wx.* 记录 toast / modal / 跳转等，modal 与 actionSheet 的选择可预设
// - wx.cloud.callFunction 接到真实云函数代码 + 内存数据库（cloud-mock）
// - setTimeout 立即执行、setInterval 交给测试手动触发、Date.now 可冻结
const path = require('path');
const CM = require('./cloud-mock');

const ROOT = path.join(__dirname, '..');
const realNow = Date.now;

const ui = {};
function resetUI() {
  ui.toasts = [];
  ui.modals = [];
  ui.navs = [];
  ui.sheets = [];
  ui.vibrates = 0;
  ui.modalAnswer = true;   // true=确认 / false=取消，或 (opts) => true|false
  ui.sheetPick = 0;
  ui.interval = null;
  ui.clipboard = null;
  ui.recorder = null;
  ui.audio = null;
  ui.files = {};
  ui.played = '';
  ui.openedSetting = 0;
  ui.subscribeAnswer = '';
}
resetUI();

global.wx = {
  showToast(o) { ui.toasts.push(o.title); },
  showModal(o) {
    ui.modals.push(o.title);
    const a = typeof ui.modalAnswer === 'function' ? ui.modalAnswer(o) : ui.modalAnswer;
    if (o.success) o.success({ confirm: !!a, cancel: !a });
  },
  showActionSheet(o) {
    ui.sheets.push(o.itemList);
    if (o.success) o.success({ tapIndex: ui.sheetPick });
  },
  navigateTo(o) { ui.navs.push(o.url); },
  navigateBack() { ui.navs.push('back'); },
  switchTab(o) { ui.navs.push('tab:' + o.url); },
  reLaunch(o) { ui.navs.push('relaunch:' + o.url); },
  vibrateShort() {},
  vibrateLong() { ui.vibrates++; },
  showLoading() {},
  hideLoading() {},
  setClipboardData(o) { ui.clipboard = o.data; if (o.success) o.success(); },
  getClipboardData(o) { if (o.success) o.success({ data: ui.clipboard || '' }); },
  openSetting() { ui.openedSetting = (ui.openedSetting || 0) + 1; },
  // 订阅消息：默认全部同意；ui.subscribeAnswer = 'reject' 模拟拒绝
  requestSubscribeMessage(o) {
    const res = {};
    (o.tmplIds || []).forEach(id => { res[id] = ui.subscribeAnswer || 'accept'; });
    if (o.success) o.success(res);
  },
  // 录音 / 播放 / 文件：跟读教室用；测试通过 ui.recorder.fireStop(...) / fireError(...) 模拟回调
  getRecorderManager() {
    const rec = {
      starts: 0, stops: 0, onStopCb: null, onErrorCb: null,
      onStop(cb) { this.onStopCb = cb; },
      onError(cb) { this.onErrorCb = cb; },
      start() { this.starts++; },
      stop() { this.stops++; },
      fireStop(res) { this.onStopCb && this.onStopCb(res); },
      fireError(err) { this.onErrorCb && this.onErrorCb(err); },
    };
    ui.recorder = rec;
    return rec;
  },
  createInnerAudioContext() {
    const a = { src: '', plays: 0, play() { this.plays++; ui.played = this.src; }, destroy() {} };
    ui.audio = a;
    return a;
  },
  getFileSystemManager() {
    return {
      mkdirSync() {},
      copyFileSync(src, dest) { ui.files = (ui.files || {}); ui.files[dest] = src; },
      unlinkSync(p) { if (ui.files) delete ui.files[p]; },
    };
  },
  env: { USER_DATA_PATH: 'wxfile://usr' },
  cloud: {
    init() {},
    callFunction: ({ name, data }) => CM.load(name).main(data).then(result => ({ result })),
  },
};
global.getApp = () => ({ globalData: {} });
global.setTimeout = fn => { fn(); return 0; };
global.clearTimeout = () => {};
global.setInterval = fn => { ui.interval = fn; return 1; };
global.clearInterval = () => { ui.interval = null; };

let captured = null;
global.Page = def => { captured = def; };

// 每次重新 require，拿到全新的页面实例
function load(route) {
  const file = path.join(ROOT, route + '.js');
  delete require.cache[require.resolve(file)];
  captured = null;
  require(file);
  const page = Object.assign({}, captured);
  page.data = JSON.parse(JSON.stringify(captured.data || {}));
  page.setData = function (patch) { Object.assign(this.data, patch); };
  return page;
}

function setNow(ms) { Date.now = () => ms; }
function restoreNow() { Date.now = realNow; }

// 让 Promise 链（云调用）跑完
function flush() { return new Promise(r => setImmediate(r)).then(() => new Promise(r => setImmediate(r))); }

module.exports = { ui, resetUI, load, setNow, restoreNow, flush, CM };
