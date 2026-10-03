import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArena,vec,type Vec3} from '../../games/spire/scripts/arena.ts';
import {HostGame,pelletDirections,aimedDirection,type HostPlayer} from '../../games/spire/scripts/host.ts';
import {MAX_PLAYERS,WEAPONS,BLASTER,SHOTGUN,AUTO,RIFLE,ROCKET,HEAT_PER_SHOT,applyItem,freshLoadout,spreadOf,recoilOf,reloadMagazine,
 type WeaponId} from '../../games/spire/scripts/rules.ts';
import type {V3} from '../../games/spire/scripts/protocol.ts';

const arena=readArena(JSON.parse(readFileSync(new URL('../../games/spire/scenes/arena.scene.json',import.meta.url),'utf8')));
const options={name:'Тест',fragLimit:30,timeLimit:600,maxPlayers:MAX_PLAYERS,closed:false};
let seq=0;
function duel(){
 const g=new HostGame(arena,options,()=>.5);const a=g.join('a','Аня') as HostPlayer,b=g.join('b','Боря') as HostPlayer;g.step(1/60);
 for(const [p,at] of [[a,vec(-14,0,-12)],[b,vec(-4,0,-12)]] as const){p.pos={...at};g.pose(p.id,{k:'pose',life:p.life,p:[at.x,at.y,at.z],v:[0,0,0],yaw:0,pitch:0,w:p.weapon});}
 g.drain();return {g,a,b};
}
function arm(g:HostGame,p:HostPlayer,w:WeaponId){
 const kind=({1:'shotgun',2:'auto',3:'rifle',4:'rocket'} as const)[w as 1|2|3|4];applyItem(p.loadout,kind);
 p.weapon=w;g.pose(p.id,{k:'pose',life:p.life,p:[p.pos.x,p.pos.y,p.pos.z],v:[0,0,0],yaw:0,pitch:0,w});
}
/** Выстрел из глаз стрелка точно в точку; wait — сколько секунд хост живёт перед выстрелом. */
function shoot(g:HostGame,from:HostPlayer,at:Vec3,w:WeaponId,wait=1.5){
 for(let i=0;i<Math.round(wait*60);i++)g.step(1/60);
 const o:V3=[from.pos.x,from.pos.y+1.55,from.pos.z],d=[at.x-o[0],at.y-o[1],at.z-o[2]],l=Math.hypot(...d);
 g.fire(from.id,{k:'fire',w,o,d:[d[0]/l,d[1]/l,d[2]/l],seed:3,lag:0,seq:++seq});
 return g.drain();
}
const head=(p:HostPlayer)=>vec(p.pos.x,p.pos.y+1.6,p.pos.z),chest=(p:HostPlayer)=>vec(p.pos.x,p.pos.y+1.15,p.pos.z);

test('попадание в голову — двойной урон и отметка в событиях',()=>{
 const {g,a,b}=duel();
 const body=shoot(g,a,chest(b),BLASTER);assert.equal(b.loadout.health,92);assert.ok(body.some(e=>e.e==='hit'&&!e.head));
 const top=shoot(g,a,head(b),BLASTER);assert.equal(b.loadout.health,76);assert.ok(top.some(e=>e.e==='hit'&&e.head===1));
});

test('винтовка: в голову без брони — сразу насмерть, в корпус — 75, с полной бронёй голова не убивает',()=>{
 {const {g,a,b}=duel();arm(g,a,RIFLE);const ev=shoot(g,a,head(b),RIFLE);
  assert.equal(b.alive,false);assert.ok(ev.some(e=>e.e==='kill'&&e.head===1));}
 {const {g,a,b}=duel();arm(g,a,RIFLE);shoot(g,a,chest(b),RIFLE);assert.equal(b.loadout.health,25);}
 {const {g,a,b}=duel();arm(g,a,RIFLE);b.loadout.armor=100;shoot(g,a,head(b),RIFLE);assert.ok(b.alive);assert.equal(b.loadout.health,50);}
});

test('винтовка не стреляет чаще раза в 1,3 с',()=>{
 const {g,a,b}=duel();arm(g,a,RIFLE);shoot(g,a,chest(b),RIFLE);shoot(g,a,chest(b),RIFLE,.5);
 assert.equal(a.loadout.mag[RIFLE],4);assert.equal(b.loadout.health,25);
});

test('автомат: 30 в магазине, дальше — только после перезарядки за 2 с',()=>{
 // Мега-здоровье сгорает, поэтому считаем не здоровье, а события попаданий.
 const {g,a,b}=duel();arm(g,a,AUTO);b.loadout.health=1e6;const hits=(ev:ReturnType<typeof shoot>)=>ev.filter(e=>e.e==='hit').length;
 assert.deepEqual([a.loadout.mag[AUTO],a.loadout.ammo[AUTO]],[30,30]);
 let total=0;for(let i=0;i<31;i++)total+=hits(shoot(g,a,chest(b),AUTO,.11));
 assert.equal(a.loadout.mag[AUTO],0);assert.equal(total,30);
 g.reload('a',{k:'reload',w:AUTO});assert.ok(g.drain().some(e=>e.e==='reload'&&e.id==='a'));
 assert.equal(hits(shoot(g,a,chest(b),AUTO,1.9)),0,'выстрел во время перезарядки');
 for(let i=0;i<12;i++)g.step(1/60);
 assert.deepEqual([a.loadout.mag[AUTO],a.loadout.ammo[AUTO]],[30,0]);
});

test('смена оружия отменяет перезарядку',()=>{
 const {g,a}=duel();arm(g,a,AUTO);a.loadout.mag[AUTO]=3;g.reload('a',{k:'reload',w:AUTO});
 g.pose('a',{k:'pose',life:a.life,p:[a.pos.x,a.pos.y,a.pos.z],v:[0,0,0],yaw:0,pitch:0,w:BLASTER});
 for(let i=0;i<180;i++)g.step(1/60);assert.equal(a.loadout.mag[AUTO],3);assert.equal(a.reloading,null);
});

test('бластер перегревается примерно за 3 с огня и ждёт остывания',()=>{
 const {g,a,b}=duel();b.loadout.health=1e6;let hits=0,first=-1;
 for(let i=0;i<60;i++){const ev=shoot(g,a,chest(b),BLASTER,.1);if(ev.some(e=>e.e==='hit'))hits++;else if(first<0)first=i;}
 assert.ok(first>=30&&first<=45,'перегрев на выстреле '+first);
 assert.ok(hits<first+12,'после перегрева стреляет без паузы: '+hits);
 assert.ok(HEAT_PER_SHOT*first>1);
});

test('подбор: новое оружие приходит с полным магазином, патроны — до предела',()=>{
 const l=freshLoadout();assert.equal(applyItem(l,'bullets'),true);assert.equal(l.ammo[AUTO],30);
 applyItem(l,'auto');assert.deepEqual([l.mag[AUTO],l.ammo[AUTO]],[30,60]);assert.ok(l.owned[AUTO]);
 applyItem(l,'auto');applyItem(l,'bullets');assert.equal(l.ammo[AUTO],WEAPONS[AUTO].ammoMax);assert.equal(applyItem(l,'bullets'),false);
 applyItem(l,'rifle');assert.deepEqual([l.mag[RIFLE],l.ammo[RIFLE]],[5,5]);
 l.mag[RIFLE]=1;assert.ok(reloadMagazine(l,RIFLE));assert.deepEqual([l.mag[RIFLE],l.ammo[RIFLE]],[5,1]);
 applyItem(l,'rocket');assert.equal(l.ammo[ROCKET],8);applyItem(l,'shotgun');assert.equal(l.ammo[SHOTGUN],10);
});

test('разброс: винтовка точна только в прицеле и на земле, автомат хуже в воздухе',()=>{
 const still={airborne:false,aim:0,crouch:false};
 assert.equal(spreadOf(RIFLE,{...still,aim:1}),0);assert.ok(spreadOf(RIFLE,still)>=.08);assert.ok(spreadOf(RIFLE,{...still,aim:1,airborne:true})>=.12);
 assert.ok(spreadOf(AUTO,{...still,airborne:true})>spreadOf(AUTO,still)*5);assert.ok(spreadOf(AUTO,{...still,aim:1})<spreadOf(AUTO,still));
 assert.equal(spreadOf(SHOTGUN,{...still,airborne:true}),WEAPONS[SHOTGUN].spread);assert.equal(spreadOf(BLASTER,{...still,airborne:true}),WEAPONS[BLASTER].spread);
});

test('отдача автомата: первые пули уходят вверх, затем очередь уводит вбок',()=>{
 assert.deepEqual(recoilOf(AUTO,0),[0,0]);assert.deepEqual(recoilOf(RIFLE,5),[0,0]);
 for(let n=1;n<9;n++)assert.ok(recoilOf(AUTO,n+1)[0]>recoilOf(AUTO,n)[0]);
 assert.ok(recoilOf(AUTO,17)[1]>.015);assert.ok(recoilOf(AUTO,29)[1]<recoilOf(AUTO,17)[1]);
 const d=vec(0,0,-1),shot=aimedDirection(d,0,recoilOf(AUTO,8),1);assert.ok(shot.y>.04,'не ушла вверх: '+shot.y);
 assert.deepEqual(pelletDirections(shot,AUTO,99),[shot]);assert.equal(pelletDirections(d,SHOTGUN,1).length,WEAPONS[SHOTGUN].pellets);
});

test('блик оптики: флаг «в оптике» доходит до снимка только с винтовкой в руках',()=>{
 const {g,a}=duel();const scoped=()=>g.snapshot().players.find(p=>p[0]==='a')![19];
 g.pose('a',{k:'pose',life:a.life,p:[a.pos.x,a.pos.y,a.pos.z],v:[0,0,0],yaw:0,pitch:0,w:BLASTER,a:1});assert.equal(scoped(),0);
 arm(g,a,RIFLE);g.pose('a',{k:'pose',life:a.life,p:[a.pos.x,a.pos.y,a.pos.z],v:[0,0,0],yaw:0,pitch:0,w:RIFLE,a:1});assert.equal(scoped(),1);
 g.pose('a',{k:'pose',life:a.life,p:[a.pos.x,a.pos.y,a.pos.z],v:[0,0,0],yaw:0,pitch:0,w:RIFLE});assert.equal(scoped(),0);
});
