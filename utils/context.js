// 数据作用域：孩子端读写本机数据；家长端只读"孩子数据缓存"
// 页面统一从 scope() 取 records/grade/badges，家长模式自动切换数据源。
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
    readOnly: true,
    bound: !!child,
  };
}

module.exports = { scope };
