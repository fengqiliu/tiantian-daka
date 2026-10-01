// 任务内容库 + 每日任务生成引擎
// 内容对齐上海小学：沪教版课程习惯、"双减"（1-2年级不留书面回家作业）、
// 每天锻炼、近视防控（户外"目浴阳光"）、睡眠管理（小学生10小时）等要求。
const D = require('./date');

// 学科/板块元信息（颜色同时用于页面渲染）
const SECTIONS = {
  chinese: { name: '语文', color: '#FF6B6B', bg: '#FFEBEB' },
  math:    { name: '数学', color: '#4D96FF', bg: '#E8F1FF' },
  english: { name: '英语', color: '#9B5DE5', bg: '#F3EAFE' },
  pe:      { name: '运动', color: '#37B24D', bg: '#E8F8EC' },
  fun:     { name: '娱乐', color: '#F59F00', bg: '#FFF4D6' },
  habit:   { name: '习惯', color: '#12B5B0', bg: '#E0F7F6' },
};

const SECTION_ORDER = ['chinese', 'math', 'english', 'pe', 'fun', 'habit'];

// 年级段：low=1-2年级（双减：以听说读为主，不布置书面作业）、mid=3-4、high=5
function bandOf(grade) { return grade <= 2 ? 'low' : grade <= 4 ? 'mid' : 'high'; }

// 任务定义库：type = duration(分钟) | count(计数) | done(完成即可)
// target: { low, mid, high } 各年级段默认目标值
const DEFS = {
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
function generateDailyTasks(grade, dateStr) {
  const band = bandOf(grade);
  const dow = D.dayOfWeek(dateStr);
  const weekend = dow === 0 || dow === 6;
  const pick = (id, must, ov) => buildTask(id, grade, must, ov);
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
  return list.filter(Boolean);
}

function getTaskDef(id) { return DEFS[id]; }

module.exports = {
  SECTIONS, SECTION_ORDER, DEFS,
  bandOf, buildTask, generateDailyTasks, getTaskDef, targetLabel,
};
