// 数据作用域：孩子端读写本机数据；家长端只读"孩子数据缓存"
// 页面统一从 scope() 取 records/grade/badges/练习历史，家长模式自动切换数据源。
const store = require('./store');

function scope() {
  const profile = store.getProfile() || {};
  const role = profile.role === 'parent' ? 'parent' : 'child';
  if (role === 'child') {
    return {
      role,
      profile,
      grade: Number(profile.grade) || 3,
      records: store.getRecords(),
      badges: store.getBadges(),
      drillSessions: store.getDrillHistory(),
      quizHistory: store.getQuizHistory(),
      reviewLog: store.getReviewLog(),
      mathWrong: store.getMathWrong(),
      quizWrong: store.getQuizWrong(),
      goals: store.getGoals(),
      flashcards: store.getFlashcards(),
      dailyLog: store.getDailyLog(),
      readOnly: false,
      bound: true,
    };
  }
  const child = store.getChildProfile();
  return {
    role,
    profile,
    child,
    grade: Number(child && child.grade) || 3,
    records: store.getChildRecords(),
    badges: store.getChildBadges(),
    drillSessions: store.getChildDrillHistory(),
    quizHistory: store.getChildQuizHistory(),
    reviewLog: store.getChildReviewLog(),
    mathWrong: store.getChildMathWrong(),
    quizWrong: store.getChildQuizWrong(),
    goals: store.getChildGoals(),
    flashcards: store.getChildFlashcards(),
    dailyLog: store.getChildDailyLog(),
    readOnly: true,
    bound: !!child,
  };
}

// 任务生成引擎用的任务覆盖：孩子端读自己的；家长端读孩子同步过来的（自定义任务名、目标、冲刺窗口与孩子一致），
// 不影响家长自己手机上的任务覆盖。app.js 启动时接入 tasks.setOverrideProvider
function taskOverrides() {
  const profile = store.getProfile() || {};
  return profile.role === 'parent' ? store.getChildTaskOverrides() : store.getTaskOverrides();
}

module.exports = { scope, taskOverrides };
