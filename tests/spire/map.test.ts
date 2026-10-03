import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArena,raycast,vec,type Vec3} from '../../games/spire/scripts/arena.ts';
import {stepBody,newBody,TICK,type Body,type MoveInput} from '../../games/spire/scripts/physics.ts';
import {HostGame,type HostPlayer} from '../../games/spire/scripts/host.ts';
import {MAX_PLAYERS,BLASTER} from '../../games/spire/scripts/rules.ts';
import type {V3} from '../../games/spire/scripts/protocol.ts';

const arena=readArena(JSON.parse(readFileSync(new URL('../../games/spire/scenes/arena.scene.json',import.meta.url),'utf8')));
// Направления взгляда: yaw = 0 смотрит в −Z.
const NORTH=0,SOUTH=Math.PI,EAST=-Math.PI/2,WEST=Math.PI/2;
const go=(yaw:number,extra:Partial<MoveInput>={}):MoveInput=>({forward:1,strafe:0,jump:false,yaw,...extra});
function walk(from:Vec3,seconds:number,input:MoveInput){
 const b:Body=newBody(vec(from.x,from.y+.3,from.z));for(let i=0;i<60;i++)stepBody(arena,b,{...input,forward:0});
 for(let i=0;i<Math.round(seconds/TICK);i++)stepBody(arena,b,input);return b;
}

test('лаз в боковой галерее: стоя не пройти, в приседе — проходишь',()=>{
 const standing=walk(vec(29,0,-4),2,go(SOUTH));assert.ok(standing.pos.z<-.5,'прошёл стоя: z '+standing.pos.z);
 const crouched=walk(vec(29,0,-4),3,go(SOUTH,{crouch:true}));assert.ok(crouched.pos.z>2,'не пролез в приседе: z '+crouched.pos.z);
});

test('в гнездо ведёт лестница с северных мостков',()=>{
 const b=walk(vec(17.6,5,-31.1),4,go(WEST));
 assert.ok(Math.abs(b.pos.y-14)<.05&&b.pos.x<5.5&&b.onGround,`не поднялся: ${JSON.stringify(b.pos)}`);
});

test('будка: в дверь проходишь, в окно — нет',()=>{
 const door=walk(vec(20,5,29.2),2,go(EAST));assert.ok(door.pos.x>28,'не прошёл в дверь: x '+door.pos.x);
 const window=walk(vec(20,5,27.4),2,go(EAST));assert.ok(window.pos.x<26.1,'прошёл сквозь окно: x '+window.pos.x);
 const roof=raycast(arena,vec(29,6,29),vec(0,1,0),5).t;assert.ok(roof<2,'у будки нет крыши');
});

test('парапет вершины держит у края и пропускает в разрыве',()=>{
 const edge=walk(vec(3,10,3),2,go(EAST));assert.ok(edge.pos.x<5.4&&edge.pos.y>9.9,'перелез через парапет: '+JSON.stringify(edge.pos));
 const gap=walk(vec(3,10,0),1.5,go(EAST));assert.ok(gap.pos.x>7||gap.pos.y<9,'разрыв закрыт: '+JSON.stringify(gap.pos));
});

test('стена галереи с проёмами: в проём выходишь в галерею, в стену — упираешься',()=>{
 const wall=walk(vec(20,0,0),2,go(EAST));assert.ok(wall.pos.x<25.3,'прошёл сквозь стену: x '+wall.pos.x);
 const opening=walk(vec(20,0,7.5),2,go(EAST));assert.ok(opening.pos.x>27,'проём закрыт: x '+opening.pos.x);
});

test('снайпер в гнезде: стоя у парапета открыт снизу, присевший — укрыт',()=>{
 const options={name:'Тест',fragLimit:10,timeLimit:600,maxPlayers:MAX_PLAYERS,closed:false};let seq=0;
 const g=new HostGame(arena,options,()=>.5);const sniper=g.join('s','Снайпер') as HostPlayer,below=g.join('b','Внизу') as HostPlayer;g.step(1/60);
 const pose=(p:HostPlayer,at:Vec3,s:0|1=0)=>{p.pos={...at};g.pose(p.id,{k:'pose',life:p.life,p:[at.x,at.y,at.z],v:[0,0,0],yaw:0,pitch:0,w:0,s});};
 const shoot=(from:HostPlayer,eyeY:number,at:Vec3)=>{
  g.time+=.5;const o:V3=[from.pos.x,from.pos.y+eyeY,from.pos.z],d=[at.x-o[0],at.y-o[1],at.z-o[2]],l=Math.hypot(...d);
  g.fire(from.id,{k:'fire',w:BLASTER,o,d:[d[0]/l,d[1]/l,d[2]/l],seed:1,lag:0,seq:++seq});return g.drain().some(e=>e.e==='hit');
 };
 pose(sniper,vec(0,14,-24.65));pose(below,vec(0,0,11));g.drain();
 assert.ok(shoot(below,1.55,vec(0,15.6,-24.65)),'стоящего у парапета не задеть снизу');
 assert.ok(shoot(sniper,1.55,vec(0,1.2,11)),'снайпер не попадает вниз');
 pose(sniper,sniper.pos,1);
 for(const y of [14.9,15.05,15.17])assert.ok(!shoot(below,1.55,vec(0,y,-24.65)),'присевший задет на высоте '+y);
});
