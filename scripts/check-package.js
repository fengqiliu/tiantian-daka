// 代码包体积检查：node scripts/check-package.js [--list]
// 按 project.config.json 的 packOptions.ignore 算出上传到微信的文件（云函数目录、.git、点文件不计），
// 失败条件：① 合计超过主包上限 2MB；② 小程序运行需要的文件（app.* / pages / utils / custom-tab-bar / sitemap.json）被误排除。
// 开发者工具的 ignoreUploadUnusedFiles 只过滤"未被引用的代码与图片"，PDF、测试、文档等仍需在 packOptions.ignore 里显式排除。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const LIMIT = 2 * 1024 * 1024;
const config = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const rules = ((config.packOptions || {}).ignore || []);
const cloudRoot = (config.cloudfunctionRoot || '').replace(/\/$/, '');

function globToRegExp(glob) {
  const re = glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp('^' + re + '$');
}

// rel 为相对项目根的路径（/ 分隔）
function ignored(rel) {
  const base = rel.split('/').pop();
  return rules.some(r => {
    const v = String(r.value || '').replace(/^\.?\//, '').replace(/\/$/, '');
    switch (r.type) {
      case 'folder': return rel === v || rel.startsWith(v + '/');
      case 'file': return rel === v;
      case 'suffix': return rel.endsWith(r.value);
      case 'prefix': return base.startsWith(r.value);
      case 'glob': return globToRegExp(v).test(rel);
      case 'regexp': return new RegExp(r.value).test(rel);
      default: return false;
    }
  });
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.name.startsWith('.') || e.name === 'node_modules') return [];
    const abs = path.join(dir, e.name);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (cloudRoot && (rel === cloudRoot || rel.startsWith(cloudRoot + '/'))) return [];
    return e.isDirectory() ? walk(abs) : [rel];
  });
}

const all = walk(root);
const included = all.filter(rel => !ignored(rel));
const size = rel => fs.statSync(path.join(root, rel)).size;
const total = included.reduce((s, rel) => s + size(rel), 0);

// 运行必需的文件不能被排除
const required = all.filter(rel => /^(app\.(js|json|wxss)|sitemap\.json)$/.test(rel) || /^(pages|utils|custom-tab-bar)\//.test(rel));
const wronglyIgnored = required.filter(ignored);

const kb = n => (n / 1024).toFixed(1) + 'KB';
if (process.argv.includes('--list')) {
  included.map(rel => [rel, size(rel)]).sort((a, b) => b[1] - a[1]).forEach(([rel, n]) => console.log(kb(n).padStart(10) + '  ' + rel));
}
const problems = [];
if (total > LIMIT) {
  const top = included.map(rel => [rel, size(rel)]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  problems.push('上传包 ' + kb(total) + ' 超过主包上限 2048KB，最大的文件：\n    ' + top.map(([rel, n]) => kb(n) + '  ' + rel).join('\n    ')
    + '\n  修复：在 project.config.json 的 packOptions.ignore 里排除非小程序文件');
}
if (wronglyIgnored.length) problems.push('运行需要的文件被 packOptions.ignore 排除了：\n    ' + wronglyIgnored.join('\n    '));
if (problems.length) {
  console.error('✗ ' + problems.join('\n✗ '));
  process.exit(1);
}
console.log('✓ 代码包 ' + kb(total) + '（' + included.length + ' 个文件，上限 2048KB）');
