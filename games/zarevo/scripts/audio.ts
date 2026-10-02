import type {Sound} from './world.ts';

/** Процедурный звук: мотор, эффекты и короткая синтвейв-петля. Всё создаётся внутри сеанса. */
export class AudioEngine {
 context?:AudioContext;master?:GainNode;music?:GainNode;muted=false;
 private engine?:{a:OscillatorNode;b:OscillatorNode;filter:BiquadFilterNode;gain:GainNode};private noise?:AudioBuffer;private next=0;private step=0;
 async unlock(){
  try{
   if(!this.context){
    const c=this.context=new AudioContext();this.master=c.createGain();this.master.gain.value=this.muted?0:.5;this.master.connect(c.destination);
    this.music=c.createGain();this.music.gain.value=.22;this.music.connect(this.master);
    const buffer=this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const a=c.createOscillator(),b=c.createOscillator(),filter=c.createBiquadFilter(),gain=c.createGain();a.type='sawtooth';b.type='square';filter.type='lowpass';filter.frequency.value=600;filter.Q.value=4;gain.gain.value=0;
    a.connect(filter);b.connect(filter);filter.connect(gain);gain.connect(this.master);a.start();b.start();this.engine={a,b,filter,gain};
   }
   if(this.context.state==='suspended')await this.context.resume();
  }catch{/* Звук необязателен, если браузер запретил аудио. */}
 }
 setMuted(value:boolean){this.muted=value;if(this.master&&this.context)this.master.gain.setTargetAtTime(value?0:.5,this.context.currentTime,.05);}
 private tone(freq:number,duration:number,volume:number,type:OscillatorType='square',delay=0,end?:number,target?:AudioNode){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+duration);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(target||this.master);o.start(t);o.stop(t+duration+.05);
 }
 private hiss(duration:number,volume:number,from:number,to:number,delay=0,target?:AudioNode){
  const c=this.context;if(!c||!this.master||!this.noise||c.state!=='running')return;const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),t=c.currentTime+delay;s.buffer=this.noise;f.type='bandpass';f.Q.value=1.2;
  f.frequency.setValueAtTime(from,t);f.frequency.exponentialRampToValueAtTime(to,t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f);f.connect(g);g.connect(target||this.master);s.start(t,Math.random()*.5);s.stop(t+duration+.05);
 }
 play(sound:Sound){
  if(sound==='count')this.tone(440,.18,.25);
  if(sound==='go'){this.tone(880,.5,.28);this.tone(1320,.5,.12,'triangle');}
  if(sound==='checkpoint')[523,659,784,1046].forEach((f,i)=>this.tone(f,.22,.18,'square',i*.07));
  if(sound==='bump'){this.hiss(.25,.6,900,200);this.tone(90,.25,.35,'sine',0,40);}
  if(sound==='crash'){this.hiss(.7,.9,2400,120);this.tone(70,.6,.5,'sawtooth',0,30);}
  if(sound==='nitro'){this.hiss(.9,.5,300,3200);this.tone(220,.8,.08,'sawtooth',0,660);}
  if(sound==='miss')this.hiss(.3,.45,3000,700);
  if(sound==='overtake')this.tone(1200,.08,.08,'triangle');
  if(sound==='warning')this.tone(1560,.09,.16,'square');
  if(sound==='finish')[523,659,784,1046,784,1046,1318].forEach((f,i)=>this.tone(f,.32,.18,i%2?'triangle':'square',i*.11));
  if(sound==='timeout')[392,330,262,196].forEach((f,i)=>this.tone(f,.42,.2,'sawtooth',i*.18));
 }
 /** Обновляет мотор по скорости и планирует такты музыки. */
 update(percent:number,racing:boolean,boosting:boolean,music:boolean){
  const c=this.context,e=this.engine;if(!c||!e||c.state!=='running')return;const t=c.currentTime;
  const gear=Math.min(5,Math.floor(percent*5.2)),rpm=percent<=0?0:.3+(percent*5.2-gear)*.7;
  const f=48+rpm*110+gear*14+(boosting?30:0);
  e.a.frequency.setTargetAtTime(f,t,.05);e.b.frequency.setTargetAtTime(f*.5,t,.05);e.filter.frequency.setTargetAtTime(400+percent*1600,t,.08);
  e.gain.gain.setTargetAtTime(racing?.05+percent*.07:0,t,.1);
  if(!music){this.next=Math.max(this.next,t);return;}
  // Синтвейв-петля 112 BPM: бас, бочка, хэт и арпеджио на аккордах Am–F–C–G.
  const beat=60/112/2;if(this.next<t)this.next=t+.05;
  const roots=[220,174.6,261.6,196],chords=[[0,3,7],[0,4,7],[0,4,7],[0,4,7]];
  while(this.next<t+.25){
   const s=this.step++,bar=Math.floor(s/16)%4,root=roots[bar],d=this.next-t;
   if(s%2===0)this.tone(root/2,beat*.9,.35,'sawtooth',d,undefined,this.music);
   if(s%4===0)this.tone(150,.18,.7,'sine',d,45,this.music);
   if(s%4===2)this.hiss(.05,.25,8000,6000,d,this.music);
   if(s%8===4)this.hiss(.18,.4,1800,900,d,this.music);
   const n=chords[bar][s%3]+(s%6>2?12:0);this.tone(root*2*Math.pow(2,n/12),beat*.8,.09,'triangle',d,undefined,this.music);
   this.next+=beat;
  }
 }
 dispose(){try{this.engine?.a.stop();this.engine?.b.stop();void this.context?.close();}catch{}this.context=undefined;this.engine=undefined;}
}
