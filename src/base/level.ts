import type {BaseObject,Door,Floor,Room,Stair} from './types.ts';

export type OpeningState='open'|'boarded';
export interface OpeningSpec {
 id:string;kind:'window'|'breach';plane:'back'|'divider';
 /** Relative to the room's left edge and walking surface. */
 x:number;bottom:number;width:number;height:number;variant?:number;
}
export interface RoomTemplate {material:number;minWidth:number;openings:Omit<OpeningSpec,'id'>[]}
export interface RoomPlacement {id:string;name:string;template:string;x:number;width:number;floor:Floor;openings?:OpeningSpec[]}
export interface HouseTemplate {width:number;rooms:RoomPlacement[];doors:Door[];stairs:Stair[];roof:{rise:number;chimney:number}}
export interface BuildingPlacement {id:string;template:string;x:number}
export interface Building {id:string;template:string;x:number;end:number;floors:number[];roof:{rise:number;chimney:number}}
export interface Opening extends OpeningSpec {roomId:string;buildingId:string;floor:Floor;repairMaterial:'wood';state:OpeningState}
export interface ForegroundDetail {id:string;roomId:string;floor:Floor;x:number;width:number;height:number;frame?:number;kind?:'crate'|'planks'}
export interface LevelDefinition {
 id:string;width:number;height:number;groundY:number;floorHeight:number;spawn:{x:number;floor:Floor};
 buildings:BuildingPlacement[];objects:BaseObject[];
 gateways:{id:string;side:'left'|'right';x:number;destination:null|string}[];
}
export interface CompiledLevel extends Omit<LevelDefinition,'buildings'> {
 buildings:Building[];rooms:Room[];doors:Door[];stairs:Stair[];openings:Opening[];foreground:ForegroundDetail[];
}
export const ROOM_TEMPLATES:Record<string,RoomTemplate>={
 'plaster-broken':{material:0,minWidth:260,openings:[{kind:'window',plane:'back',x:100,bottom:48,width:94,height:125,variant:0}]},
 'wallpaper-broken':{material:1,minWidth:260,openings:[{kind:'window',plane:'back',x:105,bottom:47,width:90,height:127,variant:1}]},
 'cellar-bare':{material:4,minWidth:220,openings:[]},
};
export const HOUSE_TEMPLATES:Record<string,HouseTemplate>={
 'damaged-house':{
  width:1030,roof:{rise:104,chimney:138},
  rooms:[
   {id:'hall',name:'Прихожая',template:'plaster-broken',x:0,width:550,floor:0,openings:[{id:'hall-breach',kind:'breach',plane:'back',x:405,bottom:24,width:168,height:169}]},
   {id:'kitchen',name:'Кухня',template:'wallpaper-broken',x:550,width:480,floor:0,openings:[{id:'kitchen-window',kind:'window',plane:'back',x:335,bottom:48,width:86,height:123,variant:0}]},
   {id:'workshop',name:'Мастерская',template:'plaster-broken',x:0,width:590,floor:1,openings:[{id:'workshop-window',kind:'window',plane:'back',x:328,bottom:46,width:100,height:130,variant:1},{id:'upper-passage',kind:'breach',plane:'divider',x:590,bottom:0,width:24,height:153}]},
   {id:'bedroom',name:'Спальня',template:'wallpaper-broken',x:590,width:440,floor:1,openings:[{id:'bedroom-breach',kind:'breach',plane:'back',x:298,bottom:25,width:132,height:163}]},
   {id:'storage',name:'Кладовая',template:'cellar-bare',x:0,width:570,floor:-1},
   {id:'utility',name:'Техническая комната',template:'cellar-bare',x:570,width:460,floor:-1},
  ],
  doors:[{id:'entry',name:'Входная дверь',x:0,floor:0,open:true},{id:'kitchen-door',name:'Дверь на кухню',x:550,floor:0,open:false},{id:'yard-door',name:'Дверь во двор',x:1030,floor:0,open:false},{id:'cellar-door',name:'Дверь в кладовую',x:570,floor:-1,open:false}],
  stairs:[{id:'main-stair',from:0,to:1,a:260,b:450,kind:'stairs'},{id:'cellar-stair',from:-1,to:0,a:900,b:900,kind:'ladder'}],
 },
};
/** Expand placements into independent world-space instances. Rendering and physics share the result. */
export function compileLevel(def:LevelDefinition,houses=HOUSE_TEMPLATES,roomTemplates=ROOM_TEMPLATES):CompiledLevel {
 const result:CompiledLevel={...structuredClone(def),buildings:[],rooms:[],doors:[],stairs:[],openings:[],foreground:[]};
 for(const placement of def.buildings){
  const house=houses[placement.template];if(!house)throw new Error(`Unknown house template: ${placement.template}`);
  const prefix=`${placement.id}/`,floors=[...new Set(house.rooms.map(r=>r.floor))].sort((a,b)=>a-b);
  result.buildings.push({id:placement.id,template:placement.template,x:placement.x,end:placement.x+house.width,floors,roof:{...house.roof}});
  for(const r of house.rooms){
   const template=roomTemplates[r.template];if(!template)throw new Error(`Unknown room template: ${r.template}`);
   if(r.width<template.minWidth||r.x<0||r.x+r.width>house.width)throw new Error(`Room outside building: ${prefix+r.id}`);
   const room:Room={id:prefix+r.id,name:r.name,floor:r.floor,x:placement.x+r.x,end:placement.x+r.x+r.width,material:template.material,buildingId:placement.id};result.rooms.push(room);
   for(const o of [...template.openings.map((o,i)=>({...o,id:`${r.id}-window-${i}`})),...(r.openings||[])])result.openings.push({...o,id:prefix+o.id,roomId:room.id,buildingId:placement.id,x:room.x+o.x,floor:r.floor,state:'open',repairMaterial:'wood'});
   result.foreground.push({id:prefix+r.id+'-chips',roomId:room.id,floor:r.floor,x:room.x+r.width*.22,width:110,height:25,frame:7});
   result.foreground.push({id:prefix+r.id+'-front',roomId:room.id,floor:r.floor,x:room.end-112,width:90,height:36,kind:r.floor<0?'crate':'planks'});
   if(r.id==='workshop')result.foreground.push({id:prefix+r.id+'-rail',roomId:room.id,floor:r.floor,x:room.end-60,width:78,height:38,frame:8});
  }
  for(const d of house.doors)result.doors.push({...d,id:prefix+d.id,x:placement.x+d.x,exterior:d.x===0||d.x===house.width});
  for(const s of house.stairs)result.stairs.push({...s,id:prefix+s.id,a:placement.x+s.a,b:placement.x+s.b});
 }
 validateLevel(result);return result;
}
export const levelFloorY=(level:CompiledLevel,floor:number)=>level.groundY-floor*level.floorHeight;
export const levelRoomAt=(level:CompiledLevel,x:number,floor:Floor)=>level.rooms.find(r=>r.floor===floor&&x>=r.x&&x<=r.end);
export function walkBounds(level:CompiledLevel,x:number,floor:Floor):[number,number]{
 if(floor===0)return [70,level.width-70];
 const b=level.buildings.find(b=>b.floors.includes(floor)&&x>=b.x&&x<=b.end);return b?[b.x+23,b.end-23]:[x,x];
}
/** The front fascia stays continuous; the stair opening sits behind it in depth. */
export function floorSpans(_level:CompiledLevel,building:Building,_floor:Floor):[number,number][] {
 return [[building.x,building.end]];
}
/** Headroom at the upper end of each flight, shared by sight and all light rays.
 * The visible front fascia is a different depth plane and does not seal this opening. */
export function stairApertures(level:CompiledLevel,building:Building,floor:Floor):[number,number][] {
 return level.stairs.filter(s=>s.to===floor&&s.a>=building.x&&s.a<=building.end&&s.b>=building.x&&s.b<=building.end).map(s=>{
  if(s.kind==='ladder')return [Math.max(building.x,s.b-34),Math.min(building.end,s.b+34)];
  const direction=Math.sign(s.b-s.a)||1,run=Math.abs(s.b-s.a),headroom=Math.min(run,run*142/level.floorHeight+18);
  const start=s.b-direction*headroom,end=s.b+direction*20;
  return [Math.max(building.x,Math.min(start,end)),Math.min(building.end,Math.max(start,end))];
 });
}
/** Solid portions of the slab behind the fascia. Multiple/reversed flights are supported. */
export function floorOccluderSpans(level:CompiledLevel,building:Building,floor:Floor):[number,number][] {
 let parts:[number,number][]=[[building.x,building.end]];
 for(const [left,right] of stairApertures(level,building,floor))parts=parts.flatMap(([a,b])=>b<=left||a>=right?[[a,b]]:([[a,Math.max(a,left)],[Math.min(b,right),b]] as [number,number][]).filter(([a,b])=>b>a));
 return parts;
}
export function validateLevel(level:CompiledLevel){
 const seen=new Set<string>();for(const item of [...level.buildings,...level.rooms,...level.doors,...level.stairs,...level.openings,...level.objects,...level.gateways,...level.foreground]){if(seen.has(item.id))throw new Error(`Duplicate module id: ${item.id}`);seen.add(item.id);}
 if(!level.buildings.length||!level.gateways.some(g=>g.side==='left')||!level.gateways.some(g=>g.side==='right'))throw new Error('A level needs buildings and both gateways');
 for(const b of level.buildings){
  if(b.x<70||b.end>level.width-70)throw new Error(`Building outside level: ${b.id}`);
  for(const f of b.floors){const rooms=level.rooms.filter(r=>r.buildingId===b.id&&r.floor===f).sort((a,b)=>a.x-b.x);for(let i=1;i<rooms.length;i++)if(rooms[i].x<rooms[i-1].end)throw new Error(`Overlapping rooms: ${rooms[i].id}`);}
 }
 for(const o of level.openings){const r=level.rooms.find(r=>r.id===o.roomId);if(!r||o.bottom<0||o.height<=0||o.bottom+o.height>level.floorHeight-18||o.x<r.x||o.x>r.end||o.plane==='back'&&(o.x-o.width/2<r.x||o.x+o.width/2>r.end))throw new Error(`Invalid opening: ${o.id}`);}
 for(const s of level.stairs){const a=levelRoomAt(level,s.a,s.from),b=levelRoomAt(level,s.b,s.to);if(!a||!b||a.buildingId!==b.buildingId||s.to!==s.from+1)throw new Error(`Unconnected stair: ${s.id}`);if(s.kind==='ladder'&&s.a!==s.b)throw new Error(`A vertical ladder must have aligned endpoints: ${s.id}`);}
}
