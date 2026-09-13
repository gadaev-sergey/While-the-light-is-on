import {test,expect} from '@playwright/test';
test('New cutouts have true alpha, and rendered light stops at closed doors and floors',async({page})=>{
 await page.goto('/');await expect(page.locator('#base-loading')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer.ts',wm='/src/base/world.ts';const {BaseAssets}=await import(am),{BaseRenderer}=await import(rm),{BaseWorld}=await import(wm);
  const assets=new BaseAssets();await assets.load(()=>{});const alpha:Record<string,number>={};
  for(const name of ['furniture','objects','dog','walk','idle','punch']){const im=assets.images[name],canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;const c=canvas.getContext('2d')!;c.drawImage(im,0,0);const data=c.getImageData(0,0,im.width,im.height).data;let count=0;for(let i=3;i<data.length;i+=4)if(data[i]<8)count++;alpha[name]=count/(im.width*im.height);}
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);const renderer=new BaseRenderer(canvas,assets),w=new BaseWorld();Object.assign(w.player,{x:1000,previousX:1000});w.refreshSight();
  const luminance=(x:number,y:number)=>{const p=renderer.worldToScreen({x,y}),d=renderer.c.getImageData(Math.round(p.x*renderer.dpr),Math.round(p.y*renderer.dpr),3,3).data;let sum=0;for(let i=0;i<d.length;i+=4)sum+=(d[i]+d[i+1]+d[i+2])/3;return sum/9;};
  renderer.draw(w,0,1);const closed=luminance(1280,520),aboveClosed=luminance(1000,330);w.action({type:'interact',target:'kitchen-door'});renderer.draw(w,0,1);const open=luminance(1280,520),aboveOpen=luminance(1000,330);canvas.remove();return {alpha,closed,open,aboveClosed,aboveOpen};
 });
 for(const [name,alpha] of Object.entries(result.alpha))expect(alpha,`${name} needs transparent space`).toBeGreaterThan(.3);
 expect(result.open).toBeGreaterThan(result.closed+8);expect(Math.abs(result.aboveOpen-result.aboveClosed)).toBeLessThan(3);
 console.log('Door light pixels:',result.closed,'→',result.open,'floor:',result.aboveClosed,'→',result.aboveOpen);
});
