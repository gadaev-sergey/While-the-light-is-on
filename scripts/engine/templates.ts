import {randomUUID} from 'node:crypto';
import {emptyScene,identity,light} from '../../src/engine/scene.ts';
import type {ProjectSnapshot} from '../../src/engine/project.ts';
export function template(name:string,kind:string):ProjectSnapshot {
 const scene=emptyScene('Главная сцена',kind),id=scene.id!;scene.camera={projection:kind==='empty-3d'?'perspective':'orthographic',fov:45,height:10,distance:18,centerX:0,centerY:2,follow:'fixed'};
 scene.nodes.push({id:'camera',name:'Игровая камера',kind:'camera',layer:'details',visible:true,locked:false,transform:{...identity(),position:[0,2,18]}});scene.activeCamera='camera';
 if(kind==='neutral-25d'){scene.moduleData={layout:{version:1,floorHeight:3,rooms:[{id:'room-1',name:'Главная комната',x:-4,width:8,floor:0,depth:4,color:'#858880'}],doors:[],stairs:[],openings:[],spawn:{x:0,floor:0}}};scene.nodes.push({id:'lamp',name:'Лампа',kind:'point-light',layer:'lights',visible:true,locked:false,transform:{...identity(),position:[1,2.5,0]},light:light()});}
 if(kind==='while-light'){scene.nodes=[];delete scene.activeCamera;scene.template='shelter-house-v1';scene.moduleData={legacySeed:true};}
 const projectId=randomUUID();return {manifest:{format:'shelter-project',version:1,sdk:1,projectId,name,gameVersion:'1.0.0',scenes:[{id,name:scene.name,path:`scenes/${id}.scene.json`}],startScene:id,assets:[],modules:kind==='while-light'?[{id:'while-light',version:1,runtime:'scripts/runtime.ts',editor:'scripts/editor.ts',assets:['assets']}]:[{id:'shelter.basic',version:1,runtime:'builtin:basic'}],build:{target:'web',mode:'release',base:'./',output:'',scenes:[id],dynamicAssets:[],appId:'game.'+projectId}},scenes:{[id]:scene}};
}
