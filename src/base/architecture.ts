import type {Vec,Door} from './types.ts';

/** Shallow oblique cutaway: every depth edge shares this projection. World physics
 * stays on the front walking plane. Front-facing sprites are never skewed. */
export const ROOM_DEPTH={x:22,y:-26} as const;
export const backPoint=(x:number,y:number):Vec=>({x:x+ROOM_DEPTH.x,y:y+ROOM_DEPTH.y});
export const floorFace=(left:number,right:number,y:number):Vec[]=>[
 {x:left,y:y+3},{x:right,y:y+3},backPoint(right,y),backPoint(left,y),
];
export function doorLeaf(door:Pick<Door,'openness'|'open'>){
 const amount=door.openness??Number(door.open),angle=amount*1.38;
 return {x:ROOM_DEPTH.x*Math.cos(angle)+62*Math.sin(angle),y:ROOM_DEPTH.y*Math.cos(angle)};
}
/** World-anchored variation: no random numbers per frame or at adjoining modules. */
export const grain=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export function raggedEdge(a:Vec,b:Vec,amplitude=3,spacing=13):Vec[]{
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),count=Math.max(1,Math.ceil(length/spacing));
 return Array.from({length:count+1},(_,i)=>{const t=i/count,x=a.x+dx*t,y=a.y+dy*t,j=i===0||i===count?0:grain(x*.73+y*.91)*amplitude;
  return {x:x-dy/Math.max(1,length)*j,y:y+dx/Math.max(1,length)*j};});
}
