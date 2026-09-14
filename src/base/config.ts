import {compileLevel,levelRoomAt} from './level.ts';
import type {Floor} from './types.ts';
export const LOCATION=compileLevel({
 id:'outskirts-house-v2',width:2220,height:930,groundY:615,floorHeight:215,spawn:{x:595,floor:0},
 buildings:[{id:'home',template:'damaged-house',x:500}],
 gateways:[{id:'west',side:'left',x:100,destination:null},{id:'east',side:'right',x:2120,destination:null}],
 objects:[
  {id:'barrel',name:'Дождевая бочка',kind:'barrel',x:365,floor:0,atlas:'objects',frame:6,width:72,height:109,searched:false,uses:0},
  {id:'yard-toolbox',name:'Ящик с инструментами',kind:'chest',x:1715,floor:0,atlas:'objects',frame:3,width:71,height:61,searched:false,uses:0},
 ],
});
export const BASE={width:LOCATION.width,height:LOCATION.height,houseLeft:LOCATION.buildings[0].x,houseRight:LOCATION.buildings[0].end,speed:175,runSpeed:248,heroScale:.265,stepHeight:LOCATION.floorHeight};
export const floorY=(floor:Floor|number)=>LOCATION.groundY-floor*LOCATION.floorHeight;
export const ROOMS=LOCATION.rooms,DOORS=LOCATION.doors,STAIRS=LOCATION.stairs,OBJECTS=LOCATION.objects;
export const RESOURCE_NAMES={wood:'Древесина',scrap:'Детали',cloth:'Ткань',water:'Вода',fuse:'Предохранитель',bandage:'Бинт'};
export const roomAt=(x:number,floor:Floor)=>levelRoomAt(LOCATION,x,floor);
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
