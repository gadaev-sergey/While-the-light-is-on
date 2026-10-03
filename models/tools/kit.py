# -*- coding: utf-8 -*-
"""
Общий конвейер реквизита для Blender: детали из досок и фурнитуры, процедурные
материалы, удаление скрытых граней, развёртка, запекание в один атлас и экспорт GLB.

Скрипт модели создаёт Prop, добавляет материалы и детали и вызывает build():

    prop = Prop("wardrobe")
    wood = prop.wood("Wood", palette)
    prop.box("side", x0, x1, y0, y1, z0, z1, wood, grain="Z")
    prop.build({"Body": (0, 0, 0)})

Единицы — метры, лицевая сторона смотрит в -Y (после экспорта в glTF это +Z).
Каждая деталь — отдельный объект, его локальная ось X идёт вдоль волокон: шейдеры
работают в координатах объекта, поэтому у стоек рисунок вертикальный, у царг — горизонтальный.
"""
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

import shutil

from common import GAME_MODELS, model_dir, model_info


def srgb(r, g, b):
    def f(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


ROT = {
    "X": Matrix.Identity(3),
    "Y": Matrix.Rotation(math.radians(90), 3, "Z"),
    "Z": Matrix.Rotation(math.radians(-90), 3, "Y"),
}
BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def xr(a, b, s):
    """Диапазон по X для правой детали (s=+1) или её зеркала слева (s=-1)."""
    return (min(s * a, s * b), max(s * a, s * b))


def stadium(cx, cz, w, h, seg=10):
    """Контур «стадион» (прямоугольник со скруглёнными концами), вертикальный."""
    r = w / 2
    pts = []
    for i in range(seg + 1):
        a = math.pi * i / seg
        pts.append((cx + r * math.cos(a), cz + h / 2 - r + r * math.sin(a)))
    for i in range(seg + 1):
        a = math.pi + math.pi * i / seg
        pts.append((cx + r * math.cos(a), cz - h / 2 + r + r * math.sin(a)))
    return pts


def slot(cu, cv, w, h, seg=6):
    """Горизонтальная прорезь-ручка: «стадион», вытянутый по первой координате."""
    return [(cu + (v - cv), cv + (u - cu)) for u, v in stadium(cu, cv, h, w, seg)][::-1]


def rounded_path(points, radius, steps=6):
    """Ломаная, у которой каждый внутренний угол скруглён дугой радиуса radius (как у гнутой трубы)."""
    pts = [Vector(p) for p in points]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        d0, d1 = (p0 - p1).normalized(), (p2 - p1).normalized()
        ang = d0.angle(d1)
        if ang > math.pi - 1e-3:
            out.append(p1)
            continue
        t = min(radius / math.tan(ang / 2), (p0 - p1).length / 2, (p2 - p1).length / 2)
        a, b = p1 + d0 * t, p1 + d1 * t
        for k in range(steps + 1):
            s = k / steps
            out.append(a * (1 - s) ** 2 + p1 * (2 * s * (1 - s)) + b * (s * s))
    out.append(pts[-1])
    return out


# ---------------------------------------------------------------- кривые для ткани
def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def catmull(points, per=24):
    """Гладкая кривая через точки на плоскости — сплайн Катмулла–Рома."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    for k in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[k - 1:k + 3]
        for i in range(per):
            t = i / per
            out.append(tuple(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t
                                    + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t ** 3) for d in (0, 1)))
    out.append(points[-1])
    return out


def resample(curve, n):
    """n+1 точек, равномерно по длине кривой, и касательные в них."""
    acc = [0.0]
    for a, b in zip(curve, curve[1:]):
        acc.append(acc[-1] + math.dist(a, b))
    res = []
    k = 0
    for j in range(n + 1):
        target = acc[-1] * j / n
        while k < len(acc) - 2 and acc[k + 1] < target:
            k += 1
        f = (target - acc[k]) / max(acc[k + 1] - acc[k], 1e-9)
        a, b = curve[k], curve[k + 1]
        tangent = ((b[0] - a[0]), (b[1] - a[1]))
        ln = math.hypot(*tangent) or 1.0
        res.append(((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), (tangent[0] / ln, tangent[1] / ln)))
    return res


def rounded_rect(u0, u1, v0, v1, r, seg=4, top_only=False):
    """Прямоугольник со скруглёнными углами (контур против часовой); top_only — скруглены только верхние."""
    corners = [(u1 - r, v0 + r, -90), (u1 - r, v1 - r, 0), (u0 + r, v1 - r, 90), (u0 + r, v0 + r, 180)]
    pts = []
    for k, (cu, cv, a0) in enumerate(corners):
        if top_only and k in (0, 3):
            pts.append((u1, v0) if k == 0 else (u0, v0))
            continue
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cu + r * math.cos(a), cv + r * math.sin(a)))
    return pts


def diamond(cx, cz, hw, hh):
    return [(cx + hw, cz), (cx, cz + hh), (cx - hw, cz), (cx, cz - hh)]


def sid(sockets, ident):
    for s in sockets:
        if s.identifier == ident:
            return s
    for s in sockets:
        if s.name == ident:
            return s
    raise KeyError(ident)


class Tree:
    """Построитель шейдерного графа с выходами для трёх проходов запекания."""

    def __init__(self, mat, images):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.images = images
        self.i = 0

    def n(self, t, **kw):
        node = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(node, k, v)
        node.location = ((self.i % 12) * 220, -(self.i // 12) * 260)
        self.i += 1
        return node

    def set(self, sock, val):
        if isinstance(val, bpy.types.NodeSocket):
            self.nt.links.new(val, sock)
        elif val is not None:
            sock.default_value = val

    def math(self, op, a, b=None, c=None, clamp=False):
        node = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is not None:
                self.set(node.inputs[i], v)
        return node.outputs[0]

    def vmath(self, op, a, b=None, scale=None):
        node = self.n("ShaderNodeVectorMath", operation=op)
        self.set(node.inputs[0], a)
        if b is not None:
            self.set(node.inputs[1], b)
        if scale is not None:
            self.set(sid(node.inputs, "Scale"), scale)
        return sid(node.outputs, "Value") if op in ("DOT_PRODUCT", "LENGTH") else sid(node.outputs, "Vector")

    def smooth(self, x, a, b, lo=0.0, hi=1.0):
        node = self.n("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        self.set(node.inputs[0], x)
        for i, v in zip((1, 2, 3, 4), (a, b, lo, hi)):
            node.inputs[i].default_value = v
        return node.outputs[0]

    def noise(self, vec, detail=4.0, rough=0.5):
        node = self.n("ShaderNodeTexNoise")
        if hasattr(node, "noise_type"):
            node.noise_type = "FBM"
        self.set(sid(node.inputs, "Vector"), vec)
        sid(node.inputs, "Scale").default_value = 1.0
        sid(node.inputs, "Detail").default_value = detail
        sid(node.inputs, "Roughness").default_value = rough
        return sid(node.outputs, "Fac")

    def voronoi_edge(self, vec):
        node = self.n("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
        self.set(sid(node.inputs, "Vector"), vec)
        sid(node.inputs, "Scale").default_value = 1.0
        return sid(node.outputs, "Distance")

    def ramp(self, fac, stops):
        node = self.n("ShaderNodeValToRGB")
        els = node.color_ramp.elements
        els[1].position, els[1].color = stops[1]
        els[0].position, els[0].color = stops[0]
        for pos, col in stops[2:]:
            els.new(pos).color = col
        self.set(sid(node.inputs, "Fac"), fac)
        return sid(node.outputs, "Color")

    def mix(self, a, b, fac, blend="MIX"):
        node = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        self.set(sid(node.inputs, "Factor_Float"), fac)
        self.set(sid(node.inputs, "A_Color"), a)
        self.set(sid(node.inputs, "B_Color"), b)
        return sid(node.outputs, "Result_Color")

    def mul(self, col, f):
        return self.mix(col, f, 1.0, "MULTIPLY")

    def mixf(self, a, b, fac):
        node = self.n("ShaderNodeMix", data_type="FLOAT")
        self.set(sid(node.inputs, "Factor_Float"), fac)
        self.set(sid(node.inputs, "A_Float"), a)
        self.set(sid(node.inputs, "B_Float"), b)
        return sid(node.outputs, "Result_Float")

    def ao(self, dist, samples=8):
        node = self.n("ShaderNodeAmbientOcclusion")
        node.samples = samples
        sid(node.inputs, "Distance").default_value = dist
        return sid(node.outputs, "AO")

    def edge(self, radius, normal):
        node = self.n("ShaderNodeBevel")
        node.samples = 8
        sid(node.inputs, "Radius").default_value = radius
        d = self.vmath("DOT_PRODUCT", sid(node.outputs, "Normal"), normal)
        return self.math("SUBTRACT", 1.0, d)

    def bump(self, height, strength, distance):
        node = self.n("ShaderNodeBump")
        sid(node.inputs, "Strength").default_value = strength
        sid(node.inputs, "Distance").default_value = distance
        self.set(sid(node.inputs, "Height"), height)
        return sid(node.outputs, "Normal")

    def sep(self, vec):
        node = self.n("ShaderNodeSeparateXYZ")
        self.set(node.inputs[0], vec)
        return node.outputs

    def finish(self, col, rough, metal, normal):
        """Выходы для трёх проходов запекания: альбедо, ORM (R=1, G=шероховатость, B=металл), нормали."""
        out = self.n("ShaderNodeOutputMaterial")
        out.name = "OUT"
        em = self.n("ShaderNodeEmission")
        em.name = "EM_ALBEDO"
        self.set(sid(em.inputs, "Color"), col)
        orm = self.n("ShaderNodeCombineColor")
        self.set(orm.inputs[0], 1.0)
        self.set(orm.inputs[1], rough)
        self.set(orm.inputs[2], metal)
        em2 = self.n("ShaderNodeEmission")
        em2.name = "EM_ORM"
        self.set(sid(em2.inputs, "Color"), orm.outputs[0])
        bsdf = self.n("ShaderNodeBsdfDiffuse")
        bsdf.name = "BSDF_NORMAL"
        if normal is not None:
            self.set(sid(bsdf.inputs, "Normal"), normal)
        for key, img in self.images.items():
            node = self.n("ShaderNodeTexImage")
            node.name = "IMG_" + key
            node.image = img


def object_coords(t):
    """Координаты объекта со случайным сдвигом, чтобы соседние доски не повторяли рисунок."""
    tc = t.n("ShaderNodeTexCoord")
    oi = t.n("ShaderNodeObjectInfo")
    off = t.vmath("SCALE", (137.3, 71.1, 53.9), scale=sid(oi.outputs, "Random"))
    return tc, t.vmath("ADD", sid(tc.outputs, "Object"), off)


def covered(trees, origin, direction):
    """Точка вплотную накрыта другой деталью или находится внутри замкнутой детали."""
    for tree, closed in trees:
        loc, hit_n, _, dist = tree.ray_cast(origin, direction, 0.6)
        if loc is not None and (dist < 0.002 or (closed and hit_n.dot(direction) > 0)):
            return True
    return False


class Prop:
    """Одна модель: детали, материалы запекания и итоговый GLB в папке models/<name>/."""

    def __init__(self, name):
        args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
        self.fast = "--fast" in args
        self.bake_res = 1024 if self.fast else 2048
        self.export_res = 1024
        self.samples = 12 if self.fast else 64
        self.name = name
        self.out = model_dir(name)
        self.tex = os.path.join(self.out, "textures")
        os.makedirs(self.tex, exist_ok=True)
        self.t0 = time.time()

        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.scene = bpy.context.scene
        self.parts = []
        self.cutters = []
        self.bake_mats = []
        self.images = {
            "ALBEDO": self._image("T_BaseColor", False),
            "ORM": self._image("T_ORM", True),
            "NORMAL": self._image("T_Normal", True),
        }

    def log(self, *a):
        print(f"[{time.time() - self.t0:6.1f}s]", *a, flush=True)

    def _image(self, name, noncolor):
        img = bpy.data.images.new(name, self.bake_res, self.bake_res, alpha=False, float_buffer=False)
        if noncolor:
            img.colorspace_settings.name = "Non-Color"
        return img

    # ------------------------------------------------------------ геометрия
    def mesh(self, name, verts, faces, mat, grain="X", group="Body", bevel=(0.004, 1), closed=True, cutters=(),
             sharp=30, attrs=None):
        """
        Деталь из вершин (в мировых координатах) и граней. attrs — атрибуты вершин
        {имя: [значение на каждую вершину]}; ткань, например, читает "fold" — затемнение в складках.
        """
        R = ROT[grain]
        vs = [Vector(v) for v in verts]
        lo = Vector([min(v[i] for v in vs) for i in range(3)])
        hi = Vector([max(v[i] for v in vs) for i in range(3)])
        c = (lo + hi) / 2
        Rinv = R.inverted()

        bm = bmesh.new()
        bverts = [bm.verts.new(Rinv @ (v - c)) for v in vs]
        for f in faces:
            bm.faces.new([bverts[i] for i in f])
        if closed:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(sharp):
                e.smooth = False
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for key, values in (attrs or {}).items():
            me.attributes.new(key, "FLOAT", "POINT").data.foreach_set("value", values)
        me.materials.append(mat)

        ob = bpy.data.objects.new(name, me)
        ob.matrix_world = Matrix.Translation(c) @ R.to_4x4()
        self.scene.collection.objects.link(ob)
        for cutter in cutters:
            m = ob.modifiers.new("Cut", "BOOLEAN")
            m.operation = "DIFFERENCE"
            m.object = cutter
            try:
                m.solver = "EXACT"
            except TypeError:
                pass
        if bevel:
            m = ob.modifiers.new("Bevel", "BEVEL")
            m.width, m.segments = bevel
            m.limit_method = "ANGLE"
            m.angle_limit = math.radians(40)
            m.harden_normals = True
            m.use_clamp_overlap = True
        ob["group"] = group
        ob["closed"] = closed
        self.parts.append(ob)
        return ob

    def box(self, name, x0, x1, y0, y1, z0, z1, mat, grain="X", group="Body", bevel=(0.004, 1), cutters=()):
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        return self.mesh(name, v, BOX_FACES, mat, grain, group, bevel, cutters=cutters)

    def frustum_z(self, name, bot, top, z0, z1, mat, grain="X", group="Body", bevel=(0.003, 1)):
        """Усечённая призма вдоль Z: bot/top = (x0, x1, y0, y1)."""
        (a0, a1, b0, b1), (c0, c1, d0, d1) = bot, top
        v = [(a0, b0, z0), (a1, b0, z0), (a1, b1, z0), (a0, b1, z0),
             (c0, d0, z1), (c1, d0, z1), (c1, d1, z1), (c0, d1, z1)]
        return self.mesh(name, v, BOX_FACES, mat, grain, group, bevel)

    def frustum_y(self, name, front, back, y0, y1, mat, grain="Z", group="Body", bevel=(0.0015, 1)):
        """Филёнка: передняя грань (y0) меньше задней (y1). front/back = (x0, x1, z0, z1)."""
        (a0, a1, b0, b1), (c0, c1, d0, d1) = front, back
        v = [(a0, y0, b0), (a1, y0, b0), (c1, y1, d0), (c0, y1, d0),
             (a0, y0, b1), (a1, y0, b1), (c1, y1, d1), (c0, y1, d1)]
        return self.mesh(name, v, BOX_FACES, mat, grain, group, bevel)

    @staticmethod
    def _prism_geometry(outline, axis, a0, a1):
        """Призма по плоскому контуру, выдавленная вдоль оси axis от a0 до a1."""
        def point(u, a, v):
            if axis == "Y":
                return (u, a, v)       # контур (x, z)
            if axis == "X":
                return (a, u, v)       # контур (y, z)
            return (u, v, a)           # контур (x, y)
        n = len(outline)
        verts = [point(u, a0, v) for u, v in outline] + [point(u, a1, v) for u, v in outline]
        faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
        faces += [(i, n + i, n + (i + 1) % n, (i + 1) % n) for i in range(n)]
        return verts, faces

    def prism(self, name, outline, axis, a0, a1, mat, grain="X", group="Body", bevel=(0.0015, 2)):
        verts, faces = self._prism_geometry(outline, axis, a0, a1)
        return self.mesh(name, verts, faces, mat, grain, group, bevel)

    def prism_xz(self, name, outline, y0, y1, mat, grain="X", group="Body", bevel=(0.0015, 2)):
        """Плоская деталь по контуру в плоскости XZ (контур против часовой при взгляде спереди)."""
        return self.prism(name, outline, "Y", y0, y1, mat, grain, group, bevel)

    def cutter(self, name, outline, axis, a0, a1):
        """Невидимый объект для выреза (Boolean); удаляется перед экспортом."""
        verts, faces = self._prism_geometry(outline, axis, a0, a1)
        bm = bmesh.new()
        bverts = [bm.verts.new(v) for v in verts]
        for f in faces:
            bm.faces.new([bverts[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # точному Boolean нужны нормали наружу
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        ob.display_type = "WIRE"
        ob.hide_render = True
        self.scene.collection.objects.link(ob)
        self.cutters.append(ob)
        return ob

    def cylinder(self, name, center, radius, length, axis, mat, group="Body", seg=12, bevel=(0.0015, 1), cutters=()):
        cx, cy, cz = center
        ring = [(math.cos(2 * math.pi * i / seg) * radius, math.sin(2 * math.pi * i / seg) * radius)
                for i in range(seg)]
        verts = []
        for h in (-length / 2, length / 2):
            for a, b in ring:
                if axis == "X":
                    verts.append((cx + h, cy + a, cz + b))
                elif axis == "Y":
                    verts.append((cx + a, cy + h, cz + b))
                else:
                    verts.append((cx + a, cy + b, cz + h))
        faces = [tuple(range(seg)), tuple(range(2 * seg - 1, seg - 1, -1))]
        faces += [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)]
        return self.mesh(name, verts, faces, mat, axis, group, bevel, cutters=cutters)

    def lathe(self, name, profile, center, mat, axis="Z", group="Body", seg=24, sharp=30):
        """
        Тело вращения (тарелка, кружка, ручка-грибок): profile — контур (r, h) в полуплоскости,
        от оси до оси или замкнутый; h отсчитывается от center вдоль оси: "Z" — вверх,
        "-Y" — к зрителю. Скругления задаются самим контуром, фаски не нужны.
        """
        cx, cy, cz = center

        def point(r, h, a):
            u, v = r * math.cos(a), r * math.sin(a)
            return (cx + u, cy + v, cz + h) if axis == "Z" else (cx + u, cy - h, cz + v)

        verts, rings = [], []
        for r, h in profile:
            n = 1 if r < 1e-9 else seg
            rings.append(list(range(len(verts), len(verts) + n)))
            verts += [point(r, h, 2 * math.pi * i / seg) for i in range(n)]
        pairs = list(zip(rings, rings[1:]))
        if len(rings[0]) > 1 and len(rings[-1]) > 1:
            pairs.append((rings[-1], rings[0]))  # замкнутый контур, например обод
        faces = []
        for a, b in pairs:
            for i in range(seg):
                j = (i + 1) % seg
                if len(a) == 1:
                    faces.append((a[0], b[j], b[i]))
                elif len(b) == 1:
                    faces.append((a[i], a[j], b[0]))
                else:
                    faces.append((a[i], a[j], b[j], b[i]))
        return self.mesh(name, verts, faces, mat, "Z" if axis == "Z" else "Y", group, bevel=None, sharp=sharp)

    def tube(self, name, path, radius, mat, group="Body", seg=12, caps=True):
        """
        Труба вдоль ломаной path: кольца сечения переносятся вдоль пути без закручивания.
        Для гнутых труб путь стоит заранее скруглить через rounded_path().
        """
        pts = [Vector(p) for p in path]
        n = len(pts)
        tangents = []
        for i in range(n):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == n - 1:
                t = pts[-1] - pts[-2]
            else:
                t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
            tangents.append(t.normalized())
        ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
        nrm = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
        verts = []
        for i, (p, t) in enumerate(zip(pts, tangents)):
            if i:
                axis = tangents[i - 1].cross(t)
                if axis.length > 1e-8:
                    nrm = Matrix.Rotation(tangents[i - 1].angle(t), 3, axis.normalized()) @ nrm
                nrm = (nrm - t * nrm.dot(t)).normalized()
            bin_ = t.cross(nrm)
            for k in range(seg):
                a = 2 * math.pi * k / seg
                verts.append(tuple(p + (nrm * math.cos(a) + bin_ * math.sin(a)) * radius))
        faces = [(i * seg + k, i * seg + (k + 1) % seg, (i + 1) * seg + (k + 1) % seg, (i + 1) * seg + k)
                 for i in range(n - 1) for k in range(seg)]
        if caps:
            faces += [tuple(range(seg)), tuple((n - 1) * seg + k for k in range(seg))]
        return self.mesh(name, verts, faces, mat, "X", group, bevel=None, closed=caps, sharp=60)

    def transform(self, objs, matrix):
        """Сдвигает и поворачивает уже созданные детали (например, весь верхний ящик)."""
        for ob in objs:
            ob.matrix_world = matrix @ ob.matrix_world

    def since(self, count):
        """Детали и вырезы, созданные после отметки count = (len(parts), len(cutters))."""
        return self.parts[count[0]:] + self.cutters[count[1]:]

    def mark(self):
        return (len(self.parts), len(self.cutters))

    # ------------------------------------------------------------ материалы
    def _material(self, name, builder, *args):
        mat = bpy.data.materials.new(name)
        builder(Tree(mat, self.images), *args)
        self.bake_mats.append(mat)
        return mat

    def wood(self, name, pal):
        """
        Старое дерево. pal: dark, mid, light — цвет волокон; streak — светлые мазки;
        scratch — царапины; edge — стёртые кромки; dust — пыль на верхних гранях.
        """
        return self._material(name, _build_wood, pal)

    def metal(self, name, pal, rivets=None):
        """
        Железо со ржавчиной. pal: iron, iron_dark, iron_edge, rust, rust_dark,
        metal (металличность, по умолчанию 0.45), rough (шероховатость, 0.52),
        rust_from/rust_to (порог пятен ржавчины), ao — яркость в самых глубоких впадинах
        от дальних и ближних заслонений, по умолчанию (0.40, 0.35); у стопки посуды тени мягче.
        rivets — шаг заклёпок вдоль локальной оси X детали, м.
        """
        return self._material(name, _build_metal, pal, rivets)

    def painted(self, name, pal):
        """
        Краска поверх основы: сколы и стёртые кромки открывают основу, вокруг сколов рыжий ореол,
        по вертикали стекают потёки. pal: paint, paint_dark — краска; under, under_dark — основа
        (дерево или железо); stain — цвет потёков и ореолов; chips — порог сколов (от, до);
        streaks — царапины вдоль волокон (0 — нет, для эмали); drips — сила потёков;
        gloss — шероховатость краски; under_rough, under_metal — шероховатость и металличность основы.
        """
        return self._material(name, _build_painted, pal)

    def fabric(self, name, pal, stripes=None):
        """
        Ткань: dark, mid, light — цвет полотна, пятна грязи и тени в складках запекаются.
        stripes = (шаг, сила) — полоски цвета pal["stripe"], как у матрасного тика.
        """
        return self._material(name, _build_fabric, pal, stripes)

    def flat(self, name, color, rough):
        return self._material(name, lambda t: t.finish(color, rough, 0.0, None))

    # ------------------------------------------------------------ сборка
    def select(self, objs, active=None):
        bpy.ops.object.select_all(action="DESELECT")
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = active or objs[0]

    def remove_hidden_faces(self):
        """
        Удаляет грани, целиком закрытые соседними деталями, и грани, лежащие на полу.
        Проверка идёт только внутри группы: двери, крышки и ящики двигаются, и то, что
        закрыто в одном положении, может стать видимым в другом.
        Освободившееся место в атласе уходит видимым граням.
        """
        parts = self.parts
        # вырезы применяются до проверки: иначе грань за отверстием считается закрытой,
        # а деталь, стоящая в вырезе (слив на дне чаши), — спрятанной внутри целого бруска
        for ob in parts:
            for m in [m for m in ob.modifiers if m.type == "BOOLEAN"]:
                with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
                    bpy.ops.object.modifier_apply(modifier=m.name)
        trees = {}
        for ob in parts:
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bm.transform(ob.matrix_world)
            # луч возвращает нормаль грани из BMesh: без пересчёта она осталась бы в осях детали,
            # и у повёрнутых деталей проверка «луч вышел изнутри» решалась бы шумом округления
            bm.normal_update()
            trees[ob.name] = (BVHTree.FromBMesh(bm), bool(ob["closed"]))
            bm.free()
        removed = total = 0
        for ob in parts:
            others = [trees[o.name] for o in parts if o is not ob and o["group"] == ob["group"]]
            mw = ob.matrix_world
            rot = mw.to_3x3()
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bm.normal_update()
            kill = []
            for f in bm.faces:
                n = (rot @ f.normal).normalized()
                vs = [mw @ v.co for v in f.verts]
                c = sum(vs, Vector()) / len(vs)
                if n.z < -0.99 and max(v.z for v in vs) < 1e-3:
                    kill.append(f)
                    continue
                # центр и точки у самых углов и середин рёбер
                pts = [c] + [c.lerp(v, 0.96) for v in vs]
                pts += [c.lerp((vs[i] + vs[i - 1]) / 2, 0.96) for i in range(len(vs))]
                if len(vs) == 4:
                    # плюс сетка 5×5: у длинной узкой грани (прут сквозь поперечины) середина и концы
                    # могут оказаться внутри других труб, а промежутки между ними — нет
                    ts = (0.04, 0.27, 0.5, 0.73, 0.96)
                    pts += [vs[0].lerp(vs[1], a).lerp(vs[3].lerp(vs[2], a), b) for a in ts for b in ts]
                else:
                    pts += [c.lerp(v, 0.5) for v in vs] + [c.lerp((vs[i] + vs[i - 1]) / 2, 0.5) for i in range(len(vs))]
                if all(covered(others, p + n * 1e-4, n) for p in pts):
                    kill.append(f)
            total += len(bm.faces)
            removed += len(kill)
            if kill:
                bmesh.ops.delete(bm, geom=kill, context="FACES")
                bm.to_mesh(ob.data)
            bm.free()
        self.log(f"hidden faces removed: {removed}/{total}")
        # деталь, закрытая целиком, не нужна: запекание не принимает объект без граней
        for ob in [ob for ob in parts if not ob.data.polygons]:
            self.log(f"fully hidden: {ob.name}")
            parts.remove(ob)
            bpy.data.objects.remove(ob)

    def _unwrap(self):
        self.log("uv unwrap")
        bpy.ops.object.mode_set(mode="EDIT")
        self.scene.tool_settings.use_uv_select_sync = True
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.select_all(action="SELECT")
        pack_kw = dict(rotate=True, margin=0.004)
        for extra in (dict(margin_method="FRACTION", shape_method="CONCAVE", rotate_method="CARDINAL"), {}):
            try:
                bpy.ops.uv.pack_islands(**pack_kw, **extra)
                break
            except TypeError:
                continue
        bpy.ops.object.mode_set(mode="OBJECT")

    def _setup_cycles(self):
        scene = self.scene
        scene.render.engine = "CYCLES"
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == "METAL"
        scene.cycles.device = "GPU"
        scene.cycles.samples = self.samples

    def _set_pass(self, key):
        for mat in self.bake_mats:
            nt = mat.node_tree
            out = nt.nodes["OUT"]
            src = nt.nodes["BSDF_NORMAL" if key == "NORMAL" else "EM_" + key]
            for link in list(out.inputs["Surface"].links):
                nt.links.remove(link)
            nt.links.new(src.outputs[0], out.inputs["Surface"])
            for node in nt.nodes:
                node.select = False
            img_node = nt.nodes["IMG_" + key]
            img_node.select = True
            nt.nodes.active = img_node

    def _bake(self):
        self._setup_cycles()
        rb = self.scene.render.bake
        rb.margin = 16 if not self.fast else 8
        rb.margin_type = "EXTEND"
        rb.use_clear = True
        rb.target = "IMAGE_TEXTURES"
        rb.normal_space = "TANGENT"

        self.select(self.parts)
        passes = (("ALBEDO", "EMIT", self.samples), ("ORM", "EMIT", max(8, self.samples // 2)), ("NORMAL", "NORMAL", 8))
        for key, btype, samples in passes:
            self._set_pass(key)
            self.scene.cycles.samples = samples
            self.log(f"bake {key} {self.bake_res}px x{samples}")
            bpy.ops.object.bake(type=btype)
            img = self.images[key]
            img.filepath_raw = os.path.join(self.tex, f"{self.name}_{key.lower()}_{self.bake_res}.png")
            img.file_format = "PNG"
            img.save()

        for key, img in self.images.items():
            if img.size[0] != self.export_res:
                img.scale(self.export_res, self.export_res)
            img.filepath_raw = os.path.join(self.tex, f"{self.name}_{key.lower()}.png")
            img.save()

    def _final_material(self):
        final = bpy.data.materials.new(f"M_{self.name.capitalize()}")
        nt = final.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
        t_albedo = nt.nodes.new("ShaderNodeTexImage")
        t_albedo.image = self.images["ALBEDO"]
        nt.links.new(t_albedo.outputs["Color"], bsdf.inputs["Base Color"])
        t_orm = nt.nodes.new("ShaderNodeTexImage")
        t_orm.image = self.images["ORM"]
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t_orm.outputs["Color"], sep.inputs[0])
        nt.links.new(sep.outputs[1], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs[2], bsdf.inputs["Metallic"])
        t_nrm = nt.nodes.new("ShaderNodeTexImage")
        t_nrm.image = self.images["NORMAL"]
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        for i, node in enumerate((t_albedo, t_orm, t_nrm)):
            node.location = (-700, 300 - i * 300)
        sep.location, nmap.location, bsdf.location, out.location = (-350, 0), (-350, -300), (0, 0), (350, 0)
        for ob in self.parts:
            ob.data.materials.clear()
            ob.data.materials.append(final)

    def build(self, pivots):
        """
        Запекает и экспортирует модель. pivots — узлы GLB по группам деталей:
        {"Body": (x, y, z), "Lid": ((x, y, z), (rx, ry, rz))} — точка опоры и, при
        необходимости, поворот узла в градусах (оси узла — оси вращения в игре).
        """
        self.log(f"{len(self.parts)} parts")
        self.remove_hidden_faces()
        self.select(self.parts)
        bpy.ops.object.convert(target="MESH")
        for ob in self.cutters:
            bpy.data.objects.remove(ob)
        self._unwrap()
        self._bake()
        self._final_material()

        self.select(self.parts)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        root = bpy.data.objects.new(self.name.capitalize(), None)
        self.scene.collection.objects.link(root)
        tris = 0
        groups = {g: [ob for ob in self.parts if ob["group"] == g] for g in pivots}
        for gname, pivot in pivots.items():
            self.select(groups[gname])
            bpy.ops.object.join()
            ob = bpy.context.view_layer.objects.active
            ob.name = ob.data.name = gname
            del ob["group"], ob["closed"]
            if isinstance(pivot[0], (tuple, list)):
                loc, rot = pivot
                node = Matrix.Translation(Vector(loc)) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
                ob.data.transform(node.inverted() @ ob.matrix_world)
                ob.matrix_world = node
            else:
                p = Vector(pivot)
                ob.data.transform(Matrix.Translation(ob.location - p))
                ob.location = p
            ob.parent = root
            tri = ob.modifiers.new("Triangulate", "TRIANGULATE")
            tri.min_vertices = 5
            if hasattr(tri, "keep_custom_normals"):
                tri.keep_custom_normals = True
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
            self.log(f"{gname}: {len(ob.data.loop_triangles)} tris")
        self.log(f"total {tris} tris")

        props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
        kw = dict(export_format="GLB", use_selection=False, export_yup=True, export_apply=True,
                  export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT",
                  export_image_format="WEBP", export_image_quality=90, export_cameras=False, export_lights=False,
                  export_animations=False, export_extras=False)
        kw = {k: v for k, v in kw.items() if k in props}
        glb = os.path.join(self.out, f"{self.name}.glb")
        bpy.ops.export_scene.gltf(filepath=glb, **kw)
        self.log(f"exported {glb} ({os.path.getsize(glb) / 1024:.0f} KB)")
        # модель, у которой в model.json указан игровой предмет ("game"), сразу попадает в игру
        if model_info(self.name).get("game") and not self.fast:
            os.makedirs(GAME_MODELS, exist_ok=True)
            shutil.copyfile(glb, os.path.join(GAME_MODELS, f"{self.name}.glb"))
            self.log(f"copied to public/assets/base/models/{self.name}.glb")

        blend = os.path.join(self.out, f"{self.name}.blend")
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=blend)
        bpy.ops.file.make_paths_relative()
        bpy.ops.wm.save_mainfile()
        self.log("saved", blend)


# ---------------------------------------------------------------- шейдеры
def _build_wood(t, pal):
    geo = t.n("ShaderNodeNewGeometry")
    tc, p = object_coords(t)
    # на боковых гранях горизонтальных деталей волокна разворачиваются вдоль грани
    nx = t.sep(sid(tc.outputs, "Normal"))[0]
    side = t.math("GREATER_THAN", t.math("ABSOLUTE", nx), 0.5)
    sp = t.sep(p)
    comb = t.n("ShaderNodeCombineXYZ")
    t.set(comb.inputs[0], t.mixf(sp[0], sp[1], side))
    t.set(comb.inputs[1], t.mixf(sp[1], sp[0], side))
    t.set(comb.inputs[2], sp[2])
    q = comb.outputs[0]

    def sc(v):
        return t.vmath("MULTIPLY", q, v)

    n_fine = t.noise(sc((2.0, 70.0, 70.0)), detail=8, rough=0.6)
    n_mid = t.noise(sc((0.7, 12.0, 12.0)), detail=4, rough=0.55)
    n_big = t.noise(sc((0.45, 3.5, 3.5)), detail=3)
    n_pit = t.noise(sc((40.0, 150.0, 150.0)), detail=2)
    n_sparse = t.noise(sc((1.2, 5.0, 5.0)), detail=2)
    n_wear = t.noise(sc((3.0, 25.0, 25.0)), detail=3)
    n_dirt = t.noise(sc((0.6, 1.8, 1.8)), detail=3)
    n_dust = t.noise(sc((14.0, 14.0, 14.0)), detail=4)
    n_cross = t.noise(sc((4.0, 4.0, 4.0)), detail=2)

    # волокна + светлые «мазки» вдоль них, как на спрайте
    grain = t.math("MULTIPLY_ADD", n_fine, 0.45, t.math("MULTIPLY", n_mid, 0.55))
    col = t.ramp(grain, [(0.40, pal["dark"]), (0.50, pal["mid"]), (0.60, pal["light"])])
    streak = t.math("MULTIPLY", t.smooth(n_big, 0.47, 0.64), t.smooth(n_fine, 0.40, 0.58, 0.3, 1.0))
    col = t.mix(col, pal["streak"], t.math("MULTIPLY", streak, 0.9))
    # царапины: вдоль волокон и в случайных направлениях
    scratch = t.math("MULTIPLY", t.smooth(t.voronoi_edge(sc((1.0, 16.0, 16.0))), 0.03, 0.0),
                     t.smooth(n_sparse, 0.46, 0.60))
    scratch2 = t.math("MULTIPLY", t.smooth(t.voronoi_edge(sc((9.0, 9.0, 9.0))), 0.007, 0.0),
                      t.smooth(n_cross, 0.60, 0.70))
    scratch = t.math("MAXIMUM", scratch, scratch2)
    col = t.mix(col, pal["scratch"], t.math("MULTIPLY", scratch, 0.7))
    # стёртые кромки
    edge = t.edge(0.006, sid(geo.outputs, "Normal"))
    wear = t.math("MULTIPLY", t.smooth(edge, 0.01, 0.06), t.smooth(n_wear, 0.35, 0.55, 0.35, 1.0))
    col = t.mix(col, pal["edge"], t.math("MULTIPLY", wear, 0.95))
    # грязь: пятна, углы, чёрные стыки, низ темнее
    col = t.mul(col, t.smooth(n_dirt, 0.35, 0.65, 0.68, 1.05))
    ao_big = t.ao(0.15)
    ao_small = t.ao(0.025)
    col = t.mul(col, t.smooth(ao_big, 0.0, 1.0, 0.40, 1.0))
    col = t.mul(col, t.smooth(ao_small, 0.35, 0.95, 0.15, 1.0))
    z = t.sep(sid(geo.outputs, "Position"))[2]
    col = t.mul(col, t.smooth(z, 0.0, 0.35, 0.70, 1.0))
    col = t.mul(col, t.smooth(n_pit, 0.30, 0.70, 0.72, 1.10))
    # пыль на горизонтальных гранях
    up = t.smooth(t.sep(sid(geo.outputs, "Normal"))[2], 0.6, 0.95)
    dust = t.math("MULTIPLY", t.math("MULTIPLY", up, t.smooth(n_dust, 0.35, 0.60, 0.4, 1.0)), ao_big)
    col = t.mix(col, pal["dust"], t.math("MULTIPLY", dust, 0.3))

    rough = t.math("MULTIPLY_ADD", t.math("SUBTRACT", n_fine, 0.5), 0.2, 0.84)
    rough = t.math("SUBTRACT", rough, t.math("MULTIPLY", wear, 0.15))
    rough = t.math("SUBTRACT", rough, t.math("MULTIPLY", scratch, 0.08))
    rough = t.math("MULTIPLY_ADD", t.math("SUBTRACT", 1.0, ao_big), 0.06, rough, clamp=True)

    h = t.math("MULTIPLY_ADD", n_fine, 0.7, t.math("MULTIPLY", n_mid, 0.3))
    h = t.math("SUBTRACT", h, t.math("MULTIPLY", scratch, 0.35))
    h = t.math("MULTIPLY_ADD", n_pit, 0.15, h)
    t.finish(col, rough, 0.0, t.bump(h, 0.25, 0.003))


def _build_metal(t, pal, rivets=None):
    geo = t.n("ShaderNodeNewGeometry")
    tc, p = object_coords(t)
    n_r = t.noise(t.vmath("MULTIPLY", p, (30.0, 30.0, 30.0)), detail=5, rough=0.6)
    rust = t.smooth(n_r, pal.get("rust_from", 0.52), pal.get("rust_to", 0.64))
    n_s = t.noise(t.vmath("MULTIPLY", p, (160.0, 160.0, 160.0)), detail=3)
    col = t.mix(t.mix(pal["iron"], pal["iron_dark"], n_s), t.mix(pal["rust"], pal["rust_dark"], n_s),
                t.math("MULTIPLY", rust, 0.8))
    edge = t.edge(0.002, sid(geo.outputs, "Normal"))
    wear = t.math("MULTIPLY", t.smooth(edge, 0.02, 0.10), t.math("SUBTRACT", 1.0, rust))
    col = t.mix(col, pal["iron_edge"], t.math("MULTIPLY", wear, 0.9))
    ao_far, ao_near = pal.get("ao", (0.40, 0.35))
    col = t.mul(col, t.smooth(t.ao(0.06), 0.0, 1.0, ao_far, 1.0))
    col = t.mul(col, t.smooth(t.ao(0.01), 0.30, 0.95, ao_near, 1.0))
    h = t.math("MULTIPLY_ADD", n_s, 0.5, t.math("MULTIPLY", rust, 0.4))
    if rivets:
        # заклёпки через каждые `rivets` м по средней линии полосы (локальная X — вдоль полосы)
        s = t.sep(sid(tc.outputs, "Object"))
        dx = t.math("MULTIPLY", t.math("SUBTRACT", t.math("FRACT", t.math("DIVIDE", s[0], rivets)), 0.5), rivets)
        v = t.n("ShaderNodeCombineXYZ")
        t.set(v.inputs[0], dx)
        t.set(v.inputs[1], s[1])
        t.set(v.inputs[2], s[2])
        dome = t.smooth(t.vmath("LENGTH", v.outputs[0]), 0.0055, 0.0015)
        col = t.mix(col, pal["iron_edge"], t.math("MULTIPLY", dome, 0.35))
        h = t.math("MULTIPLY_ADD", dome, 1.5, h)
    # металличность умеренная: без карты окружения в движке чистый металл выглядит чёрным
    metal = t.math("MULTIPLY", t.math("SUBTRACT", 1.0, rust), pal.get("metal", 0.45))
    rough = t.math("MULTIPLY_ADD", rust, 0.35, pal.get("rough", 0.52))
    rough = t.math("SUBTRACT", rough, t.math("MULTIPLY", wear, 0.15), clamp=True)
    t.finish(col, rough, metal, t.bump(h, 0.3, 0.001))


def _build_fabric(t, pal, stripes=None):
    tc, p = object_coords(t)
    # ткань ровная: цвет гуляет слабо, пятна редкие и бледные, объём дают тени складок
    n_mid = t.noise(t.vmath("MULTIPLY", p, (18.0, 18.0, 18.0)), detail=4)
    n_stain = t.noise(t.vmath("MULTIPLY", p, (3.0, 3.0, 3.0)), detail=3)
    n_weave = t.noise(t.vmath("MULTIPLY", p, (320.0, 320.0, 320.0)), detail=2)
    col = t.ramp(n_mid, [(0.0, pal["dark"]), (0.50, pal["mid"]), (1.0, pal["light"])])
    if stripes:
        # полоски вдоль локальной X: на верхней грани они идут по Y, на боковых — по Z
        period, amount = stripes
        s = t.sep(sid(tc.outputs, "Object"))
        wave = t.math("SINE", t.math("MULTIPLY", t.math("ADD", s[1], s[2]), 2 * math.pi / period))
        col = t.mix(col, pal["stripe"], t.math("MULTIPLY", t.smooth(wave, -0.25, 0.25), amount))
    col = t.mul(col, t.smooth(n_stain, 0.50, 0.80, 0.88, 1.00))
    col = t.mul(col, t.smooth(n_weave, 0.30, 0.70, 0.90, 1.06))
    # тени и блики складок, которые задаёт сама деталь: атрибут вершин "fold" — доля затемнения,
    # отрицательное значение — подсветка гребня; нет атрибута — ноль, цвет не меняется
    fold = t.n("ShaderNodeAttribute", attribute_type="GEOMETRY", attribute_name="fold")
    col = t.mul(col, t.math("SUBTRACT", 1.0, sid(fold.outputs, "Fac")))
    col = t.mul(col, t.smooth(t.ao(0.18), 0.0, 1.0, 0.40, 1.0))
    col = t.mul(col, t.smooth(t.ao(0.02), 0.30, 0.95, 0.45, 1.0))
    h = t.math("MULTIPLY_ADD", n_weave, 0.4, t.math("MULTIPLY", n_mid, 0.6))
    t.finish(col, 0.95, 0.0, t.bump(h, 0.2, 0.002))


def _build_painted(t, pal):
    geo = t.n("ShaderNodeNewGeometry")
    _, p = object_coords(t)

    def sc(v):
        return t.vmath("MULTIPLY", p, v)

    n_grain = t.noise(sc((2.0, 60.0, 60.0)), detail=6, rough=0.6)
    n_paint = t.noise(sc((6.0, 6.0, 6.0)), detail=3)
    n_chip = t.noise(sc((2.5, 7.0, 7.0)), detail=5, rough=0.6)
    n_scr = t.noise(sc((1.2, 45.0, 45.0)), detail=3)
    n_wear = t.noise(sc((3.0, 25.0, 25.0)), detail=3)
    under = t.ramp(n_grain, [(0.35, pal["under_dark"]), (0.65, pal["under"])])
    paint = t.ramp(n_paint, [(0.25, pal["paint_dark"]), (0.75, pal["paint"])])
    # где краски нет: сколы, царапины вдоль волокон, стёртые кромки
    c0, c1 = pal.get("chips", (0.58, 0.66))
    bare = t.smooth(n_chip, c0, c1)
    if pal.get("streaks", 0.8):
        bare = t.math("MAXIMUM", bare, t.math("MULTIPLY", t.smooth(n_scr, 0.62, 0.72), pal.get("streaks", 0.8)))
    wear = t.math("MULTIPLY", t.smooth(t.edge(0.006, sid(geo.outputs, "Normal")), 0.01, 0.05),
                  t.smooth(n_wear, 0.35, 0.60, 0.3, 1.0))
    bare = t.math("MAXIMUM", bare, wear)
    col = t.mix(paint, under, bare)
    # рыжий ореол вокруг сколов и вертикальные потёки
    halo = t.math("MULTIPLY", t.smooth(n_chip, c0 - 0.05, c0), t.math("SUBTRACT", 1.0, bare))
    col = t.mix(col, pal["stain"], t.math("MULTIPLY", halo, 0.55))
    if pal.get("drips", 0.7):
        n_drip = t.noise(t.vmath("MULTIPLY", sid(geo.outputs, "Position"), (22.0, 22.0, 1.6)), detail=4)
        col = t.mix(col, pal["stain"], t.math("MULTIPLY", t.smooth(n_drip, 0.58, 0.72), pal.get("drips", 0.7)))
    # грязь внизу, в углах и стыках
    z = t.sep(sid(geo.outputs, "Position"))[2]
    col = t.mul(col, t.smooth(z, 0.0, 0.30, 0.72, 1.0))
    col = t.mul(col, t.smooth(t.ao(0.15), 0.0, 1.0, 0.45, 1.0))
    col = t.mul(col, t.smooth(t.ao(0.02), 0.30, 0.95, 0.30, 1.0))
    rough = t.mixf(pal.get("gloss", 0.55), pal.get("under_rough", 0.85), bare)
    metal = t.math("MULTIPLY", bare, pal.get("under_metal", 0.0))
    # краска лежит толще основы: у скола ступенька
    h = t.math("MULTIPLY_ADD", t.math("SUBTRACT", 1.0, bare), 0.5, t.math("MULTIPLY", n_grain, 0.15))
    t.finish(col, rough, metal, t.bump(h, 0.3, 0.001))
