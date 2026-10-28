// 零依赖 .env 加载（backend/.env → process.env，已存在的环境变量不覆盖）
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
