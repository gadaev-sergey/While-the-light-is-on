import type {EngineModule,SessionOptions,RuntimeSession,ComponentType} from '@shelter/sdk.ts';
import {storageKey} from '@shelter/project.ts';
import {World,readLevel,solvable,WEAPONS,type Controls} from './world.ts';
import {Renderer} from './renderer.ts';
import {AudioEngine} from './audio.ts';

const clock=(s:number)=>`${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const BRIEF:Record<string,string>={airlock:'Вход в станцию. Найди синюю карту и спустись лифтом.',lab:'Здесь началось заражение. Нужны обе карты доступа.',core:'Источник холода. Хранитель не выпустит тебя живым.'};
const components:ComponentType[]=[
 {id:'merzlota.spawn',name:'Начало пути',fields:[{name:'angle',label:'Направление взгляда',type:'number',default:0,min:0,max:359,unit:'°'}]},
 {id:'merzlota.enemy',name:'Враг',fields:[{name:'kind',label:'Вид',type:'select',default:'crawler',options:[{value:'crawler',label:'Снежник'},{value:'drone',label:'Страж'},{value:'brute',label:'Мерзлый'},{value:'boss',label:'Хранитель льда'}]}]},
 {id:'merzlota.item',name:'Предмет',fields:[{name:'kind',label:'Вид',type:'select',default:'health',options:[['health','Ампула'],['medkit','Аптечка'],['armor','Бронежилет'],['shells','Патроны дробовика'],['cells','Энергоячейки'],['shotgun','Дробовик «Тайга»'],['rifle','Винтовка «Аврора»'],['blue','Синяя карта'],['red','Красная карта']].map(([value,label])=>({value,label}))}]},
];

export async function startGame(options:SessionOptions):Promise<RuntimeSession>{
 await import('./style.css');
 const manifest=options.snapshot.manifest,ordered=manifest.scenes.map(s=>options.snapshot.scenes[s.id]).filter(Boolean);
 for(const scene of ordered)options.registry.validate(scene,manifest);
 const root=options.container,oldTitle=document.title;document.title=manifest.name;root.classList.add('merzlota');
 const world=new World(ordered),audio=new AudioEngine();
 const first=world.levels.findIndex(l=>l.id===options.sceneId);if(first>0)world.load(world.levels[first].id);
 root.innerHTML=`<canvas class="m-canvas" tabindex="0" aria-label="Мерзлота — шутер от первого лица"></canvas><div class="m-frost"></div><div class="m-damage"></div><div class="m-pickup"></div>
 <section class="m-title"><header><a class="m-brand" href="https://gadaev-sergey.github.io/shelter-arcade/" target="_blank" rel="noopener">SHELTER <i>/</i> ARCADE</a><span class="m-live"><i></i> ПОЛЮС-9 · СВЯЗИ НЕТ 41 ЧАС</span><button class="m-chip" data-action="sound">ЗВУК ВКЛ.</button></header>
 <div class="m-intro"><div class="m-eyebrow">ШУТЕР ОТ ПЕРВОГО ЛИЦА · 3 СЕКТОРА</div><h1>МЕРЗЛОТА<span>СТАНЦИЯ «ПОЛЮС-9»</span></h1><p>Станция замолчала сорок один час назад. Ты спускаешься в шлюз один. Внутри — то, что вмёрзло в лёд задолго до первых людей.</p></div>
 <div class="m-levels" role="radiogroup" aria-label="Выбор сектора"></div>
 <div class="m-start"><button class="m-primary" data-action="start">ВОЙТИ В ШЛЮЗ <span>↘</span></button><button class="m-text" data-action="help">Управление и правила</button></div>
 <footer><span><kbd>W A S D</kbd> движение</span><span><kbd>МЫШЬ</kbd> обзор</span><span><kbd>ЛКМ</kbd> огонь</span><span><kbd>1 2 3</kbd> оружие</span><span><kbd>TAB</kbd> карта</span><em>Оригинальная графика и звук · Shelter Engine</em></footer></section>
 <div class="m-hud" hidden><header class="m-top"><div class="m-sector"><small data-sector-num></small><strong data-sector></strong><span data-kills></span></div>
 <div class="m-boss" hidden><span>ХРАНИТЕЛЬ ЛЬДА</span><div><i data-boss></i></div></div>
 <div class="m-right"><div class="m-time"><small>ВРЕМЯ</small><b data-time>0:00</b></div><button class="m-round" data-action="map" aria-label="Карта">▦</button><button class="m-round" data-action="sound" aria-label="Выключить звук">♪</button><button class="m-round" data-action="pause" aria-label="Пауза">Ⅱ</button></div></header>
 <div class="m-cross"><i></i><i></i><i></i><i></i></div><div class="m-banner" role="status"></div><div class="m-hint"></div>
 <footer class="m-bar"><div class="m-stat m-hp"><small>ЗДОРОВЬЕ</small><b data-hp>100</b><div><i data-hp-bar></i></div></div><div class="m-stat m-armor"><small>БРОНЯ</small><b data-armor>0</b><div><i data-armor-bar></i></div></div>
 <div class="m-weapon"><div class="m-slots"><span data-slot="0">1</span><span data-slot="1">2</span><span data-slot="2">3</span></div><div><small data-wtype></small><strong data-wname></strong></div><b data-ammo>∞</b></div>
 <div class="m-keys"><small>ДОСТУП</small><div><span data-key="blue">СИН</span><span data-key="red">КРС</span></div></div></footer></div>
 <section class="m-modal" hidden role="dialog" aria-modal="true" aria-labelledby="m-modal-title"><div class="m-panel"></div></section>
 <div class="m-touch" hidden><div class="m-stick" data-stick="move"><i></i><span>ХОД</span></div><div class="m-touch-buttons"><button data-action="touch-weapon">ОРУЖИЕ</button><button data-action="map">КАРТА</button></div><div class="m-stick m-aim" data-stick="aim"><i></i><span>ОБЗОР + ОГОНЬ</span></div></div>`;
 const $=<E extends HTMLElement=HTMLElement>(q:string)=>root.querySelector<E>(q)!;const canvas=$<HTMLCanvasElement>('.m-canvas');
 let renderer:Renderer;try{renderer=new Renderer(canvas,world);}catch(error){root.innerHTML='<div style="padding:40px;color:white;background:#0b1320">Для «Мерзлоты» нужен браузер с поддержкой Canvas.</div>';throw error;}
 const abort=new AbortController(),keys=new Set<string>();let touch=matchMedia('(pointer:coarse)').matches;root.classList.toggle('m-mobile',touch);
 const progressKey=storageKey(manifest.projectId,'progress','campaign'),settingsKey=storageKey(manifest.projectId,'settings','audio');
 let selected=world.levelIndex,modal='',disposed=false,frame=0,previous=performance.now(),acc=0,ui=0,lastPhase='',fire=false,weapon=-1,move={x:0,y:0},aim=0,aiming=false,drag=false,lastX=0,endDelay=0;
 if(options.savePolicy==='persistent')try{world.restore(JSON.parse(localStorage.getItem(progressKey)||'null'));audio.setMuted(localStorage.getItem(settingsKey)==='muted');}catch{}
 selected=Math.min(selected,world.progress.unlocked-1);
 const save=()=>{if(options.savePolicy!=='persistent')return;try{localStorage.setItem(progressKey,JSON.stringify(world.progress));}catch{}};
 world.onSound=s=>audio.play(s);world.onResult=()=>save();
 const listen=(el:EventTarget,event:string,fn:EventListener)=>el.addEventListener(event,fn,{signal:abort.signal});
 const button=(action:string,label:string,primary=false)=>`<button class="${primary?'m-primary':'m-secondary'}" data-action="${action}">${label}${primary?' <span>↘</span>':''}</button>`;
 function clear(){keys.clear();fire=aiming=drag=false;weapon=-1;move={x:0,y:0};aim=0;root.querySelectorAll<HTMLElement>('.m-stick i').forEach(i=>i.style.transform='translate(-50%,-50%)');}
 function unlock(){if(document.pointerLockElement===canvas)document.exitPointerLock();}
 function lock(){if(touch)return;try{const r=canvas.requestPointerLock?.();if(r)void r.catch(()=>{});}catch{}}
 function hide(){modal='';$('.m-modal').hidden=true;clear();canvas.focus({preventScroll:true});}
 function begin(index:number,carry=false){const l=world.levels[index];if(!l||index>=world.progress.unlocked)return;selected=index;void audio.unlock();endDelay=0;hide();renderer.showMap=false;
  world.begin(l.id,carry?world.loadout():undefined);lock();update();}
 function pause(){if(world.phase!=='playing')return;world.pause(true);show('pause');unlock();update();}
 function resume(){world.pause(false);hide();lock();update();}
 function toTitle(){hide();unlock();world.load(world.levels[selected].id);world.phase='title';renderLevels();update();}
 function renderLevels(){
  $('.m-levels').innerHTML=world.levels.map((l,i)=>{const locked=i>=world.progress.unlocked,best=world.progress.best[l.id];
   return `<button class="m-level${i===selected?' selected':''}" role="radio" aria-checked="${i===selected}" data-level="${i}" ${locked?'aria-disabled="true"':''}><small>СЕКТОР ${String(i+1).padStart(2,'0')}</small><strong>${l.name}</strong><p>${BRIEF[l.id]||''}</p>
   <footer>${locked?'<span>⊘ Пройди предыдущий сектор</span>':best?`<span>Рекорд <b>${clock(best.time)}</b></span><span>${best.kills} врагов</span>`:`<span>${l.enemies.length} врагов</span><span>${l.w}×${l.h} м</span>`}</footer></button>`;}).join('');
 }
 function show(kind:string){
  modal=kind;clear();const panel=$('.m-panel'),l=world.level,r=world.result;$('.m-modal').hidden=false;panel.className='m-panel m-'+kind;
  if(kind==='pause')panel.innerHTML=`<div class="m-eyebrow">${l.name} · ${clock(world.seconds)}</div><h2 id="m-modal-title">ПАУЗА</h2><p>Станция ждёт. Враги — тоже.</p>${button('resume','ПРОДОЛЖИТЬ',true)}${button('restart','Начать сектор заново')}${button('help','Управление и правила')}${button('title','В главное меню')}<small>ESC / P — продолжить</small>`;
  if(kind==='help')panel.innerHTML=`<div class="m-eyebrow">ИНСТРУКТАЖ</div><h2 id="m-modal-title">ДЕРЖИСЬ<br>ПОДАЛЬШЕ ОТ ЛЬДА.</h2>
  <div class="m-controls"><span><kbd>W A S D</kbd> Движение</span><span><kbd>МЫШЬ / ← →</kbd> Обзор</span><span><kbd>ЛКМ / ПРОБЕЛ</kbd> Огонь</span><span><kbd>1 2 3</kbd> Оружие</span><span><kbd>TAB</kbd> Карта</span><span><kbd>ESC / P</kbd> Пауза</span></div>
  <p>Двери открываются сами, когда подходишь. Цветным дверям нужна карта доступа того же цвета. Лифт с зелёным светом ведёт в следующий сектор.</p>
  <p>Пистолет «ПМ-9» стреляет без ограничений. Дробовик «Тайга» и винтовка «Аврора» тратят патроны и энергоячейки. Бронежилет принимает на себя половину урона.</p>
  <small>Сенсорный экран: левый круг — ход, правый — обзор и огонь. Без захвата мыши: зажми ЛКМ и веди в сторону.</small>${button('touch-toggle',touch?'Сенсорное управление: включено':'Включить сенсорное управление')}${button('back','ПОНЯТНО',true)}`;
  if(kind==='complete'&&r){const next=world.levels[world.levelIndex+1],pct=(a:number,b:number)=>b?Math.round(a/b*100)+'%':'—';
   panel.innerHTML=`<div class="m-eyebrow">${r.best?'НОВЫЙ РЕКОРД · ':''}СЕКТОР ${String(world.levelIndex+1).padStart(2,'0')} ПРОЙДЕН</div><h2 id="m-modal-title">${r.last?'СТАНЦИЯ<br>ОЧИЩЕНА.':l.name.toUpperCase()}</h2>
   <div class="m-results"><div><b>${clock(r.time)}</b><span>ВРЕМЯ</span></div><div><b>${pct(r.kills,r.totalKills)}</b><span>ВРАГИ ${r.kills}/${r.totalKills}</span></div><div><b>${pct(r.items,r.totalItems)}</b><span>НАХОДКИ ${r.items}/${r.totalItems}</span></div></div>
   <p>${r.last?'Хранитель разбит, лёд отступает. Лифт поднимает тебя к свету — «Полюс-9» снова выходит на связь.':`Лифт спускается глубже. Снаряжение остаётся с тобой. Дальше — «${next?.name}».`}</p>
   ${r.last?button('title','В ГЛАВНОЕ МЕНЮ',true)+button('restart','Пройти сектор ещё раз'):button('next','СПУСТИТЬСЯ НИЖЕ',true)+button('restart','Пройти сектор ещё раз')+button('title','В главное меню')}`;}
  if(kind==='dead')panel.innerHTML=`<div class="m-eyebrow">${l.name} · ${clock(world.seconds)}</div><h2 id="m-modal-title">СВЯЗЬ<br>ПОТЕРЯНА.</h2><p>Врагов уничтожено: ${world.kills} из ${world.totalKills}. Сектор начнётся заново с тем снаряжением, с которым ты в него вошёл.</p>${button('restart','ЕЩЁ ПОПЫТКА',true)}${button('title','В главное меню')}`;
  requestAnimationFrame(()=>{if(!disposed)panel.querySelector<HTMLButtonElement>('button')?.focus();});
 }
 function update(){
  const title=world.phase==='title',p=world.player,l=world.level;$('.m-title').hidden=!title;$('.m-hud').hidden=title;$('.m-touch').hidden=!touch||world.phase!=='playing'||modal!=='';
  root.classList.toggle('m-playing',world.phase==='playing');
  root.querySelectorAll<HTMLButtonElement>('[data-action="sound"]').forEach(b=>{b.setAttribute('aria-label',audio.muted?'Включить звук':'Выключить звук');b.setAttribute('aria-pressed',String(!audio.muted));b.textContent=b.classList.contains('m-chip')?(audio.muted?'ЗВУК ВЫКЛ.':'ЗВУК ВКЛ.'):(audio.muted?'×':'♪');});
  if(title)return;
  $('[data-sector-num]').textContent=`СЕКТОР ${String(world.levelIndex+1).padStart(2,'0')}`;$('[data-sector]').textContent=l.name;$('[data-kills]').textContent=`ВРАГИ ${world.kills}/${world.totalKills}`;
  $('[data-time]').textContent=clock(world.seconds);
  $('[data-hp]').textContent=String(Math.ceil(p.hp));$('[data-hp-bar]').style.width=`${p.hp}%`;$('.m-hp').classList.toggle('low',p.hp<30);
  $('[data-armor]').textContent=String(Math.ceil(p.armor));$('[data-armor-bar]').style.width=`${p.armor}%`;
  const wp=WEAPONS[p.weapon];$('[data-wtype]').textContent=wp.type;$('[data-wname]').textContent=`«${wp.name}»`;$('[data-ammo]').textContent=wp.ammo?String(p[wp.ammo]):'∞';
  root.querySelectorAll<HTMLElement>('[data-slot]').forEach(s=>{const i=Number(s.dataset.slot);s.classList.toggle('owned',p.owned[i]);s.classList.toggle('active',i===p.weapon);});
  root.querySelectorAll<HTMLElement>('[data-key]').forEach(k=>k.classList.toggle('have',p.keys[k.dataset.key as 'blue'|'red']));
  const boss=world.boss;$('.m-boss').hidden=!boss||boss.state==='idle';if(boss)$('[data-boss]').style.width=`${boss.hp/boss.max*100}%`;
  $('.m-banner').textContent=world.banner;$('.m-banner').classList.toggle('show',world.bannerTime>0);
  $('.m-hint').textContent=world.hint||(world.phase==='playing'&&world.seconds<6?(touch?'Левый круг — ход · правый — обзор и огонь':'W A S D — движение · мышь — обзор · ЛКМ — огонь'):'');
 }
 function sound(){void audio.unlock();audio.setMuted(!audio.muted);if(options.savePolicy==='persistent')try{localStorage.setItem(settingsKey,audio.muted?'muted':'on');}catch{}update();}
 listen(root,'click',((event:MouseEvent)=>{
  const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;const a=b.dataset.action;
  if(b.dataset.level!==undefined){const i=Number(b.dataset.level);if(i<world.progress.unlocked){selected=i;world.load(world.levels[i].id);world.phase='title';renderLevels();root.querySelector<HTMLElement>(`[data-level="${i}"]`)?.focus();}return;}
  if(a==='start')begin(selected);if(a==='resume')resume();if(a==='pause')pause();if(a==='sound')sound();if(a==='map'){renderer.showMap=!renderer.showMap;canvas.focus();}
  if(a==='restart'){hide();endDelay=0;world.restart();lock();}if(a==='next')begin(world.levelIndex+1,true);if(a==='title')toTitle();
  if(a==='help'){if(world.phase==='playing')world.pause(true);show('help');unlock();}
  if(a==='back'){if(world.phase==='paused')show('pause');else hide();}
  if(a==='touch-toggle'){touch=!touch;root.classList.toggle('m-mobile',touch);show('help');}
  if(a==='touch-weapon'){const p=world.player;for(let k=1;k<=3;k++){const i=(p.weapon+k)%3;if(p.owned[i]){weapon=i;break;}}}
  update();
 }) as EventListener);
 const gameKeys=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Digit1','Digit2','Digit3'];
 listen(window,'keydown',((e:KeyboardEvent)=>{
  if(e.metaKey||e.altKey)return;const code=e.code;
  if(code==='Escape'||code==='KeyP'){e.preventDefault();if(e.repeat)return;if(modal==='help'){world.phase==='paused'?show('pause'):hide();}else if(world.phase==='paused')resume();else pause();update();return;}
  if(code==='KeyM'&&!e.repeat){sound();return;}
  if(code==='Tab'&&world.phase==='playing'){e.preventDefault();if(!e.repeat)renderer.showMap=!renderer.showMap;return;}
  if(world.phase==='title'&&code==='Enter'&&!modal&&document.activeElement?.closest('.m-levels,.m-start,header')===null){e.preventDefault();begin(selected);return;}
  if(world.phase!=='playing'||!gameKeys.includes(code))return;e.preventDefault();keys.add(code);if(code.startsWith('Digit')&&!e.repeat)weapon=Number(code.slice(-1))-1;
 }) as EventListener);
 listen(window,'keyup',((e:KeyboardEvent)=>{keys.delete(e.code);}) as EventListener);
 listen(canvas,'pointerdown',((e:PointerEvent)=>{if(world.phase!=='playing'||e.pointerType==='touch')return;e.preventDefault();canvas.focus();void audio.unlock();if(e.button===0){fire=true;drag=true;lastX=e.clientX;lock();}}) as EventListener);
 listen(window,'pointerup',()=>{fire=false;drag=false;});listen(canvas,'contextmenu',e=>e.preventDefault());
 listen(document,'mousemove',((e:MouseEvent)=>{if(world.phase!=='playing')return;if(document.pointerLockElement===canvas)world.player.angle+=e.movementX*.0024;else if(drag){world.player.angle+=(e.clientX-lastX)*.005;lastX=e.clientX;}}) as EventListener);
 listen(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&world.phase==='playing'&&!touch&&modal==='')pause();});
 listen(window,'blur',()=>{clear();pause();});listen(document,'visibilitychange',()=>{if(document.hidden){clear();pause();}});
 for(const stick of root.querySelectorAll<HTMLElement>('[data-stick]')){let pid=-1;
  const set=(e:PointerEvent)=>{const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,l=Math.max(34,Math.hypot(dx,dy)),x=dx/l,y=dy/l;stick.querySelector<HTMLElement>('i')!.style.transform=`translate(calc(-50% + ${x*30}px),calc(-50% + ${y*30}px))`;if(stick.dataset.stick==='move')move={x,y};else{aim=x;aiming=true;}};
  listen(stick,'pointerdown',((e:PointerEvent)=>{e.preventDefault();pid=e.pointerId;stick.setPointerCapture(pid);set(e);void audio.unlock();}) as EventListener);
  listen(stick,'pointermove',((e:PointerEvent)=>{if(pid===e.pointerId)set(e);}) as EventListener);
  const end=(e:Event)=>{if((e as PointerEvent).pointerId!==pid)return;pid=-1;if(stick.dataset.stick==='move')move={x:0,y:0};else{aim=0;aiming=false;}stick.querySelector<HTMLElement>('i')!.style.transform='translate(-50%,-50%)';};
  for(const t of ['pointerup','pointercancel','lostpointercapture'])listen(stick,t,end);}
 listen(root,'keydown',((e:KeyboardEvent)=>{if(e.key!=='Tab'||$('.m-modal').hidden)return;const list=[...$('.m-panel').querySelectorAll<HTMLButtonElement>('button')],f=list[0],l=list.at(-1);if(e.shiftKey&&document.activeElement===f){e.preventDefault();l?.focus();}else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f?.focus();}}) as EventListener);
 const observer=new ResizeObserver(()=>renderer.resize());observer.observe(canvas);
 const has=(...k:string[])=>k.some(x=>keys.has(x));
 const controls=():Controls=>({forward:Number(has('KeyW','ArrowUp'))-Number(has('KeyS','ArrowDown'))-move.y,strafe:Number(has('KeyD'))-Number(has('KeyA'))+move.x,
  turn:Number(has('ArrowRight','KeyE'))-Number(has('ArrowLeft','KeyQ'))+aim*1.1,fire:fire||has('Space')||aiming,weapon});
 function tick(now:number){
  if(disposed)return;const dt=Math.min(.05,(now-previous)/1000);previous=now;acc+=dt;
  if(world.phase==='title')world.player.angle+=dt*.12;
  while(acc>=1/120){world.step(1/120,controls());weapon=-1;acc-=1/120;}
  renderer.draw(dt);audio.update(world.phase==='playing'||world.phase==='title',world.enemies.some(e=>e.state==='chase'||e.state==='windup')?1:0);
  $('.m-damage').style.opacity=String(world.damage*.9);$('.m-pickup').style.opacity=String(world.pickupFlash*.35);
  if((world.phase==='complete'||world.phase==='dead')&&modal===''){endDelay+=dt;if(endDelay>(world.phase==='dead'?1.4:.6)){unlock();show(world.phase);renderLevels();}}
  ui+=dt;if(ui>.07||lastPhase!==world.phase){lastPhase=world.phase;ui=0;update();}
  frame=requestAnimationFrame(tick);
 }
 if(import.meta.env.DEV)Object.defineProperty(window,'__MERZLOTA__',{configurable:true,value:{world,renderer,snapshot:()=>({phase:world.phase,level:world.level.id,player:{...world.player},kills:world.kills,enemies:world.enemies.filter(e=>e.state!=='dead').length,seconds:world.seconds})}});
 renderLevels();update();frame=requestAnimationFrame(tick);
 return {pause(v){if(v)pause();else if(world.phase==='paused')resume();},
  dispose(){disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();unlock();audio.dispose();renderer.dispose();root.replaceChildren();root.classList.remove('merzlota','m-playing','m-mobile');document.title=oldTitle;if(import.meta.env.DEV)delete (window as any).__MERZLOTA__;},
  diagnostics:()=>({game:'merzlota',phase:world.phase,level:world.level.id,kills:world.kills,seconds:world.seconds})};
}
const module:EngineModule={id:'merzlota',sdk:1,components,validateScene(scene,project){const l=readLevel(scene);if(!solvable(l))throw new Error('Мерзлота: выход недостижим — проверьте двери и карты доступа.');if(l.next&&!project.scenes.some(s=>s.id===l.next))throw new Error('Мерзлота: следующий сектор не найден.');},createSession:startGame};
export default module;
