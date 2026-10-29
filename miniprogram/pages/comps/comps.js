// 阵容列表 · 赛季切换 + 搜索 + 分类 + 排序(时间 / 热度=点赞数 / 强度=收藏数) + 卡片
// 强度等级由「收藏数」决定(A < 3 ≤ S < 10 ≤ SSS),数据里 OCR 猜的 tier 不再用于展示
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const store = require("../../core/store.js");
const api = require("../../utils/api.js");
const bondEngine = require("../../core/bondEngine.js");


// 更新文案:30 天内写"N 天前",更早直接给日期——库里日期多是几个月前,写"111 天前"没意义
function updText(s) {
  if (!s) return "";
  const d = new Date(String(s).replace(/-/g, "/"));
  if (isNaN(d.getTime())) return String(s);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "今天更新";
  if (days === 1) return "昨天更新";
  if (days <= 30) return days + "天前更新";
  return String(s).slice(5) + " 更新";
}

Page({
  data: {
    season: null, seasons: [], sheetOn: false,
    q: "",
    tab: "all",              // 全部 / 热门推荐 / 我的收藏 / 最新
    sort: "time",            // time=时间, hot=点赞数, str=收藏数
    sortLabel: "时间排序",
    order: "desc",           // asc=升序, desc=降序;三个维度共用
    ddOn: false,
    tabs: [
      { k: "all", l: "全部" }, { k: "hot", l: "热门推荐" },
      { k: "fav", l: "我的收藏" }, { k: "new", l: "最新" },
    ],
    sorts: [
      { k: "time", l: "时间排序" }, { k: "hot", l: "热度优先" }, { k: "str", l: "强度优先" },
    ],
    list: [],
  },

  onShow() {
    this.setData({ season: season.get(), seasons: season.list() });
    this.renderList();          // 先用已知计数出首屏,再拉服务端计数刷新
    this.loadStats();
  },

  // 服务端计数:up/down = 赞踩总数(热度),favs = 收藏数(强度);离线时按本地单机计数兜底
  loadStats() {
    if (!api.online()) { this._stats = null; return; }
    api.compStats("xq", (this.data.season || season.get()).id).then(rows => {
      const m = {};
      (rows || []).forEach(r => { m[r.n] = { up: r.up || 0, down: r.down || 0, favs: r.favs || 0 }; });
      this._stats = m;
      this.renderList();
    }).catch(() => { /* 拉不到就继续用本地计数,不打断列表 */ });
  },

  // 赛季抽屉
  onSeasonTap() { this.setData({ sheetOn: true }); },
  onScrim() { this.setData({ sheetOn: false }); },
  onPickSeason(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ sheetOn: false });
    if (id !== season.get().id) {
      season.set(id);
      this.setData({ season: season.get(), seasons: season.list() });
      this.renderList();
      wx.showToast({ title: `已切换至 ${id}`, icon: "none" });
    }
  },

  renderList() {
    const cur = this.data.season || season.get();
    const data = fmt.data;
    const bonds = data.bonds.filter(b => b.season === cur.id);
    const bondOf = n => bonds.find(b => b.n === n) || {};
    const favs = store.getFavs().map(f => f.n);
    const myVotes = store.getVotes();
    const q = (this.data.q || "").trim();

    let list = data.comps.filter(c => c.season === cur.id);
    if (q) {
      list = list.filter(c =>
        c.n.indexOf(q) >= 0 ||
        (c.author || "").indexOf(q) >= 0 ||
        (c.traits || []).some(t => t[0].indexOf(q) >= 0) ||
        (c.front || []).concat(c.back || []).map(u => u[0]).join().indexOf(q) >= 0
      );
    }
    if (this.data.tab === "fav") list = list.filter(c => favs.indexOf(c.n) >= 0);

    const vm = list.map(c => {
      const units = (c.front || []).concat(c.back || []).map(u => {
        const p = fmt.pieceOf(u[0], cur.id) || {};
        const star = u[1] || 1;
        return {
          n: u[0], ch: u[0][0], color: fmt.pack.cost.colors[p.c],
          art: api.artUrl(p.art, 96),
          isMain: u[0] === c.main,
          star,
          stars: star >= 2 ? "★★★".slice(0, star) : "",
        };
      });
      const bondsVM = (c.traits || []).map(t => {
        const b = bondOf(t[0]);
        return {
          n: t[0], count: t[1],
          // 满羁绊用彩色重绘图标,未满用灰度原图(与摆棋/首页同规则)
          icon: api.bondIcon(b.icon, t[0], bondEngine.isMaxed(b, t[1])),
        };
      });
      // 计数:有服务端统计就用统计;离线时退化成"我这台机器上的一票/一藏"
      const my = myVotes[c.n] || "";
      const st = this._stats && this._stats[c.n];
      const favN = st ? st.favs : (favs.indexOf(c.n) >= 0 ? 1 : 0);
      const upN = st ? st.up : (my === "up" ? 1 : 0);
      const downN = st ? st.down : (my === "down" ? 1 : 0);
      return {
        n: c.n, author: c.author || "未署名",
        pop: c.pop, colorBond: !!c.colorBond,
        grade: fmt.compGrade(favN),   // 等级由收藏数决定(阈值在 core/format.js)
        updText: updText(c.upd),
        desc: `主C ${c.main} · ${c.carry} 费 · ${bondsVM.length} 个羁绊`,
        units, bonds: bondsVM,
        fav: favs.indexOf(c.n) >= 0,
        my, up: upN, down: downN,
        favN, heatUp: upN,
        upd: c.upd || "",
      };
    });

    // 排序维度:热门/最新 tab 是维度快捷键,其余走下拉;方向 asc/desc 三个维度共用
    const s = this.data.tab === "hot" ? "hot" : this.data.tab === "new" ? "time" : this.data.sort;
    const dir = this.data.order === "asc" ? 1 : -1;
    vm.sort((a, b) => {
      if (s === "hot") return dir * ((a.heatUp - b.heatUp) || String(a.upd).localeCompare(String(b.upd)));
      if (s === "str") return dir * ((a.favN - b.favN) || (a.heatUp - b.heatUp));
      return dir * String(a.upd).localeCompare(String(b.upd));
    });

    // TOP1-3 徽记:只给当前排序的前三名
    vm.forEach((x, i) => { x.rank = i < 3 ? i + 1 : 0; });
    this.setData({ list: vm });
  },

  onQ(e) { this.setData({ q: e.detail.value }); this.renderList(); },

  onTab(e) {
    const k = e.currentTarget.dataset.k;
    // 热门/最新这两个 tab 本质是排序快捷键,点了就把下拉的排序一起切过去
    const patch = { tab: k, ddOn: false };
    if (k === "hot") { patch.sort = "hot"; patch.sortLabel = "热度优先"; }
    if (k === "new") { patch.sort = "time"; patch.sortLabel = "时间排序"; }
    this.setData(patch);
    this.renderList();
  },
  onSortDD() { this.setData({ ddOn: !this.data.ddOn }); },
  // 升/降序:和维度分开选,切维度时保留当前方向
  onOrderPick(e) {
    const o = e.currentTarget.dataset.o === "asc" ? "asc" : "desc";
    this.setData({ order: o });
    this.renderList();
  },
  onSortPick(e) {
    const k = e.currentTarget.dataset.k;
    const label = (this.data.sorts.find(x => x.k === k) || {}).l || "时间排序";
    this.setData({
      sort: k, sortLabel: label, ddOn: false,
      tab: this.data.tab === "hot" || this.data.tab === "new" ? "all" : this.data.tab,
    });
    this.renderList();
  },

  onFav(e) {
    const name = e.currentTarget.dataset.name;
    const added = store.toggleFav(name, (this.data.season || season.get()).id);
    // 收藏数变化会牵动强度等级,本地先改计数,下一轮拉统计再校准
    const st = this._stats && this._stats[name];
    if (st) st.favs = Math.max(0, (st.favs || 0) + (added ? 1 : -1));
    this.renderList();
  },
  onVote(e) {
    const { name, dir } = e.currentTarget.dataset;
    const prev = store.getVote(name);
    const next = prev === dir ? "" : dir;     // 再点一次 = 取消
    store.setVote(name, next, this.data.season.id);
    const st = this._stats && this._stats[name];
    if (st) {
      if (prev === "up") st.up = Math.max(0, st.up - 1);
      if (prev === "down") st.down = Math.max(0, st.down - 1);
      if (next === "up") st.up += 1;
      if (next === "down") st.down += 1;
    }
    this.renderList();
  },

  onOpen(e) {
    wx.navigateTo({ url: `/pages/detail/detail?type=comp&name=${encodeURIComponent(e.currentTarget.dataset.name)}&season=${this.data.season.id}` });
  },
});
