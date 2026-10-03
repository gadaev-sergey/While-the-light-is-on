# -*- coding: utf-8 -*-
"""
Снимает палитру предмета со спрайта: средний цвет и перцентили яркости по областям.

Запуск из корня проекта:
    blender -b --factory-startup --python models/tools/palette.py -- [wardrobe]

Области задаются в пикселях кадра предмета (x0, x1, y0, y1 от верхнего края), кадр — SPRITES в common.py.
"""
import os
import sys

import numpy as np

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import sprite  # noqa: E402

REGIONS = {
    "wardrobe": {
        "door_panel": (66, 126, 76, 300),
        "right_panel": (173, 230, 76, 300),
        "stile": (46, 63, 53, 326),
        "drawer": (46, 246, 346, 380),
        "cornice": (20, 280, 16, 36),
        "handle": (133, 143, 173, 196),
    },
    "crates": {
        "bottom_front": (171, 278, 205, 291),
        "top_front": (155, 271, 128, 191),
        "lid_inside": (85, 198, 28, 81),
        "bottom_end": (18, 108, 238, 285),
        "strap": (150, 161, 205, 291),
        "can": (175, 211, 88, 111),
        "cloth": (238, 278, 98, 138),
    },
    "bed": {
        "post": (7, 15, 76, 164),
        "rail": (48, 112, 168, 180),
        "mattress": (28, 112, 132, 164),
        "pillow": (40, 112, 84, 116),
        "blanket": (172, 392, 136, 196),
    },
    "sink": {
        "door_paint": (40, 133, 171, 298),
        "rail_paint": (33, 287, 133, 153),
        "counter": (20, 300, 108, 126),
        "backsplash": (33, 110, 65, 91),
        "faucet": (140, 152, 18, 78),
        "plates": (210, 267, 81, 111),
        "mug": (270, 293, 85, 111),
    },
    "workbench": {
        "top_front": (100, 367, 92, 112),
        "top_surface": (240, 300, 76, 86),
        "drawer": (93, 233, 122, 157),
        "leg": (53, 75, 173, 293),
        "vise": (50, 87, 23, 73),
        "toolbox": (90, 217, 207, 250),
        "small_box": (260, 330, 210, 250),
        "oil_can": (308, 335, 50, 80),
        "tin_can": (357, 392, 43, 80),
        "hammer_handle": (140, 187, 72, 83),
        "hammer_head": (195, 230, 60, 78),
        "jar": (345, 367, 217, 250),
    },
    "generator": {
        "frame_tube": (100, 233, 17, 25),
        "tank": (133, 233, 40, 62),
        "shroud": (50, 133, 82, 103),
        "starter": (27, 37, 123, 187),
        "engine": (73, 107, 133, 193),
        "alternator": (153, 200, 140, 200),
        "vents": (210, 233, 143, 197),
        "panel": (153, 187, 123, 133),
        "gauge": (197, 223, 93, 113),
        "socket": (163, 180, 93, 113),
        "foot": (38, 62, 232, 242),
    },
}


def rgb255(c):
    return tuple(int(round(v * 255)) for v in c)


name = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "wardrobe"
px = sprite(name)[::-1, :, :3]  # строки сверху вниз
r, g, b = px[..., 0], px[..., 1], px[..., 2]
fg = ~((g > r + 0.15) & (g > b + 0.15))  # всё, кроме зелёного фона
lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
for region, (x0, x1, y0, y1) in REGIONS[name].items():
    m = fg[y0:y1, x0:x1]
    cols, lums = px[y0:y1, x0:x1][m], lum[y0:y1, x0:x1][m]
    order = np.argsort(lums)
    pct = [rgb255(cols[order[min(len(order) - 1, len(order) * p // 100)]]) for p in (5, 25, 50, 75, 95)]
    print(f"{region:12s} среднее {rgb255(cols.mean(0))}  p5…p95 {pct}")
