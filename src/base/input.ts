import type {BaseWorld} from './world.ts';
import type {BaseRenderer} from './renderer.ts';
import type {BaseUI} from './ui.ts';
import type {Action} from './types.ts';
export class BaseInput{
 keys=new Set<string>();
 constructor(private w:BaseWorld,private renderer:BaseRenderer,private ui:BaseUI){
  const canvas=renderer.canvas;
  window.addEventListener('keydown',e=>{
   if(e.code==='Escape'){e.preventDefault();if(!e.repeat){this.clear();if(ui.timeOpen)ui.setTimePanel(false);else if(ui.dialog.open)ui.close();else if(w.doorInteraction)w.action({type:'door-leave'});else ui.togglePause();}return;}
   if((e.target as HTMLElement).closest('input,textarea,select,#time-panel')||(['Space','Enter'].includes(e.code)&&(e.target as HTMLElement).closest('button')))return;
   if(['KeyI','KeyM'].includes(e.code)){e.preventDefault();if(!e.repeat){this.clear();if(ui.dialog.open)ui.close();else ui.open(e.code==='KeyI'?'inventory':'map');}return;}
   if(w.phase!=='playing')return;
   const controlled=['KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyE','KeyQ','KeyF','KeyJ','KeyH','ShiftLeft','ShiftRight','Space'];if(controlled.includes(e.code))e.preventDefault();
   this.keys.add(e.code);if(['KeyA','KeyD','ArrowLeft','ArrowRight'].includes(e.code))w.mouseAim=false;if(e.repeat)return;
   const action:Record<string,Action['type']>={KeyE:'interact',KeyQ:'door-peek',KeyF:'flashlight',KeyJ:'shove',KeyH:'bandage',KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down'};if(action[e.code])w.action({type:action[e.code]});
  });
  window.addEventListener('keyup',e=>this.keys.delete(e.code));
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||w.phase!=='playing')return;const b=canvas.getBoundingClientRect(),point=renderer.screenToWorld({x:e.clientX-b.left,y:e.clientY-b.top});w.aimAt(point);renderer.hover=renderer.hitAt(point);canvas.style.cursor=renderer.hover?'pointer':'crosshair';});
  canvas.addEventListener('pointerleave',()=>{renderer.hover=null;});
  canvas.addEventListener('click',e=>{if(w.phase!=='playing')return;canvas.focus();const b=canvas.getBoundingClientRect(),point=renderer.screenToWorld({x:e.clientX-b.left,y:e.clientY-b.top}),id=renderer.hitAt(point);if(id){const item=w.objects.find(o=>o.id===id)||w.doors.find(d=>d.id===id)!;if(item.floor===w.player.floor&&Math.abs(item.x-w.player.x)<76)w.action({type:'interact',target:id});else w.setTarget(item.x,item.floor,id);}else w.setTarget(point.x,renderer.floorAtScreen(point));});
  canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.zoomBy(e.deltaY<0?.08:-.08);},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  ui.onMove=(key,down)=>{w.mouseAim=false;if(down)this.keys.add(key);else this.keys.delete(key);};ui.onAction=a=>w.action(a);
 }
 clear(){this.keys.clear();}
 update(dt:number){
  const keys=this.keys;if(this.ui.timeOpen)keys.clear();if(this.w.phase==='playing'&&!this.w.player.stair){if(keys.has('KeyW')||keys.has('ArrowUp'))this.w.tryStair(1);else if(keys.has('KeyS')||keys.has('ArrowDown'))this.w.tryStair(-1);}
  const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  this.w.update(dt,dx,keys.has('ShiftLeft')||keys.has('ShiftRight'));
 }
}
