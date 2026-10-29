// 首页 · 按设计稿重构:品牌头+赛季胶囊+搜索+Hero轮播+5快捷入口+今日推荐+热门阵容
// 摆棋已降为快捷入口(4 Tab:首页/阵容/图鉴/我的);概率表/更新志迁至图鉴页资料区
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const api = require("../../utils/api.js");
const store = require("../../core/store.js");
const bondEngine = require("../../core/bondEngine.js");

// 更新文案:30 天内写"N 天前",更早直接给日期(与阵容列表同口径)
function updText(v) {
  if (!v) return "";
  const d = new Date(String(v).replace(/-/g, "/"));
  if (isNaN(d.getTime())) return String(v);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "今天更新";
  if (days === 1) return "昨天更新";
  if (days <= 30) return days + "天前更新";
  return String(v).slice(5) + " 更新";
}

// 快捷入口:图标用 assets/icons 里生成的线性图标(与 tab/我的同一套)
const QUILLS = [
  { n: "阵容大全", d: "强势阵容推荐", icon: "阵", img: "/assets/icons/quick-comp.png", go: { type: "tab", url: "/pages/comps/comps" } },
  { n: "侠客图鉴", d: "全侠客信息", icon: "侠", img: "/assets/icons/quick-dex.png", go: { type: "tab", url: "/pages/dex/dex" }, seg: "piece" },
  { n: "羁绊查询", d: "羁绊效果一览", icon: "羁", img: "/assets/icons/quick-bond.png", go: { type: "tab", url: "/pages/dex/dex" }, seg: "bond" },
  { n: "装备查询", d: "装备合成路线", icon: "装", img: "/assets/icons/quick-equip.png", go: { type: "tab", url: "/pages/dex/dex" }, seg: "equip" },
  { n: "模拟摆阵", d: "自由搭配阵容", icon: "摆", img: "/assets/icons/quick-sim.png", go: { type: "nav", url: "/pages/sim/sim" } },
];

Page({
  data: {
    statusH: 40, season: null, seasons: [], sheetOn: false,
    // 赛季胶囊的绝对定位(px):贴系统胶囊左侧,onReady 用菜单按钮实测后回填;默认值给首次渲染兜底
    pillTop: 52, pillRight: 102, pillMaxW: 128,
    banners: [], today: null, hotList: [], quills: QUILLS,
    favs: {}, popUnit: null, popBond: null,
  },

  onShow() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusH: win.statusBarHeight || 40, season: season.get(), seasons: season.list() });
    this.renderFeed();
    this.loadStats();     // 等级/热度依赖服务端计数,先出卡片再刷新
  },

  // 首页卡片:当前赛季阵容按热度排序,前 3 进 Hero 轮播,第 4 套今日推荐,其余进热门列表
  renderFeed() {
    const sid = season.get().id;
    const list = fmt.data.comps.filter(c => c.season === sid).sort((a, b) => (b.heat || 0) - (a.heat || 0));
    const favs = {};
    store.getFavs().forEach(f => { favs[f.n] = true; });
    this.setData({
      banners: list.slice(0, 3).map(c => this.feedVM(c, true)),
      today: list[3] ? this.feedVM(list[3]) : null,
      hotList: list.slice(4).map(c => this.feedVM(c)),
      favs,
    });
  },

  // 赞踩/收藏计数(热度=赞数,强度等级=收藏数);拉不到就按 A 级、0 赞兜底
  loadStats() {
    if (!api.online()) { this._stats = null; return; }
    api.compStats("xq", season.get().id).then(rows => {
      const m = {};
      (rows || []).forEach(r => { m[r.n] = { up: r.up || 0, down: r.down || 0, favs: r.favs || 0 }; });
      this._stats = m;
      this.renderFeed();
    }).catch(() => { /* 静默:首页不因计数接口失败而白屏 */ });
  },

  // 赛季胶囊定位:设计稿要求它紧贴系统胶囊左侧、与 logo 同行。
  // 系统胶囊位置随机型/状态栏高度变化,不能用固定 right,改用 getMenuButtonBoundingClientRect()
  // 实测;再用品牌印章右边界反推可用宽度上限,避免长赛季名压到 logo/印章。
  onReady() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const k = (win.windowWidth || 390) / 750;
    const pillH = Math.round(52 * k);                       // 胶囊高 52rpx
    // 兜底值:老基础库没有菜单按钮 API 时按常见胶囊位置估(右让 196rpx、顶对齐状态栏+10rpx)
    let top = (win.statusBarHeight || 40) + Math.round(10 * k);
    let right = Math.round(196 * k);
    let maxW = Math.round((win.windowWidth || 390) * 0.32);
    try {
      const mb = wx.getMenuButtonBoundingClientRect();
      if (mb && mb.left) {
        top = Math.round(mb.top + (mb.height - pillH) / 2);   // 与胶囊垂直居中对齐
        right = Math.round(win.windowWidth - mb.left + 8);    // 胶囊左沿再让 8px
        const q = wx.createSelectorQuery();
        q.select(".brand-seal").boundingClientRect();
        q.exec(res => {
          const sealRight = (res && res[0] && res[0].right) || win.windowWidth * 0.4;
          this.setData({
            pillTop: top, pillRight: right,
            pillMaxW: Math.max(96, Math.round(mb.left - 8 - sealRight - 10)),
          });
        });
        return;
      }
    } catch (e) { /* 老基础库:落到下面的兜底值 */ }
    this.setData({ pillTop: top, pillRight: right, pillMaxW: maxW });
  },

  // 阵容 → 卡片 VM:字段与阵容列表的 ccard 对齐(等级/人口/作者/更新时间/头像条/羁绊胶囊)
  feedVM(c, isHero) {
    const sid = c.season;
    const bondOf = n => fmt.data.bonds.find(b => b.n === n && b.season === sid) || {};
    const all = c.front.concat(c.back);
    all.sort((a, b) => (b[0] === c.main ? 1 : 0) - (a[0] === c.main ? 1 : 0));
    const units = all.map(u => {
      const pc = fmt.pieceOf(u[0], sid);
      const star = u[1] || 1;
      return {
        n: u[0], ch: u[0][0], star,
        stars: star >= 2 ? "★★★".slice(0, star) : "",
        art: api.artUrl(pc.art, isHero ? 200 : 130),
        color: fmt.pack.cost.colors[pc.c] || fmt.pack.cost.colors[3],
        items: u[2] || [],
        isMain: u[0] === c.main,
      };
    });
    const st = this._stats && this._stats[c.n];
    return {
      n: c.n, author: c.author || "未署名", season: sid,
      heat: fmt.wan(c.heat), tier: c.tier, popCarry: `${c.pop}${c.carry}`,
      pop: c.pop, carry: c.carry, colorBond: !!c.colorBond,
      // 等级按收藏数(A/S/SSS),与阵容列表同源;未拉到统计时按 A
      grade: fmt.compGrade(st ? st.favs : 0),
      updText: updText(c.upd),
      desc: `主C ${c.main} · ${c.carry} 费 · ${(c.traits || []).length} 个羁绊`,
      units,
      bonds: (c.traits || []).map(t => {
        const b = bondOf(t[0]);
        return {
          n: t[0], count: t[1],
          // 满羁绊点亮彩色重绘图标,未满保持灰度(与摆棋/图鉴同一规则)
          icon: api.bondIcon(b.icon, t[0], bondEngine.isMaxed(b, t[1])),
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
      icon: api.iconUrl(b.icon, 160),
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
