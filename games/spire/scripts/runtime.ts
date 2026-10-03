import type {EngineModule,SessionOptions as EngineSessionOptions,RuntimeSession,ComponentType} from '@shelter/sdk.ts';
import {storageKey} from '@shelter/project.ts';
import {readArena,ITEM_KINDS,SOLID_STYLES,DECOR_KINDS,type Arena,type ItemKind} from './arena.ts';
import {GameClient,type Input,type FeedEntry} from './client.ts';
import {HostSession,GuestSession,type GuestFailure} from './session.ts';
import {Lobby,localNetwork,publicNetwork,newCode,normalizeCode,sessionRoom,type Network,type ListedSession} from './net.ts';
import {WEAPONS,BLASTER,AUTO,RIFLE,FRAG_LIMITS,TIME_LIMIT,MAX_PLAYERS,cleanName,usesMagazine,type WeaponId} from './rules.ts';
import type {HostMessage,SessionOptions} from './protocol.ts';
import {Renderer} from './renderer.ts';
import {AudioEngine} from './audio.ts';

const ITEM_LABELS:Record<ItemKind,string>={mega:'Мега-бонус',rocket:'Ракетница',shotgun:'Дробовик',auto:'Автомат',rifle:'Винтовка',armor:'Броня',health:'Аптечка',
 shells:'Патроны дробовика',bullets:'Патроны автомата',rounds:'Патроны винтовки',rockets:'Ракеты'};
const STYLE_LABELS:Record<string,string>={floor:'Настил',wall:'Стена',metal:'Мостки',stair:'Ступень',rail:'Перила',crate:'Ящик',pillar:'Опора',concrete:'Бетон',barrier:'Барьер'};
const DECOR_LABELS:Record<string,string>={pipe:'Труба',lamp:'Лампа',sign:'Табличка',vent:'Решётка'};
const components:ComponentType[]=[
 {id:'spire.solid',name:'Блок арены',fields:[{name:'style',label:'Вид',type:'select',default:'floor',options:SOLID_STYLES.map(value=>({value,label:STYLE_LABELS[value]}))}]},
 {id:'spire.lava',name:'Лава',fields:[]},
 {id:'spire.jumppad',name:'Прыжковая площадка',fields:[{name:'tx',label:'Цель X',type:'number',default:0,min:-64,max:64,unit:'м'},{name:'ty',label:'Цель Y',type:'number',default:5,min:-5,max:30,unit:'м'},{name:'tz',label:'Цель Z',type:'number',default:0,min:-64,max:64,unit:'м'}]},
 {id:'spire.spawn',name:'Точка появления',fields:[{name:'yaw',label:'Направление взгляда',type:'number',default:0,min:-180,max:180,unit:'°'}]},
 {id:'spire.decor',name:'Декор',fields:[{name:'kind',label:'Вид',type:'select',default:'pipe',options:DECOR_KINDS.map(value=>({value,label:DECOR_LABELS[value]}))},{name:'text',label:'Надпись',type:'string',default:''}]},
 {id:'spire.pickup',name:'Бонус',fields:[{name:'item',label:'Предмет',type:'select',default:'health',options:ITEM_KINDS.map(value=>({value,label:ITEM_LABELS[value]}))}]},
];
/**
 * Сетка оптики винтовки: толстые столбики по краям сходятся тонкими нитями к центру с просветом,
 * на нитях — милдоты, в центре — маленькая красная точка. Светлая окантовка держит сетку видимой на тёмном фоне.
 */
const RETICLE=`<svg viewBox="-100 -100 200 200" aria-hidden="true"><g fill="none">${['rgba(225,235,255,.42)','#06080c'].map((c,i)=>
 `<g stroke="${c}"><path stroke-width="${i?3.2:4.8}" d="M-100 0H-42M42 0H100M0 -100V-42M0 42V100"/><path stroke-width="${i?.55:1.7}" d="M-42 0H-3.5M3.5 0H42M0 -42V-3.5M0 3.5V42"/></g>`).join('')}</g>
 <g fill="#06080c" stroke="rgba(225,235,255,.42)" stroke-width=".5">${[-30,-20,-10,10,20,30].map(t=>`<circle cx="${t}" r=".95"/><circle cy="${t}" r=".95"/>`).join('')}</g>
 <circle r="2.4" fill="rgba(255,40,40,.22)"/><circle r=".7" fill="#ff3434"/></svg>`;
const WEAPON_SHORT=['БЛАСТЕР','ДРОБОВИК','АВТОМАТ','ВИНТОВКА','РАКЕТНИЦА'];
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const clock=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const ordinal=(n:number)=>`${n}-й`;
const FAIL_TEXT:Record<GuestFailure,string>={
 timeout:'Не удалось соединиться с хостом. Сессия могла закончиться, или сеть (мобильный интернет, корпоративный NAT) блокирует прямое соединение между браузерами. Попробуйте другую сеть или попросите друга создать сессию.',
 full:'В сессии уже 8 игроков — мест нет.',
 protocol:'У хоста другая версия игры. Обновите страницу (Ctrl+Shift+R) и попробуйте снова.',
};

type Mode='menu'|'connecting'|'game'|'ended';
type Active={client:GameClient;host?:HostSession;guest?:GuestSession;code:string;closed:boolean};

export async function startGame(options:EngineSessionOptions):Promise<RuntimeSession>{
 await import('./style.css');
 const manifest=options.snapshot.manifest,scene=options.snapshot.scenes[options.sceneId]||options.snapshot.scenes[manifest.startScene];
 options.registry.validate(scene,manifest);
 const arena:Arena=readArena(scene),root=options.container,oldTitle=document.title;document.title=manifest.name;root.classList.add('spire');
 const persistent=options.savePolicy==='persistent',key=(scope:string)=>storageKey(manifest.projectId,scope,'player');
 const load=(scope:string)=>{if(!persistent)return null;try{return localStorage.getItem(key(scope));}catch{return null;}};
 const save=(scope:string,value:string)=>{if(!persistent)return;try{localStorage.setItem(key(scope),value);}catch{}};
 root.innerHTML=`<canvas class="s-canvas" tabindex="0" aria-label="Шпиль — арена"></canvas><div class="s-vignette"></div><div class="s-damage"></div>
 <section class="s-menu">
  <header><a class="s-brand" href="https://gadaev-sergey.github.io/shelter-arcade/" target="_blank" rel="noopener">SHELTER <i>/</i> ARCADE</a><span class="s-net" data-net><i></i> Подключение к сети…</span></header>
  <div class="s-hero"><div class="s-eyebrow">СЕТЕВОЙ ШУТЕР · DEATHMATCH · ДО 8 ИГРОКОВ</div><h1>ШПИЛЬ<span>АРЕНА НА ВЫСОТЕ</span></h1>
   <p>Четыре яруса над лавой, прыжковые площадки и один мега-бонус на самой вершине. Каждый сам за себя: побеждает тот, кто первым наберёт лимит фрагов.</p>
   <label class="s-field"><span>Твой ник</span><input data-nick maxlength="16" autocomplete="nickname" spellcheck="false" placeholder="Боец"></label>
   <div class="s-actions"><button class="s-primary" data-action="create">СОЗДАТЬ СЕССИЮ <span>↗</span></button><button class="s-text" data-action="help">Управление и правила</button></div>
  </div>
  <aside class="s-browser" aria-label="Открытые сессии"><div class="s-browser-head"><h2>Открытые сессии</h2><small data-count></small></div><ul class="s-list" data-list></ul>
   <form class="s-join" data-join><label><span>Код или ссылка-приглашение</span><input data-code placeholder="например, K7QX2M" autocomplete="off" spellcheck="false"></label><button class="s-secondary" type="submit">ВОЙТИ</button></form></aside>
  <footer><span><kbd>WASD</kbd> движение</span><span><kbd>SHIFT</kbd> бег</span><span><kbd>CTRL</kbd> присед</span><span><kbd>ПРОБЕЛ</kbd> прыжок</span><span><kbd>МЫШЬ</kbd> прицел и огонь</span><span><kbd>1–5</kbd> оружие</span><span><kbd>R</kbd> перезарядка</span><span><kbd>ПКМ</kbd> прицеливание</span><span><kbd>TAB</kbd> счёт</span><em>Только компьютер · клавиатура и мышь</em></footer>
 </section>
 <div class="s-hud" hidden>
  <div class="s-top"><div class="s-session"><b data-session></b><small data-invite></small></div><div class="s-clock"><b data-clock>10:00</b><small data-limit></small></div><div class="s-feed" data-feed></div></div>
  <div class="s-scope" data-scope>${RETICLE}</div><div class="s-cross"><i></i><i></i><i></i><i></i></div><div class="s-hitmark"></div><div class="s-dir" data-dir><i></i></div>
  <div class="s-notes" data-notes aria-live="polite"></div>
  <div class="s-bottom"><div class="s-vitals"><div class="s-hp"><small>ЗДОРОВЬЕ</small><b data-hp>100</b></div><div class="s-ar"><small>БРОНЯ</small><b data-ar>0</b></div></div>
   <div class="s-standing"><b data-place>1-й</b><small data-gap></small><span data-frags></span></div>
   <div class="s-arms"><div class="s-ammo"><small data-wname>БЛАСТЕР</small><b data-ammo>∞</b><small data-reserve></small><div class="s-heat" data-heat><i></i></div></div><div class="s-slots">${WEAPON_SHORT.map((n,i)=>`<span data-slot="${i}">${i+1}<em>${n}</em></span>`).join('')}</div></div></div>
  <div class="s-death" data-death hidden></div>
  <div class="s-board" data-board hidden></div>
  <button class="s-click" data-action="lock" hidden>Нажми, чтобы играть</button>
 </div>
 <section class="s-modal" hidden role="dialog" aria-modal="true" aria-labelledby="s-modal-title"><div class="s-panel"></div></section>`;
 const $=<E extends HTMLElement=HTMLElement>(q:string)=>root.querySelector<E>(q)!;
 const canvas=$<HTMLCanvasElement>('.s-canvas'),audio=new AudioEngine();let renderer:Renderer;
 try{renderer=new Renderer(canvas,arena);}catch(error){root.innerHTML='<div style="padding:40px;color:white;background:#0b0f1c">Для «Шпиля» нужен браузер с WebGL. Включите аппаратное ускорение и перезагрузите страницу.</div>';throw error;}
 renderer.setQuality(load('quality')==='low'?'low':'high');renderer.blood=load('blood')==='1';
 const abort=new AbortController(),listen=(el:EventTarget,type:string,fn:EventListener)=>el.addEventListener(type,fn,{signal:abort.signal});
 let mode:Mode='menu',active:Active|null=null,net:Network|null=null,lobby:Lobby|null=null,modal='',disposed=false,frame=0,previous=performance.now(),uiTimer=0;
 let modalAt=0,fire=false,aim=false,forced=false,showBoard=false,keys=new Set<string>(),sensitivity=Number(load('sensitivity'))||1;
 audio.setVolume(load('volume')===null?.7:Number(load('volume')));
 const nick=$<HTMLInputElement>('[data-nick]');nick.value=load('nick')||'';
 const playerName=()=>cleanName(nick.value);
 listen(nick,'change',()=>save('nick',playerName()));

 // --- Сеть и лобби ---
 const local=import.meta.env.DEV&&new URLSearchParams(location.search).get('net')==='local';
 async function connectNetwork(){
  try{net=local?localNetwork():await publicNetwork();}catch(error){$('[data-net]').innerHTML='<i class="bad"></i> Сеть недоступна';throw error;}
  if(disposed)return;$('[data-net]').innerHTML=`<i class="ok"></i> ${net.kind==='local'?'Локальная сеть (тест)':'В сети · поиск сессий'}`;openLobby();
  const code=normalizeCode(location.hash.slice(1));if(code&&mode==='menu')showModal('invite',code);
 }
 // Лобби открывается один раз на всю жизнь страницы: повторный вход в ту же комнату Trystero
 // после выхода ломает обмен объявлениями (общие WebRTC-соединения между комнатами).
 function openLobby(){if(!net||lobby)return;lobby=new Lobby(net);lobby.onChange=renderList;renderList();}
 function closeLobby(){lobby?.close();lobby=null;}
 function renderList(){
  const list=[...(lobby?.sessions.values()??[])].filter(s=>s.code!==active?.code).sort((a,b)=>b.players-a.players||a.name.localeCompare(b.name));
  $('[data-count]').textContent=lobby?(list.length?`${list.length} в сети`:'пока пусто'):'';
  $('[data-list]').innerHTML=list.length?list.map((s:ListedSession)=>`<li><button data-session-code="${s.code}" ${s.players>=s.max?'disabled':''}><div><strong>${esc(s.name)}</strong><small>Хост: ${esc(s.host)} · до ${s.fragLimit} фрагов</small></div><span class="s-meta"><b>${s.players}/${s.max}</b><small>${s.ping===null?'…':s.ping+' мс'}</small></span></button></li>`).join('')
   :`<li class="s-empty">${lobby?'Открытых сессий пока нет. Создайте свою — она появится здесь у всех, кто откроет игру.':'Подключаемся к сети…'}</li>`;
 }

 // --- Сессии ---
 function makeClient(send:(m:any)=>void){return new GameClient(arena,{send});}
 function createSession(name:string,fragLimit:number,closed:boolean){
  if(!net)return;const code=newCode(),opts:SessionOptions={name:name.slice(0,40)||`Арена ${playerName()}`,fragLimit,timeLimit:TIME_LIMIT,maxPlayers:MAX_PLAYERS,closed};
  let host:HostSession;const client=makeClient(m=>host.link.send(m));
  host=new HostSession(net.join(sessionRoom(code)),arena,opts,code,playerName(),{receive:m=>client.receive(m)});
  active={client,host,code,closed};
  host.onRoster=()=>{if(!closed)lobby?.announce(host.info());};
  host.start();if(!closed)lobby?.announce(host.info());
  enterGame();
 }
 function joinSession(code:string){
  if(!net)return;
  let guest:GuestSession;const client=makeClient(m=>guest.link.send(m));
  const sink={receive:(m:HostMessage)=>{client.receive(m);if(m.k==='welcome'&&mode==='connecting')enterGame();}};
  guest=new GuestSession(net.join(sessionRoom(code)),playerName(),sink);
  active={client,guest,code,closed:false};mode='connecting';showModal('connecting',code);
  guest.onFail=reason=>{if(active?.guest!==guest)return;leaveSession(false);showModal('error',FAIL_TEXT[reason]);};
  guest.onHostLeft=()=>{if(active?.guest!==guest)return;mode='ended';unlock();showModal('host-left');};
 }
 function enterGame(){
  if(!active)return;mode='game';hideModal();history.replaceState(null,'','#'+active.code);
  $('.s-menu').hidden=true;$('.s-hud').hidden=false;root.classList.add('s-playing');void audio.unlock();lock();update();
 }
 function leaveSession(toMenu=true){
  if(active){active.host?.close();active.guest?.close();if(active.host)lobby?.announce(null);}
  active=null;mode='menu';unlock();keys.clear();fire=false;aim=false;history.replaceState(null,'',location.pathname+location.search);
  $('.s-menu').hidden=false;$('.s-hud').hidden=true;root.classList.remove('s-playing');renderList();if(toMenu)hideModal();
 }

 // --- Модальные окна ---
 const button=(action:string,label:string,primary=false,extra='')=>`<button class="${primary?'s-primary':'s-secondary'}" data-action="${action}" ${extra}>${label}${primary?' <span>↗</span>':''}</button>`;
 function inviteLink(){return location.origin+location.pathname+location.search+'#'+(active?.code??'');}
 function showModal(kind:string,arg=''){
  modal=kind;modalAt=performance.now();const panel=$('.s-panel');$('.s-modal').hidden=false;panel.className='s-panel s-'+kind;
  if(kind==='create')panel.innerHTML=`<div class="s-eyebrow">НОВАЯ СЕССИЯ</div><h2 id="s-modal-title">Создать арену</h2>
   <form data-create><label class="s-field"><span>Название</span><input name="name" maxlength="40" value="${esc('Арена '+playerName())}"></label>
   <fieldset class="s-limit"><legend>Лимит фрагов</legend>${FRAG_LIMITS.map(n=>`<label><input type="radio" name="limit" value="${n}" ${n===20?'checked':''}><span>${n}</span></label>`).join('')}</fieldset>
   <label class="s-check"><input type="checkbox" name="closed"><span><b>Закрытая сессия</b><small>Не показывать в списке — вход только по ссылке-приглашению.</small></span></label>
   <p class="s-note">Матч длится ${TIME_LIMIT/60} минут. Ваш браузер станет хостом: если вы закроете вкладку, сессия закончится для всех.</p>
   <div class="s-row">${button('cancel','Отмена')}<button class="s-primary" type="submit">СОЗДАТЬ <span>↗</span></button></div></form>`;
  if(kind==='invite')panel.innerHTML=`<div class="s-eyebrow">ПРИГЛАШЕНИЕ</div><h2 id="s-modal-title">Войти в сессию ${esc(arg)}?</h2><label class="s-field"><span>Твой ник</span><input data-invite-nick maxlength="16" value="${esc(nick.value)}" placeholder="Боец"></label><div class="s-row">${button('cancel','Не сейчас')}${button('join-invite','ВОЙТИ',true,`data-code="${arg}"`)}</div>`;
  if(kind==='connecting')panel.innerHTML=`<div class="s-eyebrow">СЕССИЯ ${esc(arg)}</div><h2 id="s-modal-title">Соединяемся с хостом…</h2><div class="s-spinner"></div><p>Ищем хоста через сигнальные реле и открываем прямое соединение. Обычно это занимает несколько секунд.</p>${button('abort','Отмена')}`;
  if(kind==='error')panel.innerHTML=`<div class="s-eyebrow">НЕ ПОЛУЧИЛОСЬ</div><h2 id="s-modal-title">Соединение не установлено</h2><p>${esc(arg)}</p>${button('cancel','ПОНЯТНО',true)}`;
  if(kind==='host-left')panel.innerHTML=`<div class="s-eyebrow">СЕССИЯ ЗАВЕРШЕНА</div><h2 id="s-modal-title">Хост покинул игру</h2><p>Итоговая таблица:</p>${board()}${button('to-menu','В МЕНЮ',true)}`;
  if(kind==='pause'){const a=active!;panel.innerHTML=`<div class="s-eyebrow">${a.host?'ВЫ ХОСТ':'ВЫ В СЕССИИ'} · ${esc(a.client.options?.name??'')}</div><h2 id="s-modal-title">Меню</h2><p class="s-note">Игра не останавливается — соперники продолжают бой.</p>
   <label class="s-field"><span>Приглашение (код ${a.code})</span><div class="s-copy"><input readonly value="${esc(inviteLink())}" data-link><button class="s-secondary" data-action="copy">КОПИРОВАТЬ</button></div></label>
   <label class="s-range"><span>Чувствительность мыши <b data-sens-v>${sensitivity.toFixed(2)}</b></span><input type="range" min="0.3" max="3" step="0.05" value="${sensitivity}" data-sens></label>
   <label class="s-range"><span>Громкость <b data-vol-v>${Math.round(audio.volume*100)}%</b></span><input type="range" min="0" max="1" step="0.05" value="${audio.volume}" data-vol></label>
   <label class="s-field"><span>Качество графики</span><select data-quality><option value="high"${renderer.quality==='high'?' selected':''}>Высокое — тени, свечение, свет ламп</option><option value="low"${renderer.quality==='low'?' selected':''}>Низкое — для слабых компьютеров</option></select></label>
   <label class="s-check"><input type="checkbox" data-blood${renderer.blood?' checked':''}> Кровь при попаданиях (иначе — вспышки щита)</label>
   ${button('resume','ПРОДОЛЖИТЬ',true)}${button('help','Управление и правила')}${button('leave',a.host?'Завершить сессию и выйти':'Покинуть сессию')}`;}
  if(kind==='help')panel.innerHTML=`<div class="s-eyebrow">ПРАВИЛА АРЕНЫ</div><h2 id="s-modal-title">Каждый сам за себя</h2>
   <div class="s-controls"><span><kbd>W A S D</kbd> Движение</span><span><kbd>ПРОБЕЛ</kbd> Прыжок (можно держать)</span><span><kbd>SHIFT</kbd> Бег</span><span><kbd>CTRL</kbd> Присед, на бегу — подкат</span><span><kbd>Q E</kbd> Наклон влево / вправо</span><span><kbd>МЫШЬ</kbd> Прицел</span><span><kbd>ЛКМ</kbd> Огонь</span><span><kbd>ПКМ</kbd> Прицеливание</span><span><kbd>R</kbd> Перезарядка</span><span><kbd>1–5 / КОЛЕСО</kbd> Оружие</span><span><kbd>TAB</kbd> Таблица счёта</span><span><kbd>ESC</kbd> Меню</span></div>
   <p>За убийство соперника — фраг. Смерть от своей ракеты или в лаве — минус фраг. Первый, кто набрал лимит, побеждает. Через 10 минут побеждает лидер; при ничьей — внезапная смерть до единоличного лидера.</p>
   <p>Бластер бесконечный, но от долгой очереди перегревается. Дробовик, автомат, винтовка и ракетница лежат на арене. Автомат и винтовка перезаряжаются (R) и прицеливаются (ПКМ): у винтовки оптика ×4, без неё и в прыжке она мажет. Очередь автомата уводит вверх и в сторону всегда одинаково — отдачу можно выучить и гасить мышью. Попадание в голову — двойной урон.</p>
   <p> Выстрел ракетой себе под ноги в прыжке — рокет-джамп. Голубые площадки подбрасывают на ярус выше, на вершине ждёт мега-бонус +100 здоровья.</p>
   <p>Подкат — только с бега: Ctrl на бегу даёт рывок и низкий силуэт. Присед его не отменяет, сбить подкат можно только прыжком; прыжок сохраняет скорость, а нажатый в воздухе Ctrl с зажатым бегом снова переходит в подкат при приземлении (рывок — не чаще раза в секунду). Стрельба и прицеливание сбивают бег. Присед в прыжке поджимает ноги — так запрыгивают на высокие ящики. Наклон выглядывает из-за угла, открывая только голову.</p>
   <small>Стрейф-прыжки: держите прыжок, «вбок» и плавно ведите мышь в ту же сторону — скорость растёт.</small>${button('back','ПОНЯТНО',true)}`;
  requestAnimationFrame(()=>{if(!disposed)panel.querySelector<HTMLElement>('input:not([readonly]),button')?.focus();});
 }
 function hideModal(){modal='';$('.s-modal').hidden=true;}
 function board(){
  const c=active?.client;if(!c)return '';const rows=c.scores();
  return `<table class="s-table"><thead><tr><th>#</th><th>Игрок</th><th>Фраги</th><th>Смерти</th></tr></thead><tbody>${rows.map((r,i)=>`<tr class="${r.self?'self':''}"><td>${i+1}</td><td><i style="background:${r.color}"></i>${esc(r.name)}${r.id===c.winner?' ★':''}</td><td>${r.frags}</td><td>${r.deaths}</td></tr>`).join('')}</tbody></table>`;
 }

 // --- Ввод ---
 function lock(){if(mode!=='game'||modal)return;try{const r=canvas.requestPointerLock?.();if(r)void r.catch(()=>{});}catch{}}
 function unlock(){if(document.pointerLockElement===canvas)document.exitPointerLock();}
 // forced — только для автотестов в режиме разработки: ввод без захвата мыши.
 const locked=()=>forced||document.pointerLockElement===canvas;
 listen(root,'click',((e:MouseEvent)=>{
  const target=e.target as HTMLElement,b=target.closest<HTMLButtonElement>('button');
  if(target===canvas&&mode==='game'&&!locked()&&!modal){void audio.unlock();lock();return;}
  if(!b)return;const action=b.dataset.action;
  if(b.dataset.sessionCode){save('nick',playerName());joinSession(b.dataset.sessionCode);return;}
  if(action==='create'){save('nick',playerName());if(!net){showModal('error','Сеть ещё не готова. Подождите пару секунд.');return;}showModal('create');}
  if(action==='help')showModal('help');
  if(action==='back')mode==='game'?showModal('pause'):hideModal();
  if(action==='cancel')hideModal();
  if(action==='abort'){leaveSession();}
  if(action==='join-invite'){const input=root.querySelector<HTMLInputElement>('[data-invite-nick]');if(input)nick.value=input.value;save('nick',playerName());joinSession(b.dataset.code!);}
  if(action==='resume'){hideModal();lock();}
  if(action==='leave'||action==='to-menu')leaveSession();
  if(action==='lock'){void audio.unlock();lock();}
  if(action==='copy'){const link=root.querySelector<HTMLInputElement>('[data-link]')!;link.select();void navigator.clipboard?.writeText(link.value).then(()=>{b.textContent='СКОПИРОВАНО';},()=>{});}
 }) as EventListener);
 listen(root,'submit',((e:SubmitEvent)=>{
  e.preventDefault();const form=e.target as HTMLFormElement;
  if(form.matches('[data-create]')){const data=new FormData(form);createSession(String(data.get('name')||''),Number(data.get('limit'))||20,data.get('closed')==='on');}
  if(form.matches('[data-join]')){const code=normalizeCode($<HTMLInputElement>('[data-code]').value);if(!code){$<HTMLInputElement>('[data-code]').setCustomValidity('Нужен код из 6 символов или ссылка-приглашение');form.reportValidity();return;}save('nick',playerName());joinSession(code);}
 }) as EventListener);
 listen(root,'input',((e:Event)=>{
  const t=e.target as HTMLInputElement;
  if(t.matches('[data-code]'))t.setCustomValidity('');
  if(t.matches('[data-quality]')){const q=t.value==='low'?'low':'high';renderer.setQuality(q);save('quality',q);}
  if(t.matches('[data-blood]')){renderer.blood=t.checked;save('blood',t.checked?'1':'0');}
  if(t.matches('[data-sens]')){sensitivity=Number(t.value);save('sensitivity',String(sensitivity));$('[data-sens-v]').textContent=sensitivity.toFixed(2);}
  if(t.matches('[data-vol]')){audio.setVolume(Number(t.value));save('volume',String(audio.volume));$('[data-vol-v]').textContent=Math.round(audio.volume*100)+'%';void audio.unlock();audio.play('pickup');}
 }) as EventListener);
 listen(document,'pointerlockchange',()=>{if(!locked()){fire=false;aim=false;keys.clear();if(mode==='game'&&!modal)showModal('pause');}else if(modal==='pause')hideModal();});
 // В прицеле мышь замедляется вместе с приближением, чтобы цель не «уплывала».
 listen(document,'mousemove',((e:MouseEvent)=>{if(locked()&&active){const k=.0022*sensitivity/active.client.zoom();active.client.look(e.movementX*k,e.movementY*k);}}) as EventListener);
 listen(canvas,'mousedown',((e:MouseEvent)=>{if(!locked())return;if(e.button===0)fire=true;if(e.button===2)aim=true;}) as EventListener);
 listen(window,'mouseup',((e:MouseEvent)=>{if(e.button===0)fire=false;if(e.button===2)aim=false;}) as EventListener);
 listen(canvas,'wheel',((e:WheelEvent)=>{if(locked()&&active){e.preventDefault();active.client.cycleWeapon(e.deltaY>0?1:-1);}}) as EventListener);
 listen(canvas,'contextmenu',e=>e.preventDefault());
 const GAME_KEYS=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight','KeyC','KeyQ','KeyE','KeyR','Digit1','Digit2','Digit3','Digit4','Digit5','Tab'];
 listen(window,'keydown',((e:KeyboardEvent)=>{
  // Ctrl — присед, поэтому сочетания с ним в игре не отпускаем браузеру (кроме тех, что он не даёт перехватить).
  if(mode!=='game'||e.metaKey||e.altKey)return;
  if(e.code==='Tab'){e.preventDefault();showBoard=true;return;}
  // Без захвата мыши Esc не приходит через pointerlockchange — открываем меню сами.
  if(e.code==='Escape'&&document.pointerLockElement!==canvas){if(modal==='pause'&&performance.now()-modalAt>300){hideModal();lock();}else if(!modal)showModal('pause');return;}
  if(!locked()||!GAME_KEYS.includes(e.code))return;e.preventDefault();keys.add(e.code);
  if(e.code.startsWith('Digit')&&active)active.client.selectWeapon(Number(e.code.slice(-1))-1 as WeaponId);
  if(e.code==='KeyR'&&!e.repeat)active?.client.reload();
 }) as EventListener);
 listen(window,'keyup',((e:KeyboardEvent)=>{keys.delete(e.code);if(e.code==='Tab')showBoard=false;}) as EventListener);
 listen(window,'blur',()=>{keys.clear();fire=false;aim=false;showBoard=false;});
 // Ссылка-приглашение, открытая во вкладке с уже запущенной игрой, меняет только #код.
 listen(window,'hashchange',()=>{const code=normalizeCode(location.hash.slice(1));if(code&&net&&mode==='menu'&&code!==active?.code)showModal('invite',code);});
 const input=():Input=>{const has=(...k:string[])=>k.some(x=>keys.has(x));
  return {forward:Number(has('KeyW','ArrowUp'))-Number(has('KeyS','ArrowDown')),strafe:Number(has('KeyD','ArrowRight'))-Number(has('KeyA','ArrowLeft')),jump:has('Space'),fire,
   crouch:has('ControlLeft','ControlRight','KeyC'),sprint:has('ShiftLeft','ShiftRight'),lean:Number(has('KeyE'))-Number(has('KeyQ')),aim};};

 // --- Интерфейс боя ---
 function feedLine(f:FeedEntry,c:GameClient){
  const name=(id:string)=>`<b style="color:${c.colorOf(id)}">${esc(c.nameOf(id))}</b>`;
  if(f.killer===f.victim)return `<div>${name(f.victim)} <i>${f.w==='lava'?'сгорел в лаве':f.w==='fall'?'разбился':'подорвал себя'}</i></div>`;
  return `<div>${name(f.killer)} <i>[${typeof f.w==='number'?WEAPONS[f.w].name.toLowerCase():'?'}${f.head?' · в голову':''}]</i> ${name(f.victim)}</div>`;
 }
 function update(){
  const c=active?.client;if(!c||mode==='menu')return;
  $('[data-session]').textContent=c.options?.name??'';
  $('[data-invite]').textContent=`код ${active!.code}${active!.host?' · вы хост':c.rtt?` · пинг ${Math.round(c.rtt*1000)} мс`:''} · ${c.roster.size}/${c.options?.maxPlayers??8}`;
  $('[data-clock]').textContent=c.phase==='sudden'?'ВНЕЗАПНАЯ СМЕРТЬ':c.phase==='over'?'МАТЧ ОКОНЧЕН':clock(c.left);
  $('[data-limit]').textContent=`до ${c.options?.fragLimit??20} фрагов`;
  $('.s-clock').classList.toggle('alert',c.phase==='sudden'||c.phase==='playing'&&c.left<60);
  $('[data-hp]').textContent=String(Math.max(0,c.health));$('[data-ar]').textContent=String(c.armor);$('.s-hp').classList.toggle('low',c.health<=30);$('.s-hp').classList.toggle('mega',c.health>100);
  const st=c.standing();$('[data-place]').textContent=ordinal(st.place);$('[data-gap]').textContent=`из ${st.total}${st.total>1?` · ${st.gap>0?'+':''}${st.gap}`:''}`;$('[data-frags]').textContent=`${c.frags} фраг.`;
  const w=c.weapon,magazine=usesMagazine(w);
  $('[data-wname]').textContent=c.reloading?'ПЕРЕЗАРЯДКА':c.overheated?'ПЕРЕГРЕВ':WEAPON_SHORT[w];
  $('[data-ammo]').textContent=w===BLASTER?'∞':String(Math.max(0,magazine?c.mag[w]:c.ammo[w]));
  $('[data-reserve]').textContent=magazine?`/ ${Math.max(0,c.ammo[w])}`:'';
  $('.s-ammo').classList.toggle('low',magazine&&c.mag[w]<=Math.ceil(WEAPONS[w].mag/5)||!magazine&&w!==BLASTER&&c.ammo[w]<=2);
  root.querySelectorAll<HTMLElement>('[data-slot]').forEach(s=>{const w=Number(s.dataset.slot) as WeaponId;s.classList.toggle('owned',c.owned[w]);s.classList.toggle('selected',c.weapon===w);});
  $('[data-feed]').innerHTML=c.feed.map(f=>feedLine(f,c)).join('');
  $('[data-notes]').innerHTML=c.notes.map(n=>`<div style="opacity:${Math.min(1,(2.5-n.age)*2)}">${esc(n.text)}</div>`).join('');
  const death=$('[data-death]');
  if(!c.alive&&c.connected&&c.phase!=='over'&&c.killedBy){const k=c.killedBy,self=k.killer===c.id;death.hidden=false;
   death.innerHTML=`<small>${self?'САМОУБИЙСТВО · −1 ФРАГ':'ТЕБЯ УБИЛ'}</small><strong style="color:${self?'#ff8a5b':c.colorOf(k.killer)}">${self?(k.w==='lava'?'Лава':k.w==='fall'?'Падение':'Своя ракета'):esc(c.nameOf(k.killer))}</strong>${!self&&typeof k.w==='number'?`<em>${WEAPONS[k.w].name}</em>`:''}<span>Возвращение через ${c.respawnIn().toFixed(1)}</span>`;}
  else death.hidden=true;
  const boardEl=$('[data-board]');const over=c.phase==='over';boardEl.hidden=!(showBoard||over);
  if(!boardEl.hidden)boardEl.innerHTML=`${over?`<div class="s-eyebrow">${c.winner===c.id?'ТЫ ПОБЕДИЛ':'ПОБЕДИТЕЛЬ'}</div><h2>${esc(c.nameOf(c.winner??''))}</h2><p>Новый матч через ${Math.ceil(c.restart)} с</p>`:`<div class="s-eyebrow">${esc(c.options?.name??'')} · ДО ${c.options?.fragLimit} ФРАГОВ</div>`}${board()}`;
  $('[data-action="lock"]').hidden=locked()||!!modal||mode!=='game';
 }
 function frameHud(){
  const c=active?.client;if(!c)return;
  const hitmark=$('.s-hitmark');hitmark.classList.toggle('on',c.hitFlash>0);hitmark.classList.toggle('head',c.headFlash>0);
  // Прицел расходится на текущий разброс; в оптике винтовки и в коллиматоре автомата его заменяет прицел оружия.
  const scoped=c.weapon===RIFLE?c.aim:0,cross=$('.s-cross');
  const gap=3+Math.tan(c.spread())/Math.tan(renderer.camera.fov*Math.PI/360)*renderer.height/2;
  cross.style.setProperty('--gap',`${Math.min(60,gap).toFixed(1)}px`);cross.style.opacity=String(c.weapon===AUTO?1-c.aim:1-scoped);
  $('[data-scope]').style.opacity=String(scoped>.85?1:0);
  const heat=$('[data-heat]');heat.hidden=c.weapon!==BLASTER;heat.style.setProperty('--heat',String(Math.min(1,c.heat)));heat.classList.toggle('hot',c.overheated);$('.s-damage').style.opacity=String(c.damageFlash);
  const dir=$('[data-dir]');
  if(c.damageFlash>.05&&c.damageFrom){const dx=c.damageFrom.x-c.body.pos.x,dz=c.damageFrom.z-c.body.pos.z,a=Math.atan2(dx,-dz)+c.yaw;dir.style.opacity=String(c.damageFlash);dir.style.transform=`translate(-50%,-50%) rotate(${a}rad)`;}
  else dir.style.opacity='0';
 }

 function tick(now:number){
  if(disposed)return;const dt=Math.min(.05,(now-previous)/1000);previous=now;
  const c=active?.client;
  if(c&&(mode==='game'||mode==='ended')){
   const listening=mode==='game'&&locked()&&!modal;
   c.update(dt,listening?input():{forward:0,strafe:0,jump:false,fire:false});
   const listener={pos:c.eye,yaw:c.yaw};for(const s of c.sounds)audio.play(s.name,s.pos,listener);c.sounds.length=0;
   renderer.draw(c,dt);frameHud();
   uiTimer+=dt;if(uiTimer>.08){uiTimer=0;update();}
  }
  frame=requestAnimationFrame(tick);
 }
 const observer=new ResizeObserver(()=>renderer.resize());observer.observe(canvas);
 if(import.meta.env.DEV)Object.defineProperty(window,'__SPIRE__',{configurable:true,value:{
  get mode(){return mode;},get modal(){return modal;},get active(){return active;},get lobby(){return lobby;},get net(){return net;},arena,renderer,
  /** Поставить своего бойца в точку и навести прицел на игрока id (для автотестов). */
  aimAt(id:string){const c=active!.client,v=c.views().find(p=>p.id===id);if(!v)return false;const e=c.eye,dx=v.pos.x-e.x,dy=v.pos.y+1.1-e.y,dz=v.pos.z-e.z;c.yaw=Math.atan2(-dx,-dz);c.pitch=Math.atan2(dy,Math.hypot(dx,dz));return true;},
  setFire(on:boolean){fire=on;},
  leave(){leaveSession();},
  /** Обойти захват мыши в автотестах: ввод принимается без pointer lock. */
  forceInput(on:boolean){forced=on;if(on&&modal==='pause')hideModal();},
 }});
 renderList();void connectNetwork().catch(()=>{});frame=requestAnimationFrame(tick);
 return {
  pause(){/* сетевой матч не ставится на паузу */},
  dispose(){disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();unlock();leaveSession(false);closeLobby();audio.dispose();renderer.dispose();root.replaceChildren();root.classList.remove('spire','s-playing');document.title=oldTitle;
   if(import.meta.env.DEV)delete (window as any).__SPIRE__;},
  diagnostics:()=>({game:'spire',mode,code:active?.code??null,host:!!active?.host,players:active?.client.roster.size??0,phase:active?.client.phase??null}),
 };
}
const module:EngineModule={id:'spire',sdk:1,components,validateScene(scene){readArena(scene);},createSession:startGame};
export default module;
