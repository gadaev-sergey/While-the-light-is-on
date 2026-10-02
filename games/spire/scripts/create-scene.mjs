// Генератор штатной сцены «Шпиля». Арена собрана из прямоугольных блоков:
// каждый блок, прыжковая площадка, точка появления и бонус остаются объектом
// сцены Shelter и редактируются в инспекторе. Запуск: node games/spire/scripts/create-scene.mjs
import {writeFile} from 'node:fs/promises';

const nodes=[];
const COLORS={floor:'#4b4f58',wall:'#30343d',metal:'#5d6573',stair:'#646a74',rail:'#c98a3a',crate:'#6b5a44',pillar:'#3a3f4a'};
const NAMES={floor:'Настил',wall:'Стена',metal:'Мостки',stair:'Ступень',rail:'Перила',crate:'Ящик',pillar:'Опора'};
let counter=0;
const id=prefix=>`${prefix}-${++counter}`;
/** Блок задаётся границами: x0..x1, y0..y1, z0..z1 (метры). */
function solid(style,[x0,x1],[y0,y1],[z0,z1]){
 nodes.push({id:id(style),name:NAMES[style],kind:'box',layer:'architecture',visible:true,locked:false,
  transform:{position:[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],rotation:[0,0,0],scale:[x1-x0,y1-y0,z1-z0]},
  surface:{texture:'none',color:COLORS[style],roughness:.85,metalness:style==='metal'||style==='rail'?.45:.15,repeat:1},
  components:[{type:'spire.solid',values:{style}}]});
}
function marker(prefix,name,[x,y,z],size,component,layer='props'){
 nodes.push({id:id(prefix),name,kind:'box',layer,visible:true,locked:false,
  transform:{position:[x,y+size[1]/2,z],rotation:[0,0,0],scale:size},components:[component]});
}
const round=v=>Math.round(v*10)/10;
const yawTo=(x,z)=>round(Math.atan2(x,z)*180/Math.PI);

// Нижний зал: четыре плиты вокруг лавовой ямы, мост через неё.
solid('floor',[-32,32],[-3,0],[9,32]);solid('floor',[-32,32],[-3,0],[-32,-9]);
solid('floor',[-32,-9],[-3,0],[-9,9]);solid('floor',[9,32],[-3,0],[-9,9]);
solid('floor',[-9,9],[-5,-3],[-9,9]);
solid('metal',[-9,9],[-.5,0],[-1,1]);
nodes.push({id:'lava',name:'Лава',kind:'box',layer:'architecture',visible:true,locked:false,
 transform:{position:[0,-2.25,0],rotation:[0,0,0],scale:[18,.5,18]},surface:{texture:'none',color:'#ff5a1f',roughness:1,metalness:0,repeat:1},
 components:[{type:'spire.lava',values:{}}]});
// Внешние стены.
for(const s of [-1,1]){solid('wall',[s*32,s*33].sort((a,b)=>a-b),[-3,18],[-33,33]);solid('wall',[-32,32],[-3,18],[s*32,s*33].sort((a,b)=>a-b));}
// Кольцевые мостки на высоте 5 м и два балкона к центру.
solid('metal',[-32,32],[4.5,5],[26,32]);solid('metal',[-32,32],[4.5,5],[-32,-26]);
solid('metal',[-32,-26],[4.5,5],[-26,26]);solid('metal',[26,32],[4.5,5],[-26,26]);
solid('metal',[-5,5],[4.5,5],[18,26]);solid('metal',[-5,5],[4.5,5],[-26,-18]);
// Перила с проходами: с мостков можно спрыгнуть вниз.
for(const s of [-1,1]){
 for(const [a,b] of [[-17,-7],[7,17]])solid('rail',[a,b],[5,6],s>0?[26,26.3]:[-26.3,-26]);
 for(const [a,b] of [[-20,-5],[5,20]])solid('rail',s>0?[26,26.3]:[-26.3,-26],[5,6],[a,b]);
 for(const x of [-5,4.7])solid('rail',[x,x+.3],[5,6],s>0?[18,22]:[-22,-18]);
}
// Четыре лестницы из нижнего зала на мостки.
for(const sx of [-1,1])for(const sz of [-1,1])for(let i=0;i<10;i++){
 const near=14+1.2*i,x=sx>0?[18,22]:[-22,-18],z=sz>0?[near,26]:[-26,-near];
 solid('stair',x,[0,.5*(i+1)],z);
}
// Верхняя площадка на опорах над ямой.
solid('metal',[-6,6],[9.4,10],[-6,6]);
for(const x of [-5,5])for(const z of [-5,5])solid('pillar',[x-.5,x+.5],[-3,9.4],[z-.5,z+.5]);
// Укрытия и опоры нижнего зала.
for(const s of [-1,1]){solid('crate',[-1.5,1.5],[0,1.2],s>0?[13,14.5]:[-14.5,-13]);solid('crate',s>0?[25,27]:[-27,-25],[0,1.4],s>0?[17,19]:[-19,-17]);
 for(const z of [-13,13])solid('pillar',s>0?[25,26.2]:[-26.2,-25],[0,4.5],[z-.6,z+.6]);}

// Прыжковые площадки: снизу на боковые мостки и с балконов на вершину.
for(const [x,y,z,tx,ty,tz] of [[-18,0,0,-29,5,0],[18,0,0,29,5,0],[0,5,21,0,10,4.5],[0,5,-21,0,10,-4.5]])
 marker('pad','Прыжковая площадка',[x,y,z],[2,.2,2],{type:'spire.jumppad',values:{tx,ty,tz}});
// Точки появления смотрят к центру арены.
for(const [x,y,z] of [[-24,0,-24],[24,0,24],[-26,0,22],[26,0,-22],[-14,0,-5],[14,0,5],[0,0,20],[0,0,-20],[-29,5,-22],[29,5,22],[-22,5,29],[22,5,-29]])
 marker('spawn','Точка появления',[x,y,z],[.6,.1,.6],{type:'spire.spawn',values:{yaw:yawTo(x,z)}});
// Бонусы.
const items=[['mega',0,10,0],['rocket',0,0,0],['shotgun',-29,5,-10],['shotgun',29,5,10],['armor',-29,5,29],['armor',29,5,-29],
 ['health',-14,0,20],['health',14,0,-20],['health',-28,0,-6],['health',28,0,6],['health',0,5,29],['health',0,5,-29],
 ['shells',-12,0,-14],['shells',12,0,14],['rockets',-29,5,20],['rockets',29,5,-20]];
const ITEM_NAMES={mega:'Мега-бонус',rocket:'Ракетница',shotgun:'Дробовик',armor:'Броня',health:'Аптечка',shells:'Патроны дробовика',rockets:'Ракеты'};
for(const [item,x,y,z] of items)marker('item',ITEM_NAMES[item],[x,y,z],[.8,.8,.8],{type:'spire.pickup',values:{item}});

const scene={format:'shelter-scene',version:2,id:'arena',template:'spire-arena-v1',name:'Шпиль',units:'m',nodes,textures:[],
 camera:{projection:'perspective',fov:90,height:2,distance:3,follow:'fixed'},environment:{time:0,haze:.02,exposure:1,flashlight:false},
 moduleData:{spire:{size:64,lavaY:-2,killY:-12}}};
await writeFile(new URL('../scenes/arena.scene.json',import.meta.url),JSON.stringify(scene,null,2)+'\n');
console.log(`Шпиль: ${nodes.length} объектов`);
