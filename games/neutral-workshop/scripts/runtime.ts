
import {toLevel} from './layout-adapter.ts';
import type {Layout} from '@shelter/layout.ts';
import {BaseWorld} from './game/world.ts';
import {BaseAssets} from './game/assets.ts';
import {ThreeRenderer} from './game/renderer-3d.ts';
import {BaseUI} from './game/ui.ts';
import {BaseInput} from './game/input.ts';
import {BaseAudio} from './game/audio.ts';
import {ShelterSceneRuntime} from './scene-adapter.ts';
import {storageKey} from '@shelter/project.ts';
import type {EngineModule,SessionOptions,RuntimeSession,BehaviorContext} from '@shelter/sdk.ts';
export async function startGame(options:SessionOptions):Promise<RuntimeSession>{
 await import('./game/style.css');
 const authored=options.snapshot.scenes[options.sceneId];
 const world=new BaseWorld(authored.moduleData?.layout?toLevel(authored.moduleData.layout as Layout):undefined),assets=new BaseAssets(options.assetUrl),audio=new BaseAudio(),ui=new BaseUI(world),key=storageKey(options.snapshot.manifest.projectId,'progress',options.snapshot.manifest.build.appId);let progress:any;
 if(options.savePolicy==='persistent')try{const stored=localStorage.getItem(key)||localStorage.getItem('shelter-base-v1');progress=JSON.parse(stored||'null');if(stored&&!localStorage.getItem(key))localStorage.setItem(key,stored);}catch{}
 world.onSound=n=>audio.play(n);await assets.load(n=>ui.loading(n));const renderer=new ThreeRenderer(ui.canvas,assets,world.level),runtime=new ShelterSceneRuntime(renderer,world),doc=options.snapshot.scenes[options.sceneId];
 const {AssetStore}=await import('@shelter/assets.ts');const store=new AssetStore();await store.load(options.snapshot.manifest.assets,options.assetUrl);store.bind(runtime);
 for(let i=0;i<renderer.models.materials.length;i++){const map=renderer.models.materials[i].map;if(map)runtime.textures.set('tile-'+i,map);}
 runtime.apply(doc.moduleData?.legacySeed?runtime.initial:doc);if(progress)world.restore(progress);
 const keys=new Set<string>();const contexts:BehaviorContext[]=doc.nodes.flatMap(node=>(node.components||[]).map(component=>({node,component,runtime,scene:doc,transition:()=>{},keys})));for(const context of contexts)options.registry.components.get(context.component.type)?.load?.(context);renderer.beforeRender=()=>runtime.beforeRender(false);const input=new BaseInput(world,renderer,ui);ui.renderer=renderer;ui.loaded(assets.images.idle);
 let frameId=0,previous=performance.now(),accumulator=0,uiTime=0,saveTime=0,disposed=false;const abort=new AbortController();
 const save=()=>{if(options.savePolicy==='persistent'&&!world.player.stair&&!world.task)try{localStorage.setItem(key,JSON.stringify(world.save()));}catch{ui.$('#save-status').textContent='СОХРАНЕНИЕ НЕДОСТУПНО';}};
 ui.onReset=()=>{input.clear();world.reset();runtime.apply(doc);renderer.hero.reset();renderer.resetView();save();};
 const pause=()=>{input.clear();save();if(world.phase==='playing')ui.open('pause');};window.addEventListener('blur',pause,{signal:abort.signal});window.addEventListener('pagehide',save,{signal:abort.signal});
 function frame(now:number){if(disposed)return;const dt=Math.min((now-previous)/1000,.08);previous=now;accumulator+=dt;while(accumulator>=1/60){input.update(1/60);accumulator-=1/60;}if(world.phase==='playing')for(const context of contexts)options.registry.components.get(context.component.type)?.update?.(context,dt);renderer.draw(world,dt,world.phase==='playing'?accumulator/(1/60):1);uiTime+=dt;saveTime+=dt;if(uiTime>.065){ui.update();uiTime=0;}if(saveTime>2){save();saveTime=0;}frameId=requestAnimationFrame(frame);}
 ui.update();frameId=requestAnimationFrame(frame);
 if(import.meta.env.DEV)Object.defineProperty(window,'__BASE__',{configurable:true,value:{snapshot:()=>world.snapshot(),projection:(x:number,y:number)=>renderer.worldToScreen({x,y}),rendering:()=>renderer.diagnostics()}});
 return {pause(p){world.phase=p?'paused':'playing';input.clear();if(p)for(const context of contexts)options.registry.components.get(context.component.type)?.pause?.(context);},dispose(){save();disposed=true;cancelAnimationFrame(frameId);abort.abort();input.dispose();for(const context of contexts)options.registry.components.get(context.component.type)?.dispose?.(context);runtime.dispose();renderer.dispose();store.dispose();void audio.context?.close();},diagnostics:()=>renderer.diagnostics()};
}
const module:EngineModule={id:'while-light',sdk:1,validateScene(scene){if(scene.nodes.some(n=>n.components?.some(c=>c.type==='basic.portal')))throw new Error('В этом модуле дома переходы между сценами не заданы.');},createSession:startGame};export default module;
