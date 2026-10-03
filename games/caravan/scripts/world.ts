export type Point=[number,number];
export type TowerKind='arrow'|'mortar'|'frost'|'sun';
export type EnemyKind='scarab'|'runner'|'armored'|'guardian';
export interface MapData {id:string;name:string;subtitle:string;description:string;waves:number;multiplier:number;coins:number;route:Point[];slots:Point[];seed:number}
export const TOWERS:Record<TowerKind,{name:string;caption:string;description:string;cost:number;range:number;damage:number;cooldown:number;color:string;icon:string}>={
 arrow:{name:'Дозорная башня',caption:'БЫСТРАЯ СТРЕЛЬБА',description:'Надёжная защита от быстрых врагов. Броня поглощает часть урона.',cost:80,range:170,damage:22,cooldown:.6,color:'#eabb69',icon:'➶'},
 mortar:{name:'Песчаная мортира',caption:'УРОН ПО ПЛОЩАДИ',description:'Разбивает группы врагов в радиусе 65. Стреляет медленно.',cost:130,range:185,damage:48,cooldown:1.65,color:'#ef8f67',icon:'◉'},
 frost:{name:'Ледяной кристалл',caption:'ЗАМЕДЛЕНИЕ',description:'Замедляет группу врагов на 55%. Даёт другим башням время.',cost:100,range:155,damage:8,cooldown:1,color:'#81c9d7',icon:'❖'},
 sun:{name:'Обелиск солнца',caption:'ПРОБИВАЕТ БРОНЮ',description:'Солнечный луч игнорирует броню. Особенно силён против стражей.',cost:160,range:165,damage:34,cooldown:.8,color:'#f6d892',icon:'☀'}
};
export const ENEMIES:Record<EnemyKind,{name:string;hp:number;speed:number;armor:number;bounty:number;leak:number}>={
 scarab:{name:'Скарабей',hp:60,speed:48,armor:0,bounty:8,leak:1},runner:{name:'Бегун',hp:43,speed:82,armor:0,bounty:9,leak:1},armored:{name:'Панцирник',hp:175,speed:34,armor:.52,bounty:16,leak:2},guardian:{name:'Страж дюн',hp:1600,speed:23,armor:.3,bounty:110,leak:8}
};
export interface Tower {slot:number;kind:TowerKind;level:number;cooldown:number;angle:number;spent:number;kills:number}
export interface Enemy {id:number;kind:EnemyKind;distance:number;x:number;y:number;angle:number;hp:number;maxHp:number;slow:number;hit:number}
export interface Effect {kind:'shot'|'blast'|'ice'|'sun'|'death'|'leak'|'pulse';x:number;y:number;tx:number;ty:number;life:number;maxLife:number;color:string}
export interface WaveSpec {kind:EnemyKind;at:number}
export function readMap(scene:{moduleData?:Record<string,unknown>}):MapData {
 const m=scene.moduleData?.caravan as MapData;
 if(!m||!Array.isArray(m.route)||m.route.length<2||!Array.isArray(m.slots)||!m.slots.length||!Number.isFinite(m.multiplier)||m.multiplier<=0||!Number.isInteger(m.waves)||m.waves<1||!Number.isFinite(m.coins)||m.coins<0||![...m.route,...m.slots].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw new Error('Некорректная карта Каравана');
 return m;
}
export function wavePlan(n:number):WaveSpec[]{
 const list:WaveSpec[]=[];const count=7+n*2;
 for(let i=0;i<count;i++){let kind:EnemyKind='scarab';if(n>=2&&i%3===1)kind='runner';if(n>=4&&i%4===0)kind='armored';list.push({kind,at:i*(n>=7?.65:.85)});}
 if(n===5)list.push({kind:'armored',at:count*.85+1},{kind:'armored',at:count*.85+2});
 if(n===10)list.push({kind:'guardian',at:count*.65+1});
 return list.sort((a,b)=>a.at-b.at);
}
export class World {
 map:MapData;length:number;segments:number[]=[];towers:Tower[]=[];enemies:Enemy[]=[];effects:Effect[]=[];coins:number;health=20;wave=0;kills=0;time=0;waveTime=0;queue:WaveSpec[]=[];active=false;status:'playing'|'won'|'lost'='playing';pulseCooldown=0;nextId=1;waveCleared=0;events:string[]=[];
 constructor(map:MapData){this.map=map;this.coins=map.coins;for(let i=1;i<map.route.length;i++)this.segments.push(Math.hypot(map.route[i][0]-map.route[i-1][0],map.route[i][1]-map.route[i-1][1]));this.length=this.segments.reduce((a,b)=>a+b,0);}
 point(distance:number){let d=distance;for(let i=0;i<this.segments.length;i++){if(d<=this.segments[i]||i===this.segments.length-1){const a=this.map.route[i],b=this.map.route[i+1],t=Math.min(1,d/this.segments[i]);return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,angle:Math.atan2(b[1]-a[1],b[0]-a[0])};}d-=this.segments[i];}return{x:0,y:0,angle:0};}
 tower(slot:number){return this.towers.find(t=>t.slot===slot);}
 stats(t:Tower){const s=TOWERS[t.kind];return {damage:s.damage*(1+(t.level-1)*.8),range:s.range+(t.level-1)*16,cooldown:s.cooldown/(1+(t.level-1)*.1)};}
 upgradeCost(t:Tower){return Math.round(TOWERS[t.kind].cost*(t.level===1?.8:1.2));}
 build(slot:number,kind:TowerKind){if(this.status!=='playing'||!Number.isInteger(slot)||!this.map.slots[slot]||this.tower(slot)||!TOWERS[kind]||this.coins<TOWERS[kind].cost)return false;this.coins-=TOWERS[kind].cost;this.towers.push({slot,kind,level:1,cooldown:.15,angle:-Math.PI/2,spent:TOWERS[kind].cost,kills:0});this.events.push('build');return true;}
 upgrade(slot:number){const t=this.tower(slot);if(!t||t.level>=3||this.status!=='playing'||this.coins<this.upgradeCost(t))return false;const cost=this.upgradeCost(t);this.coins-=cost;t.spent+=cost;t.level++;this.events.push('build');return true;}
 sell(slot:number){const t=this.tower(slot);if(!t||this.status!=='playing')return false;this.coins+=Math.floor(t.spent*.7);this.towers=this.towers.filter(x=>x!==t);this.events.push('coin');return true;}
 startWave(){if(this.active||this.status!=='playing'||this.wave>=this.map.waves)return false;this.wave++;this.queue=wavePlan(this.wave);this.waveTime=0;this.active=true;this.events.push('wave');return true;}
 effect(kind:Effect['kind'],x:number,y:number,tx=x,ty=y,color='#ffd48a',life=.3){this.effects.push({kind,x,y,tx,ty,color,life,maxLife:life});}
 hit(enemy:Enemy,damage:number,pierce=false,tower?:Tower){if(enemy.hp<=0)return;enemy.hp-=damage*(pierce?1:1-ENEMIES[enemy.kind].armor);enemy.hit=.13;if(enemy.hp<=0){this.coins+=ENEMIES[enemy.kind].bounty;this.kills++;if(tower)tower.kills++;this.effect('death',enemy.x,enemy.y,enemy.x,enemy.y,'#f8db9c',.5);}}
 pulse(){if(this.status!=='playing'||!this.active||this.pulseCooldown>0)return false;this.pulseCooldown=32;for(const e of this.enemies){this.hit(e,100+this.wave*12,true);e.slow=4;}this.effect('pulse',550,340,550,340,'#f8e6ac',1);this.events.push('pulse');return true;}
 tick(dt:number){if(this.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);this.time+=dt;this.pulseCooldown=Math.max(0,this.pulseCooldown-dt);this.effects=this.effects.filter(e=>(e.life-=dt)>0);
 if(this.active){this.waveTime+=dt;while(this.queue.length&&this.queue[0].at<=this.waveTime){const next=this.queue.shift()!,hp=ENEMIES[next.kind].hp*(1+(this.wave-1)*.19)*this.map.multiplier;this.enemies.push({id:this.nextId++,kind:next.kind,distance:0,...this.point(0),hp,maxHp:hp,slow:0,hit:0});}}
 for(const e of this.enemies){if(e.hp<=0)continue;e.slow=Math.max(0,e.slow-dt);e.hit=Math.max(0,e.hit-dt);e.distance+=ENEMIES[e.kind].speed*(this.map.id==='canyon'?1.12:1)*(e.slow>0?.45:1)*dt;Object.assign(e,this.point(e.distance));if(e.distance>=this.length){this.health=Math.max(0,this.health-ENEMIES[e.kind].leak);e.hp=0;this.effect('leak',1080,e.y,1080,e.y,'#ef8164',.6);this.events.push('leak');}}
 if(this.health===0){this.status='lost';this.active=false;this.events.push('lost');return;}
 for(const t of this.towers){t.cooldown-=dt;const s=this.stats(t),[x,y]=this.map.slots[t.slot];const candidates=this.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-x,e.y-y)<=s.range).sort((a,b)=>b.distance-a.distance);const e=candidates[0];if(!e)continue;t.angle=Math.atan2(e.y-y,e.x-x);if(t.cooldown>0)continue;t.cooldown=s.cooldown;
  if(t.kind==='mortar'){for(const victim of this.enemies)if(Math.hypot(victim.x-e.x,victim.y-e.y)<65+(t.level-1)*8)this.hit(victim,s.damage,false,t);this.effect('blast',e.x,e.y,e.x,e.y,'#efac68',.45);this.effect('shot',x,y-35,e.x,e.y,'#e88451',.25);}
  else if(t.kind==='frost'){for(const victim of this.enemies)if(victim.hp>0&&Math.hypot(victim.x-e.x,victim.y-e.y)<55){victim.slow=2.3+t.level*.5;this.hit(victim,s.damage,true,t);}this.effect('ice',x,y-42,e.x,e.y,'#a8ebef',.35);}
  else {this.hit(e,s.damage,t.kind==='sun',t);this.effect(t.kind==='sun'?'sun':'shot',x,y-38,e.x,e.y,TOWERS[t.kind].color,t.kind==='sun'?.23:.16);}
 }
 this.enemies=this.enemies.filter(e=>e.hp>0);
 if(this.active&&!this.queue.length&&!this.enemies.length){this.active=false;this.waveCleared=this.wave;this.coins+=40+this.wave*6;this.events.push('clear');if(this.wave===this.map.waves){this.status='won';this.events.push('won');}}
 }
 stars(){return this.status==='won'?(this.health===20?3:this.health>=12?2:1):0;}
}
