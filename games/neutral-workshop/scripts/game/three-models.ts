import * as T from 'three';
import type {BaseAssets} from './assets.ts';
import type {BaseObject} from './types.ts';
import {DIMENSIONS,furnitureSize} from './dimensions.ts';
export {wx} from './dimensions.ts';

export const BACK=DIMENSIONS.house.back,FRONT=DIMENSIONS.house.front,ACTOR_Z=DIMENSIONS.house.actorZ;

/** Textures retain the existing artwork. Geometry supplies the missing depth. */
export class ShelterModels {
 materials:T.MeshStandardMaterial[]=[];
 wood:T.MeshStandardMaterial;metal:T.MeshStandardMaterial;dark:T.MeshStandardMaterial;
 cream:T.MeshStandardMaterial;fabric:T.MeshStandardMaterial;brick:T.MeshStandardMaterial;
 prefabs:BaseAssets['models'];
 constructor(assets:BaseAssets){
  this.prefabs=assets.models;
  this.materials=assets.tiles.map((tile,i)=>{
   const map=new T.CanvasTexture(tile);map.colorSpace=T.SRGBColorSpace;
   map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
   return new T.MeshStandardMaterial({map,color:i===1?0xc2c1a6:0xd3d2c8,roughness:.98});
  });
  this.wood=this.materials[3];this.brick=this.materials[2];
  this.metal=new T.MeshStandardMaterial({color:0x52615c,roughness:.9,metalness:.12});
  this.dark=new T.MeshStandardMaterial({color:0x172127,roughness:.94,metalness:.08});
  this.cream=new T.MeshStandardMaterial({color:0xc2beac,roughness:.82});
  this.fabric=new T.MeshStandardMaterial({color:0x78807b,roughness:1});
 }
 box(parent:T.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,material:T.Material=this.wood){
  const geometry=new T.BoxGeometry(w,h,d),uv=geometry.getAttribute('uv');
  // Texture density stays consistent across long walls, narrow beams and furniture.
  const dims=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let face=0;face<6;face++)for(let v=0;v<4;v++){const i=face*4+v;uv.setXY(i,uv.getX(i)*dims[face][0]/1.7,uv.getY(i)*dims[face][1]/1.7);}
  const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 cylinder(parent:T.Object3D,x:number,y:number,z:number,r:number,h:number,material:T.Material=this.metal,r2=r){
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r2,h,12),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
 }
 bar(parent:T.Object3D,a:T.Vector3,b:T.Vector3,r=.018,material:T.Material=this.metal){
  const m=this.cylinder(parent,0,0,0,r,a.distanceTo(b),material);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());return m;
 }
 crate(parent:T.Object3D,x:number,y:number,z:number,w=.7,h=.5,d=.5){
  this.box(parent,x,y+h/2,z,w,h,d);
  for(const face of [-1,1]){
   for(const side of [-1,1])this.box(parent,x+side*w*.38,y+h/2,z+face*(d/2+.014),.065,h+.035,.035);
   for(const yy of [.07,h-.07])this.box(parent,x,y+yy,z+face*(d/2+.025),w,.055,.025);
   for(const side of [-1,1])for(const yy of [.08,h-.08])this.cylinderNail(parent,x+side*w*.38,y+yy,z+face*(d/2+.045));
  }
 }
 cylinderNail(parent:T.Object3D,x:number,y:number,z:number){const nail=this.cylinder(parent,x,y,z,.009,.01,this.dark);nail.rotation.x=Math.PI/2;}
 furniture(o:BaseObject){
  const g=new T.Group();g.name=o.id;const size=furnitureSize(o),w=size.width,h=size.height,depth=size.depth;
  g.userData.dimensions={...size};
  const prefab=this.prefabs[o.kind];
  // Baked GLB furniture keeps its own geometry and materials; DIMENSIONS holds its measured bounds.
  if(prefab){const model=prefab.clone(true);model.traverse(m=>{if((m as T.Mesh).isMesh){m.castShadow=true;m.receiveShadow=true;}});g.add(model);}
  else switch(o.kind){
   case 'workbench':{
    for(const x of [-w*.43,w*.43])for(const z of [-.23,.23])this.box(g,x,h*.41,z,.07, .90,.07);
    this.box(g,0,.90-.0425,0,w,.085,depth);this.box(g,0,.15,0,w*.92,.045,.51);
    for(const x of [-w*.25,w*.25]){this.box(g,x,h*.67,.14,w*.47,.19,.30);this.bar(g,new T.Vector3(x-.08,h*.67,.31),new T.Vector3(x+.08,h*.67,.31),.012);}
    this.crate(g,-w*.25,.18,0,.34,.24,.31);
    this.box(g,-w*.32,h-.11,.03,.23,.17,.16,this.metal);this.box(g,-w*.32,h-.0175,.03,.29,.035,.18,this.dark);
    for(let i=0;i<3;i++)this.cylinder(g,w*.23+i*.09,h*.85+.07,-.14,.035,.14,this.metal);
    this.bar(g,new T.Vector3(w*.38,h*.85,.1),new T.Vector3(w*.38-.18,h*.85,.1),.025,this.wood);break;
   }
   case 'generator':{
    for(const z of [-.27,.27])for(const x of [-w*.44,w*.44]){this.bar(g,new T.Vector3(x,.07,z),new T.Vector3(x,h*.93,z),.028,this.dark);}
    for(const z of [-.27,.27])for(const y of [.07,h*.93])this.bar(g,new T.Vector3(-w*.44,y,z),new T.Vector3(w*.44,y,z),.028,this.dark);
    for(const x of [-w*.44,w*.44])this.bar(g,new T.Vector3(x,h*.93,-.27),new T.Vector3(x,h*.93,.27),.028,this.dark);
    const engine=this.cylinder(g,0,h*.40,.02,h*.27,w*.55,this.metal);engine.rotation.z=Math.PI/2;
    this.box(g,0,h*.77,0,w*.78,h*.23,.40,new T.MeshStandardMaterial({color:0xa78739,roughness:.92,metalness:.12}));
    this.box(g,w*.29,h*.40,.24,w*.25,h*.39,.10,this.dark);
    for(let i=0;i<5;i++)this.box(g,-w*.1,h*.25+i*.05,.27,w*.34,.018,.015,this.dark);
    this.cylinder(g,0,h*.905,0,.045,.025,this.dark);break;
   }
   case 'barrel':{
    this.cylinder(g,0,h/2,0,w*.46,h,this.metal,w*.49);
    for(const y of [.06,h*.28,h*.73,h-.04])this.cylinder(g,0,y,0,w*.485,.035,this.dark);
    this.cylinder(g,0,h+.006,0,w*.4,.012,new T.MeshStandardMaterial({color:0x314747,roughness:.65,metalness:.2}));break;
   }
   default:this.crate(g,0,0,0,w,h,depth);
  }
  // Register the outer envelope as well as the nominal dimensions. Every variant
  // rests on y=0 and occupies the same measured bounds as its dimension entry.
  g.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(g),extent=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const contents=new T.Group();contents.add(...[...g.children]);contents.position.set(-center.x,-bounds.min.y,-center.z);g.add(contents);
  g.scale.set(w/extent.x,h/extent.y,depth/extent.z);
  return g;
 }
 radiator(parent:T.Object3D,x:number,y:number,z:number){
  for(let i=0;i<9;i++)this.box(parent,x+i*.055,y+.19,z,.035,.36,.10,this.cream);
  for(const yy of [.04,.33])this.bar(parent,new T.Vector3(x-.04,y+yy,z),new T.Vector3(x+.52,y+yy,z),.016);
 }
}
