// 我的 · 我的阵容（摆棋存档）+ 我的收藏（☆收藏），两段滑块 + 赛季入口
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const store = require("../../core/store.js");
const boardModel = require("../../core/boardModel.js");

Page({
  data: {
    pack: fmt.pack, season: null, seasons: [],
    seg: "cur", thumbX: "translateX(0)",
    sims: [], favs: [], sheetOn: false,
  },
  onShow() {
    const cur = season.get();
    this.setData({ season: cur, seasons: season.list() });
    this.renderLists();
  },
  renderLists() {
    const cur = season.get().id;
    const allMode = this.data.seg === "all";
    const raw = store.getSims();
    const sims = raw
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => allMode || (s.season || "S4") === cur)
      .map(({ s, idx }) => {
        // storage 可能被旧版本/中断写入弄脏：board 非数组直接跳过，不让整页崩
        if (!Array.isArray(s.board)) return null;
        const units = s.board.map((n, i) => (n ? { n, i } : null)).filter(Boolean);
        const cost = units.reduce((t, u) => t + fmt.pieceOf(u.n).c, 0);
        return {
          name: s.name, season: s.season || "S4", idx,
          units: units.map(u => fmt.unitVM(u, { star: 1, main: s.main, mainIdx: u.i })),
          count: units.length, cost,
          main: s.main || "",
        };
      }).filter(Boolean).reverse();
    const favs = store.getFavs()
      .filter(f => fmt.pack.data.comps.some(c => c.n === f.n))
      .filter(f => allMode || (f.season || "S4") === cur)
      .map(f => {
        const c = fmt.pack.data.comps.find(x => x.n === f.n);
        const uv = fmt.compUnitsVM(c);
        return {
          name: f.n, season: f.season || "S4", tier: c.tier,
          units: uv.front.concat(uv.back),
          traits: (c.traits || []).slice(0, 4).map(t => ({ n: t[0], count: t[1], color: !!t[2] })),
        };
      }).reverse();
    this.setData({ sims, favs });
  },
  onSeg(e) {
    const seg = e.currentTarget.dataset.k;
    if (seg === this.data.seg) return;
    this.setData({ seg, thumbX: seg === "all" ? "translateX(0)" : "translateX(100%)" });
    this.renderLists();
  },
  onSeasonBar() { this.setData({ sheetOn: true }); },
  onScrim() { this.setData({ sheetOn: false }); },
  onPickSeason(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ sheetOn: false });
    if (id !== season.get().id) {
      season.set(id);
      if (this.data.seg === "cur") { /* 保持当前赛季档位 */ }
      this.onShow();
      wx.showToast({ title: `已切换至 ${id}`, icon: "none" });
    }
  },
  onLoadSim(e) {
    const idx = +e.currentTarget.dataset.idx;
    const s = store.getSims()[idx];
    if (!s) return;
    // 载入归档赛季的存档时提示,避免"数据看起来不对"的困惑(外部评审#7)
    if (s.season && s.season !== season.get().id) {
      wx.showToast({ title: `已载入 ${s.season} 赛季存档 · 当前为 ${season.get().id}`, icon: "none", duration: 2200 });
    }
    boardModel.snapshot(boardModel.load());
    boardModel.save({
      board: s.board, stars: s.stars || {}, items: s.items || {}, main: s.main || null,
    });
    wx.switchTab({ url: "/pages/sim/sim" });
    if (!s.season || s.season === season.get().id) wx.showToast({ title: "已载入到摆棋", icon: "none" });
  },
  onDelSim(e) {
    store.removeSim(+e.currentTarget.dataset.idx);
    this.renderLists();
    wx.showToast({ title: "已删除推演存档", icon: "none" });
  },
  onOpenFav(e) {
    wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${encodeURIComponent(e.currentTarget.dataset.name)}&season=${e.currentTarget.dataset.season || season.get().id}` });
  },
  onDelFav(e) {
    store.toggleFav(e.currentTarget.dataset.name, season.get().id);
    this.renderLists();
    wx.showToast({ title: "已删除收藏", icon: "none" });
  },
});
