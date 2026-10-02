import * as T from 'three';
import type {Arena,Box,SolidStyle,ItemKind,Vec3} from './arena.ts';
import {EYE_HEIGHT,HEIGHT} from './physics.ts';
import type {GameClient,PlayerView} from './client.ts';
import type {WeaponId} from './rules.ts';

const STYLE_TEXTURE:Record<SolidStyle,{base:string;kind:'plate'|'concrete'|'grate'|'hazard'|'rail'|'crate'|'pillar';scale:number;metal:number}>={
 floor:{base:'#4a4e57',kind:'plate',scale:.25,metal:.25},wall:{base:'#2c3039',kind:'concrete',scale:.125,metal:.1},metal:{base:'#59606d',kind:'grate',scale:.5,metal:.55},
 stair:{base:'#5f6570',kind:'hazard',scale:.5,metal:.35},rail:{base:'#d08a32',kind:'rail',scale:1,metal:.5},crate:{base:'#6e5a40',kind:'crate',scale:.5,metal:.1},pillar:{base:'#59606e',kind:'pillar',scale:.25,metal:.4},
};

function rng(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function paint(kind:string,base:string):HTMLCanvasElement{
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!,r=rng(kind.length*977+11);
 g.fillStyle=base;g.fillRect(0,0,256,256);
 for(let i=0;i<9000;i++){const v=r()>.5?255:0;g.fillStyle=`rgba(${v},${v},${v},${.02+r()*.04})`;g.fillRect(r()*256,r()*256,1+r()*2,1+r()*2);}
 g.lineWidth=2;
 if(kind==='plate'){g.strokeStyle='rgba(0,0,0,.45)';g.strokeRect(1,1,254,254);g.strokeRect(128,1,0,254);g.strokeRect(1,128,254,0);g.fillStyle='rgba(255,255,255,.08)';for(const [x,y] of [[10,10],[118,10],[138,10],[246,10],[10,118],[246,118],[10,246],[246,246],[118,246],[138,246],[10,138],[246,138]])g.fillRect(x-3,y-3,6,6);}
 if(kind==='concrete'){g.fillStyle='rgba(0,0,0,.25)';g.fillRect(0,120,256,6);g.fillStyle='rgba(255,140,40,.35)';g.fillRect(0,0,256,4);for(let i=0;i<6;i++){g.fillStyle='rgba(0,0,0,.12)';g.fillRect(r()*256,0,2+r()*3,256);}}
 if(kind==='grate'){g.strokeStyle='rgba(0,0,0,.55)';for(let i=0;i<=256;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.stroke();}g.strokeStyle='rgba(255,255,255,.1)';for(let i=2;i<=256;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.stroke();}}
 if(kind==='hazard'){for(let i=-256;i<512;i+=48){g.fillStyle='rgba(240,170,40,.75)';g.beginPath();g.moveTo(i,0);g.lineTo(i+24,0);g.lineTo(i+24-60,60);g.lineTo(i-60,60);g.fill();}g.fillStyle='rgba(0,0,0,.4)';g.fillRect(0,60,256,4);}
 if(kind==='rail'){g.fillStyle='rgba(0,0,0,.4)';for(let i=0;i<256;i+=64)g.fillRect(i,0,8,256);}
 if(kind==='crate'){g.strokeStyle='rgba(30,20,10,.7)';g.lineWidth=10;g.strokeRect(6,6,244,244);g.beginPath();g.moveTo(10,10);g.lineTo(246,246);g.stroke();}
 if(kind==='pillar'){g.fillStyle='rgba(0,0,0,.35)';for(let i=0;i<256;i+=64)g.fillRect(0,i,256,6);g.fillStyle='rgba(120,220,255,.5)';g.fillRect(120,0,16,256);}
 return c;
}
/** Блоки → одна геометрия с UV в мировых метрах, чтобы текстура не растягивалась. */
function boxesGeometry(boxes:Box[],scale:number){
 const pos:number[]=[],nor:number[]=[],uv:number[]=[];
 const face=(n:[number,number,number],corners:[number,number,number][],uvOf:(p:[number,number,number])=>[number,number])=>{
  for(const i of [0,1,2,0,2,3]){const p=corners[i];pos.push(...p);nor.push(...n);const [u,v]=uvOf(p);uv.push(u*scale,v*scale);}
 };
 for(const b of boxes){
  const {min:a,max:c}=b;
  face([0,1,0],[[a.x,c.y,a.z],[a.x,c.y,c.z],[c.x,c.y,c.z],[c.x,c.y,a.z]],p=>[p[0],p[2]]);
  face([0,-1,0],[[a.x,a.y,a.z],[c.x,a.y,a.z],[c.x,a.y,c.z],[a.x,a.y,c.z]],p=>[p[0],p[2]]);
  face([1,0,0],[[c.x,a.y,a.z],[c.x,c.y,a.z],[c.x,c.y,c.z],[c.x,a.y,c.z]],p=>[p[2],p[1]]);
  face([-1,0,0],[[a.x,a.y,a.z],[a.x,a.y,c.z],[a.x,c.y,c.z],[a.x,c.y,a.z]],p=>[p[2],p[1]]);
  face([0,0,1],[[a.x,a.y,c.z],[c.x,a.y,c.z],[c.x,c.y,c.z],[a.x,c.y,c.z]],p=>[p[0],p[1]]);
  face([0,0,-1],[[a.x,a.y,a.z],[a.x,c.y,a.z],[c.x,c.y,a.z],[c.x,a.y,a.z]],p=>[p[0],p[1]]);
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return g;
}

type Avatar={group:T.Group;body:T.Material;label:T.Sprite;legs:[T.Object3D,T.Object3D];gun:T.Group;flash:T.Mesh;last:Vec3;walk:number};

export class Renderer{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(80,1,.05,300);
 gunScene=new T.Scene();gunCamera=new T.PerspectiveCamera(60,1,.01,10);
 private canvas:HTMLCanvasElement;private arena:Arena;private disposables:{dispose():void}[]=[];
 private avatars=new Map<string,Avatar>();private items:{kind:ItemKind;group:T.Group;base:Vec3}[]=[];
 private pads:T.Mesh[]=[];private lava!:T.Texture;private lavaLight!:T.PointLight;
 private rocketMeshes:T.Mesh[]=[];private tracerMeshes:T.Mesh[]=[];private blastMeshes:T.Mesh[]=[];private sparkMeshes:T.Mesh[]=[];private flashLight:T.PointLight;
 private smoke:T.InstancedMesh;private puffs:{p:Vec3;age:number}[]=[];private dummy=new T.Object3D();
 private viewGuns:T.Group[]=[];private viewFlash:T.Mesh;private bob=0;private kick=0;private time=0;private shownWeapon=-1;private switchAnim=0;
 width=0;height=0;
 constructor(canvas:HTMLCanvasElement,arena:Arena){
  this.canvas=canvas;this.arena=arena;
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;this.renderer.autoClear=false;
  this.scene.background=new T.Color(0x0b0f1c);this.scene.fog=new T.Fog(0x0b0f1c,35,110);
  this.scene.add(new T.HemisphereLight(0x8fa6d8,0x3a2418,2.1));
  const moon=new T.DirectionalLight(0xbfd2ff,1.3);moon.position.set(-20,40,15);this.scene.add(moon);
  const warm=new T.DirectionalLight(0xffa060,.6);warm.position.set(25,10,-30);this.scene.add(warm);
  this.lavaLight=new T.PointLight(0xff6a20,60,40,1.6);this.lavaLight.position.set(0,1,0);this.scene.add(this.lavaLight);
  this.flashLight=new T.PointLight(0xffb060,0,16,2);this.scene.add(this.flashLight);
  this.buildArena();this.buildPads();this.buildItems();this.buildSky();
  const puff=this.track(new T.IcosahedronGeometry(.18,0));
  this.smoke=new T.InstancedMesh(puff,this.track(new T.MeshBasicMaterial({color:0x9a9aa6,transparent:true,opacity:.35,depthWrite:false})),160);
  this.smoke.instanceMatrix.setUsage(T.DynamicDrawUsage);this.smoke.frustumCulled=false;this.smoke.count=0;this.scene.add(this.smoke);
  this.gunScene.add(new T.HemisphereLight(0xdfe8ff,0x30241a,2.4));const key=new T.DirectionalLight(0xffe2c0,2.2);key.position.set(-1,2,1);this.gunScene.add(key);
  for(const w of [0,1,2] as WeaponId[]){const g=this.weaponModel(w,true);g.scale.setScalar(.5);g.visible=false;this.viewGuns.push(g);this.gunScene.add(g);}
  this.viewFlash=new T.Mesh(this.track(new T.OctahedronGeometry(.05,0)),this.track(new T.MeshBasicMaterial({color:0xff9a40,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false})));
  this.viewFlash.position.set(.28,-.2,-1.05);this.gunScene.add(this.viewFlash);
  this.resize();
 }
 private track<X extends {dispose():void}>(x:X){this.disposables.push(x);return x;}
 private std(color:T.ColorRepresentation,extra:T.MeshStandardMaterialParameters={}){return this.track(new T.MeshStandardMaterial({color,roughness:.75,metalness:.3,...extra}));}
 private glow(color:T.ColorRepresentation,opacity=1){return this.track(new T.MeshBasicMaterial({color,transparent:opacity<1,opacity,blending:opacity<1?T.AdditiveBlending:T.NormalBlending,depthWrite:opacity>=1}));}
 private mesh(parent:T.Object3D,geo:T.BufferGeometry,mat:T.Material,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;}
 private boxGeo(w:number,h:number,d:number){return this.track(new T.BoxGeometry(w,h,d));}

 private buildArena(){
  const groups=new Map<SolidStyle,Box[]>();for(const s of this.arena.solids){const list=groups.get(s.style)||[];list.push(s);groups.set(s.style,list);}
  for(const [style,boxes] of groups){
   const spec=STYLE_TEXTURE[style],tex=this.track(new T.CanvasTexture(paint(spec.kind,spec.base)));tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
   const m=new T.Mesh(this.track(boxesGeometry(boxes,spec.scale)),this.std(0xffffff,{map:tex,metalness:spec.metal,roughness:style==='rail'?.4:.8,emissive:style==='rail'?0x2a1400:0x000000}));this.scene.add(m);
  }
  // Световые полосы по стенам и кромкам ярусов — ориентиры высоты.
  const strip=this.glow(0x6fd6ff),warm=this.glow(0xffa040);
  for(const s of [-1,1]){
   for(const y of [2.2,8.5,14]){this.mesh(this.scene,this.boxGeo(64,.12,.05),y>8?strip:warm,0,y,s*31.97);this.mesh(this.scene,this.boxGeo(.05,.12,64),y>8?strip:warm,s*31.97,y,0);}
  }
  for(const [x0,x1,z0,z1] of [[-26,26,26,26],[-26,26,-26,-26],[-26,-26,-26,26],[26,26,-26,26]]){const w=Math.max(.06,x1-x0),d=Math.max(.06,z1-z0);this.mesh(this.scene,this.boxGeo(w,.06,d),strip,(x0+x1)/2,4.47,(z0+z1)/2);}
  for(const k of [-1,1]){this.mesh(this.scene,this.boxGeo(12.1,.1,.08),warm,0,9.42,k*6.04);this.mesh(this.scene,this.boxGeo(.08,.1,12.1),warm,k*6.04,9.42,0);}
  // Лава.
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d')!,r=rng(42);
  const grad=g.createLinearGradient(0,0,256,256);grad.addColorStop(0,'#ff3d0a');grad.addColorStop(.5,'#ff8a1f');grad.addColorStop(1,'#ff2a05');g.fillStyle=grad;g.fillRect(0,0,256,256);
  for(let i=0;i<70;i++){g.fillStyle=`rgba(${60+r()*40},${10+r()*20},0,${.4+r()*.4})`;g.beginPath();g.ellipse(r()*256,r()*256,8+r()*30,5+r()*16,r()*3,0,Math.PI*2);g.fill();}
  for(let i=0;i<40;i++){g.fillStyle=`rgba(255,${200+r()*55},120,${.3+r()*.5})`;g.beginPath();g.arc(r()*256,r()*256,1+r()*4,0,Math.PI*2);g.fill();}
  this.lava=this.track(new T.CanvasTexture(c));this.lava.wrapS=this.lava.wrapT=T.RepeatWrapping;this.lava.repeat.set(3,3);this.lava.colorSpace=T.SRGBColorSpace;
  const lava=this.arena.lava,lw=lava.max.x-lava.min.x,ld=lava.max.z-lava.min.z;
  const plane=new T.Mesh(this.track(new T.PlaneGeometry(lw,ld)),this.track(new T.MeshBasicMaterial({map:this.lava,color:0xffffff})));plane.rotation.x=-Math.PI/2;plane.position.set((lava.min.x+lava.max.x)/2,lava.max.y,(lava.min.z+lava.max.z)/2);this.scene.add(plane);
 }
 private buildPads(){
  const ring=this.glow(0x58f0ff),beam=this.glow(0x58f0ff,.16),base=this.std(0x2b3340,{metalness:.7});
  for(const pad of this.arena.pads){
   const g=new T.Group();g.position.set(pad.center.x,pad.center.y,pad.center.z);this.scene.add(g);
   this.mesh(g,this.track(new T.CylinderGeometry(1.15,1.25,.18,24)),base,0,.09,0);
   const disc=this.mesh(g,this.track(new T.CylinderGeometry(.9,.9,.02,24)),ring,0,.19,0);this.pads.push(disc);
   const b=this.mesh(g,this.track(new T.CylinderGeometry(.85,1,4,24,1,true)),beam,0,2.2,0);b.renderOrder=2;
  }
 }
 private buildItems(){
  for(const spot of this.arena.items){
   const g=new T.Group();g.position.set(spot.pos.x,spot.pos.y,spot.pos.z);this.scene.add(g);
   const color=spot.kind==='mega'?0x4fb4ff:spot.kind==='armor'?0xffc23a:spot.kind==='health'?0x5dff8a:spot.kind==='shotgun'||spot.kind==='shells'?0xff9a3d:0xff4d4d;
   this.mesh(g,this.track(new T.CylinderGeometry(.55,.6,.06,20)),this.glow(color,.5),0,.03,0);
   const item=new T.Group();item.position.y=.75;g.add(item);
   if(spot.kind==='mega'){this.mesh(item,this.track(new T.IcosahedronGeometry(.42,1)),this.std(color,{emissive:color,emissiveIntensity:.9,metalness:.1,roughness:.2}));}
   else if(spot.kind==='health'){const m=this.std(0xf2f2f2);this.mesh(item,this.boxGeo(.5,.5,.5),m);const cross=this.glow(color);this.mesh(item,this.boxGeo(.52,.14,.36),cross);this.mesh(item,this.boxGeo(.52,.36,.14),cross);}
   else if(spot.kind==='armor'){const m=this.std(color,{metalness:.8,roughness:.3,emissive:0x3a2500});this.mesh(item,this.boxGeo(.6,.55,.22),m);this.mesh(item,this.boxGeo(.3,.2,.24),m,0,.34,0);}
   else if(spot.kind==='shells'||spot.kind==='rockets'){const m=this.std(0x404650);this.mesh(item,this.boxGeo(.55,.35,.4),m);this.mesh(item,this.boxGeo(.57,.08,.42),this.glow(color),0,.06,0);}
   else{const gun=this.weaponModel(spot.kind==='shotgun'?1:2,false);gun.scale.setScalar(1.4);gun.rotation.y=Math.PI/2;item.add(gun);}
   this.items.push({kind:spot.kind,group:item,base:spot.pos});
  }
 }
 private buildSky(){
  // Звёзды и далёкие огни города за стенами.
  const pts:number[]=[],r=rng(9);for(let i=0;i<600;i++){const a=r()*Math.PI*2,e=.15+r()*1.2,d=200;pts.push(Math.cos(a)*Math.cos(e)*d,Math.sin(e)*d,Math.sin(a)*Math.cos(e)*d);}
  const geo=this.track(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(pts,3));
  this.scene.add(new T.Points(geo,this.track(new T.PointsMaterial({color:0xcfd8ff,size:1.2,sizeAttenuation:false,fog:false}))));
  const beacon=this.glow(0xff3030);for(const x of [-32.5,32.5])for(const z of [-32.5,32.5])this.mesh(this.scene,this.track(new T.SphereGeometry(.3,8,6)),beacon,x,18.4,z);
 }
 private weaponModel(w:WeaponId,view:boolean){
  const g=new T.Group(),dark=this.std(0x4a515e,{metalness:.35,roughness:.5}),trim=this.std(w===0?0x3fd0ff:w===1?0xff9a3d:0xff4d4d,{emissive:w===0?0x0a4a66:w===1?0x4a2400:0x4a0a0a,metalness:.5});
  if(w===0){this.mesh(g,this.boxGeo(.08,.1,.42),dark);this.mesh(g,this.boxGeo(.05,.05,.3),trim,0,.03,-.3);this.mesh(g,this.boxGeo(.06,.14,.08),dark,0,-.1,.08);}
  if(w===1){this.mesh(g,this.boxGeo(.1,.11,.5),dark);for(const x of [-.03,.03]){const b=this.mesh(g,this.track(new T.CylinderGeometry(.025,.025,.5,8)),trim,x,.03,-.38);b.rotation.x=Math.PI/2;}this.mesh(g,this.boxGeo(.08,.16,.1),dark,0,-.1,.12);}
  if(w===2){const tube=this.mesh(g,this.track(new T.CylinderGeometry(.075,.085,.75,12)),dark,0,0,-.2);tube.rotation.x=Math.PI/2;this.mesh(g,this.track(new T.TorusGeometry(.085,.02,6,16)),trim,0,0,-.57);this.mesh(g,this.boxGeo(.07,.15,.1),dark,0,-.12,.05);this.mesh(g,this.boxGeo(.04,.05,.3),trim,0,.09,-.15);}
  if(!view)g.position.y=0;return g;
 }
 private avatar(p:PlayerView):Avatar{
  const known=this.avatars.get(p.id);if(known)return known;
  const group=new T.Group(),body=this.std(p.color,{emissive:p.color,emissiveIntensity:.18,metalness:.4,roughness:.5}),dark=this.std(0x22252c,{metalness:.6});
  const visor=this.glow(0xe8fbff);
  const legs:[T.Object3D,T.Object3D]=[new T.Group(),new T.Group()];
  legs.forEach((leg,i)=>{leg.position.set(i?.14:-.14,.82,0);group.add(leg);this.mesh(leg,this.boxGeo(.18,.8,.2),dark,0,-.4,0);});
  this.mesh(group,this.boxGeo(.56,.62,.32),body,0,1.13,0);this.mesh(group,this.boxGeo(.6,.12,.34),dark,0,.86,0);
  this.mesh(group,this.boxGeo(.3,.3,.3),body,0,1.6,0);this.mesh(group,this.boxGeo(.24,.07,.05),visor,0,1.62,-.16);
  const gun=new T.Group();gun.position.set(.3,1.18,-.25);group.add(gun);
  const flash=this.mesh(gun,this.track(new T.IcosahedronGeometry(.12,0)),this.glow(0xffd28a,.9),0,0,-.55);flash.visible=false;
  const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d')!;g.font='bold 30px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.lineWidth=6;g.strokeStyle='rgba(0,0,0,.8)';g.strokeText(p.name,128,32);g.fillStyle=p.color;g.fillText(p.name,128,32);
  const label=new T.Sprite(this.track(new T.SpriteMaterial({map:this.track(new T.CanvasTexture(c)),depthTest:true,transparent:true})));label.scale.set(1.6,.4,1);label.position.y=2.15;group.add(label);
  this.scene.add(group);
  const a:Avatar={group,body,label,legs,gun,flash,last:{...p.pos},walk:0};this.avatars.set(p.id,a);return a;
 }
 private gunFor(a:Avatar,w:WeaponId){
  if(a.gun.userData.w===w)return;a.gun.userData.w=w;for(const c of [...a.gun.children])if(c!==a.flash)a.gun.remove(c);a.gun.add(this.weaponModel(w,false));
 }
 resize(){
  const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;if(w===this.width&&h===this.height)return;
  this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.gunCamera.aspect=w/h;this.gunCamera.updateProjectionMatrix();
 }

 draw(client:GameClient,dt:number){
  this.time+=dt;this.resize();
  this.lava.offset.set(Math.sin(this.time*.13)*.3,this.time*.02);this.lavaLight.intensity=55+Math.sin(this.time*2.1)*8;
  for(const [i,pad] of this.pads.entries())(pad.material as T.MeshBasicMaterial).color.setHSL(.52,1,.5+.15*Math.sin(this.time*4+i));
  this.items.forEach((it,i)=>{it.group.visible=client.itemAvailable(i);it.group.rotation.y=this.time*1.6;it.group.position.y=.75+Math.sin(this.time*2+i)*.1;});
  // Камера.
  const over=client.phase==='over';
  if(over){const a=this.time*.15;this.camera.position.set(Math.sin(a)*24,16,Math.cos(a)*24);this.camera.lookAt(0,6,0);}
  else{
   const e=client.body.pos,dead=!client.alive||client.fell,speed=Math.hypot(client.body.vel.x,client.body.vel.z);
   if(client.body.onGround&&!dead)this.bob+=dt*speed*1.4;
   const sink=dead?Math.min(1.2,(client.time-client.deathTime)*2):0;
   this.camera.position.set(e.x,e.y+EYE_HEIGHT-sink+Math.sin(this.bob*2)*.03*Math.min(1,speed/8),e.z);
   this.camera.rotation.set(client.pitch,client.yaw,dead?Math.min(.5,sink*.4):0,'YXZ');
  }
  // Игроки.
  const seen=new Set<string>();
  for(const p of client.views()){
   const a=this.avatar(p);seen.add(p.id);a.group.visible=p.alive&&!over||over;a.group.position.set(p.pos.x,p.pos.y,p.pos.z);a.group.rotation.y=p.yaw;
   const moved=Math.hypot(p.pos.x-a.last.x,p.pos.z-a.last.z);a.walk+=moved*3.2;a.last={...p.pos};
   const swing=Math.sin(a.walk)*Math.min(.7,moved/(dt||1)/10);a.legs[0].rotation.x=swing;a.legs[1].rotation.x=-swing;
   a.gun.rotation.x=p.pitch;this.gunFor(a,p.weapon);a.flash.visible=p.muzzle>0;
  }
  for(const [id,a] of this.avatars)if(!seen.has(id)){this.scene.remove(a.group);this.avatars.delete(id);}
  this.drawEffects(client,dt);
  this.renderer.clear();this.renderer.render(this.scene,this.camera);
  if(!over&&client.alive&&!client.fell)this.drawGun(client,dt);
 }
 private pool(list:T.Mesh[],n:number,make:()=>T.Mesh){while(list.length<n){const m=make();this.scene.add(m);list.push(m);}list.forEach((m,i)=>m.visible=i<n);return list;}
 private drawEffects(client:GameClient,dt:number){
  // Трассеры: тонкие вытянутые бруски от ствола до точки попадания.
  const tracers=this.pool(this.tracerMeshes,client.tracers.length,()=>new T.Mesh(this.boxGeo(.014,.014,1),this.track(new T.MeshBasicMaterial({color:0xffffff,transparent:true,blending:T.AdditiveBlending,depthWrite:false}))));
  client.tracers.forEach((t,i)=>{const m=tracers[i],dx=t.to.x-t.from.x,dy=t.to.y-t.from.y,dz=t.to.z-t.from.z,l=Math.hypot(dx,dy,dz)||.01;
   m.position.set(t.from.x+dx/2,t.from.y+dy/2,t.from.z+dz/2);m.scale.set(1,1,l);m.lookAt(t.to.x,t.to.y,t.to.z);const mat=m.material as T.MeshBasicMaterial;mat.color.set(t.color);mat.opacity=.8*Math.max(0,1-t.age/t.life);});
  const rockets=client.rockets.filter(r=>!r.dead);
  const meshes=this.pool(this.rocketMeshes,rockets.length,()=>{const m=new T.Mesh(this.boxGeo(.14,.14,.5),this.glow(0xffcf7a));return m;});
  rockets.forEach((r,i)=>{const m=meshes[i];m.position.set(r.pos.x,r.pos.y,r.pos.z);m.lookAt(r.pos.x+r.dir.x,r.pos.y+r.dir.y,r.pos.z+r.dir.z);if(Math.random()<.9)this.puffs.push({p:{...r.pos},age:0});});
  this.puffs=this.puffs.filter(p=>(p.age+=dt)<.9).slice(-160);
  this.puffs.forEach((p,i)=>{this.dummy.position.set(p.p.x,p.p.y+p.age*.6,p.p.z);this.dummy.scale.setScalar(.6+p.age*2.2);this.dummy.updateMatrix();this.smoke.setMatrixAt(i,this.dummy.matrix);});
  this.smoke.count=this.puffs.length;this.smoke.instanceMatrix.needsUpdate=true;
  const blasts=this.pool(this.blastMeshes,client.blasts.length,()=>new T.Mesh(this.track(new T.IcosahedronGeometry(1,2)),this.track(new T.MeshBasicMaterial({color:0xffa040,transparent:true,blending:T.AdditiveBlending,depthWrite:false}))));
  let flash=0;
  client.blasts.forEach((b,i)=>{const m=blasts[i],k=b.age/.7;m.position.set(b.pos.x,b.pos.y,b.pos.z);m.scale.setScalar(.5+k*3.2);const mat=m.material as T.MeshBasicMaterial;mat.opacity=Math.max(0,.95-k*1.2);mat.color.setHSL(.08-k*.06,1,.6-k*.3);
   if(1-k>flash){flash=1-k;this.flashLight.position.set(b.pos.x,b.pos.y+.5,b.pos.z);}});
  this.flashLight.intensity=flash*120;
  const sparks=this.pool(this.sparkMeshes,client.sparks.length,()=>new T.Mesh(this.track(new T.IcosahedronGeometry(.09,0)),this.track(new T.MeshBasicMaterial({color:0xffffff,transparent:true,blending:T.AdditiveBlending,depthWrite:false}))));
  client.sparks.forEach((s,i)=>{const m=sparks[i];m.position.set(s.pos.x,s.pos.y,s.pos.z);m.scale.setScalar(1+s.age*6);const mat=m.material as T.MeshBasicMaterial;mat.color.set(s.color);mat.opacity=1-s.age/.25;});
 }
 private drawGun(client:GameClient,dt:number){
  if(this.shownWeapon!==client.weapon){this.shownWeapon=client.weapon;this.switchAnim=1;}
  this.switchAnim=Math.max(0,this.switchAnim-dt*5);this.kick=Math.max(0,this.kick-dt*6);if(client.muzzle>.06)this.kick=client.weapon===0?.25:1;
  const speed=Math.hypot(client.body.vel.x,client.body.vel.z),sway=client.body.onGround?Math.min(1,speed/8):.2;
  this.viewGuns.forEach((g,i)=>{g.visible=i===client.weapon;if(!g.visible)return;
   g.position.set(.22+Math.cos(this.bob)*.01*sway,-.21-this.switchAnim*.25+Math.abs(Math.sin(this.bob))*.01*sway,-.5+this.kick*.05);g.rotation.set(this.kick*.12,-.06,0);});
  this.viewFlash.visible=client.muzzle>0;this.viewFlash.scale.set(client.weapon===0?.5:1,client.weapon===0?.5:1,client.weapon===0?1.2:2);this.viewFlash.rotation.z=this.time*40;this.viewFlash.position.set(.21,-.19,client.weapon===2?-.82:-.75);
  this.renderer.clearDepth();this.renderer.render(this.gunScene,this.gunCamera);
 }
 /** Проекция точки мира на экран (для индикатора урона и подписей). */
 project(p:Vec3){const v=new T.Vector3(p.x,p.y,p.z).project(this.camera);return {x:(v.x+1)/2*this.width,y:(1-v.y)/2*this.height,behind:v.z>1};}
 dispose(){for(const a of this.avatars.values())this.scene.remove(a.group);for(const d of this.disposables)d.dispose();this.renderer.dispose();}
}
export const PLAYER_HEIGHT=HEIGHT;
