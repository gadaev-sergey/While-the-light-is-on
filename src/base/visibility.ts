import {LOCATION} from './config.ts';
import {floorSpans,levelFloorY,type CompiledLevel,type Opening} from './level.ts';
import type {Vec,Segment,Door,Floor} from './types.ts';
const cross=(a:Vec,b:Vec)=>a.x*b.y-a.y*b.x;
export function rayDistance(origin:Vec,angle:number,segments:Segment[],range:number){
 const dir={x:Math.cos(angle),y:Math.sin(angle)};let nearest=range;
 for(const s of segments){const edge={x:s.b.x-s.a.x,y:s.b.y-s.a.y},delta={x:s.a.x-origin.x,y:s.a.y-origin.y},den=cross(dir,edge);if(Math.abs(den)<1e-8)continue;
  const t=cross(delta,edge)/den,u=cross(delta,dir)/den;if(t>=0&&u>=0&&u<=1&&t<nearest)nearest=t;
 }return nearest;
}
export function lineOfSight(origin:Vec,target:Vec,segments:Segment[]){const d=Math.hypot(target.x-origin.x,target.y-origin.y);return rayDistance(origin,Math.atan2(target.y-origin.y,target.x-origin.x),segments,d)>=d-2;}
export const angularDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export interface Sight {origin:Vec;angle:number;flashlight:boolean;powered:boolean;segments:Segment[]}
export const NEAR_SIGHT=110,BEAM_RANGE=455,BEAM_HALF=.43;
export function canSee(sight:Sight,target:Vec){
 const dx=target.x-sight.origin.x,dy=target.y-sight.origin.y,d=Math.hypot(dx,dy),delta=Math.abs(angularDifference(Math.atan2(dy,dx),sight.angle));
 const near=d<=NEAR_SIGHT,forward=delta<1.02&&d<185,beam=sight.flashlight&&delta<=BEAM_HALF&&d<=BEAM_RANGE;
 const ambient=sight.powered&&d<245;
 return (near||forward||beam||ambient)&&lineOfSight(sight.origin,target,sight.segments);
}
export function visibilityPolygon(origin:Vec,angle:number,spread:number,range:number,segments:Segment[],steps=90){
 const result:Vec[]=[origin];for(let i=0;i<=steps;i++){const a=angle-spread+i/steps*spread*2,d=rayDistance(origin,a,segments,range);result.push({x:origin.x+Math.cos(a)*d,y:origin.y+Math.sin(a)*d});}return result;
}
/** Back-wall openings are in depth. Dividers are on the movement plane and block both actors and rays. */
export function occluders(doors:Door[],level:CompiledLevel=LOCATION,openings:Opening[]=level.openings):Segment[]{
 const result:Segment[]=[];const add=(x:number,y:number,x2:number,y2:number)=>result.push({a:{x,y},b:{x:x2,y:y2}});
 for(const b of level.buildings){
  for(const f of b.floors){const y=levelFloorY(level,f);
   for(const [left,right] of floorSpans(level,b,f))add(left,y,right,y);
   const walls=new Set(level.rooms.filter(r=>r.buildingId===b.id&&r.floor===f).flatMap(r=>[r.x,r.end]));
   for(const x of walls){const door=doors.find(d=>d.floor===f&&d.x===x),hole=openings.find(o=>o.floor===f&&o.plane==='divider'&&o.x===x);
    const bottom=door?.open?y-148:hole?.state==='open'?y-hole.height:y;add(x,y-level.floorHeight,x,bottom);
   }
  }
  const roof=levelFloorY(level,Math.max(...b.floors))-level.floorHeight;add(b.x,roof,b.end,roof);
 }return result;
}
export function visibleRoomSamples(sight:Sight,level:CompiledLevel=LOCATION){return level.rooms.filter(r=>[.15,.5,.85].some(t=>canSee(sight,{x:r.x+(r.end-r.x)*t,y:levelFloorY(level,r.floor)-75}))).map(r=>r.id);}
