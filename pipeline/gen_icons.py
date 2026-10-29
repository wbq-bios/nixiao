# 图标生成器 · 为小程序绘制一套线性图标(tab / 首页快捷入口 / 我的菜单)
# 为什么自己画:项目没有设计图标资源,外部图标有版权风险;这里用几何线条生成 PNG,
# 颜色与线宽统一,和宣纸金调的视觉一致。改图标只改本文件的几何定义后重跑即可。
import os, math
from PIL import Image, ImageDraw

OUT = r"D:\AIPro\侠棋小程序\miniprogram\assets\icons"
INK = (92, 85, 74)        # --dim 墨色
FAINT = (110, 101, 85)    # tab 未选中
GOLD = (143, 111, 47)     # --gold-hi 选中/强调
W = 7                     # 线宽(96 画布)

def canvas(size=96):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)

def line(d, pts, color, w=W, joint="curve"):
    d.line(pts, fill=color, width=w, joint=joint)
    # 手动补圆头,避免折角处出现缺口
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0]-w/2, p[1]-w/2, p[0]+w/2, p[1]+w/2], fill=color)

def rounded_rect(d, box, color, r=8, w=W):
    d.rounded_rectangle(box, radius=r, outline=color, width=w)

def poly(d, pts, color, w=W, close=True):
    line(d, list(pts) + ([pts[0]] if close else []), color, w)

def star(d, cx, cy, R, r, color, w=W):
    pts = []
    for i in range(10):
        ang = -math.pi/2 + i*math.pi/5
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad*math.cos(ang), cy + rad*math.sin(ang)))
    poly(d, pts, color, w)

def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, name + ".png"))

# ---- 图标定义 ----
def i_home(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    def P(pts): return [(x*s, y*s) for x, y in pts]
    poly(d, P([(14,46),(48,16),(82,46)]), c, max(4, int(W*s)), close=False)
    poly(d, P([(22,44),(22,80),(74,80),(74,44)]), c, max(4, int(W*s)), close=False)
    line(d, P([(42,80),(42,58),(54,58),(54,80)]), c, max(4, int(W*s)))
    return img

def i_grid(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    for (x0, y0, x1, y1) in [(16,16,44,44),(52,16,80,44),(16,52,44,80),(52,52,80,80)]:
        rounded_rect(d, [x0*s, y0*s, x1*s, y1*s], c, int(6*s), max(4, int(W*s)))
    return img

def i_book(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    poly(d, [(48,26),(20,20),(20,72),(48,80)], c, w)
    poly(d, [(48,26),(76,20),(76,72),(48,80)], c, w)
    line(d, [(48,26),(48,80)], c, w)
    return img

def i_user(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    d.ellipse([36*s, 14*s, 60*s, 38*s], outline=c, width=w)
    d.arc([18*s, 44*s, 78*s, 104*s], start=200, end=340, fill=c, width=w)
    return img

def i_hex(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    pts = [(48,12),(78,30),(78,66),(48,84),(18,66),(18,30)]
    poly(d, [(x*s, y*s) for x, y in pts], c, w)
    d.ellipse([40*s, 40*s, 56*s, 56*s], outline=c, width=w)
    return img

def i_shield(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    pts = [(48,12),(78,24),(72,58),(48,84),(24,58),(18,24)]
    poly(d, [(x*s, y*s) for x, y in pts], c, w)
    line(d, [(48*s, 30*s), (48*s, 62*s)], c, w)
    line(d, [(34*s, 44*s), (62*s, 44*s)], c, w)
    return img

def i_board(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    # 三格六边形棋盘
    def hexagon(cx, cy, r):
        pts = [(cx + r*math.cos(math.pi/6 + i*math.pi/3), cy + r*math.sin(math.pi/6 + i*math.pi/3)) for i in range(6)]
        return [(x*s, y*s) for x, y in pts]
    poly(d, hexagon(48, 28, 18), c, w)
    poly(d, hexagon(30, 62, 18), c, w)
    poly(d, hexagon(66, 62, 18), c, w)
    return img

def i_star(c, size=96):
    img, d = canvas(size)
    star(d, 48, 50, 32*s if False else 32, 14, c, max(4, W))
    return img

def i_send(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    pts = [(12,46),(84,18),(56,84),(44,56),(12,46)]
    poly(d, [(x*s, y*s) for x, y in pts], c, w)
    line(d, [(44*s, 56*s), (84*s, 18*s)], c, w)
    return img

def i_info(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    d.ellipse([14*s, 14*s, 82*s, 82*s], outline=c, width=w)
    d.ellipse([44*s, 28*s, 52*s, 36*s], fill=c)
    line(d, [(48*s, 44*s), (48*s, 68*s)], c, w)
    return img

def i_service(c, size=96):
    img, d = canvas(size)
    s = size/96.0
    w = max(4, int(W*s))
    d.arc([18*s, 16*s, 78*s, 76*s], start=180, end=360, fill=c, width=w)
    rounded_rect(d, [16*s, 44*s, 30*s, 68*s], c, int(5*s), w)
    rounded_rect(d, [66*s, 44*s, 80*s, 68*s], c, int(5*s), w)
    d.arc([40*s, 52*s, 60*s, 78*s], start=0, end=160, fill=c, width=w)
    return img

ICONS = {
    "tab-home": i_home, "tab-comps": i_grid, "tab-dex": i_book, "tab-me": i_user,
    "quick-comp": i_grid, "quick-dex": i_book, "quick-bond": i_hex, "quick-equip": i_shield, "quick-sim": i_board,
    "me-sim": i_grid, "me-fav": i_star, "me-pub": i_send, "me-about": i_info, "me-service": i_service,
}

for name, fn in ICONS.items():
    if name.startswith("tab-"):
        save(fn(FAINT), name)
        save(fn(GOLD), name + "-on")
    else:
        save(fn(GOLD), name)

# 金色横幅上的图标要浅色,单独出一版
LIGHT = (255, 249, 238)
save(i_send(LIGHT), "me-pub-light")
print("icons:", len(os.listdir(OUT)))