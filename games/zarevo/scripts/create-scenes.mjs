// Генератор штатных сцен «Зарева». Трасса описывается участками, рядами
// декораций и контрольными точками — каждый элемент остаётся объектом сцены
// Shelter и редактируется в инспекторе.
import {writeFile} from 'node:fs/promises';

const stages=[
 {
  id:'coast',name:'Приморское шоссе',theme:'coast',time:42,rivals:7,traffic:10,pace:.76,next:'pass',
  sections:[
   [25,60,25,0,0],[30,80,30,2,0],[20,60,20,0,20],[30,90,30,-3,0],[40,120,40,0,-20],
   [30,70,30,4,0],[30,60,30,-2,30],[20,80,20,0,0],[40,90,40,-4,-30],[30,80,30,3,0],
   [25,100,25,0,25],[30,70,30,-3,-25],[30,80,30,5,0],[30,60,30,-2,0],[25,80,25,0,15],
   [30,80,30,3,-15],[25,120,25,0,0],
  ],
  checkpoints:[[.25,22],[.5,21],[.75,20]],
  scenery:[
   ['palm','both',0,4000,18,1.35],['lamp','right',10,4000,30,1.15],['rock','left',300,900,45,1.9],
   ['billboard','left',120,4000,260,1.7],['palm','left',1100,1900,9,2.3],['house','right',1500,2600,70,2.2],
   ['rock','both',2700,3400,40,1.8],['palm','right',2600,4000,11,2.4],
  ],
 },
 {
  id:'pass',name:'Перевал Ветров',theme:'pass',time:30,rivals:7,traffic:8,pace:.82,next:'city',
  sections:[
   [20,50,20,0,0],[30,60,30,-5,40],[30,50,30,5,0],[25,40,25,-6,30],[30,60,30,4,-50],
   [20,80,20,0,60],[30,50,30,-6,0],[30,50,30,6,-40],[20,60,20,0,-30],[25,70,25,5,50],
   [30,50,30,-5,0],[20,40,20,6,40],[25,60,25,-4,-60],[30,90,30,0,0],[30,60,30,-6,30],
   [25,60,25,5,-30],[30,50,30,-3,20],[20,70,20,4,-20],[25,110,25,0,0],
  ],
  checkpoints:[[.2,20],[.4,19],[.6,18],[.8,17]],
  scenery:[
   ['pine','both',0,4500,14,1.4],['rock','both',40,4500,33,1.9],['sign','right',60,4500,85,1.2],
   ['pine','left',0,4500,7,2.5],['lamp','left',1200,1800,24,1.15],['rail','both',1900,3000,6,1.1],
  ],
 },
 {
  id:'city',name:'Неоновый город',theme:'city',time:38,rivals:7,traffic:20,pace:.81,next:'',
  sections:[
   [20,90,20,0,0],[25,60,25,3,0],[25,60,25,-3,0],[30,100,30,0,15],[20,50,20,5,-15],
   [20,50,20,-5,0],[30,90,30,0,25],[25,60,25,4,-25],[25,70,25,-4,0],[30,120,30,0,0],
   [25,50,25,6,20],[25,50,25,-6,-20],[30,80,30,2,0],[25,60,25,-3,10],[25,60,25,4,-10],
   [30,100,30,0,0],[25,70,25,-5,0],[25,60,25,3,0],[25,120,25,0,0],
  ],
  checkpoints:[[.2,19],[.4,18],[.6,17],[.8,16]],
  scenery:[
   ['tower','both',0,4600,11,2.3],['lamp','both',5,4600,16,1.15],['neon','left',40,4600,55,1.55],
   ['neon','right',70,4600,75,1.55],['tower','both',5,4600,13,3.4],
  ],
 },
];

const node=(id,name,position,scale,type,values,color='#3a3247')=>({id,name,kind:'box',layer:type.endsWith('section')?'architecture':'props',visible:true,locked:false,
 transform:{position,rotation:[0,0,0],scale},surface:{texture:'none',color,roughness:.85,metalness:.1,repeat:1},components:[{type,values}]});
const propNames={palm:'Пальмы',lamp:'Фонари',rock:'Скалы',billboard:'Рекламные щиты',house:'Домики у моря',pine:'Ели',sign:'Знаки поворота',rail:'Отбойник',tower:'Небоскрёбы',neon:'Неоновые вывески'};

for(const stage of stages){
 const nodes=[];let at=0;
 stage.sections.forEach(([enter,hold,leave,curve,hill],i)=>{
  enter=Math.round(enter*1.5);leave=Math.round(leave*1.5);hold=Math.round(hold*2.2);
  const length=enter+hold+leave;
  nodes.push(node(`${stage.id}-section-${i}`,`Участок ${i+1}`,[curve,hill/10,at/10],[4,1,Math.min(100,length/10)],'zarevo.section',{enter,hold,leave,curve,hill},'#2d2b33'));
  at+=length;
 });
 stage.checkpoints.forEach(([share,bonus],i)=>{const segment=Math.round(at*share/10)*10;nodes.push(node(`${stage.id}-checkpoint-${i}`,`Контрольная точка ${i+1}`,[0,2,segment/10],[4.2,.4,.2],'zarevo.checkpoint',{segment,bonus},'#ff6a3d'));});
 stage.scenery.forEach(([kind,side,from,to,every,offset],i)=>{from=Math.min(at-100,Math.round(from*at/4200));to=Math.min(at,Math.round(to*at/4200));nodes.push(node(`${stage.id}-scenery-${i}`,propNames[kind],[side==='left'?-offset:offset,1,from/10],[.6,2,Math.min(100,Math.max(.1,(to-from)/10))],'zarevo.scenery',{kind,side,from,to,every,offset},'#556b4f'));});
 const scene={format:'shelter-scene',version:2,id:stage.id,template:'zarevo-track-v1',name:stage.name,units:'m',nodes,textures:[],
  camera:{projection:'perspective',fov:80,height:2,distance:5,follow:'fixed'},environment:{time:stage.theme==='coast'?1140:0,haze:.04,exposure:1,flashlight:false},
  moduleData:{zarevo:{theme:stage.theme,time:stage.time,rivals:stage.rivals,traffic:stage.traffic,pace:stage.pace,next:stage.next}}};
 await writeFile(new URL(`../scenes/${stage.id}.scene.json`,import.meta.url),JSON.stringify(scene,null,2)+'\n');
 console.log(stage.id,'segments',at);
}
