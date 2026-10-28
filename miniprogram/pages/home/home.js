const season = require("../../core/season.js");
const fmt = require("../../core/format.js");

// 更新志仅使用 <b> 强调，拆成 rich-text 节点（WXML 不支持直接渲染 HTML 片段）
function noteNodes(html) {
  const s = String(html || "");
  const nodes = [];
  const push = (t, bold) => {
    if (t) nodes.push(bold ? { name: "b", children: [{ type: "text", text: t }] } : { type: "text", text: t });
  };
  const rx = /<b>([\s\S]*?)<\/b>/g;
  let last = 0, m;
  while ((m = rx.exec(s))) { push(s.slice(last, m.index), false); push(m[1], true); last = rx.lastIndex; }
  push(s.slice(last), false);
  return nodes;
}

Page({
  data: {
    pack: fmt.pack, season: null, seasons: [],
    hot: null, odds: [], notes: [],
    sheetOn: false,
  },
  onShow() {
    const cur = season.get();
    // 热荐=当前赛季热度最高的一套(显式排序,名实一致)
    const comps = fmt.data.comps.filter(c => c.season === cur.id).sort((a, b) => (b.heat || 0) - (a.heat || 0));
    const hot = comps.length ? fmt.compCardVM(comps[0]) : null;
    this.setData({
      season: cur, seasons: season.list(),
      hot,
      odds: fmt.data.odds,
      notes: fmt.data.notes.map(n => ({ date: n.date, nodes: noteNodes(n.html) })),
    });
    wx.setNavigationBarTitle({ title: fmt.pack.displayName });
  },
  onSeasonBar() { this.setData({ sheetOn: true }); },
  onScrim() { this.setData({ sheetOn: false }); },
  onPickSeason(e) {
    const id = e.currentTarget.dataset.id;
    if (id !== season.get().id) {
      season.set(id);
      this.setData({ sheetOn: false });
      this.onShow();
      wx.showToast({ title: `已切换至 ${id}`, icon: "none" });
    } else {
      this.setData({ sheetOn: false });
    }
  },
  onHot() {
    if (this.data.hot) wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${this.data.hot.n}` });
  },
  onQuick(e) { wx.switchTab({ url: e.currentTarget.dataset.url }); },
  onShareAppMessage() {
    return { title: `${fmt.pack.displayName} · ${this.data.season.name}赛季数据`, path: "/pages/home/home" };
  },
});
