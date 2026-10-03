import type {SoundName} from './client.ts';
import type {Vec3} from './arena.ts';

const LOUD=new Set<SoundName>(['blaster','shotgun','auto','rifle','rocket','boom']);

/** Процедурные звуки на Web Audio: шум и осцилляторы, без внешних файлов. */
export class AudioEngine{
 private ctx:AudioContext|null=null;private master:GainNode|null=null;private noise:AudioBuffer|null=null;private reverb:ConvolverNode|null=null;
 volume=.7;muted=false;
 async unlock(){
  if(!this.ctx){
   try{this.ctx=new AudioContext();}catch{return;}
   this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);this.applyVolume();
   const b=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noise=b;
   // Эхо арены: затухающий шум как импульсная характеристика большого бетонного зала.
   const rate=this.ctx.sampleRate,ir=this.ctx.createBuffer(2,rate*2.2,rate);
   for(let c=0;c<2;c++){const ch=ir.getChannelData(c);for(let i=0;i<ch.length;i++)ch[i]=(Math.random()*2-1)*Math.pow(1-i/ch.length,3.2)*(i<rate*.012?i/(rate*.012):1);}
   this.reverb=this.ctx.createConvolver();this.reverb.buffer=ir;this.reverb.connect(this.master);
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
  // Хвост эха зависит от яруса слушателя: в нижнем зале гулко, на открытой вершине — коротко. Выстрелам и взрывам — больше эха.
  if(this.reverb){const y=listener?.pos.y??0,room=y<3?.32:y<8?.2:.09,wet=ctx.createGain();wet.gain.value=room*(LOUD.has(name)?1:.35);out.connect(wet).connect(this.reverb);}
  const t=ctx.currentTime;
  const tone=(type:OscillatorType,f0:number,f1:number,dur:number,vol:number,delay=0)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f0,t+delay);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+delay+dur);g.gain.setValueAtTime(vol,t+delay);g.gain.exponentialRampToValueAtTime(.001,t+delay+dur);o.connect(g).connect(out);o.start(t+delay);o.stop(t+delay+dur+.02);};
  const hiss=(dur:number,vol:number,freq:number,q=1,type:BiquadFilterType='lowpass',delay=0)=>{const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();s.buffer=this.noise;f.type=type;f.frequency.value=freq;f.Q.value=q;g.gain.setValueAtTime(vol,t+delay);g.gain.exponentialRampToValueAtTime(.001,t+delay+dur);s.connect(f).connect(g).connect(out);s.start(t+delay,Math.random()*.5);s.stop(t+delay+dur+.02);};
  switch(name){
   case 'blaster':tone('square',1300,380,.07,.12);hiss(.05,.12,4000,1,'highpass');tone('sine',190,70,.06,.18);break;
   case 'shotgun':hiss(.03,.9,6000,1,'highpass');hiss(.35,.9,1400);tone('sine',110,40,.25,.8);
    hiss(.07,.3,2800,4,'bandpass',.45);tone('square',420,300,.03,.07,.47);hiss(.06,.3,2400,4,'bandpass',.62);tone('square',300,380,.03,.07,.64);break;
   case 'auto':hiss(.025,.8,5000,1,'highpass');hiss(.12,.65,1800);tone('sine',150,50,.1,.55);tone('square',95,60,.04,.1);break;
   case 'rifle':hiss(.03,1.1,7000,1,'highpass');hiss(.45,1,1100);tone('sine',85,28,.45,1);hiss(.9,.22,600,1,'lowpass',.06);break;
   case 'rocket':hiss(.03,.5,4000,1,'highpass');hiss(.5,.35,900,2,'bandpass');tone('sawtooth',220,90,.35,.12);tone('sine',70,40,.2,.4);break;
   case 'boom':hiss(.05,.8,3000,1,'highpass');hiss(.9,1,500);tone('sine',90,28,.7,1);hiss(.3,.4,2500,1,'bandpass');hiss(1.4,.25,250,1,'lowpass',.1);break;
   case 'reload':tone('square',900,700,.02,.1);hiss(.05,.25,2500,3,'bandpass',.3);tone('square',500,420,.03,.12,.35);
    hiss(.05,.3,2200,3,'bandpass',1.2);tone('square',650,520,.03,.14,1.25);tone('square',1000,820,.03,.16,1.7);break;
   case 'bolt':hiss(.06,.25,3000,3,'bandpass',.35);tone('square',520,360,.04,.1,.36);hiss(.05,.22,2600,3,'bandpass',.62);tone('square',700,900,.04,.1,.64);break;
   case 'overheat':hiss(.9,.35,4200,2,'bandpass');tone('sawtooth',900,280,.45,.08);break;
   case 'headshot':tone('triangle',2400,2400,.09,.22);tone('sine',1200,1150,.18,.2,.03);break;
   case 'jump':tone('sine',260,380,.12,.08);break;
   case 'land':hiss(.12,.25,300);break;
   case 'slide':hiss(.7,.32,1100,.8,'bandpass');hiss(.5,.18,260);tone('sine',90,55,.4,.08);break;
   case 'crouch':hiss(.09,.1,1800,1.5,'bandpass');break;
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
