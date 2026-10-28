// 赛季管理 · 全局单例（云接入后读写同键）
let packRef = null;
let current = null;

module.exports = {
  init(pack) {
    packRef = pack;
    const saved = wx.getStorageSync("xq-season");
    const found = pack.seasons.find(s => s.id === saved);
    current = found || pack.seasons.find(s => s.current) || pack.seasons[0];
    return current;
  },
  get() { return current; },
  list() { return packRef.seasons; },
  set(id) {
    const s = packRef.seasons.find(x => x.id === id);
    if (!s) return current;
    current = s;
    wx.setStorageSync("xq-season", id);
    return current;
  },
  isCurrent() { return !!(current && current.current); },
};
