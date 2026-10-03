"""
Собирает самодостаточную страницу просмотра всех моделей: models/viewer.html.
В неё вкладываются GLB, спрайт и описание из model.json каждой модели, поэтому
страница открывается двойным щелчком, без сервера.

Модель попадает на страницу, если в её папке есть model.json, <name>.glb и sprite_keyed.png.
Запуск из корня проекта (после сборки моделей и key_sprite.py):
    python3 models/tools/build_viewer.py
"""
import base64
import json
import pathlib

tools = pathlib.Path(__file__).resolve().parent
models = tools.parent

entries = []
for info_path in sorted(models.glob("*/model.json")):
    folder = info_path.parent
    name = folder.name
    glb, sprite = folder / f"{name}.glb", folder / "sprite_keyed.png"
    if not glb.exists() or not sprite.exists():
        print(f"пропущена {name}: нет {glb.name if not glb.exists() else sprite.name}")
        continue
    info = json.loads(info_path.read_text(encoding="utf-8"))
    entries.append({
        "id": name,
        "order": info.get("order", 99),
        "title": info["title"],
        "tab": info.get("tab", info["title"]),
        "lede": info.get("lede", ""),
        "action": info.get("action"),
        "glb": base64.b64encode(glb.read_bytes()).decode(),
        "sprite": "data:image/png;base64," + base64.b64encode(sprite.read_bytes()).decode(),
    })
entries.sort(key=lambda e: (e["order"], e["id"]))

tpl = (tools / "viewer.template.html").read_text(encoding="utf-8")
out = tpl.replace("__MODELS__", json.dumps(entries, ensure_ascii=False))
dst = models / "viewer.html"
dst.write_text(out, encoding="utf-8")
print(f"{dst.relative_to(models.parent)}: {', '.join(e['id'] for e in entries)} — {len(out.encode()) // 1024} KB")
