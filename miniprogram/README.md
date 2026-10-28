# 逆水小助手 · 正式工程（miniprogram/）

> 依据 [原型总结](../docs/原型总结.md) + [选型总结](../docs/选型总结.md) + [执行计划](../docs/执行计划.md) 搭建。
> 架构：通用内核（core/）+ 游戏内容包（games/xq/）+ 数据驱动组件样式（app.wxss）。换游戏 = 换包，代码零改动。

## 如何跑起来（3 步）

1. 打开 **微信开发者工具**（stable 最新版）→ 导入项目 → 目录选本目录 `miniprogram/`，AppID 先用「测试号」（已配 `touristappid`，注册正式 AppID 后在 `project.config.json` 替换）。
2. 编译即可运行：5 个 Tab 全部可用（首页 / 阵容 / 摆棋 / 图鉴 / 我的），数据为内容包内置演示数据。
3. 真机预览：工具栏「预览」扫码。长按拖拽请真机体验（开发者工具用鼠标长按 300ms 也可模拟）。

## 目录

```
miniprogram/
├─ app.js / app.json / app.wxss     入口 + 5 Tab + 全局设计 Token（宣纸/墨字/古铜金/五阶费用色）
├─ core/                            通用内核（游戏无关，可单测、可跨项目复制）
│  ├─ season.js        赛季单例（get/set/list，storage 持久化）
│  ├─ bondEngine.js    羁绊推算：上阵棋子 → 层数/档位/下一档（规则全在数据里）
│  ├─ boardModel.js    棋盘模型：4×7 一维数组 + stars/items/mainC + 30 步撤销栈
│  ├─ store.js         用户数据（favs/sims/votes），键位与云集合同名，Phase1 切云只改这里
│  └─ format.js        数据表 → 视图模型（印章头像/星级/费用色）
├─ games/xq/                        侠棋内容包 ★ 换游戏只动这里
│  ├─ pack.js          术语字典/棋盘规格/费用色/筛选配置/赛季表/免责声明
│  └─ data/*.js        pieces/bonds/equips/augments/comps/odds/notes（schema 即云端集合模板，全带 season）
├─ pages/                           home · comps · sim(摆棋模拟器) · dex · me · detail(五类详情)
└─ cloudfunctions/                  Phase 1 接入（login/vote/data），见执行计划
```

## 已实现（Phase 0）

- 首页：赛季入口行（当前赛季/已归档徽标 + 切换弹层）、今日热荐卡、4 快捷入口、刷牌概率表、广告位、更新志（rich-text 渲染 `<b>` 强调）
- 阵容库：排序（强度/热度/口碑/最新）× 筛选（彩色羁绊/84/95，chips 可横滑）、赞踩一票制（本地）、详情（站位/羁绊/装备/心悟/运营/四列数据）+ ☆收藏 + 转发
- 摆棋：28 格蜂窝棋盘（84×95rpx，奇行错位不溢出）、点格选棋（搜索/费用 + **职业·羁绊双下拉面板**、已上阵绿框）、点棋子设置（主C 唯一开关/星级/装备三槽/棋子详解/移除）、长按 300ms 拖拽（幽灵棋子跟手/热区移除/格间换位/8px 阈值）、撤销/重置/示例、羁绊实时推算、保存到我的
- 图鉴四段 + 搜索 + 费用筛选 + 详情互跳（装备/心悟也按赛季过滤）；详情缺失兜底空态
- 我的：我的阵容（快照载回摆棋）/ 我的收藏，赛季入口行 + 两段滑块，全部赛季维度过滤
- 赛季切换弹层全局联动；广告位占位；免责声明

## 本地校验（无 Node 环境时）

```bash
python tools/check_syntax.py app.js core/*.js games/xq/pack.js games/xq/data/*.js pages/*/*.js pages/*/*.wxml
```

括号/字符串/标签平衡粗校验；最终以微信开发者工具编译结果为准。

## 下一步

见 [执行计划](../docs/执行计划.md)：Phase 1 云开发 → Phase 2 真实数据 → Phase 3 图标/分享卡片/提审。
