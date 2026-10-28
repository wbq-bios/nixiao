// 视图模型工具 · 把数据表整理成 WXML 友好结构（游戏无关）
const pack = require("../games/xq/pack.js");
const data = pack.data;

function pieceOf(name) {
  return data.pieces.find(p => p.n === name) || { n: name, c: 3, job: "", bonds: [], note: "" };
}
function costColor(name) { return pack.cost.colors[pieceOf(name).c] || pack.cost.colors[3]; }

// 品阶 → ASCII 类名(中文类名过不了 wxss 编译,样式见 app.wxss .rar.r-*)
const RAR_CLS = { "白": "r-bai", "紫": "r-zi", "独珍": "r-duzhen", "橙武": "r-chengwu" };
function rarCls(r) { return RAR_CLS[r] || ""; }

// 热度数字 → 展示串:3629000 → "362.9万",小于万原样
function wan(n) {
  n = +n || 0;
  return n >= 10000 ? (Math.round(n / 1000) / 10) + "万" : String(n);
}

/** 摆棋格/棋子格 vm：首字、颜色、星级星串、装备首字 */
function unitVM(u, opts) {
  const o = opts || {};
  const p = pieceOf(u.n);
  const star = o.star || 1;
  return {
    n: u.n, i: u.i, ch: u.n[0], color: pack.cost.colors[p.c],
    isMain: o.main === u.n && (o.mainIdx === undefined || o.mainIdx === u.i),
    stars: star >= 2 ? "★★★".slice(0, star) : "",
    star,
    items: (u.items || u.eq || []).filter(Boolean).map(it => ({ ch: it[0], name: it })),
  };
}
function compUnitsVM(c) {
  const mk = u => unitVM({ n: u[0], items: u[2] }, { main: c.main, star: u[1] });
  return { front: c.front.map(mk), back: c.back.map(mk) };
}
function traitVM(t) {
  return { n: t[0], count: t[1], color: !!t[2], ch: t[0][0] };
}
function compCardVM(c) {
  const uv = compUnitsVM(c);
  const net = (c.up || 0) - (c.down || 0);
  return Object.assign({}, c, {
    units: uv.front.concat(uv.back),
    tierBadge: c.tier, popCarry: `${c.pop}${c.carry}`,
    traitsVM: (c.traits || []).map(traitVM),
    up: c.up || 0, down: c.down || 0, net,
    heatWan: wan(c.heat),
    stripCols: Math.min(Math.max(uv.front.length + uv.back.length, 1), 10),  // 头像条列数=人数,消灭孤行
  });
}

module.exports = { pack, data, pieceOf, costColor, rarCls, wan, unitVM, compUnitsVM, compCardVM, traitVM };
