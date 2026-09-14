import {compileLevel,levelRoomAt} from './level.ts';
import type {Floor} from './types.ts';
export const LOCATION=compileLevel({
 id:'outskirts-house-v2',width:2220,height:930,groundY:615,floorHeight:215,spawn:{x:595,floor:0},
 buildings:[{id:'home',template:'damaged-house',x:500}],
 gateways:[{id:'west',side:'left',x:100,destination:null},{id:'east',side:'right',x:2120,destination:null}],
 objects:[
  {id:'barrel',name:'Дождевая бочка',kind:'barrel',x:365,floor:0,atlas:'objects',frame:6,width:72,height:109,searched:false,uses:0},
  {id:'yard-toolbox',name:'Ящик с инструментами',kind:'chest',x:1715,floor:0,atlas:'interior',frame:5,width:71,height:61,searched:false,uses:0},
  {id:'home/supply-crates',name:'Ящики с припасами',kind:'chest',x:688,floor:0,atlas:'interior',frame:5,width:93,height:72,searched:false,uses:0},
  {id:'home/kitchen-sink',name:'Старая раковина',kind:'sink',x:1262,floor:0,atlas:'interior',frame:2,width:120,height:98,searched:false,uses:0},
  {id:'home/repair-bench',name:'Рабочий стол',kind:'workbench',x:700,floor:1,atlas:'interior',frame:1,width:153,height:99,searched:false,uses:0},
  {id:'home/linen-cabinet',name:'Платяной шкаф',kind:'wardrobe',x:1180,floor:1,atlas:'interior',frame:0,width:87,height:150,searched:false,uses:0},
  {id:'home/iron-bed',name:'Старая кровать',kind:'bed',x:1370,floor:1,atlas:'interior',frame:3,width:178,height:77,searched:false,uses:0},
  {id:'home/backup-generator',name:'Резервный генератор',kind:'generator',x:1230,floor:-1,atlas:'interior',frame:4,width:120,height:88,searched:false,uses:0},
  {id:'home/cellar-crates',name:'Ящики в кладовой',kind:'chest',x:710,floor:-1,atlas:'interior',frame:5,width:106,height:82,searched:false,uses:0},
 ],
});
export const BASE={width:LOCATION.width,height:LOCATION.height,houseLeft:LOCATION.buildings[0].x,houseRight:LOCATION.buildings[0].end,speed:175,runSpeed:248,heroScale:.265,stepHeight:LOCATION.floorHeight};
export const floorY=(floor:Floor|number)=>LOCATION.groundY-floor*LOCATION.floorHeight;
export const ROOMS=LOCATION.rooms,DOORS=LOCATION.doors,STAIRS=LOCATION.stairs,OBJECTS=LOCATION.objects;
export const RESOURCE_NAMES={wood:'Древесина',scrap:'Детали',cloth:'Ткань',water:'Вода',fuse:'Предохранитель',bandage:'Бинт'};
export const roomAt=(x:number,floor:Floor)=>levelRoomAt(LOCATION,x,floor);
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
