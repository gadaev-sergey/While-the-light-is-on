import {validateScene, type SceneDocument} from './scene.ts';

export const SDK_VERSION = 1;
export interface AssetRecord {
 id:string; name:string; type:'model'|'texture'|'material'|'composition'; path:string; dependencies:string[];
 bytes:number; version:string; source?:{id:string;version:string}; author:string; license:string;
 category:string; tags:string[]; description:string; dimensions?:number[]; triangles?:number;
 preview?:string; unitScale?:number; surface?:import('./scene.ts').Surface;
 maps?:Partial<Record<'baseColor'|'normal'|'roughness'|'metalness'|'ao',string>>;
}
export interface ProjectModule {id:string;version:number;runtime:string;editor?:string;assets?:string[]}
export interface ProjectManifest {
 format:'shelter-project'; version:1; sdk:1; projectId:string; name:string; gameVersion:string;
 scenes:{id:string;name:string;path:string}[]; startScene:string; assets:AssetRecord[]; modules:ProjectModule[];
 build:{target:'web';mode:'development'|'release';base:string;output:string;scenes:string[];dynamicAssets:string[];appId:string};
}
export interface ProjectSnapshot {manifest:ProjectManifest;scenes:Record<string,SceneDocument>}
export interface ProjectSession extends ProjectSnapshot {token:string;path:string;revision:string;moduleUrls:{runtime:string;editor?:string}[]}
export interface ProjectStorage {open(path:string):Promise<ProjectSession>;save(session:ProjectSession):Promise<ProjectSession>}
export interface BuildResult {id:string;status:'running'|'success'|'error'|'cancelled';stage:string;progress:number;log:string[];output?:string;preview?:string;archive?:string;error?:string}
export interface BuildService {start(session:ProjectSession):Promise<BuildResult>;cancel(id:string):Promise<void>}
export function portablePath(path:unknown):path is string {return typeof path==='string'&&path.length>0&&path.length<400&&!path.startsWith('/')&&!path.includes('\\')&&!path.includes(':')&&!path.includes('\0')&&path.split('/').every(p=>p!=='.'&&p!=='..'&&!!p);}
export function validateProject(value:unknown):ProjectManifest {
 const p=value as ProjectManifest,fail=(m:string):never=>{throw new Error(m);};
 if(!p||p.format!=='shelter-project'||p.version!==1||p.sdk!==SDK_VERSION)fail('Несовместимая версия проекта или SDK. Исходные файлы сохранены.');
 if(!p.projectId||!p.name?.trim()||p.name.length>100||!p.gameVersion)fail('Укажите имя и версию проекта.');
 if(!Array.isArray(p.scenes)||!p.scenes.length||p.scenes.length>100||!Array.isArray(p.assets)||p.assets.length>2000||!Array.isArray(p.modules))fail('Некорректный реестр проекта.');
 for(const list of [p.scenes,p.assets,p.modules])if(new Set(list.map(x=>x.id)).size!==list.length)fail('Повторяющийся идентификатор в проекте.');
 if(!p.scenes.some(s=>s.id===p.startScene))fail('Стартовая сцена отсутствует.');
 for(const s of p.scenes)if(!/^[\w-]+$/.test(s.id)||!s.name||!portablePath(s.path)||!s.path.startsWith('scenes/'))fail('Некорректный путь сцены.');
 for(const a of p.assets)if(!/^[\w-]+$/.test(a.id)||!portablePath(a.path)||!a.path.startsWith('assets/')||!Array.isArray(a.dependencies)||a.dependencies.some(d=>!portablePath(d)||!d.startsWith('assets/'))||!Number.isFinite(a.bytes)||a.bytes<0||!['model','texture','material','composition'].includes(a.type)||!a.name||!a.version||!Array.isArray(a.tags)||a.maps&&Object.entries(a.maps).some(([k,v])=>!['baseColor','normal','roughness','metalness','ao'].includes(k)||!a.dependencies.includes(v)))fail('Некорректный ресурс: '+a.name);
 for(const m of p.modules)if(m.version!==1||!(m.runtime==='builtin:basic'||portablePath(m.runtime)&&m.runtime.startsWith('scripts/'))||m.editor&&(!portablePath(m.editor)||!m.editor.startsWith('scripts/')))fail('Несовместимый модуль: '+m.id);
 const b=p.build;
 if(!b||b.target!=='web'||!['development','release'].includes(b.mode)||!Array.isArray(b.scenes)||!Array.isArray(b.dynamicAssets)||typeof b.output!=='string'||typeof b.appId!=='string'||!b.appId||!(/^(\.\/|\/(?:[\w.-]+\/)*)$/).test(b.base))fail('Проверьте настройки Web-сборки и базовый путь.');
 if(!b.scenes.includes(p.startScene)||b.scenes.some(id=>!p.scenes.some(s=>s.id===id)))fail('Стартовая сцена должна входить в сборку.');
 if(b.dynamicAssets.some(id=>!p.assets.some(a=>a.id===id)))fail('Динамический ресурс отсутствует.');
 return structuredClone(p);
}
export function validateSnapshot(value:ProjectSnapshot){
 const manifest=validateProject(value.manifest),scenes:Record<string,SceneDocument>={};
 for(const s of manifest.scenes){scenes[s.id]=validateScene(value.scenes[s.id]);for(const n of scenes[s.id].nodes){
  if(n.kind==='model'&&!manifest.assets.some(a=>a.id===n.asset&&a.type==='model'))throw new Error('Модель отсутствует: '+n.name);
  if(n.surface?.texture.startsWith('asset:')&&!manifest.assets.some(a=>a.id===n.surface!.texture.slice(6)))throw new Error('Текстура отсутствует: '+n.name);
 }}
 return {manifest,scenes};
}
export function storageKey(projectId:string,scope:string,sceneId=''){return `shelter:${projectId}:${scope}:${sceneId}`;}
