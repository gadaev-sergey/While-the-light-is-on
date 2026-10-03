import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

async function ready(page:Page){await page.goto('/player.html?project=games/while-the-light-is-on');await expect(page.locator('#base-loading')).toBeHidden();}
const state=(page:Page)=>page.evaluate(()=>(window as any).__BASE__.snapshot());

test('The game camera stays frontal and cannot zoom or rotate; click navigation remains aligned',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await ready(page);await expect(page.locator('#base-canvas')).toHaveAttribute('data-renderer','3d');
 await expect(page.getByRole('button',{name:'Приблизить',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Повернуть ракурс вправо',exact:true})).toHaveCount(0);
 const canvas=(await page.locator('#base-canvas').boundingBox())!;await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await page.mouse.wheel(0,-600);await page.mouse.down({button:'right'});await page.mouse.move(canvas.x+canvas.width/2+100,canvas.y+canvas.height/2+60,{steps:5});await page.mouse.up({button:'right'});
 const locked=await page.evaluate(()=>(window as any).__BASE__.rendering());expect(locked.angle).toBe(0);expect(locked.cameraPose.direction.map((v:number)=>v||0)).toEqual([0,0,-1]);expect(locked.cameraPose.zoom).toBe(1);
 const point=await page.evaluate(()=>(window as any).__BASE__.projection(1280,400)),box=(await page.locator('#base-canvas').boundingBox())!;
 await page.mouse.click(box.x+point.x,box.y+point.y);await expect.poll(async()=>(await state(page)).location,{timeout:15000}).toBe('Спальня');
 await expect.poll(async()=>(await state(page)).navigation).toBeNull();
 const info=await page.evaluate(()=>(window as any).__BASE__.rendering());expect(info.triangles).toBeGreaterThan(1000);expect(info.hero.type).toBe('PlaneGeometry');
 await mkdir('artifacts/3d',{recursive:true});await page.screenshot({path:'artifacts/3d/frontal-bedroom.png'});
 expect((await page.evaluate(()=>(window as any).__BASE__.rendering())).cameraPose.direction.map((v:number)=>v||0)).toEqual([0,0,-1]);
 await page.screenshot({path:'artifacts/3d/bedroom.png'});expect(errors).toEqual([]);
});

test('Projected object buttons search real supplies and 3D doors follow their saved state',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Ящики с припасами',exact:true}).click();
 await expect.poll(async()=>(await state(page)).objects.find((o:any)=>o.id==='home/supply-crates').searched).toBe(true);
 await page.keyboard.down('KeyD');await expect(page.locator('#door-panel')).toBeVisible();await page.keyboard.up('KeyD');await expect(page.locator('#door-open')).toBeEnabled();
 expect((await page.evaluate(()=>(window as any).__BASE__.rendering())).objects.find((o:any)=>o.id==='home/kitchen-sink').visible).toBe(false);
 await page.screenshot({path:'artifacts/3d/door-handle.png'});
 await page.locator('#door-open').click();await expect.poll(()=>page.evaluate(()=>(window as any).__BASE__.rendering().doors.find((d:any)=>d.id==='home/kitchen-door').angle)).toBeLessThan(-1.4);
 // The leaf reaches this angle before the opening animation commits visibility.
 await expect.poll(()=>page.evaluate(()=>(window as any).__BASE__.rendering().objects.find((o:any)=>o.id==='home/kitchen-sink').visible)).toBe(true);
 await page.waitForTimeout(2200);await page.reload();await expect(page.locator('#base-loading')).toBeHidden();
 expect((await state(page)).objects.find((o:any)=>o.id==='home/supply-crates').searched).toBe(true);
 expect((await page.evaluate(()=>(window as any).__BASE__.rendering())).doors.find((d:any)=>d.id==='home/kitchen-door').angle).toBeLessThan(-1.4);
});

test('Real meshes leave windows and stair apertures open; door shadows stop the flashlight',async({page})=>{
 await ready(page);
 const result=await page.evaluate(async()=>{
  const am='/src/base/assets.ts',rm='/src/base/renderer-3d.ts',wm='/src/base/world.ts',dm='/src/base/dimensions.ts',tm='/node_modules/three/build/three.module.js';
  const {BaseAssets}=await import(am),{ThreeRenderer}=await import(rm),{BaseWorld}=await import(wm),T=await import(tm),{DIMENSIONS:D,metres,wx}=await import(dm),assets=new BaseAssets();await assets.load(()=>{});
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;top:0;width:1440px;height:810px';document.body.append(canvas);
  const r=new ThreeRenderer(canvas,assets),w=new BaseWorld();r.draw(w,.1,1);r.structure.updateMatrixWorld(true);
  const ray=(origin:number[],direction:number[],far:number)=>new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction),0,far).intersectObject(r.structure,true).length;
  const aperture=ray([wx(578),metres(100),.5],[0,0,-1],2.6),wall=ray([wx(670),metres(150),.5],[0,0,-1],2.6);
  const stairOpening=ray([wx(840),metres(215)+.03,D.stairs.z],[0,-1,0],.25),solidFloor=ray([wx(670),metres(215)+.03,.50],[0,-1,0],.25);
  const closedDoor=ray([wx(1015),1,.50],[1,0,0],.7);
  const volume=[...r.objects.values()].map((g:any)=>new T.Box3().setFromObject(g).getSize(new T.Vector3()).z);
  const sizeErrors=[...r.objects.entries()].map(([id,g]:any)=>{const size=new T.Box3().setFromObject(g).getSize(new T.Vector3()),expected=g.userData.dimensions;return Math.max(Math.abs(size.x-expected.width),Math.abs(size.y-expected.height),Math.abs(size.z-expected.depth));});
  const leaves=[...r.doors.values()].map((g:any)=>{const leaf=g.getObjectByName('door-leaf');return {...leaf.geometry.parameters};});
  const calibratedHeight=(320-r.heroScale.top)*r.heroScale.pixelMetres;
  let flatFurniture=0,bumpedAlbedo=0;r.objects.forEach((g:any)=>g.traverse((m:any)=>{if(m.geometry?.type==='PlaneGeometry')flatFurniture++;if(m.material?.bumpMap&&m.material.bumpMap===m.material.map)bumpedAlbedo++;}));
  const roundTrips=[];for(const projection of ['orthographic','perspective'])for(const fov of [25,60]){
   r.configureCamera({projection,fov});r.updateCamera(1,w);
   for(const p of [{x:600,y:615},{x:1300,y:400},{x:1100,y:830}]){const q=r.screenToWorld(r.worldToScreen(p));roundTrips.push(Math.hypot(p.x-q.x,p.y-q.y));}
  }
  r.configureCamera();Object.assign(w.player,{x:1000,previousX:1000});w.setTime(0);w.aim=0;w.flashlight=true;w.refreshSight();r.updateCamera(1,w);
  const probe=new T.Mesh(new T.PlaneGeometry(.25,.25),new T.MeshStandardMaterial({color:0xffffff,roughness:1}));probe.position.set(wx(1310),1.20,-1.59);probe.receiveShadow=true;r.structure.add(probe);
  const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const c=copy.getContext('2d')!;
  const sample=(position=probe.position)=>{r.draw(w,.1,1);c.drawImage(canvas,0,0);const p=r.project(position),ratio=r.gl.getPixelRatio(),data=c.getImageData(Math.round(p.x*ratio)-2,Math.round(p.y*ratio)-2,5,5).data;let sum=0;for(let i=0;i<data.length;i+=4)sum+=(data[i]+data[i+1]+data[i+2])/3;return sum/25;};
  const closedLight=sample(),door=w.doors.find((d:any)=>d.id==='home/kitchen-door');door.open=true;door.openness=1;w.refreshSight();const openLight=sample();r.structure.updateMatrixWorld(true);const openDoor=ray([wx(1015),1,.50],[1,0,0],.7);
  w.flashlight=false;const offLight=sample();r.postMaterial.uniforms.hazeDensity.value=0;w.flashlight=true;const airPoint=new T.Vector3(wx(1190),1.28,.35);const withoutHaze=sample(airPoint);
  r.postMaterial.uniforms.hazeDensity.value=.052;const withHaze=sample(airPoint);const nightImage=copy.toDataURL('image/png');
  door.open=false;door.openness=0;w.refreshSight();const closedAir=sample(airPoint);r.postMaterial.uniforms.hazeDensity.value=0;const closedAirClear=sample(airPoint);
  r.dispose();canvas.remove();return {nightImage,closedAir,closedAirClear,sizeErrors,leaves,calibratedHeight,flatFurniture,bumpedAlbedo,withoutHaze,withHaze,aperture,wall,stairOpening,solidFloor,closedDoor,openDoor,volume,roundTrips,closedLight,openLight,offLight};
 });
 await writeFile('artifacts/3d/night-haze.png',Buffer.from(result.nightImage.split(',')[1],'base64'));
 expect(result.withHaze).toBeGreaterThan(result.withoutHaze+2);expect(Math.abs(result.closedAir-result.closedAirClear)).toBeLessThan(3);
 expect(result.calibratedHeight).toBeCloseTo(1.78,6);for(const error of result.sizeErrors)expect(error).toBeLessThan(.00001);
 expect(result.flatFurniture).toBe(0);expect(result.bumpedAlbedo).toBe(0);
 for(const leaf of result.leaves){expect(leaf.height).toBeCloseTo(2.05,6);expect(leaf.depth).toBeGreaterThanOrEqual(.8);expect(leaf.depth).toBeLessThanOrEqual(.9);expect(leaf.width).toBeCloseTo(.045,6);}
 expect(result.aperture).toBe(0);expect(result.wall).toBeGreaterThan(0);expect(result.stairOpening).toBe(0);expect(result.solidFloor).toBeGreaterThan(0);
 expect(result.closedDoor).toBeGreaterThan(0);expect(result.openDoor).toBe(0);for(const depth of result.volume)expect(depth).toBeGreaterThan(.3);
 for(const error of result.roundTrips)expect(error).toBeLessThan(.001);
 expect(result.openLight).toBeGreaterThan(result.closedLight+12);expect(result.openLight).toBeGreaterThan(result.offLight+12);
 expect(Math.abs(result.closedLight-result.offLight)).toBeLessThan(6);
 console.log('3D haze:',{with:result.withHaze,without:result.withoutHaze,closed:result.closedAir,closedClear:result.closedAirClear});
 console.log('3D light at rear wall:',{closed:result.closedLight,open:result.openLight,off:result.offLight});
});
