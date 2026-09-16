import type {Vec,Door,Room} from './types.ts';
import type {CompiledLevel,Opening} from './level.ts';

/** Each module has its own vanishing point, centred horizontally at standing eye
 * height. The front plane is shared with physics; depth contracts towards that point. */
export const ROOM_DEPTH={contraction:.18,eyeHeight:142} as const;
export type RoomSpan=Pick<Room,'x'|'end'>;
export const backPoint=(room:RoomSpan,x:number,y:number,floorY:number,depth=1):Vec=>({
 x:x+((room.x+room.end)/2-x)*ROOM_DEPTH.contraction*depth,
 y:y+(floorY-ROOM_DEPTH.eyeHeight-y)*ROOM_DEPTH.contraction*depth,
});
export const floorFace=(room:RoomSpan,left:number,right:number,y:number):Vec[]=>[
 {x:left,y:y+3},{x:right,y:y+3},backPoint(room,right,y+3,y),backPoint(room,left,y+3,y),
];
export function openingPlacement(level:CompiledLevel,o:Opening){
 const floorY=level.groundY-o.floor*level.floorHeight,room=level.rooms.find(r=>r.id===o.roomId)!,p=backPoint(room,o.x,floorY-o.bottom,floorY),scale=1-ROOM_DEPTH.contraction;
 return {x:p.x,bottom:p.y,width:o.width*scale,height:o.height*scale};
}
export function doorLeaf(door:Pick<Door,'openness'|'open'>,depth:Vec){
 const amount=door.openness??Number(door.open),angle=amount*1.38;
 // The hinge is fixed at the BACK jamb. Only the free edge sweeps into the room.
 return {x:62*Math.sin(angle)*(Math.sign(depth.x)||1)-depth.x*Math.cos(angle),y:-depth.y*Math.cos(angle),nearScale:1-ROOM_DEPTH.contraction+ROOM_DEPTH.contraction*Math.cos(angle)};
}
/** One projection owns the leaf, hardware, jamb and interaction contact points. */
export const DOOR_PANEL={width:62,height:147,jambHeight:151,handle:{x:53,y:71},keyhole:{x:53,y:78}} as const;
export function doorGeometry(level:CompiledLevel,door:Door){
 const floorY=level.groundY-door.floor*level.floorHeight,room=level.rooms.find(r=>r.floor===door.floor&&r.x===door.x)||level.rooms.find(r=>r.floor===door.floor&&r.end===door.x)!;
 const hinge=backPoint(room,door.x,floorY,floorY),depth={x:hinge.x-door.x,y:hinge.y-floorY},leaf=doorLeaf(door,depth),farScale=1-ROOM_DEPTH.contraction;
 const point=(x:number,y:number):Vec=>{const t=x/DOOR_PANEL.width,scale=farScale+(leaf.nearScale-farScale)*t;return {x:hinge.x+leaf.x*t,y:hinge.y+leaf.y*t+(y-DOOR_PANEL.height)*scale};};
 return {floorY,hinge,depth,leaf,point,handle:point(DOOR_PANEL.handle.x,DOOR_PANEL.handle.y),keyhole:point(DOOR_PANEL.keyhole.x,DOOR_PANEL.keyhole.y)};
}
/** World-anchored variation: no random numbers per frame or at adjoining modules. */
export const grain=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export function raggedEdge(a:Vec,b:Vec,amplitude=3,spacing=13):Vec[]{
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),count=Math.max(1,Math.ceil(length/spacing));
 return Array.from({length:count+1},(_,i)=>{const t=i/count,x=a.x+dx*t,y=a.y+dy*t,j=i===0||i===count?0:grain(x*.73+y*.91)*amplitude;
  return {x:x-dy/Math.max(1,length)*j,y:y+dx/Math.max(1,length)*j};});
}
