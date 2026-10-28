// 首页 · 按设计稿重构:品牌头+赛季胶囊+搜索+Hero轮播+5快捷入口+今日推荐+热门阵容
// 摆棋已降为快捷入口(4 Tab:首页/阵容/图鉴/我的);概率表/更新志迁至图鉴页资料区
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const api = require("../../utils/api.js");
const store = require("../../core/store.js");

const QUILLS = [
  { n: "阵容大全", d: "强势阵容推荐", icon: "阵", go: { type: "tab", url: "/pages/comps/comps" } },
  { n: "侠客图鉴", d: "全侠客信息", icon: "侠", go: { type: "tab", url: "/pages/dex/dex" }, seg: "piece" },
  { n: "羁绊查询", d: "羁绊效果一览", icon: "羁", go: { type: "tab", url: "/pages/dex/dex" }, seg: "bond" },
  { n: "装备查询", d: "装备合成路线", icon: "装", go: { type: "tab", url: "/pages/dex/dex" }, seg: "equip" },
  { n: "模拟摆阵", d: "自由搭配阵容", icon: "摆", go: { type: "nav", url: "/pages/sim/sim" } },
];

Page({
  data: {
    statusH: 40, season: null, seasons: [], sheetOn: false,
    banners: [], today: null, hotList: [], quills: QUILLS,
    favs: {}, popUnit: null, popBond: null,
  },

  onShow() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const sid = season.get().id;
    // 当前赛季阵容按热度排序:前 3 进 Hero 轮播,第 4 套今日推荐,其余进热门列表
    const list = fmt.data.comps.filter(c => c.season === sid).sort((a, b) => (b.heat || 0) - (a.heat || 0));
    const favs = {};
    store.getFavs().forEach(f => { favs[f.n] = true; });
    this.setData({
      statusH: win.statusBarHeight || 40,
      season: season.get(), seasons: season.list(),
      banners: list.slice(0, 3).map(c => this.feedVM(c, true)),
      today: list[3] ? this.feedVM(list[3]) : null,
      hotList: list.slice(4).map(c => this.feedVM(c)),
      favs,
    });
  },

  // 阵容 → 信息流卡片 VM:主C大图置首,羁绊带图标与彩色金/常规蓝
  feedVM(c, isHero) {
    const sid = c.season;
    const bondOf = n => fmt.data.bonds.find(b => b.n === n && b.season === sid) || {};
    const all = c.front.concat(c.back);
    all.sort((a, b) => (b[0] === c.main ? 1 : 0) - (a[0] === c.main ? 1 : 0));
    const units = all.map(u => {
      const pc = fmt.pieceOf(u[0], sid);
      return {
        n: u[0], star: u[1] || 1,
        art: api.artUrl(pc.art, isHero ? 200 : 130),
        color: fmt.pack.cost.colors[pc.c] || fmt.pack.cost.colors[3],
        items: u[2] || [],
        isMain: u[0] === c.main,
      };
    });
    return {
      n: c.n, author: c.author || "未署名", season: sid,
      heat: fmt.wan(c.heat), tier: c.tier, popCarry: `${c.pop}${c.carry}`,
      mainArt: api.artUrl(fmt.pieceOf(c.main, sid).art, isHero ? 480 : 240),
      mainName: c.main,
      units,
      traits: (c.traits || []).map(t => {
        const b = bondOf(t[0]);
        return {
          n: t[0], count: t[1],
          icon: api.artUrl(b.icon, 64),
          color: b.color ? "#A98643" : "#2F6DA8",
        };
      }),
    };
  },

  onBannerTap(e) {
    const { name, season: sid } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${encodeURIComponent(name)}&season=${sid}` });
  },
  onCompTap(e) {
    const { name, season: sid } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${encodeURIComponent(name)}&season=${sid}` });
  },
  onQuick(e) {
    const q = QUILLS[e.currentTarget.dataset.i];
    if (!q) return;
    if (q.seg) wx.setStorageSync("dex-seg", q.seg);
    q.go.type === "tab" ? wx.switchTab({ url: q.go.url }) : wx.navigateTo({ url: q.go.url });
  },
  onSearch() { wx.switchTab({ url: "/pages/dex/dex" }); },
  onMore(e) { wx.switchTab({ url: "/pages/comps/comps" }); },

  onFav(e) {
    const { name, season: sid } = e.currentTarget.dataset;
    const added = store.toggleFav(name, sid || season.get().id);
    const favs = Object.assign({}, this.data.favs);
    if (added) favs[name] = true; else delete favs[name];
    this.setData({ favs });
    wx.showToast({ title: added ? "已收藏" : "已取消收藏", icon: "none" });
  },

  /* ---------- 卡内弹层:侠客/羁绊速览(设计规范 3.7/3.6) ---------- */
  noop() {},
  onUnitTap(e) {
    const { n, season: sid } = e.currentTarget.dataset;
    const sidE = sid || season.get().id;
    const p = fmt.pieceOf(n, sidE);
    this.setData({ popBond: null, popUnit: {
      n: p.n, c: p.c, job: p.job || "", bonds: p.bonds || [], season: sidE,
      skill: p.skill && p.skill.d ? p.skill : null,
      color: fmt.pack.cost.colors[p.c] || fmt.pack.cost.colors[3],
      art: api.artUrl(p.art, 240),
    }});
  },
  onBondTap(e) {
    const { n, season: sid } = e.currentTarget.dataset;
    const sidE = sid || season.get().id;
    const b = fmt.data.bonds.find(x => x.n === n && x.season === sidE) || {};
    this.setData({ popUnit: null, popBond: {
      n: b.n || n, t: b.t || "势力", lv: b.lv || "", d: b.d || "", season: sidE,
      icon: api.artUrl(b.icon, 120),
    }});
  },
  onPopClose() { this.setData({ popUnit: null, popBond: null }); },
  onPopDetail(e) {
    const { type, name } = e.currentTarget.dataset;
    const pop = this.data.popUnit || this.data.popBond || {};
    this.setData({ popUnit: null, popBond: null });
    wx.navigateTo({ url: `/pages/detail/detail?type=${type}&name=${encodeURIComponent(name)}&season=${pop.season || season.get().id}` });
  },

  /* ---------- 赛季切换弹层(沿用) ---------- */
  onSeasonBar() { this.setData({ sheetOn: true }); },
  onScrim() { this.setData({ sheetOn: false }); },
  onPickSeason(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ sheetOn: false });
    if (id !== season.get().id) {
      season.set(id);
      this.onShow();
      wx.showToast({ title: `已切换至 ${id}`, icon: "none" });
    }
  },

  onShareAppMessage() {
    return { title: `${fmt.pack.displayName} · 侠客为棋 江湖为局`, path: "/pages/home/home" };
  },
});
