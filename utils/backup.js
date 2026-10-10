// 数据备份：全量序列化 / 校验 / 恢复（纯逻辑）
// 覆盖用户数据的全部集合；不含设备专属数据（同步游标、家长端孩子缓存）。
const store = require('./store');

const BACKUP_VERSION = 1;

// 收集导出内容（raw：打卡记录含墓碑、任务覆盖含时间戳）
function serialize() {
  return {
    app: 'tiantian-daka',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: {
      profile: store.getProfile(),
      records: store.getRecordsRaw(),
      badges: store.getBadges(),
      readings: store.getReadings(),
      rewards: store.getRewards(),
      redemptions: store.getRedemptions(),
      taskOverrides: store.getTaskOverrides(),
      drillHistory: store.getDrillHistory(),
      mathWrong: store.getMathWrong(),
      quizWrong: store.getQuizWrong(),
      quizHistory: store.getQuizHistory(),
      settings: store.getSettings(),
    },
  };
}

// 校验剪贴板文本：结构合法返回 {ok:true, data}，否则 {ok:false, error}
function validate(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '不是有效的 JSON' };
  }
  if (!parsed || parsed.app !== 'tiantian-daka') return { ok: false, error: '不是本项目的备份文件' };
  if (parsed.version !== BACKUP_VERSION) return { ok: false, error: '备份版本不支持（v' + parsed.version + '）' };
  const d = parsed.data;
  if (!d || typeof d !== 'object') return { ok: false, error: '缺少 data 字段' };
  const arrays = ['records', 'badges', 'readings', 'rewards', 'redemptions', 'drillHistory', 'mathWrong', 'quizWrong', 'quizHistory'];
  for (const key of arrays) {
    if (!Array.isArray(d[key])) return { ok: false, error: '字段 ' + key + ' 应为数组' };
  }
  if (d.records.some(r => !r || typeof r !== 'object' || !r.id || !r.date || !r.taskId)) {
    return { ok: false, error: '打卡记录存在缺字段的条目' };
  }
  if (d.taskOverrides && (typeof d.taskOverrides !== 'object' || !d.taskOverrides.targets)) {
    return { ok: false, error: '任务覆盖格式不正确' };
  }
  return { ok: true, data: parsed };
}

// 恢复：覆盖本机全部用户数据；返回写入摘要
function restore(parsed) {
  const d = parsed.data;
  if (d.profile) store.saveProfileRaw(d.profile);
  store.saveRecords(d.records || []);
  store.saveBadges(d.badges || []);
  store.saveReadings(d.readings || []);
  store.saveRewards(d.rewards || []);
  store.saveRedemptions(d.redemptions || []);
  store.saveTaskOverridesRaw(d.taskOverrides || { targets: {}, customs: [] });
  store.saveDrillHistory(d.drillHistory || []);
  store.saveMathWrong(d.mathWrong || []);
  store.saveQuizWrong(d.quizWrong || []);
  store.saveQuizHistory(d.quizHistory || []);
  store.saveSettings(d.settings || {});
  return {
    records: (d.records || []).filter(r => !r.deleted).length,
    badges: (d.badges || []).length,
    redemptions: (d.redemptions || []).length,
    exportedAt: parsed.exportedAt,
  };
}

// 从剪贴板文本一步导入
function restoreFromText(text) {
  const v = validate(text);
  if (!v.ok) return v;
  return { ok: true, summary: restore(v.data) };
}

module.exports = { BACKUP_VERSION, serialize, validate, restore, restoreFromText };
