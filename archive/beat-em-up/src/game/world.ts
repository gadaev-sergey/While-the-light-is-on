import { ENEMIES, SECTORS, VIEW } from './content.ts';
import { clamp, distance, meleeInRange, normalize, seededRandom } from './math.ts';
import { MOTION } from './locomotion.ts';
import { ATTACK_KEYS, CHAIN_WINDOW, SUPER_WINDOW, MOVES, hasContinuation, matchingCombo, isAttackInput, resolveMove, type AttackInput, type SuperId, type MoveId } from './combat.ts';
import { floorAt, stairApproach, OFFICE_LEVELS, FLOOR_HEIGHT, inStairwell, stairHeight } from './terrain.ts';
import type { Action, Enemy, FloatText, GameSettings, GameStats, Particle, Phase, Pickup, Player, Slash, SuperEffect, SoundName, Upgrade, Vec } from './types.ts';

export class World {
  phase: Phase = 'menu'; sector = 0; camera = 0; clock = 0; shake = 0; hitstop = 0;
  player!: Player; enemies: Enemy[] = []; particles: Particle[] = []; texts: FloatText[] = []; slashes: Slash[] = []; pickups: Pickup[] = [];
  stats!: GameStats; comboCount = 0; comboTimer = 0; clearTimer = 0;
  liftTravel=0;liftAnnounced=false;
  attackSerial = 0; enemySerial = 0; random = seededRandom(404);
  training=false;practiceTimer=0;comboDamage=0;chain:AttackInput[]=[];chainTimer=0;chainAir=false;
  pendingInput:AttackInput|null=null;readySuper:SuperId|null=null;superTimer=0;superEffects:SuperEffect[]=[];
  inputLog:{key:string;life:number}[]=[];moveNotice='';moveNoticeTimer=0;
  onPhase: (phase: Phase) => void = () => {}; onSound: (sound: SoundName) => void = () => {};
  onToast: (title: string, subtitle: string) => void = () => {};
  settings: GameSettings;
  constructor(settings: GameSettings) { this.settings = settings; this.reset(); this.player.x = 720; this.player.y = 609; this.enemies = this.enemies.slice(0,2); this.enemies[0].x=1000; this.enemies[1].x=1170; }
  reset() {
    this.sector=0; this.camera=0;this.liftTravel=0;this.liftAnnounced=false; this.clock=0; this.shake=0; this.hitstop=0; this.comboCount=0; this.comboTimer=0; this.clearTimer=0; this.attackSerial=0; this.enemySerial=0;
    this.particles=[]; this.texts=[]; this.slashes=[]; this.pickups=[];
    this.training=false;this.practiceTimer=0;this.comboDamage=0;this.chain=[];this.chainTimer=0;this.chainAir=false;this.pendingInput=null;this.readySuper=null;this.superTimer=0;this.superEffects=[];this.inputLog=[];this.moveNotice='';this.moveNoticeTimer=0;
    this.stats={kills:0,shards:0,hits:0,time:0,bestCombo:0};
    this.player={x:280,y:590,previousX:280,previousY:590,elevation:0,previousElevation:0,walkDistance:0,previousWalkDistance:0,height:0,previousHeight:0,jumpTime:0,airHold:0,jumpSpeed:MOTION.launchSpeed,jumpPhase:'grounded',hp:120,maxHp:120,facing:1,moving:false,attack:0,attackCooldown:0,attackDuration:.32,attackHit:true,attackConnected:false,move:null,guardHeld:false,guarding:false,guardTime:0,guardMeter:100,dash:0,dashCooldown:0,dashX:1,dashY:0,pulseCooldown:0,invulnerable:0,hurt:0,damageMultiplier:1,cooldownMultiplier:1,lifesteal:0};
    this.spawnSector();
  }
  setPhase(phase: Phase) { this.phase=phase;if(phase!=='playing'){this.player.guardHeld=false;this.player.guarding=false;}this.onPhase(phase); }
  start(training=false) {
    this.reset();this.training=training;
    if(training){this.player.x=430;this.player.previousX=430;this.spawnPractice();}
    this.setPhase('playing');this.onSound('start');
    this.onToast(training?'Полигон отладки':'Офис после релиза',training?'J · K · L — вводите приёмы последовательно':'ВЕСТИБЮЛЬ · ЭТАЖИ 01 / 02');
  }
  spawnPractice(){
    this.spawnSector();const e=this.enemies[0];this.enemies=[e];
    Object.assign(e,{kind:'feature',x:clamp(this.player.x+this.player.facing*140,90,SECTORS[0].end-90),previousX:clamp(this.player.x+this.player.facing*140,90,SECTORS[0].end-90),y:this.player.y,previousY:this.player.y,hp:1200,maxHp:1200});
    e.elevation=e.previousElevation=floorAt(e.x,e.y,this.player.elevation);this.pickups=[];this.practiceTimer=0;
  }
  spawnSector() {
    this.enemies=SECTORS[this.sector].enemies.map(spawn=>({ ...spawn,previousX:spawn.x,previousY:spawn.y,elevation:floorAt(spawn.x,spawn.y,spawn.floor*FLOOR_HEIGHT),previousElevation:floorAt(spawn.x,spawn.y,spawn.floor*FLOOR_HEIGHT),height:0,previousHeight:0,verticalSpeed:0,juggleHits:0,id:++this.enemySerial,hp:ENEMIES[spawn.kind].hp,maxHp:ENEMIES[spawn.kind].hp,facing:-1,state:'chase',timer:0,hurt:0,attackId:-1,knockback:0,targetX:0,targetY:0,variation:this.random()*10 }));
  }
  get alive() { return this.enemies.filter(e=>e.state!=='dead'); }
  get progress() { return this.stats.kills / SECTORS.reduce((n,s)=>n+s.enemies.length,0); }
  update(dt: number, direction: Vec = {x:0,y:0}, actions: Action[] = []) {
    this.clock+=dt;
    if (this.phase!=='playing') return;
    if(this.liftTravel>0){
      this.stats.time+=dt;this.liftTravel=Math.max(0,this.liftTravel-dt);
      if(!this.liftTravel){this.setPhase(this.sector===SECTORS.length-1?'won':'upgrade');this.onSound('win');}
      return;
    }
    this.player.previousX=this.player.x;this.player.previousY=this.player.y;
    this.player.previousElevation=this.player.elevation;this.player.previousHeight=this.player.height;this.player.previousWalkDistance=this.player.walkDistance;
    for(const e of this.enemies){e.previousX=e.x;e.previousY=e.y;e.previousElevation=e.elevation;e.previousHeight=e.height;}
    this.stats.time+=dt;
    this.shake=Math.max(0,this.shake-dt*27);
    if(this.hitstop>0) { this.hitstop=Math.max(0,this.hitstop-dt);if(actions.includes('guard-end'))this.action('guard-end',direction);return; }
    const p=this.player,wasAttacking=p.attack>0;
    for(const key of ['airHold','attack','attackCooldown','dash','dashCooldown','pulseCooldown','invulnerable','hurt'] as const) p[key]=Math.max(0,p[key]-dt);
    if(wasAttacking&&!p.attack)this.finishAttack();
    if(!p.attack)this.chainTimer=Math.max(0,this.chainTimer-dt);if(!this.chainTimer)this.chain=[];
    this.superTimer=Math.max(0,this.superTimer-dt);if(!this.superTimer)this.readySuper=null;
    this.moveNoticeTimer=Math.max(0,this.moveNoticeTimer-dt);
    this.inputLog=this.inputLog.map(i=>({...i,life:i.life-dt})).filter(i=>i.life>0);
    this.comboTimer=Math.max(0,this.comboTimer-dt); if(!this.comboTimer){this.comboCount=0;this.comboDamage=0;}
    for(const action of actions)if(!wasAttacking||(!isAttackInput(action)&&action!=='super'&&action!=='pulse'))this.action(action,direction);
    p.guarding=p.guardHeld&&!p.attack&&!p.dash&&!p.hurt&&p.jumpPhase==='grounded'&&p.guardMeter>0;
    p.guardTime=p.guarding?p.guardTime+dt:0;
    if(!p.guarding)p.guardMeter=Math.min(100,p.guardMeter+dt*24);
    const move=normalize(direction.x,direction.y);
    if (p.dash>0) { p.x+=p.dashX*880*dt; p.y+=p.dashY*480*dt; this.burst(p.x,p.y-p.elevation-p.height-50,2,'#80f1d2','smoke'); }
    else {
      const speed=p.hurt>.14?0:p.attack>0?48:p.guarding?80:MOTION.speed;
      p.x+=move.x*speed*dt;p.y+=move.y*speed*MOTION.depthScale*dt;
      if(move.x&&!p.attack)p.facing=Math.sign(move.x);
      if(p.attack&&p.move&&p.attackDuration-p.attack<MOVES[p.move].impact)p.x+=p.facing*MOVES[p.move].lunge*dt;
    }
    p.x=clamp(p.x,SECTORS[this.sector].start+70,SECTORS[this.sector].end-70); p.y=clamp(p.y,VIEW.minY,VIEW.maxY);
    this.followTerrain(p);
    const travelled=Math.hypot(p.x-p.previousX,(p.y-p.previousY)/MOTION.depthScale);
    p.moving=travelled>.001;
    if(!p.dash&&!p.attack&&!p.hurt&&!p.guarding&&p.jumpPhase==='grounded')p.walkDistance+=travelled;
    this.updateJump(dt);
    if(p.attack>0&&p.move&&!p.attackHit&&p.attackDuration-p.attack>=MOVES[p.move].impact)this.keyboardImpact();
    for(const enemy of this.enemies) this.updateEnemy(enemy,dt);
    this.updateSuperEffects(dt);this.updateEffects(dt);
    if(this.training){
      const damaged=this.enemies.some(e=>e.hp<e.maxHp);
      this.practiceTimer=!damaged||this.comboTimer>0||p.attack||this.enemies.some(e=>e.height>0)?0:this.practiceTimer+dt;
      if(this.practiceTimer>1.5)this.spawnPractice();
      return;
    }
    if (!this.alive.length) {
      this.clearTimer+=dt;
      if(this.clearTimer>1.1&&!this.liftAnnounced){
        this.liftAnnounced=true;this.collectAll();this.onSound('pickup');
        this.onToast('Лифт разблокирован','Поднимитесь по лестнице · F у двери лифта');
      }
    }
  }
  get lift(){return OFFICE_LEVELS[this.sector].lift;}
  get liftReady(){return !this.training&&!this.alive.length&&this.clearTimer>1.1;}
  get nearLift(){const p=this.player,l=this.lift;return Math.abs(p.x-l.x)<85&&Math.abs(p.y-l.y)<64&&Math.abs(p.elevation+p.height-l.elevation)<10;}
  get canUseLift(){return this.phase==='playing'&&this.liftReady&&this.nearLift&&!this.liftTravel&&!this.player.attack&&!this.player.hurt&&!this.player.dash&&this.player.jumpPhase==='grounded';}
  action(action: Action, direction: Vec) {
    if(this.phase!=='playing'||this.liftTravel) return;
    const p=this.player;
    if(action==='interact'&&this.canUseLift){
      this.liftTravel=1.25;this.chain=[];this.chainTimer=0;this.readySuper=null;this.superTimer=0;this.player.guardHeld=false;this.player.guarding=false;
      this.onSound('start');return;
    }
    if(action==='jump'&&p.jumpPhase==='grounded'&&!p.dash&&!p.hurt&&!p.attack){
      p.jumpPhase='takeoff';p.jumpTime=0;p.jumpSpeed=MOTION.launchSpeed;
    }
    if(action==='guard-start'){p.guardHeld=true;return;}
    if(action==='guard-end'){p.guardHeld=false;p.guarding=false;p.guardTime=0;return;}
    if(isAttackInput(action)){
      if(!this.acceptsAction(action))return;
      this.inputLog.push({key:ATTACK_KEYS[action],life:3});this.inputLog=this.inputLog.slice(-7);
      const air=p.jumpPhase==='airborne';
      if(!this.chainTimer||air!==this.chainAir)this.chain=[];
      if(this.chain.length&&direction.x&&Math.sign(direction.x)!==p.facing)this.chain=[];
      this.chainAir=air;this.pendingInput=action;
      this.beginAttack(resolveMove(action,air),direction);
    }
    if(action==='super'&&this.acceptsAction(action)&&this.readySuper){
      const id=this.readySuper;this.readySuper=null;this.superTimer=0;this.chain=[];this.pendingInput=null;
      this.beginAttack(id,direction);p.invulnerable=MOVES[id].duration+.1;
      this.inputLog.push({key:'R',life:3});this.inputLog=this.inputLog.slice(-7);
      this.onSound('pulse');
    }
    if(action==='dash' && !p.dashCooldown && !p.attack && !p.hurt && !this.hitstop) {
      const d=normalize(direction.x||(!direction.y?p.facing:0),direction.y); p.dashX=d.x; p.dashY=d.y;
      p.dash=.23; p.dashCooldown=1.5*p.cooldownMultiplier; p.invulnerable=.36; p.attack=0;p.attackHit=true;p.guardHeld=false;p.guarding=false;this.pendingInput=null;this.chain=[];this.chainTimer=0;
      this.onSound('dash'); this.burst(p.x,p.y-p.elevation-p.height-50,18,'#9cfbe4','spark');
    }
    if(action==='pulse' && !p.pulseCooldown && this.acceptsAction(action)) {
      p.pulseCooldown=8*p.cooldownMultiplier; p.invulnerable=.45;
      this.slashes.push({x:p.x,y:p.y-p.elevation-p.height-45,life:.65,facing:1,type:'pulse'});
      this.onSound('pulse'); this.shake=7;
      this.texts.push({x:p.x,y:p.y-p.elevation-p.height-160,text:'DEBUG.PULSE()',color:'#a7f5da',life:1.1,size:19});
      for(const e of this.enemies) if(e.state!=='dead' && distance(p,e)<280 && Math.abs(p.elevation+p.height-e.elevation-e.height)<85) this.damageEnemy(e,Math.round(67*p.damageMultiplier),Math.sign(e.x-p.x)||1,200);
      this.burst(p.x,p.y-p.elevation-p.height-70,55,'#99f9db','code');
    }
  }
  /** Event-time gate shared by keyboard, mouse and touch. Busy presses are discarded. */
  acceptsAction(action:Action){
    const p=this.player;
    if(this.liftTravel)return false;
    if(action==='interact')return this.canUseLift;
    if(!isAttackInput(action)&&action!=='super'&&action!=='pulse')return true;
    return this.phase==='playing'&&!this.hitstop&&!p.attack&&!p.dash&&!p.hurt&&
      (action!=='super'||(!!this.readySuper&&p.jumpPhase==='grounded'));
  }
  beginAttack(id:MoveId,direction:Vec){
    const p=this.player,move=MOVES[id];
    p.move=id;p.attackDuration=move.duration;p.attack=p.attackCooldown=move.duration;
    p.attackHit=false;p.attackConnected=false;p.guarding=false;p.guardHeld=false;
    this.attackSerial++;if(direction.x)p.facing=Math.sign(direction.x);
    this.moveNotice=move.name;this.moveNoticeTimer=move.finisher?1.7:move.duration+.15;
  }
  finishAttack(){
    const input=this.pendingInput;this.pendingInput=null;
    if(!input)return;
    if(!this.player.attackConnected||this.chainAir){this.chain=[];this.chainTimer=0;return;}
    let chain=[...this.chain,input];
    if(!matchingCombo(chain)&&!hasContinuation(chain))chain=[input];
    this.chain=chain;this.chainTimer=CHAIN_WINDOW;
    const recipe=matchingCombo(chain);
    if(recipe){
      this.readySuper=recipe.id;this.superTimer=SUPER_WINDOW;
      this.moveNotice='R · '+MOVES[recipe.id].name;this.moveNoticeTimer=2.4;
      this.onSound('pickup');this.burst(this.player.x,this.player.y-this.player.elevation-100,20,MOVES[recipe.id].color,'code');
    }
  }
  followTerrain(actor:Player|Enemy){
    if(!('jumpPhase' in actor)&&actor.state==='dead')return;
    if('jumpPhase' in actor?actor.jumpPhase==='airborne':actor.height!==0||actor.state==='airborne')return;
    const level=OFFICE_LEVELS[this.sector],s=level.stairs;
    // The upper stairwell has a low safety rail; enter from its head to descend.
    if(actor.elevation>=FLOOR_HEIGHT-8&&actor.previousY>s.front&&actor.y<=s.front&&inStairwell(level,actor.x,actor.y)&&stairHeight(level,actor.x)<FLOOR_HEIGHT-18)actor.y=actor.previousY;
    const step=Math.max(9,Math.abs(actor.x-actor.previousX)*.76);
    const floor=floorAt(actor.x,actor.y,actor.elevation+step);
    if(actor.elevation-floor>step){
      if('jumpPhase' in actor){actor.jumpPhase='airborne';actor.jumpTime=0;actor.jumpSpeed=0;}
      else{actor.state='airborne';actor.height=.01;actor.verticalSpeed=0;}
    }else actor.elevation=floor;
  }
  updateJump(dt:number){
    const p=this.player;if(p.jumpPhase==='grounded')return;
    if(p.airHold>0&&p.jumpPhase==='airborne')return;
    p.jumpTime+=dt;
    if(p.jumpPhase==='takeoff'&&p.jumpTime>=MOTION.takeoff){
      p.jumpTime-=MOTION.takeoff;p.jumpPhase='airborne';this.onSound('jump');
      this.burst(p.x,p.y-p.elevation-3,9,'#b5c8ad','smoke');
    }
    if(p.jumpPhase==='airborne'){
      const before=p.elevation+p.height;
      p.height=p.jumpSpeed*p.jumpTime-.5*MOTION.gravity*p.jumpTime*p.jumpTime;
      const floor=floorAt(p.x,p.y,before);
      if(p.elevation+p.height<=floor&&p.jumpSpeed-MOTION.gravity*p.jumpTime<0){
        p.elevation=floor;p.jumpPhase='landing';p.jumpTime=0;p.height=0;this.onSound('land');
        this.burst(p.x,p.y-floor-2,14,'#b5c8ad','smoke');
      }
    }
    if(p.jumpPhase==='landing'&&p.jumpTime>=MOTION.landing){p.jumpPhase='grounded';p.jumpTime=0;}
  }
  keyboardImpact(){
    const p=this.player;if(!p.move)return;const move=MOVES[p.move];p.attackHit=true;
    this.onSound(move.style==='uppercut'?'launch':move.style==='jab'||move.style==='kick'?'swing':'heavy');
    if(move.finisher){this.releaseSuper(p.move as SuperId);return;}
    this.slashes.push({x:p.x+p.facing*56,y:p.y-p.elevation-p.height-77,life:.25,facing:p.facing,type:'keyboard',style:move.style,color:move.color,finisher:move.finisher});
    for(const e of this.enemies){
      if(e.state==='dead'||e.state==='down'||e.attackId===this.attackSerial||!meleeInRange(p,e,move.reach,move.depth))continue;
      // Airborne targets have real vertical hitboxes; ground strikes cannot hit them indefinitely.
      if(Math.abs(p.elevation+p.height-e.elevation-e.height)>(e.kind==='boss'?160:e.kind==='feature'?85:65))continue;
      const armored=e.kind==='boss'&&e.state==='windup'&&!move.armorBreak;
      const scale=e.height>0?Math.max(.4,1-e.juggleHits*.12):1;
      e.attackId=this.attackSerial;p.attackConnected=true;
      this.damageEnemy(e,Math.round(move.damage*p.damageMultiplier*scale*(armored?.55:1)),p.facing,move.knockback);
      if(p.jumpPhase==='airborne'&&e.height>0&&e.juggleHits<5)p.airHold=.17;
      this.hitstop=Math.max(this.hitstop,move.finisher?.075:move.style==='jab'?.035:.06);
      if(armored)this.texts.push({x:e.x,y:e.y-e.elevation-e.height-180,text:'БРОНЯ',color:'#ddaa77',life:.5,size:12});
      if(e.hp<=0)continue;
      if(move.armorBreak||e.kind!=='boss'){e.state='recover';e.timer=move.stun;}
      if(move.launch&&e.kind!=='boss'&&e.juggleHits<4){
        e.verticalSpeed=move.launch;e.height=Math.max(e.height,1);e.state='airborne';e.juggleHits++;
      }else if(e.height!==0){
        e.juggleHits++;e.state='airborne';
        if(move.style==='slam')e.verticalSpeed=-660;
        else if(e.juggleHits<5)e.verticalSpeed=Math.max(e.verticalSpeed,220);
      }else if(move.knockdown&&e.kind!=='boss'){e.state='down';e.timer=move.knockdown;}
    }
    if(!p.attackConnected){this.chain=[];this.chainTimer=0;}
    else if(move.finisher){this.burst(p.x+p.facing*100,p.y-p.height-60,28,move.color,'code');}
  }
  releaseSuper(id:SuperId){
    const p=this.player;
    this.superEffects.push({id,x:p.x+(id==='overflow'?p.facing*105:0),previousX:p.x,y:p.y,elevation:p.elevation,facing:p.facing,age:0,life:id==='hotfix'?1.1:.85,travelled:0,hitIds:[]});
    this.shake=id==='delete'?11:7;this.onSound(id==='overflow'?'launch':'heavy');
    this.burst(p.x+p.facing*65,p.y-p.elevation-45,40,MOVES[id].color,'code');
  }
  updateSuperEffects(dt:number){
    for(const effect of this.superEffects){
      effect.age+=dt;effect.life-=dt;effect.previousX=effect.x;
      const move=MOVES[effect.id];
      if(effect.id==='hotfix'){effect.x+=effect.facing*860*dt;effect.travelled+=860*dt;}
      for(const e of this.enemies){
        if(e.state==='dead'||effect.hitIds.includes(e.id))continue;
        const dx=e.x-effect.x,dy=Math.abs(e.y-effect.y),z=e.elevation+e.height-effect.elevation;
        const radius=Math.min(move.reach,effect.age*(effect.id==='delete'?1000:1200));
        const hit=effect.id==='hotfix'
          ?e.x>=Math.min(effect.previousX,effect.x)-55&&e.x<=Math.max(effect.previousX,effect.x)+55&&dy<move.depth&&Math.abs(z)<90
          :Math.abs(dx)<radius&&dy<move.depth&&Math.abs(z)<(effect.id==='overflow'?220:100);
        if(!hit)continue;
        effect.hitIds.push(e.id);this.player.attackConnected=true;
        this.damageEnemy(e,Math.round(move.damage*this.player.damageMultiplier),effect.facing,move.knockback);
        if(e.hp<=0)continue;
        e.state='recover';e.timer=move.stun;
        if(move.launch&&e.kind!=='boss'){e.height=Math.max(e.height,1);e.verticalSpeed=move.launch;e.state='airborne';e.juggleHits=1;}
        else if(move.knockdown&&e.kind!=='boss'){e.height=0;e.elevation=floorAt(e.x,e.y,e.elevation);e.state='down';e.timer=move.knockdown;}
      }
    }
    this.superEffects=this.superEffects.filter(e=>e.life>0);
  }
  damageEnemy(e: Enemy, amount: number, direction: number, knockback: number) {
    if(e.state==='dead') return;
    const dealt=Math.min(e.hp,amount);this.comboDamage+=dealt;
    e.hp=Math.max(0,e.hp-amount); e.hurt=.16; e.knockback=direction*knockback*(e.kind==='boss'?.2:1);
    if(e.kind!=='boss') {e.state=e.height!==0?'airborne':'recover';e.timer=.32;}
    this.comboCount++; this.comboTimer=2.2; this.stats.bestCombo=Math.max(this.stats.bestCombo,this.comboCount);
    this.hitstop=.045; this.shake=Math.max(this.shake,e.kind==='boss'?5:3);
    this.texts.push({x:e.x+(this.random()-.5)*32,y:e.y-e.elevation-e.height-ENEMIES[e.kind].height*.7,text:String(amount),color:amount>40?'#ffcb84':'#e9fff4',life:.8,size:amount>40?29:22});
    this.burst(e.x,e.y-e.elevation-e.height-50,15,ENEMIES[e.kind].color,'spark'); this.onSound('hit');
    if(!e.hp) {
      e.state='dead';e.timer=.65;this.stats.kills++; this.onSound('kill');
      this.burst(e.x,e.y-e.elevation-e.height-60,e.kind==='boss'?70:30,ENEMIES[e.kind].color,'code');
      for(let i=0;i<(e.kind==='boss'?12:4);i++){const x=e.x+(this.random()-.5)*100,y=clamp(e.y+(this.random()-.5)*55,VIEW.minY,VIEW.maxY);this.pickups.push({x,y,elevation:floorAt(x,y,e.elevation+e.height),type:'shard',life:30,seed:this.random()*10});}
      if(e.kind==='feature') this.pickups.push({x:e.x,y:e.y,elevation:floorAt(e.x,e.y,e.elevation+e.height),type:'health',life:30,seed:0});
      if(this.player.lifesteal) this.player.hp=Math.min(this.player.maxHp,this.player.hp+this.player.lifesteal);
    }
  }
  updateEnemy(e: Enemy, dt: number) {
    e.timer=Math.max(0,e.timer-dt); e.hurt=Math.max(0,e.hurt-dt);
    e.x+=e.knockback*dt*4; e.knockback*=Math.max(0,1-dt*12); e.x=clamp(e.x,SECTORS[this.sector].start+55,SECTORS[this.sector].end-45);
    if(e.height!==0||e.state==='airborne'){
      const floor=floorAt(e.x,e.y,e.elevation+e.height);
      e.height+=e.verticalSpeed*dt-675*dt*dt;e.verticalSpeed-=1350*dt;
      if(e.elevation+e.height<=floor){
        e.elevation=floor;e.height=0;
        e.verticalSpeed=0;e.juggleHits=0;
        if(e.state!=='dead'){e.state='down';e.timer=.5;this.burst(e.x,e.y-e.elevation-4,16,'#beccb5','smoke');this.onSound('land');}
      }
      return;
    }
    this.followTerrain(e);
    if(e.state==='dead') return;
    if(e.state==='down'){if(!e.timer)e.state='chase';return;}
    if(this.training){if(e.state==='recover'&&!e.timer)e.state='chase';return;}
    const p=this.player, config=ENEMIES[e.kind], dx=p.x-e.x, dy=p.y-e.y;
    if(e.state==='chase') {
      e.facing=Math.sign(dx)||e.facing;
      if(Math.abs(dx)<config.range && Math.abs(dy)<(e.kind==='boss'?88:43)&&Math.abs(p.elevation-e.elevation)<10) {
        e.state='windup';e.timer=config.windup; e.targetX=p.x; e.targetY=p.y;
      } else if(Math.abs(dx)<900) {
        const target=stairApproach(e.x,e.y,e.elevation,p.x,p.y,p.elevation),dir=normalize(target.x-e.x,(target.y-e.y)*1.6); e.x+=dir.x*config.speed*dt; e.y+=dir.y*config.speed*.7*dt;
        // Soft separation prevents a whole wave occupying one hitbox.
        for(const other of this.enemies) if(other.id!==e.id && other.state!=='dead'&&Math.abs(e.elevation+e.height-other.elevation-other.height)<40) {
          const gap=Math.hypot(e.x-other.x,(e.y-other.y)*1.5);
          if(gap<55 && gap>0) {e.x+=(e.x-other.x)/gap*dt*25;e.y+=(e.y-other.y)/gap*dt*18;}
        }
      }
    } else if(e.state==='windup' && !e.timer) {
      e.state='attack'; e.timer=.18; this.burst(e.kind==='boss'?e.targetX:e.x+e.facing*50,e.y-e.elevation-15,18,config.color,'spark');
      const hit = e.kind==='boss' ? Math.hypot((p.x-e.targetX)/190,(p.y-e.targetY)/92)<1 : meleeInRange(e,p,config.range+24,61);
      if(hit&&this.damagePlayer(config.damage,e.facing,e.elevation)==='parry'){e.state='recover';e.timer=e.kind==='boss'?.5:.8;}
      if(e.kind==='boss') {this.shake=9;this.onSound('hit');}
    } else if(e.state==='attack' && !e.timer) {e.state='recover';e.timer=config.recovery;}
    else if(e.state==='recover' && !e.timer) e.state='chase';
    e.y=clamp(e.y,VIEW.minY,VIEW.maxY);this.followTerrain(e);
  }
  damagePlayer(amount: number, direction: number, elevation=this.player.elevation) {
    const p=this.player; if(p.invulnerable || Math.abs(p.elevation+p.height-elevation)>32 || this.phase!=='playing') return;
    const cost=amount>18?40:26;
    if(p.guarding&&direction===-p.facing&&p.guardMeter>=cost){
      p.guardMeter-=cost;
      const parry=p.guardTime<=.15;this.onSound(parry?'parry':'block');
      this.burst(p.x+p.facing*35,p.y-p.elevation-p.height-90,parry?24:10,parry?'#d8bcff':'#a7f6de','spark');
      this.moveNotice=parry?'PERFECT BLOCK':'БЛОК';this.moveNoticeTimer=1;
      if(parry){this.hitstop=.055;return 'parry';}
      p.hp=Math.max(0,p.hp-Math.ceil(amount*.2));if(!p.hp)this.setPhase('lost');return 'block';
    }
    if(p.guarding&&direction===-p.facing){p.guardMeter=0;this.moveNotice='ЗАЩИТА СЛОМАНА';this.moveNoticeTimer=1;}
    const damage=this.settings.difficulty==='story'?Math.ceil(amount*.45):amount;
    p.hp=Math.max(0,p.hp-damage);p.hurt=.32;p.invulnerable=.85;p.x=clamp(p.x+direction*22,SECTORS[this.sector].start+70,SECTORS[this.sector].end-70);
    p.attack=0;p.attackCooldown=0;p.attackHit=true;p.attackConnected=false;p.guarding=false;p.guardHeld=false;
    this.chain=[];this.chainTimer=0;this.pendingInput=null;
    this.stats.hits++;this.comboCount=0;this.comboDamage=0;this.comboTimer=0;this.shake=6;
    this.texts.push({x:p.x,y:p.y-p.elevation-p.height-140,text:`−${damage}`,color:'#ff886c',life:.8,size:25}); this.onSound('hurt');
    if(!p.hp) this.setPhase('lost');
  }
  updateEffects(dt: number) {
    for(const particle of this.particles) {particle.life-=dt;particle.x+=particle.vx*dt;particle.y+=particle.vy*dt;particle.vy+=particle.type==='spark'?160*dt:0;}
    this.particles=this.particles.filter(p=>p.life>0);
    for(const t of this.texts) {t.life-=dt;t.y-=38*dt;} this.texts=this.texts.filter(t=>t.life>0);
    for(const s of this.slashes) s.life-=dt;this.slashes=this.slashes.filter(s=>s.life>0);
    for(const item of this.pickups) {
      item.life-=dt; const d=distance(item,this.player),sameLevel=Math.abs(item.elevation-this.player.elevation-this.player.height)<45;
      if(d<145&&sameLevel) {item.x+=(this.player.x-item.x)*dt*7;item.y+=(this.player.y-item.y)*dt*7;}
      if(d<30&&sameLevel) {this.collect(item);item.life=0;}
    }
    this.pickups=this.pickups.filter(p=>p.life>0);
  }
  collect(item: Pickup) {
    if(item.type==='shard') this.stats.shards++;
    else {this.player.hp=Math.min(this.player.maxHp,this.player.hp+18);this.texts.push({x:this.player.x,y:this.player.y-this.player.elevation-this.player.height-150,text:'+18 HP',color:'#a4efc3',life:1,size:22});}
    this.onSound('pickup');
  }
  collectAll() {for(const item of this.pickups) this.collect(item);this.pickups=[];}
  upgrade(id: Upgrade) {
    if(this.phase!=='upgrade') return;
    if(id==='damage') this.player.damageMultiplier*=1.25;
    if(id==='cooldown') this.player.cooldownMultiplier*=.75;
    if(id==='heal') {this.player.hp=Math.min(this.player.maxHp,this.player.hp+40);this.player.lifesteal+=5;}
    this.player.hp=Math.min(this.player.maxHp,this.player.hp+20);this.player.pulseCooldown=0;this.player.dashCooldown=0;
    this.sector++;this.clearTimer=0;this.liftAnnounced=false;this.liftTravel=0;
    const start=SECTORS[this.sector].start;this.camera=start;
    Object.assign(this.player,{x:start+180,previousX:start+180,y:605,previousY:605,elevation:0,previousElevation:0,height:0,previousHeight:0,jumpPhase:'grounded',jumpTime:0,attack:0,attackCooldown:0,attackHit:true,move:null,hurt:0,invulnerable:1,walkDistance:0,previousWalkDistance:0});
    this.particles=[];this.texts=[];this.slashes=[];this.superEffects=[];this.chain=[];this.pendingInput=null;this.spawnSector();this.setPhase('playing');
    this.onToast(SECTORS[this.sector].name,`ЭТАЖИ 0${this.sector*2+1} / 0${this.sector*2+2} · ${SECTORS[this.sector].subtitle}`);
  }
  burst(x:number,y:number,count:number,color:string,type:Particle['type']) {
    if(!this.settings.particles) return;
    for(let i=0;i<count && this.particles.length<420;i++) {
      const angle=this.random()*Math.PI*2,speed=35+this.random()*200,life=.25+this.random()*.6;
      this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-35,life,maxLife:life,size:2+this.random()*4,color,type});
    }
  }
}
