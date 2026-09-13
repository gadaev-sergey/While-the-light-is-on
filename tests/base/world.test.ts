import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseWorld} from '../../src/base/world.ts';
import {BASE,STAIRS,floorY} from '../../src/base/config.ts';
import {canSee,lineOfSight,occluders,rayDistance} from '../../src/base/visibility.ts';
const step=(w:BaseWorld,seconds:number,dx=0)=>{for(let t=0;t<seconds;t+=1/60)w.update(1/60,dx);};
const at=(w:BaseWorld,x:number,floor: -1|0|1=0)=>{Object.assign(w.player,{x,previousX:x,floor,y:floorY(floor),previousY:floorY(floor)});w.mouseAim=false;w.aim=w.player.facing===1?0:Math.PI;w.refreshSight();};

test('New base starts with one distant dog, no loot in hidden rooms, and the developer at home',()=>{
 const w=new BaseWorld();assert.equal(w.location,'Прихожая');assert.deepEqual(w.visibleObjects().map(o=>o.id),['hall-chest','hall-rubble']);assert.equal(w.dogVisible,false);assert.equal(w.dog.hp,60);assert.equal(w.powered,false);assert.equal(w.inventory.fuse,0);
 step(w,120);assert.ok(w.dog.x>=1870);assert.equal(w.player.hp,100);
});
test('Walls, floor slabs and closed doors block sight and the flashlight independently of range',()=>{
 const w=new BaseWorld();at(w,1005);assert.equal(w.visible({x:1195,y:559}),false);assert.equal(w.visible({x:1005,y:330}),false);
 w.action({type:'interact',target:'kitchen-door'});assert.equal(w.doors.find(d=>d.id==='kitchen-door')!.open,true);assert.equal(w.visible({x:1195,y:559}),true);
 w.action({type:'interact',target:'kitchen-door'});assert.equal(w.visible({x:1195,y:559}),false);
 const s=occluders(w.doors);assert.ok(rayDistance({x:1000,y:550},0,s,455)<=50);assert.equal(lineOfSight({x:1000,y:550},{x:1200,y:550},s),false);
});
test('Flashlight reaches farther in its cone, switching or turning hides items again',()=>{
 const w=new BaseWorld();assert.ok(w.visibleObjects().some(o=>o.id==='hall-rubble'));
 w.action({type:'flashlight'});assert.ok(!w.visibleObjects().some(o=>o.id==='hall-rubble'));w.action({type:'flashlight'});
 w.aim=Math.PI;w.refreshSight();assert.ok(!w.visibleObjects().some(o=>o.id==='hall-rubble'));assert.ok(w.explored.has('hall'));
 w.aimAt({x:900,y:500});assert.ok(w.visibleObjects().some(o=>o.id==='hall-rubble'));
});
test('Search has a duration, movement cancels it, pause freezes it, and loot cannot duplicate',()=>{
 const w=new BaseWorld();w.action({type:'interact'});step(w,.4);assert.equal(w.inventory.scrap,0);w.update(1/60,1);assert.equal(w.task,null);assert.equal(w.inventory.wood,0);
 w.action({type:'interact'});step(w,.4);const remaining=w.task!.remaining;w.phase='paused';step(w,1);assert.equal(w.task!.remaining,remaining);w.phase='playing';step(w,2);assert.equal(w.inventory.scrap,2);assert.equal(w.inventory.wood,3);w.action({type:'interact'});step(w,2);assert.equal(w.inventory.scrap,2);
});
test('Interaction cannot reveal or collect through a wall or from a different floor',()=>{
 const w=new BaseWorld();at(w,1038);w.action({type:'interact',target:'wardrobe'});assert.equal(w.task,null);at(w,1215,0);w.action({type:'interact',target:'wardrobe'});assert.equal(w.task,null);assert.equal(w.inventory.fuse,0);
});
test('Every staircase supports a smooth ascent and descent without floor snapping',()=>{
 for(const s of STAIRS){const w=new BaseWorld();at(w,s.a,s.from);assert.equal(w.tryStair(1),true);let last={x:w.player.x,y:w.player.y};for(let i=0;i<120;i++){w.update(1/60);assert.ok(Math.hypot(w.player.x-last.x,w.player.y-last.y)<4);last={x:w.player.x,y:w.player.y};}assert.equal(w.player.floor,s.to);assert.equal(w.player.y,floorY(s.to));assert.equal(w.tryStair(-1),true);step(w,2);assert.equal(w.player.floor,s.from);assert.equal(w.player.y,floorY(s.from));}
});
test('Cannot change floors away from a stair; stairs and timer freeze during pause',()=>{
 const w=new BaseWorld();w.action({type:'up'});assert.equal(w.player.stair,null);at(w,760);w.action({type:'up'});step(w,.5);const before=JSON.stringify(w.player.stair);const y=w.player.y;w.phase='paused';step(w,2);assert.equal(JSON.stringify(w.player.stair),before);assert.equal(w.player.y,y);
});
test('Closed doors stop walking, opening one permits passage',()=>{
 const w=new BaseWorld();at(w,1000);step(w,1,1);assert.equal(w.player.x,1038);w.action({type:'interact',target:'kitchen-door'});step(w,1,1);assert.ok(w.player.x>1100);
});
test('Click navigation uses stair links and stops at an unopened door',()=>{
 const w=new BaseWorld();w.setTarget(1215,1,'wardrobe');step(w,12);assert.equal(w.player.floor,1);assert.equal(w.player.x,1078);assert.equal(w.inventory.fuse,0);assert.equal(w.navigation,null);
 w.action({type:'interact',target:'bedroom-door'});w.setTarget(1215,1,'wardrobe');step(w,4);assert.equal(w.inventory.fuse,1);
});
test('Generator consumes actual supplies only on completion; crafting and water are finite',()=>{
 const w=new BaseWorld();at(w,1430,-1);w.action({type:'interact',target:'generator'});assert.equal(w.task,null);assert.equal(w.powered,false);
 Object.assign(w.inventory,{scrap:2,fuse:1,cloth:2});w.action({type:'interact',target:'generator'});step(w,1);assert.equal(w.inventory.scrap,2);step(w,2);assert.equal(w.powered,true);assert.equal(w.inventory.scrap,0);assert.equal(w.inventory.fuse,0);
 at(w,680,1);w.action({type:'interact',target:'workbench'});step(w,3);assert.equal(w.inventory.cloth,0);assert.equal(w.inventory.bandage,1);w.action({type:'interact',target:'workbench'});assert.equal(w.task,null);
 at(w,365);for(let i=0;i<3;i++){w.action({type:'interact',target:'barrel'});step(w,2);}assert.equal(w.inventory.water,2);
});
test('The dog stays outside, warns before damage, retreats from light and can be pushed back',()=>{
 const w=new BaseWorld();at(w,1960);w.flashlight=false;w.aim=0;w.refreshSight();w.update(1/60);assert.equal(w.dog.mode,'warn');assert.equal(w.player.hp,100);step(w,1.3);assert.equal(w.player.hp,94);
 w.dog.x=2000;w.dog.mode='idle';w.action({type:'flashlight'});w.aimAt({x:2000,y:580});w.update(1/60);assert.equal(w.dog.mode,'retreat');assert.ok(w.dog.x>2000);
 w.dog.x=2010;w.action({type:'shove'});step(w,.3);assert.equal(w.dog.hp,40);assert.ok(w.dog.x>2010);assert.ok(w.dog.x>BASE.houseRight);
});
test('Bandages heal, and saving restores doors, discovery and collected items without an active task',()=>{
 const w=new BaseWorld();w.inventory.bandage=1;w.player.hp=50;w.action({type:'bandage'});assert.equal(w.player.hp,85);assert.equal(w.inventory.bandage,0);
 w.action({type:'interact'});step(w,2);w.doors[1].open=true;at(w,1300,1);w.explored.add('bedroom');const s=w.save(),restored=new BaseWorld();assert.equal(restored.restore(s),true);assert.equal(restored.player.floor,1);assert.equal(restored.player.y,400);assert.equal(restored.objects[0].searched,true);assert.equal(restored.doors[1].open,true);assert.ok(restored.explored.has('bedroom'));assert.equal(restored.task,null);assert.equal(restored.player.stair,null);assert.equal(restored.restore({version:9}),false);
});

test('Entering a nearby stair walks to its first step without teleporting',()=>{
 const w=new BaseWorld();at(w,704);w.action({type:'up'});assert.equal(w.player.x,704);let last={x:704,y:615};for(let i=0;i<160;i++){w.update(1/60);assert.ok(Math.hypot(w.player.x-last.x,w.player.y-last.y)<4);last={x:w.player.x,y:w.player.y};}assert.equal(w.player.floor,1);
});
