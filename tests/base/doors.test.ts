import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseWorld,DOOR_CLEARANCE} from '../../src/base/world.ts';
import {flashlightReaches} from '../../src/base/lighting.ts';
import {backPoint,doorLeaf,doorGeometry} from '../../src/base/architecture.ts';
const step=(w:BaseWorld,seconds:number,dx=0)=>{for(let t=0;t<seconds;t+=1/60)w.update(1/60,dx);};
function setup(side:1|-1){const w=new BaseWorld(),d=w.doors.find(d=>d.id==='home/kitchen-door')!;Object.assign(w.player,{x:d.x+side*80,previousX:d.x+side*80,facing:-side});w.aim=side===-1?0:Math.PI;w.refreshSight();return {w,d};}

test('Both approaches stop at a closed door, grip its handle, and keep eyes and lamp outside',()=>{
 for(const side of [-1,1] as const){const {w,d}=setup(side);step(w,2,-side);assert.ok((w.player.x-d.x)*side>=DOOR_CLEARANCE);assert.ok(Math.abs(w.player.x+w.player.facing*w.doorHand!.x-doorGeometry(w.level,d).handle.x)<.001);assert.equal(w.player.moving,false);assert.equal(w.doorInteraction?.phase,'grip');assert.equal(w.doorInteraction.reach,1);
  assert.ok((w.lightOrigin.x-d.x)*side>0);for(const offset of [.1,1,35,150]){const point={x:d.x-side*offset,y:w.lightOrigin.y};assert.equal(w.visible(point),false);assert.equal(flashlightReaches(w.lightOrigin,w.aim,point,w.sight.segments),false);}
 }
});
test('Reaching cannot be skipped by pressing both choices, and opening retains occlusion until finished',()=>{
 const {w,d}=setup(-1);w.player.x=1000;w.action({type:'interact',target:d.id});w.action({type:'door-open'});w.action({type:'door-peek'});assert.equal(d.open,false);assert.equal(w.sight.peek,undefined);
 step(w,.8);w.action({type:'door-open'});step(w,.15,1);assert.ok(d.openness!>0&&d.openness!<1);assert.equal(w.visible({x:1200,y:539}),false);assert.ok(w.player.x<=d.x-DOOR_CLEARANCE);
 step(w,.4);assert.equal(d.open,true);assert.equal(w.doorInteraction,null);step(w,1,1);assert.ok(w.player.x>1100);
});
test('Keyhole requires the completed bend; its cone reveals a narrow sector but never carries the lamp',()=>{
 for(const side of [-1,1] as const){const {w,d}=setup(side);step(w,1,-side);w.action({type:'door-peek'});step(w,.2);assert.equal(w.sight.peek,undefined);step(w,.4);assert.ok(w.sight.peek);
  const ahead={x:d.x-side*150,y:w.floorY(0)-76};assert.equal(w.visible(ahead),true);assert.equal(w.visible({...ahead,y:ahead.y-45}),false);assert.equal(w.visible({...ahead,y:ahead.y+45}),false);assert.equal(flashlightReaches(w.lightOrigin,w.aim,ahead,w.sight.segments),false);
  w.action({type:'door-open'});assert.equal(d.open,false);w.action({type:'door-peek'});assert.equal(w.visible(ahead),false);step(w,.6);assert.equal(w.doorInteraction?.lean,0);
 }
});
test('Peeking respects a second closed door and retreat immediately hides its view',()=>{
 const {w,d}=setup(-1);w.doors.push({id:'test-divider',name:'Дверь',x:1170,floor:0,open:false});w.level={...w.level,rooms:w.level.rooms.flatMap(r=>r.id==='home/kitchen'?[{...r,end:1170},{...r,id:'rear',x:1170}]:[r])};step(w,1,1);w.action({type:'door-peek'});step(w,.6);
 assert.equal(w.visible({x:1130,y:539}),true);assert.equal(w.visible({x:1210,y:539}),false);step(w,.1,-1);assert.equal(w.doorInteraction,null);assert.equal(w.visible({x:1130,y:539}),false);assert.ok(w.player.x<d.x-DOOR_CLEARANCE);
});
test('Gameplay locks permit observation, prohibit opening and survive a stale open save',()=>{
 const {w,d}=setup(-1);d.locked=true;d.lockReason='Нужен ключ от кухни';step(w,1,1);w.action({type:'door-open'});assert.equal(d.open,false);assert.equal(w.toast,d.lockReason);w.action({type:'door-peek'});step(w,.6);assert.ok(w.sight.peek);
 const saved=w.save();saved.doors.find(x=>x.id===d.id)!.open=true;saved.player.x=d.x+1;
 const level=structuredClone(w.level);level.doors.find(x=>x.id===d.id)!.locked=true;const restored=new BaseWorld(level);assert.ok(restored.restore(saved));assert.equal(restored.doors.find(x=>x.id===d.id)!.open,false);assert.ok(restored.player.x>=d.x+DOOR_CLEARANCE);assert.equal(restored.doorInteraction,null);assert.equal(restored.sight.peek,undefined);
});
test('The fixed rear hinge lets the free door edge sweep into either side of a room',()=>{
 const w=new BaseWorld();for(const door of w.doors){const room=w.level.rooms.find(r=>r.floor===door.floor&&r.x===door.x)||w.level.rooms.find(r=>r.floor===door.floor&&r.end===door.x)!,y=w.floorY(door.floor),hinge=backPoint(room,door.x,y,y),depth={x:hinge.x-door.x,y:hinge.y-y};
  const shut=doorLeaf({open:false},depth),open=doorLeaf({open:true},depth);assert.equal(hinge.x+shut.x,door.x);assert.equal(hinge.y+shut.y,y);assert.ok(open.x*Math.sign(depth.x)>40);assert.ok(hinge.y+open.y<y);assert.ok(open.nearScale<shut.nearScale);
 }
});


test('Open doors close immediately from either side without a handle pose or keyhole choice',()=>{
 for(const side of [-1,1] as const){const {w,d}=setup(side);d.open=true;d.openness=1;w.player.x=d.x+side*70;w.refreshSight();const before=w.player.x;
  assert.equal(w.description(d.id)?.verb,'Закрыть');w.beginDoor(d);assert.equal(w.doorInteraction,null);w.action({type:'door-peek'});assert.equal(w.sight.peek,undefined);
  w.action({type:'interact',target:d.id});assert.equal(d.open,false);assert.equal(w.doorInteraction,null);assert.equal(w.player.x,before);assert.equal(w.visible({x:d.x-side*80,y:540}),false);
  step(w,.6);assert.equal(d.openness,0);assert.equal(w.doorInteraction,null);
 }
});
test('Closing while standing in the threshold keeps the actor and lamp on the original side',()=>{
 for(const side of [-1,1] as const){const {w,d}=setup(side);d.open=true;d.openness=1;w.player.x=d.x+side*4;w.refreshSight();w.action({type:'interact',target:d.id});
  assert.equal(d.open,false);assert.equal(w.doorInteraction,null);assert.ok((w.player.x-d.x)*side>=DOOR_CLEARANCE);assert.ok((w.lightOrigin.x-d.x)*side>0);assert.equal(w.player.previousX,w.player.x);
 }
});
