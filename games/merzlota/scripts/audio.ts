import type {Sound} from './world.ts';

/** Процедурный звук «Мерзлоты»: выстрелы, враги, двери и вой вьюги за стенами станции. */
export class AudioEngine {
 context?:AudioContext;master?:GainNode;muted=false;
 private noise?:AudioBuffer;private wind?:{gain:GainNode;filter:BiquadFilterNode};private next=0;private step=0;
 async unlock(){
  try{
   if(!this.context){
    const c=this.context=new AudioContext();this.master=c.createGain();this.master.gain.value=this.muted?0:.55;this.master.connect(c.destination);
    const b=this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=b;src.loop=true;filter.type='bandpass';filter.frequency.value=500;filter.Q.value=.7;gain.gain.value=0;
    src.connect(filter);filter.connect(gain);gain.connect(this.master);src.start();this.wind={gain,filter};
   }
   if(this.context.state==='suspended')await this.context.resume();
  }catch{/* Звук необязателен. */}
 }
 setMuted(v:boolean){this.muted=v;if(this.master&&this.context)this.master.gain.setTargetAtTime(v?0:.55,this.context.currentTime,.05);}
 private tone(f:number,dur:number,vol:number,type:OscillatorType='square',delay=0,end?:number){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(f,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+dur);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.05);
 }
 private hiss(dur:number,vol:number,from:number,to:number,delay=0,type:BiquadFilterType='bandpass'){
  const c=this.context;if(!c||!this.master||!this.noise||c.state!=='running')return;const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),t=c.currentTime+delay;s.buffer=this.noise;f.type=type;f.Q.value=.9;
  f.frequency.setValueAtTime(from,t);f.frequency.exponentialRampToValueAtTime(to,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(g);g.connect(this.master);s.start(t,Math.random());s.stop(t+dur+.05);
 }
 play(s:Sound){
  if(s==='pistol'){this.hiss(.18,.9,3000,400);this.tone(180,.12,.3,'square',0,60);}
  if(s==='shotgun'){this.hiss(.45,1.2,1800,120,0,'lowpass');this.tone(90,.35,.5,'sawtooth',0,35);this.hiss(.12,.3,500,300,.32);}
  if(s==='rifle'){this.tone(1400,.09,.18,'sawtooth',0,300);this.hiss(.08,.35,6000,2000);}
  if(s==='empty')this.tone(900,.04,.15,'square');
  if(s==='alert'){this.tone(140,.45,.22,'sawtooth',0,420);this.hiss(.3,.25,800,2500);}
  if(s==='pain')this.tone(320,.18,.2,'sawtooth',0,160);
  if(s==='death'){this.tone(260,.6,.25,'sawtooth',0,50);this.hiss(.5,.4,3000,300);}
  if(s==='bolt')this.tone(700,.25,.12,'triangle',0,180);
  if(s==='claw'){this.hiss(.15,.6,4000,1200);this.tone(200,.12,.2,'square',0,90);}
  if(s==='hurt'){this.tone(110,.25,.45,'sine',0,55);this.hiss(.15,.35,700,200);}
  if(s==='pickup'){this.tone(880,.08,.15,'triangle');this.tone(1320,.12,.12,'triangle',.06);}
  if(s==='key')[660,880,1100,1320].forEach((f,i)=>this.tone(f,.18,.15,'triangle',i*.07));
  if(s==='weapon'){this.tone(220,.12,.25,'square');this.tone(440,.25,.2,'square',.1);this.hiss(.2,.3,900,500,.05);}
  if(s==='door'){this.hiss(.9,.35,300,900,0,'lowpass');this.tone(70,.8,.12,'sawtooth');}
  if(s==='locked'){this.tone(220,.12,.2,'square');this.tone(180,.18,.2,'square',.13);}
  if(s==='exit')[392,523,659,784,1046].forEach((f,i)=>this.tone(f,.4,.16,'triangle',i*.1));
  if(s==='die'){this.tone(200,1.4,.35,'sawtooth',0,30);this.hiss(1.2,.5,1200,80,0,'lowpass');}
  if(s==='boss'){this.tone(55,1.6,.5,'sawtooth',0,40);this.tone(82,1.6,.35,'square',0,60);this.hiss(1.4,.5,400,1600);}
  if(s==='summon'){this.tone(300,.6,.2,'triangle',0,900);this.hiss(.6,.3,1500,5000);}
 }
 /** Вьюга и редкие низкие ноты; тревога усиливает пульс. */
 update(active:boolean,danger:number){
  const c=this.context,w=this.wind;if(!c||!w||c.state!=='running')return;const t=c.currentTime;
  w.gain.gain.setTargetAtTime(active?.06+Math.sin(t*.3)*.02:0,t,.5);w.filter.frequency.setTargetAtTime(400+Math.sin(t*.17)*220,t,.4);
  if(!active){this.next=t;return;}
  const beat=60/(danger>0?118:76);if(this.next<t)this.next=t+.05;
  while(this.next<t+.3){const d=this.next-t,s=this.step++;
   if(s%2===0)this.tone(danger>0?55:49,beat*1.6,danger>0?.16:.09,'sawtooth',d);
   if(danger>0&&s%4===2)this.hiss(.06,.18,7000,5000,d);
   if(s%8===7)this.tone([196,233,175,147][Math.floor(s/8)%4],beat*3,.035,'triangle',d);
   this.next+=beat;}
 }
 dispose(){try{void this.context?.close();}catch{}this.context=undefined;}
}
