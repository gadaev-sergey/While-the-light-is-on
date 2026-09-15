import test from 'node:test';
import assert from 'node:assert/strict';
import {backPoint,floorFace,openingPlacement} from '../../src/base/architecture.ts';
import {LOCATION} from '../../src/base/config.ts';

test('Every room has two visible side returns and its own centred vanishing point',()=>{
 for(const room of LOCATION.rooms){const y=LOCATION.groundY-room.floor*LOCATION.floorHeight,center=(room.x+room.end)/2,left=backPoint(room,room.x,y+3,y),right=backPoint(room,room.end,y+3,y),middle=backPoint(room,center,y+3,y);
  assert.ok(left.x>room.x&&right.x<room.end);assert.ok(Math.abs((left.x-room.x)-(room.end-right.x))<1e-9);assert.equal(middle.x,center);assert.equal(left.y,right.y);assert.ok(left.y<y);
  const ceiling=backPoint(room,room.x,y-LOCATION.floorHeight+8,y);assert.equal(ceiling.x,left.x);assert.ok(ceiling.y>y-LOCATION.floorHeight+8);
  const half=floorFace(room,room.x,center,y),whole=floorFace(room,room.x,room.end,y);assert.deepEqual(half[3],whole[3]);assert.equal(half[2].x,center);
 }
});

test('Projected windows and breaches fit the inset back wall of their room',()=>{
 for(const o of LOCATION.openings.filter(o=>o.plane==='back')){const room=LOCATION.rooms.find(r=>r.id===o.roomId)!,y=LOCATION.groundY-o.floor*LOCATION.floorHeight,a=backPoint(room,room.x,y-LOCATION.floorHeight+8,y),b=backPoint(room,room.end,y+3,y),p=openingPlacement(LOCATION,o);
  assert.ok(p.x-p.width/2>=a.x&&p.x+p.width/2<=b.x);assert.ok(p.bottom<=b.y&&p.bottom-p.height>=a.y);assert.ok(p.width<o.width&&p.height<o.height);
 }
});
