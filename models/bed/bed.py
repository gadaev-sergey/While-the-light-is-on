# -*- coding: utf-8 -*-
"""
Железная кровать по спрайту: рама из гнутых труб, полосатый матрас, подушка и одеяло.

Запуск из корня проекта:
    blender -b --factory-startup --python models/bed/bed.py -- [--fast]

Единицы — метры, начало координат — центр пола под кроватью, длинная сторона смотрит
в -Y (после экспорта в glTF это +Z), изголовье слева (-X). Длина 2,0 м и ширина 0,9 м —
из реестра DIMENSIONS, высоты — по пропорциям спрайта. Подвижных частей нет.
"""
import math
import os
import sys

from mathutils import Matrix

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
from kit import Prop, catmull, resample, rounded_path, smoothstep, srgb  # noqa: E402

prop = Prop("bed")

# Цвета сняты со спрайта (см. models/tools/palette.py)
IRON = dict(iron=srgb(84, 74, 66), iron_dark=srgb(36, 33, 30), iron_edge=srgb(140, 128, 114),
            rust=srgb(112, 68, 42), rust_dark=srgb(70, 44, 30), rust_from=0.52, rust_to=0.66, rough=0.55)
MATTRESS = dict(dark=srgb(112, 100, 94), mid=srgb(158, 147, 139), light=srgb(198, 190, 182),
                stripe=srgb(122, 112, 106))
PILLOW = dict(dark=srgb(132, 122, 114), mid=srgb(178, 168, 160), light=srgb(206, 198, 190))
BLANKET = dict(dark=srgb(52, 49, 47), mid=srgb(68, 64, 62), light=srgb(82, 78, 76))

M = prop.metal("Iron", IRON)
TK = prop.fabric("Ticking", MATTRESS, stripes=(0.03, 0.35))
P = prop.fabric("Pillow", PILLOW)
B = prop.fabric("Blanket", BLANKET)

L2, W2 = 0.985, 0.43                  # полудлина и полуширина по осям стоек
R_POST, R_RAIL, R_BAR = 0.02, 0.013, 0.0075
TOP = 0.49                            # верх матраса


def headboard(tag, x, top, rails, bars):
    """Спинка: гнутая П-образная труба, поперечины, вертикальные прутья и набалдашники ножек."""
    prop.tube(f"{tag}_frame", rounded_path([(x, -W2, 0.024), (x, -W2, top), (x, W2, top), (x, W2, 0.024)],
                                           0.085, steps=8), R_POST, M)
    for k, z in enumerate(rails):
        prop.tube(f"{tag}_rail_{k}", [(x, -W2, z), (x, W2, z)], R_RAIL, M, seg=10)
    for k in range(bars):
        y = -W2 + 2 * W2 * (k + 1) / (bars + 1)
        prop.tube(f"{tag}_bar_{k}", [(x, y, min(rails)), (x, y, top)], R_BAR, M, seg=8)
    for s in (-1, 1):
        prop.cylinder(f"{tag}_foot_{s}", (x, s * W2, 0.012), 0.027, 0.024, "Z", M, seg=12, bevel=(0.004, 1))


def pillow(lx, ly, h, nx=12, ny=16):
    """
    Подушка: верх и низ сходятся в шов по краю, в середине толще, у изголовья вмятина от головы.
    Возвращает вершины и грани в собственных координатах (центр в нуле).
    """
    def f(u, v):
        base = (1 - abs(u) ** 3) ** 0.45 * (1 - abs(v) ** 3) ** 0.45
        dent = math.exp(-((u + 0.15) ** 2 + (v * 0.8) ** 2) / 0.18)
        return h / 2 * base * (1 - 0.12 * dent)

    index, verts = {}, []

    def vid(i, j, top):
        rim = i in (0, nx) or j in (0, ny)
        key = (i, j, True if rim else top)
        if key not in index:
            u, v = 2 * i / nx - 1, 2 * j / ny - 1
            z = f(u, v) + 0.004 * math.sin(7 * u + 3 * v) if top else -0.8 * f(u, v)
            index[key] = len(verts)
            verts.append((u * lx / 2, v * ly / 2, z))
        return index[key]

    faces = []
    for i in range(nx):
        for j in range(ny):
            faces.append((vid(i, j, True), vid(i + 1, j, True), vid(i + 1, j + 1, True), vid(i, j + 1, True)))
            faces.append((vid(i, j + 1, False), vid(i + 1, j + 1, False), vid(i + 1, j, False), vid(i, j, False)))
    return verts, faces


def blanket(name, x0, x1, nx=40, ny=28):
    """
    Одеяло: лежит на матрасе с заломами, у подушки сбито в валик, спереди перевешивается
    через край и свисает ниже рамы неровным краем (ниже всего в середине, выше у спинок);
    складки углубляются книзу.
    """
    cols = []
    for i in range(nx + 1):
        u = i / nx
        x = x0 + (x1 - x0) * u
        phase = 2 * math.pi * (6.4 * u + 0.25) + 1.3 * math.sin(2 * math.pi * 1.7 * u)
        wave = (0.5 + 0.5 * math.sin(phase)) ** 1.5                # профиль складок свисающей части
        hem = 0.11 + (0.40 if u < 0.55 else 0.84) * (u - 0.55) ** 2 - 0.03 * (0.5 + 0.5 * math.sin(phase))
        ctrl = [(0.445, TOP - 0.05), (0.43, TOP - 0.01), (0.40, TOP + 0.012), (0.15, TOP + 0.02),
                (-0.10, TOP + 0.02), (-0.36, TOP + 0.014), (-0.405, TOP + 0.004), (-0.428, TOP - 0.03),
                (-0.442, TOP - 0.09), (-0.452, 0.30), (-0.466, hem)]
        col = []
        for (y, z), (ty, tz) in resample(catmull(ctrl), ny):
            ny_, nz_ = tz, -ty                                  # нормаль профиля: вверх на матрасе, наружу спереди
            h = smoothstep(-0.415, -0.44, y) * smoothstep(TOP - 0.03, hem, z)   # доля свисающей части
            yn = y / 0.9
            # сверху — косые гребни с острыми вершинами и мелкие заломы
            ridge = 1 - abs(math.sin(math.pi * (3.2 * u + 1.7 * yn + 0.2)))
            cross = 1 - abs(math.sin(math.pi * (2.1 * u - 1.3 * yn + 0.6)))
            rumple = (1 - h) * (0.03 * ridge ** 3 + 0.015 * cross ** 3
                                + 0.005 * (0.5 + 0.5 * math.sin(2 * math.pi * (6.3 * u - 2.1 * yn))))
            roll = (1 - h) * 0.04 * math.exp(-(u / 0.06) ** 2)   # у подушки одеяло сбито в валик
            fold = h ** 1.2 * 0.06 * wave                         # складки углубляются книзу
            disp = 0.002 + rumple + roll + fold + 0.035 * h * h   # низ отходит от кровати
            xc = x + ((x0 + x1) / 2 - x) * 0.05 * h + 0.012 * h * math.sin(phase + 1.2)   # край гуляет
            # тени и блики, как на рисунке: тёмные узкие впадины и светлые гребни свисающих складок,
            # теневой склон у гребней сверху (свет слева), щель под валиком
            w = 0.5 + 0.5 * math.sin(phase)
            valley = h ** 0.45 * 0.6 * (1 - w) ** 1.3 - h * 0.18 * w ** 3
            ridge_l = 1 - abs(math.sin(math.pi * (3.2 * u + 1.7 * yn + 0.2 - 0.05)))
            flank = (1 - h) * 0.9 * max(0.0, ridge_l ** 3 - ridge ** 3)
            under_roll = (1 - h) * 0.30 * math.exp(-((u - 0.085) / 0.035) ** 2)
            col.append(((xc, y + ny_ * disp, z + nz_ * disp), min(0.65, valley + flank + under_roll)))
        cols.append(col)
    verts = [cols[i][j][0] for j in range(ny + 1) for i in range(nx + 1)]
    shade = [cols[i][j][1] for j in range(ny + 1) for i in range(nx + 1)]
    faces = [(j * (nx + 1) + i, (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1, j * (nx + 1) + i + 1)
             for j in range(ny) for i in range(nx)]
    return prop.mesh(name, verts, faces, B, "X", bevel=None, closed=False, attrs={"fold": shade})


prop.log("build geometry")
# --- спинки: изголовье выше, изножье ниже
headboard("head", -L2, 0.96, (0.40, 0.78), 4)
headboard("foot", L2, 0.70, (0.40, 0.56), 3)

# --- боковые уголки с накладками и болтами на концах
for s, side in ((-1, "front"), (1, "back")):
    y = s * W2
    prop.box(f"rail_{side}", -L2 + R_POST, L2 - R_POST, *sorted((y - 0.002, y + 0.002)), 0.262, 0.31, M, "X",
             bevel=(0.001, 1))
    prop.box(f"rail_flange_{side}", -L2 + R_POST, L2 - R_POST, *sorted((y, y - s * 0.03)), 0.305, 0.31, M, "X",
             bevel=(0.001, 1))
    for e in (-1, 1):
        prop.box(f"bracket_{side}_{e}", *sorted((e * (L2 - 0.13), e * (L2 - 0.025))),
                 *sorted((y + s * 0.002, y + s * 0.006)), 0.255, 0.317, M, "X", bevel=(0.0015, 1))
        for k, xo in enumerate((0.05, 0.10)):
            prop.cylinder(f"bolt_{side}_{e}_{k}", (e * (L2 - xo), y + s * 0.009, 0.286), 0.0085, 0.006, "Y", M,
                          seg=8, bevel=(0.002, 1))

# --- матрас в тике со скруглёнными рёбрами
prop.box("mattress", -0.955, 0.955, -0.415, 0.415, 0.31, TOP, TK, "X", bevel=(0.035, 4))

# --- подушка у изголовья, приподнята к спинке
pv, pf = pillow(0.40, 0.62, 0.17)
pil = prop.mesh("pillow", pv, pf, P, "X", bevel=None, closed=True, sharp=85)   # острым остаётся только шов
prop.transform([pil], Matrix.Translation((-0.73, 0.0, TOP + 0.10)) @ Matrix.Rotation(math.radians(18), 4, "Y"))

# --- одеяло от подушки почти до изножья
blanket("blanket", -0.52, 0.93)

prop.build({"Body": (0.0, 0.0, 0.0)})
