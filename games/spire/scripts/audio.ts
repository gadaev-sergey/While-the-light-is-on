import type {SoundName} from './client.ts';
import type {Vec3} from './arena.ts';

/** Процедурные звуки на Web Audio: шум и осцилляторы, без внешних файлов. */
export class AudioEngine{
 private ctx:AudioContext|null=null;private master:GainNode|null=null;private noise:AudioBuffer|null=null;
 volume=.7;muted=false;
 async unlock(){
  if(!this.ctx){
   try{this.ctx=new AudioContext();}catch{return;}
   this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);this.applyVolume();
   const b=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noise=b;
  }
  if(this.ctx.state==='suspended')await this.ctx.resume().catch(()=>{});
 }
 setVolume(v:number){this.volume=Math.max(0,Math.min(1,v));this.applyVolume();}
 setMuted(m:boolean){this.muted=m;this.applyVolume();}
 private applyVolume(){if(this.master)this.master.gain.value=this.muted?0:this.volume*.8;}

 /** pos — источник в мире; listener — позиция и поворот слушателя. */
 play(name:SoundName,pos?:Vec3,listener?:{pos:Vec3;yaw:number}){
  const ctx=this.ctx,master=this.master;if(!ctx||!master||ctx.state!=='running')return;
  let gain=1,pan=0;
  if(pos&&listener){
   const dx=pos.x-listener.pos.x,dz=pos.z-listener.pos.z,dy=pos.y-listener.pos.y,d=Math.hypot(dx,dy,dz);
   gain=1/(1+d*.09);if(gain<.03)return;
   const right=dx*Math.cos(listener.yaw)-dz*Math.sin(listener.yaw);pan=Math.max(-.85,Math.min(.85,right/(d||1)));
  }
  const out=ctx.createGain();out.gain.value=gain;const panner=ctx.createStereoPanner();panner.pan.value=pan;out.connect(panner).connect(master);
  const t=ctx.currentTime;
  const tone=(type:OscillatorType,f0:number,f1:number,dur:number,vol:number,delay=0)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t+delay);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+delay+dur);g.gain.setValueAtTime(vol,t+delay);g.gain.exponentialRampToValueAtTime(.001,t+delay+dur);o.connect(g).connect(out);o.start(t+delay);o.stop(t+delay+dur+.02);};
  const hiss=(dur:number,vol:number,freq:number,q=1,type:BiquadFilterType='lowpass',delay=0)=>{const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=this.noise;f.type=type;f.frequency.value=freq;f.Q.value=q;g.gain.setValueAtTime(vol,t+delay);g.gain.exponentialRampToValueAtTime(.001,t+delay+dur);s.connect(f).connect(g).connect(out);s.start(t+delay,Math.random()*.5);s.stop(t+delay+dur+.02);};
  switch(name){
   case 'blaster':tone('square',1300,380,.07,.12);hiss(.05,.12,4000,1,'highpass');break;
   case 'shotgun':hiss(.35,.9,1400);tone('sine',110,40,.25,.7);hiss(.08,.4,5000,1,'highpass',.25);break;
   case 'rocket':hiss(.5,.35,900,2,'bandpass');tone('sawtooth',220,90,.35,.12);break;
   case 'boom':hiss(.9,1,500);tone('sine',90,28,.7,.9);hiss(.3,.4,2500,1,'bandpass');break;
   case 'jump':tone('sine',260,380,.12,.08);break;
   case 'land':hiss(.12,.25,300);break;
   case 'pad':tone('sine',180,900,.45,.25);tone('triangle',360,1500,.4,.12);break;
   case 'pickup':tone('triangle',660,990,.1,.2);tone('triangle',990,1320,.12,.15,.08);break;
   case 'mega':for(const [i,f] of [523,659,784,1046].entries())tone('triangle',f,f,.18,.18,i*.07);break;
   case 'weapon':hiss(.06,.3,2500,4,'bandpass');tone('square',300,200,.06,.08,.05);break;
   case 'hit':tone('square',1800,1700,.05,.14);break;
   case 'hurt':tone('sawtooth',160,70,.18,.25);hiss(.12,.2,800);break;
   case 'death':tone('sawtooth',300,40,.8,.3);hiss(.6,.3,600);break;
   case 'lava':hiss(1,.6,700);tone('sine',120,30,1,.4);break;
   case 'frag':tone('triangle',880,880,.08,.25);tone('triangle',1320,1320,.16,.25,.08);break;
   case 'spawn':tone('sine',300,900,.35,.15);hiss(.3,.15,3000,2,'bandpass');break;
   case 'empty':tone('square',220,200,.05,.1);break;
   case 'join':tone('triangle',520,780,.15,.12);break;
   case 'sudden':for(let i=0;i<3;i++)tone('square',440,440,.12,.18,i*.22);break;
   case 'win':for(const [i,f] of [523,659,784,1046,1318].entries())tone('triangle',f,f,.3,.22,i*.12);break;
   case 'lose':for(const [i,f] of [392,349,311,262].entries())tone('triangle',f,f*.98,.3,.2,i*.15);break;
  }
 }
 dispose(){void this.ctx?.close().catch(()=>{});this.ctx=null;}
}
