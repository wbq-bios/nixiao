// 逆水小助手 · 入口
const season = require("./core/season.js");
const api = require("./utils/api.js");
const store = require("./core/store.js");
const pack = require("./games/xq/pack.js");

App({
  onLaunch() {
    season.init(pack);
    // MySQL 后端：静默登录 + 双向同步（后端未启动时自动离线，不影响使用）
    api.ensureLogin().then(ok => {
      if (ok) store.pullRemote();
    });
    // Phase 远期（云开发方案保留）：wx.cloud.init({ env: "..." })
  },
  pack,
});
