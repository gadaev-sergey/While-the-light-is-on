import type {SceneDocument} from '@shelter/scene.ts';

/** Коды клеток сетки. Стены 1–4 непроходимы, двери 5–7 открываются, 8 — лифт-выход. */
export const FLOOR=0,WALL=1,ICE=2,CONCRETE=3,WINDOW=4,DOOR=5,BLUE_DOOR=6,RED_DOOR=7,EXIT=8;
const LEGEND:Record<string,number>={'.':FLOOR,'#':WALL,'I':ICE,'C':CONCRETE,'W':WINDOW,'D':DOOR,'B':BLUE_DOOR,'R':RED_DOOR,'X':EXIT};
export type Theme='airlock'|'lab'|'core';
export type EnemyKind='crawler'|'drone'|'brute'|'boss';
export type ItemKind='health'|'medkit'|'armor'|'shells'|'cells'|'shotgun'|'rifle'|'blue'|'red';
export type Sound='pistol'|'shotgun'|'rifle'|'empty'|'alert'|'pain'|'death'|'bolt'|'claw'|'hurt'|'pickup'|'key'|'weapon'|'door'|'locked'|'exit'|'die'|'boss'|'summon';
export type Phase='title'|'playing'|'paused'|'dead'|'complete';
export type Loadout={hp:number;armor:number;shotgun:boolean;rifle:boolean;shells:number;cells:number};
export type Level={id:string;name:string;theme:Theme;next:string;w:number;h:number;tiles:Uint8Array;spawn:{x:number;y:number;angle:number};
 enemies:{kind:EnemyKind;x:number;y:number}[];items:{kind:ItemKind;x:number;y:number}[];loadout:Loadout};
export type Enemy={id:number;kind:EnemyKind;x:number;y:number;hp:number;max:number;state:'idle'|'chase'|'windup'|'dead';timer:number;cooldown:number;pain:number;anim:number;dead:number;seen:boolean;summon:number;strafe:number};
export type Item={id:number;kind:ItemKind;x:number;y:number;taken:boolean};
export type Shot={x:number;y:number;vx:number;vy:number;damage:number;life:number;kind:'bolt'|'shard'};
export type Effect={x:number;y:number;life:number;kind:'spark'|'frost'|'flash'};
export type Player={x:number;y:number;angle:number;hp:number;armor:number;weapon:number;owned:boolean[];shells:number;cells:number;keys:{blue:boolean;red:boolean};cooldown:number;bob:number;moving:number;kick:number};
export type Controls={forward:number;strafe:number;turn:number;fire:boolean;weapon:number};
export type Progress={unlocked:number;best:Record<string,{time:number;kills:number}>};
export type Result={level:string;time:number;kills:number;totalKills:number;items:number;totalItems:number;best:boolean;last:boolean};

export const WEAPONS=[
 {name:'ПМ-9',type:'Пистолет',ammo:'' as const,cooldown:.36,pellets:1,spread:.012,damage:[13,19],sound:'pistol' as Sound},
 {name:'Тайга',type:'Дробовик',ammo:'shells' as const,cooldown:.85,pellets:7,spread:.075,damage:[8,12],sound:'shotgun' as Sound},
 {name:'Аврора',type:'Импульсная винтовка',ammo:'cells' as const,cooldown:.1,pellets:1,spread:.022,damage:[15,21],sound:'rifle' as Sound},
];
export const ENEMIES:Record<EnemyKind,{name:string;hp:number;speed:number;radius:number;range:number;cooldown:number;damage:number;melee:boolean}>={
 crawler:{name:'Снежник',hp:30,speed:2.7,radius:.32,range:.95,cooldown:1,damage:9,melee:true},
 drone:{name:'Страж',hp:40,speed:1.7,radius:.3,range:9,cooldown:1.9,damage:8,melee:false},
 brute:{name:'Мерзлый',hp:150,speed:1.25,radius:.42,range:10,cooldown:2.6,damage:7,melee:false},
 boss:{name:'Хранитель льда',hp:1000,speed:1.05,radius:.7,range:16,cooldown:2.2,damage:9,melee:false},
};
export const ITEM_NAMES:Record<ItemKind,string>={health:'Ампула +15',medkit:'Аптечка +40',armor:'Бронежилет +50',shells:'Патроны дробовика +8',cells:'Энергоячейки +40',shotgun:'Дробовик «Тайга»',rifle:'Винтовка «Аврора»',blue:'Синяя карта',red:'Красная карта'};
const THEMES:Theme[]=['airlock','lab','core'];
const KINDS:EnemyKind[]=['crawler','drone','brute','boss'];
const ITEMS:ItemKind[]=['health','medkit','armor','shells','cells','shotgun','rifle','blue','red'];
export const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const NEIGHBORS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const fail=(m:string):never=>{throw new Error('Мерзлота: '+m);};

/** Читает уровень из сцены Shelter: сетка в moduleData, старт, враги и предметы — объекты сцены. */
export function readLevel(scene:SceneDocument):Level{
 const data=scene.moduleData?.merzlota as Record<string,unknown>|undefined;if(!data)return fail('в сцене нет данных уровня.');
 const theme=String(data.theme) as Theme;if(!THEMES.includes(theme))fail('неизвестное оформление уровня.');
 const rows=data.map;if(!Array.isArray(rows)||rows.length<5||rows.length>64||rows.some(r=>typeof r!=='string'))return fail('карта должна быть списком строк от 5 до 64.');
 const map=rows as string[],w=map[0].length,h=map.length;if(w<5||w>64||map.some(r=>r.length!==w))fail('все строки карты должны быть одной длины (5–64).');
 const tiles=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=map[y][x];if(!(c in LEGEND))fail(`неизвестный символ «${c}» в карте.`);const t=LEGEND[c];
  if((x===0||y===0||x===w-1||y===h-1)&&!(t>=WALL&&t<=WINDOW))fail('край карты должен быть сплошной стеной.');tiles[y*w+x]=t;}
 if(!tiles.includes(EXIT))fail('на карте нужен лифт-выход X.');
 const parts=(type:string)=>scene.nodes.filter(n=>n.visible).flatMap(n=>(n.components||[]).filter(c=>c.type===type).map(c=>({x:n.transform.position[0],y:n.transform.position[2],values:c.values})));
 const onFloor=(x:number,y:number,what:string)=>{const t=tiles[Math.floor(y)*w+Math.floor(x)];if(!(x>0&&y>0&&x<w&&y<h)||t!==FLOOR&&t!==EXIT)fail(`${what} стоит не на полу (${x}, ${y}).`);};
 const spawns=parts('merzlota.spawn');if(spawns.length!==1)fail('нужна ровно одна точка старта.');
 const s=spawns[0];onFloor(s.x,s.y,'точка старта');
 const enemies=parts('merzlota.enemy').map(e=>{const kind=String(e.values.kind) as EnemyKind;if(!KINDS.includes(kind))fail('неизвестный враг.');onFloor(e.x,e.y,ENEMIES[kind].name);return {kind,x:e.x,y:e.y};});
 const items=parts('merzlota.item').map(e=>{const kind=String(e.values.kind) as ItemKind;if(!ITEMS.includes(kind))fail('неизвестный предмет.');onFloor(e.x,e.y,ITEM_NAMES[kind]);return {kind,x:e.x,y:e.y};});
 const l=(data.loadout||{}) as Record<string,unknown>;
 const loadout:Loadout={hp:100,armor:0,shotgun:l.shotgun===true,rifle:l.rifle===true,shells:clamp(Number(l.shells)||0,0,99),cells:clamp(Number(l.cells)||0,0,300)};
 return {id:scene.id||scene.name,name:scene.name,theme,next:typeof data.next==='string'?data.next:'',w,h,tiles,spawn:{x:s.x,y:s.y,angle:(Number(s.values.angle)||0)*Math.PI/180},enemies,items,loadout};
}

/** Проходима ли уровень: от старта до выхода с учётом карт, которые лежат в доступных местах. */
export function solvable(level:Level){
 const keys={blue:false,red:false};
 for(let round=0;round<4;round++){
  const seen=bfs(level,keys);const at=(x:number,y:number)=>seen[Math.floor(y)*level.w+Math.floor(x)]>=0;
  for(const it of level.items)if((it.kind==='blue'||it.kind==='red')&&at(it.x,it.y))keys[it.kind]=true;
  for(let i=0;i<level.tiles.length;i++)if(level.tiles[i]===EXIT&&seen[i]>=0)return true;
 }
 return false;
}
function bfs(level:Level,keys:{blue:boolean;red:boolean}){
 const {w,tiles}=level,dist=new Int16Array(tiles.length).fill(-1),q=[Math.floor(level.spawn.y)*w+Math.floor(level.spawn.x)];dist[q[0]]=0;
 for(let i=0;i<q.length;i++){const c=q[i];for(const n of [c+1,c-1,c+w,c-w]){const t=tiles[n];if(dist[n]>=0)continue;
  if(t===FLOOR||t===EXIT||t===DOOR||t===BLUE_DOOR&&keys.blue||t===RED_DOOR&&keys.red){dist[n]=dist[c]+1;q.push(n);}}}
 return dist;
}

export class World {
 levels:Level[];level:Level;tiles=new Uint8Array(0);doors=new Map<number,number>();opening=new Set<number>();
 phase:Phase='title';player:Player=this.fresh();enemies:Enemy[]=[];items:Item[]=[];shots:Shot[]=[];effects:Effect[]=[];
 seconds=0;kills=0;taken=0;seen=new Uint8Array(0);flow=new Int16Array(0);flowFrom=-1;flowTimer=0;
 banner='';bannerTime=0;hint='';damage=0;pickupFlash=0;muzzle=0;shake=0;result:Result|null=null;progress:Progress={unlocked:1,best:{}};
 random:()=>number;onSound:(s:Sound)=>void=()=>{};onResult:(r:Result)=>void=()=>{};
 private start:Loadout;private id=0;private paused:Phase='playing';
 constructor(scenes:SceneDocument[],random:()=>number=Math.random){
  this.random=random;this.levels=scenes.map(readLevel);this.level=this.levels[0];this.start=this.level.loadout;this.load(this.level.id);
 }
 fresh():Player{return {x:2,y:2,angle:0,hp:100,armor:0,weapon:0,owned:[true,false,false],shells:0,cells:0,keys:{blue:false,red:false},cooldown:0,bob:0,moving:0,kick:0};}
 get boss(){return this.enemies.find(e=>e.kind==='boss'&&e.state!=='dead');}
 get totalKills(){return this.enemies.length;}
 get totalItems(){return this.items.length;}
 get levelIndex(){return this.levels.indexOf(this.level);}
 loadout():Loadout{const p=this.player;return {hp:p.hp,armor:p.armor,shotgun:p.owned[1],rifle:p.owned[2],shells:p.shells,cells:p.cells};}
 /** Готовит уровень. carry — снаряжение после прошлого уровня кампании. */
 load(id:string,carry?:Loadout){
  const level=this.levels.find(l=>l.id===id);if(!level)return fail('уровень не найден.');
  this.level=level;this.tiles=level.tiles.slice();this.doors.clear();this.opening.clear();this.seen=new Uint8Array(level.tiles.length);this.flow=new Int16Array(level.tiles.length);this.flowFrom=-1;
  const base=level.loadout,l=carry?{hp:Math.max(carry.hp,60),armor:carry.armor,shotgun:carry.shotgun||base.shotgun,rifle:carry.rifle||base.rifle,shells:Math.max(carry.shells,base.shells),cells:Math.max(carry.cells,base.cells)}:base;
  this.start=l;const p=this.player=this.fresh();
  Object.assign(p,{x:level.spawn.x,y:level.spawn.y,angle:level.spawn.angle,hp:l.hp,armor:l.armor,shells:l.shells,cells:l.cells,owned:[true,l.shotgun,l.rifle]});p.weapon=l.rifle&&l.cells>0?2:l.shotgun&&l.shells>0?1:0;
  this.enemies=level.enemies.map(e=>this.makeEnemy(e.kind,e.x,e.y));
  this.items=level.items.map(i=>({id:++this.id,kind:i.kind,x:i.x,y:i.y,taken:false}));
  this.shots=[];this.effects=[];this.seconds=0;this.kills=0;this.taken=0;this.result=null;this.damage=0;this.muzzle=0;this.hint='';this.bannerTime=0;
 }
 makeEnemy(kind:EnemyKind,x:number,y:number):Enemy{const d=ENEMIES[kind];return {id:++this.id,kind,x,y,hp:d.hp,max:d.hp,state:'idle',timer:0,cooldown:.5+this.random(),pain:0,anim:this.random()*4,dead:0,seen:false,summon:10,strafe:this.random()>.5?1:-1};}
 begin(id=this.level.id,carry?:Loadout){this.load(id,carry);this.phase='playing';this.announce(this.level.name,3);}
 restart(){const s=this.start;this.load(this.level.id);Object.assign(this.player,{hp:s.hp,armor:s.armor,shells:s.shells,cells:s.cells,owned:[true,s.shotgun,s.rifle]});this.start=s;this.phase='playing';this.announce(this.level.name,3);}
 pause(value:boolean){if(value&&this.phase==='playing'){this.paused=this.phase;this.phase='paused';}else if(!value&&this.phase==='paused')this.phase=this.paused;}
 announce(text:string,time=2.2){this.banner=text;this.bannerTime=time;}
 tile(x:number,y:number){const tx=Math.floor(x),ty=Math.floor(y);if(tx<0||ty<0||tx>=this.level.w||ty>=this.level.h)return WALL;return this.tiles[ty*this.level.w+tx];}
 doorOpen(i:number){return this.doors.get(i)||0;}
 /** Сплошная ли клетка для движения: стены и не до конца открытые двери. */
 solid(x:number,y:number){const t=this.tile(x,y);if(t>=WALL&&t<=WINDOW)return true;if(t>=DOOR&&t<=RED_DOOR)return this.doorOpen(Math.floor(y)*this.level.w+Math.floor(x))<.8;return false;}
 /** Расстояние до первой сплошной клетки по лучу (DDA). */
 cast(x:number,y:number,angle:number,max=40){
  const dx=Math.cos(angle),dy=Math.sin(angle);let mx=Math.floor(x),my=Math.floor(y);
  const ddx=Math.abs(1/(dx||1e-9)),ddy=Math.abs(1/(dy||1e-9)),sx=dx<0?-1:1,sy=dy<0?-1:1;
  let sdx=(dx<0?x-mx:mx+1-x)*ddx,sdy=(dy<0?y-my:my+1-y)*ddy,d=0;
  while(d<max){if(sdx<sdy){d=sdx;sdx+=ddx;mx+=sx;}else{d=sdy;sdy+=ddy;my+=sy;}if(this.solid(mx+.5,my+.5))return d;}
  return max;
 }
 sees(ax:number,ay:number,bx:number,by:number){const d=Math.hypot(bx-ax,by-ay);return this.cast(ax,ay,Math.atan2(by-ay,bx-ax),d+.01)>=d-.05;}

 step(dt:number,c:Controls){
  if(this.phase==='paused'||this.phase==='title')return;
  this.bannerTime=Math.max(0,this.bannerTime-dt);this.damage=Math.max(0,this.damage-dt*1.6);this.pickupFlash=Math.max(0,this.pickupFlash-dt*2.5);this.muzzle=Math.max(0,this.muzzle-dt);this.shake=Math.max(0,this.shake-dt*3);
  for(const e of this.effects)e.life-=dt;this.effects=this.effects.filter(e=>e.life>0);
  this.updateDoors(dt);
  if(this.phase==='playing'){this.seconds+=dt;this.move(dt,c);this.weapons(dt,c);this.pickups();}
  this.think(dt);this.fly(dt);
  if(this.phase==='playing')this.exit();
 }
 private move(dt:number,c:Controls){
  const p=this.player;p.angle+=c.turn*2.6*dt;
  let f=clamp(c.forward,-1,1),s=clamp(c.strafe,-1,1);const len=Math.hypot(f,s);if(len>1){f/=len;s/=len;}
  const speed=3.9,ca=Math.cos(p.angle),sa=Math.sin(p.angle),vx=(ca*f-sa*s)*speed*dt,vy=(sa*f+ca*s)*speed*dt;
  this.slide(p,vx,vy,.26);p.moving=Math.min(1,Math.hypot(vx,vy)/(speed*dt||1));p.bob+=dt*p.moving*9;p.kick=Math.max(0,p.kick-dt*6);
  // Клетки рядом с игроком отмечаются для карты.
  const tx=Math.floor(p.x),ty=Math.floor(p.y);for(let y=ty-1;y<=ty+1;y++)for(let x=tx-1;x<=tx+1;x++)if(x>=0&&y>=0&&x<this.level.w&&y<this.level.h)this.seen[y*this.level.w+x]=1;
 }
 /** Движение круга по сетке с раздельной проверкой осей — скольжение вдоль стен. */
 slide(o:{x:number;y:number},vx:number,vy:number,r:number){
  const free=(x:number,y:number)=>!this.solid(x-r,y-r)&&!this.solid(x+r,y-r)&&!this.solid(x-r,y+r)&&!this.solid(x+r,y+r);
  if(free(o.x+vx,o.y))o.x+=vx;if(free(o.x,o.y+vy))o.y+=vy;
 }
 private updateDoors(dt:number){
  const p=this.player,w=this.level.w;
  for(let i=0;i<this.tiles.length;i++){
   const t=this.tiles[i];if(t<DOOR||t>RED_DOOR||this.opening.has(i))continue;
   const x=i%w+.5,y=Math.floor(i/w)+.5,near=(ox:number,oy:number,r:number)=>Math.abs(ox-x)<r&&Math.abs(oy-y)<r;
   if(near(p.x,p.y,1.45)){
    if(t===DOOR||t===BLUE_DOOR&&p.keys.blue||t===RED_DOOR&&p.keys.red){this.opening.add(i);this.onSound('door');}
    else if(this.phase==='playing'&&this.hint===''){this.hint=t===BLUE_DOOR?'Нужна синяя карта доступа':'Нужна красная карта доступа';this.onSound('locked');}
   }else if(t===DOOR&&this.enemies.some(e=>e.state==='chase'&&near(e.x,e.y,1.3))){this.opening.add(i);this.onSound('door');}
  }
  for(const i of this.opening)this.doors.set(i,Math.min(1,this.doorOpen(i)+dt*1.6));
  if(this.hint&&!this.nearLocked())this.hint='';
 }
 private nearLocked(){const p=this.player,w=this.level.w;for(let y=Math.floor(p.y)-1;y<=Math.floor(p.y)+1;y++)for(let x=Math.floor(p.x)-1;x<=Math.floor(p.x)+1;x++){const i=y*w+x,t=this.tiles[i];if((t===BLUE_DOOR||t===RED_DOOR)&&!this.opening.has(i))return true;}return false;}
 private weapons(dt:number,c:Controls){
  const p=this.player;p.cooldown=Math.max(0,p.cooldown-dt);
  if(c.weapon>=0&&c.weapon<3&&p.owned[c.weapon]&&c.weapon!==p.weapon){p.weapon=c.weapon;p.cooldown=Math.max(p.cooldown,.25);}
  if(!c.fire||p.cooldown>0)return;
  const wp=WEAPONS[p.weapon];
  if(wp.ammo&&p[wp.ammo]<=0){this.onSound('empty');p.cooldown=.3;p.weapon=p.owned[2]&&p.cells>0?2:p.owned[1]&&p.shells>0?1:0;return;}
  if(wp.ammo)p[wp.ammo]--;
  p.cooldown=wp.cooldown;p.kick=1;this.muzzle=.07;this.onSound(wp.sound);
  for(let k=0;k<wp.pellets;k++)this.hitscan(p.angle+(this.random()*2-1)*wp.spread,wp.damage[0]+this.random()*(wp.damage[1]-wp.damage[0]));
  // Выстрел слышат враги поблизости, даже за углом.
  for(const e of this.enemies)if(e.state==='idle'&&Math.hypot(e.x-p.x,e.y-p.y)<9)this.wake(e);
 }
 /** Мгновенный выстрел: ближайший враг на луче до стены получает урон. */
 hitscan(angle:number,damage:number){
  const p=this.player,wall=this.cast(p.x,p.y,angle),ca=Math.cos(angle),sa=Math.sin(angle);let target:Enemy|undefined,best=wall;
  for(const e of this.enemies){if(e.state==='dead')continue;const dx=e.x-p.x,dy=e.y-p.y,along=dx*ca+dy*sa;if(along<=0||along>=best)continue;if(Math.abs(-dx*sa+dy*ca)<ENEMIES[e.kind].radius+.06){best=along;target=e;}}
  const hx=p.x+ca*(best-.08),hy=p.y+sa*(best-.08);
  this.effects.push({x:hx,y:hy,life:.25,kind:target?'frost':'spark'});
  if(target)this.hurtEnemy(target,damage);
  return target;
 }
 hurtEnemy(e:Enemy,damage:number){
  e.hp-=damage;this.wake(e);
  if(e.hp<=0){e.state='dead';e.dead=0;this.kills++;this.onSound('death');if(e.kind==='boss'){this.announce('ХРАНИТЕЛЬ ПАЛ · ЛИФТ ОТКРЫТ',4);this.enemies.forEach(o=>{if(o.state!=='dead'&&o.kind==='crawler'){o.hp=0;o.state='dead';this.kills++;}});}return;}
  if(e.kind!=='boss'&&this.random()<(e.kind==='brute'?.25:.6)){e.pain=.22;this.onSound('pain');}
 }
 wake(e:Enemy){if(e.state==='idle'){e.state='chase';e.cooldown=Math.max(e.cooldown,.4);this.onSound(e.kind==='boss'?'boss':'alert');}}
 hurt(damage:number){
  const p=this.player;if(this.phase!=='playing')return;const absorbed=Math.min(p.armor,damage*.5);p.armor-=absorbed;p.hp-=damage-absorbed;this.damage=Math.min(1,this.damage+.35+damage/40);this.shake=Math.min(1,this.shake+.4);this.onSound('hurt');
  if(p.hp<=0){p.hp=0;this.phase='dead';this.onSound('die');}
 }
 /** Поле расстояний от игрока: враги идут к соседней клетке с меньшим значением. */
 private updateFlow(){
  const p=this.player,w=this.level.w,from=Math.floor(p.y)*w+Math.floor(p.x);if(from===this.flowFrom&&this.flowTimer>0)return;
  this.flowFrom=from;this.flowTimer=.5;const d=this.flow.fill(-1),q=[from];d[from]=0;
  for(let i=0;i<q.length;i++){const c=q[i];if(d[c]>40)break;for(const n of [c+1,c-1,c+w,c-w]){if(d[n]>=0)continue;const t=this.tiles[n];if(t===FLOOR||t===EXIT||t===DOOR||(t===BLUE_DOOR||t===RED_DOOR)&&this.doorOpen(n)>.8){d[n]=d[c]+1;q.push(n);}}}
 }
 private think(dt:number){
  const p=this.player,alive=this.phase==='playing';this.flowTimer-=dt;this.updateFlow();const w=this.level.w;
  for(const e of this.enemies){
   const d=ENEMIES[e.kind];e.anim+=dt;
   if(e.state==='dead'){e.dead+=dt;continue;}
   if(e.pain>0){e.pain-=dt;continue;}
   const dx=p.x-e.x,dy=p.y-e.y,dist=Math.hypot(dx,dy);
   e.timer-=dt;if(e.timer<=0){e.timer=.2+this.random()*.1;e.seen=alive&&dist<16&&this.sees(e.x,e.y,p.x,p.y);}
   if(e.state==='idle'){if(e.seen&&dist<13)this.wake(e);continue;}
   e.cooldown-=dt;
   if(e.state==='windup'){if(e.cooldown<=-.35){this.attack(e,dist);e.state='chase';e.cooldown=d.cooldown*(.8+this.random()*.4);}continue;}
   if(!alive)continue;
   if(e.kind==='boss'){e.summon-=dt;if(e.summon<=0&&this.enemies.filter(o=>o.kind==='crawler'&&o.state!=='dead').length<5){e.summon=12;this.onSound('summon');for(const s of [-1,1]){const a=Math.atan2(dy,dx)+s*1.2,x=e.x+Math.cos(a)*1.4,y=e.y+Math.sin(a)*1.4;if(!this.solid(x,y)){const c=this.makeEnemy('crawler',x,y);c.state='chase';this.enemies.push(c);}}}}
   if(e.seen&&dist<d.range&&e.cooldown<=0){e.state='windup';e.cooldown=0;continue;}
   // Движение: напрямую при прямой видимости, иначе по полю расстояний.
   let tx=p.x,ty=p.y;
   if(!e.seen||dist>6){const c=Math.floor(e.y)*w+Math.floor(e.x);let best=this.flow[c]>=0?this.flow[c]:9999,next=-1;
    for(const [ox,oy] of NEIGHBORS){const n=c+ox+oy*w,v=this.flow[n];if(v<0||v>=best)continue;if(ox&&oy&&(this.flow[c+ox]<0||this.flow[c+oy*w]<0))continue;best=v;next=n;}
    if(next>=0){tx=next%w+.5;ty=Math.floor(next/w)+.5;}}
   let mx=tx-e.x,my=ty-e.y;const ml=Math.hypot(mx,my)||1;mx/=ml;my/=ml;
   // Стрелки держат дистанцию и кружат вокруг игрока.
   if(!d.melee&&e.seen&&dist<(e.kind==='boss'?5:3.6)){const ux=dx/dist,uy=dy/dist;mx=-uy*e.strafe-ux*.5;my=ux*e.strafe-uy*.5;const l2=Math.hypot(mx,my)||1;mx/=l2;my/=l2;if(this.random()<dt*.5)e.strafe*=-1;}
   if(d.melee&&dist<d.range*.8){mx=0;my=0;}
   const sp=d.speed*dt;this.slide(e,mx*sp,my*sp,Math.min(.4,d.radius));
   // Враги расталкивают друг друга, чтобы не слипаться в одну точку.
   for(const o of this.enemies){if(o===e||o.state==='dead')continue;const ox=e.x-o.x,oy=e.y-o.y,od=Math.hypot(ox,oy),min=d.radius+ENEMIES[o.kind].radius;if(od>0&&od<min){const push=(min-od)*.5;this.slide(e,ox/od*push,oy/od*push,Math.min(.4,d.radius));}}
  }
 }
 private attack(e:Enemy,dist:number){
  const p=this.player,d=ENEMIES[e.kind],a=Math.atan2(p.y-e.y,p.x-e.x);
  if(d.melee){if(dist<d.range+.25&&this.sees(e.x,e.y,p.x,p.y)){this.hurt(d.damage);this.onSound('claw');}return;}
  if(!this.sees(e.x,e.y,p.x,p.y))return;
  const fire=(angle:number,speed:number,kind:'bolt'|'shard')=>this.shots.push({x:e.x+Math.cos(angle)*(d.radius+.1),y:e.y+Math.sin(angle)*(d.radius+.1),vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,damage:d.damage,life:4,kind});
  this.onSound('bolt');
  if(e.kind==='drone')fire(a+(this.random()-.5)*.08,6.5,'bolt');
  if(e.kind==='brute')for(const s of [-.12,0,.12])fire(a+s,5.5,'shard');
  if(e.kind==='boss'){for(let i=-3;i<=3;i++)fire(a+i*.13,6,'shard');if(e.hp<e.max*.5)for(let i=0;i<12;i++)fire(a+i*Math.PI/6+.26,3.8,'shard');}
 }
 private fly(dt:number){
  const p=this.player;
  for(const s of this.shots){
   const steps=3;for(let k=0;k<steps&&s.life>0;k++){s.x+=s.vx*dt/steps;s.y+=s.vy*dt/steps;
    if(this.solid(s.x,s.y)){s.life=0;this.effects.push({x:s.x-s.vx*.02,y:s.y-s.vy*.02,life:.2,kind:'spark'});}
    else if(Math.hypot(s.x-p.x,s.y-p.y)<.32){s.life=0;this.hurt(s.damage);}}
   s.life-=dt;
  }
  this.shots=this.shots.filter(s=>s.life>0);
 }
 private pickups(){
  const p=this.player;
  for(const it of this.items){
   if(it.taken||Math.hypot(it.x-p.x,it.y-p.y)>.6)continue;
   const k=it.kind;let ok=true;
   if(k==='health'){if(p.hp>=100)ok=false;else p.hp=Math.min(100,p.hp+15);}
   else if(k==='medkit'){if(p.hp>=100)ok=false;else p.hp=Math.min(100,p.hp+40);}
   else if(k==='armor'){if(p.armor>=100)ok=false;else p.armor=Math.min(100,p.armor+50);}
   else if(k==='shells'){if(p.shells>=50)ok=false;else p.shells=Math.min(50,p.shells+8);}
   else if(k==='cells'){if(p.cells>=300)ok=false;else p.cells=Math.min(300,p.cells+40);}
   else if(k==='shotgun'){p.shells=Math.min(50,p.shells+10);if(!p.owned[1]){p.owned[1]=true;p.weapon=1;}}
   else if(k==='rifle'){p.cells=Math.min(300,p.cells+60);if(!p.owned[2]){p.owned[2]=true;p.weapon=2;}}
   else p.keys[k]=true;
   if(!ok)continue;
   it.taken=true;this.taken++;this.pickupFlash=1;this.announce(ITEM_NAMES[k],1.6);
   this.onSound(k==='blue'||k==='red'?'key':k==='shotgun'||k==='rifle'?'weapon':'pickup');
  }
 }
 private exit(){
  const p=this.player;if(this.tile(p.x,p.y)!==EXIT)return;
  if(this.boss){const lock='ЛИФТ ЗАБЛОКИРОВАН · ХРАНИТЕЛЬ ЖИВ';if(this.banner!==lock||this.bannerTime<.3)this.announce(lock,1.6);return;}
  this.phase='complete';this.onSound('exit');
  const id=this.level.id,best=this.progress.best[id],isBest=!best||this.seconds<best.time;
  if(isBest)this.progress.best[id]={time:this.seconds,kills:this.kills};
  const last=!this.level.next;if(!last)this.progress.unlocked=Math.max(this.progress.unlocked,Math.min(this.levels.length,this.levelIndex+2));
  this.result={level:id,time:this.seconds,kills:this.kills,totalKills:this.totalKills,items:this.taken,totalItems:this.totalItems,best:isBest,last};
  this.onResult(this.result);
 }
 restore(value:unknown){
  const v=value as Partial<Progress>|null;if(!v||typeof v!=='object')return;
  if(Number.isInteger(v.unlocked))this.progress.unlocked=clamp(Number(v.unlocked),1,this.levels.length);
  if(v.best&&typeof v.best==='object')for(const l of this.levels){const b=(v.best as Record<string,{time:number;kills:number}>)[l.id];if(b&&Number.isFinite(b.time)&&b.time>0&&Number.isInteger(b.kills)&&b.kills>=0)this.progress.best[l.id]={time:b.time,kills:b.kills};}
 }
}
