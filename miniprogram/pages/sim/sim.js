// 摆棋推演 · 28格蜂窝棋盘 + 选棋弹窗 + 棋子设置 + 长按拖拽
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const boardModel = require("../../core/boardModel.js");
const bondEngine = require("../../core/bondEngine.js");
const store = require("../../core/store.js");

const COST = fmt.pack.cost.colors;

// DOM 顺序(.hex 查询序=渲染序,自上而下)→ 棋盘真实索引。
// 拖拽命中第 k 个矩形时必须经此映射,直接用 k 会把棋子放错格(外部评审#1)
const DOM_SLOTS = [
  21, 22, 23, 24, 25, 26, 27,
  14, 15, 16, 17, 18, 19, 20,
  7, 8, 9, 10, 11, 12, 13,
  0, 1, 2, 3, 4, 5, 6,
];

let state = null;   // 棋盘模型当前状态（board/stars/items/main）

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

Page({
  data: {
    season: null, rows: [], filled: 0, totalCost: 0, bondsVM: [],
    // 选棋弹窗
    pickerOn: false, picker: { slot: -1, q: "", cost: 0, job: "", bond: "", dd: "", pool: [], cur: "" },
    costs: [0, 1, 2, 3, 4, 5],
    jobOpts: [{ v: "", l: "全部" }].concat(fmt.pack.jobs.map(j => ({ v: j, l: j }))),
    bondOpts: [],   // onLoad 按当前赛季填充
    hexStyle: "",   // 棋盘格 px 尺寸(onLoad 按屏宽计算,wxss 内联双保险)
    resetAsk: false,  // 重置确认弹窗
    // 棋子设置弹窗
    modalOn: false, unit: null, unitIdx: -1, unitDetail: "",
    // 装备弹层
    eqOn: false, eqSlot: -1, equipsVM: [],
    // 拖拽
    dragOn: false, gx: 0, gy: 0, ghostCh: "", ghostColor: "", rmHot: false,
    dragMaskStyle: "",
  },

  onLoad() {
    state = boardModel.load();
    // 羁绊下拉按当前赛季;棋盘格用 px 内联(部分环境 wxss rpx 渲染异常,px 由屏宽换算保证不溢出)
    this.setData({
      bondOpts: [{ v: "", l: "全部" }].concat(fmt.pack.data.bonds.filter(b => b.season === season.get().id).map(b => ({ v: b.n, l: b.n }))),
      hexStyle: (() => {
        const k = (wx.getSystemInfoSync().windowWidth || 390) / 750;
        return `width:${(84 * k).toFixed(2)}px;height:${(95 * k).toFixed(2)}px;margin:0 ${(2 * k).toFixed(2)}px;`;
      })(),
    });
  },
  onShow() {
    state = boardModel.load();   // 支持从「我的」载入后回填
    // 赛季可能在首页被切换:羁绊下拉必须随 onShow 刷新(外部评审#7)
    this.setData({
      season: season.get(),
      bondOpts: [{ v: "", l: "全部" }].concat(seasonData().bonds.map(b => ({ v: b.n, l: b.n }))),
    });
    this.render();
  },

  /* ---------- 渲染 ---------- */
  render() {
    const rowsDef = [
      [21, 22, 23, 24, 25, 26, 27],
      [14, 15, 16, 17, 18, 19, 20],
      [7, 8, 9, 10, 11, 12, 13],
      [0, 1, 2, 3, 4, 5, 6],
    ];
    const rows = rowsDef.map((idxs, ri) => ({
      ri,
      cells: idxs.map(i => {
        const n = state.board[i];
        if (!n) return { i, empty: true };
        const p = fmt.pieceOf(n);
        const star = state.stars[i] || 1;
        return {
          i, empty: false, n, ch: n[0], color: COST[p.c],
          stars: star >= 2 ? "★★★".slice(0, star) : "",
          isMain: state.main === n && state.board.indexOf(n) === i,
          items: (state.items[i] || []).filter(Boolean).map(it => ({ ch: it[0], name: it })),
        };
      }),
    }));
    const filled = state.board.filter(Boolean).length;
    const totalCost = state.board.filter(Boolean).reduce((s, n) => s + fmt.pieceOf(n).c, 0);
    const sd = seasonData();
    const bondsVM = bondEngine.calc(state.board.filter(Boolean), sd.bonds, sd.pieces)
      .map(b => ({
        n: b.bond.n, ch: b.bond.n[0], count: b.count,
        pg: b.next ? `${b.count}/${b.next}` : `${b.count} 满`,
        color: !!b.bond.color && b.tier > 0, dim: b.tier === 0,
      }));
    this.setData({ rows, filled, totalCost, bondsVM });
  },

  /* ---------- 棋盘点击 ---------- */
  onSlotTap(e) {
    if (this._suppressTap) return;
    const i = e.currentTarget.dataset.i;
    if (state.board[i]) this.openUnitModal(i); else this.openPicker(i);
  },

  /* ---------- 选棋弹窗 ---------- */
  openPicker(i) {
    this._picker = { slot: i, q: "", cost: 0, job: "", bond: "", dd: "" };
    this.setData({ pickerOn: true });
    this.renderPicker();
  },
  renderPicker() {
    const pc = this._picker;
    const onboard = new Set(state.board.filter(Boolean));
    const sd0 = seasonData();
    let pool = sd0.pieces.filter(p =>
      (!pc.cost || p.c === pc.cost) &&
      (!pc.job || p.job.indexOf(pc.job) >= 0) &&
      (!pc.bond || (p.bonds || []).includes(pc.bond)) &&
      (!pc.q || p.n.indexOf(pc.q) >= 0 || (p.bonds || []).join().indexOf(pc.q) >= 0 || p.job.indexOf(pc.q) >= 0));
    pool = pool.map(p => ({
      n: p.n, ch: p.n[0], cost: p.c, color: COST[p.c],
      onboard: onboard.has(p.n),
    }));
    this.setData({
      picker: {
        slot: pc.slot, q: pc.q, cost: pc.cost, job: pc.job, bond: pc.bond, dd: pc.dd,
        row: 4 - Math.floor(pc.slot / 7), col: pc.slot % 7 + 1,
        pool, count: pool.length, cur: state.board[pc.slot] || "空位",
      },
    });
  },
  onPickerClose() { this.setData({ pickerOn: false }); },
  onPickerQ(e) { this._picker.q = e.detail.value.trim(); this.renderPicker(); },
  onPickerCost(e) { this._picker.cost = +e.currentTarget.dataset.v; this.renderPicker(); },
  onPickerDD(e) {
    const v = e.currentTarget.dataset.v;
    this._picker.dd = this._picker.dd === v ? "" : v;
    this.renderPicker();
  },
  onPickerJob(e) {
    this._picker.job = e.currentTarget.dataset.v;
    this._picker.dd = "";
    this.renderPicker();
  },
  onPickerBond(e) {
    this._picker.bond = e.currentTarget.dataset.v;
    this._picker.dd = "";
    this.renderPicker();
  },
  onPick(e) {
    const name = e.currentTarget.dataset.n;
    const slot = this._picker.slot;
    // 自走棋规则:同名棋子全场唯一,绿框"已上阵"必须真拦截(外部评审#2)
    if (state.board.includes(name)) {
      wx.showToast({ title: "该棋子已在场上 · 不能重复上阵", icon: "none", position: "top" });
      return;
    }
    boardModel.snapshot(state);
    state.board[slot] = name;
    if (!state.stars[slot]) state.stars[slot] = 1;
    boardModel.save(state);
    this.setData({ pickerOn: false });
    this.render();
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
    const slots = [0, 1, 2].map(k => ({ k, name: its[k] || "", ch: its[k] ? its[k][0] : "" }));
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
  onEqSlot(e) {
    const k = +e.currentTarget.dataset.k;
    const i = this._unitIdx;
    const its = state.items[i] || [null, null, null];
    if (its[k]) {
      boardModel.snapshot(state);
      its[k] = null; state.items[i] = its;
      boardModel.save(state);
      this.renderUnit(); this.render();
    } else {
      this._eqSlot = k;
      this.setData({
        eqOn: true,
        equipsVM: seasonData().equips.map(x => ({ n: x.n, ch: x.n[0], r: x.r })),
      });
    }
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
    const s = boardModel.undo();
    if (!s) { wx.showToast({ title: "没有可撤销的操作", icon: "none", position: "top" }); return; }
    state = s; this.render();
  },
  onResetAsk() { this.setData({ resetAsk: true }); },
  onResetCancel() { this.setData({ resetAsk: false }); },
  onResetDo() {
    this.setData({ resetAsk: false });
    boardModel.snapshot(state);
    state = Object.assign({}, state, { board: Array(boardModel.SIZE).fill(null), stars: {}, items: {}, main: null });
    boardModel.save(state); this.render();
    wx.showToast({ title: "已重置 · 可撤销", icon: "none", position: "top" });
  },
  onDemo() {
    boardModel.snapshot(state);
    // 示例取当前赛季的阵容(S3 真实阵容优先),避免载入不可达赛季的演示数据
    const sid = season.get().id;
    const c = fmt.pack.data.comps.find(x => x.season === sid) || fmt.pack.data.comps[0];
    const b = Array(boardModel.SIZE).fill(null);
    const stars = {}, items = {};
    c.front.forEach((u, k) => { b[22 + k] = u[0]; if (u[1] > 1) stars[22 + k] = u[1]; if (u[2] && u[2].length) items[22 + k] = u[2]; });
    c.back.forEach((u, k) => { b[15 + k] = u[0]; if (u[1] > 1) stars[15 + k] = u[1]; if (u[2] && u[2].length) items[15 + k] = u[2]; });
    state.board = b; state.main = c.main;
    state.stars = stars; state.items = items;
    boardModel.save(state); this.render();
    wx.showToast({ title: `已载入示例 · ${c.n}`, icon: "none", position: "top" });
  },
  onSave() {
    const filled = state.board.filter(Boolean).length;
    if (!filled) { wx.showToast({ title: "棋盘还空着 · 先摆几枚棋子", icon: "none", position: "top" }); return; }
    const now = new Date();
    const ok = store.addSim({
      name: `推演 · ${now.getMonth() + 1}-${now.getDate()} ${now.toTimeString().slice(0, 5)}`,
      board: state.board, stars: state.stars, items: state.items, main: state.main,
      season: season.get().id,
    });
    // addSim 返回 false = 本地已达 50 条上限，提示先清理
    if (ok === false) { wx.showToast({ title: "存档已满 50 条 · 到我的页删几条再存", icon: "none", position: "top", duration: 2200 }); return; }
    wx.showToast({ title: `已保存到我的阵容 · ${season.get().id}`, icon: "none", position: "top" });
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
    this.setData({ dragOn: true, ghostCh: n[0], ghostColor: COST[fmt.pieceOf(n).c], gx: t.clientX, gy: t.clientY });
    // 移除热区有 0.3s 滑入动画,立即查询量到的是屏幕外位置(曾致拖拽移除永远失效),
    // 故等动画结束再取一次矩形;期间先用手势默认值兜底
    const q = wx.createSelectorQuery();
    q.selectAll(".hex").boundingClientRect();
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
  killTouch() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._touch) this._touch.dead = true;
  },
  noop() {},
});
