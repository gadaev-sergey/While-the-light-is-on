import { Assets } from './assets.ts';
import { ENEMIES, SECTORS, VIEW } from './content.ts';
import { clamp, lerp, seededRandom } from './math.ts';
import { World } from './world.ts';
import type { Enemy, Player, Vec } from './types.ts';
import { PoseAnimator, interpolatedPosition, smoothstep, type AnimationClip } from './animation.ts';
import { PosePainter } from './pose-painter.ts';
import { OfficeRenderer } from './office-renderer.ts';
import { jumpPoseTime, walkCycleTime } from './locomotion.ts';
import { floorAt } from './terrain.ts';
import { MOVES, blendAttack } from './combat.ts';

const WALK:AnimationClip={frames:Array.from({length:8},(_,i)=>`walk:${i}`),duration:1,loop:true};
const JUMP:AnimationClip={frames:Array.from({length:8},(_,i)=>`jump:${i}`),duration:7};
const IDLE:AnimationClip={frames:['attack:0'],duration:1,loop:true};

export class Renderer {
  ctx: CanvasRenderingContext2D; dpr=1; time=0;
  office:OfficeRenderer;poses:PosePainter;
  playerAnimation=new PoseAnimator();enemyAnimations=new Map<number,PoseAnimator>();lastPlayer?:Player;
  visualDt=0;interpolation=1;
  lastImpact=0;lastEnemies?:Enemy[];
  motes: {x:number;y:number;r:number;speed:number;phase:number}[]=[];
  constructor(public canvas: HTMLCanvasElement, public assets: Assets) {
    this.ctx=canvas.getContext('2d',{alpha:false})!;
    this.office=new OfficeRenderer(assets);this.poses=new PosePainter(assets);
    const rand=seededRandom(1337);
    for(let i=0;i<65;i++) this.motes.push({x:rand()*1280,y:rand()*720,r:rand()*1.8+.4,speed:4+rand()*12,phase:rand()*6.3});
    new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();
  }
  resize() {this.dpr=Math.min(window.devicePixelRatio||1,2);this.canvas.width=VIEW.width*this.dpr;this.canvas.height=VIEW.height*this.dpr;}
  draw(w: World, dt: number,alpha=1) {
    const c=this.ctx;
    this.visualDt=w.phase==='menu'||(w.phase==='playing'&&w.hitstop<=0)?dt:0;
    this.time+=this.visualDt;this.interpolation=w.phase==='playing'&&w.hitstop<=0?clamp(alpha,0,1):1;
    if(this.lastPlayer!==w.player){this.playerAnimation.reset();this.enemyAnimations.clear();this.lastPlayer=w.player;this.lastImpact=0;}
    if(this.lastEnemies!==w.enemies){const ids=new Set(w.enemies.map(e=>e.id));for(const id of this.enemyAnimations.keys())if(!ids.has(id))this.enemyAnimations.delete(id);this.lastEnemies=w.enemies;}
    const playerPosition=w.phase==='menu'?w.player:interpolatedPosition(w.player,this.interpolation);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,1280,720);
    const target=w.phase==='menu'?0:clamp(playerPosition.x-460,SECTORS[w.sector].start,SECTORS[w.sector].end-1280);
    w.camera=lerp(w.camera,target,1-Math.exp(-this.visualDt*5));
    c.save();
    if(w.settings.shake && w.phase==='playing') c.translate((Math.random()-.5)*w.shake,(Math.random()-.5)*w.shake*.7);
    this.office.background(c,w);
    c.save();c.translate(-w.camera,0);
    this.office.structure(c,w);this.office.elevator(c,w);
    for(const e of w.enemies) if(e.state==='windup') this.telegraph(e);
    for(const item of w.pickups) {
      const bob=Math.sin(this.time*4+item.seed)*4;
      this.glow(item.x,item.y-item.elevation-14,28,item.type==='health'?'#8bfca9':'#ffb475',.25);
      c.save();c.translate(item.x,item.y-item.elevation-15+bob);c.rotate(Math.PI/4);c.fillStyle=item.type==='health'?'#b6f9c9':'#f8c491';c.fillRect(-4,-4,8,8);c.restore();
    }
    const entities=[...w.enemies.map(e=>{const pos=w.phase==='menu'?e:interpolatedPosition(e,this.interpolation);return {y:pos.y-e.elevation,draw:()=>this.enemy(e,w,pos)};}),{y:playerPosition.y-w.player.elevation,draw:()=>this.player(w,playerPosition)}].sort((a,b)=>a.y-b.y);
    for(const entity of entities)entity.draw();
    this.office.rail(c,w,true);this.effects(w);this.office.foreground(c,w);
    c.restore();
    this.atmosphere(w);
    c.restore();
    // A fixed vignette unifies the illustration, sprites and UI without dimming the combat lane.
    const v=c.createRadialGradient(670,410,240,640,360,760);v.addColorStop(0,'transparent');v.addColorStop(1,'rgba(3,10,12,.43)');c.fillStyle=v;c.fillRect(0,0,1280,720);
    if(w.player.hurt>0 && w.phase!=='menu') {c.fillStyle=`rgba(230,62,44,${w.player.hurt*.15})`;c.fillRect(0,0,1280,720);}
    this.office.transit(c,w);
  }
  shadow(x:number,y:number,r:number) {
    const c=this.ctx;c.save();c.translate(x,y);c.scale(1,.24);const g=c.createRadialGradient(0,0,0,0,0,r);g.addColorStop(0,'rgba(0,5,8,.72)');g.addColorStop(1,'transparent');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();
  }
  glow(x:number,y:number,r:number,color:string,alpha:number) {
    const c=this.ctx;c.save();c.globalCompositeOperation='screen';c.globalAlpha=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
  }
  player(w: World,pos:Vec) {
    const c=this.ctx,p=w.player;
    const elevation=lerp(p.previousElevation,p.elevation,this.interpolation),height=elevation+lerp(p.previousHeight,p.height,this.interpolation);
    const support=floorAt(pos.x,pos.y,height),lift=Math.max(0,height-support);
    c.save();c.globalAlpha=Math.max(.3,1-lift/220);this.shadow(pos.x,pos.y-support+2,61-lift*.1);c.restore();
    this.glow(pos.x+p.facing*36,pos.y-height-70,65,'#51dfc1',.11);
    let key='idle',clip=IDLE,speed=1,transition=.095,sampleTime:number|undefined;
    if(p.hurt>.12){key='hurt';clip={frames:['attack:0'],duration:.2};transition=.075;}
    else if(p.dash>0){key='dash';clip={frames:['jump:2'],duration:.23};transition=.07;}
    else if(p.attack>0){key=`attack-${w.attackSerial}`;sampleTime=Math.max(0,p.attackDuration-p.attack-(1-this.interpolation)/60);}
    else if(p.guarding){key='guard';clip={frames:['attack:2'],duration:1};transition=.08;}
    else if(p.jumpPhase!=='grounded'){key=`jump-${p.jumpPhase}`;clip=JUMP;transition=.065;sampleTime=jumpPoseTime(p,this.interpolation);}
    else if(p.moving){key='walk';clip=WALK;transition=.12;sampleTime=walkCycleTime(p,this.interpolation);}
    const animation=this.playerAnimation;
    let layers=animation.current;
    const freshImpact=p.attack>0&&p.attackHit&&this.lastImpact!==w.attackSerial;
    if(freshImpact)this.lastImpact=w.attackSerial;
    // Show the actual contact pose before freezing it, including on a low-refresh display.
    if(this.visualDt>0||!layers.length||freshImpact){
      if(key.startsWith('attack-')&&p.move){
        if(animation.key!==key){animation.from=animation.current;animation.key=key;}
        layers=animation.current=blendAttack(animation.from,MOVES[p.move],sampleTime!);
      }else layers=animation.update(key,clip,this.visualDt,speed,transition,sampleTime);
    }
    c.save();c.translate(pos.x,pos.y-height);c.scale(p.facing,1+(key==='idle'?Math.sin(this.time*2.7)*.002:0));
    if(p.hurt>0)c.rotate(-Math.sin(p.hurt/.32*Math.PI)*.065);
    if(p.hurt>0)c.filter=`brightness(${1+p.hurt*2})`;
    if(p.invulnerable>0){c.shadowColor='#9ffff0';c.shadowBlur=5;}
    if(p.dash>0&&w.settings.particles){c.save();c.translate(-p.dashX*p.facing*38,0);c.globalAlpha=.16;this.poses.draw(c,layers);c.restore();}
    this.poses.draw(c,layers);
    c.restore();
    if(p.guarding){
      c.save();c.translate(pos.x+p.facing*50,pos.y-height-90);c.scale(p.facing,1);
      c.strokeStyle=p.guardTime<.15?'#e1c5ff':'#9eead0';c.shadowColor=c.strokeStyle;c.shadowBlur=15;c.lineWidth=p.guardTime<.15?3:1.5;
      c.beginPath();c.moveTo(-12,-55);c.quadraticCurveTo(50,-12,12,49);c.stroke();c.restore();
    }
    if(w.readySuper||p.attack>0&&p.move&&MOVES[p.move].finisher){
      const color=MOVES[w.readySuper||p.move!].color,charge=p.attack>0?Math.min(1,(p.attackDuration-p.attack)/MOVES[p.move!].impact):.5;
      this.glow(pos.x,pos.y-height-80,75+charge*45,color,.1+charge*.12);
      c.save();c.translate(pos.x,pos.y-height-3);c.scale(1,.28);c.strokeStyle=color;c.globalAlpha=.6;c.lineWidth=2;
      c.beginPath();c.ellipse(0,0,55+Math.sin(this.time*5)*5,55,0,0,Math.PI*2);c.stroke();c.restore();
    }
    if(w.phase==='menu') {c.fillStyle='#d9f4e8';c.font='10px monospace';c.textAlign='center';c.fillText('РАЗРАБОТЧИК',pos.x,pos.y+26);c.fillStyle='#edaa77';c.beginPath();c.moveTo(pos.x-4,pos.y+37);c.lineTo(pos.x+4,pos.y+37);c.lineTo(pos.x,pos.y+42);c.fill();}
  }
  enemy(e:Enemy,w:World,pos:Vec) {
    if(e.state==='dead' && !e.timer) return;
    const c=this.ctx,config=ENEMIES[e.kind],height=lerp(e.previousElevation,e.elevation,this.interpolation)+lerp(e.previousHeight,e.height,this.interpolation);
    const support=floorAt(pos.x,pos.y,height),lift=Math.max(0,height-support);
    let animation=this.enemyAnimations.get(e.id);if(!animation){animation=new PoseAnimator();this.enemyAnimations.set(e.id,animation);}
    const walking=e.state==='chase'&&Math.hypot(e.x-e.previousX,e.y-e.previousY)>.001;
    const threatening=e.state==='windup'||e.state==='attack';
    const frames=e.kind==='bug'?(threatening?['enemy:2']:walking?['enemy:0','enemy:1']:['enemy:0']):e.kind==='feature'?(threatening?['enemy:4']:['enemy:3']):['enemy:5'];
    const key=threatening?'strike':walking?'walk':'idle';
    const speed=walking?clamp(Math.hypot(e.x-e.previousX,e.y-e.previousY)*60/config.speed,0,1.2):1;
    const layers=(this.visualDt>0&&e.state!=='dead')||!animation.current.length?animation.update(key,{frames,duration:.55,loop:true},this.visualDt,speed,.13):animation.current;
    c.save();c.globalAlpha=Math.max(.25,1-lift/230);this.shadow(pos.x,pos.y-support+3,config.height*.4-lift*.1);c.restore();
    c.save();c.translate(pos.x,pos.y-height);c.scale(-e.facing,1+Math.sin(this.time*2+e.variation)*.003);
    if(e.height!==0)c.rotate(clamp(e.verticalSpeed/1400,-.32,.32));
    if(e.state==='down'){c.rotate(-.28);c.globalAlpha=.75;}
    if(e.state==='dead'){const fade=smoothstep(e.timer/.65);c.globalAlpha=fade;c.translate(0,(1-fade)*8);c.rotate((1-fade)*.08);}
    if(e.hurt>0)c.filter=`brightness(${1+e.hurt*5}) saturate(.7)`;
    if(e.state==='windup')c.rotate(-smoothstep(1-e.timer/config.windup)*.025);
    this.poses.draw(c,layers);c.restore();
    if(e.hp<e.maxHp && e.state!=='dead' && e.kind!=='boss') {
      const width=e.kind==='bug'?49:68;c.fillStyle='#101c20';c.fillRect(pos.x-width/2,pos.y-height-config.height-15,width,4);c.fillStyle=config.color;c.fillRect(pos.x-width/2,pos.y-height-config.height-15,width*e.hp/e.maxHp,4);
    }
    if(e.state==='down'){c.fillStyle='#ffd7a5';c.font='14px monospace';c.textAlign='center';c.fillText('✦  ✦  ✦',pos.x,pos.y-height-config.height-25);}
  }
  telegraph(e:Enemy) {
    const c=this.ctx,boss=e.kind==='boss',range=ENEMIES[e.kind].range;
    const progress=1-e.timer/ENEMIES[e.kind].windup;
    const x=boss?e.targetX:e.x+e.facing*range*.55,y=(boss?e.targetY:e.y)-e.elevation;
    c.save();c.translate(x,y);c.scale(1,boss?.48:.37);c.strokeStyle=`rgba(255,130,86,${.45+progress*.5})`;c.fillStyle=`rgba(248,93,53,${.08+progress*.15})`;c.lineWidth=2;c.setLineDash([8,7]);
    c.beginPath();c.ellipse(0,0,boss?190:range,70,0,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);
    c.beginPath();c.ellipse(0,0,(boss?190:range)*progress,70*progress,0,0,Math.PI*2);c.stroke();c.restore();
    c.fillStyle='#ffc497';c.textAlign='center';c.font='bold 20px monospace';c.fillText('!',e.x,e.y-e.elevation-ENEMIES[e.kind].height-20);
  }
  effects(w:World) {
    const c=this.ctx;
    this.superEffects(w);
    for(const s of w.slashes) {
      c.save();c.translate(s.x,s.y);c.globalCompositeOperation='screen';
      if(s.type==='pulse') {
        const progress=1-s.life/.65; c.globalAlpha=s.life/.65;c.scale(1,.53);
        c.strokeStyle='#b5ffdf';c.shadowColor='#59ffd2';c.shadowBlur=24;c.lineWidth=5*(1-progress)+1;
        c.beginPath();c.arc(0,0,40+progress*260,0,Math.PI*2);c.stroke();
        c.lineWidth=1;c.beginPath();c.arc(0,0,30+progress*230,0,Math.PI*2);c.stroke();
        for(let j=0;j<8;j++){c.save();c.rotate(j*Math.PI/4+progress);c.fillStyle='#96ffcf';c.font='15px monospace';c.fillText(['{}','01','//','<>'][j%4],progress*245,0);c.restore();}
      } else {
        const progress=1-s.life/.25;
        c.scale(s.facing,1);c.globalAlpha=(1-progress)*.8;c.shadowColor=s.color||'#56ffd0';c.shadowBlur=s.finisher?24:12;
        c.strokeStyle=s.color||'#baffdf';c.lineWidth=s.finisher?4:2;c.beginPath();
        if(s.style==='uppercut'){c.moveTo(10,40);c.quadraticCurveTo(95,-20,45+progress*40,-130);}
        else if(s.style==='kick'){c.moveTo(-20,15);c.quadraticCurveTo(60,-35,95+progress*40,8);}
        else if(s.style==='heavy'||s.style==='slam'){c.moveTo(-15,-95);c.lineTo(50+progress*48,-8);c.lineTo(60+progress*50,50);}
        else{c.moveTo(0,-8);c.lineTo(60+progress*55,-8);c.lineTo(38+progress*40,6);}
        c.stroke();
        if(s.style==='slam'){c.save();c.translate(55,77);c.scale(1,.25);c.beginPath();c.arc(0,0,30+progress*135,0,Math.PI*2);c.stroke();c.restore();}
        // Keycap fragments give the strike the short, blunt impact of a keyboard.
        for(let i=0;i<(s.style==='jab'||s.style==='kick'?0:5);i++){
          c.save();c.translate(25+progress*(45+i*12),-35+i*15+(i-2)*progress*15);c.rotate((i-2)*.3+progress);
          c.fillStyle='#173d35';c.fillRect(-6,-6,12,12);c.strokeRect(-6,-6,12,12);
          c.fillStyle='#d4ffed';c.font='8px monospace';c.textAlign='center';c.fillText(['{','}',';','/','↵'][i],0,3);c.restore();
        }
      }c.restore();
    }
    for(const p of w.particles) {
      c.save();c.globalAlpha=clamp(p.life/p.maxLife,0,1);c.fillStyle=p.color;
      if(p.type==='code') {c.font=`${p.size*2.5}px monospace`;c.fillText(p.vx>0?'1':'0',p.x,p.y);}
      else if(p.type==='smoke'){c.globalAlpha*=.13;c.beginPath();c.ellipse(p.x,p.y,p.size*5,p.size*9,0,0,Math.PI*2);c.fill();}
      else {c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));c.fillRect(-p.size,0,p.size*3,1.8);}
      c.restore();
    }
    for(const t of w.texts) {c.save();c.globalAlpha=clamp(t.life*2,0,1);c.font=`bold ${t.size}px monospace`;c.textAlign='center';c.shadowColor='#071517';c.shadowBlur=5;c.fillStyle=t.color;c.fillText(t.text,t.x,t.y);c.restore();}
  }
  superEffects(w:World){
    const c=this.ctx;
    for(const s of w.superEffects){
      const move=MOVES[s.id],fade=Math.min(1,s.life/.24),radius=Math.min(move.reach,s.age*(s.id==='delete'?1000:1200));
      c.save();c.translate(lerp(s.previousX,s.x,this.interpolation),s.y-s.elevation);c.globalAlpha=fade;
      c.strokeStyle=move.color;c.shadowColor=move.color;c.shadowBlur=20;
      if(s.id==='hotfix'){
        c.translate(0,-80);c.scale(s.facing,1);
        for(let i=4;i>0;i--){c.globalAlpha=fade*(.18-i*.03);c.fillStyle=move.color;c.fillRect(-i*38-54,-30+i*3,108,60-i*6);}
        c.globalAlpha=fade;c.save();c.rotate(-.1);c.lineWidth=4;
        const bevel=c.createLinearGradient(0,-44,0,44);bevel.addColorStop(0,'#91efd1');bevel.addColorStop(.18,'#204f47');bevel.addColorStop(1,'#071f26');
        c.fillStyle=bevel;c.beginPath();c.roundRect(-66,-43,132,86,12);c.fill();c.stroke();
        c.lineWidth=1.5;c.strokeRect(-54,-32,108,58);c.fillStyle='#d6fff0';c.font='bold 53px monospace';c.textAlign='center';c.fillText('↵',0,19);c.restore();
        c.lineWidth=2;c.beginPath();
        for(let j=0;j<14;j++){const x=-120+j*18,y=Math.sin(j*2+s.age*37)*16+(j%2?44:-44);j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
      }else if(s.id==='delete'){
        c.save();c.scale(1,.29);c.lineWidth=8*(1-s.age/.95);c.beginPath();c.arc(0,0,radius,0,Math.PI*2);c.stroke();
        c.globalAlpha=fade*.3;c.lineWidth=23;c.beginPath();c.arc(0,0,radius*.9,0,Math.PI*2);c.stroke();c.restore();
        c.globalAlpha=fade;c.lineWidth=2;
        for(let j=0;j<18;j++){
          const angle=j*2.399,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius*.23,flight=Math.sin(Math.min(1,s.age/.7)*Math.PI)*(18+j%5*8);
          c.save();c.translate(x,y-flight);c.rotate(angle+s.age*(j%2?3:-3));
          c.fillStyle=j%3?'#607466':'#ddbb7b';c.beginPath();c.moveTo(-9,-6);c.lineTo(5,-9);c.lineTo(12,3);c.lineTo(-5,8);c.closePath();c.fill();c.stroke();c.restore();
        }
        c.save();c.globalCompositeOperation='screen';c.lineWidth=3;c.beginPath();c.moveTo(-radius,0);
        for(let j=1;j<=18;j++)c.lineTo(-radius+j*radius/9,Math.sin(j*31)*14);c.stroke();c.restore();
      }else{
        for(let j=-2;j<=2;j++){
          const rise=Math.sin(Math.min(1,s.age/.8)*Math.PI),h=(260-Math.abs(j)*35)*rise,x=j*71;
          c.save();c.translate(x,Math.abs(j)*5);c.globalCompositeOperation='screen';
          const beam=c.createLinearGradient(0,-h,0,0);beam.addColorStop(0,'transparent');beam.addColorStop(.3,'#9b79e860');beam.addColorStop(1,'#cfb3ffc0');
          c.fillStyle=beam;c.fillRect(-17,-h,34,h);c.lineWidth=2;c.beginPath();c.moveTo(-22,0);c.lineTo(-13,-h*.55);c.lineTo(4,-h);c.lineTo(14,-h*.4);c.lineTo(22,0);c.stroke();
          c.font='13px monospace';c.textAlign='center';c.fillStyle='#eddaff';
          for(let k=0;k<5;k++)c.fillText((j+k)%2?'01':'{}',Math.sin(k+j)*8,-h*(k+1)/6);
          c.restore();
        }
        c.save();c.scale(1,.25);c.lineWidth=3;c.beginPath();c.ellipse(0,0,radius,95,0,0,Math.PI*2);c.stroke();c.restore();
      }
      c.restore();
    }
  }
  atmosphere(w:World) {
    const c=this.ctx;if(!w.settings.particles)return;
    c.save();c.globalCompositeOperation='screen';
    for(const m of this.motes) {
      const x=(m.x+Math.sin(this.time*.2+m.phase)*20-w.camera*.07+2560)%1280;
      const y=(m.y-this.time*m.speed+7200)%720;
      c.globalAlpha=(.25+Math.sin(this.time+m.phase)*.15)*(y>540?.4:1);c.fillStyle=m.phase>4?'#ffbe88':'#b8ffe5';c.beginPath();c.arc(x,y,m.r,0,Math.PI*2);c.fill();
    }
    c.restore();
  }
}
