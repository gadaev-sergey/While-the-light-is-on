import type {EngineModule,SessionOptions,RuntimeSession,ComponentType} from '@shelter/sdk.ts';
import {storageKey} from '@shelter/project.ts';
import {World,readTrack,MAX_SPEED,NITRO_BOOST,KMH,type Controls,type Track} from './world.ts';
import {Renderer} from './renderer.ts';
import {AudioEngine} from './audio.ts';

const METERS_PER_SEGMENT=1.34;
const clock=(s:number)=>`${Math.floor(s/60)}:${(s%60).toFixed(1).padStart(4,'0')}`;
const TAGLINES:Record<string,string>={coast:'Закат, пальмы и широкие виражи',pass:'Ночь, серпантин и крутые перепады',city:'Неон, плотный трафик и узкие окна'};
const THEME_NAMES:Record<string,string>={coast:'ЗАКАТ',pass:'НОЧЬ',city:'НЕОН'};
const components:ComponentType[]=[
 {id:'zarevo.section',name:'Участок трассы',fields:[
  {name:'enter',label:'Въезд, сегменты',type:'number',default:30,min:0,max:500},{name:'hold',label:'Длина, сегменты',type:'number',default:100,min:1,max:1000},
  {name:'leave',label:'Выезд, сегменты',type:'number',default:30,min:0,max:500},{name:'curve',label:'Поворот (− влево, + вправо)',type:'number',default:0,min:-8,max:8,step:.5},
  {name:'hill',label:'Перепад высоты',type:'number',default:0,min:-120,max:120}]},
 {id:'zarevo.checkpoint',name:'Контрольная точка',fields:[{name:'segment',label:'Сегмент',type:'number',default:500,min:10,max:12000},{name:'bonus',label:'Бонус, с',type:'number',default:20,min:0,max:60,unit:'с'}]},
 {id:'zarevo.scenery',name:'Ряд декораций',fields:[
  {name:'kind',label:'Вид',type:'select',default:'palm',options:[['palm','Пальмы'],['lamp','Фонари'],['rock','Скалы'],['billboard','Щиты'],['house','Домики'],['pine','Ели'],['sign','Знаки поворота'],['rail','Столбики'],['tower','Небоскрёбы'],['neon','Неоновые вывески']].map(([value,label])=>({value,label}))},
  {name:'side',label:'Сторона',type:'select',default:'both',options:[{value:'left',label:'Слева'},{value:'right',label:'Справа'},{value:'both',label:'С обеих сторон'}]},
  {name:'from',label:'С сегмента',type:'number',default:0,min:0,max:12000},{name:'to',label:'До сегмента',type:'number',default:1000,min:0,max:12000},
  {name:'every',label:'Шаг',type:'number',default:20,min:2,max:1000},{name:'offset',label:'Отступ от края',type:'number',default:1.4,min:1.05,max:6,step:.05}]},
];

export async function startGame(options:SessionOptions):Promise<RuntimeSession>{
 await import('./style.css');
 const manifest=options.snapshot.manifest,ordered=manifest.scenes.map(s=>options.snapshot.scenes[s.id]).filter(Boolean);
 for(const scene of ordered)options.registry.validate(scene,manifest);
 const root=options.container,oldTitle=document.title;document.title=manifest.name;root.classList.add('zarevo');
 const world=new World(ordered),renderer0=()=>new Renderer($<HTMLCanvasElement>('.z-canvas'),world),audio=new AudioEngine();
 const first=world.tracks.findIndex(t=>t.id===options.sceneId);if(first>0)world.load(world.tracks[first].id,true);
 const tickMarks=(t:Track)=>{const total=world.tracks.find(x=>x===t)?world.length:1;return t.checkpoints.map(c=>`<i class="z-tick" style="left:${c.segment/total*100}%"></i>`).join('');};
 root.innerHTML=`<canvas class="z-canvas" tabindex="0" aria-label="Зарево — аркадная гонка"></canvas><div class="z-vignette"></div><div class="z-scan"></div>
 <section class="z-title"><header><a class="z-brand" href="https://gadaev-sergey.github.io/shelter-arcade/" target="_blank" rel="noopener">SHELTER <i>/</i> ARCADE</a><span class="z-live"><i></i> НОЧНАЯ ЛИГА · ВОЛНА 86.4</span><button class="z-chip" data-action="sound">ЗВУК ВКЛ.</button></header>
 <div class="z-intro"><div class="z-eyebrow">АРКАДНЫЕ ГОНКИ · 3 ТРАССЫ · 8 МАШИН</div><h1>ЗАРЕВО<span>НОЧНАЯ ГОНКА</span></h1><p>Восемь машин на старте и один таймер. Обгоняй впритык, копи нитро и успевай к контрольным точкам, пока не погасло зарево.</p></div>
 <div class="z-tracks" role="radiogroup" aria-label="Выбор трассы"></div>
 <div class="z-start"><button class="z-primary" data-action="start">НА СТАРТ <span>↗</span></button><button class="z-text" data-action="help">Управление и правила</button></div>
 <footer><span><kbd>← →</kbd> руль</span><span><kbd>↑</kbd> газ</span><span><kbd>↓</kbd> тормоз</span><span><kbd>ПРОБЕЛ</kbd> нитро</span><em>Shelter Engine · оригинальная графика и звук</em></footer></section>
 <div class="z-hud" hidden><header class="z-top"><div class="z-stage"><small data-stage-num></small><strong data-stage-name></strong><div class="z-progress"><b data-progress></b><span data-ticks></span><em data-dot></em></div></div>
 <div class="z-timer"><small>ВРЕМЯ</small><b data-time>0</b><span data-bonus></span></div>
 <div class="z-right"><div class="z-place"><b data-place>8</b><span data-of>/8</span><small>МЕСТО</small></div><div class="z-buttons"><button class="z-round" data-action="sound" aria-label="Выключить звук">♪</button><button class="z-round" data-action="pause" aria-label="Пауза">Ⅱ</button></div></div></header>
 <div class="z-count" aria-live="assertive"></div><div class="z-banner" role="status"></div><div class="z-popup"></div>
 <footer class="z-bottom"><div class="z-elapsed"><small>НА ТРАССЕ</small><b data-elapsed>0:00.0</b><span data-cp></span></div>
 <div class="z-speedo"><svg viewBox="0 0 200 120" aria-hidden="true"><path class="z-arc-bg" d="M20 110 A80 80 0 0 1 180 110"/><path class="z-arc" data-arc d="M20 110 A80 80 0 0 1 180 110"/></svg><b data-speed>0</b><small>КМ/Ч</small>
 <div class="z-nitro"><span>НИТРО</span><div><i data-nitro></i></div><em data-slip>ТЯГА</em></div></div></footer></div>
 <section class="z-modal" hidden role="dialog" aria-modal="true" aria-labelledby="z-modal-title"><div class="z-panel"></div></section>
 <div class="z-touch" hidden><div><button data-touch="left" aria-label="Влево">◀</button><button data-touch="right" aria-label="Вправо">▶</button></div><div><button data-touch="brake">ТОРМОЗ</button><button data-touch="nitro">НИТРО</button></div></div>`;
 const $=<E extends HTMLElement=HTMLElement>(q:string)=>root.querySelector<E>(q)!;
 let renderer:Renderer;try{renderer=renderer0();}catch(error){root.innerHTML='<div style="padding:40px;color:white;background:#140b24">Для «Зарева» нужен браузер с поддержкой Canvas.</div>';throw error;}
 const abort=new AbortController(),keys=new Set<string>(),touchKeys=new Set<string>();let touch=matchMedia('(pointer:coarse)').matches;root.classList.toggle('z-mobile',touch);
 const progressKey=storageKey(manifest.projectId,'progress','career'),settingsKey=storageKey(manifest.projectId,'settings','audio');
 let selected=world.trackIndex,modal='',disposed=false,frame=0,previous=performance.now(),acc=0,ui=0,lastPhase='',endDelay=0,bonusTime=0,lastTime=0;
 if(options.savePolicy==='persistent')try{world.restore(JSON.parse(localStorage.getItem(progressKey)||'null'));audio.setMuted(localStorage.getItem(settingsKey)==='muted');}catch{}
 selected=Math.min(selected,world.progress.unlocked-1);
 const save=()=>{if(options.savePolicy!=='persistent')return;try{localStorage.setItem(progressKey,JSON.stringify(world.progress));}catch{}};
 world.onSound=s=>audio.play(s);world.onResult=()=>save();
 const listen=(el:EventTarget,event:string,fn:EventListener)=>el.addEventListener(event,fn,{signal:abort.signal});
 const button=(action:string,label:string,primary=false)=>`<button class="${primary?'z-primary':'z-secondary'}" data-action="${action}">${label}${primary?' <span>↗</span>':''}</button>`;
 function clear(){keys.clear();touchKeys.clear();root.querySelectorAll('[data-touch].pressed').forEach(b=>b.classList.remove('pressed'));}
 function hide(){modal='';$('.z-modal').hidden=true;clear();canvas.focus({preventScroll:true});}
 function start(index=selected){
  const track=world.tracks[index];if(!track||index>=world.progress.unlocked)return;selected=index;void audio.unlock();endDelay=0;hide();world.start(track.id);
  $('[data-ticks]').innerHTML=tickMarks(track);lastTime=world.time;update();
 }
 function pause(){if(!['countdown','racing'].includes(world.phase))return;world.pause(true);show('pause');update();}
 function resume(){world.pause(false);hide();update();}
 function toTitle(){hide();world.load(world.tracks[selected].id,true);world.phase='title';renderTracks();update();}
 function renderTracks(){
  $('.z-tracks').innerHTML=world.tracks.map((t,i)=>{const locked=i>=world.progress.unlocked,best=world.progress.best[t.id],km=(world.tracks[i]===world.track?world.length:t.sections.reduce((n,s)=>n+s.enter+s.hold+s.leave,0))*METERS_PER_SEGMENT/1000;
   return `<button class="z-track z-${t.theme}${i===selected?' selected':''}" role="radio" aria-checked="${i===selected}" data-track="${i}" ${locked?'aria-disabled="true"':''}><small>${String(i+1).padStart(2,'0')} · ${THEME_NAMES[t.theme]}</small><strong>${t.name}</strong><p>${TAGLINES[t.theme]}</p>
   <footer>${locked?`<span class="z-lock">⌁ Финишируй в тройке на «${world.tracks[i-1].name}»</span>`:best?`<span>Рекорд <b>${clock(best.time)}</b></span><span>${best.place}-е место</span>`:`<span>${km.toFixed(1)} км</span><span>${t.checkpoints.length} КТ</span>`}</footer></button>`;}).join('');
 }
 function show(kind:string){
  modal=kind;clear();const panel=$('.z-panel'),t=world.track,r=world.result;$('.z-modal').hidden=false;panel.className='z-panel z-'+kind;
  if(kind==='pause')panel.innerHTML=`<div class="z-eyebrow">${t.name} · ${clock(world.seconds)}</div><h2 id="z-modal-title">ПАУЗА</h2><p>Таймер остановлен. Соперники тоже ждут.</p>${button('resume','ПРОДОЛЖИТЬ',true)}${button('restart','Начать трассу заново')}${button('help','Управление и правила')}${button('title','В главное меню')}<small>ESC / P — продолжить</small>`;
  if(kind==='help')panel.innerHTML=`<div class="z-eyebrow">ПРАВИЛА НОЧНОЙ ЛИГИ</div><h2 id="z-modal-title">ГАЗ В ПОЛ.<br>ГОЛОВА ХОЛОДНАЯ.</h2>
  <div class="z-controls"><span><kbd>← → / A D</kbd> Руль</span><span><kbd>↑ / W</kbd> Газ</span><span><kbd>↓ / S</kbd> Тормоз</span><span><kbd>ПРОБЕЛ / SHIFT</kbd> Нитро</span><span><kbd>ESC / P</kbd> Пауза</span><span><kbd>M</kbd> Звук</span></div>
  <p>Ты стартуешь последним из восьми. Таймер идёт с первой секунды: каждая контрольная точка добавляет время. Обгони всех до финиша.</p>
  <p>В повороте машину выносит наружу — подруливай внутрь, а на крутых виражах сбрасывай газ. Обочина тормозит, столбы и деревья останавливают. Проезд впритык рядом с машиной и езда в её потоке заряжают нитро.</p>
  <small>Финиш в тройке открывает следующую трассу. На сенсорном экране газ включён всегда: ◀ ▶ — руль, справа тормоз и нитро.</small>${button('touch-toggle',touch?'Сенсорное управление: включено':'Включить сенсорное управление')}${button('back','ПОНЯТНО',true)}`;
  if(kind==='finished'&&r){
   const next=world.tracks[world.trackIndex+1],canNext=next&&world.trackIndex+1<world.progress.unlocked,champion=world.tracks.every(x=>world.progress.best[x.id]?.place===1);
   panel.innerHTML=`<div class="z-eyebrow">${r.best?'НОВЫЙ ЛИЧНЫЙ РЕКОРД · ':''}ФИНИШ · ${t.name}</div><div class="z-place-big"><b>${r.place}</b><span>${r.place===1?'ПОБЕДА':'-е место'}</span></div>
   <h2 id="z-modal-title">${r.place===1?'ЗАРЕВО — ТВОЁ.':r.place<=3?'ПОДИУМ ВЗЯТ.':'ЕЩЁ НЕ ПРЕДЕЛ.'}</h2>
   <div class="z-results"><div><b>${clock(r.time)}</b><span>ВРЕМЯ</span></div><div><b>${r.overtakes}</b><span>ОБГОНОВ</span></div><div><b>${r.misses}</b><span>ВПРИТЫК</span></div></div>
   <p>${champion?'Все три трассы выиграны. Ты — чемпион Ночной лиги.':r.place<=3?(next?(canNext?`Открыта трасса «${next.name}».`:''):'Это была последняя трасса лиги. Попробуй выиграть каждую.'):'Финишируй в тройке, чтобы открыть следующую трассу.'}</p>
   ${canNext?button('next',`ДАЛЬШЕ: ${next.name.toUpperCase()}`,true)+button('restart','Ещё раз'):button('restart','ЕЩЁ РАЗ',true)}${button('title','В главное меню')}`;
  }
  if(kind==='timeout')panel.innerHTML=`<div class="z-eyebrow">${t.name} · ПРОЙДЕНО ${Math.round(world.progressShare*100)}%</div><h2 id="z-modal-title">ВРЕМЯ<br>ВЫШЛО.</h2><p>Контрольная точка не дождалась. Держи газ, срезай повороты по внутренней и копи нитро на прямых.</p>${button('restart','ЕЩЁ ПОПЫТКА',true)}${button('title','В главное меню')}`;
  requestAnimationFrame(()=>{if(!disposed)panel.querySelector<HTMLButtonElement>('button')?.focus();});
 }
 function update(){
  const title=world.phase==='title',p=world.player,t=world.track;$('.z-title').hidden=!title;$('.z-hud').hidden=title;$('.z-touch').hidden=!touch||!['racing','countdown'].includes(world.phase)||modal!=='';
  root.classList.toggle('z-racing',world.phase==='racing');
  if(title)return;
  $('[data-stage-num]').textContent=`ТРАССА ${String(world.trackIndex+1).padStart(2,'0')} · ${THEME_NAMES[t.theme]}`;$('[data-stage-name]').textContent=t.name;
  $('[data-progress]').style.width=`${world.progressShare*100}%`;$('[data-dot]').style.left=`${world.progressShare*100}%`;
  $('[data-time]').textContent=String(Math.ceil(world.time));$('.z-timer').classList.toggle('low',world.time<10&&world.phase==='racing');
  if(world.time>lastTime+1){$('[data-bonus]').textContent=`+${Math.round(world.time-lastTime)}`;bonusTime=1.6;}lastTime=world.time;$('.z-timer').classList.toggle('bonus',bonusTime>0);
  $('[data-place]').textContent=String(world.place);$('[data-of]').textContent=`/${t.rivals+1}`;$('[data-elapsed]').textContent=clock(world.seconds);
  $('[data-cp]').textContent=`КОНТРОЛЬ ${world.nextCheckpoint}/${t.checkpoints.length}`;
  const kmh=Math.round(p.speed*KMH);$('[data-speed]').textContent=String(kmh);
  const arc=$<SVGPathElement & HTMLElement>('[data-arc]');arc.style.strokeDasharray=`${Math.min(1,p.speed/(MAX_SPEED*NITRO_BOOST))*252} 252`;
  $('[data-nitro]').style.width=`${p.nitro*100}%`;$('.z-nitro').classList.toggle('ready',p.nitro>.25);$('.z-nitro').classList.toggle('on',p.boosting);$('[data-slip]').classList.toggle('show',world.slip>0);
  const count=world.phase==='countdown'?Math.ceil(world.countdown-.6):0;$('.z-count').textContent=count>0?String(count):'';$('.z-count').classList.toggle('show',count>0);
  $('.z-banner').textContent=world.banner;$('.z-banner').classList.toggle('show',world.bannerTime>0&&count<=0);
  $('.z-popup').textContent=world.popup;$('.z-popup').classList.toggle('show',world.popupTime>0);
  root.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach(b=>{b.setAttribute('aria-label',audio.muted?'Включить звук':'Выключить звук');b.setAttribute('aria-pressed',String(!audio.muted));b.textContent=b.classList.contains('z-chip')?(audio.muted?'ЗВУК ВЫКЛ.':'ЗВУК ВКЛ.'):(audio.muted?'×':'♪');});
 }
 function sound(){void audio.unlock();audio.setMuted(!audio.muted);if(options.savePolicy==='persistent')try{localStorage.setItem(settingsKey,audio.muted?'muted':'on');}catch{}update();
  root.querySelectorAll<HTMLButtonElement>('.z-chip').forEach(b=>b.textContent=audio.muted?'ЗВУК ВЫКЛ.':'ЗВУК ВКЛ.');}
 const canvas=$<HTMLCanvasElement>('.z-canvas');
 listen(root,'click',((event:MouseEvent)=>{
  const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;const action=b.dataset.action;
  if(b.dataset.track!==undefined){const i=Number(b.dataset.track);if(i<world.progress.unlocked){selected=i;world.load(world.tracks[i].id,true);world.phase='title';renderTracks();root.querySelector<HTMLElement>(`[data-track="${i}"]`)?.focus();}return;}
  if(action==='start')start();if(action==='resume')resume();if(action==='pause')pause();if(action==='sound')sound();
  if(action==='restart')start(world.trackIndex);if(action==='next')start(world.trackIndex+1);if(action==='title')toTitle();
  if(action==='help'){if(['countdown','racing'].includes(world.phase))world.pause(true);show('help');}
  if(action==='back'){if(world.phase==='paused')show('pause');else hide();}
  if(action==='touch-toggle'){touch=!touch;root.classList.toggle('z-mobile',touch);fitTouch();show('help');}
  update();
 }) as EventListener);
 const steerKeys=['ArrowLeft','ArrowRight','KeyA','KeyD','ArrowUp','ArrowDown','KeyW','KeyS','Space','ShiftLeft','ShiftRight'];
 listen(window,'keydown',((e:KeyboardEvent)=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;const code=e.code;
  if(code==='Escape'||code==='KeyP'){e.preventDefault();if(e.repeat)return;if(modal==='help'){world.phase==='paused'?show('pause'):hide();}else if(world.phase==='paused')resume();else pause();update();return;}
  if(code==='KeyM'&&!e.repeat){sound();return;}
  if(world.phase==='title'&&(code==='Enter'||code==='Space')&&!modal&&document.activeElement?.closest('.z-tracks,.z-start,header')===null){e.preventDefault();start();return;}
  if(world.phase==='title'&&!modal&&(code==='ArrowLeft'||code==='ArrowRight')){const i=selected+(code==='ArrowLeft'?-1:1);if(i>=0&&i<world.progress.unlocked){selected=i;world.load(world.tracks[i].id,true);world.phase='title';renderTracks();}e.preventDefault();return;}
  if(steerKeys.includes(code)&&['countdown','racing'].includes(world.phase)){e.preventDefault();keys.add(code);void audio.unlock();}
 }) as EventListener);
 listen(window,'keyup',((e:KeyboardEvent)=>{keys.delete(e.code);}) as EventListener);
 listen(window,'blur',()=>{clear();pause();});listen(document,'visibilitychange',()=>{if(document.hidden){clear();pause();}});
 for(const b of root.querySelectorAll<HTMLButtonElement>('[data-touch]')){
  const id=b.dataset.touch!;listen(b,'pointerdown',((e:PointerEvent)=>{e.preventDefault();b.setPointerCapture(e.pointerId);touchKeys.add(id);b.classList.add('pressed');void audio.unlock();}) as EventListener);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(b,type,()=>{touchKeys.delete(id);b.classList.remove('pressed');});
 }
 listen(root,'contextmenu',e=>{if((e.target as HTMLElement).closest('.z-touch,.z-canvas'))e.preventDefault();});
 listen(root,'keydown',((e:KeyboardEvent)=>{if(e.key!=='Tab'||$('.z-modal').hidden)return;const list=[...$('.z-panel').querySelectorAll<HTMLButtonElement>('button')],firstB=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===firstB){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();firstB?.focus();}}) as EventListener);
 const fitTouch=()=>{renderer.inset=touch?.13:0;renderer.layout();};fitTouch();
 const observer=new ResizeObserver(()=>renderer.resize());observer.observe(canvas);
 const controls=():Controls=>{
  const has=(...k:string[])=>k.some(x=>keys.has(x));
  return {steer:Number(has('ArrowRight','KeyD')||touchKeys.has('right'))-Number(has('ArrowLeft','KeyA')||touchKeys.has('left')),
   gas:has('ArrowUp','KeyW')||touch&&!touchKeys.has('brake')?1:0,brake:has('ArrowDown','KeyS')||touchKeys.has('brake')?1:0,nitro:has('Space','ShiftLeft','ShiftRight')||touchKeys.has('nitro')};
 };
 function tick(now:number){
  if(disposed)return;const dt=Math.min(.05,(now-previous)/1000);previous=now;acc+=dt;
  while(acc>=1/120){world.step(1/120,controls());acc-=1/120;}
  renderer.draw(dt);audio.update(world.player.speed/MAX_SPEED,world.phase!=='title'&&world.phase!=='paused',world.player.boosting,world.phase!=='paused');
  bonusTime=Math.max(0,bonusTime-dt);
  if((world.phase==='finished'||world.phase==='timeout')&&modal===''){endDelay+=dt;if(endDelay>(world.phase==='finished'?2:1.6)){show(world.phase);renderTracks();}}
  ui+=dt;if(ui>.06||lastPhase!==world.phase){lastPhase=world.phase;ui=0;update();}
  frame=requestAnimationFrame(tick);
 }
 if(import.meta.env.DEV)Object.defineProperty(window,'__ZAREVO__',{configurable:true,value:{world,renderer,snapshot:()=>({phase:world.phase,track:world.track.id,place:world.place,time:world.time,seconds:world.seconds,player:{...world.player},progress:structuredClone(world.progress)})}});
 renderTracks();update();frame=requestAnimationFrame(tick);
 return {pause(value){if(value)pause();else if(world.phase==='paused')resume();},
  dispose(){disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();audio.dispose();renderer.dispose();root.replaceChildren();root.classList.remove('zarevo','z-racing','z-mobile');document.title=oldTitle;if(import.meta.env.DEV)delete (window as any).__ZAREVO__;},
  diagnostics:()=>({game:'zarevo',phase:world.phase,track:world.track.id,place:world.place,seconds:world.seconds})};
}
const module:EngineModule={id:'zarevo',sdk:1,components,validateScene(scene,project){const t=readTrack(scene);if(t.next&&!project.scenes.some(s=>s.id===t.next))throw new Error('Зарево: следующая трасса не найдена.');},createSession:startGame};
export default module;
