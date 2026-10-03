// Генератор штатной сцены «Шпиля». Арена собрана из прямоугольных блоков:
// каждый блок, прыжковая площадка, точка появления и бонус остаются объектом
// сцены Shelter и редактируются в инспекторе. Запуск: node games/spire/scripts/create-scene.mjs
import {writeFile} from 'node:fs/promises';

const nodes=[];
const COLORS={floor:'#4b4f58',wall:'#30343d',metal:'#5d6573',stair:'#646a74',rail:'#c98a3a',crate:'#6b5a44',pillar:'#3a3f4a',concrete:'#5a5e66',barrier:'#d9a72a'};
const NAMES={floor:'Настил',wall:'Стена',metal:'Мостки',stair:'Ступень',rail:'Перила',crate:'Ящик',pillar:'Опора',concrete:'Бетон',barrier:'Барьер'};
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
// Галерея под кольцевыми мостками: стена от пола до мостков (4,5 м) с проёмами шириной 3 м.
const span=(from,to,gaps)=>{const out=[];let at=from;for(const [a,b] of gaps){out.push([at,a]);at=b;}out.push([at,to]);return out;};
for(const s of [-1,1]){
 const inner=s>0?[25.6,26]:[-26,-25.6];
 for(const z of span(-26,26,[[-21,-18],[-9,-6],[6,9],[18,21]]))solid('concrete',inner,[0,4.5],z);
 for(const x of span(-26,26,[[-14,-11],[-2,2],[11,14]]))solid('concrete',x,[0,4.5],inner);
 // Лаз: перегородка поперёк боковой галереи со щелью 1,2 м снизу — только в приседе или подкатом.
 solid('barrier',s>0?[26,32]:[-32,-26],[1.2,4.5],[-.25,.25]);
}
// Будки в углах мостков: стены 2,5 м, по двери и два окна с каждой стороны к мосткам, крыша.
for(const sx of [-1,1])for(const sz of [-1,1]){
 const r=([a,b],k)=>k>0?[a,b]:[-b,-a],wall=(t,y,along)=>along==='x'?solid('wall',r([26.4,26.7],sx),y,r(t,sz)):solid('wall',r(t,sx),y,r([26.4,26.7],sz));
 for(const along of ['x','z']){
  for(const t of [[26.4,26.9],[28,28.4],[30,30.5],[31.6,32]])wall(t,[5,7.5],along);
  for(const t of [[26.9,28],[30.5,31.6]]){wall(t,[5,6.1],along);wall(t,[7,7.5],along);}
  wall([28.4,30],[7.3,7.5],along);
 }
 solid('metal',r([26.4,32],sx),[7.5,7.8],r([26.4,32],sz));
}
// Парапет вершины высотой 1 м с разрывами 3 м посередине каждой стороны.
for(const s of [-1,1])for(const [a,b] of [[-6,-1.5],[1.5,6]]){
 solid('rail',[a,b],[10,11],s>0?[5.7,6]:[-6,-5.7]);solid('rail',s>0?[5.7,6]:[-6,-5.7],[10,11],[a,b]);
}
// Снайперское гнездо на 14 м над северными мостками: парапет 1,1 м, опоры на мостки, один подъём — узкая лестница вдоль стены.
solid('metal',[-6,6],[13.6,14],[-32,-24]);
solid('rail',[-6,6],[14,15.1],[-24.3,-24]);solid('rail',[-6,-5.7],[14,15.1],[-32,-24.3]);solid('rail',[5.7,6],[14,15.1],[-30.4,-24.3]);
for(const x of [-1,1])solid('pillar',x>0?[5.4,6]:[-6,-5.4],[5,13.6],[-26.6,-26]);
for(let i=0;i<18;i++)solid('stair',[6+(17-i)*.6,6+(18-i)*.6],[5,5+.5*(i+1)],[-31.8,-30.4]);
// Укрытия нижнего зала трёх высот: бетон 2,5 м (полное), ящики 1,4 м (запрыгнуть с приседом), барьеры 1,0 м (только в приседе).
for(const sx of [-1,1])for(const sz of [-1,1]){
 solid('concrete',sx>0?[10,12]:[-12,-10],[0,2.5],sz>0?[4,8]:[-8,-4]);
 solid('crate',sx>0?[9,11]:[-11,-9],[0,1.4],sz>0?[19,21]:[-21,-19]);
 solid('crate',sx>0?[29,31]:[-31,-29],[0,1.4],sz>0?[17,19]:[-19,-17]);
}
for(const s of [-1,1])solid('barrier',[-2.5,2.5],[0,1],s>0?[13,14.5]:[-14.5,-13]);

// Декор: трубы и лампы галереи, решётки в полу, таблички секторов и подсказки. В столкновениях не участвует.
function decor(kind,name,[x0,x1],[y0,y1],[z0,z1],text=''){
 nodes.push({id:id('decor'),name,kind:'box',layer:'props',visible:true,locked:false,
  transform:{position:[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],rotation:[0,0,0],scale:[x1-x0,y1-y0,z1-z0]},components:[{type:'spire.decor',values:{kind,text}}]});
}
for(const s of [-1,1]){
 decor('pipe','Труба',s>0?[31.1,31.5]:[-31.5,-31.1],[3.8,4.2],[-26,26]);decor('pipe','Труба',s>0?[30.6,30.86]:[-30.86,-30.6],[3.95,4.21],[-26,26]);
 decor('pipe','Труба',[-26,26],[3.8,4.2],s>0?[31.1,31.5]:[-31.5,-31.1]);decor('pipe','Труба',[-26,26],[3.95,4.21],s>0?[30.6,30.86]:[-30.86,-30.6]);
 for(let t=-24;t<=24;t+=8){decor('lamp','Лампа',s>0?[28.7,29.3]:[-29.3,-28.7],[4.38,4.48],[t-.3,t+.3]);decor('lamp','Лампа',[t-.3,t+.3],[4.38,4.48],s>0?[28.7,29.3]:[-29.3,-28.7]);}
 for(const t of [-14,14]){decor('vent','Решётка',s>0?[28.4,29.6]:[-29.6,-28.4],[0,.03],[t-.6,t+.6]);}
 decor('vent','Решётка',[-.6,.6],[0,.03],s>0?[28.4,29.6]:[-29.6,-28.4]);
 // Таблички «ЛАЗ» на обеих сторонах перегородок.
 for(const z of [-1,1])decor('sign','Табличка',s>0?[28.3,29.7]:[-29.7,-28.3],[2.6,3.1],z>0?[.25,.3]:[-.3,-.25],'ЛАЗ');
}
for(const [text,x,z] of [['СЕКТОР А',-25.55,-12],['СЕКТОР В',25.55,12]])decor('sign','Табличка',x>0?[25.5,25.55]:[-25.55,-25.5],[3.3,3.9],[z-1.2,z+1.2],text);
for(const [text,x,z] of [['СЕКТОР Б',-6,-25.55],['СЕКТОР Г',6,25.55]])decor('sign','Табличка',[x-1.2,x+1.2],[3.3,3.9],z>0?[25.5,25.55]:[-25.55,-25.5],text);
decor('sign','Табличка',[16.4,18.2],[6.4,7],[-31.95,-31.9],'ГНЕЗДО ↑');
decor('sign','Табличка',[-1.2,1.2],[14.35,14.85],[-24,-23.95],'ГНЕЗДО');
for(const sx of [-1,1])for(const sz of [-1,1])decor('lamp','Лампа',sx>0?[28.9,29.5]:[-29.5,-28.9],[7.4,7.5],sz>0?[28.9,29.5]:[-29.5,-28.9]);

// Прыжковые площадки: снизу на боковые мостки и с балконов на вершину.
for(const [x,y,z,tx,ty,tz] of [[-18,0,0,-29,5,0],[18,0,0,29,5,0],[0,5,21,0,10,4.5],[0,5,-21,0,10,-4.5]])
 marker('pad','Прыжковая площадка',[x,y,z],[2,.2,2],{type:'spire.jumppad',values:{tx,ty,tz}});
// Точки появления смотрят к центру арены.
for(const [x,y,z] of [[-24,0,-24],[24,0,24],[-29,0,22],[29,0,-22],[-14,0,-5],[14,0,5],[0,0,20],[0,0,-20],[-29,5,-22],[29,5,22],[-22,5,29],[22,5,-29]])
 marker('spawn','Точка появления',[x,y,z],[.6,.1,.6],{type:'spire.spawn',values:{yaw:yawTo(x,z)}});
// Бонусы. Броня и патроны винтовки — в будках, винтовка — в гнезде, автоматы — в боковых галереях.
const items=[['mega',0,10,0],['rocket',0,0,0],['shotgun',-29,5,-10],['shotgun',29,5,10],['armor',-29,5,29],['armor',29,5,-29],
 ['health',-14,0,20],['health',14,0,-20],['health',-28,0,-6],['health',28,0,6],['health',0,5,29],['health',0,5,-29],['health',-29,5,-29],
 ['shells',-12,0,-14],['shells',12,0,14],['rockets',-29,5,20],['rockets',29,5,-20],
 ['auto',-29,0,9],['auto',29,0,-9],['rifle',0,14,-29],['bullets',12,0,-14],['bullets',-12,0,14],['rounds',29,5,29]];
const ITEM_NAMES={mega:'Мега-бонус',rocket:'Ракетница',shotgun:'Дробовик',auto:'Автомат',rifle:'Винтовка',armor:'Броня',health:'Аптечка',shells:'Патроны дробовика',bullets:'Патроны автомата',rounds:'Патроны винтовки',rockets:'Ракеты'};
for(const [item,x,y,z] of items)marker('item',ITEM_NAMES[item],[x,y,z],[.8,.8,.8],{type:'spire.pickup',values:{item}});

const scene={format:'shelter-scene',version:2,id:'arena',template:'spire-arena-v2',name:'Шпиль',units:'m',nodes,textures:[],
 camera:{projection:'perspective',fov:90,height:2,distance:3,follow:'fixed'},environment:{time:0,haze:.02,exposure:1,flashlight:false},
 moduleData:{spire:{size:64,lavaY:-2,killY:-12}}};
await writeFile(new URL('../scenes/arena.scene.json',import.meta.url),JSON.stringify(scene,null,2)+'\n');
console.log(`Шпиль: ${nodes.length} объектов`);
