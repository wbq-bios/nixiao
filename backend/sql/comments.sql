-- 一次性：为 xiaqi 库全部表/字段补注释（列定义与 schema.sql 完全一致，仅加 COMMENT）
ALTER TABLE pieces
  COMMENT='棋子表 · 数据源=OCR卡图提取+人工核对，五表数据字典见 docs/后端设计.md',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{棋子名} · 幂等导入唯一约束',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋（多游戏共库的分区维度）',
  MODIFY season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4，与 doc.season 一致',
  MODIFY n       VARCHAR(80)  NOT NULL COMMENT '棋子名（doc.n 冗余列，供检索）',
  MODIFY doc     JSON         NOT NULL COMMENT '棋子完整数据 · {n:名 c:费用1-5 job:职业 bonds:[羁绊名] tags:[定位标签] skill:{n:技能名,d:描述} stats:{hp:气血 mp:内力 atk:攻击 def:防御 spd:攻速 crit:会心 cd:会伤} art:立绘路径 src:源图 review:[质检标记]}';

ALTER TABLE bonds
  COMMENT='羁绊表 · t=职业(战士/射手等)或势力；羁绊推算引擎按 lv 档位计算',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{羁绊名}',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  MODIFY n       VARCHAR(80)  NOT NULL COMMENT '羁绊名（doc.n 冗余列）',
  MODIFY doc     JSON         NOT NULL COMMENT '羁绊完整数据 · {n:名 t:类型(势力/职业) lv:档位如"2/4/6/8" d:描述 effects:[{t:档位或max,e:效果}] icon:图标 color:彩色标记(人工定) review:[质检标记]}';

ALTER TABLE equipments
  COMMENT='装备表 · 品阶与推荐佩戴待人工补全（见 review 标记）',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{装备名}',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  MODIFY n       VARCHAR(80)  NOT NULL COMMENT '装备名（doc.n 冗余列）',
  MODIFY doc     JSON         NOT NULL COMMENT '装备完整数据 · {n:名 r:品阶(白/紫/独珍/橙武,待人工) d:词条效果 who:推荐佩戴(人工) icon:图标 review:[质检标记]}';

ALTER TABLE augments
  COMMENT='心悟(强化)表 · 类型 t 为启发式分类，专属类建议人工复核',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{心悟名}',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  MODIFY n       VARCHAR(80)  NOT NULL COMMENT '心悟名（doc.n 冗余列）',
  MODIFY doc     JSON         NOT NULL COMMENT '心悟完整数据 · {n:名 t:类型(专属/转职/经济/属性,启发式) d:效果 icon:图标 sc:社区评分}';

ALTER TABLE comps
  COMMENT='阵容推荐表 · 产品核心内容，纯人工整理（OCR 不可提取），S3/S4 真实阵容待录',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{阵容名}',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 赞踩计数按赛季隔离',
  MODIFY n       VARCHAR(120) NOT NULL COMMENT '阵容名（doc.n 冗余列）',
  MODIFY tier    VARCHAR(4)   NOT NULL DEFAULT 'B' COMMENT '强度等级 S/A/B（「强度」排序用）',
  MODIFY heat    INT          NOT NULL DEFAULT 0 COMMENT '热度 0-100（「热度」排序用）',
  MODIFY up      INT          NOT NULL DEFAULT 0 COMMENT '赞数 · vote 事务维护，勿手改',
  MODIFY down    INT          NOT NULL DEFAULT 0 COMMENT '踩数 · vote 事务维护，勿手改',
  MODIFY doc     JSON         NOT NULL COMMENT '阵容完整数据(人工攻略) · {n:名 tier pop:人口 carry:主C费用 colorBond:彩色 main:主C style:[标签] traits:[[羁绊,层数,彩色]] front/back:[[棋子,星级,[装备]]] stats:{avg,pick,top1,top4} eq/aug:[[名,理由]] beats:[[节点,运营]] tip:提示}';

ALTER TABLE odds
  COMMENT='刷牌概率表 · 数值来自官方公告（人工录入）',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{season}:{等级}',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season  VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S3/S4',
  MODIFY lvl     VARCHAR(10)  NOT NULL COMMENT '棋手等级 · 中文数字 伍/陆/柒/捌/玖',
  MODIFY doc     JSON         NOT NULL COMMENT '该等级各费用概率 · {lvl:等级 p:[1费,2费,3费,4费,5费],"—"=不可能}';

ALTER TABLE seasons
  COMMENT='赛季表 · 全站赛季贯穿的唯一事实源；切换赛季=改 current 标记',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{赛季ID} · 本表即赛季清单',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY id      VARCHAR(20)  NOT NULL COMMENT '赛季ID · 如 S2/S3/S4',
  MODIFY doc     JSON         NOT NULL COMMENT '赛季信息 · {id name:名称 range:区间 current:1=当前 archive:1=归档}';

ALTER TABLE patch_notes
  COMMENT='更新志 · 首页时间线数据源（不分赛季）',
  MODIFY _key    VARCHAR(150) NOT NULL COMMENT '确定性主键 {gameId}:{日期}',
  MODIFY gameId  VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY date    VARCHAR(20)  NOT NULL COMMENT '日期 · YYYY-MM 或 YYYY-MM-DD',
  MODIFY doc     JSON         NOT NULL COMMENT '更新志条目 · {date:日期 html:富文本(仅<b>强调)}';

ALTER TABLE users
  COMMENT='注册用户表 · 登录即建档，仅记录身份',
  MODIFY openid     VARCHAR(64) NOT NULL COMMENT '微信openid · 未配WX_SECRET时为 dev_{deviceId} 模拟',
  MODIFY created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次登录时间';

ALTER TABLE user_favs
  COMMENT='我的收藏 · 收藏的官方推荐阵容；toggle=有则删无则建',
  MODIFY openid     VARCHAR(64)  NOT NULL COMMENT '用户openid',
  MODIFY gameId     VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season     VARCHAR(20)  NOT NULL COMMENT '收藏时的赛季（我的页按赛季过滤）',
  MODIFY name       VARCHAR(120) NOT NULL COMMENT '被收藏的阵容名',
  MODIFY created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间';

ALTER TABLE user_sims
  COMMENT='我的阵容 · 摆棋模拟器的棋盘快照存档（每用户每游戏上限50条）',
  MODIFY id         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '存档自增ID · 删除/同步回传用',
  MODIFY openid     VARCHAR(64)  NOT NULL COMMENT '用户openid',
  MODIFY gameId     VARCHAR(40)  NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season     VARCHAR(20)  NOT NULL COMMENT '保存时的赛季（棋盘数据归属该赛季）',
  MODIFY name       VARCHAR(120) NOT NULL COMMENT '存档名 · 默认"推演 · M-D hh:mm"',
  MODIFY board      JSON         NOT NULL COMMENT '棋盘快照 · rows*cols 一维数组(4x7=28格),null=空格',
  MODIFY stars      JSON         COMMENT '星级映射 · {格下标:1-3}',
  MODIFY items      JSON         COMMENT '装备映射 · {格下标:[装备名,至多3]}',
  MODIFY main       VARCHAR(80)  COMMENT '主C棋子名 · 全局唯一',
  MODIFY created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE votes
  COMMENT='阵容赞踩 · 一票制；本表是投票事实，comps.up/down 是事务维护的计数冗余',
  MODIFY openid     VARCHAR(64) NOT NULL COMMENT '用户openid · 一人一票的唯一维度',
  MODIFY gameId     VARCHAR(40) NOT NULL COMMENT '游戏ID · xq=逆水侠棋',
  MODIFY season     VARCHAR(20) NOT NULL COMMENT '投票时的赛季（仅记录，计数归 comps 表）',
  MODIFY comp       VARCHAR(120) NOT NULL COMMENT '被投票的阵容名',
  MODIFY value      ENUM('up','down') NOT NULL COMMENT '票向 · 赞/踩；取消=删行',
  MODIFY updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近改票时间（3秒频控参考）';

ALTER TABLE app_meta
  COMMENT='运行时元信息 · content 接口版本短路的依据（热更新不发版）',
  MODIFY k VARCHAR(80)  NOT NULL COMMENT '元信息键 · 如 content_version:{gameId}',
  MODIFY v VARCHAR(255) NOT NULL COMMENT '元信息值 · 版本号为毫秒时间戳，每次导入自动刷新';
