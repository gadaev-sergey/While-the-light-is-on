import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World,noControls,readLevel,type Controls} from '../../games/lumen/scripts/world.ts';
import {validateSnapshot} from '../../src/engine/project.ts';

const root=new URL('../../games/lumen/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('project.shelter.json',root),'utf8'));
const scenes=manifest.scenes.map((s:{path:string})=>JSON.parse(readFileSync(new URL(s.path,root),'utf8')));
const fresh=()=>{const w=new World(structuredClone(scenes),manifest.startScene);w.newGame();advance(w,.2);return w;};
function advance(w:World,seconds:number,input:Partial<Controls>={}){for(let i=0;i<Math.round(seconds*120);i++)w.step(1/120,{...noControls(),...input,jumpPressed:i===0&&!!input.jumpPressed,dashPressed:i===0&&!!input.dashPressed,interact:i===0&&!!input.interact});}

test('all three authored levels are native, valid Shelter scenes with nine lenses',()=>{
 validateSnapshot({manifest,scenes:Object.fromEntries(scenes.map((s:any)=>[s.id,s]))});
 assert.equal(scenes.length,3);assert.equal(scenes.flatMap((s:any)=>readLevel(s).things.filter(t=>t.kind==='lens')).length,9);
});
test('floor collision, acceleration and braking are stable',()=>{const w=fresh();assert.equal(w.hero.y,606);advance(w,.5,{right:true});assert.ok(w.hero.x>250);advance(w,.7);assert.ok(Math.abs(w.hero.vx)<.05);assert.equal(w.hero.y,606);});
test('double jump gains height and a third jump is rejected',()=>{const w=fresh();advance(w,.24,{jump:true,jumpPressed:true});const first=w.hero.y;advance(w,.12,{jump:true,jumpPressed:true});assert.ok(w.hero.y<first-35);assert.equal(w.hero.jumps,2);const vy=w.hero.vy;advance(w,1/120,{jump:true,jumpPressed:true});assert.ok(w.hero.vy>vy);});
test('short jump is lower than holding jump',()=>{const a=fresh(),b=fresh();advance(a,.22,{jump:true,jumpPressed:true});advance(b,.22,{jumpPressed:true});assert.ok(b.hero.y>a.hero.y+25);});
test('dash has a cooldown and covers meaningful distance',()=>{const w=fresh(),start=w.hero.x;advance(w,.18,{dashPressed:true});assert.ok(w.hero.x-start>130);const cooldown=w.hero.cooldown;advance(w,1/120,{dashPressed:true});assert.ok(w.hero.cooldown<cooldown);assert.equal(w.hero.dash,0);});
test('falling respawns at the checkpoint without losing collected items',()=>{const w=fresh(),cp=w.level.things.find(t=>t.kind==='checkpoint')!;w.hero.x=cp.x;w.hero.y=606;advance(w,.02);assert.equal(w.checkpoint,cp.id);w.collected.add(w.level.things.find(t=>t.kind==='lens')!.id);w.hero.y=1100;advance(w,.02);assert.equal(w.deaths,1);assert.equal(w.lenses,1);assert.equal(w.hero.hp,3);assert.ok(Math.abs(w.hero.x-cp.x)<10);});
test('contact damage cannot drain all hearts during one overlap',()=>{const w=fresh();w.hero.invulnerable=0;w.hurt(w.hero.x+50);assert.equal(w.hero.hp,2);for(let i=0;i<20;i++)w.hurt(w.hero.x+50);assert.equal(w.hero.hp,2);});
test('a collected lens is counted only once and restores health',()=>{const w=fresh(),lens=w.level.things.find(t=>t.kind==='lens')!;w.hero.x=lens.x;w.hero.y=lens.y;w.hero.hp=2;advance(w,.02);assert.equal(w.lenses,1);assert.equal(w.hero.hp,3);w.hero.y=lens.y;advance(w,.02);assert.equal(w.lenses,1);});
test('beacons reject missing lenses and transition after all three are found',()=>{const w=fresh(),b=w.level.things.find(t=>t.kind==='beacon')!;w.hero.x=b.x;w.hero.y=606;advance(w,.02,{interact:true});assert.equal(w.phase,'playing');for(const l of w.level.things.filter(t=>t.kind==='lens'))w.collected.add(l.id);advance(w,.02,{interact:true});assert.equal(w.phase,'transition');advance(w,3.5);assert.equal(w.level.id,'hanging-gardens');assert.equal(w.lenses,0);assert.equal(w.lit.size,1);});
test('final beacon produces a finite victory state',()=>{const w=fresh();w.level=w.levels[2];w.checkpoint='';w.spawn();const b=w.level.things.find(t=>t.kind==='beacon')!;w.hero.x=b.x;w.hero.y=606;for(const l of w.level.things.filter(t=>t.kind==='lens'))w.collected.add(l.id);advance(w,.02,{interact:true});advance(w,3.5);assert.equal(w.phase,'won');assert.equal(w.save().won,true);});
test('progress round trips safely, malformed progress is ignored',()=>{const w=fresh();advance(w,1);const lens=w.level.things.find(t=>t.kind==='lens')!;w.collected.add(lens.id);const restored=fresh();assert.equal(restored.restore(w.save()),true);assert.equal(restored.lenses,1);assert.equal(restored.seconds,w.seconds);assert.equal(restored.restore({version:1}),false);assert.equal(restored.restore({...w.save(),scene:'missing'}),false);});
test('pause stops physical simulation and timer',()=>{const w=fresh();w.phase='paused';const x=w.hero.x,t=w.seconds;advance(w,2,{right:true,jumpPressed:true});assert.equal(w.hero.x,x);assert.equal(w.seconds,t);});
test('editor preview starts in the selected scene',()=>{const w=new World(structuredClone(scenes),'hanging-gardens');w.newGame();assert.equal(w.level.id,'hanging-gardens');});

// Route tests use only real movement inputs. No teleportation, item injection or
// invulnerability: every mandatory lens and all three exits must be reachable.
function reach(w:World,x:number,feet:number,jump=false){
 let elapsed=0,didSecond=false;const beforeDeaths=w.deaths;
 for(let frame=0;frame<120*8;frame++){
  const h=w.hero,dx=x-(h.x+h.w/2),second=jump&&!didSecond&&elapsed>=.31&&!h.grounded;
  if(second)didSecond=true;
  const brake=h.vx*.08,dir=dx-brake;const control={...noControls(),right:dir>5,left:dir< -5,jump:jump,jumpPressed:jump&&(frame===0||second)};
  w.step(1/120,control);elapsed+=1/120;
  if(w.deaths!==beforeDeaths)throw new Error(`Route fell: ${w.level.id} target ${x},${feet}; position ${h.x.toFixed(0)},${h.y.toFixed(0)}`);
  if(Math.abs(x-(h.x+h.w/2))<20&&h.grounded&&Math.abs(h.y+h.h-feet)<6)return;
 }
 throw new Error(`Unreachable route: ${w.level.id} target ${x},${feet}; at ${w.hero.x.toFixed(0)},${(w.hero.y+54).toFixed(0)}; lenses ${w.lenses}`);
}
test('full campaign can be completed with normal controls',()=>{
 const w=fresh();
 const routes=[
  [[420,660],[545,550,1],[695,460,1],[1100,660,1],[1200,660],[1400,545,1],[1700,430,1],[1870,525,1],[2160,660,1],[2390,535,1],[2640,455,1],[3030,660,1],[3300,550,1],[3545,435,1],[3780,540,1],[4060,660,1],[4300,660]],
  [[350,545,1],[640,445,1],[1010,660,1],[1150,530,1],[1390,410,1],[1550,660],[1800,535,1],[2050,550,1],[2330,435,1],[2740,520,1],[3060,535,1],[3400,415,1],[3560,660],[3750,550,1],[4060,545,1],[4265,430,1],[4470,330,1],[4740,660,1],[4790,660]],
  [[470,540,1],[710,440,1],[1020,660,1],[1130,540,1],[1380,420,1],[1570,510,1],[1800,555,1],[2090,545,1],[2340,430,1],[2745,410,1],[3100,540,1],[3400,425,1],[3620,525,1],[3830,540,1],[4100,545,1],[4280,430,1],[4490,320,1],[4700,445,1],[5000,660,1]],
 ];
 for(let level=0;level<3;level++){
  for(const [x,feet,jump] of routes[level])reach(w,x,feet,!!jump);
  assert.equal(w.lenses,3,`All lenses in ${w.level.name}`);advance(w,.02,{interact:true});assert.equal(w.phase,'transition');advance(w,3.5);
 }
 assert.equal(w.phase,'won');assert.equal(w.totalLenses,9);assert.equal(w.lit.size,3);
});
