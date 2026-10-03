import {World,clamp,type Thing,type Hero} from './world.ts';

const palettes=[
 {sky:'#0c1d2a',horizon:'#284e57',far:'#1a3843',mid:'#1b4049',stone:'#24454c',edge:'#5c827c',light:'#c0e3ca',plant:'#37645e',water:'#123c46'},
 {sky:'#101f2d',horizon:'#305957',far:'#203e47',mid:'#224c4b',stone:'#294c4b',edge:'#80a095',light:'#c9e6b2',plant:'#518575',water:'#173f43'},
 {sky:'#1a1d35',horizon:'#4b4661',far:'#33344c',mid:'#3e3b58',stone:'#41445c',edge:'#9692ab',light:'#ffe0b0',plant:'#6e718c',water:'#282b46'},
];
const hash=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const TAU=Math.PI*2;
export class Renderer {
 ctx:CanvasRenderingContext2D;width=1;height=1;scale=1;viewW=1400;viewH=900;cameraX=0;cameraY=0;clock=0;reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 private glows=new Map<string,HTMLCanvasElement>();private grain:CanvasPattern|null=null;
 constructor(public canvas:HTMLCanvasElement,public world:World){
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Браузер не поддерживает Canvas 2D.');this.ctx=ctx;
  const noise=document.createElement('canvas');noise.width=noise.height=128;const nc=noise.getContext('2d')!,im=nc.createImageData(128,128);for(let i=0;i<im.data.length;i+=4){const v=Math.random()*255;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=10;}nc.putImageData(im,0,0);this.grain=ctx.createPattern(noise,'repeat');this.resize();this.snap();
 }
 resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.scale=Math.min(this.height/840,this.width/1000);this.viewW=this.width/this.scale;this.viewH=this.height/this.scale;}
 snap(){this.cameraX=clamp(this.world.hero.x-this.viewW*.36,0,Math.max(0,this.world.level.width-this.viewW));this.cameraY=this.world.hero.y-this.viewH*.69;}
 private glow(x:number,y:number,r:number,color='#c3f5d6',alpha=1){const c=this.ctx;let sprite=this.glows.get(color);if(!sprite){sprite=document.createElement('canvas');sprite.width=sprite.height=128;const cx=sprite.getContext('2d')!,g=cx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,color+'66');g.addColorStop(.24,color+'24');g.addColorStop(1,color+'00');cx.fillStyle=g;cx.fillRect(0,0,128,128);this.glows.set(color,sprite);}c.save();c.globalAlpha*=alpha;c.drawImage(sprite,x-r,y-r,r*2,r*2);c.restore();}
 private poly(points:number[],fill:string,stroke?:string){const c=this.ctx;c.beginPath();points.forEach((v,i)=>{if(i%2===0){if(i===0)c.moveTo(v,points[i+1]);else c.lineTo(v,points[i+1]);}});c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.stroke();}}
 private line(x:number,y:number,x2:number,y2:number,color:string,width=1){const c=this.ctx;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
 private oval(x:number,y:number,rx:number,ry:number,color:string){const c=this.ctx;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();}
 private circle(x:number,y:number,r:number,color:string){this.oval(x,y,r,r,color);}
 private diamond(x:number,y:number,r:number,color:string){this.poly([x,y-r,x+r*.65,y,x,y+r,x-r*.65,y],color);}
 draw(dt:number){
  this.clock+=this.reduced?dt*.25:dt;const w=this.world,c=this.ctx;const ratio=this.canvas.width/this.width;c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle=palettes[w.level.theme].sky;c.fillRect(0,0,this.width,this.height);c.scale(this.scale,this.scale);
  const title=w.phase==='title';if(!title){const target=clamp(w.hero.x-this.viewW*.38+w.hero.face*55,0,Math.max(0,w.level.width-this.viewW));this.cameraX+=(target-this.cameraX)*(1-Math.exp(-dt*4.8));const targetY=clamp(w.hero.y-this.viewH*.65,410-this.viewH*.69,610-this.viewH*.69);this.cameraY+=(targetY-this.cameraY)*(1-Math.exp(-dt*3));}
  this.background(title);
  if(title)this.titleScene();else{
   c.save();const shake=this.reduced?0:w.shake;c.translate(-this.cameraX+(hash(this.clock*200)-.5)*shake,-this.cameraY+(hash(this.clock*200+7)-.5)*shake);
   this.worldDecor();
   for(const t of w.level.things){if(t.x+t.w<this.cameraX-250||t.x>this.cameraX+this.viewW+250)continue;this.thing(t);}
   for(const p of w.particles){c.globalAlpha=Math.max(0,p.life/p.max);this.circle(p.x,p.y,p.size*Math.min(1,p.life*4),p.color);}c.globalAlpha=1;
   this.hero(w.hero);c.restore();this.foreground();
  }
  const vignette=c.createRadialGradient(this.viewW*.5,this.viewH*.46,this.viewH*.2,this.viewW*.5,this.viewH*.46,Math.max(this.viewW*.65,this.viewH*.7));vignette.addColorStop(0,'#04111900');vignette.addColorStop(1,'#030d1899');c.fillStyle=vignette;c.fillRect(0,0,this.viewW,this.viewH);
  if(this.grain){c.fillStyle=this.grain;c.fillRect(0,0,this.viewW,this.viewH);}
  if(w.flash>0){c.fillStyle=`rgba(194,77,110,${w.flash*.5})`;c.fillRect(0,0,this.viewW,this.viewH);}
  if(w.phase==='transition'){const elapsed=3.4-w.transition;this.glow(this.viewW*.65,this.viewH*.5,Math.max(this.viewW,this.viewH)*Math.min(1,elapsed*.6),'#ffeac2',Math.min(1,elapsed*.6));if(w.transition<.7){c.fillStyle=`rgba(12,24,36,${1-w.transition/.7})`;c.fillRect(0,0,this.viewW,this.viewH);}}
  if(w.phase==='won'){c.fillStyle='#eac9980a';c.fillRect(0,0,this.viewW,this.viewH);}
 }
 private background(title:boolean){
  const c=this.ctx,p=palettes[this.world.level.theme],ww=this.viewW,hh=this.viewH,t=this.clock,cx=title?400:this.cameraX,cy=title?0:this.cameraY;
  const sky=c.createLinearGradient(0,0,0,hh);sky.addColorStop(0,p.sky);sky.addColorStop(.66,p.horizon);sky.addColorStop(1,p.water);c.fillStyle=sky;c.fillRect(0,0,ww,hh);
  for(let i=0;i<95;i++){const x=((hash(i+8)*ww*1.3-cx*.025)%(ww+50)+ww+50)%(ww+50),y=hash(i+55)*hh*.59;const twinkle=.3+(.5+.5*Math.sin(t*.7+i*2))*.4;c.globalAlpha=twinkle;this.circle(x,y,hash(i+90)>.94?1.8:.8,'#d1e5df');}c.globalAlpha=1;
  const mx=ww*.74-cx*.025,my=hh*.24-cy*.06;this.glow(mx,my,210,'#c5e4d1',.9);this.circle(mx,my,54,'#c5d8c1');this.circle(mx-11,my-9,51,p.horizon);this.glow(mx+18,my+8,85,'#dbe7c7',.3);
  // Wisps across the moon; slowly travelling, with no external texture assets.
  for(let i=0;i<7;i++){const x=((i*347+t*(3+i*.35)-cx*.06)%(ww+700)+ww+700)%(ww+700)-300,y=hh*(.2+hash(i+51)*.27);const fog=c.createLinearGradient(x,y-16,x,y+26);fog.addColorStop(0,p.horizon+'00');fog.addColorStop(.5,p.horizon+'44');fog.addColorStop(1,p.horizon+'00');c.fillStyle=fog;c.beginPath();c.ellipse(x,y,200+hash(i+18)*140,15,0,0,TAU);c.fill();}
  for(let layer=0;layer<3;layer++){
   const parallax=.12+layer*.12,base=hh*.72-cy*(.12+layer*.1),spacing=layer===0?170:220,col=layer===0?p.far:layer===1?p.mid:p.stone;
   for(let k=Math.floor(cx*parallax/spacing)-2;k<(cx*parallax+ww)/spacing+2;k++){
    const seed=k+layer*100,x=k*spacing-cx*parallax,h=95+hash(seed+1)*200+layer*24,bw=80+hash(seed+2)*105;
    c.globalAlpha=layer===2?.44:.65;this.poly([x,base,x,base-h,x+bw*.12,base-h,x+bw*.12,base-h-18,x+bw*.45,base-h-18,x+bw*.52,base-h-45,x+bw*.58,base-h-18,x+bw*.87,base-h-18,x+bw*.87,base-h,x+bw,base-h,x+bw,base],col);
    if(hash(seed+3)>.68){this.oval(x+bw*.5,base-h-18,bw*.4,35,col);this.line(x+bw*.5,base-h-53,x+bw*.5,base-h-93,col,3);}
    for(let row=0;row<4;row++)for(let j=0;j<3;j++){const on=hash(seed*18+row*3+j)>.67;c.fillStyle=on?'#c8bc795c':'#0d273539';c.fillRect(x+18+j*23,base-h+24+row*37,8,15);}
    if(layer===1){c.strokeStyle=col;c.lineWidth=3;c.beginPath();c.moveTo(x+bw*.7,base-h+30);c.quadraticCurveTo(x+bw+55,base-h+105,x+spacing+20,base-h+20);c.stroke();}
   }
  }c.globalAlpha=1;
  // Distant bridge with repeated arches and its broken reflection.
  const bridgeY=hh*.72-cy*.2;c.fillStyle=p.mid;c.fillRect(0,bridgeY,ww,13);
  for(let i=-2;i<ww/150+2;i++){const x=i*150-(cx*.21%150);c.fillStyle=p.mid;c.fillRect(x,bridgeY,18,hh*.3);c.strokeStyle=p.mid;c.lineWidth=13;c.beginPath();c.arc(x+82,bridgeY+79,65,Math.PI,0);c.stroke();}
  const haze=c.createLinearGradient(0,hh*.62,0,hh);haze.addColorStop(0,p.horizon+'00');haze.addColorStop(.5,p.horizon+'99');haze.addColorStop(1,p.water);c.fillStyle=haze;c.fillRect(0,hh*.62,ww,hh*.38);
  for(let i=0;i<40;i++){const x=hash(i+71)*ww,y=hh*.78+hash(i+22)*hh*.21;c.globalAlpha=.03+hash(i+11)*.06;this.line(x+Math.sin(t*.4+i)*9,y,x+30+hash(i+9)*110,y,'#c3e5d4',1);}c.globalAlpha=1;
 }
 private stone(x:number,y:number,w:number,h:number,floating=false){
  const c=this.ctx,p=palettes[this.world.level.theme];const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,p.stone);g.addColorStop(1,'#101f2c');c.fillStyle=g;c.fillRect(x,y,w,h);
  this.line(x,y+2,x+w,y+2,p.edge,3);c.fillStyle='#95b5a626';c.fillRect(x,y+5,w,5);c.fillStyle='#102832';c.fillRect(x,y+12,w,4);
  if(floating){this.poly([x+8,y+h,x+22,y+h+9,x+w-18,y+h+9,x+w-7,y+h],p.stone);this.line(x+4,y+h-3,x+w-4,y+h-3,'#112d36',2);}
  else {
   const begin=Math.max(0,Math.floor((this.cameraX-x-50)/68))*68;
   for(let row=0;row<Math.min(6,h/43);row++)for(let dx=begin;dx<Math.min(w,this.cameraX+this.viewW+80-x);dx+=68){const ox=row%2?34:0;const px=x+dx+ox;if(px>=x+w)continue;this.line(px,y+21+row*43,px,y+62+row*43,'#91a99e13');this.line(px,y+62+row*43,Math.min(x+w,px+68),y+62+row*43,'#030d191c');}
   for(let i=0;i<w/250;i++){const px=x+i*250+60;if(px<this.cameraX-100||px>this.cameraX+this.viewW+100)continue;const ay=y+90;c.strokeStyle='#0d243080';c.lineWidth=12;c.beginPath();c.moveTo(px,ay+130);c.lineTo(px,ay+38);c.arc(px+35,ay+38,35,Math.PI,0);c.lineTo(px+70,ay+130);c.stroke();}
  }
  // Uneven moss, grass and roots make silhouettes readable.
  for(let i=0;i<w/21;i++){const xx=x+i*21+hash(i+x)*12;if(xx<this.cameraX-80||xx>this.cameraX+this.viewW+80)continue;const seed=i+x;
   if(hash(seed+9)>.33){this.line(xx,y,xx-3,y-4-hash(seed+2)*8,p.plant,2);this.line(xx,y,xx+5,y-3-hash(seed+3)*5,p.plant,1.4);}
   if(hash(seed+15)>.87){c.fillStyle=p.plant;c.fillRect(xx,y+2,6,12+hash(seed+4)*22);this.line(xx+3,y+7,xx+8,y+17,p.plant,2);}
  }
 }
 private vine(x:number,y:number,len:number,seed:number){const c=this.ctx,p=palettes[this.world.level.theme];c.beginPath();c.moveTo(x,y);for(let d=0;d<len;d+=8)c.lineTo(x+Math.sin(d*.06+seed)*7,y+d);c.strokeStyle=p.plant;c.lineWidth=2;c.stroke();for(let d=10;d<len;d+=15){const xx=x+Math.sin(d*.06+seed)*7,side=Math.sin(d)>0?1:-1;this.oval(xx+side*5,y+d,7,3,p.plant);}}
 private tree(x:number,y:number,size:number,seed:number){const c=this.ctx,p=palettes[this.world.level.theme];c.save();c.translate(x,y);c.scale(size,size);const sway=this.reduced?0:Math.sin(this.clock*.4+seed)*2;
  this.poly([-10,0,-4,-86,-15,-132,-35,-164,-29,-171,-7,-150,2,-178,10,-182,6,-123,16,-97,24,-142,40,-161,43,-156,30,-132,24,-84,10,-61,12,0],p.mid);
  for(let i=0;i<18;i++){const angle=hash(i+seed)*TAU,r=hash(i+seed+90)*78;this.oval(Math.cos(angle)*r+sway,-150+Math.sin(angle)*r*.6,25+hash(i)*25,15+hash(i+9)*20,i%3===0?p.plant:p.mid);}
  for(let i=0;i<6;i++)this.vine(-50+i*20+sway,-138+hash(i+seed)*18,35+hash(i+12)*60,i);c.restore();
 }
 private worldDecor(){
  const c=this.ctx,p=palettes[this.world.level.theme];
  for(const t of this.world.level.things.filter(t=>t.kind==='solid')){
   if(t.x+t.w<this.cameraX-200||t.x>this.cameraX+this.viewW+200)continue;
   for(let x=t.x+115;x<t.x+t.w-80;x+=490){if(x<this.cameraX-200||x>this.cameraX+this.viewW+200)continue;
    if(hash(x)>.48)this.tree(x,t.y,1+hash(x+1)*.4,x);else this.lamppost(x,t.y,hash(x+1)>.3);
   }
   if(t.w>400){const x=t.x+300,y=t.y-2;c.fillStyle='#162f3b';c.fillRect(x,y-44,90,11);c.fillRect(x+7,y-33,6,33);c.fillRect(x+76,y-33,6,33);this.line(x,y-68,x+90,y-68,'#294651',8);this.line(x+8,y-68,x+8,y-35,'#294651',5);this.line(x+81,y-68,x+81,y-35,'#294651',5);}
  }
  // Hanging telegraph cables sit behind every actor.
  const start=Math.floor(this.cameraX/750)*750;
  for(let x=start-750;x<this.cameraX+this.viewW+750;x+=750){c.strokeStyle='#0b26345e';c.lineWidth=2;c.beginPath();c.moveTo(x,175);c.quadraticCurveTo(x+375,300,x+750,195);c.stroke();for(let i=1;i<6;i++){const xx=x+i*125,yy=175+Math.sin(i/6*Math.PI)*63;this.line(xx,yy,xx,yy+10,'#425e65',2);this.glow(xx,yy+13,18,'#f1db9f',.35);this.circle(xx,yy+13,2.4,'#d5bd83');}}
  void p;
 }
 private lamppost(x:number,y:number,on=true){const c=this.ctx;this.line(x,y,x,y-194,'#172f3b',7);this.line(x-13,y,x+13,y,'#172f3b',9);c.strokeStyle='#47646a';c.lineWidth=3;c.beginPath();c.moveTo(x-1,y-170);c.lineTo(x-1,y-204);c.quadraticCurveTo(x,y-225,x+24,y-222);c.stroke();this.poly([x+9,y-219,x+38,y-219,x+34,y-191,x+14,y-191],on?'#cbbd8677':'#16313a','#416469');this.poly([x+7,y-220,x+23,y-230,x+40,y-220],'#23414b');if(on){this.glow(x+24,y-207,125,'#fbe0a0',.9);this.circle(x+24,y-207,4,'#ffdeb0');this.glow(x+25,y-15,90,'#dacb9c',.35);}}
 private thing(t:Thing){
  const c=this.ctx,w=this.world,p=palettes[w.level.theme],x=t.x,y=t.y;
  if(t.kind==='solid'){this.stone(x,y,t.w,t.h);return;}
  if(t.kind==='platform'||t.kind==='moving'){
   this.stone(x,y,t.w,t.h,true);if(t.kind==='moving'){this.glow(x+t.w/2,y+16,80,'#b5ebd4',.45);for(let i=0;i<3;i++)this.diamond(x+t.w*(.25+i*.25),y+12,4,'#a9dcc7');const vertical=t.values.axis==='y',range=Number(t.values.range)||0;this.line(t.baseX+t.w/2-(vertical?0:range),t.baseY+t.h/2-(vertical?range:0),t.baseX+t.w/2+(vertical?0:range),t.baseY+t.h/2+(vertical?range:0),'#93d9ca28',1);}
   else if(hash(x+1)>.6)this.vine(x+t.w-18,y+15,35+hash(x)*55,x);
  }
  if(t.kind==='spark'&&!w.collected.has(t.id)){const yy=y+10+Math.sin(this.clock*2+x)*5;this.glow(x+8,yy,35,'#ffe0a0',.7);this.diamond(x+8,yy,7,'#ffe3a4');this.circle(x+8,yy,2,'#fff6d7');}
  if(t.kind==='lens'&&!w.collected.has(t.id)){
   const xx=x+16,yy=y+20+Math.sin(this.clock*1.9+x)*7;this.glow(xx,yy,95,'#97eede',1.1);c.save();c.translate(xx,yy);c.rotate(Math.sin(this.clock)*.08);c.strokeStyle='#8bd7c677';c.lineWidth=1;c.beginPath();c.ellipse(0,0,29,33,Math.sin(this.clock*.5),0,TAU);c.stroke();this.diamond(0,0,23,'#64beb7');this.poly([0,-23,0,23,-15,0],'#9be6d6');this.poly([0,-23,15,0,0,-6],'#f0ffda');this.diamond(0,0,8,'#ecffdb');c.restore();for(let i=0;i<3;i++){const a=this.clock+i*TAU/3;this.circle(xx+Math.cos(a)*30,yy+Math.sin(a)*19,1.5,'#d5ffe6');}
  }
  if(t.kind==='thorn'){
   this.glow(x+t.w/2,y+28,t.w*.8,'#a85782',.35);for(let i=0;i<t.w/17;i++){const xx=x+i*17,hh=20+hash(i+x)*18;this.poly([xx,y+t.h,xx+7,y+t.h-hh,xx+17,y+t.h],'#674762','#a2798c');this.line(xx+7,y+t.h-hh+5,xx+10,y+t.h-5,'#c991a577');}
  }
  if(t.kind==='enemy'&&!w.defeated.has(t.id)){
   const xx=x+t.w/2,yy=y+t.h/2;this.glow(xx,yy,65,'#b07cc9',.45);c.save();c.translate(xx,yy+Math.sin(this.clock*5+x)*2);this.oval(0,15,25,9,'#0a172c66');this.poly([-24,16,-20,0,-12,-18,-2,-21,10,-14,20,-1,23,17,11,12,5,21,-3,14,-13,19],'#292a45','#6f537c');this.poly([-16,-11,-21,-29,-5,-19],'#3f3457');this.poly([9,-15,23,-25,21,-2],'#3f3457');this.line(-12,-3,-4,-1,'#f4acdd',3);this.line(5,-1,13,-3,'#f4acdd',3);c.restore();
  }
  if(t.kind==='checkpoint'){
   const lit=w.checkpoint===t.id,xx=x+t.w/2;this.poly([x-4,y+t.h,x+2,y+t.h-12,x+9,y+26,x+27,y+26,x+34,y+t.h-12,x+40,y+t.h],'#34575b');this.line(x+9,y+30,x+27,y+30,'#9eae91',3);this.oval(xx,y+26,23,6,'#728779');this.glow(xx,y+12,lit?120:65,lit?'#b9f8d3':'#ffdd9b',.8);this.flame(xx,y+12,lit?1.3:.9,lit?'#bbefd0':'#ffe0a0');if(lit){c.strokeStyle='#adedd177';c.lineWidth=1;c.beginPath();c.arc(xx,y+13,26+Math.sin(this.clock*2)*2,0,TAU);c.stroke();}
  }
  if(t.kind==='beacon')this.beacon(x+t.w/2,y+t.h,w.lit.has(w.level.id),1);
  if(t.kind==='sign'){this.line(x+10,y+t.h,x+10,y+9,p.mid,4);this.poly([x-6,y+4,x+25,y+4,x+35,y+15,x+25,y+26,x-6,y+26],p.stone,p.edge);this.line(x+2,y+15,x+22,y+15,'#b8c9ae',1);this.line(x+16,y+10,x+22,y+15,'#b8c9ae',1);}
 }
 private flame(x:number,y:number,scale:number,color:string){const c=this.ctx;c.save();c.translate(x,y);c.scale(scale,scale);const sway=Math.sin(this.clock*5)*2;this.poly([-8,4,-7,-5,-2+sway,-19,2,-7,7,-13,10,-1,7,7,0,10],color);this.poly([-3,6,0,-8,4,0,4,6,0,9],'#fff6d0');c.restore();}
 private beacon(x:number,y:number,lit:boolean,size:number){
  const c=this.ctx,p=palettes[this.world.level.theme];c.save();c.translate(x,y);c.scale(size,size);
  this.glow(0,-120,lit?410:150,lit?'#ffe2a5':'#8bcfc5',lit?1.5:.45);
  if(lit){const g=c.createLinearGradient(0,-900,0,-140);g.addColorStop(0,'#fff1c900');g.addColorStop(1,'#fff1c944');c.fillStyle=g;c.beginPath();c.moveTo(-23,-144);c.lineTo(-100,-1100);c.lineTo(100,-1100);c.lineTo(23,-144);c.fill();}
  this.poly([-58,0,-50,-15,-39,-15,-32,-41,-24,-41,-24,-95,24,-95,24,-41,32,-41,39,-15,50,-15,58,0],p.stone,p.edge);
  for(let i=0;i<3;i++)this.line(-36-i*6,-11-i*9,36+i*6,-11-i*9,'#a3aea266',2);
  this.poly([-35,-94,-35,-101,-27,-106,27,-106,35,-101,35,-94],'#76978d');
  this.line(-22,-107,-22,-165,'#8eaaa0',4);this.line(22,-107,22,-165,'#8eaaa0',4);
  this.poly([-41,-165,-23,-183,-5,-188,0,-214,5,-188,23,-183,41,-165],'#547b78','#9cae96');this.line(-46,-164,46,-164,'#9aaa91',3);
  c.strokeStyle=lit?'#eddfac':'#6aaca5';c.lineWidth=2;c.beginPath();c.arc(0,-136,34,0,TAU);c.stroke();
  if(lit){this.flame(0,-137,2,'#ffe8a2');for(let i=0;i<14;i++){const yy=-110-((this.clock*60+i*29)%260),xx=Math.sin(i*5+this.clock)*32;this.circle(xx,yy,2,'#ffe9b9');}}
  else {this.diamond(0,-136,18,'#2b5e61');this.diamond(0,-136,9,'#83c7bc');}
  for(let i=0;i<3;i++){const active=lit||this.world.lenses>i;this.diamond(-13+i*13,-68,5,active?'#d6f4ca':'#4d686c');}
  c.restore();
 }
 private hero(h:Hero){
  const c=this.ctx;if(h.invulnerable>0&&Math.floor(h.invulnerable*12)%2===0&&this.world.phase==='playing')c.globalAlpha=.6;
  const bob=h.grounded?Math.sin(h.stride*2)*1.6:0,xx=h.x+15,yy=h.y+54;this.glow(xx+h.face*20,yy-30,110,'#f9da98',.65);this.oval(xx,yy+3,22,5,'#08192466');c.save();c.translate(xx,yy+bob);c.scale(h.face,1);
  const running=h.grounded?Math.sin(h.stride)*6:0;
  this.line(-7,-13,-8+running,-1,'#162c39',7);this.line(5,-13,5-running,-1,'#152937',7);
  // The long scarf trails in response to actual movement.
  const trail=clamp(Math.abs(h.vx)/295,0,2),wave=Math.sin(this.clock*9)*3;
  this.poly([-6,-35,-27-trail*8,-34+wave,-41-trail*7,-41+wave,-36-trail*9,-29+wave,-16,-26],'#ca7c62');
  this.poly([-12,-39,-17,-14,-9,-8,1,-12,11,-10,15,-19,10,-39],'#d8caa1');
  this.poly([-12,-35,-17,-14,-9,-8,-3,-13,-6,-35],'#a69c84');
  this.poly([6,-34,12,-30,16,-16,9,-15,5,-25],'#e8dab0');
  this.oval(0,-42,16,17,'#ded0a7');this.poly([-15,-48,-7,-60,7,-56,14,-46,10,-38,-13,-38],'#e3d5ad');this.oval(5,-42,10,9,'#243c45');
  this.circle(7,-43,2.1,'#edf4cc');this.circle(13,-43,1.3,'#dce8c8');
  this.line(12,-28,23,-23,'#c8ba93',5);this.line(25,-26,25,-12,'#af9c72',1.7);this.oval(25,-24,5,4,'#a9956c');c.fillStyle='#ba9962';c.fillRect(19,-23,12,15);c.fillStyle='#ffe6a8';c.fillRect(22,-21,6,11);this.line(18,-9,32,-9,'#927d58',2);
  this.circle(0,-24,2.5,'#e5af70');c.restore();c.globalAlpha=1;
 }
 private foreground(){
  const c=this.ctx,ww=this.viewW,hh=this.viewH;for(let i=0;i<30;i++){const x=((hash(i+91)*ww-this.cameraX*.65+Math.sin(this.clock*.3+i)*18)%(ww+20)+ww+20)%(ww+20),y=hh*.25+hash(i+121)*hh*.64+Math.sin(this.clock*.5+i)*11;const a=.2+Math.sin(this.clock+i)*.13;this.glow(x,y,13,'#c9e5b1',a);c.globalAlpha=a*1.5;this.circle(x,y,1.4,'#c7e6b7');}c.globalAlpha=1;
  if(this.world.level.theme===1)for(let i=0;i<9;i++){const x=((i*171-this.cameraX*.7+this.clock*10)%(ww+40)+ww+40)%(ww+40),y=(this.clock*16+i*97)%hh;c.save();c.translate(x,y);c.rotate(this.clock+i);this.oval(0,0,5,2,'#6b928977');c.restore();}
 }
 private titleScene(){
  const c=this.ctx,ww=this.viewW,hh=this.viewH;const ground=hh*.8;
  c.save();const sx=ww*.58;
  this.tree(sx+460,ground,1.9,82);this.tree(sx+620,ground,1.4,59);
  this.stone(sx-120,ground,ww-sx+180,hh*.4);this.stone(-100,ground+55,ww*.32,hh*.35);
  this.lamppost(sx+15,ground,true);this.beacon(sx+280,ground,false,1.55);
  this.hero({x:sx+125,y:ground-54,vx:0,vy:0,w:30,h:54,face:1,grounded:true,jumps:0,coyote:0,buffer:0,dash:0,cooldown:0,invulnerable:0,hp:3,floorId:'',stride:0});
  for(let i=0;i<3;i++){const x=sx+110+i*72,y=ground-180-Math.sin(i*.8)*35+Math.sin(this.clock+i)*7;this.glow(x,y,50,'#d9eebc',.4);this.diamond(x,y,8,'#d1ddaa');}
  c.restore();this.foreground();
 }
 dispose(){this.glows.clear();}
}
