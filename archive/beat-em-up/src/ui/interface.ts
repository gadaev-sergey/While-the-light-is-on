import { ENEMIES, SECTORS, UPGRADES } from '../game/content.ts';
import { World } from '../game/world.ts';
import { GameAudio } from '../game/audio.ts';
import type { Action, EnemyKind, Phase, Upgrade } from '../game/types.ts';
import { COMBOS, MOVES, ATTACK_KEYS, SUPER_WINDOW, comboBaseDamage } from '../game/combat.ts';
import { icon } from './icons.ts';
import { FLOOR_HEIGHT } from '../game/terrain.ts';
import { ENEMY_FRAMES, drawEnemyFrame } from '../game/sprites.ts';

export class Interface {
  root: HTMLElement; canvas: HTMLCanvasElement; dialog: HTMLDialogElement;
  onAction: (action:Action)=>void=()=>{};
  onMove: (key:string,pressed:boolean)=>void=()=>{};
  onFocus=()=>{};
  ready=false; toastTimer=0; modalWasPlaying=false; lastHud=0;
  constructor(public world:World,public audio:GameAudio) {
    this.root=document.querySelector('#app')!;
    this.root.innerHTML=`
      <header class="masthead">
        <a class="brand" href="#" aria-label="NULLPOINT — главное меню"><span class="brand-mark">${icon('terminal')}</span>NULLPOINT<span class="brand-dot">.</span></a>
        <nav aria-label="Основная навигация"><button class="nav-link active" data-do="expedition">Экспедиция<span>01</span></button><button class="nav-link" data-do="archive">Архив</button><button class="nav-link" data-do="settings">Настройки</button></nav>
        <div class="header-right"><span class="build"><i></i>PROTOTYPE <b>0.1</b></span><span class="header-divider"></span><button class="icon-button sound-button" data-do="sound" aria-label="Выключить звук" title="Звук">${icon('sound')}</button><button class="icon-button" data-do="fullscreen" aria-label="Полный экран" title="Полный экран">${icon('expand')}</button></div>
      </header>
      <main class="workspace">
        <div class="mission-heading"><div><span class="micro accent">ГЛАВА 01</span><span class="slash-divider">/</span><span class="mission-name">Офис после релиза</span></div><div class="mission-meta"><span class="status-dot"></span><span id="mission-status">СИСТЕМА НЕСТАБИЛЬНА</span><button data-do="map" class="map-button">${icon('map')}<span>Карта сектора</span></button></div></div>
        <div class="game-layout">
          <aside class="sector-rail" aria-label="Прогресс экспедиции"><span class="rail-label">EXPEDITION</span><div class="rail-line"></div>${SECTORS.map((s,i)=>`<button class="rail-node ${i===0?'current':''}" data-do="map" data-sector="${i}" title="${s.name}"><span>0${i+1}</span></button>`).join('')}<div class="rail-line short"></div><span class="rail-end">${icon('terminal')}</span></aside>
          <section class="stage" aria-label="Игровая сцена: Офис после релиза">
            <canvas id="game" tabindex="0" aria-label="NULLPOINT. WASD — движение, J — лёгкий удар, K — тяжёлый удар, L — удар ногой, R — суперудар, Q — блок, пробел — прыжок, Shift — рывок, E — импульс, F — лифт, Escape — пауза."></canvas>
            <div class="stage-noise"></div><div class="stage-corners"></div>
            <div class="loading-panel"><span class="micro accent">INITIALIZING WORLD</span><div class="loading-line"><span></span></div><p>Пробуждаем старый код… <span id="load-percent">0%</span></p></div>
            <div class="menu-overlay hidden">
              <div class="menu-content"><div class="chapter-kicker"><span></span>ОФИС · ПЯТНИЧНЫЙ РЕЛИЗ</div><h1>ПОСЛЕ<br><span>РЕЛИЗА</span><sup>01</sup></h1><p class="menu-description">Офис опустел. Баги остались.<br>Поднимись по этажам<br>и доберись до корневого сервера.</p><button class="primary-button deploy-button" data-do="start"><span>${icon('terminal')}Начать экспедицию</span>${icon('arrow')}</button><button class="training-link" data-do="training">${icon('keyboard')}Тренировка комбинаций</button><div class="deploy-note"><span class="tiny-diamond"></span>ОДИН РАЗРАБОТЧИК. БЕСКОНЕЧНЫЙ БЭКЛОГ.</div></div>
              <div class="scene-caption"><span class="caption-line"></span><span>ВЕСТИБЮЛЬ<small>НОЧНАЯ СМЕНА · ЭТАЖИ 01 / 02</small></span></div>
              <div class="level-badge"><span>01—03</span><small>ТРИ УРОВНЯ · ШЕСТЬ ЭТАЖЕЙ</small></div>
            </div>
            <div class="hud hidden">
              <div class="player-hud"><div class="portrait"><span></span></div><div class="player-vitals"><div class="player-name"><b>Разработчик</b><span>ЭТ. <em id="player-level">01</em></span></div><div class="health-track"><div id="health-fill"></div></div><div class="health-meta"><span id="health-text">120 / 120</span><span>ЦЕЛОСТНОСТЬ КОДА</span></div><div class="guard-track" title="Запас блока"><span id="guard-fill"></span></div><div class="guard-label">Q · ЗАЩИТА <b id="guard-value">100%</b></div></div></div>
              <div class="objective-hud"><div class="micro accent" id="sector-label">COMMIT 001</div><strong id="objective-name">Вестибюль</strong><div><span id="objective-text">Устраните ошибки в старом коде</span> <b id="remaining">0 / 3</b></div></div>
              <div class="loot-hud">${icon('diamond')}<b id="shard-count">0</b><span>ФРАГМЕНТЫ</span></div>
              <div class="combo-hud hidden"><b id="combo-number">0</b><span>КОМБО<small id="combo-damage">0 УРОНА</small></span></div>
              <div class="combat-readout"><strong id="move-name"></strong><div id="input-history" aria-label="Последние нажатия"></div><small id="chain-hint">J → J → K → R</small><div class="attack-timing"><i id="attack-progress"></i></div><span id="attack-status">ГОТОВ К УДАРУ</span></div>
              <button class="super-panel" id="super-ability" data-action="super" aria-label="R — суперудар"><kbd>R</kbd><span><small id="super-caption">СОБЕРИТЕ КОМБИНАЦИЮ</small><strong id="super-name">Суперудар</strong><em id="super-recipe">J → J → K · затем R</em></span><i><b id="super-fill"></b></i></button>
              <div class="abilities">
                <button class="ability light-attack" data-action="attack" title="J / ЛКМ — лёгкий удар"><kbd>J</kbd>${icon('fist')}<span>КУЛАК</span></button>
                <button class="ability heavy-attack" data-action="heavy" title="K / ПКМ — тяжёлый удар"><kbd>K</kbd>${icon('keyboard')}<span>КЛАВИАТУРА</span></button>
                <button class="ability launch-attack" data-action="kick" title="L — удар ногой"><kbd>L</kbd>${icon('kick')}<span>НОГА</span></button>
                <button class="ability" id="guard-ability" data-guard title="Удерживайте Q — блок"><kbd>Q</kbd>${icon('shield')}<span>БЛОК</span></button>
                <button class="ability" id="jump-ability" data-action="jump" title="Пробел — прыжок"><kbd>SPACE</kbd>${icon('jump')}<span>ПРЫЖОК</span></button>
                <button class="ability" id="dash-ability" data-action="dash" title="Shift — рывок"><kbd>SHIFT</kbd>${icon('bolt')}<span>РЫВОК</span><em class="cooldown"></em></button>
                <button class="ability special" id="pulse-ability" data-action="pulse" title="E — отладочный импульс"><kbd>E</kbd>${icon('pulse')}<span>ИМПУЛЬС</span><em class="cooldown"></em></button>
                <button class="ability moves-ability" data-do="combos" title="Список комбинаций">${icon('book')}<span>ПРИЁМЫ</span></button>
              </div>
              <button class="lift-panel hidden" id="lift-ability" data-action="interact"><kbd>F</kbd><span><strong id="lift-title">Лифт</strong><small id="lift-hint">Поднимитесь на верхний этаж</small></span>${icon('elevator')}</button>
              <button class="pause-button icon-button" data-do="pause" aria-label="Пауза">${icon('pause')}</button>
              <div class="boss-hud hidden"><div><span>CRITICAL_EXCEPTION</span><b>РЕГРЕССИЯ</b><span id="boss-health"></span></div><div class="boss-track"><span></span></div></div>
            </div>
            <div class="zone-toast hidden" aria-live="polite"><span class="micro" id="toast-subtitle"></span><strong id="toast-title"></strong><span class="toast-rule"></span></div>
            <div class="state-overlay hidden"></div>
            <div class="touch-movement" aria-label="Сенсорное управление"><button data-key="KeyW" aria-label="Вверх">↑</button><button data-key="KeyA" aria-label="Влево">←</button><button data-key="KeyS" aria-label="Вниз">↓</button><button data-key="KeyD" aria-label="Вправо">→</button></div>
          </section>
        </div>
        <div class="under-stage"><div class="connection"><span class="status-dot"></span><span id="connection-label">ГОТОВ К ДЕПЛОЮ</span></div><div class="control-hints"><span><kbd>W A S D</kbd> Движение</span><span><kbd>J K L</kbd> Удары</span><span><kbd>R</kbd> Супер</span><span><kbd>Q</kbd> Блок</span><span><kbd>SPACE</kbd> Прыжок</span><span><kbd>SHIFT</kbd> Рывок</span><span><kbd>E</kbd> Импульс</span><span><kbd>F</kbd> Лифт</span><span><kbd>ESC</kbd> Пауза</span></div><button class="help-button moves-link" data-do="combos" aria-label="Приёмы и комбинации">Приёмы</button></div>
        <footer class="workspace-footer"><span>КОГДА КОД ОЖИВАЕТ, ОТЛАДКА СТАНОВИТСЯ БИТВОЙ.</span><span>HANDCRAFTED WORLD <i>✦</i> BUILD 001</span></footer>
      </main>
      <dialog class="modal"><div class="modal-inner"></div></dialog>`;
    this.canvas=this.root.querySelector('#game')!;this.dialog=this.root.querySelector('dialog')!;
    this.bind();this.world.onPhase=p=>this.phase(p);this.world.onToast=(a,b)=>this.toast(a,b);
    this.updateSound();
  }
  $(selector:string) {return this.root.querySelector<HTMLElement>(selector)!;}
  bind() {
    this.root.addEventListener('click',async event=>{
      const target=(event.target as HTMLElement).closest<HTMLElement>('[data-do],[data-action],[data-upgrade],[data-tab]');if(!target)return;
      if(target.dataset.action){this.onAction(target.dataset.action as Action);this.focus();return;}
      if(target.dataset.upgrade){this.world.upgrade(target.dataset.upgrade as Upgrade);this.focus();return;}
      if(target.dataset.tab){this.renderArchive(target.dataset.tab);return;}
      switch(target.dataset.do){
        case 'start':case 'restart':case 'training': if(this.ready){const training=target.dataset.do==='training'||(target.dataset.do==='restart'&&this.world.training);this.closeModal(false);await this.audio.init();this.world.start(training);this.focus();} break;
        case 'pause': this.pause();break;
        case 'resume':this.world.setPhase('playing');this.focus();break;
        case 'menu':this.world.setPhase('menu');this.world.reset();this.world.player.x=720;break;
        case 'expedition': if(this.world.phase==='playing')this.focus();else if(this.world.phase==='paused'){this.world.setPhase('playing');this.focus();}break;
        case 'archive':this.openModal();this.renderArchive('bestiary');break;
        case 'settings':this.openModal();this.renderSettings();break;
        case 'map':this.openModal();this.renderMap();break;
        case 'help':this.openModal();this.renderHelp();break;
        case 'combos':this.openModal();this.renderCombos();break;
        case 'close':this.closeModal();break;
        case 'sound':await this.audio.init();this.world.settings.volume=this.world.settings.volume?0:.35;this.saveSettings();break;
        case 'fullscreen':try {if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{this.toast('Полный экран недоступен','Откройте игру в отдельной вкладке браузера');}break;
      }
    });
    const guard=this.$('[data-guard]');
    guard.addEventListener('pointerdown',e=>{e.preventDefault();guard.setPointerCapture(e.pointerId);this.onAction('guard-start');});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])guard.addEventListener(event,()=>this.onAction('guard-end'));
    this.$('.brand').addEventListener('click',e=>{e.preventDefault();if(this.world.phase==='playing')this.pause();});
    this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.closeModal();});
    this.dialog.addEventListener('click',e=>{if(e.target===this.dialog)this.closeModal();});
    this.dialog.addEventListener('keydown',e=>e.stopPropagation());
    this.root.addEventListener('input',event=>{
      const target=event.target as HTMLInputElement;
      if(target.id==='volume'){this.world.settings.volume=Number(target.value)/100;this.$('#volume-value').textContent=target.value+'%';this.saveSettings();}
    });
    this.root.addEventListener('change',event=>{
      const target=event.target as HTMLInputElement;
      if(target.id==='particles'||target.id==='shake'){this.world.settings[target.id]=target.checked;this.saveSettings();}
      if(target.id==='difficulty'){this.world.settings.difficulty=target.value as 'normal'|'story';this.saveSettings();}
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.onMove(button.dataset.key!,true);});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>this.onMove(button.dataset.key!,false));
    });
  }
  focus(){(document.activeElement as HTMLElement)?.blur();this.canvas.focus({preventScroll:true});this.onFocus();}
  loading(progress:number){this.$('.loading-line span').style.width=progress*100+'%';this.$('#load-percent').textContent=Math.round(progress*100)+'%';}
  loaded(){this.ready=true;this.$('.loading-panel').classList.add('hidden');this.phase('menu');}
  loadError(message:string){this.$('.loading-panel').innerHTML=`<span class="micro accent">НЕ УДАЛОСЬ ЗАГРУЗИТЬ МИР</span><p>${message}</p><button class="primary-button" id="reload-assets">Повторить загрузку</button>`;this.$('#reload-assets').onclick=()=>location.reload();}
  phase(phase:Phase){
    this.root.dataset.phase=phase;this.root.classList.toggle('training-mode',this.world.training);
    this.$('.menu-overlay').classList.toggle('hidden',phase!=='menu');
    this.$('.hud').classList.toggle('hidden',phase==='menu');
    const overlay=this.$('.state-overlay');overlay.classList.toggle('hidden',['playing','menu'].includes(phase));
    this.$('#connection-label').textContent=phase==='menu'?'ГОТОВ К ДЕПЛОЮ':phase==='playing'?'СЕССИЯ АКТИВНА':phase==='won'?'ДЕПЛОЙ ЗАВЕРШЁН':'СЕССИЯ ПРИОСТАНОВЛЕНА';
    this.$('#mission-status').textContent=phase==='won'?'СИСТЕМА СТАБИЛЬНА':'СИСТЕМА НЕСТАБИЛЬНА';
    if(phase==='paused') overlay.innerHTML=`<div class="pause-content"><span class="micro accent">PROCESS.SUSPEND()</span><h2>Точка останова</h2><p>Даже отладчику нужен перерыв.</p><button class="primary-button" data-do="resume"><span>Продолжить</span>${icon('arrow')}</button><button class="text-button" data-do="restart">${icon('restart')}Начать заново</button><button class="text-button muted" data-do="menu">В главное меню</button></div>`;
    if(phase==='upgrade') overlay.innerHTML=`<div class="upgrade-content"><span class="micro accent">COMMIT SUCCESSFUL · +20 HP</span><h2>Время рефакторинга</h2><p>Лифт доставил вас к следующему отделу. Выберите улучшение перед выходом.</p><div class="upgrade-options">${UPGRADES.map(u=>`<button class="upgrade-card" data-upgrade="${u.id}"><span class="micro">${u.tag}</span><div class="upgrade-icon">${icon(u.icon)}</div><h3>${u.title}</h3><p>${u.description}</p><strong>${u.value}</strong><span class="upgrade-select">ПРИМЕНИТЬ ${icon('arrow')}</span></button>`).join('')}</div></div>`;
    if(phase==='won'||phase==='lost'){
      const won=phase==='won',stats=this.world.stats;
      overlay.innerHTML=`<div class="result-content"><div class="result-emblem">${icon(won?'check':'skull')}</div><span class="micro accent">${won?'BUILD PASSED · 0 ERRORS':'UNHANDLED EXCEPTION'}</span><h2>${won?'Релиз спасён.':'Сборка упала.'}</h2><p>${won?'Офис снова работает. Корневой сервер очищен.<br>На крыше наконец-то ловит связь.':'Баги оказались сильнее. Но каждый разработчик знает:<br>следующая попытка может всё изменить.'}</p><div class="result-stats"><div><b>${stats.kills}</b><span>УСТРАНЕНО</span></div><div><b>${stats.shards}</b><span>ФРАГМЕНТОВ</span></div><div><b>${this.time(stats.time)}</b><span>ВРЕМЯ</span></div><div><b>${stats.bestCombo}×</b><span>ЛУЧШЕЕ КОМБО</span></div></div><button class="primary-button" data-do="restart"><span>${won?'Новая экспедиция':'Пересобрать'} ${icon('restart')}</span>${icon('arrow')}</button><button class="text-button" data-do="menu">В главное меню</button></div>`;
      if(won){try{localStorage.setItem('nullpoint-best',JSON.stringify(stats));}catch{/* Storage may be unavailable in private browsing. */}}
    }
    if(!['playing','menu'].includes(phase)) this.$('.zone-toast').classList.add('hidden');
  }
  update(){
    const w=this.world,p=w.player;
    this.$('#health-fill').style.width=p.hp/p.maxHp*100+'%';this.$('#health-fill').classList.toggle('critical',p.hp<35);
    this.$('#health-text').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;this.$('#player-level').textContent=String(w.sector*2+(p.elevation>FLOOR_HEIGHT-10?2:1)).padStart(2,'0');
    this.$('#sector-label').textContent=`УРОВЕНЬ 0${w.sector+1} · ЭТАЖИ 0${w.sector*2+1} / 0${w.sector*2+2}`;this.$('#objective-name').textContent=SECTORS[w.sector].name;
    this.$('#objective-text').textContent=SECTORS[w.sector].subtitle;this.$('#remaining').textContent=`${SECTORS[w.sector].enemies.length-w.alive.length} / ${SECTORS[w.sector].enemies.length}`;
    if(w.training){this.$('#sector-label').textContent='TRAINING MODE';this.$('#objective-name').textContent='Полигон отладки';this.$('#objective-text').textContent='Мишень восстанавливается автоматически';this.$('#remaining').textContent='';}
    this.$('#guard-fill').style.width=p.guardMeter+'%';this.$('#guard-value').textContent=Math.ceil(p.guardMeter)+'%';
    this.$('#guard-ability').classList.toggle('in-flight',p.guarding);
    this.$('#combo-damage').textContent=`${w.comboDamage} УРОНА`;
    this.$('#move-name').textContent=w.moveNoticeTimer>0?w.moveNotice:'';
    const log=w.inputLog.map(i=>`<kbd class="key-${i.key}">${i.key}</kbd>`).join('');
    if(this.$('#input-history').innerHTML!==log)this.$('#input-history').innerHTML=log;
    const next=COMBOS.filter(c=>!w.chainAir&&c.inputs.length>w.chain.length&&w.chain.every((input,i)=>c.inputs[i]===input));
    this.$('#chain-hint').textContent=w.readySuper?`R → ${MOVES[w.readySuper].name}`:w.chain.length&&next.length?next.slice(0,2).map(c=>`${ATTACK_KEYS[c.inputs[w.chain.length]]} → ${MOVES[c.id].name}`).join(' · '):'J → J → K · дождитесь конца каждого удара';
    this.$('#attack-progress').style.width=(p.attack?1-p.attack/p.attackDuration:1)*100+'%';
    this.$('.combat-readout').classList.toggle('attacking',!!p.attack);
    this.$('#attack-status').textContent=p.attack?'УДАР · ДОЖДИТЕСЬ ЗАВЕРШЕНИЯ':w.chain.length?'ГОТОВ · ПРОДОЛЖАЙТЕ СВЯЗКУ':'ГОТОВ К УДАРУ';
    this.$('#super-ability').classList.toggle('charged',!!w.readySuper);
    this.$('#super-ability').setAttribute('aria-disabled',String(!w.acceptsAction('super')));
    this.$('#super-caption').textContent=w.readySuper?'КОМБИНАЦИЯ СОБРАНА':'СОБЕРИТЕ КОМБИНАЦИЮ';
    this.$('#super-name').textContent=w.readySuper?MOVES[w.readySuper].name:'Суперудар';
    this.$('#super-recipe').textContent=w.readySuper?`${p.jumpPhase==='grounded'?'Нажмите R':'Приземлитесь и нажмите R'} · ${Math.ceil(w.superTimer)} с`:'J → J → K · затем R';
    this.$('#super-fill').style.width=(w.superTimer/SUPER_WINDOW*100)+'%';
    this.$('#super-ability').style.setProperty('--super-color',w.readySuper?MOVES[w.readySuper].color:'#849e96');
    for(const el of this.root.querySelectorAll<HTMLElement>('.abilities [data-action]'))el.classList.toggle('attack-locked',!!p.attack);
    this.$('#lift-ability').classList.toggle('hidden',w.training||(!w.liftReady&&!w.nearLift)||w.liftTravel>0);
    this.$('#lift-ability').classList.toggle('available',w.canUseLift);
    this.$('#lift-ability').setAttribute('aria-disabled',String(!w.canUseLift));
    this.$('#lift-title').textContent=w.liftReady?(w.sector===2?'Выход на крышу':'Следующий уровень'):'Лифт заблокирован';
    this.$('#lift-hint').textContent=!w.liftReady?'Сначала устраните всех противников':w.canUseLift?'Нажмите F, чтобы войти':'Лифт на верхнем этаже справа';
    this.$('#shard-count').textContent=String(w.stats.shards);
    this.$('.combo-hud').classList.toggle('hidden',w.comboCount<2);this.$('#combo-number').textContent=`${w.comboCount}×`;
    for(const [id,value] of [['dash',p.dashCooldown],['pulse',p.pulseCooldown]] as const){const el=this.$(`#${id}-ability`);el.classList.toggle('on-cooldown',value>0);el.querySelector('.cooldown')!.textContent=value>0?value.toFixed(1):'';}
    this.$('#jump-ability').classList.toggle('in-flight',p.jumpPhase!=='grounded');
    const boss=w.enemies.find(e=>e.kind==='boss'&&e.state!=='dead');this.$('.boss-hud').classList.toggle('hidden',!boss);
    if(boss){this.$('.boss-track span').style.width=boss.hp/boss.maxHp*100+'%';this.$('#boss-health').textContent=`${boss.hp} / ${boss.maxHp}`;}
    this.root.querySelectorAll<HTMLElement>('.rail-node').forEach((el,i)=>{el.classList.toggle('current',i===w.sector);el.classList.toggle('complete',i<w.sector||w.phase==='won');});
  }
  time(seconds:number){return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
  pause(){if(this.dialog.open){this.closeModal();return;}if(this.world.phase==='playing')this.world.setPhase('paused');else if(this.world.phase==='paused'){this.world.setPhase('playing');this.focus();}}
  toast(title:string,subtitle:string){clearTimeout(this.toastTimer);this.$('#toast-title').textContent=title;this.$('#toast-subtitle').textContent=subtitle;this.$('.zone-toast').classList.remove('hidden');this.toastTimer=window.setTimeout(()=>this.$('.zone-toast').classList.add('hidden'),3200);}
  openModal(){if(this.dialog.open)return;this.modalWasPlaying=this.world.phase==='playing';if(this.modalWasPlaying)this.world.setPhase('paused');this.dialog.showModal();}
  closeModal(resume=true){if(this.dialog.open)this.dialog.close();if(resume&&this.modalWasPlaying){this.world.setPhase('playing');this.focus();}this.modalWasPlaying=false;}
  modalHeader(kicker:string,title:string){return `<div class="modal-header"><div><span class="micro accent">${kicker}</span><h2>${title}</h2></div><button class="icon-button" data-do="close" aria-label="Закрыть">${icon('close')}</button></div>`;}
  renderArchive(tab:string){
    const content=tab==='bestiary'?`<div class="bestiary-grid">${Object.entries(ENEMIES).map(([kind,e],i)=>`<article class="bestiary-card"><span class="micro">ENTITY_00${i+1}</span><div class="enemy-art ${kind}"></div><span class="micro accent">${e.tag}</span><h3>${e.name}</h3><p>${e.description}</p><div class="enemy-specs"><span>HP <b>${e.hp}</b></span><span>УРОН <b>${e.damage}</b></span></div></article>`).join('')}</div>`:tab==='world'?`<div class="lore"><div class="lore-image"></div><div><span class="micro accent">HQ / AFTER HOURS</span><h3>Всё началось<br>с пятничного релиза.</h3><p>Пятничный релиз вышел слишком поздно. Мониторы погасли, коллеги разошлись, а незакрытые задачи остались в офисе — и обрели плоть.</p><p>Баги оккупировали ресепшен, фичи захватили рабочие места, а Регрессия засела в серверном центре. Лестницы ещё доступны. Лифты откроются, когда отдел снова станет безопасным.</p><p>Проверенная клавиатура в правой руке, свободный левый кулак и одна рабочая ветка. Шесть этажей до конца ночной смены.</p></div></div>`:`<p class="archive-intro">Оригинальная графика офисного комплекса. Полные PNG с прозрачностью доступны для следующего этапа разработки.</p><div class="asset-grid">${[['office-wall','Офис после релиза','Рисованная панорама · 2170 × 725'],['developer-walk','Разработчик: ходьба','8 кадров · 1536 × 1024'],['developer-attack','Удар клавиатурой','8 кадров · 1536 × 1024'],['developer-jump','Прыжок и приземление','8 кадров · 1536 × 1024'],['developer-left-punch','Удар левой рукой','8 кадров · 1536 × 1024'],['developer-kick','Удар ногой','9 кадров · 1536 × 1024'],['office-floor','Пол и лестницы','Бесшовная текстура · 2171 × 724'],['enemies-illustrated','Бестиарий','6 спрайтов · 1536 × 1024'],['office-foreground','Небольшие предметы','6 объектов · 1536 × 1024'],['office-elevator','Лифт между уровнями','1024 × 1536 · RGBA']].map(([id,title,desc])=>`<a href="${import.meta.env.BASE_URL}assets/${id}.png" target="_blank" rel="noopener" class="asset-card"><img src="${import.meta.env.BASE_URL}assets/${id}.png" alt="${title}"><div><strong>${title}</strong><span>${desc}</span>${icon('arrow')}</div></a>`).join('')}</div>`;
    this.$('.modal-inner').innerHTML=this.modalHeader('THE ARCHIVE','Архив мира')+`<div class="archive-tabs">${[['bestiary','Бестиарий'],['world','История'],['assets','Ассеты']].map(([id,title])=>`<button class="${tab===id?'active':''}" data-tab="${id}">${title}</button>`).join('')}</div>`+content;
    if(tab==='bestiary') {
      const img=new Image();img.src=`${import.meta.env.BASE_URL}assets/enemies-illustrated.png`;
      img.onload=()=>this.root.querySelectorAll<HTMLElement>('.enemy-art').forEach((el,index)=>{
        const canvas=document.createElement('canvas');canvas.width=300;canvas.height=280;canvas.className=el.className;
        const ctx=canvas.getContext('2d')!,f=ENEMY_FRAMES[[0,3,5][index]],scale=Math.min(274/f.w,245/f.h);
        drawEnemyFrame(ctx,img,[0,3,5][index],(300-f.w*scale)/2,270-f.h*scale,scale);el.replaceWith(canvas);
      });
    }
  }
  renderCombos(){
    this.$('.modal-inner').innerHTML=this.modalHeader('COMBAT MANUAL','Приёмы и комбинации')+`
      <p class="combat-intro">Левый кулак, клавиатура в правой руке и нога. Нажимайте следующую кнопку после полного завершения удара. Три успешных попадания в правильном порядке заряжают отдельный суперудар на R.</p>
      <div class="strike-guide">${[['J','Левой рукой',MOVES.jab.damage,'Быстрый прямой кулак'],['K','Клавиатурой',MOVES.heavy.damage,'Тяжёлый удар с замахом'],['L','Ногой',MOVES.kick.damage,'Дальний пинок в корпус']].map(([key,name,damage,desc])=>`<div class="key-${key}"><kbd>${key}</kbd><strong>${name}</strong><span>${damage} УРОНА</span><small>${desc}</small></div>`).join('')}</div>
      <div class="combo-list">${COMBOS.map(c=>`<article><div class="combo-recipe">${c.inputs.map((input,i)=>`${i?'<span>→</span>':''}<kbd class="key-${ATTACK_KEYS[input]}">${ATTACK_KEYS[input]}</kbd>`).join('')}<span>→</span><kbd class="key-R">R</kbd></div><div><h3>${MOVES[c.id].name}</h3><p>${c.description}</p></div><b>${MOVES[c.id].damage}<small>СУПЕРУДАР</small><small>+ ${comboBaseDamage(c)} В СВЯЗКЕ</small></b></article>`).join('')}</div>
      <div class="combat-tips"><p><kbd>Q</kbd> Удерживайте блок лицом к врагу. Блок в первые 0,15 с парирует удар и открывает контратаку. Следите за полосой защиты.</p><p><kbd>SPACE</kbd> После STACK OVERFLOW прыгните за врагом и атакуйте в воздухе. Этажи соединены лестницами. Для подъёма зайдите к первой ступени в глубине коридора; лифт справа наверху открывается после зачистки.</p><p>Ранние и одновременные нажатия не сохраняются. После удара есть 0,9 с на следующий. Промах, разворот, рывок или полученный урон сбрасывают связку. Заряд R хранится 14 с; суперудар выполняется на земле и пробивает броню.</p></div>
      <div class="combat-manual-actions"><button class="primary-button" data-do="training"><span>Тренировка комбинаций</span>${icon('arrow')}</button><button class="text-button" data-do="help">Все клавиши управления</button></div>`;
  }
  renderSettings(){const s=this.world.settings;this.$('.modal-inner').innerHTML=this.modalHeader('CONFIGURATION','Настройки')+`<div class="settings-list"><label><span><strong>Громкость эффектов</strong><small>Удары, рывки и фрагменты кода</small></span><div class="volume-control"><input id="volume" type="range" min="0" max="100" value="${Math.round(s.volume*100)}" aria-label="Громкость"><b id="volume-value">${Math.round(s.volume*100)}%</b></div></label><label><span><strong>Частицы и атмосфера</strong><small>Искры, туман и рассыпающийся код</small></span><input id="particles" type="checkbox" ${s.particles?'checked':''}></label><label><span><strong>Тряска камеры</strong><small>Отдача от ударов и тяжёлых атак</small></span><input id="shake" type="checkbox" ${s.shake?'checked':''}></label><label><span><strong>Сложность</strong><small>В режиме истории входящий урон снижен</small></span><select id="difficulty"><option value="normal" ${s.difficulty==='normal'?'selected':''}>Разработчик</option><option value="story" ${s.difficulty==='story'?'selected':''}>История</option></select></label></div><p class="settings-note">Настройки сохраняются автоматически в этом браузере.</p>`;}
  renderMap(){this.$('.modal-inner').innerHTML=this.modalHeader('EXPEDITION / 01','Маршрут по офису')+`<div class="map-banner"><span class="micro">ОФИСНЫЙ КОМПЛЕКС</span><h3>Шесть этажей<br>до конца ночной смены.</h3></div><div class="map-stops">${SECTORS.map((s,i)=>`<div class="map-stop ${i===this.world.sector?'current':''}"><b>${i<this.world.sector?'✓':`0${i+1}`}</b><span class="micro">${i===2?'BOSS ENCOUNTER':`COMMIT 00${i+1}`}</span><h3>${s.name}</h3><p>${s.subtitle}</p><span class="map-status">${i<this.world.sector?'ОЧИЩЕНО':i===this.world.sector?'ВЫ ЗДЕСЬ':'ВПЕРЕДИ'}</span></div>`).join('')}</div><p class="settings-note">Очистите оба этажа, поднимитесь к лифту справа и нажмите F. Между уровнями выберите улучшение. В офисе 10 противников, включая босса.</p>`;}
  renderHelp(){this.$('.modal-inner').innerHTML=this.modalHeader('QUICK START','Как выжить в офисе')+`<div class="help-grid">${[['W A S D','Движение','Перемещайтесь вдоль коридора и в глубину. Лестницы в глубине коридора ведут на верхний этаж. Для удара нужна одна линия и высота с врагом.'],['J / K / L','Три удара','J — левый кулак, K — клавиатура, L — нога. Дождитесь конца каждого удара; ранние нажатия не запоминаются.'],['R','Суперудар','J–J–K: ударная волна. J–L–K: подброс. K–J–L: летящий заряд. После связки нажмите R на земле.'],['SPACE','Прыжок','Перепрыгивайте атаки. В воздухе доступны кулак, клавиатура и пинок. Между этажами перемещайтесь по лестнице.'],['SHIFT','Рывок','Короткая неуязвимость. Зажмите направление, чтобы проскочить сквозь атаку.'],['E','Отладочный импульс','Удар по области вокруг героя. Разбивает толпу, восстанавливается 8 секунд.'],['F','Лифт между уровнями','После зачистки обоих этажей поднимитесь к лифту справа наверху и нажмите F. Лифт перевезёт к следующему отделу.'],['ESC','Точка останова','Пауза в любой момент. При переходе в другую вкладку игра остановится автоматически.'],['+','Фрагменты и улучшения','Подбирайте фрагменты кода и здоровье. После зоны выберите одно из трёх усилений.']].map(([key,title,desc])=>`<div><kbd>${key}</kbd><h3>${title}</h3><p>${desc}</p></div>`).join('')}</div><p class="settings-note">Оранжевые области предупреждают об атаке. На сенсорном экране используйте стрелки и кнопки способностей.</p>`;}
  saveSettings(){this.audio.setVolume(this.world.settings.volume);this.updateSound();try{localStorage.setItem('nullpoint-settings',JSON.stringify(this.world.settings));}catch{/* Browser storage is optional. */}}
  updateSound(){const enabled=this.world.settings.volume>0;this.$('.sound-button').innerHTML=icon(enabled?'sound':'muted');this.$('.sound-button').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');}
}
