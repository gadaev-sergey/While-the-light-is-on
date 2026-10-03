# -*- coding: utf-8 -*-
"""
Превью готовой модели (models/<name>/<name>.blend) в models/<name>/renders/:
  front.png   — ракурс спрайта (compare в model.json) для сравнения
  compare.png — спрайт и модель рядом
  iso.png     — изометрия, как в 2.5D-игре
  action.png  — модель после действия из model.json (дверцы открыты, крышка закрыта…)

Камеры подгоняются по габаритам модели. Запуск из корня проекта:
    blender -b --factory-startup --python models/tools/render.py -- <name> [--fast]
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.dont_write_bytecode = True  # без __pycache__ рядом со скриптами
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import model_dir, model_info, sprite  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
NAME = next(a for a in ARGS if not a.startswith("--"))
FAST = "--fast" in ARGS
OUT = model_dir(NAME)
REN = os.path.join(OUT, "renders")
os.makedirs(REN, exist_ok=True)
INFO = model_info(NAME)

bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, f"{NAME}.blend"))
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "METAL"
scene.cycles.device = "GPU"
scene.cycles.samples = 24 if FAST else 96
scene.cycles.use_denoising = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

world = bpy.data.worlds.new("World")
scene.world = world
if world.node_tree is None:
    world.use_nodes = True
wnt = world.node_tree
bg = next((n for n in wnt.nodes if n.type == "BACKGROUND"), None)
if bg is None:
    wnt.nodes.clear()
    bg = wnt.nodes.new("ShaderNodeBackground")
    wnt.links.new(bg.outputs[0], wnt.nodes.new("ShaderNodeOutputWorld").inputs["Surface"])
bg.inputs["Color"].default_value = (0.42, 0.42, 0.44, 1.0)
bg.inputs["Strength"].default_value = 1.0


def sun(name, rot_deg, energy, angle=8.0):
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = energy
    ld.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(ob)
    ob.rotation_euler = [math.radians(a) for a in rot_deg]


sun("key", (50, 0, -30), 2.6)
sun("fill", (65, 0, 55), 0.6)
MESHES = [o for o in scene.objects if o.type == "MESH"]


def bounds():
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in MESHES for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return pts, (lo + hi) / 2, (hi - lo).length / 2


def view_dir(azimuth, elevation):
    """Направление от модели к камере: азимут от фасада (-Y) против часовой, угол над горизонтом."""
    a, e = math.radians(azimuth), math.radians(elevation)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


def camera(name, direction, ortho):
    """Камера, которая смотрит на центр модели; возвращает её и размер модели в кадре."""
    pts, center, radius = bounds()
    cd = bpy.data.cameras.new(name)
    cd.clip_end = 100
    ob = bpy.data.objects.new(name, cd)
    scene.collection.objects.link(ob)
    rot = (-direction).to_track_quat("-Z", "Y")
    ob.rotation_euler = rot.to_euler()
    inv = rot.to_matrix().transposed()
    local = [inv @ (p - center) for p in pts]
    ex = max(q.x for q in local) - min(q.x for q in local)
    ey = max(q.y for q in local) - min(q.y for q in local)
    if ortho:
        cd.type = "ORTHO"
        ob.location = center + direction * 10
    else:
        cd.lens = 35
        fov = 2 * math.atan(18 / cd.lens)
        ob.location = center + direction * (radius / math.sin(fov / 2) * 1.02)
    return ob, ex, ey


def render(cam, name, w, h):
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    path = os.path.join(REN, name)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path, flush=True)
    return path


def load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a


def save(a, path):
    h, w = a.shape[:2]
    im = bpy.data.images.new("tmp", w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(a, dtype=np.float32).ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)


def resize(a, nh, nw):
    h, w = a.shape[:2]
    ys, xs = np.linspace(0, h - 1, nh), np.linspace(0, w - 1, nw)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, h - 1), np.minimum(x0 + 1, w - 1)
    wy, wx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    top = a[y0][:, x0] * (1 - wx) + a[y0][:, x1] * wx
    bot = a[y1][:, x0] * (1 - wx) + a[y1][:, x1] * wx
    return top * (1 - wy) + bot * wy


def crop_alpha(a):
    ys, xs = np.where(a[..., 3] > 0.5)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def compose(images, height=900, pad=50, bg=(0.15, 0.16, 0.17)):
    tiles = []
    for a in images:
        a = crop_alpha(a)
        h, w = a.shape[:2]
        tiles.append(resize(a, height, max(1, round(w * height / h))))
    canvas = np.zeros((height + 2 * pad, sum(t.shape[1] for t in tiles) + pad * (len(tiles) + 1), 4), np.float32)
    canvas[..., :3] = bg
    canvas[..., 3] = 1.0
    x = pad
    for t in tiles:
        h, w = t.shape[:2]
        region = canvas[pad:pad + h, x:x + w]
        alpha = t[..., 3:4]
        region[..., :3] = t[..., :3] * alpha + region[..., :3] * (1 - alpha)
        x += w + pad
    return canvas


def apply_action(info):
    """Поза после действия: повороты в осях узла и сдвиги, заданные в осях glTF (Y вверх, Z к зрителю)."""
    for mv in info.get("moves", []):
        ob = bpy.data.objects[mv["node"]]
        if "rotate" in mv:
            rx, ry, rz = (math.radians(a) for a in mv["rotate"])
            rot = Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(ry, 4, "Z") @ Matrix.Rotation(-rz, 4, "Y")
            ob.matrix_world = ob.matrix_world @ rot
        if "move" in mv:
            mx, my, mz = mv["move"]
            ob.location += Vector((mx, -mz, my))


def perspective(name, direction, distance, margin=1.06):
    """Перспективная камера на заданном расстоянии, объектив подобран так, чтобы модель вошла в кадр."""
    pts, center, _ = bounds()
    cd = bpy.data.cameras.new(name)
    cd.clip_end = 100
    ob = bpy.data.objects.new(name, cd)
    scene.collection.objects.link(ob)
    rot = (-direction).to_track_quat("-Z", "Y")
    ob.rotation_euler = rot.to_euler()
    ob.location = center + direction * distance
    inv = rot.to_matrix().transposed()
    local = [inv @ (p - ob.location) for p in pts]
    hx = max(abs(q.x / -q.z) for q in local) * margin
    hy = max(abs(q.y / -q.z) for q in local) * margin
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24
    cd.lens = 12 / hy
    return ob, hx, hy


# вид как на спрайте — для сравнения (ортографический или перспективный, если задано расстояние)
cmp = INFO.get("compare", {})
direction = view_dir(cmp.get("azimuth", 0), cmp.get("elevation", 0))
if "distance" in cmp:
    cam, ex, ey = perspective("cam_front", direction, cmp["distance"])
else:
    cam, ex, ey = camera("cam_front", direction, ortho=True)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.ortho_scale = ey * 1.06
front = render(cam, "front.png", max(400, min(1600, round(1000 * ex / ey))), 1000)

s = sprite(NAME)
r, g, b = s[..., 0], s[..., 1], s[..., 2]
s[..., 3] = np.where((g > r + 0.2) & (g > b + 0.2), 0.0, 1.0)
save(compose([s, load(front)]), os.path.join(REN, "compare.png"))
print("rendered", os.path.join(REN, "compare.png"), flush=True)

# изометрия, как в 2.5D-игре
cam, ex, ey = camera("cam_iso", view_dir(35, 30), ortho=True)
cam.data.ortho_scale = max(ex, ey) * 1.08
render(cam, "iso.png", 1000, 1000)

# поза после действия (или просто перспектива, если действия нет)
if "action" in INFO:
    apply_action(INFO["action"])
cam, _, _ = camera("cam_action", view_dir(28, 24), ortho=False)
render(cam, "action.png" if "action" in INFO else "persp.png", 1000, 1000)
