import type {SceneDocument} from '@shelter/scene.ts';

export type Vec3={x:number;y:number;z:number};
/** Осевой прямоугольный блок: минимальные и максимальные координаты. */
export type Box={min:Vec3;max:Vec3};
export type SolidStyle='floor'|'wall'|'metal'|'stair'|'rail'|'crate'|'pillar';
export type Solid=Box&{style:SolidStyle};
export type ItemKind='mega'|'rocket'|'shotgun'|'armor'|'health'|'shells'|'rockets';
export type JumpPad={box:Box;center:Vec3;target:Vec3;launch:Vec3};
export type Spawn={pos:Vec3;yaw:number};
export type ItemSpot={kind:ItemKind;pos:Vec3};
export type Arena={size:number;lavaY:number;killY:number;solids:Solid[];lava:Box;pads:JumpPad[];spawns:Spawn[];items:ItemSpot[]};

export const GRAVITY=20;
export const ITEM_KINDS:ItemKind[]=['mega','rocket','shotgun','armor','health','shells','rockets'];
export const SOLID_STYLES:SolidStyle[]=['floor','wall','metal','stair','rail','crate','pillar'];
export const vec=(x=0,y=0,z=0):Vec3=>({x,y,z});

function boxOf(node:SceneDocument['nodes'][number]):Box{
 const [x,y,z]=node.transform.position,[w,h,d]=node.transform.scale;
 return {min:vec(x-w/2,y-h/2,z-d/2),max:vec(x+w/2,y+h/2,z+d/2)};
}
const componentOf=(node:SceneDocument['nodes'][number],type:string)=>node.components?.find(c=>c.type===type);

/** Скорость запуска, при которой баллистическая дуга с запасом высоты приходит в цель. */
export function launchVelocity(from:Vec3,to:Vec3,extra=2.5):Vec3{
 const dy=to.y-from.y,peak=Math.max(dy,0)+extra,vy=Math.sqrt(2*GRAVITY*peak);
 const time=vy/GRAVITY+Math.sqrt(2*(peak-dy)/GRAVITY),dx=to.x-from.x,dz=to.z-from.z;
 return vec(dx/time,vy,dz/time);
}

export function readArena(scene:SceneDocument):Arena{
 const data=scene.moduleData?.spire as {size?:number;lavaY?:number;killY?:number}|undefined;
 if(!data||!Number.isFinite(data.size)||!Number.isFinite(data.lavaY)||!Number.isFinite(data.killY))throw new Error('Шпиль: в сцене нет параметров арены.');
 const solids:Solid[]=[],pads:JumpPad[]=[],spawns:Spawn[]=[],items:ItemSpot[]=[];let lava:Box|undefined;
 for(const node of scene.nodes){
  const solid=componentOf(node,'spire.solid'),pad=componentOf(node,'spire.jumppad'),spawn=componentOf(node,'spire.spawn'),item=componentOf(node,'spire.pickup');
  const box=boxOf(node),bottom=vec((box.min.x+box.max.x)/2,box.min.y,(box.min.z+box.max.z)/2);
  if(solid)solids.push({...box,style:String(solid.values.style) as SolidStyle});
  if(componentOf(node,'spire.lava'))lava=box;
  if(pad){const target=vec(Number(pad.values.tx),Number(pad.values.ty),Number(pad.values.tz));pads.push({box:{min:vec(box.min.x,box.min.y,box.min.z),max:vec(box.max.x,box.max.y+.4,box.max.z)},center:bottom,target,launch:launchVelocity(bottom,target)});}
  if(spawn)spawns.push({pos:bottom,yaw:Number(spawn.values.yaw)*Math.PI/180});
  if(item)items.push({kind:String(item.values.item) as ItemKind,pos:bottom});
 }
 if(!lava)throw new Error('Шпиль: на арене нет лавы.');
 if(spawns.length<8)throw new Error('Шпиль: нужно не меньше 8 точек появления.');
 if(!solids.length)throw new Error('Шпиль: на арене нет блоков.');
 return {size:data.size!,lavaY:data.lavaY!,killY:data.killY!,solids,lava,pads,spawns,items};
}

export const overlaps=(a:Box,b:Box)=>a.min.x<b.max.x&&a.max.x>b.min.x&&a.min.y<b.max.y&&a.max.y>b.min.y&&a.min.z<b.max.z&&a.max.z>b.min.z;

/** Пересечение луча с блоком: расстояние до входа или Infinity. */
export function rayBox(o:Vec3,d:Vec3,b:Box,maxT=Infinity):number{
 let lo=0,hi=maxT;
 for(const axis of ['x','y','z'] as const){
  const p=o[axis],dir=d[axis],min=b.min[axis],max=b.max[axis];
  if(Math.abs(dir)<1e-9){if(p<min||p>max)return Infinity;continue;}
  let a=(min-p)/dir,c=(max-p)/dir;if(a>c)[a,c]=[c,a];
  lo=Math.max(lo,a);hi=Math.min(hi,c);if(lo>hi)return Infinity;
 }
 return lo;
}

/** Ближайшее попадание луча в геометрию арены (d — единичный вектор). */
export function raycast(arena:Arena,o:Vec3,d:Vec3,maxT=200):{t:number;normal:Vec3}{
 let best=maxT,normal=vec();
 for(const s of arena.solids){const t=rayBox(o,d,s,best);if(t<best){best=t;normal=faceNormal(s,o.x+d.x*t,o.y+d.y*t,o.z+d.z*t);}}
 return {t:best,normal};
}
function faceNormal(b:Box,x:number,y:number,z:number):Vec3{
 const c=[[Math.abs(x-b.min.x),vec(-1,0,0)],[Math.abs(x-b.max.x),vec(1,0,0)],[Math.abs(y-b.min.y),vec(0,-1,0)],[Math.abs(y-b.max.y),vec(0,1,0)],[Math.abs(z-b.min.z),vec(0,0,-1)],[Math.abs(z-b.max.z),vec(0,0,1)]] as const;
 return c.reduce((a,b)=>b[0]<a[0]?b:a)[1];
}

/** Ближайшая точка блока к точке p — для урона по площади. */
export function closestOnBox(b:Box,p:Vec3):Vec3{
 return vec(Math.max(b.min.x,Math.min(b.max.x,p.x)),Math.max(b.min.y,Math.min(b.max.y,p.y)),Math.max(b.min.z,Math.min(b.max.z,p.z)));
}
