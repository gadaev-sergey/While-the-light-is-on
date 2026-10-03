# -*- coding: utf-8 -*-
"""
Старая раковина по спрайту: эмалированная мойка с большой и малой чашами и бортиком,
настенный смеситель с гусаком и двумя вентилями, крашеная тумба с дверцами,
стопка тарелок на сушилке, жестяная кружка и щётка.

Запуск из корня проекта:
    blender -b --factory-startup --python models/sink/sink.py -- [--fast]

Единицы — метры, начало координат — центр пола под раковиной, фасад смотрит в -Y
(после экспорта в glTF это +Z). Ширина 1,2 м — из реестра DIMENSIONS, высоты — по спрайту.
Дверцы тумбы — отдельные узлы Door_L и Door_R с опорной точкой на оси петель.
"""
import math
import os
import random
import sys

from mathutils import Matrix

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
from kit import Prop, rounded_path, rounded_rect, srgb, xr  # noqa: E402

prop = Prop("sink")

# Цвета сняты со спрайта (см. models/tools/palette.py)
PAINT = dict(paint=srgb(100, 120, 120), paint_dark=srgb(74, 88, 88), under=srgb(112, 78, 50), under_dark=srgb(66, 44, 30),
             stain=srgb(124, 74, 42), chips=(0.56, 0.64), streaks=0.8, drips=0.7, gloss=0.6)
# у эмали сколы рыжие: под ней железо, и оно давно заржавело
ENAMEL = dict(paint=srgb(208, 200, 188), paint_dark=srgb(172, 160, 146), under=srgb(104, 66, 40), under_dark=srgb(60, 38, 24),
              stain=srgb(132, 88, 54), chips=(0.63, 0.69), streaks=0, drips=0.75, gloss=0.3, under_rough=0.75,
              under_metal=0.2)
IRON = dict(iron=srgb(62, 58, 52), iron_dark=srgb(30, 27, 24), iron_edge=srgb(140, 132, 120), rust=srgb(110, 70, 44),
            rust_dark=srgb(70, 44, 30), metal=0.6, rough=0.4, rust_from=0.6, rust_to=0.72)
# светлая посуда: металличность низкая, иначе без отражений в игре она выходит почти чёрной
PEWTER = dict(iron=srgb(176, 172, 166), iron_dark=srgb(128, 124, 118), iron_edge=srgb(228, 228, 222), rust=srgb(120, 96, 74),
              rust_dark=srgb(80, 62, 48), metal=0.25, rough=0.4, rust_from=0.7, rust_to=0.8, ao=(0.7, 0.6))
KNOB = dict(iron=srgb(112, 106, 98), iron_dark=srgb(62, 58, 54), iron_edge=srgb(204, 196, 184), rust=srgb(110, 70, 44),
            rust_dark=srgb(70, 44, 30), metal=0.45, rough=0.35, rust_from=0.66, rust_to=0.76)
STEEL = dict(iron=srgb(170, 160, 146), iron_dark=srgb(118, 110, 100), iron_edge=srgb(222, 216, 204), rust=srgb(128, 90, 60),
             rust_dark=srgb(90, 62, 44), metal=0.35, rough=0.38, rust_from=0.64, rust_to=0.76)
WOOD = dict(dark=srgb(60, 42, 30), mid=srgb(96, 70, 50), light=srgb(126, 96, 70), streak=srgb(150, 122, 94),
            scratch=srgb(166, 140, 110), edge=srgb(156, 128, 98), dust=srgb(120, 108, 94))
BRISTLE = dict(dark=srgb(26, 22, 18), mid=srgb(44, 38, 32), light=srgb(60, 52, 44))

PW = prop.painted("Paint", PAINT)
EN = prop.painted("Enamel", ENAMEL)
FE = prop.metal("Iron", IRON)
PT = prop.metal("Pewter", PEWTER)
KN = prop.metal("Knob", KNOB)
ST = prop.metal("Steel", STEEL)
WD = prop.wood("Wood", WOOD)
BR = prop.fabric("Bristle", BRISTLE)

T = 0.018
W2, D2 = 0.60, 0.30          # столешница: полуширина и полуглубина
TOP, RIM = 0.935, 0.862      # верх столешницы и низ её фасада
CW2 = 0.585                  # полуширина тумбы
YF, YB = -0.28, 0.27         # передняя и задняя плоскости тумбы
CAB = RIM - 0.002            # верх тумбы
STILE = 0.058                # ширина боковых стоек-ножек
DZ0, DZ1 = 0.121, 0.753      # низ и верх дверец
FLOOR = 0.78                 # дно чаш
BOWLS = {"L": (-0.525, -0.048), "R": (0.0, 0.17)}
BY0, BY1 = -0.22, 0.17       # чаши по глубине

prop.log("build geometry")
# --- тумба: боковины, стойки-ножки, верхняя и нижняя рейки, утопленный цоколь, дно и задняя стенка
for s in (-1, 1):
    prop.box(f"side_{s}", *xr(CW2 - T, CW2, s), YF + 0.02, YB, 0.0, CAB, PW, "Z")
    prop.box(f"stile_{s}", *xr(CW2 - STILE, CW2, s), YF, YF + 0.02, 0.0, CAB, PW, "Z")
prop.box("top_rail", -(CW2 - STILE), CW2 - STILE, YF, YF + 0.02, 0.757, CAB, PW, "X")
prop.box("bottom_rail", -(CW2 - STILE), CW2 - STILE, YF, YF + 0.02, 0.079, 0.117, PW, "X")
prop.box("plinth", -(CW2 - STILE), CW2 - STILE, YF + 0.025, YF + 0.043, 0.012, 0.079, PW, "X")
prop.box("floor", -(CW2 - T), CW2 - T, YF + 0.02, YB - 0.012, 0.099, 0.117, PW, "X")
prop.box("back", -(CW2 - T), CW2 - T, YB - 0.012, YB, 0.03, CAB, PW, "Z")


# --- дверцы: по доске с вертикальными волокнами, грибок-ручка у притвора, петли снаружи
def door(s):
    g = "Door_L" if s < 0 else "Door_R"
    prop.box(f"{g}_board", *xr(0.003, CW2 - STILE - 0.003, s), YF + 0.002, YF + 0.022, DZ0, DZ1, PW, "Z", g,
             bevel=(0.004, 2))
    knob = [(0, -0.002), (0.011, -0.002), (0.011, 0.008), (0.02, 0.011), (0.026, 0.016), (0.026, 0.02),
            (0.022, 0.026), (0.012, 0.029), (0, 0.03)]
    prop.lathe(f"{g}_knob", knob, (s * (0.047 if s < 0 else 0.06), YF + 0.002, 0.558), KN, "-Y", g, seg=20)
    for zc in (0.235, 0.653):
        prop.cylinder(f"{g}_hinge_{zc}", (s * (CW2 - STILE), YF - 0.001, zc), 0.006, 0.08, "Z", FE, g, seg=8)


door(-1)
door(1)

# --- эмалированная мойка: плита с вырезами чаш, под ней ванночки, сзади бортик
cuts = [prop.cutter(f"bowl_hole_{k}", rounded_rect(x0, x1, BY0, BY1, 0.04), "Z", RIM - 0.01, TOP + 0.02)
        for k, (x0, x1) in BOWLS.items()]
prop.box("counter", -W2, W2, -D2, D2, RIM, TOP, EN, "X", bevel=(0.015, 3), cutters=cuts)
# ванночка на 1 мм уже выреза и заходит в плиту почти до верха: стенки не совпадают (мерцание) и нет щели
for k, (x0, x1) in BOWLS.items():
    inner = prop.cutter(f"bowl_inner_{k}", rounded_rect(x0 + 0.001, x1 - 0.001, BY0 + 0.001, BY1 - 0.001, 0.039),
                        "Z", FLOOR, TOP + 0.02)
    prop.box(f"basin_{k}", x0 - 0.03, x1 + 0.03, BY0 - 0.03, BY1 + 0.03, FLOOR - 0.012, TOP - 0.022, EN, "X",
             bevel=(0.004, 1), cutters=(inner,))
prop.cylinder("drain", (sum(BOWLS["L"]) / 2, (BY0 + BY1) / 2, FLOOR + 0.002), 0.026, 0.004, "Z", FE, seg=16,
              bevel=None)
prop.prism_xz("backsplash", rounded_rect(-0.52, 0.52, TOP - 0.005, 1.077, 0.035, seg=5, top_only=True),
              0.25, 0.29, EN, "X", bevel=(0.008, 2))


# --- настенный смеситель: корпус с гусаком, перемычка и два вентиля с крестовинами
def ball(name, c, r):
    arc = [(r * math.sin(math.pi * i / 6), -r * math.cos(math.pi * i / 6)) for i in range(7)]
    prop.lathe(name, arc, c, FE, seg=8, sharp=80)


FX, FY, FZ = -0.053, 0.215, 1.046
prop.cylinder("faucet_body", (FX, FY, 1.03), 0.024, 0.08, "Z", FE, seg=16, bevel=(0.011, 3))
prop.tube("faucet_bridge", [(FX - 0.10, FY, FZ), (FX + 0.10, FY, FZ)], 0.010, FE, seg=10)
for k, vx in enumerate((FX - 0.10, FX + 0.10)):
    prop.cylinder(f"valve_{k}", (vx, 0.225, FZ), 0.016, 0.05, "Y", FE, seg=12, bevel=(0.004, 1))
    prop.cylinder(f"flange_{k}", (vx, 0.247, FZ), 0.024, 0.006, "Y", FE, seg=14, bevel=(0.002, 1))
    prop.cylinder(f"hub_{k}", (vx, 0.19, FZ), 0.010, 0.02, "Y", FE, seg=10, bevel=(0.003, 1))
    prop.tube(f"cross_h_{k}", [(vx - 0.022, 0.186, FZ), (vx + 0.022, 0.186, FZ)], 0.0042, FE, seg=6)
    prop.tube(f"cross_v_{k}", [(vx, 0.186, FZ - 0.022), (vx, 0.186, FZ + 0.022)], 0.0042, FE, seg=6)
    for j, (dx, dz) in enumerate(((-0.024, 0), (0.024, 0), (0, -0.024), (0, 0.024))):
        ball(f"cross_ball_{k}_{j}", (vx + dx, 0.186, FZ + dz), 0.0075)
SPOUT = (FX + 0.062, FY - 0.05)
prop.tube("spout", rounded_path([(FX, FY, 1.06), (FX, FY, 1.268), (*SPOUT, 1.268), (*SPOUT, 1.198)], 0.04, steps=10),
          0.013, FE, seg=12)
prop.cylinder("spout_tip", (*SPOUT, 1.192), 0.0145, 0.016, "Z", FE, seg=12, bevel=(0.003, 1))

# --- стопка тарелок на сушилке справа: глубокие тарелки вложены друг в друга, края видны полосами
PLATE = [(0, 0), (0.072, 0), (0.078, 0.002), (0.108, 0.013), (0.118, 0.016), (0.121, 0.018), (0.117, 0.0195),
         (0.105, 0.0165), (0.074, 0.006), (0, 0.006)]
random.seed(7)
for i in range(8):
    c = (0.305 + random.uniform(-0.003, 0.003), -0.02 + random.uniform(-0.003, 0.003), TOP + i * 0.016)
    prop.lathe(f"plate_{i}", PLATE, c, PT, seg=24)

# --- жестяная кружка с завальцованным краем и ручкой справа
MX, MY = 0.48, -0.035
MUG = [(0, 0), (0.045, 0), (0.048, 0.004), (0.048, 0.112), (0.0495, 0.1135), (0.048, 0.115), (0.0445, 0.113),
       (0.0445, 0.008), (0, 0.008)]
prop.lathe("mug", MUG, (MX, MY, TOP), ST, seg=24)
prop.tube("mug_handle", rounded_path([(MX + 0.046, MY, TOP + 0.095), (MX + 0.078, MY, TOP + 0.095),
                                      (MX + 0.078, MY, TOP + 0.03), (MX + 0.046, MY, TOP + 0.03)], 0.014, steps=5),
          0.0055, ST, seg=8)

# --- щётка-колодка лежит наискось перед стопкой тарелок
brush = prop.mark()
prop.box("brush_back", -0.05, 0.05, -0.022, 0.022, TOP + 0.016, TOP + 0.036, WD, "X", bevel=(0.005, 2))
prop.box("brush_bristle", -0.046, 0.046, -0.019, 0.019, TOP, TOP + 0.016, BR, "X", bevel=(0.002, 1))
prop.transform(prop.since(brush), Matrix.Translation((0.2, -0.215, 0.0)) @ Matrix.Rotation(math.radians(28), 4, "Z"))

prop.build({
    "Body": (0.0, 0.0, 0.0),
    "Door_L": (-(CW2 - STILE), YF, DZ0),
    "Door_R": (CW2 - STILE, YF, DZ0),
})
