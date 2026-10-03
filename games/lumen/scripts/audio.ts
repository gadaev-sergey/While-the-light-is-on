import type {Sound} from './world.ts';

/** Small original generative score. All resources live inside the game session. */
export class Audio {
 context?:AudioContext;master?:GainNode;muted=false;playing=false;next=0;beat=0;theme=0;
 async unlock(){try{if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=this.muted?0:.45;this.master.connect(this.context.destination);}if(this.context.state==='suspended')await this.context.resume();}catch{/* Sound is optional when a browser denies audio. */}}
 toggle(){this.muted=!this.muted;if(this.master&&this.context)this.master.gain.setTargetAtTime(this.muted?0:.45,this.context.currentTime,.06);return this.muted;}
 tone(freq:number,duration:number,volume:number,type:OscillatorType='sine',delay=0,end?:number){
  const c=this.context;if(!c||!this.master||c.state!=='running')return;const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.014);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.03);o.onended=()=>{o.disconnect();g.disconnect();};
 }
 play(s:Sound){
  if(s==='spark'){this.tone(880,.28,.1);this.tone(1320,.32,.05,'sine',.045);}
  if(s==='lens'){[392,523.25,659.25,1046.5].forEach((n,i)=>this.tone(n,.85,.1,'sine',i*.1));}
  if(s==='jump')this.tone(210,.17,.07,'sine',0,450);
  if(s==='double')this.tone(370,.23,.09,'sine',0,790);
  if(s==='dash'){this.tone(180,.22,.07,'triangle',0,55);this.tone(740,.16,.04,'sine',0,190);}
  if(s==='hurt'){this.tone(140,.35,.16,'triangle',0,38);}
  if(s==='enemy'){this.tone(260,.3,.13,'triangle',0,45);this.tone(990,.3,.07);}
  if(s==='checkpoint')[330,440,660].forEach((n,i)=>this.tone(n,.6,.07,'sine',i*.08));
  if(s==='beacon')[130.81,261.63,329.63,392,523.25,783.99,1046.5].forEach((n,i)=>this.tone(n,2.8,.13,'sine',i*.13));
  if(s==='land')this.tone(75,.08,.035,'triangle');
 }
 update(active:boolean,theme:number){this.theme=theme;const c=this.context;if(!c)return;if(!active){this.next=c.currentTime+.2;return;}if(c.currentTime<this.next)return;this.next=c.currentTime+.44;const notes=[261.63,329.63,392,523.25,392,329.63,293.66,392,220,329.63,440,523.25,440,329.63,293.66,196];const i=this.beat++%notes.length;this.tone(notes[i]*(theme===1?1.122:theme===2?1.26:1),1.6,.025);if(i%4===0)this.tone(notes[Math.floor(i/4)*4]/4,2.5,.06,'sine');}
 dispose(){void this.context?.close();this.context=undefined;}
}
