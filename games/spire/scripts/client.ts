import {raycast,rayBox,closestOnBox,vec,type Arena,type Vec3,type ItemKind} from './arena.ts';
import {stepBody,newBody,bodyBox,forwardOf,EYE_HEIGHT,HEIGHT,TICK,type Body} from './physics.ts';
import {WEAPONS,ROCKET_SPEED,ROCKET_RADIUS,KNOCKBACK,LAG_COMPENSATION,ITEMS,splashDamage,type WeaponId} from './rules.ts';
import {pelletDirections} from './host.ts';
import {fromV3,toV3,r2,type GameEvent,type HostMessage,type MatchPhase,type RosterEntry,type SessionOptions,type PlayerSnap} from './protocol.ts';
import type {ClientLink} from './session.ts';

/** Чужих игроков показываем с отставанием на INTERP секунд — между двумя снимками. */
export const INTERP=.1;
const POSE_INTERVAL=1/30;
const PING_INTERVAL=2;

export type Input={forward:number;strafe:number;jump:boolean;fire:boolean};
export type SoundName='blaster'|'shotgun'|'rocket'|'boom'|'jump'|'land'|'pad'|'pickup'|'mega'|'weapon'|'hit'|'hurt'|'death'|'frag'|'spawn'|'empty'|'lava'|'sudden'|'win'|'lose'|'join';
export type Sound={name:SoundName;pos?:Vec3};
export type Tracer={from:Vec3;to:Vec3;color:string;age:number;life:number};
export type Blast={pos:Vec3;age:number};
export type Spark={pos:Vec3;age:number;color:string};
export type RocketView={hostId:number|null;by:string;pos:Vec3;dir:Vec3;own:boolean;dead:boolean;age:number};
export type PlayerView={id:string;name:string;color:string;pos:Vec3;yaw:number;pitch:number;weapon:WeaponId;alive:boolean;muzzle:number};
export type ScoreRow={id:string;name:string;color:string;frags:number;deaths:number;self:boolean};
export type FeedEntry={killer:string;victim:string;w:WeaponId|'lava'|'fall';age:number};
type Sample={t:number;pos:Vec3;yaw:number;pitch:number};
type Other={samples:Sample[];weapon:WeaponId;alive:boolean;frags:number;deaths:number;muzzle:number};

const ITEM_TEXT:Record<ItemKind,string>={mega:'+100 здоровья',rocket:'Ракетница',shotgun:'Дробовик',armor:'+50 брони',health:'+25 здоровья',shells:'+10 патронов',rockets:'+5 ракет'};
const WEAPON_SOUND:SoundName[]=['blaster','shotgun','rocket'];
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
 health=100;armor=0;ammo:[number,number,number]=[Infinity,0,0];owned:[boolean,boolean,boolean]=[true,false,false];frags=0;deaths=0;
 phase:MatchPhase='playing';left=0;winner:string|null=null;restart=0;items='';rtt=0;time=0;
 tracers:Tracer[]=[];blasts:Blast[]=[];sparks:Spark[]=[];rockets:RocketView[]=[];feed:FeedEntry[]=[];sounds:Sound[]=[];notes:{text:string;age:number}[]=[];
 hitFlash=0;damageFlash=0;damageFrom:Vec3|null=null;killedBy:{killer:string;w:FeedEntry['w']}|null=null;deathTime=0;muzzle=0;fell=false;
 private others=new Map<string,Other>();private rows:PlayerSnap[]=[];
 private pending:{seq:number;w:WeaponId}[]=[];private seq=0;private nextFire=0;private hostAmmo:[number,number,number]=[Infinity,0,0];
 private acc=0;private poseTimer=0;private pingTimer=0;
 private arena:Arena;private link:ClientLink;private random:()=>number;
 constructor(arena:Arena,link:ClientLink,random:()=>number=Math.random){this.arena=arena;this.link=link;this.random=random;}

 get eye(){return vec(this.body.pos.x,this.body.pos.y+EYE_HEIGHT,this.body.pos.z);}
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
   const [id,x,y,z,yaw,pitch,weapon,health,armor,alive,frags,deaths,shells,rockets,owned,ack,life]=row;
   if(id===this.id){
    this.health=health;this.armor=armor;this.frags=frags;this.deaths=deaths;this.owned=[true,!!(owned&2),!!(owned&4)];
    this.hostAmmo=[Infinity,shells,rockets];this.pending=this.pending.filter(p=>p.seq>ack);
    this.ammo=[Infinity,shells-this.pending.filter(p=>p.w===1).length,rockets-this.pending.filter(p=>p.w===2).length];
    if(alive&&life>this.life)this.spawn(vec(x,y,z),yaw,life);
    continue;
   }
   const o=this.others.get(id)??{samples:[],weapon:0,alive:false,frags:0,deaths:0,muzzle:0};
   o.weapon=weapon;o.alive=!!alive;o.frags=frags;o.deaths=deaths;
   o.samples.push({t:this.time,pos:vec(x,y,z),yaw,pitch});while(o.samples.length>2&&o.samples[0].t<this.time-1)o.samples.shift();
   this.others.set(id,o);
  }
 }

 private applyEvent(e:GameEvent){
  const me=this.id;
  switch(e.e){
   case 'shot':{
    if(e.by===me)return;const o=this.others.get(e.by);if(o)o.muzzle=.07;
    const origin=fromV3(e.o);this.sounds.push({name:WEAPON_SOUND[e.w],pos:origin});
    for(const d of pelletDirections(fromV3(e.d),e.w,e.seed))this.addTracer(origin,d,e.by,false);
    return;
   }
   case 'rocket':{
    if(e.by===me){const own=this.rockets.find(r=>r.own&&r.hostId===null);if(own)own.hostId=e.id;return;}
    const o=this.others.get(e.by);if(o)o.muzzle=.07;
    this.rockets.push({hostId:e.id,by:e.by,pos:fromV3(e.o),dir:fromV3(e.d),own:false,dead:false,age:0});this.sounds.push({name:'rocket',pos:fromV3(e.o)});return;
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
   case 'hit':if(e.by===me){this.hitFlash=.18;this.sounds.push({name:'hit'});}return;
   case 'kill':
    this.feed.unshift({killer:e.killer,victim:e.victim,w:e.w,age:0});this.feed.length=Math.min(this.feed.length,5);
    if(e.victim===me){this.alive=false;this.killedBy={killer:e.killer,w:e.w};this.deathTime=this.time;this.sounds.push({name:e.w==='lava'?'lava':'death'});}
    else if(e.killer===me){this.sounds.push({name:'frag'});this.note(`Фраг: ${this.nameOf(e.victim)}`);}
    else{const o=this.others.get(e.victim);if(o)o.alive=false;}
    return;
   case 'spawn':
    if(e.id===me){this.spawn(fromV3(e.p),e.yaw,e.life);return;}
    {const o=this.others.get(e.id);if(o){o.samples=[{t:this.time,pos:fromV3(e.p),yaw:e.yaw,pitch:0}];o.alive=true;}}
    return;
   case 'pick':{
    const spot=this.arena.items[e.item];if(!spot)return;
    if(e.id!==me){this.sounds.push({name:'pickup',pos:spot.pos});return;}
    this.sounds.push({name:spot.kind==='mega'?'mega':spot.kind==='shotgun'||spot.kind==='rocket'?'weapon':'pickup'});this.note(ITEM_TEXT[spot.kind]);
    const w=spot.kind==='shotgun'?1:spot.kind==='rocket'?2:0;
    if(w&&!this.owned[w]){this.owned[w]=true;this.ammo[w]=Math.max(this.ammo[w],w===1?10:8);this.weapon=w;}
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
  this.body=newBody(p);this.body.onGround=true;this.yaw=yaw;this.pitch=0;this.life=life;this.alive=true;this.weapon=0;this.killedBy=null;this.fell=false;
  this.pending=[];this.nextFire=this.time+.2;this.damageFlash=0;this.sounds.push({name:'spawn'});
 }
 private note(text:string){this.notes.unshift({text,age:0});this.notes.length=Math.min(this.notes.length,3);}

 look(dx:number,dy:number){this.yaw-=dx;this.pitch=Math.max(-1.5,Math.min(1.5,this.pitch-dy));}
 selectWeapon(w:WeaponId){if(this.owned[w]&&this.weapon!==w&&(w===0||this.ammo[w]>0)){this.weapon=w;this.sounds.push({name:'weapon'});}}
 cycleWeapon(step:number){for(let i=1;i<=3;i++){const w=((this.weapon+step*i)%3+3)%3 as WeaponId;if(this.owned[w]&&(w===0||this.ammo[w]>0)){this.selectWeapon(w);return;}}}

 update(dt:number,input:Input){
  this.time+=dt;this.decay(dt);
  const active=this.connected&&this.alive&&!this.fell&&this.phase!=='over';
  if(active){
   this.acc=Math.min(this.acc+dt,.25);
   while(this.acc>=TICK){
    this.acc-=TICK;
    const ev=stepBody(this.arena,this.body,{...input,yaw:this.yaw},TICK);
    if(ev.jumped)this.sounds.push({name:'jump'});if(ev.landed>9)this.sounds.push({name:'land'});if(ev.pad>=0)this.sounds.push({name:'pad'});
    if(ev.lava||ev.out){this.fell=true;break;}
   }
   if(input.fire)this.fire();
  }
  this.poseTimer+=dt;
  if(this.connected&&this.alive&&this.poseTimer>=POSE_INTERVAL){
   this.poseTimer=0;this.link.send({k:'pose',life:this.life,p:toV3(this.body.pos),v:toV3(this.body.vel),yaw:r2(this.yaw),pitch:r2(this.pitch),w:this.weapon});
  }
  this.pingTimer+=dt;if(this.connected&&this.pingTimer>=PING_INTERVAL){this.pingTimer=0;this.link.send({k:'ping',t:performance.now()});}
  this.stepRockets(dt);
 }

 private fire(){
  const w=WEAPONS[this.weapon];if(this.time<this.nextFire)return;
  if(this.weapon!==0&&this.ammo[this.weapon]<=0){this.nextFire=this.time+.4;this.sounds.push({name:'empty'});this.cycleWeapon(-1);return;}
  this.nextFire=this.time+w.interval;this.muzzle=.07;
  if(this.weapon!==0)this.ammo[this.weapon]--;
  const seq=++this.seq,seed=Math.floor(this.random()*4294967296)>>>0,origin=this.eye,dir=forwardOf(this.yaw,this.pitch);
  this.pending.push({seq,w:this.weapon});
  this.link.send({k:'fire',w:this.weapon,o:toV3(origin),d:[r2(dir.x*1000)/1000,r2(dir.y*1000)/1000,r2(dir.z*1000)/1000],seed,lag:r2(Math.min(LAG_COMPENSATION,this.rtt/2+INTERP)),seq});
  this.sounds.push({name:WEAPON_SOUND[this.weapon]});
  if(this.weapon===2){this.rockets.push({hostId:null,by:this.id,pos:{...origin},dir,own:true,dead:false,age:0});return;}
  for(const d of pelletDirections(dir,this.weapon,seed))this.addTracer(origin,d,this.id,true);
 }
 private addTracer(origin:Vec3,d:Vec3,by:string,own:boolean){
  let t=raycast(this.arena,origin,d,120).t,hitPlayer=false;
  for(const v of this.views()){if(v.id===by||!v.alive)continue;const hit=rayBox(origin,d,bodyBox(v.pos),t);if(hit<t){t=hit;hitPlayer=true;}}
  if(!own&&this.alive){const hit=rayBox(origin,d,bodyBox(this.body.pos),t);if(hit<t){t=hit;hitPlayer=true;}}
  const end=addScaled(origin,d,t);
  // Свой трассер рисуем от ствола справа внизу, иначе он виден точно с торца.
  const from=own?addScaled(addScaled(addScaled(origin,vec(Math.cos(this.yaw),0,-Math.sin(this.yaw)),.2),vec(0,1,0),-.17),d,.7):addScaled(origin,d,.6);
  this.tracers.push({from,to:end,color:this.colorOf(by),age:0,life:WEAPONS[0].interval*1.2});
  if(t<120)this.sparks.push({pos:end,age:0,color:hitPlayer?'#ff4a3a':'#ffd38a'});
 }
 private stepRockets(dt:number){
  for(const r of this.rockets){
   if(r.dead){r.age+=dt;continue;}
   r.age+=dt;const dist=ROCKET_SPEED*dt,limit=dist+ROCKET_RADIUS;let t=raycast(this.arena,r.pos,r.dir,limit).t;
   if(r.own)for(const v of this.views()){if(!v.alive)continue;const hit=rayBox(r.pos,r.dir,bodyBox(v.pos),t);if(hit<t)t=hit;}
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
  if(!this.alive)return;const box=bodyBox(this.body.pos),dist=length(sub(closestOnBox(box,at),at)),amount=splashDamage(dist);if(!amount)return;
  const center=vec(this.body.pos.x,this.body.pos.y+HEIGHT/2,this.body.pos.z),away=sub(center,at),l=length(away);
  const dir=l<.01?vec(0,1,0):vec(away.x/l,away.y/l,away.z/l),k=Math.min(amount,200)*KNOCKBACK;
  this.body.vel=addScaled(this.body.vel,dir,k);if(dir.y>0)this.body.onGround=false;
 }
 private blast(p:Vec3){this.blasts.push({pos:p,age:0});this.sounds.push({name:'boom',pos:p});}
 private decay(dt:number){
  for(const list of [this.tracers,this.blasts,this.sparks,this.feed,this.notes] as {age:number}[][])for(const x of list)x.age+=dt;
  this.tracers=this.tracers.filter(t=>t.age<t.life);this.blasts=this.blasts.filter(b=>b.age<.7);this.sparks=this.sparks.filter(s=>s.age<.25);
  this.feed=this.feed.filter(f=>f.age<6);this.notes=this.notes.filter(n=>n.age<2.5);
  this.hitFlash=Math.max(0,this.hitFlash-dt);this.damageFlash=Math.max(0,this.damageFlash-dt*1.6);this.muzzle=Math.max(0,this.muzzle-dt);
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
    yaw:a.yaw+dy*k,pitch:a.pitch+(b.pitch-a.pitch)*k,weapon:o.weapon,alive:o.alive,muzzle:o.muzzle});
  }
  return list;
 }
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
