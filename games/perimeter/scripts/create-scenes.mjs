import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const specs=[
 {id:'dock',name:'Грузовой терминал',subtitle:'Верни питание внешнему контуру',theme:0,boss:'ПРИВРАТНИК',next:'foundry',width:1920,height:1280,
  cover:[[500,340,230,115,'container'],[1180,340,230,115,'container'],[510,850,230,115,'container'],[1190,850,230,115,'container'],[900,560,120,160,'reactor'],[270,620,100,100,'crate'],[1530,620,100,100,'crate']],
  decor:[[400,210,300,40],[1180,1060,310,40],[1600,360,90,210]],spawn:[950,1040],gate:[960,150],ports:[[180,200],[1730,200],[180,1080],[1740,1080],[960,180]]},
 {id:'foundry',name:'Литейный блок',subtitle:'Отключи фабрику автономных машин',theme:1,boss:'КУЗНЕЦ',next:'core',width:2080,height:1400,
  cover:[[400,330,140,240,'machine'],[1510,830,140,240,'machine'],[920,320,250,110,'container'],[910,970,250,110,'container'],[390,960,200,100,'crate'],[1490,330,200,100,'crate'],[860,640,100,130,'reactor'],[1120,640,100,130,'reactor']],
  decor:[[150,520,45,390],[1860,500,45,390],[710,120,600,40]],spawn:[1040,1200],gate:[1040,160],ports:[[180,210],[1880,210],[190,1210],[1880,1210],[1040,180]]},
 {id:'core',name:'Сердце периметра',subtitle:'Уничтожь источник нулевого сигнала',theme:2,boss:'НОЛЬ',next:'',width:2160,height:1440,
  cover:[[450,380,200,110,'server'],[1510,380,200,110,'server'],[440,970,200,110,'server'],[1510,970,200,110,'server'],[310,650,110,160,'reactor'],[1740,650,110,160,'reactor'],[980,340,200,70,'crate'],[980,1030,200,70,'crate']],
  decor:[[740,650,80,140],[1340,650,80,140]],spawn:[1080,1240],gate:[1080,170],ports:[[190,200],[1960,200],[190,1230],[1960,1230],[1080,200]]},
];
await mkdir(root+'scenes',{recursive:true});
for(const s of specs){let serial=0;const nodes=[];
 const add=(kind,x,y,w,h,values={},name=kind)=>nodes.push({id:s.id+'-'+kind+'-'+serial++,name,kind:'box',layer:kind==='cover'?'architecture':'props',visible:true,locked:false,transform:{position:[x/64,-y/64,0],rotation:[0,0,0],scale:[w/64,h/64,.8]},surface:{texture:'none',color:kind==='spawn'?'#b9f3df':kind==='gate'?'#e8c77c':'#344749',roughness:.8,metalness:.2,repeat:1},components:[{type:'perimeter.'+kind,values}]});
 for(const [x,y,w,h,style] of s.cover)add('cover',x+w/2,y+h/2,w,h,{style},'Укрытие · '+style);
 for(const [x,y,w,h] of s.decor)add('decoration',x+w/2,y+h/2,w,h,{},'Разметка / техническая зона');
 add('spawn',...s.spawn,40,40,{},'Точка входа');add('gate',...s.gate,170,70,{next:s.next},'Секторный шлюз');
 for(const p of s.ports)add('port',...p,60,60,{},'Точка появления машин');
 const scene={format:'shelter-scene',version:2,id:s.id,template:'perimeter-shooter-v1',name:s.name,units:'m',nodes,textures:[],camera:{projection:'orthographic',fov:35,height:22,distance:30,centerX:s.width/128,centerY:-s.height/128,follow:'player'},environment:{time:1320,haze:.04,exposure:1,flashlight:false},moduleData:{perimeter:{version:1,width:s.width,height:s.height,theme:s.theme,subtitle:s.subtitle,boss:s.boss}}};
 await writeFile(root+'scenes/'+s.id+'.scene.json',JSON.stringify(scene,null,2)+'\n');}
const manifest={format:'shelter-project',version:1,sdk:1,projectId:'perimeter-zero-signal',name:'ПЕРИМЕТР · Нулевой сигнал',gameVersion:'1.0.0',startScene:'dock',scenes:specs.map(s=>({id:s.id,name:s.name,path:'scenes/'+s.id+'.scene.json'})),assets:[],modules:[{id:'perimeter',version:1,runtime:'scripts/runtime.ts'}],build:{target:'web',mode:'release',base:'./',output:'',scenes:specs.map(s=>s.id),dynamicAssets:[],appId:'game.perimeter-zero-signal'}};
await writeFile(root+'project.shelter.json',JSON.stringify(manifest,null,2)+'\n');
console.log('Perimeter: 3 native Shelter scenes.');
