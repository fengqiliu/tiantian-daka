// 备份转 SQLite（电脑端工具，无依赖）：把「我的 → 数据备份」复制出的文本转成 .sqlite 文件，用 SQL 查数据
//   node scripts/backup-to-sqlite.js <备份.txt> [输出.sqlite] [--force]
// 需要 Node 22.5+（内置 node:sqlite；Node 24 起无需开关，运行时的"实验特性"提示已屏蔽）。
// 每个集合一张表：常用字段拆成列（驼峰转下划线，value.n 这类一层嵌套拆成 value_n），整行原文放在 json 列；
// 另有 meta（昵称、年级、导出时间等）和 daily_summary 视图（每天打卡数与星星，不含已删除的记录）。
// 只读备份文本、只写输出文件，不连网、不改小程序数据。
const fs = require('fs');
const path = require('path');
const BACKUP = require('../utils/backup');
const T = require('../utils/tasks');

function loadSqlite() {
  const emit = process.emitWarning;
  process.emitWarning = function (w, ...rest) {
    if (/SQLite/.test(String(w && w.message ? w.message : w))) return;
    return emit.call(process, w, ...rest);
  };
  try {
    return require('node:sqlite');
  } catch (e) {
    throw new Error('当前 Node ' + process.version + ' 没有内置 node:sqlite，请用 Node 22.5 及以上版本');
  } finally {
    process.emitWarning = emit;
  }
}

const snake = k => String(k).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]/g, '_');
const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);
const scalar = v => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

// 一行展开成列：标量直接放，一层嵌套对象拆成 key_sub，其余（数组、深层对象）存 JSON 文本
function flatten(row) {
  const out = {};
  Object.keys(row || {}).forEach(k => {
    const v = row[k];
    if (v === null || v === undefined) return;
    if (isPlain(v)) {
      Object.keys(v).forEach(sk => {
        const sv = v[sk];
        if (sv === null || sv === undefined) return;
        out[snake(k) + '_' + snake(sk)] = isPlain(sv) || Array.isArray(sv) ? JSON.stringify(sv) : scalar(sv);
      });
    } else {
      out[snake(k)] = Array.isArray(v) ? JSON.stringify(v) : scalar(v);
    }
  });
  return out;
}

// 建表并写入：列 = 固定列 + 所有行出现过的字段 + json（整行原文）
function writeTable(db, name, rows, ensure) {
  const flat = rows.map(r => flatten(r.row));
  const cols = [];
  const add = c => { if (c !== 'json' && cols.indexOf(c) < 0) cols.push(c); };
  (ensure || []).forEach(add);
  flat.forEach(f => Object.keys(f).forEach(add));
  const q = c => '"' + c + '"';
  db.exec('CREATE TABLE ' + q(name) + ' (' + cols.map(q).concat('"json"').join(', ') + ')');
  const ins = db.prepare('INSERT INTO ' + q(name) + ' (' + cols.map(q).concat('"json"').join(', ') + ') VALUES (' +
    cols.map(() => '?').concat('?').join(', ') + ')');
  flat.forEach((f, i) => {
    const vals = cols.map(c => (f[c] === undefined ? null : f[c]));
    vals.push(JSON.stringify(rows[i].raw));
    ins.run(...vals);
  });
  return rows.length;
}

const ARRAYS = [
  ['badges', 'badges'], ['readings', 'readings'], ['rewards', 'rewards'], ['redemptions', 'redemptions'],
  ['drillHistory', 'drill_history'], ['mathWrong', 'math_wrong'], ['quizWrong', 'quiz_wrong'],
  ['quizHistory', 'quiz_history'], ['reviewLog', 'review_log'], ['dailyLog', 'daily_log'], ['conquered', 'conquered'],
];

function convert(text, out, opts) {
  opts = opts || {};
  const v = BACKUP.validate(String(text).replace(/^﻿/, '').trim());
  if (!v.ok) throw new Error(v.error);
  const backup = v.data; // validate 返回整份备份对象
  const d = backup.data;
  if (fs.existsSync(out)) {
    if (!opts.force) throw new Error('输出文件已存在：' + out + '（加 --force 覆盖）');
  }
  const { DatabaseSync } = loadSqlite();
  const tmp = out + '.tmp-' + process.pid;
  const tables = {};
  const db = new DatabaseSync(tmp);
  try {
    db.exec('BEGIN');
    const p = d.profile || {};
    db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value)');
    const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    [['app', 'tiantian-daka'], ['backup_version', BACKUP.BACKUP_VERSION], ['exported_at', backup.exportedAt || null],
      ['nickname', p.nickname || ''], ['grade', p.grade || null], ['role', p.role || ''],
      ['profile_json', JSON.stringify(p)], ['settings_json', JSON.stringify(d.settings || {})],
      ['task_overrides_json', JSON.stringify(d.taskOverrides || {})]]
      .forEach(([k, val]) => meta.run(k, val === undefined ? null : val));

    // 打卡记录：带任务名与板块（自定义任务名来自备份里的任务覆盖）
    const customs = ((d.taskOverrides || {}).customs || []).filter(c => c && c.id);
    const defOf = id => T.DEFS[id] || customs.find(c => c.id === id) || null;
    tables.records = writeTable(db, 'records', (d.records || []).map(r => {
      const def = defOf(r.taskId);
      return { raw: r, row: { ...r, taskName: def ? def.name : r.taskId, section: def ? def.section : '', makeup: !!r.makeup, deleted: !!r.deleted } };
    }), ['id', 'date', 'task_id', 'task_name', 'section', 'value_type', 'value_n', 'stars', 'note', 'makeup', 'deleted', 'updated_at']);
    db.exec('CREATE VIEW daily_summary AS SELECT date, COUNT(*) AS tasks, SUM(stars) AS stars FROM records ' +
      'WHERE COALESCE(deleted, 0) = 0 GROUP BY date');
    tables.custom_tasks = writeTable(db, 'custom_tasks', customs.map(c => ({ raw: c, row: c })), ['id', 'name']);

    ARRAYS.forEach(([key, name]) => {
      tables[name] = writeTable(db, name, (d[key] || []).map(r => ({ raw: r, row: isPlain(r) ? r : { value: r } })));
    });
    // 对象型集合：每周目标按周一展开，记忆卡按牌组 / 卡片展开
    const goals = d.goals || {};
    tables.goals = writeTable(db, 'goals', Object.keys(goals).sort().map(w => ({ raw: goals[w], row: { week: w, ...goals[w] } })), ['week']);
    const fc = d.flashcards || {};
    const cards = [];
    Object.keys(fc).forEach(deck => Object.keys(fc[deck] || {}).forEach(card => {
      cards.push({ raw: fc[deck][card], row: { deck, card, ...fc[deck][card] } });
    }));
    tables.flashcards = writeTable(db, 'flashcards', cards, ['deck', 'card']);
    db.exec('COMMIT');
    db.close();
    if (fs.existsSync(out)) fs.unlinkSync(out);
    fs.renameSync(tmp, out);
  } catch (e) {
    try { db.close(); } catch (e2) { /* 已关闭 */ }
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw e;
  }
  return { out, tables };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.indexOf('--force') > -1;
  const files = args.filter(a => a !== '--force');
  if (!files.length) {
    console.log('用法：node scripts/backup-to-sqlite.js <备份.txt> [输出.sqlite] [--force]');
    process.exit(1);
  }
  const input = files[0];
  const out = files[1] || path.join(path.dirname(input), path.basename(input, path.extname(input)) + '.sqlite');
  try {
    const res = convert(fs.readFileSync(input, 'utf8'), out, { force });
    console.log('✓ 已生成 ' + res.out);
    Object.keys(res.tables).forEach(k => console.log('  ' + k.padEnd(14) + res.tables[k] + ' 行'));
    console.log('  另有 meta 表与 daily_summary 视图。例：sqlite3 ' + JSON.stringify(res.out) + ' "SELECT * FROM daily_summary ORDER BY date DESC LIMIT 7"');
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}

module.exports = { convert, loadSqlite };
