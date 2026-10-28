// 计时打卡：时长类任务（阅读、户外、练字等）用计时代替手填分钟（纯逻辑，now 可注入）
//
// 只存开始时间与累计暂停时长，经过的时间由时钟推算——切到后台、锁屏、离开页面都不丢时间。
// 同时只有一个计时（存在 store 里）；忘了关的计时最多记 CAP_MIN 分钟。
const store = require('./store');
const T = require('./tasks');

const CAP_MIN = 180;
const MIN = 60 * 1000;

function isTimerTask(taskId) {
  const def = T.getTaskDef(taskId);
  return !!def && def.type === 'duration';
}

function getActive() { return store.getTimer(); }

// 开始计时；同一任务再点开始沿用原计时，别的任务在计时时拒绝
function start(taskId, date, targetMin, now) {
  const cur = store.getTimer();
  if (cur) {
    if (cur.taskId === taskId && cur.date === date) return { ok: true, state: cur };
    return { ok: false, error: '还有一个计时没结束', active: cur };
  }
  const state = { taskId, date, targetMin: Number(targetMin) || 0, startAt: now || Date.now(), pausedMs: 0, pausedAt: 0 };
  store.saveTimer(state);
  return { ok: true, state };
}

function pause(now) {
  const cur = store.getTimer();
  if (!cur || cur.pausedAt) return cur;
  const next = { ...cur, pausedAt: now || Date.now() };
  store.saveTimer(next);
  return next;
}

function resume(now) {
  const cur = store.getTimer();
  if (!cur || !cur.pausedAt) return cur;
  const next = { ...cur, pausedMs: cur.pausedMs + ((now || Date.now()) - cur.pausedAt), pausedAt: 0 };
  store.saveTimer(next);
  return next;
}

function _elapsed(state, now) {
  const end = state.pausedAt || now || Date.now();
  return Math.min(CAP_MIN * MIN, Math.max(0, end - state.startAt - state.pausedMs));
}

function _clock(ms) {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}

// 页面展示：倒计时到目标；到点后显示 +超出时间
function view(state, now) {
  const elapsed = _elapsed(state, now);
  const targetMs = state.targetMin * MIN;
  const reached = targetMs > 0 && elapsed >= targetMs;
  return {
    taskId: state.taskId,
    date: state.date,
    elapsedMs: elapsed,
    minutes: Math.floor(elapsed / MIN),
    reached,
    overtime: reached,
    clock: reached ? '+' + _clock(elapsed - targetMs) : _clock(Math.max(0, targetMs - elapsed)),
    pct: targetMs ? Math.min(100, Math.round((elapsed / targetMs) * 100)) : 0,
    paused: !!state.pausedAt,
  };
}

// 结束：返回 { taskId, date, minutes } 并清除；没有计时返回 null
function stop(now) {
  const cur = store.getTimer();
  if (!cur) return null;
  store.saveTimer(null);
  return { taskId: cur.taskId, date: cur.date, minutes: Math.floor(_elapsed(cur, now) / MIN) };
}

function cancel() { store.saveTimer(null); }

module.exports = { CAP_MIN, isTimerTask, getActive, start, pause, resume, view, stop, cancel };
