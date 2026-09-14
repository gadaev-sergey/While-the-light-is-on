import {test,expect} from '@playwright/test';
test('Door openings remain free of black cut material and the swinging leaf stays visible',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();r.draw(w,0,1);
  const clear=()=>{r.c.setTransform(1,0,0,1,0,0);r.c.fillStyle='#ff00ff';r.c.fillRect(0,0,canvas.width,canvas.height);r.transform(r.c);};
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return Array.from<number>(r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data).slice(0,3);};
  clear();r.cutaway(r.c,w);const openings=w.doors.map((d:any)=>sample(d.x+4,w.floorY(d.floor)-75)),door=w.doors.find((d:any)=>d.id==='home/kitchen-door');
  const closed=()=>{clear();r.doors(r.c,w);r.cutaway(r.c,w);return sample(1096,540);};const shut=closed();door.open=true;for(let i=0;i<30;i++)w.update(1/60);const open=closed();canvas.remove();return {openings,shut,open};
 });
 for(const sample of result.openings)expect(sample).toEqual([255,0,255]);expect(result.shut).toEqual([255,0,255]);expect(result.open[2]).toBeLessThan(150);expect(Math.max(...result.open)).toBeGreaterThan(10);
});

test('Rough cuts join floor slabs, outside walls and ground without seams at different zooms',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();let gaps=0;const edgeHeights=new Set<number>();
  for(const zoom of [.8,1,1.3]){r.zoom=zoom;r.draw(w,0,1);const c=r.c;c.setTransform(1,0,0,1,0,0);c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);r.transform(c);r.cutaway(c,w);
   const pixel=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data[0];};
   for(const floor of [-1,0,1])for(let x=487;x<=1563;x+=2)if(pixel(x,w.floorY(floor)+15)!==0)gaps++;
   if(zoom===1)for(let x=560;x<740;x+=3)for(let y=397;y<412;y++)if(pixel(x,y)<5){edgeHeights.add(y);break;}
  }canvas.remove();return {gaps,variation:edgeHeights.size};
 });expect(result.gaps).toBe(0);expect(result.variation).toBeGreaterThan(2);
});

test('New cutouts have true alpha, and rendered light stops at closed doors and floors',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);
  const assets=new BaseAssets();await assets.load(()=>{});const alpha:Record<string,number>={};
  for(const name of ['furniture','objects','dog','walk','idle','punch','damage','interior','crate']){const im=assets.images[name],canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const c=canvas.getContext('2d')!;c.drawImage(im,0,0);const data=c.getImageData(0,0,im.width,im.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i]<8)count++;alpha[name]=count/(im.width*im.height);}
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const renderer=new BaseRenderer(canvas,assets),w=new BaseWorld();Object.assign(w.player,{x:1000,previousX:1000});w.setTime(0);w.refreshSight();
  const luminance=(x:number,y:number)=>{const p=renderer.worldToScreen({x,y}),d=renderer.c.getImageData(Math.round(p.x*renderer.dpr),Math.round(p.y*renderer.dpr),3,3).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=(d[i]+d[i+1]+d[i+2])/3;return sum/9;};
  renderer.draw(w,0,1);const closed=luminance(1280,520),aboveClosed=luminance(1000,330);w.action({type:'interact',target:'home/kitchen-door'});renderer.draw(w,0,1);const open=luminance(1280,520),aboveOpen=luminance(1000,330);canvas.remove();return {alpha,closed,open,aboveClosed,aboveOpen};
 });
 for(const [name,alpha] of Object.entries(result.alpha))expect(alpha,`${name} needs transparent space`).toBeGreaterThan(name==='crate'?.2:.3);
 expect(result.open).toBeGreaterThan(result.closed+8);expect(Math.abs(result.aboveOpen-result.aboveClosed)).toBeLessThan(3);
 console.log('Door light pixels:',result.closed,'→',result.open,'floor:',result.aboveClosed,'→',result.aboveOpen);
});

test('Broken back walls reveal the actual background, while the prepared board state fills the opening',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const renderer=new BaseRenderer(canvas,assets),w=new BaseWorld();w.flashlight=false;w.dog.hp=0;
  renderer.background=(c:CanvasRenderingContext2D)=>{c.fillStyle='#ff00ff';c.fillRect(-1000,-1000,5000,5000);};for(const key of ['yard','lighting','fogOfWar','structuralForeground','flashlight','markers','foreground','stair','stairRails','architectureEdges','floors','shadow'])renderer[key]=()=>{};renderer.hero.draw=()=>{};
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
  for(const key of ['background','house','doors','yard','lighting','fogOfWar','structuralForeground','markers','stairRails','architectureEdges','shadow'])r[key]=()=>{};
  const paint=(c:CanvasRenderingContext2D,color:string,x:number,y:number,width:number,height:number)=>{c.fillStyle=color;c.fillRect(x,y,width,height);};
  w.visibleObjects=()=>[{kind:'chest',atlas:'objects',frame:1,x:630,floor:0,width:70,height:130}];
  r.sprite=(c:CanvasRenderingContext2D)=>paint(c,'#0000ff',600,480,70,130);
  r.floors=(c:CanvasRenderingContext2D)=>paint(c,'#00ff00',600,590,70,36);
  r.stair=(c:CanvasRenderingContext2D)=>paint(c,'#ffff00',600,520,70,95);
  r.hero.draw=(c:CanvasRenderingContext2D)=>paint(c,'#ff0000',620,510,30,108);
  r.foreground=(c:CanvasRenderingContext2D)=>paint(c,'#00ffff',620,610,30,10);r.draw(w,0,1);
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return Array.from<number>(r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data).slice(0,3);};
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
 expect(result.visibleContrast).toBeGreaterThan(200);expect(result.hiddenContrast).toBeGreaterThan(10);expect(result.hiddenContrast).toBeLessThan(150);expect(result.after).toBe(result.before);expect(result.hiddenBrightness).toBe(128);
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
 expect(result.day).toBeGreaterThan(result.boarded+30);expect(result.boarded).toBe(result.night);expect(result.behindOn).toBe(result.behindOff);expect(result.beamOn).toBeGreaterThan(result.beamOff+80);
});

test('Hidden floor faces and vertical partitions remain sharp above the weaker fog',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();r.draw(w,0,1);const layers=[...r.layerTrace],c=r.c;c.setTransform(1,0,0,1,0,0);c.fillStyle='#808080';c.fillRect(0,0,canvas.width,canvas.height);r.transform(c);
  for(let x=680;x<820;x+=8){c.fillStyle=(x/8)%2?'#fff':'#000';c.fillRect(x,392,8,28);c.fillRect(x,280,8,50);}
  for(let y=670;y<780;y+=8){c.fillStyle=((y-670)/8)%2?'#fff':'#000';c.fillRect(1063,y,14,8);}
  r.fogOfWar(w);r.structuralForeground(w);
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data[0];},contrast=(values:number[])=>Math.max(...values)-Math.min(...values);
  const floor=[],wall=[],interior=[];for(let x=712;x<790;x+=4){floor.push(sample(x,396));interior.push(sample(x,305));}for(let y=690;y<754;y+=4)wall.push(sample(1070,y));
  const result={layers,floor:contrast(floor),wall:contrast(wall),interior:contrast(interior),hidden:!w.visible({x:750,y:396})&&!w.visible({x:1070,y:710})};canvas.remove();return result;
 });
 expect(result.hidden).toBe(true);expect(result.floor).toBeGreaterThan(200);expect(result.wall).toBeGreaterThan(200);expect(result.interior).toBeLessThan(150);expect(result.layers.indexOf('structure')).toBeGreaterThan(result.layers.indexOf('visibility'));
});

test('Rendered daylight and flashlight cross the stairwell but not an intact replacement slab',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts',lm='/src/base/lighting.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm),{daylightStyle}=await import(lm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld(),level=w.level,sealed={...level,stairs:[]};Object.assign(w.player,{x:900,previousX:900});w.aim=-Math.PI/2;w.setTime(0);w.refreshSight();r.draw(w,0,1);
  const render=()=>{r.level=w.level;const c=r.c;c.setTransform(1,0,0,1,0,0);c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);r.transform(c);r.environment=daylightStyle(w.dayMinutes);r.lighting(w);};
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data[0];};
  render();const lampOpen=sample(917,330);w.level=sealed;w.refreshSight();render();const lampSealed=sample(917,330);
  w.flashlight=false;w.setTime(720);w.openings.forEach((o:any)=>o.state=o.id==='home/workshop-window'?'open':'boarded');w.doors.forEach((d:any)=>d.open=false);w.refreshSight();render();const sunSealed=sample(900,480);
  w.level=level;w.refreshSight();render();const sunOpen=sample(900,480);w.openings.forEach((o:any)=>o.state='boarded');w.refreshSight();render();const darkRoom=sample(900,480),darkCellar=sample(900,740);w.powered=true;render();const poweredRoom=sample(900,480);canvas.remove();return {lampOpen,lampSealed,sunOpen,sunSealed,darkRoom,darkCellar,poweredRoom};
 });
 expect(result.lampOpen).toBeGreaterThan(result.lampSealed+80);expect(result.sunOpen).toBeGreaterThan(result.sunSealed+8);expect(result.darkRoom).toBe(result.darkCellar);expect(result.poweredRoom).toBeGreaterThan(result.darkRoom+80);
});

test('Building and earth cut faces stay black under daylight, a flashlight and fog',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();const cuts=[{x:800,y:414},{x:492,y:300},{x:1050,y:430},{x:800,y:145},{x:400,y:750},{x:1000,y:880}],samples:number[][]=[];
  for(const time of [0,420,720,1140]){w.setTime(time);w.powered=true;w.flashlight=true;w.aim=-Math.PI/2;r.draw(w,0,1);for(const p of cuts){const screen=r.worldToScreen(p);samples.push(Array.from<number>(r.c.getImageData(Math.round(screen.x*r.dpr),Math.round(screen.y*r.dpr),1,1).data).slice(0,3));}}
  w.setTime(720);r.draw(w,0,1);const p=r.worldToScreen({x:650,y:330}),interior=Array.from<number>(r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data).slice(0,3);canvas.remove();return {samples,interior};
 });
 for(const [i,sample] of result.samples.entries())expect(Math.max(...sample),`Cut sample ${i%6}, preset ${Math.floor(i/6)}: ${sample}`).toBe(0);expect(Math.max(...result.interior)).toBeGreaterThan(10);
});

test('Fog has a gradual visual boundary while geometric sight remains blocked',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();r.draw(w,0,1);
  const corners=[{x:600,y:450},{x:900,y:450},{x:900,y:550},{x:600,y:550}];w.sight={origin:{x:750,y:500},segments:corners.map((a:any,i:number)=>({a,b:corners[(i+1)%4]}))};r.fogOfWar(w);
  const values=[880,894,900,906,920].map(x=>{const p=r.worldToScreen({x,y:500});return r.fog.getContext('2d').getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data[3];});const hidden=!w.visible({x:910,y:500});canvas.remove();return {values,hidden};
 });
 expect(result.hidden).toBe(true);expect(result.values[0]).toBeLessThan(5);expect(result.values[4]).toBeGreaterThan(250);expect(result.values[2]).toBeGreaterThan(60);expect(result.values[2]).toBeLessThan(210);for(let i=1;i<result.values.length;i++)expect(result.values[i]).toBeGreaterThan(result.values[i-1]);
});

test('Window light forms brighter directional strips and disappears when boarded',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts',lm='/src/base/lighting.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm),{daylightStyle,daylightSources}=await import(lm);const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();w.flashlight=false;w.setTime(420);w.doors.forEach((d:any)=>d.open=false);w.openings.forEach((o:any)=>o.state=o.id==='home/workshop-window-0'?'open':'boarded');w.refreshSight();r.draw(w,0,1);
  const source=daylightSources(w.level,w.doors,w.openings,w.dayMinutes)[1],along={x:source.origin.x+Math.cos(source.angle)*65,y:source.origin.y+Math.sin(source.angle)*65},against={x:source.origin.x-Math.cos(source.angle)*65,y:source.origin.y-Math.sin(source.angle)*65};
  const sample=(p:any)=>{const s=r.worldToScreen(p);return r.c.getImageData(Math.round(s.x*r.dpr),Math.round(s.y*r.dpr),1,1).data[0];},render=()=>{r.c.setTransform(1,0,0,1,0,0);r.c.fillStyle='#fff';r.c.fillRect(0,0,canvas.width,canvas.height);r.transform(r.c);r.environment=daylightStyle(w.dayMinutes);r.lighting(w);};
  render();const beam=sample(along),ambient=sample(against);w.openings.forEach((o:any)=>o.state='boarded');w.refreshSight();render();const sealed=sample(along);canvas.remove();return {beam,ambient,sealed};
 });
 expect(result.beam).toBeGreaterThan(result.ambient+20);expect(result.beam).toBeGreaterThan(result.sealed+30);
});
