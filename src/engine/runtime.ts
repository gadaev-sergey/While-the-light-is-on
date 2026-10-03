import * as T from 'three';
import {emptyScene,validateScene,resolveCamera,type SceneDocument,type SceneNode,type Surface,type Triple} from './scene.ts';
import type {SceneRenderer} from './renderer.ts';
export const PREFAB_NAMES:Record<string,string>={box:'Куб',sphere:'Сфера',plane:'Панель','point-light':'Точечный свет','spot-light':'Прожектор',camera:'Камера'};
export interface Source {prototype:T.Object3D;wrapper:T.Group;cut:boolean}
export interface Instance {root:T.Group;key:string;surfaceKey:string;ownedMaterials:Set<T.Material>;ownedTextures:Set<T.Texture>;originals:Map<T.Mesh,T.Material|T.Material[]>;ownsGeometry:boolean;ownsMaterials:boolean}
/** The same document adapter serves the editor and every delivered game. */
export class SceneRuntime {
 sources=new Map<string,Source>();instances=new Map<string,Instance>();root=new T.Group();
 prototypes=new Map<string,T.Object3D>();textures=new Map<string,T.Texture>();prefabs=new Map<string,()=>T.Object3D>();
 validators:((document:SceneDocument)=>void)[]=[];initial=emptyScene();document:SceneDocument=emptyScene();revision=0;
 constructor(public renderer:SceneRenderer){renderer.scene.add(this.root);}
 validate(document:SceneDocument){const d=validateScene(document);for(const validate of this.validators)validate(d);for(const n of d.nodes){
  if(n.kind==='source'&&!this.sources.has(n.asset!))throw new Error('Исходный ресурс недоступен: '+n.name);
  if(n.kind==='model'&&!this.prototypes.has(n.asset!))throw new Error('Модель не загружена: '+n.name);
 }return d;}
 apply(document:SceneDocument){
  const doc=this.validate(document);this.document=doc;const ids=new Set(doc.nodes.map(n=>n.id));
  for(const [id,instance] of this.instances)if(!ids.has(id)){this.disposeInstance(instance);this.instances.delete(id);}
  for(const s of this.sources.values())s.wrapper.visible=false;
  for(const n of doc.nodes){const key=n.kind+':'+(n.asset||'');let instance=this.instances.get(n.id);
   if(instance&&instance.key!==key){this.disposeInstance(instance);this.instances.delete(n.id);instance=undefined;}
   if(!instance){instance=this.instantiate(n);this.instances.set(n.id,instance);}
   const root=instance.root;root.position.fromArray(n.transform.position);root.rotation.set(...n.transform.rotation.map(T.MathUtils.degToRad) as Triple);root.scale.fromArray(n.transform.scale);root.visible=n.visible;root.name=n.name;root.userData.sceneNode=n.id;root.updateMatrixWorld(true);this.applySurface(instance,n.surface);
   if(n.light){const l=root.children.find(c=>c instanceof T.Light) as T.PointLight|T.SpotLight;l.color.set(n.light.color);l.intensity=n.light.intensity;l.distance=n.light.range;l.castShadow=n.light.shadows&&n.light.intensity>0;if(l instanceof T.SpotLight){l.angle=T.MathUtils.degToRad(n.light.angle);l.penumbra=n.light.penumbra;}}
  }
  this.renderer.gl.toneMappingExposure=doc.environment.exposure;this.renderer.cameraSettings=resolveCamera(doc.camera);if(!this.renderer.editorMode||!this.renderer.externalCamera)this.renderer.configureCamera(doc.camera);this.revision++;
 }
 instantiate(n:SceneNode):Instance{
  let root=new T.Group(),ownsGeometry=false;
  if(n.kind==='source'){const s=this.sources.get(n.asset!)!;if(n.id===n.asset)root=s.wrapper;else{root.add(s.prototype.clone(true));(s.cut?this.renderer.cutScene:this.root).add(root);}}
  else {this.root.add(root);
   if(n.kind==='model')root.add(this.prototypes.get(n.asset!)!.clone(true));
   else if(n.kind==='prefab'){ownsGeometry=true;const factory=this.prefabs.get(n.asset!);if(!factory)throw new Error('Шаблон не зарегистрирован: '+n.asset);root.add(factory());}
   else if(n.kind.endsWith('-light')){const l=n.kind==='spot-light'?new T.SpotLight():new T.PointLight();l.decay=2;l.shadow.mapSize.set(512,512);l.shadow.camera.near=.05;l.shadow.normalBias=.012;root.add(l);if(l instanceof T.SpotLight){l.target.position.set(0,0,-1);root.add(l.target);}}
   else if(n.kind==='camera')root.userData.camera=true;
   else {ownsGeometry=true;const g=n.kind==='sphere'?new T.SphereGeometry(.5,24,16):n.kind==='plane'?new T.BoxGeometry(1,1,.04):new T.BoxGeometry(1,1,1);const mesh=new T.Mesh(g,new T.MeshStandardMaterial({color:0x8c9291,roughness:.9}));mesh.position.y=.5;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
  }
  const originals=new Map<T.Mesh,T.Material|T.Material[]>();root.traverse(o=>{if(o instanceof T.Mesh)originals.set(o,o.material);});
  return {root,key:n.kind+':'+(n.asset||''),surfaceKey:'',ownedMaterials:new Set(),ownedTextures:new Set(),originals,ownsGeometry,ownsMaterials:n.kind!=='prefab'};
 }
 applySurface(instance:Instance,s?:Surface){
  const custom=s&&this.document.textures.find(t=>t.id===s.texture),key=JSON.stringify(s||null)+(custom?.data||'');if(key===instance.surfaceKey)return;instance.surfaceKey=key;
  for(const m of instance.ownedMaterials)m.dispose();for(const t of instance.ownedTextures)t.dispose();instance.ownedMaterials.clear();instance.ownedTextures.clear();
  let upload:T.Texture|undefined;if(custom){upload=new T.TextureLoader().load(custom.data);upload.colorSpace=T.SRGBColorSpace;upload.wrapS=upload.wrapT=T.RepeatWrapping;upload.repeat.setScalar(s!.repeat);instance.ownedTextures.add(upload);}
  for(const [mesh,original] of instance.originals){if(!s){mesh.material=original;continue;}const materials=(Array.isArray(original)?original:[original]).map(old=>{
   const mat=old instanceof T.MeshStandardMaterial?old.clone():new T.MeshStandardMaterial({side:old.side});mat.color.set(s.color);mat.roughness=s.roughness;mat.metalness=s.metalness;
   const texture=s.texture==='original'?(old as T.MeshStandardMaterial).map:this.textures.get(s.texture);mat.map=null;
   if(upload)mat.map=upload;else if(texture){mat.map=texture.clone();mat.map.wrapS=mat.map.wrapT=T.RepeatWrapping;mat.map.repeat.setScalar(s.repeat);mat.map.needsUpdate=true;instance.ownedTextures.add(mat.map);}
   if(s.texture!=='original')for(const [channel,field] of [['normal','normalMap'],['roughness','roughnessMap'],['metalness','metalnessMap'],['ao','aoMap']] as const){const map=this.textures.get(s.texture+':'+channel);mat[field]=null;if(map){const copy=map.clone();copy.repeat.setScalar(s.repeat);copy.needsUpdate=true;mat[field]=copy;instance.ownedTextures.add(copy);}}
   instance.ownedMaterials.add(mat);return mat;
  });mesh.material=Array.isArray(original)?materials:materials[0];}
 }
 beforeRender(_editing:boolean){const active=new Set(this.document.nodes.map(n=>n.id));for(const [id,s] of this.sources)if(!active.has(id))s.wrapper.visible=false;for(const n of this.document.nodes)this.instances.get(n.id)!.root.visible=n.visible;}
 disposeInstance(instance:Instance){
  for(const [mesh,original] of instance.originals)mesh.material=original;
  for(const m of instance.ownedMaterials)m.dispose();for(const t of instance.ownedTextures)t.dispose();
  if([...this.sources.values()].some(s=>s.wrapper===instance.root)){instance.root.visible=false;return;}
  instance.root.removeFromParent();instance.root.traverse(o=>{if(instance.ownsGeometry&&o instanceof T.Mesh){o.geometry.dispose();if(instance.ownsMaterials)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}if(o instanceof T.PointLight||o instanceof T.SpotLight)o.shadow.dispose();});
 }
 dispose(){for(const i of this.instances.values())this.disposeInstance(i);this.instances.clear();this.root.removeFromParent();}
}
