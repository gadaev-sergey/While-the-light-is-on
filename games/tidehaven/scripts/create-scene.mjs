import {writeFile} from 'node:fs/promises';
const nodes=[];
const n=18;
const initial=new Map([['8,8','hall'],['7,8','cottage'],['7,10','cottage']]);
for(let x=4;x<=13;x++)initial.set(`${x},9`,'road');
for(let y=5;y<=13;y++)initial.set(`9,${y}`,'road');
for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const land=x>=2+(y<4?2:0)&&y>=2&&x<=15-(y>11?y-11:0)&&y<=15-(x<5?5-x:0)&&x+y<28;
 const terrain=!land?'water':x<=7&&y<=8?'meadow':((x>=11&&y<=7)||(x<=6&&y>=11)||(y===3&&x>6))?'forest':'grass';
 const building=initial.get(`${x},${y}`);
 nodes.push({id:`tile-${x}-${y}`,name:building||terrain,kind:'box',layer:'architecture',visible:true,locked:false,transform:{position:[x,0,y],rotation:[0,0,0],scale:[1,.2,1]},surface:{texture:'none',color:terrain==='water'?'#63a6ad':terrain==='forest'?'#517d60':'#9cbf82',roughness:.9,metalness:0,repeat:1},components:[{type:'tidehaven.tile',values:{terrain,building:building||''}}]});
}
const scene={format:'shelter-scene',version:2,id:'bay',template:'tidehaven-city-v1',name:'Тихая бухта',units:'m',nodes,textures:[],camera:{projection:'orthographic',fov:35,height:20,distance:35,follow:'fixed'},environment:{time:720,haze:.02,exposure:1,flashlight:false},moduleData:{tidehaven:{size:n}}};
await writeFile(new URL('../scenes/bay.scene.json',import.meta.url),JSON.stringify(scene,null,2)+'\n');
