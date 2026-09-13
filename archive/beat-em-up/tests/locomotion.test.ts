import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/game/world.ts';
import { MOTION, walkCycleTime } from '../src/game/locomotion.ts';
import { SECTORS, VIEW } from '../src/game/content.ts';

function setup(){const w=new World({volume:0,particles:false,shake:false,difficulty:'normal'});w.start();return w;}
function advance(w:World,steps:number,dt=1/60){for(let i=0;i<steps;i++)w.update(dt);}

test('Walking cadence follows travelled distance, including diagonals, stops and walls',()=>{
  for(const direction of [{x:1,y:0},{x:1,y:1}]){
    const w=setup(),p=w.player;
    for(let i=0;i<12;i++)w.update(1/60,direction);
    assert.ok(Math.abs(p.walkDistance-MOTION.speed*.2)<1e-8);
    assert.ok(Math.abs(walkCycleTime(p,1)-MOTION.speed*.2/MOTION.stride)<1e-8);
    assert.equal(walkCycleTime(p,.5),(p.previousWalkDistance+p.walkDistance)/2/MOTION.stride);
    advance(w,10);const distance=p.walkDistance;assert.equal(p.moving,false);
    p.x=SECTORS[0].end-70;p.y=VIEW.maxY;
    for(let i=0;i<10;i++)w.update(1/60,{x:1,y:1});
    assert.equal(p.walkDistance,distance);assert.equal(p.moving,false);
  }
});

test('Jump has anticipation, one ballistic arc, landing and no midair retrigger',()=>{
  const w=setup(),p=w.player,y=p.y;
  w.action('jump',{x:0,y:0});assert.equal(p.jumpPhase,'takeoff');assert.equal(p.height,0);
  advance(w,4);assert.equal(p.height,0);advance(w,18);
  assert.equal(p.jumpPhase,'airborne');assert.ok(p.height>90&&p.height<102);
  const time=p.jumpTime;w.action('jump',{x:0,y:0});assert.equal(p.jumpTime,time);
  assert.equal(p.y,y);assert.equal(p.walkDistance,0);
  advance(w,29);assert.equal(p.jumpPhase,'landing');assert.equal(p.height,0);
  advance(w,10);assert.equal(p.jumpPhase,'grounded');assert.equal(p.height,0);
  w.action('jump',{x:0,y:0});assert.equal(p.jumpPhase,'takeoff');
});

test('Jump trajectory is time-step independent and freezes while paused or in hit-stop',()=>{
  const heights=[30,60,120].map(hz=>{
    const w=setup();w.action('jump',{x:0,y:0});advance(w,hz*.4,1/hz);return w.player.height;
  });
  for(const height of heights)assert.ok(Math.abs(height-98.425)<1e-8);
  const w=setup();w.action('jump',{x:0,y:0});advance(w,20);
  const p=w.player,height=p.height,time=p.jumpTime;
  w.setPhase('paused');advance(w,10);assert.equal(p.height,height);assert.equal(p.jumpTime,time);
  w.setPhase('playing');w.hitstop=.1;advance(w,4);assert.equal(p.height,height);assert.equal(p.jumpTime,time);
  w.start();assert.equal(w.player.height,0);assert.equal(w.player.jumpPhase,'grounded');
});

test('Jump evades ground damage at height, permits an aerial strike and lands normally after a dash',()=>{
  const w=setup(),p=w.player;w.action('jump',{x:0,y:0});advance(w,20);
  w.damagePlayer(20,1);assert.equal(p.hp,120);
  w.action('attack',{x:1,y:0});assert.ok(p.attack>0);
  w.action('dash',{x:1,y:0});advance(w,45);
  assert.equal(p.height,0);assert.equal(p.jumpPhase,'grounded');assert.equal(p.walkDistance,0);
  p.invulnerable=0;w.damagePlayer(20,1);assert.equal(p.hp,100);
});
