// UI 自动走查 · 连接开发者工具自动化端口,逐 Tab 截图 + 采集报错
// 用法:C:/nixiao/node/node.exe pipeline/e2e_ui.js
const path = require("path");
const automator = require(path.join(__dirname, "node_modules", "miniprogram-automator"));

const OUT = path.join(__dirname, "out");
const TABS = [
  ["home", "/pages/home/home"],
  ["comps", "/pages/comps/comps"],
  ["dex", "/pages/dex/dex"],
  ["me", "/pages/me/me"],
];
// 摆棋已非 tab 页,单独走 navigateTo
const SUBPAGES = [["sim", "/pages/sim/sim"]];
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const mini = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
  console.log("connected");
  const errors = [];
  mini.on("console", msg => {
    if (msg.type === "error" || msg.type === "warn") errors.push(`[${msg.type}] ${msg.args.join(" ")}`);
  });
  mini.on("exception", err => errors.push(`[exception] ${err.message}`));

  const sys = await mini.systemInfo();
  console.log("runtime:", sys.platform, sys.SDKVersion);

  for (const [name, route] of TABS) {
    await mini.switchTab(route);
    await sleep(1200);
    const page = await mini.currentPage();
    await mini.screenshot({ path: path.join(OUT, `ui_${name}.png`) });
    console.log(`tab ${name}: path=${page.path} ✓`);
  }
  for (const [name, route] of SUBPAGES) {
    await mini.navigateTo(route);
    await sleep(1200);
    const page = await mini.currentPage();
    await mini.screenshot({ path: path.join(OUT, `ui_${name}.png`) });
    console.log(`page ${name}: path=${page.path} ✓`);
    await mini.navigateBack();
    await sleep(600);
  }

  // 阵容详情:点第一张卡(卡片类名 .ccard;旧版是 .card)
  await mini.switchTab("/pages/comps/comps");
  await sleep(800);
  const cpage = await mini.currentPage();
  const card = await cpage.$(".ccard");
  if (card) {
    await card.tap();
    await sleep(1200);
    const page = await mini.currentPage();
    console.log("detail page:", page.path);
    await mini.screenshot({ path: path.join(OUT, "ui_detail.png") });
    await mini.navigateBack();
    await sleep(600);
  } else {
    errors.push("[comps] 页面上找不到 .ccard 元素");
  }

  // 首页:打开赛季弹层
  await mini.switchTab("/pages/home/home");
  await sleep(600);
  const hpage = await mini.currentPage();
  const bar = await hpage.$(".season-bar");
  if (bar) {
    await bar.tap();
    await sleep(900);
    await mini.screenshot({ path: path.join(OUT, "ui_season_sheet.png") });
    const scrim = await hpage.$(".scrim");
    if (scrim) { await scrim.tap(); await sleep(500); }
  }

  console.log("---- console 采集(错误/警告) ----");
  console.log(errors.length ? errors.slice(0, 30).join("\n") : "(无)");
  const fs = require("fs");
  fs.writeFileSync(path.join(OUT, "ui_errors.txt"), errors.join("\n"));
  await mini.disconnect();
  console.log("DONE");
  process.exit(0);
})().catch(e => { console.error("E2E FAIL:", e.message); process.exit(1); });
