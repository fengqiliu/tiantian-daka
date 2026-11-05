// 数据备份：全量序列化 / 校验 / 恢复（纯逻辑）
// 覆盖用户数据的全部集合；不含设备专属数据（同步游标、家长端孩子缓存）。
const store = require('./store');
const SAN = require('./sanitize');

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
      reviewLog: store.getReviewLog(),
      goals: store.getGoals(),
      flashcards: store.getFlashcards(), // 0.35.0 起导出
      settings: store.getSettings(),
    },
  };
}

// 校验剪贴板文本：结构合法返回 {ok:true, data}，否则 {ok:false, error}
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

function validate(text) {
  if (typeof text === 'string' && text.length > MAX_BACKUP_BYTES) return { ok: false, error: '备份文件太大（超过 5MB）' };
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
  // 字段类型 / 格式：坏数据写进本机存储会让统计出 NaN 或页面异常
  const num = v => v === undefined || (typeof v === 'number' && isFinite(v));
  if (d.records.some(r => !SAN.validDate(r.date) || r.id !== r.date + '#' + r.taskId || !num(r.stars) || !num(r.updatedAt)
    || (r.value !== undefined && (!r.value || typeof r.value !== 'object' || !num(r.value.n))))) {
    return { ok: false, error: '打卡记录的日期、星级或数值格式不对' };
  }
  if (d.reviewLog !== undefined && !Array.isArray(d.reviewLog)) return { ok: false, error: '字段 reviewLog 应为数组' };
  if (d.goals !== undefined && (!d.goals || typeof d.goals !== 'object' || Array.isArray(d.goals))) {
    return { ok: false, error: '字段 goals 应为对象' };
  }
  if (d.flashcards !== undefined && (!d.flashcards || typeof d.flashcards !== 'object' || Array.isArray(d.flashcards))) {
    return { ok: false, error: '字段 flashcards 应为对象' };
  }
  if (d.taskOverrides && (typeof d.taskOverrides !== 'object' || !d.taskOverrides.targets)) {
    return { ok: false, error: '任务覆盖格式不正确' };
  }
  return { ok: true, data: parsed };
}

// 备份摘要（只读，不写入）：导入前给用户确认用
function summarize(parsed) {
  const d = parsed.data;
  return {
    records: (d.records || []).filter(r => !r.deleted).length,
    badges: (d.badges || []).length,
    redemptions: (d.redemptions || []).length,
    exportedAt: parsed.exportedAt,
  };
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
  store.saveReviewLog(d.reviewLog || []); // 0.14.0 起导出；旧备份没有此字段
  store.saveGoals(d.goals || {});         // 0.19.1 起导出（含达成戳，奖励星随之恢复）
  store.saveFlashcards(d.flashcards || {}); // 0.35.0 起导出；旧备份没有此字段
  store.saveSettings(d.settings || {});
  return summarize(parsed);
}

// 从剪贴板文本一步导入
function restoreFromText(text) {
  const v = validate(text);
  if (!v.ok) return v;
  return { ok: true, summary: restore(v.data) };
}

module.exports = { BACKUP_VERSION, serialize, validate, summarize, restore, restoreFromText };
