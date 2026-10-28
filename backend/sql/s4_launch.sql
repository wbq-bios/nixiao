-- S4 赛季上线脚本（2026-10-30 开赛当日执行）
-- 背景：演示数据曾占用 season='S4' 标签；真实 S4 数据入库前必须先清掉，否则假数据会随 S4 赛季亮相
-- 用法：mysql --default-character-set=utf8mb4 --database=xiaqi < s4_launch.sql（在真实 S4 数据导入之前跑）

-- 1) 清除全部演示 S4 内容行（真实 S4 数据尚未入库，删完 S4 赛季内容为空是预期状态）
DELETE FROM pieces     WHERE gameId = 'xq' AND season = 'S4';
DELETE FROM bonds      WHERE gameId = 'xq' AND season = 'S4';
DELETE FROM equipments WHERE gameId = 'xq' AND season = 'S4';
DELETE FROM augments   WHERE gameId = 'xq' AND season = 'S4';
DELETE FROM comps      WHERE gameId = 'xq' AND season = 'S4';
DELETE FROM odds       WHERE gameId = 'xq' AND season = 'S4';

-- 2) 随后执行（顺序勿反）：
--    a. miniprogram/games/xq/pack.js 取消 S4 条目注释（current:true），S3 条目改 archive:true
--    b. S4 真实数据入库：OCR 批次 → pipeline/s3_convert.py（SEASON 改 'S4'，BOND_FIX/overrides 复核）→ npm run seed
--    c. seed 会重写 seasons 表并刷新 content_version —— 客户端下次启动自动切到 S4

-- 3) 验证：
--    SELECT season, COUNT(*) FROM pieces GROUP BY season;   -- 应只见 S3(60) 与 S4(新数据)
--    curl "http://localhost:3000/api/content/xq?season=S4"  -- 返回真实 S4 整包
