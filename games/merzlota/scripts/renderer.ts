import {World,FLOOR,WALL,ICE,CONCRETE,WINDOW,DOOR,BLUE_DOOR,RED_DOOR,EXIT,type Theme,type EnemyKind,type ItemKind} from './world.ts';

/** Текстура в формате ImageData: Uint32 0xAABBGGRR. */
type Tex={w:number;h:number;data:Uint32Array};
type Palette={fog:[number,number,number];wall:string;trim:string;floor:string;ceiling:string;lamp:string;light:number};
const PALETTES:Record<Theme,Palette>={
 airlock:{fog:[8,14,24],wall:'#4a5a6e',trim:'#2a3442',floor:'#3b4450',ceiling:'#262e3a',lamp:'#ffd9a0',light:1},
 lab:{fog:[10,20,22],wall:'#9aa6a8',trim:'#55605f',floor:'#4a5355',ceiling:'#3a4446',lamp:'#d6fff4',light:1.05},
 core:{fog:[16,8,30],wall:'#5d7fae',trim:'#2b2f5c',floor:'#2a3550',ceiling:'#191c38',lamp:'#c8a8ff',light:.95},
};
const T=64;
function canvas(w:number,h:number){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function bake(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void):Tex{
 const c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true})!;draw(ctx);return {w,h,data:new Uint32Array(ctx.getImageData(0,0,w,h).data.buffer.slice(0))};
}
const rand=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
function noise(ctx:CanvasRenderingContext2D,w:number,h:number,amount:number,seed:number){for(let i=0;i<w*h*.35;i++){const x=rand(i+seed)*w|0,y=rand(i*1.7+seed)*h|0;ctx.fillStyle=rand(i*3.1+seed)>.5?`rgba(255,255,255,${amount})`:`rgba(0,0,0,${amount*1.4})`;ctx.fillRect(x,y,1,1);}}
function glow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=1){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.globalAlpha=1;}

function wallTextures(p:Palette,theme:Theme){
 const metal=bake(T,T,c=>{c.fillStyle=p.wall;c.fillRect(0,0,T,T);noise(c,T,T,.06,theme.length);c.fillStyle=p.trim;c.fillRect(0,0,T,3);c.fillRect(0,61,T,3);c.fillRect(31,0,2,T);
  c.fillStyle='rgba(255,255,255,.12)';c.fillRect(0,3,T,1);c.fillRect(33,0,1,T);c.fillStyle='rgba(0,0,0,.35)';for(const [x,y] of [[5,8],[26,8],[38,8],[58,8],[5,55],[26,55],[38,55],[58,55]])c.fillRect(x,y,2,2);
  if(theme==='lab'){c.fillStyle='rgba(40,80,80,.35)';c.fillRect(0,40,T,6);}else{c.fillStyle='rgba(255,170,60,.55)';for(let i=0;i<8;i++)c.fillRect(i*8,46,4,3);}});
 const ice=bake(T,T,c=>{const g=c.createLinearGradient(0,0,T,T);g.addColorStop(0,'#8fc0e2');g.addColorStop(1,'#3a6a9a');c.fillStyle=g;c.fillRect(0,0,T,T);noise(c,T,T,.08,9);
  c.strokeStyle='rgba(225,245,255,.5)';c.lineWidth=1;for(let i=0;i<4;i++){c.beginPath();let x=rand(i)*T,y=0;c.moveTo(x,y);while(y<T){x+=(rand(x+y)-.5)*14;y+=6+rand(y+i)*8;c.lineTo(x,y);}c.stroke();}
  c.fillStyle='rgba(30,70,140,.25)';c.fillRect(0,0,T,T*.2);});
 const concrete=bake(T,T,c=>{c.fillStyle='#7d8287';c.fillRect(0,0,T,T);noise(c,T,T,.1,4);c.fillStyle='rgba(0,0,0,.25)';c.fillRect(0,21,T,1);c.fillRect(0,42,T,1);c.fillStyle='rgba(0,0,0,.15)';for(let i=0;i<6;i++)c.fillRect(rand(i*5)*T,rand(i*9)*T,2,2);});
 const window=bake(T,T,c=>{c.fillStyle=p.trim;c.fillRect(0,0,T,T);const g=c.createLinearGradient(0,6,0,58);g.addColorStop(0,'#05091a');g.addColorStop(1,'#132a46');c.fillStyle=g;c.fillRect(6,6,52,52);
  for(let i=0;i<14;i++){c.fillStyle=`rgba(255,255,255,${.4+rand(i)*.6})`;c.fillRect(7+rand(i*2)*50,7+rand(i*3)*24,1,1);}
  for(let x=6;x<58;x++){const h=12+Math.sin(x*.21)*6+Math.sin(x*.07+1)*4,top=16+Math.sin(x*.13)*5;const a=c.createLinearGradient(0,top,0,top+h);a.addColorStop(0,'rgba(120,255,170,0)');a.addColorStop(.5,x%9<5?'rgba(110,255,170,.75)':'rgba(170,120,255,.6)');a.addColorStop(1,'rgba(120,255,170,0)');c.fillStyle=a;c.fillRect(x,top,1,h);}
  c.fillStyle='#e8f2ff';c.fillRect(6,50,52,8);c.fillStyle='rgba(255,255,255,.15)';c.fillRect(10,8,3,40);c.fillStyle=p.trim;c.fillRect(31,6,2,52);});
 const door=(accent:string,label:string)=>bake(T,T,c=>{c.fillStyle='#5b6470';c.fillRect(0,0,T,T);noise(c,T,T,.06,7);c.fillStyle='#3d444e';c.fillRect(0,0,T,4);c.fillRect(0,60,T,4);c.fillRect(31,4,2,56);
  for(let i=-2;i<10;i++){c.fillStyle=i%2?'#1b1d22':accent;c.beginPath();c.moveTo(i*8,64);c.lineTo(i*8+8,64);c.lineTo(i*8+18,52);c.lineTo(i*8+10,52);c.closePath();c.fill();}
  c.fillStyle=accent;c.fillRect(10,14,44,3);c.fillStyle='#14181f';c.fillRect(22,24,20,12);c.fillStyle=accent;c.font='bold 8px Arial';c.textAlign='center';c.fillText(label,32,33);});
 return {metal,ice,concrete,window,door:door('#f2a33a','ШЛЮЗ'),blue:door('#3a8dff','СИН'),red:door('#ff3a3a','КРС')};
}
function flatTextures(p:Palette,theme:Theme){
 const floor=bake(T,T,c=>{c.fillStyle=p.floor;c.fillRect(0,0,T,T);noise(c,T,T,.07,2);c.fillStyle='rgba(0,0,0,.35)';for(let i=0;i<T;i+=8){c.fillRect(i,0,1,T);c.fillRect(0,i,T,1);}c.fillStyle='rgba(255,255,255,.08)';for(let i=1;i<T;i+=8){c.fillRect(i,0,1,T);}
  if(theme==='core'){c.fillStyle='rgba(150,200,255,.18)';c.fillRect(0,0,T,T);}});
 const ceiling=bake(T,T,c=>{c.fillStyle=p.ceiling;c.fillRect(0,0,T,T);noise(c,T,T,.05,5);c.fillStyle='rgba(0,0,0,.4)';c.fillRect(0,0,T,2);c.fillRect(0,0,2,T);c.fillStyle='#11161d';c.fillRect(14,27,36,10);c.fillStyle=p.lamp;c.fillRect(16,29,32,6);c.fillStyle='rgba(255,255,255,.75)';c.fillRect(17,31,30,2);});
 const exit=bake(T,T,c=>{c.fillStyle='#10301f';c.fillRect(0,0,T,T);c.strokeStyle='#5dff9a';c.lineWidth=3;c.strokeRect(4,4,56,56);c.fillStyle='#5dff9a';for(const y of [14,30,46]){c.beginPath();c.moveTo(20,y+8);c.lineTo(32,y);c.lineTo(44,y+8);c.lineTo(38,y+8);c.lineTo(32,y+4);c.lineTo(26,y+8);c.closePath();c.fill();}});
 return {floor,ceiling,exit};
}

// ——— Спрайты врагов: кадры ходьбы, атаки, боли и останков рисуются один раз. ———
type Frames={walk:Tex[];attack:Tex;pain:Tex;dead:Tex};
function tint(draw:(c:CanvasRenderingContext2D)=>void,size:number,pain=false){return bake(size,size,c=>{draw(c);if(pain){c.globalCompositeOperation='source-atop';c.fillStyle='rgba(255,255,255,.55)';c.fillRect(0,0,size,size);c.globalCompositeOperation='source-over';}});}
function crawler(c:CanvasRenderingContext2D,mode:'a'|'b'|'attack'|'dead'){
 if(mode==='dead'){c.fillStyle='#9fc3df';c.beginPath();c.ellipse(32,58,22,5,0,0,Math.PI*2);c.fill();c.fillStyle='#e6f4ff';for(let i=0;i<6;i++){c.beginPath();const x=14+i*7;c.moveTo(x,58);c.lineTo(x+3,46+rand(i)*6);c.lineTo(x+6,58);c.fill();}return;}
 c.strokeStyle='#8fb3cf';c.lineWidth=5;c.lineCap='round';const s=mode==='b'?4:-4;
 for(const [x,dx] of [[16,-6+s],[24,-3-s],[40,3+s],[48,6-s]]){c.beginPath();c.moveTo(x,42);c.lineTo(x+dx,52);c.lineTo(x+dx*1.4,62);c.stroke();}
 const g=c.createRadialGradient(32,36,2,32,40,22);g.addColorStop(0,'#f4fbff');g.addColorStop(1,'#8fb6d6');c.fillStyle=g;c.beginPath();c.ellipse(32,42,19,12,0,0,Math.PI*2);c.fill();
 c.fillStyle='#d8f0ff';for(let i=0;i<5;i++){c.beginPath();const x=18+i*7;c.moveTo(x,34);c.lineTo(x+3,22+rand(i+2)*6);c.lineTo(x+6,34);c.fill();}
 c.fillStyle='#c9e2f5';c.beginPath();c.ellipse(32,36,10,9,0,0,Math.PI*2);c.fill();
 if(mode==='attack'){c.strokeStyle='#e8f6ff';c.lineWidth=4;c.beginPath();c.moveTo(14,40);c.lineTo(6,22);c.moveTo(50,40);c.lineTo(58,22);c.stroke();c.fillStyle='#0b1a33';c.beginPath();c.ellipse(32,40,6,5,0,0,Math.PI*2);c.fill();c.fillStyle='#fff';for(let i=0;i<4;i++)c.fillRect(27+i*3,36,1,3);}
 else{c.fillStyle='#24405e';c.fillRect(27,40,10,2);}
 glow(c,27,33,5,'rgba(110,255,255,.9)');glow(c,37,33,5,'rgba(110,255,255,.9)');c.fillStyle='#e0ffff';c.fillRect(26,32,2,2);c.fillRect(36,32,2,2);
}
function drone(c:CanvasRenderingContext2D,mode:'a'|'b'|'attack'|'dead'){
 if(mode==='dead'){c.fillStyle='#3b3f46';c.beginPath();c.moveTo(12,62);c.lineTo(22,48);c.lineTo(36,52);c.lineTo(52,46);c.lineTo(56,62);c.fill();c.fillStyle='#ff7a2f';c.fillRect(28,54,6,3);glow(c,31,52,10,'rgba(255,140,60,.6)');return;}
 c.fillStyle='#2b2f36';const r=mode==='b'?10:14;c.beginPath();c.ellipse(10,16,r,3,0,0,Math.PI*2);c.ellipse(54,16,r,3,0,0,Math.PI*2);c.fill();c.fillStyle='#5a616b';c.fillRect(8,16,6,10);c.fillRect(50,16,6,10);
 const g=c.createRadialGradient(26,22,2,32,30,18);g.addColorStop(0,'#c9ced6');g.addColorStop(1,'#5c636e');c.fillStyle=g;c.beginPath();c.arc(32,30,17,0,Math.PI*2);c.fill();
 c.fillStyle='#ff8a3d';c.fillRect(15,30,34,4);c.fillStyle='#1b1e24';c.beginPath();c.arc(32,30,8,0,Math.PI*2);c.fill();
 glow(c,32,30,mode==='attack'?18:10,mode==='attack'?'rgba(255,80,60,1)':'rgba(255,60,40,.85)');c.fillStyle=mode==='attack'?'#fff':'#ff5040';c.beginPath();c.arc(32,30,mode==='attack'?4:3,0,Math.PI*2);c.fill();
 glow(c,32,50,8,'rgba(255,170,80,.7)');c.fillStyle='#444a53';c.fillRect(30,44,4,4);
}
function brute(c:CanvasRenderingContext2D,mode:'a'|'b'|'attack'|'dead'){
 if(mode==='dead'){c.fillStyle='#6f9fd0';for(let i=0;i<7;i++){c.fillRect(8+i*7,48+rand(i)*8,8,16);}glow(c,32,56,10,'rgba(255,140,50,.6)');return;}
 const s=mode==='b'?3:0;c.fillStyle='#3d5f8c';c.fillRect(20-s,44,9,20);c.fillRect(36+s,44,9,20);
 const g=c.createLinearGradient(0,14,0,48);g.addColorStop(0,'#a8d4ff');g.addColorStop(1,'#4a74a8');c.fillStyle=g;c.beginPath();c.moveTo(12,18);c.lineTo(52,18);c.lineTo(46,48);c.lineTo(18,48);c.closePath();c.fill();
 c.fillStyle='#d8eeff';c.beginPath();c.moveTo(12,18);c.lineTo(20,8);c.lineTo(26,18);c.moveTo(38,18);c.lineTo(46,6);c.lineTo(52,18);c.fill();
 c.fillStyle='#86b4e4';c.fillRect(25,6,14,12);c.fillStyle='#ffb050';c.fillRect(27,11,10,2);
 c.strokeStyle='#ff9a3a';c.lineWidth=2;c.beginPath();c.moveTo(32,22);c.lineTo(28,30);c.lineTo(35,34);c.lineTo(30,42);c.stroke();glow(c,32,32,9,'rgba(255,150,60,.55)');
 c.fillStyle='#5f8cc4';if(mode==='attack'){c.fillRect(4,16,9,18);c.fillRect(51,16,9,18);glow(c,8,14,10,'rgba(160,230,255,.9)');glow(c,56,14,10,'rgba(160,230,255,.9)');}else{c.fillRect(5,20,9,26);c.fillRect(50,20,9,26);}
}
function boss(c:CanvasRenderingContext2D,mode:'a'|'b'|'attack'|'dead'){
 const S=128;if(mode==='dead'){c.fillStyle='#8f7ad8';for(let i=0;i<14;i++){const x=10+i*8,h=14+rand(i)*26;c.beginPath();c.moveTo(x,S);c.lineTo(x+5,S-h);c.lineTo(x+10,S);c.fill();}glow(c,64,118,26,'rgba(200,160,255,.5)');return;}
 const pulse=mode==='b'?1.15:mode==='attack'?1.4:1;
 c.fillStyle='#3a2f7a';c.fillRect(40,92,16,36);c.fillRect(72,92,16,36);
 const g=c.createLinearGradient(0,20,0,100);g.addColorStop(0,'#d7c8ff');g.addColorStop(1,'#5a4cb0');c.fillStyle=g;
 c.beginPath();c.moveTo(64,10);c.lineTo(100,36);c.lineTo(96,96);c.lineTo(64,108);c.lineTo(32,96);c.lineTo(28,36);c.closePath();c.fill();
 c.fillStyle='#efe8ff';for(const [x,h] of [[44,30],[56,40],[64,46],[72,40],[84,30]]){c.beginPath();c.moveTo(x-5,26);c.lineTo(x,26-h*.6);c.lineTo(x+5,26);c.fill();}
 c.fillStyle='#8a78e0';const arm=mode==='attack'?-14:0;c.beginPath();c.moveTo(28,40);c.lineTo(6,70+arm);c.lineTo(14,76+arm);c.lineTo(34,56);c.fill();c.beginPath();c.moveTo(100,40);c.lineTo(122,70+arm);c.lineTo(114,76+arm);c.lineTo(94,56);c.fill();
 glow(c,64,62,24*pulse,'rgba(120,255,255,.9)');c.fillStyle='#e8ffff';c.beginPath();c.arc(64,62,7*pulse,0,Math.PI*2);c.fill();
 glow(c,52,38,6,'rgba(255,120,220,1)');glow(c,76,38,6,'rgba(255,120,220,1)');
}
const PAINTERS:Record<EnemyKind,(c:CanvasRenderingContext2D,m:'a'|'b'|'attack'|'dead')=>void>={crawler,drone,brute,boss};
function enemyFrames(kind:EnemyKind):Frames{const s=kind==='boss'?128:64,p=PAINTERS[kind];return {walk:[tint(c=>p(c,'a'),s),tint(c=>p(c,'b'),s)],attack:tint(c=>p(c,'attack'),s),pain:tint(c=>p(c,'a'),s,true),dead:tint(c=>p(c,'dead'),s)};}
function itemSprite(kind:ItemKind):Tex{return bake(64,64,c=>{
 const base=()=>{c.fillStyle='rgba(0,0,0,.35)';c.beginPath();c.ellipse(32,61,18,3,0,0,Math.PI*2);c.fill();};base();
 if(kind==='health'){c.fillStyle='#e6f2ff';c.fillRect(27,38,10,4);c.fillStyle='#3aa0ff';c.fillRect(26,42,12,18);glow(c,32,50,12,'rgba(80,170,255,.6)');c.fillStyle='rgba(255,255,255,.6)';c.fillRect(28,44,2,12);}
 if(kind==='medkit'){c.fillStyle='#eef1f4';c.fillRect(14,38,36,22);c.fillStyle='#d8dde2';c.fillRect(14,38,36,4);c.fillStyle='#e0303a';c.fillRect(29,42,6,15);c.fillRect(24,47,16,5);}
 if(kind==='armor'){c.fillStyle='#2f6f8a';c.beginPath();c.moveTo(18,30);c.lineTo(26,26);c.lineTo(32,32);c.lineTo(38,26);c.lineTo(46,30);c.lineTo(44,60);c.lineTo(20,60);c.closePath();c.fill();c.fillStyle='#7fe0ff';c.fillRect(22,42,20,3);glow(c,32,44,14,'rgba(120,230,255,.35)');}
 if(kind==='shells'){c.fillStyle='#8a2a24';c.fillRect(18,44,28,16);c.fillStyle='#ffcf6b';for(let i=0;i<5;i++){c.fillStyle='#c8342c';c.fillRect(20+i*5,36,4,10);c.fillStyle='#e0b040';c.fillRect(20+i*5,44,4,3);}}
 if(kind==='cells'){c.fillStyle='#24303c';c.fillRect(22,36,20,24);c.fillStyle='#5ff';c.fillRect(25,40,14,16);glow(c,32,48,16,'rgba(90,255,255,.7)');c.fillStyle='#9aa4ae';c.fillRect(28,32,8,4);}
 if(kind==='shotgun'){c.fillStyle='#6b4a2a';c.fillRect(8,48,18,7);c.fillStyle='#3a3f46';c.fillRect(22,46,36,5);c.fillRect(22,52,30,3);c.fillStyle='#8a6a42';c.fillRect(34,52,12,5);}
 if(kind==='rifle'){c.fillStyle='#2c3440';c.fillRect(8,46,48,8);c.fillRect(14,54,8,8);c.fillStyle='#5ff';for(let i=0;i<4;i++)c.fillRect(28+i*6,44,3,12);glow(c,40,50,14,'rgba(90,255,255,.5)');}
 if(kind==='blue'||kind==='red'){const col=kind==='blue'?'#3a8dff':'#ff3a3a';glow(c,32,46,18,kind==='blue'?'rgba(60,140,255,.7)':'rgba(255,60,60,.7)');c.fillStyle=col;c.fillRect(20,36,24,18);c.fillStyle='#fff';c.fillRect(23,39,9,2);c.fillRect(23,43,14,1);c.fillStyle='#ffd36b';c.fillRect(35,46,6,5);}
});}

export class Renderer {
 canvas:HTMLCanvasElement;world:World;ctx:CanvasRenderingContext2D;low:HTMLCanvasElement;lctx:CanvasRenderingContext2D;
 rw=320;rh=200;width=1;height=1;ratio=1;showMap=false;clock=0;
 private image!:ImageData;private buf!:Uint32Array;private zbuf!:Float32Array;private theme:Theme|''='';private pal=PALETTES.airlock;
 private walls!:ReturnType<typeof wallTextures>;private flats!:ReturnType<typeof flatTextures>;
 private enemies=new Map<EnemyKind,Frames>();private items=new Map<ItemKind,Tex>();private fx!:{bolt:Tex;shard:Tex;spark:Tex;frost:Tex;beacon:Tex};
 constructor(target:HTMLCanvasElement,world:World){
  const ctx=target.getContext('2d',{alpha:false});if(!ctx)throw new Error('Браузер не поддерживает Canvas 2D.');
  this.canvas=target;this.world=world;this.ctx=ctx;this.low=canvas(320,200);this.lctx=this.low.getContext('2d')!;
  for(const k of ['crawler','drone','brute','boss'] as EnemyKind[])this.enemies.set(k,enemyFrames(k));
  for(const k of ['health','medkit','armor','shells','cells','shotgun','rifle','blue','red'] as ItemKind[])this.items.set(k,itemSprite(k));
  this.fx={bolt:bake(32,32,c=>{glow(c,16,16,16,'rgba(255,150,60,1)');c.fillStyle='#fff3c0';c.beginPath();c.arc(16,16,4,0,Math.PI*2);c.fill();}),
   shard:bake(32,32,c=>{glow(c,16,16,15,'rgba(120,220,255,.9)');c.fillStyle='#eaffff';c.beginPath();c.moveTo(16,4);c.lineTo(22,16);c.lineTo(16,28);c.lineTo(10,16);c.closePath();c.fill();}),
   spark:bake(16,16,c=>{glow(c,8,8,8,'rgba(255,230,160,1)');c.fillStyle='#fff';c.fillRect(7,7,2,2);}),
   frost:bake(32,32,c=>{glow(c,16,16,16,'rgba(170,230,255,.9)');c.fillStyle='#fff';for(let i=0;i<6;i++){const a=i*Math.PI/3;c.fillRect(16+Math.cos(a)*8,16+Math.sin(a)*8,2,2);}}),
   beacon:bake(32,128,c=>{const g=c.createLinearGradient(0,0,32,0);g.addColorStop(0,'rgba(90,255,150,0)');g.addColorStop(.5,'rgba(120,255,170,.6)');g.addColorStop(1,'rgba(90,255,150,0)');c.fillStyle=g;c.fillRect(0,0,32,128);})};
  this.resize();
 }
 resize(){
  const r=this.canvas.getBoundingClientRect(),w=Math.max(200,r.width),h=Math.max(150,r.height);this.ratio=Math.min(2,window.devicePixelRatio||1);
  this.width=Math.round(w*this.ratio);this.height=Math.round(h*this.ratio);this.canvas.width=this.width;this.canvas.height=this.height;
  const scale=Math.max(w,h)/(Math.max(w,h)>1000?500:430);this.rw=Math.max(200,Math.round(w/scale));this.rh=Math.max(150,Math.round(h/scale));
  this.low.width=this.rw;this.low.height=this.rh;this.image=this.lctx.createImageData(this.rw,this.rh);this.buf=new Uint32Array(this.image.data.buffer);this.zbuf=new Float32Array(this.rw);
 }
 private prepare(){const t=this.world.level.theme;if(t===this.theme)return;this.theme=t;this.pal=PALETTES[t];this.walls=wallTextures(this.pal,t);this.flats=flatTextures(this.pal,t);}
 private wallTex(t:number){const w=this.walls;return t===ICE?w.ice:t===CONCRETE?w.concrete:t===WINDOW?w.window:t===DOOR?w.door:t===BLUE_DOOR?w.blue:t===RED_DOOR?w.red:this.world.level.theme==='lab'?w.concrete:this.world.level.theme==='core'?w.ice:w.metal;}

 draw(dt:number){
  this.prepare();this.clock+=dt;
  const W=this.rw,H=this.rh,buf=this.buf,z=this.zbuf,world=this.world,p=world.player,level=world.level,tiles=world.tiles,mw=level.w,seen=world.seen;
  const [fr,fg,fb]=this.pal.fog,light=this.pal.light*(1+world.muzzle*5),pl=Math.min(.78,Math.max(.5,.37*W/H)),proj=W/(2*pl);
  const bob=Math.sin(p.bob)*p.moving*.025,camZ=.5+bob,horizon=Math.floor(H/2+(world.shake*(Math.random()-.5)*6));
  const dirX=Math.cos(p.angle),dirY=Math.sin(p.angle),plX=-dirY*pl,plY=dirX*pl;
  const shade=(c:number,d:number)=>{let f=light/(1+.028*d*d);if(f>1)f=1;const g=1-f;return 0xff000000|(((c>>16&255)*f+fb*g)<<16)|(((c>>8&255)*f+fg*g)<<8)|((c&255)*f+fr*g);};
  // Пол и потолок построчно (floor casting).
  const fl=this.flats.floor.data,ce=this.flats.ceiling.data,ex=this.flats.exit.data;
  for(let y=0;y<H;y++){
   const floor=y>horizon,dy=floor?y-horizon:horizon-y;if(dy===0){for(let x=0;x<W;x++)buf[y*W+x]=0xff000000|(fb<<16)|(fg<<8)|fr;continue;}
   const rowDist=(floor?camZ:1-camZ)*proj/dy,sx=rowDist*2*plX/W,sy=rowDist*2*plY/W;let fx=p.x+rowDist*(dirX-plX),fy=p.y+rowDist*(dirY-plY);
   const row=y*W;
   for(let x=0;x<W;x++){
    const cx=fx|0,cy=fy|0,tx=((fx-cx)*T)&63,ty=((fy-cy)*T)&63;let c:number;
    if(floor){const t=cx>=0&&cy>=0&&cx<mw&&cy<level.h?tiles[cy*mw+cx]:0;c=(t===EXIT?ex:fl)[ty*T+tx];}else c=ce[ty*T+tx];
    buf[row+x]=shade(c,rowDist);fx+=sx;fy+=sy;
   }
  }
  // Стены и двери по столбцам (DDA).
  for(let x=0;x<W;x++){
   const cam=2*x/W-1,rx=dirX+plX*cam,ry=dirY+plY*cam;let mx=p.x|0,my=p.y|0;
   const ddx=Math.abs(1/(rx||1e-9)),ddy=Math.abs(1/(ry||1e-9)),stx=rx<0?-1:1,sty=ry<0?-1:1;
   let sdx=(rx<0?p.x-mx:mx+1-p.x)*ddx,sdy=(ry<0?p.y-my:my+1-p.y)*ddy,side=0,perp=40,tex:Tex|null=null,u=0;
   for(let n=0;n<64;n++){
    if(sdx<sdy){sdx+=ddx;mx+=stx;side=0;}else{sdy+=ddy;my+=sty;side=1;}
    if(mx<0||my<0||mx>=mw||my>=level.h)break;const t=tiles[my*mw+mx];seen[my*mw+mx]=1;if(t===FLOOR||t===EXIT)continue;
    if(t>=DOOR&&t<=RED_DOOR){
     // Дверь — плоскость посередине клетки, сдвигается вбок по мере открытия.
     const i=my*mw+mx,open=world.doorOpen(i),across=tiles[i-1]>=WALL&&tiles[i-1]<=WINDOW&&tiles[i+1]>=WALL&&tiles[i+1]<=WINDOW;
     let d:number,hit:number;
     if(across){d=(my+.5-p.y)/ry;hit=p.x+d*rx;if((hit|0)!==mx||d<=0)continue;hit-=mx;}else{d=(mx+.5-p.x)/rx;hit=p.y+d*ry;if((hit|0)!==my||d<=0)continue;hit-=my;}
     if(hit<open)continue;perp=d;tex=this.wallTex(t);u=hit-open;side=across?1:0;break;
    }
    perp=side===0?sdx-ddx:sdy-ddy;tex=this.wallTex(t);u=side===0?p.y+perp*ry:p.x+perp*rx;u-=Math.floor(u);if(side===0&&rx>0||side===1&&ry<0)u=1-u;break;
   }
   z[x]=perp;if(!tex)continue;
   const top=horizon-(1-camZ)*proj/perp,bottom=horizon+camZ*proj/perp,y0=Math.max(0,Math.ceil(top)),y1=Math.min(H,Math.ceil(bottom)),step=T/(bottom-top),tx=(u*T)&63;
   const d=side?perp*1.25:perp,data=tex.data;let ty=(y0-top)*step;
   for(let y=y0;y<y1;y++){buf[y*W+x]=shade(data[(ty&63)*T+tx],d);ty+=step;}
  }
  // Спрайты от дальних к ближним.
  type S={x:number;y:number;tex:Tex;w:number;h:number;lift:number;bright:boolean;blend:boolean};const list:S[]=[];
  for(const e of world.enemies){const fr=this.enemies.get(e.kind)!,big=e.kind==='boss';
   const tex=e.state==='dead'?fr.dead:e.pain>0?fr.pain:e.state==='windup'?fr.attack:fr.walk[Math.floor(e.anim*(e.state==='idle'?1.5:6))%2];
   const size=big?2.1:e.kind==='brute'?1.25:e.kind==='drone'?.8:.85;list.push({x:e.x,y:e.y,tex,w:size,h:size,lift:e.kind==='drone'&&e.state!=='dead'?.35+Math.sin(e.anim*3)*.05:0,bright:false,blend:false});}
  for(const it of world.items)if(!it.taken)list.push({x:it.x,y:it.y,tex:this.items.get(it.kind)!,w:.55,h:.55,lift:Math.sin(this.clock*3+it.id)*.02,bright:it.kind==='blue'||it.kind==='red',blend:false});
  for(const s of world.shots)list.push({x:s.x,y:s.y,tex:s.kind==='bolt'?this.fx.bolt:this.fx.shard,w:.24,h:.24,lift:.38,bright:true,blend:true});
  for(const e of world.effects)list.push({x:e.x,y:e.y,tex:e.kind==='frost'?this.fx.frost:this.fx.spark,w:e.kind==='frost'?.35:.18,h:e.kind==='frost'?.35:.18,lift:.4,bright:true,blend:true});
  if(!world.boss){const i=tiles.indexOf(EXIT);list.push({x:i%mw+.5,y:Math.floor(i/mw)+.5,tex:this.fx.beacon,w:.6,h:1,lift:0,bright:true,blend:true});}
  const inv=1/(plX*dirY-dirX*plY);
  const placed=list.map(s=>{const rx=s.x-p.x,ry=s.y-p.y;return {s,tx:inv*(dirY*rx-dirX*ry),ty:inv*(-plY*rx+plX*ry)};}).filter(o=>o.ty>(o.s.blend?.9:.1)).sort((a,b)=>b.ty-a.ty);
  for(const {s,tx,ty} of placed){
   const cx=W/2*(1+tx/ty),sw=proj*s.w/ty,sh=proj*s.h/ty,bottom=horizon+(camZ-s.lift)*proj/ty,top=bottom-sh;
   const x0=Math.max(0,Math.floor(cx-sw/2)),x1=Math.min(W,Math.ceil(cx+sw/2)),y0=Math.max(0,Math.floor(top)),y1=Math.min(H,Math.ceil(bottom));
   const tw=s.tex.w,th=s.tex.h,data=s.tex.data;
   for(let x=x0;x<x1;x++){if(ty>=z[x])continue;const u=Math.floor((x-(cx-sw/2))/sw*tw);if(u<0||u>=tw)continue;
    for(let y=y0;y<y1;y++){const v=Math.floor((y-top)/sh*th);if(v<0||v>=th)continue;const c=data[v*tw+u],a=c>>>24;if(a<40)continue;const o=y*W+x;
     if(s.blend){const d=buf[o],k=a/255*.55;buf[o]=0xff000000|(Math.min(255,(d>>16&255)+(c>>16&255)*k)<<16)|(Math.min(255,(d>>8&255)+(c>>8&255)*k)<<8)|Math.min(255,(d&255)+(c&255)*k);}
     else if(a>140)buf[o]=s.bright?c|0xff000000:shade(c,ty);}}
  }
  this.lctx.putImageData(this.image,0,0);
  const ctx=this.ctx;ctx.imageSmoothingEnabled=false;ctx.drawImage(this.low,0,0,this.width,this.height);
  this.weapon();
  if(this.showMap)this.map();
 }
 /** Оружие в руках: рисуется поверх кадра в полном разрешении. */
 private weapon(){
  const ctx=this.ctx,W=this.width,H=this.height,p=this.world.player,s=Math.min(W,H*1.4)/1080;if(this.world.phase==='dead'||this.world.phase==='title')return;
  const bx=W*.6+Math.cos(p.bob*.5)*p.moving*14*s,by=H+Math.abs(Math.sin(p.bob*.5))*p.moving*12*s+p.kick*42*s;
  ctx.save();ctx.translate(bx,by);ctx.scale(s,s);
  const lin=(x0:number,y0:number,x1:number,y1:number,stops:[number,string][])=>{const g=ctx.createLinearGradient(x0,y0,x1,y1);for(const [o,c] of stops)g.addColorStop(o,c);return g;};
  const poly=(pts:number[],fill:string|CanvasGradient)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);ctx.closePath();ctx.fill();};
  const flash=(x:number,y:number,r:number,color:string)=>{if(this.world.muzzle<=0)return;ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'#fff');g.addColorStop(.25,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
   ctx.fillStyle='#fff8e0';for(let i=0;i<6;i++){const a=i*Math.PI/3+this.clock*7;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*r*.7,y+Math.sin(a)*r*.7);ctx.lineTo(x+Math.cos(a+.25)*r*.2,y+Math.sin(a+.25)*r*.2);ctx.fill();}ctx.restore();};
  // Рукав куртки станции и перчатка.
  const sleeve=lin(-120,0,120,0,[[0,'#7a3a12'],[.5,'#d9661f'],[1,'#7a3a12']]);
  if(p.weapon===0){
   poly([-130,0,-80,-120,60,-120,110,0],sleeve);poly([-80,-120,-70,-150,52,-150,60,-120],'#3a3f47');
   poly([-62,-150,-40,-240,30,-240,46,-150],lin(-60,0,46,0,[[0,'#1a1d22'],[.5,'#3a3f47'],[1,'#16191d']]));
   poly([-40,-240,-30,-330,22,-330,30,-240],lin(-40,0,30,0,[[0,'#22262c'],[.45,'#5a616c'],[1,'#1c2026']]));
   ctx.fillStyle='#0c0e11';ctx.fillRect(-8,-336,12,10);ctx.fillStyle='#f2a33a';ctx.fillRect(-36,-290,62,5);ctx.fillStyle='#9aa3ad';ctx.fillRect(-26,-325,6,8);ctx.fillRect(12,-325,6,8);
   flash(-2,-345,110,'rgba(255,190,90,.9)');
  }else if(p.weapon===1){
   poly([-150,0,-100,-110,90,-110,140,0],sleeve);
   poly([-90,-110,-70,-200,70,-200,96,-110],lin(-90,0,96,0,[[0,'#3d2614'],[.5,'#8a5a30'],[1,'#3a2412']]));
   poly([-60,-200,-44,-300,44,-300,62,-200],lin(-60,0,62,0,[[0,'#1c2025'],[.5,'#4a515b'],[1,'#1a1d22']]));
   poly([-46,-300,-34,-380,-2,-380,-6,-300],lin(-46,0,0,0,[[0,'#202429'],[1,'#56606b']]));poly([6,-300,2,-380,34,-380,46,-300],lin(0,0,46,0,[[0,'#56606b'],[1,'#202429']]));
   ctx.fillStyle='#0a0b0d';ctx.beginPath();ctx.ellipse(-18,-380,14,6,0,0,Math.PI*2);ctx.ellipse(18,-380,14,6,0,0,Math.PI*2);ctx.fill();
   poly([-70,-230,-62,-262,62,-262,72,-230],lin(0,-262,0,-230,[[0,'#a87444'],[1,'#5c3a1c']]));
   flash(0,-392,150,'rgba(255,170,70,.95)');
  }else{
   poly([-150,0,-100,-100,90,-100,140,0],sleeve);
   poly([-96,-100,-70,-250,70,-250,100,-100],lin(-96,0,100,0,[[0,'#151a21'],[.5,'#36404d'],[1,'#121619']]));
   poly([-42,-250,-30,-360,30,-360,42,-250],lin(-42,0,42,0,[[0,'#1a1f27'],[.5,'#3c4654'],[1,'#161a20']]));
   const pulse=.55+Math.sin(this.clock*9)*.25;ctx.save();ctx.globalCompositeOperation='lighter';
   for(let i=0;i<4;i++){const y=-230+i*30,w=120-i*14;ctx.fillStyle=`rgba(90,255,255,${pulse*(1-i*.15)})`;ctx.fillRect(-w/2,y,w,8);}
   const g=ctx.createRadialGradient(0,-370,0,0,-370,40);g.addColorStop(0,`rgba(160,255,255,${pulse})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(-40,-410,80,80);ctx.restore();
   ctx.fillStyle='#0a0d12';ctx.fillRect(-10,-372,20,14);
   flash(0,-380,130,'rgba(90,255,255,.95)');
  }
  ctx.restore();
 }
 /** Карта изученных клеток (Tab). */
 private map(){
  const ctx=this.ctx,w=this.world,l=w.level,cell=Math.floor(Math.min(this.width*.7/l.w,this.height*.7/l.h)),ox=(this.width-cell*l.w)/2,oy=(this.height-cell*l.h)/2;
  ctx.fillStyle='rgba(4,10,18,.78)';ctx.fillRect(ox-cell,oy-cell,cell*(l.w+2),cell*(l.h+2));
  for(let y=0;y<l.h;y++)for(let x=0;x<l.w;x++){const i=y*l.w+x;if(!w.seen[i])continue;const t=w.tiles[i];
   ctx.fillStyle=t===FLOOR?'#1d3346':t===EXIT?'#3dff8a':t===DOOR?'#f2a33a':t===BLUE_DOOR?'#3a8dff':t===RED_DOOR?'#ff3a3a':t===WINDOW?'#7fd9ff':'#8fa8c2';ctx.fillRect(ox+x*cell,oy+y*cell,cell-1,cell-1);}
  const p=w.player;ctx.save();ctx.translate(ox+p.x*cell,oy+p.y*cell);ctx.rotate(p.angle);ctx.fillStyle='#ffd36b';ctx.beginPath();ctx.moveTo(cell*.7,0);ctx.lineTo(-cell*.45,-cell*.4);ctx.lineTo(-cell*.45,cell*.4);ctx.closePath();ctx.fill();ctx.restore();
 }
 dispose(){this.enemies.clear();this.items.clear();}
}
