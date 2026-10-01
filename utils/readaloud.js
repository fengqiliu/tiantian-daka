// 跟读教室：录音状态机、跟读记录与完成度（纯逻辑，Node 可测）
// wx 的 RecorderManager / 文件系统调用集中在页面层，本模块只管状态与数据。
const store = require('./store');

const STATE = { IDLE: 'idle', RECORDING: 'recording', RECORDED: 'recorded' };
const MIN_SEC = 1;
const MAX_SEC = 60; // 单句录音上限（页面层 recorder.duration=60000ms 与此对应）
const PRUNE_DAYS = 7; // 跟读音频保留天数

function canRecord(state) { return state === STATE.IDLE || state === STATE.RECORDED; }
function canStop(state) { return state === STATE.RECORDING; }
function canPlay(state) { return state === STATE.RECORDED; }

// 录音时长钳制到 1-60 秒（设备返回异常值时兜底）
function clampDuration(sec) {
  sec = Math.round(Number(sec) || 0);
  return Math.min(MAX_SEC, Math.max(MIN_SEC, sec));
}

function recordId(date, sentenceId) { return date + '#' + sentenceId; }

// 保存跟读记录：同日同句覆盖（保留最新一条），返回被覆盖的旧记录便于页面清理音频文件
function saveReading(date, sentenceId, filePath, durationSec) {
  const readings = store.getReadings();
  const id = recordId(date, sentenceId);
  const rec = { id, date, sentenceId, filePath, durationSec: clampDuration(durationSec), createdAt: Date.now() };
  const i = readings.findIndex(r => r.id === id);
  const previous = i >= 0 ? readings[i] : null;
  if (i >= 0) readings[i] = rec; else readings.push(rec);
  store.saveReadings(readings);
  return { record: rec, previous };
}

function getDayReadings(date) {
  return store.getReadings().filter(r => r.date === date);
}

// 完成度：cards 为页面拼好的内容卡（句子+情境）
function completion(cards, readings) {
  const set = new Set(readings.map(r => r.sentenceId));
  const recorded = cards.filter(c => set.has(c.id)).length;
  return {
    recorded,
    total: cards.length,
    allDone: cards.length > 0 && recorded === cards.length,
  };
}

// 清理 cutoff 之前的跟读记录（音频文件由页面层删除），防止本地存储无限累积
function pruneReadings(cutoffDate) {
  const readings = store.getReadings();
  const keep = [], removed = [];
  readings.forEach(r => { (r.date < cutoffDate ? removed : keep).push(r); });
  if (removed.length) store.saveReadings(keep);
  return { removed, kept: keep.length };
}

module.exports = { STATE, MIN_SEC, MAX_SEC, PRUNE_DAYS, canRecord, canStop, canPlay, clampDuration, recordId, saveReading, getDayReadings, completion, pruneReadings };
