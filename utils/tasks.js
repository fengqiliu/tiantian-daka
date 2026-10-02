// 任务内容库 + 每日任务生成引擎
// 内容对齐上海小学：沪教版课程习惯、"双减"（1-2年级不留书面回家作业）、
// 每天锻炼、近视防控（户外"目浴阳光"）、睡眠管理（小学生10小时）等要求。
const D = require('./date');
const CAL = require('./calendar-config');

// 学科/板块元信息（颜色同时用于页面渲染）
const SECTIONS = {
  chinese: { name: '语文', color: '#FF6B6B', bg: '#FFEBEB' },
  math:    { name: '数学', color: '#4D96FF', bg: '#E8F1FF' },
  english: { name: '英语', color: '#9B5DE5', bg: '#F3EAFE' },
  study:   { name: '学习', color: '#A9746E', bg: '#F3EAE5' },
  pe:      { name: '运动', color: '#37B24D', bg: '#E8F8EC' },
  fun:     { name: '娱乐', color: '#F59F00', bg: '#FFF4D6' },
  habit:   { name: '习惯', color: '#12B5B0', bg: '#E0F7F6' },
};

const SECTION_ORDER = ['chinese', 'math', 'english', 'study', 'pe', 'fun', 'habit'];

// 年级段：low=1-2年级（双减：以听说读为主，不布置书面作业）、mid=3-4、high=5
function bandOf(grade) { return grade <= 2 ? 'low' : grade <= 4 ? 'mid' : 'high'; }

// 任务定义库：type = duration(分钟) | count(计数) | done(完成即可)
// target: { low, mid, high } 各年级段默认目标值
const DEFS = {
  // ── 学习（假期模式）──
  holiday_homework: {
    section: 'study', name: '假期作业', emoji: '📝', type: 'duration', unit: '分钟',
    target: { low: 30, mid: 40, high: 60 },
    desc: '按计划推进假期作业，每天固定时间做一点，开学前从容完成，不搞最后突击。',
  },
  // ── 语文 ──
  chinese_read: {
    section: 'chinese', name: '课文朗读', emoji: '📖', type: 'duration', unit: '分钟',
    target: { low: 15, mid: 20, high: 20 },
    desc: '大声朗读课文，读准字音、读通句子。坚持朗读培养语感，还能帮助记忆。',
  },
  chinese_poem: {
    section: 'chinese', name: '古诗古文背诵', emoji: '📜', type: 'count', unit: '首',
    target: { low: 1, mid: 2, high: 3 },
    desc: '背诵教材里的古诗文篇目。上海语文考试重视古诗文，从小积累不吃亏。',
  },
  chinese_write: {
    section: 'chinese', name: '写字练字', emoji: '✍️', type: 'duration', unit: '分钟',
    target: { low: 10, mid: 15, high: 15 },
    desc: '一笔一画认真练字，注意坐姿和握笔姿势。字如其人，卷面也是分数。',
  },
  chinese_reading_ext: {
    section: 'chinese', name: '课外阅读', emoji: '📚', type: 'duration', unit: '分钟',
    target: { low: 20, mid: 25, high: 30 },
    desc: '读自己喜欢的课外书。低年级读注音读物和绘本，中高年级读桥梁书和儿童文学。',
  },
  chinese_diary: {
    section: 'chinese', name: '看图说话 / 小日记', emoji: '📔', type: 'count', unit: '篇',
    target: { low: 1, mid: 1, high: 1 },
    desc: '低年级看图说几句话，中高年级写一段小日记（周末写周记）。把生活写下来，作文不用愁。',
  },
  // ── 数学 ──
  math_calc: {
    section: 'math', name: '口算天天练', emoji: '🧮', type: 'count', unit: '题',
    target: { low: 20, mid: 30, high: 50 },
    desc: '每天一组口算，限时完成。口算是数学的基本功，正确率和速度都要练。低年级可以用扑克牌或口头出题。',
  },
  math_think: {
    section: 'math', name: '思维挑战', emoji: '🧠', type: 'count', unit: '道',
    target: { low: 2, mid: 3, high: 4 },
    desc: '做几道思维题：数独、图形推理或应用题。动动小脑筋，越想越聪明。',
  },
  math_review: {
    section: 'math', name: '本周知识梳理', emoji: '📒', type: 'duration', unit: '分钟',
    target: { low: 15, mid: 20, high: 20 },
    desc: '把这一周学的知识点整理一遍：错题看一遍，公式记一记。',
  },
  // ── 英语 ──
  english_listen: {
    section: 'english', name: '英语跟读听读', emoji: '🎧', type: 'duration', unit: '分钟',
    target: { low: 10, mid: 15, high: 15 },
    desc: '跟着教材录音（沪教版牛津上海版）读课文，模仿语音语调，练出一口好发音。',
  },
  english_words: {
    section: 'english', name: '单词打卡', emoji: '🔤', type: 'count', unit: '个',
    target: { low: 3, mid: 5, high: 10 },
    desc: '认一认、拼一拼几个新单词，再复习学过的。低年级可以用自然拼读帮忙记。',
  },
  english_read: {
    section: 'english', name: '英语绘本阅读', emoji: '📙', type: 'duration', unit: '分钟',
    target: { low: 15, mid: 20, high: 20 },
    desc: '读一本英语分级读物或绘本，看图猜意思，不怕生词。',
  },
  // ── 运动 ──
  pe_rope: {
    section: 'pe', name: '跳绳', emoji: '🪢', type: 'count', unit: '个',
    target: { low: 100, mid: 300, high: 400 },
    desc: '每天跳一跳，分几组完成。跳绳是上海小学生体质健康测试的重要项目，坚持练出好成绩。',
  },
  pe_fitness: {
    section: 'pe', name: '体能组合', emoji: '💪', type: 'count', unit: '组',
    target: { low: 2, mid: 2, high: 3 },
    desc: '仰卧起坐、平板支撑、坐位体前屈各来一组，练出好体魄。',
  },
  pe_outdoor: {
    section: 'pe', name: '户外活动', emoji: '🌳', type: 'duration', unit: '分钟',
    target: { low: 40, mid: 40, high: 30 },
    desc: '到户外跑跑跳跳。"目浴阳光"是预防近视的良方，每天户外越久眼睛越亮。',
  },
  pe_ball: {
    section: 'pe', name: '球类 / 游泳 / 骑行', emoji: '⚽', type: 'duration', unit: '分钟',
    target: { low: 60, mid: 60, high: 60 },
    desc: '周末选一项喜欢的运动，和小伙伴一起玩起来。',
  },
  // ── 娱乐（非屏幕优先）──
  fun_hobby: {
    section: 'fun', name: '兴趣时间', emoji: '🎨', type: 'duration', unit: '分钟',
    target: { low: 20, mid: 20, high: 30 },
    desc: '画画、乐器、乐高、手工……做自己喜欢的事，也是一种休息。',
  },
  fun_board: {
    section: 'fun', name: '亲子桌游', emoji: '🎲', type: 'duration', unit: '分钟',
    target: { low: 30, mid: 30, high: 30 },
    desc: '和爸爸妈妈玩一盘桌游或拼图，是一天里笑声最多的时光。',
  },
  fun_screen: {
    section: 'fun', name: '屏幕时间', emoji: '📺', type: 'duration', unit: '分钟',
    target: { low: 15, mid: 15, high: 15 }, parentConfirm: true,
    desc: '看动画或玩游戏要适量：单次不超过15分钟，完成后请家长确认哦。',
  },
  // ── 习惯 ──
  habit_bag: {
    section: 'habit', name: '整理书包', emoji: '🎒', type: 'done', unit: '',
    target: { low: 1, mid: 1, high: 1 },
    desc: '睡前按课表整理好书包，明天早上不慌张。',
  },
  habit_chore: {
    section: 'habit', name: '家务小帮手', emoji: '🧹', type: 'done', unit: '',
    target: { low: 1, mid: 1, high: 1 },
    desc: '帮家里做一件小事：摆碗筷、浇花、倒垃圾。劳动最光荣！',
  },
  habit_sleep: {
    section: 'habit', name: '早点睡觉', emoji: '🌙', type: 'done', unit: '',
    target: { low: 1, mid: 1, high: 1 },
    desc: '小学生每天要睡够10小时。21:20前上床，明天精神棒棒！',
  },
};

function targetLabel(def, t) {
  if (def.type === 'duration') return '目标 ' + t + ' 分钟';
  if (def.type === 'count') return '目标 ' + t + ' ' + (def.unit || '个');
  return '完成即可';
}

// 生成单个任务项（解析年级段目标值，可被 override 覆盖，如周末户外时长）
function buildTask(id, grade, must, override) {
  const def = DEFS[id];
  if (!def) return null;
  const band = bandOf(grade);
  const target = (override != null) ? override : def.target[band];
  return {
    id, section: def.section, name: def.name, emoji: def.emoji,
    type: def.type, unit: def.unit, target, must: !!must,
    parentConfirm: !!def.parentConfirm, desc: def.desc,
    targetLabel: targetLabel(def, target),
  };
}

// 每日任务生成：确定性 —— 同一 (grade, date) 永远生成同一份清单。
// must=true 的 4 项为"今日必做"（语数英 + 主运动），全部完成即达成当日目标。
// memo：totalStars/月历/勋章评估会对同一 (grade, date) 反复生成，缓存省去重复构建；
// key 含覆盖内容的指纹 —— 家长改目标/自定义任务后 key 变化，旧缓存自然失效。
const _memo = new Map();
const MEMO_MAX = 800; // 5 年级 × 730 天 ≈ 3650，实际浏览窗口远小于此；超限整体清空即可

// 覆盖内容的指纹：无覆盖时为 '0'（快速路径）；有覆盖时用时间戳 + JSON 指纹
// （仅靠 updatedAt 不够：同毫秒两次保存内容可能不同，测试注入的覆盖也可能无盖章）
function overridesFingerprint() {
  const o = getOverrides();
  const targets = o.targets || {};
  const customs = o.customs || [];
  if (!Object.keys(targets).length && !customs.length) return '0';
  return (o.updatedAt || 0) + ':' + JSON.stringify({ targets, customs });
}

function generateDailyTasks(grade, dateStr) {
  const key = (Number(grade) || 3) + '@' + dateStr + '@' + overridesFingerprint();
  const cached = _memo.get(key);
  if (cached) return cached;
  const result = _generateDailyTasksUncached(grade, dateStr);
  if (_memo.size >= MEMO_MAX) _memo.clear();
  _memo.set(key, result);
  return result;
}

function _generateDailyTasksUncached(grade, dateStr) {
  const band = bandOf(grade);
  const dow = D.dayOfWeek(dateStr);
  const weekend = dow === 0 || dow === 6;
  const pick = (id, must, ov) => buildTask(id, grade, must, ov);

  // 假期模式：寒暑假按校历自动切换（见 calendar-config.js）
  const hol = CAL.holidayAt(dateStr);
  if (hol) return generateHolidayTasks(grade, dow, hol);

  let list = [];

  if (!weekend) {
    // 上学日：语数英+跳绳必做（口算用口头形式，不算"双减"限制的书面作业）
    list = [
      pick('chinese_read', true),
      pick('math_calc', true),
      pick('english_listen', true),
      pick('pe_rope', true),
      pick('chinese_reading_ext'),
      pick('fun_hobby'),
      pick('pe_outdoor'),
      pick('fun_screen'),
      pick('habit_bag'),
      pick('habit_sleep'),
    ];
    if (dow === 1 || dow === 3 || dow === 5) list.push(pick('chinese_poem'));
    if (band === 'low') {
      if (dow === 2 || dow === 4) list.push(pick('chinese_write'));
    } else if (band === 'mid') {
      if (dow === 2 || dow === 4) list.push(pick('english_words'), pick('chinese_diary'), pick('pe_fitness'));
    } else {
      if (dow === 2 || dow === 4) list.push(pick('english_words'), pick('pe_fitness'));
      if (dow === 3 || dow === 5) list.push(pick('chinese_diary'));
    }
  } else {
    // 周末：户外活动升级为必做（近视防控"目浴阳光"），学习保持但不加量
    const outdoor = band === 'low' ? 60 : 90;
    list = [
      pick('chinese_read', true),
      pick('math_calc', true),
      pick('english_listen', true),
      pick('pe_outdoor', true, outdoor),
      pick('chinese_reading_ext', false, band === 'low' ? 30 : null),
      pick('fun_hobby', false, 30),
      pick('fun_board'),
      pick('pe_ball'),
      pick('fun_screen', false, band === 'low' ? 20 : 30),
      pick('habit_chore'),
      pick('habit_sleep'),
    ];
    if (band !== 'low') {
      list.push(pick('math_think'), pick('english_read'));
      if (dow === 6) list.push(pick('math_review'));
      if (dow === 0) list.push(pick('chinese_diary')); // 周日：写周记
    }
  }
  return applyOverrides(list.filter(Boolean));
}

// ── 家长任务管理：目标覆盖与自定义任务的注入源 ──
// app.js 启动时接入 store（setOverrideProvider），云函数 lib 不注入即用默认值，
// 因此 tasks.js 保持零 store 依赖、可独立测试。
let overrideProvider = null;
function setOverrideProvider(fn) { overrideProvider = fn; }

function getOverrides() {
  let o = null;
  try { o = overrideProvider ? overrideProvider() : null; } catch (e) { o = null; }
  return (o && typeof o === 'object') ? o : { targets: {}, customs: [] };
}

function getTaskDef(id) {
  if (DEFS[id]) return DEFS[id];
  const customs = (getOverrides().customs || []);
  return customs.find(c => c && c.id === id) || null;
}

// 生成清单的统一后处理：应用家长目标覆盖（只改目标值，必做结构不变）并追加自定义任务
function applyOverrides(list) {
  const o = getOverrides();
  const targets = (o && o.targets) || {};
  Object.keys(targets).forEach(id => {
    const t = list.find(x => x.id === id);
    const v = Number(targets[id]);
    if (t && t.type !== 'done' && v > 0) {
      t.target = v;
      t.targetLabel = targetLabel(t, v);
      t.customized = true;
    }
  });
  ((o && o.customs) || []).forEach(c => {
    if (!c || !c.id || !c.name) return;
    const target = Number(c.target) || 1;
    const def = { ...c, type: c.type || 'done', unit: c.unit || '', target };
    list.push({
      ...def,
      must: false,
      parentConfirm: false,
      desc: c.desc || '自定义任务',
      targetLabel: targetLabel(def, target),
      custom: true,
    });
  });
  return list;
}

// 假期模式每日清单：无上学日/周末之分。
// 结构：假期作业 + 阅读 + 口算（减量）+ 户外 120 分钟（近视防控，加量）为必做；
// 跳绳/跟读/朗读转为自选保持习惯；"整理书包"随上学取消；古诗/单词/日记按星期轮换。
function generateHolidayTasks(grade, dow, hol) {
  const band = bandOf(grade);
  const pick = (id, must, ov) => {
    const t = buildTask(id, grade, must, ov);
    if (t) t.holiday = hol.name;
    return t;
  };
  const list = [
    pick('holiday_homework', true),
    pick('chinese_reading_ext', true, band === 'low' ? 30 : 40),
    pick('math_calc', true, { low: 10, mid: 20, high: 30 }[band]),
    pick('pe_outdoor', true, 120),
    pick('chinese_read', false, { low: 15, mid: 15, high: 20 }[band]),
    pick('english_listen'),
    pick('pe_rope'),
    pick('pe_ball'),
    pick('fun_hobby', false, { low: 30, mid: 40, high: 40 }[band]),
    pick('fun_board'),
    pick('fun_screen', false, 20),
    pick('habit_chore'),
    pick('habit_sleep'),
  ];
  if (band !== 'low') list.push(pick('math_think'), pick('english_read'));
  if (dow === 1 || dow === 3 || dow === 5) list.push(pick('chinese_poem'));
  if (dow === 2 || dow === 4) list.push(pick('english_words'));
  if (dow === 0 && band !== 'low') list.push(pick('chinese_diary'));
  return applyOverrides(list.filter(Boolean));
}

module.exports = {
  SECTIONS, SECTION_ORDER, DEFS,
  bandOf, buildTask, generateDailyTasks, generateHolidayTasks, getTaskDef, targetLabel,
  setOverrideProvider, applyOverrides,
};
