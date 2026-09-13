import {BASE,ROOMS,STAIRS,floorY,clamp,lerp,roomAt} from './config.ts';
import {BEAM_HALF,BEAM_RANGE,NEAR_SIGHT,visibilityPolygon} from './visibility.ts';
import type {BaseAssets,ImageId} from './assets.ts';
import {BaseHero} from './hero.ts';
import type {BaseWorld} from './world.ts';
import type {Vec,Room,Floor} from './types.ts';
type Rect={x:number;y:number;w:number;h:number};
const furnitureRects:Rect[]=[{x:0,y:95,w:592,h:355},{x:595,y:35,w:432,h:406},{x:1034,y:45,w:502,h:426},{x:18,y:524,w:564,h:425},{x:604,y:443,w:412,h:536},{x:1042,y:463,w:494,h:516}];
const objectRects:Rect[]=[{x:0,y:100,w:385,h:388},{x:391,y:135,w:410,h:340},{x:822,y:180,w:296,h:301},{x:1130,y:137,w:406,h:350},{x:18,y:530,w:373,h:425},{x:399,y:641,w:400,h:321},{x:827,y:513,w:308,h:438},{x:1190,y:518,w:346,h:486}];
export class BaseRenderer{
 c:CanvasRenderingContext2D;hero:BaseHero;fog=document.createElement('canvas');zoom=1;camera={x:940,y:463};scale=1;width=1600;height=900;dpr=1;time=0;hover:string|null=null;
 hits:{id:string;x:number;y:number}[]=[];trimCache=new Map<string,Rect>();grit:{x:number;y:number;r:number}[]=[];
 constructor(public canvas:HTMLCanvasElement,public assets:BaseAssets){this.c=canvas.getContext('2d',{alpha:false})!;this.hero=new BaseHero(assets);let seed=47;for(let i=0;i<380;i++){seed=(seed*16807)%2147483647;const x=seed/2147483647*2220;seed=(seed*16807)%2147483647;this.grit.push({x,y:615+seed/2147483647*120,r:.5+i%3});}new ResizeObserver(()=>this.resize()).observe(canvas);this.resize();}
 resize(){const box=this.canvas.getBoundingClientRect();this.width=Math.max(1,box.width);this.height=Math.max(1,box.height);this.dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.fog.width=this.canvas.width;this.fog.height=this.canvas.height;}
 worldToScreen(p:Vec){return {x:(p.x-this.camera.x)*this.scale+this.width/2,y:(p.y-this.camera.y)*this.scale+this.height/2};}
 screenToWorld(p:Vec){return {x:(p.x-this.width/2)/this.scale+this.camera.x,y:(p.y-this.height/2)/this.scale+this.camera.y};}
 zoomBy(delta:number){this.zoom=clamp(this.zoom+delta,.8,1.8);}
 transform(c:CanvasRenderingContext2D){c.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,(this.width/2-this.camera.x*this.scale)*this.dpr,(this.height/2-this.camera.y*this.scale)*this.dpr);}
 draw(w:BaseWorld,dt:number,alpha=1){
  const c=this.c;this.time+=w.phase==='playing'?dt:0;
  const fit=this.width<700?Math.min(this.height/780,this.width/930):Math.min(this.width/1600,this.height/900);this.scale=fit*this.zoom;
  const vw=this.width/this.scale,vh=this.height/this.scale;
  const targetX=vw>=BASE.width?BASE.width/2:clamp(980+(w.player.x-750)*.65,vw/2,BASE.width-vw/2);
  const targetY=vh>=930?465:clamp(w.player.y-95,vh/2,930-vh/2);
  this.camera.x=lerp(this.camera.x,targetX,1-Math.exp(-dt*3));this.camera.y=lerp(this.camera.y,targetY,1-Math.exp(-dt*3));
  c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#10141a';c.fillRect(0,0,this.width,this.height);
  this.transform(c);this.background(c);this.house(c,w);this.yard(c);
  for(const r of ROOMS)this.roomFurnishings(c,r,w);
  for(const s of STAIRS)this.stair(c,s.a,floorY(s.from),s.b,floorY(s.to));
  for(const d of w.doors){const y=floorY(d.floor);c.save();c.translate(d.x,y);c.fillStyle='#111416';c.fillRect(-8,-215,16,65);c.fillStyle='#645947';c.fillRect(-10,-151,20,7);c.fillStyle='#9b896f';c.fillRect(-9,-151,2,151);c.fillRect(7,-151,2,151);
   if(!d.open){c.fillStyle='#332e26';c.fillRect(-7,-143,14,142);c.strokeStyle='#81745e';c.lineWidth=1;c.strokeRect(-5,-140,10,136);c.fillStyle='#dac99e';c.fillRect(-4,-73,6,3);}
   else{c.fillStyle='#5d5240';c.beginPath();c.moveTo(8,-142);c.lineTo(34,-132);c.lineTo(34,0);c.lineTo(8,0);c.closePath();c.fill();c.strokeStyle='#978571';c.stroke();}c.restore();
  }
  for(const o of w.visibleObjects()){
   c.save();if(o.searched&&['chest','wardrobe','medicine'].includes(o.kind))c.globalAlpha=.6;
   this.sprite(c,o.atlas,o.frame,o.x,floorY(o.floor)-2,o.width,o.height);c.restore();
   if(o.kind==='generator'&&w.powered)this.glow(c,o.x+30,floorY(o.floor)-53,26,'#b7d79c',.35);
  }
  if(w.dogVisible){const dog=w.dog,frame=dog.mode==='warn'?3:dog.mode==='walk'||dog.mode==='retreat'?1+Math.floor(this.time*5)%2:0;c.save();c.translate(lerp(dog.previousX,dog.x,alpha),615);c.scale(-dog.facing,1);if(dog.hit)c.filter='brightness(2)';this.sprite(c,'dog',frame,0,-2,144,96);c.restore();}
  this.shadow(c,lerp(w.player.previousX,w.player.x,alpha),lerp(w.player.previousY,w.player.y,alpha)+1,38);
  this.hero.draw(c,w.player,w.phase==='playing'?dt:0,alpha,!!w.task);
  // Clip darkness and light using the exact wall/door geometry used by visibility queries.
  this.darkness(w);
  this.transform(c);this.architectureEdges(c);this.stairRails(c);this.foreground(c);
  if(w.flashlight)this.flashlight(c,w);
  this.markers(c,w);
  if(w.task){const p=w.player,t=1-w.task.remaining/w.task.duration;c.save();c.translate(p.x,p.y-151);c.fillStyle='#0b1016dc';c.fillRect(-31,-5,62,9);c.fillStyle='#d7bd8a';c.fillRect(-29,-3,58*t,5);c.restore();}
  if(w.dogVisible&&w.dog.mode==='warn'){c.fillStyle='#db866b';c.font='bold 20px Georgia';c.textAlign='center';c.fillText('!',w.dog.x,515);}
  if(w.navigation){const n=w.navigation;c.strokeStyle='#d8c193';c.globalAlpha=.65;c.lineWidth=1;c.beginPath();c.ellipse(n.x,floorY(n.floor)+1,13,4,0,0,Math.PI*2);c.stroke();c.globalAlpha=1;}
  c.setTransform(this.dpr,0,0,this.dpr,0,0);const vignette=c.createRadialGradient(this.width*.5,this.height*.52,this.width*.16,this.width*.5,this.height*.5,this.width*.65);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#05070cb3');c.fillStyle=vignette;c.fillRect(0,0,this.width,this.height);
  if(w.player.hurt){c.fillStyle=`rgba(145,47,37,${w.player.hurt*.12})`;c.fillRect(0,0,this.width,this.height);}
 }
 texture(c:CanvasRenderingContext2D,index:number,x:number,y:number,w:number,h:number,scale=1){const pattern=c.createPattern(this.assets.tiles[index],'repeat')!;pattern.setTransform(new DOMMatrix().translate(x,y).scale(scale));c.fillStyle=pattern;c.fillRect(x,y,w,h);}
 background(c:CanvasRenderingContext2D){
  const im=this.assets.images.district,top=Math.min(-80,this.camera.y-this.height/this.scale/2);c.drawImage(im,this.camera.x*.15-310,top,BASE.width+630,800-top);c.fillStyle='#14233145';c.fillRect(-500,top,3300,1000-top);
  const earth=c.createLinearGradient(0,606,0,935);earth.addColorStop(0,'#282b29');earth.addColorStop(.25,'#181b1b');earth.addColorStop(1,'#090c10');c.fillStyle=earth;c.fillRect(-300,607,2900,420);
  for(const p of this.grit){c.fillStyle=p.r>2?'#a09b7132':'#0006';c.fillRect(p.x,p.y,p.r*5,p.r);}
  c.strokeStyle='#0d151b';c.lineWidth=4;c.beginPath();c.moveTo(90,370);c.quadraticCurveTo(660,450,1720,100);c.stroke();
 }
 house(c:CanvasRenderingContext2D,w:BaseWorld){
  const x=BASE.houseLeft,end=BASE.houseRight,roof=floorY(1)-215;
  // The right return wall, deep roof and floor lips give the cutaway its volume.
  c.save();c.beginPath();c.moveTo(end,roof);c.lineTo(end+54,roof-24);c.lineTo(end+54,629);c.lineTo(end,650);c.closePath();c.clip();this.texture(c,2,end,roof-30,58,490,.8);c.fillStyle='#090f1699';c.fillRect(end,roof-30,58,490);c.restore();
  this.texture(c,2,x-18,roof-16,18,665,.65);this.texture(c,2,end,roof-16,19,665,.65);
  c.save();c.beginPath();c.moveTo(x-42,roof-2);c.lineTo(x+112,80);c.lineTo(end-128,80);c.lineTo(end+40,roof-2);c.closePath();c.clip();this.texture(c,5,x-45,80,end-x+90,roof-75,.27);c.fillStyle='#11172255';c.fillRect(x-45,80,end-x+90,120);c.restore();
  c.strokeStyle='#11161a';c.lineWidth=10;c.beginPath();c.moveTo(x-42,roof-1);c.lineTo(end+42,roof-1);c.stroke();c.strokeStyle='#7d7e7480';c.lineWidth=2;c.stroke();
  this.texture(c,2,x+108,35,60,116,.32);c.fillStyle='#252724';c.fillRect(x+102,30,71,12);
  c.strokeStyle='#aaa38a33';c.lineWidth=1;c.beginPath();c.moveTo(x+129,80);c.lineTo(end-118,80);c.stroke();
  for(const r of ROOMS){const y=floorY(r.floor),h=215;
   this.texture(c,r.material,r.x,y-h+10,r.end-r.x,h-20,r.floor===-1?.75:.62);
   const shade=c.createLinearGradient(0,y-h,0,y);shade.addColorStop(0,'#060d1280');shade.addColorStop(.4,'transparent');shade.addColorStop(1,'#03080b90');c.fillStyle=shade;c.fillRect(r.x,y-h+10,r.end-r.x,h-20);
   if(r.window){this.window(c,r.x+(r.end-r.x)*.68,y-110,92,112);if(r.id==='hall'||r.id==='workshop')this.window(c,r.x+100,y-110,78,108);}
   this.texture(c,r.floor===-1?4:3,r.x,y-24,r.end-r.x,42,.45);c.fillStyle='#05070b33';c.fillRect(r.x,y-24,r.end-r.x,42);
   c.strokeStyle='#b1a07e55';c.lineWidth=1;c.beginPath();c.moveTo(r.x,y-24);c.lineTo(r.end,y-24);c.stroke();
   if(w.explored.has(r.id)){c.fillStyle='#d2c3a87a';c.font='9px monospace';c.textAlign='left';c.fillText(r.name.toUpperCase(),r.x+30,y-187);}
   const lx=r.x+(r.end-r.x)*.4;c.strokeStyle='#1a1b19';c.lineWidth=2;c.beginPath();c.moveTo(lx,y-204);c.lineTo(lx,y-157);c.stroke();c.fillStyle=w.powered?'#e6cb8d':'#7c7768';c.fillRect(lx-12,y-158,24,5);if(w.powered)this.glow(c,lx,y-147,128,'#ffd89a',.13);
  }
 }
 window(c:CanvasRenderingContext2D,x:number,y:number,width:number,height:number){
  c.save();c.translate(x,y);c.fillStyle='#0d1218';c.fillRect(-width/2-6,-height/2-6,width+12,height+15);const glass=c.createLinearGradient(0,-height/2,0,height/2);glass.addColorStop(0,'#77909b');glass.addColorStop(.6,'#5a6d70');glass.addColorStop(1,'#283941');c.fillStyle=glass;c.fillRect(-width/2,-height/2,width,height);
  c.strokeStyle='#bac9bf25';c.lineWidth=1;for(let i=0;i<7;i++){c.beginPath();c.moveTo(-width/2+8+i*11,-height/2+3);c.lineTo(-width/2+i*11,height/2-5);c.stroke();}
  c.fillStyle='#30332e';c.fillRect(-width/2-3,-height/2-3,width+6,4);c.fillRect(-2,-height/2,4,height);c.fillRect(-width/2,-3,width,5);c.fillRect(-width/2-8,height/2, width+17,7);c.fillStyle='#ada18b44';c.fillRect(-width/2-8,height/2,width+17,2);c.restore();
 }
 roomFurnishings(c:CanvasRenderingContext2D,r:Room,w:BaseWorld){
  if(!w.explored.has(r.id))return;const y=floorY(r.floor);
  // Permanent room furniture is remembered; searchable objects are drawn only through current sight.
  if(r.id==='hall')this.sprite(c,'furniture',0,1005,y-5,154,89);
  if(r.id==='kitchen')this.sprite(c,'furniture',5,1310,y-8,74,118);
  if(r.floor===-1){c.strokeStyle='#574f40';c.lineWidth=6;c.beginPath();c.moveTo(r.x+20,y-178);c.lineTo(r.end-16,y-178);c.lineTo(r.end-16,y-31);c.stroke();c.strokeStyle='#96938145';c.lineWidth=1;c.stroke();}
 }
 stair(c:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number){
  c.fillStyle='#0a0f13';c.beginPath();c.moveTo(x-20,y+6);c.lineTo(x2+15,y2+4);c.lineTo(x2+15,y2+21);c.lineTo(x-20,y+23);c.closePath();c.fill();
  const count=15;for(let i=0;i<count;i++){const px=x+(x2-x)*i/count,py=y+(y2-y)*(i+1)/count,run=(x2-x)/count;
   c.fillStyle=i%2?'#5c5548':'#665f50';c.fillRect(px-21,py,run+28,5);c.fillStyle='#292a28';c.fillRect(px-21,py+5,run,10);c.strokeStyle='#a59a7c77';c.lineWidth=.8;c.beginPath();c.moveTo(px-21,py);c.lineTo(px+run+7,py);c.stroke();}
 }
 architectureEdges(c:CanvasRenderingContext2D){
  for(const f of [-1,0,1] as Floor[]){const y=floorY(f),stair=STAIRS.find(s=>s.to===f),parts=stair?[[500,stair.a-22],[stair.b+22,1530]]:[[500,1530]];
   for(const [x,end] of parts){this.texture(c,f===-1?4:3,x,y+10,end-x,17,.4);c.fillStyle='#090d13bb';c.fillRect(x,y+14,end-x,12);c.fillStyle='#a59b7955';c.fillRect(x,y+10,end-x,2);}}
  c.strokeStyle='#9d968454';c.lineWidth=1;c.strokeRect(481,186,18,441);c.strokeRect(1530,186,18,441);
 }
 stairRails(c:CanvasRenderingContext2D){for(const s of STAIRS){const y=floorY(s.from),y2=floorY(s.to);c.strokeStyle='#0c1116';c.lineWidth=4;c.beginPath();c.moveTo(s.a-10,y-39);c.lineTo(s.b+8,y2-39);c.stroke();c.strokeStyle='#86827188';c.lineWidth=1;c.stroke();for(let i=0;i<4;i++){const t=i/3,x=lerp(s.a,s.b,t),yy=lerp(y,y2,t);c.strokeStyle='#4c514a';c.lineWidth=2;c.beginPath();c.moveTo(x,yy-39);c.lineTo(x,yy+7);c.stroke();}}}
 yard(c:CanvasRenderingContext2D){
  for(const side of [[90,451],[1590,2160]]){const [start,end]=side;c.strokeStyle='#2c322d';c.lineWidth=4;c.beginPath();c.moveTo(start,574);c.lineTo(end,574);c.moveTo(start,535);c.lineTo(end,535);c.stroke();for(let x=start;x<end;x+=29){c.fillStyle='#3c4138';c.fillRect(x,510+(x%7),10,99);c.fillStyle='#82836b22';c.fillRect(x,514,2,93);}}
  c.strokeStyle='#6b6c5440';c.lineWidth=1;for(let i=0;i<130;i++){const x=(i*193.37)%2220;if(x>470&&x<1580)continue;const y=620+(i%4)*5;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x-7,y-18,x+(i%3-1)*5,y-28-i%8);c.stroke();}
  c.strokeStyle='#272a2b';c.lineWidth=8;c.beginPath();c.moveTo(1760,618);c.lineTo(1760,377);c.lineTo(1804,377);c.stroke();c.fillStyle='#958263';c.fillRect(1791,374,26,5);this.glow(c,1800,385,89,'#c9a165',.1);
  c.strokeStyle='#88897520';c.lineWidth=2;for(let i=0;i<19;i++){const x=160+i*95;c.beginPath();c.moveTo(x,639);c.lineTo(x+45,637);c.stroke();}
 }
 foreground(c:CanvasRenderingContext2D){
  // Only low silhouettes at the yard edge; nothing covers an actor's torso.
  c.strokeStyle='#050a0de8';for(let i=0;i<75;i++){const x=i*31+Math.sin(i*7)*14;if(x>490&&x<1550)continue;c.lineWidth=2;c.beginPath();c.moveTo(x,671);c.quadraticCurveTo(x+5,651,x+Math.sin(i)*14,644-i%16);c.stroke();}
 }
 trim(id:ImageId,frame:number){
  const key=id+frame,cached=this.trimCache.get(key);if(cached)return cached;
  const im=this.assets.images[id],r=id==='furniture'?furnitureRects[frame]:id==='objects'?objectRects[frame]:{x:frame%3*512,y:Math.floor(frame/3)*512,w:512,h:512};
  const canvas=document.createElement('canvas');canvas.width=r.w;canvas.height=r.h;const c=canvas.getContext('2d',{willReadFrequently:true})!;c.drawImage(im,r.x,r.y,r.w,r.h,0,0,r.w,r.h);const data=c.getImageData(0,0,r.w,r.h).data;
  let l=r.w,t=r.h,rr=0,b=0;for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)if(data[(y*r.w+x)*4+3]>45){l=Math.min(l,x);t=Math.min(t,y);rr=Math.max(rr,x);b=Math.max(b,y);}
  const trim={x:r.x+l,y:r.y+t,w:rr-l+1,h:b-t+1};this.trimCache.set(key,trim);return trim;
 }
 sprite(c:CanvasRenderingContext2D,id:'furniture'|'objects'|'dog',frame:number,x:number,y:number,maxWidth:number,maxHeight:number){const r=this.trim(id,frame),scale=Math.min(maxWidth/r.w,maxHeight/r.h);c.drawImage(this.assets.images[id],r.x,r.y,r.w,r.h,x-r.w*scale/2,y-r.h*scale,r.w*scale,r.h*scale);}
 shadow(c:CanvasRenderingContext2D,x:number,y:number,r:number){c.save();c.translate(x,y);c.scale(1,.15);const g=c.createRadialGradient(0,0,1,0,0,r);g.addColorStop(0,'#000b');g.addColorStop(1,'transparent');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.restore();}
 glow(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha:number){c.save();c.globalCompositeOperation='screen';c.globalAlpha=alpha;const g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();}
 path(c:CanvasRenderingContext2D,points:Vec[]){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
 darkness(w:BaseWorld){
  const c=this.fog.getContext('2d')!;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.fog.width,this.fog.height);this.transform(c);
  c.fillStyle='#050a1040';c.fillRect(-600,280,3400,440);
  for(const room of ROOMS){c.fillStyle=w.explored.has(room.id)?'rgba(3,7,12,.78)':'rgba(3,6,10,.96)';c.fillRect(room.x,floorY(room.floor)-205,room.end-room.x,218);}
  const {origin,angle,segments}=w.sight;
  const clear=(spread:number,range:number,power:number,center=angle)=>{c.save();this.path(c,visibilityPolygon(origin,center,spread,range,segments));c.clip();c.globalCompositeOperation='destination-out';const g=c.createRadialGradient(origin.x,origin.y,8,origin.x,origin.y,range);g.addColorStop(0,`rgba(0,0,0,${power})`);g.addColorStop(.55,`rgba(0,0,0,${power*.93})`);g.addColorStop(.88,`rgba(0,0,0,${power*.55})`);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(origin.x-range,origin.y-range,range*2,range*2);c.restore();};
  clear(Math.PI,NEAR_SIGHT,.98);clear(1.02,185,.72);if(w.powered)clear(Math.PI,245,.9);if(w.flashlight)clear(BEAM_HALF,BEAM_RANGE,1);
  this.c.setTransform(1,0,0,1,0,0);this.c.drawImage(this.fog,0,0);
 }
 flashlight(c:CanvasRenderingContext2D,w:BaseWorld){
  const {origin,angle,segments}=w.sight;c.save();this.path(c,visibilityPolygon(origin,angle,BEAM_HALF,BEAM_RANGE,segments));c.clip();c.globalCompositeOperation='screen';const end={x:origin.x+Math.cos(angle)*BEAM_RANGE,y:origin.y+Math.sin(angle)*BEAM_RANGE};const g=c.createLinearGradient(origin.x,origin.y,end.x,end.y);g.addColorStop(0,'#f3e2ac24');g.addColorStop(.55,'#e6d39c12');g.addColorStop(1,'#e6d39c00');c.fillStyle=g;c.fillRect(origin.x-500,origin.y-500,1000,1000);c.restore();
  c.save();c.translate(origin.x,origin.y);c.rotate(angle);c.fillStyle='#323735';c.fillRect(-6,-3,14,6);c.fillStyle='#f2e1b5';c.fillRect(7,-3,3,6);c.restore();
  this.glow(c,origin.x,origin.y,14,'#fff3c4',.22);
 }
 markers(c:CanvasRenderingContext2D,w:BaseWorld){
  this.hits=[];const nearest=w.nearby()?.id;
  const items=[...w.visibleObjects().map(o=>({id:o.id,x:o.x,y:floorY(o.floor)-o.height-22,done:o.searched&&['chest','medicine','wardrobe'].includes(o.kind),symbol:o.kind==='bed'?'☾':o.kind==='workbench'?'⚒':o.kind==='generator'?'ϟ':o.kind==='sink'||o.kind==='barrel'?'≈':'+'})),...w.visibleDoors().map(d=>({id:d.id,x:d.x,y:floorY(d.floor)-168,done:false,symbol:d.open?'↔':'⌑'}))];
  for(const item of items){
   const active=item.id===nearest||item.id===this.hover;c.save();c.translate(item.x,item.y);c.fillStyle=active?'#d8c59e':'#101821d9';c.strokeStyle=item.done?'#7e83796b':active?'#f3e5c9':'#acb4a5';c.lineWidth=active?1.8:1;c.beginPath();c.arc(0,0,active?15:12,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=active?'#263035':item.done?'#8a9285':'#e0dccd';c.font='16px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText(item.done?'✓':item.symbol,0,-1);c.restore();this.hits.push({id:item.id,x:item.x,y:item.y});
   if(active){const name=w.description(item.id)!.title;c.save();c.font='11px Arial';c.textAlign='center';const width=c.measureText(name).width;c.fillStyle='#0a1015e8';c.fillRect(item.x-width/2-9,item.y-40,width+18,20);c.fillStyle='#eee8d6';c.fillText(name,item.x,item.y-26);c.restore();}
  }
  for(const stair of STAIRS){for(const side of [0,1]){const x=side?stair.b:stair.a,y=floorY(side?stair.to:stair.from);if(!w.visible({x,y:y-55}))continue;c.save();c.fillStyle='#c9c3ab';c.font='15px Arial';c.textAlign='center';c.fillText(side?'↓':'↑',x,y-12);c.restore();}}
 }
 hitAt(point:Vec){return this.hits.find(h=>Math.hypot(h.x-point.x,h.y-point.y)<24)?.id||null;}
 floorAtScreen(point:Vec):Floor{return point.x>=500&&point.x<=1530?([-1,0,1] as Floor[]).reduce((best,f)=>Math.abs(point.y-floorY(f))<Math.abs(point.y-floorY(best))?f:best,0):0;}
}
