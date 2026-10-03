import * as T from 'three';

/** Канва → текстура в sRGB. */
function canvasTexture(size:number,draw:(g:CanvasRenderingContext2D,s:number)=>void){
 const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d')!,size);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
function rng(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

/** Процедурные текстуры эффектов: мягкое пятно, след пули, подпалина, брызги, блик оптики. */
export const fxTextures={
 soft:()=>canvasTexture(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.45,'rgba(255,255,255,.45)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s);}),
 hole:()=>canvasTexture(64,(g,s)=>{const r=rng(5);g.strokeStyle='rgba(20,18,16,.55)';g.lineWidth=1.5;
  for(let i=0;i<7;i++){const a=r()*Math.PI*2,l=s*(.25+r()*.2);g.beginPath();g.moveTo(s/2,s/2);g.lineTo(s/2+Math.cos(a)*l,s/2+Math.sin(a)*l);g.stroke();}
  // Светлый ободок сколотого материала, тёмная воронка и чёрное отверстие — читается на любой стене.
  const chip=g.createRadialGradient(s/2,s/2,s*.12,s/2,s/2,s*.46);chip.addColorStop(0,'rgba(215,208,196,.85)');chip.addColorStop(.55,'rgba(170,164,154,.45)');chip.addColorStop(1,'rgba(170,164,154,0)');
  g.fillStyle=chip;g.fillRect(0,0,s,s);
  const ring=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s*.2);ring.addColorStop(0,'rgba(0,0,0,1)');ring.addColorStop(.55,'rgba(12,10,8,.95)');ring.addColorStop(1,'rgba(40,36,32,0)');
  g.fillStyle=ring;g.fillRect(0,0,s,s);}),
 scorch:()=>canvasTexture(128,(g,s)=>{const r=rng(9);
  for(let i=0;i<26;i++){const a=r()*Math.PI*2,d=r()*s*.28,x=s/2+Math.cos(a)*d,y=s/2+Math.sin(a)*d,rad=s*(.08+r()*.18);
   const k=g.createRadialGradient(x,y,0,x,y,rad);k.addColorStop(0,'rgba(8,6,4,.55)');k.addColorStop(1,'rgba(8,6,4,0)');g.fillStyle=k;g.fillRect(0,0,s,s);}}),
 blood:()=>canvasTexture(128,(g,s)=>{const r=rng(13);
  for(let i=0;i<18;i++){const a=r()*Math.PI*2,d=r()*s*.32,x=s/2+Math.cos(a)*d,y=s/2+Math.sin(a)*d;g.fillStyle=`rgba(${90+r()*40},4,6,${.7+r()*.3})`;g.beginPath();g.arc(x,y,s*(.02+r()*.07),0,Math.PI*2);g.fill();}}),
 glint:()=>canvasTexture(128,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.12,'rgba(255,250,220,.9)');r.addColorStop(.4,'rgba(255,230,160,.18)');r.addColorStop(1,'rgba(255,230,160,0)');
  g.fillStyle=r;g.fillRect(0,0,s,s);g.fillStyle='rgba(255,255,255,.9)';g.fillRect(0,s/2-1.5,s,3);g.fillRect(s/2-1.5,0,3,s);}),
};

/** Частица: положение, скорость, время жизни, размер (растёт на grow в секунду), сила тяжести, сопротивление и пол для отскока. */
export type Particle={x:number;y:number;z:number;vx:number;vy:number;vz:number;age:number;life:number;size:number;grow:number;gravity:number;drag:number;
 r:number;g:number;b:number;alpha:number;floor:number;bounce:number;spin:number;rot:number};
export type ParticleInit=Partial<Particle>&{x:number;y:number;z:number;life:number;size:number};

/**
 * Система частиц на одном InstancedMesh. billboard — плоские спрайты, всегда повёрнутые к камере (дым, искры, пар);
 * иначе — объёмные кусочки (гильзы, обломки), которые кувыркаются. Прозрачность у каждой частицы своя.
 */
export class Particles{
 readonly mesh:T.InstancedMesh;private list:Particle[]=[];private alpha:T.InstancedBufferAttribute;private dummy=new T.Object3D();private fade:boolean;
 constructor(private max:number,geometry:T.BufferGeometry,material:T.Material,private billboard:boolean,fade=true){
  this.fade=fade;
  const geo=geometry.clone();this.alpha=new T.InstancedBufferAttribute(new Float32Array(max).fill(1),1);this.alpha.setUsage(T.DynamicDrawUsage);geo.setAttribute('instanceAlpha',this.alpha);
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float instanceAlpha;\nvarying float vInstanceAlpha;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvInstanceAlpha=instanceAlpha;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vInstanceAlpha;')
    .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vInstanceAlpha;');
  };
  this.mesh=new T.InstancedMesh(geo,material,max);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;
  this.mesh.setColorAt(0,new T.Color(1,1,1));
 }
 get count(){return this.list.length;}
 spawn(p:ParticleInit){
  if(this.list.length>=this.max)this.list.shift();
  this.list.push({vx:0,vy:0,vz:0,age:0,grow:0,gravity:0,drag:0,r:1,g:1,b:1,alpha:1,floor:-Infinity,bounce:.3,spin:0,rot:Math.random()*6.28,...p});
 }
 clear(){this.list=[];this.mesh.count=0;}
 update(dt:number,camera:T.Camera){
  const color=new T.Color();let n=0;
  this.list=this.list.filter(p=>(p.age+=dt)<p.life);
  for(const p of this.list){
   p.vy-=p.gravity*dt;const drag=Math.exp(-p.drag*dt);p.vx*=drag;p.vy*=drag;p.vz*=drag;
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rot+=p.spin*dt;
   if(p.y<p.floor){p.y=p.floor;p.vy=Math.abs(p.vy)>.6?-p.vy*p.bounce:0;p.vx*=.55;p.vz*=.55;p.spin*=.5;}
   const k=p.age/p.life,size=Math.max(0,p.size+p.grow*p.age);
   this.dummy.position.set(p.x,p.y,p.z);
   if(this.billboard){this.dummy.quaternion.copy(camera.quaternion);this.dummy.rotateZ(p.rot);}else this.dummy.rotation.set(p.rot,p.rot*.7,p.rot*1.3);
   this.dummy.scale.setScalar(size);this.dummy.updateMatrix();this.mesh.setMatrixAt(n,this.dummy.matrix);
   // Плоские частицы у самой камеры гаснут, иначе дым взрыва в упор закрывает весь экран.
   const near=this.billboard?Math.min(1,Math.max(0,(camera.position.distanceTo(this.dummy.position)-.3)/(size*2+.01))):1;
   this.mesh.setColorAt(n,color.setRGB(p.r,p.g,p.b));this.alpha.setX(n,(this.fade?p.alpha*(1-k)*(k<.08?k/.08:1):p.alpha)*near);n++;
  }
  this.mesh.count=n;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;this.alpha.needsUpdate=true;
 }
 dispose(){this.mesh.geometry.dispose();}
}

/** Следы на поверхностях (пули, подпалины, брызги): плоскость вдоль нормали, старые заменяются новыми. */
export class Decals{
 private meshes:T.Mesh[]=[];private next=0;private geo=new T.PlaneGeometry(1,1);
 constructor(private scene:T.Scene,public max:number){}
 add(material:T.Material,pos:T.Vector3,normal:T.Vector3,size:number){
  if(this.max<=0)return;
  let m=this.meshes[this.next];
  if(!m){m=new T.Mesh(this.geo,material);m.renderOrder=1;m.receiveShadow=true;this.scene.add(m);this.meshes[this.next]=m;}
  m.material=material;m.visible=true;m.position.copy(pos).addScaledVector(normal,.012);
  m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);m.rotateZ(Math.random()*Math.PI*2);m.scale.set(size,size,1);
  this.next=(this.next+1)%this.max;
 }
 /** Уменьшить предел (низкое качество): лишние следы убираются. */
 limit(max:number){this.max=max;for(let i=max;i<this.meshes.length;i++)this.scene.remove(this.meshes[i]);this.meshes.length=Math.min(this.meshes.length,max);this.next=0;}
 dispose(){for(const m of this.meshes)this.scene.remove(m);this.geo.dispose();}
}
/** Материал следа: не пишет глубину и сдвинут к камере, чтобы не мерцать на стене. */
export const decalMaterial=(map:T.Texture,opacity=1)=>new T.MeshStandardMaterial({map,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.9,metalness:0});
