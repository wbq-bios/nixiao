// 我的 · 个人信息 + 数据概览 + 阵容码 + 功能入口
// 我的阵容/我的收藏/我的发布用整屏浮层当"详情页"(不走新路由,避免编译期路由不刷新)
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const store = require("../../core/store.js");
const boardModel = require("../../core/boardModel.js");

const VERSION = "1.0.0 · 内测";
const SUB_TITLES = { sims: "我的阵容", favs: "我的收藏", pub: "我的发布" };

// 本机 ID:首次进入随机 8 位并落库(无账号体系,换设备不保证一致)
function ensureUid() {
  let uid = wx.getStorageSync("me-uid");
  if (!uid) {
    uid = String(Math.floor(10000000 + Math.random() * 89999999));
    wx.setStorageSync("me-uid", uid);
  }
  return uid;
}


Page({
  data: {
    pack: fmt.pack, season: null, seasons: [],
    sheetOn: false, aboutOn: false,
    uid: "", version: VERSION,
    stats: { sims: 0, favs: 0, shares: 0 },
    // 二级"详情页"浮层
    subOn: false, subTab: "sims", subTitle: "", subCount: 0,
    sims: [], favs: [], pubs: [],
  },
  onShow() {
    const cur = season.get();
    this.setData({ season: cur, seasons: season.list(), uid: ensureUid() });
    this.refreshStats();
    this.renderSubs();
  },

  // 概览按「当前赛季」统计:阵容/收藏跟随顶部赛季下拉切换;分享次数是全局的
  refreshStats() {
    const sid = season.get().id;
    this.setData({
      stats: {
        sims: store.getSims().filter(s => (s.season || sid) === sid).length,
        favs: store.getFavs().filter(f => (f.season || sid) === sid).length,
        shares: +(wx.getStorageSync("share-count") || 0),
      },
    });
  },

  // 三份列表一次算好:浮层里按 subTab 显示,数据量小,切换零延迟
  renderSubs() {
    const sid = season.get().id;
    const raw = store.getSims().filter(s => (s.season || sid) === sid);
    // 存档:board 非数组(旧版本/中断写入)跳过;库里没有的棋子不参与头像条,避免 pieceOf 返回 null 崩页
    const sims = raw.map((s, idx) => ({ s, idx })).map(({ s, idx }) => {
      if (!Array.isArray(s.board)) return null;
      const units = s.board.map((n, i) => (n ? { n, i } : null)).filter(u => u && fmt.pieceOf(u.n));
      return {
        name: s.name, season: s.season || sid, idx,
        units: units.map(u => fmt.unitVM(u, { star: 1, main: s.main, mainIdx: u.i })),
        count: units.length, cost: units.reduce((t, u) => t + fmt.pieceOf(u.n).c, 0),
        main: s.main || "",
      };
    }).filter(Boolean).reverse();

    const favs = store.getFavs()
      .filter(f => (f.season || sid) === sid)
      .filter(f => fmt.pack.data.comps.some(c => c.n === f.n))
      .map(f => {
        const c = fmt.pack.data.comps.find(x => x.n === f.n);
        const uv = fmt.compUnitsVM(c);
        return {
          name: f.n, season: f.season || sid,
          units: uv.front.concat(uv.back),
          traits: (c.traits || []).slice(0, 4).map(t => ({ n: t[0], count: t[1], color: !!t[2] })),
        };
      }).reverse();

    // 公开阵容:本机发布记录(摆棋页「发布」写入),同样过滤缺数据的棋子
    const pubs = store.getPubs().map((p, idx) => ({ p, idx })).filter(({ p }) => (p.season || sid) === sid).map(({ p, idx }) => {
      if (!Array.isArray(p.board)) return null;
      const units = p.board.map((n, i) => (n ? { n, i } : null)).filter(u => u && fmt.pieceOf(u.n));
      return {
        name: p.name, season: p.season || sid, date: p.date || "", author: p.author || "匿名",
        idx, count: units.length,
        units: units.map(u => fmt.unitVM(u, { star: 1, main: p.main, mainIdx: u.i })),
      };
    }).filter(Boolean).reverse();

    this.setData({ sims, favs, pubs, subCount: this.data.subTab === "favs" ? favs.length : this.data.subTab === "pub" ? pubs.length : sims.length });
  },

  /* ---------- 浮层开关 ---------- */
  openSub(tab) {
    this.setData({ subOn: true, subTab: tab, subTitle: SUB_TITLES[tab] || "我的阵容" });
    this.renderSubs();
  },
  onGoSims() { this.openSub("sims"); },
  onGoFavs() { this.openSub("favs"); },
  onGoPub() { this.openSub("pub"); },
  onSubBack() { this.setData({ subOn: false }); },

  /* ---------- 赛季下拉 ---------- */
  onSeasonBar() { this.setData({ sheetOn: true, aboutOn: false }); },
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

  onAbout() { this.setData({ aboutOn: true, sheetOn: false }); },
  onAboutScrim() { this.setData({ aboutOn: false }); },
  onService() { wx.showToast({ title: "客服内测中,可在小程序后台留言", icon: "none" }); },


  onCopyId() {
    wx.setClipboardData({
      data: this.data.uid,
      success: () => wx.showToast({ title: "ID 已复制", icon: "none" }),
      fail: () => { },
    });
  },

  /* ---------- 列表操作 ---------- */
  onLoadSim(e) {
    const idx = +e.currentTarget.dataset.idx;
    const s = store.getSims()[idx];
    if (!s) return;
    if (s.season && s.season !== season.get().id) {
      wx.showToast({ title: `已载入 ${s.season} 赛季存档 · 当前为 ${season.get().id}`, icon: "none", duration: 2200 });
    }
    boardModel.snapshot(boardModel.load());
    boardModel.save({
      board: s.board, stars: s.stars || {}, items: s.items || {}, main: s.main || null,
      name: typeof s.name === "string" ? s.name : "", notes: typeof s.notes === "string" ? s.notes : "",
    });
    this.setData({ subOn: false });
    wx.navigateTo({ url: "/pages/sim/sim" });
  },
  onDelSim(e) {
    store.removeSim(+e.currentTarget.dataset.idx);
    this.onShow();
    wx.showToast({ title: "已删除推演存档", icon: "none" });
  },
  onOpenFav(e) {
    wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${encodeURIComponent(e.currentTarget.dataset.name)}&season=${e.currentTarget.dataset.season || season.get().id}` });
  },
  onDelFav(e) {
    store.toggleFav(e.currentTarget.dataset.name, season.get().id);
    this.onShow();
    wx.showToast({ title: "已取消收藏", icon: "none" });
  },
  onLoadPub(e) {
    const idx = +e.currentTarget.dataset.idx;
    const p = store.getPubs()[idx];
    if (!p) return;
    boardModel.snapshot(boardModel.load());
    boardModel.save({
      board: p.board, stars: p.stars || {}, items: p.items || {}, main: p.main || null,
      name: typeof p.name === "string" ? p.name : "", notes: "",
    });
    this.setData({ subOn: false });
    wx.navigateTo({ url: "/pages/sim/sim" });
  },
  onDelPub(e) {
    const idx = +e.currentTarget.dataset.idx;
    wx.showModal({
      title: "取消发布",
      content: "将从公开阵容里移除这套阵容。",
      success: res => {
        if (!res.confirm) return;
        store.removePub(idx);
        this.onShow();
        wx.showToast({ title: "已取消发布", icon: "none" });
      },
    });
  },
});
