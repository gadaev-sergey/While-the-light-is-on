import type {SceneDocument,SceneNode,ComponentData} from './scene.ts';
import type {ProjectManifest,ProjectSnapshot} from './project.ts';
import type {SceneRenderer} from './renderer.ts';
import type {SceneRuntime} from './runtime.ts';
export interface FieldSchema {name:string;label:string;type:'number'|'string'|'boolean'|'object'|'asset'|'scene'|'select';default:string|number|boolean;min?:number;max?:number;step?:number;unit?:string;options?:{value:string;label:string}[]}
export interface BehaviorContext {node:SceneNode;component:ComponentData;runtime:SceneRuntime;scene:SceneDocument;transition:(sceneId:string)=>void;keys:ReadonlySet<string>}
export interface ComponentType {id:string;name:string;fields:FieldSchema[];load?:(ctx:BehaviorContext)=>void;update?:(ctx:BehaviorContext,dt:number)=>void;pause?:(ctx:BehaviorContext)=>void;dispose?:(ctx:BehaviorContext)=>void}
export class ModuleRegistry {
 components=new Map<string,ComponentType>();modules=new Map<string,EngineModule>();
 register(module:EngineModule){if(module.sdk!==1||this.modules.has(module.id))throw new Error('Несовместимый или повторяющийся модуль: '+module.id);this.modules.set(module.id,module);for(const c of module.components||[]){if(this.components.has(c.id))throw new Error('Повторяющийся компонент '+c.id);this.components.set(c.id,c);}}
 validate(scene:SceneDocument,project:ProjectManifest){for(const module of this.modules.values())module.validateScene?.(scene,project);for(const n of scene.nodes)for(const c of n.components||[]){const schema=this.components.get(c.type);if(!schema)throw new Error('Отсутствует компонент «'+c.type+'» у «'+n.name+'».');for(const f of schema.fields){const v=c.values[f.name];if(f.type==='number'&&(typeof v!=='number'||!Number.isFinite(v)||v<(f.min??-Infinity)||v>(f.max??Infinity)))throw new Error(n.name+': проверьте «'+f.label+'».');if(f.type==='boolean'&&typeof v!=='boolean')throw new Error('Некорректный переключатель '+f.label);if(f.type==='object'&&v&&!scene.nodes.some(n=>n.id===v)||f.type==='scene'&&!project.scenes.some(s=>s.id===v)||f.type==='asset'&&v&&!project.assets.some(a=>a.id===v)||f.type==='select'&&!f.options?.some(o=>o.value===v))throw new Error(n.name+': не найдена связь «'+f.label+'».');}}}
}
export interface EditorHost {renderer:SceneRenderer;runtime:SceneRuntime;floorHeight:number;floorNames:{value:number;name:string}[];prefabs:Record<string,string>;supportedComponents?:string[];draw:(dt:number)=>void;updateCamera:(dt:number)=>void;dispose:()=>void;helper?:(visible:boolean)=>void;helperVisible?:()=>boolean;flashlight?:boolean}
export interface RuntimeSession {pause(paused:boolean):void;dispose():void;diagnostics?():unknown}
export interface SessionOptions {container:HTMLElement;snapshot:ProjectSnapshot;sceneId:string;registry:ModuleRegistry;assetUrl:(path:string)=>string;savePolicy:'isolated'|'persistent'}
export interface EngineModule {id:string;sdk:1;components?:ComponentType[];validateScene?:(scene:SceneDocument,project:ProjectManifest)=>void;createSession?:(options:SessionOptions)=>Promise<RuntimeSession>}
export interface EditorModule {prepare:(assetUrl:(p:string)=>string,document?:SceneDocument)=>Promise<(canvas:HTMLCanvasElement)=>EditorHost>;prefabs?:Record<string,string>}
