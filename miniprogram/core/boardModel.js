// 棋盘模型 · rows*cols 一维数组 + 附属数据 + 撤销栈（游戏无关）
const KEY = "xq-sim";
const ROWS = 4, COLS = 7, SIZE = ROWS * COLS;

function blank() {
  // name/notes:阵容标题与运营思路,随棋盘状态一起持久化(保存存档时写入记录)
  return { board: Array(SIZE).fill(null), stars: {}, items: {}, main: null, name: "", notes: "" };
}
function load() {
  try {
    const s = JSON.parse(wx.getStorageSync(KEY) || "null");
    if (s && Array.isArray(s.board)) {
      return {
        board: s.board.slice(0, SIZE).map(x => x || null).concat(Array(Math.max(0, SIZE - s.board.length)).fill(null)),
        stars: s.stars || {}, items: s.items || {}, main: s.main || null,
        // 边界:老存档无此两字段/类型异常时兜底空串并钳长度
        name: typeof s.name === "string" ? s.name.slice(0, 20) : "",
        notes: typeof s.notes === "string" ? s.notes.slice(0, 200) : "",
      };
    }
  } catch (e) { /* 忽略坏档 */ }
  return blank();
}
function save(state) { wx.setStorageSync(KEY, JSON.stringify(state)); }

// 撤销栈（会话级）
const undoStack = [];
function snapshot(state) {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 30) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return null;
  const s = JSON.parse(undoStack.pop());
  save(s);
  return s;
}
function canUndo() { return undoStack.length > 0; }

module.exports = { ROWS, COLS, SIZE, blank, load, save, snapshot, undo, canUndo };
