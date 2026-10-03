import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArena,raycast,vec} from '../../games/spire/scripts/arena.ts';
import {stepBody,newBody,horizontalSpeed,WALK_SPEED,SPRINT_SPEED,TICK,type Body,type MoveInput} from '../../games/spire/scripts/physics.ts';

const scene=JSON.parse(readFileSync(new URL('../../games/spire/scenes/arena.scene.json',import.meta.url),'utf8'));
const arena=readArena(scene);
const idle:MoveInput={forward:0,strafe:0,jump:false,yaw:0};
function run(b:Body,seconds:number,input:MoveInput|((t:number,b:Body)=>MoveInput)=idle){
 const events=[];for(let i=0;i<Math.round(seconds/TICK);i++)events.push(stepBody(arena,b,typeof input==='function'?input(i*TICK,b):input));return events;
}
const settled=(x:number,y:number,z:number)=>{const b=newBody(vec(x,y+.5,z));run(b,.5);return b;};

test('арена читается: 12 точек появления, 4 прыжковые площадки, 23 бонуса',()=>{
 assert.equal(arena.spawns.length,12);assert.equal(arena.pads.length,4);assert.equal(arena.items.length,23);
 assert.equal(arena.items.filter(i=>i.kind==='mega').length,1);
});

test('каждая точка появления стоит на полу и не внутри блоков',()=>{
 for(const s of arena.spawns){const b=settled(s.pos.x,s.pos.y,s.pos.z);assert.ok(b.onGround,'в воздухе: '+JSON.stringify(s.pos));assert.ok(Math.abs(b.pos.y-s.pos.y)<.05,'провал: '+JSON.stringify(s.pos));}
});

test('шаг разгоняет до 6 м/с, бег с Shift — до 8,5 м/с, бег только вперёд',()=>{
 const walk=settled(0,0,17);run(walk,1.5,{forward:1,strafe:0,jump:false,yaw:Math.PI/2});
 const speed=horizontalSpeed(walk);assert.ok(speed>WALK_SPEED*.97&&speed<=WALK_SPEED+1e-6,'шаг '+speed);
 const sprint=settled(0,0,17);run(sprint,1.5,{forward:1,strafe:0,jump:false,yaw:Math.PI/2,sprint:true});
 assert.ok(Math.abs(horizontalSpeed(sprint)-SPRINT_SPEED)<.05&&sprint.sprint,'бег '+horizontalSpeed(sprint));
 const back=settled(0,0,17);run(back,1.5,{forward:-1,strafe:0,jump:false,yaw:-Math.PI/2,sprint:true});
 assert.ok(horizontalSpeed(back)<=WALK_SPEED+1e-6&&!back.sprint,'бег назад');
});

test('прыжок поднимает примерно на 1.2 м',()=>{
 const b=settled(14,0,5);let top=0;run(b,1,(t,body)=>{top=Math.max(top,body.pos.y);return {...idle,jump:t<.02};});
 assert.ok(top>1.1&&top<1.3,'высота '+top);assert.ok(b.onGround);
});

test('стена останавливает',()=>{
 const b=settled(-28,0,-6);run(b,2,{forward:1,strafe:0,jump:false,yaw:Math.PI/2});
 assert.ok(b.pos.x>-32+.3&&b.pos.x<-31.5,'x '+b.pos.x);
});

test('по лестнице можно подняться на кольцевые мостки',()=>{
 const b=settled(20,0,12);run(b,3,{forward:1,strafe:0,jump:false,yaw:Math.PI});
 assert.ok(b.pos.y>4.9&&b.onGround,'высота '+b.pos.y);assert.ok(b.pos.z>26);
});

test('стрейф-прыжки разгоняют быстрее бега',()=>{
 // Разгон — по южной галерее: длинный прямой коридор без укрытий. Идеальный стрейфер: держит только «вбок» и поворачивает мышь так, чтобы желаемое направление
 // было под оптимальным углом к скорости (cos θ = (V − a·V·dt) / |v|) — так работает разгон в Quake.
 const b=settled(-20,0,29);run(b,.6,{forward:1,strafe:0,jump:false,yaw:-Math.PI/2});
 run(b,2,(t,body)=>{
  const speed=Math.hypot(body.vel.x,body.vel.z),phi=Math.atan2(body.vel.x,body.vel.z);
  const theta=Math.acos(Math.max(-1,Math.min(1,(WALK_SPEED-WALK_SPEED*TICK)/Math.max(speed,1e-6))));
  const wish=phi-Math.sign(Math.sin(t*1.2*Math.PI)||1)*theta,wx=Math.sin(wish),wz=Math.cos(wish);
  return {forward:0,strafe:1,jump:true,yaw:Math.atan2(-wz,wx)};
 });
 assert.ok(horizontalSpeed(b)>WALK_SPEED*1.15,'скорость '+horizontalSpeed(b));
});

test('прыжковые площадки приводят в цель',()=>{
 for(const pad of arena.pads){
  const b=newBody(vec(pad.center.x,pad.center.y+.05,pad.center.z));b.onGround=true;
  run(b,3);
  const d=Math.hypot(b.pos.x-pad.target.x,b.pos.z-pad.target.z);
  assert.ok(d<3.5&&Math.abs(b.pos.y-pad.target.y)<.1&&b.onGround,`площадка → ${JSON.stringify(b.pos)} вместо ${JSON.stringify(pad.target)}`);
 }
});

test('падение в лаву и с моста фиксируется',()=>{
 const b=settled(0,0,0);const events=run(b,2,{forward:1,strafe:0,jump:false,yaw:0});
 assert.ok(events.some(e=>e.lava),'лава не обнаружена');
});

test('луч упирается в стену арены',()=>{
 const hit=raycast(arena,vec(0,1.5,15),vec(0,0,1));assert.ok(Math.abs(hit.t-17)<.01,'t '+hit.t);assert.deepEqual(hit.normal,vec(0,0,-1));
});
