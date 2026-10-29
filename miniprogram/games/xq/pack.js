// 游戏内容包 · 侠棋（换游戏 = 复制本目录改 pack 与 data，代码零改动）
// 只保留 S3 真实数据;早期 S4 演示数据(棋子/羁绊/装备/心悟/阵容)已清理
const odds = require("./data/odds.js");
const notes = require("./data/notes.js");
// S3 真实数据（OCR 提取+清洗，pipeline/s3_convert.py 生成）与演示数据按 season 并存
const s3Pieces = require("./data/s3_pieces.js");
const s3Bonds = require("./data/s3_bonds.js");
const s3Equips = require("./data/s3_equipments.js");
const s3Augments = require("./data/s3_augments.js");
// S3 真实阵容（提取自游戏内「阵容推荐」截图，人工校对层见 s3_comps.js 头注释）
const s3Comps = require("./data/s3_comps.js");

module.exports = {
  gameId: "xq",
  displayName: "逆水小助手",
  terms: {
    piece: "棋子", bond: "羁绊", equip: "装备", augment: "心悟",
    comp: "阵容", carry: "主C", population: "人口", season: "赛季",
    mySims: "我的阵容", myFavs: "我的收藏", saveMine: "保存到我的",
    emptyBoard: "棋盘尚虚", none: "未寻得此侠",
  },
  board: { rows: 4, cols: 7 },           // 金铲铲/云顶同规格，待官方数据修正
  cost: {
    levels: [1, 2, 3, 4, 5],
    colors: { 1: "#6E7680", 2: "#3F7D52", 3: "#2F6DA8", 4: "#7C50C8", 5: "#96700F" },
  },
  jobs: ["战士", "射手", "刺客", "谋士", "力士", "辅助"],
  compFilters: [
    { key: "all", label: "全部" },
    { key: "color", label: "彩色羁绊" },
    { key: "84", label: "84阵容" },
    { key: "95", label: "95阵容" },
  ],
  compSorts: [
    { key: "str", label: "强度" }, { key: "heat", label: "热度" },
    { key: "vote", label: "口碑" }, { key: "new", label: "最新" },
  ],
  seasons: [
    // S4 于 2026-10-30 开启；开启当日：S4 数据入库(OCR 管线)→ 清演示 S4 行(见 backend/sql/s4_launch.sql)
    // → 把下面 S4 条目取消注释并置 current:true、S3 改 archive → 重跑 seed
    // { id: "S4", name: "盈虚化象", range: "2026-10-30 至今", current: true },
    { id: "S3", name: "寒烽", range: "2025-09 至今", current: true },
    { id: "S2", name: "明星回归", range: "2025-05 ~ 2025-09", archive: true },
  ],
  data: {
    pieces: s3Pieces,
    bonds: s3Bonds,
    equips: s3Equips,
    augments: s3Augments,
    comps: s3Comps,
    odds, notes,
  },
  legal: "非官方工具 · 数据为演示 · 《逆水寒》及相关版权归网易所有",
};
