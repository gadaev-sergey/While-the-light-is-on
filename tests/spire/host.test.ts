import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArena,vec,type Vec3} from '../../games/spire/scripts/arena.ts';
import {HostGame,type HostPlayer} from '../../games/spire/scripts/host.ts';
import {EYE_HEIGHT} from '../../games/spire/scripts/physics.ts';
import {MAX_PLAYERS,INTERMISSION,RESPAWN_DELAY,applyItem,freshLoadout,soleLeader,uniqueName,type WeaponId} from '../../games/spire/scripts/rules.ts';
import type {GameEvent,V3} from '../../games/spire/scripts/protocol.ts';

const arena=readArena(JSON.parse(readFileSync(new URL('../../games/spire/scenes/arena.scene.json',import.meta.url),'utf8')));
const options={name:'Тест',fragLimit:3,timeLimit:600,maxPlayers:MAX_PLAYERS,closed:false};
function seeded(seed=7){return ()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function game(opts={}){const g=new HostGame(arena,{...options,...opts},seeded());return g;}
const tick=(g:HostGame,seconds:number)=>{for(let i=0;i<Math.round(seconds*60);i++)g.step(1/60);};
function place(g:HostGame,p:HostPlayer,pos:Vec3){p.pos={...pos};g.pose(p.id,{k:'pose',life:p.life,p:[pos.x,pos.y,pos.z],v:[0,0,0],yaw:0,pitch:0,w:p.weapon});g.step(1/60);}
const eye=(p:HostPlayer):V3=>[p.pos.x,p.pos.y+EYE_HEIGHT,p.pos.z];
let seq=0;
function shoot(g:HostGame,from:HostPlayer,at:Vec3,w:WeaponId=0,lag=0,advance=true){
 const o=eye(from),d:V3=[at.x-o[0],at.y-o[1],at.z-o[2]],l=Math.hypot(...d);
 if(advance)g.time+=1.1;g.fire(from.id,{k:'fire',w,o,d:[d[0]/l,d[1]/l,d[2]/l],seed:5,lag,seq:++seq});
}
const kills=(events:GameEvent[])=>events.filter(e=>e.e==='kill');
/** Два бойца лицом к лицу в открытом нижнем зале. */
function duel(opts={}){
 const g=game(opts);const a=g.join('a','Аня') as HostPlayer,b=g.join('b','Боря') as HostPlayer;g.step(1/60);
 place(g,a,vec(-14,0,-12));place(g,b,vec(-4,0,-12));g.drain();return {g,a,b};
}
const chest=(p:HostPlayer)=>vec(p.pos.x,p.pos.y+1.2,p.pos.z);

test('новый игрок появляется сразу, с бластером и 100 здоровья',()=>{
 const g=game();const a=g.join('a','Аня') as HostPlayer;g.step(1/60);
 assert.ok(a.alive);assert.equal(a.loadout.health,100);assert.deepEqual(a.loadout.owned,[true,false,false,false,false]);
 assert.ok(g.drain().some(e=>e.e==='spawn'&&e.id==='a'));
});

test('бластер убивает за 13 попаданий и даёт фраг',()=>{
 const {g,a,b}=duel();
 for(let i=0;i<13;i++)shoot(g,a,chest(b));
 assert.equal(b.alive,false);assert.equal(a.frags,1);assert.equal(b.deaths,1);
 assert.deepEqual(kills(g.drain()).map(e=>[e.killer,e.victim,e.w]),[['a','b',0]]);
});

test('стена закрывает от выстрела',()=>{
 const {g,a,b}=duel();place(g,b,vec(-20,0,-29));place(g,a,vec(-20,5.01,-29));
 shoot(g,a,chest(b));assert.equal(b.loadout.health,100);
});

test('респаун через 2 секунды с полным здоровьем',()=>{
 const {g,a,b}=duel();for(let i=0;i<13;i++)shoot(g,a,chest(b));
 tick(g,RESPAWN_DELAY-.1);assert.equal(b.alive,false);tick(g,.2);assert.ok(b.alive);assert.equal(b.loadout.health,100);
});

test('лава — самоубийство: −1 фраг, счёт может уйти в минус',()=>{
 const {g,b}=duel();b.pos=vec(3,0,3);g.pose('b',{k:'pose',life:b.life,p:[3,-2.2,3],v:[0,-5,0],yaw:0,pitch:0,w:0});
 assert.equal(b.frags,-1);assert.deepEqual(kills(g.drain()).map(e=>[e.killer,e.victim,e.w]),[['b','b','lava']]);
});

test('поза из прошлой жизни отбрасывается',()=>{
 const {g,a,b}=duel();const old=b.life;for(let i=0;i<13;i++)shoot(g,a,chest(b));tick(g,2.2);
 const before={...b.pos};g.pose('b',{k:'pose',life:old,p:[before.x+1,before.y,before.z],v:[0,0,0],yaw:0,pitch:0,w:0});
 assert.deepEqual(b.pos,before);
});

test('ракета по ногам ранит стрелка вдвое слабее и подбрасывает',()=>{
 const {g,a}=duel();a.loadout.owned[4]=true;a.loadout.ammo[4]=5;
 shoot(g,a,vec(a.pos.x,0,a.pos.z-.6),4);tick(g,.3);
 const hurt=g.drain().find(e=>e.e==='hurt'&&e.to==='a');assert.ok(hurt&&hurt.e==='hurt');
 assert.ok(hurt.amount>20&&hurt.amount<=46,'урон '+hurt.amount);assert.ok(hurt.knock[1]>4,'подброс '+hurt.knock[1]);
 assert.equal(a.loadout.ammo[4],4);
});

test('прямое попадание ракетой — 100 урона',()=>{
 const {g,a,b}=duel();a.loadout.owned[4]=true;a.loadout.ammo[4]=5;b.loadout.armor=0;
 shoot(g,a,chest(b),4);tick(g,1);assert.equal(b.alive,false);assert.equal(a.frags,1);
});

test('нельзя стрелять из оружия, которого нет, и чаще темпа',()=>{
 const {g,a,b}=duel();shoot(g,a,chest(b),1);assert.equal(b.loadout.health,100);
 const o=eye(a),l=Math.hypot(10,.35),d:V3=[10/l,-.35/l,0];for(let i=0;i<10;i++)g.fire('a',{k:'fire',w:0,o,d,seed:1,lag:0,seq:++seq});
 assert.equal(b.loadout.health,92);
});

test('компенсация задержки: попадание по месту, где соперник был 150 мс назад, но не 400 мс',()=>{
 // Боря бежит со скоростью 6 м/с; стрелок целится туда, где видел его с задержкой.
 const run=()=>{const {g,a,b}=duel();tick(g,.5);for(let i=0;i<30;i++){g.pose('b',{k:'pose',life:b.life,p:[-4,0,-12+i*.1],v:[0,0,6],yaw:0,pitch:0,w:0});g.step(1/60);}return {g,a,b};};
 const near=run();shoot(near.g,near.a,vec(-4,1.2,-9.1-.9),0,.15,false);
 assert.ok(near.b.loadout.health<100,'не засчитано попадание с задержкой 150 мс');
 const far=run();shoot(far.g,far.a,vec(-4,1.2,-9.1-2.4),0,.4,false);
 assert.equal(far.b.loadout.health,100,'засчитано попадание глубже 200 мс');
 const none=run();shoot(none.g,none.a,vec(-4,1.2,-9.1-.9),0,0,false);
 assert.equal(none.b.loadout.health,100,'без компенсации попадание по старому месту не должно засчитываться');
});

test('лимит фрагов завершает матч, через 10 секунд новый матч с нуля',()=>{
 const {g,a,b}=duel();
 for(let k=0;k<3;k++){tick(g,2.2);place(g,b,vec(-10,0,-12));for(let i=0;i<13;i++)shoot(g,a,chest(b));}
 assert.equal(g.phase,'over');assert.equal(g.winner,'a');
 tick(g,INTERMISSION+.1);assert.equal(g.phase,'playing');assert.equal(a.frags,0);assert.equal(b.frags,0);assert.ok(a.alive&&b.alive);
});

test('время вышло при ничьей — внезапная смерть до единоличного лидера',()=>{
 const {g,a,b}=duel({timeLimit:5});tick(g,6);assert.equal(g.phase,'sudden');
 for(let i=0;i<13;i++)shoot(g,a,chest(b));assert.equal(g.phase,'over');assert.equal(g.winner,'a');
});

test('время вышло при едином лидере — он побеждает',()=>{
 const {g,a,b}=duel({timeLimit:30});for(let i=0;i<13;i++)shoot(g,b,chest(a));tick(g,30-g.time+.1);
 assert.equal(g.phase,'over');assert.equal(g.winner,'b');
});

test('вход посреди матча с нулём фрагов; девятый игрок не помещается',()=>{
 const {g,a,b}=duel();for(let i=0;i<13;i++)shoot(g,a,chest(b));
 const c=g.join('c','Вика') as HostPlayer;assert.equal(c.frags,0);
 for(let i=0;i<5;i++)g.join('x'+i,'Гость');assert.equal(g.players.size,8);assert.equal(g.join('late','Опоздал'),'full');
});

test('повтор ника получает суффикс, у каждого свой цвет',()=>{
 const g=game();const p1=g.join('1','Боец') as HostPlayer,p2=g.join('2','Боец') as HostPlayer;
 assert.equal(p2.name,'Боец (2)');assert.notEqual(p1.color,p2.color);assert.equal(uniqueName('  <b>  ',[]),'b');
});

test('бонусы: аптечка не берётся при полном здоровье, мега-бонус сгорает до 100',()=>{
 const l=freshLoadout();assert.equal(applyItem(l,'health'),false);assert.equal(applyItem(l,'mega'),true);assert.equal(l.health,200);
 const g=game();const a=g.join('a','Аня') as HostPlayer;g.step(1/60);place(g,a,vec(0,10,0));
 assert.ok(a.loadout.health>190);place(g,a,vec(3,10,3));const megaIndex=arena.items.findIndex(i=>i.kind==='mega');
 assert.equal(g.snapshot().items[megaIndex],'0');tick(g,30);assert.equal(g.snapshot().items[megaIndex],'1');
 assert.ok(a.loadout.health<=171&&a.loadout.health>=100,'здоровье '+a.loadout.health);
});

test('уход игрока убирает его из таблицы и не ломает матч',()=>{
 const {g,a}=duel();g.leave('b');tick(g,1);assert.equal(g.snapshot().players.length,1);assert.ok(a.alive);
});

test('единоличный лидер',()=>{
 assert.equal(soleLeader([{id:'a',frags:2},{id:'b',frags:2}]),undefined);assert.equal(soleLeader([{id:'a',frags:1},{id:'b',frags:2}]),'b');
});
