import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseAnimator, sampleClip, interpolatedPosition, type AnimationClip } from '../src/game/animation.ts';
import { visibleTiles } from '../src/game/ground.ts';

const run:AnimationClip={frames:['a','b','c','d','e','f','g','h'],duration:.56,loop:true};
const weights=(poses:{frame:string;weight:number}[])=>Object.fromEntries(poses.map(p=>[p.frame,p.weight]));
test('A running loop is continuous at its wrap and retains total opacity',()=>{
  for(let t=0;t<2;t+=1/240){const poses=sampleClip(run,t);assert.ok(Math.abs(poses.reduce((n,p)=>n+p.weight,0)-1)<.00001);}
  const before=weights(sampleClip(run,.56-.00001)),after=weights(sampleClip(run,.56+.00001));
  assert.ok(Math.abs((before.a||0)-(after.a||0))<.001);
});
test('Starting and stopping a run preserve the current pose and do not use global time',()=>{
  const a=new PoseAnimator();a.update('idle',{frames:['idle'],duration:1},0);
  const start=weights(a.update('run',run,0));assert.equal(start.idle,1);
  a.update('run',run,.1);const pose=structuredClone(a.current);const paused=a.update('run',run,0);assert.deepEqual(paused,pose);
  const stopped=a.update('idle',{frames:['idle'],duration:1},0);assert.deepEqual(stopped,pose);
  const b=new PoseAnimator();b.update('run',run,0);assert.equal(b.time,0);
});
test('Render positions interpolate fixed simulation steps without changing physics',()=>{
  const p={previousX:100,previousY:550,x:104,y:552};
  assert.deepEqual(interpolatedPosition(p,.25),{x:101,y:550.5});assert.equal(p.x,104);
  const samples=Array.from({length:5},(_,i)=>interpolatedPosition(p,i/4).x);
  assert.deepEqual(samples,[100,101,102,103,104]);
});
test('Ground tiles preserve identity while crossing positive and negative wrap boundaries',()=>{
  for(const boundary of [-1280,0,1280,2560]){
    const before=visibleTiles(boundary-.1,1280),after=visibleTiles(boundary+.1,1280);
    const common=before.filter(a=>after.some(b=>b.index===a.index));assert.ok(common.length);
    for(const a of common){const b=after.find(b=>b.index===a.index)!;assert.ok(Math.abs(b.x-a.x+.2)<.00001);}
  }
});
