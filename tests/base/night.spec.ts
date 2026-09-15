import {test,expect} from '@playwright/test';

test('Night has a visible moon and stars, with cold local light through windows and dark sealed rooms',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts',lm='/src/base/lighting.ts';
  const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm),{daylightStyle}=await import(lm),assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1600px;height:900px';document.body.append(canvas);const r=new BaseRenderer(canvas,assets),w=new BaseWorld();w.flashlight=false;w.setTime(0);w.doors.forEach((d:any)=>d.open=false);w.refreshSight();r.draw(w,0,1);
  const sample=(x:number,y:number)=>{const p=r.worldToScreen({x,y});return Array.from<number>(r.c.getImageData(Math.round(p.x*r.dpr),Math.round(p.y*r.dpr),1,1).data).slice(0,3);};
  const moon=r.nightSky.moonPosition(r.skyFrame()),withSky=sample(moon.x-8,moon.y),all=r.c.getImageData(0,0,canvas.width,canvas.height).data,drawSky=r.nightSky.draw.bind(r.nightSky);r.nightSky.draw=()=>{};r.draw(w,0,1);const withoutSky=sample(moon.x-8,moon.y),plain=r.c.getImageData(0,0,canvas.width,canvas.height).data;let starPixels=0;
  for(let y=5;y<145;y++)for(let x=40;x<1510;x++){const i=(Math.round(y*r.dpr)*canvas.width+Math.round(x*r.dpr))*4,p=r.screenToWorld({x,y});if(Math.hypot(p.x-moon.x,p.y-moon.y)>moon.r*2&&all[i+2]>plain[i+2]+12)starPixels++;}
  r.nightSky.draw=drawSky;
  const renderLight=()=>{r.c.setTransform(1,0,0,1,0,0);r.c.fillStyle='#fff';r.c.fillRect(0,0,canvas.width,canvas.height);r.transform(r.c);r.environment=daylightStyle(w.dayMinutes);r.lighting(w);};
  renderLight();const night=sample(650,530),cellar=sample(650,780);w.setTime(720);renderLight();const day=sample(650,530);w.setTime(0);w.openings.forEach((o:any)=>o.state='boarded');w.refreshSight();renderLight();const sealed=sample(650,530);
  const sky=document.createElement('canvas');sky.width=1600;sky.height=900;const sc=sky.getContext('2d')!;r.nightSky.draw(sc,{x:0,y:0,width:1600,height:900},daylightStyle(720).night,0);const daytimeSky=sc.getImageData(0,0,1600,900).data.some((value:number,index:number)=>index%4===3&&value!==0);
  canvas.remove();return {withSky,withoutSky,starPixels,night,day,sealed,cellar,daytimeSky};
 });
 expect(result.withSky[2]).toBeGreaterThan(result.withoutSky[2]+25);expect(result.starPixels).toBeGreaterThan(20);expect(result.daytimeSky).toBe(false);
 expect(result.night[2]).toBeGreaterThan(result.night[0]);expect(result.night[2]).toBeGreaterThan(result.sealed[2]+8);expect(result.day[0]).toBeGreaterThan(result.night[0]+30);expect(result.cellar).toEqual(result.sealed);
});
