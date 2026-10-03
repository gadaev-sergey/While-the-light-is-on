import * as T from 'three';
import {fromLevel,toLevel} from './layout-adapter.ts';
import {layoutIssues,type Layout} from '@shelter/layout.ts';
import {SceneRuntime,type Source} from '@shelter/runtime.ts';
import {identity,light,validateScene,DEFAULT_CAMERA,type SceneDocument,type SceneNode,type Triple} from '@shelter/scene.ts';
import {DIMENSIONS,layoutUnits,metres} from './game/dimensions.ts';
import type {ThreeRenderer} from './game/renderer-3d.ts';
import type {BaseWorld} from './game/world.ts';
import type {BaseObject,ObjectKind} from './game/types.ts';
const triple=(v:T.Vector3):Triple=>[v.x,v.y,v.z];
const fingerprint=(object:T.Object3D,cut:boolean)=>{let hash=2166136261;const feed=(s:string)=>{for(let i=0;i<s.length;i++)hash=Math.imul(hash^s.charCodeAt(i),16777619);};feed(String(cut));object.traverse(o=>{feed(o.type+o.name+o.position.toArray().join(',')+o.quaternion.toArray().join(',')+o.scale.toArray().join(','));if(o instanceof T.Mesh){feed(o.geometry.type);feed(Array.from(o.geometry.getAttribute('position').array).join(','));}});return (hash>>>0).toString(36);};

export class ShelterSceneRuntime extends SceneRuntime {
 declare renderer:ThreeRenderer;
 declare sources:Map<string,Source & {game?:BaseObject}>;
 private initialObjects:BaseObject[]=[];layoutKey='';
 constructor(renderer:ThreeRenderer,public world:BaseWorld){
  super(renderer);
  this.capture();
 }
 capture(){
  const r=this.renderer,world=this.world;this.initialObjects=structuredClone(world.objects);r.scene.add(this.root);this.root.name='Scene document';
  const nodes:SceneNode[]=[];
  const capture=(object:T.Object3D,index:number,cut:boolean)=>{
   const game=this.initialObjects.find(o=>r.objects.get(o.id)===object);
   const door=world.doors.find(d=>r.doors.get(d.id)===object),board=world.openings.find(o=>r.boards.get(o.id)===object);
   const baseAsset=game?`house/object/${game.id}`:door?`house/door/${door.id}`:board?`house/opening/${board.id}`:`house/${cut?'cut':'mesh'}/${fingerprint(object,cut)}`;
   let asset=baseAsset,suffix=1;while(this.sources.has(asset))asset=baseAsset+'/'+suffix++;
   const pos=triple(object.position),wrapper=new T.Group();wrapper.position.copy(object.position);object.position.set(0,0,0);
   const prototype=object.clone(true);prototype.visible=true;object.parent!.add(wrapper);wrapper.add(object);wrapper.userData.sceneNode=asset;
   const layer=game?'props':cut||object.name.includes('лестница')||object.name.includes('Лестница')?'architecture':object instanceof T.Group&&!door?'details':'architecture';
   const floor=Math.round(pos[1]/metres(r.level.floorHeight));
   const name=game?.name||door?.name||object.name||`${object instanceof T.Mesh&&object.geometry.type==='ExtrudeGeometry'?'Стена':object instanceof T.Mesh&&object.geometry.type==='CylinderGeometry'?'Стойка':'Деталь'} ${index+1} · ${floor<0?'подвал':floor===0?'1 этаж':'2 этаж'}`;
   this.sources.set(asset,{prototype,wrapper,game,cut});
   nodes.push({id:asset,asset,gameId:game?.id,name,kind:'source',layer,transform:{...identity(),position:pos},visible:board?board.state==='boarded':true,locked:false});
  };
  [...r.structure.children].forEach((o,i)=>capture(o,i,false));[...r.cutScene.children].forEach((o,i)=>capture(o,i,true));
  r.poweredLights.forEach((l,i)=>{l.visible=false;nodes.push({id:`room-light-${i}`,name:`Лампа · ${r.level.rooms[i]?.name||i+1}`,kind:'point-light',layer:'lights',transform:{...identity(),position:triple(l.position)},visible:true,locked:false,light:{...light(),intensity:0,range:4.3}});});
  this.initial={format:'shelter-scene',version:1,template:'shelter-house-v1',name:'Дом на окраине',units:'m',nodes,camera:{...DEFAULT_CAMERA},textures:[],environment:{time:720,haze:.052,exposure:1.3,flashlight:false}};
  this.initial.moduleData={layout:fromLevel(this.world.level)};this.initial.version=2;this.layoutKey=JSON.stringify(this.initial.moduleData.layout);
  this.document=structuredClone(this.initial);
 }
 override validate(input:SceneDocument){
  let doc=validateScene(input);const layout=doc.moduleData?.layout as Layout|undefined;
  if(layout){const malformed=layoutIssues(layout).find(i=>i.id==='layout');if(malformed)throw new Error(malformed.message);}
  if(layout&&JSON.stringify(layout)!==this.layoutKey&&!layoutIssues(layout).length){
   for(const instance of this.instances.values())this.disposeInstance(instance);this.instances.clear();this.sources.clear();
   const r=this.renderer;for(const container of [r.structure,r.cutScene]){container.traverse(o=>{if(o instanceof T.Mesh)o.geometry.dispose();});container.clear();}
   for(const l of r.poweredLights){l.removeFromParent();l.shadow.dispose();}r.poweredLights=[];r.objects.clear();r.doors.clear();r.boards.clear();
   this.world.level=toLevel(layout);this.world.reset();r.level=this.world.level;r.buildLevel();this.capture();this.layoutKey=JSON.stringify(layout);
   const geometry=this.initial.nodes.filter(n=>n.kind==='source'&&!n.gameId).map(n=>doc.nodes.find(old=>old.id===n.id)||n),previousProps=doc.nodes.filter(n=>n.kind!=='source'||!!n.gameId);
   doc.nodes=[...geometry,...previousProps];
  }
  return super.validate(doc);
 }
 override instantiate(n:SceneNode){
  if(n.kind==='prefab')this.prefabs.set(n.asset!,()=>this.renderer.models.furniture({id:n.id,name:n.name,kind:n.asset as ObjectKind,x:0,floor:0,width:1,height:1,frame:0,atlas:'interior',searched:false,uses:0}));
  return super.instantiate(n);
 }
 override apply(document:SceneDocument){
  super.apply(document);
  const doc=this.document,objects:BaseObject[]=[];
  this.renderer.objects.clear();
  for(const n of doc.nodes){
   const source=n.kind==='source'?this.sources.get(n.asset!):undefined;
   if(n.visible&&(source?.game||n.kind==='prefab')){
    const base=source?.game,kind=(base?.kind||n.asset) as ObjectKind,id=base&&n.id===n.asset?base.id:`scene/${n.id}`;
    const existing=this.world.objects.find(o=>o.id===id),size=DIMENSIONS.furniture[kind];
    const o:BaseObject={id,name:n.name,kind,x:layoutUnits(n.transform.position[0])+1000,floor:Math.round(n.transform.position[1]/metres(this.renderer.level.floorHeight)),atlas:'interior',frame:base?.frame||0,width:layoutUnits(size.width*n.transform.scale[0]),height:layoutUnits(size.height*n.transform.scale[1]),searched:existing?.searched||false,uses:existing?.uses||0};
    objects.push(o);this.renderer.objects.set(id,this.instances.get(n.id)!.root);
   }
  }
  this.world.level={...this.world.level,objects:objects.map(o=>({...o,searched:false,uses:0}))};this.world.objects=objects;this.world.setTime(doc.environment.time);this.world.flashlight=doc.environment.flashlight;this.world.refreshSight();
  this.renderer.postMaterial.uniforms.hazeDensity.value=doc.environment.haze;
 }
 override beforeRender(editing:boolean){
  super.beforeRender(editing);
  for(const l of this.renderer.poweredLights)l.visible=false;
  for(const [id,instance] of this.instances){const n=this.document.nodes.find(n=>n.id===id)!;
   if(!editing&&id.startsWith('room-light-')&&n.light){const lamp=instance.root.children.find(c=>c instanceof T.Light) as T.PointLight;lamp.intensity=n.light.intensity||(this.world.powered?3:0);lamp.visible=lamp.intensity>0;}
   if(!editing&&this.renderer.objects.has(n.gameId||`scene/${id}`))instance.root.visible=n.visible&&this.world.visibleObjects().some(o=>o.id===(n.gameId||`scene/${id}`));
   if(editing&&n.kind==='source')for(const child of instance.root.children)child.visible=true;
  }
 }
}
