import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('Hit-stop freezes the contact pose of each attack instead of its previous anticipation frame',async({page})=>{
  await page.goto('/');await expect(page.locator('.menu-overlay')).toBeVisible();
  const poses=await page.evaluate(async()=>{
    const am='/src/game/assets.ts',rm='/src/game/renderer.ts',wm='/src/game/world.ts';
    const {Assets}=await import(am),{Renderer}=await import(rm),{World}=await import(wm);
    const assets=new Assets();await assets.load(()=>{});
    const renderer=new Renderer(document.createElement('canvas'),assets),result=[];
    for(const action of ['attack','heavy','kick']){
      const w=new World({volume:0,particles:false,shake:false,difficulty:'normal'});w.start(true);renderer.draw(w,1/60);
      w.action(action,{x:0,y:0});
      for(let i=0;i<60&&!w.player.attackHit;i++){w.update(1/60);renderer.draw(w,1/60);}
      const first=JSON.stringify(renderer.playerAnimation.current);
      renderer.draw(w,1/60);result.push({action,pose:renderer.playerAnimation.current,hitstop:w.hitstop,frozen:first===JSON.stringify(renderer.playerAnimation.current)});
    }
    return result;
  });
  for(const {action,pose,hitstop,frozen} of poses){
    expect(hitstop).toBeGreaterThan(0);expect(frozen).toBe(true);
    expect(pose).toEqual([{frame:action==='attack'?'punch:4':action==='kick'?'kick:4':'attack:4',weight:1}]);
  }
});

test('Ground pixels keep their world positions across every former wrap seam',async({page})=>{
  await page.goto('/');await expect(page.locator('.menu-overlay')).toBeVisible();
  const result=await page.evaluate(async()=>{
    const module='/src/game/ground.ts';const {Ground}=await import(module);
    const img=new Image();img.src='/assets/office-floor.png';await img.decode();const floor=new Ground(img);
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const c=canvas.getContext('2d')!;
    const render=(camera:number)=>{c.clearRect(0,0,1280,720);floor.draw(c,camera);return c.getImageData(0,508,1280,212).data;};
    const errors=[];
    for(const boundary of [0,1280,2560,3840]){
      const before=render(boundary-1),after=render(boundary+1);let diff=0,count=0;
      for(let y=0;y<212;y++)for(let x=0;x<1278;x++)for(let channel=0;channel<3;channel++){
        diff+=Math.abs(before[(y*1280+x+2)*4+channel]-after[(y*1280+x)*4+channel]);count++;
      }errors.push(diff/count);
    }
    const tile=floor.tile as HTMLCanvasElement,pixels=tile.getContext('2d')!.getImageData(0,0,tile.width,tile.height).data;
    let seam=0,interior=0;
    for(let y=0;y<tile.height;y++)for(let ch=0;ch<3;ch++){
      seam+=Math.abs(pixels[(y*tile.width)*4+ch]-pixels[(y*tile.width+tile.width-1)*4+ch]);
      for(let x=1;x<tile.width;x++)interior+=Math.abs(pixels[(y*tile.width+x)*4+ch]-pixels[(y*tile.width+x-1)*4+ch]);
    }
    render(1279);
    return {errors,seam:seam/(tile.height*3),interior:interior/(tile.height*3*(tile.width-1)),strip:tile.toDataURL()};
  });
  console.log('Ground continuity:',result.errors,'seam gradient:',result.seam,'normal gradient:',result.interior);
  for(const error of result.errors)expect(error).toBeLessThan(.1);
  expect(result.seam).toBeLessThan(result.interior*2+1);
  await fs.writeFile('test-results/seamless-ground.png',Buffer.from(result.strip.split(',')[1],'base64'));
});

test('Animation assets have real transparency and render on a stable shared baseline',async({page})=>{
  await page.goto('/');await expect(page.locator('.menu-overlay')).toBeVisible();
  const result=await page.evaluate(async()=>{
    const assetsModule='/src/game/assets.ts',painterModule='/src/game/pose-painter.ts';
    const {Assets}=await import(assetsModule),{PosePainter}=await import(painterModule);
    const assets=new Assets();await assets.load(()=>{});const painter=new PosePainter(assets);
    const alpha:Record<string,number>={};
    for(const name of ['developer-walk','developer-attack','developer-jump','developer-punch','developer-kick','enemies','props','elevator']){
      const im=assets.images[name],canvas=document.createElement('canvas');canvas.width=im.width;canvas.height=im.height;
      const c=canvas.getContext('2d')!;c.drawImage(im,0,0);const pixels=c.getImageData(0,0,im.width,im.height).data;
      let clear=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]<8)clear++;alpha[name]=clear/(im.width*im.height);
    }
    const canvas=document.createElement('canvas');canvas.width=2160;canvas.height=1375;const c=canvas.getContext('2d')!;
    c.fillStyle='#1a2926';c.fillRect(0,0,2160,1375);
    for(let row=0;row<5;row++)for(let i=0;i<(row===4?9:8);i++){
      c.save();c.translate(120+i*240,245+row*275);c.strokeStyle='#70977d';c.beginPath();c.moveTo(-115,0);c.lineTo(115,0);c.moveTo(0,-220);c.lineTo(0,12);c.stroke();
      painter.draw(c,[{frame:`${['walk','attack','jump','punch','kick'][row]}:${i}`,weight:1}]);c.fillStyle='#e9cea5';c.font='12px monospace';c.fillText(`${['WALK','ATTACK','JUMP','PUNCH','KICK'][row]} ${i+1}`,-105,22);c.restore();
    }
    const bleed:number[]=[];
    for(const i of [4,5,6]){
      const pose=painter.texture(`attack:${i}`),context=pose.getContext('2d')!;
      const pixels=context.getImageData((painter.originX+85)*2,(painter.originY-20)*2,90,52).data;
      let maximum=0;for(let j=3;j<pixels.length;j+=4)maximum=Math.max(maximum,pixels[j]);bleed.push(maximum);
    }
    const fist=painter.texture('punch:5').getContext('2d')!.getImageData((painter.originX+79)*2,(painter.originY-151)*2,16,22).data;
    let fistAlpha=0;for(let i=3;i<fist.length;i+=4)fistAlpha=Math.max(fistAlpha,fist[i]);
    const footprints:number[]=[];
    for(let i=0;i<8;i++){
      const pose=painter.texture(`walk:${i}`),context=pose.getContext('2d')!;
      const pixels=context.getImageData(0,(painter.originY-12)*2,pose.width,28).data;
      let left=pose.width,right=0;
      for(let y=0;y<28;y++)for(let x=0;x<pose.width;x++)if(pixels[(y*pose.width+x)*4+3]>100){left=Math.min(left,x);right=Math.max(right,x);}
      footprints.push((right-left)/2);

    }
    return {alpha,bleed,footprints,fistAlpha,strip:canvas.toDataURL()};
  });
  await fs.writeFile('test-results/normalized-animation-frames.png',Buffer.from(result.strip.split(',')[1],'base64'));
  // The tall elevator intentionally fills more of its canvas than the animated cutouts.
  for(const [name,alpha] of Object.entries(result.alpha))expect(alpha).toBeGreaterThan(name==='elevator'?.3:.35);
  for(const alpha of result.bleed)expect(alpha).toBeLessThan(8);
  expect(result.fistAlpha).toBeGreaterThan(180);
  console.log('Walk footprint widths:',result.footprints);
  // Passing poses must visibly transfer the free foot underneath the body.
  for(const i of [2,6])expect(result.footprints[i]).toBeLessThan(result.footprints[0]*.65);
});
