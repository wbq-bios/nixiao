// 通用详情页 · type=comp|piece|bond|equip|augment
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const store = require("../../core/store.js");
const bondEngine = require("../../core/bondEngine.js");
// 心悟类型/品质来自元数据表(OCR 数据没有这两个字段)
const AUG = require("../../games/xq/data/s3_augment_meta.js");
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
        // 头像/装备都换成真实图:棋子立绘 + 装备图标;没有图的仍回退首字
        const withArt = u => Object.assign({}, u, {
          art: api.artUrl((fmt.pieceOf(u.n, sid) || {}).art, 160),
          items: (u.items || []).map(it => {
            const e = data.equips.find(x => x.n === it.name);
            return { name: it.name, ch: it.ch, icon: e ? api.iconUrl(e.icon, 48) : "" };
          }),
        });
        // 羁绊胶囊:真实图标,满羁绊点亮彩色(与列表/摆棋同规则)
        const traitsVM = (c.traits || []).map(t => {
          const b = data.bonds.find(x => x.n === t[0] && x.season === sid) || {};
          return { n: t[0], count: t[1], color: !!t[2], ch: t[0][0], icon: api.bondIcon(b.icon, t[0], bondEngine.isMaxed(b, t[1])) };
        });
        d = Object.assign(fmt.compCardVM(c), {
          front: uv.front.map(withArt), back: uv.back.map(withArt),
          traitsVM,
          // 等级先按 0 收藏出 A,统计回来后再按收藏数刷新(与列表同源)
          grade: fmt.compGrade(0),
          styleTags: c.style || [],

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
          return { n: b, color: !!bond.color, icon: api.bondIcon(bond.icon, b, false) };
        }),
      });
      favKey = p.n;
    } else if (type === "bond") {
      const b = data.bonds.find(x => x.n === name && x.season === sid) || data.bonds.find(x => x.n === name);
      if (b) {
        // 成员格用立绘头像(与图鉴/首页同链路);图 404 时背景层不渲染,自然回退首字格
        const members = data.pieces.filter(p => (p.bonds || []).includes(b.n))
          .map(p => Object.assign(fmt.unitVM({ n: p.n }, { star: 1 }), { art: api.artUrl(p.art) }));
        d = Object.assign({}, b, {
          ch: b.n[0], color: !!b.color, colorStr: b.color ? fmt.pack.cost.colors[5] : fmt.pack.cost.colors[3],
          // 头标徽记:同图鉴/首页链路;S4 演示羁绊无 icon 字段 → 空串回退首字
          icon: api.iconUrl(b.icon, 96),
          members,
        });
        favKey = b.n;
      }
    } else if (type === "equip") {
      const e = data.equips.find(x => x.n === name && x.season === sid) || data.equips.find(x => x.n === name);
      // 头标图标同图鉴链路;S4 演示数据无 icon 字段 → 空串回退首字
      if (e) { d = Object.assign({}, e, { ch: e.n[0], rcls: fmt.rarCls(e.r), icon: api.iconUrl(e.icon, 96) }); favKey = e.n; }
    } else if (type === "augment") {
      const a = data.augments.find(x => x.n === name && x.season === sid) || data.augments.find(x => x.n === name);
      if (a) {
        d = Object.assign({}, a, {
          ch: a.n[0], icon: api.iconUrl(a.icon, 96),
          t: AUG.CAT[a.n] || "战力", qual: AUG.RARITY[a.n] || "",
        });
        favKey = a.n;
      }
    }
    this.setData({ type, d, favKey, fav: !!store.getFavs().find(f => f.n === favKey), sid });
    if (type === "comp" && d) this.loadVoteStats();   // 点赞计数来自服务端统计
    wx.setNavigationBarTitle({ title: name || fmt.pack.displayName });
  },
  onFav() {
    if (!this.data.favKey) return;
    // 收藏记到"正在查看的赛季",否则归档赛季的收藏会被记到当前赛季
    const added = store.toggleFav(this.data.favKey, this.data.sid || season.get().id);
    this.setData({ fav: added });
    wx.showToast({ title: added ? "已收藏" : "已取消收藏", icon: "none" });
  },
  // 「使用」= 把这套阵容载入摆棋页(?comp=);列表页已去掉该入口,只保留详情这一处
  onUse() {
    const d = this.data.d;
    if (!d || !d.n) return;
    wx.navigateTo({ url: `/pages/sim/sim?comp=${encodeURIComponent(d.n)}` });
  },
  // 阵容详情点赞:计数走服务端统计(热度=点赞数),本地投票先乐观更新
  loadVoteStats() {
    const d = this.data.d;
    if (!d || !api.online()) return;
    api.compStats("xq", this.data.sid || season.get().id).then(rows => {
      const r = (rows || []).find(x => x.n === d.n);
      if (!r) return;
      this.setData({
        "d.up": r.up, "d.down": r.down, "d.my": store.getVote(d.n),
        "d.grade": fmt.compGrade(r.favs),
      });
    }).catch(() => {});
  },
  onVote(e) {
    const dir = e.currentTarget.dataset.dir;
    const d = this.data.d;
    if (!d) return;
    const prev = store.getVote(d.n);
    const next = prev === dir ? "" : dir;      // 再点一次 = 取消
    store.setVote(d.n, next, this.data.sid || season.get().id);
    const up = Math.max(0, (d.up || 0) + (next === "up" ? 1 : 0) - (prev === "up" ? 1 : 0));
    const down = Math.max(0, (d.down || 0) + (next === "down" ? 1 : 0) - (prev === "down" ? 1 : 0));
    this.setData({ "d.up": up, "d.down": down, "d.my": next });
  },
  onJump(e) {
    const { type, name } = e.currentTarget.dataset;
    wx.redirectTo({ url: `/pages/detail/detail?type=${type}&name=${encodeURIComponent(name)}` });
  },
  // 立绘改走背景图层后,404 自然不渲染、透出首字,无需 onArtErr 兜底(2026-10-29 与图鉴列表统一)
  onShareUnit() { wx.showToast({ title: "分享卡片 Phase 3 提供", icon: "none" }); },
  onShareAppMessage() {
    // 分享次数:「我的」页概览里的「分享记录」用,只存本机(无服务端统计)
    try { wx.setStorageSync("share-count", (+(wx.getStorageSync("share-count") || 0)) + 1); } catch (e) { }
    return {
      title: `${fmt.pack.displayName} · ${this.data.favKey}`,
      path: `/pages/detail/detail?type=${this.data.type}&name=${encodeURIComponent(this.data.favKey)}&season=${encodeURIComponent(this.data.sid || season.get().id)}`,
    };
  },
});
