import {doorGeometry} from './architecture.ts';
import type {CompiledLevel} from './level.ts';
import type {Door} from './types.ts';

export const DOOR_CLEARANCE=40,DOOR_REACH=50;
/** Measured grip centres in the existing atlas, alongside the original foot anchors. */
export const DOOR_POSES=[
 {x:285,y:0,w:395,h:550,ax:165,ay:536,hx:353,hy:222},
 {x:885,y:0,w:400,h:550,ax:163,ay:536,hx:361,hy:222},
 {x:285,y:550,w:395,h:474,ax:165,ay:456,hx:353,hy:173},
 {x:875,y:550,w:410,h:474,ax:173,ay:456,hx:372,hy:174},
] as const;
export const DOOR_POSE_SCALE=.255;
export function doorContact(level:CompiledLevel,door:Door,side:1|-1){
 const geometry=doorGeometry(level,{...door,open:false,openness:0}),handle=geometry.handle;
 const x=side===1?Math.max(handle.x+DOOR_REACH,door.x+DOOR_CLEARANCE):Math.min(handle.x-DOOR_REACH,door.x-DOOR_CLEARANCE);
 return {x,handle,hand:{x:(handle.x-x)*-side,y:handle.y-geometry.floorY},keyholeY:geometry.keyhole.y};
}
