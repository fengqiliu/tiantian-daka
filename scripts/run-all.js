// 一键跑全部检查（本地与 CI 共用）：node scripts/run-all.js
// 只依赖 Node，无需 npm install。任一项失败则退出码 1。
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// 0. 语法：仓库里每个 .js 都能被 Node 解析（不执行）
function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listJs(p) : (e.name.endsWith('.js') ? [p] : []);
  });
}
// JSON：配置文件可解析
function listJson(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listJson(p) : (e.name.endsWith('.json') ? [p] : []);
  });
}

const steps = [
  { name: '语法检查（全部 .js）', run: () => {
    const bad = listJs(root).filter(f => spawnSync(process.execPath, ['--check', f]).status !== 0);
    return bad.length ? 'node --check 失败：\n  ' + bad.map(f => path.relative(root, f)).join('\n  ') : null;
  } },
  { name: 'JSON 检查', run: () => {
    const bad = listJson(root).filter(f => { try { JSON.parse(fs.readFileSync(f, 'utf8')); return false; } catch (e) { return true; } });
    return bad.length ? 'JSON 解析失败：\n  ' + bad.map(f => path.relative(root, f)).join('\n  ') : null;
  } },
  { name: '页面静态检查', cmd: ['scripts/check-pages.js'] },
  { name: '云函数 lib 漂移', cmd: ['scripts/sync-cloud-libs.js', '--check'] },
  { name: '客户端逻辑测试', cmd: ['test/run-tests.js'] },
  { name: '云函数测试', cmd: ['test/run-cloud-tests.js'] },
  { name: '页面流程测试', cmd: ['test/run-page-tests.js'] },
];

let failed = 0;
steps.forEach(s => {
  let ok;
  let detail = '';
  if (s.run) {
    const err = s.run();
    ok = !err;
    detail = err || '';
  } else {
    const r = spawnSync(process.execPath, s.cmd.map(c => path.join(root, c)).slice(0, 1).concat(s.cmd.slice(1)), { cwd: root, encoding: 'utf8' });
    ok = r.status === 0;
    const out = (r.stdout + r.stderr).trim().split('\n');
    detail = ok ? out[out.length - 1] : out.slice(-25).join('\n');
  }
  console.log((ok ? '✓ ' : '✗ ') + s.name + (ok && detail ? '  — ' + detail.trim() : ''));
  if (!ok) { failed++; console.log(detail.replace(/^/gm, '    ')); }
});

if (failed) {
  console.error('\n✗ ' + failed + ' 项检查失败');
  process.exit(1);
}
console.log('\n✓ 全部检查通过');
