import './style.css';
import { Assets } from './game/assets.ts';
import { GameAudio } from './game/audio.ts';
import { Input } from './game/input.ts';
import { Renderer } from './game/renderer.ts';
import { World } from './game/world.ts';
import { Interface } from './ui/interface.ts';
import type { GameSettings } from './game/types.ts';

const defaults:GameSettings={volume:.35,particles:true,shake:!matchMedia('(prefers-reduced-motion: reduce)').matches,difficulty:'normal'};
let settings={...defaults};
try {const saved=JSON.parse(localStorage.getItem('nullpoint-settings')||'null');if(saved){settings={volume:typeof saved.volume==='number'?Math.max(0,Math.min(1,saved.volume)):defaults.volume,particles:typeof saved.particles==='boolean'?saved.particles:true,shake:typeof saved.shake==='boolean'?saved.shake:defaults.shake,difficulty:saved.difficulty==='story'?'story':'normal'};}}catch{/* Corrupt settings use safe defaults. */}
const world=new World(settings),audio=new GameAudio(),assets=new Assets();
audio.setVolume(settings.volume);world.onSound=sound=>audio.play(sound);
const ui=new Interface(world,audio),input=new Input(ui.canvas);
input.onPause=()=>ui.pause();input.accepts=action=>world.acceptsAction(action);ui.onAction=action=>input.press(action);
ui.onMove=(key,pressed)=>{if(pressed)input.keys.add(key);else input.keys.delete(key);};
const phaseHandler=world.onPhase;
world.onPhase=phase=>{input.clear();input.enabled=phase==='playing';phaseHandler(phase);};
const autoPause=()=>{input.clear();if(world.phase==='playing')world.setPhase('paused');};
document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();});
window.addEventListener('blur',autoPause);

try {
  await assets.load(progress=>ui.loading(progress));
  const renderer=new Renderer(ui.canvas,assets);ui.loaded();
  let previous=performance.now(),accumulator=0,hudTimer=0;
  function frame(now:number){
    const elapsed=Math.min((now-previous)/1000,.08);previous=now;accumulator+=elapsed;
    while(accumulator>=1/60){
      // Consume every step: impact freeze must never turn an early press into a queued attack.
      const actions=input.consume();
      world.update(1/60,input.direction,actions);accumulator-=1/60;
    }
    renderer.draw(world,elapsed,accumulator/(1/60));hudTimer+=elapsed;if(hudTimer>.07){ui.update();hudTimer=0;}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Read-only telemetry for development and browser smoke tests. Absent from production builds.
  if(import.meta.env.DEV)Object.defineProperty(window,'__NULLPOINT__',{value:{snapshot:()=>({phase:world.phase,sector:world.sector,training:world.training,lift:{...world.lift,ready:world.liftReady,near:world.nearLift,canUse:world.canUseLift,travel:world.liftTravel},combat:{chain:[...world.chain],readySuper:world.readySuper,superTimer:world.superTimer,canAttack:world.acceptsAction('attack'),superEffects:world.superEffects.map(e=>({...e})),hits:world.comboCount,damage:world.comboDamage,notice:world.moveNotice},player:{...world.player},stats:{...world.stats},enemies:world.enemies.map(e=>({id:e.id,kind:e.kind,hp:e.hp,x:e.x,y:e.y,state:e.state,timer:e.timer,height:e.height,elevation:e.elevation,juggleHits:e.juggleHits,targetX:e.targetX,targetY:e.targetY})),particles:world.particles.length,camera:world.camera})}});
}catch(error){ui.loadError(error instanceof Error?error.message:'Проверьте доступность файлов в public/assets.');console.error(error);}
