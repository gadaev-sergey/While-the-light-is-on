# -*- coding: utf-8 -*-
"""
Шкаф по спрайту: процедурная геометрия -> запекание текстур -> GLB для веба.

Запуск из корня проекта:
    blender -b --factory-startup --python models/wardrobe/wardrobe.py -- [--fast]

--fast  — быстрый черновик (текстуры 1024, мало сэмплов) для проверки формы.

Единицы — метры, начало координат — центр пола под шкафом, лицевая сторона
смотрит в -Y (после экспорта в glTF это +Z, как принято в three.js).
Двери и ящик — отдельные узлы с опорной точкой на оси петель, чтобы их
можно было открывать в игре.
"""
import math
import os
import sys

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
from kit import Prop, diamond, srgb, stadium, xr  # noqa: E402

prop = Prop("wardrobe")

# Цвета сняты со спрайта (см. models/tools/palette.py)
WOOD = dict(dark=srgb(40, 25, 17), mid=srgb(76, 51, 36), light=srgb(110, 78, 56), streak=srgb(158, 122, 92),
            scratch=srgb(178, 142, 108), edge=srgb(160, 124, 92), dust=srgb(122, 110, 96))
IRON = dict(iron=srgb(58, 52, 47), iron_dark=srgb(28, 25, 23), iron_edge=srgb(140, 134, 124),
            rust=srgb(116, 66, 38), rust_dark=srgb(70, 40, 25))
W = prop.wood("Wood", WOOD)
M = prop.metal("Metal", IRON)
K = prop.flat("Keyhole", srgb(10, 8, 7), 0.95)


def keyhole(name, cx, cz, y, mat, group):
    """Скважина — плоская тёмная вставка перед накладкой."""
    r, w1, w2, zb = 0.0055, 0.0022, 0.0036, cz - 0.022
    zc = cz
    phi = math.asin(w1 / r)
    a0, a1 = -math.pi / 2 + phi, 3 * math.pi / 2 - phi
    pts = [(cx + r * math.cos(a0 + (a1 - a0) * i / 16), zc + r * math.sin(a0 + (a1 - a0) * i / 16)) for i in range(17)]
    pts += [(cx - w2, zb), (cx + w2, zb)]
    verts = [(x, y, z) for x, z in pts]
    return prop.mesh(name, verts, [tuple(range(len(pts)))], mat, "X", group, bevel=None, closed=False)


# ---------------------------------------------------------------- модель
YF, YC, YB, HW = -0.31, -0.29, 0.29, 0.605   # лицевая плоскость, кромка боковин, задняя плоскость, полуширина

prop.log("build geometry")
# --- верхний корпус
for s in (-1, 1):
    prop.box(f"side_{s}", *xr(0.585, HW, s), YC, YB, 0.337, 1.815, W, "Z")
    prop.box(f"side_stile_f_{s}", *xr(HW, 0.613, s), YF, -0.235, 0.337, 1.75, W, "Z")
    prop.box(f"side_stile_b_{s}", *xr(HW, 0.613, s), 0.225, YB, 0.337, 1.75, W, "Z")
    prop.box(f"side_rail_t_{s}", *xr(HW, 0.613, s), -0.235, 0.225, 1.665, 1.75, W, "Y")
    prop.box(f"side_rail_b_{s}", *xr(HW, 0.613, s), -0.235, 0.225, 0.337, 0.43, W, "Y")
    # стойка лицевой рамы с пилястрой — одна деталь со ступенькой по бокам
    prop.frustum_y(f"pilaster_{s}", (*xr(0.530, 0.597, s), 0.337, 1.75), (*xr(0.522, HW, s), 0.337, 1.75),
              YF - 0.008, YC, W, "Z", bevel=(0.003, 1))
    prop.box(f"frieze_block_{s}", *xr(0.522, 0.597, s), YF - 0.012, YF, 1.75, 1.815, W, "Z")
    prop.cylinder(f"rosette_{s}", (s * 0.5595, YF - 0.015, 1.7825), 0.021, 0.006, "Y", W, seg=12, bevel=(0.002, 1))
prop.box("frieze", -HW, HW, YF, YC, 1.75, 1.815, W, "X")
prop.box("ff_bottom", -0.522, 0.522, YF, YC, 0.337, 0.352, W, "X", bevel=(0.003, 1))
prop.box("back", -0.585, 0.585, 0.278, YB, 0.357, 1.795, W, "Z")
prop.box("top", -0.585, 0.585, YC, 0.278, 1.795, 1.815, W, "X")
prop.box("floor_up", -0.585, 0.585, YC, 0.278, 0.337, 0.357, W, "X")
prop.box("shelf", -0.585, 0.585, -0.26, 0.278, 1.50, 1.52, W, "X")
prop.cylinder("rod", (0.0, 0.0, 1.42), 0.012, 1.17, "X", M, seg=10, bevel=(0.002, 1))

# --- карниз: выкружка, полка, тёмная канавка, верхняя плита
prop.frustum_z("cornice_cove", (-HW, HW, YF, YB), (-0.648, 0.648, YF - 0.043, YB), 1.815, 1.845, W, "X")
prop.box("cornice_step", -0.656, 0.656, YF - 0.051, YB, 1.845, 1.878, W, "X", bevel=(0.007, 2))
prop.box("cornice_fillet", -0.646, 0.646, YF - 0.041, YB, 1.878, 1.886, W, "X", bevel=(0.002, 1))
prop.box("cornice_cap", -0.667, 0.667, YF - 0.062, YB, 1.886, 1.925, W, "X", bevel=(0.010, 2))

# --- нижняя тумба с ящиком
for s in (-1, 1):
    prop.box(f"base_side_{s}", *xr(0.618, 0.638, s), -0.323, YB, 0.100, 0.292, W, "Y")
    prop.box(f"base_block_{s}", *xr(0.535, 0.638, s), -0.343, -0.323, 0.100, 0.292, W, "Z")
    prop.frustum_y(f"base_block_panel_{s}", (*xr(0.556, 0.617, s), 0.126, 0.266),
              (*xr(0.548, 0.625, s), 0.118, 0.274), -0.349, -0.343, W, "Z")
prop.box("base_back", -0.618, 0.618, 0.278, YB, 0.100, 0.292, W, "X")
prop.box("base_floor", -0.618, 0.618, -0.323, 0.278, 0.100, 0.118, W, "X")
prop.box("waist_low", -0.645, 0.645, -0.350, YB, 0.292, 0.318, W, "X", bevel=(0.007, 2))
prop.box("waist_up", -0.630, 0.630, -0.335, YB, 0.318, 0.337, W, "X", bevel=(0.005, 2))
prop.box("plinth", -0.655, 0.655, -0.360, YB, 0.052, 0.100, W, "X", bevel=(0.008, 2))

# --- ножки: Г-образные, со скошенным внутренним торцом
for s in (-1, 1):
    for front in (True, False):
        yo = -0.365 if front else YB
        d = 1 if front else -1
        ya, yb_ = sorted((yo, yo + d * 0.03))
        prop.frustum_z(f"foot_x_{s}_{front}", (*xr(0.517, 0.660, s), ya, yb_), (*xr(0.497, 0.660, s), ya, yb_),
                  0.0, 0.052, W, "X")
        # боковая часть начинается за лицевой, чтобы грани не совпадали
        yi = yo + d * 0.03
        yb0 = sorted((yi, yo + d * 0.14))
        yt0 = sorted((yi, yo + d * 0.16))
        prop.frustum_z(f"foot_y_{s}_{front}", (*xr(0.630, 0.660, s), *yb0), (*xr(0.630, 0.660, s), *yt0),
                  0.0, 0.052, W, "Y")


# --- двери
def door(s):
    g = "Door_L" if s < 0 else "Door_R"
    X = lambda a, b: xr(a, b, s)
    yf, yb, z0, z1 = -0.307, -0.285, 0.3555, 1.7465
    prop.box(f"{g}_stile_out", *X(0.419, 0.519), yf, yb, z0, z1, W, "Z", g)
    prop.box(f"{g}_stile_in", *X(0.002, 0.102), yf, yb, z0, z1, W, "Z", g)
    prop.box(f"{g}_rail_top", *X(0.102, 0.419), yf, yb, 1.6385, z1, W, "X", g)
    prop.box(f"{g}_rail_bot", *X(0.102, 0.419), yf, yb, z0, 0.4635, W, "X", g)
    # филёнка: цельный щит со скосами, края заходят в пазы обвязки
    prop.frustum_y(f"{g}_panel", (*X(0.124, 0.397), 0.4865, 1.6155), (*X(0.096, 0.425), 0.4575, 1.6445),
              -0.303, -0.289, W, "Z", g)
    prop.box(f"{g}_bead_in", *X(0.102, 0.112), -0.305, -0.293, 0.4635, 1.6385, W, "Z", g)
    prop.box(f"{g}_bead_out", *X(0.409, 0.419), -0.305, -0.293, 0.4635, 1.6385, W, "Z", g)
    prop.box(f"{g}_bead_top", *X(0.112, 0.409), -0.305, -0.293, 1.6285, 1.6385, W, "X", g)
    prop.box(f"{g}_bead_bot", *X(0.112, 0.409), -0.305, -0.293, 0.4635, 0.4735, W, "X", g)
    ex = s * 0.055
    prop.prism_xz(f"{g}_plate", stadium(ex, 1.079, 0.046, 0.148, seg=6), -0.311, yf, M, "Z", g, bevel=(0.0015, 1))
    prop.prism_xz(f"{g}_plate2", stadium(ex, 1.079, 0.034, 0.126, seg=6), -0.313, -0.311, M, "Z", g, bevel=(0.001, 1))
    keyhole(f"{g}_keyhole", ex, 1.085, -0.3134, K, g)
    for zc in (1.5615, 0.5365):
        prop.cylinder(f"{g}_hinge_{zc}", (s * 0.5205, -0.310, zc), 0.0065, 0.117, "Z", M, g, seg=10)


door(-1)
door(1)

# --- ящик
g = "Drawer"
prop.frustum_y("drw_front", (-0.511, 0.511, 0.124, 0.268), (-0.529, 0.529, 0.106, 0.286), -0.345, -0.321, W, "X", g)
prop.box("drw_side_l", -0.512, -0.500, -0.321, 0.25, 0.12, 0.26, W, "Y", g, bevel=(0.002, 1))
prop.box("drw_side_r", 0.500, 0.512, -0.321, 0.25, 0.12, 0.26, W, "Y", g, bevel=(0.002, 1))
prop.box("drw_back", -0.500, 0.500, 0.238, 0.25, 0.12, 0.26, W, "X", g, bevel=(0.002, 1))
prop.box("drw_bottom", -0.500, 0.500, -0.321, 0.238, 0.12, 0.13, W, "X", g, bevel=(0.002, 1))
for s in (-1, 1):
    prop.prism_xz(f"drw_pull_plate_{s}", diamond(s * 0.38, 0.196, 0.038, 0.030), -0.349, -0.345, M, "X", g,
             bevel=(0.0015, 1))
    prop.prism_xz(f"drw_pull_knob_{s}", diamond(s * 0.38, 0.196, 0.012, 0.012), -0.363, -0.349, M, "X", g,
             bevel=(0.003, 2))

prop.build({
    "Body": (0.0, 0.0, 0.0),
    "Door_L": (-0.5205, -0.310, 0.3555),
    "Door_R": (0.5205, -0.310, 0.3555),
    "Drawer": (0.0, -0.341, 0.106),
})
