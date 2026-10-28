// 后端 API 层 · 小程序 → Node API → MySQL
// 开发期 BASE 用本机；上线改成 https 域名（或云托管 callContainer）
const BASE = "http://localhost:3000";
const TOKEN_KEY = "xq-token";

function getToken() { return wx.getStorageSync(TOKEN_KEY) || ""; }

function request(path, method = "GET", data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + path,
      method,
      data,
      timeout: 10000,   // 兜底超时：后端未启动时尽快失败走离线
      header: { Authorization: "Bearer " + getToken() },
      success: res => {
        // 非 2xx 一律 reject；res.data 可能是网关 HTML 等非对象，先守卫再取 error
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
        const msg = (res.data && typeof res.data === "object" && res.data.error) || res.statusCode;
        reject(new Error(String(msg)));
      },
      fail: reject,
    });
  });
}

/** 登录：wx.login code → 服务端换 openid+token（服务端未配 WX_SECRET 时用 deviceId 模拟） */
function ensureLogin() {
  return new Promise(resolve => {
    if (getToken()) return resolve(true);
    let deviceId = wx.getStorageSync("xq-device");
    if (!deviceId) {
      deviceId = "d" + Date.now() + Math.random().toString(36).slice(2, 8);
      wx.setStorageSync("xq-device", deviceId);
    }
    wx.login({
      success: r => {
        request("/api/auth/login", "POST", { code: r.code, deviceId })
          .then(res => { wx.setStorageSync(TOKEN_KEY, res.token); resolve(true); })
          .catch(() => resolve(false));   // 后端未启动 → 静默离线
      },
      fail: () => resolve(false),
    });
  });
}

const online = () => !!getToken();

/** OCR 素材相对路径 → 图床 URL(数据里的 art/icon 以 output\ 开头,需去掉前缀;中文逐段编码) */
function artUrl(rel) {
  if (!rel) return "";
  const clean = String(rel).replace(/^output[\\/]/i, "").replace(/\\/g, "/");
  return BASE + "/art/" + clean.split("/").map(encodeURIComponent).join("/");
}

module.exports = { BASE, request, ensureLogin, online, artUrl,
  pullFavs: () => request("/api/user/favs"),
  toggleFavRemote: (gameId, season, name) => request("/api/user/favs/toggle", "POST", { gameId, season, name }),
  pullSims: () => request("/api/user/sims"),
  addSimRemote: payload => request("/api/user/sims", "POST", payload),
  delSimRemote: id => request("/api/user/sims/" + id, "DELETE"),
  vote: (gameId, season, comp, value) => request("/api/vote", "POST", { gameId, season, comp, value }),
  pullContent: (gameId, season, version) => request(`/api/content/${encodeURIComponent(gameId)}?season=${encodeURIComponent(season)}&version=${encodeURIComponent(version || "")}`),
};
