// 性能测试用的一年数据：约 300 个打卡日（每天打完必做 + 几项自选），外加练习、勋章、周目标
// 只依赖确定性的伪随机，结果每次一致。
const store = require('../utils/store');
const D = require('../utils/date');
const T = require('../utils/tasks');

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

// days：从 today 往前生成多少天；grade：年级
function seedYear(today, days, grade) {
  const r = rng(7);
  const records = [];
  const drill = [];
  const quiz = [];
  const review = [];
  const goals = {};
  for (let i = days - 1; i >= 0; i--) {
    const date = D.addDays(today, -i);
    if (r() < 0.12) continue; // 约 12% 的日子没打卡
    const ts = new Date(date + 'T19:00:00').getTime();
    T.generateDailyTasks(grade, date).forEach(t => {
      if (!t.must && r() < 0.5) return;
      records.push({
        id: date + '#' + t.id, date, taskId: t.id,
        value: { type: t.type, n: t.type === 'done' ? 1 : t.target }, stars: 1 + Math.floor(r() * 3), note: '', updatedAt: ts,
      });
    });
    if (r() < 0.4) drill.push({ date, level: 'addsub20', total: 10, correct: 6 + Math.floor(r() * 5), at: ts });
    if (r() < 0.1) quiz.push({ subject: 'math', total: 10, correct: 8, label: '良好', at: ts });
    if (r() < 0.3) review.push({ date, total: 5, correct: 4 });
    const monday = D.mondayOf(date);
    if (!goals[monday]) goals[monday] = { id: 'days5', type: 'achieve_days', target: 5, label: '5 天完成全部必做', emoji: '✅', setAt: ts, achievedAt: r() < 0.6 ? ts : 0 };
  }
  store.saveRecords(records);
  store.saveDrillHistory(drill.reverse().slice(0, 100));
  store.saveQuizHistory(quiz.reverse().slice(0, 50));
  store.saveReviewLog(review.reverse());
  store.saveGoals(goals);
  store.saveBadges(['first_checkin', 'perfect_day', 'streak_7', 'streak_30', 'calc_1000', 'rope_10k'].map((id, k) => ({ id, earnedAt: new Date(D.addDays(today, -300 + k * 40) + 'T10:00:00').getTime() })));
  return { records: records.length };
}

module.exports = { seedYear };
