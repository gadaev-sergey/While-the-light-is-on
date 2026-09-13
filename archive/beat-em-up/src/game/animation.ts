import { clamp, lerp } from './math.ts';

export interface PoseLayer { frame: string; weight: number }
export interface AnimationClip { frames: readonly string[]; duration: number; loop?: boolean }
export const smoothstep=(t:number)=>{const x=clamp(t,0,1);return x*x*(3-2*x);};

/** A clip samples adjacent poses continuously. Timing belongs to the actor, never wall time. */
export function sampleClip(clip:AnimationClip,time:number):PoseLayer[] {
  if(clip.frames.length===1)return [{frame:clip.frames[0],weight:1}];
  const phase=clip.loop?((time%clip.duration)+clip.duration)%clip.duration/clip.duration:clamp(time/clip.duration,0,1);
  const cursor=phase*(clip.loop?clip.frames.length:clip.frames.length-1);
  const index=Math.min(Math.floor(cursor),clip.frames.length-1),next=(index+1)%clip.frames.length;
  // A short hold keeps silhouettes readable; a continuous, eased transition removes frame popping.
  const blend=smoothstep((cursor-index-.2)/.8);
  return blend>0?[{frame:clip.frames[index],weight:1-blend},{frame:clip.frames[next],weight:blend}]:[{frame:clip.frames[index],weight:1}];
}
export function blendPoses(from:PoseLayer[],to:PoseLayer[],weight:number):PoseLayer[] {
  const layers=new Map<string,number>();
  for(const p of from)layers.set(p.frame,(layers.get(p.frame)||0)+p.weight*(1-weight));
  for(const p of to)layers.set(p.frame,(layers.get(p.frame)||0)+p.weight*weight);
  return [...layers].filter(([,weight])=>weight>.00001).map(([frame,weight])=>({frame,weight}));
}

export class PoseAnimator {
  key='';time=0;transition=1;duration=.09;current:PoseLayer[]=[];from:PoseLayer[]=[];
  update(key:string,clip:AnimationClip,dt:number,speed=1,transition=.09,sampleTime?:number):PoseLayer[] {
    if(key!==this.key){this.from=this.current;this.key=key;this.time=0;this.transition=this.from.length?0:1;this.duration=transition;}
    this.time=sampleTime??this.time+dt*speed;
    this.transition=Math.min(1,this.transition+dt/Math.max(.001,this.duration));
    const target=sampleClip(clip,this.time);
    this.current=this.transition<1?blendPoses(this.from,target,smoothstep(this.transition)):target;
    return this.current;
  }
  reset(){this.key='';this.time=0;this.current=[];this.from=[];this.transition=1;}
}

export const interpolatedPosition=(entity:{x:number;y:number;previousX:number;previousY:number},alpha:number)=>({x:lerp(entity.previousX,entity.x,alpha),y:lerp(entity.previousY,entity.y,alpha)});
