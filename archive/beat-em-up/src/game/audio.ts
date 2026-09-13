import type { SoundName } from './types.ts';
export class GameAudio {
  ctx?: AudioContext; master?: GainNode; volume = .35;
  async init() {
    if (!this.ctx) { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination); }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  setVolume(v: number) { this.volume = v; if(this.master && this.ctx) this.master.gain.setTargetAtTime(v,this.ctx.currentTime,.1); }
  play(name: SoundName) {
    const ctx = this.ctx; if (!ctx || !this.master || ctx.state !== 'running') return;
    const tones: Record<SoundName, number[]> = {swing:[280,75,.12],heavy:[100,32,.24],launch:[180,670,.2],block:[600,210,.09],parry:[840,1250,.17],hit:[150,42,.15],dash:[700,100,.22],pulse:[100,670,.5],jump:[170,380,.16],land:[90,38,.13],hurt:[100,35,.22],kill:[220,60,.32],pickup:[700,1300,.12],win:[330,660,1],start:[180,540,.8]};
    const [start,end,duration] = tones[name]; const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = ['pickup','win','start'].includes(name) ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(start,ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(end,ctx.currentTime+duration);
    gain.gain.setValueAtTime(name==='pulse' ? .22 : .12,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
    osc.connect(gain); gain.connect(this.master); osc.start(); osc.stop(ctx.currentTime+duration+.05);
    if (['hit','swing','heavy','block','dash','hurt','kill'].includes(name)) this.noise(duration,name==='hit'?.22:.07);
  }
  noise(duration: number, volume: number) {
    const ctx = this.ctx!; const buffer = ctx.createBuffer(1,ctx.sampleRate*duration,ctx.sampleRate), data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
    const src=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    src.buffer=buffer; filter.type='lowpass';filter.frequency.value=1600;gain.gain.value=volume;
    src.connect(filter);filter.connect(gain);gain.connect(this.master!);src.start();
  }
}
