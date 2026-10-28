const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const store = require("../../core/store.js");

const tierRank = { S: 0, A: 1, B: 2 };

Page({
  data: {
    pack: fmt.pack, season: null,
    sorts: fmt.pack.compSorts, filters: fmt.pack.compFilters,
    sort: "str", filter: "all",
    list: [],
    votes: {},
  },
  onShow() {
    const cur = season.get();
    this.setData({ season: cur });
    this.renderList();
  },
  renderList() {
    const cur = this.data.season || season.get();
    const myVotes = store.getVotes();
    let list = fmt.data.comps.filter(c => c.season === cur.id);
    const f = this.data.filter;
    if (f === "color") list = list.filter(c => c.colorBond);
    if (f === "84") list = list.filter(c => c.pop === 8 && c.carry === 4);
    if (f === "95") list = list.filter(c => c.pop === 9 && c.carry === 5);
    const vm = list.map(c => {
      const card = fmt.compCardVM(c);
      const my = myVotes[c.n] || "";
      const up = (c.up || 0) + (my === "up" ? 1 : 0);
      const down = (c.down || 0) + (my === "down" ? 1 : 0);
      return Object.assign(card, { my, up, down, net: up - down });
    });
    const s = this.data.sort;
    if (s === "str") vm.sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || b.heat - a.heat);
    if (s === "heat") vm.sort((a, b) => b.heat - a.heat);
    if (s === "vote") vm.sort((a, b) => b.net - a.net);
    if (s === "new") vm.sort((a, b) => b.upd.localeCompare(a.upd));
    this.setData({ list: vm });
  },
  onSort(e) { this.setData({ sort: e.currentTarget.dataset.k }); this.renderList(); },
  onFilter(e) { this.setData({ filter: e.currentTarget.dataset.k }); this.renderList(); },
  onOpen(e) {
    wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${e.currentTarget.dataset.name}&season=${this.data.season.id}` });
  },
  onVote(e) {
    const { name, dir } = e.currentTarget.dataset;
    const cur = store.getVote(name);
    store.setVote(name, cur === dir ? "" : dir);
    this.renderList();
  },
});
