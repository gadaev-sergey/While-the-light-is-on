import {test,expect} from '@playwright/test';

test('Rear shafts stay behind solid sprites, while gaps and surface lighting remain visible',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts',lm='/src/base/layers.ts';
  const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm),{HOUSE_LAYERS}=await import(lm);
  const assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);
  const r=new BaseRenderer(canvas,assets),w=new BaseWorld();w.flashlight=false;w.player.x=w.player.previousX=1260;w.player.y=w.player.previousY=400;w.player.floor=1;w.refreshSight();w.visible=()=>true;w.visibleObjects=()=>w.objects;w.dog.hp=0;
  // Isolate composition from perception. Keep the real furniture, stairs, doors
  // and animated hero; a strong rear test shaft makes any leak unambiguous.
  r.fogOfWar=()=>{};r.structuralForeground=()=>{};r.markers=()=>{};
  let beam=false;r.directLight=(c:CanvasRenderingContext2D)=>{if(beam){c.fillStyle='#fff';c.fillRect(400,180,1180,650);}};
  const regions:Record<string,[number,number,number,number]>={wardrobe:[1145,285,1215,365],hero:[1240,285,1280,385],stairs:[810,430,900,560],ladder:[1378,660,1422,800],door:[1055,485,1085,575]};
  const indices=(bounds:number[])=>{const a=r.worldToScreen({x:bounds[0],y:bounds[1]}),b=r.worldToScreen({x:bounds[2],y:bounds[3]}),result:number[]=[];for(let y=Math.ceil(a.y*r.dpr);y<Math.floor(b.y*r.dpr);y++)for(let x=Math.ceil(a.x*r.dpr);x<Math.floor(b.x*r.dpr);x++)if(x>=0&&x<canvas.width&&y>=0&&y<canvas.height)result.push((y*canvas.width+x)*4);return result;};
  const pixels=()=>r.c.getImageData(0,0,canvas.width,canvas.height).data;
  const solid=()=>r.solidLayer.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
  r.draw(w,0,1);const before=pixels(),surface=solid(),layers=[...r.layerTrace];beam=true;r.draw(w,0,1);const after=pixels();
  const opaque:Record<string,{count:number;difference:number}>={};for(const [name,bounds] of Object.entries(regions)){let count=0,difference=0;for(const i of indices(bounds))if(surface[i+3]===255){count++;for(let j=0;j<3;j++)difference=Math.max(difference,Math.abs(after[i+j]-before[i+j]));}opaque[name]={count,difference};}
  let litGaps=0;for(const i of indices(regions.ladder))if(surface[i+3]===0&&after[i]>before[i]+30)litGaps++;
  // Loot feedback must change the material, never its opacity or the view behind it.
  w.objects.find((o:any)=>o.id==='home/linen-cabinet').searched=true;r.draw(w,0,1);const searched=solid();let opacityChanges=0,darkerPixels=0;
  for(const i of indices(regions.wardrobe))if(surface[i+3]===255){if(searched[i+3]!==255)opacityChanges++;if(searched[i]<surface[i]-3)darkerPixels++;}
  w.flashlight=true;w.aim=Math.PI;r.draw(w,0,1);const lamp=solid();let litSurface=0,lampOpacityChanges=0;
  for(const i of indices(regions.wardrobe))if(searched[i+3]===255){if(lamp[i]>searched[i]+10)litSurface++;if(lamp[i+3]!==255)lampOpacityChanges++;}
  canvas.remove();return {opaque,litGaps,opacityChanges,darkerPixels,litSurface,lampOpacityChanges,layers,expected:HOUSE_LAYERS};
 });
 expect(result.layers).toEqual(result.expected);
 for(const [name,value] of Object.entries(result.opaque)){expect(value.count,`${name}: opaque pixels`).toBeGreaterThan(50);expect(value.difference,`${name}: rear shaft leaking through`).toBeLessThanOrEqual(1);}
 expect(result.litGaps).toBeGreaterThan(100);
 expect(result.opacityChanges).toBe(0);expect(result.darkerPixels).toBeGreaterThan(100);
 expect(result.lampOpacityChanges).toBe(0);expect(result.litSurface).toBeGreaterThan(100);
});
