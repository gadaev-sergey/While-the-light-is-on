import { Assets, type AssetName } from './assets.ts';
import { ENEMY_FRAMES, drawEnemyFrame } from './sprites.ts';
import type { PoseLayer } from './animation.ts';
import { ENEMIES } from './content.ts';

export const WALK_ANCHORS=[194,193,164,173,211,203,179,177].map((x,i)=>({x,y:i<4?486:483,scale:.4}));
export const ATTACK_ANCHORS=[[190,504],[190,504],[190,504],[190,504],[175,486],[175,486],[185,490],[190,506]].map(([x,y])=>({x,y,scale:.4}));
// Airborne poses keep the virtual standing baseline; tucked feet must not be pushed back down.
export const JUMP_ANCHORS=[[178,498],[205,498],[199,498],[215,498],[190,498],[210,498],[210,492],[207,495]].map(([x,y])=>({x,y,scale:.4}));

// Left shoulder drives the punch; the right hand keeps the keyboard at the belly.
export const PUNCH_ANCHORS=[[197,496],[197,496],[185,496],[175,496],[181,494],[182,494],[196,494],[194,494]].map(([x,y])=>({x,y,scale:.4}));
// The kick atlas has five poses above and four below. Explicit rectangles retain the complete extended leg.
export const KICK_FRAMES=[
  {x:0,y:0,w:288,h:512,ax:142,ay:496},
  {x:288,y:0,w:282,h:512,ax:154,ay:493},
  {x:575,y:0,w:274,h:512,ax:153,ay:490},
  {x:866,y:0,w:263,h:512,ax:143,ay:490},
  {x:1136,y:0,w:400,h:512,ax:151,ay:494},
  {x:0,y:512,w:434,h:512,ax:156,ay:490},
  {x:450,y:512,w:292,h:512,ax:158,ay:490},
  {x:800,y:512,w:270,h:512,ax:136,ay:488},
  {x:1190,y:512,w:312,h:512,ax:163,ay:487},
];

/** Normalized, premultiplied pose blending. Every frame uses the same grounded origin;
 * additive weighted composition retains opacity instead of making the actor translucent. */
export class PosePainter {
  private cache=new Map<string,HTMLCanvasElement>();
  private surface=document.createElement('canvas');
  private context:CanvasRenderingContext2D;
  readonly width=420;readonly height=360;readonly originX=210;readonly originY=330;readonly resolution=2;
  constructor(private assets:Assets){
    this.surface.width=this.width*this.resolution;this.surface.height=this.height*this.resolution;this.context=this.surface.getContext('2d')!;
    // Prepare textures while the loading screen is visible, rather than stall on the first strike.
    for(const sheet of ['walk','attack','jump','punch'])for(let i=0;i<8;i++)this.texture(`${sheet}:${i}`);
    for(let i=0;i<9;i++)this.texture(`kick:${i}`);
    for(let i=0;i<6;i++)this.texture(`enemy:${i}`);
  }
  texture(id:string){
    const cached=this.cache.get(id);if(cached)return cached;
    const canvas=document.createElement('canvas');canvas.width=this.surface.width;canvas.height=this.surface.height;
    const c=canvas.getContext('2d')!;c.scale(this.resolution,this.resolution);c.translate(this.originX,this.originY);
    const [sheet,number]=id.split(':');const index=Number(number);
    if(sheet==='kick'){
      const f=KICK_FRAMES[index],scale=.4;
      c.drawImage(this.assets.images['developer-kick'],f.x,f.y,f.w,f.h,-f.ax*scale,-f.ay*scale,f.w*scale,f.h*scale);
    }else if(sheet==='walk'||sheet==='attack'||sheet==='jump'||sheet==='punch'){
      const asset:AssetName=`developer-${sheet}`,image=this.assets.images[asset],cw=image.width/4,ch=image.height/2;
      const a=(sheet==='walk'?WALK_ANCHORS:sheet==='attack'?ATTACK_ANCHORS:sheet==='punch'?PUNCH_ANCHORS:JUMP_ANCHORS)[index],scale=a.scale;
      const width=sheet==='punch'&&index===4?412:sheet==='punch'&&index===5?412:sheet==='attack'&&index===4?422:sheet==='attack'&&index===5?450:cw;
      // Preserve the complete keyboard extending past its cell; exclude the adjacent swing.
      if(sheet==='attack'&&index>=4&&index<=6){
        c.beginPath();c.rect(-a.x*scale,-a.y*scale,cw*scale,ch*scale);
        if(width>cw)c.rect((cw-a.x)*scale,(200-a.y)*scale,(width-cw)*scale,160*scale);
        if(index>=5)c.rect(-a.x*scale,(210-a.y)*scale,(index===5?40:75)*scale,150*scale);
        c.clip('evenodd');
      }
      if(sheet==='punch'&&(index===4||index===5)){
        c.beginPath();c.rect(-a.x*scale,-a.y*scale,cw*scale,ch*scale);
        c.rect((cw-a.x)*scale,(75-a.y)*scale,(width-cw)*scale,95*scale);c.clip();
      }
      if(sheet==='punch'&&(index===5||index===6)){
        c.beginPath();c.rect(-a.x*scale,-a.y*scale,width*scale,ch*scale);
        c.rect(-a.x*scale,(80-a.y)*scale,27*scale,90*scale);c.clip('evenodd');
      }
      c.drawImage(image,index%4*cw,Math.floor(index/4)*ch,width,ch,-a.x*scale,-a.y*scale,width*scale,ch*scale);
    }else{
      const f=ENEMY_FRAMES[index],kind=index<3?'bug':index<5?'feature':'boss',scale=ENEMIES[kind].height/(kind==='bug'?300:560);
      drawEnemyFrame(c,this.assets.images.enemies,index,-f.ax*scale,-f.ay*scale,scale);
    }
    this.cache.set(id,canvas);return canvas;
  }
  draw(ctx:CanvasRenderingContext2D,layers:PoseLayer[]){
    if(!layers.length)return;
    if(layers.length===1){ctx.drawImage(this.texture(layers[0].frame),-this.originX,-this.originY,this.width,this.height);return;}
    const c=this.context;c.clearRect(0,0,this.surface.width,this.surface.height);c.globalCompositeOperation='lighter';
    for(const layer of layers){c.globalAlpha=layer.weight;c.drawImage(this.texture(layer.frame),0,0);}
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
    ctx.drawImage(this.surface,-this.originX,-this.originY,this.width,this.height);
  }
}
