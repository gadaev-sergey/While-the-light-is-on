import {GRAVITY,overlaps,vec,type Arena,type Box,type Vec3} from './arena.ts';

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
export const EYE_HEIGHT=1.55;
export const TICK=1/120;

/** Тело игрока: pos — точка между ступнями. */
export type Body={pos:Vec3;vel:Vec3;onGround:boolean};
/** forward/strafe — от -1 до 1; yaw — поворот головы (0 — взгляд вдоль -Z). */
export type MoveInput={forward:number;strafe:number;jump:boolean;yaw:number};
export type MoveEvents={jumped:boolean;landed:number;pad:number;lava:boolean;out:boolean};

export const newBody=(pos:Vec3):Body=>({pos:{...pos},vel:vec(),onGround:false});
export const bodyBox=(p:Vec3,lift=0):Box=>({min:vec(p.x-HALF_WIDTH,p.y+lift,p.z-HALF_WIDTH),max:vec(p.x+HALF_WIDTH,p.y+lift+HEIGHT,p.z+HALF_WIDTH)});
export const forwardOf=(yaw:number,pitch=0):Vec3=>vec(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
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

/** Сдвиг по одной оси с упором в блоки. Возвращает true, если упёрлись. */
function slide(arena:Arena,b:Body,axis:'x'|'y'|'z',delta:number){
 if(delta===0)return false;b.pos[axis]+=delta;
 let hit=false;
 for(const s of arena.solids){
  const box=bodyBox(b.pos);if(!overlaps(box,s))continue;hit=true;
  if(axis==='y')b.pos.y=delta>0?s.min.y-HEIGHT-1e-4:s.max.y+1e-4;
  else{const half=HALF_WIDTH+1e-4;b.pos[axis]=delta>0?s.min[axis]-half:s.max[axis]+half;}
 }
 return hit;
}
/** Горизонтальный шаг с подъёмом на ступень высотой до STEP_HEIGHT. */
function walk(arena:Arena,b:Body,dx:number,dz:number){
 const start={...b.pos};const hitX=slide(arena,b,'x',dx),hitZ=slide(arena,b,'z',dz);
 if(!(hitX||hitZ)||!b.onGround)return {hitX,hitZ};
 const flat={...b.pos};b.pos={...start};
 if(blocked(arena,bodyBox(b.pos,STEP_HEIGHT))){b.pos=flat;return {hitX,hitZ};}
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

/** Один шаг движения TICK секунд. Детерминирован: одинаковый ввод даёт одинаковый результат на хосте и у гостя. */
export function stepBody(arena:Arena,b:Body,input:MoveInput,dt=TICK):MoveEvents{
 const events:MoveEvents={jumped:false,landed:0,pad:-1,lava:false,out:false};
 const f=Math.max(-1,Math.min(1,input.forward)),s=Math.max(-1,Math.min(1,input.strafe));
 const sin=Math.sin(input.yaw),cos=Math.cos(input.yaw);
 let wx=-sin*f+cos*s,wz=-cos*f-sin*s;const len=Math.hypot(wx,wz);if(len>1e-6){wx/=len;wz/=len;}
 const wish=len>1e-6?RUN_SPEED:0;
 if(b.onGround&&input.jump){b.vel.y=JUMP_SPEED;b.onGround=false;events.jumped=true;}
 if(b.onGround){friction(b.vel,dt);accelerate(b.vel,wx,wz,wish,GROUND_ACCEL,dt);}
 else accelerate(b.vel,wx,wz,wish,AIR_ACCEL,dt);
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
 const box=bodyBox(b.pos);
 arena.pads.forEach((pad,i)=>{if(events.pad<0&&overlaps(box,pad.box)){b.vel={...pad.launch};b.onGround=false;events.pad=i;}});
 if(overlaps(box,arena.lava)||b.pos.y<arena.lavaY&&overlaps({min:{...arena.lava.min,y:-Infinity},max:arena.lava.max},box))events.lava=true;
 if(b.pos.y<arena.killY||Math.abs(b.pos.x)>arena.size||Math.abs(b.pos.z)>arena.size)events.out=true;
 return events;
}
