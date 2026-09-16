import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const state=(p:Page)=>p.evaluate(()=>(window as any).__BASE__.snapshot());
async function ready(page:Page){await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();}
async function approach(page:Page){await page.keyboard.down('KeyD');await expect(page.locator('#door-panel')).toBeVisible();await page.keyboard.up('KeyD');await expect(page.locator('#door-open')).toBeEnabled();}

test('Door handle, narrow keyhole, retreat and opening work with real controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await approach(page);
 expect((await state(page)).player.x).toBeCloseTo(1006.271,2);expect((await state(page)).visibleObjects).not.toContain('home/kitchen-sink');
 for(let i=0;i<4;i++)await page.locator('#zoom-in').click();await page.waitForTimeout(300);await mkdir('artifacts/doors',{recursive:true});await page.screenshot({path:'artifacts/doors/handle.png'});
 await page.keyboard.press('KeyQ');await expect.poll(async()=>(await state(page)).peeking).toBe(true);await expect(page.locator('#door-peek')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#door-open')).toBeDisabled();
 expect((await state(page)).visibleObjects).toContain('home/kitchen-sink');expect((await state(page)).visibleObjects).not.toContain('home/linen-cabinet');expect((await state(page)).explored).toContain('home/kitchen');await page.screenshot({path:'artifacts/doors/keyhole.png'});
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

test('An open entry closes with one press and never offers the keyhole panel',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('shelter-base-v1',JSON.stringify({version:3,levelId:'outskirts-house-v2',player:{x:570,floor:0,hp:100},inventory:{},doors:[{id:'home/entry',open:true}],objects:[],explored:[],flashlight:true,dogHp:60})));
 await ready(page);await expect(page.locator('#context-title')).toContainText('Закрыть');await page.locator('#interact').click();
 await expect.poll(async()=>(await state(page)).doors.find((d:any)=>d.id==='home/entry').open).toBe(false);await expect(page.locator('#door-panel')).toBeHidden();expect((await state(page)).doorInteraction).toBeNull();
 await page.keyboard.press('KeyQ');expect((await state(page)).peeking).toBe(false);await expect(page.locator('#context-title')).toContainText('Взяться за ручку');
});

test('Existing hand sprites touch the projected handle from both sides of every door',async({page})=>{
 await ready(page);const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts',gm='/src/base/architecture.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm),{doorGeometry}=await import(gm),assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.id='contact-fixture';canvas.style.cssText='position:fixed;left:0;top:0;width:1000px;height:850px;z-index:100';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld(),results=[];
  for(const d of w.doors)for(const side of [-1,1]){
   w.doorInteraction=null;d.open=false;d.openness=0;Object.assign(w.player,{x:d.x+side*70,previousX:d.x+side*70,floor:d.floor,y:w.floorY(d.floor),previousY:w.floorY(d.floor)});w.refreshSight();w.action({type:'interact',target:d.id});for(let n=0;n<65;n++)w.update(1/60);
   const target=doorGeometry(w.level,d).handle;
   for(const peek of [false,true]){if(peek){w.action({type:'door-peek'});for(let n=0;n<40;n++)w.update(1/60);}r.hero.reset();const c=canvas.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);c.setTransform(3,0,0,3,400-w.player.x*3,500-w.player.y*3);r.hero.draw(c,w.player,1,1,false,false,w.doorInteraction,w.doorHand);
    const x=400+(target.x-w.player.x)*3,y=500+(target.y-w.player.y)*3,pixels=c.getImageData(Math.round(x)-8,Math.round(y)-8,17,17).data;let skin=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>200&&pixels[i]>pixels[i+1]*1.16&&pixels[i+1]>pixels[i+2]*1.08)skin++;
    const core=c.getImageData(397,Math.round(y)-2,7,5).data;let coreAlpha=255;for(let j=3;j<core.length;j+=4)coreAlpha=Math.min(coreAlpha,core[j]);results.push({door:d.id,side,peek,skin,coreAlpha});
   }
  }
  w.doorInteraction=null;const entry=w.doors.find((d:any)=>d.id==='home/entry');entry.open=false;entry.openness=0;Object.assign(w.player,{x:575,previousX:575,floor:0,y:615,previousY:615});w.refreshSight();w.action({type:'interact',target:entry.id});for(let n=0;n<65;n++)w.update(1/60);w.powered=true;r.camera={x:660,y:450};r.zoom=2.6;r.hero.reset();r.draw(w,0,1);(window as any).__contactFixture={r,w};return results;
 });
 for(const sample of result){expect(sample.skin,JSON.stringify(sample)).toBeGreaterThan(12);expect(sample.coreAlpha,JSON.stringify(sample)).toBeGreaterThan(245);}
 await mkdir('artifacts/door-fixes',{recursive:true});await page.evaluate(async()=>{await new Promise(requestAnimationFrame);const {r,w}=(window as any).__contactFixture;r.draw(w,0,1);});await page.locator('#contact-fixture').screenshot({path:'artifacts/door-fixes/entry-handle.png'});
 await page.evaluate(()=>{const {r,w}=(window as any).__contactFixture;w.action({type:'door-peek'});for(let i=0;i<40;i++)w.update(1/60);r.hero.reset();r.draw(w,0,1);});await page.locator('#contact-fixture').screenshot({path:'artifacts/door-fixes/entry-keyhole.png'});
 await page.evaluate(()=>{document.querySelector('#contact-fixture')?.remove();delete (window as any).__contactFixture;});
});
