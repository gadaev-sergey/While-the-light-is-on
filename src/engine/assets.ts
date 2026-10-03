import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {AssetRecord} from './project.ts';
import {disposeTree} from './renderer.ts';
import type {SceneRuntime} from './runtime.ts';
export {GLTF_EXTENSIONS,MODEL_BUDGET,inspectGLTF} from './asset-format.ts';
export class AssetStore {
 models=new Map<string,T.Object3D>();textures=new Map<string,T.Texture>();
 async load(records:AssetRecord[],url:(path:string)=>string,progress=(n:number)=>{}){let i=0;try{for(const a of records){if(this.models.has(a.id)||this.textures.has('asset:'+a.id))continue;
  if(a.type==='model'){const gltf=await new GLTFLoader().loadAsync(url(a.path));const root=gltf.scene;root.scale.multiplyScalar(a.unitScale||1);root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=o.receiveShadow=true;}});const wrapper=new T.Group();wrapper.add(root);this.models.set(a.id,wrapper);}
  if(a.type==='texture'){const t=await new T.TextureLoader().loadAsync(url(a.path));if(t.image.width>4096||t.image.height>4096){t.dispose();throw new Error('Текстура превышает 4096 × 4096.');}t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;this.textures.set('asset:'+a.id,t);}
  if(a.type==='material')for(const [channel,file] of Object.entries(a.maps||{})){const t=await new T.TextureLoader().loadAsync(url(file));if(t.image.width>4096||t.image.height>4096){t.dispose();throw new Error('Карта материала превышает 4096 × 4096.');}t.colorSpace=channel==='baseColor'?T.SRGBColorSpace:T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;this.textures.set('asset:'+a.id+(channel==='baseColor'?'':':'+channel),t);}
  progress(++i/records.length);
 }}catch(e){throw new Error('Не удалось загрузить ресурс: '+(e instanceof Error?e.message:String(e)));}}
 bind(runtime:SceneRuntime){runtime.prototypes=this.models;for(const [id,t] of this.textures)runtime.textures.set(id,t);}
 dispose(){for(const root of this.models.values())disposeTree(root);for(const t of this.textures.values())t.dispose();this.models.clear();this.textures.clear();}
}
