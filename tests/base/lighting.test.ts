import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseWorld} from '../../src/base/world.ts';
import {floorOccluderSpans,stairApertures} from '../../src/base/level.ts';
import {canSee,occluders} from '../../src/base/visibility.ts';
import {daylightAt,daylightSources,daylightStyle,nightSources,flashlightReaches,timeLabel,timeOfDay} from '../../src/base/lighting.ts';
const tick=(w:BaseWorld,seconds:number)=>{for(let t=0;t<seconds;t+=1/60)w.update(1/60);};

test('Moonlight and starlight are weaker than daylight and only enter through open apertures',()=>{
 const w=new BaseWorld();w.doors.forEach(d=>d.open=false);w.openings.forEach(o=>o.state=o.id==='home/hall-window-0'?'open':'boarded');w.refreshSight();
 const night=nightSources(w.level,w.doors,w.openings,0),day=daylightSources(w.level,w.doors,w.openings,720),point={x:650,y:530},nightLevel=daylightAt(point,night,w.sight.segments);
 assert.equal(night.filter(s=>s.celestial==='moon').length,3);assert.equal(night.filter(s=>s.celestial==='stars').length,1);assert.ok(nightLevel>.015&&nightLevel<daylightAt(point,day,w.sight.segments)*.4);assert.equal(night.find(s=>s.celestial==='stars')!.beamStrength,0);
 assert.equal(daylightAt({x:1200,y:530},night,w.sight.segments),0);assert.equal(daylightAt({x:650,y:780},night,w.sight.segments),0);assert.equal(nightSources(w.level,w.doors,w.openings,720).length,0);
 w.openings.forEach(o=>o.state='boarded');assert.equal(nightSources(w.level,w.doors,w.openings,0).length,0);
 w.doors.find(d=>d.exterior)!.open=true;assert.ok(nightSources(w.level,w.doors,w.openings,0).length>0);
});

test('Celestial light fades smoothly at dusk and dawn without a midnight discontinuity',()=>{
 assert.equal(daylightStyle(720).night,0);assert.equal(daylightStyle(0).night,1);assert.equal(daylightStyle(1440).night,1);
 assert.ok(daylightStyle(1140).night<daylightStyle(1200).night);assert.ok(daylightStyle(1200).night<daylightStyle(1260).night);
 for(const minutes of [300,360,1140,1200,1260,1439])assert.ok(Math.abs(daylightStyle(minutes+.01).night-daylightStyle(minutes).night)<.001);
 assert.equal(daylightStyle(0).interiorDark,daylightStyle(720).interiorDark);
});

test('Visibility is geometric and identical with either lamp state, aim and time of day',()=>{
 const w=new BaseWorld(),points=[{x:365,y:550},{x:980,y:530},{x:1200,y:530},{x:600,y:330},{x:600,y:780}];
 const expected=points.map(p=>w.visible(p)),objects=w.visibleObjects().map(o=>o.id);assert.deepEqual(expected,[true,true,false,false,false]);
 for(const minutes of [0,420,720,1140])for(const lamp of [true,false]){w.setTime(minutes);w.flashlight=lamp;w.aim=Math.PI;w.player.facing=-1;w.refreshSight();assert.deepEqual(points.map(p=>w.visible(p)),expected);assert.deepEqual(w.visibleObjects().map(o=>o.id),objects);}
 assert.equal(canSee({origin:{x:0,y:0},segments:[]},{x:900,y:0}),false);
});
test('Daylight stays behind solid slabs but can cross a stair aperture',()=>{
 const w=new BaseWorld();w.doors.forEach(d=>d.open=false);
 for(const id of ['home/hall-window-0','home/hall-breach']){
  const opening=w.openings.find(o=>o.id===id)!;
  const isolated=w.openings.map(o=>({...o,state:o.id===opening.id?'open' as const:'boarded' as const}));
  const sources=daylightSources(w.level,w.doors,isolated,720),segments=occluders(w.doors,w.level,isolated);
  assert.equal(sources.length,3);assert.ok(daylightAt({x:opening.x,y:550},sources,segments)>.1);
  if(opening.kind==='breach')assert.ok(daylightAt({x:opening.x,y:330},sources,segments)>.05);else assert.equal(daylightAt({x:opening.x,y:330},sources,segments),0);assert.equal(daylightAt({x:opening.x,y:760},sources,segments),0);
  assert.equal(daylightAt({x:1200,y:550},sources,segments),0);
  isolated.forEach(o=>o.state='boarded');assert.equal(daylightSources(w.level,w.doors,isolated,720).length,0);
 }
});
test('Exterior doors admit daylight only when open; internal doors transmit existing light',()=>{
 const w=new BaseWorld();w.openings.forEach(o=>o.state='boarded');w.doors.forEach(d=>d.open=false);assert.equal(daylightSources(w.level,w.doors,w.openings,720).length,0);
 const entry=w.doors.find(d=>d.id==='home/entry')!;entry.open=true;let sources=daylightSources(w.level,w.doors,w.openings,720);assert.ok(daylightAt({x:600,y:550},sources,occluders(w.doors,w.level,w.openings))>.1);
 entry.open=false;const yard=w.doors.find(d=>d.id==='home/yard-door')!;yard.open=true;sources=daylightSources(w.level,w.doors,w.openings,720);assert.ok(daylightAt({x:1450,y:550},sources,occluders(w.doors,w.level,w.openings))>.1);
 assert.equal(daylightSources(w.level,w.doors,w.openings,0).length,0);
 const breach=w.openings.find(o=>o.id==='home/hall-breach')!;breach.state='open';sources=daylightSources(w.level,w.doors,w.openings,720).filter(s=>s.id.startsWith(breach.id));
 assert.equal(daylightAt({x:1120,y:550},sources,occluders(w.doors,w.level,w.openings)),0);
 w.doors.find(d=>d.id==='home/kitchen-door')!.open=true;assert.ok(daylightAt({x:1120,y:550},sources,occluders(w.doors,w.level,w.openings))>.05);
});
test('Flashlight has a directional beam without a radial reveal and stops at architecture',()=>{
 const w=new BaseWorld(),o={x:1000,y:546};
 assert.ok(flashlightReaches(o,Math.PI,{x:800,y:546},w.sight.segments));assert.equal(flashlightReaches(o,0,{x:970,y:546},w.sight.segments),false);
 assert.equal(flashlightReaches(o,0,{x:1200,y:546},w.sight.segments),false);assert.equal(flashlightReaches(o,-Math.PI/2,{x:1000,y:350},w.sight.segments),false);
 w.doors.find(d=>d.id==='home/kitchen-door')!.open=true;w.refreshSight();assert.ok(flashlightReaches(o,0,{x:1200,y:546},w.sight.segments));
});
test('Manual clock, midnight rollover, pause, reset and v1/v2 migration remain deterministic',()=>{
 const w=new BaseWorld();assert.equal(w.dayMinutes,720);tick(w,2);assert.equal(w.dayMinutes,720);
 w.setTime(1439);w.setTimeRunning(true);tick(w,1);assert.ok(w.dayMinutes>0&&w.dayMinutes<2);w.phase='paused';const now=w.dayMinutes;tick(w,1);assert.equal(w.dayMinutes,now);
 w.setTime(420);assert.equal(w.timeRunning,false);assert.equal(timeLabel(w.dayMinutes),'07:00');assert.equal(timeOfDay(w.dayMinutes),'УТРО');w.setTime(NaN);assert.equal(w.dayMinutes,420);
 w.setTimeRunning(true);const saved=w.save(),copy=new BaseWorld();assert.ok(copy.restore(saved));assert.equal(copy.dayMinutes,420);assert.equal(copy.timeRunning,true);
 for(const version of [1,2] as const){const legacy={...saved,version,clock:undefined};const old=new BaseWorld();assert.ok(old.restore(legacy));assert.equal(old.dayMinutes,720);assert.equal(old.timeRunning,false);}
 w.reset();assert.equal(w.dayMinutes,720);assert.equal(w.timeRunning,false);assert.equal(timeLabel(-1),'23:59');
 assert.ok(daylightStyle(720).sun>daylightStyle(420).sun);assert.ok(daylightStyle(1140).sun>daylightStyle(0).sun);
});

test('Every stair aperture transmits sight and flashlight in both directions, with intact slabs beside it',()=>{
 const w=new BaseWorld();
 for(const stair of w.level.stairs){
  const b=w.level.buildings[0],[left,right]=stairApertures(w.level,b,stair.to)[0],x=(left+right)/2,y=w.floorY(stair.to),upper={x,y:y-65},lower={x,y:y+95};
  assert.equal(canSee({origin:upper,segments:w.sight.segments},lower),true);assert.equal(canSee({origin:lower,segments:w.sight.segments},upper),true);
  assert.equal(flashlightReaches(upper,Math.PI/2,lower,w.sight.segments),true);assert.equal(flashlightReaches(lower,-Math.PI/2,upper,w.sight.segments),true);
  for(const edge of [left-25,right+25])assert.equal(canSee({origin:{x:edge,y:y-65},segments:w.sight.segments},{x:edge,y:y+95}),false);
 }
 const reversed=structuredClone(w.level);[reversed.stairs[0].a,reversed.stairs[0].b]=[reversed.stairs[0].b,reversed.stairs[0].a];
 const [left,right]=stairApertures(reversed,reversed.buildings[0],1)[0];assert.ok(left<760&&right>760);assert.equal(floorOccluderSpans(reversed,reversed.buildings[0],1).length,2);
 assert.equal(canSee({origin:{x:800,y:340},segments:occluders(reversed.doors,reversed)},{x:800,y:480}),true);
});

test('A window can light the cellar through its staircase without illuminating the sealed storage',()=>{
 const w=new BaseWorld();w.doors.forEach(d=>d.open=false);w.openings.forEach(o=>o.state=o.id==='home/kitchen-window'?'open':'boarded');w.refreshSight();
 const sources=daylightSources(w.level,w.doors,w.openings,720);
 assert.ok(daylightAt({x:1370,y:690},sources,w.sight.segments)>.01);
 assert.equal(daylightAt({x:1100,y:690},sources,w.sight.segments),0);assert.equal(daylightAt({x:900,y:690},sources,w.sight.segments),0);
 assert.equal(daylightStyle(0).interiorDark,daylightStyle(720).interiorDark);assert.ok(daylightStyle(720).interiorDark>=.88);
});
