-- 逆水小助手 · MySQL 表结构（对应后端设计 11 集合 → 11 表 + users/app_meta）
-- 内容表统一模式：_key 确定性主键（幂等导入）+ doc JSON 原文同构存储
-- 用户表：openid 维度；votes 一票制用唯一约束保证
-- 2026-10-28 全表全字段注释（含 doc 字段字典）；改结构请同步本文件与 ALTER

CREATE TABLE IF NOT EXISTS pieces (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{棋子名} · 幂等导入唯一约束',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋（多游戏共库的分区维度）',
  season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4，与 doc.season 一致',
  n       VARCHAR(80)  NOT NULL COMMENT '棋子名（doc.n 冗余列，供检索）',
  doc     JSON         NOT NULL COMMENT '棋子完整数据 · {n:名 c:费用1-5 job:职业 bonds:[羁绊名] tags:[定位标签] skill:{n:技能名,d:技能描述} stats:{hp:气血 mp:内力 atk:攻击 def:防御 spd:攻速 crit:会心 cd:会伤,其余中文原键} art:立绘路径 src:源图名 review:[质检标记]}',
  PRIMARY KEY (_key),
  KEY idx_game_season (gameId, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='棋子表 · 数据源=OCR卡图提取+人工核对，五表数据字典见 docs/后端设计.md';

CREATE TABLE IF NOT EXISTS bonds (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{羁绊名}',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  n       VARCHAR(80)  NOT NULL COMMENT '羁绊名（doc.n 冗余列）',
  doc     JSON         NOT NULL COMMENT '羁绊完整数据 · {n:名 t:类型(势力/职业) lv:激活档位如"2/4/6/8" d:描述 effects:[{t:档位数字或max,e:该档效果}] icon:图标路径 color:彩色标记(人工定) review:[质检标记]}',
  PRIMARY KEY (_key),
  KEY idx_game_season (gameId, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='羁绊表 · t=职业(战士/射手等)或势力；羁绊推算引擎按 lv 档位计算';

CREATE TABLE IF NOT EXISTS equipments (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{装备名}',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  n       VARCHAR(80)  NOT NULL COMMENT '装备名（doc.n 冗余列）',
  doc     JSON         NOT NULL COMMENT '装备完整数据 · {n:名 d:词条效果 icon:图标路径}(该游戏无品阶r/推荐佩戴who字段)',
  PRIMARY KEY (_key),
  KEY idx_game_season (gameId, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='装备表 · 该游戏装备无品阶/推荐佩戴字段(2026-10-28 用户确认)，仅名称+词条+图标';

CREATE TABLE IF NOT EXISTS augments (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{心悟名}',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  n       VARCHAR(80)  NOT NULL COMMENT '心悟名（doc.n 冗余列）',
  doc     JSON         NOT NULL COMMENT '心悟(强化)完整数据 · {n:名 d:效果描述 icon:图标路径 sc:社区评分}(类型t字段暂不需要,2026-10-28 用户确认)',
  PRIMARY KEY (_key),
  KEY idx_game_season (gameId, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='心悟(强化)表 · 类型 t 为启发式分类，专属类建议人工复核';

CREATE TABLE IF NOT EXISTS comps (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{阵容名}',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 赞踩计数按赛季隔离',
  n       VARCHAR(120) NOT NULL COMMENT '阵容名（doc.n 冗余列）',
  tier    VARCHAR(4)   NOT NULL DEFAULT 'B' COMMENT '强度等级 S/A/B（列表「强度」排序用）',
  heat    INT          NOT NULL DEFAULT 0 COMMENT '热度 0-100（列表「热度」排序用）',
  up      INT          NOT NULL DEFAULT 0 COMMENT '赞数 · vote 云函数事务维护，勿手改',
  down    INT          NOT NULL DEFAULT 0 COMMENT '踩数 · vote 云函数事务维护，勿手改',
  doc     JSON         NOT NULL COMMENT '阵容完整数据(人工攻略) · {n:名 tier pop:人口 carry:主C费用 colorBond:彩色羁绊 main:主C名 style:[标签] traits:[[羁绊,层数,彩色]] front/back:[[棋子,星级,[装备]]] stats:{avg:均排名 pick:出场 top1:登顶 top4:前四} eq:[[棋子,装备,理由]] aug:[[心悟,理由]] beats:[[节点,运营]] tip:对局提示}',
  PRIMARY KEY (_key),
  KEY idx_game_season (gameId, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='阵容推荐表 · 产品核心内容，纯人工整理（OCR 不可提取），S3/S4 真实阵容待录';

CREATE TABLE IF NOT EXISTS odds (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{等级}',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  lvl     VARCHAR(10)  NOT NULL COMMENT '棋手等级 · 中文数字 伍/陆/柒/捌/玖',
  doc     JSON         NOT NULL COMMENT '该等级各费用刷牌概率 · {lvl:等级 p:[1费,2费,3费,4费,5费] 概率串,"—"表示不可能}',
  PRIMARY KEY (_key),
  KEY idx_game_season (gameId, season)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷牌概率表 · 数值来自官方公告（人工录入）';

CREATE TABLE IF NOT EXISTS seasons (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{赛季ID} · 无赛季维度（本表即赛季清单）',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  id      VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S2/S3/S4',
  doc     JSON         NOT NULL COMMENT '赛季信息 · {id:赛季ID name:名称 range:时间区间 current:1=当前赛季 archive:1=归档}',
  PRIMARY KEY (_key),
  KEY idx_game (gameId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='赛季表 · 全站赛季贯穿的唯一事实源；切换赛季=admin.switchSeason 改 current';

CREATE TABLE IF NOT EXISTS patch_notes (
  _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{日期}',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  date    VARCHAR(20)  NOT NULL COMMENT '日期 · YYYY-MM 或 YYYY-MM-DD',
  doc     JSON         NOT NULL COMMENT '更新志条目 · {date:日期 html:富文本片段(仅支持<b>强调)}',
  PRIMARY KEY (_key),
  KEY idx_game (gameId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='更新志 · 首页时间线数据源（不分赛季）';

-- 用户数据（openid 由服务端登录态给出）
CREATE TABLE IF NOT EXISTS users (
  openid     VARCHAR(64)  NOT NULL COMMENT '微信openid · 未配WX_SECRET时为 dev_{deviceId} 模拟',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次登录时间',
  PRIMARY KEY (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='注册用户表 · 登录即建档，仅记录身份';

CREATE TABLE IF NOT EXISTS user_favs (
  openid  VARCHAR(64)  NOT NULL COMMENT '用户openid',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '收藏时的赛季（我的页按赛季过滤）',
  name    VARCHAR(120) NOT NULL COMMENT '被收藏的阵容名',
  created_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  PRIMARY KEY (openid, gameId, name),
  KEY idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='我的收藏 · 收藏的官方推荐阵容；toggle=有则删无则建';

CREATE TABLE IF NOT EXISTS user_sims (
  id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '存档自增ID · 删除/同步回传用',
  openid     VARCHAR(64)  NOT NULL COMMENT '用户openid',
  gameId     VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season     VARCHAR(20)  NOT NULL COMMENT '保存时的赛季（棋盘数据归属该赛季）',
  name       VARCHAR(120) NOT NULL COMMENT '存档名 · 默认"推演 · M-D hh:mm"',
  board      JSON         NOT NULL COMMENT '棋盘快照 · rows*cols 一维数组(4x7=28格),null=空格,值为棋子名',
  stars      JSON         COMMENT '星级映射 · {格下标:1-3}',
  items      JSON         COMMENT '装备映射 · {格下标:[装备名,至多3]}',
  main       VARCHAR(80)  COMMENT '主C棋子名 · 全局唯一',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='我的阵容 · 摆棋模拟器的棋盘快照存档（每用户每游戏上限50条）';

CREATE TABLE IF NOT EXISTS votes (
  openid  VARCHAR(64)  NOT NULL COMMENT '用户openid · 一人一票的唯一维度',
  gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  season  VARCHAR(20)  NOT NULL COMMENT '投票时的赛季（仅记录，计数归 comps 表）',
  comp    VARCHAR(120) NOT NULL COMMENT '被投票的阵容名',
  value   ENUM('up','down') NOT NULL COMMENT '票向 · 赞/踩；取消=删行',
  updated_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近改票时间（3秒频控参考）',
  PRIMARY KEY (openid, gameId, comp),
  KEY idx_comp (gameId, season, comp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='阵容赞踩 · 一票制；本表是投票事实，comps.up/down 是事务维护的计数冗余';

-- 元信息（内容版本号等）
CREATE TABLE IF NOT EXISTS app_meta (
  k VARCHAR(80) NOT NULL COMMENT '元信息键 · 如 content_version:{gameId}',
  v VARCHAR(255) NOT NULL COMMENT '元信息值 · 版本号为毫秒时间戳，每次导入自动刷新',
  PRIMARY KEY (k)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='运行时元信息 · content 接口版本短路的依据（热更新不发版）';
