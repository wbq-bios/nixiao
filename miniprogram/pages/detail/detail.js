// 通用详情页 · type=comp|piece|bond|equip|augment
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const store = require("../../core/store.js");
const bondEngine = require("../../core/bondEngine.js");
const api = require("../../utils/api.js");

Page({
  data: {
    pack: fmt.pack, type: "", fav: false, favKey: "",
    d: null, unitsVM: null,
  },
  onLoad(query) {
    // 分享链接的 query 可能被转码/损坏,decode 失败不能让页面白屏
    let type = "", name = "", sid = "";
    try {
      type = query.type || "";
      name = decodeURIComponent(query.name || "");
      sid = decodeURIComponent(query.season || "");
    } catch (e) { name = query.name || ""; }
    // 定位必须带赛季(多赛季同名内容并存——外部评审#6);无入参回退当前赛季
    if (!sid) sid = season.get().id;
    const data = fmt.data;
    let d = null, favKey = "";
    if (type === "comp") {
      const c = data.comps.find(x => x.n === name && x.season === sid) || data.comps.find(x => x.n === name);
      if (c) {
        const uv = fmt.compUnitsVM(c);
        d = Object.assign(fmt.compCardVM(c), {
          front: uv.front, back: uv.back,
          styleTags: c.style || [],
          stats: {
            avg: (c.stats && c.stats.avg) || "—", pick: (c.stats && c.stats.pick) || "—",
            top1: (c.stats && c.stats.top1) || "—", top4: (c.stats && c.stats.top4) || "—",
          },
        });
        favKey = c.n;
      }
    } else if (type === "piece") {
      const p = fmt.pieceOf(name, sid);
      d = Object.assign({}, p, {
        ch: p.n[0], color: fmt.pack.cost.colors[p.c],
        art: api.artUrl(p.art),
        bondsVM: (p.bonds || []).map(b => {
          const bond = data.bonds.find(x => x.n === b && x.season === sid) || { color: 0 };
          return { n: b, color: !!bond.color };
        }),
      });
      favKey = p.n;
    } else if (type === "bond") {
      const b = data.bonds.find(x => x.n === name && x.season === sid) || data.bonds.find(x => x.n === name);
      if (b) {
        const members = data.pieces.filter(p => (p.bonds || []).includes(b.n))
          .map(p => fmt.unitVM({ n: p.n }, { star: 1 }));
        d = Object.assign({}, b, {
          ch: b.n[0], color: !!b.color, colorStr: b.color ? fmt.pack.cost.colors[5] : fmt.pack.cost.colors[3],
          members,
        });
        favKey = b.n;
      }
    } else if (type === "equip") {
      const e = data.equips.find(x => x.n === name && x.season === sid) || data.equips.find(x => x.n === name);
      if (e) { d = Object.assign({}, e, { ch: e.n[0], rcls: fmt.rarCls(e.r) }); favKey = e.n; }
    } else if (type === "augment") {
      const a = data.augments.find(x => x.n === name && x.season === sid) || data.augments.find(x => x.n === name);
      if (a) { d = Object.assign({}, a, { ch: a.n[0] }); favKey = a.n; }
    }
    this.setData({ type, d, favKey, fav: !!store.getFavs().find(f => f.n === favKey), sid });
    wx.setNavigationBarTitle({ title: name || fmt.pack.displayName });
  },
  onFav() {
    if (!this.data.favKey) return;
    // 收藏记到"正在查看的赛季",否则归档赛季的收藏会被记到当前赛季
    const added = store.toggleFav(this.data.favKey, this.data.sid || season.get().id);
    this.setData({ fav: added });
    wx.showToast({ title: added ? "已收藏" : "已取消收藏", icon: "none" });
  },
  onJump(e) {
    const { type, name } = e.currentTarget.dataset;
    wx.redirectTo({ url: `/pages/detail/detail?type=${type}&name=${encodeURIComponent(name)}` });
  },
  // 立绘加载失败 → 回退印章字
  onArtErr() { this.setData({ "d.art": "" }); },
  onShareUnit() { wx.showToast({ title: "分享卡片 Phase 3 提供", icon: "none" }); },
  onShareAppMessage() {
    return {
      title: `${fmt.pack.displayName} · ${this.data.favKey}`,
      path: `/pages/detail/detail?type=${this.data.type}&name=${encodeURIComponent(this.data.favKey)}&season=${encodeURIComponent(this.data.sid || season.get().id)}`,
    };
  },
});
