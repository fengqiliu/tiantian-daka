// 把客户端共享逻辑同步到云函数 lib/（tasks.js、date.js）
// 云函数独立打包，无法 require 小程序目录；此脚本保证两边一致。
// 用法：node scripts/sync-cloud-libs.js（修改 utils/tasks.js 后记得重跑并重新上传 dailyRemind）
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = ['cloudfunctions/dailyRemind/lib'];
const files = ['utils/tasks.js', 'utils/date.js', 'utils/calendar-config.js'];

for (const dir of targets) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const f of files) {
    const dest = path.join(root, dir, path.basename(f));
    fs.copyFileSync(path.join(root, f), dest);
    console.log('copied', f, '->', path.relative(root, dest));
  }
}
console.log('done');
