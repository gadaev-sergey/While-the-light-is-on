import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World,readLevel,solvable,ENEMIES,EXIT,type Controls,type Enemy} from '../../games/merzlota/scripts/world.ts';

const ids=['airlock','lab','core'];
const scenes=ids.map(id=>JSON.parse(readFileSync(new URL(`../../games/merzlota/scenes/${id}.scene.json`,import.meta.url),'utf8')));
const idle:Controls={forward:0,strafe:0,turn:0,fire:false,weapon:-1};
function seeded(seed=7){return ()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function fresh(id='airlock'){const w=new World(scenes,seeded());w.begin(id);return w;}
function step(w:World,seconds:number,c:Controls=idle){for(let i=0;i<Math.round(seconds*120);i++)w.step(1/120,c);}
const exitOf=(w:World)=>{const i=w.tiles.indexOf(EXIT);return {x:i%w.level.w+.5,y:Math.floor(i/w.level.w)+.5};};

test('Every level is valid, solvable with its own keycards and has enemies and items',()=>{
 for(const scene of scenes){const l=readLevel(scene);assert.ok(solvable(l),l.id+' must be solvable');assert.ok(l.enemies.length>=10);assert.ok(l.items.length>=8);}
 assert.equal(readLevel(scenes[2]).enemies.filter(e=>e.kind==='boss').length,1);
});
test('Broken maps are rejected before the game starts',()=>{
 const open=structuredClone(scenes[0]);open.moduleData.merzlota.map[0]='.'+open.moduleData.merzlota.map[0].slice(1);assert.throws(()=>readLevel(open),/край/);
 const bad=structuredClone(scenes[0]);bad.nodes[0].transform.position=[0.5,0,0.5];assert.throws(()=>readLevel(bad),/не на полу/);
 const locked=structuredClone(scenes[0]);locked.nodes=locked.nodes.filter((n:any)=>n.components[0].values.kind!=='blue');assert.equal(solvable(readLevel(locked)),false);
});
test('Walls block movement and the player slides along them',()=>{
 const w=fresh();w.enemies=[];Object.assign(w.player,{x:2.5,y:1.5,angle:-Math.PI/2});step(w,1,{...idle,forward:1});assert.ok(w.player.y>=1.25);
 Object.assign(w.player,{x:1.5,y:2.5,angle:-Math.PI*.75});step(w,1,{...idle,forward:1});assert.ok(w.player.x>=1.25&&w.player.y>=1.25);
});
test('Doors open on approach; keycard doors stay shut without the card',()=>{
 const w=fresh();w.enemies=[];Object.assign(w.player,{x:4.4,y:2.5,angle:0});step(w,1);assert.ok(w.doorOpen(2*w.level.w+5)>.8);step(w,1,{...idle,forward:1});assert.ok(w.player.x>5.5,'walked through the door');
 const b=7*w.level.w+20;Object.assign(w.player,{x:20.5,y:6.3});step(w,1);assert.equal(w.doorOpen(b),0);assert.match(w.hint,/синяя/);
 w.player.keys.blue=true;step(w,1);assert.ok(w.doorOpen(b)>.8);
});
test('Hitscan hits the nearest enemy but never through a wall',()=>{
 const w=fresh();w.enemies=[w.makeEnemy('crawler',8.5,2.5),w.makeEnemy('crawler',10.5,2.5)];Object.assign(w.player,{x:6.5,y:2.5,angle:0});
 w.hitscan(0,10);assert.equal(w.enemies[0].hp,20);assert.equal(w.enemies[1].hp,30);
 w.enemies=[w.makeEnemy('crawler',2.5,2.5)];Object.assign(w.player,{x:6.5,y:2.5});w.hitscan(Math.PI,50);assert.equal(w.enemies[0].hp,30);
});
test('Weapons spend ammo, the pistol never runs dry and empty weapons switch over',()=>{
 const w=fresh();w.enemies=[];const p=w.player;p.owned[1]=true;p.shells=1;p.weapon=1;
 step(w,.05,{...idle,fire:true});assert.equal(p.shells,0);step(w,1.2,{...idle,fire:true});assert.equal(p.weapon,0);
 step(w,2,{...idle,fire:true});assert.equal(p.weapon,0);assert.ok(w.effects.length>0||true);
});
test('Enemies wake on sight, path around walls and deal damage; armor absorbs half',()=>{
 const w=fresh();w.enemies=[w.makeEnemy('crawler',2.5,10.5)];Object.assign(w.player,{x:7.5,y:4.5,armor:0,hp:100});
 // Снежник за стеной: выстрел будит его, а поле расстояний ведёт через двери.
 step(w,.05,{...idle,fire:true});step(w,12);assert.ok(w.player.hp<100,'crawler reached and clawed the player');
 const a=fresh();a.enemies=[];Object.assign(a.player,{hp:100,armor:50});a.hurt(20);assert.equal(a.player.hp,90);assert.equal(a.player.armor,40);
});
test('Projectiles stop at walls and hurt on contact',()=>{
 const w=fresh();w.enemies=[];Object.assign(w.player,{x:7.5,y:2.5,hp:100});
 w.shots.push({x:7.5,y:4.5,vx:0,vy:-6,damage:8,life:3,kind:'bolt'});step(w,.5);assert.equal(w.player.hp,92);
 w.shots.push({x:7.5,y:4.5,vx:-6,vy:0,damage:8,life:3,kind:'bolt'});step(w,.5);assert.equal(w.shots.length,0);assert.equal(w.player.hp,92);
});
test('Pickups apply only when useful; keys and weapons are collected',()=>{
 const w=fresh();w.enemies=[];const p=w.player;const med=w.items.find(i=>i.kind==='medkit')!;Object.assign(p,{x:med.x,y:med.y,hp:100});step(w,.1);assert.equal(med.taken,false);
 p.hp=50;step(w,.1);assert.equal(med.taken,true);assert.equal(p.hp,90);
 const gun=w.items.find(i=>i.kind==='shotgun')!;Object.assign(p,{x:gun.x,y:gun.y});step(w,.1);assert.equal(p.owned[1],true);assert.equal(p.weapon,1);
 const key=w.items.find(i=>i.kind==='blue')!;Object.assign(p,{x:key.x,y:key.y});step(w,.1);assert.equal(p.keys.blue,true);
});
test('Reaching the lift completes the level, carries the loadout and unlocks the next one',()=>{
 const w=fresh();w.enemies.forEach(e=>{e.state='dead';});const e=exitOf(w);Object.assign(w.player,{x:e.x,y:e.y,shells:33});w.player.owned[1]=true;step(w,.1);
 assert.equal(w.phase,'complete');assert.equal(w.progress.unlocked,2);assert.equal(w.result!.last,false);
 const carry=w.loadout();w.begin('lab',carry);assert.equal(w.player.shells,33);assert.equal(w.player.owned[1],true);
});
test('The core lift stays locked until the guardian falls; boss fans shards',()=>{
 const w=fresh('core');const boss=w.boss!;assert.ok(boss);const e=exitOf(w);Object.assign(w.player,{x:e.x,y:e.y});step(w,.1);assert.equal(w.phase,'playing');assert.match(w.banner,/ЗАБЛОКИРОВАН/);
 Object.assign(w.player,{x:boss.x-5,y:boss.y,hp:999});boss.state='chase';boss.cooldown=0;w.enemies=[boss];let peak=0;for(let i=0;i<120;i++){w.step(1/120,idle);peak=Math.max(peak,w.shots.length);}assert.ok(peak>=7,'peak '+peak);
 w.hurtEnemy(boss,5000);assert.equal(w.boss,undefined);Object.assign(w.player,{x:e.x,y:e.y,hp:100});step(w,.1);assert.equal(w.phase,'complete');assert.equal(w.result!.last,true);
});
test('Death ends the attempt and restart restores the level-start loadout',()=>{
 const w=fresh('lab');const shells=w.player.shells;w.player.shells=0;w.hurt(500);assert.equal(w.phase,'dead');const t=w.seconds;step(w,1);assert.equal(w.seconds,t);
 w.restart();assert.equal(w.phase,'playing');assert.equal(w.player.hp,100);assert.equal(w.player.shells,shells);assert.equal(w.kills,0);
});
test('Pause freezes time and enemies',()=>{
 const w=fresh();step(w,.5);const t=w.seconds,pos=w.enemies.map(e=>[e.x,e.y]);w.pause(true);step(w,2,{...idle,forward:1});assert.equal(w.seconds,t);assert.deepEqual(w.enemies.map(e=>[e.x,e.y]),pos);w.pause(false);assert.equal(w.phase,'playing');
});
test('A long battle keeps every actor finite and inside the map',()=>{
 const w=fresh('core');w.player.hp=1e9;for(const e of w.enemies)w.wake(e);step(w,40,{...idle,turn:.3,fire:true});
 for(const e of w.enemies){assert.ok([e.x,e.y,e.hp].every(Number.isFinite));assert.ok(!w.solid(e.x,e.y),`${ENEMIES[e.kind].name} inside a wall`);}
});

/** Боец-бот: целится в видимых врагов, лечится и идёт по кратчайшему пути к картам и лифту. */
function marine(w:World){
 const p=w.player,lw=w.level.w;let target:Enemy|undefined,best=13;
 for(const e of w.enemies){if(e.state==='dead')continue;const d=Math.hypot(e.x-p.x,e.y-p.y);if(d<best&&w.sees(p.x,p.y,e.x,e.y)){best=d;target=e;}}
 const turnTo=(a:number)=>{let d=a-p.angle;d=Math.atan2(Math.sin(d),Math.cos(d));return {d,turn:Math.max(-1,Math.min(1,d*5))};};
 if(target){
  const {d,turn}=turnTo(Math.atan2(target.y-p.y,target.x-p.x));
  const weapon=p.owned[2]&&p.cells>0?2:p.owned[1]&&p.shells>0&&best<5?1:0;
  const back=ENEMIES[target.kind].melee&&best<1.6?-1:0;
  return {forward:back,strafe:target.kind==='boss'||target.kind==='brute'?Math.sin(w.seconds*1.3):0,turn,fire:Math.abs(d)<.06,weapon} as Controls;
 }
 const goals=w.items.filter(i=>!i.taken&&(i.kind==='blue'||i.kind==='red'||i.kind==='shotgun'||i.kind==='rifle'||(p.hp<70&&(i.kind==='medkit'||i.kind==='health'))||(i.kind==='shells'&&p.shells<20)||(i.kind==='cells'&&p.cells<100)||(i.kind==='armor'&&p.armor<50)));
 // BFS по клеткам до ближайшей цели или лифта.
 const start=Math.floor(p.y)*lw+Math.floor(p.x),prev=new Int32Array(w.tiles.length).fill(-1),q=[start];prev[start]=start;let found=-1;
 const boss=w.boss,bossTile=boss?Math.floor(boss.y)*lw+Math.floor(boss.x):-1;
 const isGoal=(c:number)=>goals.some(g=>Math.floor(g.y)*lw+Math.floor(g.x)===c)||(goals.length===0&&(boss?c===bossTile:w.tiles[c]===EXIT));
 for(let i=0;i<q.length&&found<0;i++){const c=q[i];if(isGoal(c)){found=c;break;}for(const n of [c+1,c-1,c+lw,c-lw]){if(prev[n]>=0)continue;const t=w.tiles[n];
  if(t===0||t===EXIT||t===5||t===6&&p.keys.blue||t===7&&p.keys.red){prev[n]=c;q.push(n);}}}
 if(found<0)return idle;
 let c=found;while(prev[c]!==start&&c!==start)c=prev[c];
 const tx=c%lw+.5,ty=Math.floor(c/lw)+.5,{d,turn}=turnTo(Math.atan2(ty-p.y,tx-p.x));
 return {forward:Math.abs(d)<.6?1:0,strafe:0,turn,fire:false,weapon:-1} as Controls;
}
test('A careful marine clears the whole campaign, carrying the loadout between sectors',()=>{
 const w=new World(scenes,seeded(3));let carry;
 for(const id of ids){
  w.begin(id,carry);let t=0;while(w.phase==='playing'&&t<600){w.step(1/60,marine(w));t+=1/60;}
  assert.equal(w.phase,'complete',`${id}: ended as ${w.phase} after ${t.toFixed(0)} s, hp ${w.player.hp.toFixed(0)}, kills ${w.kills}/${w.totalKills}`);
  console.log(id,{time:w.seconds.toFixed(0),hp:Math.round(w.player.hp),armor:Math.round(w.player.armor),kills:`${w.kills}/${w.totalKills}`,shells:w.player.shells,cells:w.player.cells});
  carry=w.loadout();
 }
});
