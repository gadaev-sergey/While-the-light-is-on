import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const state=(p:Page)=>p.evaluate(()=>(window as any).__BASE__.snapshot());
async function ready(page:Page){await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();}
async function approach(page:Page){await page.keyboard.down('KeyD');await expect(page.locator('#door-panel')).toBeVisible();await page.keyboard.up('KeyD');await expect(page.locator('#door-open')).toBeEnabled();}

test('Door handle, narrow keyhole, retreat and opening work with real controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await approach(page);
 expect((await state(page)).player.x).toBe(1010);expect((await state(page)).visibleObjects).not.toContain('home/kitchen-sink');
 for(let i=0;i<4;i++)await page.locator('#zoom-in').click();await page.waitForTimeout(300);await mkdir('artifacts/doors',{recursive:true});await page.screenshot({path:'artifacts/doors/handle.png'});
 await page.keyboard.press('KeyQ');await expect.poll(async()=>(await state(page)).peeking).toBe(true);await expect(page.locator('#door-peek')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#door-open')).toBeDisabled();
 expect((await state(page)).visibleObjects).not.toContain('home/kitchen-sink');expect((await state(page)).explored).toContain('home/kitchen');await page.screenshot({path:'artifacts/doors/keyhole.png'});
 await page.keyboard.press('KeyE');expect((await state(page)).doors.find((d:any)=>d.id==='home/kitchen-door').open).toBe(false);
 await page.keyboard.press('Escape');await expect(page.locator('#door-panel')).toBeHidden();expect((await state(page)).peeking).toBe(false);expect((await state(page)).phase).toBe('playing');
 await page.keyboard.press('KeyE');await expect(page.locator('#door-open')).toBeEnabled();await page.locator('#door-open').click();await expect(page.locator('#door-panel')).toBeHidden();
 expect((await state(page)).doors.find((d:any)=>d.id==='home/kitchen-door').open).toBe(true);await page.keyboard.down('KeyD');await expect.poll(async()=>(await state(page)).player.x).toBeGreaterThan(1160);await page.keyboard.up('KeyD');await page.screenshot({path:'artifacts/doors/open.png'});expect(errors).toEqual([]);
});

test('Touch choices are reachable, toggle the keyhole and open the door',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();
 await page.addInitScript(()=>localStorage.setItem('shelter-base-v1',JSON.stringify({version:3,levelId:'outskirts-house-v2',player:{x:1000,floor:0,hp:100},inventory:{},doors:[],objects:[],explored:[],flashlight:true,dogHp:60})));
 await ready(page);await page.locator('#interact').tap();await expect(page.locator('#door-open')).toBeEnabled();await page.locator('#door-peek').tap();await expect.poll(async()=>(await state(page)).peeking).toBe(true);
 await page.screenshot({path:'artifacts/doors/mobile-keyhole.png'});await page.locator('#door-peek').tap();await expect(page.locator('#door-open')).toBeEnabled();await page.locator('#door-open').tap();await expect(page.locator('#door-panel')).toBeHidden();expect((await state(page)).doors.find((d:any)=>d.id==='home/kitchen-door').open).toBe(true);await context.close();
});

test('Door leaves cover room furniture, actors cover leaves, and low foreground covers their feet',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-3000px;width:1440px;height:1000px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();
  for(const name of ['lighting','fogOfWar','structuralForeground','markers','stairRails','architectureEdges','flashlight','shadow','radiators'])r[name]=()=>{};
  const paint=(c:CanvasRenderingContext2D,color:string,x:number,y:number,width:number,height:number)=>{c.fillStyle=color;c.fillRect(x,y,width,height);};
  r.sprite=(c:CanvasRenderingContext2D)=>paint(c,'#00ff00',1000,475,180,130);r.doors=(c:CanvasRenderingContext2D)=>paint(c,'#0000ff',1000,475,85,130);r.hero.draw=(c:CanvasRenderingContext2D)=>paint(c,'#ff0000',1040,485,30,120);r.foreground=(c:CanvasRenderingContext2D)=>paint(c,'#00ffff',1040,580,30,25);r.draw(w,0,1);
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return Array.from(r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data).slice(0,3);};
  const result={samples:[sample(1130,540),sample(1020,540),sample(1050,540),sample(1050,590)],layers:r.layerTrace};canvas.remove();return result;
 });
 expect(result.samples[0][1]).toBeGreaterThan(200);expect(result.samples[1][2]).toBeGreaterThan(200);expect(result.samples[1][1]).toBe(0);expect(result.samples[2][0]).toBeGreaterThan(200);expect(result.samples[2][2]).toBe(0);expect(result.samples[3][1]).toBeGreaterThan(200);expect(result.samples[3][0]).toBe(0);
 expect(result.layers.indexOf('doors')).toBeGreaterThan(result.layers.indexOf('interactables'));expect(result.layers.indexOf('doors')).toBeLessThan(result.layers.indexOf('actors'));
});
