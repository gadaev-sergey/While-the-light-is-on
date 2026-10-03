import type {SceneDocument} from '@shelter/scene.ts';
export type Vec={x:number;z:number};
export type Cover=Vec&{w:number;d:number;h:number;style:string};
export type Level={size:number;spawn:Vec;cover:Cover[];portals:Vec[]};
export type EnemyKind='imp'|'hound'|'caster'|'brute'|'titan';
export type Enemy=Vec&{id:number;kind:EnemyKind;hp:number;maxHP:number;radius:number;speed:number;attack:number;flash:number;age:number};
export type Bullet=Vec&{id:number;vx:number;vz:number;life:number;damage:number};
export type Pickup=Vec&{id:number;kind:'health'|'ammo'|'armor';life:number};
export type Particle=Vec&{id:number;y:number;vx:number;vy:number;vz:number;life:number;color:number};
export type Controls={forward:number;strafe:number;turn:number;fire:boolean;dash:boolean;weapon:number};
export type Upgrade='power'|'vitality'|'haste'|'leech'|'supply'|'dash';
export const UPGRADES:Record<Upgrade,{name:string;detail:string;icon:string}>={
 power:{name:'Раскалённый ствол',detail:'+22% к урону всего оружия.',icon:'↗'},
 vitality:{name:'Кровь титана',detail:'+25 к максимуму здоровья. Полное лечение.',icon:'✚'},
 haste:{name:'Бешеный темп',detail:'+15% к скорострельности. +5% к скорости.',icon:'»'},
 leech:{name:'Пожиратель душ',detail:'+2 здоровья за каждое убийство.',icon:'◇'},
 supply:{name:'Военный резерв',detail:'+35 брони, +24 патрона дробовика, +100 пулемёта.',icon:'▦'},
 dash:{name:'Призрачный шаг',detail:'Рывок восстанавливается на 20% быстрее. +20 брони.',icon:'ϟ'}
};
export const WEAPONS=[{name:'ИСКРА',type:'Пистолет',interval:.26,damage:29,spread:.012,pellets:1,range:65},{name:'ПАЛАЧ',type:'Дробовик',interval:.78,damage:24,spread:.115,pellets:8,range:30},{name:'МОЛОХ',type:'Пулемёт',interval:.082,damage:20,spread:.035,pellets:1,range:60}];
export function readLevel(scene:SceneDocument):Level{
 const data=scene.moduleData?.hellrift as {size?:number;spawn?:number[]}|undefined;
 if(!data||data.size!==46||!Array.isArray(data.spawn)||data.spawn.length!==2||!data.spawn.every(Number.isFinite))throw new Error('Разлом: некорректная арена.');
 const cover=scene.nodes.filter(n=>n.components?.some(c=>c.type==='hellrift.cover')).map(n=>({x:n.transform.position[0],z:n.transform.position[2],w:n.transform.scale[0],d:n.transform.scale[2],h:n.transform.scale[1],style:String(n.components!.find(c=>c.type==='hellrift.cover')!.values.style)}));
 const portals=scene.nodes.filter(n=>n.components?.some(c=>c.type==='hellrift.portal')).map(n=>({x:n.transform.position[0],z:n.transform.position[2]}));
 if(portals.length!==4||cover.some(c=>c.w<=0||c.d<=0||c.h<=0))throw new Error('Разлом: проверьте укрытия и четыре портала.');
 return {size:data.size,spawn:{x:data.spawn[0],z:data.spawn[1]},cover,portals};
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function difficulty(seconds:number){const t=Math.max(0,seconds);return {tier:1+Math.floor(t/30),interval:Math.max(.16,1.9/(1+t/52)),cap:Math.min(78,9+Math.floor(t/6)),health:1+t/160,damage:1+t/210,speed:1+Math.min(.7,t/500)};}
export function rayBox(x:number,z:number,dx:number,dz:number,c:Cover):number{
 let lo=-Infinity,hi=Infinity;
 for(const [p,d,min,max] of [[x,dx,c.x-c.w/2,c.x+c.w/2],[z,dz,c.z-c.d/2,c.z+c.d/2]]){
  if(Math.abs(d)<1e-8){if(p<min||p>max)return Infinity;continue;}
  const a=(min-p)/d,b=(max-p)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
 }
 return hi>=Math.max(0,lo)?Math.max(0,lo):Infinity;
}
export class World{
 level:Level;random:()=>number;phase:'title'|'playing'|'paused'|'upgrade'|'dead'='title';
 player={x:0,z:14,yaw:0,hp:100,armor:40,weapon:1,ammo:[Infinity,28,140],cooldown:0,dashCD:0,dashTime:0};
 enemies:Enemy[]=[];bullets:Bullet[]=[];pickups:Pickup[]=[];particles:Particle[]=[];
 seconds=0;kills=0;score=0;maxHP=100;power=1;rate=1;speed=1;leech=0;dashRecovery=3.6;
 choices:Upgrade[]=[];nextUpgrade=45;nextBoss=90;nextSupply=16;spawnTimer=1;uid=1;damageFlash=0;shotFlash=0;hitFlash=0;killFlash=0;banner='';bannerTime=0;shake=0;shotCount=0;unlocked=false;
 onSound:(name:string)=>void=()=>{};
 constructor(level:Level,random:()=>number=Math.random){this.level=level;this.random=random;this.player.x=level.spawn.x;this.player.z=level.spawn.z;}
 start(){this.phase='playing';Object.assign(this.player,{...this.level.spawn,yaw:0,hp:100,armor:40,weapon:1,ammo:[Infinity,28,140],cooldown:0,dashCD:0,dashTime:0});this.enemies=[];this.bullets=[];this.pickups=[];this.particles=[];this.seconds=this.kills=this.score=this.damageFlash=this.shotFlash=this.hitFlash=this.killFlash=this.shake=this.shotCount=0;this.maxHP=100;this.power=this.rate=this.speed=1;this.leech=0;this.dashRecovery=3.6;this.nextUpgrade=45;this.nextBoss=90;this.nextSupply=16;this.spawnTimer=2;this.unlocked=false;this.choices=[];this.announce('ПРОДЕРЖИСЬ КАК МОЖНО ДОЛЬШЕ');for(let i=0;i<4;i++)this.spawn('imp',this.level.portals[i]);for(const p of [{x:-17,z:12},{x:17,z:-12}])this.pickups.push({...p,id:this.uid++,kind:'ammo',life:120});this.pickups.push({x:0,z:0,id:this.uid++,kind:'armor',life:120});}
 announce(message:string){this.banner=message;this.bannerTime=3.5;}
 pause(value:boolean){if(value&&this.phase==='playing')this.phase='paused';else if(!value&&this.phase==='paused')this.phase='playing';}
 blocked(x:number,z:number,r:number){const half=this.level.size/2-1;if(Math.abs(x)>half-r||Math.abs(z)>half-r)return true;return this.level.cover.some(c=>{const a=clamp(x,c.x-c.w/2,c.x+c.w/2),b=clamp(z,c.z-c.d/2,c.z+c.d/2);return (x-a)**2+(z-b)**2<r*r;});}
 move(p:Vec,dx:number,dz:number,r:number){if(!this.blocked(p.x+dx,p.z,r))p.x+=dx;if(!this.blocked(p.x,p.z+dz,r))p.z+=dz;}
 wallDistance(x:number,z:number,dx:number,dz:number){let dist=Infinity;for(const c of this.level.cover)dist=Math.min(dist,rayBox(x,z,dx,dz,c));return dist;}
 sight(a:Vec,b:Vec){const d=Math.hypot(a.x-b.x,a.z-b.z);return d<.001||this.wallDistance(a.x,a.z,(b.x-a.x)/d,(b.z-a.z)/d)>d;}
 spawn(kind?:EnemyKind,at?:Vec){const d=difficulty(this.seconds),roll=this.random();kind??=(this.seconds>75&&roll<.16?'brute':this.seconds>28&&roll<.38?'caster':this.seconds>13&&roll<.64?'hound':'imp');const portals=this.level.portals.filter(p=>Math.hypot(p.x-this.player.x,p.z-this.player.z)>9);const available=portals.length?portals:this.level.portals;const p=at||available[Math.floor(this.random()*available.length)];
  const stats={imp:[62,2.4,.48],hound:[42,4.3,.4],caster:[78,1.9,.5],brute:[260,1.55,.82],titan:[1100,1.4,1.15]}[kind];let x=p.x+(this.random()-.5)*2,z=p.z+(this.random()-.5)*2;if(this.blocked(x,z,stats[2])){x=p.x;z=p.z;}
  // Keep rendering and collision budgets bounded even if every titan is left alive.
  if(this.enemies.length>=80){const candidates=this.enemies.filter(e=>e.kind!=='titan');const pool=candidates.length?candidates:this.enemies;const farthest=pool.reduce((a,b)=>Math.hypot(a.x-this.player.x,a.z-this.player.z)>Math.hypot(b.x-this.player.x,b.z-this.player.z)?a:b);this.enemies=this.enemies.filter(e=>e!==farthest);}
  const e:Enemy={id:this.uid++,x,z,kind,hp:stats[0]*d.health,maxHP:stats[0]*d.health,speed:stats[1]*d.speed,radius:stats[2],attack:1.2+this.random(),flash:0,age:0};this.enemies.push(e);return e;
 }
 hurt(amount:number){if(this.phase!=='playing'||this.player.dashTime>0)return;const p=this.player,absorbed=Math.min(p.armor,amount*.65);p.armor-=absorbed;p.hp=Math.max(0,p.hp-amount+absorbed);this.damageFlash=.5;this.shake=.11;this.onSound('hurt');if(p.hp<=0){this.phase='dead';this.onSound('dead');}}
 hit(e:Enemy,damage:number){if(e.hp<=0)return;e.hp-=damage;e.flash=.12;this.hitFlash=.12;this.burst(e.x,.95,e.z,0xf75136,3);if(e.hp<=0){this.kills++;this.score+=e.kind==='titan'?1500:e.kind==='brute'?250:e.kind==='caster'?120:75;this.killFlash=.18;this.player.hp=Math.min(this.maxHP,this.player.hp+this.leech);this.burst(e.x,1,e.z,e.kind==='caster'?0x8bffad:0xfe6334,9);this.onSound('kill');if(this.kills%3===0||e.kind==='titan')this.pickups.push({id:this.uid++,x:e.x,z:e.z,kind:e.kind==='titan'?'health':this.random()<.42?'health':'ammo',life:28});if(e.kind==='titan'){this.pickups.push({id:this.uid++,x:e.x+1,z:e.z,kind:'armor',life:35});this.announce('ТИТАН ПАЛ. РАЗЛОМ ВСЁ ЕЩЁ ОТКРЫТ.');}}}
 burst(x:number,y:number,z:number,color:number,count:number){for(let i=0;i<count;i++)this.particles.push({id:this.uid++,x,y,z,vx:(this.random()-.5)*6,vy:this.random()*4,vz:(this.random()-.5)*6,life:.25+this.random()*.35,color});if(this.particles.length>160)this.particles.splice(0,this.particles.length-160);}
 fire(){const p=this.player;if(p.cooldown>0)return;const gun=WEAPONS[p.weapon];if(p.ammo[p.weapon]<=0){p.weapon=0;this.announce('БОЕЗАПАС ИСЧЕРПАН · ПИСТОЛЕТ БЕЗЛИМИТНЫЙ');return;}p.ammo[p.weapon]--;p.cooldown=gun.interval/this.rate;this.shotFlash=.11;this.shake=p.weapon===1?.085:.026;this.shotCount++;this.onSound('shot'+p.weapon);
  for(let i=0;i<gun.pellets;i++){const angle=p.yaw+(this.random()-.5)*gun.spread*2,dx=-Math.sin(angle),dz=-Math.cos(angle);let distance=Math.min(gun.range,this.wallDistance(p.x,p.z,dx,dz)),target:Enemy|undefined;
   for(const e of this.enemies){if(e.hp<=0||e.age<.55)continue;const ex=e.x-p.x,ez=e.z-p.z,projection=ex*dx+ez*dz,perp=ex*ex+ez*ez-projection*projection,r=e.radius+.13;if(projection>0&&perp<r*r){const near=projection-Math.sqrt(r*r-perp);if(near<distance){distance=near;target=e;}}}
   if(target)this.hit(target,gun.damage*this.power*(p.weapon===1?Math.max(.4,1-distance/45):1));
  }
 }
 choose(id:Upgrade){if(this.phase!=='upgrade'||!this.choices.includes(id))return;switch(id){case'power':this.power*=1.22;break;case'vitality':this.maxHP+=25;this.player.hp=this.maxHP;break;case'haste':this.rate*=1.15;this.speed*=1.05;break;case'leech':this.leech+=2;break;case'supply':this.player.armor=Math.min(150,this.player.armor+35);this.player.ammo[1]+=24;this.player.ammo[2]+=100;break;case'dash':this.dashRecovery=Math.max(.7,this.dashRecovery*.8);this.player.armor=Math.min(150,this.player.armor+20);break;}this.nextUpgrade+=45;this.phase='playing';this.player.hp=Math.min(this.maxHP,this.player.hp+15);this.announce(UPGRADES[id].name.toUpperCase());this.choices=[];this.onSound('upgrade');}
 step(dt:number,c:Controls){if(this.phase!=='playing')return;dt=clamp(dt,0,.05);this.seconds+=dt;const p=this.player,d=difficulty(this.seconds);p.cooldown=Math.max(0,p.cooldown-dt);p.dashCD=Math.max(0,p.dashCD-dt);p.dashTime=Math.max(0,p.dashTime-dt);this.damageFlash=Math.max(0,this.damageFlash-dt);this.shotFlash=Math.max(0,this.shotFlash-dt);this.hitFlash=Math.max(0,this.hitFlash-dt);this.killFlash=Math.max(0,this.killFlash-dt);this.bannerTime=Math.max(0,this.bannerTime-dt);this.shake=Math.max(0,this.shake-dt*.5);
  p.yaw+=c.turn*dt*2.4;if(c.weapon>=0&&c.weapon<=2&&(c.weapon<2||this.unlocked))p.weapon=c.weapon;
  if(c.dash&&p.dashCD<=0){p.dashTime=.22;p.dashCD=this.dashRecovery;this.onSound('dash');}
  const len=Math.max(1,Math.hypot(c.forward,c.strafe)),f=c.forward/len,s=c.strafe/len,v=(p.dashTime>0?19:6.3)*this.speed;
  let dx=(-Math.sin(p.yaw)*f+Math.cos(p.yaw)*s)*v*dt,dz=(-Math.cos(p.yaw)*f-Math.sin(p.yaw)*s)*v*dt;
  if(p.dashTime>0&&len===1&&!f&&!s){dx=-Math.sin(p.yaw)*v*dt;dz=-Math.cos(p.yaw)*v*dt;}this.move(p,dx,dz,.38);if(c.fire)this.fire();
  if(this.seconds>=60&&!this.unlocked){this.unlocked=true;this.announce('МОЛОХ РАЗБЛОКИРОВАН · НАЖМИ 3');this.onSound('upgrade');}
  this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawnTimer=d.interval;if(this.enemies.length<d.cap)this.spawn();}
  if(this.seconds>=this.nextBoss){this.nextBoss+=90;this.spawn('titan');this.announce('ТИТАН ВОШЁЛ В СОБОР');this.onSound('boss');}
  for(const e of this.enemies){if(e.hp<=0)continue;e.age+=dt;e.flash=Math.max(0,e.flash-dt);e.attack-=dt;if(e.age<.7)continue;const ex=p.x-e.x,ez=p.z-e.z,dist=Math.hypot(ex,ez)||.01;const ranged=e.kind==='caster'||e.kind==='titan';
   if(dist>(ranged?7:.9)||!this.sight(e,p)){let vx=ex/dist,vz=ez/dist;for(const other of this.enemies){if(other===e||other.hp<=0)continue;const ox=e.x-other.x,oz=e.z-other.z,dd=ox*ox+oz*oz,sep=e.radius+other.radius+.1;if(dd>0&&dd<sep*sep){const v=Math.sqrt(dd);vx+=ox/v*(sep-v)*1.8;vz+=oz/v*(sep-v)*1.8;}}
    const norm=Math.max(1,Math.hypot(vx,vz)),step=e.speed*dt,beforeX=e.x,beforeZ=e.z;this.move(e,vx/norm*step,vz/norm*step,e.radius);
    // Stable handed detours around cover prevent crowds sticking at its front face.
    if(Math.hypot(e.x-beforeX,e.z-beforeZ)<step*.45){const sign=e.id%2?1:-1;this.move(e,-ez/dist*sign*step,ex/dist*sign*step,e.radius);}
   }
   if(e.attack<=0){if(dist<e.radius+.7){this.hurt((e.kind==='titan'?27:e.kind==='brute'?20:9)*d.damage);e.attack=.8;}else if(ranged&&dist<30&&this.sight(e,p)){const n=e.kind==='titan'?3:1;for(let i=0;i<n;i++){const angle=Math.atan2(ex,ez)+(i-(n-1)/2)*.14,speed=e.kind==='titan'?8:7;this.bullets.push({id:this.uid++,x:e.x,z:e.z,vx:Math.sin(angle)*speed,vz:Math.cos(angle)*speed,life:5,damage:(e.kind==='titan'?22:13)*d.damage});}e.attack=e.kind==='titan'?1.7:2.5;this.onSound('cast');}}
  }
  this.enemies=this.enemies.filter(e=>e.hp>0);
  for(const b of this.bullets){const ox=b.x,oz=b.z;const distance=Math.hypot(b.vx,b.vz)*dt;b.x+=b.vx*dt;b.z+=b.vz*dt;b.life-=dt;if(this.blocked(b.x,b.z,.15)||this.wallDistance(ox,oz,b.vx/Math.hypot(b.vx,b.vz),b.vz/Math.hypot(b.vx,b.vz))<distance)b.life=0;if(b.life>0&&Math.hypot(b.x-p.x,b.z-p.z)<.6){b.life=0;this.hurt(b.damage);}}
  this.bullets=this.bullets.filter(b=>b.life>0);
  for(const item of this.pickups){item.life-=dt;if(Math.hypot(item.x-p.x,item.z-p.z)<1.25){if(item.kind==='health'){if(p.hp>=this.maxHP)continue;p.hp=Math.min(this.maxHP,p.hp+28);}else if(item.kind==='armor')p.armor=Math.min(150,p.armor+30);else{p.ammo[1]=Math.min(120,p.ammo[1]+12);p.ammo[2]=Math.min(500,p.ammo[2]+60);}item.life=0;this.onSound('pickup');}}
  this.pickups=this.pickups.filter(item=>item.life>0);
  if(this.seconds>=this.nextSupply){this.nextSupply+=18;for(let i=0;i<20;i++){const x=(this.random()-.5)*36,z=(this.random()-.5)*36;if(!this.blocked(x,z,1)){this.pickups.push({id:this.uid++,x,z,kind:this.random()<.4?'health':'ammo',life:40});break;}}}
  for(const fx of this.particles){fx.life-=dt;fx.x+=fx.vx*dt;fx.z+=fx.vz*dt;fx.y+=fx.vy*dt;fx.vy-=12*dt;}this.particles=this.particles.filter(f=>f.life>0);
  if(this.phase==='playing'&&this.seconds>=this.nextUpgrade){this.phase='upgrade';const all=Object.keys(UPGRADES) as Upgrade[];for(let i=all.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}this.choices=all.slice(0,3);this.onSound('upgrade');}
 }
}
