export type Floor=number;
export type Vec={x:number;y:number};
export type Resources={wood:number;scrap:number;cloth:number;water:number;fuse:number;bandage:number};
export type ObjectKind='chest'|'workbench'|'bed'|'sink'|'wardrobe'|'generator'|'medicine'|'rubble'|'barrel'|'fusebox';
export interface Room {id:string;name:string;floor:Floor;x:number;end:number;material:number;buildingId?:string}
export interface Door {id:string;name:string;x:number;floor:Floor;open:boolean;exterior?:boolean;openness?:number;locked?:boolean;lockReason?:string}
/** Transient: a saved game never resumes a held handle or keyhole view. */
export interface DoorInteraction {id:string;side:1|-1;phase:'approach'|'grip'|'peek'|'opening';reach:number;lean:number}
export interface BaseObject {id:string;name:string;kind:ObjectKind;x:number;floor:Floor;frame:number;atlas:'furniture'|'objects'|'interior';width:number;height:number;searched:boolean;uses:number}
export interface Stair {id:string;from:Floor;to:Floor;a:number;b:number;kind?:'stairs'|'ladder'}
export interface Player {x:number;y:number;previousX:number;previousY:number;floor:Floor;facing:1|-1;moving:boolean;distance:number;previousDistance:number;hp:number;attack:number;attackHit:boolean;hurt:number;stair:null|{id:string;t:number;reverse:boolean;approach:number}}
export interface Task {id:string;duration:number;remaining:number}
export interface Navigation {x:number;floor:Floor;object?:string}
export interface Dog {x:number;previousX:number;facing:1|-1;mode:'idle'|'walk'|'warn'|'retreat'|'rest';timer:number;hp:number;hit:number}
export interface Segment {a:Vec;b:Vec}
export interface Action {type:'interact'|'flashlight'|'up'|'down'|'shove'|'bandage'|'door-open'|'door-peek'|'door-leave';target?:string}
export interface BaseSave {version:1|2|3;clock?:{minutes:number;running:boolean};levelId?:string;player:{x:number;floor:Floor;hp:number};inventory:Resources;doors:{id:string;open:boolean}[];objects:{id:string;searched:boolean;uses:number}[];openings?:{id:string;state:'open'|'boarded'}[];explored:string[];powered:boolean;flashlight:boolean;time:number;dogHp:number}
