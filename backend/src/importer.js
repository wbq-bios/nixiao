// 确定性主键（幂等导入的唯一约束）+ 各表插入语句
// vals 只返回「业务列」的值（不含 _key/gameId/season，由 upsertValues 统一拼）
const SPEC = {
  pieces:     { cols: "n, doc",             vals: r => [r.n, JSON.stringify(r)],                                    key: (g, s, r) => `${g}:${s}:${r.n}` },
  bonds:      { cols: "n, doc",             vals: r => [r.n, JSON.stringify(r)],                                    key: (g, s, r) => `${g}:${s}:${r.n}` },
  equipments: { cols: "n, doc",             vals: r => [r.n, JSON.stringify(r)],                                    key: (g, s, r) => `${g}:${s}:${r.n}` },
  augments:   { cols: "n, doc",             vals: r => [r.n, JSON.stringify(r)],                                    key: (g, s, r) => `${g}:${s}:${r.n}` },
  // comps 首次导入从 doc 初始化赞踩计数（up/down 列）；重复导入不进 UPDATE 子句 → 不覆盖已攒的真实票数
  comps:      { cols: "n, tier, heat, up, down, doc",
                vals: r => [r.n, r.tier || "B", r.heat || 0, +r.up || 0, +r.down || 0, JSON.stringify(r)],
                key: (g, s, r) => `${g}:${s}:${r.n}` },
  odds:       { cols: "lvl, doc",           vals: r => [r.lvl, JSON.stringify(r)],                                  key: (g, s, r) => `${g}:${s}:${r.lvl}` },
  seasons:    { cols: "id, doc",            vals: r => [r.id, JSON.stringify(r)],                                   key: (g, _s, r) => `${g}:${r.id}`, noSeason: true },
  patch_notes:{ cols: "date, doc",          vals: r => [r.date, JSON.stringify(r)],                                 key: (g, _s, r) => `${g}:${r.date}`, noSeason: true },
};

function upsertSQL(table) {
  const spec = SPEC[table];
  if (!spec) throw new Error("unknown table: " + table);
  const placeholders = spec.cols.split(",").map(() => "?").join(", ");
  const seasonCols = spec.noSeason ? "" : "season, ";
  const seasonPh = spec.noSeason ? "" : "?, ";
  return `INSERT INTO ${table} (_key, gameId, ${seasonCols}${spec.cols}) VALUES (?, ?, ${seasonPh}${placeholders})
    ON DUPLICATE KEY UPDATE doc = VALUES(doc)${table === "comps" ? ", tier = VALUES(tier), heat = VALUES(heat)" : ""}`;
}

function upsertValues(table, gameId, season, row) {
  const spec = SPEC[table];
  if (!spec) throw new Error("unknown table: " + table);
  const full = [spec.key(gameId, season, row), gameId];
  if (!spec.noSeason) full.push(season);
  return full.concat(spec.vals(row));
}

async function importTable(db, table, gameId, season, rows) {
  const sql = upsertSQL(table);
  for (const row of rows) {
    // JSON 列在 prepare 协议下写入非 ASCII 会损坏，用文本协议 query()
    await db.query(sql, upsertValues(table, gameId, season, row));
  }
  return rows.length;
}

module.exports = { SPEC, importTable, upsertSQL, upsertValues };
