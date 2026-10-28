# 逆水小助手 · MySQL 后端

> 架构：小程序（wx.request）→ 本服务（Express API）→ MySQL 8。
> 表结构对应 [后端设计](../docs/后端设计.md) 的 11 集合；内容 JSON 原文同构入库，演示数据即录入模板。

## 一键启动（二选一）

### A. 本机免安装模式（当前机器的实际方案，无需 Docker）

Node 20 与 MySQL 8.0.28 绿色版已放在 `C:\nixiao\`（node/、mysql/，数据目录 `C:\nixiao\mysqldata`），双击或命令行运行：

```cmd
backend\dev-start.cmd
```

脚本会：初始化数据目录（仅首次）→ 启动 mysqld → 建库建表 → npm install（npmmirror 镜像）→ 种子导入 → 启动 API。看到 `nixiao API listening on :3000` 即成功；Ctrl+C 停 API（mysqld 继续驻留，`taskkill /im mysqld.exe` 停库）。

> ⚠️ 项目路径含中文，**mysqld 必须从 `C:\nixiao\` 运行**（已就位），数据目录也在该盘。

### B. Docker 模式（装有 Docker Desktop 时）

```bash
cd backend
cp .env.example .env      # 改 DB_HOST=mysql（.env.example 即 docker 版配置）
docker compose up -d      # 起 MySQL + API，自动建表 + 种子导入
```

- MySQL 数据落在 Docker 卷 `mysql_data`（`docker compose down` 不丢，`down -v` 才清空）。
- 验证：浏览器开 `http://localhost:3000/api/content/xq?season=S4`，应返回整包 JSON。

## 数据存在哪

| 数据 | 位置 |
|---|---|
| 内容（棋子/羁绊/装备/心悟/阵容/概率/赛季/更新志） | MySQL `xiaqi` 库 8 张内容表（`doc` JSON 列，确定性 `_key` 幂等覆盖） |
| 用户（收藏/摆棋存档/投票） | 同库 3 张用户表（openid 维度） |
| 登录态 | HMAC token（openid 签名），客户端存 storage |
| **物理落盘** | 本机模式 = `C:\nixiao\mysqldata`；Docker 模式 = 卷 `mysql_data`；生产 = 云数据库实例 |

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | `{code?, deviceId}` → `{openid, token}`；未配 WX_SECRET 用 deviceId 模拟 |
| GET | `/api/content/:gameId?season=S4&version=` | 整包内容；version 相同只回 `{unchanged:true}` |
| GET/POST | `/api/user/favs` · `/api/user/favs/toggle` | 收藏读 / 切换 |
| GET/POST/DELETE | `/api/user/sims` · `/api/user/sims/:id` | 摆棋存档 |
| POST | `/api/vote` | 一票制（事务维护 comps.up/down） |
| POST | `/api/admin/import` | `{gameId, table, season, rows[]}`，头 `X-Admin-Token`；导入即刷新内容版本 |

## 手动导入 / 重新导入种子

```bash
docker compose exec api npm run seed     # 把 miniprogram/games/xq 演示数据再灌一遍（幂等）
# 或任意环境：node scripts/seed.js（.env 指向对应库）
```

## 小程序侧联调

1. 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」（因为 BASE 是 http://localhost:3000）。
2. 小程序 `utils/api.js` 顶部 `BASE`：开发期本机；上线改 https 域名。
3. 后端没启动时小程序自动离线（本地 storage 照常工作），启动后重进小程序自动补同步。

## 上线部署（两选一）

| 方案 | 前提 | 特点 |
|---|---|---|
| 云服务器（轻量/CVM）+ 域名 | 域名 ICP 备案、HTTPS 证书 | 传统路线，完全可控 |
| **微信云托管**（推荐） | 无需域名备案 | 把 backend/ 打成容器托管，小程序 `wx.cloud.callContainer` 直连，自带 MySQL；按量计费 |

> 生产安全项：更换 API_SECRET/ADMIN_TOKEN；配 WX_APPID/WX_SECRET 走真实 openid；云托管内网连 MySQL 不暴露 3306 公网。
