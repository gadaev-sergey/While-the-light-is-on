import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
const state=(page:Page)=>page.evaluate(()=>(window as any).__BASE__.snapshot());
async function ready(page:Page){await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();await page.waitForFunction(()=>!!(window as any).__BASE__);}
async function move(page:Page,x:number){const before=await state(page),right=x>before.player.x,key=right?'KeyD':'KeyA';if(Math.abs(x-before.player.x)<5)return;await page.keyboard.down(key);await expect.poll(async()=>(await state(page)).player.x,{intervals:[15],timeout:15000})[right?'toBeGreaterThanOrEqual':'toBeLessThanOrEqual'](x);await page.keyboard.up(key);}
async function openDoor(page:Page){await page.keyboard.press('KeyE');await expect(page.locator('#door-open')).toBeEnabled();await page.locator('#door-open').click();await expect(page.locator('#door-panel')).toBeHidden();}
async function stair(page:Page,key:string,floor:number){await page.keyboard.press(key);await expect.poll(async()=>(await state(page)).player.stair,{intervals:[20]}).not.toBeNull();await expect.poll(async()=>(await state(page)).player.floor,{intervals:[40]}).toBe(floor);}
async function aim(page:Page,x:number,y:number){const point=await page.evaluate(({x,y})=>(window as any).__BASE__.projection(x,y),{x,y});const box=(await page.locator('#base-canvas').boundingBox())!;await page.mouse.move(box.x+point.x,box.y+point.y);}
async function shot(page:Page,name:string){await fs.mkdir('artifacts/modular-house',{recursive:true});await page.screenshot({path:`artifacts/modular-house/${name}.png`});}

test('The furnished modular house loads and important objects obey room visibility',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 const w=await state(page);expect(w.objects).toHaveLength(9);expect(w.visibleObjects).toEqual(['barrel','home/supply-crates']);expect(w.visibleObjects).not.toContain('home/backup-generator');expect(w.openings).toHaveLength(9);expect(w.buildings).toHaveLength(1);
 await expect(page.locator('#goal-text')).toHaveText('Осмотрите верхний этаж и подвал');await expect(page.locator('#quick-wood')).toHaveText('0');await page.keyboard.press('KeyE');expect((await state(page)).task).toBeNull();await shot(page,'entrance');
 await page.keyboard.press('KeyM');await expect(page.locator('.plan-room')).toHaveCount(6);await expect(page.locator('.plan-room.unknown')).toHaveCount(3);await page.getByRole('button',{name:'Закрыть',exact:true}).click();expect(errors).toEqual([]);
});
test('A real route crosses every floor and the breached upper partition',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await move(page,760);await stair(page,'KeyW',1);await move(page,1290);await aim(page,1440,320);await shot(page,'upper-breach');
 expect((await state(page)).location).toBe('Спальня');await move(page,950);await stair(page,'KeyS',0);await move(page,995);await openDoor(page);await move(page,1398);await stair(page,'KeyS',-1);await shot(page,'empty-basement');
 await move(page,1140);await openDoor(page);await move(page,820);expect((await state(page)).explored).toHaveLength(6);await expect(page.locator('#goal-caption')).toHaveText('ДОМ ОСМОТРЕН');await page.keyboard.press('KeyM');await shot(page,'explored-map');expect(errors).toEqual([]);
});
test('Doors clip visibility while the flashlight changes illumination',async({page})=>{
 await ready(page);await move(page,995);await aim(page,1300,550);await shot(page,'closed-door');await openDoor(page);expect((await state(page)).doors.find((d:any)=>d.id==='home/kitchen-door').open).toBe(true);await shot(page,'open-door');
 await page.keyboard.press('KeyF');await expect(page.locator('#flashlight')).toHaveAttribute('aria-pressed','false');await page.keyboard.press('KeyF');await expect(page.locator('#flashlight')).toHaveAttribute('aria-pressed','true');
});
test('Outdoor supplies persist alongside the new interior objects',async({page})=>{
 await ready(page);await move(page,365);await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).task).not.toBeNull();await page.waitForTimeout(250);await page.keyboard.press('Escape');const remaining=(await state(page)).task.remaining;await page.waitForTimeout(250);expect((await state(page)).task.remaining).toBe(remaining);await page.getByRole('button',{name:'Продолжить',exact:true}).click();await expect(page.locator('#quick-water')).toHaveText('1');await page.waitForTimeout(2200);await page.reload();await expect(page.locator('#base-loading')).toBeHidden();await expect(page.locator('#quick-water')).toHaveText('1');expect((await state(page)).objects).toHaveLength(9);
});
test('Canvas navigation reaches a room through stairs and the open breach',async({page})=>{
 await ready(page);const box=(await page.locator('#base-canvas').boundingBox())!,point=await page.evaluate(()=>(window as any).__BASE__.projection(1280,400));await page.mouse.click(box.x+point.x,box.y+point.y);
 await expect.poll(async()=>(await state(page)).location,{timeout:15000}).toBe('Спальня');await expect.poll(async()=>(await state(page)).navigation).toBeNull();
});
test('One distant dog stays outside and retreats from the beam',async({page})=>{
 await ready(page);await move(page,995);await openDoor(page);await move(page,1465);await openDoor(page);await move(page,1810);await aim(page,2050,575);await expect.poll(async()=>(await state(page)).dog.visible).toBe(true);await expect.poll(async()=>(await state(page)).dog.mode).toBe('retreat');expect((await state(page)).player.hp).toBe(100);await shot(page,'yard');
});
test('Mobile controls remain visible and move the preserved developer',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();await ready(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.locator('.touch-controls')).toBeVisible();
 const before=(await state(page)).player.x,right=page.getByRole('button',{name:'Вправо',exact:true});await right.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch'});await page.waitForTimeout(400);await right.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});expect((await state(page)).player.x).toBeGreaterThan(before+45);
 await page.locator('#flashlight').tap();await expect(page.locator('#flashlight')).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:'Приблизить',exact:true}).tap();await expect(page.locator('#zoom-value')).toHaveText('110%');await shot(page,'mobile');await context.close();
});

test('Time controls switch lighting, preserve sight, support keyboard input and persist',async({page})=>{
 await ready(page);const before=await state(page);await page.getByRole('button',{name:'Время суток',exact:true}).click();await expect(page.locator('#time-panel')).toBeVisible();
 for(const [name,time] of [['Ночь','00:00'],['Утро','07:00'],['Вечер','19:00'],['День','12:00']]){await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('#base-clock')).toHaveText(time);expect((await state(page)).visibleObjects).toEqual(before.visibleObjects);await shot(page,`time-${name}`);}
 await page.getByRole('slider',{name:'Выбрать время'}).fill('1199');await page.getByRole('slider').press('ArrowRight');await expect(page.locator('#base-clock')).toHaveText('20:00');expect((await state(page)).player.x).toBe(before.player.x);
 await page.locator('#time-auto').click();await expect.poll(async()=>(await state(page)).dayMinutes).toBeGreaterThan(1200.5);
 await page.getByRole('button',{name:'Ночь',exact:true}).click();expect((await state(page)).timeRunning).toBe(false);await page.keyboard.press('Escape');await expect(page.locator('#time-panel')).toBeHidden();expect((await state(page)).phase).toBe('playing');
 await page.keyboard.press('KeyF');expect((await state(page)).visibleObjects).toEqual(before.visibleObjects);await shot(page,'night-no-lamp');await page.waitForTimeout(2200);await page.reload();await expect(page.locator('#base-clock')).toHaveText('00:00');expect((await state(page)).timeRunning).toBe(false);
});

test('Time controls fit the mobile viewport',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();await ready(page);
 await page.getByRole('button',{name:'Время суток',exact:true}).tap();await page.getByRole('button',{name:'Ночь',exact:true}).tap();await expect(page.locator('#base-clock')).toHaveText('00:00');const box=(await page.locator('#time-panel').boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);await shot(page,'mobile-clock');await context.close();
});
