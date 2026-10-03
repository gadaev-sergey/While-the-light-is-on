# -*- coding: utf-8 -*-
"""Общие пути, описания моделей (model.json) и доступ к исходным спрайтам."""
import json
import os

import bpy
import numpy as np

PROJECT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(PROJECT, "models")
GAME_MODELS = os.path.join(PROJECT, "public", "assets", "base", "models")   # отсюда игра грузит GLB
SPRITE_SHEET = os.path.join(PROJECT, "public", "assets", "base", "interior-front.png")


def model_dir(name):
    """Папка модели: скрипт сборки, model.json, GLB, .blend, текстуры и рендеры."""
    return os.path.join(MODELS, name)


def model_info(name):
    """Описание модели: название, кадр спрайта, ракурс сравнения, действие для просмотра."""
    with open(os.path.join(model_dir(name), "model.json"), encoding="utf-8") as f:
        return json.load(f)


def sprite(name):
    """RGBA-кадр предмета с листа interior-front.png; строки идут снизу вверх, как хранит Blender."""
    im = bpy.data.images.load(SPRITE_SHEET, check_existing=True)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    x, y, cw, ch = model_info(name)["sprite"]
    return a[h - y - ch:h - y, x:x + cw].copy()
