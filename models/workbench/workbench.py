# -*- coding: utf-8 -*-
"""
Рабочий стол по спрайту: тяжёлый верстак из толстых досок с тисками на левом краю,
двумя ящиками под столешницей и нижней полкой. На столешнице молоток, маслёнка и банка
с инструментом, на полке железный ящик для инструментов, коробка, банка и гаечный ключ.

Запуск из корня проекта:
    blender -b --factory-startup --python models/workbench/workbench.py -- [--fast]

Единицы — метры, начало координат — центр пола под столешницей, фасад смотрит в -Y
(после экспорта в glTF это +Z). Длина столешницы 1,5 м — из реестра DIMENSIONS, высоты — по спрайту.
Ящики — отдельные узлы Drawer_L и Drawer_R, они выдвигаются к зрителю.
"""
import math
import os
import random
import sys

from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
from kit import Prop, rounded_path, rounded_rect, srgb, xr  # noqa: E402

prop = Prop("workbench")

# Цвета сняты со спрайта (см. models/tools/palette.py)
WOOD = dict(dark=srgb(36, 24, 16), mid=srgb(90, 60, 38), light=srgb(140, 100, 66), streak=srgb(156, 118, 82),
            scratch=srgb(140, 104, 74), edge=srgb(156, 116, 82), dust=srgb(116, 98, 80))
HANDLE = dict(dark=srgb(70, 44, 26), mid=srgb(112, 76, 48), light=srgb(150, 112, 76), streak=srgb(172, 134, 94),
              scratch=srgb(186, 150, 110), edge=srgb(178, 142, 104), dust=srgb(140, 124, 106))
DARK = dict(dark=srgb(26, 18, 13), mid=srgb(48, 32, 22), light=srgb(72, 50, 34), streak=srgb(90, 66, 46),
            scratch=srgb(96, 72, 52), edge=srgb(100, 76, 56), dust=srgb(90, 80, 70))
IRON = dict(iron=srgb(58, 52, 47), iron_dark=srgb(28, 25, 23), iron_edge=srgb(140, 134, 124),
            rust=srgb(116, 66, 38), rust_dark=srgb(70, 40, 25))
CAST = dict(iron=srgb(78, 82, 90), iron_dark=srgb(36, 36, 40), iron_edge=srgb(156, 150, 144), rust=srgb(126, 68, 40),
            rust_dark=srgb(78, 42, 26), metal=0.5, rough=0.5, rust_from=0.56, rust_to=0.68)
TIN = dict(iron=srgb(118, 108, 96), iron_dark=srgb(70, 62, 54), iron_edge=srgb(190, 180, 166), rust=srgb(124, 80, 50),
           rust_dark=srgb(84, 54, 36), metal=0.45, rough=0.42, rust_from=0.55, rust_to=0.68)
STEEL = dict(iron=srgb(140, 130, 118), iron_dark=srgb(88, 80, 72), iron_edge=srgb(206, 196, 182), rust=srgb(128, 88, 58),
             rust_dark=srgb(88, 60, 42), metal=0.45, rough=0.4, rust_from=0.62, rust_to=0.74)
# краска на железе: сколы открывают ржавчину
TOOLBOX = dict(paint=srgb(64, 62, 68), paint_dark=srgb(40, 38, 44), under=srgb(132, 68, 44), under_dark=srgb(80, 42, 28),
               stain=srgb(116, 60, 40), chips=(0.57, 0.64), streaks=0, drips=0.4, gloss=0.5, under_rough=0.85,
               under_metal=0.15)
BOX = dict(paint=srgb(86, 82, 68), paint_dark=srgb(58, 54, 44), under=srgb(128, 70, 46), under_dark=srgb(78, 44, 30),
           stain=srgb(110, 64, 42), chips=(0.56, 0.63), streaks=0, drips=0.3, gloss=0.55, under_rough=0.85,
           under_metal=0.15)
OIL = dict(paint=srgb(152, 56, 38), paint_dark=srgb(104, 36, 24), under=srgb(130, 120, 108), under_dark=srgb(76, 70, 62),
           stain=srgb(90, 40, 26), chips=(0.6, 0.66), streaks=0, drips=0.35, gloss=0.35, under_rough=0.4,
           under_metal=0.45)

W = prop.wood("Wood", WOOD)
HW = prop.wood("Handle", HANDLE)
DK = prop.wood("DarkHandle", DARK)
FE = prop.metal("Iron", IRON)
CI = prop.metal("CastIron", CAST)
ST = prop.metal("Steel", STEEL)
TN = prop.metal("Tin", TIN)
TB = prop.painted("Toolbox", TOOLBOX)
BX = prop.painted("Box", BOX)
OL = prop.painted("OilCan", OIL)

TOP, TOP_T = 0.80, 0.10              # верх столешницы и её толщина
L2, D2 = 0.75, 0.31                  # полудлина и полуглубина столешницы
LX0, LX1 = 0.577, 0.682              # ножки по X (расстояние от оси)
LYF, LYB = (-0.28, -0.175), (0.175, 0.28)   # передние и задние ножки по Y
UNDER = TOP - TOP_T                  # низ столешницы, верх ножек и царг
YF = -0.27                           # лицевая плоскость рамы
T = 0.022                            # толщина досок рамы
DZ0, DZ1 = 0.525, 0.672              # ящики по высоте
DF = 0.004                           # ящики утоплены в раму: вокруг них тёмная щель, как на спрайте
RAIL = 0.18                          # верх обвязки нижней полки
SHELF = RAIL + 0.018                 # верх досок полки, на нём стоят вещи
DRAWERS = {"Drawer_L": (-0.547, 0.028), "Drawer_R": (0.093, 0.54)}


def ball(name, c, r, mat, group="Body", seg=10):
    arc = [(r * math.sin(math.pi * i / 6), -r * math.cos(math.pi * i / 6)) for i in range(7)]
    prop.lathe(name, arc, c, mat, group=group, seg=seg, sharp=80)


prop.log("build geometry")
# --- столешница из четырёх толстых досок: чуть разной длины, задние чуть просели
random.seed(3)
gap = 0.004
d = (2 * D2 - 3 * gap) / 4
for i in range(4):
    y0 = -D2 + i * (d + gap)
    dz = -random.uniform(0.0, 0.0015) if i else 0.0
    prop.box(f"top_{i}", -L2 + random.uniform(-0.004, 0.004), L2 + random.uniform(-0.004, 0.004), y0, y0 + d,
             UNDER, TOP + dz, W, "X", bevel=(0.008, 2))

# --- ножки, болты на лицевых ножках
for s in (-1, 1):
    for side, (y0, y1) in (("front", LYF), ("back", LYB)):
        prop.box(f"leg_{side}_{s}", *xr(LX0, LX1, s), y0, y1, 0.0, UNDER, W, "Z", bevel=(0.006, 2))
    for zb in (0.62, 0.147):
        prop.cylinder(f"leg_bolt_{s}_{zb}", (s * (LX0 + LX1) / 2, LYF[0] - 0.003, zb), 0.009, 0.007, "Y", FE, seg=10,
                      bevel=(0.003, 1))

# --- рама под столешницей: лицевые рейки и стойки вокруг ящиков, боковые и задняя царги,
# дно под ящиками и перегородка между ними
prop.box("rail_top", -LX0, LX0, YF, YF + T, DZ1 + 0.002, UNDER, W, "X")
prop.box("rail_mid", -LX0, LX0, YF, YF + T, 0.48, DZ0 - 0.002, W, "X")
for name, (a, b) in (("stile_l", (-LX0, -0.55)), ("stile_c", (0.031, 0.09)), ("stile_r", (0.543, LX0))):
    prop.box(name, a, b, YF, YF + T, DZ0 - 0.002, DZ1 + 0.002, W, "Z")
for s in (-1, 1):
    prop.box(f"apron_side_{s}", *xr(LX0, LX0 + T, s), LYF[1], LYB[0], 0.48, UNDER, W, "Y")
prop.box("apron_back", -LX0, LX0, LYB[0], LYB[0] + T, 0.48, UNDER, W, "X")
prop.box("case_floor", -LX0, LX0, YF + T, LYB[0], 0.505, DZ0 - 0.002, W, "X")
prop.box("divider", 0.045, 0.075, YF + T, LYB[0], DZ0 - 0.002, UNDER, W, "Y")

# --- нижняя полка: обвязка между ножками, сверху на ней доски
prop.box("rail_low", -LX0, LX0, YF, YF + T, 0.112, RAIL, W, "X")
prop.box("rail_low_back", -LX0, LX0, LYB[0], LYB[0] + T, 0.112, RAIL, W, "X")
for s in (-1, 1):
    prop.box(f"rail_low_side_{s}", *xr(LX0, LX0 + T, s), LYF[1], LYB[0], 0.112, RAIL, W, "Y")
gap = 0.006
d = (LYB[0] + T - YF - 3 * gap) / 4
for i in range(4):
    y0 = YF + i * (d + gap)
    prop.box(f"shelf_{i}", -LX0, LX0, y0, y0 + d, RAIL, SHELF, W, "X", bevel=(0.003, 1))

# --- раскос сзади справа в плоскости задней рамы: концы запилены по царге и по ножке
bx0, bz0, bx1, bz1 = 0.20, 0.475, LX0, 0.265     # где ось раскоса встречает царгу и ножку
ang, ext = math.atan2(bz0 - bz1, bx1 - bx0), 0.06
cuts = (prop.cutter("brace_cut_leg", [(0.1, -0.1), (0.3, -0.1), (0.3, 1.0), (0.1, 1.0)], "X", LX0, 0.9),
        prop.cutter("brace_cut_apron", [(0.0, 0.1), (0.9, 0.1), (0.9, 0.3), (0.0, 0.3)], "Z", 0.48, 1.0))
brace = prop.box("brace", 0.0, math.hypot(bx1 - bx0, bz0 - bz1) + 2 * ext, LYB[0], LYB[0] + T, -0.025, 0.025, W, "X",
                 bevel=(0.003, 1), cutters=cuts)
prop.transform([brace], Matrix.Translation((bx0 - ext * math.cos(ang), 0.0, bz0 + ext * math.sin(ang)))
               @ Matrix.Rotation(ang, 4, "Y"))


# --- ящики: лицевая доска, боковины, задняя стенка, дно и ручка-скоба
def drawer(g, x0, x1):
    yf, yi = YF + DF, YF + DF + T    # лицевая и внутренняя плоскости передней доски
    prop.box(f"{g}_front", x0, x1, yf, yi, DZ0, DZ1, W, "X", g, bevel=(0.004, 2))
    xi0, xi1, yb = x0 + 0.01, x1 - 0.01, 0.15
    for k, (a, b) in enumerate(((xi0, xi0 + 0.012), (xi1 - 0.012, xi1))):
        prop.box(f"{g}_side_{k}", a, b, yi, yb, DZ0 + 0.006, DZ1 - 0.016, W, "Y", g, bevel=(0.002, 1))
    prop.box(f"{g}_back", xi0 + 0.012, xi1 - 0.012, yb - 0.012, yb, DZ0 + 0.006, DZ1 - 0.016, W, "X", g,
             bevel=(0.002, 1))
    prop.box(f"{g}_bottom", xi0 + 0.012, xi1 - 0.012, yi, yb - 0.012, DZ0 + 0.006, DZ0 + 0.014, W, "X", g,
             bevel=None)
    cx, zc = (x0 + x1) / 2, 0.603
    a, b = cx - 0.085, cx + 0.085
    prop.tube(f"{g}_pull", rounded_path([(a, yf + 0.002, zc + 0.01), (a + 0.012, yf - 0.03, zc - 0.006),
                                         (b - 0.012, yf - 0.03, zc - 0.006), (b, yf + 0.002, zc + 0.01)], 0.012, steps=5),
              0.008, FE, g, seg=8)
    for k, x in enumerate((a, b)):
        prop.cylinder(f"{g}_rose_{k}", (x, yf - 0.002, zc + 0.01), 0.013, 0.005, "Y", FE, g, seg=12,
                      bevel=(0.0015, 1))


for g, (x0, x1) in DRAWERS.items():
    drawer(g, x0, x1)

# --- слесарные тиски на левом краю: основание, корпус, две губки со стальными накладками,
# винт с воротком; прижимные планки на лицевой кромке столешницы
VY0, VY1 = -0.285, -0.175
VB = TOP + 0.022                     # верх основания тисков


def arc(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


prop.box("vise_base", -0.72, -0.44, -0.30, -0.16, TOP, VB, CI, "X", bevel=(0.009, 3))
fixed = ([(-0.65, VB), (-0.465, VB), (-0.465, 0.93)] + arc(-0.54, 0.975, 0.045, 270, 180, 6)
         + arc(-0.61, 1.01, 0.025, 0, 90, 4) + arc(-0.625, 1.01, 0.025, 90, 180, 4))
prop.prism_xz("vise_body", fixed, VY0, VY1, CI, "Z", bevel=(0.012, 3))
prop.prism_xz("vise_jaw", rounded_rect(-0.72, -0.662, 0.85, 1.04, 0.025, seg=4, top_only=True),
              VY0, VY1, CI, "Z", bevel=(0.012, 3))
prop.box("vise_slide", -0.72, -0.5, -0.255, -0.205, 0.83, 0.87, CI, "X", bevel=(0.004, 1))
for name, (a, b) in (("vise_plate_moving", (-0.662, -0.659)), ("vise_plate_fixed", (-0.653, -0.65))):
    prop.box(name, a, b, VY0 + 0.006, VY1 - 0.006, 0.985, 1.028, ST, "Z", bevel=(0.001, 1))
VZ, VYS = 0.912, -0.23               # ось винта
prop.cylinder("vise_screw", (-0.765, VYS, VZ), 0.011, 0.09, "X", ST, seg=10, bevel=None)
prop.cylinder("vise_hub", (-0.8225, VYS, VZ), 0.018, 0.025, "X", CI, seg=12, bevel=(0.004, 1))
prop.cylinder("vise_bar", (-0.8225, VYS, 0.8025), 0.0075, 0.255, "Z", ST, seg=8, bevel=None)
for k, zb in enumerate((0.668, 0.937)):
    ball(f"vise_bar_ball_{k}", (-0.8225, VYS, zb), 0.014, ST)
for k, (a, b) in enumerate(((-0.69, -0.655), (-0.61, -0.575))):
    prop.box(f"vise_strap_{k}", a, b, -D2 - 0.008, -D2, 0.645, TOP - 0.004, FE, "Z", bevel=(0.002, 1))
    for zb in (0.672, 0.765):
        prop.cylinder(f"vise_bolt_{k}_{zb}", ((a + b) / 2, -D2 - 0.011, zb), 0.007, 0.006, "Y", FE, seg=8,
                      bevel=(0.002, 1))

# --- молоток лежит наискось: рукоять к зрителю и влево, боёк поперёк рукояти
phi = math.radians(40)
along = Vector((math.cos(phi), math.sin(phi), 0.0))
head_c = Vector((-0.07, -0.02, TOP + 0.0225))
tail = head_c - along * 0.36
prop.tube("hammer_handle", [(tail.x, tail.y, TOP + 0.015), tuple(head_c - along * 0.015)], 0.015, HW, seg=10)
head = [prop.box("hammer_head", -0.075, 0.075, -0.0225, 0.0225, -0.0225, 0.0225, FE, "X", bevel=(0.005, 2)),
        prop.cylinder("hammer_face", (0.083, 0.0, 0.0), 0.024, 0.016, "X", FE, seg=12, bevel=(0.004, 1)),
        prop.box("hammer_peen", -0.093, -0.075, -0.009, 0.009, -0.0225, 0.0225, FE, "X", bevel=(0.002, 1))]
prop.transform(head, Matrix.Translation(head_c) @ Matrix.Rotation(phi + math.pi / 2, 4, "Z"))

# --- красная маслёнка с длинным носиком и ручкой-петлёй
OX, OY = 0.345, -0.03
OILER = [(0, 0), (0.052, 0), (0.055, 0.004), (0.055, 0.12), (0.05, 0.13), (0.032, 0.143), (0.013, 0.147),
         (0.013, 0.157), (0.009, 0.161), (0, 0.161)]
prop.lathe("oil_can", OILER, (OX, OY, TOP), OL, seg=24)
prop.tube("oil_spout", rounded_path([(OX - 0.006, OY, TOP + 0.145), (OX - 0.04, OY, TOP + 0.185),
                                     (OX - 0.09, OY, TOP + 0.215), (OX - 0.15, OY, TOP + 0.232)], 0.04, steps=6),
          0.0055, ST, seg=8)
prop.tube("oil_handle", rounded_path([(OX + 0.05, OY, TOP + 0.112), (OX + 0.082, OY, TOP + 0.104),
                                      (OX + 0.082, OY, TOP + 0.035), (OX + 0.052, OY, TOP + 0.03)], 0.012, steps=4),
          0.005, OL, seg=8)

# --- жестяная банка с отвёрткой и стамеской
CX, CY = 0.548, 0.02
CAN = [(0, 0), (0.064, 0), (0.067, 0.004), (0.067, 0.148), (0.069, 0.15), (0.067, 0.152), (0.063, 0.15),
       (0.063, 0.008), (0, 0.008)]
prop.lathe("tool_can", CAN, (CX, CY, TOP), TN, seg=24)


def tool(name, x, y, tilt, shaft_r, shaft_len, profile, handle_mat):
    """Инструмент стоит в банке на дне и наклонён вокруг Y на tilt градусов."""
    m = prop.mark()
    base = TOP + 0.02
    prop.tube(f"{name}_shaft", [(x, y, base), (x, y, base + shaft_len + 0.01)], shaft_r, ST, seg=8)
    prop.lathe(f"{name}_handle", profile, (x, y, base + shaft_len), handle_mat, seg=12)
    pivot = Vector((x, y, base))
    prop.transform(prop.since(m), Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(tilt), 4, "Y")
                   @ Matrix.Translation(-pivot))


tool("screwdriver", CX + 0.01, CY - 0.02, -8, 0.0035, 0.13,
     [(0, 0), (0.008, 0), (0.012, 0.012), (0.013, 0.07), (0.011, 0.085), (0.006, 0.09), (0, 0.09)], DK)
tool("chisel", CX - 0.038, CY + 0.02, 28, 0.006, 0.15,
     [(0, 0), (0.008, 0), (0.011, 0.01), (0.011, 0.11), (0.008, 0.12), (0, 0.12)], DK)

# --- на полке: железный ящик для инструментов с крышкой, защёлками и ручкой
TX0, TX1, TY0, TY1 = -0.53, -0.04, -0.2, 0.05
prop.box("toolbox", TX0, TX1, TY0, TY1, SHELF, SHELF + 0.165, TB, "X", bevel=(0.006, 2))
prop.box("toolbox_lid", TX0 - 0.004, TX1 + 0.004, TY0 - 0.004, TY1 + 0.004, SHELF + 0.165, SHELF + 0.2, TB, "X",
         bevel=(0.006, 2))
for k, x in enumerate((TX0 + 0.1, TX1 - 0.1)):
    prop.box(f"toolbox_latch_{k}", x - 0.015, x + 0.015, TY0 - 0.012, TY0 - 0.004, SHELF + 0.1, SHELF + 0.19, FE, "Z",
             bevel=(0.002, 1))
hx, hy = (TX0 + TX1) / 2, (TY0 + TY1) / 2
prop.tube("toolbox_handle", rounded_path([(hx - 0.06, hy, SHELF + 0.198), (hx - 0.05, hy, SHELF + 0.225),
                                          (hx + 0.05, hy, SHELF + 0.225), (hx + 0.06, hy, SHELF + 0.198)], 0.012,
                                         steps=4), 0.006, FE, seg=8)

# --- коробка поменьше с защёлкой и банка с крышкой
BX0, BX1, BY0, BY1 = 0.095, 0.35, -0.17, 0.06
prop.box("box", BX0, BX1, BY0, BY1, SHELF, SHELF + 0.15, BX, "X", bevel=(0.005, 2))
prop.box("box_lid", BX0 - 0.004, BX1 + 0.004, BY0 - 0.004, BY1 + 0.004, SHELF + 0.15, SHELF + 0.185, BX, "X",
         bevel=(0.005, 2))
prop.box("box_latch", (BX0 + BX1) / 2 - 0.015, (BX0 + BX1) / 2 + 0.015, BY0 - 0.01, BY0 - 0.002, SHELF + 0.12,
         SHELF + 0.165, FE, "Z", bevel=(0.002, 1))
JAR = [(0, 0), (0.04, 0), (0.042, 0.004), (0.042, 0.14), (0.036, 0.152), (0.028, 0.155), (0.028, 0.172),
       (0.024, 0.176), (0, 0.176)]
prop.lathe("jar", JAR, (0.43, -0.06, SHELF), ST, seg=20)

# --- гаечный ключ прислонён к ящикам лицом к зрителю: кольцо с одной стороны, открытый зев с другой
wrench = prop.mark()
hole = prop.cutter("wrench_hole", [(0.24 + 0.012 * math.cos(a), 0.012 * math.sin(a))
                                   for a in (2 * math.pi * i / 16 for i in range(16))], "Z", -0.01, 0.02)
mouth = prop.cutter("wrench_mouth", [(-0.06, -0.0075), (-0.018, -0.0075), (-0.018, 0.0075), (-0.06, 0.0075)], "Z",
                    -0.01, 0.02)
prop.box("wrench_shaft", -0.005, 0.225, -0.009, 0.009, 0.0, 0.007, ST, "X", bevel=(0.002, 1))
prop.cylinder("wrench_ring", (0.24, 0.0, 0.004), 0.022, 0.008, "Z", ST, seg=16, bevel=(0.002, 1), cutters=(hole,))
prop.cylinder("wrench_jaw", (-0.02, 0.0, 0.004), 0.021, 0.008, "Z", ST, seg=16, bevel=(0.002, 1), cutters=(mouth,))
prop.transform(prop.since(wrench), Matrix.Translation((-0.015, -0.228, SHELF + 0.021))
               @ Matrix.Rotation(math.radians(4), 4, "Z") @ Matrix.Rotation(math.radians(65), 4, "X")
               @ Matrix.Translation((0.0, 0.0, -0.004)))

prop.build({
    "Body": (0.0, 0.0, 0.0),
    "Drawer_L": (sum(DRAWERS["Drawer_L"]) / 2, YF + DF, 0.6),
    "Drawer_R": (sum(DRAWERS["Drawer_R"]) / 2, YF + DF, 0.6),
})
