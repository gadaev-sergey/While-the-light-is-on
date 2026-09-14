import {test,expect} from '@playwright/test';
test('New cutouts have true alpha, and rendered light stops at closed doors and floors',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);
  const assets=new BaseAssets();await assets.load(()=>{});const alpha:Record<string,number>={};
  for(const name of ['furniture','objects','dog','walk','idle','punch','damage']){const im=assets.images[name],canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const c=canvas.getContext('2d')!;c.drawImage(im,0,0);const data=c.getImageData(0,0,im.width,im.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i]<8)count++;alpha[name]=count/(im.width*im.height);}
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const renderer=new BaseRenderer(canvas,assets),w=new BaseWorld();Object.assign(w.player,{x:1000,previousX:1000});w.setTime(0);w.refreshSight();
  const luminance=(x:number,y:number)=>{const p=renderer.worldToScreen({x,y}),d=renderer.c.getImageData(Math.round(p.x*renderer.dpr),Math.round(p.y*renderer.dpr),3,3).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=(d[i]+d[i+1]+d[i+2])/3;return sum/9;};
  renderer.draw(w,0,1);const closed=luminance(1280,520),aboveClosed=luminance(1000,330);w.action({type:'interact',target:'home/kitchen-door'});renderer.draw(w,0,1);const open=luminance(1280,520),aboveOpen=luminance(1000,330);canvas.remove();return {alpha,closed,open,aboveClosed,aboveOpen};
 });
 for(const [name,alpha] of Object.entries(result.alpha))expect(alpha,`${name} needs transparent space`).toBeGreaterThan(.3);
 expect(result.open).toBeGreaterThan(result.closed+8);expect(Math.abs(result.aboveOpen-result.aboveClosed)).toBeLessThan(3);
 console.log('Door light pixels:',result.closed,'→',result.open,'floor:',result.aboveClosed,'→',result.aboveOpen);
});

test('Broken back walls reveal the actual background, while the prepared board state fills the opening',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const renderer=new BaseRenderer(canvas,assets),w=new BaseWorld();w.flashlight=false;w.dog.hp=0;
  renderer.background=(c:CanvasRenderingContext2D)=>{c.fillStyle='#ff00ff';c.fillRect(-1000,-1000,5000,5000);};for(const key of ['yard','lighting','fogOfWar','flashlight','markers','foreground','stair','stairRails','architectureEdges','floors','shadow'])renderer[key]=()=>{};renderer.hero.draw=()=>{};
  const aperture=w.openings.find((o:any)=>o.id==='home/hall-breach');
  const sample=()=>{const p=renderer.worldToScreen({x:aperture.x-aperture.width/2,y:615-aperture.bottom-aperture.height}),q=renderer.worldToScreen({x:aperture.x+aperture.width/2,y:615-aperture.bottom}),pixels=renderer.c.getImageData(Math.round(p.x*renderer.dpr),Math.round(p.y*renderer.dpr),Math.round((q.x-p.x)*renderer.dpr),Math.round((q.y-p.y)*renderer.dpr)).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>100&&pixels[i+1]<10&&pixels[i+2]>100)count++;return count;};
  renderer.draw(w,0,1);const open=sample();w.setOpeningState(aperture.id,'boarded');renderer.draw(w,0,1);const boarded=sample();canvas.remove();return {open,boarded};
 });
 expect(result.open).toBeGreaterThan(1500);expect(result.boarded).toBeLessThan(result.open*.1);
});

test('Pixels respect objects behind the floor, actors over stairs, and low foreground over actors',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const pixels=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();w.flashlight=false;w.dog.hp=0;
  for(const key of ['background','house','doors','yard','lighting','fogOfWar','markers','stairRails','architectureEdges','shadow'])r[key]=()=>{};
  const paint=(c:CanvasRenderingContext2D,color:string,x:number,y:number,width:number,height:number)=>{c.fillStyle=color;c.fillRect(x,y,width,height);};
  w.visibleObjects=()=>[{kind:'chest',atlas:'objects',frame:1,x:630,floor:0,width:70,height:130}];
  r.sprite=(c:CanvasRenderingContext2D)=>paint(c,'#0000ff',600,480,70,130);
  r.floors=(c:CanvasRenderingContext2D)=>paint(c,'#00ff00',600,590,70,36);
  r.stair=(c:CanvasRenderingContext2D)=>paint(c,'#ffff00',600,520,70,95);
  r.hero.draw=(c:CanvasRenderingContext2D)=>paint(c,'#ff0000',620,510,30,108);
  r.foreground=(c:CanvasRenderingContext2D)=>paint(c,'#00ffff',620,610,30,10);r.draw(w,0,1);
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return Array.from(r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data).slice(0,3);};
  const result=[sample(610,500),sample(610,600),sample(630,530),sample(630,614)];canvas.remove();return result;
 });
 expect(pixels[0][2]).toBeGreaterThan(180);expect(pixels[0][0]).toBe(0);
 expect(pixels[1][1]).toBeGreaterThan(180);expect(pixels[1][2]).toBe(0);
 expect(pixels[2][0]).toBeGreaterThan(180);expect(pixels[2][1]).toBe(0);
 expect(pixels[3][1]).toBeGreaterThan(180);expect(pixels[3][2]).toBeGreaterThan(180);expect(pixels[3][0]).toBe(0);
});

test('Fog blurs hidden details without darkening or brightening the visible room',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();r.draw(w,0,1);
  const c=r.c;c.setTransform(1,0,0,1,0,0);c.fillStyle='#808080';c.fillRect(0,0,canvas.width,canvas.height);r.transform(c);
  for(const cy of [520,305])for(let x=680;x<820;x+=8){c.fillStyle=(x/8)%2?'#fff':'#000';c.fillRect(x,cy-25,8,50);}
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data[0];};
  const before=sample(650,520);r.fogOfWar(w);const range=(y:number)=>{const a=[];for(let x=712;x<790;x+=4)a.push(sample(x,y));return Math.max(...a)-Math.min(...a);};
  const result={visibleContrast:range(520),hiddenContrast:range(305),before,after:sample(650,520),hiddenBrightness:sample(900,305)};canvas.remove();return result;
 });
 expect(result.visibleContrast).toBeGreaterThan(200);expect(result.hiddenContrast).toBeLessThan(25);expect(result.after).toBe(result.before);expect(result.hiddenBrightness).toBe(128);
});

test('Actual lighting pixels respond to daylight apertures and a directional lamp without a hero halo',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts',lm='/src/base/lighting.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm),{daylightStyle}=await import(lm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();r.draw(w,0,1);w.flashlight=false;w.doors.forEach((d:any)=>d.open=false);w.refreshSight();
  const render=()=>{const c=r.c;c.setTransform(1,0,0,1,0,0);c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);r.transform(c);r.environment=daylightStyle(w.dayMinutes);r.lighting(w);};
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data[0];};
  render();const day=sample(650,530);w.openings.forEach((o:any)=>o.state='boarded');w.refreshSight();render();const boarded=sample(650,530);w.setTime(0);render();const night=sample(650,530),behindOff=sample(570,546),beamOff=sample(740,546);
  w.flashlight=true;w.aim=0;render();const behindOn=sample(570,546),beamOn=sample(740,546);canvas.remove();return {day,boarded,night,behindOff,behindOn,beamOff,beamOn};
 });
 expect(result.day).toBeGreaterThan(result.boarded+30);expect(result.boarded).toBeGreaterThan(result.night+20);expect(result.behindOn).toBe(result.behindOff);expect(result.beamOn).toBeGreaterThan(result.beamOff+80);
});
