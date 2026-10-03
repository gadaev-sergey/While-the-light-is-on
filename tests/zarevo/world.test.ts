import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectSegment} from '../../games/zarevo/scripts/renderer.ts';
import {World,readTrack,buildSegments,roadOffsets,MAX_SPEED,SEGMENT,CENTRIFUGAL,cornerLimit,type Controls} from '../../games/zarevo/scripts/world.ts';

const ids=['coast','pass','city'];
const scenes=ids.map(id=>JSON.parse(readFileSync(new URL(`../../games/zarevo/scenes/${id}.scene.json`,import.meta.url),'utf8')));
const idle:Controls={steer:0,gas:0,brake:0,nitro:false};
function seeded(seed=17){return ()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function fresh(track='coast'){const w=new World(scenes,seeded());w.start(track);step(w,3.2);return w;}
function step(w:World,seconds:number,c:Controls|((w:World)=>Controls)=idle){for(let i=0;i<Math.round(seconds*120);i++)w.step(1/120,typeof c==='function'?c(w):c);}
/** Аккуратный гонщик: компенсирует поворот, объезжает машины, тратит нитро на прямых. */
export function driver(skill=1){return (w:World):Controls=>{
 const p=w.player,seg=w.segmentAt(p.z+SEGMENT*3);let target=p.x;
 const lanes=[-.66,0,.66].map(lane=>({lane,cost:Math.abs(lane-p.x)*.2+w.cars.filter(c=>{const a=c.z-p.z;return a>-SEGMENT&&a<SEGMENT*22&&Math.abs(c.x-lane)<.42&&c.speed<p.speed*1.02;}).reduce((n,c)=>n+1/Math.max(1,(c.z-p.z)/SEGMENT),0)}));
 target=lanes.sort((a,b)=>a.cost-b.cost)[0].lane;
 const steer=Math.max(-1,Math.min(1,(target-p.x)*4+seg.curve*CENTRIFUGAL*(p.speed/MAX_SPEED)*skill));
 return {steer,gas:p.speed>MAX_SPEED*cornerLimit(seg.curve)*.98?0:1,brake:0,nitro:Math.abs(seg.curve)<1&&p.nitro>.3};
};}

test('All three tracks load with checkpoints, scenery and a finish line',()=>{
 for(const scene of scenes){const t=readTrack(scene),s=buildSegments(t);assert.ok(t.sections.length>=15);assert.ok(t.checkpoints.length>=3);assert.ok(s.some(x=>x.props.length>0));assert.equal(s.filter(x=>x.checkpoint<0).length,1);assert.ok(s.every(x=>[x.curve,x.y1,x.y2].every(Number.isFinite)));}
});
test('Invalid track data is rejected before the race',()=>{
 const broken=structuredClone(scenes[0]);broken.moduleData.zarevo.theme='moon';assert.throws(()=>readTrack(broken),/оформление/);
 const curve=structuredClone(scenes[0]);curve.nodes[0].components[0].values.curve=40;assert.throws(()=>readTrack(curve),/поворот/);
});
test('Countdown holds the grid, then the race clock starts',()=>{
 const w=new World(scenes,seeded());w.start('coast');step(w,2,{...idle,gas:1});assert.equal(w.phase,'countdown');assert.equal(w.player.speed,0);assert.ok(w.cars.filter(c=>c.kind==='rival').every(c=>c.speed===0));
 step(w,1.2);assert.equal(w.phase,'racing');step(w,1,{...idle,gas:1});assert.ok(w.player.speed>0);assert.ok(w.time<w.track.time);
});
test('Leaving the asphalt slows the car and roadside objects stop it',()=>{
 const w=fresh();w.cars=[];w.player.speed=MAX_SPEED;w.player.x=1.6;step(w,.5,{...idle,gas:1});assert.ok(w.player.speed<MAX_SPEED*.75);
 const c=fresh();c.cars=[];const seg=c.segments.findIndex((s,i)=>i>20&&s.props.some(p=>p.solid));const prop=c.segments[seg].props.find(p=>p.solid)!;
 Object.assign(c.player,{z:(seg-2)*SEGMENT,x:prop.offset,speed:MAX_SPEED*.9});step(c,.3,{...idle,gas:1});assert.ok(c.player.speed<=MAX_SPEED*.2);
});
test('Rear-ending a car costs speed; passing close charges nitro',()=>{
 const w=fresh();w.cars=w.cars.filter(c=>c.kind==='traffic').slice(0,1);const car=w.cars[0];Object.assign(car,{z:w.player.z+SEGMENT*3,x:0,target:0,speed:MAX_SPEED*.3});
 Object.assign(w.player,{x:0,speed:MAX_SPEED*.95});step(w,.4,{...idle,gas:1});assert.ok(w.player.speed<MAX_SPEED*.5);assert.ok(w.player.z<car.z);
 const m=fresh();m.cars=m.cars.filter(c=>c.kind==='traffic').slice(0,1);const other=m.cars[0];Object.assign(other,{z:m.player.z+SEGMENT*4,x:0,target:0,speed:MAX_SPEED*.3,passed:false});
 Object.assign(m.player,{x:.42,speed:MAX_SPEED*.95,nitro:0});step(m,.6,{...idle,gas:1});assert.equal(m.misses,1);assert.ok(m.player.nitro>=.19);
});
test('Nitro raises top speed and drains the gauge',()=>{
 const w=fresh();w.cars=[];Object.assign(w.player,{speed:MAX_SPEED,nitro:1});w.segments.forEach(s=>s.curve=0);step(w,1.5,{...idle,gas:1,nitro:true});assert.ok(w.player.speed>MAX_SPEED*1.1);assert.ok(w.player.nitro<.5);
});
test('Checkpoints extend the clock and running out ends the attempt',()=>{
 const w=fresh();w.cars=[];const cp=w.track.checkpoints[0];w.player.z=(cp.segment-1)*SEGMENT;w.player.speed=MAX_SPEED;const before=w.time;step(w,.1,{...idle,gas:1});assert.ok(w.time>before+cp.bonus-1);
 const t=fresh();t.time=.05;step(t,.2);assert.equal(t.phase,'timeout');const z=t.player.z,s=t.seconds;step(t,1,{...idle,gas:1});assert.equal(t.seconds,s);assert.equal(t.phase,'timeout');assert.ok(t.player.z>=z);
});
test('Pause freezes the race clock',()=>{
 const w=fresh();step(w,1,{...idle,gas:1});const s=w.seconds;w.pause(true);step(w,2,{...idle,gas:1});assert.equal(w.seconds,s);w.pause(false);assert.equal(w.phase,'racing');
});
for(const id of ids)test(`A clean driver finishes ${id} on the podium in time`,()=>{
 const w=fresh(id);step(w,240,driver());assert.equal(w.phase,'finished',`ended in ${w.phase} at ${(w.progressShare*100).toFixed(1)}%`);
 assert.ok(w.result!.place<=3,`place ${w.result!.place}`);console.log(id,w.result);
});
test('A passive driver loses time and rivals still race to the finish',()=>{
 const w=fresh('coast');step(w,240,(x:World)=>({...driver()(x),gas:x.player.speed<MAX_SPEED*.7?1:0,nitro:false}));assert.notEqual(w.result?.place,1);assert.ok(w.cars.some(c=>c.finished>0));
});
test('Finishing in top three unlocks the next track and saves the best result',()=>{
 const w=fresh();w.cars.forEach(c=>{if(c.kind==='rival')c.z=0;});w.player.z=w.finishZ-SEGMENT;w.player.speed=MAX_SPEED;step(w,.2,{...idle,gas:1});
 assert.equal(w.phase,'finished');assert.equal(w.result!.place,1);assert.equal(w.progress.unlocked,2);assert.ok(w.progress.best.coast.time>0);
 const r=new World(scenes);r.restore({unlocked:99,best:{coast:{time:-1,place:1},pass:{time:80,place:2}}});assert.equal(r.progress.unlocked,3);assert.equal(r.progress.best.coast,undefined);assert.equal(r.progress.best.pass.place,2);
});
test('Title demo loops forever without leaving the track',()=>{
 const w=new World(scenes,seeded());for(let i=0;i<5;i++)step(w,60);assert.equal(w.phase,'title');assert.ok(Math.abs(w.player.x)<1.2);assert.ok(w.player.z<w.finishZ);
});
test('A right-hand bend is drawn to the right and pushes the car outward to the left',()=>{
 const segs=buildSegments(readTrack(scenes[0])).map(s=>({...s,curve:0}));for(let i=10;i<200;i++)segs[i].curve=3;
 const {near,far}=roadOffsets(segs,0,.5,150);assert.ok(far[149]>0&&far[149]>far[60],'the road must bend toward positive screen x');
 for(let n=0;n<150;n++)assert.ok(far[n]>=near[n]-1e-9);
 const left=roadOffsets(segs.map(s=>({...s,curve:-s.curve})),0,.5,150);assert.ok(left.far[149]<0);
 // На экране шириной 1000 дальний участок правого поворота должен уйти правее центра.
 const screen=(bend:{near:number[];far:number[]},n:number)=>projectSegment(segs[n],n,bend,0,1000,-SEGMENT,1000,300,300).b.x;
 assert.ok(screen({near,far},140)>520,'right-hand bend must render to the right');assert.ok(screen(left,140)<480,'left-hand bend must render to the left');
 const w=fresh();w.cars=[];w.segments.forEach(s=>s.curve=3);Object.assign(w.player,{x:0,speed:MAX_SPEED});step(w,.5,{...idle,gas:1});
 assert.ok(w.player.x<-.05,'without steering the car drifts to the outside of the bend');
});
