# -*- coding: utf-8 -*-
"""
Вырезает предмет со спрайта без зелёного фона — картинка для страницы просмотра.

Запуск из корня проекта:
    blender -b --factory-startup --python models/tools/key_sprite.py -- [wardrobe]
"""
import os
import sys

import bpy
import numpy as np

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import model_dir, sprite  # noqa: E402

name = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "wardrobe"
a = sprite(name)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
excess = g - np.maximum(r, b)
a[..., 1] = np.where(excess > 0, np.maximum(r, b) + np.minimum(excess, 0.02), g)  # гасим зелёную кайму
a[..., 3] = np.clip(1.0 - (excess - 0.08) / 0.22, 0.0, 1.0)
ys, xs = np.where(a[..., 3] > 0.5)
a = a[max(ys.min() - 3, 0):ys.max() + 4, max(xs.min() - 3, 0):xs.max() + 4]

out_dir = model_dir(name)
os.makedirs(out_dir, exist_ok=True)
im = bpy.data.images.new("keyed", a.shape[1], a.shape[0], alpha=True)
im.pixels.foreach_set(np.ascontiguousarray(a).ravel())
im.filepath_raw = os.path.join(out_dir, "sprite_keyed.png")
im.file_format = "PNG"
im.save()
print("saved", im.filepath_raw)
