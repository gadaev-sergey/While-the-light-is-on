import type {Room,Door,BaseObject,Stair,Floor} from './types.ts';
export const BASE={width:2220,height:930,houseLeft:500,houseRight:1530,speed:175,runSpeed:248,heroScale:.265,stepHeight:215};
export const floorY=(floor:Floor|number)=>615-floor*BASE.stepHeight;
export const ROOMS:Room[]=[
 {id:'hall',name:'Прихожая',floor:0,x:500,end:1050,material:0,window:true},
 {id:'kitchen',name:'Кухня',floor:0,x:1050,end:1530,material:1,window:true},
 {id:'workshop',name:'Мастерская',floor:1,x:500,end:1090,material:0,window:true},
 {id:'bedroom',name:'Спальня',floor:1,x:1090,end:1530,material:1,window:true},
 {id:'storage',name:'Кладовая',floor:-1,x:500,end:1070,material:4},
 {id:'utility',name:'Техническая комната',floor:-1,x:1070,end:1530,material:4},
];
export const DOORS:Door[]=[
 {id:'entry',name:'Входная дверь',x:500,floor:0,open:true,exterior:true},
 {id:'kitchen-door',name:'Дверь на кухню',x:1050,floor:0,open:false},
 {id:'yard-door',name:'Дверь во двор',x:1530,floor:0,open:false,exterior:true},
 {id:'bedroom-door',name:'Дверь в спальню',x:1090,floor:1,open:false},
 {id:'cellar-door',name:'Дверь в кладовую',x:1070,floor:-1,open:false},
];
export const STAIRS:Stair[]=[
 {id:'main-stair',from:0,to:1,a:760,b:950},
 {id:'cellar-stair',from:-1,to:0,a:1190,b:1400},
];
export const OBJECTS:BaseObject[]=[
 {id:'hall-chest',name:'Ящик с припасами',kind:'chest',x:650,floor:0,atlas:'objects',frame:1,width:91,height:72,searched:false,uses:0},
 {id:'hall-rubble',name:'Старые доски',kind:'rubble',x:890,floor:0,atlas:'objects',frame:5,width:116,height:60,searched:false,uses:0},
 {id:'workbench',name:'Верстак',kind:'workbench',x:680,floor:1,atlas:'furniture',frame:1,width:151,height:135,searched:false,uses:0},
 {id:'wardrobe',name:'Шкаф',kind:'wardrobe',x:1215,floor:1,atlas:'furniture',frame:4,width:112,height:157,searched:false,uses:0},
 {id:'bed',name:'Кровать',kind:'bed',x:1400,floor:1,atlas:'furniture',frame:2,width:177,height:107,searched:false,uses:0},
 {id:'sink',name:'Кухонная мойка',kind:'sink',x:1195,floor:0,atlas:'furniture',frame:3,width:148,height:132,searched:false,uses:0},
 {id:'medicine',name:'Аптечка',kind:'medicine',x:1465,floor:0,atlas:'objects',frame:2,width:45,height:50,searched:false,uses:0},
 {id:'storage-chest',name:'Закрытый сундук',kind:'chest',x:650,floor:-1,atlas:'objects',frame:1,width:107,height:88,searched:false,uses:0},
 {id:'storage-rubble',name:'Завал',kind:'rubble',x:910,floor:-1,atlas:'objects',frame:5,width:145,height:76,searched:false,uses:0},
 {id:'generator',name:'Генератор',kind:'generator',x:1430,floor:-1,atlas:'objects',frame:0,width:114,height:101,searched:false,uses:0},
 {id:'fusebox',name:'Электрощит',kind:'fusebox',x:1115,floor:-1,atlas:'objects',frame:4,width:64,height:104,searched:false,uses:0},
 {id:'barrel',name:'Дождевая бочка',kind:'barrel',x:365,floor:0,atlas:'objects',frame:6,width:72,height:109,searched:false,uses:0},
 {id:'yard-toolbox',name:'Ящик с инструментами',kind:'chest',x:1715,floor:0,atlas:'objects',frame:3,width:71,height:61,searched:false,uses:0},
];
export const RESOURCE_NAMES={wood:'Древесина',scrap:'Детали',cloth:'Ткань',water:'Вода',fuse:'Предохранитель',bandage:'Бинт'};
export const roomAt=(x:number,floor:Floor)=>ROOMS.find(r=>r.floor===floor&&x>=r.x&&x<=r.end);
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
