import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/game/world.ts';
import { meleeInRange, normalize } from '../src/game/math.ts';
import { SECTORS, VIEW } from '../src/game/content.ts';

function setup(){const world=new World({volume:0,particles:true,shake:true,difficulty:'normal'});world.start();return world;}
function tick(world:World,seconds:number){for(let t=0;t<seconds;t+=1/60)world.update(1/60);}
test('Melee respects facing and depth; diagonal input stays normalized',()=>{
  const attacker={x:100,y:560,facing:1};
  assert.equal(meleeInRange(attacker,{x:200,y:580},158),true);
  assert.equal(meleeInRange(attacker,{x:40,y:560},158),false);
  assert.equal(meleeInRange(attacker,{x:170,y:640},158),false);
  const dir=normalize(1,1);assert.ok(Math.abs(Math.hypot(dir.x,dir.y)-1)<.00001);
});
test('Dash grants temporary invulnerability, then damage works again',()=>{
  const w=setup();w.action('dash',{x:1,y:0});w.damagePlayer(20,1);assert.equal(w.player.hp,120);
  w.player.x=100;tick(w,.45);w.damagePlayer(20,1);assert.equal(w.player.hp,100);
  w.damagePlayer(20,1);assert.equal(w.player.hp,100,'damage grace period prevents multi-hit bursts');
});
test('A keyboard attack damages once and an unavailable pulse cannot fire again',()=>{
  const w=setup(),e=w.enemies[0];w.player.x=e.x-90;w.player.y=e.y;
  w.action('attack',{x:0,y:0});assert.equal(e.hp,64,'wind-up must not damage before the keyboard swings');tick(w,.27);const health=e.hp;w.action('attack',{x:0,y:0});assert.equal(e.hp,health);assert.equal(health,44);
  tick(w,.2);w.action('pulse',{x:0,y:0});const kills=w.stats.kills;w.action('pulse',{x:0,y:0});assert.equal(w.stats.kills,kills);assert.equal(w.player.pulseCooldown,8);
});
test('Movement and knockback remain inside the current sector and walking lane',()=>{
  const w=setup();for(let i=0;i<800;i++)w.update(1/60,{x:1,y:1});
  assert.ok(w.player.x<=SECTORS[0].end-70);assert.ok(w.player.y<=VIEW.maxY);
  const edge=setup();edge.player.x=71;edge.damagePlayer(1,-1);assert.equal(edge.player.x,70);
});
test('A completed run advances through upgrades and ends in a distinct victory state',()=>{
  const w=setup();
  for(let sector=0;sector<3;sector++){
    assert.equal(w.sector,sector);
    for(const enemy of w.enemies)w.damageEnemy(enemy,10000,1,0);
    tick(w,1.5);assert.equal(w.phase,'playing');assert.equal(w.liftReady,true);
    Object.assign(w.player,{x:w.lift.x,y:w.lift.y,elevation:w.lift.elevation});w.action('interact',{x:0,y:0});tick(w,1.4);
    if(sector<2){assert.equal(w.phase,'upgrade');w.upgrade(sector===0?'damage':'cooldown');assert.equal(w.phase,'playing');}
  }
  assert.equal(w.phase,'won');assert.equal(w.stats.kills,10);assert.equal(w.progress,1);assert.ok(w.stats.shards>0);
  const kills=w.stats.kills;w.action('attack',{x:1,y:0});assert.equal(w.stats.kills,kills);
  w.start();assert.equal(w.phase,'playing');assert.equal(w.stats.kills,0);assert.equal(w.player.damageMultiplier,1);assert.equal(w.player.hp,120);
});
test('Pause freezes combat and effects; loss has a working clean restart',()=>{
  const w=setup();w.action('pulse',{x:0,y:0});const pulse=w.player.pulseCooldown;
  w.setPhase('paused');tick(w,2);assert.equal(w.player.pulseCooldown,pulse);assert.equal(w.stats.time,0);
  w.setPhase('playing');w.player.invulnerable=0;w.damagePlayer(999,1);assert.equal(w.phase,'lost');assert.equal(w.player.hp,0);
  w.start();assert.equal(w.player.hp,120);assert.equal(w.player.pulseCooldown,0);
});
test('Story mode reduces incoming damage and healing is capped',()=>{
  const w=setup();w.settings.difficulty='story';w.damagePlayer(20,1);assert.equal(w.player.hp,111);
  w.setPhase('upgrade');w.upgrade('heal');assert.equal(w.player.hp,120);assert.equal(w.player.lifesteal,5);
});
