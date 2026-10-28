// 用户数据存储 · 本地为准 + 服务端同步（MySQL 后端，离线可离线）
// 键位 user_favs/user_sims/votes 与 MySQL 表同名映射；Phase1 云开发切库也只改此文件
const api = require("../utils/api.js");

const FAVS = "user_favs";   // [{n, season, sid?}]
const SIMS = "user_sims";   // [{sid?, name, board, stars, items, main, season}]
const VOTES = "votes";      // {compName: "up"|"down"}

function get(key, fallback) {
  try { return JSON.parse(wx.getStorageSync(key) || "null") ?? fallback; }
  catch (e) { return fallback; }
}
function set(key, val) { wx.setStorageSync(key, JSON.stringify(val)); }

/* ---------- 本地读写（页面同步调用，不变） ---------- */
function getFavs() { return get(FAVS, []); }
function setFavs(a) { set(FAVS, a); }
function toggleFav(name, season) {
  const f = getFavs();
  const i = f.findIndex(x => x.n === name);
  if (i >= 0) f.splice(i, 1); else f.push({ n: name, season });
  setFavs(f);
  if (api.online()) api.toggleFavRemote("xq", season, name).catch(() => {});
  return i < 0;
}

function getSims() { return get(SIMS, []); }
function setSims(a) { set(SIMS, a); }
function addSim(sim) {
  // 上限 50 条（与后端 SIMS_LIMIT 一致）：满了返回 false，由调用方提示先删
  const a = getSims();
  if (a.length >= 50) return false;
  a.push(sim);
  setSims(a);
  if (api.online()) {
    api.addSimRemote({ gameId: "xq", season: sim.season, name: sim.name, board: sim.board, stars: sim.stars, items: sim.items, main: sim.main })
      .then(res => {
        const arr = getSims();
        const mine = arr.find(x => x.name === sim.name);
        if (mine) { mine.sid = res.id; setSims(arr); }
      }).catch(() => {});
  }
  return true;
}
function removeSim(idx) {
  const a = getSims();
  const gone = a[idx];
  a.splice(idx, 1);
  setSims(a);
  if (gone && gone.sid && api.online()) api.delSimRemote(gone.sid).catch(() => {});
}

function getVotes() { return get(VOTES, {}); }
function getVote(name) { return get(VOTES, {})[name] || ""; }
function setVote(name, v) {
  const m = get(VOTES, {});
  m[name] = v;
  if (!v) delete m[name];
  set(VOTES, m);
  if (api.online()) api.vote("xq", "", name, v).catch(() => {});
}

/* ---------- 启动时双向同步（服务端 → 本地合并，静默失败） ---------- */
// 远端数据不信任：逐行验形态再合入，且钳总量防坏接口撑爆 storage
const LOCAL_FAVS_CAP = 500, LOCAL_SIMS_CAP = 200;
function pullRemote() {
  if (!api.online()) return;
  api.pullFavs().then(rows => {
    if (!Array.isArray(rows)) return; // 接口异常（代理 HTML 等）直接放弃本次合并
    const local = getFavs();
    rows.forEach(r => {
      if (!r || r.gameId !== "xq" || typeof r.name !== "string" || !r.name) return;
      if (!local.find(x => x.n === r.name) && local.length < LOCAL_FAVS_CAP) {
        local.push({ n: r.name, season: typeof r.season === "string" ? r.season : "" });
      }
    });
    setFavs(local);
  }).catch(() => {});
  api.pullSims().then(rows => {
    if (!Array.isArray(rows)) return;
    const local = getSims();
    rows.forEach(r => {
      // board 必为数组且不超 1024 格，name/season 为字符串才允许入库
      if (!r || r.gameId !== "xq" || typeof r.name !== "string" || !r.name || !Array.isArray(r.board) || r.board.length > 1024) return;
      if (!local.find(x => x.name === r.name) && local.length < LOCAL_SIMS_CAP) {
        local.push({
          sid: r.id, name: r.name,
          board: r.board, stars: r.stars || {}, items: r.items || {}, main: r.main || null,
          season: typeof r.season === "string" ? r.season : "",
        });
      }
    });
    setSims(local);
  }).catch(() => {});
}

module.exports = {
  FAVS, SIMS, VOTES,
  getFavs, setFavs, toggleFav,
  getSims, setSims, addSim, removeSim,
  getVotes, getVote, setVote,
  pullRemote,
};
