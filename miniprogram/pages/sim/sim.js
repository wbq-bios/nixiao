// 摆棋推演 · 常驻选人面板(点选/长按拖放上阵) + 28格蜂窝棋盘 + 长按拖拽(移除/换位) + 人口上限 + 标题/运营思路
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const boardModel = require("../../core/boardModel.js");
const bondEngine = require("../../core/bondEngine.js");
const store = require("../../core/store.js");
const api = require("../../utils/api.js");

const COST = fmt.pack.cost.colors;

// DOM 顺序(.hex 查询序=渲染序,自上而下)→ 棋盘真实索引。
// 拖拽命中第 k 个矩形时必须经此映射,直接用 k 会把棋子放错格(外部评审#1)
const DOM_SLOTS = [
  21, 22, 23, 24, 25, 26, 27,
  14, 15, 16, 17, 18, 19, 20,
  7, 8, 9, 10, 11, 12, 13,
  0, 1, 2, 3, 4, 5, 6,
];

let state = null;   // 棋盘模型当前状态（board/stars/items/main/name/notes）

// 当前赛季的数据视图(数据包按赛季 concat 合并,推算/选棋必须过滤,
// 否则同名棋子/羁绊跨赛季重复计数——曾致羁绊列表"初涉江湖"出现两次)
function seasonData() {
  const id = season.get().id;
  return {
    pieces: fmt.pack.data.pieces.filter(p => p.season === id),
    bonds: fmt.pack.data.bonds.filter(b => b.season === id),
    equips: fmt.pack.data.equips.filter(e => e.season === id),
  };
}

// 筛选选项按当前赛季数据去重生成。
// 坑:pack.jobs 是演示期职业表,与 S3 真实 job 值(技能战士/普攻后排…)完全不匹配,
// 用它做下拉选中必空池——必须从当前赛季 pieces 现算(2026-10-29 参考图重做时修正)
function buildOpts(sd) {
  const first = [{ v: "", l: "全部" }];
  const jobs = [...new Set(sd.pieces.map(p => p.job).filter(Boolean))];
  const tags = [...new Set(sd.pieces.flatMap(p => p.tags || []).filter(Boolean))];
  return {
    jobOpts: first.concat(jobs.map(j => ({ v: j, l: j }))),
    tagOpts: first.concat(tags.map(t => ({ v: t, l: t }))),
    bondOpts: first.concat(sd.bonds.map(b => ({ v: b.n, l: b.n }))),
  };
}

Page({
  data: {
    season: null, rows: [], filled: 0, totalCost: 0, bondsVM: [],
    // 常驻选人面板(页面顶部,替代原选棋 sheet)
    panel: { q: "", cost: 0, job: "", tag: "", bond: "", dd: "", pool: [], count: 0 },
    costs: [0, 1, 2, 3, 4, 5],
    jobOpts: [], tagOpts: [], bondOpts: [],   // onShow 按当前赛季现算
    // 人口上限(v=0 表示不限);超出上限落子会被拦截,撤销可回退
    cap: 9, capOpts: [{ v: 0, l: "不限" }, { v: 7, l: "7人口" }, { v: 8, l: "8人口" }, { v: 9, l: "9人口" }, { v: 10, l: "10人口" }],
    // 阵容标题/运营思路:随棋盘状态持久(boardModel),保存存档时写入记录
    name: "", notes: "",
    panelH: 0,      // 选人网格滚动模块高度(px,按屏宽换算)
    // 棋盘几何全部 JS 实测行宽后算 px 内联(wxss/rpx/aspect-ratio 在本环境均被放大,见 sim.wxss 注):
    // rowEvenStyle/rowOddStyle=行缩进,cellStyle=格子宽高+列距,正六边形 h=w×1.155
    rowEvenStyle: "", rowOddStyle: "", cellStyle: "",
    resetAsk: false,  // 重置确认弹窗
    // 棋子设置弹窗
    modalOn: false, unit: null, unitIdx: -1, unitDetail: "",
    // 装备弹层
    eqOn: false, eqSlot: -1, eqQ: "", eqGridH: 240, equipsVM: [], eqSheetSlots: [],
    // 拖拽
    dragOn: false, gx: 0, gy: 0, ghostCh: "", ghostColor: "", ghostArt: "", rmHot: false, dropIdx: -1,
    // 从选人面板长按起拖(放棋):pickDrag 同时用于关掉 pickwrap 的纵向滚动与页面滚动
    pickDrag: false,
    // 空格子底部选棋弹窗
    pickOn: false, pickRow: 0, pickCol: 0, pickQ: "", pickCost: 0, pickPool: [], sheetH: 216,
    // 移除热区位置(px,拖动时按棋盘卡实测矩形下发,贴棋盘正上方)
    rmTop: 0, rmLeft: 20, rmW: 350,
    // 操作回执条:移除/换位后 3 秒内可撤销(对应设计稿「已移除 · 撤销」)
    snackOn: false, snackText: "",
  },

  onLoad(query) {
    // 从阵容列表点「使用」进来:?comp=<阵容名>,等 onShow 把棋盘状态装好后再落子
    this._pendingComp = query && query.comp ? decodeURIComponent(query.comp) : "";
    // 选人滚动区高度按屏宽换算 px(棋盘格已改百分比布局,不再依赖内联尺寸)
    const k = (wx.getSystemInfoSync().windowWidth || 390) / 750;
    this.setData({
      // 初值 500rpx ≈ 3 行;onReady 的 fitPanelH 会按「面板+棋盘铺满一屏」再校正
      panelH: Math.round(500 * k),
    });
  },
  onReady() {
    // 棋盘几何:实测 .hexrow 行宽 → 算出格子宽/高(正六边形 h=w×1.155)/列距/奇行错位,
    // 全部以 px 内联下发。wxss 的 rpx/百分比/aspect-ratio 在本环境均被放大(三轮实测),
    // 唯有"实测矩形 + px 内联"与选人模块 panelH 同路径渲染准确(2026-10-29 定稿)
    const q = wx.createSelectorQuery();
    q.select(".hexrow").boundingClientRect();
    q.exec(res => {
      if (!res || !res[0] || !res[0].width) return;
      const rowW = res[0].width;
      const k = (wx.getSystemInfoSync().windowWidth || 390) / 750;
      const padL = Math.round(rowW * 0.03 * 10) / 10;          // 左缩进 3% 行宽
      const gap = Math.round(8 * k * 10) / 10;                 // 列距 8rpx → px
      // 奇行比偶行多缩进 (格宽+列距)/2,可用宽度更少 → 格宽必须按奇行反解,
      // 否则奇行 7 列超宽被 flex 压窄,同一盘两行格宽不一致(2026-10-29 实测 43.7 vs 40.3)。
      // 约束:padL + (w+gap)/2 + 7×(w+gap) ≤ rowW  →  w = (rowW - padL - 7.5×gap) / 7.5
      const w = Math.floor((rowW - padL - 7.5 * gap) / 7.5 * 10) / 10;
      const h = Math.round(w * 1.155 * 10) / 10;               // 正六边形 高/宽 = 2/√3
      const odd = Math.round((padL + gap / 2 + w / 2) * 10) / 10; // 奇行错位半格
      this.setData({
        rowEvenStyle: `padding-left:${padL}px`,
        rowOddStyle: `padding-left:${odd}px`,
        cellStyle: `width:${w}px;height:${h}px;margin:0 ${gap / 2}px`,
      });
      this.render();   // 把行/格样式绑进 rows 数据
      // 棋盘几何落定后再做首屏高度自适应(要等选人网格按新格子尺寸重新排版)
      setTimeout(() => this.fitPanelH(), 80);
    });
  },

  // 首屏自适应:让「选人模块 + 棋盘」正好铺满一屏——棋盘卡底边贴窗口底。
  // 面板高度是唯一可伸缩项,量一次棋盘卡底边与窗口底的差量回填 panelH(1:1 位移),
  // 上下限防止窄屏/平板把面板压到不可用或撑得过高;只调一次,之后滚动不受影响
  fitPanelH() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const k = (win.windowWidth || 390) / 750;
    const q = wx.createSelectorQuery();
    q.select(".board-card").boundingClientRect();
    q.exec(res => {
      const r = res && res[0];
      if (!r || !r.height) return;
      const delta = Math.round(win.windowHeight - 10 - r.bottom);   // 留 10px 呼吸位,棋盘提示文字不贴屏幕边
      if (Math.abs(delta) < 3) return;                      // 已经贴底,别抖
      const minH = Math.round(150 * k);                     // 至少留 ~2 行的高度
      const maxH = Math.round(win.windowHeight * 0.62);     // 最多占屏幕 62%
      const next = Math.max(minH, Math.min(this.data.panelH + delta, maxH));
      if (next !== this.data.panelH) this.setData({ panelH: next });
    });
  },
  onShow() {
    state = boardModel.load();   // 支持从「我的」载入后回填
    // 赛季可能在首页被切换:筛选选项必须随 onShow 重建(外部评审#7)
    const sd = seasonData();
    this.setData({
      season: season.get(),
      ...buildOpts(sd),
      // 载入存档/上次离开时的标题与思路回填
      name: state.name || "", notes: state.notes || "",
    });
    this.render();
    // 阵容列表点「使用」进来的:棋盘状态就绪后再把阵容铺上去(只做一次)
    if (this._pendingComp) {
      const nm = this._pendingComp;
      this._pendingComp = "";
      this.loadComp(nm);
    }
  },

  // 按名称载入某套阵容(「使用」与「示例」共用);找不到就提示,不动当前棋盘
  loadComp(name) {
    const sid = season.get().id;
    const c = fmt.pack.data.comps.find(x => x.n === name && x.season === sid) || fmt.pack.data.comps.find(x => x.n === name);
    if (!c) { wx.showToast({ title: "没找到这套阵容", icon: "none", position: "top" }); return; }
    this.hideSnack();
    boardModel.snapshot(state);
    const b = Array(boardModel.SIZE).fill(null);
    const stars = {}, items = {};
    // front/back 只是前中后排的分组,落到棋盘上方两排(22..)和下方两排(15..)
    c.front.forEach((u, k) => { b[22 + k] = u[0]; if (u[1] > 1) stars[22 + k] = u[1]; if (u[2] && u[2].length) items[22 + k] = u[2]; });
    c.back.forEach((u, k) => { b[15 + k] = u[0]; if (u[1] > 1) stars[15 + k] = u[1]; if (u[2] && u[2].length) items[15 + k] = u[2]; });
    state.board = b; state.main = c.main;
    state.stars = stars; state.items = items;
    boardModel.save(state);
    this.render();
    wx.showToast({ title: `已载入 · ${c.n}`, icon: "none", position: "top" });
  },

  /* ---------- 渲染 ---------- */
  render() {
    const rowsDef = [
      [21, 22, 23, 24, 25, 26, 27],
      [14, 15, 16, 17, 18, 19, 20],
      [7, 8, 9, 10, 11, 12, 13],
      [0, 1, 2, 3, 4, 5, 6],
    ];
    // 装备名 → 装备数据,格子上的小装备图标要按名字查 icon
    const sd = seasonData();
    const eqOf = nm => sd.equips.find(x => x.n === nm);
    const rows = rowsDef.map((idxs, ri) => ({
      ri,
      // 行内边距/格子尺寸由 onReady 实测后以 px 内联下发(wxss 几何在本环境不可靠)
      sty: ri % 2 === 1 ? this.data.rowOddStyle : this.data.rowEvenStyle,
      cells: idxs.map(i => {
        const n = state.board[i];
        if (!n) return { i, empty: true, sty: this.data.cellStyle };
        const p = fmt.pieceOf(n);
        const star = state.stars[i] || 1;
        return {
          i, empty: false, n, ch: n[0], color: COST[p.c],
          // 格子上用棋子立绘(与选人面板同一张缩略图);无 art/404 时背景透明,透出底下的首字
          art: api.artUrl(p.art, 120),
          sty: this.data.cellStyle,
          stars: star >= 2 ? "★★★".slice(0, star) : "",
          isMain: state.main === n && state.board.indexOf(n) === i,
          // 已装装备:格子上显示小图标(无 icon 的旧数据回退首字)
          items: (state.items[i] || []).filter(Boolean).map(nm => {
            const e = eqOf(nm);
            return { name: nm, ch: nm[0], icon: e ? api.iconUrl(e.icon, 48) : "" };
          }),
        };
      }),
    }));
    const filled = state.board.filter(Boolean).length;
    const totalCost = state.board.filter(Boolean).reduce((s, n) => s + fmt.pieceOf(n).c, 0);
    const bondsVM = bondEngine.calc(state.board.filter(Boolean), sd.bonds, sd.pieces)
      .map(b => ({
        n: b.bond.n, ch: b.bond.n[0], count: b.count,
        pg: b.next ? `${b.count}/${b.next}` : `${b.count} 满`,
        // 羁绊图标:默认灰度原图,满羁绊才换成彩色重绘版(全站统一规则)
        icon: api.bondIcon(b.bond.icon, b.bond.n, b.maxed),
        color: !!b.bond.color && b.tier > 0, dim: b.tier === 0,
      }));
    this.setData({ rows, filled, totalCost, bondsVM });
    this.renderPanel();
  },

  /* ---------- 常驻选人面板 ---------- */
  renderPanel() {
    const pc = this.data.panel;
    const onboard = new Set(state.board.filter(Boolean));
    let pool = seasonData().pieces.filter(p =>
      (!pc.cost || p.c === pc.cost) &&
      (!pc.job || p.job === pc.job) &&   // job 已按赛季去重,精确匹配(indexOf 会"战士"误中"技能战士")
      (!pc.tag || (p.tags || []).includes(pc.tag)) &&
      (!pc.bond || (p.bonds || []).includes(pc.bond)) &&
      (!pc.q || p.n.indexOf(pc.q) >= 0 || (p.bonds || []).join().indexOf(pc.q) >= 0 || p.job.indexOf(pc.q) >= 0));
    pool = pool.map(p => ({
      n: p.n, ch: p.n[0], cost: p.c, color: COST[p.c],
      art: api.artUrl(p.art, 120),   // 立绘缩略(cover 头部优先);无 art 的演示数据回退首字
      onboard: onboard.has(p.n),
    }));
    // 只更新 pool/count,不重写 q/筛选值,避免输入时打字被 setData 重置
    this.setData({ panel: Object.assign({}, pc, { pool, count: pool.length }) });
  },
  onPanelQ(e) { this.setData({ panel: Object.assign({}, this.data.panel, { q: e.detail.value.trim() }) }); this.renderPanel(); },
  onPanelCost(e) { this.setData({ panel: Object.assign({}, this.data.panel, { cost: +e.currentTarget.dataset.v }) }); this.renderPanel(); },
  onPanelDD(e) {
    const v = e.currentTarget.dataset.v;
    this.setData({ panel: Object.assign({}, this.data.panel, { dd: this.data.panel.dd === v ? "" : v }) });
  },
  onPanelJob(e) { this.setData({ panel: Object.assign({}, this.data.panel, { job: e.currentTarget.dataset.v, dd: "" }) }); this.renderPanel(); },
  onPanelTag(e) { this.setData({ panel: Object.assign({}, this.data.panel, { tag: e.currentTarget.dataset.v, dd: "" }) }); this.renderPanel(); },
  onPanelBond(e) { this.setData({ panel: Object.assign({}, this.data.panel, { bond: e.currentTarget.dataset.v, dd: "" }) }); this.renderPanel(); },
  // 点人格子 → 落入第一个空位(同名唯一 + 人口上限拦截);长按可起拖,精确丢到指定格
  onPanelPick(e) {
    if (this._suppressPickTap) return;   // 长按拖放后的抬手不应再触发"落第一个空位"
    const name = e.currentTarget.dataset.n;
    // 自走棋规则:同名棋子全场唯一,绿框"已上阵"必须真拦截(外部评审#2)
    if (state.board.includes(name)) {
      wx.showToast({ title: "该棋子已在场上 · 不能重复上阵", icon: "none", position: "top" });
      return;
    }
    const filled = state.board.filter(Boolean).length;
    if (this.data.cap && filled >= this.data.cap) {
      wx.showToast({ title: `人口上限 ${this.data.cap} · 可切「不限」或先移除`, icon: "none", position: "top" });
      return;
    }
    const slot = state.board.findIndex(x => !x);
    if (slot < 0) { wx.showToast({ title: "棋盘 28 格已满", icon: "none", position: "top" }); return; }
    boardModel.snapshot(state);
    state.board[slot] = name;
    if (!state.stars[slot]) state.stars[slot] = 1;
    boardModel.save(state);
    this.render();
  },

  /* ---------- 选人面板长按拖放(把棋子放到指定格) ---------- */
  // 与棋盘拖拽同一套 300ms 长按 + 8px 滚动容错;起拖后关掉 pickwrap 纵向滚动与页面滚动,
  // 松手落在棋盘格内即上阵,落在面板/空白处则放弃(不误落子)
  onPickDown(e) {
    const n = e.currentTarget.dataset.n;
    const t = e.touches[0];
    if (!t) return;
    this._pick = { n, x: t.clientX, y: t.clientY, dead: false };
    if (this._pickTimer) clearTimeout(this._pickTimer);
    this._pickTimer = setTimeout(() => {
      if (!this._pick || this._pick.dead) return;
      this.startPickDrag(this._pick.n, this._pick.x, this._pick.y);
    }, 300);
  },
  onPickMove(e) {
    const t = e.touches[0];
    if (!t) return;
    if (!this._pickDrag) {
      // 还没起拖:移动超过 8px 视为想滚列表,取消长按
      if (this._pick && !this._pick.dead) {
        if (Math.hypot(t.clientX - this._pick.x, t.clientY - this._pick.y) > 8) this.killPick();
      }
      return;
    }
    this.setData({ gx: t.clientX, gy: t.clientY });
    if (!this._pickDrag.rects) return;
    let dropIdx = -1;
    this._pickDrag.rects.forEach((r, k) => {
      if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) dropIdx = DOM_SLOTS[k] ?? -1;
    });
    if (dropIdx !== this._pickDrag.dropIdx) {
      this._pickDrag.dropIdx = dropIdx;
      this.setData({ dropIdx });
    }
  },
  onPickUp() {
    const drag = this._pickDrag;
    this.killPick();
    if (!drag) return;                     // 只是点按:tap 会走 onPanelPick
    this.clearPickDrag();
    this._suppressPickTap = true;
    setTimeout(() => { this._suppressPickTap = false; }, 120);
    const dropIdx = drag.dropIdx;
    if (dropIdx < 0) return;               // 没落在棋盘格上:放弃,不落子
    if (state.board[dropIdx]) { wx.showToast({ title: "这格已有棋子 · 拖到空格", icon: "none", position: "top" }); return; }
    const filled = state.board.filter(Boolean).length;
    if (this.data.cap && filled >= this.data.cap) {
      wx.showToast({ title: `人口上限 ${this.data.cap} · 可切「不限」或先移除`, icon: "none", position: "top" });
      return;
    }
    boardModel.snapshot(state);
    state.board[dropIdx] = drag.n;
    state.stars[dropIdx] = 1;
    boardModel.save(state);
    this.render();
    this.showSnack("已上阵");
  },
  onPickCancel() { this.clearPickDrag(); this.killPick(); },
  startPickDrag(n, x, y) {
    // 同名唯一:已在场上的棋子不能再拖上来,长按直接提示并放弃
    if (state.board.includes(n)) {
      wx.showToast({ title: "该棋子已在场上 · 不能重复上阵", icon: "none", position: "top" });
      this.killPick();
      return;
    }
    const p = fmt.pieceOf(n);
    this._pickDrag = { n, dropIdx: -1, rects: null };
    this.setData({ pickDrag: true, ghostCh: n[0], ghostColor: COST[p.c], ghostArt: api.artUrl(p.art, 160), gx: x, gy: y, dropIdx: -1 });
    const q = wx.createSelectorQuery();
    q.selectAll(".mhex").boundingClientRect();
    q.exec(res => { if (this._pickDrag) this._pickDrag.rects = res[0] || []; });
  },
  clearPickDrag() { this._pickDrag = null; if (this.data.pickDrag) this.setData({ pickDrag: false, dropIdx: -1 }); },
  killPick() {
    if (this._pickTimer) { clearTimeout(this._pickTimer); this._pickTimer = null; }
    if (this._pick) this._pick.dead = true;
  },

  /* ---------- 棋盘点击 ---------- */
  onSlotTap(e) {
    if (this._suppressTap) return;
    const i = e.currentTarget.dataset.i;
    if (state.board[i]) this.openUnitModal(i);
    else this.openPickSheet(i);   // 空格子:底部弹搜索选棋,选中直接落这一格
  },

  /* ---------- 空格子 → 底部搜索选棋弹窗 ---------- */
  openPickSheet(i) {
    this._pickSlot = i;
    this.setData({
      pickOn: true,
      pickRow: 4 - Math.floor(i / 7),      // 行号按"上→下"1..4(与棋盘上下排标注一致)
      pickCol: (i % 7) + 1,
      pickQ: "", pickCost: 0,
    });
    this.renderPickPool();
  },
  onPickSheetClose() { this.setData({ pickOn: false }); },
  onPickSheetQ(e) { this.setData({ pickQ: (e.detail.value || "").trim() }); this.renderPickPool(); },
  onPickSheetCost(e) { this.setData({ pickCost: +e.currentTarget.dataset.v }); this.renderPickPool(); },
  // 弹窗内的棋子池:按关键字(名/羁绊/职业)与费用过滤,标记已上阵的同名棋子
  renderPickPool() {
    const q = this.data.pickQ, cost = this.data.pickCost;
    const onboard = new Set(state.board.filter(Boolean));
    const pool = seasonData().pieces.filter(p =>
      (!cost || p.c === cost) &&
      (!q || p.n.indexOf(q) >= 0 || (p.bonds || []).join().indexOf(q) >= 0 || (p.job || "").indexOf(q) >= 0)
    ).map(p => ({
      n: p.n, ch: p.n[0], cost: p.c, color: COST[p.c],
      art: api.artUrl(p.art, 120),
      onboard: onboard.has(p.n),
    }));
    this.setData({ pickPool: pool });
  },
  onPickSheetPick(e) {
    const n = e.currentTarget.dataset.n;
    const slot = this._pickSlot;
    if (slot == null || slot < 0) return;
    if (state.board[slot]) { wx.showToast({ title: "这格已有棋子", icon: "none", position: "top" }); return; }
    if (state.board.includes(n)) { wx.showToast({ title: "该棋子已在场上 · 不能重复上阵", icon: "none", position: "top" }); return; }
    const filled = state.board.filter(Boolean).length;
    if (this.data.cap && filled >= this.data.cap) {
      wx.showToast({ title: `人口上限 ${this.data.cap} · 可切「不限」或先移除`, icon: "none", position: "top" });
      return;
    }
    boardModel.snapshot(state);
    state.board[slot] = n;
    state.stars[slot] = 1;
    boardModel.save(state);
    this.setData({ pickOn: false });
    this.render();
    this.showSnack("已上阵");
  },

  /* ---------- 人口上限 ---------- */
  onCap(e) { this.setData({ cap: +e.currentTarget.dataset.v }); },

  /* ---------- 标题 / 运营思路(输入只钳长度不 trim,保存时再 trim,防打字被吞空格) ---------- */
  onName(e) {
    const v = (e.detail.value || "").slice(0, 20);
    state.name = v;
    boardModel.save(state);
    this.setData({ name: v });
  },
  onNotes(e) {
    const v = (e.detail.value || "").slice(0, 200);
    state.notes = v;
    boardModel.save(state);
    this.setData({ notes: v });
  },

  /* ---------- 棋子设置弹窗 ---------- */
  openUnitModal(i) {
    this._unitIdx = i;
    this.renderUnit();
    this.setData({ modalOn: true });
  },
  renderUnit() {
    const i = this._unitIdx;
    const n = state.board[i];
    if (!n) { this.setData({ modalOn: false }); return; }
    const p = fmt.pieceOf(n);
    const its = state.items[i] || [null, null, null];
    const eqs = seasonData().equips;
    // 槽位:名称/图标/品阶一起给模板,默认显示装备图标而不是首字
    const slots = [0, 1, 2].map(k => {
      const nm = its[k] || "";
      const e = nm ? eqs.find(x => x.n === nm) : null;
      return { k, name: nm, ch: nm ? nm[0] : "", rank: e ? e.r : "", icon: e ? api.iconUrl(e.icon, 96) : "" };
    });
    this.setData({
      unit: {
        idx: i, n, ch: n[0], color: COST[p.c], cost: p.c, job: p.job,
        bonds: p.bonds || [],
        star: state.stars[i] || 1,
        stars: "★★★".slice(0, state.stars[i] || 1),
        slots,
        isMain: state.main === n && state.board.indexOf(n) === i,
      },
      unitDetail: p.note || (p.skill && p.skill.d ? `${p.skill.n}：${p.skill.d}` : "（暂无详解，正式版展示技能与数值）"),
    });
  },
  onModalClose() { this.setData({ modalOn: false }); },
  onToggleMain() {
    boardModel.snapshot(state);
    const n = state.board[this._unitIdx];
    state.main = state.main === n ? null : n;
    boardModel.save(state);
    this.renderUnit(); this.render();
  },
  onStar(e) {
    const d = +e.currentTarget.dataset.d;
    boardModel.snapshot(state);
    const i = this._unitIdx;
    state.stars[i] = Math.max(1, Math.min(3, (state.stars[i] || 1) + d));
    boardModel.save(state);
    this.renderUnit(); this.render();
  },
  // 点槽位 = 打开装备弹层(空槽是装、已装是换);卸下走槽位右上角的 ×,不再靠"再点一次槽位"
  onEqSlot(e) {
    const k = +e.currentTarget.dataset.k;
    this._eqSlot = k;
    this.setData({ eqQ: "" });   // 每次打开回到全量,避免带着上次搜索
    this.renderEqSheet();
    this.setData({ eqOn: true });
  },
  // 弹层数据:3 个槽位的当前装备(顶部可切换槽) + 装备池(按搜索词过滤,带图标)
  renderEqSheet() {
    const i = this._unitIdx;
    const its = state.items[i] || [null, null, null];
    const eqs = seasonData().equips;
    const q = (this.data.eqQ || "").trim();
    const iconOf = nm => {
      const e = eqs.find(x => x.n === nm);
      return e ? api.iconUrl(e.icon, 96) : "";
    };
    // 名称/品阶都能搜,方便从 156 件里快速定位
    const list = q ? eqs.filter(x => x.n.indexOf(q) >= 0 || (x.r || "").indexOf(q) >= 0) : eqs;
    // 网格高度跟着结果行数收放:条目少时弹层自动变矮,不再留一大块空白(上限 240px,约 3 行多)
    const gridH = list.length ? Math.min(240, Math.max(76, Math.ceil(list.length / 6) * 72 + 8)) : 76;
    this.setData({
      eqSlot: this._eqSlot,
      eqGridH: gridH,
      eqSheetSlots: [0, 1, 2].map(k => ({
        k, name: its[k] || "", icon: its[k] ? iconOf(its[k]) : "",
      })),
      equipsVM: list.map(x => ({ n: x.n, ch: x.n[0], r: x.r, icon: api.iconUrl(x.icon, 96) })),
    });
  },
  onEqQ(e) {
    this.setData({ eqQ: (e.detail.value || "").trim() });
    this.renderEqSheet();
  },
  // 弹层顶部切槽:一次弹窗里可以连着装第 2、3 件
  onEqSwitchSlot(e) {
    this._eqSlot = +e.currentTarget.dataset.k;
    this.setData({ eqSlot: this._eqSlot });
  },
  // 槽位右上角 ×:直接卸下(不再弹层)
  onEqRemove(e) {
    const k = +e.currentTarget.dataset.k;
    const i = this._unitIdx;
    const its = state.items[i] || [null, null, null];
    if (!its[k]) return;
    boardModel.snapshot(state);
    its[k] = null;
    state.items[i] = its;
    boardModel.save(state);
    this.renderUnit();
    this.render();
    if (this.data.eqOn) this.renderEqSheet();
  },
  onEqPick(e) {
    const name = e.currentTarget.dataset.n;
    const i = this._unitIdx, k = this._eqSlot;
    boardModel.snapshot(state);
    const its = state.items[i] || [null, null, null];
    its[k] = name; state.items[i] = its;
    boardModel.save(state);
    this.setData({ eqOn: false });
    this.renderUnit(); this.render();
  },
  onEqClose() { this.setData({ eqOn: false }); },
  onRemoveUnit() {
    this.hideSnack();
    boardModel.snapshot(state);
    const i = this._unitIdx;
    const n = state.board[i];
    state.board[i] = null;
    delete state.stars[i]; delete state.items[i];
    if (state.main === n && !state.board.includes(n)) state.main = null;
    boardModel.save(state);
    this.setData({ modalOn: false });
    this.render();
  },

  /* ---------- 顶部操作 ---------- */
  onUndo() {
    this.hideSnack();   // 别处撤销后旧回执失效,避免再点一次把上上步也撤了
    const s = boardModel.undo();
    if (!s) { wx.showToast({ title: "没有可撤销的操作", icon: "none", position: "top" }); return; }
    state = s;
    // 撤销可能回退了标题/思路,输入框一并回填
    this.setData({ name: state.name || "", notes: state.notes || "" });
    this.render();
  },
  onResetAsk() { this.setData({ resetAsk: true }); },
  onResetCancel() { this.setData({ resetAsk: false }); },
  onResetDo() {
    this.setData({ resetAsk: false });
    this.hideSnack();
    boardModel.snapshot(state);
    state = Object.assign({}, state, { board: Array(boardModel.SIZE).fill(null), stars: {}, items: {}, main: null });
    boardModel.save(state); this.render();
    wx.showToast({ title: "已重置 · 可撤销", icon: "none", position: "top" });
  },
  onDemo() {
    // 示例 = 当前赛季的第一套阵容,复用 loadComp(与阵容列表的「使用」同一条路径)
    const sid = season.get().id;
    const c = fmt.pack.data.comps.find(x => x.season === sid) || fmt.pack.data.comps[0];
    if (c) this.loadComp(c.n);
  },
  // 保存当前棋盘到「我的阵容」;返回 {ok, name, empty}——名字也回给发布用,两边保持一致
  saveCurrent() {
    const filled = state.board.filter(Boolean).length;
    if (!filled) { wx.showToast({ title: "棋盘还空着 · 先摆几枚棋子", icon: "none", position: "top" }); return { ok: false, name: "", empty: true }; }
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    let name = (this.data.name || "").trim();
    if (!name) name = `推演 · ${now.getMonth() + 1}-${now.getDate()} ${hhmm}`;
    // 坑:云端合并(pullRemote)按 name 去重,重名存档会在下次启动时被吞——保存前就地防重
    if (store.getSims().some(x => x.name === name)) name = `${name} · ${hhmm}`;
    const ok = store.addSim({
      name,
      notes: (this.data.notes || "").trim(),   // 运营思路,暂仅本地(云端表无此列)
      board: state.board, stars: state.stars, items: state.items, main: state.main,
      season: season.get().id,
    });
    // addSim 返回 false = 本地已达 50 条上限
    return { ok: ok !== false, name, empty: false };
  },
  onSave() {
    const r = this.saveCurrent();
    if (r.empty) return;
    if (!r.ok) { wx.showToast({ title: "存档已满 50 条 · 到我的页删几条再存", icon: "none", position: "top", duration: 2200 }); return; }
    wx.showToast({ title: `已保存到我的阵容 · ${season.get().id}`, icon: "none", position: "top" });
  },

  // 发布到公开阵容:先按「保存到我的」存一份,再写本机 user_pubs(保存失败不阻断发布)
  onPublish() {
    const saved = this.saveCurrent();
    if (saved.empty) return;
    const now = new Date();
    let name = saved.name;
    if (!name) name = `公开阵容 · ${season.get().id} ${now.getMonth() + 1}-${now.getDate()}`;
    // 重名会让人分不清哪套是哪套,发布前就地加时间后缀
    if (store.getPubs().some(x => x.name === name)) name = `${name} · ${now.toTimeString().slice(0, 5)}`;
    const ok = store.addPub({
      name,
      board: state.board, stars: state.stars, items: state.items, main: state.main,
      season: season.get().id,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
      author: wx.getStorageSync("me-uid") || "匿名",
    });
    if (ok === false) { wx.showToast({ title: "公开阵容已满 50 条 · 到我的发布删几条", icon: "none", position: "top", duration: 2200 }); return; }
    wx.showToast({ title: `已发布 · ${name}`, icon: "none", position: "top", duration: 2000 });
  },

  /* ---------- 长按拖拽（300ms 启拖 · 热区移除 · 格间换位） ---------- */
  onHexStart(e) {
    const i = e.currentTarget.dataset.i;
    if (!state.board[i] || this.drag) return;
    const t = e.touches[0];
    this._touch = { i, x: t.clientX, y: t.clientY, dead: false };
    this._timer = setTimeout(() => {
      if (!this._touch || this._touch.dead) return;
      this.startDrag(t);
    }, 300);
  },
  startDrag(t) {
    const i = this._touch.i;
    const n = state.board[i];
    this.drag = { i, dropIdx: -1, rmHot: false, rects: null, rmRect: null };
    // 移除热区贴到棋盘卡正上方(设计稿位置):先量卡片矩形再下发 top/left/width,
    // 这样拖动时热区就在棋子附近,不用把手指拖到屏幕顶部;卡片顶到极限时退回视口顶部 8px
    const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const zoneH = Math.round(80 * ((sys.windowWidth || 390) / 750));   // 与 .rmzone 的 80rpx 高对齐
    const q0 = wx.createSelectorQuery();
    q0.select(".board-card").boundingClientRect();
    q0.exec(r0 => {
      const r = r0 && r0[0];
      if (!r) return;
      // 整条铺满棋盘卡宽,正好盖住上方人口 chips 那一行(设计稿的位置)
      this.setData({
        rmTop: Math.max(8, Math.round(r.top - zoneH - 6)),
        rmLeft: Math.round(r.left),
        rmW: Math.round(r.width),
      });
    });
    this.setData({ dragOn: true, ghostCh: n[0], ghostColor: COST[fmt.pieceOf(n).c], ghostArt: api.artUrl(fmt.pieceOf(n).art, 160), gx: t.clientX, gy: t.clientY });
    // 移除热区有 0.3s 滑入动画,立即查询量到的是屏幕外位置(曾致拖拽移除永远失效),
    // 故等动画结束再取一次矩形;期间先用手势默认值兜底
    // 类名用 .mhex(棋盘格专属)——曾与图鉴羁绊槽的全局 .hex(app.wxss 80×80rpx)撞车致格子尺寸错乱
    const q = wx.createSelectorQuery();
    q.selectAll(".mhex").boundingClientRect();
    q.select(".rmzone").boundingClientRect();
    q.exec(res => {
      if (!this.drag) return;
      this.drag.rects = res[0] || [];
      this.drag.rmRect = res[1];
    });
    setTimeout(() => {
      if (!this.drag) return;
      const q2 = wx.createSelectorQuery();
      q2.select(".rmzone").boundingClientRect();
      q2.exec(r2 => { if (this.drag && r2 && r2[0]) this.drag.rmRect = r2[0]; });
    }, 350);
  },
  onBoardMove(e) {
    // 拖拽未启动时仍检查移动距离:超 8px 视为滚动意图,取消待启动的长按定时(外部评审#4)
    if (!this.drag) {
      if (this._touch && !this._touch.dead) {
        const t0 = e.touches[0];
        if (Math.hypot(t0.clientX - this._touch.x, t0.clientY - this._touch.y) > 8) this.killTouch();
      }
      return;
    }
    const t = e.touches[0];
    this.setData({ gx: t.clientX, gy: t.clientY });
    if (!this.drag.rects) return;
    let dropIdx = -1;
    this.drag.rects.forEach((r, k) => {
      if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) dropIdx = DOM_SLOTS[k] ?? -1;
    });
    const rm = this.drag.rmRect;
    const rmHot = !!(rm && t.clientX >= rm.left && t.clientX <= rm.right && t.clientY >= rm.top && t.clientY <= rm.bottom);
    if (dropIdx !== this.drag.dropIdx || rmHot !== this.drag.rmHot) {
      this.drag.dropIdx = dropIdx; this.drag.rmHot = rmHot;
      this.setData({ rmHot, dropIdx });
    }
  },
  onBoardEnd() {
    if (!this.drag) { this.killTouch(); return; }
    const { i, dropIdx, rmHot } = this.drag;
    this.clearDrag();
    if (rmHot) {
      boardModel.snapshot(state);
      state.board[i] = null; delete state.stars[i]; delete state.items[i];
      if (state.main && !state.board.includes(state.main)) state.main = null;
      boardModel.save(state); this.render();
      this.showSnack("已移除");   // 不弹二次确认:松手即移除,3 秒内可点回执撤销
    } else if (dropIdx >= 0 && dropIdx !== i) {
      boardModel.snapshot(state);
      const t = state.board[dropIdx];
      state.board[dropIdx] = state.board[i];
      state.board[i] = t;
      if (state.stars[i] || state.stars[dropIdx]) {
        const s = state.stars[i]; state.stars[i] = state.stars[dropIdx]; state.stars[dropIdx] = s;
      }
      if (state.items[i] || state.items[dropIdx]) {
        const it = state.items[i]; state.items[i] = state.items[dropIdx]; state.items[dropIdx] = it;
      }
      boardModel.save(state); this.render();
      this.showSnack("已换位");   // 换位同样可撤销(设计稿:撤销覆盖移除/移动/换位)
    }
    this._suppressTap = true;
    setTimeout(() => { this._suppressTap = false; }, 80);
    this.killTouch();
  },
  onBoardCancel() {
    if (this.drag) this.clearDrag();
    this.killTouch();
  },
  clearDrag() { this.drag = null; this.setData({ dragOn: false, rmHot: false, dropIdx: -1 }); },
  /* ---------- 操作回执 / 触感 ---------- */
  // 回执条 3 秒后自动收起;再触发新操作时重置计时,避免旧计时器提前收掉新提示
  showSnack(text) {
    if (this._snackTimer) clearTimeout(this._snackTimer);
    this.setData({ snackOn: true, snackText: text });
    this._snackTimer = setTimeout(() => { this.setData({ snackOn: false }); this._snackTimer = null; }, 3000);
  },
  hideSnack() {
    if (this._snackTimer) { clearTimeout(this._snackTimer); this._snackTimer = null; }
    if (this.data.snackOn) this.setData({ snackOn: false });
  },
  onSnackTap() {
    if (this._snackTimer) { clearTimeout(this._snackTimer); this._snackTimer = null; }
    this.setData({ snackOn: false });
    this.onUndo();
  },
  killTouch() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._touch) this._touch.dead = true;
  },
  noop() {},
});
