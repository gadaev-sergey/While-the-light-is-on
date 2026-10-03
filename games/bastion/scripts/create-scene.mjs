import {writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);let serial=0;const nodes=[];
function add(kind,x,y,w,h,values={},name=kind){nodes.push({id:`castle-${serial++}`,name,kind:'box',layer:kind==='cover'?'architecture':'props',visible:true,locked:false,transform:{position:[x/64,-y/64,0],rotation:[0,0,0],scale:[w/64,h/64,.8]},surface:{texture:'none',color:'#59635c',roughness:.9,metalness:0,repeat:1},components:[{type:`bastion.${kind}`,values}]});}
// Broken cloister: four entrances, a protected inner loop and a broad outer loop.
for(const x of [960,1440])for(const y of [620,1300])add('cover',x,y,240,64,{style:'wall'},'Стена монастырского двора');
for(const x of [840,1560])for(const y of [765,1155])add('cover',x,y,64,220,{style:'wall'},'Боковая стена с проходом');
for(const x of [840,1560])for(const y of [620,1300])add('cover',x,y,96,96,{style:'tower'},'Башня двора');
add('cover',1200,900,100,100,{style:'fountain'},'Колодец клятвы');
add('cover',1200,290,360,180,{style:'chapel'},'Часовня');
add('cover',450,1450,270,150,{style:'forge'},'Кузница');
add('cover',1890,1480,280,130,{style:'ruin'},'Разрушенная казарма');
for(const [x,y] of [[1850,480],[2050,480],[1850,700],[2050,700],[1945,920]])add('cover',x,y,65,95,{style:'grave'},'Надгробие');
for(const [x,y,w,h] of [[460,400,200,50],[350,1060,170,60],[610,760,65,180],[1890,1150,210,55],[470,1670,140,55],[1620,1630,140,55]])add('cover',x,y,w,h,{style:'wall'},'Разбитая ограда');
for(const [x,y] of [[300,620],[490,910],[340,830],[660,400],[2140,1380],[1700,340]])add('cover',x,y,64,64,{style:'tree'},'Старый ясень');
add('spawn',1200,1130,32,32,{},'Последний страж');
for(const [x,y,kind] of [[1200,1010,'well'],[660,1470,'arrows'],[1200,460,'mana'],[1200,1640,'bell']])add('station',x,y,55,55,{kind},'Место силы · '+kind);
for(const [x,y] of [[170,260],[1200,140],[2220,290],[2220,1030],[2200,1730],[1200,1760],[180,1740],[160,1000]])add('gate',x,y,70,70,{},'Разлом тумана');
const scene={format:'shelter-scene',version:2,id:'castle',template:'bastion-survival-v1',name:'Крепость Серого Ордена',units:'m',nodes,textures:[],camera:{projection:'orthographic',fov:35,height:24,distance:30,centerX:18.75,centerY:-15,follow:'player'},environment:{time:1320,haze:.06,exposure:1,flashlight:false},moduleData:{bastion:{version:1,width:2400,height:1920,zones:[{name:'ЯСЕНЕВАЯ РОЩА',x:440,y:700},{name:'СТАРАЯ ЧАСОВНЯ',x:1200,y:480},{name:'КЛАДБИЩЕ КОРОЛЕЙ',x:1940,y:600},{name:'ДВОР КЛЯТВЫ',x:1200,y:1080},{name:'КУЗНЕЧНЫЙ ДВОР',x:500,y:1540},{name:'РУИНЫ КАЗАРМЫ',x:1900,y:1550},{name:'ЮЖНЫЕ ВРАТА',x:1200,y:1650}]}}};
await writeFile(new URL('scenes/castle.scene.json',root),JSON.stringify(scene,null,2)+'\n');
