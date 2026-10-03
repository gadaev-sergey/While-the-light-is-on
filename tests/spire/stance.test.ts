import test from 'node:test';
import assert from 'node:assert/strict';
import {vec,type Arena,type Solid,type Vec3} from '../../games/spire/scripts/arena.ts';
import {stepBody,newBody,horizontalSpeed,headCenter,leanReach,stanceOf,TICK,CROUCH_HEIGHT,WALK_SPEED,SPRINT_SPEED,CROUCH_SPEED,LEAN_SPEED,LEAN_OFFSET,SLIDE_BOOST_CAP,
 type Body,type MoveInput,type MoveEvents} from '../../games/spire/scripts/physics.ts';
import {HostGame,type HostPlayer} from '../../games/spire/scripts/host.ts';
import {MAX_PLAYERS} from '../../games/spire/scripts/rules.ts';
import type {V3} from '../../games/spire/scripts/protocol.ts';

/** Испытательная площадка: ровный пол и заданные блоки. */
function ground(...blocks:[[number,number],[number,number],[number,number]][]):Arena{
 const solid=([x0,x1]:[number,number],[y0,y1]:[number,number],[z0,z1]:[number,number]):Solid=>({min:vec(x0,y0,z0),max:vec(x1,y1,z1),style:'crate'});
 return {size:40,lavaY:-50,killY:-60,lava:{min:vec(-1,-55,-1),max:vec(1,-54,1)},pads:[],items:[],decor:[],
  spawns:Array.from({length:8},(_,i)=>({pos:vec(15,0,-15+i),yaw:0})),solids:[solid([-30,30],[-1,0],[-30,30]),...blocks.map(b=>solid(...b))]};
}
const NORTH=0,EAST=-Math.PI/2;
const idle:MoveInput={forward:0,strafe:0,jump:false,yaw:NORTH};
function run(arena:Arena,b:Body,seconds:number,input:MoveInput|((t:number,b:Body)=>MoveInput)=idle){
 const events:MoveEvents[]=[];for(let i=0;i<Math.round(seconds/TICK);i++)events.push(stepBody(arena,b,typeof input==='function'?input(i*TICK,b):input));return events;
}
const standing=(arena:Arena,x:number,z:number)=>{const b=newBody(vec(x,.2,z));run(arena,b,.3);return b;};
const sprint:MoveInput={...idle,forward:1,sprint:true};
const runner=(arena:Arena)=>{const b=standing(arena,0,20);run(arena,b,1,sprint);return b;};

test('присед: рост 1,15 м и вдвое медленнее шаг',()=>{
 const arena=ground(),b=standing(arena,0,0);run(arena,b,1.5,{...idle,forward:1,crouch:true});
 assert.ok(b.crouch);assert.equal(stanceOf(b),1);
 assert.ok(Math.abs(horizontalSpeed(b)-WALK_SPEED*CROUCH_SPEED)<.05,'скорость '+horizontalSpeed(b));
 assert.ok(Math.abs(headCenter(arena,{pos:b.pos,crouch:true,lean:0,yaw:0}).y-b.pos.y-(CROUCH_HEIGHT-.15))<1e-6);
});

test('под низким потолком встать нельзя, на открытом месте — можно',()=>{
 const arena=ground([[-2,2],[1.3,2],[-2,2]]),b=newBody(vec(0,0,0));b.crouch=true;b.crouchHeld=true;b.onGround=true;
 run(arena,b,.3);assert.ok(b.crouch,'встал под потолком');
 run(arena,b,1.5,{...idle,forward:1,yaw:EAST});assert.ok(b.pos.x>2.4,'не выехал из-под потолка: x '+b.pos.x);assert.equal(b.crouch,false);
});

test('присед в прыжке поджимает ноги: ящик 1,4 м берётся только так',()=>{
 const landing=(tuck:boolean)=>{
  const arena=ground([[3,12],[0,1.4],[-2,2]]),b=standing(arena,-5,0);let jumpedAt=-1;
  run(arena,b,2,(t,body)=>{
   if(jumpedAt<0&&body.pos.x>=.5)jumpedAt=t;
   return {...idle,yaw:EAST,forward:1,jump:jumpedAt>=0&&t-jumpedAt<.02,crouch:tuck&&jumpedAt>=0&&t-jumpedAt>.05};
  });
  return b;
 };
 const plain=landing(false);assert.ok(plain.pos.y<.1,'запрыгнул без приседа: y '+plain.pos.y);
 const tucked=landing(true);assert.ok(Math.abs(tucked.pos.y-1.4)<.05&&tucked.onGround,'не запрыгнул с приседом: y '+tucked.pos.y);
});

test('подкат — только с бега: шагом Ctrl даёт присед, на бегу — рывок до 10 м/с на 0,8 с',()=>{
 const arena=ground();
 const walker=standing(arena,0,20);run(arena,walker,1,{...idle,forward:1});assert.ok(Math.abs(horizontalSpeed(walker)-WALK_SPEED)<.05);
 assert.ok(!run(arena,walker,.3,{...idle,forward:1,crouch:true}).some(e=>e.slide),'подкат шагом');assert.equal(stanceOf(walker),1);
 const b=runner(arena);const before=horizontalSpeed(b);assert.ok(Math.abs(before-SPRINT_SPEED)<.05,'бег '+before);
 const [first]=run(arena,b,TICK,{...sprint,crouch:true});
 assert.ok(first.slide);assert.equal(stanceOf(b),2);
 assert.ok(Math.abs(horizontalSpeed(b)-Math.min(SLIDE_BOOST_CAP,before+2))<.1,'скорость '+horizontalSpeed(b));
 run(arena,b,.8,{...sprint,crouch:true});assert.equal(stanceOf(b),1,'подкат не закончился');
});

test('отпущенный присед подкат не прерывает, прыжок — прерывает',()=>{
 const arena=ground(),b=runner(arena);
 assert.ok(run(arena,b,TICK,{...sprint,crouch:true})[0].slide);
 run(arena,b,.4,sprint);assert.equal(stanceOf(b),2,'подкат прервался без приседа');
 const [jump]=run(arena,b,TICK,{...sprint,jump:true});assert.ok(jump.jumped);assert.equal(b.slide,0);assert.equal(b.onGround,false);
 run(arena,b,1,sprint);assert.equal(stanceOf(b),0,'после подката не встал');
});

test('рывок подката — не чаще раза в секунду',()=>{
 const arena=ground(),b=runner(arena);
 assert.ok(run(arena,b,TICK,{...sprint,crouch:true})[0].slide);
 run(arena,b,.1,(t)=>({...sprint,jump:t<TICK}));
 let landed=false;for(let i=0;i<120&&!landed;i++)landed=run(arena,b,TICK,sprint)[0].landed>0;assert.ok(landed,'не приземлился');
 // Приземление примерно через 0,8 с после рывка — перезарядка ещё идёт.
 const again=run(arena,b,.05,{...sprint,crouch:true});
 assert.ok(!again.some(e=>e.slide),'второй рывок раньше секунды');
});

test('слайд-хоп: прыжок сохраняет скорость, новый подкат — только по нажатию Ctrl в воздухе',()=>{
 const hop=(press:boolean)=>{
  const arena=ground(),b=runner(arena);run(arena,b,.5,{...sprint,crouch:true});const speed=horizontalSpeed(b);
  const air=run(arena,b,1.2,(t)=>({...sprint,jump:t<TICK,crouch:press?t<TICK||t>.25:true}));
  const landed=air.findIndex(e=>e.landed>0);assert.ok(landed>0,'не приземлился');
  return {speed,slid:air.slice(landed).some(e=>e.slide),before:air.slice(0,landed).some(e=>e.slide),airborne:horizontalSpeed(b)};
 };
 const held=hop(false);assert.ok(!held.slid,'подкат без нового нажатия');assert.ok(held.speed>=SPRINT_SPEED-.05,'скорость в подкате '+held.speed);
 const pressed=hop(true);assert.ok(pressed.slid,'нажатие в воздухе не дало подката');assert.ok(!pressed.before);
});

test('наклон: голова уходит на 0,45 м, шаг медленнее, в воздухе наклон снимается',()=>{
 const arena=ground(),b=standing(arena,0,0);
 run(arena,b,.3,{...idle,lean:1});assert.equal(b.lean,1);
 const head=headCenter(arena,{pos:b.pos,crouch:false,lean:b.lean,yaw:NORTH});assert.ok(Math.abs(head.x-b.pos.x-LEAN_OFFSET)<1e-6,'x '+head.x);
 run(arena,b,1.5,{...idle,lean:-1,forward:1});assert.equal(b.lean,-1);
 assert.ok(Math.abs(horizontalSpeed(b)-WALK_SPEED*LEAN_SPEED)<.05,'скорость '+horizontalSpeed(b));
 run(arena,b,.2,{...idle,lean:-1,jump:true});assert.ok(!b.onGround);assert.ok(Math.abs(b.lean)<.01,'наклон в воздухе '+b.lean);
});

test('наклон упирается в стену: сквозь неё не выглянуть',()=>{
 const arena=ground([[.5,2],[0,3],[-2,2]]);
 const reach=leanReach(arena,{pos:vec(0,0,0),crouch:false,lean:1,yaw:NORTH});assert.ok(Math.abs(reach-.33)<1e-6,'вылет '+reach);
 assert.equal(leanReach(arena,{pos:vec(0,0,0),crouch:false,lean:-1,yaw:NORTH}),-LEAN_OFFSET);
});

// --- Хитбоксы на хосте ---
const options={name:'Тест',fragLimit:10,timeLimit:600,maxPlayers:MAX_PLAYERS,closed:false};
let seq=0;
function duel(arena:Arena,a:Vec3,b:Vec3){
 const g=new HostGame(arena,options,()=>.5);const pa=g.join('a','Аня') as HostPlayer,pb=g.join('b','Боря') as HostPlayer;g.step(1/60);
 pose(g,pa,a);pose(g,pb,b);g.drain();return {g,a:pa,b:pb};
}
function pose(g:HostGame,p:HostPlayer,at:Vec3,s:0|1|2=0,l=0){p.pos={...at};g.pose(p.id,{k:'pose',life:p.life,p:[at.x,at.y,at.z],v:[0,0,0],yaw:0,pitch:0,w:0,s,l});}
/** Выстрел из бластера из глаз стрелка в точку. */
function shoot(g:HostGame,from:HostPlayer,at:Vec3,lag=0,advance=true){
 const o:V3=[from.pos.x,from.pos.y+1.55,from.pos.z],d=[at.x-o[0],at.y-o[1],at.z-o[2]],l=Math.hypot(...d);
 if(advance)g.time+=.2;g.fire(from.id,{k:'fire',w:0,o,d:[d[0]/l,d[1]/l,d[2]/l],seed:1,lag,seq:++seq});
 return g.drain().some(e=>e.e==='hit');
}

test('присевший соперник ниже линии огня по голове стоящего',()=>{
 const {g,a,b}=duel(ground(),vec(5,0,-5),vec(5,0,5));
 assert.ok(shoot(g,a,vec(5,1.6,5)),'стоящий не задет');
 pose(g,b,b.pos,1);assert.ok(!shoot(g,a,vec(5,1.6,5)),'присевший задет над головой');
 assert.ok(shoot(g,a,vec(5,.9,5)),'присевший не задет в корпус');
 assert.deepEqual(g.snapshot().players.find(p=>p[0]==='b')!.slice(17),[1,0,0]);
});

test('из-за угла с наклоном открыта голова, без наклона — ничего',()=>{
 // Стена x ∈ [−5, 0] между стрелком (север) и Борей; Боря стоит за её краем и смотрит на стрелка.
 const arena=ground([[-5,0],[0,4],[0,1]]),{g,a,b}=duel(arena,vec(.1,0,-10),vec(-.5,0,2));
 const head=vec(.1,1.54,2),legs=vec(.1,.5,2);
 assert.ok(!shoot(g,a,head),'без наклона попал в голову');assert.ok(!shoot(g,a,legs));
 pose(g,b,b.pos,0,1);
 assert.ok(shoot(g,a,head),'голова в наклоне не задета');assert.ok(!shoot(g,a,legs),'ноги за стеной задеты');
});

test('компенсация задержки помнит стойку: 150 мс назад соперник сидел',()=>{
 const {g,a,b}=duel(ground(),vec(5,0,-5),vec(5,0,5));
 for(let i=0;i<30;i++){pose(g,b,b.pos,1);g.step(1/60);}
 for(let i=0;i<6;i++){pose(g,b,b.pos,0);g.step(1/60);}
 assert.ok(!shoot(g,a,vec(5,1.6,5),.15,false),'попадание над головой сидевшего');
 assert.ok(shoot(g,a,vec(5,1.6,5),0));
});

test('точка выстрела из-за стены заменяется глазами стрелка',()=>{
 // Стрелок прячется за стеной и присылает точку выстрела по ту сторону — хост стреляет из его глаз, в стену.
 const arena=ground([[-3,3],[0,4],[0,1]]),{g,a,b}=duel(arena,vec(0,0,-1),vec(0,0,6));
 const o:V3=[0,1.55,1.5];g.time+=.2;g.fire('a',{k:'fire',w:0,o,d:[0,0,1],seed:1,lag:0,seq:++seq});
 assert.ok(!g.drain().some(e=>e.e==='hit'));assert.equal(b.loadout.health,100);
});
