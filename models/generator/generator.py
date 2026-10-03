# -*- coding: utf-8 -*-
"""
Резервный генератор по спрайту: бензиновый генератор в трубчатой раме. Сверху жёлтый бак
с крышкой, под ним слева двигатель с ручным стартером и оребрённым цилиндром, справа
генератор с решёткой охлаждения, над ним щиток с розеткой, вольтметром и выключателем.

Запуск из корня проекта:
    blender -b --factory-startup --python models/generator/generator.py -- [--fast]

Единицы — метры, начало координат — центр пола под рамой, фасад смотрит в -Y
(после экспорта в glTF это +Z). Габарит рамы 0,90 × 0,55 м — из реестра DIMENSIONS,
высоты — по спрайту. Крышка бака — отдельный узел Cap с опорной точкой на оси горловины.
"""
import math
import os
import sys

from mathutils import Matrix

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
from kit import Prop, rounded_path, rounded_rect, srgb  # noqa: E402

prop = Prop("generator")

# Цвета сняты со спрайта (см. models/tools/palette.py)
FRAME = dict(iron=srgb(70, 62, 58), iron_dark=srgb(30, 27, 25), iron_edge=srgb(140, 132, 126), rust=srgb(112, 62, 38),
             rust_dark=srgb(66, 38, 26), metal=0.5, rough=0.5, rust_from=0.5, rust_to=0.64)
ENGINE = dict(iron=srgb(118, 106, 96), iron_dark=srgb(70, 58, 50), iron_edge=srgb(170, 160, 150), rust=srgb(120, 70, 46),
              rust_dark=srgb(76, 44, 30), metal=0.45, rough=0.5, rust_from=0.55, rust_to=0.68)
ALTERNATOR = dict(iron=srgb(104, 94, 86), iron_dark=srgb(58, 50, 46), iron_edge=srgb(160, 150, 142),
                  rust=srgb(116, 66, 42), rust_dark=srgb(72, 42, 28), metal=0.45, rough=0.48, rust_from=0.55,
                  rust_to=0.68)
IRON = dict(iron=srgb(46, 42, 40), iron_dark=srgb(22, 20, 19), iron_edge=srgb(110, 104, 98), rust=srgb(96, 56, 36),
            rust_dark=srgb(60, 36, 24), metal=0.5, rough=0.55)
# краска по железу: бак и кожух двигателя охристые, кожух ржавее; щиток серый
TANK = dict(paint=srgb(178, 126, 62), paint_dark=srgb(140, 96, 46), under=srgb(116, 64, 38), under_dark=srgb(70, 40, 26),
            stain=srgb(112, 70, 40), chips=(0.6, 0.67), streaks=0, drips=0.6, gloss=0.45, under_rough=0.8,
            under_metal=0.2)
SHROUD = dict(paint=srgb(124, 78, 40), paint_dark=srgb(82, 50, 28), under=srgb(96, 54, 34), under_dark=srgb(56, 32, 22),
              stain=srgb(96, 58, 34), chips=(0.45, 0.55), streaks=0, drips=0.6, gloss=0.5, under_rough=0.85,
              under_metal=0.15)
PANEL = dict(paint=srgb(128, 116, 102), paint_dark=srgb(96, 86, 74), under=srgb(110, 64, 40), under_dark=srgb(66, 40, 26),
             stain=srgb(100, 70, 48), chips=(0.58, 0.65), streaks=0, drips=0.4, gloss=0.45, under_rough=0.8,
             under_metal=0.2)

FR = prop.metal("Frame", FRAME)
EG = prop.metal("Engine", ENGINE)
AL = prop.metal("Alternator", ALTERNATOR)
FE = prop.metal("Iron", IRON)
TK = prop.painted("Tank", TANK)
SH = prop.painted("Shroud", SHROUD)
PN = prop.painted("Panel", PANEL)
RB = prop.flat("Rubber", srgb(30, 28, 26), 0.9)
FACE = prop.flat("GaugeFace", srgb(146, 140, 122), 0.6)
NEEDLE = prop.flat("Needle", srgb(40, 22, 18), 0.5)
LAMP = prop.flat("Lamp", srgb(170, 96, 30), 0.35)

R = 0.016                            # радиус трубы рамы
X2, Y2 = 0.45 - R, 0.275 - R         # оси труб рамы: полуширина и полуглубина
ZB, ZT = 0.061, 0.701                # оси нижней и верхней труб
AX, AZ, AR = 0.0, 0.262, 0.14        # ось генератора (вдоль X): высота и радиус корпуса

prop.log("build geometry")


# --- рама: две петли (спереди и сзади) со скруглёнными углами, связи между ними, поперечины под бак
def loop(name, y):
    pts = rounded_rect(-X2, X2, ZB, ZT, 0.06, seg=6)
    path = [(0.0, y, ZB)] + [(u, y, v) for u, v in pts] + [(0.0, y, ZB)]
    prop.tube(name, path, R, FR, seg=12)


for k, y in enumerate((-Y2, Y2)):
    loop(f"frame_loop_{k}", y)
    prop.tube(f"tank_rail_{k}", [(-X2, y, 0.534), (X2, y, 0.534)], 0.013, FR, seg=10)
for k, x in enumerate((-0.33, 0.30)):  # на этих поперечинах лежит бак
    prop.tube(f"tank_bearer_{k}", [(x, -Y2, 0.534), (x, Y2, 0.534)], 0.013, FR, seg=10)
for k, (x, z) in enumerate(((-X2, 0.40), (X2, 0.40), (-0.30, ZT), (0.30, ZT), (-0.33, ZB), (0.33, ZB))):
    prop.tube(f"frame_tie_{k}", [(x, -Y2, z), (x, Y2, z)], R if z != 0.40 else 0.013, FR, seg=10)
prop.tube("strut", [(-0.276, -Y2, ZB), (-0.276, -Y2, 0.534)], 0.009, FR, seg=8)
prop.box("rail_clamp", -0.45, -0.345, -Y2 - 0.02, -Y2 - 0.012, 0.505, 0.563, FE, "X", bevel=(0.003, 1))
for k, x in enumerate((-0.425, -0.37)):
    prop.cylinder(f"rail_clamp_bolt_{k}", (x, -Y2 - 0.023, 0.534), 0.007, 0.006, "Y", FE, seg=8, bevel=(0.002, 1))

# --- ножки: скоба на трубе и резиновая подушка под ней
for sy in (-1, 1):
    for sx in (-1, 1):
        x, y = sx * 0.33, sy * Y2
        prop.box(f"foot_bracket_{sx}_{sy}", x - 0.04, x + 0.04, y - 0.028, y + 0.028, 0.026, 0.05, FE, "X",
                 bevel=(0.003, 1))
        prop.box(f"foot_pad_{sx}_{sy}", x - 0.034, x + 0.034, y - 0.026, y + 0.026, 0.0, 0.026, RB, "X",
                 bevel=(0.005, 2))

# --- бак: скруглённый короб с фальцем по низу, горловина, болты крепления
prop.box("tank", -0.365, 0.335, -0.19, 0.19, 0.547, 0.655, TK, "X", bevel=(0.035, 4))
prop.box("tank_lip", -0.369, 0.339, -0.194, 0.194, 0.552, 0.558, TK, "X", bevel=(0.002, 1))
CAPX, CAPY, CAPZ = -0.162, -0.02, 0.655
prop.cylinder("tank_neck", (CAPX, CAPY, CAPZ + 0.004), 0.034, 0.012, "Z", FE, seg=16, bevel=(0.002, 1))
prop.lathe("cap", [(0, 0), (0.045, 0), (0.045, 0.013), (0.042, 0.02), (0.03, 0.025), (0, 0.025)],
           (CAPX, CAPY, CAPZ + 0.006), FE, group="Cap", seg=24)
for k, x in enumerate((-0.257, 0.157)):
    prop.cylinder(f"tank_bolt_{k}", (x, 0.14, 0.655), 0.009, 0.008, "Z", FE, seg=10, bevel=(0.003, 1))

# --- двигатель: кожух вентилятора, ручной стартер с решёткой, картер, оребрённый цилиндр, крышка головки
prop.box("shroud", -0.37, -0.05, -0.15, 0.15, 0.43, 0.52, SH, "X", bevel=(0.025, 3))
prop.cylinder("starter", (-0.34, 0.0, 0.28), 0.12, 0.1, "X", TK, seg=28, bevel=(0.02, 3))
prop.box("starter_grille", -0.372, -0.308, -0.128, -0.104, 0.225, 0.335, FE, "Z", bevel=(0.003, 1))
for k in range(4):
    x = -0.365 + k * 0.016
    prop.box(f"starter_slat_{k}", x, x + 0.006, -0.134, -0.126, 0.23, 0.33, FE, "Z", bevel=(0.0015, 1))
prop.box("crankcase", -0.29, -0.075, -0.13, 0.13, 0.10, 0.33, EG, "X", bevel=(0.02, 3))
prop.box("cylinder", -0.265, -0.15, -0.085, 0.085, 0.33, 0.41, EG, "X", bevel=(0.006, 1))
for k in range(6):
    z = 0.334 + k * 0.012
    prop.box(f"fin_{k}", -0.278, -0.137, -0.1, 0.1, z, z + 0.006, EG, "X", bevel=(0.002, 1))
prop.box("head", -0.282, -0.133, -0.102, 0.102, 0.405, 0.43, EG, "X", bevel=(0.01, 2))
# боковая крышка картера на болтах и пробка маслозаливной горловины
prop.cylinder("case_cover", (-0.185, -0.135, 0.205), 0.075, 0.02, "Y", EG, seg=24, bevel=(0.006, 2))
for k in range(6):
    a = 2 * math.pi * (k + 0.5) / 6
    prop.cylinder(f"case_cover_bolt_{k}", (-0.185 + 0.062 * math.cos(a), -0.146, 0.205 + 0.062 * math.sin(a)), 0.006,
                  0.006, "Y", FE, seg=8, bevel=(0.002, 1))
prop.cylinder("oil_plug", (-0.105, -0.138, 0.135), 0.014, 0.018, "Y", FE, seg=12, bevel=(0.003, 1))
prop.cylinder("spark_boot", (-0.21, -0.112, 0.418), 0.011, 0.03, "Y", RB, seg=10, bevel=(0.004, 1))
for k, z in enumerate((0.15, 0.29)):
    prop.cylinder(f"crank_bolt_{k}", (-0.1, -0.133, z), 0.008, 0.008, "Y", FE, seg=8, bevel=(0.002, 1))

# --- генератор на одной оси с двигателем: переходное кольцо, корпус, пояс, торцевой кожух с решёткой
prop.cylinder("adapter", (-0.045, 0.0, AZ), AR + 0.005, 0.05, "X", AL, seg=32, bevel=(0.006, 2))
for k in range(6):
    a = 2 * math.pi * (k + 0.5) / 6
    prop.cylinder(f"adapter_bolt_{k}", (-0.018, 0.13 * math.cos(a), AZ + 0.13 * math.sin(a)), 0.007, 0.008, "X", FE,
                  seg=8, bevel=(0.002, 1))
prop.cylinder("alt_body", (0.075, 0.0, AZ), AR - 0.005, 0.19, "X", AL, seg=32, bevel=(0.006, 2))
prop.cylinder("alt_band", (0.175, 0.0, AZ), AR, 0.012, "X", AL, seg=32, bevel=(0.002, 1))
prop.cylinder("alt_end", (0.245, 0.0, AZ), AR, 0.13, "X", AL, seg=32, bevel=(0.01, 2))
prop.box("alt_vent", 0.19, 0.30, -0.143, -0.124, AZ - 0.062, AZ + 0.063, FE, "Z", bevel=(0.003, 1))
for k in range(7):
    x = 0.196 + k * 0.015
    prop.box(f"alt_slat_{k}", x, x + 0.006, -0.149, -0.142, AZ - 0.058, AZ + 0.059, FE, "Z", bevel=(0.0015, 1))
prop.cylinder("alt_cover", (0.3275, 0.0, AZ), AR - 0.02, 0.035, "X", AL, seg=28, bevel=(0.008, 2))
prop.cylinder("alt_hub", (0.35, 0.0, AZ), 0.04, 0.02, "X", FE, seg=16, bevel=(0.004, 1))
prop.tube("cable", rounded_path([(0.33, -0.06, 0.39), (0.405, -0.06, 0.37), (0.405, -0.06, 0.17),
                                 (0.33, -0.06, 0.15)], 0.04, steps=6), 0.009, RB, seg=8)

# --- опоры: поперечины на нижних трубах и лапы двигателя и генератора
for k, x in enumerate((-0.19, 0.25)):
    prop.box(f"mount_beam_{k}", x - 0.022, x + 0.022, -Y2, Y2, 0.068, 0.088, FE, "Y", bevel=(0.003, 1))
prop.box("engine_foot", -0.27, -0.1, -0.1, 0.1, 0.088, 0.104, FE, "X", bevel=(0.003, 1))
prop.box("alt_foot", 0.21, 0.29, -0.09, 0.09, 0.088, AZ - AR + 0.012, FE, "X", bevel=(0.004, 1))

# --- щиток: короб над генератором, лицевая панель с бортиком и болтами, розетка, вольтметр,
# выключатель и лампочка
prop.box("ctrl_front", -0.005, 0.34, -0.21, -0.12, 0.34, 0.52, PN, "X", bevel=(0.006, 2))
prop.box("ctrl_top", -0.005, 0.34, -0.12, 0.06, 0.405, 0.52, PN, "X", bevel=(0.006, 2))
PF = -0.216                          # лицевая плоскость панели
prop.box("panel", 0.0, 0.335, PF, -0.209, 0.345, 0.515, PN, "X", bevel=(0.003, 2))
for k, (x, z) in enumerate(((0.012, 0.357), (0.323, 0.357), (0.012, 0.503), (0.323, 0.503))):
    prop.cylinder(f"panel_bolt_{k}", (x, PF - 0.002, z), 0.006, 0.005, "Y", FE, seg=8, bevel=(0.0015, 1))
prop.lathe("socket", [(0, 0), (0.03, 0), (0.03, 0.012), (0.026, 0.02), (0.018, 0.022), (0.018, 0.015), (0, 0.015)],
           (0.055, PF + 0.002, 0.437), RB, "-Y", seg=20)
prop.box("gauge_bezel", 0.12, 0.232, PF - 0.012, PF + 0.002, 0.395, 0.49, RB, "X", bevel=(0.003, 1))
prop.box("gauge_face", 0.128, 0.224, PF - 0.013, PF - 0.011, 0.403, 0.482, FACE, "X", bevel=None)
needle = prop.box("gauge_needle", -0.0015, 0.0015, PF - 0.0145, PF - 0.013, 0.0, 0.065, NEEDLE, "Z", bevel=None)
prop.transform([needle], Matrix.Translation((0.176, 0.0, 0.41)) @ Matrix.Rotation(math.radians(-35), 4, "Y"))
prop.lathe("switch", [(0, 0), (0.028, 0), (0.028, 0.008), (0.02, 0.012), (0.012, 0.022), (0, 0.022)],
           (0.285, PF + 0.002, 0.44), RB, "-Y", seg=20)
prop.cylinder("lamp", (0.285, PF - 0.004, 0.388), 0.007, 0.01, "Y", LAMP, seg=10, bevel=(0.003, 1))

prop.build({
    "Body": (0.0, 0.0, 0.0),
    "Cap": (CAPX, CAPY, CAPZ),
})
