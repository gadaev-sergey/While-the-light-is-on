import {World,roadOffsets,SEGMENT,ROAD,CAMERA_HEIGHT,CAMERA_DEPTH,PLAYER_Z,MAX_SPEED,clamp,type Theme,type PropKind,type Car} from './world.ts';

type Palette={sky:[string,string,string];fog:string;ground:[string,string];rumble:[string,string];road:[string,string];lane:string;far:string;near:string;cap:string;night:boolean;glow:string};
const PALETTES:Record<Theme,Palette>={
 coast:{sky:['#1a0d38','#7a2161','#ff8d4d'],fog:'#e9775c',ground:['#a8614f','#9c5849'],rumble:['#f7efe2','#e0383f'],road:['#4a3d55','#463a51'],lane:'#ffe9c4',far:'#4b1f57',near:'#2b1238',cap:'#ff9d6c',night:false,glow:'#ffcf6b'},
 pass:{sky:['#03060f','#0c1834','#2b456e'],fog:'#1f3150',ground:['#14261f','#11221b'],rumble:['#e3e8f0','#bf3434'],road:['#2b2e38','#282b35'],lane:'#dfe4ee',far:'#1a2847',near:'#0b1627',cap:'#9fb3d6',night:true,glow:'#d6e4ff'},
 city:{sky:['#060318','#2c0b4d','#ff2e88'],fog:'#3b1660',ground:['#16121f','#120f1b'],rumble:['#2ef2ff','#ff2e88'],road:['#25203a','#221d36'],lane:'#ffe66d',far:'#25103f',near:'#0f0a1d',cap:'#ff5fa8',night:true,glow:'#7ff7ff'},
};
const DRAW=260,FOG=4.2,CAR_VISUAL=.38;
type Projected={x1:number;y1:number;w1:number;s1:number;x2:number;y2:number;w2:number;s2:number;clip:number;fog:number;visible:boolean};
const hex=(c:string)=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
const rand=(n:number)=>{const v=Math.sin(n*91.7+17.3)*43758.5453;return v-Math.floor(v);};
function canvas(w:number,h:number){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;}

/** Процедурные спрайты: оригинальная графика рисуется в памяти один раз за сессию. */
type Sprite={image:HTMLCanvasElement;width:number};
function rr(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
export function paintCar(color:string,kind:'player'|'rival'|'sedan'|'van',lights=1){
 const c=canvas(320,kind==='van'?230:180),ctx=c.getContext('2d')!,W=320,H=c.height,base=H-14;
 const shade=(k:number)=>{const [r,g,b]=hex(color);return `rgb(${r*k|0},${g*k|0},${b*k|0})`;};
 ctx.fillStyle='rgba(0,0,0,.42)';ctx.beginPath();ctx.ellipse(W/2,base+4,150,14,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#111';rr(ctx,24,base-44,52,48,9);ctx.fill();rr(ctx,W-76,base-44,52,48,9);ctx.fill();
 const top=kind==='van'?24:kind==='sedan'?52:66,shoulder=kind==='van'?60:kind==='sedan'?96:104;
 // Кабина
 ctx.fillStyle=shade(.75);ctx.beginPath();
 const inset=kind==='van'?34:kind==='sedan'?62:74;
 ctx.moveTo(inset,shoulder);ctx.lineTo(inset+18,top);ctx.lineTo(W-inset-18,top);ctx.lineTo(W-inset,shoulder);ctx.closePath();ctx.fill();
 const glass=ctx.createLinearGradient(0,top,0,shoulder);glass.addColorStop(0,'#0c0f1c');glass.addColorStop(1,'#2a3350');
 ctx.fillStyle=glass;ctx.beginPath();ctx.moveTo(inset+10,shoulder-4);ctx.lineTo(inset+24,top+6);ctx.lineTo(W-inset-24,top+6);ctx.lineTo(W-inset-10,shoulder-4);ctx.closePath();ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.moveTo(inset+30,top+8);ctx.lineTo(inset+60,top+8);ctx.lineTo(inset+36,shoulder-6);ctx.lineTo(inset+16,shoulder-6);ctx.closePath();ctx.fill();
 // Кузов
 const body=ctx.createLinearGradient(0,shoulder,0,base);body.addColorStop(0,shade(1.12));body.addColorStop(.45,color);body.addColorStop(1,shade(.55));
 ctx.fillStyle=body;rr(ctx,12,shoulder-4,W-24,base-shoulder-6,kind==='van'?10:22);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(22,shoulder,W-44,3);
 ctx.fillStyle=shade(.35);ctx.fillRect(20,base-24,W-40,12);
 if(kind==='player'||kind==='rival'){ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(W/2-6,shoulder-2,12,base-shoulder-26);}
 // Фонари
 const ly=shoulder+14,lh=kind==='player'||kind==='rival'?14:18;
 ctx.save();ctx.shadowColor='#ff2a2a';ctx.shadowBlur=18*lights;ctx.fillStyle=lights>1.2?'#ff6a5a':'#e3242f';
 if(kind==='player'||kind==='rival'){rr(ctx,26,ly,W-52,lh,6);ctx.fill();ctx.fillStyle=shade(.4);ctx.fillRect(120,ly+2,80,lh-4);ctx.fillStyle=lights>1.2?'#ff6a5a':'#e3242f';}
 else{rr(ctx,24,ly,58,lh,5);ctx.fill();rr(ctx,W-82,ly,58,lh,5);ctx.fill();}
 ctx.restore();
 ctx.fillStyle='#ffd0c4';ctx.fillRect(32,ly+3,20,4);ctx.fillRect(W-52,ly+3,20,4);
 // Номер
 ctx.fillStyle='#e8e4d6';rr(ctx,W/2-34,base-52,68,20,3);ctx.fill();ctx.fillStyle='#1b1b24';ctx.font='bold 14px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind==='player'?'ЗР 086':kind==='rival'?'ГОНКА':'А 000',W/2,base-41);
 if(kind==='player'||kind==='rival'){
  ctx.fillStyle=shade(.5);ctx.fillRect(40,shoulder-26,10,24);ctx.fillRect(W-50,shoulder-26,10,24);
  ctx.fillStyle=shade(.9);rr(ctx,26,shoulder-34,W-52,12,4);ctx.fill();
  ctx.fillStyle='#2b2b30';ctx.beginPath();ctx.arc(W/2-34,base-14,9,0,Math.PI*2);ctx.arc(W/2+34,base-14,9,0,Math.PI*2);ctx.fill();
 }
 return c;
}
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=.6){const g=ctx.createRadialGradient(x,y,0,x,y,r);const [cr,cg,cb]=hex(color);g.addColorStop(0,`rgba(${cr},${cg},${cb},${alpha})`);g.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
function paintProp(kind:PropKind,variant:number,p:Palette,side:number):Sprite{
 const v=variant;
 if(kind==='palm'){
  const c=canvas(260,520),ctx=c.getContext('2d')!,lean=(v%2?1:-1)*(28+v*8);
  ctx.strokeStyle='#2b1430';ctx.lineWidth=16;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(130,515);ctx.quadraticCurveTo(130+lean*.2,300,130+lean,120);ctx.stroke();
  ctx.strokeStyle='#ff9d6c66';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(136,510);ctx.quadraticCurveTo(136+lean*.2,300,136+lean,124);ctx.stroke();
  ctx.fillStyle='#24102c';const cx=130+lean,cy=118;
  for(let i=0;i<8;i++){const a=-Math.PI/2+(i-3.5)*.44+(i>3?.15:-.15),len=105+rand(i+v)*30;ctx.save();ctx.translate(cx,cy);ctx.rotate(a);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(len*.5,-26,len,22);ctx.quadraticCurveTo(len*.5,4,0,6);ctx.fill();ctx.restore();}
  return {image:c,width:1.05};
 }
 if(kind==='lamp'){
  const c=canvas(200,560),ctx=c.getContext('2d')!,dir=side>0?-1:1;
  ctx.fillStyle='#1d1a26';ctx.fillRect(96,60,10,500);ctx.fillRect(dir>0?100:40,56,60,8);
  const lx=dir>0?150:50;ctx.fillStyle='#2a2633';rr(ctx,lx-22,52,44,14,5);ctx.fill();
  glow(ctx,lx,72,80,p.glow,p.night?.6:.4);ctx.fillStyle='#fff6da';ctx.fillRect(lx-16,64,32,5);
  return {image:c,width:.5};
 }
 if(kind==='rock'){
  const c=canvas(320,220),ctx=c.getContext('2d')!;const g=ctx.createLinearGradient(0,0,0,220);g.addColorStop(0,p.night?'#3d4a63':'#7b4a63');g.addColorStop(1,p.night?'#141b2a':'#3a1f37');ctx.fillStyle=g;
  ctx.beginPath();ctx.moveTo(10,220);for(let i=0;i<=8;i++){const x=10+i*37.5,y=60+Math.sin(i*1.7+v)*30+rand(i+v*9)*40+(i===0||i===8?120:0);ctx.lineTo(x,y);}ctx.lineTo(310,220);ctx.closePath();ctx.fill();
  ctx.fillStyle=p.night?'#9fb3d655':'#ff9d6c44';ctx.beginPath();ctx.moveTo(80,90);ctx.lineTo(160,70);ctx.lineTo(120,120);ctx.closePath();ctx.fill();
  return {image:c,width:1.15};
 }
 if(kind==='billboard'){
  const texts=['ЗАРЕВО','ВОЛНА 86.4','ЛЕТО','МОТЕЛЬ «ЧАЙКА»'],c=canvas(420,320),ctx=c.getContext('2d')!;
  ctx.fillStyle='#1c1324';ctx.fillRect(80,170,14,150);ctx.fillRect(326,170,14,150);
  const g=ctx.createLinearGradient(0,20,0,180);g.addColorStop(0,['#ff5a36','#2ef2ff','#ffd36b','#ff2e88'][v]);g.addColorStop(1,['#7a1d52','#1d3d7a','#d0573a','#3a0f5c'][v]);
  ctx.fillStyle='#120b1a';ctx.fillRect(16,16,388,168);ctx.fillStyle=g;ctx.fillRect(24,24,372,152);
  ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='italic 900 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(texts[v],210,96);
  ctx.font='bold 16px Arial';ctx.fillStyle='rgba(255,255,255,.75)';ctx.fillText(['НОЧНАЯ ГОНКА','НА ВАШЕЙ ВОЛНЕ','КРУГЛЫЙ ГОД','12 КМ ВПЕРЕДИ'][v],210,146);
  return {image:c,width:1.9};
 }
 if(kind==='house'){
  const c=canvas(380,300),ctx=c.getContext('2d')!;ctx.fillStyle='#3a1a3f';ctx.fillRect(30,120,320,180);ctx.fillStyle='#2a1030';ctx.beginPath();ctx.moveTo(10,126);ctx.lineTo(190,30);ctx.lineTo(370,126);ctx.closePath();ctx.fill();
  for(let i=0;i<3;i++){const lit=rand(i+v*4)>.35;ctx.fillStyle=lit?'#ffcf6b':'#1d0e22';ctx.fillRect(60+i*100,170,52,46);if(lit)glow(ctx,86+i*100,193,60,'#ffcf6b',.25);}
  return {image:c,width:2};
 }
 if(kind==='pine'){
  const c=canvas(240,520),ctx=c.getContext('2d')!;ctx.fillStyle='#160d08';ctx.fillRect(112,420,16,100);
  for(let i=0;i<5;i++){const y=60+i*76,w=40+i*24;ctx.fillStyle=i%2?'#0f2a24':'#123129';ctx.beginPath();ctx.moveTo(120,y-40);ctx.lineTo(120+w,y+70);ctx.lineTo(120-w,y+70);ctx.closePath();ctx.fill();ctx.fillStyle='#c8d8f0aa';ctx.beginPath();ctx.moveTo(120,y-40);ctx.lineTo(120+w*.35,y+4);ctx.lineTo(120-w*.4,y+8);ctx.closePath();ctx.fill();}
  return {image:c,width:.95};
 }
 if(kind==='sign'){
  const c=canvas(300,260),ctx=c.getContext('2d')!;ctx.fillStyle='#22222a';ctx.fillRect(60,150,12,110);ctx.fillRect(228,150,12,110);
  ctx.fillStyle='#ffd23f';ctx.fillRect(20,40,260,120);ctx.fillStyle='#111';const dir=side>0?-1:1;
  for(let i=0;i<3;i++){const x=70+i*80;ctx.beginPath();ctx.moveTo(x-25*dir,60);ctx.lineTo(x+25*dir,100);ctx.lineTo(x-25*dir,140);ctx.lineTo(x-5*dir,140);ctx.lineTo(x+45*dir,100);ctx.lineTo(x-5*dir,60);ctx.closePath();ctx.fill();}
  ctx.save();ctx.shadowColor='#ffd23f';ctx.shadowBlur=20;ctx.strokeStyle='#ffef9a';ctx.lineWidth=3;ctx.strokeRect(20,40,260,120);ctx.restore();
  return {image:c,width:1.05};
 }
 if(kind==='rail'){
  const c=canvas(60,200),ctx=c.getContext('2d')!;ctx.fillStyle='#d8dde6';rr(ctx,18,20,24,180,6);ctx.fill();ctx.fillStyle='#202028';ctx.fillRect(18,60,24,22);
  ctx.save();ctx.shadowColor='#ff3a3a';ctx.shadowBlur=14;ctx.fillStyle='#ff4a3a';ctx.fillRect(22,36,16,14);ctx.restore();
  return {image:c,width:.2};
 }
 if(kind==='tower'){
  const floors=10+v*5,c=canvas(360,120+floors*44),ctx=c.getContext('2d')!,H=c.height;
  const g=ctx.createLinearGradient(0,0,360,0);g.addColorStop(0,'#1a1230');g.addColorStop(1,'#0c0818');ctx.fillStyle=g;ctx.fillRect(20,60,320,H-60);
  ctx.fillStyle='#120c22';ctx.fillRect(150,10,8,52);ctx.save();ctx.shadowColor='#ff2e4d';ctx.shadowBlur=16;ctx.fillStyle='#ff4a5e';ctx.fillRect(147,6,14,10);ctx.restore();
  const colors=['#ffd36b','#7ff7ff','#ff8ad1','#fff1c4'];
  for(let f=0;f<floors;f++)for(let i=0;i<6;i++){const lit=rand(f*13+i*7+v*101)>.45;ctx.fillStyle=lit?colors[(f+i+v)%4]:'#1e1636';ctx.globalAlpha=lit?.85:1;ctx.fillRect(42+i*50,86+f*44,30,24);}
  ctx.globalAlpha=1;ctx.fillStyle=['#2ef2ff','#ff2e88','#ffe66d','#9d6bff'][v];ctx.fillRect(20,60,320,5);
  return {image:c,width:2.4};
 }
 // neon
 const words=['КИНО','24 ЧАСА','ДИСКО','ОТЕЛЬ'],tint=['#ff2e88','#2ef2ff','#ffe66d','#b46bff'][v],c=canvas(420,300),ctx=c.getContext('2d')!;
 ctx.fillStyle='#120c1c';ctx.fillRect(196,180,28,120);ctx.fillStyle='#0d0816';rr(ctx,14,20,392,160,18);ctx.fill();
 glow(ctx,210,100,230,tint,.35);ctx.save();ctx.shadowColor=tint;ctx.shadowBlur=26;ctx.strokeStyle=tint;ctx.lineWidth=6;rr(ctx,26,32,368,136,14);ctx.stroke();
 ctx.fillStyle='#fff';ctx.font='italic 900 62px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(words[v],210,102);ctx.restore();
 return {image:c,width:1.6};
}

/** Перспективная проекция точки камеры на экран: x вправо, y вниз от горизонта. */
export function projectPoint(wx:number,wy:number,wz:number,width:number,horizon:number,vscale:number){
 const scale=CAMERA_DEPTH/wz;return {x:width/2+scale*wx*width/2,y:horizon-scale*wy*vscale,w:scale*ROAD*width/2,s:scale};
}
/** Проецирует ближний (a) и дальний (b) край сегмента дороги с учётом накопленного изгиба. */
export function projectSegment(seg:{index:number;y1:number;y2:number},n:number,bend:{near:number[];far:number[]},camX:number,camY:number,camZ:number,width:number,horizon:number,vscale:number){
 const z1=seg.index*SEGMENT-camZ;
 return {a:projectPoint(bend.near[n]-camX,seg.y1-camY,z1,width,horizon,vscale),b:projectPoint(bend.far[n]-camX,seg.y2-camY,z1+SEGMENT,width,horizon,vscale)};
}
export class Renderer {
 canvas:HTMLCanvasElement;world:World;ctx:CanvasRenderingContext2D;w=1;h=1;ratio=1;
 /** Доля высоты экрана под сенсорными кнопками: машина поднимается над ними. */
 inset=0;horizon=1;vscale=1;
 private theme:Theme|'';private palette=PALETTES.coast;private sky?:HTMLCanvasElement;private far?:HTMLCanvasElement;private near?:HTMLCanvasElement;
 private sprites=new Map<string,Sprite>();private cars=new Map<string,HTMLCanvasElement>();private farX=0;private nearX=0;private clock=0;
 private proj:Projected[]=[];private dust:{x:number;y:number;vx:number;vy:number;life:number;color:string;size:number}[]=[];
 constructor(canvasElement:HTMLCanvasElement,world:World){
  const ctx=canvasElement.getContext('2d',{alpha:false});if(!ctx)throw new Error('Браузер не поддерживает Canvas 2D.');
  this.canvas=canvasElement;this.world=world;this.ctx=ctx;this.theme='';for(let i=0;i<=DRAW;i++)this.proj.push({x1:0,y1:0,w1:0,s1:0,x2:0,y2:0,w2:0,s2:0,clip:0,fog:1,visible:false});this.resize();
 }
 resize(){
  const r=this.canvas.getBoundingClientRect();this.ratio=Math.min(window.devicePixelRatio||1,r.width>1400?1.25:1.6);
  this.w=Math.max(320,Math.round(r.width*this.ratio));this.h=Math.max(240,Math.round(r.height*this.ratio));this.canvas.width=this.w;this.canvas.height=this.h;this.theme='';this.layout();
 }
 layout(){const portrait=this.w/this.h<.85;this.horizon=this.h*(portrait?.4:.5);this.vscale=this.h*(1-this.inset)-this.horizon;this.theme='';}
 private prepare(){
  const theme=this.world.track.theme;if(theme===this.theme)return;this.theme=theme;const p=this.palette=PALETTES[theme],w=this.w,h=this.h;
  this.sprites.clear();
  // Небо с солнцем, луной или звёздами.
  const sky=this.sky=canvas(w,h/2+4),s=sky.getContext('2d')!,g=s.createLinearGradient(0,0,0,h/2);g.addColorStop(0,p.sky[0]);g.addColorStop(.6,p.sky[1]);g.addColorStop(1,p.sky[2]);s.fillStyle=g;s.fillRect(0,0,w,h/2+4);
  if(p.night)for(let i=0;i<220;i++){s.fillStyle=`rgba(255,255,255,${.25+rand(i)*.6})`;const size=rand(i*3)>.93?2:1;s.fillRect(rand(i*7)*w,rand(i*11)*h*.42,size*this.ratio,size*this.ratio);}
  if(theme==='pass'){glow(s,w*.74,h*.14,h*.18,'#cfe0ff',.35);s.fillStyle='#eef3ff';s.beginPath();s.arc(w*.74,h*.14,h*.045,0,Math.PI*2);s.fill();s.fillStyle='#d6dff3';s.beginPath();s.arc(w*.735,h*.135,h*.012,0,Math.PI*2);s.arc(w*.752,h*.152,h*.008,0,Math.PI*2);s.fill();}
  if(theme==='city'){const hg=s.createLinearGradient(0,h*.32,0,h/2);hg.addColorStop(0,'rgba(255,46,136,0)');hg.addColorStop(1,'rgba(255,90,170,.55)');s.fillStyle=hg;s.fillRect(0,h*.32,w,h*.18);}
  // Дальние и ближние силуэты рисуются в широкие полосы и повторяются по горизонтали.
  const bandW=Math.max(1400,w*1.6);
  this.far=canvas(bandW,h*.3);const f=this.far.getContext('2d')!,fh=this.far.height;
  this.near=canvas(bandW,h*.22);const n=this.near.getContext('2d')!,nh=this.near.height;
  if(theme==='coast'){
   // Солнце-«синтволна» прячется за дальними холмами.
   const sun=f.createLinearGradient(0,fh*.05,0,fh);sun.addColorStop(0,'#ffe27a');sun.addColorStop(1,'#ff3f7d');
   const cx=bandW*.5,cy=fh*.78,R=fh*.62;glow(f,cx,cy,R*1.7,'#ff9d5c',.35);f.save();f.beginPath();f.arc(cx,cy,R,0,Math.PI*2);f.clip();f.fillStyle=sun;f.fillRect(cx-R,cy-R,R*2,R*2);
   for(let i=0;i<7;i++){const y=cy-R*.05+i*R*.13;f.clearRect(cx-R,y,R*2,2+i*1.6);}
   f.restore();
  }
  const ridge=(ctx:CanvasRenderingContext2D,H:number,color:string,cap:string|null,amp:number,seed:number,steps:number)=>{
   ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,H);const pts:[number,number][]=[];
   for(let i=0;i<=steps;i++){const x=i/steps*bandW,k=i%steps;const y=H*(1-amp*(.35+.65*Math.abs(Math.sin(k*.9+seed)*.6+Math.sin(k*2.3+seed*3)*.4)));pts.push([x,i===steps?pts[0][1]:y]);}
   for(const [x,y] of pts)ctx.lineTo(x,y);ctx.lineTo(bandW,H);ctx.closePath();ctx.fill();
   if(cap){
    // Снежные шапки: тот же силуэт, обрезанный неровной линией снега.
    ctx.save();ctx.clip();ctx.fillStyle=cap;ctx.beginPath();ctx.moveTo(0,0);
    for(let x=0;x<=bandW;x+=bandW/(steps*6)){ctx.lineTo(x,H*(1-amp*.66)+Math.sin(x*.05+seed)*H*.03+rand(x)*H*.05);}
    ctx.lineTo(bandW,0);ctx.closePath();ctx.fill();ctx.restore();
   }
  };
  if(theme==='city'){
   const sky=(ctx:CanvasRenderingContext2D,H:number,color:string,lit:number,seed:number,minW:number)=>{let x=0;while(x<bandW){const bw=minW+rand(x+seed)*minW*1.4,bh=H*(.35+rand(x*1.3+seed)*.62);ctx.fillStyle=color;ctx.fillRect(x,H-bh,bw-2,bh);
     for(let wy=H-bh+8;wy<H-6;wy+=9)for(let wx=x+5;wx<x+bw-8;wx+=8)if(rand(wx*.7+wy*1.9+seed)<lit){ctx.fillStyle=['#ffd36b','#7ff7ff','#ff8ad1'][Math.floor(rand(wx+wy)*3)];ctx.globalAlpha=.65;ctx.fillRect(wx,wy,3,4);ctx.globalAlpha=1;}
     if(rand(x+seed*2)>.7){ctx.fillStyle=['#ff2e88','#2ef2ff'][Math.floor(rand(x)*2)];ctx.fillRect(x,H-bh,bw-2,2);}x+=bw;}};
   sky(f,fh,p.far,.18,3,40*this.ratio);sky(n,nh,p.near,.1,9,70*this.ratio);
  }else{
   ridge(f,fh,p.far,theme==='pass'?p.cap:null,theme==='pass'?.92:.55,1.3,14);
   ridge(n,nh,p.near,null,theme==='pass'?.7:.45,4.1,22);
   if(theme==='coast'){n.fillStyle='#ff9d6c33';n.fillRect(0,nh-3,bandW,3);}
  }
 }
 private sprite(kind:PropKind,variant:number,side:number){
  const key=kind==='sign'||kind==='lamp'?`${kind}${variant}${side>0?1:-1}`:kind+variant;let s=this.sprites.get(key);
  if(!s){s=paintProp(kind,variant,this.palette,side);this.sprites.set(key,s);}return s;
 }
 private carSprite(car:Car|null,lights=1){
  const kind=car===null?'player':car.kind==='rival'?'rival':car.id%3===0?'van':'sedan',color=car===null?'#ff5a36':car.color,key=kind+color+lights;
  let image=this.cars.get(key);if(!image){image=paintCar(color,kind,lights);this.cars.set(key,image);}return image;
 }
 private mix(a:string,b:string,t:number){const x=hex(a),y=hex(b);return `rgb(${x[0]+(y[0]-x[0])*t|0},${x[1]+(y[1]-x[1])*t|0},${x[2]+(y[2]-x[2])*t|0})`;}
 private poly(x1:number,y1:number,w1:number,x2:number,y2:number,w2:number,color:string){const c=this.ctx;c.fillStyle=color;c.beginPath();c.moveTo(x1-w1,y1);c.lineTo(x2-w2,y2);c.lineTo(x2+w2,y2);c.lineTo(x1+w1,y1);c.closePath();c.fill();}

 draw(dt:number){
  this.prepare();this.clock+=dt;
  const ctx=this.ctx,w=this.w,h=this.h,world=this.world,p=this.palette,player=world.player,segs=world.segments;
  const camZ=Math.max(0,player.z-PLAYER_Z),base=world.segmentAt(camZ),basePct=(camZ%SEGMENT)/SEGMENT;
  const pSeg=world.segmentAt(player.z),pPct=(player.z%SEGMENT)/SEGMENT,playerY=pSeg.y1+(pSeg.y2-pSeg.y1)*pPct;
  const camY=playerY+CAMERA_HEIGHT,camX=player.x*ROAD,percent=player.speed/MAX_SPEED;
  const shake=world.shake*8*this.ratio;
  ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
  // Фон с параллаксом по кривизне дороги.
  if(world.phase!=='paused'){this.farX+=pSeg.curve*percent*dt*.0018*w;this.nearX+=pSeg.curve*percent*dt*.0042*w;}
  const hz=this.horizon,vs=this.vscale;
  ctx.drawImage(this.sky!,0,0,w,hz+4);
  const band=(img:HTMLCanvasElement,x:number,y:number)=>{const W=img.width;let o=((x%W)+W)%W;ctx.drawImage(img,-o,y);ctx.drawImage(img,W-o,y);if(W*2-o<w)ctx.drawImage(img,W*2-o,y);};
  band(this.far!,this.farX,hz-this.far!.height+2);band(this.near!,this.nearX,hz-this.near!.height+3);
  ctx.fillStyle=p.fog;ctx.fillRect(0,hz,w,h-hz+2);
  // Проекция сегментов.
  let maxy=h;const bend=roadOffsets(segs,base.index,basePct,DRAW);
  for(let n=0;n<DRAW;n++){
   const pr=this.proj[n];pr.visible=false;const seg=segs[base.index+n];if(!seg)break;
   const z1=seg.index*SEGMENT-camZ;pr.clip=maxy;
   if(z1<=CAMERA_DEPTH)continue;
   const {a,b}=projectSegment(seg,n,bend,camX,camY,camZ,w,hz,vs);
   Object.assign(pr,{x1:a.x,y1:a.y,w1:a.w,s1:a.s,x2:b.x,y2:b.y,w2:b.w,s2:b.s});
   const d=n/DRAW;pr.fog=1/Math.exp(d*d*FOG);
   if(b.y>=a.y||b.y>=maxy)continue;
   pr.visible=true;
   const stripe=Math.floor(seg.index/3)%2,f=1-pr.fog;
   const top=Math.max(0,b.y),bottom=Math.min(h,a.y);
   ctx.fillStyle=this.mix(p.ground[stripe],p.fog,f);ctx.fillRect(0,top,w,bottom-top+1);
   const r1=a.w/(stripe?7:6.5),r2=b.w/(stripe?7:6.5);
   this.poly(a.x,a.y,a.w+r1,b.x,b.y,b.w+r2,this.mix(p.rumble[stripe],p.fog,f));
   this.poly(a.x,a.y,a.w,b.x,b.y,b.w,this.mix(p.road[stripe],p.fog,f));
   if(seg.checkpoint!==0){
    const cells=12;for(let i=0;i<cells;i++){const t1=-1+i*2/cells,t2=t1+2/cells;ctx.fillStyle=this.mix(i%2?'#f6f1e8':'#14101c',p.fog,f);ctx.beginPath();ctx.moveTo(a.x+a.w*t1,a.y);ctx.lineTo(b.x+b.w*t1,b.y);ctx.lineTo(b.x+b.w*t2,b.y);ctx.lineTo(a.x+a.w*t2,a.y);ctx.fill();}
   }else if(stripe){
    const lw1=a.w/40,lw2=b.w/40;for(const lane of [-1/3,1/3])this.poly(a.x+a.w*lane,a.y,lw1,b.x+b.w*lane,b.y,lw2,this.mix(p.lane,p.fog,f));
   }
   maxy=b.y;
  }
  // Фары на ночных трассах.
  if(p.night){ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(w/2,hz+vs*.5,0,w/2,hz+vs*.5,w*.42);g.addColorStop(0,'rgba(255,236,200,.16)');g.addColorStop(1,'rgba(255,236,200,0)');ctx.fillStyle=g;ctx.fillRect(0,hz,w,h-hz);ctx.restore();}
  // Спрайты и машины от дальних к ближним.
  const buckets=new Map<number,Car[]>();for(const car of world.cars){const i=Math.floor(car.z/SEGMENT);if(i>=base.index&&i<base.index+DRAW){const list=buckets.get(i);if(list)list.push(car);else buckets.set(i,[car]);}}
  for(let n=DRAW-1;n>0;n--){
   const pr=this.proj[n],seg=segs[base.index+n];if(!seg)continue;if(seg.index*SEGMENT-camZ<=CAMERA_DEPTH)continue;
   ctx.globalAlpha=clamp(pr.fog*1.6,0,1);
   for(const prop of seg.props){const s=this.sprite(prop.kind,prop.variant,Math.sign(prop.offset));this.blit(s.image,s.width,pr.s1,pr.x1+pr.s1*prop.offset*ROAD*w/2,pr.y1,pr.clip,prop.offset<0?-1:0);}
   if(seg.checkpoint!==0)this.arch(pr,seg.checkpoint<0);
   const list=buckets.get(seg.index);
   if(list)for(const car of list.sort((a,b)=>b.z-a.z)){
    const t=(car.z%SEGMENT)/SEGMENT,s=pr.s1+(pr.s2-pr.s1)*t,cx=pr.x1+(pr.x2-pr.x1)*t+s*car.x*ROAD*w/2,cy=pr.y1+(pr.y2-pr.y1)*t;
    const img=this.carSprite(car,car.kind==='rival'||p.night?1.4:1),dh=this.blit(img,CAR_VISUAL,s,cx+(car.bump>0?Math.sin(this.clock*60)*3:0),cy,pr.clip,-.5);
    if(car.kind==='rival'&&n>2&&n<40){const label=car.name.split(' ')[0].replace(/[«»]/g,'');ctx.font=`bold ${Math.max(10,13*this.ratio)}px Arial`;ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,.75)';const tag=cy-dh-8*this.ratio;if(tag<pr.clip)ctx.fillText(label,cx,tag);}
   }
  }
  ctx.globalAlpha=1;
  this.player(percent,pSeg,playerY,camY);
  this.particles(dt,percent);
  if(world.player.boosting)this.speedLines();
  ctx.restore();
  if(world.flash>0){ctx.fillStyle=`rgba(255,240,220,${world.flash*.35})`;ctx.fillRect(0,0,w,h);}
 }
 /** Рисует спрайт с привязкой к низу и обрезает части, закрытые ближним холмом. Возвращает высоту. */
 private blit(img:HTMLCanvasElement,width:number,scale:number,x:number,y:number,clip:number,align:number){
  const w=this.w,dw=width*ROAD*scale*w/2,dh=dw*img.height/img.width;if(dw<1||dw>w*4)return 0;
  const left=x+dw*align,top=y-dh,clipH=Math.max(0,y-clip);if(clipH>=dh)return dh;
  this.ctx.drawImage(img,0,0,img.width,img.height*(1-clipH/dh),left,top,dw,dh-clipH);return dh;
 }
 private arch(pr:Projected,finish:boolean){
  const ctx=this.ctx,w=this.w,s=pr.s1,span=pr.w1*1.18,height=ROAD*.95*s*w/2,x=pr.x1,y=pr.y1;if(height<2||y-height>pr.clip)return;
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,pr.clip);ctx.clip();
  const post=Math.max(2,span*.035);ctx.fillStyle='#16101f';ctx.fillRect(x-span-post,y-height,post,height);ctx.fillRect(x+span,y-height,post,height);
  const bh=height*.22;ctx.fillStyle=finish?'#14101c':'#ff5a36';ctx.fillRect(x-span-post,y-height,span*2+post*2,bh);
  if(finish){const cells=16;for(let i=0;i<cells;i++)for(let r=0;r<2;r++)if((i+r)%2){ctx.fillStyle='#f6f1e8';ctx.fillRect(x-span+i*span*2/cells,y-height+r*bh/2,span*2/cells+1,bh/2+1);}}
  else{ctx.fillStyle='#fff3e0';ctx.font=`italic 900 ${bh*.62}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('КОНТРОЛЬНАЯ ТОЧКА',x,y-height+bh/2);}
  ctx.restore();
 }
 private player(percent:number,seg:{y1:number;y2:number},playerY:number,camY:number){
  const ctx=this.ctx,w=this.w,h=this.h,p=this.world.player,scale=CAMERA_DEPTH/PLAYER_Z;
  const y=this.horizon-scale*(playerY-camY)*this.vscale,bounce=(p.offroad&&p.speed>0?Math.sin(this.clock*55)*3:Math.sin(this.clock*30)*percent*1.2)*this.ratio;
  const braking=this.world.phase==='finished'||this.world.phase==='timeout';
  const img=this.carSprite(null,braking?1.8:1.2),dw=CAR_VISUAL*ROAD*scale*w/2,dh=dw*img.height/img.width;
  ctx.save();ctx.translate(w/2,y+bounce);ctx.rotate(p.steer*.035);
  ctx.transform(1,0,-p.steer*.08,1,0,0);
  ctx.drawImage(img,-dw/2,-dh,dw,dh);
  if(p.boosting){ctx.globalCompositeOperation='lighter';for(const side of [-1,1]){const fx=side*dw*.106,fy=-dh*.078,r=dw*(.045+Math.random()*.02);
   const g=ctx.createRadialGradient(fx,fy,0,fx,fy,r*2.4);g.addColorStop(0,'rgba(235,250,255,.95)');g.addColorStop(.35,'rgba(110,190,255,.7)');g.addColorStop(1,'rgba(90,70,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(fx,fy,r*2.4,0,Math.PI*2);ctx.fill();}}
  ctx.restore();

 }
 private particles(dt:number,percent:number){
  const p=this.world.player,ctx=this.ctx,w=this.w,h=this.h;
  if(p.offroad&&percent>.1&&this.world.phase!=='paused')for(let i=0;i<2;i++)this.dust.push({x:w/2+(Math.random()-.5)*w*.3,y:this.horizon+this.vscale*.95,vx:(Math.random()-.5)*w*.4,vy:-Math.random()*h*.25,life:.6,color:this.palette.ground[0],size:(6+Math.random()*14)*this.ratio});
  if(this.world.shake>.9)for(let i=0;i<14;i++)this.dust.push({x:w/2+(Math.random()-.5)*w*.25,y:this.horizon+this.vscale*.88,vx:(Math.random()-.5)*w*.9,vy:-Math.random()*h*.6,life:.45,color:'#ffd36b',size:3*this.ratio});
  for(const d of this.dust){d.life-=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vy+=h*.8*dt;}
  this.dust=this.dust.filter(d=>d.life>0).slice(-160);
  for(const d of this.dust){ctx.globalAlpha=clamp(d.life*1.6,0,.8);ctx.fillStyle=d.color;ctx.fillRect(d.x,d.y,d.size,d.size);}ctx.globalAlpha=1;
 }
 private speedLines(){
  const ctx=this.ctx,w=this.w,h=this.h;ctx.save();ctx.strokeStyle='rgba(200,240,255,.35)';ctx.lineWidth=2*this.ratio;
  for(let i=0;i<26;i++){const a=Math.random()*Math.PI*2,r1=Math.max(w,h)*(.35+Math.random()*.2),r2=r1+Math.max(w,h)*(.12+Math.random()*.15);ctx.beginPath();ctx.moveTo(w/2+Math.cos(a)*r1,this.horizon+Math.sin(a)*r1*.6);ctx.lineTo(w/2+Math.cos(a)*r2,this.horizon+Math.sin(a)*r2*.6);ctx.stroke();}
  ctx.restore();
 }
 dispose(){this.sprites.clear();this.cars.clear();this.dust=[];}
}
