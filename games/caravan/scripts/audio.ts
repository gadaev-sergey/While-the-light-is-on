export class Sound {
 context:AudioContext|null=null;muted=false;
 async unlock(){if(!this.context)try{this.context=new AudioContext();}catch{return;}if(this.context?.state==='suspended')await this.context.resume().catch(()=>{});}
 play(kind:string){if(this.muted||!this.context||this.context.state!=='running')return;const c=this.context;
 const notes:Record<string,number[]>={build:[330,494,660],coin:[880],wave:[196,247,294],clear:[392,494,587],won:[294,392,494,587,784],lost:[294,247,196],pulse:[110,220,440,880],leak:[146,123],click:[440]};
 (notes[kind]||notes.click).forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+i*.085;o.type=kind==='leak'?'triangle':'sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.055,t+.012);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+.32);});}
 dispose(){void this.context?.close().catch(()=>{});}
}
