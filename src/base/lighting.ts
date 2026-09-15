import {levelFloorY,type CompiledLevel,type Opening} from './level.ts';
import {lineOfSight,angularDifference,BEAM_HALF,BEAM_RANGE} from './visibility.ts';
import type {Door,Segment,Vec} from './types.ts';
import {openingPlacement} from './architecture.ts';

export const TIME_PRESETS=[{id:'morning',label:'Утро',minutes:7*60},{id:'day',label:'День',minutes:12*60},{id:'evening',label:'Вечер',minutes:19*60},{id:'night',label:'Ночь',minutes:0}] as const;
export const wrapMinutes=(minutes:number)=>(minutes%1440+1440)%1440;
export const timeLabel=(minutes:number)=>{const m=Math.floor(wrapMinutes(minutes));return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};
export function timeOfDay(minutes:number){const h=wrapMinutes(minutes)/60;return h>=5&&h<10?'УТРО':h>=10&&h<17?'ДЕНЬ':h>=17&&h<21?'ВЕЧЕР':'НОЧЬ';}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function daylightStyle(minutes:number){
 const h=wrapMinutes(minutes)/60;
 const keys=[{h:0,sun:0},{h:5,sun:0},{h:7,sun:.55},{h:10,sun:.93},{h:14,sun:1},{h:17,sun:.72},{h:19,sun:.26},{h:21,sun:0},{h:24,sun:0}];
 const index=keys.findIndex((key,i)=>i<keys.length-1&&h>=key.h&&h<keys[i+1].h),a=keys[index],b=keys[index+1],sun=lerp(a.sun,b.sun,(h-a.h)/(b.h-a.h));
 const warm=h<9||h>16,color=warm?'#dfc4a1':'#e1e6e4';
 return {sun,exteriorDark:lerp(.73,.04,sun),interiorDark:.9,sky: sun<.05?'#172540':warm?'#ae8e84':'#89a5b1',skyMix:sun<.05?.22:.12+sun*.13,color,angle:lerp(.65,2.5,Math.max(0,Math.min(1,(h-6)/8)))};
}
export interface DaylightSource {id:string;origin:Vec;range:number;strength:number;angle:number;color:string;beamWidth:number;beamStrength:number;openingId?:string;apertureBeam?:boolean}
/** Area emitters sit inside the actual architectural opening. Rays are clipped by the
 * same walls, doors and stair apertures used by perception. */
export function daylightSources(level:CompiledLevel,doors:Door[],openings:Opening[],minutes:number):DaylightSource[]{
 const style=daylightStyle(minutes);if(style.sun<=0)return [];const sources:DaylightSource[]=[];
 for(const o of openings){if(o.state!=='open'||o.plane!=='back'||o.floor<0)continue;
  const p=openingPlacement(level,o);
  for(const sample of [-1,0,1])sources.push({id:`${o.id}:${sample}`,openingId:o.id,apertureBeam:sample===0,origin:{x:p.x+sample*p.width*.18,y:p.bottom-p.height*.48+Math.abs(sample)*p.height*.06},range:o.kind==='breach'?340:280,strength:style.sun*(o.kind==='breach'?.2:.16),angle:style.angle,color:style.color,beamWidth:o.kind==='breach'?28:17,beamStrength:style.sun*(o.kind==='breach'?.68:.6)});
 }
 for(const d of doors){if(!d.open||!d.exterior||d.floor<0)continue;const b=level.buildings.find(b=>b.x===d.x||b.end===d.x);if(!b)continue;const inward=d.x===b.x?1:-1;
  for(const sample of [-1,0,1])sources.push({id:`${d.id}:${sample}`,origin:{x:d.x+inward*3,y:levelFloorY(level,d.floor)-73+sample*31},range:320,strength:style.sun*.2,angle:inward===1?.35:Math.PI-.35,color:style.color,beamWidth:21,beamStrength:style.sun*.38});
 }return sources;
}
/** Ambient bounce sample for numerical lighting/occlusion checks; direct shafts are rendered separately. */
export function daylightAt(point:Vec,sources:DaylightSource[],segments:Segment[]){
 let remaining=1;for(const light of sources){const d=Math.hypot(point.x-light.origin.x,point.y-light.origin.y);if(d>=light.range||!lineOfSight(light.origin,point,segments))continue;remaining*=1-light.strength*(1-d/light.range)**1.25;}return 1-remaining;
}
export function flashlightReaches(origin:Vec,angle:number,point:Vec,segments:Segment[]){return Math.hypot(point.x-origin.x,point.y-origin.y)<=BEAM_RANGE&&Math.abs(angularDifference(Math.atan2(point.y-origin.y,point.x-origin.x),angle))<=BEAM_HALF&&lineOfSight(origin,point,segments);}
