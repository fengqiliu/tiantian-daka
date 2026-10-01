const cloud = require('./utils/cloud');
const store = require('./utils/store');
const T = require('./utils/tasks');

App({
  onLaunch() {
    // 家长任务管理的覆盖/自定义任务接入生成引擎（云函数 lib 不注入，用默认值）
    T.setOverrideProvider(() => store.getTaskOverrides());
    // 开通云开发并在 utils/cloud.js 配置 CLOUD_ENV 后，自动启用同步/家人绑定/提醒；
    // 未配置时保持纯本地模式（所有云调用静默降级）。
    if (cloud.init()) {
      cloud.syncAll(true);
    }
  },
});
