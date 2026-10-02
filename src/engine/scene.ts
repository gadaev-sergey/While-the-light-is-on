/** Renderer-independent scene document. Metres, degrees, stable IDs; no DOM or Three.js. */
export type Triple=[number,number,number];
export type NodeKind='source'|'prefab'|'box'|'sphere'|'plane'|'point-light'|'spot-light'|'model'|'camera';
export type Layer='architecture'|'props'|'lights'|'details';
export interface Transform {position:Triple;rotation:Triple;scale:Triple}
export interface Surface {texture:string;color:string;roughness:number;metalness:number;repeat:number}
export interface LightData {color:string;intensity:number;range:number;angle:number;penumbra:number;shadows:boolean}
export interface SceneNode {id:string;name:string;kind:NodeKind;asset?:string;layer:Layer;transform:Transform;visible:boolean;locked:boolean;surface?:Surface;light?:LightData;gameId?:string;groupId?:string;folder?:string;components?:ComponentData[]}
export interface ComponentData {type:string;values:Record<string,string|number|boolean>}
export interface SceneGroup {id:string;name:string}
export interface TextureAsset {id:string;name:string;data:string}
export interface CameraSettings {
 projection:'orthographic'|'perspective';fov:number;
 height?:number;distance?:number;centerX?:number;centerY?:number;
 follow?:'adaptive'|'fixed'|'horizontal'|'player';offsetX?:number;offsetY?:number;smoothing?:number;near?:number;far?:number;
}
export const DEFAULT_CAMERA:Readonly<Required<CameraSettings>>={projection:'orthographic',fov:35,height:11.6,distance:18,centerX:.15,centerY:2.05,follow:'adaptive',offsetX:0,offsetY:1.3,smoothing:3,near:.1,far:100};
export const CAMERA_RANGES={height:[2,80],distance:[3,100],centerX:[-1000,1000],centerY:[-1000,1000],offsetX:[-100,100],offsetY:[-100,100],smoothing:[0,20],near:[.01,2],far:[20,2000]} as const;
export const resolveCamera=(settings?:CameraSettings):Required<CameraSettings>=>({...DEFAULT_CAMERA,...settings});
export interface SceneDocument {format:'shelter-scene';version:1|2;template:string;id?:string;activeCamera?:string;moduleData?:Record<string,unknown>;name:string;units:'m';nodes:SceneNode[];groups?:SceneGroup[];camera?:CameraSettings;textures:TextureAsset[];environment:{time:number;haze:number;exposure:number;flashlight:boolean}}
export const SCENE_KEY='shelter-engine-scene-v1',DRAFT_KEY='shelter-engine-draft-v1';
export const TEXTURES=['original','none','tile-0','tile-1','tile-2','tile-3','tile-4','tile-5'];
export const identity=():Transform=>({position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});
export const surface=():Surface=>({texture:'original',color:'#ffffff',roughness:.9,metalness:.05,repeat:1});
export const light=():LightData=>({color:'#ffe2b1',intensity:14,range:6,angle:35,penumbra:.6,shadows:true});
const invalid=(message:string):never=>{throw new Error(message);};
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(v:unknown,max=100)=>typeof v==='string'&&v.length>0&&v.length<=max;
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
/** Validate before replacing a document: failed imports never modify the active scene. */
export function validateScene(value:unknown):SceneDocument {
 if(!value||typeof value!=='object')return invalid('Файл не содержит сцену.');
 const d=value as SceneDocument;
 if(d.format!=='shelter-scene'||![1,2].includes(d.version)||!text(d.template)||d.units!=='m')return invalid('Неподдерживаемый формат или версия сцены.');
 if(!text(d.name)||!Array.isArray(d.nodes)||d.nodes.length>2000||!Array.isArray(d.textures)||d.textures.length>24)return invalid('Некорректное имя или слишком большая сцена.');
 const e=d.environment;
 if(!e||!finite(e.time,0,1439)||!finite(e.haze,0,.2)||!finite(e.exposure,.2,3)||typeof e.flashlight!=='boolean')return invalid('Некорректные настройки окружения.');
 if(d.camera!==undefined&&(!d.camera||!['orthographic','perspective'].includes(d.camera.projection)||!finite(d.camera.fov,15,100)))return invalid('Некорректная камера. FOV должен быть от 15° до 100°.');
 if(d.camera){
  const c=resolveCamera(d.camera);
  if(!['adaptive','fixed','horizontal','player'].includes(c.follow)||Object.entries(CAMERA_RANGES).some(([key,[min,max]])=>!finite(c[key as keyof typeof CAMERA_RANGES],min,max))||c.near>=c.far||c.distance>=c.far)return invalid('Некорректные параметры камеры: проверьте размеры, слежение и дальность видимости.');
 }
 const textureIds=new Set<string>();let bytes=0;
 for(const t of d.textures){
  if(!t||!text(t.id)||!text(t.name)||textureIds.has(t.id)||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t.data)||t.data.length>4000000)return invalid('Некорректная текстура. Поддерживаются PNG, JPEG и WebP до 3 МБ.');
  textureIds.add(t.id);bytes+=t.data.length;
 }
 if(bytes>16000000)return invalid('Общий размер текстур превышает 12 МБ.');
 if(d.nodes.filter(n=>n?.light&&n.visible&&n.light.intensity>0&&n.light.shadows).length>6)return invalid('Одновременно поддерживается до 6 источников с тенями. Отключите тени у остальных.');
 const ids=new Set<string>();
 const groupIds=new Set<string>();
 if(d.groups!==undefined){
  if(!Array.isArray(d.groups)||d.groups.length>500)return invalid('Некорректный список групп.');
  for(const g of d.groups){if(!g||!text(g.id)||!text(g.name)||groupIds.has(g.id))return invalid('Некорректная или повторяющаяся группа.');groupIds.add(g.id);}
 }
 for(const n of d.nodes){
  if(!n||!text(n.id)||ids.has(n.id)||!text(n.name)||!['source','prefab','box','sphere','plane','point-light','spot-light','model','camera'].includes(n.kind)||!['architecture','props','lights','details'].includes(n.layer))return invalid('Некорректный или повторяющийся объект сцены.');
  ids.add(n.id);
  if(groupIds.has(n.id)||n.groupId!==undefined&&!groupIds.has(n.groupId))return invalid('Объект ссылается на неизвестную группу или имеет конфликтующий ID.');
  if(typeof n.visible!=='boolean'||typeof n.locked!=='boolean')return invalid('Некорректное состояние объекта.');
  if(n.gameId!==undefined&&!text(n.gameId))return invalid('Некорректная игровая привязка.');
  for(const key of ['position','rotation','scale'] as const){const v=n.transform?.[key];if(!Array.isArray(v)||v.length!==3||!v.every(v=>finite(v,key==='scale'?.01:-1000,key==='scale'?100:1000)))return invalid('Координаты должны быть конечными числами; масштаб — от 0,01 до 100.');}
  if(['source','model','prefab'].includes(n.kind)&&!text(n.asset,200))return invalid('Не указан ресурс объекта.');
  if(n.folder!==undefined&&!text(n.folder))return invalid('Некорректная папка.');
  if(n.components!==undefined&&(!Array.isArray(n.components)||n.components.length>32||n.components.some(c=>!c||!text(c.type)||!c.values||typeof c.values!=='object'||Object.values(c.values).some(v=>!['string','boolean','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)))))return invalid('Некорректные компоненты.');
  if(n.surface){const s=n.surface;if(!s||!color(s.color)||!finite(s.roughness,0,1)||!finite(s.metalness,0,1)||!finite(s.repeat,.1,20)||!(TEXTURES.includes(s.texture)||textureIds.has(s.texture)||/^asset:[a-zA-Z0-9_-]+$/.test(s.texture)))return invalid('Некорректный материал объекта.');}
  if(n.kind.endsWith('-light')){const l=n.light;if(!l||!color(l.color)||!finite(l.intensity,0,150)||!finite(l.range,.1,30)||!finite(l.angle,5,85)||!finite(l.penumbra,0,1)||typeof l.shadows!=='boolean')return invalid('Некорректный источник света.');}
 }
 if(d.activeCamera&&!d.nodes.some(n=>n.id===d.activeCamera&&n.kind==='camera'))return invalid('Активная камера отсутствует в сцене.');
 if(d.moduleData&&JSON.stringify(d.moduleData).length>1000000)return invalid('Данные модулей превышают 1 МБ.');
 for(const id of groupIds)if(!d.nodes.some(n=>n.groupId===id))return invalid('Группа не содержит объектов.');
 return structuredClone(d);
}
export function parseScene(json:string){if(json.length>20000000)return invalid('Файл сцены слишком большой.');return validateScene(JSON.parse(json));}
export function saveScene(storage:Pick<Storage,'setItem'>,key:string,doc:SceneDocument){storage.setItem(key,JSON.stringify(validateScene(doc)));}
export class SceneHistory {
 past:SceneDocument[]=[];future:SceneDocument[]=[];
 document:SceneDocument;
 constructor(document:SceneDocument){this.document=validateScene(document);}
 commit(next:SceneDocument){const valid=validateScene(next);if(JSON.stringify(valid)===JSON.stringify(this.document))return false;this.past.push(this.document);if(this.past.length>40)this.past.shift();this.document=valid;this.future=[];return true;}
 undo(){const d=this.past.pop();if(!d)return false;this.future.push(this.document);this.document=d;return true;}
 redo(){const d=this.future.pop();if(!d)return false;this.past.push(this.document);this.document=d;return true;}
}

export function emptyScene(name='Новая сцена',template='empty-3d'):SceneDocument {return {format:'shelter-scene',version:2,id:crypto.randomUUID(),template,name,units:'m',nodes:[],textures:[],camera:{...DEFAULT_CAMERA,follow:'fixed'},environment:{time:720,haze:0,exposure:1.3,flashlight:false}};}
