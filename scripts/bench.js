// 性能基准（无依赖）：node scripts/bench.js [天数=365] [年级=3]
// 用一年左右的模拟数据（test/perf-fixture.js）驱动真实页面代码，存储换成"存 JSON 字符串、每次读都反序列化"
// 的后端以模拟 wx storage，逐页报告：首次进入耗时、打卡记录分片被读次数、总共反序列化的数据量。
// Node 在电脑上的耗时远小于手机（大约慢 10-30 倍），看相对变化与读次数即可。
const path = require('path');
const root = path.join(__dirname, '..');
const days = Number(process.argv[2]) || 365;
const grade = Number(process.argv[3]) || 3;

const store = require(path.join(root, 'utils/store'));
const data = {};
const reads = {};
let parsedBytes = 0;
const backend = {
  get(k) { reads[k] = (reads[k] || 0) + 1; const s = data[k]; if (s === undefined) return undefined; parsedBytes += s.length; return JSON.parse(s); },
  set(k, v) { data[k] = JSON.stringify(v); },
  remove(k) { delete data[k]; },
};
store.init(backend);
const D = require(path.join(root, 'utils/date'));
const { seedYear } = require(path.join(root, 'test/perf-fixture'));
const today = D.todayStr();
store.saveProfile({ role: 'child', grade, nickname: '小豆', onboarded: true });
const n = seedYear(today, days, grade);
const shardKeys = Object.keys(data).filter(k => /^records_\d{4}$/.test(k));
console.log('数据：' + n.records + ' 条记录，' + shardKeys.length + ' 个年分片，最大分片 ' +
  Math.round(Math.max(...shardKeys.map(k => data[k].length)) / 1024) + 'KB（微信单键上限 1024KB）\n');

const H = require(path.join(root, 'test/page-harness'));
const R = require(path.join(root, 'utils/report'));
const cases = [
  ['首页', () => { const p = H.load('pages/index/index'); return () => p.refreshChild(store.getProfile()); }],
  ['日历', () => { const p = H.load('pages/calendar/calendar'); return () => p.onShow(); }],
  ['成长', () => { const p = H.load('pages/growth/growth'); return () => p.onShow(); }],
  ['报告', () => { const p = H.load('pages/report/report'); p.setData({ weekMonday: R.lastWeekMonday(today) }); return () => p.refresh(); }],
  ['学期报告', () => { const p = H.load('pages/term/term'); return () => p.onLoad(); }],
  ['我的', () => { const p = H.load('pages/profile/profile'); return () => p.onShow(); }],
  ['打卡保存', () => { const p = H.load('pages/task-detail/task-detail'); p.onLoad({ taskId: 'pe_rope', date: today }); return () => p.onSave(); }],
];

const rows = [];
cases.forEach(([name, make]) => {
  store.init(backend); // 每页从冷缓存开始：模拟刚打开小程序进入该页
  const fn = make();
  Object.keys(reads).forEach(k => delete reads[k]);
  parsedBytes = 0;
  const t0 = process.hrtime.bigint();
  fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const shardReads = Object.keys(reads).filter(k => /^records_\d{4}$/.test(k)).reduce((s, k) => s + reads[k], 0);
  rows.push({ name, ms, shardReads, kb: Math.round(parsedBytes / 1024) });
});
rows.forEach(r => console.log(r.name.padEnd(6, '　'), (r.ms.toFixed(1) + 'ms').padStart(8), '  记录分片读取 ' + r.shardReads + ' 次', '  反序列化 ' + r.kb + 'KB'));
