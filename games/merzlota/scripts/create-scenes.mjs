// Генератор штатных сцен «Мерзлоты». Планировка хранится сеткой в moduleData,
// а точка старта, враги и предметы — объектами сцены с компонентами, которые
// можно передвигать и настраивать в редакторе Shelter.
// Легенда: . пол, # стена сектора, I лёд, C бетон, W окно, D дверь,
// B дверь синей карты, R дверь красной карты, X лифт-выход.
import {writeFile} from 'node:fs/promises';

const levels=[
 {
  id:'airlock',name:'Внешний шлюз',theme:'airlock',next:'lab',
  loadout:{shotgun:false,rifle:false,shells:0,cells:0},
  map:[
   '##########################',
   '#....#.........#.........#',
   '#....D.........D.........#',
   '#....#..II..II.#..##..##.#',
   '#....#.........#.........#',
   '##D###..II..II.#..##..##.#',
   '#....#.........#.........#',
   '#....D.........#####B#####',
   '#....#WWWWWWWWW#.........#',
   '#....#.........#.........#',
   '#....#.........#....X....#',
   '#....D.........#.........#',
   '#....#.........#.........W',
   '#....#.........#.........W',
   '#....#.........#.........#',
   '##########################',
  ],
  spawn:[2.5,2.5,0],
  enemies:[['crawler',10.5,2.5],['crawler',7.5,6.5],['drone',12.5,4.5],['crawler',2.5,10.5],
   ['crawler',8.5,10.5],['crawler',12.5,10.5],['drone',13.5,13.5],
   ['drone',20.5,1.5],['drone',24.5,5.5],['crawler',17.5,4.5],
   ['crawler',17.5,12.5],['crawler',23.5,9.5]],
  items:[['health',3.5,13.5],['shotgun',10.5,13.5],['blue',13.5,12.5],['shells',7.5,13.5],
   ['medkit',24.5,1.5],['shells',20.5,4.5],['armor',17.5,9.5],['health',1.5,7.5]],
 },
 {
  id:'lab',name:'Лаборатория',theme:'lab',next:'core',
  loadout:{shotgun:true,rifle:false,shells:12,cells:0},
  map:[
   '##############################',
   '#.......#..........#.........#',
   '#.......#..........#.........#',
   '#.......D..........B.........#',
   '#.......#..IIII....#.........#',
   '#.......#..I..I....#####D#####',
   '#.......#..I..I....#.........#',
   '#.......#..I..I....#.........#',
   '#.......#..I.II....#.........#',
   '#.......#..........#.........#',
   '####D#######D###########R#####',
   '#.......#..........#.........#',
   '#.......#..........#.........W',
   '#.......D..........#.........W',
   '#.......#..........#....X....W',
   '#.......#..........#.........W',
   '#.......#..........#.........W',
   '#.......#..........#.........#',
   '#.......#..........#.........#',
   '##############################',
  ],
  spawn:[4.5,15.5,270],
  enemies:[['drone',6.5,2.5],['drone',3.5,7.5],['crawler',5.5,5.5],
   ['brute',16.5,7.5],['crawler',10.5,2.5],['crawler',17.5,1.5],['drone',16.5,3.5],
   ['crawler',10.5,12.5],['crawler',15.5,16.5],['crawler',17.5,12.5],['drone',13.5,17.5],
   ['drone',22.5,2.5],['drone',26.5,3.5],['brute',25.5,2.5],
   ['crawler',21.5,7.5],['crawler',27.5,8.5],['drone',24.5,8.5],
   ['brute',24.5,16.5],['crawler',21.5,12.5],['crawler',27.5,12.5]],
  items:[['shells',6.5,17.5],['health',1.5,11.5],['blue',1.5,1.5],['shells',7.5,8.5],
   ['armor',12.5,5.5],['medkit',13.5,6.5],['shells',17.5,17.5],['health',9.5,17.5],
   ['red',27.5,1.5],['shells',20.5,4.5],['medkit',27.5,6.5],['armor',20.5,17.5]],
 },
 {
  id:'core',name:'Ледяное ядро',theme:'core',next:'',
  loadout:{shotgun:true,rifle:false,shells:16,cells:0},
  map:[
   '############WWWWWWWWWWWWWWWWW###',
   '#........#.....................#',
   '#........#.....................#',
   '#........#.....................#',
   '#........#.....................#',
   '#........#.....II.......II.....#',
   '####D#####.....II.......II.....#',
   '#........#.....................#',
   '#........#.....................W',
   '#........#.....................W',
   '#........#.....................W',
   '#........#..................X..W',
   '#........#.....................W',
   '####D#####.....................W',
   '#........#.....................#',
   '#........#.....II.......II.....#',
   '#........#.....II.......II.....#',
   '#........B.....................#',
   '#........#.....................#',
   '#........#.....................#',
   '#........#.....................#',
   '################################',
  ],
  spawn:[2.5,3.5,0],
  enemies:[['crawler',7.5,11.5],['crawler',2.5,7.5],['drone',6.5,8.5],
   ['brute',5.5,18.5],['crawler',7.5,15.5],['crawler',3.5,16.5],['drone',2.5,14.5],
   ['boss',21.5,10.5],['crawler',12.5,3.5],['crawler',12.5,18.5],['crawler',28.5,3.5],['crawler',28.5,18.5]],
  items:[['health',7.5,1.5],['rifle',4.5,9.5],['cells',1.5,12.5],['cells',8.5,7.5],
   ['blue',1.5,20.5],['medkit',8.5,20.5],['shells',8.5,14.5],
   ['medkit',11.5,1.5],['medkit',11.5,20.5],['cells',29.5,1.5],['cells',29.5,20.5],['armor',20.5,1.5],['shells',20.5,20.5]],
 },
];

const names={crawler:'Снежник',drone:'Страж',brute:'Мерзлый',boss:'Хранитель льда',health:'Ампула',medkit:'Аптечка',armor:'Бронежилет',shells:'Патроны дробовика',cells:'Энергоячейки',shotgun:'Дробовик «Тайга»',rifle:'Винтовка «Аврора»',blue:'Синяя карта',red:'Красная карта'};
const colors={crawler:'#cfe8ff',drone:'#ff8a3d',brute:'#6fb6ff',boss:'#b48cff'};
const node=(id,name,x,y,type,values,color,rotation=0)=>({id,name,kind:'box',layer:'props',visible:true,locked:false,
 transform:{position:[x,.5,y],rotation:[0,rotation,0],scale:[.6,1,.6]},surface:{texture:'none',color,roughness:.8,metalness:.1,repeat:1},components:[{type,values}]});

for(const level of levels){
 const nodes=[node(`${level.id}-spawn`,'Начало пути',level.spawn[0],level.spawn[1],'merzlota.spawn',{angle:level.spawn[2]},'#ffd36b',level.spawn[2])];
 level.enemies.forEach(([kind,x,y],i)=>nodes.push(node(`${level.id}-enemy-${i}`,names[kind],x,y,'merzlota.enemy',{kind},colors[kind])));
 level.items.forEach(([kind,x,y],i)=>nodes.push(node(`${level.id}-item-${i}`,names[kind],x,y,'merzlota.item',{kind},'#7ff7c8')));
 const scene={format:'shelter-scene',version:2,id:level.id,template:'merzlota-grid-v1',name:level.name,units:'m',nodes,textures:[],
  camera:{projection:'perspective',fov:80,height:2,distance:5,follow:'fixed'},environment:{time:0,haze:.06,exposure:1,flashlight:false},
  moduleData:{merzlota:{theme:level.theme,next:level.next,map:level.map,loadout:level.loadout}}};
 await writeFile(new URL(`../scenes/${level.id}.scene.json`,import.meta.url),JSON.stringify(scene,null,2)+'\n');
 console.log(level.id,level.map[0].length+'x'+level.map.length,'enemies',level.enemies.length,'items',level.items.length);
}
