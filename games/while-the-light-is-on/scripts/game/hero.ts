import type {BaseAssets} from './assets.ts';
import {BASE,lerp} from './config.ts';
import type {Player,DoorInteraction,Vec} from './types.ts';
import {DOOR_POSES,DOOR_POSE_SCALE} from './door-contact.ts';
import {PoseAnimator,type PoseLayer,blendPoses,sampleClip,smoothstep} from './animation.ts';
const walkX=[194,193,164,173,211,203,179,177];
const punchX=[197,197,185,175,181,182,196,194];
/** The approved developer artwork is unchanged. Poses share one ground origin. */
export class BaseHero{
 gripTarget:Vec={x:50,y:-78};
 animator=new PoseAnimator();cache=new Map<string,HTMLCanvasElement>();surface=document.createElement('canvas');attackFrom:PoseLayer[]=[];attacking=false;
 constructor(private assets:BaseAssets){this.surface.width=400;this.surface.height=360;for(const sheet of ['walk','punch'])for(let i=0;i<8;i++)this.texture(`${sheet}:${i}`);this.texture('idle:0');}
 reset(){this.animator.reset();this.attacking=false;}
 texture(key:string){
  const cacheKey=key.startsWith('door:')?`${key}:${this.gripTarget.x.toFixed(3)}:${this.gripTarget.y.toFixed(3)}`:key;
  if(this.cache.has(cacheKey))return this.cache.get(cacheKey)!;
  if(key.startsWith('door:')){
   const i=Number(key.split(':')[1]),image=this.assets.images.doorPose;
   const r=DOOR_POSES[i],scale=DOOR_POSE_SCALE*2;
   const canvas=document.createElement('canvas');canvas.width=400;canvas.height=360;const ctx=canvas.getContext('2d')!;
   const dx=this.gripTarget.x*2-(r.hx-r.ax)*scale,dy=this.gripTarget.y*2-(r.hy-r.ay)*scale;
   ctx.translate(180-r.ax*scale,320-r.ay*scale);
   // Register the existing pose at its actual fist. The lower-body affine section
   // absorbs the small offset, keeping both foot anchors fixed during the bend.
   ctx.save();ctx.translate(dx,dy);ctx.drawImage(image,r.x,r.y,r.w,r.hy,0,0,r.w*scale,r.hy*scale);ctx.restore();
   const span=(r.ay-r.hy)*scale;ctx.save();ctx.transform(1,0,-dx/span,1-dy/span,dx,r.hy*scale+dy);ctx.drawImage(image,r.x,r.y+r.hy,r.w,r.ay-r.hy,0,0,r.w*scale,span);ctx.restore();
   ctx.drawImage(image,r.x,r.y+r.ay,r.w,r.h-r.ay,0,r.ay*scale,r.w*scale,(r.h-r.ay)*scale);
   this.cache.set(cacheKey,canvas);return canvas;
  }
  const [name,n]=key.split(':'),i=+n,sheet=name as 'walk'|'punch'|'idle',im=this.assets.images[sheet],cw=im.width/4,ch=im.height/2;
  const a={x:sheet==='walk'?walkX[i]:sheet==='punch'?punchX[i]:190,y:sheet==='walk'?(i<4?486:483):sheet==='punch'?(i<4?496:494):504};
  const scale=BASE.heroScale*2,c=document.createElement('canvas');c.width=400;c.height=360;const ctx=c.getContext('2d')!;ctx.translate(180,320);
  const width=sheet==='punch'&&(i===4||i===5)?412:cw;
  if(sheet==='punch'&&(i===4||i===5)){ctx.beginPath();ctx.rect(-a.x*scale,-a.y*scale,cw*scale,ch*scale);ctx.rect((cw-a.x)*scale,(75-a.y)*scale,(width-cw)*scale,95*scale);ctx.clip();}
  if(sheet==='punch'&&(i===5||i===6)){ctx.beginPath();ctx.rect(-a.x*scale,-a.y*scale,width*scale,ch*scale);ctx.rect(-a.x*scale,(80-a.y)*scale,27*scale,90*scale);ctx.clip('evenodd');}
  ctx.drawImage(im,i%4*cw,Math.floor(i/4)*ch,width,ch,-a.x*scale,-a.y*scale,width*scale,ch*scale);this.cache.set(key,c);return c;
 }
 draw(c:CanvasRenderingContext2D,p:Player,dt:number,alpha:number,working:boolean,ladder=false,door:DoorInteraction|null=null,hand?:Vec){
  if(hand)this.gripTarget=hand;
  let layers:PoseLayer[];
  if(door&&door.phase!=='approach'){this.attacking=false;layers=this.animator.update('door',{frames:['door:0','door:1','door:2','door:3'],duration:3},dt,1,.18,door.reach<1?door.reach:1+2*door.lean);}
  else if(p.attack>0){if(!this.attacking){this.attackFrom=this.animator.current;this.attacking=true;}const t=.42-p.attack,target=sampleClip({frames:Array.from({length:8},(_,i)=>`punch:${i}`),duration:.42},t);layers=blendPoses(this.attackFrom,target,smoothstep(t/.055));this.animator.current=layers;this.animator.key='punch';}
  else{this.attacking=false;const key=p.moving?(ladder?'climb':'walk'):'idle';layers=this.animator.update(key,{frames:p.moving?(ladder?['walk:2','walk:6']:Array.from({length:8},(_,i)=>`walk:${i}`)):['idle:0'],duration:1,loop:true},dt,1,.10,p.moving?lerp(p.previousDistance,p.distance,alpha)/(ladder?46:145):0);}
  const x=lerp(p.previousX,p.x,alpha),y=lerp(p.previousY,p.y,alpha);c.save();c.translate(x,y);c.scale(p.facing,1);
  if(working)c.rotate(.06);if(p.hurt)c.filter='brightness(1.6)';
  if(layers.length===1)c.drawImage(this.texture(layers[0].frame),-90,-160,200,180);
  else{const sc=this.surface.getContext('2d')!;sc.clearRect(0,0,400,360);sc.globalCompositeOperation='lighter';for(const l of layers){sc.globalAlpha=l.weight;sc.drawImage(this.texture(l.frame),0,0);}sc.globalAlpha=1;sc.globalCompositeOperation='source-over';c.drawImage(this.surface,-90,-160,200,180);}
  c.restore();
 }
}
