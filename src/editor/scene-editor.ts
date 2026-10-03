import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import type {SceneRenderer} from '../engine/renderer.ts';
import type {EditorHost} from '../engine/sdk.ts';
import {SceneRuntime,PREFAB_NAMES} from '../engine/runtime.ts';
import {deleteNodes,duplicateNodes,groupNodes,ungroupNodes} from '../engine/scene-commands.ts';
import {cameraPanel} from './camera-panel.ts';
import {modelBounds,selectionBounds,objectTransform,transformSelection} from './selection.ts';
import {SceneHistory,SCENE_KEY,DRAFT_KEY,DEFAULT_CAMERA,identity,surface,light,parseScene,saveScene,type SceneDocument,type SceneNode,type NodeKind,type Layer,type Triple} from '../engine/scene.ts';

const paths:Record<string,string>={cube:'M3 7 12 2 21 7 21 17 12 22 3 17Z M3 7 12 12 21 7 M12 12v10',move:'M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4',rotate:'M20 8a9 9 0 1 0 1 7 M20 2v6h-6',scale:'M4 14v6h6 M20 10V4h-6 M4 20l16-16',cursor:'m5 3 14 9-7 2-3 7Z',sun:'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0',save:'M4 3h14l3 3v15H3V3Z M7 3v6h10V3 M7 21v-8h10v8',undo:'M9 5 3 11l6 6 M3 11h11a6 6 0 0 1 6 6',redo:'m15 5 6 6-6 6 M21 11H10a6 6 0 0 0-6 6',trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',copy:'M8 8h13v13H8Z M16 8V3H3v13h5',file:'M5 2h9l5 5v15H5Z M14 2v6h5',folder:'M2 6h8l2 3h10l-2 11H2Z M2 6V4h8l2 3h8v2',play:'m7 3 15 9-15 9Z',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',lock:'M5 10h14v11H5Z M8 10V6a4 4 0 0 1 8 0v4',focus:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M3 16v5h5 M8 12h8 M12 8v8',grid:'M3 3h18v18H3Z M9 3v18 M15 3v18 M3 9h18 M3 15h18',bed:'M3 8v13 M3 17h18v4 M3 10h7v7 M10 12h11v5',table:'M2 9h20v3H2Z M5 12v9 M19 12v9 M6 5h5v4',lamp:'m4 3 7 3-5 7-4-7Z M9 11l5 3 M13 9l5 1 M8 15l3 5',sphere:'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M3 12h18 M12 3c-6 4-6 14 0 18 6-4 6-14 0-18'};
const icon=(name:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.cube}"/></svg>`;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const fmt=(n:number)=>Number(n.toFixed(3)).toString();
const labels:Record<Layer,string>={architecture:'Архитектура',props:'Предметы',lights:'Освещение',details:'Детали и декор'};
const textureNames=['Исходные материалы','Без текстуры','Штукатурка','Обои','Кирпич','Дерево','Бетон','Кровля'];
const textureValues=['original','none','tile-0','tile-1','tile-2','tile-3','tile-4','tile-5'];

export interface EditorOptions {document?:SceneDocument;draftKey?:string;onChange?:(document:SceneDocument)=>void;onSave?:()=>void;onPlay?:()=>void;inspector?:(node:SceneNode|undefined)=>string;onField?:(input:HTMLInputElement)=>boolean;prefabs?:Record<string,string>;textures?:()=>{id:string;name:string}[]}
export class SceneEditor {
 host:EditorHost;suspended=false;abort=new AbortController();observer:ResizeObserver;frameId=0;disposed=false;hiddenIds=new Set<string>();onRefresh?:()=>void;

 renderer:SceneRenderer;runtime:SceneRuntime;history:SceneHistory;selectedIds=new Set<string>();
 get selected(){return [...this.selectedIds].at(-1)||null;}
 set selected(id:string|null){this.selectedIds=new Set(id?[id]:[]);}
 get selectedNodes(){return this.document.nodes.filter(n=>this.selectedIds.has(n.id));}
 get selectedGroup(){const nodes=this.selectedNodes,id=nodes[0]?.groupId;return id&&nodes.every(n=>n.groupId===id)&&this.document.nodes.filter(n=>n.groupId===id).length===nodes.length?this.document.groups?.find(g=>g.id===id):undefined;}
 pivot=new T.Group();dragStart:{nodes:SceneNode[];center:T.Vector3}|null=null;
 canvas:HTMLCanvasElement;orbit:OrbitControls;transform:TransformControls;overlay=new T.Scene();
 grid=new T.GridHelper(30,30,0x677269,0x3c4544);outline=new T.Box3Helper(new T.Box3(),0xeac689);
 navigating=false;gamePreview=false;previewAspect='window';guides=true;workspaceView:{camera:T.OrthographicCamera|T.PerspectiveCamera;target:T.Vector3}|null=null;
 isolatedIds:Set<string>|null=null;gridEnabled=true;iconsEnabled=true;
 marquee:{id:number;x:number;y:number;additive:boolean;individual:boolean}|null=null;
 preview=false;mode:'select'|'translate'|'rotate'|'scale'='translate';floor=0;search='';typeFilter='';propertySearch='';sectionsClosed=new Set<string>();gizmoUsed=false;pointerStart={x:0,y:0};
 lightIcons=new Map<string,T.Mesh>();draftTimer=0;saveMessage='Изменения сохраняются в черновик';lastFrame=performance.now();
 get document(){return this.history.document;}
 $(selector:string){return this.root.querySelector<HTMLElement>(selector)!;}
 constructor(public root:HTMLDivElement,createHost:(canvas:HTMLCanvasElement)=>EditorHost,public options:EditorOptions={}){
  this.root.innerHTML=this.layout();this.canvas=this.$('#editor-canvas') as HTMLCanvasElement;
  this.host=createHost(this.canvas);this.renderer=this.host.renderer;this.renderer.editorMode=true;this.renderer.externalCamera=true;
  this.runtime=this.host.runtime;
  let document=this.options.document?.moduleData?.legacySeed?{...this.runtime.initial,id:this.options.document.id}:this.options.document||this.runtime.initial,loadError='';
  try{const saved=this.options.draftKey?localStorage.getItem(this.options.draftKey):null;if(saved)document=this.runtime.validate(parseScene(saved));}catch(error){loadError='Черновик не загружен: '+this.error(error);}
  this.history=new SceneHistory(structuredClone(document));this.runtime.apply(this.document);
  this.orbit=new OrbitControls(this.renderer.camera,this.canvas);this.orbit.mouseButtons={MIDDLE:T.MOUSE.PAN,RIGHT:T.MOUSE.ROTATE};this.orbit.enableDamping=true;this.orbit.dampingFactor=.12;this.orbit.minZoom=.25;this.orbit.maxZoom=8;this.orbit.minDistance=.4;this.orbit.maxDistance=200;this.orbit.target.set(0,1.4,0);
  this.transform=new TransformControls(this.renderer.camera,this.canvas);this.transform.setSize(.8);this.transform.setMode('translate');this.overlay.add(this.transform.getHelper(),this.outline);this.outline.visible=false;(this.outline.material as T.LineBasicMaterial).depthTest=false;
  this.overlay.add(this.pivot);
  (this.grid.material as T.Material).transparent=true;(this.grid.material as T.Material).opacity=.2;this.grid.position.y=.008;this.renderer.scene.add(this.grid);
  this.transform.addEventListener('dragging-changed',event=>{this.orbit.enabled=!event.value&&!this.gamePreview;});
  this.transform.addEventListener('mouseDown',()=>{this.gizmoUsed=true;this.dragStart={nodes:structuredClone(this.selectedNodes),center:this.pivot.position.clone()};});
  this.transform.addEventListener('mouseUp',()=>this.commitTransform());
  this.transform.addEventListener('objectChange',()=>{this.previewTransform();this.refreshBounds();});
  this.renderer.beforeRender=()=>{this.runtime.beforeRender(!this.gamePreview);if(this.gamePreview){const camera=this.document.nodes.find(n=>n.id===this.document.activeCamera);if(camera){this.renderer.camera.position.fromArray(camera.transform.position);this.renderer.camera.rotation.set(...camera.transform.rotation.map(T.MathUtils.degToRad) as [number,number,number]);this.renderer.camera.updateMatrixWorld();}}
   this.host.helper?.(this.gamePreview||!this.isolatedIds);
   if(!this.gamePreview)for(const id of this.hiddenIds){const i=this.runtime.instances.get(id);if(i)i.root.visible=false;}
   if(!this.gamePreview&&this.isolatedIds)for(const node of this.document.nodes)if(!this.isolatedIds.has(node.id)&&!node.light)this.runtime.instances.get(node.id)!.root.visible=false;
  };
  this.renderer.afterRender=()=>{if(this.preview||this.gamePreview)return;const gl=this.renderer.gl;gl.autoClear=false;gl.clearDepth();gl.render(this.overlay,this.renderer.camera);gl.autoClear=true;};
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.$('.ed-viewport'));
  this.bind();this.home();this.updateSnap();this.refresh();if(loadError)this.status(loadError,true);
  window.addEventListener('pagehide',()=>this.storeDraft(),{signal:this.abort.signal});
  window.addEventListener('blur',()=>{this.cancelMarquee();if(this.transform.dragging){this.transform.reset();this.runtime.apply(this.document);}},{signal:this.abort.signal});
  this.frameId=requestAnimationFrame(now=>this.frame(now));
 }
 layout(){return `<header class="ed-header"><a class="ed-brand" href="?editor" aria-label="Shelter Engine">SHELTER <span>ENGINE</span></a><input class="ed-project" aria-label="Название сцены" maxlength="100" value="Дом на окраине"><div class="ed-head-actions"><button class="ed-button" data-action="new" title="Новая пустая сцена">${icon('file')}<span class="file-label">Новая</span></button><button class="ed-button" data-action="import" title="Открыть файл сцены">${icon('folder')}<span class="file-label">Открыть</span></button><button class="ed-button" data-action="export" title="Экспорт сцены в JSON">${icon('file')}<span class="file-label">Экспорт</span></button><button class="ed-button ed-primary" data-action="save" title="Сохранить сцену для игры · Ctrl+S">${icon('save')}Сохранить</button><button class="ed-button" data-action="game" title="Сохранить и проверить в игре">${icon('play')}<span class="file-label">В игру</span></button></div></header>
  <nav class="ed-toolbar" aria-label="Инструменты сцены"><button class="ed-sidebar-toggle" data-action="scene-list" aria-label="Список сцены" aria-pressed="false" title="Список объектов">${icon('folder')}</button><button data-mode="select" title="Выбор · Q" aria-label="Выбор">${icon('cursor')}</button><button data-mode="translate" title="Перемещение · W" aria-label="Перемещение">${icon('move')}</button><button data-mode="rotate" title="Поворот · E" aria-label="Поворот">${icon('rotate')}</button><button data-mode="scale" title="Масштаб · R" aria-label="Масштаб">${icon('scale')}</button><i class="ed-separator"></i><button data-action="undo" aria-label="Отменить" title="Отменить · Ctrl+Z">${icon('undo')}</button><button data-action="redo" aria-label="Повторить" title="Повторить · Ctrl+Shift+Z">${icon('redo')}</button><i class="ed-separator"></i><button data-action="grid" aria-label="Сетка" aria-pressed="true" title="Сетка 1 м">${icon('grid')}</button><label class="ed-tool-label" for="ed-snap">Привязка</label><select id="ed-snap" aria-label="Привязка к сетке"><option value="0">Без привязки</option><option value=".1" selected>0,1 м / 15°</option><option value=".25">0,25 м / 15°</option><option value=".5">0,5 м / 15°</option><option value="1">1 м / 15°</option></select><select class="ed-space" aria-label="Оси манипулятора"><option value="world">Мировые оси</option><option value="local">Локальные оси</option></select><label class="ed-tool-label" for="ed-floor">Этаж</label><select id="ed-floor" aria-label="Этаж размещения"><option value="-1">Подвал</option><option value="0" selected>1 этаж</option><option value="1">2 этаж</option></select><span class="ed-unit">1 единица = 1 м</span><button data-action="help" aria-label="Помощь" title="Управление редактором">?</button></nav>
  <aside class="ed-sidebar"><div class="ed-panel-heading">СЦЕНА <span id="node-count"></span></div><input class="ed-search" type="search" aria-label="Найти объект" placeholder="Найти объект…"><div class="ed-tree"></div><div class="ed-selection-actions"><button class="ed-button" data-action="group" title="Ctrl/Cmd+G">Группировать</button><button class="ed-button" data-action="ungroup" title="Ctrl/Cmd+Shift+G">Разгруппировать</button></div><button class="ed-button ed-isolate" data-action="isolate" aria-pressed="false" title="Показать только выделение · Shift+H">Изолировать выделение</button><p class="ed-tree-hint">Shift + щелчок — добавить к выделению.<br>Двойной щелчок — приблизить.<br>Alt + щелчок в сцене — объект в группе.<br>Q + перетаскивание — выделение рамкой.</p></aside>
  <main class="ed-workspace"><div class="ed-viewport"><canvas id="editor-canvas" tabindex="0" aria-label="Редактор 3D-сцены"></canvas><div class="ed-marquee" hidden></div><div class="ed-frame-guides" hidden><i></i><i></i><i></i><i></i><b></b></div><div class="ed-view-badge"><i></i><span id="view-mode">СЦЕНА · ОРТОГРАФИЧЕСКИЙ ВИД</span></div><div class="ed-view-buttons"><button data-action="home" title="Исходный ракурс">2.5D</button><button data-action="front" title="Вид спереди">Спереди</button><button data-action="focus" title="Фокус на объекте · F">${icon('focus')}</button><button data-action="preview" aria-pressed="false" title="Чистый вид без инструментов">${icon('eye')}</button><button data-action="game-preview" aria-label="Игровой кадр" aria-pressed="false" title="Проверить вид игровой камеры">Кадр игры</button><button data-action="camera" title="Настройки игровой камеры">Камера</button><button data-action="inspector" class="ed-inspector-toggle">Свойства</button></div><span class="ed-view-note">ЛКМ — выбор · ПКМ — обзор · колесо — масштаб</span><span class="ed-scale">МЕТРЫ / ГРАДУСЫ</span></div><section class="ed-assets"><div class="ed-panel-heading">БИБЛИОТЕКА ОБЪЕКТОВ <span style="letter-spacing:0;font-size:10px;color:#738296">Нажмите или перетащите в сцену</span></div><div class="ed-catalog">${[...Object.keys(this.options.prefabs||{}),'box','sphere','plane','point-light','spot-light','camera'].map(kind=>`<button class="ed-asset" draggable="true" data-add="${kind}" title="Добавить: ${(this.options.prefabs?.[kind]||PREFAB_NAMES[kind])}" aria-label="Добавить: ${(this.options.prefabs?.[kind]||PREFAB_NAMES[kind])}">${icon(kind==='bed'?'bed':kind==='workbench'?'table':kind==='point-light'?'sun':kind==='spot-light'?'lamp':kind==='sphere'?'sphere':'cube')}<span>${(this.options.prefabs?.[kind]||PREFAB_NAMES[kind])}</span><small>${kind.includes('light')?'Свет':'Геометрия'}</small></button>`).join('')}</div></section></main>
  <aside class="ed-inspector collapsed" aria-label="Инспектор"></aside><footer class="ed-footer"><span>SHELTER ENGINE / 0.4</span><span id="selection-info">Нет выделения</span><span class="ed-status" role="status" aria-live="polite">Готово</span></footer><input type="file" id="scene-file" accept=".json,application/json" hidden><input type="file" id="texture-file" accept="image/png,image/jpeg,image/webp" hidden><dialog class="ed-dialog"><h2>Новая сцена</h2><p>Создать пустую сцену? Текущий вариант останется в истории: его можно вернуть отменой.</p><div class="ed-dialog-actions"><button class="ed-button" data-action="cancel-new">Отмена</button><button class="ed-button" data-action="template">Начальная сцена</button><button class="ed-button ed-primary" data-action="confirm-new">Пустая сцена</button></div></dialog>`;}
 bind(){
  this.root.addEventListener('click',e=>{
   const button=(e.target as HTMLElement).closest<HTMLElement>('button');if(!button)return;
   if(button.dataset.mode){this.setMode(button.dataset.mode as typeof this.mode);return;}
   if(button.dataset.add){this.add(button.dataset.add!);return;}
   if(button.dataset.select){this.select(button.dataset.select,e.shiftKey||e.ctrlKey||e.metaKey);return;}
   if(button.dataset.group){this.selectMany(this.document.nodes.filter(n=>n.groupId===button.dataset.group).map(n=>n.id),e.shiftKey||e.ctrlKey||e.metaKey);return;}
   if(button.dataset.toggle){const id=button.dataset.toggle,key=button.dataset.field as 'visible'|'locked';this.mutate(d=>{const n=d.nodes.find(n=>n.id===id)!;n[key]=!n[key];});return;}
   if(button.dataset.time){this.mutate(d=>d.environment.time=Number(button.dataset.time));return;}
   if(button.dataset.action)this.action(button.dataset.action);
  });
  this.root.addEventListener('dblclick',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-select]');if(button){this.select(button.dataset.select!);this.focus();}});
  this.root.addEventListener('change',e=>this.change(e.target as HTMLInputElement));
  this.root.addEventListener('input',e=>{
   const input=e.target as HTMLInputElement;if(input.dataset.camera!=='fov'||input.type!=='range')return;
   if(this.gamePreview)this.renderer.configureCamera({...this.document.camera||DEFAULT_CAMERA,fov:Number(input.value)});
   (this.$('input[type=number][data-camera=fov]') as HTMLInputElement).value=input.value;
  });
  this.$('.ed-search').addEventListener('input',e=>{this.search=(e.target as HTMLInputElement).value;this.renderTree();});
  this.root.addEventListener('dragstart',e=>{const asset=(e.target as HTMLElement).closest<HTMLElement>('[data-add]');if(asset)e.dataTransfer!.setData('text/plain',asset.dataset.add!);});
  this.canvas.addEventListener('dragover',e=>e.preventDefault());this.canvas.addEventListener('drop',e=>{e.preventDefault();const kind=e.dataTransfer!.getData('text/plain');if(!(kind in PREFAB_NAMES)&&!(kind in (this.options.prefabs||{})))return;const p=this.dropPosition(e.clientX,e.clientY);this.add(kind,p);});
  this.canvas.addEventListener('pointerdown',e=>{
   this.pointerStart={x:e.clientX,y:e.clientY};if(!this.transform.dragging)this.gizmoUsed=false;
   if(e.button===0&&!e.altKey&&this.mode==='select'&&!this.preview&&!this.gamePreview){this.marquee={id:e.pointerId,x:e.clientX,y:e.clientY,additive:e.shiftKey||e.ctrlKey||e.metaKey,individual:e.altKey};this.canvas.setPointerCapture(e.pointerId);}
  });
  this.canvas.addEventListener('pointermove',e=>{
   const start=this.marquee;if(!start||e.pointerId!==start.id)return;const rect=this.canvas.getBoundingClientRect(),box=this.$('.ed-marquee');
   box.hidden=Math.hypot(e.clientX-start.x,e.clientY-start.y)<5;
   Object.assign(box.style,{left:Math.min(start.x,e.clientX)-rect.left+'px',top:Math.min(start.y,e.clientY)-rect.top+'px',width:Math.abs(e.clientX-start.x)+'px',height:Math.abs(e.clientY-start.y)+'px'});
  });
  this.canvas.addEventListener('pointerup',e=>{
   const start=this.marquee;this.cancelMarquee();
   if(e.button!==0||this.preview||this.gamePreview||this.gizmoUsed){this.gizmoUsed=false;return;}
   if(Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>5){if(start)this.selectRectangle(start,e.clientX,e.clientY);return;}
   this.pick(e.clientX,e.clientY,e.shiftKey||e.ctrlKey||e.metaKey,e.altKey);
  });
  this.canvas.addEventListener('pointercancel',()=>this.cancelMarquee());
  this.canvas.addEventListener('lostpointercapture',()=>this.cancelMarquee());
  this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
   if(this.navigating||this.suspended||this.root.inert||document.querySelector('dialog[open]'))return;
   const typing=(e.target as HTMLElement).closest('input,textarea,select');if(typing)return;
   if(e.ctrlKey||e.metaKey){if(['KeyS','KeyZ','KeyY','KeyD','KeyG'].includes(e.code))e.preventDefault();if(e.code==='KeyS')this.action(e.shiftKey?'export':'save');if(e.code==='KeyZ')this.action(e.shiftKey?'redo':'undo');if(e.code==='KeyY')this.action('redo');if(e.code==='KeyD')this.action('duplicate');if(e.code==='KeyG')this.action(e.shiftKey?'ungroup':'group');return;}
   const modes:Record<string,typeof this.mode>={KeyQ:'select',KeyW:'translate',KeyE:'rotate',KeyR:'scale'};if(modes[e.code]){e.preventDefault();this.setMode(modes[e.code]);}
   if(e.code==='KeyH'&&e.shiftKey){e.preventDefault();this.action('isolate');}if(e.code==='KeyF'){e.preventDefault();this.focus();}if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();this.action('delete');}if(e.code==='Escape'){if(this.gamePreview){this.toggleGamePreview();return;}if(this.marquee){this.cancelMarquee();return;}if(this.isolatedIds){this.action('isolate');return;}if(this.transform.dragging){this.transform.reset();return;}this.select(null);this.$('.ed-help')?.remove();}
  },{signal:this.abort.signal});
 }
 error(error:unknown){return error instanceof Error?error.message:String(error);}
 status(message:string,error=false){const el=this.$('.ed-status');el.textContent=message;el.classList.toggle('error',error);this.saveMessage=message;}
 mutate(fn:(doc:SceneDocument)=>void){const next=structuredClone(this.document);try{fn(next);if(this.history.commit(this.runtime.validate(next)))this.changed();return true;}catch(error){this.runtime.apply(this.document);this.refresh();this.status(this.error(error),true);return false;}}
 changed(){this.runtime.apply(this.document);if(this.isolatedIds){this.isolatedIds=new Set([...this.isolatedIds].filter(id=>this.runtime.instances.has(id)));if(!this.isolatedIds.size)this.isolatedIds=null;}this.selectedIds=new Set(this.document.nodes.filter(n=>this.selectedIds.has(n.id)).map(n=>n.id));this.refresh();this.options.onChange?.(this.document);this.status('Есть несохранённые изменения');window.clearTimeout(this.draftTimer);this.draftTimer=window.setTimeout(()=>this.storeDraft(),450);}
 storeDraft(){try{if(this.options.draftKey)saveScene(localStorage,this.options.draftKey,this.document);if(!this.suspended&&!this.$('.ed-status').classList.contains('error'))this.status('Черновик сохранён в браузере');}catch{this.status('Не удалось сохранить черновик. Экспортируйте сцену в файл.',true);}}
 save(){if(this.options.onSave){this.options.onSave();return true;}window.clearTimeout(this.draftTimer);try{saveScene(localStorage,SCENE_KEY,this.document);if(this.options.draftKey)saveScene(localStorage,this.options.draftKey,this.document);this.status('Сцена сохранена и доступна в игре');return true;}catch{this.status('Хранилище недоступно или заполнено. Используйте экспорт.',true);return false;}}
 action(action:string){
  if(action==='undo'||action==='redo'){if(this.history[action]())this.changed();return;}
  if(action==='save'){this.save();return;}
  if(action==='game'){this.options.onPlay?.();return;}
  if(action==='export'){const blob=new Blob([JSON.stringify(this.document,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=this.document.name.replace(/[^a-zA-Zа-яА-Я0-9_-]+/g,'-')+'.scene.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.status('Файл сцены экспортирован');return;}
  if(action==='import'){this.$('#scene-file').click();return;}
  if(action==='texture'){this.$('#texture-file').click();return;}
  if(action==='hide-editor'){for(const id of this.selectedIds){if(this.hiddenIds.has(id))this.hiddenIds.delete(id);else this.hiddenIds.add(id);}this.refresh();return;}
  if(action==='home'){this.home();return;}if(action==='front'){this.home(true);return;}if(action==='focus'){this.focus();return;}
  if(action==='grid'){this.gridEnabled=!this.gridEnabled;this.updateHelpers();return;}
  if(action==='preview'){this.preview=!this.preview;this.updateHelpers();this.attach();this.updateViewLabel();return;}
  if(action==='game-preview'){this.toggleGamePreview();return;}
  if(action==='reset-camera'){this.mutate(d=>d.camera={...DEFAULT_CAMERA});return;}
  if(action==='isolate'){
   if(this.gamePreview)return;
   if(this.isolatedIds)this.isolatedIds=null;else if(this.selectedIds.size)this.isolatedIds=new Set(this.selectedIds);else{this.status('Выберите объекты для изоляции.');return;}
   this.refresh();this.status(this.isolatedIds?'Временно показано только выделение · Shift+H — вернуть сцену':'Показана вся сцена');return;
  }
  if(action==='scene-list'){const open=this.$('.ed-sidebar').classList.toggle('is-open');this.$('[data-action=scene-list]').setAttribute('aria-pressed',String(open));if(open)this.$('.ed-inspector').classList.add('collapsed');return;}
  if(action==='camera'){this.$('.ed-inspector').classList.remove('collapsed');const category=this.$('#ed-camera')?.closest('details');if(category)category.open=true;this.closeSidebar();this.$('#ed-camera').scrollIntoView({block:'start'});return;}
  if(action==='inspector'){this.$('.ed-inspector').classList.toggle('collapsed');this.closeSidebar();return;}
  if(action==='help'){const existing=this.root.querySelector('.ed-help');if(existing){existing.remove();return;}const help=document.createElement('section');help.className='ed-help';help.innerHTML='<button data-action="help" aria-label="Закрыть помощь">×</button><h3>Рабочее пространство</h3><p>ЛКМ — выбрать объект. В режиме Q перетаскивайте рамку вокруг центров объектов; Shift добавляет их к выделению. Shift+H — временно изолировать выделение, Esc — вернуть сцену. Перетаскивайте цветные стрелки, дуги и квадраты манипулятора. В перспективе удерживайте ПКМ и двигайтесь WASD, Q/E — вниз/вверх, Shift — быстрее. Alt+перетаскивание — орбита. Короткий ПКМ — действия. Средняя кнопка — перемещать, колесо — приближать рабочий вид. «Кадр игры» блокирует обзор и показывает игровую камеру; Esc возвращает рабочий ракурс.</p><p><b>Q / W / E / R</b> — выбор, перемещение, поворот, масштаб.<br><b>F</b> — фокус · <b>Delete</b> — удалить · <b>Ctrl+D</b> — копия.<br><b>Shift + щелчок</b> — несколько объектов. <b>Ctrl+G</b> — группа, <b>Ctrl+Shift+G</b> — разгруппировать. Alt + щелчок выбирает отдельный объект внутри группы.<br><b>Ctrl+Z</b> — отмена · <b>Ctrl+Shift+Z</b> — повтор · <b>Ctrl+S</b> — сохранить.</p><p>Все координаты в метрах, повороты в градусах. Черновик сохраняется автоматически. «Сохранить» записывает авторскую сцену на диск проекта. «Экспорт» создаёт переносимый файл с текстурами.</p>';this.$('.ed-viewport').append(help);return;}
  if(action==='new'){(this.$('.ed-dialog') as HTMLDialogElement).showModal();return;}if(action==='cancel-new'){(this.$('.ed-dialog') as HTMLDialogElement).close();return;}
  if(action==='template'){(this.$('.ed-dialog') as HTMLDialogElement).close();this.history.commit(structuredClone(this.runtime.initial));this.changed();return;}
  if(action==='confirm-new'){(this.$('.ed-dialog') as HTMLDialogElement).close();this.mutate(d=>{d.nodes=[];d.groups=[];d.name='Новая сцена';d.textures=[];});return;}
  const nodes=this.selectedNodes,ids=new Set(this.selectedIds);if(!nodes.length)return;
  if(action==='lock-selection'||action==='unlock-selection'){this.mutate(d=>{for(const n of d.nodes)if(ids.has(n.id))n.locked=action==='lock-selection';});return;}
  if(nodes.some(n=>n.locked)){this.status('Сначала разблокируйте все выбранные объекты.');return;}
  if(action==='group'){if(!this.selectedGroup)this.mutate(d=>groupNodes(d,ids));return;}
  if(action==='ungroup'){this.mutate(d=>ungroupNodes(d,ids));return;}
  if(action==='delete'){this.mutate(d=>deleteNodes(d,ids));return;}
  if(action==='duplicate'){let copies:string[]=[];if(this.mutate(d=>{copies=duplicateNodes(d,ids);if(this.isolatedIds)for(const id of copies)this.isolatedIds.add(id);}))this.selectMany(copies);return;}
  if(action==='reset-transform'){this.mutate(d=>{for(const item of d.nodes)if(ids.has(item.id))item.transform=structuredClone(this.runtime.initial.nodes.find(x=>x.id===item.id)?.transform||identity());});return;}
  if(action==='reset-material'){this.mutate(d=>{for(const item of d.nodes)if(ids.has(item.id))delete item.surface;});return;}
  if(action==='floor'){const bounds=this.currentBounds();if(bounds.isEmpty())return;const delta=(this.host.floorHeight*this.floor)-bounds.min.y;this.mutate(d=>{for(const item of d.nodes)if(ids.has(item.id))item.transform.position[1]+=delta;});}

 }
 async change(input:HTMLInputElement){
  if(this.options.onField?.(input))return;
  if(input.id==='scene-file'){const file=input.files?.[0];input.value='';if(!file)return;try{if(file.size>20000000)throw new Error('Файл превышает 20 МБ.');const doc=this.runtime.validate(parseScene(await file.text()));doc.id=this.document.id;this.history.commit(doc);this.selected=null;this.changed();this.status('Сцена открыта: '+doc.name);}catch(error){this.status(this.error(error),true);}return;}
  if(input.id==='texture-file'){const file=input.files?.[0],ids=new Set(this.selectedNodes.filter(n=>!n.light).map(n=>n.id));input.value='';if(!file||!ids.size||this.selectedNodes.some(n=>n.locked))return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3000000)throw new Error('Выберите PNG, JPEG или WebP до 3 МБ.');const bitmap=await createImageBitmap(file);if(bitmap.width>4096||bitmap.height>4096){bitmap.close();throw new Error('Размер текстуры — не более 4096 × 4096.');}bitmap.close();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Не удалось прочитать изображение'));reader.readAsDataURL(file);});const textureId='texture-'+crypto.randomUUID();this.mutate(d=>{const nodes=d.nodes.filter(n=>ids.has(n.id));if(!nodes.length||nodes.some(n=>n.locked))return;d.textures.push({id:textureId,name:file.name,data});for(const n of nodes)n.surface={...(n.surface||surface()),texture:textureId};});}catch(error){this.status(this.error(error),true);}return;}
  if(input.matches('.ed-project')){this.mutate(d=>d.name=input.value.trim());return;}
  if(input.id==='ed-snap'){this.updateSnap();return;}if(input.matches('.ed-space')){this.transform.setSpace(input.value as 'world'|'local');return;}if(input.id==='ed-floor'){this.floor=Number(input.value);this.grid.position.y=(this.floor*this.host.floorHeight)+.008;return;}
  if(input.dataset.preview){if(input.dataset.preview==='aspect')this.previewAspect=input.value;else this.guides=input.checked;this.resize();this.updateHelpers();return;}
  if(input.dataset.camera){this.mutate(d=>{d.camera={...d.camera||DEFAULT_CAMERA};Object.assign(d.camera,{[input.dataset.camera!]:['projection','follow'].includes(input.dataset.camera!)?input.value:Number(input.value)});});return;}
  if(input.dataset.surface){if(this.selectedNodes.some(n=>n.locked)||input.value==='')return;const ids=new Set(this.selectedIds),key=input.dataset.surface;this.mutate(d=>{for(const n of d.nodes)if(ids.has(n.id)&&!n.light){n.surface||=surface();Object.assign(n.surface,{[key]:['texture','color'].includes(key)?input.value:Number(input.value)});}});return;}
  if(input.dataset.groupName){this.mutate(d=>{const group=d.groups?.find(g=>g.id===input.dataset.groupName);if(group)group.name=input.value.trim();});return;}
  if(input.dataset.selection){this.changeSelection(input);return;}
  if(input.dataset.env){const key=input.dataset.env as keyof SceneDocument['environment'];this.mutate(d=>{Object.assign(d.environment,{[key]:input.type==='checkbox'?input.checked:Number(input.value)});});return;}
  const selected=this.selected;if(!selected)return;const current=this.document.nodes.find(n=>n.id===selected);if(current?.locked&&input.dataset.prop!=='locked')return;
  const baseSize=this.runtime.instances.get(selected)?modelBounds(this.runtime.instances.get(selected)!.root).getSize(new T.Vector3()).toArray():[];
  this.mutate(d=>{const n=d.nodes.find(n=>n.id===selected)!;
   if(input.dataset.dimension!==undefined){const axis=Number(input.dataset.dimension);if(!baseSize[axis])throw new Error('Размер этой геометрии не определён.');n.transform.scale[axis]=Number(input.value)/baseSize[axis];}
   if(input.dataset.vector){const key=input.dataset.vector as keyof SceneNode['transform'];n.transform[key][Number(input.dataset.axis)]=Number(input.value);}
   if(input.dataset.prop){const key=input.dataset.prop;Object.assign(n,{[key]:input.type==='checkbox'?input.checked:input.value});}
   if(input.dataset.light){const key=input.dataset.light;Object.assign(n.light!,{[key]:key==='color'?input.value:key==='shadows'?input.checked:Number(input.value)});}
  });
 }
 add(kind:string,position?:Triple){
  const prefab=kind in (this.options.prefabs||{}),id=crypto.randomUUID();const node:SceneNode={id,name:(this.options.prefabs?.[kind]||PREFAB_NAMES[kind]),kind:prefab?'prefab':kind as NodeKind,asset:prefab?kind:undefined,layer:kind.includes('light')?'lights':'props',visible:true,locked:false,transform:{...identity(),position:position||[Number(this.orbit.target.x.toFixed(1)),(this.floor*this.host.floorHeight),.1]}};
  if(kind.includes('light')){node.light=light();node.transform.position[1]+=1.8;if(kind==='spot-light')node.transform.rotation=[-25,0,0];}else node.surface=surface();
  if(this.isolatedIds)this.isolatedIds.add(id);this.selected=id;this.mutate(d=>d.nodes.push(node));this.$('.ed-inspector').classList.remove('collapsed');
 }
 dropPosition(x:number,y:number):Triple {const rect=this.canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.renderer.camera);const p=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-(this.floor*this.host.floorHeight)),new T.Vector3());return p?[Math.max(-30,Math.min(30,p.x)),p.y,Math.max(-15,Math.min(15,p.z))]:[0,(this.floor*this.host.floorHeight),0];}
 closeSidebar(){this.$('.ed-sidebar').classList.remove('is-open');this.$('[data-action=scene-list]').setAttribute('aria-pressed','false');}
 select(id:string|null,additive=false){if(!id){if(!additive)this.selectMany([]);return;}this.selectMany([id],additive);}
 selectMany(ids:string[],additive=false){
  if(this.transform.dragging)return;
  if(additive){const remove=ids.every(id=>this.selectedIds.has(id));for(const id of ids)if(remove)this.selectedIds.delete(id);else this.selectedIds.add(id);}
  else this.selectedIds=new Set(ids);
  this.refresh();if(this.selected&&!(matchMedia('(max-width:600px)').matches&&this.$('.ed-sidebar').classList.contains('is-open')))this.$('.ed-inspector').classList.remove('collapsed');
 }
 pick(x:number,y:number,additive=false,individual=false){
  const rect=this.canvas.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2),this.renderer.camera);
  const candidates=this.document.nodes.filter(n=>n.visible&&!n.locked&&!this.hiddenIds.has(n.id)&&(!this.isolatedIds||this.isolatedIds.has(n.id))).map(n=>this.runtime.instances.get(n.id)!.root);this.renderer.scene.updateMatrixWorld(true);this.renderer.cutScene.updateMatrixWorld(true);
  for(const hit of ray.intersectObjects(candidates,true)){let o:T.Object3D|null=hit.object;while(o&&!o.userData.sceneNode)o=o.parent;if(!o)continue;
   const node=this.document.nodes.find(n=>n.id===String(o!.userData.sceneNode))!;
   if(node.groupId&&!individual)this.selectMany(this.document.nodes.filter(n=>n.groupId===node.groupId).map(n=>n.id),additive);else this.select(node.id,additive);return;
  }
  this.select(null,additive);
 }
 setMode(mode:typeof this.mode){this.cancelMarquee();this.mode=mode;this.updateHelpers();if(mode!=='select')this.transform.setMode(mode);this.attach();this.updateToolbar();}
 updateSnap(){const value=Number((this.$('#ed-snap') as HTMLSelectElement).value);this.transform.setTranslationSnap(value||null);this.transform.setRotationSnap(value?Math.PI/12:null);this.transform.setScaleSnap(value?.1:null);}
 currentBounds(){return selectionBounds(this.selectedNodes.map(n=>this.runtime.instances.get(n.id)!.root));}
 attach(){
  this.transform.detach();this.dragStart=null;const nodes=this.selectedNodes;
  if(nodes.length&&!nodes.some(n=>n.locked||!n.visible)&&this.mode!=='select'&&!this.preview&&!this.gamePreview&&nodes.every(n=>!this.isolatedIds||this.isolatedIds.has(n.id))){
   if(nodes.length===1)this.transform.attach(this.runtime.instances.get(nodes[0].id)!.root);
   else{this.pivot.position.copy(this.currentBounds().getCenter(new T.Vector3()));this.pivot.rotation.set(0,0,0);this.pivot.scale.setScalar(1);this.pivot.updateMatrixWorld(true);this.transform.attach(this.pivot);}
  }
  // A group scales from its centre uniformly, preserving angles and proportions.
  this.transform.showX=this.transform.showY=this.transform.showZ=true;this.refreshBounds();
 }
 previewTransform(){
  if(this.transform.object!==this.pivot||!this.dragStart)return;
  const axis=this.transform.axis?.[0]||'X',scale=this.mode==='scale'?this.pivot.scale.getComponent(Math.max(0,['X','Y','Z'].indexOf(axis))):1;this.pivot.scale.setScalar(scale);
  const transforms=transformSelection(this.dragStart.nodes,this.dragStart.center,this.pivot.position,this.pivot.quaternion,scale);
  for(const [id,t] of transforms){const root=this.runtime.instances.get(id)!.root;root.position.fromArray(t.position);root.rotation.set(...t.rotation.map(T.MathUtils.degToRad) as Triple);root.scale.fromArray(t.scale);}
 }
 commitTransform(){
  if(!this.transform.object)return;
  const values=new Map(this.selectedNodes.map(n=>[n.id,objectTransform(this.runtime.instances.get(n.id)!.root)]));
  const changed=this.mutate(d=>{for(const n of d.nodes){const value=values.get(n.id);if(value)n.transform=value;}});
  this.dragStart=null;if(changed)this.attach();
 }
 changeSelection(input:HTMLInputElement){
  const nodes=this.selectedNodes;if(nodes.some(n=>n.locked)){this.status('Сначала разблокируйте все выбранные объекты.');return;}
  const center=this.currentBounds().getCenter(new T.Vector3()),position=center.clone(),rotation=new T.Quaternion();let scale=1;
  if(input.dataset.selection==='position')position.setComponent(Number(input.dataset.axis),Number(input.value));
  if(input.dataset.selection==='rotation'){const axis=new T.Vector3().setComponent(Number(input.dataset.axis),1);rotation.setFromAxisAngle(axis,T.MathUtils.degToRad(Number(input.value)));}
  if(input.dataset.selection==='scale')scale=Number(input.value);
  const values=transformSelection(nodes,center,position,rotation,scale);
  this.mutate(d=>{for(const n of d.nodes){const value=values.get(n.id);if(value)n.transform=value;}});
 }
 refreshBounds(){
  const nodes=this.selectedNodes;this.outline.visible=nodes.some(n=>n.visible&&(!this.isolatedIds||this.isolatedIds.has(n.id)))&&!this.preview&&!this.gamePreview;
  if(nodes.length){this.outline.box.copy(this.currentBounds());const size=this.outline.box.getSize(new T.Vector3()),el=this.root.querySelector('.ed-bounds');if(el)el.textContent=`Габарит в сцене: ${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)} м`;}
 }
 refresh(){
  const layout=this.document.moduleData?.layout as {floorHeight:number;rooms:{floor:number}[]}|undefined;
  if(layout){this.host.floorHeight=layout.floorHeight;this.host.floorNames=[...new Set(layout.rooms.map(r=>r.floor))].sort((a,b)=>a-b).map(value=>({value,name:value<0?`Подвал ${Math.abs(value)}`:`${value+1} этаж`}));}
  const floors=this.host.floorNames.length?this.host.floorNames:[{value:0,name:'Уровень 0'}];
  if(!floors.some(f=>f.value===this.floor))this.floor=floors[0].value;
  const select=this.$('#ed-floor') as HTMLSelectElement;
  select.innerHTML=floors.map(f=>`<option value="${f.value}">${esc(f.name)}</option>`).join('');select.value=String(this.floor);
  this.grid.position.y=this.floor*this.host.floorHeight+.008;
  this.syncCamera();this.updateViewLabel();this.renderTree();this.renderInspector();this.updateToolbar();this.attach();this.syncLightIcons();this.updateHelpers();(this.$('.ed-project') as HTMLInputElement).value=this.document.name;this.onRefresh?.();this.$('#selection-info').textContent=this.selectedNodes.length>1?`${this.selectedGroup?.name||'Выделение'} · ${this.selectedNodes.length} объектов`:this.selectedNodes[0]?.name||'Нет выделения';}
 updateToolbar(){
  for(const button of this.root.querySelectorAll<HTMLElement>('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===this.mode));
  (this.$('[data-action=undo]') as HTMLButtonElement).disabled=!this.history.past.length;(this.$('[data-action=redo]') as HTMLButtonElement).disabled=!this.history.future.length;
  const nodes=this.selectedNodes,locked=nodes.some(n=>n.locked);
  (this.$('[data-action=group]') as HTMLButtonElement).disabled=nodes.length<2||locked||!!this.selectedGroup;
  (this.$('[data-action=ungroup]') as HTMLButtonElement).disabled=!nodes.some(n=>n.groupId)||locked;
 }
 renderTree(){
  const tree=this.$('.ed-tree'),opened=new Set([...tree.querySelectorAll<HTMLDetailsElement>('details[open]')].map(e=>e.dataset.section)),first=!tree.childElementCount,scroll=this.$('.ed-sidebar').scrollTop,query=this.search.toLocaleLowerCase();
  const row=(n:SceneNode)=>`<div class="ed-tree-row ${this.selectedIds.has(n.id)?'selected':''} ${n.visible?'':'is-hidden'}"><button class="ed-node-name" data-select="${esc(n.id)}" title="${esc(n.name)}" aria-label="Выбрать: ${esc(n.name)}" aria-pressed="${this.selectedIds.has(n.id)}">${icon(n.layer==='lights'?'sun':n.layer==='architecture'?'grid':'cube')}<span class="name">${esc(n.name)}</span></button><button class="ed-mini ${n.visible?'active':''}" data-toggle="${esc(n.id)}" data-field="visible" title="${n.visible?'Скрыть':'Показать'} объект" aria-label="Видимость: ${esc(n.name)}">${n.visible?'◉':'○'}</button><button class="ed-mini ${n.locked?'active':''}" data-toggle="${esc(n.id)}" data-field="locked" title="${n.locked?'Разблокировать':'Заблокировать'} объект" aria-label="Блокировка: ${esc(n.name)}">${n.locked?'▣':'·'}</button></div>`;
  const matches=(n:SceneNode)=>(!this.typeFilter||n.kind===this.typeFilter||n.layer===this.typeFilter)&&(!query||n.name.toLocaleLowerCase().includes(query));
  const groups=(this.document.groups||[]).map(group=>{
   const all=this.document.nodes.filter(n=>n.groupId===group.id),nodes=all.filter(n=>matches(n)||group.name.toLocaleLowerCase().includes(query));if(!nodes.length)return '';
   const selected=all.every(n=>this.selectedIds.has(n.id)),open=opened.has(group.id)||all.some(n=>this.selectedIds.has(n.id))||query;
   return `<details class="ed-group" data-section="${esc(group.id)}" ${open?'open':''}><summary><button class="ed-group-name" data-group="${esc(group.id)}" aria-label="Выбрать группу: ${esc(group.name)}" aria-pressed="${selected}">${icon('folder')}${esc(group.name)}</button><small>${all.length}</small></summary>${nodes.map(row).join('')}</details>`;
  }).join('');
  const folders=[...new Set(this.document.nodes.map(n=>n.folder).filter(Boolean))].map(folder=>{const nodes=this.document.nodes.filter(n=>!n.groupId&&n.folder===folder&&matches(n));return `<details open><summary>▱ ${esc(folder!)} <small>${nodes.length}</small></summary>${nodes.map(row).join('')}</details>`;}).join('');tree.innerHTML=groups+folders+(Object.keys(labels) as Layer[]).map(layer=>{
   const nodes=this.document.nodes.filter(n=>!n.groupId&&!n.folder&&n.layer===layer&&matches(n));return `<details data-section="${layer}" ${opened.has(layer)||nodes.some(n=>this.selectedIds.has(n.id))||query||first&&(layer==='props'||layer==='lights')?'open':''}><summary>${labels[layer]} <small>${nodes.length}</small></summary>${nodes.map(row).join('')}</details>`;
  }).join('');this.$('#node-count').textContent=String(this.document.nodes.length);this.$('.ed-sidebar').scrollTop=scroll;
 }
 field(label:string,html:string){return `<label class="ed-field"><span>${label}</span>${html}</label>`;}
 dimensionInspector(n:SceneNode,disabled:string){
  const base=modelBounds(this.runtime.instances.get(n.id)!.root).getSize(new T.Vector3()).toArray();
  return `<section class="ed-section"><h3>Размеры модели <small>метры</small></h3>${['Ширина','Высота','Глубина'].map((label,axis)=>this.field(label,`<input type="number" aria-label="${label}, м" data-dimension="${axis}" min="${fmt(base[axis]*.01)}" max="${fmt(base[axis]*100)}" step=".01" value="${fmt(base[axis]*n.transform.scale[axis])}" ${disabled||(!base[axis]?'disabled':'')}>`)).join('')}<p class="ed-note">По осям самой модели, независимо от её поворота. 1 м = 100 см.</p></section>`;
 }
 multiInspector(){
  const nodes=this.selectedNodes,group=this.selectedGroup,locked=nodes.some(n=>n.locked),disabled=locked?'disabled':'',center=this.currentBounds().getCenter(new T.Vector3());
  const vector=(key:string,title:string,values:number[])=>`<div class="ed-vector"><label>${title}</label><div class="ed-vector-inputs">${values.map((v,axis)=>`<label class="ed-axis"><span>${['X','Y','Z'][axis]}</span><input type="number" aria-label="${title} ${['X','Y','Z'][axis]}" data-selection="${key}" data-axis="${axis}" value="${fmt(v)}" step="${key==='rotation'?15:.1}" ${disabled}></label>`).join('')}</div></div>`;
  return `<div class="ed-multi-heading">${icon('folder')}<strong>${nodes.length} объектов</strong><span>Совместное редактирование</span></div>${group?`<div class="ed-inspector-title"><input aria-label="Имя группы" maxlength="100" data-group-name="${esc(group.id)}" value="${esc(group.name)}" ${disabled}></div>`:''}<section class="ed-section"><h3>Общий центр <small>м / °</small></h3>${vector('position','Центр',center.toArray())}${vector('rotation','Повернуть на', [0,0,0])}${this.field('Масштаб ×',`<input type="number" aria-label="Общий масштаб" data-selection="scale" value="1" step=".1" min=".01" max="100" ${disabled}>`)}<div class="ed-bounds"></div><p class="ed-note">Поворот и масштаб применяются вокруг общего центра. Масштаб группы всегда равномерный.</p>${locked?'<p class="ed-note ed-warning">В выделении есть заблокированные объекты. Изменение всей группы приостановлено.</p>':''}<div class="ed-inspector-actions"><button class="ed-button" data-action="floor" ${disabled}>На пол</button><button class="ed-button" data-action="${locked?'unlock-selection':'lock-selection'}">${locked?'Разблокировать все':'Блокировать все'}</button></div></section><section class="ed-section"><h3>Выделение</h3><div class="ed-inspector-actions"><button class="ed-button" data-action="duplicate" ${disabled}>${icon('copy')}Копия</button><button class="ed-button ed-danger" data-action="delete" ${disabled}>${icon('trash')}Удалить</button></div><p class="ed-note">Материал ниже применяется ко всем выбранным моделям. Точные размеры доступны при выборе отдельного объекта. Alt + щелчок в сцене выбирает объект внутри группы.</p>${nodes.some(n=>n.layer==='architecture')?'<p class="ed-note ed-warning">Границы комнат и проходы изменяйте в панели «Планировка».</p>':''}</section>`;
 }
 renderInspector(){
  const n=this.document.nodes.find(n=>n.id===this.selected),inspector=this.$('.ed-inspector'),scroll=inspector.scrollTop;
  let html='<div class="ed-panel-heading">ИНСПЕКТОР <button class="ed-inspector-toggle" data-action="inspector" aria-label="Скрыть инспектор">×</button></div>';
  if(this.selectedNodes.length>1)html+=this.multiInspector()+this.materialInspector();
  else if(!n)html+=`<div class="ed-inspector-empty">${icon('cursor')}<strong>Выберите объект</strong>Его положение, материал и свет появятся здесь.</div>`;
  else{
   const disabled=n.locked?'disabled':'';
   html+=`<div class="ed-inspector-title">${icon(n.light?'sun':'cube')}<input aria-label="Имя объекта" data-prop="name" maxlength="100" value="${esc(n.name)}" ${disabled}></div><section class="ed-section"><h3>Трансформация <small>м / °</small></h3>${(['position','rotation','scale'] as const).map((key,i)=>`<div class="ed-vector"><label>${['Положение','Поворот','Масштаб'][i]}</label><div class="ed-vector-inputs">${n.transform[key].map((v,axis)=>`<label class="ed-axis"><span>${['X','Y','Z'][axis]}</span><input type="number" step="${key==='rotation'?1:.1}" ${key==='scale'?'min=".01" max="100"':'min="-1000" max="1000"'} aria-label="${['Положение','Поворот','Масштаб'][i]} ${['X','Y','Z'][axis]}" data-vector="${key}" data-axis="${axis}" value="${fmt(v)}" ${disabled}></label>`).join('')}</div></div>`).join('')}<div class="ed-bounds"></div><div class="ed-checks"><label><input type="checkbox" data-prop="visible" ${n.visible?'checked':''} ${disabled}>Виден</label><label><input type="checkbox" data-prop="locked" ${n.locked?'checked':''}>Заблокирован</label></div><div class="ed-inspector-actions"><button class="ed-button" data-action="floor" ${disabled}>На пол</button><button class="ed-button" data-action="reset-transform" ${disabled}>Сбросить</button></div></section>`;
   if(!n.light)html+=this.dimensionInspector(n,disabled);
   if(n.groupId)html+=`<div class="ed-member-note">В группе: ${esc(this.document.groups?.find(g=>g.id===n.groupId)?.name||'')}</div>`;
   if(n.light){const l=n.light;html+=`<section class="ed-section"><h3>${n.kind==='spot-light'?'Прожектор':'Точечный свет'}</h3>${this.field('Цвет',`<input type="color" aria-label="Цвет света" data-light="color" value="${l.color}" ${disabled}>`)}${[['intensity','Сила',0,150,.5],['range','Дальность, м',.1,30,.1],...(n.kind==='spot-light'?[['angle','Угол, °',5,85,1],['penumbra','Мягкость',0,1,.05]]:[])].map(([key,label,min,max,step])=>this.field(String(label),`<input type="number" aria-label="${label}" data-light="${key}" min="${min}" max="${max}" step="${step}" value="${l[key as keyof typeof l]}" ${disabled}>`)).join('')}<label class="ed-checks"><input type="checkbox" data-light="shadows" ${l.shadows?'checked':''} ${disabled}>Отбрасывать тени</label></section>`;}
   else html+=this.materialInspector();
   html+=`<section class="ed-section"><div class="ed-inspector-actions"><button class="ed-button" data-action="duplicate" ${disabled}>${icon('copy')}Копия</button><button class="ed-button ed-danger" data-action="delete" ${disabled}>${icon('trash')}Удалить</button></div>${n.layer==='architecture'?'<p class="ed-note">Изменяет геометрию сцены. Границы комнат и проходы изменяйте в панели «Планировка».</p>':''}</section>`;
  }
  html+=this.options.inspector?.(n)||'';
  html+=cameraPanel(this.document.camera,this.gamePreview,this.previewAspect,this.guides,!!this.document.activeCamera,!!this.host.flashlight);
  const env=this.document.environment;
  html+=`<section class="ed-section"><h3>Окружение <small>Вся сцена</small></h3><div class="ed-inspector-actions">${[['420','Утро'],['720','День'],['1140','Вечер'],['0','Ночь']].map(([time,label])=>`<button class="ed-button" data-time="${time}">${label}</button>`).join('')}</div>${this.field('Время',`<input type="range" aria-label="Время суток сцены" data-env="time" min="0" max="1439" value="${env.time}">`)}${this.field('Дымка',`<input type="number" aria-label="Плотность дымки" data-env="haze" min="0" max=".2" step=".01" value="${env.haze}">`)}${this.field('Экспозиция',`<input type="number" aria-label="Экспозиция" data-env="exposure" min=".2" max="3" step=".1" value="${env.exposure}">`)}<label class="ed-checks"><input type="checkbox" data-env="flashlight" ${env.flashlight?'checked':''} ${this.host.flashlight?'':'disabled title="В проекте не подключён фонарик персонажа"'}>Фонарик персонажа</label><p class="ed-note">Настройки игровой сцены.</p></section>`;
  inspector.innerHTML=html;for(const section of inspector.querySelectorAll<HTMLElement>('section.ed-section')){const title=section.querySelector('h3');if(!title)continue;const label=title.textContent||'',details=document.createElement('details'),summary=document.createElement('summary');details.className='inspector-category';details.open=!this.sectionsClosed.has(label);summary.textContent=label;for(const button of [...title.querySelectorAll('button')])summary.append(button);title.remove();section.replaceWith(details);details.append(summary,section);details.ontoggle=()=>{if(details.open)this.sectionsClosed.delete(label);else this.sectionsClosed.add(label);};}const search=document.createElement('input');search.type='search';search.placeholder='Найти свойство…';search.setAttribute('aria-label','Поиск свойств');search.value=this.propertySearch;search.className='property-search';const filter=()=>{this.propertySearch=search.value;for(const group of inspector.querySelectorAll<HTMLElement>('.inspector-category'))group.hidden=!!search.value&&!group.textContent?.toLowerCase().includes(search.value.toLowerCase());};search.oninput=filter;inspector.querySelector('.ed-panel-heading')!.after(search);filter();const tabs=document.createElement('div');tabs.className='inspector-tabs';tabs.setAttribute('role','tablist');for(const [label,target] of [['Объект','.ed-inspector-title'],['Камера сцены','#ed-camera'],['Среда','[data-env=time]']]){const b=document.createElement('button');b.setAttribute('role','tab');b.textContent=label;b.onclick=()=>{const el=inspector.querySelector<HTMLElement>(target);const category=el?.closest('details');if(category)category.open=true;el?.scrollIntoView({block:'start'});};tabs.append(b);}search.before(tabs);inspector.scrollTop=scroll;this.refreshBounds();
 }
 syncLightIcons(){
  const lights=this.document.nodes.filter(n=>n.light),ids=new Set(lights.map(n=>n.id));
  for(const [id,mesh] of this.lightIcons)if(!ids.has(id)){mesh.removeFromParent();mesh.geometry.dispose();(mesh.material as T.Material).dispose();this.lightIcons.delete(id);}
  for(const n of lights){let mesh=this.lightIcons.get(n.id);if(!mesh){mesh=new T.Mesh(new T.OctahedronGeometry(.09),new T.MeshBasicMaterial({color:0xffd289,depthTest:false,depthWrite:false}));mesh.renderOrder=1000;this.lightIcons.set(n.id,mesh);}mesh.userData.editorOnly=true;this.runtime.instances.get(n.id)!.root.add(mesh);mesh.visible=this.iconsEnabled&&!this.preview&&!this.gamePreview&&(!this.isolatedIds||this.isolatedIds.has(n.id));}
 }
 updateHelpers(){
  const hidden=this.preview||this.gamePreview;
  this.grid.visible=this.gridEnabled&&!hidden;this.transform.enabled=!hidden;
  for(const [id,mesh] of this.lightIcons)mesh.visible=this.iconsEnabled&&!hidden&&(!this.isolatedIds||this.isolatedIds.has(id));
  this.$('.ed-frame-guides').hidden=!this.gamePreview||!this.guides;
  this.$('[data-action=grid]').setAttribute('aria-pressed',String(this.gridEnabled));
  this.$('[data-action=preview]').setAttribute('aria-pressed',String(this.preview));
  this.$('[aria-label="Игровой кадр"]').setAttribute('aria-pressed',String(this.gamePreview));
  const isolate=this.$('[data-action=isolate]') as HTMLButtonElement;
  isolate.setAttribute('aria-pressed',String(!!this.isolatedIds));isolate.textContent=this.isolatedIds?'Вернуть всю сцену':'Изолировать выделение';isolate.disabled=this.gamePreview||(!this.isolatedIds&&!this.selectedIds.size);
  this.$('.ed-view-note').textContent=this.gamePreview?'Камера заблокирована · Esc — вернуться':this.mode==='select'?'ЛКМ — рамка · Shift — добавить · ПКМ — обзор':'ЛКМ — выбор · ПКМ — обзор · колесо — масштаб';
 }
 toggleGamePreview(){
  if(this.transform.dragging)return;
  this.cancelMarquee();
  if(!this.gamePreview){
   // Flush damped orbit movement before keeping an exact workspace pose.
   this.orbit.enableDamping=false;this.orbit.update();this.orbit.enableDamping=true;
   this.workspaceView={camera:this.renderer.camera.clone(),target:this.orbit.target.clone()};
   this.gamePreview=true;this.renderer.externalCamera=false;this.renderer.editorMode=false;this.orbit.enabled=false;
   this.renderer.configureCamera(this.document.camera);this.host.updateCamera(100);
  }else{
   this.gamePreview=false;this.renderer.externalCamera=true;this.renderer.editorMode=true;this.orbit.enabled=true;
   if(this.workspaceView){this.renderer.camera=this.workspaceView.camera;this.orbit.target.copy(this.workspaceView.target);this.orbit.object=this.renderer.camera;this.transform.camera=this.renderer.camera;}
   this.renderer.configureCamera(this.document.camera);this.workspaceView=null;
  }
  this.resize();this.refresh();
 }
 cancelMarquee(){
  const start=this.marquee;this.marquee=null;this.$('.ed-marquee').hidden=true;
  if(start&&this.canvas.hasPointerCapture(start.id))this.canvas.releasePointerCapture(start.id);
 }
 selectRectangle(start:{x:number;y:number;additive:boolean;individual:boolean},x:number,y:number){
  const rect=this.canvas.getBoundingClientRect(),left=Math.min(start.x,x)-rect.left,right=Math.max(start.x,x)-rect.left,top=Math.min(start.y,y)-rect.top,bottom=Math.max(start.y,y)-rect.top;
  const ids=new Set(start.additive?this.selectedIds:[]);
  for(const node of this.document.nodes){
   if(!node.visible||node.locked||this.hiddenIds.has(node.id)||this.isolatedIds&&!this.isolatedIds.has(node.id))continue;
   const root=this.runtime.instances.get(node.id)!.root,center=selectionBounds([root]).getCenter(new T.Vector3()),projected=center.clone().project(this.renderer.camera);
   if(projected.z < -1||projected.z > 1)continue;
   const p=this.renderer.project(center);if(p.x<left||p.x>right||p.y<top||p.y>bottom)continue;
   for(const member of this.document.nodes)if(member.id===node.id||!start.individual&&node.groupId&&member.groupId===node.groupId)ids.add(member.id);
  }
  this.selectMany([...ids]);
 }
 materialInspector(){
  const nodes=this.selectedNodes.filter(n=>!n.light);if(!nodes.length)return '';
  const disabled=this.selectedNodes.some(n=>n.locked)?'disabled':'',materials=nodes.map(n=>n.surface||surface()),first=materials[0];
  const mixed=(key:keyof typeof first)=>materials.some(s=>s[key]!==first[key]);
  const texture=mixed('texture')?'':first.texture;
  return `<section class="ed-section"><h3>Материал ${nodes.length>1?`<small>${nodes.length} моделей</small>`:''}<button data-action="reset-material" title="Вернуть исходные материалы" ${disabled}>↺</button></h3>${this.field('Текстура',`<select aria-label="Текстура" data-surface="texture" ${disabled}>${mixed('texture')?'<option value="" selected disabled>Разные значения</option>':''}${textureValues.map((value,i)=>value.startsWith('tile-')&&!this.runtime.textures.has(value)?'':`<option value="${value}" ${texture===value?'selected':''}>${textureNames[i]}</option>`).join('')}${(this.options.textures?.()||[]).map(t=>`<option value="${esc(t.id)}" ${texture===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}${this.document.textures.map(t=>`<option value="${esc(t.id)}" ${texture===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>`)}${this.field('Оттенок',`<input type="color" aria-label="Оттенок материала" data-surface="color" value="${first.color}" ${disabled}>`)}${mixed('color')?'<p class="ed-note">Оттенки различаются. Выбор цвета заменит их у всех моделей.</p>':''}${[['roughness','Шероховатость',0,1,.05],['metalness','Металличность',0,1,.05],['repeat','Повтор текстуры',.1,20,.1]].map(([key,label,min,max,step])=>this.field(String(label),`<input type="number" aria-label="${label}" data-surface="${key}" min="${min}" max="${max}" step="${step}" value="${mixed(key as keyof typeof first)?'':first[key as keyof typeof first]}" placeholder="Разные значения" ${disabled}>`)).join('')}<button class="ed-button" data-action="texture" ${disabled}>＋ Загрузить текстуру</button>${nodes.length>1?'<p class="ed-note">Меняется только выбранное свойство. Остальные параметры каждого материала сохраняются. Источники света пропускаются.</p>':''}</section>`;
 }
 updateViewLabel(){this.$('#view-mode').textContent=this.gamePreview?'КАДР ИГРЫ · ПАУЗА':this.isolatedIds?'ИЗОЛЯЦИЯ · SHIFT+H ДЛЯ ВЫХОДА':this.preview?'ПРЕДПРОСМОТР СЦЕНЫ':this.renderer.camera instanceof T.PerspectiveCamera?'СЦЕНА · ПЕРСПЕКТИВА':'СЦЕНА · ОРТОГРАФИЧЕСКИЙ ВИД';}
 syncCamera(){
  const camera=this.renderer.camera,previous=this.orbit.object as T.OrthographicCamera|T.PerspectiveCamera;
  if(this.gamePreview){this.orbit.object=camera;this.transform.camera=camera;this.host.updateCamera(100);return;}
  if(camera===previous)return;
  const direction=previous.position.clone().sub(this.orbit.target),distance=direction.length();
  const height=previous instanceof T.OrthographicCamera?(previous.top-previous.bottom)/previous.zoom:2*distance*Math.tan(T.MathUtils.degToRad(previous.fov/2))/previous.zoom;
  camera.zoom=1;this.resize();
  if(camera instanceof T.PerspectiveCamera)camera.position.copy(this.orbit.target).add(direction.normalize().multiplyScalar(height/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))));
  else camera.zoom=(camera.top-camera.bottom)/height;
  camera.lookAt(this.orbit.target);camera.updateProjectionMatrix();camera.updateMatrixWorld();this.orbit.object=camera;this.transform.camera=camera;this.orbit.update();
 }
 resize(){
  const viewport=this.$('.ed-viewport'),guides=this.$('.ed-frame-guides');
  let width=viewport.clientWidth,height=viewport.clientHeight,left=0,top=0;
  if(this.gamePreview&&this.previewAspect!=='window'){const [x,y]=this.previewAspect.split(':').map(Number),aspect=x/y;if(width/height>aspect){const fit=height*aspect;left=(width-fit)/2;width=fit;}else{const fit=width/aspect;top=(height-fit)/2;height=fit;}}
  for(const el of [this.canvas,guides])Object.assign(el.style,{position:'absolute',left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
  this.renderer.resize();if(this.gamePreview){this.host.updateCamera(100);return;}
  const rect=this.canvas.getBoundingClientRect(),camera=this.renderer.camera,aspect=rect.width/Math.max(1,rect.height);
  if(camera instanceof T.OrthographicCamera){const height=Math.max(11.6,15/Math.max(.1,aspect)),width=height*aspect;camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;}
  else camera.aspect=aspect;
  camera.updateProjectionMatrix();
 }
 home(front=false){
  if(this.gamePreview)this.toggleGamePreview();
  const camera=this.renderer.camera;this.orbit.target.set(0,2.0,0);const offset=new T.Vector3(front?0:-2,front?0:3,18);camera.zoom=1;this.resize();
  if(camera instanceof T.PerspectiveCamera){const height=Math.max(11.6,15/Math.max(.1,camera.aspect));offset.setLength(height/(2*Math.tan(T.MathUtils.degToRad(DEFAULT_CAMERA.fov/2))));}
  camera.position.copy(this.orbit.target).add(offset);camera.lookAt(this.orbit.target);this.orbit.update();
 }
 focus(){
  if(this.gamePreview)this.toggleGamePreview();
  if(!this.selectedNodes.length)return;const box=this.currentBounds(),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());if(!Number.isFinite(center.x))return;
  const camera=this.renderer.camera,offset=camera.position.clone().sub(this.orbit.target);this.orbit.target.copy(center);
  if(camera instanceof T.PerspectiveCamera){const angle=Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*Math.min(1,camera.aspect));offset.setLength(Math.max(.5,size.length()*.6/Math.sin(angle)));camera.zoom=1;}
  else camera.zoom=Math.min(5,Math.max(.5,7/Math.max(size.x,size.y,size.z,1)));
  camera.position.copy(center).add(offset);camera.updateProjectionMatrix();this.orbit.update();
 }
 gizmoHandle(){const helper=this.transform.getHelper();helper.updateMatrixWorld(true);const points:{x:number;y:number}[]=[];helper.traverseVisible(o=>{if(o instanceof T.Mesh&&o.name==='X'&&o.visible&&o.material instanceof T.MeshBasicMaterial&&o.material.opacity>.5){const center=new T.Box3().setFromObject(o).getCenter(new T.Vector3());points.push(this.renderer.project(center));}});return points.sort((a,b)=>b.x-a.x)[0]||null;}
 projectNode(id:string){const root=this.runtime.instances.get(id)?.root;if(!root)return null;root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root);return this.renderer.project(box.getCenter(new T.Vector3()));}
 frame(now:number){if(this.disposed)return;if(this.suspended){this.lastFrame=now;this.frameId=requestAnimationFrame(t=>this.frame(t));return;}const dt=Math.min((now-this.lastFrame)/1000,.08);this.lastFrame=now;if(!this.gamePreview&&!this.navigating){this.orbit.update();this.renderer.angle=Math.atan2(this.renderer.camera.position.x-this.orbit.target.x,this.renderer.camera.position.z-this.orbit.target.z);}this.refreshBounds();this.host.draw(dt);this.frameId=requestAnimationFrame(t=>this.frame(t));}
 dispose(){this.disposed=true;cancelAnimationFrame(this.frameId);clearTimeout(this.draftTimer);this.abort.abort();this.observer.disconnect();this.orbit.dispose();this.transform.dispose();this.grid.geometry.dispose();for(const m of Array.isArray(this.grid.material)?this.grid.material:[this.grid.material])m.dispose();this.outline.geometry.dispose();(this.outline.material as T.Material).dispose();for(const m of this.lightIcons.values()){m.geometry.dispose();(m.material as T.Material).dispose();}this.host.dispose();this.root.replaceChildren();}

}
