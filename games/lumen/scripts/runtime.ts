import type {EngineModule,SessionOptions,RuntimeSession,ComponentType} from '@shelter/sdk.ts';
import {storageKey} from '@shelter/project.ts';
import {World,readLevel,type Controls,type Progress} from './world.ts';
import {Renderer} from './renderer.ts';
import {Audio} from './audio.ts';

const icon={pause:'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',sound:'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/></svg>',mute:'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 6 6m0-6-6 6"/></svg>',full:'<svg viewBox="0 0 24 24"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>',arrow:'<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',diamond:'<svg viewBox="0 0 24 24"><path d="m12 2 8 10-8 10-8-10Z"/><path d="m12 7 4 5-4 5-4-5Z"/></svg>'};
const formatTime=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const names:Record<string,string>={solid:'Каменная земля',platform:'Уступ',moving:'Движущаяся платформа',thorn:'Опасные кристаллы',spark:'Искра',lens:'Линза маяка',checkpoint:'Контрольный огонёк',enemy:'Тень',beacon:'Маяк',spawn:'Начало пути',sign:'Подсказка'};
const components:ComponentType[]=Object.entries(names).map(([kind,name])=>({id:'lumen.'+kind,name,fields:
 kind==='enemy'||kind==='moving'?[
  {name:'axis',label:'Ось движения',type:'select',default:'x',options:[{value:'x',label:'Горизонтально'},{value:'y',label:'Вертикально'}]},
  {name:'range',label:'Размах, игровые пиксели',type:'number',default:70,min:0,max:400},
  {name:'speed',label:'Скорость цикла',type:'number',default:1,min:.1,max:5},
  {name:'phase',label:'Сдвиг цикла',type:'number',default:0,min:0,max:6.29},
 ]:kind==='sign'?[
  {name:'text',label:'Текст',type:'string',default:'Иди к свету'},
  {name:'radius',label:'Дальность подсказки',type:'number',default:170,min:20,max:500},
 ]:kind==='beacon'?[{name:'next',label:'Следующая сцена (пусто — финал)',type:'string',default:''}]:[]
}));

export async function startGame(options:SessionOptions):Promise<RuntimeSession>{
 await import('./style.css');
 for(const scene of Object.values(options.snapshot.scenes))options.registry.validate(scene,options.snapshot.manifest);
 const root=options.container;root.classList.add('lumen-root');const previousTitle=document.title;document.title=options.snapshot.manifest.name;
 root.innerHTML=`
  <canvas class="lumen-canvas" tabindex="0" aria-label="Люмен: Последний маяк. A и D — движение, пробел — двойной прыжок, Shift — рывок, E — маяк."></canvas>
  <div class="lumen-grain"></div>
  <header class="lumen-hud" hidden>
   <div class="hud-location"><span class="mini-sigil">◈</span><div><span class="hud-eyebrow">ПОСЛЕДНИЙ МАЯК</span><strong data-region>Тихая гавань</strong></div><span class="region-number" data-number>01 / 03</span></div>
   <div class="hud-inventory"><span class="health" aria-label="Здоровье" data-health></span><span class="hud-divider"></span><span class="lens-counter" data-lenses>${icon.diamond}<b>0</b><small>/ 3</small></span><span class="spark-counter"><span>✧</span><b data-sparks>0</b></span></div>
   <div class="hud-buttons"><button class="icon-button" data-sound aria-label="Выключить звук" title="Звук · M">${icon.sound}</button><button class="icon-button" data-full aria-label="На весь экран" title="На весь экран">${icon.full}</button><button class="icon-button" data-pause aria-label="Пауза" title="Пауза · Esc">${icon.pause}</button></div>
  </header>
  <div class="lumen-objective" hidden><span class="objective-label">ВЕРНИ СВЕТ ГОРОДУ</span><div><span data-objective>Найди три линзы</span><small data-stage>01</small></div><div class="journey-track" data-track></div></div>
  <div class="lumen-banner" role="status" aria-live="polite"><span data-banner></span></div>
  <div class="lumen-prompt" hidden><kbd>E</kbd><span></span></div>
  <div class="lumen-hint" hidden></div>
  <footer class="lumen-footer" hidden><div><kbd>A</kbd><kbd>D</kbd><span>идти</span><kbd>ПРОБЕЛ ×2</kbd><span>прыжок</span><kbd>SHIFT</kbd><span>рывок</span></div><span class="dash-status"><i></i><span data-dash>Рывок готов</span></span></footer>
  <div class="lumen-touch" hidden><div><button data-control="left" aria-label="Идти влево">←</button><button data-control="right" aria-label="Идти вправо">→</button></div><div><button data-control="interact" aria-label="Зажечь маяк">E</button><button data-control="dash" aria-label="Рывок">⇢</button><button data-control="jump" aria-label="Прыгнуть">↑</button></div></div>
  <section class="lumen-menu title-menu" aria-label="Главное меню">
   <div class="menu-topline"><span>◈ &nbsp; МАЛЕНЬКАЯ ИСТОРИЯ О СВЕТЕ</span><button class="icon-button" data-sound aria-label="Выключить звук">${icon.sound}</button></div>
   <div class="title-content"><div class="chapter-tag"><span></span> НОЧЬ ЕЩЁ НЕ КОНЕЦ</div><h1>ЛЮМЕН<span>ПОСЛЕДНИЙ МАЯК</span></h1><p class="title-description">Город уснул в объятиях тумана.<br>Возьми свой маленький огонь<br>и помоги ему встретить рассвет.</p><div class="title-actions"><button class="primary-button" data-start><span>Начать путешествие</span>${icon.arrow}</button><button class="text-button" data-new hidden>Начать заново</button></div><div class="title-meta"><span>3 района</span><i></i><span>9 потерянных линз</span><i></i><span>один рассвет</span></div></div>
   <div class="menu-bottomline"><span>СОЗДАНО НА SHELTER ENGINE</span><span>ЗВУК ДОПОЛНЯЕТ ИСТОРИЮ <span class="tiny-sound">♫</span></span></div>
  </section>
  <section class="lumen-modal" hidden role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-card"></div></section>
  <div class="save-note" aria-live="polite"></div>
 `;
 const $=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 const canvas=$<HTMLCanvasElement>('canvas'),world=new World(options.snapshot.manifest.scenes.map(s=>options.snapshot.scenes[s.id]),options.sceneId),renderer=new Renderer(canvas,world),audio=new Audio();
 const key=storageKey(options.snapshot.manifest.projectId,'progress',options.snapshot.manifest.build.appId),settingsKey=storageKey(options.snapshot.manifest.projectId,'settings'),bestKey=storageKey(options.snapshot.manifest.projectId,'best');
 let saved:Progress|undefined,saveFailed=false;
 if(options.savePolicy==='persistent')try{const value=JSON.parse(localStorage.getItem(key)||'null');if(world.restore(value))saved=value;const s=JSON.parse(localStorage.getItem(settingsKey)||'{}');audio.muted=!!s.muted;}catch{}
 const wasWon=world.phase==='won';world.phase='title';
 if(saved&&!wasWon){$('[data-start] span').textContent='Продолжить путь';$('[data-new]').hidden=false;}
 if(wasWon)$('[data-start] span').textContent='Сыграть ещё раз';
 const hud=$('.lumen-hud'),objective=$('.lumen-objective'),menu=$('.lumen-menu'),modal=$('.lumen-modal'),card=$('.modal-card'),hint=$('.lumen-hint'),prompt=$('.lumen-prompt'),footer=$('.lumen-footer'),touch=$('.lumen-touch');
 const abort=new AbortController(),keys=new Set<string>(),touches=new Map<number,string>();let jumpPressed=false,dashPressed=false,interact=false,disposed=false,frame=0,previous=performance.now(),accumulator=0,uiAccumulator=0,lastPhase=world.phase as string,pausedFrom:'playing'|'transition'='playing',lastBanner='',saveClock=0,displayedWon=false;
 const controls=():Controls=>({left:keys.has('KeyA')||keys.has('ArrowLeft')||[...touches.values()].includes('left'),right:keys.has('KeyD')||keys.has('ArrowRight')||[...touches.values()].includes('right'),jump:keys.has('Space')||keys.has('KeyW')||keys.has('ArrowUp')||[...touches.values()].includes('jump'),jumpPressed,dashPressed,interact});
 const clear=()=>{keys.clear();touches.clear();jumpPressed=dashPressed=interact=false;root.querySelectorAll('[data-control]').forEach(el=>el.classList.remove('pressed'));};
 const save=()=>{if(options.savePolicy!=='persistent')return;try{localStorage.setItem(key,JSON.stringify(world.save()));if(world.phase==='won'){const old=JSON.parse(localStorage.getItem(bestKey)||'null');if(!old||world.seconds<old.seconds)localStorage.setItem(bestKey,JSON.stringify({seconds:world.seconds,sparks:world.sparks,deaths:world.deaths}));}}catch{if(!saveFailed){saveFailed=true;$('.save-note').textContent='Сохранение недоступно в этом браузере';}}};
 world.onSave=save;world.onSound=s=>audio.play(s);world.onScene=()=>renderer.snap();
 const soundUI=()=>{root.querySelectorAll<HTMLElement>('[data-sound]').forEach(b=>{b.innerHTML=audio.muted?icon.mute:icon.sound;b.setAttribute('aria-label',audio.muted?'Включить звук':'Выключить звук');});};soundUI();
 const toggleSound=()=>{void audio.unlock();audio.toggle();soundUI();if(options.savePolicy==='persistent')try{localStorage.setItem(settingsKey,JSON.stringify({muted:audio.muted}));}catch{}};
 const focus=()=>canvas.focus({preventScroll:true});
 const begin=(fresh=false)=>{clear();void audio.unlock();menu.hidden=true;modal.hidden=true;displayedWon=false;if(fresh||!saved||saved.won){world.newGame();saved=undefined;}else{world.phase='playing';world.announce(world.level.name);world.onScene();}focus();update();};
 const resume=()=>{clear();modal.hidden=true;world.phase=pausedFrom;void audio.unlock();focus();update();};
 const openPause=()=>{if(world.phase!=='playing'&&world.phase!=='transition')return;pausedFrom=world.phase;world.phase='paused';clear();save();modal.hidden=false;card.innerHTML=`<span class="modal-sigil">◈</span><span class="eyebrow">ОГОНЬ ПОДОЖДЁТ</span><h2 id="modal-title">Тихая пауза</h2><p>Твой путь сохранён у последнего огонька.</p><button class="primary-button" data-resume><span>Продолжить</span>${icon.arrow}</button><button class="secondary-button" data-checkpoint>Вернуться к огоньку</button><div class="pause-controls"><div><kbd>A D / ← →</kbd><span>движение</span></div><div><kbd>ПРОБЕЛ / W / ↑</kbd><span>двойной прыжок</span></div><div><kbd>SHIFT / K</kbd><span>рывок сквозь тени</span></div><div><kbd>E / ↓</kbd><span>зажечь маяк</span></div><div><kbd>ESC / P</kbd><span>пауза</span></div><div><kbd>M</kbd><span>звук</span></div></div><p class="modal-note">Линзы открывают путь. Искры — для любопытных.<br>Падение возвращает к огоньку, находки остаются.</p>`;$('[data-resume]').focus();update();};
 const confirmRestart=()=>{modal.hidden=false;card.innerHTML=`<span class="modal-sigil">◈</span><span class="eyebrow">НОВЫЙ РАССВЕТ</span><h2 id="modal-title">С самого начала?</h2><p>Текущий путь будет заменён новым.</p><button class="primary-button" data-confirm-new>Начать путешествие</button><button class="secondary-button" data-cancel-new>Сохранить текущий путь</button>`;$('[data-cancel-new]').focus();};
 const showWin=()=>{if(displayedWon)return;displayedWon=true;clear();save();modal.hidden=false;const all=world.sparks===world.totalSparks;card.innerHTML=`<span class="victory-sun">☼</span><span class="eyebrow">ТРИ МАЯКА СНОВА ГОРЯТ</span><h2 id="modal-title">Ты вернул рассвет.</h2><p>Ночь была большой.<br>Но твоего маленького огня хватило.</p><div class="victory-stats"><div><strong>${formatTime(world.seconds)}</strong><span>время в пути</span></div><div><strong>${world.sparks}<small> / ${world.totalSparks}</small></strong><span>собрано искр</span></div><div><strong>${world.deaths}</strong><span>возвращений</span></div></div><div class="victory-rank">${all?'ХРАНИТЕЛЬ КАЖДОЙ ИСКРЫ':world.deaths===0?'ХРАНИТЕЛЬ НЕГАСНУЩЕГО ОГНЯ':'ХРАНИТЕЛЬ РАССВЕТА'}</div><button class="primary-button" data-replay><span>Ещё одно путешествие</span>${icon.arrow}</button><span class="end-credit">ЛЮМЕН · ПОСЛЕДНИЙ МАЯК<br>Спасибо, что донёс свет.</span>`;$('[data-replay]').focus();};
 function update(){
  const active=world.phase!=='title';hud.hidden=!active;objective.hidden=!active;footer.hidden=!active;touch.hidden=!active||world.phase==='paused'||world.phase==='won';
  $('[data-region]').textContent=world.level.name;$('[data-number]').textContent=`0${world.level.theme+1} / 03`;$('[data-stage]').textContent=`0${world.level.theme+1}`;
  $('[data-health]').innerHTML=[0,1,2].map(i=>`<i class="${world.hero.hp>i?'filled':''}">◈</i>`).join('');$('[data-health]').setAttribute('aria-label',`Здоровье: ${world.hero.hp} из 3`);
  $('[data-lenses] b').textContent=String(world.lenses);$('[data-sparks]').textContent=String(world.sparks);$('[data-objective]').textContent=world.lenses===3?'Зажги маяк в конце пути':'Найди три линзы';
  const lenses=world.level.things.filter(t=>t.kind==='lens');$('[data-track]').innerHTML=`<i class="track-progress" style="width:${Math.min(100,world.hero.x/world.level.width*100)}%"></i>${lenses.map(t=>`<i class="track-lens ${world.collected.has(t.id)?'found':''}" style="left:${t.x/world.level.width*100}%"></i>`).join('')}<i class="track-end">✦</i>`;
  $('[data-dash]').textContent=world.hero.cooldown>0?'Рывок заряжается':'Рывок готов';$('.dash-status').classList.toggle('charging',world.hero.cooldown>0);
  prompt.hidden=!world.prompt||world.phase!=='playing';prompt.querySelector('span')!.textContent=world.prompt;
  hint.hidden=!world.hint||world.phase!=='playing';hint.textContent=world.hint;
  const bannerVisible=world.bannerTime>0&&active&&world.phase!=='paused';$('.lumen-banner').classList.toggle('visible',bannerVisible);if(lastBanner!==world.banner){lastBanner=world.banner;$('[data-banner]').textContent=world.banner;}
  if(world.phase==='won')showWin();
 }
 root.addEventListener('click',event=>{
  const b=(event.target as HTMLElement).closest('button');if(!b)return;
  if(b.hasAttribute('data-start'))begin();
  if(b.hasAttribute('data-new'))confirmRestart();
  if(b.hasAttribute('data-confirm-new')||b.hasAttribute('data-replay'))begin(true);
  if(b.hasAttribute('data-cancel-new')){modal.hidden=true;$('[data-start]').focus();}
  if(b.hasAttribute('data-sound'))toggleSound();
  if(b.hasAttribute('data-pause'))openPause();
  if(b.hasAttribute('data-resume'))resume();
  if(b.hasAttribute('data-checkpoint')){world.phase='playing';world.die();renderer.snap();modal.hidden=true;focus();}
  if(b.hasAttribute('data-full')){if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void root.requestFullscreen?.().catch(()=>{});}
 },{signal:abort.signal});
 const recognized=['KeyA','KeyD','ArrowLeft','ArrowRight','Space','KeyW','ArrowUp','ShiftLeft','ShiftRight','KeyK','KeyE','ArrowDown'];
 window.addEventListener('keydown',e=>{
  if(e.code==='Tab'&&!modal.hidden){const buttons=[...modal.querySelectorAll<HTMLButtonElement>('button')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
  if(e.repeat&&(e.code==='Escape'||e.code==='KeyP'||e.code==='KeyM'))return;
  if(e.code==='KeyM'){e.preventDefault();toggleSound();return;}
  if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(world.phase==='paused')resume();else if(world.phase==='playing'||world.phase==='transition')openPause();else if(world.phase==='title'&&!modal.hidden)modal.hidden=true;return;}
  if(world.phase==='title'&&e.code==='Enter'&&modal.hidden&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();begin();return;}
  if(world.phase!=='playing'||!recognized.includes(e.code))return;e.preventDefault();
  if(!keys.has(e.code)&&!e.repeat){if(['Space','KeyW','ArrowUp'].includes(e.code))jumpPressed=true;if(['ShiftLeft','ShiftRight','KeyK'].includes(e.code))dashPressed=true;if(['KeyE','ArrowDown'].includes(e.code))interact=true;}
  keys.add(e.code);
 },{signal:abort.signal});
 window.addEventListener('keyup',e=>keys.delete(e.code),{signal:abort.signal});
 for(const button of root.querySelectorAll<HTMLElement>('[data-control]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();void audio.unlock();const control=button.dataset.control!;button.setPointerCapture(e.pointerId);touches.set(e.pointerId,control);button.classList.add('pressed');if(control==='jump')jumpPressed=true;if(control==='dash')dashPressed=true;if(control==='interact')interact=true;},{signal:abort.signal});
  const release=(e:PointerEvent)=>{touches.delete(e.pointerId);button.classList.remove('pressed');};button.addEventListener('pointerup',release,{signal:abort.signal});button.addEventListener('pointercancel',release,{signal:abort.signal});button.addEventListener('lostpointercapture',release,{signal:abort.signal});
 }
 window.addEventListener('blur',()=>{clear();openPause();},{signal:abort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();openPause();}},{signal:abort.signal});window.addEventListener('pagehide',()=>{if(world.phase!=='title')save();},{signal:abort.signal});
 const observer=new ResizeObserver(()=>renderer.resize());observer.observe(canvas);
 function tick(now:number){if(disposed)return;const dt=Math.min(.07,(now-previous)/1000);previous=now;accumulator+=dt;
  while(accumulator>=1/120){if(world.phase==='playing'||world.phase==='transition'){world.step(1/120,controls());jumpPressed=dashPressed=interact=false;}accumulator-=1/120;}
  renderer.draw(dt);audio.update(world.phase==='playing'||world.phase==='transition',world.level.theme);uiAccumulator+=dt;saveClock+=dt;
  if(uiAccumulator>.07||lastPhase!==world.phase){update();uiAccumulator=0;lastPhase=world.phase;}
  if(saveClock>5){saveClock=0;if(world.phase==='playing')save();}frame=requestAnimationFrame(tick);
 }
 if(import.meta.env.DEV)Object.defineProperty(window,'__LUMEN__',{configurable:true,value:{snapshot:()=>({phase:world.phase,scene:world.level.id,hero:{...world.hero},lenses:world.lenses,sparks:world.sparks,checkpoint:world.checkpoint,seconds:world.seconds,progress:world.save(),camera:{x:renderer.cameraX,y:renderer.cameraY}})}});
 renderer.snap();update();frame=requestAnimationFrame(tick);
 return {pause(value){if(value)openPause();else if(world.phase==='paused')resume();},dispose(){if(world.phase!=='title')save();disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();audio.dispose();renderer.dispose();document.title=previousTitle;if(import.meta.env.DEV)delete (window as any).__LUMEN__;root.classList.remove('lumen-root');root.replaceChildren();},diagnostics:()=>({game:'lumen',scene:world.level.id,phase:world.phase,lenses:world.lenses,sparks:world.sparks,frames:frame})};
}
const module:EngineModule={id:'lumen',sdk:1,components,validateScene(scene,project){const level=readLevel(scene);if(level.next&&!project.scenes.some(s=>s.id===level.next))throw new Error('Люмен: следующая сцена не найдена.');},createSession:startGame};
export default module;
