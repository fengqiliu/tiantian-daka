const cloud = require('./utils/cloud');

App({
  onLaunch() {
    // 开通云开发并在 utils/cloud.js 配置 CLOUD_ENV 后，自动启用同步/家人绑定/提醒；
    // 未配置时保持纯本地模式（所有云调用静默降级）。
    if (cloud.init()) {
      cloud.syncAll(true);
    }
  },
});
