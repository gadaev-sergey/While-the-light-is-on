import {grain} from './architecture.ts';

export interface SkyFrame {x:number;y:number;width:number;height:number}
// Conservative clear-sky contour of district.png. Keeps celestial details off
// its chimneys, roof lines and foreground trees without changing the artwork.
const horizon=[[.08,0],[.90,0],[.90,.19],[.86,.28],[.84,.4],[.78,.44],[.75,.39],[.73,.34],[.71,.45],[.64,.46],[.60,.45],[.55,.43],[.51,.45],[.47,.45],[.43,.42],[.39,.43],[.35,.44],[.30,.43],[.28,.39],[.25,.43],[.22,.4],[.20,.37],[.19,.32],[.17,.29],[.155,.33],[.15,.29],[.12,.26],[.10,.17]];

export class NightSky{
 private moon?:HTMLCanvasElement;
 private stars=Array.from({length:165},(_,i)=>({x:.09+grain(i+17)*.80,y:.008+grain(i+370)*.435,r:.35+grain(i+980)**5*1.1,alpha:.35+grain(i+1200)*.6}));
 path(c:CanvasRenderingContext2D,f:SkyFrame){c.beginPath();horizon.forEach(([x,y],i)=>i?c.lineTo(f.x+x*f.width,f.y+y*f.height):c.moveTo(f.x+x*f.width,f.y+y*f.height));c.closePath();}
 moonPosition(f:SkyFrame){return {x:f.x+f.width*.63,y:f.y+f.height*.17,r:f.width*.0095};}
 draw(c:CanvasRenderingContext2D,f:SkyFrame,night:number,time:number){
  if(night<=0)return;c.save();this.path(c,f);c.clip();
  for(let i=0;i<this.stars.length;i++){const star=this.stars[i],x=f.x+star.x*f.width,y=f.y+star.y*f.height,r=star.r*Math.min(1.8,f.width/1881);
   c.globalAlpha=night*star.alpha*(.88+.12*Math.sin(time*.45+i*2.3));c.fillStyle='#d0e2fb';c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
   if(star.r>1){c.globalAlpha*=.13;c.fillRect(x-r*3,y-.4,r*6,.8);c.fillRect(x-.4,y-r*3,.8,r*6);}
  }
  const moon=this.moonPosition(f);c.globalAlpha=night;c.drawImage(this.moonTexture(),moon.x-moon.r*2,moon.y-moon.r*2,moon.r*4,moon.r*4);c.restore();
 }
 private moonTexture(){
  if(this.moon)return this.moon;const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d')!;
  const halo=c.createRadialGradient(128,128,30,128,128,124);halo.addColorStop(0,'#a3c8ff2a');halo.addColorStop(.42,'#a3c8ff12');halo.addColorStop(1,'#a3c8ff00');c.fillStyle=halo;c.fillRect(0,0,256,256);
  c.save();c.beginPath();c.arc(128,128,64,0,Math.PI*2);c.clip();const disk=c.createRadialGradient(108,106,3,132,130,76);disk.addColorStop(0,'#eff3eb');disk.addColorStop(.65,'#b8cbd9');disk.addColorStop(1,'#647f9e');c.fillStyle=disk;c.fillRect(64,64,128,128);
  for(let i=0;i<70;i++){const x=75+grain(i+25)*107,y=73+grain(i+235)*111,r=1+grain(i+601)**2*9;c.fillStyle=i%3?'#465e7c25':'#ecf5ed38';c.beginPath();c.ellipse(x,y,r,r*.8,.4,0,Math.PI*2);c.fill();}
  const terminator=c.createLinearGradient(125,0,200,0);terminator.addColorStop(0,'#172b4300');terminator.addColorStop(.56,'#172b4340');terminator.addColorStop(.8,'#172b43d5');terminator.addColorStop(1,'#172b43e8');c.fillStyle=terminator;c.fillRect(64,64,128,128);c.restore();this.moon=canvas;return canvas;
 }
}
