// 云函数测试桩：用内存数据库模拟 wx-server-sdk，支持 where/_.gt/_.inc/_.set/_.push/_.elemMatch。
// 云函数 openid 一律取自 getWXContext()，测试通过 setOpenid() 切换调用者身份。
const path = require('path');
const Module = require('module');

let db = null;
let currentOpenid = '';
let sent = [];          // subscribeMessage.send 的调用记录
let sendImpl = null;    // 自定义发送行为（抛 43101 等）
let configOverrides = {}; // config.js 导出覆盖（模板 ID 等）

function reset() {
  db = { users: [], checkins: [], badges: [], families: [] };
  currentOpenid = '';
  sent = [];
  sendImpl = null;
  configOverrides = {};
}
reset();

// 覆盖云函数 config.js 的导出（模板 ID 等），用于测试真实发送路径
function setConfig(name, values) { configOverrides[name] = values; }

// where 条件求值：支持 {field: value}、{field: {op: arg}}
function matchOp(actual, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && cond.__op) {
    switch (cond.__op) {
      case 'gt': return actual > cond.arg;
      case 'gte': return actual >= cond.arg;
      case 'lt': return actual < cond.arg;
      case 'set': return true; // 仅在 update 时生效，where 中不使用
      case 'inc': return true;
      case 'push': return true;
      default: return false;
    }
  }
  if (Array.isArray(actual)) return actual.indexOf(cond) >= 0;
  return actual === cond;
}

function matches(doc, where) {
  return Object.keys(where || {}).every(k => {
    const cond = where[k];
    if (cond && cond.__op === 'elemMatch') {
      const arr = doc[k];
      return Array.isArray(arr) && arr.some(item =>
        Object.keys(cond.arg).every(f => matchOp(item[f], cond.arg[f])));
    }
    return matchOp(doc[k], cond);
  });
}

// where/update 指令：{__op, arg}
function op(arg) { return { __op: arg.op, arg: arg.v }; }

// 深合并 update.data：{op} 指令与普通字段
function applyUpdate(doc, data) {
  Object.keys(data).forEach(k => {
    const v = data[k];
    if (v && typeof v === 'object' && v.__op === 'inc') doc[k] = (doc[k] || 0) + v.arg;
    else if (v && typeof v === 'object' && v.__op === 'set') doc[k] = v.arg;
    else if (v && typeof v === 'object' && v.__op === 'push') doc[k] = (doc[k] || []).concat(v.arg);
    else doc[k] = v;
  });
}

let seq = 0;
function collection(name) {
  if (!db[name]) db[name] = [];
  const rows = db[name];
  const build = q => {
    let list = rows.slice();
    if (q.where) list = list.filter(d => matches(d, q.where));
    if (q.orderBy) {
      const [field, dir] = Array.isArray(q.orderBy) ? q.orderBy : [q.orderBy, 'asc'];
      list.sort((a, b) => ((a[field] || 0) < (b[field] || 0) ? -1 : a[field] > (b[field] || 0) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    if (q.skip) list = list.slice(q.skip);
    if (q.limit) list = list.slice(0, q.limit);
    return list;
  };
  const query = {
    where(w) { q = Object.assign({}, q, { where: Object.assign({}, q.where, w) }); return query; },
    orderBy(f, d) { q = Object.assign({}, q, { orderBy: [f, d || 'asc'] }); return query; },
    skip(n) { q = Object.assign({}, q, { skip: n }); return query; },
    limit(n) { q = Object.assign({}, q, { limit: n }); return query; },
    async get() { return { data: build(q) }; },
    async update({ data }) {
      const targets = q.docId ? rows.filter(r => r._id === q.docId) : build(q);
      targets.forEach(d => applyUpdate(d, data));
      return { stats: { updated: targets.length } };
    },
  };
  let q = {};
  return Object.assign(query, {
    doc(id) {
      q = Object.assign({}, q, { docId: id });
      return query;
    },
    async add({ data: doc }) {
      const row = Object.assign({ _id: name + '_' + (++seq) }, doc);
      rows.push(row);
      return { _id: row._id };
    },
  });
}

const database = {
  command: {
    gt: v => op({ op: 'gt', v }),
    gte: v => op({ op: 'gte', v }),
    lt: v => op({ op: 'lt', v }),
    inc: v => op({ op: 'inc', v }),
    set: v => op({ op: 'set', v }),
    push: v => op({ op: 'push', v }),
    elemMatch: v => ({ __op: 'elemMatch', arg: v }),
  },
  collection,
  createCollection: async (name) => { if (!db[name]) db[name] = []; },
};

// 加载云函数模块，注入 mock SDK（每个云函数独立缓存，便于重载）
const ROOT = path.join(__dirname, '..', 'cloudfunctions');
function load(fn) {
  const dir = path.join(ROOT, fn);
  const entry = require.resolve(path.join(dir, 'index.js'));
  const configPath = path.join(dir, 'config.js');
  const sdkPath = 'wx-server-sdk';
  const prev = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === sdkPath) {
      return {
        DYNAMIC_CURRENT_ENV: 'DYNAMIC',
        init: () => {},
        getWXContext: () => ({ OPENID: currentOpenid }),
        database: () => database,
        openapi: {
          subscribeMessage: {
            send: async (args) => {
              sent.push(args);
              if (sendImpl) return sendImpl(args);
              return { errCode: 0 };
            },
          },
        },
      };
    }
    // 注入 config.js 覆盖（模板 ID 等），使订阅消息发送路径可测
    if (request === './config.js' && configOverrides[path.basename(dir)]) {
      return configOverrides[path.basename(dir)];
    }
    return prev.apply(this, arguments);
  };
  delete require.cache[entry];
  delete require.cache[configPath];
  try {
    return require(entry);
  } finally {
    Module._load = prev;
  }
}

module.exports = {
  reset, load, setConfig,
  get db() { return db; },
  get sent() { return sent; },
  setOpenid(id) { currentOpenid = id; },
  setSendImpl(fn) { sendImpl = fn; },
};