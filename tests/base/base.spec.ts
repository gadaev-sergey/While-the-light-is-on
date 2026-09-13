import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
const state=(page:Page)=>page.evaluate(()=>(window as any).__BASE__.snapshot());
async function ready(page:Page){await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();await page.waitForFunction(()=>!!(window as any).__BASE__);}
async function move(page:Page,x:number){const before=await state(page),right=x>before.player.x,key=right?'KeyD':'KeyA';if(Math.abs(x-before.player.x)<5)return;await page.keyboard.down(key);await expect.poll(async()=>(await state(page)).player.x,{intervals:[15],timeout:15000})[right?'toBeGreaterThanOrEqual':'toBeLessThanOrEqual'](x);await page.keyboard.up(key);}
async function use(page:Page){await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).task,{intervals:[20]}).not.toBeNull();await expect.poll(async()=>(await state(page)).task,{intervals:[40]}).toBeNull();}
async function stair(page:Page,key:string,floor:number){await page.keyboard.press(key);await expect.poll(async()=>(await state(page)).player.stair,{intervals:[20]}).not.toBeNull();await expect.poll(async()=>(await state(page)).player.floor,{intervals:[40]}).toBe(floor);}
async function aim(page:Page,x:number,y:number){const point=await page.evaluate(({x,y})=>(window as any).__BASE__.projection(x,y),{x,y});const box=(await page.locator('#base-canvas').boundingBox())!;await page.mouse.move(box.x+point.x,box.y+point.y);}
async function shot(page:Page,name:string){await fs.mkdir('artifacts/base',{recursive:true});await page.screenshot({path:`artifacts/base/${name}.png`});}

test('A new shelter replaces the old combat UI and hides important objects beyond sight',async({page})=>{
 const requests:string[]=[];const errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));await ready(page);
 await expect(page).toHaveTitle('Убежище — Дом на окраине');await expect(page.getByRole('heading',{name:'Дом на окраине',exact:true})).toBeVisible();expect((await state(page)).visibleObjects).toEqual(['hall-chest','hall-rubble']);
 expect(requests.some(r=>/office-|enemies-illustrated|ground-illustrated/.test(r))).toBe(false);expect((await state(page)).dog.visible).toBe(false);await shot(page,'overview');
 await page.keyboard.press('KeyM');await expect(page.locator('.plan-room.unknown')).toHaveCount(5);await expect(page.locator('.plan-room.current')).toHaveCount(1);await shot(page,'floor-plan');await page.getByRole('button',{name:'Закрыть',exact:true}).click();expect(errors).toEqual([]);
});

test('A timed search can be cancelled, paused, completed once and restored after reload',async({page})=>{
 await ready(page);await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).task).not.toBeNull();await page.keyboard.down('KeyD');await page.waitForTimeout(100);await page.keyboard.up('KeyD');expect((await state(page)).task).toBeNull();expect((await state(page)).inventory.wood).toBe(0);
 await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).task).not.toBeNull();await page.waitForTimeout(200);await page.keyboard.press('Escape');const before=await state(page);await page.waitForTimeout(250);expect((await state(page)).task.remaining).toBe(before.task.remaining);await page.getByRole('button',{name:'Продолжить',exact:true}).click();await expect.poll(async()=>(await state(page)).inventory.scrap).toBe(2);
 await page.keyboard.press('KeyE');await page.waitForTimeout(400);expect((await state(page)).inventory.wood).toBe(3);await page.waitForTimeout(2200);await page.reload();await expect(page.locator('#base-loading')).toBeHidden();expect((await state(page)).inventory.scrap).toBe(2);expect((await state(page)).objects.find((o:any)=>o.id==='hall-chest').searched).toBe(true);
 await page.keyboard.press('KeyI');await expect(page.getByRole('heading',{name:'Ваш рюкзак'})).toBeVisible();await shot(page,'inventory');
});

test('Real keyboard exploration crosses all floors, opens rooms and powers the house with found supplies',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await use(page);
 await move(page,760);await stair(page,'KeyW',1);await shot(page,'second-floor');
 await move(page,1052);expect((await state(page)).visibleObjects).not.toContain('wardrobe');await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).doors.find((d:any)=>d.id==='bedroom-door').open).toBe(true);
 await move(page,1190);await use(page);expect((await state(page)).inventory.fuse).toBe(1);await shot(page,'bedroom');
 await move(page,949);await stair(page,'KeyS',0);await move(page,1010);await page.keyboard.press('KeyE');await move(page,1400);await stair(page,'KeyS',-1);await shot(page,'cellar');
 await move(page,1400);await use(page);expect((await state(page)).powered).toBe(true);expect((await state(page)).inventory.fuse).toBe(0);expect((await state(page)).inventory.scrap).toBe(0);await shot(page,'generator-running');
 await move(page,1082);await page.keyboard.press('KeyE');await move(page,940);expect((await state(page)).explored).toHaveLength(6);await shot(page,'explored-basement');expect(errors).toEqual([]);
});

test('Flashlight toggle and mouse aiming change visibility, closed doors keep the beam out',async({page})=>{
 await ready(page);await page.keyboard.press('KeyF');await expect.poll(async()=>(await state(page)).visibleObjects).not.toContain('hall-rubble');await shot(page,'flashlight-off');
 await page.keyboard.press('KeyF');await expect.poll(async()=>(await state(page)).visibleObjects).toContain('hall-rubble');await aim(page,300,546);await expect.poll(async()=>(await state(page)).visibleObjects).not.toContain('hall-rubble');
 await move(page,1008);await aim(page,1400,550);await expect.poll(async()=>(await state(page)).visibleObjects).not.toContain('sink');await shot(page,'closed-door-occlusion');
 await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).visibleObjects).toContain('sink');await shot(page,'open-door-beam');await expect(page.locator('#flashlight')).toHaveAttribute('aria-pressed','true');
});

test('Canvas clicks navigate stairs and perform a visible object interaction',async({page})=>{
 await ready(page);
 const canvas=page.locator('#base-canvas');const box=(await canvas.boundingBox())!;
 const point=await page.evaluate(()=>(window as any).__BASE__.projection(950,400));await page.mouse.click(box.x+point.x,box.y+point.y);
 await expect.poll(async()=>(await state(page)).player.floor,{timeout:15000}).toBe(1);await expect.poll(async()=>(await state(page)).navigation).toBeNull();
 // Return using a walk destination on the known lower floor, then click the chest icon.
 const lower=await page.evaluate(()=>(window as any).__BASE__.projection(670,615));await page.mouse.click(box.x+lower.x,box.y+lower.y);await expect.poll(async()=>(await state(page)).player.floor,{timeout:15000}).toBe(0);await expect.poll(async()=>(await state(page)).navigation).toBeNull();
 await aim(page,650,580);await page.waitForTimeout(100);const chest=await page.evaluate(()=>(window as any).__BASE__.projection(650,521));await page.mouse.click(box.x+chest.x,box.y+chest.y);await expect.poll(async()=>(await state(page)).inventory.wood).toBe(3);
});

test('One courtyard enemy stays away from the house and retreats from the player flashlight',async({page})=>{
 await ready(page);await move(page,1010);await page.keyboard.press('KeyE');await move(page,1510);await page.keyboard.press('KeyE');await expect.poll(async()=>(await state(page)).doors.find((d:any)=>d.id==='yard-door').open).toBe(true);await move(page,1810);
 await aim(page,2050,575);await expect.poll(async()=>(await state(page)).dog.visible).toBe(true);await expect.poll(async()=>(await state(page)).dog.mode).toBe('retreat');expect((await state(page)).player.hp).toBe(100);await shot(page,'courtyard');
});

test('Mobile touch movement, flashlight, interaction and zoom remain usable',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();await ready(page);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.locator('.touch-controls')).toBeVisible();await page.locator('#interact').tap();await expect.poll(async()=>(await state(page)).inventory.wood).toBe(3);
 const before=(await state(page)).player.x,right=page.getByRole('button',{name:'Вправо',exact:true});await right.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch'});await page.waitForTimeout(400);await right.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});expect((await state(page)).player.x).toBeGreaterThan(before+45);
 await page.locator('#flashlight').tap();expect((await state(page)).flashlight).toBe(false);await page.getByRole('button',{name:'Приблизить',exact:true}).tap();await expect(page.locator('#zoom-value')).toHaveText('110%');await shot(page,'mobile-base');await context.close();
});
