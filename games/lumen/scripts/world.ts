import type {SceneDocument} from '@shelter/scene.ts';

export const UNIT = 64;
export const FLOOR = 660;
export type Kind = 'solid'|'platform'|'moving'|'thorn'|'spark'|'lens'|'checkpoint'|'enemy'|'beacon'|'spawn'|'sign';
export interface Thing {id:string; kind:Kind; x:number;y:number;w:number;h:number; baseX:number;baseY:number; dx:number;dy:number; values:Record<string,string|number|boolean>}
export interface Level {id:string;name:string;subtitle:string;theme:number;width:number;next:string;things:Thing[]}
export interface Controls {left:boolean;right:boolean;jump:boolean;jumpPressed:boolean;dashPressed:boolean;interact:boolean}
export const noControls = ():Controls=>({left:false,right:false,jump:false,jumpPressed:false,dashPressed:false,interact:false});
export interface Hero {x:number;y:number;vx:number;vy:number;w:number;h:number;face:number;grounded:boolean;jumps:number;coyote:number;buffer:number;dash:number;cooldown:number;invulnerable:number;hp:number;floorId:string;stride:number}
export interface Particle {x:number;y:number;vx:number;vy:number;life:number;max:number;size:number;color:string;gravity:number}
export type Sound = 'jump'|'double'|'dash'|'spark'|'lens'|'hurt'|'checkpoint'|'beacon'|'enemy'|'land';
export interface Progress {version:1;scene:string;checkpoint:string;collected:string[];defeated:string[];lit:string[];seconds:number;deaths:number;won:boolean}
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const overlap=(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number})=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function readLevel(scene:SceneDocument):Level {
 const data=scene.moduleData?.lumen as Record<string,unknown>|undefined;
 if(!data||!Number.isFinite(data.width)||Number(data.width)<1000||Number(data.width)>20000)throw new Error('Люмен: некорректная ширина уровня.');
 if(![0,1,2].includes(Number(data.theme)))throw new Error('Люмен: тема уровня должна быть 0, 1 или 2.');
 const things:Thing[]=scene.nodes.filter(n=>n.visible&&n.components?.some(c=>c.type.startsWith('lumen.'))).map(n=>{
  const c=n.components!.find(c=>c.type.startsWith('lumen.'))!,w=n.transform.scale[0]*UNIT,h=n.transform.scale[1]*UNIT;
  const x=n.transform.position[0]*UNIT-w/2,y=FLOOR-n.transform.position[1]*UNIT-h/2;
  return {id:n.id,kind:c.type.slice(6) as Kind,x,y,w,h,baseX:x,baseY:y,dx:0,dy:0,values:{...c.values}};
 });
 const kinds:Kind[]=['solid','platform','moving','thorn','spark','lens','checkpoint','enemy','beacon','spawn','sign'];
 if(things.some(t=>!kinds.includes(t.kind)))throw new Error('Люмен: неизвестный игровой объект.');
 for(const type of ['spawn','beacon'])if(things.filter(t=>t.kind===type).length!==1)throw new Error('Люмен: нужен ровно один объект '+type+'.');
 if(things.filter(t=>t.kind==='lens').length!==3)throw new Error('Люмен: на уровне должны быть три линзы.');
 if(!things.some(t=>t.kind==='solid'))throw new Error('Люмен: добавьте землю.');
 return {id:scene.id!,name:scene.name,subtitle:String(data.subtitle||''),theme:Number(data.theme)||0,width:Number(data.width),next:String(things.find(t=>t.kind==='beacon')!.values.next??data.next??''),things};
}

export class World {
 levels:Level[];level:Level;startId:string;hero!:Hero;checkpoint='';collected=new Set<string>();defeated=new Set<string>();lit=new Set<string>();particles:Particle[]=[];
 time=0;seconds=0;deaths=0;phase:'title'|'playing'|'paused'|'transition'|'won'='title';transition=0;shake=0;flash=0;banner='';bannerTime=0;hint='';prompt='';
 onSound:(s:Sound)=>void=()=>{};onSave:()=>void=()=>{};onScene:()=>void=()=>{};
 constructor(scenes:SceneDocument[],start:string){this.levels=scenes.map(readLevel);this.level=this.levels.find(l=>l.id===start)||this.levels[0];this.startId=this.level.id;this.spawn();}
 get lenses(){return this.level.things.filter(t=>t.kind==='lens'&&this.collected.has(t.id)).length;}
 get sparks(){return this.levels.flatMap(l=>l.things).filter(t=>t.kind==='spark'&&this.collected.has(t.id)).length;}
 get totalSparks(){return this.levels.reduce((n,l)=>n+l.things.filter(t=>t.kind==='spark').length,0);}
 get totalLenses(){return this.levels.flatMap(l=>l.things).filter(t=>t.kind==='lens'&&this.collected.has(t.id)).length;}
 spawn(){
  const p=this.level.things.find(t=>t.id===this.checkpoint&&t.kind==='checkpoint')||this.level.things.find(t=>t.kind==='spawn')!;
  this.hero={x:p.x+p.w/2-15,y:p.y+p.h-54,vx:0,vy:0,w:30,h:54,face:1,grounded:false,jumps:0,coyote:0,buffer:0,dash:0,cooldown:0,invulnerable:1.5,hp:3,floorId:'',stride:0};
 }
 newGame(){this.collected.clear();this.defeated.clear();this.lit.clear();this.level=this.levels.find(l=>l.id===this.startId)!;this.checkpoint='';this.seconds=0;this.deaths=0;this.time=0;this.particles=[];this.spawn();this.phase='playing';this.announce(this.level.name);this.onScene();this.onSave();}
 announce(text:string){this.banner=text;this.bannerTime=3.8;}
 burst(x:number,y:number,color:string,n=18,power=160){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=power*(.2+Math.random()*.8),life=.3+Math.random()*.65;this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,size:1.5+Math.random()*3,color,gravity:70});}if(this.particles.length>280)this.particles.splice(0,this.particles.length-280);}
 die(){this.deaths++;this.burst(this.hero.x+15,this.hero.y+25,'#ffe1b2',30);this.spawn();this.shake=10;this.flash=.25;this.announce('Огонь не погас. Попробуй ещё раз.');this.onSound('hurt');this.onSave();}
 hurt(sourceX:number){const h=this.hero;if(h.invulnerable>0||h.dash>0)return;h.hp--;h.invulnerable=1.5;h.vx=(h.x>sourceX?1:-1)*280;h.vy=-330;h.dash=0;this.shake=9;this.flash=.25;this.onSound('hurt');this.burst(h.x+15,h.y+25,'#f0889f',18);if(h.hp<=0)this.die();}
 save():Progress{return {version:1,scene:this.level.id,checkpoint:this.checkpoint,collected:[...this.collected],defeated:[...this.defeated],lit:[...this.lit],seconds:this.seconds,deaths:this.deaths,won:this.phase==='won'};}
 restore(raw:unknown){
  const p=raw as Progress;if(!p||p.version!==1||!this.levels.some(l=>l.id===p.scene)||!Array.isArray(p.collected)||!Array.isArray(p.defeated)||!Array.isArray(p.lit)||!Number.isFinite(p.seconds)||!Number.isFinite(p.deaths)||typeof p.checkpoint!=='string')return false;
  const all=this.levels.flatMap(l=>l.things),ids=new Set(all.map(t=>t.id));this.collected=new Set(p.collected.filter(id=>ids.has(id)));this.defeated=new Set(p.defeated.filter(id=>ids.has(id)));this.lit=new Set(p.lit.filter(id=>this.levels.some(l=>l.id===id)));this.level=this.levels.find(l=>l.id===p.scene)!;this.checkpoint=p.checkpoint;this.seconds=Math.max(0,p.seconds);this.deaths=Math.max(0,Math.floor(p.deaths));this.spawn();this.phase=p.won?'won':'title';return true;
 }
 step(dt:number,input:Controls){
  if(this.phase==='paused'||this.phase==='title'||this.phase==='won')return;
  dt=clamp(dt,0,1/30);this.time+=dt;this.shake=Math.max(0,this.shake-dt*25);this.flash=Math.max(0,this.flash-dt);this.bannerTime=Math.max(0,this.bannerTime-dt);
  for(const p of this.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.gravity*dt;}this.particles=this.particles.filter(p=>p.life>0);
  if(this.phase==='transition'){this.transition-=dt;if(this.transition<=0){const next=this.levels.find(l=>l.id===this.level.next);if(next){this.level=next;this.checkpoint='';this.time=0;this.spawn();this.particles=[];this.phase='playing';this.announce(this.level.name);this.onScene();}else{this.phase='won';this.onSound('beacon');}this.onSave();}return;}
  if(this.phase!=='playing')return;
  this.seconds+=dt;const h=this.hero;this.prompt='';this.hint='';h.invulnerable=Math.max(0,h.invulnerable-dt);h.cooldown=Math.max(0,h.cooldown-dt);h.coyote=Math.max(0,h.coyote-dt);h.buffer=Math.max(0,h.buffer-dt);
  const solids=this.level.things.filter(t=>['solid','platform','moving'].includes(t.kind));
  for(const t of this.level.things){t.dx=0;t.dy=0;if(t.kind==='moving'||t.kind==='enemy'){const range=Number(t.values.range)||0,speed=Number(t.values.speed)||1,vertical=t.values.axis==='y';const delta=Math.sin(this.time*speed+Number(t.values.phase||0))*range;const nx=t.baseX+(vertical?0:delta),ny=t.baseY+(vertical?delta:0);t.dx=nx-t.x;t.dy=ny-t.y;t.x=nx;t.y=ny;}}
  const carrier=solids.find(t=>t.id===h.floorId);if(carrier&&h.grounded){h.x+=carrier.dx;h.y+=carrier.dy;}
  const direction=Number(input.right)-Number(input.left);if(direction)h.face=direction;
  if(input.jumpPressed)h.buffer=.14;
  if(h.buffer>0&&(h.coyote>0||h.jumps<2)){
   const first=h.coyote>0||h.jumps===0;h.vy=first?-715:-660;h.jumps=first?1:2;h.grounded=false;h.floorId='';h.coyote=0;h.buffer=0;h.dash=0;this.onSound(first?'jump':'double');this.burst(h.x+15,h.y+54,first?'#e5d9ab':'#8be7e1',first?6:15,100);
  }
  if(input.dashPressed&&h.cooldown<=0){h.dash=.17;h.cooldown=.9;h.vy=0;this.onSound('dash');this.burst(h.x+15,h.y+28,'#8be7e1',12,100);}
  if(h.dash>0){h.dash=Math.max(0,h.dash-dt);h.vx=h.face*870;h.vy=0;this.particles.push({x:h.x+15,y:h.y+25,vx:0,vy:0,life:.25,max:.25,size:18,color:'#9aebe0',gravity:0});}
  else {const target=direction*295;h.vx+=(target-h.vx)*Math.min(1,dt*(h.grounded?17:9));h.vy+=1770*dt;if(!input.jump&&h.vy<-250)h.vy+=2100*dt;h.vy=Math.min(980,h.vy);}
  const oldX=h.x;h.x=clamp(h.x+h.vx*dt,0,this.level.width-h.w);
  for(const t of solids.filter(t=>t.kind==='solid'))if(overlap(h,t)){if(oldX+h.w<=t.x+2)h.x=t.x-h.w;else if(oldX>=t.x+t.w-2)h.x=t.x+t.w;else continue;h.vx=0;h.dash=0;}
  const oldY=h.y;h.y+=h.vy*dt;const wasGrounded=h.grounded;h.grounded=false;h.floorId='';
  for(const t of solids){if(h.x+h.w<=t.x+.1||h.x>=t.x+t.w-.1)continue;const top=t.y;
   if(h.vy>=0&&oldY+h.h<=top+Math.max(4,t.dy+2)&&h.y+h.h>=top){h.y=top-h.h;h.vy=0;h.grounded=true;h.jumps=0;h.coyote=.12;h.floorId=t.id;}
   else if(t.kind==='solid'&&h.vy<0&&oldY>=top+t.h-2&&h.y<top+t.h){h.y=top+t.h;h.vy=0;}
  }
  if(wasGrounded&&!h.grounded)h.coyote=.12;
  if(h.grounded&&!wasGrounded&&oldY+h.h<h.y+h.h+12){this.burst(h.x+15,h.y+54,'#769c96',6,65);this.onSound('land');}
  if(h.grounded&&Math.abs(h.vx)>15)h.stride+=dt*Math.abs(h.vx)/32;
  if(h.y>1020){this.die();return;}
  for(const t of this.level.things){
   if(t.kind==='spark'||t.kind==='lens'){
    if(this.collected.has(t.id))continue;
    if(overlap({x:h.x-9,y:h.y-8,w:h.w+18,h:h.h+16},t)){this.collected.add(t.id);this.onSound(t.kind);this.burst(t.x+t.w/2,t.y+t.h/2,t.kind==='lens'?'#9ff8ec':'#ffd58b',t.kind==='lens'?45:12);if(t.kind==='lens'){h.hp=Math.min(3,h.hp+1);this.shake=4;this.announce(['Первая линза найдена','Вторая линза найдена','Все линзы собраны. Зажги маяк!'][this.lenses-1]);}this.onSave();}
   }else if(t.kind==='checkpoint'&&overlap({x:t.x-28,y:t.y,w:t.w+56,h:t.h},h)&&this.checkpoint!==t.id){this.checkpoint=t.id;h.hp=3;this.burst(t.x+t.w/2,t.y+12,'#a3ebd8',25);this.onSound('checkpoint');this.announce('Огонёк сохранён');this.onSave();}
   else if(t.kind==='thorn'&&overlap(h,{x:t.x+5,y:t.y+9,w:t.w-10,h:t.h-9})){this.hurt(t.x+t.w/2);}
   else if(t.kind==='enemy'&&!this.defeated.has(t.id)&&overlap(h,{x:t.x+5,y:t.y+5,w:t.w-10,h:t.h-5})){
    if(h.dash>0||(h.vy>80&&oldY+h.h<t.y+22)){this.defeated.add(t.id);this.burst(t.x+t.w/2,t.y+20,'#b995e4',30);if(h.dash<=0){h.vy=-490;h.jumps=1;}this.onSound('enemy');this.shake=4;}
    else this.hurt(t.x+t.w/2);
   }else if(t.kind==='beacon'&&Math.abs(h.x+15-t.x-t.w/2)<100&&Math.abs(h.y+h.h-t.y-t.h)<100){
    this.prompt=this.lenses===3?'Зажечь маяк':`Найди ещё ${3-this.lenses} ${this.lenses===2?'линзу':'линзы'}`;
    if(input.interact){if(this.lenses===3){this.lit.add(this.level.id);this.phase='transition';this.transition=3.4;this.shake=10;this.burst(t.x+t.w/2,t.y+30,'#ffe8a7',100,450);this.onSound('beacon');this.announce(this.level.next?'Маяк горит. Путь открыт.':'Рассвет возвращается.');this.onSave();}else this.announce('Линзы отмечены на полосе пути сверху.');}
   }else if(t.kind==='sign'&&Math.abs(h.x-t.x)<Number(t.values.radius||170))this.hint=String(t.values.text||'');
  }
 }
}
