import {raycast,rayBox,closestOnBox,overlaps,vec,type Arena,type Vec3} from './arena.ts';
import {bodyBox,eyePoint,heightOf,hitboxes,rayHitboxes,type Hitbox,type Posture,type Stance} from './physics.ts';
import {WEAPONS,ITEMS,ROCKET,BLASTER,RIFLE,HEAD_MULTIPLIER,HEAT_PER_SHOT,HEAT_COOLING,usesMagazine,canReload,reloadMagazine,ROCKET_SPEED,ROCKET_RADIUS,SPLASH_RADIUS,SELF_DAMAGE,KNOCKBACK,MAX_HEALTH,RESPAWN_DELAY,INTERMISSION,LAG_COMPENSATION,PICKUP_RADIUS,PLAYER_COLORS,
 freshLoadout,applyItem,applyDamage,splashDamage,pelletOffsets,soleLeader,uniqueName,type Loadout,type WeaponId} from './rules.ts';
import {isV3,fromV3,toV3,r2,type GameEvent,type MatchPhase,type Pose,type Fire,type Reload,type Snapshot,type SessionOptions,type RosterEntry,type PlayerSnap} from './protocol.ts';

type Sample={t:number;x:number;y:number;z:number;crouch:boolean;lean:number;yaw:number};
export type HostPlayer=RosterEntry&{pos:Vec3;vel:Vec3;yaw:number;pitch:number;stance:Stance;lean:number;scoped:boolean;weapon:WeaponId;loadout:Loadout;alive:boolean;life:number;respawnAt:number;
 frags:number;deaths:number;lastFire:number[];heat:number;overheated:boolean;reloading:{w:WeaponId;until:number}|null;ack:number;history:Sample[];joined:number;lastPose:number};
type Rocket={id:number;by:string;pos:Vec3;dir:Vec3;born:number};
type Item={spot:Arena['items'][number];availableAt:number};

const HITBOX_PAD=.1;
const MAX_JUMP=8,MAX_SPEED=40;
const sub=(a:Vec3,b:Vec3)=>vec(a.x-b.x,a.y-b.y,a.z-b.z);
const len=(a:Vec3)=>Math.hypot(a.x,a.y,a.z);
const norm=(a:Vec3)=>{const l=len(a)||1;return vec(a.x/l,a.y/l,a.z/l);};
const cross=(a:Vec3,b:Vec3)=>vec(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const add=(a:Vec3,b:Vec3,k=1)=>vec(a.x+b.x*k,a.y+b.y*k,a.z+b.z*k);

/** Отклонения вокруг направления d: каждое [a, b] — сдвиг вправо и вверх в радианах. */
function around(d:Vec3,offsets:[number,number][]):Vec3[]{
 const dir=norm(d),helper=Math.abs(dir.y)>.95?vec(1,0,0):vec(0,1,0),right=norm(cross(dir,helper)),up=cross(right,dir);
 return offsets.map(([a,b])=>norm(add(add(dir,right,a),up,b)));
}
/**
 * Направления дроби вокруг основного луча — одинаково у хоста и у стрелка.
 * Одиночную пулю стрелок уже отклонил сам (разброс зависит от его стойки и прицеливания), поэтому она летит как прислана.
 */
export function pelletDirections(d:Vec3,w:WeaponId,seed:number):Vec3[]{
 const weapon=WEAPONS[w];if(weapon.pellets===1)return [norm(d)];
 return around(d,pelletOffsets(seed,weapon.pellets,weapon.spread));
}
/** Одиночная пуля с разбросом spread и отдачей [вверх, вправо]. */
export function aimedDirection(d:Vec3,spread:number,recoil:[number,number],seed:number):Vec3{
 const [[a,b]]=pelletOffsets(seed,1,spread);return around(d,[[a+recoil[1],b+recoil[0]]])[0];
}

/**
 * Авторитетная симуляция матча. Работает только у хоста: считает попадания, фраги,
 * бонусы и ракеты. Движение каждый игрок считает сам и присылает позой.
 */
export class HostGame{
 time=0;phase:MatchPhase='playing';matchStart=0;overAt=0;winner:string|null=null;
 players=new Map<string,HostPlayer>();items:Item[];rockets:Rocket[]=[];events:GameEvent[]=[];
 readonly arena:Arena;readonly options:SessionOptions;private random:()=>number;private nextRocket=1;
 constructor(arena:Arena,options:SessionOptions,random:()=>number=Math.random){
  this.arena=arena;this.options=options;this.random=random;this.items=arena.items.map(spot=>({spot,availableAt:0}));
 }
 roster():RosterEntry[]{return [...this.players.values()].map(({id,name,color})=>({id,name,color}));}

 join(id:string,name:string):HostPlayer|'full'{
  const known=this.players.get(id);if(known)return known;
  if(this.players.size>=this.options.maxPlayers)return 'full';
  const used=[...this.players.values()].map(p=>p.color),color=PLAYER_COLORS.find(c=>!used.includes(c))||PLAYER_COLORS[this.players.size%PLAYER_COLORS.length];
  const player:HostPlayer={id,name:uniqueName(name,[...this.players.values()].map(p=>p.name)),color,pos:vec(),vel:vec(),yaw:0,pitch:0,stance:0,lean:0,scoped:false,weapon:0,loadout:freshLoadout(),
   alive:false,life:0,respawnAt:this.time,frags:0,deaths:0,lastFire:[-9,-9,-9,-9,-9],heat:0,overheated:false,reloading:null,ack:0,history:[],joined:this.time,lastPose:this.time};
  this.players.set(id,player);return player;
 }
 leave(id:string){this.players.delete(id);this.rockets=this.rockets.filter(r=>r.by!==id);this.checkSuddenDeath();}

 pose(id:string,msg:Pose){
  const p=this.players.get(id);
  if(!p||!p.alive||msg.life!==p.life||!isV3(msg.p)||!isV3(msg.v)||!Number.isFinite(msg.yaw)||!Number.isFinite(msg.pitch))return;
  // Скачок больше, чем можно пробежать (с запасом) с прошлой позы, отбрасываем.
  const next=fromV3(msg.p);if(len(sub(next,p.pos))>MAX_JUMP+MAX_SPEED*(this.time-p.lastPose))return;
  p.pos=next;p.lastPose=this.time;p.vel=fromV3(msg.v);p.yaw=msg.yaw;p.pitch=Math.max(-1.55,Math.min(1.55,msg.pitch));
  p.stance=msg.s===1||msg.s===2?msg.s:0;p.lean=Number.isFinite(msg.l)?Math.max(-1,Math.min(1,msg.l!)):0;p.scoped=msg.a===1;
  if(msg.w in WEAPONS&&p.loadout.owned[msg.w])p.weapon=msg.w;
  if(p.reloading&&p.reloading.w!==p.weapon)p.reloading=null;
  const box=bodyBox(p.pos,0,heightOf(p.stance>0));
  if(overlaps(box,this.arena.lava))this.kill(p,p,'lava');
  else if(p.pos.y<this.arena.killY||Math.abs(p.pos.x)>this.arena.size||Math.abs(p.pos.z)>this.arena.size)this.kill(p,p,'fall');
 }

 fire(id:string,msg:Fire){
  const p=this.players.get(id);if(!p)return;
  if(Number.isFinite(msg.seq))p.ack=Math.max(p.ack,msg.seq);
  if(!p.alive||this.phase==='over'||!(msg.w in WEAPONS)||!isV3(msg.o)||!isV3(msg.d)||len(fromV3(msg.d))<.5)return;
  const w=WEAPONS[msg.w],l=p.loadout,magazine=usesMagazine(msg.w);
  if(!l.owned[msg.w]||(magazine?l.mag[msg.w]:l.ammo[msg.w])<=0)return;
  if(this.time-p.lastFire[msg.w]<w.interval*.75)return;
  if(magazine&&p.reloading?.w===msg.w)return;
  // Перегрев бластера хост проверяет с запасом: таймеры стрелка и хоста идут не секунда в секунду.
  if(msg.w===BLASTER){if(p.overheated)return;p.heat+=HEAT_PER_SHOT;if(p.heat>=1.15)p.overheated=true;}
  p.lastFire[msg.w]=this.time;if(magazine)l.mag[msg.w]--;else if(msg.w!==BLASTER)l.ammo[msg.w]--;
  // Точку выстрела присылает стрелок (он впереди хоста на свою задержку), но не дальше 2,5 м от глаз и не из-за стены.
  const eye=eyePoint(this.arena,this.posture(p));let origin=fromV3(msg.o);const gap=len(sub(origin,eye));
  if(gap>2.5||gap>.01&&raycast(this.arena,eye,norm(sub(origin,eye)),gap).t<gap)origin=eye;
  const dir=norm(fromV3(msg.d));
  if(msg.w===ROCKET){this.launchRocket(p,origin,dir);return;}
  const seed=Number.isFinite(msg.seed)?msg.seed>>>0:1,lag=Math.max(0,Math.min(LAG_COMPENSATION,Number(msg.lag)||0));
  this.events.push({e:'shot',by:id,w:msg.w,o:toV3(origin),d:toV3(dir),seed});
  const damage=new Map<HostPlayer,{amount:number;dir:Vec3;head:boolean}>(),past=new Map<HostPlayer,Hitbox[]>();
  for(const other of this.players.values())if(other!==p&&other.alive)past.set(other,this.hitboxes(this.rewind(other,this.time-lag)));
  for(const d of pelletDirections(dir,msg.w,seed)){
   const wall=raycast(this.arena,origin,d,120).t;let best=wall,target:HostPlayer|undefined;
   let head=false;
   for(const [other,boxes] of past){const hit=rayHitboxes(boxes,origin,d,best);if(hit.t<best){best=hit.t;target=other;head=hit.head;}}
   if(target){const hit=damage.get(target)||{amount:0,dir:d,head:false};hit.amount+=w.damage*(head?HEAD_MULTIPLIER:1);hit.head||=head;damage.set(target,hit);}
  }
  for(const [target,hit] of damage)this.hurt(target,p,hit.amount,hit.dir,origin,msg.w,hit.head);
 }

 reload(id:string,msg:Reload){
  const p=this.players.get(id);
  if(!p||!p.alive||!(msg.w in WEAPONS)||p.weapon!==msg.w||p.reloading||!canReload(p.loadout,msg.w))return;
  p.reloading={w:msg.w,until:this.time+WEAPONS[msg.w].reload};
  this.events.push({e:'reload',id,w:msg.w});
 }

 step(dt:number){
  this.time+=dt;
  for(const p of this.players.values()){
   if(!p.alive&&this.time>=p.respawnAt&&this.phase!=='over')this.respawn(p);
   if(p.alive&&p.loadout.health>MAX_HEALTH)p.loadout.health=Math.max(MAX_HEALTH,p.loadout.health-dt);
   p.heat=Math.max(0,p.heat-HEAT_COOLING*dt);if(p.overheated&&p.heat<=.1)p.overheated=false;
   if(p.reloading&&this.time>=p.reloading.until){reloadMagazine(p.loadout,p.reloading.w);p.reloading=null;}
   p.history.push({t:this.time,x:p.pos.x,y:p.pos.y,z:p.pos.z,crouch:p.stance>0,lean:p.lean,yaw:p.yaw});
   while(p.history.length&&p.history[0].t<this.time-1)p.history.shift();
  }
  this.stepRockets(dt);this.stepItems();
  if(this.phase==='playing'&&this.time-this.matchStart>=this.options.timeLimit){
   const leader=soleLeader([...this.players.values()]);
   if(leader)this.end(leader);else{this.phase='sudden';this.events.push({e:'match',phase:'sudden',winner:null});}
  }
  if(this.phase==='over'&&this.time-this.overAt>=INTERMISSION)this.newMatch();
 }

 snapshot():Snapshot{
  const left=this.phase==='playing'?Math.max(0,this.options.timeLimit-(this.time-this.matchStart)):0;
  const players=[...this.players.values()].map(p=>{const l=p.loadout;
   return [p.id,r2(p.pos.x),r2(p.pos.y),r2(p.pos.z),r2(p.yaw),r2(p.pitch),p.weapon,Math.ceil(l.health),Math.ceil(l.armor),p.alive?1:0,p.frags,p.deaths,
    [l.ammo[1],l.ammo[2],l.ammo[3],l.ammo[4]],[l.mag[2],l.mag[3]],l.owned.reduce((m,o,i)=>o?m|1<<i:m,0),p.ack,p.life,p.stance,r2(p.lean),p.scoped&&p.weapon===RIFLE?1:0] as PlayerSnap;});
  return {k:'snap',t:r2(this.time),phase:this.phase,left:r2(left),winner:this.winner,restart:this.phase==='over'?r2(Math.max(0,INTERMISSION-(this.time-this.overAt))):0,
   items:this.items.map(i=>i.availableAt<=this.time?'1':'0').join(''),players};
 }
 drain(){const list=this.events;this.events=[];return list;}

 posture(p:HostPlayer):Posture{return {pos:p.pos,crouch:p.stance>0,lean:p.lean,yaw:p.yaw};}
 /** Поза игрока t секунд назад по истории — для компенсации задержки. */
 rewind(p:HostPlayer,t:number):Posture{
  const h=p.history,at=(s:Sample):Posture=>({pos:vec(s.x,s.y,s.z),crouch:s.crouch,lean:s.lean,yaw:s.yaw});
  if(!h.length||t>=h[h.length-1].t)return this.posture(p);
  if(t<=h[0].t)return at(h[0]);
  let i=h.length-1;while(i>0&&h[i-1].t>t)i--;
  const a=h[i-1],b=h[i],k=(t-a.t)/((b.t-a.t)||1);
  return {pos:vec(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k,a.z+(b.z-a.z)*k),crouch:k<.5?a.crouch:b.crouch,lean:a.lean+(b.lean-a.lean)*k,yaw:k<.5?a.yaw:b.yaw};
 }
 hitboxes(p:Posture):Hitbox[]{return hitboxes(this.arena,p,HITBOX_PAD);}

 private launchRocket(p:HostPlayer,origin:Vec3,dir:Vec3){
  const id=this.nextRocket++;this.rockets.push({id,by:p.id,pos:{...origin},dir,born:this.time});
  this.events.push({e:'rocket',id,by:p.id,o:toV3(origin),d:toV3(dir)});
 }
 private stepRockets(dt:number){
  for(const r of [...this.rockets]){
   const dist=ROCKET_SPEED*dt,limit=dist+ROCKET_RADIUS;let best=raycast(this.arena,r.pos,r.dir,limit).t,direct:HostPlayer|undefined;
   for(const p of this.players.values()){
    if(!p.alive||p.id===r.by)continue;
    for(const {box:b} of this.hitboxes(this.posture(p))){
     const t=rayBox(r.pos,r.dir,{min:add(b.min,vec(-ROCKET_RADIUS,-ROCKET_RADIUS,-ROCKET_RADIUS)),max:add(b.max,vec(ROCKET_RADIUS,ROCKET_RADIUS,ROCKET_RADIUS))},best);
     if(t<best){best=t;direct=p;}
    }
   }
   if(best<limit){this.explode(r,add(r.pos,r.dir,Math.max(0,best-ROCKET_RADIUS-.05)),direct);continue;}
   r.pos=add(r.pos,r.dir,dist);
   if(this.time-r.born>10)this.rockets=this.rockets.filter(x=>x!==r);
  }
 }
 private explode(r:Rocket,at:Vec3,direct?:HostPlayer){
  this.rockets=this.rockets.filter(x=>x!==r);
  this.events.push({e:'boom',id:r.id,p:toV3(at),by:r.by});
  const owner=this.players.get(r.by);if(!owner)return;
  if(direct)this.hurt(direct,owner,WEAPONS[ROCKET].damage,r.dir,at,ROCKET);
  for(const p of [...this.players.values()]){
   if(!p.alive||p===direct)continue;
   const height=heightOf(p.stance>0),box=bodyBox(p.pos,0,height),dist=len(sub(closestOnBox(box,at),at)),amount=splashDamage(dist);if(!amount)continue;
   const center=vec(p.pos.x,p.pos.y+height/2,p.pos.z),away=sub(center,at);
   this.hurt(p,owner,amount,len(away)<.01?vec(0,1,0):norm(away),at,ROCKET);
  }
 }
 private hurt(target:HostPlayer,attacker:HostPlayer,amount:number,dir:Vec3,from:Vec3,w:WeaponId,head=false){
  if(!target.alive||this.phase==='over')return;
  const knock=add(vec(),dir,Math.min(amount,200)*KNOCKBACK);
  const dealt=target===attacker?Math.round(amount*SELF_DAMAGE):amount;
  applyDamage(target.loadout,dealt);target.vel=add(target.vel,knock);
  this.events.push({e:'hurt',to:target.id,by:attacker.id,amount:dealt,knock:toV3(knock),from:toV3(from)});
  if(target!==attacker)this.events.push(head?{e:'hit',by:attacker.id,to:target.id,amount:dealt,head:1}:{e:'hit',by:attacker.id,to:target.id,amount:dealt});
  if(target.loadout.health<=0)this.kill(target,attacker,w,head);
 }
 private kill(victim:HostPlayer,killer:HostPlayer,w:WeaponId|'lava'|'fall',head=false){
  if(!victim.alive||this.phase==='over')return;
  victim.alive=false;victim.deaths++;victim.respawnAt=this.time+RESPAWN_DELAY;victim.loadout.health=Math.min(victim.loadout.health,0);
  if(victim===killer)victim.frags--;else killer.frags++;
  this.events.push(head?{e:'kill',killer:killer.id,victim:victim.id,w,head:1}:{e:'kill',killer:killer.id,victim:victim.id,w});
  if(this.phase==='playing'&&victim!==killer&&killer.frags>=this.options.fragLimit)this.end(killer.id);
  else this.checkSuddenDeath();
 }
 private checkSuddenDeath(){if(this.phase!=='sudden')return;const leader=soleLeader([...this.players.values()]);if(leader)this.end(leader);}
 private end(winner:string){
  this.phase='over';this.winner=winner;this.overAt=this.time;this.rockets=[];
  this.events.push({e:'match',phase:'over',winner});
 }
 private newMatch(){
  this.phase='playing';this.winner=null;this.matchStart=this.time;this.rockets=[];
  for(const item of this.items)item.availableAt=0;
  for(const p of this.players.values()){p.frags=0;p.deaths=0;p.alive=false;this.respawn(p);}
  this.events.push({e:'match',phase:'playing',winner:null});
 }
 /** Точка появления подальше от живых соперников; среди трёх лучших — случайная. */
 private respawn(p:HostPlayer){
  const enemies=[...this.players.values()].filter(o=>o!==p&&o.alive);
  const ranked=this.arena.spawns.map(s=>({s,d:enemies.length?Math.min(...enemies.map(e=>len(sub(e.pos,s.pos)))):this.random()*100})).sort((a,b)=>b.d-a.d);
  const pick=ranked[Math.floor(this.random()*Math.min(3,ranked.length))].s;
  p.pos={...pick.pos};p.lastPose=this.time;p.vel=vec();p.yaw=pick.yaw;p.pitch=0;p.stance=0;p.lean=0;p.scoped=false;p.weapon=0;p.loadout=freshLoadout();p.alive=true;p.life++;p.history=[];p.lastFire=[-9,-9,-9,-9,-9];p.heat=0;p.overheated=false;p.reloading=null;
  this.events.push({e:'spawn',id:p.id,p:toV3(p.pos),yaw:r2(pick.yaw),life:p.life});
 }
 private stepItems(){
  for(const item of this.items){
   if(item.availableAt>this.time)continue;
   for(const p of this.players.values()){
    if(!p.alive)continue;const dx=p.pos.x-item.spot.pos.x,dz=p.pos.z-item.spot.pos.z,dy=p.pos.y-item.spot.pos.y;
    if(Math.hypot(dx,dz)>PICKUP_RADIUS||dy<-1.2||dy>1.5)continue;
    if(!applyItem(p.loadout,item.spot.kind))continue;
    item.availableAt=this.time+ITEMS[item.spot.kind].respawn;
    this.events.push({e:'pick',id:p.id,item:this.items.indexOf(item)});break;
   }
  }
 }
}
