import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseWorld} from '../../src/base/world.ts';
import {LOCATION,STAIRS,floorY} from '../../src/base/config.ts';
import {compileLevel,HOUSE_TEMPLATES,ROOM_TEMPLATES,floorSpans,levelRoomAt,validateLevel} from '../../src/base/level.ts';
import {lineOfSight,occluders} from '../../src/base/visibility.ts';
import type {BaseObject,BaseSave} from '../../src/base/types.ts';
const step=(w:BaseWorld,seconds:number,dx=0)=>{for(let t=0;t<seconds;t+=1/60)w.update(1/60,dx);};
const at=(w:BaseWorld,x:number,floor=0)=>{Object.assign(w.player,{x,previousX:x,floor,y:w.floorY(floor),previousY:w.floorY(floor)});w.mouseAim=false;w.aim=w.player.facing===1?0:Math.PI;w.refreshSight();};
const fixture=(kind:BaseObject['kind'],x:number,floor:number):BaseObject=>({id:kind,name:kind,kind,x,floor,atlas:'objects',frame:1,width:70,height:60,searched:false,uses:0});

test('The current house is empty, damaged and contains only its architecture',()=>{
 const w=new BaseWorld();assert.equal(w.level.buildings.length,1);assert.equal(w.level.rooms.length,6);assert.ok(w.level.rooms.some(r=>r.floor===-1));
 assert.ok(w.objects.every(o=>!levelRoomAt(w.level,o.x,o.floor)));assert.deepEqual(w.visibleObjects().map(o=>o.id),['barrel']);assert.equal(w.currentRoom?.id,'home/hall');
 assert.equal(w.openings.filter(o=>o.kind==='window').length,6);assert.equal(w.openings.filter(o=>o.kind==='breach').length,3);assert.ok(w.openings.every(o=>o.state==='open'&&o.repairMaterial==='wood'));
 step(w,120);assert.equal(w.player.hp,100);assert.equal(w.dogVisible,false);
});
test('Repeated house templates compile into separate, translated instances',()=>{
 const def={...LOCATION,width:3700,buildings:[{id:'a',template:'damaged-house',x:300},{id:'b',template:'damaged-house',x:2200}],spawn:{x:395,floor:0}};
 const level=compileLevel(def);assert.equal(level.rooms.length,12);assert.equal(level.stairs.find(s=>s.id==='b/main-stair')?.a,2460);
 const w=new BaseWorld(level);w.setOpeningState('a/hall-breach','boarded');assert.equal(w.openings.find(o=>o.id==='b/hall-breach')?.state,'open');assert.equal(level.openings[0].state,'open');assert.equal(ROOM_TEMPLATES['plaster-broken'].openings[0].x,100);
 at(w,2460);assert.equal(w.tryStair(1),true);step(w,2);assert.equal(w.player.floor,1);assert.equal(w.player.x,2650);assert.equal(w.currentRoom?.buildingId,'b');
 assert.equal(lineOfSight({x:2500,y:550},{x:2850,y:550},w.sight.segments),false);
});
test('Room fit, identifiers, stair links and apertures are validated',()=>{
 const bad=structuredClone(HOUSE_TEMPLATES);bad['damaged-house'].rooms[0].width=1600;assert.throws(()=>compileLevel({...LOCATION,buildings:[{id:'home',template:'damaged-house',x:500}]},bad),/outside building/);
 const level=structuredClone(LOCATION);level.rooms[1].x=600;assert.throws(()=>validateLevel(level),/Overlapping/);
 const missing=structuredClone(LOCATION);missing.stairs[0].to=9;assert.throws(()=>validateLevel(missing),/Unconnected/);
 const broken=structuredClone(LOCATION);broken.openings[0].height=400;assert.throws(()=>validateLevel(broken),/Invalid opening/);
});
test('A template can omit a basement or add an extra floor',()=>{
 const houses=structuredClone(HOUSE_TEMPLATES),h=houses['damaged-house'];h.rooms=h.rooms.filter(r=>r.floor>=0);h.doors=h.doors.filter(d=>d.floor>=0);h.stairs=h.stairs.filter(s=>s.from>=0);
 h.rooms.push({id:'attic',name:'Чердак',template:'plaster-broken',x:0,width:1030,floor:2});h.stairs.push({id:'attic-stair',from:1,to:2,a:690,b:900});
 const level=compileLevel({...LOCATION,buildings:[{id:'home',template:'damaged-house',x:500}]},houses);assert.deepEqual(level.buildings[0].floors,[0,1,2]);
 const w=new BaseWorld(level);at(w,1190,1);assert.ok(w.tryStair(1));step(w,2);assert.equal(w.player.floor,2);assert.equal(w.player.y,185);
});
test('Multiple staircases retain the front floor and open independent sight apertures',()=>{
 const level=structuredClone(LOCATION);level.stairs.push({id:'second-stair',from:0,to:1,a:1180,b:1360});
 const spans=floorSpans(level,level.buildings[0],1);assert.deepEqual(spans,[[500,1530]]);
 const walls=occluders(level.doors,level);assert.ok(!walls.some(s=>s.a.y===400&&s.b.y===400&&s.a.x<1260&&s.b.x>1260));assert.ok(walls.some(s=>s.a.y===400&&s.b.y===400&&s.a.x<600&&s.b.x>600));
});
test('Closed doors and intact floor slabs stop sight',()=>{
 const w=new BaseWorld();at(w,1005);assert.equal(w.visible({x:1195,y:559}),false);assert.equal(w.visible({x:1005,y:330}),false);
 w.action({type:'interact',target:'home/kitchen-door'});assert.equal(w.visible({x:1195,y:559}),true);
 w.action({type:'interact',target:'home/kitchen-door'});assert.equal(w.visible({x:1195,y:559}),false);
});
test('A real divider breach permits passage and light; its future boarded state closes both',()=>{
 const w=new BaseWorld();at(w,1040,1);assert.equal(w.visible({x:1170,y:330}),true);step(w,1,1);assert.ok(w.player.x>1090);
 at(w,1040,1);w.setOpeningState('home/upper-passage','boarded');assert.equal(w.visible({x:1170,y:330}),false);step(w,1,1);assert.equal(w.player.x,1078);
 w.setOpeningState('home/upper-passage','open');step(w,1,1);assert.ok(w.player.x>1090);
});
test('Back-wall breaches never create shortcuts through floor slabs or side walls',()=>{
 const w=new BaseWorld();at(w,1388,1);assert.equal(w.visible({x:1388,y:550}),false);assert.equal(w.visible({x:1600,y:330}),false);
 w.setOpeningState('home/bedroom-breach','boarded');assert.equal(w.visible({x:1388,y:550}),false);
});
test('Every staircase supports continuous ascent and descent',()=>{
 for(const s of STAIRS){const w=new BaseWorld();at(w,s.a,s.from);assert.ok(w.tryStair(1));let last={x:w.player.x,y:w.player.y};for(let i=0;i<125;i++){w.update(1/60);assert.ok(Math.hypot(w.player.x-last.x,w.player.y-last.y)<4);last={x:w.player.x,y:w.player.y};}assert.equal(w.player.floor,s.to);assert.equal(w.player.y,floorY(s.to));assert.ok(w.tryStair(-1));step(w,2);assert.equal(w.player.floor,s.from);}
});
test('Approaching stairs is smooth and pause freezes the transition',()=>{
 const w=new BaseWorld();assert.equal(w.tryStair(1),false);at(w,704);assert.ok(w.tryStair(1));assert.equal(w.player.x,704);step(w,.5);const p={...w.player};w.phase='paused';step(w,2);assert.equal(w.player.y,p.y);assert.equal(w.player.x,p.x);w.phase='playing';step(w,3);assert.equal(w.player.floor,1);
});
test('Navigation uses stairs and the open breach to reach upper rooms',()=>{
 const w=new BaseWorld();w.setTarget(1300,1);step(w,12);assert.equal(w.player.floor,1);assert.ok(Math.abs(w.player.x-1300)<10);assert.equal(w.navigation,null);
 w.setTarget(1400,-1);step(w,12);assert.equal(w.player.floor,0);assert.equal(w.player.x,1038);assert.equal(w.navigation,null);
});
test('Closed doors stop walking and can still be operated in the empty house',()=>{
 const w=new BaseWorld();at(w,1000);step(w,1,1);assert.equal(w.player.x,1038);w.action({type:'interact',target:'home/kitchen-door'});step(w,1,1);assert.ok(w.player.x>1100);
});
test('Outdoor searches still cancel, pause and yield resources only on completion',()=>{
 const w=new BaseWorld();at(w,1690);w.action({type:'interact',target:'yard-toolbox'});step(w,.4);assert.equal(w.inventory.scrap,0);w.update(1/60,1);assert.equal(w.task,null);
 w.action({type:'interact',target:'yard-toolbox'});step(w,.4);const remaining=w.task!.remaining;w.phase='paused';step(w,1);assert.equal(w.task!.remaining,remaining);w.phase='playing';step(w,2);assert.equal(w.inventory.scrap,2);w.action({type:'interact',target:'yard-toolbox'});step(w,2);assert.equal(w.inventory.scrap,2);
});
test('Future room contents use the retained interaction system without being instantiated in this level',()=>{
 const w=new BaseWorld();w.objects.push(fixture('generator',1430,-1),fixture('workbench',680,1));at(w,1430,-1);w.action({type:'interact',target:'generator'});assert.equal(w.task,null);
 Object.assign(w.inventory,{scrap:2,fuse:1,cloth:2});w.action({type:'interact',target:'generator'});step(w,1);assert.equal(w.inventory.scrap,2);step(w,2);assert.equal(w.powered,true);assert.equal(w.inventory.scrap,0);
 at(w,680,1);w.action({type:'interact',target:'workbench'});step(w,3);assert.equal(w.inventory.bandage,1);assert.equal(w.inventory.cloth,0);
});
test('The courtyard dog warns and retreats from the flashlight',()=>{
 const w=new BaseWorld();at(w,1960);w.flashlight=false;w.refreshSight();w.update(1/60);assert.equal(w.dog.mode,'warn');assert.equal(w.player.hp,100);step(w,1.3);assert.equal(w.player.hp,94);
 w.dog.x=2000;w.dog.mode='idle';w.action({type:'flashlight'});w.aimAt({x:2000,y:580});w.update(1/60);assert.equal(w.dog.mode,'retreat');
});
test('New saves restore individual damage states without sharing them between worlds',()=>{
 const w=new BaseWorld();w.setOpeningState('home/hall-breach','boarded');w.doors[1].open=true;at(w,1300,1);const saved=w.save(),restored=new BaseWorld();assert.ok(restored.restore(saved));assert.equal(restored.openings.find(o=>o.id==='home/hall-breach')?.state,'boarded');assert.equal(restored.player.floor,1);assert.equal(restored.doors[1].open,true);assert.equal(new BaseWorld().openings[1].state,'open');assert.equal(restored.restore({...saved,levelId:'another-level'}),false);
});
test('Old saves cannot resurrect removed furniture or the old generator light',()=>{
 const old:BaseSave={version:1,player:{x:595,floor:0,hp:80},inventory:{wood:3,scrap:2,cloth:0,water:0,fuse:0,bandage:0},doors:[{id:'kitchen-door',open:true}],objects:[{id:'hall-chest',searched:true,uses:1},{id:'generator',searched:false,uses:1}],explored:['hall','kitchen'],powered:true,flashlight:true,time:42,dogHp:60};
 const w=new BaseWorld();assert.ok(w.restore(old));assert.equal(w.objects.length,2);assert.equal(w.powered,false);assert.equal(w.doors.find(d=>d.id==='home/kitchen-door')?.open,true);assert.ok(w.explored.has('home/kitchen'));assert.equal(w.inventory.wood,3);
});
