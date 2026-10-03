import {GRAVITY,overlaps,raycast,rayBox,vec,type Arena,type Box,type Vec3} from './arena.ts';

// Движение в духе Quake 3 в метрах: 320 ед./с ≈ 8 м/с, гравитация 800 ≈ 20 м/с².
export const RUN_SPEED=8;
export const GROUND_ACCEL=10;
export const AIR_ACCEL=1;
export const FRICTION=6;
export const STOP_SPEED=2.5;
export const JUMP_SPEED=7;
export const STEP_HEIGHT=.55;
export const HALF_WIDTH=.35;
export const HEIGHT=1.75;
export const CROUCH_HEIGHT=1.15;
/** Голова — куб со стороной HEAD_SIZE у макушки; глаза чуть ниже её центра. */
export const HEAD_SIZE=.3;
export const EYE_HEIGHT=HEIGHT-HEAD_SIZE/2-.05;
export const CROUCH_EYE=CROUCH_HEIGHT-HEAD_SIZE/2-.05;
/** Присед в воздухе поджимает ноги: низ тела поднимается, макушка остаётся на месте. */
export const TUCK=HEIGHT-CROUCH_HEIGHT;
export const CROUCH_SPEED=.5;
// Подкат: разовый рывок из бега, затухание и перезарядка рывка.
export const SLIDE_MIN_SPEED=6;
export const SLIDE_BOOST=2;
export const SLIDE_BOOST_CAP=10;
export const SLIDE_TIME=.8;
export const SLIDE_COOLDOWN=1;
export const SLIDE_DECEL=3.75;
export const SLIDE_END_SPEED=4;
// Наклон: голова уходит вбок на LEAN_OFFSET и чуть опускается.
export const LEAN_OFFSET=.45;
export const LEAN_TIME=.15;
export const LEAN_DROP=.06;
export const LEAN_SPEED=.6;
export const TICK=1/120;

/** Стойка: 0 — стоя, 1 — присед, 2 — подкат. */
export type Stance=0|1|2;
/** Тело игрока: pos — точка между ступнями. lean — наклон от −1 (влево) до 1 (вправо). */
export type Body={pos:Vec3;vel:Vec3;onGround:boolean;crouch:boolean;slide:number;slideCooldown:number;slideArmed:boolean;crouchHeld:boolean;lean:number};
/** forward/strafe — от −1 до 1; yaw — поворот головы (0 — взгляд вдоль −Z); lean — −1, 0 или 1. */
export type MoveInput={forward:number;strafe:number;jump:boolean;yaw:number;crouch?:boolean;lean?:number};
/** tuck — на сколько сдвинулись ступни при приседе или вставании в воздухе (для плавной камеры). */
export type MoveEvents={jumped:boolean;landed:number;pad:number;lava:boolean;out:boolean;slide:boolean;tuck:number};

export const newBody=(pos:Vec3):Body=>({pos:{...pos},vel:vec(),onGround:false,crouch:false,slide:0,slideCooldown:0,slideArmed:false,crouchHeld:false,lean:0});
export const heightOf=(crouch:boolean)=>crouch?CROUCH_HEIGHT:HEIGHT;
export const stanceOf=(b:Body):Stance=>b.slide>0?2:b.crouch?1:0;
export const bodyBox=(p:Vec3,lift=0,height=HEIGHT):Box=>({min:vec(p.x-HALF_WIDTH,p.y+lift,p.z-HALF_WIDTH),max:vec(p.x+HALF_WIDTH,p.y+lift+height,p.z+HALF_WIDTH)});
export const forwardOf=(yaw:number,pitch=0):Vec3=>vec(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
export const rightOf=(yaw:number):Vec3=>vec(Math.cos(yaw),0,-Math.sin(yaw));
export const horizontalSpeed=(b:Body)=>Math.hypot(b.vel.x,b.vel.z);

function blocked(arena:Arena,box:Box){for(const s of arena.solids)if(overlaps(box,s))return s;return undefined;}

/** Ускорение Quake (PM_Accelerate): прибавка ограничена проекцией скорости на желаемое направление — отсюда стрейф-прыжки. */
function accelerate(v:Vec3,dirX:number,dirZ:number,wishSpeed:number,accel:number,dt:number){
 const current=v.x*dirX+v.z*dirZ,add=wishSpeed-current;if(add<=0)return;
 const step=Math.min(accel*dt*wishSpeed,add);v.x+=step*dirX;v.z+=step*dirZ;
}
function friction(v:Vec3,dt:number){
 const speed=Math.hypot(v.x,v.z);if(speed<1e-4){v.x=v.z=0;return;}
 const drop=Math.max(speed,STOP_SPEED)*FRICTION*dt,scale=Math.max(0,speed-drop)/speed;v.x*=scale;v.z*=scale;
}
/** Подкат гасит скорость линейно, а не трением: так он проезжает предсказуемое расстояние. */
function slideDrag(v:Vec3,dt:number){
 const speed=Math.hypot(v.x,v.z);if(speed<1e-4)return 0;
 const next=Math.max(0,speed-SLIDE_DECEL*dt);v.x*=next/speed;v.z*=next/speed;return next;
}

/** Сдвиг по одной оси с упором в блоки. Возвращает true, если упёрлись. */
function slide(arena:Arena,b:Body,axis:'x'|'y'|'z',delta:number){
 if(delta===0)return false;b.pos[axis]+=delta;
 const height=heightOf(b.crouch);let hit=false;
 for(const s of arena.solids){
  const box=bodyBox(b.pos,0,height);if(!overlaps(box,s))continue;hit=true;
  if(axis==='y')b.pos.y=delta>0?s.min.y-height-1e-4:s.max.y+1e-4;
  else{const half=HALF_WIDTH+1e-4;b.pos[axis]=delta>0?s.min[axis]-half:s.max[axis]+half;}
 }
 return hit;
}
/** Горизонтальный шаг с подъёмом на ступень высотой до STEP_HEIGHT. */
function walk(arena:Arena,b:Body,dx:number,dz:number){
 const start={...b.pos};const hitX=slide(arena,b,'x',dx),hitZ=slide(arena,b,'z',dz);
 if(!(hitX||hitZ)||!b.onGround)return {hitX,hitZ};
 const flat={...b.pos};b.pos={...start};
 if(blocked(arena,bodyBox(b.pos,STEP_HEIGHT,heightOf(b.crouch)))){b.pos=flat;return {hitX,hitZ};}
 b.pos.y+=STEP_HEIGHT;const upX=slide(arena,b,'x',dx),upZ=slide(arena,b,'z',dz);slide(arena,b,'y',-STEP_HEIGHT);
 const gained=(b.pos.x-start.x)**2+(b.pos.z-start.z)**2,flatGain=(flat.x-start.x)**2+(flat.z-start.z)**2;
 if(gained<=flatGain+1e-8){b.pos=flat;return {hitX,hitZ};}
 return {hitX:upX,hitZ:upZ};
}
function groundBelow(arena:Arena,p:Vec3,depth:number){
 const probe:Box={min:vec(p.x-HALF_WIDTH,p.y-depth,p.z-HALF_WIDTH),max:vec(p.x+HALF_WIDTH,p.y,p.z+HALF_WIDTH)};
 let top=-Infinity;for(const s of arena.solids)if(overlaps(probe,s)&&s.max.y<=p.y+1e-3)top=Math.max(top,s.max.y);
 return top;
}

/** Присед и вставание. Встать можно, только если над головой (или под ногами в воздухе) есть место. */
function updateCrouch(arena:Arena,b:Body,held:boolean,events:MoveEvents){
 if(held&&!b.crouch){
  b.crouch=true;
  if(!b.onGround){b.pos.y+=TUCK;events.tuck=TUCK;}
  return;
 }
 if(held||!b.crouch)return;
 if(!b.onGround){
  const lowered=vec(b.pos.x,b.pos.y-TUCK,b.pos.z);
  if(!blocked(arena,bodyBox(lowered,0,HEIGHT))){b.pos=lowered;b.crouch=false;events.tuck=-TUCK;b.slide=0;return;}
 }
 if(!blocked(arena,bodyBox(b.pos,0,HEIGHT))){b.crouch=false;b.slide=0;}
}

/** Один шаг движения TICK секунд. Детерминирован: одинаковый ввод даёт одинаковый результат на хосте и у гостя. */
export function stepBody(arena:Arena,b:Body,input:MoveInput,dt=TICK):MoveEvents{
 const events:MoveEvents={jumped:false,landed:0,pad:-1,lava:false,out:false,slide:false,tuck:0};
 const f=Math.max(-1,Math.min(1,input.forward)),s=Math.max(-1,Math.min(1,input.strafe));
 const sin=Math.sin(input.yaw),cos=Math.cos(input.yaw);
 let wx=-sin*f+cos*s,wz=-cos*f-sin*s;const len=Math.hypot(wx,wz);if(len>1e-6){wx/=len;wz/=len;}
 const held=!!input.crouch,pressed=held&&!b.crouchHeld;b.crouchHeld=held;
 if(pressed||!b.onGround)b.slideArmed=true;
 b.slideCooldown=Math.max(0,b.slideCooldown-dt);
 updateCrouch(arena,b,held,events);
 // Подкат начинается нажатием приседа на бегу или приземлением с зажатым приседом («слайд-хоп»).
 const speed=horizontalSpeed(b);
 if(b.onGround&&b.crouch&&b.slide<=0&&b.slideArmed&&b.slideCooldown<=0&&speed>=SLIDE_MIN_SPEED){
  const next=speed>=SLIDE_BOOST_CAP?speed:Math.min(SLIDE_BOOST_CAP,speed+SLIDE_BOOST);
  b.vel.x*=next/speed;b.vel.z*=next/speed;b.slide=SLIDE_TIME;b.slideCooldown=SLIDE_COOLDOWN;events.slide=true;
 }
 if(b.onGround)b.slideArmed=false;
 const leanAllowed=b.onGround&&b.slide<=0,leanTarget=leanAllowed?Math.sign(input.lean??0):0;
 const leanStep=dt/LEAN_TIME;b.lean=b.lean<leanTarget?Math.min(leanTarget,b.lean+leanStep):Math.max(leanTarget,b.lean-leanStep);
 const wish=len>1e-6?RUN_SPEED*(b.crouch?CROUCH_SPEED:1)*(leanTarget?LEAN_SPEED:1):0;
 if(b.onGround&&input.jump){b.vel.y=JUMP_SPEED;b.onGround=false;b.slide=0;events.jumped=true;}
 if(b.onGround&&b.slide>0){
  b.slide-=dt;const left=slideDrag(b.vel,dt);
  accelerate(b.vel,wx,wz,len>1e-6?RUN_SPEED:0,AIR_ACCEL,dt);
  if(b.slide<=0||left<SLIDE_END_SPEED)b.slide=0;
 }else if(b.onGround){friction(b.vel,dt);accelerate(b.vel,wx,wz,wish,GROUND_ACCEL,dt);}
 else accelerate(b.vel,wx,wz,len>1e-6?RUN_SPEED:0,AIR_ACCEL,dt);
 const wasGround=b.onGround;
 b.vel.y-=GRAVITY*dt;
 const {hitX,hitZ}=walk(arena,b,b.vel.x*dt,b.vel.z*dt);
 if(hitX)b.vel.x=0;if(hitZ)b.vel.z=0;
 const fall=b.vel.y;
 if(slide(arena,b,'y',b.vel.y*dt)){
  if(b.vel.y<0){if(!wasGround)events.landed=-fall;b.onGround=true;}
  b.vel.y=0;
 }else if(wasGround&&b.vel.y<=0&&!events.jumped){
  // Прилипание к полу при спуске по лестнице.
  const top=groundBelow(arena,b.pos,STEP_HEIGHT+.05);
  if(top>-Infinity){b.pos.y=top+1e-4;b.vel.y=0;b.onGround=true;}else b.onGround=false;
 }else b.onGround=false;
 if(b.onGround&&groundBelow(arena,b.pos,.02)===-Infinity)b.onGround=false;
 if(!b.onGround)b.slide=0;
 const box=bodyBox(b.pos,0,heightOf(b.crouch));
 arena.pads.forEach((pad,i)=>{if(events.pad<0&&overlaps(box,pad.box)){b.vel={...pad.launch};b.onGround=false;b.slide=0;events.pad=i;}});
 if(overlaps(box,arena.lava)||b.pos.y<arena.lavaY&&overlaps({min:{...arena.lava.min,y:-Infinity},max:arena.lava.max},box))events.lava=true;
 if(b.pos.y<arena.killY||Math.abs(b.pos.x)>arena.size||Math.abs(b.pos.z)>arena.size)events.out=true;
 return events;
}

/** Поза бойца, по которой считаются глаза и хитбоксы: у хоста — из присланной позы, у клиента — из тела. */
export type Posture={pos:Vec3;crouch:boolean;lean:number;yaw:number};

/** Насколько голова реально уходит вбок: наклон упирается в стену, сквозь неё не выглянуть. */
export function leanReach(arena:Arena,p:Posture){
 const amount=Math.abs(p.lean);if(amount<1e-3)return 0;
 const side=Math.sign(p.lean),r=rightOf(p.yaw),dir=vec(r.x*side,0,r.z*side);
 const origin=vec(p.pos.x,p.pos.y+heightOf(p.crouch)-HEAD_SIZE/2,p.pos.z);
 const wall=raycast(arena,origin,dir,LEAN_OFFSET+HEAD_SIZE).t;
 return side*Math.max(0,Math.min(LEAN_OFFSET*amount,wall-HEAD_SIZE/2-.02));
}
/** Центр головы с учётом стойки и наклона. */
export function headCenter(arena:Arena,p:Posture):Vec3{
 const reach=leanReach(arena,p),r=rightOf(p.yaw);
 return vec(p.pos.x+r.x*reach,p.pos.y+heightOf(p.crouch)-HEAD_SIZE/2-LEAN_DROP*Math.abs(p.lean),p.pos.z+r.z*reach);
}
/** Точка глаз — отсюда летят выстрелы и смотрит камера. */
export function eyePoint(arena:Arena,p:Posture):Vec3{const h=headCenter(arena,p);return vec(h.x,h.y-.05,h.z);}

export type Hitbox={box:Box;head:boolean};
/**
 * Хитбоксы бойца: ноги (на месте), корпус (сдвинут на половину наклона) и голова (сдвинута на весь наклон).
 * pad расширяет корпус и ноги — так попадать по быстрым соперникам чуть легче.
 */
export function hitboxes(arena:Arena,p:Posture,pad=0):Hitbox[]{
 const h=heightOf(p.crouch),head=headCenter(arena,p),waist=p.pos.y+h*.52,neck=head.y-HEAD_SIZE/2;
 const mid=vec((p.pos.x+head.x)/2,0,(p.pos.z+head.z)/2),w=HALF_WIDTH+pad,hs=HEAD_SIZE/2+pad*.5;
 return [
  {box:{min:vec(p.pos.x-w,p.pos.y,p.pos.z-w),max:vec(p.pos.x+w,waist,p.pos.z+w)},head:false},
  {box:{min:vec(mid.x-w,waist,mid.z-w),max:vec(mid.x+w,neck,mid.z+w)},head:false},
  {box:{min:vec(head.x-hs,neck,head.z-hs),max:vec(head.x+hs,head.y+HEAD_SIZE/2+pad*.5,head.z+hs)},head:true},
 ];
}
/** Луч по хитбоксам: ближайшее расстояние и было ли это попадание в голову. */
export function rayHitboxes(boxes:Hitbox[],o:Vec3,d:Vec3,maxT=Infinity){
 let t=maxT,head=false;for(const h of boxes){const hit=rayBox(o,d,h.box,t);if(hit<t){t=hit;head=h.head;}}
 return {t,head};
}
