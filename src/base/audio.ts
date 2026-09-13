export class BaseAudio{
 context?:AudioContext;
 play(name:string){
  try{const c=this.context??=new AudioContext();if(c.state==='suspended')void c.resume();const oscillator=c.createOscillator(),gain=c.createGain();oscillator.connect(gain);gain.connect(c.destination);const frequencies:Record<string,number>={click:550,door:115,search:220,done:670,hit:65,swing:160};const f=frequencies[name]||180,duration=name==='done'?.22:.09;oscillator.type=name==='door'||name==='hit'?'triangle':'sine';oscillator.frequency.setValueAtTime(f,c.currentTime);oscillator.frequency.exponentialRampToValueAtTime(name==='done'?f*1.4:f*.6,c.currentTime+duration);gain.gain.setValueAtTime(.035,c.currentTime);gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);oscillator.start();oscillator.stop(c.currentTime+duration);}catch{/* Audio is optional. */}
 }
}
