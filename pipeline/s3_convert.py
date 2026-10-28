# -*- coding: utf-8 -*-
"""S3 OCR 提取结果 → 侠棋数据 schema 转换器。

输入: D:\\AIPro\\工具\\orc识别数据\\归档\\S3赛季\\提取结果\\*.json
输出: pipeline/out/{table}.rows.json   —— POST /api/admin/import 的 rows
      miniprogram/games/xq/data/s3_*.js —— 本地内容包(离线兜底)追加数据

清洗规则(见 docs/后端设计.md 数据同构约定):
- 棋子称号区: 丢弃噪声 token(S/X/纯数字),错字归一化(明昭候→明昭侯 等,均打 review)
- 羁绊效果:   "档位 效果" 行文本 → lv 数组 + effects [{t,e}]
- 属性表:     纯数字转 int/float,带 % 的保留字符串
- 心悟类型:   关键词启发式(转职/经济/专属/属性)
- 所有行注入 season="S3";gameId 由导入侧统一传
"""
import json, os, re, sys

SRC = r"D:\AIPro\工具\orc识别数据\归档\S3赛季\提取结果"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
DATA_DIR = os.path.join(ROOT, "miniprogram", "games", "xq", "data")
SEASON = "S3"

# OCR 错字 → 羁绊字典名（命中即归一并打 review）
BOND_FIX = {"明昭候": "明昭侯", "六冥渊": "冥渊", "复渊": "冥渊"}
# 技能名人工确认覆盖（2026-10-28 用户核对：OCR 为空或幻觉文本，以卡面为准）
MANUAL_SKILL_NAME = {"凤晓吟": "花间", "傅晚晴": "约定", "高衙内": "仗势拳"}
# 棋子名人工确认覆盖（2026-10-28 用户核对：OCR 错字，以卡面为准）
MANUAL_NAME = {"沈溉": "沈浵"}
# 人工修正层：核对清单改动的数据（manual_overrides.json，覆盖 OCR，重新生成也保留）
# 结构：{"pieces": {名: {skill_d, skill_n}}, "bonds": {名: {lv, effects}}}
_ov = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manual_overrides.json")
MANUAL = json.load(open(_ov, encoding="utf-8")) if os.path.exists(_ov) else {}
MANUAL_OVERRIDES = MANUAL.get("pieces", {})
BOND_OVERRIDES = MANUAL.get("bonds", {})

# 立绘路径自动修复：部分主条目指向废弃目录（如方承意的 06-44-34 未随归档迁移），
# 按分图映射(同名条目→文件名)找到归档里真实存在的 红框/<文件名>/立绘.png
SPLIT = json.load(open(os.path.join(SRC, "S3_棋子提取_分图.json"), encoding="utf-8"))


def fix_art(name, art, review):
    rel = (art or "").replace("output\\", "").replace("output/", "")
    if rel and os.path.exists(os.path.join(SRC, rel.replace("/", os.sep))):
        return rel
    for e in SPLIT:
        if e.get("名字") == name:
            stem = (e.get("文件名") or "").rsplit(".", 1)[0]
            cand = f"红框/{stem}/立绘.png"
            if os.path.exists(os.path.join(SRC, cand.replace("/", os.sep))):
                if rel:
                    review.append(f"立绘路径修复:{rel}→{cand}")
                return cand
    return rel
# 属性表键 → 短键（未列出的原样保留）
STAT_KEY = {"气血上限": "hp", "内力消耗": "mp", "攻击": "atk", "防御": "def",
            "攻速": "spd", "会心": "crit", "会心伤害": "cd"}


def rows(fn):
    return json.load(open(os.path.join(SRC, fn), encoding="utf-8"))


def conv_num(v):
    s = str(v).strip()
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d+", s):
        return float(s)
    return s


def skill_review(d):
    notes = []
    # （X）占位语义已由用户确认（2026-10-28）：X=攻击力系数；数值补齐为可选优化
    if "（X）" in d or "（）" in d:
        notes.append("技能含（X）占位=X攻击力系数(语义已确认,数值可选补)")
    # 「疑似截断」启发式已移除（2026-10-28 用户核对：末行无句读属正常排版，误报）
    return notes


def convert_pieces(bond_universe):
    out = []
    for p in rows("S3_棋子提取结果.json"):
        name = (p.get("名字") or "").strip()
        if not name:
            continue
        name = MANUAL_NAME.get(name, name)  # OCR 错字以用户确认为准（覆盖所有引用点之前）
        review = []
        bonds = []
        for t in (p.get("称号区") or "").split():
            t = t.strip()
            if not t or re.fullmatch(r"[SABXx]|\d+", t):
                if t:
                    review.append(f"称号区噪声token丢弃:{t}")
                continue
            if t in BOND_FIX:
                # 归一化映射已由用户确认正确（2026-10-28），标记降为已确认备注
                review.append(f"羁绊名归一化:{t}→{BOND_FIX[t]}(已确认)")
                t = BOND_FIX[t]
            if t not in bond_universe:
                review.append(f"称号区token不在羁绊字典:{t}")
            bonds.append(t)
        skill = {"n": (p.get("技能名") or "").strip(), "d": (p.get("技能描述") or "").strip()}
        ov = MANUAL_OVERRIDES.get(name) or {}
        if ov.get("skill_d"): skill["d"] = ov["skill_d"]      # 人工修正层优先于 OCR
        if ov.get("skill_n"): skill["n"] = ov["skill_n"]
        if name in MANUAL_SKILL_NAME:
            skill["n"] = MANUAL_SKILL_NAME[name]  # 人工确认值直接覆盖 OCR 空值/幻觉文本
        if not skill["n"]:
            review.append("技能名缺失(OCR未提取),需对照原图补")
        if not skill["d"]:
            review.append("技能描述缺失(OCR未提取),需对照原图补")
        review += [f"技能:{n}" for n in skill_review(skill["d"])]
        stats = {}
        for k, arr in (p.get("属性表") or {}).items():
            stats[STAT_KEY.get(k, k)] = [conv_num(v) for v in arr]
        row = {
            "n": name,
            "c": int(p.get("数字") or 0),
            "job": (p.get("职业") or "").strip(),
            "bonds": bonds,
            "tags": [t for t in (p.get("职业标签") or "").split() if t],
            "skill": skill,
            "stats": stats,
            "src": p.get("文件名") or "",
            "season": SEASON,
        }
        row["art"] = fix_art(name, p.get("立绘") or "", review)
        if review:
            row["review"] = review
        out.append(row)
    return out


# S3 羁绊类型：用户确认全部为"势力"（2026-10-28），无职业羁绊；如有个别例外，把名字加回此集合
JOB_BONDS = set()


def convert_bonds():
    out = []
    for b in rows("羁绊提取结果.json"):
        name = (b.get("名称") or "").strip()
        if not name:
            continue
        review = []
        desc = (b.get("描述") or "").strip()
        # 羁绊效果: "2 获得17%增伤…\n4 50%概率…" → lv + effects
        # 档位行 = 1-12 的数字 + 空格；"45%…"这类是行首档位数字被 OCR 丢掉的续行
        tiers, effects, cur, dropped = [], [], None, False
        for line in (b.get("羁绊效果") or "").splitlines():
            line = line.strip()
            if not line:
                continue
            m = re.match(r"^(\d{1,2})\s+(.*)", line)
            if m and 1 <= int(m.group(1)) <= 12:
                cur = {"t": int(m.group(1)), "e": m.group(2).strip()}
                tiers.append(cur["t"])
                effects.append(cur)
            elif line.startswith("【满级】"):
                cur = {"t": "max", "e": line}
                effects.append(cur)
            else:
                if re.match(r"^\d+[%，,]", line):
                    dropped = True  # 例:破军"45%忽视防御…"实为 4 档行丢了行首数字
                if cur:
                    cur["e"] += line
        lv = "/".join(str(t) for t in sorted(set(t for t in tiers if t != "max")))
        # 类型：S3 全部为势力（用户拍板 2026-10-28）；例外名单见 JOB_BONDS
        if name in JOB_BONDS:
            t = "职业"
        else:
            t = "势力"
        if dropped:
            review.append("疑似档位行首数字丢失(存在45%/60%式行),档位需对照原图核对")
        # 描述里的 X 代指该羁绊内棋子（用户确认），分档数值在 effects 里 —— 不再作为疑点标记
        if not lv:
            review.append("羁绊档位未解析出,需人工录入 lv")
        # 羁绊人工修正层：用户确认的 lv/effects 直接覆盖，并销除已解决的档位标记
        bo = BOND_OVERRIDES.get(name)
        if bo:
            if bo.get("lv"): lv = bo["lv"]
            if bo.get("effects"): effects = bo["effects"]
            review = [r for r in review if "档位行首数字丢失" not in r]
        row = {
            "n": name, "t": t, "lv": lv, "d": desc,
            "effects": effects, "icon": b.get("图标") or "", "season": SEASON,
        }
        if review:
            row["review"] = review
        out.append(row)
    return out


def convert_equips():
    out, seen = [], set()
    for e in rows("装备提取结果.json"):
        name = (e.get("名称") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append({
            "n": name, "d": (e.get("词条") or "").strip(),
            "icon": e.get("图标") or "", "season": SEASON,
        })
    return out


def convert_augments():
    out, seen = [], set()
    for a in rows("心悟提取结果.json"):
        name = (a.get("名称") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        # 类型字段（专属/转职/经济/属性）暂不需要——2026-10-28 用户确认，不入库
        row = {
            "n": name, "d": (a.get("效果描述") or "").strip(),
            "icon": a.get("图标") or "", "season": SEASON,
        }
        sc = a.get("评分")
        try:
            row["sc"] = float(sc)
        except (TypeError, ValueError):
            pass
        out.append(row)
    return out


def dump(name, arr):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f"{name}.rows.json")
    json.dump(arr, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    js = os.path.join(DATA_DIR, f"s3_{name}.js")
    with open(js, "w", encoding="utf-8") as f:
        f.write(f"// S3 真实数据 · OCR 提取+清洗 2026-10-28 · season={SEASON}（pipeline/s3_convert.py 生成,勿手改）\n")
        f.write("module.exports = " + json.dumps(arr, ensure_ascii=False, indent=1) + ";\n")
    return p, js


def main():
    pieces_raw = rows("S3_棋子提取结果.json")
    bond_universe = [b["名称"].strip() for b in rows("羁绊提取结果.json") if b.get("名称")]

    pieces = convert_pieces(set(bond_universe))
    bonds = convert_bonds()
    equips = convert_equips()
    augments = convert_augments()

    for name, arr in [("pieces", pieces), ("bonds", bonds), ("equipments", equips), ("augments", augments)]:
        p, js = dump(name, arr)
        n_review = sum(1 for r in arr if r.get("review"))
        print(f"{name:10s} rows={len(arr):3d} review={n_review:3d}  -> {p}")
        print(f"{'':10s}                     -> {js}")

    # 羁绊类型分布与档位速览（人工核对用）
    import collections
    print("\n羁绊类型:", dict(collections.Counter(b["t"] for b in bonds)))
    for b in bonds:
        print(f"  [{b['t']}] {b['n']}: lv={b['lv'] or '∅'}")


if __name__ == "__main__":
    main()
