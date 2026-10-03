import {writeFile} from 'node:fs/promises';
const nodes=[];
function box(id,x,z,w,d,h,style){nodes.push({id,name:style==='pillar'?'Опора собора':'Бронеблок',kind:'box',layer:'architecture',visible:true,locked:false,transform:{position:[x,h/2,z],rotation:[0,0,0],scale:[w,h,d]},surface:{texture:'none',color:'#484248',roughness:.9,metalness:.2,repeat:1},components:[{type:'hellrift.cover',values:{style}}]});}
for(const x of [-11,11])for(const z of [-12,0,12])box(`pillar-${x}-${z}`,x,z,2.5,2.5,9,'pillar');
for(const [x,z,w,d] of [[-4,-7,4,2],[7,-8,2,4],[-6,7,2,4],[5,7,4,2]])box(`cover-${x}-${z}`,x,z,w,d,2.4,'bunker');
for(const [i,x,z] of [[0,0,-21],[1,-21,0],[2,21,0],[3,0,21]])nodes.push({id:'rift-'+i,name:'Разлом '+(i+1),kind:'box',layer:'props',visible:true,locked:false,transform:{position:[x,2,z],rotation:[0,0,0],scale:[3,4,.5]},components:[{type:'hellrift.portal',values:{}}]});
const scene={format:'shelter-scene',version:2,id:'arena',template:'hellrift-arena-v1',name:'Собор пепла',units:'m',nodes,textures:[],camera:{projection:'perspective',fov:78,height:2,distance:3,follow:'fixed'},environment:{time:0,haze:.02,exposure:1,flashlight:false},moduleData:{hellrift:{size:46,spawn:[0,14]}}};
await writeFile(new URL('../scenes/arena.scene.json',import.meta.url),JSON.stringify(scene,null,2)+'\n');
