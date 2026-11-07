// 显示偏好：大字模式（题目、记忆卡、任务名和按钮字号放大，适合刚认字的孩子或长辈）
// 存在本机设置里（ttdr_settings.bigFont），随备份导出；页面在 onLoad / onShow 读一次写进 data.big，
// 根节点加 big 样式类，放大规则集中在 app.wxss
const store = require('./store');

function bigFont() { return !!store.getSettings().bigFont; }

function setBigFont(on) {
  store.saveSettings({ ...store.getSettings(), bigFont: !!on });
}

module.exports = { bigFont, setBigFont };
