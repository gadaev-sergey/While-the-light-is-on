import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/game/world.ts';
import { COMBOS, MOVES, attackPose, comboBaseDamage, type AttackInput } from '../src/game/combat.ts';

const neutral={x:0,y:0};
function setup(){const w=new World({volume:0,particles:false,shake:false,difficulty:'normal'});w.start(true);w.enemies[0].x=w.player.x+100;return w;}
function step(w:World,n=1){for(let i=0;i<n;i++)w.update(1/60);}
function until(w:World,condition:()=>boolean){for(let i=0;i<300&&!condition();i++)step(w);assert.ok(condition(),'condition did not occur during combat');}
function strike(w:World,input:AttackInput){assert.ok(w.acceptsAction(input));w.action(input,neutral);until(w,()=>w.player.attack===0&&!w.hitstop);}
function recipe(w:World,inputs:AttackInput[]){for(const input of inputs)strike(w,input);}

test('Fist, keyboard and kick have distinct contact atlases, timing and damage',()=>{
  for(const [input,id,damage,sheet] of [['attack','jab',20,'punch'],['heavy','heavy',38,'attack'],['kick','kick',28,'kick']] as const){
    const w=setup(),e=w.enemies[0];w.action(input,neutral);
    assert.equal(w.player.move,id);step(w,Math.floor(MOVES[id].impact*60)-1);assert.equal(e.hp,1200);
    until(w,()=>w.player.attackHit);assert.equal(e.hp,1200-damage);assert.equal(e.height,0);
    assert.deepEqual(attackPose(MOVES[id],MOVES[id].impact),[{frame:`${sheet}:4`,weight:1}]);
  }
});

test('Every successful ordered recipe charges a separate super after the final recovery',()=>{
  for(const combo of COMBOS){
    const w=setup(),e=w.enemies[0];
    recipe(w,combo.inputs.slice(0,-1));w.action(combo.inputs.at(-1)!,neutral);
    until(w,()=>w.player.attackConnected);assert.equal(w.readySuper,null,'contact must not skip the last recovery');
    until(w,()=>w.player.attack===0);assert.equal(w.readySuper,combo.id);
    assert.equal(w.comboCount,3);assert.equal(w.comboDamage,comboBaseDamage(combo));
    assert.equal(w.player.move,combo.inputs.at(-1)==='heavy'?'heavy':'kick','last base strike stays a base strike');
    w.action('super',neutral);assert.equal(w.player.move,combo.id);assert.equal(w.readySuper,null);
    assert.equal(w.superEffects.length,0,'super has a distinct anticipation');
    until(w,()=>w.superEffects.some(s=>s.hitIds.includes(e.id)));
    assert.equal(w.comboCount,4);assert.equal(w.comboDamage,comboBaseDamage(combo)+MOVES[combo.id].damage);
    const damage=w.comboDamage;step(w,55);assert.equal(w.comboDamage,damage,'each super hits a target only once');
    if(combo.id==='overflow')assert.ok(e.height>0||e.state==='down');
  }
});

test('Simultaneous buttons, early recovery presses and hit-stop presses never queue attacks',()=>{
  const w=setup();w.update(1/60,neutral,['attack','heavy','kick','super','pulse']);
  assert.equal(w.attackSerial,1);assert.equal(w.player.move,'jab');assert.equal(w.player.pulseCooldown,0);
  until(w,()=>w.player.attackHit);assert.ok(w.hitstop>0);assert.equal(w.acceptsAction('heavy'),false);
  w.update(1/60,neutral,['heavy','kick']);
  until(w,()=>w.hitstop===0);w.action('heavy',neutral);
  until(w,()=>w.player.attack<1/60&&w.player.attack>0);w.update(1/60,neutral,['kick']);
  step(w,40);assert.equal(w.attackSerial,1);assert.equal(w.comboCount,1);assert.equal(w.readySuper,null);
  assert.deepEqual(w.inputLog.map(i=>i.key),['J']);
});

test('Wrong order, misses, expiry and turning cannot unlock a super',()=>{
  const wrong=setup();recipe(wrong,['attack','heavy','heavy']);assert.equal(wrong.readySuper,null);
  const miss=setup();strike(miss,'attack');miss.enemies[0].x+=400;strike(miss,'attack');strike(miss,'heavy');assert.equal(miss.readySuper,null);
  const expiry=setup();strike(expiry,'attack');step(expiry,65);recipe(expiry,['attack','heavy']);assert.equal(expiry.readySuper,null);
  const turn=setup();strike(turn,'attack');turn.action('attack',{x:-1,y:0});until(turn,()=>!turn.player.attack);assert.equal(turn.chain.length,0);
});

test('Damage interrupts a string; dash cannot skip an attack; pause preserves a started strike',()=>{
  const w=setup();strike(w,'attack');w.action('attack',neutral);w.damagePlayer(10,-1);
  assert.equal(w.player.attack,0);assert.equal(w.pendingInput,null);assert.equal(w.chain.length,0);
  const dash=setup();dash.action('heavy',neutral);dash.action('dash',neutral);assert.equal(dash.player.dash,0);assert.equal(dash.player.move,'heavy');
  const pause=setup();pause.action('attack',neutral);pause.setPhase('paused');const duration=pause.player.attack;step(pause,20);assert.equal(pause.player.attack,duration);
  pause.setPhase('playing');until(pause,()=>!pause.player.attack);assert.deepEqual(pause.chain,['attack']);
});

test('Charged super expires, cannot fire in midair, and freezes its lifetime while paused',()=>{
  const w=setup();recipe(w,COMBOS[0].inputs);w.action('jump',neutral);step(w,20);w.action('super',neutral);assert.equal(w.player.move,'heavy');assert.equal(w.readySuper,'delete');
  w.setPhase('paused');const timer=w.superTimer;step(w,60);assert.equal(w.superTimer,timer);w.setPhase('playing');step(w,900);assert.equal(w.readySuper,null);
});

test('HOTFIX pierces multiple enemies, with swept collision and height separation',()=>{
  const w=setup();recipe(w,COMBOS[2].inputs);const e=w.enemies[0];
  const other={...e,id:999,x:w.player.x+420,hp:1200,attackId:-1};const above={...e,id:1000,x:w.player.x+300,hp:1200,height:280,verticalSpeed:0,state:'airborne' as const};
  w.enemies.push(other,above);w.action('super',neutral);until(w,()=>w.superEffects.length>0);
  // Keep the third target well above the projectile's actual vertical hitbox.
  for(let i=0;i<35;i++){above.height=280;above.verticalSpeed=0;step(w);}
  assert.equal(other.hp,1070);assert.equal(above.hp,1200);
});

test('Grounded strikes respect altitude and cannot attack knocked-down enemies',()=>{
  for(const air of [true,false]){
    const w=setup(),e=w.enemies[0];if(air){e.state='airborne';e.height=230;e.verticalSpeed=0;}else{e.state='down';e.timer=1;}
    w.action('attack',neutral);until(w,()=>w.player.attackHit);assert.equal(e.hp,1200);
  }
});

test('Frontal guard parries early, reduces later damage, breaks when depleted, and cannot cover the back',()=>{
  const w=setup(),p=w.player;w.action('guard-start',neutral);step(w);
  assert.equal(w.damagePlayer(15,-1),'parry');assert.equal(p.hp,120);assert.equal(p.guardMeter,74);
  step(w,20);assert.equal(w.damagePlayer(15,-1),'block');assert.equal(p.hp,117);assert.equal(p.guardMeter,48);
  w.damagePlayer(15,-1);assert.equal(p.guardMeter,22);w.damagePlayer(15,-1);assert.equal(p.hp,99);assert.equal(p.guarding,false);assert.equal(p.guardMeter,0);
  const behind=setup();behind.action('guard-start',neutral);step(behind);behind.damagePlayer(15,1);assert.equal(behind.player.hp,105);
});

test('Boss windup resists base strikes but a separately released super breaks armor',()=>{
  const w=setup(),e=w.enemies[0];w.training=false;e.kind='boss';e.state='windup';e.timer=10;
  recipe(w,COMBOS[0].inputs);assert.equal(e.hp,1200-11-11-21);assert.equal(e.state,'windup');
  w.action('super',neutral);until(w,()=>w.comboCount===4);assert.equal(e.state,'recover');assert.equal(e.height,0);assert.equal(e.hp,1042);
});

test('Training restores the dummy and resets charges on restart',()=>{
  const w=setup();recipe(w,COMBOS[0].inputs);w.damageEnemy(w.enemies[0],9999,1,0);step(w,250);
  assert.equal(w.phase,'playing');assert.equal(w.sector,0);assert.equal(w.enemies.length,1);assert.equal(w.enemies[0].hp,1200);
  w.start();assert.equal(w.training,false);assert.equal(w.enemies.length,3);assert.equal(w.readySuper,null);assert.equal(w.superEffects.length,0);
});
