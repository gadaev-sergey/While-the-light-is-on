export class Sound {
 muted=false;private context:AudioContext|null=null;
 unlock(){if(this.muted)return;try{this.context??=new AudioContext();if(this.context.state==='suspended')void this.context.resume().catch(()=>{});}catch{}}
 tone(frequency:number,delay=0,duration=.22){if(this.muted||!this.context||this.context.state!=='running')return;const c=this.context,o=c.createOscillator(),g=c.createGain(),t=c.currentTime+delay;o.type='sine';o.frequency.setValueAtTime(frequency,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.085,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};}
 turn(){this.unlock();this.tone(520,0,.12);this.tone(1040,.015,.07);}
 light(){this.tone(659,0,.35);this.tone(988,.06,.45);}
 win(){[523,659,784,1046].forEach((f,i)=>this.tone(f,i*.12,.6));}
 suspend(){if(this.context?.state==='running')void this.context.suspend().catch(()=>{});}
 dispose(){if(this.context)void this.context.close().catch(()=>{});this.context=null;}
}
