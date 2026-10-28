// 逆水小助手 API 服务 · Express + MySQL
// 边界处理约定（AGENTS.md 强约束二）：不信任客户端 —— body 逐字段校验、
// 鉴权先行、条数上限、频控、统一 try-catch 返回 {error}（Node20 未捕获拒绝会崩进程）
require("./env.js");

const express = require("express");
const cors = require("cors");
const db = require("./db");
const { authMiddleware, requireAuth, sign, codeToOpenid } = require("./auth");
const { SPEC } = require("./importer");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(authMiddleware);

// 立绘/图标图床(开发期本机直出 OCR 素材目录;上线改为云存储,见后端设计版权注记)
const path = require("path");
const ART_ROOT = process.env.ART_DIR || "D:/AIPro/工具/orc识别数据/归档/S3赛季/提取结果";
app.use("/art", express.static(ART_ROOT, { maxAge: "7d" }));
// 缩略图:/art/thumb/<宽>/红框/xx/立绘.png → 磁盘缓存(首页一屏几十张图,原图 1-2MB/张会拖死加载)
const fs = require("fs");
const CACHE_DIR = path.join(ART_ROOT, ".thumbs");
app.get("/art/thumb/:w/*", async (req, res) => {
  try {
    const width = Math.min(Math.max(+req.params.w || 180, 40), 600);
    const rel = req.params[0] || "";
    const src = path.join(ART_ROOT, rel);
    if (!fs.existsSync(src)) return res.status(404).json({ error: "not_found" });
    const cacheFile = path.join(CACHE_DIR, `w${width}_${rel.replace(/[\\/]/g, "_")}.jpg`);
    if (!fs.existsSync(cacheFile)) {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      await require("sharp")(src).rotate().resize({ width }).jpeg({ quality: 78 }).toFile(cacheFile);
    }
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.sendFile(cacheFile);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- 校验工具（服务端不信任任何客户端输入） ---------- */
// 字符串校验：返回裁剪后的合法值，非法返回 null
function vstr(v, max) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
}
function bad(res, msg) { return res.status(400).json({ error: msg }); }

// 上限约定（与 docs/后端设计.md §6 一致）
const SIMS_LIMIT = 50;      // 每用户每游戏摆棋存档上限
const FAVS_LIMIT = 500;     // 每用户每游戏收藏上限
const IMPORT_LIMIT = 5000;  // 单次 admin 导入行数上限
const GAMEID_RE = /^[a-zA-Z0-9_-]{1,40}$/;  // gameId 进主键，字符集必须可控

/* ---------- auth ---------- */
app.post("/api/auth/login", async (req, res) => {
  try {
    // code/deviceId 可选给；deviceId 只进 openid 拼串，钳长度防超长主键
    const code = typeof req.body.code === "string" ? req.body.code.slice(0, 256) : "";
    const deviceId = typeof req.body.deviceId === "string" ? req.body.deviceId.slice(0, 64) : "";
    const openid = await codeToOpenid(code, deviceId);
    await db.execute("INSERT IGNORE INTO users (openid) VALUES (?)", [openid]);
    res.json({ openid, token: sign(openid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- content（客户端只读，版本号短路） ---------- */
app.get("/api/content/:gameId", async (req, res) => {
  try {
    const gameId = GAMEID_RE.test(req.params.gameId || "") ? req.params.gameId : null;
    if (!gameId) return bad(res, "bad gameId");
    const season = typeof req.query.season === "string" ? req.query.season.slice(0, 20) : "";
    const version = typeof req.query.version === "string" ? req.query.version.slice(0, 32) : "";
    const [meta] = await db.execute("SELECT v FROM app_meta WHERE k = ?", [`content_version:${gameId}`]);
    const ver = meta.length ? meta[0].v : "0";
    if (version && version === ver) return res.json({ version: ver, unchanged: true });
    const one = async (sql, args) => (await db.execute(sql, args))[0].map(r => r.doc);
    const tables = ["pieces", "bonds", "equipments", "augments", "comps", "odds"]; // 表名白名单，非拼接输入
    const data = { version: ver, seasons: [], patch_notes: [] };
    for (const t of tables) {
      data[t] = season
        ? await one(`SELECT doc FROM ${t} WHERE gameId = ? AND season = ?`, [gameId, season])
        : await one(`SELECT doc FROM ${t} WHERE gameId = ?`, [gameId]);
    }
    data.seasons = await one("SELECT doc FROM seasons WHERE gameId = ?", [gameId]);
    data.patch_notes = await one("SELECT doc FROM patch_notes WHERE gameId = ?", [gameId]);
    // comps 附上赞踩计数
    const [counts] = await db.execute("SELECT n, up, down FROM comps WHERE gameId = ?", [gameId]);
    const cmap = Object.fromEntries(counts.map(r => [r.n, { up: r.up, down: r.down }]));
    data.comps = data.comps.map(c => Object.assign({}, c, cmap[c.n] || {}));
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- user（收藏 / 摆棋存档） ---------- */
app.get("/api/user/favs", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT gameId, season, name FROM user_favs WHERE openid = ?", [req.openid]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/user/favs/toggle", requireAuth, async (req, res) => {
  try {
    const gameId = vstr(req.body.gameId, 40), season = vstr(req.body.season, 20), name = vstr(req.body.name, 120);
    if (!gameId || !season || !name) return bad(res, "bad params");
    const [old] = await db.execute("SELECT name FROM user_favs WHERE openid = ? AND gameId = ? AND name = ?", [req.openid, gameId, name]);
    if (old.length) {
      await db.execute("DELETE FROM user_favs WHERE openid = ? AND gameId = ? AND name = ?", [req.openid, gameId, name]);
      return res.json({ fav: false });
    }
    // 收藏数上限：防无限写入
    const [[{ c }]] = await db.execute("SELECT COUNT(*) c FROM user_favs WHERE openid = ? AND gameId = ?", [req.openid, gameId]);
    if (c >= FAVS_LIMIT) return res.status(400).json({ error: "limit" });
    await db.execute("INSERT INTO user_favs (openid, gameId, season, name) VALUES (?, ?, ?, ?)", [req.openid, gameId, season, name]);
    res.json({ fav: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/user/sims", requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, gameId, season, name, board, stars, items, main FROM user_sims WHERE openid = ? ORDER BY id DESC", [req.openid]);
    const safe = v => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch (e) { return null; } };
    res.json(rows.map(r => ({
      id: r.id, gameId: r.gameId, season: r.season, name: r.name,
      board: safe(r.board) || [], stars: safe(r.stars) || {},
      items: safe(r.items) || {}, main: r.main,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/user/sims", requireAuth, async (req, res) => {
  try {
    const gameId = vstr(req.body.gameId, 40), season = vstr(req.body.season, 20), name = vstr(req.body.name, 120);
    const { board, stars, items, main } = req.body;
    if (!gameId || !season || !name) return bad(res, "bad params");
    // 棋盘快照结构校验：board 必为数组（≤1024 格），元素只能是棋子名或 null
    if (!Array.isArray(board) || board.length > 1024 ||
        board.some(x => x !== null && typeof x !== "undefined" && (typeof x !== "string" || x.length > 80))) {
      return bad(res, "bad board");
    }
    const isMap = o => o === undefined || o === null || (typeof o === "object" && !Array.isArray(o));
    if (!isMap(stars) || !isMap(items)) return bad(res, "bad stars/items");
    // 条数上限：每用户每游戏 50 条
    const [[{ c }]] = await db.execute("SELECT COUNT(*) c FROM user_sims WHERE openid = ? AND gameId = ?", [req.openid, gameId]);
    if (c >= SIMS_LIMIT) return res.status(400).json({ error: "limit" });
    const [r] = await db.query(
      "INSERT INTO user_sims (openid, gameId, season, name, board, stars, items, main) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [req.openid, gameId, season, name, JSON.stringify(board.map(x => x || null)), JSON.stringify(stars || {}), JSON.stringify(items || {}), vstr(main, 80)]);
    res.json({ id: r.insertId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/user/sims/:id", requireAuth, async (req, res) => {
  try {
    if (!/^\d{1,12}$/.test(req.params.id || "")) return bad(res, "bad id"); // 仅数字，防怪参数
    await db.query("DELETE FROM user_sims WHERE id = ? AND openid = ?", [req.params.id, req.openid]); // openid 在 WHERE = 属主校验
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------- vote（一票制，事务维护 comps 计数） ---------- */
const lastVoteAt = new Map(); // openid -> 上次投票时间戳（进程内 3 秒频控）
app.post("/api/vote", requireAuth, async (req, res) => {
  const now = Date.now();
  if (now - (lastVoteAt.get(req.openid) || 0) < 3000) {
    return res.status(429).json({ error: "too_fast" }); // 防手抖连点与脚本刷票
  }
  const gameId = vstr(req.body.gameId, 40), season = vstr(req.body.season, 20), comp = vstr(req.body.comp, 120);
  const want = req.body.value; // "up" | "down" | ""(取消)
  if (!gameId || !season || !comp) return bad(res, "bad params");
  if (want !== "up" && want !== "down" && want !== "") return bad(res, "bad value");
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // 阵容必须存在于该赛季，否则计数无意义（返回 no_comp 而非静默 0 行）
    const [target] = await conn.execute("SELECT n FROM comps WHERE gameId = ? AND season = ? AND n = ?", [gameId, season, comp]);
    if (!target.length) { await conn.rollback(); return res.status(400).json({ error: "no_comp" }); }
    const [old] = await conn.execute("SELECT value FROM votes WHERE openid = ? AND gameId = ? AND comp = ?", [req.openid, gameId, comp]);
    const prev = old.length ? old[0].value : "";
    if (prev !== want) {
      if (prev) await conn.execute("DELETE FROM votes WHERE openid = ? AND gameId = ? AND comp = ?", [req.openid, gameId, comp]);
      if (want) await conn.execute("INSERT INTO votes (openid, gameId, season, comp, value) VALUES (?, ?, ?, ?, ?)", [req.openid, gameId, season, comp, want]);
      const dUp = (want === "up" ? 1 : 0) - (prev === "up" ? 1 : 0);
      const dDown = (want === "down" ? 1 : 0) - (prev === "down" ? 1 : 0);
      // WHERE 带 season：同名阵容跨赛季各自计数，防止双计
      await conn.execute("UPDATE comps SET up = up + ?, down = down + ? WHERE gameId = ? AND season = ? AND n = ?", [dUp, dDown, gameId, season, comp]);
      lastVoteAt.set(req.openid, now); // 仅在真实改票后刷新频控
    }
    await conn.commit();
    const [cur] = await conn.execute("SELECT up, down FROM comps WHERE gameId = ? AND season = ? AND n = ?", [gameId, season, comp]);
    res.json({ my: want, up: cur.length ? cur[0].up : 0, down: cur.length ? cur[0].down : 0 });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

/* ---------- admin（内容导入，X-Admin-Token 鉴权） ---------- */
app.post("/api/admin/import", async (req, res) => {
  if (req.headers["x-admin-token"] !== (process.env.ADMIN_TOKEN || "change-me-admin-token")) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const { gameId, table, season, rows } = req.body;
    if (!GAMEID_RE.test(gameId || "")) return bad(res, "bad gameId");
    if (!SPEC[table]) return bad(res, "unknown table"); // 表名白名单（SPEC 决定列结构）
    if (!vstr(season, 20) && !SPEC[table].noSeason) return bad(res, "bad season");
    if (!Array.isArray(rows) || !rows.length || rows.length > IMPORT_LIMIT) return bad(res, "bad rows");
    const count = await importTableSafe(table, gameId, season, rows);
    await db.execute(
      "INSERT INTO app_meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
      [`content_version:${gameId}`, String(Date.now())]);
    res.json({ imported: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// 逐行兜底：单行坏数据跳过并计数，不让一条脏行导致整批 500
async function importTableSafe(table, gameId, season, rows) {
  const { importTable } = require("./importer");
  const okRows = rows.filter(r => r && typeof r === "object" && vstr(r.n || r.lvl || r.id || r.date, 120));
  if (!okRows.length) throw new Error("no valid rows");
  return importTable(db, table, gameId, season, okRows);
}

/* ---------- 兜底 ---------- */
app.use((_req, res) => res.status(404).json({ error: "not_found" }));
app.use((err, _req, res, _next) => { // body 解析失败等同步错误统一出口
  res.status(err.status || 500).json({ error: err.message || "server_error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`nixiao API listening on :${PORT}`));
