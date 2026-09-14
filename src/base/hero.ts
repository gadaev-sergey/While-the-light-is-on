import type {BaseAssets} from './assets.ts';
import {BASE,lerp} from './config.ts';
import type {Player} from './types.ts';
import {PoseAnimator,type PoseLayer,blendPoses,sampleClip,smoothstep} from './animation.ts';
const walkX=[194,193,164,173,211,203,179,177];
const punchX=[197,197,185,175,181,182,196,194];
/** The approved developer artwork is unchanged. Poses share one ground origin. */
export class BaseHero{
 animator=new PoseAnimator();cache=new Map<string,HTMLCanvasElement>();surface=document.createElement('canvas');attackFrom:PoseLayer[]=[];attacking=false;
 constructor(private assets:BaseAssets){this.surface.width=400;this.surface.height=360;for(const sheet of ['walk','punch'])for(let i=0;i<8;i++)this.texture(`${sheet}:${i}`);this.texture('idle:0');}
 reset(){this.animator.reset();this.attacking=false;}
 texture(key:string){
  if(this.cache.has(key))return this.cache.get(key)!;
  const [name,n]=key.split(':'),i=+n,sheet=name as 'walk'|'punch'|'idle',im=this.assets.images[sheet],cw=im.width/4,ch=im.height/2;
  const a={x:sheet==='walk'?walkX[i]:sheet==='punch'?punchX[i]:190,y:sheet==='walk'?(i<4?486:483):sheet==='punch'?(i<4?496:494):504};
  const scale=BASE.heroScale*2,c=document.createElement('canvas');c.width=400;c.height=360;const ctx=c.getContext('2d')!;ctx.translate(180,320);
  const width=sheet==='punch'&&(i===4||i===5)?412:cw;
  if(sheet==='punch'&&(i===4||i===5)){ctx.beginPath();ctx.rect(-a.x*scale,-a.y*scale,cw*scale,ch*scale);ctx.rect((cw-a.x)*scale,(75-a.y)*scale,(width-cw)*scale,95*scale);ctx.clip();}
  if(sheet==='punch'&&(i===5||i===6)){ctx.beginPath();ctx.rect(-a.x*scale,-a.y*scale,width*scale,ch*scale);ctx.rect(-a.x*scale,(80-a.y)*scale,27*scale,90*scale);ctx.clip('evenodd');}
  ctx.drawImage(im,i%4*cw,Math.floor(i/4)*ch,width,ch,-a.x*scale,-a.y*scale,width*scale,ch*scale);this.cache.set(key,c);return c;
 }
 draw(c:CanvasRenderingContext2D,p:Player,dt:number,alpha:number,working:boolean,ladder=false){
  let layers:PoseLayer[];
  if(p.attack>0){if(!this.attacking){this.attackFrom=this.animator.current;this.attacking=true;}const t=.42-p.attack,target=sampleClip({frames:Array.from({length:8},(_,i)=>`punch:${i}`),duration:.42},t);layers=blendPoses(this.attackFrom,target,smoothstep(t/.055));this.animator.current=layers;this.animator.key='punch';}
  else{this.attacking=false;const key=p.moving?(ladder?'climb':'walk'):'idle';layers=this.animator.update(key,{frames:p.moving?(ladder?['walk:2','walk:6']:Array.from({length:8},(_,i)=>`walk:${i}`)):['idle:0'],duration:1,loop:true},dt,1,.10,p.moving?lerp(p.previousDistance,p.distance,alpha)/(ladder?46:145):0);}
  const x=lerp(p.previousX,p.x,alpha),y=lerp(p.previousY,p.y,alpha);c.save();c.translate(x,y);c.scale(p.facing,1);
  if(working)c.rotate(.06);if(p.hurt)c.filter='brightness(1.6)';
  if(layers.length===1)c.drawImage(this.texture(layers[0].frame),-90,-160,200,180);
  else{const sc=this.surface.getContext('2d')!;sc.clearRect(0,0,400,360);sc.globalCompositeOperation='lighter';for(const l of layers){sc.globalAlpha=l.weight;sc.drawImage(this.texture(l.frame),0,0);}sc.globalAlpha=1;sc.globalCompositeOperation='source-over';c.drawImage(this.surface,-90,-160,200,180);}
  c.restore();
 }
}
