// 把客户端共享逻辑同步到云函数 lib/（tasks.js、date.js、calendar-config.js）
// 云函数独立打包，无法 require 小程序目录；此脚本保证两边一致。
// 用法：
//   node scripts/sync-cloud-libs.js           复制（修改 utils/ 共享逻辑后重跑，并重新上传 dailyRemind）
//   node scripts/sync-cloud-libs.js --check   只校验不写入，有漂移则退出码 1（可挂 CI / git hook）
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = ['cloudfunctions/dailyRemind/lib'];
const files = ['utils/tasks.js', 'utils/date.js', 'utils/calendar-config.js'];

const checkOnly = process.argv.includes('--check');
const drifted = [];

for (const dir of targets) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const f of files) {
    const src = path.join(root, f);
    const dest = path.join(root, dir, path.basename(f));
    const label = path.relative(root, dest);
    if (checkOnly) {
      const cur = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
      if (cur !== fs.readFileSync(src, 'utf8')) drifted.push(label);
      continue;
    }
    fs.copyFileSync(src, dest);
    console.log('copied', f, '->', label);
  }
}

if (checkOnly) {
  if (drifted.length) {
    console.error('✗ 云函数 lib 与 utils/ 已漂移：\n  ' + drifted.join('\n  '));
    console.error('  修复：node scripts/sync-cloud-libs.js 并重新上传 dailyRemind 云函数');
    process.exit(1);
  }
  console.log('✓ 云函数 lib 与 utils/ 一致');
} else {
  console.log('done');
}
