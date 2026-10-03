import type {Sound} from './world.ts';
export class AudioEngine{
 context:AudioContext|null=null;master:GainNode|null=null;music:GainNode|null=null;muted=false;nextBeat=0;beat=0;lastHit=0;noise:AudioBuffer|null=null;
 async unlock(){try{if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.42;this.master.connect(this.context.destination);this.music=this.context.createGain();this.music.gain.value=.27;this.music.connect(this.master);this.noise=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);const d=this.noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}if(this.context.state==='suspended')await this.context.resume();}catch{/* Audio is optional; gameplay remains available. */}}
 setMuted(value:boolean){this.muted=value;if(this.master&&this.context)this.master.gain.setTargetAtTime(value?0:.42,this.context.currentTime,.05);}
 tone(frequency:number,end:number,duration:number,gain:number,type:OscillatorType='sine',delay=0,music=false){const c=this.context;if(!c||!this.master)return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(Math.max(.002,gain),t+.006);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(music&&this.music?this.music:this.master);o.start(t);o.stop(t+duration+.02);}
 hiss(duration:number,volume:number,freq=1400){const c=this.context;if(!c||!this.master||!this.noise)return;const source=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();source.buffer=this.noise;filter.type='lowpass';filter.frequency.value=freq;source.connect(filter);filter.connect(g);g.connect(this.master);g.gain.setValueAtTime(volume,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);source.start();source.stop(c.currentTime+duration);}
 play(s:Sound){if(!this.context||this.muted)return;switch(s){
 case 'rifle':this.tone(150,42,.09,.19,'triangle');this.hiss(.055,.14,3300);break;
 case 'shotgun':this.tone(100,28,.21,.34,'sawtooth');this.hiss(.17,.28,1900);break;
 case 'rail':this.tone(900,80,.19,.18,'sawtooth');this.tone(110,36,.27,.3);break;
 case 'hit':if(this.context.currentTime-this.lastHit<.065)break;this.lastHit=this.context.currentTime;this.tone(540,160,.045,.045,'square');break;
 case 'kill':this.hiss(.12,.11,1600);this.tone(80,27,.12,.13);break;
 case 'hurt':this.tone(110,38,.21,.28,'sawtooth');this.hiss(.14,.14,1000);break;
 case 'dash':this.hiss(.15,.12,2100);this.tone(180,700,.15,.045);break;
 case 'emp':this.tone(85,28,.55,.4);this.tone(420,80,.35,.1,'sawtooth');this.hiss(.3,.15,1200);break;
 case 'reload':this.tone(440,220,.04,.07,'square');this.tone(640,320,.05,.06,'square',.13);break;
 case 'pickup':[0,4,7].forEach((n,i)=>this.tone(440*2**(n/12),440*2**(n/12),.18,.06,'sine',i*.055));break;
 case 'wave':this.tone(140,140,.18,.1,'triangle');this.tone(210,210,.25,.12,'triangle',.2);break;
 case 'clear':[0,3,7,12].forEach((n,i)=>this.tone(220*2**(n/12),220*2**(n/12),.5,.08,'triangle',i*.13));break;
 case 'enemy':this.tone(230,60,.09,.045,'triangle');break;
 case 'boss':this.tone(80,20,1.1,.3,'sawtooth');this.hiss(.85,.28,850);break;
 }}
 update(active:boolean,theme:number){const c=this.context;if(!c||this.muted||!active){this.nextBeat=0;return;}if(!this.nextBeat)this.nextBeat=c.currentTime+.1;if(c.currentTime<this.nextBeat)return;const step=this.beat++%32,notes=[55,55,65.406,49],root=notes[Math.floor(step/8)]*(theme===2?1.122:1);if(step%2===0)this.tone(root,root,.28,.19,'triangle',0,true);if(step%4===0)this.tone(120,35,.14,.2,'sine',0,true);if(step%4===2)this.tone(320,130,.04,.035,'triangle',0,true);if(step%4===1)this.tone(root*8,root*8,.52,.035,'sine',0,true);this.nextBeat=c.currentTime+.215;}
 dispose(){void this.context?.close();this.context=null;}
}
