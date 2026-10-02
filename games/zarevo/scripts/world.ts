import type {SceneDocument} from '@shelter/scene.ts';

/** Длина сегмента дороги, полуширина полотна и высота камеры в условных единицах псевдо-3D. */
export const SEGMENT=200,ROAD=2000,CAMERA_HEIGHT=1000,FIELD_OF_VIEW=100;
export const CAMERA_DEPTH=1/Math.tan(FIELD_OF_VIEW/2*Math.PI/180),PLAYER_Z=CAMERA_HEIGHT*CAMERA_DEPTH;
export const MAX_SPEED=SEGMENT*60,NITRO_BOOST=1.24,RUNOFF=420,CAR_WIDTH=.32,CAR_LENGTH=SEGMENT*.9;
export const KMH=290/MAX_SPEED,CENTRIFUGAL=.2;
/** Скорость, на которой полный руль ещё удерживает машину в повороте. */
export const cornerLimit=(curve:number)=>Math.min(1,1/(CENTRIFUGAL*Math.max(.001,Math.abs(curve))));

export type Theme='coast'|'pass'|'city';
export type PropKind='palm'|'lamp'|'rock'|'billboard'|'house'|'pine'|'sign'|'rail'|'tower'|'neon';
export type Sound='count'|'go'|'checkpoint'|'bump'|'crash'|'nitro'|'miss'|'finish'|'timeout'|'warning'|'overtake';
export type Phase='title'|'countdown'|'racing'|'paused'|'finished'|'timeout';
export type Prop={kind:PropKind;offset:number;width:number;solid:boolean;variant:number};
export type Segment={index:number;curve:number;y1:number;y2:number;props:Prop[];checkpoint:number};
export type Section={enter:number;hold:number;leave:number;curve:number;hill:number};
export type Track={id:string;name:string;theme:Theme;time:number;rivals:number;traffic:number;pace:number;next:string;
 sections:Section[];checkpoints:{segment:number;bonus:number}[];scenery:{kind:PropKind;side:string;from:number;to:number;every:number;offset:number}[]};
export type Car={id:number;kind:'rival'|'traffic';name:string;color:string;z:number;x:number;target:number;speed:number;max:number;finished:number;passed:boolean;bump:number};
export type Player={z:number;x:number;speed:number;steer:number;nitro:number;boosting:boolean;bump:number;offroad:boolean};
export type Controls={steer:number;gas:number;brake:number;nitro:boolean};
export type Result={track:string;place:number;time:number;overtakes:number;misses:number;best:boolean};
export type Progress={unlocked:number;best:Record<string,{time:number;place:number}>};

export const PROPS:Record<PropKind,{width:number;solid:boolean}>={
 palm:{width:.42,solid:true},lamp:{width:.12,solid:true},rock:{width:.55,solid:true},billboard:{width:.9,solid:true},house:{width:1.1,solid:true},
 pine:{width:.45,solid:true},sign:{width:.3,solid:true},rail:{width:.16,solid:true},tower:{width:1.3,solid:true},neon:{width:.75,solid:true},
};
const THEMES:Theme[]=['coast','pass','city'];
const RIVALS=[['Вера «Вспышка»','#ffd34d'],['Тимур Ветер','#4fd2ff'],['Лис','#ff4f8b'],['Арсений','#9dff6a'],['Нина Ход','#c97bff'],['Барон','#ff8a3d'],['Ильяс','#e9eef5']];
const TRAFFIC=['#8a94a6','#5d6a7d','#a4876a','#6f8c7e','#7e6d93','#b9b4a8'];
export const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const ease=(a:number,b:number,t:number)=>a+(b-a)*((-Math.cos(t*Math.PI)/2)+.5);
const num=(v:unknown,min:number,max:number,label:string)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw new Error(`Зарево: некорректное значение «${label}».`);return n;};

/** Читает трассу из сцены Shelter: участки, контрольные точки и ряды декораций. */
export function readTrack(scene:SceneDocument):Track{
 const data=scene.moduleData?.zarevo as Record<string,unknown>|undefined;
 if(!data)throw new Error('Зарево: в сцене нет данных трассы.');
 const theme=String(data.theme) as Theme;if(!THEMES.includes(theme))throw new Error('Зарево: неизвестное оформление трассы.');
 const part=(type:string)=>scene.nodes.filter(n=>n.visible).flatMap(n=>(n.components||[]).filter(c=>c.type===type).map(c=>({node:n,values:c.values})));
 const sections=part('zarevo.section').sort((a,b)=>a.node.transform.position[2]-b.node.transform.position[2]).map(({values:v})=>({
  enter:num(v.enter,0,500,'въезд'),hold:num(v.hold,1,1000,'участок'),leave:num(v.leave,0,500,'выезд'),curve:num(v.curve,-8,8,'поворот'),hill:num(v.hill,-120,120,'перепад')}));
 if(sections.length<3)throw new Error('Зарево: трасса должна состоять минимум из трёх участков.');
 const length=sections.reduce((n,s)=>n+s.enter+s.hold+s.leave,0);
 if(length<300||length>12000)throw new Error('Зарево: длина трассы должна быть от 300 до 12000 сегментов.');
 const checkpoints=part('zarevo.checkpoint').map(({values:v})=>({segment:num(v.segment,10,length-10,'контрольная точка'),bonus:num(v.bonus,0,60,'бонус времени')})).sort((a,b)=>a.segment-b.segment);
 const scenery=part('zarevo.scenery').map(({values:v})=>{const kind=String(v.kind) as PropKind;if(!PROPS[kind])throw new Error('Зарево: неизвестная декорация.');const side=String(v.side);if(!['left','right','both'].includes(side))throw new Error('Зарево: сторона декорации должна быть left, right или both.');
  return {kind,side,from:num(v.from,0,length,'начало ряда'),to:num(v.to,0,length,'конец ряда'),every:num(v.every,2,1000,'шаг ряда'),offset:num(v.offset,1.05,6,'отступ от дороги')};});
 return {id:scene.id||scene.name,name:scene.name,theme,time:num(data.time,10,180,'стартовое время'),rivals:num(data.rivals,0,7,'соперники'),traffic:num(data.traffic,0,40,'трафик'),
  pace:num(data.pace,.5,1,'темп соперников'),next:typeof data.next==='string'?data.next:'',sections,checkpoints,scenery};
}

/** Детерминируемая псевдослучайность для декораций: одна и та же трасса выглядит одинаково. */
const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};

export function buildSegments(track:Track):Segment[]{
 const segments:Segment[]=[];let y=0;
 const add=(curve:number,to:number)=>{const index=segments.length;segments.push({index,curve,y1:y,y2:to,props:[],checkpoint:0});y=to;};
 for(const s of track.sections){
  const start=y,end=y+s.hill*SEGMENT,total=s.enter+s.hold+s.leave;
  for(let i=0;i<s.enter;i++)add(ease(0,s.curve,i/s.enter),ease(start,end,(i+1)/total));
  for(let i=0;i<s.hold;i++)add(s.curve,ease(start,end,(s.enter+i+1)/total));
  for(let i=0;i<s.leave;i++)add(ease(s.curve,0,i/s.leave),ease(start,end,(s.enter+s.hold+i+1)/total));
 }
 const finish=segments.length;for(let i=0;i<RUNOFF;i++)add(0,y);
 for(const c of track.checkpoints)segments[Math.round(c.segment)].checkpoint=c.bonus||.001;
 track.scenery.forEach((row,r)=>{
  for(let z=row.from;z<Math.min(row.to,finish+RUNOFF-1);z+=row.every){
   const sides=row.side==='both'?[-1,1]:[row.side==='left'?-1:1];
   for(const side of sides){
    const i=Math.floor(z),jitter=hash(i*7.3+r*13+side)*.35;
    // Табличка поворота ставится только там, где дорога действительно поворачивает.
    if(row.kind==='sign'&&(Math.abs(segments[i]?.curve||0)<2||Math.sign(segments[i].curve)===side))continue;
    const p=PROPS[row.kind];segments[i]?.props.push({kind:row.kind,offset:side*(row.offset+jitter),width:p.width,solid:p.solid,variant:Math.floor(hash(i*3.1+r)*4)});
   }
  }
 });
 // Финишная арка.
 segments[finish].checkpoint=-1;
 return segments;
}

/**
 * Смещение осевой линии дороги относительно камеры для ближнего и дальнего края
 * каждого видимого сегмента. Положительная кривизна (правый поворот) уводит дорогу
 * вправо — туда же, куда направлена сила, против которой подруливает игрок.
 */
export function roadOffsets(segments:Segment[],base:number,basePct:number,count:number){
 const near:number[]=[],far:number[]=[];let x=0,dx=-(segments[base].curve*basePct);
 for(let n=0;n<count&&base+n<segments.length;n++){near.push(x);far.push(x+dx);x+=dx;dx+=segments[base+n].curve;}
 return {near,far};
}

export class World {
 tracks:Track[];track:Track;segments:Segment[]=[];length=0;
 phase:Phase='title';countdown=0;time=0;seconds=0;place=8;overtakes=0;misses=0;
 player:Player={z:0,x:0,speed:0,steer:0,nitro:.4,boosting:false,bump:0,offroad:false};
 cars:Car[]=[];finishers:number[]=[];banner='';bannerTime=0;popup='';popupTime=0;shake=0;flash=0;slip=0;
 result:Result|null=null;progress:Progress={unlocked:1,best:{}};nextCheckpoint=0;lastWarning=0;demo=true;
 random:()=>number;onSound:(s:Sound)=>void=()=>{};onResult:(r:Result)=>void=()=>{};
 private carId=0;private paused:Phase='racing';
 constructor(scenes:SceneDocument[],random:()=>number=Math.random){
  this.random=random;this.tracks=scenes.map(readTrack);this.track=this.tracks[0];this.load(this.track.id,true);
 }
 get finishZ(){return this.length*SEGMENT;}
 get trackIndex(){return this.tracks.indexOf(this.track);}
 get progressShare(){return clamp(this.player.z/this.finishZ,0,1);}
 get kmh(){return Math.round(this.player.speed*KMH);}
 segmentAt(z:number){return this.segments[clamp(Math.floor(z/SEGMENT),0,this.segments.length-1)];}
 announce(text:string,time=2.4){this.banner=text;this.bannerTime=time;}
 pop(text:string){this.popup=text;this.popupTime=1.1;}

 /** Подготавливает трассу: стартовую решётку, трафик и таймер. demo — фон главного меню. */
 load(id:string,demo=false){
  const track=this.tracks.find(t=>t.id===id);if(!track)throw new Error('Зарево: трасса не найдена.');
  this.track=track;this.segments=buildSegments(track);this.length=this.segments.length-RUNOFF;this.demo=demo;
  this.player={z:SEGMENT*4,x:demo?0:.5,speed:demo?MAX_SPEED*.82:0,steer:0,nitro:.4,boosting:false,bump:0,offroad:false};
  this.cars=[];this.finishers=[];this.time=track.time;this.seconds=0;this.overtakes=0;this.misses=0;this.result=null;this.nextCheckpoint=0;this.lastWarning=0;this.slip=0;
  for(let i=0;i<track.rivals;i++){
   const [name,color]=RIVALS[i],row=Math.floor((i+1)/2),lane=(i+1)%2?-.5:.5;
   const max=MAX_SPEED*track.pace*(1.035-i*.016);
   this.cars.push({id:++this.carId,kind:'rival',name,color,z:SEGMENT*(4+(track.rivals-i)*6+(demo?60:0))+row*20,x:i===0?-.5:lane,target:i===0?-.5:lane,speed:demo?max*.9:0,max,finished:0,passed:false,bump:0});
  }
  for(let i=0;i<track.traffic;i++)this.spawnTraffic(SEGMENT*(70+i*(this.length*.9/Math.max(1,track.traffic))));
  this.place=this.computePlace();
 }
 spawnTraffic(z:number){
  if(z>=this.finishZ-SEGMENT*20)return;
  const lanes=[-.66,0,.66],x=lanes[Math.floor(this.random()*3)];
  this.cars.push({id:++this.carId,kind:'traffic',name:'Попутная машина',color:TRAFFIC[Math.floor(this.random()*TRAFFIC.length)],z,x,target:x,speed:MAX_SPEED*(.3+this.random()*.18),max:0,finished:0,passed:true,bump:0});
 }
 start(id=this.track.id){
  this.load(id);this.phase='countdown';this.countdown=3.6;this.announce(this.track.name,3.2);this.onSound('count');
 }
 pause(value:boolean){
  if(value&&['countdown','racing'].includes(this.phase)){this.paused=this.phase;this.phase='paused';}
  else if(!value&&this.phase==='paused')this.phase=this.paused;
 }
 toTitle(){this.load(this.track.id,true);this.phase='title';}
 computePlace(){
  const p=this.player;let place=1;
  for(const c of this.cars)if(c.kind==='rival'&&(c.finished>0||c.z>p.z))place++;
  return place;
 }

 step(dt:number,input:Controls){
  if(this.phase==='paused')return;
  this.bannerTime=Math.max(0,this.bannerTime-dt);this.popupTime=Math.max(0,this.popupTime-dt);this.shake=Math.max(0,this.shake-dt*2.6);this.flash=Math.max(0,this.flash-dt*2);
  if(this.phase==='countdown'){
   const before=Math.ceil(this.countdown-.6);this.countdown-=dt;const after=Math.ceil(this.countdown-.6);
   if(after!==before&&after>0)this.onSound('count');
   if(this.countdown<=.6){this.phase='racing';this.announce('СТАРТ!',1.2);this.onSound('go');}
   this.moveCars(dt);return;
  }
  if(this.phase==='title'&&this.player.z>this.finishZ-SEGMENT*300){this.load(this.track.id,true);return;}
  const racing=this.phase==='racing';
  const control:Controls=racing?input:this.autopilot();
  this.drive(dt,control);
  this.moveCars(dt);
  this.collide();
  if(racing){
   this.seconds+=dt;this.time-=dt;
   const z=this.player.z/SEGMENT;
   while(this.nextCheckpoint<this.track.checkpoints.length&&z>=this.track.checkpoints[this.nextCheckpoint].segment){
    const bonus=this.track.checkpoints[this.nextCheckpoint].bonus;this.time+=bonus;this.nextCheckpoint++;this.flash=.6;
    this.announce(`КОНТРОЛЬНАЯ ТОЧКА  +${bonus} С`,2.2);this.onSound('checkpoint');this.lastWarning=0;
   }
   if(this.time<5.5&&Math.ceil(this.time)!==this.lastWarning&&this.time>0){this.lastWarning=Math.ceil(this.time);this.onSound('warning');}
   const place=this.computePlace();if(place<this.place){this.overtakes+=this.place-place;this.onSound('overtake');}this.place=place;
   if(this.player.z>=this.finishZ)this.finish();
   else if(this.time<=0){this.time=0;this.phase='timeout';this.announce('ВРЕМЯ ВЫШЛО',4);this.onSound('timeout');}
  }
 }
 /** Автопилот главного меню и финишного круга: держит центр полосы и объезжает машины. */
 autopilot():Controls{
  const p=this.player,seg=this.segmentAt(p.z+SEGMENT*4);let target=seg.curve*.06;
  if(this.phase==='timeout')return {steer:clamp((0-p.x)*2,-1,1),gas:0,brake:.4,nitro:false};
  for(const c of this.cars){const ahead=c.z-p.z;if(ahead>0&&ahead<SEGMENT*22&&Math.abs(c.x-p.x)<.45&&c.speed<p.speed)target=c.x>0?c.x-.7:c.x+.7;}
  const finished=this.phase==='finished';
  return {steer:clamp((target-p.x)*3,-1,1),gas:finished?0:this.demo?.92:1,brake:finished&&p.speed>MAX_SPEED*.35?.25:0,nitro:false};
 }
 drive(dt:number,c:Controls){
  const p=this.player,seg=this.segmentAt(p.z),percent=p.speed/MAX_SPEED;
  const boosting=c.nitro&&p.nitro>0&&c.gas>0&&this.phase==='racing';
  if(boosting&&!p.boosting)this.onSound('nitro');p.boosting=boosting;
  if(boosting)p.nitro=Math.max(0,p.nitro-dt*.38);
  const top=MAX_SPEED*(boosting?NITRO_BOOST:1);
  p.steer+=(clamp(c.steer,-1,1)-p.steer)*Math.min(1,dt*10);
  const dx=dt*2.3*Math.min(1,percent*1.2+.08);
  p.x+=dx*p.steer;
  p.x-=dx*percent*seg.curve*CENTRIFUGAL;
  if(c.gas>0)p.speed+=MAX_SPEED*dt*c.gas*(boosting?.42:.25)*(1-percent*.5);
  else p.speed-=MAX_SPEED*dt*.18;
  if(c.brake>0)p.speed-=MAX_SPEED*dt*.9*c.brake;
  if(p.speed>top)p.speed=Math.max(top,p.speed-MAX_SPEED*dt*.6);
  p.offroad=Math.abs(p.x)>1.02;
  if(p.offroad&&p.speed>MAX_SPEED*.3)p.speed-=MAX_SPEED*dt*.75;
  p.x=clamp(p.x,-2.6,2.6);p.speed=Math.max(0,p.speed);p.bump=Math.max(0,p.bump-dt);
  // Спутный поток за машиной впереди заряжает нитро.
  this.slip=0;
  for(const car of this.cars){const ahead=car.z-p.z;if(ahead>SEGMENT&&ahead<SEGMENT*9&&Math.abs(car.x-p.x)<.32&&percent>.55){this.slip=1;p.nitro=Math.min(1,p.nitro+dt*.11);break;}}
  p.z=Math.min(p.z+p.speed*dt,(this.segments.length-30)*SEGMENT);
 }
 moveCars(dt:number){
  const p=this.player,started=this.phase!=='countdown';
  for(const car of this.cars){
   car.bump=Math.max(0,car.bump-dt);
   if(car.kind==='rival'){
    if(!started)continue;
    const seg=this.segmentAt(car.z+SEGMENT*6);let max=Math.min(car.max,MAX_SPEED*cornerLimit(seg.curve)*.97);
    // Мягкое выравнивание: отставшие соперники немного подтягиваются, но не обгоняют чудом.
    const gap=(car.z-p.z)/SEGMENT;if(!this.demo&&this.phase==='racing'){if(gap<-80)max*=1.05;else if(gap>120)max*=.95;}
    if(car.finished)max=MAX_SPEED*.35;
    // Соперники разгоняются по той же кривой, что и игрок, поэтому старт остаётся борьбой.
    if(car.speed<max)car.speed=Math.min(max,car.speed+MAX_SPEED*dt*.24*(1-car.speed/MAX_SPEED*.5));else car.speed+=(max-car.speed)*Math.min(1,dt*1.5);
   }
   // Объезд более медленных машин впереди.
   let blocked=false;
   for(const other of this.cars)if(other!==car&&other.z>car.z&&other.z-car.z<SEGMENT*14&&Math.abs(other.x-car.x)<.42&&other.speed<car.speed){blocked=true;break;}
   if(!blocked&&p.z>car.z&&p.z-car.z<SEGMENT*12&&Math.abs(p.x-car.x)<.42&&p.speed<car.speed)blocked=true;
   if(blocked&&car.kind==='rival'){const options=[-.66,0,.66].filter(lane=>!this.cars.some(o=>o!==car&&o.z>car.z-SEGMENT*2&&o.z-car.z<SEGMENT*16&&Math.abs(o.x-lane)<.4));if(options.length)car.target=options.reduce((a,b)=>Math.abs(b-car.x)<Math.abs(a-car.x)?b:a);}
   car.x+=clamp(car.target-car.x,-dt*1.1,dt*1.1);
   car.z+=car.speed*dt;
   if(car.kind==='rival'&&!car.finished&&car.z>=this.finishZ){this.finishers.push(car.id);car.finished=this.finishers.length;}
   car.z=Math.min(car.z,(this.segments.length-12)*SEGMENT);
  }
  // Трафик позади игрока переставляется вперёд, чтобы плотность оставалась постоянной.
  for(let i=this.cars.length-1;i>=0;i--){const car=this.cars[i];if(car.kind==='traffic'&&car.z<p.z-SEGMENT*60){this.cars.splice(i,1);this.spawnTraffic(p.z+SEGMENT*(180+this.random()*120));}}
 }
 collide(){
  const p=this.player;
  if(p.offroad){
   const base=Math.floor(p.z/SEGMENT);
   for(let i=base;i<=base+1;i++)for(const prop of this.segments[i]?.props||[]){
    if(!prop.solid||Math.abs(p.x-prop.offset)>(prop.width+CAR_WIDTH)/2)continue;
    if(p.speed>MAX_SPEED*.12){this.onSound('crash');this.shake=1;p.nitro=Math.max(0,p.nitro-.15);}
    p.speed=Math.min(p.speed,MAX_SPEED*.12);p.x+=p.x>prop.offset?.18:-.18;p.z=Math.max(0,(i-1)*SEGMENT);p.bump=.6;return;
   }
  }
  for(const car of this.cars){
   const ahead=car.z-p.z,dx=Math.abs(car.x-p.x);
   if(ahead>0&&ahead<CAR_LENGTH&&dx<CAR_WIDTH&&p.speed>car.speed){
    const loss=p.speed-car.speed;p.speed=car.speed*.82;p.z=car.z-CAR_LENGTH;p.x+=p.x<car.x?-.12:.12;car.x+=p.x<car.x?.08:-.08;car.speed=Math.min(car.speed+loss*.15,car.max||car.speed*1.1);
    p.bump=.4;car.bump=.4;this.shake=Math.max(this.shake,.6);this.onSound('bump');
   }else if(ahead<0&&ahead>-CAR_LENGTH&&dx<CAR_WIDTH&&car.speed>p.speed){
    car.speed=p.speed*.85;car.z=p.z-CAR_LENGTH;car.bump=.4;
   }
   // Обгон впритык: машина осталась позади, но расстояние по бокам было минимальным.
   const behind=car.z<p.z;
   if(behind&&!car.passed&&this.phase==='racing'){
    car.passed=true;
    if(dx<CAR_WIDTH+.2&&p.speed>MAX_SPEED*.6){this.misses++;p.nitro=Math.min(1,p.nitro+.2);this.pop('ВПРИТЫК  +НИТРО');this.onSound('miss');}
   }else if(!behind&&car.passed&&car.z-p.z>SEGMENT*2)car.passed=false;
  }
 }
 finish(){
  this.place=this.computePlace();this.phase='finished';this.flash=1;this.onSound('finish');
  const best=this.progress.best[this.track.id],isBest=!best||this.place<best.place||this.place===best.place&&this.seconds<best.time;
  this.result={track:this.track.id,place:this.place,time:this.seconds,overtakes:this.overtakes,misses:this.misses,best:isBest};
  if(isBest)this.progress.best[this.track.id]={time:this.seconds,place:this.place};
  if(this.place<=3)this.progress.unlocked=Math.max(this.progress.unlocked,Math.min(this.tracks.length,this.trackIndex+2));
  this.announce(this.place===1?'ПОБЕДА!':`ФИНИШ · ${this.place}-е место`,4);
  this.onResult(this.result);
 }
 /** Проверяет сохранённый прогресс и подставляет безопасные значения. */
 restore(value:unknown){
  const v=value as Partial<Progress>|null;if(!v||typeof v!=='object')return;
  if(Number.isInteger(v.unlocked))this.progress.unlocked=clamp(Number(v.unlocked),1,this.tracks.length);
  if(v.best&&typeof v.best==='object')for(const t of this.tracks){const b=(v.best as Record<string,{time:number;place:number}>)[t.id];if(b&&Number.isFinite(b.time)&&b.time>0&&Number.isInteger(b.place)&&b.place>=1&&b.place<=8)this.progress.best[t.id]={time:b.time,place:b.place};}
 }
}
