import type {EngineModule} from '../engine/sdk.ts';
export const basic:EngineModule={id:'shelter.basic',sdk:1,components:[
 {id:'basic.rotate',name:'Вращение',fields:[{name:'speed',label:'Скорость',type:'number',default:30,min:-360,max:360,unit:'°/с'},{name:'axis',label:'Ось',type:'select',default:'y',options:[{value:'x',label:'X'},{value:'y',label:'Y'},{value:'z',label:'Z'}]}],update:({runtime,node,component},dt)=>{const root=runtime.instances.get(node.id)!.root;root.rotation[component.values.axis as 'x'|'y'|'z']+=Number(component.values.speed)*Math.PI/180*dt;}},
 {id:'basic.portal',name:'Переход в сцену',fields:[{name:'scene',label:'Куда перейти',type:'scene',default:''},{name:'label',label:'Надпись кнопки',type:'string',default:'Следующая сцена'}]},
 {id:'basic.bob',name:'Плавное покачивание',fields:[{name:'height',label:'Высота',type:'number',default:.2,min:0,max:3,unit:'м'},{name:'speed',label:'Скорость',type:'number',default:1,min:0,max:5}],update:({runtime,node,component},dt)=>{const o=runtime.instances.get(node.id)!.root;o.userData.time=(o.userData.time||0)+dt;o.position.y=node.transform.position[1]+Math.sin(o.userData.time*Number(component.values.speed))*Number(component.values.height);}},
 ]};
export default basic;
