# -*- coding: utf-8 -*-
"""
Габариты готовой модели так, как их меряет игра, — строка для DIMENSIONS.furniture.

Запуск из корня проекта:
    blender -b --factory-startup --python models/tools/bounds.py -- [wardrobe]

Игра строит Box3 по рамкам узлов (рамка каждой детали, перенесённая в мир) и подгоняет модель
под размер из реестра. Если записать туда эти числа, масштаб останется равным 1.
"""
import os
import sys

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import GAME_MODELS, model_dir, model_info  # noqa: E402

name = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "wardrobe"
info = model_info(name)
glb = os.path.join(GAME_MODELS if info.get("game") else model_dir(name), f"{name}.glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
pts = [ob.matrix_world @ Vector(c) for ob in bpy.context.scene.objects if ob.type == "MESH" for c in ob.bound_box]
lo = [min(p[i] for p in pts) for i in range(3)]
hi = [max(p[i] for p in pts) for i in range(3)]
# после импорта оси снова блендеровские: ширина — X, высота — Z, глубина — Y
w, h, d = hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]


def num(v):
    return f"{v:.3f}".rstrip("0").rstrip(".").removeprefix("0")


print(f"{os.path.relpath(glb)}: {w:.3f} x {h:.3f} x {d:.3f} м (Ш x В x Г)")
print(f"  {info.get('game', name)}:{{width:{num(w)},height:{num(h)},depth:{num(d)}}},")
