import {test,expect,type Page} from '@playwright/test';
import {mkdir,mkdtemp} from 'node:fs/promises';
const state=(p:Page)=>p.evaluate(()=>(window as any).__EDITOR__.snapshot());
async function ready(page:Page){
 await mkdir('artifacts/editor',{recursive:true});
 const directory=await mkdtemp(process.cwd()+'/artifacts/editor/regression-');
 const response=await page.request.post('/api/create',{data:{name:'Regression',template:'while-light',directory}});
 expect(response.ok()).toBe(true);const project=await response.json();
 await page.goto('/?project='+encodeURIComponent(project.path));await expect(page.locator('#editor-canvas')).toBeVisible();await page.waitForFunction(()=>!!(window as any).__EDITOR__);await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('status')).toContainText('сохранён на диск');}
async function add(page:Page,name:string){await page.getByRole('button',{name:'＋ Объект / свет / камера',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();}
async function play(page:Page){const project=new URL(page.url()).searchParams.get('project')!;await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('status')).toContainText('сохранён на диск');await page.goto('/player.html?project='+encodeURIComponent(project));await page.waitForFunction(()=>!!(window as any).__BASE__);}
async function number(page:Page,name:string,value:string){const input=page.getByRole('spinbutton',{name,exact:true});await input.fill(value);await input.press('Tab');}

test('Editor edits a real scene, undoes transforms and deletion, persists, and exports portable JSON',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await ready(page);
 await page.getByRole('button',{name:'Выбрать: Платяной шкаф',exact:true}).click();
 await number(page,'Положение X','3.4');await expect.poll(async()=>(await state(page)).nodes.find((n:any)=>n.name==='Платяной шкаф').transform.position[0]).toBe(3.4);
 await page.getByLabel('Текстура',{exact:true}).selectOption('tile-2');await number(page,'Шероховатость','0.75');await mkdir('artifacts/editor',{recursive:true});await page.screenshot({path:'artifacts/editor/editor-day.png'});
 await page.getByRole('button',{name:'Копия',exact:true}).click();expect((await state(page)).nodes.filter((n:any)=>n.name.startsWith('Платяной шкаф'))).toHaveLength(2);
 await page.getByRole('button',{name:'Удалить',exact:true}).click();expect((await state(page)).nodes.filter((n:any)=>n.name.startsWith('Платяной шкаф'))).toHaveLength(1);
 await page.getByRole('button',{name:'Отменить',exact:true}).click();expect((await state(page)).nodes.filter((n:any)=>n.name.startsWith('Платяной шкаф'))).toHaveLength(2);
 await add(page,'Прожектор');await number(page,'Сила','25');await number(page,'Положение Y','1.9');await page.getByRole('button',{name:'Ночь',exact:true}).click();
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('status')).toContainText('сохранён на диск');
 await mkdir('artifacts/editor',{recursive:true});await page.screenshot({path:'artifacts/editor/editor-night.png'});
 const before=await state(page);await page.reload();await page.waitForFunction(()=>!!(window as any).__EDITOR__);expect(await state(page)).toEqual(before);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Экспорт',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toMatch(/\.scene\.json$/);await file.saveAs('artifacts/editor/export.scene.json');
 expect(errors).toEqual([]);
});

test('Viewport picking and gizmo dragging move the selected model; lock blocks edits',async({page})=>{
 await ready(page);await add(page,'Куб');const doc=await state(page),cube=doc.nodes.find((n:any)=>n.kind==='box');
 await number(page,'Положение X','-4');await number(page,'Положение Y','0');await number(page,'Положение Z','0.7');
 await page.getByRole('button',{name:'Выбор',exact:true}).click();const point=await page.evaluate(id=>(window as any).__EDITOR__.projection(id),cube.id),rect=(await page.locator('#editor-canvas').boundingBox())!;await page.mouse.click(rect.x+point.x,rect.y+point.y);
 await expect(page.getByLabel('Имя объекта',{exact:true})).toHaveValue('Куб');await page.getByLabel('Заблокирован',{exact:true}).check();await expect(page.getByRole('spinbutton',{name:'Положение X',exact:true})).toBeDisabled();await page.getByLabel('Заблокирован',{exact:true}).uncheck();
 await page.getByRole('button',{name:'Перемещение',exact:true}).click();const handle=await page.evaluate(()=>(window as any).__EDITOR__.gizmo());expect(handle).not.toBeNull();await page.mouse.move(rect.x+handle.x,rect.y+handle.y);expect((await page.evaluate(()=>(window as any).__EDITOR__.manipulator())).axis).toBe('X');await page.mouse.down();expect((await page.evaluate(()=>(window as any).__EDITOR__.manipulator())).dragging).toBe(true);await page.mouse.move(rect.x+handle.x+65,rect.y+handle.y,{steps:12});await page.mouse.up();await expect.poll(async()=>(await state(page)).nodes.find((n:any)=>n.id===cube.id).transform.position[0]).toBeGreaterThan(-3.5);await page.getByRole('button',{name:'Отменить',exact:true}).click();expect((await state(page)).nodes.find((n:any)=>n.id===cube.id).transform.position[0]).toBe(-4);
 await add(page,'Ящики');const chest=(await state(page)).nodes.filter((n:any)=>n.kind==='prefab'&&n.asset==='chest').at(-1);await page.getByRole('button',{name:'Сохранить',exact:true}).click();await play(page);
 await expect.poll(()=>page.evaluate(()=>(window as any).__BASE__.rendering().mode)).toBe('3d');expect((await page.evaluate(()=>(window as any).__BASE__.snapshot())).objects.some((o:any)=>o.id==='scene/'+chest.id)).toBe(true);await expect(page.locator('#editor-canvas')).toHaveCount(0);
});

test('Import validates before replacement, restores exported scenes, and textures travel with the file',async({page})=>{
 await ready(page);const original=await state(page);
 await page.locator('#scene-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong"}')});await expect(page.getByRole('status')).toContainText('Неподдерживаемый');expect(await state(page)).toEqual(original);
 await add(page,'Куб');
 const texture=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;const ctx=c.getContext('2d')!;ctx.fillStyle='#c66f44';ctx.fillRect(0,0,16,16);return c.toDataURL('image/png').split(',')[1];}),'base64');
 await page.locator('#texture-file').setInputFiles({name:'test.png',mimeType:'image/png',buffer:texture});await expect.poll(async()=>(await state(page)).textures.length).toBe(1);
 const modified=await state(page);await page.locator('#scene-file').setInputFiles({name:'original.scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});expect(await state(page)).toEqual(original);
 await page.locator('#scene-file').setInputFiles({name:'modified.scene.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(modified))});expect(await state(page)).toEqual(modified);
});

test('Multiple selection groups and drags real objects together, preserves copies and survives reload',async({page})=>{
 await ready(page);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await add(page,'Куб');await number(page,'Положение X','-4');await number(page,'Положение Z','.7');
 const first=(await state(page)).nodes.find((n:any)=>n.kind==='box').id;
 await add(page,'Сфера');await number(page,'Положение X','-2');await number(page,'Положение Z','.7');
 const second=(await state(page)).nodes.find((n:any)=>n.kind==='sphere').id;
 await page.getByRole('button',{name:'Выбрать: Куб',exact:true}).click({modifiers:['Shift']});
 expect(await page.evaluate(()=>(window as any).__EDITOR__.selection())).toHaveLength(2);
 await page.getByRole('button',{name:'Группировать',exact:true}).click();await page.getByLabel('Имя группы',{exact:true}).fill('Комплект');await page.getByLabel('Имя группы',{exact:true}).press('Tab');
 const before=await state(page),rect=(await page.locator('#editor-canvas').boundingBox())!,handle=await page.evaluate(()=>(window as any).__EDITOR__.gizmo());
 await page.mouse.move(rect.x+handle.x,rect.y+handle.y);expect((await page.evaluate(()=>(window as any).__EDITOR__.manipulator())).axis).toBe('X');
 await page.mouse.down();await page.mouse.move(rect.x+handle.x+65,rect.y+handle.y,{steps:12});await page.mouse.up();
 const after=await state(page),a=after.nodes.find((n:any)=>n.id===first),b=after.nodes.find((n:any)=>n.id===second);
 expect(a.transform.position[0]).toBeGreaterThan(-3.5);expect(b.transform.position[0]-a.transform.position[0]).toBeCloseTo(2,6);
 await page.getByRole('button',{name:'Отменить',exact:true}).click();expect((await state(page)).nodes.map((n:any)=>n.transform)).toEqual(before.nodes.map((n:any)=>n.transform));
 await page.getByRole('button',{name:'Масштаб',exact:true}).click();const scaleHandle=await page.evaluate(()=>(window as any).__EDITOR__.gizmo());
 await page.mouse.move(rect.x+scaleHandle.x,rect.y+scaleHandle.y);await page.mouse.down();await page.mouse.move(rect.x+scaleHandle.x+35,rect.y+scaleHandle.y,{steps:10});await page.mouse.up();
 const scaled=(await state(page)).nodes.find((n:any)=>n.id===first).transform.scale;expect(scaled[0]).toBeGreaterThan(1);expect(scaled[1]).toBe(scaled[0]);expect(scaled[2]).toBe(scaled[0]);
 await page.getByRole('button',{name:'Отменить',exact:true}).click();await page.getByRole('button',{name:'Перемещение',exact:true}).click();
 await number(page,'Повернуть на Y','90');await number(page,'Общий масштаб','2');
 const rotated=await state(page),ra=rotated.nodes.find((n:any)=>n.id===first),rb=rotated.nodes.find((n:any)=>n.id===second);
 expect(Math.abs(ra.transform.position[2]-rb.transform.position[2])).toBeCloseTo(4,6);expect(ra.transform.scale).toEqual([2,2,2]);
 await page.getByRole('button',{name:'Копия',exact:true}).click();expect((await state(page)).groups).toHaveLength(2);expect(await page.evaluate(()=>(window as any).__EDITOR__.selection())).toHaveLength(2);
 await page.getByRole('button',{name:'Удалить',exact:true}).click();expect((await state(page)).groups).toHaveLength(1);await page.getByRole('button',{name:'Отменить',exact:true}).click();expect((await state(page)).groups).toHaveLength(2);
 await page.getByRole('button',{name:'Выбрать группу: Комплект',exact:true}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();
 await page.screenshot({path:'artifacts/editor/group.png'});
 const saved=await state(page);await page.reload();await page.waitForFunction(()=>!!(window as any).__EDITOR__);expect(await state(page)).toEqual(saved);
 await page.getByRole('button',{name:'Выбрать группу: Комплект',exact:true}).click();await page.getByRole('button',{name:'Выбор',exact:true}).click();
 await page.getByRole('button',{name:'Выбрать: Куб',exact:true}).click();expect(await page.evaluate(()=>(window as any).__EDITOR__.selection())).toHaveLength(1);
 // Place the group in the open courtyard for real ray picking.
 await page.getByRole('button',{name:'Выбрать группу: Комплект',exact:true}).click();await number(page,'Центр X','-5.5');await number(page,'Центр Y','1');await number(page,'Центр Z','1.4');
 const point=await page.evaluate(id=>(window as any).__EDITOR__.projection(id),first),view=(await page.locator('#editor-canvas').boundingBox())!;
 await page.mouse.click(view.x+point.x,view.y+point.y);expect(await page.evaluate(()=>(window as any).__EDITOR__.selection())).toHaveLength(2);
 await page.keyboard.down('Alt');await page.mouse.click(view.x+point.x,view.y+point.y);await page.keyboard.up('Alt');expect(await page.evaluate(()=>(window as any).__EDITOR__.selection())).toHaveLength(1);
 await page.getByRole('button',{name:'Выбрать группу: Комплект',exact:true}).click();await page.getByRole('button',{name:'Разгруппировать',exact:true}).click();expect((await state(page)).groups).toHaveLength(1);
 expect(errors).toEqual([]);
});

test('Dimensions follow model axes and locked members block all changes to a selection',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Выбрать: Платяной шкаф',exact:true}).click();await number(page,'Поворот Y','90');await number(page,'Высота, м','1.78');await number(page,'Ширина, м','0.9');
 await expect(page.getByRole('spinbutton',{name:'Высота, м',exact:true})).toHaveValue('1.78');await expect(page.getByRole('spinbutton',{name:'Ширина, м',exact:true})).toHaveValue('0.9');
 const wardrobe=(await state(page)).nodes.find((n:any)=>n.name==='Платяной шкаф');expect(wardrobe.transform.scale[1]).toBeCloseTo(1.78/1.925,5);expect(wardrobe.transform.rotation[1]).toBe(90);
 await page.getByLabel('Заблокирован',{exact:true}).check();await page.getByRole('button',{name:'Выбрать: Старая кровать',exact:true}).click({modifiers:['Shift']});
 await expect(page.getByRole('spinbutton',{name:'Центр X',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Удалить',exact:true})).toBeDisabled();
 const locked=await state(page);await page.locator('#editor-canvas').focus();await page.keyboard.press('Delete');expect(await state(page)).toEqual(locked);
 await page.getByRole('button',{name:'Разблокировать все',exact:true}).click();await number(page,'Центр X','3');
 await expect(page.getByRole('spinbutton',{name:'Центр X',exact:true})).toBeEnabled();
 await mkdir('artifacts/editor',{recursive:true});await page.screenshot({path:'artifacts/editor/multiple-selection.png'});
});

test('A narrow editor keeps the viewport usable and opens object panels on demand',async({page})=>{
 await page.setViewportSize({width:347,height:790});await ready(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(347);
 const canvas=(await page.locator('#editor-canvas').boundingBox())!;expect(canvas.width).toBeGreaterThan(340);
 await expect(page.locator('.ed-sidebar')).toBeHidden();await page.getByRole('button',{name:'Список сцены',exact:true}).click();
 await page.getByRole('button',{name:'Выбрать: Платяной шкаф',exact:true}).click();await expect(page.locator('.ed-sidebar')).toBeVisible();await expect(page.locator('.ed-inspector')).toBeHidden();
 await page.getByRole('button',{name:'Свойства',exact:true}).click();await expect(page.locator('.ed-sidebar')).toBeHidden();await expect(page.getByLabel('Имя объекта',{exact:true})).toHaveValue('Платяной шкаф');
 await page.getByRole('button',{name:'Скрыть инспектор',exact:true}).click();await expect(page.locator('.ed-inspector')).toBeHidden();
 await page.screenshot({path:'artifacts/editor/narrow.png'});
});

test('Camera FOV changes projection without moving models, survives reload, and is used in game',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await ready(page);await page.getByRole('button',{name:'Камера',exact:true}).click();
 const fov=page.getByRole('spinbutton',{name:'FOV камеры, °',exact:true}),projection=page.getByLabel('Проекция камеры',{exact:true});await expect(fov).toBeDisabled();
 await projection.selectOption('perspective');await page.getByRole('button',{name:'Игровой кадр',exact:true}).click();await expect(fov).toBeEnabled();const before=await page.evaluate(()=>(window as any).__EDITOR__.camera()),nodes=(await state(page)).nodes;
 await number(page,'FOV камеры, °','60');const wider=await page.evaluate(()=>(window as any).__EDITOR__.camera());expect(wider.type).toBe('PerspectiveCamera');expect(wider.controlsAligned).toBe(true);expect(wider.position).toEqual(before.position);expect(wider.projection[5]).toBeLessThan(before.projection[5]);expect((await state(page)).nodes).toEqual(nodes);
 await page.getByRole('button',{name:'Отменить',exact:true}).click();await expect(fov).toHaveValue('35');await page.getByRole('button',{name:'Повторить',exact:true}).click();await expect(fov).toHaveValue('60');
 await projection.selectOption('orthographic');await expect(fov).toBeDisabled();await expect(fov).toHaveValue('60');await projection.selectOption('perspective');
 await number(page,'FOV камеры, °','101');await expect(page.getByRole('status')).toContainText('FOV должен быть');await expect(fov).toHaveValue('60');
 const slider=page.getByRole('slider',{name:'Угол обзора камеры',exact:true});await slider.focus();await slider.press('Home');await expect(fov).toHaveValue('15');await page.getByRole('button',{name:'Отменить',exact:true}).click();await expect(fov).toHaveValue('60');
 await page.locator('#editor-canvas').press('Escape');await add(page,'Куб');await number(page,'Положение X','-4');await number(page,'Положение Z','0.7');const cube=(await state(page)).nodes.find((n:any)=>n.kind==='box');
 await page.getByRole('button',{name:'Выбор',exact:true}).click();const point=await page.evaluate(id=>(window as any).__EDITOR__.projection(id),cube.id),rect=(await page.locator('#editor-canvas').boundingBox())!;await page.mouse.click(rect.x+point.x,rect.y+point.y);expect(await page.evaluate(()=>(window as any).__EDITOR__.selected())).toBe(cube.id);
 await page.getByRole('button',{name:'Перемещение',exact:true}).click();const handle=await page.evaluate(()=>(window as any).__EDITOR__.gizmo());await page.mouse.move(rect.x+handle.x,rect.y+handle.y);await page.mouse.down();await page.mouse.move(rect.x+handle.x+45,rect.y+handle.y,{steps:10});await page.mouse.up();expect((await state(page)).nodes.find((n:any)=>n.id===cube.id).transform.position[0]).toBeGreaterThan(-4);
 await page.getByRole('button',{name:'Камера',exact:true}).click();await mkdir('artifacts/editor',{recursive:true});await page.screenshot({path:'artifacts/editor/camera-fov.png'});
 await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.reload();await page.waitForFunction(()=>!!(window as any).__EDITOR__);expect((await state(page)).camera).toMatchObject({projection:'perspective',fov:60});expect((await state(page)).camera.projection).toBe('perspective');
 await play(page);await expect(page.locator('#base-loading')).toBeHidden();await expect.poll(()=>page.evaluate(()=>(window as any).__BASE__.rendering().camera)).toBe('PerspectiveCamera');expect(await page.evaluate(()=>(window as any).__BASE__.rendering().fov)).toBe(60);
 const target=await page.evaluate(()=>(window as any).__BASE__.projection(1280,400)),game=(await page.locator('#base-canvas').boundingBox())!;await page.mouse.click(game.x+target.x,game.y+target.y);await expect.poll(()=>page.evaluate(()=>(window as any).__BASE__.snapshot().location),{timeout:15000}).toBe('Спальня');
 expect(errors).toEqual([]);
});

test('Game frame previews authored settings, resists orbit and zoom, restores workspace, and persists into play',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 await page.getByRole('button',{name:'Камера',exact:true}).click();await page.getByLabel('Слежение камеры',{exact:true}).selectOption('fixed');
 await number(page,'Высота кадра, м','12');await number(page,'Центр кадра X, м','0.5');await number(page,'Центр кадра Y, м','2.3');await number(page,'Расстояние камеры, м','22');
 await page.getByLabel('Формат предпросмотра',{exact:true}).selectOption('16:9');
 const before=await page.evaluate(()=>(window as any).__EDITOR__.camera());
 await page.getByRole('button',{name:'Игровой кадр',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__EDITOR__.camera().gamePreview)).toBe(true);
 let camera=await page.evaluate(()=>(window as any).__EDITOR__.camera());expect(camera.position).toEqual([.5,2.3,22]);expect(camera.direction.map((v:number)=>v||0)).toEqual([0,0,-1]);expect(camera.zoom).toBe(1);
 let rect=(await page.locator('#editor-canvas').boundingBox())!;expect(rect.width/rect.height).toBeCloseTo(16/9,2);await expect(page.locator('.ed-frame-guides')).toBeVisible();
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.wheel(0,-700);await page.mouse.down({button:'right'});await page.mouse.move(rect.x+rect.width/2+80,rect.y+rect.height/2+40,{steps:6});await page.mouse.up({button:'right'});
 expect((await page.evaluate(()=>(window as any).__EDITOR__.camera())).position).toEqual(camera.position);
 await page.getByLabel('Формат предпросмотра',{exact:true}).selectOption('9:16');rect=(await page.locator('#editor-canvas').boundingBox())!;expect(rect.width/rect.height).toBeCloseTo(9/16,2);
 await page.locator('#editor-canvas').focus();await page.keyboard.press('Escape');camera=await page.evaluate(()=>(window as any).__EDITOR__.camera());expect(camera.gamePreview).toBe(false);expect(camera.position).toEqual(before.position);expect(camera.controlsAligned).toBe(true);
 await page.getByRole('button',{name:'Игровой кадр',exact:true}).click();await page.getByLabel('Проекция камеры',{exact:true}).selectOption('perspective');await number(page,'FOV камеры, °','50');
 camera=await page.evaluate(()=>(window as any).__EDITOR__.camera());expect(camera.type).toBe('PerspectiveCamera');expect(camera.direction.map((v:number)=>v||0)).toEqual([0,0,-1]);expect(camera.position).toEqual([.5,2.3,22]);expect(camera.controlsAligned).toBe(true);
 await page.getByRole('button',{name:'Отменить',exact:true}).click();await expect(page.getByRole('spinbutton',{name:'FOV камеры, °',exact:true})).toHaveValue('35');await page.getByRole('button',{name:'Повторить',exact:true}).click();
 await mkdir('artifacts/editor',{recursive:true});await page.screenshot({path:'artifacts/editor/game-frame.png'});
 const saved=await state(page);await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.reload();await page.waitForFunction(()=>!!(window as any).__EDITOR__);expect((await state(page)).camera).toEqual(saved.camera);expect((await page.evaluate(()=>(window as any).__EDITOR__.camera())).gamePreview).toBe(false);
 await play(page);await expect(page.locator('#base-loading')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).__BASE__.rendering().cameraPose.position[1])).toBeCloseTo(2.3,3);
 const game=await page.evaluate(()=>(window as any).__BASE__.rendering());expect(game.cameraPose.direction.map((v:number)=>v||0)).toEqual([0,0,-1]);expect(game.cameraPose.position[2]).toBe(22);expect(game.fov).toBe(50);expect(errors).toEqual([]);
});

test('Marquee selects models, batch materials preserve other values, and isolation never changes scene visibility',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Новая',exact:true}).click();await page.getByRole('button',{name:'Создать сцену',exact:true}).click();await expect.poll(async()=>(await state(page)).nodes.length).toBe(0);
 await add(page,'Куб');await number(page,'Положение X','-2');await page.getByLabel('Текстура',{exact:true}).selectOption('tile-2');await number(page,'Шероховатость','0.3');
 const first=(await state(page)).nodes[0].id;
 await add(page,'Сфера');await number(page,'Положение X','2');await number(page,'Шероховатость','0.7');const second=(await state(page)).nodes[1].id;
 await add(page,'Панель');await number(page,'Положение X','7');const third=(await state(page)).nodes[2].id;
 await page.getByRole('button',{name:'Спереди',exact:true}).click();await page.getByRole('button',{name:'Выбор',exact:true}).click();
 const points=await page.evaluate(ids=>ids.map((id:string)=>(window as any).__EDITOR__.projection(id)),[first,second]),rect=(await page.locator('#editor-canvas').boundingBox())!;
 await page.mouse.move(rect.x+points[0].x-25,rect.y+Math.min(points[0].y,points[1].y)-30);await page.mouse.down();await page.mouse.move(rect.x+points[1].x+25,rect.y+Math.max(points[0].y,points[1].y)+30,{steps:8});await expect(page.locator('.ed-marquee')).toBeVisible();await page.mouse.up();
 expect((await page.evaluate(()=>(window as any).__EDITOR__.selection())).sort()).toEqual([first,second].sort());
 await expect(page.getByRole('spinbutton',{name:'Шероховатость',exact:true})).toHaveValue('');await expect(page.getByLabel('Текстура',{exact:true})).toHaveValue('');
 const before=await state(page);await page.getByLabel('Текстура',{exact:true}).selectOption('tile-3');let after=await state(page);expect(after.nodes.slice(0,2).map((n:any)=>n.surface.texture)).toEqual(['tile-3','tile-3']);expect(after.nodes.slice(0,2).map((n:any)=>n.surface.roughness)).toEqual([.3,.7]);expect(after.nodes[2]).toEqual(before.nodes[2]);
 await page.getByRole('button',{name:'Отменить',exact:true}).click();expect(await state(page)).toEqual(before);await number(page,'Шероховатость','0.5');expect((await state(page)).nodes.slice(0,2).map((n:any)=>n.surface.roughness)).toEqual([.5,.5]);
 const visibleDoc=await state(page);await page.getByRole('button',{name:'Изолировать выделение',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__EDITOR__.camera().visibleNodes.length)).toBe(2);expect(await state(page)).toEqual(visibleDoc);
 await page.getByRole('button',{name:'Игровой кадр',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__EDITOR__.camera().heroVisible)).toBe(true);expect((await page.evaluate(()=>(window as any).__EDITOR__.camera())).isolatedIds.sort()).toEqual([first,second].sort());await page.locator('#editor-canvas').focus();await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(id=>(window as any).__EDITOR__.camera().visibleNodes.includes(id),third)).toBe(false);
 await page.keyboard.press('Shift+H');await expect.poll(()=>page.evaluate(id=>(window as any).__EDITOR__.camera().visibleNodes.includes(id),third)).toBe(true);expect(await state(page)).toEqual(visibleDoc);
 await page.getByRole('button',{name:'Блокировать все',exact:true}).click();await expect(page.getByLabel('Текстура',{exact:true})).toBeDisabled();await expect(page.getByRole('spinbutton',{name:'Шероховатость',exact:true})).toBeDisabled();
});
