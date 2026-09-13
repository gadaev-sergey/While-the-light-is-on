import type { Assets } from './assets.ts';
import { Ground, periodicStrip } from './ground.ts';
import { OFFICE_LEVELS, FLOOR_HEIGHT, stairHeight } from './terrain.ts';
import { PROPS, SECTORS } from './content.ts';
import { clamp } from './math.ts';
import type { World } from './world.ts';

/** Illustrated materials and office geometry share the same world coordinates as physics. */
export class OfficeRenderer {
  ground:Ground;wall:HTMLCanvasElement;top:HTMLCanvasElement;edge:HTMLCanvasElement;
  constructor(private assets:Assets){
    this.ground=new Ground(assets.images.ground);
    this.wall=periodicStrip(assets.images.environment,1536,280,256);
    this.top=document.createElement('canvas');this.top.width=1280;this.top.height=134;
    this.top.getContext('2d')!.drawImage(this.ground.tile,0,0,1280,138,0,0,1280,134);
    this.edge=document.createElement('canvas');this.edge.width=1280;this.edge.height=30;
    this.edge.getContext('2d')!.drawImage(this.ground.tile,0,142,1280,70,0,0,1280,30);
  }
  background(c:CanvasRenderingContext2D,w:World){
    c.fillStyle='#101e24';c.fillRect(0,0,1280,720);
    for(const floor of [0,1]){
      const baseline=518-floor*FLOOR_HEIGHT,pattern=c.createPattern(this.wall,'repeat-x')!;
      pattern.setTransform(new DOMMatrix().translate(-w.camera*.2-w.sector*215,baseline-280));
      c.fillStyle=pattern;c.fillRect(0,baseline-280,1280,280);
      if(w.sector){c.fillStyle=w.sector===1?'rgba(47,72,94,.10)':'rgba(19,62,74,.22)';c.fillRect(0,baseline-280,1280,280);}
    }
    this.ground.draw(c,w.camera);
  }
  structure(c:CanvasRenderingContext2D,w:World){
    const level=OFFICE_LEVELS[w.sector],s=level.stairs,back=518-FLOOR_HEIGHT,front=641-FLOOR_HEIGHT;
    // Upper deck and the opening at the head of the staircase.
    c.save();c.beginPath();c.rect(level.start,back,1380,134);c.rect(s.x,back,s.end-s.x,s.front-s.back);c.clip('evenodd');
    const top=c.createPattern(this.top,'repeat-x')!;top.setTransform(new DOMMatrix().translate(0,back));c.fillStyle=top;c.fillRect(level.start,back,1380,134);c.restore();
    const edge=c.createPattern(this.edge,'repeat-x')!;edge.setTransform(new DOMMatrix().translate(0,front+1));c.fillStyle=edge;c.fillRect(level.start,front+1,1380,30);
    c.fillStyle='#12282f';c.fillRect(level.start,front+29,1380,6);c.fillStyle='#a79773';c.fillRect(level.start,front,1380,2);
    // Painted tread texture over a continuous collision slope; visual steps never bounce the actor.
    const count=20,run=(s.end-s.x)/count,rise=FLOOR_HEIGHT/count;
    c.save();c.fillStyle='#19323a';c.beginPath();c.moveTo(s.x,s.front);c.lineTo(s.end,s.front-FLOOR_HEIGHT);c.lineTo(s.end,s.front-FLOOR_HEIGHT+18);c.lineTo(s.x,s.front+18);c.closePath();c.fill();
    for(let i=0;i<count;i++){
      const x=s.x+i*run,z=(i+1)*rise,y=s.back-z;
      c.save();c.beginPath();c.rect(x,y,run+.5,s.front-s.back);c.clip();
      const pattern=c.createPattern(this.top,'repeat')!;pattern.setTransform(new DOMMatrix().translate(0,y));c.fillStyle=pattern;c.fillRect(x,y,run+1,s.front-s.back);c.restore();
      const shade=c.createLinearGradient(0,0,0,rise);shade.addColorStop(0,'#496168');shade.addColorStop(1,'#1b3038');
      c.save();c.translate(x,s.front-z);c.fillStyle=shade;c.fillRect(0,0,run,rise);c.strokeStyle='#b8ad8c';c.lineWidth=1;c.beginPath();c.moveTo(0,0);c.lineTo(run,0);c.stroke();c.restore();
    }
    c.strokeStyle='#10242c';c.lineWidth=5;c.beginPath();c.moveTo(s.x,s.front+rise);c.lineTo(s.end,s.front-FLOOR_HEIGHT+rise);c.stroke();c.restore();
    this.rail(c,w,false);
    // Distinct floor numbers and a quiet direction marker at the foot of the stairs.
    c.save();c.textAlign='left';
    for(const floor of [0,1]){
      const y=518-floor*FLOOR_HEIGHT-24;c.fillStyle='#0d2328dc';c.fillRect(level.start+85,y-37,149,36);
      c.fillStyle='#d7ccb0';c.font='bold 20px monospace';c.fillText(String(w.sector*2+floor+1).padStart(2,'0'),level.start+97,y-12);
      c.font='9px monospace';c.fillStyle='#9fbab4';c.fillText(floor?'ВЕРХНИЙ ЭТАЖ':'НИЖНИЙ ЭТАЖ',level.start+133,y-15);
    }
    c.strokeStyle='#c3ab79';c.fillStyle='#d3bc8c';c.lineWidth=2;
    c.beginPath();c.moveTo(s.x-83,600);c.lineTo(s.x-20,600);c.lineTo(s.x-20,579);c.stroke();
    c.beginPath();c.moveTo(s.x-25,585);c.lineTo(s.x-20,578);c.lineTo(s.x-15,585);c.stroke();
    c.font='10px monospace';c.fillText('ЛЕСТНИЦА ↑',s.x-100,619);c.restore();
  }
  rail(c:CanvasRenderingContext2D,w:World,front:boolean){
    const level=OFFICE_LEVELS[w.sector],s=level.stairs,y=front?s.front:s.back;
    c.save();c.lineCap='round';c.strokeStyle='#172e36';c.lineWidth=5;c.beginPath();c.moveTo(s.x,y-54);c.lineTo(s.end,y-FLOOR_HEIGHT-54);c.stroke();
    c.strokeStyle=front?'#a2aea2':'#718f91';c.lineWidth=1.8;
    c.beginPath();c.moveTo(s.x,y-56);c.lineTo(s.end,y-FLOOR_HEIGHT-56);c.stroke();
    for(let i=0;i<=5;i++){const x=s.x+(s.end-s.x)*i/5,z=stairHeight(level,x);c.beginPath();c.moveTo(x,y-z-54);c.lineTo(x,y-z+4);c.stroke();}
    c.restore();
  }
  elevator(c:CanvasRenderingContext2D,w:World){
    const l=w.lift,img=this.assets.images.elevator,x=l.x,y=l.y-l.elevation;
    c.save();c.translate(x,y);
    c.drawImage(img,0,0,img.width,img.height,-102,-262,204,284);
    const opening=w.liftTravel?clamp(1-(1.25-w.liftTravel)/.35,0,1):w.liftReady?1:0;
    const half=57*(1-opening),panels=c.createLinearGradient(-57,0,57,0);panels.addColorStop(0,'#1c333a');panels.addColorStop(.48,'#66807f');panels.addColorStop(.5,'#152830');panels.addColorStop(.52,'#506c6e');panels.addColorStop(1,'#203c43');
    c.fillStyle=panels;c.fillRect(-57,-221,half,204);c.fillRect(57-half,-221,half,204);
    if(half>2){c.strokeStyle='#94aca04d';c.lineWidth=1;c.strokeRect(-57,-221,half,204);c.strokeRect(57-half,-221,half,204);}
    c.fillStyle=w.liftReady?'#acffd9':'#edb07c';c.textAlign='center';c.font='bold 10px monospace';c.fillText(w.liftTravel?'↑ ↑ ↑':String(w.sector*2+2).padStart(2,'0'),0,-238);
    c.font='8px monospace';c.fillStyle='#e1d2ac';c.fillText('ЛИФТ',0,-268);
    if(w.liftReady){c.globalAlpha=.2;c.fillStyle='#91ecc0';c.beginPath();c.ellipse(0,3,73,16,0,0,Math.PI*2);c.fill();}
    c.restore();
  }
  foreground(c:CanvasRenderingContext2D,w:World){
    const level=OFFICE_LEVELS[w.sector],img=this.assets.images.props,cw=img.width/3,ch=img.height/2;
    for(const p of PROPS){
      if(p.x<level.start||p.x>level.end)continue;
      const x=p.x-(w.camera-level.start)*.05,y=p.y-p.elevation,width=p.h*1.65;
      c.save();c.globalAlpha=.95;c.drawImage(img,p.frame%3*cw,Math.floor(p.frame/3)*ch,cw,ch,x-width/2,y-p.h*.91,width,p.h);c.restore();
    }
  }
  transit(c:CanvasRenderingContext2D,w:World){
    if(!w.liftTravel)return;
    const progress=1-w.liftTravel/1.25;
    c.save();c.fillStyle=`rgba(5,15,20,${clamp((progress-.18)/.65,0,.95)})`;c.fillRect(0,0,1280,720);
    if(progress>.25){c.globalAlpha=clamp((progress-.25)*3,0,1);c.textAlign='center';c.fillStyle='#bfe5d3';c.font='11px monospace';c.fillText('ЛИФТ · ПЕРЕХОД МЕЖДУ УРОВНЯМИ',640,329);c.font='28px monospace';c.fillText(w.sector===2?'ВЫХОД НА КРЫШУ':SECTORS[w.sector+1].name.toUpperCase(),640,374);}
    c.restore();
  }
}
