// 登录态：openid + HMAC token（客户端传 Authorization: Bearer <token>）
const crypto = require("crypto");

const SECRET = process.env.API_SECRET || "dev-secret";
const WX_APPID = process.env.WX_APPID || "";
const WX_SECRET = process.env.WX_SECRET || "";

function sign(openid) {
  const mac = crypto.createHmac("sha256", SECRET).update(openid).digest("base64url");
  return Buffer.from(openid).toString("base64url") + "." + mac;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [b64, mac] = token.split(".");
  if (!b64 || !mac) return null;
  let openid;
  try { openid = Buffer.from(b64, "base64url").toString(); } catch (e) { return null; }
  // openid 必须非空且形态可控（dev_ 前缀或微信格式），空串也能被 HMAC 签出合法 mac，必须显式拒绝
  if (!openid || openid.length > 64 || !/^[A-Za-z0-9_-]+$/.test(openid)) return null;
  // 恒时比较防逐字节试探 HMAC
  const expect = Buffer.from(crypto.createHmac("sha256", SECRET).update(openid).digest("base64url"));
  const got = Buffer.from(mac);
  return (got.length === expect.length && crypto.timingSafeEqual(got, expect)) ? openid : null;
}

// code 换 openid（未配置 WX_SECRET 时用 deviceId 模拟，仅限开发期）
async function codeToOpenid(code, deviceId) {
  if (WX_APPID && WX_SECRET && code) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;
    const res = await fetch(url).then(r => r.json());
    if (res.openid) return res.openid;
  }
  return "dev_" + String(deviceId || "anon").slice(0, 40);
}

// Express 中间件：解析 token，挂 req.openid；requireAuth 未登录则 401
function authMiddleware(req, _res, next) {
  const h = req.headers.authorization || "";
  req.openid = verify(h.replace(/^Bearer\s+/i, ""));
  next();
}
function requireAuth(req, res, next) {
  if (!req.openid) return res.status(401).json({ error: "未登录" });
  next();
}

module.exports = { sign, verify, codeToOpenid, authMiddleware, requireAuth };
