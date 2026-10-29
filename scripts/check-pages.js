// 页面静态检查（无依赖，Node 直接运行；可挂 CI）：
//   node scripts/check-pages.js
// 1. app.json 里的每个页面（及自定义 tabBar）四件套齐全：.js / .json / .wxml / .wxss
// 2. WXML 里每个事件绑定（bindtap / catchtap / bindinput …）在页面 JS 中都有同名方法
//    —— 微信里绑定了不存在的方法只会在点击时打一行警告，界面毫无反应，很难发现
// 3. JS 里 navigateTo / redirectTo / switchTab / reLaunch 的目标页面都在 app.json 中
// 4. usingComponents 引用的组件存在
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const errors = [];

// 用桩替代小程序全局，捕获 Page({...}) / Component({...}) 的定义对象
function loadDefinition(jsFile) {
  let def = null;
  const saved = { Page: global.Page, Component: global.Component, getApp: global.getApp, wx: global.wx };
  global.Page = d => { def = { kind: 'page', methods: d }; };
  global.Component = d => { def = { kind: 'component', methods: { ...(d.methods || {}) } }; };
  global.getApp = () => ({ globalData: {} });
  global.wx = new Proxy({}, { get: () => () => {} });
  try {
    delete require.cache[require.resolve(jsFile)];
    require(jsFile);
  } finally {
    Object.assign(global, saved);
  }
  return def;
}

// 取出 WXML 里静态写死的事件处理函数名（动态 {{}} 绑定跳过）
function handlersIn(wxml) {
  const out = [];
  const re = /\b(?:bind|catch|capture-bind|capture-catch|mut-bind):?([a-z]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(wxml))) {
    const name = m[2].trim();
    if (!name || name.indexOf('{{') > -1) continue;
    const line = wxml.slice(0, m.index).split('\n').length;
    out.push({ event: m[1], name, line });
  }
  return out;
}

const units = app.pages.map(p => ({ id: p, base: path.join(root, p) }));
if (app.tabBar && app.tabBar.custom) units.push({ id: 'custom-tab-bar/index', base: path.join(root, 'custom-tab-bar/index') });

const pageSet = new Set(app.pages);
let handlerCount = 0;

units.forEach(u => {
  const missing = ['.js', '.json', '.wxml', '.wxss'].filter(ext => !fs.existsSync(u.base + ext));
  if (missing.length) {
    errors.push(u.id + '：缺少 ' + missing.join(' '));
    if (missing.indexOf('.js') > -1 || missing.indexOf('.wxml') > -1) return;
  }

  let def;
  try {
    def = loadDefinition(u.base + '.js');
  } catch (e) {
    errors.push(u.id + '.js：加载失败 ' + e.message);
    return;
  }
  if (!def) { errors.push(u.id + '.js：没有调用 Page() / Component()'); return; }

  const wxml = fs.readFileSync(u.base + '.wxml', 'utf8');
  handlersIn(wxml).forEach(h => {
    handlerCount++;
    if (typeof def.methods[h.name] !== 'function') {
      errors.push(u.id + '.wxml:' + h.line + '：bind' + h.event + '="' + h.name + '" 在 JS 中没有这个方法');
    }
  });

  const js = fs.readFileSync(u.base + '.js', 'utf8');
  const navRe = /(?:navigateTo|redirectTo|switchTab|reLaunch)\(\{\s*url:\s*['"`]\/([a-z0-9/_-]+)/g;
  let n;
  while ((n = navRe.exec(js))) {
    if (!pageSet.has(n[1])) errors.push(u.id + '.js：跳转目标 /' + n[1] + ' 不在 app.json 的 pages 里');
  }

  if (fs.existsSync(u.base + '.json')) {
    const conf = JSON.parse(fs.readFileSync(u.base + '.json', 'utf8'));
    Object.entries(conf.usingComponents || {}).forEach(([tag, p]) => {
      const abs = p.startsWith('/') ? path.join(root, p) : path.join(path.dirname(u.base), p);
      if (!fs.existsSync(abs + '.js')) errors.push(u.id + '.json：组件 <' + tag + '> 路径 ' + p + ' 不存在');
    });
  }
});

if (app.tabBar && app.tabBar.list) {
  app.tabBar.list.forEach(t => {
    if (!pageSet.has(t.pagePath)) errors.push('app.json：tabBar 页面 ' + t.pagePath + ' 不在 pages 里');
  });
}

if (errors.length) {
  console.error('✗ 页面静态检查发现 ' + errors.length + ' 个问题：\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('✓ 页面静态检查通过：' + units.length + ' 个页面/组件，' + handlerCount + ' 个事件绑定');
