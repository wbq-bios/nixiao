// 万象图鉴 · 四段切换 + 搜索 + 费用筛选
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const api = require("../../utils/api.js");

Page({
  data: {
    pack: fmt.pack, season: null,
    segs: [{ k: "piece", l: "棋子" }, { k: "bond", l: "羁绊" }, { k: "equip", l: "装备" }, { k: "aug", l: "心悟" }],
    seg: "piece", q: "", cost: 0, costs: [0, 1, 2, 3, 4, 5],
    list: [],
  },
  onShow() {
    this.setData({ season: season.get() });
    this.renderList();
  },
  renderList() {
    const { seg, q, cost } = this.data;
    const D = fmt.pack.data;
    let list = [];
    if (seg === "piece") {
      list = D.pieces
        .filter(p => p.season === season.get().id)
        .filter(p => (!cost || p.c === cost))
        .filter(p => !q || p.n.indexOf(q) >= 0 || (p.bonds || []).join().indexOf(q) >= 0 || p.job.indexOf(q) >= 0)
        .map(p => ({
          key: p.n, ch: p.n[0], n: p.n, color: fmt.pack.cost.colors[p.c], cost: p.c,
          hot: !!p.hot, desc: `${p.job} · ${(p.bonds || []).join(" / ")}`,
          art: api.artUrl(p.art),
        }));
    } else if (seg === "bond") {
      list = D.bonds
        .filter(b => b.season === season.get().id)
        .filter(b => !q || b.n.indexOf(q) >= 0 || b.d.indexOf(q) >= 0)
        .map(b => ({ key: b.n, ch: b.n[0], n: b.n, lv: b.lv, color: !!b.color, desc: b.d }));
    } else if (seg === "equip") {
      list = D.equips
        .filter(e => e.season === season.get().id)
        .filter(e => !q || e.n.indexOf(q) >= 0 || e.d.indexOf(q) >= 0)
        .map(e => ({ key: e.n, ch: e.n[0], n: e.n, r: e.r, rcls: fmt.rarCls(e.r), desc: e.d }));
    } else {
      list = D.augments
        .filter(a => a.season === season.get().id)
        .filter(a => !q || a.n.indexOf(q) >= 0 || a.d.indexOf(q) >= 0)
        .map(a => ({ key: a.n, ch: a.n[0], n: a.n, t: a.t, desc: a.d }));
    }
    this.setData({ list });
  },
  onSeg(e) { this.setData({ seg: e.currentTarget.dataset.k }); this.renderList(); },
  onQ(e) { this.setData({ q: e.detail.value.trim() }); this.renderList(); },
  onCost(e) { this.setData({ cost: +e.currentTarget.dataset.v }); this.renderList(); },
  onOpen(e) {
    const typeMap = { piece: "piece", bond: "bond", equip: "equip", aug: "augment" };
    wx.navigateTo({ url: `/pages/detail/detail?type=${typeMap[this.data.seg]}&name=${encodeURIComponent(e.currentTarget.dataset.key)}` });
  },
  // 立绘加载失败(图床未开/素材缺失)→ 回退印章字头像
  onArtErr(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`list[${idx}].art`]: "" });
  },
});
