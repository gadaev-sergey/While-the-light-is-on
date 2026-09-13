import './base/style.css';
import {BaseWorld} from './base/world.ts';
import {BaseAssets} from './base/assets.ts';
import {BaseRenderer} from './base/renderer.ts';
import {BaseUI} from './base/ui.ts';
import {BaseInput} from './base/input.ts';
import {BaseAudio} from './base/audio.ts';
const world=new BaseWorld(),assets=new BaseAssets(),audio=new BaseAudio(),ui=new BaseUI(world),SAVE_KEY='shelter-base-v1';
try{const save=localStorage.getItem(SAVE_KEY);if(save)world.restore(JSON.parse(save));}catch{/* Start clean if a save is unavailable or invalid. */}
world.onSound=name=>audio.play(name);
try{
 await assets.load(n=>ui.loading(n));const renderer=new BaseRenderer(ui.canvas,assets),input=new BaseInput(world,renderer,ui);ui.renderer=renderer;ui.loaded(assets.images.idle);
 let previous=performance.now(),accumulator=0,uiTime=0,saveTime=0;
 const save=()=>{try{if(!world.player.stair&&!world.task){localStorage.setItem(SAVE_KEY,JSON.stringify(world.save()));}}catch{ui.$('#save-status').textContent='СОХРАНЕНИЕ НЕДОСТУПНО';}};
 ui.onReset=()=>{input.clear();world.reset();renderer.hero.reset();renderer.zoom=1;save();};
 const pause=()=>{input.clear();save();if(world.phase==='playing')ui.open('pause');};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);
 window.addEventListener('pagehide',save);
 function frame(now:number){const dt=Math.min((now-previous)/1000,.08);previous=now;accumulator+=dt;while(accumulator>=1/60){input.update(1/60);accumulator-=1/60;}renderer.draw(world,dt,world.phase==='playing'?accumulator/(1/60):1);uiTime+=dt;saveTime+=dt;if(uiTime>.065){ui.update();uiTime=0;}if(saveTime>2){save();saveTime=0;}requestAnimationFrame(frame);}
 ui.update();requestAnimationFrame(frame);
 if(import.meta.env.DEV)Object.defineProperty(window,'__BASE__',{value:{snapshot:()=>world.snapshot(),projection:(x:number,y:number)=>renderer.worldToScreen({x,y})}});
}catch(error){ui.$('#base-progress').textContent=error instanceof Error?error.message:'Ошибка загрузки';console.error(error);}
