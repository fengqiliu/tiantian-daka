// 云端入参清洗：云函数对客户端传来的数据一律"白名单字段 + 长度 / 取值范围 + 时间戳封顶"，
// 不能把客户端对象原样展开写库（否则可以塞任意字段、超大内容，或用未来时间戳永久霸占"新者胜"）。
// ⚠️ 云函数副本 cloudfunctions/sync/lib/sanitize.js 由 scripts/sync-cloud-libs.js 复制，勿直接改；本文件不能依赖其他模块
const MAX_PUSH_RECORDS = 500;   // 单次推送的记录条数上限（客户端按 200 条一批发送）
const MAX_BADGES = 100;
const CLOCK_SKEW_MS = 5 * 60 * 1000; // 容许设备时钟比服务器快 5 分钟
const MAX_NOTE = 200;
const MAX_VALUE = 100000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_RE = /^[\w-]{1,64}$/;
const BADGE_RE = /^[\w-]{1,40}$/;

function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// 时间戳：非数字 → 0；超过 now + 容许误差 → 封顶
function clampStamp(v, now) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), now + CLOCK_SKEW_MS);
}

// 打卡记录：返回清洗后的新对象，非法返回 null
function cleanRecord(r, now) {
  if (!r || typeof r !== 'object') return null;
  if (!validDate(r.date) || typeof r.taskId !== 'string' || !TASK_RE.test(r.taskId)) return null;
  if (r.id !== r.date + '#' + r.taskId) return null;
  const v = r.value && typeof r.value === 'object' ? r.value : {};
  const n = Number(v.n);
  const stars = Math.round(Number(r.stars));
  return {
    id: r.id,
    date: r.date,
    taskId: r.taskId,
    value: { type: typeof v.type === 'string' ? v.type.slice(0, 16) : 'done', n: isFinite(n) ? Math.min(Math.max(n, 0), MAX_VALUE) : 0 },
    stars: isFinite(stars) ? Math.min(Math.max(stars, 0), 3) : 0,
    note: typeof r.note === 'string' ? r.note.slice(0, MAX_NOTE) : '',
    deleted: !!r.deleted,
    updatedAt: clampStamp(r.updatedAt, now),
    makeup: !!r.makeup,
    makeupAt: clampStamp(r.makeupAt, now),
  };
}

function cleanBadge(b) {
  if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !BADGE_RE.test(b.id)) return null;
  const t = Number(b.earnedAt);
  return { id: b.id, earnedAt: isFinite(t) && t >= 0 ? Math.floor(t) : 0 };
}

// 整体存储的对象（资料 / 任务覆盖 / 小铺 / 练习 / 错题本）：按 UTF-8 字节数限制大小
function withinBytes(obj, max) {
  if (!obj || typeof obj !== 'object') return false;
  try { return Buffer.byteLength(JSON.stringify(obj), 'utf8') <= max; } catch (e) { return false; }
}
const LIMITS = { profile: 4 * 1024, overrides: 20 * 1024, shop: 100 * 1024, practice: 300 * 1024, wrong: 600 * 1024 };

module.exports = { MAX_PUSH_RECORDS, MAX_BADGES, CLOCK_SKEW_MS, LIMITS, validDate, clampStamp, cleanRecord, cleanBadge, withinBytes };
