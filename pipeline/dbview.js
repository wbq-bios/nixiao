// 只读数据库浏览器 · node pipeline/dbview.js → http://localhost:3001
// 复用 backend 的 express + mysql2 连接池；仅 SELECT，白名单表名，开发期自查用
const path = require("path");
const express = require(path.resolve(__dirname, "../backend/node_modules/express"));
const db = require(path.resolve(__dirname, "../backend/src/db"));

const app = express();
app.use(express.json());

let tableCache = null;
async function tables() {
  if (tableCache) return tableCache;
  const [rows] = await db.query(
    `SELECT table_name AS t, table_rows AS n
       FROM information_schema.tables
      WHERE table_schema = DATABASE() ORDER BY table_name`);
  tableCache = rows.map(r => ({ t: r.t || r.TABLE_NAME, n: r.n }));
  return tableCache;
}
async function validTable(name) {
  const list = await tables();
  return list.find(x => x.t === name) ? name : null;
}

app.get("/api/tables", async (_req, res) => {
  try { res.json(await tables()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/rows", async (req, res) => {
  const t = await validTable(String(req.query.table || ""));
  if (!t) return res.status(400).json({ error: "unknown table" });
  const page = Math.max(1, +req.query.page || 1);
  const size = Math.min(200, +req.query.size || 50);
  const q = String(req.query.q || "").trim();
  try {
    const where = q ? "WHERE doc LIKE ? OR CONCAT(_key, IFNULL(season,'')) LIKE ?" : "";
    const args = q ? [`%${q}%`, `%${q}%`] : [];
    const [[{ total }]] = await db.query(`SELECT COUNT(*) total FROM \`${t}\` ${where}`, args);
    const [rows] = await db.query(
      `SELECT * FROM \`${t}\` ${where} ORDER BY _key LIMIT ? OFFSET ?`,
      args.concat([size, (page - 1) * size]));
    res.json({ total, page, size, rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>逆水小助手 · 数据库</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#F3EFE6;color:#26221A}
  header{padding:14px 22px;background:#FBF9F3;border-bottom:1px solid rgba(38,34,28,.12);display:flex;gap:18px;align-items:baseline;position:sticky;top:0}
  header b{font-size:17px;letter-spacing:.05em}
  header span{color:#6E6555;font-size:12px}
  main{display:flex;min-height:calc(100vh - 54px)}
  nav{width:190px;flex:none;background:#FBF9F3;border-right:1px solid rgba(38,34,28,.09);padding:12px 8px;overflow:auto}
  nav button{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;border:0;background:none;padding:9px 12px;border-radius:10px;cursor:pointer;color:#5C554A;font-size:13px}
  nav button.on{background:rgba(169,134,67,.14);color:#8F6F2F;font-weight:650}
  nav .n{color:#A89F8D;font-size:11px}
  section{flex:1;padding:16px 22px;min-width:0}
  .bar{display:flex;gap:10px;margin-bottom:12px;align-items:center}
  input{flex:none;width:280px;padding:8px 12px;border:1px solid rgba(38,34,28,.2);border-radius:10px;background:#FFFDF8;font-size:13px}
  .meta{color:#8A8375;font-size:12px;margin-left:auto}
  table{border-collapse:collapse;width:100%;background:#FFFDF8;border:1px solid rgba(38,34,28,.1);border-radius:12px;overflow:hidden}
  th{background:#EFE9DA;text-align:left;padding:8px 10px;font-size:12px;color:#6B5426;white-space:nowrap;position:sticky;top:54px}
  td{padding:7px 10px;border-top:1px solid rgba(38,34,28,.07);font-size:12.5px;vertical-align:top}
  td.doc{max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5C554A}
  tr:hover td{background:rgba(169,134,67,.05)}
  .pager{margin-top:12px;display:flex;gap:8px;align-items:center;color:#6E6555;font-size:13px}
  .pager button{padding:6px 14px;border:1px solid rgba(38,34,28,.2);border-radius:9px;background:#FBF9F3;cursor:pointer;color:#5C554A}
  .pager button:disabled{opacity:.4;cursor:default}
  .empty{padding:40px;color:#A89F8D;text-align:center}
</style></head><body>
<header><b>逆水小助手 · MySQL 只读浏览器</b><span>xiaqi@127.0.0.1:3306 · 刷新数据请重启本进程</span></header>
<main>
  <nav id="nav"></nav>
  <section>
    <div class="bar">
      <input id="q" placeholder="搜索 doc 内容 / _key / season…">
      <div class="meta" id="meta"></div>
    </div>
    <div id="out"><div class="empty">左侧选一张表</div></div>
    <div class="pager" id="pager" style="display:none">
      <button id="prev">上一页</button><span id="pinfo"></span><button id="next">下一页</button>
    </div>
  </section>
</main>
<script>
let cur = "", page = 1, q = "";
async function loadTables(){
  const list = await (await fetch("/api/tables")).json();
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  for (const {t, n} of list) {
    const b = document.createElement("button");
    b.innerHTML = t + ' <span class="n">' + (n ?? "") + "</span>";
    b.onclick = () => { cur = t; page = 1;
      nav.querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on"); load(); };
    nav.appendChild(b);
  }
}
async function load(){
  if (!cur) return;
  const url = "/api/rows?table=" + encodeURIComponent(cur) + "&page=" + page + "&q=" + encodeURIComponent(q);
  const d = await (await fetch(url)).json();
  if (d.error) { document.getElementById("out").innerHTML = '<div class="empty">' + d.error + "</div>"; return; }
  document.getElementById("meta").textContent = "共 " + d.total + " 行";
  if (!d.rows.length) { document.getElementById("out").innerHTML = '<div class="empty">没有匹配的行</div>'; return; }
  const cols = Object.keys(d.rows[0]);
  let h = "<table><tr>" + cols.map(c => "<th>" + c + "</th>").join("") + "</tr>";
  for (const r of d.rows) {
    h += "<tr>" + cols.map(c => {
      let v = r[c]; if (v == null) v = "";
      if (typeof v === "object") v = JSON.stringify(v);
      v = String(v);
      return c === "doc" ? '<td class="doc" title="' + v.replace(/"/g,"&quot;") + '">' + v + "</td>" : "<td>" + v + "</td>";
    }).join("") + "</tr>";
  }
  document.getElementById("out").innerHTML = h + "</table>";
  const pg = document.getElementById("pager"); pg.style.display = "flex";
  document.getElementById("pinfo").textContent = (page) + " / " + Math.max(1, Math.ceil(d.total / d.size));
  document.getElementById("prev").disabled = page <= 1;
  document.getElementById("next").disabled = page >= Math.ceil(d.total / d.size);
}
document.getElementById("prev").onclick = () => { page--; load(); };
document.getElementById("next").onclick = () => { page++; load(); };
let timer;
document.getElementById("q").oninput = e => { clearTimeout(timer);
  timer = setTimeout(() => { q = e.target.value.trim(); page = 1; load(); }, 300); };
loadTables();
</script></body></html>`);
});

const PORT = process.env.DBVIEW_PORT || 3001;
app.listen(PORT, () => console.log(`dbview (read-only) → http://localhost:${PORT}`));
