import {BASE,ROOMS,STAIRS,floorY} from './config.ts';
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
/** Every floor slab and closed door blocks light. Stair apertures are real gaps. */
export function occluders(doors:Door[]):Segment[]{
 const result:Segment[]=[];const add=(x:number,y:number,x2:number,y2:number)=>result.push({a:{x,y},b:{x:x2,y:y2}});
 for(const f of [-1,0,1] as Floor[]){
  const y=floorY(f),stair=STAIRS.find(s=>s.to===f);
  if(stair){add(BASE.houseLeft,y,Math.min(stair.a,stair.b)-15,y);add(Math.max(stair.a,stair.b)+15,y,BASE.houseRight,y);}else add(BASE.houseLeft,y,BASE.houseRight,y);
  for(const x of [BASE.houseLeft,BASE.houseRight])if(f!==0)add(x,y-215,x,y);
 }
 add(BASE.houseLeft,floorY(1)-215,BASE.houseRight,floorY(1)-215);
 for(const d of doors){const y=floorY(d.floor);add(d.x,y-215,d.x,d.open?y-148:y);}
 return result;
}
export function visibleRoomSamples(sight:Sight){return ROOMS.filter(r=>[.15,.5,.85].some(t=>canSee(sight,{x:r.x+(r.end-r.x)*t,y:floorY(r.floor)-75}))).map(r=>r.id);}
