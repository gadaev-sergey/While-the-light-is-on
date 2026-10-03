export class Sound {
 context:AudioContext|null=null;muted=false;timer:ReturnType<typeof setInterval>|null=null;step=0;
 unlock(){if(!this.context)this.context=new AudioContext();void this.context.resume();if(!this.timer)this.timer=setInterval(()=>{if(!this.muted&&this.context?.state==='running'){const melody=[261.63,329.63,392,493.88,440,392,329.63,293.66];this.tone(melody[this.step++%8]/2,1.8,.018,'sine');}},2100);}
 tone(frequency:number,duration=.15,volume=.04,type:OscillatorType='sine'){if(this.muted||!this.context||this.context.state!=='running')return;const c=this.context,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.value=frequency;g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(volume,c.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+duration);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+duration+.05);o.onended=()=>{o.disconnect();g.disconnect();};}
 build(){this.tone(440,.12,.04);this.tone(660,.22,.02);}
 season(){this.tone(261.63,.8,.03);this.tone(329.63,1,.02);this.tone(392,1.2,.02);}
 suspend(){void this.context?.suspend();}
 dispose(){if(this.timer)clearInterval(this.timer);void this.context?.close();}
}
