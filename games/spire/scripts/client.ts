import {raycast,closestOnBox,vec,type Arena,type Vec3,type ItemKind} from './arena.ts';
import {stepBody,newBody,bodyBox,forwardOf,eyePoint,heightOf,hitboxes,rayHitboxes,stanceOf,EYE_HEIGHT,TICK,type Body,type Posture,type Stance} from './physics.ts';
import {WEAPONS,WEAPON_IDS,BLASTER,SHOTGUN,AUTO,RIFLE,ROCKET,AIM_ZOOM,AIM_TIME,HEAT_PER_SHOT,HEAT_COOLING,RECOIL_RESET,ROCKET_SPEED,ROCKET_RADIUS,KNOCKBACK,LAG_COMPENSATION,ITEMS,
 splashDamage,spreadOf,recoilOf,usesMagazine,canReload,reloadMagazine,totalAmmo,applyItem,freshLoadout,type WeaponId,type Ammo} from './rules.ts';
import {pelletDirections,aimedDirection} from './host.ts';
import {fromV3,toV3,r2,type GameEvent,type HostMessage,type MatchPhase,type RosterEntry,type SessionOptions,type PlayerSnap} from './protocol.ts';
import type {ClientLink} from './session.ts';

/** Чужих игроков показываем с отставанием на INTERP секунд — между двумя снимками. */
export const INTERP=.1;
const POSE_INTERVAL=1/30;
const PING_INTERVAL=2;

/** aim — зажата правая кнопка (прицеливание). */
export type Input={forward:number;strafe:number;jump:boolean;fire:boolean;crouch?:boolean;lean?:number;aim?:boolean};
export type SoundName='blaster'|'shotgun'|'rocket'|'boom'|'jump'|'land'|'pad'|'pickup'|'mega'|'weapon'|'hit'|'hurt'|'death'|'frag'|'spawn'|'empty'|'lava'|'sudden'|'win'|'lose'|'join'|'slide'|'crouch'|'auto'|'rifle'|'reload'|'overheat'|'headshot'|'bolt';
export type Sound={name:SoundName;pos?:Vec3};
export type Tracer={from:Vec3;to:Vec3;color:string;age:number;life:number;w:WeaponId};
export type Blast={pos:Vec3;age:number};
/**
 * События для эффектов рендера — рендер забирает их каждый кадр. shot — выстрел (вспышка, гильзы);
 * impact — попадание: в поверхность (normal) или в игрока (victim, его цвет); boom — взрыв ракеты.
 */
export type FxEvent=
 |{k:'shot';origin:Vec3;dir:Vec3;w:WeaponId;own:boolean}
 |{k:'impact';pos:Vec3;normal:Vec3;dir:Vec3;w:WeaponId;victim:string|null;color:string}
 |{k:'boom';pos:Vec3};
export type RocketView={hostId:number|null;by:string;pos:Vec3;dir:Vec3;own:boolean;dead:boolean;age:number};
/** scoped — соперник смотрит в оптику винтовки (для блика). */
export type PlayerView={id:string;name:string;color:string;pos:Vec3;yaw:number;pitch:number;stance:Stance;lean:number;scoped:boolean;weapon:WeaponId;alive:boolean;muzzle:number};
export type ScoreRow={id:string;name:string;color:string;frags:number;deaths:number;self:boolean};
export type FeedEntry={killer:string;victim:string;w:WeaponId|'lava'|'fall';head:boolean;age:number};
type Sample={t:number;pos:Vec3;yaw:number;pitch:number;stance:Stance;lean:number;scoped:boolean};
type Other={samples:Sample[];weapon:WeaponId;alive:boolean;frags:number;deaths:number;muzzle:number};

const ITEM_TEXT:Record<ItemKind,string>={mega:'+100 здоровья',rocket:'Ракетница',shotgun:'Дробовик',auto:'Автомат',rifle:'Винтовка',armor:'+50 брони',health:'+25 здоровья',
 shells:'+10 патронов',bullets:'+30 патронов',rounds:'+5 патронов',rockets:'+5 ракет'};
const WEAPON_SOUND:SoundName[]=['blaster','shotgun','auto','rifle','rocket'];
const WEAPON_ITEM:Partial<Record<ItemKind,WeaponId>>={shotgun:SHOTGUN,auto:AUTO,rifle:RIFLE,rocket:ROCKET};
/** Толчок камеры от выстрела [вверх, вправо]; у автомата камера следует за паттерном отдачи. */
const KICK:[number,number][]=[[.004,0],[.045,0],[0,0],[.03,0],[.035,0]];
const sub=(a:Vec3,b:Vec3)=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
const addScaled=(a:Vec3,b:Vec3,k:number)=>vec(a.x+b.x*k,a.y+b.y*k,a.z+b.z*k);
const length=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);

/**
 * Клиент игрока — одинаковый у хоста и у гостей. Своё движение считает сразу (без ожидания хоста),
 * чужих игроков интерполирует по снимкам, а попадания, урон и фраги принимает от хоста.
 */
export class GameClient{
 id='';name='';color='';options:SessionOptions|null=null;roster=new Map<string,RosterEntry>();connected=false;
 body:Body=newBody(vec());yaw=0;pitch=0;life=0;alive=false;weapon:WeaponId=0;
 health=100;armor=0;frags=0;deaths=0;
 ammo:Ammo=freshLoadout().ammo;mag:Ammo=freshLoadout().mag;owned=freshLoadout().owned;
 /** Нагрев бластера от 0 до 1; overheated — ствол остывает, стрелять нельзя. */
 heat=0;overheated=false;reloading:{w:WeaponId;until:number}|null=null;
 /** aim — доля прицеливания от 0 до 1; punch — видимый увод камеры отдачей [вверх, вправо]. */
 aim=0;punch:[number,number]=[0,0];headFlash=0;
 /** Тряска камеры от близких взрывов, от 0 до 1. */
 shake=0;
 phase:MatchPhase='playing';left=0;winner:string|null=null;restart=0;items='';rtt=0;time=0;
 tracers:Tracer[]=[];blasts:Blast[]=[];fx:FxEvent[]=[];rockets:RocketView[]=[];feed:FeedEntry[]=[];sounds:Sound[]=[];notes:{text:string;age:number}[]=[];
 hitFlash=0;damageFlash=0;eyeOffset=EYE_HEIGHT;damageFrom:Vec3|null=null;killedBy:{killer:string;w:FeedEntry['w']}|null=null;deathTime=0;muzzle=0;fell=false;
 private others=new Map<string,Other>();private rows:PlayerSnap[]=[];
 private pending:{seq:number;w:WeaponId}[]=[];private seq=0;private nextFire=0;private burst=0;private lastShot=-9;private boltUntil=0;private reloadGrace=0;
 private acc=0;private poseTimer=0;private pingTimer=0;
 private arena:Arena;private link:ClientLink;private random:()=>number;
 constructor(arena:Arena,link:ClientLink,random:()=>number=Math.random){this.arena=arena;this.link=link;this.random=random;}

 get posture():Posture{return {pos:this.body.pos,crouch:this.body.crouch,lean:this.body.lean,yaw:this.yaw};}
 /** Глаза бойца по физике: отсюда летят выстрелы. */
 get eye(){return eyePoint(this.arena,this.posture);}
 /** Камера: те же глаза, но высота меняется плавно при приседе и вставании. */
 get view(){const e=this.eye;return vec(e.x,this.body.pos.y+this.eyeOffset,e.z);}
 get stance(){return stanceOf(this.body);}
 nameOf(id:string){return this.roster.get(id)?.name??'Боец';}
 colorOf(id:string){return this.roster.get(id)?.color??'#cccccc';}

 receive(msg:HostMessage){
  switch(msg.k){
   case 'welcome':this.id=msg.id;this.name=msg.name;this.color=msg.color;this.options=msg.options;this.connected=true;break;
   case 'roster':{const before=new Set(this.roster.keys());this.roster=new Map(msg.players.map(p=>[p.id,p]));
    for(const id of this.others.keys())if(!this.roster.has(id))this.others.delete(id);
    if(before.size&&msg.players.some(p=>!before.has(p.id)&&p.id!==this.id))this.sounds.push({name:'join'});break;}
   case 'snap':this.applySnapshot(msg);break;
   case 'ev':for(const e of msg.list)this.applyEvent(e);break;
   case 'pong':this.rtt=this.rtt?this.rtt*.7+(performance.now()-msg.t)/1000*.3:(performance.now()-msg.t)/1000;break;
  }
 }

 private applySnapshot(s:Extract<HostMessage,{k:'snap'}>){
  this.phase=s.phase;this.left=s.left;this.winner=s.winner;this.restart=s.restart;this.items=s.items;this.rows=s.players;
  for(const row of s.players){
   const [id,x,y,z,yaw,pitch,weapon,health,armor,alive,frags,deaths,ammo,mag,owned,ack,life,stance,lean,scoped]=row;
   if(id===this.id){
    this.health=health;this.armor=armor;this.frags=frags;this.deaths=deaths;
    this.owned=WEAPON_IDS.map(w=>!!(owned&1<<w)) as typeof this.owned;this.pending=this.pending.filter(p=>p.seq>ack);
    // Пока идёт своя перезарядка (и чуть после — пока хост её не догонит), магазин считаем сами.
    const pend=(w:WeaponId)=>this.pending.filter(p=>p.w===w).length,hostMag=[0,0,mag[0],mag[1],0];
    for(const w of WEAPON_IDS){
     if(w===BLASTER||usesMagazine(w)&&(this.reloading||this.time<this.reloadGrace))continue;
     this.ammo[w]=ammo[w-1]-(usesMagazine(w)?0:pend(w));if(usesMagazine(w))this.mag[w]=hostMag[w]-pend(w);
    }
    if(alive&&life>this.life)this.spawn(vec(x,y,z),yaw,life);
    continue;
   }
   const o=this.others.get(id)??{samples:[],weapon:0,alive:false,frags:0,deaths:0,muzzle:0};
   o.weapon=weapon;o.alive=!!alive;o.frags=frags;o.deaths=deaths;
   o.samples.push({t:this.time,pos:vec(x,y,z),yaw,pitch,stance:stance??0,lean:lean??0,scoped:!!scoped});while(o.samples.length>2&&o.samples[0].t<this.time-1)o.samples.shift();
   this.others.set(id,o);
  }
 }

 private applyEvent(e:GameEvent){
  const me=this.id;
  switch(e.e){
   case 'shot':{
    if(e.by===me)return;const o=this.others.get(e.by);if(o)o.muzzle=.07;
    const origin=fromV3(e.o);this.sounds.push({name:WEAPON_SOUND[e.w],pos:origin});this.fx.push({k:'shot',origin,dir:fromV3(e.d),w:e.w,own:false});
    for(const d of pelletDirections(fromV3(e.d),e.w,e.seed))this.addTracer(origin,d,e.by,false,e.w);
    return;
   }
   case 'rocket':{
    if(e.by===me){const own=this.rockets.find(r=>r.own&&r.hostId===null);if(own)own.hostId=e.id;return;}
    const o=this.others.get(e.by);if(o)o.muzzle=.07;
    this.rockets.push({hostId:e.id,by:e.by,pos:fromV3(e.o),dir:fromV3(e.d),own:false,dead:false,age:0});this.sounds.push({name:'rocket',pos:fromV3(e.o)});
    this.fx.push({k:'shot',origin:fromV3(e.o),dir:fromV3(e.d),w:ROCKET,own:false});return;
   }
   case 'boom':{
    const r=this.rockets.find(x=>x.hostId===e.id&&x.by===e.by);
    if(r?.own&&r.dead)return;
    if(r)r.dead=true;this.blast(fromV3(e.p));return;
   }
   case 'hurt':
    if(e.to!==me)return;
    this.damageFlash=Math.min(1,.35+e.amount/80);this.damageFrom=fromV3(e.from);this.sounds.push({name:'hurt'});
    // Отдачу от своей ракеты клиент уже посчитал сам при локальном взрыве.
    if(e.by!==me&&this.alive){this.body.vel.x+=e.knock[0];this.body.vel.y+=e.knock[1];this.body.vel.z+=e.knock[2];if(e.knock[1]>0)this.body.onGround=false;}
    return;
   case 'hit':if(e.by===me){this.hitFlash=.18;if(e.head)this.headFlash=.3;this.sounds.push({name:e.head?'headshot':'hit'});}return;
   case 'reload':{if(e.id===me)return;const v=this.views().find(p=>p.id===e.id);if(v)this.sounds.push({name:'reload',pos:v.pos});return;}
   case 'kill':
    this.feed.unshift({killer:e.killer,victim:e.victim,w:e.w,head:!!e.head,age:0});this.feed.length=Math.min(this.feed.length,5);
    if(e.victim===me){this.alive=false;this.killedBy={killer:e.killer,w:e.w};this.deathTime=this.time;this.sounds.push({name:e.w==='lava'?'lava':'death'});}
    else if(e.killer===me){this.sounds.push({name:'frag'});this.note(`Фраг: ${this.nameOf(e.victim)}`);}
    else{const o=this.others.get(e.victim);if(o)o.alive=false;}
    return;
   case 'spawn':
    if(e.id===me){this.spawn(fromV3(e.p),e.yaw,e.life);return;}
    {const o=this.others.get(e.id);if(o){o.samples=[{t:this.time,pos:fromV3(e.p),yaw:e.yaw,pitch:0,stance:0,lean:0,scoped:false}];o.alive=true;}}
    return;
   case 'pick':{
    const spot=this.arena.items[e.item];if(!spot)return;
    if(e.id!==me){this.sounds.push({name:'pickup',pos:spot.pos});return;}
    const w=WEAPON_ITEM[spot.kind];
    this.sounds.push({name:spot.kind==='mega'?'mega':w!==undefined?'weapon':'pickup'});this.note(ITEM_TEXT[spot.kind]);
    // Предсказываем подбор теми же правилами, что у хоста: новое оружие сразу в руках.
    const had=w!==undefined&&this.owned[w],mine={health:this.health,armor:this.armor,owned:this.owned,ammo:this.ammo,mag:this.mag};
    applyItem(mine,spot.kind);this.health=mine.health;this.armor=mine.armor;
    if(w!==undefined&&!had)this.selectWeapon(w);
    return;
   }
   case 'match':
    this.phase=e.phase;this.winner=e.winner;
    if(e.phase==='sudden'){this.sounds.push({name:'sudden'});this.note('Внезапная смерть: решает следующий фраг лидера');}
    if(e.phase==='over')this.sounds.push({name:e.winner===me?'win':'lose'});
    if(e.phase==='playing')this.feed=[];
    return;
  }
 }

 private spawn(p:Vec3,yaw:number,life:number){
  this.body=newBody(p);this.body.onGround=true;this.yaw=yaw;this.pitch=0;this.life=life;this.alive=true;this.weapon=BLASTER;this.killedBy=null;this.fell=false;
  const fresh=freshLoadout();this.ammo=fresh.ammo;this.mag=fresh.mag;this.owned=fresh.owned;
  this.heat=0;this.overheated=false;this.reloading=null;this.aim=0;this.punch=[0,0];this.burst=0;this.boltUntil=0;
  this.pending=[];this.nextFire=this.time+.2;this.damageFlash=0;this.eyeOffset=EYE_HEIGHT;this.sounds.push({name:'spawn'});
 }
 private note(text:string){this.notes.unshift({text,age:0});this.notes.length=Math.min(this.notes.length,3);}

 look(dx:number,dy:number){this.yaw-=dx;this.pitch=Math.max(-1.5,Math.min(1.5,this.pitch-dy));}
 selectWeapon(w:WeaponId){
  if(!this.owned[w]||this.weapon===w||w!==BLASTER&&totalAmmo(this,w)<=0)return;
  this.weapon=w;this.reloading=null;this.aim=0;this.burst=0;this.nextFire=Math.max(this.nextFire,this.time+.25);this.sounds.push({name:'weapon'});
 }
 cycleWeapon(step:number){
  const n=WEAPON_IDS.length;
  for(let i=1;i<n;i++){const w=((this.weapon+step*i)%n+n)%n as WeaponId;if(this.owned[w]&&(w===BLASTER||totalAmmo(this,w)>0)){this.selectWeapon(w);return;}}
 }
 /** Перезарядка автомата или винтовки: хост добирает магазин через WEAPONS[w].reload секунд. */
 reload(){
  const w=this.weapon;if(!this.alive||this.reloading||!canReload(this,w))return;
  this.reloading={w,until:this.time+WEAPONS[w].reload};this.aim=0;this.link.send({k:'reload',w});this.sounds.push({name:'reload'});
 }
 /** Сколько секунд прошло после своего последнего выстрела (для анимации затвора и помпы). */
 shotAge(){return this.time-this.lastShot;}
 /** Сколько осталось перезаряжаться — от 1 до 0, или 0, если перезарядки нет. */
 reloadLeft(){return this.reloading?Math.max(0,(this.reloading.until-this.time)/WEAPONS[this.reloading.w].reload):0;}
 /** Текущий разброс оружия в руках (для прицела на экране). */
 spread(){return spreadOf(this.weapon,{airborne:!this.body.onGround,aim:this.aim,crouch:this.body.crouch});}
 /** Во сколько раз сужен обзор сейчас. */
 zoom(){const z=AIM_ZOOM[this.weapon]??1;return 1+(z-1)*this.aim;}

 update(dt:number,input:Input){
  this.time+=dt;this.decay(dt);this.updateArms(dt,input);
  const active=this.connected&&this.alive&&!this.fell&&this.phase!=='over';
  if(active){
   this.acc=Math.min(this.acc+dt,.25);
   while(this.acc>=TICK){
    this.acc-=TICK;
    const crouched=this.body.crouch,ev=stepBody(this.arena,this.body,{...input,yaw:this.yaw},TICK);
    this.eyeOffset-=ev.tuck;
    if(ev.slide)this.sounds.push({name:'slide'});else if(this.body.crouch!==crouched&&this.body.onGround)this.sounds.push({name:'crouch'});
    if(ev.jumped)this.sounds.push({name:'jump'});if(ev.landed>9)this.sounds.push({name:'land'});if(ev.pad>=0)this.sounds.push({name:'pad'});
    if(ev.lava||ev.out){this.fell=true;break;}
   }
   if(input.fire)this.fire();
  }
  const eyeTarget=this.eye.y-this.body.pos.y;this.eyeOffset+=(eyeTarget-this.eyeOffset)*Math.min(1,dt*14);
  this.poseTimer+=dt;
  if(this.connected&&this.alive&&this.poseTimer>=POSE_INTERVAL){
   this.poseTimer=0;this.link.send({k:'pose',life:this.life,p:toV3(this.body.pos),v:toV3(this.body.vel),yaw:r2(this.yaw),pitch:r2(this.pitch),w:this.weapon,s:this.stance,l:r2(this.body.lean),a:this.weapon===RIFLE&&this.aim>.9?1:0});
  }
  this.pingTimer+=dt;if(this.connected&&this.pingTimer>=PING_INTERVAL){this.pingTimer=0;this.link.send({k:'ping',t:performance.now()});}
  this.stepRockets(dt);
 }

 /** Оружие в руках: остывание бластера, конец перезарядки, прицеливание и возврат камеры после отдачи. */
 private updateArms(dt:number,input:Input){
  this.heat=Math.max(0,this.heat-HEAT_COOLING*dt);if(this.overheated&&this.heat<=0)this.overheated=false;
  if(this.reloading&&this.time>=this.reloading.until){
   reloadMagazine(this,this.reloading.w);this.reloading=null;this.reloadGrace=this.time+this.rtt+.3;
  }
  const canAim=this.alive&&!this.fell&&AIM_ZOOM[this.weapon]!==undefined&&!this.reloading&&this.time>=this.boltUntil&&!!input.aim;
  this.aim=canAim?Math.min(1,this.aim+dt/AIM_TIME):Math.max(0,this.aim-dt/AIM_TIME*1.5);
  if(this.time-this.lastShot>RECOIL_RESET)this.burst=0;
  const k=Math.exp(-dt*9);this.punch=[this.punch[0]*k,this.punch[1]*k];
 }

 private fire(){
  const w=this.weapon,W=WEAPONS[w],magazine=usesMagazine(w);if(this.time<this.nextFire||this.reloading)return;
  if(w===BLASTER&&this.overheated)return;
  if(w!==BLASTER&&(magazine?this.mag[w]:this.ammo[w])<=0){
   if(magazine&&this.ammo[w]>0){this.reload();return;}
   this.nextFire=this.time+.4;this.sounds.push({name:'empty'});this.cycleWeapon(-1);return;
  }
  this.nextFire=this.time+W.interval;this.muzzle=.07;
  if(magazine)this.mag[w]--;else if(w!==BLASTER)this.ammo[w]--;
  if(w===BLASTER){this.heat+=HEAT_PER_SHOT;if(this.heat>=1){this.overheated=true;this.sounds.push({name:'overheat'});}}
  const seq=++this.seq,seed=Math.floor(this.random()*4294967296)>>>0,origin=this.eye,aimDir=forwardOf(this.yaw,this.pitch);
  // Одиночную пулю отклоняем сами: разброс зависит от стойки и прицеливания, отдача — от номера пули в очереди.
  const recoil=recoilOf(w,this.burst);
  const dir=W.pellets===1&&w!==ROCKET?aimedDirection(aimDir,this.spread(),recoil,seed):aimDir;
  this.burst++;this.lastShot=this.time;
  this.punch=w===AUTO?[recoil[0]*.55+.003,recoil[1]*.55]:[this.punch[0]+KICK[w][0],this.punch[1]+KICK[w][1]];
  if(w===RIFLE){this.boltUntil=this.time+W.interval*.85;this.sounds.push({name:'bolt'});}
  this.pending.push({seq,w});
  this.link.send({k:'fire',w,o:toV3(origin),d:[r2(dir.x*1e4)/1e4,r2(dir.y*1e4)/1e4,r2(dir.z*1e4)/1e4],seed,lag:r2(Math.min(LAG_COMPENSATION,this.rtt/2+INTERP)),seq});
  this.sounds.push({name:WEAPON_SOUND[w]});this.fx.push({k:'shot',origin,dir,w,own:true});
  if(w===ROCKET){this.rockets.push({hostId:null,by:this.id,pos:{...origin},dir,own:true,dead:false,age:0});return;}
  for(const d of pelletDirections(dir,w,seed))this.addTracer(origin,d,this.id,true,w);
 }
 private addTracer(origin:Vec3,d:Vec3,by:string,own:boolean,w:WeaponId){
  const wall=raycast(this.arena,origin,d,120);let t=wall.t,victim:string|null=null;
  for(const v of this.views()){if(v.id===by||!v.alive)continue;const hit=rayHitboxes(this.hitboxesOf(v),origin,d,t);if(hit.t<t){t=hit.t;victim=v.id;}}
  if(!own&&this.alive){const hit=rayHitboxes(hitboxes(this.arena,this.posture),origin,d,t);if(hit.t<t){t=hit.t;victim=this.id;}}
  const end=addScaled(origin,d,t);
  // Свой трассер рисуем от ствола справа внизу, иначе он виден точно с торца.
  const from=own?addScaled(addScaled(addScaled(origin,vec(Math.cos(this.yaw),0,-Math.sin(this.yaw)),.2),vec(0,1,0),-.17),d,.7):addScaled(origin,d,.6);
  this.tracers.push({from,to:end,color:this.colorOf(by),age:0,life:w===RIFLE?.45:.12,w});
  if(t<120)this.fx.push({k:'impact',pos:end,normal:victim?vec(-d.x,-d.y,-d.z):wall.normal,dir:d,w,victim,color:victim?this.colorOf(victim):'#ffd38a'});
 }
 private stepRockets(dt:number){
  for(const r of this.rockets){
   if(r.dead){r.age+=dt;continue;}
   r.age+=dt;const dist=ROCKET_SPEED*dt,limit=dist+ROCKET_RADIUS;let t=raycast(this.arena,r.pos,r.dir,limit).t;
   if(r.own)for(const v of this.views()){if(!v.alive)continue;const hit=rayHitboxes(this.hitboxesOf(v),r.pos,r.dir,t);if(hit.t<t)t=hit.t;}
   if(t<limit){
    const at=addScaled(r.pos,r.dir,Math.max(0,t-ROCKET_RADIUS-.05));r.pos=at;r.dead=true;
    if(r.own){this.blast(at);this.selfKnock(at);}
    continue;
   }
   r.pos=addScaled(r.pos,r.dir,dist);if(r.age>10)r.dead=true;
  }
  this.rockets=this.rockets.filter(r=>!r.dead||r.age<3);
 }
 /** Рокет-джамп: отдачу от своей ракеты считаем сразу, по той же формуле, что и хост. */
 private selfKnock(at:Vec3){
  if(!this.alive)return;const height=heightOf(this.body.crouch),box=bodyBox(this.body.pos,0,height),dist=length(sub(closestOnBox(box,at),at)),amount=splashDamage(dist);if(!amount)return;
  const center=vec(this.body.pos.x,this.body.pos.y+height/2,this.body.pos.z),away=sub(center,at),l=length(away);
  const dir=l<.01?vec(0,1,0):vec(away.x/l,away.y/l,away.z/l),k=Math.min(amount,200)*KNOCKBACK;
  this.body.vel=addScaled(this.body.vel,dir,k);if(dir.y>0)this.body.onGround=false;
 }
 private blast(p:Vec3){
  this.blasts.push({pos:p,age:0});this.sounds.push({name:'boom',pos:p});this.fx.push({k:'boom',pos:p});
  // Тряска тем сильнее, чем ближе взрыв: в упор — полная, дальше 16 м — нет.
  const d=length(sub(p,this.eye));this.shake=Math.max(this.shake,Math.max(0,1-d/16));
 }
 private decay(dt:number){
  for(const list of [this.tracers,this.blasts,this.feed,this.notes] as {age:number}[][])for(const x of list)x.age+=dt;
  this.tracers=this.tracers.filter(t=>t.age<t.life);this.blasts=this.blasts.filter(b=>b.age<.7);this.shake=Math.max(0,this.shake-dt*1.8);if(this.fx.length>400)this.fx.splice(0,this.fx.length-400);
  this.feed=this.feed.filter(f=>f.age<6);this.notes=this.notes.filter(n=>n.age<2.5);
  this.hitFlash=Math.max(0,this.hitFlash-dt);this.headFlash=Math.max(0,this.headFlash-dt);this.damageFlash=Math.max(0,this.damageFlash-dt*1.6);this.muzzle=Math.max(0,this.muzzle-dt);
  for(const o of this.others.values())o.muzzle=Math.max(0,o.muzzle-dt);
 }

 /** Чужие игроки на момент time − INTERP. */
 views():PlayerView[]{
  const at=this.time-INTERP,list:PlayerView[]=[];
  for(const [id,o] of this.others){
   const s=o.samples;if(!s.length)continue;let a=s[0],b=s[s.length-1];
   for(let i=1;i<s.length;i++)if(s[i].t>=at){a=s[i-1];b=s[i];break;}
   const k=b.t>a.t?Math.max(0,Math.min(1,(at-a.t)/(b.t-a.t))):1;
   let dy=b.yaw-a.yaw;while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;
   list.push({id,name:this.nameOf(id),color:this.colorOf(id),pos:vec(a.pos.x+(b.pos.x-a.pos.x)*k,a.pos.y+(b.pos.y-a.pos.y)*k,a.pos.z+(b.pos.z-a.pos.z)*k),
    yaw:a.yaw+dy*k,pitch:a.pitch+(b.pitch-a.pitch)*k,stance:k<.5?a.stance:b.stance,lean:a.lean+(b.lean-a.lean)*k,scoped:b.scoped,weapon:o.weapon,alive:o.alive,muzzle:o.muzzle});
  }
  return list;
 }
 hitboxesOf(v:PlayerView){return hitboxes(this.arena,{pos:v.pos,crouch:v.stance>0,lean:v.lean,yaw:v.yaw});}
 scores():ScoreRow[]{
  return this.rows.map(r=>({id:r[0],name:this.nameOf(r[0]),color:this.colorOf(r[0]),frags:r[10],deaths:r[11],self:r[0]===this.id})).sort((a,b)=>b.frags-a.frags||a.deaths-b.deaths);
 }
 /** Место игрока и отрыв: «2-й, −3» или «1-й, +2». */
 standing(){
  const rows=this.scores(),place=rows.findIndex(r=>r.self)+1,mine=rows.find(r=>r.self)?.frags??0;
  const other=rows.filter(r=>!r.self)[0];return {place:place||1,total:rows.length||1,gap:other?mine-other.frags:0};
 }
 itemAvailable(i:number){return this.items[i]!=='0';}
 respawnIn(){return Math.max(0,2-(this.time-this.deathTime));}
 itemName(kind:ItemKind){return ITEMS[kind].name;}
}
