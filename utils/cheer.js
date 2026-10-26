// 家长鼓励留言：常用语、称呼、校验与横幅挑选（纯逻辑，无依赖；客户端与 family 云函数共用）
// ⚠️ 云函数副本 cloudfunctions/family/lib/cheer.js 由 scripts/sync-cloud-libs.js 复制，勿直接改
const PRESETS = [
  '今天表现真棒！👍',
  '坚持打卡，你是最棒的！🌟',
  '跳绳越来越厉害啦！🪢',
  '字写得真工整！✍️',
  '错题都改对了，了不起！💯',
  '早点睡，明天继续加油！🌙',
  '为你骄傲！❤️',
  '周末带你去玩！🎈',
];
const FROM_OPTIONS = ['妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆', '家长'];
const MAX_LEN = 40;     // 留言最多 40 字（emoji 按 1 字计）
const LABEL_MAX = 20;   // 关联任务标签最多 20 字
const DAILY_LIMIT = 10; // 同一家长 24 小时内最多 10 条

function _len(s) { return Array.from(s).length; }

function isPreset(text) { return PRESETS.indexOf(text) > -1; }

// 校验并规范化：返回 { ok:true, from, text, recordId, recordLabel } 或 { ok:false, error }
function validate(input) {
  const i = input || {};
  const from = String(i.from || '');
  if (FROM_OPTIONS.indexOf(from) < 0) return { ok: false, error: '请选择称呼' };
  const text = String(i.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, error: '写一句话吧' };
  if (_len(text) > MAX_LEN) return { ok: false, error: '最多 ' + MAX_LEN + ' 个字' };
  const recordLabel = String(i.recordLabel || '').trim();
  if (_len(recordLabel) > LABEL_MAX) return { ok: false, error: '关联任务名称过长' };
  const recordId = i.recordId ? String(i.recordId).slice(0, 40) : null;
  return { ok: true, from, text, recordId, recordLabel };
}

// 孩子首页横幅：最新的一条未读 + 未读总数；没有未读返回 null
function banner(list) {
  const unread = (list || []).filter(c => !c.readAt).sort((a, b) => b.createdAt - a.createdAt);
  return unread.length ? { cheer: unread[0], unread: unread.length } : null;
}

module.exports = { PRESETS, FROM_OPTIONS, MAX_LEN, LABEL_MAX, DAILY_LIMIT, isPreset, validate, banner };
