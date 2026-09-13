import { clamp } from './math.ts';

export const FLOOR_HEIGHT=280;
export const OFFICE_WIDTH=1380;
export interface OfficeLevel {
  start:number;end:number;
  stairs:{x:number;end:number;back:number;front:number};
  lift:{x:number;y:number;elevation:number};
}
/** Each level is an independent two-storey office. The stairwell is an opening
 * in the upper deck, so the same x/y can also belong to the corridor underneath. */
export const OFFICE_LEVELS:readonly OfficeLevel[]=Array.from({length:3},(_,i)=>{
  const start=i*OFFICE_WIDTH,stairX=start+(i===1?390:540);
  return {start,end:start+OFFICE_WIDTH,stairs:{x:stairX,end:stairX+400,back:518,front:568},lift:{x:start+1210,y:566,elevation:FLOOR_HEIGHT}};
});
export const officeAt=(x:number)=>OFFICE_LEVELS.find(l=>x>=l.start&&x<=l.end);
export const stairHeight=(level:OfficeLevel,x:number)=>FLOOR_HEIGHT*clamp((x-level.stairs.x)/(level.stairs.end-level.stairs.x),0,1);
export function inStairwell(level:OfficeLevel,x:number,y:number){
  const s=level.stairs;return x>s.x&&x<s.end&&y>=s.back&&y<=s.front;
}
export function floorAt(x:number,y:number,ceiling=Infinity){
  const level=officeAt(x);if(!level||x<level.start+55||x>level.end-45)return 0;
  if(inStairwell(level,x,y)){
    const z=stairHeight(level,x);return z<=ceiling+.01?z:0;
  }
  return FLOOR_HEIGHT<=ceiling+.01?FLOOR_HEIGHT:0;
}
/** Route to the foot or head of the stairs before changing storeys. */
export function stairApproach(x:number,y:number,elevation:number,targetX:number,targetY:number,targetElevation:number){
  const level=officeAt(x);if(!level)return {x:targetX,y:targetY};
  const s=level.stairs,lane=(s.back+s.front)/2;
  if(Math.abs(elevation-targetElevation)>5){
    const up=targetElevation>elevation,entry=up?s.x-20:s.end+20,exit=up?s.end+20:s.x-20;
    const onStairs=inStairwell(level,x,y)&&Math.abs(elevation-stairHeight(level,x))<3;
    if(onStairs||Math.abs(x-entry)<26&&Math.abs(y-lane)<18)return {x:exit,y:lane};
    return {x:entry,y:lane};
  }
  // Ground-floor pursuit goes around the stair footprint instead of climbing by accident.
  if(elevation<8&&targetElevation<8&&Math.max(x,targetX)>s.x-25&&Math.min(x,targetX)<s.end+25&&Math.abs(x-targetX)>45){
    const corridor=s.front+30;
    if(y<corridor-8)return {x,y:corridor};
    return {x:targetX,y:corridor};
  }
  return {x:targetX,y:targetY};
}
