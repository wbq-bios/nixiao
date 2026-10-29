# 设计稿生成器 · 阵容详情页(750×1624 @2x)
# 用真实棋子立绘/羁绊图标合成高保真设计稿;版式改动只改本文件,重跑即可
import io, json, math, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 750, 1624
BG = (243, 239, 230)
CARD = (251, 249, 243)
PANEL = (236, 230, 216)
TXT = (38, 34, 26)
DIM = (92, 85, 74)
FAINT = (110, 101, 85)
GOLD = (169, 134, 67)
GOLD_HI = (143, 111, 47)
GOLD_DIM = (243, 236, 222)
TS = (196, 69, 60)
LINE = (38, 34, 28)      # 描边用实色+低透明度叠层,最后统一压到背景上
SERIF = r"C:\Windows\Fonts\NotoSerifSC-VF.ttf"
SANS = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"
EMOJI = r"C:\Windows\Fonts\seguiemj.ttf"

def F(path, size, bold=False):
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name("Bold" if bold else "Regular")
    except Exception:
        pass
    return f

def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def shadow(img, box, r, blur=16, dy=6, alpha=40):
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle([box[0], box[1] + dy, box[2], box[3] + dy], radius=r, fill=(58, 50, 38, alpha))
    lay = lay.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(lay)

def text(d, xy, s, font, fill, anchor="la"):
    d.text(xy, s, font=font, fill=fill, anchor=anchor)

def fetch(url, size):
    raw = urllib.request.urlopen(url, timeout=10).read()
    return Image.open(io.BytesIO(raw)).convert("RGBA").resize(size, Image.LANCZOS)

def cover(im, w, h, top=0.12):
    iw, ih = im.size
    scale = max(w / iw, h / ih)
    im2 = im.resize((max(1, int(iw * scale)), max(1, int(ih * scale))), Image.LANCZOS)
    x = (im2.width - w) // 2
    y = int((im2.height - h) * top)
    return im2.crop((x, y, x + w, y + h))

def diamond(d, cx, cy, r, color):
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], outline=color, width=2)

def star(d, cx, cy, r, fill, inner=0.45):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * inner
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(pts, fill=fill)

data = json.load(open(r"D:\AIPro\侠棋小程序\pipeline\out\mock_data.json", encoding="utf-8-sig"))
img = Image.new("RGBA", (W, H), BG + (255,))
d = ImageDraw.Draw(img)

M = 32
CW = W - 2 * M

# 状态栏
text(d, (M, 24), "9:41", F(SANS, 26, True), TXT)
for i in range(4):
    hgt = 6 + i * 4
    d.rounded_rectangle([W - M - 150 + i * 14, 40 - hgt, W - M - 140 + i * 14, 40], radius=2, fill=TXT)
rr(d, [W - M - 96, 26, W - M - 62, 44], 5, outline=TXT, width=3)

# 导航栏
d.line([(M + 6, 76), (M - 4, 88), (M + 6, 100)], fill=TXT, width=4, joint="curve")
text(d, (W // 2, 88), data["n"], F(SANS, 30, True), TXT, anchor="mm")
rr(d, [W - M - 118, 64, W - M, 112], 26, fill=CARD, outline=TXT, width=2)
for i in range(3):
    d.ellipse([W - M - 96 + i * 18, 84, W - M - 86 + i * 18, 94], fill=DIM)
d.ellipse([W - M - 34, 76, W - M - 10, 100], outline=TXT, width=3)

y = 150
# 头部
rr(d, [M, y, M + 62, y + 62], 18, fill=TS)
text(d, (M + 31, y + 31), "S", F(SERIF, 31, True), (255, 246, 236), anchor="mm")
text(d, (M + 80, y - 6), data["n"], F(SERIF, 41, True), TXT)
text(d, (M + 80, y + 52), f"主C {data['main']}（{data['carry']}费） · {data['pop']} 级成型", F(SANS, 23), FAINT)
rr(d, [W - M - 236, y + 6, W - M - 128, y + 62], 28, fill=CARD, outline=TXT, width=2)
text(d, ((W - M - 236 + W - M - 128) // 2, y + 34), "☆ 收藏", F(SANS, 23), DIM, anchor="mm")
rr(d, [W - M - 116, y + 6, W - M, y + 62], 28, fill=GOLD_HI)
text(d, ((W - M - 116 + W - M) // 2, y + 34), "使用", F(SANS, 23, True), (255, 249, 238), anchor="mm")

y += 84
# 标签行
tags = ["来源:游戏内阵容推荐", "新手推荐", "热度 1", "更新 2026-10-20"]
x = M
for t in tags:
    tw = d.textlength(t, font=F(SANS, 20)) + 32
    rr(d, [x, y, x + tw, y + 40], 10, fill=GOLD_DIM)
    text(d, (x + 16, y + 20), t, F(SANS, 20), GOLD_HI, anchor="lm")
    x += tw + 12
y += 58

# 点赞行(设计稿用文字代替 emoji,避免字体缺字形)
rr(d, [M, y, M + 150, y + 56], 28, fill=GOLD_DIM, outline=GOLD, width=2)
text(d, (M + 75, y + 28), "👍 1", F(EMOJI, 26), GOLD_HI, anchor="mm")
rr(d, [M + 162, y, M + 312, y + 56], 28, fill=CARD, outline=TXT, width=2)
text(d, (M + 237, y + 28), "👎 0", F(EMOJI, 26), DIM, anchor="mm")
y += 78

# 羁绊胶囊
cache = {}
x = M
for b in data["bonds"]:
    label = f"{b['count']} {b['n']}"
    tw = d.textlength(label, font=F(SANS, 21)) + 92
    if x + tw > W - M:
        x = M; y += 66
    rr(d, [x, y, x + tw, y + 56], 28, fill=CARD, outline=TXT, width=2)
    if b["icon"] not in cache:
        try: cache[b["icon"]] = fetch(b["icon"], (40, 40))
        except Exception: cache[b["icon"]] = None
    if cache[b["icon"]]: img.alpha_composite(cache[b["icon"]], (int(x + 8), int(y + 8)))
    text(d, (x + 56, y + 28), label, F(SANS, 21), DIM, anchor="lm")
    x += tw + 12
y += 86

# 阵容构成
d.rectangle([M, y + 8, M + 6, y + 34], fill=GOLD_HI)
text(d, (M + 18, y + 2), "阵容构成", F(SERIF, 31, True), TXT)
tt = "主C金圈标出"
tag_x = M + 18 + d.textlength("阵容构成", font=F(SERIF, 31, True)) + 16
tw = d.textlength(tt, font=F(SANS, 20)) + 28
rr(d, [tag_x, y + 8, tag_x + tw, y + 42], 10, fill=GOLD_DIM)
text(d, (tag_x + 14, y + 25), tt, F(SANS, 20), GOLD_HI, anchor="lm")
y += 62

rows = [data["units"][0:4], data["units"][4:8], data["units"][8:]]
tile, gap = 151, 14
card_top = y
card_h = 28 + 26 + len(rows) * (tile + 36) + 8
shadow(img, [M, card_top, W - M, card_top + card_h], 28)
rr(d, [M, card_top, W - M, card_top + card_h], 28, fill=CARD, outline=TXT, width=2)
text(d, (M + 20, card_top + 20), "上 · 后排输出", F(SANS, 19), FAINT)
text(d, (W - M - 20, card_top + 20), "下 · 前排承伤", F(SANS, 19), FAINT, anchor="ra")
ry = card_top + 56
for row in rows:
    for i, u in enumerate(row):
        tx, ty = M + 20 + i * (tile + gap), ry
        art = None
        try: art = cover(fetch(u["art"], (300, 300)), tile, tile)
        except Exception: pass
        if art:
            mask = Image.new("L", (tile, tile), 0)
            ImageDraw.Draw(mask).rounded_rectangle([0, 0, tile, tile], radius=18, fill=255)
            img.paste(art, (tx, ty), mask)
        col = u["color"].lstrip("#")
        rc, gc, bc = int(col[0:2], 16), int(col[2:4], 16), int(col[4:6], 16)
        d.rounded_rectangle([tx, ty, tx + tile, ty + tile], radius=18, outline=(rc, gc, bc), width=5)
        n_star = int(u["star"])
        if n_star >= 2:
            cx0 = tx + tile / 2 - (n_star - 1) * 7
            for k in range(n_star):
                star(d, cx0 + k * 14, ty + 15, 7, (240, 183, 90))
        if u["isMain"]:
            rr(d, [tx, ty, tx + 46, ty + 28], 8, fill=TS)
            text(d, (tx + 23, ty + 14), "主C", F(SANS, 15, True), (255, 246, 236), anchor="mm")
        text(d, (tx + tile // 2, ty + tile + 8), u["n"], F(SANS, 21), DIM, anchor="ma")
    ry += tile + 36
y = card_top + card_h

# 运营节奏(预留版块:数据没补齐也给位置)
y += 26
d.rectangle([M, y + 8, M + 6, y + 34], fill=GOLD_HI)
text(d, (M + 18, y + 2), "运营节奏", F(SERIF, 31, True), TXT)
lx = M + 18 + d.textlength("运营节奏", font=F(SERIF, 31, True)) + 16
lw = d.textlength("预留", font=F(SANS, 20)) + 28
rr(d, [lx, y + 8, lx + lw, y + 42], 10, fill=GOLD_DIM)
text(d, (lx + 14, y + 25), "预留", F(SANS, 20), GOLD_HI, anchor="lm")
y += 56
rr(d, [M, y, W - M, y + 82], 22, fill=CARD, outline=TXT, width=2)
text(d, (M + 24, y + 32), "暂无运营节奏 · 待补充（升人口 / 搜牌 / 成型节点）", F(SANS, 21), FAINT)
y += 82

# CTA
y = y + 28
rr(d, [M, y, W - M, y + 90], 26, fill=GOLD)
text(d, (W // 2, y + 45), "生成分享卡片", F(SANS, 28, True), (255, 249, 238), anchor="mm")

text(d, (W // 2, H - 34), "非官方工具 · 数据为演示 · 《逆水寒》及相关版权归网易所有", F(SANS, 18), FAINT, anchor="mm")

# 统一压到背景上(否则半透明描边转 RGB 会变黑)
flat = Image.new("RGB", (W, H), BG)
flat.paste(img, (0, 0), img)
out = r"D:\AIPro\侠棋小程序\设计稿\阵容详情页.png"
flat.save(out, quality=96)
print("saved", out, flat.size)