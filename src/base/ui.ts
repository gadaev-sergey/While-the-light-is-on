import type {BaseWorld} from './world.ts';
import type {BaseRenderer} from './renderer.ts';
import {TIME_PRESETS,timeLabel,timeOfDay} from './lighting.ts';
import {RESOURCE_NAMES} from './config.ts';
import type {Action} from './types.ts';
export const glyph=(name:string)=>{
 const paths:Record<string,string>={house:'<path d="M3 11 12 3l9 8v10H3Z"/><path d="M9 21v-7h6v7M3 11h18M12 3v8"/>',bag:'<path d="M6 7h12l2 14H4L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2M8 12h8v5H8z"/>',light:'<path d="m4 11 5-5 6 6-5 5Z M9 6l2-2 7 7-3 1 M17 3l1-2M21 7l2-1M19 4l2-2"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z M9 3v16M15 5v16"/>',pause:'<path d="M8 5v14M16 5v14"/>',wood:'<path d="m5 6 13-2 2 13-13 3Z M6 10l12-2M7 14l12-2"/>',scrap:'<path d="m5 4 5 1 2 4-3 3-4-2-1-5m7 7 8 8-3 3-8-8"/>',water:'<path d="M12 3C9 8 5 11 5 15a7 7 0 0 0 14 0c0-4-4-7-7-12Z M8 15c0 2 1 3 3 4"/>',heart:'<path d="M12 21 3 12C-2 4 8 0 12 7c4-7 14-3 9 5Z"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M20 4l-2 2M6 18l-2 2"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 8c0-4 7-3 6 1 0 2-3 2-3 5m0 3v1"/>'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.bag}</svg>`;
};
export class BaseUI{
 canvas:HTMLCanvasElement;dialog:HTMLDialogElement;onAction=(a:Action)=>{};onMove=(k:string,down:boolean)=>{};onReset=()=>{};renderer?:BaseRenderer;modal='';inventoryKey='';timeOpen=false;
 constructor(public w:BaseWorld){
  document.querySelector('#app')!.innerHTML=`<main class="base-app">
   <header class="base-header"><a class="base-brand" href="#" aria-label="Наша база">${glyph('house')}<span>УБЕЖИЩЕ<small>ДОМ НА ОКРАИНЕ</small></span></a><div class="base-mode"><i></i> ИССЛЕДОВАНИЕ <span>01</span></div><div class="base-supplies"><span title="Древесина">${glyph('wood')}<b id="quick-wood">0</b></span><span title="Детали">${glyph('scrap')}<b id="quick-scrap">0</b></span><span title="Вода">${glyph('water')}<b id="quick-water">0</b></span></div><button class="base-weather" id="time-toggle" aria-label="Время суток" aria-expanded="false" aria-controls="time-panel">${glyph('sun')}<span id="base-clock">12:00</span><small id="time-period">ДЕНЬ</small></button><button data-modal="help" class="round-button" aria-label="Управление">${glyph('help')}</button><button id="pause" class="round-button" aria-label="Пауза">${glyph('pause')}</button></header>
   <section id="time-panel" class="time-panel hidden" aria-label="Настройка времени суток">
    <div class="time-heading"><span class="eyebrow">ВРЕМЯ СУТОК</span><output id="time-value" for="time-range">12:00</output></div>
    <div class="time-presets">${TIME_PRESETS.map(p=>`<button data-time="${p.minutes}" aria-pressed="false">${p.label}</button>`).join('')}</div>
    <label for="time-range">Выбрать время</label><input id="time-range" type="range" min="0" max="1439" step="1" value="720" aria-label="Выбрать время"/>
    <div class="time-scale"><span>00:00</span><span>12:00</span><span>23:59</span></div>
    <button id="time-auto" aria-pressed="false"><i></i><span>Автоматическая смена</span></button><p>Выбор времени останавливает часы.<br>Автоматически: 2 минуты за секунду.</p>
   </section><section class="base-stage" aria-label="Дом и двор"><canvas id="base-canvas" tabindex="0" aria-label="Игра: A и D — движение, W и S — лестницы, E — взаимодействовать, F — фонарик"></canvas>
    <div id="base-loading"><span class="eyebrow">ПОДГОТОВКА БАЗЫ</span><h1>Здесь можно<br><em>начать сначала.</em></h1><div class="load-track"><i></i></div><small id="base-progress">Загрузка окружения…</small></div>
    <div class="scene-heading"><span class="eyebrow">НАША БАЗА / 01</span><h1>Дом на окраине</h1><p><span id="room-count">1 / 6</span> помещений исследовано</p></div>
    <div class="base-objective"><span class="objective-diamond"></span><div><span class="eyebrow" id="goal-caption">ПЕРВЫЙ ОСМОТР</span><p id="goal-text">Осмотрите верхний этаж и подвал</p><small id="goal-tip">W / S — лестницы · F — фонарик</small></div></div>
    <div class="zoom-controls"><button id="zoom-in" aria-label="Приблизить">+</button><span id="zoom-value">100%</span><button id="zoom-out" aria-label="Отдалить">−</button></div>
    <div class="base-toast hidden" id="base-toast" role="status"><i></i><span></span></div>
    <section id="door-panel" class="door-panel hidden" aria-label="Действия у двери">
     <span class="eyebrow">У ДВЕРИ</span><strong id="door-title"></strong><p id="door-status" role="status"></p>
     <div class="door-choices"><button id="door-open" data-action="door-open"><kbd>E</kbd><span>Открыть дверь</span></button><button id="door-peek" data-action="door-peek" aria-pressed="false"><kbd>Q</kbd><span>Взглянуть в скважину</span></button></div>
     <button class="door-leave" data-action="door-leave">Отойти <small>ESC</small></button>
    </section>
    <div class="base-location"><i></i><span id="base-location">Прихожая</span><small id="floor-label">ПЕРВЫЙ ЭТАЖ</small></div>
    <div class="touch-controls"><button data-move="KeyA" aria-label="Влево">←</button><div><button data-action="up" aria-label="Подняться">↑</button><button data-action="down" aria-label="Спуститься">↓</button></div><button data-move="KeyD" aria-label="Вправо">→</button></div>
   </section>
   <footer class="base-toolbar"><div class="survivor"><canvas id="base-portrait" width="96" height="108"></canvas><div><span class="eyebrow">ВАШ ПЕРСОНАЖ</span><strong>Разработчик</strong><div class="vital-line"><i id="base-health"></i></div><small id="base-condition">В порядке</small></div></div>
    <button class="context-action" id="interact"><kbd>E</kbd><span><strong id="context-title">Осмотритесь</strong><small id="context-detail">Подойдите к предмету</small></span><div class="context-ring" id="context-ring">${glyph('arrow')}</div></button>
    <div class="tool-actions"><button id="flashlight" data-action="flashlight"><kbd>F</kbd>${glyph('light')}<span>Фонарик<small id="flashlight-state">ВКЛЮЧЁН</small></span></button><button data-modal="inventory" id="inventory">${glyph('bag')}<span>Рюкзак<small>I</small></span></button><button data-modal="map" id="base-map">${glyph('map')}<span>План дома<small>M</small></span></button></div>
   </footer><div class="base-keybar"><span><kbd>A D</kbd> движение</span><span><kbd>W S</kbd> лестницы</span><span><kbd>ЛКМ</kbd> идти / предмет</span><span><kbd>МЫШЬ</kbd> направить свет</span><span><kbd>SHIFT</kbd> быстрее</span><span><kbd>J</kbd> оттолкнуть</span><span id="save-status">СОХРАНЯЕТСЯ АВТОМАТИЧЕСКИ</span></div>
  </main><dialog class="base-dialog"><div id="base-dialog-content"></div></dialog>`;
  this.canvas=document.querySelector('#base-canvas')!;this.dialog=document.querySelector('.base-dialog')!;
  document.querySelector('#app')!.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest<HTMLElement>('[data-modal],[data-action],[data-close],[data-restart]');if(!target)return;if(target.dataset.modal)this.open(target.dataset.modal);if(target.dataset.action)this.onAction({type:target.dataset.action as Action['type']});if(target.hasAttribute('data-close'))this.close();if(target.hasAttribute('data-restart')){this.close();this.onReset();}});
  this.$('#interact').addEventListener('click',()=>this.onAction({type:'interact'}));this.$('#pause').addEventListener('click',()=>this.togglePause());
  this.$('#zoom-in').addEventListener('click',()=>this.renderer?.zoomBy(.1));this.$('#zoom-out').addEventListener('click',()=>this.renderer?.zoomBy(-.1));
  this.$('.base-brand').addEventListener('click',e=>{e.preventDefault();if(this.renderer)this.renderer.zoom=1;this.canvas.focus();});
  this.$('#time-toggle').addEventListener('click',()=>this.setTimePanel(!this.timeOpen));
  for(const button of document.querySelectorAll<HTMLElement>('[data-time]'))button.addEventListener('click',()=>{w.setTime(Number(button.dataset.time));this.update();});
  this.$('#time-range').addEventListener('input',e=>{w.setTime(Number((e.target as HTMLInputElement).value));this.update();});
  this.$('#time-auto').addEventListener('click',()=>{w.setTimeRunning(!w.timeRunning);this.update();});
  document.addEventListener('pointerdown',e=>{if(this.timeOpen&&!(e.target as HTMLElement).closest('#time-panel,#time-toggle'))this.setTimePanel(false,false);});
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
  for(const button of document.querySelectorAll<HTMLElement>('[data-move]')){button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);this.onMove(button.dataset.move!,true);});for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>this.onMove(button.dataset.move!,false));}
 }
 $(selector:string){return document.querySelector<HTMLElement>(selector)!;}
 loading(n:number){this.$('.load-track i').style.width=`${n*100}%`;this.$('#base-progress').textContent=`Подготовка дома · ${Math.round(n*100)}%`;}
 loaded(image:CanvasImageSource){this.$('#base-loading').classList.add('hidden');const canvas=document.querySelector<HTMLCanvasElement>('#base-portrait')!;const c=canvas.getContext('2d')!;c.fillStyle='#202a2d';c.fillRect(0,0,96,108);c.drawImage(image,126,12,145,174,0,0,96,115);this.canvas.focus();}
 update(){
  const w=this.w,p=w.player;this.$('#room-count').textContent=`${w.explored.size} / ${w.level.rooms.length}`;this.$('#base-location').textContent=w.location;this.$('#floor-label').textContent=p.stair?'ПЕРЕХОД МЕЖДУ ЭТАЖАМИ':p.floor<0?`ПОДВАЛ ${Math.abs(p.floor)}`:p.floor===0?'ПЕРВЫЙ ЭТАЖ':p.floor===1?'ВТОРОЙ ЭТАЖ':`${p.floor+1}-Й ЭТАЖ`;
  this.$('#base-health').style.width=p.hp+'%';this.$('#base-condition').textContent=p.hp>80?'В порядке':p.hp>40?'Лёгкая рана · H — бинт':'Нужна перевязка · H';
  this.$('#flashlight').classList.toggle('active',w.flashlight);this.$('#flashlight').setAttribute('aria-pressed',String(w.flashlight));this.$('#flashlight-state').textContent=w.flashlight?'ВКЛЮЧЁН':'ВЫКЛЮЧЕН';
  for(const k of ['wood','scrap','water'] as const)this.$('#quick-'+k).textContent=String(w.inventory[k]);
  const label=timeLabel(w.dayMinutes);this.$('#base-clock').textContent=label;this.$('#time-value').textContent=label;this.$('#time-period').textContent=timeOfDay(w.dayMinutes);
  const range=this.$('#time-range') as HTMLInputElement;range.value=String(Math.floor(w.dayMinutes));range.setAttribute('aria-valuetext',label);
  for(const button of document.querySelectorAll<HTMLElement>('[data-time]'))button.setAttribute('aria-pressed',String(Math.abs(Number(button.dataset.time)-w.dayMinutes)<1));
  this.$('#time-auto').setAttribute('aria-pressed',String(w.timeRunning));
  const interaction=w.doorInteraction,door=w.doors.find(d=>d.id===interaction?.id);this.$('#door-panel').classList.toggle('hidden',!interaction||!door||door.open||w.phase!=='playing');
  if(interaction&&door&&!door.open){
   const ready=interaction.reach>=1&&interaction.phase!=='opening',peeking=interaction.phase==='peek';
   this.$('#door-title').textContent=door.name;this.$('#door-status').textContent=interaction.phase==='opening'?'Открываем дверь…':!ready?'Берёмся за ручку…':peeking?'Узкий обзор через скважину. Q — выпрямиться.':door.locked?(door.lockReason||'Заперто. Можно заглянуть в скважину.'):'Рука на ручке. Выберите действие.';
   (this.$('#door-open') as HTMLButtonElement).disabled=!ready||!!door.locked||interaction.lean>0||peeking;
   this.$('#door-open span').textContent=door.locked?'Дверь заперта':'Открыть дверь';
   (this.$('#door-peek') as HTMLButtonElement).disabled=!ready||door.open;
   this.$('#door-peek').setAttribute('aria-pressed',String(peeking));this.$('#door-peek span').textContent=peeking?'Выпрямиться':'Взглянуть в скважину';
   (this.$('.door-leave') as HTMLButtonElement).disabled=interaction.phase==='opening';
  }
  const nearby=w.nearby(),desc=nearby?w.description(nearby.id):null;this.$('#interact').classList.toggle('available',!!nearby||!!w.task);this.$('#interact').setAttribute('aria-disabled',String(!nearby&&!w.task));
  this.$('#context-title').textContent=w.task?'Выполняется действие…':interaction?'У ручки двери':desc?`${desc.verb} · ${desc.title}`:'Осмотритесь';this.$('#context-detail').textContent=w.task?`${(w.task.duration-w.task.remaining).toFixed(1)} / ${w.task.duration.toFixed(1)} с · E — отменить`:desc?.detail||'Подойдите к предмету или нажмите на его значок';this.$('#context-ring').style.setProperty('--progress',w.task?`${(1-w.task.remaining/w.task.duration)*360}deg`:'0deg');
  this.$('#base-toast').classList.toggle('hidden',w.toastTime<=0);this.$('#base-toast').dataset.kind=w.toastKind;this.$('#base-toast span').textContent=w.toast;
  const explored=w.explored.size>=w.level.rooms.length;this.$('#goal-caption').textContent=explored?'ДОМ ОСМОТРЕН':'ОБСЛЕДУЙТЕ ДОМ';this.$('#goal-text').textContent=explored?'Все помещения отмечены на плане':'Осмотрите верхний этаж и подвал';this.$('#goal-tip').textContent=explored?'M — план дома · можно выйти во двор':'W / S — лестницы · F — фонарик';
  this.$('#zoom-value').textContent=`${Math.round((this.renderer?.zoom||1)*100)}%`;
 }
 setTimePanel(open:boolean,focus=true){this.timeOpen=open;this.$('#time-panel').classList.toggle('hidden',!open);this.$('#time-toggle').setAttribute('aria-expanded',String(open));if(!open&&focus)this.canvas.focus();}
 togglePause(){if(this.dialog.open)this.close();else this.open('pause');}
 open(kind:string){this.setTimePanel(false,false);this.modal=kind;this.w.phase='paused';this.renderModal();if(!this.dialog.open)this.dialog.showModal();}
 close(){this.dialog.close();this.modal='';this.w.phase='playing';this.canvas.focus();}
 renderModal(){
  const title={pause:'Тихая пауза',inventory:'Ваш рюкзак',map:'План дома',help:'Освойтесь на базе'}[this.modal]||'';
  let body='';
  if(this.modal==='inventory')body=`<p class="dialog-lead">Вещи, которые вы уже нашли. Они пригодятся для работы и обустройства дома.</p><div class="inventory-grid">${Object.entries(RESOURCE_NAMES).map(([key,name])=>`<div><span>${glyph(key)}</span><strong>${name}</strong><b>${this.w.inventory[key as keyof typeof RESOURCE_NAMES]}</b></div>`).join('')}</div><p class="dialog-note">Найденные припасы сохраняются в рюкзаке. Осмотрите шкафы, ящики и припасы во дворе.</p>`;
  if(this.modal==='map')body=`<p class="dialog-lead">На плане сохраняются исследованные помещения. Предметы и чужие перемещения здесь не отмечаются.</p><div class="house-plan">${[...new Set(this.w.level.rooms.map(r=>r.floor))].sort((a,b)=>b-a).map(f=>`<div class="plan-row"><span>${f<0?'−':''}${String(f<0?-f:f+1).padStart(2,'0')}</span>${this.w.level.rooms.filter(r=>r.floor===f).map(r=>`<div class="plan-room ${this.w.explored.has(r.id)?'known':'unknown'} ${this.w.currentRoom?.id===r.id?'current':''}"><strong>${this.w.explored.has(r.id)?r.name:'Не исследовано'}</strong><small>${this.w.currentRoom?.id===r.id?'ВЫ ЗДЕСЬ':this.w.explored.has(r.id)?'ОСМОТРЕНО':'ОБЗОР ЗАКРЫТ'}</small></div>`).join('')}</div>`).join('')}</div><p class="dialog-note">Лестницы соединяют этажи. Найдите спуск, чтобы исследовать подвал.</p>`;
  if(this.modal==='help')body=`<p class="dialog-lead">Исследуйте дом в своём темпе. Закрытые двери и перекрытия скрывают то, что находится за ними.</p><div class="help-cards">${[['A / D','Перемещение','Идите влево или вправо. Shift ускоряет шаг.'],['W / S','Лестницы','Подойдите к началу лестницы и нажмите W для подъёма или S для спуска.'],['E / ЛКМ','Предметы и двери','E выполняет действие рядом. Открытая дверь закрывается одним нажатием E. У закрытой двери герой берётся за ручку: E — открыть, Q — посмотреть в скважину, Esc или шаг назад — отойти. Запертую дверь открыть нельзя. Движение прерывает обыск.'],['F / МЫШЬ','Фонарик','F включает свет. Мышь направляет луч, а клавиши движения поворачивают его по ходу шага. Луч добавляет освещение и не раскрывает туман войны. Стены и полы перекрывают свет.'],['ЧАСЫ','Время суток','Нажмите на часы сверху: выберите время ползунком или включите автоматическую смену. Дневной свет входит через окна, дыры и открытые наружные двери.'],['I / M','Рюкзак и план','Рюкзак хранит найденные вещи. На плане видны только изученные помещения.'],['J / H','Защита и лечение','J отталкивает пса. H использует бинт. Пёс остаётся у дальнего забора и отступает от фонарика.']].map(([key,title,text])=>`<article><kbd>${key}</kbd><strong>${title}</strong><p>${text}</p></article>`).join('')}</div>`;
  if(this.modal==='pause')body=`<p class="dialog-lead">Время остановлено. Дом подождёт.</p><div class="pause-actions"><button class="primary" data-close>Продолжить ${glyph('arrow')}</button><button data-modal="help">Управление</button><button data-restart>Начать заново</button></div><p class="dialog-note">Прогресс сохраняется автоматически в этом браузере.</p>`;
  this.$('#base-dialog-content').innerHTML=`<div class="dialog-heading"><div><span class="eyebrow">НАША БАЗА</span><h2>${title}</h2></div><button class="round-button" data-close aria-label="Закрыть">${glyph('close')}</button></div>${body}`;
 }
}
