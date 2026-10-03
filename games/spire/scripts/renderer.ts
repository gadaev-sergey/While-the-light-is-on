import * as T from 'three';
import {raycast,vec,type Arena,type Box,type SolidStyle,type ItemKind,type Vec3} from './arena.ts';
import {forwardOf} from './physics.ts';
import {HEIGHT,HEAD_SIZE,heightOf,leanReach} from './physics.ts';
import type {GameClient,PlayerView} from './client.ts';
import {WEAPONS,BLASTER,SHOTGUN,AUTO,RIFLE,ROCKET,WEAPON_IDS,type WeaponId} from './rules.ts';
import {WeaponKit} from './weapons3d.ts';
import {Particles,Decals,fxTextures,decalMaterial} from './effects.ts';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const ITEM_COLOR:Record<ItemKind,number>={mega:0x4fb4ff,armor:0xffc23a,health:0x5dff8a,shotgun:0xff9a3d,shells:0xff9a3d,auto:0x9cff3d,bullets:0x9cff3d,rifle:0xa98bff,rounds:0xa98bff,rocket:0xff4d4d,rockets:0xff4d4d};
const ITEM_WEAPON:Partial<Record<ItemKind,WeaponId>>={shotgun:SHOTGUN,auto:AUTO,rifle:RIFLE,rocket:ROCKET};
const STYLE_TEXTURE:Record<SolidStyle,{base:string;kind:'plate'|'concrete'|'grate'|'hazard'|'rail'|'crate'|'pillar'|'block'|'stripes';scale:number;metal:number}>={
 concrete:{base:'#5b5f67',kind:'block',scale:.25,metal:.05},barrier:{base:'#26282d',kind:'stripes',scale:.5,metal:.2},
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
 // Бетонные плиты: швы, подтёки и сколы.
 if(kind==='block'){g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=3;g.strokeRect(1.5,1.5,253,253);g.beginPath();g.moveTo(0,128);g.lineTo(256,128);g.stroke();
  for(let i=0;i<14;i++){g.fillStyle=`rgba(0,0,0,${.05+r()*.08})`;const x=r()*256;g.fillRect(x,r()*120,3+r()*10,40+r()*90);}
  for(let i=0;i<30;i++){g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.arc(r()*256,r()*256,1+r()*2.5,0,Math.PI*2);g.fill();}
  g.fillStyle='rgba(255,255,255,.06)';g.fillRect(0,0,256,6);}
 // Сплошные предупреждающие полосы — у барьеров и перегородок лазов.
 if(kind==='stripes'){for(let i=-256;i<512;i+=64){g.fillStyle='rgba(235,175,35,.9)';g.beginPath();g.moveTo(i,0);g.lineTo(i+32,0);g.lineTo(i+32-256,256);g.lineTo(i-256,256);g.fill();}
  g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=4;g.strokeRect(2,2,252,252);}
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

/** Положение оружия у бедра (в метрах от камеры), толчок отдачи [назад, вверх] и размер вспышки. */
const VIEW_HIP:[number,number,number][]=[[.2,-.2,-.5],[.19,-.21,-.42],[.19,-.21,-.44],[.2,-.22,-.42],[.27,-.29,-.62]];
const VIEW_KICK:[number,number][]=[[.02,.04],[.07,.16],[.025,.05],[.08,.14],[.09,.12]];
const VIEW_FLASH=[.5,1.1,.8,1.4,1.8];
/** Трассер: толщина и цвет (у бластера — цвет игрока). */
const TRACER_WIDTH=[1,.7,.8,2.4,1];
const TRACER_COLOR=['','#ffe2a8','#ffe9b8','#ffffff',''];
export type Quality='high'|'low';
type Leg={hip:T.Object3D;knee:T.Object3D};
type Avatar={group:T.Group;pelvis:T.Object3D;torso:T.Object3D;head:T.Object3D;arms:T.Object3D;legs:[Leg,Leg];label:T.Sprite;gun:T.Group;flash:T.Mesh;last:Vec3;walk:number;
 pose:{hip:number;bend:number;roll:number;legs:[number,number,number,number]};glint?:T.Sprite};
// Ноги бойца: бедро и голень со стопой; таз стоя — на высоте их суммы.
const THIGH=.44,SHIN=.46,HIP_STAND=THIGH+SHIN;
/** Двухзвенная нога: углы бедра и колена, чтобы стопа стояла на полу на forward метров впереди таза. */
function legIK(hipY:number,forward:number):[number,number]{
 const d=Math.min(THIGH+SHIN-1e-3,Math.max(.05,Math.hypot(forward,hipY))),phi=Math.atan2(forward,hipY);
 const a1=Math.acos(Math.max(-1,Math.min(1,(THIGH*THIGH+d*d-SHIN*SHIN)/(2*THIGH*d)))),a2=Math.acos(Math.max(-1,Math.min(1,(THIGH*THIGH+SHIN*SHIN-d*d)/(2*THIGH*SHIN))));
 return [phi+a1,-(Math.PI-a2)];
}

export class Renderer{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(80,1,.05,300);
 gunScene=new T.Scene();gunCamera=new T.PerspectiveCamera(60,1,.01,10);
 private canvas:HTMLCanvasElement;private arena:Arena;private disposables:{dispose():void}[]=[];
 private avatars=new Map<string,Avatar>();private items:{kind:ItemKind;group:T.Group;base:Vec3}[]=[];
 private pads:T.Mesh[]=[];private lava!:T.Texture;private lavaLight!:T.PointLight;
 private rocketMeshes:T.Mesh[]=[];private tracerMeshes:T.Mesh[]=[];private blastMeshes:T.Mesh[]=[];private flashLight:T.PointLight;
 quality:Quality='high';blood=false;
 private hemi:T.HemisphereLight;private moon:T.DirectionalLight;private lamps:T.PointLight[]=[];private muzzleLight!:T.PointLight;private muzzleFlash=0;
 private searchlights:{group:T.Group;beam:T.Mesh;light:T.SpotLight;target:T.Object3D;phase:number}[]=[];
 private composer?:EffectComposer;private gunPass?:RenderPass;private bloom?:UnrealBloomPass;
 private fx!:{sparks:Particles;smoke:Particles;steam:Particles;embers:Particles;blood:Particles;debris:Particles;casings:Particles};
 private decals!:Decals;private decalMats!:{hole:T.Material;scorch:T.Material;blood:T.Material};private glintTexture!:T.Texture;
 private shockwaves:T.Mesh[]=[];private vents:T.Vector3[]=[];private steamTimer=0;
 private pendingCasings:{at:number;pos:T.Vector3;vel:T.Vector3;size:number;shell:boolean}[]=[];
 private kit:WeaponKit;private viewGuns:T.Group[]=[];private viewFlash:T.Mesh;private viewHeat:T.MeshStandardMaterial;private viewSleeve:T.MeshStandardMaterial;private viewCuff:T.MeshStandardMaterial;private bob=0;private roll=0;private fov=80;private slideTilt=0;private sprintT=0;private kick=0;private time=0;private shownWeapon=-1;private switchAnim=0;
 width=0;height=0;
 constructor(canvas:HTMLCanvasElement,arena:Arena){
  this.canvas=canvas;this.arena=arena;
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;this.renderer.autoClear=false;
  this.scene.background=new T.Color(0x0b0f1c);this.scene.fog=new T.Fog(0x0b0f1c,35,110);
  this.hemi=new T.HemisphereLight(0x8fa6d8,0x3a2418,2.1);this.scene.add(this.hemi);
  // Луна — единственный источник теней: ортографическая камера тени накрывает всю арену.
  const moon=this.moon=new T.DirectionalLight(0xbfd2ff,1.3);moon.position.set(-20,40,15);this.scene.add(moon);this.scene.add(moon.target);
  moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:5,far:110});moon.shadow.bias=-.0004;moon.shadow.normalBias=.03;
  this.renderer.shadowMap.type=T.PCFShadowMap;
  const warm=new T.DirectionalLight(0xffa060,.6);warm.position.set(25,10,-30);this.scene.add(warm);
  this.lavaLight=new T.PointLight(0xff6a20,60,40,1.6);this.lavaLight.position.set(0,1,0);this.scene.add(this.lavaLight);
  this.flashLight=new T.PointLight(0xffb060,0,16,2);this.scene.add(this.flashLight);
  this.kit=new WeaponKit(this.renderer);this.disposables.push(this.kit);
  this.buildArena();this.buildDecor();this.buildPads();this.buildItems();this.buildSky();
  this.buildLights();this.buildFx();
  this.scene.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshStandardMaterial){o.castShadow=true;o.receiveShadow=true;}});
  this.gunScene.add(new T.HemisphereLight(0xc8d4ff,0x30241a,.9));const key=new T.DirectionalLight(0xffe2c0,1.25);key.position.set(-1,2,1);this.gunScene.add(key);
  this.viewHeat=this.std(0x0a3040,{metalness:.2,roughness:.3,emissive:0x3fd0ff,emissiveIntensity:1.6});
  this.viewSleeve=this.std(0x3c424d,{roughness:.85,metalness:.05});this.viewCuff=this.std(0xff6b3d,{roughness:.5,metalness:.3,emissive:0x220800});
  for(const w of WEAPON_IDS)this.viewGuns.push(this.buildViewGun(w));
  this.viewFlash=new T.Mesh(this.track(new T.OctahedronGeometry(.05,0)),this.track(new T.MeshBasicMaterial({color:0xff9a40,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false})));
  this.gunScene.add(this.viewFlash);
  this.setQuality('high');
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
  for(const [x0,x1,z0,z1] of [[-25.6,25.6,25.58,25.58],[-25.6,25.6,-25.58,-25.58],[-25.58,-25.58,-25.6,25.6],[25.58,25.58,-25.6,25.6]]){const w=Math.max(.06,x1-x0),d=Math.max(.06,z1-z0);this.mesh(this.scene,this.boxGeo(w,.06,d),strip,(x0+x1)/2,4.47,(z0+z1)/2);}
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
 /** Декор арены: трубы с фланцами, лампы галереи, решётки в полу и таблички с надписями. */
 private buildDecor(){
  const pipe=this.std(0x6b717c,{metalness:.75,roughness:.38}),flange=this.std(0x3a3e46,{metalness:.8,roughness:.4}),housing=this.std(0x2a2d33,{metalness:.6,roughness:.5});
  const lamp=this.glow(0xffd9a0),grate=this.std(0x2b2f36,{metalness:.7,roughness:.5,map:this.track(new T.CanvasTexture(paint('grate','#3a3f48')))});
  for(const d of this.arena.decor){
   const {min:a,max:b}=d.box,size=[b.x-a.x,b.y-a.y,b.z-a.z],c=new T.Vector3((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
   const long=size.indexOf(Math.max(...size)),thin=size.indexOf(Math.min(...size));
   if(d.kind==='pipe'){
    const r=Math.min(...size.filter((_,i)=>i!==long))/2,len=size[long],m=this.mesh(this.scene,this.track(new T.CylinderGeometry(r,r,len,14)),pipe,c.x,c.y,c.z);
    if(long===0)m.rotation.z=Math.PI/2;if(long===2)m.rotation.x=Math.PI/2;
    for(let t=-len/2+2;t<len/2;t+=4){const f=this.mesh(this.scene,this.track(new T.CylinderGeometry(r*1.35,r*1.35,.08,14)),flange,c.x,c.y,c.z);f.rotation.copy(m.rotation);
     f.position.setComponent(long,c.getComponent(long)+t);}
   }
   if(d.kind==='lamp'){this.mesh(this.scene,this.boxGeo(size[0]+.08,.06,size[2]+.08),housing,c.x,b.y+.02,c.z);this.mesh(this.scene,this.boxGeo(size[0],size[1],size[2]),lamp,c.x,c.y,c.z);}
   if(d.kind==='vent')this.mesh(this.scene,this.boxGeo(size[0],size[1],size[2]),grate,c.x,c.y,c.z);
   if(d.kind==='sign'){
    const w=thin===0?size[2]:size[0],h=size[1],canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.max(64,Math.round(512*h/w));
    const g=canvas.getContext('2d')!;g.fillStyle='#14161b';g.fillRect(0,0,canvas.width,canvas.height);g.strokeStyle='#e8a830';g.lineWidth=8;g.strokeRect(6,6,canvas.width-12,canvas.height-12);
    g.fillStyle='#ffc24a';g.font=`900 ${Math.round(canvas.height*.56)}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(d.text,canvas.width/2,canvas.height/2+2);
    const tex=this.track(new T.CanvasTexture(canvas));tex.colorSpace=T.SRGBColorSpace;const mat=this.track(new T.MeshBasicMaterial({map:tex}));
    // Надпись — на обеих широких сторонах таблички, каждая читается без зеркала.
    for(const side of [-1,1]){
     const plane=this.mesh(this.scene,this.track(new T.PlaneGeometry(w,h)),mat,c.x,c.y,c.z);
     if(thin===0){plane.rotation.y=side*Math.PI/2;plane.position.x+=side*size[0]/2;}else{plane.rotation.y=side>0?0:Math.PI;plane.position.z+=side*size[2]/2;}
    }
   }
  }
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
   const color=ITEM_COLOR[spot.kind];
   this.mesh(g,this.track(new T.CylinderGeometry(.55,.6,.06,20)),this.glow(color,.5),0,.03,0);
   const item=new T.Group();item.position.y=.75;g.add(item);
   if(spot.kind==='mega'){this.mesh(item,this.track(new T.IcosahedronGeometry(.42,1)),this.std(color,{emissive:color,emissiveIntensity:.9,metalness:.1,roughness:.2}));}
   else if(spot.kind==='health'){const m=this.std(0xf2f2f2);this.mesh(item,this.boxGeo(.5,.5,.5),m);const cross=this.glow(color);this.mesh(item,this.boxGeo(.52,.14,.36),cross);this.mesh(item,this.boxGeo(.52,.36,.14),cross);}
   else if(spot.kind==='armor'){const m=this.std(color,{metalness:.8,roughness:.3,emissive:0x3a2500});this.mesh(item,this.boxGeo(.6,.55,.22),m);this.mesh(item,this.boxGeo(.3,.2,.24),m,0,.34,0);}
   else if(spot.kind==='shells'||spot.kind==='rockets'||spot.kind==='bullets'||spot.kind==='rounds'){const m=this.std(0x404650);this.mesh(item,this.boxGeo(.55,.35,.4),m);this.mesh(item,this.boxGeo(.57,.08,.42),this.glow(color),0,.06,0);}
   else{const gun=this.kit.model(ITEM_WEAPON[spot.kind]!);gun.scale.setScalar(1.25);gun.rotation.y=Math.PI/2;gun.position.y=.1;item.add(gun);}
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
 private avatar(p:PlayerView):Avatar{
  const known=this.avatars.get(p.id);if(known)return known;
  const armor=this.std(p.color,{emissive:p.color,emissiveIntensity:.3,metalness:.35,roughness:.45});
  const suit=this.std(0x4a505c,{metalness:.15,roughness:.8}),plate=this.std(0x6a7180,{metalness:.55,roughness:.4}),visor=this.glow(0xe8fbff),accent=this.glow(p.color);
  const group=new T.Group(),pelvis=new T.Group();pelvis.position.y=HIP_STAND;group.add(pelvis);
  this.mesh(pelvis,this.boxGeo(.34,.16,.22),suit);this.mesh(pelvis,this.boxGeo(.36,.06,.24),plate,0,.07,0);
  const leg=(side:number):Leg=>{
   const hip=new T.Group();hip.position.set(side*.11,-.04,0);pelvis.add(hip);
   this.mesh(hip,this.boxGeo(.15,THIGH,.17),suit,0,-THIGH/2,0);this.mesh(hip,this.boxGeo(.16,.2,.05),plate,0,-.2,-.09);
   const knee=new T.Group();knee.position.y=-THIGH;hip.add(knee);
   this.mesh(knee,this.boxGeo(.14,.12,.06),armor,0,0,-.09);this.mesh(knee,this.boxGeo(.13,SHIN-.08,.15),suit,0,-(SHIN-.08)/2,0);
   this.mesh(knee,this.boxGeo(.15,.1,.27),plate,0,-SHIN+.05,-.05);
   return {hip,knee};
  };
  const legs:[Leg,Leg]=[leg(-1),leg(1)];
  const torso=new T.Group();pelvis.add(torso);
  this.mesh(torso,this.boxGeo(.3,.24,.2),suit,0,.16,0);this.mesh(torso,this.boxGeo(.44,.32,.28),armor,0,.42,0);
  this.mesh(torso,this.boxGeo(.2,.1,.04),plate,0,.49,-.15);this.mesh(torso,this.boxGeo(.22,.025,.01),accent,0,.35,-.143);
  this.mesh(torso,this.boxGeo(.32,.36,.14),plate,0,.42,.2);this.mesh(torso,this.boxGeo(.015,.3,.015),plate,.12,.72,.24);
  for(const s of [-1,1])this.mesh(torso,this.boxGeo(.15,.1,.22),armor,s*.27,.56,0);
  this.mesh(torso,this.boxGeo(.1,.08,.1),suit,0,.6,0);
  const head=new T.Group();head.position.y=.64;torso.add(head);
  this.mesh(head,this.track(new T.SphereGeometry(.16,16,12)),plate,0,.13,0).scale.set(1,1.05,1.08);
  this.mesh(head,this.boxGeo(.25,.08,.07),visor,0,.13,-.13);this.mesh(head,this.boxGeo(.04,.04,.3),accent,0,.29,0);
  const arms=new T.Group();arms.position.y=.5;torso.add(arms);
  const limb=(from:[number,number,number],to:[number,number,number],w:number,mat:T.Material)=>{
   const a=new T.Vector3(...from),b=new T.Vector3(...to),m=new T.Mesh(this.boxGeo(w,w,a.distanceTo(b)+w*.6),mat);
   m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),b.clone().sub(a).normalize());arms.add(m);
  };
  limb([.25,0,0],[.24,-.22,-.1],.1,suit);limb([.24,-.22,-.1],[.12,-.1,-.3],.09,suit);this.mesh(arms,this.boxGeo(.08,.08,.08),plate,.12,-.1,-.31);
  limb([-.25,0,0],[-.2,-.2,-.24],.1,suit);limb([-.2,-.2,-.24],[.06,-.06,-.56],.09,suit);this.mesh(arms,this.boxGeo(.08,.08,.08),plate,.06,-.06,-.57);
  const gun=new T.Group();gun.position.set(.12,-.1,-.3);arms.add(gun);
  const flash=this.mesh(gun,this.track(new T.IcosahedronGeometry(.12,0)),this.glow(0xffd28a,.9),0,0,-.55);flash.visible=false;
  const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d')!;g.font='bold 30px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';
  g.lineWidth=6;g.strokeStyle='rgba(0,0,0,.8)';g.strokeText(p.name,128,32);g.fillStyle=p.color;g.fillText(p.name,128,32);
  const label=new T.Sprite(this.track(new T.SpriteMaterial({map:this.track(new T.CanvasTexture(c)),depthTest:true,transparent:true})));label.scale.set(1.6,.4,1);label.position.y=2.15;group.add(label);
  group.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=true;});
  this.scene.add(group);
  const a:Avatar={group,pelvis,torso,head,arms,legs,label,gun,flash,last:{...p.pos},walk:0,pose:{hip:HIP_STAND,bend:0,roll:0,legs:[0,0,0,0]}};this.avatars.set(p.id,a);return a;
 }
 /** Поза бойца по стойке, наклону и бегу; суставы плавно догоняют цель. */
 private poseAvatar(a:Avatar,p:PlayerView,dt:number,speed:number,airborne:boolean){
  const run=Math.min(1,speed/8),crouch=p.stance>0,s=Math.sin(a.walk),c=Math.cos(a.walk);
  let hip=HIP_STAND,bend=-.05-run*.15,legs:[number,number,number,number];
  if(p.stance===2){hip=.36;bend=.55;legs=[1.35,-.15,.45,-2.1];}
  else if(crouch&&airborne){hip=.62;bend=-.35;legs=[1.3,-2.2,1.1,-2];}
  else if(crouch){hip=.55;bend=-.6;const [h0,k0]=legIK(hip,.2+s*.22*run),[h1,k1]=legIK(hip,-.08-s*.22*run);legs=[h0,k0,h1,k1];}
  else if(airborne)legs=[.6,-1,.15,-.5];
  else legs=[s*.65*run,-(.1+Math.max(0,-c)*1.2)*run,-s*.65*run,-(.1+Math.max(0,c)*1.2)*run];
  const reach=leanReach(this.arena,{pos:p.pos,crouch,lean:p.lean,yaw:p.yaw}),arm=heightOf(crouch)-HEAD_SIZE/2-hip;
  const roll=-Math.asin(Math.max(-1,Math.min(1,reach/Math.max(.3,arm))));
  const k=1-Math.exp(-dt*14),q=a.pose;
  q.hip+=(hip-q.hip)*k;q.bend+=(bend-q.bend)*k;q.roll+=(roll-q.roll)*k;q.legs=q.legs.map((v,i)=>v+(legs[i]-v)*k) as typeof legs;
  a.pelvis.position.y=q.hip;a.torso.rotation.set(q.bend,0,q.roll);
  a.head.rotation.set(-q.bend+p.pitch*.5,0,-q.roll*.4);a.arms.rotation.x=p.pitch-q.bend;
  a.legs[0].hip.rotation.x=q.legs[0];a.legs[0].knee.rotation.x=q.legs[1];a.legs[1].hip.rotation.x=q.legs[2];a.legs[1].knee.rotation.x=q.legs[3];
  a.label.position.y=heightOf(crouch)+.4;
 }
 private gunFor(a:Avatar,w:WeaponId){
  if(a.gun.userData.w===w)return;a.gun.userData.w=w;for(const c of [...a.gun.children])if(c!==a.flash)a.gun.remove(c);
  const model=this.kit.model(w);a.gun.add(model);model.traverse(o=>{if(o instanceof T.Mesh)o.castShadow=true;});a.flash.position.copy(model.getObjectByName('muzzle')!.position);
 }
 resize(){
  const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;if(w===this.width&&h===this.height)return;
  this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.gunCamera.aspect=w/h;this.gunCamera.updateProjectionMatrix();
  if(this.composer){this.composer.setPixelRatio(this.renderer.getPixelRatio());this.composer.setSize(w,h);}
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
   const e=client.view,dead=!client.alive||client.fell,speed=Math.hypot(client.body.vel.x,client.body.vel.z),sliding=client.stance===2;
   if(client.body.onGround&&!sliding&&!dead)this.bob+=dt*speed*(client.body.crouch?1.1:1.4);
   const sink=dead?Math.min(1.2,(client.time-client.deathTime)*2):0,k=1-Math.exp(-dt*12);
   // Наклон кренит горизонт, подкат слегка расширяет обзор и наклоняет камеру.
   this.slideTilt+=((sliding?1:0)-this.slideTilt)*k;this.sprintT+=((client.body.sprint&&client.stance===0&&client.body.onGround&&!dead?1:0)-this.sprintT)*k;this.roll+=(-client.body.lean*.21+this.slideTilt*.05-this.roll)*k;
   // Прицеливание сужает обзор в client.zoom() раз (по тангенсу половины угла), подкат слегка расширяет.
   const fov=2*Math.atan(Math.tan((80+this.slideTilt*7+this.sprintT*5)*Math.PI/360)/client.zoom())*180/Math.PI;if(Math.abs(fov-this.fov)>.01){this.fov=fov;this.camera.fov=fov;this.camera.updateProjectionMatrix();}
   this.camera.position.set(e.x,e.y-sink+(sliding?0:Math.sin(this.bob*2)*.03*Math.min(1,speed/8)),e.z);
   this.camera.rotation.set(client.pitch+client.punch[0],client.yaw-client.punch[1],dead?Math.min(.5,sink*.4):this.roll,'YXZ');
   // Тряска от близкого взрыва: быстро затухающее дрожание положения и взгляда.
   if(client.shake>0){const s=client.shake*client.shake,n=(f:number)=>Math.sin(this.time*f)*Math.sin(this.time*f*1.7+1.3);
    this.camera.position.x+=n(53)*.1*s;this.camera.position.y+=n(61)*.08*s;this.camera.rotation.x+=n(47)*.025*s;this.camera.rotation.y+=n(43)*.025*s;}
  }
  // Игроки.
  const seen=new Set<string>();
  for(const p of client.views()){
   const a=this.avatar(p);seen.add(p.id);a.group.visible=p.alive&&!over||over;a.group.position.set(p.pos.x,p.pos.y,p.pos.z);a.group.rotation.y=p.yaw;
   const moved=Math.hypot(p.pos.x-a.last.x,p.pos.z-a.last.z),airborne=Math.abs(p.pos.y-a.last.y)>dt*4.5;a.walk+=moved*(p.stance===1?4.5:3.2);a.last={...p.pos};
   this.poseAvatar(a,p,dt,moved/(dt||1),airborne);this.gunFor(a,p.weapon);a.flash.visible=p.muzzle>0;
   this.glint(a,p);
  }
  for(const [id,a] of this.avatars)if(!seen.has(id)){this.scene.remove(a.group);if(a.glint)this.scene.remove(a.glint);this.avatars.delete(id);}
  this.drawEffects(client,dt);
  const gun=!over&&client.alive&&!client.fell;if(gun)this.drawGun(client,dt);
  if(this.quality==='high'&&this.composer){this.gunPass!.enabled=gun;this.composer.render(dt);}
  else{this.renderer.setRenderTarget(null);this.renderer.clear();this.renderer.render(this.scene,this.camera);if(gun){this.renderer.clearDepth();this.renderer.render(this.gunScene,this.gunCamera);}}
 }
 /** Блик оптики: соперник с винтовкой в прицеле сверкает линзой тем ярче, чем точнее смотрит на нас. */
 private glint(a:Avatar,p:PlayerView){
  const on=p.scoped&&p.weapon===RIFLE&&p.alive;
  if(!on){if(a.glint)a.glint.visible=false;return;}
  if(!a.glint){a.glint=new T.Sprite(this.track(new T.SpriteMaterial({map:this.glintTexture,blending:T.AdditiveBlending,depthWrite:false,transparent:true,sizeAttenuation:false,fog:false})));a.glint.renderOrder=5;this.scene.add(a.glint);}
  a.group.updateMatrixWorld(true);const lens=a.gun.localToWorld(new T.Vector3(0,.118,-.31));
  const look=forwardOf(p.yaw,p.pitch),to=this.camera.position.clone().sub(lens).normalize(),facing=Math.max(0,look.x*to.x+look.y*to.y+look.z*to.z)**8;
  a.glint.visible=facing>.02;a.glint.position.copy(lens);a.glint.scale.setScalar(.02+.1*facing*(.85+.15*Math.sin(this.time*9)));
  (a.glint.material as T.SpriteMaterial).opacity=Math.min(1,facing*1.4);
 }
 private pool(list:T.Mesh[],n:number,make:()=>T.Mesh){while(list.length<n){const m=make();this.scene.add(m);list.push(m);}list.forEach((m,i)=>m.visible=i<n);return list;}
 /** Пресет качества: «Высокое» — тени, bloom, лампы галереи и прожекторы со светом, угли над лавой, больше следов и частиц. */
 setQuality(q:Quality){
  this.quality=q;const high=q==='high';
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.5:1));
  this.renderer.shadowMap.enabled=high;this.moon.castShadow=high;
  this.hemi.intensity=high?1.45:2.1;this.moon.intensity=high?2:1.3;
  for(const l of this.lamps)l.visible=high;for(const s of this.searchlights)s.light.visible=high;
  this.decals.limit(high?240:70);
  if(high&&!this.composer){
   this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
   this.gunPass=new RenderPass(this.gunScene,this.gunCamera);this.gunPass.clear=false;this.gunPass.clearDepth=true;this.composer.addPass(this.gunPass);
   this.bloom=new UnrealBloomPass(new T.Vector2(256,256),.55,.4,.92);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
  }
  this.scene.traverse(o=>{if(o instanceof T.Mesh)for(const m of [o.material].flat())m.needsUpdate=true;});
  this.width=0;this.resize();
 }
 private buildLights(){
  // Лампы галереи светят по-настоящему только на высоком качестве; на низком остаются светящиеся плафоны.
  for(const [x,z] of [[-29,-13],[-29,13],[29,-13],[29,13],[-13,-29],[13,-29],[-13,29],[13,29]]){
   const l=new T.PointLight(0xffc890,10,12,2);l.position.set(x,4.1,z);this.scene.add(l);this.lamps.push(l);
  }
  // Прожекторы на углах стен: лучи видны всегда, свет от них — на высоком качестве.
  const housing=this.std(0x2a2d33,{metalness:.7,roughness:.4}),lens=this.glow(0xeaf2ff);
  // Луч гаснет от прожектора к концу: яркость зашита в цвета вершин (при сложении цвет работает как прозрачность).
  const beamGeo=this.track(new T.CylinderGeometry(.3,6.5,46,28,12,true));beamGeo.translate(0,-23,0);
  const pos=beamGeo.getAttribute('position'),colors:number[]=[];for(let i=0;i<pos.count;i++){const k=Math.pow(1+pos.getY(i)/46,1.6);colors.push(k,k,k);}
  beamGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));beamGeo.rotateX(-Math.PI/2);
  const beamMat=this.track(new T.MeshBasicMaterial({color:0x9fbfff,vertexColors:true,transparent:true,opacity:.09,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));
  for(const [x,z,phase] of [[-31,-31,0],[31,31,Math.PI]]){
   const group=new T.Group();group.position.set(x,17.6,z);this.scene.add(group);
   this.mesh(group,this.track(new T.CylinderGeometry(.45,.55,.7,16)),housing).rotation.x=Math.PI/2;this.mesh(group,this.track(new T.CircleGeometry(.42,16)),lens,0,0,.36);
   const beam=new T.Mesh(beamGeo,beamMat);beam.renderOrder=3;group.add(beam);
   const target=new T.Object3D();this.scene.add(target);
   const light=new T.SpotLight(0xdfe8ff,900,90,.2,.5,1.6);light.target=target;group.add(light);
   this.searchlights.push({group,beam,light,target,phase});
  }
  this.muzzleLight=new T.PointLight(0xffc070,0,10,2);this.scene.add(this.muzzleLight);
 }
 private buildFx(){
  const soft=this.track(fxTextures.soft()),plane=this.track(new T.PlaneGeometry(1,1));
  const additive=()=>this.track(new T.MeshBasicMaterial({map:soft,transparent:true,blending:T.AdditiveBlending,depthWrite:false}));
  const smoky=()=>this.track(new T.MeshBasicMaterial({map:soft,transparent:true,depthWrite:false}));
  const solid=(color:number,metal:number)=>this.track(new T.MeshStandardMaterial({color,metalness:metal,roughness:.5,transparent:true}));
  this.fx={
   sparks:new Particles(500,plane,additive(),true),smoke:new Particles(360,plane,smoky(),true),steam:new Particles(220,plane,smoky(),true),
   embers:new Particles(160,plane,additive(),true),blood:new Particles(220,plane,smoky(),true),
   debris:new Particles(220,this.track(new T.BoxGeometry(1,1,1)),solid(0xffffff,.1),false),
   casings:new Particles(140,this.track(new T.CylinderGeometry(.5,.5,2.4,8)),solid(0xd4a84a,1),false),
  };
  for(const p of Object.values(this.fx)){this.scene.add(p.mesh);this.disposables.push(p);}
  this.fx.debris.mesh.castShadow=true;
  this.decals=new Decals(this.scene,240);this.disposables.push(this.decals);
  this.decalMats={hole:this.track(decalMaterial(this.track(fxTextures.hole()))),scorch:this.track(decalMaterial(this.track(fxTextures.scorch()),.95)),blood:this.track(decalMaterial(this.track(fxTextures.blood()),.9))};
  this.glintTexture=this.track(fxTextures.glint());
  this.vents=this.arena.decor.filter(d=>d.kind==='vent').map(d=>new T.Vector3((d.box.min.x+d.box.max.x)/2,d.box.max.y,(d.box.min.z+d.box.max.z)/2));
 }
 /** Высота пола под точкой (для отскока гильз, обломков и капель). */
 private floorUnder(p:T.Vector3){return p.y-raycast(this.arena,vec(p.x,p.y,p.z),vec(0,-1,0),40).t;}
 /** Обработка событий клиента: вспышки, гильзы, следы, искры, обломки, взрывы. */
 private spawnFx(client:GameClient){
  const high=this.quality==='high',cam=this.camera,fwd=new T.Vector3(),right=new T.Vector3(),up=new T.Vector3(0,1,0);
  cam.getWorldDirection(fwd);right.crossVectors(fwd,up).normalize();
  const rand=(a:number)=>(Math.random()*2-1)*a;
  for(const e of client.fx){
   if(e.k==='shot'){
    const dir=new T.Vector3(e.dir.x,e.dir.y,e.dir.z),side=new T.Vector3().crossVectors(dir,up).normalize();
    const at=e.own?cam.position.clone().addScaledVector(fwd,1).addScaledVector(right,.25).addScaledVector(up,-.2):new T.Vector3(e.origin.x,e.origin.y,e.origin.z).addScaledVector(dir,.9);
    this.muzzleLight.position.copy(at);this.muzzleFlash=e.w===BLASTER?.6:1;this.muzzleLight.color.set(e.w===BLASTER?0x7fdcff:0xffc070);
    // Гильзы вылетают вправо-вверх; у дробовика и винтовки — после помпы и затвора.
    if(e.w===AUTO||e.w===SHOTGUN||e.w===RIFLE){
     const from=e.own?cam.position.clone().addScaledVector(fwd,.35).addScaledVector(right,.22).addScaledVector(up,-.14):new T.Vector3(e.origin.x,e.origin.y-.2,e.origin.z).addScaledVector(side,.15);
     const vel=(e.own?right:side).clone().multiplyScalar(2.2).addScaledVector(up,1.8).addScaledVector(e.own?fwd:dir,-.4);
     this.pendingCasings.push({at:this.time+(e.w===SHOTGUN?.45:e.w===RIFLE?.55:0),pos:from,vel,size:e.w===SHOTGUN?.011:e.w===RIFLE?.008:.0055,shell:e.w===SHOTGUN});
    }
    if(e.w===SHOTGUN||e.w===RIFLE||e.w===ROCKET)for(let i=0;i<(high?3:1);i++)this.fx.smoke.spawn({x:at.x,y:at.y,z:at.z,vx:dir.x*1.5+rand(.3),vy:.4+rand(.2),vz:dir.z*1.5+rand(.3),life:.9,size:.18,grow:.9,drag:2,r:.7,g:.7,b:.72,alpha:.35});
   }
   if(e.k==='impact'){
    const p=new T.Vector3(e.pos.x,e.pos.y,e.pos.z),n=new T.Vector3(e.normal.x,e.normal.y,e.normal.z);
    if(e.victim){
     if(this.blood){
      for(let i=0;i<(high?10:5);i++)this.fx.blood.spawn({x:p.x,y:p.y,z:p.z,vx:e.dir.x*2+rand(1.5),vy:rand(1.2)+.8,vz:e.dir.z*2+rand(1.5),life:.55+Math.random()*.3,size:.07+Math.random()*.06,gravity:11,r:.45,g:.02,b:.03,alpha:.95});
      const behind=raycast(this.arena,e.pos,e.dir,2.5);
      if(behind.t<2.5)this.decals.add(this.decalMats.blood,p.clone().addScaledVector(new T.Vector3(e.dir.x,e.dir.y,e.dir.z),behind.t),new T.Vector3(behind.normal.x,behind.normal.y,behind.normal.z),.6+Math.random()*.4);
     }else{
      // Без крови попадание — вспышка энергощита в цвет соперника.
      const c=new T.Color(e.color);
      for(let i=0;i<(high?12:6);i++)this.fx.sparks.spawn({x:p.x,y:p.y,z:p.z,vx:-e.dir.x*2+rand(3),vy:rand(3),vz:-e.dir.z*2+rand(3),life:.22+Math.random()*.15,size:.09,drag:4,r:c.r*1.5,g:c.g*1.5,b:c.b*1.5});
      this.fx.sparks.spawn({x:p.x,y:p.y,z:p.z,life:.12,size:.45,grow:2,r:c.r,g:c.g,b:c.b,alpha:.8});
     }
     continue;
    }
    this.decals.add(this.decalMats.hole,p,n,e.w===RIFLE?.26:e.w===SHOTGUN?.12:.18);
    const big=e.w===RIFLE?2:1;
    for(let i=0;i<(high?5:2)*big;i++)this.fx.sparks.spawn({x:p.x,y:p.y,z:p.z,vx:n.x*3+rand(3),vy:n.y*3+rand(3)+1,vz:n.z*3+rand(3),life:.2+Math.random()*.2,size:.05,gravity:9,drag:1,r:1.6,g:1.1,b:.5});
    if(e.w!==SHOTGUN||Math.random()<.3){
     const floor=this.floorUnder(p.clone().addScaledVector(n,.1));
     for(let i=0;i<(high?3:1)*big;i++)this.fx.debris.spawn({x:p.x+n.x*.05,y:p.y+n.y*.05,z:p.z+n.z*.05,vx:n.x*2.5+rand(1.5),vy:n.y*2.5+rand(1)+1.5,vz:n.z*2.5+rand(1.5),life:1.2,size:.025+Math.random()*.03,gravity:14,floor,bounce:.25,spin:rand(12),r:.45,g:.44,b:.42});
     this.fx.smoke.spawn({x:p.x+n.x*.1,y:p.y+n.y*.1,z:p.z+n.z*.1,vx:n.x*.6,vy:.3,vz:n.z*.6,life:.8,size:.15,grow:.7,drag:1.5,r:.6,g:.58,b:.55,alpha:.45});
    }
   }
   if(e.k==='boom'){
    const p=new T.Vector3(e.pos.x,e.pos.y,e.pos.z),floor=this.floorUnder(p.clone().add(new T.Vector3(0,.2,0)));
    for(let i=0;i<(high?28:12);i++){const v=new T.Vector3(rand(1),rand(1),rand(1)).normalize().multiplyScalar(6+Math.random()*9);
     this.fx.sparks.spawn({x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y+3,vz:v.z,life:.4+Math.random()*.5,size:.08,gravity:12,drag:1.2,r:1.8,g:1,b:.35});}
    for(let i=0;i<(high?16:7);i++)this.fx.smoke.spawn({x:p.x+rand(.8),y:p.y+rand(.5),z:p.z+rand(.8),vx:rand(1.5),vy:.8+Math.random()*1.4,vz:rand(1.5),life:2+Math.random()*1.2,size:.45,grow:1.1,drag:1.6,r:.2,g:.19,b:.18,alpha:.42});
    for(let i=0;i<(high?16:6);i++)this.fx.debris.spawn({x:p.x,y:p.y+.1,z:p.z,vx:rand(7),vy:3+Math.random()*6,vz:rand(7),life:2,size:.04+Math.random()*.08,gravity:16,floor,bounce:.3,spin:rand(15),r:.3,g:.28,b:.26});
    // Подпалина на ближайшей поверхности: ищем её лучами по шести осям.
    let best:{t:number;normal:Vec3}|null=null;
    for(const d of [vec(0,-1,0),vec(0,1,0),vec(1,0,0),vec(-1,0,0),vec(0,0,1),vec(0,0,-1)]){const hit=raycast(this.arena,e.pos,d,1.6);if(hit.t<1.6&&(!best||hit.t<best.t))best={t:hit.t,normal:hit.normal};}
    if(best)this.decals.add(this.decalMats.scorch,p.clone().addScaledVector(new T.Vector3(-best.normal.x,-best.normal.y,-best.normal.z),best.t),new T.Vector3(best.normal.x,best.normal.y,best.normal.z),2.6);
    const ring=this.shockwaves.find(r=>!r.visible)||(()=>{const m=new T.Mesh(this.track(new T.RingGeometry(.85,1,48)),this.track(new T.MeshBasicMaterial({color:0xffd9a0,transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide})));this.scene.add(m);this.shockwaves.push(m);return m;})();
    ring.visible=true;ring.position.copy(p);ring.userData.age=0;ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),best?new T.Vector3(best.normal.x,best.normal.y,best.normal.z):new T.Vector3(0,1,0));
   }
  }
  client.fx.length=0;
 }
 private drawEffects(client:GameClient,dt:number){
  const high=this.quality==='high';
  this.spawnFx(client);
  // Трассеры: тонкие вытянутые бруски от ствола до точки попадания.
  const tracers=this.pool(this.tracerMeshes,client.tracers.length,()=>new T.Mesh(this.boxGeo(.014,.014,1),this.track(new T.MeshBasicMaterial({color:0xffffff,transparent:true,blending:T.AdditiveBlending,depthWrite:false}))));
  client.tracers.forEach((t,i)=>{const m=tracers[i],dx=t.to.x-t.from.x,dy=t.to.y-t.from.y,dz=t.to.z-t.from.z,l=Math.hypot(dx,dy,dz)||.01;
   m.position.set(t.from.x+dx/2,t.from.y+dy/2,t.from.z+dz/2);m.scale.set(1,1,l);m.lookAt(t.to.x,t.to.y,t.to.z);const mat=m.material as T.MeshBasicMaterial;mat.color.set(TRACER_COLOR[t.w]||t.color);mat.opacity=.8*Math.max(0,1-t.age/t.life);m.scale.x=m.scale.y=TRACER_WIDTH[t.w];});
  // Ракеты: светящийся корпус, дымный след и искры из сопла.
  const rockets=client.rockets.filter(r=>!r.dead);
  const meshes=this.pool(this.rocketMeshes,rockets.length,()=>{const m=new T.Mesh(this.boxGeo(.14,.14,.5),this.glow(0xffcf7a));return m;});
  rockets.forEach((r,i)=>{const m=meshes[i];m.position.set(r.pos.x,r.pos.y,r.pos.z);m.lookAt(r.pos.x+r.dir.x,r.pos.y+r.dir.y,r.pos.z+r.dir.z);
   this.fx.smoke.spawn({x:r.pos.x-r.dir.x*.3,y:r.pos.y-r.dir.y*.3,z:r.pos.z-r.dir.z*.3,vy:.3,life:1.1,size:.22,grow:1.3,drag:1,r:.62,g:.62,b:.66,alpha:.45});
   this.fx.sparks.spawn({x:r.pos.x-r.dir.x*.35,y:r.pos.y-r.dir.y*.35,z:r.pos.z-r.dir.z*.35,life:.12,size:.35,grow:-1.5,r:1.6,g:.9,b:.3,alpha:.9});});
  // Взрывы: огненный шар, вспышка света и ударная волна.
  const blasts=this.pool(this.blastMeshes,client.blasts.length,()=>new T.Mesh(this.track(new T.IcosahedronGeometry(1,2)),this.track(new T.MeshBasicMaterial({color:0xffa040,transparent:true,blending:T.AdditiveBlending,depthWrite:false}))));
  let flash=0;
  client.blasts.forEach((b,i)=>{const m=blasts[i],k=b.age/.7;m.position.set(b.pos.x,b.pos.y,b.pos.z);m.scale.setScalar(.5+k*3.2);const mat=m.material as T.MeshBasicMaterial;mat.opacity=Math.max(0,.8-k*1.1);mat.color.setHSL(.08-k*.06,1,.5-k*.3);
   if(1-k>flash){flash=1-k;this.flashLight.position.set(b.pos.x,b.pos.y+.5,b.pos.z);}});
  this.flashLight.intensity=flash*70;
  for(const ring of this.shockwaves){if(!ring.visible)continue;const age=(ring.userData.age+=dt),k=age/.45;if(k>=1){ring.visible=false;continue;}
   ring.scale.setScalar(.5+k*7);(ring.material as T.MeshBasicMaterial).opacity=.85*(1-k);}
  this.muzzleFlash=Math.max(0,this.muzzleFlash-dt*14);this.muzzleLight.intensity=this.muzzleFlash*22;
  // Гильзы, которые ждут помпы или затвора.
  this.pendingCasings=this.pendingCasings.filter(c=>{if(c.at>this.time)return true;
   this.fx.casings.spawn({x:c.pos.x,y:c.pos.y,z:c.pos.z,vx:c.vel.x+(Math.random()-.5),vy:c.vel.y,vz:c.vel.z+(Math.random()-.5),life:2.5,size:c.size,gravity:14,floor:this.floorUnder(c.pos),bounce:.35,spin:18,
    r:c.shell?2.2:1,g:c.shell?.25:1,b:c.shell?.2:1});return false;});
  // Пар из решёток галереи и угли над лавой.
  this.steamTimer+=dt;const every=high?.12:.35;
  while(this.steamTimer>every){this.steamTimer-=every;
   for(const v of this.vents)this.fx.steam.spawn({x:v.x+(Math.random()-.5)*.8,y:v.y+.05,z:v.z+(Math.random()-.5)*.8,vx:(Math.random()-.5)*.3,vy:1+Math.random()*.6,vz:(Math.random()-.5)*.3,life:2.4,size:.35,grow:.9,drag:.4,r:.8,g:.82,b:.86,alpha:.22});}
  if(high){const lava=this.arena.lava;for(let i=0;i<dt*28;i++)this.fx.embers.spawn({x:lava.min.x+Math.random()*(lava.max.x-lava.min.x),y:lava.max.y,z:lava.min.z+Math.random()*(lava.max.z-lava.min.z),
   vx:(Math.random()-.5)*.6,vy:1.5+Math.random()*2,vz:(Math.random()-.5)*.6,life:1.5+Math.random(),size:.07,drag:.3,r:2,g:.7,b:.2});}
  for(const p of Object.values(this.fx))p.update(dt,this.camera);
  // Прожекторы медленно обшаривают арену.
  for(const s of this.searchlights){const t=this.time*.18+s.phase;s.target.position.set(Math.sin(t)*16,0,Math.cos(t*1.3)*16);s.beam.lookAt(s.target.position);}
 }
 /** Оружие от первого лица: модель из набора, перчатки и рукава, свой светящийся материал у бластера. */
 private buildViewGun(w:WeaponId){
  const g=this.kit.model(w);g.visible=false;
  g.traverse(o=>{if(o.name)o.userData.base=o.position.clone();});
  const heat=g.getObjectByName('heat');if(heat)heat.traverse(o=>{if(o instanceof T.Mesh)o.material=this.viewHeat;});
  const glove=this.std(0x24272d,{roughness:.9,metalness:.05}),sleeve=this.viewSleeve,cuff=this.viewCuff;
  const arm=(at:T.Vector3,dir:T.Vector3,hand:[number,number,number],handAt:T.Vector3)=>{
   const h=new T.Mesh(this.track(new RoundedBoxGeometry(...hand,2,.012)),glove);h.position.copy(handAt);g.add(h);
   const len=.55,a=new T.Mesh(this.track(new T.CylinderGeometry(.036,.042,len,14)),sleeve);
   a.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.clone().normalize());a.position.copy(at).addScaledVector(dir.clone().normalize(),len/2);g.add(a);
   const c=new T.Mesh(this.track(new T.CylinderGeometry(.039,.039,.035,14)),cuff);c.quaternion.copy(a.quaternion);c.position.copy(at).addScaledVector(dir.clone().normalize(),.03);g.add(c);
  };
  arm(new T.Vector3(.01,-.07,.035),new T.Vector3(.12,-.55,1),[.05,.085,.1],new T.Vector3(0,-.035,0));
  const fore=g.getObjectByName('fore')!.position;
  arm(new T.Vector3(fore.x-.02,fore.y-.04,fore.z+.04),new T.Vector3(-.5,-.55,1),[.06,.05,.1],new T.Vector3(fore.x,fore.y-.012,fore.z));
  this.gunScene.add(g);return g;
 }
 private drawGun(client:GameClient,dt:number){
  const w=client.weapon,g=this.viewGuns[w];
  if(this.shownWeapon!==w){this.shownWeapon=w;this.switchAnim=1;}
  this.switchAnim=Math.max(0,this.switchAnim-dt*5);this.kick=Math.max(0,this.kick-dt*7);if(client.muzzle>.06)this.kick=w===BLASTER||w===AUTO?.35:1;
  this.viewCuff.color.set(client.color||'#ff6b3d');
  const speed=Math.hypot(client.body.vel.x,client.body.vel.z),sway=client.body.onGround?Math.min(1,speed/8):.2,aim=client.aim*client.aim*(3-2*client.aim);
  this.viewGuns.forEach((x,i)=>x.visible=i===w);
  // Бедро → прицел: при прицеливании точка глаза модели совпадает с камерой.
  const [hx,hy,hz]=VIEW_HIP[w],sight=g.getObjectByName('sight')!.position;
  const reload=client.reloading?1-client.reloadLeft():0,r=Math.sin(reload*Math.PI);
  const bobX=Math.cos(this.bob)*.01*sway*(1-aim),bobY=Math.abs(Math.sin(this.bob))*.01*sway*(1-aim);
  g.position.set(hx+(-sight.x-hx)*aim+bobX-this.slideTilt*.04,hy+(-sight.y-hy)*aim+bobY-this.switchAnim*.25-this.slideTilt*.05-r*.05,hz+(-sight.z-hz)*aim+this.kick*VIEW_KICK[w][0]);
  g.rotation.set(this.kick*VIEW_KICK[w][1]+r*.12,-.05*(1-aim)+r*.18,this.slideTilt*.35-client.body.lean*.12*(1-aim)+r*.35);
  // На бегу оружие опущено и развёрнуто к себе.
  if(this.sprintT>.01){const t=this.sprintT;g.position.x+=.03*t;g.position.y-=.07*t;g.position.z+=.04*t;g.rotation.y+=.55*t;g.rotation.x-=.18*t;g.rotation.z+=.22*t;}
  g.visible=!(w===RIFLE&&client.aim>.85);
  // Подвижные части: магазин при перезарядке, затвор винтовки и цевьё дробовика после выстрела.
  const part=(name:string)=>{const o=g.getObjectByName(name);if(o)o.position.copy(o.userData.base);return o;};
  const mag=part('mag');
  if(mag){const out=reload<.15?0:reload<.45?(reload-.15)/.3:reload<.6?1:reload<.85?1-(reload-.6)/.25:0;mag.position.y-=out*.25;mag.visible=out<.97;}
  const age=client.shotAge(),bolt=part('bolt');
  if(bolt){const t=age/(WEAPONS[RIFLE].interval*.85),lift=t<.1||t>1?0:t<.25?(t-.1)/.15:t<.8?1:(1-t)/.2,back=t<.25||t>.8?0:t<.5?(t-.25)/.25:1-(t-.5)/.3;
   bolt.rotation.z=lift*1.1;bolt.position.z+=back*.075;}
  const pump=part('pump');
  if(pump){const t=age/WEAPONS[SHOTGUN].interval,back=t<.25||t>.65?0:t<.45?(t-.25)/.2:1-(t-.45)/.2;pump.position.z+=back*.09;}
  // Катушки бластера разогреваются из голубого в оранжевый и красный, при перегреве — мигают.
  const heat=Math.min(1,client.heat),pulse=client.overheated?.6+.4*Math.sin(this.time*25):1;
  this.viewHeat.emissive.setRGB(.25+heat*.75,.82-heat*.6,1-heat*.95);this.viewHeat.emissiveIntensity=(1.4+heat*2.2)*pulse;
  // Вспышка у среза ствола.
  g.updateMatrixWorld(true);const muzzle=g.getObjectByName('muzzle')!.getWorldPosition(new T.Vector3());
  this.viewFlash.visible=client.muzzle>0&&g.visible;this.viewFlash.position.copy(muzzle);this.viewFlash.rotation.z=this.time*40;
  const f=VIEW_FLASH[w];this.viewFlash.scale.set(f,f,f*1.8);
  const fov=60-aim*(w===AUTO?10:0);if(Math.abs(this.gunCamera.fov-fov)>.01){this.gunCamera.fov=fov;this.gunCamera.updateProjectionMatrix();}

 }
 /** Проекция точки мира на экран (для индикатора урона и подписей). */
 project(p:Vec3){const v=new T.Vector3(p.x,p.y,p.z).project(this.camera);return {x:(v.x+1)/2*this.width,y:(1-v.y)/2*this.height,behind:v.z>1};}
 dispose(){for(const a of this.avatars.values())this.scene.remove(a.group);for(const d of this.disposables)d.dispose();this.composer?.dispose();this.renderer.dispose();}
}
export const PLAYER_HEIGHT=HEIGHT;
