import type {SceneDocument} from '@shelter/scene.ts';
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const TAU=Math.PI*2;
export type Vec={x:number;y:number};
export type Rect=Vec&{w:number;h:number;style:string;id:string};
export type Phase='title'|'playing'|'paused'|'upgrade'|'cleared'|'dead'|'won';
export type EnemyKind='runner'|'gunner'|'sniper'|'brute'|'boss';
export type Sound='rifle'|'shotgun'|'rail'|'hit'|'kill'|'hurt'|'dash'|'emp'|'reload'|'pickup'|'wave'|'clear'|'enemy'|'boss';
export interface Level {id:string;name:string;subtitle:string;theme:number;width:number;height:number;boss:string;next:string;spawn:Vec;gate:Vec;ports:Vec[];cover:Rect[];decor:Rect[]}
export interface Controls {x:number;y:number;aimX:number;aimY:number;fire:boolean;dash:boolean;emp:boolean;reload:boolean;interact:boolean;weapon:number}
export const noControls=():Controls=>({x:0,y:0,aimX:1000,aimY:0,fire:false,dash:false,emp:false,reload:false,interact:false,weapon:-1});
export interface Hero extends Vec {hp:number;shield:number;angle:number;stride:number;vx:number;vy:number;dash:number;dashCD:number;empCD:number;invincible:number;hurtTime:number;cooldown:number;reload:number;weapon:number;ammo:number[];kick:number}
export interface Enemy extends Vec {id:number;kind:EnemyKind;hp:number;maxHP:number;r:number;angle:number;cooldown:number;charge:number;locked:number;flash:number;birth:number;speed:number;stuck:number;side:number;attack:number}
export interface Bullet extends Vec {vx:number;vy:number;life:number;damage:number;enemy:boolean;r:number;pierce:number;hit:number[];weapon:number;px:number;py:number}
export interface Particle extends Vec {vx:number;vy:number;life:number;max:number;size:number;color:string;kind:'spark'|'smoke'|'ring'|'text';text?:string}
export interface Pickup extends Vec {kind:'health'|'shield';life:number}
export interface Hazard extends Vec {r:number;time:number;max:number;fired:boolean}
export interface Stats {seconds:number;kills:number;shots:number;hits:number;score:number;damage:number;deaths:number}
export type UpgradeId='damage'|'cadence'|'vitality'|'shield'|'mobility'|'pierce'|'repair'|'pulse';
export const UPGRADES:Record<UpgradeId,{title:string;label:string;description:string;icon:string}>={
 damage:{title:'Высокое напряжение',label:'УРОН +20%',description:'Все три оружия наносят больше урона.',icon:'⚡'},
 cadence:{title:'Разгон затвора',label:'ТЕМП +16%',description:'Быстрее стрельба и перезарядка.',icon:'»'},
 vitality:{title:'Запас прочности',label:'ЗДОРОВЬЕ +30',description:'Увеличивает максимум. Восстанавливает 60 здоровья.',icon:'+'},
 shield:{title:'Второй контур',label:'ЩИТ +25',description:'Больше щита. Полное восстановление прямо сейчас.',icon:'◇'},
 mobility:{title:'Лёгкое шасси',label:'СКОРОСТЬ +10%',description:'Движение быстрее. Рывок восстанавливается раньше.',icon:'↗'},
 pierce:{title:'Сквозной заряд',label:'ПРОБИТИЕ +1',description:'Каждый выстрел проходит через ещё одну цель.',icon:'→'},
 repair:{title:'Полевой ремонт',label:'+2 HP ЗА ЦЕЛЬ',description:'Уничтоженные машины восстанавливают здоровье.',icon:'✚'},
 pulse:{title:'Резонанс',label:'ИМПУЛЬС +40%',description:'ЭМИ мощнее и восстанавливается на 20% быстрее.',icon:'◎'},
};
export const WEAPONS=[
 {name:'ВЕКТОР',type:'Штурмовая винтовка',mag:30,reload:1.05,interval:.115,damage:19,speed:1250,pellets:1,spread:.035,pierce:0},
 {name:'РАЗЛОМ',type:'Импульсный дробовик',mag:7,reload:1.35,interval:.54,damage:15,speed:1050,pellets:7,spread:.29,pierce:0},
 {name:'ИГЛА',type:'Рельсовый карабин',mag:5,reload:1.55,interval:.64,damage:110,speed:1950,pellets:1,spread:0,pierce:2},
];
export interface Save {version:1;scene:string;difficulty:number;upgrades:UpgradeId[];stats:Stats;won:boolean}
const dist=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y);
export function readLevel(scene:SceneDocument):Level{
 const d=scene.moduleData?.perimeter as Record<string,unknown>|undefined;
 if(!d||![0,1,2].includes(Number(d.theme))||!Number.isFinite(d.width)||!Number.isFinite(d.height)||Number(d.width)<800||Number(d.height)<700||Number(d.width)>5000||Number(d.height)>5000)throw new Error('Периметр: некорректные размеры или тема сцены.');
 const things=scene.nodes.filter(n=>n.visible&&n.components?.some(c=>c.type.startsWith('perimeter.'))).map(n=>{const c=n.components!.find(c=>c.type.startsWith('perimeter.'))!;return {kind:c.type.slice(10),x:n.transform.position[0]*64,y:-n.transform.position[1]*64,w:n.transform.scale[0]*64,h:n.transform.scale[1]*64,id:n.id,style:String(c.values.style||'crate'),next:String(c.values.next||'')};});
 for(const k of ['spawn','gate'])if(things.filter(t=>t.kind===k).length!==1)throw new Error('Периметр: требуется одна точка '+k+'.');
 if(things.filter(t=>t.kind==='port').length<2)throw new Error('Периметр: нужны точки появления врагов.');
 if(things.some(t=>!['spawn','gate','port','cover','decoration'].includes(t.kind)))throw new Error('Периметр: неизвестный компонент.');
 const level:Level={id:scene.id!,name:scene.name,subtitle:String(d.subtitle),theme:Number(d.theme),width:Number(d.width),height:Number(d.height),boss:String(d.boss),next:things.find(t=>t.kind==='gate')!.next,spawn:things.find(t=>t.kind==='spawn')!,gate:things.find(t=>t.kind==='gate')!,ports:things.filter(t=>t.kind==='port'),cover:things.filter(t=>t.kind==='cover'),decor:things.filter(t=>t.kind==='decoration')};
 for(const t of [...level.cover,level.spawn,level.gate,...level.ports])if(t.x<50||t.y<50||t.x>level.width-50||t.y>level.height-50)throw new Error('Периметр: объект за границей сектора.');
 for(const point of [level.spawn,level.gate,...level.ports])if(level.cover.some(r=>point.x>r.x-r.w/2-32&&point.x<r.x+r.w/2+32&&point.y>r.y-r.h/2-32&&point.y<r.y+r.h/2+32))throw new Error('Периметр: точка появления или шлюз внутри укрытия.');
 return level;
}
export function segmentRect(ax:number,ay:number,bx:number,by:number,r:Rect,pad=0):number{
 let near=0,far=1;const dx=bx-ax,dy=by-ay;
 for(const [origin,delta,min,max] of [[ax,dx,r.x-r.w/2-pad,r.x+r.w/2+pad],[ay,dy,r.y-r.h/2-pad,r.y+r.h/2+pad]]){
  if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return Infinity;continue;}
  let a=(min-origin)/delta,b=(max-origin)/delta;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return Infinity;
 }return near;
}
export function segmentCircle(ax:number,ay:number,bx:number,by:number,c:Vec,r:number){const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;const t=clamp(((c.x-ax)*dx+(c.y-ay)*dy)/(len||1),0,1);return Math.hypot(ax+dx*t-c.x,ay+dy*t-c.y)<=r?t:Infinity;}
export class World{
 levels:Level[];level:Level;phase:Phase='title';hero!:Hero;enemies:Enemy[]=[];bullets:Bullet[]=[];particles:Particle[]=[];pickups:Pickup[]=[];hazards:Hazard[]=[];
 upgrades:UpgradeId[]=[];choices:UpgradeId[]=[];stats:Stats={seconds:0,kills:0,shots:0,hits:0,score:0,damage:0,deaths:0};difficulty=1;time=0;wave=0;waveClock=0;spawnClock=0;queue:EnemyKind[]=[];serial=0;seed=4177;shake=0;flash=0;banner='';bannerSub='';bannerTime=0;combo=0;comboTime=0;sectorKills=0;checkpoint!:Save;navClock=0;nav=new Map<string,number>();
 onSound:(s:Sound)=>void=()=>{};onSave:(s:Save)=>void=()=>{};onScene:()=>void=()=>{};
 constructor(scenes:SceneDocument[],start:string){this.levels=scenes.map(readLevel);this.level=this.levels.find(l=>l.id===start)||this.levels[0];this.spawnHero();this.checkpoint=this.save();}
 random(){this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0;return this.seed/4294967296;}
 count(id:UpgradeId){return this.upgrades.filter(u=>u===id).length;}
 get maxHP(){return 120+this.count('vitality')*30;}
 get maxShield(){return 40+this.count('shield')*25;}
 get speed(){return 255*(1+.1*this.count('mobility'));}
 get boss(){return this.enemies.find(e=>e.kind==='boss');}
 get multiplier(){return 1+Math.min(4,Math.floor(this.combo/5));}
 get remaining(){return this.enemies.length+this.queue.length;}
 spawnHero(){this.hero={...this.level.spawn,hp:this.maxHP,shield:this.maxShield,angle:-Math.PI/2,stride:0,vx:0,vy:0,dash:0,dashCD:0,empCD:0,invincible:1.5,hurtTime:0,cooldown:0,reload:0,weapon:0,ammo:WEAPONS.map(w=>w.mag),kick:0};}
 newGame(difficulty=1){this.difficulty=clamp(difficulty,0,2);this.level=this.levels[0];this.upgrades=[];this.stats={seconds:0,kills:0,shots:0,hits:0,score:0,damage:0,deaths:0};this.seed=4177;this.enter();}
 enter(){this.spawnHero();this.enemies=[];this.bullets=[];this.particles=[];this.pickups=[];this.hazards=[];this.queue=[];this.awaitingWave=false;this.wave=0;this.waveClock=2.8;this.spawnClock=0;this.combo=0;this.sectorKills=0;this.nav.clear();this.phase='playing';this.announce(this.level.name,this.level.subtitle,3.6);this.checkpoint=this.save();this.onSave(this.checkpoint);this.onScene();}
 announce(text:string,sub='',duration=3){this.banner=text;this.bannerSub=sub;this.bannerTime=duration;}
 save():Save{return {version:1,scene:this.level.id,difficulty:this.difficulty,upgrades:[...this.upgrades],stats:{...this.stats},won:this.phase==='won'};}
 validSave(raw:unknown):raw is Save{const p=raw as Save;return !!p&&p.version===1&&this.levels.some(l=>l.id===p.scene)&&[0,1,2].includes(p.difficulty)&&Array.isArray(p.upgrades)&&p.upgrades.length<=12&&p.upgrades.every(u=>u in UPGRADES)&&!!p.stats&&Object.keys(this.stats).every(k=>typeof p.stats[k as keyof Stats]==='number'&&Number.isFinite(p.stats[k as keyof Stats])&&p.stats[k as keyof Stats]>=0)&&typeof p.won==='boolean';}
 restore(raw:unknown){if(!this.validSave(raw))return false;this.level=this.levels.find(l=>l.id===raw.scene)!;this.upgrades=[...raw.upgrades];this.stats={...raw.stats};this.difficulty=raw.difficulty;this.enter();return true;}
 retry(){const deaths=this.stats.deaths+1;this.restore(this.checkpoint);this.stats.deaths=deaths;this.checkpoint=this.save();this.onSave(this.checkpoint);}
 nextSector(){if(this.phase!=='cleared')return false;const next=this.levels.find(l=>l.id===this.level.next);if(!next)return false;this.level=next;this.enter();return true;}
 choose(id:UpgradeId){if(this.phase!=='upgrade'||!this.choices.includes(id))return false;this.upgrades.push(id);if(id==='vitality')this.hero.hp=Math.min(this.maxHP,this.hero.hp+60);if(id==='shield')this.hero.shield=this.maxShield;this.phase='playing';this.awaitingWave=true;this.waveClock=2.1;this.choices=[];this.onSound('pickup');this.announce(UPGRADES[id].title,'Модификация установлена',2);return true;}
 pause(value:boolean){if(value&&['playing','cleared'].includes(this.phase)){this.beforePause=this.phase;this.phase='paused';}else if(!value&&this.phase==='paused')this.phase=this.beforePause;}
 beforePause:Phase='playing';
 burst(x:number,y:number,color:string,n=12,speed=180,kind:Particle['kind']='spark'){for(let i=0;i<n;i++){const a=this.random()*TAU,s=(.2+this.random()*.8)*speed,life=.2+this.random()*.5;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,size:2+this.random()*4,color,kind});}if(this.particles.length>650)this.particles.splice(0,this.particles.length-650);}
 ring(x:number,y:number,color:string,size:number){this.particles.push({x,y,vx:0,vy:0,life:.5,max:.5,size,color,kind:'ring'});}
 floating(x:number,y:number,text:string,color='#b6f5dc'){this.particles.push({x,y,vx:0,vy:-38,life:.85,max:.85,size:16,color,kind:'text',text});}
 move(v:Vec,dx:number,dy:number,r:number){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/12));for(let i=0;i<steps;i++){v.x=clamp(v.x+dx/steps,64+r,this.level.width-64-r);this.resolve(v,r,'x');v.y=clamp(v.y+dy/steps,64+r,this.level.height-64-r);this.resolve(v,r,'y');}}
 resolve(v:Vec,r:number,axis:'x'|'y'){for(const c of this.level.cover){const x=clamp(v.x,c.x-c.w/2,c.x+c.w/2),y=clamp(v.y,c.y-c.h/2,c.y+c.h/2),d=Math.hypot(v.x-x,v.y-y);if(d<r){if(d>.01){v.x+=(v.x-x)/d*(r-d);v.y+=(v.y-y)/d*(r-d);}else if(axis==='x')v.x=v.x<c.x?c.x-c.w/2-r:c.x+c.w/2+r;else v.y=v.y<c.y?c.y-c.h/2-r:c.y+c.h/2+r;}}}
 sight(a:Vec,b:Vec,pad=0){return !this.level.cover.some(r=>segmentRect(a.x,a.y,b.x,b.y,r,pad)!==Infinity);}
 buildNav(){const cell=64,w=Math.ceil(this.level.width/cell),h=Math.ceil(this.level.height/cell),sx=Math.floor(this.hero.x/cell),sy=Math.floor(this.hero.y/cell),queue:[[number,number]]|[number,number][]=[[sx,sy]];this.nav.clear();this.nav.set(sx+','+sy,0);for(let i=0;i<queue.length;i++){const [x,y]=queue[i],cost=this.nav.get(x+','+y)!;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<1||ny<1||nx>=w-1||ny>=h-1||this.nav.has(k))continue;const p={x:(nx+.5)*cell,y:(ny+.5)*cell};if(this.level.cover.some(r=>Math.abs(p.x-r.x)<r.w/2+24&&Math.abs(p.y-r.y)<r.h/2+24))continue;this.nav.set(k,cost+1);queue.push([nx,ny]);}}}
 direction(e:Enemy){let target:Vec=this.hero;if(!this.sight(e,this.hero,e.r+4)){const cx=Math.floor(e.x/64),cy=Math.floor(e.y/64);let best=Infinity;for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const cost=this.nav.get((cx+dx)+','+(cy+dy));const p={x:(cx+dx+.5)*64,y:(cy+dy+.5)*64};if(cost!==undefined&&cost<best&&this.sight(e,p,e.r)){best=cost;target=p;}}}const d=dist(e,target)||1;return {x:(target.x-e.x)/d,y:(target.y-e.y)/d};}
 startWave(){this.awaitingWave=false;this.waveClock=.85;this.wave++;const t=this.level.theme;this.onSound('wave');this.announce(this.wave===3?'Тяжёлая единица':`Волна 0${this.wave}`,this.wave===3?this.level.boss:'Зачисти сектор',2.4);if(this.wave===1)this.queue=['runner','runner','gunner','runner',...(t>0?['gunner','sniper'] as EnemyKind[]:['gunner'] as EnemyKind[])];else if(this.wave===2)this.queue=['gunner','runner','sniper','runner','brute','gunner','runner',...(t>0?['sniper','brute'] as EnemyKind[]:[])];else this.queue=['boss','gunner','runner',...(t>0?['sniper','runner'] as EnemyKind[]:[])];this.spawnClock=.3;}
 spawnEnemy(kind:EnemyKind){const ports=this.level.ports.filter(p=>dist(p,this.hero)>400);const p=kind==='boss'?this.level.ports[this.level.ports.length-1]:(ports.length?ports:this.level.ports)[Math.floor(this.random()*(ports.length||this.level.ports.length))];const t=this.level.theme,hp=({runner:44,gunner:72,sniper:65,brute:195,boss:1000+t*650}[kind])*(this.difficulty===2?1.12:1);const e:Enemy={id:++this.serial,kind,x:p.x,y:p.y,hp,maxHP:hp,r:kind==='boss'?48:kind==='brute'?27:19,angle:0,cooldown:1+this.random(),charge:0,locked:0,flash:0,birth:1,speed:{runner:175,gunner:107,sniper:85,brute:91,boss:66}[kind]*(1+t*.05),stuck:0,side:this.random()>.5?1:-1,attack:0};this.enemies.push(e);this.ring(p.x,p.y,'#ef805b',70);return e;}
 fire(){const h=this.hero,w=WEAPONS[h.weapon];if(h.reload>0||h.cooldown>0||h.dash>0)return;if(h.ammo[h.weapon]<=0){this.reload();return;}h.ammo[h.weapon]--;h.cooldown=w.interval/(1+this.count('cadence')*.16);h.kick=1;this.stats.shots++;this.onSound(['rifle','shotgun','rail'][h.weapon] as Sound);const x=h.x+Math.cos(h.angle)*30,y=h.y+Math.sin(h.angle)*30;for(let i=0;i<w.pellets;i++){const angle=h.angle+(w.pellets>1?(i/(w.pellets-1)-.5)*w.spread*2:(this.random()-.5)*w.spread),vx=Math.cos(angle)*w.speed,vy=Math.sin(angle)*w.speed;this.bullets.push({x,y,px:x,py:y,vx,vy,life:h.weapon===1?.55:1.2,damage:w.damage*(1+this.count('damage')*.2),enemy:false,r:h.weapon===2?5:3,pierce:w.pierce+this.count('pierce'),hit:[],weapon:h.weapon});}this.burst(x,y,'#f7d69a',4,90);this.shake=Math.max(this.shake,h.weapon===1?3:h.weapon===2?4:1.1);if(h.ammo[h.weapon]===0)this.reload();}
 reload(){const h=this.hero,w=WEAPONS[h.weapon];if(h.reload>0||h.ammo[h.weapon]>=w.mag)return;h.reload=w.reload/(1+this.count('cadence')*.12);this.onSound('reload');}
 enemyShot(e:Enemy,angle:number,speed=370,damage=12){const x=e.x+Math.cos(angle)*(e.r+8),y=e.y+Math.sin(angle)*(e.r+8);this.bullets.push({x,y,px:x,py:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:5,damage,enemy:true,r:e.kind==='boss'?7:5,pierce:0,hit:[],weapon:0});}
 hurt(damage:number){const h=this.hero;if(h.invincible>0||h.dash>0||!['playing','cleared'].includes(this.phase))return;damage*=this.difficulty===0?.6:this.difficulty===2?1.3:1;const absorbed=Math.min(h.shield,damage);h.shield-=absorbed;h.hp=Math.max(0,h.hp-damage+absorbed);h.invincible=.38;h.hurtTime=0;this.stats.damage+=damage;this.combo=0;this.flash=.23;this.shake=7;this.onSound('hurt');this.burst(h.x,h.y,'#f28d76',15);if(h.hp<=0){this.phase='dead';this.ring(h.x,h.y,'#ff967e',180);this.burst(h.x,h.y,'#9cebd7',50,330);}}
 damageEnemy(e:Enemy,damage:number){if(e.hp<=0||e.birth>0)return;e.hp-=damage;e.flash=.09;if(e.hp>0)return;this.stats.kills++;this.sectorKills++;this.combo++;this.comboTime=4;const points=({runner:100,gunner:150,sniper:200,brute:350,boss:2500}[e.kind])*this.multiplier;this.stats.score+=points;this.floating(e.x,e.y-30,'+'+points,e.kind==='boss'?'#f2cf83':'#aed9cc');this.burst(e.x,e.y,e.kind==='boss'?'#ffbd71':'#e1906b',e.kind==='boss'?65:20,e.kind==='boss'?380:180);this.ring(e.x,e.y,'#e99865',e.kind==='boss'?160:45);this.shake=Math.max(this.shake,e.kind==='boss'?15:2.5);this.onSound(e.kind==='boss'?'boss':'kill');this.hero.hp=Math.min(this.maxHP,this.hero.hp+this.count('repair')*2);if(e.kind==='boss'||this.sectorKills%5===0)this.pickups.push({x:e.x,y:e.y,kind:'health',life:35});else if(this.sectorKills%3===0)this.pickups.push({x:e.x,y:e.y,kind:'shield',life:25});}
 pulse(){const h=this.hero;if(h.empCD>0)return;h.empCD=8*Math.pow(.8,this.count('pulse'));this.onSound('emp');this.ring(h.x,h.y,'#a6ffed',255);this.burst(h.x,h.y,'#bfffee',42,360);this.shake=9;for(const e of this.enemies)if(dist(e,h)<255)this.damageEnemy(e,95*(1+.4*this.count('pulse')));this.bullets=this.bullets.filter(b=>!b.enemy||dist(b,h)>285);}
 finishWave(){this.bullets=[];this.hazards=[];this.hero.shield=this.maxShield;this.hero.hp=Math.min(this.maxHP,this.hero.hp+15);this.hero.ammo=WEAPONS.map(w=>w.mag);this.hero.reload=0;this.onSound('clear');if(this.wave<3){const options=(Object.keys(UPGRADES) as UpgradeId[]).filter(id=>this.count(id)<3);for(let i=options.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}this.choices=options.slice(0,3);this.phase='upgrade';}else if(this.level.next){this.phase='cleared';this.announce('Сектор очищен','Двигайся к северному шлюзу · E',5);}else{this.phase='won';this.stats.score+=Math.round(Math.max(0,1800-this.stats.seconds)*5)+this.hero.hp*10;this.onSave(this.save());this.announce('Сигнал прерван','Периметр снова молчит.',8);}}
 step(dt:number,input:Controls){
  if(!['playing','cleared'].includes(this.phase))return;dt=clamp(dt,0,1/30);this.time+=dt;this.stats.seconds+=dt;this.bannerTime=Math.max(0,this.bannerTime-dt);this.shake=Math.max(0,this.shake-dt*28);this.flash=Math.max(0,this.flash-dt);this.comboTime-=dt;if(this.comboTime<=0)this.combo=0;
  for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*2.5;p.vy*=1-dt*2.5;}this.particles=this.particles.filter(p=>p.life>0);
  const h=this.hero;h.invincible=Math.max(0,h.invincible-dt);h.hurtTime+=dt;h.cooldown=Math.max(0,h.cooldown-dt);h.dashCD=Math.max(0,h.dashCD-dt);h.empCD=Math.max(0,h.empCD-dt);h.kick=Math.max(0,h.kick-dt*12);
  if(h.hurtTime>4)h.shield=Math.min(this.maxShield,h.shield+dt*9);if(input.weapon>=0&&input.weapon<3&&input.weapon!==h.weapon){h.weapon=input.weapon;h.reload=0;h.cooldown=.13;this.onSound('reload');}
  if(h.reload>0){h.reload=Math.max(0,h.reload-dt);if(h.reload===0)h.ammo[h.weapon]=WEAPONS[h.weapon].mag;}
  if(input.reload)this.reload();h.angle=Math.atan2(input.aimY-h.y,input.aimX-h.x);
  const length=Math.hypot(input.x,input.y)||1,mx=input.x/length,my=input.y/length;
  if(input.dash&&h.dashCD<=0){h.dash=.19;h.dashCD=1.5*Math.pow(.85,this.count('mobility'));h.vx=(input.x||input.y?mx:Math.cos(h.angle))*880;h.vy=(input.x||input.y?my:Math.sin(h.angle))*880;this.onSound('dash');this.burst(h.x,h.y,'#a9f7e0',12,180);}
  if(h.dash>0){h.dash=Math.max(0,h.dash-dt);this.particles.push({x:h.x,y:h.y,vx:0,vy:0,life:.22,max:.22,size:16,color:'#8dd9cf',kind:'smoke'});}else{h.vx+=(mx*this.speed-h.vx)*Math.min(1,dt*20);h.vy+=(my*this.speed-h.vy)*Math.min(1,dt*20);}
  this.move(h,h.vx*dt,h.vy*dt,18);h.stride+=Math.hypot(h.vx,h.vy)*dt*.065;if(input.fire)this.fire();if(input.emp)this.pulse();
  this.navClock-=dt;if(this.navClock<=0){this.buildNav();this.navClock=.35;}
  if(this.phase==='playing'){
   if(!this.queue.length&&!this.enemies.length){this.waveClock-=dt;if(this.waveClock<=0){if(this.wave===0||this.awaitingWave)this.startWave();else this.finishWave();}}
   if(this.phase!=='playing')return;
   if(this.queue.length){this.spawnClock-=dt;if(this.spawnClock<=0){this.spawnEnemy(this.queue.shift()!);this.spawnClock=this.wave===3?1.4:.72;}}
  }
  for(const e of this.enemies){if(e.hp<=0)continue;e.birth=Math.max(0,e.birth-dt);e.flash=Math.max(0,e.flash-dt);if(e.birth>0)continue;e.cooldown-=dt;const distance=dist(e,h),los=this.sight(e,h),direction=this.direction(e);e.angle=Math.atan2(h.y-e.y,h.x-e.x);
   if(e.charge>0){e.charge-=dt;if(e.charge<=0){if(e.kind==='boss'){const phase=e.hp/e.maxHP<.45;const count=phase?20:14;for(let i=0;i<count;i++)this.enemyShot(e,i/count*TAU+e.attack*.31,phase?285:245,15);for(let i=-1;i<=1;i++)this.enemyShot(e,e.locked+i*.14,430,17);e.attack++;if(e.attack%2===0){for(let i=0;i<3;i++)this.hazards.push({x:clamp(h.x+(i-1)*140,100,this.level.width-100),y:clamp(h.y+(i===1?0:100),100,this.level.height-100),r:85,time:1.5,max:1.5,fired:false});}e.cooldown=phase?1.8:2.5;this.onSound('enemy');}else if(e.kind==='brute'){for(let i=-2;i<=2;i++)this.enemyShot(e,e.locked+i*.17,310,16);e.cooldown=2.2;this.onSound('enemy');}else{this.enemyShot(e,e.locked,e.kind==='sniper'?830:410,e.kind==='sniper'?23:13);e.cooldown=e.kind==='sniper'?2.3:1.55;this.onSound('enemy');}}}
   else if(e.kind!=='runner'&&e.cooldown<=0&&los&&distance<(e.kind==='sniper'?1100:e.kind==='boss'?1400:750)){e.charge=e.kind==='sniper'?1.1:e.kind==='boss'?1.2:.58;e.locked=e.angle;}
   let move=e.kind==='runner'||!los||distance>(e.kind==='sniper'?660:e.kind==='gunner'?430:e.kind==='boss'?420:280);let vx=direction.x*e.speed,vy=direction.y*e.speed;
   if(e.charge>0){move=false;}else if(los&&distance<240&&(e.kind==='gunner'||e.kind==='sniper')){move=true;vx=-direction.x*e.speed*.7;vy=-direction.y*e.speed*.7;}
   if(move){for(const other of this.enemies){if(other===e||other.hp<=0)continue;const d=dist(e,other);if(d<e.r+other.r+10&&d>.1){vx+=(e.x-other.x)/d*65;vy+=(e.y-other.y)/d*65;}}this.move(e,vx*dt,vy*dt,e.r);}
   if(distance<e.r+20){this.hurt(e.kind==='boss'?28:e.kind==='brute'?21:12);const dx=h.x-e.x,dy=h.y-e.y,d=Math.hypot(dx,dy)||1;this.move(h,dx/d*100*dt,dy/d*100*dt,18);}
  }
  for(const hazard of this.hazards){hazard.time-=dt;if(hazard.time<=0&&!hazard.fired){hazard.fired=true;this.ring(hazard.x,hazard.y,'#ffb66f',hazard.r);this.burst(hazard.x,hazard.y,'#ef9766',26,280);this.shake=5;if(dist(h,hazard)<hazard.r+15)this.hurt(28);}}this.hazards=this.hazards.filter(z=>z.time>-.4);
  for(const b of this.bullets){b.life-=dt;b.px=b.x;b.py=b.y;const nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;let wall=Infinity;for(const r of this.level.cover)wall=Math.min(wall,segmentRect(b.x,b.y,nx,ny,r,b.r));if(nx<64||nx>this.level.width-64||ny<64||ny>this.level.height-64)wall=Math.min(wall,1);
   if(b.enemy){const hit=segmentCircle(b.x,b.y,nx,ny,h,17+b.r);if(hit!==Infinity&&hit<wall&&h.dash<=0){this.hurt(b.damage);b.life=0;}}
   else{const hits=this.enemies.filter(e=>e.hp>0&&e.birth<=0&&!b.hit.includes(e.id)).map(e=>({e,t:segmentCircle(b.x,b.y,nx,ny,e,e.r+b.r)})).filter(v=>v.t!==Infinity&&v.t<wall).sort((a,b)=>a.t-b.t);for(const {e} of hits){b.hit.push(e.id);this.stats.hits++;this.damageEnemy(e,b.damage);this.burst(e.x,e.y,'#f5d69c',4,100);this.onSound('hit');if(b.pierce--<=0){b.life=0;break;}}}
   b.x=nx;b.y=ny;if(wall!==Infinity){b.x=b.px+(nx-b.px)*wall;b.y=b.py+(ny-b.py)*wall;b.life=0;this.burst(b.x,b.y,b.enemy?'#d88058':'#e4cfa0',3,70);}
  }
  this.bullets=this.bullets.filter(b=>b.life>0);this.enemies=this.enemies.filter(e=>e.hp>0);
  for(const p of this.pickups){p.life-=dt;const d=dist(p,h);if(d<120&&this.sight(p,h)){p.x+=(h.x-p.x)*dt*7;p.y+=(h.y-p.y)*dt*7;}if(d<28){if(p.kind==='health'){if(h.hp>=this.maxHP)continue;h.hp=Math.min(this.maxHP,h.hp+35);this.floating(h.x,h.y-30,'+35 HP');}else{if(h.shield>=this.maxShield)continue;h.shield=Math.min(this.maxShield,h.shield+28);this.floating(h.x,h.y-30,'+28 ЩИТ');}p.life=0;this.onSound('pickup');}}this.pickups=this.pickups.filter(p=>p.life>0);
  if(this.phase==='playing'&&!this.enemies.length&&!this.queue.length&&this.wave>0&&!this.awaitingWave&&this.waveClock>0)this.waveClock=Math.min(this.waveClock,.8);
  if(this.phase==='cleared'&&input.interact&&dist(h,this.level.gate)<145)this.nextSector();
 }
 awaitingWave=false;
}
