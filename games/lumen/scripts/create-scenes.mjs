// Reproducible authored levels. Run from any directory with Node.js.
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const specs=[
 {id:'quiet-harbor',name:'Тихая гавань',subtitle:'Там, где начинается свет',theme:0,width:4500,next:'hanging-gardens',
  ground:[[0,830],[1010,1790],[2010,2800],[3000,4500]],
  platforms:[[470,550,190],[600,460,160],[1350,545,170],[1570,430,220],[1810,525,130],[2310,535,180],[2570,455,150],[3220,550,170],[3430,435,210],[3700,540,170]],
  lenses:[[675,409],[1690,379],[3530,384]],checkpoints:[1140,2190,3910],
  thorns:[[1510,622,60],[2510,622,65],[3380,622,65]],enemies:[[1250,616,65,.8],[2670,616,75,1.1],[3680,616,85,1]],moving:[],
  signs:[[130,'A / D или ← / →  ·  Иди к свету',220],[460,'Пробел — прыжок. Нажми ещё раз в воздухе.',190],[810,'Двойной прыжок поможет перелететь провал.',160],[1140,'Огоньки сохраняют путь и восстанавливают здоровье.',170],[1450,'Shift / K — рывок. Пробейся сквозь тень.',180],[4050,'Собери три линзы и нажми E у маяка.',190]],
  goal:4260},
 {id:'hanging-gardens',name:'Висячие сады',subtitle:'У каждого огня есть корни',theme:1,width:5000,next:'star-observatory',
  ground:[[0,690],[930,1640],[1950,2490],[2850,3590],[3900,5000]],
  platforms:[[350,545,160],[570,445,150],[1070,530,180],[1290,410,210],[2000,550,170],[2250,435,170],[2670,520,130],[3050,535,200],[3320,415,170],[3990,545,160],[4190,430,160],[4380,330,190]],
  lenses:[[1375,359],[2720,469],[4460,279]],checkpoints:[990,2120,4050],
  thorns:[[1210,622,85],[2290,622,95],[3150,622,85],[4320,622,95]],enemies:[[1470,616,85,1],[2370,391,45,1.5],[3340,616,110,1.2],[4640,616,100,1.1]],
  moving:[[1700,535,170,'x',85,.85],[3670,550,130,'y',55,1.2]],
  signs:[[160,'Рывок продлевает прыжок. Сила вернётся через секунду.',210],[1580,'Платформы движутся. Подожди удобный момент.',170],[2960,'Прыгни на тень сверху или пройди сквозь неё рывком.',160]],goal:4750},
 {id:'star-observatory',name:'Звёздная обсерватория',subtitle:'Один маленький огонь меняет всё',theme:2,width:5200,next:'',
  ground:[[0,690],[920,1660],[1940,2640],[2930,3670],[3960,5200]],
  platforms:[[400,540,180],[635,440,145],[1050,540,170],[1270,420,210],[1510,510,150],[2030,545,180],[2260,430,185],[2670,410,180],[3070,540,170],[3300,425,210],[3570,525,140],[4020,545,170],[4210,430,155],[4390,320,220],[4640,445,150]],
  lenses:[[1370,369],[2745,359],[4480,269]],checkpoints:[1010,2110,4030],
  thorns:[[1260,622,110],[2340,622,110],[3370,622,100],[4310,622,95]],enemies:[[1510,616,85,1.2],[2350,386,48,1.4],[3110,616,100,1.3],[3500,616,85,1.25],[4740,616,80,1.2]],
  moving:[[1750,555,160,'y',45,1],[2510,515,130,'x',65,1.15],[3760,540,145,'y',60,1.2]],
  signs:[[180,'Последний маяк. Ты уже знаешь дорогу.',210],[2490,'Двойной прыжок и рывок — дотянись до линзы.',180],[4820,'Три линзы. Один рассвет. Нажми E.',160]],goal:4950},
];
await mkdir(root+'scenes',{recursive:true});
for(const s of specs){
 let serial=0;const nodes=[];
 function add(kind,x,y,w,h,values={},name=kind){const colors={solid:'#294c55',platform:'#477d7a',moving:'#a8dfc9',thorn:'#bd6785',spark:'#ffe0a0',lens:'#8ff5e5',checkpoint:'#e8c98b',enemy:'#af7dc4',beacon:'#e6cfa5',spawn:'#e4c99a',sign:'#6b948f'};const id=s.id+'-'+kind+'-'+serial++;nodes.push({id,name,kind:kind==='spark'||kind==='lens'?'sphere':'box',layer:['solid','platform','moving'].includes(kind)?'architecture':'props',visible:true,locked:false,transform:{position:[(x+w/2)/64,(660-y-h/2)/64,0],rotation:[0,0,0],scale:[w/64,h/64,.3]},surface:{texture:'none',color:colors[kind],roughness:.8,metalness:0,repeat:1},components:[{type:'lumen.'+kind,values}]});return id;}
 for(const [a,b] of s.ground)add('solid',a,660,b-a,310,{},'Каменная набережная');
 for(const [x,y,w] of s.platforms)add('platform',x,y,w,24,{},'Уступ');
 for(const [x,y,w,axis,range,speed] of s.moving)add('moving',x,y,w,24,{axis,range,speed,phase:0},'Парящая платформа');
 add('spawn',160,606,32,54,{},'Начало пути');
 for(const [x,y] of s.lenses)add('lens',x,y,32,40,{},'Линза маяка');
 for(const x of s.checkpoints)add('checkpoint',x,572,36,88,{},'Сохранение — огонёк');
 for(const [x,y,w] of s.thorns)add('thorn',x,y,w,38,{},'Тёмные кристаллы');
 for(const [x,y,range,speed] of s.enemies)add('enemy',x,y,46,44,{axis:'x',range,speed,phase:0},'Тень');
 for(const [x,text,radius] of s.signs)add('sign',x,610,22,50,{text,radius},'Подсказка');
 // Sparks guide jumps and reward taking the upper route.
 for(const [x,y,w] of s.platforms){for(let i=0;i<2;i++)add('spark',x+w*(.3+i*.4)-8,y-48-i*13,16,20,{},'Искра');}
 for(let i=0;i<s.ground.length-1;i++){const a=s.ground[i][1],b=s.ground[i+1][0];for(let j=0;j<3;j++)add('spark',a+(b-a)*(j+1)/4-8,537-Math.sin((j+1)/4*Math.PI)*55,16,20,{},'Искра над пропастью');}
 add('beacon',s.goal,476,86,184,{next:s.next},'Маяк');
 const scene={format:'shelter-scene',version:2,id:s.id,template:'lumen-platformer-v1',name:s.name,units:'m',nodes,textures:[],camera:{projection:'orthographic',fov:35,height:13.5,distance:25,centerX:9,centerY:2.5,follow:'horizontal'},environment:{time:1320,haze:.035,exposure:1,flashlight:false},moduleData:{lumen:{version:1,width:s.width,theme:s.theme,subtitle:s.subtitle,next:s.next}}};
 await writeFile(root+'scenes/'+s.id+'.scene.json',JSON.stringify(scene,null,2)+'\n');
}
const manifest={format:'shelter-project',version:1,sdk:1,projectId:'lumen-last-beacon',name:'Люмен · Последний маяк',gameVersion:'1.0.0',startScene:specs[0].id,scenes:specs.map(s=>({id:s.id,name:s.name,path:'scenes/'+s.id+'.scene.json'})),assets:[],modules:[{id:'lumen',version:1,runtime:'scripts/runtime.ts'}],build:{target:'web',mode:'release',base:'./',output:'',scenes:specs.map(s=>s.id),dynamicAssets:[],appId:'game.lumen-last-beacon'}};
await writeFile(root+'project.shelter.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Lumen: three native Shelter scenes generated.');
