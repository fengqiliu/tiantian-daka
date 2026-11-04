// 精确替换小工具：node scripts/patch.js <文件> <旧文本文件> <新文本文件>
// 旧文本必须在目标文件里恰好出现一次（0 次或多次都报错），避免静默改错地方；换行结尾会被忽略。
// 开发者用来在不能用编辑器工具的环境里做多行精确替换（heredoc 写旧 / 新文本到临时文件）。
const fs = require('fs');
const [file, oldFile, newFile] = process.argv.slice(2);
if (!file || !oldFile || !newFile) { console.error('用法: node scripts/patch.js <文件> <旧文本文件> <新文本文件>'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');
const strip = f => fs.readFileSync(f, 'utf8').replace(/\n$/, '');
const o = strip(oldFile), n = strip(newFile);
const count = src.split(o).length - 1;
if (count !== 1) { console.error(file + ': 期望匹配 1 处，实际 ' + count + ' 处'); process.exit(1); }
fs.writeFileSync(file, src.replace(o, () => n));
console.log('patched ' + file);
