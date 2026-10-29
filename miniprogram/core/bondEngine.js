// 羁绊推算引擎 · 游戏无关（规则来自数据 tiers）
const pieceIndexOf = {};
function bindPieces(pieces) {
  pieces.forEach(p => { pieceIndexOf[p.n] = p; });
}
function pieceOf(name, pieces) {
  return pieceIndexOf[name] || (pieces || []).find(p => p.n === name) || null;
}

/**
 * @param {string[]} unitNames 上阵棋子名数组
 * @param {Array} bonds 羁绊表
 * @param {Array} pieces 棋子表
 * @returns [{bond, count, tier(已达层数,0=未激活), next(下一档或null), maxed}]
 */
function calc(unitNames, bonds, pieces) {
  bindPieces(pieces);
  const counts = {};
  unitNames.filter(Boolean).forEach(n => {
    const p = pieceOf(n, pieces);
    if (p) (p.bonds || []).forEach(b => { counts[b] = (counts[b] || 0) + 1; });
  });
  return bonds
    .map(b => {
      const count = counts[b.n] || 0;
      if (!count) return null;
      const tiers = String(b.lv).split("/").map(Number);
      const tier = tiers.filter(t => t <= count).length;
      const next = tiers.find(t => t > count) || null;
      return { bond: b, count, tier, next, maxed: !next };
    })
    .filter(Boolean)
    .sort((a, b2) => b2.count - a.count);
}

// 是否满羁绊:人数达到 lv 的最高档(用于"满羁绊才点亮彩色图标")
function isMaxed(bond, count) {
  const tiers = String((bond && bond.lv) || "").split("/").map(Number).filter(n => !isNaN(n));
  return tiers.length > 0 && count >= Math.max.apply(null, tiers);
}

module.exports = { calc, isMaxed, pieceOf };
