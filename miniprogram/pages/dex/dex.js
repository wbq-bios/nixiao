// 万象图鉴 · 四段切换 + 搜索 + 费用筛选 + 心悟按类型/品质筛选
const season = require("../../core/season.js");
const fmt = require("../../core/format.js");
const api = require("../../utils/api.js");
// 心悟元数据:OCR 数据里没有类型/品质字段,分类与品质补在这一层(口径见该文件头)
const AUG = require("../../games/xq/data/s3_augment_meta.js");
// 装备品阶:OCR 数据没有品阶,按名称规则补在元数据表(白色/紫色/独珍/橙武/转职书/其他)
const EQUIP = require("../../games/xq/data/s3_equip_meta.js");

// 更新志仅使用 <b> 强调,拆成 rich-text 节点
function noteNodes(html) {
  const out = [];
  const push = (t, bold) => { if (t) out.push(bold ? { name: "b", children: [{ type: "text", text: t }] } : { type: "text", text: t }); };
  const rx = /<b>([\s\S]*?)<\/b>/g;
  let last = 0, m;
  while ((m = rx.exec(String(html || "")))) { push(m.input.slice(last, m.index), false); push(m[1], true); last = rx.lastIndex; }
  push(m ? m.input.slice(last) : "", false);
  return out;
}

Page({
  data: {
    pack: fmt.pack, season: null,
    segs: [{ k: "piece", l: "棋子" }, { k: "bond", l: "羁绊" }, { k: "equip", l: "装备" }, { k: "aug", l: "心悟" }],
    seg: "piece", q: "", cost: 0, costs: [0, 1, 2, 3, 4, 5],
    // 心悟筛选:类型(战力/经济/专属)与品质(金/紫/蓝);品质没数据时整行不渲染
    augC: "all", augR: "all", hasRarity: false,
    augCats: [{ k: "all", l: "全部" }, { k: "战力", l: "战力" }, { k: "经济", l: "经济" }, { k: "专属", l: "专属" }],
    // 装备品阶筛选(六档 + 全部)
    equipC: "all",
    equipCats: [{ k: "all", l: "全部" }, { k: "白色", l: "白色" }, { k: "紫色", l: "紫色" }, { k: "独珍", l: "独珍" }, { k: "橙武", l: "橙武" }, { k: "转职书", l: "转职书" }, { k: "其他", l: "其他" }],
    augQuals: [{ k: "all", l: "全部" }, { k: "金", l: "金色" }, { k: "紫", l: "紫色" }, { k: "蓝", l: "蓝色" }],
    list: [], seasons: [], sheetOn: false,
  },
  onShow() {
    // 首页快捷入口(羁绊查询/装备查询)通过 storage 直达对应分段
    const seg = wx.getStorageSync("dex-seg");
    // seasons 供赛季抽屉用(与首页同源);odds/notes 是页底资料区
    const patch = { season: season.get(), seasons: season.list(), odds: fmt.data.odds, notes: fmt.data.notes.map(n => ({ date: n.date, nodes: noteNodes(n.html) })), hasRarity: Object.keys(AUG.RARITY).length > 0 };
    if (seg && seg !== this.data.seg) { patch.seg = seg; wx.removeStorageSync("dex-seg"); }
    this.setData(patch);
    this.renderList();
  },
  /* ---------- 赛季切换抽屉(与首页同款交互) ---------- */
  onSeasonTap() { this.setData({ sheetOn: true }); },
  onScrim() { this.setData({ sheetOn: false }); },
  onPickSeason(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ sheetOn: false });
    if (id !== season.get().id) {
      season.set(id);
      this.onShow(); // 统一走 onShow:补 season/odds/notes 并按新赛季重渲染四段列表
      wx.showToast({ title: `已切换至 ${id}`, icon: "none" });
    }
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
        .map(b => ({
          key: b.n, ch: b.n[0], n: b.n, lv: b.lv,
          // isColor 控制"✦彩色"徽标,color 必须是真实色值(布尔会拼出非法 CSS——外部评审#5)
          isColor: !!b.color,
          color: b.color ? fmt.pack.cost.colors[5] : fmt.pack.cost.colors[3],
          // 羁绊徽记经后端 /art/icon(色边界 trim+透明画布);S4 演示数据无 icon 字段 → 空串回退首字徽章
          // hex: 只有羁绊用六边形槽,装备/心悟走圆角方槽(2026-10-29 用户拍板)
          icon: b.icon ? api.iconUrl(b.icon, 96) : "", hex: true,
          desc: b.d,
        }));
    } else if (seg === "equip") {
      list = D.equips
        .filter(e => e.season === season.get().id)
        .filter(e => !q || e.n.indexOf(q) >= 0 || e.d.indexOf(q) >= 0)
        // 图标经 /art/icon(同羁绊链路);S4 演示数据无 icon 字段 → 空串回退首字徽章
        // 品阶来自元数据表,复用行内的 t 标签位展示
        .filter(e => this.data.equipC === "all" || (EQUIP.CAT[e.n] || "其他") === this.data.equipC)
        .map(e => ({ key: e.n, ch: e.n[0], n: e.n, r: e.r, rcls: fmt.rarCls(e.r), cat: EQUIP.CAT[e.n] || "", t: EQUIP.CAT[e.n] || "", icon: e.icon ? api.iconUrl(e.icon, 96) : "", desc: e.d }));
    } else {
      list = D.augments
        .filter(a => a.season === season.get().id)
        .filter(a => !q || a.n.indexOf(q) >= 0 || a.d.indexOf(q) >= 0)
        // 类型/品质来自元数据表(OCR 数据没有这两个字段);缺省按「战力」归类,品质缺省不显示
        .filter(a => this.data.augC === "all" || (AUG.CAT[a.n] || "战力") === this.data.augC)
        .filter(a => this.data.augR === "all" || (AUG.RARITY[a.n] || "") === this.data.augR)
        .map(a => ({
          key: a.n, ch: a.n[0], n: a.n,
          t: AUG.CAT[a.n] || "战力",
          qual: AUG.RARITY[a.n] || "",
          // 中文不能直接当类名,品质映射成 q-gold/q-purple/q-blue
          qualCls: AUG.RARITY[a.n] === "金" ? "q-gold" : AUG.RARITY[a.n] === "紫" ? "q-purple" : AUG.RARITY[a.n] === "蓝" ? "q-blue" : "",
          icon: a.icon ? api.iconUrl(a.icon, 96) : "",
          desc: a.d,
        }));
    }
    this.setData({ list });
  },
  onSeg(e) { this.setData({ seg: e.currentTarget.dataset.k }); this.renderList(); },
  onQ(e) { this.setData({ q: e.detail.value.trim() }); this.renderList(); },
  // 心悟筛选:类型/品质相互独立,和搜索词叠加
  onAugC(e) { this.setData({ augC: e.currentTarget.dataset.k }); this.renderList(); },
  onAugR(e) { this.setData({ augR: e.currentTarget.dataset.k }); this.renderList(); },
  onEquipC(e) { this.setData({ equipC: e.currentTarget.dataset.k }); this.renderList(); },
  onCost(e) { this.setData({ cost: +e.currentTarget.dataset.v }); this.renderList(); },
  onOpen(e) {
    const typeMap = { piece: "piece", bond: "bond", equip: "equip", aug: "augment" };
    wx.navigateTo({ url: `/pages/detail/detail?type=${typeMap[this.data.seg]}&name=${encodeURIComponent(e.currentTarget.dataset.key)}&season=${season.get().id}` });
  },
  // 立绘加载失败(图床未开/素材缺失)→ 回退印章字头像
  onArtErr(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ [`list[${idx}].art`]: "" });
  },
});
