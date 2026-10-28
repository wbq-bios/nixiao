// 种子脚本：把 miniprogram/games/xq 演示数据导入 MySQL（幂等，可重复执行）
const path = require("path");
const db = require("../src/db");
const { importTable } = require("../src/importer");

const DATA_DIR = path.resolve(__dirname, "../../miniprogram/games/xq/data");
const pack = require(path.resolve(__dirname, "../../miniprogram/games/xq/pack.js"));

(async () => {
  const gameId = pack.gameId;
  const season = (pack.seasons.find(s => s.current) || pack.seasons[0]).id;
  console.log(`seed gameId=${gameId} 默认赛季=${season}（行自带 season 字段优先）`);

  // 内容包是多赛季并存（演示 S4 + OCR 真实 S3），按行自带的 season 分组导入
  const bySeason = rows => {
    const m = new Map();
    rows.forEach(r => {
      const s = r.season || season;
      if (!m.has(s)) m.set(s, []);
      m.get(s).push(r);
    });
    return m;
  };

  const counts = [];
  for (const [table, rows] of [
    ["pieces", pack.data.pieces], ["bonds", pack.data.bonds],
    ["equipments", pack.data.equips], ["augments", pack.data.augments],
    ["comps", pack.data.comps], ["odds", pack.data.odds],
    ["seasons", pack.seasons], ["patch_notes", pack.data.notes],
  ]) {
    for (const [s, grp] of bySeason(rows)) {
      counts.push([`${table}@${s}`, await importTable(db, table, gameId, s, grp)]);
    }
  }

  await db.execute(
    "INSERT INTO app_meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
    [`content_version:${gameId}`, String(Date.now())]);

  counts.forEach(([t, n]) => console.log(`  ${t}: ${n} rows`));
  console.log("done.");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
