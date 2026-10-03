# -*- coding: utf-8 -*-
"""
Два ящика по спрайту: нижний закрыт, верхний открыт, внутри банка, бруски и тряпка.

Запуск из корня проекта:
    blender -b --factory-startup --python models/crates/crates.py -- [--fast]

Единицы — метры, начало координат — центр пола под нижним ящиком, длинная сторона
смотрит в -Y (после экспорта в glTF это +Z). Ширина 0,85 м — из реестра DIMENSIONS,
остальные размеры — по пропорциям спрайта. Крышка верхнего ящика — отдельный узел
Lid: его локальная ось X — ось петель, в покое крышка приоткрыта, как на спрайте.
"""
import math
import os
import sys

from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
from kit import Prop, catmull, resample, slot, smoothstep, srgb, xr  # noqa: E402

prop = Prop("crates")

# Цвета сняты со спрайта (см. models/tools/palette.py)
WOOD = dict(dark=srgb(36, 26, 18), mid=srgb(74, 55, 38), light=srgb(112, 88, 62), streak=srgb(150, 124, 92),
            scratch=srgb(166, 142, 110), edge=srgb(156, 130, 100), dust=srgb(120, 108, 94))
PALE = dict(dark=srgb(120, 92, 62), mid=srgb(168, 136, 98), light=srgb(196, 166, 124), streak=srgb(212, 186, 146),
            scratch=srgb(220, 198, 160), edge=srgb(214, 190, 150), dust=srgb(170, 158, 140))
IRON = dict(iron=srgb(62, 52, 45), iron_dark=srgb(30, 27, 24), iron_edge=srgb(124, 116, 104),
            rust=srgb(112, 66, 40), rust_dark=srgb(70, 42, 28))
STEEL = dict(iron=srgb(150, 144, 136), iron_dark=srgb(98, 94, 90), iron_edge=srgb(206, 202, 192),
             rust=srgb(128, 86, 58), rust_dark=srgb(88, 60, 42), metal=0.6, rough=0.32, rust_from=0.60, rust_to=0.72)
CLOTH = dict(dark=srgb(78, 74, 60), mid=srgb(118, 112, 94), light=srgb(146, 140, 120))

W = prop.wood("Wood", WOOD)
P = prop.wood("PaleWood", PALE)
M = prop.metal("Iron", IRON, rivets=0.055)
S = prop.metal("Steel", STEEL)
C = prop.fabric("Cloth", CLOTH)

T = 0.018          # толщина доски
CLEAT = 0.022      # толщина угловых планок
PLATE = 0.003      # толщина железа


def rows(a0, a1, n, gap):
    """Делит отрезок на n досок с зазорами."""
    h = (a1 - a0 - gap * (n - 1)) / n
    return [(a0 + i * (h + gap), a0 + i * (h + gap) + h) for i in range(n)]


def crate(tag, hl, hd, h, floor, hole, cleat_w, end_cleat_w, closed_top):
    """
    Ящик из досок: дно, по три доски на стенку, прорези-ручки в верхних досках торцов,
    вертикальные планки на углах и железные уголки с заклёпками.
    hl, hd — половины длины и глубины короба по доскам, h — высота.
    """
    walls = rows(floor, h - T if closed_top else h, 3, 0.004)
    prop.box(f"{tag}_floor", -hl, hl, -hd, hd, 0.0, floor, W, "X")
    for side, (y0, y1) in (("front", (-hd, -hd + T)), ("back", (hd - T, hd))):
        for i, (z0, z1) in enumerate(walls):
            prop.box(f"{tag}_{side}_{i}", -hl, hl, y0, y1, z0, z1, W, "X", bevel=(0.003, 1))
    for s in (-1, 1):
        x0, x1 = xr(hl - T, hl, s)
        for i, (z0, z1) in enumerate(walls):
            cut = ()
            if i == 2:
                w, hh = hole
                cut = (prop.cutter(f"{tag}_hole_{s}", slot(0.0, (z0 + z1) / 2, w, hh), "X", x0 - 0.01, x1 + 0.01),)
            prop.box(f"{tag}_end_{s}_{i}", x0, x1, -hd + T, hd - T, z0, z1, W, "Y", bevel=(0.003, 1), cutters=cut)
    if closed_top:
        for i, (y0, y1) in enumerate(rows(-hd, hd, 4, 0.005)):
            prop.box(f"{tag}_top_{i}", -hl, hl, y0, y1, h - T, h, W, "X", bevel=(0.003, 1))
    for s in (-1, 1):
        # планки на длинных стенках и на торцах вместе образуют угловые стойки
        for side, (y0, y1) in (("front", (-hd - CLEAT, -hd)), ("back", (hd, hd + CLEAT))):
            prop.box(f"{tag}_cleat_{side}_{s}", *xr(hl - cleat_w, hl, s), y0, y1, 0.0, h, W, "Z")
        for side, (y0, y1) in (("front", (-hd - CLEAT, -hd + end_cleat_w)), ("back", (hd - end_cleat_w, hd + CLEAT))):
            prop.box(f"{tag}_ecleat_{side}_{s}", *xr(hl, hl + CLEAT, s), y0, y1, 0.0, h, W, "Z")
        # железный уголок: пластина на лицевой стороне стойки и пластина на торцевой
        ox = hl + CLEAT
        for side, sy in (("front", -1), ("back", 1)):
            oy = sy * (hd + CLEAT)
            prop.box(f"{tag}_plate_a_{side}_{s}", *xr(ox - 0.036, ox, s), *sorted((oy, oy + sy * PLATE)),
                     0.004, h - 0.004, M, "Z", bevel=(0.001, 1))
            prop.box(f"{tag}_plate_b_{side}_{s}", *xr(ox, ox + PLATE, s), *sorted((oy + sy * PLATE, oy - sy * 0.033)),
                     0.004, h - 0.004, M, "Z", bevel=(0.001, 1))


def circle(cx, cy, r, seg=24):
    return [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]


# ---------------------------------------------------------------- нижний ящик
BL, BD, BH = 0.40, 0.24, 0.34
prop.log("build geometry")
crate("low", BL, BD, BH, floor=T, hole=(0.13, 0.045), cleat_w=0.085, end_cleat_w=0.075, closed_top=True)
for s in (-1, 1):
    for side, sy in (("front", -1), ("back", 1)):
        # железные полосы на досках длинных стенок, сразу за угловыми планками
        prop.box(f"low_strap_{side}_{s}", *xr(BL - 0.125, BL - 0.09, s), *sorted((sy * BD, sy * (BD + PLATE))),
                 0.004, BH - 0.004, M, "Z", bevel=(0.001, 1))

# ---------------------------------------------------------------- верхний ящик (строится в своей системе координат)
TL, TD, TH = 0.30, 0.17, 0.25
mark = prop.mark()
crate("up", TL, TD, TH, floor=0.016, hole=(0.11, 0.04), cleat_w=0.065, end_cleat_w=0.06, closed_top=False)
# вкладыш-полка, на ней лежит содержимое
for i, (y0, y1) in enumerate(rows(-TD + T, TD - T, 2, 0.006)):
    prop.box(f"up_tray_{i}", -TL + T, TL - T, y0, y1, 0.150, 0.164, W, "X", bevel=(0.002, 1))
HINGE = Vector((0.0, TD, TH))    # задняя верхняя кромка короба — ось петель крышки
for s in (-1, 1):
    prop.cylinder(f"up_hinge_{s}", (s * 0.16, TD, TH), 0.008, 0.05, "X", M, seg=10)

# банка: корпус с утопленной крышкой, два ребра жёсткости и завальцованный край
CX, CY = 0.07, 0.045
prop.cylinder("can_body", (CX, CY, 0.2365), 0.062, 0.145, "Z", S, seg=24, bevel=(0.0015, 1))
for k, zc in enumerate((0.212, 0.260)):
    prop.cylinder(f"can_rib_{k}", (CX, CY, zc), 0.0635, 0.005, "Z", S, seg=24, bevel=None)
rim_cut = prop.cutter("can_rim_cut", circle(CX, CY, 0.057), "Z", 0.305, 0.325)
prop.cylinder("can_rim", (CX, CY, 0.3135), 0.0645, 0.009, "Z", S, seg=24, bevel=(0.0015, 1), cutters=(rim_cut,))

# бруски: тёмный и светлый, чуть развёрнуты
for name, mat, (x0, x1, y0, y1, z1), turn in (("block_dark", W, (-0.255, -0.185, 0.02, 0.10, 0.250), -15),
                                              ("block_pale", P, (-0.175, -0.055, -0.045, 0.035, 0.216), 10)):
    ob = prop.box(name, x0, x1, y0, y1, 0.164, z1, mat, "X", bevel=(0.004, 1))
    c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0.0))
    prop.transform([ob], Matrix.Translation(c) @ Matrix.Rotation(math.radians(turn), 4, "Z") @ Matrix.Translation(-c))
# стопка сложенной ветоши справа, на ней тряпка лежит почти вровень с краем, как на спрайте
prop.box("rag_pile_low", 0.15, 0.28, -0.13, 0.06, 0.164, 0.200, C, "X", bevel=(0.010, 3))
pile = prop.box("rag_pile_up", 0.16, 0.275, -0.12, 0.05, 0.200, 0.232, C, "X", bevel=(0.010, 3))
prop.transform([pile], Matrix.Translation((0.217, -0.035, 0)) @ Matrix.Rotation(math.radians(-4), 4, "Z")
               @ Matrix.Translation((-0.217, 0.035, 0)))


def rag(name, x0, x1, nx=14, ny=36):
    """
    Тряпка, перекинутая через переднюю стенку: лежит на ветоши, перегибается через верх
    стенки (над угловой стойкой — дальше от неё) и свисает с неровным краем и складками.
    """
    cols = []
    for i in range(nx + 1):
        u = i / nx
        x = x0 + (x1 - x0) * u
        out = 0.026 * smoothstep(0.222, 0.240, x)                  # обход угловой стойки
        hang = 0.11 + 0.025 * math.sin(2 * math.pi * (1.3 * u + 0.1))
        yo = -TD - out                                             # наружная грань стенки или стойки
        ctrl = [(0.05, 0.236), (-0.06, 0.237), (-0.12, 0.241), (-TD + T + 0.004, 0.2535),
                ((-TD + T + yo) / 2, 0.2585), (yo - 0.005, 0.2495), (yo - 0.008, TH - hang * 0.5),
                (yo - 0.013, TH - hang)]
        col = []
        for (y, z), (ty, tz) in resample(catmull(ctrl), ny):
            ny_, nz_ = tz, -ty                                     # нормаль в плоскости профиля: вверх / наружу
            h = smoothstep(yo, yo - 0.02, y) * smoothstep(TH, TH - hang, z)   # доля свисающей части
            disp = (0.002 + 0.004 * (0.5 + 0.5 * math.sin(2 * math.pi * (3.1 * u + 0.7 * y * 10)))
                    + h * h * 0.013 * (0.5 + 0.5 * math.sin(2 * math.pi * (2.3 * u + 0.35 + 1.5 * z))))
            xc = x + (0.207 - x) * 0.08 * h                          # складки собираются книзу
            col.append((xc, y + ny_ * disp, z + nz_ * disp))
        cols.append(col)
    verts = [cols[i][j] for j in range(ny + 1) for i in range(nx + 1)]
    faces = [(j * (nx + 1) + i, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1, j * (nx + 1) + i + 1)
             for j in range(ny) for i in range(nx)]
    return prop.mesh(name, verts, faces, C, "X", bevel=None, closed=False)


rag("cloth", 0.14, 0.275)
upper_body = prop.since(mark)

# крышка: 4 доски и 2 поперечные планки снизу, приоткрыта на 58° вокруг задней кромки
mark_lid = prop.mark()
for i, (y0, y1) in enumerate(rows(-TD - CLEAT, TD, 4, 0.004)):
    prop.box(f"lid_plank_{i}", -TL - CLEAT, TL + CLEAT, y0, y1, TH, TH + 0.016, W, "X", group="Lid", bevel=(0.003, 1))
for s in (-1, 1):
    prop.box(f"lid_batten_{s}", *xr(0.21, 0.27, s), -TD + 0.02, TD - 0.02, TH - 0.016, TH, W, "Y", group="Lid",
             bevel=(0.003, 1))
lid = prop.since(mark_lid)
LID_OPEN = -58
prop.transform(lid, Matrix.Translation(HINGE) @ Matrix.Rotation(math.radians(LID_OPEN), 4, "X")
               @ Matrix.Translation(-HINGE))

# верхний ящик целиком ставится на нижний с поворотом на 7°
TURN = 7
UP = Matrix.Translation((0.03, 0.0, BH)) @ Matrix.Rotation(math.radians(TURN), 4, "Z")
prop.transform(upper_body + lid, UP)

prop.build({
    "Body": (0.0, 0.0, 0.0),
    "Lid": (tuple(UP @ HINGE), (0.0, 0.0, TURN)),
})
