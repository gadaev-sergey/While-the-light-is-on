import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/game/world.ts';
import { OFFICE_LEVELS, FLOOR_HEIGHT, floorAt, stairHeight } from '../src/game/terrain.ts';
import { PROPS, SECTORS } from '../src/game/content.ts';
const neutral={x:0,y:0};
const setup=()=>{const w=new World({volume:0,particles:false,shake:false,difficulty:'normal'});w.start(true);return w;};
function step(w:World,n:number,d=neutral){for(let i=0;i<n;i++)w.update(1/60,d);}

test('Each office has two overlapping floors and a continuous staircase opening',()=>{
  for(const l of OFFICE_LEVELS){
    const x=l.start+1100,y=600;assert.equal(floorAt(x,y),FLOOR_HEIGHT);assert.equal(floorAt(x,y,0),0);
    const middle=(l.stairs.x+l.stairs.end)/2;assert.equal(floorAt(middle,540),140);assert.equal(floorAt(middle,540,0),0);
    assert.equal(stairHeight(l,l.stairs.x),0);assert.equal(stairHeight(l,l.stairs.end),FLOOR_HEIGHT);
  }
});
test('Walking climbs and descends a full storey smoothly, keeping feet grounded',()=>{
  const w=setup(),p=w.player;p.x=520;p.y=543;
  let previous=0;for(let i=0;i<100;i++){w.update(1/60,{x:1,y:0});assert.ok(Math.abs(p.elevation-previous)<4);assert.equal(p.height,0);previous=p.elevation;}
  assert.equal(p.elevation,FLOOR_HEIGHT);assert.equal(p.jumpPhase,'grounded');
  step(w,100,{x:-1,y:0});assert.equal(p.elevation,0);assert.equal(p.height,0);
});
test('Lower corridor passes under the upper floor and jumping cannot teleport to it',()=>{
  const w=setup(),p=w.player;p.x=500;p.y=610;step(w,100,{x:1,y:0});assert.equal(p.elevation,0);
  w.action('jump',neutral);step(w,65);assert.equal(p.elevation,0);assert.equal(p.height,0);
  p.x=750;p.y=610;step(w,22,{x:0,y:-1});assert.equal(p.elevation,0,'walking behind the stairwell stays on the lower level');
});
test('Upper stairwell rail prevents accidentally stepping through the middle of the stairs',()=>{
  const w=setup(),p=w.player;p.x=750;p.y=600;p.elevation=FLOOR_HEIGHT;step(w,20,{x:0,y:-1});assert.ok(p.y>568);assert.equal(p.elevation,FLOOR_HEIGHT);
});
test('Enemy routes to the foot of the stairs and can follow the player onto either floor',()=>{
  for(const up of [true,false]){
    const w=setup();w.training=false;const p=w.player,e=w.enemies[0];p.x=1120;p.y=600;p.elevation=up?280:0;e.x=1050;e.y=600;e.elevation=up?0:280;e.kind='bug';
    w.damagePlayer(20,-1,e.elevation);assert.equal(p.hp,120);
    for(let i=0;i<2100&&Math.abs(e.elevation-p.elevation)>5;i++)w.update(1/60);
    assert.ok(Math.abs(e.elevation-p.elevation)<=5,`enemy must route ${up?'up':'down'} the staircase`);
  }
});
test('Lift requires a cleared level, upper-floor proximity, completed attacks and an explicit press',()=>{
  const w=new World({volume:0,particles:false,shake:false,difficulty:'normal'});w.start();
  Object.assign(w.player,{x:w.lift.x,y:w.lift.y,elevation:280});w.action('interact',neutral);assert.equal(w.liftTravel,0);
  for(const e of w.enemies)w.damageEnemy(e,9999,1,0);step(w,100);assert.equal(w.phase,'playing');assert.equal(w.liftReady,true);
  w.player.elevation=0;w.action('interact',neutral);assert.equal(w.liftTravel,0,'standing directly below the lift cannot activate it');
  w.player.elevation=280;w.player.x-=200;w.action('interact',neutral);assert.equal(w.liftTravel,0);
  w.player.x=w.lift.x;w.action('heavy',neutral);w.action('interact',neutral);assert.equal(w.liftTravel,0);step(w,45);
  w.action('interact',neutral);assert.ok(w.liftTravel>0);const before=w.liftTravel;w.setPhase('paused');step(w,30);assert.equal(w.liftTravel,before);
  w.setPhase('playing');step(w,80);assert.equal(w.phase,'upgrade');w.upgrade('damage');
  assert.equal(w.sector,1);assert.equal(w.player.elevation,0);assert.equal(w.player.x,SECTORS[1].start+180);assert.equal(w.camera,SECTORS[1].start);assert.equal(w.liftTravel,0);
  w.start();assert.equal(w.sector,0);assert.equal(w.liftReady,false);
});
test('Foreground contains only dedicated low office objects',()=>{
  assert.ok(PROPS.length>0);for(const p of PROPS){assert.ok(p.h<=56);assert.ok(p.y>=648);}
});
test('Enemies on separate floors do not push each other through the ceiling',()=>{
  const run=(upstairs:boolean)=>{
    const w=setup();w.training=false;w.player.x=400;w.player.y=610;
    const e=w.enemies[0];Object.assign(e,{x:700,y:610,elevation:0,kind:'bug'});
    if(upstairs)w.enemies.push({...e,id:900,x:702,elevation:280,previousElevation:280});
    w.update(1/60);return {x:e.x,y:e.y};
  };
  assert.deepEqual(run(true),run(false));
});
test('Hitting a falling enemy preserves its fall and dead enemies never revive',()=>{
  const w=setup(),e=w.enemies[0];e.x=850;e.y=605;e.elevation=280;e.height=-15;e.verticalSpeed=-100;e.state='airborne';
  w.damageEnemy(e,10,1,0);assert.equal(e.state,'airborne');step(w,80);assert.equal(e.height,0);assert.equal(e.elevation,0);
  w.damageEnemy(e,10000,1,0);step(w,60);assert.equal(e.state,'dead');assert.equal(w.alive.length,0);
});
